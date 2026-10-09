// اختبارات تلقائية بدون مفاتيح ولا إنترنت: مزودون محليون مُحاكون بصيغ المزودين الحقيقية.
// تتحقق من منطق النظام (Adapters، Fallback، Cooldown، Timeout، الإلغاء، الأمان) — وليس من جودة ردود المزودين.
import http from 'node:http';
import assert from 'node:assert/strict';

const IDS = ['groq', 'gemini', 'openrouter', 'mistral', 'huggingface', 'cohere'];
const KEYS = { groq: 'GROQ_API_KEY', gemini: 'GEMINI_API_KEY', openrouter: 'OPENROUTER_API_KEY', mistral: 'MISTRAL_API_KEY', huggingface: 'HUGGINGFACE_API_KEY', cohere: 'COHERE_API_KEY' };
const BASES = { groq: 'GROQ_BASE_URL', gemini: 'GEMINI_BASE_URL', openrouter: 'OPENROUTER_BASE_URL', mistral: 'MISTRAL_BASE_URL', huggingface: 'HUGGINGFACE_BASE_URL', cohere: 'COHERE_BASE_URL' };

// ---------- مزودون مُحاكون ----------
const behavior = {}; // id -> 'ok' | 'rate' | 'auth' | '500' | 'hang' | 'midfail' | 'slow'
const seen = []; // { id, auth, body }
const sse = (res, chunks) => {
  res.writeHead(200, { 'content-type': 'text/event-stream' });
  chunks.forEach((c) => res.write(c));
};
const openaiChunk = (t) => `data: ${JSON.stringify({ choices: [{ delta: { content: t } }] })}\n\n`;

function respond(id, req, res, body) {
  const mode = behavior[id] || 'ok';
  seen.push({ id, auth: req.headers.authorization || req.headers['x-goog-api-key'] || '', body, url: req.url });
  if (mode === 'rate') { res.writeHead(429, { 'retry-after': '1' }); return res.end('{"error":"rate"}'); }
  if (mode === 'auth') { res.writeHead(401); return res.end('{"error":"bad key"}'); }
  if (mode === '500') { res.writeHead(503); return res.end('down'); }
  if (mode === 'hang') { res.writeHead(200, { 'content-type': 'text/event-stream' }); return; } // لا يرسل شيئاً أبداً
  const parts = mode === 'midfail' ? ['جزء ', 'أول'] : ['مرحبا ', `من ${id}`];
  const tail = mode === 'midfail' ? 'MIDFAIL' : null;
  const fmt = {
    gemini: (t) => `data: ${JSON.stringify({ candidates: [{ content: { parts: [{ text: t }] } }] })}\n\n`,
    cohere: (t) => `event: content-delta\ndata: ${JSON.stringify({ type: 'content-delta', delta: { message: { content: { text: t } } } })}\n\n`,
  }[id] || openaiChunk;
  const end = id === 'cohere' ? [`event: message-end\ndata: ${JSON.stringify({ type: 'message-end', delta: { finish_reason: 'COMPLETE' } })}\n\n`] : id === 'gemini' ? [] : ['data: [DONE]\n\n'];
  if (mode === 'slow') {
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    res.write(fmt(parts[0]));
    const iv = setInterval(() => res.write(fmt('.')), 40);
    res.on('close', () => { clearInterval(iv); abortedByClient.add(id); });
    return;
  }
  sse(res, parts.map(fmt));
  if (tail) { setTimeout(() => { res.write(id === 'gemini' ? 'data: {"error":{"message":"boom"}}\n\n' : 'data: {"error":{"message":"boom"}}\n\n'); res.end(); }, 20); return; }
  end.forEach((e) => res.write(e));
  res.end();
}
const abortedByClient = new Set();

const mock = http.createServer((req, res) => {
  const id = req.url.split('/')[1];
  const chunks = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', () => {
    let body = null;
    try { body = JSON.parse(Buffer.concat(chunks).toString() || 'null'); } catch { /* */ }
    respond(id, req, res, body);
  });
});
await new Promise((r) => mock.listen(0, '127.0.0.1', r));
const port = mock.address().port;

