// NC Survey Archive — gallery app (vanilla ES module, no build step).
//
// Ported 1:1 from the Claude Design authoring component. State + rendering are
// plain DOM; clicks are handled by delegation on document.body, so re-renders
// never leave dangling listeners. Config comes from window.SURVEY_CONFIG
// (config.js); frame data comes from the R2 manifest, falling back to SAMPLE.

const CFG = Object.assign({
  r2Base: "",
  manifest: "manifest.json",
  thumbnails: "off",
  thumbWidth: 640,
  newWindowDays: 14,
  defaultProject: "Project Nightlight",
  defaultStage: "Reference Sweep"
}, window.SURVEY_CONFIG || {});

// Filename convention: <subdistrict>_<vantage>__t<tour>_<frame>.webp
// The subdistrict key may contain underscores; the vantage is the last token.
// subdistrict key → Night City district hierarchy (code must be unique).
const DISTRICTS = {
  // Watson
  kabuki:             { district: "Watson",        subdistrict: "Kabuki",                 code: "KBK" },
  little_china:       { district: "Watson",        subdistrict: "Little China",           code: "LTC" },
  northside:          { district: "Watson",        subdistrict: "Northside Industrial",   code: "NID" },
  arasaka_waterfront: { district: "Watson",        subdistrict: "Arasaka Waterfront",     code: "ARW" },
  // Westbrook
  japantown:          { district: "Westbrook",     subdistrict: "Japantown",              code: "JPT" },
  charter_hill:       { district: "Westbrook",     subdistrict: "Charter Hill",           code: "CHH" },
  north_oak:          { district: "Westbrook",     subdistrict: "North Oak",              code: "NOK" },
  // City Center
  corpo_plaza:        { district: "City Center",   subdistrict: "Corpo Plaza",            code: "CRP" },
  downtown:           { district: "City Center",   subdistrict: "Downtown",               code: "DTN" },
  // Heywood
  glen:               { district: "Heywood",       subdistrict: "The Glen",               code: "GLN" },
  vista_del_rey:      { district: "Heywood",       subdistrict: "Vista Del Rey",          code: "VDR" },
  wellspring:         { district: "Heywood",       subdistrict: "Wellsprings",            code: "WLS" },
  // Pacifica
  coastview:          { district: "Pacifica",      subdistrict: "Coastview",              code: "CSV" },
  west_wind_estate:   { district: "Pacifica",      subdistrict: "West Wind Estate",       code: "WWE" },
  // Santo Domingo
  arroyo:             { district: "Santo Domingo", subdistrict: "Arroyo",                 code: "ARY" },
  rancho_coronado:    { district: "Santo Domingo", subdistrict: "Rancho Coronado",        code: "RCH" },
  // Badlands
  badlands:           { district: "Badlands",      subdistrict: "Badlands",               code: "BAD" },
  biotechnica_flats:  { district: "Badlands",      subdistrict: "Biotechnica Flats",      code: "BTF" },
  // Dogtown
  dogtown:            { district: "Dogtown",       subdistrict: "Dogtown",                code: "DGT" },
  // Spaceport
  ncx_morro_rock:     { district: "Spaceport",     subdistrict: "Morro Rock",             code: "NCX" }
};
// vantage key → labels (numbered passes street1/street2 normalise to "street")
const AREAS = {
  roof:   { label: "Aerial / Rooftop", short: "AERIAL" },
  street: { label: "Street Level",     short: "STREET" }
};

// Inline fallback used only when no manifest is served. Same string-or-object
// shape as a manifest entry.
const SAMPLE = [
  { file: "kabuki_roof__t0002_00004.webp", project: "Skyline Bloom", stage: "Calibration" },
  { file: "kabuki_roof__t0022_00044.webp", project: "Skyline Bloom", stage: "Calibration" },
  "kabuki_roof__t0047_00094.webp",
  "kabuki_roof__t0073_00147.webp",
  { file: "kabuki_street__t0016_00032.webp", project: "Neon Signage Audit", stage: "Reference" },
  "kabuki_street__t0024_00049.webp",
  "kabuki_street__t0037_00074.webp",
  "kabuki_street__t0065_00131.webp",
  "kabuki_street__t0075_00151.webp",
  "kabuki_street__t0109_00218.webp",
  "kabuki_street__t0112_00224.webp",
  "kabuki_street__t0115_00231.webp",
  "kabuki_street__t0126_00252.webp",
  "kabuki_street__t0158_00316.webp",
  "kabuki_street__t0160_00321.webp"
];

