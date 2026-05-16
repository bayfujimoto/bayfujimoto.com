import { getBaseGroups, orderGroups } from "../forms/base-fields.js";
import { getTypeGroups } from "../forms/type-fields.js";
import { renderForm }    from "../forms/form-renderer.js";
import { generateId }    from "../lib/id-generator.js";
import { generateSlug, generateFilePath, TYPE_SUBCOLLECTION } from "../lib/slug-generator.js";
import { toMarkdown } from "../lib/serializer.js";
import { getState, setState } from "../state.js";
import { registerPaneNav } from "../nav.js";
import { applyEditToggle } from "../forms/edit-toggle.js";
import { applyFieldChrome } from "../forms/field-chrome.js";

const SERIES_TYPES = {
  accumulation: ["ticket", "brochure", "receipt", "handout", "document"],
  consumption:  ["film", "book", "album", "ep", "single", "mix", "bag", "game"],
  creation:     ["sketch", "photo", "prototype", "video", "note"],
  labor:        ["project", "artifact", "commission", "contribution"],
  identity:     ["biography", "cv-entry", "contact"],
};

const SERIES_ORDER = ["accumulation", "consumption", "creation", "labor", "identity"];

// Wizard state — kept module-scoped so step transitions and the success
// state's "Add another" button can re-render in the same container without
// rebuilding the scaffold.
let wizardState     = { step: 0, series: null, itemType: null, depth: null };
let wizardContainer = null;
let wizardOnClose   = null;

export function renderNewItem(container, archive, preselect = null, callbacks = {}) {
  wizardContainer = container;
  wizardOnClose   = callbacks.onClose || null;

  if (preselect) {
    // Preselect jumps to depth selection (step 1), not straight to form
    wizardState = { step: 1, series: preselect.series, itemType: preselect.itemType, depth: null };
  } else {
    wizardState = { step: 0, series: null, itemType: null, depth: null };
  }
  renderStep(container, archive);
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
  // Buffer-style: each series gets a `─ series` section divider followed by a
  // numbered list of type rows. Click a row to advance the wizard.
  let counter = 0;
  for (const series of SERIES_ORDER) {
    const types = SERIES_TYPES[series];

    const heading = document.createElement("div");
    heading.className = "admin-wizard-section";
    heading.textContent = series;
    body.appendChild(heading);

    const list = document.createElement("ul");
    list.className = "admin-wizard-list";

    for (const type of types) {
      counter++;
      const li = document.createElement("li");
      li.className = "admin-wizard-row";
      li.innerHTML = `
        <span class="admin-wizard-row-num">${counter}.</span>
        <span class="admin-wizard-row-label">${type}</span>
      `;
      li.addEventListener("click", () => {
        wizardState.series   = series;
        wizardState.itemType = type;
        wizardState.step     = 1;
        renderStep(wizardContainer, archive);
      });
      list.appendChild(li);
    }

    body.appendChild(list);
  }
}

function renderDepthSelection(body, archive) {
  const heading = document.createElement("div");
  heading.className = "admin-wizard-section";
  heading.textContent = "entry depth";
  body.appendChild(heading);

  const list = document.createElement("ul");
  list.className = "admin-wizard-list admin-wizard-list--depth";

  const depths = [
    { key: 'quick', name: 'Quick log',  desc: 'Title, date, optional thumbnail. Fast entry for films, coffee, books, ephemera.' },
    { key: 'full',  name: 'Full entry', desc: 'All metadata, assets, relationships, inspection settings. For richly annotated records.' },
  ];

  depths.forEach((d, i) => {
    const li = document.createElement("li");
    li.className = "admin-wizard-row admin-wizard-row--depth";
    li.innerHTML = `
      <span class="admin-wizard-row-num">${i + 1}.</span>
      <span class="admin-wizard-row-body">
        <span class="admin-wizard-row-name">${d.name}</span>
        <span class="admin-wizard-row-desc">${escapeHTML(d.desc)}</span>
      </span>
    `;
    li.addEventListener("click", () => {
      wizardState.depth = d.key;
      wizardState.step  = 2;
      renderStep(wizardContainer, archive);
    });
    list.appendChild(li);
  });

  body.appendChild(list);
}

function escapeHTML(s) {
  return String(s).replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
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

  // Meta row at top — file path preview (no lock row: new items always allow id edit)
  const pathRow = document.createElement("div");
  pathRow.className = "admin-field admin-field--meta";
  pathRow.innerHTML = `
    <span></span>
    <label>path</label>
    <span class="admin-field-meta-value" id="meta-path"></span>
  `;
  body.appendChild(pathRow);

  function updatePreview(data) {
    const pathEl = document.getElementById("meta-path");
    if (!pathEl) return;
    const slug = generateSlug(itemType, data);
    try {
      const fp = generateFilePath(series, subcollection, id, slug);
      pathEl.textContent = fp;
    } catch {
      pathEl.textContent = "(not yet determined)";
    }
  }
  updatePreview(initialData);

  // Form header banner
  const header = document.createElement("div");
  header.className = "admin-form-header";
  header.innerHTML = `<span></span><span>FIELD</span><span>VALUE</span><span>TYPE</span>`;
  body.appendChild(header);

  const sep = document.createElement("div");
  sep.className = "admin-form-header-sep";
  body.appendChild(sep);

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

  applyFieldChrome(formContainer);
  applyEditToggle(formContainer);

  // Action lines
  const actions = document.createElement("div");
  actions.className = "admin-actions";

  const saveAction = document.createElement("button");
  saveAction.type = "button";
  saveAction.className = "admin-action";
  saveAction.innerHTML = `
    <span class="admin-action-marker">&gt;</span>
    <span class="admin-action-label">save</span>
    <span class="admin-action-hint">:w</span>
  `;
  saveAction.addEventListener("click", () => handleSave(saveAction, formHandle, id, prefix, nextCounter, counters, series, subcollection, itemType, archive, body));
  actions.appendChild(saveAction);

  const cancelAction = document.createElement("button");
  cancelAction.type = "button";
  cancelAction.className = "admin-action admin-action--secondary";
  cancelAction.innerHTML = `
    <span class="admin-action-marker">&gt;</span>
    <span class="admin-action-label">cancel</span>
    <span class="admin-action-hint">:q</span>
  `;
  cancelAction.addEventListener("click", () => { if (wizardOnClose) wizardOnClose(); });
  actions.appendChild(cancelAction);

  body.appendChild(actions);

  // Arrow-key nav over the form's fields + action rows
  registerPaneNav('r', {
    container:   body,
    rowSelector: '.admin-field:not(.admin-field--meta), .admin-action',
    onActivate:  (row) => {
      if (row.classList.contains('admin-action')) { row.click(); return; }
      const display = row.querySelector('.admin-field-value:not(.is-editing) .admin-field-display');
      if (display) { display.click(); return; }
      const input = row.querySelector(
        'input:not([readonly]):not([disabled]), textarea:not([readonly]):not([disabled]), select:not([disabled])'
      );
      if (input) input.focus();
    },
  });
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
        <button class="admin-btn" id="add-another" type="button">Add another ${itemType}</button>
        <button class="admin-btn admin-btn-secondary" id="wizard-close" type="button">Close</button>
      </div>
    </div>
  `;

  document.getElementById("add-another")?.addEventListener("click", () => {
    wizardState = { step: 1, series, itemType, depth: null };
    if (wizardContainer) renderStep(wizardContainer, archive);
  });

  document.getElementById("wizard-close")?.addEventListener("click", () => {
    if (wizardOnClose) wizardOnClose();
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
