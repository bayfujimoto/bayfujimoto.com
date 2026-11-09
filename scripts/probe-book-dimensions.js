#!/usr/bin/env node
// Read-only survey: for every book record, work out WHICH EDITION the cover on
// the site actually is, then ask each candidate source whether it knows that
// edition's physical size. Writes nothing — it prints a coverage table so the
// choice of source can be made on measured numbers rather than assumption.
//
// Why it exists: dimensions today are ESTIMATED — height from the Goodreads
// binding, width from the cover's aspect ratio (scripts/enrich-book-dimensions.js).
// Every record carries `dimensions_estimated: true`. Real per-edition sizes would
// retire that flag for the records a source can cover.
//
// Edition identity — the hard half, and it is free:
//   · cover is …/b/isbn/<isbn>.jpg  → that ISBN *is* the edition on screen.
//   · cover is …/b/id/<cover_i>.jpg → search.json `cover_i:<id>` gives the work,
//     works/<key>/editions.json gives its editions, and exactly one carries that
//     cover id. Its isbn_13 is the edition on screen. (Verified on samples:
//     one match each, never ambiguous.)
//   · no cover → nothing to match; these keep the estimate.
//
// Note this also surfaces a real inconsistency: the Goodreads binding describes
// the edition Bay READ, which is not always the edition whose cover the site
// SHOWS. Night Sky with Exit Wounds is Paperback/89pp in the CSV and hardcover/
// 106pp for the cover displayed. Where they disagree, the shown edition is the
// one the grid is drawing at true scale.
//
// Sources probed:
//   · Open Library edition `physical_dimensions` — free, keyless, but sparse
//     (measured at 2/40 on this library's own ISBNs).
//   · Google Books `volumeInfo.dimensions` (height/width/thickness, cm) — free
//     with an API key, 1,000 requests/day. Reads GOOGLE_BOOKS_API_KEY from
//     .env.local (same name scripts/utils/book-covers.js already uses, so one
//     key serves both); without it the endpoint is shared and rate-limited and
//     the run reports 429s.
//   · K10plus SRU, MARC 300$c — free, keyless, no bot wall. Height alone, which
//     is all that is needed: width already comes from the cover's aspect ratio.
//
// A caveat that decides how far 300$c can be trusted. Cataloguing convention
// (AACR2 2.5D1, RDA 3.5.1.4) records height in whole centimetres ROUNDED UP:
// "21 cm" means over 20 and up to 21. So the figure carries up to 10 mm of
// error, biased high — this probe subtracts 5 mm to centre it and reports the
// result as low-precision. At grid scale (~0.7 px/mm) 10 mm is about 7 px; on
// the inspection plate, where a ruler is drawn beside the reproduction, it is a
// precision claim the source cannot support. Measured on 20 of this library's
// ISBNs, K10plus carried a 300$c for 5 — and several of those matched an ebook
// record rather than the printed edition, so the field needs an edition check
// before it is believed.
//
// Usage:
//   node scripts/probe-book-dimensions.js
//   node scripts/probe-book-dimensions.js --limit=25 --offset=50 --json=probe.json
//
// Flags: --limit=N · --only=IDS · --throttle=MS (default 350) · --json=PATH

import { readFileSync, writeFileSync, existsSync } from "fs";
import { glob } from "glob";
import matter from "gray-matter";

const CONTENT_DIR = "src/content/consumption/books";

