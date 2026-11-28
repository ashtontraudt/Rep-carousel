# REP Carousel Generator

Static single-page web app for the Instagram account **@repexplains**. It turns structured slide text plus
uploaded images into branded carousel slides (1080×1350 PNGs), 9:16 Reel slides (1080×1920 PNGs) and an MP4
Reel video. Everything runs in the browser; there is no backend and no build step.

- Live site: https://ashtontraudt.github.io/Rep-carousel/ (GitHub Pages, deploys from `main`, root folder)
- User-facing docs and slide syntax: `README.md` and the in-app "Slide syntax" panel (`#help` in `index.html`).
  Keep both in sync with any syntax change.

## Workflow and deployment

- Work on a feature branch, push, open a PR into `main`, merge. Merging to `main` is the deploy: the
  "pages build and deployment" workflow publishes it in about a minute.
  Check the run with `https://api.github.com/repos/ashtontraudt/Rep-carousel/actions/runs?branch=main&per_page=1`.
- "Redeploy" from the owner means: merge to `main` and confirm the live site serves the change.
- After deploying, verify against the live URL (fetch `app.js` and grep for the new code, then run the
  relevant browser test against the live site). Browsers can cache the old page; a hard refresh fixes it.
- Run locally: `python3 -m http.server 8000` in the repo root, open http://localhost:8000.

## Files

- `index.html`: markup for the editor, preview, modals (library, saved carousels, export, confirm dialog).
- `app.js`: all logic in one IIFE (~2000 lines). Sections are marked `// ---------- Name ----------`:
  Brand, Storage helpers, Parser, Text helpers, Shape helpers, Common chrome, Slide renderers, App state,
  Carousel nav, Library modal, Export, Reel video export, Carousels (auto-save / Saved list), Misc.
- `style.css`: app UI styles (not the slides; slides are drawn on canvas).
- `fonts/`: Anton (headlines) and Inter 400/600/700, vendored woff2 from Fontsource.
- `vendor/`: `jszip.min.js` (ZIP export) and `mp4-muxer.js` (MP4 writing), vendored with licenses.
  No CDN dependencies; keep it that way.
- `.nojekyll`: required for GitHub Pages.

## Brand rules (apply to every slide)

- Canvas 1080×1350 (`W`, `H`), 80px safe margins (`M`). Content starts at `TOP` (below the header row);
  `BOTTOM = H - M` is the bottom safe line.
- Colours only (constant `C`): cream `#F7EFE3` background, charcoal `#3A3836` headlines/main text, gray
  `#6B6966` body/labels/counter pill, orange `#E8781E` accents/numbers/badges, black `#1E1D1B` rare.
  Tier badge colours (`TIER_COLORS`): F `#6B6966`, D `#8A857E`, C `#B5AFA6`, B `#3A3836`, A `#F2A65A`, S `#E8781E`.
- Headlines Anton (condensed heavy), body Inter regular, labels small caps with wide spacing.
  `**double asterisks**` = bold orange.
- Every slide: `@repexplains` wordmark top-left (optional logo icon before it), slide counter pill top-right.
- No gradients; no shadows except the subtle one under badges.
- Never draw or generate REP or any illustration. Only the owner's uploaded images; dashed placeholders in the
  preview until then. Placeholders and missing-field hints appear in the preview only, never in exports.

## Slide types and syntax

Blocks separated by a `---` line; first line is the type in brackets; fields are `key: value`; list fields use
`- ` lines. Types: `[cover]` (title, accent, sub, fit), `[tip]` (number, headline, bullets), `[rank]` (number,
name, rating 0–5 halves ok, reason), `[tier]` (letter, verdict), `[tiergroup]` (letter, items as
`- Name: reason`, 1–4), `[reference]` (headline, number, breakdown, labels 1–4), `[cta]` (headline, body,
action), `[explainer]` (label, headline, body, corner).
Text rules in every field: ` | ` forces a line break; a number keeps the next word on its line
(`NUMBER_TOKEN`); an emoji never starts a line (`EMOJI_ONLY`); typed U+00A0 keeps words together.
The parser (`parse`) reports line numbers, unknown types, misspelled fields ("did you mean"), missing
required fields (`REQUIRED`), bad ratings, tier letters, `fit` and `corner` values.

## How rendering works

- Each slide is drawn with Canvas 2D by `RENDER[type](ctx, f, R)` via `drawSlide`; `renderSlide` wraps it for
  1080×1350. `R` carries `index`, `total`, `exporting`, `reel`, `slot(key)`, `logo()`, `warnings`.
