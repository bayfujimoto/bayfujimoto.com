# Admin Interface

## Purpose

This project should include a private or protected admin-facing interface for adding and managing archive items without manually editing repository files.

The admin interface exists to support a living archive. It should reduce friction for ongoing entry while preserving the same archival logic, metadata standards, and structural consistency used by the public site.

This interface is not part of the public-facing archive experience. It is a maintenance tool for creating, editing, drafting, and organizing records that Eleventy later turns into the public site.

## Goals

- make it easy to add new archive items
- support both quick logging and full archival entry
- preserve metadata consistency
- generate or validate IDs and slugs
- support asset upload and organization
- support drafts and incomplete records
- support relationships between records
- work with the 11ty + GitHub + Netlify workflow
- minimize the need to manually touch repository files for routine entry

## Non-goals

The admin interface should not:
- become a full custom CMS unless necessary
- allow arbitrary schema-breaking content entry
- prioritize visual flourish over speed and clarity
- expose the entire repository structure to the editor
- require technical knowledge for normal archive entry

## Core principle

The admin interface should reflect the archive’s structure:
- collection
- series
- subcollection
- item
- related item

It should make that hierarchy easy to use rather than hiding it entirely.

## Access and protection

The admin interface should be private or protected.

Possible access models:
- Netlify Identity or similar auth
- password-protected internal route
- GitHub-authenticated CMS
- private local-only tool during development

Likely URL patterns:
- `/admin/`
- `/studio/`
- `/archive-entry/`

Recommendation:
- keep the route separate from the public archive
- keep the visual style simpler than the main site
- prioritize speed, form clarity, and consistency over atmosphere

## Primary modes

The admin interface should have at least two entry modes.

### 1. Quick log mode
Use for:
- films watched
- books read
- coffee entries
- simple references
- fast recurring records

Requirements:
- minimal required fields
- optional asset upload
- fast save
- support for saving as draft or complete
- easy repeat entry

This mode should feel lightweight and repeatable.

### 2. Full archival entry mode
Use for:
- projects
- prototypes
- sketches worth preserving
- scans
- ephemera
- documents
- meaningful references
- records needing multiple assets or related items

Requirements:
- full metadata form
- relationship management
- multiple assets
- inspection mode options
- contextual notes
- draft / partial / published states

This mode should support richer archival treatment.

## Main workflows

### New item
1. Choose series.
2. Choose subcollection.
3. Choose item type.
4. Choose quick log or full entry mode.
5. Fill required metadata.
6. Add optional metadata.
7. Upload or reference assets.
8. Set status.
9. Link related items if available.
10. Save draft or publish.

### Edit item
1. Search or browse existing records.
2. Open record.
3. Edit metadata, assets, or relationships.
4. Save changes.
5. Preserve stable ID and slug unless explicitly changed.

### Promote item
A lightweight record should be promotable into a full archival record.

Example:
- a coffee log entry later becomes a richer entry with bag scans, tasting notes, and linked brew records
- a film log later becomes a full record with note, stills, and related influences
- an ephemera item later becomes a contextualized archival record

## Required interface sections

### Dashboard
Should show:
- recent drafts
- recent published items
- incomplete items needing metadata
- quick links to common entry types
- counts by series or status

### New item form
Must support:
- series selection
- subcollection selection
- item type selection
- record depth selection
- required metadata
- optional metadata
- assets
- relationships
- status

### Existing items
Must support:
- search by title / ID / slug
- filter by series
- filter by subcollection
- filter by type
- filter by status
- sort by date modified
- sort by date created

### Asset handling
Must support:
- upload
- preview
- assign asset roles
- front/back pairing
- thumbnail selection
- ordering for galleries or sequences

### Relationship editor
Must support:
- linking to existing records
- specifying relationship type
- viewing linked records
- preserving bidirectional clarity where useful

## Field behavior

The admin interface should use the schemas defined in `content-model.md`.

Behavior rules:
- series determines available subcollections
- item type determines visible fields
- record depth determines required complexity
- defaults should be smart and conservative
- date fields should support exact or approximate dates
- optional fields should stay hidden until needed
- validation should prevent malformed entries

## Suggested form structure

