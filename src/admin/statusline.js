// ── Status line (Phase 5) ────────────────────────────────────────────────────
// Owns the bottom status bar: state text, mode chip, contextual keymap legend.
// Subscribes to state for status / pendingChanges. Tracks the focused pane
// (clicking anywhere inside a pane sets focus). Mode defaults to 'normal' and
// will be flipped by the vim engine in Phase 6.
//
// Public API:
//   initStatusline()      — wire up subscribers + pane click handlers.
//   setBaseState(text,k)  — set the idle text and kind shown when no transient
//                           status is active (saving / saved / error).
//   setMode(mode)         — Phase 6 hook; updates mode chip and legend.
//   setFocusedPane(code)  — Phase 6 hook; also updated on pane click.
//   getMode() / getFocusedPane() — read-only.

import { subscribe, getState } from "./state.js";

// ── Module state ─────────────────────────────────────────────────────────────

let mode          = 'normal';
let focusedPane   = 'e';
let baseStateText = '⏵ ready';
let baseStateKind = null;
let helpExpanded  = false;

// ── Keymap mapping ───────────────────────────────────────────────────────────
// Lookup is KEYMAP[mode][focusedPane] || KEYMAP[mode]._ || []. Each entry is
// [key, label] — `key` may contain slashes to group related keys ("j/k").
// Phase 5 renders the bindings as if they all worked; Phase 6 wires the keys
// to actually fire.

const KEYMAP = {
  normal: {
    e: [                                     // Explorer focused
      ['↑↓',    'navigate'],
      ['←→',    'collapse / expand'],
      ['Enter', 'open'],
      ['/',     'filter'],
      ['r',     'Record'],
      ['l',     'Log'],
      [':',     'cmd'],
    ],
    r: [                                     // Record focused
      ['↑↓',    'next field'],
      ['Enter', 'edit'],
      ['Esc',   'cancel'],
      [':w',    'save'],
      ['e',     'Explorer'],
      ['l',     'Log'],
      [':',     'cmd'],
    ],
    l: [                                     // Log focused
      ['↑↓',    'navigate'],
      ['Enter', 'open record'],
      [':w',    'commit'],
      ['e',     'Explorer'],
      ['r',     'Record'],
      [':',     'cmd'],
    ],
  },
  insert: {
    _: [
      ['Esc', 'normal'],
    ],
  },
  command: {
    _: [
      [':w',       'commit'],
      [':q',       'close record'],
      [':e <id>',  'open record'],
      [':new <t>', 'new item'],
      [':help',    'help'],
      [':logout',  'sign out'],
      ['Esc',      'cancel'],
    ],
  },
  filter: {
    _: [
      ['Esc',   'close'],
      ['Enter', 'select'],
      ['↑↓',    'navigate'],
      ['~',     'fuzzy'],
    ],
  },
};

// ── Init ─────────────────────────────────────────────────────────────────────

export function initStatusline() {
  wirePaneFocus();
  setFocusedPane(focusedPane);
  setMode(mode);

  subscribe(updateStatusText);
  updateStatusText(getState());

  renderKeymapLegend();
}

function wirePaneFocus() {
  document.querySelectorAll('.admin-pane[data-pane]').forEach((pane) => {
    pane.addEventListener('mousedown', () => {
      const code = pane.dataset.pane;
      if (code) setFocusedPane(code);
    });
  });
}

// ── Setters ──────────────────────────────────────────────────────────────────

export function setMode(m) {
  mode = m;
  setModeChip(m);
  renderKeymapLegend();
}

export function getMode() { return mode; }

export function setFocusedPane(code) {
  if (!code) return;
  focusedPane = code;
  document.querySelectorAll('.admin-pane[data-pane]').forEach((el) => {
    el.classList.toggle('is-focused', el.dataset.pane === code);
  });
  renderKeymapLegend();
}

export function getFocusedPane() { return focusedPane; }

export function setBaseState(text, kind = null) {
  baseStateText = text;
  baseStateKind = kind;
  updateStatusText(getState());
}

export function setHelpExpanded(b) {
  helpExpanded = !!b;
  renderKeymapLegend();
}

export function getHelpExpanded() { return helpExpanded; }

// ── Renderers ────────────────────────────────────────────────────────────────

function updateStatusText(s) {
  // Transient operation states take precedence over the base text.
  if (s.status === 'saving') {
    setStatusText(s.statusMessage || 'committing…', 'saving');
    return;
  }
  if (s.status === 'error') {
    setStatusText(`! ${s.statusMessage || 'error'}`, 'error');
    return;
  }
  if (s.status === 'saved') {
    setStatusText(`✓ ${s.statusMessage || 'committed'}`, 'saved');
    return;
  }

  const n = s.pendingChanges?.length ?? 0;
  if (n > 0) setStatusText(`${baseStateText} · ${n} pending`, 'pending');
  else       setStatusText(baseStateText, baseStateKind);
}

function setStatusText(msg, kind = null) {
  const el = document.getElementById('admin-status-state');
  if (!el) return;
  el.textContent = msg;
  el.className = 'admin-status-state' + (kind ? ` admin-status-state--${kind}` : '');
}

function setModeChip(m) {
  const el = document.getElementById('admin-status-mode');
  if (!el) return;
  el.textContent = `-- ${m.toUpperCase()} --`;
  el.className = 'admin-status-mode admin-status-mode--' + m;
}

function renderKeymapLegend() {
  const el = document.getElementById('admin-status-keymap');
  if (!el) return;

  el.classList.toggle('is-expanded', helpExpanded);

  if (helpExpanded) {
    el.innerHTML = renderExpandedLegend();
    return;
  }

  const map  = KEYMAP[mode];
  const list = (map && (map[focusedPane] || map._)) || [];

  el.innerHTML = list
    .map(([key, label]) =>
      `<span><kbd>${escapeHTML(key)}</kbd>${escapeHTML(label)}</span>`
    )
    .join('');
}

function renderExpandedLegend() {
  // Every (mode, pane) combination listed in a vertical stack of labeled rows.
  // Esc collapses it.
  const sections = [];
  for (const [m, byPane] of Object.entries(KEYMAP)) {
    if (m === 'normal') {
      for (const [paneCode, entries] of Object.entries(byPane)) {
        if (paneCode === '_') continue;
        sections.push({ heading: `${m} · ${paneName(paneCode)}`, entries });
      }
    } else {
      sections.push({ heading: m, entries: byPane._ || [] });
    }
  }
  return sections.map(s => `
    <div class="admin-statusbar-keymap-section">
      <span class="admin-statusbar-keymap-heading">${escapeHTML(s.heading)}</span>
      ${s.entries.map(([k, lbl]) =>
        `<span><kbd>${escapeHTML(k)}</kbd>${escapeHTML(lbl)}</span>`
      ).join('')}
    </div>
  `).join('');
}

function paneName(code) {
  return { e: 'Explorer', r: 'Record', l: 'Log' }[code] || code;
}

// ── Utilities ────────────────────────────────────────────────────────────────

function escapeHTML(s) {
  return String(s).replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}
