# Image loading plan

Goal: a reader should never land on a blank cell where a reproduction is meant to be. Every place the archive shows an image — the browse grids, the film ribbon, the item-card plate — should either paint quickly or hold a deliberate placeholder in the interim, and should degrade to something legible rather than to a void when a source is slow or missing.

This plan records the optimizations in rough order of impact. It is a reference, not a contract; items can be taken in any order, and each is written to stand alone. Status markers: ✓ done, ◐ in progress, ☐ not started.

## Where images come from (context)

Three variants are addressed by convention in `src/app/image-url.js`: `thumbnail` and `display` (web-size WebP) derivatives in R2, and the full `original`. Non-film grids load the small `thumbnail`; the item-card plate loads `display` with a fallback to `original` (`loadDisplayWithFallback` in `panels.js`).

Film backdrops are the exception. They are **external Letterboxd URLs** (≈500 of 515 films; the rest TMDB), scraped verbatim from each film page at 1200×675 and stored in `assets.backdrop`. Because `imageUrl` returns any `http…` value unchanged, there is no R2 derivative for them — an important correction to the first draft of this list, which assumed they were full R2 masters.

## Phase 1: Serve right-sized images in the grids ◐

The film grid renders 1200×675 Letterboxd JPEGs into cells only ~213px wide (≈426px at 2×). That is roughly five times more pixels than the cell can show, so each cell waits on an oversized download before it paints.

Letterboxd serves on-demand resized derivatives whose target size is encoded in the path (`…-1200-1200-675-675-crop-000000.jpg`). Rewriting that token to a smaller preset (500×281) for grid use cuts each backdrop from ~150–250 KB to ~30–50 KB. The full size is not used elsewhere — the item card shows the poster, not the backdrop — so this is grid-only. A guarded `onerror` fall back to the original URL guarantees the rewrite can never itself produce a blank. Non-Letterboxd URLs pass through untouched.

- ✓ Verified 500×281 and 960×540 presets resolve on the Letterboxd CDN.
- ✓ Rewrite grid backdrop URLs in `buildFilmCell` and the browse films branch (`gridBackdropUrl`/`setGridBackdrop`), with `onerror` fallback and `decoding="async"`.
- ☐ Longer term: proxy backdrops into R2 as `thumbnail`/`display` WebP derivatives, like every other asset, so they become same-origin, cache-controlled, and immune to third-party CDN latency or outage. (`enrich-film-backdrops.js` notes a prior, broken R2-backdrop attempt; this is the intended end state.)
- ☐ Add `srcset`/`sizes` (and consider AVIF) to the R2 derivatives once backdrops are in-house.

## Phase 2: Progressive reproduction — thumbnail first, then display ✓

Rather than hold the space with a synthetic placeholder (a background tone, a dominant color, a blurhash), reuse the real image the archive has already loaded. Once a grid cell has shown its `thumbnail`, that file is in the browser cache; opening the item can paint it instantly — scaled up, momentarily soft — exactly where the high-resolution `display` reproduction will land. When `display` finishes decoding, it replaces the thumbnail in place. The low-resolution image never leaves a gap, and the transition reads as a sharpening rather than a pop from void.

Mechanism, in `makeItemSheet`: seed `reproImg.src` with `imageUrl(item.assets?.thumbnail, "thumbnail")` — the same URL the grid used, so it is cache-warm — before starting the high-resolution load. Fetch `display` into a detached `Image()`; on its `load`/`decode`, set `reproImg.src` to the display URL and redraw the plate. The existing `display → original → showNone` fallback chain stays intact behind the thumbnail, so a missing high-res source degrades to the thumbnail rather than to blank.

Scope. This maps cleanly wherever the grid thumbnail and the card reproduction derive from the same asset — books, music, ephemera. Films are the exception: the grid shows the backdrop while the card shows the poster, two different images, so a film card keeps its own poster-thumbnail placeholder if one exists and otherwise falls through to the existing "no reproduction" plate.

Why this over the dropped approach: no build-time work and no synthetic swatch to maintain, and the placeholder is a true miniature of the actual reproduction rather than an approximation of it.

## Phase 3: Fix deferred fetching in the horizontal strips ✓

Thumbnails carried `loading="lazy"`. Native lazy loading keys off the viewport and does not preload within a nested horizontal scroller, so cells to the right blanked as you scrolled into them. Native lazy is now replaced by an `IntersectionObserver` scoped to the scroll container (`root: gridWrap`) with a wide horizontal `rootMargin` (`0px 1200px`), so each cell's image fetches a few screen-widths before entering view. Each grid image registers a deferred loader (`lazyRegister`) instead of fetching at build time; the observer watches the sized cell button rather than the initially-empty `<img>`, so a zero-size image cannot defeat the intersection test. The observer is disconnected on subcollection switch and on sheet teardown, and degrades to loading everything where `IntersectionObserver` is unavailable.

