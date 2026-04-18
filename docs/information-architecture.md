# Information Architecture

This is the canonical reference for the archive's structure, hierarchy, URL scheme, interaction layers, template mapping, and 11ty collection definitions.

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

## Template Mapping

```
Layer         Template                    Notes
──────────    ──────────────────────────  ─────────────────────────────────────
Homepage      src/index.njk              desk scene, five objects
Series        src/_includes/layouts/      one layout, series-specific includes
              series.njk                  for each container metaphor
Browse        src/_includes/layouts/      shared browse shell; per-subcollection
              browse.njk                  view partials (grid, list, log, etc.)
Inspection    rendered into browse page   modal JS reads front matter data
              via JS modal                and builds inspection panel at runtime
Admin         src/admin/index.njk         protected; not part of 11ty public build
Base shell    src/_includes/layouts/      root HTML, nav, footer
              base.njk
```

Series interior template notes:
- Each series page uses `series.njk` as its layout
- A `container` front matter field selects the physical metaphor partial
- Partial options: `ledger.njk`, `binder.njk`, `sketchbook.njk`, `tray.njk`, `flat-file.njk`, `dossier.njk`

---

## 11ty Collections

Define one collection per series and one per subcollection (where applicable). Use directory-based tagging via `src/content/[series]/[subcollection]/` paths for subcollected series, or `src/content/[series]/` for flat series.

### `.eleventy.js` collection definitions

```js
// Series-level collections
eleventyConfig.addCollection("identity", (api) =>
  api.getFilteredByGlob("src/content/identity/**/*.md")
);
eleventyConfig.addCollection("labor", (api) =>
  api.getFilteredByGlob("src/content/labor/**/*.md")
);
eleventyConfig.addCollection("consumption", (api) =>
  api.getFilteredByGlob("src/content/consumption/**/*.md")
);
eleventyConfig.addCollection("creation", (api) =>
  api.getFilteredByGlob("src/content/creation/**/*.md")
);
eleventyConfig.addCollection("accumulation", (api) =>
  api.getFilteredByGlob("src/content/accumulation/**/*.md")
);

// Subcollection-level collections
eleventyConfig.addCollection("films", (api) =>
  api.getFilteredByGlob("src/content/consumption/films/*.md")
     .sort((a, b) => b.data.sort_date - a.data.sort_date)
);
eleventyConfig.addCollection("books", (api) =>
  api.getFilteredByGlob("src/content/consumption/books/*.md")
     .sort((a, b) => b.data.sort_date - a.data.sort_date)
);
eleventyConfig.addCollection("music", (api) =>
  api.getFilteredByGlob("src/content/consumption/music/*.md")
     .sort((a, b) => b.data.sort_date - a.data.sort_date)
);
eleventyConfig.addCollection("coffee", (api) =>
  api.getFilteredByGlob("src/content/consumption/coffee/*.md")
     .sort((a, b) => b.data.sort_date - a.data.sort_date)
);
eleventyConfig.addCollection("games", (api) =>
  api.getFilteredByGlob("src/content/consumption/games/*.md")
     .sort((a, b) => b.data.sort_date - a.data.sort_date)
);
eleventyConfig.addCollection("ephemera", (api) =>
  api.getFilteredByGlob("src/content/accumulation/ephemera/*.md")
     .sort((a, b) => b.data.sort_date - a.data.sort_date)
);
eleventyConfig.addCollection("sketches", (api) =>
  api.getFilteredByGlob("src/content/creation/sketches/*.md")
     .sort((a, b) => b.data.sort_date - a.data.sort_date)
);
eleventyConfig.addCollection("photos", (api) =>
  api.getFilteredByGlob("src/content/creation/photos/*.md")
     .sort((a, b) => b.data.sort_date - a.data.sort_date)
);
eleventyConfig.addCollection("prototypes", (api) =>
  api.getFilteredByGlob("src/content/creation/prototypes/*.md")
     .sort((a, b) => b.data.sort_date - a.data.sort_date)
);
eleventyConfig.addCollection("videos", (api) =>
  api.getFilteredByGlob("src/content/creation/videos/*.md")
     .sort((a, b) => b.data.sort_date - a.data.sort_date)
);
eleventyConfig.addCollection("notes", (api) =>
  api.getFilteredByGlob("src/content/creation/notes/*.md")
     .sort((a, b) => b.data.sort_date - a.data.sort_date)
);
```

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
├─ index.njk                         homepage / desk
├─ guide.njk                         archive guide, site philosophy, sitemap
├─ _data/                            global data
├─ _includes/
│  ├─ layouts/
│  │  ├─ base.njk                    root HTML shell
│  │  ├─ series.njk                  category interior layout
│  │  ├─ browse.njk                  subcollection browse layout
│  │  └─ item.njk                    item data layout (feeds modal)
│  └─ partials/
│     ├─ nav.njk
│     ├─ footer.njk
│     ├─ containers/
│     │  ├─ ledger.njk               Consumption container
│     │  ├─ binder.njk               Labor container
│     │  ├─ sketchbook.njk           Creation container
│     │  ├─ flat-file.njk            Labor + Accumulation container
│     │  └─ dossier.njk              Identity container
│     ├─ browse/
│     │  ├─ log-list.njk             log-style list (films, books, music, coffee, games)
│     │  ├─ contact-sheet.njk        grid of scan thumbnails
│     │  ├─ labor-list.njk           labor items list
│     │  └─ doc-list.njk             document list
│     └─ inspection/
│        └─ modal.njk                inspection modal shell
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
└─ scripts/
   └─ inspection-modal.js            opens modal, reads ?item= param, deep-links
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
