const BASE = import.meta.env.VITE_R2_BASE_URL || "";

// Increment when thumbnails are regenerated in R2 to bust browser/CDN caches.
const THUMB_VERSION = "20260425";
// Increment when display (web-size) derivatives are regenerated in R2.
const DISPLAY_VERSION = "20260630";

// Strip a stored filename's extension so the display derivative — always WebP,
// regardless of the original's format — can be addressed by convention:
//   originals/foo.png  →  display/foo-web.webp
function stripExt(name) {
  return name.replace(/\.[^./]+$/, "");
}

// variant: "original" (full master), "display" (web-size WebP), "thumbnail".
// The site should load "display" for inspection and "thumbnail" for browse;
// "original" is reserved for explicit full-resolution access.
export function imageUrl(filename, variant = "original") {
  if (!filename) return null;
  if (filename.startsWith("http")) return filename;
  if (variant === "thumbnail") {
    return `${BASE}/thumbnails/${filename}?v=${THUMB_VERSION}`;
  }
  if (variant === "display") {
    return `${BASE}/display/${stripExt(filename)}-web.webp?v=${DISPLAY_VERSION}`;
  }
  return `${BASE}/originals/${filename}`;
}

export function modelUrl(filename) {
  if (!filename) return null;
  if (filename.startsWith("http")) return filename;
  return `${BASE}/originals/${filename}`;
}