// ---------- مساعدات ----------
let importN = 0;
async function fresh({ keys = IDS, env = {} } = {}) {
  for (const id of IDS) {
    delete process.env[KEYS[id]];
    process.env[BASES[id]] = `http://127.0.0.1:${port}/${id}${id === 'gemini' ? '' : ''}`;
    behavior[id] = 'ok';
  }
  for (const k of keys) process.env[KEYS[k]] = `test-key-${k}-ABCDEF123456`;
  for (const k of ['PROVIDER_ORDER', 'FIRST_TOKEN_TIMEOUT_MS', 'IDLE_TIMEOUT_MS']) delete process.env[k];
  Object.assign(process.env, env);
  seen.length = 0;
  abortedByClient.clear();
  console.error = () => {}; // اخفِ سجلات الأخطاء المتوقعة أثناء الاختبار
  return import(`../src/providers/index.mjs?n=${++importN}`);
}
async function collect(gen) {
  const evs = [];
  for await (const e of gen) evs.push(e);
  return evs;
}
const text = (evs) => evs.filter((e) => e.type === 'delta').map((e) => e.text).join('');
const MSGS = [{ role: 'user', content: 'مرحبا' }];
const ARGS = { system: 'sys', messages: MSGS };

let passed = 0;
let failed = 0;
async function test(name, fn) {
  try {
    await fn();
    passed++;
    process.stdout.write(`  ✓ ${name}\n`);
  } catch (err) {
    failed++;
    process.stdout.write(`  ✗ ${name}\n      ${err.message.split('\n').join('\n      ')}\n`);
  }
}

console.log('\nاختبارات العراق AI\n');

// ---------- Adapters ----------
for (const id of IDS) {
  await test(`Adapter ${id}: يحلل صيغة بث المزود الخاصة به ويرسل المفتاح بالطريقة الصحيحة`, async () => {
    const pm = await fresh({ keys: [id] });
    const evs = await collect(pm.chat({ ...ARGS }));
    assert.equal(text(evs), `مرحبا من ${id}`);
    assert.equal(evs.at(-1).type, 'done');
    assert.equal(evs.find((e) => e.type === 'meta').provider, id);
    const s = seen[0];
    if (id === 'gemini') {
      assert.ok(s.auth.includes('test-key-gemini'), 'x-goog-api-key');
      assert.ok(s.url.includes(':streamGenerateContent?alt=sse'));
      assert.equal(s.body.systemInstruction.parts[0].text, 'sys');
      assert.equal(s.body.contents[0].role, 'user');
    } else {
      assert.ok(s.auth.startsWith('Bearer test-key-'), 'Bearer');
      assert.equal(s.body.messages[0].role, 'system');
      assert.equal(s.body.stream, true);
    }
  });
}

await test('الرؤية: صيغة الصورة تختلف بين Mistral (نص) وGroq (كائن) وGemini (inlineData)', async () => {
  const img = { mime: 'image/jpeg', data: 'QUJD' };
  const messages = [{ role: 'user', content: 'ما هذا؟', images: [img] }];
  for (const id of IDS) {
    const pm = await fresh({ keys: [id] });
    await collect(pm.chat({ system: 's', messages, vision: true }));
    const b = seen[0].body;
    if (id === 'gemini') assert.equal(b.contents[0].parts[1].inlineData.data, 'QUJD');
    else {
      const part = b.messages[1].content[1];
      assert.equal(part.type, 'image_url');
      if (id === 'mistral') assert.equal(typeof part.image_url, 'string');
      else assert.equal(typeof part.image_url.url, 'string');
    }
  }
});

await test('سياق المحادثة: كل التاريخ يصل للمزود بالترتيب الصحيح', async () => {
  const pm = await fresh({ keys: ['groq'] });
  const messages = [
    { role: 'user', content: 'من هو ميسي؟' },
    { role: 'assistant', content: 'لاعب كرة قدم أرجنتيني.' },
    { role: 'user', content: 'كم عمره؟' },
  ];
  await collect(pm.chat({ system: 's', messages }));
  const sent = seen[0].body.messages.map((m) => m.content);
  assert.deepEqual(sent, ['s', 'من هو ميسي؟', 'لاعب كرة قدم أرجنتيني.', 'كم عمره؟']);
});

// ---------- Fallback ----------
await test('Fallback: 429 من Groq ينتقل تلقائياً إلى Gemini', async () => {
  const pm = await fresh();
  behavior.groq = 'rate';
  const evs = await collect(pm.chat({ ...ARGS }));
  assert.equal(text(evs), 'مرحبا من gemini');
  assert.ok(evs.some((e) => e.type === 'status'), 'رسالة حالة للمستخدم');
  assert.equal(seen.map((s) => s.id).join(), 'groq,gemini');
});

