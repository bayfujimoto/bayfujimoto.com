import { cutout, detectBacking } from "../../shared/cutout.js";

async function getPresignedUrl(filename, contentType, prefix) {
  const res = await fetch("/api/r2-upload-url", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ filename, contentType, prefix }),
  });
  const text = await res.text();
  if (!text) throw new Error(`Upload API returned empty response (status ${res.status}) — is R2 configured?`);
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`Upload API returned non-JSON (status ${res.status}): ${text.slice(0, 120)}`);
  }
  if (!data.ok) throw new Error(data.error || "Failed to get upload URL");
  // Return the signed cache-control alongside the URL. The server signs it into
  // the presigned PUT, so putToR2 must send exactly this value back (see below).
  return { url: data.uploadUrl, cacheControl: data.cacheControl };
}

async function putToR2(presign, blob, contentType) {
  const headers = { "Content-Type": contentType };
  // Echo the exact Cache-Control the server signed into the presigned URL. A
  // mismatched or missing value would fail SigV4 verification with a 403.
  if (presign.cacheControl) headers["Cache-Control"] = presign.cacheControl;
  const res = await fetch(presign.url, {
    method: "PUT",
    headers,
    body: blob,
  });
  if (!res.ok) throw new Error(`R2 upload failed: ${res.status}`);
}

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

function canvasToBlob(canvas, mime, quality) {
  return new Promise(resolve => canvas.toBlob(resolve, mime, quality));
}

// Resize any drawable source (HTMLImageElement or HTMLCanvasElement) onto a
// canvas capped at maxSize on the long edge (never enlarged) and encode it.
function encodeResized(source, maxSize, mime, quality) {
  const sw = source.naturalWidth ?? source.width;
  const sh = source.naturalHeight ?? source.height;
  const scale = Math.min(maxSize / sw, maxSize / sh, 1);
  const w = Math.round(sw * scale);
  const h = Math.round(sh * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  canvas.getContext("2d").drawImage(source, 0, 0, w, h);
  return new Promise(resolve => canvas.toBlob(resolve, mime, quality));
}

function makeThumbnail(source, maxSize = 200, mime = "image/jpeg", quality = 0.8) {
  return encodeResized(source, maxSize, mime, quality);
}

// Web-size display derivative the site serves for inspection. WebP (preserves
// transparency for cut-outs), capped at 2048px, never upscaled.
function makeWebSize(source, maxSize = 2048, mime = "image/webp", quality = 0.82) {
  return encodeResized(source, maxSize, mime, quality);
}

// Run the shared cut-out on a loaded image and return a transparent canvas.
function makeCutoutCanvas(img, opts) {
  const w = img.naturalWidth, h = img.naturalHeight;
  const src = document.createElement("canvas");
  src.width = w; src.height = h;
  const ctx = src.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(img, 0, 0);
  const id = ctx.getImageData(0, 0, w, h);
  const res = cutout(id.data, w, h, opts);
  if (!res) throw new Error("cut-out found no object — leave a backing margin on all four sides");
  const out = document.createElement("canvas");
  out.width = res.width; out.height = res.height;
  out.getContext("2d").putImageData(new ImageData(res.rgba, res.width, res.height), 0, 0);
  return out;
}

function fileExtension(file) {
  return file.name.split(".").pop().toLowerCase() || "jpg";
}

// Best-effort removal of stale R2 objects — used when an asset is replaced and
// the new upload writes different keys (a different file type leaves the old
// original; a changed cut-out mode leaves the old thumbnail / cut-out). Never
// throws: a failed cleanup must not fail the upload, and leftover objects are
// harmless (nothing references them).
async function deleteR2Keys(keys) {
  const clean = (keys || []).filter(Boolean);
  if (!clean.length) return;
  try {
    await fetch("/api/r2-delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ keys: clean }),
    });
  } catch { /* ignore — orphaned objects are harmless */ }
}

// A short per-asset cache-bust token: the content hash of the source file mixed
// with the cut-out mode/params. The token — and thus the image URL — changes
// whenever the rendered result changes (even for a same-key replacement) but
// stays stable when the identical file is re-uploaded with the same settings.
async function contentVersion(file, options = {}) {
  let hex;
  try {
    const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
    hex = [...new Uint8Array(digest)].slice(0, 4).map(b => b.toString(16).padStart(2, "0")).join("");
  } catch {
    hex = Date.now().toString(36); // hashing unavailable — fall back to a unique stamp
  }
  const mode = options.cutout ? `c${options.tolerance ?? 20}x${options.defringe ?? 2}` : "o";
  return `${hex}${mode}`;
}

// Append the cache-bust token to a stored filename (image-url.js splits it back
// out before deriving R2 keys, and applies it as the URL's ?v= param).
const withV = (name, v) => (v ? `${name}?v=${v}` : name);

// When replacing an original whose extension differs from the new one, the old
// original sits under a key the new upload won't overwrite — return it for
// deletion. `replaces` is the previously stored value (may carry a ?v= token).
function replacedOriginalKey(replaces, originalName) {
  if (!replaces) return null;
  const prev = String(replaces).split("?")[0];
  return prev && prev !== originalName ? `originals/${prev}` : null;
}

// Decide whether a file looks like a backing scan, so the admin can pre-tick the
// "remove backing" toggle. Best-effort; failures are caught by the caller.
export async function detectBackingFromFile(file) {
  const img = await loadImage(file);
  try {
    const w = img.naturalWidth, h = img.naturalHeight;
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    const ctx = c.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(img, 0, 0);
    const id = ctx.getImageData(0, 0, w, h);
    return detectBacking(id.data, w, h).detected;
  } finally {
    URL.revokeObjectURL(img.src);
  }
}

