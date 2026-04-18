import { navigate, replace } from "./router.js";
import { subscribe, getState } from "./state.js";

let archive = null;
const app = document.getElementById("app");

// Labor and Accumulation use view-based URLs regardless of subcollection data structure
const FLAT_URL_SERIES = new Set(["labor", "accumulation"]);

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

// Depth: desk=0, guide=1, series=1, browse=2, item=3
function stackDepth(state) {
  switch (state.layer) {
    case "desk":   return 0;
    case "guide":  return 1;
    case "series": return 1;
    case "browse": return 2;
    case "item":   return 3;
    default:       return 0;
  }
}

// On first load with a deep URL, silently push sheets without history entries
function restoreFromState(state) {
  if (state.layer === "guide") {
    pushLayerForState({ layer: "guide" }, true);
    return;
  }
  // Flat-URL series (labor, accumulation) have no series-level sheet — skip straight to browse
  const skipSeriesSheet = FLAT_URL_SERIES.has(state.series) ||
    Object.keys(archive.series[state.series]?.subcollections || {}).length <= 1;

  if (!skipSeriesSheet && (state.layer === "series" || state.layer === "browse" || state.layer === "item")) {
    pushLayerForState({ layer: "series", series: state.series, subcollection: null, view: null, item: null }, true);
  }
  if (state.layer === "browse" || state.layer === "item") {
    pushLayerForState({ layer: "browse", series: state.series, subcollection: state.subcollection, view: state.view, item: null }, true);
  }
  if (state.layer === "item") {
    pushLayerForState(state, true);
  }
}

function pushLayerForState(state, silent = false) {
  switch (state.layer) {
    case "guide": {
      pushSheet(makeGuideSheet());
      break;
    }
    case "series": {
      // Flat-URL series (labor, accumulation) skip the series sheet and go to browse
      if (FLAT_URL_SERIES.has(state.series)) {
        if (!silent) navigate({ layer: "browse", series: state.series, subcollection: null, view: state.view || "all", item: null });
        return;
      }
      const subs = Object.keys(archive.series[state.series]?.subcollections || {});
      // If series has exactly 1 subcollection, skip series sheet and go to browse
      if (subs.length === 1) {
        if (!silent) navigate({ layer: "browse", series: state.series, subcollection: subs[0], view: "all", item: null });
        return;
      }
      pushSheet(makeSeriesSheet(state.series));
      break;
    }
    case "browse": pushSheet(makeBrowseSheet(state.series, state.subcollection, state.view, state.item)); break;
    case "item":   pushSheet(makeItemSheet(state.series, state.subcollection, state.item)); break;
  }
}

// ── Sheet stack primitives ────────────────────────────────────────────────────

function pushSheet({ veil, sheet, cleanup, update }) {
  const depth = layerStack.length + 1; // 1-based
  const returnFocus = document.activeElement;

  veil.style.setProperty("--depth", depth);
  sheet.style.setProperty("--depth", depth);

  document.body.appendChild(veil);
  document.body.appendChild(sheet);

  layerStack.push({ veil, sheet, cleanup: cleanup || (() => {}), update: update || (() => {}), returnFocus });

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

  const remove = () => {
    top.veil.remove();
    top.sheet.remove();
    if (top.returnFocus && typeof top.returnFocus.focus === "function") {
      top.returnFocus.focus({ preventScroll: true });
    }
  };
  top.sheet.addEventListener("transitionend", remove, { once: true });
  // Fallback if transition doesn't fire
  setTimeout(remove, 400);
}

function popAll() {
  while (layerStack.length) popSheet();
}

// ── Desk (permanent, never replaced) ─────────────────────────────────────────

