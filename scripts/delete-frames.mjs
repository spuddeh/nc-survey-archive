// delete-frames.mjs — remove frames from the archive: R2 object, its _thumb
// derivative (if any), and the manifest.json entry, in one step.
//
//   node scripts/delete-frames.mjs <file...>            dry run (default)
//   node scripts/delete-frames.mjs --apply <file...>    actually delete
//
// The site lists the R2 bucket live via /api/manifest, so the bucket delete is
// what removes a frame from the gallery (visible within the Function's ~60s
// edge cache). The manifest.json prune keeps the static fallback and the
// metadata registry in sync — commit and push it afterwards.
//
// Uses the same .env credentials as gen-manifest.mjs; the R2 API token needs
// Object Read & Write.

import { S3Client, HeadObjectCommand, DeleteObjectsCommand } from "@aws-sdk/client-s3";
import { readFileSync, writeFileSync, existsSync } from "node:fs";

// Minimal .env loader (no dependency) — same as gen-manifest.mjs.
if (existsSync(".env")) {
  for (const line of readFileSync(".env", "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const files = args.filter((a) => a !== "--apply");
if (!files.length) {
  console.error("Usage: node scripts/delete-frames.mjs [--apply] <file...>");
  process.exit(1);
}

const { R2_ACCOUNT_ID, R2_ACCESS_KEY, R2_SECRET_KEY, R2_BUCKET } = process.env;
if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY || !R2_SECRET_KEY || !R2_BUCKET) {
  console.error("Missing R2_ACCOUNT_ID / R2_ACCESS_KEY / R2_SECRET_KEY / R2_BUCKET");
  process.exit(1);
}

const s3 = new S3Client({
  region: "auto",
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: R2_ACCESS_KEY, secretAccessKey: R2_SECRET_KEY }
});

const exists = async (Key) => {
  try { await s3.send(new HeadObjectCommand({ Bucket: R2_BUCKET, Key })); return true; }
  catch { return false; }
};
const thumbOf = (f) => f.replace(/\.(webp|jpg|jpeg|png)$/i, "_thumb.$1");

// Manifest entries keyed by filename (string-or-object entry shape).
const manifest = JSON.parse(readFileSync("manifest.json", "utf8"));
const inManifest = new Set(manifest.map((e) => (typeof e === "string" ? e : e.file)));

// ── plan ───────────────────────────────────────────────
// Verify every name against the bucket BEFORE deleting anything, so one typo
// aborts the run instead of silently deleting nothing while reporting success.
const toDelete = [];
let missing = 0;
for (const f of files) {
  const found = await exists(f);
  const thumb = thumbOf(f);
  const hasThumb = thumb !== f && (await exists(thumb));
  const status = found ? "in bucket" : "NOT IN BUCKET";
  console.log(`${found ? "✓" : "✗"} ${f}  [${status}${hasThumb ? " + thumb" : ""}${inManifest.has(f) ? " + manifest entry" : ""}]`);
  if (!found) { missing++; continue; }
  toDelete.push(f);
  if (hasThumb) toDelete.push(thumb);
}
if (missing) {
  console.error(`\n${missing} name(s) not found in the bucket — nothing deleted. Check for typos and rerun.`);
  process.exit(1);
}

if (!apply) {
  console.log(`\nDry run: would delete ${toDelete.length} object(s) and prune ${files.filter((f) => inManifest.has(f)).length} manifest entr(ies). Rerun with --apply.`);
  process.exit(0);
}

// ── delete ─────────────────────────────────────────────
await s3.send(new DeleteObjectsCommand({
  Bucket: R2_BUCKET,
  Delete: { Objects: toDelete.map((Key) => ({ Key })), Quiet: true }
}));
console.log(`\nDeleted ${toDelete.length} object(s) from ${R2_BUCKET}.`);

const doomed = new Set(files);
const kept = manifest.filter((e) => !doomed.has(typeof e === "string" ? e : e.file));
if (kept.length !== manifest.length) {
  writeFileSync("manifest.json", "[\n" + kept.map((e) => JSON.stringify(e)).join(",\n") + "\n]\n");
  console.log(`Pruned ${manifest.length - kept.length} entr(ies) from manifest.json — commit and push it.`);
}
console.log("Frames disappear from the live site when the /api/manifest edge cache expires (~60s).");
