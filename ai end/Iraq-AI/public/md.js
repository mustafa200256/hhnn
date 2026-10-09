// عارض Markdown خفيف وآمن (يهرّب HTML دائماً) + تلوين كود بسيط.
// يدعم: عناوين، قوائم (متداخلة)، جداول، اقتباسات، روابط، كتل كود، تأكيد ومائل وشطب.

const esc = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const unesc = (s) => s.replace(/&quot;/g, '"').replace(/&gt;/g, '>').replace(/&lt;/g, '<').replace(/&amp;/g, '&');

const LI = /^(\s*)([-*+]|\d{1,9}[.)])\s+(.*)$/;
const FENCE = /^\s{0,3}(`{3,}|~{3,})\s*([\w+#.-]*)[^\n]*$/;
const TABLE_SEP = /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/;

// ---------- تلوين الكود ----------

const KEYWORDS = new Set(
  ('abstract and as assert async await bool boolean break byte case catch char class const continue def default ' +
    'defer del delete do double elif else enum except export extends false final finally float fn for foreach from ' +
    'func function go goto if implements import in instanceof int interface is lambda let long match module ' +
    'namespace new nil none null not of or override package pass print private protected public pub raise ' +
    'readonly return select self short signed static string struct super switch this throw throws trait true try ' +
    'type typeof union unsafe unsigned use using var virtual void volatile when where while with yield ' +
    'True False None').split(' '),
);

const HASH_COMMENT = new Set(['python', 'py', 'bash', 'sh', 'shell', 'zsh', 'yaml', 'yml', 'ruby', 'rb', 'toml', 'ini', 'dockerfile', 'r', 'perl', 'powershell', 'ps1', 'makefile', 'env', 'conf']);
const DASH_COMMENT = new Set(['sql', 'lua', 'haskell', 'hs']);
const MARKUP = new Set(['html', 'xml', 'svg', 'xhtml', 'vue']);

function span(cls, text) {
  return `<span class="tk-${cls}">${esc(text)}</span>`;
}

function highlightMarkup(code) {
  const re = /<!--[\s\S]*?(?:-->|$)|<\/?[A-Za-z][\w:-]*|\/?>|[\w:@.-]+(?==)|"[^"]*"?|'[^']*'?/g;
  let out = '';
  let last = 0;
  let m;
  while ((m = re.exec(code))) {
    out += esc(code.slice(last, m.index));
    const t = m[0];
    if (t.startsWith('<!--')) out += span('c', t);
    else if (t[0] === '<' || t === '>' || t === '/>') out += span('t', t);
    else if (t[0] === '"' || t[0] === "'") out += span('s', t);
    else out += span('a', t);
    last = m.index + t.length;
  }
  return out + esc(code.slice(last));
}

function highlightGeneric(code, lang) {
  const parts = [
    String.raw`\/\/[^\n]*`,
    String.raw`\/\*[\s\S]*?(?:\*\/|$)`,
  ];
  if (HASH_COMMENT.has(lang)) parts.unshift(String.raw`#[^\n]*`);
  if (DASH_COMMENT.has(lang)) parts.unshift(String.raw`--[^\n]*`);
  parts.push(
    String.raw`"(?:\\.|[^"\\\n])*"?`,
    String.raw`'(?:\\.|[^'\\\n])*'?`,
    String.raw`\x60(?:\\[\s\S]|[^\x60\\])*\x60?`,
    String.raw`\b0x[0-9a-fA-F]+\b|\b\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\b`,
    String.raw`[A-Za-z_$][\w$]*`,
  );
  const re = new RegExp(parts.join('|'), 'g');
  let out = '';
  let last = 0;
  let m;
  while ((m = re.exec(code))) {
    out += esc(code.slice(last, m.index));
    const t = m[0];
    const c = t[0];
    let cls = null;
    if ((c === '/' && (t[1] === '/' || t[1] === '*')) || (c === '#' && HASH_COMMENT.has(lang)) || (c === '-' && DASH_COMMENT.has(lang))) cls = 'c';
    else if (c === '"' || c === "'" || c === '`') {
      const after = code.slice(m.index + t.length).match(/^\s*:/);
      cls = lang === 'json' && after && c === '"' ? 'a' : 's';
    } else if (/\d/.test(c)) cls = 'n';
    else if (KEYWORDS.has(t)) cls = 'k';
    else if (code[m.index + t.length] === '(') cls = 'f';
    else if (/^[A-Z][a-z]/.test(t)) cls = 't';
    out += cls ? span(cls, t) : esc(t);
    last = m.index + t.length;
  }
  return out + esc(code.slice(last));
}

