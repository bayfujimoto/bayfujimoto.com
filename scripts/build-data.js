import { glob } from "glob";
import matter from "gray-matter";
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { dirname } from "path";

// Series definitions: order, labels, and container metaphors
const SERIES = {
  identity:    { label: "Identity",    container: "dossier",   order: 0 },
  labor:       { label: "Labor",       container: "binder",    order: 1 },
  consumption: { label: "Consumption", container: "ledger",    order: 2 },
  creation:    { label: "Creation",    container: "sketchbook", order: 3 },
  accumulation:{ label: "Accumulation",container: "flat-file", order: 4 },
};

// Subcollection definitions per series
const SUBCOLLECTIONS = {
  identity:    ["biography", "cv", "contact"],
  labor:       [],
  consumption: ["films", "books", "music", "coffee", "games"],
  creation:    ["sketches", "photos", "prototypes", "videos", "notes"],
  accumulation:["ephemera"],
};

// Guide is a top-level meta item (not a series)
const GUIDE = {
  type: "guide",
  label: "Guide",
  container: "metadata",
  order: 5,
};

function resolveAssetPaths(assets) {
  if (!assets || typeof assets !== "object") return assets;

  const R2_BASE = process.env.VITE_R2_BASE_URL || "";
  const resolved = {};

  for (const [key, val] of Object.entries(assets)) {
    if (typeof val === "string" && val.startsWith("/assets/")) {
      if (!R2_BASE) {
        console.warn(`[build-data] VITE_R2_BASE_URL not set — asset path left unresolved: ${val}`);
        resolved[key] = val;
      } else {
        resolved[key] = R2_BASE + val;
      }
    } else {
      resolved[key] = val;
    }
  }

  return resolved;
}

function buildArchive() {
  const files = glob.sync("src/content/**/*.md");

  const archive = { series: {}, guide: GUIDE };

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

    if (!data.series) {
      console.warn(`Skipping ${file} — missing series`);
      continue;
    }

    const { series, subcollection } = data;

    if (!archive.series[series]) {
      console.warn(`Unknown series "${series}" in ${file}`);
      continue;
    }

    // Resolve asset paths from /assets/* to full R2 URLs
    if (data.assets) {
      data.assets = resolveAssetPaths(data.assets);
    }

    // Flat series (labor, accumulation with single ephemera) store items at series level
    if (SUBCOLLECTIONS[series].length === 0) {
      if (!archive.series[series].items) {
        archive.series[series].items = [];
      }
      archive.series[series].items.push(data);
    } else {
      // Series with subcollections
      if (!subcollection) {
        console.warn(`Skipping ${file} — missing subcollection for series "${series}"`);
        continue;
      }
      if (!archive.series[series].subcollections[subcollection]) {
        archive.series[series].subcollections[subcollection] = { label: subcollection, items: [] };
      }
      archive.series[series].subcollections[subcollection].items.push(data);
    }
  }

  // Sort items by sort_date descending within each subcollection and flat series
  for (const series of Object.values(archive.series)) {
    // Flat series (items at series level)
    if (series.items) {
      series.items.sort((a, b) => {
        const da = a.sort_date ? new Date(a.sort_date) : new Date(0);
        const db = b.sort_date ? new Date(b.sort_date) : new Date(0);
        return db - da;
      });
    }
    // Series with subcollections
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
  const seriesCount = Object.keys(archive.series).length;
  console.log(`archive.json written — ${totalItems} record(s) across ${seriesCount} series + Guide`);
}

buildArchive();
