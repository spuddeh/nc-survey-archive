# NC Survey Archive

Companion visual-reference registry for the [NC Zoning Board](https://nczoning.net)
map project — the **Night Corp Urban Survey Division**. A filterable gallery of
Night City night-lighting captures (all 22:30, clear weather), doubling as a
reference archive for the map's 3D lighting work.

Night Corp branded to match the [Zoning Board](https://nczoning.net) and
[Academy](https://academy.nczoning.net). Free, static, hosted on Cloudflare
Pages. Images live in Cloudflare R2; the gallery reads a JSON manifest.

> **No build step.** Plain HTML + CSS + one ES module. Clone and open — there is
> nothing to compile, no `node_modules`, no framework to untangle. The manifest
> generator is the only script and it is optional.

## Repo layout

```text
index.html              entry — links the static CSS + config, loads the app module
config.js               window.SURVEY_CONFIG (R2 base, manifest, thumbnails…)
manifest.json           frame list + per-frame tags (regenerated from R2)
assets/
  css/
    theme.css           design tokens (the shared Night Corp palette + type)
    style.css           layout & components (all visual rules live here)
  js/
    app.js              the gallery: state, filtering, lightbox, deep-links
  fonts/                Night Corp Display (SIL OFL 1.1)
  img/                  logo + favicons (survey gold / cyan)
uploads/                sample frames — used only when config.r2Base is ""
scripts/
  gen-manifest.mjs      list the R2 bucket → manifest.json (optional)
_redirects              SPA fallback
_routes.json            routes /api/* to the manifest Pages Function
functions/
  api/manifest.js       lists the R2 bucket live → /api/manifest (dates + new frames)
tags.json               optional per-frame tag overrides merged by the Function
```

CSS, `config.js`, and `manifest.json` are **linked, not bundled**, on purpose:
retune tokens, swap the R2 base, or republish the frame list without touching
`app.js`.

## Configure (`config.js`)

| Key | Meaning |
| --- | --- |
| `r2Base` | Public base URL of the bucket, trailing slash. `""` = serve from `uploads/` (dev). Prod: `https://img.nczoning.net/` |
| `manifest` | URL of the frame-list JSON. Prod: `/api/manifest` (Pages Function lists R2 live). `""` = inline sample in `app.js` |
| `thumbnails` | `"cf"` Cloudflare Image Resizing · `"suffix"` pre-made `_thumb` files · `"off"` full-res in grid |
| `thumbWidth` | Thumbnail width for `"cf"` mode |
| `newWindowDays` | Frames dated within N days show a **NEW** tag |
| `defaultProject` / `defaultStage` | Corp-themed fallback tags when a frame has none |

The committed defaults (`r2Base: ""`, `thumbnails: "off"`) make the repo work
the moment it is cloned. **For production, set `r2Base` to the R2 URL and
`thumbnails` to `"cf"`.**

## Frame data (`manifest.json`)

An array of entries. Each is a filename string, or an object to attach tags:

```json
[
  "kabuki_street__t0024_00049.webp",
  { "file": "kabuki_roof__t0002_00004.webp",
    "project": "Skyline Bloom", "stage": "Calibration",
    "feed": "BASELINE", "date": "2026-07-12T22:30:00Z" }
]
```

- **Filename convention** `‹subdistrict›_‹vantage›__t‹tour›_‹frame›.webp` drives
  the district hierarchy, vantage, and frame ID automatically. Add new
  subdistricts/vantages to `DISTRICTS` / `AREAS` in `app.js`.
- **`feed`** — `BASELINE` (unmodified game) or `AUGMENTED` (captured with mods).
- **`date`** — the R2 object's `LastModified` (upload time). Drives the *Recent*
  sort and the **NEW** tag. Absent → shows `PENDING SYNC`.
- **`project` / `stage`** — optional grouping; fall back to the config defaults.

### Regenerating from the bucket

`project` / `stage` / `feed` can't be inferred from the bucket, so the generator
merges tags from your existing manifest onto a fresh listing:

```bash
npm i @aws-sdk/client-s3
R2_ACCOUNT_ID=… R2_ACCESS_KEY=… R2_SECRET_KEY=… R2_BUCKET=nc-survey \
  node scripts/gen-manifest.mjs manifest.json > manifest.next.json
mv manifest.next.json manifest.json
```

Use an R2 API token with Object Read. `date` is filled from each object's
`LastModified`.

## Capture library & adding new frames

The source captures live outside this repo (they are the R2 payload, not site
code). They are organised on disk as `‹District›/‹Subdistrict›/*.webp`, with a
`duplicates/` folder in each holding frames removed by the dedupe pass — only the
**keepers** (files *not* under `duplicates/`) are published.

**R2 is a flat bucket:** every keeper is uploaded to the bucket root by
basename. Filenames already encode the subdistrict and vantage, so they are
self-describing and collision-free once flattened — no folders needed in R2.

`app.js` `DISTRICTS` maps each subdistrict key to its `{ district, subdistrict,
code }`; the `code` (unique, 3 letters) becomes the `NC-‹code›-‹V›‹frame›` id (V
= `R` roof / `S` street). Numbered street passes (`street1`, `street2`) collapse
to the single **STREET** vantage in the filter but keep distinct ids.

To add captures later:

1. Name files `‹subdistrict›_‹vantage›__t‹tour›_‹frame›.webp` (vantage is the
   **last** token; the subdistrict key may contain underscores, e.g.
   `little_china_street__t…`). New subdistrict → add a row to `DISTRICTS` in
   `app.js` with a fresh unique `code`. New vantage → add to `AREAS`.
2. Flatten the keepers to one folder and upload to the R2 bucket root.
3. Regenerate the manifest from the bucket (see above) and `git push` — Pages
   redeploys the new `manifest.json` and the frames appear.

## Features

- **Hierarchical filters** — click a District to reveal its Subdistricts; click
  a Project to reveal its Stages. Plus Vantage, FOV, Feed. Counts update live and
  impossible combinations disable. Each group label has a hover tooltip.
- **Sort** Recent (by upload date) or Name.
- **Lightbox reader** — full-res image + full metadata, keyboard `←/→/Esc`,
  download button.
- **Deep-links** — an open frame writes its ID to the URL hash
  (`#NC-KBK-00321`); loading that URL opens the frame.
- **NEW tag** on frames uploaded within `newWindowDays`.
- **Responsive** — the filter rail collapses to a drawer under 760px.
- **Live SYSTEM STATUS** telemetry in the header (ports the Zoning Board readout).

## Hosting

Cloudflare Pages, free tier, Git integration.

- **Build command** — none (leave empty).
- **Output directory** — `/` (repo root).
- The site is served at `survey.nczoning.net` (Pages custom domain). Put the
  images in an R2 bucket exposed at `img.nczoning.net` (custom domain on the
  bucket, or an R2 binding). Set `config.js` `r2Base` to match.
- For `thumbnails: "cf"`, enable **Image Resizing** on the zone — the grid then
  requests `‹r2Base›/cdn-cgi/image/width=640,…/‹file›`. No pre-processing.
- Download links are plain `GET`s on the original object; R2 egress to the public
  internet is free, so they don't count against limits.

## Licence and fan content

Unofficial **fan content** under CD PROJEKT RED's
[Fan Content Guidelines](https://www.cdprojektred.com/en/fan-content). Not
affiliated with, endorsed by, or sponsored by CD PROJEKT RED. Cyberpunk,
Cyberpunk 2077 and related marks (including in-universe names such as Night
Corp) are trademarks of CD PROJEKT S.A. Screenshots are captured in-game for
non-commercial reference.

Typography: [Night Corp Display](https://github.com/spuddeh/nc-type-foundry) (SIL OFL 1.1).
