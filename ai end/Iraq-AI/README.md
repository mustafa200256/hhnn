# العراق AI

> من العراق... نكتب الكود، نبني المستقبل، ونصنع الذكاء.

تجربة ذكاء اصطناعي عربية حديثة: شاشة افتتاحية تفاعلية، مساعدون متخصصون (برمجة، ألعاب، دراسة، كتابة، تخطيط)، رفع صور وملفات، كاميرا، إدخال صوتي، وبث مباشر للردود.
الـBackend حقيقي يتصل بستة مزودين مع Fallback تلقائي، ومفاتيح الـAPI تبقى على الخادم فقط.

**برمجة وتطوير: مصطفى حسين** · © 2026 العراق AI — جميع الحقوق محفوظة

---

## المتطلبات

- **Node.js 20 أو أحدث** (يفضّل 22). حمّله من <https://nodejs.org>، وتحقق بالأمر `node -v`.
- مفتاح API واحد على الأقل من المزودين الستة.

## التشغيل خطوة بخطوة

```bash
cd Iraq-AI
npm install          # اختياري: يثبّت pdf-parse لقراءة PDF فقط
cp .env.example .env # على ويندوز: copy .env.example .env
```

افتح ملف `.env` وضع المفاتيح التي تملكها (اترك الباقي فارغاً):

```env
GROQ_API_KEY=
GEMINI_API_KEY=
HUGGINGFACE_API_KEY=
OPENROUTER_API_KEY=
MISTRAL_API_KEY=
COHERE_API_KEY=
```

ثم شغّل الخادم وافتح المتصفح:

```bash
npm start
# ثم افتح: http://localhost:3000
```

عند التشغيل يطبع الخادم حالة كل مزود (✓ جاهز / — لا يوجد مفتاح). المزود بدون مفتاح **يُتخطى تماماً** ولا تُجرى أي محاولة اتصال به، فالموقع يعمل بالمفاتيح الموجودة فقط.

> المشروع لا يحتاج أي مكتبة لتشغيل الخادم نفسه. `pdf-parse` اختيارية وتُستخدم فقط لقراءة ملفات PDF؛ بدونها يعمل كل شيء عدا PDF، وتظهر للمستخدم رسالة واضحة.

## من أين أحصل على المفاتيح؟

| المزود | المتغير | أين تنشئ المفتاح |
|---|---|---|
| Groq | `GROQ_API_KEY` | console.groq.com |
| Google Gemini | `GEMINI_API_KEY` | aistudio.google.com |
| OpenRouter | `OPENROUTER_API_KEY` | openrouter.ai |
| Mistral | `MISTRAL_API_KEY` | console.mistral.ai |
| Hugging Face | `HUGGINGFACE_API_KEY` | huggingface.co/settings/tokens (صلاحية Inference Providers) |
| Cohere | `COHERE_API_KEY` | dashboard.cohere.com |

أغلب هذه المزودين يقدّم طبقة مجانية بحدود استخدام؛ راجع شروط كل مزود.

## كيف يعمل النظام

```
المتصفح ──POST /api/chat──▶ server.mjs ──▶ Provider Manager ──▶ Adapter ──▶ مزود AI
   ▲                                              │  (Fallback + Cooldown + Timeout)
   └──────────── بث SSE (meta / delta / done) ◀───┘
```

- **الترتيب الافتراضي:** Groq ← Gemini ← OpenRouter ← Mistral ← Hugging Face ← Cohere.
- **Fallback:** عند 429 أو 5xx أو Timeout أو خطأ شبكة أو مفتاح غير صالح، ينتقل تلقائياً للمزود التالي. إذا فشل مزود بعد أن بدأ الرد، تُمسح الإجابة الجزئية ويبدأ المزود التالي من جديد.
- **Cooling Down:** المزود المتعثر يُعلّق مؤقتاً (دقيقة لـ429 أو حسب `Retry-After`، عشر دقائق للمفتاح غير الصالح، وتصاعدياً للأخطاء المتكررة) ثم يُجرَّب لاحقاً. إن كان كل المزودين في حالة هدوء، يُجرَّب أقربهم عودة بدل رفض الطلب.
- **Timeout:** 25 ثانية لأول جزء من الرد، و30 ثانية خمولاً أثناء البث.
- **إيقاف التوليد:** زر «إيقاف التوليد» يلغي الطلب فعلياً (`AbortController`) ويغلق الاتصال بالمزود.
- **سياق المحادثة:** تُرسل آخر الرسائل للنموذج مع كل طلب، فيفهم «كم عمره؟» بعد «من هو ميسي؟».
- **المساعدون:** لكل مساعد System Prompt مختلف في `src/assistants.mjs` يُرسل فعلياً للنموذج. الواجهة ترسل المعرّف فقط.
- **الأخطاء:** المستخدم يرى رسائل عربية مفهومة. التفاصيل التقنية (رموز HTTP، أسماء الأخطاء) تظهر في سجلات الخادم فقط، وتُحجب المفاتيح من السجلات.

