// Build metadata and project statistics
const fs = require('fs');
const path = require('path');

/**
 * Recursively count files and lines in a directory
 * Includes: .js, .njk, .md, .css files
 * Excludes: node_modules, _site, .git, and specific data files
 */
function countProjectStats() {
  const srcDir = path.join(__dirname, '..');
  let totalFiles = 0;
  let totalLines = 0;

  // File types to include
  const includeExtensions = ['.js', '.njk', '.md', '.css'];

  // Files/dirs to exclude
  const excludePatterns = ['node_modules', '_site', '.git', 'moviesHistorical.json'];

  /**
   * Recursively traverse directory
   */
  function traverse(dir) {
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        const relativePath = path.relative(srcDir, fullPath);

        // Skip excluded patterns
        if (excludePatterns.some(pattern => relativePath.includes(pattern))) {
          continue;
        }

        if (entry.isDirectory()) {
          traverse(fullPath);
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name);

          // Check if file extension matches
          if (includeExtensions.includes(ext)) {
            totalFiles++;

            try {
              // Count lines in file
              const content = fs.readFileSync(fullPath, 'utf-8');
              const lines = content.split('\n').length;
              totalLines += lines;
            } catch (err) {
              console.warn(`Could not read ${relativePath}:`, err.message);
            }
          }
        }
      }
    } catch (err) {
      console.warn(`Error traversing ${dir}:`, err.message);
    }
  }

  traverse(srcDir);

  return {
    files: totalFiles,
    lines: totalLines
  };
}

/**
 * Format time in Central Time
 */
function formatTimeInCentralTime(date) {
  return date.toLocaleTimeString('en-US', {
    timeZone: 'America/Chicago',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  });
}

/**
 * Format date in Central Time as "Month Day, Year"
 */
function formatDateInCentralTime(date) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
  return formatter.format(date);
}

module.exports = function() {
  const buildTime = new Date();

  try {
    const stats = countProjectStats();

    return {
      timestamp: buildTime,
      dateFormatted: formatDateInCentralTime(buildTime),
      timeFormatted: formatTimeInCentralTime(buildTime),
      linesOfCode: stats.lines,
      totalFiles: stats.files
    };
  } catch (error) {
    console.error('Error calculating build stats:', error);

    // Return safe defaults
    return {
      timestamp: buildTime,
      dateFormatted: formatDateInCentralTime(buildTime),
      timeFormatted: formatTimeInCentralTime(buildTime),
      linesOfCode: 0,
      totalFiles: 0
    };
  }
};
