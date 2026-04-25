# Content Model

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
- people
- places
- source
- related_ids
- assets
- visibility

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
- format or source if useful

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
Required:
- title
- date
- image asset

Optional:
- location
- camera
- series
- subjects
- notes
- contact sheet membership

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
- event
- dimensions: physical size in mm as "W x H" (e.g. "89 x 54"). Used to render thumbnails at true relative size in the browse strip. Items without this field fall back to natural image aspect ratio.
- front/back assets
- note
- related items
- inspection eligibility

### Ticket / receipt / brochure / scanned document
Use the ephemera item model with subtype-specific metadata as needed. All Accumulation record types share one model; `item_type` carries the subtype distinction.

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
- linked_event
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
- event
- people
- tags
- status
- media type

## Minimum viable metadata guidance
Use the smallest schema that still preserves meaning.
Fast-growing logs should not require full archival treatment immediately.
Important objects should be promotable from lightweight record to full record later.