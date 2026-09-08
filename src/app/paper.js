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

const STOCK = { cream: "#ece4d1", white: "#f3efe6", thermal: "#f7f3ea", diazo: "#33507c", dark: "#1c1a17", manila: "#d3bb85", blue: "#c9d5e6" };
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
  const pr = new Promise((res) => { const im = new Image(); im.crossOrigin = "anonymous"; im.onload = () => res(im); im.onerror = () => res(null); im.src = url; });
  imageCache.set(src, pr); return pr;
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
  const imgs = await Promise.all((spec.layers || []).filter((L) => L.src).map((L) => loadImage(L.src)));
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
  // stock — a cutout scan brings its own shape, so it gets no sheet behind it
  if (!spec.cutout) { ctx.fillStyle = STOCK[spec.stock || "cream"]; ctx.fillRect(-4, -4, w + 8, h + 8); }
  if (!spec.cutout && spec.stock !== "dark" && spec.stock !== "diazo") {
    const g = ctx.createLinearGradient(0, 0, w, h); g.addColorStop(0, "rgba(255,255,255,.35)"); g.addColorStop(0.45, "rgba(255,255,255,0)"); g.addColorStop(1, "rgba(10,8,5,.06)");
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  }

  for (const L of spec.layers || []) {
    switch (L.t) {
      case "rules": { ctx.save(); ctx.globalAlpha = L.opacity ?? 0.55; ctx.strokeStyle = INK.faint; ctx.lineWidth = 1; const gap = L.dense ? 6 : 10; for (let y = (L.top || 0) + gap; y < h; y += gap) { ctx.beginPath(); ctx.moveTo(0, y + 0.5); ctx.lineTo(w, y + 0.5); ctx.stroke(); } ctx.restore(); break; }
      case "grid": { ctx.save(); ctx.globalAlpha = 0.5; ctx.strokeStyle = INK.faint; ctx.lineWidth = 1; for (let y = (L.top || 0); y < h; y += 16) { ctx.beginPath(); ctx.moveTo(0, y + 0.5); ctx.lineTo(w, y + 0.5); ctx.stroke(); } for (let x = 0; x < w; x += 32) { ctx.beginPath(); ctx.moveTo(x + 0.5, L.top || 0); ctx.lineTo(x + 0.5, h); ctx.stroke(); } ctx.restore(); break; }
      case "text": drawText(ctx, L); break;
      case "image": { const im = imgFor.get(L); if (!im) break; ctx.save(); ctx.translate(L.x, L.y); if (L.rotate) ctx.rotate(L.rotate * Math.PI / 180); ctx.drawImage(im, 0, 0, L.w, L.h); ctx.restore(); break; }
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
      case "stampBox": { ctx.save(); ctx.translate(L.x, L.y); ctx.rotate((L.rotate || -8) * Math.PI / 180); ctx.globalAlpha = 0.7; ctx.strokeStyle = INK.red; ctx.fillStyle = INK.red; ctx.lineWidth = 2; ctx.font = `9px ${FONT.mono}`; if ("letterSpacing" in ctx) ctx.letterSpacing = "2px"; const tw = ctx.measureText(L.text).width + 14; ctx.strokeRect(0, 0, tw, 16); ctx.textBaseline = "middle"; ctx.fillText(L.text, 7, 8); ctx.restore(); inkDropout(ctx, L.x - 4, L.y - 4, 70, 26, seed + 4, 0.35); break; }
      case "seal": { ctx.save(); ctx.translate(L.x, L.y); ctx.rotate((L.rotate || 0) * Math.PI / 180); ctx.globalAlpha = 0.85; ctx.strokeStyle = INK.red; ctx.fillStyle = INK.red; ctx.lineWidth = 2; ctx.strokeRect(1, 1, 24, 24); ctx.fillRect(6, 6, 6, 12); ctx.fillRect(15, 9, 7, 9); ctx.restore(); inkDropout(ctx, L.x, L.y, 26, 26, seed + 5, 0.4); break; }
      case "tape": { ctx.save(); ctx.translate(L.x, L.y); ctx.rotate((L.rotate || 0) * Math.PI / 180); const g = ctx.createLinearGradient(0, 0, L.w, 0); g.addColorStop(0, "rgba(250,240,205,.55)"); g.addColorStop(0.35, "rgba(250,240,205,.72)"); g.addColorStop(1, "rgba(250,240,205,.5)"); ctx.fillStyle = g; ctx.fillRect(0, 0, L.w, L.h); ctx.globalAlpha = 0.25; ctx.fillStyle = ctx.createPattern(grain(), "repeat"); ctx.fillRect(0, 0, L.w, L.h); ctx.restore(); break; }
      case "stain": { ctx.save(); ctx.globalCompositeOperation = "multiply"; ctx.globalAlpha = L.opacity ?? 0.55; ctx.translate(L.x + L.w / 2, L.y + L.h / 2); ctx.scale(1, L.h / L.w); const g = ctx.createRadialGradient(0, 0, 0, 0, 0, L.w / 2); if (L.ring) { g.addColorStop(0, "rgba(120,70,20,0)"); g.addColorStop(0.56, "rgba(120,70,20,0)"); g.addColorStop(0.6, "rgba(120,70,20,.32)"); g.addColorStop(0.66, "rgba(120,70,20,.12)"); g.addColorStop(0.72, "rgba(120,70,20,0)"); } else { g.addColorStop(0, "rgba(140,90,30,.18)"); g.addColorStop(0.6, "rgba(140,90,30,.05)"); g.addColorStop(0.7, "rgba(140,90,30,0)"); } ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, L.w / 2, 0, Math.PI * 2); ctx.fill(); ctx.restore(); break; }
      case "crease": { ctx.save(); const a = (L.angle || 0) * Math.PI / 180; const at = (L.at ?? 50) / 100; const cx = w / 2, cy = h / 2; const len = Math.hypot(w, h); ctx.translate(cx, cy); ctx.rotate(a); const off = (at - 0.5) * (Math.abs(Math.cos(a)) * h + Math.abs(Math.sin(a)) * w); const s = L.strength ?? 1; const g = ctx.createLinearGradient(0, off - 4, 0, off + 4); g.addColorStop(0, "rgba(255,255,255,0)"); g.addColorStop(0.4, `rgba(255,255,255,${0.32 * s})`); g.addColorStop(0.55, `rgba(10,8,5,${0.14 * s})`); g.addColorStop(1, "rgba(10,8,5,0)"); ctx.fillStyle = g; ctx.fillRect(-len, off - 4, len * 2, 8); ctx.restore(); break; }
      case "fold": { ctx.save(); const g = L.dir === "v" ? ctx.createLinearGradient(L.at - 3, 0, L.at + 3, 0) : ctx.createLinearGradient(0, L.at - 3, 0, L.at + 3); g.addColorStop(0, "rgba(255,255,255,.14)"); g.addColorStop(0.55, "rgba(10,8,5,.22)"); g.addColorStop(1, "rgba(10,8,5,0)"); ctx.fillStyle = g; if (L.dir === "v") ctx.fillRect(L.at - 3, 0, 6, h); else ctx.fillRect(0, L.at - 3, w, 6); ctx.restore(); break; }
      case "postage": { ctx.save(); ctx.translate(L.x, L.y); ctx.rotate((L.rotate || 0) * Math.PI / 180); ctx.fillStyle = "#cfe3d5"; ctx.fillRect(0, 0, 30, 36); ctx.globalCompositeOperation = "destination-out"; for (let i = 0; i <= 5; i++) { for (const [px, py] of [[i * 6, 0], [i * 6, 36]]) { ctx.beginPath(); ctx.arc(px, py, 2.2, 0, Math.PI * 2); ctx.fill(); } } for (let i = 0; i <= 6; i++) { for (const [px, py] of [[0, i * 6], [30, i * 6]]) { ctx.beginPath(); ctx.arc(px, py, 2.2, 0, Math.PI * 2); ctx.fill(); } } ctx.globalCompositeOperation = "source-over"; const g = ctx.createLinearGradient(0, 0, 30, 36); g.addColorStop(0, "#3c8a68"); g.addColorStop(1, "#1f5a43"); ctx.fillStyle = g; ctx.fillRect(3, 3, 24, 30); ctx.restore(); break; }
      case "disc": { ctx.save(); ctx.translate(L.x, L.y); ctx.globalAlpha = 0.9; ctx.fillStyle = "#1c1a17"; ctx.beginPath(); ctx.arc(18, 18, 18, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = INK.red; ctx.beginPath(); ctx.arc(18, 18, 12, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = STOCK.cream; ctx.beginPath(); ctx.arc(18, 18, 5, 0, Math.PI * 2); ctx.fill(); ctx.restore(); break; }
      case "pattern": { ctx.save(); ctx.globalAlpha = 0.8; ctx.strokeStyle = "rgba(42,34,24,.5)"; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(w / 2 + 0.5, 0); ctx.lineTo(w / 2 + 0.5, h); ctx.stroke(); ctx.setLineDash([6, 5]); ctx.beginPath(); ctx.moveTo(0, h / 2 + 0.5); ctx.lineTo(w, h / 2 + 0.5); ctx.stroke(); ctx.restore(); break; }
      case "strip": { ctx.save(); ctx.fillStyle = "#3a3128"; for (let y = 0; y < h; y += 27) ctx.fillRect(10, y, w - 20, 24); ctx.fillStyle = "rgba(255,255,255,.75)"; for (let y = 6; y < h; y += 14) { ctx.fillRect(3, y, 4, 3); ctx.fillRect(w - 7, y, 4, 3); } ctx.restore(); break; }
      case "diazoLines": { ctx.save(); ctx.globalAlpha = 0.35; ctx.strokeStyle = INK.diazoLine; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(w / 2 + 0.5, 0); ctx.lineTo(w / 2 + 0.5, h); ctx.moveTo(0, h / 2 + 0.5); ctx.lineTo(w, h / 2 + 0.5); ctx.stroke(); ctx.restore(); break; }
      case "titleBlock": { ctx.save(); ctx.translate(w - L.w - 6, h - L.h - 6); ctx.globalAlpha = 0.9; ctx.strokeStyle = INK.diazoLine; ctx.lineWidth = 1; ctx.strokeRect(0.5, 0.5, L.w, L.h); ctx.fillStyle = INK.diazoLine; ctx.font = `7px ${FONT.mono}`; ctx.textBaseline = "top"; if ("letterSpacing" in ctx) ctx.letterSpacing = "0.5px"; ctx.fillText(String(L.title).toUpperCase(), 4, 4); ctx.font = `6px ${FONT.mono}`; ctx.fillText(String(L.sub).toUpperCase(), 4, 14); ctx.restore(); break; }
      case "wearCorner": { ctx.save(); const g1 = ctx.createRadialGradient(0, 0, 0, 0, 0, w * 0.12); g1.addColorStop(0, "rgba(255,255,255,.25)"); g1.addColorStop(1, "rgba(255,255,255,0)"); ctx.fillStyle = g1; ctx.fillRect(0, 0, w, h); const g2 = ctx.createRadialGradient(w, 0, 0, w, 0, w * 0.09); g2.addColorStop(0, "rgba(10,8,5,.18)"); g2.addColorStop(1, "rgba(10,8,5,0)"); ctx.fillStyle = g2; ctx.fillRect(0, 0, w, h); ctx.restore(); break; }
      case "rect": { ctx.save(); ctx.globalAlpha = L.opacity ?? 1; ctx.fillStyle = L.color; ctx.fillRect(L.x, L.y, L.w, L.h); ctx.restore(); break; }
      default: break;
    }
  }
  // texture over the sheet: the fine grain, a coarser mottle of fibre and
  // foxing, and the faint darkening a sheet has toward its edges
  const dim = spec.stock === "diazo" || spec.stock === "dark" || spec.gloss; // a glossy print takes almost no grain
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
