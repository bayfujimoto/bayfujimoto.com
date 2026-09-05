# Information Architecture

This is the canonical reference for the archive's structure, hierarchy, URL scheme, interaction layers, module mapping, and data ingestion definitions.

---

## Hierarchy

The archive is organized as a multi-level hierarchy:

```
Collection
├─ Meta Item (Guide)
└─ Series
   ├─ Subcollection (optional)
   │  └─ Item
   └─ Item (series without subcollections)
```

- **Collection** — the archive as a whole. There is one collection: bayfujimoto.com.
- **Meta Item** — the Guide (finding aid, sitemap, site philosophy). A 6th top-level object, visually distinct, describing the archive itself rather than its contents.
- **Series** — the five main domains of the archive. Each is represented as a physical object on the desk.
- **Subcollection** — an optional group of related records within a series. Represented as pages, tabs, or sections within the series' physical container. Not all series use subcollections.
- **Item** — an individual archive record. Has metadata, assets, status, and optional inspection behavior.

Lateral to this tree sit **Constellations** — cross-series groupings (a trip, an
event, a preoccupation) that gather items from several series without moving or
duplicating any of them. An item carries a `constellations` array of slugs; each
slug resolves to a registry record. Constellations are an access layer over the
hierarchy, not a level within it. See decisions.md → "Constellations:
cross-series grouping" and `docs/cross-series-lists.md`.

---

## The Six Top-Level Objects and the Amber Block

### Guide (Meta Item) — key on a paper tag
Archive metadata and site information. Visually distinct from the five series, sits at a slight remove from other objects.

Interaction type: **contraption**
- Object: key with paper tag (unattached, not pinned to the desk)
- Behavior (as built, 2026-09-05): clicking opens the Guide as a catalog card whose contact strip holds the six desk objects — the key first, then the five series in desk order. The plate shows the selected object's model, turning; the fields describe the object and what it holds; the note is the intro on the key frame and the object's description otherwise. `open →` leads to the frame's series. Frames are addressable at `/guide/<key>/`. See decisions.md → "Guide — inspection card of desk objects".
- Content: finding aid (per-object notes), archive metadata (counts, containers, model files), the intro
- Metaphorical grounding: Derrida's archon; the archivist's custody and interpretation; specimen tags on archival items

### Identity — dossier
Self-description and orientation materials. The most literal object on the desk; prioritizes legibility for practical reference.

Interaction type: **expansion**
- Object: bound document packet, clasp closed, label present, worn from repeated handling
- Behavior: clicking loosens the binding; three documents slide out and arrange themselves on the surface
- Subcollections (three documents):
  - `biography` — short and long-form profile text
  - `cv` — CV / resume entries
  - `contact` — contact channels and availability
- Metaphorical grounding: material particularity of the dossier itself (wear, label, weight); legibility as a principle; the transferable account of a person

### Labor — powder-coated steel strongbox
Work, projects, and professional effort. Emphasizes the institutional and deliverable aspects of work, not the process of making.

Interaction type: **contraption**
- Object: flat-lidded rectangular box, powder-coated steel, single metal clasp, institutional appearance
- Behavior: clicking releases the latch; the lid lifts, revealing heterogeneous contents (folded drawings, specifications, reports)
- Contents: flat structure, no subcollections. Browse is flat with metadata-based filtering by context (`academic`, `professional`, `personal`)
- Metaphorical grounding: utilitarian storage; the record of completed labor and professional exchange; work contextualized by role and accountability

### Consumption — interlocking composite sphere
Records of intake, ritual, taste, and repeated attention. Emphasizes that a unified self is composed of disparate influences.

Interaction type: **expansion**
- Object: assembled sphere (appears unified from above), seams non-obvious, five interlocking pieces (turquoise, wood, copper, stone, crystal)
- Behavior: clicking causes pieces to separate slowly; each slides or rotates out of joint, coming to rest on the surface
- Interior faces: rough and irregular, crystalline in places, revealing the complexity withheld by the exterior
- Subcollections (five pieces):
  - `films` — films watched
  - `books` — books read
  - `music` — music listened to
  - `coffee` — coffee brewed
  - `games` — games played
