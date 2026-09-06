// ── Mode engine (Phase 6) ────────────────────────────────────────────────────
// Global keyboard handler. Routes every keydown through a mode-specific dispatch
// table. Mode state lives in statusline.js so the legend can re-render
// reactively from the same single source of truth.
//
// Modes:
//   normal   — keyboard shortcuts fire. No editable input has focus.
//   insert   — an editable input has focus; keys flow to it. Esc → NORMAL.
//   command  — `:` command bar is open inline in the state row.
//   filter   — `/` filter is open (Phase 6.5 — placeholder for now).
//
// Auto-transitions: focusing any editable input flips NORMAL → INSERT;
// blurring takes INSERT → NORMAL. The COMMAND-mode input is excluded from
// this auto-transition (it owns its own mode).
//
// Commands are wired through a callbacks object passed to initModes():
//   initModes({
//     on_w:    () => triggerCommit(),
//     on_q:    () => closeRecord(),
//     on_e:    (id) => openById(id),
//     on_new:  (type) => startNew(type),
//     on_help: () => toggleHelp(),
//   });

import {
  setMode, getMode,
  setFocusedPane, getFocusedPane,
  setHelpExpanded, getHelpExpanded,
} from "./statusline.js";
import {
  enterFilter         as explorerEnterFilter,
  exitFilter          as explorerExitFilter,
  activateFirstMatch  as explorerActivateFirstMatch,
  filterComplete      as explorerFilterComplete,
  filterMoveSuggestion as explorerFilterMoveSuggestion,
} from "./views/explorer.js";
import { navigate, activate } from "./nav.js";
import { undoLastEdit } from "./forms/edit-toggle.js";

let listenersAttached = false;
let cmdState          = null;
let commandHandlers   = {};
let flashTimer        = null;

// Vim modality is strictly desktop-only — on phones the bottom tabstrip and
// native form focus carry the entire interaction model (Phase 8 decision).
function isMobile() {
  return window.matchMedia('(max-width: 700px)').matches;
}

// Command catalog used to render suggestions and validate Tab-completion.
const COMMANDS = [
  { name: 'w',    fill: 'w',     hint: 'commit pending changes' },
  { name: 'q',    fill: 'q',     hint: 'close record'           },
  { name: 'e',    fill: 'e ',    hint: 'open <id>',  needsArg: true },
  { name: 'new',  fill: 'new ',  hint: 'new <type>', needsArg: true },
  { name: 'tags', fill: 'tags',  hint: 'import Letterboxd CSV tags' },
  { name: 'nohl', fill: 'nohl',  hint: 'clear filter match tint' },
  { name: 'help', fill: 'help',  hint: 'expand keymap legend'   },
  { name: 'logout', fill: 'logout', hint: 'end session, return to gate' },
];

// Tag-merge modes offered when completing `:tags <mode>`. Optional — `:tags`
// alone opens the import view with merge preselected.
const TAGS_MODES = [
  { name: 'merge',   display: 'merge',   hint: 'add new tags, keep existing', fill: 'tags merge'   },
  { name: 'replace', display: 'replace', hint: 'mirror Letterboxd exactly',   fill: 'tags replace' },
];

// Record types offered when completing the `:new <type>` argument. Each maps a
// type to its series, shown as the suggestion hint. Mirrors SERIES_TYPES in
// new-item.js / main.js — keep in sync if the type taxonomy changes.
const NEW_TYPES = [
  ['accumulation', ['ticket', 'brochure', 'receipt', 'handout', 'document']],
  ['consumption',  ['film', 'book', 'album', 'ep', 'single', 'bag', 'game']],
  ['creation',     ['sketch', 'photo', 'prototype', 'video', 'note']],
  ['labor',        ['project', 'artifact', 'commission', 'contribution']],
  ['identity',     ['cv-entry', 'contact']],
  ['registry',     ['constellation']],
].flatMap(([series, types]) => types.map(type => ({
  name:    type,
  display: type,          // shown without the `:` prefix — it's an argument value
  hint:    series,
  fill:    `new ${type}`, // accepting runs `:new <type>` immediately
})));

// ── Public API ───────────────────────────────────────────────────────────────

export function initModes(handlers = {}) {
  commandHandlers = handlers;
  if (listenersAttached) return;
  document.addEventListener('keydown',  onKeyDown, true);
  document.addEventListener('focusin',  onFocusIn);
  document.addEventListener('focusout', onFocusOut);
  document.addEventListener('mousedown', onMouseDown);
  listenersAttached = true;
}

