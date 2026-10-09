// Groq — واجهة متوافقة مع OpenAI، لكن بمعاملاتها ونماذجها الخاصة.
import { postJson, sseEvents, safeJson, ProviderError, dataUri, envOr } from './common.mjs';

export default {
  id: 'groq',
  name: 'Groq',
  envKey: 'GROQ_API_KEY',
  supportsVision: true,

  pickModel({ vision }) {
    return vision
      ? envOr('GROQ_VISION_MODEL', 'meta-llama/llama-4-scout-17b-16e-instruct')
      : envOr('GROQ_MODEL', 'llama-3.3-70b-versatile');
  },

  async *stream({ apiKey, model, system, messages, signal }) {
    const base = envOr('GROQ_BASE_URL', 'https://api.groq.com/openai/v1');
    const body = {
      model,
      stream: true,
      temperature: 0.6,
      max_completion_tokens: 4096,
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
      headers: { authorization: `Bearer ${apiKey}` },
      body,
      signal,
    });

    for await (const ev of sseEvents(res)) {
      if (ev.data === '[DONE]') return;
      const json = safeJson(ev.data);
      if (!json) continue;
      if (json.error) throw new ProviderError('stream', { detail: JSON.stringify(json.error).slice(0, 300) });
      const text = json.choices?.[0]?.delta?.content;
      if (text) yield text;
    }
  },
};
