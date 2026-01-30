// src/assets/js/cursor.js
// Custom cursor - Dual layer approach for invert + greyscale effect

(function() {
  'use strict';

  // Feature detection
  function supportsCustomCursor() {
    var isTouchDevice = (
      'ontouchstart' in window ||
      navigator.maxTouchPoints > 0 ||
      window.matchMedia('(pointer: coarse)').matches
    );
    var isMobile = window.innerWidth <= 768;
    var canHover = window.matchMedia('(hover: hover)').matches;

    return !isTouchDevice && !isMobile && canHover;
  }

  // Early exit if not supported
  if (!supportsCustomCursor()) return;

  // Interactive element selectors
  var INTERACTIVE_SELECTORS = [
    'a',
    'button',
    '.calendar-day:not(.empty)',
    '.year-selector-button',
    '.year-option',
    '.nav-logo',
    '.nav-item',
    'input',
    'textarea',
    'select',
    '[role="button"]',
    '[onclick]',
    '[tabindex]:not([tabindex="-1"])'
  ].join(', ');

  // Create both cursor layers
  var cursorDiff = document.createElement('div');
  cursorDiff.id = 'cursor-difference';
  cursorDiff.className = 'cursor-layer';
  cursorDiff.setAttribute('aria-hidden', 'true');

  var cursorSat = document.createElement('div');
  cursorSat.id = 'cursor-saturation';
  cursorSat.className = 'cursor-layer';
  cursorSat.setAttribute('aria-hidden', 'true');

  document.body.appendChild(cursorDiff);
  document.body.appendChild(cursorSat);

  // Enable custom cursor styles
  document.documentElement.classList.add('custom-cursor-enabled');

  // Mouse tracking - update both cursors
  document.addEventListener('mousemove', function(e) {
    cursorDiff.style.left = e.clientX + 'px';
    cursorDiff.style.top = e.clientY + 'px';
    cursorSat.style.left = e.clientX + 'px';
    cursorSat.style.top = e.clientY + 'px';
  }, { passive: true });

  // Hover detection with event delegation
  document.addEventListener('mouseover', function(e) {
    if (e.target.closest(INTERACTIVE_SELECTORS)) {
      cursorDiff.classList.add('is-hovering');
      cursorSat.classList.add('is-hovering');
    }
  }, { passive: true });

  document.addEventListener('mouseout', function(e) {
    if (e.target.closest(INTERACTIVE_SELECTORS)) {
      var related = e.relatedTarget ? e.relatedTarget.closest(INTERACTIVE_SELECTORS) : null;
      if (!related) {
        cursorDiff.classList.remove('is-hovering');
        cursorSat.classList.remove('is-hovering');
      }
    }
  }, { passive: true });

  // Hide when leaving window
  document.addEventListener('mouseleave', function() {
    cursorDiff.style.opacity = '0';
    cursorSat.style.opacity = '0';
  });

  document.addEventListener('mouseenter', function() {
    cursorDiff.style.opacity = '1';
    cursorSat.style.opacity = '1';
  });

  // Hide during text selection
  document.addEventListener('selectstart', function() {
    cursorDiff.classList.add('is-selecting');
    cursorSat.classList.add('is-selecting');
  });

  document.addEventListener('mouseup', function() {
    setTimeout(function() {
      cursorDiff.classList.remove('is-selecting');
      cursorSat.classList.remove('is-selecting');
    }, 100);
  });

  // Handle window resize
  var resizeTimeout;
  window.addEventListener('resize', function() {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(function() {
      if (window.innerWidth <= 768) {
        cursorDiff.style.display = 'none';
        cursorSat.style.display = 'none';
        document.documentElement.classList.remove('custom-cursor-enabled');
      } else {
        cursorDiff.style.display = '';
        cursorSat.style.display = '';
        document.documentElement.classList.add('custom-cursor-enabled');
      }
    }, 100);
  });

})();
