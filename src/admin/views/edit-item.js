import { getBaseGroups, orderGroups } from "../forms/base-fields.js";
import { getTypeGroups } from "../forms/type-fields.js";
import { renderForm }    from "../forms/form-renderer.js";
import { generateSlug, generateFilePath } from "../lib/slug-generator.js";
import { toMarkdown } from "../lib/serializer.js";
import { getState, setState } from "../state.js";
import { registerPaneNav } from "../nav.js";
import { applyEditToggle } from "../forms/edit-toggle.js";
import { applyFieldChrome } from "../forms/field-chrome.js";
import { setRecordActions, makePaneAction, setRecordStatus } from "../shell.js";

/**
 * Render the edit form for an item into the Record pane body. Phase 10.5
 * lays it out as a 4-col tabular buffer with state / FIELD / VALUE / TYPE
 * columns under an UPPERCASE header.
 *
 *   renderEditItem(body, item, allItems, archive, { onClose })
 */
export function renderEditItem(container, item, allItems, archive, callbacks = {}) {
  container.innerHTML = "";

  const { onClose, onDelete } = callbacks;

  if (!item) {
    container.innerHTML = `<div class="admin-empty">No item provided.</div>`;
    return;
  }

  const series        = item._series || item.series;
  const subcollection = item._sub    || item.subcollection;
  const itemType      = item.item_type;
  const id            = item.id;

  // The file this item currently lives in. If a save changes the computed path
  // (e.g. the slug changed), the old file must be deleted so it can't linger as
  // a same-id orphan — the source of duplicate cards in the archive.
  let originalFilePath = null;
  let originalSlug = "";
  try {
    originalSlug = item.slug || generateSlug(itemType, item);
    originalFilePath = generateFilePath(series, subcollection, id, originalSlug);
  } catch { /* unresolved path — treat as no original to delete */ }

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
    if (fieldId === "status") setRecordStatus(value);
  }, "full");

  // Tint the pane border to the record's current status from the outset.
  setRecordStatus(initialData.status || "draft");

  // Layer the chrome: type column + state slot, then click-to-edit toggle.
  applyFieldChrome(formContainer);
  applyEditToggle(formContainer);

  // ── Top-border actions ([save] [cancel] [del]) ──────────────────────────
  // These live in the Record pane's top border, right of the [r] Record label,
  // rather than as rows at the bottom of the form.
  setRecordActions([
    makePaneAction({
      label: "save",
      title: "Stage changes for commit (then :w to commit)",
      onClick: () =>
        handleEditSave(formHandle, id, series, subcollection, itemType, archive, body, originalFilePath),
    }),
    makePaneAction({
      label: "cancel",
      title: "Close without staging (:q)",
      onClick: () => { if (onClose) onClose(); },
    }),
    makePaneAction({
      label: "del",
      variant: "danger",
      title: "Delete this record (requires typing the slug)",
      onClick: () =>
        showDeleteConfirm(body, {
          id,
          slug: originalSlug,
          onConfirm: () =>
            handleEditDelete(item, id, originalFilePath, series, subcollection, body, onDelete),
        }),
    }),
  ]);

  // ── Arrow-key nav ───────────────────────────────────────────────────────
  // Field rows are navable; meta rows are skipped (informational). The action
  // buttons now live in the pane's top border and are reached via Tab / click.
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

function handleEditSave(formHandle, id, series, subcollection, itemType, archive, body, originalFilePath) {
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

  const change = { id, filePath, content, action: "edit" };
  // Path changed → also delete the file the item used to live in.
  if (originalFilePath && originalFilePath !== filePath) change.oldFilePath = originalFilePath;

  const { pendingChanges } = getState();
  setState({
    pendingChanges: [...pendingChanges, change],
  });
  updateArchiveInState(archive, data, series, subcollection);

  showInlineMessage(body, `Saved ${id} — staged for commit. Run :w to commit.`, "saved");
}

