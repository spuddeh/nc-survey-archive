// GET /api/manifest — the gallery's frame list, generated live from the R2
// bucket. No build step, no committed manifest, no API tokens: the bucket is an
// R2 *binding* on the Pages project (Settings → Functions → R2 bindings), bound
// here as `SURVEY_BUCKET`.
//
// For each object it emits { file, date, ...tags } where `date` is the R2
// upload time (o.uploaded) — so new uploads and their dates appear on the next
// load.
// Per-frame metadata (project / stage / surveyor / time / weather / fov / feed)
// lives in the committed static /manifest.json — the single per-frame metadata
// source — and is merged onto the live listing. There are deliberately NO
// default values: a frame with no entry renders as UNLOGGED in the app rather
// than being silently mis-filed. The response is edge-cached briefly so the
// bucket is listed at most once per minute per location.
//
// If the binding is absent (e.g. not configured yet), it falls back to serving
// the committed static /manifest.json so the site never regresses.

const CACHE_SECONDS = 60;

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
  } catch { /* no static manifest — frames appear untagged (UNLOGGED) */ }

  const out = [];
  let cursor;
  do {
    const page = await bucket.list({ cursor, limit: 1000 });
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
        date: o.uploaded.toISOString()
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
