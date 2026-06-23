// Music-cover resolution shared by the music enrichment script (and available to
// any future music ingest). Mirrors the structure of utils/book-covers.js.
//
// Resolution order per record (first hit wins):
//   1. MusicBrainz release-group search → Cover Art Archive front art.  PRIMARY.
//      Canonical album artwork, keyless. CAA serves a full image plus 250/500/1200
//      thumbnails, so we get both a cover and a grid thumbnail from one hit.
//   2. iTunes Search API.  FALLBACK.
//      Keyless; artworkUrl100 is upgraded to 1200 (cover) and 300 (thumb). Albums
//      use the `album` entity; singles use the `song` entity, since a standalone
//      single is a track, not a collection, and would be missed by an album search.
//
// A song (item_type "single") shows its PARENT ALBUM's art when an `album` is named
// (see docs/music-display-plan.md), otherwise its own single art; either way the
// release queried is `album` when present, else `title`.
//
// Both services ask for a descriptive User-Agent and ~1 req/s. Resolved hits (not
// misses) are cached as JSON under .cache/music-covers/. Native fetch (Node 18+).
//
// Returns { cover, thumbnail, source, confidence, note } or null.

import { readFileSync, writeFileSync, mkdirSync, statSync, existsSync } from "fs";
import { join } from "path";

const CACHE_DIR = ".cache/music-covers";
const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const DEFAULT_THROTTLE_MS = 1100; // MusicBrainz asks for ~1 req/s
const USER_AGENT = "bayfujimoto-archive/1.0 ( https://bayfujimoto.com )";

// ── String helpers ────────────────────────────────────────────────────────────

// Drop bracketed edition/format noise: "Untrue (Deluxe Edition)" -> "Untrue".
export function cleanTitle(title) {
  return String(title || "")
    .replace(/\s*\([^)]*\)\s*/g, " ")
    .replace(/\s*\[[^\]]*\]\s*/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokens(s) {
  return new Set(String(s || "").toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(Boolean));
}

// Overlap as intersection / larger token set: penalizes a candidate that pads the
// query with extra words, so a deluxe/various-artists comp doesn't score high.
function similarity(a, b) {
  const A = tokens(a), B = tokens(b);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const t of A) if (B.has(t)) inter++;
  return inter / Math.max(A.size, B.size);
}

// ── Rate limiting + fetch ──────────────────────────────────────────────────────

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let lastFetchAt = 0;
async function rateLimit(minIntervalMs) {
  const wait = Math.max(0, lastFetchAt + minIntervalMs - Date.now());
  if (wait > 0) await sleep(wait);
  lastFetchAt = Date.now();
}

async function fetchWithRetry(url, { retries = 3, backoffMs = 1000, accept } = {}) {
  const headers = { "User-Agent": USER_AGENT };
  if (accept) headers.Accept = accept;
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetch(url, { headers });
      if ((res.status === 429 || res.status === 503) && attempt < retries) {
        await sleep(backoffMs * (attempt + 1));
        continue;
      }
      return res;
    } catch (err) {
      if (attempt < retries) {
        await sleep(backoffMs * (attempt + 1));
        continue;
      }
      throw err;
    }
  }
}

// ── Cache ───────────────────────────────────────────────────────────────────────

function cacheKey({ artist, release }) {
  return `${artist}|${release}`.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 120);
}

