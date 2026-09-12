// Per-type admin form groups.
//
// Card-using types (Consumption, Creation, Accumulation) derive their metadata
// fields from the shared field schema (src/shared/field-schema.js), so the admin's
// editable fields, labels, and example placeholders match the catalog card.
// Labor and Identity keep bespoke groups — they use custom inspection views, not
// the card.

import { adminFields, physicalFields, cuppingFields } from "../../shared/field-schema.js";
import { PLATFORMS, ESRB_RATINGS } from "../../shared/game-box.js";

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
        gameBox:       cfg.gameBox ?? false,
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

    // Coffee: the five cupping scales get their own group, because they are a
    // form the archivist fills in rather than catalog metadata — the desk's
    // cupping form plots them and the card never shows them.
    case "bag":
      return [schemaMetaGroup("bag", "coffee-meta", "Coffee"), {
        id: "cupping", label: "Cupping",
        fields: cuppingFields("bag").map(f => ({ id: f.id, label: f.label, type: "text", placeholder: f.example })),
      }, assetGroupWithThumb([
        { role: "front", allowCutout: true },
        { role: "back", allowCutout: true, skipThumbnail: true }, // thumbnail is the front's
      ])];

    // Games: the cover is bare key art, set into the box of the platform it
    // was played on at upload (src/shared/game-box.js). `platform` is a
    // controlled vocabulary because it chooses the case; `esrb` fills the
    // case's rating slot. The cut-out control does not apply — the box
    // template carries the silhouette.
    case "game": {
      const meta = schemaMetaGroup("game", "game-meta", "Game");
      const fields = [];
      for (const f of meta.fields) {
        if (f.id === "platform") {
          fields.push({ id: "platform", label: "platform", type: "select",
            options: [{ value: "", label: "— choose" }, ...PLATFORMS.map(p => p.value)],
            hint: "The hardware it was played on — chooses the box the cover is set into." });
          fields.push({ id: "esrb", label: "ESRB", type: "select",
            options: ESRB_RATINGS.map(r => (r === "" ? { value: "", label: "— none" } : r)),
            hint: "Rating letter printed in the box's slot. Leave empty for no badge." });
        } else {
          fields.push(f);
        }
      }
      return [{ ...meta, fields }, assetGroupWithThumb([
        { role: "cover", label: "cover (key art)", gameBox: true },
      ])];
    }

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

    // Biography: no record type. It is a homed constellation (registry record
    // src/content/constellations/biography.md; items join via the constellation
    // chip field), so there is nothing to intake here.

    case "cv-entry":
      return [
        {
          id: "cv-meta", label: "CV Entry",
          fields: [
            { id: "category",     label: "category",     type: "select",
              options: ["other", "employment", "education", "exhibition", "publication", "award"] },
            { id: "organization", label: "organization", type: "text" },
            { id: "role",         label: "role / title", type: "text" },
            { id: "mark",         label: "mark",         type: "text",
              hint: "Short label for the CV card's strip tile (LDO, SHoP). Derived from the organization when empty." },
          ],
        },
      ];

    case "contact":
      // One record, one calling card: what is printed on it, the channels it
      // carries, and its size. The asset group takes a scan of a real card,
      // which then replaces the typeset one on the plate.
      return [
        {
          id: "contact-meta", label: "Contact",
          fields: [
            { id: "name",      label: "name",      type: "text", placeholder: "as printed on the card" },
            { id: "role_line", label: "role line", type: "text", placeholder: "e.g. architect · austin" },
            { id: "channels", label: "channels", type: "pair-list",
              hint: "One per line: label: value (e.g. email: name@example.com). Links derive from the label." },
            { id: "dimensions", label: "dimensions", type: "text", placeholder: "89 x 51 mm" },
          ],
        },
        INSPECTION_ASSETS_SENTINEL,
      ];

    // ── Accumulation / ephemera (schema-driven) ──────────────

    default:
      // ticket, brochure, receipt, handout, document
      return [schemaMetaGroup(itemType, "ephemera-meta", "Ephemera"), INSPECTION_ASSETS_SENTINEL];
  }
}
