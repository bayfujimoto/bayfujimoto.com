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

  if (!["originals", "thumbnails"].includes(prefix)) {
    return { statusCode: 400, body: JSON.stringify({ ok: false, error: "prefix must be originals or thumbnails" }) };
  }

  const key = `${prefix}/${filename}`;

  const client = new S3Client({
    region: "auto",
    endpoint: `https://${ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: ACCESS_KEY_ID, secretAccessKey: SECRET_KEY },
  });

  try {
    const command = new PutObjectCommand({ Bucket: BUCKET, Key: key, ContentType: contentType });
    const uploadUrl = await getSignedUrl(client, command, { expiresIn: 120 });
    return {
      statusCode: 200,
      body: JSON.stringify({ ok: true, uploadUrl, key }),
    };
  } catch (e) {
    return {
      statusCode: 500,
      body: JSON.stringify({ ok: false, error: `R2 presign failed: ${e.message}` }),
    };
  }
}
