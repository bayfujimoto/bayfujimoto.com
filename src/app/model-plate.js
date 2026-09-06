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
 * opts.entry — a pose handed off from the desk (desk-inspect.js): the object
 *   was just being held there, so the plate opens at the orientation it was
 *   held at and settles to the standard view instead of cutting to it.
 *   { file, view: [x,y,z,w] } — `view` is Q_camera⁻¹ · Q_object on the desk.
 */
export function mountModelPlate(field, opts = {}) {
  const { onState = () => {}, fallbackSrc = null, entry = null } = opts;

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
  let settle = null;           // the handoff's camera move, while it runs
  let pendingEntry = entry;    // consumed by the first frame it belongs to

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
    if (settle) advanceSettle();
    else if (controls) controls.update(); // applies the drag and its damping
    render();
    if (settle || (controls && dampingActive())) schedule();
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
    // A settle in flight owns the camera; TrackballControls.update() ends in
    // lookAt(target), which would flatten the handed-off pose's roll.
    controls.enabled = !settle;
    if (!settle) { controls.update(); render(); }
  });

  // ── The handoff settle ──────────────────────────────────────────────────────
  // The object was in the hand on the desk a moment ago; it arrives on the
  // plate facing the same way and turns to the plate's standard view. The move
  // is camera-side, like everything else here: the object stays where it was
  // mounted and the camera travels round the fit sphere to meet it.
  // Held a beat first, so the pose the visitor was holding is still the pose on
  // screen while the card fades in over the desk; then eased at both ends.
  const SETTLE_HOLD_MS = 140;
  const SETTLE_MS = 700;
  const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

  const startSettle = (view) => {
    if (!fit) return;
    const to = { pos: camera.position.clone(), quat: camera.quaternion.clone() };
    // Q_cam · Q_view = Q_object → the camera pose that reproduces the desk's
    // view of the object, at the plate's own framing distance.
    const qCam = (current ? current.quaternion.clone() : new THREE.Quaternion())
      .multiply(new THREE.Quaternion().fromArray(view).invert());
    const from = {
      pos: fit.center.clone().add(new THREE.Vector3(0, 0, 1).applyQuaternion(qCam).multiplyScalar(fit.distance)),
      quat: qCam,
    };
    camera.position.copy(from.pos);
    camera.quaternion.copy(from.quat);
    // Both poses look at the fit centre, so the move is a turn around it. The
    // camera keeps its distance: a straight line between two poses half a turn
    // apart passes through the object.
    settle = {
      t0: performance.now() + SETTLE_HOLD_MS,
      from,
      to,
      d0: from.pos.distanceTo(fit.center),
      d1: to.pos.distanceTo(fit.center),
    };
    if (controls) controls.enabled = false;
    schedule();
  };

  const advanceSettle = () => {
    const u = Math.min(1, (performance.now() - settle.t0) / SETTLE_MS);
    if (u < 0) return;                    // the beat before it turns
    const e = easeInOut(u);
    camera.quaternion.slerpQuaternions(settle.from.quat, settle.to.quat, e);
    camera.position.copy(fit.center).add(
      new THREE.Vector3(0, 0, 1).applyQuaternion(camera.quaternion)
        .multiplyScalar(settle.d0 + (settle.d1 - settle.d0) * e)
    );
    if (u < 1) return;
    camera.position.copy(settle.to.pos);
    camera.quaternion.copy(settle.to.quat);
    camera.up.set(0, 1, 0);
    settle = null;
    if (controls) {
      controls.enabled = true;
      if (fit) controls.target.copy(fit.center);
      controls.handleResize();
      controls.update();
    }
  };

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
    if (pendingEntry) {
      const mine = pendingEntry.file === frame.model;
      const view = pendingEntry.view;
      pendingEntry = null;      // one handoff, one use, whichever frame opens
      if (mine && Array.isArray(view)) startSettle(view);
    }
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
      settle = null;
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
