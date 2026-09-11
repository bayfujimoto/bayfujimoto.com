// ── The desk — one scene, two lights ─────────────────────────────────────────
// The papers desk in WebGL: the wooden desk (desk.glb, its own wood), the
// folder, every document as a textured plane (paper.js draws them from
// desk-docs.js), the key, the amber, the stamp and the clips — one scene,
// real shadows. Two modes, switched with the Space key on the desk:
//
//   light — the overhead lamp: a warm spot above the desk that leans toward
//           the pointer, the desk as it has always been lit.
//   dark  — the flashlight: held low on an arc at the near edge, on the
//           cursor's side, aimed at the point under the cursor, so the beam
//           lands where the pointer is and rakes across the surface; a cookie
//           on the spot, a volumetric cone, dust through the room lit by the
//           beam, bloom on the hotspot, grain over the frame, and a cold
//           palette for the layers above (desk-dark.css).
//
// Going dark, the overhead goes out, a beat of darkness, then the flashlight
// stutters on. Coming back, the flashlight clicks off, a beat, and the lamp
// flickers back the way an old fixture does. The mode follows the system's
// colour scheme on arrival. Reduced motion switches at once.
//
// The fan (the series layer) is still pushed through panels.js: the lifted
// papers are clones drawn in a hand canvas above the veil, and the buttons
// that receive the clicks are DOM elements laid over them, so keyboard and
// screen readers see the same five documents. docs/desk-papers-plan.md.

import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { navigate } from "./router.js";
import { getState } from "./state.js";
import { dismissLoadingScreen } from "./loading.js";
import { DESK_OBJECTS, DESK_CLIPS, MODEL_BASE, WEB_BASE } from "../shared/desk-objects.js";
import { createModelLoader } from "./model-look.js";
import { isSceneRenderPaused } from "./scene.js";
import { configureAltDesk } from "./panels.js";
import { REGIMES, buildDocBundles, PX_PER_MM } from "./desk-docs.js";
import { renderPaper, paperNormal, ensureFonts, loadImage } from "./paper.js";
import "../styles/desk.css";
import "../styles/desk-dark.css";

