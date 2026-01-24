// Calendar Year Selector and Month Tracking
// Progressive enhancement for year switching and scroll-based month updates

(function() {
  'use strict';

  // Only enhance if JS available
  if (!('classList' in document.documentElement)) return;

  const yearButton = document.getElementById('year-selector-button');
  const yearDropdown = document.getElementById('year-selector-dropdown');
  const selectedYearSpan = document.getElementById('selected-year');
  const currentMonthDisplay = document.getElementById('current-month');
  const years = document.querySelectorAll('.calendar-year');
  const yearOptions = document.querySelectorAll('.year-option');

  if (!yearButton || !yearDropdown || !selectedYearSpan || !currentMonthDisplay || years.length === 0) return;

  // Toggle dropdown visibility
  function toggleDropdown() {
    const isExpanded = yearButton.getAttribute('aria-expanded') === 'true';

    if (isExpanded) {
      closeDropdown();
    } else {
      openDropdown();
    }
  }

  function openDropdown() {
    yearButton.setAttribute('aria-expanded', 'true');
    yearDropdown.hidden = false;

    // Focus the active year option
    const activeOption = yearDropdown.querySelector('.year-option.active');
    if (activeOption) {
      activeOption.focus();
    }
  }

  function closeDropdown() {
    yearButton.setAttribute('aria-expanded', 'false');
    yearDropdown.hidden = true;
  }

  // Show specific year
  function showYear(year) {
    // Update selected year display
    selectedYearSpan.textContent = year;

    // Update active state on year options
    yearOptions.forEach(option => {
      const optionYear = option.getAttribute('data-year');
      if (optionYear === year) {
        option.classList.add('active');
        option.setAttribute('tabindex', '0');
      } else {
        option.classList.remove('active');
        option.setAttribute('tabindex', '-1');
      }
    });

    // Update year containers
    years.forEach(y => y.classList.remove('active'));
    const activeYear = document.getElementById(`year-${year}`);
    if (activeYear) {
      activeYear.classList.add('active');

      // Update current month display for the first visible month
      updateCurrentMonth();
    }
  }

  // Handle year selection
  function selectYear(year) {
    showYear(year);
    closeDropdown();

    // Update URL without page jump
    history.pushState(null, '', `#year-${year}`);
  }

  // Button click handler
  yearButton.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleDropdown();
  });

  // Year option click handlers
  yearOptions.forEach(option => {
    option.addEventListener('click', (e) => {
      const selectedYear = e.target.getAttribute('data-year');
      selectYear(selectedYear);
    });
  });

  // Close dropdown when clicking outside
  document.addEventListener('click', (e) => {
    if (!yearButton.contains(e.target) && !yearDropdown.contains(e.target)) {
      closeDropdown();
    }
  });

  // Keyboard navigation
  yearButton.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      toggleDropdown();
    } else if (e.key === 'Escape') {
      closeDropdown();
    }
  });

  // Keyboard navigation within dropdown
  yearDropdown.addEventListener('keydown', (e) => {
    const currentOption = document.activeElement;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const nextOption = currentOption.nextElementSibling;
      if (nextOption && nextOption.classList.contains('year-option')) {
        nextOption.focus();
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const prevOption = currentOption.previousElementSibling;
      if (prevOption && prevOption.classList.contains('year-option')) {
        prevOption.focus();
      }
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (currentOption.classList.contains('year-option')) {
        const selectedYear = currentOption.getAttribute('data-year');
        selectYear(selectedYear);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      closeDropdown();
      yearButton.focus();
    }
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

  // Update month label immediately on scroll
  window.addEventListener('scroll', () => {
    updateCurrentMonth();
  }, { passive: true });

  // Initial month update
  updateCurrentMonth();
})();
