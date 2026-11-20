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
      for (let i = 0; i < n; i++) out.push({ key: 'ex' + i, label: f.labels[i] ? `Exercise: ${f.labels[i]}` : `Exercise ${i + 1}`, cat: 'Exercise' });
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

  function parse(src) {
    const blocks = src.replace(/\r\n?/g, '\n').split(/^\s*---+\s*$/m);
    const slides = [], errors = [];
    blocks.forEach((block, bi) => {
      const lines = block.split('\n');
      let i = 0;
      while (i < lines.length && !lines[i].trim()) i++;
      if (i >= lines.length) return;
      const m = lines[i].trim().match(/^\[\s*([a-zA-Z]+)\s*\]$/);
      if (!m) { errors.push(`Block ${bi + 1}: first line should be a type like [cover]`); return; }
      const type = m[1].toLowerCase();
      if (!KEYS[type]) { errors.push(`Block ${bi + 1}: unknown type [${type}]`); return; }
      const raw = {};
      let cur = null;
      for (i = i + 1; i < lines.length; i++) {
        const line = lines[i];
        const km = line.match(/^\s*([a-zA-Z]+)\s*:\s?(.*)$/);
        if (km && KEYS[type].includes(km[1].toLowerCase())) {
          cur = km[1].toLowerCase();
          raw[cur] = raw[cur] || [];
          if (km[2].trim()) raw[cur].push(km[2].trim());
        } else if (cur && line.trim()) {
          raw[cur].push(line.trim());
        }
      }
      const f = {};
      for (const k of KEYS[type]) {
        const arr = raw[k] || [];
        if (LIST_KEYS.has(k)) f[k] = arr.map((s) => s.replace(/^[-•*]\s+/, '')).filter(Boolean);
        else if (type === 'cover' && (k === 'title' || k === 'accent')) f[k] = arr;
        else f[k] = arr.join('\n');
      }
      if (type === 'rank') {
        const r = parseFloat(String(f.rating).replace(',', '.'));
        f.rating = isNaN(r) ? 0 : Math.max(0, Math.min(5, Math.round(r * 2) / 2));
      }
      if (type === 'tier') f.letter = (f.letter || 'S').trim().charAt(0).toUpperCase();
      if (type === 'reference' && f.labels.length > 4) { errors.push(`Block ${bi + 1}: reference supports up to 4 labels — extra ones ignored`); f.labels = f.labels.slice(0, 4); }
      slides.push({ type, f });
    });
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
  function fitRich(ctx, text, o) {
    let size = o.size;
    for (;;) {
      const lines = wrapRich(ctx, text, o.font, size, o.maxW, o.upper);
      const tooWide = lines.some((l) => l.width > o.maxW + 0.5);
      const h = lines.length * size * o.lh;
      if ((!tooWide && lines.length <= (o.maxLines || 99) && (!o.maxH || h <= o.maxH)) || size <= o.min) return { lines, size };
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
  const RENDER = {
    cover(ctx, f, R) {
      const segs = [];
      f.title.forEach((t) => segs.push({ t, color: C.charcoal }));
      f.accent.forEach((t) => segs.push({ t, color: C.orange }));
      if (!segs.length) segs.push({ t: 'Your title', color: C.charcoal });
      const maxW = W - 2 * M, lh = 0.98;
      let size = 170, laid;
      for (;;) {
        laid = segs.map((s) => ({ ...s, lines: wrapRich(ctx, s.t.replace(/\*\*/g, ''), HEAD, size, maxW, true) }));
        const n = laid.reduce((a, s) => a + s.lines.length, 0);
        const wide = laid.some((s) => s.lines.some((l) => l.width > maxW));
        if ((!wide && n * size * lh <= 560) || size <= 60) break;
        size -= 4;
      }
      let y = TOP - 10;
      for (const s of laid) {
        y = drawLines(ctx, s.lines, W / 2, y, size, { font: HEAD, lh, color: s.color, boldColor: s.color, align: 'center', ascent: 0.86 });
      }
      if (f.sub) {
        y += 26;
        const sub = f.sub.trim().replace(/^\(|\)$/g, '');
        const r = richBlock(ctx, `(${sub})`, W / 2, y, { font: BODY, size: 38, min: 26, lh: 1.3, maxW, maxLines: 2, color: C.gray, align: 'center' });
        y = r.bottom;
      }
      const top = Math.max(y + 40, H * 0.48);
      const bleed = 70;
      placeImage(ctx, R, 'main', { x: 40, y: top, w: W - 80, h: H - top + bleed }, { valign: 'bottom', label: 'Cover image' });
    },

    tip(ctx, f, R) {
      const num = `#${(f.number || '1').replace(/^#/, '')}`;
      // badge
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
      // headline
      const hx = M + bw + 32, hMax = W - M - hx;
      const fit = fitRich(ctx, f.headline || 'Headline', { font: HEAD, size: 130, min: 54, lh: 1.0, maxW: hMax, maxLines: 1 });
      const hy = by + bh / 2 - (fit.size * 1.0) / 2;
      drawLines(ctx, fit.lines.slice(0, 1), hx, hy, fit.size, { font: HEAD, lh: 1.0, color: C.charcoal, ascent: 0.86 });
      // bullets
      let y = Math.max(by + bh, hy + fit.size) + 56;
      const tx = M + 44, tMax = W - M - tx;
      let bsize = 40;
      const bullets = f.bullets.length ? f.bullets : [];
      // shrink bullets if they'd take too much room
      for (;;) {
        const total = bullets.reduce((a, b) => a + wrapRich(ctx, b, BODY, bsize, tMax).length * bsize * 1.38 + 22, 0);
        if (total <= 420 || bsize <= 28) break;
        bsize -= 2;
      }
      for (const b of bullets) {
        const lines = wrapRich(ctx, b, BODY, bsize, tMax);
        ctx.fillStyle = C.orange;
        ctx.beginPath();
        ctx.arc(M + 10, y + (bsize * 1.38) / 2, 8, 0, Math.PI * 2);
        ctx.fill();
        y = drawLines(ctx, lines, tx, y, bsize, { font: BODY, lh: 1.38, color: C.gray, ascent: 0.78 }) + 22;
      }
      const top = Math.max(y + 30, H * 0.5);
      placeImage(ctx, R, 'main', { x: M, y: top, w: W - 2 * M, h: H - M + 20 - top }, { label: 'Tip image' });
    },

    rank(ctx, f, R) {
      const num = `#${(f.number || '1').replace(/^#/, '')}`;
      let y = TOP - 16;
      ctx.font = HEAD(170);
      ctx.fillStyle = C.charcoal;
      ctx.fillText(num, M, y + 170 * 0.86);
      y += 170 + 6;
      const nm = richBlock(ctx, f.name || 'Exercise name', M, y, { font: HEAD, size: 88, min: 50, lh: 1.02, maxW: W - 2 * M, maxLines: 2, color: C.orange, ascent: 0.86 });
      y = nm.bottom + 30;
      // plates
      const r = 30, gap = 18;
      for (let i = 0; i < 5; i++) {
        const cx = M + r + i * (2 * r + gap), cy = y + r;
        const fill = Math.max(0, Math.min(1, f.rating - i));
        drawPlate(ctx, cx, cy, r, fill);
      }
      y += 2 * r + 36;
      y = divider(ctx, M, y) + 30;
      if (f.reason) {
        y = richBlock(ctx, f.reason, M, y, { font: BODY, size: 38, min: 28, lh: 1.38, maxW: W - 2 * M, maxLines: 4, color: C.gray, ascent: 0.78 }).bottom;
      }
      const top = y + 36;
      placeImage(ctx, R, 'main', { x: M, y: top, w: W - 2 * M, h: H - M + 20 - top }, { label: 'Exercise image' });
    },

    tier(ctx, f) {
      const L = f.letter || 'S';
      const col = TIER_COLORS[L] || C.charcoal;
      // measure verdict to vertically center the group
      const vf = fitRich(ctx, f.verdict || '', { font: HEAD, size: 116, min: 60, lh: 1.02, maxW: W - 2 * M, maxLines: 3 });
      const labelH = 34, badge = 440, gap1 = 42, gap2 = 64;
      const vH = f.verdict ? vf.lines.length * vf.size * 1.02 : 0;
      const groupH = labelH + gap1 + badge + (vH ? gap2 + vH : 0);
      const areaTop = TOP, areaH = H - M - TOP;
      let y = areaTop + Math.max(0, (areaH - groupH) / 2) - 20;
      ctx.font = SEMI(32);
      ctx.fillStyle = C.gray;
      drawSpaced(ctx, `${L} TIER`, W / 2, y + 28, 8, 'center');
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
      if (f.verdict) drawLines(ctx, vf.lines, W / 2, y, vf.size, { font: HEAD, lh: 1.02, color: C.charcoal, align: 'center', ascent: 0.86 });
    },

    reference(ctx, f, R) {
      let y = TOP - 10;
      const leftW = 500;
      const hd = richBlock(ctx, f.headline || 'Muscle', M, y, { font: HEAD, size: 110, min: 56, lh: 1.0, maxW: leftW, maxLines: 2, color: C.charcoal, ascent: 0.86 });
      y = hd.bottom - 4;
      if (f.number) {
        ctx.font = HEAD(230);
        ctx.fillStyle = C.orange;
        ctx.fillText(f.number, M - 4, y + 230 * 0.86);
        y += 230 + 10;
      }
      y = divider(ctx, M, y) + 26;
      if (f.breakdown) {
        y = richBlock(ctx, f.breakdown, M, y, { font: BODY, size: 34, min: 24, lh: 1.3, maxW: leftW, maxLines: 2, color: C.gray, ascent: 0.78 }).bottom;
      }
      // target muscle image top-right
      const tX = M + leftW + 30, tW = W - M - tX;
      placeImage(ctx, R, 'target', { x: tX, y: TOP - 10, w: tW, h: Math.max(240, y - TOP + 10) }, { label: 'Target muscle' });

      // exercise grid
      const n = Math.max(1, Math.min(4, f.labels.length || 1));
      const gTop = y + 48, gBottom = H - M + 10;
      const gap = 30, labelH = 62;
      const rows = n <= 2 ? 1 : 2;
      const cols = n === 1 ? 1 : 2;
      const cellW = (W - 2 * M - (cols - 1) * gap) / cols;
      const cellH = (gBottom - gTop - (rows - 1) * gap) / rows;
      for (let i = 0; i < n; i++) {
        let row = cols === 1 ? 0 : Math.floor(i / 2), col = cols === 1 ? 0 : i % 2;
        let cx = M + col * (cellW + gap);
        if (n === 3 && i === 2) cx = (W - cellW) / 2; // bottom one centered
        const cy = gTop + row * (cellH + gap);
        placeImage(ctx, R, 'ex' + i, { x: cx, y: cy, w: cellW, h: cellH - labelH }, { label: 'Exercise ' + (i + 1) });
        const lab = f.labels[i];
        if (lab) {
          const fit = fitRich(ctx, lab, { font: (s) => BODY(s, true), size: n === 1 ? 40 : 32, min: 20, lh: 1.15, maxW: cellW, maxLines: 1 });
          drawLines(ctx, fit.lines.slice(0, 1), cx + cellW / 2, cy + cellH - labelH + 14, fit.size, { font: (s) => BODY(s, true), lh: 1.15, color: C.gray, boldColor: C.orange, align: 'center', ascent: 0.78 });
        }
      }
    },

    cta(ctx, f, R) {
      let y = TOP - 6;
      const maxW = W - 2 * M;
      y = richBlock(ctx, f.headline || 'Headline', M, y, { font: HEAD, size: 112, min: 60, lh: 1.02, maxW, maxLines: 3, color: C.charcoal, ascent: 0.86 }).bottom + 30;
      y = divider(ctx, M, y) + 32;
      if (f.body) y = richBlock(ctx, f.body, M, y, { font: BODY, size: 38, min: 28, lh: 1.4, maxW, maxLines: 4, color: C.gray, ascent: 0.78 }).bottom + 26;
      if (f.action) {
        // quoted keyword -> bold orange (quotes kept)
        const act = f.action.includes('**') ? f.action : f.action.replace(/(["“][^"”]+["”])/, '**$1**');
        y = richBlock(ctx, act, M, y, { font: (s, b) => `${b ? 700 : 600} ${s}px Inter, system-ui, sans-serif`, size: 40, min: 28, lh: 1.35, maxW, maxLines: 3, color: C.charcoal, ascent: 0.78 }).bottom;
      }
      const top = Math.max(y + 40, H * 0.5);
      placeImage(ctx, R, 'main', { x: M, y: top, w: W - 2 * M, h: H - M + 20 - top }, { label: 'Product / REP image' });
    },

    explainer(ctx, f, R) {
      let y = TOP - 4;
      const maxW = W - 2 * M;
      if (f.label) {
        ctx.font = SEMI(30);
        ctx.fillStyle = C.gray;
        drawSpaced(ctx, f.label.toUpperCase(), M, y + 26, 6, 'left');
        y += 34 + 30;
      }
      y = richBlock(ctx, f.headline || 'Headline', M, y, { font: HEAD, size: 116, min: 60, lh: 1.02, maxW, maxLines: 4, color: C.charcoal, ascent: 0.86 }).bottom + 36;
      if (f.body) {
        y = richBlock(ctx, f.body, M, y, { font: BODY, size: 40, min: 28, lh: 1.42, maxW, maxH: 470, color: C.gray, ascent: 0.78 }).bottom;
      }
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
    try { RENDER[slide.type](ctx, slide.f, R); } catch (e) { console.error(e); }
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
    slides.forEach((s, i) => { if (canvases[i]) renderSlide(canvases[i], s, ctxFor(i, false)); });
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
      card.append(meta, wrap, slotBox);
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
  }
  $('carousel').addEventListener('scroll', () => requestAnimationFrame(updateDots), { passive: true });
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
    if (miss && !(await ask(`${miss} image slot${miss > 1 ? 's are' : ' is'} still empty. Export anyway? Empty slots are left blank.`, 'Export anyway'))) return;
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
