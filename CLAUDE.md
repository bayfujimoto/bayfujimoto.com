# CLAUDE.md
## 11ty Website Migration Implementation Guide for Bay Fujimoto

---

## Project Overview

This document provides comprehensive implementation instructions for migrating bayfujimoto.com from WordPress to 11ty (Eleventy), with automated content updates from Letterboxd and Goodreads. This guide is designed to be used by an AI assistant (like Claude) to implement the entire site from scratch.

---

## Key Requirements

### Design Preservations
- Maintain unique icon-based navigation system
- Preserve black background, monospace typography aesthetic  
- Keep responsive, minimalist design
- Replicate all visual metaphors (polaroid for about, manila folder for archive, etc.)
- In archive pages, use a simple spreadsheet-style layout to test content. Then add complexity later.

### Performance and Accessibility
- Should load fast on all platforms.
- Looks and performs well on mobile devices.
- Structured to reduce the number of tokens used when editing or creating via Claude Code.

### Automation Goals
- **Movies:** Auto-update from Letterboxd RSS daily
- **Books:** Auto-update from Goodreads RSS daily
- **Other content:** Git-based updates via markdown
- **Build frequency:** Daily scheduled builds + manual triggers

### Technical Stack
- **SSG:** 11ty (Eleventy) v2.x or later
- **Templating:** Nunjucks
- **Styling:** Custom CSS (no framework needed)
- **Hosting:** Netlify
- **Version Control:** GitHub
- **Build automation:** GitHub Actions + Netlify

### Pages Defined

1. **Homepage** (`/`)
   - Visual grid layout with icon-based navigation
   - Links to all major sections via clickable images
   - No traditional text navigation menu
   
2. **About** (`/about`)
   - Personal bio and information
   
3. **Contact** (`/contact`)
   - Contact information and social links
   
4. **Resume** (`/resume`)
   - Professional resume/CV
   
5. **Portfolio** (`/portfolio`)
   - Work samples and projects
   
6. **Advance Copy** (`/advance-copy`)
   - Shows what I'm currently doing or working on.
   
7. **Fortune** (`/fortune`)
   - Serves as a secret door with a secret code that leads to more content specifially designed to share with friends and family.
   
8. **Archive** (`/archive`)
   - Main archive section with subsections:
     - **Movies** (`/archive/movies`) - Film tracking
     - **Books** (`/archive/books`) - Books that I've read
     - **Coffee** (`/archive/coffee`) - Coffee logs
     - **Photos** (`/archive/photos`) - Photo gallery
     - **Documents** (`/archive/documents`) - Documents that I have scanned such as movie tickets, pamphlets, and museum brochures.
     - **Videos** (`/archive/videos`) - Video collection
     - **Builds** (`/archive/builds`) - Things that I've designed.

---

## Phase 1: Project Initialization

### Step 1.1: Create GitHub Repository

```bash
# Create new directory
mkdir bayfujimoto-com
cd bayfujimoto-com

# Initialize git
git init

# Create main branch
git checkout -b main
```

### Step 1.2: Initialize Node Project

```bash
# Initialize package.json
npm init -y

# Install 11ty and dependencies
npm install --save-dev @11ty/eleventy
npm install --save-dev rss-parser
npm install --save-dev @11ty/eleventy-fetch
npm install --save-dev @11ty/eleventy-img

# Add scripts to package.json
```

**package.json scripts:**
```json
{
  "scripts": {
    "start": "eleventy --serve",
    "build": "eleventy",
    "debug": "DEBUG=Eleventy* eleventy"
  }
}
```

### Step 1.3: Create Directory Structure

```bash
mkdir -p src/{_data,_includes/{layouts,components},assets/{css,images,js},pages,archive}
mkdir -p .github/workflows
touch .eleventy.js
touch netlify.toml
touch .gitignore
```

### Step 1.4: Configure .gitignore

```
# .gitignore
node_modules/
_site/
.DS_Store
*.log
.env
.cache/
```

---

## Phase 2: 11ty Configuration

### Step 2.1: Create .eleventy.js

```javascript
// .eleventy.js
module.exports = function(eleventyConfig) {
  
  // Pass through assets
  eleventyConfig.addPassthroughCopy("src/assets");
  
  // Watch for CSS changes
  eleventyConfig.addWatchTarget("src/assets/css/");
  
  // Set directories
  return {
    dir: {
      input: "src",
      output: "_site",
      includes: "_includes",
      data: "_data"
    },
    templateFormats: ["md", "njk", "html"],
    markdownTemplateEngine: "njk",
    htmlTemplateEngine: "njk",
    dataTemplateEngine: "njk"
  };
};
```

