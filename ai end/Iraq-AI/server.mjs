// العراق AI — الخادم الرئيسي (Node.js بدون اعتماديات خارجية)
// Frontend → POST /api/chat → مدير المزودين → مزود AI → بث (SSE) → Frontend
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import { loadEnv, projectRoot } from './src/env.mjs';

loadEnv();

const { chat, health, redact, ChatFailure } = await import('./src/providers/index.mjs');
const { systemPromptFor, assistantInfo, ASSISTANT_IDS } = await import('./src/assistants.mjs');
const { processAttachments, UserFacingError, LIMITS } = await import('./src/files.mjs');
const { imageStatus, generateImage } = await import('./src/imagegen.mjs');

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const PUBLIC_DIR = path.join(projectRoot, 'public');
const MAX_BODY_BYTES = 30 * 1024 * 1024;
const RATE_LIMIT_PER_MIN = Number(process.env.RATE_LIMIT_PER_MIN) || 30;
const TRUST_PROXY = process.env.TRUST_PROXY === '1';

const MSG = {
  allFailed: 'تعذر الاتصال بالمساعد حالياً، حاول مرة أخرى بعد قليل.',
  noProvider: 'المساعد غير متاح حالياً، لم يتم إعداد مزود ذكاء اصطناعي على الخادم بعد.',
  noVision: 'تحليل الصور غير متاح حالياً، لا يوجد مزود يدعم الرؤية جاهز للعمل.',
  generic: 'حدث خطأ غير متوقع. حاول مرة أخرى بعد قليل.',
  badRequest: 'تعذر فهم الطلب. تأكد من الرسالة ثم حاول مجدداً.',
  tooMany: 'طلبات كثيرة خلال وقت قصير. انتظر قليلاً ثم حاول مجدداً.',
  tooLarge: 'حجم المرفقات كبير جداً.',
};

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
};

const log = (msg) => console.log(`[${new Date().toISOString()}] ${redact(msg)}`);

// ---------- أدوات HTTP ----------

function securityHeaders(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'camera=(self), microphone=(self), geolocation=()');
  res.setHeader(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com",
      "img-src 'self' data: blob:",
      "media-src 'self' blob:",
      "connect-src 'self'",
      "object-src 'none'",
      "base-uri 'none'",
      "form-action 'self'",
      "frame-ancestors 'none'",
    ].join('; '),
  );
}

function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(body),
  });
  res.end(body);
}

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    const declared = Number(req.headers['content-length']);
    if (declared > MAX_BODY_BYTES) return reject(new HttpError(413, MSG.tooLarge));
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY_BYTES) {
        req.destroy();
        reject(new HttpError(413, MSG.tooLarge));
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'));
      } catch {
        reject(new HttpError(400, MSG.badRequest));
      }
    });
    req.on('error', reject);
  });
}

// تحديد معدل بسيط في الذاكرة لحماية مفاتيحك من الاستهلاك المفرط
const hits = new Map();
function clientIp(req) {
  if (TRUST_PROXY) {
    const xf = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
    if (xf) return xf;
  }
  return req.socket.remoteAddress || 'unknown';
}
function rateLimited(req) {
  const ip = clientIp(req);
  const now = Date.now();
  const arr = (hits.get(ip) || []).filter((t) => now - t < 60_000);
  arr.push(now);
  hits.set(ip, arr);
  return arr.length > RATE_LIMIT_PER_MIN;
}
setInterval(() => {
  const now = Date.now();
  for (const [ip, arr] of hits) if (!arr.some((t) => now - t < 60_000)) hits.delete(ip);
}, 60_000).unref();

// ---------- بناء الرسائل ----------

function sanitizeHistory(history) {
  if (!Array.isArray(history)) return [];
  const clean = [];
  for (const m of history.slice(-30)) {
    if (!m || (m.role !== 'user' && m.role !== 'assistant')) continue;
    const content = typeof m.content === 'string' ? m.content.trim() : '';
    if (!content) continue;
    clean.push({ role: m.role, content: content.slice(0, 16_000) });
  }
  // احتفظ بأحدث الرسائل ضمن سقف إجمالي للأحرف
  let total = 0;
  const kept = [];
  for (let i = clean.length - 1; i >= 0; i--) {
    total += clean[i].content.length;
    if (total > 60_000) break;
    kept.unshift(clean[i]);
  }
  // يجب أن تبدأ المحادثة برسالة مستخدم لتناسب كل المزودين
  while (kept.length && kept[0].role !== 'user') kept.shift();
  return kept;
}

