// Hugging Face Inference Providers — Router خاص بهم، نماذج بأسماء المستودعات، ومفتاح hf_...
import { postJson, sseEvents, safeJson, ProviderError, dataUri, envOr } from './common.mjs';

export default {
  id: 'huggingface',
  name: 'Hugging Face',
  envKey: 'HUGGINGFACE_API_KEY',
  supportsVision: true,

  pickModel({ vision }) {
    return vision
      ? envOr('HUGGINGFACE_VISION_MODEL', 'Qwen/Qwen2.5-VL-7B-Instruct')
      : envOr('HUGGINGFACE_MODEL', 'meta-llama/Llama-3.3-70B-Instruct');
  },

  async *stream({ apiKey, model, system, messages, signal }) {
    const base = envOr('HUGGINGFACE_BASE_URL', 'https://router.huggingface.co/v1');
    const body = {
      model,
      stream: true,
      temperature: 0.6,
      max_tokens: 3072,
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