### Step 2.2: Create netlify.toml

```toml
# netlify.toml
[build]
  publish = "_site"
  command = "npm run build"

[build.environment]
  NODE_VERSION = "18"

[[redirects]]
  from = "/archive"
  to = "/archive/movies"
  status = 301

[functions]
  node_bundler = "esbuild"
```

---

## Phase 3: Data Layer (Automation)

### Step 3.1: Create Movies Data File (Letterboxd)

```javascript
// src/_data/movies.js
const Parser = require('rss-parser');
const parser = new Parser();
const EleventyFetch = require("@11ty/eleventy-fetch");

module.exports = async function() {
  const username = process.env.LETTERBOXD_USERNAME || "YOUR_USERNAME";
  const url = `https://letterboxd.com/${username}/rss/`;
  
  try {
    // Fetch with caching (1 day cache)
    const response = await EleventyFetch(url, {
      duration: "1d",
      type: "text"
    });
    
    const feed = await parser.parseString(response);
    
    return feed.items.map(item => {
      // Extract data from content
      const content = item.content || item['content:encoded'] || '';
      
      // Extract rating (stars)
      const ratingMatch = content.match(/★/g);
      const rating = ratingMatch ? ratingMatch.length : 0;
      
      // Extract year from title (usually "Film Title Year")
      const yearMatch = item.title.match(/\((\d{4})\)/);
      const year = yearMatch ? yearMatch[1] : '';
      
      // Extract poster image
      const imgMatch = content.match(/<img[^>]+src="([^">]+)"/);
      const poster = imgMatch ? imgMatch[1] : '';
      
      // Clean title (remove year if present)
      const title = item.title.replace(/\s*\(\d{4}\)\s*$/, '').trim();
      
      return {
        title: title,
        year: year,
        rating: rating,
        link: item.link,
        date: new Date(item.pubDate),
        poster: poster,
        description: content.replace(/<[^>]*>/g, '').substring(0, 200)
      };
    }).slice(0, 100); // Latest 100 films
    
  } catch (error) {
    console.error('Error fetching Letterboxd RSS:', error);
    return []; // Return empty array on error
  }
};
```

### Step 3.2: Create Books Data File (Goodreads)

```javascript
// src/_data/books.js
const Parser = require('rss-parser');
const parser = new Parser();
const EleventyFetch = require("@11ty/eleventy-fetch");

