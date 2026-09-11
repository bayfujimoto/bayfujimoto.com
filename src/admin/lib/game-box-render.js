// Canvas renderer for game boxes (admin side). Pairs with the sharp renderer
// in scripts/rebuild-game-boxes.js; both take their numbers from
// src/shared/game-box.js so the browser preview and the rebuilt derivative
// agree pixel for pixel (up to resampling).

import { layoutBox, esrbIconName, TEMPLATES } from "../../shared/game-box.js";

// Templates and icons are static site files (public/game-boxes/) served
// same-origin, so a canvas can read them back without CORS.
const BASE = "/game-boxes";
const cache = new Map();

function loadStatic(path) {
  if (!cache.has(path)) {
    const url = `${BASE}/${path}`;
    cache.set(path, new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      // A missing file is answered by the SPA catch-all with index.html, so the
      // image simply fails to decode. The usual cause is that public/game-boxes/
      // was never committed (the repo gitignores *.png — .gitignore carries an
      // exception for this folder).
      img.onerror = () => reject(new Error(
        `could not load ${url} — is public/game-boxes/ committed and deployed?`));
      img.src = url;
    }));
  }
  return cache.get(path);
}

export function loadTemplateImage(templateId) {
  if (!TEMPLATES[templateId]) return Promise.reject(new Error(`unknown template ${templateId}`));
  return loadStatic(`${templateId}.png?v=${TEMPLATES[templateId].version}`);
}

export function loadEsrbImage(rating) {
  const name = esrbIconName(rating);
  return name ? loadStatic(`esrb/${name}.png`) : Promise.resolve(null);
}

/**
 * Compose art into a box. `art` is any drawable (HTMLImageElement, canvas).
 * Returns a transparent canvas at the output size (see OUTPUT_HEIGHT).
 * @param {CanvasImageSource & {naturalWidth?:number,width:number}} art
 * @param {{template:string, rating:string, fit:{zoom,x,y}}} box
 * @param {{scale?:number}} [opts]  scale < 1 renders a smaller preview
 */
export async function renderGameBox(art, box, opts = {}) {
  const [tpl, badge] = await Promise.all([loadTemplateImage(box.template), loadEsrbImage(box.rating)]);
  const aw = art.naturalWidth ?? art.width;
  const ah = art.naturalHeight ?? art.height;
  const esrbAspect = badge ? badge.naturalWidth / badge.naturalHeight : undefined;
  const L = layoutBox(box.template, aw, ah, box.fit, box.rating, esrbAspect);
  const k = opts.scale ?? 1;

  const canvas = document.createElement("canvas");
  canvas.width = Math.round(L.width * k);
  canvas.height = Math.round(L.height * k);
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  // art, clipped to the window
  ctx.save();
  ctx.beginPath();
  ctx.rect(L.window.x * k, L.window.y * k, L.window.w * k, L.window.h * k);
  ctx.clip();
  ctx.drawImage(art, L.art.x * k, L.art.y * k, L.art.w * k, L.art.h * k);
  ctx.restore();

  // the case over it
  ctx.drawImage(tpl, 0, 0, canvas.width, canvas.height);

  // the rating in its slot
  if (badge && L.esrb) {
    ctx.drawImage(badge, L.esrb.x * k, L.esrb.y * k, L.esrb.w * k, L.esrb.h * k);
  }
  return canvas;
}
