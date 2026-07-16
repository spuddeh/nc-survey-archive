// NC Survey Archive — shared constants (ES module).
//
// Everything tunable or data-shaped lives here; app.js holds only behaviour.
// Runtime *deploy* config (R2 base, manifest URL, thumbnails) stays in
// /config.js so the deploy can be retuned without touching the app — this file
// is for values that are part of the app itself.

// Fallbacks applied when /config.js sets no value (local-dev friendly: serve
// images from uploads/, static manifest, no thumbnail service).
export const CONFIG_DEFAULTS = {
  r2Base: "",
  manifest: "manifest.json",
  thumbnails: "off",
  thumbWidth: 640,
  newWindowDays: 3
};

// Lore-appropriate fallback when a frame genuinely has no value for a field.
// Applied at RENDER time only — missing metadata is stored as "" so filters
// and future cleanup can tell real values from absent ones.
export const UNKNOWN = "UNLOGGED";

// Image directory used when config.r2Base is "" (local dev, no R2).
export const LOCAL_IMG_DIR = "uploads/";

// Cloudflare Image Resizing quality for grid thumbnails (1–100).
export const THUMB_QUALITY = 82;

// ── layout / interaction tuning ────────────────────────
// Below this viewport width the rail becomes a drawer and the header collapses.
// Mirrors --nc-narrow in theme.css and the 760px media query in style.css —
// CSS can't read JS (or vice versa) without a build step, so change all three.
export const NARROW_BREAKPOINT_PX = 760;

// Lightbox touch swipe: minimum horizontal travel, and how strongly horizontal
// the gesture must be (|dx| > |dy| * ratio) before it counts as prev/next.
export const SWIPE_MIN_PX = 45;
export const SWIPE_AXIS_RATIO = 1.4;

// Mobile header auto-hide: hide once scrolled past HIDE_AFTER_PX, reveal after
// scrolling back up by at least REVEAL_DELTA_PX (hysteresis against jitter).
export const HEADER_HIDE_AFTER_PX = 64;
export const HEADER_REVEAL_DELTA_PX = 4;

export const DAY_MS = 864e5;

// Uploaded-date display (lightbox metadata row).
export const DATE_LOCALE = "en-GB";
export const DATE_FMT = { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" };

// Header SYNC_OFFSET telemetry — distribution and thresholds port the
// nc-zoning-board generator verbatim: 85% nominal (0–200ms), 10% elevated
// (200–800ms), 5% critical (800–1800ms).
export const TELEMETRY_TICK_MS = 2000;
export const TELEMETRY = {
  NOMINAL_P: 0.85,      // cumulative probability of a nominal roll
  ELEVATED_P: 0.95,     // …of nominal-or-elevated (rest is critical)
  ELEVATED_MS: 200,     // offsets above this show ELEVATED
  CRITICAL_MS: 800,     // offsets above this show CRITICAL
  ELEVATED_SPAN_MS: 600,   // elevated rolls span ELEVATED_MS + 0–600
  CRITICAL_SPAN_MS: 1000   // critical rolls span CRITICAL_MS + 0–1000
};

// ── domain data ────────────────────────────────────────
// Filename convention: <subdistrict>_<vantage>__t<tour>_<frame>.webp
// The subdistrict key may contain underscores; the vantage is the last token.
// subdistrict key → Night City district hierarchy (code must be unique).
export const DISTRICTS = {
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
export const AREAS = {
  roof:   { label: "Aerial / Rooftop", short: "AERIAL" },
  street: { label: "Street Level",     short: "STREET" }
};

// Inline fixture used only when no manifest is configured (local dev without
// R2 / Pages Functions). Same string-or-object shape as a manifest entry.
export const SAMPLE = [
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
export const FACETS = [
  { key: "district" }, { key: "subdistrict" }, { key: "areaKey" },
  { key: "project" }, { key: "stage" }, { key: "fov" }, { key: "feed" }
];

// how the rail groups them — hierarchical groups reveal children under the
// selected parent (District ▸ Subdistrict, Project ▸ Stage)
export const GROUPS = [
  { label: "Location", parent: "district", child: "subdistrict", childLabel: "Subdistricts", tip: "Night City district ▸ subdistrict where the frame was captured." },
  { label: "Vantage", key: "areaKey", display: (v, s) => (s ? s.areaShort : v), tip: "Camera position — street level or aerial / rooftop." },
  { label: "Project", parent: "project", child: "stage", childLabel: "Stages", tip: "Survey directive this frame is filed under ▸ its stage — internal grouping." },
  { label: "FOV", key: "fov", tip: "Camera field of view, in degrees." },
  { label: "Feed", key: "feed", tip: "BASELINE = unmodified game · AUGMENTED = captured with mods active." }
];

// Inline stroke icons (currentColor) for the lightbox metadata row.
export const ICONS = {
  eye:      '<path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z"/><circle cx="12" cy="12" r="3"/>',
  clock:    '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  sun:      '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4"/>',
  fov:      '<circle cx="12" cy="12" r="9"/><path d="M12 3v4M12 17v4M3 12h4M17 12h4"/>',
  feed:     '<path d="M4.9 19.1a10 10 0 0 1 0-14.2M7.8 16.2a6 6 0 0 1 0-8.4M16.2 7.8a6 6 0 0 1 0 8.4M19.1 4.9a10 10 0 0 1 0 14.2"/><circle cx="12" cy="12" r="1.6"/>',
  user:     '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  calendar: '<rect x="3" y="4" width="18" height="17" rx="2"/><path d="M3 9h18M8 2v4M16 2v4"/>'
};
