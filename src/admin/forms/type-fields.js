// Used by consumption types only — these don't use inspection modes
function assetGroup(roles) {
  return {
    id: "assets",
    label: "Assets",
    depth: "full",
    fields: roles.map(role => ({
      id:        `assets.${role}`,
      label:     role,
      type:      "asset-upload",
      assetRole: role,
    })),
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

export function getTypeGroups(itemType) {
  switch (itemType) {

    // ── Consumption ──────────────────────────────────────────
    // These types use named roles directly, not inspection modes

    case "film":
      return [
        {
          id: "film-meta", label: "Film",
          fields: [
            { id: "director", label: "director", type: "text" },
            { id: "year",     label: "year",     type: "text", placeholder: "e.g. 2024" },
            { id: "format",   label: "format",   type: "select",
              options: ["theatrical", "streaming", "physical", "festival"] },
          ],
        },
        assetGroupWithThumb(["poster"]),
      ];

    case "book":
      return [
        {
          id: "book-meta", label: "Book",
          fields: [
            { id: "author", label: "author", type: "text" },
            { id: "year",   label: "year",   type: "text", placeholder: "e.g. 2024" },
          ],
        },
        assetGroupWithThumb(["cover"]),
      ];

    case "album":
    case "ep":
    case "single":
    case "mix":
      return [
        {
          id: "music-meta", label: "Music",
          fields: [
            { id: "artist", label: "artist", type: "text" },
            { id: "year",   label: "year",   type: "text", placeholder: "e.g. 2024" },
          ],
        },
        assetGroupWithThumb(["cover"]),
      ];

    case "bag":
      return [
        {
          id: "coffee-meta", label: "Coffee",
          fields: [
            { id: "roaster", label: "roaster", type: "text" },
            { id: "origin",  label: "origin",  type: "text" },
            { id: "process", label: "process", type: "text", placeholder: "e.g. washed, natural" },
          ],
        },
        assetGroupWithThumb(["front", "back"]),
      ];

    case "game":
      return [
        {
          id: "game-meta", label: "Game",
          fields: [
            { id: "developer", label: "developer", type: "text" },
            { id: "platform",  label: "platform",  type: "text" },
            { id: "year",      label: "year",      type: "text", placeholder: "e.g. 2024" },
          ],
        },
        assetGroupWithThumb(["cover"]),
      ];

    // ── Labor ────────────────────────────────────────────────

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

    // ── Creation ─────────────────────────────────────────────

    case "sketch":
    case "photo":
    case "prototype":
    case "video":
    case "note":
      return [
        INSPECTION_ASSETS_SENTINEL,
      ];

    // ── Identity ─────────────────────────────────────────────

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

    // ── Accumulation (ephemera) ───────────────────────────────

    default:
      // ticket, brochure, receipt, handout, document
      return [
        {
          id: "ephemera-meta", label: "Ephemera",
          fields: [
            { id: "place",  label: "place",  type: "text" },
            { id: "event",  label: "event",  type: "text" },
            { id: "source", label: "source", type: "text",
              hint: "How / where it was acquired" },
            { id: "dimensions", label: "dimensions", type: "text",
              placeholder: "e.g. 89 x 54", hint: "Physical size in mm: width x height" },
          ],
        },
        INSPECTION_ASSETS_SENTINEL,
      ];
  }
}
