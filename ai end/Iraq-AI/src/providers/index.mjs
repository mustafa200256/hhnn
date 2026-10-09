// مدير المزودين (Provider Manager)
// - يقرأ المفاتيح من البيئة فقط ويتخطى المزود الذي لا يملك مفتاحاً.
// - يرتب المحاولات حسب الأولوية وحالة المزود (جاهز / يهدأ مؤقتاً).
// - ينتقل تلقائياً للمزود التالي عند أي فشل، ويضع المزود المتعثر في "Cooling Down".
// - يفرض مهلة لأول بايت ومهلة خمول، ويحترم إلغاء المستخدم.
import groq from './groq.mjs';
import gemini from './gemini.mjs';
import openrouter from './openrouter.mjs';
import mistral from './mistral.mjs';
import huggingface from './huggingface.mjs';
import cohere from './cohere.mjs';
import { ProviderError } from './common.mjs';

const ADAPTERS = [groq, gemini, openrouter, mistral, huggingface, cohere];
const BY_ID = new Map(ADAPTERS.map((a) => [a.id, a]));
const DEFAULT_ORDER = ['groq', 'gemini', 'openrouter', 'mistral', 'huggingface', 'cohere'];

const num = (name, fallback) => {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v > 0 ? v : fallback;
};

const state = new Map(); // id -> { fails, cooldownUntil, lastError, lastOkAt, lastLatencyMs }
const st = (id) => {
  if (!state.has(id)) state.set(id, { fails: 0, cooldownUntil: 0, lastError: null, lastOkAt: 0, lastLatencyMs: 0 });
  return state.get(id);
};

export class ChatFailure extends Error {
  constructor(code) {
    super(code);
    this.code = code; // 'no_provider' | 'no_vision' | 'all_failed'
  }
}

// ---------- المفاتيح والترتيب ----------

function apiKeyOf(adapter) {
  const v = process.env[adapter.envKey]?.trim();
  if (!v) return null;
  if (/^(your[_-]|xxx|changeme|<|put[_-])/i.test(v)) return null; // قيمة نموذجية لم تُستبدل
  return v;
}

function configuredOrder() {
  const raw = process.env.PROVIDER_ORDER?.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  const wanted = (raw?.length ? raw : DEFAULT_ORDER).filter((id) => BY_ID.has(id));
  for (const id of DEFAULT_ORDER) if (!wanted.includes(id)) wanted.push(id);
  return wanted.map((id) => BY_ID.get(id));
}

function statusOf(adapter, now = Date.now()) {
  if (!apiKeyOf(adapter)) return 'missing';
  return st(adapter.id).cooldownUntil > now ? 'cooling' : 'ready';
}

/** يخفي أي مفتاح مهيأ من النصوص قبل كتابتها في السجلات. */
export function redact(text) {
  let out = String(text ?? '');
  for (const a of ADAPTERS) {
    const k = apiKeyOf(a);
    if (k && k.length >= 6) out = out.split(k).join('***');
  }
  return out;
}

function log(msg) {
  console.error(`[${new Date().toISOString()}] ${redact(msg)}`);
}

// ---------- الصحة والتخطيط ----------

/** حالة المزودين للواجهة — بدون أي مفاتيح. */
export function health() {
  const now = Date.now();
  const providers = configuredOrder().map((a) => {
    const status = statusOf(a, now);
    const s = st(a.id);
    return {
      id: a.id,
      name: a.name,
      status, // ready | cooling | missing
      vision: !!a.supportsVision,
      cooldownSeconds: status === 'cooling' ? Math.ceil((s.cooldownUntil - now) / 1000) : 0,
      lastLatencyMs: s.lastLatencyMs || null,
    };
  });
  const configured = providers.filter((p) => p.status !== 'missing').length;
  const ready = providers.filter((p) => p.status === 'ready').length;
  return { online: configured > 0, configured, ready, providers };
}

function plan({ vision }) {
  const now = Date.now();
  const usable = configuredOrder().filter((a) => apiKeyOf(a) && (!vision || a.supportsVision));
  const ready = usable.filter((a) => statusOf(a, now) === 'ready');
  const cooling = usable.filter((a) => statusOf(a, now) === 'cooling');
  // الجاهزون بترتيب الأولوية (من انتهت فترة هدوئه يعود لمكانه الأصلي ليُعاد اختباره)،
  // ثم المزودون الذين يهدؤون كملاذ أخير، الأقرب عودةً أولاً.
  cooling.sort((a, b) => st(a.id).cooldownUntil - st(b.id).cooldownUntil);
  return [...ready, ...cooling];
}

// ---------- تسجيل النجاح والفشل ----------

