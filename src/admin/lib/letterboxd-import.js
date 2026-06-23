// ── Letterboxd CSV import (admin `:tags` command) ────────────────────────────
// Pure logic for intaking a Letterboxd diary export in the browser: parse the
// CSV, match each viewing against existing film records, and produce a set of
// changes to stage for commit. It writes nothing on its own — the caller stages
// the returned changes as pending edits/adds so every change is reviewed in the
// Log pane before `:w` commits them.
//
// Two guarantees, by construction:
//   • No duplicates — a diary entry is matched to an existing record by viewing
//     identity (slug(title)|year|watch_date), the exact key build-data.js uses
//     to fail the build on duplicate viewings. A row that matches becomes an
//     edit of that record, never a second copy.
//   • No silent overwrite — existing films are only ever touched to change their
//     tag list (merge or replace, the caller's choice). All other fields are
//     carried through unchanged, and changed files appear in the Log for review.

import { toMarkdown } from "./serializer.js";
import { generateFilePath, generateSlug } from "./slug-generator.js";

// ── Date: mirror scripts/utils/letterboxd-timezone.js exactly ────────────────
// Letterboxd's watched date is a calendar date in the member's local time. The
// ingest scripts normalize it to America/Chicago; we must reproduce that here so
// the viewing keys we compute line up with the keys already on disk.
const CENTRAL_TIMEZONE = "America/Chicago";

export function watchedDateToCentral(watchedDateStr) {
  const iso = `${watchedDateStr}T12:00:00-06:00`;
  const dateObj = new Date(iso);
  if (isNaN(dateObj.getTime())) throw new Error(`Invalid date: ${watchedDateStr}`);
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: CENTRAL_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = fmt.formatToParts(dateObj);
  const y = parts.find((p) => p.type === "year").value;
  const m = parts.find((p) => p.type === "month").value;
  const d = parts.find((p) => p.type === "day").value;
  return `${y}-${m}-${d}`;
}

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
function displayDate(dateStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  return `${MONTHS[m - 1]} ${d}, ${y}`;
}

// ── Viewing identity — must match build-data.js `filmKey` ─────────────────────
function keySlug(str) {
  return String(str || "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}
function viewingKey(title, year, watchDate) {
  return `${keySlug(title)}|${year || ""}|${watchDate || ""}`;
}
function normalizeLink(link) {
  return String(link || "").trim().replace(/\/+$/, "").toLowerCase();
}

// ── CSV parsing (RFC-4180-ish; handles quotes, doubled-quote escapes, CRLF) ───
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  let started = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    started = true;
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field); field = "";
    } else if (c === "\n") {
      row.push(field); rows.push(row); row = []; field = "";
    } else if (c === "\r") {
      // swallow — newline handled on \n
    } else {
      field += c;
    }
  }
  if (started && (field !== "" || row.length)) { row.push(field); rows.push(row); }
  return rows;
}

// Parse a diary.csv into header-keyed objects.
export function parseDiaryCsv(text) {
  const rows = parseCsv(text);
  if (!rows.length) return [];
  const header = rows[0].map((h) => h.trim());
  const out = [];
  for (let r = 1; r < rows.length; r++) {
    const cells = rows[r];
    if (cells.length === 1 && cells[0] === "") continue; // blank trailing line
    const obj = {};
    header.forEach((h, i) => { obj[h] = cells[i] !== undefined ? cells[i] : ""; });
    out.push(obj);
  }
  return out;
}

