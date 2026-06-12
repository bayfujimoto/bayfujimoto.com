// dedupe-content.js — one-time + maintenance utility.
//
// Two jobs, both data-driven (no hardcoded file lists):
//
//   1. DEDUPE  — find content files that share the same frontmatter `id`,
//                keep one canonical file per id, and remove the redundant
//                copies. Duplicates arise from several patterns: doubled-prefix
//                filenames (`FILM-2026-440-FILM-2026-440-…md`), old slug-named
//                files colliding with ID-prefixed ones, and macOS ` 2.md` copies.
//
//   2. NORMALIZE — rewrite any `slug` frontmatter that wrongly includes its own
//                  `${id}-` prefix (e.g. `slug: FILM-2026-440-sorry-to-bother-you`
//                  → `slug: sorry-to-bother-you`). This is the root cause of the
//                  doubled-prefix bug: generateFilePath() composes `${id}-${slug}.md`,
//                  so an ID-prefixed slug doubles on the next admin save.
//
// Dry-run by default — prints a KEEP/REMOVE table and the slug rewrites without
// touching disk. Pass --apply to actually delete files and rewrite slugs.
//
//   node scripts/dedupe-content.js            # dry run
//   node scripts/dedupe-content.js --apply    # perform changes

import { glob } from "glob";
import matter from "gray-matter";
import { readFileSync, writeFileSync, unlinkSync } from "fs";
import { basename } from "path";

const APPLY = process.argv.includes("--apply");

const files = glob.sync("src/content/**/*.md", { ignore: "src/content/_templates/**" });

// ── Group files by frontmatter id ────────────────────────────────────────────
const byId = new Map();
const noId = [];
for (const file of files) {
  const { data } = matter(readFileSync(file, "utf8"));
  const id = data.id;
  if (!id) { noId.push(file); continue; }
  if (!byId.has(id)) byId.set(id, []);
  byId.get(id).push({ file, slug: data.slug });
}

// ── 1. Dedupe: pick a canonical keeper per id, mark the rest for removal ──────
//
// Scoring (lower = better keeper):
//   + heavy penalty for a doubled `${id}-${id}-` prefix
//   + heavy penalty for a macOS ` 2.md` suffix
//   + small penalty if the name does NOT start with `${id}-` (prefer the
//     ID-prefixed convention)
//   tie-break: shorter basename, then lexicographic.
function score(id, file) {
  const name = basename(file);
  let s = 0;
  if (name.startsWith(`${id}-${id}-`)) s += 1000;
  if (/ 2\.md$/.test(name)) s += 1000;
  if (!name.startsWith(`${id}-`)) s += 10;
  s += name.length / 1000;
  return s;
}

const removals = [];
for (const [id, entries] of byId) {
  if (entries.length < 2) continue;
  const ranked = [...entries].sort((a, b) => {
    const d = score(id, a.file) - score(id, b.file);
    return d !== 0 ? d : a.file.localeCompare(b.file);
  });
  const keep = ranked[0];
  for (const drop of ranked.slice(1)) removals.push({ id, keep: keep.file, drop: drop.file });
}

// ── 2. Normalize: strip a leading `${id}-` from any slug ─────────────────────
// Operate on the raw text (regex on the slug line only) so file formatting and
// key order stay untouched — keeps the diff to one line per affected file.
const removedSet = new Set(removals.map(r => r.drop));
const slugRewrites = [];
for (const [id, entries] of byId) {
  for (const { file, slug } of entries) {
    if (removedSet.has(file)) continue;           // skip files we're deleting
    if (typeof slug !== "string") continue;
    if (!slug.startsWith(`${id}-`)) continue;
    const cleaned = slug.slice(id.length + 1);
    slugRewrites.push({ file, from: slug, to: cleaned });
  }
}

// ── Report ───────────────────────────────────────────────────────────────────
console.log(`\nScanned ${files.length} content file(s)${noId.length ? ` (${noId.length} without an id)` : ""}.\n`);

console.log(`── DEDUPE — ${removals.length} redundant file(s) across ${new Set(removals.map(r => r.id)).size} id group(s) ──`);
let lastKept = null;
for (const r of removals) {
  if (r.keep !== lastKept) {
    console.log(`\n  ${r.id}`);
    console.log(`    KEEP   ${r.keep}`);
    lastKept = r.keep;
  }
  console.log(`    REMOVE ${r.drop}`);
}

console.log(`\n── NORMALIZE — ${slugRewrites.length} slug(s) with an embedded id prefix ──`);
for (const w of slugRewrites.slice(0, 12)) {
  console.log(`    ${basename(w.file)}\n      ${w.from}  →  ${w.to}`);
}
if (slugRewrites.length > 12) console.log(`    …and ${slugRewrites.length - 12} more`);

// ── Apply ──────────────────────────────────────────────────────────────────
if (!APPLY) {
  console.log(`\nDry run. Re-run with --apply to delete the REMOVE files and rewrite the slugs.\n`);
  process.exit(0);
}

for (const r of removals) unlinkSync(r.drop);
for (const w of slugRewrites) {
  const raw = readFileSync(w.file, "utf8");
  // Replace only within the frontmatter slug line; handles quoted/unquoted values.
  const next = raw.replace(
    /^slug:[ \t]*["']?.*?["']?[ \t]*$/m,
    `slug: ${w.to}`
  );
  if (next !== raw) writeFileSync(w.file, next, "utf8");
}

console.log(`\nApplied: removed ${removals.length} file(s), rewrote ${slugRewrites.length} slug(s).`);
console.log(`Next: run \`node scripts/build-data.js\` to regenerate the archive.\n`);
