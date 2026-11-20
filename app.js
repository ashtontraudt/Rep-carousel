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
        const r = indexedDB.open('rep-carousel', 1);
        r.onupgradeneeded = () => { r.result.createObjectStore('images', { keyPath: 'id' }); };
        r.onsuccess = () => res(r.result);
        r.onerror = () => rej(r.error);
      });
      return dbp;
    }
    async function tx(mode, fn) {
      const db = await open();
      return new Promise((res, rej) => {
        const t = db.transaction('images', mode);
        const st = t.objectStore('images');
        const out = fn(st);
        t.oncomplete = () => res(out && 'result' in out ? out.result : undefined);
        t.onerror = () => rej(t.error);
      });
    }
    return {
      all: () => tx('readonly', (s) => s.getAll()),
      put: (rec) => tx('readwrite', (s) => s.put(rec)),
      del: (id) => tx('readwrite', (s) => s.delete(id)),
    };
  })();

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
    cover: ['title', 'accent', 'sub'],
    tip: ['number', 'headline', 'bullets'],
    rank: ['number', 'name', 'rating', 'reason'],
    tier: ['letter', 'verdict'],
    reference: ['headline', 'number', 'breakdown', 'labels'],
    cta: ['headline', 'body', 'action'],
    explainer: ['label', 'headline', 'body', 'corner'],
  };
  const LIST_KEYS = new Set(['bullets', 'labels']);

  const REQUIRED = {
    cover: [['title', 'accent']], tip: ['headline'], rank: ['name', 'rating'], tier: ['letter', 'verdict'],
    reference: ['headline', 'labels'], cta: ['headline'], explainer: ['headline'],
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
        const arr = raw[k] || [];
        if (LIST_KEYS.has(k)) f[k] = arr.map((x) => x.replace(/^[-•*]\s+/, '')).filter(Boolean);
        else if (type === 'cover' && (k === 'title' || k === 'accent')) f[k] = arr;
        else f[k] = arr.join('\n');
      }
      const missing = REQUIRED[type].filter((r) => (Array.isArray(r) ? r : [r]).every((k) => !f[k] || !f[k].length)).map((r) => (Array.isArray(r) ? r.join(' or ') : r));
      if (missing.length) errors.push(`${tag}: missing ${missing.join(', ')}.`);
      if (type === 'rank') {
        const r = parseFloat(String(f.rating).replace(',', '.'));
        if (f.rating && (isNaN(r) || r < 0 || r > 5)) errors.push(`${tag}: rating "${f.rating}" should be a number from 0 to 5 (halves allowed).`);
        f.rating = isNaN(r) ? 0 : Math.max(0, Math.min(5, Math.round(r * 2) / 2));
      }
      if (type === 'tier') {
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
    String(str || '').split(/(\*\*[^*]+?\*\*)/g).forEach((p) => {
      if (!p) return;
      if (/^\*\*[^*]+\*\*$/.test(p)) runs.push({ t: p.slice(2, -2), b: true });
      else runs.push({ t: p.replace(/\*\*/g, ''), b: false });
    });
    return runs;
  }
  // words: [{ segs:[{t,b}], space:boolean(before) }]
  function toWords(runs) {
    const words = [];
    let pendingSpace = false, cur = null;
    for (const r of runs) {
      for (const piece of r.t.split(/(\s+)/)) {
        if (!piece) continue;
        if (/^\s+$/.test(piece)) { pendingSpace = true; cur = null; continue; }
        if (cur && !pendingSpace) cur.segs.push({ t: piece, b: r.b });
        else { cur = { segs: [{ t: piece, b: r.b }], space: words.length > 0 && pendingSpace }; words.push(cur); }
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
  function fitRich(ctx, text, o) {
    let size = o.size;
    const maxLines = o.maxLines || 99;
    for (;;) {
      let lines = wrapRich(ctx, text, o.font, size, o.maxW, o.upper);
      const tooWide = lines.some((l) => l.width > o.maxW + 0.5);
      const h = lines.length * size * o.lh;
      const fits = !tooWide && lines.length <= maxLines && (!o.maxH || h <= o.maxH);
      if (fits) return { lines, size };
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
          ctx.fillStyle = s.b ? (o.boldColor || C.orange) : o.color;
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
  function placeImage(ctx, R, slotKey, box, opts = {}) {
    if (box.w < 40 || box.h < 40) return;
    const entry = R.slot(slotKey);
    if (entry && entry.img) {
      const im = entry.img;
      const s = Math.min(box.w / im.naturalWidth, box.h / im.naturalHeight);
      const w = im.naturalWidth * s, h = im.naturalHeight * s;
      const ha = opts.halign || 'center', va = opts.valign || 'center';
      const x = ha === 'left' ? box.x : ha === 'right' ? box.x + box.w - w : box.x + (box.w - w) / 2;
      const y = va === 'top' ? box.y : va === 'bottom' ? box.y + box.h - h : box.y + (box.h - h) / 2;
      ctx.drawImage(im, x, y, w, h);
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
  const HEAD_O = (size, min, extra) => ({ font: HEAD, size, min, lh: 1.04, ascent: 0.86, maxW: W - 2 * M, color: C.charcoal, ...extra });
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
        if (!wide && n * size * lh <= maxH) break;
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
      const top = Math.max(y + 40, H * 0.48);
      placeImage(ctx, R, 'main', { x: 40, y: top, w: W - 80, h: H - top + 70 }, { valign: 'bottom', label: 'Cover image' });
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
      let y = TOP - 10;
      const leftW = 500;
      y = richBlock(ctx, hint(R, f.headline, 'Muscle'), M, y, HEAD_O(110, 60, { maxW: leftW, maxLines: 2, name: 'Headline' })).bottom + 8;
      if (f.number) {
        let ns = 230;
        ctx.font = HEAD(ns);
        while (ns > 120 && ctx.measureText(f.number).width > leftW) { ns -= 10; ctx.font = HEAD(ns); }
        ctx.fillStyle = C.orange;
        ctx.fillText(f.number, M - 4, y + ns * 0.86);
        y += ns + 6;
      }
      y = divider(ctx, M, y + 6) + 26;
      if (f.breakdown) y = richBlock(ctx, f.breakdown, M, y, BODY_O(34, 26, { lh: 1.3, maxW: leftW, maxLines: 2, name: 'Breakdown' })).bottom;
      // target muscle image top-right
      const tX = M + leftW + 30, tW = W - M - tX, tTop = TOP - 10;
      const tH = Math.max(260, y - tTop);
      placeImage(ctx, R, 'target', { x: tX, y: tTop, w: tW, h: tH }, { label: 'Target muscle' });

      // exercise grid (1 = large, 2 = side by side, 3 = 2 + 1 centered, 4 = 2x2)
      const n = Math.max(1, Math.min(4, f.labels.length || 1));
      const gTop = Math.max(y, tTop + tH) + 44;
      const gap = 30;
      const rows = n <= 2 ? 1 : 2, cols = n === 1 ? 1 : 2;
      const cellW = (W - 2 * M - (cols - 1) * gap) / cols;
      const lo = { font: (s) => BODY(s, true), size: n === 1 ? 40 : 30, min: 24, lh: 1.15, ascent: 0.78, maxW: cellW - 10, maxLines: 2, color: C.gray, boldColor: C.orange, align: 'center' };
      const fits = f.labels.slice(0, n).map((lab, i) => fitRich(ctx, lab, { ...lo, name: `Label ${i + 1}` }));
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
        spacedLabel(ctx, f.label, M, y + 26, W - 2 * M, 'left', 'Label');
        y += 34 + 30;
      }
      const imgMin = 400; // keep REP clearly visible
      y = richBlock(ctx, hint(R, f.headline, 'Headline'), M, y, HEAD_O(116, 60, { maxLines: 3, name: 'Headline' })).bottom + 34;
      if (f.body) y = richBlock(ctx, f.body, M, y, BODY_O(40, 30, { lh: 1.42, maxH: H - imgMin - 36 - y, name: 'Body' })).bottom;
      const left = /left/i.test(f.corner || '');
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
  let slots = LS.get('rep.slots', {});      // "idx:type:key" -> imageId
  let logoId = LS.get('rep.logo', null);
  const canvases = [];

  const slotId = (i, type, key) => `${i}:${type}:${key}`;
  const entryFor = (id) => (id && images.has(id) ? images.get(id) : null);
  function ctxFor(i, exporting) {
    const s = slides[i];
    return {
      index: i, total: slides.length, exporting,
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
    const set = opts.set || ((v) => { if (v) slots[sid] = v; else delete slots[sid]; LS.set('rep.slots', slots); });
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
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('libModal').hidden) closeLibrary(); });
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
  $('btnZip').onclick = async () => {
    if (!slides.length) return toast('Add some slides first');
    const miss = missingCount();
    const probs = $('errors').children.length + document.querySelectorAll('.slide-warn > div').length;
    const notes = [];
    if (miss) notes.push(`${miss} image slot${miss > 1 ? 's are' : ' is'} still empty and will be left blank.`);
    if (probs) notes.push(`${probs} text problem${probs > 1 ? 's are' : ' is'} listed in red in the editor or under the slides.`);
    if (notes.length && !(await ask(`${notes.join(' ')} Export anyway?`, 'Export anyway'))) return;
    const btn = $('btnZip');
    btn.disabled = true;
    const old = btn.textContent;
    try {
      await fontsReady;
      const zip = new JSZip();
      const name = coverName();
      for (let i = 0; i < slides.length; i++) {
        btn.textContent = `Rendering ${i + 1}/${slides.length}`;
        zip.file(`${name}-${String(i + 1).padStart(2, '0')}.png`, await exportBlob(i));
      }
      btn.textContent = 'Zipping…';
      const blob = await zip.generateAsync({ type: 'blob' });
      if (await saveBlob(blob, `${name}.zip`)) toast('ZIP downloaded');
    } catch (e) {
      console.error(e);
      toast('Export failed: ' + e.message);
    } finally {
      btn.disabled = false;
      btn.textContent = old;
    }
  };

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
    LS.set('rep.text', srcEl.value);
    clearTimeout(debounce);
    debounce = setTimeout(rebuild, 250);
  });
  $('btnExample').onclick = async () => {
    if (srcEl.value.trim() && srcEl.value !== EXAMPLE && !(await ask('Replace your current text with the example slides?', 'Replace'))) return;
    srcEl.value = EXAMPLE;
    LS.set('rep.text', EXAMPLE);
    rebuild();
    goTo(0);
  };
  $('btnHelp').onclick = () => { const h = $('help'); h.open = !h.open; if (h.open) h.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); };

  const fontsReady = Promise.all([
    document.fonts.load(HEAD(100)), document.fonts.load(BODY(40, false)), document.fonts.load(BODY(40, true)), document.fonts.load(SEMI(30)),
  ]).catch(() => {});

  (async () => {
    srcEl.value = LS.get('rep.text', '');
    await Promise.all([fontsReady, loadLibrary()]);
    rebuild();
    renderLogoSlot();
  })();
})();
