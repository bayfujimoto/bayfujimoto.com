// ── Desk inspection — an object lifted into the hand ─────────────────────────
// The first desk-object interaction: clicking the Guide's key lifts it off the
// desk toward the camera, squares it to the viewer, and turns it over. Held,
// it turns freely under the pointer. Clicking its reverse opens the Guide's
// inspection card, handing the card the pose it was held at so the object on
// the plate is the object that was in the hand.
//
// The camera never moves — that is the desk's premise. The object moves.
//
// State lives here, not in state.js: the key in hand is a scene state, not a
// layer. The URL stays "/" the whole time. docs/guide-key-interaction-plan.md.

import * as THREE from "three";
import { loadDeskModel } from "./model-plate.js";
import { PLATE_VIEW } from "./model-look.js";

// ── Tuning ───────────────────────────────────────────────────────────────────
// The object is held where the card's plate will be, at the size the plate
// will show it, so the card assembles around the object rather than replacing
// it. Both come from the card's own CSS rather than from numbers tuned by eye:
// `.item-card-wrap` centres a card of min(960px, viewport − padding); above
// 600px the plate is the wider column (58%), and below it the card collapses
// to one column with the plate at the top (`order: -1`). The plate field's
// 0.75rem padding is the canvas's inset. Only the vertical placement is tuned
// — the card's height depends on how much text the frame carries.
const CARD_MAX = 960;        // .item-card { width: min(960px, 100%) }
const PLATE_COLUMN = 0.58;   // the plate's share of the two-column card
const FIELD_PAD = 12;        // .item-card__field--model { padding: 0.75rem }
const HAND_Y = { wide: 0.17, square: 0.17, vertical: 0.40 };

function plateGeometry() {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const single = vw < 600;                          // the card's own breakpoint
  const wrapPad = single ? 16 : 48;                 // var(--overlay-padding) / 3rem
  const card = Math.min(CARD_MAX, vw - wrapPad * 2);
  const canvas = (single ? card : card * PLATE_COLUMN) - FIELD_PAD * 2;
  return {
    // The plate frames the object's bounding sphere at PLATE_VIEW.fill of its
    // half-height; the same radius, in viewport terms, is what the hand holds.
    fill: (PLATE_VIEW.fill * canvas) / vh,
    ndcX: single ? 0 : (((vw - card) / 2 + card * (1 - PLATE_COLUMN / 2)) / vw) * 2 - 1,
  };
}

// A few degrees off screen-horizontal so the held object does not read as a
// technical drawing.
const HAND_TILT_DEG = -8;

const LIFT_MS = 700;      // desk → hand, squaring up as it rises
const HOLD_MS = 160;      // a beat before it turns
const TURN_MS = 800;      // the half-turn
const FLIP_MS = 600;      // a later turn-over, clicked rather than automatic
const DRAG_PX = 4;        // pointer travel that makes a drag out of a click
const ROTATE_SPEED = 3.4; // radians per viewport height of drag

const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

// ── The handoff box ──────────────────────────────────────────────────────────
// One pending pose, written when the click enters the card and read once by
// the card's model plate. A pose older than this is a stale artifact of some
// other navigation and is ignored.
const HANDOFF_TTL_MS = 4000;
let pendingHandoff = null;

export function takeDeskHandoff() {
  const h = pendingHandoff;
  pendingHandoff = null;
  if (!h) return null;
  if (performance.now() - h.at > HANDOFF_TTL_MS) return null;
  return h;
}

/**
 * @param opts.camera    the desk camera (fixed)
 * @param opts.scene     the desk scene
 * @param opts.canvas    the desk canvas (pointer target)
 * @param opts.regime    () => "wide" | "square" | "vertical"
 * @param opts.onEnter   () => void — open the card
 * @param opts.onHold    (held, facing) => void — overlay/cursor follow-through
 */
