# Brochures — folded and open states

Plan of record for showing folded ephemera (brochures, fold-out guides, folded
maps) in their **open** state — the unfolded inside and the unfolded outside — on
the catalog card, alongside the existing closed recto/verso, with one honest scale
across all four views. Covers the record model, the plate's dimensioning rules, the
card controls, the browse grid, and the admin form.

Status: implemented 2026-09-03 (open cells resolved as proposed: inside / outside; unfold lands on the inside; extent autofills "1 <type>" for folded records; grid hint deferred). Last updated: 2026-09-03.

## Purpose

Four accumulation records are brochures today (EPH-2026-009, -010, -019, -020) and
each is scanned only as a closed object: `assets.front`, optional `assets.back`,
one `dimensions` value. A brochure's content is on its inside, and the outside
spread (cover + back cover + flap) is a different object from the closed verso.
Three fold families are in the collection: half-fold (2 panels), tri-fold / letter
fold (3 panels), and accordion / concertina (N panels). A pocket fold-out guide is
an accordion.

`docs/rendering-strategy.md` already anticipates this under "Folded or layered
documents": *alternate states rather than full physics simulation*. This plan is
that — two states, each with two faces, no animation of the fold itself.

## Summary

- A record stays **one object with one canonical size**. `dimensions` keeps meaning
  the closed size (W x H mm), exactly as today; it drives the browse grid and is
  the default plate view. A folded record adds `fold`, `panels`, and
  `dimensions_open` (the unfolded W x H).
- Two new asset roles, `inside` and `outside`, hold the open state. `front` /
  `back` remain the closed recto / verso. Filenames follow the existing
  `<id>-<role>` rule: `EPH-2026-019-inside.jpg`, `EPH-2026-019-outside.jpg`.
- The card foot gains an **unfold / fold** control beside **overturn**. Overturn
  flips within the current state; unfold switches states. The asset label reads
  `closed · recto`, `closed · verso`, `open · inside`, `open · outside`.
- **One scale across states.** The plate's field ratio is computed from the larger
  state (open), and that ratio is held for the closed state too, so folding and
  unfolding changes the object's *extent* on the plate, never its *scale*. Zoom is
  preserved across the switch; pan resets to the origin.
- Behaviour keys on the presence of `fold`, not on `item_type: brochure`, so a
  folded map catalogued as `document` or a folded `handout` gets the same
  treatment without a schema change.
- The grid is unchanged: closed thumbnail, scaled by closed `dimensions`.

## The physical facts the model has to respect

- A folded piece has two sizes: closed (as it sits in the file) and open (flat).
  Both are measurements, not derivations. A tri-fold's open width is *not* exactly
  3 × closed width: the tucked panel is cut 2–3 mm narrower so it folds in cleanly,
  and the closed width equals the widest panel. An accordion's panels are usually
  equal but the sheet may have a trimmed end panel. So the admin may *suggest*
  the open width from the fold type, but the stored value is measured.
- Height can also change: a half-fold along the long edge halves the height, not
  the width. `dimensions_open` therefore carries a full W x H, and the model never
  assumes which axis the fold runs along.
- Closed views: recto = front cover panel; verso = whatever panel faces out at the
  back (for a tri-fold, usually the flap or the back cover). Open views: inside =
  the face you see having opened it (the interior panels); outside = the same
  sheet turned over (cover, back cover, flap, in one strip). The closed recto is
  therefore a crop of the open outside — this redundancy is accepted, because the
  closed verso is a real view of the object as filed, and because the closed
  scans exist already.
- An accordion's two faces are both "inside" in the sense that neither is hidden
  when closed, but "inside / outside" still names them unambiguously if the
  archivist decides which face carries the title panel: that face's reverse is
  the outside.

## Record model

Additions to the ephemera front matter (all optional; a record without `fold` is
flat and renders exactly as today):

