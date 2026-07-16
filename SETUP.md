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

## 6. Fill upload dates in the manifest (optional polish)
Until this runs, frames show `PENDING SYNC` and *Recent* sort falls back to
name order. After the upload:

```bash
npm install                       # installs @aws-sdk/client-s3 (devDep)
# set R2 creds (copy .env.example → .env and fill), then:
R2_ACCOUNT_ID=… R2_ACCESS_KEY=… R2_SECRET_KEY=… R2_BUCKET=nc-survey \
  node scripts/gen-manifest.mjs manifest.json > manifest.next.json
mv manifest.next.json manifest.json
git add manifest.json && git commit -m "Fill frame dates from R2" && git push
```
Pages redeploys automatically on push.

---

## Verify (live)
1. Open the Pages URL → grid loads all 1902 frames.
2. A grid image request is `img.nczoning.net/cdn-cgi/image/width=640,…/‹file›`
   → 200 (resized). Lightbox loads the full-res original.
3. Click a District → its subdistricts reveal; counts update.
4. Open a frame → URL gets `#NC-…`; reload that URL → same frame opens.
