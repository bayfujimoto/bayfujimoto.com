import "./styles.css";
import { initShellResize, openRecord, getRecordBody, clearRecord } from "./shell.js";
import { loadArchive } from "./lib/api.js";
import { setState } from "./state.js";
import {
  initExplorer,
  renderExplorer,
  setExplorerProgress,
  showExplorerError,
  selectInTree,
  clearMatched as clearExplorerMatched,
} from "./views/explorer.js";
import { renderEmptyState } from "./views/dashboard.js";
import { renderEditItem }   from "./views/edit-item.js";
import { renderNewItem }    from "./views/new-item.js";
import { renderImportLetterboxd } from "./views/import-letterboxd.js";
import { initLog, setLogCallbacks, triggerCommit } from "./views/log.js";
import { initStatusline, setBaseState, setHelpExpanded, getHelpExpanded, setFocusedPane } from "./statusline.js";
import { initModes } from "./modes.js";

// Type → series lookup for `:new <type>` command. Mirrors SERIES_TYPES in
// new-item.js; kept here so :new can resolve the series before delegating.
const SERIES_TYPES = {
  accumulation: ['ticket', 'brochure', 'receipt', 'handout', 'document'],
  consumption:  ['film', 'book', 'album', 'ep', 'single', 'bag', 'game'],
  creation:     ['sketch', 'photo', 'prototype', 'video', 'note'],
  labor:        ['project', 'artifact', 'commission', 'contribution'],
  identity:     ['biography', 'cv-entry', 'contact'],
};
function findSeriesForType(type) {
  for (const [series, types] of Object.entries(SERIES_TYPES)) {
    if (types.includes(type)) return series;
  }
  return null;
}

// ── Custom crosshair cursor (+ idle pulse + decay trail) ──────────────────────

function initCursor() {
  if (!window.matchMedia('(pointer: fine)').matches) return;

  const app = document.getElementById('admin-app');
  if (!app) return;

  // Main cursor element
  const el = document.createElement('div');
  el.className = 'admin-cursor';
  document.body.appendChild(el);

  // Ghost pool for decay trail
  const GHOST_COUNT = 7;
  const ghosts = Array.from({ length: GHOST_COUNT }, () => {
    const g = document.createElement('div');
    g.className = 'admin-cursor-ghost';
    document.body.appendChild(g);
    return g;
  });
  let ghostIdx  = 0;
  let lastGX    = 0;
  let lastGY    = 0;
  let idleTimer = null;

  function scheduleIdle() {
    clearTimeout(idleTimer);
    el.classList.remove('idle-pulse');
    idleTimer = setTimeout(() => {
      if (el.classList.contains('visible')) el.classList.add('idle-pulse');
    }, 2000);
  }

  document.addEventListener('mousemove', (e) => {
    el.style.left = e.clientX + 'px';
    el.style.top  = e.clientY + 'px';
    el.classList.remove('idle-pulse');
    scheduleIdle();

    if (el.classList.contains('visible')) {
      const dist = Math.hypot(e.clientX - lastGX, e.clientY - lastGY);
      if (dist > 10) {
        const g = ghosts[ghostIdx++ % GHOST_COUNT];
        g.style.left   = lastGX + 'px';
        g.style.top    = lastGY + 'px';
        const cross    = el.classList.contains('is-interactive');
        g.style.width  = cross ? '1px'  : '7px';
        g.style.height = cross ? '14px' : '7px';
        g.classList.remove('decaying');
        void g.offsetHeight;            // reflow to restart animation
        g.classList.add('decaying');
        lastGX = e.clientX;
        lastGY = e.clientY;
      }
    }
  });

  app.addEventListener('mouseenter', (e) => {
    lastGX = e.clientX;
    lastGY = e.clientY;
    el.style.left = e.clientX + 'px';
    el.style.top  = e.clientY + 'px';

    el.classList.add('visible');
    el.classList.remove('entering');
    void el.offsetWidth;
    el.classList.add('entering');
    el.addEventListener('animationend', () => el.classList.remove('entering'), { once: true });
    scheduleIdle();
  });

  app.addEventListener('mouseleave', () => {
    el.classList.remove('visible', 'idle-pulse');
    clearTimeout(idleTimer);
  });

  // Interactive elements: cursor stretches into a crosshair
  const INTERACTIVE = [
    'a', 'button', 'label',
    '[role="button"]', '[tabindex="0"]',
    '.admin-gutter',
  ].join(', ');

  document.addEventListener('mouseover', (e) => {
    el.classList.toggle('is-interactive', !!e.target.closest(INTERACTIVE));
  });

  // Click flash
  document.addEventListener('mousedown', () => {
    el.classList.remove('idle-pulse');
    el.classList.add('clicking');
  });
  document.addEventListener('mouseup', () => el.classList.remove('clicking'));
}

