// ── Model plate — a desk object, turning, on the catalog card ─────────────────
// The Guide card's plate carries the 3D object itself instead of a scan: drag
// to turn, a slow idle rotation until the visitor takes hold of it. One
// renderer per card, disposed with it; loaded models are cached at module
// level so stepping between frames is instant after the first visit.
//
// Nothing the archive says depends on this: every fact is in the fields column,
// and when WebGL is unavailable the frame's pre-rendered thumbnail stands in
// (the same PNG the contact strip shows, at plate size). docs/guide-inspection-card-plan.md.

import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { UNTEXTURED_BASE } from "../shared/desk-objects.js";
import { stripTextures, addPlateLights, configureRenderer, fitCameraToObject } from "./model-look.js";

// file → Promise<THREE.Group>. Shared across cards and with the prefetcher; the
// loaded group is a template that each card clones (materials shared).
const modelCache = new Map();
let loader = null;

export function loadDeskModel(file) {
  if (!file) return Promise.reject(new Error("no model file"));
  if (!modelCache.has(file)) {
    loader ||= new GLTFLoader();
    const p = loader.loadAsync(`${UNTEXTURED_BASE}${file}`).then((gltf) => {
      const group = gltf.scene;
      stripTextures(group);
      return group;
    });
    // A failed load is not cached, so a retry (next step onto the frame) can succeed.
    p.catch(() => modelCache.delete(file));
    modelCache.set(file, p);
  }
  return modelCache.get(file);
}

// Idle turn: revolutions per minute (OrbitControls.autoRotateSpeed = rpm at 60 fps).
const AUTO_ROTATE_RPM = 0.8;

/**
 * Mount a model viewer into `field` (the card's square plate field).
 *
 * opts.reducedMotion — never auto-rotate.
 * opts.onState(state) — "loading" | "ready" | "held" | "failed"; the card's
 *   scale note prints these. "held" = the visitor has turned it (auto-rotate
 *   is off for good on this card).
 * opts.fallbackSrc(frame) — image URL to show when WebGL is unavailable.
 */
export function mountModelPlate(field, opts = {}) {
  const { reducedMotion = false, onState = () => {}, fallbackSrc = null } = opts;

  const canvas = document.createElement("canvas");
  canvas.className = "item-card__model-canvas";
  canvas.setAttribute("role", "img");
  field.appendChild(canvas);

  let renderer = null;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    configureRenderer(renderer);
  } catch {
    renderer = null;
  }

  // ── Fallback: no WebGL → still image per frame ──────────────────────────────
  if (!renderer) {
    canvas.remove();
    const img = document.createElement("img");
    img.className = "item-card__model-fallback";
    img.alt = "";
    img.decoding = "async";
    field.appendChild(img);
    onState("failed");
    return {
      show(frame) {
        img.src = fallbackSrc ? fallbackSrc(frame) : (frame.thumbnail || "");
        img.alt = `Still image of the ${frame.object}`;
        canvas.setAttribute("aria-label", img.alt);
        onState("failed");
      },
      prefetch() {},
      pause() {},
      resume() {},
      dispose() { img.remove(); },
      get live() { return false; },
    };
  }

  const scene = new THREE.Scene();
  addPlateLights(scene);
  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
  camera.position.set(0, 2, 5);

  let controls = null;         // OrbitControls, once its chunk arrives
  let current = null;          // the mounted clone
  let showSeq = 0;             // guards against out-of-order loads
  let paused = false;
  let disposed = false;
  let autoRotate = !reducedMotion;
  let held = false;
  let rafId = 0;
  let fit = null;              // { center, radius, distance } of the current object

  const size = () => {
    const w = field.clientWidth, h = field.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  const render = () => {
    if (disposed || paused) return;
    renderer.render(scene, camera);
  };

  // On-demand rendering: a frame per controls change, per resize, and per
  // auto-rotate tick — nothing while the object is still.
  const tick = () => {
    rafId = 0;
    if (disposed || paused) return;
    if (controls) controls.update(); // applies damping + autoRotate
    render();
    if ((controls && controls.autoRotate) || (controls && dampingActive())) schedule();
  };
  const schedule = () => { if (!rafId) rafId = requestAnimationFrame(tick); };
  // OrbitControls has no "settled" signal; after a release the damping decays
  // for a few hundred ms. Keep ticking briefly after the last interaction.
  let lastInteraction = 0;
  const dampingActive = () => performance.now() - lastInteraction < 900;

  const ro = new ResizeObserver(() => { size(); render(); });
  ro.observe(field);
  size();

  // OrbitControls is the one piece not already in the main bundle; load it
  // lazily so the desk page never pays for it.
  const controlsReady = import("three/examples/jsm/controls/OrbitControls.js").then(({ OrbitControls }) => {
    if (disposed) return;
    controls = new OrbitControls(camera, canvas);
    controls.enableZoom = false;
    controls.enablePan = false;
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.rotateSpeed = 0.7;
    controls.minPolarAngle = Math.PI * 0.15;  // never from directly above…
    controls.maxPolarAngle = Math.PI * 0.6;   // …nor from below the desk
    controls.autoRotate = autoRotate;
    controls.autoRotateSpeed = AUTO_ROTATE_RPM;
    controls.addEventListener("start", () => {
      // The visitor has taken hold: idle rotation stops and stays stopped.
      autoRotate = false;
      controls.autoRotate = false;
      held = true;
      field.classList.add("is-grabbing");
      onState("held");
      lastInteraction = performance.now();
      schedule();
    });
    controls.addEventListener("end", () => {
      field.classList.remove("is-grabbing");
      lastInteraction = performance.now();
      schedule();
    });
    controls.addEventListener("change", () => { lastInteraction = performance.now(); schedule(); });
    if (fit) controls.target.copy(fit.center);
    controls.update();
    schedule();
  });

  const mount = (template, frame) => {
    if (current) { scene.remove(current); current = null; }
    current = template.clone();
    scene.add(current);
    fit = fitCameraToObject(camera, current);
    if (controls) {
      controls.target.copy(fit.center);
      controls.update();
    }
    canvas.setAttribute("aria-label", `Model of the ${frame.object}${autoRotate ? ", turning" : ""} — drag to turn`);
    render();
    schedule();
  };

  return {
    get live() { return true; },
    show(frame) {
      const seq = ++showSeq;
      onState("loading");
      loadDeskModel(frame.model).then((template) => {
        if (disposed || seq !== showSeq) return;
        mount(template, frame);
        onState(held ? "held" : "ready");
      }).catch(() => {
        if (disposed || seq !== showSeq) return;
        if (current) { scene.remove(current); current = null; render(); }
        onState("failed");
      });
    },
    prefetch(frame) {
      if (frame?.model) loadDeskModel(frame.model).catch(() => {});
    },
    pause() { paused = true; if (rafId) { cancelAnimationFrame(rafId); rafId = 0; } },
    resume() { paused = false; render(); schedule(); },
    dispose() {
      disposed = true;
      if (rafId) cancelAnimationFrame(rafId);
      ro.disconnect();
      controlsReady.then(() => { if (controls) controls.dispose(); });
      if (current) scene.remove(current);
      renderer.dispose();
      renderer.forceContextLoss?.();
      canvas.remove();
    },
  };
}
