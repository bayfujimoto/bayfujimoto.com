// TMDB backdrop fetcher with local file cache.
// Cache lives in .cache/tmdb/ as JSON files keyed by "title|year".
// TTL: 30 days. Uses native fetch (Node 18+).

import { readFileSync, writeFileSync, mkdirSync, statSync, existsSync } from "fs";
import { join } from "path";

const CACHE_DIR = ".cache/tmdb";
const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const TMDB_IMAGE_BASE = "https://image.tmdb.org/t/p/w1280";

function cacheKey(title, year) {
  return `${title}-${year || "noyear"}`
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 100);
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

async function searchTMDB(title, year) {
  const apiKey = process.env.TMDB_API_KEY;
  if (!apiKey) return null;

  const base = "https://api.themoviedb.org/3/search/movie";
  const query = encodeURIComponent(title);

  // Try with year first for accuracy
  if (year) {
    const res = await fetch(`${base}?api_key=${apiKey}&query=${query}&year=${year}`);
    if (res.ok) {
      const json = await res.json();
      if (json.results?.length > 0) return json.results[0].backdrop_path || null;
    }
  }

  // Fall back to title-only search
  const res = await fetch(`${base}?api_key=${apiKey}&query=${query}`);
  if (!res.ok) return null;
  const json = await res.json();
  return json.results?.[0]?.backdrop_path || null;
}

// Returns full backdrop URL or empty string. Caches results.
export async function fetchBackdrop(title, year) {
  const apiKey = process.env.TMDB_API_KEY;
  if (!apiKey) return "";

  const key = cacheKey(title, year);
  const cached = readCache(key);
  if (cached !== null) {
    return cached.backdrop_path ? `${TMDB_IMAGE_BASE}${cached.backdrop_path}` : "";
  }

  try {
    const backdrop_path = await searchTMDB(title, year);
    writeCache(key, { backdrop_path });
    return backdrop_path ? `${TMDB_IMAGE_BASE}${backdrop_path}` : "";
  } catch (err) {
    console.warn(`[tmdb] Failed to fetch backdrop for "${title}" (${year}): ${err.message}`);
    return "";
  }
}
