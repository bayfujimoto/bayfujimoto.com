// ── Desk objects — the one table ─────────────────────────────────────────────
// The six objects that sit on the desk (five series containers and the Guide's
// key), the model file each is built from, and the click remap that makes the
// labor box open Accumulation and the accumulation bundle open Labor.
//
// Shared by the browser bundles (scene.js places the objects; panels.js builds
// the Guide card from them; state.js routes clicks) and by Node scripts
// (build-data.js resolves Guide frames; strip-model-textures.js and
// render-desk-thumbnails.js iterate the model files). Plain data, no imports —
// importable from both sides, like field-schema.js and cutout.js.

// Keyed by the object's own series id (what it *is*), not by what it opens.
export const DESK_OBJECTS = {
  identity:     { noun: "dossier", file: "desk-identity-dossier.glb" },
  labor:        { noun: "box",     file: "desk-labor-box.glb" },
  consumption:  { noun: "sphere",  file: "desk-consumption-sphere.glb" },
  creation:     { noun: "stamp",   file: "desk-creation-stamp.glb" },
  accumulation: { noun: "bundle",  file: "desk-accumulation-bundle.glb" },
  guide:        { noun: "key",     file: "desk-guide-key.glb" },
};

// Desk-object click remap. The labor and accumulation objects keep their forms,
// positions, and labels, but clicking each opens the other's browse view.
// Applied to every desk-entry path (3D click, keyboard skip menu, hidden HTML
// desk) so all input modes navigate identically. URLs and deep links are
// unaffected — only the act of clicking a desk object is swapped.
export const DESK_CLICK_REMAP = { labor: "accumulation", accumulation: "labor" };

// Where a click on object `id` leads.
export function deskTarget(id) {
  return DESK_CLICK_REMAP[id] || id;
}

// Inverse of deskTarget: the object whose click opens `target`.
export function objectFor(target) {
  return Object.keys(DESK_OBJECTS).find((id) => deskTarget(id) === target) || null;
}

// Model hosting. Three prefixes, all derived from MODEL_BASE:
//
//   MODEL_BASE       the full-texture originals as authored — 120 MB across the
//                    six objects, far too heavy to serve. Only desk.glb is
//                    loaded from here.
//   WEB_BASE         what the site actually loads: the same objects WITH their
//                    textures, web-optimised by scripts/finish-desk-model.js
//                    (WebP maps, quantized + meshopt geometry) and published by
//                    scripts/publish-web-models.js. 2.5 MB for all six.
//   UNTEXTURED_BASE  the earlier flat-material copies (scripts/strip-model-textures.js).
//                    Kept as a fallback: point OBJECT_BASE back at it and set
//                    STRIP_MODEL_TEXTURES true in model-look.js to restore the
//                    untextured look.
export const MODEL_BASE = "https://pub-0038be3e0b514b5080cb9935976102b8.r2.dev/models/";
export const WEB_BASE = `${MODEL_BASE}web/`;
export const UNTEXTURED_BASE = `${MODEL_BASE}untextured/`;
