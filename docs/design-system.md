# Design System

This document is the reference for the archive's visual language. It exists so that work done in Phases 6–10 (homepage objects, browse systems, item inspection, 3D enhancement, polish) stays consistent without re-deriving decisions from scratch.

The system is not a UI kit. It defines the token base, component rules, and tactile language — the minimum needed to keep the archive coherent as it grows.

---

## Architecture

All tokens live in `src/styles/tokens.css`. Both the public site (`src/styles/main.css`) and the admin interface (`src/admin/styles.css`) import this file.

- **Public site** applies `data-theme="dark"` on `<html>` to activate the dark theme overrides.
- **Admin** uses `:root` defaults, which are the light theme.
- Both share the same palette primitives, font stack, spacing scale, and motion tokens.

```
src/styles/tokens.css      ← shared base (palette, type, spacing, motion)
src/styles/main.css        ← imports tokens, public site dark theme
src/admin/styles.css       ← imports tokens, admin light theme
```

---

## Color

### Palette primitives

These are raw named values. Do not use them directly in components — use semantic tokens instead.

| Name | Value | Description |
|------|-------|-------------|
| `--color-ink` | `#1a1510` | Warm near-black |
| `--color-paper` | `#f5f3ef` | Warm near-white |
| `--color-vellum` | `#e8e0d0` | Warm light gray |
| `--color-shadow` | `#0a0805` | Near-black for overlays |
| `--color-surface-dk` | `#1e1a14` | Dark warm surface (modal sheets) |

### Semantic tokens

These are what components use. They switch values between dark and light themes.

| Token | Dark (public) | Light (admin) | Usage |
|-------|--------------|---------------|-------|
| `--bg` | `#1a1510` | `#f5f3ef` | Page background |
| `--bg-surface` | `#1e1a14` | `#f5f3ef` | Modal/card surfaces |
| `--fg` | `#e8e0d0` | `#1a1510` | Primary text, borders-on-white |
| `--fg-muted` / `--muted` | `rgba(232,224,208,0.4)` | `rgba(26,21,16,0.45)` | Labels, captions, secondary text |
| `--border` | `rgba(232,224,208,0.2)` | `rgba(26,21,16,0.18)` | Default borders |
| `--border-dim` | `rgba(232,224,208,0.12)` | — | Subtle borders (modal edges) |
| `--hover-bg` | `rgba(232,224,208,0.05)` | `rgba(26,21,16,0.05)` | Row/button hover fill |
| `--active-bg` | `rgba(232,224,208,0.10)` | `rgba(26,21,16,0.10)` | Active/selected fill |

### Status colors (shared across themes)

| State | Color | Border |
|-------|-------|--------|
| draft | `--muted` | `--border` |
| partial | `#7a5a10` | `#c09040` |
| complete | `#2a5a2a` | `#60a060` |
| published | `--fg` | `--fg` |

Admin badge classes: `.badge-draft`, `.badge-partial`, `.badge-complete`, `.badge-published`

### Usage rules

- Never use `rgba()` tinting inline in component CSS — use the token.
- Opacity-based tinting is acceptable only for the layer veil (`--depth`-driven overlays), which is architectural.
- The dark-theme `--border-dim` token is specifically for modal/sheet edge borders where the standard `--border` reads too heavy against the dark surface.

---

## Typography

### Font stack

```css
--font: ui-monospace, "Cascadia Mono", "Fira Mono", monospace;
```

One stack, used everywhere. Both public and admin sites are monospace-only. No serif or sans-serif is in scope.

### Type scale

| Token | Value | Usage |
|-------|-------|-------|
| `--text-xs` | `0.7rem` | IDs, meta-labels, small counts, year dividers |
| `--text-sm` | `0.75rem` | Captions, secondary metadata, browse dates, modal field labels |
| `--text-base` | `0.875rem` | Body text, browse item titles, modal field values |
| `--text-md` | `0.95rem` | Desk object labels |
| `--text-lg` | `1.1rem` | Modal titles |
| `--text-xl` | `1.4rem` | Sheet titles (series names, series container headings) |

Admin uses a fixed-pixel scale (10px–22px) defined inline in `admin/styles.css`. These are parallel but separate from the rem scale — the admin targets dense tool density; the public site targets comfortable reading.

### Line heights

| Token | Value | Usage |
|-------|-------|-------|
| `--leading-tight` | `1.3` | Headings |
| `--leading-base` | `1.5` | Default body |
| `--leading-loose` | `1.6` | Guide prose, notes, longer text |

