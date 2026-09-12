# The music disc

The document standing for music on the desk is a sleeve: a 72 × 72 square of
white stock reading `record`, the latest album's title in a blue hand, and a
small drawn vinyl peeking from behind the lower-right corner. This replaces it
with a compact disc lying on the pile — a real object with a real hole through
it, at true size, as the games cartridge replaced the save slip.

Decided with Bay, 2026-09-11: the change is **the desk only**; the object is a
**bare disc**, not a jewel case and not a disc half out of a sleeve; its face
carries the **most recent album's cover art, circular**; and it is drawn at
**true size**.

## Scope, and one honest inconsistency

`docs/music-display-plan.md` is a plan of record with decisions locked: albums
and EPs read as 12″ sleeves, singles as picture discs, and `scripts/build-data.js`
stamps `dimensions` as 314 × 314 (300 × 300 for a single). None of that changes.
The browse grid, the catalog card and the data keep the vinyl vocabulary; only
the desk shows a CD.

So a visitor who looks closely will find a compact disc on the desk and 12″
sleeves in the collection behind it. Bay chose this deliberately, and it is
defensible — the desk is a set of objects standing for collections, not an
inventory of the formats owned — but it is the sort of thing that reads as an
oversight to whoever meets it next. A line in `music-display-plan.md` recording
the choice is part of this work, not an afterthought to it.

## The disc

Real dimensions, which are what the desk draws at its 1.5 px/mm:

| | mm | stage px |
|---|---|---|
| outer diameter | 120 | 180 |
| spindle hole | 15 | 22.5 |
| thickness | 1.2 | 1.8 |
| printed label | 36 → 118 | 54 → 177 |
| mirror band | 15 → 36 | 22.5 → 54 |

The mirror band is the clear inner ring where a pressed disc carries its matrix
code and catalogue number, stamped small in the polycarbonate. That is where the
**accession number** goes — the same move as the cartridge's serial strip, and
for the same reason: the object says which record it is, in the place the real
object says what it is.

## Geometry

`discGeometry(d, hole, t)` sits beside `cardGeometry()` in `desk-scene.js` and
works the same way: a `THREE.Shape` — here a circle with a circular hole pushed
into `shape.holes` — extruded to the thickness, centred through it, with the cap
UVs remapped from shape coordinates to 0..1 so the face samples the rendered
document as a plane sheet would, and no `computeVertexNormals` so the rim stays
crisp. `curveSegments: 96`, which is a few hundred triangles and smooth at any
size the fan reaches. ExtrudeGeometry's two groups take the face and the edge;
the edge material covers the rim and the inside of the hole alike. A document
asks for it with `object: "disc"`.

The hole is real, so the desk shows through the spindle and, in the fan, so does
the background. And at 1.2 mm the edge is 1% of the diameter, so unlike the
cartridge there is nothing to thin: this disc needs no `handDepth`.

## One new layer

`paper.js` already carries object-specific layer types — `disc` for the little
vinyl, `postage`, `seal`, `titleBlock`, `stampCircle` — so a `cd` layer is
idiomatic rather than a new concept. It draws, in order: the disc base; the album
art cover-fitted across the face and clipped to the annulus between the label's
inner and outer radii; the mirror band; the accession number in mono inside it;
and a fine rim line. The document is `bare` (polycarbonate takes no paper grain)
and `gloss` (the clearcoat that made the photo print glossy is the disc's
lacquer).

The vinyl `disc` case is used by nothing but the sleeve this replaces, so it goes
out with it — as the procedural `strip` case went out with the drawn film strip.

## Where the art comes from

Unlike the cartridge, nothing new is needed. A music cover's `display`
derivative *is* the art — nothing is baked into a box the way a game's cover is —
and all sixteen records carry one. The disc takes the most recent album by
`sort_date`, which is Audrey Nuna's *Trench*, the title the sleeve already names.
Album art is square and the face is round, so a centre crop loses the corners,
which is exactly what a printed CD does to the same artwork.

If the art fails to load, the face is a plain silver disc with its mirror band
and accession number — the same graceful floor the cartridge has, and it reads as
an unlabelled disc rather than as a fault.

## The composition problem

This is the hard part, and it is worth saying plainly before any code is written:
**at true size the disc is the largest object in the consumption bundle**, 180 px
across in a box that is 306 × 288, and it displaces a sleeve that was 130.

