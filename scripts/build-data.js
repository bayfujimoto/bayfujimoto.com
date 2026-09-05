import { glob } from "glob";
import matter from "gray-matter";
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { dirname } from "path";
import { goodreadsKey, readingKey } from "./utils/goodreads-identity.js";
import { DESK_OBJECTS, objectFor } from "../src/shared/desk-objects.js";
import { deriveMark } from "../src/shared/field-schema.js";

// Series definitions: order, labels, and container metaphors
const SERIES = {
  identity:    { label: "Identity",    container: "dossier",    subtitle: "biography, CV, contact",                      order: 0 },
  labor:       { label: "Labor",       container: "binder",     subtitle: "projects, drawings, specifications, reports",  order: 1 },
  consumption: { label: "Consumption", container: "ledger",     subtitle: "films, books, music, coffee, games",          order: 2 },
  creation:    { label: "Creation",    container: "sketchbook", subtitle: "sketches, photos, prototypes, videos, notes", order: 3 },
  accumulation:{ label: "Accumulation",container: "flat-file",  subtitle: "tickets, receipts, brochures, printed matter", order: 4 },
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
  subtitle: "finding aid, sitemap, site notes",
  order: 5,
};

// The Guide's frames, in strip order: the key first, then the five series in
// desk order. Each frame describes the series its object OPENS (the labor box
// opens Accumulation, the bundle opens Labor — see DESK_CLICK_REMAP), so the
// frame keyed "labor" carries the bundle. docs/guide-inspection-card-plan.md.
const GUIDE_FRAME_KEYS = ["key", "identity", "labor", "consumption", "creation", "accumulation"];

// Read the editable guide file (composed in the admin's Guide editor and
// committed to src/content/guide.md). Stored outside the records glob so it is
// never parsed as a record. Front matter carries the per-object notes under
// `objects`; the body is the intro (the key frame's note). A file with no front
// matter still builds — gray-matter yields an empty `data`.
function readGuide() {
  let raw = "";
  try {
    raw = readFileSync("src/content/guide.md", "utf8");
  } catch {
    return { content: "", intro: "", objects: {} };
  }
  const { data, content } = matter(raw);
  const objects = {};
  for (const [key, val] of Object.entries(data.objects || {})) {
    if (!GUIDE_FRAME_KEYS.includes(key)) {
      console.warn(`[build-data] guide.md: unknown object key "${key}" ignored`);
      continue;
    }
    objects[key] = {
      holds: typeof val?.holds === "string" ? val.holds.trim() : "",
      description: typeof val?.description === "string" ? val.description.trim() : "",
    };
  }
  return { content: raw, intro: content.trim(), objects };
}

// Resolve the Guide's frames against the series definitions, the shared
// desk-object table, and the published record counts. `object` is the physical
// noun of what sits on the desk; `container` is the series' metaphor — for the
// swapped pair they differ on purpose, and the card shows both.
function buildGuideFrames(archive, objects) {
  return GUIDE_FRAME_KEYS.map((key) => {
    const isKey = key === "key";
    const objId = isKey ? "guide" : objectFor(key);
    const obj = DESK_OBJECTS[objId];
    const def = isKey ? GUIDE : SERIES[key];
    const s = isKey ? null : archive.series[key];
    const authored = objects[key] || {};
    let count = null, subcount = null;
    if (s) {
      count = (s.items || []).filter(isPublished).length;
      const subs = Object.values(s.subcollections || {});
      for (const sub of subs) count += (sub.items || []).filter(isPublished).length;
      subcount = subs.length || null;
    } else {
      count = countItems(archive, isPublished);
    }
    return {
      key,
      kind: isKey ? "meta" : "series",
      label: def.label,
      container: def.container,
      holds: authored.holds || def.subtitle,
      object: obj.noun,
      model: obj.file,
      thumbnail: `/thumbnails/desk/${key}.png`,
      count,
      subcollections: subcount,
      description: isKey ? "" : authored.description,
    };
  });
}

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

const isPublished = (i) => i.status === "published";