export function createInspector({ camera, scene, canvas, regime, onEnter, onHold = () => {} }) {
  let model = null;         // the desk object, as placed by scene.js
  let modelFile = null;     // its GLB, warmed into the plate's cache on lift
  let pivot = null;         // rotates about the object's centre while held
  let rest = null;          // { position, quaternion, center } to return to
  let nLocal = null;        // the face that pointed up on the desk, pivot-local
  let lLocal = null;        // its long axis, pivot-local
  let state = "detached";   // detached | resting | lifting | inHand | lowering | handedOff
  let queue = [];           // chained tweens
  let anim = null;
  let facing = false;       // is the reverse toward the camera?

  const v = new THREE.Vector3();
  const camQuat = new THREE.Quaternion();
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();

  // ── Attach ─────────────────────────────────────────────────────────────────
  // Called once the object's model is loaded and placed. Its rest transform is
  // whatever scene.js gave it; the axes we need are read off that pose.
  function attach(obj, file) {
    model = obj;
    modelFile = file || null;
    state = "resting";
  }

  function readRestPose() {
    model.updateWorldMatrix(true, true);
    const box = new THREE.Box3().setFromObject(model, true);
    const center = new THREE.Vector3();
    box.getCenter(center);
    const size = new THREE.Vector3();
    box.getSize(size);
    const sphere = new THREE.Sphere();
    box.getBoundingSphere(sphere);

    rest = {
      position: model.position.clone(),
      quaternion: model.quaternion.clone(),
      center,
      radius: Math.max(sphere.radius, 1e-3),
    };

    // The object lies flat on the desk, so its visible face points at world up,
    // and its length runs along whichever horizontal axis of its bounds is
    // longer. Both are converted into the pivot's frame, so a remodelled object
    // (the key with its paper tag) needs no code change.
    const inv = rest.quaternion.clone().invert();
    nLocal = new THREE.Vector3(0, 1, 0).applyQuaternion(inv).normalize();
    const longWorld = size.x >= size.z ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 0, 1);
    lLocal = longWorld.applyQuaternion(inv).normalize();
    // Orthogonalise: the long axis lies in the face's plane.
    lLocal.addScaledVector(nLocal, -lLocal.dot(nLocal)).normalize();
  }

  // ── The hand pose ──────────────────────────────────────────────────────────
  // A point in front of the camera where the plate will be, far enough out that
  // the object reads at the size the plate will show it.
  function handPoint() {
    const g = plateGeometry();
    const y = HAND_Y[regime()] ?? HAND_Y.wide;
    const dist = rest.radius / (g.fill * Math.tan((camera.fov * Math.PI) / 360));
    const p = new THREE.Vector3(g.ndcX, y, 0.5).unproject(camera);
    return p.sub(camera.position).normalize().multiplyScalar(dist).add(camera.position);
  }

  // Square to the viewer: the face that lay upward turns to the camera, the
  // long axis runs across the screen (tilted a few degrees).
  function handQuaternion() {
    camera.getWorldQuaternion(camQuat);
    const toCam = new THREE.Vector3(0, 0, 1).applyQuaternion(camQuat).normalize();
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camQuat).normalize();
    right.applyAxisAngle(toCam, (HAND_TILT_DEG * Math.PI) / 180).normalize();
    const up = new THREE.Vector3().crossVectors(toCam, right).normalize();

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
    camera.getWorldQuaternion(camQuat);
    const toCam = new THREE.Vector3(0, 0, 1).applyQuaternion(camQuat);
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camQuat)
      .applyAxisAngle(toCam.normalize(), (HAND_TILT_DEG * Math.PI) / 180).normalize();
    const flip = new THREE.Quaternion().setFromAxisAngle(right, Math.PI);
    return flip.multiply(q.clone());
  }

  // Is the reverse — the face that lay against the desk — toward the camera?
  function facingReverse() {
    if (!pivot) return false;
    const n = nLocal.clone().applyQuaternion(pivot.quaternion).normalize();
    camera.getWorldQuaternion(camQuat);
    const toCam = new THREE.Vector3(0, 0, 1).applyQuaternion(camQuat).normalize();
    return n.dot(toCam) < -0.15; // a margin, so the edge-on pose commits to neither face
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
    const local = model.position.clone().sub(rest.center).applyQuaternion(rest.quaternion.clone().invert());
    model.position.copy(local);
    model.quaternion.identity();
    pivot.add(model);
    scene.add(pivot);
  }

  function release() {
    scene.add(model);            // reparents, keeping the object in the scene
    model.position.copy(rest.position);
    model.quaternion.copy(rest.quaternion);
    scene.remove(pivot);
    pivot = null;
  }

  // ── Tweens ─────────────────────────────────────────────────────────────────
  function tween({ to, ms, ease = easeInOut, hold = 0 }) {
    queue.push({ to, ms, ease, hold });
  }

  function startNext() {
    const next = queue.shift();
    if (!next) { anim = null; return false; }
    anim = {
      ...next,
      t0: performance.now() + (next.hold || 0),
      from: { position: pivot.position.clone(), quaternion: pivot.quaternion.clone() },
    };
    return true;
  }

  // Called from the desk's render loop, every frame.
  function tick() {
    if (!anim && !queue.length) return;
    if (!anim && !startNext()) return;
    const now = performance.now();
    if (now < anim.t0) return; // the beat before the turn
    const u = anim.ms > 0 ? Math.min(1, (now - anim.t0) / anim.ms) : 1;
    const e = anim.ease(u);
    if (anim.to.position) pivot.position.lerpVectors(anim.from.position, anim.to.position, e);
    if (anim.to.quaternion) pivot.quaternion.slerpQuaternions(anim.from.quaternion, anim.to.quaternion, e);
    if (u >= 1) {
      anim = null;
      if (!queue.length) settle();
      else startNext();
    }
    reportFacing();
  }

  // What the end of a chain means depends on which way we were going.
  function settle() {
    if (state === "lifting") { state = "inHand"; reportFacing(true); }
    else if (state === "lowering") { release(); state = "resting"; onHold(false, false); }
  }

  function reportFacing(force = false) {
    if (state !== "inHand") return;
    const f = facingReverse();
    if (force || f !== facing) { facing = f; onHold(true, f); }
  }

  // ── The gestures ───────────────────────────────────────────────────────────
  function lift() {
    if (state !== "resting") return;
    state = "lifting";
    grip();
    // Warm the card's copy of the model while the object is on its way up, so
    // the handoff has no load gap.
    if (modelFile) loadDeskModel(modelFile).catch(() => {});
    const front = handQuaternion();
    queue = [];
    anim = null;
    tween({ to: { position: handPoint(), quaternion: front }, ms: LIFT_MS });
    tween({ to: { quaternion: turnedOver(front) }, ms: TURN_MS, hold: HOLD_MS });
    startNext();
    onHold(true, false);
  }

  function lower() {
    if (state !== "inHand" && state !== "lifting") return;
    state = "lowering";
    queue = [];
    anim = null;
    tween({ to: { position: rest.center.clone(), quaternion: rest.quaternion.clone() }, ms: LIFT_MS });
    startNext();
  }

  function flip() {
    if (state !== "inHand") return;
    queue = [];
    anim = null;
    state = "lifting"; // busy: no clicks land mid-turn
    tween({ to: { quaternion: turnedOver(pivot.quaternion) }, ms: FLIP_MS });
    startNext();
  }

  // Record the pose the object was held at — its orientation relative to the
  // viewing camera — and let the card open. The plate reproduces it.
  function enter() {
    camera.getWorldQuaternion(camQuat);
    pendingHandoff = {
      at: performance.now(),
      file: modelFile,
      // Q_view = Q_camera⁻¹ · Q_object: what the object looks like from here.
      view: camQuat.clone().invert().multiply(pivot.quaternion.clone()).toArray(),
    };
    state = "handedOff";
    onHold(false, false);
    onEnter();
  }

  // ── Pointer ────────────────────────────────────────────────────────────────
  let dragging = false;
  let down = null;
  const last = { x: 0, y: 0 };

  function hitsObject(e) {
    if (!model) return false;
    ndc.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    return raycaster.intersectObject(model, true).length > 0;
  }

  function onPointerDown(e) {
    if (state !== "inHand") return;
    down = { x: e.clientX, y: e.clientY, onObject: hitsObject(e) };
    last.x = e.clientX;
    last.y = e.clientY;
    dragging = false;
    if (down.onObject) canvas.setPointerCapture?.(e.pointerId);
  }

  function onPointerMove(e) {
    if (state !== "inHand" || !down || !down.onObject) return;
    if (!dragging && Math.hypot(e.clientX - down.x, e.clientY - down.y) < DRAG_PX) return;
    dragging = true;
    canvas.style.cursor = "grabbing";
    const h = window.innerHeight;
    const dx = ((e.clientX - last.x) / h) * ROTATE_SPEED;
    const dy = ((e.clientY - last.y) / h) * ROTATE_SPEED;
    last.x = e.clientX;
    last.y = e.clientY;
    camera.getWorldQuaternion(camQuat);
    const up = v.set(0, 1, 0).applyQuaternion(camQuat).clone();
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camQuat);
    pivot.quaternion
      .premultiply(new THREE.Quaternion().setFromAxisAngle(right, dy))
      .premultiply(new THREE.Quaternion().setFromAxisAngle(up, dx));
    reportFacing();
  }

  function onPointerUp(e) {
    if (state !== "inHand") { down = null; return; }
    const wasDrag = dragging;
    const onObject = down?.onObject;
    if (down?.onObject) canvas.releasePointerCapture?.(e.pointerId);
    down = null;
    dragging = false;
    if (wasDrag) { updateCursor(); return; }
    if (!onObject) { lower(); return; }
    facingReverse() ? enter() : flip();
  }

  function updateCursor() {
    if (state === "resting" || state === "detached") return;
    canvas.style.cursor = state === "inHand" && facing ? "pointer" : "grab";
  }

  function onKey(e) {
    if (e.key !== "Escape") return;
    if (state === "inHand" || state === "lifting") { e.preventDefault(); lower(); }
  }

  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerup", onPointerUp);
  canvas.addEventListener("pointercancel", onPointerUp);
  document.addEventListener("keydown", onKey);

  return {
    attach,
    lift,
    lower,
    tick,
    updateCursor,
    isHeld: () => state !== "resting" && state !== "detached",
    isBusy: () => state === "lifting" || state === "lowering",
    // The card was left; the object is still in the hand where it was held.
    resume() { if (state === "handedOff") { state = "inHand"; reportFacing(true); } },
    owns: (obj) => !!model && (obj === model || (!!pivot && !!obj && obj.parent === pivot)),
  };
}
