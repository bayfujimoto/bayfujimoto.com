import { getBaseGroups, orderGroups } from "../forms/base-fields.js";
import { getTypeGroups } from "../forms/type-fields.js";
import { renderForm }    from "../forms/form-renderer.js";
import { generateSlug, generateFilePath } from "../lib/slug-generator.js";
import { toMarkdown } from "../lib/serializer.js";
import { getState, setState } from "../state.js";
import { registerPaneNav } from "../nav.js";
import { applyEditToggle } from "../forms/edit-toggle.js";
import { applyFieldChrome } from "../forms/field-chrome.js";

/**
 * Render the edit form for an item into the Record pane body. Phase 10.5
 * lays it out as a 4-col tabular buffer with state / FIELD / VALUE / TYPE
 * columns under an UPPERCASE header.
 *
 *   renderEditItem(body, item, allItems, archive, { onClose })
 */
export function renderEditItem(container, item, allItems, archive, callbacks = {}) {
  container.innerHTML = "";

  const { onClose } = callbacks;

  if (!item) {
    container.innerHTML = `<div class="admin-empty">No item provided.</div>`;
    return;
  }

  const series        = item._series || item.series;
  const subcollection = item._sub    || item.subcollection;
  const itemType      = item.item_type;
  const id            = item.id;

  // Topbar breadcrumb
  const breadcrumb = document.getElementById("admin-topbar-breadcrumb");
  if (breadcrumb) {
    breadcrumb.innerHTML = `
      <span>edit</span><span>›</span><span>${escapeHTML(id)}</span>
    `;
  }

  const body = document.createElement("div");
  body.className = "admin-wizard-step";
  container.appendChild(body);

  // ── Meta rows (path, lock) — same grid layout as fields, but skipped by nav ──
  const pathRow = document.createElement("div");
  pathRow.className = "admin-field admin-field--meta";
  pathRow.innerHTML = `
    <span></span>
    <label>path</label>
    <span class="admin-field-meta-value" id="meta-path"></span>
  `;
  body.appendChild(pathRow);

  const lockRow = document.createElement("div");
  lockRow.className = "admin-field admin-field--meta";
  lockRow.innerHTML = `
    <span></span>
    <label>lock</label>
    <span class="admin-field-meta-value">
      <input type="checkbox" id="unlock-stable" hidden>
      <button type="button" class="admin-lock-toggle" id="lock-toggle" data-state="locked">[locked]</button>
      <span class="admin-field-meta-value is-hint" style="margin-left:6px;">unlocking can break existing links</span>
    </span>
  `;
  body.appendChild(lockRow);

  // ── Form header banner ──────────────────────────────────────────────────
  const header = document.createElement("div");
  header.className = "admin-form-header";
  header.innerHTML = `<span></span><span>FIELD</span><span>VALUE</span><span>TYPE</span>`;
  body.appendChild(header);

  const sep = document.createElement("div");
  sep.className = "admin-form-header-sep";
  body.appendChild(sep);

  // ── Form ─────────────────────────────────────────────────────────────────
  const groups = orderGroups([...getBaseGroups(), ...getTypeGroups(itemType)]);
  const initialData = { ...item, series, subcollection, item_type: itemType };

  function updatePathPreview(data) {
    const pathEl = document.getElementById("meta-path");
    if (!pathEl) return;
    const slug = data.slug || generateSlug(itemType, data);
    try {
      const fp = generateFilePath(series, subcollection, data.id || id, slug);
      pathEl.textContent = fp;
    } catch {
      pathEl.textContent = "(not yet determined)";
    }
  }
  updatePathPreview(initialData);

  const formContainer = document.createElement("div");
  body.appendChild(formContainer);

  const formHandle = renderForm(formContainer, groups, initialData, (fieldId, value, currentData) => {
    updatePathPreview(currentData);
  }, "full");

  // Layer the chrome: type column + state slot, then click-to-edit toggle.
  applyFieldChrome(formContainer);
  applyEditToggle(formContainer);

  // ── Action lines (replaces bordered Save/Cancel) ────────────────────────
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
  saveAction.addEventListener("click", () =>
    handleEditSave(formHandle, id, series, subcollection, itemType, archive, body)
  );
  actions.appendChild(saveAction);

  const cancelAction = document.createElement("button");
  cancelAction.type = "button";
  cancelAction.className = "admin-action admin-action--secondary";
  cancelAction.innerHTML = `
    <span class="admin-action-marker">&gt;</span>
    <span class="admin-action-label">cancel</span>
    <span class="admin-action-hint">:q</span>
  `;
  cancelAction.addEventListener("click", () => { if (onClose) onClose(); });
  actions.appendChild(cancelAction);

  body.appendChild(actions);

  // ── Arrow-key nav ───────────────────────────────────────────────────────
  // Field rows + action rows are navable; meta rows are skipped (they're
  // informational and the lock button is mouse-clickable).
  registerPaneNav('r', {
    container:   body,
    rowSelector: '.admin-field:not(.admin-field--meta), .admin-action',
    onActivate:  (row) => {
      if (row.classList.contains('admin-action')) {
        row.click();
        return;
      }
      const display = row.querySelector('.admin-field-value:not(.is-editing) .admin-field-display');
      if (display) { display.click(); return; }
      const input = row.querySelector(
        'input:not([readonly]):not([disabled]), textarea:not([readonly]):not([disabled]), select:not([disabled])'
      );
      if (input) input.focus();
    },
  });

  // Lock toggle wiring
  const lockToggle   = document.getElementById("lock-toggle");
  const lockCheckbox = document.getElementById("unlock-stable");
  lockToggle?.addEventListener("click", () => {
    const next = lockToggle.dataset.state !== 'unlocked';
    lockToggle.dataset.state = next ? 'unlocked' : 'locked';
    lockToggle.textContent   = next ? '[unlocked]' : '[locked]';
    if (lockCheckbox) lockCheckbox.checked = next;
    const idEl   = formContainer.querySelector("#field-id");
    const slugEl = formContainer.querySelector("#field-slug");
    if (idEl)   idEl.readOnly   = !next;
    if (slugEl) slugEl.readOnly = !next;
  });
}

function handleEditSave(formHandle, id, series, subcollection, itemType, archive, body) {
  const data = formHandle.getData();
  data.series        = series;
  data.subcollection = subcollection;
  data.item_type     = itemType;

  const slug = data.slug || generateSlug(itemType, data);
  data.slug  = slug;

  let filePath;
  try {
    filePath = generateFilePath(series, subcollection, id, slug);
  } catch (e) {
    showInlineMessage(body, `Path error: ${e.message}`, "error");
    return;
  }

  const content = toMarkdown(data);

  const { pendingChanges } = getState();
  setState({
    pendingChanges: [...pendingChanges, { id, filePath, content, action: "edit" }],
  });
  updateArchiveInState(archive, data, series, subcollection);

  showInlineMessage(body, `Saved ${id} — staged for commit. Run :w to commit.`, "saved");
}

function showInlineMessage(body, text, kind) {
  body.querySelector(".admin-inline-message")?.remove();
  const msg = document.createElement("div");
  msg.className = `admin-inline-message admin-inline-message--${kind}`;
  msg.textContent = text;
  body.insertAdjacentElement("afterbegin", msg);
}

function updateArchiveInState(archive, itemData, series, subcollection) {
  const { allItems: oldAllItems } = getState();
  const allItems = oldAllItems.map(item =>
    item.id === itemData.id
      ? { ...itemData, _series: series, _sub: subcollection || null }
      : item
  );
  setState({ archive, allItems });
}

function escapeHTML(s) {
  return String(s).replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}
