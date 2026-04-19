import { getBaseGroups } from "../forms/base-fields.js";
import { getTypeGroups } from "../forms/type-fields.js";
import { renderForm }    from "../forms/form-renderer.js";
import { generateSlug, generateFilePath, TYPE_SUBCOLLECTION } from "../lib/slug-generator.js";
import { toMarkdown } from "../lib/serializer.js";
import { getState, setState } from "../state.js";

export function renderEditItem(container, id, allItems, archive) {
  container.innerHTML = "";

  const item = allItems.find(i => i.id === id);

  if (!item) {
    container.innerHTML = `
      <h1 class="admin-page-title">Edit Item</h1>
      <div class="admin-empty">Item "${id}" not found. It may have been added after the last build.
        <a href="#/browse">Browse items</a> or <a href="#/">dashboard</a>.</div>
    `;
    return;
  }

  const series = item._series || item.series;
  const subcollection = item._sub || item.subcollection;
  const itemType = item.item_type;

  const breadcrumb = document.createElement("div");
  breadcrumb.className = "admin-breadcrumb";
  breadcrumb.innerHTML = `<a href="#/browse">browse</a><span>›</span><span>${id}</span>`;
  container.appendChild(breadcrumb);

  const title = document.createElement("h1");
  title.className = "admin-page-title";
  title.textContent = `Edit — ${id}`;
  container.appendChild(title);

  const body = document.createElement("div");
  body.className = "admin-wizard-step";
  container.appendChild(body);

  // Unlock toggle for ID/slug
  const unlockRow = document.createElement("div");
  unlockRow.style.cssText = "margin-bottom:16px; font-size:11px; color:var(--muted);";
  unlockRow.innerHTML = `
    <label style="cursor:pointer;">
      <input type="checkbox" id="unlock-stable" style="margin-right:6px;">
      Override stable ID and slug (use with care — breaks existing links)
    </label>
  `;
  body.appendChild(unlockRow);

  // Warn if item not reloaded (added after last build)
  const note = document.createElement("div");
  note.style.cssText = "font-size:11px; color:var(--muted); margin-bottom:16px;";
  note.textContent = "Editing the saved version. Run npm run build-data after saving to update the browse list.";
  body.appendChild(note);

  const groups = [...getBaseGroups(), ...getTypeGroups(itemType)];
  const initialData = { ...item };
  // Ensure series/subcollection are set
  initialData.series      = series;
  initialData.subcollection = subcollection;
  initialData.item_type   = itemType;

  // File path preview
  const preview = document.createElement("div");
  preview.className = "admin-filepath-preview";
  body.appendChild(preview);

  function updatePreview(data) {
    const slug = data.slug || generateSlug(itemType, data);
    try {
      const fp = generateFilePath(series, subcollection, data.id || id, slug);
      preview.innerHTML = `Will save to: <strong>${fp}</strong>`;
    } catch {
      preview.textContent = "Path not yet determined";
    }
  }

  updatePreview(initialData);

  let formHandle;
  const formContainer = document.createElement("div");
  body.appendChild(formContainer);

  formHandle = renderForm(formContainer, groups, initialData, (fieldId, value, currentData) => {
    updatePreview(currentData);
  }, "full");

  // Unlock checkbox behavior
  document.getElementById("unlock-stable")?.addEventListener("change", (e) => {
    const idEl   = formContainer.querySelector("#field-id");
    const slugEl = formContainer.querySelector("#field-slug");
    if (idEl)   idEl.readOnly   = !e.target.checked;
    if (slugEl) slugEl.readOnly = !e.target.checked;
  });

  // Actions
  const actions = document.createElement("div");
  actions.className = "admin-form-actions";

  const saveBtn = document.createElement("button");
  saveBtn.className = "admin-btn";
  saveBtn.textContent = "Save changes";
  saveBtn.addEventListener("click", () => handleEditSave(saveBtn, formHandle, series, subcollection, itemType, archive, body));

  const cancelLink = document.createElement("a");
  cancelLink.href = "#/browse";
  cancelLink.className = "admin-btn admin-btn-secondary";
  cancelLink.textContent = "Cancel";

  actions.appendChild(saveBtn);
  actions.appendChild(cancelLink);
  body.appendChild(actions);
}

function handleEditSave(saveBtn, formHandle, series, subcollection, itemType, archive, body) {
  const data = formHandle.getData();
  data.series       = series;
  data.subcollection = subcollection;
  data.item_type    = itemType;

  const id   = data.id;
  const slug = data.slug || generateSlug(itemType, data);
  data.slug  = slug;

  let filePath;
  try {
    filePath = generateFilePath(series, subcollection, id, slug);
  } catch (e) {
    showStatus("error", `Path error: ${e.message}`);
    return;
  }

  const content = toMarkdown(data);

  const { pendingChanges } = getState();
  setState({ pendingChanges: [...pendingChanges, { id, filePath, content, action: "edit" }] });
  showStatus("saved", `Saved ${id} — ${pendingChanges.length + 1} pending`);
  // Update in-memory archive and refresh state
  updateArchiveInState(archive, data, series, subcollection);
  body.insertAdjacentHTML("afterbegin", `
    <div style="margin-bottom:16px; color:#2a7a2a; font-size:12px;">
      Saved. Browse and dashboard will update automatically.
    </div>
  `);
  saveBtn.disabled = false;
  saveBtn.textContent = "Save changes";
}

function showStatus(type, message) {
  setState({ status: type, statusMessage: message });
  if (type === "saved") {
    setTimeout(() => setState({ status: null, statusMessage: "" }), 3000);
  }
}

function updateArchiveInState(archive, itemData, series, subcollection) {
  const { allItems: oldAllItems } = getState();

  // Find and update the item in place
  const allItems = oldAllItems.map(item =>
    item.id === itemData.id ? { ...itemData, _series: series, _sub: subcollection || null } : item
  );

  setState({ archive, allItems });
}
