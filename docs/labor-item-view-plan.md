# Labor Item View — Implementation Plan

## Decisions recorded here

### No context filter
Browse is flat and chronological. The `/labor/academic/`, `/labor/professional/`, `/labor/personal/` URL routes remain in the router for compatibility but no UI exposes them. With 2–3 items per year the filter adds no value. `decisions.md` should be updated to reflect this.

### Browse grid representation
Each labor item in the 3-row browse grid is represented by a PNG thumbnail. The thumbnail is referenced via the existing `assets.thumbnail` field, same as other series. No change to browse grid rendering logic is needed.

### Item view structure
The labor item view uses the existing layer-2 slot (same position as `makeItemSheet`). It is implemented as a full-bleed horizontal scroll panel rather than a centered modal. A new function `makeLaborItemSheet` in `panels.js` handles this. The router branches to it when `state.series === "labor"` and `state.layer === "item"`.

### Panel order
1. Object panel — Three.js scene with the project model (or BoxGeometry fallback)
2. Thesis panel — plain text description, no heading
3. Image panels — one per subitem, variable width by aspect ratio, caption below a hairline

### Title and metadata placement
Title, ID, role, organization, display date, and context remain in the bottom-right `layer-meta` overlay. Nothing about the project identity goes inside the scroll container.

### Caption style
Caption text sits below the image inside the same panel, separated by a `0.5px` border-top hairline. The image shrinks to make room. Font: monospace, 9–10px, `color: var(--overlay-text-dim)`.

### Panel dimensions
- Container height: `75vh`
- Object panel width: `340px` (fixed)
- Thesis panel width: `220px` (fixed)
- Image panel width: computed from `dimensions` field (`"WxH"` in pixels) against container height. Formula: `width = (W / H) * containerHeightPx`. Minimum 140px, no maximum.
- If no `dimensions` field on a subitem, panel defaults to `200px`.

### Three.js embedded scene
A second isolated `WebGLRenderer` on a dedicated `<canvas>` element inside the object panel. Separate from the desk scene. Uses `OrbitControls` with `maxPolarAngle = Math.PI * 0.85` (prevents full flip) and gentle auto-rotate (`autoRotate: true, autoRotateSpeed: 0.6`) that pauses on user interaction. Camera starts at a slight elevation (y=1.5, z=3). Background transparent.

Fallback: if `model` field is absent or the GLB fails to load, renders a `BoxGeometry(1,1,1)` with `MeshStandardMaterial({ color: 0xaaaaaa, roughness: 0.6 })`. This is also the dummy item's "model."

### Model URL
Models are not routed through the R2 `originals/thumbnails` CDN pattern. A new `modelUrl(filename)` helper returns `/models/labor/${filename}` for bare filenames, or passes through `http` URLs. Model files live at `public/models/labor/` locally.

### Dummy item strategy
The dummy item uses:
- No `model` field (BoxGeometry fallback renders automatically)
- Placeholder PNG images generated as solid-color blocks, placed in `public/originals/` and `public/thumbnails/` to match the existing `imageUrl()` URL pattern
- A browse thumbnail in `public/thumbnails/`

---

## Files to create

| File | Purpose |
|------|---------|
| `src/content/labor/PROJ-2026-000-dummy-project.md` | Dummy labor item content |
| `src/app/labor-item.js` | Labor item view component (exported `makeLaborItemSheet`) |
| `public/originals/labor-dummy-01.png` | Placeholder image, landscape |
| `public/originals/labor-dummy-02.png` | Placeholder image, portrait |
| `public/originals/labor-dummy-03.png` | Placeholder image, square |
| `public/thumbnails/labor-dummy-thumb.png` | Browse grid thumbnail |

## Files to modify

| File | Change |
|------|--------|
| `src/app/panels.js` | Import `makeLaborItemSheet`; branch case "item" on `series === "labor"` |
| `src/styles/main.css` | Add labor item view styles |
| `src/app/image-url.js` | Add `modelUrl()` export |
| `docs/decisions.md` | Record context-filter removal and item view decisions |

---

## Content schema

New front matter fields for labor items:

```yaml
thesis: >
  One or two sentences describing the project's argument or focus.
  Plain text. No heading rendered above it in the view.

subitems:
  - type: image
    file: bare-filename.jpg          # resolved via imageUrl()
    caption: "Optional caption text"
    dimensions: "1920x1080"          # WxH in pixels, used to compute panel width
  - type: image
    file: bare-filename-portrait.jpg
    caption: ""
    dimensions: "1080x1440"
```

