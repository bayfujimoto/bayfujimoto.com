const fs = require('fs');
const path = require('path');

module.exports = function() {
  const footerDir = path.join(__dirname, '..', 'assets', 'images', 'footer');

  // Check if directory exists
  if (!fs.existsSync(footerDir)) {
    console.warn('Footer images directory does not exist');
    return { path: '/assets/images/footer-background.jpg' }; // Fallback
  }

  // Read all image files
  const files = fs.readdirSync(footerDir)
    .filter(file => /\.(jpg|jpeg|png|webp)$/i.test(file));

  if (files.length === 0) {
    console.warn('No images found in footer directory');
    return { path: '/assets/images/footer-background.jpg' }; // Fallback
  }

  // Pick random image
  const randomImage = files[Math.floor(Math.random() * files.length)];

  console.log(`Selected footer image: ${randomImage}`);

  return {
    path: `/assets/images/footer/${randomImage}`,
    filename: randomImage
  };
};