- Metaphorical grounding: Emerson's observation that consumption shapes us below conscious memory; the social life of objects; the relationship between a legible exterior and a composite interior

### Creation — stone stamp and paper
Things made outside the narrower professional portfolio frame. Centered on the mark of authorship.

Interaction type: **contraption**
- Object: personalized stone seal resting on its side beside a paper (sketch, painting, or indistinct drawing)
- Behavior: clicking causes the stamp to right itself, traverse the paper, and press down; an impression appears; the series opens through the impression
- Contents: flat structure, no subcollections
- Subcollections:
  - `sketches` — drawings and sketchbook pages
  - `photos` — photographs, contact sheets
  - `prototypes` — physical and digital prototypes
  - `videos` — video work and experiments
  - `notes` — notes, sketches, and written ideas
- Metaphorical grounding: Simmel on the handle and mediation between use and contemplation; the seal as the oldest institutional gesture; the mark as the declaration that a thing has been made and is finished

### Accumulation — string-tied bundle
Collected physical ephemera: tickets, receipts, brochures, handouts, printed matter. Emphasizes heterogeneity and the lack of collecting logic.

Interaction type: **contraption**
- Object: cloth wrapped around things and tied with string, no lock or seal, closure is provisional
- Behavior: clicking releases the string; the cloth unfolds flat; the contents become visible
- Contents: flat structure, no subcollection tabs. Browse is flat and unfiltered: tickets, receipts, brochures, printed matter from events and transactions
- Metaphorical grounding: Stewart's distinction between souvenirs and collections, resistant to both terms; the accumulation of things kept without full intention; the distinction between the care implied by wrapping and the resistance of the contents

### The Amber Block (unresolved)
A small block of amber resin at slight remove from the six navigable objects. Its purpose remains unresolved.

- Object: clear or nearly clear amber; small; objects visible inside but not reachable
- Behavior: clicking sends hairline fractures across the surface; second click splits the block, opening like a geode
- Purpose: not determined. Possibilities include: entry point to the administrative layer; entry point to unpublished records or drafts; an inert object that rewards examination with nothing that can be entered or used
- Metaphorical grounding: amber as a preservation technology that precludes access; the relationship between visibility and access; a formal correspondence with the composite sphere (both involve looking into something, both preoccupied with enclosure)

---

## Interaction Layers

The site reveals complexity in four layers:

### Layer 1 — Desk (homepage)
A sparse, literal desk scene with five top-level objects. Each object represents a series. Clicking an object opens the category interior for that series.

- Strongest material treatment. Wood texture, lighting, real desk surface.
- No navigation bar. "Archive guide" is the only persistent text link.
- Does not describe content — objects carry meaning through material metaphor.

### Layer 2 — Category Interior (series page)
Opening an object reveals the series interior. Each series uses its object metaphor as a physical container:

- Identity: document packet / dossier
- Work: open binder or folio
- Consumption: open ledger with edge tabs for each subcollection
- Creation: open sketchbook or tray view
- Accumulation: open flat file or drawer

The interior shows subcollections as pages, tabs, dividers, or sections within the physical container. Each subcollection displays a preview of recent entries and links to the full browse view.

### Layer 3 — Record System (subcollection browse page)
The full browse view for a subcollection. Clarity and navigability take priority over material metaphor here.

Features by subcollection type:
- Log-style (films, books, coffee): list or grid with year dividers, filters by type/date/tag
- Ephemera: contact-sheet grid or list, filterable by subtype, year, place
- Projects: card grid or list with role, date, summary
- Sketches / photos: contact-sheet grid
- Documents: list with document type and date
- Constellations: the Accumulation contact-sheet grid, reused unchanged — cross-series members render as thumbnails in one chronological sequence; the constellation's title, date range, and note head the page