## تغيير النماذج

كل مزود له نموذج افتراضي يمكن تغييره من `.env` بدون تعديل الكود:

```env
GROQ_MODEL=llama-3.3-70b-versatile
GROQ_VISION_MODEL=meta-llama/llama-4-scout-17b-16e-instruct
GEMINI_MODEL=gemini-2.5-flash
OPENROUTER_MODEL=meta-llama/llama-3.3-70b-instruct
OPENROUTER_VISION_MODEL=google/gemini-2.0-flash-001
MISTRAL_MODEL=mistral-small-latest
MISTRAL_VISION_MODEL=pixtral-12b-2409
HUGGINGFACE_MODEL=meta-llama/Llama-3.3-70B-Instruct
HUGGINGFACE_VISION_MODEL=Qwen/Qwen2.5-VL-7B-Instruct
COHERE_MODEL=command-a-03-2025
COHERE_VISION_MODEL=command-a-vision-07-2025
```

> أسماء النماذج تتغير عند المزودين مع الوقت. إذا ظهر في سجلات الخادم `kind=not_found` لمزود ما، فغالباً اسم النموذج لم يعد متاحاً؛ راجع قائمة نماذجه وحدّث المتغير.

إعدادات اختيارية أخرى:

```env
PORT=3000
HOST=127.0.0.1               # استخدم 0.0.0.0 عند النشر على خادم
PROVIDER_ORDER=groq,gemini,openrouter,mistral,huggingface,cohere
FIRST_TOKEN_TIMEOUT_MS=25000
IDLE_TIMEOUT_MS=30000
RATE_LIMIT_PER_MIN=30        # حد الطلبات لكل عنوان IP
TRUST_PROXY=1                # فعّله فقط خلف Nginx/Cloudflare
```

## إضافة مزود جديد

1. أنشئ `src/providers/<name>.mjs` يصدّر كائناً بهذا الشكل (انظر `groq.mjs` كمثال):

   ```js
   export default {
     id: 'myprovider', name: 'My Provider', envKey: 'MYPROVIDER_API_KEY', supportsVision: false,
     pickModel({ vision }) { return process.env.MYPROVIDER_MODEL || 'model-name'; },
     async *stream({ apiKey, model, system, messages, signal }) {
       // ابنِ الطلب بصيغة المزود، ثم yield لكل جزء نصي من الرد
     },
   };
   ```
2. استورده في `src/providers/index.mjs` وأضفه لمصفوفة `ADAPTERS` وللقائمة `DEFAULT_ORDER`.
3. أضف اسم المتغير إلى `.env.example`.

أي خطأ HTTP يُرمى عبر `postJson` (في `common.mjs`) يُصنّف تلقائياً ويدخل في منظومة Fallback وCooldown دون عمل إضافي.

## توليد الصور

قسم «الصور» يدعم **تحليل** الصور فعلياً (JPG / PNG / WEBP) عبر المزودين الذين يدعمون الرؤية. أما **توليد** الصور فغير مفعّل حالياً ويظهر في الواجهة بوضوح: «توليد الصور غير مفعّل حالياً.» البنية جاهزة: أضف مزوداً في `src/imagegen.mjs` (انظر التعليق في أعلى الملف) وسيعمل الزر تلقائياً بدون تعديل الواجهة.

## الملفات والمرفقات

