#!/usr/bin/env node
// Fetches the Goodreads RSS feed and writes new .md files to
// src/content/consumption/books/ for any entries not already present.
//
// Safe to run repeatedly — skips files that already exist (matched by goodreads_link).
//
// Requires:
//   GOODREADS_USER_ID (the numeric ID from your Goodreads profile URL)
//   Run as: GOODREADS_USER_ID=12345 npm run ingest:books

import { existsSync, writeFileSync, readFileSync } from "fs";
import { join } from "path";
import { glob } from "glob";
import RSSParser from "rss-parser";

const CONTENT_DIR = "src/content/consumption/books";
const COUNTERS_PATH = "src/content/_id-counters.yaml";
const USER_ID = process.env.GOODREADS_USER_ID;

const parser = new RSSParser({
  customFields: {
    item: [
      ["book_description", "book_description"],
      ["author_name", "author_name"],
    ],
  },
});

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
  const ratingLine = fields.rating !== null && fields.rating !== undefined ? `rating: ${fields.rating}\n` : "";

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
${assetsYaml}
---`;

  return `${front}\n`;
}

// --- RSS parsing helpers ---

function extractTitle(rssTitle) {
  // RSS title format: "Book Title by Author Name"
  return rssTitle.replace(/\s+by\s+.+$/i, "").trim();
}

function extractAuthor(item) {
  // Try custom RSS field first
  if (item.author_name) return item.author_name.trim();

  // Fallback: try to extract from title "Book Title by Author Name"
  const m = item.title.match(/by\s+(.+?)$/i);
  if (m) return m[1].trim();

  // Try to extract from description or content
  const desc = item["book_description"] || item.description || "";
  const content = item.content || item["content:encoded"] || "";
  const fullText = `${desc} ${content}`;

  // Look for "by Author" pattern
  const byMatch = fullText.match(/by\s+([A-Z][a-z\s'-]+?)(?:\s*(?:<|,|$))/);
  if (byMatch) return byMatch[1].trim();

  return "Unknown";
}

function extractRating(item) {
  const content = item.content || item["content:encoded"] || "";
  // Look for "rated it N stars" or "N of 5 stars"
  const ratingMatch = content.match(/rated it\s+(\d+)\s+stars?/i) ||
                      content.match(/(\d+)\s+of\s+5\s+stars/i);
  return ratingMatch ? parseInt(ratingMatch[1], 10) : 0;
}

function extractCover(item) {
  const content = item.content || item["content:encoded"] || "";
  const m = content.match(/<img[^>]+src="([^">]+)"/);
  return m ? m[1] : "";
}

function extractYear(item) {
  const description = item["book_description"] || item.description || "";
  const content = item.content || item["content:encoded"] || "";
  const fullText = `${description} ${content}`;

  // Look for "Published YYYY" or just a 4-digit year in parentheses
  const m = fullText.match(/[Pp]ublished\s+(\d{4})/);
  if (m) return m[1];

  // Fallback: look for any year-like pattern (just 4 digits)
  const yearMatch = fullText.match(/\b(19\d{2}|20\d{2})\b/);
  if (yearMatch) return yearMatch[1];

  return "";
}

// --- Main ---

async function main() {
  if (!USER_ID) {
    console.warn("[ingest-goodreads] GOODREADS_USER_ID not set — skipping ingest");
    process.exit(0);
  }

  const url = `https://www.goodreads.com/review/list_rss/${USER_ID}?shelf=read`;
  console.log(`[ingest-goodreads] Fetching ${url}`);

  let feed;
  try {
    feed = await parser.parseURL(url);
  } catch (err) {
    console.error(`[ingest-goodreads] Failed to fetch RSS: ${err.message}`);
    process.exit(1);
  }

  console.log(`[ingest-goodreads] ${feed.items.length} entries in feed`);

  // Build a set of all existing goodreads_links to check for duplicates
  const existingLinks = new Set();
  const existingFiles = glob.sync(join(CONTENT_DIR, "*.md"));
  for (const file of existingFiles) {
    const raw = readFileSync(file, "utf8");
    // Extract goodreads_link from front matter
    const match = raw.match(/goodreads_link: "([^"]*)"/);
    if (match) {
      existingLinks.add(match[1]);
    }
  }

  const counters = readCounters();
  let newCount = 0;
  let skipCount = 0;

  for (const item of feed.items) {
    const title = extractTitle(item.title || "");
    const author = extractAuthor(item);

    if (!title) {
      skipCount++;
      continue;
    }

    const goodreads_link = item.link || "";

    // Check if this book already exists by its goodreads link
    if (goodreads_link && existingLinks.has(goodreads_link)) {
      skipCount++;
      continue;
    }

    const dateRead = new Date(item.pubDate);
    const slug = buildSlug(title, null, dateRead);
    const rating = extractRating(item);
    const cover = extractCover(item);
    const year = extractYear(item);

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
      cover,
      tags: [],
    };

    const outPath = join(CONTENT_DIR, `${id}-${slug}.md`);
    writeFileSync(outPath, buildMarkdown(fields));
    newCount++;
    console.log(`[ingest-goodreads] + "${title}" by ${author} — ${sortDateStr}`);
  }

  if (newCount > 0) {
    writeCounters(counters);
  }

  console.log(`[ingest-goodreads] Done. ${newCount} new, ${skipCount} skipped.`);
}

main().catch((err) => {
  console.error("[ingest-goodreads]", err);
  process.exit(1);
});
