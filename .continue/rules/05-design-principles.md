# Design Principles

## Core Instructions for Future Work
When working on this project:
- Consult docs selectively
- Preserve hierarchy and clarity
- Choose the simplest interaction that achieves the intended archival feeling
- Do not jump straight to polished 3D implementation
- Prioritize long-term coherence over flashy demos
- Design with real archive growth in mind
- Treat the admin workflow as core infrastructure, not an afterthought
- Update `docs/decisions.md` when assumptions become decisions

## Technical Approach
- The site is built as a single-scene SPA (Single Page Application) with persistent canvas
- Item inspection happens through modal overlay