# Guide key — lifting the object into hand

Plan of record for the first desk-object interaction: clicking the key on the
desk lifts it toward the camera and turns it over; clicking its reverse opens
the Guide's inspection card, with the same model carrying through the
transition. Covers the choreography, the geometry, the reverse-face test, the
handoff to the card's model plate, routing, fallbacks, and the order of work.

Status: implemented 2026-09-06 (same day as proposed), uncommitted at the time
of writing — Bay reviews and commits. Two departures from the plan as written,
both found by measuring the result rather than by argument:

- **The hand pose is derived, not tuned.** The plan proposed screen anchors
  tuned by eye per regime. Measuring the built site showed the held object
  landing about half the size the plate would show it, which reads as a cut
  rather than a handoff. The horizontal anchor and the framing distance now
  come from the card's own CSS geometry (`plateGeometry()` in
  `desk-inspect.js`); only the vertical placement is still tuned, because the
  card's height depends on its text. Measured across three viewports
  (1440×900, 820×1100, 390×844), the held object and the object on the plate
  agree to within a pixel of centre and about 7% of size.
- **The settle turns around the object, it does not fly to it.** Interpolating
  the plate camera's position in a straight line between two poses half a turn
  apart sends it through the object — the first frames of the card showed a
  cropped, oversized key. The settle now slerps the camera's orientation and
  keeps its distance from the fit centre, and holds the handed-off pose for a
  beat (140ms) so the pose the visitor was holding is still on screen while the
  card fades in.

Revised the same day, after Bay saw it (the changes that matter are structural,
not tuning):

- **The held object is drawn above the veil, in its own canvas.** The desk has
  to blur and dim behind the object as it does under any other layer, and a
  backdrop-filter blurs everything beneath it — the object included. So the
  lift now moves the model out of the desk scene into an **overlay scene** with
  its own renderer and canvas at `z-index: 11`, over a `.layer-veil` at 10; the
  desk repaints without the object and freezes. The desk's own lamp is cloned
  into that scene and crossfaded to the plate's camera-riding rig across the
  lift, so the first frame in hand is the frame the desk was showing and every
  face is lit once it is being turned.
- **No shadow**, which follows: nothing in the overlay scene casts one.
- **The desk holds no key while the card is open**, which also follows: the
  object left the desk scene at the lift, so the blurred desk behind the card
  shows an empty spot. It returns to the hand — in the pose it was left — when
  the card is dismissed.
- **Centred**, not aimed at the plate. The size still comes from the plate's
  framing, so the object is the same size in the hand as on the card; only the
  position now differs across the swap.
- **The same trackball as the card.** `TrackballControls` on the overlay camera
  with the plate's own settings (`rotateSpeed` 2.2, damping 0.15, no zoom, no
  pan), rather than the small hand-rolled arcball of the first pass. Because
  the overlay has a camera of its own, turning the object and turning the
  camera around it are the same gesture, and the pose handed to the card is
  read straight off that camera.

- **The veils must cross, not queue.** `popSheet` resumes the scene on
  `transitionend`, so restoring the hold there left the desk bare — lit,
  sharp, unblurred — for the length of the card's fade. `panels.js` now calls
  `notifySheetsClosing()` as the last veil *begins* to fall, and the hold's
  veil comes up against it. The lower does the same in reverse: the desk is
  uncovered as the object lands, not as it starts down.

Decisions taken in the planning conversation are marked **decided**.

## Purpose

`docs/desk-objects.md` describes two interaction types for the desk. Expansions
separate an object into independently navigable parts; contraptions run a short
sequence of states that must complete before the series opens. The key is a
contraption, and the simplest one on the desk — a single object, a single
destination, one gesture:

> To read the other side, you must turn the key over. A slow rotation — the
> object completing one half-turn, the reverse face coming into view. The
> reverse carries the text that names the Guide. Clicking it enters.

