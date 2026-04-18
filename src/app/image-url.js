const BASE = import.meta.env.VITE_R2_BASE_URL || "";

export function imageUrl(filename, variant = "original") {
  if (!filename) return null;
  if (filename.startsWith("http")) return filename;
  const prefix = variant === "thumbnail" ? "thumbnails" : "originals";
  return `${BASE}/${prefix}/${filename}`;
}
