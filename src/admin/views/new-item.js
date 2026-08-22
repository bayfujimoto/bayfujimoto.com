import { getBaseGroups, orderGroups } from "../forms/base-fields.js";
import { getTypeGroups } from "../forms/type-fields.js";
import { renderForm }    from "../forms/form-renderer.js";
import { formatDisplayDate } from "../components/date-picker.js";
import { generateId }    from "../lib/id-generator.js";
import { generateSlug, generateFilePath, TYPE_SUBCOLLECTION } from "../lib/slug-generator.js";
import { toMarkdown } from "../lib/serializer.js";
import { getState, setState } from "../state.js";
import { registerPaneNav } from "../nav.js";
import { applyEditToggle } from "../forms/edit-toggle.js";
import { applyFieldChrome } from "../forms/field-chrome.js";
import { setRecordActions, makePaneAction, setRecordStatus } from "../shell.js";

const SERIES_TYPES = {
  accumulation: ["ticket", "brochure", "receipt", "handout", "document"],
  consumption:  ["film", "book", "album", "ep", "single", "bag", "game"],
  creation:     ["sketch", "photo", "prototype", "video", "note"],
  labor:        ["project", "artifact", "commission", "contribution"],
  identity:     ["biography", "cv-entry", "contact"],
};

const SERIES_ORDER = ["accumulation", "consumption", "creation", "labor", "identity"];

// Wizard state — kept module-scoped so step transitions and the success
// state's "Add another" button can re-render in the same container without
// rebuilding the scaffold.
let wizardState     = { step: 0, series: null, itemType: null };
let wizardContainer = null;
let wizardOnClose   = null;

export function renderNewItem(container, archive, preselect = null, callbacks = {}) {
  wizardContainer = container;
  wizardOnClose   = callbacks.onClose || null;

  if (preselect) {
    // Preselect jumps straight to the form (step 1)
    wizardState = { step: 1, series: preselect.series, itemType: preselect.itemType };
  } else {
    wizardState = { step: 0, series: null, itemType: null };
  }
  renderStep(container, archive);
}

function renderStep(container, archive) {
  container.innerHTML = "";
  // Only the form step carries top-border actions + status border; clear any
  // from a prior step.
  setRecordActions([]);
  setRecordStatus(null);

  const breadcrumb = document.getElementById("admin-topbar-breadcrumb");

  const body = document.createElement("div");
  body.className = "admin-wizard-step";
  container.appendChild(body);

  if (wizardState.step === 0) {
    breadcrumb.innerHTML = `<span>new item</span>`;
    renderTypeSelection(body, archive);
  } else {
    breadcrumb.innerHTML = `
      <a onclick="goStep(0)">new item</a><span>›</span>
      <span>${wizardState.series} / ${wizardState.itemType}</span>
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

function renderFormStep(body, archive) {
  const { series, itemType } = wizardState;
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

  const groups = orderGroups([...getBaseGroups(series), ...getTypeGroups(itemType)]);

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
    if (fieldId === "status") setRecordStatus(value);
    updatePreview(currentData);
  });

  applyFieldChrome(formContainer);
  applyEditToggle(formContainer);

  // Tint the pane border to the new record's starting status.
  setRecordStatus(initialData.status || "draft");

  // Top-border actions ([save] [cancel]) — right of the [r] Record label.
  setRecordActions([
    makePaneAction({
      label: "save",
      title: "Stage new record for commit (then :w to commit)",
      onClick: () => handleSave(null, formHandle, id, prefix, nextCounter, counters, series, subcollection, itemType, archive, body),
    }),
    makePaneAction({
      label: "cancel",
      title: "Discard and close (:q)",
      onClick: () => { if (wizardOnClose) wizardOnClose(); },
    }),
  ]);

  // Arrow-key nav over the form's fields. Action buttons live in the top border
  // and are reached via Tab / click.
  registerPaneNav('r', {
    container:   body,
    rowSelector: '.admin-field:not(.admin-field--meta)',
    onActivate:  (row) => {
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

  // Derive the human display date from sort_date when left blank.
  if (!data.display_date && data.sort_date) data.display_date = formatDisplayDate(data.sort_date);

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
  // The success state carries its own buttons; drop the form's top-border
  // actions and status border.
  setRecordActions([]);
  setRecordStatus(null);
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
    wizardState = { step: 1, series, itemType };
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
