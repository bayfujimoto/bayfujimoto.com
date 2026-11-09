#!/usr/bin/env node
// Resolves each book's physical size and writes it to front matter as
// `dimensions: <W> x <H>` (mm), `dimensions_source`, and — only where the height
// is not measured — `dimensions_estimated: true`. This drives both the books-grid
// scaling and the calibrated plate in the detail view (both read `item.dimensions`
// in src/app/panels.js; `dimensions_estimated` is what puts the "≈" on the card).
//
// HEIGHT comes from the best available source for the edition ON SCREEN (see
// scripts/utils/book-editions.js — the cover URL pins the ISBN, or the cover id
// resolves to exactly one Open Library edition):
//
//   1. google   Google Books, via the two-step volume fetch. A real measurement
//               of that edition. No `dimensions_estimated`.
//   2. marc     MARC 300$c, height in whole centimetres rounded up, centred by
//               subtracting 5 mm. ±5 mm, so it stays flagged estimated.
//   3. binding  The old behaviour: a standard trim height for the Goodreads
//               binding. Flagged estimated.
//
// WIDTH is always height × the cover image's aspect ratio (measured with sharp),
// as it always was. Google reports a width too, but the jacket and the board are
// not the same rectangle, and the aspect is measured from the artwork the grid
// actually draws — so the proportion on screen stays true to the image.
//
// Why this replaced a pure format estimate: surveyed against Google's height on
// the 96 records where both existed, the binding estimate was off by a median of
// 10 mm and by more than 10 mm on 46 of them — Gratitude 235 → 180, Watchmen
// 210 → 260. The grid was drawing a pocket hardcover as the tallest object in
// the row. See `node scripts/probe-book-dimensions.js` for the survey.
//
// Usage:
//   node scripts/enrich-book-dimensions.js --isbn-csv="Goodreads Library Export.csv"
//   node scripts/enrich-book-dimensions.js --isbn-csv=... --force --dry-run
//
// Needs GOOGLE_BOOKS_API_KEY in .env.local for tier 1 (same key as book-covers.js).
// Without it Google is rate-limited to 429s and everything falls to marc/binding.
//   node scripts/enrich-book-dimensions.js --isbn-csv=... --dry-run --limit=12
//   node scripts/enrich-book-dimensions.js --only=BOOK-2026-160 --force
//
// Flags: --isbn-csv=PATH (Binding + page count by Book Id) · --dry-run · --limit=N
//        --offset=N (skip the first N records — the run is slow, so it splits)
//        --only=IDS (comma-separated) · --force (re-estimate books that already have it)

import { readFileSync, writeFileSync, createReadStream } from "fs";
import { join } from "path";
import { glob } from "glob";
import matter from "gray-matter";
import csv from "csv-parser";
import sharp from "sharp";
import { existsSync } from "fs";
import { resolveEdition, googleVolume, marcHeightMm } from "./utils/book-editions.js";

