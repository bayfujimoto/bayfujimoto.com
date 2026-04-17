# Archive Ingest Workflow

## Goal
The archive must be easy to grow over time without becoming messy or inconsistent.

## Admin add-item interface

The project should include a private or protected admin page for adding archive items without manually editing repository files.

Goals:
- allow quick entry for fast-growing categories
- allow richer entry for full archival records
- reduce friction for ongoing maintenance
- keep metadata consistent with the archive schema
- generate stable IDs, slugs, and file locations automatically where possible

The add-item interface should support:
- selecting series and subcollection
- selecting item type
- choosing quick log vs full record
- uploading assets
- entering required metadata
- entering optional metadata
- linking related items
- saving as draft / partial / complete / published

The interface should write content in the same structure used by the repository, ideally generating Markdown/JSON content files and asset references that fit the existing 11ty content model.

Important:
- this interface is for archive maintenance, not public browsing
- it should follow the same schemas defined in `docs/content-model.md`
- it should preserve consistency rather than allow arbitrary fields
- it should be designed early, even if implemented later

## Record levels
There are two ingest levels:

### 1. Quick log
Use for:
- films watched
- books read
- coffee entries
- recurring references
- simple notes

This should be fast and lightweight.

### 2. Full archival entry
Use for:
- projects
- prototypes
- scans
- tickets
- brochures
- receipts
- sketches worth preserving
- items that need images, metadata, relationships, or inspection

## Ingest process

### Quick log workflow
1. Create new record.
2. Assign series and subcollection.
3. Fill minimum metadata.
4. Add thumbnail, image, or no asset if acceptable.
5. Save as draft or complete.

### Full archival entry workflow
1. Identify item type.
2. Create stable ID and slug.
3. Place source assets in correct folder.
4. Generate derivatives if needed, such as thumbnail or compressed web version.
5. Fill metadata.
6. Add contextual note.
7. Link related items.
8. Mark inspection eligibility.
9. Publish or keep as draft.

## Suggested naming conventions
IDs should be stable and readable.

Examples:
- FILM-2026-001
- COFFEE-2026-004
- PROJ-2025-002
- EPH-2024-017
- SKETCH-2026-013

Slug examples:
- in-the-mood-for-love-2026-watch
- sey-coffee-ethiopia-bensa
- thesis-archive-interface
- moma-ticket-2025-03-12

Asset naming:
- FILM-2026-001-poster.jpg
- COFFEE-2026-004-bag-front.jpg
- COFFEE-2026-004-bag-back.jpg
- EPH-2024-017-scan-front.tif
- EPH-2024-017-web-front.jpg
- PROJ-2025-002-cover.jpg

## Asset guidance

Assets are stored in Cloudflare R2, not committed to the repository. The bucket URL is set via the `VITE_R2_BASE_URL` environment variable.

**Bucket folder structure:**
- `originals/` — unprocessed source files (scans, photos, raw exports)
- `web/` — screen-optimized derivatives (typically JPEG/WebP at display resolution)
- `thumbnails/` — small crops or scaled-down previews for grid views
- `models/` — 3D assets (.glb, .gltf) where applicable

**Front matter asset fields** should use full R2 URLs:
```yaml
assets:
  front: https://pub-xxxx.r2.dev/web/EPH-2025-001-web-front.jpg
  back:  https://pub-xxxx.r2.dev/web/EPH-2025-001-web-back.jpg
```

During a transition period, paths starting with `/assets/` will be automatically expanded to full R2 URLs by `build-data.js` using the configured base URL — but full URLs are preferred for new records.

For scans and documents:
- capture front and back when relevant
- capture details when annotations or wear matter
- preserve page order
- note dimensions or scale when useful

## Drafts and incomplete records
The system should allow incomplete entries.
Use status values:
- draft
- partial
- complete
- published

Partial records are acceptable if:
- the item is identifiable
- the series and type are clear
- there is enough information to return later

## Promotion rule
A lightweight record can later become a full archival record.
This is important for:
- favorite films
- especially meaningful coffee entries
- books with strong notes
- ephemera linked to a larger story
- references that become central to a project

## Linked records
The archive should support links such as:
- coffee bag <-> brew log
- ticket <-> event
- brochure <-> museum visit
- project <-> prototype
- sketch <-> final work
- influence <-> project
- photo <-> place
- receipt <-> trip or date cluster

## Quality control checklist
Before publishing a full record:
- Is the item in the correct series and subcollection?
- Does it have a stable ID and slug?
- Does it have a date or approximate date?
- Does it have enough context to be understood later?
- Are assets named consistently?
- Are related items linked?
- Is inspection mode appropriate?
- Is the record understandable without relying only on visuals?

## Growth strategy
Likely fastest-growing categories:
- Consumption
- Accumulation
- Creation

Therefore:
- keep quick-entry options lightweight
- reserve rich metadata for meaningful items
- support batch import later
- allow backlog processing
- do not require perfection for every entry

## Batch import candidates
Good future batch-import targets:
- film logs
- reading logs
- coffee logs
- photo metadata
- recurring references

Batch imports should still map to the archive schema and generate stable IDs.