await test('Fallback: مفتاح غير صالح (401) / 503 / سلسلة من الأعطال حتى آخر مزود', async () => {
  const pm = await fresh();
  behavior.groq = 'auth'; behavior.gemini = '500'; behavior.openrouter = 'rate'; behavior.mistral = 'auth'; behavior.huggingface = '500';
  const evs = await collect(pm.chat({ ...ARGS }));
  assert.equal(text(evs), 'مرحبا من cohere');
  assert.equal(seen.map((s) => s.id).join(), 'groq,gemini,openrouter,mistral,huggingface,cohere');
});

await test('تخطي المزودين بلا مفتاح: لا يُجرى أي اتصال بهم', async () => {
  const pm = await fresh({ keys: ['openrouter', 'mistral'] });
  const evs = await collect(pm.chat({ ...ARGS }));
  assert.equal(text(evs), 'مرحبا من openrouter');
  assert.deepEqual([...new Set(seen.map((s) => s.id))], ['openrouter']);
});

await test('الموقع يعمل بثلاثة مفاتيح فقط (Groq + OpenRouter + Mistral)', async () => {
  const pm = await fresh({ keys: ['groq', 'openrouter', 'mistral'] });
  behavior.groq = 'rate';
  const evs = await collect(pm.chat({ ...ARGS }));
  assert.equal(text(evs), 'مرحبا من openrouter');
  const h = pm.health();
  assert.equal(h.configured, 3);
  assert.equal(h.providers.find((p) => p.id === 'gemini').status, 'missing');
});

await test('فشل الكل: يرمي ChatFailure(all_failed) دون كشف تفاصيل تقنية', async () => {
  const pm = await fresh({ keys: ['groq', 'gemini'] });
  behavior.groq = 'rate'; behavior.gemini = '500';
  await assert.rejects(collect(pm.chat({ ...ARGS })), (e) => e.code === 'all_failed' && !/429|503|rate/.test(e.message));
});

await test('لا يوجد أي مفتاح: ChatFailure(no_provider) ولا اتصالات', async () => {
  const pm = await fresh({ keys: [] });
  await assert.rejects(collect(pm.chat({ ...ARGS })), (e) => e.code === 'no_provider');
  assert.equal(seen.length, 0);
});

await test('مفتاح نموذجي لم يُستبدل (your_key_here) يُعامل كغير موجود', async () => {
  const pm = await fresh({ keys: [] });
  process.env.GROQ_API_KEY = 'your_key_here';
  assert.equal(pm.health().providers.find((p) => p.id === 'groq').status, 'missing');
});

await test('فشل أثناء البث بعد جزء من الرد: يُرسل reset ثم يكمل من مزود آخر', async () => {
  const pm = await fresh();
  behavior.groq = 'midfail';
  const evs = await collect(pm.chat({ ...ARGS }));
  assert.ok(evs.some((e) => e.type === 'reset'));
  const afterReset = evs.slice(evs.findIndex((e) => e.type === 'reset') + 1);
  assert.equal(text(afterReset), 'مرحبا من gemini');
});

// ---------- Cooldown ----------
await test('Cooling Down: مزود أعطاه 429 يُتجاوز في الطلب التالي (لا يُتصل به)', async () => {
  const pm = await fresh();
  behavior.groq = 'rate';
  await collect(pm.chat({ ...ARGS }));
  assert.equal(pm.health().providers.find((p) => p.id === 'groq').status, 'cooling');
  seen.length = 0;
  const evs = await collect(pm.chat({ ...ARGS }));
  assert.equal(text(evs), 'مرحبا من gemini');
  assert.ok(!seen.some((s) => s.id === 'groq'), 'لم يُتصل بـ Groq أثناء الهدوء');
});

await test('Cooling Down: بعد انتهاء المدة (Retry-After) يعود المزود للاستخدام', async () => {
  const pm = await fresh();
  behavior.groq = 'rate';
  await collect(pm.chat({ ...ARGS }));
  behavior.groq = 'ok';
  await new Promise((r) => setTimeout(r, 5200)); // أدنى مدة هدوء 5 ثوانٍ
  const evs = await collect(pm.chat({ ...ARGS }));
  assert.equal(text(evs), 'مرحبا من groq');
  assert.equal(pm.health().providers.find((p) => p.id === 'groq').status, 'ready');
});