Today (`scene.js`, the canvas click handler) every object navigates on the first
click: the raycaster reports a `seriesId` and `navigate()` runs. The ceremony
is absent everywhere. The key is where it arrives first, because it is the one
object whose destination — the Guide card — already carries the same model on
its plate (`model-plate.js`, decisions.md → "Guide — inspection card of desk
objects"). The object the visitor is holding is the object the card opens with,
so the transition can be continuous rather than a cut.

decisions.md → "Desk object interaction" is confirmed and unbuilt: *clicking a
desk object causes it to lift toward the camera*. This plan builds that
sentence for one object.

## Decisions taken (2026-09-06)

- **Two clicks, not one.** Click one lifts the key into view. Click two, on the
  reverse, opens the card. Nothing else on the desk changes: the other five
  objects keep navigating on a single click until their own interactions are
  built. **decided**
- **Auto half-turn, then drag.** The lift ends with one slow half-turn that
  leaves the reverse toward the camera — the visitor sees the object has two
  sides without being told. After that the key turns freely under the pointer,
  the same trackball feel as the card's plate. **decided**
- **The bare key's reverse.** The paper tag in `docs/desk-objects.md` is not
  modeled: `desk-guide-key.glb` is a single-mesh metal key. The reverse is that
  key's other flat face. The tag drops in later as a new GLB — the interaction
  is written against the model's bounds and orientation, not against named
  nodes, so a retagged key needs no code change. **decided**
- **Not addressable.** The key in hand is a scene state, not a layer: the URL
  stays `/` while it is held, Escape or a click on the desk lowers it, and
  `/guide/` still opens the card directly for deep links. The router, the layer
  stack, and `stackDepth()` are untouched. **decided**
- **Back returns to the hand, not the desk.** The desk render is already frozen
  while a veil is up (`pauseSceneRender`), so leaving the card exposes the key
  exactly as it was held. Escape once more lowers it.

## The choreography

Five states, held in the inspector, not in `state.js`:

| state | what is true |
|---|---|
| `resting` | the key lies on the desk at its layout spot; a click lifts it |
| `lifting` | tweening to the hand pose; pointer input ignored |
| `inHand` | held; drag turns it, Escape or a click off it lowers it, a click on it enters or turns it over |
| `lowering` | tweening back to the desk; pointer input ignored |
| `handedOff` | the card is open; the overlay is torn down and the pose kept, to be restored if the visitor comes back |

Click behavior in `inHand` follows the face that is toward the camera:

- reverse toward the camera → **enter** (the handoff below)
- obverse toward the camera → **turn it over** (a half-turn, the same tween as
  the lift's)

So the gesture is forgiving. A visitor who drags the key back to the face it
showed on the desk is not stuck: clicking turns it again. Nothing needs a
label, and nothing depends on hover.

## Geometry

**The hand point.** The desk camera does not move — that is the desk's premise
and it is not being spent here. The object moves instead, to a point straight
out along the camera's own axis: dead centre of the screen.

**The hand distance** comes from the plate's own framing rule: the object's
bounding sphere fills a fixed fraction of the frame. `fitCameraToObject()`
solves that for the camera's distance from a still object; here the camera is
fixed and the object moves, which is the same equation read the other way
(`dist = r / sin(fov/2) / fill`). Matching the fill fraction to the plate's
`PLATE_VIEW.fill` means the key is the same apparent size in hand as it will be
on the plate, so the crossfade has no jump in scale.

**The hand orientation** squares the key to the viewer: its flat face
perpendicular to the view direction, its long axis across the screen. Both are
derived from the model rather than typed in, so a retagged key still works —
the face normal is the object's world up at rest (it lies flat on the desk) and
the long axis is whichever horizontal axis of its world bounding box is longer.
A few degrees of tilt off screen-horizontal keeps it from reading as a diagram.

**The half-turn** is π about the screen-horizontal axis, applied in world
space, so it reads as turning the object over in the hand rather than spinning
it in place.

**Turning about the center.** The model's origin is not its center — the key is
placed by its bounding box, as every desk object is. Rotating about the origin
would swing it out of frame, so the lift reparents the model into a pivot group
positioned at its world center (`model.position -= center`), and the tweens and
the drag rotate the pivot. Lowering restores the model to the scene with its
original transform, so `positionObject()` and the regime layouts are unaffected.

**The drag** is `TrackballControls` on the overlay camera, with the card's own
settings — the same controller, the same feel, so an object turns identically
in the hand and on the card. It orbits the camera around the object's centre
rather than turning the object, which keeps the object centred (the controls
end each update looking at their target) and means the pose handed to the card
is read straight off that camera. Zoom and pan are off; the drag does one thing.

## Which face is the reverse

Not a normal test on the hit triangle — a solid key shows its edges and its bit
as often as its faces, and the answer would flicker. The object carries the
answer instead: take the face normal that pointed up at rest, transform it by
the pivot's current quaternion, and compare it with the view direction. Pointing
away from the camera means the reverse is showing. It is one dot product, it is
correct under free rotation, and it degrades sensibly at grazing angles (near
the edge-on pose the click does nothing until the visitor turns past it).

## The handoff to the card

The desk and the plate are two WebGL canvases; they cannot share a renderer.
What they can share is the model — `desk-guide-key.glb` from `UNTEXTURED_BASE`,
stripped by the same `stripTextures()` and lit by the same rules in
`model-look.js` — and, at the moment of the click, the pose.

1. On lift, the inspector calls `loadDeskModel()` (`model-plate.js`'s cache) so
   the plate's copy is already in memory when the click comes. No load gap.
2. On enter, the inspector records the *appearance* relation — the object's
   orientation relative to the viewing camera, `Q_view = Q_camera⁻¹ · Q_object`
   — into a module-level box, and navigates to the guide layer.
3. `makeGuideSheet` passes the pending handoff into `mountModelPlate`, which
   consumes it once and only for the key frame. The plate fits its camera to
   the object as usual (framing unchanged), then places that camera on the fit
   sphere at the orientation that reproduces `Q_view` — the same object, the
   same size, the same face, in the same place on screen.
4. The card fades in over the frozen desk on the existing veil transition, and
   the plate camera settles from the handed-off pose to `PLATE_VIEW` over about
   600ms, easing out. Then `TrackballControls` takes over as it does now.

The pose is carried as a camera pose rather than an object rotation because the
plate's whole model of interaction is camera-side: the object is mounted
unrotated and the camera moves around it. Rotating the clone instead would
fight the trackball's target and the fit.

The reverse trip restores the overlay and the pose recorded at the click, so
dismissing the card puts the object back in the hand exactly as it was left.

Because the object left the desk scene at the lift, the frozen desk behind the
card has an empty spot where the key lay: there is one key, and the card has
it.

## Routing and history

Unchanged. `/` while the key is held; `/guide/` when the card opens, pushed by
the existing `navigate({ layer: "guide" })`. The card's own frame stepping still
replaces rather than pushes, so Back leaves the Guide in one step — onto the
desk, with the key still in hand.

## Accessibility, motion, mobile

- **Keyboard.** The hidden `.desk-objects` list is the accessible desk and the
  skip menu's target; its Guide button keeps opening the card directly. The
  ceremony is an enrichment of the pointer path, never the only way in. No
  important information depends on it (CLAUDE.md).
- **Reduced motion.** `prefers-reduced-motion: reduce` skips the whole
  choreography: the first click opens the card, exactly as today. The desk's
  render loop does not run under reduced motion either, so animating there
  would be wrong twice over.
- **No WebGL.** Unreachable — the interaction lives inside the canvas that does
  not exist. The hidden desk list is the path, and the card's plate already
  falls back to the pre-rendered still.
- **Touch.** Tap lifts; the auto half-turn means the reverse is showing before
  the second tap, so the shortest path is two taps and no drag. Drag turns.
  `touch-action: none` on the canvas only while the key is held, so the page
  still scrolls at rest.
- **The overlay.** While the key is held, the hover meta stops following the
  pointer and holds the Guide's label and subtitle; the subtitle reads `open →`
  when the reverse is toward the camera. The cursor carries the same state:
  `grab` / `grabbing` while turning, `pointer` when a click would enter.

## Files

- `src/app/desk-inspect.js` — **new**. The in-hand controller: the overlay
  (veil, canvas, renderer, scene, lights), states, tweens, pivot, the facing
  test, and the handoff box (`takeDeskHandoff()`).
- `src/app/scene.js` — routes the key's click into the inspector; the other five
  objects unchanged. Lends the inspector its lamp, freezes and repaints the desk
  around the hold, and holds the Guide's line in the overlay meta while held.
- `src/app/model-look.js` — `addPlateLights()` returns its lights, so the hold
  can fade the rig in without restating its numbers.
- `src/styles/main.css` — `.desk-hold-canvas`, the overlay's canvas above the
  veil.
- `src/app/model-plate.js` — `mountModelPlate(field, { entry })`: mount at a
  handed-off pose and settle to `PLATE_VIEW`.
- `src/app/panels.js` — `makeGuideSheet` passes the pending handoff to the plate.
- `docs/decisions.md` — an entry once this is confirmed on device.

## Order of work

1. The inspector, with the lift and lower only — no turn, no entering. Verify
   the pose, the anchor, and that lowering leaves the desk exactly as it was.
2. The half-turn, the facing test, and the click-to-turn-over branch.
3. The arcball drag.
4. The handoff: the pose box, the plate's entry pose, the settle.
5. Fallbacks: reduced motion, touch, the hidden desk list, the three regimes.

## Open questions (not blocking)

- **The tag.** The interaction wants a two-sided object whose reverse carries
  the text that names the Guide. Until the key is remodeled with its tag, the
  reverse is blank metal and the `open →` in the overlay is doing the work the
  object should do. Worth revisiting when the tag exists.
- **Does the lift generalize?** The dossier and the sphere are expansions, not
  contraptions — they lift and *separate*. If the lift, the pivot, and the
  arcball hold up here, they are the shared half of that; only the separation
  differs per object. Not designed for yet.
- **The anchor by measurement.** The hand point is tuned per regime by eye. A
  later pass could measure the plate's rect off a hidden card and place the key
  exactly, or animate the plate canvas itself from the key's captured screen
  rect (a FLIP). Neither is needed if the tuned anchor reads as continuous.
