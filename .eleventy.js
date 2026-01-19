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
