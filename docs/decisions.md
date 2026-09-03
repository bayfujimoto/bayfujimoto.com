# Decisions

This file records confirmed decisions, provisional decisions, open questions, and deferred choices for the archive project.

Its purpose is to prevent drift, repetition, and silent contradictions over time.

---

## Status key

- confirmed: decided and should guide current work
- provisional: current default, but may change later
- open: unresolved and should be revisited
- deferred: intentionally postponed until a later phase

---

## Confirmed decisions

### Project identity
- status: confirmed
- decision: The site is a personal archive, not a conventional portfolio.
- reason: The project is structured around records, artifacts, documents, logs, and material traces rather than simplified personal-brand sections.

### Core structure
- status: confirmed
- decision: The archive is organized as collection > series > subcollection > item.
- reason: Archival hierarchy is foundational to the concept and keeps the project legible as it grows.

### Top-level structure
- status: confirmed
- decision: The site has six top-level objects: Guide (meta item), plus five series (Identity, Labor, Consumption, Creation, Accumulation).
- reason: These categories define how material enters or leaves a life and provide the main navigational structure. Guide separates self-referential content (finding aid, sitemap, philosophy) from archival content, signaling the distinction through visual treatment.
- note: Series renamed from Work to Labor (confirmed decision below).

### Series naming: Work → Labor
- status: confirmed
- decision: The Work series is renamed to Labor.
- reason: "Labor" emphasizes effort, process, and human work over portfolio output. More consistent with the archive's tone and voice.
- date: 2026-04-17

### Labor structure (flat, no subcollections)
- status: confirmed
- decision: Labor uses a flat browse model with no subcollections, similar to Accumulation. Items are filtered by `context` metadata field (academic, professional, personal).
- reason: The prior subcollection split (projects + artifacts) was context-based and fragile. Flat + metadata filtering is more durable and aligns with the Accumulation model.
- url_pattern: `/labor/all/`, `/labor/academic/`, `/labor/professional/`, `/labor/personal/`
- date: 2026-04-17

### Labor context filter removed from UI
- status: confirmed
- decision: No context filter UI is exposed in the labor browse view. Browse is flat and chronological. The `/labor/academic/`, `/labor/professional/`, `/labor/personal/` URL routes remain in the router for future use but no navigation element exposes them.
- reason: With 2–3 items per year, filtering adds no navigational value. A flat chronological list is sufficient and less cluttered.
- date: 2026-05-03

### Labor item view: horizontal scroll panels
- status: confirmed
- decision: Clicking a labor item opens a full-bleed horizontal scroll view (not the standard centered modal). Panel order: (1) Three.js object panel, (2) thesis text panel, (3) image panels with caption below. Title and metadata remain in the bottom-right layer-meta overlay, not inside the scroll container.
- reason: Labor items are projects with multiple assets and a thesis. The horizontal scroll panel structure is consistent with the browse strip and the bio-document container pattern, while giving each asset sufficient space.
- date: 2026-05-03

### Labor item view: caption style
- status: confirmed
- decision: Image captions sit below the image inside the same panel, separated by a 0.5px border-top hairline. Monospace, small, dim.
- reason: Always visible, no interaction required, consistent panel structure.
- date: 2026-05-03

### Labor item view: image panel sizing
- status: confirmed
- decision: Image panel width is computed from the `dimensions` field ("WxH" in pixels) against the container height (75vh). Formula: `panelWidth = (W / H) * containerHeightPx`. Minimum 140px. `object-fit: contain`, left-aligned within the panel.
- reason: Preserves aspect ratio without cropping. Left-alignment is appropriate for architectural drawings which typically have content at a predictable edge.
- date: 2026-05-03

### Labor item view: 3D object
- status: confirmed
- decision: Each labor item may have a `model` field (bare GLB filename). The Three.js object panel renders the GLB via an isolated WebGLRenderer with OrbitControls. If `model` is absent or fails to load, a BoxGeometry fallback renders automatically. Models live at `public/models/labor/` locally.
- reason: The object panel should show the physical artifact from the box. BoxGeometry fallback ensures the panel always renders something meaningful during development.
- date: 2026-05-03

