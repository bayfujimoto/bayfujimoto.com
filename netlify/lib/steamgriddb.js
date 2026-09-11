// SteamGridDB access, shared by the Netlify function (production) and the vite
// dev plugin (local `npm run dev`), so the admin's "find cover" search behaves
// the same in both. The API key never reaches the browser: both callers read it
// from the environment and proxy on the admin's behalf.
//
// Grids are asked for at 600x900 — the vertical cover proportion — static only,
// no NSFW or joke art: the closest thing SteamGridDB has to bare key art, which
// is what a game box template needs (see src/shared/game-box.js).

const API = "https://www.steamgriddb.com/api/v2";
const MAX_GAMES = 6;
const MAX_GRIDS = 8;

// The CDN the image passthrough will fetch from — nothing else.
const IMAGE_HOSTS = new Set(["cdn2.steamgriddb.com", "cdn.steamgriddb.com", "www.steamgriddb.com"]);

export const MAX_IMAGE_BYTES = 5.5 * 1024 * 1024;

/** Title search + each hit's candidate covers. Throws with a readable message. */
export async function searchGames(key, q) {
  const headers = { Authorization: `Bearer ${key}` };
  const res = await fetch(`${API}/search/autocomplete/${encodeURIComponent(q)}`, { headers });
  if (!res.ok) {
    throw new Error(res.status === 401 || res.status === 403
      ? "SteamGridDB rejected the API key"
      : `SteamGridDB search failed (${res.status})`);
  }
  const data = await res.json();
  const found = Array.isArray(data?.data) ? data.data.slice(0, MAX_GAMES) : [];

  return Promise.all(found.map(async (g) => {
    let grids = [];
    try {
      const gres = await fetch(
        `${API}/grids/game/${g.id}?dimensions=600x900&types=static&nsfw=false&humor=false`,
        { headers },
      );
      if (gres.ok) {
        const gdata = await gres.json();
        grids = (gdata?.data || []).slice(0, MAX_GRIDS).map(x => ({
          id: x.id, url: x.url, thumb: x.thumb, width: x.width, height: x.height,
          style: x.style, author: x.author?.name || "",
        }));
      }
    } catch { /* a game with no grids still lists */ }
    return { id: g.id, name: g.name, release_date: g.release_date || null, verified: !!g.verified, grids };
  }));
}

/** Validate an image URL against the CDN allowlist. Returns a URL or null. */
export function allowedImageUrl(raw) {
  let u;
  try { u = new URL(raw); } catch { return null; }
  if (u.protocol !== "https:" || !IMAGE_HOSTS.has(u.hostname)) return null;
  return u;
}

/** Fetch one grid image. Returns { buffer: Uint8Array, contentType }. */
export async function fetchGridImage(u) {
  const res = await fetch(u.href);
  if (!res.ok) throw new Error(`image fetch failed (${res.status})`);
  const buffer = new Uint8Array(await res.arrayBuffer());
  if (buffer.byteLength > MAX_IMAGE_BYTES) throw new Error("image too large to proxy");
  return { buffer, contentType: res.headers.get("content-type") || "image/png" };
}
