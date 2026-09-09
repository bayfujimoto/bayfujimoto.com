// Publishes the desk's light-weight assets to R2: the finished desk and key
// GLBs, and a desk-size WebP of every cut-out scan.
//
// Why: the desk loaded 9.5 MB of key (699 k triangles), 1.5 MB of desk (PNG
// maps), and a full-resolution PNG cut-out per scan on the pile (~1.4 MB
// each). The finished models are simplified (the key to ~42 k triangles, its
// tangents dropped), quantized, meshopt-encoded, with WebP maps:
//   desk-guide-key-lite.glb   ~790 KB     desk-web.glb   ~190 KB
// The cut-outs are resampled to 1000 px on the long side as WebP with alpha
// (~100 KB each) at cutouts/<base>-cut-desk.webp; the site's plate keeps the
// full PNG. Everything is published under NEW names — R2 objects are cached
// immutable for a year, so nothing is overwritten.
//
// Usage:
//   node scripts/publish-desk-assets.js             # models + cut-outs
//   node scripts/publish-desk-assets.js --dry-run
//   node scripts/publish-desk-assets.js --models    # only the GLBs
//   node scripts/publish-desk-assets.js --cutouts   # only the cut-outs
//   node scripts/publish-desk-assets.js --force     # re-upload cut-outs that exist
//
// Models are read from .optimized-models/web/ (made with
// scripts/finish-desk-model.js or gltf-transform; not committed). Cut-outs
// are read from the public bucket and converted here with sharp.
// Requires in .env.local: CLOUDFLARE_ACCOUNT_ID, R2_BUCKET_NAME,
//                         R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, VITE_R2_BASE_URL

import { readFileSync, existsSync, statSync } from "fs";
import { S3Client, PutObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import sharp from "sharp";

const args = process.argv.slice(2);
const DRY = args.includes("--dry-run"), FORCE = args.includes("--force");
const ONLY_MODELS = args.includes("--models"), ONLY_CUTOUTS = args.includes("--cutouts");
const DESK_PX = 1000;   // long side; the desk draws a scan at ≤ ~700 px of texture

const env = Object.fromEntries(readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")
  .filter((l) => l.trim() && !l.startsWith("#")).map((l) => { const [k, ...v] = l.split("="); return [k.trim(), v.join("=").trim()]; }));
const { CLOUDFLARE_ACCOUNT_ID: ACCOUNT_ID, R2_BUCKET_NAME: BUCKET, R2_ACCESS_KEY_ID: ACCESS_KEY, R2_SECRET_ACCESS_KEY: SECRET_KEY, VITE_R2_BASE_URL: PUBLIC } = env;
if (!ACCOUNT_ID || !BUCKET || !ACCESS_KEY || !SECRET_KEY || !PUBLIC) { console.error("Missing R2 env vars in .env.local"); process.exit(1); }
const client = new S3Client({ region: "auto", endpoint: `https://${ACCOUNT_ID}.r2.cloudflarestorage.com`, credentials: { accessKeyId: ACCESS_KEY, secretAccessKey: SECRET_KEY } });

const exists = async (Key) => { try { await client.send(new HeadObjectCommand({ Bucket: BUCKET, Key })); return true; } catch { return false; } };
const put = async (Key, Body, ContentType) => {
  const kb = Math.round(Body.length / 1024);
  if (DRY) { console.log(`would upload  ${Key}  (${kb} KB)`); return; }
  await client.send(new PutObjectCommand({ Bucket: BUCKET, Key, Body, ContentType, CacheControl: "public, max-age=31536000, immutable" }));
  console.log(`uploaded  ${Key}  (${kb} KB)`);
};

if (!ONLY_CUTOUTS) {
  for (const file of ["desk-web.glb", "desk-guide-key-lite.glb"]) {
    const path = new URL(`../.optimized-models/web/${file}`, import.meta.url);
    if (!existsSync(path)) { console.log(`MISSING  ${file} — not in .optimized-models/web/`); continue; }
    await put(`models/web/${file}`, readFileSync(path), "model/gltf-binary");
  }
}

if (!ONLY_MODELS) {
  const archive = JSON.parse(readFileSync(new URL("../public/data/archive.json", import.meta.url), "utf8"));
  const isCut = (v) => { const qi = v ? v.indexOf("?v=") : -1; return qi !== -1 && /c\d+x\d+$/.test(v.slice(qi + 3)); };
  const items = (archive.series?.accumulation?.items || []).filter((i) => isCut(i.assets?.front));
  console.log(`${items.length} cut-out scans`);
  for (const i of items) {
    const front = i.assets.front; const qi = front.indexOf("?v="); const ver = front.slice(qi + 3); const base = front.slice(0, qi).replace(/\.[^./]+$/, "");
    const key = `cutouts/${base}-cut-desk.webp`;
    if (!FORCE && !DRY && await exists(key)) { console.log(`have      ${key}`); continue; }
    const srcUrl = `${PUBLIC}/cutouts/${base}-cut.png?v=${ver}`;
    const res = await fetch(srcUrl); if (!res.ok) { console.log(`MISSING  ${srcUrl} (${res.status})`); continue; }
    const png = Buffer.from(await res.arrayBuffer());
    const meta = await sharp(png).metadata(); const long = Math.max(meta.width || 0, meta.height || 0);
    const img = sharp(png).ensureAlpha();
    const out = await (long > DESK_PX ? img.resize({ width: meta.width >= meta.height ? DESK_PX : undefined, height: meta.height > meta.width ? DESK_PX : undefined, kernel: "lanczos3" }) : img)
      .webp({ quality: 82, alphaQuality: 90, effort: 6 }).toBuffer();
    await put(key, out, "image/webp");
  }
}