// Load .env.local for local runs, as the film/R2 scripts do. Existing
// process.env values win, so an exported key is never overwritten.
if (existsSync(".env.local")) {
  for (const line of readFileSync(".env.local", "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}
const GOOGLE_KEY = process.env.GOOGLE_BOOKS_API_KEY || "";

const argv = process.argv.slice(2);
const getOpt = (n, def) => {
  const a = argv.find((x) => x.startsWith(`--${n}=`));
  return a ? a.slice(`--${n}=`.length) : def;
};
const opts = {
  limit: parseInt(getOpt("limit", ""), 10) || Infinity,
  offset: parseInt(getOpt("offset", ""), 10) || 0,
  only: (getOpt("only", "") || "").split(",").map((s) => s.trim()).filter(Boolean),
  throttleMs: parseInt(getOpt("throttle", ""), 10) || 350,
  jsonPath: getOpt("json", ""),
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function getJSON(url) {
  try {
    const res = await fetch(url, { headers: { "User-Agent": "bayfujimoto.com probe (contact: bayfujimoto@gmail.com)" } });
    if (!res.ok) return { _status: res.status };
    return await res.json();
  } catch (e) {
    return { _error: String(e.message || e).slice(0, 80) };
  }
}

// ── edition identity ────────────────────────────────────────────────────────
const isbnFromCoverUrl = (cover) => (cover || "").match(/\/b\/isbn\/(\d{9,13}[\dXx]?)/)?.[1] || null;
const coverIdFromUrl  = (cover) => (cover || "").match(/\/b\/id\/(\d+)/)?.[1] || null;

async function editionFromCoverId(coverId) {
  const search = await getJSON(
    `https://openlibrary.org/search.json?q=cover_i%3A${coverId}&fields=key&limit=1`);
  const workKey = search?.docs?.[0]?.key;
  if (!workKey) return null;
  const eds = await getJSON(`https://openlibrary.org${workKey}/editions.json?limit=50`);
  const match = (eds?.entries || []).find((e) => (e.covers || []).includes(Number(coverId)));
  if (!match) return null;
  return {
    isbn13: (match.isbn_13 || [])[0] || null,
    format: match.physical_format || null,
    pages: match.number_of_pages || null,
    dimensions: match.physical_dimensions || null,
    key: match.key,
  };
}

// ── sources ─────────────────────────────────────────────────────────────────
async function openLibraryDims(isbn) {
  const d = await getJSON(`https://openlibrary.org/isbn/${isbn}.json`);
  if (d?._status || d?._error) return { status: d._status || d._error };
  return { dimensions: d.physical_dimensions || null, format: d.physical_format || null, pages: d.number_of_pages || null };
}

// TWO requests, not one. The `volumes?q=` search response returns a TRIMMED
// volumeInfo with `dimensions` omitted — it is only present on the individual
// volume resource. Searching alone reports 0% coverage and is how this was very
// nearly written off; fetching the volume returns height, width AND thickness.
// Budget accordingly: 2 calls per book, ~316 for the whole library, against a
// 1,000/day quota.
async function googleDims(isbn) {
  const key = GOOGLE_KEY ? `&key=${GOOGLE_KEY}` : "";
  const found = await getJSON(`https://www.googleapis.com/books/v1/volumes?q=isbn:${isbn}&country=US${key}`);
  if (found?._status || found?._error) return { status: found._status || found._error };
  if (found?.error) return { status: found.error.code };
  const item = (found.items || [])[0];
  if (!item) return { dimensions: null };

  await sleep(opts.throttleMs);
  const full = await getJSON(`https://www.googleapis.com/books/v1/volumes/${item.id}?country=US${key}`);
  if (full?._status || full?._error) return { status: full._status || full._error };
  if (full?.error) return { status: full.error.code };
  const info = full.volumeInfo || {};
  return {
    dimensions: info.dimensions || null,
    pages: info.pageCount || null,
    volumeId: item.id,
    printType: info.printType || null,
  };
}

async function marcHeight(isbn) {
  const url = "https://sru.k10plus.de/gvk?version=1.1&operation=searchRetrieve"
    + `&query=pica.isb%3D${isbn}&maximumRecords=1&recordSchema=marcxml`;
  let xml;
  try {
    const res = await fetch(url);
    if (!res.ok) return { status: res.status };
    xml = await res.text();
  } catch (e) { return { status: String(e.message || e).slice(0, 60) }; }

  const field = xml.match(/<datafield tag="300"[\s\S]*?<\/datafield>/);
  if (!field) return { height: null };
  const subs = {};
  for (const m of field[0].matchAll(/<subfield code="(\w)">([\s\S]*?)<\/subfield>/g)) subs[m[1]] = m[2];

  // Reject a record describing a digital edition — its 300$a says so, and its
  // height (if any) is not the object the grid is drawing.
  if (/online resource|elektronische ressource/i.test(subs.a || "")) return { height: null, digital: true };

  const cm = (subs.c || "").match(/(\d+(?:[.,]\d+)?)\s*cm/);
  if (!cm) return { height: null };
  const stated = parseFloat(cm[1].replace(",", "."));
  // Centre the rounded-up figure: "21 cm" means (20, 21], midpoint 20.5.
  return { height: Math.round(stated * 10 - 5), stated: subs.c, extent: subs.a || null };
}

// ── run ─────────────────────────────────────────────────────────────────────
const files = (await glob(`${CONTENT_DIR}/*.md`)).sort().slice(opts.offset);
const rows = [];
let n = 0;

for (const file of files) {
  if (n >= opts.limit) break;
  const { data } = matter(readFileSync(file, "utf8"));
  if (opts.only.length && !opts.only.includes(data.id)) continue;
  n++;

  const cover = data.assets?.cover || "";
  const row = { id: data.id, title: data.title, current: data.dimensions || null, source: null, isbn13: null };

  // which edition is on screen?
  const urlIsbn = isbnFromCoverUrl(cover);
  const coverId = coverIdFromUrl(cover);
  if (urlIsbn) {
    row.isbn13 = urlIsbn; row.source = "cover-url isbn";
  } else if (coverId) {
    const ed = await editionFromCoverId(coverId);
    await sleep(opts.throttleMs);
    if (ed?.isbn13) {
      row.isbn13 = ed.isbn13; row.source = "cover-id → edition";
      row.shownFormat = ed.format; row.shownPages = ed.pages;
      if (ed.dimensions) row.ol = ed.dimensions;
    } else {
      row.source = "cover-id unresolved";
    }
  } else if (data.isbn13) {
    row.isbn13 = String(data.isbn13); row.source = "record isbn13 (cover not pinned)";
  } else {
    row.source = "no edition identity";
  }

  if (row.isbn13) {
    if (!row.ol) {
      const ol = await openLibraryDims(row.isbn13);
      row.ol = ol.dimensions || null; row.olStatus = ol.status || null;
      await sleep(opts.throttleMs);
    }
    const g = await googleDims(row.isbn13);
    row.google = g.dimensions || null; row.googleStatus = g.status || null;
    row.googlePages = g.pages || null; row.googleVolume = g.volumeId || null;
    // Google's ISBN search can land on a different printing than the cover
    // shows. Where its page count disagrees with the edition resolved from the
    // cover, the dimension describes some other object — flag, do not trust.
    if (row.shownPages && g.pages && Math.abs(row.shownPages - g.pages) > 8) row.pageMismatch = true;
    await sleep(opts.throttleMs);
    const m = await marcHeight(row.isbn13);
    row.marcHeight = m.height || null; row.marcStated = m.stated || null;
    row.marcDigital = m.digital || false; row.marcStatus = m.status || null;
    await sleep(opts.throttleMs);
  }

  rows.push(row);
  const mark = row.google ? "G" : row.ol ? "O" : row.marcHeight ? "M" : "·";
  const found = row.google ? JSON.stringify(row.google)
    : row.ol ? row.ol
    : row.marcHeight ? `${row.marcHeight} mm high (300$c ${row.marcStated}, ±5 mm)`
    : "";
  process.stdout.write(
    `${mark} ${String(row.id).padEnd(14)} ${String(row.source).padEnd(32)} ${found}\n`);
}

// ── report ──────────────────────────────────────────────────────────────────
const identified = rows.filter((r) => r.isbn13).length;
const pinned = rows.filter((r) => r.source === "cover-url isbn" || r.source === "cover-id → edition").length;
const olHit = rows.filter((r) => r.ol).length;
const gHit = rows.filter((r) => r.google).length;
const mHit = rows.filter((r) => r.marcHeight).length;
const gMismatch = rows.filter((r) => r.google && r.pageMismatch).length;
const mDigital = rows.filter((r) => r.marcDigital).length;
const either = rows.filter((r) => r.ol || r.google || r.marcHeight).length;
const gErr = rows.filter((r) => r.googleStatus).length;

console.log(`
── coverage over ${rows.length} records ──────────────────────────────────
edition identified            ${identified}  (${pct(identified, rows.length)})
  …and provably the cover shown ${pinned}  (${pct(pinned, rows.length)})
Open Library physical_dimensions ${olHit}  (${pct(olHit, rows.length)})
Google Books dimensions          ${gHit}  (${pct(gHit, rows.length)})
  …of those, page count disagrees  ${gMismatch}  — different printing, dimension suspect
MARC 300$c height (±5 mm)        ${mHit}  (${pct(mHit, rows.length)})${mDigital ? `  — ${mDigital} more matched a digital edition and were rejected` : ""}
any source                       ${either}  (${pct(either, rows.length)})
${gErr ? `\nGoogle returned an error for ${gErr} records — add GOOGLE_BOOKS_API_KEY to .env.local if these are 429s.` : ""}
Records with no usable source keep the binding estimate and their
\`dimensions_estimated: true\` flag.`);

function pct(a, b) { return b ? `${Math.round((a / b) * 100)}%` : "—"; }

if (opts.jsonPath) {
  writeFileSync(opts.jsonPath, JSON.stringify(rows, null, 2));
  console.log(`\nwrote ${opts.jsonPath}`);
}
