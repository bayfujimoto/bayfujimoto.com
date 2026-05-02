# Style Guidelines

## Writing Voice
Writing should avoid startup language and generic portfolio copy.

Prefer:
- labels
- metadata
- captions
- short contextual notes
- concise reflective writing where useful
- finding-aid language where appropriate, but never unreadable or academic for its own sake

## Technical Architecture
- Built with Vite for bundling and dev server
- Uses Three.js for the WebGL canvas base layer
- Custom Node data script (`scripts/build-data.js`) for content ingestion from YAML records
- GitHub as source of truth for code, content, and configuration
- Netlify for build and deploy

## Documentation References
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