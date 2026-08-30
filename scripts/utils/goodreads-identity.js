// Shared identity keys for book records.
//
// A book's dedup key must not depend on how its front matter is *formatted*.
// The admin re-serializes a record with js-yaml on every save, which drops the
// quotes the ingest scripts used to match on (`goodreads_link: "…"` becomes
// `goodreads_link: https://…`). Any book edited in the admin therefore looked
// absent to the ingest and was re-created under a fresh id on the next build —
// the duplicate-entry bug. Parse the front matter, key on the numeric Goodreads
// book id, and fall back to reading identity when no link is stored.

// The numeric id out of any Goodreads URL shape (…/book/show/457228,
// …/book/show/457228.Butchers_Crossing, /review/show/…?book_id=457228).
// Returns a normalized `gr:<id>` key, or the trimmed link if no id is present.
export function goodreadsKey(link) {
  if (!link) return "";
  const s = String(link).trim();
  const m = s.match(/goodreads\.com\/book\/show\/(\d+)/) || s.match(/[?&]book_id=(\d+)/);
  return m ? `gr:${m[1]}` : s;
}

// Reading identity — the secondary key, for records with no goodreads_link.
// A reread differs by date, so it stays a distinct record.
export function readingKey(title, dateRead) {
  const t = String(title || "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `${t}|${dateRead || ""}`;
}
