// ── Constellation editor ─────────────────────────────────────────────────────
// The Record-pane view behind a constellation row in the Explorer (the
// `constellations` group, or a homed subcollection such as identity ›
// biography). Two halves:
//
//   registry — title / slug / date / status / note, saved as the registry file
//              src/content/constellations/<slug>.md (staged, :w to commit).
//   members  — the items that list this slug in their `constellations` array.
//              Adding or removing a member here edits THAT ITEM's record (the
//              registry never lists members — membership is derived at build
//              time), so each change stages the item file at once and appears
//              in the Log as an M entry. The search box finds any record in the
//              archive by title or id (substring; a leading ~ is fuzzy, as in
//              the Explorer filter).
//
// This is the second door to the same field the item form's chip input edits
// (forms/constellation-field.js): from the item, "which constellations is this
// in"; from here, "which items are in this constellation".

import { getState, setState } from "../state.js";
import { toMarkdown } from "../lib/serializer.js";
import { generateSlug, generateFilePath } from "../lib/slug-generator.js";
import { setRecordActions, makePaneAction } from "../shell.js";
import { applyFieldChrome, setFieldState } from "../forms/field-chrome.js";
import { CONSTELLATION_HOMES } from "../../shared/constellation-homes.js";

const STATUSES = ["published", "draft"];

function registryPath(slug) {
  return `src/content/constellations/${slug}.md`;
}

function slugify(str = "") {
  return str
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/[\s_-]+/g, "-")
    .replace(/^-|-$/g, "");
}

function matches(query, text) {
  if (!query) return true;
  if (query.startsWith("~")) {
    const q = query.slice(1).toLowerCase();
    let i = 0;
    for (const ch of text.toLowerCase()) if (ch === q[i]) i++;
    return i >= q.length;
  }
  return text.toLowerCase().includes(query.toLowerCase());
}

function sortByDateDesc(items) {
  return items.sort((a, b) => {
    const da = a.sort_date ? new Date(a.sort_date) : new Date(0);
    const db = b.sort_date ? new Date(b.sort_date) : new Date(0);
    return db - da;
  });
}

// Find an item wherever it lives in the in-memory archive (series items or a
// subcollection). Returns { item, series, sub } or null.
function locateItem(archive, id) {
  for (const [seriesKey, series] of Object.entries(archive?.series || {})) {
    for (const item of series.items || []) if (item.id === id) return { item, series: seriesKey, sub: null };
    for (const [subKey, sub] of Object.entries(series.subcollections || {})) {
      for (const item of sub.items || []) if (item.id === id) return { item, series: seriesKey, sub: subKey };
    }
  }
  return null;
}

/**
 * Add or remove `slug` on an item's `constellations` array, stage the item's
 * file for commit, and keep the in-memory archive / allItems / registry
 * membership in step. Exported so other views can reuse the same write path.
 * Returns an error string, or null on success.
 */
export function stageMembership(itemId, slug, add) {
  const { archive, allItems, pendingChanges } = getState();
  const found = locateItem(archive, itemId);
  if (!found) return `Record ${itemId} is not in the archive.`;
  const { item, series, sub } = found;
  if (series === "identity") return `Identity records (${itemId}) cannot join constellations.`;

  const list = Array.isArray(item.constellations) ? [...item.constellations] : [];
  const has = list.includes(slug);
  if (add && has) return null;
  if (!add && !has) return null;
  const nextList = add ? [...list, slug] : list.filter(s => s !== slug);

  // The record as it will be written: the archive's copy with the new list.
  const record = { ...item, constellations: nextList };
  let filePath;
  try {
    const itemSlug = item.slug || generateSlug(item.item_type, item);
    filePath = generateFilePath(series, sub, item.id, itemSlug);
  } catch (e) {
    return `Cannot resolve the file for ${itemId}: ${e.message}`;
  }

  // One staged write per record: replace an earlier edit of this item (keeping
  // a slug-change's old path so its delete still happens), never stack two.
  const prior = (pendingChanges || []).find(c => c.id === itemId && c.action === "edit");
  const change = { id: itemId, filePath, content: toMarkdown(record), action: "edit" };
  if (prior?.oldFilePath && prior.oldFilePath !== filePath) change.oldFilePath = prior.oldFilePath;
  const next = (pendingChanges || []).filter(c => !(c.id === itemId && c.action === "edit"));
  next.push(change);

  // In-memory: the series copy, the registry's member list, and allItems.
  item.constellations = nextList;
  const registry = archive.constellations || (archive.constellations = {});
  const c = registry[slug];
  if (c) {
    c.items = (c.items || []).filter(i => i.id !== itemId);
    if (add) c.items.push({ ...item });
    sortByDateDesc(c.items);
  }
  const nextAll = (allItems || []).map(i => i.id === itemId ? { ...i, constellations: nextList } : i);

  setState({ pendingChanges: next, archive, allItems: nextAll });
  return null;
}

