// Publishes the web-optimised desk objects to R2 under the models/web/ prefix.
//
// Companion to strip-model-textures.js. That script removed textures because
// the site rendered flat and the images were dead weight; this one publishes
// copies that KEEP their textures at a weight the site can afford — WebP maps,
// quantized and meshopt-encoded geometry (see scripts/finish-desk-model.js).
//
// Non-destructive: the full-texture originals stay at models/<file>.glb and the
// stripped copies at models/untextured/<file>.glb. Nothing is overwritten.
//
// Usage:
//   node scripts/publish-web-models.js                # upload
//   node scripts/publish-web-models.js --dry-run      # list what would upload
//   node scripts/publish-web-models.js --src <dir>    # default .optimized-models/t1024
//   node scripts/publish-web-models.js --textures <dir>
//       upload every .webp/.jpg/.png in <dir> to models/web/textures/ — the
//       table's PBR maps (Poly Haven, CC0; src/app/desk-metal.js)
//
// Requires in .env.local: CLOUDFLARE_ACCOUNT_ID, R2_BUCKET_NAME,
//                         R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY

import { readFileSync, existsSync, statSync, readdirSync } from "fs";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { DESK_OBJECTS, DESK_CLIPS } from "../src/shared/desk-objects.js";

const DRY_RUN = process.argv.includes("--dry-run");
const texArg = process.argv.indexOf("--textures");
const TEXTURES = texArg > -1 ? new URL(process.argv[texArg + 1].replace(/\/?$/, "/"), import.meta.url) : null;
const srcArg = process.argv.indexOf("--src");
const SRC = new URL(
  srcArg > -1 ? process.argv[srcArg + 1] : "./.optimized-models/t1024/",
  import.meta.url,
);

const DEST_PREFIX = "models/web/";

const envRaw = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const env = Object.fromEntries(
  envRaw.split("\n")
    .filter((l) => l.trim() && !l.startsWith("#"))
    .map((l) => { const [k, ...v] = l.split("="); return [k.trim(), v.join("=").trim()]; })
);

const { CLOUDFLARE_ACCOUNT_ID: ACCOUNT_ID, R2_BUCKET_NAME: BUCKET,
        R2_ACCESS_KEY_ID: ACCESS_KEY, R2_SECRET_ACCESS_KEY: SECRET_KEY } = env;

if (!ACCOUNT_ID || !BUCKET || !ACCESS_KEY || !SECRET_KEY) {
  console.error("Missing R2 env vars in .env.local");
  process.exit(1);
}

const client = new S3Client({
  region: "auto",
  endpoint: `https://${ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: ACCESS_KEY, secretAccessKey: SECRET_KEY },
});

let total = 0;
for (const { file } of [...Object.values(DESK_OBJECTS), ...Object.values(DESK_CLIPS)]) {
  const path = new URL(file, SRC);
  if (!existsSync(path)) { console.log(`MISSING  ${file} — not in ${SRC.pathname}`); continue; }
  const body = readFileSync(path);
  const kb = Math.round(statSync(path).size / 1024);
  total += kb;
  if (DRY_RUN) { console.log(`would upload  ${DEST_PREFIX + file}  (${kb} KB)`); continue; }
  await client.send(new PutObjectCommand({
    Bucket: BUCKET,
    Key: DEST_PREFIX + file,
    Body: body,
    ContentType: "model/gltf-binary",
  }));
  console.log(`uploaded  ${DEST_PREFIX + file}  (${kb} KB)`);
}

if (TEXTURES) {
  const MIME = { webp: "image/webp", jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png" };
  for (const file of readdirSync(TEXTURES).filter((f) => /\.(webp|jpe?g|png)$/i.test(f)).sort()) {
    const path = new URL(file, TEXTURES);
    const body = readFileSync(path);
    const kb = Math.round(statSync(path).size / 1024);
    total += kb;
    const key = `${DEST_PREFIX}textures/${file}`;
    if (DRY_RUN) { console.log(`would upload  ${key}  (${kb} KB)`); continue; }
    await client.send(new PutObjectCommand({ Bucket: BUCKET, Key: key, Body: body, ContentType: MIME[file.split(".").pop().toLowerCase()] || "application/octet-stream", CacheControl: "public, max-age=31536000, immutable" }));
    console.log(`uploaded  ${key}  (${kb} KB)`);
  }
}
console.log(`${DRY_RUN ? "would upload" : "uploaded"} ${total} KB total`);