// ── Element predicates ───────────────────────────────────────────────────────

function isEditable(el) {
  if (!el) return false;
  if (el.isContentEditable) return true;
  const tag = el.tagName;
  if (tag === 'TEXTAREA') return true;
  if (tag === 'INPUT') {
    const t = (el.type || '').toLowerCase();
    return t === 'text' || t === 'search' || t === 'email' || t === 'url' ||
           t === 'tel'  || t === 'number' || t === 'password' || t === 'date' ||
           t === '';
  }
  return false;
}

// Excludes inputs owned by COMMAND and FILTER modes — those have their own
// mode and shouldn't trigger the auto-INSERT transition.
function isUserEditable(el) {
  return isEditable(el)
      && !el.classList.contains('admin-cmd-input')
      && !el.classList.contains('admin-tree-filter-input');
}

// ── Auto-transitions on focus ────────────────────────────────────────────────

function onFocusIn(e) {
  if (isMobile()) return;
  const m = getMode();
  if (m === 'command' || m === 'filter') return;
  if (isUserEditable(e.target)) setMode('insert');
}

function onFocusOut(e) {
  if (isMobile()) return;
  const m = getMode();
  if (m === 'command' || m === 'filter') return;
  if (isUserEditable(e.target)) {
    // Wait for a possible next focusin to settle, then check.
    queueMicrotask(() => {
      if (!isUserEditable(document.activeElement) && getMode() === 'insert') {
        setMode('normal');
      }
    });
  }
}

// Clicking outside the COMMAND input cancels command mode.
function onMouseDown(e) {
  if (isMobile()) return;
  if (getMode() !== 'command' || !cmdState) return;
  const inSugg  = e.target.closest('.admin-cmd-suggestions');
  const inInput = e.target.closest('.admin-status-state--command');
  if (!inSugg && !inInput) exitCommand();
}

// ── Keydown dispatch ─────────────────────────────────────────────────────────

function onKeyDown(e) {
  if (isMobile()) return;
  const mode = getMode();
  if (mode === 'command') return handleCommandKey(e);
  if (mode === 'filter')  return handleFilterKey(e);
  if (mode === 'insert')  return handleInsertKey(e);
  return handleNormalKey(e);
}

function handleInsertKey(e) {
  if (e.key === 'Escape') {
    e.preventDefault();
    const ae = document.activeElement;
    if (ae && isUserEditable(ae)) ae.blur();
    setMode('normal');
  }
}

function handleNormalKey(e) {
  // Cmd+Z / Ctrl+Z (no shift) → field-level undo from edit-toggle (Phase 10).
  // Inside an input the browser's text-level undo wins because INSERT mode
  // routes keys here only after blurring out; handleInsertKey doesn't
  // intercept Z so the native handler fires while editing.
  if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && (e.key === 'z' || e.key === 'Z')) {
    if (isUserEditable(document.activeElement)) return;
    e.preventDefault();
    undoLastEdit();
    return;
  }

  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (isUserEditable(document.activeElement)) return; // safety

  // Arrow keys + Enter route to the focused pane's nav handler.
  if (e.key === 'ArrowUp')    { e.preventDefault(); navigate(getFocusedPane(), 'up');    return; }
  if (e.key === 'ArrowDown')  { e.preventDefault(); navigate(getFocusedPane(), 'down');  return; }
  if (e.key === 'ArrowLeft')  { e.preventDefault(); navigate(getFocusedPane(), 'left');  return; }
  if (e.key === 'ArrowRight') { e.preventDefault(); navigate(getFocusedPane(), 'right'); return; }
  if (e.key === 'Enter')      { e.preventDefault(); activate(getFocusedPane());          return; }

  // Skip other multi-char keys (F-keys, Home, End, etc. for now).
  if (e.key.length > 1 && e.key !== 'Escape') return;

  switch (e.key) {
    case 'e': e.preventDefault(); setFocusedPane('e'); return;
    case 'r': e.preventDefault(); setFocusedPane('r'); return;
    case 'l': e.preventDefault(); setFocusedPane('l'); return;
    case 'i':
    case 'a':
      e.preventDefault();
      enterInsert();
      return;
    case ':':
      e.preventDefault();
      enterCommand();
      return;
    case '?':
      e.preventDefault();
      setHelpExpanded(!getHelpExpanded());
      return;
    case '/':
      e.preventDefault();
      enterFilter();
      return;
    case 'Escape':
      if (getHelpExpanded()) {
        e.preventDefault();
        setHelpExpanded(false);
      }
      return;
  }
}