### Typography: serif-primary with Commit Mono for IDs
- status: confirmed
- decision: EB Garamond is the default typeface across the public site. Commit Mono (self-hosted woff2) is reserved for archive ID strings and code elements only (.overlay-id and equivalents). Admin interface retains monospace.
- reason: Serif-primary reinforces the archival, document-like character of the site. Monospace IDs distinguish machine-readable identifiers from prose-like metadata and navigation.
- date: 2026-04-19

### Homepage concept
- status: confirmed
- decision: The homepage is a sparse desk with five primary objects.
- reason: The desk is the framing device and highest-level orientation layer.

### Progressive disclosure
- status: confirmed
- decision: The site reveals complexity in layers: desk, category interior, record system, item inspection.
- reason: The archive should not ask users to understand everything at once.

### Strongest material zones
- status: confirmed
- decision: Material metaphor should be strongest on the homepage and in item inspection.
- reason: Mid-level browse systems need clarity more than simulation.

### Writing tone
- status: confirmed
- decision: Writing should avoid startup language and generic portfolio copy.
- reason: The archive should feel specific, careful, and archival rather than promotional.

### End-state interaction
- status: confirmed
- decision: The long-term goal includes selective 3D or pseudo-3D objects and Resident Evil–influenced item inspection.
- reason: Object attention and inspection intensity are central references, but should remain selective and non-horror-themed.

### Growth model
- status: confirmed
- decision: The archive must support ongoing growth over time.
- reason: This is a living archive, not a one-time project launch.

### Admin workflow
- status: confirmed
- decision: The project should include an admin-facing add-item interface.
- reason: Routine archive maintenance should not require constant manual repository editing.

### Single-scene navigation model
- status: confirmed
- decision: The entire experience — desk, category interior, browse, and item inspection — exists in one continuous spatial scene. There is no page navigation at any layer.
- reason: Everything should feel like it exists in the same physical space. Page transitions would break the spatial continuity that the desk-object-splitting interaction depends on.

### Desk object interaction
- status: confirmed
- decision: Clicking a desk object causes it to lift toward the camera and split into its subcollection parts (e.g., papers separating from a clipboard stack). Subcollections emerge physically from the object.
- reason: The split reveals the internal structure of the series without leaving the scene. It is the spatial equivalent of opening a container.

### URL and history model
- status: confirmed
- decision: The History API (`pushState`) updates the URL at each layer transition. Back/forward and deep links work. No page reloads.
- reason: Spatial continuity requires no page navigation, but browser history and deep linking must still work. `pushState` gives both.
  - `/` — desk
  - `/work/` — Work series open
  - `/work/projects/` — Projects subcollection open
  - `/work/projects/?item=PROJ-001` — item inspection

### Rendering model
- status: confirmed
- decision: A persistent full-screen WebGL canvas (Three.js) sits as the base layer. HTML panels fade in/out on top of the canvas as the user navigates deeper. All content — browse lists, metadata, labels — lives in the HTML overlay, not in the canvas. The canvas is visual only.
- reason: Screen readers and keyboard users must be able to access all content. 3D is a progressive enhancement. The HTML overlay is the accessible source of truth.

### Item inspection delivery
- status: confirmed
- decision: Item inspection uses a modal overlay, not a routed page.
- reason: Everything should feel like it exists in the same physical space. The browse view behind dims and blurs heavily. Deep-linking is preserved via URL query param (e.g. `/accumulation/ephemera/?item=EPH-2025-041`).

### Default item inspection: catalog card
- status: confirmed
- decision: The default item inspection view is a catalog card — ruled label/value fields beside a calibrated plate (standard field 325 mm, scales attached to the inside of the top and left edges with ticks pointing inward, reproduction inset at the scale origin at true proportion). The card is the terminal view: the old centered "full view" was removed. Magnification lives in the plate foot — an "overturn" text button for recto/verso plus a zoom slider (pinch on the plate drives the same value). Zooming shrinks the visible field span and redraws the plate: the reproduction enlarges from the top-left origin (clipped to the box) and the scales relabel to the new span, so the calibration stays truthful at every zoom. The scales sit on the inside of the top and left box edges (which are the container borders), ticks pointing inward, numbers on the inner side of the ticks. Biography, CV, and labor keep their custom inspection views. The `inspection:` frontmatter field remains the hook for per-record overrides later.
- reason: The card asserts that the item is an entry in a system — material evidence over narrative — and the constant field makes physical scale comparable across the whole archive. Chosen after a seven-variant mockup comparison; see `docs/catalog-card-analysis.md`.
- notes:
  - Scale annotations are relational ("field 325 mm", "reduced 1:2", "enlarged 5:1") — never "1:1", because a screen millimetre is not a millimetre.
  - Field labels use the site's own vocabulary, not borrowed typkort terms.
  - Unrecorded fields are suppressed, never faked: no dimensions → plain image cell without scales; no reproduction → fields-only card with a "no reproduction" line.
  - Non-published status renders as a faint stamp on the card rather than a field row.
