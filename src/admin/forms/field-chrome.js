// ── Field chrome (Phase 10.5) ────────────────────────────────────────────────
// Post-render decoration that turns form-renderer's `.admin-field` rows into
// the 4-column tabular layout: [state] [field-name] [value] [type].
//
// Adds two new slots to each field row:
//   - `.admin-field-state`  — leading state-marker slot (▮ yellow/red/transparent)
//   - `.admin-field-type`   — trailing type label (`text`, `date`, `enum`, etc.)
//
// The CSS in styles.css handles the grid columns. setFieldState(el, kind)
// toggles state classes on the state slot for modified/error/clear states.

export function applyFieldChrome(formContainer) {
  if (!formContainer) return;
  const fields = formContainer.querySelectorAll('.admin-field');
  for (const field of fields) {
    ensureStateSlot(field);
    ensureTypeSlot(field);
  }
}

/** Set the modified/error state on a field row. Pass null to clear. */
export function setFieldState(fieldEl, kind) {
  if (!fieldEl) return;
  const slot = fieldEl.querySelector('.admin-field-state');
  if (!slot) return;
  slot.classList.remove('is-modified', 'is-error');
  if (kind === 'modified') slot.classList.add('is-modified');
  if (kind === 'error')    slot.classList.add('is-error');
}

/** Read the current state kind of a field row. */
export function getFieldState(fieldEl) {
  const slot = fieldEl?.querySelector('.admin-field-state');
  if (!slot) return null;
  if (slot.classList.contains('is-error'))    return 'error';
  if (slot.classList.contains('is-modified')) return 'modified';
  return null;
}

// ── Internals ────────────────────────────────────────────────────────────────

function ensureStateSlot(field) {
  if (field.querySelector(':scope > .admin-field-state')) return;
  const slot = document.createElement('span');
  slot.className = 'admin-field-state';
  slot.textContent = '▮';  // ▮ filled vertical bar
  slot.setAttribute('aria-hidden', 'true');
  field.insertBefore(slot, field.firstChild);
}

function ensureTypeSlot(field) {
  if (field.querySelector(':scope > .admin-field-type')) return;
  const span = document.createElement('span');
  span.className = 'admin-field-type';
  span.textContent = inferType(field);
  field.appendChild(span);
}

function inferType(field) {
  // Asset and gallery widgets keep their own chrome — label them by their role.
  if (field.classList.contains('admin-field--asset-upload'))   return 'asset';
  if (field.classList.contains('admin-field--gallery-upload')) return 'gallery';

  // Custom select widget (used for status, inspection, etc.)
  if (field.querySelector(':scope > .admin-select, :scope > .admin-input-wrap .admin-select, :scope > .admin-input-wrap > .admin-select')) {
    return 'enum';
  }

  const input = field.querySelector('input, textarea, select');
  if (!input) return '';

  if (input.tagName === 'TEXTAREA') return 'text+';
  if (input.tagName === 'SELECT')   return 'enum';

  const t = (input.type || 'text').toLowerCase();
  if (t === 'date')     return 'date';
  if (t === 'number')   return 'number';
  if (t === 'email')    return 'email';
  if (t === 'url')      return 'url';
  if (t === 'tel')      return 'tel';
  if (t === 'password') return 'password';
  if (t === 'checkbox') return 'bool';
  if (t === 'file')     return 'file';

  // For text fields, look at the field id for some specific cases
  const fid = input.id || '';
  if (fid === 'field-id')   return 'id';
  if (fid === 'field-slug') return 'slug';

  return 'text';
}
