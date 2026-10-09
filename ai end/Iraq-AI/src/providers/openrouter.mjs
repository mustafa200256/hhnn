// OpenRouter — متوافق مع OpenAI، مع ترويسات التعريف الخاصة به، وقد يرسل أخطاء داخل البث نفسه.
import { postJson, sseEvents, safeJson, ProviderError, dataUri, envOr } from './common.mjs';

export default {
  id: 'openrouter',
  name: 'OpenRouter',
  envKey: 'OPENROUTER_API_KEY',
  supportsVision: true,

  pickModel({ vision }) {
    return vision
      ? envOr('OPENROUTER_VISION_MODEL', 'google/gemini-2.0-flash-001')
      : envOr('OPENROUTER_MODEL', 'meta-llama/llama-3.3-70b-instruct');
  },

  async *stream({ apiKey, model, system, messages, signal }) {
    const base = envOr('OPENROUTER_BASE_URL', 'https://openrouter.ai/api/v1');
    const body = {
      model,
      stream: true,
      temperature: 0.6,
      max_tokens: 4096,
      messages: [
        { role: 'system', content: system },
        ...messages.map((m) => ({
          role: m.role,
          content: m.images?.length
            ? [
                { type: 'text', text: m.content || 'حلل الصورة.' },
                ...m.images.map((img) => ({ type: 'image_url', image_url: { url: dataUri(img) } })),
              ]
            : m.content,
        })),
      ],
    };

    const res = await postJson(`${base}/chat/completions`, {
      headers: {
        authorization: `Bearer ${apiKey}`,
        'http-referer': envOr('PUBLIC_URL', 'http://localhost:3000'),
        'x-title': 'Iraq AI',
      },
      body,
      signal,
    });

    for await (const ev of sseEvents(res)) {
      if (ev.data === '[DONE]') return;
      const json = safeJson(ev.data);
      if (!json) continue;
      // OpenRouter قد يرسل خطأ بعد بدء البث
      if (json.error || json.choices?.[0]?.finish_reason === 'error') {
        throw new ProviderError('stream', { detail: JSON.stringify(json.error || {}).slice(0, 300) });
      }
      const text = json.choices?.[0]?.delta?.content;
      if (text) yield text;
    }
  },
};
