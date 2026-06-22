#!/usr/bin/env node
// Dry-run by default. Extracts backdrop→film mapping from the saved WordPress
// "Movies" page and matches it against the current film records.
//   node backfill-backdrops.mjs           # dry run: report only
//   node backfill-backdrops.mjs --apply   # copy staged files + write frontmatter
//
// Paths are absolute (VM mounts) so it runs from anywhere.

import { readFileSync, writeFileSync, readdirSync, copyFileSync, mkdirSync, statSync, existsSync } from "fs";
import { join, basename, extname } from "path";
import { glob } from "glob";
import matter from "gray-matter";

const REPO   = "/sessions/jolly-nice-cannon/mnt/bayfujimoto.com";
const MOVIES = "/sessions/jolly-nice-cannon/mnt/movies";
const HTML   = join(MOVIES, "0501_Movies – Bay Fujimoto.html");
const FILES  = join(MOVIES, "0501_Movies – Bay Fujimoto_files");
const FILMS  = join(REPO, "src/content/consumption/films");
const STAGE  = join(REPO, "r2-staging/originals");

const APPLY = process.argv.includes("--apply");

function slugify(str) {
  return (str || "").toLowerCase().replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
const vkey = (title, year, date) => `${slugify(title)}|${year || ""}|${date || ""}`;
const tkey = (title, year) => `${slugify(title)}|${year || ""}`;

// ---- 1. Extract WP entries: {title, year, date, slug, file} ----
const html = readFileSync(HTML, "utf8");
// Anchor with a dated permalink immediately wrapping a featured <img>.
const re = /<a href="https:\/\/www\.bayfujimoto\.com\/(\d{4})\/(\d{2})\/(\d{2})\/([^"\/]+)\/?"[^>]*>\s*<img\b([^>]*?)>/g;
const seen = new Set();
const entries = [];
let m;
while ((m = re.exec(html)) !== null) {
  const [, y, mo, d, slug, imgAttrs] = m;
  if (!/wp-post-image/.test(imgAttrs)) continue;
  const date = `${y}-${mo}-${d}`;
  const altM = imgAttrs.match(/alt="([^"]*)"/);
  const srcM = imgAttrs.match(/src="[^"]*\/([^"\/]+\.(?:jpg|jpeg|png|webp))"/i);
  if (!altM || !srcM) continue;
  const alt = altM[1];                                   // "Title (Year)"
  const ym = alt.match(/^(.*)\s\((\d{4})\)\s*$/);
  const title = ym ? ym[1].trim() : alt.trim();
  const year  = ym ? ym[2] : "";
  const file  = srcM[1];
  const dedup = `${date}|${slug}`;
  if (seen.has(dedup)) continue;
  seen.add(dedup);
  entries.push({ title, year, date, slug, file });
}

// ---- pick the largest on-disk variant sharing a filename stem ----
const diskFiles = readdirSync(FILES);
function largestVariant(file) {
  const ext = extname(file);
  const stem = basename(file, ext);                      // e.g. 250105_nosferatu
  const baseStem = stem.replace(/-\d+x\d+$/, "");        // strip a -WxH suffix
  const candidates = diskFiles.filter(f => {
    const s = basename(f, extname(f)).replace(/-\d+x\d+$/, "");
    return s === baseStem;
  });
  if (candidates.length === 0) return existsSync(join(FILES, file)) ? file : null;
  let best = null, bestSize = -1;
  for (const c of candidates) {
    const sz = statSync(join(FILES, c)).size;
    if (sz > bestSize) { bestSize = sz; best = c; }
  }
  return best;
}

// ---- 2. Index current records ----
const recFiles = glob.sync(join(FILMS, "*.md"));
const byV = new Map(), byT = new Map();
const records = [];
for (const f of recFiles) {
  const { data } = matter(readFileSync(f, "utf8"));
  const rec = { f, id: data.id, title: data.title, year: String(data.year || ""),
                watch_date: data.watch_date, slug: data.slug, hasBackdrop: !!data.assets?.backdrop };
  records.push(rec);
  byV.set(vkey(rec.title, rec.year, rec.watch_date), rec);
  if (!byT.has(tkey(rec.title, rec.year))) byT.set(tkey(rec.title, rec.year), []);
  byT.get(tkey(rec.title, rec.year)).push(rec);
}

