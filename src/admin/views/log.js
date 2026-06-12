// ── Log pane (Phase 4) ───────────────────────────────────────────────────────
// Shows pending changes staged for commit, the commit affordance, and a short
// session-scoped history of recent commits. Subscribes to state so any save
// in the editor refreshes the list immediately.
//
// Pending row format (git-status shorthand):
//   M  ITEM-0142  src/content/labor/.../item-slug.md
//   A  EPH-0019   src/content/accumulation/...
//   D  …
//
// Click a pending row → open that item in the [r] Record pane (same code path
// as Explorer leaf click). Click the commit button → bundle all pending into
// one GitHub commit via commitAll().

import { getState, setState, subscribe } from "../state.js";
import { commitAll } from "../lib/api.js";
import { toCountersYAML } from "../lib/serializer.js";
import { registerPaneNav, refreshHighlight } from "../nav.js";

const HISTORY_LIMIT = 5;
const sessionCommits = [];

let onItemSelectFn = null;

// ── Public API ───────────────────────────────────────────────────────────────

export function initLog() {
  const body = document.querySelector('#pane-log .admin-pane-body');
  if (!body) return;

  body.innerHTML = `
    <div class="admin-log">
      <div class="admin-log-header" id="log-header"></div>
      <ul class="admin-log-list" id="log-pending"></ul>
      <div class="admin-log-history">
        <h3 class="admin-log-history-title">Recent commits</h3>
        <ul class="admin-log-commits" id="log-commits"></ul>
      </div>
    </div>
  `;

  subscribe(() => renderLog(getState()));
  renderLog(getState());
}

export function setLogCallbacks(callbacks = {}) {
  onItemSelectFn = callbacks.onItemSelect || null;
}

/**
 * Public commit trigger — invoked by the `:w` command in modes.js. Same code
 * path as the inline commit button in the Log header.
 */
export function triggerCommit() {
  return handleCommit();
}

// ── Render ───────────────────────────────────────────────────────────────────

function renderLog(state) {
  renderHeader(state);
  renderPending(state.pendingChanges || []);
  renderCommits();
}

function renderHeader(state) {
  const header = document.getElementById('log-header');
  if (!header) return;

  const pending = state.pendingChanges || [];

  // While a commit is in flight we lock the button and surface the message
  if (state.status === 'saving') {
    header.innerHTML = `
      <span class="admin-log-status admin-log-status--saving">${escapeHTML(state.statusMessage || 'committing…')}</span>
    `;
    return;
  }
  if (state.status === 'error') {
    header.innerHTML = `
      <span class="admin-log-status admin-log-status--error">${escapeHTML(state.statusMessage || 'error')}</span>
      ${pending.length ? renderCommitButton(pending.length) : ''}
    `;
    attachCommitHandler();
    return;
  }
  if (state.status === 'saved') {
    header.innerHTML = `
      <span class="admin-log-status admin-log-status--saved">${escapeHTML(state.statusMessage || 'committed')}</span>
    `;
    return;
  }

  if (pending.length === 0) {
    header.innerHTML = `
      <span class="admin-log-empty-hint">No pending changes.</span>
    `;
    return;
  }

  header.innerHTML = `
    <span class="admin-log-count">${pending.length} pending</span>
    ${renderCommitButton(pending.length)}
  `;
  attachCommitHandler();
}

function renderCommitButton(n) {
  return `<button class="admin-btn admin-log-commit-btn" id="log-commit">commit ${n}</button>`;
}

function attachCommitHandler() {
  const btn = document.getElementById('log-commit');
  if (btn) btn.addEventListener('click', handleCommit);
}

function renderPending(pending) {
  const list = document.getElementById('log-pending');
  if (!list) return;

  list.innerHTML = '';

  if (pending.length === 0) {
    refreshHighlight('l');
    return;
  }

  for (const change of pending) {
    const li = document.createElement('li');
    li.className = 'admin-log-row';
    li.dataset.itemId = change.id;

    const action = String(change.action || 'edit');
    const prefix = actionPrefix(action);

    li.innerHTML = `
      <span class="admin-log-action admin-log-action--${action}">${prefix}</span>
      <span class="admin-log-id">${escapeHTML(change.id || '')}</span>
      <span class="admin-log-path" title="${escapeAttr(change.filePath || '')}">${escapeHTML(change.filePath || '')}</span>
    `;

    li.addEventListener('click', () => {
      // Visual selection
      list.querySelectorAll('.admin-log-row.is-selected').forEach(r => r.classList.remove('is-selected'));
      li.classList.add('is-selected');

      if (!onItemSelectFn) return;
      const { allItems } = getState();
      const item = (allItems || []).find(i => i.id === change.id);
      if (item) onItemSelectFn(item);
    });

    list.appendChild(li);
  }

  // Register / re-register pane nav over the newly-rendered pending rows.
  registerPaneNav('l', {
    container:   list,
    rowSelector: '.admin-log-row',
    onActivate:  (row) => {
      const id = row.dataset.itemId;
      if (!id || !onItemSelectFn) return;
      list.querySelectorAll('.admin-log-row.is-selected').forEach(r => r.classList.remove('is-selected'));
      row.classList.add('is-selected');
      const { allItems } = getState();
      const item = (allItems || []).find(i => i.id === id);
      if (item) onItemSelectFn(item);
    },
  });
}

