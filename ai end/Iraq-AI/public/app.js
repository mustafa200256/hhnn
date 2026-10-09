// العراق AI — منطق الواجهة
// ملاحظة أمنية: لا توجد هنا أي مفاتيح. كل الطلبات تذهب إلى /api/* على الخادم الخاص بك فقط.
import { runSplash } from './splash.js';
import { renderMarkdown } from './md.js';

/* ==========================================================================
   أدوات
   ========================================================================== */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const REDUCE = matchMedia('(prefers-reduced-motion: reduce)').matches;
const COMPACT = matchMedia('(max-width: 900px)');
const HOVER = matchMedia('(hover: hover)').matches;
const COARSE = matchMedia('(pointer: coarse)').matches;

const STORE_KEY = 'iraqai.v1.chats';
const MAX_CHATS = 80;
const MAX_FILES = 5;
const MAX_DOC_BYTES = 10 * 1024 * 1024;
const DOC_EXT = /\.(pdf|docx|txt|md|csv|json|xml|html?|css|m?js|cjs|tsx?|jsx|py|java|c|cpp|h|hpp|cs|go|rs|php|rb|sql|ya?ml|ini|toml|log|sh|tex|srt)$/i;

const MSG = {
  network: 'تعذر الاتصال بالخادم. تأكد أن الخادم يعمل ثم حاول مرة أخرى.',
  generic: 'حدث خطأ غير متوقع. حاول مرة أخرى بعد قليل.',
  interrupted: 'انقطع الاتصال أثناء الرد. حاول مرة أخرى.',
};

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const ic = (name) => `<svg class="ic" aria-hidden="true"><use href="#i-${name}"/></svg>`;
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36));
const fmtSec = (ms) => `${(ms / 1000).toFixed(ms < 10000 ? 1 : 0)} ث`;
const shortModel = (m = '') => {
  const s = m.split('/').pop();
  return s.length > 30 ? `${s.slice(0, 29)}…` : s;
};
const fmtSize = (b) => (b < 1024 * 1024 ? `${Math.max(1, Math.round(b / 1024))} ك.ب` : `${(b / 1024 / 1024).toFixed(1)} م.ب`);
const safeParse = (t) => {
  try {
    return JSON.parse(t);
  } catch {
    return null;
  }
};

/* ==========================================================================
   الأقسام والمساعدون
   ========================================================================== */
const HOME_SUGGESTIONS = [
  { icon: 'chat', title: 'اسأل الذكاء الاصطناعي', desc: 'أي سؤال، أي موضوع', focus: true },
  { icon: 'code', title: 'اكتب كود', desc: 'من فكرة إلى كود يعمل', go: 'programming', fill: 'اكتب لي كود ' },
  { icon: 'book', title: 'ساعدني بالدراسة', desc: 'شرح، تلخيص، أسئلة', go: 'study' },
  { icon: 'compass', title: 'اختر لي لعبة', desc: 'حسب ذوقك وجهازك', go: 'games', send: 'ساعدني أختار لعبتي الجاية.' },
  { icon: 'file', title: 'حلل ملف', desc: 'PDF · DOCX · TXT', pick: 'file' },
  { icon: 'image', title: 'حلل صورة', desc: 'ارفعها أو التقطها', pick: 'image' },
  { icon: 'calendar', title: 'خطط لي مشروع', desc: 'خطوات وجدول واضح', assistant: 'planning', fill: 'أريد التخطيط لمشروع: ' },
  { icon: 'user', title: 'تحدث معي', desc: 'سوالف وأفكار', assistant: 'personal', send: 'مرحبا، حابب نسولف شوية.' },
];

const SECTIONS = [
  {
    id: 'general', kind: 'chat', label: 'المحادثة العامة', short: 'محادثة', icon: 'chat', assistant: 'general', sub: 'لكل الأسئلة',
    hero: { title: 'مرحباً بك في العراق AI', sub: 'شنو تريد نسوي اليوم؟', how: false, suggestions: HOME_SUGGESTIONS },
  },
  {
    id: 'programming', kind: 'chat', label: 'المبرمجون', short: 'برمجة', icon: 'code', assistant: 'programming', sub: 'مساعد البرمجة',
    hero: {
      title: 'منطقة المبرمجين', sub: 'خلينا نبنيها خطوة بخطوة.', how: true,
      suggestions: [
        { icon: 'code', title: 'اشرح لي كوداً', desc: 'سطراً بسطر وبشكل مبسط', fill: 'اشرح لي هذا الكود خطوة بخطوة:\n\n' },
        { icon: 'refresh', title: 'أصلح خطأ', desc: 'ألصق الكود ورسالة الخطأ', fill: 'عندي خطأ في الكود. هذا الكود ورسالة الخطأ:\n\n' },
        { icon: 'spark', title: 'ابنِ مشروعاً', desc: 'بنية + كود كامل', fill: 'أريد بناء مشروع: ' },
        { icon: 'cpu', title: 'حسّن الأداء', desc: 'Refactor وتسريع', fill: 'حسّن أداء وجودة هذا الكود واشرح التغييرات:\n\n' },
        { icon: 'cap', title: 'تعلّم البرمجة', desc: 'خطة من الصفر', send: 'أريد أتعلم البرمجة من الصفر. اسألني عن مستواي وهدفي أولاً ثم اقترح عليّ خطة.' },
      ],
    },
  },
  {
    id: 'gamer', kind: 'chat', label: 'Gamers', short: 'Gamers', icon: 'gamepad', assistant: 'gamer', sub: 'إعدادات · Builds · عتاد',
    hero: {
      title: 'منطقة الـGamers', sub: 'جاهزين نرفع الأداء؟', how: true,
      suggestions: [
        { icon: 'cpu', title: 'أفضل الإعدادات', desc: 'FPS أعلى بجودة جيدة', fill: 'أريد أفضل إعدادات لعبة: ' },
        { icon: 'gamepad', title: 'جهاز للألعاب', desc: 'تجميع حسب الميزانية', send: 'ساعدني أجمّع جهاز كمبيوتر للألعاب. اسألني عن ميزانيتي وأنواع الألعاب أولاً.' },
        { icon: 'spark', title: 'Build واستراتيجية', desc: 'أقوى أسلوب لعب', fill: 'أريد أفضل Build واستراتيجية للعبة: ' },
        { icon: 'file', title: 'Mods', desc: 'تعديلات آمنة ومفيدة', fill: 'اقترح لي أفضل Mods للعبة: ' },
        { icon: 'compass', title: 'نصائح Steam', desc: 'وفّر وتنظم أكثر', send: 'أعطني نصائح ذكية لاستخدام Steam وتنظيم مكتبتي وتوفير المال.' },
      ],
    },
  },
  {
    id: 'games', kind: 'chat', label: 'الألعاب', short: 'ألعاب', icon: 'compass', assistant: 'games', sub: 'اختر لعبتك الجاية',
    hero: {
      title: 'مرشد الألعاب', sub: 'خلينا نختار لعبتك الجاية.', how: true,
      suggestions: [
        { icon: 'compass', title: 'عالم مفتوح', desc: 'Open World', send: 'رشّح لي ألعاب Open World ممتعة. اسألني عن منصتي أولاً.' },
        { icon: 'spark', title: 'رعب', desc: 'Horror', send: 'رشّح لي ألعاب رعب جيدة. اسألني عن منصتي ومستوى الرعب الذي أتحمله.' },
        { icon: 'book', title: 'قصة', desc: 'Story Games', send: 'رشّح لي ألعاب قصصية قوية. اسألني عن منصتي أولاً.' },
        { icon: 'cpu', title: 'محاكاة', desc: 'Simulation', send: 'رشّح لي ألعاب محاكاة (Simulation) ممتعة. اسألني عن منصتي أولاً.' },
        { icon: 'users', title: 'لعب جماعي', desc: 'Multiplayer', send: 'رشّح لي ألعاب جماعية (Multiplayer) أللعبها مع أصدقائي. اسألني عن منصتنا وعددنا.' },
        { icon: 'gamepad', title: 'قرّر عني', desc: 'ثلاثة أسئلة وترشيح', send: 'ساعدني أختار لعبتي الجاية. اسألني بعض الأسئلة القصيرة ثم رشّح لي.' },
      ],
    },
  },
  {
    id: 'student', kind: 'chat', label: 'الطلاب', short: 'طلاب', icon: 'cap', assistant: 'student', sub: 'مساعد الطلاب',
    hero: {
      title: 'مساحة الطلاب', sub: 'أي مادة؟ نشرحها سوا.', how: true,
      suggestions: [
        { icon: 'book', title: 'اشرح لي درساً', desc: 'بلغة بسيطة وأمثلة', fill: 'اشرح لي بشكل مبسط درس: ' },
        { icon: 'spark', title: 'حل مسألة', desc: 'خطوة بخطوة', fill: 'ساعدني أحل هذه المسألة خطوة بخطوة:\n\n' },
        { icon: 'check', title: 'راجع إجابتي', desc: 'تصحيح وملاحظات', fill: 'راجع إجابتي هذه وصحح أخطائي:\n\n' },
        { icon: 'cap', title: 'كيف أذاكر؟', desc: 'طرق ذكية للحفظ والفهم', send: 'كيف أذاكر بشكل ذكي؟ اسألني عن مادتي ووقتي ثم اقترح عليّ طريقة.' },
      ],
    },
  },
  {
    id: 'study', kind: 'chat', label: 'الدراسة', short: 'دراسة', icon: 'book', assistant: 'study', sub: 'أدوات المذاكرة',
    hero: {
      title: 'غرفة الدراسة', sub: 'جاهز نفهمها مو بس نحفظها؟', how: true,
      suggestions: [
        { icon: 'check', title: 'امتحان تجريبي', desc: 'أسئلة مع إجابات نموذجية', fill: 'أنشئ لي امتحاناً تجريبياً من 10 أسئلة في: ' },
        { icon: 'copy', title: 'بطاقات Flashcards', desc: 'للمراجعة السريعة', fill: 'أنشئ لي بطاقات تعليمية (Flashcards) عن: ' },
        { icon: 'file', title: 'لخّص لي نصاً', desc: 'أهم النقاط فقط', fill: 'لخّص لي النص التالي:\n\n' },
        { icon: 'calendar', title: 'خطة دراسة', desc: 'مقسمة على أيام', fill: 'اعمل لي خطة دراسة لمادة: ' },
        { icon: 'spark', title: 'بسّط مفهوماً', desc: 'كأنك تشرح لصديق', fill: 'بسّط لي هذا المفهوم بأمثلة من الحياة: ' },
      ],
    },
  },
  {
    id: 'images', kind: 'images', label: 'الصور', short: 'الصور', icon: 'image', assistant: 'general', sub: 'تحليل الصور',
    hero: { title: 'تحليل الصور', sub: 'أرسل صورة واسأل عمّا فيها.', how: false, suggestions: [
      { icon: 'image', title: 'ارفع صورة', desc: 'JPG · PNG · WEBP', pick: 'image' },
      { icon: 'camera', title: 'التقط صورة', desc: 'بالكاميرا مباشرة', pick: 'camera' },
    ] },
  },
  { id: 'assistants', kind: 'assistants', label: 'المساعدون الشخصيون', short: 'المساعدون', icon: 'users', assistant: 'personal', sub: 'اختر مساعدك' },
];
const SECTION = Object.fromEntries(SECTIONS.map((s) => [s.id, s]));

