// Regenerates all thumbnails in R2 from their originals,
// preserving aspect ratio (replacing the old 200x200 square crops).
// Operates on everything in the thumbnails/ prefix — not just published items.
//
// Usage: node scripts/migrate-thumbnails.js
// Requires: R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME,
//           CLOUDFLARE_ACCOUNT_ID in .env.local

import { readFileSync } from "fs";
import { S3Client, ListObjectsV2Command, GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import sharp from "sharp";

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

// Derive the originals/ key from a thumbnails/ key.
// Convention: foo-thumb.jpg  →  originals/foo.{jpg,jpeg,png,webp,tiff}
async function findOriginal(thumbKey) {
  const base = thumbKey.replace(/^thumbnails\//, "").replace(/-thumb\.jpg$/, "");
  for (const ext of ["jpg", "jpeg", "png", "webp", "tiff"]) {
    const candidate = `originals/${base}.${ext}`;
    try {
      await client.send(new GetObjectCommand({ Bucket: BUCKET, Key: candidate }));
      return candidate;
    } catch (err) {
      if (err.name !== "NoSuchKey" && err.$metadata?.httpStatusCode !== 404) throw err;
    }
  }
  return null;
}

async function streamToBuffer(stream) {
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  return Buffer.concat(chunks);
}

const thumbKeys = await listAll("thumbnails/");
console.log(`Found ${thumbKeys.length} thumbnail(s) in R2.\n`);

for (const thumbKey of thumbKeys) {
  process.stdout.write(`${thumbKey} ... `);
  try {
    const originalKey = await findOriginal(thumbKey);
    if (!originalKey) {
      console.log("SKIP (no matching original found)");
      continue;
    }

    const getRes = await client.send(new GetObjectCommand({ Bucket: BUCKET, Key: originalKey }));
    const buf = await streamToBuffer(getRes.Body);

    const newThumb = await sharp(buf)
      .resize({ width: 200, height: 200, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 80 })
      .toBuffer();

    await client.send(new PutObjectCommand({
      Bucket: BUCKET,
      Key: thumbKey,
      Body: newThumb,
      ContentType: "image/jpeg",
      // Thumbnails are addressed with a ?v= cache-bust token, so a given URL is
      // stable — cache immutably for a year. Without this, r2.dev serves no
      // Cache-Control and every prefetch / re-view re-fetches the bytes.
      CacheControl: "public, max-age=31536000, immutable",
    }));

    console.log("done");
  } catch (err) {
    console.log(`FAILED: ${err.message}`);
  }
}

console.log("\nMigration complete.");