// flat facet keys — each is an independent filter constraint
const FACETS = [
  { key: "district" }, { key: "subdistrict" }, { key: "areaKey" },
  { key: "project" }, { key: "stage" }, { key: "fov" }, { key: "feed" }
];
// how the rail groups them — hierarchical groups reveal children under the
// selected parent (District ▸ Subdistrict, Project ▸ Stage)
const GROUPS = [
  { label: "Location", parent: "district", child: "subdistrict", childLabel: "Subdistricts", tip: "Night City district \u25b8 subdistrict where the frame was captured." },
  { label: "Vantage", key: "areaKey", display: (v, s) => (s ? s.areaShort : v), tip: "Camera position \u2014 street level or aerial / rooftop." },
  { label: "Project", parent: "project", child: "stage", childLabel: "Stages", tip: "Survey directive this frame is filed under \u25b8 its stage \u2014 internal grouping." },
  { label: "FOV", key: "fov", tip: "Camera field of view, in degrees." },
  { label: "Feed", key: "feed", tip: "BASELINE = unmodified game \u00b7 AUGMENTED = captured with mods active." }
];

// ── helpers ────────────────────────────────────────────
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => (
  { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function imgUrl(f) { return (CFG.r2Base || "uploads/") + f; }
function thumbUrl(f, full) {
  if (CFG.thumbnails === "cf" && CFG.r2Base)
    return CFG.r2Base + "cdn-cgi/image/width=" + CFG.thumbWidth + ",quality=82,format=auto/" + f;
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
      time: "22:30", weather: "CLEAR", fov: e.fov || "100\u00b0",
      project: e.project || CFG.defaultProject,
      stage: e.stage || CFG.defaultStage,
      feed: e.feed || "BASELINE",
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
  return d.toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).toUpperCase();
}

// ── state ──────────────────────────────────────────────
const state = {
  files: SAMPLE,
  shots: deriveShots(SAMPLE),
  sel: { district: "all", subdistrict: "all", areaKey: "all", project: "all", stage: "all", fov: "all", feed: "all" },
  sort: "recent",
  lb: null,               // { list, i }
  narrow: window.innerWidth < 760,
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
  const newCut = Date.now() - CFG.newWindowDays * 864e5;
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
        rows += optHtml(g.key, v, g.display ? g.display(v, s) : v, pool.filter((sh) => sh[g.key] === v).length, 0);
      });
    } else {
      const pk = g.parent, ck = g.child;
      const parentPool = passExcept([pk, ck]);
      rows += optHtml(pk, "all", "All", parentPool.length, 0);
      distinct(pk).forEach((pv) => {
        rows += optHtml(pk, pv, pv, parentPool.filter((sh) => sh[pk] === pv).length, 0);
        if (state.sel[pk] === pv) {
          const childPool = passExcept([ck]).filter((sh) => sh[pk] === pv);
          rows += optHtml(ck, "all", "All " + g.childLabel, childPool.length, 1);
          distinct(ck).filter((cv) => state.shots.some((sh) => sh[pk] === pv && sh[ck] === cv))
            .forEach((cv) => rows += optHtml(ck, cv, cv, childPool.filter((sh) => sh[ck] === cv).length, 1));
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
      <img src="${esc(shot.thumb)}" loading="lazy" alt="${esc(shot.subdistrict)}" />
      <div class="nc-bracket tl"></div><div class="nc-bracket br"></div>
      <div class="nc-time"><span class="dot"></span>22:30</div>
      <div class="nc-stage">${esc(shot.stage)}</div>
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
}

// ── lightbox ───────────────────────────────────────────
function setHash(id) { history.replaceState(null, "", id ? "#" + id : location.pathname + location.search); }
function openLb(id) {
  const list = currentList();
  const i = list.findIndex((s) => s.id === id);
  if (i < 0) return;
  state.lb = { list, i };
  setHash(id); renderLightbox();
}
function closeLb() { state.lb = null; setHash(null); renderLightbox(); }
function stepLb(dir) {
  if (!state.lb) return;
  const n = state.lb.list.length;
  state.lb.i = (state.lb.i + dir + n) % n;
  setHash(state.lb.list[state.lb.i].id); renderLightbox();
}
function renderLightbox() {
  const host = document.getElementById("nc-lb-host");
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
        <button class="nc-lb-nav" data-act="prev">\u2039</button>
        <div class="nc-lb-fig" data-act="stop">
          <img src="${esc(s.url)}" alt="${esc(s.subdistrict)}" />
          <div class="nc-lb-meta">
            <div class="nc-lb-meta-l">
              <div class="nc-lb-titlerow">
                <span class="nc-lb-title">${esc(s.subdistrict)} <span class="d">/ ${esc(s.district)}</span></span>
                <span class="nc-lb-tag">${esc(s.project)} \u00b7 ${esc(s.stage)}</span>
              </div>
              <div class="nc-lb-facts">
                <span><span class="k">\u25b8</span> ${esc(s.areaLabel)}</span>
                <span><span class="k">\u25b8</span> SCENE 22:30</span>
                <span><span class="k">\u25b8</span> Clear</span>
                <span><span class="k">\u25b8</span> ${esc(s.fov)} FOV</span>
                <span><span class="k">\u25b8</span> FEED ${esc(s.feed)}</span>
                <span><span class="k">\u25b8</span> ARCHIVED ${esc(fmtDate(s.date))}</span>
              </div>
            </div>
            <div class="nc-lb-meta-r">
              <span class="nc-lb-id">${esc(s.id)}</span>
              <a class="nc-dl" href="${esc(s.url)}" download="${esc(s.file)}" data-act="stop">\u2193 DOWNLOAD</a>
            </div>
          </div>
        </div>
        <button class="nc-lb-nav" data-act="next">\u203a</button>
      </div>
    </div>`;
}

// ── header status ──────────────────────────────────────
function renderStatus() {
  const wrap = document.getElementById("nc-status");
  if (!wrap) return;
  wrap.className = "nc-status" + (state.status === "CRITICAL" ? " s-critical" : state.status === "ELEVATED" ? " s-elevated" : "");
  wrap.querySelector(".nc-status-label").textContent = "[SYSTEM_STATUS: " + state.status + "]";
  wrap.querySelector(".nc-status-ping").textContent = state.telemetry;
}
// SYNC_OFFSET telemetry — ports the nc-zoning-board generator verbatim.
function telemetryTick() {
  const roll = Math.random();
  let offset;
  if (roll < 0.85) offset = Math.random() * 200;
  else if (roll < 0.95) offset = 200 + Math.random() * 600;
  else offset = 800 + Math.random() * 1000;
  state.status = offset > 800 ? "CRITICAL" : offset > 200 ? "ELEVATED" : "NOMINAL";
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
            <a href="https://academy.nczoning.net">Academy</a>
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
  else if (act === "drawer") { setDrawer(!state.drawer); }
});

document.addEventListener("keydown", (e) => {
  if (!state.lb) return;
  if (e.key === "Escape") closeLb();
  else if (e.key === "ArrowRight") stepLb(1);
  else if (e.key === "ArrowLeft") stepLb(-1);
});

window.addEventListener("resize", () => {
  const narrow = window.innerWidth < 760;
  if (narrow !== state.narrow) { state.narrow = narrow; if (!narrow) setDrawer(false); }
});

function openFromHash() {
  const id = (location.hash || "").replace(/^#/, "");
  if (id) openLb(id);
}

async function loadManifest() {
  if (!CFG.manifest) return;
  try {
    // Manifest is served same-origin by Pages (committed to the repo), NOT from
    // r2Base — keeps this a plain same-origin fetch and avoids needing an R2
    // CORS policy. Images/downloads still come from r2Base via <img>/<a>.
    const res = await fetch(CFG.manifest, { cache: "no-cache" });
    if (!res.ok) return;
    const data = await res.json();
    const files = Array.isArray(data) ? data : (Array.isArray(data.files) ? data.files : null);
    if (files && files.length) {
      state.files = files;
      state.shots = deriveShots(files);
      renderRail(); renderGrid();
      openFromHash();
    }
  } catch (_) { /* keep SAMPLE */ }
}

// ── boot ───────────────────────────────────────────────
renderShell();
renderRail();
renderGrid();
renderStatus();
openFromHash();
loadManifest();
setInterval(telemetryTick, 2000);
