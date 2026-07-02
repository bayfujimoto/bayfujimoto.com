import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { navigate } from "./router.js";
import { dismissLoadingScreen } from "./loading.js";
import { deskTarget } from "./state.js";

const seriesInfo = {};

// While an overlay veil is open the desk sits behind a darkened, blurred
// backdrop-filter. Repainting the canvas every frame under that filter makes the
// browser intermittently drop the veil's composited layer, flashing the raw desk
// through. Pausing the render loop while any veil is up removes that churn (the
// blurred desk is static anyway) and eliminates the flicker. Driven by panels.js.
let renderPaused = false;
export function pauseSceneRender() { renderPaused = true; }
export function resumeSceneRender() { renderPaused = false; }

// The series objects sitting on the desk are rendered with flat, untextured
// materials. Their image textures are also stripped from the GLB binaries
// themselves (see scripts/strip-model-textures.js), which publishes
// texture-free copies to the models/untextured/ prefix that OBJECT_BASE below
// points at — so the textures are no longer downloaded or decoded at all.
// This runtime pass remains as a safety net: it normalizes each material to a
// flat MeshStandardMaterial built from the surviving baseColorFactor, so the
// scene looks identical whether it loads a pre-stripped or full-texture file.
// The desk itself (desk.glb) keeps its real materials and is not stripped.
const STRIP_MODEL_TEXTURES = true;

function stripTextures(root) {
  if (!STRIP_MODEL_TEXTURES) return;
  root.traverse((child) => {
    if (!child.isMesh || !child.material) return;
    const materials = Array.isArray(child.material)
      ? child.material
      : [child.material];
    child.material = materials.map((mat) => {
      const flat = new THREE.MeshStandardMaterial({
        color: mat.color ? mat.color.clone() : new THREE.Color(0x888888),
        roughness: mat.roughness ?? 0.8,
        metalness: mat.metalness ?? 0.0,
      });
      // Dispose old textures so the GPU/decoder frees them.
      for (const key of Object.keys(mat)) {
        const val = mat[key];
        if (val && val.isTexture) val.dispose();
      }
      return flat;
    });
    if (!Array.isArray(child.material)) child.material = child.material[0];
    if (child.material.length === 1) child.material = child.material[0];
  });
}

export function setSeriesInfo(data) {
  Object.assign(seriesInfo, data);
}

