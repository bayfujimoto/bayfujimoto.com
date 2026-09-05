// Strips embedded image textures from the desk OBJECT models and publishes
// the untextured copies to R2 under the models/untextured/ prefix.
//
// Why: the six series objects sitting on the desk ship with baked image
// textures, but the scene renders them with flat materials anyway (see
// STRIP_MODEL_TEXTURES in src/app/scene.js). Those textures were still being
// downloaded and decoded on every visit, then thrown away — wasted bandwidth
// that slowed first load. Removing the images from the binary fixes the cost
// at the source.
//
// Non-destructive: the full-texture originals at models/<file>.glb are left
// untouched. Stripped copies are written to models/untextured/<file>.glb, and
// the site is pointed at that prefix (src/app/scene.js). The desk itself
// (desk.glb) keeps its real materials and is intentionally NOT processed.
//
// Usage:
//   node scripts/strip-model-textures.js            # download, strip, upload to R2
//   node scripts/strip-model-textures.js --dry-run  # strip locally only, no upload
//
// Dry-run writes the stripped GLBs to scripts/.stripped-models/ so they can be
// inspected in a viewer before anything is pushed to R2.
//
// Requires in .env.local: CLOUDFLARE_ACCOUNT_ID, R2_BUCKET_NAME,
//                         R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY

import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { S3Client, GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { prune } from "@gltf-transform/functions";
import draco3d from "draco3d";
import { MeshoptDecoder, MeshoptEncoder } from "meshoptimizer";
import { DESK_OBJECTS } from "../src/shared/desk-objects.js";

const DRY_RUN = process.argv.includes("--dry-run");

// Object models that sit on the desk, from the shared table
// (src/shared/desk-objects.js). The desk (desk.glb) is deliberately excluded.
const OBJECT_MODELS = Object.values(DESK_OBJECTS).map((o) => o.file);

const SRC_PREFIX = "models/";
const DEST_PREFIX = "models/untextured/";
const LOCAL_OUT = new URL("./.stripped-models/", import.meta.url);

// --- env (.env.local) --------------------------------------------------------
const envRaw = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const env = Object.fromEntries(
  envRaw.split("\n")
    .filter((l) => l.trim() && !l.startsWith("#"))
    .map((l) => { const [k, ...v] = l.split("="); return [k.trim(), v.join("=").trim()]; })
);

const ACCOUNT_ID = env.CLOUDFLARE_ACCOUNT_ID;
const BUCKET     = env.R2_BUCKET_NAME;
const ACCESS_KEY = env.R2_ACCESS_KEY_ID;
const SECRET_KEY = env.R2_SECRET_ACCESS_KEY;

if (!ACCOUNT_ID || !BUCKET || !ACCESS_KEY || !SECRET_KEY) {
  console.error("Missing R2 env vars in .env.local");
  process.exit(1);
}

const client = new S3Client({
  region: "auto",
  endpoint: `https://${ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: ACCESS_KEY, secretAccessKey: SECRET_KEY },
});

// --- glTF I/O (with extension + compression-codec support) -------------------
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({
    "draco3d.decoder": await draco3d.createDecoderModule(),
    "draco3d.encoder": await draco3d.createEncoderModule(),
    "meshopt.decoder": MeshoptDecoder,
    "meshopt.encoder": MeshoptEncoder,
  });

// Remove ALL embedded image textures from a document while preserving each
// material's base color, roughness, and metalness so the model still renders
// with sensible flat shading (matching how scene.js already draws it).
async function stripAllTextures(doc) {
  const root = doc.getRoot();
  for (const material of root.listMaterials()) {
    material.setBaseColorTexture(null);
    material.setMetallicRoughnessTexture(null);
    material.setNormalTexture(null);
    material.setOcclusionTexture(null);
    material.setEmissiveTexture(null);
  }
  for (const texture of root.listTextures()) {
    texture.dispose();
  }
  // Prune now-orphaned images, samplers, and unused TEXCOORD accessors.
  await doc.transform(prune());
  return doc;
}

async function streamToBuffer(stream) {
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  return Buffer.concat(chunks);
}

function fmt(bytes) {
  return (bytes / 1024).toFixed(1) + " KB";
}

// --- run ---------------------------------------------------------------------
if (DRY_RUN) {
  mkdirSync(LOCAL_OUT, { recursive: true });
  console.log("DRY RUN — stripping locally, no upload.\n");
}

let totalBefore = 0;
let totalAfter = 0;

for (const file of OBJECT_MODELS) {
  const srcKey = SRC_PREFIX + file;
  process.stdout.write(`${srcKey} ... `);
  try {
    const getRes = await client.send(new GetObjectCommand({ Bucket: BUCKET, Key: srcKey }));
    const input = await streamToBuffer(getRes.Body);

    const doc = await io.readBinary(new Uint8Array(input));
    const texBefore = doc.getRoot().listTextures().length;
    await stripAllTextures(doc);
    const output = Buffer.from(await io.writeBinary(doc));

    totalBefore += input.byteLength;
    totalAfter += output.byteLength;

    const summary = `${texBefore} tex removed, ${fmt(input.byteLength)} -> ${fmt(output.byteLength)}`;

    if (DRY_RUN) {
      const dest = new URL(file, LOCAL_OUT);
      writeFileSync(dest, output);
      console.log(`stripped (${summary}) -> ${dest.pathname}`);
    } else {
      await client.send(new PutObjectCommand({
        Bucket: BUCKET,
        Key: DEST_PREFIX + file,
        Body: output,
        ContentType: "model/gltf-binary",
      }));
      console.log(`uploaded to ${DEST_PREFIX + file} (${summary})`);
    }
  } catch (err) {
    if (err.name === "NoSuchKey" || err.$metadata?.httpStatusCode === 404) {
      console.log("SKIP (not found in R2)");
    } else {
      console.log(`FAILED: ${err.message}`);
    }
  }
}

console.log(
  `\nDone. Total ${fmt(totalBefore)} -> ${fmt(totalAfter)} ` +
  `(${(100 - (totalAfter / (totalBefore || 1)) * 100).toFixed(1)}% smaller across ${OBJECT_MODELS.length} object models).`
);
if (!DRY_RUN) {
  console.log("Full-texture originals at models/ are unchanged; site loads from models/untextured/.");
}
