# Guide — inspection card with desk-object frames

Plan of record for reworking the Guide from a single prose box into a catalog
card of the same grammar as the photo (gallery-backed) inspection card: a fields
column, a plate, a contact strip, and a foot with prev/next stepping. Each frame
in the strip is one object on the desk; the plate shows that object's 3D model;
the fields column describes the object and what it holds. Covers the content
model, the build step, the card, the model plate, the thumbnail pipeline, routing,
the admin editor, accessibility, and the order of work.

Status: implemented 2026-09-05 (same day as proposed), as planned with these
departures: the model plate's camera fit uses precise per-vertex bounds
(`Box3.setFromObject(obj, true)`) because the dossier's loose AABB is inflated
by a rotated node; the thumbnail script drives a headless browser via
`playwright-core` (devDependency, no browser download — uses an installed
Chrome, or `PW_EXECUTABLE`) and accepts `THUMBS_MODEL_BASE` to render from a
local copy of the GLBs; the key frame's extent prints the archive's total
published count ("763 records · 6 objects"), as the open question below
proposed; and the model materials/lights/fit live in `src/app/model-look.js`,
shared by the desk scene, the plate, and the harness. Decisions taken in the
planning conversation are marked **decided**.

## Purpose

The Guide is the finding aid to the collection — the one place the archive
describes its own arrangement. Today (`makeGuideSheet`, `panels.js` ~L437) it
renders `src/content/guide.md` inside the biography/CV document box: a paragraph
about memory and records, then a five-line list naming the series. It says what
the series are but not what the objects on the desk *are* — a visitor who saw a
sphere, a stamp, and a bundle of paper has no way to connect them to Consumption,
Creation, and Accumulation except by clicking.

The photo card already solved the adjacent problem for records: a set of related
reproductions stepped through a strip, one whole on the plate, with the record's
metadata beside it (decisions.md → "Photo entries — display treatment", and
"Labor items — catalog-card inspection", which retired the last bespoke view in
favour of that one grammar). The Guide becomes another instance of it. Its
"photos" are the six desk objects; its "plate" carries the object itself, turning.

## Decisions taken (2026-09-05)

