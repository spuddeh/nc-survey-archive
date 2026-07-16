// gen-manifest.mjs — list the R2 bucket and emit manifest.json for the archive.
//
//   node scripts/gen-manifest.mjs > manifest.json
//
// Reads S3-compatible creds from the environment (an R2 API token with
// Object Read). `date` is taken from each object's LastModified, which is the
// upload time — the consistent, free source the gallery sorts "Recent" by.
//
// Deps (install once):  npm i @aws-sdk/client-s3
// Env:
//   R2_ACCOUNT_ID   Cloudflare account id
//   R2_ACCESS_KEY   R2 access key id
//   R2_SECRET_KEY   R2 secret access key
//   R2_BUCKET       bucket name (e.g. nc-survey)
//
// Per-frame tags (project / stage / surveyor / time / weather / fov / feed)
// are NOT derivable from the bucket, so this preserves any you have already
// set: pass the existing manifest.json as the first arg and its per-file tags
// are merged onto the fresh listing. ALWAYS pass it — regenerating without it
// strips every tag.
//
//   node scripts/gen-manifest.mjs manifest.json > manifest.next.json

import { S3Client, ListObjectsV2Command } from "@aws-sdk/client-s3";
import { readFileSync, existsSync } from "node:fs";

// Minimal .env loader (no dependency) — so `npm run gen:manifest` works after
// copying .env.example → .env, without exporting vars into the shell.
if (existsSync(".env")) {
  for (const line of readFileSync(".env", "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

const { R2_ACCOUNT_ID, R2_ACCESS_KEY, R2_SECRET_KEY, R2_BUCKET } = process.env;
if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY || !R2_SECRET_KEY || !R2_BUCKET) {
  console.error("Missing R2_ACCOUNT_ID / R2_ACCESS_KEY / R2_SECRET_KEY / R2_BUCKET");
  process.exit(1);
}

// merge tags from an existing manifest, keyed by filename
const prevPath = process.argv[2];
const prev = {};
if (prevPath) {
  const arr = JSON.parse(readFileSync(prevPath, "utf8"));
  for (const e of arr) if (typeof e === "object" && e.file) prev[e.file] = e;
}

const s3 = new S3Client({
  region: "auto",
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: R2_ACCESS_KEY, secretAccessKey: R2_SECRET_KEY }
});

const out = [];
let token;
do {
  const res = await s3.send(new ListObjectsV2Command({ Bucket: R2_BUCKET, ContinuationToken: token }));
  for (const o of res.Contents || []) {
    if (!/\.(webp|jpg|jpeg|png)$/i.test(o.Key)) continue;   // skip thumbs/derivatives if you suffix them
    if (/_thumb\./i.test(o.Key)) continue;
    const p = prev[o.Key] || {};
    const keep = (k) => (p[k] != null ? { [k]: p[k] } : {});
    out.push({
      file: o.Key,
      ...keep("project"),
      ...keep("stage"),
      ...keep("surveyor"),
      ...keep("time"),
      ...keep("weather"),
      ...keep("fov"),
      ...keep("feed"),
      date: o.LastModified.toISOString()
    });
  }
  token = res.IsTruncated ? res.NextContinuationToken : undefined;
} while (token);

// newest first is nice for eyeballing; the app re-sorts anyway
out.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
process.stdout.write(JSON.stringify(out, null, 2) + "\n");
console.error(`Wrote ${out.length} frames.`);
