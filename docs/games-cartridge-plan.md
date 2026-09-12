# The games cartridge

The document that stands for the games subcollection on the desk is a save
slip: a small sheet reading `save · <latest title>` over two slot lines. It is
the only consumption document that describes a game rather than resembling one.
The films log is a log, the coffee receipt is a receipt, the record sleeve is a
sleeve — each is the thing itself. This replaces the slip with the thing
itself: a Switch 2 cartridge, lying at true size among the papers.

Bay supplied `game-mark-files/switch 2 cartridge.png` (454 × 664, RGBA). It is
not a picture of a cartridge but a **template**, built in the same spirit as the
box templates: a red shell whose label area is a hole, with a serial strip
printed below it. So the cartridge is composed the way a box is — art set into a
window — rather than drawn once and shipped flat.

Decided with Bay, 2026-09-11: the label carries the most recent game's key art;
the cartridge sits at true size; it replaces the save slip outright; and the
serial strip is overprinted with the record's accession ID.

## What the template gives us

Measured from the source, as fractions of the card so they survive any
resampling:

- Silhouette: the shell covers 99.4% of the canvas — only the four rounded
  corners fall outside it — at an aspect of 0.684.
- Label window: x 0.0749 → 0.9383, y 0.2666 → 0.7801. A clean rectangle,
  392 × 341 px, **aspect 1.150 — landscape**.
- Serial strip: x 0.0749 → 0.9383, y 0.7816 → 0.8810. Solid black, 392 × 66 px,
  sitting two pixels under the window, with `LB-XXXXX-XXX-0` printed in it.

The window being landscape while key art is portrait (0.667) is the one
awkwardness in the design. Cover-filling portrait art into it keeps a horizontal
band through the middle of the picture and discards the rest, which is roughly
what a real cartridge label does with the same artwork. It is worth looking at
once there is real art in place; if the crop lands badly on a particular game,
the remedy is a per-record nudge like the box's `cover_fit`, not a change here.

## Size

A Switch card is about 21 × 31 mm. At the desk's `PX_PER_MM` of 1.5 that is
**32 × 47 stage px**, the height taken from the template's own aspect rather
than the nominal millimetres so the art is never squashed. For comparison the
save slip it replaces is 126 × 79, so the cartridge occupies about a sixth of
its footprint. It will read as a small object among sheets of paper, which is
what it is; the accumulation scans and the 4 × 6 photo print are already drawn
at this same true scale.

Two consequences follow from being small, one harmless and one that needs work.

The harmless one is the fan. When the consumption bundle opens, every sheet is
scaled by a single shared factor — Bay's rule, and the reason a calling card
stays a calling card beside a CV. The row is height-bound by the films log at
140 units, so the cartridge lands at about 34% of that height: roughly a fifth
of the viewport on a desktop, comfortably visible and comfortably clickable. It
is not the sliver the identity bundle's biography slip is.

The one that needs work is resolution. Sheet textures are rendered at
`min(3, dpr × 1.5)` texels per stage px, so a 32 × 47 document becomes a
96 × 141 canvas. That is enough while it lies on the desk and far too little
once the fan blows it up, where the accession ID would dissolve. The fix is a
per-document texture multiplier — `texScale` on the spec, consumed where
`renderPaper(d, scale)` is called — set to 4 for this one document, giving a
384 × 564 canvas. Nothing else on the desk needs it, and nothing else changes.

## Built as a 3D object

Bay's instruction on starting the build was that the cartridge be a real object,
not a sheet, and that turns out to simplify the drawing. A document's silhouette
normally lives in its texture's alpha; here it lives in geometry — a rounded
rectangle, 21 x 31 mm, extruded to the card's 3.4 mm and lying flat among the
papers. It takes the lamp along its edges, casts the shadow of a solid, and
rises into the fan as a card among sheets.

`cardGeometry()` in `desk-scene.js` builds it. ExtrudeGeometry already splits
into two material groups, so the caps take the rendered face and the walls take
plain shell plastic; the cap UVs arrive in shape coordinates and are brought to
0..1 so the face samples the document exactly as a plane sheet would. The
geometry is centred through its thickness and the mesh lifted by half of it, so
the card rests on the desk rather than sinking into it. A document asks for this
with `object: "card"`, and `thickness`, `radius` and `shell` beside it.

Because the geometry is the silhouette, the alpha mask the plan called for is
not needed. What the face does need is to stop being paper, which is one flag
rather than a new layer concept.

## Two small additions to paper.js

Neither is specific to cartridges; both are the general mechanism the existing
code is missing.

**`bare`.** A sheet is drawn on stock and finished with grain, foxing and a
vignette. A moulded card is none of those: `bare: true` skips the stock fill and
returns before the paper texture, so the face is exactly what its layers draw.
The cut-out masking path is untouched, so the film strip — the only other
document that brings its own shape — behaves as it always has. The first layer
is a rectangle of shell red across the whole card, so no texel the cap samples
is ever bare canvas.

**Cover fit on image layers.** `drawImage(im, 0, 0, L.w, L.h)` stretches, which
would distort portrait art in a landscape window. The `photo` layer already has
the cover-fit arithmetic; `image` layers gain the same `fit: "cover"` option,
three lines, applied to the label art.

## The document

In `desk-docs.js` the games entry becomes a specification written out in full
rather than through the `doc()` helper, as the photo print already is, because
its width and height are true millimetres rather than composition units:

- `sub: "games"`, `object: "card"`, `bare: true`, `gloss: true`, `texScale: 4`.
- Layers, in order: shell red across the card; a dark rectangle where the label
  goes; the label art, cover-fitted into it; the shell; a black rectangle over
  the serial strip; the accession number in white mono, centred on it.
