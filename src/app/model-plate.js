// ── Model plate — a desk object, in hand, on the catalog card ─────────────────
// The Guide card's plate carries the 3D object itself instead of a scan: drag
// to turn it, freely, in any direction — a trackball, not an orbit, so there
// is no pole to stop at and no up that must stay up. It holds still until it
// is touched. One renderer per card, disposed with it; loaded models are
// cached at module level so stepping between frames is instant after the
// first visit.
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

/**
 * Mount a model viewer into `field` (the card's square plate field).
 *
 * opts.onState(state) — "loading" | "ready" | "failed"; the card's scale note
 *   prints these.
 * opts.fallbackSrc(frame) — image URL to show when WebGL is unavailable.
 */
export function mountModelPlate(field, opts = {}) {
  const { onState = () => {}, fallbackSrc = null } = opts;

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
  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
  camera.position.set(0, 2, 5);
  addPlateLights(scene, camera);

  let controls = null;         // TrackballControls, once its chunk arrives
  let current = null;          // the mounted clone
  let showSeq = 0;             // guards against out-of-order loads
  let paused = false;
  let disposed = false;
  let rafId = 0;
  let fit = null;              // { center, radius, distance } of the current object

  const size = () => {
    const w = field.clientWidth, h = field.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    controls?.handleResize(); // trackball maps the drag to the canvas's size
  };
  const render = () => {
    if (disposed || paused) return;
    renderer.render(scene, camera);
  };

  // On-demand rendering: frames only while the visitor is turning the object
  // or its release is still damping out — nothing while it is still.
  const tick = () => {
    rafId = 0;
    if (disposed || paused) return;
    if (controls) controls.update(); // applies the drag and its damping
    render();
    if (controls && dampingActive()) schedule();
  };
  const schedule = () => { if (!rafId) rafId = requestAnimationFrame(tick); };
  // The controls have no "settled" signal; after a release the damping decays
  // for a few hundred ms. Keep ticking briefly after the last interaction.
  let lastInteraction = 0;
  const dampingActive = () => performance.now() - lastInteraction < 900;

  const ro = new ResizeObserver(() => { size(); render(); });
  ro.observe(field);
  size();

  // TrackballControls is the one piece not already in the main bundle; load
  // it lazily so the desk page never pays for it. Trackball, not orbit:
  // rotation is unconstrained on every axis — over the top, under the desk,
  // end over end — with no gimbal pole and no auto-rotation. Zoom and pan are
  // off; the drag does one thing.
  const controlsReady = import("three/examples/jsm/controls/TrackballControls.js").then(({ TrackballControls }) => {
    if (disposed) return;
    controls = new TrackballControls(camera, canvas);
    controls.noZoom = true;
    controls.noPan = true;
    controls.rotateSpeed = 2.2;
    controls.staticMoving = false;
    controls.dynamicDampingFactor = 0.15;
    controls.keys = ["", "", ""]; // no keyboard mode switching
    controls.addEventListener("start", () => {
      field.classList.add("is-grabbing");
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
    controls.handleResize();
    controls.update();
    render();
  });

  const mount = (template, frame) => {
    if (current) { scene.remove(current); current = null; }
    current = template.clone();
    scene.add(current);
    // Each frame opens at the plate's standard view, whichever way the last
    // object was left: camera up is reset along with its position.
    camera.up.set(0, 1, 0);
    fit = fitCameraToObject(camera, current);
    if (controls) {
      controls.target.copy(fit.center);
      controls.update();
    }
    canvas.setAttribute("aria-label", `Model of the ${frame.object} — drag to turn`);
    render();
  };

  return {
    get live() { return true; },
    show(frame) {
      const seq = ++showSeq;
      onState("loading");
      loadDeskModel(frame.model).then((template) => {
        if (disposed || seq !== showSeq) return;
        mount(template, frame);
        onState("ready");
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
