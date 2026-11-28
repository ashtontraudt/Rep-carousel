/* REP Carousel Generator — renders branded 1080x1350 slides for @repexplains. */
(() => {
  'use strict';

  // ---------- Brand ----------
  const W = 1080, H = 1350, M = 80;
  const C = {
    cream: '#F7EFE3',
    charcoal: '#3A3836',
    gray: '#6B6966',
    orange: '#E8781E',
    black: '#1E1D1B',
    plateEmpty: '#DDD4C7',   // light gray for empty rating plates
    placeholder: '#B5AFA6',
  };
  const TIER_COLORS = { F: '#6B6966', D: '#8A857E', C: '#B5AFA6', B: '#3A3836', A: '#F2A65A', S: '#E8781E' };
  const HEAD = (s) => `${s}px Anton, "Oswald", "Arial Narrow", sans-serif`;
  const BODY = (s, bold) => `${bold ? 700 : 400} ${s}px Inter, system-ui, sans-serif`;
  const SEMI = (s) => `600 ${s}px Inter, system-ui, sans-serif`;
  const WORDMARK = '@repexplains';

  const SLOT_DEFS = {
    cover: () => [{ key: 'main', label: 'Cover image', cat: 'Other' }],
    tip: () => [{ key: 'main', label: 'Tip image', cat: 'Exercise' }],
    rank: () => [{ key: 'main', label: 'Exercise image', cat: 'Exercise' }],
    cta: () => [{ key: 'main', label: 'Product / REP image', cat: 'Product' }],
    explainer: () => [{ key: 'main', label: 'REP expression', cat: 'REP · neutral' }],
    tier: () => [],
    tiergroup: (f) => {
      const n = Math.max(1, Math.min(4, f.items.length || 1));
      return Array.from({ length: n }, (_, i) => ({ key: 'ex' + i, label: (f.items[i] && f.items[i].name) || `Exercise ${i + 1}`, cat: 'Exercise' }));
    },
    reference: (f) => {
      const n = Math.max(1, Math.min(4, f.labels.length || 1));
      const out = [{ key: 'target', label: 'Target muscle', cat: 'Muscle' }];
      for (let i = 0; i < n; i++) out.push({ key: 'ex' + i, label: f.labels[i] || `Exercise ${i + 1}`, cat: 'Exercise' });
      return out;
    },
  };
  const CATEGORIES = ['REP · neutral', 'REP · thinking', 'REP · friendly', 'REP · full-body', 'Exercise', 'Muscle', 'Product', 'Logo', 'Other'];

  const EXAMPLE = `[cover]
title: 11 back exercises
accent: ranked worst to best
sub: based on science, not vibes
---
[tip]
number: 1
headline: Chest
bullets:
- Keep your **shoulder blades** pinned back and down
- Lower the bar to your **mid chest**, not your neck
- Drive your feet into the floor for **stability**
---
[rank]
number: 11
name: DB Lat Pulldown
rating: 1.5
reason: Awkward setup and hard to load heavy enough to keep progressing.
---
[tier]
letter: S
verdict: The best of the best
---
[tiergroup]
letter: B
items:
- Seated Cable Row: Easy to load, but most people cut the stretch short
- Lat Pulldown: Great for beginners, less carryover than pull-ups
---
[reference]
headline: Shoulders
number: 3
breakdown: 1 front · 1 side · 1 rear
labels:
Overhead Press
Lateral Raise
Reverse Fly
---
[cta]
headline: Struggling to **build muscle**?
body: My free guide gives you the exact program, sets and reps to start growing this week.
action: Comment "GUIDE" and I'll DM you the link
---
[explainer]
label: Quick science
headline: Why mind-muscle connection matters
body: Focusing on the muscle you're training can increase its activation, especially on **isolation exercises**.
Use lighter weights and slow down the lowering phase.`;

  // ---------- Storage helpers ----------
  const LS = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* ignore */ } },
  };

  const DB = (() => {
    let dbp = null;
    function open() {
      if (dbp) return dbp;
      dbp = new Promise((res, rej) => {
        if (!('indexedDB' in window)) return rej(new Error('IndexedDB unavailable'));
        const r = indexedDB.open('rep-carousel', 2);
        r.onupgradeneeded = () => {
          const db = r.result;
          if (!db.objectStoreNames.contains('images')) db.createObjectStore('images', { keyPath: 'id' });
          if (!db.objectStoreNames.contains('carousels')) db.createObjectStore('carousels', { keyPath: 'id' });
        };
        r.onsuccess = () => res(r.result);
        r.onerror = () => rej(r.error);
        r.onblocked = () => rej(new Error('Close other tabs of this app and reload'));
      });
      return dbp;
    }
    async function tx(store, mode, fn) {
      const db = await open();
      return new Promise((res, rej) => {
        const t = db.transaction(store, mode);
        const out = fn(t.objectStore(store));
        t.oncomplete = () => res(out && 'result' in out ? out.result : undefined);
        t.onerror = () => rej(t.error);
      });
    }
    return {
      all: () => tx('images', 'readonly', (s) => s.getAll()),
      put: (rec) => tx('images', 'readwrite', (s) => s.put(rec)),
      del: (id) => tx('images', 'readwrite', (s) => s.delete(id)),
      cAll: () => tx('carousels', 'readonly', (s) => s.getAll()),
      cPut: (rec) => tx('carousels', 'readwrite', (s) => s.put(rec)),
      cDel: (id) => tx('carousels', 'readwrite', (s) => s.delete(id)),
    };
  })();

  // Saved carousels: IndexedDB, falling back to localStorage when it's unavailable.
  const CarStore = {
    async all() {
      try { return await DB.cAll(); } catch { return Object.values(LS.get('rep.carousels', {})); }
    },
    async put(rec) {
      try { await DB.cPut(rec); } catch { const m = LS.get('rep.carousels', {}); m[rec.id] = rec; LS.set('rep.carousels', m); }
    },
    async del(id) {
      try { await DB.cDel(id); } catch { const m = LS.get('rep.carousels', {}); delete m[id]; LS.set('rep.carousels', m); }
    },
  };

  // In-memory image cache: id -> { rec, url, img }
  const images = new Map();
  let dbOk = true;

  function loadImg(url) {
    return new Promise((res, rej) => {
      const im = new Image();
      im.onload = () => res(im);
      im.onerror = rej;
      im.src = url;
    });
  }
  async function cacheRecord(rec) {
    const url = URL.createObjectURL(rec.blob);
    const entry = { rec, url, img: null };
    images.set(rec.id, entry);
    try { entry.img = await loadImg(url); } catch { /* unreadable image */ }
    return entry;
  }
  async function loadLibrary() {
    try {
      const recs = await DB.all();
      recs.sort((a, b) => b.created - a.created);
      await Promise.all(recs.map(cacheRecord));
    } catch (e) {
      dbOk = false;
      toast('Image library unavailable in this browser — uploads will last this session only.');
    }
  }
  async function addImageFile(file, category) {
    const rec = {
      id: 'img_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
      name: file.name || 'image',
      category: category || 'Other',
      blob: file,
      created: Date.now(),
    };
    if (dbOk) { try { await DB.put(rec); } catch { dbOk = false; } }
    await cacheRecord(rec);
    return rec.id;
  }

  // ---------- Parser ----------
  const KEYS = {
    cover: ['title', 'accent', 'sub', 'fit'],
    tip: ['number', 'headline', 'bullets'],
    rank: ['number', 'name', 'rating', 'reason'],
    tier: ['letter', 'verdict'],
    reference: ['headline', 'number', 'breakdown', 'labels'],
    cta: ['headline', 'body', 'action'],
    explainer: ['label', 'headline', 'body', 'corner'],
    tiergroup: ['letter', 'items'],
  };
  const LIST_KEYS = new Set(['bullets', 'labels', 'items']);

  const REQUIRED = {
    cover: [['title', 'accent']], tip: ['headline'], rank: ['name', 'rating'], tier: ['letter', 'verdict'],
    reference: ['headline', 'labels'], cta: ['headline'], explainer: ['headline'], tiergroup: ['letter', 'items'],
  };
  function editDistance(a, b) {
    const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
    for (let j = 1; j <= b.length; j++) d[0][j] = j;
    for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    return d[a.length][b.length];
  }

  function parse(src) {
    const all = src.replace(/\r\n?/g, '\n').split('\n');
    // group lines into blocks separated by --- lines, remembering line numbers
    const blocks = [[]];
    all.forEach((text, n) => { if (/^\s*-{3,}\s*$/.test(text)) blocks.push([]); else blocks[blocks.length - 1].push({ text, n: n + 1 }); });
    const slides = [], errors = [];
    for (const lines of blocks) {
      const body = lines.filter((l) => l.text.trim());
      if (!body.length) continue; // empty block from extra --- lines: ignore
      const first = body[0];
      const where = `Line ${first.n}`;
      const m = first.text.trim().match(/^\[\s*([a-zA-Z]+)\s*\]$/);
      if (!m) { errors.push(`${where}: a slide must start with its type in brackets, like [cover]. Found "${first.text.trim().slice(0, 40)}". This block was skipped.`); continue; }
      const type = m[1].toLowerCase();
      if (!KEYS[type]) { errors.push(`${where}: unknown slide type [${m[1]}]. Use one of: ${Object.keys(KEYS).map((k) => '[' + k + ']').join(' ')}. This block was skipped.`); continue; }
      const slideNo = slides.length + 1;
      const tag = `Slide ${slideNo} [${type}]`;
      const raw = {};
      let cur = null;
      for (const { text, n } of body.slice(1)) {
        const km = text.match(/^\s*([a-zA-Z]+)\s*:\s?(.*)$/);
        const key = km && km[1].toLowerCase();
        if (km && KEYS[type].includes(key)) {
          cur = key;
          raw[cur] = raw[cur] || [];
          if (km[2].trim()) raw[cur].push(km[2].trim());
          continue;
        }
        if (km) {
          const close = KEYS[type].find((k) => editDistance(k, key) <= 2);
          if (close || !cur) {
            errors.push(`${tag}, line ${n}: unknown field "${km[1]}"${close ? ` (did you mean "${close}"?)` : ''}. Fields for [${type}]: ${KEYS[type].join(', ')}.`);
            continue;
          }
        }
        if (cur) raw[cur].push(text.trim());
        else errors.push(`${tag}, line ${n}: text outside any field was ignored. Start the line with a field name, like "${KEYS[type][0]}:".`);
      }
      const f = {};
      for (const k of KEYS[type]) {
        // " | " (spaces around a pipe) forces a line break in any text field
        const arr = (raw[k] || []).map((x) => x
          .replace(/\*\*([^*]+?)\*\*/g, (m, inner) => `**${inner.replace(/[ \t]+\|[ \t]+/g, '** | **')}**`) // keep **bold** on both lines
          .replace(/[ \t]+\|[ \t]+/g, '\n'));
        if (LIST_KEYS.has(k)) f[k] = arr.map((x) => x.replace(/^[-•*]\s+/, '')).filter(Boolean);
        else if (type === 'cover' && (k === 'title' || k === 'accent')) f[k] = arr;
        else f[k] = arr.join('\n');
      }
      const missing = REQUIRED[type].filter((r) => (Array.isArray(r) ? r : [r]).every((k) => !f[k] || !f[k].length)).map((r) => (Array.isArray(r) ? r.join(' or ') : r));
      if (missing.length) errors.push(`${tag}: missing ${missing.join(', ')}.`);
      if (type === 'cover') {
        // fit: contain (default) shows the whole image; bleed fills the bottom and runs off the edge
        const fit = (f.fit || '').trim().toLowerCase();
        if (fit && fit !== 'contain' && fit !== 'bleed') errors.push(`${tag}: fit "${f.fit}" should be contain or bleed. Using contain.`);
        f.fit = fit === 'bleed' ? 'bleed' : 'contain';
      }
      if (type === 'explainer') {
        // corner: right (default) / left = small corner image; center = large centered image
        const c = (f.corner || '').trim().toLowerCase();
        const mode = /cent(er|re)/.test(c) ? 'center' : /left/.test(c) ? 'left' : /right/.test(c) || !c ? 'right' : null;
        if (!mode) errors.push(`${tag}: corner "${f.corner}" should be left, right or center. Using right.`);
        f.corner = mode || 'right';
      }
      if (type === 'rank') {
        const r = parseFloat(String(f.rating).replace(',', '.'));
        if (f.rating && (isNaN(r) || r < 0 || r > 5)) errors.push(`${tag}: rating "${f.rating}" should be a number from 0 to 5 (halves allowed).`);
        f.rating = isNaN(r) ? 0 : Math.max(0, Math.min(5, Math.round(r * 2) / 2));
      }
      if (type === 'tiergroup') {
        // "- Name: one-line reason" (split at the first colon; the reason is optional)
        f.items = f.items.map((line) => {
          const k = line.indexOf(':');
          return k > 0 ? { name: line.slice(0, k).trim(), reason: line.slice(k + 1).trim() } : { name: line.trim(), reason: '' };
        }).filter((it) => it.name);
        if (f.items.length > 4) { errors.push(`${tag}: up to 4 items are supported. Extra ones were ignored.`); f.items = f.items.slice(0, 4); }
      }
      if (type === 'tier' || type === 'tiergroup') {
        const L = (f.letter || '').trim().toUpperCase();
        if (L && !TIER_COLORS[L.charAt(0)]) errors.push(`${tag}: tier letter "${f.letter}" should be one of S, A, B, C, D, F.`);
        f.letter = L.charAt(0);
      }
      if (type === 'reference' && f.labels.length > 4) { errors.push(`${tag}: up to 4 labels are supported. Extra ones were ignored.`); f.labels = f.labels.slice(0, 4); }
      slides.push({ type, f });
    }
    return { slides, errors };
  }

  // ---------- Text helpers ----------
  function parseRich(str) {
    const runs = [];
    // \u0001…\u0001 marks a run that is bold charcoal (used for [tiergroup] item names); **…** is bold orange.
    String(str || '').split(/(\u0001[^\u0001]*\u0001)/g).forEach((chunk) => {
      if (!chunk) return;
      if (chunk.charAt(0) === '\u0001') { const t = chunk.slice(1, -1); if (t) runs.push({ t, b: true, c: C.charcoal }); return; }
      chunk.split(/(\*\*[^*]+?\*\*)/g).forEach((p) => {
        if (!p) return;
        if (/^\*\*[^*]+\*\*$/.test(p)) runs.push({ t: p.slice(2, -2), b: true });
        else runs.push({ t: p.replace(/\*\*/g, ''), b: false });
      });
    });
    return runs;
  }
  // words: [{ segs:[{t,b}], space:boolean(before) }]
  // A piece made only of emoji (incl. skin tones, ZWJ sequences, flags, keycaps).
  const EMOJI_ONLY = /^(?:\p{Extended_Pictographic}|\p{Regional_Indicator}|\p{Emoji_Modifier}|\u200D|\uFE0F|\u20E3)+$/u;
  // A number token: 21, 2.5, 1,000, 6–10, 6-10, #11, $20, ~5, 10%, 3x, 5+ (not followed by punctuation).
  const NUMBER_TOKEN = /^[#$~(]?\d+(?:[.,:]\d+)*(?:[–—-]\d+(?:[.,:]\d+)*)?(?:%|x|×|\+|k|K)?$/;
  function toWords(runs) {
    const words = [];
    let pendingSpace = false, cur = null, afterNumber = false;
    for (const r of runs) {
      // break only at ordinary whitespace; a typed non-breaking space (U+00A0 / U+202F) keeps words together
      for (const piece of r.t.split(/([^\S\u00A0\u202F]+)/)) {
        if (!piece) continue;
        if (/^[^\S\u00A0\u202F]+$/.test(piece)) { pendingSpace = true; cur = null; continue; }
        if (pendingSpace && words.length && (EMOJI_ONLY.test(piece) || afterNumber)) {
          // an emoji never starts a line, and a number keeps the word after it ("21 sets", "6–10 reps"):
          // join to the previous word with a non-breaking space
          cur = words[words.length - 1];
          cur.segs.push({ t: '\u00A0', b: r.b, c: r.c }, { t: piece, b: r.b, c: r.c });
          pendingSpace = false;
          afterNumber = NUMBER_TOKEN.test(piece);
          continue;
        }
        afterNumber = NUMBER_TOKEN.test(piece) && !(cur && !pendingSpace); // a whole word that is a number
        if (cur && !pendingSpace) cur.segs.push({ t: piece, b: r.b, c: r.c });
        else { cur = { segs: [{ t: piece, b: r.b, c: r.c }], space: words.length > 0 && pendingSpace }; words.push(cur); }
        pendingSpace = false;
      }
    }
    return words;
  }
  function segWidth(ctx, seg, fontFn, size) { ctx.font = fontFn(size, seg.b); return ctx.measureText(seg.t).width; }
  function wordWidth(ctx, w, fontFn, size) { return w.segs.reduce((a, s) => a + segWidth(ctx, s, fontFn, size), 0); }

  // Returns lines: [{ words, width }]
  function wrapRich(ctx, text, fontFn, size, maxW, upper) {
    const out = [];
    const spaceW = (() => { ctx.font = fontFn(size, false); return ctx.measureText(' ').width; })();
    for (const para of String(text || '').split('\n')) {
      const words = toWords(parseRich(upper ? para.toUpperCase() : para));
      if (!words.length) { out.push({ words: [], width: 0 }); continue; }
      let line = [], lw = 0;
      for (const w of words) {
        const ww = wordWidth(ctx, w, fontFn, size);
        const add = line.length ? spaceW + ww : ww;
        if (line.length && lw + add > maxW) { out.push({ words: line, width: lw }); line = [w]; lw = ww; }
        else { line.push(w); lw += add; }
      }
      out.push({ words: line, width: lw });
    }
    return out;
  }
  // Warnings collected while rendering the current slide (shown under the slide card).
  let renderWarnings = null;
  function warn(msg) { if (renderWarnings && !renderWarnings.includes(msg)) renderWarnings.push(msg); }

  function lineWidth(ctx, words, o, size) {
    ctx.font = o.font(size, false);
    const spaceW = ctx.measureText(' ').width;
    return words.reduce((a, w, i) => a + (i ? spaceW : 0) + wordWidth(ctx, w, o.font, size), 0);
  }
  // Shorten a line until it (plus an ellipsis) fits maxW.
  function ellipsize(ctx, line, o, size) {
    const words = line.words.map((w) => ({ ...w, segs: w.segs.map((sg) => ({ ...sg })) }));
    const ell = () => { const last = words[words.length - 1]; const sg = last.segs[last.segs.length - 1]; sg.t = sg.t.replace(/[\s.,;:!?…-]+$/, '') + '…'; };
    if (!words.length) return line;
    ell();
    while (lineWidth(ctx, words, o, size) > o.maxW) {
      const last = words[words.length - 1];
      if (words.length > 1 && last.segs.map((x) => x.t).join('').length <= 3) { words.pop(); ell(); continue; }
      const sg = last.segs[last.segs.length - 1];
      if (sg.t.length <= 1) { last.segs.pop(); if (!last.segs.length) words.pop(); if (!words.length) break; ell(); continue; }
      sg.t = sg.t.slice(0, -2) + '…';
    }
    return { words, width: lineWidth(ctx, words, o, size) };
  }
  // Balanced wrapping (what CSS text-wrap: balance does): keep the greedy line count, but use the
  // narrowest width that still gives that many lines, so the lines come out close to equal length.
  function wrapBalanced(ctx, text, fontFn, size, maxW, upper) {
    const out = [];
    for (const para of String(text || '').split('\n')) {
      const greedy = wrapRich(ctx, para, fontFn, size, maxW, upper);
      if (greedy.length < 2 || greedy.some((l) => l.width > maxW + 0.5)) { out.push(...greedy); continue; }
      const ok = (w) => { const ls = wrapRich(ctx, para, fontFn, size, w, upper); return ls.length <= greedy.length && ls.every((l) => l.width <= w + 0.5); };
      let lo = 0, hi = maxW;
      for (let k = 0; k < 24 && hi - lo > 0.5; k++) { const mid = (lo + hi) / 2; if (ok(mid)) hi = mid; else lo = mid; }
      out.push(...wrapRich(ctx, para, fontFn, size, hi, upper));
    }
    return out;
  }
  function fitRich(ctx, text, o) {
    let size = o.size;
    const maxLines = o.maxLines || 99;
    for (;;) {
      let lines = wrapRich(ctx, text, o.font, size, o.maxW, o.upper);
      const tooWide = lines.some((l) => l.width > o.maxW + 0.5);
      const h = lines.length * size * o.lh;
      const fits = !tooWide && lines.length <= maxLines && (!o.maxH || h <= o.maxH);
      if (fits) return { lines: o.balance ? wrapBalanced(ctx, text, o.font, size, o.maxW, o.upper) : lines, size };
      if (size - 2 < o.min) {
        // Still too big at the smallest size: cut lines and add an ellipsis instead of overflowing.
        let keep = Math.min(lines.length, maxLines);
        if (o.maxH) keep = Math.min(keep, Math.max(1, Math.floor(o.maxH / (size * o.lh) + 0.001)));
        const cut = keep < lines.length;
        lines = lines.slice(0, keep).map((l, i) => ((cut && i === keep - 1) || l.width > o.maxW + 0.5 ? ellipsize(ctx, l, o, size) : l));
        if (o.name) warn(`${o.name} is too long to fit and was shortened with "…".`);
        return { lines, size, cut: true };
      }
      size -= 2;
    }
  }
  function drawLines(ctx, lines, x, y, size, o) {
    // y = top of first line. Returns bottom y.
    const lh = size * o.lh;
    ctx.textBaseline = 'alphabetic';
    const spaceW = (() => { ctx.font = o.font(size, false); return ctx.measureText(' ').width; })();
    lines.forEach((ln, i) => {
      let cx = x;
      if (o.align === 'center') cx = x - ln.width / 2;
      else if (o.align === 'right') cx = x - ln.width;
      const base = y + i * lh + size * (o.ascent || 0.8) + (lh - size) / 2;
      ln.words.forEach((w, wi) => {
        if (wi > 0) cx += spaceW;
        for (const s of w.segs) {
          ctx.font = o.font(size, s.b);
          ctx.fillStyle = s.c || (s.b ? (o.boldColor || C.orange) : o.color);
          ctx.fillText(s.t, cx, base);
          cx += ctx.measureText(s.t).width;
        }
      });
    });
    return y + lines.length * lh;
  }
  function richBlock(ctx, text, x, y, o) {
    const { lines, size } = fitRich(ctx, text, o);
    const bottom = drawLines(ctx, lines, x, y, size, o);
    return { bottom, size, lines };
  }
  function spacedWidth(ctx, text, spacing) {
    let w = 0;
    for (const ch of text) w += ctx.measureText(ch).width + spacing;
    return Math.max(0, w - spacing);
  }
  function drawSpaced(ctx, text, x, y, spacing, align) {
    const w = spacedWidth(ctx, text, spacing);
    let cx = align === 'center' ? x - w / 2 : align === 'right' ? x - w : x;
    for (const ch of text) { ctx.fillText(ch, cx, y); cx += ctx.measureText(ch).width + spacing; }
    return w;
  }

  // ---------- Shape helpers ----------
  function rr(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  function badgeShadow(ctx) {
    ctx.shadowColor = 'rgba(30,29,27,0.16)';
    ctx.shadowBlur = 18;
    ctx.shadowOffsetY = 6;
  }
  function noShadow(ctx) { ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0; }
  function divider(ctx, x, y, align) {
    const w = 96, h = 7;
    ctx.fillStyle = C.orange;
    rr(ctx, align === 'center' ? x - w / 2 : x, y, w, h, 3.5);
    ctx.fill();
    return y + h;
  }

  // Draw an image (or placeholder) contained in box. opts.valign: 'center' | 'bottom' | 'top'; opts.halign
  // Bounding box of an image's visible (not fully transparent) pixels, in source pixels; cached per image.
  // Scanned on a small copy, then rounded outward so no visible pixel is ever cut off.
  function visibleBox(entry) {
    if (entry.visible) return entry.visible;
    const im = entry.img, iw = im.naturalWidth, ih = im.naturalHeight;
    let box = { x: 0, y: 0, w: iw, h: ih };
    try {
      const sc = Math.min(1, 400 / Math.max(iw, ih));
      const cw = Math.max(1, Math.round(iw * sc)), ch = Math.max(1, Math.round(ih * sc));
      const c = document.createElement('canvas');
      c.width = cw; c.height = ch;
      const g = c.getContext('2d', { willReadFrequently: true });
      g.drawImage(im, 0, 0, cw, ch);
      const d = g.getImageData(0, 0, cw, ch).data;
      let x0 = cw, y0 = ch, x1 = -1, y1 = -1;
      for (let y = 0; y < ch; y++) {
        for (let x = 0; x < cw; x++) {
          if (d[(y * cw + x) * 4 + 3] > 0) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
        }
      }
      if (x1 >= 0) {
        // coarse box, rounded outward (it always contains every visible pixel)
        let L = Math.max(0, Math.floor((x0 - 1) / sc)), T = Math.max(0, Math.floor((y0 - 1) / sc));
        let Rr = Math.min(iw, Math.ceil((x1 + 2) / sc)), B = Math.min(ih, Math.ceil((y1 + 2) / sc));
        // refine each edge at full resolution, reading only a narrow strip along it
        const span = Math.ceil(4 / sc) + 2;
        const read = (x, y, w, h) => {
          c.width = w; c.height = h;
          g.clearRect(0, 0, w, h);
          g.drawImage(im, x, y, w, h, 0, 0, w, h);
          return g.getImageData(0, 0, w, h).data;
        };
        const colHas = (d, w, h, i) => { for (let k = 0; k < h; k++) if (d[(k * w + i) * 4 + 3] > 0) return true; return false; };
        const rowHas = (d, w, j) => { for (let k = 0; k < w; k++) if (d[(j * w + k) * 4 + 3] > 0) return true; return false; };
        let sw = Math.min(span, Rr - L), d = read(L, T, sw, B - T);
        for (let i = 0; i < sw; i++) if (colHas(d, sw, B - T, i)) { L += i; break; }
        sw = Math.min(span, Rr - L); d = read(Rr - sw, T, sw, B - T);
        for (let i = sw - 1; i >= 0; i--) if (colHas(d, sw, B - T, i)) { Rr = Rr - sw + i + 1; break; }
        let sh = Math.min(span, B - T); d = read(L, T, Rr - L, sh);
        for (let j = 0; j < sh; j++) if (rowHas(d, Rr - L, j)) { T += j; break; }
        sh = Math.min(span, B - T); d = read(L, B - sh, Rr - L, sh);
        for (let j = sh - 1; j >= 0; j--) if (rowHas(d, Rr - L, j)) { B = B - sh + j + 1; break; }
        box = { x: L, y: T, w: Rr - L, h: B - T };
      }
    } catch { /* unreadable pixels: use the whole image */ }
    entry.visible = box;
    return box;
  }
  function placeImage(ctx, R, slotKey, box, opts = {}) {
    if (R.reel && !opts.reelSafe) {
      // Reel slides: images that normally bleed off the slide edge stay inside the margins,
      // so nothing is cut off where the slide meets the extra cream space.
      const x0 = Math.max(box.x, M), y0 = Math.max(box.y, M);
      const x1 = Math.min(box.x + box.w, W - M), y1 = Math.min(box.y + box.h, H - M);
      box = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
    }
    if (box.w < 40 || box.h < 40) return;
    const entry = R.slot(slotKey);
    if (entry && entry.img) {
      const im = entry.img;
      // opts.trim: lay out by the visible pixels, ignoring a transparent margin around the figure
      const src = opts.trim ? visibleBox(entry) : { x: 0, y: 0, w: im.naturalWidth, h: im.naturalHeight };
      const s = Math.min(box.w / src.w, box.h / src.h);
      const w = src.w * s, h = src.h * s;
      const ha = opts.halign || 'center', va = opts.valign || 'center';
      const x = ha === 'left' ? box.x : ha === 'right' ? box.x + box.w - w : box.x + (box.w - w) / 2;
      const y = va === 'top' ? box.y : va === 'bottom' ? box.y + box.h - h : box.y + (box.h - h) / 2;
      if (opts.trim) ctx.drawImage(im, src.x, src.y, src.w, src.h, x, y, w, h);
      else ctx.drawImage(im, x, y, w, h);
    } else if (!R.exporting) {
      // dashed placeholder (preview only), clipped to canvas
      const bx = Math.max(box.x, 24), by = box.y, bw = Math.min(box.x + box.w, W - 24) - bx;
      const bh = Math.min(box.y + box.h, H - 24) - by;
      ctx.save();
      ctx.setLineDash([18, 14]);
      ctx.lineWidth = 4;
      ctx.strokeStyle = C.placeholder;
      rr(ctx, bx, by, bw, bh, 28);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = C.placeholder;
      ctx.textAlign = 'center';
      const fs = Math.max(22, Math.min(34, bw / 12));
      ctx.font = SEMI(fs);
      ctx.fillText(opts.label || 'Add image', bx + bw / 2, by + bh / 2 + fs * 0.35);
      ctx.restore();
      ctx.textAlign = 'left';
    }
  }

  // ---------- Common chrome ----------
  function drawChrome(ctx, R) {
    const y = M;            // top of header row
    const hh = 52;          // header height
    let x = M;
    const logo = R.logo();
    if (logo && logo.img) {
      const lh = 48, s = lh / logo.img.naturalHeight;
      const lw = Math.min(logo.img.naturalWidth * s, 120);
      const s2 = Math.min(lw / logo.img.naturalWidth, lh / logo.img.naturalHeight);
      const dw = logo.img.naturalWidth * s2, dh = logo.img.naturalHeight * s2;
      ctx.drawImage(logo.img, x, y + (hh - dh) / 2, dw, dh);
      x += dw + 14;
    }
    ctx.font = SEMI(30);
    ctx.fillStyle = C.gray;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.fillText(WORDMARK, x, y + hh / 2 + 1);

    const label = `${R.index + 1}/${R.total}`;
    ctx.font = SEMI(26);
    const tw = ctx.measureText(label).width;
    const pw = tw + 44, ph = 50;
    ctx.fillStyle = C.gray;
    rr(ctx, W - M - pw, y + (hh - ph) / 2, pw, ph, ph / 2);
    ctx.fill();
    ctx.fillStyle = C.cream;
    ctx.textAlign = 'center';
    ctx.fillText(label, W - M - pw / 2, y + hh / 2 + 1);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
  }
  const TOP = M + 52 + 64; // content start below header

  // ---------- Slide renderers ----------
  const IMG_MIN = 320;            // smallest height an image area may shrink to
  const BOTTOM = H - M;           // bottom of the safe area
  const HEAD_O = (size, min, extra) => ({ font: HEAD, size, min, lh: 1.04, ascent: 0.86, maxW: W - 2 * M, color: C.charcoal, balance: true, ...extra });
  const BODY_O = (size, min, extra) => ({ font: BODY, size, min, lh: 1.38, ascent: 0.78, maxW: W - 2 * M, color: C.gray, ...extra });
  // Missing text: show a hint in the preview, leave it out of exported PNGs.
  const hint = (R, v, d) => (v && String(v).trim() ? v : R.exporting ? '' : d);

  // Small all-caps label with wide letter spacing; shrinks, then shortens, to fit maxW.
  function spacedLabel(ctx, text, x, y, maxW, align, name) {
    let size = 30, t = text.toUpperCase();
    const sp = (s) => s * 0.2;
    for (; size > 22; size -= 1) { ctx.font = SEMI(size); if (spacedWidth(ctx, t, sp(size)) <= maxW) break; }
    ctx.font = SEMI(size);
    if (spacedWidth(ctx, t, sp(size)) > maxW) {
      while (t.length > 1 && spacedWidth(ctx, t + '…', sp(size)) > maxW) t = t.slice(0, -1);
      t = t.replace(/\s+$/, '') + '…';
      warn(`${name} is too long to fit and was shortened with "…".`);
    }
    ctx.fillStyle = C.gray;
    drawSpaced(ctx, t, x, y, sp(size), align);
  }

  // Exercise image grid with bold gray labels underneath: 1 = large, 2 = side by side, 3 = 2 + 1 centered, 4 = 2x2.
  // Slots are 'ex0'..'ex3'. Fills from gTop down to the bottom margin.
  function imageGrid(ctx, R, labels, gTop) {
      const n = Math.max(1, Math.min(4, labels.length || 1));
      const gap = 30;
      const rows = n <= 2 ? 1 : 2, cols = n === 1 ? 1 : 2;
      const cellW = (W - 2 * M - (cols - 1) * gap) / cols;
      const lo = { font: (s) => BODY(s, true), size: n === 1 ? 40 : 30, min: 24, lh: 1.15, ascent: 0.78, maxW: cellW - 10, maxLines: 2, color: C.gray, boldColor: C.orange, align: 'center' };
      const fits = labels.slice(0, n).map((lab, i) => fitRich(ctx, lab, { ...lo, name: `Label ${i + 1}` }));
      const labelLines = Math.max(1, ...fits.map((x) => x.lines.length));
      const labelSize = Math.max(lo.min, ...fits.map((x) => x.size));
      const labelH = 16 + labelLines * labelSize * lo.lh;
      const cellH = (BOTTOM - gTop - (rows - 1) * gap) / rows;
      for (let i = 0; i < n; i++) {
        const row = cols === 1 ? 0 : Math.floor(i / 2), col = cols === 1 ? 0 : i % 2;
        let cx = M + col * (cellW + gap);
        if (n === 3 && i === 2) cx = (W - cellW) / 2;
        const cy = gTop + row * (cellH + gap);
        placeImage(ctx, R, 'ex' + i, { x: cx, y: cy, w: cellW, h: cellH - labelH }, { label: 'Exercise ' + (i + 1) });
        if (fits[i]) drawLines(ctx, fits[i].lines, cx + cellW / 2, cy + cellH - labelH + 16, fits[i].size, lo);
      }
  }

  // [reference] exercise grid, fixed cells filling everything from gTop to the bottom margin:
  // 1 = one full-width cell, 2 = side by side, 3 = 2 on top + 1 centered, 4 = 2x2 (columns 440px wide).
  // Images are trimmed of transparent padding, scaled as large as fits the cell without cropping,
  // sit on the cell's baseline, and each label starts 12px below its image. Slots 'ex0'..'ex3'.
  function referenceGrid(ctx, R, labels, gTop) {
    const n = Math.max(1, Math.min(4, labels.length || 1));
    const colGap = 40, rowGap = 20, LABEL_GAP = 12;
    const rowsIdx = n === 1 ? [[0]] : n === 2 ? [[0, 1]] : n === 3 ? [[0, 1], [2]] : [[0, 1], [2, 3]];
    const cellW = n === 1 ? W - 2 * M : (W - 2 * M - colGap) / 2;
    const cellH = (BOTTOM - gTop - (rowsIdx.length - 1) * rowGap) / rowsIdx.length;
    const lo = { font: (s) => BODY(s, true), size: n === 1 ? 40 : 30, min: 24, lh: 1.15, ascent: 0.78, maxW: cellW - 10, maxLines: 2, color: C.gray, boldColor: C.orange, align: 'center' };
    const fits = labels.slice(0, n).map((lab, i) => fitRich(ctx, lab, { ...lo, name: `Label ${i + 1}` }));
    const labelH = (i) => (fits[i] ? fits[i].lines.length * fits[i].size * lo.lh : 0);
    let y = gTop;
    for (const idx of rowsIdx) {
      const lab = Math.max(0, ...idx.map(labelH));
      const imgH = cellH - (lab ? lab + LABEL_GAP : 0);
      idx.forEach((i, c) => {
        const cx = n === 1 || (n === 3 && i === 2) ? (W - cellW) / 2 : M + c * (cellW + colGap);
        placeImage(ctx, R, 'ex' + i, { x: cx, y, w: cellW, h: imgH }, { valign: 'bottom', trim: true, label: 'Exercise ' + (i + 1) });
        if (!fits[i]) return;
        // the label's tallest letters start LABEL_GAP below the image
        const sz = fits[i].size;
        ctx.font = lo.font(sz, true);
        const firstLine = fits[i].lines[0].words.map((w) => w.segs.map((sg) => sg.t).join('')).join(' ');
        const top = ctx.measureText(firstLine).actualBoundingBoxAscent;
        drawLines(ctx, fits[i].lines, cx + cellW / 2, y + imgH + LABEL_GAP - (sz * lo.ascent + (sz * lo.lh - sz) / 2 - top), sz, lo);
      });
      y += cellH + rowGap;
    }
  }

  const RENDER = {
    cover(ctx, f, R) {
      const segs = [];
      f.title.forEach((t) => segs.push({ t, color: C.charcoal }));
      f.accent.forEach((t) => segs.push({ t, color: C.orange }));
      if (!segs.length && !R.exporting) segs.push({ t: 'Your title', color: C.charcoal });
      const maxW = W - 2 * M, lh = 0.98, maxH = 600;
      const o = { font: HEAD, maxW, upper: true };
      let size = 170, laid;
      for (;;) {
        laid = segs.map((s) => ({ ...s, lines: wrapRich(ctx, s.t.replace(/\*\*/g, ''), HEAD, size, maxW, true) }));
        const n = laid.reduce((a, s) => a + s.lines.length, 0);
        const wide = laid.some((s) => s.lines.some((l) => l.width > maxW));
        if (!wide && n * size * lh <= maxH) {
          // balance each title / accent line on its own (same number of lines, even lengths)
          laid = laid.map((s) => ({ ...s, lines: wrapBalanced(ctx, s.t.replace(/\*\*/g, ''), HEAD, size, maxW, true) }));
          break;
        }
        if (size <= 64) {
          // cut extra lines from the end and mark with an ellipsis
          let room = Math.floor(maxH / (size * lh));
          for (const s of laid) {
            s.lines = s.lines.slice(0, Math.max(0, room)).map((l) => (l.width > maxW ? ellipsize(ctx, l, o, size) : l));
            room -= s.lines.length;
          }
          const last = [...laid].reverse().find((s) => s.lines.length);
          if (last) last.lines[last.lines.length - 1] = ellipsize(ctx, last.lines[last.lines.length - 1], o, size);
          warn('Title and accent are too long to fit and were shortened with "…".');
          break;
        }
        size -= 4;
      }
      let y = TOP - 10;
      for (const s of laid) {
        y = drawLines(ctx, s.lines, W / 2, y, size, { font: HEAD, lh, color: s.color, boldColor: s.color, align: 'center', ascent: 0.86 });
      }
      if (f.sub) {
        y += 26;
        const sub = f.sub.trim().replace(/^\(|\)$/g, '');
        y = richBlock(ctx, `(${sub})`, W / 2, y, BODY_O(38, 28, { lh: 1.3, maxLines: 2, align: 'center', name: 'Sub line' })).bottom;
      }
      if (f.fit === 'bleed' && R.reel) {
        // 9:16: never cropped, so the image can't run off the edge. Instead it gets the largest box the
        // Reel safe zone allows (wider and taller than the 80px margins used by contain), starting
        // right under the subtitle, so it stays as close as possible to the 4:5 bleed size.
        const s = REEL_SAFE_SLIDE, top = y + 40;
        placeImage(ctx, R, 'main', { x: s.left, y: top, w: s.right - s.left, h: s.bottom - top }, { valign: 'bottom', label: 'Cover image', reelSafe: true });
      } else if (f.fit === 'bleed') {
        // fills the bottom half and runs 70px off the bottom edge (cropped)
        const top = Math.max(y + 40, H * 0.48);
        placeImage(ctx, R, 'main', { x: 40, y: top, w: W - 80, h: H - top + 70 }, { valign: 'bottom', label: 'Cover image' });
      } else {
        // contain: the whole image, scaled to fit between the subtitle and the bottom margin,
        // centered horizontally and sitting on the bottom margin. Nothing is cropped.
        const top = y + 40;
        placeImage(ctx, R, 'main', { x: M, y: top, w: W - 2 * M, h: BOTTOM - top }, { valign: 'bottom', label: 'Cover image' });
      }
    },

    tip(ctx, f, R) {
      const num = `#${(f.number || '1').replace(/^#/, '')}`;
      const bh = 104;
      ctx.font = HEAD(68);
      const bw = Math.max(bh, ctx.measureText(num).width + 56);
      const by = TOP;
      ctx.save();
      badgeShadow(ctx);
      ctx.fillStyle = C.orange;
      rr(ctx, M, by, bw, bh, bh / 2);
      ctx.fill();
      ctx.restore();
      ctx.fillStyle = C.cream;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(num, M + bw / 2, by + bh / 2 + 3);
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
      // headline beside the badge: up to 2 lines, first line centered on the badge
      const hx = M + bw + 32;
      const ho = HEAD_O(130, 64, { maxW: W - M - hx, maxLines: 2, name: 'Headline' });
      const fit = fitRich(ctx, hint(R, f.headline, 'Headline'), ho);
      const hy = by + bh / 2 - (fit.size * ho.lh) / 2;
      const hBottom = drawLines(ctx, fit.lines, hx, hy, fit.size, ho);
      let y = Math.max(by + bh, hBottom) + 52;
      // bullets: shrink to leave the image at least IMG_MIN
      const tx = M + 44;
      const bo = BODY_O(40, 30, { maxW: W - M - tx });
      const gap = 20;
      const room = BOTTOM - IMG_MIN - 30 - y;
      const heightAt = (sz) => f.bullets.reduce((a, b) => a + wrapRich(ctx, b, BODY, sz, bo.maxW).length * sz * bo.lh + gap, 0);
      let bsize = 40;
      while (bsize > 30 && heightAt(bsize) > room) bsize -= 2;
      let left = room;
      for (let i = 0; i < f.bullets.length; i++) {
        const lineH = bsize * bo.lh;
        const maxLines = Math.floor((left - gap) / lineH);
        if (maxLines < 1) { warn(`${f.bullets.length - i} bullet(s) didn't fit and were left out. Shorten the bullets or use fewer.`); break; }
        const bf = fitRich(ctx, f.bullets[i], { ...bo, size: bsize, min: bsize, maxLines, name: `Bullet ${i + 1}` });
        ctx.fillStyle = C.orange;
        ctx.beginPath();
        ctx.arc(M + 10, y + lineH / 2, 8, 0, Math.PI * 2);
        ctx.fill();
        const ny = drawLines(ctx, bf.lines, tx, y, bsize, bo) + gap;
        left -= ny - y;
        y = ny;
      }
      const top = f.bullets.length ? Math.max(y + 20, H * 0.5) : y + 10;
      placeImage(ctx, R, 'main', { x: M, y: top, w: W - 2 * M, h: BOTTOM + 20 - top }, { label: 'Tip image' });
    },

    rank(ctx, f, R) {
      const num = `#${(f.number || '1').replace(/^#/, '')}`;
      let y = TOP - 16;
      let ns = 170;
      ctx.font = HEAD(ns);
      while (ns > 90 && ctx.measureText(num).width > W - 2 * M) { ns -= 10; ctx.font = HEAD(ns); }
      ctx.fillStyle = C.charcoal;
      ctx.fillText(num, M, y + ns * 0.86);
      y += ns + 6;
      y = richBlock(ctx, hint(R, f.name, 'Exercise name'), M, y, HEAD_O(88, 54, { maxLines: 2, color: C.orange, name: 'Name' })).bottom + 28;
      const r = 30, gap = 18;
      for (let i = 0; i < 5; i++) drawPlate(ctx, M + r + i * (2 * r + gap), y + r, r, Math.max(0, Math.min(1, f.rating - i)));
      y += 2 * r + 36;
      y = divider(ctx, M, y) + 30;
      if (f.reason) {
        y = richBlock(ctx, f.reason, M, y, BODY_O(38, 30, { maxLines: 4, maxH: BOTTOM - IMG_MIN - 36 - y, name: 'Reason' })).bottom;
      }
      const top = y + 36;
      placeImage(ctx, R, 'main', { x: M, y: top, w: W - 2 * M, h: BOTTOM + 20 - top }, { label: 'Exercise image' });
    },

    tier(ctx, f, R) {
      const L = f.letter || (R.exporting ? '' : '?');
      const col = TIER_COLORS[L] || C.charcoal;
      const vo = HEAD_O(116, 64, { maxLines: 3, align: 'center', name: 'Verdict' });
      const vf = fitRich(ctx, f.verdict || '', vo);
      const labelH = 34, badge = 440, gap1 = 42, gap2 = 64;
      const vH = f.verdict ? vf.lines.length * vf.size * vo.lh : 0;
      const groupH = labelH + gap1 + badge + (vH ? gap2 + vH : 0);
      const areaH = BOTTOM - TOP;
      let y = TOP + Math.max(0, (areaH - groupH) / 2) - 20;
      ctx.font = SEMI(32);
      ctx.fillStyle = C.gray;
      if (L) drawSpaced(ctx, `${L} TIER`, W / 2, y + 28, 8, 'center');
      y += labelH + gap1;
      ctx.save();
      badgeShadow(ctx);
      ctx.fillStyle = col;
      rr(ctx, (W - badge) / 2, y, badge, badge, 84);
      ctx.fill();
      ctx.restore();
      ctx.fillStyle = C.cream;
      ctx.font = HEAD(320);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(L, W / 2, y + badge / 2 + 8);
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
      y += badge + gap2;
      if (f.verdict) drawLines(ctx, vf.lines, W / 2, y, vf.size, vo);
    },

    reference(ctx, f, R) {
      // Fixed proportions (1080x1350 base): top section up to 480px tall, grid gets everything below.
      const top0 = TOP - 10, TOP_MAX = 480, leftW = 500;
      const T_W = 340, T_H = 440; // target-muscle image limits
      // Left column (headline, number, divider, breakdown) at scale k; returns its bottom y.
      const leftColumn = (k, draw) => {
        let y = top0;
        const ho = HEAD_O(Math.round(110 * k), Math.round(60 * k), { maxW: leftW, maxLines: 2, name: 'Headline' });
        const hf = fitRich(ctx, hint(R, f.headline, 'Muscle'), ho);
        if (draw) drawLines(ctx, hf.lines, M, y, hf.size, ho);
        y += hf.lines.length * hf.size * ho.lh + 8;
        if (f.number) {
          let ns = Math.round(230 * k);
          ctx.font = HEAD(ns);
          while (ns > 100 && ctx.measureText(f.number).width > leftW) { ns -= 10; ctx.font = HEAD(ns); }
          if (draw) { ctx.fillStyle = C.orange; ctx.fillText(f.number, M - 4, y + ns * 0.86); }
          y += ns + 6;
        }
        if (draw) divider(ctx, M, y + 6);
        y += 6 + 7 + Math.round(26 * k);
        if (f.breakdown) {
          const bo = BODY_O(Math.round(41 * k), Math.round(31 * k), { lh: 1.3, maxW: leftW, maxLines: 3, name: 'Breakdown' });
          const bf = fitRich(ctx, f.breakdown, bo);
          if (draw) drawLines(ctx, bf.lines, M, y, bf.size, bo);
          y += bf.lines.length * bf.size * bo.lh;
        }
        return y;
      };
      // shrink the left column together until the top section fits in TOP_MAX
      const keep = renderWarnings;
      renderWarnings = null; // measuring passes must not leave warnings behind
      let k = 1;
      while (k > 0.6 && leftColumn(k, false) - top0 > TOP_MAX) k = Math.round((k - 0.05) * 100) / 100;
      renderWarnings = keep;
      const leftBottom = leftColumn(k, true);
      // target-muscle image: top right, at most 340 x 440 and never taller than the left column
      const tH = Math.min(T_H, leftBottom - top0);
      placeImage(ctx, R, 'target', { x: W - M - T_W, y: top0, w: T_W, h: tH }, { trim: true, label: 'Target muscle' });
      referenceGrid(ctx, R, f.labels, Math.max(leftBottom, top0 + tH) + 24);
    },

    tiergroup(ctx, f, R) {
      const L = f.letter || (R.exporting ? '' : '?');
      // badge + "TIER"
      const bs = 120, by = TOP - 4;
      ctx.save();
      badgeShadow(ctx);
      ctx.fillStyle = TIER_COLORS[L] || C.charcoal;
      rr(ctx, M, by, bs, bs, 28);
      ctx.fill();
      ctx.restore();
      ctx.fillStyle = C.cream;
      ctx.font = HEAD(92);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(L, M + bs / 2, by + bs / 2 + 4);
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
      ctx.font = HEAD(124);
      const cap = ctx.measureText('TIER').actualBoundingBoxAscent;
      ctx.fillStyle = C.charcoal;
      ctx.fillText('TIER', M + bs + 28, by + bs / 2 + cap / 2);
      let y = by + bs + 48;

      // items: "Name:" bold charcoal, reason regular gray, 24px between items
      const items = f.items.slice(0, 4);
      const n = Math.max(1, items.length);
      const io = BODY_O(40, 30, { color: C.gray, boldColor: C.orange });
      const gap = 24;
      const texts = items.map((it) => {
        // bold-charcoal name (each line of it marked separately, so " | " breaks work), then the reason
        const parts = it.name.replace(/\*\*/g, '').split('\n');
        const name = parts.map((x, k) => `\u0001${x}${k === parts.length - 1 && it.reason ? ':' : ''}\u0001`).join('\n');
        return name + (it.reason ? ' ' + it.reason : '');
      });
      // 3 items: fixed cells (2 on top, 1 centered), each at least 300px tall incl. label -> 2 rows + 20px gap
      const three = items.length === 3;
      const gridMin = three ? 2 * 300 + 20 : n <= 2 ? 440 : 600; // keep the images a useful size
      const room = BOTTOM - gridMin - (three ? 24 : 44) - y;
      const heightAt = (sz) => texts.reduce((a, t) => a + wrapRich(ctx, t, BODY, sz, io.maxW).length * sz * io.lh + gap, -gap);
      let size = 40;
      while (size > (three ? 28 : 30) && heightAt(size) > room) size -= 2; // 3 items may go a bit smaller to keep 300px rows
      let left = room;
      for (let i = 0; i < texts.length; i++) {
        const lineH = size * io.lh;
        const maxLines = Math.floor(left / lineH);
        if (maxLines < 1) { warn(`${texts.length - i} item(s) didn't fit and were left out. Shorten the reasons.`); break; }
        const fit = fitRich(ctx, texts[i], { ...io, size, min: size, maxLines, name: `Item ${i + 1}` });
        const ny = drawLines(ctx, fit.lines, M, y, size, io);
        left -= ny - y + gap;
        y = ny + gap;
      }
      if (!items.length && !R.exporting) {
        ctx.font = BODY(36, false);
        ctx.fillStyle = C.placeholder;
        ctx.fillText('Add items like "- Lat Pulldown: one-line reason"', M, y + 30);
        y += 60;
      }
      if (three) {
        // grid takes all the space below the text: 440px-wide cells, images trimmed of transparent
        // padding and as large as fits, labels 12px below (same cells as [reference])
        referenceGrid(ctx, R, items.map((it) => it.name), y - gap + 24);
      } else {
        imageGrid(ctx, R, items.map((it) => it.name), Math.max(y - gap + 44, H / 2));
      }
    },

    cta(ctx, f, R) {
      let y = TOP - 6;
      y = richBlock(ctx, hint(R, f.headline, 'Headline'), M, y, HEAD_O(112, 64, { maxLines: 3, name: 'Headline' })).bottom + 30;
      y = divider(ctx, M, y) + 32;
      const budget = () => BOTTOM - IMG_MIN - 40 - y;
      if (f.body) y = richBlock(ctx, f.body, M, y, BODY_O(38, 30, { lh: 1.4, maxLines: 4, maxH: budget() - (f.action ? 60 : 0), name: 'Body' })).bottom + 26;
      if (f.action) {
        const act = f.action.includes('**') ? f.action : f.action.replace(/(["“][^"”]+["”])/, '**$1**');
        y = richBlock(ctx, act, M, y, BODY_O(40, 30, { font: (s, b) => `${b ? 700 : 600} ${s}px Inter, system-ui, sans-serif`, lh: 1.35, maxLines: 3, maxH: Math.max(60, budget()), color: C.charcoal, name: 'Action line' })).bottom;
      }
      const top = Math.max(y + 40, H * 0.5);
      placeImage(ctx, R, 'main', { x: M, y: top, w: W - 2 * M, h: BOTTOM + 20 - top }, { label: 'Product / REP image' });
    },

    explainer(ctx, f, R) {
      let y = TOP - 4;
      if (f.label) {
        const parts = f.label.split('\n'); // " | " in the label makes extra lines
        parts.forEach((t, i) => spacedLabel(ctx, t, M, y + 26 + i * 40, W - 2 * M, 'left', 'Label'));
        y += 34 + 30 + (parts.length - 1) * 40;
      }
      const imgMin = 400; // keep REP clearly visible
      y = richBlock(ctx, hint(R, f.headline, 'Headline'), M, y, HEAD_O(116, 60, { maxLines: 3, name: 'Headline' })).bottom + 34;
      if (f.body) y = richBlock(ctx, f.body, M, y, BODY_O(40, 30, { lh: 1.42, maxH: H - imgMin - 36 - y, name: 'Body' })).bottom;
      if (f.corner === 'center') {
        // as large as fits between the last text and the bottom margin, centered, never cropped
        const top = (f.body ? y : y - 34) + 36; // without a body, start right under the headline
        placeImage(ctx, R, 'main', { x: M, y: top, w: W - 2 * M, h: BOTTOM - top }, { valign: 'bottom', label: 'REP expression' });
        return;
      }
      const left = f.corner === 'left';
      const top = Math.max(y + 36, H - 620);
      const bw = 520;
      placeImage(ctx, R, 'main', { x: left ? M - 20 : W - M + 20 - bw, y: top, w: bw, h: H - top }, { valign: 'bottom', halign: left ? 'left' : 'right', label: 'REP expression' });
    },
  };

  function drawPlate(ctx, cx, cy, r, fill) {
    const draw = (color) => {
      ctx.fillStyle = color;
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
      // inner ring + hole in cream
      ctx.strokeStyle = C.cream; ctx.lineWidth = 3.5;
      ctx.beginPath(); ctx.arc(cx, cy, r * 0.66, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = C.cream;
      ctx.beginPath(); ctx.arc(cx, cy, r * 0.24, 0, Math.PI * 2); ctx.fill();
    };
    draw(C.plateEmpty);
    if (fill > 0) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(cx - r - 1, cy - r - 1, (2 * r + 2) * fill, 2 * r + 2);
      ctx.clip();
      draw(C.orange);
      ctx.restore();
    }
  }

  function renderSlide(canvas, slide, R) {
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    noShadow(ctx);
    ctx.fillStyle = C.cream;
    ctx.fillRect(0, 0, W, H);
    drawSlide(ctx, slide, R);
  }
  // Draws one slide in 1080x1350 slide coordinates on whatever transform ctx has.
  function drawSlide(ctx, slide, R) {
    noShadow(ctx);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    renderWarnings = R.warnings = [];
    try { RENDER[slide.type](ctx, slide.f, R); } catch (e) { console.error(e); warn('This slide could not be drawn: ' + e.message); }
    renderWarnings = null;
    noShadow(ctx);
    drawChrome(ctx, R);
  }

  // ---------- App state ----------
  const $ = (id) => document.getElementById(id);
  const srcEl = $('src');
  let slides = [];
  let slots = {};                           // "idx:type:key" -> imageId (for the open carousel)
  let logoId = LS.get('rep.logo', null);
  const canvases = [];

  const slotId = (i, type, key) => `${i}:${type}:${key}`;
  const entryFor = (id) => (id && images.has(id) ? images.get(id) : null);
  function ctxFor(i, exporting, reel) {
    const s = slides[i];
    return {
      index: i, total: slides.length, exporting, reel: !!reel,
      slot: (key) => entryFor(slots[slotId(i, s.type, key)]),
      logo: () => entryFor(logoId),
    };
  }

  function renderAll() {
    slides.forEach((s, i) => {
      if (!canvases[i]) return;
      const R = ctxFor(i, false);
      renderSlide(canvases[i], s, R);
      const box = canvases[i].closest('.slide-card').querySelector('.slide-warn');
      if (box) box.innerHTML = R.warnings.map((w) => `<div>${esc(w)}</div>`).join('');
    });
  }

  function rebuild() {
    const { slides: parsed, errors } = parse(srcEl.value);
    slides = parsed;
    $('errors').innerHTML = errors.map((e) => `<div>${esc(e)}</div>`).join('');
    $('slideCount').textContent = slides.length ? `· ${slides.length} slide${slides.length > 1 ? 's' : ''}` : '';
    const car = $('carousel');
    const keepScroll = car.scrollLeft;
    car.innerHTML = '';
    canvases.length = 0;
    if (!slides.length) {
      car.innerHTML = '<div class="slide-card"><div class="lib-empty" style="width:100%;max-width:420px">Paste your slide text or tap <b>Load example</b>.</div></div>';
    }
    slides.forEach((s, i) => {
      const card = document.createElement('div');
      card.className = 'slide-card';
      const meta = document.createElement('div');
      meta.className = 'slide-meta';
      meta.innerHTML = `<span class="type-tag">${i + 1}. ${s.type}</span>`;
      const dl = document.createElement('button');
      dl.className = 'btn small ghost';
      dl.type = 'button';
      dl.textContent = 'PNG';
      dl.title = 'Download this slide';
      dl.onclick = () => downloadOne(i);
      meta.appendChild(dl);
      const wrap = document.createElement('div');
      wrap.className = 'slide-canvas-wrap';
      const cv = document.createElement('canvas');
      cv.width = W; cv.height = H;
      cv.setAttribute('aria-label', `Slide ${i + 1}: ${s.type}`);
      wrap.appendChild(cv);
      canvases[i] = cv;
      const slotBox = document.createElement('div');
      slotBox.className = 'slots';
      for (const def of SLOT_DEFS[s.type](s.f)) {
        slotBox.appendChild(slotRow(def, slotId(i, s.type, def.key)));
      }
      const warnBox = document.createElement('div');
      warnBox.className = 'slide-warn';
      warnBox.setAttribute('aria-live', 'polite');
      card.append(meta, wrap, warnBox, slotBox);
      car.appendChild(card);
    });
    buildDots();
    renderAll();
    car.scrollLeft = keepScroll;
    updateDots();
  }

  function slotRow(def, sid, opts = {}) {
    const row = document.createElement('div');
    const id = opts.get ? opts.get() : slots[sid];
    const entry = entryFor(id);
    row.className = 'slot-row' + (entry ? ' filled' : '');
    const thumb = document.createElement('div');
    thumb.className = 'slot-thumb';
    if (entry) { const im = document.createElement('img'); im.src = entry.url; im.alt = ''; thumb.appendChild(im); }
    else thumb.textContent = '+';
    const name = document.createElement('div');
    name.className = 'slot-name';
    name.innerHTML = `${esc(def.label)}<small>${entry ? esc(entry.rec.name) : 'No image yet'}</small>`;
    const act = document.createElement('div');
    act.className = 'slot-actions';
    const set = opts.set || ((v) => { if (v) slots[sid] = v; else delete slots[sid]; markDirty(); });
    const after = () => refreshAfterImageChange();

    const up = document.createElement('label');
    up.className = 'btn ghost';
    up.textContent = 'Upload';
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = 'image/*'; inp.hidden = true;
    inp.onchange = async () => {
      const file = inp.files && inp.files[0];
      if (!file) return;
      const newId = await addImageFile(file, def.cat);
      set(newId); after();
      toast('Saved to library');
    };
    up.appendChild(inp);
    const lib = document.createElement('button');
    lib.className = 'btn ghost'; lib.type = 'button'; lib.textContent = 'Library';
    lib.onclick = () => openLibrary((pick) => { set(pick); after(); }, def);
    act.append(up, lib);
    if (entry) {
      const clr = document.createElement('button');
      clr.className = 'btn ghost icon'; clr.type = 'button'; clr.textContent = '✕';
      clr.setAttribute('aria-label', 'Remove image');
      clr.onclick = () => { set(null); after(); };
      act.appendChild(clr);
    }
    row.append(thumb, name, act);
    return row;
  }

  function renderLogoSlot() {
    const box = $('logoSlot');
    const row = slotRow({ label: 'Logo icon', cat: 'Logo' }, null, {
      get: () => logoId,
      set: (v) => { logoId = v || null; LS.set('rep.logo', logoId); },
    });
    box.replaceWith(row);
    row.id = 'logoSlot';
  }

  function refreshAfterImageChange() {
    rebuild();
    renderLogoSlot();
  }

  // ---------- Carousel nav ----------
  function currentIndex() {
    const car = $('carousel');
    const card = car.firstElementChild;
    if (!card) return 0;
    const step = card.getBoundingClientRect().width + 16;
    return Math.round(car.scrollLeft / step);
  }
  function goTo(i) {
    const car = $('carousel');
    const card = car.children[Math.max(0, Math.min(i, car.children.length - 1))];
    if (card) car.scrollTo({ left: card.offsetLeft - car.offsetLeft, behavior: 'smooth' });
  }
  function buildDots() {
    const d = $('dots');
    d.innerHTML = '';
    slides.forEach((_, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.setAttribute('aria-label', `Go to slide ${i + 1}`);
      b.onclick = () => goTo(i);
      d.appendChild(b);
    });
  }
  function updateDots() {
    const i = currentIndex();
    [...$('dots').children].forEach((b, k) => b.classList.toggle('on', k === i));
    // size the carousel to the slide(s) in view, so short slides don't leave a gap
    const car = $('carousel');
    const cr = car.getBoundingClientRect();
    let h = 0;
    for (const c of car.children) {
      const r = c.getBoundingClientRect();
      if (r.right > cr.left + 8 && r.left < cr.right - 8) h = Math.max(h, c.offsetHeight);
    }
    if (h) car.style.height = h + 4 + 'px';
  }
  $('carousel').addEventListener('scroll', () => requestAnimationFrame(updateDots), { passive: true });
  window.addEventListener('resize', () => requestAnimationFrame(updateDots));
  $('prev').onclick = () => goTo(currentIndex() - 1);
  $('next').onclick = () => goTo(currentIndex() + 1);

  // ---------- Library modal ----------
  let libFilter = 'All';
  let pickCb = null;
  function openLibrary(cb, def) {
    pickCb = cb || null;
    $('libMode').textContent = cb ? `Tap an image to use it for: ${def.label}` : '';
    if (def && def.cat) $('libCategory').value = def.cat;
    $('libModal').hidden = false;
    document.body.style.overflow = 'hidden';
    renderLibrary();
  }
  function closeLibrary() {
    $('libModal').hidden = true;
    document.body.style.overflow = '';
    pickCb = null;
  }
  function renderLibrary() {
    const filters = ['All', 'REP', ...CATEGORIES];
    const fc = $('libFilters');
    fc.innerHTML = '';
    for (const name of filters) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'chip' + (libFilter === name ? ' on' : '');
      b.textContent = name === 'REP' ? 'All REP' : name;
      b.onclick = () => { libFilter = name; renderLibrary(); };
      fc.appendChild(b);
    }
    const grid = $('libGrid');
    grid.innerHTML = '';
    const list = [...images.values()]
      .filter((e) => libFilter === 'All' || (libFilter === 'REP' ? e.rec.category.startsWith('REP') : e.rec.category === libFilter))
      .sort((a, b) => b.rec.created - a.rec.created);
    if (!list.length) {
      grid.innerHTML = `<div class="lib-empty">No images here yet. Upload transparent PNGs above — they're saved in this browser for next time.</div>`;
      return;
    }
    for (const e of list) {
      const it = document.createElement('div');
      it.className = 'lib-item' + (pickCb ? ' pickable' : '');
      const imgBox = document.createElement('div');
      imgBox.className = 'lib-img';
      const im = document.createElement('img');
      im.src = e.url; im.alt = e.rec.name; im.loading = 'lazy';
      imgBox.appendChild(im);
      const nm = document.createElement('div');
      nm.className = 'lib-name'; nm.textContent = e.rec.name;
      const sel = document.createElement('select');
      sel.setAttribute('aria-label', 'Category');
      for (const c of CATEGORIES) { const o = document.createElement('option'); o.value = o.textContent = c; sel.appendChild(o); }
      sel.value = e.rec.category;
      sel.onclick = (ev) => ev.stopPropagation();
      sel.onchange = async () => { e.rec.category = sel.value; if (dbOk) await DB.put(e.rec).catch(() => {}); renderLibrary(); };
      const row = document.createElement('div');
      row.className = 'lib-row';
      if (pickCb) {
        const use = document.createElement('button');
        use.className = 'btn primary'; use.type = 'button'; use.textContent = 'Use';
        row.appendChild(use);
      }
      const del = document.createElement('button');
      del.className = 'btn ghost danger'; del.type = 'button'; del.textContent = 'Delete';
      del.onclick = async (ev) => {
        ev.stopPropagation();
        if (!(await ask('Delete this image from the library?', 'Delete'))) return;
        if (dbOk) await DB.del(e.rec.id).catch(() => {});
        URL.revokeObjectURL(e.url);
        images.delete(e.rec.id);
        renderLibrary();
        refreshAfterImageChange();
      };
      row.appendChild(del);
      it.append(imgBox, nm, sel, row);
      if (pickCb) it.onclick = () => { const cb = pickCb; closeLibrary(); cb(e.rec.id); };
      grid.appendChild(it);
    }
  }
  (() => {
    const sel = $('libCategory');
    for (const c of CATEGORIES) { const o = document.createElement('option'); o.value = o.textContent = c; sel.appendChild(o); }
    sel.value = 'REP · neutral';
  })();
  $('libFile').onchange = async () => {
    const files = [...($('libFile').files || [])];
    for (const f of files) await addImageFile(f, $('libCategory').value);
    $('libFile').value = '';
    if (files.length) toast(`${files.length} image${files.length > 1 ? 's' : ''} saved`);
    renderLibrary();
  };
  $('libClose').onclick = closeLibrary;
  $('libModal').addEventListener('click', (e) => { if (e.target === $('libModal')) closeLibrary(); });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || !$('askModal').hidden) return;
    if (!$('libModal').hidden) closeLibrary();
    else if (!$('savedModal').hidden) closeSaved();
    else if (!$('exportModal').hidden) closeExport();
  });
  $('btnLibrary').onclick = () => openLibrary(null, null);

  // ---------- Export ----------
  function coverName() {
    const c = slides.find((s) => s.type === 'cover');
    const base = c ? [...c.f.title, ...c.f.accent].join(' ').replace(/\*\*/g, '') : '';
    const slug = base.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
    return slug || 'rep-carousel';
  }
  function exportBlob(i) {
    const cv = document.createElement('canvas');
    renderSlide(cv, slides[i], ctxFor(i, true));
    return new Promise((res) => cv.toBlob(res, 'image/png'));
  }

  // 9:16 Reel slide: the 1080x1350 design, scaled and centered vertically on a 1080x1920 cream frame.
  // Instagram's Reel overlays cover the top 220px, bottom 400px and right 120px. Slide content sits
  // inside the slide's 80px margins (images included, see placeImage), so at REEL_SCALE:
  //   content top    = 960 - 595 * 0.905 ≈ 421   (≥ 220)
  //   content bottom = 960 + 615 * 0.905 ≈ 1517  (≤ 1520; tallest content ends 20px below the margin)
  //   content right  = 51.3 + 1000 * 0.905 ≈ 956 (≤ 960)
  const REEL = { W: 1080, H: 1920, SAFE: { top: 220, bottom: 1920 - 400, right: 1080 - 120 } };
  const REEL_SCALE = 0.905;
  // The Reel safe zone in 1080x1350 slide coordinates (left mirrors right so images stay centered):
  // right = (960 - 51.3) / 0.905 ≈ 1004, bottom = (1520 - 349.1) / 0.905 ≈ 1293, left = 1080 - 1004 = 76.
  const REEL_SAFE_SLIDE = (() => {
    const ox = (REEL.W - W * REEL_SCALE) / 2, oy = (REEL.H - H * REEL_SCALE) / 2;
    const right = Math.floor((REEL.SAFE.right - ox) / REEL_SCALE);
    return { left: W - right, right, bottom: Math.floor((REEL.SAFE.bottom - oy) / REEL_SCALE) };
  })();
  function reelCanvas(i) {
    const cv = document.createElement('canvas');
    cv.width = REEL.W; cv.height = REEL.H;
    const ctx = cv.getContext('2d');
    ctx.fillStyle = C.cream;
    ctx.fillRect(0, 0, REEL.W, REEL.H);
    const sw = W * REEL_SCALE, sh = H * REEL_SCALE;
    ctx.setTransform(REEL_SCALE, 0, 0, REEL_SCALE, (REEL.W - sw) / 2, (REEL.H - sh) / 2);
    drawSlide(ctx, slides[i], ctxFor(i, true, true));
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    return cv;
  }
  function reelBlob(i) {
    const cv = reelCanvas(i);
    return new Promise((res) => cv.toBlob(res, 'image/png'));
  }
  // Inside a claude.ai hosted page, downloads go through the host's save prompt.
  let hostDownloads = null;
  async function saveBlob(blob, name) {
    if (!hostDownloads) hostDownloads = (window.claude && typeof window.claude.use === 'function')
      ? window.claude.use('downloads').catch(() => null) : Promise.resolve(null);
    const dl = await hostDownloads;
    if (dl) {
      try { await dl.save({ filename: name, data: blob }); return true; }
      catch (e) { if (e && e.code === 'declined') return false; if (e && e.code !== 'unavailable' && e.code !== 'not_granted') { toast('Download failed: ' + (e.message || e.code)); return false; } }
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    return true;
  }
  function missingCount() {
    let n = 0;
    slides.forEach((s, i) => { for (const d of SLOT_DEFS[s.type](s.f)) if (!entryFor(slots[slotId(i, s.type, d.key)])) n++; });
    return n;
  }
  async function downloadOne(i) {
    await fontsReady;
    const blob = await exportBlob(i);
    saveBlob(blob, `${coverName()}-${String(i + 1).padStart(2, '0')}.png`);
  }
  // Shared check before any export: returns false if the user cancels.
  async function preflight() {
    if (!slides.length) { toast('Add some slides first'); return false; }
    const miss = missingCount();
    const probs = $('errors').children.length + document.querySelectorAll('.slide-warn > div').length;
    const notes = [];
    if (miss) notes.push(`${miss} image slot${miss > 1 ? 's are' : ' is'} still empty and will be left blank.`);
    if (probs) notes.push(`${probs} text problem${probs > 1 ? 's are' : ' is'} listed in red in the editor or under the slides.`);
    return !notes.length || ask(`${notes.join(' ')} Export anyway?`, 'Export anyway');
  }
  $('btnZip').onclick = () => exportZip($('btnZip'), false);
  $('btnReelZip').onclick = () => exportZip($('btnReelZip'), true);
  async function exportZip(btn, reel) {
    if (!(await preflight())) return;
    btn.disabled = true;
    const old = btn.textContent;
    try {
      await fontsReady;
      const zip = new JSZip();
      const name = coverName() + (reel ? '-reel' : '');
      for (let i = 0; i < slides.length; i++) {
        btn.textContent = `Rendering ${i + 1}/${slides.length}`;
        zip.file(`${name}-${String(i + 1).padStart(2, '0')}.png`, await (reel ? reelBlob(i) : exportBlob(i)));
      }
      btn.textContent = 'Zipping…';
      const blob = await zip.generateAsync({ type: 'blob' });
      if (await saveBlob(blob, `${name}.zip`)) toast(reel ? 'Reel slides downloaded' : 'ZIP downloaded');
    } catch (e) {
      console.error(e);
      toast('Export failed: ' + e.message);
    } finally {
      btn.disabled = false;
      btn.textContent = old;
    }
  };



  // ---------- Publish slides (GitHub repo + Pages) ----------
  // Commits every slide (4:5 and 9:16) to posts/<cover-title>-<date>/ on main in one commit. A push to main
  // is the GitHub Pages deploy, so each slide then has a public URL under PUB.site. Uses the Git Data API
  // (blobs -> tree -> commit -> ref) with a fine-grained token kept in localStorage on this device only.
  const PUB = {
    owner: 'ashtontraudt', repo: 'Rep-carousel', branch: 'main',
    site: 'https://ashtontraudt.github.io/Rep-carousel/', api: 'https://api.github.com',
  };
  let pubBusy = false, pubUrls = [];
  const pubToken = () => LS.get('rep.ghToken', '') || '';
  function localDate() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  const pubFolder = () => `posts/${coverName()}-${localDate()}`;
  function showPubToken() {
    const has = !!pubToken();
    $('pubTokenBox').hidden = has;
    $('pubTokenSaved').hidden = !has;
    $('pubFolder').textContent = pubFolder() + '/';
  }
  $('pubForget').onclick = () => {
    try { localStorage.removeItem('rep.ghToken'); } catch { /* ignore */ }
    $('pubToken').value = '';
    showPubToken();
  };
  async function gh(path, opts = {}) {
    const r = await fetch(`${PUB.api}/repos/${PUB.owner}/${PUB.repo}${path}`, {
      method: opts.method || 'GET',
      headers: {
        Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28',
        Authorization: `Bearer ${opts.token}`, ...(opts.body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
      cache: 'no-store',
    });
    if (opts.allow404 && r.status === 404) return null;
    if (!r.ok) {
      let m = '';
      try { m = (await r.json()).message || ''; } catch { /* ignore */ }
      const e = new Error(m || `GitHub error ${r.status}`);
      e.status = r.status;
      throw e;
    }
    return r.json();
  }
  function blobB64(blob) {
    return new Promise((res, rej) => {
      const fr = new FileReader();
      fr.onload = () => res(String(fr.result).slice(String(fr.result).indexOf(',') + 1));
      fr.onerror = () => rej(fr.error);
      fr.readAsDataURL(blob);
    });
  }
  function pubError(e) {
    if (e.status === 401) return 'GitHub did not accept the token. Check it or make a new one, then paste it again.';
    if (e.status === 403 || e.status === 404) return `The token can't write to ${PUB.repo}. It needs access to the Rep-carousel repository with Contents: Read and write.`;
    if (e instanceof TypeError) return 'Could not reach GitHub. Check your connection and try again.';
    return 'Publishing failed: ' + e.message;
  }
  function pubMsg(msg, err) { $('pubMsg').textContent = msg; $('pubMsg').classList.toggle('err', !!err); }
  function showPubResult(files, live) {
    pubUrls = files.map((f) => PUB.site + f.path);
    const group = (title, list) => list.length ? `<div class="pub-group"><h4>${esc(title)}</h4>${
      list.map((f) => `<a href="${esc(PUB.site + f.path)}" target="_blank" rel="noopener">${esc(PUB.site + f.path)}</a>`).join('')}</div>` : '';
    $('pubList').innerHTML = group('Carousel 4:5 (1080×1350)', files.filter((f) => !f.reel && !f.video)) +
      group('Reel 9:16 (1080×1920)', files.filter((f) => f.reel)) + group('Reel video MP4 (1080×1920)', files.filter((f) => f.video));
    const nv = files.filter((f) => f.video).length;
    $('pubCount').textContent = `${files.length - nv} slide links${nv ? ' + video' : ''}${live ? '' : ' (going live shortly)'}`;
    $('pubResult').hidden = false;
  }
  $('btnPubCopy').onclick = async () => {
    try { await navigator.clipboard.writeText(pubUrls.join('\n')); toast('Links copied'); }
    catch { toast('Could not copy. Select the links and copy them by hand.'); }
  };
  // Waits until GitHub Pages serves the new commit (checked on one of the new files, cache-busted).
  async function waitLive(url, sha) {
    const until = Date.now() + 6 * 60 * 1000;
    while (Date.now() < until) {
      try {
        const r = await fetch(`${url}?v=${sha.slice(0, 7)}-${Date.now()}`, { method: 'HEAD', cache: 'no-store' });
        if (r.ok) return true;
      } catch { /* not there yet, or the request was blocked */ }
      await new Promise((r) => setTimeout(r, 5000));
    }
    return false;
  }
  $('btnPublish').onclick = publish;
  async function publish() {
    if (pubBusy) return;
    const typed = $('pubToken').value.trim();
    const token = typed || pubToken();
    if (!token) { pubMsg('Paste a GitHub token first.', true); $('pubToken').focus(); return; }
    if (!(await preflight())) return;
    const btn = $('btnPublish'), old = btn.textContent;
    pubBusy = true;
    btn.disabled = true;
    $('pubResult').hidden = true;
    const folder = pubFolder(), name = coverName();
    try {
      await fontsReady;
      pubMsg('Checking the repository…');
      const ref = await gh(`/git/ref/heads/${PUB.branch}`, { token });
      if (typed) { LS.set('rep.ghToken', typed); $('pubToken').value = ''; showPubToken(); }
      const existing = await gh(`/contents/${folder}?ref=${PUB.branch}`, { token, allow404: true });
      const oldFiles = Array.isArray(existing) ? existing.filter((x) => x.type === 'file').map((x) => x.path) : [];
      if (oldFiles.length && !(await ask(`${folder}/ was already published today. Replace it with these slides? Its old links will show the new slides.`, 'Replace'))) {
        pubMsg('');
        return;
      }
      const files = [];
      const total = slides.length * 2;
      for (const reel of [false, true]) {
        for (let i = 0; i < slides.length; i++) {
          const n = files.length + 1;
          btn.textContent = `Rendering ${n}/${total}`;
          pubMsg(`Rendering and uploading slide ${n} of ${total}…`);
          const file = `${name}${reel ? '-reel' : ''}-${String(i + 1).padStart(2, '0')}.png`;
          const blob = await (reel ? reelBlob(i) : exportBlob(i));
          btn.textContent = `Uploading ${n}/${total}`;
          const b = await gh('/git/blobs', { token, method: 'POST', body: { content: await blobB64(blob), encoding: 'base64' } });
          files.push({ path: `${folder}/${file}`, sha: b.sha, reel });
        }
      }
      let vidNote = '';
      try {
        btn.textContent = 'Making video…';
        const vblob = await makeSlidesVideo((p) => pubMsg(`Making ${name}-reel.mp4… ${Math.round(p * 100)}%`));
        btn.textContent = 'Uploading video…';
        pubMsg(`Uploading ${name}-reel.mp4 (${(vblob.size / 1048576).toFixed(1)} MB)…`);
        const b = await gh('/git/blobs', { token, method: 'POST', body: { content: await blobB64(vblob), encoding: 'base64' } });
        files.push({ path: `${folder}/${name}-reel.mp4`, sha: b.sha, video: true });
      } catch (e) {
        if (e.status) throw e;
        console.error(e);
        vidNote = e.message === 'UNSUPPORTED'
          ? " The MP4 was skipped: this browser can't make video (use a recent Chrome or Edge, or Safari 17+)."
          : ' The MP4 was skipped: ' + (e.message || e) + '.';
      }
      btn.textContent = 'Saving…';
      pubMsg('Saving to the repository…');
      const paths = new Set(files.map((f) => f.path));
      const tree = [
        ...files.map((f) => ({ path: f.path, mode: '100644', type: 'blob', sha: f.sha })),
        ...oldFiles.filter((p) => !paths.has(p)).map((p) => ({ path: p, mode: '100644', type: 'blob', sha: null })),
      ];
      let commitSha = null, head = ref.object.sha;
      for (let attempt = 0; attempt < 3 && !commitSha; attempt++) {
        if (attempt) head = (await gh(`/git/ref/heads/${PUB.branch}`, { token })).object.sha;
        const base = await gh(`/git/commits/${head}`, { token });
        const t = await gh('/git/trees', { token, method: 'POST', body: { base_tree: base.tree.sha, tree } });
        const c = await gh('/git/commits', {
          token, method: 'POST',
          body: { message: `Publish ${folder} (${slides.length} slides, 4:5 and 9:16${files.some((f) => f.video) ? ', reel MP4' : ''})`, tree: t.sha, parents: [head] },
        });
        try {
          await gh(`/git/refs/heads/${PUB.branch}`, { token, method: 'PATCH', body: { sha: c.sha, force: false } });
          commitSha = c.sha;
        } catch (e) { if (e.status !== 422 || attempt === 2) throw e; } // main moved meanwhile: rebuild on top of it
      }
      showPubResult(files, false);
      btn.textContent = 'Deploying…';
      pubMsg('Saved. Waiting for the site to redeploy (usually about a minute)…');
      const live = await waitLive(PUB.site + files[files.length - 1].path, commitSha);
      showPubResult(files, live);
      pubMsg((live ? 'Published. The links below are live.' : 'Saved to the repository. The site is still redeploying, so the links may take a few more minutes to work.') + vidNote, !live || !!vidNote);
      if (live) toast('Slides published');
    } catch (e) {
      console.error(e);
      if (e.status === 401) { $('pubForget').onclick(); $('pubToken').value = typed; }
      pubMsg(pubError(e), true);
    } finally {
      pubBusy = false;
      btn.disabled = false;
      btn.textContent = old;
    }
  }

  // ---------- Reel video export (WebCodecs H.264 + MP4) ----------
  const VID_FPS = 30;
  const TRANS_SEC = 0.5;
  let vidBlob = null, vidUrl = null, vidBusy = false;

  // ----- Beat sync: slide changes land on the beats of a song (BPM + first-beat offset) -----
  const BEAT_CHOICES = [1, 2, 3, 4, 6, 8, 12, 16];
  // roughly how long each slide type needs to be read, used for the Auto beat counts
  const READ_SEC = { cover: 2.5, tip: 3.5, rank: 3, tier: 2, tiergroup: 5, reference: 4, cta: 4, explainer: 5 };
  const clampBpm = (v) => Math.min(240, Math.max(40, +v || 120));
  const beatSec = () => 60 / clampBpm(work && work.bpm);
  const beatOffset = () => Math.min(10, Math.max(0, +(work && work.offset) || 0));
  function autoBeats(s) {
    const want = (READ_SEC[s.type] || 3) / beatSec();
    // nearest musical count; slides shorter than a beat get 1
    return BEAT_CHOICES.reduce((a, b) => (Math.abs(b - want) < Math.abs(a - want) ? b : a), 1);
  }
  const beatsFor = (i) => {
    const v = work && work.beats && work.beats[i];
    return BEAT_CHOICES.includes(v) ? v : autoBeats(slides[i]);
  };
  // seconds each slide is on screen; the first slide also covers the lead-in before the first beat
  function slideDurations(o) {
    if (o.sec !== 'beat') return slides.map(() => +o.sec);
    const spb = beatSec();
    return slides.map((s, i) => beatsFor(i) * spb + (i === 0 ? beatOffset() : 0));
  }
  function slideLabel(s) {
    const f = s.f || {};
    const pick = ['title', 'headline', 'name', 'letter', 'label'].map((k) => f[k]).find((v) => v && String(v).trim());
    const txt = Array.isArray(pick) ? pick.join(' ') : String(pick || '');
    return txt.replace(/\*\*/g, '').replace(/[ \t]+\|[ \t]+/g, ' ').replace(/\s+/g, ' ').trim();
  }
  function saveBeatSettings() {
    storeWorkingCopy();
    clearVideo();
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => { flushSave(); }, 700);
    updateVidInfo();
  }
  function renderBeatList() {
    const box = $('beatList');
    box.innerHTML = '';
    const spb = beatSec();
    slides.forEach((s, i) => {
      const row = document.createElement('div');
      row.className = 'beat-item';
      const no = document.createElement('span'); no.className = 'beat-no'; no.textContent = i + 1;
      const nm = document.createElement('span'); nm.className = 'beat-name';
      nm.innerHTML = `<b>${esc(s.type)}</b>${esc(slideLabel(s))}`;
      nm.title = slideLabel(s);
      const sel = document.createElement('select');
      sel.setAttribute('aria-label', `Beats for slide ${i + 1}`);
      const set = work.beats && BEAT_CHOICES.includes(work.beats[i]);
      sel.innerHTML = `<option value="">Auto: ${autoBeats(s)}</option>` +
        BEAT_CHOICES.map((b) => `<option value="${b}"${set && work.beats[i] === b ? ' selected' : ''}>${b} beat${b > 1 ? 's' : ''}</option>`).join('');
      const sec = document.createElement('span'); sec.className = 'beat-sec';
      sec.textContent = (beatsFor(i) * spb).toFixed(1) + ' s';
      sel.onchange = () => {
        work.beats = (work.beats || []).slice();
        work.beats[i] = sel.value ? +sel.value : null;
        sec.textContent = (beatsFor(i) * spb).toFixed(1) + ' s';
        saveBeatSettings();
      };
      row.append(no, nm, sel, sec);
      box.appendChild(row);
    });
  }
  function showBeatPanel() {
    const on = $('vidSec').value === 'beat';
    $('beatPanel').hidden = !on;
    if (!on) { stopMetro(); return; }
    $('vidBpm').value = clampBpm(work.bpm);
    $('vidOffset').value = beatOffset();
    renderBeatList();
  }
  $('vidBpm').addEventListener('change', () => {
    work.bpm = clampBpm($('vidBpm').value);
    $('vidBpm').value = work.bpm;
    renderBeatList();
    saveBeatSettings();
  });
  $('vidOffset').addEventListener('change', () => {
    work.offset = Math.round(Math.min(10, Math.max(0, +$('vidOffset').value || 0)) * 100) / 100;
    $('vidOffset').value = work.offset;
    saveBeatSettings();
  });
  document.querySelectorAll('[data-all]').forEach((b) => b.addEventListener('click', () => {
    const v = b.dataset.all;
    work.beats = v === 'auto' ? [] : slides.map(() => +v);
    renderBeatList();
    saveBeatSettings();
  }));

  // Tap tempo: average the gaps between the last few taps. A pause over 2 s starts a new count.
  let taps = [];
  $('btnTap').addEventListener('pointerdown', (e) => {
    e.preventDefault();
    const now = performance.now();
    if (taps.length && now - taps[taps.length - 1] > 2000) taps = [];
    taps.push(now);
    if (taps.length > 12) taps.shift();
    const btn = $('btnTap'), hint = $('tapHint');
    btn.classList.add('hit');
    setTimeout(() => btn.classList.remove('hit'), 90);
    if (taps.length < 4) {
      hint.className = 'small beat-hint';
      hint.textContent = taps.length === 1 ? 'Keep tapping…' : `Keep tapping… ${4 - taps.length} more`;
      return;
    }
    const gaps = taps.slice(1).map((t, k) => t - taps[k]);
    const bpm = clampBpm(Math.round(60000 / (gaps.reduce((a, b) => a + b, 0) / gaps.length)));
    work.bpm = bpm;
    $('vidBpm').value = bpm;
    hint.className = 'small beat-hint ok';
    hint.textContent = `${bpm} BPM from ${taps.length} taps. Keep tapping to fine-tune, or press ▶ Click to check it against the song.`;
    renderBeatList();
    saveBeatSettings();
  });

  // Clicks: Web Audio, so they are timed to the sample, not to the screen.
  let audioCtx = null;
  function getAC() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    return audioCtx;
  }
  function click(time, accent) {
    const ac = getAC();
    const osc = ac.createOscillator(), gain = ac.createGain();
    osc.frequency.value = accent ? 1760 : 1100;
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(accent ? 0.6 : 0.35, time + 0.002);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.06);
    osc.connect(gain).connect(ac.destination);
    osc.start(time);
    osc.stop(time + 0.07);
    return osc;
  }
  let metroTimer = null;
  function stopMetro() {
    clearInterval(metroTimer);
    metroTimer = null;
    $('btnMetro').textContent = '▶ Click';
  }
  $('btnMetro').onclick = () => {
    if (metroTimer) return stopMetro();
    const ac = getAC();
    let next = ac.currentTime + 0.06, k = 0;
    metroTimer = setInterval(() => {
      while (next < ac.currentTime + 0.2) { click(next, k % 4 === 0); next += beatSec(); k++; }
    }, 25);
    $('btnMetro').textContent = '■ Stop';
  };

  function vidOptions() {
    const o = { format: $('vidFormat').value, sec: $('vidSec').value === 'beat' ? 'beat' : +$('vidSec').value, trans: $('vidTrans').value };
    o.durs = slideDurations(o);
    o.total = o.durs.reduce((a, b) => a + b, 0);
    return o;
  }
  function updateVidInfo() {
    const o = vidOptions();
    const el = $('vidLength');
    el.className = 'muted small';
    if (!slides.length) { el.textContent = ''; return; }
    const n = `${slides.length} slide${slides.length > 1 ? 's' : ''}`;
    if (o.sec === 'beat') {
      const beats = slides.reduce((a, s, i) => a + beatsFor(i), 0);
      el.textContent = `${n} · ${beats} beats at ${clampBpm(work.bpm)} BPM = ${o.total.toFixed(1)} s video`;
      if (o.total > 90) { el.className = 'small vid-warn'; el.textContent += '. Over 90 s: Instagram music may stop before the video ends.'; }
    } else {
      el.textContent = `${n} × ${o.sec} s = ${o.total} s video`;
    }
  }
  ['vidFormat', 'vidSec', 'vidTrans'].forEach((id) => $(id).addEventListener('change', () => {
    if (id === 'vidSec') { LS.set('rep.vidSec', $('vidSec').value); showBeatPanel(); }
    updateVidInfo(); clearVideo();
  }));
  { const saved = LS.get('rep.vidSec', null); if (saved && [...$('vidSec').options].some((op) => op.value === saved)) $('vidSec').value = saved; }

  // Preview the made video with clicks on every beat (accent on slide changes).
  let vidTiming = null, clickNodes = [], clicksArmedAt = 0;
  function stopClicks() { clickNodes.forEach((n) => { try { n.stop(); } catch { /* already stopped */ } }); clickNodes = []; }
  $('btnPlayBeat').onclick = async () => {
    if (!vidTiming) return;
    const v = $('vidPreview');
    stopClicks(); stopMetro();
    v.loop = false;
    v.pause();
    v.currentTime = 0;
    const ac = getAC();
    await ac.resume();
    try { await v.play(); } catch { return; }
    const base = ac.currentTime - v.currentTime;
    clicksArmedAt = performance.now();
    const { spb, offset, total, changes } = vidTiming;
    for (let t = offset; t < total - 0.01; t += spb) {
      const accent = changes.some((c) => Math.abs(c - t) < 0.01);
      clickNodes.push(click(base + t, accent));
    }
  };
  ['pause', 'seeking', 'ended'].forEach((ev) => $('vidPreview').addEventListener(ev, () => {
    if (!clickNodes.length || performance.now() - clicksArmedAt < 300) return; // ignore our own restart
    stopClicks();
    if (ev !== 'seeking') $('vidPreview').loop = true;
  }));

  function clearVideo() {
    stopClicks();
    if (vidUrl) URL.revokeObjectURL(vidUrl);
    vidUrl = null; vidBlob = null; vidTiming = null;
    $('vidPreview').removeAttribute('src');
    $('vidResult').hidden = true;
    $('btnPlayBeat').hidden = true;
  }
  async function pickCodec(width, height) {
    if (!('VideoEncoder' in window) || typeof Mp4Muxer === 'undefined') return null;
    // H.264 High, Main, then Baseline (Instagram needs H.264 in MP4)
    for (const codec of ['avc1.640028', 'avc1.4d0028', 'avc1.42003e', 'avc1.420034']) {
      try {
        const cfg = { codec, width, height, bitrate: 10_000_000, framerate: VID_FPS, avc: { format: 'avc' } };
        const r = await VideoEncoder.isConfigSupported(cfg);
        if (r.supported) return cfg;
      } catch { /* try next */ }
    }
    return null;
  }
  const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

  async function makeVideo(o, onProgress) {
    await fontsReady;
    const reel = o.format === 'reel';
    const VW = 1080, VH = reel ? 1920 : 1350;
    const cfg = await pickCodec(VW, VH);
    if (!cfg) throw new Error('UNSUPPORTED');
    // render every slide once at full size (export mode: no placeholders)
    const pics = slides.map((s, i) => { const c = document.createElement('canvas'); renderSlide(c, s, ctxFor(i, true)); return c; });
    // where a slide sits in the frame: reel = card centered a little high, clear of Instagram's caption area
    const sc = reel ? 0.92 : 1;
    const cw = W * sc, ch = H * sc;
    const cx = (VW - cw) / 2, cy = reel ? Math.round((VH - ch) / 2 - 60) : 0;
    const back = reel ? C.charcoal : C.cream;  // reel: slide card on charcoal so its edges read clearly
    const frame = document.createElement('canvas');
    frame.width = VW; frame.height = VH;
    const g = frame.getContext('2d');
    const card = (pic, x, alpha = 1) => {
      g.save();
      g.globalAlpha = alpha;
      if (reel) { rr(g, x, cy, cw, ch, 36); g.clip(); }
      g.drawImage(pic, x, cy, cw, ch);
      g.restore();
    };

    const muxer = new Mp4Muxer.Muxer({ target: new Mp4Muxer.ArrayBufferTarget(), video: { codec: 'avc', width: VW, height: VH, frameRate: VID_FPS }, fastStart: 'in-memory' });
    let encErr = null;
    const enc = new VideoEncoder({ output: (chunk, meta) => muxer.addVideoChunk(chunk, meta), error: (e) => { encErr = e; } });
    enc.configure(cfg);

    // Each slide holds for o.durs[i] seconds. The transition into the next slide finishes exactly
    // at the change time, so with beat sync the new slide lands on the beat.
    const n = pics.length, durs = o.durs;
    const starts = [];
    durs.reduce((acc, d, k) => { starts[k] = acc; return acc + d; }, 0);
    const total = Math.round(o.total * VID_FPS);
    const step = VW; // distance between cards during a swipe
    let i = 0;
    for (let f = 0; f < total; f++) {
      if (encErr) throw encErr;
      const t = f / VID_FPS;
      while (i < n - 1 && t >= starts[i + 1] - 1e-6) i++;
      const hold = durs[i], local = t - starts[i];
      const tr = o.trans === 'cut' ? 0 : Math.min(TRANS_SEC, hold * 0.4);
      g.fillStyle = back;
      g.fillRect(0, 0, VW, VH);
      if (tr && i < n - 1 && local > hold - tr) {
        const p = easeInOut((local - (hold - tr)) / tr);
        if (o.trans === 'swipe') { card(pics[i], cx - p * step); card(pics[i + 1], cx + (1 - p) * step); }
        else if (p < 0.5) card(pics[i], cx, 1 - p * 2); // fade out to the background…
        else card(pics[i + 1], cx, p * 2 - 1);             // …then fade the next slide in
      } else {
        card(pics[i], cx);
      }
      const vf = new VideoFrame(frame, { timestamp: Math.round((f * 1e6) / VID_FPS), duration: Math.round(1e6 / VID_FPS) });
      enc.encode(vf, { keyFrame: f % (VID_FPS * 2) === 0 });
      vf.close();
      while (enc.encodeQueueSize > 6) await new Promise((r) => setTimeout(r, 4));
      if (f % 10 === 0) { onProgress(f / total); await new Promise((r) => setTimeout(r, 0)); }
    }
    await enc.flush();
    if (encErr) throw encErr;
    enc.close();
    muxer.finalize();
    onProgress(1);
    return new Blob([muxer.target.buffer], { type: 'video/mp4' });
  }

  // Reel slides MP4: the 9:16 slides exactly as in the Reel slides ZIP (reelCanvas), one after another
  // with straight cuts, 1080x1920, 30 fps, no audio. Cover 1.5 s, every other slide (CTA included) 2.5 s.
  const SLIDES_VID_SEC = { cover: 1.5, cta: 2.5 };
  const SLIDES_VID_DEFAULT = 2.5;
  const slidesVidDurs = () => slides.map((s) => SLIDES_VID_SEC[s.type] || SLIDES_VID_DEFAULT);
  async function makeSlidesVideo(onProgress) {
    await fontsReady;
    const cfg = await pickCodec(REEL.W, REEL.H);
    if (!cfg) throw new Error('UNSUPPORTED');
    const pics = slides.map((s, i) => reelCanvas(i));
    const muxer = new Mp4Muxer.Muxer({ target: new Mp4Muxer.ArrayBufferTarget(), video: { codec: 'avc', width: REEL.W, height: REEL.H, frameRate: VID_FPS }, fastStart: 'in-memory' });
    let encErr = null;
    const enc = new VideoEncoder({ output: (chunk, meta) => muxer.addVideoChunk(chunk, meta), error: (e) => { encErr = e; } });
    enc.configure(cfg);
    // whole frames per slide, rounded on the running total so the cuts land on the right times
    const ends = [];
    slidesVidDurs().reduce((acc, d, k) => { ends[k] = Math.round((acc + d) * VID_FPS); return acc + d; }, 0);
    const total = ends[ends.length - 1];
    let i = 0, startOf = 0;
    for (let f = 0; f < total; f++) {
      if (encErr) throw encErr;
      while (f >= ends[i]) { startOf = ends[i]; i++; }
      const vf = new VideoFrame(pics[i], { timestamp: Math.round((f * 1e6) / VID_FPS), duration: Math.round(1e6 / VID_FPS) });
      enc.encode(vf, { keyFrame: f === startOf || (f - startOf) % (VID_FPS * 2) === 0 });
      vf.close();
      while (enc.encodeQueueSize > 6) await new Promise((r) => setTimeout(r, 4));
      if (f % 10 === 0) { onProgress(f / total); await new Promise((r) => setTimeout(r, 0)); }
    }
    await enc.flush();
    if (encErr) throw encErr;
    enc.close();
    muxer.finalize();
    onProgress(1);
    return new Blob([muxer.target.buffer], { type: 'video/mp4' });
  }
  $('btnReelMp4').onclick = async () => {
    if (vidBusy || pubBusy) return;
    if (!(await preflight())) return;
    const btn = $('btnReelMp4'), msg = $('reelMp4Msg'), old = btn.textContent;
    vidBusy = true;
    btn.disabled = true;
    msg.className = 'small vid-msg';
    try {
      const blob = await makeSlidesVideo((p) => { btn.textContent = `Making video… ${Math.round(p * 100)}%`; });
      const secs = slidesVidDurs().reduce((a, b) => a + b, 0);
      msg.textContent = `${secs.toFixed(1).replace(/\.0$/, '')} s, ${(blob.size / 1048576).toFixed(1)} MB.`;
      if (await saveBlob(blob, `${coverName()}-reel.mp4`)) toast('Reel MP4 downloaded');
    } catch (e) {
      console.error(e);
      msg.className = 'small vid-msg err';
      msg.textContent = e.message === 'UNSUPPORTED'
        ? "This browser can't make MP4 video. Use a recent Chrome or Edge on a computer, or Safari 17 or newer."
        : 'Video export failed: ' + (e.message || e);
    } finally {
      vidBusy = false;
      btn.disabled = false;
      btn.textContent = old;
    }
  };

  function vidFileName(o) { return `${coverName()}-${o.format === 'reel' ? 'reel' : 'feed'}.mp4`; }

  $('btnVideo').onclick = async () => {
    if (vidBusy) return;
    if (!(await preflight())) return;
    const o = vidOptions();
    const btn = $('btnVideo'), msg = $('vidMsg');
    vidBusy = true;
    btn.disabled = true;
    clearVideo();
    msg.className = 'small vid-msg';
    msg.textContent = 'Making video…';
    $('vidProgress').hidden = false;
    $('vidBar').style.width = '0%';
    const t0 = performance.now();
    try {
      vidBlob = await makeVideo(o, (p) => { $('vidBar').style.width = Math.round(p * 100) + '%'; msg.textContent = `Making video… ${Math.round(p * 100)}%`; });
      vidUrl = URL.createObjectURL(vidBlob);
      $('vidPreview').src = vidUrl;
      $('vidResult').hidden = false;
      const mb = (vidBlob.size / 1048576).toFixed(1);
      if (o.sec === 'beat') {
        const changes = [];
        o.durs.slice(0, -1).reduce((acc, d) => { changes.push(acc + d); return acc + d; }, 0);
        vidTiming = { spb: beatSec(), offset: beatOffset(), total: o.total, changes };
        $('btnPlayBeat').hidden = false;
      }
      msg.textContent = `Done: ${o.total.toFixed(1).replace(/\.0$/, '')} s, ${mb} MB, made in ${Math.round((performance.now() - t0) / 1000)} s. Check it below, then save it.`;
    } catch (e) {
      console.error(e);
      msg.className = 'small vid-msg err';
      msg.textContent = e.message === 'UNSUPPORTED'
        ? "This browser can't make MP4 video. Use a recent Chrome or Edge on a computer, or Safari 17 or newer."
        : 'Video export failed: ' + (e.message || e);
    } finally {
      vidBusy = false;
      btn.disabled = false;
      $('vidProgress').hidden = true;
    }
  };
  $('btnVideoSave').onclick = async () => {
    if (vidBlob && (await saveBlob(vidBlob, vidFileName(vidOptions())))) toast('Video saved');
  };

  // Export modal
  function openExport() {
    showBeatPanel();
    showPubToken();
    updateVidInfo();
    $('exportModal').hidden = false;
    document.body.style.overflow = 'hidden';
  }
  function closeExport() {
    if (vidBusy || pubBusy) return;
    $('exportModal').hidden = true;
    document.body.style.overflow = '';
    $('vidPreview').pause();
    stopMetro();
    stopClicks();
  }
  $('btnExport').onclick = openExport;
  $('exportClose').onclick = closeExport;
  $('exportModal').addEventListener('click', (e) => { if (e.target === $('exportModal')) closeExport(); });

  // ---------- Carousels: auto-save, New, Saved list ----------
  let work = null;          // the open carousel: { id, name, nameAuto, text, slots, created, updated, thumb }
  let saveTimer = null;
  let savingPromise = Promise.resolve();
  const newCarId = () => 'car_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  function blankWork() { const t = Date.now(); return { id: newCarId(), name: '', nameAuto: true, text: '', slots: {}, created: t, updated: t, thumb: null }; }
  const isEmpty = (w) => !String(w.text || '').trim() && !Object.keys(w.slots || {}).length;
  const shownName = (w) => w.name || 'Untitled carousel';

  function autoName(text) {
    const parsed = parse(text || '').slides;
    const cover = parsed.find((x) => x.type === 'cover');
    let n = cover ? [...cover.f.title, ...cover.f.accent].join(' ') : '';
    if (!n) { const first = parsed.find((x) => x.f.headline || x.f.name); n = first ? first.f.headline || first.f.name : ''; }
    n = n.replace(/\*\*/g, '').replace(/\s+/g, ' ').trim();
    return n.length > 70 ? n.slice(0, 68).trim() + '…' : n;
  }
  function setStatus(msg, saving) {
    const el = $('carStatus');
    el.textContent = msg;
    el.classList.toggle('saving', !!saving);
  }
  function showName() {
    const inp = $('carName');
    if (document.activeElement !== inp) inp.value = work.nameAuto ? '' : work.name;
    inp.placeholder = work.nameAuto ? (work.name || 'Untitled carousel') : 'Untitled carousel';
  }
  function storeWorkingCopy() {
    const { thumb, ...copy } = work; // keep localStorage small
    LS.set('rep.work', copy);
  }
  // Called after every change to the text, slot images or name.
  function markDirty() {
    if (vidBlob) clearVideo(); // a made video no longer matches the slides
    work.text = srcEl.value;
    work.slots = { ...slots };
    work.updated = Date.now();
    if (work.nameAuto) work.name = autoName(work.text);
    storeWorkingCopy();
    showName();
    setStatus('Saving…', true);
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => { flushSave(); }, 700);
  }
  function makeThumb() {
    if (!slides.length) return null;
    try {
      const big = document.createElement('canvas');
      renderSlide(big, slides[0], ctxFor(0, true));
      const sm = document.createElement('canvas');
      sm.width = 216; sm.height = 270;
      const c = sm.getContext('2d');
      c.imageSmoothingQuality = 'high';
      c.drawImage(big, 0, 0, 216, 270);
      return sm.toDataURL('image/jpeg', 0.82);
    } catch { return null; }
  }
  // Write the open carousel to the Saved list now (skips carousels that are still empty).
  function flushSave() {
    clearTimeout(saveTimer);
    savingPromise = savingPromise.then(async () => {
      if (!work) return;
      if (isEmpty(work)) { setStatus('Add some slide text and it will save automatically.'); return; }
      work.thumb = makeThumb();
      await CarStore.put({ ...work, slots: { ...work.slots } });
      setStatus('Saved in this browser');
      refreshSavedCount();
    }).catch((e) => { console.error(e); setStatus('Could not save: ' + (e.message || e)); });
    return savingPromise;
  }
  async function refreshSavedCount() {
    const list = await CarStore.all();
    $('savedCount').textContent = list.length ? String(list.length) : '';
  }
  function loadIntoEditor(rec) {
    work = { ...rec, slots: { ...(rec.slots || {}) } };
    slots = { ...work.slots };
    srcEl.value = work.text || '';
    storeWorkingCopy();
    showName();
    setStatus(isEmpty(work) ? 'Add some slide text and it will save automatically.' : 'Saved in this browser');
    rebuild();
    goTo(0);
  }

  $('carName').addEventListener('input', () => {
    const v = $('carName').value.trim();
    work.nameAuto = !v;
    work.name = v || autoName(srcEl.value);
    markDirty();
  });
  $('carName').addEventListener('blur', showName);

  $('btnNew').onclick = async () => {
    await flushSave();
    const had = !isEmpty(work);
    loadIntoEditor(blankWork());
    srcEl.focus({ preventScroll: true });
    toast(had ? 'New carousel started. The previous one is in Saved.' : 'New carousel started');
  };

  // Saved list
  function closeSaved() { $('savedModal').hidden = true; document.body.style.overflow = ''; }
  async function openSaved() {
    await flushSave();
    $('savedModal').hidden = false;
    document.body.style.overflow = 'hidden';
    renderSaved();
  }
  function fmtDate(t) {
    const d = new Date(t), now = new Date();
    const sameDay = d.toDateString() === now.toDateString();
    return sameDay ? 'today, ' + d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
      : d.toLocaleDateString([], { month: 'short', day: 'numeric', year: d.getFullYear() === now.getFullYear() ? undefined : 'numeric' });
  }
  async function renderSaved() {
    const list = (await CarStore.all()).sort((a, b) => b.updated - a.updated);
    const box = $('savedList');
    box.innerHTML = '';
    if (!list.length) {
      box.innerHTML = '<div class="lib-empty">No saved carousels yet. Start typing slide text and it saves here automatically.</div>';
      return;
    }
    for (const rec of list) {
      const cur = rec.id === work.id;
      const n = parse(rec.text || '').slides.length;
      const item = document.createElement('div');
      item.className = 'saved-item' + (cur ? ' current' : '');
      const th = document.createElement('div');
      th.className = 'saved-thumb';
      if (rec.thumb) { const im = document.createElement('img'); im.src = rec.thumb; im.alt = ''; th.appendChild(im); }
      const info = document.createElement('div');
      info.className = 'saved-info';
      const nm = document.createElement('div');
      nm.className = 'saved-name';
      nm.textContent = shownName(rec);
      nm.title = shownName(rec);
      const meta = document.createElement('div');
      meta.className = 'saved-meta';
      if (cur) { const tg = document.createElement('span'); tg.className = 'saved-tag'; tg.textContent = 'Open now'; meta.appendChild(tg); }
      meta.appendChild(document.createTextNode(`${n} slide${n === 1 ? '' : 's'} · edited ${fmtDate(rec.updated)}`));
      info.append(nm, meta);
      const act = document.createElement('div');
      act.className = 'saved-actions';
      const mk = (label, cls, fn) => { const b = document.createElement('button'); b.type = 'button'; b.className = 'btn ghost ' + cls; b.textContent = label; b.onclick = fn; act.appendChild(b); return b; };
      if (!cur) mk('Open', 'primary', () => { closeSaved(); loadIntoEditor(rec); toast(`Opened "${shownName(rec)}"`); });
      mk('Duplicate', '', async () => {
        const t = Date.now();
        const copy = { ...rec, id: newCarId(), name: shownName(rec) + ' (copy)', nameAuto: false, created: t, updated: t, slots: { ...(rec.slots || {}) } };
        await CarStore.put(copy);
        toast(`Duplicated as "${copy.name}"`);
        renderSaved(); refreshSavedCount();
      });
      mk('Delete', 'danger', async () => {
        if (!(await ask(`Delete "${shownName(rec)}"? Its text and image choices will be removed. Images stay in your library.`, 'Delete'))) return;
        await CarStore.del(rec.id);
        if (cur) loadIntoEditor(blankWork());
        toast('Carousel deleted');
        renderSaved(); refreshSavedCount();
      });
      item.append(th, info, act);
      box.appendChild(item);
    }
  }
  $('btnSaved').onclick = openSaved;
  $('savedClose').onclick = closeSaved;
  $('savedModal').addEventListener('click', (e) => { if (e.target === $('savedModal')) closeSaved(); });
  // Save straight away when the page is hidden or closed.
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden' && work) flushSave(); });
  window.addEventListener('pagehide', () => { if (work) flushSave(); });

  // ---------- Misc ----------
  function esc(s) { return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
  function ask(msg, okLabel) {
    return new Promise((res) => {
      const m = $('askModal');
      $('askMsg').textContent = msg;
      $('askOk').textContent = okLabel || 'OK';
      m.hidden = false;
      $('askOk').focus();
      const done = (v) => { m.hidden = true; $('askOk').onclick = $('askCancel').onclick = null; res(v); };
      $('askOk').onclick = () => done(true);
      $('askCancel').onclick = () => done(false);
    });
  }
  let toastT;
  function toast(msg) {
    const t = $('toast');
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toastT);
    toastT = setTimeout(() => { t.hidden = true; }, 2600);
  }

  let debounce;
  srcEl.addEventListener('input', () => {
    markDirty();
    clearTimeout(debounce);
    debounce = setTimeout(rebuild, 250);
  });
  $('btnExample').onclick = async () => {
    if (srcEl.value.trim() && srcEl.value !== EXAMPLE && !(await ask('Replace your current text with the example slides?', 'Replace'))) return;
    srcEl.value = EXAMPLE;
    markDirty();
    rebuild();
    goTo(0);
  };
  $('btnHelp').onclick = () => { const h = $('help'); h.open = !h.open; if (h.open) h.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); };

  const fontsReady = Promise.all([
    document.fonts.load(HEAD(100)), document.fonts.load(BODY(40, false)), document.fonts.load(BODY(40, true)), document.fonts.load(SEMI(30)),
  ]).catch(() => {});

  (async () => {
    // Restore the carousel that was open last (working copy is in localStorage, so a refresh never loses work).
    work = LS.get('rep.work', null);
    if (!work || !work.id) {
      // first run, or upgrading from the single-draft version
      work = blankWork();
      work.text = LS.get('rep.text', '') || '';
      work.slots = LS.get('rep.slots', {}) || {};
      try { localStorage.removeItem('rep.text'); localStorage.removeItem('rep.slots'); } catch { /* ignore */ }
    }
    if (work.nameAuto) work.name = autoName(work.text);
    storeWorkingCopy();
    slots = { ...(work.slots || {}) };
    srcEl.value = work.text || '';
    await Promise.all([fontsReady, loadLibrary()]);
    rebuild();
    renderLogoSlot();
    showName();
    await flushSave();
    refreshSavedCount();
  })();
})();