- date: 2026-06-12

### Folded matter — closed and open states
- status: confirmed
- decision: Folded ephemera (brochures, fold-out guides, folded maps) carry a second state on the catalog card. The record keeps one canonical size: `dimensions` remains the closed W x H (grid relative scale, default plate); `dimensions_open` is the measured unfolded size. Two asset roles, `inside` and `outside`, hold the open faces; `front` / `back` stay the closed recto / verso and the thumbnail stays the closed recto. The plate foot gains `unfold` / `fold` beside `overturn`; overturn flips within a state, unfold switches states (landing on the inside; folding lands on the recto), the asset label reads `closed · recto` … `open · outside`. The plate's field ratio is computed from the larger state and held for both, so folding and unfolding changes the object's extent on the plate at one scale — never a shrink on unfolding. Zoom is kept across the switch; pan resets. No fold animation: faces swap as overturn does. The grid is unchanged (objects as filed). A record is folded when it carries an open-state scan — no `fold` field: the fold family (half, tri, accordion) is not a mechanism, and when worth recording it goes in `extent` in the archivist's words.
- reason: `rendering-strategy.md` prescribes alternate states over physics for folded documents; a per-state ratio would contradict the plate's true-proportion claim; the grid compares objects as they lie in the flat file.
- notes:
  - The open size is typed, never derived (a tri-fold's tucked panel is cut narrower than 3 × closed).
  - An open state without `dimensions_open` draws the unlabelled scale grid ("open size not recorded") — the existing honest state for no measurement claim.
  - The admin-only `contraption` states model was not reused: it is never rendered on the site and has no per-state dimensions.
  - Plan of record: `docs/brochure-fold-states-plan.md`.
- date: 2026-09-03

### Item card field schema: spine + typed slots
- status: confirmed
- decision: The catalog card's fields are defined by a single declarative schema keyed by `item_type` (`src/shared/field-schema.js`), imported by both the admin form and `renderCard`, replacing the prior union-list-with-suppression. The card is a fixed spine — accession (`id`, shown as "ID", + `item_type`), `title`, responsibility (creator), `date` — followed by up to three type-specific slots, then physical (`extent` + `dimensions`), note, and riders (`related_ids`, `tags`). Status renders as a stamp, not a row. Scope is the card-using series (Consumption, Creation, Accumulation); Labor and Identity keep their custom views.
- sub-decisions:
  - Creator defaults to the archive subject for Creation types and is suppressed when it equals the subject, shown only on exception (collaborator, commission, found object). Authorship is asserted once on the Creation series sheet (rule of non-repetition).
  - `source` is split: Consumption's "where seen" becomes `seen_via`; `source` is reserved for Accumulation provenance. Carried out as an isolated data migration over the YAML records.
  - `extent` is a literal field (count of physical pieces), decoupled from the plate's recto/verso `1/1` view control; `extent > 1` signals a file-level record.
  - Ephemera shows `place` and `event` together in one split row; `source` (provenance) follows.
  - Every editable field carries an `example` string rendered as the admin input's placeholder.
  - Card-visible fields are limited to spine + slots + note + riders + tags; all other metadata stays record-only.
- reason: The field set was implicit and triplicated across `type-fields.js`, `renderCard`, and `content-model.md`, and had already drifted (`rating` displayed but uneditable; `place`/`dimensions` editable only for ephemera yet printed for any type). A single source of truth makes the card concise and comparable and prevents future drift. Extends the "Default item inspection: catalog card" decision (2026-06-12).
- open: music slot 2; book slot 2; whether `rating` stays a slot or becomes record-only; whether `note` records get a plate; the description-control ("described by / on") line. Tracked in `docs/field-schema.md`.
- reference: `docs/field-schema.md`, `src/shared/field-schema.js`
- date: 2026-06-13

### Catalog card typography: register by provenance
- status: confirmed
- decision: On the catalog card, typographic register encodes provenance. Monospace (Commit Mono) is the default for the record's data — system codes (`id`, `type`), transcribed/given facts (creator names, `date`, `year`, `dimensions`, `extent`), and all discrete catalog tokens (`seen_via`, `origin`, `place`, `event`, etc., plus `tags` and see-also references). Serif (EB Garamond) is reserved for the archivist's voice: the `context_note` and titles the archivist devised (Creation and Accumulation records). Consumption titles, being transcribed work titles, are monospace. `rating` is a hybrid — a serif score with a monospace ` / 5` scale.
- reason: Register encodes the transcribed-vs-authored distinction that cataloguing already marks (DACS brackets devised titles; the Leiden Conventions separate the document from editorial supply). It dovetails with the creator self-default — the same self-vs-other axis that suppresses the creator row makes a Creation title serif. Bringhurst reads monospace as the register of the document, supporting mono as the record's voice.
- scope: the catalog card only. Elsewhere (browse, biography, CV, labor, guide) serif stays primary; this extends, not replaces, "Typography: serif-primary with Commit Mono for IDs" (2026-04-19).
- implementation: `cell()` marks slot tokens mono; `renderCard` applies serif to the note and devised titles; `titleIsGiven()` drives the title register via a per-type `titleGiven` flag; rating is special-cased (serif score + mono scale). CSS: `.item-card__title--mono`, `.item-card__note p`, `.item-card__rider`.
- reference: `docs/field-schema.md` (Typographic register), `src/shared/field-schema.js`, `src/app/panels.js`, `src/styles/main.css`
- date: 2026-06-13

### Desk realism
- status: confirmed
- decision: The homepage desk is a literal scene with wood texture and desk lighting. It should feel like a real physical surface.
- reason: The desk is the primary framing device and should carry genuine material weight, not be an abstracted background treatment.

### Responsive desk layouts (rearrange on the surface)
- status: confirmed
- decision: The homepage desk objects are rearranged on the desk surface per viewport regime, defined as placement maps in `scene.js` (`LAYOUTS`). Only each object's position on the surface (x = left/right, z = near/far depth) changes between regimes; its size and resting height on the desk are identical everywhere, and the camera is left untouched. Three regimes by viewport width: `wide` (>1024px) is the original landscape composition; `square` (600–1024px) clusters the objects inward for near-square tablets; `vertical` (<600px) arranges them into a single column down the desk for portrait phones. Objects re-arrange on resize when a breakpoint is crossed (e.g. phone rotation) without reloading models.
- reason: The original positions were tuned for a landscape laptop, so the left/right-spread objects fell off the sides of a portrait phone. The camera sits nearly top-down, so shuffling an object to a different spot on the surface changes neither its apparent size nor its distance from the desk — the objects keep laying on the desk exactly as composed, just relocated. (Two earlier attempts were wrong: one shrank the objects via per-object scale multipliers, the other zoomed the camera out instead of moving anything; both changed how the objects read. The kept approach moves position only, no scaling, no camera change.)
- note: The DOM `.desk-objects` grid remains the accessible navigation source of truth (hidden, feeds the skip menu); the 3D layer is visual. The square and vertical coordinates are tuned by eye and need an on-device pass — large objects (especially the identity dossier) may need their column spacing nudged to avoid overlap.
- date: 2026-06-29

### Category interior container metaphors
- status: confirmed
- decision: Each series interior uses its object metaphor as a physical container. Subcollections appear as pages, tabs, or sections within that container rather than as tile grids. Series without subcollections use flat browse with view-based filtering.
- reason: Preserves the material logic of the archive through the browse layers, not just on the desk and in inspection.
  - Identity: dossier packet (subcollections: biography, cv, contact)
  - Labor: open binder or folio (flat browse, filtered by context)
  - Consumption: open ledger with edge tabs per subcollection (films, books, music, coffee, games)
  - Creation: open sketchbook or tray (sketches, photos, prototypes, videos, notes)
  - Accumulation: open flat file or drawer (flat browse)

### Consumption subcollections (updated)
- status: confirmed
- decision: Consumption subcollections are films, books, music, coffee, and games.
- reason: Expands log coverage and removes inflated "influences" category (better as a metadata filter).
- note: UI labels can read "film log", "reading log" etc.; keys are bare plurals.
- date: 2026-04-17

### Creation subcollections (updated)
- status: confirmed
- decision: Creation subcollections are sketches, photos, prototypes, videos, and notes.
- reason: Organized by material type, not by project context. "Projects" belongs in Labor, not Creation. Adds "notes" for textual and sketch ideas.
- date: 2026-04-17

### Accumulation browse model
- status: confirmed
- decision: Accumulation uses a single flat ephemera browse with no subcollection tabs. The `ephemera` key is the only subcollection. All item subtypes (tickets, receipts, brochures, documents, handouts) share the ephemera record model, distinguished by `item_type`.
- reason: The ephemera/documents distinction was weak — "handouts" appeared in both definitions and `documents` was always empty. A flat browse grouped by year, event, place, or type serves the content better.
- deferred: Grouping/sort UI (year · constellation · place · type) is deferred to Phase 7. (Event-based grouping is subsumed by Constellations, 2026-08-22.)

### Admin shell architecture: three-pane TUI
- status: confirmed
- decision: The admin interface is a single-page three-pane shell modeled on a vim-style database client. `[e] Explorer` (collapsible tree of the archive) sits on the left; `[r] Record` (edit form / empty state / new-item wizard) on the top-right; `[l] Log` (pending changes + commit button + session history) on the bottom-right. Each pane has a notched `[letter] Name` label and a draggable gutter between it and its neighbors; sizes persist to localStorage. The shell sits inside a centered window on a tray-grey backdrop.
- reason: A single-pane routed admin (Dashboard / Browse / New / Edit) felt unnatural for an archive that grows over time. Tree + record + log fits the editorial loop (browse → open → review pending → commit) better than a sequence of routed views, and keeps every layer visible at once. The model mirrors a TUI database client (see docs/tui.gif for the visual reference).
- reference: docs/admin-tui-overhaul.md
- date: 2026-05-12

### Admin interaction model: vim modality (desktop)
- status: confirmed
- decision: Desktop admin uses vim-style modal interaction. Four modes — normal (keyboard shortcuts), insert (a text input has focus, keys flow to it), command (`:` opens an inline command bar in the status row), filter (`/` opens an in-pane filter at the top of the focused pane). Auto-transitions: focusing any editable input flips NORMAL → INSERT; blurring returns to NORMAL. The keymap legend at the bottom of the window is contextual on (mode, focused pane).
- reason: Keyboard-first navigation suits an archive that grows over time. A consistent mode model makes the legend self-documenting (it lists the bindings that are live for the current state). Auto-INSERT on focus avoids requiring explicit `i` before typing.
- date: 2026-05-12

### Admin palette: cool-grey body with Solarized accents
- status: confirmed
- decision: The admin uses a cool-grey body (`#d5d8db`) with Solarized accent colors used semantically — green for ok/added, red for error/deleted, violet for in-flight, yellow for pending edits, orange for filter matches. Blue is reserved for the `-- NORMAL --` mode chip only. Foreground inversion: `--fg` (vibrant ink `#1f2226`) is the focus/active text color; default body text sits at `--fg-muted` medium charcoal.
- reason: The earlier amber-on-black terminal aesthetic was distinct from the public site but limited semantic vocabulary. A neutral grey + Solarized palette gives the admin its own identity while supporting four-plus semantic states (pending / saving / saved / error / matched). The vibrant-ink-as-focus pattern matches the gif's "active text = same hue, brighter version of default" idiom, inverted for light theme.
- date: 2026-05-12

### Admin mobile model: bottom tabstrip, no vim
- status: confirmed
- decision: At ≤700px the three-pane shell collapses to a single visible pane controlled by an iOS-style bottom tabstrip (`[e Explorer] [r Record] [l Log]`). Vim modality strictly disables — `modes.js` short-circuits all four handlers (keydown, focusin, focusout, mousedown) via a media-query check. The mode chip, clock, and keymap legend hide; the status row collapses to its state text only. Native form focus and tap interactions carry the entire mobile model. Opening an item from the Explorer auto-switches the active tab to Record.
- reason: Vim-style keyboard interaction doesn't translate to phones. The bottom-tab pattern is familiar and the form fields keep the 16px input minimum to suppress iOS zoom-on-focus.
- date: 2026-05-12

### Constellations: cross-series grouping (Phase 1 — field, registry, flat route)
- status: confirmed
- decision: The cross-series lists concept (`docs/cross-series-lists.md`) is named **Constellations** and enters the archive metadata-first, ahead of any desk object. Item records carry an optional `constellations` field — an **array** of constellation slugs — preserving the many-to-many direction (one record, several contexts; no item is moved or duplicated out of its series). Each constellation is defined once by a **registry record** at `src/content/constellations/<slug>.md` (title, slug, date or date range, optional short note); `build-data.js` resolves item references against the registry and warns on unresolved slugs.
- sub-decisions:
  - **Scope:** all record types except Identity (biography, cv, contact) may carry the field.
  - **`event` is replaced.** Genuine groupings among existing `event` values (e.g. `atxsf road trip`, `Lassen Volcanic NP Roadtrip`) migrate to constellations; stray source-context values (e.g. `Film screening`) reclassify into `source` / `context_note`. The field is removed from the schema.
  - **Tags stay separate.** In practice tags are occasion descriptors (venue, companions, format) — properties of an item, not contexts it belongs to. No migration; the two coexist.
  - **Browse now:** a flat public route `/constellations/<slug>/` renders each constellation as a cross-series, chronological browse using the same contact-sheet grid as the Accumulation subcollection view. This subsumes the deferred Accumulation event-filter idea (`/accumulation/sxsw-2026/`, Phase 7).
  - **Card display:** constellations print on the catalog card as **their own rider row** near tags — never a split row, uniform across all card-using types. Each value is **clickable**, navigating to `/constellations/<slug>/`. Ephemera's slot 1 becomes `place` alone (the former place + event split row is retired with the field). Register: monospace (index/navigation token), like tags and see-also.
  - **Admin intake:** the constellation input on any item form autocompletes against the registry, with an inline "create new constellation" path when no match exists (title → suggested slug → registry file added to pending changes alongside the item). See `docs/admin-interface.md`.
  - **Slugs:** year-first kebab-case for dated constellations (`2026-atx-sf`, `2024-paralympics`); thematic, undated constellations omit the year.
- deferred to the meta-object phase: curation (authored member order, per-item captions), the desk object and its name-register, placement near the Guide. The field gives exhaustive, derived membership now; the curated layer arrives later on top of it, not instead of it.
- reason: Preserves provenance-based arrangement (respect des fonds) while adding the lateral access layer archival practice locates in description rather than arrangement — the finding aid's subject index given a data model (Peter Scott's series system: many-to-many links between records and contexts). Field-first sequencing gets the plumbing and the migration done before the object metaphor is designed.
- reference: `docs/cross-series-lists.md`, `docs/content-model.md`, `docs/field-schema.md`, `docs/information-architecture.md`, `docs/admin-interface.md`
- date: 2026-08-22