const ASSISTANT_CARDS = [
  { id: 'study', name: 'مساعد الدراسة', icon: 'book', desc: 'يشرح بصبر وخطوة بخطوة، يلخّص، ويجهّز لك امتحانات وبطاقات مراجعة.', hero: SECTION.study.hero },
  { id: 'programming', name: 'مساعد البرمجة', icon: 'code', desc: 'كتابة وشرح وإصلاح الكود وبناء المشاريع بلغات متعددة.', hero: SECTION.programming.hero },
  { id: 'gamer', name: 'مساعد الألعاب', icon: 'gamepad', desc: 'اختيار الألعاب، استراتيجيات، Builds، إعدادات وعتاد.', hero: { ...SECTION.games.hero, title: 'مساعد الألعاب' } },
  {
    id: 'writing', name: 'مساعد الكتابة', icon: 'pen', desc: 'رسائل، مقالات، سير ذاتية، تدقيق وإعادة صياغة بنبرتك.',
    hero: { title: 'مساعد الكتابة', sub: 'شنو نكتب اليوم؟', how: true, suggestions: [
      { icon: 'pen', title: 'اكتب رسالة', desc: 'رسمية أو ودية', fill: 'اكتب لي رسالة بخصوص: ' },
      { icon: 'check', title: 'دقّق نصي', desc: 'إملاء ونحو وأسلوب', fill: 'دقق لغوياً وحسّن أسلوب هذا النص:\n\n' },
      { icon: 'file', title: 'سيرة ذاتية', desc: 'احترافية ومختصرة', fill: 'ساعدني أكتب سيرة ذاتية. خبرتي ومجالي: ' },
      { icon: 'refresh', title: 'أعد الصياغة', desc: 'أوضح وأقوى', fill: 'أعد صياغة النص التالي بشكل أوضح وأقوى:\n\n' },
    ] },
  },
  {
    id: 'planning', name: 'مساعد التخطيط', icon: 'calendar', desc: 'يحوّل الفكرة إلى خطوات وجدول زمني وأولويات واقعية.',
    hero: { title: 'مساعد التخطيط', sub: 'خلينا نحوّل الفكرة لخطة.', how: true, suggestions: [
      { icon: 'calendar', title: 'خطة مشروع', desc: 'مراحل وجدول زمني', fill: 'أريد التخطيط لمشروع: ' },
      { icon: 'check', title: 'ترتيب الأولويات', desc: 'شنو أسوي أول؟', fill: 'عندي هذه المهام، رتب لي أولوياتها:\n\n' },
      { icon: 'spark', title: 'هدف شخصي', desc: 'خطوات صغيرة قابلة للتنفيذ', fill: 'أريد تحقيق هدف: ' },
    ] },
  },
  {
    id: 'personal', name: 'المساعد الشخصي', icon: 'user', desc: 'سوالف وأفكار وقرارات يومية بأسلوب قريب ودافئ.',
    hero: { title: 'المساعد الشخصي', sub: 'احچي وياي، شنو براسك؟', how: false, suggestions: [
      { icon: 'chat', title: 'سولف وياي', desc: 'حديث حر', send: 'مرحبا، حابب نسولف شوية.' },
      { icon: 'spark', title: 'أحتاج فكرة', desc: 'عصف ذهني سريع', fill: 'أحتاج أفكاراً حول: ' },
      { icon: 'compass', title: 'ساعدني أقرر', desc: 'مقارنة الخيارات', fill: 'أنا محتار بين خيارين: ' },
    ] },
  },
];
const ASSISTANT_NAME = {
  general: 'المحادثة العامة', student: 'مساعد الطلاب', games: 'مرشد الألعاب',
  ...Object.fromEntries(ASSISTANT_CARDS.map((a) => [a.id, a.name])),
};

const THINK = {
  default: ['أفكر في سؤالك…', 'أحلل السياق…', 'أجهّز الإجابة…'],
  programming: ['أقرأ المشكلة…', 'أرتّب الحل خطوة بخطوة…', 'أجهّز الكود…'],
  study: ['أبسّط الفكرة…', 'أرتّب الشرح…', 'أجهّز الإجابة…'],
  student: ['أبسّط الفكرة…', 'أرتّب الشرح…', 'أجهّز الإجابة…'],
  gamer: ['أراجع الخيارات…', 'أقارن التفاصيل…', 'أجهّز الإجابة…'],
  games: ['أراجع الخيارات…', 'أقارن التفاصيل…', 'أجهّز الترشيح…'],
};

/* ==========================================================================
   الحالة
   ========================================================================== */
const state = {
  chats: [],
  current: null,
  view: 'chat', // chat | images | assistants | about
  query: '',
  pending: [], // مرفقات قبل الإرسال
  generating: null, // { chatId, msgId, controller, startedAt }
  health: null,
  healthFailed: false,
  config: null,
  lastMeta: null,
  stick: true,
};

const el = {
  app: $('#app'), sidebar: $('#sidebar'), backdrop: $('#backdrop'), nav: $('#nav'), bottomNav: $('#bottomNav'),
  historyList: $('#historyList'), historySearch: $('#historySearch'),
  thread: $('#thread'), hero: $('#hero'), messages: $('#messages'), jump: $('#jumpBtn'),
  viewTitle: $('#viewTitle'), viewSub: $('#viewSub'),
  composer: $('#composer'), input: $('#composerInput'), sendBtn: $('#sendBtn'), micBtn: $('#micBtn'),
  plusBtn: $('#plusBtn'), plusMenu: $('#plusMenu'), tray: $('#attachTray'), listenBar: $('#listenBar'),
  fileImage: $('#fileImage'), fileDoc: $('#fileDoc'),
  statusPill: $('#engineBtn'), statusText: $('#statusText'), enginePop: $('#enginePop'),
  toasts: $('#toasts'), sr: $('#srStatus'),
};
const views = { chat: $('#view-chat'), images: $('#view-images'), assistants: $('#view-assistants'), about: $('#view-about') };

