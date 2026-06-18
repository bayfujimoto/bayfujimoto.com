#!/usr/bin/env node
// Fetches the Letterboxd RSS feed and writes new .md files to
// src/content/consumption/films/ for any entries not already present.
//
// Runs on a schedule via GitHub Actions (.github/workflows/ingest-films.yml),
// which commits any new records so each film's id/slug is assigned once and
// stays stable. Also runs in `npm run dev` for local preview. It is NOT part of
// the production build — the Netlify build serves only committed content.
// Safe to run repeatedly — skips viewings already present (see dedup below).
//
// Requires:
//   LETTERBOXD_USERNAME  (default: bayf)
//   TMDB_API_KEY         (optional; skipped with a warning if absent)

import { existsSync, writeFileSync, readFileSync } from "fs";
import { join } from "path";
import { glob } from "glob";
import matter from "gray-matter";
import RSSParser from "rss-parser";
import { watchedDateToCentral } from "./utils/letterboxd-timezone.js";
import { fetchBackdrop } from "./utils/tmdb.js";
import { fetchLetterboxdBackdrop } from "./utils/letterboxd-backdrop.js";

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

// Identity of a single viewing, independent of how the record was stored.
// A diary entry is uniquely (film, watch date); this is robust to the two
// link formats in the archive (full letterboxd.com URLs vs. boxd.it shorts)
// and to the two historical slug conventions (with/without the date).
function viewingKey(title, year, watchDate) {
  return `${slugify(title || "")}|${year || ""}|${watchDate || ""}`;
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

  // Index existing records two ways so an entry already in the archive is never
  // re-created: by viewing identity (title|year|watch_date) — the reliable key —
  // and by letterboxd_link as a secondary match. Link-only dedup was the source
  // of duplicate records: stored links come in two formats (boxd.it shorts and
  // full letterboxd.com URLs) and never matched the feed's full-URL links, so
  // films still in the RSS window were re-ingested under fresh ids on every build.
  const existingKeys = new Set();
  const existingLinks = new Set();
  const existingFiles = glob.sync(join(CONTENT_DIR, "*.md"));
  for (const file of existingFiles) {
    const { data } = matter(readFileSync(file, "utf8"));
    existingKeys.add(viewingKey(data.title, data.year, data.watch_date));
    if (data.letterboxd_link) existingLinks.add(String(data.letterboxd_link).trim());
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

    const letterboxd_link = item.link ? String(item.link).trim() : "";

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

    // Skip if this exact viewing already exists (by identity or by link).
    // Rewatches on a different date have a different key and are kept.
    if (
      existingKeys.has(viewingKey(title, year, watchDate)) ||
      (letterboxd_link && existingLinks.has(letterboxd_link))
    ) {
      skipCount++;
      continue;
    }

    const slug = buildSlug(title, year, watchDate);

    const rating = extractRating(item);
    const rewatch = item.rewatch === "Yes";
    const poster = extractPoster(item);
    // Prefer the backdrop Letterboxd shows for this film (the member's chosen
    // alternative when set); fall back to TMDB. Both are full https URLs.
    const backdrop =
      (await fetchLetterboxdBackdrop(letterboxd_link)) ||
      (await fetchBackdrop(title, year));

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

    // Filename matches the admin convention `${id}-${slug}.md`. Record the
    // viewing key/link now so a repeated entry within this same feed run is
    // also skipped.
    const outPath = join(CONTENT_DIR, `${id}-${slug}.md`);
    writeFileSync(outPath, buildMarkdown(fields, ""));
    existingKeys.add(viewingKey(title, year, watchDate));
    if (letterboxd_link) existingLinks.add(letterboxd_link);
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

