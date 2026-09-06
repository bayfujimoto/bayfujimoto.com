// Finish a desk-object GLB for the web: compress textures, quantize and
// meshopt-encode the geometry, optionally simplify.
//
// Companion to strip-model-textures.js — that script REMOVED textures because
// the site rendered flat anyway; this one KEEPS them at a weight the site can
// afford. Outputs are written wherever you point them; nothing is uploaded.
//
// Usage:
//   node scripts/finish-desk-model.js in.glb out.glb \
//        [--texture 1024] [--simplify 0.05] [--keep-morph-normals] [--static]
//
// --texture N            resize+recompress textures to N² WebP (0 = leave alone)
// --simplify R           reduce triangles to ratio R (omit = keep all)
// --keep-morph-normals   keep morph-target normals (default: dropped, ~halves
//                        the cost of a vertex-cache animation, invisible here)
// --static               also flatten+join — DESTROYS node animation, static only

import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import {
  dedup, prune, weld, simplify, resample, quantize, meshopt,
  textureCompress, flatten, join,
} from "@gltf-transform/functions";
import { MeshoptSimplifier, MeshoptEncoder, MeshoptDecoder } from "meshoptimizer";
import draco3d from "draco3d";
import sharp from "sharp";
import { statSync } from "fs";

const argv = process.argv.slice(2);
const positional = [];
for (let i = 0; i < argv.length; i++) {
  if (argv[i].startsWith("--")) { if (["--texture", "--simplify"].includes(argv[i])) i++; }
  else positional.push(argv[i]);
}
const [IN, OUT] = positional;
const opt = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i > -1 ? Number(argv[i + 1]) : fallback;
};
const TEXTURE = opt("texture", 1024);
const RATIO   = opt("simplify", null);
const KEEP_MN = argv.includes("--keep-morph-normals");
const STATIC  = argv.includes("--static");

if (!IN || !OUT) {
  console.error("usage: finish-desk-model.js in.glb out.glb [--texture 1024] [--simplify 0.05]");
  process.exit(1);
}

await MeshoptSimplifier.ready;
await MeshoptEncoder.ready;

const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({
    "draco3d.decoder": await draco3d.createDecoderModule(),
    "draco3d.encoder": await draco3d.createEncoderModule(),
    "meshopt.decoder": MeshoptDecoder,
    "meshopt.encoder": MeshoptEncoder,
  });

const stat = (doc) => {
  let tris = 0, morph = 0;
  for (const m of doc.getRoot().listMeshes())
    for (const p of m.listPrimitives()) {
      const i = p.getIndices();
      tris += (i ? i.getCount() : p.getAttribute("POSITION").getCount()) / 3;
      morph += p.listTargets().length;
    }
  return { tris: Math.round(tris), morph, anims: doc.getRoot().listAnimations().length };
};

const doc = await io.read(IN);
const before = stat(doc);

if (!KEEP_MN)
  for (const m of doc.getRoot().listMeshes())
    for (const p of m.listPrimitives())
      for (const t of p.listTargets())
        if (t.getAttribute("NORMAL")) t.setAttribute("NORMAL", null);

const steps = [dedup()];
if (STATIC) steps.push(flatten(), join());   // bakes node transforms — no animation
steps.push(weld());
if (RATIO) steps.push(simplify({ simplifier: MeshoptSimplifier, ratio: RATIO, error: 0.005 }));
if (TEXTURE) steps.push(textureCompress({
  encoder: sharp, targetFormat: "webp", resize: [TEXTURE, TEXTURE],
}));
steps.push(resample(), prune(), quantize(), meshopt({ encoder: MeshoptEncoder, level: "medium" }));

await doc.transform(...steps);
await io.write(OUT, doc);

const after = stat(doc);
const kb = (p) => Math.round(statSync(p).size / 1024);
console.log(
  `${IN.split("/").pop().padEnd(30)} ${String(kb(IN)).padStart(6)} KB -> ${String(kb(OUT)).padStart(5)} KB  ` +
  `(${(100 - (kb(OUT) / kb(IN)) * 100).toFixed(1)}% smaller)  ` +
  `tris ${before.tris}->${after.tris}  morph ${after.morph}  anim ${after.anims}`
);
