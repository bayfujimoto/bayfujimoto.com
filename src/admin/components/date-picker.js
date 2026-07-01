/**
 * makeDatePicker — custom terminal-style calendar, matching makeSelect's chrome.
 *
 * Replaces the native <input type="date"> so the popup is themed to the admin
 * aesthetic instead of the OS default, and clicking the field opens the calendar.
 * Value is an ISO date string ("YYYY-MM-DD") or "".
 *
 * @param {string} initialValue
 * @param {(value: string) => void} onChange
 * @param {{ placeholder?: string }} [config]
 * @returns {{ el: HTMLElement, getValue: () => string, setValue: (v: string) => void }}
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
  el.setAttribute("tabindex", "0");
  el.setAttribute("role", "combobox");
  el.setAttribute("aria-haspopup", "dialog");
  el.setAttribute("aria-expanded", "false");

  // ── Trigger ──────────────────────────────────────────────────
  const trigger = document.createElement("div");
  trigger.className = "admin-datepicker-trigger";
  trigger.setAttribute("aria-hidden", "true");
  const valueEl = document.createElement("span");
  valueEl.className = "admin-datepicker-value";
  const iconEl = document.createElement("span");
  iconEl.className = "admin-datepicker-icon";
  iconEl.textContent = "▦";
  trigger.appendChild(valueEl);
  trigger.appendChild(iconEl);
  el.appendChild(trigger);

  // ── Dropdown (calendar) ──────────────────────────────────────
  const dropdown = document.createElement("div");
  dropdown.className = "admin-datepicker-dropdown";
  dropdown.setAttribute("role", "dialog");
  el.appendChild(dropdown);

  function updateTrigger() {
    valueEl.textContent = value || (config.placeholder || "YYYY-MM-DD");
    valueEl.classList.toggle("is-empty", !value);
    el.dataset.value = value;
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
  function commit(v) {
    value = v || "";
    updateTrigger();
    close();
    onChange?.(value);
  }

  function open() {
    if (isOpen) return;
    isOpen = true;
    initView();
    renderCalendar();
    el.classList.add("open");
    el.setAttribute("aria-expanded", "true");
  }
  function close() {
    if (!isOpen) return;
    isOpen = false;
    el.classList.remove("open");
    el.setAttribute("aria-expanded", "false");
  }

  trigger.addEventListener("click", (e) => {
    e.stopPropagation();
    el.focus();
    isOpen ? close() : open();
  });
  el.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); isOpen ? close() : open(); }
    else if (e.key === "Escape" && isOpen) { e.preventDefault(); close(); }
  });
  // Close when focus leaves the whole component (clicking a day keeps focus inside).
  el.addEventListener("focusout", (e) => {
    if (!el.contains(e.relatedTarget)) close();
  });

  updateTrigger();

  return {
    el,
    getValue() { return value; },
    setValue(v) { value = v || ""; updateTrigger(); },
  };
}