### Layer 4 — Item Inspection (modal overlay)
Clicking any item opens an inspection modal. The browse view behind dims and blurs heavily so everything feels like it exists in the same physical space.

- Two-column layout: image/object on left, metadata on right
- Image interactions depend on item type: zoom, front/back flip, gallery stepping
- Metadata panel: all relevant fields, note, related items, tags, record ID
- Close via ✕ button or clicking the blurred background
- Prev/next navigates within the current browse context
- Deep-link via URL query param preserves linkability and bookmarking

---

## URL Structure

### Public routes

```
/                              homepage / desk
/guide/                        archive guide — the key frame (intro)
/guide/<series>/               archive guide — one desk object's frame

/identity/                     identity category interior
/identity/biography/           biography
/identity/cv/                  CV / resume
/identity/contact/             contact

/labor/                        labor category interior
/labor/all/                    labor browse, unfiltered
/labor/academic/               labor browse, filtered by context
/labor/professional/           labor browse, filtered by context
/labor/personal/               labor browse, filtered by context

/consumption/                  consumption category interior
/consumption/films/            film log browse
/consumption/books/            books browse
/consumption/music/            music log browse
/consumption/coffee/           coffee log browse
/consumption/games/            games log browse

/creation/                     creation category interior
/creation/sketches/            sketches browse
/creation/photos/              photos and contact sheets browse
/creation/prototypes/          prototypes browse
/creation/videos/              videos browse
/creation/notes/               notes browse

/accumulation/                 accumulation (redirects to /accumulation/all/)
/accumulation/all/             ephemera browse, unfiltered

/constellations/2026-atx-sf/   one constellation: cross-series browse, chronological
```

Notes:
- Labor and Accumulation both use view-based second segments rather than subcollection keys. See decisions.md for rationale.
- Labor context filters (`academic`, `professional`, `personal`) are metadata-based, not structural subcollections.
- The earlier `/accumulation/sxsw-2026/` event-filter idea is subsumed by constellation routes (decisions.md, 2026-08-22). The Accumulation view segment remains reserved for future grouping/sort views (Phase 7).
- `/constellations/<slug>/` renders the constellation's gathered items — drawn from every series — in one chronological view using the same contact-sheet grid as the Accumulation browse. A bare `/constellations/` index is deferred to the meta-object phase; in Phase 1 constellation pages are reached from catalog-card riders and deep links.

### Item inspection deep-links

Item inspection uses URL query params to open a modal from a browse page:

```
/accumulation/all/?item=EPH-2025-041
/constellations/2026-atx-sf/?item=EPH-2025-041
/work/projects/?item=PROJ-2025-002
/consumption/films/?item=FILM-2026-001
```

Prev/next inside the modal follows the current browse context — on a
constellation page, that means stepping through the constellation's members
across series, in chronological order.

The browse page reads the `item` param on load and opens the corresponding inspection modal. This preserves:
- linkability and bookmarking
- browsable back/forward navigation
- accessibility via keyboard and screen reader

### Admin routes (protected)

```
/admin/                        dashboard
/admin/new/                    new item form
/admin/items/                  all items list and search
```

---

## Module Mapping

```
Layer         Module / Entry Point        Notes
──────────    ──────────────────────────  ─────────────────────────────────────
Homepage      src/main.js                 desk scene, Three.js canvas init
Series        src/views/series.js         one module per series container metaphor
Browse        src/views/browse.js         shared browse shell; per-subcollection
                                          view modules (grid, list, log, etc.)
Inspection    src/views/modal.js          modal reads ?item= param, builds panel
                                          at runtime from archive data
Admin         src/admin/main.js           protected; separate Vite entry point
Base shell    src/index.html              root HTML, nav, footer
```

