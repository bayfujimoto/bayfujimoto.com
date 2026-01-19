// src/_data/moviesCalendar.js
const fs = require('fs');
const path = require('path');
const { getDateInCentralTime, formatDateCentral } = require('./timezoneUtils');

module.exports = async function() {
  // Load movies data
  const movies = require('./movies.js')();
  const moviesData = await movies;

  // Load custom quotes (with fallback if file doesn't exist)
  let customQuotes = {};
  try {
    const customQuotesPath = path.join(__dirname, 'customQuotes.json');
    if (fs.existsSync(customQuotesPath)) {
      customQuotes = require('./customQuotes.json');
    }
  } catch (error) {
    console.warn('No custom quotes file found');
  }

  // Helper: Format date as YYYY-MM-DD in Central Time
  function formatDate(date) {
    return formatDateCentral(date);
  }

  // Helper: Get day of week (0 = Monday, 6 = Sunday) in Central Time
  function getDayOfWeek(dateStr) {
    const date = new Date(dateStr + 'T12:00:00');
    const { year, month, day } = getDateInCentralTime(date);
    const centralDate = new Date(year, month, day);
    const dayOfWeek = centralDate.getDay();
    return dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  }

  // Helper: Add days to a date string in Central Time
  function addDays(dateStr, days) {
    const date = new Date(dateStr + 'T12:00:00');
    date.setDate(date.getDate() + days);
    return formatDateCentral(date);
  }

  // Helper: Get month name
  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  // Group movies by date
  const moviesByDate = {};
  const yearsSet = new Set();

  moviesData.forEach(movie => {
    const dateStr = formatDate(movie.date);
    if (!moviesByDate[dateStr]) {
      moviesByDate[dateStr] = [];
    }
    moviesByDate[dateStr].push(movie);
    yearsSet.add(getDateInCentralTime(movie.date).year);
  });

  // Sort years descending (most recent first)
  const years = Array.from(yearsSet).sort((a, b) => b - a);

  // Build calendar data for each year
  const calendarsByYear = {};

  years.forEach(year => {
    const months = [];

    for (let monthNum = 0; monthNum < 12; monthNum++) {
      // Get first day of month as YYYY-MM-DD string in Central Time
      const firstDayStr = `${year}-${String(monthNum + 1).padStart(2, '0')}-01`;

      // Get day of week for first day (0 = Monday, 6 = Sunday)
      const firstDayOfWeek = getDayOfWeek(firstDayStr);

      // Calculate start date (may be in previous month)
      let currentDateStr = addDays(firstDayStr, -firstDayOfWeek);

      // Build 6 weeks (42 days) for the month
      const weeks = [];

      for (let week = 0; week < 6; week++) {
        const weekDays = [];

        for (let dayOfWeek = 0; dayOfWeek < 7; dayOfWeek++) {
          // Parse the date string to get components in Central Time
          const dateObj = new Date(currentDateStr + 'T12:00:00');
          const { year: dateYear, month: dateMonth, day: dateDay } = getDateInCentralTime(dateObj);

          const isCurrentMonth = dateMonth === monthNum && dateYear === year;

          weekDays.push({
            date: currentDateStr,
            dayNum: dateDay,
            dayOfWeek: dayOfWeek,
            movies: moviesByDate[currentDateStr] || [],
            quote: customQuotes[currentDateStr] || null,
            isCurrentMonth: isCurrentMonth
          });

          // Move to next day
          currentDateStr = addDays(currentDateStr, 1);
        }

        weeks.push(weekDays);
      }

      months.push({
        name: monthNames[monthNum],
        monthNum: monthNum,
        weeks: weeks
      });
    }

    calendarsByYear[year] = {
      months: months
    };
  });

  return {
    years: years,
    moviesByDate: moviesByDate,
    quotesByDate: customQuotes,
    calendarsByYear: calendarsByYear
  };
};
