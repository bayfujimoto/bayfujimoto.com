/**
 * field-schema.js — single source of truth for the catalog-card fields.
 *
 * Imported by both the public card (src/app/panels.js -> renderCard) and the admin
 * form (src/admin/forms/type-fields.js). Spec and rationale: docs/field-schema.md;
 * decision: docs/decisions.md -> "Item card field schema: spine + typed slots".
 *
 * Scope: the card-using series only — Consumption, Creation, Accumulation.
 * Labor and Identity keep custom views and are not described here.
 *
 * The card (renderCard) reads resolveCreator / resolveSlots; the admin form reads
 * adminFields / physicalFields. Keep this in sync with docs/field-schema.md.
 */

// The archive's subject. Creator defaults to this for self-authored (Creation)
// types and the creator row is suppressed when a record's creator equals it.
export const SUBJECT = "Bay Fujimoto";

// ── Field registry ───────────────────────────────────────────────────────────
// key -> { label, example?, mono? }
//   label   — shown on the card and as the admin field label
//   example — admin placeholder (ghosted grammar reminder)
//   mono    — render the value in monospace (machine-readable codes)
export const FIELDS = {
  // ── spine ──
  id:           { label: "ID",         mono: true },
  item_type:    { label: "type",       mono: true },
  title:        { label: "title",      example: "e.g. Lift ticket — Aiguille du Midi" },
  display_date: { label: "date",       example: "e.g. March 12, 2025" },
  extent:       { label: "extent",     example: "e.g. 1 ticket · 12 photographs" },
  dimensions:   { label: "dimensions", mono: true, example: "e.g. 89 x 54  (mm, W x H)" },
  context_note: { label: "note",       example: "e.g. Kept from the first ascent; ink smudged at the fold." },
  related_ids:  { label: "see also",   example: "one ID per line, e.g. EPH-2025-001" },
  constellations: { label: "constellations", mono: true, example: "autocomplete, e.g. 2026-atx-sf" },
  tags:         { label: "tags",       example: "comma-separated, e.g. travel, chamonix" },

  // ── responsibility (creator) — data keys match existing records ──
  director:     { label: "director",   example: "e.g. Denis Villeneuve" },
  author:       { label: "author",     example: "e.g. Ursula K. Le Guin" },
  artist:       { label: "artist",     example: "e.g. Aphex Twin" },
  developer:    { label: "developer",  example: "e.g. FromSoftware" },
  roaster:      { label: "roaster",    example: "e.g. Onyx Coffee Lab" },
  // Creation override — usually blank, so it defaults to SUBJECT and is suppressed:
  creator:      { label: "maker",      example: "e.g. a collaborator — leave blank if it's you" },
  issuer:       { label: "issuer",     example: "e.g. SNCF" },

  // ── typed slots ──
  year:         { label: "year",       mono: true, example: "e.g. 2024" },
  seen_via:     { label: "seen via",   example: "e.g. theatrical, streaming, Blu-ray" },
  edition:      { label: "edition",    example: "e.g. Penguin Classics, 1979" },
  music_label:  { label: "label",      example: "e.g. 4AD" },        // album/ep slot 2 (record label)
  album:        { label: "album",      example: "e.g. There Is Love in You" }, // single slot 2 (parent album title)
  rating:       { label: "rating",     example: "e.g. 4 / 5", adminSkip: true }, // OPEN cell #3: ingest-written, shown on card, not hand-edited
  origin:       { label: "origin",     example: "e.g. Huila, Colombia" },
  process:      { label: "process",    example: "e.g. washed, natural" },
  varietal:     { label: "varietal",   example: "e.g. Caturra" },
  platform:     { label: "platform",   example: "e.g. PC, Switch" },
  play_status:  { label: "status",     example: "completed / playing / abandoned" }, // NOTE: distinct from record `status`
  place:        { label: "place",      example: "e.g. Chamonix, France" },
  camera:       { label: "camera",     example: "e.g. Pentax K1000" },
  photo_series: { label: "series",     example: "e.g. Alps 2024 (contact sheet)" },  // NOTE: distinct from archive `series`
  medium:       { label: "medium",     example: "e.g. graphite on paper" },
  material:     { label: "material",   example: "e.g. Bristol board" },
  related_project: { label: "related project", example: "e.g. LAB-2024-003" },
  duration:     { label: "duration",   example: "e.g. 2:14" },
  video_source: { label: "source",     example: "e.g. iPhone 14, handheld" }, // capture device; distinct key from provenance `source`
  note_type:    { label: "note_type",  example: "sketch / written note / idea / draft" },
  source:       { label: "source",     example: "e.g. kept from the trip; gift from M." }, // Accumulation provenance

  // ── book identifiers (record-only; back the cover lookup, not a card row) ──
  isbn13:       { label: "ISBN-13",    mono: true },
  isbn:         { label: "ISBN",       mono: true },
};

