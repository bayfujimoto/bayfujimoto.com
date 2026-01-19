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