function composeUserMessage(message, processed) {
  const parts = [];
  for (const f of processed.texts) {
    const safe = f.text.replaceAll('</file', '<\\/file');
    parts.push(`<file name="${f.name.replace(/"/g, "'")}"${f.truncated ? ' truncated="true"' : ''}>\n${safe}\n</file>`);
  }
  let text = message;
  if (!text) text = processed.images.length ? 'حلل هذه الصورة وصف ما فيها بالتفصيل.' : 'لخّص محتوى الملف المرفق.';
  parts.push(text);
  return parts.join('\n\n');
}

// ---------- /api/chat ----------

function sse(res, obj) {
  if (!res.writableEnded) res.write(`data: ${JSON.stringify(obj)}\n\n`);
}

async function handleChat(req, res) {
  if (rateLimited(req)) throw new HttpError(429, MSG.tooMany);

  const body = await readJson(req);
  const message = typeof body.message === 'string' ? body.message.trim().slice(0, 20_000) : '';
  const hasAttachments = Array.isArray(body.attachments) && body.attachments.length > 0;
  if (!message && !hasAttachments) throw new HttpError(400, MSG.badRequest);

  const assistant = ASSISTANT_IDS.includes(body.assistant) ? body.assistant : 'general';
  let processed;
  try {
    processed = await processAttachments(hasAttachments ? body.attachments : []);
  } catch (err) {
    if (err instanceof UserFacingError) throw new HttpError(err.status, err.message);
    throw err;
  }

  const history = sanitizeHistory(body.history);
  const userMsg = {
    role: 'user',
    content: composeUserMessage(message, processed),
    ...(processed.images.length ? { images: processed.images } : {}),
  };
  const messages = [...history, userMsg];
  const system = systemPromptFor(assistant);
  const vision = processed.images.length > 0;

  // من هنا يبدأ البث
  res.writeHead(200, {
    'content-type': 'text/event-stream; charset=utf-8',
    'cache-control': 'no-cache, no-transform',
    connection: 'keep-alive',
    'x-accel-buffering': 'no',
  });
  res.flushHeaders?.();

  const abort = new AbortController();
  res.on('close', () => {
    if (!res.writableEnded) abort.abort('client');
  });
  const heartbeat = setInterval(() => {
    if (!res.writableEnded) res.write(': keep-alive\n\n');
  }, 15_000);

  try {
    for await (const ev of chat({ system, messages, vision, signal: abort.signal })) {
      sse(res, ev);
    }
  } catch (err) {
    if (!abort.signal.aborted) {
      if (err instanceof ChatFailure) {
        const text = err.code === 'no_provider' ? MSG.noProvider : err.code === 'no_vision' ? MSG.noVision : MSG.allFailed;
        log(`chat failed code=${err.code}`);
        sse(res, { type: 'error', message: text });
      } else {
        log(`chat unexpected error: ${err?.stack || err}`);
        sse(res, { type: 'error', message: MSG.generic });
      }
    }
  } finally {
    clearInterval(heartbeat);
    if (!res.writableEnded) res.end();
  }
}

// ---------- /api/images ----------

async function handleImages(req, res) {
  const status = imageStatus();
  if (!status.enabled) return sendJson(res, 501, { error: status.message });
  const body = await readJson(req);
  const prompt = typeof body.prompt === 'string' ? body.prompt.trim().slice(0, 2000) : '';
  if (!prompt) throw new HttpError(400, MSG.badRequest);
  try {
    const img = await generateImage({ prompt });
    return sendJson(res, 200, img);
  } catch (err) {
    if (err instanceof UserFacingError) throw new HttpError(err.status, err.message);
    throw err;
  }
}

// ---------- الملفات الثابتة ----------
const fileCache = new Map();