### Letter spacing

| Token | Value | Usage |
|-------|-------|-------|
| `--tracking-base` | `0.03em` | Sheet titles, desk labels |
| `--tracking-wide` | `0.07em` | Admin section headings, stat labels |
| `--tracking-wider` | `0.1em` | Desk container labels, subtitle metadata |

### Hierarchy in practice

```
sheet-title      --text-xl, --tracking-base, weight normal
sheet-subtitle   --text-sm, uppercase, --tracking-wider, opacity 0.4
modal-title      --text-lg, weight normal
section-label    --text-xs, uppercase, --tracking-wide or wider, opacity 0.4
browse-title     --text-base
browse-meta      --text-sm, opacity 0.5
type-label       --text-xs, uppercase, opacity 0.4
```

Font weight is almost always `normal` (400) in the public site. `semi` (600) appears only in admin (page titles, selected nav items, depth button names).

---

## Spacing

The public site uses a rem-based scale (`--sp-*`). The admin uses pixel values defined inline. Both derive from the same conceptual steps.

| Token | Value | ~px | Usage |
|-------|-------|-----|-------|
| `--sp-1` | `0.15rem` | 2px | Tiny gaps (modal field grid row gap) |
| `--sp-2` | `0.25rem` | 4px | Container labels margin, small counts |
| `--sp-3` | `0.4rem` | 6px | Item gap, list item margin |
| `--sp-4` | `0.5rem` | 8px | Compact padding (tab padding-y, button padding-y) |
| `--sp-5` | `0.75rem` | 12px | Tab padding-x, thumb gap in browse items |
| `--sp-6` | `1rem` | 16px | Section margins, guide paragraph gaps |
| `--sp-7` | `1.5rem` | 24px | Sheet subtitle margin, tab section margin |
| `--sp-8` | `2rem` | 32px | Sheet inner padding, inspection gap |
| `--sp-9` | `2.5rem` | 40px | Desk object padding-y |

---

## Borders and surfaces

| Token | Value | Usage |
|-------|-------|-------|
| `--border-width` | `1px` | All borders |
| `--radius-none` | `0` | Public site — no rounding anywhere |
| `--radius-sm` | `2px` | Admin — buttons, badges, stat cards |

The public site uses no border-radius. Rectilinear edges reinforce the archival/document feeling. The admin uses 2px radius on buttons only.

Surfaces in the public site are either `--bg` (page) or `--bg-surface` (modal sheets). There are no intermediate elevation levels beyond what the `--depth`-driven veil system provides.

---

## Motion

| Token | Value | Usage |
|-------|-------|-------|
| `--dur-fast` | `0.1s` | Hover fills (browse rows) |
| `--dur-base` | `0.15s` | Button/border hover, opacity transitions |
| `--dur-slow` | `0.32s` | Sheet enter/exit, veil appear |
| `--ease-out` | `cubic-bezier(0.22, 1, 0.36, 1)` | Sheet translate (fast deceleration) |
| `--ease-base` | `ease` | General transitions |

All animated elements must include a `prefers-reduced-motion` reset. The pattern is already in `main.css`:

```css
@media (prefers-reduced-motion: reduce) {
  .layer-veil,
  .layer-sheet { transition: none; }
}
```

Extend this block when adding new animated elements.

---

## Components

### Desk object

The homepage entry points. Five series + one guide.

```html
<button class="desk-object">
  <span class="desk-object__label">Consumption</span>
  <span class="desk-object__container">ledger</span>
</button>
```

States: default → hover (border brightens, faint bg fill). No active/pressed state beyond OS default.  
Guide variant: `.desk-object--guide` — full width, dashed border, `opacity: 0.6` at rest.

### Layer veil

```html
<div class="layer-veil layer-veil--visible" style="--depth: 1"></div>
```

`--depth` is set inline per layer (1, 2, 3). Controls blur and darkness. Do not put `--depth` in a stylesheet — it is always inline so it can vary per layer instance.

### Layer sheet (modal)

```html
<div class="layer-sheet layer-sheet--visible" style="--depth: 1">
  <div class="layer-sheet__inner">…</div>
</div>
```

Item inspection uses `.layer-sheet--item` for a wider width. Sheet enter uses `translate + opacity` transition.

### Sheet typography

```html
<button class="sheet-close">✕</button>
<h2 class="sheet-title">Consumption</h2>
<p class="sheet-subtitle">ledger · 734 items</p>
```

