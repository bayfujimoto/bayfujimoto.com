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
  accumulation:[],
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
    if (typeof val !== "string") {
      resolved[key] = val;
    } else if (val.startsWith("http")) {
      // Already a full URL — pass through (old-style records)
      resolved[key] = val;
    } else if (val.startsWith("/assets/")) {
      // Legacy path — expand to full R2 URL
      if (!R2_BASE) {
        console.warn(`[build-data] VITE_R2_BASE_URL not set — asset path left unresolved: ${val}`);
        resolved[key] = val;
      } else {
        resolved[key] = R2_BASE + val;
      }
    } else {
      // Bare filename — leave as-is, frontend constructs URL at render time
      resolved[key] = val;
    }
  }

  return resolved;
}

function buildArchive() {
  const files = glob.sync("src/content/**/*.md", { ignore: "src/content/_templates/**" });

  const archive = { series: {}, guide: GUIDE };

  // Track every frontmatter id → source file(s) so we can fail loudly on any
  // duplicate. Two files sharing an id render as duplicate cards downstream.
  const idIndex = new Map();

  // Track film viewings by identity (title|year|watch_date) so two records of
  // the same viewing — e.g. a stale record plus a re-ingested copy — fail the
  // build instead of shipping as duplicate cards. Rewatches differ by date.
  const viewingIndex = new Map();
  const filmKey = (d) =>
    `${String(d.title || "").toLowerCase().replace(/['’]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}|${d.year || ""}|${d.watch_date || ""}`;

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

    if (data.id) {
      if (!idIndex.has(data.id)) idIndex.set(data.id, []);
      idIndex.get(data.id).push(file);
    }

    if (!data.series) {
      console.warn(`Skipping ${file} — missing series`);
      continue;
    }

    if (data.status !== "published") continue;

    if (data.item_type === "film") {
      const key = filmKey(data);
      if (!viewingIndex.has(key)) viewingIndex.set(key, []);
      viewingIndex.get(key).push(file);
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

    // Music: derive the physical footprint from the release type so records stay
    // minimal (see docs/music-display-plan.md). album/ep read as 12" sleeves;
    // single as a 12" disc face. The browse grid and catalog-card plate size
    // reproductions from `dimensions` (mm, "W x H"). An explicit value wins.
    if (data.subcollection === "music" && !data.dimensions) {
      data.dimensions = data.item_type === "single" ? "300 x 300" : "314 x 314";
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

  // Embed ID counters so the admin interface can read them from archive.json
  const countersRaw = readFileSync("src/content/_id-counters.yaml", "utf8");
  archive._counters = Object.fromEntries(
    countersRaw.trim().split("\n").map(line => {
      const [k, v] = line.split(":").map(s => s.trim());
      return [k, parseInt(v, 10)];
    })
  );

  // Fail loudly on any duplicate id — catches admin doubling, stray macOS
  // " 2.md" copies, and manual mistakes before a duplicated archive ships.
  const dupIds = [...idIndex].filter(([, paths]) => paths.length > 1);
  // …and on any duplicate film viewing — catches a re-ingested copy of a film
  // already in the archive (different id, same title/year/watch_date).
  const dupViewings = [...viewingIndex].filter(([, paths]) => paths.length > 1);
  if (dupIds.length || dupViewings.length) {
    const fmt = (label, groups) =>
      groups.map(([k, paths]) => `  Duplicate ${label} ${k} in:\n${paths.map(p => `    ${p}`).join("\n")}`).join("\n");
    const detail = [
      dupIds.length    ? fmt("id", dupIds)             : "",
      dupViewings.length ? fmt("film viewing", dupViewings) : "",
    ].filter(Boolean).join("\n");
    throw new Error(`build-data: ${dupIds.length} duplicate id(s), ${dupViewings.length} duplicate viewing(s) found —\n${detail}`);
  }

  const outPath = "public/data/archive.json";
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify(archive, null, 2));

  const totalItems = files.length;
  const seriesCount = Object.keys(archive.series).length;
  console.log(`archive.json written — ${totalItems} record(s) across ${seriesCount} series + Guide`);
}

buildArchive();
