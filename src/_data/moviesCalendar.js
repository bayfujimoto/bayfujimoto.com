// src/_data/moviesCalendar.js
const fs = require('fs');
const path = require('path');

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

  // Helper: Format date as YYYY-MM-DD
  function formatDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  // Helper: Get day of week (0 = Monday, 6 = Sunday)
  function getDayOfWeek(date) {
    const day = date.getDay();
    return day === 0 ? 6 : day - 1; // Convert Sunday from 0 to 6
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
    yearsSet.add(movie.date.getFullYear());
  });

  // Sort years descending (most recent first)
  const years = Array.from(yearsSet).sort((a, b) => b - a);

  // Build calendar data for each year
  const calendarsByYear = {};

  years.forEach(year => {
    const months = [];

    for (let monthNum = 0; monthNum < 12; monthNum++) {
      const firstDayOfMonth = new Date(year, monthNum, 1);
      const lastDayOfMonth = new Date(year, monthNum + 1, 0);

      // Get day of week for first day (0 = Monday)
      const firstDayOfWeek = getDayOfWeek(firstDayOfMonth);

      // Calculate start date (may be in previous month)
      const startDate = new Date(firstDayOfMonth);
      startDate.setDate(startDate.getDate() - firstDayOfWeek);

      // Build 6 weeks (42 days) for the month
      const weeks = [];
      let currentDate = new Date(startDate);

      for (let week = 0; week < 6; week++) {
        const weekDays = [];

        for (let dayOfWeek = 0; dayOfWeek < 7; dayOfWeek++) {
          const dateStr = formatDate(currentDate);
          const isCurrentMonth = currentDate.getMonth() === monthNum;

          weekDays.push({
            date: dateStr,
            dayNum: currentDate.getDate(),
            dayOfWeek: dayOfWeek,
            movies: moviesByDate[dateStr] || [],
            quote: customQuotes[dateStr] || null,
            isCurrentMonth: isCurrentMonth
          });

          currentDate.setDate(currentDate.getDate() + 1);
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
