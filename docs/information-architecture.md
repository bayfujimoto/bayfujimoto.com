# Information Architecture

This is the canonical reference for the archive's structure, hierarchy, URL scheme, interaction layers, template mapping, and 11ty collection definitions.

---

## Hierarchy

The archive is organized as a four-level hierarchy:

```
Collection
└─ Series
   └─ Subcollection
      └─ Item
```

- **Collection** — the archive as a whole. There is one collection: bayfujimoto.com.
- **Series** — the five top-level domains of the archive. Each is represented as a physical object on the desk.
- **Subcollection** — a group of related records within a series. Represented as pages, tabs, or sections within the series' physical container.
- **Item** — an individual archive record. Has metadata, assets, status, and optional inspection behavior.

---

## The Five Series

### Identity
Self-description and orientation materials.

Object metaphor: business card / ID card / dossier packet

Subcollections:
- `biography` — short and long-form profile text
- `cv` — CV / resume entries
- `contact` — contact channels and availability
- `guide` — archive guide and sitemap

### Work
Portfolio projects and work samples.

Object metaphor: binder / folio / project case

Subcollections:
- `projects` — professional and school work, case studies
- `artifacts` — process material, mockups, scans, supporting documents

### Consumption
Records of intake, ritual, taste, and repeated attention.

Object metaphor: ledger / logbook / record book

Subcollections:
- `films` — films watched
- `books` — books read
- `coffee` — coffee brewed
- `influences` — favorite media, recurring references, influences

### Creation
Things made outside the narrower portfolio frame.

Object metaphor: sketchbook / prototype tray / workshop folder / parts container

Subcollections:
- `sketches` — drawings and sketchbook pages
- `photos` — photographs, contact sheets
- `prototypes` — physical and digital prototypes
- `videos` — video work and experiments

### Accumulation
Ephemera and scanned documents.

Object metaphor: archive drawer / flat file / stack of envelopes

Subcollections:
- `ephemera` — tickets, receipts, brochures, handouts, printed matter
- `documents` — scanned documents, notes, handouts

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
/guide/                        archive guide and sitemap

/identity/                     identity category interior
/identity/biography/           biography
/identity/cv/                  CV / resume
/identity/contact/             contact

/work/                         work category interior
/work/projects/                projects browse
/work/projects/[slug]/         individual project (item inspection via modal)
/work/artifacts/               artifacts browse

/consumption/                  consumption category interior
/consumption/films/            film log browse
/consumption/books/            books browse
/consumption/coffee/           coffee log browse
/consumption/influences/       influences browse

/creation/                     creation category interior
/creation/sketches/            sketches browse
/creation/photos/              photos and contact sheets browse
/creation/prototypes/          prototypes browse
/creation/videos/              videos browse

/accumulation/                 accumulation category interior
/accumulation/ephemera/        ephemera browse
/accumulation/documents/       scanned documents browse
```

### Item inspection deep-links

Item inspection uses URL query params to open a modal from a browse page:

```
/accumulation/ephemera/?item=EPH-2025-041
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

Define one collection per series and one per subcollection. Use directory-based tagging via `src/content/[series]/[subcollection]/` paths.

### `.eleventy.js` collection definitions

```js
// Series-level collections
eleventyConfig.addCollection("identity", (api) =>
  api.getFilteredByGlob("src/content/identity/**/*.md")
);
eleventyConfig.addCollection("work", (api) =>
  api.getFilteredByGlob("src/content/work/**/*.md")
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
eleventyConfig.addCollection("coffee", (api) =>
  api.getFilteredByGlob("src/content/consumption/coffee/*.md")
     .sort((a, b) => b.data.sort_date - a.data.sort_date)
);
eleventyConfig.addCollection("projects", (api) =>
  api.getFilteredByGlob("src/content/work/projects/*.md")
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
├─ guide.njk                         archive guide
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
│     │  ├─ binder.njk               Work container
│     │  ├─ sketchbook.njk           Creation container
│     │  ├─ flat-file.njk            Accumulation container
│     │  └─ dossier.njk              Identity container
│     ├─ browse/
│     │  ├─ log-list.njk             log-style list (films, books, coffee)
│     │  ├─ contact-sheet.njk        grid of scan thumbnails
│     │  ├─ project-grid.njk         project cards
│     │  └─ doc-list.njk             document list
│     └─ inspection/
│        └─ modal.njk                inspection modal shell
├─ content/
│  ├─ identity/
│  │  ├─ biography/
│  │  ├─ cv/
│  │  └─ contact/
│  ├─ work/
│  │  ├─ projects/
│  │  └─ artifacts/
│  ├─ consumption/
│  │  ├─ films/
│  │  ├─ books/
│  │  ├─ coffee/
│  │  └─ influences/
│  ├─ creation/
│  │  ├─ sketches/
│  │  ├─ photos/
│  │  ├─ prototypes/
│  │  └─ videos/
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
