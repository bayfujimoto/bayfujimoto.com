# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Personal website for Bay Fujimoto — bayfujimoto.com

## Commands

```bash
npm start        # Dev server at localhost:8080 (auto-reloads on CSS changes)
npm run build    # Production build to _site/
npm run debug    # Build with DEBUG=Eleventy* for verbose output
```

No test suite. Always start the dev server and verify changes in a browser before opening a PR.

## Workflow

Never commit directly to main. Branch naming: `feature/description` or `fix/description`.

After any edit: start dev server → verify in browser → commit → push → open PR targeting main → merge (triggers Netlify auto-deploy).

## Architecture

### Data Flow

All files in `src/_data/` are automatically available as global variables in every template. Data sources:

- **`site.json`** — site-wide metadata (name, URL, author, colors)
- **`books.js`** — fetches Goodreads RSS, parses and caches for 1 day
- **`movies.js`** — hybrid: merges Letterboxd RSS (recent) with `moviesHistorical.json` (full history). Deduplicates on `title|year|date`. Enriches images via `customBackdrops.json` first, then TMDb API as fallback.
- **`moviesCalendar.js`** — consumes `movies.js`, groups by date, builds per-year calendar structures, injects quotes from `customQuotes.json`
- **`footerImage.js`** — randomly picks an image from `src/assets/images/footer/` on each build
- **`build.js`** — captures build timestamp and line/file counts (Central Time)
- **`timezoneUtils.js`** — shared helper; all dates site-wide convert to `America/Chicago`

### Layout Inheritance

```
base.njk          ← root HTML shell, nav, footer, JS
├── page.njk      ← wraps content in <article class="page-content">
└── archive.njk   ← wraps content in <article class="archive-page">
```

`base.njk` conditionally loads `resume.css` or `portfolio.css` based on `title`.

### Navigation (Dual Mode)

`nav.njk` checks `page.url === '/'`:
- **Homepage:** icon-grid layout (PNG/SVG images, no text)
- **All other pages:** fixed top navbar with mobile hamburger toggle (JS in `main.js`, active on ≤768px)

### Nunjucks in Markdown

`markdownTemplateEngine` is set to `"njk"`, so `.md` files can contain Nunjucks syntax and access global data variables.

### Caching

EleventyFetch caches API responses: RSS feeds for 1 day, TMDb images for 30 days. Cached files live in `.cache/`. Data does not update between scheduled rebuilds (GitHub Actions triggers Netlify rebuild on a schedule via webhook).

### Scheduled Builds

`.github/workflows/scheduled-build.yml` calls the Netlify build hook (env var: `NETLIFY_BUILD_HOOK`) twice weekly. No git operations — it just triggers a Netlify rebuild.

## Design System

CSS variables are defined in `src/assets/css/main.css`. Always use these rather than hardcoded values:

```css
/* Colors */
--color-base: #000000
--color-contrast: #f3f3f3
--color-accent-1: #dfdccb   /* warm tan */
--color-accent-3: #5d90a3   /* link color */
--color-accent-4: #e83c3a   /* red */

/* Typography */
--font-mono: 'JetBrains Mono', monospace   /* body */
--font-sans: 'Manrope', sans-serif          /* headings */

/* Spacing — use fluid clamp() values */
--spacing-small / --spacing-medium / --spacing-large / --spacing-xl / --spacing-xxl / --spacing-xxxl
```

Responsive breakpoints: 1024px (tablet), 768px (mobile), 480px (small mobile).

Stylesheet split: `main.css` (global), `footer.css`, `calendar.css`, `cursor.css`, `resume.css`, `portfolio.css`.

## Environment Variables

Required in `.env` for local development:

```
GOODREADS_USER_ID=
LETTERBOXD_USERNAME=
TMDB_API_KEY=
NETLIFY_BUILD_HOOK=
```

## Design Guidelines

- Always look for the simplest fix at the highest level — avoid patchwork changes when a layout or data file can solve it cleanly.
- Use CSS variables for all colors, fonts, and spacing.
- Images: add to `src/assets/images/`, reference as `/assets/images/filename`.
- Footer (`components/footer.njk`) displays on all non-home pages and shows live build metadata (last movie/book, build time, line counts).