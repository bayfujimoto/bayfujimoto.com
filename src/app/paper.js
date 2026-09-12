import { IMAGE_BASE } from "./image-url.js";

// ── Paper — documents rendered to canvas, for the desk in the scene ──────────
// The papers desk draws each document from a small spec (desk-docs.js) onto a
// 2D canvas, which becomes the texture of a plane in the WebGL desk
// (desk-metal.js). Everything the DOM desk did with CSS — stock, grain,
// ragged and torn edges, rules, typeset and handwritten text, scans, stamps
// with ink dropout, tape, stains, creases — is drawn here, so a sheet can lie
// under a real light and cast a real shadow.
//
// Coordinates in a spec are stage px (the composition's design units); the
// canvas is rendered at `scale` texels per stage px.

const STOCK = { cream: "#ece4d1", white: "#f3efe6", thermal: "#f7f3ea", diazo: "#33507c", dark: "#1c1a17", manila: "#d3bb85", blue: "#c9d5e6", legal: "#f0e6b4" };
const INK = { paper: "#2a2218", faint: "rgba(42,34,24,0.35)", blue: "#25407a", pencil: "rgba(50,44,38,0.7)", green: "#2d8a5a", red: "#b2372c", diazoLine: "rgba(200,214,236,0.75)" };
const FONT = {
  serif: "'EB Garamond', Georgia, serif",
  mono: "'Commit Mono', ui-monospace, 'Cascadia Mono', 'Fira Mono', monospace",
  hand: "'Homemade Apple', cursive",
  note: "'Caveat', cursive",
};

export async function ensureFonts() {
  if (!document.fonts) return;
  // The handwriting comes from Google Fonts; the stylesheet has to have
  // arrived before document.fonts can load anything from it, so wait for the
  // link itself (bounded), then for the faces, then for the set to settle.
  let link = document.querySelector("link[data-da-fonts]");
  const linkLoaded = new Promise((res) => {
    if (link && (link.dataset.loaded || link.sheet)) return res(); // already in (index.html carries the link; .sheet is set once it has arrived)
    if (!link) {
      link = document.createElement("link");
      link.rel = "stylesheet"; link.dataset.daFonts = "1";
      link.href = "https://fonts.googleapis.com/css2?family=Homemade+Apple&family=Caveat:wght@400;600&display=swap";
      document.head.appendChild(link);
    }
    link.addEventListener("load", () => { link.dataset.loaded = "1"; res(); }, { once: true });
    link.addEventListener("error", () => res(), { once: true });
    setTimeout(res, 4000);
  });
  await linkLoaded;
  const wants = ["12px 'EB Garamond'", "italic 12px 'EB Garamond'", "12px 'Commit Mono'", "12px 'Homemade Apple'", "600 12px 'Caveat'", "12px 'Caveat'"];
  await Promise.all(wants.map((f) => document.fonts.load(f).catch(() => null)));
  await document.fonts.ready;
}

function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

// One noise tile for grain, shared.
let grainTile = null;
function grain() {
  if (grainTile) return grainTile;
  const c = document.createElement("canvas"); c.width = c.height = 256;
  const g = c.getContext("2d"); const img = g.createImageData(256, 256); const r = rng(5);
  for (let i = 0; i < img.data.length; i += 4) { const v = Math.floor(r() * 255); img.data[i] = 82; img.data[i + 1] = 69; img.data[i + 2] = 51; img.data[i + 3] = Math.floor(v * 0.5); }
  g.putImageData(img, 0, 0); grainTile = c; return c;
}

// The sheet's outline: a rectangle whose edges wander a little (rough) and
// one of which may be torn.
function edgePath(w, h, seed, rough, torn) {
  const r = rng(seed); const p = new Path2D();
  const amp = rough ? 1.6 : 0.35, step = 7;
  const tornAmp = 5.5;
  const pts = [];
  const side = (x0, y0, x1, y1, tornSide) => {
    const len = Math.hypot(x1 - x0, y1 - y0); const n = Math.max(2, Math.round(len / step));
    for (let i = 0; i <= n; i++) {
      const t = i / n; let x = x0 + (x1 - x0) * t, y = y0 + (y1 - y0) * t;
      const a = tornSide ? tornAmp * (0.3 + r()) : amp * (r() - 0.5);
      if (x0 === x1) x += (x0 === 0 ? 1 : -1) * (tornSide ? a : -a) * (tornSide ? 1 : 1); else y += (y0 === 0 ? 1 : -1) * (tornSide ? a : -a);
      pts.push([x, y]);
    }
  };
  side(0, 0, w, 0, torn === "top"); side(w, 0, w, h, torn === "right"); side(w, h, 0, h, torn === "bottom"); side(0, h, 0, 0, torn === "left");
  p.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) p.lineTo(pts[i][0], pts[i][1]); p.closePath();
  return p;
}