```yaml
id: EPH-2026-019
item_type: brochure
fold: accordion          # half | tri | accordion   (absent = flat)
panels: 8                # panel count on one face; optional; default 2 / 3 / — by fold
dimensions: 89 x 200     # CLOSED, W x H mm — canonical; grid + default plate
dimensions_open: 712 x 200   # OPEN, W x H mm — measured
extent: 1 brochure
assets:
  front: EPH-2026-019-front.jpg        # closed recto
  back: EPH-2026-019-back.jpg          # closed verso
  inside: EPH-2026-019-inside.jpg      # open, interior face
  outside: EPH-2026-019-outside.jpg    # open, exterior face
  thumbnail: EPH-2026-019-front-thumb.jpg   # always the closed recto
```

Rules:

- `dimensions` never changes meaning. Every consumer that reads it today (grid
  relative scale, `parseDimensions`, `fitZoom`, the physical row) keeps reading the
  closed size. This is the single most important consistency rule: the grid's
  relative-size logic compares closed objects, as they lie in the file.
- `dimensions_open` is only read by the card, and only when the open state is
  shown or when the plate ratio is chosen (below).
- `fold` values are the three families. `panels` is the count on one face
  (tri = 3, half = 2, accordion = as counted). It is descriptive metadata for the
  card row and for the admin's open-width suggestion; it is never used to derive
  a stored size.
- The `thumbnail` stays the closed recto's derivative. `inside` / `outside` are
  `skipThumbnail` roles in the admin (same flag the film backdrop uses) so a late
  upload of the open scan never steals the thumbnail.
- `assets.inside` / `assets.outside` are independent: a record may carry one
  without the other. The unfold control appears when either exists; overturn in
  the open state appears only when both exist.
- `RECORD_ONLY` in `src/shared/field-schema.js` gains nothing: `fold` and
  `dimensions_open` both surface on the card (below). `panels` is folded into the
  fold row's text, so it also needs no row of its own; add it to `RECORD_ONLY`.

Template: `src/content/_templates/ephemera.md` gains the three keys and two
asset roles as blank lines, with `item_subtype:` (present in the template today,
never read anywhere) retired in favour of `fold`.

## Dimensioning on the plate

Today `buildPlate(item, dims, …)` derives the field ratio from the dims it is
handed: standard 325 mm field, integer reduction `1:ceil(max/325)` above that,
5:1 enlargement below 50 mm. If the closed and open states were each rendered
with their own dims, a 200 × 89 tri-fold would sit at 1:1 in a 325 field and its
594 × 89 open state would drop to 1:2 in a 650 field — the object would appear to
*shrink* on unfolding. That contradicts the plate's whole claim (true proportion
at a stated reduction).

Rule: **the ratio is a property of the record, not of the view.**

- Compute `ratioDims` = the state with the larger max dimension (in practice the
  open state). `buildPlate` gains an options argument `{ ratioDims }`; when
  supplied, the ratio and base field span come from `ratioDims` while the
  reproduction box, pan clamp, and everything else come from the state's own
  `dims`. Flat records pass nothing and behave as before.
- `fitZoom` (the opening zoom that fits the larger dimension to ¾ of the field)
  is evaluated once per card against `ratioDims`, so the closed state opens at the
  same zoom the open state would. Worked example, tri-fold 200 × 89 closed,
  594 × 89 open: ratio 2, field 650 mm, fitZoom = min(6, max(1, 0.75·650/594)) = 1.
  Closed occupies 31 % of the field width; unfolding extends it to 91 %. Pocket
  guide 89 × 200 closed, 712 × 200 open: ratio 3, field 975; both states at 1×;
  unfolding runs the strip across 73 % of the field.
- Zoom is kept across fold / unfold (the slider value does not move); pan resets
  to (0, 0) so the origin corner of the new state is in view — the same rule the
  photo card applies on stepping frames (`resetPan`). Overturn keeps both zoom and
  pan, as it does now.
- The scale note is unchanged in form — `field 650 mm · reduced 1:2 · 1.5×` — and
  because the ratio is per record it reads identically in both states. It gains
  the state word only through the asset label, not the note.
- The **physical row** shows both sizes so the typed record stays canonical:
  `dimensions  200 × 89 mm · open 594 × 89 mm`. The `≈` estimated prefix is not
  used here (both are measured); if an open size was auto-suggested and never
  measured, the admin should not have saved it (see admin, below) — there is no
  `dimensions_open_estimated`.
