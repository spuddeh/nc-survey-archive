# Go-live runbook — NC Survey Archive

The site code is done, committed, and pushed to
`github.com/spuddeh/nc-survey-archive`. What's left are Cloudflare account
actions (dashboard) plus uploading the images. Do them in this order.

Fixed facts for this project:
- **Site (Pages custom domain):** `survey.nczoning.net`
- **Images host (R2 custom domain):** `img.nczoning.net`
- **Zone:** `nczoning.net`
- **Bucket name used below:** `nc-survey`
- **Image library (keepers, flattened for upload):** `E:\Cyberpunk Cityscapes\_r2-upload` — **1902** `.webp`, 374 MB
- **Manifest:** `manifest.json` (1902 entries) is committed and served by Pages.

---

## 1. Create the R2 bucket
Cloudflare dashboard → **R2** → *Create bucket* → name `nc-survey` → Create.

## 2. Bind the custom domain `img.nczoning.net`
R2 → bucket `nc-survey` → **Settings** → *Public access* → **Custom Domains** →
*Connect Domain* → `img.nczoning.net`. Cloudflare adds the DNS record on the
`nczoning.net` zone automatically. Wait until it shows **Active**.

> This is required for on-the-fly thumbnails — they are fetched through the
> zone at `img.nczoning.net/cdn-cgi/image/...`.

## 3. Enable Image Transformations on the zone
Dashboard → select `nczoning.net` → **Images** → *Transformations* → enable
(*Enable transformations for this zone*). Free tier = 5,000 unique
transformations/month, cached after first hit.

## 4. Upload the images (flat, to the bucket root)
The `_r2-upload` folder is already flattened — every file goes to the bucket
root by basename. Pick one method:

**Option A — rclone (recommended for 1902 files).** Create an R2 **API token**
(R2 → *Manage API Tokens* → Object Read & Write) and note the Account ID, Access
Key ID, Secret. Then:

```bash
rclone config create r2 s3 provider=Cloudflare \
  access_key_id=YOUR_KEY secret_access_key=YOUR_SECRET \
  endpoint=https://YOUR_ACCOUNT_ID.r2.cloudflarestorage.com
rclone copy "E:/Cyberpunk Cityscapes/_r2-upload" r2:nc-survey --transfers=32 --progress
```

**Option B — wrangler.**
```bash
npm i -g wrangler          # or: npx wrangler ...
wrangler login
# from inside the _r2-upload folder (PowerShell):
Get-ChildItem *.webp | ForEach-Object {
  wrangler r2 object put "nc-survey/$($_.Name)" --file "$($_.FullName)" --remote
}
```

**Option C — dashboard drag-drop.** R2 → bucket → *Upload* → drag the *contents*
of `_r2-upload` (the files, not the folder). Fine but slow for 1902 files.

Verify one object resolves publicly (after step 2 is Active):
`https://img.nczoning.net/kabuki_roof__t0000_00001.webp` → 200.

## 5. Connect the site to Cloudflare Pages
Dashboard → **Workers & Pages** → *Create* → **Pages** → *Connect to Git* →
pick `spuddeh/nc-survey-archive` → Set up build:
- **Framework preset:** None
- **Build command:** *(empty)*
- **Build output directory:** `/`
Save & Deploy. First deploy lands on `nc-survey-archive.pages.dev`.

Optional: add a branded custom domain to the **Pages** project (Pages →
Custom domains), e.g. `archive.nczoning.net`. Not required to go live.

## 6. Bind the R2 bucket to the Pages project (live manifest)
The manifest is generated live by a Pages Function (`functions/api/manifest.js`)
that lists the bucket — so **new uploads and their dates appear automatically**,
no rebuild, no tokens. One binding to configure:

Cloudflare dashboard → **Workers & Pages** → your Pages project → **Settings** →
**Functions** (or *Bindings*) → **R2 bucket bindings** → *Add binding*:
- **Variable name:** `SURVEY_BUCKET`
- **R2 bucket:** `nc-survey`

Redeploy (Deployments → Retry, or push any commit). The site fetches
`/api/manifest`; the Function returns the live listing, edge-cached ~60s. Until
the binding exists it safely falls back to the committed `manifest.json`.

Frame dates then come straight from R2 (`o.uploaded`) — `PENDING SYNC`
disappears and *Recent* sort works, with zero manual steps on future uploads.

### Per-frame tags

All per-frame metadata (project / stage / surveyor / time / weather / fov /
feed) lives in the committed `manifest.json` — one entry per frame, no separate
tags file and no defaults. Edit the frame's entry and push:

```json
{ "file": "kabuki_roof__t0002_00004.webp", "time": "22:30", "weather": "Clear", "fov": "100°", "project": "Skyline Bloom", "feed": "AUGMENTED" }
```

The Function merges these onto the live R2 listing. A frame with no entry (or a
missing field) renders as `UNLOGGED` in the app — visible, filterable, and easy
to backfill later.

> When regenerating with `scripts/gen-manifest.mjs`, always pass the existing
> manifest (`node scripts/gen-manifest.mjs manifest.json > manifest.next.json`)
> so per-frame tags are preserved.

### Deleting frames

The site lists the bucket live, so a frame is gone only once its R2 object is.
`scripts/delete-frames.mjs` handles the whole removal — R2 object, `_thumb`
derivative, and the `manifest.json` entry — and is a dry run unless `--apply`
is passed (needs Object Read & Write on the R2 token):

```bash
node scripts/delete-frames.mjs kabuki_street__t0001_00002.webp          # preview
node scripts/delete-frames.mjs --apply kabuki_street__t0001_00002.webp  # delete
```

Inputs can be bare filenames **or pasted image URLs** (right-click the frame →
copy image address) — both the full-res and the `cdn-cgi` thumbnail forms
normalise to the object key, which removes filename-typo risk entirely.

Commit and push the pruned `manifest.json` afterwards. The live site updates
when the `/api/manifest` edge cache expires (~60s).

No local setup? The **Delete frames** workflow (Actions tab) runs the same
script from the browser: dispatch once with *apply* unticked to preview, again
ticked to delete — it commits the pruned `manifest.json` itself. Only the
repository owner can run it. One-time setup under *Settings → Secrets and
variables → Actions*: `R2_ACCOUNT_ID`, `R2_ACCESS_KEY`, `R2_SECRET_KEY` as
**secrets** (token needs Object Read & Write) and `R2_BUCKET` as a
**variable** (it's plain config, already public in `.env.example`).

---

## Verify (live)
1. Open the Pages URL → grid loads all 1902 frames; `/api/manifest` returns 200.
2. A grid image request is `img.nczoning.net/cdn-cgi/image/width=640,…/‹file›`
   → 200 (resized). Lightbox loads the full-res original.
3. Click a District → its subdistricts reveal; counts update.
4. Open a frame → URL gets `#NC-…`; reload that URL → same frame opens.
5. After the binding is set, frames show real dates (not `PENDING SYNC`).
