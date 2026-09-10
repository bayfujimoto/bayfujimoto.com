/**
 * makeDatePicker — custom terminal-style calendar, matching makeSelect's chrome.
 *
 * Replaces the native <input type="date"> so the popup is themed to the admin
 * aesthetic instead of the OS default. The field itself is a real text input:
 * the date can be typed (ISO, US slash, YYYYMMDD, or "February 28, 2025" all
 * parse) or picked from the calendar, which the ▦ button toggles.
 * Value is an ISO date string ("YYYY-MM-DD") or "".
 *
 * @param {string} initialValue
 * @param {(value: string) => void} onChange
 * @param {{ placeholder?: string }} [config]
 * @returns {{ el: HTMLElement, input: HTMLInputElement, getValue: () => string, setValue: (v: string) => void }}
 */

const MONTHS = ["January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"];
const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];

function parseISO(v) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v || "");
  return m ? { y: +m[1], mo: +m[2] - 1, d: +m[3] } : null;
}
function toISO(y, mo, d) {
  return `${y}-${String(mo + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

// Reject impossible dates (Feb 30, month 13) by round-tripping through Date.
function validParts(y, mo1, d) {
  if (!(y >= 1 && mo1 >= 1 && mo1 <= 12 && d >= 1 && d <= 31)) return "";
  const dt = new Date(y, mo1 - 1, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== mo1 - 1 || dt.getDate() !== d) return "";
  return toISO(y, mo1 - 1, d);
}

/**
 * Parse what the user typed into an ISO date, forgivingly.
 * Accepts: 2025-02-28 · 2025/2/28 · 2/28/2025 · 2/28/25 · 20250228 ·
 *          "February 28, 2025" · "28 Feb 2025".
 * Returns "" when the text is empty or unparseable.
 */
export function parseLooseDate(str) {
  const s = (str || "").trim();
  if (!s) return "";

  let m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(s);
  if (m) return validParts(+m[1], +m[2], +m[3]);

  m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})$/.exec(s);
  if (m) {
    let y = +m[3];
    if (m[3].length === 2) y += y < 70 ? 2000 : 1900;
    return validParts(y, +m[1], +m[2]);
  }

  if (/^\d{8}$/.test(s)) return validParts(+s.slice(0, 4), +s.slice(4, 6), +s.slice(6, 8));

  // Month-name forms — only when there are letters, so bare numbers never fall
  // through to Date's loose parsing.
  if (/[a-z]/i.test(s)) {
    const dt = new Date(s);
    if (!isNaN(dt) && /\d{4}/.test(s)) return toISO(dt.getFullYear(), dt.getMonth(), dt.getDate());
  }
  return "";
}

// Format an ISO date (YYYY-MM-DD) as a human display date ("February 28, 2025").
// Shared by new-item's save-time derivation and the record pane's "auto" button.
export function formatDisplayDate(iso) {
  if (!iso) return "";
  const d = new Date(iso + "T00:00:00");
  return isNaN(d) ? "" : d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}

export function makeDatePicker(initialValue, onChange, config = {}) {
  let value = initialValue || "";
  let view;            // { y, mo } — month shown in the calendar
  let isOpen = false;

  const el = document.createElement("div");
  el.className = "admin-datepicker";

  // ── Trigger ────────────────────────────────────────────
  // The value is a real text input, so a date can be typed as well as picked.
  const trigger = document.createElement("div");
  trigger.className = "admin-datepicker-trigger";
  const valueEl = document.createElement("input");
  valueEl.type = "text";
  valueEl.className = "admin-datepicker-value";
  valueEl.autocomplete = "off";
  valueEl.spellcheck = false;
  valueEl.placeholder = config.placeholder || "YYYY-MM-DD";
  valueEl.setAttribute("role", "combobox");
  valueEl.setAttribute("aria-haspopup", "dialog");
  valueEl.setAttribute("aria-expanded", "false");
  const iconEl = document.createElement("button");
  iconEl.type = "button";
  iconEl.className = "admin-datepicker-icon";
  iconEl.textContent = "▦";
  iconEl.tabIndex = -1;
  iconEl.setAttribute("aria-label", "Open calendar");
  trigger.appendChild(valueEl);
  trigger.appendChild(iconEl);
  el.appendChild(trigger);

  // ── Dropdown (calendar) ──────────────────────────────────────
  const dropdown = document.createElement("div");
  dropdown.className = "admin-datepicker-dropdown";
  dropdown.setAttribute("role", "dialog");
  el.appendChild(dropdown);

  // Keep clicks inside the calendar from shifting focus off the root. Month nav
  // rebuilds the grid (innerHTML = ""), which would blur a just-focused nav
  // button and fire focusout → close; keeping focus on the root avoids that.
  dropdown.addEventListener("mousedown", (e) => e.preventDefault());

  // Sync the field's text to the committed value. Skipped while the user is
  // mid-keystroke so typing is never yanked out from under them.
  function updateTrigger({ syncText = true } = {}) {
    if (syncText) valueEl.value = value;
    el.dataset.value = value;
    el.classList.toggle("is-invalid", false);
  }

  function initView() {
    const sel = parseISO(value);
    if (sel) { view = { y: sel.y, mo: sel.mo }; return; }
    const t = new Date();
    view = { y: t.getFullYear(), mo: t.getMonth() };
  }

  function renderCalendar() {
    dropdown.innerHTML = "";

    const head = document.createElement("div");
    head.className = "admin-datepicker-head";
    const prev = navBtn("‹", "Previous month", () => shiftMonth(-1));
    const title = document.createElement("span");
    title.className = "admin-datepicker-title";
    title.textContent = `${MONTHS[view.mo]} ${view.y}`;
    const next = navBtn("›", "Next month", () => shiftMonth(1));
    head.append(prev, title, next);
    dropdown.appendChild(head);

    const wd = document.createElement("div");
    wd.className = "admin-datepicker-weekdays";
    WEEKDAYS.forEach(d => {
      const s = document.createElement("span");
      s.textContent = d;
      wd.appendChild(s);
    });
    dropdown.appendChild(wd);

    const grid = document.createElement("div");
    grid.className = "admin-datepicker-grid";
    const firstDow = new Date(view.y, view.mo, 1).getDay();
    const daysInMonth = new Date(view.y, view.mo + 1, 0).getDate();
    const sel = parseISO(value);
    const today = new Date();
    for (let i = 0; i < firstDow; i++) {
      const blank = document.createElement("span");
      blank.className = "admin-datepicker-day is-blank";
      grid.appendChild(blank);
    }
    for (let d = 1; d <= daysInMonth; d++) {
      const cell = document.createElement("button");
      cell.type = "button";
      cell.className = "admin-datepicker-day";
      cell.textContent = String(d);
      if (sel && sel.y === view.y && sel.mo === view.mo && sel.d === d) cell.classList.add("selected");
      if (today.getFullYear() === view.y && today.getMonth() === view.mo && today.getDate() === d) cell.classList.add("today");
      cell.addEventListener("click", (e) => { e.stopPropagation(); pick(d); });
      grid.appendChild(cell);
    }
    dropdown.appendChild(grid);

    const foot = document.createElement("div");
    foot.className = "admin-datepicker-foot";
    foot.append(
      actionBtn("today", () => {
        const t = new Date();
        commit(toISO(t.getFullYear(), t.getMonth(), t.getDate()));
      }),
      actionBtn("clear", () => commit("")),
    );
    dropdown.appendChild(foot);
  }

  function navBtn(glyph, label, fn) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "admin-datepicker-nav";
    b.textContent = glyph;
    b.setAttribute("aria-label", label);
    b.addEventListener("click", (e) => { e.stopPropagation(); fn(); });
    return b;
  }
  function actionBtn(label, fn) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "admin-datepicker-action";
    b.textContent = label;
    b.addEventListener("click", (e) => { e.stopPropagation(); fn(); });
    return b;
  }

  function shiftMonth(delta) {
    let mo = view.mo + delta, y = view.y;
    if (mo < 0) { mo = 11; y--; } else if (mo > 11) { mo = 0; y++; }
    view = { y, mo };
    renderCalendar();
  }
  function pick(d) { commit(toISO(view.y, view.mo, d)); }
  function commit(v, { syncText = true, close: doClose = true } = {}) {
    const next = v || "";
    const changed = next !== value;
    value = next;
    updateTrigger({ syncText });
    if (doClose) close();
    if (changed) onChange?.(value);
  }

  function open() {
    if (isOpen) return;
    isOpen = true;
    initView();
    renderCalendar();
    el.classList.add("open");
    valueEl.setAttribute("aria-expanded", "true");
  }
  function close() {
    if (!isOpen) return;
    isOpen = false;
    el.classList.remove("open");
    valueEl.setAttribute("aria-expanded", "false");
  }

  // ── Typing ─────────────────────────────────────────────
  // While typing a run of bare digits at the end of the field, slot the dashes
  // in so "20250228" becomes "2025-02-28" without the user reaching for them.
  function autoDash() {
    const raw = valueEl.value;
    const atEnd = valueEl.selectionStart === raw.length && valueEl.selectionEnd === raw.length;
    if (!atEnd) return;
    const digits = raw.replace(/-/g, "");
    if (!/^\d{1,8}$/.test(digits)) return;
    let out = digits.slice(0, 4);
    if (digits.length > 4) out += "-" + digits.slice(4, 6);
    if (digits.length > 6) out += "-" + digits.slice(6, 8);
    if (out !== raw) {
      valueEl.value = out;
      valueEl.setSelectionRange(out.length, out.length);
    }
  }

  // Commit what's typed. Unparseable text is left in place and flagged rather
  // than silently discarded, so a typo is visible and fixable.
  function commitTyped({ close: doClose = false } = {}) {
    const raw = valueEl.value.trim();
    if (!raw) { commit("", { close: doClose }); return true; }
    const iso = parseLooseDate(raw);
    if (!iso) { el.classList.add("is-invalid"); return false; }
    commit(iso, { close: doClose });
    if (isOpen) { initView(); renderCalendar(); }
    return true;
  }

  // A half-typed date still parses ("3/14/20" → 2020), so live-commit is held
  // back until the text is unambiguously finished; the rest waits for blur.
  function looksComplete(str) {
    const s = (str || "").trim();
    return /^\d{4}-\d{2}-\d{2}$/.test(s)
        || /^\d{1,2}[-/.]\d{1,2}[-/.]\d{4}$/.test(s)
        || /^\d{8}$/.test(s)
        || /[a-z]/i.test(s);
  }

  valueEl.addEventListener("input", () => {
    autoDash();
    el.classList.remove("is-invalid");
    const iso = looksComplete(valueEl.value) ? parseLooseDate(valueEl.value) : "";
    // Live-commit only a complete, valid date; partials wait for blur/Enter.
    if (iso) {
      commit(iso, { syncText: false, close: false });
      if (isOpen) { initView(); renderCalendar(); }
    } else if (!valueEl.value.trim()) {
      commit("", { syncText: false, close: false });
    }
  });

  valueEl.addEventListener("blur", () => {
    if (commitTyped()) updateTrigger();
  });

  valueEl.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (commitTyped({ close: true })) updateTrigger();
    } else if (e.key === "Escape") {
      if (isOpen) { e.preventDefault(); close(); }
      else { updateTrigger(); }
    } else if (e.key === "ArrowDown" && !isOpen) {
      e.preventDefault();
      open();
    }
  });

  // Keep the toggle from stealing focus out of the field.
  iconEl.addEventListener("mousedown", (e) => e.preventDefault());
  iconEl.addEventListener("click", (e) => {
    e.stopPropagation();
    e.preventDefault();
    if (isOpen) { close(); valueEl.focus(); }
    else { valueEl.focus(); open(); }
  });
  // Clicking the surrounding chrome (not the input) puts the caret in the field.
  trigger.addEventListener("mousedown", (e) => {
    if (e.target === trigger) { e.preventDefault(); valueEl.focus(); }
  });

  // Close when focus leaves the whole component (clicking a day keeps focus inside).
  el.addEventListener("focusout", (e) => {
    if (!el.contains(e.relatedTarget)) close();
  });

  updateTrigger();

  return {
    el,
    input: valueEl,
    getValue() { return value; },
    setValue(v) { value = v || ""; updateTrigger(); },
  };
}
