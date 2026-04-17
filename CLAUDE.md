# CLAUDE.md

## Project
This project is a personal archive website, not a conventional portfolio. It should function like a living collection of records, artifacts, documents, images, and media traces that describe a life through material evidence rather than through a simplified personal brand narrative.

The site should feel closer to a finding aid, a desk left open, or an archival access system than to a standard portfolio homepage.

## Thesis
The core thesis is that personal history can be represented through material traces. Receipts, coffee bags, movie tickets, brochures, business cards, project artifacts, scans, sketches, notes, contact sheets, and other residues can carry biography, memory, labor, taste, and time more vividly than abstract navigation labels such as “About” or “Projects.”

The site should preserve the evidentiary quality of these traces. It should foreground wear, texture, sequencing, dates, annotations, storage formats, and the physical logic of containers. At the same time, it must remain legible and navigable. Material metaphor cannot replace information architecture.

## Tone
The tone should be:
- artistic
- archival
- restrained
- intimate
- specific
- materially attentive
- careful with context
- emotionally resonant through specificity, not decoration

The site should not become:
- a generic portfolio
- a startup landing page
- a novelty skeuomorphic demo
- a game
- a horror site
- an overly nostalgic fake-vintage exercise
- a cluttered scrapbook with weak navigation

## Core principles
- Think archivally: preserve hierarchy between collection, series, subcollections, files, and items.
- Think materially: preserve texture, wear, sequence, and the physical logic of documents and objects.
- Think legibly: use text, metadata, labels, filtering, and structure to keep the archive understandable.
- Think progressively: reveal complexity step by step, never all at once.
- The desk is a framing device, not the whole site.
- Do not flatten all content into a single layer of clickable objects.
- Do not overuse 3D or physical simulation where simple browsing systems are better.
- Deeper levels should hybridize tactile visual language with straightforward archival navigation.
- Prefer scalable systems over one-off effects.
- Prefer clarity over spectacle.

## Primary interaction model
The experience has four layers:

1. Desk
- The homepage is a sparse desk with five top-level objects.
- Each object represents a major archival series.
- The user should understand, at a glance, that they are choosing one of five life domains.

2. Category interior
- Opening an object reveals the category interior.
- This should retain some tactile or material feeling: tabs, dividers, pages, trays, ledgers, folders, binders.
- It should function primarily as a clear collection landing page.

3. Record system
- This is the actual browse layer for a subcollection.
- It may use timelines, calendars, grids, card catalogs, contact sheets, folders, or lists depending on the material.
- At this level, browseability, filtering, and clarity matter more than theatrical object simulation.

4. Item inspection
- Opening an item should create a focused inspection state inspired by Resident Evil item inspection.
- The item becomes isolated, enlarged, examinable, and possibly rotatable, flippable, unfoldable, or zoomable.
- This should feel ritualized and attentive, not horror-themed.
- Not every item needs full 3D, but inspection should feel intentional and material.

## Top-level series
There are five top-level categories:

### Identity
Materials related to self-description and orientation:
- biography
- CV / resume
- contact information
- sitemap / archive guide
- method / intent statements if useful

Object metaphor:
- business card
- ID card
- dossier packet
- small document packet

### Work
Portfolio projects and work samples:
- professional work
- school work
- selected case studies
- process material
- mockups
- scans
- supporting documents
- records of labor and iteration

Object metaphor:
- binder
- folio
- project case

### Consumption
Records of intake, ritual, taste, and repeated attention:
- movie log / films watched
- books read
- coffee brewed
- favorite media and influences
- recurring references
- possibly music, exhibitions, articles, or places later

Object metaphor:
- ledger
- planner
- logbook
- record book

### Creation
Things made outside the narrower portfolio frame:
- prototypes
- sketches
- photos
- videos
- experiments
- fabrication
- works in progress
- authored outputs

Object metaphor:
- prototype tray
- sketchbook
- workshop folder
- parts container
- toy/trinkets box

### Accumulation
Ephemera and scanned documents:
- museum brochures
- movie tickets
- receipts
- handouts
- printed matter
- notes
- scanned documents
- miscellaneous paper residue
- place- and event-based traces

Object metaphor:
- archive drawer
- file box
- flat file
- stack of envelopes