const imageCache = new Map();
const IMAGE_WAIT_MS = 15000;
export function loadImage(src) {
  if (!src) return Promise.resolve(null);
  if (imageCache.has(src)) return imageCache.get(src);
  // Canvas needs a CORS load. The same image is shown elsewhere on the site
  // as a plain <img>, and that response — cached for a year, without the
  // Access-Control-Allow-Origin header, and without Vary — would be handed
  // back to a crossOrigin request and fail it (a black sheet on the deploy,
  // fine on a fresh dev cache). A distinct URL gives the canvas load its own
  // cache entry.
  const url = src.startsWith("data:") || src.startsWith("blob:") ? src : src + (src.includes("?") ? "&" : "?") + "canvas=1";
  // Only the archive's own images (and inline data) can be drawn: another
  // host won't grant canvas use, and a request to it can hang and hold the
  // whole desk. And no image may hold the desk for long — past the limit the
  // sheet draws its placeholder.
  const local = src.startsWith("data:") || src.startsWith("blob:") || src.startsWith("/") || (IMAGE_BASE.length > 0 && src.startsWith(IMAGE_BASE)) || src.startsWith(location.origin);
  if (!local) { const none = Promise.resolve(null); imageCache.set(src, none); return none; }
  const pr = new Promise((res) => {
    const im = new Image(); im.crossOrigin = "anonymous";
    const t = setTimeout(() => { im.src = ""; res(null); }, IMAGE_WAIT_MS);
    im.onload = () => { clearTimeout(t); res(im); }; im.onerror = () => { clearTimeout(t); res(null); }; im.src = url;
  });
  imageCache.set(src, pr); return pr;
}

// Marker ink, laid down once per surface pass. `paint` null means the visible
// ink — a gradient across the stroke, because metallic is not one colour — and
// otherwise a flat colour, which is how the same strokes are written into the
// roughness and specular maps (see renderSurface).
function markerInk(ctx, L, paint) {
  const sz = L.size || 14, fam = FONT[L.font || "note"], nib = L.nib ?? sz * 0.08;
  ctx.save();
  ctx.translate(L.x, L.y); if (L.rotate) ctx.rotate(L.rotate * Math.PI / 180);
  ctx.font = `${L.weight || 600} ${sz}px ${fam}`;
  ctx.textAlign = L.align || "left"; ctx.textBaseline = "middle";
  ctx.lineJoin = "round"; ctx.lineCap = "round"; ctx.lineWidth = nib;
  if (paint) { ctx.strokeStyle = paint; ctx.fillStyle = paint; }
  else {
    ctx.globalAlpha = L.opacity ?? 0.92;
    const ink = ctx.createLinearGradient(0, -sz * 0.55, 0, sz * 0.55);
    ink.addColorStop(0, "#fbfcfd"); ink.addColorStop(0.38, "#aeb4bd"); ink.addColorStop(0.56, "#eef0f4"); ink.addColorStop(1, "#8f959e");
    ctx.strokeStyle = ink; ctx.fillStyle = ink;
  }
  ctx.strokeText(L.text, 0, 0); ctx.fillText(L.text, 0, 0);
  ctx.restore();
}

// Where the marker lies, the SURFACE is different, not just the colour: a paint
// pen leaves a smoother, more reflective film than the lacquer around it, so it
// takes the lamp as a hard glint while the printed label stays matte. Two data
// canvases carry that — roughness in the green channel, specular strength as a
// grey — and desk-scene.js hangs them on the face material as roughnessMap and
// specularColorMap. Returns null for a document with no marker on it.
export function renderSurface(spec, scale = 2, o = {}) {
  const marks = (spec.layers || []).filter((L) => L.t === "marker" && L.text);
  if (!marks.length) return null;
  const pass = (base, ink) => {
    const c = document.createElement("canvas");
    c.width = Math.ceil(spec.w * scale); c.height = Math.ceil(spec.h * scale);
    const ctx = c.getContext("2d"); ctx.scale(scale, scale);
    ctx.fillStyle = base; ctx.fillRect(0, 0, spec.w, spec.h);
    for (const L of marks) markerInk(ctx, L, ink);
    return c;
  };
  const g = (v) => `rgb(0,${Math.round(Math.min(1, Math.max(0, v)) * 255)},0)`;
  const k = (v) => { const n = Math.round(Math.min(1, Math.max(0, v)) * 255); return `rgb(${n},${n},${n})`; };
  return {
    rough: pass(g(o.baseRough ?? 0.2), g(o.inkRough ?? 0.06)),
    spec: pass(k(o.baseSpec ?? 0.45), k(o.inkSpec ?? 1)),
  };
}

