export const TYPE_SUBCOLLECTION = {
  biography:    "biography",
  "cv-entry":   "cv",
  contact:      "contact",
  film:         "films",
  book:         "books",
  album:        "music",
  ep:           "music",
  single:       "music",
  mix:          "music",
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
  identity:    { biography: "identity/biography", cv: "identity/cv", contact: "identity/contact" },
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
    case "mix":
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
    case "biography":
      return `biography-${year}`;
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
      return [s(data.place || data.event || "item"), date].filter(Boolean).join("-");
  }
}

export function generateFilePath(series, subcollection, id, slug) {
  const pathMap = CONTENT_DIR[series];
  const folder = typeof pathMap === "string" ? pathMap : pathMap?.[subcollection];
  if (!folder) throw new Error(`Cannot resolve path for series="${series}" subcollection="${subcollection}"`);
  return `src/content/${folder}/${id}-${slug}.md`;
}
