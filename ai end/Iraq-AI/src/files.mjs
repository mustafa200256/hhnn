// معالجة المرفقات: صور (للتحليل البصري) ومستندات (استخراج نص).
// المدعوم فعلاً: JPG/PNG/WEBP، PDF (يحتاج حزمة pdf-parse الاختيارية)، DOCX، TXT وما شابه من الملفات النصية.
// غير المدعوم: DOC القديم — نرفضه برسالة واضحة بدل ادعاء قراءته.
import { inflateRawSync } from 'node:zlib';

export class UserFacingError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export const LIMITS = {
  maxFiles: 5,
  maxImageBytes: 8 * 1024 * 1024,
  maxDocBytes: 10 * 1024 * 1024,
  maxTextChars: 60_000,
};

const TEXT_EXT = new Set([
  'txt', 'md', 'csv', 'tsv', 'json', 'xml', 'html', 'htm', 'css', 'js', 'mjs', 'cjs', 'ts', 'tsx', 'jsx',
  'py', 'java', 'c', 'cpp', 'h', 'hpp', 'cs', 'go', 'rs', 'php', 'rb', 'sql', 'yml', 'yaml', 'ini', 'toml',
  'log', 'sh', 'bat', 'ps1', 'tex', 'srt', 'env.example',
]);

const extOf = (name) => (String(name).toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? '');

function sniffImage(buf) {
  if (buf.length > 12 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.length > 8 && buf.readUInt32BE(0) === 0x89504e47) return 'image/png';
  if (buf.length > 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  return null;
}

// ---------- DOCX (قراءة ZIP يدوياً بدون مكتبات) ----------

function readZipEntry(buf, wanted) {
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65_600); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('not a zip');
  const count = buf.readUInt16LE(eocd + 10);
  let off = buf.readUInt32LE(eocd + 16);
  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(off) !== 0x02014b50) break;
    const method = buf.readUInt16LE(off + 10);
    const csize = buf.readUInt32LE(off + 20);
    const nlen = buf.readUInt16LE(off + 28);
    const elen = buf.readUInt16LE(off + 30);
    const clen = buf.readUInt16LE(off + 32);
    const lho = buf.readUInt32LE(off + 42);
    const name = buf.toString('utf8', off + 46, off + 46 + nlen);
    if (name === wanted) {
      const start = lho + 30 + buf.readUInt16LE(lho + 26) + buf.readUInt16LE(lho + 28);
      const data = buf.subarray(start, start + csize);
      if (method === 0) return data;
      if (method === 8) return inflateRawSync(data, { maxOutputLength: 40 * 1024 * 1024 });
      throw new Error('unsupported zip method');
    }
    off += 46 + nlen + elen + clen;
  }
  return null;
}

const XML_ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const decodeXml = (s) =>
  s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_, e) => {
    if (e[0] === '#') {
      const code = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : '';
    }
    return XML_ENTITIES[e.toLowerCase()] ?? '';
  });

export function extractDocx(buf) {
  const xml = readZipEntry(buf, 'word/document.xml');
  if (!xml) throw new Error('document.xml missing');
  const src = xml.toString('utf8');
  let out = '';
  const re = /<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>|<\/w:p>|<w:tab\/>|<w:br\/>|<\/w:tc>/g;
  let m;
  while ((m = re.exec(src))) {
    if (m[1] !== undefined) out += decodeXml(m[1]);
    else if (m[0] === '</w:p>' || m[0] === '<w:br/>') out += '\n';
    else out += '\t';
  }
  return out.replace(/\n{3,}/g, '\n\n').trim();
}

// ---------- PDF (حزمة اختيارية) ----------

async function extractPdf(buf) {
  let pdfParse;
  try {
    pdfParse = (await import('pdf-parse/lib/pdf-parse.js')).default;
  } catch {
    throw new UserFacingError(501, 'قراءة ملفات PDF غير مفعّلة على هذا الخادم. شغّل الأمر npm install لتثبيت حزمة pdf-parse ثم أعد تشغيل الخادم.');
  }
  try {
    const data = await pdfParse(buf, { max: 150 });
    return (data.text || '').trim();
  } catch {
    throw new UserFacingError(422, 'تعذر قراءة ملف PDF. قد يكون تالفاً أو محمياً بكلمة مرور.');
  }
}

// ---------- الواجهة الرئيسية ----------

function decodeBase64(data) {
  const clean = String(data || '').replace(/^data:[^,]*,/, '');
  return Buffer.from(clean, 'base64');
}

/**
 * @param {{name:string, mime?:string, data:string}[]} attachments  بيانات base64
 * @returns {Promise<{images:{name:string,mime:string,data:string}[], texts:{name:string,text:string,truncated:boolean}[]}>}
 */
export async function processAttachments(attachments) {
  const out = { images: [], texts: [] };
  if (!attachments?.length) return out;
  if (!Array.isArray(attachments) || attachments.length > LIMITS.maxFiles) {
    throw new UserFacingError(400, `الحد الأقصى ${LIMITS.maxFiles} ملفات في الرسالة الواحدة.`);
  }

  let budget = LIMITS.maxTextChars;
  for (const att of attachments) {
    const name = String(att?.name || 'file').slice(0, 120);
    const buf = decodeBase64(att?.data);
    if (!buf.length) throw new UserFacingError(400, `الملف «${name}» فارغ.`);

    const imgMime = sniffImage(buf);
    if (imgMime) {
      if (buf.length > LIMITS.maxImageBytes) throw new UserFacingError(413, `الصورة «${name}» كبيرة جداً (الحد 8 ميغابايت).`);
      out.images.push({ name, mime: imgMime, data: buf.toString('base64') });
      continue;
    }

    if (buf.length > LIMITS.maxDocBytes) throw new UserFacingError(413, `الملف «${name}» كبير جداً (الحد 10 ميغابايت).`);
    const ext = extOf(name);
    let text;

    if (ext === 'pdf' || buf.toString('latin1', 0, 5) === '%PDF-') {
      text = await extractPdf(buf);
      if (text.length < 20) {
        throw new UserFacingError(422, `لا يوجد نص قابل للاستخراج في «${name}». ربما هو ملف ممسوح ضوئياً (صور فقط)؛ جرّب رفعه كصور.`);
      }
    } else if (ext === 'docx') {
      try {
        text = extractDocx(buf);
      } catch {
        throw new UserFacingError(422, `تعذر قراءة ملف DOCX «${name}». قد يكون تالفاً.`);
      }
      if (!text) throw new UserFacingError(422, `الملف «${name}» لا يحتوي نصاً.`);
    } else if (ext === 'doc') {
      throw new UserFacingError(415, 'صيغة DOC القديمة غير مدعومة. احفظ الملف بصيغة DOCX أو PDF ثم ارفعه من جديد.');
    } else if (TEXT_EXT.has(ext)) {
      if (buf.includes(0)) throw new UserFacingError(415, `الملف «${name}» ليس نصاً صالحاً للقراءة.`);
      text = buf.toString('utf8');
    } else {
      throw new UserFacingError(415, `نوع الملف «${name}» غير مدعوم. المدعوم: صور JPG/PNG/WEBP، وPDF، وDOCX، وTXT والملفات النصية والبرمجية.`);
    }

    const take = Math.max(0, Math.min(text.length, budget));
    out.texts.push({ name, text: text.slice(0, take), truncated: take < text.length });
    budget -= take;
    if (budget <= 0 && text.length > take) break;
  }
  return out;
}
