/**
 * makeSelect — custom terminal-style dropdown.
 *
 * @param {Array<{value: string, label: string} | string>} options
 * @param {string} initialValue
 * @param {(value: string) => void} onChange
 * @returns {{ el: HTMLElement, getValue: () => string, setValue: (v: string) => void }}
 */
export function makeSelect(options, initialValue, onChange) {
  const opts = options.map(o =>
    typeof o === "string" ? { value: o, label: o } : o
  );

  let currentValue = initialValue ?? opts[0]?.value ?? "";
  let focusedIdx   = -1;
  let isOpen       = false;

  // ── Root ─────────────────────────────────────────────────────
  const el = document.createElement("div");
  el.className = "admin-select";
  el.setAttribute("tabindex", "0");
  el.setAttribute("role", "combobox");
  el.setAttribute("aria-haspopup", "listbox");
  el.setAttribute("aria-expanded", "false");

  // ── Trigger ──────────────────────────────────────────────────
  const trigger = document.createElement("div");
  trigger.className = "admin-select-trigger";
  trigger.setAttribute("aria-hidden", "true");

  const valueEl = document.createElement("span");
  valueEl.className = "admin-select-value";

  const arrowEl = document.createElement("span");
  arrowEl.className = "admin-select-arrow";
  arrowEl.textContent = "▾";

  trigger.appendChild(valueEl);
  trigger.appendChild(arrowEl);
  el.appendChild(trigger);

  // ── Dropdown ─────────────────────────────────────────────────
  const dropdown = document.createElement("div");
  dropdown.className = "admin-select-dropdown";
  dropdown.setAttribute("role", "listbox");

  const optEls = opts.map(({ value, label }) => {
    const optEl = document.createElement("div");
    optEl.className = "admin-select-option";
    optEl.setAttribute("role", "option");
    optEl.dataset.value = value;
    optEl.textContent = label;
    optEl.addEventListener("mousedown", (e) => {
      e.preventDefault(); // prevent blur on root before we handle click
      select(value);
    });
    dropdown.appendChild(optEl);
    return optEl;
  });

  el.appendChild(dropdown);

  // ── Helpers ──────────────────────────────────────────────────
  function getLabel(v) {
    return opts.find(o => o.value === v)?.label ?? v;
  }

  function updateDisplay() {
    valueEl.textContent = getLabel(currentValue);
    optEls.forEach(o => {
      o.classList.toggle("selected", o.dataset.value === currentValue);
    });
  }

  function open() {
    isOpen = true;
    el.classList.add("open");
    el.setAttribute("aria-expanded", "true");
    focusedIdx = opts.findIndex(o => o.value === currentValue);
    updateFocused();
  }

  function close() {
    isOpen = false;
    el.classList.remove("open");
    el.setAttribute("aria-expanded", "false");
    focusedIdx = -1;
    updateFocused();
  }

  function toggle() {
    isOpen ? close() : open();
  }

  function select(value) {
    currentValue = value;
    updateDisplay();
    close();
    onChange?.(value);
  }

  function updateFocused() {
    optEls.forEach((o, i) => o.classList.toggle("focused", i === focusedIdx));
    if (focusedIdx >= 0) optEls[focusedIdx].scrollIntoView({ block: "nearest" });
  }

  // ── Events ───────────────────────────────────────────────────
  trigger.addEventListener("click", (e) => {
    e.stopPropagation();
    el.focus();
    toggle();
  });

  el.addEventListener("keydown", (e) => {
    switch (e.key) {
      case "Enter":
      case " ":
        e.preventDefault();
        if (!isOpen) { open(); break; }
        if (focusedIdx >= 0) select(opts[focusedIdx].value);
        break;
      case "ArrowDown":
        e.preventDefault();
        if (!isOpen) { open(); break; }
        focusedIdx = Math.min(focusedIdx + 1, opts.length - 1);
        updateFocused();
        break;
      case "ArrowUp":
        e.preventDefault();
        if (!isOpen) { open(); break; }
        focusedIdx = Math.max(focusedIdx - 1, 0);
        updateFocused();
        break;
      case "Escape":
        if (isOpen) { e.preventDefault(); close(); }
        break;
      case "Tab":
        if (isOpen) close();
        break;
    }
  });

  // Close when focus moves outside the component
  el.addEventListener("focusout", (e) => {
    if (!el.contains(e.relatedTarget)) close();
  });

  // ── Init ─────────────────────────────────────────────────────
  updateDisplay();

  return {
    el,
    getValue()  { return currentValue; },
    setValue(v) { currentValue = v; updateDisplay(); },
  };
}