### Accumulation URL model
- status: confirmed
- decision: Accumulation uses a view-based second URL segment rather than a subcollection key.
  - `/accumulation/all/` — unfiltered browse (default)
  - `/accumulation/sxsw-2026/` — filtered by event slug (superseded: the event field and this filter idea are subsumed by Constellations — see "Constellations: cross-series grouping", 2026-08-22; the view segment remains available for future grouping/sort views)
  - `/accumulation/all/?item=EPH-2025-001` — item inspection, unfiltered context
  - `/accumulation/sxsw-2026/?item=EPH-2025-001` — item inspection, filter context preserved
- reason: `/accumulation/ephemera/` exposes the internal data key rather than describing a view. The view segment will later carry the active filter/group, making URLs semantically meaningful and shareable. Back from a filter view goes to `/accumulation/all/`.
- note: This is Accumulation-specific. All other series keep `/series/subcollection/`. The `subcollection` state field stays `"ephemera"` as the data key; `view` is a separate state field for the URL segment.

---

### Photo entries — display treatment
- status: confirmed
- decision: Photo reproductions are always shown in their entirety, with padding — never cropped. In the browse grid, every photo record renders as a pile of prints in its cell (a single-photo record is a pile of one: slightly rotated, whole photo visible; multi-photo records show the cover print over rotated sheet edges). In the inspection card, multi-photo records use a contact strip under the plate: the plate shows the selected exposure whole, and each exposure appears in its entirety in the strip.
- reason: Chosen from the photo-entry layout studies (mockups/photo-entries/, rev 3). The pile reads physically at a glance without breaking the grid's rhythm; the strip keeps the whole set visible while the catalog card stays unchanged.
- date: 2026-09-01

