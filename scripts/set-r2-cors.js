// Sets the CORS policy on the R2 bucket so the admin's browser-side presigned
// PUT uploads succeed. Image derivative PUTs already required a CORS preflight
// (Content-Type: image/png etc. is not a "simple" value); Phase 7 additionally
// began signing a `Cache-Control` request header into those PUTs. Unless the
// bucket's CORS AllowedHeaders permit `Cache-Control`, the browser's preflight
// fails and the upload dies with a bare "Failed to fetch" (a network/CORS error,
// not an HTTP status). This keeps the policy reproducible and version-controlled
// instead of living only in the Cloudflare dashboard.
//
// Usage:
//   node scripts/set-r2-cors.js --dry-run   # print current + proposed, change nothing
//   node scripts/set-r2-cors.js             # apply the policy
// Requires: R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME,
//           CLOUDFLARE_ACCOUNT_ID in .env.local

import { readFileSync } from "fs";
import {
  S3Client,
  GetBucketCorsCommand,
  PutBucketCorsCommand,
} from "@aws-sdk/client-s3";

const DRY_RUN = process.argv.includes("--dry-run");

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

// Browser origins that legitimately GET (view images) and PUT (upload) objects.
// The time-limited presigned URL — not this origin list — is the write-auth
// boundary, so the list only needs to cover where the admin actually runs plus
// local dev. Deletes go through the r2-delete Netlify function (server-side, no
// browser CORS), so DELETE is intentionally absent.
const AllowedOrigins = [
  "https://bayfujimoto.netlify.app",
  "https://bayfujimoto.com",
  "https://www.bayfujimoto.com",
  "http://localhost:8080", // vite dev
  "http://localhost:8888", // netlify dev (functions)
];

// AllowedHeaders "*" covers Content-Type and Cache-Control (both signed into the
// PUT) and keeps this from breaking again if a future upload signs another header.
const rule = {
  AllowedOrigins,
  AllowedMethods: ["GET", "PUT", "HEAD"],
  AllowedHeaders: ["*"],
  ExposeHeaders: ["ETag"],
  MaxAgeSeconds: 3600,
};

async function main() {
  let current = [];
  try {
    const res = await client.send(new GetBucketCorsCommand({ Bucket: BUCKET }));
    current = res.CORSRules || [];
  } catch (e) {
    if (e.name === "NoSuchCORSConfiguration") current = [];
    else throw e;
  }

  console.log(`Bucket: ${BUCKET}`);
  console.log("\nCurrent CORS policy:");
  console.log(JSON.stringify(current, null, 2));
  console.log("\nProposed CORS policy:");
  console.log(JSON.stringify([rule], null, 2));

  if (DRY_RUN) {
    console.log("\n--dry-run: no changes made.");
    return;
  }

  await client.send(new PutBucketCorsCommand({
    Bucket: BUCKET,
    CORSConfiguration: { CORSRules: [rule] },
  }));
  console.log("\n✓ Applied. Browser presigned-PUT uploads should now pass the preflight.");
}

main().catch(e => { console.error("Failed:", e.message); process.exit(1); });