| الصيغة | الحالة |
|---|---|
| JPG / PNG / WEBP | تحليل بصري فعلي (يتطلب مزوداً يدعم الرؤية) |
| TXT, MD, CSV, JSON, أكواد برمجية | قراءة النص مباشرة |
| DOCX | استخراج النص |
| PDF | استخراج النص (يتطلب `npm install`) — الملفات الممسوحة ضوئياً بلا نص غير مدعومة |
| DOC (القديم) | **غير مدعوم**، تظهر رسالة تطلب الحفظ كـ DOCX أو PDF |

الحدود: 5 ملفات في الرسالة، 8 م.ب للصورة، 10 م.ب للمستند. الكاميرا والميكروفون يحتاجان **HTTPS** أو الفتح عبر `localhost`. الإدخال الصوتي يعتمد على Web Speech API في المتصفح (Chrome/Edge/Safari) وإلا تظهر رسالة واضحة.

## الأمان

- المفاتيح تُقرأ من `.env` على الخادم فقط، ولا تُرسل للمتصفح ولا تُخزَّن في LocalStorage، ولا تظهر في أي استجابة أو سجل.
- `.env` مدرج في `.gitignore`. **لا ترفعه إلى GitHub أبداً.**
- الخادم يضع ترويسات حماية (CSP، `X-Frame-Options`...) ويحدّ عدد الطلبات لكل IP.
- المحادثات تُحفظ في LocalStorage داخل متصفح كل مستخدم (لا قاعدة بيانات على الخادم).
- عند النشر العلني: ضع الموقع خلف HTTPS، وفعّل `TRUST_PROXY=1` إن كان خلف وكيل عكسي، وراقب استهلاك مفاتيحك لدى المزودين.

## الاختبارات

```bash
npm test
```

يشغّل اختبارات تلقائية على Adapters المزودين وFallback وCooldown والـTimeout وإلغاء التوليد وحماية المفاتيح، باستخدام مزودين محليين مُحاكين (لا تحتاج مفاتيح ولا إنترنت). هذه الاختبارات تتحقق من منطق النظام، أما الرد الحقيقي من كل مزود فيُختبر بمفتاحك أنت.

## حل المشاكل

| المشكلة | الحل |
|---|---|
| «المساعد غير متاح حالياً، لم يتم إعداد مزود…» | لا يوجد أي مفتاح صالح في `.env`. أضف مفتاحاً وأعد تشغيل الخادم. |
| «تعذر الاتصال بالمساعد حالياً» | فشل كل المزودين. افتح طرفية الخادم وستجد السبب (`kind=auth` مفتاح خاطئ، `rate_limit` تجاوز الحد، `not_found` نموذج غير متاح، `timeout`/`network` اتصال). |
| مزود يظهر «⏳» في لوحة الحالة | في حالة Cooling Down مؤقتة وسيعود تلقائياً. |
| الكاميرا أو الميكروفون لا يعملان | تحتاج HTTPS أو `localhost`، وإذن المتصفح. |
| قراءة PDF لا تعمل | شغّل `npm install` ثم أعد تشغيل الخادم. |
| `EADDRINUSE` | المنفذ مستخدم. غيّر `PORT` في `.env`. |
| تغيير `.env` لا يظهر | أعد تشغيل الخادم بعد أي تعديل. |

## بنية المشروع

```
Iraq-AI/
├── server.mjs              الخادم: /api/chat (SSE) و/api/health و/api/config و/api/images + الملفات الثابتة
├── src/
│   ├── env.mjs             قراءة .env بلا مكتبات
│   ├── assistants.mjs      System Prompts للمساعدين
│   ├── files.mjs           معالجة الصور والمستندات (PDF/DOCX/TXT)
│   ├── imagegen.mjs        بنية توليد الصور المستقبلية (غير مفعّلة)
│   └── providers/
│       ├── index.mjs       Provider Manager: Fallback + Cooldown + Timeout + Health
│       ├── common.mjs      أدوات مشتركة (طلب HTTP، قارئ SSE، تصنيف الأخطاء)
│       └── groq / gemini / openrouter / mistral / huggingface / cohere .mjs   Adapter لكل مزود
├── public/                 الواجهة (HTML/CSS/JS بدون مكتبات)
│   ├── index.html · styles.css · app.js · splash.js · md.js · assets/
└── test/                   اختبارات تلقائية
```
