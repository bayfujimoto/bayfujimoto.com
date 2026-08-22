// Constellation intake — the chip/token input assigning an item to one or more
// constellations (decisions.md → "Constellations: cross-series grouping";
// docs/admin-interface.md → "Constellation intake").
//
// The registry (src/content/constellations/) is the ONLY source of assignable
// values: typing filters registry slugs and titles, and free text never lands
// in the item's `constellations` array except through the inline create path,
// which stages a new registry file into the same commit as the item. That is
// what keeps the field a controlled vocabulary rather than a second tag field.

import { getState, setState } from "../state.js";
import { toMarkdown } from "../lib/serializer.js";

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

// Live registry view: build-time constellations from the admin archive, plus
// any created this session (they're written into state.archive.constellations
// when staged, so autocomplete sees them before the commit).
function getRegistry() {
  const { archive } = getState();
  return (archive && archive.constellations) || {};
}

// Substring match by default; a leading "~" switches to fuzzy (subsequence)
// matching — the same convention as the Explorer filter.
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

export function makeConstellationField(field, value, onChange, getValue) {
  const slugs = Array.isArray(value) ? [...value] : [];

  const wrapper = document.createElement("div");
  // The --constellation modifier opts this row out of the click-to-edit toggle
  // (edit-toggle.js) — the chip widget manages its own input — and labels the
  // type slot (field-chrome.js).
  wrapper.className = "admin-field admin-field--constellation";
  if (field.depth === "full") wrapper.dataset.depth = "full";

  const label = document.createElement("label");
  label.textContent = field.label;
  wrapper.appendChild(label);

  const body = document.createElement("div");
  body.className = "admin-const";

  const chips = document.createElement("div");
  chips.className = "admin-const-chips";
  body.appendChild(chips);

  const inputWrap = document.createElement("div");
  inputWrap.className = "admin-input-wrap admin-const-input-wrap";
  const input = document.createElement("input");
  input.type = "text";
  input.placeholder = "type to search constellations…";
  input.autocomplete = "off";
  input.spellcheck = false;
  input.id = `field-${field.id.replace(/\./g, "-")}`;
  label.setAttribute("for", input.id);
  inputWrap.appendChild(input);

  const suggest = document.createElement("div");
  suggest.className = "admin-const-suggest";
  suggest.hidden = true;
  inputWrap.appendChild(suggest);

  body.appendChild(inputWrap);

  // Inline create sub-form container (replaces the suggestion list when open)
  const createForm = document.createElement("div");
  createForm.className = "admin-const-create";
  createForm.hidden = true;
  body.appendChild(createForm);

  wrapper.appendChild(body);

  if (field.hint) {
    const hint = document.createElement("div");
    hint.className = "field-hint";
    hint.textContent = field.hint;
    wrapper.appendChild(hint);
  }

  const commit = () => onChange(field.id, [...slugs]);

  function renderChips() {
    chips.innerHTML = "";
    slugs.forEach((slug, i) => {
      const registry = getRegistry();
      const chip = document.createElement("span");
      chip.className = "admin-const-chip" + (registry[slug] ? "" : " is-unresolved");
      chip.title = registry[slug]?.title || `${slug} (no registry record)`;

      const text = document.createElement("span");
      text.className = "admin-const-chip-slug";
      text.textContent = slug;
      chip.appendChild(text);

      const x = document.createElement("button");
      x.type = "button";
      x.className = "admin-const-chip-remove";
      x.textContent = "×";
      x.setAttribute("aria-label", `Remove constellation ${slug}`);
      x.addEventListener("click", () => {
        slugs.splice(i, 1);
        renderChips();
        commit();
      });
      chip.appendChild(x);
      chips.appendChild(chip);
    });
  }

  // ── Suggestions ────────────────────────────────────────────────────────────

  let focusIdx = -1;
  let rows = []; // [{ el, slug | create: true }]

  function closeSuggest() {
    suggest.hidden = true;
    suggest.innerHTML = "";
    rows = [];
    focusIdx = -1;
  }

  function assign(slug) {
    if (!slugs.includes(slug)) {
      slugs.push(slug);
      renderChips();
      commit();
    }
    input.value = "";
    closeSuggest();
    input.focus();
  }

  function renderSuggest() {
    const q = input.value.trim();
    const registry = getRegistry();
    const entries = Object.values(registry)
      .filter(c => !slugs.includes(c.slug))
      .filter(c => matches(q, `${c.slug} ${c.title}`))
      .sort((a, b) => a.slug.localeCompare(b.slug));

    suggest.innerHTML = "";
    rows = [];

    entries.forEach(c => {
      const row = document.createElement("div");
      row.className = "admin-const-suggest-row";
      const name = document.createElement("span");
      name.className = "admin-const-suggest-slug";
      name.textContent = c.slug;
      const title = document.createElement("span");
      title.className = "admin-const-suggest-title";
      title.textContent = c.title;
      const count = document.createElement("span");
      count.className = "admin-const-suggest-count";
      const n = c.items?.length ?? 0;
      count.textContent = `${n} item${n === 1 ? "" : "s"}`;
      row.appendChild(name);
      row.appendChild(title);
      row.appendChild(count);
      row.addEventListener("mousedown", (e) => { e.preventDefault(); assign(c.slug); });
      suggest.appendChild(row);
      rows.push({ el: row, slug: c.slug });
    });

    // The last row is always the create path when there's a query with no
    // exact slug match — a constellation never has to be created outside the
    // flow of cataloguing the item that prompted it.
    const exact = q && registry[q.startsWith("~") ? q.slice(1) : q];
    if (q && !exact) {
      const row = document.createElement("div");
      row.className = "admin-const-suggest-row admin-const-suggest-row--create";
      row.textContent = `+ new constellation "${q.replace(/^~/, "")}"`;
      row.addEventListener("mousedown", (e) => { e.preventDefault(); openCreate(q.replace(/^~/, "")); });
      suggest.appendChild(row);
      rows.push({ el: row, create: true, query: q.replace(/^~/, "") });
    }

    suggest.hidden = rows.length === 0;
    setFocus(rows.length ? 0 : -1);
  }

  function setFocus(i) {
    focusIdx = i;
    rows.forEach((r, j) => r.el.classList.toggle("is-active", j === i));
    if (i >= 0) rows[i].el.scrollIntoView({ block: "nearest" });
  }

  function activate(i) {
    const r = rows[i];
    if (!r) return;
    if (r.create) openCreate(r.query);
    else assign(r.slug);
  }

  input.addEventListener("input", renderSuggest);
  input.addEventListener("focus", renderSuggest);
  input.addEventListener("blur", () => {
    // Delay so a mousedown on a row lands before the list closes.
    setTimeout(closeSuggest, 120);
  });
  input.addEventListener("keydown", (e) => {
    if (suggest.hidden) {
      if (e.key === "ArrowDown") { renderSuggest(); e.preventDefault(); }
      return;
    }
    if (e.key === "ArrowDown") { e.preventDefault(); setFocus(Math.min(focusIdx + 1, rows.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setFocus(Math.max(focusIdx - 1, 0)); }
    else if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); activate(focusIdx); }
    else if (e.key === "Escape") {
      // First Esc closes the list; modes.js then handles the next Esc (blur →
      // NORMAL). stopPropagation keeps this one from doing both at once.
      e.stopPropagation();
      closeSuggest();
    }
  });

  // ── Inline create ──────────────────────────────────────────────────────────

  function suggestSlug(title) {
    // Year-first kebab-case for dated constellations (2026-atx-sf). The year
    // comes from the item being catalogued (its sort date), falling back to
    // the current year; thematic constellations can clear it by hand.
    const year = (getValue?.("sort_date") || "").slice(0, 4) ||
                 String(new Date().getFullYear());
    const base = slugify(title);
    return base.startsWith(year) ? base : `${year}-${base}`;
  }

  function openCreate(prefillTitle) {
    closeSuggest();
    createForm.hidden = false;
    createForm.innerHTML = "";

    const mkRow = (labelText, el2) => {
      const row = document.createElement("div");
      row.className = "admin-const-create-row";
      const l = document.createElement("span");
      l.className = "admin-const-create-label";
      l.textContent = labelText;
      row.appendChild(l);
      row.appendChild(el2);
      return row;
    };

    const titleIn = document.createElement("input");
    titleIn.type = "text";
    titleIn.value = prefillTitle || "";
    titleIn.placeholder = "e.g. Austin → SF";

    const slugIn = document.createElement("input");
    slugIn.type = "text";
    slugIn.value = suggestSlug(prefillTitle || "");
    slugIn.placeholder = "e.g. 2026-atx-sf";
    slugIn.spellcheck = false;

    let slugEdited = false;
    slugIn.addEventListener("input", () => { slugEdited = true; syncError(); });
    titleIn.addEventListener("input", () => {
      if (!slugEdited) slugIn.value = suggestSlug(titleIn.value);
      syncError();
    });

    const dateIn = document.createElement("input");
    dateIn.type = "text";
    dateIn.placeholder = "e.g. June 2026 (optional)";

    const noteIn = document.createElement("textarea");
    noteIn.placeholder = "a short note on what this constellation gathers (optional)";
    noteIn.rows = 2;

    const error = document.createElement("div");
    error.className = "admin-const-create-error";

    const syncError = () => {
      const slug = slugIn.value.trim();
      if (!slug) { error.textContent = ""; confirmBtn.disabled = true; return; }
      if (getRegistry()[slug]) {
        error.textContent = `"${slug}" already exists — select it from the list instead.`;
        confirmBtn.disabled = true;
      } else if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) {
        error.textContent = "Slug must be kebab-case (a–z, 0–9, hyphens).";
        confirmBtn.disabled = true;
      } else {
        error.textContent = "";
        confirmBtn.disabled = !titleIn.value.trim();
      }
    };

    const actions = document.createElement("div");
    actions.className = "admin-const-create-actions";

    const confirmBtn = document.createElement("button");
    confirmBtn.type = "button";
    confirmBtn.className = "admin-const-create-confirm";
    confirmBtn.textContent = "create + assign";
    confirmBtn.addEventListener("click", () => {
      const slug = slugIn.value.trim();
      const title = titleIn.value.trim();
      if (!slug || !title || getRegistry()[slug]) return;

      const record = {
        slug,
        title,
        status: "published",
        display_date: dateIn.value.trim(),
        note: noteIn.value.trim(),
      };

      // Stage the registry file as an A entry in the Log, bundled into the same
      // commit as the item being catalogued.
      const { pendingChanges, archive } = getState();
      setState({
        pendingChanges: [...pendingChanges, {
          id: `constellation ${slug}`,
          filePath: `src/content/constellations/${slug}.md`,
          content: toMarkdown(record),
          action: "add",
        }],
      });

      // Make it immediately assignable/autocompletable this session.
      if (archive) {
        archive.constellations = archive.constellations || {};
        archive.constellations[slug] = { ...record, items: [] };
        setState({ archive });
      }

      closeCreate();
      assign(slug);
    });

    const cancelBtn = document.createElement("button");
    cancelBtn.type = "button";
    cancelBtn.className = "admin-const-create-cancel";
    cancelBtn.textContent = "cancel";
    cancelBtn.addEventListener("click", () => { closeCreate(); input.focus(); });

    actions.appendChild(confirmBtn);
    actions.appendChild(cancelBtn);

    createForm.appendChild(mkRow("title", titleIn));
    createForm.appendChild(mkRow("slug", slugIn));
    createForm.appendChild(mkRow("date", dateIn));
    createForm.appendChild(mkRow("note", noteIn));
    createForm.appendChild(error);
    createForm.appendChild(actions);

    createForm.addEventListener("keydown", (e) => {
      if (e.key === "Escape") { e.stopPropagation(); closeCreate(); input.focus(); }
    });

    syncError();
    titleIn.focus();
    titleIn.select();
  }

  function closeCreate() {
    createForm.hidden = true;
    createForm.innerHTML = "";
  }

  renderChips();

  return wrapper;
}
