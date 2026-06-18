// Letterboxd backdrop scraper with local file cache.
//
// Letterboxd has no public API, so we read the backdrop the site already
// renders on each film page. The page exposes it as `data-backdrop="<url>"`
// on the #backdrop element. When the member has chosen an alternative
// backdrop (a Pro feature), this attribute reflects that exact selection —
// otherwise it is the film's default backdrop. Either way it is the image
// Letterboxd shows for that film, served as a full https://a.ltrbxd.com URL
// (no R2 upload required).
//
// Cache lives in .cache/letterboxd/ as JSON keyed by the letterboxd link.
// TTL: 30 days. Uses native fetch (Node 18+).

import { readFileSync, writeFileSync, mkdirSync, statSync, existsSync } from "fs";
import { join } from "path";

const CACHE_DIR = ".cache/letterboxd";
const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/120.0 Safari/537.36";

function cacheKey(link) {
  return (link || "")
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/[^a-z0-9]/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 120);
}

function readCache(key) {
  const path = join(CACHE_DIR, `${key}.json`);
  if (!existsSync(path)) return null;
  try {
    const stat = statSync(path);
    if (Date.now() - stat.mtimeMs > CACHE_TTL_MS) return null;
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

function writeCache(key, data) {
  mkdirSync(CACHE_DIR, { recursive: true });
  writeFileSync(join(CACHE_DIR, `${key}.json`), JSON.stringify(data));
}

// Pull the backdrop URL out of a film page's HTML. Returns "" when the film
// has no backdrop (the attribute is then absent or empty).
function extractBackdrop(html) {
  const m = html.match(/data-backdrop="([^"]+)"/);
  const url = m ? m[1].trim() : "";
  return /^https?:\/\//.test(url) ? url : "";
}

async function scrape(link) {
  // fetch follows the boxd.it redirect on its own. A diary/rewatch link
  // resolves to a numbered *viewing* page (…/film/<slug>/<n>/), which 403s and
  // carries no backdrop — normalize it to the canonical film page
  // (…/film/<slug>/) and refetch. The member-scoped path is kept so a chosen
  // alternative backdrop is preserved.
  let res = await fetch(link, { headers: { "User-Agent": UA }, redirect: "follow" });
  const canonical = res.url.replace(/(\/film\/[^/]+\/)\d+\/?$/, "$1");
  if (canonical !== res.url) {
    res = await fetch(canonical, { headers: { "User-Agent": UA }, redirect: "follow" });
  }
  // Some member-scoped film pages 404 (e.g. older rewatch logs); the global
  // film page still carries the (default) backdrop. Fall back to it.
  if (!res.ok) {
    const global = canonical.replace(/letterboxd\.com\/[^/]+\/film\//, "letterboxd.com/film/");
    if (global !== canonical) {
      res = await fetch(global, { headers: { "User-Agent": UA }, redirect: "follow" });
    }
  }
  if (!res.ok) return "";
  const html = await res.text();
  return extractBackdrop(html);
}

// Returns the full Letterboxd backdrop URL, or "" if none / on error. Caches.
export async function fetchLetterboxdBackdrop(link) {
  if (!link) return "";

  const key = cacheKey(link);
  const cached = readCache(key);
  if (cached !== null) return cached.backdrop || "";

  try {
    const backdrop = await scrape(link);
    writeCache(key, { backdrop });
    return backdrop;
  } catch (err) {
    console.warn(`[letterboxd] Failed to fetch backdrop for ${link}: ${err.message}`);
    return "";
  }
}
