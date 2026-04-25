const BASE = import.meta.env.VITE_R2_BASE_URL || "";

// Increment when thumbnails are regenerated in R2 to bust browser/CDN caches.
const THUMB_VERSION = "20260425";

export function imageUrl(filename, variant = "original") {
  if (!filename) return null;
  if (filename.startsWith("http")) return filename;
  const prefix = variant === "thumbnail" ? "thumbnails" : "originals";
  const v = variant === "thumbnail" ? `?v=${THUMB_VERSION}` : "";
  return `${BASE}/${prefix}/${filename}${v}`;
}
