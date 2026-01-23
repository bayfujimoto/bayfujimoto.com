#!/usr/bin/env node

/**
 * Letterboxd Export Folder Parser
 *
 * Parses a complete Letterboxd data export folder and extracts comprehensive movie metadata.
 *
 * Usage:
 *   node scripts/parseLetterboxdExport.js path/to/letterboxd-export-folder
 *
 * What it extracts:
 *   - All watched films with dates
 *   - Star ratings (0-5 scale)
 *   - Review links (constructed from Letterboxd URIs)
 *   - Rewatch status
 *   - Tags
 *   - Review text (if reviews.csv exists)
 *
 * Output:
 *   Creates src/_data/moviesHistorical.json with complete movie history
 *
 * How to get your Letterboxd export:
 *   1. Go to https://letterboxd.com/settings/data/
 *   2. Request export → Wait for email → Download ZIP
 *   3. Unzip into project directory (e.g., letterboxd-export/)
 *   4. Run this script: node scripts/parseLetterboxdExport.js letterboxd-export
 *   5. Delete the export folder after processing
 */

const fs = require('fs');
const csv = require('csv-parser');
const path = require('path');

// Get export folder path from command line argument
const exportFolder = process.argv[2];

if (!exportFolder) {
  console.error('Error: No export folder path provided');
  console.error('Usage: node scripts/parseLetterboxdExport.js path/to/letterboxd-export-folder');
  console.error('\nExample:');
  console.error('  node scripts/parseLetterboxdExport.js letterboxd-export');
  console.error('  node scripts/parseLetterboxdExport.js ~/Downloads/letterboxd-bayf-2024-01-15/');
  process.exit(1);
}

if (!fs.existsSync(exportFolder)) {
  console.error(`Error: Export folder not found: ${exportFolder}`);
  console.error('\nMake sure you:');
  console.error('  1. Downloaded your Letterboxd export from https://letterboxd.com/settings/data/');
  console.error('  2. Unzipped the export file');
  console.error('  3. Provided the correct path to the unzipped folder');
  process.exit(1);
}

console.log(`Parsing Letterboxd export from: ${exportFolder}\n`);

// Map to store all movies, keyed by Letterboxd URI (unique identifier)
const movieMap = new Map();

// Get username from environment variable or use default
const username = process.env.LETTERBOXD_USERNAME || 'bayf';

// Helper function: Construct review link from Letterboxd URI
function constructReviewLink(uri) {
  if (!uri) return '';

  // Letterboxd URI is like: https://letterboxd.com/film/movie-title/
  // Review link is: https://letterboxd.com/[username]/film/movie-title/
  return uri.replace(
    'https://letterboxd.com/film/',
    `https://letterboxd.com/${username}/film/`
  );
}

// Helper function: Parse tags string to array
function parseTags(tagsString) {
  if (!tagsString || tagsString.trim() === '') return [];
  return tagsString.split(',').map(tag => tag.trim()).filter(tag => tag.length > 0);
}

// Helper function: Parse date with timezone handling
function parseDate(dateString) {
  if (!dateString) return null;
  // Add noon time to avoid timezone issues (matching existing RSS behavior)
  return new Date(dateString + 'T12:00:00').toISOString();
}

// Step 1: Parse diary.csv (primary source - most complete data)
async function parseDiary() {
  const filePath = path.join(exportFolder, 'diary.csv');

  if (!fs.existsSync(filePath)) {
    console.warn('⚠️  diary.csv not found in export folder, skipping');
    return;
  }

  return new Promise((resolve, reject) => {
    let rowCount = 0;
    let skippedCount = 0;

    fs.createReadStream(filePath)
      .pipe(csv())
      .on('data', (row) => {
        rowCount++;

        const uri = row['Letterboxd URI'];
        if (!uri) {
          skippedCount++;
          return;
        }

        const watchedDate = row['Watched Date'] || row['Date'];
        if (!watchedDate) {
          skippedCount++;
          return;
        }

        const title = row['Name']?.trim();
        if (!title) {
          skippedCount++;
          return;
        }

        const movie = {
          title: title,
          year: row['Year']?.trim() || '',
          rating: parseFloat(row['Rating']) || 0,
          link: uri,
          reviewLink: constructReviewLink(uri),
          date: parseDate(watchedDate),
          image: '',
          poster: '',
          backdrop: '',
          description: '',
          rewatch: row['Rewatch'] === 'Yes',
          tags: parseTags(row['Tags']),
          reviewText: ''
        };

        movieMap.set(uri, movie);
      })
      .on('end', () => {
        console.log(`✓ Parsed diary.csv: ${movieMap.size} films`);
        if (skippedCount > 0) {
          console.log(`  Skipped ${skippedCount} rows (missing required fields)`);
        }
        resolve();
      })
      .on('error', (error) => {
        console.error('Error parsing diary.csv:', error.message);
        reject(error);
      });
  });
}

