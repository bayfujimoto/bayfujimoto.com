#!/usr/bin/env node
// Parses a Letterboxd data export folder and writes individual .md files
// to src/content/consumption/films/ — one file per diary entry.
//
// Usage:
//   node scripts/ingest-letterboxd-csv.js path/to/letterboxd-export-folder
//
// How to get your export:
//   1. Go to https://letterboxd.com/settings/data/
//   2. Request export → wait for email → download ZIP
//   3. Unzip, then: node scripts/ingest-letterboxd-csv.js letterboxd-export/
//   4. Delete the export folder after processing

import { createReadStream, existsSync, readFileSync, writeFileSync } from "fs";
import { join, resolve } from "path";
import { createInterface } from "readline";
import { watchedDateToCentral } from "./utils/letterboxd-timezone.js";
import { fetchBackdrop } from "./utils/tmdb.js";

// --- CSV parser (no external dep needed for simple CSVs, but we use csv-parser) ---
import csvParser from "csv-parser";

const exportFolder = process.argv[2];
if (!exportFolder) {
  console.error("Usage: node scripts/ingest-letterboxd-csv.js path/to/letterboxd-export-folder");
  process.exit(1);
}
if (!existsSync(exportFolder)) {
  console.error(`Export folder not found: ${exportFolder}`);
  process.exit(1);
}

const CONTENT_DIR = "src/content/consumption/films";
const COUNTERS_PATH = "src/content/_id-counters.yaml";
const USERNAME = process.env.LETTERBOXD_USERNAME || "bayf";

// --- Helpers ---

function slugify(str) {
  return str
    .toLowerCase()
    .replace(/['']/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function buildSlug(title, year, watchDate) {
  return `${slugify(title)}-${year}-${watchDate}`;
}

function readCounters() {
  const raw = readFileSync(COUNTERS_PATH, "utf8");
  const counters = {};
  for (const line of raw.trim().split("\n")) {
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
  counters.FILM = (counters.FILM || 0) + 1;
  const year = new Date().getFullYear();
  return `FILM-${year}-${String(counters.FILM).padStart(3, "0")}`;
}

function displayDate(dateStr) {
  // dateStr is YYYY-MM-DD
  const [y, m, d] = dateStr.split("-").map(Number);
  const months = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];
  return `${months[m - 1]} ${d}, ${y}`;
}

function buildMarkdown(fields, reviewText) {
  const tagsYaml =
    fields.tags.length > 0
      ? "\ntags:\n" + fields.tags.map((t) => `  - "${t.replace(/"/g, '\\"')}"`).join("\n")
      : "";

  const assetsYaml = [
    fields.backdrop ? `  backdrop: "${fields.backdrop}"` : "",
    fields.poster ? `  poster: "${fields.poster}"` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const front = `---
id: ${fields.id}
slug: ${fields.slug}
title: "${fields.title.replace(/"/g, '\\"')}"
series: consumption
subcollection: films
item_type: film
status: published
year: "${fields.year}"
director: ""
watch_date: "${fields.watch_date}"
display_date: "${fields.display_date}"
sort_date: "${fields.sort_date}"
rating: ${fields.rating}
rewatch: ${fields.rewatch}
letterboxd_link: "${fields.letterboxd_link}"${tagsYaml}
${assetsYaml ? "assets:\n" + assetsYaml : ""}
---`;

  return reviewText ? `${front}\n\n${reviewText.trim()}\n` : `${front}\n`;
}

// --- CSV parsing ---

function parseCsv(filePath) {
  return new Promise((resolve, reject) => {
    const rows = [];
    createReadStream(filePath)
      .pipe(csvParser())
      .on("data", (row) => rows.push(row))
      .on("end", () => resolve(rows))
      .on("error", reject);
  });
}

// --- Main ---

async function main() {
  console.log(`Parsing Letterboxd export from: ${exportFolder}\n`);

  const diaryPath = join(exportFolder, "diary.csv");
  if (!existsSync(diaryPath)) {
    console.error("diary.csv not found in export folder.");
    process.exit(1);
  }

  const rows = await parseCsv(diaryPath);
  console.log(`Read ${rows.length} diary entries`);

  const counters = readCounters();
  let newCount = 0;
  let skipCount = 0;

  for (const row of rows) {
    const title = row["Name"]?.trim();
    const year = row["Year"]?.trim() || "";
    const watchedDateRaw = row["Watched Date"] || row["Date"] || "";
    const uri = row["Letterboxd URI"] || "";

    if (!title || !watchedDateRaw) {
      skipCount++;
      continue;
    }

    const watchDate = watchedDateToCentral(watchedDateRaw);
    const slug = buildSlug(title, year, watchDate);
    const outPath = join(CONTENT_DIR, `${slug}.md`);

    if (existsSync(outPath)) {
      skipCount++;
      continue;
    }

    const rating = parseFloat(row["Rating"]) || 0;
    const rewatch = row["Rewatch"] === "Yes";
    const tags = (row["Tags"] || "")
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    const reviewText = row["Review"] || "";
    const letterboxd_link = uri;

    // Letterboxd poster from RSS isn't available in CSV export; leave blank
    const poster = "";
    const backdrop = await fetchBackdrop(title, year);

    const id = nextId(counters);

    const fields = {
      id,
      slug,
      title,
      year,
      watch_date: watchDate,
      display_date: displayDate(watchDate),
      sort_date: watchDate,
      rating,
      rewatch,
      letterboxd_link,
      tags,
      backdrop,
      poster,
    };

    writeFileSync(outPath, buildMarkdown(fields, reviewText));
    newCount++;

    if (newCount % 25 === 0) {
      console.log(`  Written ${newCount} files so far...`);
    }
  }

  writeCounters(counters);

  console.log(`\nDone. ${newCount} new file(s) written, ${skipCount} skipped.`);
  console.log(`FILM counter is now: ${counters.FILM}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