---

### Labor items — catalog-card inspection
- status: confirmed
- decision: The bespoke labor item view (horizontal panel scroll, 3D model scene, per-image width_vw) is retired. Labor items open in the standard catalog card: subitems render as the record's gallery (whole-image plate, contact strip, prev/next stepping), the thesis renders as the card's prose row (labelled "thesis"), and context/role/organization render as typed rows via the shared field schema. The admin's labor editor is unchanged; `model` and `width_vw` are still stored but no longer displayed.
- reason: One inspection grammar across the archive; the photo/gallery card treatment covers what the bespoke view did, with less machinery.
- date: 2026-09-02

---

## Provisional decisions

### Tech stack
- status: confirmed
- decision: Vite + Three.js + a custom Node data script (`scripts/build-data.js`). Deployed on Netlify. GitHub as source of truth.
- reason: The site is a single-page spatial app with a persistent WebGL canvas. 11ty's core value is generating HTML pages — suppressing that output to serve an SPA was the wrong fit. Vite handles JS bundling (including Three.js), HMR, and asset pipeline natively. The data script replaces 11ty's collection system with ~50 lines of plain Node that reads Markdown front matter and writes `public/data/archive.json`.
- supersedes: the earlier provisional decision to use Eleventy + GitHub + Netlify

### Content format
- status: provisional
- decision: Store records primarily as Markdown with front matter, with JSON/YAML data where useful.
- reason: Markdown is legible, portable, and human-editable. `scripts/build-data.js` reads front matter directly via gray-matter and outputs `archive.json`. The format is build-tool-agnostic.
- revisit_when: content volume and relationships become clearer

