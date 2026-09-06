// ── Desk inspection — an object lifted into the hand ─────────────────────────
// The first desk-object interaction: clicking the Guide's key lifts it off the
// desk, squares it to the viewer, and turns it over. Held, it turns under the
// pointer with the same trackball as the card's plate. Clicking its reverse
// opens the Guide's inspection card, handing the card the pose it was held at,
// so the object on the plate is the object that was in the hand.
//
// The held object is drawn in its OWN canvas above the veil, not in the desk's:
// the desk has to blur and dim behind it as it does under any other layer, and
// a backdrop-filter blurs everything below it, the object included. So the lift
// moves the model out of the desk scene into an overlay scene of its own, the
// desk repaints without it and freezes, and the veil comes up between the two.
// One consequence is the one that matters when the card opens: the desk holds
// no key to show through the blur, because the key is the card's now.
//
// State lives here, not in state.js: the object in hand is a scene state, not a
// layer. The URL stays "/" the whole time. docs/guide-key-interaction-plan.md.

import * as THREE from "three";
import { loadDeskModel } from "./model-plate.js";
import { PLATE_VIEW, addPlateLights, configureRenderer } from "./model-look.js";

// ── Tuning ───────────────────────────────────────────────────────────────────
// The object is held at the centre of the screen, at the size the card's plate
// will show it, so it is recognisably the same object at the same scale when
// the card takes it over. The size comes from the card's own CSS rather than a
// number tuned by eye: `.item-card-wrap` centres a card of min(960px, viewport
// − padding); above 600px the plate is the wider column (58%), below it the
// card collapses to one column. The field's 0.75rem padding is the canvas's
// inset, and the plate frames the object's bounding sphere at PLATE_VIEW.fill
// of that square's half-height.
const CARD_MAX = 960;        // .item-card { width: min(960px, 100%) }
const PLATE_COLUMN = 0.58;   // the plate's share of the two-column card
const FIELD_PAD = 12;        // .item-card__field--model { padding: 0.75rem }

function plateFill() {
  const vw = window.innerWidth;
  const single = vw < 600;                       // the card's own breakpoint
  const wrapPad = single ? 16 : 48;              // var(--overlay-padding) / 3rem
  const card = Math.min(CARD_MAX, vw - wrapPad * 2);
  const field = (single ? card : card * PLATE_COLUMN) - FIELD_PAD * 2;
  return (PLATE_VIEW.fill * field) / window.innerHeight;
}

const LIFT_MS = 700;      // desk → hand, squaring up as it rises
const HOLD_MS = 160;      // a beat before it turns
const TURN_MS = 800;      // the half-turn
const FLIP_MS = 600;      // a later turn-over, clicked rather than automatic
const VEIL_MS = 380;      // --dur-slow, plus a little
const DRAG_PX = 4;        // pointer travel that makes a drag out of a click
const HAND_TILT_DEG = -8; // a few degrees off square, so it isn't a diagram

const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

// ── The handoff box ──────────────────────────────────────────────────────────
// One pending pose, written when the click enters the card and read once by the
// card's model plate. A pose older than this belongs to some other navigation.
const HANDOFF_TTL_MS = 4000;
let pendingHandoff = null;

export function takeDeskHandoff() {
  const h = pendingHandoff;
  pendingHandoff = null;
  if (!h) return null;
  return performance.now() - h.at > HANDOFF_TTL_MS ? null : h;
}

/**
 * @param opts.camera      the desk camera (never moves)
 * @param opts.scene       the desk scene
 * @param opts.deskLights  { ambient, spot } — cloned into the overlay so the
 *                         object starts under the lamp it was lying under
 * @param opts.onEnter     () => void — open the card
 * @param opts.onHold      (held, facing) => void — the overlay meta follows
 * @param opts.pauseDesk / opts.resumeDesk / opts.renderDesk
 */
