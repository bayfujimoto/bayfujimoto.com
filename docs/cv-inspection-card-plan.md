# CV — inspection card with a shared strip and a timeline plate

Plan of record for reworking the CV from a scrolling document box into a
catalog card of the photo card's grammar — the same move the Guide made on
2026-09-05 (`docs/guide-inspection-card-plan.md`). The CV is one record whose
contact strip holds every entry; the plate is the calibrated plate with a year
scale in place of millimetres, the entries drawn as bars and the selected one
lit; the fields column is rebuilt per frame. Covers the content model, the
build, the card, the plate, routing, the admin, and the order of work.

Status: implemented 2026-09-05 (same day), as planned, with Bay's revisions
from the redundancy pass: the `span` row is folded into the `date` row
(`Sept 2023 – June 2024 · 9 mo`, abbreviated so it holds one line; open spans
`· ongoing`), and the accession row keeps `ID · type` as on every other card
(a separate `category` row remains). Also: `mark` was authored on all six
records rather than derived; CV-2026-004 (Weiss) gained the `sort_date` it was
missing so it sorts by its end date; the year range's top is bumped a year only
when `now` would sit within half a year of it. Studies:
`mockups/cv-entries/` (00 today, 01 shared strip + timeline, 02 grid + card per
entry, 03 shared strip + specimen + scans). Decisions taken in the planning
conversation are marked **decided**; the rest are proposals open to revision.

## Purpose

The CV (`makeCVSheet`, `panels.js` ~L708) renders six `cv-entry` records
(`src/content/identity/cv/`) inside the biography's document box: grouped by
category, organization and dates on a line, role beneath, the context note as
paragraphs. It reads well as a résumé and not at all as an archive: nothing on
it is inspectable, the entries have no address, and it is the last surface
besides the biography that does not use the one inspection grammar
(decisions.md → "Labor items — catalog-card inspection", "Guide — inspection
card of desk objects").

The difficulty the CV adds is that its records have **no reproduction**. A
ticket has a scan; a photo has itself; a desk object has a model. A CV entry is
a span of time attached to a name. The plate has to carry something honest for
a record with nothing to scan — and the answer the studies settled on is that
the plate measures what the record actually is: time. The calibrated plate's
grammar (scales, ticks, an origin, a ratio in the head) survives with years for
millimetres, and the whole CV is visible on every frame with the selected entry
lit.

## Decisions taken (2026-09-05)

- **Structure A — one card, shared strip.** The CV is one record, as the Guide
  is; its frames are the entries. Not a browse grid with a card per entry
  (study 02) — that stays available as a promotion path if the CV outgrows a
  strip. **decided**
- **Plate: timeline.** The calibrated plate with a year scale; entries as bars
  in category columns; the selected entry at full strength; open-ended spans
  dashed to a `now` rule. No specimen label, no scans for now (study 03's
  reproduction fallback is noted under Open questions). **decided**
- **Strip frames: typographic tiles** — a short mark (LDO, Rice, SHoP…) over
  the years. Not span glyphs. **decided**
- **Order: most recent first, all categories together** (`sort_date`
  descending, the records' existing order). The plate's columns carry the
  employment/education distinction; the strip does not group. **decided**

## Content model

### `cv-entry` records — one new optional field

```yaml
mark: SHoP        # short label for the strip tile; falls back to a derivation
```

- `mark` is the tile's word: an initialism or a short name that identifies the
  entry at strip size. Optional. When absent the build derives one: the
  organization's initials if it has two or more words with capitals (Low Design
  Office → LDO, SHoP Architects → SHoP by keeping the intra-word capitals of
  the first word when it has them), else the first word (Rice University →
  Rice, Weiss Architecture → Weiss). The derivation is a convenience, not a
  rule — the field wins.
- Everything else the card needs already exists: `title`, `organization`,
  `role`, `category`, `display_date`, `date_start`, `date_end` (absent = open),
  `context_note`, `tags`, `related_ids`. No record is re-authored.
- The admin's `cv-entry` group (`type-fields.js` L185) gains `mark` (text) after
  `role`. The field schema (`src/shared/field-schema.js`) is untouched — the CV
  card does not use `resolveSlots`, it lays its rows out itself, as the Guide
  does.

### What the build adds — `archive.series.identity.subcollections.cv`

`build-data.js` leaves the items as they are and adds two derived things
alongside them:

```js
cv: {
  label: "CV",
  items: [...],                       // as today, sort_date descending
  marks: { "CV-2026-005": "SHoP", … }, // mark per id, authored or derived
  range: { start: 2019, end: 2027 },   // floor(min date_start) … ceil(max(date_end, today)) + 1
}
```

Placing `marks` beside the items rather than on them keeps the public record
identical to the file; `range` is computed once so the plate and the strip
agree and neither reads the clock (the plate's `now` rule is the only thing
that does, client-side).

## The card

### Reuse — Guide mode generalised

`buildCardWrap(item, ctx)` already has a Guide mode: frames as the gallery,
per-frame fields, a model plate. The CV needs the same shape with a different
plate and different rows, so the mode generalises from `guide` to a **frames
mode**:

```js
ctx.frames = {
  frames: [...],                 // the set; each frame is one entry record
  initialKey,                    // id to open on
  onFrame(frame),                // URL follow-through (replace)
  fields(frame, helpers),        // rebuilds the fields column
  plate: { mount(field, api), show(frame), prefetch(frame), dispose() },
  tile(frame) → HTMLElement | null,   // strip cell content; null → <img> from frame.thumbnail
  stripLabel: "entries",
}
```

The Guide becomes the first caller of this contract (its `renderGuideFields`
and model-plate mount move behind `fields` / `plate`; behaviour unchanged); the
CV is the second. `makeGuideSheet` and the new `makeCVSheet` each assemble a
`frames` object and hand it to the card. No third inspection view is written.

### Fields column, per entry

Same builders (`splitRow`, `singleRow`, note block), same registers.

| row | label | value | register | note |
|---|---|---|---|---|
| accession (split) | `ID` / `type` | `CV-2026-005` / `cv-entry` | mono | compact one-line form (`item-card--photo`) |
| title | `title` | SHoP Architects · Bachelor of Architecture | serif | as recorded |
| organization | `organization` | Rice University | serif | **suppressed when equal to the title** (employment records repeat it) |
| role | `role` | Junior Designer | serif | suppressed when absent |
| category | `category` | employment | mono | |
| date | `date` | Sept 2023 – June 2024 · 9 mo | mono | `display_date` as recorded, then the derived duration (`date_start`→`date_end`, or today for open spans, marked `· ongoing`) — one row, so the range and its length are never stated twice |
| note | `note` | the context note, paragraphs | serif prose | suppressed when absent |
| riders | `see also` / `tags` | related entries (step the strip), tags | mono | as the card does today |

The duration is the one new fact and it is a measurement the plate also
draws — the typed row is the canonical statement, the bar the illustration, in
the same relation as `dimensions` and the mm plate.

### Plate — `src/app/timeline-plate.js`

An SVG in the calibrated plate's dress (`.item-card__plate-svg`, `plate-edge`,
`plate-tick`, the 9px mono labels), ~120 lines, no dependencies.

