# Catalog card — analysis and as-built record

Status: implemented as the default item inspection view (June 2026).
Code: `src/app/panels.js` (`makeItemSheet`, `buildPlate`), `src/styles/main.css`
(`.item-card*`). Mockup lineage: `mockups/item-inspection/` (seven variants
compared; the card won). Decision recorded in `docs/decisions.md`.

## What the form is doing

The card borrows a working genre, not a style. The museum typkort — the
Statens historiska museer card that prompted this direction — belongs to a
family of paper technologies that organized knowledge before databases did:
Otlet's bibliographic cards, the library card catalog, the excavation
register. Markus Krajewski's *Paper Machines* (MIT Press, 2011) traces how
the card's fixed fields and uniform format made records comparable and
collections traversable; the same properties are what make the layout right
here. A card asserts that the item is *an entry in a system*, which is the
site's thesis: a life described through material evidence rather than
narrative.

Three specific things carried it over the other six mockups:

1. **Fields discipline the writing.** A labeled grid resists the drift
   toward portfolio copy, the way ISAD(G) or the SPECTRUM standard
   constrain institutional cataloguers. "place: Chamonix, France" cannot
   become a paragraph about the mountains.

2. **The calibrated plate makes the archive comparable.** With a constant
   325 mm field and a top-left origin, every record carries its size as
   visual fact: a lift ticket sits small in a large field; an LP sleeve
   nearly fills it. Scale becomes a property of the collection, not the
   individual image — the convention archaeology plates have used for a
   century. The empty area of the plate is not wasted space; it is
   information.

3. **The image is subordinated to the record.** The reproduction occupies a
   cell, like the drawing on the typkort — evidence attached to a document,
   the inverse of the standard portfolio hero image.

## How the critiques resolved (as built)

**"Scale 1:1 is a fiction" → relational annotations.** A screen millimetre
is not a millimetre, so the card never claims a ratio against reality. The
scale note reads "field 325 mm"; departures are declared against the
standard field: oversize items get an integer-multiple field ("field
650 mm · reduced 1:2"), items under 50 mm get a fifth-size field ("field
65 mm · enlarged 5:1") so a stamp does not become a speck.

**"Borrowed labels are costume" → site vocabulary.** The typkort's Inv. nr
/ Typ / Neg. nr were homage in the mockup and were not carried into
production. Labels come from the content model: type, date, place, event,
source, dimensions, note; the image cell is labeled "plate"; the record id
and series form the card's headline.

**"One layout cannot serve five series" → suppression, not schemas (yet).**
The field list covers the union of series metadata (author, year, artist,
director, rating, place, event, source…) and unrecorded fields are
suppressed rather than faked. This is the simplest version of the
per-series schema argument; true per-series field *ordering* remains open.
Biography, CV, and labor keep their custom views — the card did not
overwrite them — and the `inspection:` frontmatter field remains the hook
for future per-record modes, as the content model anticipated.

**"Density vs. atmosphere" → the card is the terminal view.** An escalated
"full view" (the prior centered default, reached by tapping the plate) was
built first and then deliberately removed: two nested registers proved more
machinery than the inspection needed. What the full view carried —
magnification and flipping — moved into the plate foot instead: an
"overturn" text button for recto/verso and a zoom slider (pinch on the
plate drives the same value). Zoom shrinks the visible field span and
redraws the plate, so the reproduction enlarges from the origin and the
scales relabel to match — the calibration stays honest at every zoom rather
than being contradicted by a transformed image. Escape and clicking the
surround exit to browse.

**"Two dimensions flatten three."** Unresolved, deliberately. The
`dimensions` schema is "W x H" in mm; depth is a content-model question
before it is a layout one. The card will print a third number if the
schema ever carries one.

## Shipped features

- Calibrated plate: mm scales attached to the inside of the top and left
  field edges, ticks pointing inward, labels in the outer margin; the
  reproduction sits inset at the scale origin at true proportion.
- Relational scale note; integer reduction for oversize; 5:1 enlargement
  field for items under 50 mm.
- Crosshair readout: pointer over the plate shows live field coordinates
  ("112 × 112 mm") in the scale-note slot; restores on leave. Enhancement
  only — the typed dimensions row stays canonical.
- Zoom slider in the plate foot (keyboard-accessible range input, 1–4×),
  with pinch-to-zoom on the plate driving the same value; magnification is
  clipped to the reproduction cell and leaves the field scales untouched.
- Recto/verso: when `assets.back` exists, an "overturn" button in the
  plate foot swaps the reproduction and labels it recto/verso.
- Status stamp: any non-published status renders as a faint rotated
  overprint — the card wears its status rather than listing it.
- See-also riders: `related_ids` as underlined rider buttons that navigate
  within the series; tags as a closing row.
- Degradation ladder: dimensions absent → plain image cell, scales hidden,
  note reads "dimensions not recorded"; reproduction absent or failing to
  load → "no reproduction" line; nothing is ever invented.
- Accessibility: the plate SVG is `aria-hidden` (decorative); the zoom
  slider and overturn button are labeled, focusable controls; dimensions
  live as text in the fields column; all touch targets ≥ 44 px; reduced
  motion respected.
- Mobile: single column under 600 px, fields above plate, scale labels
  enlarged to stay above the legibility floor, card scrolls within the
  overlay without trapping the breadcrumb.

## Still open

- **Per-series field schemas** — resolved (June 2026). Field selection and
  ordering now come from a single declarative schema keyed by `item_type`
  (`src/shared/field-schema.js`), read by both the card and the admin. See
  `docs/field-schema.md`.
- **Em-dash policy**: whether suppressed fields should instead render
  "condition: —" to record that nothing was recorded. Suppression shipped;
  the more archival alternative is a one-line change.
- **True-size calibration**: a one-time user calibration (match an
  on-screen credit card to a real one; persist px/mm) would make the field
  physically true on that device. Progressive enhancement; fits the
  project's character.
- **Depth (W × H × D)** in the content model.
- **Unit toggle** (mm/in), mm canonical.
- **Print stylesheet**: the card is the one view that would print
  beautifully — light theme, A6, one record per card. An archive that can
  re-enter paper has a certain integrity.
- **Magnification bound**: the 5:1 small-item field has no lower bound yet;
  sub-10 mm items (a button, a pin) may want 13:1 (field 25 mm).
- **Reduction bound**: beyond roughly 1:10 the ticks are noise; very large
  items should drop ticks and keep only the declared ratio.
- **Irregular shapes**: `dimensions` describes a bounding box; the plate
  silently implies rectangularity. A "bounding" qualifier in the
  description would be honest.
- **Multi-part records**: labor projects keep their own view, but if a
  standard record ever carries several physical parts, use numbered plates
  — never stretch one plate to hold several objects, which breaks the
  scale logic.
- **Dark photographs**: the plate puts a barely-lighter ground
  (`--hover-bg`) behind reproductions; verify against real scans of dark
  objects once assets are in R2.

## Edge cases covered by the implementation

No dimensions; unparseable dimensions; no assets; asset 404 (error handler
degrades to "no reproduction"); oversize (integer-ratio field); sub-50 mm
(enlarged field); end-of-scale label collisions (last major label is
suppressed near the field edge); long values wrapping in field rows;
draft/partial status (stamp); records reached by arrow keys or see-also
riders re-render the full card with zoom reset; Escape and clicking the
surround outside the card exit to browse, like the veil.
