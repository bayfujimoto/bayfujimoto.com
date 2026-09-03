# Content Model

> The fields a record stores. What the **catalog card displays** — the per-type
> field selection, ordering, labels, and example placeholders — is governed by
> `docs/field-schema.md` and encoded in `src/shared/field-schema.js`. This file
> describes the underlying data; that one describes the card.

## Shared fields
These fields should exist in most or all records.

Required:
- id
- slug
- title
- series
- subcollection
- item_type
- status
- display_date

Recommended:
- sort_date
- created_date
- approximate_date
- description
- context_note
- tags
- constellations
- people
- places
- source
- extent
- dimensions
- related_ids
- assets
- visibility

### `constellations`
An optional **array** of constellation slugs (e.g. `constellations: [2026-atx-sf]`).
Available on every record type except Identity. Each slug must resolve to a
constellation registry record (below); `build-data.js` warns on unresolved slugs.
An item may belong to any number of constellations; membership never moves or
duplicates the item out of its series. Distinct from `tags`, which are occasion
descriptors (venue, companions, format, subject) — properties of an item, not
contexts it belongs to. See decisions.md → "Constellations: cross-series grouping".

Possible status values:
- draft
- partial
- complete
- published

## Record depth
Two main record depths:

### Lightweight record
Use for:
- recurring logs
- fast entry
- items that do not need full interpretation yet

Fields:
- id
- title
- item_type
- series
- subcollection
- display_date
- minimal notes
- one primary asset or external reference if needed

### Full record
Use for:
- inspectable artifacts
- projects
- richer contextual entries
- items with multiple assets or relationships

Fields:
- all shared fields
- metadata block
- multiple assets
- related items
- richer contextual note
- inspection behavior info

## Level of description (item vs. file)

Records are item-level by default. A grouped record — a photo series, a multi-page
document, a contact sheet — is **file-level**: it carries an `extent` greater than
one ("12 photographs"), and its members are item-level records linked back with
`part_of`. On the card, `extent > 1` is the quiet signal that you are looking at a
collection rather than a single object; the calibrated plate never stretches across
several objects (that breaks the scale logic). See `docs/field-schema.md`.

## Identity records

### Biography / profile
Fields:
- title
- short description
- longer text
- roles
- location
- links

### CV entry
Fields:
- title
- organization
- role
- date range
- category
- note

### Contact record
Fields:
- title
- channel
- value
- availability note

### Archive guide entry
Fields:
- title
- purpose
- section links
- explanatory note

## Labor records

### Labor item (project, work sample, artifact)
All labor items share a flat model with metadata-based filtering by `context` (academic, professional, personal).

Required:
- title
- slug
- item_type (project, artifact, work-sample)
- context (academic, professional, personal)
- date or date range
- short summary
- role
- status
- assets

Recommended:
- collaborators
- tools
- deliverables
- process notes
- supporting documents
- related items
- links
- inspection eligibility

Note: Labor has no subcollections. Use `context` metadata field for filtering instead of structural subcollections. See decisions.md for rationale.

## Consumption records

### Film log entry
Required:
- title
- watch_date
- year
- director if known
- seen_via (where it was seen: theatrical, streaming, physical, festival)

Optional:
- rating
- location
- rewatch flag
- notes
- tags
- poster / still
- related influences

### Book entry
Required:
- title
- author
- date read or period
- status

Optional:
- edition
- notes
- tags
- related themes
- cover image

### Coffee entry
Required:
- roaster
- coffee_name
- brew_date or date range
- origin if known
- process if known

Optional:
- varietal
- tasting notes
- brew method
- grinder / ratio / dose
- packaging scan
- bag photos
- rating
- repurchase flag
- related brew logs

### Music entry
Required:
- title
- artist
- date listened or period
- format if useful (album, single, ep, live, mix)

Optional:
- album name
- notes
- tags
- source
- year released

### Games entry
Required:
- title
- date played
- platform
- status (completed, in-progress, abandoned)

Optional:
- developer
- genre
- playtime
- notes
- tags