/* ==========================================================================
   التخزين (المحادثات فقط — لا مفاتيح ولا بيانات حساسة)
   ========================================================================== */
function loadChats() {
  try {
    const arr = JSON.parse(localStorage.getItem(STORE_KEY) || '[]');
    if (!Array.isArray(arr)) return [];
    return arr
      .filter((c) => c && typeof c.id === 'string' && Array.isArray(c.messages))
      .map((c) => ({
        ...c,
        messages: c.messages.map((m) => (m.status === 'streaming' ? { ...m, status: 'stopped' } : m)),
      }));
  } catch {
    return [];
  }
}
function slimChats() {
  return state.chats.slice(0, MAX_CHATS).map((c) => ({
    id: c.id, title: c.title, section: c.section, assistant: c.assistant, createdAt: c.createdAt, updatedAt: c.updatedAt,
    messages: c.messages.map((m) => ({
      id: m.id, role: m.role, content: m.content, time: m.time,
      ...(m.attachments?.length ? { attachments: m.attachments } : {}),
      ...(m.meta ? { meta: m.meta } : {}),
      ...(m.status && m.status !== 'done' ? { status: m.status === 'streaming' ? 'stopped' : m.status } : {}),
      ...(m.error ? { error: m.error } : {}),
    })),
  }));
}
function persistNow() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(slimChats()));
  } catch {
    try {
      state.chats = state.chats.slice(0, Math.ceil(state.chats.length / 2));
      localStorage.setItem(STORE_KEY, JSON.stringify(slimChats()));
    } catch {
      /* التخزين ممتلئ أو معطّل — نكمل بدون حفظ */
    }
  }
}
let saveTimer;
const save = () => {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(persistNow, 350);
};
window.addEventListener('pagehide', persistNow);

/* ==========================================================================
   تنبيهات (Toast) وإعلانات القارئ الصوتي
   ========================================================================== */
function toast(text, kind = 'ok') {
  const t = document.createElement('div');
  t.className = `toast${kind === 'err' ? ' err' : ''}`;
  t.innerHTML = `${ic(kind === 'err' ? 'info' : 'check')}<span></span>`;
  $('span', t).textContent = text;
  el.toasts.appendChild(t);
  while (el.toasts.children.length > 3) el.toasts.firstChild.remove();
  setTimeout(() => {
    t.classList.add('out');
    setTimeout(() => t.remove(), 260);
  }, 2400);
}
function announce(text) {
  el.sr.textContent = '';
  setTimeout(() => (el.sr.textContent = text), 40);
}

function confirmDialog(text, yesLabel = 'تأكيد') {
  return new Promise((resolve) => {
    const dlg = $('#confirmDialog');
    $('#confirmText').textContent = text;
    $('#confirmYes').textContent = yesLabel;
    let result = false;
    const done = (v) => {
      result = v;
      dlg.close();
    };
    const yes = () => done(true);
    const no = () => done(false);
    $('#confirmYes').addEventListener('click', yes, { once: true });
    $('#confirmNo').addEventListener('click', no, { once: true });
    dlg.addEventListener(
      'close',
      () => {
        $('#confirmYes').removeEventListener('click', yes);
        $('#confirmNo').removeEventListener('click', no);
        resolve(result);
      },
      { once: true },
    );
    dlg.showModal();
    $('#confirmNo').focus();
  });
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;opacity:0;top:0;left:0';
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try {
      ok = document.execCommand('copy');
    } catch {
      ok = false;
    }
    ta.remove();
    return ok;
  }
}

/* ==========================================================================
   المحادثات: إنشاء وتنقل
   ========================================================================== */
function makeChat(section, assistant) {
  return { id: uid(), title: 'محادثة جديدة', section, assistant, createdAt: Date.now(), updatedAt: Date.now(), messages: [], draft: true };
}
const isGeneratingHere = () => !!state.generating && state.generating.chatId === state.current.id;

function heroConfig(chat) {
  if (chat.section === 'assistants') {
    const card = ASSISTANT_CARDS.find((a) => a.id === chat.assistant);
    if (card) return card.hero;
  }
  return (SECTION[chat.section] || SECTION.general).hero;
}

function chatTitles(chat) {
  if (chat.section === 'assistants') return { title: ASSISTANT_NAME[chat.assistant] || 'مساعد', sub: 'مساعد شخصي' };
  const s = SECTION[chat.section] || SECTION.general;
  return { title: s.label, sub: s.sub || ASSISTANT_NAME[chat.assistant] };
}

function setView(view) {
  state.view = view;
  for (const [k, node] of Object.entries(views)) node.hidden = k !== view;
  if (view === 'chat') {
    const t = chatTitles(state.current);
    el.viewTitle.textContent = t.title;
    el.viewSub.textContent = t.sub || '';
  } else {
    const map = { images: ['الصور', 'تحليل وتوليد'], assistants: ['المساعدون الشخصيون', 'اختر مساعدك'], about: ['حول العراق AI', ''] };
    el.viewTitle.textContent = map[view][0];
    el.viewSub.textContent = map[view][1];
  }
  renderNav();
  renderHistory();
  renderEngine();
  closeMenus();
  closeDrawer();
  if (view === 'images') refreshImagesView();
  if (view === 'chat' && !COARSE) setTimeout(() => el.input.focus({ preventScroll: true }), 30);
}

function openSection(id) {
  const sec = SECTION[id];
  if (!sec) return;
  if (sec.kind === 'images') return setView('images');
  if (sec.kind === 'assistants') return setView('assistants');
  const cur = state.current;
  const reuse = cur && cur.draft && cur.section === id && cur.assistant === sec.assistant;
  if (!reuse) state.current = makeChat(id, sec.assistant);
  renderChat();
  setView('chat');
}

function startAssistantChat(assistantId, section = 'assistants') {
  state.current = makeChat(section, assistantId);
  renderChat();
  setView('chat');
}

function openChat(id) {
  const chat = state.chats.find((c) => c.id === id);
  if (!chat) return;
  state.current = chat;
  renderChat();
  setView('chat');
}

function newChat() {
  const cur = state.current;
  if (state.view === 'chat' && cur && cur.draft) {
    // نفس القسم: فقط ركّز على الكتابة
    renderChat();
    return focusComposer(true);
  }
  const section = state.view === 'chat' && cur && SECTION[cur.section]?.kind === 'chat' ? cur.section : 'general';
  const sec = SECTION[section] || SECTION.general;
  state.current = cur?.section === 'assistants' && state.view === 'chat' ? makeChat('assistants', cur.assistant) : makeChat(section, sec.assistant);
  renderChat();
  setView('chat');
}

/* ==========================================================================
   رسم الشريط الجانبي والتنقل
   ========================================================================== */
function activeNavId() {
  if (state.view === 'chat') return state.current.section;
  if (state.view === 'images' || state.view === 'assistants') return state.view;
  return null;
}

function renderNav() {
  const active = activeNavId();
  el.nav.innerHTML = '';
  SECTIONS.forEach((s) => {
    if (s.id === 'images') el.nav.appendChild(Object.assign(document.createElement('div'), { className: 'nav-sep', role: 'separator' }));
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'nav-item';
    b.dataset.section = s.id;
    b.innerHTML = `${ic(s.icon)}<span>${esc(s.label)}</span>`;
    if (s.id === active) b.setAttribute('aria-current', 'page');
    b.addEventListener('click', () => openSection(s.id));
    el.nav.appendChild(b);
  });

  const quick = ['general', 'programming', 'study', 'games'];
  el.bottomNav.innerHTML = '';
  for (const id of quick) {
    const s = SECTION[id];
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'bn-item';
    b.innerHTML = `${ic(s.icon)}<span>${esc(s.short)}</span>`;
    if (id === active) b.setAttribute('aria-current', 'page');
    b.addEventListener('click', () => openSection(id));
    el.bottomNav.appendChild(b);
  }
  const more = document.createElement('button');
  more.type = 'button';
  more.className = 'bn-item';
  more.innerHTML = `${ic('more')}<span>المزيد</span>`;
  more.setAttribute('aria-label', 'المزيد من الأقسام');
  more.addEventListener('click', openDrawer);
  el.bottomNav.appendChild(more);
}

