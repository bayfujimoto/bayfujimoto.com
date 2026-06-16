#!/usr/bin/env node
// Resolves a sharp, stable cover for every book record and writes it into the
// record's front matter (assets.cover), hot-linking the resolved URL. ISBNs are
// backfilled from a Goodreads library CSV export and persisted (isbn13/isbn) so
// future runs don't need the CSV again.
//
// Resolution order lives in scripts/utils/book-covers.js: Open Library by ISBN →
// Google Books by ISBN → Google Books by title+author → existing Goodreads cover
// stripped to full-res.
//
// Usage:
//   node scripts/enrich-book-covers.js --isbn-csv="Goodreads Library Export.csv"
//   node scripts/enrich-book-covers.js --strip-only            # quick win, no network
//   node scripts/enrich-book-covers.js --isbn-csv=... --dry-run --limit=5
//   node scripts/enrich-book-covers.js --only=BOOK-2026-160,BOOK-2026-169
//
// Flags:
//   --isbn-csv=PATH   Goodreads CSV export (provides ISBN/ISBN13 by Book Id)
//   --strip-only      only upgrade existing gr-assets covers to full-res (no API calls)
//   --dry-run         print what would change; write nothing
//   --limit=N         process at most N candidate books
//   --only=IDS        comma-separated record ids (e.g. BOOK-2026-160)
//   --force           re-resolve books that already have a resolved cover
//   --no-cache        ignore the local .cache/book-covers resolution cache
//   --throttle=MS     ms between network calls (default 1100)

import { readFileSync, writeFileSync, createReadStream } from "fs";
import { join } from "path";
import { glob } from "glob";
import matter from "gray-matter";
import csv from "csv-parser";
import { resolveCover, stripGoodreadsSize, cleanIsbn } from "./utils/book-covers.js";

const CONTENT_DIR = "src/content/consumption/books";

// ── args ──────────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const hasFlag = (n) => argv.includes(`--${n}`);
const getOpt = (n, def) => {
  const a = argv.find((x) => x.startsWith(`--${n}=`));
  return a ? a.slice(`--${n}=`.length) : def;
};

const opts = {
  csvPath: getOpt("isbn-csv", process.env.GOODREADS_CSV_PATH || ""),
  stripOnly: hasFlag("strip-only"),
  dryRun: hasFlag("dry-run"),
  force: hasFlag("force"),
  noCache: hasFlag("no-cache"),
  limit: parseInt(getOpt("limit", ""), 10) || Infinity,
  only: (getOpt("only", "") || "").split(",").map((s) => s.trim()).filter(Boolean),
  throttleMs: parseInt(getOpt("throttle", ""), 10) || 1100,
};

// ── helpers ─────────────────────────────────────────────────────────────────
const SIZE_TOKEN = /\._S[XY]\d+_(?=\.\w+$)/;

// A cover counts as "resolved" once it no longer carries a Goodreads size token.
const isResolved = (cover) => !!cover && !SIZE_TOKEN.test(cover);

function goodreadsId(link) {
  const m = String(link || "").match(/\/book\/show\/(\d+)/);
  return m ? m[1] : null;
}

function loadIsbnMap(csvPath) {
  return new Promise((resolve, reject) => {
    const map = new Map();
    createReadStream(csvPath)
      .pipe(csv())
      .on("data", (row) => {
        const id = String(row["Book Id"] || "").trim();
        if (!id) return;
        map.set(id, { isbn13: cleanIsbn(row.ISBN13), isbn: cleanIsbn(row.ISBN) });
      })
      .on("end", () => resolve(map))
      .on("error", reject);
  });
}

// Surgical front-matter write — replaces/inserts only the touched lines so the
// diff stays to a couple of lines per file (no YAML reserialization churn).
function applyFrontMatter(raw, updates) {
  const m = raw.match(/^(---\r?\n)([\s\S]*?)(\r?\n---\r?\n?)([\s\S]*)$/);
  if (!m) throw new Error("front matter delimiters not found");
  const [, open, fmText, close, body] = m;
  const lines = fmText.split("\n");

  // drop the trailing blank line the cover-less ingest template leaves behind
  while (lines.length && lines[lines.length - 1].trim() === "") lines.pop();

  const setScalar = (key, value) => {
    const idx = lines.findIndex((l) => new RegExp(`^${key}:`).test(l));
    const line = `${key}: "${value}"`;
    if (idx >= 0) { lines[idx] = line; return; }
    const anchor = lines.findIndex((l) => l.startsWith("goodreads_link:"));
    lines.splice(anchor >= 0 ? anchor + 1 : lines.length, 0, line);
  };

  // isbn first so the final order reads isbn13, isbn (both inserted after goodreads_link)
  if (updates.isbn) setScalar("isbn", updates.isbn);
  if (updates.isbn13) setScalar("isbn13", updates.isbn13);

  if (updates.cover) {
    const coverIdx = lines.findIndex((l) => /^\s+cover:\s/.test(l));
    if (coverIdx >= 0) {
      lines[coverIdx] = `  cover: "${updates.cover}"`;
    } else {
      const assetsIdx = lines.findIndex((l) => /^assets:\s*$/.test(l));
      if (assetsIdx >= 0) lines.splice(assetsIdx + 1, 0, `  cover: "${updates.cover}"`);
      else lines.push("assets:", `  cover: "${updates.cover}"`);
    }
  }

  return open + lines.join("\n") + close + body;
}

