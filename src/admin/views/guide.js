// ── Guide editor ─────────────────────────────────────────────────────────────
// The Record-pane view behind the top-level [*] Guide node in the Explorer.
// A plain Markdown textarea for composing the site's guide / finding aid. Save
// stages src/content/guide.md into the pending changes (it shows in the Log and
// commits with :w, same as any record); the build reads that file back into
// archive.guide.content on the next deploy.

import { getState, setState } from "../state.js";
import { setRecordActions, makePaneAction } from "../shell.js";

const GUIDE_PATH = "src/content/guide.md";

export function renderGuide(container, callbacks = {}) {
  const { onClose } = callbacks;
  container.innerHTML = "";

  // Prefer a pending (staged, unsaved-to-git) edit if one exists, else the
  // content that came from the build.
  const { archive, pendingChanges } = getState();
  const staged = (pendingChanges || []).find(c => c.filePath === GUIDE_PATH);
  const initial = staged ? staged.content : (archive?.guide?.content || "");

  // Topbar breadcrumb
  const breadcrumb = document.getElementById("admin-topbar-breadcrumb");
  if (breadcrumb) breadcrumb.innerHTML = `<span>guide</span>`;

  const body = document.createElement("div");
  body.className = "admin-guide";
  container.appendChild(body);

  const hint = document.createElement("p");
  hint.className = "admin-guide-hint";
  hint.innerHTML =
    `Compose the guide in Markdown. Saving stages <code>${GUIDE_PATH}</code> ` +
    `for commit — run <kbd>:w</kbd> to publish.`;
  body.appendChild(hint);

  const textarea = document.createElement("textarea");
  textarea.className = "admin-guide-editor";
  textarea.id = "guide-editor";
  textarea.spellcheck = false;
  textarea.setAttribute("aria-label", "Guide markdown");
  textarea.value = initial;
  body.appendChild(textarea);

  // Top-border actions ([save] [cancel]) — mirror the edit-item view.
  setRecordActions([
    makePaneAction({
      label: "save",
      title: "Stage the guide for commit (then :w to commit)",
      onClick: () => saveGuide(body, textarea.value),
    }),
    makePaneAction({
      label: "cancel",
      title: "Close without staging (:q)",
      onClick: () => { if (onClose) onClose(); },
    }),
  ]);
}

function saveGuide(body, content) {
  const { pendingChanges, archive } = getState();

  // Replace any prior staged guide edit so we never queue two writes to the file.
  const next = (pendingChanges || []).filter(c => c.filePath !== GUIDE_PATH);
  next.push({ id: "guide", filePath: GUIDE_PATH, content, action: "edit" });

  // Keep the in-memory guide content in sync so reopening the editor shows the
  // just-typed text rather than the last-built version.
  const nextArchive = archive
    ? { ...archive, guide: { ...(archive.guide || {}), content } }
    : archive;

  setState({ pendingChanges: next, archive: nextArchive });
  showInlineMessage(body, "Saved guide — staged for commit. Run :w to commit.", "saved");
}

function showInlineMessage(body, text, kind) {
  body.querySelector(".admin-inline-message")?.remove();
  const msg = document.createElement("div");
  msg.className = `admin-inline-message admin-inline-message--${kind}`;
  msg.textContent = text;
  body.insertAdjacentElement("afterbegin", msg);
}