// ── Per-type config ──────────────────────────────────────────────────────────
// creator.mode:
//   "always"   — show data[key] (Consumption: the director/author/… is the point)
//   "self"     — default SUBJECT; show only when present and ≠ SUBJECT (Creation)
//   "optional" — show when present (ephemera issuer)
//   "none"     — never a creator row (note)
// slots: ordered list, ≤3 rows. A nested array renders as a split row
//   (two label/value pairs on one line, like date / source).

// Music splits by silhouette (see docs/music-display-plan.md): album/ep are
// "releases" and read as record sleeves; single is a "track" and reads as a
// picture disc. The split exists so slot 2 differs — a release shows its label,
// a track shows its parent album.
const MUSIC_RELEASE = {
  creator: { key: "artist", mode: "always" },
  slots: ["year", "music_label", "rating"],
  titleGiven: true,
};
const MUSIC_TRACK = {
  creator: { key: "artist", mode: "always" },
  slots: ["year", "album", "rating"],
  titleGiven: true,
};
const creation = (slots, creatorLabel, opts = {}) => ({
  creator: { key: "creator", mode: "self", label: creatorLabel },
  slots,
  ...opts,
});
// Ephemera slot 1 is `place` alone — the former place + event split row is
// retired with the `event` field. Constellations render as their own rider row
// (see SPINE below), never in a split row. decisions.md → "Constellations".
const EPHEMERA = {
  creator: { key: "issuer", mode: "optional" },
  slots: ["place", "source"],
  physical: true,
};

export const TYPES = {
  // ── Consumption ──
  film: { creator: { key: "director",  mode: "always" }, slots: ["year", "seen_via", "rating"], titleGiven: true },
  book: { creator: { key: "author",    mode: "always" }, slots: ["year", "edition", "rating"], titleGiven: true },
  album: MUSIC_RELEASE, ep: MUSIC_RELEASE, single: MUSIC_TRACK,
  bag:  { creator: { key: "roaster",   mode: "always" }, slots: ["origin", "process", "varietal"], titleGiven: true }, // coffee
  game: { creator: { key: "developer", mode: "always" }, slots: ["platform", "play_status", "rating"], titleGiven: true },

  // ── Creation (creator self-default → suppressed unless overridden) ──
  photo:     creation(["place", "camera", "photo_series"], "photographer", { physical: true }),
  sketch:    creation(["medium", "material", "related_project"], "maker", { physical: true }),
  prototype: creation(["medium", "material", "related_project"], "maker", { physical: true }),
  video:     creation(["duration", "video_source", "related_project"], "maker"),
  note:      { creator: { key: null, mode: "none" }, slots: ["note_type", "related_project"] }, // OPEN cell #4: plate?

  // ── Accumulation (ephemera subtypes share one model) ──
  ticket: EPHEMERA, brochure: EPHEMERA, receipt: EPHEMERA, handout: EPHEMERA, document: EPHEMERA,
};

// ── Spine order (for reference; renderCard special-cases the framed rows) ─────
export const SPINE = [
  { row: "accession", split: ["id", "item_type"] }, // "ID" / "type", monospace
  { row: "title", key: "title" },
  { row: "creator" },                                // resolveCreator(item)
  { row: "date", key: "display_date" },
  { row: "slots" },                                  // resolveSlots(item)
  { row: "physical", split: ["extent", "dimensions"] },
  { row: "note", key: "context_note" },
  // Riders render as three separate rows: see-also buttons, constellations as
  // their own row of clickable tokens (→ /constellations/<slug>/), then tags.
  { row: "riders", keys: ["related_ids", "constellations", "tags"] },
  // status -> stamp overprint, not a row
];