// Derive the public archive (published records only) from the full archive,
// preserving structure and key order so public/data/archive.json stays stable.
function publishedOnly(archive) {
  const out = { series: {}, guide: archive.guide };
  for (const [key, s] of Object.entries(archive.series)) {
    const ns = { label: s.label, container: s.container, subtitle: s.subtitle, order: s.order, subcollections: {} };
    for (const [subKey, sub] of Object.entries(s.subcollections || {})) {
      ns.subcollections[subKey] = { label: sub.label, items: (sub.items || []).filter(isPublished) };
      if (sub.marks) ns.subcollections[subKey].marks = sub.marks;
      if (sub.range) ns.subcollections[subKey].range = sub.range;
    }
    if (s.items) ns.items = s.items.filter(isPublished);
    out.series[key] = ns;
  }
  // Constellations: published registry records only, members filtered to
  // published items. An empty (member-less) constellation is still shipped —
  // it may be declared before its items are entered.
  out.constellations = {};
  for (const [slug, c] of Object.entries(archive.constellations || {})) {
    if (!isPublished(c)) continue;
    out.constellations[slug] = { ...c, items: (c.items || []).filter(isPublished) };
  }
  out._counters = archive._counters;
  return out;
}

// ── Constellations ────────────────────────────────────────────────────────────
// Lateral cross-series groupings (decisions.md → "Constellations: cross-series
// grouping"). Registry records live at src/content/constellations/<slug>.md;
// items reference them via a `constellations` array of slugs. Membership is
// derived here — the registry never lists members itself. Unresolved slugs are
// a build warning, not a silent gap.
function readConstellationRegistry() {
  const registry = {};
  const files = glob.sync("src/content/constellations/*.md");
  for (const file of files) {
    const raw = readFileSync(file, "utf8");
    const { data, content } = matter(raw);
    const slug = data.slug || file.split("/").pop().replace(/\.md$/, "");
    if (registry[slug]) {
      console.warn(`[build-data] duplicate constellation slug "${slug}" in ${file}`);
      continue;
    }
    registry[slug] = {
      slug,
      title: data.title || slug,
      status: data.status || "published",
      display_date: data.display_date || "",
      date_start: data.date_start || "",
      date_end: data.date_end || "",
      // The constellation's voice: front-matter `note`, else the markdown body.
      note: data.note || content.trim() || "",
      items: [],
    };
  }
  return registry;
}

function countItems(archive, predicate = () => true) {
  let n = 0;
  for (const s of Object.values(archive.series)) {
    if (s.items) n += s.items.filter(predicate).length;
    for (const sub of Object.values(s.subcollections || {})) n += (sub.items || []).filter(predicate).length;
  }
  return n;
}

