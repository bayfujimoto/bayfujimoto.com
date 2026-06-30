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
  return data.uploadUrl;
}

async function putToR2(url, blob, contentType) {
  const res = await fetch(url, {
    method: "PUT",
    headers: { "Content-Type": contentType },
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

function makeThumbnail(img, maxSize = 200) {
  const scale = Math.min(maxSize / img.naturalWidth, maxSize / img.naturalHeight, 1);
  const w = Math.round(img.naturalWidth * scale);
  const h = Math.round(img.naturalHeight * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  canvas.getContext("2d").drawImage(img, 0, 0, w, h);
  return new Promise(resolve => canvas.toBlob(resolve, "image/jpeg", 0.8));
}

// Web-size display derivative: the asset the site actually serves for inspection.
// WebP (preserves transparency for future cut-outs), capped at 2048px on the long
// edge, never upscaled. Keeps the full original out of the browser.
function makeWebSize(img, maxSize = 2048) {
  const scale = Math.min(maxSize / img.naturalWidth, maxSize / img.naturalHeight, 1);
  const w = Math.round(img.naturalWidth * scale);
  const h = Math.round(img.naturalHeight * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  canvas.getContext("2d").drawImage(img, 0, 0, w, h);
  return new Promise(resolve => canvas.toBlob(resolve, "image/webp", 0.82));
}

function fileExtension(file) {
  return file.name.split(".").pop().toLowerCase() || "jpg";
}

// Uploads the full original plus a thumbnail and a web-size (display) derivative
// from a single decode. `base` is the filename stem (no extension); the three
// objects are named by convention so image-url.js can address them on read:
//   originals/<base>.<ext>   thumbnails/<base>-thumb.jpg   display/<base>-web.webp
// Returns the original and thumbnail filenames (the display name is derived on read).
async function uploadImageTriple(file, base) {
  const ext = fileExtension(file);
  const originalName = `${base}.${ext}`;
  const thumbName    = `${base}-thumb.jpg`;
  const webName      = `${base}-web.webp`;

  const [originalUrl, thumbUrl, webUrl] = await Promise.all([
    getPresignedUrl(originalName, file.type, "originals"),
    getPresignedUrl(thumbName, "image/jpeg", "thumbnails"),
    getPresignedUrl(webName, "image/webp", "display"),
  ]);

  const img = await loadImage(file);
  const [thumbBlob, webBlob] = await Promise.all([makeThumbnail(img), makeWebSize(img)]);
  URL.revokeObjectURL(img.src);

  const puts = [
    putToR2(originalUrl, file, file.type),
    putToR2(thumbUrl, thumbBlob, "image/jpeg"),
  ];
  // webBlob can be null if the browser lacks canvas WebP encoding; the site then
  // falls back to the original on read, so a missing display size is non-fatal.
  if (webBlob) puts.push(putToR2(webUrl, webBlob, "image/webp"));
  await Promise.all(puts);

  return { originalName, thumbName };
}

export async function uploadGalleryAsset(file, itemId, index) {
  const n = String(index + 1).padStart(2, "0");
  const { originalName, thumbName } = await uploadImageTriple(file, `${itemId}-gallery-${n}`);
  return { file: originalName, thumbnail: thumbName, caption: "", alt: "" };
}

export async function uploadDocumentPage(file, itemId, index) {
  const n = String(index + 1).padStart(2, "0");
  const { originalName, thumbName } = await uploadImageTriple(file, `${itemId}-page-${n}`);
  return { file: originalName, thumbnail: thumbName, caption: "", alt: "" };
}

export async function uploadLaborImage(file, itemId, index) {
  const n = String(index + 1).padStart(2, "0");
  const { originalName, thumbName } = await uploadImageTriple(file, `${itemId}-img-${n}`);
  return { file: originalName, thumbnail: thumbName, caption: "" };
}

// Model assets are not images — no thumbnail/web derivative, uploads to originals/ only
export async function uploadModelAsset(file, itemId) {
  const ext = fileExtension(file);
  const originalName = `${itemId}-model.${ext}`;
  const uploadUrl = await getPresignedUrl(originalName, file.type, "originals");
  await putToR2(uploadUrl, file, file.type);
  return { model: originalName };
}

export async function uploadImageAsset(file, itemId, role) {
  const { originalName, thumbName } = await uploadImageTriple(file, `${itemId}-${role}`);
  return { original: originalName, thumbnail: thumbName };
}
