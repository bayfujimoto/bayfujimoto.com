# Music Display & Archiving

Plan of record for how the **music** subcollection (under Consumption) is modeled,
displayed, and ingested. Living document — updated as decisions land and phases
ship.

Last updated: 2026-06-21.

## Purpose

The music subcollection exists but is unstyled: it registers in
`scripts/build-data.js`, holds three album records under
`src/content/consumption/music/`, and falls through to the default square-cell
browse grid and the standard catalog card. This plan gives music its own display
vocabulary — albums and EPs read as **record sleeves** (12″ squares), songs read
as **picture discs** (circles) — so the two are distinguishable at a glance while
both still show their cover art. It also defines the archival conventions (what a
music record stores, how it is dated and sorted) and the cover-art ingest pipeline.

The driving content is what Bay likes: albums, EPs, and individual songs. The grid
is a record of *when each was logged*, not when it was released.

## Summary

Three release types collapse to two silhouettes. `album` and `ep` render as a
square sleeve; `single` renders as a circular picture disc. Both occupy the same
cell footprint, so **shape** — not size — carries the album-vs-song distinction.
The grid groups by the year an item was *logged* (`sort_date`), newest at the
top-left, consistent with the rest of the archive's browse model. The catalog card
reuses the existing calibrated plate for sleeves and gains a circular "detailed
record" variant (art, label ring, spindle hole, groove sheen) for discs. Cover art
is uploaded by hand through the admin form (stored in R2 like the rest of the
archive's own images).

The `mix` type is dropped — only `album`, `ep`, and `single` are supported.

## Decisions locked

These were settled before drafting (see "Open cells" for what remains):

- **Cover art — manual upload.** Covers are uploaded through the admin music form
  (`assetGroupWithThumb(["cover"])`), stored in R2 with a generated thumbnail like
  the archive's other self-hosted images. (An auto-fetch script — MusicBrainz/Cover
  Art Archive + iTunes — was built and then removed; covers are hand-curated.)
- **Songs — parent album art + link.** A song shows its album's cover (cropped to
  a disc) and links to the album's record via a new `album` field plus a
  `related_ids` reference.
- **Disc treatment — detailed record.** The single's catalog-card plate renders a
  circular reproduction with a label ring, spindle hole, and faint groove sheen.
  Static (not spinning), reduced-motion safe.
- **Sort — log date.** `sort_date` is the date an item was logged; the three
  existing albums get re-dated, with release year preserved in `year`.
- **No `mix` type.** Removed from the schema, template, and type-field map.

## The model

### Release types and silhouettes

| item_type | silhouette | grid cell | catalog-card plate |
|---|---|---|---|
| `album` | square sleeve | square | existing rectangular plate |
| `ep` | square sleeve | square | existing rectangular plate |
| `single` | circular picture disc | square (disc inscribed) | new circular plate variant |

### Dimensions (drives true-scale rendering)

The browse grid and the catalog-card plate both size reproductions from the
`dimensions` field ("W x H" in mm). To keep albums and songs the same footprint:

- Sleeve (`album` / `ep`): `dimensions: 314 x 314` — a real 12″ LP jacket. Against
  the plate's `PLATE_MM = 325` ("LP-and-a-bit"), a sleeve nearly fills the field as
  the plate was designed to do.
- Disc (`single`): `dimensions: 300 x 300` — a 12″ disc face. The square value is
  honest for measurement; the circular silhouette is applied visually.

These defaults should be filled by `item_type` at ingest/build time so they are
never hand-entered.

### Dates

- `sort_date` — the day the item was logged. Sorts the subcollection (descending)
  and supplies the grid's year grouping (`groupByYear` in `src/app/panels.js`).
- `display_date` — the logged date, formatted, shown in the card's date row.
- `year` — release year, shown on the card as the "released" slot.

This is a convention, not new code: the grid already groups by `sort_date`'s year.
The only change is the discipline of putting the log date there and the release
year in `year`.

### Song → album link

A `single` record carries:

- `album` — the parent album's title (string), shown in the card's slot 2.
- `related_ids` — a reference to the album's record (`MUSIC-YYYY-NNN`), surfaced as
  a "see also" rider on the card.

### Typed slots (catalog card)

Splitting today's single `MUSIC` config in `src/shared/field-schema.js` into two:

| item_type | creator | slot 1 | slot 2 | slot 3 |
|---|---|---|---|---|
| `album` / `ep` | artist (always) | year (released) | label | rating |
| `single` | artist (always) | year (released) | album | rating |

This resolves field-schema.md's open cell #1 ("label / source is weak for
singles"): singles show their album, releases show their label.

## Display — browse grid

A new `item-grid--music` modifier in `makeBrowseSheet` (`src/app/panels.js`),
parallel to the existing `item-grid--books` and `item-grid--films` branches:

- Square cells, grouped by log year, newest at the top-left.
- `album` / `ep`: cover fills a sleeve cell (a subtle sleeve edge/shadow optional).
- `single`: cover circular-clipped into a disc with a center label and spindle
  hole, inscribed in the same square cell.
- Relative sizing via `dimensions` is retained for honesty; the silhouette carries
  the read.
- Mobile (≤600px): 2-column collapse, tap-only, 44×44px minimum targets,
  legible labels — per the mobile requirements in `CLAUDE.md`.

## Display — catalog card

`makeItemSheet` / `buildPlate` (`src/app/panels.js`):

- `album` / `ep`: the existing rectangular plate, reproduction inset at true LP
  scale (314 mm) against the millimeter rulers. Minimal change.
- `single`: a new circular plate variant — circular reproduction, label ring,
  spindle hole, faint groove sheen, measured by diameter. Static and
  reduced-motion safe. Must degrade to a still circular image with metadata intact
  (no information depends on motion or 3D).

## Ingest

- **Cover art — manual upload.** The admin music form exposes a cover upload
  (`assetGroupWithThumb(["cover"])` in `src/admin/forms/type-fields.js`); the file
  goes to R2 with a generated thumbnail, and the record stores the filenames.
  (An auto-fetch script was built and removed — see the note in "Decisions
  locked".)
- **Auto dimensions**: set the sleeve/disc `dimensions` default from `item_type`
  during build so entry stays minimal.
- **Admin**: add the `album` field for singles; otherwise the existing music form
  carries over.

## Phased plan

Status key follows `docs/decisions.md`: not started / in progress / done.

### Phase 1 — Schema and conventions · not started
Goals:
- Drop `mix` from `src/shared/field-schema.js`, the template
  (`src/content/_templates/consumption-music.md`), and `type-fields.js`.
- Split `MUSIC` into release (`album`, `ep`) and track (`single`) configs with the
  slots above; add the `album` field.
- Establish the log-date convention (`sort_date` = logged; `year` = released).
- Auto-fill `dimensions` by type.
- Re-date and backfill the three existing records (`MUSIC-2026-001..003`): set
  `sort_date` to each file's git add-date unless a specific date is given, move
  release year into `year`, add `dimensions`.

Output: schema + template + three migrated records that group by log year.

### Phase 2 — Cover art · superseded (manual upload)
An auto-fetch script (`scripts/enrich-music-covers.js` + `scripts/utils/music-covers.js`,
MusicBrainz/Cover Art Archive + iTunes) was built and backfilled the first records,
then removed by decision. Covers are now uploaded by hand through the admin form
and stored in R2 (with a generated thumbnail) like the archive's other images.

Output: music records carry `cover` + `thumbnail` via admin upload.

### Phase 3 — Browse grid · not started
Goals:
- Add `item-grid--music` with sleeve (square) vs disc (circle) rendering.
- Verify log-year grouping, relative sizing, and mobile behavior.

Output: a music grid that distinguishes albums/EPs from songs at a glance.

### Phase 4 — Catalog card · not started
Goals:
- Circular "detailed record" plate variant for `single`.
- Confirm sleeves still render correctly on the rectangular plate.
- Reduced-motion and no-image fallbacks.

Output: inspectable sleeves and picture discs.

### Phase 5 — Admin and docs · not started
Goals:
- Admin: `album` field for singles; auto dimensions.
- Update `docs/decisions.md` (record the locked decisions), `docs/content-model.md`
  (music entry: log-date convention, `album` field, dropped `mix`), and
  `docs/field-schema.md` (resolve open cell #1; split release/track slots).
- Final mobile pass.

Output: documented, maintainable music ingest and display.

## Open cells

Worth a decision before the relevant phase, but non-blocking:

1. **Song → album relationship type.** `part_of` (a song belongs to an album) vs
   `version_of`. Leaning `part_of`. Revisit in Phase 1.
2. **Sleeve chrome.** Whether the grid sleeve gets a printed edge/shadow or stays a
   flat square. Revisit in Phase 3.
3. **`label` for releases.** Keep `label` as album/EP slot 2, or drop to two slots.
   Kept by default (it is a genuine archival fact). Revisit in Phase 1.

## Files touched

- `src/shared/field-schema.js` — types, slots, `album` field, drop `mix`.
- `src/content/_templates/consumption-music.md` — drop `mix`, add `album`.
- `src/content/consumption/music/*.md` — re-date, backfill.
- `src/content/_id-counters.yaml` — `MUSIC` counter (currently 3).
- ~~`scripts/enrich-music-covers.js`~~ — built then removed; covers are manual upload.
- `scripts/build-data.js` — auto dimensions by type (if done at build time).
- `src/app/panels.js` — `item-grid--music`; circular plate variant.
- `src/admin/forms/type-fields.js` — `album` field for singles.
- CSS (public site) — sleeve and disc styling, mobile rules.
- `docs/decisions.md`, `docs/content-model.md`, `docs/field-schema.md` — updates.