function markSuccess(adapter, latencyMs) {
  const s = st(adapter.id);
  s.fails = 0;
  s.cooldownUntil = 0;
  s.lastError = null;
  s.lastOkAt = Date.now();
  s.lastLatencyMs = latencyMs;
}

function markFailure(adapter, err) {
  const s = st(adapter.id);
  s.lastError = err.kind;
  let cooldown = 0;
  switch (err.kind) {
    case 'rate_limit':
      s.fails++;
      cooldown = err.retryAfterMs ?? 60_000;
      break;
    case 'auth': // مفتاح غير صالح أو منتهٍ
      s.fails++;
      cooldown = 10 * 60_000;
      break;
    case 'not_found': // نموذج غير موجود أو غير متاح
      s.fails++;
      cooldown = 5 * 60_000;
      break;
    case 'bad_request': // غالباً مشكلة في المحتوى لا في المزود
      break;
    default: // server / timeout / network / empty / stream
      s.fails++;
      if (s.fails >= 2) cooldown = Math.min(15_000 * 2 ** (s.fails - 2), 5 * 60_000);
  }
  if (cooldown > 0) {
    cooldown = Math.min(Math.max(cooldown, 5_000), 10 * 60_000);
    s.cooldownUntil = Math.max(s.cooldownUntil, Date.now() + cooldown);
  }
}

function normalizeError(err, attemptSignal) {
  if (err instanceof ProviderError) return err;
  if (attemptSignal?.aborted && attemptSignal.reason === 'timeout') return new ProviderError('timeout');
  return new ProviderError('network', { detail: String(err?.cause?.code || err?.message || err) });
}

// ---------- التنفيذ ----------

function nextWithTimeout(iterator, ms, controller) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      controller.abort('timeout');
      reject(new ProviderError('timeout', { detail: `no data for ${ms}ms` }));
    }, ms);
    iterator.next().then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

/**
 * يولّد أحداثاً: status | reset | meta | delta | done
 * ويرمي ChatFailure إذا فشل كل المزودين.
 */
export async function* chat({ system, messages, vision = false, signal }) {
  const candidates = plan({ vision });
  if (!candidates.length) {
    const anyConfigured = configuredOrder().some((a) => apiKeyOf(a));
    throw new ChatFailure(anyConfigured ? 'no_vision' : 'no_provider');
  }

  const firstTokenMs = num('FIRST_TOKEN_TIMEOUT_MS', 25_000);
  const idleMs = num('IDLE_TIMEOUT_MS', 30_000);
  let partialSent = false;

  for (let i = 0; i < candidates.length; i++) {
    if (signal?.aborted) return;
    const adapter = candidates[i];
    const model = adapter.pickModel({ vision });

    if (i > 0) {
      if (partialSent) {
        yield { type: 'reset' };
        partialSent = false;
      }
      yield { type: 'status', message: 'المساعد مشغول حالياً، جارٍ تجربة اتصال آخر...' };
    }

    const attempt = new AbortController();
    const relay = () => attempt.abort('client');
    signal?.addEventListener('abort', relay, { once: true });
    const startedAt = Date.now();
    let got = false;

    try {
      const iterator = adapter
        .stream({ apiKey: apiKeyOf(adapter), model, system, messages, signal: attempt.signal })
        [Symbol.asyncIterator]();

      for (;;) {
        const r = await nextWithTimeout(iterator, got ? idleMs : firstTokenMs, attempt);
        if (r.done) break;
        if (!got) {
          got = true;
          partialSent = true;
          yield { type: 'meta', provider: adapter.id, name: adapter.name, model, firstTokenMs: Date.now() - startedAt };
        }
        yield { type: 'delta', text: r.value };
      }
      if (!got) throw new ProviderError('empty');

      const totalMs = Date.now() - startedAt;
      markSuccess(adapter, totalMs);
      yield { type: 'done', provider: adapter.id, name: adapter.name, model, totalMs };
      return;
    } catch (err) {
      if (signal?.aborted) return; // المستخدم أوقف التوليد — ليس فشلاً
      const e = normalizeError(err, attempt.signal);
      markFailure(adapter, e);
      log(
        `provider=${adapter.id} model=${model} kind=${e.kind}${e.status ? ` status=${e.status}` : ''}` +
          `${e.detail ? ` detail=${e.detail.replace(/\s+/g, ' ').slice(0, 200)}` : ''}` +
          ` next=${candidates[i + 1]?.id ?? 'none'}`,
      );
    } finally {
      signal?.removeEventListener('abort', relay);
      attempt.abort('cleanup'); // يغلق اتصال المزود في كل الأحوال
    }
  }

  throw new ChatFailure('all_failed');
}