// ── main ──────────────────────────────────────────────────────────────────────
async function main() {
  let isbnMap = new Map();
  if (opts.csvPath && !opts.stripOnly) {
    try {
      isbnMap = await loadIsbnMap(opts.csvPath);
      console.log(`[enrich] loaded ${isbnMap.size} ISBN rows from ${opts.csvPath}`);
    } catch (err) {
      console.error(`[enrich] could not read CSV ${opts.csvPath}: ${err.message}`);
      process.exit(1);
    }
  } else if (!opts.stripOnly) {
    console.warn("[enrich] no --isbn-csv given — falling back to title+author matching (fuzzier)");
  }

  let files = glob.sync(join(CONTENT_DIR, "*.md")).sort();
  if (opts.only.length) {
    files = files.filter((f) => {
      const id = matter(readFileSync(f, "utf8")).data.id;
      return opts.only.includes(id);
    });
  }

  const summary = { bySource: {}, skipped: 0, unresolved: [], lowConfidence: [], written: 0 };
  let processed = 0;

  for (const file of files) {
    if (processed >= opts.limit) break;
    const raw = readFileSync(file, "utf8");
    const { data } = matter(raw);
    if (data.item_type !== "book") continue;

    const existingCover = data.assets?.cover || "";

    // ── strip-only quick win: upgrade existing gr-assets covers, no network ──
    if (opts.stripOnly) {
      if (existingCover && SIZE_TOKEN.test(existingCover)) {
        processed++;
        const upgraded = stripGoodreadsSize(existingCover);
        console.log(`[strip] ${data.id}  ${existingCover}\n        -> ${upgraded}`);
        if (!opts.dryRun) writeFileSync(file, applyFrontMatter(raw, { cover: upgraded }));
        summary.written++;
        summary.bySource["goodreads-stripped"] = (summary.bySource["goodreads-stripped"] || 0) + 1;
      }
      continue;
    }

    // ── full resolution ──
    if (!opts.force && isResolved(existingCover)) { summary.skipped++; continue; }
    processed++;

    const gid = goodreadsId(data.goodreads_link);
    const fromCsv = (gid && isbnMap.get(gid)) || {};
    const isbn13 = cleanIsbn(data.isbn13 || fromCsv.isbn13);
    const isbn = cleanIsbn(data.isbn || fromCsv.isbn);

    const res = await resolveCover(
      { title: data.title, author: data.author, isbn13, isbn, goodreadsCover: existingCover },
      { throttleMs: opts.throttleMs, noCache: opts.noCache }
    );

    if (!res) {
      summary.unresolved.push(`${data.id}  "${data.title}" — ${data.author}`);
      console.log(`[miss]  ${data.id}  "${data.title}" — no cover from any source`);
      continue;
    }

    const flag = res.confidence === "low" ? "  ⚠ LOW-CONFIDENCE" : "";
    console.log(`[ok]    ${data.id}  ${res.source}${flag}  ${res.url}\n        ${res.note}`);
    summary.bySource[res.source] = (summary.bySource[res.source] || 0) + 1;
    if (res.confidence === "low") {
      summary.lowConfidence.push(`${data.id}  "${data.title}" — ${res.note}  -> ${res.url}`);
    }

    const updates = { cover: res.url };
    if (isbn13 && !data.isbn13) updates.isbn13 = isbn13;
    if (isbn && !data.isbn) updates.isbn = isbn;

    if (!opts.dryRun) writeFileSync(file, applyFrontMatter(raw, updates));
    summary.written++;
  }

  // ── summary ──
  console.log("\n──────── summary ────────");
  console.log(opts.dryRun ? "(dry run — nothing written)" : `wrote ${summary.written} file(s)`);
  for (const [src, n] of Object.entries(summary.bySource)) console.log(`  ${src}: ${n}`);
  console.log(`  skipped (already resolved): ${summary.skipped}`);
  if (summary.lowConfidence.length) {
    console.log(`\n⚠ ${summary.lowConfidence.length} low-confidence title matches — review:`);
    summary.lowConfidence.forEach((l) => console.log(`  ${l}`));
  }
  if (summary.unresolved.length) {
    console.log(`\n✗ ${summary.unresolved.length} unresolved (no cover found) — handle manually:`);
    summary.unresolved.forEach((l) => console.log(`  ${l}`));
  }
}

main().catch((err) => {
  console.error("[enrich]", err);
  process.exit(1);
});
