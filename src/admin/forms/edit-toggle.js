// ── Edit-toggle layer (Phase 10) ─────────────────────────────────────────────
// Wraps form-renderer's inputs in a display/edit toggle. Values render as
// plain mono text by default; clicking a value (or focusing the row and
// pressing Enter) swaps the input in, focuses it, and trips the existing
// INSERT auto-transition. Blur or Esc commits the typed value and returns
// to display mode.
//
// A module-level undo stack records {input, before, after} for every commit
// where the value actually changed. `undoLastEdit()` pops the most recent
// entry and restores the prior value (firing an input event so dependent
// fields like slug re-derive). Cmd+Z / Ctrl+Z in NORMAL mode triggers it
// from modes.js.
//
// Skip list — these field types stay always-visible as their proper widget:
//   - textareas (multi-line text doesn't translate to a single span)
//   - selects + custom .admin-select widgets (already display as a value)
//   - checkboxes, radios, file inputs
//   - readonly / disabled inputs

import { setFieldState } from "./field-chrome.js";

const undoStack = [];
const MAX_UNDO  = 50;

// Input types we wrap with a display/edit toggle.
const TOGGLABLE_TYPES = new Set([
  'text', 'search', 'email', 'url', 'tel', 'number', 'date', 'time',
  'datetime-local', 'month', 'week', 'password', '',
]);

/**
 * Walk the form container and wrap each togglable input. Clears the previous
 * undo stack (each form mount is its own undo session).
 */
export function applyEditToggle(formContainer) {
  if (!formContainer) return;
  undoStack.length = 0;

  const fields = formContainer.querySelectorAll('.admin-field');
  for (const field of fields) {
    // Asset upload + gallery fields keep their custom widget chrome.
    if (field.classList.contains('admin-field--asset-upload')) continue;
    if (field.classList.contains('admin-field--gallery-upload')) continue;
    // Reorganized Assets group rows manage their own widgets (image/toggle/
    // number) — don't wrap their inputs in the click-to-edit buffer toggle.
    if (field.classList.contains('admin-field--asset-row')) continue;

    // Find the primary input inside this field row.
    const input = field.querySelector('input, textarea, select');
    if (!input) continue;
    if (input.tagName === 'TEXTAREA') continue;
    if (input.tagName === 'SELECT')   continue;
    if (input.parentElement?.classList.contains('admin-select')) continue;

    const t = (input.type || '').toLowerCase();
    if (t === 'checkbox' || t === 'radio' || t === 'file') continue;
    if (!TOGGLABLE_TYPES.has(t)) continue;
    if (input.readOnly || input.disabled) continue;

    // Skip if already wrapped (idempotent — useful if called twice).
    if (input.parentElement?.classList.contains('admin-field-value')) continue;

    wrapInput(input);
  }
}

/** Pop the most recent committed field edit and restore its prior value. */
export function undoLastEdit() {
  const entry = undoStack.pop();
  if (!entry) return false;
  const { input, before } = entry;
  if (!input.isConnected) return false;  // input got re-rendered out

  input.value = before;
  // Fire input so the renderer's onChange refreshes dependent fields (slug, etc.)
  input.dispatchEvent(new Event('input', { bubbles: true }));
  // Update the display span if present
  const wrapper = input.closest('.admin-field-value');
  if (wrapper) {
    const display = wrapper.querySelector('.admin-field-display');
    if (display) updateDisplayText(display, before);
  }

  // Clear the modified marker if no more entries for this field remain
  const fieldEl = input.closest('.admin-field');
  if (fieldEl) {
    const stillModified = undoStack.some(e => e.input === input);
    setFieldState(fieldEl, stillModified ? 'modified' : null);
  }
  return true;
}

/** Returns true if there's a previous edit available for undo. */
export function hasUndo() {
  return undoStack.length > 0;
}

// ── Internals ────────────────────────────────────────────────────────────────

function wrapInput(input) {
  const wrapper = document.createElement('span');
  wrapper.className = 'admin-field-value';

  const display = document.createElement('span');
  display.className = 'admin-field-display';
  // Empty fields show the input's placeholder (the schema example) instead of a
  // generic "(empty)" — rendered dimly via the .is-empty::before rule, which
  // reads this attribute. Falls back to "(empty)" for fields without an example.
  display.dataset.emptyText = input.placeholder || '(empty)';
  updateDisplayText(display, input.value);

  input.parentNode.insertBefore(wrapper, input);
  wrapper.appendChild(display);
  wrapper.appendChild(input);

  // Click the display → swap to input
  display.addEventListener('click', () => beginEdit(wrapper, input));

  // Live-update display as the user types
  input.addEventListener('input', () => updateDisplayText(display, input.value));

  // Esc inside an input blurs it (the existing INSERT-mode handler in modes.js
  // also calls blur on Esc; this is a defensive belt-and-suspenders for the
  // case where modes.js short-circuits or fails to capture).
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      input.blur();
    }
  });

  // Blur → commit + close
  input.addEventListener('blur', () => commit(wrapper, input));

  // Track the "before" value for undo
  input.__editToggle = { snapshot: input.value };
}

function beginEdit(wrapper, input) {
  if (wrapper.classList.contains('is-editing')) return;
  input.__editToggle.snapshot = input.value;
  wrapper.classList.add('is-editing');
  input.focus();
  if (typeof input.select === 'function') input.select();
}

function commit(wrapper, input) {
  if (!wrapper.classList.contains('is-editing')) return;
  wrapper.classList.remove('is-editing');

  const before = input.__editToggle?.snapshot ?? '';
  const after  = input.value;
  if (before !== after) {
    undoStack.push({ input, before, after });
    if (undoStack.length > MAX_UNDO) undoStack.shift();

    // Mark the field as modified — yellow ▮ in the state slot
    const fieldEl = input.closest('.admin-field');
    if (fieldEl) setFieldState(fieldEl, 'modified');
  }
}

function updateDisplayText(displayEl, value) {
  displayEl.textContent = value;
  displayEl.classList.toggle('is-empty', !value);
}