function inkDropout(ctx, x, y, w, h, seed, amount = 0.45) {
  // Erase speckles from a stamped area so the ink prints unevenly.
  const r = rng(seed); ctx.save(); ctx.globalCompositeOperation = "destination-out";
  const n = Math.round(w * h * 0.06 * amount);
  for (let i = 0; i < n; i++) { const px = x + r() * w, py = y + r() * h, rad = 0.4 + r() * 1.4; ctx.globalAlpha = 0.5 + r() * 0.5; ctx.beginPath(); ctx.arc(px, py, rad, 0, Math.PI * 2); ctx.fill(); }
  ctx.restore();
}

function drawText(ctx, L) {
  const size = L.size || 8, family = FONT[L.font || "serif"];
  ctx.save();
  ctx.translate(L.x || 0, L.y || 0); if (L.rotate) ctx.rotate(L.rotate * Math.PI / 180);
  ctx.font = `${L.italic ? "italic " : ""}${L.weight || (L.font === "note" ? 600 : 400)} ${size}px ${family}`;
  ctx.fillStyle = L.color || INK.paper; ctx.globalAlpha = L.opacity ?? 1;
  ctx.textBaseline = "top";
  if ("letterSpacing" in ctx) ctx.letterSpacing = L.letterSpacing || "0px";
  ctx.textAlign = L.align === "right" ? "right" : L.align === "center" ? "center" : "left";
  const lines = String(L.text ?? "").split("\n"); const lh = L.lineHeight || size * 1.35;
  let y = 0;
  for (const raw of lines) {
    let line = raw;
    if (L.maxWidth) { // crude wrap
      const words = raw.split(" "); let cur = "";
      for (const wd of words) { const t = cur ? cur + " " + wd : wd; if (ctx.measureText(t).width > L.maxWidth && cur) { ctx.fillText(cur, 0, y); y += lh; cur = wd; } else cur = t; }
      line = cur;
    }
    if (L.uppercase) line = line.toUpperCase();
    ctx.fillText(line, 0, y); y += lh;
  }
  ctx.restore();
}

