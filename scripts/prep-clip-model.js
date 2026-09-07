// Prepare a downloaded clip model for the papers desk before finishing it:
// drop the cameras and lights some Sketchfab exports carry, and bake a
// rotation so the object lies flat on the desk (its flat face up, +Y) —
// desk-alt.js only turns objects about the vertical.
//
// Usage:
//   node scripts/prep-clip-model.js in.glb out.glb [--rotx DEG] [--roty DEG] [--rotz DEG]
//
// Then: node scripts/finish-desk-model.js out.glb final.glb --texture 1024 --static

import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { prune } from "@gltf-transform/functions";
import { MeshoptDecoder } from "meshoptimizer";
import draco3d from "draco3d";

const argv = process.argv.slice(2);
const positional = argv.filter((a, i) => !a.startsWith("--") && !(argv[i - 1] || "").startsWith("--"));
const opt = (n) => { const i = argv.indexOf(`--${n}`); return i > -1 ? parseFloat(argv[i + 1]) : 0; };
const [inFile, outFile] = positional;
if (!inFile || !outFile) { console.error("usage: prep-clip-model.js in.glb out.glb [--rotx DEG] [--roty DEG] [--rotz DEG]"); process.exit(1); }

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ "meshopt.decoder": MeshoptDecoder, "draco3d.decoder": await draco3d.createDecoderModule() });
const doc = await io.read(inFile);
const root = doc.getRoot();

// Cameras and lights: detach and prune.
for (const n of root.listNodes()) {
  if (n.getCamera() || n.getExtension("KHR_lights_punctual")) { n.setCamera(null); n.setExtension("KHR_lights_punctual", null); }
  if (!n.getMesh() && n.listChildren().length === 0) n.dispose();
}
for (const c of root.listCameras()) c.dispose();

// The flat-lying rotation, as a quaternion from Euler XYZ (degrees).
const d2r = Math.PI / 180;
const [x, y, z] = [opt("rotx") * d2r, opt("roty") * d2r, opt("rotz") * d2r];
const cx = Math.cos(x / 2), sx = Math.sin(x / 2), cy = Math.cos(y / 2), sy = Math.sin(y / 2), cz = Math.cos(z / 2), sz = Math.sin(z / 2);
const q = [
  sx * cy * cz + cx * sy * sz,
  cx * sy * cz - sx * cy * sz,
  cx * cy * sz + sx * sy * cz,
  cx * cy * cz - sx * sy * sz,
];
const scene = root.listScenes()[0];
const wrap = doc.createNode("clip-root").setRotation(q);
for (const child of scene.listChildren()) { scene.removeChild(child); wrap.addChild(child); }
scene.addChild(wrap);

await doc.transform(prune());
await io.write(outFile, doc);
console.log(`wrote ${outFile}  rot=(${opt("rotx")}, ${opt("roty")}, ${opt("rotz")})  nodes=${root.listNodes().length}`);
