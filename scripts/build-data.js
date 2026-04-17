import { glob } from "glob";
import matter from "gray-matter";
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { dirname } from "path";

// Series definitions: order, labels, and container metaphors
const SERIES = {
  identity:    { label: "Identity",    container: "dossier",   order: 0 },
  work:        { label: "Work",        container: "binder",    order: 1 },
  consumption: { label: "Consumption", container: "ledger",    order: 2 },
  creation:    { label: "Creation",    container: "sketchbook", order: 3 },
  accumulation:{ label: "Accumulation",container: "flat-file", order: 4 },
};

// Subcollection definitions per series
const SUBCOLLECTIONS = {
  identity:    ["biography", "cv", "contact"],
  work:        ["projects", "artifacts"],
  consumption: ["films", "books", "coffee", "influences"],
  creation:    ["sketches", "photos", "prototypes", "videos"],
  accumulation:["ephemera", "documents"],
};

function buildArchive() {
  const files = glob.sync("src/content/**/*.md");

  const archive = { series: {} };

  // Pre-populate all series and subcollections so they exist even if empty
  for (const [seriesKey, seriesDef] of Object.entries(SERIES)) {
    archive.series[seriesKey] = {
      label: seriesDef.label,
      container: seriesDef.container,
      order: seriesDef.order,
      subcollections: {},
    };
    for (const sub of SUBCOLLECTIONS[seriesKey]) {
      archive.series[seriesKey].subcollections[sub] = { label: sub, items: [] };
    }
  }

  for (const file of files) {
    const raw = readFileSync(file, "utf8");
    const { data } = matter(raw);

    if (!data.series || !data.subcollection) {
      console.warn(`Skipping ${file} — missing series or subcollection`);
      continue;
    }

    const { series, subcollection } = data;

    if (!archive.series[series]) {
      console.warn(`Unknown series "${series}" in ${file}`);
      continue;
    }
    if (!archive.series[series].subcollections[subcollection]) {
      archive.series[series].subcollections[subcollection] = { label: subcollection, items: [] };
    }

    archive.series[series].subcollections[subcollection].items.push(data);
  }

  // Sort items by sort_date descending within each subcollection
  for (const series of Object.values(archive.series)) {
    for (const sub of Object.values(series.subcollections)) {
      sub.items.sort((a, b) => {
        const da = a.sort_date ? new Date(a.sort_date) : new Date(0);
        const db = b.sort_date ? new Date(b.sort_date) : new Date(0);
        return db - da;
      });
    }
  }

  const outPath = "public/data/archive.json";
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify(archive, null, 2));

  const totalItems = files.length;
  console.log(`archive.json written — ${totalItems} record(s) across ${Object.keys(archive.series).length} series`);
}

buildArchive();
