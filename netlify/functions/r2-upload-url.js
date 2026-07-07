import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { readCookie, verifySession } from "../lib/session.js";

export async function handler(event) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: JSON.stringify({ ok: false, error: "Method not allowed" }) };
  }

  // Gated by the same passkey session cookie as /admin. A presigned R2 PUT
  // URL is a privileged credential (write access to the bucket), so this
  // returns 401 before issuing one to an unauthenticated caller.
  const session = await verifySession(
    readCookie(event.headers?.cookie || event.headers?.Cookie)
  );
  if (!session) {
    return { statusCode: 401, body: JSON.stringify({ ok: false, error: "unauthorized" }) };
  }

  const ACCOUNT_ID     = process.env.CLOUDFLARE_ACCOUNT_ID;
  const BUCKET         = process.env.R2_BUCKET_NAME;
  const ACCESS_KEY_ID  = process.env.R2_ACCESS_KEY_ID;
  const SECRET_KEY     = process.env.R2_SECRET_ACCESS_KEY;

  if (!ACCOUNT_ID || !BUCKET || !ACCESS_KEY_ID || !SECRET_KEY) {
    return { statusCode: 500, body: JSON.stringify({ ok: false, error: "R2 env vars not configured" }) };
  }

  let payload;
  try {
    payload = JSON.parse(event.body);
  } catch {
    return { statusCode: 400, body: JSON.stringify({ ok: false, error: "Invalid JSON body" }) };
  }

  const { filename, contentType, prefix } = payload;

  if (!filename || !contentType || !prefix) {
    return { statusCode: 400, body: JSON.stringify({ ok: false, error: "Missing filename, contentType, or prefix" }) };
  }

  if (!["originals", "thumbnails", "display", "cutouts"].includes(prefix)) {
    return { statusCode: 400, body: JSON.stringify({ ok: false, error: "prefix must be originals, thumbnails, display, or cutouts" }) };
  }

  const key = `${prefix}/${filename}`;

  // Cache policy stamped onto the object. Image derivatives (originals, thumbnails,
  // display, cutouts) are always addressed by the site with a ?v= cache-bust token,
  // so a given URL never changes its bytes — cache it immutably for a year. Model
  // files (uploaded to originals/ as <id>-model.<glb|gltf>) carry no ?v= token, so
  // they get a modest TTL instead to stay replaceable. This value is SIGNED into
  // the presigned PUT, so the client must send it back verbatim — it is returned
  // below and echoed by putToR2() in src/admin/lib/upload.js. Without a header the
  // r2.dev origin sends no Cache-Control and every prefetch / re-view re-fetches.
  const isModel = prefix === "originals" && /(-model\.|\.glb$|\.gltf$)/i.test(filename);
  const cacheControl = isModel
    ? "public, max-age=86400"
    : "public, max-age=31536000, immutable";

  const client = new S3Client({
    region: "auto",
    endpoint: `https://${ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: ACCESS_KEY_ID, secretAccessKey: SECRET_KEY },
  });

  try {
    const command = new PutObjectCommand({ Bucket: BUCKET, Key: key, ContentType: contentType, CacheControl: cacheControl });
    const uploadUrl = await getSignedUrl(client, command, { expiresIn: 120 });
    return {
      statusCode: 200,
      body: JSON.stringify({ ok: true, uploadUrl, key, cacheControl }),
    };
  } catch (e) {
    return {
      statusCode: 500,
      body: JSON.stringify({ ok: false, error: `R2 presign failed: ${e.message}` }),
    };
  }
}
