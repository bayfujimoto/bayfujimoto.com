import { navigate, replace } from "./router.js";
import { subscribe, getState } from "./state.js";

let archive = null;
const app = document.getElementById("app");

// Stack of active layer sheets, each: { veil, sheet, cleanup }
const layerStack = [];

export async function initPanels() {
  const res = await fetch("/data/archive.json");
  archive = await res.json();

  renderDesk();

  subscribe(onStateChange);

  // Restore deep-linked layers on first load without re-pushing history
  const initial = getState();
  if (initial.layer !== "desk") restoreFromState(initial);
}

// ── State → layer stack ───────────────────────────────────────────────────────

function onStateChange(state) {
  const depth = stackDepth(state);
  const current = layerStack.length;

  if (depth < current) {
    // Navigated backward — pop sheets down to target depth
    while (layerStack.length > depth) popSheet();
  } else if (depth > current) {
    // Navigated forward — push the new sheet
    pushLayerForState(state);
  } else if (depth > 0) {
    // Same depth but different content (e.g. switched subcollection tab)
    const top = layerStack[layerStack.length - 1];
    top.update(state);
  }
}

// Depth: desk=0, series=1, browse=2, item=3
function stackDepth(state) {
  switch (state.layer) {
    case "desk":   return 0;
    case "series": return 1;
    case "browse": return 2;
    case "item":   return 3;
    default:       return 0;
  }
}

// On first load with a deep URL, silently push sheets without history entries
function restoreFromState(state) {
  if (state.layer === "series" || state.layer === "browse" || state.layer === "item") {
    pushLayerForState({ layer: "series", series: state.series, subcollection: null, item: null }, true);
  }
  if (state.layer === "browse" || state.layer === "item") {
    pushLayerForState({ layer: "browse", series: state.series, subcollection: state.subcollection, item: null }, true);
  }
  if (state.layer === "item") {
    pushLayerForState(state, true);
  }
}

function pushLayerForState(state, silent = false) {
  switch (state.layer) {
    case "series": pushSheet(makeSeriesSheet(state.series)); break;
    case "browse": pushSheet(makeBrowseSheet(state.series, state.subcollection, state.item)); break;
    case "item":   pushSheet(makeItemSheet(state.series, state.subcollection, state.item)); break;
  }
}

// ── Sheet stack primitives ────────────────────────────────────────────────────

function pushSheet({ veil, sheet, cleanup, update }) {
  const depth = layerStack.length + 1; // 1-based

  veil.style.setProperty("--depth", depth);
  sheet.style.setProperty("--depth", depth);

  document.body.appendChild(veil);
  document.body.appendChild(sheet);

  layerStack.push({ veil, sheet, cleanup: cleanup || (() => {}), update: update || (() => {}) });

  // Animate in
  requestAnimationFrame(() => {
    veil.classList.add("layer-veil--visible");
    sheet.classList.add("layer-sheet--visible");
  });
}

function popSheet() {
  const top = layerStack.pop();
  if (!top) return;

  top.veil.classList.remove("layer-veil--visible");
  top.sheet.classList.remove("layer-sheet--visible");
  top.cleanup();

  const remove = () => { top.veil.remove(); top.sheet.remove(); };
  top.sheet.addEventListener("transitionend", remove, { once: true });
  // Fallback if transition doesn't fire
  setTimeout(remove, 400);
}

function popAll() {
  while (layerStack.length) popSheet();
}

// ── Desk (permanent, never replaced) ─────────────────────────────────────────

function renderDesk() {
  const entries = Object.entries(archive.series).sort((a, b) => a[1].order - b[1].order);

  app.innerHTML = `
    <div class="desk">
      <div class="desk-objects">
        ${entries.map(([key, s]) => `
          <button class="desk-object" data-series="${key}">
            <span class="desk-object__label">${s.label}</span>
            <span class="desk-object__container">${s.container}</span>
          </button>
        `).join("")}
      </div>
    </div>
  `;

  app.querySelectorAll(".desk-object").forEach(btn => {
    btn.addEventListener("click", () => {
      navigate({ layer: "series", series: btn.dataset.series, subcollection: null, item: null });
    });
  });
}

// ── Series sheet ──────────────────────────────────────────────────────────────

function makeSeriesSheet(seriesKey) {
  const s = archive.series[seriesKey];
  const subs = Object.entries(s.subcollections);

  const veil = makeVeil(() => {
    navigate({ layer: "desk", series: null, subcollection: null, item: null });
  });

  const sheet = makeSheet();
  sheet.innerHTML = `
    <div class="layer-sheet__inner">
      <button class="sheet-close" type="button" aria-label="Close">✕</button>
      <h1 class="sheet-title">${s.label}</h1>
      <p class="sheet-subtitle">${s.container}</p>
      <nav class="series-tabs" aria-label="Subcollections">
        ${subs.map(([key, sub]) => `
          <button class="series-tab" data-series="${seriesKey}" data-sub="${key}">
            ${sub.label}
            <span class="series-tab__count">${sub.items.length}</span>
          </button>
        `).join("")}
      </nav>
    </div>
  `;

  sheet.querySelector(".sheet-close").addEventListener("click", () => {
    navigate({ layer: "desk", series: null, subcollection: null, item: null });
  });

  sheet.querySelectorAll(".series-tab").forEach(btn => {
    btn.addEventListener("click", () => {
      navigate({ layer: "browse", series: btn.dataset.series, subcollection: btn.dataset.sub, item: null });
    });
  });

  return { veil, sheet };
}