function buildArchive() {
  const files = glob.sync("src/content/**/*.md", {
    ignore: ["src/content/_templates/**", "src/content/guide.md", "src/content/constellations/**"],
  });

  const guideSrc = readGuide();
  const archive = { series: {}, guide: { ...GUIDE, content: guideSrc.content, intro: guideSrc.intro, objects: guideSrc.objects } };
  archive.constellations = readConstellationRegistry();

  // Track every frontmatter id → source file(s) so we can fail loudly on any
  // duplicate. Two files sharing an id render as duplicate cards downstream.
  const idIndex = new Map();

  // Track film viewings by identity (title|year|watch_date) so two records of
  // the same viewing — e.g. a stale record plus a re-ingested copy — fail the
  // build instead of shipping as duplicate cards. Rewatches differ by date.
  const viewingIndex = new Map();
  const filmKey = (d) =>
    `${String(d.title || "").toLowerCase().replace(/['’]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}|${d.year || ""}|${d.watch_date || ""}`;

  // Same guard for books. The Goodreads ingest runs on every production build,
  // so a record it fails to recognize comes back under a fresh id — different
  // id, same reading. Keyed by Goodreads book id where present, else by reading
  // identity (title|date_read). A reread differs by date and stays distinct.
  const bookIndex = new Map();
  const bookKey = (d) =>
    d.goodreads_link
      ? goodreadsKey(d.goodreads_link)
      : readingKey(d.title, d.date_read || d.sort_date);

  // Pre-populate all series and subcollections so they exist even if empty
  for (const [seriesKey, seriesDef] of Object.entries(SERIES)) {
    archive.series[seriesKey] = {
      label: seriesDef.label,
      container: seriesDef.container,
      subtitle: seriesDef.subtitle,
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

    // Non-published records are kept here — the admin archive needs them (the
    // Explorer colors drafts/partial/complete). The public archive is filtered to
    // published below. Film-viewing dedup guards published films only: a draft
    // isn't shipped, so it can't collide with a published viewing.
    if (data.status === "published" && data.item_type === "film") {
      const key = filmKey(data);
      if (!viewingIndex.has(key)) viewingIndex.set(key, []);
      viewingIndex.get(key).push(file);
    }
    if (data.status === "published" && data.item_type === "book") {
      const key = bookKey(data);
      if (!bookIndex.has(key)) bookIndex.set(key, []);
      bookIndex.get(key).push(file);
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

    // Constellation membership — validate each referenced slug against the
    // registry and attach the item to its constellation(s). A missing registry
    // record warns loudly; the item still ships with its reference intact so
    // fixing the registry alone repairs the link.
    if (data.constellations) {
      if (!Array.isArray(data.constellations)) {
        console.warn(`[build-data] "constellations" must be an array in ${file} — got ${typeof data.constellations}`);
        data.constellations = [String(data.constellations)];
      }
      for (const slug of data.constellations) {
        const c = archive.constellations[slug];
        if (!c) {
          console.warn(`[build-data] unresolved constellation "${slug}" in ${file} — no registry record at src/content/constellations/${slug}.md`);
          continue;
        }
        c.items.push(data);
      }
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

  // CV: the card's strip needs a mark per entry and the plate a year range
  // shared by every frame (docs/cv-inspection-card-plan.md). Derived here,
  // beside the items rather than on them, so the public record stays the file.
  const cv = archive.series.identity?.subcollections?.cv;
  if (cv) {
    cv.marks = {};
    let minStart = Infinity, maxEnd = -Infinity;
    const today = new Date();
    for (const e of cv.items) {
      cv.marks[e.id] = (typeof e.mark === "string" && e.mark.trim()) ? e.mark.trim().slice(0, 6) : deriveMark(e.organization);
      if (!isPublished(e)) continue;
      const a = e.date_start ? new Date(e.date_start) : null;
      const b = e.date_end ? new Date(e.date_end) : today;
      if (a && !isNaN(a)) minStart = Math.min(minStart, a.getFullYear());
      if (b && !isNaN(b)) maxEnd = Math.max(maxEnd, b.getFullYear() + b.getMonth() / 12);
    }
    cv.range = isFinite(minStart)
      ? { start: minStart, end: Math.ceil(maxEnd) + (Math.ceil(maxEnd) - maxEnd < 0.5 ? 1 : 0) }
      : null;
  }

  // Sort constellation members by sort_date descending, matching every other
  // item list (the browse grid groups by year, newest first).
  for (const c of Object.values(archive.constellations)) {
    c.items.sort((a, b) => {
      const da = a.sort_date ? new Date(a.sort_date) : new Date(0);
      const db = b.sort_date ? new Date(b.sort_date) : new Date(0);
      return db - da;
    });
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
  // …and on any duplicate book — catches a re-ingested copy of a book already
  // in the archive (different id, same Goodreads record or same title/date).
  const dupBooks = [...bookIndex].filter(([, paths]) => paths.length > 1);
  if (dupIds.length || dupViewings.length || dupBooks.length) {
    const fmt = (label, groups) =>
      groups.map(([k, paths]) => `  Duplicate ${label} ${k} in:\n${paths.map(p => `    ${p}`).join("\n")}`).join("\n");
    const detail = [
      dupIds.length      ? fmt("id", dupIds)                : "",
      dupViewings.length ? fmt("film viewing", dupViewings) : "",
      dupBooks.length    ? fmt("book", dupBooks)            : "",
    ].filter(Boolean).join("\n");
    throw new Error(`build-data: ${dupIds.length} duplicate id(s), ${dupViewings.length} duplicate viewing(s), ${dupBooks.length} duplicate book(s) found —\n${detail}`);
  }

  // Guide frames need the finished series (published counts), so they resolve last.
  archive.guide.frames = buildGuideFrames(archive, guideSrc.objects);

  mkdirSync(dirname("public/data/archive.json"), { recursive: true });

  // _admin-archive.json — every record, all statuses. Written OUTSIDE public/ so
  // it is never served statically: it is bundled into the passkey-gated function
  // netlify/functions/archive-admin.js (which imports it) and returned only to an
  // authenticated admin session. The leading underscore keeps Netlify from
  // treating it as a function endpoint. Generated each build; gitignored.
  const adminPath = "netlify/functions/_admin-archive.json";
  mkdirSync(dirname(adminPath), { recursive: true });
  writeFileSync(adminPath, JSON.stringify(archive));

  // archive.json — published records only, for the public site.
  writeFileSync("public/data/archive.json", JSON.stringify(publishedOnly(archive), null, 2));

  const seriesCount = Object.keys(archive.series).length;
  const constCount = Object.keys(archive.constellations).length;
  console.log(
    `archive.json — ${countItems(archive, isPublished)} published; ` +
    `_admin-archive.json — ${countItems(archive)} record(s) (all statuses) across ${seriesCount} series + Guide; ` +
    `${constCount} constellation(s)`
  );
}

buildArchive();
