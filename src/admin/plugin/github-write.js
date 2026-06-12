import { readFileSync, writeFileSync, mkdirSync, existsSync, unlinkSync } from "fs";
import { resolve, dirname } from "path";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

function loadEnvLocal() {
  const envPath = resolve(process.cwd(), ".env.local");
  if (!existsSync(envPath)) return;
  const lines = readFileSync(envPath, "utf8").split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim();
    if (!(key in process.env)) process.env[key] = val;
  }
}

function readBody(req) {
  return new Promise((ok, fail) => {
    let data = "";
    req.on("data", chunk => { data += chunk; });
    req.on("end", () => {
      try { ok(JSON.parse(data)); } catch (e) { fail(e); }
    });
    req.on("error", fail);
  });
}

async function githubGet(path, token, owner, repo, branch) {
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${path}?ref=${branch}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GitHub API error ${res.status}`);
  return res.json();
}

async function githubCommitAll(files, token, owner, repo, branch, message) {
  const base = `https://api.github.com/repos/${owner}/${repo}`;
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "Content-Type": "application/json",
    "X-GitHub-Api-Version": "2022-11-28",
  };

  // Get current branch ref to find base tree SHA
  const refRes = await fetch(`${base}/git/refs/heads/${branch}`, { headers });
  if (!refRes.ok) throw new Error(`Failed to get branch ref: ${refRes.status}`);
  const ref = await refRes.json();
  const baseSha = ref.object.sha;

  // Get base commit to find tree SHA
  const commitRes = await fetch(`${base}/git/commits/${baseSha}`, { headers });
  if (!commitRes.ok) throw new Error(`Failed to get base commit: ${commitRes.status}`);
  const baseCommit = await commitRes.json();
  const baseTreeSha = baseCommit.tree.sha;

  // Build tree entries — each file as a blob, or a deletion (sha: null) for
  // renamed records whose old path must be removed in the same commit.
  const treeItems = await Promise.all(files.map(async ({ filePath, content, delete: del }) => {
    if (del) {
      return { path: filePath, mode: "100644", type: "blob", sha: null };
    }
    const blobRes = await fetch(`${base}/git/blobs`, {
      method: "POST",
      headers,
      body: JSON.stringify({ content, encoding: "utf-8" }),
    });
    if (!blobRes.ok) throw new Error(`Failed to create blob for ${filePath}: ${blobRes.status}`);
    const blob = await blobRes.json();
    return { path: filePath, mode: "100644", type: "blob", sha: blob.sha };
  }));

  // Create tree
  const treeRes = await fetch(`${base}/git/trees`, {
    method: "POST",
    headers,
    body: JSON.stringify({ base_tree: baseTreeSha, tree: treeItems }),
  });
  if (!treeRes.ok) throw new Error(`Failed to create tree: ${treeRes.status}`);
  const tree = await treeRes.json();

  // Create commit
  const newCommitRes = await fetch(`${base}/git/commits`, {
    method: "POST",
    headers,
    body: JSON.stringify({ message, tree: tree.sha, parents: [baseSha] }),
  });
  if (!newCommitRes.ok) throw new Error(`Failed to create commit: ${newCommitRes.status}`);
  const newCommit = await newCommitRes.json();

  // Advance branch ref
  const updateRefRes = await fetch(`${base}/git/refs/heads/${branch}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify({ sha: newCommit.sha }),
  });
  if (!updateRefRes.ok) throw new Error(`Failed to update ref: ${updateRefRes.status}`);

  return newCommit.sha;
}

export function githubWritePlugin() {
  loadEnvLocal();
  return {
    name: "github-write",
    configureServer(server) {

      // R2 presigned URL — mirrors the Netlify function for local dev
      server.middlewares.use("/api/r2-upload-url", async (req, res) => {
        res.setHeader("Content-Type", "application/json");

        if (req.method !== "POST") {
          res.writeHead(405);
          res.end(JSON.stringify({ ok: false, error: "Method not allowed" }));
          return;
        }

        const ACCOUNT_ID    = process.env.CLOUDFLARE_ACCOUNT_ID;
        const BUCKET        = process.env.R2_BUCKET_NAME;
        const ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
        const SECRET_KEY    = process.env.R2_SECRET_ACCESS_KEY;

        if (!ACCOUNT_ID || !BUCKET || !ACCESS_KEY_ID || !SECRET_KEY) {
          res.writeHead(500);
          res.end(JSON.stringify({ ok: false, error: "R2 env vars not configured — add CLOUDFLARE_ACCOUNT_ID, R2_BUCKET_NAME, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY to .env.local" }));
          return;
        }

        let payload;
        try {
          payload = await readBody(req);
        } catch (e) {
          res.writeHead(400);
          res.end(JSON.stringify({ ok: false, error: "Invalid JSON body" }));
          return;
        }

        const { filename, contentType, prefix } = payload;

        if (!filename || !contentType || !prefix) {
          res.writeHead(400);
          res.end(JSON.stringify({ ok: false, error: "Missing filename, contentType, or prefix" }));
          return;
        }

        if (!["originals", "thumbnails"].includes(prefix)) {
          res.writeHead(400);
          res.end(JSON.stringify({ ok: false, error: "prefix must be originals or thumbnails" }));
          return;
        }

        try {
          const key = `${prefix}/${filename}`;
          const client = new S3Client({
            region: "auto",
            endpoint: `https://${ACCOUNT_ID}.r2.cloudflarestorage.com`,
            credentials: { accessKeyId: ACCESS_KEY_ID, secretAccessKey: SECRET_KEY },
          });
          const command = new PutObjectCommand({ Bucket: BUCKET, Key: key, ContentType: contentType });
          const uploadUrl = await getSignedUrl(client, command, { expiresIn: 120 });
          res.writeHead(200);
          res.end(JSON.stringify({ ok: true, uploadUrl, key }));
        } catch (e) {
          res.writeHead(500);
          res.end(JSON.stringify({ ok: false, error: `R2 presign failed: ${e.message}` }));
        }
      });

      // Local write — always writes to disk immediately, no GitHub call
      server.middlewares.use("/api/save-record", async (req, res) => {
        res.setHeader("Content-Type", "application/json");

        if (req.method !== "POST") {
          res.writeHead(405);
          res.end(JSON.stringify({ ok: false, error: "Method not allowed" }));
          return;
        }

        let payload;
        try {
          payload = await readBody(req);
        } catch (e) {
          res.writeHead(400);
          res.end(JSON.stringify({ ok: false, error: "Invalid JSON body" }));
          return;
        }

        const { filePath, content, countersPath, countersContent, oldFilePath } = payload;

        if (!filePath || !content || !countersPath || !countersContent) {
          res.writeHead(400);
          res.end(JSON.stringify({ ok: false, error: "Missing required fields" }));
          return;
        }

        try {
          const absFile     = resolve(process.cwd(), filePath);
          const absCounters = resolve(process.cwd(), countersPath);
          mkdirSync(dirname(absFile), { recursive: true });
          writeFileSync(absFile, content, "utf8");
          writeFileSync(absCounters, countersContent, "utf8");
          // Renamed record — remove the file it used to live in.
          if (oldFilePath && oldFilePath !== filePath) {
            const absOld = resolve(process.cwd(), oldFilePath);
            if (existsSync(absOld)) unlinkSync(absOld);
          }
          res.writeHead(200);
          res.end(JSON.stringify({ ok: true, mode: "local", filePath }));
        } catch (e) {
          res.writeHead(500);
          res.end(JSON.stringify({ ok: false, error: e.message }));
        }
      });

      // Batch GitHub commit — commits all staged files in a single commit
      server.middlewares.use("/api/commit-all", async (req, res) => {
        res.setHeader("Content-Type", "application/json");

        if (req.method !== "POST") {
          res.writeHead(405);
          res.end(JSON.stringify({ ok: false, error: "Method not allowed" }));
          return;
        }

        const GITHUB_TOKEN  = process.env.GITHUB_TOKEN;
        const GITHUB_OWNER  = process.env.GITHUB_OWNER;
        const GITHUB_REPO   = process.env.GITHUB_REPO;
        const GITHUB_BRANCH = process.env.GITHUB_BRANCH || "main";

        if (!GITHUB_TOKEN) {
          res.writeHead(200);
          res.end(JSON.stringify({ ok: false, error: "No GitHub token configured" }));
          return;
        }

        if (!GITHUB_OWNER || !GITHUB_REPO) {
          res.writeHead(500);
          res.end(JSON.stringify({ ok: false, error: "GITHUB_OWNER and GITHUB_REPO must be set" }));
          return;
        }

        let payload;
        try {
          payload = await readBody(req);
        } catch (e) {
          res.writeHead(400);
          res.end(JSON.stringify({ ok: false, error: "Invalid JSON body" }));
          return;
        }

        const { files, countersPath, countersContent, message } = payload;

        if (!files?.length || !countersPath || !countersContent || !message) {
          res.writeHead(400);
          res.end(JSON.stringify({ ok: false, error: "Missing required fields" }));
          return;
        }

        try {
          const allFiles = [...files, { filePath: countersPath, content: countersContent }];
          const sha = await githubCommitAll(allFiles, GITHUB_TOKEN, GITHUB_OWNER, GITHUB_REPO, GITHUB_BRANCH, message);
          res.writeHead(200);
          res.end(JSON.stringify({ ok: true, mode: "github", sha }));
        } catch (e) {
          res.writeHead(500);
          res.end(JSON.stringify({ ok: false, error: e.message }));
        }
      });
    },
  };
}
