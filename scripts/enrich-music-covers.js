#!/usr/bin/env node
// Resolves cover art for every music record and writes it into the record's front
// matter (assets.cover + assets.thumbnail), hot-linking the resolved URLs.
//
// Resolution order lives in scripts/utils/music-covers.js: MusicBrainz
// release-group → Cover Art Archive front art → iTunes Search API fallback.
// A song (item_type "single") resolves against its parent `album` so the picture
// disc shows the album's art (see docs/music-display-plan.md).
//
// Covers are hot-linked URLs (like book covers and film backdrops); to override a
// resolved cover by hand, upload one through the admin form — a non-empty
// assets.cover is treated as resolved and skipped unless --force is passed.
//
// Usage:
//   node scripts/enrich-music-covers.js
//   node scripts/enrich-music-covers.js --dry-run --limit=5
//   node scripts/enrich-music-covers.js --only=MUSIC-2026-001,MUSIC-2026-002
//   node scripts/enrich-music-covers.js --force            # re-resolve everything
//
// Flags:
//   --dry-run        print what would change; write nothing
//   --force          re-resolve records that already have a cover
//   --limit=N        process at most N candidate records
//   --only=IDS       comma-separated record ids (e.g. MUSIC-2026-001)
//   --no-cache       ignore the local .cache/music-covers resolution cache
//   --throttle=MS    ms between network calls (default 1100; MusicBrainz ~1 req/s)

import { readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { glob } from "glob";
import matter from "gray-matter";
import { resolveCover } from "./utils/music-covers.js";

const CONTENT_DIR = "src/content/consumption/music";
const MUSIC_TYPES = new Set(["album", "ep", "single"]);

// ── args ────────────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const hasFlag = (n) => argv.includes(`--${n}`);
const getOpt = (n, def) => {
  const a = argv.find((x) => x.startsWith(`--${n}=`));
  return a ? a.slice(`--${n}=`.length) : def;
};

const opts = {
  dryRun: hasFlag("dry-run"),
  force: hasFlag("force"),
  noCache: hasFlag("no-cache"),
  limit: parseInt(getOpt("limit", ""), 10) || Infinity,
  only: (getOpt("only", "") || "").split(",").map((s) => s.trim()).filter(Boolean),
  throttleMs: parseInt(getOpt("throttle", ""), 10) || 1100,
};

// Surgical front-matter write — replaces/inserts only assets.cover and
// assets.thumbnail so the diff stays to a couple of lines (no YAML reserialization).
function applyFrontMatter(raw, updates) {
  const m = raw.match(/^(---\r?\n)([\s\S]*?)(\r?\n---\r?\n?)([\s\S]*)$/);
  if (!m) throw new Error("front matter delimiters not found");
  const [, open, fmText, close, body] = m;
  const lines = fmText.split("\n");

  const setAsset = (key, value) => {
    const idx = lines.findIndex((l) => new RegExp(`^\\s+${key}:`).test(l));
    const line = `  ${key}: "${value}"`;
    if (idx >= 0) { lines[idx] = line; return; }
    const assetsIdx = lines.findIndex((l) => /^assets:\s*$/.test(l));
    if (assetsIdx >= 0) lines.splice(assetsIdx + 1, 0, line);
    else lines.push("assets:", line);
  };

  if (updates.cover) setAsset("cover", updates.cover);
  if (updates.thumbnail) setAsset("thumbnail", updates.thumbnail);

  return open + lines.join("\n") + close + body;
}

// ── main ──────────────────────────────────────────────────────────────────────
async function main() {
  let files = glob.sync(join(CONTENT_DIR, "*.md")).sort();
  if (opts.only.length) {
    files = files.filter((f) => opts.only.includes(matter(readFileSync(f, "utf8")).data.id));
  }

  const summary = { bySource: {}, skipped: 0, unresolved: [], lowConfidence: [], written: 0 };
  let processed = 0;

  for (const file of files) {
    if (processed >= opts.limit) break;
    const raw = readFileSync(file, "utf8");
    const { data } = matter(raw);
    if (!MUSIC_TYPES.has(data.item_type)) continue;

    const hasCover = !!(data.assets && data.assets.cover);
    if (!opts.force && hasCover) { summary.skipped++; continue; }
    processed++;

    const res = await resolveCover(
      { artist: data.artist, title: data.title, album: data.album, item_type: data.item_type },
      { throttleMs: opts.throttleMs, noCache: opts.noCache }
    );

    if (!res) {
      const label = data.item_type === "single" ? `${data.artist} — ${data.album || data.title}` : `${data.artist} — ${data.title}`;
      summary.unresolved.push(`${data.id}  ${label}`);
      console.log(`[miss]  ${data.id}  ${label} — no cover from any source`);
      continue;
    }

    const flag = res.confidence === "low" ? "  ⚠ LOW-CONFIDENCE" : "";
    console.log(`[ok]    ${data.id}  ${res.source}${flag}  ${res.cover}\n        ${res.note}`);
    summary.bySource[res.source] = (summary.bySource[res.source] || 0) + 1;
    if (res.confidence === "low") {
      summary.lowConfidence.push(`${data.id}  "${data.title}" — ${res.note}  -> ${res.cover}`);
    }

    if (!opts.dryRun) writeFileSync(file, applyFrontMatter(raw, { cover: res.cover, thumbnail: res.thumbnail }));
    summary.written++;
  }

  // ── summary ──
  console.log("\n──────── summary ────────");
  console.log(opts.dryRun ? "(dry run — nothing written)" : `wrote ${summary.written} file(s)`);
  for (const [src, n] of Object.entries(summary.bySource)) console.log(`  ${src}: ${n}`);
  console.log(`  skipped (already have a cover): ${summary.skipped}`);
  if (summary.lowConfidence.length) {
    console.log(`\n⚠ ${summary.lowConfidence.length} low-confidence matches — review:`);
    summary.lowConfidence.forEach((l) => console.log(`  ${l}`));
  }
  if (summary.unresolved.length) {
    console.log(`\n✗ ${summary.unresolved.length} unresolved (no cover found) — upload manually in admin:`);
    summary.unresolved.forEach((l) => console.log(`  ${l}`));
  }
}

main().catch((err) => {
  console.error("[enrich-music]", err);
  process.exit(1);
});
