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

## Phase 2: Structural prototype ✓
Goals:
- build working layered navigation: desk → series → browse → item ✓
- validate hierarchy and user flow with real interactions ✓
- confirm single-scene model, URL/history model, and sheet stack pattern ✓

Output:
- working Vite SPA with layered modal architecture ✓
- desk with five series objects ✓
- series sheet, browse sheet, item inspection sheet ✓
- keyboard navigation, flip, related items ✓

## Phase 3: Content preparation ✓
Goals:
- gather assets ✓
- define file structure ✓

Output:
- initial archive records
- asset folders
- metadata files

## Phase 4: Admin interface / ingest tools
Goals:
- design and build a private or protected item-entry interface
- support quick log and full archival entry modes ✓
- support drafts, partial records, and published records ✓
- generate or validate IDs, slugs, metadata, and asset references 
- ensure compatibility with the Vite + GitHub + Netlify workflow ✓
- use the admin interface to create first records and validate the ingest workflow end-to-end ✓
- set up Letterboxd and Goodreads integrations ✓
- build starter dataset across all five series through the admin interface

Output:
- admin item-entry page
- content creation workflow
- validated ingest flow for multiple item types
- first real archive records created via the admin

## Phase 5: Design system ✓
Goals:
- establish typography ✓
- establish surface/material language ✓
- establish color restraint ✓
- establish metadata and label styling ✓
- establish how tactile cues appear without harming clarity ✓

Output:
- design tokens ✓
- component rules ✓
- visual references ✓
- overlay architecture (no containers, centered layout, text overlays) ✓
- horizontal browse strip ✓
- click-to-flip and scroll-to-zoom interaction ✓
- mobile design requirements ✓

## Phase 6: Homepage objects
Goals:
- build sparse desk ✓ (HTML stub with five clickable series objects)
- define five primary objects
- make each object clearly represent its series
- prototype simple interaction states ✓ (click navigates to series layer)

Output:
- homepage object system
- first-pass desk interaction

## Phase 7: Browse systems
Goals:
- build category interiors ✓ (series sheet with subcollection list)
- build subcollection views ✓ (horizontal browse strip with items)
- build timelines, grids, folders, ledgers, contact sheets, or logs as needed
- implement filtering and orientation systems

Output:
- navigable archive structure

## Phase 8: Item inspection
Goals:
- build focused inspection overlay ✓ (item sheet centered on screen)
- support metadata, notes, and related items ✓
- support front/back, zoom, and contextual media behaviors ✓ (flip and zoom implemented)

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