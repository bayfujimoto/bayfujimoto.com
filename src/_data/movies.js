// src/_data/movies.js
const Parser = require('rss-parser');
// Configure parser to extract Letterboxd custom fields
const parser = new Parser({
  customFields: {
    item: [
      ['letterboxd:watchedDate', 'watchedDate'],
      ['letterboxd:filmTitle', 'filmTitle'],
      ['letterboxd:filmYear', 'filmYear'],
      ['letterboxd:memberRating', 'memberRating'],
      ['letterboxd:rewatch', 'rewatch']
    ]
  }
});
const EleventyFetch = require("@11ty/eleventy-fetch");
const fs = require('fs');
const path = require('path');

// Load custom backdrops (with fallback if file doesn't exist)
let customBackdrops = {};
try {
  const customBackdropsPath = path.join(__dirname, 'customBackdrops.json');
  if (fs.existsSync(customBackdropsPath)) {
    customBackdrops = require('./customBackdrops.json');
  }
} catch (error) {
  console.warn('No custom backdrops file found, using automatic backdrops only');
}

// Search TMDb by title to find backdrop image
async function fetchTMDbBackdrop(title, year) {
  const apiKey = process.env.TMDB_API_KEY;

  if (!apiKey) {
    console.warn('TMDb API key not found, skipping backdrop fetch');
    return { backdrop_path: null };
  }

  try {
    // Try searching with year parameter first (more accurate)
    if (year) {
      const searchResponse = await EleventyFetch(
        `https://api.themoviedb.org/3/search/movie?api_key=${apiKey}&query=${encodeURIComponent(title)}&year=${year}`,
        {
          duration: "30d", // Cache for 30 days
          type: "json"
        }
      );

      if (searchResponse.results && searchResponse.results.length > 0) {
        const movie = searchResponse.results[0];
        return { backdrop_path: movie.backdrop_path || null };
      }
    }

    // Fallback: search without year
    const searchResponse = await EleventyFetch(
      `https://api.themoviedb.org/3/search/movie?api_key=${apiKey}&query=${encodeURIComponent(title)}`,
      {
        duration: "30d", // Cache for 30 days
        type: "json"
      }
    );

    // Get the first result
    if (searchResponse.results && searchResponse.results.length > 0) {
      const movie = searchResponse.results[0];
      return { backdrop_path: movie.backdrop_path || null };
    }

    return { backdrop_path: null };
  } catch (error) {
    console.error(`Error fetching TMDb data for movie "${title}":`, error.message);
    return { backdrop_path: null };
  }
}

