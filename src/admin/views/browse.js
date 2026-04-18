let sortKey = "sort_date";
let sortDir = -1; // -1 = desc, 1 = asc

export function renderBrowse(container, allItems) {
  container.innerHTML = "";

  const title = document.createElement("h1");
  title.className = "admin-page-title";
  title.textContent = "Browse Items";
  container.appendChild(title);

  // ── Filter bar ────────────────────────────────────────────

  const filterBar = document.createElement("div");
  filterBar.className = "admin-filter-bar";

  const seriesSelect = document.createElement("select");
  seriesSelect.innerHTML = `
    <option value="">All series</option>
    <option value="accumulation">Accumulation</option>
    <option value="consumption">Consumption</option>
    <option value="creation">Creation</option>
    <option value="labor">Labor</option>
    <option value="identity">Identity</option>
  `;

  const statusSelect = document.createElement("select");
  statusSelect.innerHTML = `
    <option value="">All statuses</option>
    <option value="draft">Draft</option>
    <option value="partial">Partial</option>
    <option value="complete">Complete</option>
    <option value="published">Published</option>
  `;

  const searchInput = document.createElement("input");
  searchInput.type = "text";
  searchInput.placeholder = "Search title, ID, or slug…";

  filterBar.appendChild(seriesSelect);
  filterBar.appendChild(statusSelect);
  filterBar.appendChild(searchInput);
  container.appendChild(filterBar);

  // ── Table ─────────────────────────────────────────────────

  const tableWrap = document.createElement("div");
  container.appendChild(tableWrap);

  function renderTable() {
    const query   = searchInput.value.toLowerCase();
    const series  = seriesSelect.value;
    const status  = statusSelect.value;

    let filtered = allItems.filter(item => {
      if (series && item._series !== series) return false;
      if (status && item.status !== status) return false;
      if (query) {
        const hay = `${item.id} ${item.title} ${item.slug}`.toLowerCase();
        if (!hay.includes(query)) return false;
      }
      return true;
    });

    filtered.sort((a, b) => {
      let va = a[sortKey] ?? "";
      let vb = b[sortKey] ?? "";
      if (sortKey === "sort_date") {
        va = va ? new Date(va).getTime() : 0;
        vb = vb ? new Date(vb).getTime() : 0;
      }
      if (va < vb) return -sortDir;
      if (va > vb) return  sortDir;
      return 0;
    });

    tableWrap.innerHTML = "";

    if (filtered.length === 0) {
      const empty = document.createElement("div");
      empty.className = "admin-empty";
      empty.textContent = "No items match the current filters.";
      tableWrap.appendChild(empty);
      return;
    }

    const table = document.createElement("table");
    table.className = "admin-table";

    const cols = [
      { key: "id",        label: "ID"      },
      { key: "title",     label: "Title"   },
      { key: "item_type", label: "Type"    },
      { key: "_series",   label: "Series"  },
      { key: "status",    label: "Status"  },
      { key: "sort_date", label: "Date"    },
    ];

    const thead = document.createElement("thead");
    const headerRow = document.createElement("tr");
    for (const col of cols) {
      const th = document.createElement("th");
      th.textContent = col.label + (sortKey === col.key ? (sortDir === -1 ? " ↓" : " ↑") : "");
      th.addEventListener("click", () => {
        if (sortKey === col.key) sortDir *= -1;
        else { sortKey = col.key; sortDir = -1; }
        renderTable();
      });
      headerRow.appendChild(th);
    }
    // Edit column header
    headerRow.appendChild(document.createElement("th"));
    thead.appendChild(headerRow);
    table.appendChild(thead);

    const tbody = document.createElement("tbody");
    for (const item of filtered) {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${item.id || ""}</td>
        <td>${item.title || "(untitled)"}</td>
        <td>${item.item_type || ""}</td>
        <td>${item._series || ""}${item._sub ? ` / ${item._sub}` : ""}</td>
        <td><span class="badge badge-${item.status || "draft"}">${item.status || "draft"}</span></td>
        <td>${item.sort_date || item.display_date || ""}</td>
        <td><a href="#/edit/${item.id}">Edit</a></td>
      `;
      tbody.appendChild(tr);
    }
    table.appendChild(tbody);
    tableWrap.appendChild(table);
  }

  seriesSelect.addEventListener("change", renderTable);
  statusSelect.addEventListener("change", renderTable);
  searchInput.addEventListener("input", renderTable);

  renderTable();
}