function renderHistory() {
  const q = state.query.trim().toLowerCase();
  const list = state.chats
    .filter((c) => !q || c.title.toLowerCase().includes(q) || c.messages.some((m) => m.content?.toLowerCase().includes(q)))
    .sort((a, b) => b.updatedAt - a.updatedAt);
  el.historyList.innerHTML = '';
  if (!list.length) {
    const li = document.createElement('li');
    li.className = 'hist-empty';
    li.textContent = q ? 'لا توجد نتائج مطابقة.' : 'لا توجد محادثات بعد. ابدأ أول محادثة!';
    el.historyList.appendChild(li);
    return;
  }
  for (const c of list) {
    const li = document.createElement('li');
    li.className = `hist-row${state.view === 'chat' && state.current.id === c.id ? ' active' : ''}`;
    const sub = c.section === 'assistants' ? ASSISTANT_NAME[c.assistant] : SECTION[c.section]?.label;
    li.innerHTML = `
      <button type="button" class="hist-item"><span class="hist-title"></span><span class="hist-sub"></span></button>
      <span class="hist-actions">
        <button type="button" class="icon-btn sm" data-act="rename" aria-label="إعادة تسمية المحادثة">${ic('edit')}</button>
        <button type="button" class="icon-btn sm" data-act="delete" aria-label="حذف المحادثة">${ic('trash')}</button>
      </span>`;
    $('.hist-title', li).textContent = c.title;
    $('.hist-sub', li).textContent = sub || '';
    $('.hist-item', li).addEventListener('click', () => openChat(c.id));
    $('[data-act="rename"]', li).addEventListener('click', () => startRename(li, c));
    $('[data-act="delete"]', li).addEventListener('click', () => deleteChat(c));
    el.historyList.appendChild(li);
  }
}

function startRename(li, chat) {
  const input = document.createElement('input');
  input.className = 'hist-edit';
  input.value = chat.title;
  input.maxLength = 80;
  input.setAttribute('aria-label', 'اسم المحادثة');
  li.innerHTML = '';
  li.appendChild(input);
  input.focus();
  input.select();
  let finished = false;
  const finish = (commit) => {
    if (finished) return;
    finished = true;
    const v = input.value.trim();
    if (commit && v) {
      chat.title = v;
      save();
    }
    renderHistory();
  };
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') finish(true);
    if (e.key === 'Escape') finish(false);
  });
  input.addEventListener('blur', () => finish(true));
}

async function deleteChat(chat) {
  const ok = await confirmDialog(`حذف المحادثة «${chat.title}»؟ لا يمكن التراجع عن ذلك.`, 'حذف');
  if (!ok) return;
  if (state.generating?.chatId === chat.id) stopGeneration();
  state.chats = state.chats.filter((c) => c.id !== chat.id);
  persistNow();
  if (state.current.id === chat.id) {
    const sec = SECTION[chat.section] || SECTION.general;
    state.current = makeChat(chat.section === 'assistants' ? 'assistants' : sec.id, chat.assistant);
    renderChat();
  }
  renderHistory();
  toast('تم حذف المحادثة');
}

async function clearAll() {
  if (!state.chats.length) return toast('لا توجد محادثات لمسحها.', 'err');
  const ok = await confirmDialog('مسح كل المحادثات المحفوظة؟ لا يمكن التراجع عن ذلك.', 'مسح الكل');
  if (!ok) return;
  if (state.generating) stopGeneration();
  state.chats = [];
  persistNow();
  state.current = makeChat('general', 'general');
  renderChat();
  setView('chat');
  toast('تم مسح كل المحادثات');
}

/* ==========================================================================
   رسم المحادثة
   ========================================================================== */
function renderChat() {
  const chat = state.current;
  renderHero();
  el.messages.innerHTML = '';
  for (const m of chat.messages) el.messages.appendChild(m.role === 'user' ? userMsgEl(m) : aiMsgEl(m));
  syncActions();
  updateComposerMode();
  renderTray();
  state.stick = true;
  scrollToBottom(true);
}

function renderHero() {
  const chat = state.current;
  const cfg = heroConfig(chat);
  el.hero.hidden = chat.messages.length > 0;
  if (el.hero.hidden) return;
  el.hero.innerHTML = `
    <svg class="hero-mark brand-mark" aria-hidden="true"><use href="#logo"/></svg>
    <h3 class="hero-title"></h3>
    <p class="hero-sub"></p>
    ${cfg.how ? '<p class="hero-how">كيف أساعدك اليوم؟</p>' : ''}
    <div class="sugg-grid"></div>`;
  $('.hero-title', el.hero).textContent = cfg.title;
  $('.hero-sub', el.hero).textContent = cfg.sub;
  const grid = $('.sugg-grid', el.hero);
  for (const s of cfg.suggestions) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'sugg card-glow';
    b.innerHTML = `<span class="sugg-ic">${ic(s.icon)}</span><span class="sugg-t"></span><span class="sugg-d"></span>`;
    $('.sugg-t', b).textContent = s.title;
    $('.sugg-d', b).textContent = s.desc || '';
    b.addEventListener('click', () => runSuggestion(s));
    grid.appendChild(b);
  }
}

function runSuggestion(s) {
  if (s.pick) {
    if (s.pick === 'image') return pickImage();
    if (s.pick === 'file') return pickDoc();
    if (s.pick === 'camera') return openCamera();
  }
  if (s.go) openSection(s.go);
  else if (s.assistant) startAssistantChat(s.assistant);
  if (s.send) return sendMessage(s.send);
  if (s.fill !== undefined) setComposerText(s.fill);
  focusComposer(true);
}

function userMsgEl(m) {
  const node = document.createElement('article');
  node.className = 'msg user';
  node.dataset.id = m.id;
  const bubble = document.createElement('div');
  bubble.className = 'bubble';
  if (m._thumbs?.length) {
    for (const src of m._thumbs) {
      const img = document.createElement('img');
      img.className = 'thumb';
      img.alt = 'صورة مرفقة';
      img.src = src;
      bubble.appendChild(img);
    }
  }
  const files = (m.attachments || []).filter((a) => !(a.kind === 'image' && m._thumbs?.length));
  if (files.length) {
    const wrap = document.createElement('div');
    wrap.className = 'attach-chips';
    for (const a of files) {
      const c = document.createElement('span');
      c.className = 'chip-file';
      c.innerHTML = `${ic(a.kind === 'image' ? 'image' : 'file')}<span></span>`;
      $('span', c).textContent = a.name;
      wrap.appendChild(c);
    }
    bubble.appendChild(wrap);
  }
  if (m.content) {
    const t = document.createElement('div');
    t.dir = 'auto';
    t.textContent = m.content;
    bubble.appendChild(t);
  }
  node.appendChild(bubble);
  return node;
}

function aiMsgEl(m) {
  const node = document.createElement('article');
  node.className = 'msg ai';
  node.dataset.id = m.id;
  node.innerHTML = `
    <div class="msg-head">
      <svg class="msg-avatar brand-mark" aria-hidden="true"><use href="#logo"/></svg>
      <span class="msg-name">العراق AI</span>
      <span class="chip" hidden></span>
    </div>
    <div class="msg-body">
      <div class="thinking" hidden><span class="orbit" aria-hidden="true"><i></i><i></i><i></i></span><span class="think-text"></span></div>
      <p class="msg-status" hidden></p>
      <div class="md" hidden></div>
      <p class="msg-stopped" hidden>تم إيقاف التوليد.</p>
      <div class="msg-error" hidden><p></p><button type="button" class="btn-soft retry-btn">${ic('refresh')}إعادة المحاولة</button></div>
    </div>
    <div class="msg-actions"></div>`;
  $('.retry-btn', node).addEventListener('click', () => regenerate());
  updateAi(m, node);
  return node;
}

function addCaret(md) {
  let last = md.lastElementChild;
  while (last && /^(UL|OL|LI|BLOCKQUOTE)$/.test(last.tagName) && last.lastElementChild) last = last.lastElementChild;
  if (!last || last.tagName === 'DIV' || last.tagName === 'PRE' || last.tagName === 'HR') return;
  const c = document.createElement('span');
  c.className = 'caret';
  last.appendChild(c);
}

function updateAi(m, node = $(`[data-id="${m.id}"]`, el.messages)) {
  if (!node) return;
  const streaming = m.status === 'streaming';
  const thinking = $('.thinking', node);
  const statusP = $('.msg-status', node);
  const md = $('.md', node);
  const chip = $('.chip', node);

  thinking.hidden = !(streaming && !m.content);
  if (!thinking.hidden && !$('.think-text', node).textContent) $('.think-text', node).textContent = thinkPhrases(state.current.assistant)[0];

  statusP.hidden = !(streaming && m.statusText && !m.content);
  if (!statusP.hidden) statusP.textContent = m.statusText;

  md.hidden = !m.content;
  if (m.content) {
    md.innerHTML = renderMarkdown(m.content);
    if (streaming) addCaret(md);
  }

  $('.msg-stopped', node).hidden = m.status !== 'stopped';
  const err = $('.msg-error', node);
  err.hidden = m.status !== 'error';
  if (!err.hidden) $('p', err).textContent = m.error || MSG.generic;

  if (m.meta) {
    chip.hidden = false;
    chip.textContent = `${m.meta.name} · ${shortModel(m.meta.model)}`;
    chip.title = 'المزود والنموذج الذي أنتج هذا الرد';
  }
}