// ── INSERT entry: focus first editable field in the focused pane ─────────────

function enterInsert() {
  const code = getFocusedPane();
  const pane = document.querySelector(`[data-pane="${code}"]`);
  if (!pane) return;
  const input = pane.querySelector(
    'input:not([readonly]):not([disabled]), textarea:not([readonly]):not([disabled])'
  );
  if (input) {
    input.focus();      // focusin handler will flip to INSERT
    if (typeof input.select === 'function') input.select();
  } else {
    flashStatus(`no editable field in ${paneName(code)}`);
  }
}

function paneName(c) {
  return { e: 'Explorer', r: 'Record', l: 'Log' }[c] || c;
}

// ── FILTER mode: in-pane filter input (Phase 6.5) ────────────────────────────
// `/` opens the Explorer's filter bar. Enter activates the first match and
// exits. Esc exits but keeps matched rows tinted until `:nohl`. Other keys
// flow to the filter input naturally — its own `input` event re-renders the
// tree on every keystroke.

function enterFilter() {
  // Filter only supports the Explorer pane for Phase 6.5. If a different
  // pane is focused, switch to Explorer first so the filter has somewhere
  // to go.
  if (getFocusedPane() !== 'e') setFocusedPane('e');
  setMode('filter');
  const ok = explorerEnterFilter();
  if (!ok) setMode('normal');
}

function exitFilter(activate = false) {
  if (activate) explorerActivateFirstMatch();
  explorerExitFilter();
  setMode('normal');
}

function handleFilterKey(e) {
  if (e.key === 'Escape') {
    e.preventDefault();
    exitFilter(false);
    return;
  }
  // Status-filter autocomplete ("//"): Tab completes the highlighted status,
  // Arrows move the highlight. These are no-ops outside status mode.
  if (e.key === 'Tab') {
    e.preventDefault();
    explorerFilterComplete();
    return;
  }
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    if (explorerFilterMoveSuggestion(e.key === 'ArrowDown' ? 1 : -1)) {
      e.preventDefault();
      return;
    }
    // No suggestions to move through — let the key fall through to the input.
  }
  if (e.key === 'Enter') {
    e.preventDefault();
    // In status mode with an incomplete term, Enter completes it; otherwise it
    // activates the first match and exits (the normal-filter behaviour).
    if (explorerFilterComplete(true)) return;
    exitFilter(true);
    return;
  }
  // All other keys flow to the input itself.
}

// ── COMMAND mode: inline input in the state row ──────────────────────────────

function enterCommand() {
  const stateEl = document.getElementById('admin-status-state');
  const statusbar = document.getElementById('admin-statusbar');
  if (!stateEl || !statusbar) return;

  const originalText  = stateEl.textContent;
  const originalClass = stateEl.className;

  stateEl.innerHTML = '';
  const prompt = document.createElement('span');
  prompt.className = 'admin-cmd-prompt';
  prompt.textContent = ':';
  const input = document.createElement('input');
  input.type           = 'text';
  input.className      = 'admin-cmd-input';
  input.autocomplete   = 'off';
  input.spellcheck     = false;
  input.setAttribute('aria-label', 'Command input');
  stateEl.appendChild(prompt);
  stateEl.appendChild(input);
  stateEl.className = 'admin-status-state admin-status-state--command';

  const suggestions = document.createElement('div');
  suggestions.className = 'admin-cmd-suggestions';
  statusbar.appendChild(suggestions);

  cmdState = {
    input, suggestions,
    originalText, originalClass,
    stateEl,
    suggIdx: -1, suggList: [],
  };

  setMode('command');
  input.focus();

  input.addEventListener('input', updateSuggestions);
  updateSuggestions();
}

function exitCommand() {
  if (!cmdState) return;
  const { stateEl, originalText, originalClass, suggestions } = cmdState;
  stateEl.innerHTML  = '';
  stateEl.textContent = originalText;
  stateEl.className   = originalClass;
  suggestions?.remove();
  cmdState = null;
  setMode('normal');
}

