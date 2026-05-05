import "./styles.css";
import { initRouter } from "./router.js";
import { setState, getState, subscribe } from "./state.js";
import { loadArchive, commitAll } from "./lib/api.js";
import { toCountersYAML } from "./lib/serializer.js";
import { renderDashboard } from "./views/dashboard.js";
import { renderNewItem }   from "./views/new-item.js";
import { renderBrowse }    from "./views/browse.js";
import { renderEditItem }  from "./views/edit-item.js";

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

function getContent() {
  return document.getElementById("admin-content");
}

function clearBreadcrumb() {
  const el = document.getElementById("admin-topbar-breadcrumb");
  if (el) el.innerHTML = "";
}

// ── Command bar ──────────────────────────────────────────────────────────────

// Each entry: keys that trigger it (first = canonical), display label, hint, fill text
const COMMAND_DEFS = [
  { keys: ['dashboard', 'd', 'dash'], display: 'dashboard',  hint: 'main view',        fill: 'dashboard' },
  { keys: ['browse',    'b'],         display: 'browse',     hint: 'all items',         fill: 'browse'    },
  { keys: ['new',       'n'],         display: 'new',        hint: 'create item',       fill: 'new '      },
  { keys: ['edit'],                   display: 'edit <id>',  hint: 'open for editing',  fill: 'edit '     },
  { keys: ['find'],                   display: 'find <q>',   hint: 'filter items',      fill: 'find '     },
  { keys: ['commit'],                 display: 'commit',     hint: 'push to github',    fill: 'commit'    },
  { keys: ['help',      '?'],         display: 'help',       hint: 'show commands',     fill: 'help'      },
];

function getSuggestions(val) {
  const lower = val.toLowerCase().trim();
  if (!lower) return COMMAND_DEFS;
  return COMMAND_DEFS.filter(def =>
    def.keys.some(k => k.startsWith(lower) || lower.startsWith(k + ' '))
  );
}

function getGhostText(val) {
  if (!val) return '';
  const lower = val.toLowerCase();
  const defs  = COMMAND_DEFS.filter(def => def.keys[0].startsWith(lower) && def.keys[0] !== lower);
  return defs.length === 1 ? defs[0].keys[0].slice(lower.length) : '';
}

const cmdHistory = [];
let historyIdx   = -1;
let statusTimer  = null;

function getCmdBar()    { return document.getElementById('admin-cmdbar'); }
function getCmdInput()  { return document.getElementById('admin-cmd-input'); }
function getCmdStatus() { return document.getElementById('admin-cmd-status'); }
function getCmdAc()     { return document.getElementById('admin-cmd-ac'); }

function setCmdStatus(msg, cls, dur) {
  const el = getCmdStatus();
  if (!el) return;
  el.className  = 'admin-cmd-status' + (cls ? ' ' + cls : '');
  el.textContent = msg;
  if (statusTimer) clearTimeout(statusTimer);
  if (dur) {
    statusTimer = setTimeout(() => {
      el.className  = 'admin-cmd-status';
      el.textContent = getCmdBar()?.classList.contains('active') ? 'SYS READY' : 'STANDBY';
    }, dur);
  }
}

function getAutocomplete(val) {
  if (!val) return '';
  const lower = val.toLowerCase();
  const parts = lower.split(' ');
  const base  = parts[0];
  const arg   = parts.slice(1).join('');

  if (base === 'new' && arg) {
    const m = TYPE_HINTS.find(t => t.startsWith(arg) && t !== arg);
    return m ? m.slice(arg.length) : '';
  }
  const matches = COMPLETIONS.filter(c => c.startsWith(lower) && c !== lower);
  return matches.length === 1 ? matches[0].slice(lower.length) : '';
}

