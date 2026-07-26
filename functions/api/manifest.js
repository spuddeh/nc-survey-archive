// GET /api/manifest: the gallery's frame list, generated live from the R2
// bucket. No build step, no committed manifest, no API tokens: the bucket is an
// R2 *binding* on the Pages project (Settings → Functions → R2 bindings), bound
// here as `SURVEY_BUCKET`.
//
// For each object it emits { file, date, ...tags } where `date` is the frame's
// original modification time, preserved by the uploader as `mtime` custom
// metadata, falling back to the R2 upload time (o.uploaded), so new uploads and
// their dates appear on the next load. See `frameDate` below for why the
// fallback is not the primary.
// Per-frame metadata (project / stage / surveyor / time / weather / fov / feed)
// lives in the committed static /manifest.json (the single per-frame metadata
// source) and is merged onto the live listing. There are deliberately NO
// default values: a frame with no entry renders as UNLOGGED in the app rather
// than being silently mis-filed. The response is edge-cached briefly so the
// bucket is listed at most once per minute per location.
//
// If the binding is absent (e.g. not configured yet), it falls back to serving
// the committed static /manifest.json so the site never regresses.

const CACHE_SECONDS = 60;

// `o.uploaded` is stamped by R2 when the object is written, so it survives
// nothing: a bucket-to-bucket copy resets every frame to the copy time. The
// 2026-07 Cloudflare account migration did exactly that: all 1,897 frames came
// out dated within the same minute, which also flattened the newest-first sort
// below into copy order.
//
// The uploader preserves the original as `mtime` custom metadata, which IS
// carried across copies, so prefer it and keep `uploaded` as the fallback for
// objects written without it.
//
// Note that `mtime` is stored as a Unix epoch float in SECONDS, not ISO-8601:
//
//     X-Amz-Meta-Mtime: 1784170535.7193124
//
// `rclone lsjson` displays it as `2026-07-16T12:55:35.7193124+10:00`, which is
// rclone formatting the value, not the value itself. `new Date(...)` on the raw
// string yields Invalid Date, and a version of this function that assumed ISO
// would have silently fallen back to `uploaded` forever while looking correct.
// ISO input is still accepted in case a future uploader writes it that way.
//
// Everything returns `toISOString()` because the sort below is a plain string
// compare, and `uploaded` is always `Z`, so mixing formats would sort them
// against each other incorrectly.
function frameDate(o) {
  const raw = o.customMetadata?.mtime ?? o.customMetadata?.Mtime;
  if (raw) {
    const epochSeconds = Number(raw);
    const d = Number.isFinite(epochSeconds) ? new Date(epochSeconds * 1000) : new Date(raw);
    if (!Number.isNaN(d.getTime())) return d.toISOString();
  }
  return o.uploaded.toISOString();
}

export async function onRequest(context) {
  const { env, request, waitUntil } = context;
  const bucket = env.SURVEY_BUCKET;

  // Binding not configured → serve the committed static manifest as a fallback.
  if (!bucket) {
    return env.ASSETS.fetch(new URL("/manifest.json", request.url));
  }

  const cache = caches.default;
  const cacheKey = new Request(new URL("/api/manifest", request.url), { method: "GET" });
  const hit = await cache.match(cacheKey);
  if (hit) return hit;

  // Per-frame tags from the committed static /manifest.json (an array of
  // { file, ...tags } entries), re-keyed by filename for the merge below.
  const tags = {};
  try {
    const t = await env.ASSETS.fetch(new URL("/manifest.json", request.url));
    if (t.ok) for (const e of await t.json()) {
      if (e && typeof e === "object" && e.file) tags[e.file] = e;
    }
  } catch { /* no static manifest, frames appear untagged (UNLOGGED) */ }

  const out = [];
  let cursor;
  do {
    // `include: ["customMetadata"]` is REQUIRED for frameDate to see `mtime`.
    // list() omits custom metadata unless asked, so without this every object
    // arrives with customMetadata undefined and frameDate silently falls back
    // to `uploaded` for all of them.
    //
    // Only true on compatibility_date >= 2022-08-04; before that, list() acts
    // as if both metadata kinds were requested no matter what `include` says.
    // So omitting this works by accident on an old compat date and fails on a
    // current one.
    //
    // Requesting metadata can also return FEWER than `limit` objects per page,
    // which is why the loop below keys off `truncated` rather than counting
    // results against the limit.
    const page = await bucket.list({ cursor, limit: 1000, include: ["customMetadata"] });
    for (const o of page.objects) {
      if (!/\.(webp|jpg|jpeg|png)$/i.test(o.key)) continue;   // images only
      if (/_thumb\./i.test(o.key)) continue;                  // skip derivatives
      const t = tags[o.key] || {};
      const set = (k) => (t[k] != null ? { [k]: t[k] } : {});
      out.push({
        file: o.key,
        ...set("project"),
        ...set("stage"),
        ...set("surveyor"),
        ...set("time"),
        ...set("weather"),
        ...set("fov"),
        ...set("feed"),
        date: frameDate(o)
      });
    }
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);

  out.sort((a, b) => (b.date || "").localeCompare(a.date || ""));

  const res = new Response(JSON.stringify(out), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": `public, max-age=${CACHE_SECONDS}`
    }
  });
  waitUntil(cache.put(cacheKey, res.clone()));
  return res;
}
