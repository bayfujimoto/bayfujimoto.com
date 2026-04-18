export function renderDashboard(container, archive, allItems) {
  container.innerHTML = "";

  const title = document.createElement("h1");
  title.className = "admin-page-title";
  title.textContent = "Dashboard";
  container.appendChild(title);

  // ── Stats ──────────────────────────────────────────────────

  const statsLabel = document.createElement("div");
  statsLabel.className = "admin-section-title";
  statsLabel.textContent = "Items by series";
  container.appendChild(statsLabel);

  const statsGrid = document.createElement("div");
  statsGrid.className = "admin-stats";

  const seriesOrder = ["accumulation", "consumption", "creation", "labor", "identity"];
  for (const key of seriesOrder) {
    const series = archive.series[key];
    const seriesItems = allItems.filter(i => i._series === key);
    const stat = document.createElement("div");
    stat.className = "admin-stat";
    stat.innerHTML = `
      <div class="admin-stat-label">${series?.label ?? key}</div>
      <div class="admin-stat-value">${seriesItems.length}</div>
    `;
    statsGrid.appendChild(stat);
  }

  // Total
  const totalStat = document.createElement("div");
  totalStat.className = "admin-stat";
  totalStat.innerHTML = `
    <div class="admin-stat-label">Total</div>
    <div class="admin-stat-value">${allItems.length}</div>
  `;
  statsGrid.appendChild(totalStat);

  container.appendChild(statsGrid);

  // ── Quick entry ────────────────────────────────────────────

  const quickLabel = document.createElement("div");
  quickLabel.className = "admin-section-title";
  quickLabel.textContent = "Quick entry";
  container.appendChild(quickLabel);

  const quickGrid = document.createElement("div");
  quickGrid.className = "admin-quick-grid";

  const quickTypes = [
    { series: "accumulation", type: "ticket",   label: "Ticket" },
    { series: "accumulation", type: "brochure",  label: "Brochure" },
    { series: "consumption",  type: "film",      label: "Film" },
    { series: "consumption",  type: "book",      label: "Book" },
    { series: "consumption",  type: "bag",       label: "Coffee" },
    { series: "creation",     type: "sketch",    label: "Sketch" },
    { series: "creation",     type: "photo",     label: "Photo" },
    { series: "labor",        type: "project",   label: "Project" },
  ];

  for (const { series, type, label } of quickTypes) {
    const btn = document.createElement("a");
    btn.className = "admin-quick-btn";
    btn.href = "#/new";
    btn.innerHTML = `<span class="type-label">${series}</span>+ ${label}`;
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      // Store preselect and navigate
      window.__adminPreselect = { series, itemType: type };
      location.hash = "/new";
    });
    quickGrid.appendChild(btn);
  }

  container.appendChild(quickGrid);

  // ── Needs attention ────────────────────────────────────────

  const needsItems = allItems.filter(i => {
    if (i.status !== "draft" && i.status !== "partial") return false;
    const hasAsset = i.assets && Object.values(i.assets).some(v => v);
    return !hasAsset;
  }).slice(0, 10);

  const attentionLabel = document.createElement("div");
  attentionLabel.className = "admin-section-title";
  attentionLabel.textContent = "Needs attention";
  container.appendChild(attentionLabel);

  if (needsItems.length === 0) {
    const empty = document.createElement("div");
    empty.className = "admin-empty";
    empty.textContent = "No draft or partial items without assets.";
    container.appendChild(empty);
  } else {
    const list = document.createElement("ul");
    list.className = "admin-attention-list";
    for (const item of needsItems) {
      const li = document.createElement("li");
      li.innerHTML = `
        <a href="#/edit/${item.id}">${item.id}</a>
        <span>${item.title || "(untitled)"}</span>
        <span class="badge badge-${item.status || "draft"}">${item.status || "draft"}</span>
      `;
      list.appendChild(li);
    }
    container.appendChild(list);
  }

  // ── Recent items ───────────────────────────────────────────

  const recentLabel = document.createElement("div");
  recentLabel.className = "admin-section-title";
  recentLabel.textContent = "Recent items";
  container.appendChild(recentLabel);

  const sorted = [...allItems].sort((a, b) => {
    const da = a.sort_date ? new Date(a.sort_date) : new Date(0);
    const db = b.sort_date ? new Date(b.sort_date) : new Date(0);
    return db - da;
  }).slice(0, 15);

  if (sorted.length === 0) {
    const empty = document.createElement("div");
    empty.className = "admin-empty";
    empty.textContent = "No items yet. Add your first record above.";
    container.appendChild(empty);
    return;
  }

  const table = document.createElement("table");
  table.className = "admin-table";
  table.innerHTML = `
    <thead>
      <tr>
        <th>ID</th>
        <th>Title</th>
        <th>Type</th>
        <th>Series</th>
        <th>Status</th>
        <th>Date</th>
      </tr>
    </thead>
    <tbody></tbody>
  `;
  const tbody = table.querySelector("tbody");

  for (const item of sorted) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><a href="#/edit/${item.id}">${item.id}</a></td>
      <td>${item.title || "(untitled)"}</td>
      <td>${item.item_type || ""}</td>
      <td>${item._series || ""}${item._sub ? ` / ${item._sub}` : ""}</td>
      <td><span class="badge badge-${item.status || "draft"}">${item.status || "draft"}</span></td>
      <td>${item.sort_date || item.display_date || ""}</td>
    `;
    tbody.appendChild(tr);
  }

  container.appendChild(table);
}
