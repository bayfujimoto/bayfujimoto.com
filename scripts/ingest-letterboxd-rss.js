#!/usr/bin/env node
// Fetches the Letterboxd RSS feed and writes new .md files to
// src/content/consumption/films/ for any entries not already present.
//
// Runs automatically before every build (see package.json build/dev scripts).
// Safe to run repeatedly — skips files that already exist.
//
// Requires:
//   LETTERBOXD_USERNAME  (default: bayf)
//   TMDB_API_KEY         (optional; skipped with a warning if absent)

import { existsSync, writeFileSync, readFileSync } from "fs";
import { join } from "path";
import { glob } from "glob";
import RSSParser from "rss-parser";
import { watchedDateToCentral } from "./utils/letterboxd-timezone.js";
import { fetchBackdrop } from "./utils/tmdb.js";

const CONTENT_DIR = "src/content/consumption/films";
const COUNTERS_PATH = "src/content/_id-counters.yaml";
const USERNAME = process.env.LETTERBOXD_USERNAME || "bayf";

const parser = new RSSParser({
  customFields: {
    item: [
      ["letterboxd:watchedDate", "watchedDate"],
      ["letterboxd:filmTitle", "filmTitle"],
      ["letterboxd:filmYear", "filmYear"],
      ["letterboxd:memberRating", "memberRating"],
      ["letterboxd:rewatch", "rewatch"],
    ],
  },
});

// --- Helpers (shared logic with CSV script) ---

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

// --- RSS parsing helpers ---

function extractTitle(rssTitle) {
  // RSS title format: "Film Title, Year - ★★★½" or "Film Title, Year"
  return rssTitle.replace(/,\s*\d{4}.*$/, "").trim();
}

function extractYear(rssTitle) {
  const m = rssTitle.match(/,\s*(\d{4})/);
  return m ? m[1] : "";
}

function extractRating(item) {
  // memberRating is a float like "3.5" from the custom RSS field
  if (item.memberRating) return parseFloat(item.memberRating) || 0;
  // Fallback: count stars in content
  const content = item.content || item["content:encoded"] || "";
  const stars = content.match(/★/g);
  const halfStar = content.includes("½") ? 0.5 : 0;
  return stars ? stars.length + halfStar : 0;
}

function extractPoster(item) {
  const content = item.content || item["content:encoded"] || "";
  const m = content.match(/<img[^>]+src="([^">]+)"/);
  return m ? m[1] : "";
}

// --- Main ---

async function main() {
  if (!process.env.TMDB_API_KEY) {
    console.warn("[ingest-rss] TMDB_API_KEY not set — backdrops will be skipped");
  }

  const url = `https://letterboxd.com/${USERNAME}/rss/`;
  console.log(`[ingest-rss] Fetching ${url}`);

  let feed;
  try {
    feed = await parser.parseURL(url);
  } catch (err) {
    console.error(`[ingest-rss] Failed to fetch RSS: ${err.message}`);
    // Non-fatal: don't fail the build if Letterboxd is unreachable
    process.exit(0);
  }

  const filmItems = feed.items.filter(
    (item) => item.link && item.link.includes("/film/")
  );
  console.log(`[ingest-rss] ${filmItems.length} film entries in feed`);

  // Build a set of all existing letterboxd_links to check for duplicates
  const existingLinks = new Set();
  const existingFiles = glob.sync(join(CONTENT_DIR, "*.md"));
  for (const file of existingFiles) {
    const raw = readFileSync(file, "utf8");
    // Extract letterboxd_link from front matter
    const match = raw.match(/letterboxd_link: "([^"]*)"/);
    if (match) {
      existingLinks.add(match[1]);
    }
  }

  const counters = readCounters();
  let newCount = 0;
  let skipCount = 0;

  for (const item of filmItems) {
    const title = item.filmTitle || extractTitle(item.title || "");
    const year = item.filmYear || extractYear(item.title || "");

    if (!title) {
      skipCount++;
      continue;
    }

    const letterboxd_link = item.link || "";

    // Check if this film already exists by its letterboxd link
    if (letterboxd_link && existingLinks.has(letterboxd_link)) {
      skipCount++;
      continue;
    }

    // Use watchedDate (actual viewing date) over pubDate (when logged)
    let watchDate;
    if (item.watchedDate) {
      watchDate = watchedDateToCentral(item.watchedDate);
    } else {
      // pubDate fallback: convert to Central Time date
      const d = new Date(item.pubDate);
      watchDate = watchedDateToCentral(
        d.toISOString().split("T")[0]
      );
    }

    const slug = buildSlug(title, year, watchDate);

    const rating = extractRating(item);
    const rewatch = item.rewatch === "Yes";
    const poster = extractPoster(item);
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
      tags: [],
      backdrop,
      poster,
    };

    writeFileSync(outPath, buildMarkdown(fields, ""));
    newCount++;
    console.log(`[ingest-rss] + ${title} (${year}) — ${watchDate}`);
  }

  if (newCount > 0) {
    writeCounters(counters);
  }

  console.log(`[ingest-rss] Done. ${newCount} new, ${skipCount} skipped.`);
}

main().catch((err) => {
  console.error("[ingest-rss]", err);
  // Non-fatal: don't abort the build
  process.exit(0);
});