async function serveStatic(req, res, pathname) {
  let rel = decodeURIComponent(pathname);
  if (rel.endsWith('/')) rel += 'index.html';
  const filePath = path.normalize(path.join(PUBLIC_DIR, rel));
  if (filePath !== PUBLIC_DIR && !filePath.startsWith(PUBLIC_DIR + path.sep)) throw new HttpError(403, 'ممنوع.');
  let target = filePath;
  try {
    const s = await stat(target);
    if (s.isDirectory()) target = path.join(target, 'index.html');
  } catch {
    throw new HttpError(404, 'الصفحة غير موجودة.');
  }
  const st = await stat(target);
  const ext = path.extname(target).toLowerCase();
  const isHtml = ext === '.html';
  const headers = {
    'content-type': MIME[ext] || 'application/octet-stream',
    'cache-control': isHtml ? 'no-cache' : 'public, max-age=300',
    vary: 'accept-encoding',
  };
  // ضغط gzip للنصوص مع تخزين مؤقت حسب وقت التعديل
  const compressible = /^(text\/|application\/(json|manifest)|image\/svg)/.test(headers['content-type']);
  const wantsGzip = compressible && /\bgzip\b/.test(String(req.headers['accept-encoding'] || ''));
  const key = `${target}:${st.mtimeMs}:${wantsGzip}`;
  let data = fileCache.get(key);
  if (!data) {
    const raw = await readFile(target);
    data = wantsGzip ? gzipSync(raw, { level: 9 }) : raw;
    if (fileCache.size > 200) fileCache.clear();
    fileCache.set(key, data);
  }
  if (wantsGzip) headers['content-encoding'] = 'gzip';
  headers['content-length'] = data.length;
  res.writeHead(200, headers);
  res.end(req.method === 'HEAD' ? undefined : data);
}

// ---------- الموجّه ----------

const server = http.createServer(async (req, res) => {
  const started = Date.now();
  securityHeaders(res);
  const url = new URL(req.url, 'http://localhost');
  const { pathname } = url;

  res.on('finish', () => {
    if (pathname.startsWith('/api/')) log(`${req.method} ${pathname} ${res.statusCode} ${Date.now() - started}ms`);
  });

  try {
    if (pathname === '/api/health' && req.method === 'GET') return sendJson(res, 200, health());

    if (pathname === '/api/config' && req.method === 'GET') {
      return sendJson(res, 200, {
        assistants: assistantInfo(),
        imageGeneration: imageStatus(),
        limits: { maxFiles: LIMITS.maxFiles, maxImageMB: 8, maxDocMB: 10 },
      });
    }

    if (pathname === '/api/chat') {
      if (req.method !== 'POST') throw new HttpError(405, 'الطريقة غير مسموحة.');
      return await handleChat(req, res);
    }

    if (pathname === '/api/images') {
      if (req.method !== 'POST') throw new HttpError(405, 'الطريقة غير مسموحة.');
      return await handleImages(req, res);
    }

    if (pathname.startsWith('/api/')) throw new HttpError(404, 'غير موجود.');
    if (req.method !== 'GET' && req.method !== 'HEAD') throw new HttpError(405, 'الطريقة غير مسموحة.');
    return await serveStatic(req, res, pathname);
  } catch (err) {
    const status = err instanceof HttpError ? err.status : 500;
    if (!(err instanceof HttpError)) log(`unhandled error on ${pathname}: ${err?.stack || err}`);
    if (res.headersSent) return res.end();
    const message = err instanceof HttpError ? err.message : MSG.generic;
    if (pathname.startsWith('/api/')) return sendJson(res, status, { error: message });
    res.writeHead(status, { 'content-type': 'text/plain; charset=utf-8' });
    res.end(message);
  }
});

server.requestTimeout = 0; // البث قد يطول؛ المهل تُدار داخل مدير المزودين
server.headersTimeout = 20_000;

server.listen(PORT, HOST, () => {
  const h = health();
  console.log('\n  العراق AI — برمجة وتطوير: مصطفى حسين');
  console.log(`  الخادم يعمل على: http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}`);
  console.log('  حالة المزودين:');
  for (const p of h.providers) {
    const mark = p.status === 'missing' ? '—  (لا يوجد مفتاح)' : '✓';
    console.log(`    ${p.name.padEnd(14)} ${mark}`);
  }
  if (!h.online) {
    console.log('\n  تنبيه: لا يوجد أي مفتاح API. انسخ .env.example إلى .env وأضف مفتاحاً واحداً على الأقل، ثم أعد التشغيل.\n');
  }
});

function shutdown() {
  console.log('\nإيقاف الخادم...');
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 2000).unref();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
