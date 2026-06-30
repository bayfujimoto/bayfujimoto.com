export async function loadArchive() {
  // The admin reads the full archive (all statuses) so the Explorer can show and
  // color non-published records. It comes from a passkey-gated function so draft
  // content is never served as a static file. If that's unavailable (e.g. an
  // expired session, or local dev without the function), fall back to the
  // published-only public archive so the admin still loads — just without drafts.
  try {
    const res = await fetch("/api/archive-admin");
    if (res.ok) return res.json();
  } catch { /* fall through to the public archive */ }
  return fetch("/data/archive.json").then(r => r.json());
}

export async function getR2UploadUrl(filename, contentType, prefix) {
  const res = await fetch("/api/r2-upload-url", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ filename, contentType, prefix }),
  });
  return res.json();
}

export async function commitAll(payload) {
  const res = await fetch("/api/commit-all", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return res.json();
}

// Clears the passkey session cookie. After this resolves the next /admin
// request fails the Edge gate and is redirected to /gate.
export async function logout() {
  const res = await fetch("/api/logout", { method: "POST" });
  return res.json();
}