export function initScene() {
  const canvas = document.getElementById("scene");
  if (!canvas) { dismissLoadingScreen(); return; }

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  } catch (e) { dismissLoadingScreen(); return; }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setClearColor(0x000000, 0);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;

  const scene = new THREE.Scene();

  const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 100);
  camera.position.set(0, 5, 0.5);
  camera.lookAt(0, 0, 0);

  scene.add(new THREE.AmbientLight(0xffe0b0, 0.5));
  const spotLight = new THREE.SpotLight(0xffb347, 120, 20, Math.PI / 5, 0.4, 1.5);
  spotLight.position.set(0, 8, -2);
  spotLight.target.position.set(0, 0, 0);
  spotLight.castShadow = true;
  spotLight.shadow.mapSize.set(2048, 2048);
  spotLight.shadow.camera.near = 4;
  spotLight.shadow.camera.far = 20;
  spotLight.shadow.bias = -0.001;
  scene.add(spotLight);
  scene.add(spotLight.target);

  const BASE = "https://pub-0038be3e0b514b5080cb9935976102b8.r2.dev/models/";
  // Texture-stripped copies of the series objects live under this prefix.
  // The full-texture originals remain at BASE but are no longer loaded.
  const OBJECT_BASE = `${BASE}untextured/`;

  // Route every model load through one manager so we know when the desk and all
  // objects have finished loading, then dismiss the loading screen. render() is
  // called first to guarantee a painted frame beneath the fade — this matters on
  // the reduced-motion path, which otherwise renders only once, before models arrive.
  const manager = new THREE.LoadingManager();
  manager.onLoad = () => {
    render();
    dismissLoadingScreen();
  };

  const deskLoader = new GLTFLoader(manager);
  deskLoader.load(`${BASE}desk.glb`, (gltf) => {
    const desk = gltf.scene;
    const box = new THREE.Box3().setFromObject(desk);
    const size = new THREE.Vector3();
    box.getSize(size);
    // Scale the desk up so its surface runs past every screen edge. The
    // camera's vertical field of view is fixed, so on tall screens the desk's
    // front edge was sitting inside the frame; the extra width also deepens the
    // surface enough to cover top and bottom.
    const scale = 20 / size.x;
    desk.scale.setScalar(scale);
    // Keep the top surface at y=0, and shift the desk toward the camera (+z)
    // so its front edge falls below the bottom of the screen.
    box.setFromObject(desk);
    desk.position.set(0, -box.max.y, 1);
    desk.traverse((child) => {
      if (child.isMesh) {
        child.receiveShadow = true;
        child.castShadow = true;
      }
    });
    scene.add(desk);
  });

  const clickables = [];
  const placed = [];  // { seriesId, model, cx, cz, posY } — for re-placing on regime change
  const deg = Math.PI / 180;

  // ── Desk objects ────────────────────────────────────────────────────────────
  // Intrinsic per-object config: fit box (w,h,d), Y-rotation, vertical offset,
  // and source model file. Placement per viewport regime comes from LAYOUTS below.
  const OBJECT_CFG = {
    identity:     { w: 15,  h: 15, d: 3.5, ry: 0,   offsetY: -2.1, file: "desk-identity-dossier.glb" },
    labor:        { w: 2.4, h: 2,  d: 2,   ry: -20, offsetY: 0,    file: "desk-labor-box.glb" },
    consumption:  { w: 1.0, h: 1,  d: 1,   ry: 0,   offsetY: 0,    file: "desk-consumption-sphere.glb" },
    creation:     { w: 4,   h: 4,  d: 3,   ry: -15, offsetY: 0,    file: "desk-creation-stamp.glb" },
    accumulation: { w: 3.5, h: 2,  d: 4,   ry: 30,  offsetY: 0,    file: "desk-accumulation-bundle.glb" },
    guide:        { w: 1,   h: 1,  d: 1,   ry: 210, offsetY: 0,    file: "desk-guide-key.glb" },
  };

  // Placement on the desk surface per viewport regime. Only x and z change
  // between regimes — these are the two desk-surface axes (left/right and the
  // near/far depth that reads as up/down on screen). Object size and resting
  // height on the desk are identical in every regime, so the objects keep
  // laying on the desk exactly as they do on desktop; they are only shuffled to
  // different spots on the surface. The camera is near top-down, so moving an
  // object across the surface changes neither its apparent size nor its
  // distance from the desk.
  //
  //   wide      (>1024px) — the original landscape desk composition.
  //   square    (600–1024px) — clustered inward for near-square tablets.
  //   vertical  (<600px) — a single column down the desk for portrait phones.
  const LAYOUTS = {
    wide: {
      identity:     { x: -3.3, z: -1.2 },
      labor:        { x:  3.0, z: -2.0 },
      consumption:  { x:  2.0, z:  0.0 },
      creation:     { x: -0.5, z:  0.0 },
      accumulation: { x:  2.8, z:  1.8 },
      guide:        { x: -3.0, z:  1.5 },
    },
    square: {
      identity:     { x: -2.4, z: -1.3 },
      labor:        { x:  2.3, z: -1.6 },
      consumption:  { x:  1.8, z:  0.1 },
      creation:     { x: -0.5, z:  0.2 },
      accumulation: { x:  2.2, z:  1.6 },
      guide:        { x: -2.3, z:  1.6 },
    },
    // Objects spread wide across the surface (−z is toward the top of the
    // screen, +z toward the bottom). identity (top-left) and labor (top-right)
    // run past the screen edges and show only partially, by intent; creation
    // sits near the center.
    vertical: {
      identity:     { x: -2.0, z: -2.6 },
      creation:     { x:  0.0, z:  0.0 },
      consumption:  { x:  1.8, z:  0.2 },
      labor:        { x:  2.4, z: -2.3 },
      accumulation: { x:  1.3, z:  2.7 },
      guide:        { x: -1.5, z:  1.6 },
    },
  };

  function regimeForWidth(w) {
    if (w < 600) return "vertical";
    if (w <= 1024) return "square";
    return "wide";
  }
  let currentRegime = regimeForWidth(window.innerWidth);

  // Re-place one object on the desk surface for the active regime. Only its
  // (x, z) on the surface changes; size and resting height stay put.
  function positionObject(entry, regime) {
    const place = (LAYOUTS[regime] || LAYOUTS.wide)[entry.seriesId];
    if (!place) return;
    entry.model.position.set(place.x - entry.cx, entry.posY, place.z - entry.cz);
  }

  function applyLayout(regime) {
    placed.forEach((entry) => positionObject(entry, regime));
  }

  const loader = new GLTFLoader(manager);
  Object.entries(OBJECT_CFG).forEach(([seriesId, cfg]) => {
    loader.load(`${OBJECT_BASE}${cfg.file}`, (gltf) => {
      const model = gltf.scene;
      stripTextures(model);

      const box = new THREE.Box3().setFromObject(model);
      const size = new THREE.Vector3();
      box.getSize(size);
      const scale = Math.min(cfg.w / size.x, cfg.h / size.y, cfg.d / size.z);
      model.scale.setScalar(scale);

      model.rotation.set(0, cfg.ry * deg, 0);

      box.setFromObject(model);
      const center = new THREE.Vector3();
      box.getCenter(center);

      model.traverse((child) => {
        if (child.isMesh) {
          child.castShadow = true;
          child.receiveShadow = true;
          child.userData.seriesId = seriesId;
        }
      });
      model.userData.seriesId = seriesId;

      scene.add(model);
      clickables.push(model);

      // Keep what's needed to re-place this object when the regime changes.
      // Size and resting height (posY) are fixed; only its desk-surface spot
      // (x, z) differs between layouts.
      const entry = {
        seriesId,
        model,
        cx: center.x,
        cz: center.z,
        posY: -box.min.y + cfg.offsetY,
      };
      placed.push(entry);
      positionObject(entry, currentRegime);
    });
  });

  // Hover tooltip — appended to body, above canvas and #app
  const hoverMeta = document.createElement("div");
  hoverMeta.className = "layer-meta scene-hover-meta";
  hoverMeta.style.cssText = "opacity:0; transition:opacity 0.15s; pointer-events:none;";
  const hoverTitle = document.createElement("h1");
  hoverTitle.className = "overlay-title";
  const hoverSubtitle = document.createElement("p");
  hoverSubtitle.className = "overlay-subtitle";
  hoverMeta.appendChild(hoverTitle);
  hoverMeta.appendChild(hoverSubtitle);
  document.body.appendChild(hoverMeta);

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const mousePos = new THREE.Vector2();
  function getNDC(e) {
    pointer.x =  (e.clientX / window.innerWidth)  * 2 - 1;
    pointer.y = -(e.clientY / window.innerHeight) * 2 + 1;
    mousePos.x = (e.clientX / window.innerWidth) * 2 - 1;
    mousePos.y = -(e.clientY / window.innerHeight) * 2 + 1;
  }

  let currentHoverId = null;

  canvas.addEventListener("click", (e) => {
    getNDC(e);
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObjects(clickables, true);
    if (!hits.length) return;
    const { seriesId } = hits[0].object.userData;
    if (!seriesId) return;
    currentHoverId = null;
    hoverMeta.style.transition = "none";
    hoverMeta.style.opacity = "0";
    requestAnimationFrame(() => { hoverMeta.style.transition = "opacity 0.15s"; });
    seriesId === "guide"
      ? navigate({ layer: "guide" })
      : navigate({ layer: "series", series: deskTarget(seriesId), subcollection: null, item: null });
  });
  canvas.addEventListener("mousemove", (e) => {
    getNDC(e);
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObjects(clickables, true);
    if (hits.length) {
      const { seriesId } = hits[0].object.userData;
      const info = seriesInfo[seriesId];
      // Both the title and the contents line follow where the object leads
      // (swapped for labor/accumulation), so the hover previews what opens.
      const targetInfo = seriesInfo[deskTarget(seriesId)] || info;
      if (info) {
        if (seriesId !== currentHoverId) {
          currentHoverId = seriesId;
          hoverMeta.style.opacity = "0";
          setTimeout(() => {
            hoverTitle.textContent = targetInfo.label;
            hoverSubtitle.textContent = targetInfo.subtitle || targetInfo.container || "";
            hoverMeta.style.opacity = "1";
          }, 150);
        }
      }
      canvas.style.cursor = "pointer";
    } else {
      currentHoverId = null;
      hoverMeta.style.opacity = "0";
      canvas.style.cursor = "default";
    }
  });

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const lightPos = { x: 0, z: -2 };
  function render() {
    const moveDistance = 1;
    const targetX = mousePos.x * moveDistance;
    const targetZ = -2 + (-mousePos.y * moveDistance * 0.5);

    lightPos.x += (targetX - lightPos.x) * 0.08;
    lightPos.z += (targetZ - lightPos.z) * 0.08;

    spotLight.position.x = lightPos.x;
    spotLight.position.z = lightPos.z;
    spotLight.target.position.set(0, 0, 0);
    spotLight.target.updateMatrixWorld();
    spotLight.shadow.camera.updateProjectionMatrix();
    renderer.render(scene, camera);
  }
  if (reduceMotion) {
    render();
  } else {
    (function animate() { requestAnimationFrame(animate); if (renderPaused) return; render(); })();
  }

  window.addEventListener("resize", () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    // Re-arrange the objects on the desk if the viewport crossed a breakpoint
    // (e.g. a phone rotated between portrait and landscape).
    const nextRegime = regimeForWidth(window.innerWidth);
    if (nextRegime !== currentRegime) {
      currentRegime = nextRegime;
      applyLayout(currentRegime);
    }
    if (reduceMotion) render();
  });
}
