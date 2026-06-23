// ── Import view: Letterboxd diary.csv → tags (`:tags` command) ────────────────
// Renders into the Record pane. Pick a Letterboxd data-export diary.csv, choose
// how its tags combine with what's already on each record (merge or replace),
// preview the effect, then stage the changes as pending edits/adds. Nothing is
// written until you review the Log pane and run `:w` — the same commit path as
// every other admin edit.
//
// Safety model (see src/admin/lib/letterboxd-import.js):
//   • Matching is by viewing identity (slug(title)|year|watch_date), so a diary
//     entry already in the archive becomes an edit, never a duplicate.
//   • Existing records are only ever changed in their tag list; merge keeps what
//     you already have, replace mirrors Letterboxd exactly.
//   • New ids for created films come from the live FILM counter and self-correct
//     across re-stages, so re-running the import never doubles or collides.

import { getState, setState } from "../state.js";
import { setFocusedPane } from "../statusline.js";
import { registerPaneNav } from "../nav.js";
import { planImport, buildChanges } from "../lib/letterboxd-import.js";

function el(tag, className, html) {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (html != null) e.innerHTML = html;
  return e;
}

function readFileText(file) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result));
    fr.onerror = () => reject(fr.error || new Error("Could not read file"));
    fr.readAsText(file);
  });
}