- It sits at `S(74), S(48)`, rotated -7 degrees: the blank band of the films log
  between the title and the handwritten titles. That position is the one part of
  this worth moving by eye — the neighbouring bundles overlap the consumption
  box heavily, and the creation sheet covers everything below `S(92)`.

The art comes from the most recent game by `sort_date`, the same record the slip
already named, and the accession ID is that record's. If there is no game, or it
has no cover, the label falls back to a flat colour: the window is a hole, and a
hole with nothing behind it would show the desk through the card.

## Where the art comes from

This is the one genuine dependency. Since the box system landed, a game's
`assets.cover` master is **bare key art** and every derivative — display,
thumbnail, cut-out — is made from the *composite*, the art already set into its
box. A cartridge label wants the bare art, and no web-sized derivative of it
exists. Loading the master directly would work but drags an unbounded original
onto the desk, which is tuned to a budget.

So: a desk-sized art derivative, `display/<base>-art-desk.webp`, capped at 512 px
and cropped to the window's aspect, written by `scripts/publish-desk-assets.js`
— the script that already makes the desk-sized cut-outs — and addressed through
a new `art-desk` variant in `image-url.js`. The layer names it as `src` with the
master as `fallback`, the pattern the accumulation scans already use, so the
desk works before the script has ever run.

Worth knowing: all four game records still carry pre-template retail scans as
their masters, so until they are re-uploaded as bare key art the label will show
a whole box shrunk into the window. That is the same re-upload already
outstanding from the box work, not new debt.

## Consequences and loose ends

The bundle's subtitle, `log · receipts · sleeve · card`, should gain the
cartridge.

Clicking is unaffected. A click anywhere on a bundle's documents opens that
bundle — `pick()` returns the bundle, never the document — so the cartridge
being small costs nothing on the desk. The fan button was the real problem, and
worse than estimated: measured, the games button came out **55 x 81 px at
1400 px wide and 20 x 28 px at 375 px**, well under the 44 px floor. The hit
area alone is now grown to 44 px, centred on the sheet, leaving the drawn
document and the one-scale rule untouched. This was a latent fault, not a new
one: the identity bundle's biography slip has always projected a button of much
the same size.

A Switch 2 cartridge stands for every game in the subcollection, including the
GameCube and Steam records. That is a synecdoche and probably the right one — one
object reads better than a rotating cast — but it does mean the object and the
label can disagree about platform. The alternatives, should it grate, are to
draw the label only from the most recent Switch 2 game, or eventually to give
each platform its own object.

## Thickness in hand

A card that looks right on the desk looks like a block in the fan, and both are
the same object drawn at different sizes. The fan scales a document uniformly,
so the cartridge's true 3.4 mm edge is magnified with everything else — and it
is the only thing in that row with any depth at all, since every sheet beside it
is a plane. Correct, and wrong-looking: at that magnification real paper would
show an edge too, but the sheets are the established language and the card is
the newcomer.

So the card's **thickness alone** eases down as it rises and back as it lands:
`handDepth` on the document (0.35), applied in `pose()` as a non-uniform z scale
while the face keeps the shared factor. The desk is untouched by construction —
`pose()` only ever moves the fan's clones, never the documents lying on the
desk, where the raking light and the stacking want the real thickness.

## As built

Everything below was done and verified headlessly: the desk in both lights, the
opened consumption fan, and the fan buttons measured at 1400 px and 375 px.
Nothing is committed.

- `public/desk/switch2-cartridge.webp` — the shell, lossless WebP, 30 KB,
  pixel-identical to the source PNG.
- `paper.js` — `bare`, and `fit: "cover"` on image layers.
- A solid document rides at **its slot plus its whole thickness** — its top
  face, not its centre, is what decides whether anything covers it — and the
  card's 5.1 px is nearly eight documents' worth of stacking, which is why it
  sits over sheets of other bundles that are nominally above consumption. See
  the music disc for the case where that had to be worked around.
- `desk-scene.js` — `cardGeometry()`, the `object: "card"` branch, `texScale`,
  the 44 px hit floor, `handDepth` in `pose()`, and the hover glow reaching
  every material a document carries rather than only the first (a card has two).
- `image-url.js` — the `art-desk` variant.
- `publish-desk-assets.js` — `--art`, writing `display/<base>-art-desk.webp` at
  384 x 334, cropped to the window with sharp's attention heuristic.
- `desk-docs.js` — the cartridge document, replacing the save slip.

Still outstanding, both Bay's: re-upload the games as bare key art so the labels
stop showing whole boxes, then run `node scripts/publish-desk-assets.js --art`.
There are seven game records now — Splatoon Raiders, Pragmata and Resident Evil:
Requiem arrived while this was being built — and the cartridge carries the most
recent, so Splatoon Raiders is the one whose art it wants first. Until then the card falls back to the master, and with no master at all
it shows an unprinted label — verified, and it reads as a cartridge without a
sticker rather than as a fault.

## Order of work

1. Prepare the assets: `public/desk/switch2-cartridge.webp` and
   `switch2-cartridge-mask.webp`, both committed behind the existing
   `!public/desk/*.webp` negation, with the source PNG left in
   `game-mark-files/`.
2. `paper.js`: mask layers and cover fit on image layers.
3. `desk-scene.js`: honour `texScale` when rendering a document.
4. `image-url.js` and `publish-desk-assets.js`: the `art-desk` derivative.
5. `desk-docs.js`: the cartridge document replacing the save slip, then tune its
   position and rotation against screenshots.
6. Verify: build, serve, and photograph the desk in both lights and the opened
   consumption fan; measure the fan button at 375 px.

Nothing here touches the Guide, whose frames describe the five containers and
the key, or the fan's shared-scale rule.