## Creation records

Creator defaults to the archive subject; record a `creator` only when the work is
not solely yours (a collaborator, a commission). The card suppresses the creator
row otherwise. See `docs/field-schema.md`.

### Prototype
Required:
- title
- date
- medium
- short note
- asset

Optional:
- dimensions
- material
- related project
- versions
- process notes
- inspection eligibility
- 3D model

### Sketch
Required:
- title
- date
- asset

Optional:
- sketchbook source
- medium
- note
- related project

### Photo
A photo record almost always holds several photos; the record's
reproduction is an ordered gallery list (file + thumbnail + caption + alt per
photo), edited in the admin with the same ordered-image widget labor uses.
Reproductions are always displayed whole, with padding — never cropped
(decisions.md → "Photo entries — display treatment").

Required:
- title
- date
- gallery (1+ photos; a single photo is a one-item list)

Optional:
- place
- camera
- series (photo_series)
- per-photo captions
- notes
- extent (defaults to the photo count, e.g. "6 photos", when not recorded)

### Video
Required:
- title
- date
- video asset or embed
- short description

Optional:
- duration
- still frames
- related project
- notes

### Notes
Required:
- title
- date
- content or asset

Optional:
- note_type (sketch, written note, idea, draft)
- related project
- tags
- related items

## Accumulation records

### Ephemera item
Required:
- title
- item subtype
- date or approximate date
- asset scan/photo
- source context

Optional:
- place
- constellations (replaces the former `event` field — see shared fields above)
- extent: count of physical pieces (e.g. "1 ticket", "3 prints")
- dimensions: physical size in mm as "W x H" (e.g. "89 x 54"). Used to render thumbnails at true relative size in the browse strip. Items without this field fall back to natural image aspect ratio.
- front/back assets (closed recto / verso)
- dimensions_open: unfolded size in mm as "W x H" for folded matter (brochures, fold-out guides, folded maps) — a second measurement, never derived from the closed size
- inside/outside assets: the open state's two faces; either one makes the record folded on the card. The record thumbnail stays the closed recto. The fold family, if worth recording, goes in `extent` ("1 brochure, tri-fold"). See `docs/brochure-fold-states-plan.md`.
- note
- related items
- inspection eligibility

### Ticket / receipt / brochure / scanned document
Use the ephemera item model with subtype-specific metadata as needed. All Accumulation record types share one model; `item_type` carries the subtype distinction.

## Constellation records

A constellation is a lateral grouping across series — a trip, an event, a
preoccupation — defined once as a registry record at
`src/content/constellations/<slug>.md`. Items reference it via their
`constellations` array; the registry record never lists members itself
(membership is derived at build time). Phase 1 membership is exhaustive and
chronological; authored ordering and per-item captions are deferred to the
meta-object phase (see `docs/cross-series-lists.md`).

Required:
- slug (year-first kebab-case when dated: `2026-atx-sf`; thematic constellations omit the year)
- title
- status

Recommended:
- display_date or date range (date_start / date_end)
- note (a short reflective paragraph — the constellation's voice)

## Asset types
Supported asset types:
- thumbnail
- scan
- front image
- back image
- detail image
- gallery image
- contact sheet
- video
- audio
- PDF
- 3D model
- poster frame

## Inspection eligibility
Each record should declare one of:
- none
- simple
- rich

Definitions:
- none: standard view only
- simple: zoom, enlarge, gallery, flip, or pan
- rich: includes 3D, unfolding, rotation, layered inspection, or multi-state view

## Relationship types
Suggested relationships:
- part_of
- related_to
- made_for
- watched_with
- linked_place
- source_for
- derived_from
- companion_to
- version_of

## Sorting and filtering fields
Common filters:
- date
- type
- subcollection
- place
- constellation
- people
- tags
- status
- media type

## Minimum viable metadata guidance
Use the smallest schema that still preserves meaning.
Fast-growing logs should not require full archival treatment immediately.
Important objects should be promotable from lightweight record to full record later.