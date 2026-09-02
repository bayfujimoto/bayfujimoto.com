import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { readCookie, verifySession } from "../lib/session.js";

// Returns a short-lived presigned GET URL for one R2 object — used by the
// admin's rotate control, which needs the original's pixels to re-derive
// rotated derivatives client-side (the public bucket URL is a different
// origin, so a canvas read needs the S3 endpoint the browser already has CORS
// access to for presigned PUTs). Gated by the same passkey session as the
// other privileged endpoints; keys are prefix-validated like r2-delete.
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

  const { key } = payload;
  if (!isAllowedKey(key)) {
    return { statusCode: 400, body: JSON.stringify({ ok: false, error: "Invalid key" }) };
  }

  const client = new S3Client({
    region: "auto",
    endpoint: `https://${ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: ACCESS_KEY_ID, secretAccessKey: SECRET_KEY },
  });

  try {
    const url = await getSignedUrl(client, new GetObjectCommand({ Bucket: BUCKET, Key: key }), { expiresIn: 300 });
    return { statusCode: 200, body: JSON.stringify({ ok: true, url }) };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ ok: false, error: `R2 presign failed: ${e.message}` }) };
  }
}
