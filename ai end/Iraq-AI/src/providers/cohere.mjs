// Cohere — v2/chat: أحداث بث مسماة (content-delta) وبنية رد مختلفة عن OpenAI.
import { postJson, sseEvents, safeJson, ProviderError, dataUri, envOr } from './common.mjs';

export default {
  id: 'cohere',
  name: 'Cohere',
  envKey: 'COHERE_API_KEY',
  supportsVision: true,

  pickModel({ vision }) {
    return vision
      ? envOr('COHERE_VISION_MODEL', 'command-a-vision-07-2025')
      : envOr('COHERE_MODEL', 'command-a-03-2025');
  },

  async *stream({ apiKey, model, system, messages, signal }) {
    const base = envOr('COHERE_BASE_URL', 'https://api.cohere.com/v2');
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

    const res = await postJson(`${base}/chat`, {
      headers: { authorization: `Bearer ${apiKey}`, 'x-client-name': 'iraq-ai' },
      body,
      signal,
    });

    for await (const ev of sseEvents(res)) {
      const json = safeJson(ev.data);
      if (!json) continue;
      const type = json.type || ev.event;
      if (type === 'content-delta') {
        const text = json.delta?.message?.content?.text;
        if (text) yield text;
      } else if (type === 'message-end') {
        if (json.delta?.finish_reason === 'ERROR') {
          throw new ProviderError('stream', { detail: 'finish_reason=ERROR' });
        }
        return;
      } else if (type === 'error') {
        throw new ProviderError('stream', { detail: JSON.stringify(json).slice(0, 300) });
      }
    }
  },
};