export function createInspector({
  camera, scene, deskLights = null,
  onEnter = () => {}, onHold = () => {},
  pauseDesk = () => {}, resumeDesk = () => {}, renderDesk = () => {},
}) {
  let model = null;         // the desk object, as placed by scene.js
  let modelFile = null;     // its GLB, warmed into the plate's cache on lift
  let pivot = null;         // rotates about the object's centre while held
  let rest = null;          // { position, quaternion, center, radius }
  let nLocal = null;        // the face that pointed up on the desk, pivot-local
  let lLocal = null;        // its long axis, pivot-local
  let state = "detached";   // detached | resting | lifting | inHand | lowering | handedOff
  let facing = false;       // is the reverse toward the camera?
  let queue = [];
  let anim = null;
  let heldPose = null;      // where it was left when the card took it

  // The overlay: its own veil, canvas, renderer and scene, built for the hold
  // and thrown away after it.
  let veil = null, oCanvas = null, renderer = null, oScene = null, oCam = null;
  let lights = null, controls = null, controlsReady = null, rafId = 0, mix = 0;

  const camQuat = new THREE.Quaternion();
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();

  // ── Attach ─────────────────────────────────────────────────────────────────
  function attach(obj, file) {
    model = obj;
    modelFile = file || null;
    state = "resting";
  }

  function readRestPose() {
    model.updateWorldMatrix(true, true);
    const box = new THREE.Box3().setFromObject(model, true);
    const center = new THREE.Vector3();
    const size = new THREE.Vector3();
    const sphere = new THREE.Sphere();
    box.getCenter(center);
    box.getSize(size);
    box.getBoundingSphere(sphere);

    rest = {
      position: model.position.clone(),
      quaternion: model.quaternion.clone(),
      center,
      radius: Math.max(sphere.radius, 1e-3),
    };

    // The object lies flat on the desk, so its visible face points at world up
    // and its length runs along whichever horizontal axis of its bounds is
    // longer. Both are read off the model, so a remodelled object (the key with
    // its paper tag) needs no code change.
    const inv = rest.quaternion.clone().invert();
    nLocal = new THREE.Vector3(0, 1, 0).applyQuaternion(inv).normalize();
    lLocal = (size.x >= size.z ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 0, 1))
      .applyQuaternion(inv).normalize();
    lLocal.addScaledVector(nLocal, -lLocal.dot(nLocal)).normalize();
  }

  // ── The hand pose ──────────────────────────────────────────────────────────
  // Dead centre of the screen — straight out along the camera's own axis — far
  // enough out to read at the size the plate will show it.
  function handPoint() {
    const dist = rest.radius / (plateFill() * Math.tan((oCam.fov * Math.PI) / 360));
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(oCam.quaternion);
    return oCam.position.clone().addScaledVector(forward, dist);
  }

  const viewAxes = () => {
    oCam.getWorldQuaternion(camQuat);
    const toCam = new THREE.Vector3(0, 0, 1).applyQuaternion(camQuat).normalize();
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camQuat)
      .applyAxisAngle(toCam, (HAND_TILT_DEG * Math.PI) / 180).normalize();
    return { toCam, right, up: new THREE.Vector3().crossVectors(toCam, right).normalize() };
  };

  // Square to the viewer: the face that lay upward turns to the camera, the
  // long axis runs across the screen.
  function handQuaternion() {
    const { toCam, right, up } = viewAxes();
    const e1 = lLocal.clone();
    const e3 = nLocal.clone();
    const e2 = new THREE.Vector3().crossVectors(e3, e1).normalize();
    const src = new THREE.Matrix4().makeBasis(e1, e2, e3).transpose(); // orthonormal → inverse
    const dst = new THREE.Matrix4().makeBasis(right, up, toCam);
    return new THREE.Quaternion().setFromRotationMatrix(dst.multiply(src));
  }

  // Half-turn about the screen-horizontal axis: turning it over in the hand,
  // not spinning it in place.
  function turnedOver(q) {
    const { right } = viewAxes();
    return new THREE.Quaternion().setFromAxisAngle(right, Math.PI).multiply(q.clone());
  }

  // Is the reverse — the face that lay against the desk — toward the camera?
  // One dot product, correct under free rotation; a margin so the edge-on pose
  // commits to neither face.
  function facingReverse() {
    if (!pivot || !oCam) return false;
    const { toCam } = viewAxes();
    return nLocal.clone().applyQuaternion(pivot.quaternion).normalize().dot(toCam) < -0.15;
  }

  // ── The overlay ────────────────────────────────────────────────────────────
  function openOverlay() {
    veil = document.createElement("div");
    veil.className = "layer-veil";
    veil.setAttribute("aria-hidden", "true");
    veil.style.setProperty("--depth", 1);
    document.body.appendChild(veil);

    oCanvas = document.createElement("canvas");
    oCanvas.className = "desk-hold-canvas";
    oCanvas.setAttribute("role", "img");
    oCanvas.setAttribute("aria-label", "The object, in hand — drag to turn");
    document.body.appendChild(oCanvas);

    renderer = new THREE.WebGLRenderer({ canvas: oCanvas, antialias: true, alpha: true });
    configureRenderer(renderer);

    oScene = new THREE.Scene();
    oCam = camera.clone();
    oCam.aspect = window.innerWidth / window.innerHeight;
    oCam.updateProjectionMatrix();

    // Two rigs, crossfaded across the lift: the desk's own lamp, so the first
    // frame is the frame the desk was showing, giving way to the plate's
    // camera-riding light, so every face is lit as it is brought round.
    lights = addPlateLights(oScene, oCam);
    lights.desk = [];
    if (deskLights?.ambient) {
      const a = deskLights.ambient.clone();
      oScene.add(a);
      lights.desk.push([a, deskLights.ambient.intensity]);
    }
    if (deskLights?.spot) {
      const sp = deskLights.spot.clone();
      sp.castShadow = false;                 // nothing here to catch a shadow
      const target = new THREE.Object3D();
      target.position.copy(deskLights.spot.target.position);
      oScene.add(target);
      sp.target = target;
      oScene.add(sp);
      lights.desk.push([sp, deskLights.spot.intensity]);
    }
    setMix(0);

    sizeOverlay();
    window.addEventListener("resize", sizeOverlay);
    oCanvas.addEventListener("pointerdown", onPointerDown);
    oCanvas.addEventListener("pointerup", onPointerUp);
    document.addEventListener("keydown", onKey);
    requestAnimationFrame(() => veil?.classList.add("layer-veil--visible"));
    loop();
  }

  // t = 0 → the desk's lamp; t = 1 → the plate's rig.
  function setMix(t) {
    mix = t;
    lights.ambient.intensity = lights.full.ambient * t;
    lights.key.intensity = lights.full.key * t;
    lights.fill.intensity = lights.full.fill * t;
    for (const [light, full] of lights.desk) light.intensity = full * (1 - t);
  }

  function sizeOverlay() {
    if (!renderer) return;
    const w = window.innerWidth, h = window.innerHeight;
    renderer.setSize(w, h, false);
    oCam.aspect = w / h;
    oCam.updateProjectionMatrix();
    controls?.handleResize();
  }

  function closeOverlay() {
    window.removeEventListener("resize", sizeOverlay);
    document.removeEventListener("keydown", onKey);
    if (rafId) cancelAnimationFrame(rafId);
    rafId = 0;
    controlsReady?.then(() => controls?.dispose());
    controls = null;
    controlsReady = null;
    oCanvas?.remove();
    renderer?.dispose();
    renderer?.forceContextLoss?.();
    renderer = null;
    oCanvas = null;
    oScene = null;
    oCam = null;
    lights = null;
    // The veil fades out on its own transition, then goes.
    const v = veil;
    veil = null;
    if (v) {
      v.classList.remove("layer-veil--visible");
      setTimeout(() => v.remove(), VEIL_MS);
    }
  }

  // Trackball, not orbit: the same controller and the same feel as the card's
  // plate, so an object turns identically in the hand and on the card.
  function makeControls() {
    controlsReady = import("three/examples/jsm/controls/TrackballControls.js").then(({ TrackballControls }) => {
      if (!oCam || !oCanvas) return;
      controls = new TrackballControls(oCam, oCanvas);
      controls.noZoom = true;
      controls.noPan = true;
      controls.rotateSpeed = 2.2;
      controls.staticMoving = false;
      controls.dynamicDampingFactor = 0.15;
      controls.keys = ["", "", ""];
      controls.target.copy(pivot.position);
      // The element, not the variable: the overlay can be torn down while a
      // control event is still in flight.
      const el = oCanvas;
      controls.addEventListener("start", () => el.classList.add("is-grabbing"));
      controls.addEventListener("end", () => { el.classList.remove("is-grabbing"); reportFacing(); });
      controls.addEventListener("change", reportFacing);
      controls.handleResize();
      controls.update();
    });
  }

  // ── Pivot ──────────────────────────────────────────────────────────────────
  // Rotating the model about its own origin would swing it out of frame: it is
  // placed by its bounding box, not its origin. The pivot sits at the object's
  // centre and carries the whole orientation while it is held.
  function grip() {
    readRestPose();
    pivot = new THREE.Group();
    pivot.position.copy(rest.center);
    pivot.quaternion.copy(rest.quaternion);
    model.position.copy(
      model.position.clone().sub(rest.center).applyQuaternion(rest.quaternion.clone().invert())
    );
    model.quaternion.identity();
    pivot.add(model);
    oScene.add(pivot);
  }

  function release() {
    scene.add(model);            // reparents, back into the desk's graph
    model.position.copy(rest.position);
    model.quaternion.copy(rest.quaternion);
    oScene?.remove(pivot);
    pivot = null;
  }

  // ── Tweens ─────────────────────────────────────────────────────────────────
  // One queue, driven by the overlay's own loop; each step can move the object,
  // the camera, or the light mix.
  const tween = (step) => queue.push(step);

  function startNext() {
    const next = queue.shift();
    if (!next) { anim = null; return false; }
    anim = {
      ...next,
      t0: performance.now() + (next.hold || 0),
      fromPos: pivot.position.clone(),
      fromQuat: pivot.quaternion.clone(),
      fromCamPos: oCam.position.clone(),
      fromCamQuat: oCam.quaternion.clone(),
      fromMix: mix,
    };
    return true;
  }

  function advance() {
    if (!anim && !startNext()) return;
    const now = performance.now();
    if (now < anim.t0) return;                       // the beat before it turns
    const u = anim.ms > 0 ? Math.min(1, (now - anim.t0) / anim.ms) : 1;
    const e = easeInOut(u);
    if (anim.pos) pivot.position.lerpVectors(anim.fromPos, anim.pos, e);
    if (anim.quat) pivot.quaternion.slerpQuaternions(anim.fromQuat, anim.quat, e);
    if (anim.camPos) oCam.position.lerpVectors(anim.fromCamPos, anim.camPos, e);
    if (anim.camQuat) oCam.quaternion.slerpQuaternions(anim.fromCamQuat, anim.camQuat, e);
    if (anim.mix != null) setMix(anim.fromMix + (anim.mix - anim.fromMix) * e);
    if (u < 1) return;
    anim = null;
    if (!startNext()) settle();
  }

  // What the end of a chain means depends on which way it was going.
  function settle() {
    if (state === "lifting") {
      state = "inHand";
      if (!controls && !controlsReady) makeControls();
      if (controls) { controls.enabled = true; controls.target.copy(pivot.position); controls.update(); }
      reportFacing(true);
    } else if (state === "lowering") {
      release();
      renderDesk();
      resumeDesk();
      closeOverlay();
      state = "resting";
      onHold(false, false);
    }
  }

  function loop() {
    rafId = requestAnimationFrame(loop);
    if (!renderer) return;
    if (anim || queue.length) advance();
    else if (controls && state === "inHand") controls.update();
    // The last step of a lowering closes the overlay from inside advance().
    if (renderer) renderer.render(oScene, oCam);
  }

  function reportFacing(force = false) {
    if (state !== "inHand") return;
    const f = facingReverse();
    if (force || f !== facing) {
      facing = f;
      oCanvas?.classList.toggle("is-openable", f);
      onHold(true, f);
    }
  }

  // ── The gestures ───────────────────────────────────────────────────────────
  function lift() {
    if (state !== "resting") return;
    state = "lifting";
    openOverlay();
    grip();
    renderDesk();   // the desk repaints without the object, then freezes
    pauseDesk();
    // Warm the card's copy of the model while the object is on its way up, so
    // the handoff has no load gap.
    if (modelFile) loadDeskModel(modelFile).catch(() => {});
    const front = handQuaternion();
    queue = [];
    anim = null;
    tween({ ms: LIFT_MS, pos: handPoint(), quat: front, mix: 1 });
    tween({ ms: TURN_MS, hold: HOLD_MS, quat: turnedOver(front) });
    startNext();
    onHold(true, false);
  }

  function lower() {
    if (state !== "inHand" && state !== "lifting") return;
    state = "lowering";
    controlsReady?.then(() => { controls?.dispose(); controls = null; controlsReady = null; });
    queue = [];
    anim = null;
    // The object goes back to the desk and the camera back to the desk's own
    // pose together, so the last frame of the overlay is the desk's first.
    tween({
      ms: LIFT_MS,
      pos: rest.center.clone(),
      quat: rest.quaternion.clone(),
      camPos: camera.position.clone(),
      camQuat: camera.quaternion.clone(),
      mix: 0,
    });
    startNext();
    if (veil) veil.classList.remove("layer-veil--visible");
  }

  function flip() {
    if (state !== "inHand") return;
    state = "lifting";                 // busy: no clicks land mid-turn
    if (controls) controls.enabled = false;
    queue = [];
    anim = null;
    tween({ ms: FLIP_MS, quat: turnedOver(pivot.quaternion) });
    startNext();
  }

  // Record the pose the object was held at — its orientation relative to the
  // viewing camera — and let the card open. The plate reproduces it.
  function enter() {
    oCam.getWorldQuaternion(camQuat);
    // Exactly as it was left, for the return trip.
    heldPose = {
      pos: pivot.position.clone(),
      quat: pivot.quaternion.clone(),
      camPos: oCam.position.clone(),
      camQuat: oCam.quaternion.clone(),
      camUp: oCam.up.clone(),
    };
    pendingHandoff = {
      at: performance.now(),
      file: modelFile,
      // Q_view = Q_camera⁻¹ · Q_object: what the object looks like from here.
      view: camQuat.clone().invert().multiply(pivot.quaternion.clone()).toArray(),
    };
    state = "handedOff";
    // The card carries the object from here; the desk behind it holds none.
    // The veil crossfades into the card's own, which is going up this turn.
    release();
    model.visible = false;
    closeOverlay();
    onHold(false, false);
    onEnter();
  }

  // Dismissing the card puts the object back in the hand where it was held.
  function resume() {
    if (state !== "handedOff") return;
    state = "inHand";
    openOverlay();
    grip();
    model.visible = true;
    renderDesk();
    pauseDesk();
    if (heldPose) {
      oCam.position.copy(heldPose.camPos);
      oCam.quaternion.copy(heldPose.camQuat);
      oCam.up.copy(heldPose.camUp);
      pivot.position.copy(heldPose.pos);
      pivot.quaternion.copy(heldPose.quat);
    } else {
      pivot.position.copy(handPoint());
      pivot.quaternion.copy(turnedOver(handQuaternion()));
    }
    setMix(1);
    makeControls();
    facing = false;
    reportFacing(true);
  }

  // ── Pointer ────────────────────────────────────────────────────────────────
  let down = null;

  function hitsObject(e) {
    if (!model || !oCam) return false;
    ndc.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
    raycaster.setFromCamera(ndc, oCam);
    return raycaster.intersectObject(model, true).length > 0;
  }

  function onPointerDown(e) {
    down = state === "inHand" ? { x: e.clientX, y: e.clientY, onObject: hitsObject(e) } : null;
  }

  function onPointerUp(e) {
    const d = down;
    down = null;
    if (!d || state !== "inHand") return;
    if (Math.hypot(e.clientX - d.x, e.clientY - d.y) >= DRAG_PX) return;  // a turn, not a click
    if (!d.onObject) { lower(); return; }
    facingReverse() ? enter() : flip();
  }

  function onKey(e) {
    if (e.key !== "Escape") return;
    if (state === "inHand" || state === "lifting") { e.preventDefault(); lower(); }
  }

  return {
    attach,
    lift,
    lower,
    resume,
    isHeld: () => state !== "resting" && state !== "detached",
  };
}