function renderCommits() {
  const list = document.getElementById('log-commits');
  if (!list) return;

  list.innerHTML = '';

  if (sessionCommits.length === 0) {
    const li = document.createElement('li');
    li.className = 'admin-log-history-empty';
    li.textContent = 'No commits this session.';
    list.appendChild(li);
    return;
  }

  for (const c of sessionCommits.slice(0, HISTORY_LIMIT)) {
    const li = document.createElement('li');
    li.className = 'admin-log-history-row' + (c.ok ? '' : ' is-error');
    li.innerHTML = `
      <span class="admin-log-history-time">${escapeHTML(formatTime(c.timestamp))}</span>
      <span class="admin-log-history-msg">${escapeHTML(summarize(c))}</span>
      <span class="admin-log-history-result">${c.ok ? 'ok' : 'fail'}</span>
    `;
    if (!c.ok && c.error) li.title = c.error;
    list.appendChild(li);
  }
}

// ── Commit handler ───────────────────────────────────────────────────────────

async function handleCommit() {
  const { pendingChanges, archive } = getState();
  if (!pendingChanges?.length) return;

  const counters = archive?._counters || {};
  const newIds   = pendingChanges.filter(p => p.action === 'add').map(p => p.id);
  const editIds  = pendingChanges.filter(p => p.action === 'edit').map(p => p.id);
  const parts    = [];
  if (newIds.length)  parts.push(`add ${newIds.length}: ${newIds.join(', ')}`);
  if (editIds.length) parts.push(`edit ${editIds.length}: ${editIds.join(', ')}`);
  const message = parts.join('; ') || `commit ${pendingChanges.length} change${pendingChanges.length > 1 ? 's' : ''}`;

  const snapshot = pendingChanges.slice();   // capture for history entry
  setState({ status: 'saving', statusMessage: 'Committing to GitHub…' });

  try {
    const writes    = snapshot.map(p => ({ filePath: p.filePath, content: p.content }));
    // Renamed edits carry the old path — stage it for deletion in the same commit.
    const deletions = snapshot
      .filter(p => p.oldFilePath && p.oldFilePath !== p.filePath)
      .map(p => ({ filePath: p.oldFilePath, delete: true }));

    const result = await commitAll({
      files:           [...writes, ...deletions],
      countersPath:    'src/content/_id-counters.yaml',
      countersContent: toCountersYAML(counters),
      message,
    });

    if (result.ok) {
      sessionCommits.unshift({
        timestamp: new Date(),
        count:     snapshot.length,
        adds:      newIds.length,
        edits:     editIds.length,
        message,
        ok:        true,
      });
      setState({
        pendingChanges: [],
        status:         'saved',
        statusMessage:  `Committed ${snapshot.length} change${snapshot.length > 1 ? 's' : ''}`,
      });
      setTimeout(() => setState({ status: null, statusMessage: '' }), 3000);
    } else {
      sessionCommits.unshift({
        timestamp: new Date(),
        count:     snapshot.length,
        adds:      newIds.length,
        edits:     editIds.length,
        message,
        ok:        false,
        error:     result.error,
      });
      setState({ status: 'error', statusMessage: `Commit failed: ${result.error}` });
    }
  } catch (e) {
    sessionCommits.unshift({
      timestamp: new Date(),
      count:     snapshot.length,
      adds:      newIds.length,
      edits:     editIds.length,
      message,
      ok:        false,
      error:     e.message,
    });
    setState({ status: 'error', statusMessage: `Network error: ${e.message}` });
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function actionPrefix(action) {
  if (action === 'add')    return 'A';
  if (action === 'edit')   return 'M';
  if (action === 'delete') return 'D';
  return '·';
}

function summarize(c) {
  const parts = [];
  if (c.adds)  parts.push(`${c.adds} added`);
  if (c.edits) parts.push(`${c.edits} edited`);
  if (parts.length === 0) parts.push(`${c.count} change${c.count > 1 ? 's' : ''}`);
  return parts.join(', ');
}

function formatTime(d) {
  return d.getHours().toString().padStart(2, '0') + ':'
       + d.getMinutes().toString().padStart(2, '0');
}

function escapeHTML(s) {
  return String(s).replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

function escapeAttr(s) {
  return escapeHTML(s);
}
