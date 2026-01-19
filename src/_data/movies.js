// src/_data/movies.js
const Parser = require('rss-parser');
const parser = new Parser();
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
  const username = process.env.LETTERBOXD_USERNAME || "bayf";
  const url = `https://letterboxd.com/${username}/rss/`;

  try {
    // Fetch with caching (1 day cache)
    const response = await EleventyFetch(url, {
      duration: "1d",
      type: "text"
    });

    const feed = await parser.parseString(response);

    return Promise.all(feed.items.map(async (item) => {
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

      return {
        title: title,
        year: year,
        rating: rating,
        link: item.link,
        date: new Date(item.pubDate),
        image: imageUrl,
        poster: poster,
        backdrop: backdropUrl,
        description: content.replace(/<[^>]*>/g, '').substring(0, 200)
      };
    })).then(movies => movies.slice(0, 100)); // Latest 100 films

  } catch (error) {
    console.error('Error fetching Letterboxd RSS:', error);
    return []; // Return empty array on error
  }
};
