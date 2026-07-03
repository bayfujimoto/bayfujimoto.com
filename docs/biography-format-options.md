# Biography — format options

A working note comparing four renderings of the biography-as-curation, for
decision before implementation. It is exploratory, not yet a decision; when one
is chosen it should be recorded in `docs/decisions.md`.

## Premise

The biography stops describing the subject in prose and instead assembles a
chronological sequence of archived items, so a reader infers a life — and its
influences — from material evidence rather than self-description. Scrolling runs
earliest to most recent; nostalgic beginnings (childhood games, juvenilia) sit at
the head, and a viewer reads influence forward from there. The prose renderer is
to be replaced; the date/version selector has already been removed (most-recent
version only).

## Shared foundation (common to all four)

Data. The biography record carries one ordered field — `path` — a list of item
IDs drawn from any series (Labor, Creation, Consumption, Accumulation). At build
time each ID resolves against `archive.json` to its title, `item_type`,
`display_date`, `sort_date`, primary asset, and route. Unresolved or unpublished
IDs are dropped silently rather than faked, consistent with the card's existing
field-suppression rule.

Order. Entries sort ascending by `sort_date`. For Consumption this is the
encounter date (read / watched / played), not the release year, so "when it
entered the subject's life" is the native axis and the influence arc is automatic.
A manual override remains available for ties or deliberate juxtaposition.

Reach. Every entry deep-links to its item view via `?item=<id>`, so the biography
is an index into the archive, not a terminus.

Growth. The subject adds early records with their true period dates; these float
to the head of the sequence. A record needs only minimum-viable metadata to appear.

Constraints (from `CLAUDE.md`). Keyboard reachable; reduced motion respected; no
information dependent on 3D; mobile uncluttered (meta hidden below 600px, the
breadcrumb carries location); touch targets at least 44px; overlay text no smaller
than 0.65rem.

## Option A — Catalog-card stack

Reading. The subject as a run of accessions, each object inspected in miniature.

Structure. A vertical scroll of compact record cards. Each card is the item view's
fields column — ruled `ID · type`, title, date, one typed slot, optional note —
set beside a small plate or thumbnail.

Reuse. The `item-card` fields (`overlay-label` / `overlay-value`, `item-card__row`
and its split rows), the `titleIsGiven` register (monospace for transcribed titles,
serif for archivist-devised ones), and the `bio-document` scroll and caret. The
calibrated plate reduces to a fixed thumbnail — zoom, pan, and flip are dropped.

Data. Nothing beyond `path`.

Interaction. The whole card links to the item view; scroll caret; tab order top to
bottom.

Chronology. Implicit — a date is printed on each card, but there is no scaffolding.

Mobile. Single column; the plate shrinks; already the natural layout.

Strengths. The most faithful reuse; rich per-item metadata; immediately legible as
"your archive."

Costs. Tall with many entries; chronology is stated, not felt; a uniform rhythm
can flatten emphasis.

## Option B — Card stack on a time spine (recommended)

Reading. The same accessions laid against a measured chronology, so influence
becomes visible as strata.

Structure. Option A's cards pinned to a left vertical axis. Year ticks and period
bands ("childhood", "Rice", "Low Design Office") label the axis as it scrolls; each
card attaches at its date, and gaps in time read as gaps in the spine.

Reuse. All of Option A, plus `groupByYear` (already used in Browse) for the ticks,
and the Film-ribbon precedent in which time flows along an axis. Period bands are a
thin new layer — a small table of labelled date ranges, or derived from CV entries.

Data. `path`, plus optional named periods (label + date range). Periods could be
generated from CV date ranges rather than hand-authored.

Interaction. As A. The axis is orienting rather than interactive, or minimally so
(click a year to jump).

Chronology. Explicit and felt — the reason the format exists.

Mobile. The axis narrows to a slim gutter of year ticks; period labels collapse
into the card meta to preserve overlay width.

Strengths. Directly serves "see my influences as I scroll"; keeps the card's
richness; converts a list into a timeline without introducing a new object type.

Costs. The most layout work of the four; the axis must degrade gracefully on narrow
screens.

## Option C — Contact-sheet of plates

Reading. Influences as images first — the eye before the caption.

Structure. A scrolling field of calibrated plates or thumbnails at true relative
size, grouped by year, each with a one-line caption (title · year). Closer to an
archival contact sheet or a light table than to a document.

Reuse. The Browse `item-grid` machinery — true-relative-size thumbnails via
`dimensions` / `maxDim`, year grouping, the books-at-true-scale rendering, and the
film ribbon — is directly applicable.

Data. `path`; benefits from each item carrying a primary asset and `dimensions`
(otherwise it falls back to natural aspect ratio).

Interaction. The plate links to the item; hover or focus reveals a fuller caption,
with a tap equivalent on mobile per the no-hover rule.

Chronology. Grouped by year — legible, but coarser than B.

Mobile. Reflows to fewer columns; the touch-scroll strip conventions already
specified in `CLAUDE.md` apply.

Strengths. The most visual and most "archive"; fastest to skim; leans on the most
mature existing code.

Costs. Metadata recedes; text-only records (notes) have no plate and need a
placeholder; less suited to work whose meaning is verbal.

## Option D — Accession ledger by year

Reading. The finding aid itself — a container list read top to bottom.

Structure. Ruled rows grouped under year headings; each row is date · type · title
· id, the sparest catalog line. No images.

Reuse. The CV sheet rendering (already a chronological ruled identity list),
`overlay-label` / `overlay-value`, `groupByYear`, and the `bio-document` scroll.

Data. Nothing beyond `path`.

Interaction. The row links to the item; dense keyboard navigation.

Chronology. Explicit via year headings; grouped, not flat.

Mobile. Trivial — a single column of rows; the most robust small-screen behavior.

Strengths. The sparest and most document-honest; cheapest to build and maintain;
scales to hundreds of entries.

Costs. Austere; the least emotional; images — often the whole point of juvenilia —
are absent.

## Comparison

| Format | Chronology | Imagery | Reuse | Build cost | Fits the influence arc |
| --- | --- | --- | --- | --- | --- |
| A — Card stack | stated | small | high | low | adequate |
| B — Card stack + time spine | felt | small | high | high | strongest |
| C — Contact sheet | grouped | primary | highest | medium | strong, visual |
| D — Ledger by year | grouped | none | high | lowest | weakest |

## Recommendation

Option B best satisfies the stated goal — a viewer scrolling from nostalgic
beginnings and reading influence — while reusing Option A wholesale and the Browse
year-grouping already in the codebase. Option C is the strongest alternative if the
biography should feel visual rather than documentary, and demands the least new
code. Option A is a minimal first step. Option D is the austere extreme, better kept
as a secondary "index" view than as the primary biography.

A pragmatic path: build A first (pure reuse), then add the spine to reach B; hold C
in reserve as a toggleable "plates" view if a more visual reading is wanted.

## Open questions

Should periods be named by hand or derived from CV date ranges?

Do text-only records (notes) belong in an image-forward format like C, or should the
biography exclude them there?

One biography view, or a primary reading (B) with a secondary plates or ledger toggle?
