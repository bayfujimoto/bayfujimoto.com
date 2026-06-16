#!/usr/bin/env node
// Estimates each book's true physical size and writes it to front matter as
// `dimensions: <W> x <H>` (mm) plus `dimensions_estimated: true`. This drives both
// the books-grid scaling and the calibrated plate in the detail view (both read
// `item.dimensions` in src/app/panels.js).
//
// Exact dimensions aren't available for most books (Open Library has them for ~7%),
// so size is ESTIMATED: height from the book's binding/format (Goodreads CSV), width
// from the cover image's aspect ratio (measured with sharp). Digital editions default
// to a typical trade-paperback height.
//
// Usage:
//   node scripts/enrich-book-dimensions.js --isbn-csv="Goodreads Library Export.csv"
//   node scripts/enrich-book-dimensions.js --isbn-csv=... --dry-run --limit=12
//   node scripts/enrich-book-dimensions.js --only=BOOK-2026-160 --force
//
// Flags: --isbn-csv=PATH (provides Binding by Book Id) · --dry-run · --limit=N
//        --only=IDS (comma-separated) · --force (re-estimate books that already have it)

import { readFileSync, writeFileSync, createReadStream } from "fs";
import { join } from "path";
import { glob } from "glob";
import matter from "gray-matter";
import csv from "csv-parser";
import sharp from "sharp";

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
  only: (getOpt("only", "") || "").split(",").map((s) => s.trim()).filter(Boolean),
};

// ── helpers ─────────────────────────────────────────────────────────────────
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function goodreadsId(link) {
  const m = String(link || "").match(/\/book\/show\/(\d+)/);
  return m ? m[1] : null;
}

function loadBindingMap(csvPath) {
  return new Promise((resolve, reject) => {
    const map = new Map();
    createReadStream(csvPath)
      .pipe(csv())
      .on("data", (row) => {
        const id = String(row["Book Id"] || "").trim();
        if (id) map.set(id, (row.Binding || "").trim());
      })
      .on("end", () => resolve(map))
      .on("error", reject);
  });
}

// cover width/height ratio (w/h), or null if it can't be measured
async function coverAspect(url) {
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
function applyDimensions(raw, { dimensions, estimated }) {
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

  setRaw("dimensions", dimensions);
  if (estimated) setRaw("dimensions_estimated", "true");
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

  let files = glob.sync(join(CONTENT_DIR, "*.md")).sort();
  if (opts.only.length) {
    files = files.filter((f) => opts.only.includes(matter(readFileSync(f, "utf8")).data.id));
  }

  const summary = { byBinding: {}, written: 0, skipped: 0, noCover: 0, unmeasured: [] };
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

    const binding = bindingMap.get(goodreadsId(data.goodreads_link)) || "";
    const height = heightForBinding(binding);
    const aspect = await coverAspect(cover);
    await sleep(150); // be polite to the cover host

    if (!aspect) {
      summary.unmeasured.push(`${data.id}  "${data.title}"`);
      console.log(`[skip]  ${data.id}  "${data.title}" — cover not measurable`);
      continue;
    }

    const width = Math.round(height * aspect);
    const dimensions = `${width} x ${height}`;
    const label = binding || "(unknown→trade)";
    summary.byBinding[label] = (summary.byBinding[label] || 0) + 1;
    console.log(`[ok]    ${data.id}  ${dimensions} mm   [${label}]   ${data.title}`);

    if (!opts.dryRun) writeFileSync(file, applyDimensions(raw, { dimensions, estimated: true }));
    summary.written++;
  }

  console.log("\n──────── summary ────────");
  console.log(opts.dryRun ? "(dry run — nothing written)" : `wrote ${summary.written} file(s)`);
  for (const [b, n] of Object.entries(summary.byBinding)) console.log(`  ${b}: ${n}`);
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
