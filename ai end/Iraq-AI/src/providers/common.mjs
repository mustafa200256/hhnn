// أدوات مشتركة بين محوّلات (Adapters) المزودين.
// لا تحتوي على منطق خاص بمزود بعينه — كل مزود له ملفه.

export class ProviderError extends Error {
  /**
   * @param {'rate_limit'|'auth'|'server'|'timeout'|'network'|'bad_request'|'not_found'|'empty'|'stream'} kind
   * @param {{status?:number, retryAfterMs?:number, detail?:string}} [info]
   */
  constructor(kind, info = {}) {
    super(`${kind}${info.status ? ` (${info.status})` : ''}`);
    this.kind = kind;
    this.status = info.status;
    this.retryAfterMs = info.retryAfterMs;
    this.detail = info.detail || '';
  }
}

export function classifyStatus(status) {
  if (status === 429) return 'rate_limit';
  if (status === 401 || status === 403) return 'auth';
  if (status === 404) return 'not_found';
  if (status === 408 || status === 504) return 'timeout';
  if (status >= 500) return 'server';
  return 'bad_request';
}

function parseRetryAfter(headers) {
  const v = headers.get('retry-after');
  if (!v) return undefined;
  const secs = Number(v);
  if (Number.isFinite(secs)) return Math.min(secs * 1000, 10 * 60_000);
  const date = Date.parse(v);
  if (!Number.isNaN(date)) return Math.min(Math.max(date - Date.now(), 0), 10 * 60_000);
  return undefined;
}

/**
 * طلب POST بصيغة JSON. يرمي ProviderError عند أي فشل (شبكة أو حالة HTTP).
 * الـ signal يأتي من مدير المزودين ويغطي المهلة وإلغاء المستخدم.
 */
export async function postJson(url, { headers = {}, body, signal }) {
  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(body),
      signal,
    });
  } catch (err) {
    if (signal?.aborted) throw err; // يتولاه المدير (إلغاء أو مهلة)
    throw new ProviderError('network', { detail: String(err?.cause?.code || err?.message || err) });
  }
  if (!res.ok) {
    let detail = '';
    try {
      detail = (await res.text()).slice(0, 500);
    } catch {
      /* تجاهل */
    }
    throw new ProviderError(classifyStatus(res.status), {
      status: res.status,
      retryAfterMs: parseRetryAfter(res.headers),
      detail,
    });
  }
  if (!res.body) throw new ProviderError('empty', { detail: 'no response body' });
  return res;
}

/** قارئ Server-Sent Events: يعيد {event, data} لكل حدث. يتجاهل التعليقات (: ...). */
export async function* sseEvents(res) {
  const reader = res.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let idx;
      while ((idx = buffer.search(/\r?\n\r?\n/)) !== -1) {
        const raw = buffer.slice(0, idx);
        buffer = buffer.slice(idx + (buffer[idx] === '\r' ? 4 : 2));
        const ev = parseBlock(raw);
        if (ev) yield ev;
      }
    }
    buffer += decoder.decode();
    if (buffer.trim()) {
      const ev = parseBlock(buffer);
      if (ev) yield ev;
    }
  } finally {
    try {
      await reader.cancel();
    } catch {
      /* تجاهل */
    }
  }
}

function parseBlock(raw) {
  let event = 'message';
  const data = [];
  for (const line of raw.split(/\r?\n/)) {
    if (!line || line.startsWith(':')) continue;
    const c = line.indexOf(':');
    const field = c === -1 ? line : line.slice(0, c);
    const val = c === -1 ? '' : line.slice(c + 1).replace(/^ /, '');
    if (field === 'event') event = val;
    else if (field === 'data') data.push(val);
  }
  if (!data.length) return null;
  return { event, data: data.join('\n') };
}

export function safeJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export const dataUri = (img) => `data:${img.mime};base64,${img.data}`;

export function envOr(name, fallback) {
  const v = process.env[name]?.trim();
  return v || fallback;
}