// ── The renderer ─────────────────────────────────────────────────────────────
export async function renderPaper(spec, scale = 2) {
  const c = document.createElement("canvas"); c.width = Math.ceil(spec.w * scale); c.height = Math.ceil(spec.h * scale);
  const ctx = c.getContext("2d"); ctx.scale(scale, scale);
  const seed = spec.seed || 1;
  // images first, so the draw is synchronous after
  const imgs = await Promise.all((spec.layers || []).filter((L) => L.src).map((L) => loadImage(L.src).then((im) => im || (L.fallback ? loadImage(L.fallback) : null))));
  const imgFor = new Map(); (spec.layers || []).filter((L) => L.src).forEach((L, i) => imgFor.set(L, imgs[i]));
  // a print turns to match its picture: swap the sheet (and the layer) if the
  // image's orientation disagrees with the spec's
  if (spec.autoOrient) {
    const L0 = (spec.layers || []).find((L) => L.src && imgFor.get(L)); const im = L0 && imgFor.get(L0);
    if (im && (im.naturalWidth > im.naturalHeight) !== (spec.w > spec.h)) { [spec.w, spec.h] = [spec.h, spec.w]; [L0.w, L0.h] = [L0.h, L0.w]; c.width = Math.ceil(spec.w * scale); c.height = Math.ceil(spec.h * scale); ctx.setTransform(scale, 0, 0, scale, 0, 0); }
  }
  const w = spec.w, h = spec.h;

  const outline = edgePath(w, h, seed, !!spec.rough, spec.torn || null);
  ctx.save(); ctx.clip(outline);
  // stock — a cutout scan brings its own shape, so it gets no sheet behind it,
  // and a `bare` document is not paper at all: the games cartridge is a moulded
  // object whose face is exactly what its layers draw, with its silhouette in
  // the geometry rather than in the alpha (desk-scene.js, cardGeometry).
  if (!spec.cutout && !spec.bare) { ctx.fillStyle = STOCK[spec.stock || "cream"]; ctx.fillRect(-4, -4, w + 8, h + 8); }
  if (!spec.cutout && !spec.bare && spec.stock !== "dark" && spec.stock !== "diazo") {
    const g = ctx.createLinearGradient(0, 0, w, h); g.addColorStop(0, "rgba(255,255,255,.35)"); g.addColorStop(0.45, "rgba(255,255,255,0)"); g.addColorStop(1, "rgba(10,8,5,.06)");
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  }

  for (const L of spec.layers || []) {
    switch (L.t) {
      case "rules": { ctx.save(); ctx.globalAlpha = L.opacity ?? 0.55; ctx.strokeStyle = INK.faint; ctx.lineWidth = 1; const gap = L.dense ? 6 : 10; for (let y = (L.top || 0) + gap; y < h; y += gap) { ctx.beginPath(); ctx.moveTo(0, y + 0.5); ctx.lineTo(w, y + 0.5); ctx.stroke(); } ctx.restore(); break; }
      case "grid": { ctx.save(); ctx.globalAlpha = 0.5; ctx.strokeStyle = INK.faint; ctx.lineWidth = 1; for (let y = (L.top || 0); y < h; y += 16) { ctx.beginPath(); ctx.moveTo(0, y + 0.5); ctx.lineTo(w, y + 0.5); ctx.stroke(); } for (let x = 0; x < w; x += 32) { ctx.beginPath(); ctx.moveTo(x + 0.5, L.top || 0); ctx.lineTo(x + 0.5, h); ctx.stroke(); } ctx.restore(); break; }
      case "text": drawText(ctx, L); break;
      case "image": { const im = imgFor.get(L); if (!im) break; ctx.save(); ctx.translate(L.x, L.y); if (L.rotate) ctx.rotate(L.rotate * Math.PI / 180); if (L.fit === "cover") { const r = Math.max(L.w / im.naturalWidth, L.h / im.naturalHeight); const sw = L.w / r, sh = L.h / r; ctx.drawImage(im, (im.naturalWidth - sw) / 2, (im.naturalHeight - sh) / 2, sw, sh, 0, 0, L.w, L.h); } else ctx.drawImage(im, 0, 0, L.w, L.h); ctx.restore(); break; }
      case "photo": { ctx.save(); ctx.translate(L.x, L.y); if (L.rotate) ctx.rotate(L.rotate * Math.PI / 180); ctx.fillStyle = STOCK.white; ctx.fillRect(0, 0, L.w, L.h); const im = imgFor.get(L); const b = L.border ?? 4; if (im) { const iw = L.w - b * 2, ih = L.h - b * 2; if (L.fit === "cover") { const r = Math.max(iw / im.naturalWidth, ih / im.naturalHeight); const sw = iw / r, sh = ih / r; ctx.drawImage(im, (im.naturalWidth - sw) / 2, (im.naturalHeight - sh) / 2, sw, sh, b, b, iw, ih); } else ctx.drawImage(im, b, b, iw, ih); } else { const g = ctx.createLinearGradient(0, 0, L.w, L.h); g.addColorStop(0, "#7a6a52"); g.addColorStop(0.7, "#2f261c"); ctx.fillStyle = g; ctx.fillRect(b, b, L.w - b * 2, L.h - b * 2); } ctx.restore(); break; }
      case "sketch": { ctx.save(); ctx.translate(L.x || 0, L.y || 0); ctx.scale(L.scale || 1, L.scale || 1); ctx.strokeStyle = L.stroke || "#3a3128"; ctx.lineWidth = L.width || 1; ctx.globalAlpha = L.opacity ?? 0.7; ctx.lineCap = "round"; const r = rng(seed + 7); for (const d of L.paths) { const p = new Path2D(d); ctx.setLineDash(L.dash || []); ctx.stroke(p); ctx.save(); ctx.translate((r() - 0.5) * 1.2, (r() - 0.5) * 1.2); ctx.globalAlpha *= 0.45; ctx.stroke(p); ctx.restore(); } ctx.restore(); break; }
      case "stampCircle": {
        ctx.save(); ctx.translate(L.x + L.d / 2, L.y + L.d / 2); ctx.rotate((L.rotate || -14) * Math.PI / 180); const R = L.d / 2;
        ctx.strokeStyle = INK.green; ctx.fillStyle = INK.green; ctx.globalAlpha = 0.8;
        ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, R * 0.92, 0, Math.PI * 2); ctx.stroke();
        ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(0, 0, R * 0.66, 0, Math.PI * 2); ctx.stroke();
        ctx.font = `${R * 0.19}px ${FONT.mono}`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
        const text = L.text || ""; const rr = R * 0.8; const total = text.length; const arc = Math.PI * 1.9;
        for (let i = 0; i < total; i++) { const a = -Math.PI / 2 + (i / total - 0.5) * arc; ctx.save(); ctx.rotate(a); ctx.translate(0, -rr); ctx.fillText(text[i], 0, 0); ctx.restore(); }
        ctx.font = `700 ${R * 0.2}px ${FONT.mono}`; ctx.fillText(L.date || "", 0, 2);
        ctx.restore(); inkDropout(ctx, L.x, L.y, L.d, L.d, seed + 3, 0.5); break; }
      // A rubber date stamp: red outline, the text inside it, the ink dropping
      // out in speckles. Defaults are the office stamp the specification sheet
      // carries; the size/padding overrides are for the due-date slip, where
      // three of them stack in a 50 px column.
      case "stampBox": { const sz = L.size || 9, padX = L.padX ?? 7, boxH = L.boxH ?? 16; ctx.save(); ctx.translate(L.x, L.y); ctx.rotate((L.rotate || -8) * Math.PI / 180); ctx.globalAlpha = L.opacity ?? 0.7; ctx.strokeStyle = INK.red; ctx.fillStyle = INK.red; ctx.lineWidth = L.lineWidth ?? 2; ctx.font = `${sz}px ${FONT.mono}`; if ("letterSpacing" in ctx) ctx.letterSpacing = L.letterSpacing || "2px"; const tw = ctx.measureText(L.text).width + padX * 2; ctx.strokeRect(0, 0, tw, boxH); ctx.textBaseline = "middle"; ctx.fillText(L.text, padX, boxH / 2); ctx.restore(); inkDropout(ctx, L.x - 4, L.y - 4, tw + 12, boxH + 10, seed + (L.seed ?? 4), L.dropout ?? 0.35); break; }
      case "seal": { ctx.save(); ctx.translate(L.x, L.y); ctx.rotate((L.rotate || 0) * Math.PI / 180); ctx.globalAlpha = 0.85; ctx.strokeStyle = INK.red; ctx.fillStyle = INK.red; ctx.lineWidth = 2; ctx.strokeRect(1, 1, 24, 24); ctx.fillRect(6, 6, 6, 12); ctx.fillRect(15, 9, 7, 9); ctx.restore(); inkDropout(ctx, L.x, L.y, 26, 26, seed + 5, 0.4); break; }
      case "tape": { ctx.save(); ctx.translate(L.x, L.y); ctx.rotate((L.rotate || 0) * Math.PI / 180); const g = ctx.createLinearGradient(0, 0, L.w, 0); g.addColorStop(0, "rgba(250,240,205,.55)"); g.addColorStop(0.35, "rgba(250,240,205,.72)"); g.addColorStop(1, "rgba(250,240,205,.5)"); ctx.fillStyle = g; ctx.fillRect(0, 0, L.w, L.h); ctx.globalAlpha = 0.25; ctx.fillStyle = ctx.createPattern(grain(), "repeat"); ctx.fillRect(0, 0, L.w, L.h); ctx.restore(); break; }
      case "stain": { ctx.save(); ctx.globalCompositeOperation = "multiply"; ctx.globalAlpha = L.opacity ?? 0.55; ctx.translate(L.x + L.w / 2, L.y + L.h / 2); ctx.scale(1, L.h / L.w); const g = ctx.createRadialGradient(0, 0, 0, 0, 0, L.w / 2); if (L.ring) { g.addColorStop(0, "rgba(120,70,20,0)"); g.addColorStop(0.56, "rgba(120,70,20,0)"); g.addColorStop(0.6, "rgba(120,70,20,.32)"); g.addColorStop(0.66, "rgba(120,70,20,.12)"); g.addColorStop(0.72, "rgba(120,70,20,0)"); } else { g.addColorStop(0, "rgba(140,90,30,.18)"); g.addColorStop(0.6, "rgba(140,90,30,.05)"); g.addColorStop(0.7, "rgba(140,90,30,0)"); } ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, L.w / 2, 0, Math.PI * 2); ctx.fill(); ctx.restore(); break; }
      case "crease": { ctx.save(); const a = (L.angle || 0) * Math.PI / 180; const at = (L.at ?? 50) / 100; const cx = w / 2, cy = h / 2; const len = Math.hypot(w, h); ctx.translate(cx, cy); ctx.rotate(a); const off = (at - 0.5) * (Math.abs(Math.cos(a)) * h + Math.abs(Math.sin(a)) * w); const s = L.strength ?? 1; const g = ctx.createLinearGradient(0, off - 4, 0, off + 4); g.addColorStop(0, "rgba(255,255,255,0)"); g.addColorStop(0.4, `rgba(255,255,255,${0.32 * s})`); g.addColorStop(0.55, `rgba(10,8,5,${0.14 * s})`); g.addColorStop(1, "rgba(10,8,5,0)"); ctx.fillStyle = g; ctx.fillRect(-len, off - 4, len * 2, 8); ctx.restore(); break; }
      case "fold": { ctx.save(); const g = L.dir === "v" ? ctx.createLinearGradient(L.at - 3, 0, L.at + 3, 0) : ctx.createLinearGradient(0, L.at - 3, 0, L.at + 3); g.addColorStop(0, "rgba(255,255,255,.14)"); g.addColorStop(0.55, "rgba(10,8,5,.22)"); g.addColorStop(1, "rgba(10,8,5,0)"); ctx.fillStyle = g; if (L.dir === "v") ctx.fillRect(L.at - 3, 0, 6, h); else ctx.fillRect(0, L.at - 3, w, 6); ctx.restore(); break; }
      case "postage": { ctx.save(); ctx.translate(L.x, L.y); ctx.rotate((L.rotate || 0) * Math.PI / 180); ctx.fillStyle = "#cfe3d5"; ctx.fillRect(0, 0, 30, 36); ctx.globalCompositeOperation = "destination-out"; for (let i = 0; i <= 5; i++) { for (const [px, py] of [[i * 6, 0], [i * 6, 36]]) { ctx.beginPath(); ctx.arc(px, py, 2.2, 0, Math.PI * 2); ctx.fill(); } } for (let i = 0; i <= 6; i++) { for (const [px, py] of [[0, i * 6], [30, i * 6]]) { ctx.beginPath(); ctx.arc(px, py, 2.2, 0, Math.PI * 2); ctx.fill(); } } ctx.globalCompositeOperation = "source-over"; const g = ctx.createLinearGradient(0, 0, 30, 36); g.addColorStop(0, "#3c8a68"); g.addColorStop(1, "#1f5a43"); ctx.fillStyle = g; ctx.fillRect(3, 3, 24, 30); ctx.restore(); break; }
      case "cd": {
        // A compact disc. The album's art is printed on the ring between the
        // label's inner and outer radii, as a pressed disc is; inside it lies
        // the clear mirror band, where a real disc carries its matrix and
        // catalogue codes stamped small in the polycarbonate — which is where
        // the accession number goes. The spindle hole is real geometry
        // (desk-scene.js, discGeometry), so nothing is drawn for it: the desk
        // shows through. Radii arrive as fractions of the diameter.
        const R = w / 2, rLabel = (L.rLabel ?? 0.4917) * w, rInner = (L.rMirror ?? 0.15) * w, rHole = (L.rHole ?? 0.0625) * w;
        ctx.save(); ctx.translate(R, h / 2);
        // the blank disc — filled past its own edge, so the rim of the geometry
        // never samples a half-transparent texel
        const base = ctx.createRadialGradient(0, 0, rHole, 0, 0, R);
        base.addColorStop(0, "#c6cad1"); base.addColorStop(0.35, "#e6e8ec"); base.addColorStop(0.92, "#d2d6dc"); base.addColorStop(1, "#c0c4cb");
        ctx.fillStyle = base; ctx.fillRect(-R, -h / 2, w, h);
        // the art, on the label ring only
        const im = imgFor.get(L);
        if (im) {
          ctx.save();
          ctx.beginPath(); ctx.arc(0, 0, rLabel, 0, Math.PI * 2); ctx.closePath();
          ctx.moveTo(rInner, 0); ctx.arc(0, 0, rInner, 0, Math.PI * 2, true); ctx.closePath();
          ctx.clip("evenodd");
          const k = Math.max((rLabel * 2) / im.naturalWidth, (rLabel * 2) / im.naturalHeight);
          const dw = im.naturalWidth * k, dh = im.naturalHeight * k;
          ctx.drawImage(im, -dw / 2, -dh / 2, dw, dh);
          ctx.restore();
        }
        // the mirror band, and the stacking ring pressed into it
        const band = ctx.createRadialGradient(0, 0, rHole, 0, 0, rInner);
        band.addColorStop(0, "#b4b8c0"); band.addColorStop(0.55, "#e2e5e9"); band.addColorStop(1, "#c3c7ce");
        ctx.beginPath(); ctx.arc(0, 0, rInner, 0, Math.PI * 2); ctx.closePath();
        ctx.moveTo(rHole, 0); ctx.arc(0, 0, rHole, 0, Math.PI * 2, true); ctx.closePath();
        ctx.fillStyle = band; ctx.fill("evenodd");
        ctx.strokeStyle = "rgba(78,82,90,.30)"; ctx.lineWidth = Math.max(0.4, w * 0.002);
        ctx.beginPath(); ctx.arc(0, 0, rHole + (rInner - rHole) * 0.78, 0, Math.PI * 2); ctx.stroke();
        // the accession number, stamped around the band
        if (L.id) {
          const text = String(L.id), rr = (rHole + rInner) / 2;
          const size = Math.max(2, (rInner - rHole) * 0.38);
          ctx.fillStyle = "rgba(58,62,70,.85)"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
          ctx.font = `${size}px ${FONT.mono}`;
          if ("letterSpacing" in ctx) ctx.letterSpacing = "0px";
          const arc = Math.min(Math.PI * 1.3, (text.length * size * 0.78) / rr);
          for (let i = 0; i < text.length; i++) {
            const a = (i / Math.max(1, text.length - 1) - 0.5) * arc;
            ctx.save(); ctx.rotate(a); ctx.translate(0, -rr); ctx.fillText(text[i], 0, 0); ctx.restore();
          }
        }
        // the outer rim
        ctx.strokeStyle = "rgba(70,74,82,.45)"; ctx.lineWidth = Math.max(0.5, w * 0.0035);
        ctx.beginPath(); ctx.arc(0, 0, R - ctx.lineWidth / 2, 0, Math.PI * 2); ctx.stroke();
        ctx.restore(); break;
      }
      case "pattern": { ctx.save(); ctx.globalAlpha = 0.8; ctx.strokeStyle = "rgba(42,34,24,.5)"; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(w / 2 + 0.5, 0); ctx.lineTo(w / 2 + 0.5, h); ctx.stroke(); ctx.setLineDash([6, 5]); ctx.beginPath(); ctx.moveTo(0, h / 2 + 0.5); ctx.lineTo(w, h / 2 + 0.5); ctx.stroke(); ctx.restore(); break; }
      case "diazoLines": { ctx.save(); ctx.globalAlpha = 0.35; ctx.strokeStyle = INK.diazoLine; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(w / 2 + 0.5, 0); ctx.lineTo(w / 2 + 0.5, h); ctx.moveTo(0, h / 2 + 0.5); ctx.lineTo(w, h / 2 + 0.5); ctx.stroke(); ctx.restore(); break; }
      case "titleBlock": { ctx.save(); ctx.translate(w - L.w - 6, h - L.h - 6); ctx.globalAlpha = 0.9; ctx.strokeStyle = INK.diazoLine; ctx.lineWidth = 1; ctx.strokeRect(0.5, 0.5, L.w, L.h); ctx.fillStyle = INK.diazoLine; ctx.font = `7px ${FONT.mono}`; ctx.textBaseline = "top"; if ("letterSpacing" in ctx) ctx.letterSpacing = "0.5px"; ctx.fillText(String(L.title).toUpperCase(), 4, 4); ctx.font = `6px ${FONT.mono}`; ctx.fillText(String(L.sub).toUpperCase(), 4, 14); ctx.restore(); break; }
      case "wearCorner": { ctx.save(); const g1 = ctx.createRadialGradient(0, 0, 0, 0, 0, w * 0.12); g1.addColorStop(0, "rgba(255,255,255,.25)"); g1.addColorStop(1, "rgba(255,255,255,0)"); ctx.fillStyle = g1; ctx.fillRect(0, 0, w, h); const g2 = ctx.createRadialGradient(w, 0, 0, w, 0, w * 0.09); g2.addColorStop(0, "rgba(10,8,5,.18)"); g2.addColorStop(1, "rgba(10,8,5,0)"); ctx.fillStyle = g2; ctx.fillRect(0, 0, w, h); ctx.restore(); break; }
      // A silver marker, written by hand. The nib is wide, so the letters are
      // stroked as well as filled and the join is round; the ink is metallic,
      // which means it is not one colour but a gradient across the stroke, the
      // way a paint pen catches the light along a letter. Nothing is laid
      // underneath it: the ink sits straight on the disc, as it does.
      case "marker": markerInk(ctx, L, null); break;   // no inkDropout: that erases, and a hole in a solid's face shows its shell
      // A REAL stain, photographed and cut out, multiplied onto the sheet at a
      // true diameter: `d` is the ring's outside diameter in stage px, so a
      // 65 mm saucer ring is `65 * PX_PER_MM` and reads at the size it would
      // actually be. The drawn `stain` case above is still there for the gradient
      // rings on documents that want a suggestion rather than a photograph.
      case "stainImage": {
        const im = imgFor.get(L);
        if (!im) break;
        // `d` is the RING's outside diameter, not the image's width: a scan
        // carries splatter outside the ring, so `ring` says what fraction of
        // the image the ring itself spans and the draw is scaled up by it.
        // That way a 65 mm saucer ring is 65 * PX_PER_MM whatever the crop.
        const ring = L.ring ?? 1, dw = (L.d || L.w || 60) / ring;
        const ar = (im.naturalHeight || im.height) / (im.naturalWidth || im.width);
        ctx.save();
        ctx.globalCompositeOperation = "multiply";
        ctx.globalAlpha = L.opacity ?? 0.85;
        ctx.translate(L.x, L.y); if (L.rotate) ctx.rotate(L.rotate * Math.PI / 180);
        ctx.drawImage(im, -dw / 2, -dw * ar / 2, dw, dw * ar);
        ctx.restore();
        break;
      }
      // A sheet that has been screwed up and flattened out again. One `crease`
      // is a fold; this is the whole network of them — each crease drawn twice,
      // a highlight on the side that faces the lamp and a shadow on the side
      // that turns away, which is the only thing that reads as a ridge on flat
      // paper — over a field of soft domes for the bulges between them.
      case "crumple": {
        const r = rng(seed + 77), n = L.count ?? 18, st = L.strength ?? 1, step = Math.max(w, h) / 13;
        ctx.save(); ctx.lineCap = "round"; ctx.lineJoin = "round";
        for (let i = 0; i < n; i++) {
          const edge = Math.floor(r() * 4);
          let x = edge === 1 ? w + 2 : edge === 3 ? -2 : r() * w;
          let y = edge === 0 ? -2 : edge === 2 ? h + 2 : r() * h;
          let a = edge === 0 ? Math.PI / 2 : edge === 1 ? Math.PI : edge === 2 ? -Math.PI / 2 : 0;
          a += (r() - 0.5) * 1.5;
          const pts = [[x, y]];
          for (let k = 0; k < 20; k++) {
            a += (r() - 0.5) * 0.55; x += Math.cos(a) * step; y += Math.sin(a) * step;
            pts.push([x, y]);
            if (x < -24 || y < -24 || x > w + 24 || y > h + 24) break;
          }
          const press = 0.5 + r() * 0.7, off = 0.4 + r() * 0.35;
          // softened: a crease in paper is a gradient, not a drawn line, and at
          // full hardness the network reads as pen strokes across the sheet
          ctx.filter = `blur(${L.soften ?? 0.9}px)`;
          const run = (dx, dy, style, lw) => { ctx.strokeStyle = style; ctx.lineWidth = lw; ctx.beginPath(); pts.forEach(([px, py], k) => (k ? ctx.lineTo(px + dx, py + dy) : ctx.moveTo(px + dx, py + dy))); ctx.stroke(); };
          run(-off, -off, `rgba(255,255,255,${0.17 * st * press})`, 0.8);
          run(off, off, `rgba(22,16,9,${0.085 * st * press})`, 0.8);
          ctx.filter = "none";
        }
        for (let i = 0; i < (L.patches ?? 30); i++) {
          const px = r() * w, py = r() * h, rad = 7 + r() * 24, dark = r() < 0.5;
          const g = ctx.createRadialGradient(px, py, 0, px, py, rad);
          g.addColorStop(0, dark ? `rgba(22,16,9,${0.07 * st})` : `rgba(255,255,255,${0.14 * st})`);
          g.addColorStop(1, "rgba(0,0,0,0)");
          ctx.fillStyle = g; ctx.fillRect(px - rad, py - rad, rad * 2, rad * 2);
        }
        ctx.restore();
        break;
      }
      case "rect": { ctx.save(); ctx.globalAlpha = L.opacity ?? 1; ctx.fillStyle = L.color; ctx.fillRect(L.x, L.y, L.w, L.h); ctx.restore(); break; }
      default: break;
    }
  }
  // texture over the sheet: the fine grain, a coarser mottle of fibre and
  // foxing, and the faint darkening a sheet has toward its edges
  const dim = spec.stock === "diazo" || spec.stock === "dark" || spec.gloss; // a glossy print takes almost no grain
  if (spec.bare) { ctx.restore(); return { canvas: c, w, h, outline }; }   // moulded, not made of paper: no grain, no foxing, no vignette
  ctx.save(); ctx.globalCompositeOperation = "multiply";
  ctx.globalAlpha = dim ? 0.12 : 0.28; ctx.fillStyle = ctx.createPattern(grain(), "repeat"); ctx.fillRect(0, 0, w, h);
  ctx.globalAlpha = dim ? 0.05 : 0.12; ctx.save(); ctx.scale(3.7, 3.1); ctx.fillStyle = ctx.createPattern(grain(), "repeat"); ctx.fillRect(0, 0, w / 3.7, h / 3.1); ctx.restore();
  const vg = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.45, w / 2, h / 2, Math.max(w, h) * 0.8);
  vg.addColorStop(0, "rgba(255,255,255,1)"); vg.addColorStop(1, dim ? "rgba(228,228,228,1)" : "rgba(238,232,220,1)");
  ctx.globalAlpha = 1; ctx.fillStyle = vg; ctx.fillRect(0, 0, w, h);
  ctx.restore();
  if (spec.cutout) { // keep only the cutout's own silhouette: the texture must not paint the sheet back in
    ctx.save(); ctx.globalCompositeOperation = "destination-in";
    for (const L of spec.layers || []) { const im = L.src && imgFor.get(L); if (!im) continue; ctx.save(); ctx.translate(L.x, L.y); if (L.rotate) ctx.rotate(L.rotate * Math.PI / 180); ctx.drawImage(im, 0, 0, L.w, L.h); ctx.restore(); }
    ctx.restore();
  }
  ctx.restore();
  return { canvas: c, w, h, outline };
}

// A fibrous paper normal map, shared by every sheet: fine tooth plus a few
// soft undulations, so a raking light finds the surface.
let paperNormalCanvas = null;
export function paperNormal() {
  if (paperNormalCanvas) return paperNormalCanvas;
  const N = 512; const c = document.createElement("canvas"); c.width = c.height = N;
  const g = c.getContext("2d"); const img = g.createImageData(N, N); const r = rng(21);
  // height field: noise + undulation
  const hgt = new Float32Array(N * N);
  for (let i = 0; i < N * N; i++) hgt[i] = r() * 0.6;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) hgt[y * N + x] += 0.5 * Math.sin(x * 0.045 + Math.sin(y * 0.02) * 2) * Math.cos(y * 0.037);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const l = hgt[y * N + ((x - 1 + N) % N)], rr = hgt[y * N + ((x + 1) % N)], u = hgt[((y - 1 + N) % N) * N + x], d = hgt[((y + 1) % N) * N + x];
    const nx = (l - rr) * 0.9, ny = (u - d) * 0.9;
    const i = (y * N + x) * 4; img.data[i] = 128 + nx * 60; img.data[i + 1] = 128 + ny * 60; img.data[i + 2] = 255; img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0); paperNormalCanvas = c; return c;
}
