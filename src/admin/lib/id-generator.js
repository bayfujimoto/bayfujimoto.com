export const PREFIX_MAP = {
  "cv-entry":   "CV",
  contact:      "CONTACT",
  project:      "PROJ",
  artifact:     "PROJ",
  commission:   "PROJ",
  contribution: "PROJ",
  film:         "FILM",
  book:         "BOOK",
  album:        "MUSIC",
  ep:           "MUSIC",
  single:       "MUSIC",
  bag:          "COFFEE",
  game:         "GAME",
  sketch:       "SKETCH",
  photo:        "PHOTO",
  prototype:    "PROTO",
  video:        "VIDEO",
  note:         "NOTE",
  ticket:       "EPH",
  brochure:     "EPH",
  receipt:      "EPH",
  handout:      "EPH",
  document:     "EPH",
};

export function generateId(itemType, counters) {
  const prefix = PREFIX_MAP[itemType];
  if (!prefix) throw new Error(`Unknown item type: ${itemType}`);
  const year = new Date().getFullYear();
  const next = (counters[prefix] ?? 0) + 1;
  return {
    id: `${prefix}-${year}-${String(next).padStart(3, "0")}`,
    prefix,
    nextCounter: next,
  };
}
