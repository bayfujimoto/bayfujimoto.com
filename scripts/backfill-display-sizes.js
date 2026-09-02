// Backfills the display/ prefix in R2: for every image in originals/, generates a
// web-size WebP (2048px long edge, never enlarged) and uploads it as
// display/<base>-web.webp — the convention image-url.js reads. Items ingested
// before the display pipeline existed then stop serving full originals on the site.
//
// Idempotent: skips originals that already have a display derivative (unless --force).
// Skips non-image originals (3D models, etc.).
//
// Usage:
//   node scripts/backfill-display-sizes.js          # only missing derivatives
//   node scripts/backfill-display-sizes.js --force   # regenerate all
//   node scripts/backfill-display-sizes.js --dry-run # report, upload nothing
// Requires: R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME,
//           CLOUDFLARE_ACCOUNT_ID in .env.local

import { readFileSync } from "fs";
import {
  S3Client,
  ListObjectsV2Command,
  GetObjectCommand,
  PutObjectCommand,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";
import sharp from "sharp";

const FORCE   = process.argv.includes("--force");
const DRY_RUN = process.argv.includes("--dry-run");
const MAX_EDGE = 2048;
const IMAGE_EXTS = new Set(["jpg", "jpeg", "png", "webp", "tif", "tiff"]);

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

async function exists(key) {
  try {
    await client.send(new HeadObjectCommand({ Bucket: BUCKET, Key: key }));
    return true;
  } catch (err) {
    if (err.name === "NotFound" || err.$metadata?.httpStatusCode === 404) return false;
    throw err;
  }
}

async function streamToBuffer(stream) {
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  return Buffer.concat(chunks);
}

function extOf(key) {
  const m = key.match(/\.([^./]+)$/);
  return m ? m[1].toLowerCase() : "";
}

// originals/foo.png  →  display/foo-web.webp
function displayKeyFor(originalKey) {
  const base = originalKey.replace(/^originals\//, "").replace(/\.[^./]+$/, "");
  return `display/${base}-web.webp`;
}

const originalKeys = await listAll("originals/");
console.log(`Found ${originalKeys.length} object(s) in originals/.${DRY_RUN ? " (dry run)" : ""}\n`);

let made = 0, skippedExisting = 0, skippedNonImage = 0, failed = 0;

for (const key of originalKeys) {
  const ext = extOf(key);
  if (!IMAGE_EXTS.has(ext)) { skippedNonImage++; continue; }

  const dispKey = displayKeyFor(key);
  process.stdout.write(`${key} → ${dispKey} ... `);
  try {
    if (!FORCE && await exists(dispKey)) { console.log("skip (exists)"); skippedExisting++; continue; }
    if (DRY_RUN) { console.log("would create"); made++; continue; }

    const getRes = await client.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }));
    const buf = await streamToBuffer(getRes.Body);

    const web = await sharp(buf)
      .rotate() // apply EXIF orientation — sharp ignores it by default
      .resize({ width: MAX_EDGE, height: MAX_EDGE, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 82 })
      .toBuffer();

    await client.send(new PutObjectCommand({
      Bucket: BUCKET,
      Key: dispKey,
      Body: web,
      ContentType: "image/webp",
      // Derivatives are addressed with a ?v= cache-bust token, so the object at a
      // given URL never changes — safe to cache immutably for a year. Without this,
      // r2.dev sends no Cache-Control and prefetches/re-views re-fetch every time.
      CacheControl: "public, max-age=31536000, immutable",
    }));

    console.log(`done (${(web.length / 1024).toFixed(0)} KB)`);
    made++;
  } catch (err) {
    console.log(`FAILED: ${err.message}`);
    failed++;
  }
}

console.log(
  `\nBackfill complete. ${made} ${DRY_RUN ? "would be created" : "created"}, ` +
  `${skippedExisting} already present, ${skippedNonImage} non-image skipped, ${failed} failed.`
);
