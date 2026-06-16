// Book-cover resolution shared by the Goodreads ingest and the enrichment script.
//
// Resolution order per book (first hit wins):
//   1. Open Library covers by ISBN13, then ISBN10  — precise, keyless. PRIMARY.
//   2. Google Books by ISBN                  — precise; only if GOOGLE_BOOKS_API_KEY set.
//   3. Open Library search by title+author   — keyless title fallback (cover_i), guarded.
//   4. Google Books by title+author          — fuzzy; only with an API key.
//   5. Existing Goodreads cover, suffix-stripped — last resort; correct edition.
//
// Google Books keyless access shares an anonymous daily quota that is frequently
// exhausted (HTTP 429), so it is treated as an optional enhancement: set
// GOOGLE_BOOKS_API_KEY to make it reliable, otherwise the run leans on Open Library
// and disables Google after the first 429.
//
// Returns { url, source, confidence, note } or null. Resolved hits (not misses)
// are cached as JSON under .cache/book-covers/. Uses native fetch (Node 18+).

import { readFileSync, writeFileSync, mkdirSync, statSync, existsSync } from "fs";
import { join } from "path";

const CACHE_DIR = ".cache/book-covers";
const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const DEFAULT_THROTTLE_MS = 1100; // ~1 req/s — Open Library ISBN access is ~100/IP/5min

// ── String helpers (also imported by the ingest scripts) ─────────────────────

// Strip the Goodreads/Amazon image size token (._SX50_, ._SY75_, ._SX98_, …) so
// the URL serves the full-resolution image. No-op on URLs without a token.
export function stripGoodreadsSize(url) {
  if (!url) return url;
  return url.replace(/\._S[XY]\d+_(?=\.\w+$)/, "");
}