### Admin implementation
- status: superseded
- decision: Originally provisional — start with the simplest admin layer that respects the schema, potentially Decap CMS or a custom lightweight form.
- superseded_by: the confirmed decisions above for the three-pane TUI shell, vim modality, palette, and mobile model. The admin is a custom GitHub-backed app served from `/admin.html`; no external CMS is used.
- date: 2026-05-12

### Public/private split
- status: provisional
- decision: Keep the admin interface on a separate protected route such as `/admin/` or `/studio/`.
- reason: The public archive and maintenance interface have different goals and should remain separate.
- revisit_when: auth and deployment planning

### Inspection pattern
- status: provisional
- decision: Use overlays or focused dedicated views for item inspection, depending on item type.
- reason: Different records may need different levels of isolation and context.
- revisit_when: wireframing item inspection

### Record depth
- status: provisional
- decision: Support two entry levels: lightweight log and full archival record.
- reason: Fast-growing categories need low-friction entry, while meaningful items need richer treatment.
- revisit_when: admin form design

---

## Open questions

### Homepage object fidelity
- status: open
- question: Should the first public build use flat illustrations, pseudo-3D objects, image-based objects, or real-time 3D on the homepage?
- why_it_matters: This affects scope, rendering strategy, asset production, and performance.
- current_bias: start with pseudo-3D or image-based objects

