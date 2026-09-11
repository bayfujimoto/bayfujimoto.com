// Game boxes — one physical case per platform, the cover art set into it.
//
// A game record's cover is bare key art (the picture on the front of the box,
// no case, no logos, no rating). At upload the admin sets that art into the
// platform's box template and the composite becomes the cover derivative the
// site shows; the raw art stays in R2 as the master, so the box can be rebuilt
// whenever a template changes (scripts/rebuild-game-boxes.js).
//
// This module is the I/O-free half: the template manifest, the platform →
// template map, the ESRB list, and the geometry that places art and badge.
// Two thin renderers consume it — canvas in the admin
// (src/admin/lib/game-box-render.js) and sharp in the rebuild script — so both
// produce the same picture from the same numbers.
//
// Template files: public/game-boxes/<id>.png (RGBA, art window transparent)
// and public/game-boxes/esrb/<rating>.png. Geometry below is in template
// pixels; renderers scale everything by OUTPUT_HEIGHT / size[1].
//
// No DOM, no Node APIs — keep it portable.

// The composite is rendered at this height regardless of template resolution
// (several source templates are 900 px tall; the art is usually larger). Bump
// a template's `version` when its PNG or geometry changes so ?v= tokens move.
export const OUTPUT_HEIGHT = 1800;

export const TEMPLATES = {
  // id: { size, art_window [x0,y0,x1,y1], esrb slot [x0,y0,x1,y1], real_mm, version }
  switch2:  { size: [1165, 1886], art_window: [0, 41, 1107, 1844],  esrb: [41, 1586, 196, 1803], real_mm: [105, 170], version: 1, label: "Nintendo Switch 2" },
  switch:   { size: [640, 1036],  art_window: [0, 22, 608, 1014],   esrb: [21, 885, 94, 992],    real_mm: [105, 170], version: 1, label: "Nintendo Switch" },
  ps3:      { size: [600, 900],   art_window: [17, 132, 587, 885],  esrb: [18, 754, 102, 870],   real_mm: [135, 170], version: 1, label: "PlayStation 3" },
  wiiu:     { size: [600, 900],   art_window: [0, 47, 587, 890],    esrb: [20, 757, 105, 874],   real_mm: [135, 190], version: 1, label: "Wii U" },
  wii:      { size: [1585, 2220], art_window: [16, 121, 1517, 2181], esrb: [63, 1836, 267, 2146], real_mm: [135, 190], version: 1, label: "Wii" },
  gamecube: { size: [600, 900],   art_window: [10, 88, 579, 880],   esrb: [31, 755, 105, 859],   real_mm: [135, 190], version: 1, label: "Nintendo GameCube" },
  "3ds":    { size: [598, 547],   art_window: [0, 14, 523, 533],    esrb: [21, 449, 66, 512],    real_mm: [137, 125], version: 1, label: "Nintendo 3DS" },
  ds:       { size: [647, 593],   art_window: [91, 16, 634, 581],   esrb: [114, 490, 163, 558],  real_mm: [137, 125], version: 1, label: "Nintendo DS" },
  steam:    { size: [604, 803],   art_window: [0, 92, 604, 803],    esrb: [21, 690, 87, 782],    real_mm: [135, 190], version: 1, label: "Steam" },
};

// The controlled `platform` vocabulary — the hardware the game was played on.
// Order is the admin select's order. Three DS models share one case.
export const PLATFORMS = [
  { value: "Switch 2", template: "switch2" },
  { value: "Switch",   template: "switch" },
  { value: "PS3",      template: "ps3" },
  { value: "Wii U",    template: "wiiu" },
  { value: "Wii",      template: "wii" },
  { value: "GameCube", template: "gamecube" },
  { value: "3DS",      template: "3ds" },
  { value: "DS",       template: "ds" },
  { value: "DS Lite",  template: "ds" },
  { value: "DSi",      template: "ds" },
  { value: "Steam",    template: "steam" },
];

// Legacy free-text spellings seen in records before the vocabulary existed.
const PLATFORM_ALIASES = {
  "game cube": "GameCube", gamecube: "GameCube", "nintendo gamecube": "GameCube",
  mac: "Steam", pc: "Steam", windows: "Steam", "steam deck": "Steam",
  "nintendo switch": "Switch", "nintendo switch 2": "Switch 2", "switch2": "Switch 2",
  "wii u": "Wii U", wiiu: "Wii U", "nintendo ds": "DS", "nintendo 3ds": "3DS",
  "playstation 3": "PS3", ps3: "PS3",
};

export function normalizePlatform(value) {
  if (!value) return "";
  const v = String(value).trim();
  if (PLATFORMS.some(p => p.value === v)) return v;
  return PLATFORM_ALIASES[v.toLowerCase()] || v;
}

export function templateIdFor(platform) {
  const p = PLATFORMS.find(x => x.value === normalizePlatform(platform));
  return p ? p.template : null;
}

