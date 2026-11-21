# REP Carousel Generator

Single-page web app that turns structured text plus your uploaded images into branded
1080×1350 Instagram carousel slides for **@repexplains**.

- Live, swipeable preview of every slide (auto slide counter)
- Seven slide types: `[cover]`, `[tip]`, `[rank]`, `[tier]`, `[reference]`, `[cta]`, `[explainer]`
- Image slots per slide; uploads are saved in a browser image library (IndexedDB) with
  categories, including REP expressions (neutral, thinking, friendly, full-body)
- Optional wordmark logo icon
- Carousel management: every carousel auto-saves in the browser (named after its cover title,
  or a name you type). **New** starts a blank carousel and keeps the image library; **Saved**
  lets you open, duplicate or delete past carousels. Refreshing the page never loses work.
- Download all slides as full-size PNGs in a ZIP named after the cover title, or single PNGs
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
fields are `key: value` lines. `**double asterisks**` = bold orange text.

```
[cover]
title: 11 back exercises
accent: ranked worst to best
sub: based on science, not vibes
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

Fonts: Anton and Inter (SIL Open Font License, via Fontsource). Zip: JSZip (MIT).