### Base fields for most items
- title
- series
- subcollection
- item type
- status
- display date
- sort date
- tags
- context note
- source
- related items

### Type-specific fields
Examples:

#### Film log
- title
- watch date
- year
- director
- source / format
- rating
- notes

#### Coffee
- roaster
- coffee name
- brew date
- origin
- process
- tasting notes
- brew method
- bag scan / bag photos

#### Project
- title
- date / date range
- role
- summary
- collaborators
- tools
- assets
- supporting documents
- related prototypes

#### Ephemera
- title
- subtype
- date
- place
- event
- front asset
- back asset
- dimensions
- note

## IDs and slugs

The interface should generate suggested IDs and slugs automatically.

Rules:
- IDs should follow the project naming scheme
- slugs should be human-readable and stable
- users may override with care
- collisions should be detected before save

Examples:
- FILM-2026-001
- COFFEE-2026-004
- PROJ-2025-002
- EPH-2024-017

The admin UI should not require users to manually understand file naming unless needed.

## Status model

Suggested statuses:
- draft
- partial
- complete
- published

Definitions:
- draft: rough entry, incomplete
- partial: identifiable but missing some metadata or assets
- complete: internally finished, ready for review
- published: visible on public site

The interface should make incomplete states normal and supported.

## Asset model

The admin interface should distinguish between:
- original source asset
- web asset
- thumbnail
- detail asset
- front/back asset
- gallery asset
- model asset
- PDF / document asset

It should support:
- file upload
- role assignment
- ordering
- captions
- alt text / descriptive note
- visibility / publication readiness

## Inspection settings

The interface should allow each item to declare inspection behavior.

Suggested options:
- none
- simple
- rich

Definitions:
- none: no inspection behavior beyond standard page view
- simple: zoom, enlarge, gallery, front/back
- rich: multi-state inspection, rotation, unfolding, or 3D

The interface should not assume all items need inspection.

## Search and browse support

Because the public archive relies on retrieval, the admin interface should encourage clean metadata entry for:
- dates
- type
- tags
- places
- event links
- people
- source
- related items

These fields should be treated as retrieval infrastructure, not optional decoration.

## Writing guidance inside the admin interface

Field labels and help text should support the archive’s tone:
- clear
- concise
- non-corporate
- non-startup
- not overly academic

Example:
- use “context note” instead of “marketing description”
- use “related items” instead of “recommendations”
- use “series” and “subcollection” where useful
- use “inspection behavior” instead of “interactive mode” if that is clearer

## Draft management

The admin interface should make it easy to:
- save incomplete records
- resume drafts
- identify records missing assets
- identify records missing dates
- identify orphaned items without relationships
- identify records needing review before publishing

This is especially important for a living archive where backlog is normal.

## Technical implementation options

Possible approaches:

### Decap CMS / Netlify CMS style
Pros:
- Git-backed
- works with static sites
- editorial UI exists already

Cons:
- may feel rigid
- may need customization for relationships and richer archive logic

### Custom GitHub-backed form
Pros:
- tailored to the archive schema
- better control over workflow
- can match project needs closely

Cons:
- more work
- needs auth and write flow

### Local-first internal tool
Pros:
- simple for early phase
- no public auth complexity
- fast to prototype

Cons:
- less convenient for remote use
- later migration may be needed

Recommendation:
- start with the simplest implementation that respects schema and asset flow
- do not overbuild a CMS too early
- but plan the schema so later tooling can be added cleanly

## Admin interface phases

### Phase 1
- define schemas
- define field groups
- define statuses
- define asset roles
- define relationship types

### Phase 2
- build simple item-entry form
- support quick log and full entry
- support draft saving
- support generated IDs and slugs

### Phase 3
- add editing and search
- add asset handling
- add relationship management

### Phase 4
- add publish flow
- add validation and review tools
- add batch import helpers for recurring logs

## Success criteria

The admin interface is successful if:
- adding a film, coffee, or ephemera item feels easy
- adding a project or prototype feels structured, not overwhelming
- the public archive remains consistent
- metadata quality stays high enough for search and browse
- drafts are normal and manageable
- archive growth does not require constant manual repo work