### Desk realism
- status: open
- question: How literal should the desk scene be?
- why_it_matters: Too literal may feel gimmicky; too abstract may weaken the framing device.
- current_bias: restrained, sparse, not overly theatrical

### Category interior treatment
- status: open
- question: How distinct should each category interior feel visually?
- why_it_matters: Too much variation may fragment the site; too little may flatten material differences.
- current_bias: shared structural language, category-specific material cues

### Item inspection delivery
- status: open
- question: Should inspection happen in modal overlays, routed pages, or a hybrid system?
- why_it_matters: This affects URL structure, browse continuity, accessibility, and implementation complexity.

### Search timing
- status: open
- question: Should search be in the first public release or added after the archive has enough depth?
- why_it_matters: Search may be unnecessary too early but essential later.
- current_bias: provide archive guide and browse first, add stronger search once content grows

### Content thresholds
- status: open
- question: What makes an item worthy of full archival treatment instead of a lightweight log?
- why_it_matters: Without thresholds, metadata effort may become inconsistent.
- current_bias: significance, inspectability, contextual richness, or relationship density


### Creation boundaries
- status: open
- question: What belongs in Work versus Creation when an item overlaps both?
- why_it_matters: Ambiguous classification can confuse both ingest and browse.
- current_bias: Work for project/case-study framing, Creation for experimentation and authored side practice

