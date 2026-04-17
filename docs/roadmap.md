# Roadmap

This roadmap assumes the archive must be maintainable over time, so ingest and admin tooling are treated as core infrastructure rather than optional polish.

## Phase 1: Documentation ✓
Goals:
- define concept ✓
- define IA ✓
- define content model ✓
- define ingest workflow ✓
- define rendering strategy ✓
- define guardrails ✓

Output:
- CLAUDE.md ✓
- docs ✓

## Phase 2: Text-first wireframes ✓
Goals:
- outline homepage ✓
- outline category interiors ✓
- outline browse systems ✓
- outline item inspection layout ✓
- validate hierarchy and user flow before visual polish ✓

Output:
- low-fidelity text wireframes ✓
- page-by-page structure ✓

## Phase 3: Design system
Goals:
- establish typography
- establish surface/material language
- establish color restraint
- establish metadata and label styling
- establish how tactile cues appear without harming clarity

Output:
- design tokens
- component rules
- visual references

## Phase 4: Content preparation
Goals:
- gather assets
- define file structure
- prepare first records
- test ingest workflow
- create a starter dataset across all five series

Output:
- initial archive records
- asset folders
- metadata files

## Phase 5: Admin interface / ingest tools
Goals:
- design and build a private or protected item-entry interface
- support quick log and full archival entry modes
- support drafts, partial records, and published records
- generate or validate IDs, slugs, metadata, and asset references
- ensure compatibility with the Vite + GitHub + Netlify workflow
- test the archive with real content entry before public-facing polish

Output:
- admin item-entry page
- content creation workflow
- validated ingest flow for multiple item types

## Phase 6: Homepage objects (in progress)
Goals:
- build sparse desk ✓ (HTML stub with five clickable series objects)
- define five primary objects
- make each object clearly represent its series
- prototype simple interaction states ✓ (click navigates to series layer)

Output:
- homepage object system
- first-pass desk interaction

## Phase 7: Browse systems (in progress)
Goals:
- build category interiors ✓ (series sheet with subcollection tabs)
- build subcollection views ✓ (browse sheet with year-grouped item list)
- build timelines, grids, folders, ledgers, contact sheets, or logs as needed
- implement filtering and orientation systems

Output:
- navigable archive structure

## Phase 8: Item inspection (in progress)
Goals:
- build focused inspection overlay or page ✓ (item sheet with modal, flip, related items)
- support metadata, notes, and related items ✓
- support front/back, zoom, and contextual media behaviors (flip ✓, zoom stub)

## Phase 9: Selective 3D enhancement
Goals:
- identify where 3D truly adds value
- test pseudo-3D first
- introduce actual 3D only where justified
- ensure fallback and performance

Output:
- selective 3D homepage or item enhancements

## Phase 10: Polish and growth
Goals:
- refine motion
- improve writing
- tune metadata display
- improve search and cross-linking
- continue adding records without losing consistency

Output:
- stable living archive