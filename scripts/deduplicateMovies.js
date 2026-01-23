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

// Group by title+year and deduplicate within each group
const dedupedMovies = [];
const titleGroups = new Map();

// Group movies by title+year
movies.forEach(movie => {
  const titleKey = `${movie.title}|${movie.year}`;
  if (!titleGroups.has(titleKey)) {
    titleGroups.set(titleKey, []);
  }
  titleGroups.get(titleKey).push(movie);
});

let duplicatesFound = 0;
let fuzzyDuplicates = 0;

// Process each group
titleGroups.forEach((groupMovies, titleKey) => {
  // Sort by date (earliest first)
  groupMovies.sort((a, b) => new Date(a.date) - new Date(b.date));

  // Track which movies we've already processed
  const processed = new Set();

  for (let i = 0; i < groupMovies.length; i++) {
    if (processed.has(i)) continue;

    const movie = groupMovies[i];
    let bestMatch = movie;

    // Look ahead for potential duplicates within 1 day
    for (let j = i + 1; j < groupMovies.length; j++) {
      if (processed.has(j)) continue;

      const nextMovie = groupMovies[j];
      const daysDiff = (new Date(nextMovie.date) - new Date(movie.date)) / (1000 * 60 * 60 * 24);

      if (daysDiff <= 1) {
        // Found a duplicate within 1 day
        duplicatesFound++;
        fuzzyDuplicates++;
        processed.add(j);

        // Choose the better entry: prefer one with review text
        if (nextMovie.reviewText && nextMovie.reviewText.trim() !== '') {
          console.log(`  ✓ Keeping review entry: "${nextMovie.title}" (${nextMovie.date.split('T')[0]}) over (${movie.date.split('T')[0]})`);
          bestMatch = nextMovie;
        } else {
          console.log(`  ✗ Skipping near-duplicate: "${nextMovie.title}" (${nextMovie.date.split('T')[0]})`);
        }
      } else {
        // Dates are more than 1 day apart, stop looking
        break;
      }
    }

    processed.add(i);
    dedupedMovies.push(bestMatch);
  }
});

// Sort by date (most recent first)
const deduplicated = dedupedMovies.sort((a, b) =>
  new Date(b.date) - new Date(a.date)
);

// Print summary
console.log(`\n${'='.repeat(60)}`);
console.log(`📈 Deduplication Summary:`);
console.log(`${'='.repeat(60)}`);
console.log(`  Original movie count:       ${movies.length}`);
console.log(`  Deduplicated movie count:   ${deduplicated.length}`);
console.log(`  Duplicates removed:         ${movies.length - deduplicated.length}`);
console.log(`  - Fuzzy (±1 day):           ${fuzzyDuplicates}`);
console.log(`  - Exact same-day:           ${duplicatesFound - fuzzyDuplicates}`);
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
