// توليد الصور — بنية جاهزة للإضافة مستقبلاً، وغير مفعّلة حالياً (لا يوجد مزود مسجّل).
// لا نزيّف الميزة: ما لم يُسجَّل مزود له مفتاح، يعيد الخادم "غير مفعّل".
//
// لإضافة مزود لاحقاً: أنشئ ملفاً مثل src/providers/images/<name>.mjs يصدّر:
//   { id, name, envKey, async generate({ prompt, signal }) -> { mime, data(base64) } }
// ثم أضفه إلى المصفوفة التالية. لا حاجة لتغيير الواجهة أو server.mjs.
import { UserFacingError } from './files.mjs';

/** @type {{id:string,name:string,envKey:string,generate:Function}[]} */
export const imageProviders = [];

const configured = () => imageProviders.filter((p) => process.env[p.envKey]?.trim());

export function imageStatus() {
  const list = configured();
  return {
    enabled: list.length > 0,
    providers: list.map((p) => ({ id: p.id, name: p.name })),
    message: list.length ? '' : 'توليد الصور غير مفعّل حالياً.',
  };
}

export async function generateImage({ prompt, signal }) {
  const list = configured();
  if (!list.length) throw new UserFacingError(501, 'توليد الصور غير مفعّل حالياً.');
  let lastErr;
  for (const p of list) {
    try {
      return await p.generate({ prompt, signal });
    } catch (err) {
      lastErr = err;
      console.error(`[${new Date().toISOString()}] imagegen provider=${p.id} failed: ${err?.message}`);
    }
  }
  throw new UserFacingError(502, 'تعذر توليد الصورة حالياً، حاول مرة أخرى بعد قليل.');
}
