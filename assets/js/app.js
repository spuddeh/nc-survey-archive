// NC Survey Archive — gallery app (vanilla ES module, no build step).
//
// State + rendering are plain DOM; clicks are handled by delegation on
// document.body, so re-renders never leave dangling listeners. Config comes from
// window.SURVEY_CONFIG (config.js); frame data comes from the R2 manifest,
// falling back to SAMPLE. Data tables and tuning values live in constants.js.

import {
  CONFIG_DEFAULTS, UNKNOWN, LOCAL_IMG_DIR, THUMB_QUALITY,
  NARROW_BREAKPOINT_PX, SWIPE_MIN_PX, SWIPE_AXIS_RATIO,
  HEADER_HIDE_AFTER_PX, HEADER_REVEAL_DELTA_PX, DAY_MS,
  DATE_LOCALE, DATE_FMT, TELEMETRY_TICK_MS, TELEMETRY,
  DISTRICTS, AREAS, SAMPLE, FACETS, GROUPS, ICONS
} from "./constants.js";

const CFG = Object.assign({}, CONFIG_DEFAULTS, window.SURVEY_CONFIG || {});

// ── helpers ────────────────────────────────────────────
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => (
  { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function imgUrl(f) { return (CFG.r2Base || LOCAL_IMG_DIR) + f; }
function thumbUrl(f, full) {
  if (CFG.thumbnails === "cf" && CFG.r2Base)
    return CFG.r2Base + "cdn-cgi/image/width=" + CFG.thumbWidth + ",quality=" + THUMB_QUALITY + ",format=auto/" + f;
  if (CFG.thumbnails === "suffix")
    return full.replace(/\.(webp|jpg|jpeg|png)$/i, "_thumb.$1");
  return full;
}

function deriveShots(files) {
  return files.map((entry, i) => {
    const e = typeof entry === "string" ? { file: entry } : entry;
    const f = e.file;
    const [loc, tail] = f.split("__");
    // The vantage is the LAST token of loc; the subdistrict key is everything
    // before it (may contain underscores, e.g. "little_china", "vista_del_rey").
    const p = loc.split("_");
    const rawVant = p[p.length - 1] || "";
    const subKey = p.slice(0, -1).join("_") || loc;
    // Facet key normalises numbered vantage passes (street1/street2 → street)
    // so the Vantage filter shows one STREET / AERIAL option, not three.
    const areaKey = rawVant.replace(/\d+$/, "");
    const d = DISTRICTS[subKey] || {
      district: "Night City",
      subdistrict: subKey.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
      code: subKey.replace(/_/g, "").slice(0, 3).toUpperCase()
    };
    const a = AREAS[areaKey] || { label: areaKey, short: areaKey.toUpperCase() };
    const frame = (tail || "").replace(/\.[^.]+$/, "").split("_")[1] || "0000";
    // Vantage suffix keeps the NC id unique across roof/street passes that share
    // a frame counter within a subdistrict (roof → R, street → S, street2 → S2).
    const vSuf = rawVant === "roof" ? "R" : "S" + (rawVant.match(/\d+$/) || [""])[0];
    const url = imgUrl(f);
    return {
      file: f, url, thumb: thumbUrl(f, url),
      district: d.district, subdistrict: d.subdistrict,
      areaKey, areaLabel: a.label, areaShort: a.short,
      id: "NC-" + d.code + "-" + vSuf + frame,
      // Capture metadata is per-frame data from the manifest \u2014 nothing assumed.
      // Absent \u2192 "" here, shown as the UNKNOWN fallback at render time.
      time: e.time || "", weather: e.weather || "", fov: e.fov || "",
      project: e.project || "",
      stage: e.stage || "",
      surveyor: e.surveyor || "",
      feed: e.feed || "",
      date: e.date || "",
      ts: e.date ? Date.parse(e.date) : 0,
      _i: i
    };
  });
}

function fmtDate(iso) {
  if (!iso) return "PENDING SYNC";
  const d = new Date(iso);
  if (isNaN(d)) return iso;
  return d.toLocaleString(DATE_LOCALE, DATE_FMT).toUpperCase();
}

// ── state ──────────────────────────────────────────────
// SAMPLE is a design-time fixture: it only seeds the grid when no manifest is
// configured (the documented `manifest: ""` local-dev contract). With a
// manifest set, boot starts empty in a "syncing" state so placeholder frames
// never flash on the live site while /api/manifest is in flight.
const seed = CFG.manifest ? [] : SAMPLE;
const state = {
  files: seed,
  shots: deriveShots(seed),
  sync: CFG.manifest ? "syncing" : "ready",   // syncing | ready | error
  sel: { district: "all", subdistrict: "all", areaKey: "all", project: "all", stage: "all", fov: "all", feed: "all" },
  sort: "name",
  lb: null,               // { list, i }
  zoom: false,            // fullscreen image zoom overlay
  narrow: window.innerWidth < NARROW_BREAKPOINT_PX,
  drawer: false,
  status: "NOMINAL",
  telemetry: "SYNC_OFFSET: 0.00ms"
};

// ── filtering ──────────────────────────────────────────
function passExcept(exceptKeys) {
  const ex = Array.isArray(exceptKeys) ? exceptKeys : [exceptKeys];
  return state.shots.filter((sh) =>
    FACETS.every((fc) => ex.includes(fc.key) || state.sel[fc.key] === "all" || sh[fc.key] === state.sel[fc.key]));
}
function filtered() {
  return state.shots.filter((sh) =>
    FACETS.every((fc) => state.sel[fc.key] === "all" || sh[fc.key] === state.sel[fc.key]));
}
function distinct(key) {
  const seen = [];
  state.shots.forEach((sh) => { if (!seen.includes(sh[key])) seen.push(sh[key]); });
  return seen;
}
function currentList() {
  const list = filtered().slice().sort((a, b) =>
    state.sort === "name" ? a.file.localeCompare(b.file) : (b.ts - a.ts) || (b._i - a._i));
  const newCut = Date.now() - CFG.newWindowDays * DAY_MS;
  return list.map((sh) => Object.assign({}, sh, { isNew: sh.ts > 0 && sh.ts >= newCut }));
}

function setFacet(key, val) {
  state.sel[key] = state.sel[key] === val ? "all" : val;
  const g = GROUPS.find((x) => x.parent === key);
  if (g) state.sel[g.child] = "all";     // changing a parent clears its child
  renderRail(); renderGrid();
}
function clearFilters() {
  FACETS.forEach((fc) => { state.sel[fc.key] = "all"; });
  renderRail(); renderGrid();
}

// ── rail (facets) ──────────────────────────────────────
function optHtml(key, val, label, n, depth) {
  const selected = state.sel[key] === val;
  const enabled = n > 0 || selected;
  const cls = ["nc-opt", depth ? "child" : "", selected ? "on" : "", enabled ? "" : "disabled"].filter(Boolean).join(" ");
  const attrs = enabled ? ` data-act="facet" data-key="${esc(key)}" data-val="${esc(val)}"` : "";
  return `<button class="${cls}"${attrs}><span class="name">${esc(label)}</span><span class="cnt">${n}</span></button>`;
}
function buildFacets() {
  return GROUPS.map((g) => {
    let rows = "";
    if (!g.child) {
      const pool = passExcept([g.key]);
      rows += optHtml(g.key, "all", "All", pool.length, 0);
      distinct(g.key).forEach((v) => {
        const s = state.shots.find((sh) => sh[g.key] === v);
        rows += optHtml(g.key, v, g.display ? g.display(v, s) : (v || UNKNOWN), pool.filter((sh) => sh[g.key] === v).length, 0);
      });
    } else {
      const pk = g.parent, ck = g.child;
      const parentPool = passExcept([pk, ck]);
      rows += optHtml(pk, "all", "All", parentPool.length, 0);
      distinct(pk).forEach((pv) => {
        rows += optHtml(pk, pv, pv || UNKNOWN, parentPool.filter((sh) => sh[pk] === pv).length, 0);
        if (state.sel[pk] === pv) {
          const childPool = passExcept([ck]).filter((sh) => sh[pk] === pv);
          rows += optHtml(ck, "all", "All " + g.childLabel, childPool.length, 1);
          distinct(ck).filter((cv) => state.shots.some((sh) => sh[pk] === pv && sh[ck] === cv))
            .forEach((cv) => rows += optHtml(ck, cv, cv || UNKNOWN, childPool.filter((sh) => sh[ck] === cv).length, 1));
        }
      });
    }
    return `<div><div class="nc-facet-label" title="${esc(g.tip)}">${esc(g.label)}</div><div class="nc-facet-opts">${rows}</div></div>`;
  }).join("");
}
function capLine() {
  const f = filtered();
  if (!f.length) return "NO FRAMES";
  const fld = (k, suffix) => { const u = [...new Set(f.map((x) => x[k]))]; return u.length === 1 ? u[0] + (suffix || "") : "MIXED"; };
  return [fld("time"), fld("weather"), fld("fov", " FOV")].join(" \u00b7 ");
}
function renderRail() {
  const anyActive = FACETS.some((fc) => state.sel[fc.key] !== "all");
  const el = document.getElementById("nc-rail");
  el.innerHTML =
    `<button class="nc-rail-close" data-act="drawer">\u2715 CLOSE</button>
     <div class="nc-rail-head"><span class="lbl">Filters</span>
       <button class="nc-reset${anyActive ? " active" : ""}" data-act="clear">\u2715 Reset</button></div>
     <div class="nc-facets">${buildFacets()}</div>
     <div class="nc-rail-foot"><div class="hr"></div>
       <div class="meta">CAPTURE: ${esc(capLine())}<br/>SOURCE: NC ZONING 3D MAP<br/>ACCESS: AUTHORIZED ONLY</div></div>`;
}

// ── grid ───────────────────────────────────────────────
function cardHtml(shot) {
  return `<div class="nc-card" data-act="open" data-id="${esc(shot.id)}">
    <div class="nc-shot">
      <img src="${esc(shot.thumb)}" loading="lazy" decoding="async" alt="${esc(shot.subdistrict)}" onload="this.classList.add('loaded')" />
      <div class="nc-bracket tl"></div><div class="nc-bracket br"></div>
      ${shot.time ? `<div class="nc-time"><span class="dot"></span>${esc(shot.time)}</div>` : ""}
      ${shot.stage ? `<div class="nc-stage">${esc(shot.stage)}</div>` : ""}
      ${shot.isNew ? '<div class="nc-new"><span class="dot"></span>NEW</div>' : ""}
    </div>
    <div class="nc-card-foot">
      <div class="nc-card-t"><span class="a">${esc(shot.subdistrict)}</span><span class="b">${esc(shot.areaShort)} \u00b7 ${esc(shot.district)}</span></div>
      <span class="nc-card-id">${esc(shot.id)}</span>
    </div>
  </div>`;
}
function renderGrid() {
  const list = currentList();
  const sel = state.sel;
  const heading = (sel.district !== "all" ? sel.district : "ALL DISTRICTS").toUpperCase();
  const sub = sel.subdistrict !== "all" ? sel.subdistrict.toUpperCase()
    : sel.areaKey !== "all" ? (AREAS[sel.areaKey] ? AREAS[sel.areaKey].short : sel.areaKey)
    : "NIGHT SWEEP";
  const mkSort = (k, l) => `<button class="nc-sort${state.sort === k ? " on" : ""}" data-act="sort" data-val="${k}">${l}</button>`;
  const body = list.length
    ? `<div class="nc-grid">${list.map(cardHtml).join("")}</div>`
    : state.sync === "syncing"
    ? `<div class="nc-empty"><div class="ico">\u27f3</div><div class="t">SYNCING ARCHIVE</div>
        <div class="d">Retrieving frame manifest from Night Corp records.</div></div>`
    : state.sync === "error"
    ? `<div class="nc-empty"><div class="ico">\u26a0</div><div class="t">ARCHIVE UNREACHABLE</div>
        <div class="d">Frame manifest could not be retrieved. Refresh to retry.</div></div>`
    : `<div class="nc-empty"><div class="ico">\u2205</div><div class="t">NO FRAMES MATCH</div>
        <div class="d">Current filter set returned zero records.</div>
        <button data-act="clear">RESET FILTERS</button></div>`;
  document.getElementById("nc-main").innerHTML =
    `<div class="nc-main-head">
       <div class="nc-main-head-left">
         <button class="nc-drawer-btn" data-act="drawer">\u2263 Filters</button>
         <h1 class="nc-h1">${esc(heading)} <span class="sub">/ ${esc(sub)}</span></h1>
       </div>
       <div class="nc-sortwrap">
         <div class="nc-sort-group"><span class="nc-sort-lbl">Sort</span>${mkSort("recent", "Recent")}${mkSort("name", "Name")}</div>
         <span class="nc-count">${String(list.length).padStart(2, "0")} FRAMES</span>
       </div>
     </div>${body}`;
  // Safety net: mark any image already complete (e.g. served from browser cache
  // on refresh) as loaded, in case its onload fired before the handler bound.
  const main = document.getElementById("nc-main");
  main.querySelectorAll(".nc-shot img").forEach((im) => {
    if (im.complete && im.naturalWidth > 0) im.classList.add("loaded");
  });
}

// ── lightbox ───────────────────────────────────────────
// Wired into browser history so the Back button (esp. on phones) closes the
// zoom, then the lightbox, before ever leaving the site. Opening an overlay
// pushes a history entry; prev/next only *replaces* it (no back-button spam);
// Back pops the entry and popstate reconciles the view.
function lbId() { return state.lb ? state.lb.list[state.lb.i].id : null; }

// Apply overlay state from an { id, zoom } pair WITHOUT touching history.
function applyLbState(id, zoom) {
  const list = id ? currentList() : null;
  const i = id ? list.findIndex((s) => s.id === id) : -1;
  if (i < 0) { state.lb = null; state.zoom = false; renderLightbox(); return; }
  state.lb = { list, i };
  state.zoom = !!zoom;
  renderLightbox();
}

function openLb(id) {
  if (currentList().findIndex((s) => s.id === id) < 0) return;
  history.pushState({ lb: id, zoom: false }, "", "#" + id);
  applyLbState(id, false);
}
// Close by popping the pushed entry (popstate does the actual teardown).
function closeLb() {
  if (history.state && history.state.lb) history.back();
  else applyLbState(null, false);
}
function stepLb(dir) {
  if (!state.lb || state.zoom) return;
  const n = state.lb.list.length;
  const i = (state.lb.i + dir + n) % n;
  const id = state.lb.list[i].id;
  history.replaceState({ lb: id, zoom: false }, "", "#" + id);
  state.lb.i = i; state.zoom = false;
  renderLightbox();
}
function openZoom() {
  if (!state.lb || state.zoom) return;
  const id = lbId();
  history.pushState({ lb: id, zoom: true }, "", "#" + id);
  state.zoom = true; renderLightbox();
}
function closeZoom() {
  if (history.state && history.state.zoom) history.back();
  else { state.zoom = false; renderLightbox(); }
}

// Back / forward → reconcile the overlay to whatever history entry we land on.
window.addEventListener("popstate", (e) => {
  const st = e.state || {};
  applyLbState(st.lb || null, !!st.zoom);
});

const icon = (n) => `<svg class="nc-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[n] || ""}</svg>`;
const fact = (ic, val, tip) => `<span class="nc-lb-fact" title="${esc(tip)}">${icon(ic)}<span>${esc(val)}</span></span>`;

function renderLightbox() {
  const host = document.getElementById("nc-lb-host");
  // Lock document scroll while open (mobile scrolls the document behind).
  document.documentElement.classList.toggle("nc-noscroll", !!state.lb);
  document.body.classList.toggle("nc-noscroll", !!state.lb);
  if (!state.lb) { host.innerHTML = ""; return; }
  const s = state.lb.list[state.lb.i];
  const pos = String(state.lb.i + 1).padStart(2, "0") + " / " + String(state.lb.list.length).padStart(2, "0");
  host.innerHTML =
    `<div class="nc-lb" data-act="close">
      <div class="nc-lb-top">
        <div class="brand"><img src="assets/img/nightcorp_logo_v3.svg" alt="NC" /><span class="nc-lb-pos">${esc(pos)}</span></div>
        <button class="nc-lb-close" data-act="close">\u2715 CLOSE</button>
      </div>
      <div class="nc-lb-body">
        <button class="nc-lb-nav" data-act="prev" aria-label="Previous">\u2039</button>
        <div class="nc-lb-fig" data-act="stop">
          <div class="nc-lb-imgwrap" data-act="zoom" title="Click to zoom fullscreen">
            <button class="nc-lb-swipe prev" data-act="prev" aria-label="Previous frame">‹</button>
            <img src="${esc(s.url)}" alt="${esc(s.subdistrict)}" />
            <button class="nc-lb-swipe next" data-act="next" aria-label="Next frame">›</button>
          </div>
          <div class="nc-lb-meta">
            <div class="nc-lb-meta-l">
              <div class="nc-lb-titlerow">
                <span class="nc-lb-title">${esc(s.subdistrict)} <span class="d">/ ${esc(s.district)}</span></span>
                <span class="nc-lb-tag">${esc(s.project || UNKNOWN)} \u00b7 ${esc(s.stage || UNKNOWN)}</span>
              </div>
              <div class="nc-lb-facts">
                ${fact("eye", s.areaLabel, "Camera vantage \u2014 street level or aerial / rooftop")}
                ${fact("clock", s.time || UNKNOWN, "In-game capture time")}
                ${fact("sun", s.weather || UNKNOWN, "Weather conditions at capture")}
                ${fact("fov", s.fov ? s.fov + " FOV" : UNKNOWN, "Camera field of view")}
                ${fact("feed", s.feed ? "Feed " + s.feed : UNKNOWN, "BASELINE = unmodified game \u00b7 AUGMENTED = mods active")}
                ${fact("user", s.surveyor || UNKNOWN, "Surveyor \u2014 who captured this frame")}
                ${fact("calendar", fmtDate(s.date), "Uploaded to the archive")}
              </div>
            </div>
            <div class="nc-lb-meta-r">
              <span class="nc-lb-id">${esc(s.id)}</span>
              <a class="nc-dl" href="${esc(s.url)}" download="${esc(s.file)}" data-act="stop">\u2193 DOWNLOAD</a>
            </div>
          </div>
        </div>
        <button class="nc-lb-nav" data-act="next" aria-label="Next">\u203a</button>
      </div>
    </div>
    ${state.zoom ? `<div class="nc-lb-zoom" data-act="unzoom" title="Click to close"><img src="${esc(s.url)}" alt="${esc(s.subdistrict)}" /></div>` : ""}`;
}

// ── header status ──────────────────────────────────────
function renderStatus() {
  const wrap = document.getElementById("nc-status");
  if (!wrap) return;
  wrap.className = "nc-status" + (state.status === "CRITICAL" ? " s-critical" : state.status === "ELEVATED" ? " s-elevated" : "");
  wrap.querySelector(".nc-status-label").textContent = "[SYSTEM_STATUS: " + state.status + "]";
  wrap.querySelector(".nc-status-ping").textContent = state.telemetry;
}
// SYNC_OFFSET telemetry — matches the nc-zoning-board generator (values in
// TELEMETRY, constants.js).
function telemetryTick() {
  const roll = Math.random();
  let offset;
  if (roll < TELEMETRY.NOMINAL_P) offset = Math.random() * TELEMETRY.ELEVATED_MS;
  else if (roll < TELEMETRY.ELEVATED_P) offset = TELEMETRY.ELEVATED_MS + Math.random() * TELEMETRY.ELEVATED_SPAN_MS;
  else offset = TELEMETRY.CRITICAL_MS + Math.random() * TELEMETRY.CRITICAL_SPAN_MS;
  state.status = offset > TELEMETRY.CRITICAL_MS ? "CRITICAL" : offset > TELEMETRY.ELEVATED_MS ? "ELEVATED" : "NOMINAL";
  state.telemetry = "SYNC_OFFSET: " + offset.toFixed(2) + "ms";
  renderStatus();
}

// ── shell + wiring ─────────────────────────────────────
function renderShell() {
  document.getElementById("app").innerHTML =
    `<div class="nc-app" id="nc-approot">
      <header class="nc-header">
        <div class="nc-brand">
          <img src="assets/img/nightcorp_logo_v3.svg" alt="Night Corp" />
          <div class="nc-brand-txt">
            <span class="nc-brand-title">SURVEY ARCHIVE</span>
            <span class="nc-brand-sub">URBAN SURVEY DIVISION // TERMINAL NC-SV-01</span>
          </div>
        </div>
        <div class="nc-header-right">
          <nav class="nc-nav">
            <span class="current">Archive</span>
            <a href="https://nczoning.net">Zoning Board</a>
            <span class="nc-nav-soon" title="Coming soon">Academy<sup>soon</sup></span>
          </nav>
          <div class="nc-status" id="nc-status">
            <span class="nc-status-label"></span>
            <span class="nc-status-led"></span>
            <span class="nc-status-ping"></span>
          </div>
        </div>
      </header>
      <div class="nc-body-row">
        <aside class="nc-rail" id="nc-rail"></aside>
        <main class="nc-main" id="nc-main"></main>
      </div>
      <div id="nc-backdrop-host"></div>
    </div>
    <div id="nc-lb-host"></div>`;
}

function setDrawer(open) {
  state.drawer = open;
  document.getElementById("nc-approot").classList.toggle("drawer-open", open);
  document.getElementById("nc-backdrop-host").innerHTML =
    (open && state.narrow) ? '<div class="nc-backdrop" data-act="drawer"></div>' : "";
}

// single delegated click handler — survives every re-render
document.body.addEventListener("click", (ev) => {
  const t = ev.target.closest("[data-act]");
  if (!t) return;
  const act = t.dataset.act;
  if (act === "stop") { ev.stopPropagation(); return; }
  if (act === "facet") { setFacet(t.dataset.key, t.dataset.val); }
  else if (act === "clear") { clearFilters(); }
  else if (act === "sort") { state.sort = t.dataset.val; renderGrid(); }
  else if (act === "open") { openLb(t.dataset.id); if (state.narrow) setDrawer(false); }
  else if (act === "close") { closeLb(); }
  else if (act === "prev") { ev.stopPropagation(); stepLb(-1); }
  else if (act === "next") { ev.stopPropagation(); stepLb(1); }
  else if (act === "zoom") { ev.stopPropagation(); openZoom(); }
  else if (act === "unzoom") { ev.stopPropagation(); closeZoom(); }
  else if (act === "drawer") { setDrawer(!state.drawer); }
});

document.addEventListener("keydown", (e) => {
  if (!state.lb) return;
  if (e.key === "Escape") { if (state.zoom) closeZoom(); else closeLb(); }
  else if (e.key === "ArrowRight") stepLb(1);
  else if (e.key === "ArrowLeft") stepLb(-1);
});

// Touch swipe in the lightbox → prev / next (disabled while zoomed).
let _swX = 0, _swY = 0;
document.body.addEventListener("touchstart", (e) => {
  if (!state.lb) return;
  const t = e.changedTouches[0]; _swX = t.clientX; _swY = t.clientY;
}, { passive: true });
document.body.addEventListener("touchend", (e) => {
  if (!state.lb || state.zoom) return;
  const t = e.changedTouches[0];
  const dx = t.clientX - _swX, dy = t.clientY - _swY;
  if (Math.abs(dx) > SWIPE_MIN_PX && Math.abs(dx) > Math.abs(dy) * SWIPE_AXIS_RATIO) stepLb(dx < 0 ? 1 : -1);
}, { passive: true });

window.addEventListener("resize", () => {
  const narrow = window.innerWidth < NARROW_BREAKPOINT_PX;
  if (narrow !== state.narrow) { state.narrow = narrow; if (!narrow) setDrawer(false); }
});

function openFromHash() {
  const id = (location.hash || "").replace(/^#/, "");
  if (!id) return;
  if (currentList().findIndex((s) => s.id === id) < 0) return;  // frame not loaded yet
  // Put a grid entry behind the lightbox so Back closes to the grid instead of
  // leaving the site (covers frames opened from a shared #NC-… link).
  if (!history.state || !history.state.lb) {
    history.replaceState({}, "", location.pathname + location.search);
    history.pushState({ lb: id, zoom: false }, "", "#" + id);
  }
  applyLbState(id, false);
}

async function loadManifest() {
  if (!CFG.manifest) return;   // no manifest configured — SAMPLE grid stands
  try {
    // Manifest is served same-origin by Pages (committed to the repo), NOT from
    // r2Base — keeps this a plain same-origin fetch and avoids needing an R2
    // CORS policy. Images/downloads still come from r2Base via <img>/<a>.
    const res = await fetch(CFG.manifest, { cache: "no-cache" });
    if (!res.ok) return manifestFailed("http " + res.status);
    const data = await res.json();
    const files = Array.isArray(data) ? data : (Array.isArray(data.files) ? data.files : null);
    if (!files || !files.length) return manifestFailed("empty");
    state.sync = "ready";
    state.files = files;
    state.shots = deriveShots(files);
    renderRail(); renderGrid();
    openFromHash();
  } catch (_) { manifestFailed("unreachable"); }
}

// The manifest fetch failed (HTTP error, empty/bad shape, or network). The grid
// is currently sitting in the "syncing" empty state; this decides what it shows
// instead. Two audiences hit this path: local dev with no Pages Functions
// (/api/manifest 404s — SAMPLE was the intended experience there), and the live
// site when R2/Functions have an outage (test frames must NOT appear there).
function manifestFailed(reason) {
  // Local dev (r2Base "" per the documented config) falls back to the inline
  // SAMPLE frames, matching the old no-Functions experience. Anywhere else —
  // i.e. the live site — show the error state; test frames never reach prod.
  if (!CFG.r2Base) {
    state.sync = "ready";
    state.files = SAMPLE;
    state.shots = deriveShots(SAMPLE);
  } else {
    state.sync = "error";
    console.warn("NC Survey Archive: manifest failed (" + reason + ")");
  }
  renderRail(); renderGrid();
}

// Mobile: hide the header when scrolling the grid down, reveal on scroll up.
// The app is a fixed 100svh shell — content scrolls inside #nc-main, not the
// window — so we hook that element. The collapse itself is CSS, mobile-only.
function initHeaderScroll() {
  const main = document.getElementById("nc-main");
  const app = document.getElementById("nc-approot");
  const hdr = document.querySelector(".nc-header");
  if (!main || !app || !hdr) return;
  const setH = () => app.style.setProperty("--hdr-h", hdr.offsetHeight + "px");
  setH();
  window.addEventListener("resize", setH);
  let last = 0;
  const onScroll = () => {
    // Mobile scrolls the document; desktop scrolls the inner #nc-main pane.
    const y = state.narrow ? (window.scrollY || document.documentElement.scrollTop || 0) : main.scrollTop;
    if (y > last && y > HEADER_HIDE_AFTER_PX) app.classList.add("header-hidden");
    else if (y < last - HEADER_REVEAL_DELTA_PX) app.classList.remove("header-hidden");
    last = y < 0 ? 0 : y;
  };
  window.addEventListener("scroll", onScroll, { passive: true });
  main.addEventListener("scroll", onScroll, { passive: true });
}

// ── boot ───────────────────────────────────────────────
renderShell();
renderRail();
renderGrid();
renderStatus();
initHeaderScroll();
openFromHash();
loadManifest();
setInterval(telemetryTick, TELEMETRY_TICK_MS);
