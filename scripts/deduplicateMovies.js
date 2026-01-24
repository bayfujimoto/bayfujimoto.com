#!/usr/bin/env node

/**
 * Deduplication Script for Letterboxd Historical Data
 *
 * Removes duplicate movie entries from moviesHistorical.json.
 *
 * Problem: Letterboxd export creates multiple diary entries for the same movie watch
 * when you log a watch, then add a review, then edit rating, etc. Each gets a unique URI.
 *
 * Solution: Deduplicate by title + year + date (ignoring time).
 * For same-day duplicates, prefer entry with review text (most complete).
 *
 * Usage:
 *   node scripts/deduplicateMovies.js
 */

const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'src', '_data', 'moviesHistorical.json');
const movies = require(filePath);

console.log(`\n📊 Processing ${movies.length} movies from historical data...\n`);

// PHASE 1: Deduplicate by exact title+year+date (consolidate diary.csv + reviews.csv)
console.log('Phase 1: Consolidating diary and review entries...');
const exactDupeMap = new Map();

movies.forEach(movie => {
  const dateStr = movie.date.split('T')[0]; // YYYY-MM-DD
  const key = `${movie.title}|${movie.year}|${dateStr}`;

  if (!exactDupeMap.has(key)) {
    exactDupeMap.set(key, movie);
  } else {
    // Duplicate found - merge data, preferring review entry
    const existing = exactDupeMap.get(key);

    // Prefer entry with review text (more complete)
    if (movie.reviewText && movie.reviewText.trim() !== '') {
      console.log(`  ✓ Merging review for: "${movie.title}" (${dateStr})`);
      exactDupeMap.set(key, {
        ...existing,
        ...movie, // Review entry takes precedence
        reviewText: movie.reviewText,
        link: movie.link // Use review link
      });
    } else {
      console.log(`  ✗ Skipping diary-only duplicate: "${movie.title}" (${dateStr})`);
    }
  }
});

const phase1Movies = Array.from(exactDupeMap.values());
console.log(`Removed ${movies.length - phase1Movies.length} exact-date duplicates\n`);

// PHASE 2: Fuzzy deduplication (±1 day for timezone issues)
console.log('Phase 2: Fuzzy deduplication (±1 day)...');
const titleGroups = new Map();

phase1Movies.forEach(movie => {
  const titleKey = `${movie.title}|${movie.year}`;
  if (!titleGroups.has(titleKey)) {
    titleGroups.set(titleKey, []);
  }
  titleGroups.get(titleKey).push(movie);
});

let fuzzyDuplicates = 0;
const dedupedMovies = [];

titleGroups.forEach((groupMovies, titleKey) => {
  groupMovies.sort((a, b) => new Date(a.date) - new Date(b.date));
  const processed = new Set();

  for (let i = 0; i < groupMovies.length; i++) {
    if (processed.has(i)) continue;

    const movie = groupMovies[i];
    let bestMatch = movie;

    for (let j = i + 1; j < groupMovies.length; j++) {
      if (processed.has(j)) continue;

      const nextMovie = groupMovies[j];
      const daysDiff = (new Date(nextMovie.date) - new Date(movie.date)) / (1000 * 60 * 60 * 24);

      if (daysDiff <= 1) {
        fuzzyDuplicates++;
        processed.add(j);

        if (nextMovie.reviewText && nextMovie.reviewText.trim() !== '') {
          console.log(`  ✓ Keeping review entry: "${nextMovie.title}" (${nextMovie.date.split('T')[0]})`);
          bestMatch = nextMovie;
        } else {
          console.log(`  ✗ Skipping near-duplicate: "${nextMovie.title}" (${nextMovie.date.split('T')[0]})`);
        }
      } else {
        break;
      }
    }

    processed.add(i);
    dedupedMovies.push(bestMatch);
  }
});

const deduplicated = dedupedMovies.sort((a, b) => new Date(b.date) - new Date(a.date));

console.log(`\n${'='.repeat(60)}`);
console.log(`📈 Deduplication Summary:`);
console.log(`${'='.repeat(60)}`);
console.log(`  Original movie count:       ${movies.length}`);
console.log(`  After exact dedup:          ${phase1Movies.length}`);
console.log(`  After fuzzy dedup:          ${deduplicated.length}`);
console.log(`  Total duplicates removed:   ${movies.length - deduplicated.length}`);
console.log(`  - Exact same-day:           ${movies.length - phase1Movies.length}`);
console.log(`  - Fuzzy (±1 day):           ${fuzzyDuplicates}`);
console.log(`  Reduction:                  ${((movies.length - deduplicated.length) / movies.length * 100).toFixed(1)}%`);
console.log(`${'='.repeat(60)}\n`);

// Show sample of kept movies
console.log(`Sample of deduplicated movies (first 5):`);
deduplicated.slice(0, 5).forEach((movie, i) => {
  console.log(`  ${i + 1}. ${movie.title} (${movie.year}) - ${movie.date.split('T')[0]}`);
  if (movie.reviewText) {
    console.log(`     📝 Has review`);
  }
});

// Write back to file
fs.writeFileSync(filePath, JSON.stringify(deduplicated, null, 2));
console.log(`\n✅ Successfully saved ${deduplicated.length} unique movies to:`);
console.log(`   ${filePath}\n`);

console.log(`📋 Next steps:`);
console.log(`  1. Build the site: npm run build`);
console.log(`  2. Test the calendar: npm start`);
console.log(`  3. Commit changes: git add src/_data/moviesHistorical.json\n`);
