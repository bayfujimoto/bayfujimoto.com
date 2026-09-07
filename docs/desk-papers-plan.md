# Desk papers — one folder, five bundles

Plan of record for replacing the five desk containers with bundles of paper
inside one open folder. Covers the mapping from documents to subcollections,
the bundle interaction (lift, fan, open), rendering, routing, the objects that
stay dimensional, and the order of work.

Status: **the desk since 2026-09-07**, and since the same evening rendered
entirely in the scene with two lights (`src/app/desk-scene.js`; decisions.md
"The desk in the scene, with two lights") — the DOM desk (`desk-alt.js`) and
the look switch (`look.js`) are retired, `/home-alt` and `/home-metal`
resolve to `/`. The five-container desk is preserved on the
`original-desk-objects` branch. Recorded in `docs/decisions.md` ("The papers
desk"). History: proposed 2026-09-06 after the layout test in `mockups/desk-papers/`
(rev 3 — the reference's layout, then its materials). **Phase 1 built
2026-09-07 as a temporary landing page at `/home-alt`** (`src/app/desk-alt.js`,
`src/styles/desk-alt.css`; `main.js` switches on the path, `router.js` keeps
the desk layer at that address). It is the mockup in the site: the folder and
papers are a DOM layer over the WebGL desk; the key is the real model, the
amber block and the stamp are Three.js placeholders; the CV, timetable, card
and log are typeset from the archive and the Accumulation column is the
archive's own scans. **Phase 2 built the same day:** clicking a bundle lifts
its documents — one per subcollection, the ones the pile hides peeking from
under the others — into a row across the screen (a column on a phone); the
fan is the series layer, pushed through `panels.js` (`configureAltDesk`) at
`/identity/` in place of `makeSeriesSheet`, so Back, Escape, the veil and
the breadcrumb are the site's own; a paper opens its browse; a flat bundle
rises a beat and its grid opens. The phone has its own composition — a
portrait folder, the papers re-piled — and the objects are scaled with the
stage so paper and key keep their relative size in both regimes. Bay's
answers that fixed these (2026-09-07): every subcollection gets a document;
the fan takes the series URL as the site does now; the flat bundle should
visibly rise; vertical stack on mobile; mobile gets its own composition,
objects keep their size relative to the papers, the folder may change shape.
Revised after Bay's first look at the built page (2026-09-07): paper shadows
are hairlines, not drops, and a light overlay on the DOM stage follows the
desk's lamp so folder and wood are lit together; creases on a few sheets;
Accumulation's scans are true to size (`dimensions` in mm at 1.5 px/mm,
the business card's scale) and each record is used once; no lift for flat
bundles; the return lowers the papers with an ease-in-out and reveals the
originals as they land; the fan shows the desk's sheets as literal clones;
the under-folder is deep green; clips are objects in a clip canvas above the
papers (real models when published as `desk-clip-<kind>.glb`, primitive
stand-ins until then). Second look (2026-09-07): everything with height —
key, amber, stamp, clips — now draws in an objects canvas ABOVE the paper,
with a shadow-catcher plane so the objects shadow the sheets they lie
across; scans still on the red scanning ground never reach the desk (the
cut-out is used where one exists; `RED_BACKGROUND` lists the uncut records
to skip); the Accumulation pile is tighter and stays on the folder.

**Clip models — published 2026-09-07** to `models/web/` (bulldog 289 KB,
paperclip 196 KB, pin 23 KB). Bay downloaded them from Sketchfab; they were
prepared with `scripts/prep-clip-model.js` (drops cameras/lights, bakes the
flat-lying rotation: paper clip and pin `--rotx 90`, binder clip none) and
finished with `finish-desk-model.js --static` (binder clip textures at 512).
Sources and names: binder clip → "binder clips" by blacksheeptal
(sketchfab.com/3d-models/binder-clips-5e55c38b24dc4c239448efa1c6b7f49f, CC BY,
9.7k faces) as `desk-clip-bulldog.glb`; paper clip → "Metal Paper Clip" by
risteralline (…/metal-paper-clip-76ad9d26872349bb942dff376270036e, CC BY,
15.9k) as `desk-clip-paperclip.glb`; safety pin → "safety pins" by rxf10240
(…/safety-pins-515f811d9796446eae2269ee676137f7, CC BY, 3.3k) as
`desk-clip-pin.glb`. All CC Attribution: the site needs a credit line (the
Guide's colophon is the natural place). Nothing below is decided until it is
recorded in `docs/decisions.md`.

## Purpose

The desk stops being five containers and a key and becomes one open folder
holding five bundles of documents, each bundle clipped together. The papers
are the fonds; the things that are not paper — the key, the amber block, the
stamp — stand outside it. This makes the key's difference categorical rather
than positional, and gives the desk and the inspection card one grammar:
recto, verso, reproduction, caption.

It also realises a decision that has been on the books since the start:
"Clicking a desk object causes it to lift toward the camera and split into
its subcollection parts (e.g. papers separating from a clipboard stack)"
(`decisions.md`, interaction model). The papers plan is that sentence, built.

## The interaction

Three states, one gesture each.

**On the desk.** The folder lies open; five bundles lie inside it, square to
the folder, small pieces overhanging its edges, as the reference collage has
them. Hover raises the bundle a few millimetres and prints its name in the
hover title. There are no file labels; each document names itself.

**Lifted.** Clicking a bundle lifts it toward the camera. As it rises the clip
lets go and the papers separate, arranging themselves **left to right** at
equal spacing, squared to the viewer, at about the size the card's plate
would show one of them. The desk blurs and dims beneath (the veil). This is
the **series layer**: the URL is `/identity/`, and it replaces the
subcollection list `makeSeriesSheet` prints today. Each paper is a target:
hover raises it, click opens its subcollection's browse. Back, Escape, or a
click on the veil lowers the papers, which re-stack and return to the folder.

**Flat series.** A bundle whose series has no subcollections (labor,
accumulation) does not fan. Its click lifts the bundle a beat and opens the
browse grid directly — `/labor/all/` — so the gesture is still a lift, but
there is nothing to choose between.

The mechanics exist: `desk-inspect.js` already lifts one object out of the
desk scene into an overlay scene above the veil, with the desk's lamp cloned
and crossfaded. The bundle lift generalises "one held object" to "a held
group whose members spread".

## Documents ↔ subcollections

In a bundle with subcollections, **one document per subcollection**, and the
document type stands for its subcollection. Where the mockup's sheets were
placeholders, the built papers are **typeset from the records**, as the
calling card is (`calling-card.js`): the CV sheet from the CV entries, the
timetable from the biography constellation's years, the log from the newest
consumption records. The desk then shows the archive's own contents, and it
changes as the archive grows.

| Series | Document | Subcollection |
|---|---|---|
| Identity | résumé (tall sheet, left column) | `cv` |
| | timetable (year strip) | `biography` (homed constellation) |
| | business card | `contact` |
| Consumption | viewing log (titled centre sheet) | `films` |
| | bookshop receipt | `books` |
| | record sleeve insert / label | `music` |
| | café receipt or loyalty card | `coffee` |
| | *open* — a manual page or save card | `games` |
| Creation | sketch sheet bearing the seal | `notes` (today's only subcollection) |
| | print | later: `photos` |
| Labor | drawing · specification · transmittal | flat → `/labor/all/` |
| Accumulation | backing sheet · receipt · brochure · ticket · postcard | flat → `/accumulation/all/` |

Consumption has five subcollections and the mockup gave it three papers; the
fan needs five, or a decision that `coffee` and `games` do not appear on the
desk. Open question below.

## Rendering

Two ways to draw paper on the desk. The choice is the one decision that
shapes everything after it.

**A — planes in the scene (recommended).** Each paper is a textured plane in
the Three.js desk scene; the folder is a thin box; the key, amber and stamp
are models as now. Textures are rendered from SVG (`paper.js`, one function
per document type, data in, SVG out) to canvas to `CanvasTexture`, at a
resolution that survives the lift (a 200 × 250 desk-unit sheet grows to about
60vh in hand: render at ~1200 px on the long side, or re-render on lift).
Keeps one continuous scene, the mouse-following lamp lights the paper, the
desk's shadows fall on it, and the lift reuses the overlay-scene machinery.
Cost: text is a texture (crisp enough at 2×; not selectable), and a11y comes
from the hidden DOM (`.desk-objects`), as today.

**B — DOM papers over the canvas.** The papers are HTML/SVG in a layer above
the WebGL desk, as in the mockup; only the wood and the three objects are
3D. Crisp, selectable, trivially accessible, no texture budget; the lift is
CSS transforms. Cost: two rendering systems in one picture — the lamp does
not light the paper, shadows are CSS, and depth order between DOM and canvas
is fixed (the stamp overhanging the folder would have to be DOM too). Breaks
the "one continuous spatial scene" decision in spirit if not in letter.

A is the archive's own logic. B is the faster demo. Per the project
instruction not to jump to polished 3D, A can be reached through B: build
`paper.js` first (it is needed either way), prove the documents in the
mockup, then move the planes into the scene.

## Routing and state

The fan is scene state and layer state at once. `layer: "series"` keeps its
URL (`/identity/`); its renderer changes from the subcollection list to the
lifted bundle. Deep-linking `/identity/` lifts the bundle without the desk
click (the papers rise from their folder positions on load, or, with reduced
motion, are simply in hand). Clicking a paper is the existing
`navigate({ layer: "browse", series, subcollection })`. Flat series keep
their view-based routes.

The `DESK_OBJECTS` table (`src/shared/desk-objects.js`) becomes the bundle
table: noun, documents, model files for the three objects. `DESK_CLICK_REMAP`
(labor ↔ accumulation) is retired: the bundles open what they are.

## Objects that stay

- **Key** — the Guide. Its lift-and-turn is unchanged. The Guide's card
  frames become the five bundles and the key; thumbnails re-rendered.
- **Stamp** — a rectangular prism on its side, hanging below the folder's
  bottom edge (the anchor card's position in the reference). Not an entry:
  Creation's sheet is. The doc's stamp-rights-itself-and-presses gesture is
  deferred; a placeholder prism ships first.
- **Amber** — amorphous, at a remove. Interactive or inert is still open
  (`desk-objects.md`); ships as a placeholder that does nothing.

## Accessibility, motion, mobile

The hidden `.desk-objects` DOM stays the navigation source of truth and
grows a second level: bundle → documents, so the skip menu reaches every
subcollection without the scene. Fanned papers are keyboard-focusable in
left-to-right order. Reduced motion: no lift; the fan appears in place.
Mobile: the folder fits the width (as the mockup does); the fan becomes a
horizontal strip with the focused paper enlarged, since five papers in a row
at 375px are unreadable. Every bundle must be hit-testable in its resting
state — the reference's density comes from tall sheets abutting, not
overlapping, which keeps the hit areas adjacent rectangles.

## Order of work

1. **Decide and record** — this document's mapping and the rendering choice,
   in `decisions.md`; `desk-objects.md` is kept as the history of the five
   containers, with a note at the top.
2. **`paper.js`** — the document renderers, typeset from data; verified in
   the mockup by replacing its placeholder sheets. Needed under A or B.
3. **The folder on the desk** — planes and folder in `scene.js` replacing the
   six-object placement and the three `LAYOUTS` regimes; raycasting per
   bundle; hidden DOM updated.
4. **The lift and fan** — generalise `desk-inspect.js`; wire `layer: "series"`
   to it; flat-series lift-and-open.
5. **Guide card** — bundle frames, thumbnails, `DESK_OBJECTS` table.
6. **Mobile and a11y pass**, then the amber decision.

## Open questions

- Consumption: five papers, or three with `coffee` and `games` reached only
  through browse?
- Should the lifted fan carry counts (the subcollection list does today)?
  A count is a label; a stack of ticket stubs is a count in kind.
- Does Labor's bundle keep three sheets when they open nothing severally, or
  is one folded drawing the more honest object?

## The steel look (branch `look-steel`, 2026-09-07)

A second look for the desk: a brushed stainless table under a handheld
flashlight — colder and darker, after Resident Evil. Merged to `main` and
routed to **`/home-metal`** (the wood stays at `/`); both looks are complete
in `src/app/look.js`, chosen by path (`?look=wood` / `?look=steel` overrides
for comparing), so rolling the steel back is removing that branch of the
switch.
Bay's choices: a dim cold ambient outside the beam (the bundles stay
findable); the beam aimed at the cursor with a lag and a slow handheld sway
(the finger, on touch; centre at rest); the current desk.glb re-skinned
rather than a new table; the palette above the desk shifted blue-black
(`src/styles/look-steel.css`, scoped to `[data-look="steel"]`); dust in the
beam, a faint flicker, grain over the frame (all off under reduced motion).
Mechanics: the table is a MeshPhysicalMaterial with canvas-drawn brushing
(roughness + normal maps) and anisotropy along the brush, reflecting a black
room with one cold panel overhead (PMREM — one per renderer, since a PMREM
texture belongs to the context that made it); the DOM stage's light overlay
becomes a beam whose radius is computed from the cone; the flashlight's aim is
frame-rate independent.

## The desk in the scene (`/home-metal`, 2026-09-07)

Bay's second look at the steel look: not realistic. The fixes he asked for
— a real flashlight print, dust through the whole room, a real PBR table with
smudging, no lag on the light, the beam raking across the surface as in his
reference, game techniques throughout — all needed the papers to be IN the
scene, and he agreed to move them (the plan's option A). So `/home-metal` is
now `src/app/desk-metal.js`: one WebGL scene, everything in it.

- **Papers**: `src/app/desk-docs.js` describes every document as a spec (the
  same content as the DOM desk's HTML, typeset from the archive), and
  `src/app/paper.js` draws each to a canvas — stock, grain, ragged and torn
  edges, rules, serif/mono/handwritten text, scans, stamps with ink dropout,
  tape, stains, creases — which becomes the texture of a plane with a shared
  fibrous paper normal map. Sheets stack at 0.23 mm and cast real shadows.
- **Table**: Poly Haven `rust_coarse_01` (CC0), 2K WebP diffuse / normal /
  ARM on R2 under `models/web/textures/` (`publish-web-models.js --textures`);
  `metal_plate_02` is uploaded as the alternative. `TUNE.table` in
  desk-metal.js.
- **Flashlight**: a SpotLight with a cookie (`makeCookie`: hotspot, corona,
  reflector rings, unevenness) and a 2K PCF-soft shadow map. Bay's rule: it
  sits low on an arc at the near edge and slides with the cursor's x, always
  aimed at the desk's centre — cursor right, light from the lower right —
  with no lag; only a slow handheld sway (off under reduced motion).
  `TUNE.flashlight` (radius, height, sweep, angle, intensity).
- **Air**: a volumetric cone (additive shader, radial and length falloff,
  noise) and room-filling dust — Points across the whole desk volume, lit
  per particle by the cone in the vertex shader, so the motes glow only where
  the beam passes.
- **Post**: EffectComposer — RenderPass, UnrealBloom on the hotspot,
  OutputPass; ACES; grain over the frame.
- **The fan**: the series layer still comes through `panels.js`; the
  documents are clones of the desk's planes drawn in a hand canvas above the
  veil (z depth×10+1), rising from their desk pose to a row facing the camera
  (a column on a phone); invisible DOM buttons projected over them carry
  clicks, hover, focus and labels.
- Bay chose: worn oxidised steel; dim cold ambient; papers into the scene;
  bloom + volumetric + dust (no SSAO, no vignette).

The DOM desk at `/` is untouched; `?look=steel` there still shows the earlier
DOM approximation. When the scene desk is approved it should become the desk
and desk-alt.js retire (desk-docs.js already holds the documents once).

## One desk, two lights (2026-09-07, evening)

Bay combined the two: the scene desk keeps the wooden desk.glb and gets both
rigs — the overhead lamp as **light mode**, the flashlight as **dark mode** —
switched with Space on the desk (his choice: Space only; the mode follows the
system's colour scheme on arrival). The switch is a short timeline over two
factors the render loop applies each frame (`lampF`, `torch`): into dark, the
lamp drops out in ~120 ms, ~700 ms of darkness, then the flashlight stutters
through six jittered steps to full; back, the flashlight clicks off, ~500 ms,
then the lamp flickers up through five steps and settles. The cone, the dust,
the cold fill, the room reflection, bloom and grain all ride `torch`; the
palette attribute flips as the lamp goes out (`data-mode="dark"`) and as the
lamp settles. Reduced motion switches at once. Tuning: `TUNE.lamp` and
`TUNE.flashlight` in desk-scene.js; the step tables in `goDark()` /
`goLight()`.