// ── Status bar clock ──────────────────────────────────────────────────────────

function initClock() {
  function tick() {
    const t = document.getElementById('admin-status-time');
    if (!t) return;
    const n = new Date();
    t.textContent =
      n.getHours().toString().padStart(2, '0')   + ':' +
      n.getMinutes().toString().padStart(2, '0') + ':' +
      n.getSeconds().toString().padStart(2, '0');
  }
  tick();
  setInterval(tick, 1000);
}

// ── Shell render ──────────────────────────────────────────────────────────────
// Three panes (Explorer / Record / Log) with two draggable gutters,
// plus a two-row status bar (state row + keymap legend).
// Pane bodies are placeholders for now — real content lands in later phases.

function renderShell() {
  const root = document.getElementById('admin-app');
  root.innerHTML = `
    <header class="admin-topbar">
      <div class="admin-identity">
        <span class="admin-identity-name">ARCHIVE_SYS</span>
        <span class="admin-identity-sub">v0.1.0&nbsp;<span class="admin-identity-cursor"></span></span>
      </div>
      <div class="admin-topbar-breadcrumb" id="admin-topbar-breadcrumb"></div>
    </header>

    <div class="admin-shell" id="admin-shell">
      <section class="admin-pane" data-pane="e" id="pane-explorer">
        <span class="admin-pane-label"><span class="admin-pane-letter">e</span> Explorer</span>
        <div class="admin-pane-body">
          <div class="admin-placeholder">
            tree of items, series, types
            <span class="admin-placeholder-sub">— coming next</span>
          </div>
        </div>
      </section>

      <div class="admin-gutter admin-gutter-v"
           id="gutter-v"
           role="separator"
           aria-orientation="vertical"
           aria-label="Resize explorer pane"
           tabindex="0"></div>

      <div class="admin-shell-right">
        <section class="admin-pane" data-pane="r" id="pane-record">
          <span class="admin-pane-label"><span class="admin-pane-letter">r</span> Record</span>
          <div class="admin-pane-body">
            <div class="admin-placeholder">
              active item / form / dashboard
              <span class="admin-placeholder-sub">— coming next</span>
            </div>
          </div>
        </section>

        <div class="admin-gutter admin-gutter-h"
             id="gutter-h"
             role="separator"
             aria-orientation="horizontal"
             aria-label="Resize record pane"
             tabindex="0"></div>

        <section class="admin-pane" data-pane="l" id="pane-log">
          <span class="admin-pane-label"><span class="admin-pane-letter">l</span> Log</span>
          <div class="admin-pane-body">
            <div class="admin-placeholder">
              pending changes &amp; commit status
              <span class="admin-placeholder-sub">— coming next</span>
            </div>
          </div>
        </section>
      </div>
    </div>

    <nav class="admin-mobile-tabs" id="admin-mobile-tabs" aria-label="Pane switcher">
      <button class="admin-mobile-tab" data-tab="e" type="button">
        <span class="admin-mobile-tab-letter">e</span>
        <span class="admin-mobile-tab-label">Explorer</span>
      </button>
      <button class="admin-mobile-tab" data-tab="r" type="button">
        <span class="admin-mobile-tab-letter">r</span>
        <span class="admin-mobile-tab-label">Record</span>
      </button>
      <button class="admin-mobile-tab" data-tab="l" type="button">
        <span class="admin-mobile-tab-letter">l</span>
        <span class="admin-mobile-tab-label">Log</span>
      </button>
    </nav>

    <footer class="admin-statusbar" id="admin-statusbar">
      <div class="admin-statusbar-row admin-statusbar-state">
        <span class="admin-status-state" id="admin-status-state">⏵ ready</span>
        <span class="admin-status-mode"  id="admin-status-mode">-- NORMAL --</span>
        <span class="admin-status-time"  id="admin-status-time"></span>
      </div>
      <div class="admin-statusbar-row admin-statusbar-keymap" id="admin-status-keymap"></div>
    </footer>
  `;
}

// ── Mobile tab handling (Phase 8) ─────────────────────────────────────────────
// At ≤700px only one pane is visible at a time; the bottom tabstrip swaps
// between Explorer / Record / Log. The functions below are harmless on desktop
// (the CSS rules that depend on .is-mobile-active are inside a media query).