Series interior module notes:
- Each series view imports a container module for its physical metaphor
- Container options: `ledger.js`, `binder.js`, `sketchbook.js`, `tray.js`, `flat-file.js`, `dossier.js`

---

## Data Ingestion

Content is stored as YAML/Markdown files in `src/content/`. A build-time Node script (`scripts/build-data.js`) reads all content files, validates them, and outputs a single `public/data/archive.json` used at runtime by the SPA.

Collections are defined by directory structure: `src/content/[series]/[subcollection]/`. The build script groups records by `series` and `subcollection` fields from front matter and sorts by `sort_date` descending.

### Front matter convention

Every content file must include at minimum:

```yaml
---
id: EPH-2025-041
slug: moma-admission-ticket-2025-03-12
title: MoMA Admission Ticket
series: accumulation
subcollection: ephemera
item_type: ticket
status: published
display_date: "2025-03-12"
sort_date: 2025-03-12
---
```

The `series` and `subcollection` fields drive collection membership and template selection. `sort_date` should always be a parseable date for correct chronological sorting. See `docs/content-model.md` for full field definitions per item type.

### Constellation resolution

Constellation registry records live at `src/content/constellations/<slug>.md`
(front matter: `slug`, `title`, `status`, date or date range, optional `note`).
At build time, `build-data.js` collects every item's `constellations` array,
validates each slug against the registry, and attaches derived membership to
each constellation in `archive.json` (sorted by `sort_date`). An item slug that
resolves to no registry record is a **build warning, not a silent gap**; a
registry record with zero members is permitted (a constellation may be declared
before its items are entered).

---

## Directory Structure

```
src/
├─ index.html                        root HTML shell
├─ main.js                           Vite entry point, desk scene init
├─ views/
│  ├─ series.js                      category interior view
│  ├─ browse.js                      subcollection browse view
│  ├─ modal.js                       item inspection modal
│  └─ admin.js                       admin view entry
├─ containers/
│  ├─ ledger.js                      Consumption container
│  ├─ binder.js                      Labor container
│  ├─ sketchbook.js                  Creation container
│  ├─ flat-file.js                   Labor + Accumulation container
│  └─ dossier.js                     Identity container
├─ browse/
│  ├─ log-list.js                    log-style list (films, books, music, coffee, games)
│  ├─ contact-sheet.js               grid of scan thumbnails
│  ├─ labor-list.js                  labor items list
│  └─ doc-list.js                    document list
├─ content/
│  ├─ identity/
│  │  ├─ biography/
│  │  ├─ cv/
│  │  └─ contact/
│  ├─ labor/
│  │  └─ items/ (flat, no subcollections)
│  ├─ consumption/
│  │  ├─ films/
│  │  ├─ books/
│  │  ├─ music/
│  │  ├─ coffee/
│  │  └─ games/
│  ├─ creation/
│  │  ├─ sketches/
│  │  ├─ photos/
│  │  ├─ prototypes/
│  │  ├─ videos/
│  │  └─ notes/
│  ├─ accumulation/
│  │  ├─ ephemera/
│  │  └─ documents/
│  └─ constellations/                 registry records, one file per constellation
├─ assets/
│  ├─ images/
│  ├─ scans/
│  └─ models/
├─ styles/
public/
└─ data/
   └─ archive.json                   generated by scripts/build-data.js
scripts/
└─ build-data.js                     ingests content/, outputs archive.json
```

---

## Navigation Model

### Homepage
No navigation bar. A single "archive guide" text link in the corner. Objects are the navigation.

### All other pages
Breadcrumb trail indicating current position in the hierarchy:

```
← desk  /  consumption  /  films
```

Each crumb is a link. The archive guide link persists in the top corner.

Mobile: breadcrumb collapses to the immediate parent only (`← films`).

### Item inspection modal
No separate navigation. Prev/next arrows move within the current browse context. ✕ closes and returns to browse. URL param preserves position.
