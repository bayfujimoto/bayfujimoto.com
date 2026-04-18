async function getPresignedUrl(filename, contentType, prefix) {
  const res = await fetch("/api/r2-upload-url", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ filename, contentType, prefix }),
  });
  const data = await res.json();
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

function makeThumbnail(img, size = 200) {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const scale = Math.max(size / img.naturalWidth, size / img.naturalHeight);
  const sw = size / scale;
  const sh = size / scale;
  const sx = (img.naturalWidth - sw) / 2;
  const sy = (img.naturalHeight - sh) / 2;
  canvas.getContext("2d").drawImage(img, sx, sy, sw, sh, 0, 0, size, size);
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