function handleCommandKey(e) {
  if (!cmdState) return;
  const { input, suggList } = cmdState;

  if (e.key === 'Enter') {
    e.preventDefault();
    if (cmdState.suggIdx >= 0 && suggList[cmdState.suggIdx]) {
      acceptSuggestion(suggList[cmdState.suggIdx]);
      return;
    }
    const val = input.value;
    exitCommand();
    executeCommand(val);
    return;
  }
  if (e.key === 'Escape') {
    e.preventDefault();
    exitCommand();
    return;
  }
  if (e.key === 'Tab') {
    e.preventDefault();
    if (suggList.length >= 1) acceptSuggestion(suggList[cmdState.suggIdx >= 0 ? cmdState.suggIdx : 0]);
    return;
  }
  if (e.key === 'ArrowDown' && suggList.length) {
    e.preventDefault();
    cmdState.suggIdx = (cmdState.suggIdx + 1) % suggList.length;
    paintSuggestionFocus();
    return;
  }
  if (e.key === 'ArrowUp' && suggList.length) {
    e.preventDefault();
    cmdState.suggIdx = (cmdState.suggIdx - 1 + suggList.length) % suggList.length;
    paintSuggestionFocus();
    return;
  }
}

function updateSuggestions() {
  if (!cmdState) return;
  const { input, suggestions } = cmdState;
  const val   = input.value;
  const space = val.indexOf(' ');
  const base  = (space === -1 ? val : val.slice(0, space)).toLowerCase();
  const arg   = space === -1 ? null : val.slice(space + 1).replace(/^\s+/, '').toLowerCase();

  let list;
  if (base === 'new' && space !== -1) {
    // Completing the `:new <type>` argument — autocomplete every record type,
    // filtered by what's typed after the command, each tagged with its series.
    list = NEW_TYPES.filter(t => !arg || t.name.startsWith(arg));
  } else if (base === 'tags' && space !== -1) {
    // Completing the `:tags <mode>` argument — merge or replace.
    list = TAGS_MODES.filter(t => !arg || t.name.startsWith(arg));
  } else if (space !== -1) {
    // Typing an argument for another command — keep just that command in view
    // as a reminder of its signature.
    list = COMMANDS.filter(c => c.name === base);
  } else {
    // Completing a command name.
    list = COMMANDS.filter(c => !base || c.name.startsWith(base));
  }

  cmdState.suggList = list;
  cmdState.suggIdx  = -1;

  suggestions.innerHTML = list.map((c, i) => `
    <div class="admin-cmd-suggestion" data-i="${i}">
      <span class="admin-cmd-suggestion-name">${escapeHTML(c.display || ':' + c.name)}</span>
      <span class="admin-cmd-suggestion-hint">${escapeHTML(c.hint)}</span>
    </div>
  `).join('');

  suggestions.querySelectorAll('.admin-cmd-suggestion').forEach((el, i) => {
    el.addEventListener('mousedown', (e) => {
      e.preventDefault();
      acceptSuggestion(list[i]);
    });
  });
}

function paintSuggestionFocus() {
  if (!cmdState) return;
  cmdState.suggestions.querySelectorAll('.admin-cmd-suggestion').forEach((el, i) => {
    const on = i === cmdState.suggIdx;
    el.classList.toggle('focused', on);
    if (on) el.scrollIntoView({ block: 'nearest' });
  });
}

function acceptSuggestion(c) {
  if (!cmdState || !c) return;
  cmdState.input.value = c.fill;
  if (!c.needsArg) {
    const val = c.fill;
    exitCommand();
    executeCommand(val);
  } else {
    cmdState.input.focus();
    updateSuggestions();
  }
}

function executeCommand(text) {
  const trimmed = (text || '').trim();
  if (!trimmed) return;
  const [cmd, ...rest] = trimmed.split(/\s+/);
  const arg = rest.join(' ').trim();
  const handler = commandHandlers[`on_${cmd}`];
  if (handler) handler(arg);
  else         flashStatus(`unknown command: ${cmd}`);
}

// ── Transient status flash ───────────────────────────────────────────────────
// Briefly replaces the state text with a message (e.g. "unknown command"),
// then restores it. Used for friendly errors that don't justify a real status
// change.

function flashStatus(msg) {
  const el = document.getElementById('admin-status-state');
  if (!el) return;
  const wasText  = el.textContent;
  const wasClass = el.className;
  el.textContent = msg;
  el.className   = 'admin-status-state admin-status-state--error';
  clearTimeout(flashTimer);
  flashTimer = setTimeout(() => {
    if (el.textContent === msg) {
      el.textContent = wasText;
      el.className   = wasClass;
    }
  }, 1800);
}

// ── Utilities ────────────────────────────────────────────────────────────────

function escapeHTML(s) {
  return String(s).replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}
