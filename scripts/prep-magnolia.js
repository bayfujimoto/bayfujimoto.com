#!/usr/bin/env node
// scripts/prep-magnolia.js
// Turns a scan/photo of a line drawing into an ink-only RGBA WebP:
// paper -> alpha 0, graphite -> opaque, pressure preserved as partial alpha.
//
//   node scripts/prep-magnolia.js <in.jpg> <out.webp> [--ink 2a2826] [--height 1000]
//                                 [--black 90] [--white 200] [--gamma 0.6] [--pad 0.04]
//                                 [--erase x,y,w,h ...]
//
// The output lives in public/desk/ (gitignore negation, served at /desk/...).

const sharp = require("sharp");
const path = require("path");

const args = process.argv.slice(2);
const inFile = args[0];
const outFile = args[1];
if (!inFile || !outFile) {
  console.error("usage: prep-magnolia.js <in> <out.webp> [--ink hex] [--height px] [--black n] [--white n] [--gamma g] [--pad f]");
  process.exit(1);
}
const opt = (k, d) => {
  const i = args.indexOf(`--${k}`);
  return i >= 0 ? args[i + 1] : d;
};
const INK = opt("ink", "2a2826");
const HEIGHT = +opt("height", 1000);
const BLACK = +opt("black", 90);    // luminance at/below this = fully opaque ink
const WHITE = +opt("white", 200);   // luminance at/above this = paper (alpha 0)
const GAMMA = +opt("gamma", 0.6);   // <1 presses harder: the source is a light hand, and a 1-px line at desk scale needs weight (first cut at 1.35 vanished under the lamp)
const PAD = +opt("pad", 0.04);      // margin around the ink's bounding box, as a fraction
// --erase x,y,w,h (source px, repeatable): regions to blank before cropping —
// used to drop the signature block; a tracing carries no signature.
const ERASE = [];
for (let i = 0; i < args.length; i++) if (args[i] === "--erase") ERASE.push(args[i + 1].split(",").map(Number));

const ink = [0, 2, 4].map((i) => parseInt(INK.slice(i, i + 2), 16));

(async () => {
  // 1. Flatten to a denoised, level-corrected luminance channel.
  const { data, info } = await sharp(inFile)
    .rotate() // honour EXIF (see r2-derivative-orientation notes)
    .grayscale()
    .blur(0.6)
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width: W, height: H } = info;

  // 2. Luminance -> alpha. Soft ramp between BLACK and WHITE, gamma-shaped.
  const alpha = Buffer.alloc(W * H);
  let minX = W, minY = H, maxX = -1, maxY = -1;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const l = data[y * W + x];
      let a = 0;
      if (ERASE.some(([ex, ey, ew, eh]) => x >= ex && x < ex + ew && y >= ey && y < ey + eh)) { alpha[y * W + x] = 0; continue; }
      if (l <= BLACK) a = 1;
      else if (l < WHITE) a = Math.pow((WHITE - l) / (WHITE - BLACK), GAMMA);
      const v = Math.round(a * 255);
      alpha[y * W + x] = v;
      if (v > 24) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) throw new Error("no ink found — loosen --white / --black");

  // 3. Crop to the ink plus a margin.
  const bw = maxX - minX + 1, bh = maxY - minY + 1;
  const px = Math.round(bw * PAD), py = Math.round(bh * PAD);
  const left = Math.max(0, minX - px), top = Math.max(0, minY - py);
  const cw = Math.min(W - left, bw + 2 * px), ch = Math.min(H - top, bh + 2 * py);

  // 4. Compose RGBA: constant ink colour, computed alpha.
  const rgba = Buffer.alloc(W * H * 4);
  for (let i = 0; i < W * H; i++) {
    rgba[i * 4] = ink[0];
    rgba[i * 4 + 1] = ink[1];
    rgba[i * 4 + 2] = ink[2];
    rgba[i * 4 + 3] = alpha[i];
  }
  const out = await sharp(rgba, { raw: { width: W, height: H, channels: 4 } })
    .extract({ left, top, width: cw, height: ch })
    .resize({ height: HEIGHT, withoutEnlargement: true, kernel: "lanczos3" })
    .webp({ quality: 88, alphaQuality: 90, effort: 6 })
    .toFile(outFile);

  const coverage = alpha.reduce((s, v) => s + (v > 24 ? 1 : 0), 0) / (W * H);
  console.log(
    `${path.basename(outFile)}: ${out.width}×${out.height}, ${(out.size / 1024).toFixed(1)} KB, ` +
    `ink bbox ${bw}×${bh} @ (${minX},${minY}), ink coverage ${(coverage * 100).toFixed(2)}%`
  );
})().catch((e) => { console.error(e); process.exit(1); });
