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
// ({ role, label, skipThumbnail }). skipThumbnail marks an asset that should
// never become the record thumbnail (e.g. a wide backdrop) — see
// makeAssetUploadField in form-renderer.js.
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
function schemaMetaGroup(itemType, id, label) {
  const fields = [...adminFields(itemType), ...physicalFields(itemType)].map(f => ({
    id: f.id,
    label: f.label,
    type: "text",
    placeholder: f.example,
  }));
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
      return [schemaMetaGroup("bag", "coffee-meta", "Coffee"), assetGroupWithThumb(["front", "back"])];

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

    case "sketch":
    case "photo":
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
