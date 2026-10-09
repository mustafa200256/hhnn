// شاشة البداية التفاعلية: شبكة نقاط في Canvas، رموز برمجية عائمة، تتبّع الماوس/اللمس، وتسلسل ظهور للنصوص.
// خفيفة على المعالج: Canvas واحد، حد أقصى للنقاط، تتوقف عند إخفاء التبويب أو دخول التطبيق.

const REDUCE = matchMedia('(prefers-reduced-motion: reduce)').matches;
const GLYPHS = ['</>', '{ }', 'AI', '01', '10', '( )', '=>', '[ ]', '#', 'λ', '∑', '&&', '0x'];
const STEP_TIMES = [150, 600, 1050, 1700, 2600, 3000]; // ms لكل خطوة data-step

export function runSplash(onEnter) {
  const splash = document.getElementById('splash');
  const canvas = document.getElementById('splashCanvas');
  const glyphLayer = document.getElementById('glyphLayer');
  const startBtn = document.getElementById('startBtn');
  const tagline = document.getElementById('tagline');

  // ---------- تسلسل ظهور النصوص ----------
  // نقسم الجملة إلى كلمات (وليس حروفاً) حتى لا يتكسر وصل الحروف العربية.
  const taglineText = tagline.textContent.trim();
  tagline.setAttribute('aria-label', taglineText);
  tagline.textContent = '';
  taglineText.split(/\s+/).forEach((word, i, arr) => {
    const w = document.createElement('span');
    w.className = 'w';
    w.setAttribute('aria-hidden', 'true');
    w.style.transitionDelay = `${i * 75}ms`;
    w.textContent = word;
    tagline.appendChild(w);
    if (i < arr.length - 1) tagline.appendChild(document.createTextNode(' '));
  });

  const stepEls = [...splash.querySelectorAll('[data-step]')];
  const byStep = (n) => stepEls.filter((el) => Number(el.dataset.step) === n);
  let timers = [];
  let allShown = false;
  let entered = false;

  startBtn.disabled = true;

  function show(n) {
    byStep(n).forEach((el) => el.classList.add('in'));
    if (n === 5) {
      startBtn.disabled = false;
      startBtn.focus({ preventScroll: true });
      allShown = true;
    }
  }

  function fastForward() {
    timers.forEach(clearTimeout);
    timers = [];
    for (let n = 0; n <= 5; n++) show(n);
  }

  if (REDUCE) fastForward();
  else STEP_TIMES.forEach((t, n) => timers.push(setTimeout(() => show(n), t)));

  // اضغط في أي مكان (أو أي مفتاح) لإظهار كل شيء فوراً
  splash.addEventListener('pointerdown', (e) => {
    if (!allShown && !e.target.closest('#startBtn')) fastForward();
  });
  document.addEventListener('keydown', onKey);
  function onKey(e) {
    if (entered) return;
    if (!allShown) {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'Escape') {
        e.preventDefault();
        fastForward();
      }
    } else if (e.key === 'Enter' && document.activeElement !== startBtn) {
      enter();
    }
  }

  // ---------- الرموز العائمة ----------
  const glyphCount = innerWidth < 600 ? 10 : 16;
  for (let i = 0; i < glyphCount; i++) {
    let x;
    let y;
    do {
      x = Math.random() * 100;
      y = Math.random() * 100;
    } while (Math.hypot(x - 50, (y - 50) * 1.3) < 24); // لا تغطي منتصف الشاشة
    const depth = 0.4 + Math.random() * 1.2;
    const outer = document.createElement('span');
    outer.className = 'glyph';
    outer.style.left = `${x}%`;
    outer.style.top = `${y}%`;
    outer.style.setProperty('--d', depth.toFixed(2));
    const inner = document.createElement('i');
    inner.textContent = GLYPHS[i % GLYPHS.length];
    inner.style.fontSize = `${12 + Math.random() * 14}px`;
    inner.style.opacity = (0.1 + Math.random() * 0.2).toFixed(2);
    inner.style.animationDuration = `${9 + Math.random() * 9}s`;
    inner.style.animationDelay = `${-Math.random() * 12}s`;
    if (Math.random() < 0.18) inner.classList.add('hot');
    outer.appendChild(inner);
    glyphLayer.appendChild(outer);
  }

  // ---------- تتبع المؤشر (ماوس / لمس) ----------
  const pointer = { x: -9999, y: -9999 };
  let pRaf = 0;
  let pendingMove = null;
  function applyMove() {
    pRaf = 0;
    if (!pendingMove) return;
    const { x, y } = pendingMove;
    const nx = (x / innerWidth - 0.5) * 2;
    const ny = (y / innerHeight - 0.5) * 2;
    glyphLayer.style.setProperty('--mx', nx.toFixed(3));
    glyphLayer.style.setProperty('--my', ny.toFixed(3));
    splash.style.setProperty('--gx', `${x}px`);
    splash.style.setProperty('--gy', `${y}px`);
  }
  splash.addEventListener('pointermove', (e) => {
    pointer.x = e.clientX;
    pointer.y = e.clientY;
    if (REDUCE) return;
    pendingMove = { x: e.clientX, y: e.clientY };
    if (!pRaf) pRaf = requestAnimationFrame(applyMove);
  });
  splash.addEventListener('pointerleave', () => {
    pointer.x = pointer.y = -9999;
  });
  splash.addEventListener('pointerup', (e) => {
    if (e.pointerType === 'touch') setTimeout(() => (pointer.x = pointer.y = -9999), 500);
  });
  splash.addEventListener('pointerdown', (e) => {
    pointer.x = e.clientX;
    pointer.y = e.clientY;
    if (REDUCE || e.target.closest('#startBtn')) return;
    const ripple = document.createElement('span');
    ripple.className = 'ripple';
    ripple.style.left = `${e.clientX}px`;
    ripple.style.top = `${e.clientY}px`;
    splash.appendChild(ripple);
    setTimeout(() => ripple.remove(), 800);
  });

  // ---------- شبكة النقاط (Canvas) ----------
  const ctx = canvas.getContext('2d');
  let w = 0;
  let h = 0;
  let nodes = [];
  let raf = 0;
  let last = 0;

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    w = innerWidth;
    h = innerHeight;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const count = Math.max(22, Math.min(78, Math.round((w * h) / 17000)));
    nodes = Array.from({ length: count }, () => ({
      x: Math.random() * w,
      y: Math.random() * h,
      vx: (Math.random() - 0.5) * 0.28,
      vy: (Math.random() - 0.5) * 0.28,
      r: 1 + Math.random() * 1.4,
      teal: Math.random() < 0.12,
    }));
    if (REDUCE) draw(0);
  }

  const LINK = 125;
  function draw(dt) {
    ctx.clearRect(0, 0, w, h);
    const step = Math.min(dt / 16.7, 3);
    for (const n of nodes) {
      const dx = pointer.x - n.x;
      const dy = pointer.y - n.y;
      const d2 = dx * dx + dy * dy;
      if (d2 < 170 * 170 && d2 > 1) {
        const d = Math.sqrt(d2);
        n.vx += (dx / d) * 0.012 * step;
        n.vy += (dy / d) * 0.012 * step;
      }
      n.vx *= 0.995;
      n.vy *= 0.995;
      const sp = Math.hypot(n.vx, n.vy);
      if (sp > 0.9) {
        n.vx = (n.vx / sp) * 0.9;
        n.vy = (n.vy / sp) * 0.9;
      }
      n.x += n.vx * step;
      n.y += n.vy * step;
      if (n.x < -10) n.x = w + 10;
      else if (n.x > w + 10) n.x = -10;
      if (n.y < -10) n.y = h + 10;
      else if (n.y > h + 10) n.y = -10;
    }
    ctx.lineWidth = 1;
    for (let i = 0; i < nodes.length; i++) {
      const a = nodes[i];
      for (let j = i + 1; j < nodes.length; j++) {
        const b = nodes[j];
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < LINK * LINK) {
          const alpha = (1 - Math.sqrt(d2) / LINK) * 0.22;
          ctx.strokeStyle = `rgba(240,178,75,${alpha.toFixed(3)})`;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        }
      }
      const px = pointer.x - a.x;
      const py = pointer.y - a.y;
      const pd2 = px * px + py * py;
      if (pd2 < 150 * 150) {
        const alpha = (1 - Math.sqrt(pd2) / 150) * 0.35;
        ctx.strokeStyle = `rgba(90,214,196,${alpha.toFixed(3)})`;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(pointer.x, pointer.y);
        ctx.stroke();
      }
    }
    for (const n of nodes) {
      ctx.fillStyle = n.teal ? 'rgba(90,214,196,0.7)' : 'rgba(240,178,75,0.6)';
      ctx.beginPath();
      ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function loop(ts) {
    const dt = last ? ts - last : 16.7;
    last = ts;
    draw(dt);
    raf = requestAnimationFrame(loop);
  }
  function start() {
    if (REDUCE || raf) return;
    last = 0;
    raf = requestAnimationFrame(loop);
  }
  function stop() {
    cancelAnimationFrame(raf);
    raf = 0;
  }
  const onVis = () => (document.hidden ? stop() : !entered && start());
  document.addEventListener('visibilitychange', onVis);
  let resizeTimer;
  const onResize = () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(resize, 150);
  };
  window.addEventListener('resize', onResize);

  resize();
  start();

  // ---------- الدخول إلى الموقع ----------
  function enter() {
    if (entered || startBtn.disabled) return;
    entered = true;
    timers.forEach(clearTimeout);
    document.removeEventListener('keydown', onKey);
    splash.classList.add('leaving'); // Fade + Scale + Blur خفيف
    onEnter(); // يعرض التطبيق مع حركة دخول
    setTimeout(() => {
      stop();
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('resize', onResize);
      cancelAnimationFrame(pRaf);
      splash.remove();
    }, 620);
  }
  startBtn.addEventListener('click', enter);
}
