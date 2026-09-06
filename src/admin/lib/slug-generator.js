// Interchangeable record types — the editable options for the admin edit form's
// `item_type` field. Switching within a family keeps the same subcollection, id
// prefix, and slug formula, so the file path never changes. Only music is
// interchangeable today (album / ep / single render as sleeves vs a picture disc
// but share everything structural). Types absent here keep a fixed item_type.
export const TYPE_FAMILIES = {
  album:  ["album", "ep", "single"],
  ep:     ["album", "ep", "single"],
  single: ["album", "ep", "single"],
};

export const TYPE_SUBCOLLECTION = {
  "cv-entry":   "cv",
  contact:      "contact",
  film:         "films",
  book:         "books",
  album:        "music",
  ep:           "music",
  single:       "music",
  bag:          "coffee",
  game:         "games",
  sketch:       "sketches",
  photo:        "photos",
  prototype:    "prototypes",
  video:        "videos",
  note:         "notes",
  project:      null,
  artifact:     null,
  commission:   null,
  contribution: null,
  ticket:       null,
  brochure:     null,
  receipt:      null,
  handout:      null,
  document:     null,
};

const CONTENT_DIR = {
  identity:    { cv: "identity/cv", contact: "identity/contact" },
  labor:       "labor",
  consumption: { films: "consumption/films", books: "consumption/books",
                 music: "consumption/music", coffee: "consumption/coffee", games: "consumption/games" },
  creation:    { sketches: "creation/sketches", photos: "creation/photos",
                 prototypes: "creation/prototypes", videos: "creation/videos", notes: "creation/notes" },
  accumulation: "accumulation",
};

function slugify(str = "") {
  return str
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/[\s_-]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function generateSlug(itemType, data) {
  const s = slugify;
  const year = data.sort_date?.slice(0, 4) ?? String(new Date().getFullYear());
  const date = data.sort_date ?? "";

  switch (itemType) {
    case "film":
      return [s(data.title), year, "watch"].filter(Boolean).join("-");
    case "book":
      return [s(data.title), year, "read"].filter(Boolean).join("-");
    case "album":
    case "ep":
    case "single":
      return [s(data.artist), s(data.title)].filter(Boolean).join("-");
    case "bag":
      return [s(data.roaster), s(data.origin)].filter(Boolean).join("-");
    case "game":
      return [s(data.title), year, "play"].filter(Boolean).join("-");
    case "sketch":
    case "photo":
    case "prototype":
    case "video":
    case "note":
      return [s(data.title), date].filter(Boolean).join("-");
    case "cv-entry":
      return [s(data.organization), s(data.role)].filter(Boolean).join("-");
    case "contact":
      return "contact";
    case "project":
    case "artifact":
    case "commission":
    case "contribution":
      return s(data.title) || "untitled";
    default:
      // ephemera: ticket, brochure, receipt, handout, document
      return [s(data.place || "item"), date].filter(Boolean).join("-");
  }
}

export function generateFilePath(series, subcollection, id, slug) {
  const pathMap = CONTENT_DIR[series];
  const folder = typeof pathMap === "string" ? pathMap : pathMap?.[subcollection];
  if (!folder) throw new Error(`Cannot resolve path for series="${series}" subcollection="${subcollection}"`);
  // Defensive: a malformed slug may already embed its own `${id}-` prefix.
  // Strip it so the path can never double (e.g. FILM-…-FILM-…-slug.md).
  const cleanSlug = slug.startsWith(`${id}-`) ? slug.slice(id.length + 1) : slug;
  return `src/content/${folder}/${id}-${cleanSlug}.md`;
}