function setMobileActivePane(code) {
  document.querySelectorAll('.admin-pane[data-pane]').forEach((p) => {
    p.classList.toggle('is-mobile-active', p.dataset.pane === code);
  });
  document.querySelectorAll('.admin-mobile-tab').forEach((t) => {
    t.classList.toggle('is-active', t.dataset.tab === code);
  });
}

function initMobileTabs() {
  document.querySelectorAll('.admin-mobile-tab').forEach((t) => {
    t.addEventListener('click', () => setMobileActivePane(t.dataset.tab));
  });
  setMobileActivePane('e');
}

function flattenArchive(archive) {
  const items = [];
  for (const [seriesKey, series] of Object.entries(archive.series || {})) {
    for (const item of series.items || []) {
      items.push({ ...item, _series: seriesKey, _sub: null });
    }
    for (const [subKey, sub] of Object.entries(series.subcollections || {})) {
      for (const item of sub.items || []) {
        items.push({ ...item, _series: seriesKey, _sub: subKey });
      }
    }
  }
  return items;
}

// ── Record pane plumbing ─────────────────────────────────────────────────────
// These small helpers thread the click→open flow between Explorer, the empty
// state's Recent/Attention lists, and the edit-item view.

function openItem(item, allItems, archive) {
  openRecord((body) => {
    renderEditItem(body, item, allItems, archive, {
      onClose: () => openEmpty(archive, allItems),
    });
  });
  // Keep the Explorer's selection synced with what the Record pane is showing
  selectInTree(item.id);
  // On mobile, swap the visible pane to Record so the user sees what they opened
  setMobileActivePane('r');
  // Move keyboard focus to the Record pane so arrow keys navigate the form
  setFocusedPane('r');
}

function openEmpty(archive, allItems) {
  clearRecord();
  openRecord((body) => {
    renderEmptyState(body, archive, allItems, {
      onItemSelect: (item) => openItem(item, allItems, archive),
    });
  });
}

// ── Init ──────────────────────────────────────────────────────────────────────

async function init() {
  renderShell();
  initCursor();
  initShellResize();
  initClock();
  initMobileTabs();

  // Status bar (state text, mode chip, contextual keymap legend, focused pane).
  // Owns the subscriber that converts state changes into status-row updates.
  initStatusline();

  // Log pane scaffold + commit affordance.
  initLog();

  // Explorer scaffold (tree wrap + progress bar) and the archive load.
  initExplorer();
  setExplorerProgress(true);
  setBaseState('loading archive…', 'loading');

  try {
    const archive  = await loadArchive();
    const allItems = flattenArchive(archive);

    // Update base state BEFORE setState so the statusline subscriber, which
    // fires synchronously, reads the post-load text instead of the loading one.
    setBaseState(`⏵ archive loaded · ${allItems.length} items`, null);

    setState({ archive, allItems });

    renderExplorer(archive, {
      onItemSelect: (item) => openItem(item, allItems, archive),
    });
    setLogCallbacks({
      onItemSelect: (item) => openItem(item, allItems, archive),
    });
    openEmpty(archive, allItems);

    // Vim-style mode engine and `:` command handlers. Bound here so the
    // closure captures the current archive + allItems.
    initModes({
      on_w:    () => triggerCommit(),
      on_q:    () => openEmpty(archive, allItems),
      on_e:    (id) => {
        if (!id) return;
        const item = allItems.find(i => i.id === id);
        if (item) openItem(item, allItems, archive);
        else      setBaseState(`! no item with id ${id}`, 'error');
      },
      on_new:  (type) => {
        if (!type) return;
        const series = findSeriesForType(type);
        if (!series) {
          setBaseState(`! unknown type: ${type}`, 'error');
          return;
        }
        openRecord((body) => {
          renderNewItem(body, archive, { series, itemType: type }, {
            onClose: () => openEmpty(archive, allItems),
          });
        });
      },
      on_tags: (arg) => {
        const mode = arg === 'replace' ? 'replace' : (arg === 'merge' ? 'merge' : undefined);
        openRecord((body) => {
          renderImportLetterboxd(body, archive, allItems, {
            mode,
            onClose: () => openEmpty(archive, allItems),
          });
        });
        setMobileActivePane('r');
        setFocusedPane('r');
      },
      on_nohl: () => clearExplorerMatched(),
      on_help: () => setHelpExpanded(!getHelpExpanded()),
    });
  } catch (e) {
    showExplorerError();
    setBaseState('! archive load failed', 'error');
    console.error('[admin] archive load failed:', e);
  } finally {
    setExplorerProgress(false);
  }
}

init();
