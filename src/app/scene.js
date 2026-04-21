import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { navigate } from "./router.js";

const seriesInfo = {};

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
    const scale = 9 / size.x;
    desk.scale.setScalar(scale);
    // After scaling, re-measure and position so top surface sits at y=0
    box.setFromObject(desk);
    desk.position.y = -box.max.y;
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
    { seriesId: "identity",     x: -1.6, z: -0.8, w: 2, h: 2, d: 2, rx:  0, ry:  140, rz:  0 },
    { seriesId: "labor",        x:  0.0, z: -0.8, w: 1.4, h: 0.30, d: 0.80, rx:  0, ry:  0, rz:  0 },
    { seriesId: "consumption",  x:  1.6, z: -0.8, w: 1.0, h: 0.50, d: 1.00, rx:  0, ry:  0, rz:  0 },
    { seriesId: "creation",     x: -0.8, z:  0.8, w: 2, h: 2, d: 2, rx:  0, ry:  -15, rz:  0 },
    { seriesId: "accumulation", x:  0.8, z:  0.8, w: 1.3, h: 0.45, d: 0.95, rx:  0, ry:  0, rz:  0 },
    { seriesId: "guide",        x:  0.0, z:  1.6, w: 3, h: 1, d: 1, rx:  0, ry:  5, rz:  0 },
  ];

  const loader = new GLTFLoader();
  OBJECTS.forEach(({ seriesId, x, z, w, h, d, rx, ry, rz }) => {
    loader.load(`${BASE}${seriesId}.glb`, (gltf) => {
      const model = gltf.scene;

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
      model.position.set(x - center.x, box.min.y * -1, z - center.z);

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
  function getNDC(e) {
    pointer.x =  (e.clientX / window.innerWidth)  * 2 - 1;
    pointer.y = -(e.clientY / window.innerHeight) * 2 + 1;
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
  function render() { renderer.render(scene, camera); }
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
