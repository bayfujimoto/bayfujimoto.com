import "./styles.css";
import { initRouter } from "./router.js";
import { setState, getState, subscribe } from "./state.js";
import { loadArchive, commitAll } from "./lib/api.js";
import { toCountersYAML } from "./lib/serializer.js";
import { renderDashboard } from "./views/dashboard.js";
import { renderNewItem }   from "./views/new-item.js";
import { renderBrowse }    from "./views/browse.js";
import { renderEditItem }  from "./views/edit-item.js";

function flattenArchive(archive) {
  const items = [];
  for (const [seriesKey, series] of Object.entries(archive.series || {})) {
    for (const item of series.items || []) {
      items.push({ ...item, _series: seriesKey, _sub: null });
    }
    for (const [subKey, sub] of Object.entries(series.subcollections || {})) {
      for (const item of sub.items || []) {
        items.push({ ...item, _series: seriesKey, _sub: subKey });
      }
    }
  }
  return items;
}

function getContent() {
  return document.getElementById("admin-content");
}

function updateNavActive() {
  const hash = location.hash.slice(1) || "/";
  for (const a of document.querySelectorAll(".admin-nav a")) {
    const href = a.getAttribute("href").slice(1);
    a.classList.toggle("active", hash === href || (href !== "/" && hash.startsWith(href)));
  }
}

function updateStatusBar(statusEl) {
  const { status, statusMessage, pendingChanges } = getState();
  const n = pendingChanges.length;

  if (n > 0 && !status) {
    statusEl.className = "admin-statusbar pending";
    statusEl.innerHTML = `
      <span>${n} unsaved change${n > 1 ? "s" : ""}</span>
      <button id="commit-all-btn" class="admin-commit-btn">Commit All</button>
    `;
    document.getElementById("commit-all-btn")?.addEventListener("click", handleCommitAll);
  } else {
    statusEl.className = "admin-statusbar" + (status ? ` ${status}` : "");
    statusEl.textContent = statusMessage || "";
  }
}

async function handleCommitAll() {
  const { pendingChanges, archive } = getState();
  if (!pendingChanges.length) return;

  const counters = archive._counters || {};
  const newIds  = pendingChanges.filter(p => p.action === "add").map(p => p.id);
  const editIds = pendingChanges.filter(p => p.action === "edit").map(p => p.id);
  const parts = [];
  if (newIds.length)  parts.push(`add ${newIds.length}: ${newIds.join(", ")}`);
  if (editIds.length) parts.push(`edit ${editIds.length}: ${editIds.join(", ")}`);
  const message = parts.join("; ");

  setState({ status: "saving", statusMessage: "Committing to GitHub…" });

  try {
    const result = await commitAll({
      files: pendingChanges.map(p => ({ filePath: p.filePath, content: p.content })),
      countersPath: "src/content/_id-counters.yaml",
      countersContent: toCountersYAML(counters),
      message,
    });

    if (result.ok) {
      const count = pendingChanges.length;
      setState({ pendingChanges: [], status: "saved", statusMessage: `Committed ${count} change${count > 1 ? "s" : ""}` });
      setTimeout(() => setState({ status: null, statusMessage: "" }), 3000);
    } else {
      setState({ status: "error", statusMessage: `Commit failed: ${result.error}` });
    }
  } catch (e) {
    setState({ status: "error", statusMessage: `Network error: ${e.message}` });
  }
}

async function init() {
  const root = document.getElementById("admin-app");
  root.innerHTML = `
    <aside class="admin-sidebar">
      <div class="admin-logo">archive admin</div>
      <nav class="admin-nav">
        <a href="#/">Dashboard</a>
        <a href="#/new">New Item</a>
        <a href="#/browse">Browse Items</a>
      </nav>
    </aside>
    <main class="admin-main" id="admin-content">
      <div class="admin-empty">Loading archive…</div>
    </main>
    <div class="admin-statusbar" id="admin-status"></div>
  `;

  const statusEl = document.getElementById("admin-status");
  subscribe(() => updateStatusBar(statusEl));
  window.addEventListener("hashchange", updateNavActive);
  updateNavActive();

  let archive;
  try {
    archive = await loadArchive();
  } catch (e) {
    getContent().innerHTML = `<div class="admin-empty">Failed to load archive.json — run <code>npm run build-data</code> first.</div>`;
    return;
  }

  const allItems = flattenArchive(archive);
  setState({ archive, allItems });

  initRouter({
    "/new":    () => {
      const pre = window.__adminPreselect;
      window.__adminPreselect = null;
      renderNewItem(getContent(), archive, pre || null);
    },
    "/browse": () => renderBrowse(getContent(), allItems),
    "/edit/":  (hash) => renderEditItem(getContent(), hash.replace("/edit/", ""), allItems, archive),
    "/":       () => renderDashboard(getContent(), archive, allItems),
  });
}

init();