/**
 * Render the editor into the Record pane body.
 *
 *   renderConstellation(body, slug | null, { onClose, onItemSelect, onChanged })
 *
 * `slug` null opens the new-constellation form. `onChanged(slug)` fires after
 * any staged change so the Explorer can refresh its counts / rows.
 */
export function renderConstellation(container, slug, callbacks = {}) {
  const { onClose, onItemSelect, onChanged } = callbacks;
  container.innerHTML = "";

  const { archive } = getState();
  const registry = archive?.constellations || {};
  const isNew = !slug;
  const existing = isNew ? null : registry[slug];
  const home = slug ? CONSTELLATION_HOMES[slug] : null;

  if (!isNew && !existing) {
    container.innerHTML = `<div class="admin-empty">No constellation "${escapeHTML(slug)}" in the registry.</div>`;
    return;
  }

  // Working copy of the registry fields.
  const values = {
    slug:         existing?.slug || "",
    title:        existing?.title || "",
    display_date: existing?.display_date ? String(existing.display_date) : "",
    date_start:   existing?.date_start || "",
    date_end:     existing?.date_end || "",
    status:       existing?.status || "published",
    note:         existing?.note || "",
  };
  let slugEdited = !isNew;

  // Topbar breadcrumb
  const breadcrumb = document.getElementById("admin-topbar-breadcrumb");
  if (breadcrumb) {
    breadcrumb.innerHTML = isNew
      ? `<span>constellation</span><span>›</span><span>new</span>`
      : `<span>constellation</span><span>›</span><span>${escapeHTML(slug)}</span>`;
  }

  const body = document.createElement("div");
  body.className = "admin-guide admin-constellation";
  container.appendChild(body);

  const header = document.createElement("div");
  header.className = "admin-form-header";
  header.innerHTML = `<span></span><span>FIELD</span><span>VALUE</span><span>TYPE</span>`;
  body.appendChild(header);
  const sep = document.createElement("div");
  sep.className = "admin-form-header-sep";
  body.appendChild(sep);

  const form = document.createElement("div");
  form.className = "admin-form admin-guide-form admin-constellation-form";
  body.appendChild(form);

  // ── row helpers (the record form's row grammar: state / label / value / type)
  const row = (labelText, control, typeText) => {
    const field = document.createElement("div");
    field.className = "admin-field admin-field--guide admin-field--constellation-meta";
    const label = document.createElement("label");
    label.textContent = labelText;
    control.setAttribute("aria-label", labelText);
    const typeEl = document.createElement("span");
    typeEl.className = "admin-field-type";
    typeEl.textContent = typeText;
    field.append(label, control, typeEl);
    return field;
  };
  const textInput = (key, { placeholder = "", readOnly = false, onInput } = {}) => {
    const input = document.createElement("input");
    input.type = "text";
    input.value = values[key];
    input.placeholder = placeholder;
    input.readOnly = readOnly;
    input.spellcheck = false;
    const initial = values[key];
    input.addEventListener("input", () => {
      values[key] = input.value;
      setFieldState(input.parentElement, input.value !== initial ? "modified" : null);
      onInput?.(input.value);
    });
    return input;
  };

  // ── registry ───────────────────────────────────────────────────────────────
  const regPanel = panel("registry");

  const titleIn = textInput("title", {
    placeholder: "e.g. Austin → SF",
    onInput: (v) => { if (!slugEdited) { values.slug = suggestSlug(v); slugIn.value = values.slug; syncSlugError(); } },
  });
  regPanel.appendChild(row("title", titleIn, "text"));

  const slugIn = textInput("slug", { placeholder: "e.g. 2026-atx-sf", readOnly: !isNew, onInput: () => { slugEdited = true; syncSlugError(); } });
  if (!isNew) slugIn.title = "The slug names the registry file and every member's reference — it is fixed once created.";
  regPanel.appendChild(row("slug", slugIn, isNew ? "slug" : "locked"));

  const slugError = document.createElement("div");
  slugError.className = "admin-const-create-error admin-constellation-error";
  regPanel.appendChild(slugError);

  regPanel.appendChild(row("date", textInput("display_date", { placeholder: "e.g. June 2026 — as it prints" }), "text"));

  const statusSel = document.createElement("select");
  for (const s of STATUSES) {
    const o = document.createElement("option");
    o.value = s; o.textContent = s;
    if (s === values.status) o.selected = true;
    statusSel.appendChild(o);
  }
  statusSel.addEventListener("change", () => { values.status = statusSel.value; setFieldState(statusSel.parentElement, "modified"); });
  regPanel.appendChild(row("status", statusSel, "select"));

  const noteTa = document.createElement("textarea");
  noteTa.rows = 3;
  noteTa.value = values.note;
  noteTa.placeholder = home
    ? "The paragraph shown in the layer-meta under the title."
    : "A short note on what this constellation gathers — the layer-meta's voice.";
  noteTa.spellcheck = true;
  const grow = () => { noteTa.style.height = "auto"; noteTa.style.height = `${noteTa.scrollHeight + 2}px`; };
  noteTa.addEventListener("input", () => {
    values.note = noteTa.value;
    setFieldState(noteTa.parentElement, noteTa.value !== (existing?.note || "") ? "modified" : null);
    grow();
  });
  requestAnimationFrame(grow);
  regPanel.appendChild(row("note", noteTa, "text+"));

  const regHint = document.createElement("p");
  regHint.className = "admin-guide-hint";
  regHint.innerHTML = home
    ? `A <em>homed</em> constellation: it lives at <code>/${home.series}/${home.subcollection}/</code> and never prints on its members' cards. ` +
      `Saving stages <code>${registryPath(slug)}</code> — run <kbd>:w</kbd> to commit.`
    : `Public at <code>/constellations/${escapeHTML(values.slug || "<slug>")}/</code>. ` +
      `Saving stages <code>${escapeHTML(registryPath(values.slug || "<slug>"))}</code> — run <kbd>:w</kbd> to commit.`;
  regPanel.appendChild(regHint);
  form.appendChild(regPanel);

  function suggestSlug(title) {
    const base = slugify(title);
    return base;
  }
  function syncSlugError() {
    if (!isNew) return;
    const s = values.slug.trim();
    if (!s) { slugError.textContent = ""; return; }
    if (registry[s]) slugError.textContent = `"${s}" already exists — open it from the Explorer instead.`;
    else if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(s)) slugError.textContent = "Slug must be kebab-case (a–z, 0–9, hyphens). Year-first for dated ones (2026-atx-sf).";
    else slugError.textContent = "";
  }

  // ── members ────────────────────────────────────────────────────────────────
  const memPanel = panel("members");
  const memberList = document.createElement("div");
  memberList.className = "admin-const-members";
  memPanel.appendChild(memberList);

  const memberHint = document.createElement("p");
  memberHint.className = "admin-guide-hint";
  memberHint.innerHTML = isNew
    ? `Save the registry record first; then members can be added here (or from any item's constellations field).`
    : `Each add or remove edits that item's record and stages it at once (an <code>M</code> in the Log) — run <kbd>:w</kbd> to commit. ` +
      `Newest first, as the site orders them.`;
  memPanel.appendChild(memberHint);

  function renderMembers() {
    memberList.innerHTML = "";
    const c = getState().archive?.constellations?.[slug];
    const items = c ? sortByDateDesc([...(c.items || [])]) : [];
    if (!items.length) {
      const empty = document.createElement("div");
      empty.className = "admin-const-members-empty";
      empty.textContent = isNew ? "—" : "no members yet — search below to add";
      memberList.appendChild(empty);
      return;
    }
    for (const item of items) memberList.appendChild(memberRow(item));
  }

  function memberRow(item) {
    const r = document.createElement("div");
    r.className = "admin-const-member";
    r.dataset.id = item.id;

    const idEl = document.createElement("span");
    idEl.className = "admin-const-member-id";
    idEl.textContent = item.id;

    const titleBtn = document.createElement("button");
    titleBtn.type = "button";
    titleBtn.className = "admin-const-member-title";
    titleBtn.textContent = item.title || item.id;
    titleBtn.title = "Open this record";
    titleBtn.addEventListener("click", () => {
      const found = locateItem(getState().archive, item.id);
      if (found && onItemSelect) onItemSelect({ ...found.item, _series: found.series, _sub: found.sub });
    });

    const where = document.createElement("span");
    where.className = "admin-const-member-where";
    where.textContent = [item.series, item.subcollection].filter(Boolean).join(" › ");

    const date = document.createElement("span");
    date.className = "admin-const-member-date";
    date.textContent = item.display_date || item.sort_date || "";

    const x = document.createElement("button");
    x.type = "button";
    x.className = "admin-const-chip-remove admin-const-member-remove";
    x.textContent = "×";
    x.setAttribute("aria-label", `Remove ${item.id} from ${slug}`);
    x.addEventListener("click", () => {
      const err = stageMembership(item.id, slug, false);
      if (err) { showInlineMessage(body, err, "error"); return; }
      renderMembers();
      showInlineMessage(body, `Removed ${item.id} — its record is staged. Run :w to commit.`, "saved");
      onChanged?.(slug);
    });

    r.append(idEl, titleBtn, where, date, x);
    return r;
  }

  renderMembers();

  // ── add: search the archive ────────────────────────────────────────────────
  if (!isNew) {
    const searchWrap = document.createElement("div");
    searchWrap.className = "admin-input-wrap admin-const-input-wrap admin-const-search-wrap";
    const search = document.createElement("input");
    search.type = "text";
    search.placeholder = "add a record — type a title or id (~ for fuzzy)…";
    search.autocomplete = "off";
    search.spellcheck = false;
    search.setAttribute("aria-label", "Search records to add");
    searchWrap.appendChild(search);
    const suggest = document.createElement("div");
    suggest.className = "admin-const-suggest";
    suggest.hidden = true;
    searchWrap.appendChild(suggest);
    memPanel.appendChild(searchWrap);

    let rows = [];
    let focusIdx = -1;
    const MAX = 40;

    const closeSuggest = () => { suggest.hidden = true; suggest.innerHTML = ""; rows = []; focusIdx = -1; };
    const setFocus = (i) => {
      focusIdx = i;
      rows.forEach((r, j) => r.el.classList.toggle("is-active", j === i));
      if (i >= 0) rows[i].el.scrollIntoView({ block: "nearest" });
    };
    const addMember = (id) => {
      const err = stageMembership(id, slug, true);
      if (err) { showInlineMessage(body, err, "error"); return; }
      renderMembers();
      showInlineMessage(body, `Added ${id} — its record is staged. Run :w to commit.`, "saved");
      onChanged?.(slug);
      search.value = "";
      closeSuggest();
      search.focus();
    };

    const renderSuggest = () => {
      const q = search.value.trim();
      const members = new Set((getState().archive?.constellations?.[slug]?.items || []).map(i => i.id));
      const all = getState().allItems || [];
      // Identity records (cv, contact) are out of the field's scope — the item
      // form never offers them the chip, so the search never offers them here.
      const hits = q
        ? all.filter(i => i._series !== "identity" && !members.has(i.id) && matches(q, `${i.title || ""} ${i.id}`))
        : [];
      suggest.innerHTML = "";
      rows = [];
      for (const item of hits.slice(0, MAX)) {
        const r = document.createElement("div");
        r.className = "admin-const-suggest-row";
        const idEl = document.createElement("span");
        idEl.className = "admin-const-suggest-slug";
        idEl.textContent = item.id;
        const t = document.createElement("span");
        t.className = "admin-const-suggest-title";
        t.textContent = item.title || item.id;
        const meta = document.createElement("span");
        meta.className = "admin-const-suggest-count";
        meta.textContent = [item._series, item._sub, item.display_date || item.sort_date].filter(Boolean).join(" · ");
        r.append(idEl, t, meta);
        r.addEventListener("mousedown", (e) => { e.preventDefault(); addMember(item.id); });
        suggest.appendChild(r);
        rows.push({ el: r, id: item.id });
      }
      if (q && hits.length > MAX) {
        const more = document.createElement("div");
        more.className = "admin-const-suggest-row admin-const-suggest-row--more";
        more.textContent = `${hits.length - MAX} more — keep typing to narrow`;
        suggest.appendChild(more);
      }
      suggest.hidden = rows.length === 0 && !(q && hits.length > MAX);
      setFocus(rows.length ? 0 : -1);
    };

    search.addEventListener("input", renderSuggest);
    search.addEventListener("focus", renderSuggest);
    search.addEventListener("blur", () => setTimeout(closeSuggest, 120));
    search.addEventListener("keydown", (e) => {
      if (suggest.hidden) {
        if (e.key === "ArrowDown") { renderSuggest(); e.preventDefault(); }
        return;
      }
      if (e.key === "ArrowDown") { e.preventDefault(); setFocus(Math.min(focusIdx + 1, rows.length - 1)); }
      else if (e.key === "ArrowUp") { e.preventDefault(); setFocus(Math.max(focusIdx - 1, 0)); }
      else if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); if (rows[focusIdx]) addMember(rows[focusIdx].id); }
      else if (e.key === "Escape") { e.stopPropagation(); closeSuggest(); }
    });
  }

  form.appendChild(memPanel);
  applyFieldChrome(form);

  // ── actions ────────────────────────────────────────────────────────────────
  setRecordActions([
    makePaneAction({
      label: "save",
      title: "Stage the registry record for commit (then :w to commit)",
      onClick: () => saveRegistry(),
    }),
    makePaneAction({
      label: "cancel",
      title: "Close (:q) — staged member changes stay staged",
      onClick: () => { if (onClose) onClose(); },
    }),
  ]);

  function saveRegistry() {
    const s = values.slug.trim();
    const title = values.title.trim();
    if (!title) { showInlineMessage(body, "A title is needed.", "error"); return; }
    if (isNew) {
      syncSlugError();
      if (!s || slugError.textContent) { showInlineMessage(body, slugError.textContent || "A slug is needed.", "error"); return; }
    }
    const record = {
      slug: s,
      title,
      status: values.status,
      display_date: values.display_date.trim(),
      date_start: values.date_start,
      date_end: values.date_end,
      note: values.note.trim(),
    };
    const path = registryPath(s);
    const { pendingChanges, archive: a } = getState();
    const next = (pendingChanges || []).filter(c => c.filePath !== path);
    next.push({ id: `constellation ${s}`, filePath: path, content: toMarkdown(record), action: isNew ? "add" : "edit" });

    if (a) {
      a.constellations = a.constellations || {};
      const prev = a.constellations[s];
      a.constellations[s] = { ...(prev || {}), ...record, items: prev?.items || [] };
    }
    setState({ pendingChanges: next, archive: a });
    showInlineMessage(body, `Saved ${s} — staged for commit. Run :w to commit.`, "saved");
    onChanged?.(s);
    // A new constellation becomes an existing one: reopen so members can be added.
    if (isNew) renderConstellation(container, s, callbacks);
  }
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

function showInlineMessage(body, text, kind) {
  body.querySelector(".admin-inline-message")?.remove();
  const msg = document.createElement("div");
  msg.className = `admin-inline-message admin-inline-message--${kind}`;
  msg.textContent = text;
  body.insertAdjacentElement("afterbegin", msg);
}

function escapeHTML(s) {
  return String(s).replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}