module.exports = async function() {
  // HYBRID DATA SOURCE: Merges historical movie data with RSS feed
  // - Historical data: Full movie history from Letterboxd CSV export (moviesHistorical.json)
  // - RSS data: Last ~60 movies from Letterboxd RSS (auto-updates daily)
  // - RSS entries take precedence over historical entries (for updated ratings/reviews)

  // Load historical movie data if available
  let historicalMovies = [];
  try {
    const historicalPath = path.join(__dirname, 'moviesHistorical.json');
    if (fs.existsSync(historicalPath)) {
      const rawHistorical = JSON.parse(fs.readFileSync(historicalPath, 'utf-8'));
      console.log(`Loaded ${rawHistorical.length} movies from historical data`);

      // Enrich historical movies with TMDb backdrops if they don't have images
      console.log(`Enriching historical movies with TMDb backdrops...`);
      historicalMovies = await Promise.all(rawHistorical.map(async (movie) => {
        // Skip if already has an image or backdrop
        if ((movie.image && movie.image !== '') || (movie.backdrop && movie.backdrop !== '')) {
          return movie;
        }

        // Fetch TMDb backdrop
        const tmdbData = await fetchTMDbBackdrop(movie.title, movie.year);
        if (tmdbData && tmdbData.backdrop_path) {
          const backdropUrl = `https://image.tmdb.org/t/p/w1280${tmdbData.backdrop_path}`;
          return {
            ...movie,
            backdrop: backdropUrl,
            image: backdropUrl
          };
        }

        return movie;
      }));

      const enrichedCount = historicalMovies.filter(m => m.backdrop && m.backdrop !== '').length;
      console.log(`Enriched ${enrichedCount} historical movies with backdrops`);
    } else {
      console.log('No historical movie data found - using RSS only');
      console.log('To add full movie history: Export from Letterboxd and run scripts/parseLetterboxdExport.js');
    }
  } catch (error) {
    console.warn('Error loading historical movie data:', error.message);
  }

  const username = process.env.LETTERBOXD_USERNAME || "bayf";
  const url = `https://letterboxd.com/${username}/rss/`;

  try {
    // Fetch with caching (1 day cache)
    const response = await EleventyFetch(url, {
      duration: "1d",
      type: "text"
    });

    const feed = await parser.parseString(response);

    // Process all movies from the RSS feed
    const rssMovies = await Promise.all(feed.items
      .filter(item => item.link && item.link.includes('/film/')) // Only include actual film watches, not lists
      .map(async (item) => {
        // Extract data from content
        const content = item.content || item['content:encoded'] || '';

        // Extract rating (stars)
        const ratingMatch = content.match(/★/g);
        const rating = ratingMatch ? ratingMatch.length : 0;

        // Extract year from title (format: "Film Title, Year - ★★★")
        const yearMatch = item.title.match(/,\s*(\d{4})/);
        const year = yearMatch ? yearMatch[1] : '';

        // Extract poster image (fallback)
        const imgMatch = content.match(/<img[^>]+src="([^">]+)"/);
        const poster = imgMatch ? imgMatch[1] : '';

        // Clean title (remove year and rating from end)
        const title = item.title.replace(/,\s*\d{4}.*$/, '').trim();

        // Extract Letterboxd film slug from URL
        const filmSlug = item.link.split('/film/')[1]?.replace(/\/$/, '') || '';

        // Check for custom backdrop first
        let backdropUrl = '';
        if (filmSlug && customBackdrops[filmSlug]) {
          backdropUrl = customBackdrops[filmSlug];
          console.log(`Using custom backdrop for: ${title}`);
        } else {
          // Fallback to TMDb
          const tmdbData = await fetchTMDbBackdrop(title, year);
          if (tmdbData && tmdbData.backdrop_path) {
            backdropUrl = `https://image.tmdb.org/t/p/w1280${tmdbData.backdrop_path}`;
          }
        }

        // Use backdrop if available, otherwise use poster
        const imageUrl = backdropUrl || poster;

        // Use watchedDate from Letterboxd (YYYY-MM-DD format) instead of pubDate
        // watchedDate is the actual date you watched the movie
        // pubDate is when you logged/reviewed it (can be different timezone)
        const watchedDate = item.watchedDate
          ? new Date(item.watchedDate + 'T12:00:00')  // Parse as noon to avoid timezone issues
          : new Date(item.pubDate);  // Fallback to pubDate if watchedDate not available

        return {
          title: title,
          year: year,
          rating: rating,
          link: item.link,
          date: watchedDate,
          image: imageUrl,
          poster: poster,
          backdrop: backdropUrl,
          description: content.replace(/<[^>]*>/g, '').substring(0, 200)
        };
      }));

    console.log(`Fetched ${rssMovies.length} movies from RSS feed`);

    // MERGE LOGIC: Combine historical and RSS data
    // Use a Map to deduplicate by Letterboxd link (unique identifier)
    // RSS entries override historical entries (more recent/updated data)
    const movieMap = new Map();

    // First, add all historical movies
    historicalMovies.forEach(movie => {
      const key = movie.link || `${movie.title}-${movie.date}`;
      movieMap.set(key, movie);
    });

    // Then, add/override with RSS movies (takes precedence)
    rssMovies.forEach(movie => {
      const key = movie.link || `${movie.title}-${movie.date}`;
      movieMap.set(key, movie);
    });

    // Convert Map to array and sort by date descending (most recent first)
    const mergedMovies = Array.from(movieMap.values()).sort((a, b) =>
      new Date(b.date) - new Date(a.date)
    );

    console.log(`Total movies after merge: ${mergedMovies.length}`);

    // Show all movies from merged data
    // To limit the number of movies displayed (for faster builds), uncomment and adjust the line below:
    // return mergedMovies.slice(0, 600);  // Replace 600 with desired limit (e.g., 300 ≈ 2.5 years, 600 ≈ 5 years)
    return mergedMovies;

  } catch (error) {
    console.error('Error fetching Letterboxd RSS:', error);
    return []; // Return empty array on error
  }
};
