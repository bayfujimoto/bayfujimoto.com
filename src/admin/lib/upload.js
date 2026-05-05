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
  const scale = Math.min(maxSize / img.naturalWidth, maxSize / img.naturalHeight);
  const w = Math.round(img.naturalWidth * scale);
  const h = Math.round(img.naturalHeight * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  canvas.getContext("2d").drawImage(img, 0, 0, w, h);
  return new Promise(resolve => canvas.toBlob(resolve, "image/jpeg", 0.8));
}

function fileExtension(file) {
  return file.name.split(".").pop().toLowerCase() || "jpg";
}

export async function uploadGalleryAsset(file, itemId, index) {
  const ext = fileExtension(file);
  const n = String(index + 1).padStart(2, "0");
  const originalName = `${itemId}-gallery-${n}.${ext}`;
  const thumbName = `${itemId}-gallery-${n}-thumb.jpg`;

  const [originalUrl, thumbUrl] = await Promise.all([
    getPresignedUrl(originalName, file.type, "originals"),
    getPresignedUrl(thumbName, "image/jpeg", "thumbnails"),
  ]);

  const img = await loadImage(file);
  const thumbBlob = await makeThumbnail(img);
  URL.revokeObjectURL(img.src);

  await Promise.all([
    putToR2(originalUrl, file, file.type),
    putToR2(thumbUrl, thumbBlob, "image/jpeg"),
  ]);

  return { file: originalName, thumbnail: thumbName, caption: "", alt: "" };
}

export async function uploadDocumentPage(file, itemId, index) {
  const ext = fileExtension(file);
  const n = String(index + 1).padStart(2, "0");
  const originalName = `${itemId}-page-${n}.${ext}`;
  const thumbName = `${itemId}-page-${n}-thumb.jpg`;

  const [originalUrl, thumbUrl] = await Promise.all([
    getPresignedUrl(originalName, file.type, "originals"),
    getPresignedUrl(thumbName, "image/jpeg", "thumbnails"),
  ]);

  const img = await loadImage(file);
  const thumbBlob = await makeThumbnail(img);
  URL.revokeObjectURL(img.src);

  await Promise.all([
    putToR2(originalUrl, file, file.type),
    putToR2(thumbUrl, thumbBlob, "image/jpeg"),
  ]);

  return { file: originalName, thumbnail: thumbName, caption: "", alt: "" };
}

export async function uploadLaborImage(file, itemId, index) {
  const ext = fileExtension(file);
  const n = String(index + 1).padStart(2, "0");
  const originalName = `${itemId}-img-${n}.${ext}`;
  const thumbName    = `${itemId}-img-${n}-thumb.jpg`;

  const [originalUrl, thumbUrl] = await Promise.all([
    getPresignedUrl(originalName, file.type, "originals"),
    getPresignedUrl(thumbName, "image/jpeg", "thumbnails"),
  ]);

  const img = await loadImage(file);
  const thumbBlob = await makeThumbnail(img);
  URL.revokeObjectURL(img.src);

  await Promise.all([
    putToR2(originalUrl, file, file.type),
    putToR2(thumbUrl, thumbBlob, "image/jpeg"),
  ]);

  return { file: originalName, thumbnail: thumbName, caption: "" };
}

// Model assets are not images — no thumbnail generation, uploads to originals/ only
export async function uploadModelAsset(file, itemId) {
  const ext = fileExtension(file);
  const originalName = `${itemId}-model.${ext}`;
  const uploadUrl = await getPresignedUrl(originalName, file.type, "originals");
  await putToR2(uploadUrl, file, file.type);
  return { model: originalName };
}

export async function uploadImageAsset(file, itemId, role) {
  const ext = fileExtension(file);
  const originalName = `${itemId}-${role}.${ext}`;
  const thumbName = `${itemId}-${role}-thumb.jpg`;

  const [originalUrl, thumbUrl] = await Promise.all([
    getPresignedUrl(originalName, file.type, "originals"),
    getPresignedUrl(thumbName, "image/jpeg", "thumbnails"),
  ]);

  const img = await loadImage(file);
  const thumbBlob = await makeThumbnail(img);
  URL.revokeObjectURL(img.src);

  await Promise.all([
    putToR2(originalUrl, file, file.type),
    putToR2(thumbUrl, thumbBlob, "image/jpeg"),
  ]);

  return { original: originalName, thumbnail: thumbName };
}
