// ── Model look — how a desk object is drawn wherever it appears ──────────────
// One set of rules for the desk scene (scene.js), the Guide card's model plate
// (model-plate.js), and the thumbnail harness (scripts/render-desk-thumbnails/):
// flat, texture-free materials under warm light, so an object lifted onto the
// plate is recognisably the one on the desk.

import * as THREE from "three";

// The series objects sitting on the desk are rendered with flat, untextured
// materials. Their image textures are also stripped from the GLB binaries
// themselves (see scripts/strip-model-textures.js), which publishes
// texture-free copies to the models/untextured/ prefix — so the textures are
// no longer downloaded or decoded at all. This runtime pass remains as a
// safety net: it normalizes each material to a flat MeshStandardMaterial built
// from the surviving baseColorFactor, so the scene looks identical whether it
// loads a pre-stripped or full-texture file. The desk itself (desk.glb) keeps
// its real materials and is not stripped.
export function stripTextures(root) {
  root.traverse((child) => {
    if (!child.isMesh || !child.material) return;
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    const flat = materials.map((mat) => {
      const m = new THREE.MeshStandardMaterial({
        color: mat.color ? mat.color.clone() : new THREE.Color(0x888888),
        roughness: mat.roughness ?? 0.8,
        metalness: mat.metalness ?? 0.0,
      });
      // Dispose old textures so the GPU/decoder frees them.
      for (const key of Object.keys(mat)) {
        const val = mat[key];
        if (val && val.isTexture) val.dispose();
      }
      return m;
    });
    child.material = flat.length === 1 ? flat[0] : flat;
  });
}

// The desk's palette: a warm ambient and an amber key. The desk uses a
// shadow-casting spot; the plate has nothing to cast onto, so a directional
// key from the upper left stands in, with a faint cool fill from the other
// side so the underside of a turned object doesn't fall to black.
export function addPlateLights(scene) {
  scene.add(new THREE.AmbientLight(0xffe0b0, 0.9));
  const key = new THREE.DirectionalLight(0xffb347, 2.6);
  key.position.set(-3, 6, 4);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xc8d8e8, 0.5);
  fill.position.set(4, 2, -3);
  scene.add(fill);
}

export function configureRenderer(renderer) {
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(0x000000, 0);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
}

// The plate's opening view: a three-quarter elevation, as the desk is seen,
// with the object's bounding sphere filling `fill` of the square frame. The
// same rule for every object — sphere and dossier read at comparable size.
// The plate is presentational, not calibrated.
export const PLATE_VIEW = { fov: 32, fill: 0.88, elevationDeg: 30, azimuthDeg: -38 };

export function fitCameraToObject(camera, object, view = PLATE_VIEW) {
  // Precise (per-vertex) bounds: a node rotated inside its GLB inflates the
  // loose AABB — the dossier's reads 11 units wide against 2.5 of actual paper.
  const box = new THREE.Box3().setFromObject(object, true);
  const sphere = new THREE.Sphere();
  box.getBoundingSphere(sphere);
  const r = Math.max(sphere.radius, 1e-3);
  const dist = r / Math.sin((view.fov * Math.PI) / 360) / view.fill;
  const el = (view.elevationDeg * Math.PI) / 180;
  const az = (view.azimuthDeg * Math.PI) / 180;
  camera.fov = view.fov;
  camera.near = dist / 50;
  camera.far = dist * 50;
  camera.position.set(
    sphere.center.x + dist * Math.cos(el) * Math.sin(az),
    sphere.center.y + dist * Math.sin(el),
    sphere.center.z + dist * Math.cos(el) * Math.cos(az)
  );
  camera.lookAt(sphere.center);
  camera.updateProjectionMatrix();
  return { center: sphere.center.clone(), radius: r, distance: dist };
}
