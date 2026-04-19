export async function loadArchive() {
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