### Series tabs

```html
<div class="series-tabs">
  <button class="series-tab series-tab--active">
    Films <span class="series-tab__count">476</span>
  </button>
  <button class="series-tab">Books</button>
</div>
```

### Browse list

```html
<ul class="browse-list">
  <li class="browse-item">
    <button class="browse-item__trigger">
      <div class="browse-item__thumb"><img src="…" alt=""></div>
      <div class="browse-item__info">
        <span class="browse-item__type">film</span>
        <span class="browse-item__title">In the Mood for Love</span>
        <span class="browse-item__date">2026-01-14</span>
      </div>
    </button>
  </li>
</ul>
```

Year dividers:
```html
<li class="browse-year-divider">2025</li>
```

### Modal inspection

```html
<div class="inspection-modal__content">
  <div><!-- image column --></div>
  <div>
    <h3 class="modal-title">In the Mood for Love</h3>
    <dl class="modal-fields">
      <div class="modal-field">
        <dt class="modal-field__label">director</dt>
        <dd class="modal-field__value">Wong Kar-wai</dd>
      </div>
    </dl>
    <div class="modal-section">
      <p class="modal-section__label">notes</p>
      …
    </div>
  </div>
</div>
<nav class="inspection-modal__nav">
  <button class="inspection-modal__prev">← prev</button>
  <button class="inspection-modal__next">next →</button>
</nav>
```

Image controls:
```html
<button class="modal-flip-btn">flip</button>
<button class="modal-zoom-btn">zoom</button>
```

### Admin badge

```html
<span class="badge badge-published">published</span>
<span class="badge badge-draft">draft</span>
```

### Admin buttons

```html
<button class="admin-btn">Save</button>
<button class="admin-btn admin-btn-secondary">Cancel</button>
```

Primary: filled `--fg`, text `--bg`. Secondary: outlined, no fill.

---

## Tactile language

The archive uses material metaphors (desk, binder, ledger, sketchbook, flat-file, dossier) but material language must never obscure navigation or information.

**Where material language is strongest:**
- Homepage desk objects — border treatment, spacing, container label
- Item inspection — front/back toggle, image framing

**Where clarity takes over:**
- Browse lists — plain rows, no faux-paper
- Metadata blocks — clean label/value grids
- Admin interface — functional, no atmospheric treatment

**Current CSS expressions of material:**
- Dark warm-brown palette (not generic black/white)
- No border-radius — rectilinear, document-like
- Monospace type throughout — ledger, record, finding-aid feeling
- Thin borders at low opacity — present but unobtrusive
- Layer depth system — physical sense of sheets stacked on the desk
- Uppercase small labels with wide tracking — archival classification

**What not to do:**
- Do not add paper textures or background images to browse lists
- Do not use decorative flourishes (ornamental rules, ligatures, drop caps) unless they serve a specific record type
- Do not add color beyond the warm neutral palette without a specific content-driven reason
- 3D effects are Phase 9 — do not introduce them in Phases 5–8

---

## Accessibility

### Focus states
All interactive elements must be keyboard-focusable. Currently focus states rely on browser defaults. When adding custom focus styles in Phase 6+, use `outline` rather than `box-shadow`:

```css
:focus-visible {
  outline: 1px solid var(--fg);
  outline-offset: 2px;
}
```

### Reduced motion
Any new animated element added to `main.css` must be listed in the `prefers-reduced-motion` block at the bottom of the file.

### Color contrast
`--fg` on `--bg` in both themes is high-contrast (near-black on near-white, or near-white on near-black). Muted text (`--fg-muted`) at ~45% opacity on the light admin background meets WCAG AA for large text; for small text, avoid muted on muted.

### Mobile
The layer-sheet system uses `min(560px, 92vw)` and `min(900px, 92vw)` to constrain width. No explicit breakpoints are defined. Do not introduce breakpoints without testing the full sheet-stack interaction at 375px.

---

## Adding to the system

### New token
1. Add it to `src/styles/tokens.css` in the relevant section.
2. Define it in both `:root` (light) and `[data-theme="dark"]` if it differs between themes.
3. Add a row to the relevant table in this document.

### New component
1. Write the CSS in `main.css` (public) or `admin/styles.css` (admin) using existing tokens only.
2. Document it in this file under Components with: usage note, HTML pattern, states.
3. Do not create a new token for a one-off value — use an existing token or hardcode if truly isolated.
