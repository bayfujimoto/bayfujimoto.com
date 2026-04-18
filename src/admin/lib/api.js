export async function loadArchive() {
  return fetch("/data/archive.json").then(r => r.json());
}

export async function saveRecord(payload) {
  const res = await fetch("/api/save-record", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
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