let renderTimer = 0;
let dirty = new Set();
function queueRender(m) {
  dirty.add(m);
  if (renderTimer) return;
  renderTimer = setTimeout(() => {
    renderTimer = 0;
    const batch = dirty;
    dirty = new Set();
    for (const msg of batch) updateAi(msg);
    if (state.stick) scrollToBottom();
  }, 60);
}

function syncActions() {
  const chat = state.current;
  const lastId = chat.messages[chat.messages.length - 1]?.id;
  for (const m of chat.messages) {
    if (m.role !== 'assistant') continue;
    const node = $(`[data-id="${m.id}"]`, el.messages);
    if (!node) continue;
    const key = `${m.status}|${m.id === lastId}|${!!m.content}`;
    const box = $('.msg-actions', node);
    if (box.dataset.key === key) continue;
    box.dataset.key = key;
    box.innerHTML = '';
    const add = (icon, label, fn) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'act-btn';
      b.innerHTML = `${ic(icon)}<span>${label}</span>`;
      b.addEventListener('click', () => fn(b));
      box.appendChild(b);
    };
    if (m.status === 'streaming') {
      add('stop', 'إيقاف', () => stopGeneration());
      continue;
    }
    if (m.content) {
      add('copy', 'نسخ', async (b) => {
        const ok = await copyText(m.content);
        if (!ok) return toast('تعذر النسخ', 'err');
        b.classList.add('done');
        $('span', b).textContent = 'تم النسخ ✓';
        setTimeout(() => {
          b.classList.remove('done');
          $('span', b).textContent = 'نسخ';
        }, 1600);
      });
    }
    if (m.id === lastId && m.status !== 'error') add('refresh', 'إعادة توليد', () => regenerate());
    if (m.id === lastId && m.status === 'stopped') add('refresh', 'إعادة المحاولة', () => regenerate());
  }
}

const thinkPhrases = (a) => THINK[a] || THINK.default;
setInterval(() => {
  const nodes = $$('.think-text');
  if (!nodes.length) return;
  const list = thinkPhrases(state.current?.assistant);
  nodes.forEach((n) => {
    const i = (list.indexOf(n.textContent) + 1) % list.length;
    n.textContent = list[i];
  });
}, 2300);

/* ---------- التمرير ---------- */
function scrollToBottom(force = false) {
  const t = el.thread;
  t.scrollTo({ top: t.scrollHeight, behavior: 'instant' });
  if (force) el.jump.hidden = true;
}
el.thread.addEventListener(
  'scroll',
  () => {
    const dist = el.thread.scrollHeight - el.thread.scrollTop - el.thread.clientHeight;
    state.stick = dist < 90;
    el.jump.hidden = dist < 260 || state.current.messages.length === 0;
  },
  { passive: true },
);
el.jump.addEventListener('click', () => {
  state.stick = true;
  el.thread.scrollTo({ top: el.thread.scrollHeight, behavior: REDUCE ? 'instant' : 'smooth' });
});

/* ==========================================================================
   الإرسال والبث
   ========================================================================== */
function setComposerText(text) {
  el.input.value = text;
  autosize();
}
function focusComposer(end = false) {
  if (COARSE && !end) return;
  el.input.focus({ preventScroll: true });
  if (end) el.input.setSelectionRange(el.input.value.length, el.input.value.length);
}
function autosize() {
  el.input.style.height = 'auto';
  el.input.style.height = `${Math.min(el.input.scrollHeight, 200)}px`;
}

function updateComposerMode() {
  const stopping = isGeneratingHere();
  el.sendBtn.dataset.mode = stopping ? 'stop' : 'send';
  el.sendBtn.setAttribute('aria-label', stopping ? 'إيقاف التوليد' : 'إرسال');
  el.sendBtn.innerHTML = stopping ? `${ic('stop')}<span class="lbl">إيقاف التوليد</span>` : `${ic('up')}<span class="lbl">إرسال</span>`;
  el.thread.setAttribute('aria-busy', String(stopping));
}

function sendMessage(textOverride) {
  if (state.generating) {
    if (!isGeneratingHere()) toast('هناك رد قيد التوليد في محادثة أخرى. انتظر انتهاءه أو أوقفه أولاً.', 'err');
    return;
  }
  const content = (typeof textOverride === 'string' ? textOverride : el.input.value).trim();
  const files = state.pending.slice();
  if (!content && !files.length) return;

  const chat = state.current;
  if (chat.draft) {
    chat.draft = false;
    state.chats.unshift(chat);
  }
  const msg = {
    id: uid(), role: 'user', content, time: Date.now(),
    attachments: files.map((f) => ({ name: f.name, kind: f.kind })),
    _files: files.map(({ name, mime, data }) => ({ name, mime, data })),
    _thumbs: files.filter((f) => f.kind === 'image').map((f) => f.thumb),
  };
  chat.messages.push(msg);
  if (chat.messages.length === 1) chat.title = (content || files[0]?.name || 'محادثة جديدة').replace(/\s+/g, ' ').slice(0, 42);
  chat.updatedAt = Date.now();

  el.input.value = '';
  autosize();
  state.pending = [];
  renderTray();
  el.hero.hidden = true;
  el.messages.appendChild(userMsgEl(msg));
  renderHistory();
  state.stick = true;
  scrollToBottom(true);
  generate(chat);
}

function buildHistory(chat, uptoIndex) {
  const out = [];
  for (const m of chat.messages.slice(0, uptoIndex)) {
    if (!m.content?.trim()) continue;
    if (m.role === 'assistant' && m.status === 'error') continue;
    let content = m.content;
    if (m.role === 'user' && m.attachments?.length) content += `\n(مرفقات: ${m.attachments.map((a) => a.name).join('، ')})`;
    out.push({ role: m.role, content });
  }
  return out;
}

async function generate(chat) {
  let idx = -1;
  for (let i = chat.messages.length - 1; i >= 0; i--) {
    if (chat.messages[i].role === 'user') {
      idx = i;
      break;
    }
  }
  if (idx < 0) return;
  const userMsg = chat.messages[idx];
  const lostFiles = userMsg.attachments?.length && !userMsg._files?.length;
  const payload = {
    message: lostFiles ? `${userMsg.content}\n(ملاحظة: المرفقات السابقة غير متاحة بعد إعادة تحميل الصفحة.)` : userMsg.content,
    history: buildHistory(chat, idx),
    assistant: chat.assistant,
    attachments: userMsg._files || [],
  };

  const ai = { id: uid(), role: 'assistant', content: '', status: 'streaming', time: Date.now() };
  chat.messages.push(ai);
  const controller = new AbortController();
  state.generating = { chatId: chat.id, msgId: ai.id, controller, startedAt: performance.now() };
  if (state.current.id === chat.id) {
    el.messages.appendChild(aiMsgEl(ai));
    syncActions();
    updateComposerMode();
    scrollToBottom(true);
  }
  announce('جارٍ التفكير…');

  const apply = (ev) => {
    switch (ev.type) {
      case 'meta':
        ai.meta = { provider: ev.provider, name: ev.name, model: ev.model, firstTokenMs: ev.firstTokenMs };
        ai.statusText = '';
        state.lastMeta = { ...ai.meta, mode: chat.assistant };
        renderEngine();
        break;
      case 'status':
        ai.statusText = ev.message;
        break;
      case 'reset':
        ai.content = '';
        break;
      case 'delta':
        ai.content += ev.text;
        break;
      case 'done':
        ai.status = 'done';
        ai.meta = { ...(ai.meta || {}), totalMs: ev.totalMs };
        state.lastMeta = { ...ai.meta, mode: chat.assistant };
        break;
      case 'error':
        ai.status = 'error';
        ai.error = ev.message;
        break;
    }
    if (state.current.id === chat.id) queueRender(ai);
  };

  try {
    await streamChat(payload, controller.signal, apply);
    if (ai.status === 'streaming') ai.status = 'done';
  } catch (err) {
    if (err.name === 'AbortError') {
      ai.status = 'stopped';
    } else {
      ai.status = 'error';
      ai.error = err.message || MSG.generic;
    }
  } finally {
    if (renderTimer) {
      clearTimeout(renderTimer);
      renderTimer = 0;
      dirty = new Set();
    }
    chat.updatedAt = Date.now();
    state.generating = null;
    if (state.current.id === chat.id) {
      updateAi(ai);
      syncActions();
      updateComposerMode();
      if (state.stick) scrollToBottom();
    }
    renderHistory();
    renderEngine();
    save();
    refreshHealth();
    announce(ai.status === 'done' ? 'اكتملت الإجابة.' : ai.status === 'error' ? 'تعذر إكمال الإجابة.' : 'تم إيقاف التوليد.');
  }
}

