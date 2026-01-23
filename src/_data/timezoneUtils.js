// Timezone utilities for Central Time conversion
const CENTRAL_TIMEZONE = 'America/Chicago';

/**
 * Get date components in Central Time
 * @param {Date} date - JavaScript Date object
 * @returns {Object} - { year, month (0-11), day, dateString (YYYY-MM-DD) }
 */
function getDateInCentralTime(date) {
  // Convert string dates to Date objects
  const dateObj = date instanceof Date ? date : new Date(date);

  // Validate date
  if (isNaN(dateObj.getTime())) {
    throw new Error(`Invalid date: ${date}`);
  }

  // Use Intl.DateTimeFormat to get date parts in Central Time
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: CENTRAL_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });

  const parts = formatter.formatToParts(dateObj);
  const year = parseInt(parts.find(p => p.type === 'year').value);
  const month = parseInt(parts.find(p => p.type === 'month').value) - 1; // 0-indexed
  const day = parseInt(parts.find(p => p.type === 'day').value);

  return {
    year,
    month,
    day,
    dateString: `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  };
}

/**
 * Format date as YYYY-MM-DD in Central Time
 */
function formatDateCentral(date) {
  return getDateInCentralTime(date).dateString;
}

module.exports = {
  getDateInCentralTime,
  formatDateCentral,
  CENTRAL_TIMEZONE
};
