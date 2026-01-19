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
