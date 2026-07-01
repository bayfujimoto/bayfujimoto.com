// Self-test for the shared cut-out algorithm (src/shared/cutout.js).
//
// No sharp, no scanner, no runner: it builds tiny synthetic RGBA scans by hand
// and asserts the returned `keep` mask. Run manually:
//   node scripts/cutout-selftest.js   (or: npm test)
//
// The load-bearing case is "grey-bordered document on red": a document whose own
// border is the *same* grey as the bare scanner edge must keep that border, while
// the outer scanner grey and the red backing are still removed. See the algorithm
// notes in src/shared/cutout.js and docs/carrier-sheet-cutout-plan.md.

import assert from "node:assert/strict";
import { cutout } from "../src/shared/cutout.js";

const GREY = [128, 128, 128];   // scanner bed / document border grey (identical)
const RED = [200, 30, 30];      // saturated matte backing
const ORANGE = [230, 120, 20];  // a chromatic document
const LIGHT = [240, 240, 240];  // near-white document content

// Paint concentric square bands into a W×H RGBA buffer. `bands` is an array of
// { inset, rgb } with ascending inset (outermost first); a pixel takes the colour
// of the *innermost* band it qualifies for — the deepest band whose inset is <=
// the pixel's distance from the nearest edge.
function makeScan(W, H, bands) {
  const rgba = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const d = Math.min(x, y, W - 1 - x, H - 1 - y);
      let rgb = bands[0].rgb;
      for (const b of bands) { if (d >= b.inset) rgb = b.rgb; }
      const q = (y * W + x) * 4;
      rgba[q] = rgb[0]; rgba[q + 1] = rgb[1]; rgba[q + 2] = rgb[2]; rgba[q + 3] = 255;
    }
  }
  return rgba;
}

// keep-mask lookup at an original-image (x, y), honouring the crop bbox+margin.
function keptAt(res, x, y, W) {
  const { minX, minY, maxX, maxY } = res.bbox;
  if (x < minX || x > maxX || y < minY || y > maxY) return 0;
  return res.keep[y * W + x];
}

let failures = 0;
function test(name, fn) {
  try { fn(); console.log(`  ok  ${name}`); }
  catch (e) { failures++; console.log(`FAIL  ${name}\n      ${e.message}`); }
}

const W = 100, H = 100;

// 1) Regression: grey-bordered document on red. Bands (outermost first):
//    thin grey scanner bed (0–4, within the 6px sampling ring so both grey and
//    red enter the palette) → red backing (4–20) → document grey border (20–28)
//    → light content (28+). The inner grey border must SURVIVE.
test("grey-bordered document on red keeps its own grey border", () => {
  const scan = makeScan(W, H, [
    { inset: 0, rgb: GREY },
    { inset: 4, rgb: RED },
    { inset: 20, rgb: GREY },
    { inset: 28, rgb: LIGHT },
  ]);
  const res = cutout(scan, W, H, { margin: 0, defringe: 0 });
  assert.ok(res, "expected a foreground island");
  assert.equal(keptAt(res, 2, 50, W), 0, "outer grey bed should be removed");
  assert.equal(keptAt(res, 12, 50, W), 0, "red backing should be removed");
  assert.equal(keptAt(res, 24, 50, W), 1, "document's own grey border should survive");
  assert.equal(keptAt(res, 50, 50, W), 1, "document content should survive");
});

// 2) No regression: orange coupon on red, with an outer grey bed. Outer grey and
//    red are removed; the whole orange document is kept (the validated case).
test("orange document on red: grey+red removed, orange kept", () => {
  const scan = makeScan(W, H, [
    { inset: 0, rgb: GREY },
    { inset: 4, rgb: RED },
    { inset: 20, rgb: ORANGE },
  ]);
  const res = cutout(scan, W, H, { margin: 0, defringe: 0 });
  assert.ok(res, "expected a foreground island");
  assert.equal(keptAt(res, 2, 50, W), 0, "outer grey bed should be removed");
  assert.equal(keptAt(res, 12, 50, W), 0, "red backing should be removed");
  assert.equal(keptAt(res, 24, 50, W), 1, "orange edge should survive");
  assert.equal(keptAt(res, 50, 50, W), 1, "orange content should survive");
});

// 3) Plain grey backing (no chromatic band): the guard must never engage, so a
//    grey backing around a chromatic document is still fully removed.
test("plain grey backing around an orange document is fully removed", () => {
  const scan = makeScan(W, H, [
    { inset: 0, rgb: GREY },
    { inset: 20, rgb: ORANGE },
  ]);
  const res = cutout(scan, W, H, { margin: 0, defringe: 0 });
  assert.ok(res, "expected a foreground island");
  assert.equal(keptAt(res, 5, 50, W), 0, "grey backing should be removed");
  assert.equal(keptAt(res, 50, 50, W), 1, "orange content should survive");
});

console.log(failures ? `\n${failures} test(s) failed.` : "\nAll cut-out self-tests passed.");
process.exit(failures ? 1 : 0);