### Accumulation scale
- status: open
- question: How much everyday ephemera is enough before the section becomes noisy?
- why_it_matters: This category can grow fastest and become visually or structurally overwhelming.
- current_bias: preserve breadth, but rely on filtering and selective highlighting

### Writing density
- status: open
- question: How much reflective writing belongs alongside metadata?
- why_it_matters: Too little may feel cold; too much may dilute the archival structure.
- current_bias: concise notes by default, longer writing selectively

### 3D threshold
- status: open
- question: What specific criteria justify actual 3D rather than image-based or pseudo-3D inspection?
- why_it_matters: Prevents unnecessary scope and performance cost.
- current_bias: actual 3D only when spatial reading materially improves understanding

### Constellations meta-object (desk object for the cross-series layer)
- status: open (narrowed)
- question: What physical object represents Constellations on the desk, and where does it sit? Does the curated layer (authored member order, per-item captions) arrive with the object?
- resolved (2026-08-22): the name (**Constellations**), the data model (item-side `constellations` array + registry records, cross-reference/index, many-to-many), the flat browse route, the card rider, and the admin intake — see "Constellations: cross-series grouping" under confirmed decisions.
- why_it_matters: The object choice affects the desk composition, naming register, and whether curation is authored per-list; the earlier bias toward a meta-object near the Guide (a sibling of the finding aid, not of the series) still stands.
- current_bias: meta-object near the Guide; curated layer ships with the object, on top of the exhaustive field-derived membership
- see: `docs/cross-series-lists.md` (candidate objects and constraints)

### Auth model
- status: open
- question: How should the admin interface be authenticated?
- why_it_matters: Affects Netlify setup, editing flow, and implementation complexity.

### Asset storage
- status: confirmed
- decision: Originals and web derivatives are stored in Cloudflare R2 and served via public bucket URL. Asset paths in record front matter should be full URLs. The VITE_R2_BASE_URL env variable controls the bucket root. During transition, paths starting with /assets/ are automatically expanded to full R2 URLs by build-data.js.
- reason: Keeps binary assets out of git history, scales independently of the repo, and separates content from build infrastructure.

---

## Deferred decisions

### Full search system
- status: deferred
- decision: Defer advanced search implementation details until the archive has enough records to justify it.
- revisit_in_phase: browse systems / polish

### Batch import tooling
- status: deferred
- decision: Defer automation for importing film logs, reading logs, and other recurring records until the manual schema is validated.
- revisit_in_phase: admin tools expansion

### Actual 3D stack
- status: deferred
- decision: Defer final choice between model-viewer, Three.js, or another 3D solution until after non-3D inspection patterns are validated.
- revisit_in_phase: selective 3D enhancement

### Public archive guide depth
- status: deferred
- decision: Defer whether the archive guide is minimal or essay-like until wireframes and early content volume are clearer.
- revisit_in_phase: text-first wireframes

---

## Decision rules

When making future decisions:
- prefer clarity over spectacle
- prefer hierarchy over novelty
- prefer scalable systems over one-off effects
- prefer lightweight solutions before heavy custom tooling
- prefer selective 3D over universal 3D
- prefer the smallest metadata schema that still preserves meaning
- prefer archive coherence over feature accumulation

## Update rule

When a meaningful project decision is made:
1. add it here
2. mark its status
3. note why it was made
4. note when it should be revisited if not fully settled