The `model` field is reserved for future use (actual GLB filenames). Omit it on the dummy item to trigger the BoxGeometry fallback.

Existing fields (`assets.thumbnail`, `title`, `role`, `organization`, `context`, `display_date`, `sort_date`) are unchanged.

---

## Implementation phases

### Phase 1 — Decisions and dummy content
1. Update `docs/decisions.md` with context-filter removal and item view decisions.
2. Generate placeholder PNG images (solid color blocks) via Node/Python.
3. Create `PROJ-2026-000-dummy-project.md` with thesis text and three subitems referencing the placeholder PNGs.

### Phase 2 — Schema passthrough and URL helper
1. Confirm `subitems`, `thesis`, and `model` pass through `build-data.js` unchanged (they do — no changes needed).
2. Add `modelUrl(filename)` to `image-url.js`.

### Phase 3 — Labor item view component
1. Create `src/app/labor-item.js`.
2. Implement `makeLaborItemSheet(seriesKey, itemId, viewSlug)`:
   - Find item by ID from archive (same pattern as `makeItemSheet`)
   - Build outer container with `bio-document__box`-style border
   - Render object panel: `<canvas>`, init isolated Three.js scene, load GLB or BoxGeometry fallback, OrbitControls
   - Render thesis panel: `<p>` with thesis text
   - Render image panels: `<div>` sized by aspect ratio, `<img>`, hairline, caption `<p>`
   - Populate `layer-meta` with title, ID, role, organization, display_date
   - Set breadcrumb: `desk / Labor / {title}`
   - Return `{ veil, content, cleanup, update }` matching the existing sheet interface
3. Wire up in `panels.js`: import and branch in `pushLayerForState` case "item".

### Phase 4 — Styles
Add to `main.css`:
- `.labor-item` — outer wrapper, `height: 75vh`, `border: 1px solid var(--border-dim)`, `display: flex`, `flex-direction: row`, `overflow-x: auto`, `overflow-y: hidden`
- `.labor-item__panel` — base panel, `height: 100%`, `flex-shrink: 0`, `display: flex`, `flex-direction: column`, `border-right: 0.5px solid var(--border-dim)`
- `.labor-item__panel--object` — `width: 340px`
- `.labor-item__panel--thesis` — `width: 220px`, `padding: 1.5rem`, `overflow-y: auto`
- `.labor-item__panel--image` — width set inline via JS
- `.labor-item__canvas` — `width: 100%`, `height: 100%`, `display: block`
- `.labor-item__image-wrap` — `flex: 1`, `overflow: hidden`, `min-height: 0`
- `.labor-item__image` — `width: 100%`, `height: 100%`, `object-fit: cover`
- `.labor-item__caption` — `border-top: 0.5px solid var(--border-dim)`, `padding: 0.5rem 0.75rem`, `font-family: var(--font-mono)`, `font-size: 0.6rem`, `color: var(--overlay-text-dim)`, `flex-shrink: 0`
- `.labor-item__thesis` — `font-family: var(--font-mono)`, `font-size: 0.7rem`, `line-height: 1.7`, `color: var(--overlay-text)`
- Mobile: at ≤600px, `height: 65vh`; touch-scrolling on the container; object panel shrinks to 280px

### Phase 5 — Integration test
Run `npm run dev`, navigate desk → Labor → dummy item. Verify:
- Browse grid shows dummy item thumbnail
- Clicking opens labor item view at layer 2
- Object panel renders BoxGeometry cube with orbit controls
- Thesis panel shows text
- Image panels show placeholder PNGs with captions
- Metadata appears bottom-right
- Breadcrumb is correct
- Back navigation returns to browse
- Prev/next between items works (if multiple items exist)

### Deferred
- Admin interface updates for labor subitems (drag-reorder, per-asset fields, thesis field)
- Real GLB model integration and `modelUrl()` wiring
- Mobile touch conflict resolution (one-finger orbit vs. container scroll)
- `object-fit: contain` vs. `cover` decision per image type

---

## Open questions (not blocking)
- Should image panels use `object-fit: cover` (crop to fill) or `object-fit: contain` (letterbox)? Architectural drawings likely need `contain`.
- Should the thesis panel be scrollable if text is long, or should a character limit be enforced in the content model?
- What happens when a labor item has no subitems at all — does the item view show only the object and thesis panels?