async function streamChat(payload, signal, on) {
  let res;
  try {
    res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
      signal,
    });
  } catch (err) {
    if (err.name === 'AbortError') throw err;
    throw new Error(MSG.network);
  }
  if (!res.ok) {
    let msg = MSG.generic;
    try {
      const j = await res.json();
      if (j?.error) msg = j.error;
    } catch {
      /* تجاهل */
    }
    throw new Error(msg);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  let finished = false;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let idx;
      while ((idx = buf.indexOf('\n\n')) !== -1) {
        const block = buf.slice(0, idx);
        buf = buf.slice(idx + 2);
        for (const line of block.split('\n')) {
          if (!line.startsWith('data:')) continue;
          const json = safeParse(line.slice(5).trim());
          if (!json) continue;
          if (json.type === 'done' || json.type === 'error') finished = true;
          on(json);
        }
      }
    }
  } catch (err) {
    if (err.name === 'AbortError') throw err;
    if (!finished) throw new Error(MSG.interrupted);
  }
  if (!finished) throw new Error(MSG.interrupted);
}

function stopGeneration() {
  state.generating?.controller.abort();
}

function regenerate() {
  if (state.generating) return;
  const chat = state.current;
  const last = chat.messages[chat.messages.length - 1];
  if (!last || last.role !== 'assistant') return;
  chat.messages.pop();
  $(`[data-id="${last.id}"]`, el.messages)?.remove();
  generate(chat);
}

/* ==========================================================================
   المرفقات (صور / ملفات / كاميرا)
   ========================================================================== */
function pickImage() {
  el.fileImage.click();
}
function pickDoc() {
  el.fileDoc.click();
}

function readBase64(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1] || '');
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

async function compressImage(source, maxSide = 1800, quality = 0.9) {
  let bmp;
  if (source instanceof Blob) {
    try {
      bmp = await createImageBitmap(source, { imageOrientation: 'from-image' });
    } catch {
      bmp = await new Promise((resolve, reject) => {
        const url = URL.createObjectURL(source);
        const img = new Image();
        img.onload = () => {
          URL.revokeObjectURL(url);
          resolve(img);
        };
        img.onerror = () => {
          URL.revokeObjectURL(url);
          reject(new Error('decode'));
        };
        img.src = url;
      });
    }
  } else bmp = source;
  const w0 = bmp.width || bmp.videoWidth;
  const h0 = bmp.height || bmp.videoHeight;
  const scale = Math.min(1, maxSide / Math.max(w0, h0));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(w0 * scale));
  canvas.height = Math.max(1, Math.round(h0 * scale));
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  bmp.close?.();
  const blob = await new Promise((res) => canvas.toBlob(res, 'image/jpeg', quality));
  if (!blob) throw new Error('encode');
  const dataUrl = await new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
  return { data: dataUrl.split(',')[1], thumb: dataUrl, size: blob.size };
}

async function addFiles(fileList) {
  const files = [...fileList];
  for (const file of files) {
    if (state.pending.length >= MAX_FILES) {
      toast(`الحد الأقصى ${MAX_FILES} ملفات في الرسالة.`, 'err');
      break;
    }
    try {
      if (/^image\//.test(file.type)) {
        if (!/^image\/(jpeg|png|webp)$/.test(file.type)) {
          toast('الصور المدعومة: JPG وPNG وWEBP فقط.', 'err');
          continue;
        }
        const img = await compressImage(file);
        state.pending.push({ id: uid(), name: file.name || 'image.jpg', kind: 'image', mime: 'image/jpeg', ...img });
      } else {
        if (/\.doc$/i.test(file.name)) {
          toast('صيغة DOC القديمة غير مدعومة. احفظ الملف كـ DOCX أو PDF.', 'err');
          continue;
        }
        if (!DOC_EXT.test(file.name)) {
          toast(`نوع الملف «${file.name}» غير مدعوم. المدعوم: PDF وDOCX وTXT وملفات الكود والنصوص.`, 'err');
          continue;
        }
        if (file.size > MAX_DOC_BYTES) {
          toast(`الملف «${file.name}» كبير جداً (الحد 10 م.ب).`, 'err');
          continue;
        }
        const data = await readBase64(file);
        state.pending.push({ id: uid(), name: file.name, kind: 'file', mime: file.type || 'application/octet-stream', data, size: file.size });
      }
    } catch {
      toast(`تعذر قراءة «${file.name}». جرّب صيغة JPG أو PNG.`, 'err');
    }
  }
  renderTray();
  if (state.pending.length) focusComposer(true);
}

function renderTray() {
  el.tray.hidden = !state.pending.length;
  el.tray.innerHTML = '';
  for (const f of state.pending) {
    const chip = document.createElement('div');
    chip.className = 'att';
    chip.innerHTML = `${f.kind === 'image' ? `<img class="att-thumb" alt="">` : `<span class="att-ic">${ic('file')}</span>`}
      <span><span class="att-name"></span><br><span class="att-size"></span></span>
      <button type="button" class="icon-btn sm" aria-label="إزالة المرفق">${ic('close')}</button>`;
    if (f.kind === 'image') $('.att-thumb', chip).src = f.thumb;
    $('.att-name', chip).textContent = f.name;
    $('.att-size', chip).textContent = fmtSize(f.size);
    $('button', chip).addEventListener('click', () => {
      state.pending = state.pending.filter((x) => x.id !== f.id);
      renderTray();
    });
    el.tray.appendChild(chip);
  }
  el.input.placeholder = state.pending.some((f) => f.kind === 'image')
    ? 'اسأل عن الصورة، أو أرسلها مباشرة للتحليل...'
    : state.pending.length
      ? 'اسأل عن الملف، أو أرسله مباشرة لتلخيصه...'
      : 'اكتب رسالتك هنا...';
}

/* ---------- الكاميرا ---------- */
const cam = { dialog: $('#cameraDialog'), video: $('#camVideo'), err: $('#camError'), stream: null, facing: 'environment' };

function stopCam() {
  cam.stream?.getTracks().forEach((t) => t.stop());
  cam.stream = null;
  cam.video.srcObject = null;
}
async function startCam() {
  stopCam();
  cam.err.hidden = true;
  try {
    cam.stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: cam.facing }, width: { ideal: 1920 } },
      audio: false,
    });
    cam.video.srcObject = cam.stream;
    cam.video.classList.toggle('mirror', cam.facing === 'user');
    await cam.video.play().catch(() => {});
  } catch (err) {
    const name = err?.name;
    cam.err.hidden = false;
    cam.err.textContent =
      name === 'NotAllowedError' || name === 'PermissionDeniedError'
        ? 'تم رفض إذن الكاميرا. اسمح للموقع بالوصول إلى الكاميرا من إعدادات المتصفح ثم حاول مجدداً.'
        : name === 'NotFoundError' || name === 'OverconstrainedError'
          ? 'لا توجد كاميرا متاحة على هذا الجهاز.'
          : name === 'NotReadableError'
            ? 'الكاميرا مستخدمة من تطبيق آخر. أغلقه وحاول مجدداً.'
            : 'تعذر تشغيل الكاميرا.';
  }
}
async function openCamera() {
  closeMenus();
  if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
    return toast('الكاميرا تحتاج اتصالاً آمناً (HTTPS) أو الفتح عبر localhost.', 'err');
  }
  if (state.view !== 'chat') startChatFor('images');
  cam.dialog.showModal();
  await startCam();
}
function startChatFor(sectionId) {
  const sec = SECTION[sectionId];
  if (!(state.current.draft && state.current.section === sectionId)) state.current = makeChat(sectionId, sec.assistant);
  renderChat();
  setView('chat');
}
cam.dialog.addEventListener('close', stopCam);
$('#camClose').addEventListener('click', () => cam.dialog.close());
$('#camFlip').addEventListener('click', () => {
  cam.facing = cam.facing === 'environment' ? 'user' : 'environment';
  startCam();
});
$('#camShot').addEventListener('click', async () => {
  if (!cam.stream || !cam.video.videoWidth) return toast('الكاميرا غير جاهزة بعد.', 'err');
  try {
    const img = await compressImage(cam.video);
    state.pending.push({ id: uid(), name: `camera-${Date.now()}.jpg`, kind: 'image', mime: 'image/jpeg', ...img });
    renderTray();
    cam.dialog.close();
    focusComposer(true);
  } catch {
    toast('تعذر التقاط الصورة.', 'err');
  }
});

/* ==========================================================================
   الصوت (Web Speech API)
   ========================================================================== */
const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
const voice = { rec: null, on: false, base: '', finals: '', lang: 'ar-IQ', retried: false };