function readCache(key) {
  const path = join(CACHE_DIR, `${key}.json`);
  if (!existsSync(path)) return null;
  try {
    if (Date.now() - statSync(path).mtimeMs > CACHE_TTL_MS) return null;
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

function writeCache(key, data) {
  mkdirSync(CACHE_DIR, { recursive: true });
  writeFileSync(join(CACHE_DIR, `${key}.json`), JSON.stringify(data));
}

// ── Source 1: MusicBrainz → Cover Art Archive ───────────────────────────────────

// Lucene-escape a user string for a MusicBrainz query field.
function lucene(s) {
  return String(s || "").replace(/(["\\])/g, "\\$1");
}

// Best release-group MBID for an artist + release title. Guards on a combined
// artist+title similarity so a wrong-artist same-title record is rejected.
async function searchReleaseGroup(artist, release, throttleMs) {
  await rateLimit(throttleMs);
  const q = `releasegroup:"${lucene(release)}" AND artist:"${lucene(artist)}"`;
  const url = `https://musicbrainz.org/ws/2/release-group/?query=${encodeURIComponent(q)}&fmt=json&limit=5`;
  let res;
  try {
    res = await fetchWithRetry(url, { accept: "application/json" });
  } catch (err) {
    console.warn(`[music-covers] MusicBrainz error for "${artist} — ${release}": ${err.message}`);
    return null;
  }
  if (!res.ok) return null;
  const groups = (await res.json())["release-groups"] || [];
  let best = null;
  for (const g of groups) {
    const credit = (g["artist-credit"] || []).map((c) => c.name).join(" ");
    const titleSim = similarity(cleanTitle(release), cleanTitle(g.title));
    const artistSim = similarity(artist, credit);
    if (titleSim < 0.5 || artistSim < 0.5) continue;
    const score = titleSim + artistSim;
    if (!best || score > best.score) {
      best = { id: g.id, title: g.title, artist: credit, score, titleSim, artistSim };
    }
  }
  return best;
}

// Front image + a mid-size thumbnail from Cover Art Archive for a release-group.
async function coverArtArchive(mbid, throttleMs) {
  await rateLimit(throttleMs);
  let res;
  try {
    // CAA 302-redirects /front to the image; the JSON index gives us the thumbnails.
    res = await fetchWithRetry(`https://coverartarchive.org/release-group/${mbid}`, { accept: "application/json", retries: 1 });
  } catch (err) {
    console.warn(`[music-covers] Cover Art Archive error for ${mbid}: ${err.message}`);
    return null;
  }
  if (!res.ok) return null; // 404 = no art deposited for this release-group
  const images = (await res.json()).images || [];
  const front = images.find((i) => i.front) || images[0];
  if (!front || !front.image) return null;
  const t = front.thumbnails || {};
  // Avoid the multi-MB original (Cover Art Archive serves it through a slow
  // archive.org redirect): the 1200px thumbnail is sharp on the card plate and an
  // order of magnitude smaller; the grid uses the 250px thumbnail.
  const cover = t["1200"] || t.large || front.image;
  const thumbnail = t["250"] || t.small || t["500"] || cover;
  return { cover, thumbnail };
}

async function tryMusicBrainz(artist, release, throttleMs) {
  const rg = await searchReleaseGroup(artist, release, throttleMs);
  if (!rg) return null;
  const art = await coverArtArchive(rg.id, throttleMs);
  if (!art) return null;
  const confidence = rg.titleSim >= 0.8 && rg.artistSim >= 0.8 ? "high" : "low";
  return {
    ...art,
    source: "coverartarchive",
    confidence,
    note: `MB release-group ${rg.id} (${rg.title} — ${rg.artist})`,
  };
}

// ── Source 2: iTunes Search API ─────────────────────────────────────────────────

// Upgrade Apple's 100×100 art URL to an arbitrary square size.
function appleArt(url, size) {
  return String(url || "").replace(/\/\d+x\d+bb\.(jpg|png)$/, `/${size}x${size}bb.$1`);
}

// Albums live under the `album` entity (match on collectionName); singles under
// the `song` entity (match on trackName — a standalone single is a track, not a
// collection, so an album search would miss it).
async function tryItunes(artist, release, itemType, throttleMs) {
  await rateLimit(throttleMs);
  const isSingle = itemType === "single";
  const entity = isSingle ? "song" : "album";
  const term = `${artist} ${release}`.trim();
  const url = `https://itunes.apple.com/search?term=${encodeURIComponent(term)}&entity=${entity}&limit=10`;
  let res;
  try {
    res = await fetchWithRetry(url, { accept: "application/json" });
  } catch (err) {
    console.warn(`[music-covers] iTunes error for "${term}": ${err.message}`);
    return null;
  }
  if (!res.ok) return null;
  const results = (await res.json()).results || [];
  let best = null;
  for (const r of results) {
    if (!r.artworkUrl100) continue;
    const candidateTitle = isSingle ? r.trackName : r.collectionName;
    const titleSim = similarity(cleanTitle(release), cleanTitle(candidateTitle));
    const artistSim = similarity(artist, r.artistName);
    if (titleSim < 0.5 || artistSim < 0.4) continue;
    const score = titleSim + artistSim;
    if (!best || score > best.score) best = { r, candidateTitle, score, titleSim, artistSim };
  }
  if (!best) return null;
  const confidence = best.titleSim >= 0.8 && best.artistSim >= 0.6 ? "high" : "low";
  return {
    cover: appleArt(best.r.artworkUrl100, 1200),
    thumbnail: appleArt(best.r.artworkUrl100, 300),
    source: "itunes",
    confidence,
    note: `iTunes ${entity}: ${best.r.artistName} — ${best.candidateTitle}`,
  };
}

// ── Public resolver ─────────────────────────────────────────────────────────────

/**
 * Resolve cover + thumbnail for one music record.
 * @param {{artist:string, title:string, album?:string, item_type?:string}} item
 * @param {{throttleMs?:number, noCache?:boolean}} [opts]
 * @returns {Promise<{cover, thumbnail, source, confidence, note}|null>}
 */
export async function resolveCover(item, opts = {}) {
  const throttleMs = opts.throttleMs ?? DEFAULT_THROTTLE_MS;
  const artist = item.artist || "";
  // A song shows its parent album's art; a release shows its own.
  const release = (item.item_type === "single" && item.album) ? item.album : (item.title || "");
  if (!artist || !release) return null;

  const key = cacheKey({ artist, release });
  if (!opts.noCache) {
    const cached = readCache(key);
    if (cached) return cached;
  }

  let result = await tryMusicBrainz(artist, release, throttleMs);
  if (!result) result = await tryItunes(artist, release, item.item_type, throttleMs);

  if (result) writeCache(key, result); // cache hits only; misses retry next run
  return result;
}
