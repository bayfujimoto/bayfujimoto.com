// ── Three-pane TUI shell ──────────────────────────────────────────────────────
// Drag-to-resize gutters with localStorage persistence.
//
// Layout:
//   ┌──────────────┬────────────────────────┐
//   │   Explorer   │ Record                 │
//   │              ├────────────────────────┤
//   │              │ Log                    │
//   └──────────────┴────────────────────────┘
//
// Sizes are stored as CSS custom properties so the grid can read them directly:
//   --explorer-w  (percentage of shell width)   on .admin-shell
//   --record-h    (percentage of right column)  on .admin-shell-right
//
// Double-click a gutter to reset that pane to its default size.

const STORAGE_KEYS = {
  explorerWidth: 'admin.pane.explorer-width',
  recordHeight:  'admin.pane.record-height',
};

const MIN_EXPLORER_PCT = 15;
const MAX_EXPLORER_PCT = 60;
const MIN_RECORD_PCT   = 25;
const MAX_RECORD_PCT   = 85;

const DEFAULT_EXPLORER_PCT = 30;
const DEFAULT_RECORD_PCT   = 62;

export function initShellResize() {
  const shell   = document.getElementById('admin-shell');
  const right   = shell?.querySelector('.admin-shell-right');
  const gutterV = document.getElementById('gutter-v');
  const gutterH = document.getElementById('gutter-h');
  if (!shell || !right || !gutterV || !gutterH) return;

  // ── Restore saved sizes ────────────────────────────────────────
  const savedW = localStorage.getItem(STORAGE_KEYS.explorerWidth);
  const savedH = localStorage.getItem(STORAGE_KEYS.recordHeight);
  if (savedW) shell.style.setProperty('--explorer-w', savedW);
  if (savedH) right.style.setProperty('--record-h',   savedH);

  // ── Vertical gutter: resize explorer pane width ────────────────
  gutterV.addEventListener('mousedown', (e) => {
    e.preventDefault();
    const rect = shell.getBoundingClientRect();
    document.body.classList.add('admin-gutter-dragging');
    gutterV.classList.add('dragging');

    const onMove = (ev) => {
      const px  = ev.clientX - rect.left;
      const pct = clamp((px / rect.width) * 100, MIN_EXPLORER_PCT, MAX_EXPLORER_PCT);
      shell.style.setProperty('--explorer-w', pct.toFixed(2) + '%');
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup',   onUp);
      document.body.classList.remove('admin-gutter-dragging');
      gutterV.classList.remove('dragging');
      const cur = shell.style.getPropertyValue('--explorer-w').trim();
      if (cur) localStorage.setItem(STORAGE_KEYS.explorerWidth, cur);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup',   onUp);
  });

  // ── Horizontal gutter: resize record pane height ───────────────
  gutterH.addEventListener('mousedown', (e) => {
    e.preventDefault();
    const rect = right.getBoundingClientRect();
    document.body.classList.add('admin-gutter-dragging', 'dragging-h');
    gutterH.classList.add('dragging');

    const onMove = (ev) => {
      const px  = ev.clientY - rect.top;
      const pct = clamp((px / rect.height) * 100, MIN_RECORD_PCT, MAX_RECORD_PCT);
      right.style.setProperty('--record-h', pct.toFixed(2) + '%');
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup',   onUp);
      document.body.classList.remove('admin-gutter-dragging', 'dragging-h');
      gutterH.classList.remove('dragging');
      const cur = right.style.getPropertyValue('--record-h').trim();
      if (cur) localStorage.setItem(STORAGE_KEYS.recordHeight, cur);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup',   onUp);
  });

  // ── Keyboard nudge when a gutter is focused (Arrow keys) ───────
  gutterV.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    const cur  = readPct(shell, '--explorer-w', DEFAULT_EXPLORER_PCT);
    const step = e.shiftKey ? 5 : 1;
    const next = clamp(cur + (e.key === 'ArrowLeft' ? -step : step), MIN_EXPLORER_PCT, MAX_EXPLORER_PCT);
    const val  = next.toFixed(2) + '%';
    shell.style.setProperty('--explorer-w', val);
    localStorage.setItem(STORAGE_KEYS.explorerWidth, val);
  });

  gutterH.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
    e.preventDefault();
    const cur  = readPct(right, '--record-h', DEFAULT_RECORD_PCT);
    const step = e.shiftKey ? 5 : 1;
    const next = clamp(cur + (e.key === 'ArrowUp' ? -step : step), MIN_RECORD_PCT, MAX_RECORD_PCT);
    const val  = next.toFixed(2) + '%';
    right.style.setProperty('--record-h', val);
    localStorage.setItem(STORAGE_KEYS.recordHeight, val);
  });

  // ── Double-click resets to default ─────────────────────────────
  gutterV.addEventListener('dblclick', () => {
    shell.style.removeProperty('--explorer-w');
    localStorage.removeItem(STORAGE_KEYS.explorerWidth);
  });
  gutterH.addEventListener('dblclick', () => {
    right.style.removeProperty('--record-h');
    localStorage.removeItem(STORAGE_KEYS.recordHeight);
  });
}

