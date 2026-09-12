// Check the game box templates for slivers — places where the printed case
// fails to cover art it should cover.
//
// Inside a template's art window the PNG is transparent wherever the cover art
// is meant to show, so the shape of that transparent region IS the design. A
// sliver is that region reaching somewhere it shouldn't as a narrow finger: on
// both Switch templates the red block at the top stopped a few pixels short of
// the hinge edge, and a strip of art appeared beside it (fixed 2026-09-11).
// Narrowness is the whole signature, so a morphological opening finds them —
// anything the opening erases was thinner than the brush. Islands printed over
// the art, like the Wii U's Nintendo badge, are wide enough to survive, though
// the thin ring of art around one can be reported; look before you patch.
//
// Usage: node scripts/check-game-boxes.js [template-id …]
// Exits non-zero when anything is reported, so it can gate a template swap.

import path from "path";
import { fileURLToPath } from "url";
import sharp from "sharp";
import { TEMPLATES } from "../src/shared/game-box.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TPL_DIR = path.join(ROOT, "public", "game-boxes");

const BRUSH = 9;        // half-width in px — features thinner than ~19 px vanish
const MIN_AREA = 250;   // ignore corner tapers and antialiasing crumbs

// Sum over an integral image, window clamped to the bitmap.
function makeIntegral(src, W, H) {
  const I = new Int32Array((W + 1) * (H + 1));
  for (let y = 0; y < H; y++) {
    let row = 0;
    for (let x = 0; x < W; x++) {
      row += src[y * W + x];
      I[(y + 1) * (W + 1) + (x + 1)] = I[y * (W + 1) + (x + 1)] + row;
    }
  }
  return I;
}
const windowSum = (I, W, x0, y0, x1, y1) =>
  I[y1 * (W + 1) + x1] - I[y0 * (W + 1) + x1] - I[y1 * (W + 1) + x0] + I[y0 * (W + 1) + x0];

// opening = erode then dilate, both by a (2*BRUSH+1)² square. Out-of-bounds is
// background for the erosion and the dilation puts the border back, so a region
// that legitimately runs to the edge of the bitmap survives intact.
function open(mask, W, H) {
  const K = 2 * BRUSH + 1, full = K * K;
  const I = makeIntegral(mask, W, H);
  const eroded = new Uint8Array(W * H);
  for (let y = BRUSH; y < H - BRUSH; y++) {
    for (let x = BRUSH; x < W - BRUSH; x++) {
      if (windowSum(I, W, x - BRUSH, y - BRUSH, x + BRUSH + 1, y + BRUSH + 1) === full) {
        eroded[y * W + x] = 1;
      }
    }
  }
  const J = makeIntegral(eroded, W, H);
  const out = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) {
    const y0 = Math.max(0, y - BRUSH), y1 = Math.min(H, y + BRUSH + 1);
    for (let x = 0; x < W; x++) {
      const x0 = Math.max(0, x - BRUSH), x1 = Math.min(W, x + BRUSH + 1);
      if (windowSum(J, W, x0, y0, x1, y1) > 0) out[y * W + x] = 1;
    }
  }
  return out;
}

function components(mask, W, H) {
  const seen = new Uint8Array(W * H), found = [];
  const stack = [];
  for (let p = 0; p < mask.length; p++) {
    if (!mask[p] || seen[p]) continue;
    stack.push(p); seen[p] = 1;
    let area = 0, x0 = W, x1 = 0, y0 = H, y1 = 0;
    while (stack.length) {
      const q = stack.pop(), qx = q % W, qy = (q - qx) / W;
      area++;
      if (qx < x0) x0 = qx; if (qx > x1) x1 = qx;
      if (qy < y0) y0 = qy; if (qy > y1) y1 = qy;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = qx + dx, ny = qy + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const n = ny * W + nx;
        if (mask[n] && !seen[n]) { seen[n] = 1; stack.push(n); }
      }
    }
    if (area >= MIN_AREA) found.push({ area, x0, x1, y0, y1 });
  }
  return found.sort((a, b) => b.area - a.area);
}

const wanted = process.argv.slice(2).filter(a => !a.startsWith("--"));
const ids = wanted.length ? wanted : Object.keys(TEMPLATES);
let reported = 0;

for (const id of ids) {
  const tpl = TEMPLATES[id];
  if (!tpl) { console.log(`· ${id}: no such template`); continue; }
  const file = path.join(TPL_DIR, `${id}.png`);
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const W = info.width, H = info.height;
  if (W !== tpl.size[0] || H !== tpl.size[1]) {
    console.log(`! ${id}: PNG is ${W}×${H} but TEMPLATES says ${tpl.size[0]}×${tpl.size[1]} — geometry will be wrong`);
    reported++;
  }
  const [wx0, wy0, wx1, wy1] = tpl.art_window;
  const mask = new Uint8Array(W * H);
  for (let y = wy0; y < wy1; y++) {
    for (let x = wx0; x < wx1; x++) {
      if (data[(y * W + x) * info.channels + 3] < 128) mask[y * W + x] = 1;
    }
  }
  const residual = open(mask, W, H);
  for (let p = 0; p < mask.length; p++) residual[p] = mask[p] && !residual[p] ? 1 : 0;
  const found = components(residual, W, H);
  if (!found.length) {
    console.log(`· ${id}: clean`);
  } else {
    for (const f of found) {
      console.log(`! ${id}: sliver ${f.area} px at x[${f.x0}..${f.x1}] y[${f.y0}..${f.y1}]`);
      reported++;
    }
  }
}

if (reported) {
  console.log(`\n${reported} to look at. Composite the template over a bright colour and zoom in before patching —`);
  console.log("art printed around a badge (the Wii U's Nintendo mark) reads the same way and is correct.");
}
process.exit(reported ? 1 : 0);
