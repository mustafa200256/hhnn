// Mistral — صيغة الصور عندهم: image_url كنص مباشر (وليس كائناً)، والمعامل max_tokens.
import { postJson, sseEvents, safeJson, ProviderError, dataUri, envOr } from './common.mjs';

export default {
  id: 'mistral',
  name: 'Mistral',
  envKey: 'MISTRAL_API_KEY',
  supportsVision: true,

  pickModel({ vision }) {
    return vision
      ? envOr('MISTRAL_VISION_MODEL', 'pixtral-12b-2409')
      : envOr('MISTRAL_MODEL', 'mistral-small-latest');
  },

  async *stream({ apiKey, model, system, messages, signal }) {
    const base = envOr('MISTRAL_BASE_URL', 'https://api.mistral.ai/v1');
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
                ...m.images.map((img) => ({ type: 'image_url', image_url: dataUri(img) })),
              ]
            : m.content,
        })),
      ],
    };

    const res = await postJson(`${base}/chat/completions`, {
      headers: { authorization: `Bearer ${apiKey}`, accept: 'text/event-stream' },
      body,
      signal,
    });

    for await (const ev of sseEvents(res)) {
      if (ev.data === '[DONE]') return;
      const json = safeJson(ev.data);
      if (!json) continue;
      if (json.error || json.object === 'error') {
        throw new ProviderError('stream', { detail: JSON.stringify(json).slice(0, 300) });
      }
      const delta = json.choices?.[0]?.delta?.content;
      // Mistral قد يعيد المحتوى نصاً أو مصفوفة أجزاء
      if (typeof delta === 'string') {
        if (delta) yield delta;
      } else if (Array.isArray(delta)) {
        for (const part of delta) if (part?.type === 'text' && part.text) yield part.text;
      }
    }
  },
};