The bundle is also hemmed in. A document that must not land on a neighbouring
bundle's sheet has to sit inside roughly stage x 376 → 646 by y 76 → 288 —
identity's edge on one side, the creation sketches sheet covering everything
below the other — which is 270 × 212. A 180 px disc fits there and leaves very
little else, and the cartridge currently sits at stage (473, 162) → (505, 209),
squarely inside it.

So the pile has to be recomposed around the disc: the cartridge, the books
receipt and the coffee receipt all want new positions, and some overlap with the
creation sheet below is probably unavoidable. A disc lying across the papers
reads perfectly well; a disc covering a line of handwriting does not. This is
screenshot work, and the part most likely to want Bay's eye rather than mine.

## Consequences

In the fan the disc is height-bound against the films log — 180 px against 252 —
so it lands at about 71% of the log's height: the largest non-paper thing in the
row, and a circle among rectangles. Its button clears 44 px at both widths, so
the touch floor added for the cartridge is not needed here, though it stays.

The bundle's subtitle, `log · receipts · sleeve · card · cartridge`, becomes
`log · receipts · disc · card · cartridge`.

Nothing else moves: not the browse grid, not the card, not `dimensions`, not
`build-data.js`.

## As built

Built and verified headlessly on 2026-09-11: the desk, the opened consumption
fan, the fan buttons measured, and the disc with no art. Nothing is committed.

- `desk-scene.js` — `discGeometry()`, and the solid branch now takes
  `object: "disc"` beside `object: "card"`. The disc's face is smoother and only
  weakly specular (`roughness: 0.2`, `clearcoat: 0.5`, `specularIntensity: 0.45`)
  and its rim and hole are silvered polycarbonate rather than shell plastic.
- `paper.js` — the `cd` layer; the vinyl `disc` case deleted with the sleeve.
- `desk-docs.js` — the disc document replacing the music sleeve, **first** in the
  bundle so the creation sketches sheet runs over its left third (see below),
  at `x: S(122), y: S(105)`.

Two things the plan did not anticipate.

**The lamp.** A disc is the first genuinely shiny thing on the desk, and at a
plausible gloss the lamp threw a specular wash across a third of the label,
bleaching the art. Roughening it made the wash broader, which is the wrong
direction: a *smoother*, weakly specular surface keeps the reflection a glint at
the rim, which is what a lacquered disc does under a lamp. That is the setting
now, and it is the knob to turn if it wants more or less shine.

**A solid's height is its top face, not its centre.** Asked to have the disc
partially obscured, the obvious move — putting it earlier in the bundle's array,
under the sheets that follow — did nothing, and it took a measurement to see
why. A document lies at `0.014 + i * 0.0028`; a solid is then lifted by half its
thickness so it rests on that slot, which puts its **top** a full thickness
above it. The disc's 1.8 px is more than five documents' worth of stacking and
more than the 1.41 px between one bundle and the next, so from any later slot it
cleared not just its own bundle but the creation sheets above it. From the
**first** slot its top lands just under the creation sketches sheet, which now
runs across its left third — while it still covers the sheets of its own bundle.
That is the whole placement: not a nudge, a slot.

**The squeeze resolved itself in the labor bundle.** The disc could not be
placed without lying over something, so it lies over the labor bundle's
specification sheet and blueprint — documents that carry no subcollection
(`sub: null`), pure atmosphere — rather than over any of consumption's own. It
sits below the books receipt's printed lines, which clear its top edge, and its
lower-left tucks a little under the creation sketches sheet, since consumption
sits beneath creation in the stacking order. An attempt to make more room by
moving the receipt left was reverted: the receipt has always shown only the strip
that clears the log, and moving it hid it entirely.

## Order of work

1. `desk-scene.js` — `discGeometry()` and the `object: "disc"` branch.
2. `paper.js` — the `cd` layer; retire the vinyl `disc` case with the sleeve.
3. `desk-docs.js` — the disc document replacing the music sleeve.
4. Recompose the consumption pile around it, against screenshots.
5. Verify: the desk in both lights, the opened fan, the fan buttons measured at
   1400 px and 375 px, and the no-art fallback.
6. Record the desk-only choice in `docs/music-display-plan.md`, and the decision
   in `docs/decisions.md`.