// Build the exclusion marker for an ingested book so it stays out of the
// archive on rebuild. Keyed by the stable goodreads_link (the BOOK-… id can
// shift between builds). Returns null for records without a goodreads_link.
function buildBookExclusion(item) {
  const link = item?.goodreads_link;
  if (!link) return null;
  const m = String(link).match(/goodreads\.com\/book\/show\/(\d+)/);
  const key = m
    ? m[1]
    : (String(link).replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "book");
  return {
    path: `src/content/consumption/books/_excluded/${key}.txt`,
    content: `${link}\n`,
  };
}

// Stage a record for deletion. Any change already staged for this id (a prior
// edit/add this session) is dropped first so we don't both write and delete it
// in the same commit. The actual change happens on commit (:w).
//
// Books are ingested from Goodreads on every build, so deleting the source file
// alone isn't enough — it would reappear. For books we also stage an exclusion
// marker (_excluded/<id>.txt) that the ingest honors, and tolerate a missing
// source file (uncommitted, build-time-only records) via viaExclude.
function handleEditDelete(item, id, originalFilePath, series, subcollection, body, onDelete) {
  const exclusion = subcollection === "books" ? buildBookExclusion(item) : null;

  if (!originalFilePath && !exclusion) {
    showInlineMessage(body, `Cannot delete ${id}: its file path is unresolved.`, "error");
    return;
  }

  const { pendingChanges } = getState();
  let next = pendingChanges.filter(c => c.id !== id);

  if (exclusion) {
    next = next.filter(c => c.filePath !== exclusion.path);
    next.push({ id: `exclude ${id}`, filePath: exclusion.path, content: exclusion.content, action: "exclude" });
  }
  if (originalFilePath) {
    next.push({ id, filePath: originalFilePath, action: "delete", viaExclude: !!exclusion });
  }

  setState({ pendingChanges: next });

  // Hand off to the view layer to drop the item from the archive/Explorer and
  // return to the empty state. The pending rows in the Log are the receipt.
  onDelete?.({ id, series, subcollection });
}

// Inline confirmation gate: the user must type the record's slug exactly before
// the destructive action unlocks. Esc or cancel backs out.
function showDeleteConfirm(body, { id, slug, onConfirm }) {
  body.querySelector(".admin-delete-confirm")?.remove();

  const panel = document.createElement("div");
  panel.className = "admin-delete-confirm";
  panel.innerHTML = `
    <div class="admin-delete-confirm-head">⚠ delete ${escapeHTML(id)}</div>
    <p class="admin-delete-confirm-text">
      This stages the record for deletion. The file is removed from the archive
      on your next commit (<code>:w</code>) and cannot be recovered afterward.
      Type the slug <code class="admin-delete-confirm-slug">${escapeHTML(slug)}</code> to confirm.
    </p>
    <input type="text" class="admin-delete-confirm-input" autocomplete="off"
           autocapitalize="off" spellcheck="false"
           placeholder="${escapeHTML(slug)}"
           aria-label="Type the slug to confirm deletion">
    <div class="admin-delete-confirm-actions">
      <button type="button" class="admin-action admin-action--danger" data-act="confirm" disabled>
        <span class="admin-action-marker">&gt;</span>
        <span class="admin-action-label">delete permanently</span>
      </button>
      <button type="button" class="admin-action admin-action--secondary" data-act="cancel">
        <span class="admin-action-marker">&gt;</span>
        <span class="admin-action-label">cancel</span>
      </button>
    </div>
  `;
  body.insertAdjacentElement("afterbegin", panel);

  const input      = panel.querySelector(".admin-delete-confirm-input");
  const confirmBtn = panel.querySelector('[data-act="confirm"]');
  const cancelBtn  = panel.querySelector('[data-act="cancel"]');

  const matches = () => input.value.trim() === slug;
  const sync    = () => { confirmBtn.disabled = !matches(); };

  input.addEventListener("input", sync);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && matches()) { e.preventDefault(); confirmBtn.click(); }
    else if (e.key === "Escape")        { e.preventDefault(); panel.remove(); }
  });
  confirmBtn.addEventListener("click", () => {
    if (!matches()) return;
    panel.remove();
    onConfirm();
  });
  cancelBtn.addEventListener("click", () => panel.remove());

  input.focus();
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