function runCommand(raw) {
  const val = raw.trim();
  if (!val) return;

  if (cmdHistory[0] !== val) {
    cmdHistory.unshift(val);
    if (cmdHistory.length > 20) cmdHistory.pop();
  }
  historyIdx = -1;

  const parts = val.split(' ');
  const base  = parts[0].toLowerCase();
  const arg   = parts.slice(1).join(' ').trim();

  if (base === 'new' && arg) {
    window.__adminPreselect = { type: arg };
    location.hash = '#/new';
    setCmdStatus('→ NEW ITEM [' + arg + ']', 'nav', 2500);
    return;
  }
  if (base === 'edit' && arg) {
    location.hash = '#/edit/' + arg;
    setCmdStatus('→ EDITING ' + arg.toUpperCase(), 'nav', 2500);
    return;
  }
  if (base === 'find' && arg) {
    location.hash = '#/browse';
    setCmdStatus('→ BROWSE: ' + arg, 'nav', 2500);
    return;
  }

  const handlers = {
    d:         () => { location.hash = '#/';       setCmdStatus('→ DASHBOARD', 'nav', 2000); },
    dash:      () => { location.hash = '#/';       setCmdStatus('→ DASHBOARD', 'nav', 2000); },
    dashboard: () => { location.hash = '#/';       setCmdStatus('→ DASHBOARD', 'nav', 2000); },
    b:         () => { location.hash = '#/browse'; setCmdStatus('→ BROWSE',    'nav', 2000); },
    browse:    () => { location.hash = '#/browse'; setCmdStatus('→ BROWSE',    'nav', 2000); },
    n:         () => { location.hash = '#/new';    setCmdStatus('→ NEW ITEM',  'nav', 2000); },
    new:       () => { location.hash = '#/new';    setCmdStatus('→ NEW ITEM',  'nav', 2000); },
    commit:    () => handleCommitAll(),
    '?':       () => setCmdStatus('d · b · n · new <type> · edit <id> · find <q> · commit', null, 6000),
    help:      () => setCmdStatus('d · b · n · new <type> · edit <id> · find <q> · commit', null, 6000),
  };

  const handler = handlers[base];
  if (handler) {
    handler();
  } else {
    setCmdStatus('unknown: ' + base, 'error', 2500);
  }
}