// Normalize a Goodreads-CSV ISBN cell. The export armors values as ="0441172717"
// (and ISBN13 the same). Returns the bare digits (with a trailing X for ISBN10).
export function cleanIsbn(raw) {
  if (!raw) return "";
  return String(raw).replace(/[="]/g, "").replace(/[^0-9Xx]/g, "").toUpperCase();
}

// Drop bracketed series/edition noise from a title: "Ender's Game (Ender's Saga,
// #1)" -> "Ender's Game". Used to build cleaner Google Books title queries.
export function cleanTitle(title) {
  return String(title || "")
    .replace(/\s*\([^)]*\)\s*/g, " ")
    .replace(/\s*\[[^\]]*\]\s*/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// ── Rate limiting + fetch ────────────────────────────────────────────────────

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let lastFetchAt = 0;
async function rateLimit(minIntervalMs) {
  const wait = Math.max(0, lastFetchAt + minIntervalMs - Date.now());
  if (wait > 0) await sleep(wait);
  lastFetchAt = Date.now();
}

async function fetchWithRetry(url, { retries = 3, backoffMs = 1000 } = {}) {
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetch(url, { headers: { "User-Agent": "bayfujimoto-archive/1.0 (book-cover ingest)" } });
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

// ── Cache ─────────────────────────────────────────────────────────────────────

function cacheKey({ isbn13, isbn, title, author }) {
  const base = isbn13 || isbn || `${title}|${author}`;
  return String(base).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 120);
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

// ── Sources ───────────────────────────────────────────────────────────────────

// Open Library: ?default=false yields a 404 (not a blank placeholder) on a miss.
async function tryOpenLibrary(isbn, throttleMs) {
  await rateLimit(throttleMs);
  const probe = `https://covers.openlibrary.org/b/isbn/${isbn}-L.jpg?default=false`;
  try {
    const res = await fetchWithRetry(probe);
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 1000) return null; // guard against a stray blank/placeholder
    return `https://covers.openlibrary.org/b/isbn/${isbn}-L.jpg`;
  } catch (err) {
    console.warn(`[book-covers] Open Library error for isbn ${isbn}: ${err.message}`);
    return null;
  }
}

// Once Google returns a daily-quota 429, further calls this run are pointless.
let googleDisabled = false;

async function googleBooksSearch(query, throttleMs) {
  if (googleDisabled) return [];
  const key = process.env.GOOGLE_BOOKS_API_KEY;
  await rateLimit(throttleMs);
  let url = `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(query)}&maxResults=5&country=US`;
  if (key) url += `&key=${key}`;
  try {
    const res = await fetchWithRetry(url, { retries: key ? 3 : 0 });
    if (res.status === 429) {
      googleDisabled = true;
      console.warn("[book-covers] Google Books quota exhausted (429) — skipping Google for the rest of this run. Set GOOGLE_BOOKS_API_KEY to enable it.");
      return [];
    }
    if (!res.ok) return [];
    const data = await res.json();
    return data.items || [];
  } catch (err) {
    console.warn(`[book-covers] Google Books error for "${query}": ${err.message}`);
    return [];
  }
}

async function searchOpenLibrary(titleQuery, author, throttleMs) {
  await rateLimit(throttleMs);
  const params = new URLSearchParams({ title: titleQuery, limit: "5", fields: "title,author_name,cover_i,isbn" });
  if (author) params.set("author", author);
  try {
    const res = await fetchWithRetry(`https://openlibrary.org/search.json?${params.toString()}`);
    if (!res.ok) return [];
    return (await res.json()).docs || [];
  } catch (err) {
    console.warn(`[book-covers] Open Library search error for "${titleQuery}": ${err.message}`);
    return [];
  }
}

// Open Library search by title+author → first non-junk doc with a cover_i, scored
// against the core title. Broadens progressively: full title → core title → core
// title without the author filter (helps translated works indexed under another name).
async function tryOpenLibrarySearch(title, author, throttleMs) {
  const full = cleanTitle(title);
  const core = coreTitle(title);
  if (!full) return null;

  const attempts = [{ t: full, a: author }];
  if (core !== full) attempts.push({ t: core, a: author });
  attempts.push({ t: core, a: "" });

  for (const { t, a } of attempts) {
    const docs = await searchOpenLibrary(t, a, throttleMs);
    for (const doc of docs) {
      if (!doc.cover_i) continue;
      const dt = doc.title || "";
      if (JUNK_TITLE.test(dt)) continue;
      const sim = titleSimilarity(core, dt);
      if (sim < 0.6) continue;
      const url = `https://covers.openlibrary.org/b/id/${doc.cover_i}-L.jpg`;
      return sim >= 0.8
        ? { url, source: "openlibrary-search", confidence: "high", note: `OL search: ${dt}` }
        : { url, source: "openlibrary-search", confidence: "low", note: `OL fuzzy: "${dt}" (sim ${sim.toFixed(2)})` };
    }
  }
  return null;
}

// Pick the largest imageLinks variant present and force https (drop page-curl).
function bestGoogleImage(imageLinks) {
  if (!imageLinks) return null;
  const link =
    imageLinks.extraLarge || imageLinks.large || imageLinks.medium ||
    imageLinks.small || imageLinks.thumbnail || imageLinks.smallThumbnail;
  if (!link) return null;
  return link.replace(/^http:/, "https:").replace(/&edge=curl/, "");
}

function tokens(s) {
  return new Set(String(s || "").toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(Boolean));
}

// Overlap as intersection / larger token set: penalizes a candidate that pads our
// title with extra words ("A Study Guide for … X"), so junk doesn't score high.
function titleSimilarity(a, b) {
  const A = tokens(a), B = tokens(b);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const t of A) if (B.has(t)) inter++;
  return inter / Math.max(A.size, B.size);
}

// Text before the first subtitle separator: "Atomic Habits: An Easy…" -> "Atomic
// Habits". Open Library indexes by the core title; the full subtitle often only
// matches summaries/study guides.
function coreTitle(title) {
  const full = cleanTitle(title);
  const core = full.split(/\s*[:–—]\s*/)[0].trim();
  return core || full;
}

// Editions that aren't the book: study guides, summaries, workbooks, etc.
const JUNK_TITLE = /\b(study guide|summary|workbook|companion|teacher'?s guide|notes on|analysis|sparknotes|cliffs?notes|quicklet|conversation starters)\b/i;

async function tryGoogleBooksIsbn(isbn, throttleMs) {
  const items = await googleBooksSearch(`isbn:${isbn}`, throttleMs);
  for (const it of items) {
    const url = bestGoogleImage(it.volumeInfo?.imageLinks);
    if (url) return url;
  }
  return null;
}

async function tryGoogleBooksTitle(title, author, throttleMs) {
  const cleaned = cleanTitle(title);
  if (!cleaned) return null;
  let q = `intitle:${cleaned}`;
  if (author) q += `+inauthor:${author}`;
  const items = await googleBooksSearch(q, throttleMs);
  for (const it of items) {
    const info = it.volumeInfo || {};
    const url = bestGoogleImage(info.imageLinks);
    if (!url) continue;
    const sim = titleSimilarity(cleaned, info.title || "");
    if (sim >= 0.8) {
      return { url, source: "googlebooks-title", confidence: "high", note: `match: ${info.title}` };
    }
    if (sim >= 0.5) {
      return { url, source: "googlebooks-title", confidence: "low", note: `fuzzy: "${info.title}" (sim ${sim.toFixed(2)})` };
    }
  }
  return null;
}

// ── Public resolver ─────────────────────────────────────────────────────────

/**
 * Resolve the best cover for one book.
 * @param {{title, author, isbn13?, isbn?, goodreadsCover?}} book
 * @param {{throttleMs?:number, noCache?:boolean}} [opts]
 * @returns {Promise<{url, source, confidence, note}|null>}
 */
export async function resolveCover(book, opts = {}) {
  const throttleMs = opts.throttleMs ?? DEFAULT_THROTTLE_MS;
  const title = book.title || "";
  const author = book.author || "";
  const isbn13 = cleanIsbn(book.isbn13);
  const isbn = cleanIsbn(book.isbn);
  const goodreadsCover = book.goodreadsCover || "";

  const key = cacheKey({ isbn13, isbn, title, author });
  if (!opts.noCache) {
    const cached = readCache(key);
    if (cached) return cached;
  }

  let result = null;

  // 1. Open Library covers by ISBN (prefer 13) — precise, keyless
  for (const code of [isbn13, isbn].filter(Boolean)) {
    const url = await tryOpenLibrary(code, throttleMs);
    if (url) { result = { url, source: "openlibrary", confidence: "high", note: `isbn:${code}` }; break; }
  }

  // 2. Google Books by ISBN — precise; reliable only with an API key
  if (!result) {
    for (const code of [isbn13, isbn].filter(Boolean)) {
      const url = await tryGoogleBooksIsbn(code, throttleMs);
      if (url) { result = { url, source: "googlebooks-isbn", confidence: "high", note: `isbn:${code}` }; break; }
    }
  }

  // 3. Open Library search by title+author — keyless fallback (cover_i), guarded
  if (!result && title) {
    result = await tryOpenLibrarySearch(title, author, throttleMs);
  }

  // 4. Google Books by title+author — fuzzy; may be flagged low-confidence
  if (!result && title) {
    result = await tryGoogleBooksTitle(title, author, throttleMs);
  }

  // 5. Existing Goodreads cover, upgraded to full-res
  if (!result && goodreadsCover) {
    result = {
      url: stripGoodreadsSize(goodreadsCover),
      source: "goodreads-stripped",
      confidence: "high",
      note: "existing cover upgraded to full-res",
    };
  }

  if (result) writeCache(key, result); // cache hits only; misses retry next run
  return result;
}
