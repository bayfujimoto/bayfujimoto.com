require('dotenv').config();
const { getDateInCentralTime } = require('./src/_data/timezoneUtils');

module.exports = function(eleventyConfig) {

  // Pass through assets
  eleventyConfig.addPassthroughCopy("src/assets");

  // Watch for CSS changes
  eleventyConfig.addWatchTarget("src/assets/css/");

  // Add date filter (Central Time)
  eleventyConfig.addFilter("date", function(date, format) {
    if (!date) return '';
    const d = new Date(date);
    const { year, month, day } = getDateInCentralTime(d);
    const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    const monthName = months[month]; // month is already 0-indexed from helper
    return `${monthName} ${day}, ${year}`;
  });

  // Add number formatting filter (thousands separator)
  eleventyConfig.addFilter("number_format", function(num) {
    return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  });

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