// ── Browse sheet ──────────────────────────────────────────────────────────────

function makeBrowseSheet(seriesKey, subKey, openItemId) {
  const s = archive.series[seriesKey];
  const sub = s.subcollections[subKey];
  const subs = Object.entries(s.subcollections);
  const byYear = groupByYear(sub.items);

  const veil = makeVeil(() => {
    navigate({ layer: "series", series: seriesKey, subcollection: null, item: null });
  });

  const sheet = makeSheet();

  function renderContent(activeSubKey) {
    const activeSub = s.subcollections[activeSubKey];
    const years = groupByYear(activeSub.items);
    sheet.innerHTML = `
      <div class="layer-sheet__inner">
        <button class="sheet-close" type="button" aria-label="Close">✕</button>
        <nav class="series-tabs" aria-label="Subcollections">
          ${subs.map(([key, sc]) => `
            <button class="series-tab ${key === activeSubKey ? "series-tab--active" : ""}"
              data-series="${seriesKey}" data-sub="${key}">
              ${sc.label}
              <span class="series-tab__count">${sc.items.length}</span>
            </button>
          `).join("")}
        </nav>
        <div class="browse-header">
          <h2 class="sheet-title">${activeSub.label}</h2>
          <p class="browse-count">${activeSub.items.length} item${activeSub.items.length !== 1 ? "s" : ""}</p>
        </div>
        <ul class="browse-list">
          ${years.map(({ year, items }) => `
            <li>
              <p class="browse-year-divider">${year}</p>
              <ul class="browse-list">
                ${items.map(item => browseItemHTML(item)).join("")}
              </ul>
            </li>
          `).join("")}
        </ul>
      </div>
    `;

    sheet.querySelector(".sheet-close").addEventListener("click", () => {
      navigate({ layer: "series", series: seriesKey, subcollection: null, item: null });
    });

    sheet.querySelectorAll(".series-tab").forEach(btn => {
      btn.addEventListener("click", () => {
        navigate({ layer: "browse", series: btn.dataset.series, subcollection: btn.dataset.sub, item: null });
      });
    });

    sheet.querySelectorAll(".browse-item__trigger").forEach(btn => {
      btn.addEventListener("click", () => {
        navigate({ layer: "item", series: seriesKey, subcollection: activeSubKey, item: btn.dataset.itemId });
      });
    });
  }

  renderContent(subKey);

  function update(state) {
    if (state.subcollection && state.subcollection !== subKey) {
      subKey = state.subcollection;
      renderContent(subKey);
    }
  }

  return { veil, sheet, update };
}

// ── Item sheet ────────────────────────────────────────────────────────────────

function makeItemSheet(seriesKey, subKey, itemId) {
  const s = archive.series[seriesKey];
  const sub = s.subcollections[subKey];
  const allItems = sub.items;
  let currentIdx = allItems.findIndex(i => i.id === itemId);
  if (currentIdx === -1) currentIdx = 0;

  const veil = makeVeil(() => {
    navigate({ layer: "browse", series: seriesKey, subcollection: subKey, item: null });
  });

  const sheet = makeSheet("layer-sheet--item");

  function renderContent(idx) {
    currentIdx = idx;
    const item = allItems[idx];
    const hasPrev = idx > 0;
    const hasNext = idx < allItems.length - 1;

    sheet.innerHTML = `
      <div class="layer-sheet__inner layer-sheet__inner--item">
        <button class="sheet-close" type="button" aria-label="Close">✕</button>
        <div class="inspection-modal__content">
          <div class="inspection-modal__image-col">
            ${imageHTML(item)}
          </div>
          <div class="inspection-modal__meta-col">
            <h2 class="modal-title">${item.title}</h2>
            <dl class="modal-fields">
              ${field("date",   item.display_date)}
              ${field("type",   item.item_type)}
              ${field("place",  item.place)}
              ${field("event",  item.event)}
              ${field("source", item.source)}
            </dl>
            ${item.context_note ? `<div class="modal-section"><h3 class="modal-section__label">note</h3><p>${item.context_note}</p></div>` : ""}
            ${relatedHTML(item, allItems)}
            ${item.tags?.length ? `<div class="modal-section"><h3 class="modal-section__label">tags</h3><p>${item.tags.join(" · ")}</p></div>` : ""}
            <div class="modal-record">${item.id}</div>
          </div>
        </div>
        <div class="inspection-modal__nav">
          <button class="inspection-modal__prev" type="button" ${!hasPrev ? "disabled" : ""}>← prev</button>
          <button class="inspection-modal__next" type="button" ${!hasNext ? "disabled" : ""}>next →</button>
        </div>
      </div>
    `;

    sheet.querySelector(".sheet-close").addEventListener("click", () => {
      navigate({ layer: "browse", series: seriesKey, subcollection: subKey, item: null });
    });
    sheet.querySelector(".inspection-modal__prev")?.addEventListener("click", () => {
      if (currentIdx > 0) navItem(currentIdx - 1);
    });
    sheet.querySelector(".inspection-modal__next")?.addEventListener("click", () => {
      if (currentIdx < allItems.length - 1) navItem(currentIdx + 1);
    });

    wireFlip(sheet);
    wireRelated(sheet, allItems, currentIdx);

    sheet.querySelector(".sheet-close").focus();
  }

  function navItem(idx) {
    renderContent(idx);
    replace({ layer: "item", series: seriesKey, subcollection: subKey, item: allItems[idx].id });
  }

  const onKey = (e) => {
    if (layerStack[layerStack.length - 1]?.sheet !== sheet) return;
    if (e.key === "Escape") navigate({ layer: "browse", series: seriesKey, subcollection: subKey, item: null });
    if (e.key === "ArrowLeft"  && currentIdx > 0) navItem(currentIdx - 1);
    if (e.key === "ArrowRight" && currentIdx < allItems.length - 1) navItem(currentIdx + 1);
  };
  document.addEventListener("keydown", onKey);

  const cleanup = () => document.removeEventListener("keydown", onKey);

  renderContent(currentIdx);

  return { veil, sheet, cleanup };
}