function setListening(on) {
  voice.on = on;
  el.micBtn.setAttribute('aria-pressed', String(on));
  el.micBtn.setAttribute('aria-label', on ? 'إيقاف الاستماع' : 'إدخال صوتي');
  el.listenBar.hidden = !on;
}
function startVoice() {
  if (!SpeechRec) return toast('المتصفح لا يدعم الإدخال الصوتي. جرّب Chrome أو Edge أو Safari.', 'err');
  if (!window.isSecureContext) return toast('الإدخال الصوتي يحتاج اتصالاً آمناً (HTTPS) أو الفتح عبر localhost.', 'err');
  const rec = new SpeechRec();
  rec.lang = voice.lang;
  rec.interimResults = true;
  rec.continuous = true;
  voice.rec = rec;
  voice.base = el.input.value && !/\s$/.test(el.input.value) ? `${el.input.value} ` : el.input.value;
  voice.finals = '';
  rec.onresult = (e) => {
    let interim = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const r = e.results[i];
      if (r.isFinal) voice.finals += r[0].transcript;
      else interim += r[0].transcript;
    }
    setComposerText(voice.base + voice.finals + interim);
  };
  rec.onerror = (e) => {
    const code = e.error;
    if (code === 'language-not-supported' && !voice.retried) {
      voice.retried = true;
      voice.lang = 'ar-SA';
      setTimeout(startVoice, 50);
      return;
    }
    const map = {
      'not-allowed': 'تم رفض إذن الميكروفون. اسمح للموقع باستخدامه من إعدادات المتصفح.',
      'service-not-allowed': 'خدمة التعرف على الصوت غير مسموحة في هذا المتصفح.',
      'no-speech': 'لم أسمع شيئاً. حاول مرة أخرى.',
      'audio-capture': 'لا يوجد ميكروفون متاح.',
      network: 'تعذر الاتصال بخدمة التعرف على الصوت. تحقق من الإنترنت.',
    };
    if (code !== 'aborted') toast(map[code] || 'تعذر الإدخال الصوتي.', 'err');
  };
  rec.onend = () => {
    setListening(false);
    focusComposer(true);
  };
  try {
    rec.start();
    setListening(true);
  } catch {
    setListening(false);
    toast('تعذر بدء الاستماع.', 'err');
  }
}
function stopVoice() {
  try {
    voice.rec?.stop();
  } catch {
    /* تجاهل */
  }
  setListening(false);
}
el.micBtn.addEventListener('click', () => (voice.on ? stopVoice() : startVoice()));
$('#stopListenBtn').addEventListener('click', stopVoice);

/* ==========================================================================
   قائمة + والنوافذ المنبثقة
   ========================================================================== */
function closeMenus() {
  if (!el.plusMenu.hidden) {
    el.plusMenu.hidden = true;
    el.plusBtn.setAttribute('aria-expanded', 'false');
  }
  if (!el.enginePop.hidden) {
    el.enginePop.hidden = true;
    el.statusPill.setAttribute('aria-expanded', 'false');
  }
}
el.plusBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  const open = el.plusMenu.hidden;
  closeMenus();
  if (open) {
    el.plusMenu.hidden = false;
    el.plusBtn.setAttribute('aria-expanded', 'true');
    $('button', el.plusMenu).focus();
  }
});
el.plusMenu.addEventListener('keydown', (e) => {
  const items = $$('button', el.plusMenu);
  const i = items.indexOf(document.activeElement);
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    items[(i + 1) % items.length].focus();
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    items[(i - 1 + items.length) % items.length].focus();
  }
});
$('#miCamera').addEventListener('click', openCamera);
$('#miImage').addEventListener('click', () => {
  closeMenus();
  pickImage();
});
$('#miFile').addEventListener('click', () => {
  closeMenus();
  pickDoc();
});
for (const input of [el.fileImage, el.fileDoc]) {
  input.addEventListener('change', async () => {
    const files = [...input.files];
    input.value = '';
    if (state.view !== 'chat') startChatFor('images');
    await addFiles(files);
  });
}
document.addEventListener('click', (e) => {
  if (!e.target.closest('.plus-wrap') && !e.target.closest('#enginePop') && !e.target.closest('#engineBtn')) closeMenus();
});

// سحب وإفلات الملفات
let dragDepth = 0;
document.addEventListener('dragover', (e) => {
  if (e.dataTransfer?.types?.includes('Files')) e.preventDefault();
});
document.addEventListener('drop', async (e) => {
  if (!e.dataTransfer?.files?.length) return;
  e.preventDefault();
  dragDepth = 0;
  if (state.view !== 'chat') startChatFor('images');
  await addFiles(e.dataTransfer.files);
});

// لصق صورة من الحافظة
el.input.addEventListener('paste', (e) => {
  const files = [...(e.clipboardData?.files || [])].filter((f) => /^image\//.test(f.type));
  if (files.length) {
    e.preventDefault();
    addFiles(files);
  }
});

/* ==========================================================================
   صندوق الكتابة
   ========================================================================== */
el.input.addEventListener('input', autosize);
el.input.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && !COARSE) {
    e.preventDefault();
    if (!isGeneratingHere()) sendMessage();
  }
});
el.composer.addEventListener('submit', (e) => {
  e.preventDefault();
  if (isGeneratingHere()) return stopGeneration();
  if (voice.on) stopVoice();
  sendMessage();
});
// أزرار الصندوق لا تسحب التركيز من حقل الكتابة: وإلا يتحرك التخطيط (يعود الشريط السفلي) قبل اكتمال النقرة على الهاتف
for (const b of [el.sendBtn, el.micBtn, el.plusBtn]) b.addEventListener('mousedown', (e) => e.preventDefault());
el.input.addEventListener('focus', () => COMPACT.matches && document.body.classList.add('kbd'));
el.input.addEventListener('blur', () => document.body.classList.remove('kbd'));

// ارتفاع صندوق الكتابة لموضع زر الانتقال
new ResizeObserver(() => {
  views.chat.style.setProperty('--composer-h', `${$('.composer-wrap', views.chat).offsetHeight}px`);
}).observe($('.composer-wrap', views.chat));

// الضغط على "/" يركّز الكتابة
document.addEventListener('keydown', (e) => {
  if (e.key === '/' && !/^(INPUT|TEXTAREA)$/.test(document.activeElement?.tagName) && state.view === 'chat') {
    e.preventDefault();
    focusComposer(true);
  }
  if (e.key === 'Escape') {
    closeMenus();
    closeDrawer();
    if (voice.on) stopVoice();
  }
});

// نسخ الكود
el.thread.addEventListener('click', async (e) => {
  const btn = e.target.closest('.code-copy');
  if (!btn) return;
  const code = $('code', btn.closest('.code-block')).textContent;
  const ok = await copyText(code);
  if (!ok) return toast('تعذر النسخ', 'err');
  const label = $('span', btn);
  btn.classList.add('done');
  label.textContent = 'تم النسخ ✓';
  toast('تم النسخ ✓');
  setTimeout(() => {
    btn.classList.remove('done');
    label.textContent = 'نسخ';
  }, 1600);
});

/* ==========================================================================
   القائمة الجانبية على الهاتف (Drawer) + السحب
   ========================================================================== */
let drawerOpener = null;
function openDrawer() {
  if (!COMPACT.matches) return;
  drawerOpener = document.activeElement;
  el.sidebar.classList.add('open');
  el.backdrop.hidden = false;
  $('#openDrawer').setAttribute('aria-expanded', 'true');
  setTimeout(() => $('#closeDrawer').focus(), 60);
}
function closeDrawer() {
  if (!el.sidebar.classList.contains('open')) return;
  el.sidebar.classList.remove('open');
  el.backdrop.hidden = true;
  $('#openDrawer').setAttribute('aria-expanded', 'false');
  drawerOpener?.focus?.({ preventScroll: true });
}
$('#openDrawer').addEventListener('click', openDrawer);
$('#closeDrawer').addEventListener('click', closeDrawer);
el.backdrop.addEventListener('click', closeDrawer);
COMPACT.addEventListener('change', () => {
  if (!COMPACT.matches) closeDrawer();
});
el.sidebar.addEventListener('keydown', (e) => {
  if (e.key !== 'Tab' || !el.sidebar.classList.contains('open')) return;
  const f = $$('button, input, [href]', el.sidebar).filter((n) => !n.disabled && n.offsetParent !== null);
  if (!f.length) return;
  if (e.shiftKey && document.activeElement === f[0]) {
    e.preventDefault();
    f[f.length - 1].focus();
  } else if (!e.shiftKey && document.activeElement === f[f.length - 1]) {
    e.preventDefault();
    f[0].focus();
  }
});

