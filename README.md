# REP Carousel Generator

Single-page web app that turns structured text plus your uploaded images into branded
1080×1350 Instagram carousel slides for **@repexplains**.

- Live, swipeable preview of every slide (auto slide counter)
- Eight slide types: `[cover]`, `[tip]`, `[rank]`, `[tier]`, `[tiergroup]`, `[reference]`, `[cta]`, `[explainer]`
- Image slots per slide; uploads are saved in a browser image library (IndexedDB) with
  categories, including REP expressions (neutral, thinking, friendly, full-body)
- Optional wordmark logo icon
- Carousel management: every carousel auto-saves in the browser (named after its cover title,
  or a name you type). **New** starts a blank carousel and keeps the image library; **Saved**
  lets you open, duplicate or delete past carousels. Refreshing the page never loses work.
- Download all slides as full-size PNGs in a ZIP named after the cover title, or single PNGs
- Reel slides (Export → Download Reel slides): every slide as a 1080×1920 PNG in a ZIP
  (`<cover-title>-reel-01.png`, …). The 4:5 design is scaled to 90.5% and centered vertically on cream,
  so all content stays inside Instagram's Reel safe zone (clear of the top 220px, bottom 400px and
  right 120px). Images that bleed off the edge in the 4:5 version stay inside the margins here.
- Reel video export (Export → Reel video): MP4 (H.264, 30 fps) as a 9:16 reel (1080×1920, slides
  on charcoal) or a 4:5 feed video (1080×1350), 2–6 seconds per slide, swipe / fade / cut transitions.
  No audio: add music in Instagram. Made in the browser with WebCodecs, so it needs a recent Chrome
  or Edge, or Safari 17+.
- "Load example" fills one sample of each slide type

No build step: it is static (`index.html`, `app.js`, `style.css`, local fonts and JSZip in `fonts/` and `vendor/`).

## Run locally

```
python3 -m http.server 8000
# open http://localhost:8000
```

## Deploy (GitHub Pages)

Settings → Pages → Build and deployment → Source: **Deploy from a branch** → pick the branch
and `/ (root)` → Save. The site appears at `https://<user>.github.io/Rep-carousel/`.

## Slide syntax

Separate slides with a line containing only `---`. First line of a block is the type in brackets;
fields are `key: value` lines. `**double asterisks**` = bold orange text. ` | ` (a pipe with a space on
each side) in any text field forces a line break there. A number always stays on the same line as the
word after it ("21 sets", "6–10 reps", "5 more days").

`[cover]` takes an optional `fit`: `contain` (default) shows the whole image, scaled to fit between
the subtitle and the 80px bottom margin, centered and sitting on that margin. `bleed` fills the bottom
and runs off the bottom edge (cropped). The 9:16 Reel slides never crop the cover image.

Headlines, cover titles and accents, `[rank]` names and `[tier]` verdicts use balanced line wrapping
(like CSS `text-wrap: balance`): same number of lines, but evenly long, so there are no lonely last
words. An emoji is always kept on the same line as the word before it, and a typed non-breaking space
(U+00A0) keeps two words together.

On `[reference]` slides, exercise images are scaled as large as fits their grid cells (never cropped),
laid out by their visible pixels so a transparent margin around the figure doesn't make it look small;
each label sits 12px under the visible figure, and the grid starts close to the breakdown text. The
target-muscle image shrinks to fit beside the headline, number and breakdown, so it never pushes the
exercise images down.

`[explainer]` takes an optional `corner`: `right` (default) or `left` puts a small REP image in that
bottom corner; `center` scales it as large as fits between the body text and the 80px bottom margin,
centered horizontally and never cropped or covering text.

```
[cover]
title: 11 back exercises
accent: ranked worst to best
sub: based on science, not vibes
fit: contain
---
[tip]
number: 1
headline: Chest
bullets:
- Keep your **shoulder blades** pinned back and down
---
[rank]
number: 11
name: DB Lat Pulldown
rating: 1.5
reason: Awkward setup and hard to load heavy.
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
body: short pitch
action: Comment "GUIDE" and I'll DM you the link
---
[explainer]
label: Quick science
headline: Why mind-muscle connection matters
body: Focusing on the muscle can increase **activation**.
corner: right
```

Fonts: Anton and Inter (SIL Open Font License, via Fontsource). Zip: JSZip (MIT). MP4 writing: mp4-muxer (MIT).
