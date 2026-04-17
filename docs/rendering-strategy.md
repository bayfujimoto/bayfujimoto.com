# Rendering Strategy

## Principle
Use the simplest rendering method that preserves the intended archival feeling.

Do not default to full 3D.
The hierarchy of rendering should be:

1. plain HTML/CSS
2. image-based 2D
3. pseudo-3D
4. actual 3D

## What should be HTML/CSS first
Best candidates:
- sitemap / archive guide
- identity pages
- metadata layouts
- project indexes
- lists
- calendars
- timelines
- filters
- record grids
- captions and notes
- search results
- navigation systems

These systems should remain primarily information-forward.

## What should be image-based 2D
Best candidates:
- scans
- documents
- tickets
- receipts
- brochures
- sketches
- contact sheets
- photos
- most ephemera

Image-based interaction can include:
- zoom
- pan
- front/back toggle
- detail hotspots
- page sequence
- compare views

## What should be pseudo-3D
Best candidates:
- homepage objects
- binders
- ledgers
- drawers
- packets
- stacks
- trays
- certain inspectable artifacts

Pseudo-3D techniques:
- layered transforms
- parallax
- tilt
- image stacks
- front/back state changes
- depth shadows
- image sequences
- CSS 3D transforms
- simple model viewer without a full scene system

## What should be actual 3D
Use only when actual spatial understanding adds value.

Best candidates:
- selected homepage objects
- selected prototypes or fabricated objects
- a small number of especially meaningful inspectable items

Poor candidates for 3D:
- basic text pages
- long browse lists
- scan-heavy sections
- categories where 2D already communicates the item well

## Technology options

### Plain HTML/CSS/JS
Use for:
- the majority of the site
- structure
- metadata
- browsing
- layout
- most interactions

### CSS 3D / transforms
Use for:
- modest depth
- tilting
- opening states
- simple layered object effects
- performant homepage experiments

Pros:
- lightweight
- simpler
- easier fallback
Cons:
- limited realism
- not true object inspection

### Image sequences / sprites
Use for:
- rotating object illusion
- lightweight inspectable objects
- curated turntable views

Pros:
- controllable aesthetic
- easier than real-time 3D
Cons:
- fixed viewpoints
- more asset preparation

### model-viewer
Use for:
- isolated GLB/GLTF inspection
- straightforward model embedding
- simple camera controls

Pros:
- simpler than full 3D scene setup
- good for individual objects
Cons:
- less custom interaction control

### Three.js
Use for:
- custom 3D scenes
- homepage object environment
- tailored inspection interactions

Pros:
- flexible
- powerful
Cons:
- heavier
- more complex
- easier to overbuild

### React Three Fiber
Use only if the final stack is already React-based and the project truly benefits from componentized 3D.

Pros:
- maintainable in larger React apps
Cons:
- unnecessary complexity if the rest of the site is mostly static or content-driven

## Recommended rendering policy
- Build the first site with plain HTML/CSS/JS and image-based inspection.
- Use pseudo-3D for homepage objects before committing to real-time 3D.
- Use actual 3D only for a few items that truly benefit from rotation or spatial reading.
- Prefer selective embedded object viewers over a full 3D-everywhere site.

## Inspection behavior by item type

### Flat documents
Recommended:
- zoom
- pan
- page flip
- front/back toggle
- detail views

### Photos
Recommended:
- full-screen enlarge
- gallery stepping
- contact-sheet to single-image transition

### Ephemera
Recommended:
- front/back
- detail zoom
- optional slight tilt or layered shadow

### Prototypes / objects
Recommended:
- image sequence first
- 3D model if needed later
- metadata panel beside object

### Folded or layered documents
Recommended:
- staged unfolding
- stepwise reveal
- alternate states rather than full physics simulation

## Accessibility and fallback
3D and inspection must degrade gracefully.
Always provide:
- text metadata
- keyboard-close behavior
- alt/caption/context
- a non-3D fallback image or document view
- reduced motion behavior
- mobile-safe interaction

If 3D is unavailable:
- show still images
- show alternate views
- preserve the metadata and relationships
- never make information dependent on 3D alone

## Performance
- keep 3D rare
- lazy-load heavy assets
- use compressed web assets
- use thumbnails and progressive loading
- avoid large 3D scenes on first load
- prioritize homepage legibility over spectacle
- test on mobile and lower-power devices