module.exports = async function() {
  const userId = process.env.GOODREADS_USER_ID || "YOUR_USER_ID";
  const shelf = "read"; // or "currently-reading", "to-read"
  const url = `https://www.goodreads.com/review/list_rss/${userId}?shelf=${shelf}`;
  
  try {
    const response = await EleventyFetch(url, {
      duration: "1d",
      type: "text"
    });
    
    const feed = await parser.parseString(response);
    
    return feed.items.map(item => {
      const content = item.content || item['content:encoded'] || '';
      const description = item['book_description'] || '';
      
      // Extract author (usually in title like "Title by Author")
      const authorMatch = item.title.match(/by\s+(.+?)$/);
      const author = authorMatch ? authorMatch[1] : 'Unknown';
      
      // Extract title
      const title = item.title.replace(/\s+by\s+.+$/, '').trim();
      
      // Extract rating
      const ratingMatch = content.match(/rated it\s+(\d+)\s+stars?/i) || 
                         content.match(/(\d+)\s+of\s+5\s+stars/i);
      const rating = ratingMatch ? parseInt(ratingMatch[1]) : 0;
      
      // Extract cover image
      const imgMatch = content.match(/<img[^>]+src="([^">]+)"/);
      const cover = imgMatch ? imgMatch[1] : '';
      
      return {
        title: title,
        author: author,
        rating: rating,
        link: item.link,
        dateRead: new Date(item.pubDate),
        cover: cover,
        description: description
      };
    }).slice(0, 100); // Latest 100 books
    
  } catch (error) {
    console.error('Error fetching Goodreads RSS:', error);
    return []; // Return empty array on error
  }
};
```

### Step 3.3: Create Site Metadata

```json
// src/_data/site.json
{
  "name": "Bay Fujimoto",
  "url": "https://www.bayfujimoto.com",
  "description": "Personal website of Bay Fujimoto",
  "author": {
    "name": "Bay Fujimoto",
    "email": "bayfujimoto@gmail.com"
  },
  "colors": {
    "base": "#000000",
    "contrast": "#dadad7",
    "accent1": "#dfdccb",
    "accent2": "#c19876",
    "accent3": "#5d90a3",
    "accent4": "#e83c3a",
    "accent5": "#353535",
    "accent6": "#888888"
  }
}
```

---

## Phase 4: Layout & Templates

### Step 4.1: Base Layout

```html
{# src/_includes/layouts/base.njk #}
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{% if title %}{{ title }} – {% endif %}{{ site.name }}</title>
  <meta name="description" content="{{ description or site.description }}">
  
  {# Fonts #}
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@300;400;700&family=Manrope:wght@200;700&display=swap" rel="stylesheet">
  
  {# Stylesheet #}
  <link rel="stylesheet" href="/assets/css/main.css">
</head>
<body>
  
  {# Sticky Navigation #}
  {% include "components/nav.njk" %}
  
  {# Main Content #}
  <main>
    {{ content | safe }}
  </main>
  
  {# Optional JS #}
  <script src="/assets/js/main.js"></script>
</body>
</html>
```

### Step 4.2: Navigation Component

```html
{# src/_includes/components/nav.njk #}
<nav class="main-nav">
  <div class="nav-container">
    
    {# Logo / Home #}
    <a href="/" class="nav-item">
      <img src="/assets/images/logo.png" alt="Home" width="140" height="251">
    </a>
    
    {# Fortune #}
    <a href="/fortune/" class="nav-item">
      <img src="/assets/images/fortune.png" alt="Fortune" width="40" height="158">
    </a>
    
    {# About #}
    <a href="/about/" class="nav-item">
      <img src="/assets/images/polaroid.png" alt="About" width="126" height="154">
    </a>
    
    {# Resume #}
    <a href="/resume/" class="nav-item">
      <img src="/assets/images/resume.png" alt="Resume" width="227" height="322">
    </a>
    
    {# Archive #}
    <a href="/archive/" class="nav-item">
      <img src="/assets/images/manila-folder.png" alt="Archive" width="312" height="241">
    </a>
    
  </div>
  
  {# Bottom row #}
  <div class="nav-container-bottom">
    
    {# Contact #}
    <a href="/contact/" class="nav-item">
      <img src="/assets/images/contact.png" alt="Contact" width="196" height="108">
    </a>
    
    {# Portfolio #}
    <a href="/portfolio/" class="nav-item">
      <img src="/assets/images/portfolio.png" alt="Portfolio" width="443" height="310">
    </a>
    
    {# Quick links to photos/videos #}
    <div class="nav-group">
      <a href="/archive/photos/" class="nav-item">
        <img src="/assets/images/sdcard.png" alt="Photos" width="75" height="100">
      </a>
      <a href="/archive/videos/" class="nav-item">
        <img src="/assets/images/videotape.png" alt="Videos" width="75" height="200">
      </a>
    </div>
    
    {# Sitemap #}
    <div class="nav-item">
      <img src="/assets/images/sitemap.png" alt="Sitemap" width="152" height="270">
    </div>
    
  </div>
</nav>
```

### Step 4.3: Page Layout

```html
{# src/_includes/layouts/page.njk #}
---
layout: layouts/base.njk
---

<article class="page-content">
  <h1>{{ title }}</h1>
  {{ content | safe }}
</article>
```

### Step 4.4: Archive Layout

```html
{# src/_includes/layouts/archive.njk #}
---
layout: layouts/base.njk
---

<article class="archive-page">
  <header class="archive-header">
    <h1>{{ title }}</h1>
    {% if description %}
      <p class="archive-description">{{ description }}</p>
    {% endif %}
  </header>
  
  <div class="archive-content">
    {{ content | safe }}
  </div>
</article>
```

---

## Phase 5: CSS Styling

### Step 5.1: Main Stylesheet

```css
/* src/assets/css/main.css */

/* CSS Variables */
:root {
  --color-base: #000000;
  --color-contrast: #dadad7;
  --color-accent-1: #dfdccb;
  --color-accent-2: #c19876;
  --color-accent-3: #5d90a3;
  --color-accent-4: #e83c3a;
  --color-accent-5: #353535;
  --color-accent-6: #888888;
  
  --font-mono: 'JetBrains Mono', monospace;
  --font-sans: 'Manrope', sans-serif;
  
  --font-size-small: 0.5rem;
  --font-size-medium: 0.8rem;
  --font-size-large: clamp(1.125rem, 1.125rem + ((1vw - 0.2rem) * 0.392), 1.375rem);
  --font-size-xl: clamp(1.75rem, 1.75rem + ((1vw - 0.2rem) * 0.392), 2rem);
  --font-size-xxl: clamp(2.15rem, 2.15rem + ((1vw - 0.2rem) * 0.392), 2.4rem);
  
  --spacing-small: 10px;
  --spacing-medium: 20px;
  --spacing-large: 30px;
  --spacing-xl: clamp(30px, 5vw, 50px);
  --spacing-xxl: clamp(70px, 10vw, 140px);
}

/* Reset & Base */
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  background-color: var(--color-base);
  color: var(--color-contrast);
  font-family: var(--font-mono);
  font-size: var(--font-size-small);
  font-weight: 300;
  line-height: 1.4;
  padding: 0 var(--spacing-xxl);
}

/* Typography */
h1, h2, h3, h4, h5, h6 {
  color: var(--color-contrast);
  font-family: var(--font-sans);
  font-weight: 700;
  letter-spacing: -0.5px;
  line-height: 1.2;
  margin-bottom: 1.2rem;
}

h1 { font-size: var(--font-size-xxl); }
h2 { font-size: var(--font-size-xl); }
h3 { font-size: var(--font-size-large); }
h4 { font-size: var(--font-size-medium); }

p {
  font-size: var(--font-size-medium);
  margin-bottom: 1.2rem;
}

a {
  color: var(--color-accent-3);
  text-decoration: underline;
}

a:hover {
  text-decoration: none;
}

/* Navigation */
.main-nav {
  position: sticky;
  top: 0;
  z-index: 10;
  background-color: var(--color-base);
  padding: var(--spacing-medium) 0;
}

.nav-container {
  display: flex;
  flex-wrap: wrap;
  gap: var(--spacing-large);
  align-items: center;
  justify-content: center;
  margin-bottom: var(--spacing-large);
}

.nav-container-bottom {
  display: flex;
  flex-wrap: wrap;
  gap: var(--spacing-large);
  align-items: center;
  justify-content: center;
}

.nav-item {
  display: inline-block;
  transition: opacity 0.3s ease;
}

.nav-item:hover {
  opacity: 0.7;
}

.nav-item img {
  display: block;
  height: auto;
}

.nav-group {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-small);
}

/* Main Content */
main {
  min-height: 100vh;
  padding: var(--spacing-xl) 0;
}

.page-content,
.archive-page {
  max-width: 800px;
  margin: 0 auto;
}

/* Archive Grids */
.movies-grid,
.books-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: var(--spacing-medium);
  margin-top: var(--spacing-xl);
}

.movie-item,
.book-item {
  position: relative;
  transition: transform 0.2s ease;
}

.movie-item:hover,
.book-item:hover {
  transform: scale(1.05);
}

.movie-item img,
.book-item img {
  width: 100%;
  height: auto;
  display: block;
}

.movie-info,
.book-info {
  margin-top: var(--spacing-small);
}

.movie-title,
.book-title {
  font-size: var(--font-size-medium);
  font-weight: 400;
  margin-bottom: 0.25rem;
}

.movie-year,
.book-author {
  font-size: var(--font-size-small);
  color: var(--color-accent-6);
}

.rating {
  color: var(--color-accent-4);
}

/* Responsive */
@media (max-width: 768px) {
  body {
    padding: 0 var(--spacing-large);
  }
  
  .nav-container,
  .nav-container-bottom {
    flex-direction: column;
    gap: var(--spacing-medium);
  }
  
  .nav-item img {
    max-width: 200px;
  }
  
  .movies-grid,
  .books-grid {
    grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
    gap: var(--spacing-small);
  }
}
```

---

## Phase 6: Content Pages

### Step 6.1: Homepage

```html
---
layout: layouts/base.njk
title: Home
permalink: /
---

{# Homepage is just navigation - handled by nav component #}
<div class="center-vertical">
  <p style="text-align: center; opacity: 0.3;">Select an item to navigate</p>
</div>
```

### Step 6.2: About Page

```markdown
---
layout: layouts/page.njk
title: About
permalink: /about/
---

# About Me

[Add your bio content here]

I'm Bay Fujimoto, a [your profession/description].

## Background

[Add background information]

## Interests

- Film & Cinema
- Literature
- Coffee
- Photography
- [Other interests]

## Contact

For inquiries, visit my [contact page](/contact/).
```

### Step 6.3: Movies Archive

```html
---
layout: layouts/archive.njk
title: Movies
description: Films I've watched, tracked via Letterboxd
permalink: /archive/movies/
---

<div class="movies-grid">
  {% for movie in movies %}
    <article class="movie-item">
      <a href="{{ movie.link }}" target="_blank" rel="noopener">
        {% if movie.poster %}
          <img src="{{ movie.poster }}" alt="{{ movie.title }}" loading="lazy">
        {% else %}
          <div class="no-poster">{{ movie.title }}</div>
        {% endif %}
      </a>
      <div class="movie-info">
        <h3 class="movie-title">{{ movie.title }}</h3>
        <p class="movie-year">{{ movie.year }}</p>
        {% if movie.rating > 0 %}
          <p class="rating">
            {% for i in range(0, movie.rating) %}★{% endfor %}
          </p>
        {% endif %}
        <p class="movie-date">
          <time datetime="{{ movie.date | date }}">
            {{ movie.date | date: "%B %d, %Y" }}
          </time>
        </p>
      </div>
    </article>
  {% endfor %}
</div>

{% if movies.length === 0 %}
  <p>No movies found. Check back later!</p>
{% endif %}
```

### Step 6.4: Books Archive

```html
---
layout: layouts/archive.njk
title: Books
description: Books I've read, tracked via Goodreads
permalink: /archive/books/
---

<div class="books-grid">
  {% for book in books %}
    <article class="book-item">
      <a href="{{ book.link }}" target="_blank" rel="noopener">
        {% if book.cover %}
          <img src="{{ book.cover }}" alt="{{ book.title }}" loading="lazy">
        {% else %}
          <div class="no-cover">{{ book.title }}</div>
        {% endif %}
      </a>
      <div class="book-info">
        <h3 class="book-title">{{ book.title }}</h3>
        <p class="book-author">by {{ book.author }}</p>
        {% if book.rating > 0 %}
          <p class="rating">
            {% for i in range(0, book.rating) %}★{% endfor %}
          </p>
        {% endif %}
        <p class="book-date">
          <time datetime="{{ book.dateRead | date }}">
            {{ book.dateRead | date: "%B %d, %Y" }}
          </time>
        </p>
      </div>
    </article>
  {% endfor %}
</div>

{% if books.length === 0 %}
  <p>No books found. Check back later!</p>
{% endif %}
```

### Step 6.5: Other Pages (Templates)

Create similar markdown files for:
- `src/pages/contact.md`
- `src/pages/resume.md`
- `src/pages/portfolio.md`
- `src/pages/fortune.njk`
- `src/archive/coffee.md`
- `src/archive/photos.njk`
- `src/archive/videos.njk`
- `src/archive/documents.md`

---

## Phase 7: GitHub Actions & Automation

### Step 7.1: Scheduled Builds

```yaml
# .github/workflows/scheduled-build.yml
name: Scheduled Netlify Build

on:
  schedule:
    # Run daily at midnight UTC
    - cron: '0 0 * * *'
  # Allow manual trigger
  workflow_dispatch:

jobs:
  trigger-build:
    runs-on: ubuntu-latest
    steps:
      - name: Trigger Netlify Build Hook
        run: |
          curl -X POST -d {} ${{ secrets.NETLIFY_BUILD_HOOK }}
```

### Step 7.2: Build on Push

```yaml
# .github/workflows/build.yml
name: Build and Deploy

on:
  push:
    branches:
      - main
  pull_request:
    branches:
      - main

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
          cache: 'npm'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Build site
        env:
          LETTERBOXD_USERNAME: ${{ secrets.LETTERBOXD_USERNAME }}
          GOODREADS_USER_ID: ${{ secrets.GOODREADS_USER_ID }}
        run: npm run build
      
      - name: Upload artifacts
        uses: actions/upload-artifact@v3
        with:
          name: site-build
          path: _site/
```

---

## Phase 8: Deployment Setup

### Step 8.1: Netlify Site Creation

1. Connect GitHub repository to Netlify
2. Configure build settings:
   - Build command: `npm run build`
   - Publish directory: `_site`
   - Branch: `main`

### Step 8.2: Environment Variables

In Netlify dashboard, add:
- `LETTERBOXD_USERNAME`: Your Letterboxd username
- `GOODREADS_USER_ID`: Your Goodreads user ID

### Step 8.3: Build Hooks

1. Go to Site Settings → Build & Deploy → Build Hooks
2. Create a new build hook named "Scheduled Build"
3. Copy the webhook URL
4. Add to GitHub Secrets as `NETLIFY_BUILD_HOOK`

### Step 8.4: Domain Configuration

1. In Netlify: Site Settings → Domain Management
2. Add custom domain: `www.bayfujimoto.com`
3. Update DNS records at your registrar:
   - CNAME record: `www` → `[your-site].netlify.app`
   - A record: `@` → Netlify's IP (or use ALIAS/ANAME)
4. Enable HTTPS (automatic via Netlify)

---

## Phase 9: Image Migration

### Step 9.1: Extract Images from WordPress

```bash
# In the WordPress export folder
cd /path/to/wordpress/files

# Copy navigation icons
cp homepage/homepage_files/logo-535x1024.png src/assets/images/logo.png
cp homepage/homepage_files/fortune-214x1024.png src/assets/images/fortune.png
cp homepage/homepage_files/polaroid-788x1024.png src/assets/images/polaroid.png
cp homepage/homepage_files/resume_BLUE-716x1024.png src/assets/images/resume.png
cp homepage/homepage_files/manila-horizontal_TAN.png src/assets/images/manila-folder.png
cp homepage/homepage_files/contact-1-1024x598.png src/assets/images/contact.png
cp homepage/homepage_files/portfolio-2-1024x717.png src/assets/images/portfolio.png
cp homepage/homepage_files/sdcard-1-781x1024.png src/assets/images/sdcard.png
cp homepage/homepage_files/videos-1-364x1024.png src/assets/images/videotape.png
cp homepage/homepage_files/sitemap-574x1024.png src/assets/images/sitemap.png
```

### Step 9.2: Optimize Images (Optional)

```bash
# Install image optimization tool
npm install --save-dev @11ty/eleventy-img

# Update .eleventy.js to process images
# (See 11ty documentation for image plugin usage)
```

---

## Phase 10: Testing & Optimization

### Step 10.1: Local Testing

```bash
# Start dev server
npm start

# Open http://localhost:8080
# Test all pages and navigation
# Verify data fetching works
```

### Step 10.2: Test Automation

```bash
# Manually test RSS feeds
node -e "require('./src/_data/movies.js')().then(d => console.log(d))"
node -e "require('./src/_data/books.js')().then(d => console.log(d))"
```

### Step 10.3: Production Build Test

```bash
# Build for production
npm run build

# Check _site directory
ls -la _site/

# Test generated HTML
open _site/index.html
```

---

## Phase 11: Launch Checklist

### Pre-Launch
- [ ] All pages created and tested
- [ ] Navigation working on all pages
- [ ] Letterboxd integration working
- [ ] Goodreads integration working
- [ ] Images all loading correctly
- [ ] Responsive design tested (mobile, tablet, desktop)
- [ ] GitHub repository set up and synced
- [ ] Netlify site created and connected
- [ ] Environment variables configured
- [ ] Build hooks created
- [ ] Scheduled builds configured

### Launch
- [ ] Test build on Netlify
- [ ] Verify automated data fetching works
- [ ] Configure custom domain
- [ ] Update DNS records
- [ ] Enable HTTPS
- [ ] Test all pages on production URL
- [ ] Verify scheduled builds trigger correctly

### Post-Launch
- [ ] Monitor first scheduled build
- [ ] Verify Letterboxd updates appear
- [ ] Verify Goodreads updates appear
- [ ] Check analytics (if enabled)
- [ ] Document update process
- [ ] Set up monitoring/alerts (optional)

---

## Troubleshooting Guide

### Problem: RSS feed not fetching

**Solution:**
```javascript
// Add error logging to data file
console.log('Attempting to fetch:', url);
try {
  const response = await EleventyFetch(url, {
    duration: "1d",
    type: "text",
    verbose: true
  });
} catch (error) {
  console.error('Full error:', error);
  return [];
}
```

### Problem: Images not appearing

**Check:**
1. Image paths are correct (`/assets/images/...`)
2. Images are in `src/assets/images/`
3. PassthroughCopy is configured in `.eleventy.js`
4. Netlify build completed successfully

### Problem: Build failing on Netlify

**Check:**
1. Node version matches local (18.x)
2. All dependencies in package.json
3. Environment variables set correctly
4. Build command is correct: `npm run build`
5. Check Netlify build logs for specific error

### Problem: Scheduled builds not running

**Check:**
1. Build hook URL is correct in GitHub Secrets
2. GitHub Actions workflow is enabled
3. Check GitHub Actions tab for workflow runs
4. Verify cron syntax is correct

---

## Maintenance Guide

### How to Update Content

**Movies/Books (Automatic):**
1. Log film on Letterboxd or finish book on Goodreads
2. Wait for next scheduled build (daily at midnight)
3. Or manually trigger deploy in Netlify dashboard

**Static Pages:**
1. Edit markdown file in `src/pages/` or `src/archive/`
2. Commit and push to GitHub
3. Netlify auto-deploys

**Images:**
1. Add images to `src/assets/images/`
2. Reference in pages with `/assets/images/filename.png`
3. Commit and push

### How to Add New Features

**Add a new page:**
1. Create `src/pages/newpage.md`
2. Add frontmatter (layout, title, permalink)
3. Write content
4. Add navigation link if needed
5. Commit and push

**Add a new data source:**
1. Create `src/_data/newsource.js`
2. Fetch and return data
3. Create template in `src/archive/newsource.njk`
4. Access data with `{{ newsource }}`

---

## Performance Optimization Tips

1. **Enable Caching:**
   - Already implemented via `eleventy-fetch`
   - Cache duration: 1 day for RSS feeds

2. **Lazy Loading:**
   - Images use `loading="lazy"` attribute

3. **Image Optimization:**
   - Consider using `@11ty/eleventy-img` plugin
   - Generate responsive image sizes
   - Convert to WebP format

4. **CSS Optimization:**
   - Minify CSS for production
   - Consider critical CSS extraction

5. **Minimize Build Time:**
   - Limit number of items fetched (e.g., last 100)
   - Use longer cache durations
   - Only rebuild on content changes

---

## Future Enhancement Ideas

1. **Search Functionality:**
   - Add client-side search with Lunr.js or Pagefind
   - Search across movies, books, and pages

2. **Filtering:**
   - Filter movies by year, rating
   - Filter books by author, genre

3. **Statistics:**
   - Total films watched this year
   - Reading pace (books per month)
   - Favorite genres/directors

4. **RSS Feeds:**
   - Generate RSS feed of recent movies
   - Generate RSS feed of recent books
   - Use `eleventy-plugin-rss`

5. **Comments:**
   - Add comment system (Utterances, Giscus)
   - GitHub-based comments

6. **Photo Gallery:**
   - Integrate with Flickr API
   - Or use static image folder with gallery
   - Add lightbox for viewing

---

## Resource Links

### Documentation
- [11ty Documentation](https://www.11ty.dev/docs/)
- [Nunjucks Templating](https://mozilla.github.io/nunjucks/templating.html)
- [Netlify Documentation](https://docs.netlify.com/)
- [GitHub Actions](https://docs.github.com/en/actions)

### APIs & Feeds
- [Letterboxd RSS](https://letterboxd.com/about/rss-feeds/)
- [Goodreads RSS](https://www.goodreads.com/about/rss)
- [RSS Parser (npm)](https://www.npmjs.com/package/rss-parser)

### Tools
- [11ty Fetch](https://www.11ty.dev/docs/plugins/fetch/)
- [11ty Image Plugin](https://www.11ty.dev/docs/plugins/image/)
- [Netlify CLI](https://docs.netlify.com/cli/get-started/)

---

## Contact & Support

For questions about this implementation, refer to:
- The Analysis Report (analysis_report.md)
- 11ty Documentation
- This CLAUDE.md file

**Implementation Notes:**
- This guide assumes the AI assistant has access to the original WordPress files
- All placeholders (YOUR_USERNAME, etc.) must be replaced with actual values
- Images must be extracted from WordPress export and placed in correct locations
- Test locally before deploying to production

---

## Version History

- **v1.0** (Initial) - Complete migration guide created
- Migration from WordPress to 11ty + Netlify
- Automated Letterboxd and Goodreads integration
- GitHub Actions scheduled builds

---

**End of CLAUDE.md**
