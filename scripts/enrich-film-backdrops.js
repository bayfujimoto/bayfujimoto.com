#!/usr/bin/env node
// Populate assets.backdrop on film records with a working external image URL.
//
// Source priority:
//   1. Letterboxd  — the exact backdrop the site shows for that film (an
//      alternative backdrop when you've chosen one), scraped from the page
//      that letterboxd_link resolves to.
//   2. TMDB        — fallback for films with no Letterboxd backdrop.
//
// Both are full https URLs, so they render directly (no R2 upload needed).
// imageUrl() in the app passes through anything starting with http.
//
//   node scripts/enrich-film-backdrops.js              # dry run: report only
//   node scripts/enrich-film-backdrops.js --apply      # write frontmatter
//   node scripts/enrich-film-backdrops.js --limit 5    # only first N (testing)
//   node scripts/enrich-film-backdrops.js --force      # re-fetch even if a
//                                                        full-URL backdrop exists
//
// Idempotent: by default it skips records that already have a full-URL
// backdrop, and overwrites bare-filename backdrops (the broken R2 ones).

import { readFileSync, writeFileSync, existsSync } from "fs";
import { glob } from "glob";
import matter from "gray-matter";
import { fetchLetterboxdBackdrop } from "./utils/letterboxd-backdrop.js";
import { fetchBackdrop } from "./utils/tmdb.js";

// Load .env.local for local runs (Netlify sets these in the build env instead).
// Existing process.env values win, so an exported key is never overwritten.
if (existsSync(".env.local")) {
  for (const line of readFileSync(".env.local", "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

const FILMS = "src/content/consumption/films";
const APPLY = process.argv.includes("--apply");
const FORCE = process.argv.includes("--force");
const limitArg = process.argv.indexOf("--limit");
const LIMIT = limitArg !== -1 ? parseInt(process.argv[limitArg + 1], 10) : Infinity;
const delayArg = process.argv.indexOf("--delay");
const DELAY = delayArg !== -1 ? parseInt(process.argv[delayArg + 1], 10) : 120;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const isUrl = (s) => typeof s === "string" && /^https?:\/\//.test(s);

// Insert/replace assets.backdrop in a record's frontmatter, preserving
// existing formatting (mirrors scripts/backfill-backdrops-from-wp.js).
function setBackdrop(raw, url) {
  const fmMatch = raw.match(/^---\n([\s\S]*?)\n---/);
  if (!fmMatch) return raw;
  let fm = fmMatch[1];
  const line = `  backdrop: "${url}"`;

  if (/^assets:/m.test(fm)) {
    if (/^\s+backdrop:/m.test(fm)) {
      fm = fm.replace(/^\s+backdrop:.*$/m, line); // replace existing
    } else {
      fm = fm.replace(/^assets:.*$/m, (s) => `${s}\n${line}`); // add as first asset
    }
  } else {
    fm = fm.replace(/\s*$/, ""); // trim trailing blanks inside frontmatter
    fm += `\nassets:\n${line}`;
  }
  return raw.replace(/^---\n[\s\S]*?\n---/, `---\n${fm}\n---`);
}

const files = (await glob(`${FILMS}/*.md`)).sort();
let lb = 0,
  tmdb = 0,
  skipped = 0,
  unresolved = 0,
  wrote = 0,
  processed = 0;
const misses = [];

for (const file of files) {
  if (processed >= LIMIT) break;
  const raw = readFileSync(file, "utf8");
  const { data } = matter(raw);
  if (data.item_type !== "film") continue;
  processed++;

  const current = data.assets?.backdrop;
  if (isUrl(current) && !FORCE) {
    skipped++;
    continue;
  }

  // 1. Letterboxd (the exact selected/displayed backdrop)
  let url = await fetchLetterboxdBackdrop(data.letterboxd_link);
  let source = "letterboxd";

  // 2. TMDB fallback
  if (!url) {
    url = await fetchBackdrop(data.title, data.year);
    source = "tmdb";
  }

  if (!url) {
    unresolved++;
    misses.push(`${data.id} ${data.title} (${data.year})`);
    continue;
  }

  if (source === "letterboxd") lb++;
  else tmdb++;

  if (APPLY) {
    const next = setBackdrop(raw, url);
    if (next !== raw) {
      writeFileSync(file, next);
      wrote++;
    }
  }

  console.log(`${source === "letterboxd" ? "LB  " : "TMDB"}  ${data.id}  ${data.title}`);

  // Be polite to Letterboxd on live (uncached) hits.
  await sleep(DELAY);
}

console.log("\n— summary —");
console.log(`processed:   ${processed}`);
console.log(`letterboxd:  ${lb}`);
console.log(`tmdb:        ${tmdb}`);
console.log(`skipped (already URL): ${skipped}`);
console.log(`unresolved:  ${unresolved}`);
if (misses.length) console.log("  " + misses.join("\n  "));
if (APPLY) console.log(`\nwrote assets.backdrop into ${wrote} records`);
else console.log(`\n(dry run — pass --apply to write frontmatter)`);
