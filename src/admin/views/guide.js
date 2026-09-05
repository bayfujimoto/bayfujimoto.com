// ── Guide editor ─────────────────────────────────────────────────────────────
// The Record-pane view behind the top-level [*] Guide node in the Explorer.
// A form in the record form's own row grammar: one row per desk object with
// its description (the note on that object's frame of the Guide card), the
// key's "holds" line, and the intro Markdown (the key frame's note). Save
// serializes front matter + body back to src/content/guide.md and stages it
// into the pending changes (it shows in the Log and commits with :w, same as
// any record); the build reads the file back into archive.guide on the next
// deploy. docs/guide-inspection-card-plan.md → "Admin".

import YAML from "js-yaml";
import { getState, setState } from "../state.js";
import { setRecordActions, makePaneAction } from "../shell.js";
import { applyFieldChrome, setFieldState } from "../forms/field-chrome.js";

const GUIDE_PATH = "src/content/guide.md";

// Frame order as the card shows it. Labels are read from the built frames when
// present so the form and the site agree; these are the fallbacks.
const OBJECT_ROWS = [
  { key: "key",          label: "Guide",        object: "key" },
  { key: "identity",     label: "Identity",     object: "dossier" },
  { key: "labor",        label: "Labor",        object: "bundle" },
  { key: "consumption",  label: "Consumption",  object: "sphere" },
  { key: "creation",     label: "Creation",     object: "stamp" },
  { key: "accumulation", label: "Accumulation", object: "box" },
];

// Split a guide.md string into { objects, intro }. Tolerates a file with no
// front matter (everything is intro) and malformed YAML (reported, intro kept).
export function parseGuideSource(raw) {
  const text = String(raw || "");
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!m) return { objects: {}, intro: text.trim(), error: null };
  let data = {};
  let error = null;
  try {
    data = YAML.load(m[1]) || {};
  } catch (e) {
    error = e.message;
  }
  const objects = {};
  for (const [k, v] of Object.entries(data.objects || {})) {
    objects[k] = {
      holds: typeof v?.holds === "string" ? v.holds : "",
      description: typeof v?.description === "string" ? v.description : "",
    };
  }
  return { objects, intro: m[2].trim(), error };
}

// Assemble guide.md from the form's values. Empty fields are omitted rather
// than written as "". Long descriptions fold (>-) for a readable file.
export function serializeGuideSource(objects, intro) {
  const fm = { objects: {} };
  for (const row of OBJECT_ROWS) {
    const o = objects[row.key] || {};
    const entry = {};
    if (o.holds && o.holds.trim()) entry.holds = o.holds.trim();
    if (o.description && o.description.trim()) entry.description = o.description.trim();
    if (Object.keys(entry).length) fm.objects[row.key] = entry;
  }
  const yaml = YAML.dump(fm, { lineWidth: 78, quotingType: '"', forceQuotes: false });
  return `---\n${yaml}---\n${(intro || "").trim()}\n`;
}