- The **fold row**: brochures get a third slot so the card reads
  `place / source / fold` with a value like `tri-fold · 3 panels` or
  `accordion · 8 panels`. Implemented as a `BROCHURE` config in `TYPES`
  (`{ ...EPHEMERA, slots: ["place", "source", "fold"] }`) plus `FIELDS.fold`; other
  ephemera types show the row only when `fold` is set (resolveSlots already
  suppresses empty optional slots — confirm, else special-case). Rendering
  `fold` + `panels` into one value is a card-side formatter, mono register (a
  given fact).

## Card controls

Plate foot, left group, in the existing text-button register (`item-card__flip`):

```
overturn   unfold          closed · recto          zoom ────────
```

- `unfold` toggles the state and relabels itself `fold`. Shown only when
  `assets.inside || assets.outside`.
- `overturn` flips within the current state. In the closed state it needs
  `assets.back`; in the open state it needs both `inside` and `outside`. When the
  far face is absent the button is hidden for that state (not disabled), matching
  today's behaviour for records with no `back`.
- Asset label: `closed · recto`, `closed · verso`, `open · inside`,
  `open · outside`. Flat records keep `recto` / `verso` / `1/1` unchanged — the
  `closed ·` prefix appears only on folded records, so nothing shifts on the
  existing cards.
- State machine: `{ state: "closed"|"open", face: "a"|"b" }` → asset by lookup
  `{closed: [front, back], open: [inside, outside]}`. Entering the open state
  always lands on `inside` (the reason you unfold); returning to closed lands on
  `recto`. Both are simpler than remembering the last face and read as the
  natural motion of the object.