function initCommandBar() {
  const input = getCmdInput();
  const ac    = getCmdAc();
  const bar   = getCmdBar();
  const sugg  = document.getElementById('admin-cmd-suggestions');
  if (!input || !bar) return;

  let suggIdx  = -1;
  let suggList = [];

  // ── Suggestion list ───────────────────────────────────────────
  function renderSuggestions(val) {
    if (!sugg) return;
    suggList = getSuggestions(val);
    suggIdx  = -1;
    sugg.innerHTML = '';
    for (let i = 0; i < suggList.length; i++) {
      const def  = suggList[i];
      const item = document.createElement('div');
      item.className = 'admin-cmd-suggestion';
      item.innerHTML =
        `<span class="admin-cmd-suggestion-prompt" aria-hidden="true">&gt;</span>` +
        `<span class="admin-cmd-suggestion-cmd">${def.display}</span>` +
        `<span class="admin-cmd-suggestion-hint">${def.hint}</span>`;
      item.addEventListener('mousedown', (e) => {
        e.preventDefault();
        acceptSuggestion(def);
      });
      sugg.appendChild(item);
    }
  }

  function updateFocused() {
    if (!sugg) return;
    sugg.querySelectorAll('.admin-cmd-suggestion').forEach((el, i) =>
      el.classList.toggle('focused', i === suggIdx)
    );
    if (suggIdx >= 0) sugg.querySelectorAll('.admin-cmd-suggestion')[suggIdx]
      ?.scrollIntoView({ block: 'nearest' });
  }

  function hideSuggestions() {
    if (sugg) sugg.innerHTML = '';
    suggList = [];
    suggIdx  = -1;
  }

  function acceptSuggestion(def) {
    input.value = def.fill;
    if (ac) ac.textContent = '';
    hideSuggestions();
    if (def.fill.endsWith(' ')) {
      // needs an argument — leave input focused for user to complete
      input.focus();
    } else {
      runCommand(def.fill);
      input.value = '';
      input.blur();
    }
  }

  // ── Activation ───────────────────────────────────────────────
  document.addEventListener('keydown', (e) => {
    if (
      e.key === '/' &&
      !e.ctrlKey && !e.metaKey &&
      !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName) &&
      !document.activeElement.classList.contains('admin-select')
    ) {
      e.preventDefault();
      input.value = '';
      if (ac) ac.textContent = '';
      bar.classList.add('active');
      input.focus();
      renderSuggestions('');
    }
  });

  bar.addEventListener('click', (e) => {
    if (e.target.closest('.admin-cmd-suggestion')) return;
    bar.classList.add('active'); // unhide input before focusing it
    input.focus();
  });

  input.addEventListener('focus', () => {
    bar.classList.add('active');
    renderSuggestions(input.value);
    const { pendingChanges, status } = getState();
    if (!pendingChanges.length && !status) setCmdStatus('SYS READY', null);
  });

  input.addEventListener('blur', () => {
    setTimeout(() => {
      bar.classList.remove('active');
      input.value = '';
      if (ac) ac.textContent = '';
      hideSuggestions();
      const { pendingChanges, status } = getState();
      if (!pendingChanges.length && !status) setCmdStatus('STANDBY', null);
    }, 100);
  });

  // ── Keyboard ─────────────────────────────────────────────────
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (suggIdx >= 0 && suggList[suggIdx]) {
        acceptSuggestion(suggList[suggIdx]);
      } else {
        const val = input.value;
        input.value = '';
        if (ac) ac.textContent = '';
        hideSuggestions();
        input.blur();
        runCommand(val);
      }

    } else if (e.key === 'Escape') {
      input.value = '';
      if (ac) ac.textContent = '';
      hideSuggestions();
      input.blur();

    } else if (e.key === 'Tab') {
      e.preventDefault();
      if (suggIdx >= 0 && suggList[suggIdx]) {
        acceptSuggestion(suggList[suggIdx]);
      } else if (ac && ac.textContent) {
        input.value += ac.textContent;
        if (ac) ac.textContent = '';
        renderSuggestions(input.value);
      }

    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (suggList.length > 0) {
        suggIdx = Math.min(suggIdx + 1, suggList.length - 1);
        updateFocused();
      } else {
        historyIdx = Math.max(historyIdx - 1, -1);
        input.value = historyIdx >= 0 ? cmdHistory[historyIdx] : '';
      }

    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (suggList.length > 0) {
        suggIdx = Math.max(suggIdx - 1, -1);
        updateFocused();
      } else {
        historyIdx = Math.min(historyIdx + 1, cmdHistory.length - 1);
        if (cmdHistory[historyIdx]) input.value = cmdHistory[historyIdx];
      }
    }
  });

  input.addEventListener('input', () => {
    historyIdx = -1;
    renderSuggestions(input.value);
    if (ac) ac.textContent = getGhostText(input.value);
  });

  // ── Clock ─────────────────────────────────────────────────────
  function tick() {
    const t = document.getElementById('admin-cmd-time');
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

// ── Status / state sync ──────────────────────────────────────────────────────

function updateCmdBar() {
  const { status, statusMessage, pendingChanges } = getState();
  const n   = pendingChanges.length;
  const bar = getCmdBar();
  if (!bar) return;

  // Don't clobber an active command session
  if (bar.classList.contains('active')) return;

  const statusEl = getCmdStatus();
  if (!statusEl) return;

  if (statusTimer) clearTimeout(statusTimer);

  // Pending changes: show count + commit button
  if (n > 0 && !status) {
    statusEl.className  = 'admin-cmd-status pending';
    statusEl.textContent = `${n} unsaved change${n > 1 ? 's' : ''}`;

    let commitBtn = document.getElementById('admin-commit-btn');
    if (!commitBtn) {
      commitBtn = document.createElement('button');
      commitBtn.id          = 'admin-commit-btn';
      commitBtn.className   = 'admin-commit-btn';
      commitBtn.textContent = '[ COMMIT ALL ]';
      commitBtn.addEventListener('click', handleCommitAll);
      const timeEl = document.getElementById('admin-cmd-time');
      bar.insertBefore(commitBtn, timeEl || null);
    }
    commitBtn.style.display = '';
    return;
  }

  // Hide commit button
  const commitBtn = document.getElementById('admin-commit-btn');
  if (commitBtn) commitBtn.style.display = 'none';

  if (!status) {
    statusEl.className  = 'admin-cmd-status';
    statusEl.textContent = 'STANDBY';
  } else {
    statusEl.className  = `admin-cmd-status ${status}`;
    statusEl.textContent = statusMessage || '';
    if (status === 'saved') {
      statusTimer = setTimeout(() => {
        statusEl.className  = 'admin-cmd-status';
        statusEl.textContent = 'STANDBY';
      }, 3000);
    }
  }
}

// ── Commit handler ───────────────────────────────────────────────────────────

async function handleCommitAll() {
  const { pendingChanges, archive } = getState();
  if (!pendingChanges.length) return;

  const counters = archive._counters || {};
  const newIds   = pendingChanges.filter(p => p.action === "add").map(p => p.id);
  const editIds  = pendingChanges.filter(p => p.action === "edit").map(p => p.id);
  const parts    = [];
  if (newIds.length)  parts.push(`add ${newIds.length}: ${newIds.join(", ")}`);
  if (editIds.length) parts.push(`edit ${editIds.length}: ${editIds.join(", ")}`);
  const message = parts.join("; ");

  setState({ status: "saving", statusMessage: "Committing to GitHub…" });

  try {
    const result = await commitAll({
      files: pendingChanges.map(p => ({ filePath: p.filePath, content: p.content })),
      countersPath: "src/content/_id-counters.yaml",
      countersContent: toCountersYAML(counters),
      message,
    });

    if (result.ok) {
      const count = pendingChanges.length;
      setState({ pendingChanges: [], status: "saved", statusMessage: `Committed ${count} change${count > 1 ? "s" : ""}` });
      setTimeout(() => setState({ status: null, statusMessage: "" }), 3000);
    } else {
      setState({ status: "error", statusMessage: `Commit failed: ${result.error}` });
    }
  } catch (e) {
    setState({ status: "error", statusMessage: `Network error: ${e.message}` });
  }
}

// ── Cursor ───────────────────────────────────────────────────────────────────

function initCursor() {
  if (!window.matchMedia('(pointer: fine)').matches) return;

  const app = document.getElementById('admin-app');
  if (!app) return;

  // ── Main cursor ───────────────────────────────────────────────
  const el = document.createElement('div');
  el.className = 'admin-cursor';
  document.body.appendChild(el);

  // ── Ghost pool for decay trail ────────────────────────────────
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

  // ── Idle pulse ────────────────────────────────────────────────
  let idleTimer = null;

  function scheduleIdle() {
    clearTimeout(idleTimer);
    el.classList.remove('idle-pulse');
    idleTimer = setTimeout(() => {
      if (el.classList.contains('visible')) el.classList.add('idle-pulse');
    }, 2000);
  }

  // ── Mouse movement ────────────────────────────────────────────
  document.addEventListener('mousemove', (e) => {
    el.style.left = e.clientX + 'px';
    el.style.top  = e.clientY + 'px';
    el.classList.remove('idle-pulse');
    scheduleIdle();

    // Drop a ghost every ~10px of travel, only while cursor is visible
    if (el.classList.contains('visible')) {
      const dist = Math.hypot(e.clientX - lastGX, e.clientY - lastGY);
      if (dist > 10) {
        const g = ghosts[ghostIdx++ % GHOST_COUNT];
        g.style.left   = lastGX + 'px';
        g.style.top    = lastGY + 'px';
        // Match the cursor's current shape
        const cross = el.classList.contains('is-interactive');
        g.style.width  = cross ? '1px'  : '7px';
        g.style.height = cross ? '14px' : '7px';
        // Restart decay animation
        g.classList.remove('decaying');
        void g.offsetHeight; // force reflow
        g.classList.add('decaying');
        lastGX = e.clientX;
        lastGY = e.clientY;
      }
    }
  });

  // ── Frame enter / leave ───────────────────────────────────────
  app.addEventListener('mouseenter', (e) => {
    lastGX = e.clientX;
    lastGY = e.clientY;
    el.style.left = e.clientX + 'px';
    el.style.top  = e.clientY + 'px';

    // Entry sweep — grow from center like a scan beam landing
    el.classList.add('visible');
    el.classList.remove('entering');
    void el.offsetWidth; // reflow to restart animation
    el.classList.add('entering');
    el.addEventListener('animationend', () => el.classList.remove('entering'), { once: true });
    scheduleIdle();
  });

  app.addEventListener('mouseleave', () => {
    el.classList.remove('visible', 'idle-pulse');
    clearTimeout(idleTimer);
  });

  // ── Interactive state ─────────────────────────────────────────
  const INTERACTIVE = [
    'a', 'button', 'label',
    '[role="button"]', '[tabindex="0"]',
    '.admin-select', '.admin-quick-btn',
    '.admin-step-tile', '.admin-depth-btn',
    '.admin-table th', '.admin-cmdbar',
    '.admin-commit-btn',
  ].join(', ');

  document.addEventListener('mouseover', (e) => {
    el.classList.toggle('is-interactive', !!e.target.closest(INTERACTIVE));
  });

  // ── Click flash ───────────────────────────────────────────────
  document.addEventListener('mousedown', () => {
    el.classList.remove('idle-pulse');
    el.classList.add('clicking');
  });
  document.addEventListener('mouseup', () => el.classList.remove('clicking'));
}

// ── Init ─────────────────────────────────────────────────────────────────────

async function init() {
  const root = document.getElementById("admin-app");
  root.innerHTML = `
    <header class="admin-topbar">
      <div class="admin-identity">
        <span class="admin-identity-name">ARCHIVE_SYS</span>
        <span class="admin-identity-sub">v0.1.0&nbsp;<span class="admin-identity-cursor"></span></span>
      </div>
      <div class="admin-topbar-breadcrumb" id="admin-topbar-breadcrumb"></div>
    </header>
    <main class="admin-main" id="admin-content">
      <div class="admin-empty">Loading archive…</div>
    </main>
    <div class="admin-cmdbar" id="admin-cmdbar">
      <div class="admin-cmd-suggestions" id="admin-cmd-suggestions"></div>
      <span class="admin-cmd-prompt">&gt;</span>
      <input class="admin-cmd-input" id="admin-cmd-input" autocomplete="off" spellcheck="false" />
      <span class="admin-cmd-ac" id="admin-cmd-ac"></span>
      <span class="admin-cmd-status" id="admin-cmd-status">STANDBY</span>
      <span class="admin-cmd-time" id="admin-cmd-time"></span>
    </div>
  `;

  subscribe(updateCmdBar);
  initCommandBar();
  initCursor();

  let archive;
  try {
    archive = await loadArchive();
  } catch (e) {
    getContent().innerHTML = `<div class="admin-empty">Failed to load archive.json — run <code>npm run build-data</code> first.</div>`;
    return;
  }

  const allItems = flattenArchive(archive);
  setState({ archive, allItems });

  initRouter({
    "/new":    () => {
      clearBreadcrumb();
      const pre = window.__adminPreselect;
      window.__adminPreselect = null;
      renderNewItem(getContent(), archive, pre || null);
    },
    "/browse": () => { clearBreadcrumb(); renderBrowse(getContent(), allItems); },
    "/edit/":  (hash) => { clearBreadcrumb(); renderEditItem(getContent(), hash.replace("/edit/", ""), allItems, archive); },
    "/":       () => { clearBreadcrumb(); renderDashboard(getContent(), archive, allItems); },
  });
}

init();
