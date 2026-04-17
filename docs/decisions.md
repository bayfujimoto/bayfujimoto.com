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

### Top-level series
- status: confirmed
- decision: The five top-level categories are Identity, Work, Consumption, Creation, and Accumulation.
- reason: These categories define how material enters or leaves a life and provide the main navigational structure.

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

### Desk realism
- status: confirmed
- decision: The homepage desk is a literal scene with wood texture and desk lighting. It should feel like a real physical surface.
- reason: The desk is the primary framing device and should carry genuine material weight, not be an abstracted background treatment.

### Category interior container metaphors
- status: confirmed
- decision: Each series interior uses its object metaphor as a physical container. Subcollections appear as pages, tabs, or sections within that container rather than as tile grids.
- reason: Preserves the material logic of the archive through the browse layers, not just on the desk and in inspection.
  - Identity: dossier packet
  - Work: open binder or folio
  - Consumption: open ledger with edge tabs per subcollection
  - Creation: open sketchbook or tray
  - Accumulation: open flat file or drawer

### Accumulation browse model
- status: confirmed
- decision: Accumulation uses a single flat ephemera browse with no subcollection tabs. The `ephemera` key is the only subcollection. All item subtypes (tickets, receipts, brochures, documents, handouts) share the ephemera record model, distinguished by `item_type`.
- reason: The ephemera/documents distinction was weak — "handouts" appeared in both definitions and `documents` was always empty. A flat browse grouped by year, event, place, or type serves the content better.
- deferred: Grouping/sort UI (year · event · place · type) is deferred to Phase 7.

### Accumulation URL model
- status: confirmed
- decision: Accumulation uses a view-based second URL segment rather than a subcollection key.
  - `/accumulation/all/` — unfiltered browse (default)
  - `/accumulation/sxsw-2026/` — filtered by event slug (filter logic deferred to Phase 7)
  - `/accumulation/all/?item=EPH-2025-001` — item inspection, unfiltered context
  - `/accumulation/sxsw-2026/?item=EPH-2025-001` — item inspection, filter context preserved
- reason: `/accumulation/ephemera/` exposes the internal data key rather than describing a view. The view segment will later carry the active filter/group, making URLs semantically meaningful and shareable. Back from a filter view goes to `/accumulation/all/`.
- note: This is Accumulation-specific. All other series keep `/series/subcollection/`. The `subcollection` state field stays `"ephemera"` as the data key; `view` is a separate state field for the URL segment.

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
- status: provisional
- decision: Start with the simplest admin layer that respects the schema, potentially Decap CMS or a custom lightweight form.
- reason: The project needs ingest support, but should not overbuild a CMS too early.
- revisit_when: after content model and platform structure are stable

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

### Influence section scope
- status: open
- question: In Consumption, how broad should “favorite media and influences” become?
- why_it_matters: This can easily sprawl into an unbounded references section.
- current_bias: start tightly curated

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