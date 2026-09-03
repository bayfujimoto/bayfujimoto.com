// Per-type admin form groups.
//
// Card-using types (Consumption, Creation, Accumulation) derive their metadata
// fields from the shared field schema (src/shared/field-schema.js), so the admin's
// editable fields, labels, and example placeholders match the catalog card.
// Labor and Identity keep bespoke groups — they use custom inspection views, not
// the card.

import { adminFields, physicalFields } from "../../shared/field-schema.js";

const cap = s => s.charAt(0).toUpperCase() + s.slice(1);

// Used by consumption types only — these don't use inspection modes.
// Each role may be a plain string ("poster") or a descriptor object
// ({ role, label, skipThumbnail, allowCutout }). skipThumbnail marks an asset
// that should never become the record thumbnail (e.g. a wide backdrop);
// allowCutout exposes the "remove backing" control for scan-oriented assets —
// both are read by makeAssetUploadField in form-renderer.js.
function assetGroup(roles) {
  return {
    id: "assets",
    label: "Assets",
    depth: "full",
    fields: roles.map(entry => {
      const role = typeof entry === "string" ? entry : entry.role;
      const cfg  = typeof entry === "string" ? {} : entry;
      return {
        id:            `assets.${role}`,
        label:         cfg.label ?? role,
        type:          "asset-upload",
        assetRole:     role,
        skipThumbnail: cfg.skipThumbnail ?? false,
        allowCutout:   cfg.allowCutout ?? false,
      };
    }),
  };
}

function assetGroupWithThumb(roles) {
  return assetGroup(roles);
}

// Inspection-capable types get a sentinel group that form-renderer replaces
// with the mode-appropriate asset UI when inspection changes
export const INSPECTION_ASSETS_SENTINEL = {
  id: "inspection-assets",
  label: "Assets",
  depth: "full",
  fields: [
    {
      id: "inspection",
      label: "inspection mode",
      type: "inspection-select",
      options: ["none", "card", "gallery", "document", "object", "contraption"],
    },
  ],
};

// Build a type's metadata group from the shared schema: creator + typed slots,
// plus extent/dimensions for physical types. Each becomes a text input whose
// placeholder is the schema's example (the grammar reminder shown on focus).
// A registry entry with `options` (e.g. `fold`) renders as a select.
function schemaMetaGroup(itemType, id, label) {
  const fields = [...adminFields(itemType), ...physicalFields(itemType)].map(f => (
    f.options
      ? { id: f.id, label: f.label, type: "select", options: f.options }
      : { id: f.id, label: f.label, type: "text", placeholder: f.example }
  ));
  return { id, label, fields };
}

export function getTypeGroups(itemType) {
  switch (itemType) {

    // ── Consumption (schema-driven) ──────────────────────────
    case "film":
      return [
        schemaMetaGroup("film", "film-meta", "Film"),
        assetGroupWithThumb([
          "poster",
          { role: "backdrop", label: "backdrop (optional)", skipThumbnail: true },
        ]),
      ];

    case "book":
      return [schemaMetaGroup("book", "book-meta", "Book"), assetGroupWithThumb(["cover"])];

    case "album":
    case "ep":
    case "single":
      return [schemaMetaGroup(itemType, "music-meta", "Music"), assetGroupWithThumb(["cover"])];

    case "bag":
      return [schemaMetaGroup("bag", "coffee-meta", "Coffee"), assetGroupWithThumb([
        { role: "front", allowCutout: true },
        { role: "back", allowCutout: true },
      ])];

    case "game":
      return [schemaMetaGroup("game", "game-meta", "Game"), assetGroupWithThumb(["cover"])];

    // ── Labor (custom view; not schema-driven) ───────────────

    case "project":
    case "artifact":
    case "commission":
    case "contribution":
      return [
        {
          id: "labor-meta", label: "Labor",
          fields: [
            { id: "context",      label: "context",      type: "select",
              options: ["professional", "academic", "personal"] },
            { id: "role",         label: "role",         type: "text" },
            { id: "organization", label: "organization", type: "text" },
          ],
        },
        {
          id: "labor-content", label: "Content",
          depth: "full",
          fields: [
            { id: "thesis",   label: "thesis",   type: "textarea",
              hint: "Markdown supported." },
            { id: "model",    label: "3D model", type: "model-upload",
              hint: "GLB or GLTF" },
            { id: "subitems", label: "images",   type: "subitem-list" },
          ],
        },
      ];

    // ── Creation (schema-driven meta + inspection assets) ────

    // Photos always edit as an ordered exposures list (file + caption,
    // reorder, remove) — the same widget labor's images use — because a photo
    // record almost always holds several exposures. No inspection dropdown:
    // the list IS the photo record's reproduction. A single photo is a
    // one-item list. decisions.md → "Photo entries — display treatment".
    case "photo":
      return [
        schemaMetaGroup("photo", "photo-meta", "Photo"),
        {
          id: "photo-content", label: "Photos",
          depth: "full",
          fields: [
            { id: "assets.gallery", label: "photos", type: "gallery-upload" },
          ],
        },
      ];

    case "sketch":
    case "prototype":
    case "video":
    case "note":
      return [schemaMetaGroup(itemType, `${itemType}-meta`, cap(itemType)), INSPECTION_ASSETS_SENTINEL];

    // ── Identity (custom views) ──────────────────────────────

    case "biography":
      return [
        {
          id: "bio-meta", label: "Biography",
          fields: [
            { id: "location", label: "location", type: "text" },
            { id: "roles",    label: "roles",    type: "id-list",
              hint: "One role per line" },
            { id: "links",    label: "links",    type: "pair-list",
              hint: "One per line: label: url" },
          ],
        },
        // The biography's text lives in front matter (short_bio / long_bio),
        // rendered by makeBiographySheet — one-paragraph introduction, then
        // the long form split on blank lines.
        {
          id: "bio-text", label: "Text",
          depth: "full",
          fields: [
            { id: "short_bio", label: "short bio", type: "textarea",
              hint: "One-paragraph introduction, shown first." },
            { id: "long_bio",  label: "long bio",  type: "textarea",
              hint: "Separate paragraphs with a blank line." },
          ],
        },
      ];

    case "cv-entry":
      return [
        {
          id: "cv-meta", label: "CV Entry",
          fields: [
            { id: "category",     label: "category",     type: "select",
              options: ["other", "employment", "education", "exhibition", "publication", "award"] },
            { id: "organization", label: "organization", type: "text" },
            { id: "role",         label: "role / title", type: "text" },
          ],
        },
      ];

    case "contact":
      return [
        {
          id: "contact-meta", label: "Contact",
          fields: [
            { id: "channels", label: "channels", type: "pair-list",
              hint: "One per line: label: value (e.g. email: name@example.com)" },
          ],
        },
      ];

    // ── Accumulation / ephemera (schema-driven) ──────────────

    default:
      // ticket, brochure, receipt, handout, document
      return [schemaMetaGroup(itemType, "ephemera-meta", "Ephemera"), INSPECTION_ASSETS_SENTINEL];
  }
}