// ---- 3. Match ----
const matches = [];            // {rec, entry, file, how}
const unmatchedWP = [];
const usedRec = new Set();
for (const e of entries) {
  let rec = byV.get(vkey(e.title, e.year, e.date));
  let how = "title|year|date";
  if (!rec) {
    const cands = (byT.get(tkey(e.title, e.year)) || []).filter(r => !usedRec.has(r.id));
    if (cands.length === 1) { rec = cands[0]; how = "title|year (unique)"; }
  }
  if (!rec) { unmatchedWP.push(e); continue; }
  usedRec.add(rec.id);
  matches.push({ rec, entry: e, how });
}

const recsWithMatch = new Set(matches.map(x => x.rec.id));
const recsWithout = records.filter(r => !recsWithMatch.has(r.id));

// ---- Report ----
console.log(`WP entries (deduped):      ${entries.length}`);
console.log(`Current film records:      ${records.length}`);
console.log(`Matched:                   ${matches.length}`);
console.log(`  by title|year|date:      ${matches.filter(x=>x.how.startsWith("title|year|date")).length}`);
console.log(`  by title|year (unique):  ${matches.filter(x=>x.how.startsWith("title|year (")).length}`);
console.log(`Unmatched WP entries:      ${unmatchedWP.length}`);
console.log(`Records still w/o backdrop:${recsWithout.length}`);
console.log(`\nSample matches:`);
for (const x of matches.slice(0, 8))
  console.log(`  ${x.rec.id}  ${x.rec.title} (${x.rec.year}) ${x.rec.watch_date}  <- ${x.entry.file}  [${x.how}]`);
console.log(`\nSample unmatched WP entries:`);
for (const e of unmatchedWP.slice(0, 15))
  console.log(`  ${e.date}  ${e.title} (${e.year})  file=${e.file}`);

// missing on disk?
const missingFile = matches.filter(x => !largestVariant(x.entry.file));
if (missingFile.length) console.log(`\n[warn] ${missingFile.length} matched entries have no file on disk`);

if (!APPLY) { console.log(`\n(dry run — pass --apply to stage files and write frontmatter)`); process.exit(0); }

// ---- 4. Apply: stage file + insert assets.backdrop textually (preserve formatting) ----
function insertBackdrop(raw, name) {
  const fmMatch = raw.match(/^---\n([\s\S]*?)\n---/);
  if (!fmMatch) return null;
  let fm = fmMatch[1];
  const line = `  backdrop: "${name}"`;
  if (/^assets:/m.test(fm)) {
    if (/^\s+backdrop:/m.test(fm)) {
      fm = fm.replace(/^\s+backdrop:.*$/m, line);                 // replace existing
    } else {
      fm = fm.replace(/^assets:.*$/m, (s) => `${s}\n${line}`);    // insert as first asset
    }
  } else {
    fm = fm.replace(/\s*$/, "");                                  // trim trailing blanks
    fm += `\nassets:\n${line}`;
  }
  return raw.replace(/^---\n[\s\S]*?\n---/, `---\n${fm}\n---`);
}

mkdirSync(STAGE, { recursive: true });
let staged = 0, wrote = 0;
for (const x of matches) {
  const variant = largestVariant(x.entry.file);
  if (!variant) continue;
  const outName = `${x.rec.id}-backdrop${extname(variant).toLowerCase()}`;
  copyFileSync(join(FILES, variant), join(STAGE, outName));
  staged++;
  const raw = readFileSync(x.rec.f, "utf8");
  const next = insertBackdrop(raw, outName);
  if (next && next !== raw) { writeFileSync(x.rec.f, next); wrote++; }
}
console.log(`\nStaged ${staged} files -> ${STAGE}`);
console.log(`Wrote assets.backdrop into ${wrote} records`);
