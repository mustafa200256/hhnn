// Google Gemini — صيغة مختلفة تماماً: contents/parts وsystemInstruction، والمفتاح في ترويسة x-goog-api-key.
import { postJson, sseEvents, safeJson, ProviderError, envOr } from './common.mjs';

export default {
  id: 'gemini',
  name: 'Gemini',
  envKey: 'GEMINI_API_KEY',
  supportsVision: true,

  pickModel() {
    // Gemini يدعم الصور بنفس النموذج
    return envOr('GEMINI_MODEL', 'gemini-2.5-flash');
  },

  async *stream({ apiKey, model, system, messages, signal }) {
    const base = envOr('GEMINI_BASE_URL', 'https://generativelanguage.googleapis.com/v1beta');
    const body = {
      systemInstruction: { parts: [{ text: system }] },
      contents: messages.map((m) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [
          { text: m.content || (m.images?.length ? 'حلل الصورة.' : ' ') },
          ...(m.images || []).map((img) => ({ inlineData: { mimeType: img.mime, data: img.data } })),
        ],
      })),
      generationConfig: { temperature: 0.6, maxOutputTokens: 4096 },
    };

    const res = await postJson(`${base}/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse`, {
      headers: { 'x-goog-api-key': apiKey },
      body,
      signal,
    });

    for await (const ev of sseEvents(res)) {
      const json = safeJson(ev.data);
      if (!json) continue;
      if (json.error) throw new ProviderError('stream', { detail: JSON.stringify(json.error).slice(0, 300) });
      if (json.promptFeedback?.blockReason) {
        throw new ProviderError('bad_request', { detail: `blocked: ${json.promptFeedback.blockReason}` });
      }
      const parts = json.candidates?.[0]?.content?.parts || [];
      for (const p of parts) {
        if (p.text && !p.thought) yield p.text;
      }
    }
  },
};