## Phase 4: Decode before reveal, then fade in ✓

The item-card plate already decodes before swapping (Phase 2's `loadReproProgressive`), so this phase covers the images that still popped in: the browse-grid thumbnails and film backdrops, and the labor item images (which used `loadDisplayWithFallback` and blanked while retrying the original). A shared `fadeInOnLoad(img)` sets `decoding="async"`, waits for `load` and `decode()`, then fades the image in via a generic `.img-fade` / `.img-fade--in` rule; `prefers-reduced-motion` disables the transition so the image simply appears once ready. The load listener stays armed across a `display → original` retry, and the helper is a no-op-safe fast path when the image is already complete. Wired into `setGridBackdrop`, the standard thumbnail loader, and the labor image.

## Phase 5: Preload neighbours in the item sheet ✓

The swipe carousel already pre-renders neighbours, but arrow/keyboard navigation rebuilds the card and reloaded the plate image. When a card opens, the previous and next items' `display` reproductions (and thumbnails, where present) are now prefetched into the browser cache via a detached `Image()`, deduped through a `Set`, and deferred to `requestIdleCallback` so the warm-up never competes with the active card's own load. Hooked into `renderContent` (covers the initial open and every arrow/keyboard step) and into the swipe-promote path (warms the next step's neighbours after a completed swipe), so stepping through lands on an already-decoded image.

## Phase 6: Reserve intrinsic size ✓

A correction to the first draft: the display-size backfill does not record any dimensions — it only uploads WebP derivatives — and no width/height is stored on records, so there is no persisted number to reserve from. Re-examined against the code, the grid cells and the item-card plate already reserve their boxes (fixed-size cells; the plate is a `1/1` SVG field sized from physical `dimensions`), so the only real layout shift was the labor filmstrip, whose panels started at 300px and jumped to their aspect-derived width when the full image loaded.

That reflow is now removed by sizing each panel from the small subitem thumbnail as soon as it paints, via the Phase 2 progressive loader (`loadReproProgressive(img, sub.file, sub.thumbnail)`). The thumbnail is small and often cache-warm from the labor grid, so the panel reaches its final width almost immediately; the later full-display load carries the same aspect ratio and recomputes to the same width, so there is no second shift. This also gave the labor images the same progressive-then-fade behavior as the rest of the archive and retired the last `loadDisplayWithFallback` call.

- ☐ Deferred, for exact zero-shift before any bytes arrive: capture display-derivative width/height during the backfill (a one-line `sharp` `metadata()` read) into a manifest, thread it through `build-data.js`, and reserve panel/box size from it directly. Requires re-running the backfill with R2 credentials, so it is left as a follow-up.

## Phase 7: Network-level wins ◐

- `<link rel="preconnect">` to the R2 base URL (and to `a.ltrbxd.com` while backdrops remain external) in `index.html`, so the first image request does not wait on DNS/TLS.
- ◐ **Long-lived immutable cache headers on the R2 derivatives — safe given the existing `?v=` cache-bust.** The durable fix for a caching gap found while testing Phase 5: the public `pub-*.r2.dev` origin sends no `Cache-Control` and is not edge-cached, so prefetched (and previously-viewed) R2 images were re-fetched on use — the neighbour preload and thumbnail placeholder only "stuck" for the external-CDN categories (films' Letterboxd posters, books' Goodreads covers), not the R2-hosted ones (music, ephemera). Now written by every upload path: `CacheControl: "public, max-age=31536000, immutable"` in `backfill-display-sizes.js` (display) and `migrate-thumbnails.js` (thumbnails), and on the admin presigned path — `netlify/functions/r2-upload-url.js` signs the value into the PUT and returns it, and `src/admin/lib/upload.js` (`putToR2`) echoes it verbatim (a mismatch would fail SigV4). Model files, whose URLs carry no `?v=`, get a shorter `max-age=86400` instead of `immutable` so they stay replaceable. **Remaining:** re-run `backfill-display-sizes.js --force` and `migrate-thumbnails.js` with R2 credentials to stamp the header onto already-uploaded objects, and smoke-test one admin upload after deploy (the presigned PUT now requires the client to send the signed `Cache-Control`). New admin uploads are already covered.
- ✓ Interim mitigation shipped in `makeItemSheet`: prefetched neighbour images are now *retained* (held in a bounded Map, cleared on sheet close) so their decoded bytes stay in the in-memory image cache until navigation, making the preload stick within a session even while existing R2 objects remain uncached.
- A service worker precaching `thumbnail`/`display` derivatives so return visitors never see a blank.

## Priority

Phases 1–3 attack the actual causes — oversized files, empty backgrounds, deferred fetch — and should land first. The rest are refinements that harden the guarantee.