- Text: `wrapRich` (greedy), `wrapBalanced` (canvas version of CSS `text-wrap: balance`; used for all
  headlines via `HEAD_O(...)` with `balance: true`, and cover title/accent), `fitRich` (shrinks to fit, then
  shortens with "…" and adds a warning shown under the slide via `warn`). Internal marker `\u0001…\u0001`
  = bold-charcoal run (tiergroup item names).
- Images: `placeImage(ctx, R, slotKey, box, opts)` scales to fit the box (never crops). `opts.trim` lays out by
  the visible (non-transparent) pixels from `visibleBox` (cached per image). Trimming is used on
  `[reference]` (exercises + target) and 3-item `[tiergroup]` only; other slide types draw the full image.
- `referenceGrid` = fixed-cell exercise grid (440px columns, equal rows, labels 12px under each image);
  used by `[reference]` and by `[tiergroup]` with 3 items. `imageGrid` is the older grid used by
  `[tiergroup]` with 1, 2 or 4 items.
- 9:16 Reel slides (`reelBlob`): the same slide drawn at `REEL_SCALE = 0.905`, centered on a 1080×1920 cream
  frame. With `R.reel`, images that normally bleed off the edge stay inside the margins (except
  `[cover]` bleed, which uses the safe zone via `opts.reelSafe`). All content must stay
  inside Instagram's Reel safe zone: nothing in the top 220px, bottom 400px or right 120px.
- MP4 video (`makeVideo`): WebCodecs H.264 + mp4-muxer, 30 fps, reel 9:16 (slides as cards on charcoal) or
  feed 4:5, swipe / fade-through-background / cut, optional beat sync (BPM, first-beat offset, beats per
  slide, saved per carousel). No audio track; music is added in Instagram.

## Layout decisions the owner asked for (keep them)

- `[cover]` `fit: contain` (default) shows the whole image between the subtitle and the bottom margin;
  `fit: bleed` fills the bottom and runs 70px off the edge (4:5 only; never cropped in 9:16,
  where bleed instead fills the Reel safe zone, `REEL_SAFE_SLIDE`, x 76–1004, bottom 1293 in slide coordinates).
- `[explainer]` `corner`: right (default) / left = small corner image; center = as large as fits below the
  text. Lenient matching ("bottom left" = left, "centre" = center).
- `[reference]`: top section (headline, number, breakdown left; target muscle right) at most 480px tall,
  left column shrinks together if needed; target at most 340×440 and never taller than the left column.
  Grid takes all remaining space; 1 = full width, 2 = side by side, 3 = 2 + 1 centered, 4 = 2×2.
  Breakdown text 41px (20% larger than the original 34px).
- `[tiergroup]` with 3 items: same fixed cells as `[reference]`, rows at least 300px tall including the label;
  item text may shrink to 28px to keep that. "300px" was interpreted as image + label (a 300px image alone
  leaves too little room for the item text); the owner was told and can ask to change it.
- `[tier]` / `[tiergroup]` badge letters: S A B C D F only.

## App features to keep working

Image library in IndexedDB (`rep-carousel` DB, stores `images` and `carousels`) with categories including REP
expressions; carousel auto-save (working copy in localStorage `rep.work`, saved list in IndexedDB with
localStorage fallback), New / Saved (open, duplicate, delete); Export dialog with Download ZIP (4:5), Download
Reel slides (9:16 ZIP) and Reel video; ZIPs and files named after the cover title in slide order.
Export → Publish slides commits both PNG sets to `posts/<cover-title>-<date>/` on `main` via the GitHub
Git Data API (one commit, token in localStorage `rep.ghToken`), which redeploys Pages; `posts/` is
owner content, so never delete or rewrite it in feature branches.
Use the in-page `ask()` dialog, never `confirm()`/`alert()` (blocked in sandboxed hosts).

## Conventions when changing things

- Change only what was asked. Other slide types and exports must stay byte-identical: compare SHA-256 of
  every PNG in the 4:5 and 9:16 ZIPs for the example deck and a stress deck, before vs after.
- Apply layout changes to both exports (4:5 and 9:16) and re-check the Reel safe zone with a pixel scan
  (every non-cream pixel inside y 220–1520, x ≤ 960).
- Verify in headless Chromium (Playwright is preinstalled). A useful technique: an init script that wraps
  `CanvasRenderingContext2D.fillText` / `drawImage` to record every text and image box, then check for
  overlaps, text outside the 80px margins, label gaps and cropping. Group text into lines by baseline, not
  glyph boxes.
- Test images should include transparent padding and extreme aspect ratios (very tall / very wide).
- When a request conflicts with the canvas maths (e.g. sizes that can't all fit), implement the closest
  version, state the numbers and the trade-off, and offer the alternative.
- Commit messages and PR descriptions describe what changed and how it was verified.