let touch = null;
document.addEventListener(
  'touchstart',
  (e) => {
    const t = e.touches[0];
    touch = { x: t.clientX, y: t.clientY };
  },
  { passive: true },
);
document.addEventListener(
  'touchend',
  (e) => {
    if (!touch || !COMPACT.matches) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - touch.x;
    const dy = t.clientY - touch.y;
    const open = el.sidebar.classList.contains('open');
    if (Math.abs(dx) > 70 && Math.abs(dy) < 50) {
      // الواجهة RTL: القائمة تأتي من اليمين
      if (!open && touch.x > innerWidth - 32 && dx < 0) openDrawer();
      else if (open && dx > 0) closeDrawer();
    }
    touch = null;
  },
  { passive: true },
);

/* ==========================================================================
   الصحة وحالة المحرك
   ========================================================================== */
async function refreshHealth() {
  try {
    const r = await fetch('/api/health', { cache: 'no-store' });
    if (!r.ok) throw new Error('health');
    state.health = await r.json();
    state.healthFailed = false;
  } catch {
    state.health = null;
    state.healthFailed = true;
  }
  renderStatus();
  renderEngine();
  if (state.view === 'images') refreshImagesView();
}

function renderStatus() {
  const h = state.health;
  let s = 'off';
  let text = 'الخادم غير متصل';
  if (h) {
    if (!h.online) {
      text = 'غير مفعّل: لا توجد مفاتيح';
    } else if (h.ready === 0) {
      s = 'warn';
      text = 'المساعد مشغول حالياً';
    } else if (h.ready < h.configured) {
      s = 'ok';
      text = 'العراق AI جاهز';
    } else {
      s = 'ok';
      text = 'العراق AI جاهز';
    }
  }
  el.statusPill.dataset.state = s;
  el.statusText.textContent = text;
}

function renderEngine() {
  const m = state.lastMeta;
  $('#engProvider').textContent = m?.name || '—';
  $('#engModel').textContent = m?.model ? shortModel(m.model) : '—';
  $('#engModel').title = m?.model || '';
  $('#engSpeed').textContent = m?.firstTokenMs != null ? `${fmtSec(m.firstTokenMs)}${m.totalMs ? ` · ${fmtSec(m.totalMs)}` : ''}` : '—';
  $('#engMode').textContent = m?.mode ? ASSISTANT_NAME[m.mode] || '—' : ASSISTANT_NAME[state.current?.assistant] || '—';

  const list = $('#engProviders');
  list.innerHTML = '';
  for (const p of state.health?.providers || []) {
    const li = document.createElement('li');
    li.className = `eng-item ${p.status}`;
    const mark = p.status === 'ready' ? '✓' : p.status === 'cooling' ? '⏳' : '—';
    li.innerHTML = `<i class="pdot"></i><span></span><span class="eng-mark">${mark}</span>`;
    $('span', li).textContent = p.name;
    li.title = p.status === 'ready' ? 'جاهز' : p.status === 'cooling' ? `يهدأ مؤقتاً (${p.cooldownSeconds} ث)` : 'لا يوجد مفتاح';
    list.appendChild(li);
  }
}

el.statusPill.addEventListener('click', (e) => {
  e.stopPropagation();
  const open = el.enginePop.hidden;
  closeMenus();
  if (open) {
    el.enginePop.hidden = false;
    el.statusPill.setAttribute('aria-expanded', 'true');
    renderEngine();
    refreshHealth();
  }
});

/* ==========================================================================
   صفحات: الصور / المساعدون / حول
   ========================================================================== */
function buildAssistantGrid() {
  const grid = $('#assistantGrid');
  grid.innerHTML = '';
  for (const a of ASSISTANT_CARDS) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'asst card-glow';
    b.innerHTML = `<span class="panel-ic">${ic(a.icon)}</span><h3></h3><p></p><span class="go">ابدأ المحادثة ${ic('arrow')}</span>`;
    $('h3', b).textContent = a.name;
    $('p', b).textContent = a.desc;
    b.addEventListener('click', () => startAssistantChat(a.id));
    grid.appendChild(b);
  }
}

function refreshImagesView() {
  const vision = state.health?.providers?.some((p) => p.vision && p.status !== 'missing');
  $('#visionNote').textContent = state.health
    ? vision
      ? 'يتم التحليل فعلياً بواسطة مزود يدعم الرؤية.'
      : 'تحليل الصور يحتاج مزوداً يدعم الرؤية، ولا يوجد مزود مفعّل حالياً.'
    : '';
  const g = state.config?.imageGeneration;
  const enabled = !!g?.enabled;
  $('#genState').textContent = g ? (enabled ? `الخدمة متاحة عبر: ${g.providers.map((p) => p.name).join('، ')}` : g.message || 'توليد الصور غير مفعّل حالياً.') : 'جارٍ التحقق من توفر الخدمة…';
  $('#genPrompt').disabled = !enabled;
  $('#genBtn').disabled = !enabled;
}

$('#imgUploadBtn').addEventListener('click', () => {
  startChatFor('images');
  pickImage();
});
$('#imgCameraBtn').addEventListener('click', openCamera);
$('#genForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const prompt = $('#genPrompt').value.trim();
  if (!prompt) return;
  const out = $('#genResult');
  const btn = $('#genBtn');
  btn.disabled = true;
  out.hidden = false;
  out.textContent = 'جارٍ التوليد…';
  try {
    const r = await fetch('/api/images', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ prompt }) });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || MSG.generic);
    out.innerHTML = '';
    const img = new Image();
    img.alt = prompt;
    img.src = `data:${j.mime};base64,${j.data}`;
    out.appendChild(img);
  } catch (err) {
    out.textContent = err.message || MSG.generic;
  } finally {
    btn.disabled = false;
  }
});

/* ==========================================================================
   أحداث عامة وتفاعلات دقيقة
   ========================================================================== */
$('#newChatBtn').addEventListener('click', newChat);
$('#brandHome').addEventListener('click', () => openSection('general'));
$('#aboutBtn').addEventListener('click', () => setView('about'));
$('#clearAllBtn').addEventListener('click', clearAll);
el.historySearch.addEventListener('input', () => {
  state.query = el.historySearch.value;
  renderHistory();
});

// إضاءة تتبع المؤشر على البطاقات (ماوس فقط)
if (HOVER) {
  document.addEventListener(
    'pointermove',
    (e) => {
      if (e.pointerType !== 'mouse') return;
      const card = e.target.closest?.('.card-glow');
      if (!card) return;
      const r = card.getBoundingClientRect();
      card.style.setProperty('--mx', `${e.clientX - r.left}px`);
      card.style.setProperty('--my', `${e.clientY - r.top}px`);
    },
    { passive: true },
  );
  // خلفية تتأثر بحركة الماوس بشكل بسيط
  if (!REDUCE) {
    let raf = 0;
    let px = 0;
    let py = 0;
    document.addEventListener(
      'pointermove',
      (e) => {
        if (e.pointerType !== 'mouse') return;
        px = (e.clientX / innerWidth - 0.5) * 2;
        py = (e.clientY / innerHeight - 0.5) * 2;
        if (!raf)
          raf = requestAnimationFrame(() => {
            raf = 0;
            el.app.style.setProperty('--px', px.toFixed(3));
            el.app.style.setProperty('--py', py.toFixed(3));
          });
      },
      { passive: true },
    );
  }
}

/* ==========================================================================
   التشغيل
   ========================================================================== */
function showApp(animate) {
  el.app.hidden = false;
  document.body.classList.remove('is-splash');
  if (animate && !REDUCE) {
    el.app.classList.add('app-enter');
    setTimeout(() => el.app.classList.remove('app-enter'), 700);
  }
  if (!COARSE) setTimeout(() => el.input.focus({ preventScroll: true }), 80);
}

async function loadConfig() {
  try {
    const r = await fetch('/api/config', { cache: 'no-store' });
    if (r.ok) state.config = await r.json();
  } catch {
    /* يبقى null */
  }
  if (state.view === 'images') refreshImagesView();
}

function init() {
  state.chats = loadChats();
  state.current = makeChat('general', 'general');
  buildAssistantGrid();
  renderNav();
  renderHistory();
  renderChat();
  setView('chat');
  refreshHealth();
  loadConfig();
  setInterval(() => !document.hidden && refreshHealth(), 30_000);
  document.addEventListener('visibilitychange', () => !document.hidden && refreshHealth());

  // ?nosplash للتطوير والاختبار فقط؛ الافتراضي هو عرض شاشة البداية دائماً
  if (new URLSearchParams(location.search).has('nosplash')) {
    $('#splash')?.remove();
    showApp(false);
  } else {
    runSplash(() => showApp(true));
  }
}

init();