// ── DOM factories ─────────────────────────────────────────────────────────────

function makeVeil(onClickThrough) {
  const el = document.createElement("div");
  el.className = "layer-veil";
  el.setAttribute("aria-hidden", "true");
  el.addEventListener("click", onClickThrough);
  return el;
}

function makeSheet(extraClass = "") {
  const el = document.createElement("div");
  el.className = `layer-sheet ${extraClass}`.trim();
  el.setAttribute("role", "dialog");
  el.setAttribute("aria-modal", "true");
  return el;
}

// ── Shared render helpers ─────────────────────────────────────────────────────

function browseItemHTML(item) {
  const thumb = item.assets?.front
    ? `<img src="${item.assets.front}" alt="" loading="lazy">`
    : "";
  return `
    <li class="browse-item">
      <button class="browse-item__trigger" type="button" data-item-id="${item.id}">
        <div class="browse-item__thumb">${thumb}</div>
        <div class="browse-item__info">
          <span class="browse-item__type">${item.item_type || ""}</span>
          <span class="browse-item__title">${item.title}</span>
          ${item.display_date ? `<span class="browse-item__date">${item.display_date}</span>` : ""}
          ${item.place ? `<span class="browse-item__place">${item.place}</span>` : ""}
        </div>
      </button>
    </li>
  `;
}

function imageHTML(item) {
  if (!item.assets?.front) return `<div class="browse-item__thumb"></div>`;
  let html = `<img class="modal-image modal-image--front" src="${item.assets.front}" alt="${item.title}" id="modal-img-front">`;
  if (item.assets.back) {
    html += `<img class="modal-image modal-image--back" src="${item.assets.back}" alt="${item.title} (back)" id="modal-img-back" hidden>`;
    html += `<button class="modal-flip-btn" id="modal-flip" type="button">↔ flip</button>`;
  }
  html += `<button class="modal-zoom-btn" type="button">zoom</button>`;
  return html;
}

function wireFlip(container) {
  const flipBtn = container.querySelector("#modal-flip");
  if (!flipBtn) return;
  let showingFront = true;
  flipBtn.addEventListener("click", () => {
    showingFront = !showingFront;
    container.querySelector("#modal-img-front").hidden = !showingFront;
    container.querySelector("#modal-img-back").hidden = showingFront;
    flipBtn.textContent = showingFront ? "↔ flip" : "↔ flip (back)";
  });
}

function relatedHTML(item, allItems) {
  if (!item.related_ids?.length) return "";
  const links = item.related_ids.map(id => {
    const rel = allItems.find(i => i.id === id);
    return `<li><button class="modal-related__link" type="button" data-related-id="${id}">${rel ? rel.title : id}</button></li>`;
  }).join("");
  return `<div class="modal-section"><h3 class="modal-section__label">related</h3><ul class="modal-related">${links}</ul></div>`;
}

function wireRelated(container, allItems, currentIdx) {
  container.querySelectorAll(".modal-related__link").forEach(btn => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.relatedId;
      const i = allItems.findIndex(it => it.id === id);
      if (i !== -1) replace({ item: allItems[i].id });
    });
  });
}

function field(label, value) {
  if (!value) return "";
  return `<div class="modal-field"><dt class="modal-field__label">${label}</dt><dd class="modal-field__value">${value}</dd></div>`;
}

function groupByYear(items) {
  const map = new Map();
  for (const item of items) {
    const year = item.sort_date ? item.sort_date.slice(0, 4) : "undated";
    if (!map.has(year)) map.set(year, []);
    map.get(year).push(item);
  }
  return Array.from(map.entries())
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([year, items]) => ({ year, items }));
}