export function renderImportLetterboxd(container, archive, allItems, callbacks = {}) {
  const { onClose, mode: presetMode } = callbacks;
  container.innerHTML = "";

  const breadcrumb = document.getElementById("admin-topbar-breadcrumb");
  if (breadcrumb) {
    breadcrumb.innerHTML = `<span>import</span><span>›</span><span>letterboxd&nbsp;csv</span>`;
  }

  // Films that exist in the archive right now — the matching baseline. Computed
  // once; staged adds are never folded back in, so this stays stable.
  const existingFilms = (getState().allItems || allItems || []).filter(
    (i) => i.item_type === "film"
  );

  // View-local state
  let mode = presetMode === "replace" ? "replace" : "merge";
  let csvText = null;
  let fileName = null;
  let plan = null;

  const body = el("div", "admin-wizard-step admin-import");
  container.appendChild(body);

  body.appendChild(el("div", "admin-import-intro",
    `Intake tags from a Letterboxd <span class="admin-import-mono">diary.csv</span> export. ` +
    `Existing films gain tags; diary entries not yet in the archive are created. ` +
    `Changes are staged for review — run <span class="admin-import-mono">:w</span> to commit.`
  ));

  // ── Mode selector ───────────────────────────────────────────────────────────
  const modeWrap = el("div", "admin-import-block");
  modeWrap.appendChild(el("div", "admin-import-block-label", "tag&nbsp;mode"));
  const modeRow = el("div", "admin-import-modes");
  const modeButtons = {};
  [
    ["merge",   "merge",   "add new tags, keep existing"],
    ["replace", "replace", "mirror Letterboxd exactly"],
  ].forEach(([value, label, hint]) => {
    const btn = el("button", "admin-import-mode");
    btn.type = "button";
    btn.dataset.mode = value;
    btn.innerHTML = `<span class="admin-import-mode-name">${label}</span><span class="admin-import-mode-hint">${hint}</span>`;
    btn.addEventListener("click", () => setModeValue(value));
    modeButtons[value] = btn;
    modeRow.appendChild(btn);
  });
  modeWrap.appendChild(modeRow);
  body.appendChild(modeWrap);

  // ── File picker ─────────────────────────────────────────────────────────────
  const fileWrap = el("div", "admin-import-block");
  fileWrap.appendChild(el("div", "admin-import-block-label", "diary.csv"));
  const fileInput = el("input", "admin-import-file-input");
  fileInput.type = "file";
  fileInput.accept = ".csv,text/csv";
  fileInput.hidden = true;
  const fileBtn = el("button", "admin-import-file-btn");
  fileBtn.type = "button";
  fileBtn.innerHTML = `<span class="admin-action-marker">&gt;</span> choose file…`;
  fileBtn.addEventListener("click", () => fileInput.click());
  const fileName_el = el("span", "admin-import-file-name", "no file selected");
  fileInput.addEventListener("change", onFilePicked);
  fileWrap.appendChild(fileBtn);
  fileWrap.appendChild(fileName_el);
  fileWrap.appendChild(fileInput);
  body.appendChild(fileWrap);

  // ── Preview ─────────────────────────────────────────────────────────────────
  const preview = el("div", "admin-import-preview");
  body.appendChild(preview);

  // ── Actions ─────────────────────────────────────────────────────────────────
  const actions = el("div", "admin-actions");
  const stageAction = el("button", "admin-action");
  stageAction.type = "button";
  stageAction.disabled = true;
  stageAction.innerHTML = `
    <span class="admin-action-marker">&gt;</span>
    <span class="admin-action-label">stage changes</span>
    <span class="admin-action-hint">review in [l]</span>`;
  stageAction.addEventListener("click", stageChanges);
  actions.appendChild(stageAction);

  const cancelAction = el("button", "admin-action admin-action--secondary");
  cancelAction.type = "button";
  cancelAction.innerHTML = `
    <span class="admin-action-marker">&gt;</span>
    <span class="admin-action-label">close</span>
    <span class="admin-action-hint">:q</span>`;
  cancelAction.addEventListener("click", () => { if (onClose) onClose(); });
  actions.appendChild(cancelAction);
  body.appendChild(actions);

  const message = el("div", "admin-import-message");
  body.appendChild(message);

  // ── Behaviour ───────────────────────────────────────────────────────────────

  function setModeValue(value) {
    mode = value;
    Object.entries(modeButtons).forEach(([v, btn]) =>
      btn.classList.toggle("is-active", v === value)
    );
    if (csvText) recompute();
  }

  async function onFilePicked() {
    const file = fileInput.files && fileInput.files[0];
    if (!file) return;
    fileName = file.name;
    fileName_el.textContent = fileName;
    try {
      csvText = await readFileText(file);
      recompute();
    } catch (e) {
      showMessage(`Could not read file: ${e.message}`, "error");
      csvText = null;
      stageAction.disabled = true;
    }
  }

  function recompute() {
    try {
      plan = planImport({ csvText, films: existingFilms, mode });
    } catch (e) {
      showMessage(`Could not parse CSV: ${e.message}`, "error");
      plan = null;
      stageAction.disabled = true;
      return;
    }
    renderPreview(plan);
    const total = plan.stats.willUpdate + plan.stats.willCreate;
    stageAction.disabled = total === 0;
    clearMessage();
  }

  function renderPreview(p) {
    const s = p.stats;
    const stat = (n, label) =>
      `<div class="admin-import-stat"><span class="admin-import-stat-n">${n}</span>` +
      `<span class="admin-import-stat-label">${label}</span></div>`;
    preview.innerHTML = `
      <div class="admin-import-stats">
        ${stat(s.read, "entries read")}
        ${stat(s.willUpdate, mode === "replace" ? "films retagged" : "films gain tags")}
        ${stat(s.willCreate, "new films")}
        ${stat(s.unchanged, "already current")}
        ${stat(s.skipped, "skipped")}
      </div>
      <p class="admin-import-note">${
        (s.willUpdate + s.willCreate) === 0
          ? "Nothing to stage — every matched film already carries these tags."
          : `Stages ${s.willUpdate + s.willCreate} change${(s.willUpdate + s.willCreate) === 1 ? "" : "s"} for review.`
      }${s.willCreate > 0 ? " New films are created without backdrops — run <span class=\"admin-import-mono\">node scripts/enrich-film-backdrops.js</span> to backfill." : ""}</p>
    `;
  }

  function stageChanges() {
    if (!plan) return;

    // Counter baseline that self-corrects across re-stages: the live FILM
    // counter already includes any adds still pending from a previous stage of
    // this import, so subtract them to recover the true pre-import baseline.
    const { pendingChanges } = getState();
    const priorImport = pendingChanges.filter((c) => c.source === "csv-import");
    const priorAdds = priorImport.filter((c) => c.action === "add").length;
    const counterStart = (archive?._counters?.FILM || 0) - priorAdds;

    const { changes, nextCounter } = buildChanges({
      updates: plan.updates,
      newViewings: plan.newViewings,
      counterStart,
      idYear: new Date().getFullYear(),
    });

    // Replace any previously-staged import changes (idempotent re-stage).
    const kept = pendingChanges.filter((c) => c.source !== "csv-import");
    if (archive && archive._counters) archive._counters.FILM = nextCounter;
    setState({ pendingChanges: [...kept, ...changes], archive });

    const nUpd = plan.stats.willUpdate;
    const nNew = plan.stats.willCreate;
    showMessage(
      `Staged ${changes.length} change${changes.length === 1 ? "" : "s"} — ` +
      `${nUpd} retagged, ${nNew} created. Review in [l] Log, then :w to commit.`,
      "saved"
    );
    setFocusedPane("l");
  }

  function showMessage(text, kind) {
    message.className = `admin-import-message admin-import-message--${kind}`;
    message.textContent = text;
  }
  function clearMessage() {
    message.className = "admin-import-message";
    message.textContent = "";
  }

  // Keyboard: mode buttons, file button, and actions are navigable rows.
  registerPaneNav("r", {
    container: body,
    rowSelector: ".admin-import-mode, .admin-import-file-btn, .admin-action",
    onActivate: (row) => row.click(),
  });

  setModeValue(mode);
}