// Fields kept in the data but never given a card row.
export const RECORD_ONLY = new Set([
  "slug", "sort_date", "created_date", "visibility", "inspection", "status",
  "approximate_date",                          // feeds date-certainty display, not its own row
  "brew_method", "grinder", "ratio", "dose",   // coffee log detail
  "rewatch", "playtime", "tools", "collaborators",
  "isbn13", "isbn",                            // book identifiers; back cover lookup, not a card row
  "dimensions_estimated",                      // flags a format-estimated size (books), not measured
]);

// ── Resolvers (pure; consumers build the DOM) ────────────────────────────────

export function typeConfig(itemType) {
  return TYPES[itemType] || null;
}

function cell(key, item) {
  const def = FIELDS[key];
  const value = item[key];
  // Suppress falsy values (blank string, null, numeric 0, false) so that an
  // unrated item (rating: 0) shows no rating row.
  if (!value) return null;
  // Typographic register (rule b): every discrete catalog token renders mono.
  // Serif is reserved for prose (note) and devised titles, handled in renderCard.
  return { key, label: def?.label ?? key, value, mono: true };
}

/** Creator row for an item, applying the self-default / suppression rule.
 *  Returns { label, value } or null when the row should be suppressed. */
export function resolveCreator(item) {
  const cfg = TYPES[item.item_type];
  if (!cfg || !cfg.creator) return null;
  const { key, mode, label } = cfg.creator;
  if (mode === "none" || !key) return null;
  const value = item[key];
  if (mode === "self") {
    if (!value || value === SUBJECT) return null;    // shown only on exception
  } else if (!value) {
    return null;                                     // always / optional: suppress when blank
  }
  return { label: label ?? FIELDS[key]?.label ?? key, value };
}

/** Typed slot rows for an item. Each row is
 *  { type:"single", label, value, mono } or
 *  { type:"split", cells:[{label,value,mono}, …] }, with blanks suppressed. */
export function resolveSlots(item) {
  const cfg = TYPES[item.item_type];
  if (!cfg) return [];
  const rows = [];
  for (const slot of cfg.slots) {
    if (Array.isArray(slot)) {
      const cells = slot.map(k => cell(k, item)).filter(Boolean);
      if (cells.length === 1) rows.push({ type: "single", ...cells[0] });
      else if (cells.length > 1) rows.push({ type: "split", cells });
    } else {
      const c = cell(slot, item);
      if (c) rows.push({ type: "single", ...c });
    }
  }
  return rows;
}

/** Admin: ordered editable fields for a type's meta group (creator + slots),
 *  each as { id, label, example }. Fields marked `adminSkip` (e.g. ingest-written
 *  `rating`) are excluded. Spine basics (id/title/date/status/note/tags/related)
 *  come from the base groups; physical fields come from physicalFields(). */
export function adminFields(itemType) {
  const cfg = TYPES[itemType];
  if (!cfg) return [];
  const keys = [];
  if (cfg.creator?.key) keys.push(cfg.creator.key);
  for (const slot of cfg.slots) {
    if (Array.isArray(slot)) keys.push(...slot);
    else keys.push(slot);
  }
  return keys
    .filter(k => !FIELDS[k]?.adminSkip)
    .map(k => ({ id: k, label: FIELDS[k]?.label ?? k, example: FIELDS[k]?.example }));
}

/** Admin: physical fields (extent, dimensions) for types whose records carry a
 *  physical size — creation visual types and ephemera. Empty for the rest. */
export function physicalFields(itemType) {
  if (!TYPES[itemType]?.physical) return [];
  return ["extent", "dimensions"].map(k => ({
    id: k, label: FIELDS[k].label, example: FIELDS[k].example,
  }));
}

/** Typographic register: true when the title is a transcribed work title
 *  (Consumption → monospace); false when the archivist devised it
 *  (Creation / Accumulation → serif). See docs/field-schema.md. */
export function titleIsGiven(itemType) {
  return !!TYPES[itemType]?.titleGiven;
}