function renderDesk() {
  const seriesEntries = Object.entries(archive.series).sort((a, b) => a[1].order - b[1].order);

  // Collect all desk objects: series + guide
  const deskObjects = [
    ...seriesEntries.map(([key, s]) => ({ type: "series", key, ...s })),
    ...(archive.guide ? [{ type: "guide", key: "guide", ...archive.guide }] : [])
  ].sort((a, b) => a.order - b.order);

  app.innerHTML = `
    <div class="desk">
      <div class="desk-objects">
        ${deskObjects.map(obj => `
          <button class="desk-object${obj.type === 'guide' ? ' desk-object--guide' : ''}" data-type="${obj.type}" data-key="${obj.key}">
            <span class="desk-object__label">${obj.label}</span>
            <span class="desk-object__container">${obj.container}</span>
          </button>
        `).join("")}
      </div>
    </div>
  `;

  app.querySelectorAll(".desk-object").forEach(btn => {
    const type = btn.dataset.type;
    const key = btn.dataset.key;
    if (type === "series") {
      btn.addEventListener("click", () => {
        navigate({ layer: "series", series: key, subcollection: null, item: null });
      });
    } else if (type === "guide") {
      btn.addEventListener("click", () => {
        navigate({ layer: "guide" });
      });
    }
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

  const closeSeriesSheet = () => navigate({ layer: "desk", series: null, subcollection: null, item: null });

  sheet.querySelector(".sheet-close").addEventListener("click", closeSeriesSheet);

  sheet.querySelectorAll(".series-tab").forEach(btn => {
    btn.addEventListener("click", () => {
      navigate({ layer: "browse", series: btn.dataset.series, subcollection: btn.dataset.sub, item: null });
    });
  });

  const cleanup = attachEscapeHandler(sheet, closeSeriesSheet);
  requestAnimationFrame(() => sheet.querySelector(".sheet-close")?.focus());

  return { veil, sheet, cleanup };
}

// ── Guide sheet ───────────────────────────────────────────────────────────────

function makeGuideSheet() {
  const veil = makeVeil(() => {
    navigate({ layer: "desk" });
  });

  const sheet = makeSheet();
  sheet.innerHTML = `
    <div class="layer-sheet__inner">
      <button class="sheet-close" type="button" aria-label="Close">✕</button>
      <h1 class="sheet-title">Guide</h1>
      <p class="sheet-subtitle">Finding aid, sitemap, and archive metadata</p>
      <div class="guide-content">
        <p>This is a personal archive — a collection of records, artifacts, documents, and traces that describe a life through material evidence rather than through a simplified personal brand narrative.</p>
        <p>Navigate through the desk objects to explore the archive. Each series contains different types of material:</p>
        <ul>
          <li><strong>Identity:</strong> Biography, CV, and contact information</li>
          <li><strong>Labor:</strong> Work, projects, and professional effort</li>
          <li><strong>Consumption:</strong> Records of films, books, music, coffee, and games</li>
          <li><strong>Creation:</strong> Sketches, photos, prototypes, videos, and notes</li>
          <li><strong>Accumulation:</strong> Collected ephemera and physical artifacts</li>
        </ul>
      </div>
    </div>
  `;

  const closeGuide = () => navigate({ layer: "desk" });
  sheet.querySelector(".sheet-close").addEventListener("click", closeGuide);
  const cleanup = attachEscapeHandler(sheet, closeGuide);
  requestAnimationFrame(() => sheet.querySelector(".sheet-close")?.focus());

  return { veil, sheet, cleanup };
}

// ── Browse sheet ──────────────────────────────────────────────────────────────

function makeBrowseSheet(seriesKey, subKey, viewSlug, openItemId) {
  const s = archive.series[seriesKey];
  const isFlatSeries = FLAT_URL_SERIES.has(seriesKey);
  // Only expose subcollection tabs for non-flat series
  const subs = isFlatSeries ? [] : Object.entries(s.subcollections);

  // Helper: gather all items for a flat-URL series (may have data subcollections)
  function getFlatItems() {
    if (s.items) return s.items;
    return Object.values(s.subcollections || {}).flatMap(sc => sc.items || []);
  }

  const veil = makeVeil(() => {
    if (isFlatSeries) {
      navigate({ layer: "desk" });
    } else {
      navigate({ layer: "series", series: seriesKey, subcollection: null, item: null });
    }
  });

  const sheet = makeSheet();

  function renderContent(activeSubKey, activeView) {
    let activeSub, years;

    if (isFlatSeries) {
      let items = getFlatItems();
      if (activeView && activeView !== "all") {
        items = items.filter(item => item.context === activeView || item.view === activeView);
      }
      activeSub = { label: activeView || "all", items };
      years = groupByYear(items);
    } else {
      activeSub = s.subcollections[activeSubKey];
      years = groupByYear(activeSub?.items || []);
    }

    sheet.innerHTML = `
      <div class="layer-sheet__inner">
        <button class="sheet-close" type="button" aria-label="Close">✕</button>
        ${subs.length > 0 ? `
          <nav class="series-tabs" aria-label="Subcollections">
            ${subs.map(([key, sc]) => `
              <button class="series-tab ${key === activeSubKey ? "series-tab--active" : ""}"
                data-series="${seriesKey}" data-sub="${key}">
                ${sc.label}
                <span class="series-tab__count">${sc.items.length}</span>
              </button>
            `).join("")}
          </nav>
        ` : ""}
        <div class="browse-header">
          <h2 class="sheet-title">${activeSub.label}</h2>
          <p class="browse-count">${activeSub.items.length} item${activeSub.items.length !== 1 ? "s" : ""}</p>
          ${subs.length === 0
            ? `<p class="browse-groupby-stub" aria-label="Sort options coming in a later phase">group by: year · context · place · type</p>`
            : (subs.length === 1 ? `<p class="browse-groupby-stub" aria-label="Sort options coming in a later phase">group by: year · event · place · type</p>` : "")}
        </div>
        <ul class="browse-list">
          ${years.map(({ year, items: yearItems }) => `
            <li>
              <p class="browse-year-divider">${year}</p>
              <ul class="browse-list">
                ${yearItems.map(item => browseItemHTML(item)).join("")}
              </ul>
            </li>
          `).join("")}
        </ul>
      </div>
    `;

    sheet.querySelector(".sheet-close").addEventListener("click", () => {
      if (isFlatSeries) {
        navigate({ layer: "desk" });
      } else {
        navigate({ layer: "series", series: seriesKey, subcollection: null, item: null });
      }
    });

    sheet.querySelectorAll(".series-tab").forEach(btn => {
      btn.addEventListener("click", () => {
        navigate({ layer: "browse", series: btn.dataset.series, subcollection: btn.dataset.sub, item: null });
      });
    });

    sheet.querySelectorAll(".browse-item__trigger").forEach(btn => {
      btn.addEventListener("click", () => {
        navigate({ layer: "item", series: seriesKey, subcollection: activeSubKey, view: activeView, item: btn.dataset.itemId });
      });
    });
  }

  const closeBrowse = () => {
    if (isFlatSeries) {
      navigate({ layer: "desk" });
    } else {
      navigate({ layer: "series", series: seriesKey, subcollection: null, item: null });
    }
  };

  const cleanup = attachEscapeHandler(sheet, closeBrowse);

  renderContent(subKey, viewSlug);
  requestAnimationFrame(() => sheet.querySelector(".sheet-close")?.focus());

  function update(state) {
    if (state.subcollection && state.subcollection !== subKey) {
      subKey = state.subcollection;
      renderContent(subKey, viewSlug);
    }
    if (state.view && state.view !== viewSlug) {
      viewSlug = state.view;
      renderContent(subKey, viewSlug);
    }
  }

  return { veil, sheet, update, cleanup };
}

// ── Item sheet ────────────────────────────────────────────────────────────────

function makeItemSheet(seriesKey, subKey, itemId) {
  const s = archive.series[seriesKey];
  let allItems;

  if (subKey && s.subcollections[subKey]) {
    allItems = s.subcollections[subKey].items;
  } else if (Object.keys(s.subcollections || {}).length > 0) {
    // Flat-URL series (accumulation) — items live in subcollections, merge them all
    allItems = Object.values(s.subcollections).flatMap(sc => sc.items || []);
  } else {
    allItems = s.items || [];
  }
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

    sheet.querySelectorAll(".modal-related__link").forEach(btn => {
      btn.addEventListener("click", () => {
        const id = btn.dataset.relatedId;
        const i = allItems.findIndex(it => it.id === id);
        if (i !== -1) navItem(i);
      });
    });

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

// ── Keyboard handler for non-item sheets ─────────────────────────────────────

function attachEscapeHandler(sheet, onEscape) {
  const handler = (e) => {
    if (e.key !== "Escape") return;
    if (layerStack[layerStack.length - 1]?.sheet !== sheet) return;
    onEscape();
  };
  document.addEventListener("keydown", handler);
  return () => document.removeEventListener("keydown", handler);
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
