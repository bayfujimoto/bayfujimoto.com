// Rebuild every game record's box composite from its raw cover art.
//
// The admin bakes a game's cover into its platform's box at upload
// (src/admin/lib/upload.js, options.box). When a template PNG or its geometry
// changes (bump `version` in src/shared/game-box.js), or a record's platform /
// esrb / cover_fit is edited outside the admin, the derivative in R2 is stale.
// This script re-renders it with sharp from the same manifest the admin uses,
// rewrites cutouts/<base>-cut.png, display/<base>-web.webp and
// thumbnails/<base>-thumb.webp, and moves the record's ?v= token.
//
// Usage:
//   node scripts/rebuild-game-boxes.js            # all game records with a cover
//   node scripts/rebuild-game-boxes.js GAME-2026-003 [GAME-2026-005 …]
//   node scripts/rebuild-game-boxes.js --dry-run  # render to .cache/game-boxes/, touch nothing
//
// Requires in .env.local: CLOUDFLARE_ACCOUNT_ID, R2_BUCKET_NAME,
//   R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY.
//
// Records whose cover is not yet a box (a full retail scan from before the
// templates) are skipped with a note: they need bare key art re-uploaded
// through the admin, not a rebuild.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { fileURLToPath } from "url";
import path from "path";
import { glob } from "glob";
import matter from "gray-matter";
import YAML from "js-yaml";
import sharp from "sharp";
import { S3Client, GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import {
  TEMPLATES, OUTPUT_HEIGHT, layoutBox, boxOptionsFromRecord, boxTokenMode, isBoxAsset, esrbIconName,
} from "../src/shared/game-box.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TPL_DIR = path.join(ROOT, "public", "game-boxes");
const CONTENT = path.join(ROOT, "src", "content", "consumption", "games");

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const onlyIds = new Set(args.filter(a => !a.startsWith("--")));

function loadEnv() {
  const p = path.join(ROOT, ".env.local");
  if (!existsSync(p)) return {};
  return Object.fromEntries(
    readFileSync(p, "utf8").split("\n")
      .filter(l => l.trim() && !l.trim().startsWith("#"))
      .map(l => { const [k, ...v] = l.split("="); return [k.trim(), v.join("=").trim()]; }),
  );
}
const env = { ...loadEnv(), ...process.env };

let client = null;
if (!dryRun) {
  const { CLOUDFLARE_ACCOUNT_ID, R2_BUCKET_NAME, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY } = env;
  if (!CLOUDFLARE_ACCOUNT_ID || !R2_BUCKET_NAME || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY) {
    console.error("Missing R2 env vars in .env.local (or pass --dry-run)");
    process.exit(1);
  }
  client = new S3Client({
    region: "auto",
    endpoint: `https://${CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY },
  });
}
const BUCKET = env.R2_BUCKET_NAME;
const PUBLIC_BASE = env.VITE_R2_BASE_URL;

async function getObject(key) {
  if (client) {
    const res = await client.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }));
    return Buffer.from(await res.Body.transformToByteArray());
  }
  // dry run: read through the public bucket URL
  if (!PUBLIC_BASE) throw new Error("dry-run needs VITE_R2_BASE_URL to read originals");
  const res = await fetch(`${PUBLIC_BASE}/${key}`);
  if (!res.ok) throw new Error(`fetch ${key} → ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

async function putObject(key, body, contentType) {
  await client.send(new PutObjectCommand({
    Bucket: BUCKET, Key: key, Body: body, ContentType: contentType,
    CacheControl: "public, max-age=31536000, immutable",
  }));
}

// ── the sharp renderer (mirrors src/admin/lib/game-box-render.js) ───────────
async function renderBox(artBuf, box) {
  const t = TEMPLATES[box.template];
  const art = sharp(artBuf).rotate(); // honor EXIF orientation like the browser does
  const meta = await art.metadata();
  const aw = meta.width, ah = meta.height;

  const iconName = esrbIconName(box.rating);
  let icon = null, esrbAspect;
  if (iconName) {
    icon = sharp(path.join(TPL_DIR, "esrb", `${iconName}.png`));
    const im = await icon.metadata();
    esrbAspect = im.width / im.height;
  }

  const L = layoutBox(box.template, aw, ah, box.fit, box.rating, esrbAspect);
  const W = L.width, H = L.height;

  // Art: scale to its laid-out size, then take the part that falls inside the
  // window (the clip), placed at the window's origin.
  const artW = Math.max(1, Math.round(L.art.w)), artH = Math.max(1, Math.round(L.art.h));
  const ax = Math.round(L.art.x), ay = Math.round(L.art.y);
  const wx = Math.round(L.window.x), wy = Math.round(L.window.y);
  const ww = Math.round(L.window.w), wh = Math.round(L.window.h);
  const scaled = await art.resize(artW, artH, { fit: "fill" }).ensureAlpha().png().toBuffer();
  // intersection of art rect and window rect, in art-local coordinates
  const ix0 = Math.max(wx, ax), iy0 = Math.max(wy, ay);
  const ix1 = Math.min(wx + ww, ax + artW), iy1 = Math.min(wy + wh, ay + artH);
  const layers = [];
  if (ix1 > ix0 && iy1 > iy0) {
    const clipped = await sharp(scaled)
      .extract({ left: ix0 - ax, top: iy0 - ay, width: ix1 - ix0, height: iy1 - iy0 })
      .png().toBuffer();
    layers.push({ input: clipped, left: ix0, top: iy0 });
  }

  const tpl = await sharp(path.join(TPL_DIR, `${box.template}.png`))
    .resize(W, H, { fit: "fill", kernel: "lanczos3" }).png().toBuffer();
  layers.push({ input: tpl, left: 0, top: 0 });

  if (icon && L.esrb) {
    const ew = Math.max(1, Math.round(L.esrb.w)), eh = Math.max(1, Math.round(L.esrb.h));
    const badge = await icon.resize(ew, eh, { fit: "fill" }).png().toBuffer();
    layers.push({ input: badge, left: Math.round(L.esrb.x), top: Math.round(L.esrb.y) });
  }

  const composite = sharp({ create: { width: W, height: H, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite(layers);
  const cutPng = await composite.png().toBuffer();
  const web = await sharp(cutPng).resize({ width: 2048, height: 2048, fit: "inside", withoutEnlargement: true }).webp({ quality: 82 }).toBuffer();
  const thumb = await sharp(cutPng).resize({ width: 200, height: 200, fit: "inside", withoutEnlargement: true }).webp({ quality: 85 }).toBuffer();
  return { cutPng, web, thumb };
}

// ── main ─────────────────────────────────────────────────────────────────────
const files = (await glob("*.md", { cwd: CONTENT, absolute: true })).sort();
let done = 0, skipped = 0;

for (const file of files) {
  const raw = readFileSync(file, "utf8");
  const parsed = matter(raw);
  const rec = parsed.data;
  if (rec.item_type !== "game") continue;
  if (onlyIds.size && !onlyIds.has(rec.id)) continue;

  const stored = rec.assets?.cover;
  if (!stored) { console.log(`· ${rec.id}: no cover`); skipped++; continue; }
  if (!isBoxAsset(stored)) {
    console.log(`· ${rec.id}: cover is not a box composite (pre-template scan) — re-upload bare key art in the admin`);
    skipped++; continue;
  }
  const box = boxOptionsFromRecord(rec);
  if (!box) { console.log(`· ${rec.id}: platform "${rec.platform}" has no box template`); skipped++; continue; }

  const name = String(stored).split("?")[0];
  const base = name.replace(/\.[^./]+$/, "");
  const oldToken = String(stored).slice(String(stored).indexOf("?v=") + 3);
  const hex = oldToken.slice(0, oldToken.indexOf("bx"));
  const newToken = `${hex}${boxTokenMode(box)}`;

  process.stdout.write(`▸ ${rec.id}: ${box.template}${box.rating ? ` · ${box.rating}` : ""} … `);
  const artBuf = await getObject(`originals/${name}`);
  const { cutPng, web, thumb } = await renderBox(artBuf, box);

  if (dryRun) {
    const out = path.join(ROOT, ".cache", "game-boxes");
    mkdirSync(out, { recursive: true });
    writeFileSync(path.join(out, `${base}-cut.png`), cutPng);
    console.log(`rendered → .cache/game-boxes/${base}-cut.png (token would be ${newToken})`);
    done++; continue;
  }

  await Promise.all([
    putObject(`cutouts/${base}-cut.png`, cutPng, "image/png"),
    putObject(`display/${base}-web.webp`, web, "image/webp"),
    putObject(`thumbnails/${base}-thumb.webp`, thumb, "image/webp"),
  ]);

  if (newToken !== oldToken) {
    rec.assets.cover = `${name}?v=${newToken}`;
    if (rec.assets.thumbnail) rec.assets.thumbnail = `${base}-thumb.webp?v=${newToken}`;
    // Same YAML shape the admin's serializer writes (src/admin/lib/serializer.js).
    const fm = YAML.dump(rec, { lineWidth: -1, quotingType: '"', forceQuotes: false });
    writeFileSync(file, `---\n${fm}---\n${parsed.content}`);
    console.log(`uploaded, token ${oldToken} → ${newToken}`);
  } else {
    console.log("uploaded (token unchanged — same params; caches may hold the old render)");
  }
  done++;
}

console.log(`\n${done} rebuilt, ${skipped} skipped.`);