- Loading: `loadReproProgressive(reproImg, side, null, showNone, fullVariants(side))`
  as overturn does today — hold the current face until the next decodes, no
  thumbnail phase. On card render, idle-prefetch the other three faces' display
  derivatives (the photo card's `prefetchFrame` pattern, retention is small here).
  The sheet-level neighbour prefetch stays closed-recto only.
- Keyboard: no new binding. ↑/↓ remain the gallery stepper. (If a key is wanted
  later, `u` for unfold is free; keep it out of this phase.)
- Motion: none. The face swaps as overturn swaps today. No fold animation —
  reduced-motion is therefore trivially respected, and the plate's calibration
  claim is never mid-transition.
- Mobile: the foot's control group already wraps; a fourth token fits at 375 px
  because the asset label shortens (`open · in` is not needed — `open · inside`
  measures under 80 px in the mono at 0.65 rem). Verify at 375 px in the
  headless recipe.

## Browse grid and constellation pages

No change. The cell shows the closed thumbnail scaled against the subcollection's
largest *closed* dimension, which keeps a folded guide the size of a ticket next
to tickets — the way they lie in the flat file. Showing open thumbnails in the grid
was considered and rejected: it would make `dimensions_open` a second input to the
relative-scale pass and break the "objects as filed" reading of the contact
sheet. A tiny fold glyph in the cell is deferred (open cell #2).

## Admin

`src/admin/forms/type-fields.js`, `form-renderer.js`, `field-schema.js`,
`lib/upload.js`.

1. **Fold field.** `FIELDS.fold = { label: "fold", mono: true, options: ["", "half",
   "tri", "accordion"], example: "half / tri / accordion" }`. `schemaMetaGroup`
   maps a registry entry with `options` to `type: "select"` instead of `type:
   "text"` (one-line change). `panels` is a plain numeric text field in the same
   group, placeholder `e.g. 3`. Both appear for every ephemera type — a flat
   record leaves them blank — so a folded handout needs no type switch.
2. **Open size.** `physicalFields` returns `extent`, `dimensions`, and
   `dimensions_open` (label `open dimensions`, placeholder
   `e.g. 594 x 89  (mm, W x H, unfolded)`). A small `≈ suggest` affordance beside
   it fills `panels × closedW x closedH` (or `closedW x panels × closedH` when the
   fold is half and the closed piece is landscape — offer both, the archivist
   picks) into the *placeholder*, never the value: the stored size must be
   typed, i.e. measured. This is the same discipline as the card's `≈` rule for
   books, applied one step earlier.
3. **Open scans.** In `makeInspectionAwareAssets`, card mode renders two more
   upload fields when `fold` is set: `inside` and `outside (optional)`, both
   `allowCutout: true` (they are scanned on the carrier sheet like the closed
   faces), both `skipThumbnail: true`. The section re-renders when `fold` changes,
   the way it already re-renders when the inspection mode changes — wire the
   fold select's change handler to the same rebuild.
4. **Validation (soft).** On save, if `fold` is set and `dimensions_open` is
   blank, or `inside` exists without `dimensions_open`, the status line warns
   ("open state has no measured size — the plate will fall back to the closed
   size"). Not blocking: partial records are the archive's normal condition.
5. **Upload naming.** `uploadImageAsset(file, itemId, "inside")` already yields
   `<id>-inside.<ext>` and the standard thumb/display derivatives; nothing to add
   in `netlify/functions`. Rotate (⟲/⟳) and cut-out work unchanged per field.
6. **Serializer / build-data.** Pass-through. `resolveAssetPaths` resolves any
   string value under `assets`, so `inside` / `outside` resolve like `back`.
   No build-time derivation of `dimensions_open`.

## Site fallbacks

- `fold` set, no `dimensions_open`: the open state renders with the closed dims as
  its box (the scan fills a closed-size box — visibly wrong but not broken) and
  the scale note appends ` · open size not recorded`. Better: render the open
  state as an *undimensioned* plate (unlabelled scales, image fills the field),
  which is the existing honest state for "no measurement claim". Adopt the
  latter.
- `dimensions_open` set, no open scans: no unfold control; the physical row still
  shows the open size (it is a fact about the object).
- Records with none of the new keys: byte-identical rendering to today.

## Migration of existing brochures

EPH-2026-009 (Deroubaix), -010 (de Amaral), -019 and -020 (Seafood Watch
guides). For each: set `fold` and `panels`, measure and record
`dimensions_open`, scan inside and outside on the carrier sheet and upload through
the admin (cut-out on). 009 and 010 have no `dimensions` yet — measure closed
first, since the plate ratio depends on both. The two guides, already dimensioned
at 200 × 89 closed, are the first test case: they are accordions, and the open
strip will exercise the 1:3 / 1:4 reduction and the horizontal pan clamp.

## Implementation order

1. `field-schema.js`: `FIELDS.fold`, `FIELDS.dimensions_open`, `BROCHURE` type
   config, `panels` in `RECORD_ONLY`, `physicalFields` extension, select support in
   `schemaMetaGroup`. Update `docs/field-schema.md` tables.
2. `panels.js`: `parseDimensions(item, "open")`; `ratioDims` option on
   `buildPlate`; `fitZoom(ratioDims)`; state machine + unfold control + labels in
   the card foot; physical-row text; fold slot formatter; prefetch of faces;
   undimensioned fallback for the open state.
3. `form-renderer.js` / `type-fields.js`: fold-aware asset section, open-size
   field with suggestion placeholder, soft validation.
4. Template + `docs/content-model.md` (ephemera fields) + `docs/decisions.md`
   entry once Bay confirms the open cells.
5. Headless test (the recipe in project memory): a tri-fold and an accordion
   record injected into `archive.json`, screenshots of all four faces at 1× and
   zoomed, 375 px foot layout, and a flat ticket to confirm no regression.
6. Migrate the four records.

## Open cells

1. **Face names.** `inside / outside` (proposed: unambiguous for folded matter)
   versus `recto / verso` carried into the open state (`open · recto`) for
   register consistency. The proposal keeps recto/verso for the closed object
   only.
2. **Grid hint.** A small mark in the cell for folded records — deferred; the
   grid deliberately shows objects as filed.
3. **Landing face on unfold.** Proposed `inside`. Alternative: remember the last
   face per state within the card's lifetime.
4. **Accordion with content on both faces** (a map with a street plan on one face
   and an index on the other): is "inside" the face with the title panel? Proposed
   yes, by archivist's decision per record; the labels don't change.
5. **Extent wording.** Whether `extent` should autofill `1 brochure` when blank
   (parallel to the photo count autofill). Cheap; suggested yes.