function clamp(v, lo, hi) {
  return Math.min(hi, Math.max(lo, v));
}

function readPct(el, prop, fallback) {
  const raw = el.style.getPropertyValue(prop).trim();
  const n   = parseFloat(raw);
  return Number.isFinite(n) ? n : fallback;
}

// ── Record pane API ───────────────────────────────────────────────────────────
// Callers populate the [r] Record pane through these helpers rather than
// reaching into the DOM directly.

/** Returns the Record pane body element (or null if the shell isn't rendered yet). */
export function getRecordBody() {
  return document.querySelector('#pane-record .admin-pane-body');
}

/** Returns the Record pane's top-border action slot (right of the [r] Record label). */
export function getRecordActions() {
  return document.getElementById('record-pane-actions');
}

/** Empty the Record pane's top-border action slot. */
export function clearRecordActions() {
  const slot = getRecordActions();
  if (slot) slot.innerHTML = '';
}

/**
 * Replace the Record pane's top-border actions with a set of buttons.
 * Pass an array of button elements (e.g. from makePaneAction). Passing an
 * empty array (or omitting) clears the slot.
 */
export function setRecordActions(buttons = []) {
  const slot = getRecordActions();
  if (!slot) return;
  slot.innerHTML = '';
  for (const btn of buttons) if (btn) slot.appendChild(btn);
}

/**
 * Build one top-border action button.
 *   makePaneAction({ label: 'save', onClick, title, variant: 'danger' })
 * The bracket chrome ([save]) is drawn in CSS so labels stay plain text.
 */
export function makePaneAction({ label, onClick, title, variant } = {}) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'admin-pane-action' + (variant ? ` admin-pane-action--${variant}` : '');
  btn.textContent = label || '';
  if (title) btn.title = title;
  if (onClick) btn.addEventListener('click', onClick);
  return btn;
}

/**
 * Replace the Record pane body's contents.
 *
 *   openRecord((body) => renderEditItem(body, item, ...))   // builder fn
 *   openRecord(domNode)                                     // pre-built node
 *   openRecord('<div>…</div>')                              // HTML string
 *
 * The body is cleared first, then the new content goes in.
 */
export function openRecord(content) {
  const body = getRecordBody();
  if (!body) return;
  body.innerHTML = '';
  // Reset the top-border actions; the incoming view repopulates them if needed.
  clearRecordActions();
  if (typeof content === 'function')          content(body);
  else if (content instanceof Node)           body.appendChild(content);
  else if (content != null)                   body.innerHTML = String(content);
}

/** Clear the Record pane body and the topbar breadcrumb. */
export function clearRecord() {
  const body = getRecordBody();
  if (body) body.innerHTML = '';
  clearRecordActions();
  const breadcrumb = document.getElementById('admin-topbar-breadcrumb');
  if (breadcrumb) breadcrumb.innerHTML = '';
}