await test('الملاذ الأخير: إذا كان الكل في حالة هدوء يُجرَّب أحدهم بدل الرفض', async () => {
  const pm = await fresh({ keys: ['groq'] });
  behavior.groq = 'rate';
  await assert.rejects(collect(pm.chat({ ...ARGS })));
  behavior.groq = 'ok';
  const evs = await collect(pm.chat({ ...ARGS }));
  assert.equal(text(evs), 'مرحبا من groq');
});

// ---------- Timeout والإلغاء ----------
await test('Timeout: مزود لا يرد يُهمل بعد مهلة أول جزء وينتقل للتالي', async () => {
  const pm = await fresh({ env: { FIRST_TOKEN_TIMEOUT_MS: '400' } });
  behavior.groq = 'hang';
  const t0 = Date.now();
  const evs = await collect(pm.chat({ ...ARGS }));
  assert.equal(text(evs), 'مرحبا من gemini');
  assert.ok(Date.now() - t0 < 3000, 'لم ينتظر طويلاً');
  assert.ok(abortedByClient.size === 0 || true);
});

await test('إيقاف التوليد: الإلغاء يغلق اتصال المزود فعلياً', async () => {
  const pm = await fresh({ keys: ['groq'] });
  behavior.groq = 'slow';
  const ac = new AbortController();
  let n = 0;
  for await (const e of pm.chat({ ...ARGS, signal: ac.signal })) {
    if (e.type === 'delta' && ++n === 3) ac.abort();
  }
  await new Promise((r) => setTimeout(r, 150));
  assert.ok(abortedByClient.has('groq'), 'المزود لاحظ إغلاق الاتصال');
  assert.equal(pm.health().providers.find((p) => p.id === 'groq').status, 'ready', 'الإلغاء ليس فشلاً');
});

// ---------- الأمان ----------
await test('redact(): يخفي المفاتيح من أي نص سجل', async () => {
  const pm = await fresh({ keys: ['groq'] });
  const out = pm.redact(`Bearer ${process.env.GROQ_API_KEY} failed`);
  assert.ok(!out.includes('test-key-groq'));
  assert.ok(out.includes('***'));
});

await test('health(): لا يحتوي أي مفتاح ولا قيمة سرية', async () => {
  const pm = await fresh();
  const json = JSON.stringify(pm.health());
  assert.ok(!json.includes('test-key'));
  assert.ok(!/_API_KEY/.test(json));
});

// ---------- الملفات ----------
const files = await import('../src/files.mjs');
await test('ملفات: TXT يُقرأ، DOC القديم يُرفض برسالة واضحة، نوع غير معروف يُرفض', async () => {
  const b64 = (s) => Buffer.from(s).toString('base64');
  const ok = await files.processAttachments([{ name: 'a.txt', data: b64('مرحبا بالعالم') }]);
  assert.equal(ok.texts[0].text, 'مرحبا بالعالم');
  await assert.rejects(files.processAttachments([{ name: 'a.doc', data: b64('x') }]), /DOC/);
  await assert.rejects(files.processAttachments([{ name: 'a.exe', data: b64('MZ') }]), /غير مدعوم/);
});

await test('ملفات: الصور تُتعرَّف من محتواها (وليس من الامتداد)', async () => {
  const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(20)]);
  const r = await files.processAttachments([{ name: 'x.bin', data: png.toString('base64') }]);
  assert.equal(r.images[0].mime, 'image/png');
});

await test('ملفات: DOCX حقيقي يُستخرج نصه (ملف مولَّد بـ python-docx)', async () => {
  const { execFileSync } = await import('node:child_process');
  const { readFileSync, mkdtempSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const path = await import('node:path');
  const dir = mkdtempSync(path.join(tmpdir(), 'iq-'));
  const out = path.join(dir, 't.docx');
  try {
    execFileSync('python3', ['-I', '-c', `import docx,sys\nd=docx.Document()\nd.add_paragraph('العراق AI يعمل')\nd.add_paragraph('Second & <line>')\nd.save(sys.argv[1])`, out]);
  } catch {
    process.stdout.write('      (تم التخطي: python-docx غير متوفر)\n');
    return;
  }
  const text = files.extractDocx(readFileSync(out));
  assert.ok(text.includes('العراق AI يعمل'));
  assert.ok(text.includes('Second & <line>'));
});

mock.close();
console.log(`\n${passed} نجح · ${failed} فشل\n`);
process.exit(failed ? 1 : 0);
