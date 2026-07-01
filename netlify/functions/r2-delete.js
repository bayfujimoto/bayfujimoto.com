import { S3Client, DeleteObjectsCommand } from "@aws-sdk/client-s3";
import { readCookie, verifySession } from "../lib/session.js";

// Deletes a list of R2 objects — used to clean up stale derivatives when an
// asset is replaced (a re-upload with a different file type or cut-out mode
// leaves the old original / thumbnail / cut-out under keys the new upload no
// longer writes). Gated by the same passkey session as the other privileged
// endpoints, and each key is prefix-validated so only asset objects can be
// removed.
const ALLOWED_PREFIXES = ["originals", "thumbnails", "display", "cutouts"];

function isAllowedKey(key) {
  if (typeof key !== "string" || key.includes("..")) return false;
  const slash = key.indexOf("/");
  if (slash <= 0) return false;
  return ALLOWED_PREFIXES.includes(key.slice(0, slash));
}

export async function handler(event) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: JSON.stringify({ ok: false, error: "Method not allowed" }) };
  }

  const session = await verifySession(
    readCookie(event.headers?.cookie || event.headers?.Cookie)
  );
  if (!session) {
    return { statusCode: 401, body: JSON.stringify({ ok: false, error: "unauthorized" }) };
  }

  const ACCOUNT_ID    = process.env.CLOUDFLARE_ACCOUNT_ID;
  const BUCKET        = process.env.R2_BUCKET_NAME;
  const ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
  const SECRET_KEY    = process.env.R2_SECRET_ACCESS_KEY;

  if (!ACCOUNT_ID || !BUCKET || !ACCESS_KEY_ID || !SECRET_KEY) {
    return { statusCode: 500, body: JSON.stringify({ ok: false, error: "R2 env vars not configured" }) };
  }

  let payload;
  try {
    payload = JSON.parse(event.body);
  } catch {
    return { statusCode: 400, body: JSON.stringify({ ok: false, error: "Invalid JSON body" }) };
  }

  const keys = Array.isArray(payload.keys) ? payload.keys.filter(isAllowedKey) : [];
  if (!keys.length) {
    return { statusCode: 200, body: JSON.stringify({ ok: true, deleted: [] }) };
  }

  const client = new S3Client({
    region: "auto",
    endpoint: `https://${ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: ACCESS_KEY_ID, secretAccessKey: SECRET_KEY },
  });

  try {
    const res = await client.send(new DeleteObjectsCommand({
      Bucket: BUCKET,
      Delete: { Objects: keys.map(Key => ({ Key })), Quiet: true },
    }));
    return {
      statusCode: 200,
      body: JSON.stringify({ ok: true, deleted: keys, errors: res.Errors || [] }),
    };
  } catch (e) {
    return {
      statusCode: 500,
      body: JSON.stringify({ ok: false, error: `R2 delete failed: ${e.message}` }),
    };
  }
}
