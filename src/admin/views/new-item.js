import { getBaseGroups, orderGroups } from "../forms/base-fields.js";
import { getTypeGroups } from "../forms/type-fields.js";
import { renderForm }    from "../forms/form-renderer.js";
import { generateId }    from "../lib/id-generator.js";
import { generateSlug, generateFilePath, TYPE_SUBCOLLECTION } from "../lib/slug-generator.js";
import { toMarkdown } from "../lib/serializer.js";
import { getState, setState } from "../state.js";

const SERIES_TYPES = {
  accumulation: ["ticket", "brochure", "receipt", "handout", "document"],
  consumption:  ["film", "book", "album", "ep", "single", "mix", "bag", "game"],
  creation:     ["sketch", "photo", "prototype", "video", "note"],
  labor:        ["project", "artifact", "commission", "contribution"],
  identity:     ["biography", "cv-entry", "contact"],
};

const SERIES_ORDER = ["accumulation", "consumption", "creation", "labor", "identity"];

// Store wizard state between re-renders
let wizardState = {
  step:     0,
  series:   null,
  itemType: null,
  depth:    null,
};

export function renderNewItem(container, archive, preselect = null) {
  if (preselect) {
    // Preselect jumps to depth selection (step 1), not straight to form
    wizardState = { step: 1, series: preselect.series, itemType: preselect.itemType, depth: null };
  } else {
    wizardState = { step: 0, series: null, itemType: null, depth: null };
  }
  renderStep(container, archive);
}

function getMainContainer(el) {
  return document.getElementById("admin-content") || el.closest(".admin-main") || el.parentElement;
}

function renderStep(container, archive) {
  container.innerHTML = "";

  const breadcrumb = document.getElementById("admin-topbar-breadcrumb");

  const body = document.createElement("div");
  body.className = "admin-wizard-step";
  container.appendChild(body);

  if (wizardState.step === 0) {
    breadcrumb.innerHTML = `<span>new item</span>`;
    renderTypeSelection(body, archive);
  } else if (wizardState.step === 1) {
    breadcrumb.innerHTML = `
      <a onclick="goStep(0)">new item</a><span>›</span>
      <span>${wizardState.series} / ${wizardState.itemType}</span>
    `;
    renderDepthSelection(body, archive);
  } else {
    breadcrumb.innerHTML = `
      <a onclick="goStep(0)">new item</a><span>›</span>
      <a onclick="goStep(1)">${wizardState.series} / ${wizardState.itemType}</a><span>›</span>
      <span>${wizardState.depth}</span>
    `;
    renderFormStep(body, archive);
  }

  // Expose navigation helper globally for onclick
  window.goStep = (step) => {
    wizardState.step = step;
    renderStep(container, archive);
  };
}

function makePanel(label, ...children) {
  const panel = document.createElement("div");
  panel.className = "admin-panel";
  const lbl = document.createElement("span");
  lbl.className = "admin-panel-label";
  lbl.textContent = label;
  panel.appendChild(lbl);
  for (const child of children) panel.appendChild(child);
  return panel;
}

function renderTypeSelection(body, archive) {
  for (const series of SERIES_ORDER) {
    const types = SERIES_TYPES[series];

    const grid = document.createElement("div");
    grid.className = "admin-step-grid";

    for (const type of types) {
      const btn = document.createElement("button");
      btn.className = "admin-step-tile";
      btn.innerHTML = `<span class="tile-label">${series}</span>${type}`;
      btn.addEventListener("click", () => {
        wizardState.series   = series;
        wizardState.itemType = type;
        wizardState.step     = 1;
        renderStep(getMainContainer(body), archive);
      });
      grid.appendChild(btn);
    }

    body.appendChild(makePanel(series, grid));
  }
}

function renderDepthSelection(body, archive) {
  const grid = document.createElement("div");
  grid.className = "admin-depth-grid";

  const quick = document.createElement("button");
  quick.className = "admin-depth-btn";
  quick.innerHTML = `
    <span class="depth-name">Quick log</span>
    <span class="depth-desc">Title, date, optional thumbnail. Fast entry for films, coffee, books, ephemera.</span>
  `;
  quick.addEventListener("click", () => {
    wizardState.depth = "quick";
    wizardState.step  = 2;
    renderStep(getMainContainer(body), archive);
  });

  const full = document.createElement("button");
  full.className = "admin-depth-btn";
  full.innerHTML = `
    <span class="depth-name">Full entry</span>
    <span class="depth-desc">All metadata, assets, relationships, inspection settings. For richly annotated records.</span>
  `;
  full.addEventListener("click", () => {
    wizardState.depth = "full";
    wizardState.step  = 2;
    renderStep(getMainContainer(body), archive);
  });

  grid.appendChild(quick);
  grid.appendChild(full);
  body.appendChild(makePanel("Entry depth", grid));
}

