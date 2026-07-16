// GET /api/manifest — the gallery's frame list, generated live from the R2
// bucket. No build step, no committed manifest, no API tokens: the bucket is an
// R2 *binding* on the Pages project (Settings → Functions → R2 bindings), bound
// here as `SURVEY_BUCKET`.
//
// For each object it emits { file, feed, date } where `date` is the R2 upload
// time (o.uploaded) — so new uploads and their dates appear on the next load.
// Per-frame manual overrides (project / stage / feed / surveyor) live in the
// committed /tags.json and are merged in. The response is edge-cached briefly so
// the bucket is listed at most once per minute per location.
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

  // Optional tags from the committed /tags.json: per-frame overrides keyed by
  // filename, plus an optional "_defaults" block applied to any frame that
  // doesn't set a field itself. All of it is data — nothing is baked into code.
  let tags = {};
  try {
    const t = await env.ASSETS.fetch(new URL("/tags.json", request.url));
    if (t.ok) tags = await t.json();
  } catch { /* no tags file — client-side config defaults still apply */ }
  const defaults = tags._defaults || {};

  const out = [];
  let cursor;
  do {
    const page = await bucket.list({ cursor, limit: 1000 });
    for (const o of page.objects) {
      if (!/\.(webp|jpg|jpeg|png)$/i.test(o.key)) continue;   // images only
      if (/_thumb\./i.test(o.key)) continue;                  // skip derivatives
      const t = tags[o.key] || {};
      const pick = (k) => (t[k] != null ? t[k] : defaults[k]);   // per-frame → default
      const set = (k) => (pick(k) != null ? { [k]: pick(k) } : {});
      out.push({
        file: o.key,
        ...set("project"),
        ...set("stage"),
        ...set("surveyor"),
        ...set("time"),
        ...set("weather"),
        ...set("fov"),
        feed: pick("feed") || "BASELINE",
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
