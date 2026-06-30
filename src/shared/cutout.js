// Shared, I/O-free cut-out algorithm for the red-backing scanning workflow.
//
// Removes the backing and everything connected to it (e.g. the bare grey scanner
// edge) by flood-filling inward from the image border, then keeps the single
// largest enclosed island as the document — with its true irregular edge. Works
// on a raw RGBA pixel array, so the same code runs in the browser (canvas
// getImageData) and in Node (sharp raw buffer). Distances are CIELAB so an
// orange document stays separable from a red background.
//
// No DOM, no Node APIs — keep it portable.

const _lin = c => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
const _f = t => t > 0.008856 ? Math.cbrt(t) : (7.787 * t + 16 / 116);

/** sRGB (0–255) → CIELAB. */
export function rgbToLab(r, g, b) {
  r = _lin(r); g = _lin(g); b = _lin(b);
  const X = (r * 0.4124 + g * 0.3576 + b * 0.1805) / 0.95047;
  const Y = (r * 0.2126 + g * 0.7152 + b * 0.0722);
  const Z = (r * 0.0193 + g * 0.1192 + b * 0.9505) / 1.08883;
  const fx = _f(X), fy = _f(Y), fz = _f(Z);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

// Build a small palette of background colours from a ring of border pixels.
// Sampling the whole border captures e.g. both the red backing and the grey edge.
function borderPalette(L, A, B, W, H, ring = 6, mergeDist = 10, cap = 24) {
  const palette = [];
  const merge2 = mergeDist * mergeDist;
  const consider = (p) => {
    const l = L[p], a = A[p], b = B[p];
    for (const c of palette) { const dl = l - c[0], da = a - c[1], db = b - c[2]; if (dl*dl + da*da + db*db <= merge2) return; }
    if (palette.length < cap) palette.push([l, a, b]);
  };
  for (let x = 0; x < W; x += 2) for (let r = 0; r < ring; r++) { consider(r * W + x); consider((H - 1 - r) * W + x); }
  for (let y = 0; y < H; y += 2) for (let r = 0; r < ring; r++) { consider(y * W + r); consider(y * W + (W - 1 - r)); }
  return palette;
}

function toLabArrays(rgba, N) {
  const L = new Float32Array(N), A = new Float32Array(N), B = new Float32Array(N);
  for (let p = 0, q = 0; p < N; p++, q += 4) {
    const [l, a, b] = rgbToLab(rgba[q], rgba[q + 1], rgba[q + 2]);
    L[p] = l; A[p] = a; B[p] = b;
  }
  return { L, A, B };
}

/**
 * Cut out the document from a backing scan.
 * @param {Uint8ClampedArray|Uint8Array} rgba  RGBA pixels, length W*H*4
 * @param {number} W  @param {number} H
 * @param {object} [opts] { tolerance=20 (LAB), defringe=0 (px), margin=8 (px) }
 * @returns {{rgba:Uint8ClampedArray,width:number,height:number,bbox:object,frac:number,paletteSize:number,keep:Uint8Array}|null}
 *          Cropped transparent RGBA + metadata, or null if no foreground found.
 */
export function cutout(rgba, W, H, opts = {}) {
  const TOL = opts.tolerance != null ? +opts.tolerance : 20;
  const DEFRINGE = opts.defringe != null ? +opts.defringe : 0;
  const MARGIN = opts.margin != null ? +opts.margin : 8;
  const TOL2 = TOL * TOL;
  const N = W * H;

  const { L, A, B } = toLabArrays(rgba, N);
  const palette = borderPalette(L, A, B, W, H);

  const isBg = (p) => {
    const l = L[p], a = A[p], b = B[p];
    for (const c of palette) { const dl = l - c[0], da = a - c[1], db = b - c[2]; if (dl*dl + da*da + db*db <= TOL2) return true; }
    return false;
  };

  // Flood-fill background inward from every border pixel that reads as background.
  const visited = new Uint8Array(N);
  const stack = [];
  const seed = (p) => { if (!visited[p] && isBg(p)) { visited[p] = 1; stack.push(p); } };
  for (let x = 0; x < W; x++) { seed(x); seed((H - 1) * W + x); }
  for (let y = 0; y < H; y++) { seed(y * W); seed(y * W + (W - 1)); }
  while (stack.length) {
    const p = stack.pop();
    const x = p % W, y = (p - x) / W;
    if (x > 0)     { const n = p - 1; if (!visited[n] && isBg(n)) { visited[n] = 1; stack.push(n); } }
    if (x < W - 1) { const n = p + 1; if (!visited[n] && isBg(n)) { visited[n] = 1; stack.push(n); } }
    if (y > 0)     { const n = p - W; if (!visited[n] && isBg(n)) { visited[n] = 1; stack.push(n); } }
    if (y < H - 1) { const n = p + W; if (!visited[n] && isBg(n)) { visited[n] = 1; stack.push(n); } }
  }

  // Foreground = not connected background. Keep the largest component; interior
  // background-coloured holes stay part of the document automatically.
  const label = new Int32Array(N);
  let best = 0, bestArea = 0, cur = 0;
  const cstack = [];
  for (let p = 0; p < N; p++) {
    if (visited[p] || label[p]) continue;
    cur++; let area = 0; cstack.push(p); label[p] = cur;
    while (cstack.length) {
      const q = cstack.pop(); area++;
      const x = q % W, y = (q - x) / W;
      const tryN = (n) => { if (!visited[n] && !label[n]) { label[n] = cur; cstack.push(n); } };
      if (x > 0) tryN(q - 1);
      if (x < W - 1) tryN(q + 1);
      if (y > 0) tryN(q - W);
      if (y < H - 1) tryN(q + W);
    }
    if (area > bestArea) { bestArea = area; best = cur; }
  }
  if (!best) return null;

  // Kept mask, optionally eroded by DEFRINGE px to shed the antialiased halo.
  let keep = new Uint8Array(N);
  for (let p = 0; p < N; p++) keep[p] = label[p] === best ? 1 : 0;
  for (let pass = 0; pass < DEFRINGE; pass++) {
    const next = new Uint8Array(keep);
    for (let p = 0; p < N; p++) {
      if (!keep[p]) continue;
      const x = p % W, y = (p - x) / W;
      if (x === 0 || y === 0 || x === W - 1 || y === H - 1 ||
          !keep[p - 1] || !keep[p + 1] || !keep[p - W] || !keep[p + W]) next[p] = 0;
    }
    keep = next;
  }

  // Bounding box (+margin).
  let minX = W, minY = H, maxX = -1, maxY = -1;
  for (let p = 0; p < N; p++) {
    if (!keep[p]) continue;
    const x = p % W, y = (p - x) / W;
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
  }
  minX = Math.max(0, minX - MARGIN); minY = Math.max(0, minY - MARGIN);
  maxX = Math.min(W - 1, maxX + MARGIN); maxY = Math.min(H - 1, maxY + MARGIN);
  const cw = maxX - minX + 1, ch = maxY - minY + 1;

  const out = new Uint8ClampedArray(cw * ch * 4);
  for (let y = 0; y < ch; y++) {
    for (let x = 0; x < cw; x++) {
      const sp = (minY + y) * W + (minX + x);
      if (keep[sp]) {
        const sq = sp * 4, dq = (y * cw + x) * 4;
        out[dq] = rgba[sq]; out[dq + 1] = rgba[sq + 1]; out[dq + 2] = rgba[sq + 2]; out[dq + 3] = 255;
      }
    }
  }

  return { rgba: out, width: cw, height: ch, bbox: { minX, minY, maxX, maxY }, frac: bestArea / N, paletteSize: palette.length, keep };
}

/**
 * Decide whether a scan looks like it has a uniform colored backing, so the admin
 * can pre-tick the "remove backing" toggle. Returns coverage: the fraction of
 * border pixels explained by the two most common border colours.
 * @returns {{detected:boolean, coverage:number, chroma:number}}
 */
export function detectBacking(rgba, W, H, opts = {}) {
  const TOL = opts.tolerance != null ? +opts.tolerance : 20;
  const TOL2 = TOL * TOL;
  const ring = 6;
  // Collect border-ring LAB samples.
  const samples = [];
  for (let x = 0; x < W; x += 3) for (let r = 0; r < ring; r++) { samples.push((r) * W + x); samples.push((H - 1 - r) * W + x); }
  for (let y = 0; y < H; y += 3) for (let r = 0; r < ring; r++) { samples.push(y * W + r); samples.push(y * W + (W - 1 - r)); }
  const lab = samples.map(p => { const q = p * 4; return rgbToLab(rgba[q], rgba[q + 1], rgba[q + 2]); });

  // Greedy cluster into centroids with counts.
  const cents = []; // {l,a,b,n}
  for (const [l, a, b] of lab) {
    let hit = null;
    for (const c of cents) { const dl = l - c.l, da = a - c.a, db = b - c.b; if (dl*dl + da*da + db*db <= TOL2) { hit = c; break; } }
    if (hit) { hit.l = (hit.l * hit.n + l) / (hit.n + 1); hit.a = (hit.a * hit.n + a) / (hit.n + 1); hit.b = (hit.b * hit.n + b) / (hit.n + 1); hit.n++; }
    else cents.push({ l, a, b, n: 1 });
  }
  cents.sort((p, q) => q.n - p.n);
  const top2 = cents.slice(0, 2).reduce((s, c) => s + c.n, 0);
  const coverage = lab.length ? top2 / lab.length : 0;
  const chroma = cents.length ? Math.hypot(cents[0].a, cents[0].b) : 0;
  return { detected: coverage >= 0.6, coverage, chroma };
}
