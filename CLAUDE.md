# CLAUDE.md

## Project
This project is a personal archive website, not a conventional portfolio. It should function like a living collection of records, artifacts, documents, images, and media traces that describe a life through material evidence rather than through a simplified personal brand narrative.

The site should feel closer to a finding aid, a desk left open, or an archival access system than to a standard portfolio homepage.

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

## Mobile design requirements
These requirements apply to every phase going forward. The mobile site must keep pace with the desktop version — mobile is not a deferred concern.

- **Meta hidden on mobile:** On screens narrower than 600px, the `.layer-meta` (bottom-right) is hidden (`display: none`); the `.layer-breadcrumb` (bottom-left) carries location context alone. This avoids stacking two overlays in the same region rather than repositioning the meta layer.
- **Touch scrolling:** The horizontal browse strip (`.browse-strip`) must be touch-scrollable with `-webkit-overflow-scrolling: touch` and `scroll-snap-type: x proximity`.
- **No hover dependencies:** All interactions must be reachable by tap. Never rely on hover-only affordances to reveal navigation or content.
- **Pinch-to-zoom:** Item images must support pinch-to-zoom via Pointer Events API (implemented in `panels.js` `makeItemSheet`).
- **Minimum font size:** All overlay text must remain readable at 375px. Use `--overlay-padding: 1rem` at mobile breakpoint. Never set text below `0.65rem` on mobile.
- **iOS input zoom prevention:** Admin form inputs must have `font-size: 16px` minimum to prevent iOS from zooming on focus. Apply in `src/admin/styles.css`.
- **Touch targets:** All interactive overlay elements (breadcrumb segments, subnav buttons, prev/next arrows, browse strip buttons, admin mobile tabstrip) must have a minimum touch target of 44×44px. Use `min-height: 44px` with `display: inline-flex; align-items: center`.
- **Desk on mobile:** The desk grid collapses to 2 columns at ≤600px. Labels remain legible.
- **Item image on mobile:** `max-height: 60vh; max-width: 90vw` at ≤600px so the image doesn't fill the entire screen and leave no room for overlays.
- **Admin on mobile:** At ≤700px the admin's three-pane shell collapses to a single visible pane controlled by a bottom tabstrip (`[e] [r] [l]`). Vim modality strictly disables — keyboard shortcuts, mode chip, and keymap legend all hide. Tap and native form focus carry the entire mobile interaction model. See `docs/admin-interface.md`.

## Platform structure
The site is built with:
- **Vite** for bundling and dev server
- **Three.js** for the WebGL canvas base layer
- **Custom Node data script** (`scripts/build-data.js`) for content ingestion from YAML records
- **GitHub** as source of truth for code, content, and configuration
- **Netlify** for build and deploy

Content lives in `docs/` and the data source directory. Build output is a generated artifact. See `docs/decisions.md` for confirmed architecture decisions (single-scene SPA, persistent canvas, item inspection as modal overlay).

## Core docs to consult
Before making major decisions, consult these files selectively:

- `docs/decisions.md` — confirmed decisions, open questions, deferred work
- `docs/site-concept.md` — thesis, tone, core principles
- `docs/information-architecture.md` — interaction model, series, navigation, browse
- `docs/content-model.md` — metadata schema and record types
- `docs/archive-ingest-workflow.md` — ingest workflows and naming conventions
- `docs/rendering-strategy.md` — rendering hierarchy and inspection behaviors
- `docs/admin-interface.md` — admin interface spec and as-built reference
- `docs/admin-tui-overhaul.md` — change history of the admin TUI overhaul (phase plan, palette, animation language)
- `docs/roadmap.md` — phased build plan with current status

Research and essays (foundation, not prescriptive):
- `docs/research-and-essays/research-archiving.md` — archival theory background
- `docs/research-and-essays/archiving-and-the-site.md` — design philosophy and AI provenance

## Commit conventions
Each commit to this repository is a record of a human-AI work session. Write commit messages to be legible as a process document when read in sequence through `git log`.

Every commit message should follow this structure:

```
[short subject line describing what was produced or changed]

Directed by: [what the human asked for, decided, or specified]
Produced by: AI (Claude)
Human decisions: [any notable choices, overrides, or departures from what AI proposed]
```

The subject line should describe the output. The body should describe the collaboration that produced it. If the human made a meaningful decision — accepted a proposal, rejected an alternative, specified a constraint that shaped the result — it belongs in `Human decisions`. If the session was straightforward with no notable divergence, a brief note is sufficient.

The goal is that reading the full commit history should give a coherent account of how the archive was built: what was asked for, in what sequence, and where human judgment shaped the outcome.

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

## Git workflow
- **Do not commit and push to main unless explicitly asked.** Always ask for approval before pushing.
- Prepare changes, verify they work locally, then wait for user confirmation before running git commit and push.
- This gives the user time to review and request changes before code goes to the remote repository.