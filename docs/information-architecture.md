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

---

## The Six Top-Level Objects

### Guide (Meta Item)
Archive metadata and site information. Visually distinct from the five series.

Object metaphor: notebook / metadata sheet / label

Contents:
- finding aid / sitemap
- site philosophy
- archive metadata

Note: Rendered differently on the desk to signal it's self-referential (describing the archive) rather than archival content (describing the person).

### The Five Series

### Identity
Self-description and orientation materials.

Object metaphor: business card / ID card / dossier packet

Subcollections:
- `biography` — short and long-form profile text
- `cv` — CV / resume entries
- `contact` — contact channels and availability

### Labor
Work, projects, and professional effort. Renamed from "Work" to emphasize process and effort.

Object metaphor: binder / folio / project case

No subcollections. Browse is flat with metadata-based filtering. Like Accumulation, uses view-based URL segments and metadata context field (`academic`, `professional`, `personal`).

### Consumption
Records of intake, ritual, taste, and repeated attention.

Object metaphor: ledger / logbook / record book

Subcollections:
- `films` — films watched
- `books` — books read
- `music` — music listened to
- `coffee` — coffee brewed
- `games` — games played

Note: `influences` removed as a subcollection; implemented as a metadata filter on consumption browse.

### Creation
Things made outside the narrower portfolio frame.

Object metaphor: sketchbook / prototype tray / workshop folder / parts container

Subcollections:
- `sketches` — drawings and sketchbook pages
- `photos` — photographs, contact sheets
- `prototypes` — physical and digital prototypes
- `videos` — video work and experiments
- `notes` — notes, sketches, and written ideas

Note: `projects` is not used in Creation (use `labor` for project-framed work).

### Accumulation
Collected physical ephemera: tickets, receipts, brochures, handouts, printed matter.

Object metaphor: archive drawer / flat file / stack of envelopes

Browse: flat list, no subcollection tabs. Intended grouping options (year, event, place, type) deferred to Phase 7.

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
/guide/                        archive guide, sitemap, site philosophy

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
/accumulation/sxsw-2026/      ephemera browse, filtered by event (filter logic Phase 7)
```

Notes:
- Labor and Accumulation both use view-based second segments rather than subcollection keys. See decisions.md for rationale.
- Labor context filters (`academic`, `professional`, `personal`) are metadata-based, not structural subcollections.

### Item inspection deep-links

Item inspection uses URL query params to open a modal from a browse page:

```
/accumulation/all/?item=EPH-2025-041
/accumulation/sxsw-2026/?item=EPH-2025-041
/work/projects/?item=PROJ-2025-002
/consumption/films/?item=FILM-2026-001
```

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
│  └─ accumulation/
│     ├─ ephemera/
│     └─ documents/
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