// Step 2: Parse reviews.csv (add review text if available)
async function parseReviews() {
  const filePath = path.join(exportFolder, 'reviews.csv');

  if (!fs.existsSync(filePath)) {
    console.warn('⚠️  reviews.csv not found in export folder, skipping');
    return;
  }

  return new Promise((resolve, reject) => {
    let reviewsAdded = 0;

    fs.createReadStream(filePath)
      .pipe(csv())
      .on('data', (row) => {
        const uri = row['Letterboxd URI'];
        if (!uri) return;

        const reviewText = row['Review'] || '';

        // Update existing movie or create new entry
        if (movieMap.has(uri)) {
          const movie = movieMap.get(uri);
          movie.reviewText = reviewText;
          reviewsAdded++;
        } else {
          // Film was reviewed but not in diary (rare case)
          const watchedDate = row['Watched Date'] || row['Date'];
          if (!watchedDate) return;

          const title = row['Name']?.trim();
          if (!title) return;

          const movie = {
            title: title,
            year: row['Year']?.trim() || '',
            rating: parseFloat(row['Rating']) || 0,
            link: uri,
            reviewLink: constructReviewLink(uri),
            date: parseDate(watchedDate),
            image: '',
            poster: '',
            backdrop: '',
            description: '',
            rewatch: row['Rewatch'] === 'Yes',
            tags: parseTags(row['Tags']),
            reviewText: reviewText
          };

          movieMap.set(uri, movie);
          reviewsAdded++;
        }
      })
      .on('end', () => {
        console.log(`✓ Parsed reviews.csv: ${reviewsAdded} reviews added`);
        resolve();
      })
      .on('error', (error) => {
        console.error('Error parsing reviews.csv:', error.message);
        reject(error);
      });
  });
}

// Step 3: Parse ratings.csv (fallback for films not in diary)
async function parseRatings() {
  const filePath = path.join(exportFolder, 'ratings.csv');

  if (!fs.existsSync(filePath)) {
    console.warn('⚠️  ratings.csv not found in export folder, skipping');
    return;
  }

  return new Promise((resolve, reject) => {
    let ratingsAdded = 0;

    fs.createReadStream(filePath)
      .pipe(csv())
      .on('data', (row) => {
        const uri = row['Letterboxd URI'];
        if (!uri || movieMap.has(uri)) return; // Skip if already have this film

        const date = row['Date'];
        if (!date) return;

        const title = row['Name']?.trim();
        if (!title) return;

        const movie = {
          title: title,
          year: row['Year']?.trim() || '',
          rating: parseFloat(row['Rating']) || 0,
          link: uri,
          reviewLink: constructReviewLink(uri),
          date: parseDate(date),
          image: '',
          poster: '',
          backdrop: '',
          description: '',
          rewatch: false,
          tags: [],
          reviewText: ''
        };

        movieMap.set(uri, movie);
        ratingsAdded++;
      })
      .on('end', () => {
        console.log(`✓ Parsed ratings.csv: ${ratingsAdded} additional films added`);
        resolve();
      })
      .on('error', (error) => {
        console.error('Error parsing ratings.csv:', error.message);
        reject(error);
      });
  });
}

// Main execution
async function main() {
  try {
    // Parse all CSV files in sequence
    await parseDiary();
    await parseReviews();
    await parseRatings();

    console.log(`\n📊 Total films parsed: ${movieMap.size}`);

    if (movieMap.size === 0) {
      console.error('\n❌ Error: No movies found in export folder');
      console.error('Make sure the folder contains at least one of: diary.csv, ratings.csv, or watched.csv');
      process.exit(1);
    }

    // Convert Map to array and sort by date descending (most recent first)
    const movies = Array.from(movieMap.values()).sort((a, b) =>
      new Date(b.date) - new Date(a.date)
    );

    // Show date range
    const oldestDate = new Date(movies[movies.length - 1].date);
    const newestDate = new Date(movies[0].date);
    console.log(`📅 Date range: ${oldestDate.toISOString().split('T')[0]} to ${newestDate.toISOString().split('T')[0]}`);

    // Count movies with reviews
    const moviesWithReviews = movies.filter(m => m.reviewText && m.reviewText.length > 0).length;
    if (moviesWithReviews > 0) {
      console.log(`✍️  Movies with reviews: ${moviesWithReviews}`);
    }

    // Count movies with tags
    const moviesWithTags = movies.filter(m => m.tags && m.tags.length > 0).length;
    if (moviesWithTags > 0) {
      console.log(`🏷️  Movies with tags: ${moviesWithTags}`);
    }

    // Count rewatches
    const rewatchCount = movies.filter(m => m.rewatch).length;
    if (rewatchCount > 0) {
      console.log(`🔁 Rewatches: ${rewatchCount}`);
    }

    // Write to JSON file
    const outputPath = path.join(__dirname, '..', 'src', '_data', 'moviesHistorical.json');
    fs.writeFileSync(outputPath, JSON.stringify(movies, null, 2));

    console.log(`\n✅ Success! Created ${outputPath}`);
    console.log('\n📋 Next steps:');
    console.log(`  1. Delete export folder: rm -rf ${exportFolder}`);
    console.log('  2. Commit moviesHistorical.json: git add src/_data/moviesHistorical.json');
    console.log('  3. Build the site: npm run build');
    console.log('  4. Test the calendar: npm start');

  } catch (error) {
    console.error('\n❌ Error during parsing:', error.message);
    process.exit(1);
  }
}

main();
