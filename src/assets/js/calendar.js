// Calendar Year Selector and Month Tracking
// Progressive enhancement for year switching and scroll-based month updates

(function() {
  'use strict';

  // Only enhance if JS available
  if (!('classList' in document.documentElement)) return;

  const yearSelector = document.getElementById('year-selector');
  const currentMonthDisplay = document.getElementById('current-month');
  const years = document.querySelectorAll('.calendar-year');

  if (!yearSelector || !currentMonthDisplay || years.length === 0) return;

  // Show specific year
  function showYear(year) {
    // Update year selector
    yearSelector.value = year;

    // Update year containers
    years.forEach(y => y.classList.remove('active'));
    const activeYear = document.getElementById(`year-${year}`);
    if (activeYear) {
      activeYear.classList.add('active');

      // Update current month display for the first visible month
      updateCurrentMonth();
    }
  }

  // Year selector change handler
  yearSelector.addEventListener('change', (e) => {
    const selectedYear = e.target.value;
    showYear(selectedYear);

    // Update URL without page jump
    history.pushState(null, '', `#year-${selectedYear}`);
  });

  // Handle browser back/forward
  window.addEventListener('popstate', () => {
    const hash = window.location.hash.replace('#year-', '');
    if (hash) {
      showYear(hash);
    }
  });

  // Initialize from hash on load
  const initialHash = window.location.hash.replace('#year-', '');
  if (initialHash) {
    showYear(initialHash);
  }

  // Update current month based on scroll position
  function updateCurrentMonth() {
    const activeYear = document.querySelector('.calendar-year.active');
    if (!activeYear) return;

    const months = activeYear.querySelectorAll('.calendar-month');
    if (months.length === 0) return;

    // Find the month that's currently most visible in viewport
    let mostVisibleMonth = null;
    let maxVisibility = 0;

    months.forEach(month => {
      const rect = month.getBoundingClientRect();
      const monthHeight = rect.height;

      // Calculate how much of the month is visible
      const viewportHeight = window.innerHeight;
      const visibleTop = Math.max(0, rect.top);
      const visibleBottom = Math.min(viewportHeight, rect.bottom);
      const visibleHeight = Math.max(0, visibleBottom - visibleTop);
      const visibilityRatio = visibleHeight / monthHeight;

      if (visibilityRatio > maxVisibility) {
        maxVisibility = visibilityRatio;
        mostVisibleMonth = month;
      }
    });

    // Extract month name from the data attribute
    if (mostVisibleMonth) {
      const monthName = mostVisibleMonth.getAttribute('data-month-name');
      if (monthName) {
        currentMonthDisplay.textContent = monthName;
      }
    }
  }

  // Throttle scroll events for performance
  let scrollTimeout;
  window.addEventListener('scroll', () => {
    if (scrollTimeout) {
      clearTimeout(scrollTimeout);
    }
    scrollTimeout = setTimeout(updateCurrentMonth, 100);
  }, { passive: true });

  // Initial month update
  updateCurrentMonth();
})();
