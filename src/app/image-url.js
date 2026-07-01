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
  // A per-asset cache-bust token may be embedded as "…?v=<token>" (added on
  // upload). Split it off before deriving the R2 key, then apply it as the URL's
  // version — overriding the global default so a same-key replacement renders
  // fresh instead of serving the stale cached image.
  let ver = null;
  const qi = filename.indexOf("?v=");
  if (qi !== -1) { ver = filename.slice(qi + 3); filename = filename.slice(0, qi); }
  if (variant === "thumbnail") {
    return `${BASE}/thumbnails/${filename}?v=${ver || THUMB_VERSION}`;
  }
  if (variant === "display") {
    return `${BASE}/display/${stripExt(filename)}-web.webp?v=${ver || DISPLAY_VERSION}`;
  }
  if (variant === "cutout") {
    // Full-resolution transparent cut-out (derived from the raw master).
    return `${BASE}/cutouts/${stripExt(filename)}-cut.png?v=${ver || DISPLAY_VERSION}`;
  }
  return `${BASE}/originals/${filename}${ver ? `?v=${ver}` : ""}`;
}

export function modelUrl(filename) {
  if (!filename) return null;
  if (filename.startsWith("http")) return filename;
  const qi = filename.indexOf("?v=");
  const ver  = qi !== -1 ? filename.slice(qi + 3) : null;
  const name = qi !== -1 ? filename.slice(0, qi) : filename;
  return `${BASE}/originals/${name}${ver ? `?v=${ver}` : ""}`;
}
