// NC Survey Archive — hosting runtime config.
//
// Static and linked (not bundled), so you can retune the deploy without
// rebuilding anything. The app reads window.SURVEY_CONFIG on load; nothing
// else configures it.
//
// Local dev without R2: set r2Base to "" to serve images from a local
// /uploads/ folder, and thumbnails to "off".
window.SURVEY_CONFIG = {
  // Public base URL of the R2 bucket / custom domain, WITH trailing slash.
  // "" → serve from the local uploads/ folder (works on clone, no R2 needed).
  // "" → serve from the local uploads/ folder (local dev, no R2 needed).
  r2Base: "https://survey.nczoning.net/",

  // JSON served at (r2Base + manifest) listing the frames. Array of entries,
  // each a filename string OR an object:
  //   { "file": "kabuki_roof__t0002_00004.webp",
  //     "project": "Skyline Bloom", "stage": "Calibration",
  //     "feed": "BASELINE", "date": "2026-07-12T22:30:00Z" }
  // "" → skip the fetch and use the inline SAMPLE list in app.js.
  manifest: "manifest.json",

  // Grid thumbnails (full-res is always used in the lightbox):
  //   "cf"     Cloudflare Image Resizing (/cdn-cgi/image) — needs the images
  //            on a CF zone; no pre-processing. Enable Image Resizing on the zone.
  //   "suffix" pre-generated <name>_thumb.webp beside each original.
  //   "off"    serve full-res in the grid too.
  // Local dev without R2: set thumbnails: "off".
  thumbnails: "cf",
  thumbWidth: 640,

  // Frames whose date is within this many days show a NEW tag (needs a real date).
  newWindowDays: 14,

  // Corp-themed fallbacks when a frame has no project / stage assigned.
  defaultProject: "Project Nightlight",
  defaultStage: "Reference Sweep"
};