## 3D and inspection goals
The end goal includes selective 3D or pseudo-3D interaction:
- 3D or pseudo-3D homepage objects representing the top-level series
- item inspection states influenced by Resident Evil object viewing
- careful rendering of some documents and artifacts as inspectable objects
- but strong textual and archival systems underneath

Rules:
- 3D is selective, not universal.
- 3D is strongest on homepage objects and certain item inspection views.
- Record-system browsing layers should generally stay 2D and information-forward.
- Scans, photos, and flat documents often do not need full 3D.
- Use the simplest rendering strategy that preserves the intended feeling.
- Validate non-3D inspection patterns before committing to a final 3D stack.

## Content modeling rules
Every item should have enough metadata to be findable, understandable, and linkable.

Minimum metadata philosophy:
- every item needs an ID
- every item needs a title or generated display label
- every item needs a type
- every item belongs to a series
- every item should have a date or approximate date when possible
- every item should have source/context notes when useful
- every item should support relationships to other items later

Different item types can have lightweight records or full records.
Lightweight logs are acceptable for fast-growing categories.
Full records are for items that merit inspection, contextualization, or richer metadata.

## Ingest philosophy
This archive must grow over time.
The system should support:
- lightweight entry for recurring logs
- richer entry for significant artifacts
- draft / incomplete records
- batch imports later where possible
- stable naming conventions
- stable IDs / slugs
- relationships between records

The archive should remain maintainable even when content volume grows.

## Admin interface
This project should include a private or protected admin-facing add-item interface so archive records can be created and managed without manually editing repository files.

The admin interface should:
- support quick log and full archival entry modes
- support drafts, partial records, complete records, and published records
- generate or validate IDs and slugs
- support asset upload / asset assignment
- support linked and related items
- enforce the schemas defined in the content model
- fit the Eleventy + GitHub + Netlify workflow

The admin interface is a maintenance tool, not a public-facing archive page.

## Search and browse
The site should eventually support:
- browsing by category
- browsing by subcollection
- filtering by type
- browsing by date
- browsing by place / source / event where useful
- tags and cross-links
- related items in item inspection
- a clear archive guide / sitemap

Search should be added when content depth justifies it. Until then, browse systems and the archive guide should do most of the orientation work.

## Writing voice
Writing should avoid startup language and generic portfolio copy.
Prefer:
- labels
- metadata
- captions
- short contextual notes
- concise reflective writing where useful
- finding-aid language where appropriate, but never unreadable or academic for its own sake

## Accessibility and legibility
- Navigation must remain clear even when tactile metaphors are present.
- Metadata must be readable and structured.
- Keyboard access must work.
- Reduced motion should be respected.
- 3D interactions need graceful fallback.
- Mobile behavior must remain usable and uncluttered.
- Tactile atmosphere must not obscure navigation.
- No important information should depend on 3D alone.

## Platform structure
The likely base platform is:
- Eleventy (11ty) for static site generation
- GitHub as source of truth for code, content, docs, and configuration
- Netlify for build and deploy

Implementation expectations:
- public site content and templates live in the Eleventy input directory
- docs live in `docs/`
- build output is a generated artifact, not hand-edited content
- Netlify configuration and project structure should stay versioned in the repository
- content should remain legible and portable as text-based records where possible

## Core docs to consult
Before making major decisions, consult these files selectively:

- `docs/site-concept.md`
- `docs/information-architecture.md`
- `docs/content-model.md`
- `docs/archive-ingest-workflow.md`
- `docs/rendering-strategy.md`
- `docs/platform-structure.md`
- `docs/admin-interface.md`
- `docs/roadmap.md`
- `docs/decisions.md`

Use `docs/decisions.md` to track:
- confirmed decisions
- provisional defaults
- open questions
- deferred choices

When a meaningful project decision is made, update `docs/decisions.md`.

## Build order
1. Documentation and content model
2. Text-first sitemap and wireframes
3. Design system and visual language
4. Content preparation
5. Admin interface / ingest tools
6. Homepage object system
7. Category browse systems
8. Item inspection system
9. Selective 3D enhancement
10. Polish and long-term growth

## Instruction for future work
When working on this project:
- consult docs selectively
- preserve hierarchy and clarity
- choose the simplest interaction that achieves the intended archival feeling
- do not jump straight to polished 3D implementation
- prioritize long-term coherence over flashy demos
- design with real archive growth in mind
- treat the admin workflow as core infrastructure, not an afterthought
- update `docs/decisions.md` when assumptions become decisions