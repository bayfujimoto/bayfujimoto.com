#!/usr/bin/env node
// Populate assets.poster on film records with the poster Letterboxd shows for
// the film — the 600×900 crop in the global film page's JSON-LD `image`
// (https://a.ltrbxd.com/resized/film-poster/…). Records ingested from the
// Letterboxd CSV carry only a backdrop; the RSS ingest records a poster. This
// fills the gap where a poster is wanted — first for constellation grids,
// where a film renders as its poster (decisions.md → "Biography — a homed
// constellation"; film ribbons stay backdrops).
//
//   node scripts/enrich-film-posters.js                          # dry run, every film
//   node scripts/enrich-film-posters.js --constellation biography # only members of a constellation
//   node scripts/enrich-film-posters.js --ids FILM-2024-318,FILM-2024-248
//   node scripts/enrich-film-posters.js --apply                   # write frontmatter
//   node scripts/enrich-film-posters.js --force                   # re-fetch even if a poster exists
//   node scripts/enrich-film-posters.js --limit 5 --delay 250
//
// Idempotent: records that already carry a full-URL poster are skipped unless
// --force. Full https URLs render directly (imageUrl() passes http through).

import { readFileSync, writeFileSync } from "fs";
import { glob } from "glob";
import matter from "gray-matter";

const FILMS = "src/content/consumption/films";
const argv = process.argv.slice(2);
const APPLY = argv.includes("--apply");
const FORCE = argv.includes("--force");
const arg = (name) => { const i = argv.indexOf(name); return i !== -1 ? argv[i + 1] : null; };
const LIMIT = arg("--limit") ? parseInt(arg("--limit"), 10) : Infinity;
const DELAY = arg("--delay") ? parseInt(arg("--delay"), 10) : 150;
const CONSTELLATION = arg("--constellation");
const IDS = arg("--ids") ? new Set(arg("--ids").split(",").map(s => s.trim()).filter(Boolean)) : null;

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/120.0 Safari/537.36";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const isUrl = (s) => typeof s === "string" && /^https?:\/\//.test(s);

// Resolve the record's link (boxd.it short link, diary/viewing page, or a
// member-scoped film page) to the global film page, whose JSON-LD carries the
// poster. Member pages and viewing pages don't.
async function resolveFilmPage(link) {
  if (!link) return "";
  const res = await fetch(link, { headers: { "User-Agent": UA }, redirect: "follow" });
  const m = res.url.match(/letterboxd\.com\/(?:[^/]+\/)?film\/([^/]+)\//);
  return m ? `https://letterboxd.com/film/${m[1]}/` : "";
}

// The JSON-LD image is the poster: either …/resized/film-poster/… or an
// …/resized/sm/upload/… path, both cropped 0-600-0-900 (the 2:3 poster
// crop, as against the 1200-675 backdrop crops).
const POSTER_CROP = /-0-600-0-900-crop/;
function extractPoster(html) {
  const m = html.match(/<script[^>]*ld\+json[^>]*>([\s\S]*?)<\/script>/i);
  if (m) {
    const im = m[1].match(/"image"\s*:\s*"([^"]+)"/);
    if (im && POSTER_CROP.test(im[1])) return im[1];
  }
  const any = html.match(/https:\/\/a\.ltrbxd\.com\/resized\/[^"'\s]*-0-600-0-900-crop[^"'\s]*/);
  return any ? any[0] : "";
}

async function fetchPoster(link) {
  const page = await resolveFilmPage(link);
  if (!page) return "";
  const res = await fetch(page, { headers: { "User-Agent": UA } });
  if (!res.ok) return "";
  return extractPoster(await res.text());
}

// Insert/replace assets.poster, preserving the file's formatting (mirrors
// enrich-film-backdrops.js). Placed after backdrop when there is one.
function setPoster(raw, url) {
  const fmMatch = raw.match(/^---\n([\s\S]*?)\n---/);
  if (!fmMatch) return raw;
  let fm = fmMatch[1];
  const line = `  poster: "${url}"`;
  if (/^assets:/m.test(fm)) {
    if (/^\s+poster:/m.test(fm)) fm = fm.replace(/^\s+poster:.*$/m, line);
    else if (/^\s+backdrop:.*$/m.test(fm)) fm = fm.replace(/^\s+backdrop:.*$/m, (s) => `${s}\n${line}`);
    else fm = fm.replace(/^assets:.*$/m, (s) => `${s}\n${line}`);
  } else {
    fm = fm.replace(/\s*$/, "") + `\nassets:\n${line}`;
  }
  return raw.replace(/^---\n[\s\S]*?\n---/, `---\n${fm}\n---`);
}

const files = (await glob(`${FILMS}/*.md`)).sort();
let processed = 0, skipped = 0, found = 0, unresolved = 0, wrote = 0;
const misses = [];

for (const file of files) {
  if (processed >= LIMIT) break;
  const raw = readFileSync(file, "utf8");
  const { data } = matter(raw);
  if (data.item_type !== "film") continue;
  if (IDS && !IDS.has(data.id)) continue;
  if (CONSTELLATION && !(Array.isArray(data.constellations) && data.constellations.includes(CONSTELLATION))) continue;
  processed++;

  if (isUrl(data.assets?.poster) && !FORCE) { skipped++; continue; }

  let url = "";
  try { url = await fetchPoster(data.letterboxd_link); } catch (e) { console.warn(`  ! ${data.id}: ${e.message}`); }
  if (!url) { unresolved++; misses.push(`${data.id} ${data.title} (${data.year}) ${data.letterboxd_link || "no link"}`); continue; }
  found++;

  if (APPLY) {
    const next = setPoster(raw, url);
    if (next !== raw) { writeFileSync(file, next); wrote++; }
  }
  console.log(`LB  ${data.id}  ${data.title}  ${url}`);
  await sleep(DELAY);
}

console.log("\n— summary —");
console.log(`processed:   ${processed}${CONSTELLATION ? ` (constellation ${CONSTELLATION})` : ""}`);
console.log(`found:       ${found}`);
console.log(`skipped (already URL): ${skipped}`);
console.log(`unresolved:  ${unresolved}`);
if (misses.length) console.log("  " + misses.join("\n  "));
if (APPLY) console.log(`\nwrote assets.poster into ${wrote} records`);
else console.log(`\n(dry run — pass --apply to write frontmatter)`);
