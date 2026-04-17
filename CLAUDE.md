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
- `docs/admin-interface.md` — admin interface spec and workflows
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