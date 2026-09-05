// Render harness for the Guide's contact-strip thumbnails. Runs under the Vite
// dev server (node scripts/render-desk-thumbnails.js starts one and drives this
// page headlessly; or open it by hand and use the buttons). Uses the same
// materials, lights, and opening view as the live model plate, so the strip's
// still and the plate's first frame agree.

import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { DESK_OBJECTS, UNTEXTURED_BASE, objectFor } from "../../src/shared/desk-objects.js";
import { stripTextures, addPlateLights, configureRenderer, fitCameraToObject } from "../../src/app/model-look.js";

// Frame keys in strip order; each names the object that OPENS that series.
const FRAMES = ["key", "identity", "labor", "consumption", "creation", "accumulation"];
const SIZE = 512;
// ?base=/some/path/ serves the GLBs from elsewhere (e.g. a local copy) instead of R2.
const MODEL_SRC = new URLSearchParams(location.search).get("base") || UNTEXTURED_BASE;

const grid = document.getElementById("grid");
const status = document.getElementById("status");
const allBtn = document.getElementById("all");

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
configureRenderer(renderer);
renderer.setPixelRatio(1);
renderer.setSize(SIZE, SIZE, false);

const loader = new GLTFLoader();
const results = {}; // frameKey → dataURL

async function renderFrame(key) {
  const objId = key === "key" ? "guide" : objectFor(key);
  const { file, noun } = DESK_OBJECTS[objId];
  const gltf = await loader.loadAsync(`${MODEL_SRC}${file}`);
  const model = gltf.scene;
  stripTextures(model);

  const scene = new THREE.Scene();
  scene.add(model);
  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
  addPlateLights(scene, camera);
  fitCameraToObject(camera, model);
  renderer.render(scene, camera);
  const url = renderer.domElement.toDataURL("image/png");
  results[key] = url;

  const fig = document.createElement("figure");
  const img = document.createElement("img");
  img.src = url;
  img.alt = `${key} — ${noun}`;
  const cap = document.createElement("figcaption");
  const label = document.createElement("span");
  label.textContent = `${key}.png · ${noun}`;
  const dl = document.createElement("button");
  dl.type = "button";
  dl.textContent = "save";
  dl.addEventListener("click", () => download(key));
  cap.append(label, dl);
  fig.append(img, cap);
  grid.appendChild(fig);
  return url;
}

function download(key) {
  const a = document.createElement("a");
  a.href = results[key];
  a.download = `${key}.png`;
  a.click();
}

// Driven by scripts/render-desk-thumbnails.js: resolves to { frameKey: dataURL }.
window.__renderThumbs = (async () => {
  for (const key of FRAMES) {
    status.textContent = `rendering ${key}…`;
    try {
      await renderFrame(key);
    } catch (e) {
      status.textContent = `failed on ${key}: ${e.message}`;
      throw e;
    }
  }
  status.textContent = `rendered ${FRAMES.length} thumbnails`;
  allBtn.hidden = false;
  allBtn.addEventListener("click", () => FRAMES.forEach((k, i) => setTimeout(() => download(k), i * 300)));
  return results;
})();