export function highlight(code, lang = '') {
  const l = lang.toLowerCase();
  if (code.length > 40_000) return esc(code);
  try {
    return MARKUP.has(l) ? highlightMarkup(code) : highlightGeneric(code, l);
  } catch {
    return esc(code);
  }
}

function codeBlock(code, lang) {
  const l = (lang || '').toLowerCase();
  return (
    `<div class="code-block"><div class="code-head"><span class="code-lang" dir="ltr">${esc(l || 'code')}</span>` +
    `<button type="button" class="code-copy" aria-label="نسخ الكود"><svg class="ic" aria-hidden="true"><use href="#i-copy"/></svg><span>نسخ</span></button></div>` +
    `<pre dir="ltr" tabindex="0"><code>${highlight(code, l)}</code></pre></div>`
  );
}

// ---------- Inline ----------

function safeUrl(url) {
  return /^(https?:\/\/|mailto:)/i.test(url.trim());
}

function inline(text) {
  const frags = [];
  const stash = (html) => `\u0001${frags.push(html) - 1}\u0001`;
  let s = String(text).replace(/[\u0000\u0001]/g, '');

  // أكواد مضمّنة
  s = s.replace(/(`+)([\s\S]*?[^`])\1(?!`)/g, (_, __, c) => {
    const body = c.length > 1 && c.startsWith(' ') && c.endsWith(' ') ? c.slice(1, -1) : c;
    return stash(`<code>${esc(body)}</code>`);
  });

  s = esc(s);

  // روابط [نص](url)
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)(?:\s+&quot;[^&]*?&quot;)?\)/g, (m, label, url) => {
    if (!safeUrl(unesc(url))) return label;
    return stash(`<a href="${url}" target="_blank" rel="noopener noreferrer">${label}</a>`);
  });

  // روابط مجردة
  s = s.replace(/(^|[\s(])(https?:\/\/[^\s<]*[^\s<).,;:!?'"،؛])/g, (m, pre, url) =>
    `${pre}${stash(`<a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>`)}`);

  s = s.replace(/\*\*(?=\S)([\s\S]*?\S)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/__(?=\S)([\s\S]*?\S)__/g, '<strong>$1</strong>');
  s = s.replace(/(^|[^*\w])\*(?=[^\s*])([^*\n]*?[^\s*])\*(?!\*)/g, '$1<em>$2</em>');
  s = s.replace(/~~(?=\S)([\s\S]*?\S)~~/g, '<del>$1</del>');

  return s.replace(/\u0001(\d+)\u0001/g, (_, i) => frags[Number(i)]);
}

// ---------- Blocks ----------

function isBlockStart(line) {
  return (
    FENCE.test(line) ||
    /^(#{1,6})\s+/.test(line) ||
    /^\s{0,3}>/.test(line) ||
    LI.test(line) ||
    /^\s{0,3}([-*_])(\s*\1){2,}\s*$/.test(line)
  );
}

function splitRow(line) {
  let t = line.trim();
  if (t.startsWith('|')) t = t.slice(1);
  if (t.endsWith('|') && !t.endsWith('\\|')) t = t.slice(0, -1);
  return t.split(/(?<!\\)\|/).map((c) => c.trim().replace(/\\\|/g, '|'));
}

function parseTable(lines, i) {
  const head = splitRow(lines[i]);
  const aligns = splitRow(lines[i + 1]).map((c) => {
    const l = c.startsWith(':');
    const r = c.endsWith(':');
    return l && r ? 'center' : r ? 'right' : l ? 'left' : '';
  });
  i += 2;
  const rows = [];
  while (i < lines.length && lines[i].trim() && lines[i].includes('|')) {
    rows.push(splitRow(lines[i]));
    i++;
  }
  const cell = (tag, c, idx) =>
    `<${tag}${aligns[idx] ? ` style="text-align:${aligns[idx]}"` : ''}>${inline(c)}</${tag}>`;
  const html =
    `<div class="table-wrap" tabindex="0"><table><thead><tr>${head.map((c, k) => cell('th', c, k)).join('')}</tr></thead>` +
    `<tbody>${rows.map((r) => `<tr>${head.map((_, k) => cell('td', r[k] ?? '', k)).join('')}</tr>`).join('')}</tbody></table></div>`;
  return { html, next: i };
}

function parseList(lines, i) {
  const first = lines[i].match(LI);
  const baseIndent = first[1].length;
  const ordered = /\d/.test(first[2]);
  const start = ordered ? parseInt(first[2], 10) : 1;
  const items = [];

  while (i < lines.length) {
    const mm = lines[i].match(LI);
    if (!mm || mm[1].length !== baseIndent || /\d/.test(mm[2]) !== ordered) break;
    const content = [mm[3]];
    let children = '';
    i++;
    while (i < lines.length) {
      const l = lines[i];
      if (!l.trim()) {
        let j = i + 1;
        while (j < lines.length && !lines[j].trim()) j++;
        const nxt = lines[j];
        if (nxt !== undefined && ((LI.test(nxt) && nxt.match(LI)[1].length >= baseIndent) || /^\s{2,}\S/.test(nxt))) {
          i = j;
          continue;
        }
        break;
      }
      const lm = l.match(LI);
      if (lm && lm[1].length > baseIndent) {
        const sub = parseList(lines, i);
        children += sub.html;
        i = sub.next;
        continue;
      }
      if (lm) break;
      if (isBlockStart(l)) break;
      content.push(l.trim());
      i++;
    }
    items.push(`<li dir="auto">${inline(content.join(' '))}${children}</li>`);
  }

  const tag = ordered ? 'ol' : 'ul';
  const attr = ordered && start !== 1 ? ` start="${start}"` : '';
  return { html: `<${tag}${attr}>${items.join('')}</${tag}>`, next: i };
}

export function renderMarkdown(src) {
  const lines = String(src ?? '').replace(/\r\n?/g, '\n').split('\n');
  const out = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    let m = line.match(FENCE);
    if (m) {
      const fence = m[1];
      const closeRe = new RegExp(`^\\s{0,3}${fence[0] === '`' ? '`' : '~'}{${fence.length},}\\s*$`);
      const buf = [];
      i++;
      while (i < lines.length) {
        if (closeRe.test(lines[i])) {
          i++;
          break;
        }
        buf.push(lines[i]);
        i++;
      }
      out.push(codeBlock(buf.join('\n'), m[2]));
      continue;
    }

    if (!line.trim()) {
      i++;
      continue;
    }

    m = line.match(/^(#{1,6})\s+(.+?)\s*#*\s*$/);
    if (m) {
      const lvl = m[1].length;
      out.push(`<h${lvl} dir="auto">${inline(m[2])}</h${lvl}>`);
      i++;
      continue;
    }

    if (/^\s{0,3}([-*_])(\s*\1){2,}\s*$/.test(line)) {
      out.push('<hr>');
      i++;
      continue;
    }

    if (line.includes('|') && i + 1 < lines.length && TABLE_SEP.test(lines[i + 1]) && lines[i + 1].includes('-')) {
      const t = parseTable(lines, i);
      out.push(t.html);
      i = t.next;
      continue;
    }

    if (/^\s{0,3}>/.test(line)) {
      const buf = [];
      while (i < lines.length && /^\s{0,3}>/.test(lines[i])) {
        buf.push(lines[i].replace(/^\s{0,3}>\s?/, ''));
        i++;
      }
      out.push(`<blockquote>${renderMarkdown(buf.join('\n'))}</blockquote>`);
      continue;
    }

    if (LI.test(line)) {
      const l = parseList(lines, i);
      out.push(l.html);
      i = l.next;
      continue;
    }

    const para = [line];
    i++;
    while (i < lines.length && lines[i].trim() && !isBlockStart(lines[i])) {
      if (lines[i].includes('|') && i + 1 < lines.length && TABLE_SEP.test(lines[i + 1])) break;
      para.push(lines[i]);
      i++;
    }
    out.push(`<p dir="auto">${para.map((p) => inline(p)).join('<br>')}</p>`);
  }

  return out.join('\n');
}
