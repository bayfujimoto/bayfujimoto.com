// Calendar Year Tab Functionality
// Progressive enhancement for year tab switching

(function() {
  'use strict';

  // Only enhance if JS available
  if (!('classList' in document.documentElement)) return;

  const tabs = document.querySelectorAll('.year-tab');
  const years = document.querySelectorAll('.calendar-year');

  if (tabs.length === 0 || years.length === 0) return;

  // Show specific year
  function showYear(year) {
    // Update tabs
    tabs.forEach(t => t.classList.remove('active'));
    const activeTab = document.querySelector(`[data-year="${year}"]`);
    if (activeTab) {
      activeTab.classList.add('active');
    }

    // Update year containers
    years.forEach(y => y.classList.remove('active'));
    const activeYear = document.getElementById(`year-${year}`);
    if (activeYear) {
      activeYear.classList.add('active');
    }
  }

  // Tab click handler
  tabs.forEach(tab => {
    tab.addEventListener('click', (e) => {
      e.preventDefault();
      const targetYear = tab.dataset.year;
      showYear(targetYear);

      // Update URL without page jump
      history.pushState(null, '', `#year-${targetYear}`);
    });
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
})();