- **Scale**: vertical, most recent at the top (matching the strip's order),
  `range.start` at the bottom edge, `range.end` at the top. Major tick and a
  year label per year on the left, inside the edge as the mm scale sits; minor
  ticks at quarters. The head's scale note prints the range and the division:
  `2019 – 2027 · 1 yr / division`.
- **Columns**: one per category present in the set, in the fixed order
  `employment, education, exhibition, publication, award, other`, labelled in
  small caps along the top edge, a dotted centre line each. Two today. Bars
  that overlap in time within a column step sideways into lanes (RSAP inside
  the B.Arch span).
- **Bars**: every entry drawn, from `date_start` to `date_end`; open-ended
  (`date_end` absent) to the `now` rule, dashed. The selected entry fills at
  full strength with its mark beside it; the rest are outlined and dim.
  Clicking a bar steps the strip to that entry — the plate is a second index
  onto the set.
- **`now`**: a dashed rule at today's date with the label `now`, drawn from
  the client clock. The only thing on the card that changes without a build.
- **Crosshair readout**: hovering the field prints the year-and-month under the
  pointer in the scale-note slot (`Mar 2024`), as the mm plate prints
  `x × y mm`. Enhancement only.
- **No zoom, no pan**: eight years fit the square; a slider would compete with
  the card-swipe for nothing.
- Reduced motion: nothing moves anyway. No WebGL, no fallback needed — this is
  the plate's own SVG.

### Strip

`.item-card__strip` unchanged; each cell's content is a **tile**
(`.cv-tile`, new): the mark in serif over the years in mono (`2023–24`,
`2025–` for open). Cells are fixed sixths as everywhere; a seventh entry
scrolls the strip. The tile is a DOM element, not an image, so the strip's
`<img>` path is bypassed for frames that provide `tile()` — the one change to
the strip builder. Selected tile: border at `--overlay-muted`, as the selected
photo's border is.

### Foot

`↑ prev` · `next ↓` · `04/06`. Nothing else — no onward link (as the Guide
settled), no zoom.

## Routing

`/identity/cv/` opens on the most recent entry. `/identity/cv/?item=CV-2026-005`
opens on that entry — the archive's existing item address, so `related_ids`
from anywhere else in the archive resolve to a CV frame without a new URL
shape. Stepping calls `replace()` (one page's states); the `item` query is the
only thing that changes. `stackDepth` treats `layer: "item"` under
`identity/cv` as the CV sheet itself (depth 2, not a modal at 3) — one special
case in `pushLayerForState`, next to the existing biography/CV branches.

## Admin

- `mark` text field on the `cv-entry` form, with the derivation shown as the
  placeholder so an empty field is legible ("SHoP — derived").
- Nothing else: the CV has no intro or per-set text, so no Guide-style form.

## Retirements

- `.cv-section*`, `.cv-entry*` CSS and the category grouping in `makeCVSheet`.
- The biography keeps `.bio-document*` — it is the last document-box view and
  is not in scope here.

## Accessibility and mobile

- Every fact is in the fields column; the plate is illustration. The SVG gets
  `role="img"` and an `aria-label` naming the selected entry and its span.
- Strip is a `tablist`; `↑/↓` step (the frames-mode keyboard hook, already
  bound); `Escape` returns to the Identity series sheet as today.
- Mobile: the photo card's stacking (accession → plate → rows); the strip
  scrolls with snap; the plate's year labels bump to 12px as the mm plate's do
  at ≤600px. Six tiles at a sixth of ~340px are ~56px squares — the mark stays
  legible at `--text-xs`; the years line drops below 0.65rem only if the mark
  is longer than five characters, so `mark` is capped at 6.

## Order of work

1. **Frames mode.** Generalise the Guide branch of `buildCardWrap` into the
   `ctx.frames` contract; re-point `makeGuideSheet` at it. No visible change.
   Verify the Guide end to end. Commit.
2. **Build.** `marks` + `range` on the cv subcollection; `mark` in the admin
   form and the record template. Commit.
3. **Timeline plate.** `timeline-plate.js` — test standalone in a harness page
   (`mockups/cv-entries/01-…` already draws the same thing; port the drawing,
   then delete the mockup's copy). Lanes, open spans, `now`, click-to-step.
4. **CV sheet.** Rewrite `makeCVSheet` on the frames contract; tiles; router
   (`?item=` at depth 2); retire the document-box CSS for the CV.
5. **Docs.** decisions.md ("CV — inspection card with a timeline plate",
   confirmed); `information-architecture.md` CV section; `admin-interface.md`
   field note; this plan's status line.
6. **Verification.** Desktop + 375px; keyboard-only; deep link to
   `?item=CV-2026-001`; a related-id rider from another record landing on the
   right frame; Back leaving the CV in one step.

## Open questions (not blocking)

- **Scans later.** Study 03 showed a scanned document (diploma, offer letter,
  badge) taking the plate at true scale where an entry has one. The record
  model already allows it (`assets.front` + `dimensions`, as any ephemera).
  If Bay adds one, the frames contract's `plate.show(frame)` can hand such a
  frame to the existing calibrated mm plate instead of the timeline. Nothing in
  this plan prevents it; nothing builds it yet.
- **The biography.** After this, the biography is the only document-box view.
  It is prose, not records, so the box may be right for it — but the question
  is now visible.
- **Category columns beyond two.** Three columns fit the square comfortably;
  five would not. If exhibitions, publications and awards arrive in number,
  the plate can collapse the minor categories into one `other` column and let
  the row carry the distinction. Decide when there is data.
- **The year range's top.** `ceil(max) + 1` gives the `now` rule breathing room
  above the current entry; it also means the scale's top year is empty. Fine
  for a CV that is being lived; revisit if it reads as a gap.