- **Frames**: six — the key (the Guide's own object) plus the five series
  objects. **decided**
- **Order**: key first, then desk order — key, identity, labor, consumption,
  creation, accumulation. **decided**
- **Intro prose**: the existing body Markdown of `guide.md` (the memory paragraph
  and the Arrangement list) becomes the note on the first frame, the key. Stepping
  to an object swaps in that object's description. **decided**
- **Swap**: the labor box and the accumulation bundle open each other's browse
  (`DESK_CLICK_REMAP`, `state.js`). Each frame describes the series its object
  *opens*: the frame titled Accumulation shows the box; the frame titled Labor
  shows the bundle. The Guide tells the truth about what clicking does. **decided**
- **Plate**: live 3D — drag to orbit, slow auto-rotate that stops on interaction,
  the same flat, texture-stripped materials and warm light as the desk. No
  auto-rotate under `prefers-reduced-motion`. **decided**
- **Strip thumbnails**: pre-rendered PNGs produced once by a script, not rendered
  at runtime. **decided**
- **Authoring**: per-object descriptions live in YAML front matter in
  `src/content/guide.md`; the body stays the intro. **decided**
- **Admin**: the Guide view becomes a form — one row per object with an editable
  description, above the intro Markdown textarea. Save serializes front matter +
  body back to one file. **decided**
- **Links**: `/guide/<key>/` deep-links a frame; the foot gains an `open →`
  control that navigates to the frame's series (absent on the key frame). **decided**

## Content model

### `src/content/guide.md`

```yaml
---
objects:
  key:
    holds: finding aid, sitemap, site notes
  identity:
    description: >-
      A dossier. Who the archivist is on paper — the current biography, the CV
      as a dated series of versions, and the ways to reach him.
  labor:
    description: >-
      ...
  consumption:
    description: ...
  creation:
    description: ...
  accumulation:
    description: ...
---
Memory keeps revising itself: softening, reordering, letting things go on its
own schedule. ...

## Arrangement
...
```

- `objects` is keyed by **frame key** = the series the object opens (`identity`,
  `labor`, `consumption`, `creation`, `accumulation`) plus `key` for the Guide.
  Keys are fixed by the build, not by the file: an unknown key warns and is
  dropped; a missing key yields a frame with no description (the card suppresses
  the note, never fakes one — same rule as every unrecorded field).
- `description` is Markdown (rendered by `mdToHtml`, as the intro already is).
  Short — a paragraph or two per object. Voice per CLAUDE.md: label, caption,
  finding-aid note; not marketing copy.
- `holds` is optional and overrides the derived "holds" value (see below); it is
  there mainly for the key, whose subtitle comes from `GUIDE` in `build-data.js`.
- Title, container metaphor, subcollection list, and record count are **derived**
  by the build from `SERIES` / `GUIDE` and the published record set. They are not
  duplicated into the file — one source of truth, no drift.
- The body (after the front matter) is the intro and stays plain Markdown, exactly
  as it is edited today. A file with no front matter still builds (gray-matter
  returns an empty `data`), so the current file is valid input on day one.

### `archive.json` → `archive.guide`

`build-data.js` (`readGuideContent`, ~L37) currently returns the raw file string
as `guide.content`. It will parse with gray-matter (already imported for records)
and emit:

```js
guide: {
  ...GUIDE,                 // type, label, container, subtitle, order (as today)
  content: <raw file>,      // kept one release for the admin's staged-edit path; removed once the form lands
  intro: <body markdown>,
  frames: [
    { key: "key",          label: "Guide",        container: "metadata",  holds: "finding aid, sitemap, site notes",
      object: "key",       model: "desk-guide-key.glb",            thumbnail: "/thumbnails/desk/key.png",
      count: null,         description: null /* the intro is this frame's note */ },
    { key: "identity",     label: "Identity",     container: "dossier",   holds: "biography, CV, contact",
      object: "dossier",   model: "desk-identity-dossier.glb",     thumbnail: "/thumbnails/desk/identity.png",
      count: 7,            description: "A dossier. ..." },
    { key: "labor",        label: "Labor",        container: "binder",    holds: "projects, drawings, ...",
      object: "bundle",    model: "desk-accumulation-bundle.glb",  ... },   // ← swapped: the bundle opens labor
    ...
    { key: "accumulation", label: "Accumulation", container: "flat-file", holds: "tickets, receipts, ...",
      object: "box",       model: "desk-labor-box.glb",            ... },   // ← swapped: the box opens accumulation
  ]
}
```

- `count` = published records in that series (`countItems` already exists). The
  key frame's extent is derived on the client as "6 objects" (or suppressed).
- `object` is the physical noun for the accession row (what sits on the desk),
  distinct from `container` (the series' container metaphor from `SERIES`). For
  the swapped pair they disagree on purpose: the accumulation frame reads
  `object: box · container: flat-file`. That is the honest record.
- The model filename and the swap are resolved by a **shared table**, not
  re-typed in three places. See "Shared desk-object table" below.
- The `_admin-archive.json` variant ships the same `frames` plus `intro` and the
  parsed `objects` map so the admin form can render without its own front-matter
  parser on load (it still needs js-yaml to *write*; it already bundles it).

### Shared desk-object table — `src/shared/desk-objects.js`

Today the six model filenames live in `scene.js` `OBJECT_CFG`, the swap in
`state.js` `DESK_CLICK_REMAP`, and the filename list again in
`scripts/strip-model-textures.js`. The Guide adds a fourth consumer (the card) and
a fifth (the thumbnail script). Extract one plain-data module, importable from
both the browser bundles and Node scripts (as `src/shared/field-schema.js` and
`src/shared/cutout.js` already are):

```js
export const DESK_OBJECTS = {
  identity:     { noun: "dossier", file: "desk-identity-dossier.glb" },
  labor:        { noun: "box",     file: "desk-labor-box.glb" },
  consumption:  { noun: "sphere",  file: "desk-consumption-sphere.glb" },
  creation:     { noun: "stamp",   file: "desk-creation-stamp.glb" },
  accumulation: { noun: "bundle",  file: "desk-accumulation-bundle.glb" },
  guide:        { noun: "key",     file: "desk-guide-key.glb" },
};
export const DESK_CLICK_REMAP = { labor: "accumulation", accumulation: "labor" };
export const deskTarget = (id) => DESK_CLICK_REMAP[id] || id;
// The object that opens a given destination (inverse of the remap).
export const objectFor = (target) => Object.keys(DESK_OBJECTS).find(id => deskTarget(id) === target);
export const MODEL_BASE = "https://pub-0038be3e0b514b5080cb9935976102b8.r2.dev/models/";
export const UNTEXTURED_BASE = `${MODEL_BASE}untextured/`;
```

`scene.js` keeps its fit-box / rotation / offset config but takes `file` from
this table; `state.js` re-exports `deskTarget` from it (or callers import the
shared one); `strip-model-textures.js` reads its file list from it. Behaviour
unchanged everywhere; a refactor with a test-by-inspection (desk renders as
before, clicks route as before).

## The card

### Reuse, not a new view

`buildCardWrap(item)` (~L1641) builds the photo card from a record. The Guide
card is built by the **same function** from a synthetic record, so it inherits
the fields column scroll machinery, the strip, the prev/next foot, the frame
counter, the neighbour prefetch, keyboard stepping, the mobile stacking, and
every future fix to the card. Two extensions to `buildCardWrap`, both keyed on a
single new flag, are all that is needed:

1. **A model plate**, chosen when the selected frame carries `model` instead of
   an image. Everything else in the plate column (head, label, scale note, foot)
   is untouched.
2. **A per-frame note**, so that stepping swaps the prose row's text. The photo
   card already re-renders a per-frame *caption* row on step (`frameCaptionEl`);
   the Guide's note follows the same hook with the larger prose block.

Concretely, `makeGuideSheet` becomes: build a `guideItem` from `archive.guide`,
call `buildCardWrap(guideItem, { guide: true })`, mount it in the same
`.item-card-wrap`, add the breadcrumb (`desk › guide`) and the bottom-right meta
(`Guide` / subtitle) as today, and wire the stepping to the URL (see Routing).

The synthetic record:

```js
{
  id: "GUIDE", item_type: "guide", title: "Guide",
  context_note: archive.guide.intro,       // frame 1's note
  assets: { gallery: frames.map(f => ({ model: f.file, thumbnail: f.thumbnail, caption: f.label, frame: f })) },
}
```

`galleryAssets(item)` returns these; the strip renders `thumbnail` as it does for
photos. Where the photo card reads `g.file` for the plate, a `g.model` branch
mounts the model plate instead.

### Fields column, per frame

Same row builders (`splitRow`, `singleRow`, `appendNote`), same ruled rows, same
register rules (mono for given facts and codes, serif for the archivist's words).
The column re-renders on step (cheap: a handful of rows), so the whole card reads
as one record per frame — this is a finding aid describing six things, not one
record with six pictures.

| row | label | value | register | source |
|---|---|---|---|---|
| accession (split) | `object` / `type` | `dossier` / `series` — or `key` / `meta` for frame 1 | mono | `frame.object`, fixed per frame kind |
| title | `title` | Identity | serif (archivist-devised) | `frame.label` |
| container | `container` | dossier | mono | `frame.container` — **suppressed when equal to `object`**, so only the swapped pair and the key show it |
| holds | `holds` | biography, CV, contact | serif | `frame.holds` |
| extent | `extent` | 7 records · 3 subcollections — key: 6 objects | mono | `frame.count`, subcollection count |
| model | `model` | desk-identity-dossier.glb | mono | `frame.model` — the reproduction's source, as `dimensions` names a scan's |
| note | `note` | the description (intro on frame 1) | serif prose | `frame.description` / `guide.intro` |

The `date` row is suppressed (a Guide has no event date). The `frame` caption row
of the photo card is not used — the note *is* the per-frame text.

### Plate column

- Head: `plate` label as today. The scale note (right side of the head, where the
  calibrated plate prints `1 : 1 · 325 mm`) prints the model's state: `loading
  model` → `model · drag to turn` → `model` once the visitor has interacted. On a
  WebGL failure it prints `still image`.
- Field: `.item-card__field--model`, square like the photo field (the card's
  column split follows the photo card's — `item-card--photo`, plate-heavy).
  Contains one `<canvas>`; on failure, the frame's PNG at 2× (the same asset the
  strip uses, scaled up — one pipeline, two uses).
- Foot: `↑ prev` / `next ↓` buttons and the `01 / 06` counter exactly as the
  photo card, plus **`open →`** (a third `.item-card__flip`-styled button) that
  calls `navigate({ layer: "series", series: frame.key })`. Hidden on the key
  frame. No zoom slider: orbit is the manipulation; a slider would compete with
  drag on the same square and the foot must stay one line on mobile.
- Strip: identical markup (`role=tablist`, per-frame `aria-label` "Frame 2 of 6:
  Identity"). Thumbnail `<img>` from `frame.thumbnail`.

### Model plate — `src/app/model-plate.js`

A small module, ~150 lines, modelled on the retired `initLaborModelScene`
(`git show cc91148:src/app/panels.js` ~L1631) but with the desk's look and
proper lifecycle. `three` is already in the main bundle (`scene.js`), so only
`OrbitControls` and `GLTFLoader` cost anything — `GLTFLoader` is also already
bundled; `OrbitControls` is dynamically imported on first use.

```js
export function mountModelPlate(field, { onReady, onFail }) → controller
controller.show(frame)      // load (cached) → fit → start
controller.prefetch(frame)  // warm the GLB into the cache
controller.pause() / resume()
controller.dispose()
```

- **Renderer**: one `WebGLRenderer({ alpha: true, antialias: true })` per card,
  pixel ratio capped at 2, sized by `ResizeObserver` on the field. Created inside
  `try`; on throw → `onFail()` and the PNG fallback.
- **Look**: `stripTextures` (extract from `scene.js` into the shared module or
  export it) + `AmbientLight(0xffe0b0, 0.5)` + a warm key light
  (`DirectionalLight 0xffb347`) from upper-left, ACES tone mapping — the object
  should look like it was lifted off the desk, not rendered in a product studio.
  No shadow map (nothing to cast onto); no ground plane. Transparent clear colour
  so the card's surface shows through, as a cut-out sits on the plate.
- **Fit**: after load, `Box3` → bounding sphere → camera distance so the sphere
  fills ~70% of the square; camera at a three-quarter elevation (~25° above the
  desk plane, matching how the desk is seen). The same fit rule for every object
  means the sphere and the dossier read at comparable size — the plate is
  *presentational*, not calibrated; the scale note must not print a ratio.
- **Controls**: `OrbitControls` — `enableZoom: false`, `enablePan: false`,
  `enableDamping`, polar angle clamped to [0.15π, 0.6π] so the object can't be
  viewed from below the desk. `autoRotate` at ~0.6 rpm, switched off on the first
  `start` event and **not** switched back on (a visitor who has turned it should
  find it where they left it). Under `prefers-reduced-motion: reduce`,
  `autoRotate` is never enabled.
- **Render loop**: on demand — render on `controls.change`, on resize, and on
  each auto-rotate tick; no continuous rAF once the object is still. `pause()`
  when the card is hoisted behind another layer (the `onHoist` hook the sheets
  already expose), `resume()` on return. `dispose()` on card cleanup: cancel rAF,
  disconnect the observer, dispose controls, geometries stay (they are cached and
  shared), `renderer.dispose()` and `forceContextLoss()` so six card opens don't
  leak six contexts.
- **Cache**: module-level `Map<file, Promise<Group>>`. Loaded scenes are cloned
  per show (`SkeletonUtils.clone` is unnecessary — these are static meshes;
  `group.clone()` suffices, materials shared). Stepping to a cached frame is
  instant. The two neighbours are prefetched on every step, the full set during
  idle time — the photo card's `__prefetchFrames` pattern, reused.
- **Pointer contract**: the field takes `touch-action: none` only while a drag is
  in progress (as the zoomed photo does), so the card-swipe carousel keeps
  horizontal gestures at rest and one finger on a still model still scrolls the
  page on mobile. Wheel over the field does nothing (zoom is off), so the page
  scrolls — no `preventDefault`.

### Thumbnail pipeline — `scripts/render-desk-thumbnails.js`

Six 512×512 transparent PNGs at `public/thumbnails/desk/<frameKey>.png` (`.gitignore` ignores `*.png` for R2-hosted assets; this folder is un-ignored by name), one per
frame key (so `labor.png` is the bundle and `accumulation.png` the box — the file
is named for the frame it serves, resolved through `objectFor`).

- **Method**: Vite's `createServer` API (Vite is already a dependency) serves a
  one-page harness `scripts/render-desk-thumbnails/index.html` that imports
  `three`, the shared table, and `model-plate.js`'s fit/light/material helpers —
  the same code the live plate runs, so thumbnail and plate agree. Headless
  Chromium (`puppeteer`, new devDependency; or Playwright if preferred) opens the
  page, waits for each model to load, and reads `canvas.toDataURL("image/png")`.
  Same three-quarter camera as the plate's opening view.
- **Fallback without puppeteer**: the harness page also works when opened by hand
  in the dev server (`/scripts/render-desk-thumbnails/` is not part of the
  production build — excluded via `vite.config.js` / kept outside `public`) and
  offers a "download all" button. The script is the convenience, not the
  dependency.
- **Where the PNGs live**: committed to the repo under `public/thumbnails/desk/`.
  They are small (~20–40 KB each), change only when a model or the plate's look
  changes, and belong with the code that renders them — unlike record scans,
  which are content and live on R2. If that argument doesn't hold up (e.g. the
  repo policy is "no binaries"), the alternative is to upload to R2 under
  `thumbnails/desk/` and route through `imageUrl(…, "thumbnail")`; the card code
  is the same either way.
- npm script: `"thumbs:desk": "node scripts/render-desk-thumbnails.js"`.

## Routing

- `/guide/` → key frame. `/guide/<key>/` → that frame, for
  `key ∈ {identity, labor, consumption, creation, accumulation}`; an unknown
  segment falls back to `/guide/`.
- State: `layer: "guide"` reuses the existing `view` field for the frame key
  (`null` = key frame). `locationToState` and `stateToURL` in `router.js` gain
  the second segment; `state.js` clears `view` on leaving the guide layer as it
  does for series changes (it already nulls everything on return to the desk).
- Stepping in the strip / foot calls `replace()`, not `navigate()`: the six
  frames are one page's states, not six pages, so Back leaves the Guide rather
  than walking back through frames (the photo card keeps its index out of the
  URL entirely; the Guide puts it in so frames can be linked to, but with the
  same one-entry history footprint).
- `open →` calls `navigate({ layer: "series", series })` — a real page change,
  pushed. The breadcrumb on the series sheet is unchanged (`desk › identity`);
  the Guide is a place you were, not a parent.
- Popstate / deep link on first load: `restoreFromState` already pushes the guide
  sheet for `layer: "guide"`; it passes `view` through so the card opens on the
  right frame.

## Admin — `src/admin/views/guide.js`

The view becomes a form in the record pane, in the admin's existing row grammar
(`.admin-field` rows: state · label · value · type — `field-row.js`,
`field-chrome.js`), so it reads like editing any record:

```
guide                                                    [save] [cancel]

▮ objects
▮   key · holds        [finding aid, sitemap, site notes        ]  text
▮   identity           [A dossier. Who the archivist is on paper…]  markdown
▮   labor              [                                          ]  markdown
▮   consumption        [                                          ]  markdown
▮   creation           [                                          ]  markdown
▮   accumulation       [                                          ]  markdown

▮ intro                                                             markdown
    ┌───────────────────────────────────────────────────────────┐
    │ Memory keeps revising itself: …                           │
    └───────────────────────────────────────────────────────────┘
```

- Each object row shows the frame's title (and, muted, the object noun and
  what it holds — read-only, derived) with an auto-growing textarea for
  `description`. The key row edits `holds` only; its description *is* the intro.
- `save` assembles `{ objects: {...} }` → `js-yaml` dump (already used by
  `serializer.js`; reuse `toMarkdown` for the front-matter block, appending the
  intro body) → stages `src/content/guide.md` exactly as today
  (`pendingChanges`, `:w` commits). Empty descriptions are omitted from the YAML,
  not written as `""` — `toMarkdown` already strips empties.
- Load order is unchanged: a staged pending edit wins over the built archive. The
  pending entry keeps `content` (the full file string) so the Log and the commit
  path are untouched; the form re-parses it with `js-yaml` on reopen (front
  matter split is a two-line regex on `^---\n…\n---\n`; the body is the rest).
- Field state chrome (`▮` modified marks) via `setFieldState` on input, as the
  item form does. Mobile: single pane, 16px inputs, per CLAUDE.md.
- The Explorer's `[*] Guide` node, the breadcrumb, and the `:w` flow do not change.

## Accessibility, motion, mobile

- Nothing depends on the 3D: every fact is in the fields column; the strip and
  foot step by button; the PNG stands in when WebGL is unavailable. The canvas
  gets `role="img"` and an `aria-label` ("Model of the dossier — drag to turn").
- Keyboard: the strip is a `tablist` as today; `↑/↓` step frames — the photo
  card already binds these to `__stepGallery` (`←/→` are reserved for moving
  between records and have no meaning on the Guide; leave them unbound);
  `Escape` closes to the desk. `open →` is a real button.
- Reduced motion: no auto-rotate; the model renders once and turns only under the
  visitor's hand. The card's open/close transitions already respect the flag.
- Mobile (≤600px): the photo card's stacking (`accession → plate → rows`) applies
  unchanged. The plate is square at `min(90vw, 60vh)`; the strip scrolls
  horizontally with snap; the foot's three controls + counter fit one line at
  375px (`prev · next · open → · 01/06` — verify; if not, the counter moves into
  the plate head's scale-note slot, which is free on model plates).
- Performance: one extra WebGL context while the Guide is open (the desk's
  renderer is already paused behind a veil — `pauseSceneRender`). Models are the
  untextured GLBs already downloaded for the desk, so for a visitor who came from
  the desk the loader hits the HTTP cache; total extra transfer is the six PNGs
  (~150 KB) and OrbitControls (~10 KB gzipped).

## Order of work

1. **Shared table.** Create `src/shared/desk-objects.js`; point `scene.js`,
   `state.js`, and `strip-model-textures.js` at it. No visible change. Commit.
2. **Content + build.** Front matter in `guide.md` (start with `holds` for the key
   and one-line placeholder descriptions Bay replaces); `build-data.js` parses
   and emits `guide.frames` / `guide.intro`, keeps `guide.content`. Verify
   `archive.json` and `_admin-archive.json`. Commit.
3. **Thumbnails.** Harness page + script; generate the six PNGs; review them in
   the browser (angle, framing, colour against the card surface). Commit PNGs.
4. **Model plate module.** `model-plate.js` with fit/light/materials shared with
   the harness; test standalone in the harness page first (load each object,
   drag, reduced-motion, WebGL-off via devtools).
5. **Card.** Extend `buildCardWrap` (model branch, per-frame fields re-render,
   `open →`); rewrite `makeGuideSheet` to use it. Router segment + `replace()`
   stepping. Retire the `.guide-content` and `.bio-document__box--fit` CSS —
   both are used only by the current Guide sheet (verified: the one
   `box--fit` call site is `makeGuideSheet`, L478).
6. **Admin form.** Rewrite `views/guide.js`; round-trip test: edit → save → Log
   shows the file → `:w` → build → card shows the text.
7. **Docs.** `decisions.md`: add "Guide — inspection card" (confirmed), note the
   shared desk-object table, and resolve the open "Public archive guide depth"
   question (it is now object-by-object notes plus one intro paragraph).
   `information-architecture.md`: Guide section. `admin-interface.md`: Guide form.
8. **Verification pass.** Desktop + 375px; keyboard-only; reduced motion;
   WebGL disabled; deep link to `/guide/creation/`; Back from a frame returns to
   the desk in one step; `open →` lands on the right series for the swapped pair.

Each step is independently shippable and leaves the site working; 1–3 change
nothing visible.

## Open questions (not blocking)

- **Constellations meta-object.** decisions.md keeps a deferred desk object for
  Constellations "near the Guide". When it arrives it becomes a seventh frame
  (`key: constellations`, `object: <noun>`), and `open →` would route to
  `/constellations/`. The `frames` array and the shared table are built to take
  it; nothing else needs to anticipate it.
- **Counts on the key frame.** "6 objects" is true but thin. Alternative:
  the total published record count across the archive, which makes the key frame
  the archive's summary line. Cheap to change later; propose starting with the
  total count.
- **Textured originals as an opt-in.** The plate loads the untextured GLBs by
  design (decided). If the textured originals ever matter (e.g. the dossier's
  label is legible only with its texture), the loader path is one constant away;
  the desk would remain untextured regardless.
- **Should the strip's selected frame also highlight the object on the desk
  behind the veil?** Tempting, but the desk is blurred and paused behind the veil
  and the rendering-strategy doc warns against tactile effects that don't carry
  information. Not in scope.
