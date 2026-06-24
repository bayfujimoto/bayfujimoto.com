import { readCookie, verifySession } from "../lib/session.js";
// The full archive (all statuses, incl. drafts) is bundled into this function at
// build time — esbuild inlines the JSON import, so the data ships inside the
// function and is never exposed as a static file under dist/. scripts/build-data.js
// writes _admin-archive.json before the functions are bundled.
import adminArchive from "./_admin-archive.json";

// Returns the full archive (every status) to an authenticated admin session only.
// Gated by the same passkey session cookie as /admin and the write endpoints; the
// public site reads the published-only /data/archive.json instead.
export async function handler(event) {
  if (event.httpMethod !== "GET") {
    return { statusCode: 405, body: JSON.stringify({ ok: false, error: "Method not allowed" }) };
  }

  const session = await verifySession(
    readCookie(event.headers?.cookie || event.headers?.Cookie)
  );
  if (!session) {
    return { statusCode: 401, body: JSON.stringify({ ok: false, error: "unauthorized" }) };
  }

  return {
    statusCode: 200,
    headers: {
      "Content-Type": "application/json",
      // Never let a browser or CDN cache draft content.
      "Cache-Control": "no-store",
    },
    body: JSON.stringify(adminArchive),
  };
}