// Uploads the master plus derivatives from a single decode. `base` is the
// filename stem (no extension). Naming convention (read by image-url.js):
//   originals/<base>.<ext>   thumbnails/<base>-thumb.{jpg|webp}
//   display/<base>-web.webp  cutouts/<base>-cut.png
//
// options.cutout === true  → master = raw scan; full-res cut-out PNG + display +
//   thumbnail (all WebP/PNG with alpha) are derived from the cut-out.
// otherwise → original behavior (opaque thumbnail JPEG + display WebP).
async function uploadImageWithDerivatives(file, base, options = {}) {
  const ext = fileExtension(file);
  const originalName = `${base}.${ext}`;
  const version = await contentVersion(file, options);
  const img = await loadImage(file);

  try {
    if (options.cutout) {
      const params = { tolerance: options.tolerance ?? 20, defringe: options.defringe ?? 2 };
      const cutCanvas = makeCutoutCanvas(img, params);
      const cutName = `${base}-cut.png`;
      const thumbName = `${base}-thumb.webp`;
      const webName = `${base}-web.webp`;

      const [origUrl, cutUrl, thumbUrl, webUrl] = await Promise.all([
        getPresignedUrl(originalName, file.type, "originals"),
        getPresignedUrl(cutName, "image/png", "cutouts"),
        getPresignedUrl(thumbName, "image/webp", "thumbnails"),
        getPresignedUrl(webName, "image/webp", "display"),
      ]);

      const [cutBlob, thumbBlob, webBlob] = await Promise.all([
        canvasToBlob(cutCanvas, "image/png"),
        makeThumbnail(cutCanvas, 200, "image/webp", 0.85),
        makeWebSize(cutCanvas, 2048, "image/webp", 0.82),
      ]);

      await Promise.all([
        putToR2(origUrl, file, file.type),
        putToR2(cutUrl, cutBlob, "image/png"),
        putToR2(thumbUrl, thumbBlob, "image/webp"),
        putToR2(webUrl, webBlob, "image/webp"),
      ]);

      // Clean up a prior non-cut-out thumbnail (opaque JPEG) and a differently
      // typed old original left behind by this replacement.
      await deleteR2Keys([
        `thumbnails/${base}-thumb.jpg`,
        replacedOriginalKey(options.replaces, originalName),
      ]);

      return { originalName, thumbName, version, cutout: true, params };
    }

    // Non-cut-out: full original + JPEG thumbnail + WebP display.
    const thumbName = `${base}-thumb.jpg`;
    const webName = `${base}-web.webp`;
    const [originalUrl, thumbUrl, webUrl] = await Promise.all([
      getPresignedUrl(originalName, file.type, "originals"),
      getPresignedUrl(thumbName, "image/jpeg", "thumbnails"),
      getPresignedUrl(webName, "image/webp", "display"),
    ]);
    const [thumbBlob, webBlob] = await Promise.all([makeThumbnail(img), makeWebSize(img)]);
    const puts = [
      putToR2(originalUrl, file, file.type),
      putToR2(thumbUrl, thumbBlob, "image/jpeg"),
    ];
    if (webBlob) puts.push(putToR2(webUrl, webBlob, "image/webp"));
    await Promise.all(puts);

    // Clean up prior cut-out artifacts (WebP thumbnail + full-res cut-out) and a
    // differently typed old original left behind by this replacement.
    await deleteR2Keys([
      `thumbnails/${base}-thumb.webp`,
      `cutouts/${base}-cut.png`,
      replacedOriginalKey(options.replaces, originalName),
    ]);

    return { originalName, thumbName, version };
  } finally {
    URL.revokeObjectURL(img.src);
  }
}

const cutFields = (r) => (r.cutout ? { cutout: true, cutout_params: r.params } : {});

export async function uploadGalleryAsset(file, itemId, index, options) {
  const n = String(index + 1).padStart(2, "0");
  const r = await uploadImageWithDerivatives(file, `${itemId}-gallery-${n}`, options);
  return { file: withV(r.originalName, r.version), thumbnail: withV(r.thumbName, r.version), caption: "", alt: "", ...cutFields(r) };
}

export async function uploadDocumentPage(file, itemId, index, options) {
  const n = String(index + 1).padStart(2, "0");
  const r = await uploadImageWithDerivatives(file, `${itemId}-page-${n}`, options);
  return { file: withV(r.originalName, r.version), thumbnail: withV(r.thumbName, r.version), caption: "", alt: "", ...cutFields(r) };
}

export async function uploadLaborImage(file, itemId, index, options) {
  const n = String(index + 1).padStart(2, "0");
  const r = await uploadImageWithDerivatives(file, `${itemId}-img-${n}`, options);
  return { file: withV(r.originalName, r.version), thumbnail: withV(r.thumbName, r.version), caption: "", ...cutFields(r) };
}

// Model assets are not images — no thumbnail/web derivative, uploads to originals/ only
export async function uploadModelAsset(file, itemId) {
  const ext = fileExtension(file);
  const originalName = `${itemId}-model.${ext}`;
  const uploadUrl = await getPresignedUrl(originalName, file.type, "originals");
  await putToR2(uploadUrl, file, file.type);
  return { model: originalName };
}

export async function uploadImageAsset(file, itemId, role, options) {
  const r = await uploadImageWithDerivatives(file, `${itemId}-${role}`, options);
  return { original: withV(r.originalName, r.version), thumbnail: withV(r.thumbName, r.version), ...cutFields(r) };
}
