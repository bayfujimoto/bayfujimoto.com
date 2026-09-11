import { readCookie, verifySession } from "../lib/session.js";
import { searchGames, allowedImageUrl, fetchGridImage } from "../lib/steamgriddb.js";

// SteamGridDB proxy for the admin's game intake — the key art that gets set
// into a platform's box (src/shared/game-box.js). Two jobs:
//
//   GET /api/steamgriddb?q=<title>   → { ok, games: [{ id, name, release_date,
//                                       verified, grids: [{ id, url, thumb, … }] }] }
//   GET /api/steamgriddb?image=<url> → the image bytes, from SteamGridDB's CDN
//                                       only, so the admin's canvas can read the
//                                       pixels (the CDN sends no CORS headers).
//
// The API key (STEAMGRIDDB_API_KEY) stays server-side. Gated by the same passkey
// session as every other privileged endpoint. The same two jobs are served in
// local dev by the vite plugin (src/admin/plugin/github-write.js) over the
// shared module, so behavior matches.

const json = (statusCode, body) => ({
  statusCode,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

export async function handler(event) {
  if (event.httpMethod !== "GET") return json(405, { ok: false, error: "Method not allowed" });

  const session = await verifySession(readCookie(event.headers?.cookie || event.headers?.Cookie));
  if (!session) return json(401, { ok: false, error: "unauthorized" });

  const key = process.env.STEAMGRIDDB_API_KEY;
  if (!key) return json(500, { ok: false, error: "STEAMGRIDDB_API_KEY not set in the Netlify environment" });

  const params = event.queryStringParameters || {};

  if (params.image) {
    const u = allowedImageUrl(params.image);
    if (!u) return json(400, { ok: false, error: "image host not allowed" });
    try {
      const { buffer, contentType } = await fetchGridImage(u);
      return {
        statusCode: 200,
        headers: { "Content-Type": contentType, "Cache-Control": "private, max-age=300" },
        body: Buffer.from(buffer).toString("base64"),
        isBase64Encoded: true,
      };
    } catch (e) {
      return json(502, { ok: false, error: e.message });
    }
  }

  const q = String(params.q || "").trim();
  if (!q) return json(400, { ok: false, error: "missing q" });

  try {
    return json(200, { ok: true, games: await searchGames(key, q) });
  } catch (e) {
    return json(502, { ok: false, error: e.message });
  }
}
