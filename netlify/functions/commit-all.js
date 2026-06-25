import { readCookie, verifySession } from "../lib/session.js";

export async function handler(event) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: JSON.stringify({ ok: false, error: "Method not allowed" }) };
  }

  // Gated by the same passkey session cookie as /admin. Without a valid
  // session this returns 401 before any GitHub work — the Edge gate protects
  // the admin document, this protects the privileged write action.
  const session = await verifySession(
    readCookie(event.headers?.cookie || event.headers?.Cookie)
  );
  if (!session) {
    return { statusCode: 401, body: JSON.stringify({ ok: false, error: "unauthorized" }) };
  }

  const GITHUB_TOKEN  = process.env.GITHUB_TOKEN;
  const GITHUB_OWNER  = process.env.GITHUB_OWNER;
  const GITHUB_REPO   = process.env.GITHUB_REPO;
  const GITHUB_BRANCH = process.env.GITHUB_BRANCH || "main";

  if (!GITHUB_TOKEN) {
    return { statusCode: 200, body: JSON.stringify({ ok: false, error: "No GitHub token configured" }) };
  }
  if (!GITHUB_OWNER || !GITHUB_REPO) {
    return { statusCode: 500, body: JSON.stringify({ ok: false, error: "GITHUB_OWNER and GITHUB_REPO must be set" }) };
  }

  let payload;
  try {
    payload = JSON.parse(event.body);
  } catch {
    return { statusCode: 400, body: JSON.stringify({ ok: false, error: "Invalid JSON body" }) };
  }

  const { files, countersPath, countersContent, message } = payload;

  if (!files?.length || !countersPath || !countersContent || !message) {
    return { statusCode: 400, body: JSON.stringify({ ok: false, error: "Missing required fields" }) };
  }

  try {
    const allFiles = [...files, { filePath: countersPath, content: countersContent }];
    const sha = await githubCommitAll(allFiles, GITHUB_TOKEN, GITHUB_OWNER, GITHUB_REPO, GITHUB_BRANCH, message);
    return { statusCode: 200, body: JSON.stringify({ ok: true, mode: "github", sha }) };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ ok: false, error: e.message }) };
  }
}

async function githubCommitAll(files, token, owner, repo, branch, message) {
  const base = `https://api.github.com/repos/${owner}/${repo}`;
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "Content-Type": "application/json",
    "X-GitHub-Api-Version": "2022-11-28",
  };

  const refRes = await fetch(`${base}/git/refs/heads/${branch}`, { headers });
  if (!refRes.ok) throw new Error(`Failed to get branch ref: ${refRes.status}`);
  const baseSha = (await refRes.json()).object.sha;

  const commitRes = await fetch(`${base}/git/commits/${baseSha}`, { headers });
  if (!commitRes.ok) throw new Error(`Failed to get base commit: ${commitRes.status}`);
  const baseTreeSha = (await commitRes.json()).tree.sha;

  // Each file is either a blob write or a deletion (sha: null). Deletions cover
  // both explicit record removals and the old path of a renamed record. The
  // delete path is resolved against the live tree by id so a stale/recomputed
  // slug can't point at a non-existent path and 422 the whole tree.
  const treeItems = (await Promise.all(files.map(async ({ filePath, content, delete: del, id, viaExclude }) => {
    if (del) {
      const realPath = await resolveDeletePath(base, headers, branch, filePath, id);
      if (realPath) return { path: realPath, mode: "100644", type: "blob", sha: null };
      // No committed file. If this delete is paired with an exclusion marker
      // (build-time-ingested record), that's expected — skip it. Otherwise fail
      // loudly so a genuinely wrong path isn't silently ignored.
      if (viaExclude) return null;
      throw new Error(`Cannot delete ${id || filePath}: no matching file found in the repo (looked for ${filePath}${id ? ` and ${id}-* in its folder` : ""})`);
    }
    const blobRes = await fetch(`${base}/git/blobs`, {
      method: "POST", headers,
      body: JSON.stringify({ content, encoding: "utf-8" }),
    });
    if (!blobRes.ok) throw new Error(`Failed to create blob for ${filePath}: ${blobRes.status}${await ghErr(blobRes)}`);
    return { path: filePath, mode: "100644", type: "blob", sha: (await blobRes.json()).sha };
  }))).filter(Boolean);

  const treeRes = await fetch(`${base}/git/trees`, {
    method: "POST", headers,
    body: JSON.stringify({ base_tree: baseTreeSha, tree: treeItems }),
  });
  if (!treeRes.ok) throw new Error(`Failed to create tree: ${treeRes.status}${await ghErr(treeRes)}`);
  const treeSha = (await treeRes.json()).sha;

  const newCommitRes = await fetch(`${base}/git/commits`, {
    method: "POST", headers,
    body: JSON.stringify({ message, tree: treeSha, parents: [baseSha] }),
  });
  if (!newCommitRes.ok) throw new Error(`Failed to create commit: ${newCommitRes.status}${await ghErr(newCommitRes)}`);
  const newCommit = await newCommitRes.json();

  const updateRefRes = await fetch(`${base}/git/refs/heads/${branch}`, {
    method: "PATCH", headers,
    body: JSON.stringify({ sha: newCommit.sha }),
  });
  if (!updateRefRes.ok) throw new Error(`Failed to update ref: ${updateRefRes.status}${await ghErr(updateRefRes)}`);

  return newCommit.sha;
}

// Extract GitHub's error message body for clearer diagnostics.
async function ghErr(res) {
  try {
    const j = await res.json();
    return j?.message ? ` — ${j.message}` : "";
  } catch {
    return "";
  }
}

// Find a deletion's real path. Prefer the exact computed path; if it isn't in
// the repo (a recomputed slug can drift from the ingested filename), fall back
// to the unique `${id}-*.md` file in the same directory. Returns null if none.
async function resolveDeletePath(base, headers, branch, filePath, id) {
  if (await ghPathExists(base, headers, branch, filePath)) return filePath;
  if (!id) return null;
  const dir = filePath.slice(0, filePath.lastIndexOf("/"));
  const listRes = await fetch(`${base}/contents/${dir}?ref=${branch}`, { headers });
  if (!listRes.ok) return null;
  const list = await listRes.json();
  return matchByIdPrefix(list, id);
}

async function ghPathExists(base, headers, branch, filePath) {
  const res = await fetch(`${base}/contents/${filePath}?ref=${branch}`, { headers });
  return res.ok;
}

// Pure: pick the path of the single `${id}-*.md` entry in a contents listing.
function matchByIdPrefix(list, id) {
  if (!Array.isArray(list)) return null;
  const hit = list.find(
    (e) => e && e.type === "file" && e.name.startsWith(`${id}-`) && e.name.endsWith(".md")
  );
  return hit ? hit.path : null;
}

export { matchByIdPrefix };
