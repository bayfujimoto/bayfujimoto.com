import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { navigate } from "./router.js";

const seriesInfo = {};

// The placeholder series objects sitting on the desk ship with image
// textures that slow first load. While testing, strip those and replace
// each material with a flat untextured one. The desk itself keeps its
// real materials. Set to false to render the object textures again.
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
  if (!canvas) return;

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  } catch (e) { return; }
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

  const deskLoader = new GLTFLoader();
  deskLoader.load(`${BASE}desk.glb`, (gltf) => {
    const desk = gltf.scene;
    const box = new THREE.Box3().setFromObject(desk);
    const size = new THREE.Vector3();
    box.getSize(size);
    // Scale so desk width matches the scene's 9-unit table width
    const scale = 13 / size.x;
    desk.scale.setScalar(scale);
    // After scaling, re-measure and position so top surface sits at y=0
    box.setFromObject(desk);
    desk.position.set(0, -box.max.y, -1);
    desk.traverse((child) => {
      if (child.isMesh) {
        child.receiveShadow = true;
        child.castShadow = true;
      }
    });
    scene.add(desk);
  });

  const clickables = [];
  const OBJECTS = [
    { seriesId: "identity",     x: -3.3, z: -1.2, w: 15, h: 15, d: 3.5, rx:  0, ry:  0, rz:  0, offsetY: -2.1 },
    { seriesId: "labor",        x:  3, z: -2, w: 2.4, h: 2, d: 2, rx:  0, ry:  -20, rz:  0, offsetY: 0 },
    { seriesId: "consumption",  x:  2, z: 0, w: 1.0, h: 1, d: 1, rx:  0, ry:  0, rz:  0, offsetY: 0 },
    { seriesId: "creation",     x: -0.5, z:  0, w: 4, h: 4, d: 3, rx:  0, ry:  -15, rz:  0, offsetY: 0 },
    { seriesId: "accumulation", x:  2.8, z:  1.8, w: 3.5, h: 2, d: 4, rx:  0, ry:  30, rz:  0, offsetY: 0 },
    { seriesId: "guide",        x:  -3, z:  1.5, w: 1, h: 1, d: 1, rx:  0, ry:  210, rz:  0, offsetY: 0 },
  ];

  const loader = new GLTFLoader();
  OBJECTS.forEach(({ seriesId, x, z, w, h, d, rx, ry, rz, offsetY = 0 }) => {
    let modelFile = `${seriesId}.glb`;
    if (seriesId === "guide") modelFile = "desk-guide-key.glb";
    else if (seriesId === "identity") modelFile = "desk-identity-dossier.glb";
    else if (seriesId === "creation") modelFile = "desk-creation-stamp.glb";
    else if (seriesId === "consumption") modelFile = "desk-consumption-sphere.glb";
    else if (seriesId === "accumulation") modelFile = "desk-accumulation-bundle.glb";
    else if (seriesId === "labor") modelFile = "desk-labor-box.glb";
    loader.load(`${BASE}${modelFile}`, (gltf) => {
      const model = gltf.scene;
      stripTextures(model);

      const box = new THREE.Box3().setFromObject(model);
      const size = new THREE.Vector3();
      box.getSize(size);
      const scale = Math.min(w / size.x, h / size.y, d / size.z);
      model.scale.setScalar(scale);

      const deg = Math.PI / 180;
      model.rotation.set(rx * deg, ry * deg, rz * deg);

      box.setFromObject(model);
      const center = new THREE.Vector3();
      box.getCenter(center);
      model.position.set(x - center.x, box.min.y * -1 + offsetY, z - center.z);

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
      : navigate({ layer: "series", series: seriesId, subcollection: null, item: null });
  });
  canvas.addEventListener("mousemove", (e) => {
    getNDC(e);
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObjects(clickables, true);
    if (hits.length) {
      const { seriesId } = hits[0].object.userData;
      const info = seriesInfo[seriesId];
      if (info) {
        if (seriesId !== currentHoverId) {
          currentHoverId = seriesId;
          hoverMeta.style.opacity = "0";
          setTimeout(() => {
            hoverTitle.textContent = info.label;
            hoverSubtitle.textContent = info.container;
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
    (function animate() { requestAnimationFrame(animate); render(); })();
  }

  window.addEventListener("resize", () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    if (reduceMotion) render();
  });
}
