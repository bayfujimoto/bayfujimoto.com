# Accessibility and Mobile Requirements

## Accessibility Standards
- Navigation must remain clear even when tactile metaphors are present
- Metadata must be readable and structured
- Keyboard access must work
- Reduced motion should be respected
- 3D interactions need graceful fallback
- Tactile atmosphere must not obscure navigation
- No important information should depend on 3D alone

## Mobile Design Requirements
These requirements apply to every phase going forward. The mobile site must keep pace with the desktop version — mobile is not a deferred concern.

### Layout Constraints:
- Overlay non-overlap: On screens narrower than 600px, `.layer-meta` (bottom-right) and `.layer-breadcrumb` (bottom-left) must not overlap
- Desktop grid collapses to 2 columns at ≤600px with legible labels
- Item image max-height: 60vh; max-width: 90vw at ≤600px

### Interaction Requirements:
- Touch scrolling: The horizontal browse strip (`.browse-strip`) must be touch-scrollable with `-webkit-overflow-scrolling: touch` and `scroll-snap-type: x proximity`
- No hover dependencies: All interactions must be reachable by tap. Never rely on hover-only affordances to reveal navigation or content
- Pinch-to-zoom: Item images must support pinch-to-zoom via Pointer Events API (implemented in `panels.js` `makeItemSheet`)
- Touch targets: All interactive overlay elements must have a minimum touch target of 44×44px

### Typography:
- Minimum font size: All overlay text must remain readable at 375px
- Use `--overlay-padding: 1rem` at mobile breakpoint
- Never set text below `0.65rem` on mobile
- Admin form inputs must have `font-size: 16px` minimum to prevent iOS from zooming on focus (apply in `src/admin/styles.css`)