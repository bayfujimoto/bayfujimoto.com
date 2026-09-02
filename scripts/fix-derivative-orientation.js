// Re-derives thumbnails and display derivatives whose originals carry an EXIF
// orientation tag. The batch scripts (migrate-thumbnails, backfill-display-sizes)
// historically ran sharp without .rotate(), so an original photographed with the
// camera turned got sideways derivatives while the original itself views upright
// (browsers honor EXIF). This sweep finds every original with orientation > 1
// and rebuilds its thumbnail + display derivative with .rotate() applied.
//
// Usage:
//   node scripts/fix-derivative-orientation.js --dry-run     # report only
//   node scripts/fix-derivative-orientation.js               # fix all affected
//   node scripts/fix-derivative-orientation.js EPH-2026-019-front [...]  # only these bases
//
// After fixing, bump THUMB_VERSION / DISPLAY_VERSION in src/app/image-url.js
// (done alongside this script) so cached sideways derivatives bust.
// Requires: R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME,
//           CLOUDFLARE_ACCOUNT_ID in .env.local

import { readFileSync } from "fs";
import { S3Client, ListObjectsV2Command, GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import sharp from "sharp";

const DRY_RUN = process.argv.includes("--dry-run");
const ONLY = process.argv.slice(2).filter(a => !a.startsWith("--"));

const envRaw = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const env = Object.fromEntries(
  envRaw.split("\n")
    .filter(l => l.trim() && !l.startsWith("#"))
    .map(l => { const [k, ...v] = l.split("="); return [k.trim(), v.join("=").trim()]; })
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

async function listAll(prefix) {
  const keys = [];
  let token;
  do {
    const res = await client.send(new ListObjectsV2Command({ Bucket: BUCKET, Prefix: prefix, ContinuationToken: token }));
    for (const obj of res.Contents || []) keys.push(obj.Key);
    token = res.NextContinuationToken;
  } while (token);
  return keys;
}

async function streamToBuffer(stream) {
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  return Buffer.concat(chunks);
}

async function exists(key) {
  try {
    await client.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }));
    return true;
  } catch (err) {
    if (err.name === "NoSuchKey" || err.$metadata?.httpStatusCode === 404) return false;
    throw err;
  }
}

const IMAGE_EXTS = new Set(["jpg", "jpeg", "png", "webp", "tiff"]);
const stripExt = k => k.replace(/\.[^./]+$/, "");

const originalKeys = (await listAll("originals/"))
  .filter(k => IMAGE_EXTS.has(k.split(".").pop().toLowerCase()))
  .filter(k => !ONLY.length || ONLY.some(base => stripExt(k.replace(/^originals\//, "")) === base));

console.log(`Checking ${originalKeys.length} original(s)${DRY_RUN ? " (dry run)" : ""}…\n`);

let affected = 0, fixed = 0, failed = 0;

for (const key of originalKeys) {
  try {
    const getRes = await client.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }));
    const buf = await streamToBuffer(getRes.Body);
    const meta = await sharp(buf).metadata();
    if (!meta.orientation || meta.orientation === 1) continue;

    affected++;
    const base = stripExt(key.replace(/^originals\//, ""));
    console.log(`${key} — EXIF orientation ${meta.orientation}`);
    if (DRY_RUN) continue;

    // Thumbnail — only the JPEG convention (the sharp scripts' output). A WebP
    // thumbnail means a cut-out asset whose derivatives came from the admin's
    // canvas (already oriented); leave those alone.
    const thumbKey = `thumbnails/${base}-thumb.jpg`;
    if (await exists(thumbKey)) {
      const thumb = await sharp(buf)
        .rotate()
        .resize({ width: 200, height: 200, fit: "inside", withoutEnlargement: true })
        .jpeg({ quality: 80 })
        .toBuffer();
      await client.send(new PutObjectCommand({
        Bucket: BUCKET, Key: thumbKey, Body: thumb, ContentType: "image/jpeg",
        CacheControl: "public, max-age=31536000, immutable",
      }));
      console.log(`  ✓ ${thumbKey}`);
    }

    const dispKey = `display/${base}-web.webp`;
    if (await exists(dispKey)) {
      const web = await sharp(buf)
        .rotate()
        .resize({ width: 2048, height: 2048, fit: "inside", withoutEnlargement: true })
        .webp({ quality: 82 })
        .toBuffer();
      await client.send(new PutObjectCommand({
        Bucket: BUCKET, Key: dispKey, Body: web, ContentType: "image/webp",
        CacheControl: "public, max-age=31536000, immutable",
      }));
      console.log(`  ✓ ${dispKey}`);
    }
    fixed++;
  } catch (e) {
    failed++;
    console.log(`${key} — FAILED: ${e.message}`);
  }
}

console.log(`\n${affected} affected, ${DRY_RUN ? "0 fixed (dry run)" : `${fixed} fixed`}, ${failed} failed.`);
if (!DRY_RUN && fixed > 0) {
  console.log("Now bump THUMB_VERSION and DISPLAY_VERSION in src/app/image-url.js to bust caches.");
}