// ESRB categories — North American ratings, the letter icon only. Empty means
// no badge (unrated, or the rating is not known).
export const ESRB_RATINGS = ["", "E", "E10+", "T", "M", "AO", "EC", "RP"];
export const ESRB_FILES = { "E": "E", "E10+": "E10", "T": "T", "M": "M", "AO": "AO", "EC": "EC", "RP": "RP" };

export function esrbIconName(rating) {
  return ESRB_FILES[rating] || null;
}

// Fit = how the art sits in the window. zoom ≥ 1 scales beyond cover-fill;
// x / y are offsets as a fraction of the window's width / height.
export const DEFAULT_FIT = { zoom: 1, x: 0, y: 0 };

export function normalizeFit(fit) {
  const z = Number(fit?.zoom); const x = Number(fit?.x); const y = Number(fit?.y);
  return {
    zoom: Number.isFinite(z) && z > 0 ? Math.min(Math.max(z, 1), 4) : 1,
    x: Number.isFinite(x) ? Math.min(Math.max(x, -1), 1) : 0,
    y: Number.isFinite(y) ? Math.min(Math.max(y, -1), 1) : 0,
  };
}

export function isDefaultFit(fit) {
  const f = normalizeFit(fit);
  return f.zoom === 1 && f.x === 0 && f.y === 0;
}

// Read the box options a record carries: platform → template, esrb, cover_fit.
export function boxOptionsFromRecord(record) {
  const template = templateIdFor(record?.platform);
  if (!template) return null;
  return {
    template,
    rating: ESRB_RATINGS.includes(record?.esrb) ? record.esrb : "",
    fit: normalizeFit(record?.cover_fit),
  };
}

/**
 * Where everything goes, in OUTPUT pixels.
 * @param {string} templateId
 * @param {number} artW  @param {number} artH  natural size of the art
 * @param {{zoom,x,y}} fit
 * @param {string} rating  ESRB rating or ""
 * @returns {{ width, height, scale, window:{x,y,w,h}, art:{x,y,w,h}, esrb:{x,y,w,h}|null }}
 */
export function layoutBox(templateId, artW, artH, fit = DEFAULT_FIT, rating = "", esrbAspect = 830 / 1159) {
  const t = TEMPLATES[templateId];
  if (!t) throw new Error(`unknown game box template: ${templateId}`);
  const s = OUTPUT_HEIGHT / t.size[1];
  const width = Math.round(t.size[0] * s);
  const height = OUTPUT_HEIGHT;

  const [wx0, wy0, wx1, wy1] = t.art_window;
  const win = { x: wx0 * s, y: wy0 * s, w: (wx1 - wx0) * s, h: (wy1 - wy0) * s };

  const f = normalizeFit(fit);
  const cover = Math.max(win.w / artW, win.h / artH) * f.zoom;
  const aw = artW * cover, ah = artH * cover;
  const art = {
    x: win.x + (win.w - aw) / 2 + f.x * win.w,
    y: win.y + (win.h - ah) / 2 + f.y * win.h,
    w: aw, h: ah,
  };

  let esrb = null;
  if (rating && esrbIconName(rating)) {
    const [ex0, ey0, ex1, ey1] = t.esrb;
    const slot = { x: ex0 * s, y: ey0 * s, w: (ex1 - ex0) * s, h: (ey1 - ey0) * s };
    // contain the icon in the slot, anchored bottom-left
    const k = Math.min(slot.w / esrbAspect, slot.h);
    const w = k * esrbAspect, h = k;
    esrb = { x: slot.x, y: slot.y + slot.h - h, w, h };
  }

  return { width, height, scale: s, window: win, art, esrb };
}

// ── Cache-bust token ─────────────────────────────────────────────────────────
// A box asset's ?v= token is "<content-hash>bx<template>-<param-hash>": the
// content hash covers the raw art, the param hash covers template version,
// rating and fit, so the URL moves whenever the rendered box would differ.
// The site reads the "bx" mode the way it reads a cut-out's "c20x2": the
// full-resolution transparent composite lives beside the master in cutouts/.
function shortHash(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

export function boxTokenMode({ template, rating, fit }) {
  const t = TEMPLATES[template];
  const f = normalizeFit(fit);
  const params = `${t?.version ?? 0}|${rating || ""}|${f.zoom}|${f.x}|${f.y}`;
  return `bx${template}-${shortHash(params)}`;
}

export function isBoxToken(token) {
  return /bx[a-z0-9]+-[a-z0-9]+$/.test(String(token || ""));
}

// Does a stored asset value ("name.ext?v=<token>") carry a box composite?
export function isBoxAsset(stored) {
  const s = String(stored || "");
  const qi = s.indexOf("?v=");
  return qi !== -1 && isBoxToken(s.slice(qi + 3));
}