// ── Tag helpers ──────────────────────────────────────────────────────────────
function splitTags(raw) {
  return String(raw || "")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
}
function mergeTags(existing, incoming, mode) {
  const ex = (existing || []).map((t) => String(t));
  if (mode === "replace") return dedupe(incoming);
  const out = ex.slice();
  const seen = new Set(ex.map((t) => t.toLowerCase()));
  for (const t of incoming) {
    const k = t.toLowerCase();
    if (!seen.has(k)) { seen.add(k); out.push(t); }
  }
  return out;
}
function dedupe(list) {
  const out = [];
  const seen = new Set();
  for (const t of list) {
    const k = String(t).toLowerCase();
    if (!seen.has(k)) { seen.add(k); out.push(String(t)); }
  }
  return out;
}
function tagsEqual(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

// ── Plan: match diary rows against existing films ─────────────────────────────
// `films` is the list of existing film items (item_type === 'film'), each with
// at least { id, title, year, watch_date, letterboxd_link, tags, slug, series,
// subcollection }. `mode` is 'merge' | 'replace'.
//
// Returns a pure plan (no ids assigned, nothing serialized):
//   {
//     stats: { read, skipped, willUpdate, unchanged, willCreate },
//     updates:     [ { item, mergedTags } ],     // existing films whose tags change
//     newViewings: [ { title, year, watchDate, rating, rewatch, tags, link } ],
//   }
export function planImport({ csvText, films, mode = "merge" }) {
  const rows = parseDiaryCsv(csvText);

  const byKey = new Map();
  const byLink = new Map();
  for (const f of films) {
    byKey.set(viewingKey(f.title, f.year, f.watch_date), f);
    if (f.letterboxd_link) byLink.set(normalizeLink(f.letterboxd_link), f);
  }

  const updatesMap = new Map();   // item.id -> { item, incoming: [] }
  const newMap = new Map();       // viewingKey -> { title, year, watchDate, ... }
  let read = 0;
  let skipped = 0;

  for (const row of rows) {
    const title = (row["Name"] || "").trim();
    const year = (row["Year"] || "").trim();
    const wdRaw = (row["Watched Date"] || row["Date"] || "").trim();
    if (!title || !wdRaw) { skipped++; continue; }

    let watchDate;
    try { watchDate = watchedDateToCentral(wdRaw); }
    catch { skipped++; continue; }

    read++;
    const tags = splitTags(row["Tags"]);
    const link = (row["Letterboxd URI"] || "").trim();
    const key = viewingKey(title, year, watchDate);
    const existing = byKey.get(key) || (link && byLink.get(normalizeLink(link)));

    if (existing) {
      let e = updatesMap.get(existing.id);
      if (!e) { e = { item: existing, incoming: [] }; updatesMap.set(existing.id, e); }
      for (const t of tags) e.incoming.push(t);
    } else {
      let n = newMap.get(key);
      if (!n) {
        n = {
          title, year, watchDate,
          rating: parseFloat(row["Rating"]) || 0,
          rewatch: (row["Rewatch"] || "").trim() === "Yes",
          tags: [],
          link,
        };
        newMap.set(key, n);
      }
      for (const t of tags) if (!n.tags.some((x) => x.toLowerCase() === t.toLowerCase())) n.tags.push(t);
    }
  }

  const updates = [];
  let unchanged = 0;
  for (const { item, incoming } of updatesMap.values()) {
    const merged = mergeTags(item.tags || [], incoming, mode);
    if (tagsEqual(item.tags || [], merged)) { unchanged++; continue; }
    updates.push({ item, mergedTags: merged });
  }

  const newViewings = [...newMap.values()];

  return {
    stats: {
      read,
      skipped,
      willUpdate: updates.length,
      unchanged,
      willCreate: newViewings.length,
    },
    updates,
    newViewings,
  };
}

// ── Build stageable changes from a plan ───────────────────────────────────────
// Assigns ids to new films from `counterStart` (the current FILM counter) and
// serializes everything. Kept separate from planImport so the caller can call it
// against a stable counter baseline and re-stage idempotently.
//
//   buildChanges({ updates, newViewings, counterStart, idYear })
//     -> { changes, newItems, nextCounter }
export function buildChanges({ updates, newViewings, counterStart, idYear }) {
  const year = idYear || new Date().getFullYear();
  const changes = [];
  const newItems = [];

  // Edits — re-serialize existing records with their new tag list. Every other
  // field rides through untouched; the file path is the record's existing path.
  for (const { item, mergedTags } of updates) {
    const series = item.series || item._series;
    const subcollection = item.subcollection || item._sub;
    const slug = item.slug || generateSlug("film", item);
    const data = { ...item, tags: mergedTags };
    delete data._series;
    delete data._sub;
    const content = toMarkdown(data);
    const filePath = generateFilePath(series, subcollection, item.id, slug);
    changes.push({ id: item.id, filePath, content, action: "edit", source: "csv-import", _title: item.title });
  }

  // Adds — new film records for diary entries not already in the archive.
  let counter = counterStart;
  for (const v of newViewings) {
    counter += 1;
    const id = `FILM-${year}-${String(counter).padStart(3, "0")}`;
    const slug = generateSlug("film", { title: v.title, sort_date: v.watchDate });
    const data = {
      id,
      slug,
      title: v.title,
      series: "consumption",
      subcollection: "films",
      item_type: "film",
      status: "published",
      year: v.year,
      director: "",
      watch_date: v.watchDate,
      display_date: displayDate(v.watchDate),
      sort_date: v.watchDate,
      rating: v.rating,
      rewatch: v.rewatch,
      letterboxd_link: v.link,
      tags: v.tags,
    };
    const content = toMarkdown(data);
    const filePath = generateFilePath("consumption", "films", id, slug);
    changes.push({ id, filePath, content, action: "add", source: "csv-import", _title: v.title });
    newItems.push({ ...data, _series: "consumption", _sub: "films" });
  }

  return { changes, newItems, nextCounter: counter };
}

// Exposed for tests / callers that need the same identity function.
export { viewingKey };