function renderFormStep(body, archive) {
  const { series, itemType, depth } = wizardState;
  const subcollection = TYPE_SUBCOLLECTION[itemType];
  const counters = archive._counters || {};

  const { id, prefix, nextCounter } = generateId(itemType, counters);

  const initialData = {
    id,
    slug:        "",
    series,
    subcollection,
    item_type:   itemType,
    status:      series === "identity" ? "published" : "draft",
    display_date: "",
    sort_date:   "",
  };

  initialData.slug = generateSlug(itemType, initialData);

  const groups = orderGroups([...getBaseGroups(), ...getTypeGroups(itemType)]);

  // File path preview
  const preview = document.createElement("div");
  preview.className = "admin-filepath-preview";
  body.appendChild(makePanel("Save path", preview));

  function updatePreview(data) {
    const slug = generateSlug(itemType, data);
    try {
      const fp = generateFilePath(series, subcollection, id, slug);
      preview.innerHTML = `Will save as: <strong>${fp}</strong>`;
    } catch {
      preview.textContent = "Path not yet determined";
    }
  }

  updatePreview(initialData);

  let formHandle;
  const formContainer = document.createElement("div");
  body.appendChild(formContainer);

  formHandle = renderForm(formContainer, groups, initialData, (fieldId, value, currentData) => {
    // Keep slug in sync with title/key fields
    const slugFields = ["title", "artist", "roaster", "origin", "organization", "role", "place", "event", "sort_date"];
    if (slugFields.includes(fieldId)) {
      const newSlug = generateSlug(itemType, currentData);
      formHandle.setField("slug", newSlug);
      currentData.slug = newSlug;
    }
    updatePreview(currentData);
  }, depth);

  // Actions
  const actions = document.createElement("div");
  actions.className = "admin-form-actions";

  const saveBtn = document.createElement("button");
  saveBtn.className = "admin-btn";
  saveBtn.textContent = "Save";
  saveBtn.addEventListener("click", () => handleSave(saveBtn, formHandle, id, prefix, nextCounter, counters, series, subcollection, itemType, archive, body));

  const cancelLink = document.createElement("a");
  cancelLink.href = "#/";
  cancelLink.className = "admin-btn admin-btn-secondary";
  cancelLink.textContent = "Cancel";

  actions.appendChild(saveBtn);
  actions.appendChild(cancelLink);
  body.appendChild(actions);
}

function handleSave(saveBtn, formHandle, id, prefix, nextCounter, counters, series, subcollection, itemType, archive, body) {
  const data = formHandle.getData();

  // Resolve final slug + file path
  const slug = generateSlug(itemType, data);
  data.id   = id;
  data.slug  = slug;
  data.series = series;
  data.subcollection = subcollection;
  data.item_type = itemType;

  let filePath;
  try {
    filePath = generateFilePath(series, subcollection, id, slug);
  } catch (e) {
    showStatus("error", `Path error: ${e.message}`);
    return;
  }

  const content = toMarkdown(data);
  const newCounters = { ...counters, [prefix]: nextCounter };

  const { pendingChanges } = getState();
  setState({ pendingChanges: [...pendingChanges, { id, filePath, content, action: "add" }] });
  showStatus("saved", `Saved ${id} — ${pendingChanges.length + 1} pending`);
  // Add new item to in-memory archive so it appears immediately in browse/dashboard
  updateArchiveInState(archive, { ...data }, series, subcollection);
  renderSuccessState(body, id, itemType, series, subcollection, archive, newCounters);
}

function renderSuccessState(body, id, itemType, series, subcollection, archive, newCounters) {
  // Update in-memory counters so next entry generates the correct ID
  archive._counters = newCounters;

  body.innerHTML = `
    <div style="padding: 24px 0;">
      <div style="margin-bottom: 16px;">Saved <strong>${id}</strong></div>
      <div style="display: flex; gap: 12px;">
        <button class="admin-btn" id="add-another">Add another ${itemType}</button>
        <a href="#/browse" class="admin-btn admin-btn-secondary">Browse items</a>
        <a href="#/" class="admin-btn admin-btn-secondary">Dashboard</a>
      </div>
    </div>
  `;

  document.getElementById("add-another")?.addEventListener("click", () => {
    wizardState = { step: 1, series, itemType, depth: null };
    const container = body.closest(".admin-main");
    if (container) renderStep(container, archive);
  });
}

function showStatus(type, message) {
  setState({ status: type, statusMessage: message });
  if (type === "saved") {
    setTimeout(() => setState({ status: null, statusMessage: "" }), 3000);
  }
}

function updateArchiveInState(archive, itemData, series, subcollection) {
  if (!archive.series[series]) return;

  if (subcollection) {
    if (!archive.series[series].subcollections) archive.series[series].subcollections = {};
    if (!archive.series[series].subcollections[subcollection]) {
      archive.series[series].subcollections[subcollection] = { items: [] };
    }
    archive.series[series].subcollections[subcollection].items.push(itemData);
  } else {
    if (!archive.series[series].items) archive.series[series].items = [];
    archive.series[series].items.push(itemData);
  }

  // Rebuild allItems from updated archive and sync state
  const { allItems: oldAllItems } = getState();
  const newItems = [];
  for (const [seriesKey, ser] of Object.entries(archive.series || {})) {
    for (const item of ser.items || []) {
      newItems.push({ ...item, _series: seriesKey, _sub: null });
    }
    for (const [subKey, sub] of Object.entries(ser.subcollections || {})) {
      for (const item of sub.items || []) {
        newItems.push({ ...item, _series: seriesKey, _sub: subKey });
      }
    }
  }
  setState({ archive, allItems: newItems });
}
