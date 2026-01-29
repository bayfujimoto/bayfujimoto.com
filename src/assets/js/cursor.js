// Custom Cursor with Inversion and Link Hover Effects
// Progressive enhancement - only activates for mouse users

(function() {
  'use strict';

  // Feature detection - only run on mouse-enabled devices
  console.log('Custom cursor script loaded');
  const mediaQuery = window.matchMedia('(hover: hover) and (pointer: fine)');
  console.log('Media query (hover: hover) and (pointer: fine) matches:', mediaQuery.matches);

  // Temporarily disabled for debugging - uncomment if needed
  // if (!mediaQuery.matches) return;

  // Create cursor elements
  const outer = document.createElement('div');
  const inner = document.createElement('div');

  outer.className = 'custom-cursor-outer';
  inner.className = 'custom-cursor-inner';

  outer.appendChild(inner);
  document.body.appendChild(outer);

  // State
  let mouseX = 0;
  let mouseY = 0;
  let cursorX = 0;
  let cursorY = 0;
  let isInitialized = false;

  // Smooth position tracking with lerp
  function animate() {
    const ease = 0.15;
    cursorX += (mouseX - cursorX) * ease;
    cursorY += (mouseY - cursorY) * ease;

    // Center the cursor on the mouse position (subtract half the cursor size)
    outer.style.transform = `translate(${cursorX - 12.5}px, ${cursorY - 12.5}px)`;

    requestAnimationFrame(animate);
  }

  // Mouse tracking
  document.addEventListener('mousemove', (e) => {
    mouseX = e.clientX;
    mouseY = e.clientY;

    // Initialize cursor position immediately on first move to prevent lerp from offscreen
    if (!isInitialized) {
      cursorX = mouseX;
      cursorY = mouseY;
      isInitialized = true;
    }

    outer.classList.remove('hidden');
  });

  // Hide cursor when mouse leaves viewport
  document.addEventListener('mouseleave', () => {
    outer.classList.add('hidden');
  });

  // Click animation
  document.addEventListener('mousedown', () => {
    outer.classList.add('clicking');
  });

  document.addEventListener('mouseup', () => {
    setTimeout(() => {
      outer.classList.remove('clicking');
    }, 300);
  });

  // Interactive elements query
  const interactiveSelectors = 'a, button, .clickable, .nav-item, .archive-section, .calendar-day:not(.empty), .year-option, .year-selector-button, .movie-item, .book-item';

  // Hover state management
  function addHoverListener(el) {
    el.addEventListener('mouseenter', () => {
      outer.classList.add('hover');
    });

    el.addEventListener('mouseleave', () => {
      outer.classList.remove('hover');
    });
  }

  // Initialize hover listeners
  document.querySelectorAll(interactiveSelectors).forEach(addHoverListener);

  // Watch for dynamic content (calendar year switching, etc.)
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => {
        if (node.nodeType === 1) { // Element node
          if (node.matches && node.matches(interactiveSelectors)) {
            addHoverListener(node);
          }
          // Check descendants
          const descendants = node.querySelectorAll && node.querySelectorAll(interactiveSelectors);
          if (descendants) {
            descendants.forEach(addHoverListener);
          }
        }
      });
    });
  });

  // Start observing
  observer.observe(document.body, {
    childList: true,
    subtree: true
  });

  // Start animation loop
  requestAnimationFrame(animate);

})();