// Load .env.local for local runs, as the film/R2 scripts do. Existing
// process.env values win, so an exported key is never overwritten.
if (existsSync(".env.local")) {
  for (const line of readFileSync(".env.local", "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}
const GOOGLE_KEY = process.env.GOOGLE_BOOKS_API_KEY || "";

const CONTENT_DIR = "src/content/consumption/books";

// Standard trim heights (mm) by Goodreads binding. Width comes from the cover aspect.
const BINDING_HEIGHT_MM = {
  "mass market paperback": 174,
  "paperback": 210,
  "hardcover": 235,
  "kindle edition": 210,
  "ebook": 210,
};
const DEFAULT_HEIGHT_MM = 210; // unknown/blank → typical trade size

const heightForBinding = (b) =>
  BINDING_HEIGHT_MM[String(b || "").trim().toLowerCase()] ?? DEFAULT_HEIGHT_MM;

// ── args ──────────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const hasFlag = (n) => argv.includes(`--${n}`);
const getOpt = (n, def) => {
  const a = argv.find((x) => x.startsWith(`--${n}=`));
  return a ? a.slice(`--${n}=`.length) : def;
};
const opts = {
  csvPath: getOpt("isbn-csv", process.env.GOODREADS_CSV_PATH || ""),
  dryRun: hasFlag("dry-run"),
  force: hasFlag("force"),
  limit: parseInt(getOpt("limit", ""), 10) || Infinity,
  offset: parseInt(getOpt("offset", ""), 10) || 0,
  only: (getOpt("only", "") || "").split(",").map((s) => s.trim()).filter(Boolean),
};

// ── helpers ─────────────────────────────────────────────────────────────────
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function goodreadsId(link) {
  const m = String(link || "").match(/\/book\/show\/(\d+)/);
  return m ? m[1] : null;
}

// Binding AND page count. The page count is the cross-check that keeps Google
// from handing back an omnibus: where a cover URL pins the ISBN there is no
// Open Library page count to compare against, but that ISBN came from this same
// CSV row, so the row's own page count describes the same edition.
function loadBindingMap(csvPath) {
  return new Promise((resolve, reject) => {
    const map = new Map();
    createReadStream(csvPath)
      .pipe(csv())
      .on("data", (row) => {
        const id = String(row["Book Id"] || "").trim();
        if (id) map.set(id, {
          binding: (row.Binding || "").trim(),
          pages: parseInt(row["Number of Pages"], 10) || null,
        });
      })
      .on("end", () => resolve(map))
      .on("error", reject);
  });
}

// An `assets.cover` is either a full URL (hot-linked Open Library / Google) or a
// bare R2 key with an optional "?v=<token>" cache-bust suffix, which the front
// end expands at render time (src/app/image-url.js). This script fetches the
// image itself, so it has to do the same expansion — without it every
// R2-hosted cover fails with "Failed to parse URL from BOOK-…-cover.jpg".
function coverUrl(cover) {
  if (!cover) return null;
  if (cover.startsWith("http")) return cover;
  const base = process.env.VITE_R2_BASE_URL || "";
  if (!base) return null;
  const qi = cover.indexOf("?v=");
  const ver = qi !== -1 ? cover.slice(qi + 3) : null;
  const name = qi !== -1 ? cover.slice(0, qi) : cover;
  return `${base}/originals/${name}${ver ? `?v=${ver}` : ""}`;
}

// cover width/height ratio (w/h), or null if it can't be measured
async function coverAspect(url) {
  if (!url) return null;
  try {
    const res = await fetch(url, { headers: { "User-Agent": "bayfujimoto-archive/1.0 (book-dimensions)" } });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    const meta = await sharp(buf).metadata();
    if (!meta.width || !meta.height) return null;
    return meta.width / meta.height;
  } catch (err) {
    console.warn(`[dimensions] could not measure ${url}: ${err.message}`);
    return null;
  }
}

// Surgical front-matter write: inserts `dimensions` + `dimensions_estimated` (unquoted,
// matching existing ephemera records) just before the assets block. Touches only those lines.
function applyDimensions(raw, { dimensions, estimated, source }) {
  const m = raw.match(/^(---\r?\n)([\s\S]*?)(\r?\n---\r?\n?)([\s\S]*)$/);
  if (!m) throw new Error("front matter delimiters not found");
  const [, open, fmText, close, body] = m;
  const lines = fmText.split("\n");
  while (lines.length && lines[lines.length - 1].trim() === "") lines.pop();

  const setRaw = (key, value) => {
    const idx = lines.findIndex((l) => new RegExp(`^${key}:`).test(l));
    const line = `${key}: ${value}`;
    if (idx >= 0) { lines[idx] = line; return; }
    let at = lines.findIndex((l) => /^assets:\s*$/.test(l));
    if (at < 0) {
      const gl = lines.findIndex((l) => l.startsWith("goodreads_link:"));
      at = gl >= 0 ? gl + 1 : lines.length;
    }
    lines.splice(at, 0, line);
  };

  const dropRaw = (key) => {
    const idx = lines.findIndex((l) => new RegExp(`^${key}:`).test(l));
    if (idx >= 0) lines.splice(idx, 1);
  };

  setRaw("dimensions", dimensions);
  setRaw("dimensions_source", source);
  // A record upgrading from an estimate to a measured height must LOSE the flag,
  // or the card keeps showing "≈" over a real measurement.
  if (estimated) setRaw("dimensions_estimated", "true");
  else dropRaw("dimensions_estimated");
  return open + lines.join("\n") + close + body;
}

// ── main ──────────────────────────────────────────────────────────────────────
async function main() {
  let bindingMap = new Map();
  if (opts.csvPath) {
    try {
      bindingMap = await loadBindingMap(opts.csvPath);
      console.log(`[dimensions] loaded ${bindingMap.size} binding rows from ${opts.csvPath}`);
    } catch (err) {
      console.error(`[dimensions] could not read CSV ${opts.csvPath}: ${err.message}`);
      process.exit(1);
    }
  } else {
    console.warn("[dimensions] no --isbn-csv given — every book defaults to trade-paperback height");
  }

  let files = glob.sync(join(CONTENT_DIR, "*.md")).sort().slice(opts.offset);
  if (opts.only.length) {
    files = files.filter((f) => opts.only.includes(matter(readFileSync(f, "utf8")).data.id));
  }

  const summary = { bySource: {}, deltas: [], mismatches: [], googleErrors: 0, googleMismatch: 0,
                    written: 0, skipped: 0, noCover: 0, unmeasured: [] };
  if (!GOOGLE_KEY) console.warn("[dimensions] no GOOGLE_BOOKS_API_KEY in .env.local — Google tier will 429");
  let processed = 0;

  for (const file of files) {
    if (processed >= opts.limit) break;
    const raw = readFileSync(file, "utf8");
    const { data } = matter(raw);
    if (data.item_type !== "book") continue;

    const cover = data.assets?.cover;
    if (!cover) { summary.noCover++; continue; }
    if (data.dimensions && !opts.force) { summary.skipped++; continue; }
    processed++;

    const csvRow = bindingMap.get(goodreadsId(data.goodreads_link)) || {};
    const binding = csvRow.binding || "";

    // ── height: best source for the edition on screen ───────────────────────
    let height = null, source = null, estimated = true, detail = "";
    const edition = await resolveEdition(data);
    await sleep(120);

    if (edition.isbn13) {
      const g = await googleVolume(edition.isbn13, GOOGLE_KEY);
      await sleep(120);
      if (g.status) summary.googleErrors++;
      // Google's ISBN search can land on a different printing than the cover
      // shows — an omnibus, a library binding, a boxed set. Its page count is
      // the tell. Compare against the edition resolved from the cover id where
      // there is one; otherwise against the Goodreads row, which describes the
      // same edition the cover URL's ISBN came from. Without either, accept it:
      // refusing every unverifiable height would throw away most of the gain.
      //
      // The tolerance has to be wide. Catalogues routinely disagree by a dozen
      // pages on the SAME printing depending on whether front matter is counted
      // — The Road is 287 or 304, The Martian 369 or 384 — so a tight threshold
      // rejects almost every good match. What it must catch is a genuinely
      // different object: Hitchhiker's Guide at 208 pages against an 815-page
      // omnibus. Ignore any gap of 16 pages or less, then require the
      // disagreement to exceed a fifth of the larger count.
      const against = edition.pages || csvRow.pages || null;
      const gap = against && g.pages ? Math.abs(against - g.pages) : 0;
      const mismatched = gap > 16 && gap / Math.max(against, g.pages) > 0.20;
      if (g.heightMm && !mismatched) {
        height = g.heightMm; source = "google"; estimated = false;
      } else {
        if (mismatched) {
          summary.googleMismatch++;
          summary.mismatches.push(`${data.id}  ${data.title.slice(0, 40)} — cover edition ${against}pp vs Google ${g.pages}pp`);
        }
        const m = await marcHeightMm(edition.isbn13);
        await sleep(120);
        if (m.heightMm) { height = m.heightMm; source = "marc"; detail = `300$c ${m.stated}`; }
      }
    }
    if (height === null) {
      height = heightForBinding(binding);
      source = "binding";
      detail = binding || "(unknown→trade)";
    }

    const aspect = await coverAspect(coverUrl(cover));
    await sleep(150); // be polite to the cover host

    if (!aspect) {
      summary.unmeasured.push(`${data.id}  "${data.title}"`);
      console.log(`[skip]  ${data.id}  "${data.title}" — cover not measurable`);
      continue;
    }

    const width = Math.round(height * aspect);
    const dimensions = `${width} x ${height}`;
    summary.bySource[source] = (summary.bySource[source] || 0) + 1;

    const was = data.dimensions || "";
    const changed = was && was.replace(/\s+/g, " ").trim() !== dimensions;
    if (changed) {
      const prevH = parseFloat(String(was).split("x")[1]);
      if (Number.isFinite(prevH)) summary.deltas.push({ id: data.id, title: data.title, from: prevH, to: height });
    }
    console.log(
      `[${source.padEnd(7)}] ${data.id}  ${dimensions.padEnd(11)} mm` +
      `${changed ? `  (was ${was})` : ""}${detail ? `  [${detail}]` : ""}  ${data.title}`);

    if (!opts.dryRun) writeFileSync(file, applyDimensions(raw, { dimensions, estimated, source }));
    summary.written++;
  }

  console.log("\n──────── summary ────────");
  console.log(opts.dryRun ? "(dry run — nothing written)" : `wrote ${summary.written} file(s)`);
  for (const [b, n] of Object.entries(summary.bySource)) console.log(`  height from ${b}: ${n}`);
  if (summary.googleMismatch) {
    console.log(`  google refused (page count disagreed): ${summary.googleMismatch}`);
    for (const m of summary.mismatches.slice(0, 10)) console.log(`      ${m}`);
  }
  if (summary.googleErrors) console.log(`  google errors: ${summary.googleErrors}`);
  if (summary.deltas.length) {
    summary.deltas.sort((a, b) => Math.abs(b.to - b.from) - Math.abs(a.to - a.from));
    const big = summary.deltas.filter((d) => Math.abs(d.to - d.from) >= 10);
    console.log(`\n  ${summary.deltas.length} heights changed, ${big.length} by 10 mm or more:`);
    for (const d of summary.deltas.slice(0, 15)) {
      console.log(`    ${String(d.from).padStart(3)} → ${String(d.to).padStart(3)} mm  ${d.title.slice(0, 44)}`);
    }
  }
  console.log(`  skipped (already sized): ${summary.skipped}`);
  console.log(`  no cover (left unsized): ${summary.noCover}`);
  if (summary.unmeasured.length) {
    console.log(`\n⚠ ${summary.unmeasured.length} covers could not be measured:`);
    summary.unmeasured.forEach((l) => console.log(`  ${l}`));
  }
}

main().catch((err) => {
  console.error("[dimensions]", err);
  process.exit(1);
});
