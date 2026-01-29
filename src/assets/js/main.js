// Mobile navigation toggle
document.addEventListener('DOMContentLoaded', () => {
  const menuToggle = document.getElementById('mobile-menu-toggle');
  const mobileMenu = document.getElementById('mobile-menu');

  // Only add toggle functionality if elements exist
  if (menuToggle && mobileMenu) {
    // Toggle menu on logo click (mobile only)
    menuToggle.addEventListener('click', (e) => {
      // Only prevent default and toggle on mobile
      if (window.innerWidth <= 768) {
        e.preventDefault();
        mobileMenu.classList.toggle('menu-open');
      }
      // On desktop, logo link works normally (navigates to home)
    });

    // Close menu when a link is clicked (mobile only)
    const menuLinks = mobileMenu.querySelectorAll('a');
    menuLinks.forEach(link => {
      link.addEventListener('click', () => {
        if (window.innerWidth <= 768) {
          mobileMenu.classList.remove('menu-open');
        }
      });
    });

    // Close menu if screen is resized to desktop
    window.addEventListener('resize', () => {
      if (window.innerWidth > 768) {
        mobileMenu.classList.remove('menu-open');
      }
    });
  }

  console.log('Bay Fujimoto site loaded');
});
