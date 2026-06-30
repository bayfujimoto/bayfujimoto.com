// Cut-out program for the red-backing scanning workflow (batch / CLI).
//
// Thin wrapper around the shared algorithm in src/shared/cutout.js: it adds file
// I/O (via sharp) and debug previews. The same algorithm runs in the admin at
// upload time, so CLI and browser results are identical. See the algorithm notes
// in src/shared/cutout.js and docs/carrier-sheet-cutout-plan.md.
//
// Output: a transparent PNG cropped to the document. The raw scan is never
// modified — it remains the preservation master; the cut-out is a derivative.
//
// Usage:
//   node scripts/cutout-red-background.js <file-or-dir> [options]
// Options:
//   --out <dir>          output directory (default: <input>/cutouts)
//   --tolerance <n>      LAB distance a pixel may sit from the nearest background
//                        colour and still count as background (default 20)
//   --defringe <n>       erode the kept edge N px to drop the antialiased halo (default 0)
//   --margin <px>        transparent padding around the crop (default 8)
//   --debug              also write <name>-mask.png and <name>-check.png
//
// Requires the `sharp` dependency (already in package.json).

import { readdirSync, statSync, mkdirSync, existsSync } from "fs";
import { basename, extname, join, resolve } from "path";
import sharp from "sharp";
import { cutout } from "../src/shared/cutout.js";

// ---- args ----------------------------------------------------------------
const argv = process.argv.slice(2);
const positional = argv.filter(a => !a.startsWith("--"));
const flag = (name, def) => {
  const i = argv.indexOf(`--${name}`);
  if (i === -1) return def;
  const next = argv[i + 1];
  return (next && !next.startsWith("--")) ? next : true;
};
const INPUT = positional[0];
if (!INPUT) { console.error("Usage: node scripts/cutout-red-background.js <file-or-dir> [--out dir] [--tolerance n] [--defringe n] [--margin px] [--debug]"); process.exit(1); }
const TOL = Number(flag("tolerance", 20));
const DEFRINGE = Number(flag("defringe", 0));
const MARGIN = Number(flag("margin", 8));
const DEBUG = flag("debug", false) === true;

async function process_(file, outDir) {
  const name = basename(file, extname(file));
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const W = info.width, H = info.height;

  const res = cutout(data, W, H, { tolerance: TOL, defringe: DEFRINGE, margin: MARGIN });
  if (!res) { console.log(`${name}: no foreground found (whole frame read as background) — skipped`); return; }

  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
  const outPath = join(outDir, `${name}-cutout.png`);
  await sharp(Buffer.from(res.rgba.buffer), { raw: { width: res.width, height: res.height, channels: 4 } }).png().toFile(outPath);

  console.log(`${name}: ${W}×${H} → ${res.width}×${res.height}  | bg palette ${res.paletteSize}  | document ${(res.frac * 100).toFixed(1)}% of frame  → ${basename(outPath)}`);

  if (DEBUG) {
    const N = W * H;
    const mask = Buffer.alloc(N);
    for (let p = 0; p < N; p++) mask[p] = res.keep[p] ? 255 : 0;
    await sharp(mask, { raw: { width: W, height: H, channels: 1 } }).png().toFile(join(outDir, `${name}-mask.png`));
    const chk = Buffer.alloc(N * 3);
    for (let p = 0; p < N; p++) {
      const x = p % W, y = (p - x) / W;
      const sq = p * 4, dq = p * 3;
      if (res.keep[p]) { chk[dq] = data[sq]; chk[dq+1] = data[sq+1]; chk[dq+2] = data[sq+2]; }
      else { const c = (((x >> 4) + (y >> 4)) & 1) ? 210 : 245; chk[dq] = chk[dq+1] = chk[dq+2] = c; }
    }
    await sharp(chk, { raw: { width: W, height: H, channels: 3 } }).png().toFile(join(outDir, `${name}-check.png`));
  }
}

// ---- batch ----------------------------------------------------------------
const inAbs = resolve(INPUT);
const isDir = statSync(inAbs).isDirectory();
const files = isDir
  ? readdirSync(inAbs).filter(f => /\.(png|jpe?g|tiff?|webp)$/i.test(f)).map(f => join(inAbs, f))
  : [inAbs];
const outDir = resolve(flag("out", isDir ? join(inAbs, "cutouts") : join(resolve(inAbs, ".."), "cutouts")));

console.log(`Cut-out: ${files.length} file(s) | tolerance ${TOL} LAB | defringe ${DEFRINGE} | margin ${MARGIN}px${DEBUG ? " | debug" : ""}\n`);
for (const f of files) {
  try { await process_(f, outDir); }
  catch (e) { console.log(`${basename(f)}: FAILED — ${e.message}`); }
}
console.log(`\nDone. Cut-outs in ${outDir}`);
