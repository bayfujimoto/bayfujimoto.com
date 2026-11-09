// Which edition is a book record actually showing, and how tall is it?
//
// Shared by scripts/probe-book-dimensions.js (survey, writes nothing) and
// scripts/enrich-book-dimensions.js (writes `dimensions`). Kept in one place so
// the survey that justified a source and the pass that uses it cannot drift.
//
// ── edition identity ───────────────────────────────────────────────────────
// A book's size is a property of the EDITION, and the edition the archive is
// drawing is the one whose cover is on screen — not necessarily the one in the
// Goodreads export, which records the copy that was read. Those differ often
// enough to matter: Night Sky with Exit Wounds is Paperback/89pp in the CSV and
// hardcover/106pp for the cover shown.
//
//   · cover …/b/isbn/<isbn>.jpg → that ISBN is the edition, by construction.
//   · cover …/b/id/<cover_i>.jpg → search.json `cover_i:<id>` gives the work,
//     works/<key>/editions.json its editions, and exactly one carries that cover
//     id. (Checked across the library: always exactly one, never ambiguous.)
//   · otherwise the record's own isbn13, which is NOT pinned to the cover shown.
//
// ── height ─────────────────────────────────────────────────────────────────
// Google Books is the source, with one trap: `volumes?q=isbn:` returns a
// TRIMMED volumeInfo with `dimensions` omitted. Only the individual volume
// resource carries it. Searching alone reports 0% coverage and is how this was
// nearly written off; the two-step fetch returns height, width and thickness
// for ~2/3 of this library. Two calls per book against a 1,000/day quota.
//
// Measured coverage over all 158 records (2026-09-30):
//   edition identified 78% · Google dimensions 66% · MARC 300$c 16% ·
//   Open Library 7% · any source 70%

const UA = "bayfujimoto.com archive (contact: bayfujimoto@gmail.com)";

async function getJSON(url) {
  // A hard timeout matters: an un-aborted fetch to these endpoints can hang
  // indefinitely and stall a whole run with no output.
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(20000), headers: { "User-Agent": UA } });
    if (!res.ok) return { _status: res.status };
    return await res.json();
  } catch (e) {
    return { _error: String(e.message || e).slice(0, 80) };
  }
}

export const isbnFromCoverUrl = (cover) => (cover || "").match(/\/b\/isbn\/(\d{9,13}[\dXx]?)/)?.[1] || null;
export const coverIdFromUrl = (cover) => (cover || "").match(/\/b\/id\/(\d+)/)?.[1] || null;

/** The Open Library edition that carries this cover id, or null. */
export async function editionFromCoverId(coverId) {
  const search = await getJSON(`https://openlibrary.org/search.json?q=cover_i%3A${coverId}&fields=key&limit=1`);
  const workKey = search?.docs?.[0]?.key;
  if (!workKey) return null;
  const eds = await getJSON(`https://openlibrary.org${workKey}/editions.json?limit=50`);
  const match = (eds?.entries || []).find((e) => (e.covers || []).includes(Number(coverId)));
  if (!match) return null;
  return {
    isbn13: (match.isbn_13 || [])[0] || null,
    format: match.physical_format || null,
    pages: match.number_of_pages || null,
    key: match.key,
  };
}

/** Resolve the edition on screen for a record's front matter. */
export async function resolveEdition(data) {
  const cover = data.assets?.cover || "";
  const urlIsbn = isbnFromCoverUrl(cover);
  if (urlIsbn) return { isbn13: urlIsbn, source: "cover-url isbn", pinned: true };

  const coverId = coverIdFromUrl(cover);
  if (coverId) {
    const ed = await editionFromCoverId(coverId);
    if (ed?.isbn13) {
      return { isbn13: ed.isbn13, source: "cover-id → edition", pinned: true, pages: ed.pages, format: ed.format };
    }
    return { isbn13: null, source: "cover-id unresolved", pinned: false };
  }
  if (data.isbn13) return { isbn13: String(data.isbn13), source: "record isbn13 (cover not pinned)", pinned: false };
  return { isbn13: null, source: "no edition identity", pinned: false };
}

/** Google Books, via the two-step fetch. Height in mm. */
export async function googleVolume(isbn, apiKey) {
  const key = apiKey ? `&key=${apiKey}` : "";
  const found = await getJSON(`https://www.googleapis.com/books/v1/volumes?q=isbn:${isbn}&country=US${key}`);
  if (found?._status || found?._error) return { status: found._status || found._error };
  if (found?.error) return { status: found.error.code };
  const item = (found.items || [])[0];
  if (!item) return { heightMm: null };

  const full = await getJSON(`https://www.googleapis.com/books/v1/volumes/${item.id}?country=US${key}`);
  if (full?._status || full?._error) return { status: full._status || full._error };
  if (full?.error) return { status: full.error.code };
  const info = full.volumeInfo || {};
  const cm = String(info.dimensions?.height || "").match(/([\d.]+)\s*cm/);
  return {
    heightMm: cm ? Math.round(parseFloat(cm[1]) * 10) : null,
    dimensions: info.dimensions || null,
    pages: info.pageCount || null,
    volumeId: item.id,
  };
}

/**
 * MARC 300$c via K10plus SRU — free, keyless, no bot wall. Height only, which
 * is all that is needed since width is derived from the cover's aspect.
 *
 * Cataloguing convention (AACR2 2.5D1, RDA 3.5.1.4) records height in whole
 * centimetres ROUNDED UP: "21 cm" means over 20 and up to 21. The figure
 * therefore carries up to 10 mm of error, biased high, so 5 mm is subtracted to
 * centre it and the result is recorded as catalogued rather than measured. A
 * record whose 300$a says "online resource" describes a digital edition, whose
 * height (if any) is not the object the grid draws — rejected.
 */
export async function marcHeightMm(isbn) {
  const url = "https://sru.k10plus.de/gvk?version=1.1&operation=searchRetrieve"
    + `&query=pica.isb%3D${isbn}&maximumRecords=1&recordSchema=marcxml`;
  let xml;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(20000), headers: { "User-Agent": UA } });
    if (!res.ok) return { status: res.status };
    xml = await res.text();
  } catch (e) { return { status: String(e.message || e).slice(0, 60) }; }

  const field = xml.match(/<datafield tag="300"[\s\S]*?<\/datafield>/);
  if (!field) return { heightMm: null };
  const subs = {};
  for (const m of field[0].matchAll(/<subfield code="(\w)">([\s\S]*?)<\/subfield>/g)) subs[m[1]] = m[2];
  if (/online resource|elektronische ressource/i.test(subs.a || "")) return { heightMm: null, digital: true };

  const cm = (subs.c || "").match(/(\d+(?:[.,]\d+)?)\s*cm/);
  if (!cm) return { heightMm: null };
  return { heightMm: Math.round(parseFloat(cm[1].replace(",", ".")) * 10 - 5), stated: subs.c };
}
