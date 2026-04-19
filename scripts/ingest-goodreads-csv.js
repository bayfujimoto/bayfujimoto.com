#!/usr/bin/env node
// Ingests Goodreads CSV export (from https://www.goodreads.com/review/import)
// Writes new .md files to src/content/consumption/books/ for any entries not already present.
//
// Safe to run repeatedly — skips files that already exist (matched by goodreads_link).
//
// Usage:
//   npm run ingest:books:csv
//   GOODREADS_CSV_PATH=/custom/path.csv npm run ingest:books:csv

import { existsSync, writeFileSync, readFileSync } from "fs";
import { join } from "path";
import { glob } from "glob";
import csv from "csv-parser";
import { createReadStream } from "fs";

const CONTENT_DIR = "src/content/consumption/books";
const COUNTERS_PATH = "src/content/_id-counters.yaml";
const CSV_PATH = process.env.GOODREADS_CSV_PATH || "Goodreads Library Export.csv";

// --- Helpers ---

function slugify(str) {
  return str
    .toLowerCase()
    .replace(/['']/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function buildSlug(title, year, dateRead) {
  const titleSlug = slugify(title);
  const readYear = dateRead.getFullYear();
  return `${titleSlug}-${readYear}-read`;
}

function readCounters() {
  const raw = readFileSync(COUNTERS_PATH, "utf8");
  const counters = {};
  for (const line of raw.trim().split("\n")) {
    if (!line.trim()) continue;
    const [k, v] = line.split(":").map((s) => s.trim());
    counters[k] = parseInt(v, 10);
  }
  return counters;
}

function writeCounters(counters) {
  const lines = Object.entries(counters).map(([k, v]) => `${k}: ${v}`);
  writeFileSync(COUNTERS_PATH, lines.join("\n") + "\n");
}

function nextId(counters) {
  counters.BOOK = (counters.BOOK || 0) + 1;
  const year = new Date().getFullYear();
  return `BOOK-${year}-${String(counters.BOOK).padStart(3, "0")}`;
}

function displayDate(date) {
  const months = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];
  const y = date.getFullYear();
  const m = date.getMonth();
  const d = date.getDate();
  return `${months[m]} ${d}, ${y}`;
}

function buildMarkdown(fields) {
  const tagsYaml =
    fields.tags.length > 0
      ? "\ntags:\n" + fields.tags.map((t) => `  - "${t.replace(/"/g, '\\"')}"`).join("\n")
      : "";

  const assetsYaml = fields.cover
    ? `assets:\n  cover: "${fields.cover}"`
    : "";

  const yearLine = fields.year ? `year: "${fields.year}"\n` : "";
  const ratingLine = fields.rating > 0 ? `rating: ${fields.rating}\n` : "";

  const front = `---
id: ${fields.id}
slug: ${fields.slug}
title: "${fields.title.replace(/"/g, '\\"')}"
series: consumption
subcollection: books
item_type: book
status: published
author: "${fields.author.replace(/"/g, '\\"')}"
${yearLine}date_read: "${fields.date_read}"
display_date: "${fields.display_date}"
sort_date: "${fields.sort_date}"
${ratingLine}goodreads_link: "${fields.goodreads_link}"${tagsYaml}
${assetsYaml ? "\n" + assetsYaml : ""}
---`;

  return `${front}\n`;
}

// --- CSV parsing helpers ---

function parseDate(dateStr) {
  if (!dateStr) return null;
  // Format: "YYYY/MM/DD" or empty
  const parts = dateStr.split("/");
  if (parts.length !== 3) return null;
  return new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
}

function buildGoodreadsLink(bookId) {
  return `https://www.goodreads.com/book/show/${bookId}`;
}

// --- Main ---

async function main() {
  if (!existsSync(CSV_PATH)) {
    console.error(`[ingest-goodreads-csv] CSV file not found: ${CSV_PATH}`);
    process.exit(1);
  }

  console.log(`[ingest-goodreads-csv] Reading ${CSV_PATH}`);

  // Build a set of all existing goodreads_links to check for duplicates
  const existingLinks = new Set();
  const existingFiles = glob.sync(join(CONTENT_DIR, "*.md"));
  for (const file of existingFiles) {
    const raw = readFileSync(file, "utf8");
    const match = raw.match(/goodreads_link: "([^"]*)"/);
    if (match) {
      existingLinks.add(match[1]);
    }
  }

  const counters = readCounters();
  let newCount = 0;
  let skipCount = 0;
  const rows = [];

  // Parse CSV and collect rows
  return new Promise((resolve) => {
    createReadStream(CSV_PATH)
      .pipe(csv())
      .on("data", (row) => rows.push(row))
      .on("end", () => {
        console.log(`[ingest-goodreads-csv] ${rows.length} rows in CSV`);

        // Filter to only "read" shelf entries with a date read
        const readBooks = rows.filter(
          (row) => row["Exclusive Shelf"] === "read" && row["Date Read"]
        );

        console.log(`[ingest-goodreads-csv] ${readBooks.length} books with read status and date`);

        for (const row of readBooks) {
          const title = row.Title || "";
          const author = row.Author || "Unknown";

          if (!title) {
            skipCount++;
            continue;
          }

          const bookId = row["Book Id"];
          const goodreads_link = buildGoodreadsLink(bookId);

          // Check if this book already exists
          if (existingLinks.has(goodreads_link)) {
            skipCount++;
            continue;
          }

          const dateRead = parseDate(row["Date Read"]);
          if (!dateRead) {
            skipCount++;
            continue;
          }

          const rating = parseInt(row["My Rating"], 10) || 0;
          const year = row["Year Published"] || "";
          const slug = buildSlug(title, year, dateRead);

          const id = nextId(counters);
          const sortDateStr = dateRead.toISOString().split("T")[0];

          const fields = {
            id,
            slug,
            title,
            author,
            year,
            date_read: sortDateStr,
            display_date: displayDate(dateRead),
            sort_date: sortDateStr,
            rating,
            goodreads_link,
            cover: "",
            tags: [],
          };

          const outPath = join(CONTENT_DIR, `${id}-${slug}.md`);
          writeFileSync(outPath, buildMarkdown(fields));
          newCount++;
          console.log(`[ingest-goodreads-csv] + "${title}" by ${author} — ${sortDateStr}`);
        }

        if (newCount > 0) {
          writeCounters(counters);
        }

        console.log(`[ingest-goodreads-csv] Done. ${newCount} new, ${skipCount} skipped.`);
        resolve();
      });
  });
}

main().catch((err) => {
  console.error("[ingest-goodreads-csv]", err);
  process.exit(1);
});
