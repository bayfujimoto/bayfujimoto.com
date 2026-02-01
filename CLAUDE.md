# CLAUDE.md

Personal website for Bay Fujimoto — bayfujimoto.com

## Tech Stack

- **SSG:** 11ty (Eleventy)
- **Templating:** Nunjucks
- **Styling:** Custom CSS (no framework)
- **Hosting:** Netlify
- **Automation:** GitHub Actions (daily builds) + Netlify

## Commands

```bash
npm start    # Dev server at localhost:8080
npm run build # Production build to _site/
```

## Project Structure

```
src/
├── _data/          # Data files (movies.js, books.js, site.json)
├── _includes/
│   ├── layouts/    # Base templates (base.njk, page.njk, archive.njk)
│   └── components/ # Reusable components (nav.njk)
├── assets/
│   ├── css/        # Stylesheets (main.css, calendar.css)
│   ├── images/     # Static images
│   └── js/         # JavaScript files
├── pages/          # Static pages (about, contact, resume, etc.)
└── archive/        # Archive section templates
```

## Workflow

- Always push, commit, create a PR, and update a local dev server after making any edits.

1. **Create a feature branch** — Never commit directly to main. Use `feature/description` or `fix/description` naming.

2. **Start the dev server** — After switching to your branch, run `npm start` and keep it running while you work.

3. **Make changes** — Edit files as needed. The dev server auto-reloads.

4. **Commit and push** — Stage changes with `git add`, commit with a clear message, and push to GitHub.

5. **Open a pull request** — Create a PR targeting main with a descriptive title and description of changes.

6. **Merge and clean up** — After approval/review, merge to main (which auto-deploys) and delete the branch.

## Automated Data

- **Movies:** Fetched from Letterboxd RSS daily
- **Books:** Fetched from Goodreads RSS daily
- Cache duration: 1 day (via eleventy-fetch)

## Design Guidelines

- Black background (`#000000`), light text (`#dadad7`)
- Fonts: JetBrains Mono (body), Manrope (headings)
- Icon-based navigation (no traditional text menu)
- Responsive: Desktop > Tablet > Mobile breakpoints at 1024px, 768px, 480px
- Use CSS variables defined in `main.css` for colors, fonts, and spacing
- Always search for a simpler approach. Look for solutions in higher-level files rather than patchwork fixes.

## Content Updates

- **Movies/Books:** Automatic via RSS feeds on daily build
- **Static pages:** Edit markdown in `src/pages/` or `src/archive/`, commit and push
- **Images:** Add to `src/assets/images/`, reference as `/assets/images/filename.png`

## Sitemap

- **Home** (N/A) — Icon-based navigation grid linking to all major sections

- **About** (`src/pages/about.md`) — Personal bio and background

- **Contact** (`src/pages/contact.md`) — Contact info and social links

- **Resume** (`src/pages/resume.md`) — Professional CV/resume

- **Portfolio** (`src/pages/portfolio.md`) — Work samples and projects

- **Advance Copy** (`src/pages/advance-copy.md`) — Current work/projects in progress

- **Fortune** (`src/pages/fortune.njk`) — Secret section (requires code)

- **Movies** (`src/archive/movies.njk`) — Film log with calendar grid view from Letterboxd
  - Interactive calendar with year selector, movie posters, ratings

- **Books** (`src/archive/books.njk`) — Reading list from Goodreads
  - Grid layout of book covers with ratings and dates

- **Coffee** (`src/archive/coffee.md`) — Coffee log/tracking

- **Photos** (`src/archive/photos.njk`) — Photo gallery

- **Documents** (`src/archive/documents.md`) — Scanned items (tickets, pamphlets, brochures)

- **Videos** (`src/archive/videos.njk`) — Video collection

- **Builds** (`src/archive/builds.md`) — Design projects and builds

## Wishlist
- **Full screen footer** - Footer that appears on non-home pages that mimics the look of movie credits.