// ── Tuning ───────────────────────────────────────────────────────────────────
// The numbers to move by eye. Distances in desk units (1 unit ≈ 78 mm).
const TUNE = {
  lamp: { color: 0xffeddc, intensity: 82, distance: 20, angle: Math.PI / 5, penumbra: 0.4, decay: 1.5, height: 8, ambient: [0xfff5ec, 0.4] },
  flashlight: {
    color: 0xe8efff, intensity: 115, angle: 26 * Math.PI / 180, penumbra: .5, decay: 2.3,
    radius: 3,       // the arc's radius around the desk centre
    height: 2,       // how high the hand is above the table
    sweep: 58,         // degrees the source swings each way as the cursor crosses the screen
    aimAt: [0, 0, 0.25],   // where the beam rests when nothing is pointing
    cookie: true,
  },
  ambient: { hemi: [0x6f86a6, 0x05070b, 0.32] },   // dark mode's fill
  darkEnv: 0.5,
  bloom: { strength: 0.42, radius: 0.55, threshold: 0.86 },
  volumetric: { opacity: 0.16 },
  dust: { count: 900, size: 0.01, box: [12, 2.6, 8] },
};
const regimeName = () => (window.innerWidth < 600 ? "vertical" : "wide");
const HALF_FOV = Math.tan((75 / 2) * Math.PI / 180);
const REF_STAGE_SCALE = 0.98;   // the wide stage's fitScale at 1440 × 900 — the flashlight's arc was tuned there
const REF_PX_PER_UNIT = 900 / (2 * 5 * HALF_FOV);     // stage px per desk unit at the reference viewport
const U = (px) => px / REF_PX_PER_UNIT;                // stage px → desk units (before the group's scale)
const esc = (t) => String(t ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

// ── Textures made here: the cookie, the folder ───────────────────────────────
function makeCookie() {
  // What a flashlight prints: a hot centre, a soft corona, faint rings from
  // the reflector, a little unevenness. Drawn once; projected by the spot.
  const N = 512, c = document.createElement("canvas"); c.width = c.height = N; const g = c.getContext("2d");
  g.fillStyle = "#000"; g.fillRect(0, 0, N, N);
  const cx = N / 2, cy = N / 2;
  const base = g.createRadialGradient(cx, cy, 0, cx, cy, N * 0.5);
  base.addColorStop(0, "#ffffff"); base.addColorStop(0.18, "#f4f7ff"); base.addColorStop(0.38, "#9aa6bd"); base.addColorStop(0.62, "#3a4152"); base.addColorStop(0.86, "#0c0e14"); base.addColorStop(1, "#000000");
  g.fillStyle = base; g.fillRect(0, 0, N, N);
  g.globalCompositeOperation = "lighter";
  for (const [r, a, wdt] of [[0.30, 0.10, 6], [0.44, 0.07, 9], [0.55, 0.05, 14]]) { g.strokeStyle = `rgba(255,255,255,${a})`; g.lineWidth = wdt; g.beginPath(); g.arc(cx, cy, N * r, 0, Math.PI * 2); g.stroke(); }
  const rr = rng(17);
  for (let i = 0; i < 26; i++) { const a = rr() * Math.PI * 2, d = N * (0.2 + rr() * 0.3); const x = cx + Math.cos(a) * d, y = cy + Math.sin(a) * d; const gr = g.createRadialGradient(x, y, 0, x, y, 30 + rr() * 50); gr.addColorStop(0, `rgba(255,255,255,${0.05 + rr() * 0.06})`); gr.addColorStop(1, "rgba(255,255,255,0)"); g.fillStyle = gr; g.fillRect(0, 0, N, N); }
  g.globalCompositeOperation = "source-over";
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function makeFolderTexture(w, h, color, opts = {}) {
  const sc = 2, c = document.createElement("canvas"); c.width = Math.ceil(w * sc); c.height = Math.ceil(h * sc); const g = c.getContext("2d"); g.scale(sc, sc);
  const rad = opts.radius || 4;
  g.beginPath(); g.moveTo(rad, 0); g.lineTo(w - rad, 0); g.quadraticCurveTo(w, 0, w, rad); g.lineTo(w, h - rad); g.quadraticCurveTo(w, h, w - rad, h); g.lineTo(rad, h); g.quadraticCurveTo(0, h, 0, h - rad); g.lineTo(0, rad); g.quadraticCurveTo(0, 0, rad, 0); g.closePath();
  g.fillStyle = color; g.fill(); g.clip();
  const grd = g.createRadialGradient(w * 0.2, h * 0.1, 0, w * 0.2, h * 0.1, w * 0.7); grd.addColorStop(0, "rgba(255,255,255,.10)"); grd.addColorStop(1, "rgba(10,8,5,.12)"); g.fillStyle = grd; g.fillRect(0, 0, w, h);
  if (opts.tab) { g.fillStyle = color; g.fillRect(opts.tab.x, 0, opts.tab.w, 1); }
  // grain + a couple of stains
  const noise = document.createElement("canvas"); noise.width = noise.height = 128; const ng = noise.getContext("2d"); const img = ng.createImageData(128, 128); const r = rng(9);
  for (let i = 0; i < img.data.length; i += 4) { img.data[i] = 60; img.data[i + 1] = 50; img.data[i + 2] = 36; img.data[i + 3] = Math.floor(r() * 90); } ng.putImageData(img, 0, 0);
  g.globalCompositeOperation = "multiply"; g.globalAlpha = 0.5; g.fillStyle = g.createPattern(noise, "repeat"); g.fillRect(0, 0, w, h); g.globalAlpha = 1;
  for (const [fx, fy, rad2, a] of [[0.72, 0.78, 60, 0.35], [0.12, 0.6, 90, 0.2]]) { const st = g.createRadialGradient(w * fx, h * fy, rad2 * 0.56, w * fx, h * fy, rad2); st.addColorStop(0, "rgba(120,70,20,0)"); st.addColorStop(0.5, `rgba(120,70,20,${a})`); st.addColorStop(1, "rgba(120,70,20,0)"); g.fillStyle = st; g.fillRect(0, 0, w, h); }
  g.globalCompositeOperation = "source-over";
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
}

// ── Init ─────────────────────────────────────────────────────────────────────
export async function initDesk() {
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  // The mode — light (the lamp) or dark (the flashlight) — from the system.
  let mode = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  const setPalette = (m) => { document.documentElement.dataset.mode = m; };
  setPalette(mode);
  let readyResolve; const whenReady = new Promise((r) => { readyResolve = r; });
  const ctx = { ready: false, whenReady };

  const canvas = document.getElementById("scene");
  if (!canvas) { dismissLoadingScreen(); return; }
  let renderer;
  try { renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: "high-performance" }); }
  catch (e) { dismissLoadingScreen(); return; }

  // ── The fan, registered now, furnished later ──
  // The series layer is the fan (the lifted bundle, in hand), and panels.js has
  // to know that before it restores a deep link — which it does the moment its
  // own archive fetch lands, i.e. while this function is still awaiting its
  // first fetch below. Registered any later and a deep link's series layer is
  // built from the fallback text list, so walking back up from the item to the
  // collection shows the list instead of the documents. Only `ctx` is needed to
  // hand back a sheet; the scene the sheet reads (camera, bundles, archive) is
  // filled into `fanDeps` once it exists, and the sheet's setup() already waits
  // on ctx.whenReady, which resolves after that.
  const fanDeps = { ctx };
  configureAltDesk({ seriesSheet: makeFanFactory(fanDeps) });
  // Budget: a phone renders at 1.5× at most; a desktop at 2× unless that is
  // more than ~6 MP, in which case the ratio comes down to meet it. Shadows
  // are 1K on a phone, 1.5K elsewhere, plain PCF, and only re-rendered when
  // something that casts or receives them has moved (see wantShadows).
  const PHONE = window.matchMedia("(pointer: coarse)").matches;
  const pixelRatio = () => { const dpr = window.devicePixelRatio || 1; const cap = PHONE ? 1.5 : 2; const mp = window.innerWidth * window.innerHeight; return Math.max(1, Math.min(dpr, cap, Math.sqrt(6e6 / mp))); };
  renderer.setPixelRatio(pixelRatio());
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setClearColor(0x03050a, 1);
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap; renderer.shadowMap.autoUpdate = false;
  const SHADOW = PHONE ? 1024 : 1536;
  let shadowsDirty = true; const wantShadows = () => { shadowsDirty = true; };
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.0;

  let awakeUntil = Infinity;   // frames are drawn until this time; Infinity until the desk is built
  const wake = (ms) => { const t = performance.now() + ms; if (awakeUntil === Infinity || t > awakeUntil) awakeUntil = t; };
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 100);
  camera.position.set(0, 5, 0.5); camera.lookAt(0, 0, 0);

  // ── Lights: the lamp (light mode) and the flashlight (dark mode) ──
  const Lp = TUNE.lamp;
  const lampAmbient = new THREE.AmbientLight(Lp.ambient[0], Lp.ambient[1]); scene.add(lampAmbient);
  const lamp = new THREE.SpotLight(Lp.color, Lp.intensity, Lp.distance, Lp.angle, Lp.penumbra, Lp.decay);
  lamp.position.set(0, Lp.height, -2); lamp.target.position.set(0, 0, 0);
  lamp.castShadow = true; lamp.shadow.mapSize.set(SHADOW, SHADOW); lamp.shadow.camera.near = 4; lamp.shadow.camera.far = 20; lamp.shadow.bias = -0.001; lamp.shadow.normalBias = 0.01;
  scene.add(lamp, lamp.target);
  const hemi = new THREE.HemisphereLight(...TUNE.ambient.hemi); scene.add(hemi);
  const F = TUNE.flashlight;
  const spot = new THREE.SpotLight(F.color, F.intensity, 0, F.angle, F.penumbra, F.decay);
  spot.castShadow = true; spot.shadow.mapSize.set(SHADOW, SHADOW);
  spot.shadow.camera.near = 0.5; spot.shadow.camera.far = 20; spot.shadow.bias = -0.00015; spot.shadow.normalBias = 0.01; spot.shadow.radius = 3;
  if (F.cookie) spot.map = makeCookie();
  scene.add(spot, spot.target);
  const aimAt = new THREE.Vector3(...F.aimAt);
  spot.target.position.copy(aimAt);

  // A black room with one cold panel for the metal to reflect.
  {
    const room = new THREE.Scene(); room.background = new THREE.Color(0x000000);
    const panel = (w, h, color, pos, rot) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide })); m.position.set(...pos); m.rotation.set(...rot); room.add(m); };
    panel(6, 2.2, 0x8ea3c4, [0, 6, -1], [Math.PI / 2, 0, 0]); panel(3, 1.2, 0x2c3949, [-7, 2, 0], [0, Math.PI / 2, 0]); panel(3, 1.2, 0x1d2634, [7, 2, 0], [0, -Math.PI / 2, 0]);
    const pm = new THREE.PMREMGenerator(renderer); scene.environment = pm.fromScene(room, 0.03).texture; scene.environmentIntensity = 0; pm.dispose();
  }

  // ── Post ──
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), TUNE.bloom.strength, TUNE.bloom.radius, TUNE.bloom.threshold);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  const manager = new THREE.LoadingManager();
  // The threshold lifts only when both the models and the papers are in —
  // the papers arrive last (their images), and a desk shown before them
  // was a stack of sheets at the origin.
  let modelsIn = false, papersIn = false;
  const maybeDismiss = () => { if (modelsIn && papersIn) { render(performance.now()); dismissLoadingScreen(); torchArrival(); } };
  manager.onLoad = () => { modelsIn = true; maybeDismiss(); };
  const loader = createModelLoader(manager);

  // ── The table: the wooden desk, its own materials ──
  const onDesk = (gltf) => {
    const desk = gltf.scene;
    const box = new THREE.Box3().setFromObject(desk); const size = new THREE.Vector3(); box.getSize(size);
    desk.scale.setScalar(20 / size.x); box.setFromObject(desk); desk.position.set(0, -box.max.y, 1);
    desk.traverse((c) => { if (c.isMesh) { c.receiveShadow = true; c.castShadow = false; } });
    scene.add(desk); wantShadows(); wake(600);
  };
  // the finished copy (WebP maps, meshopt; scripts/publish-desk-assets.js), the original if it isn't there
  loader.load(`${WEB_BASE}desk-web.glb`, onDesk, undefined, () => loader.load(`${MODEL_BASE}desk.glb`, onDesk));

  // ── The composition: folder, papers, objects, in one group scaled per regime ──
  const stageGroup = new THREE.Group(); scene.add(stageGroup);
  let regime = regimeName();
  const R = () => REGIMES[regime];
  const pxPerUnit = () => window.innerHeight / (2 * 5 * HALF_FOV);
  function fitScale() {
    const { w, h } = R().stage; const vertical = regime === "vertical";
    const pad = vertical ? 8 : 48;
    const s = vertical ? Math.min((window.innerWidth - pad * 2) / w, (window.innerHeight - 24) / h) : Math.min((window.innerWidth - pad * 2) / w, (window.innerHeight - pad * 2 - 40) / h);
    return s * (REF_PX_PER_UNIT / pxPerUnit());
  }
  // stage px → group-local units (the stage centred on the desk's origin)
  const gx = (sx) => U(sx - R().stage.w / 2), gz = (sy) => U(sy - R().stage.h / 2);

  const res = await fetch("/data/archive.json");
  const archive = await res.json();
  const bundles = buildDocBundles(archive);
  await ensureFonts();

  const paperNormalTex = new THREE.CanvasTexture(paperNormal()); paperNormalTex.wrapS = paperNormalTex.wrapT = THREE.RepeatWrapping;
  const folderMeshes = [];
  const bundleGroups = new Map();   // id → { group, hit, docs: [{ mesh, spec }] }
  const clickables = [];
  const hitPlanes = [];

  function buildFolder() {
    folderMeshes.forEach((m) => stageGroup.remove(m)); folderMeshes.length = 0;
    const Fd = R().folder;
    const under = new THREE.Mesh(new THREE.PlaneGeometry(U(Fd.w + 46), U(Fd.h - 20)), new THREE.MeshStandardMaterial({ map: makeFolderTexture(Fd.w + 46, Fd.h - 20, "#1f4a3a", { radius: 10 }), transparent: true, roughness: 0.85, normalMap: paperNormalTex, normalScale: new THREE.Vector2(0.4, 0.4) }));
    under.rotation.x = -Math.PI / 2; under.position.set(gx(Fd.x - 46 + (Fd.w + 46) / 2), 0.004, gz(Fd.y + 56 + (Fd.h - 20) / 2)); under.receiveShadow = true; under.castShadow = true;
    const folder = new THREE.Mesh(new THREE.PlaneGeometry(U(Fd.w), U(Fd.h)), new THREE.MeshStandardMaterial({ map: makeFolderTexture(Fd.w, Fd.h, "#d3bb85"), transparent: true, roughness: 0.9, normalMap: paperNormalTex, normalScale: new THREE.Vector2(0.5, 0.5) }));
    folder.rotation.x = -Math.PI / 2; folder.position.set(gx(Fd.x + Fd.w / 2), 0.009, gz(Fd.y + Fd.h / 2)); folder.receiveShadow = true; folder.castShadow = true;
    const tab = new THREE.Mesh(new THREE.PlaneGeometry(U(Fd.tab.w), U(22)), new THREE.MeshStandardMaterial({ map: makeFolderTexture(Fd.tab.w, 22, "#d3bb85", { radius: 3 }), transparent: true, roughness: 0.9 }));
    tab.rotation.x = -Math.PI / 2; tab.position.set(gx(Fd.x + Fd.tab.x + Fd.tab.w / 2), 0.0085, gz(Fd.y - 11)); tab.receiveShadow = true;
    [under, folder, tab].forEach((m) => { m.material.polygonOffset = true; m.material.polygonOffsetFactor = -1; stageGroup.add(m); folderMeshes.push(m); });
  }

  async function buildPapers() {
    const scale = Math.min(3, Math.max(2, window.devicePixelRatio || 1) * 1.5);
    // every sheet's images in flight at once, so the pile isn't one round trip per sheet
    await Promise.all(bundles.flatMap((b) => b.docs.flatMap((d) => (d.layers || []).filter((L) => L.src).map((L) => loadImage(L.src)))));
    for (const b of bundles) {
      const group = new THREE.Group(); stageGroup.add(group);
      const entry = { group, docs: [], hit: null, b };
      bundleGroups.set(b.id, entry);
      placeBundle(entry, b.id);   // in its place from the first frame, not at the origin until every sheet is drawn
      // the hit area: an invisible plane over the bundle's box
      const hit = new THREE.Mesh(new THREE.PlaneGeometry(U(b.box[0]), U(b.box[1])), new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false, transparent: true, opacity: 0 }));
      hit.rotation.x = -Math.PI / 2; hit.position.set(U(b.box[0] / 2), 0.05, U(b.box[1] / 2)); hit.userData = { bundle: b.id }; hit.renderOrder = 10;
      group.add(hit); hitPlanes.push(hit); entry.hit = hit;
      let i = 0;
      for (const d of b.docs) {
        const { canvas: pc } = await renderPaper(d, scale);
        const tex = new THREE.CanvasTexture(pc); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8; tex.generateMipmaps = true; tex.minFilter = THREE.LinearMipmapLinearFilter;
        const mat = d.gloss
          ? new THREE.MeshPhysicalMaterial({ map: tex, transparent: true, alphaTest: 0.5, roughness: 0.38, metalness: 0, clearcoat: 0.7, clearcoatRoughness: 0.2, normalMap: paperNormalTex, normalScale: new THREE.Vector2(0.12, 0.12), side: THREE.DoubleSide, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0 }) // a glossy print: smooth, with a coat that catches the lamp
          : new THREE.MeshStandardMaterial({ map: tex, transparent: true, alphaTest: 0.5, roughness: 0.92, metalness: 0, normalMap: paperNormalTex, normalScale: new THREE.Vector2(0.55, 0.55), side: THREE.DoubleSide, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0 }); // emissive = the hover lift, through the sheet's own image
        const mesh = new THREE.Mesh(new THREE.PlaneGeometry(U(d.w), U(d.h)), mat);
        mesh.rotation.x = -Math.PI / 2; mesh.rotation.z = -(d.rot || 0) * Math.PI / 180;
        mesh.position.set(U(d.x + d.w / 2), 0.014 + i * 0.0028, U(d.y + d.h / 2));
        mesh.castShadow = true; mesh.receiveShadow = true;
        mesh.customDepthMaterial = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: tex, alphaTest: 0.5 }); // the shadow follows the sheet's real outline (cutouts)
        mesh.userData = { bundle: b.id, sub: d.sub || null, spec: d };
        group.add(mesh); entry.docs.push({ mesh, spec: d }); i++;
      }
    }
  }
  function placeBundle(entry, id) {
    const Rg = R(); const Fd = Rg.folder;
    const p = Rg.bundles[id]; if (!p) return;
    const z = Rg.zorder.indexOf(id);
    entry.group.position.set(gx(Fd.x + p[0]), z * 0.012, gz(Fd.y + p[1])); entry.baseY = z * 0.012;
    entry.rect = { x: Fd.x + p[0], y: Fd.y + p[1], w: entry.b.box[0], h: entry.b.box[1] }; // stage px, for "what lies on top of what"
  }
  function layoutBundles() { bundleGroups.forEach(placeBundle); }

  // ── Objects & clips ──
  const objects = [];   // { id, model, base, cx, cz, posY, anchor }
  function fitModel(model, { w, h, d, ry = 0 }) {
    const box = new THREE.Box3().setFromObject(model); const size = new THREE.Vector3(); box.getSize(size);
    const base = Math.min(w / size.x, h / size.y, d / size.z); model.scale.setScalar(base); model.rotation.set(0, ry * Math.PI / 180, 0);
    box.setFromObject(model); const c = new THREE.Vector3(); box.getCenter(c);
    model.traverse((ch) => { if (ch.isMesh) { ch.castShadow = true; ch.receiveShadow = true; } });
    return { base, cx: c.x, cz: c.z, posY: -box.min.y };
  }
  function addObject(id, model, cfg, anchor, clickable) {
    const f = fitModel(model, cfg); stageGroup.add(model);
    objects.push({ id, model, ...f, anchor });
    if (clickable) {
      // Hit-test a box around the object, not its meshes: the key is
      // thousands of shells, and a raycast through them on every pointer
      // move stalled the frame while the beam was on it.
      const box = new THREE.Box3().setFromObject(model); const size = new THREE.Vector3(); box.getSize(size);
      const proxy = new THREE.Mesh(new THREE.BoxGeometry(size.x, size.y, size.z), new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false, transparent: true, opacity: 0 }));
      proxy.userData.altId = id; proxy.renderOrder = 10; model.add(proxy);
      proxy.position.copy(box.getCenter(new THREE.Vector3())).sub(model.position).divideScalar(model.scale.x); proxy.scale.setScalar(1 / model.scale.x);
      clickables.push(proxy);
    }
    placeObjects();
  }
  function placeObjects() {
    wantShadows(); wake(600);
    objects.forEach((o) => {
      const a = o.anchor(); if (!a) return;
      o.model.scale.setScalar(o.base);
      o.model.position.set(gx(a.x) - o.cx, o.posY + (o.onBundle ? topOfBundle(o.onBundle) : 0), gz(a.y) - o.cz);
    });
  }
  const objectAnchor = (id) => () => R().objects[id];
  const onKey = (gltf) => addObject("guide", gltf.scene, { w: 1, h: 1, d: 1, ry: 90 }, objectAnchor("guide"), true);
  loader.load(`${WEB_BASE}${DESK_OBJECTS.guide.lite || DESK_OBJECTS.guide.file}`, onKey, undefined, () => loader.load(`${WEB_BASE}${DESK_OBJECTS.guide.file}`, onKey));
  {
    const geo = new THREE.IcosahedronGeometry(0.5, 2); const pos = geo.attributes.position; const r = rng(42); const v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) { v.fromBufferAttribute(pos, i); v.multiplyScalar(0.82 + 0.28 * Math.sin(v.x * 5.1 + 1.3) * Math.cos(v.z * 4.3) + 0.08 * (r() - 0.5)); v.y *= 0.6; pos.setXYZ(i, v.x, v.y, v.z); }
    geo.computeVertexNormals();
    const mat = new THREE.MeshPhysicalMaterial({ color: 0xd9902a, roughness: 0.28, metalness: 0, transmission: 0.55, thickness: 0.9, ior: 1.54, attenuationColor: new THREE.Color(0x8a4a10), attenuationDistance: 0.8, clearcoat: 0.6 });
    addObject("amber", new THREE.Mesh(geo, mat), { w: 0.9, h: 0.6, d: 0.9, ry: -20 }, objectAnchor("amber"), true);
  }
  {
    const stamp = new THREE.Group();
    stamp.add(new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.3, 0.3), new THREE.MeshStandardMaterial({ color: 0x8a8274, roughness: 0.7 })));
    const face = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.26, 0.26), new THREE.MeshStandardMaterial({ color: 0x5f584d, roughness: 0.8 })); face.position.x = -0.47; stamp.add(face);
    addObject("stamp", stamp, { w: 0.9, h: 0.3, d: 0.3, ry: 0 }, objectAnchor("stamp"), true);
  }
  const clipLoader = createModelLoader();
  bundles.forEach((b) => (b.clips || []).forEach((c, i) => {
    const len = U((DESK_CLIPS[c.kind]?.mm || 40) * PX_PER_MM) * (c.small ? 0.7 : 1);
    const anchor = () => { const Rg = R(); const p = Rg.bundles[b.id]; return p ? { x: Rg.folder.x + p[0] + c.x, y: Rg.folder.y + p[1] + c.y } : null; };
    clipLoader.load(`${WEB_BASE}${DESK_CLIPS[c.kind]?.file || `desk-clip-${c.kind}.glb`}`, (gltf) => {
      addObject(`clip:${b.id}:${i}`, gltf.scene, { w: len, h: len, d: len, ry: c.r }, anchor, false);
      objects[objects.length - 1].onBundle = b.id;
      placeObjects();
    }, undefined, () => {});
  }));
  // a clip sits on its bundle's top sheet
  function topOfBundle(id) { const e = bundleGroups.get(id); const z = R().zorder.indexOf(id); return (z >= 0 ? z * 0.012 : 0) + 0.014 + ((e?.docs.length || 1) - 1) * 0.0028 + 0.002; }

  // ── The flashlight on its arc ──
  const pointerNdc = new THREE.Vector2(0, 0);
  let havePointer = false;
  const aimRay = new THREE.Raycaster(), deskPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), aimHit = new THREE.Vector3();
  const aimPoint = new THREE.Vector3(...F.aimAt);
  const setAim = (nx, ny) => {
    pointerNdc.set(nx, ny);
    aimRay.setFromCamera(pointerNdc, camera);
    if (aimRay.ray.intersectPlane(deskPlane, aimHit)) { aimPoint.copy(aimHit); havePointer = true; }
  };
  let touching = false;
  window.addEventListener("pointermove", (e) => { if (e.pointerType === "touch") touching = true; setAim((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1); }, { passive: true });
  window.addEventListener("pointerdown", (e) => { if (e.pointerType === "touch") { touching = true; setAim((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1); } }, { passive: true });
  window.addEventListener("pointerup", () => { touching = false; }, { passive: true });
  window.addEventListener("pointercancel", () => { touching = false; }, { passive: true });
  document.addEventListener("mouseleave", () => { havePointer = false; });

  // The gyro: on a phone the beam also follows the hand that holds it. The
  // pose at the first reading is "straight ahead"; tilting the phone swings
  // the beam from there, and a finger on the glass overrides it while down.
  // iOS asks permission, and only from a tap — so the request rides the first
  // touch; Android and the rest just start listening.
  const coarse = PHONE;
  const gyro = { on: false, b0: null, g0: null, x: 0, y: 0 };
  function onOrientation(e) {
    if (e.beta == null || e.gamma == null) return;
    if (gyro.b0 == null) { gyro.b0 = e.beta; gyro.g0 = e.gamma; }
    const clamp = (v) => Math.max(-1, Math.min(1, v));
    // ~22° of tilt either way swings the beam edge to edge; eased so a still hand rests
    const tx = clamp((e.gamma - gyro.g0) / 22), ty = clamp(-(e.beta - gyro.b0) / 22);
    gyro.x += (tx - gyro.x) * 0.35; gyro.y += (ty - gyro.y) * 0.35; gyro.on = true;
    if (!touching) setAim(gyro.x, gyro.y);
  }
  if (coarse && typeof DeviceOrientationEvent !== "undefined") {
    if (typeof DeviceOrientationEvent.requestPermission === "function") {
      // Safari grants motion only from inside a tap's own handler (touchend or
      // click, synchronously); keep asking on taps until it answers, since a
      // tap that lands on the loading screen or a button may not count.
      let asked = false;
      const ask = () => {
        if (asked) return;
        let pr; try { pr = DeviceOrientationEvent.requestPermission(); } catch (e) { return; }
        asked = true;
        const done = () => { window.removeEventListener("touchend", ask); window.removeEventListener("click", ask); };
        pr.then((r) => { if (r === "granted") { window.addEventListener("deviceorientation", onOrientation, { passive: true }); done(); } else done(); })   // denied: Safari remembers until reload
          .catch(() => { asked = false; });                                                                                                                 // not from a gesture: try on the next tap
      };
      window.addEventListener("touchend", ask, { passive: true });
      window.addEventListener("click", ask, { passive: true });
    } else window.addEventListener("deviceorientation", onOrientation, { passive: true });
  }
  const t0 = performance.now();
  const lampPos = { x: 0, z: -2 };
  function aimLamp() {
    // The overhead leans toward the pointer and stays over the desk's middle.
    const mx = havePointer ? pointerNdc.x : 0, my = havePointer ? pointerNdc.y : 0;
    const nx = lampPos.x + (mx - lampPos.x) * 0.08, nz = lampPos.z + ((-2 + -my * 0.5) - lampPos.z) * 0.08;
    if (Math.abs(nx - lampPos.x) > 1e-4 || Math.abs(nz - lampPos.z) > 1e-4) { lampPos.x = nx; lampPos.z = nz; wantShadows(); wake(120); }
    lamp.position.x = lampPos.x; lamp.position.z = lampPos.z; lamp.target.updateMatrixWorld();
  }
  function aim(now) {
    // The hand: on the arc at the near edge, on the cursor's side. The beam:
    // at the point under the cursor. Both move at once, without lag.
    const x = havePointer ? pointerNdc.x : 0;
    const target = havePointer ? aimPoint : aimAt;
    const t = (now - t0) / 1000;
    const sway = reduceMotion ? 0 : 1;
    const theta = (x * F.sweep + sway * (Math.sin(t * 0.6) * 1.2 + Math.sin(t * 1.7) * 0.4)) * Math.PI / 180;
    // the arc is the desk's: it scales with the stage, so on a phone the hand
    // sits at the near edge of the smaller desk exactly as it does on a wide one
    const k = stageGroup.scale.x / REF_STAGE_SCALE, radius = F.radius * k, height = F.height * k;
    spot.position.set(aimAt.x + Math.sin(theta) * radius, height + sway * Math.sin(t * 0.8) * 0.02, aimAt.z + Math.cos(theta) * radius);
    spot.target.position.set(target.x + sway * Math.sin(t * 0.5) * 0.04, 0, target.z + sway * Math.cos(t * 0.43) * 0.03);
    spot.target.updateMatrixWorld();
    // A beam aimed near the hand would blow out; hold the pool's exposure
    // roughly level as the throw shortens (the eye does the same).
    const d = spot.position.distanceTo(spot.target.position);
    spot.intensity = F.intensity * k * k * Math.max(0.3, Math.pow(d / radius, 1.25)) * torch;
  }

  // ── The switch ──
  // Two factors the render loop applies every frame: `lampF` for the
  // overhead and its warm ambient, `torch` for the flashlight and everything
  // that belongs to it (the cone, the dust, the cold fill, the room to
  // reflect). A change of mode is a short timeline that drives them.
  // Arriving in the dark, the flashlight is off until the threshold lifts,
  // then stutters on (torchArrival, fired from maybeDismiss).
  let lampF = mode === "light" ? 1 : 0, torch = mode === "dark" && !reduceMotion ? 0 : (mode === "dark" ? 1 : 0);
  let timeline = null;   // { start, steps: [{ at, lamp, torch }] } — piecewise, holds the last step
  const rr = rng(77);
  const jitter = (arr, base) => arr.map((st) => ({ ...st, at: st.at + base * (rr() - 0.5) * 0.35 }));
  function goDark() {
    // the overhead goes out; a beat; the flashlight stutters on
    const t = [{ at: 0, lamp: 1, torch: 0 }, { at: 60, lamp: 0.35, torch: 0 }, { at: 120, lamp: 0, torch: 0 }, { at: 380, lamp: 0, torch: 0.55 }, { at: 440, lamp: 0, torch: 0 }, { at: 530, lamp: 0, torch: 0.8 }, { at: 590, lamp: 0, torch: 0.15 }, { at: 660, lamp: 0, torch: 0.95 }, { at: 740, lamp: 0, torch: 0.6 }, { at: 800, lamp: 0, torch: 1 }];
    timeline = { start: performance.now(), steps: jitter(t, 80) };
    setPalette("dark");
    // nothing is hovered in the dark: drop the highlight now, hold it until the flashlight is on
    hoverHold = true; litBundle = null; hovered = null; hideHover();
  }
  function torchArrival() {
    // the site opened in the dark: a beat of black as the threshold lifts, then the flashlight stutters on
    if (mode !== "dark" || reduceMotion || torch === 1) return;
    const t = [{ at: 0, lamp: 0, torch: 0 }, { at: 700, lamp: 0, torch: 0.55 }, { at: 760, lamp: 0, torch: 0 }, { at: 850, lamp: 0, torch: 0.8 }, { at: 910, lamp: 0, torch: 0.15 }, { at: 980, lamp: 0, torch: 0.95 }, { at: 1060, lamp: 0, torch: 0.6 }, { at: 1120, lamp: 0, torch: 1 }];
    timeline = { start: performance.now(), steps: jitter(t, 80) };
    hoverHold = true; litBundle = null; hovered = null; hideHover();
  }
  function goLight() {
    // the lamp fades up quickly; the flashlight clicks off right as it comes on
    const t = [{ at: 0, lamp: 0, torch: 1 }, { at: 220, lamp: 0.8, torch: 1, lerp: true }, { at: 225, lamp: 0.8, torch: 0 }, { at: 300, lamp: 1, torch: 0, lerp: true }];
    timeline = { start: performance.now(), steps: t };
    setTimeout(() => setPalette("light"), 200);
  }
  function setMode(next) {
    if (next === mode) return;
    mode = next; wake(2000);
    if (reduceMotion) { lampF = mode === "light" ? 1 : 0; torch = mode === "dark" ? 1 : 0; timeline = null; setPalette(mode); return; }
    if (mode === "dark") goDark(); else goLight();
  }
  function tickTimeline(now) {
    if (!timeline) return;
    const e = now - timeline.start; const steps = timeline.steps;
    let i = 0; while (i + 1 < steps.length && e >= steps[i + 1].at) i++;
    const cur = steps[i], next = steps[i + 1];
    if (next && next.lerp) {   // a fade into the next step, rather than a cut
      const f = Math.min(1, Math.max(0, (e - cur.at) / (next.at - cur.at)));
      lampF = cur.lamp + (next.lamp - cur.lamp) * f; torch = cur.torch + (next.torch - cur.torch) * f;
    } else { lampF = cur.lamp; torch = cur.torch; }
    if (e > steps[steps.length - 1].at) { timeline = null; if (hoverHold) { hoverHold = false; pendingPick = lastPointer; } } // the beam is on: hover resumes where the pointer is
  }
  function applyFactors() {
    lamp.intensity = Lp.intensity * lampF; lampAmbient.intensity = Lp.ambient[1] * lampF;
    lamp.visible = lampF > 0.001;
    hemi.intensity = TUNE.ambient.hemi[2] * torch;
    scene.environmentIntensity = TUNE.darkEnv * torch;
    spot.visible = torch > 0.001;
    bloom.strength = TUNE.bloom.strength * torch;
    coneMat.uniforms.uOpacity.value = TUNE.volumetric.opacity * torch;
    dustMat.uniforms.uTorch.value = torch;
    if (grainEl) grainEl.style.opacity = String(0.11 * torch);
  }
  // Space, on the desk, toggles the mode.
  window.addEventListener("keydown", (e) => {
    if (e.code !== "Space" || e.repeat || e.altKey || e.ctrlKey || e.metaKey) return;
    const tag = (e.target && e.target.tagName) || "";
    if (/INPUT|TEXTAREA|SELECT/.test(tag) || e.target?.isContentEditable) return;
    if (getState().layer !== "desk") return;
    e.preventDefault();
    setMode(mode === "dark" ? "light" : "dark");
  });
  let grainEl = null;

  // ── Volumetric cone ──
  const coneMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: { uColor: { value: new THREE.Color(F.color) }, uOpacity: { value: TUNE.volumetric.opacity }, uTime: { value: 0 } },
    vertexShader: `varying vec3 vLocal; void main(){ vLocal = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `uniform vec3 uColor; uniform float uOpacity; uniform float uTime; varying vec3 vLocal;
      float hash(vec3 p){ return fract(sin(dot(p, vec3(12.9898,78.233,37.719)))*43758.5453); }
      void main(){
        float t = clamp(0.5 - vLocal.y, 0.0, 1.0);          // 0 at the lamp (the apex, +y), 1 at the desk (the base, −y)
        float r = length(vLocal.xz) / (0.02 + t * 1.0);      // radial, normalised to the cone's width here
        float radial = pow(clamp(1.0 - r * r, 0.0, 1.0), 1.6);
        float along = (1.0 - 0.6 * t) * smoothstep(0.0, 0.06, t);   // densest near the lamp, thinning toward the desk
        float n = 0.85 + 0.15 * hash(floor(vLocal * 40.0 + uTime * 0.2));
        gl_FragColor = vec4(uColor, radial * along * uOpacity * n);
      }`,
  });
  // unit cone: apex (radius 0.02) at y=+0.5, base (radius 1) at y=−0.5 — scaled per frame
  const coneGeo = new THREE.CylinderGeometry(0.02, 1.0, 1.0, 40, 1, true);
  const cone = new THREE.Mesh(coneGeo, coneMat); cone.renderOrder = 20; scene.add(cone);
  const coneUp = new THREE.Vector3(0, -1, 0), coneDir = new THREE.Vector3(), coneQ = new THREE.Quaternion();
  function placeCone() {
    coneDir.subVectors(spot.target.position, spot.position); const L = coneDir.length(); coneDir.normalize();
    const rad = Math.tan(F.angle) * L * 0.92;
    cone.scale.set(rad, L, rad);
    coneQ.setFromUnitVectors(new THREE.Vector3(0, -1, 0), coneDir);  // local −y (the base) toward the target; the apex stays at the lamp
    cone.quaternion.copy(coneQ);
    cone.position.copy(spot.position).addScaledVector(coneDir, L / 2);
  }

  // ── Dust, everywhere, lit by the cone ──
  const dustMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uTorch: { value: 1 }, uLightPos: { value: new THREE.Vector3() }, uLightDir: { value: new THREE.Vector3() }, uCosOuter: { value: Math.cos(F.angle) }, uCosInner: { value: Math.cos(F.angle * (1 - F.penumbra)) }, uSize: { value: TUNE.dust.size * renderer.getPixelRatio() * window.innerHeight }, uColor: { value: new THREE.Color(F.color) } },
    vertexShader: `uniform float uTime; uniform float uTorch; uniform vec3 uLightPos; uniform vec3 uLightDir; uniform float uCosOuter; uniform float uCosInner; uniform float uSize;
      attribute vec3 seed; varying float vLit;
      void main(){
        vec3 p = position;
        p.x += sin(uTime * 0.11 + seed.x * 6.283) * 0.25 + sin(uTime * 0.37 + seed.z * 9.0) * 0.06;
        p.z += cos(uTime * 0.09 + seed.y * 6.283) * 0.25;
        p.y += mod(seed.z * 5.0 + uTime * 0.012 * (0.4 + seed.x), 2.6) - 1.3;
        vec3 toP = p - uLightPos; float d = length(toP); toP /= d;
        float c = dot(toP, uLightDir);
        float spot = smoothstep(uCosOuter, uCosInner, c);
        float att = 1.0 / (1.0 + d * d * 0.09);
        vLit = (spot * att * 1.1 + 0.004) * uTorch;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_PointSize = uSize * (0.6 + 0.8 * seed.y) / -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `uniform vec3 uColor; varying float vLit;
      void main(){ vec2 q = gl_PointCoord - 0.5; float a = smoothstep(0.5, 0.05, length(q)); gl_FragColor = vec4(uColor, a * vLit); }`,
  });
  let dust;
  {
    const N = TUNE.dust.count, [bw, bh, bd] = TUNE.dust.box; const r = rng(31);
    const pos = new Float32Array(N * 3), seed = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) { pos[i * 3] = (r() - 0.5) * bw; pos[i * 3 + 1] = 0.05 + r() * bh; pos[i * 3 + 2] = (r() - 0.5) * bd; seed[i * 3] = r(); seed[i * 3 + 1] = r(); seed[i * 3 + 2] = r(); }
    const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.BufferAttribute(pos, 3)); g.setAttribute("seed", new THREE.BufferAttribute(seed, 3));
    dust = new THREE.Points(g, dustMat); dust.frustumCulled = false; dust.renderOrder = 21; scene.add(dust);
  }

  // ── Hover and click ──
  const hover = document.createElement("div");
  hover.className = "layer-meta scene-hover-meta desk-alt-hover";
  hover.innerHTML = `<h1 class="overlay-title"></h1><p class="overlay-subtitle"></p>`;
  document.body.appendChild(hover);
  const showHover = (title, sub) => { hover.querySelector("h1").textContent = title; hover.querySelector("p").textContent = sub; hover.classList.add("is-on"); };
  const hideHover = () => hover.classList.remove("is-on");
  const ray = new THREE.Raycaster(); const pointer = new THREE.Vector2();
  const FLAT = new Set(["labor", "accumulation"]);
  const OBJECT_INFO = {
    guide: () => ({ title: archive.guide?.label || "Guide", sub: archive.guide?.subtitle || archive.guide?.container || "key" }),
    amber: () => ({ title: "Amber", sub: "unresolved" }),
    stamp: () => ({ title: "Seal", sub: "the instrument — the sheet is the entry" }),
  };
  function pick(e) {
    pointer.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
    ray.setFromCamera(pointer, camera);
    const h = ray.intersectObjects([...clickables, ...hitPlanes], false)[0];
    if (!h) return null;
    return h.object.userData.altId ? { kind: "object", id: h.object.userData.altId } : { kind: "bundle", id: h.object.userData.bundle };
  }
  let hovered = null, pendingPick = null, lastPointer = null, hoverHold = false;
  // Hover, without breaking the pile: the sheets glow a little through their
  // own image, and the bundle rises a hair —
  // together with every bundle stacked on top of it, so nothing passes
  // through anything: the column lifts as one, pushed from underneath.
  let litBundle = null;
  const overlaps = (a, b) => a && b && a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
  function liftSet(id) {
    const out = new Set(); if (!id || !bundleGroups.has(id)) return out;
    out.add(id); let grew = true;
    while (grew) { grew = false; bundleGroups.forEach((e, k) => { if (out.has(k)) return; for (const j of out) { const h = bundleGroups.get(j); if (e.baseY > h.baseY && overlaps(e.rect, h.rect)) { out.add(k); grew = true; break; } } }); }
    return out;
  }
  function tickHighlight() {
    const dark = mode === "dark";
    const peak = dark ? 0.12 : 0.26, lift = 0.006;
    const lifted = liftSet(litBundle);
    bundleGroups.forEach((entry, id) => {
      const on = id === litBundle, target = on ? peak : 0;
      for (const d of entry.docs) { const m = d.mesh.material; const v = m.emissiveIntensity + (target - m.emissiveIntensity) * 0.18; if (Math.abs(v - m.emissiveIntensity) > 1e-4) { m.emissiveIntensity = v; wake(120); } }
      const y = entry.group.position.y + ((entry.baseY || 0) + (lifted.has(id) ? lift : 0) - entry.group.position.y) * 0.18;
      if (Math.abs(y - entry.group.position.y) > 1e-5) { entry.group.position.y = y; wantShadows(); wake(120); }
    });
  }
  canvas.addEventListener("pointermove", (e) => { pendingPick = e; lastPointer = e; }, { passive: true });
  function hoverTick() {
    const e = pendingPick; if (!e) return; pendingPick = null;
    if (getState().layer !== "desk" || hoverHold) return;
    const p = pick(e); const key = p ? p.kind + ":" + p.id : null;
    if (key === hovered) return; hovered = key;
    litBundle = p && p.kind === "bundle" ? p.id : null;
    if (!p) { hideHover(); canvas.style.cursor = "default"; return; }
    if (p.kind === "object") { const i = OBJECT_INFO[p.id](); showHover(i.title, i.sub); canvas.style.cursor = p.id === "guide" ? "pointer" : "default"; }
    else { const info = archive.series[p.id] || {}; const flat = FLAT.has(p.id) || Object.keys(info.subcollections || {}).length <= 1; showHover(info.label || p.id, flat ? `${info.items?.length || ""} records`.trim() : (info.subtitle || info.container || "")); canvas.style.cursor = "pointer"; }
  }
  canvas.addEventListener("click", (e) => {
    if (getState().layer !== "desk") return;
    const p = pick(e); if (!p) return;
    hideHover(); litBundle = null; hovered = null;
    if (p.kind === "object") { if (p.id === "guide") navigate({ layer: "guide" }); return; }
    navigate({ layer: "series", series: p.id, subcollection: null, item: null });
  });

  // ── The fan, in hand — the scene it lifts from ──
  Object.assign(fanDeps, { camera, bundleGroups, stageGroup, archive, reduceMotion, getMode: () => mode, wantShadows, wake });

  // ── Build ──
  buildFolder();
  stageGroup.scale.setScalar(fitScale());
  await buildPapers();
  layoutBundles();
  ctx.ready = true; readyResolve();
  papersIn = true; maybeDismiss();
  awakeUntil = performance.now() + 3000; wantShadows();   // from here on, frames on demand

  // ── Render ──
  function render(now) {
    hoverTick(); tickHighlight();
    tickTimeline(now); applyFactors();
    aimLamp(); aim(now); placeCone();
    const lit = torch > 0.001;
    cone.visible = lit; dust.visible = lit;
    if (lit) {
      coneMat.uniforms.uTime.value = (now - t0) / 1000;
      dustMat.uniforms.uTime.value = (now - t0) / 1000;
      dustMat.uniforms.uLightPos.value.copy(spot.position);
      dustMat.uniforms.uLightDir.value.subVectors(spot.target.position, spot.position).normalize();
      wantShadows();   // the hand sways: the beam's shadows move every frame
    }
    if (shadowsDirty) { renderer.shadowMap.needsUpdate = true; shadowsDirty = false; }
    // the bloom chain (five blurred mips at full resolution) only earns its
    // keep under the flashlight; the lamp renders straight to the canvas
    if (lit) composer.render(); else renderer.render(scene, camera);
  }
  // The loop runs only while something is changing. Light mode is still
  // between inputs — the lamp settles, the hover eases, then nothing — so a
  // frame is drawn on demand (wake(ms) asks for frames for a while). Dark
  // mode sways and drifts and stays live; a phone takes it at 30 fps.
  let lastFrame = 0;
  function animate(now) {
    requestAnimationFrame(animate);
    if (isSceneRenderPaused()) return;
    const live = torch > 0.001 || !!timeline;
    if (!live && now > awakeUntil && !pendingPick) return;
    if (live && PHONE && now - lastFrame < 30) return;
    lastFrame = now; render(now);
  }
  if (reduceMotion) { render(performance.now()); wake(1500); }
  animate(performance.now());
  window.addEventListener("pointermove", () => wake(1400), { passive: true });   // the lamp drift takes ~1 s to settle
  window.addEventListener("pointerdown", () => wake(1400), { passive: true });
  window.addEventListener("keydown", () => wake(1400));
  document.addEventListener("visibilitychange", () => { if (!document.hidden) { wantShadows(); wake(600); } });
  // If the context is ever lost anyway (a phone backgrounded, a driver reset),
  // three re-uploads everything on restore — but the on-demand loop has no
  // reason to draw, so the desk would sit there black with a perfectly good
  // context. Ask for frames.
  canvas.addEventListener("webglcontextrestored", () => { wantShadows(); wake(1500); });

  window.addEventListener("resize", () => {
    camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix();
    renderer.setPixelRatio(pixelRatio()); renderer.setSize(window.innerWidth, window.innerHeight); composer.setSize(window.innerWidth, window.innerHeight); wantShadows(); wake(600);
    dustMat.uniforms.uSize.value = TUNE.dust.size * renderer.getPixelRatio() * window.innerHeight;
    const next = regimeName();
    if (next !== regime) { regime = next; buildFolder(); layoutBundles(); placeObjects(); }
    stageGroup.scale.setScalar(fitScale());
    if (reduceMotion) render(performance.now());
  });

  // grain
  {
    const c = document.createElement("canvas"); c.width = c.height = 256;
    const g = c.getContext("2d"); const img = g.createImageData(256, 256); const r = rng(3);
    for (let i = 0; i < img.data.length; i += 4) { const v = 96 + Math.floor(r() * 96); img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255; }
    g.putImageData(img, 0, 0);
    const grain = document.createElement("div"); grain.className = "look-grain"; grain.setAttribute("aria-hidden", "true");
    grain.style.backgroundImage = `url(${c.toDataURL()})`; grain.style.opacity = String(0.11 * torch); document.body.appendChild(grain);
    grainEl = grain;
    if (!reduceMotion) { let f = 0; (function jitterGrain() { requestAnimationFrame(jitterGrain); if (++f % 3) return; grain.style.backgroundPosition = `${Math.floor(Math.random() * 256)}px ${Math.floor(Math.random() * 256)}px`; })(); }
  }
}

