module.exports = function(eleventyConfig) {

  // Pass through assets
  eleventyConfig.addPassthroughCopy("src/assets");

  // Watch for CSS changes
  eleventyConfig.addWatchTarget("src/assets/css/");

  // Add date filter
  eleventyConfig.addFilter("date", function(date, format) {
    if (!date) return '';
    const d = new Date(date);
    const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    const month = months[d.getMonth()];
    const day = d.getDate();
    const year = d.getFullYear();
    return `${month} ${day}, ${year}`;
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