export function renderGuide(container, callbacks = {}) {
  const { onClose } = callbacks;
  container.innerHTML = "";

  // Prefer a pending (staged, unsaved-to-git) edit if one exists, else the
  // content that came from the build.
  const { archive, pendingChanges } = getState();
  const staged = (pendingChanges || []).find(c => c.filePath === GUIDE_PATH);
  const source = staged
    ? parseGuideSource(staged.content)
    : (archive?.guide?.objects
        ? { objects: archive.guide.objects, intro: archive.guide.intro || "", error: null }
        : parseGuideSource(archive?.guide?.content || ""));
  const frames = archive?.guide?.frames || [];

  // Topbar breadcrumb
  const breadcrumb = document.getElementById("admin-topbar-breadcrumb");
  if (breadcrumb) breadcrumb.innerHTML = `<span>guide</span>`;

  const body = document.createElement("div");
  body.className = "admin-guide";
  container.appendChild(body);

  if (source.error) {
    showInlineMessage(body, `Front matter could not be parsed (${source.error}); showing what could be read.`, "error");
  }

  // Header row + separator, as the record form has.
  const header = document.createElement("div");
  header.className = "admin-form-header";
  header.innerHTML = `<span></span><span>FIELD</span><span>VALUE</span><span>TYPE</span>`;
  body.appendChild(header);
  const sep = document.createElement("div");
  sep.className = "admin-form-header-sep";
  body.appendChild(sep);

  // Working copy of the values, updated on input.
  const values = {};
  for (const row of OBJECT_ROWS) {
    const o = source.objects[row.key] || {};
    values[row.key] = { holds: o.holds || "", description: o.description || "" };
  }
  let intro = source.intro || "";

  const form = document.createElement("div");
  form.className = "admin-form admin-guide-form";
  body.appendChild(form);

  // A textarea row: [state] [label] [textarea] [type]. Grows with its text.
  const textRow = (labelText, value, { placeholder = "", type = "text+", rows = 3, onInput }) => {
    const field = document.createElement("div");
    field.className = "admin-field admin-field--guide";
    const label = document.createElement("label");
    label.textContent = labelText;
    const ta = document.createElement("textarea");
    ta.rows = rows;
    ta.value = value;
    ta.placeholder = placeholder;
    ta.spellcheck = true;
    ta.setAttribute("aria-label", labelText);
    const grow = () => { ta.style.height = "auto"; ta.style.height = `${ta.scrollHeight + 2}px`; };
    ta.addEventListener("input", () => {
      onInput(ta.value);
      setFieldState(field, ta.value !== value ? "modified" : null);
      grow();
    });
    requestAnimationFrame(grow);
    const typeEl = document.createElement("span");
    typeEl.className = "admin-field-type";
    typeEl.textContent = type;
    field.append(label, ta, typeEl);
    return field;
  };

  // ── objects ────────────────────────────────────────────────────────────────
  const objectsPanel = panel("objects");
  for (const row of OBJECT_ROWS) {
    const frame = frames.find(f => f.key === row.key);
    const title = frame?.label || row.label;
    const noun = frame?.object || row.object;
    if (row.key === "key") {
      objectsPanel.appendChild(textRow(`${title} · holds`, values.key.holds, {
        type: "text", rows: 1,
        placeholder: "finding aid, sitemap, site notes",
        onInput: (v) => { values.key.holds = v; },
      }));
      continue;
    }
    objectsPanel.appendChild(textRow(`${title} (${noun})`, values[row.key].description, {
      type: "markdown", rows: 3,
      placeholder: `What the ${noun} is and what ${title} holds.`,
      onInput: (v) => { values[row.key].description = v; },
    }));
  }
  form.appendChild(objectsPanel);

  // ── intro ──────────────────────────────────────────────────────────────────
  const introPanel = panel("intro");
  introPanel.appendChild(textRow("intro", intro, {
    type: "markdown", rows: 10,
    placeholder: "The key frame's note — Markdown.",
    onInput: (v) => { intro = v; },
  }));
  const hint = document.createElement("p");
  hint.className = "admin-guide-hint";
  hint.innerHTML =
    `Each object's text is the note on its frame of the Guide card; the intro is the key's. ` +
    `Saving stages <code>${GUIDE_PATH}</code> for commit — run <kbd>:w</kbd> to publish.`;
  introPanel.appendChild(hint);
  form.appendChild(introPanel);

  applyFieldChrome(form);

  // Top-border actions ([save] [cancel]) — mirror the edit-item view.
  setRecordActions([
    makePaneAction({
      label: "save",
      title: "Stage the guide for commit (then :w to commit)",
      onClick: () => saveGuide(body, serializeGuideSource(values, intro)),
    }),
    makePaneAction({
      label: "cancel",
      title: "Close without staging (:q)",
      onClick: () => { if (onClose) onClose(); },
    }),
  ]);
}

function panel(labelText) {
  const p = document.createElement("div");
  p.className = "admin-panel";
  const heading = document.createElement("div");
  heading.className = "admin-panel-heading";
  const marker = document.createElement("span");
  marker.className = "admin-panel-heading-marker";
  marker.setAttribute("aria-hidden", "true");
  const lbl = document.createElement("span");
  lbl.className = "admin-panel-heading-label";
  lbl.textContent = labelText;
  heading.append(marker, lbl);
  p.appendChild(heading);
  return p;
}

function saveGuide(body, content) {
  const { pendingChanges, archive } = getState();

  // Replace any prior staged guide edit so we never queue two writes to the file.
  const next = (pendingChanges || []).filter(c => c.filePath !== GUIDE_PATH);
  next.push({ id: "guide", filePath: GUIDE_PATH, content, action: "edit" });

  // Keep the in-memory guide in sync so reopening the editor shows the
  // just-typed text rather than the last-built version.
  const parsed = parseGuideSource(content);
  const nextArchive = archive
    ? { ...archive, guide: { ...(archive.guide || {}), content, intro: parsed.intro, objects: parsed.objects } }
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