// ── The fan — the series layer, in hand ──────────────────────────────────────
// Clones of the bundle's document planes rise out of the desk into a row in
// front of the camera, drawn in a hand canvas above the veil; DOM buttons
// laid over them carry the clicks, the hover, keyboard focus and labels.
const LIFT_MS = 900, LOWER_MS = 340;
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

// `D` is filled in by initDesk once the scene exists (see fanDeps there), so
// everything it carries is read inside setup(), which runs no earlier than
// D.ctx.whenReady.
function makeFanFactory(D) {
  return function makeFanSheet(seriesKey, H) {
    const veil = H.makeVeil(() => navigate({ layer: "desk" }));
    const content = H.makeContent(); content.classList.add("da-fan-content");
    const escOff = H.attachEscapeHandler(content, () => navigate({ layer: "desk" }));
    let teardown = () => {};

    function setup() {
      const { camera, bundleGroups, stageGroup, archive, reduceMotion, getMode, wantShadows, wake } = D;
      const s = archive?.series[seriesKey]; if (!s) return;
      const entry = bundleGroups.get(seriesKey);
      // hand canvas + renderer + scene
      const hc = document.createElement("canvas"); hc.className = "desk-hand-canvas"; hc.setAttribute("aria-hidden", "true");
      hc.style.cssText = `position:fixed;inset:0;z-index:${(parseInt(content.style.getPropertyValue("--depth")) || 1) * 10 + 1};pointer-events:none;display:block`;
      document.body.appendChild(hc);
      const hr = new THREE.WebGLRenderer({ canvas: hc, antialias: true, alpha: true });
      hr.setPixelRatio(Math.min(window.devicePixelRatio, 2)); hr.setSize(window.innerWidth, window.innerHeight); hr.setClearColor(0, 0);
      hr.toneMapping = THREE.ACESFilmicToneMapping;
      const hs = new THREE.Scene();
      const dark = getMode() === "dark";
      // lit to match the desk: the cool overhead (TUNE.lamp) or the flashlight
      // (light mode is deliberately neutral: the desk's sheets read near-white
      // under the lamp plus the room's environment, and any tint here shows)
      hs.add(new THREE.HemisphereLight(dark ? 0xdfe8f8 : 0xffffff, dark ? 0x1a1e26 : 0x9c9c9c, dark ? 0.9 : 0.66));
      const key = new THREE.DirectionalLight(dark ? 0xe8efff : 0xfffaf4, dark ? 1.6 : 1.0); key.position.set(-1.5, 4, 3); hs.add(key);

      const meta = document.createElement("div"); meta.className = "layer-meta";
      meta.innerHTML = `<h1 class="overlay-title">${esc(s.label)}</h1><p class="overlay-subtitle">${esc(s.subtitle || s.container || "")}</p>`;
      document.body.appendChild(meta); meta.style.zIndex = String((parseInt(content.style.getPropertyValue("--depth")) || 1) * 10 + 2);
      const subtitleRest = s.subtitle || s.container || "";
      const setSubtitle = (t) => { const p = meta.querySelector(".overlay-subtitle"); if (p) p.textContent = t; };
      content.appendChild(H.makeBreadcrumb([{ label: "desk", onClick: () => navigate({ layer: "desk" }) }, { label: s.label, current: true }]));

      const subs = Object.keys(s.subcollections || {});
      const papers = subs.map((k) => {
        const src = entry?.docs.find((d) => d.spec.sub === k) || null;
        const label = s.subcollections[k].label || k, count = H.subcollectionCount(seriesKey, k);
        let mesh;
        if (src) { mesh = new THREE.Mesh(src.mesh.geometry, src.mesh.material); }
        else { const g = new THREE.PlaneGeometry(1, 1.3); mesh = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: 0xf3efe6 })); }
        hs.add(mesh);
        const btn = document.createElement("button"); btn.type = "button"; btn.className = "da-fan__paper da-fan__paper--hand"; btn.setAttribute("aria-label", `${label} — ${count}`);
        btn.addEventListener("click", () => navigate({ layer: "browse", series: seriesKey, subcollection: k, view: "all", item: null }));
        btn.addEventListener("pointerenter", () => setSubtitle(`${label} · ${count}`)); btn.addEventListener("focus", () => setSubtitle(`${label} · ${count}`));
        btn.addEventListener("pointerleave", () => setSubtitle(subtitleRest)); btn.addEventListener("blur", () => setSubtitle(subtitleRest));
        content.appendChild(btn);
        const w = src ? src.spec.w : 120, h = src ? src.spec.h : 160;
        return { k, src, mesh, btn, w, h, from: null, to: null };
      });

      // poses: from = the sheet on the desk (world), to = a slot in front of the camera
      const tmpQ = new THREE.Quaternion(), tmpP = new THREE.Vector3(), tmpS = new THREE.Vector3();
      function readFrom(p) {
        if (!p.src) { p.from = { pos: new THREE.Vector3(0, 0, 0), quat: new THREE.Quaternion(), scale: stageGroup.scale.x * U(1) }; return; }
        p.src.mesh.updateWorldMatrix(true, false); p.src.mesh.matrixWorld.decompose(tmpP, tmpQ, tmpS);
        p.from = { pos: tmpP.clone(), quat: tmpQ.clone(), scale: tmpS.x };
      }
      function computeTo() {
        const n = papers.length, D = 2.6;                       // distance in front of the camera
        if (!n) return;
        // Every sheet in a bundle is scaled by the SAME factor, never one that
        // fits each to its own slot: opening a collection must not resize the
        // documents relative to one another — a calling card stays a calling
        // card beside the CV, exactly as they sit on the desk.
        const vh = 2 * D * HALF_FOV, vw = vh * camera.aspect;
        const vertical = window.innerWidth < 600;
        const camQ = camera.quaternion.clone();
        const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camQ), right = new THREE.Vector3(1, 0, 0).applyQuaternion(camQ), up = new THREE.Vector3(0, 1, 0).applyQuaternion(camQ);
        const centre = camera.position.clone().addScaledVector(forward, D);
        // a plane's local +z is its face (PlaneGeometry faces +z); rotate it to face the camera
        const faceQ = camQ.clone();
        // Each sheet keeps the depth order it has on the desk: the top sheet
        // ends nearest the camera, the next a hair behind, and so on — so the
        // sheets never pass through one another on the way up or down.
        const order = papers.slice().sort((a, b) => (b.from?.pos.y || 0) - (a.from?.pos.y || 0));
        const step = 0.012, dOf = new Map(); order.forEach((p, k) => dOf.set(p, D + k * step));
        const depthOf = (p) => dOf.get(p) || D;
        if (vertical) {
          // On a phone the sheets bunch: two staggered columns (one for up to
          // three), each sheet scaled to its cell, cells overlapping a fifth,
          // a little turned — and all of it inside the screen, above the title.
          const top = vh / 2 - 0.30, bottom = -vh / 2 + 0.42, usable = top - bottom, pad = 0.06;
          const cols = n <= 3 ? 1 : 2, rows = Math.ceil(n / cols);
          const cellW = (vw - pad * 2) / cols, cellH = usable / rows;
          const overlap = rows > 1 ? 1.12 : 1;            // a sheet may run into the next cell by this much
          const fitW = cellW * (cols === 1 ? 0.8 : 0.92);
          const sc = Math.min(...papers.map((p) => Math.min(fitW / U(p.w), (cellH * overlap) / U(p.h))));
          papers.forEach((p, i) => {
            const r = i % cols, c = Math.floor(i / cols);
            const cx = cols === 1 ? 0 : (r === 0 ? -1 : 1) * cellW * 0.47 * (c % 2 ? -1 : 1) + (c % 2 ? 0.02 : -0.02);
            const cy = top - cellH * (c + 0.5) + (r === 0 ? 0.03 : -0.03);
            const k = depthOf(p) / D;
            const q = faceQ.clone().multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), ((i % 2 ? 1 : -1) * (2.5 + (i % 3)) * Math.PI) / 180));
            p.to = { pos: centre.clone().addScaledVector(forward, depthOf(p) - D).addScaledVector(right, cx * k).addScaledVector(up, cy * k), quat: q, scale: sc * k };
          });
        } else {
          // the row is measured, not slotted: the shared scale is whatever lets
          // the sheets' true widths sit side by side and the tallest one fit.
          const W = Math.min(vw * 0.86, vw - 0.4), gap = 0.08, maxH = vh * 0.62;
          const totalW = papers.reduce((t, p) => t + U(p.w), 0), tallest = Math.max(...papers.map((p) => U(p.h)));
          const sc = Math.min((W - gap * (n - 1)) / totalW, maxH / tallest);
          const rowW = totalW * sc + gap * (n - 1);
          let x = -rowW / 2;
          papers.forEach((p) => { const wu = U(p.w) * sc, cx = x + wu / 2; x += wu + gap; const k = depthOf(p) / D; p.to = { pos: centre.clone().addScaledVector(forward, depthOf(p) - D).addScaledVector(right, cx * k).addScaledVector(up, -0.04 * k), quat: faceQ, scale: sc * k }; });
        }
      }
      const pose = (p, a) => {
        const t = easeInOut(a);
        p.mesh.position.lerpVectors(p.from.pos, p.to.pos, t);
        p.mesh.quaternion.slerpQuaternions(p.from.quat, p.to.quat, t);
        p.mesh.scale.setScalar(p.from.scale + (p.to.scale - p.from.scale) * t);
      };
      // the DOM button over each paper: project the plane's corners
      const corner = new THREE.Vector3();
      function placeButtons() {
        papers.forEach((p) => {
          const wu = U(p.w), hu = U(p.h); let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
          for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
            corner.set(sx * wu / 2, sy * hu / 2, 0).applyMatrix4(p.mesh.matrixWorld).project(camera);
            const px = (corner.x + 1) / 2 * window.innerWidth, py = (1 - corner.y) / 2 * window.innerHeight;
            minX = Math.min(minX, px); maxX = Math.max(maxX, px); minY = Math.min(minY, py); maxY = Math.max(maxY, py);
          }
          p.btn.style.cssText = `position:fixed;left:${minX}px;top:${minY}px;width:${maxX - minX}px;height:${maxY - minY}px;transform:none;pointer-events:auto`;
        });
      }

      papers.forEach(readFrom); computeTo();
      // originals hide while their clones are in hand
      papers.forEach((p) => { if (p.src) p.src.mesh.visible = false; }); wantShadows(); wake(400);
      const start = performance.now();
      const rising = !reduceMotion && getState().layer === "series";
      let phase = "up", phaseStart = start, raf = 0;
      // The hand is a SECOND WebGL context, made fresh every time a collection
      // opens. `dispose()` frees three's own objects but leaves the context
      // itself alive until the garbage collector happens to reach it, and a
      // browser keeps only a handful (~8–16) — so opening and backing out
      // enough times makes it drop the OLDEST context to make room, which is
      // the desk. The desk then renders nothing (black) while the DOM, the
      // raycaster and every click carry on as if nothing had happened, until a
      // reload. So hand the context back explicitly the moment the fan is
      // done with it, exactly as model-plate.js and desk-inspect.js do.
      let handReleased = false;
      function releaseHand() {
        if (handReleased) return; handReleased = true;
        cancelAnimationFrame(raf); raf = 0;
        // only the fallback planes are the fan's own; a cloned sheet shares its
        // geometry and material with the doc still sitting on the desk.
        papers.forEach((p) => { if (!p.src) { p.mesh.geometry.dispose(); p.mesh.material.dispose(); } });
        hc.remove(); hr.dispose(); hr.forceContextLoss?.();
      }
      const restoreDesk = () => { papers.forEach((p) => { if (p.src) p.src.mesh.visible = true; }); wantShadows(); wake(400); };
      function frame(now) {
        raf = requestAnimationFrame(frame);
        let a;
        if (phase === "up") a = rising ? Math.min(1, (now - phaseStart) / LIFT_MS) : 1;
        else a = 1 - Math.min(1, (now - phaseStart) / LOWER_MS);
        papers.forEach((p) => { pose(p, a); p.mesh.updateMatrixWorld(); });
        placeButtons();
        hr.render(hs, camera);
        if (phase === "down" && a <= 0) { restoreDesk(); releaseHand(); }
      }
      frame(start);
      const onResize = () => { hr.setSize(window.innerWidth, window.innerHeight); computeTo(); };
      window.addEventListener("resize", onResize);

      teardown = () => {
        window.removeEventListener("resize", onResize);
        phase = "down"; phaseStart = performance.now();
        if (reduceMotion) { phaseStart -= LOWER_MS; }   // the phone lowers its sheets too
        setTimeout(() => meta.remove(), 400);
        // safety: if the frame loop never lands (tab hidden), restore
        setTimeout(() => { restoreDesk(); releaseHand(); }, LOWER_MS + 200);
      };
    }
    requestAnimationFrame(() => { if (D.ctx.ready) setup(); else D.ctx.whenReady.then(() => requestAnimationFrame(setup)); });
    return { veil, content, cleanup: () => { teardown(); escOff(); }, onHoist: () => {}, update: (state) => state.layer === "series" && state.series === seriesKey };
  };
}
