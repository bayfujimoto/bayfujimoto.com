// ── Explorer pane (Phase 2) ──────────────────────────────────────────────────
// Renders the archive as a collapsible tree into the [e] Explorer pane.
//
// Tree shape:
//   * archive
//     ▼ Identity
//       · biography (3)        ← a homed constellation: opens its editor
//       ▶ cv (6)
//       ...
//     ▼ Consumption
//       ▶ films (487)
//       ...
//   * constellations
//     · Austin → SF (5)        ← one row per registry record
//     · Biography (3)
//     + new constellation        ← opens the blank registry form
//   * guide
//
// Expansion state is persisted to localStorage under 'admin.explorer.expanded'
// (the value is a JSON array of opened-node paths). On first run with no saved
// state, root and the five series are opened by default so the user can see
// the archive's shape immediately.
//
// Item selection is visual only in this phase. Phase 3 wires the click into
// opening the record in the [r] Record pane.

import { registerPaneNav, refreshHighlight, setHighlightedRow } from "../nav.js";
import { homedConstellationSlug } from "../../shared/constellation-homes.js";

const EXPANDED_KEY = 'admin.explorer.expanded';

let expanded         = null;
let itemsByPath      = new Map();
let onItemSelectFn   = null;
let onGuideSelectFn  = null;
let onConstellationSelectFn = null; // (slug | null) — null opens the new-constellation form
let navRegistered    = false;

// Filter state (Phase 6.5):
//   filter        — { query, mode, matchSet, ancestorSet, positionsMap } while filtering, null when not
//   matchedPaths  — Set retained AFTER filter exits, used to tint rows until :nohl
let filter          = null;
let matchedPaths    = new Set();

// Status-filter mode (typing "//" in the filter): the four record statuses, plus
// the live autocomplete suggestion list and the highlighted index.
const STATUSES      = ['draft', 'partial', 'complete', 'published'];
let statusSuggList  = [];
let statusSuggIdx   = 0;

function loadExpanded() {
  try {
    const raw = localStorage.getItem(EXPANDED_KEY);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch {
    return new Set();
  }
}

function saveExpanded(set) {
  try {
    localStorage.setItem(EXPANDED_KEY, JSON.stringify([...set]));
  } catch {}
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Inject the explorer's DOM scaffold (tree wrap + progress bar) into the
 * [e] Explorer pane body. Idempotent — safe to call multiple times.
 */
export function initExplorer() {
  const body = document.querySelector('#pane-explorer .admin-pane-body');
  if (!body) return;
  body.innerHTML = `
    <div class="admin-tree-wrap" id="explorer-tree-wrap">
      <div class="admin-tree-loading">Loading archive…</div>
    </div>
    <div class="admin-progress" id="explorer-progress"></div>
  `;
}

/**
 * Build the tree from `archive` and render it into the prepared scaffold.
 * Must be called after initExplorer().
 *
 *   renderExplorer(archive, { onItemSelect })
 *
 * `onItemSelect(item)` fires when the user clicks a leaf. The item passed is
 * the live archive item (not a tree node).
 */
export function renderExplorer(archive, callbacks = {}) {
  const wrap = document.getElementById('explorer-tree-wrap');
  if (!wrap) return;

  if (!expanded) expanded = loadExpanded();

  onItemSelectFn  = callbacks.onItemSelect  || null;
  onGuideSelectFn = callbacks.onGuideSelect || null;
  onConstellationSelectFn = callbacks.onConstellationSelect || null;
  itemsByPath = new Map();

  const model = buildModel(archive);

  // Constellations — the registry as a group beside the archive tree. Members
  // are assigned from either end: an item's chip field, or the constellation's
  // own editor (search the archive, add). The last row creates a new one.
  const constellationsNode = buildConstellationsModel(archive);

  // A 'guide' node sits at the same level as 'archive' — a top-level, editable
  // meta page (composed in Markdown), not part of the series tree.
  const guideNode = {
    type:  'guide',
    label: archive?.guide?.label || 'Guide',
    path:  'guide',
  };
  const forest = [model, constellationsNode, guideNode];

  // First-time defaults: open the root and every series so the user lands on
  // a meaningful skeleton instead of a single collapsed line.
  if (expanded.size === 0) {
    expanded.add(model.path);
    for (const s of model.children) expanded.add(s.path);
    expanded.add(constellationsNode.path);
  }

  wrap.innerHTML = renderForest(forest);
  wrap.__forest = forest;

  if (!wrap.__handlerAttached) {
    wrap.addEventListener('click', onTreeClick);
    wrap.__handlerAttached = true;
  }

  // Register pane nav for keyboard arrow navigation (Phase 9.5). Re-registering
  // is idempotent; the nav module preserves the last-highlighted path.
  registerExplorerNav();
}

/**
 * Toggle the progress bar at the bottom of the explorer pane.
 * Reusable for future commit/load operations beyond the initial archive fetch.
 */
export function setExplorerProgress(isActive) {
  const bar = document.getElementById('explorer-progress');
  if (bar) bar.classList.toggle('is-active', !!isActive);
}

// ── Filter API (Phase 6.5) ───────────────────────────────────────────────────

/**
 * Open the filter input at the top of the Explorer pane body. The mode engine
 * calls this on `/`. Sets the filter to an empty query — typing in the input
 * (via setFilter) is what shrinks the tree.
 */
export function enterFilter() {
  const body = document.querySelector('#pane-explorer .admin-pane-body');
  if (!body) return false;
  if (document.getElementById('explorer-filter')) return true;

  const bar = document.createElement('div');
  bar.className = 'admin-tree-filter';
  bar.id        = 'explorer-filter';
  bar.innerHTML = `
    <span class="admin-tree-filter-prompt">/</span>
    <input type="text"
           class="admin-tree-filter-input"
           id="explorer-filter-input"
           autocomplete="off"
           spellcheck="false"
           aria-label="Filter items (type // to filter by status)">
    <span class="admin-tree-filter-count" id="explorer-filter-count"></span>
    <div class="admin-tree-filter-suggest" id="explorer-filter-suggest" role="listbox" hidden></div>
  `;
  body.insertBefore(bar, body.firstChild);

  const input = document.getElementById('explorer-filter-input');
  input.addEventListener('input', () => setFilter(input.value));

  // Start with an empty filter — tree stays full until the user types.
  setFilter('');
  // Focus AFTER setFilter so the focus-in handler (modes.js) doesn't trip.
  // modes.js sets mode='filter' before calling enterFilter; the focusin handler
  // in modes.js skips its auto-INSERT branch while mode is 'filter'.
  input.focus();
  return true;
}

/**
 * Close the filter input. By default the matched paths are retained as a
 * subtle persistent tint until clearMatched(). Pass clearMatches=true to drop
 * the tint immediately (e.g., for an aborted/empty filter).
 */
export function exitFilter(clearMatches = false) {
  const bar = document.getElementById('explorer-filter');
  if (bar) bar.remove();
  statusSuggList = [];
  statusSuggIdx  = 0;

  if (filter && filter.matchSet && filter.query) {
    matchedPaths = new Set(filter.matchSet);
  } else if (clearMatches) {
    matchedPaths.clear();
  }
  filter = null;
  renderCurrent();
}

/**
 * Apply a query against the tree. Re-renders. Called from the filter input's
 * `input` event. Empty query → no shrink (full tree, no highlights).
 */
export function setFilter(query) {
  // Status mode: a leading "/" means the user typed "//" — the first slash opens
  // the filter, the second switches to filtering by record status. The status
  // name is autocompleted (draft / partial / complete / published).
  if (query.startsWith('/')) return setStatusFilter(query.slice(1));

  clearStatusSuggestions();

  const isFuzzy = query.startsWith('~');
  const q       = (isFuzzy ? query.slice(1) : query).trim();

  if (!q) {
    filter = { query: '', mode: 'substring', matchSet: new Set(), ancestorSet: null, positionsMap: new Map() };
    updateFilterCount(0);
    renderCurrent();
    return;
  }

  const matcher       = isFuzzy ? fuzzyMatch : substringMatch;
  const matchSet      = new Set();
  const ancestorSet   = new Set();
  const positionsMap  = new Map();

  for (const [path, item] of itemsByPath) {
    const target = (item.title || item.id || '').toString();
    const positions = matcher(q, target);
    if (positions) {
      matchSet.add(path);
      positionsMap.set(path, positions);
      // Add every ancestor path so the row is reachable in the tree
      const parts = path.split('/');
      for (let i = 1; i < parts.length; i++) {
        ancestorSet.add(parts.slice(0, i).join('/'));
      }
      ancestorSet.add(path);
    }
  }

  filter = { query: q, mode: isFuzzy ? 'fuzzy' : 'substring', matchSet, ancestorSet, positionsMap };
  updateFilterCount(matchSet.size);
  renderCurrent();
}

// ── Status filter ("//") ──────────────────────────────────────────────────────

/**
 * Filter the tree by record status. `rawTerm` is what follows the second slash.
 * An empty term shows the full tree with all four statuses offered as
 * suggestions; a term shrinks the tree to items whose status starts with it
 * (so "d" → drafts, "p" → partial + published).
 */
function setStatusFilter(rawTerm) {
  const term     = rawTerm.trim().toLowerCase();
  const matching = STATUSES.filter(s => !term || s.startsWith(term));

  const matchSet    = new Set();
  let   ancestorSet = null; // null = no shrink (empty term keeps the full tree)
  if (term) {
    ancestorSet = new Set();
    for (const [path, item] of itemsByPath) {
      const st = (item.status || '').toLowerCase();
      if (!matching.includes(st)) continue;
      matchSet.add(path);
      const parts = path.split('/');
      for (let i = 1; i < parts.length; i++) ancestorSet.add(parts.slice(0, i).join('/'));
      ancestorSet.add(path);
    }
  }

  filter = {
    query: '/' + rawTerm, mode: 'status', statusTerm: term,
    matchSet, ancestorSet, positionsMap: new Map(),
  };

  updateStatusSuggestions(matching);

  const countEl = document.getElementById('explorer-filter-count');
  if (countEl) countEl.textContent = term ? `${matchSet.size}/${itemsByPath.size}` : '';

  renderCurrent();
}

/** Render the status autocomplete dropdown with per-status counts. */
function updateStatusSuggestions(statuses) {
  const box = document.getElementById('explorer-filter-suggest');
  if (!box) return;

  const counts = {};
  for (const [, item] of itemsByPath) {
    const s = (item.status || '').toLowerCase();
    counts[s] = (counts[s] || 0) + 1;
  }

  statusSuggList = statuses;
  statusSuggIdx  = 0;

  if (!statuses.length) { box.hidden = true; box.innerHTML = ''; return; }

  box.hidden = false;
  box.innerHTML = statuses.map((s, i) => `
    <div class="admin-tree-filter-suggest-item admin-tree-leaf--${s}${i === 0 ? ' is-active' : ''}"
         data-status="${s}" role="option">
      <span class="admin-tree-filter-suggest-name">${s}</span>
      <span class="admin-tree-filter-suggest-count">${counts[s] || 0}</span>
    </div>`).join('');

  // mousedown (not click) so completion runs before the input loses focus.
  box.querySelectorAll('.admin-tree-filter-suggest-item').forEach(el => {
    el.addEventListener('mousedown', (e) => { e.preventDefault(); completeStatus(el.dataset.status); });
  });
}

function paintStatusSuggFocus() {
  const box = document.getElementById('explorer-filter-suggest');
  if (!box) return;
  box.querySelectorAll('.admin-tree-filter-suggest-item').forEach((el, i) => {
    el.classList.toggle('is-active', i === statusSuggIdx);
  });
}

function completeStatus(status) {
  const input = document.getElementById('explorer-filter-input');
  if (!input) return;
  input.value = '/' + status;
  setFilter(input.value);
  input.focus();
}

function clearStatusSuggestions() {
  statusSuggList = [];
  statusSuggIdx  = 0;
  const box = document.getElementById('explorer-filter-suggest');
  if (box) { box.hidden = true; box.innerHTML = ''; }
}

/** Move the highlighted status suggestion (Arrow keys). Returns true if handled. */
export function filterMoveSuggestion(dir) {
  if (!filter || filter.mode !== 'status' || !statusSuggList.length) return false;
  statusSuggIdx = (statusSuggIdx + dir + statusSuggList.length) % statusSuggList.length;
  paintStatusSuggFocus();
  return true;
}

/**
 * Complete the filter to the highlighted status (Tab / Enter). With
 * `onlyIfIncomplete`, does nothing when the term is already an exact status —
 * so Enter on a complete term falls through to activating the first match.
 * Returns true if it completed.
 */
export function filterComplete(onlyIfIncomplete = false) {
  if (!filter || filter.mode !== 'status' || !statusSuggList.length) return false;
  if (onlyIfIncomplete && STATUSES.includes(filter.statusTerm)) return false;
  completeStatus(statusSuggList[statusSuggIdx] || statusSuggList[0]);
  return true;
}

/**
 * Activate the first matching item — opens it via onItemSelect. Used by Enter
 * inside FILTER mode.
 */
export function activateFirstMatch() {
  if (!filter || !filter.matchSet.size) return false;
  const firstPath = filter.matchSet.values().next().value;
  const item      = itemsByPath.get(firstPath);
  if (item && onItemSelectFn) {
    onItemSelectFn(item);
    return true;
  }
  return false;
}

/** Drop the persistent match tint. Wired to the `:nohl` command. */
export function clearMatched() {
  matchedPaths.clear();
  renderCurrent();
}

// ── Filter helpers ───────────────────────────────────────────────────────────

function updateFilterCount(matched) {
  const el = document.getElementById('explorer-filter-count');
  if (!el) return;
  if (!filter || !filter.query) {
    el.textContent = '';
    return;
  }
  const total = itemsByPath.size;
  el.textContent = `${matched}/${total}`;
}

function renderCurrent() {
  const wrap = document.getElementById('explorer-tree-wrap');
  if (!wrap || !wrap.__forest) return;
  wrap.innerHTML = renderForest(wrap.__forest);
  refreshHighlight('e');
}

// ── Nav registration (Phase 9.5) ─────────────────────────────────────────────

function registerExplorerNav() {
  const wrap = document.getElementById('explorer-tree-wrap');
  if (!wrap) return;

  registerPaneNav('e', {
    container:   wrap,
    rowSelector: '.admin-tree-row:not(.is-empty)',

    onActivate: (row) => {
      const path = row.dataset.path;
      const type = row.dataset.type;
      if (type === 'item') {
        // Open in Record pane (same code path as a mouse click)
        wrap.querySelectorAll('.admin-tree-row.is-selected').forEach(r => r.classList.remove('is-selected'));
        row.classList.add('is-selected');
        const item = itemsByPath.get(path);
        if (item && onItemSelectFn) onItemSelectFn(item);
      } else if (type === 'guide') {
        wrap.querySelectorAll('.admin-tree-row.is-selected').forEach(r => r.classList.remove('is-selected'));
        row.classList.add('is-selected');
        if (onGuideSelectFn) onGuideSelectFn();
      } else if (type === 'constellation' || type === 'constellation-new') {
        wrap.querySelectorAll('.admin-tree-row.is-selected').forEach(r => r.classList.remove('is-selected'));
        row.classList.add('is-selected');
        if (onConstellationSelectFn) onConstellationSelectFn(type === 'constellation' ? row.dataset.slug : null);
      } else {
        // Toggle expansion (same as click on a group row)
        if (expanded.has(path)) expanded.delete(path);
        else                    expanded.add(path);
        saveExpanded(expanded);
        renderCurrent();
      }
    },

    onLeft: (row) => {
      const path = row.dataset.path;
      const type = row.dataset.type;

      // Expanded group → collapse in place
      if (!isLeafType(type) && expanded.has(path)) {
        expanded.delete(path);
        saveExpanded(expanded);
        renderCurrent();
        return;
      }

      // Otherwise → highlight parent row
      const parent = parentPath(path);
      if (!parent) return;
      const parentRow = wrap.querySelector(`.admin-tree-row[data-path="${cssEscape(parent)}"]`);
      if (parentRow) setHighlightedRow('e', parentRow);
    },

    onRight: (row) => {
      const path = row.dataset.path;
      const type = row.dataset.type;
      if (isLeafType(type)) return;

      // Collapsed group → expand in place
      if (!expanded.has(path)) {
        expanded.add(path);
        saveExpanded(expanded);
        renderCurrent();
        return;
      }

      // Already expanded → move to first child (next visible row whose path
      // starts with current path + "/")
      const rows = Array.from(wrap.querySelectorAll('.admin-tree-row:not(.is-empty)'));
      const idx = rows.indexOf(row);
      const next = rows[idx + 1];
      if (next && next.dataset.path && next.dataset.path.startsWith(path + '/')) {
        setHighlightedRow('e', next);
      }
    },
  });
}

function parentPath(path) {
  if (!path) return null;
  const i = path.lastIndexOf('/');
  return i === -1 ? null : path.slice(0, i);
}

function substringMatch(query, target) {
  const i = target.toLowerCase().indexOf(query.toLowerCase());
  if (i === -1) return null;
  const positions = [];
  for (let k = 0; k < query.length; k++) positions.push(i + k);
  return positions;
}

function fuzzyMatch(query, target) {
  const lq = query.toLowerCase();
  const lt = target.toLowerCase();
  const positions = [];
  let qi = 0;
  for (let i = 0; i < lt.length && qi < lq.length; i++) {
    if (lt[i] === lq[qi]) {
      positions.push(i);
      qi++;
    }
  }
  return qi === lq.length ? positions : null;
}

function wrapMatchPositions(label, positions) {
  if (!positions || !positions.length) return escapeHTML(label);
  const set = new Set(positions);
  let out = '';
  for (let i = 0; i < label.length; i++) {
    if (set.has(i)) out += `<span class="admin-tree-match">${escapeHTML(label[i])}</span>`;
    else            out += escapeHTML(label[i]);
  }
  return out;
}

/**
 * Select an item by id from outside the tree (e.g., when the empty-state's
 * Recent or Needs-attention list is clicked). Auto-expands ancestor groups so
 * the row is visible, then highlights it and scrolls it into view.
 */
export function selectInTree(itemId) {
  const wrap = document.getElementById('explorer-tree-wrap');
  if (!wrap || !wrap.__forest) return;

  // Locate the path for this item id
  let itemPath = null;
  for (const [path, item] of itemsByPath) {
    if (item.id === itemId) { itemPath = path; break; }
  }
  if (!itemPath) return;

  // Expand every ancestor so the row is visible
  const parts = itemPath.split('/');
  for (let i = 1; i < parts.length; i++) {
    expanded.add(parts.slice(0, i).join('/'));
  }
  saveExpanded(expanded);

  // Re-render and apply selection (keyboard-highlight restored by renderCurrent)
  renderCurrent();
  const row = wrap.querySelector(`.admin-tree-row[data-path="${cssEscape(itemPath)}"]`);
  if (row) {
    row.classList.add('is-selected');
    row.scrollIntoView({ block: 'nearest' });
  }
}

/**
 * Select a constellation's row(s) from outside the tree — the registry row
 * under `constellations`, and the homed subcollection row if it has one.
 */
export function selectConstellationInTree(slug) {
  const wrap = document.getElementById('explorer-tree-wrap');
  if (!wrap || !wrap.__forest) return;
  expanded.add('constellations');
  saveExpanded(expanded);
  renderCurrent();
  wrap.querySelectorAll('.admin-tree-row.is-selected').forEach(r => r.classList.remove('is-selected'));
  const rows = wrap.querySelectorAll(`.admin-tree-row[data-type="constellation"][data-slug="${cssEscape(slug)}"]`);
  rows.forEach((row, i) => { row.classList.add('is-selected'); if (i === 0) row.scrollIntoView({ block: 'nearest' }); });
}

/**
 * Replace the tree wrap with an error message — used when archive.json fails
 * to load.
 */
export function showExplorerError() {
  const wrap = document.getElementById('explorer-tree-wrap');
  if (!wrap) return;
  wrap.innerHTML = `
    <div class="admin-tree-error">
      Failed to load <code>archive.json</code>.<br>
      Run <code>npm run build-data</code> and reload.
    </div>
  `;
}

// ── Click handling ───────────────────────────────────────────────────────────

function onTreeClick(e) {
  const wrap = e.currentTarget;
  const row  = e.target.closest('.admin-tree-row');
  if (!row || row.classList.contains('is-empty')) return;

  const path = row.dataset.path;
  const type = row.dataset.type;

  if (type === 'item') {
    wrap.querySelectorAll('.admin-tree-row.is-selected')
      .forEach(r => r.classList.remove('is-selected'));
    row.classList.add('is-selected');

    const item = itemsByPath.get(path);
    if (item && onItemSelectFn) onItemSelectFn(item);
    return;
  }

  if (type === 'guide') {
    wrap.querySelectorAll('.admin-tree-row.is-selected')
      .forEach(r => r.classList.remove('is-selected'));
    row.classList.add('is-selected');
    if (onGuideSelectFn) onGuideSelectFn();
    return;
  }

  if (type === 'constellation' || type === 'constellation-new') {
    wrap.querySelectorAll('.admin-tree-row.is-selected')
      .forEach(r => r.classList.remove('is-selected'));
    row.classList.add('is-selected');
    if (onConstellationSelectFn) onConstellationSelectFn(type === 'constellation' ? row.dataset.slug : null);
    return;
  }

  // Group: toggle expansion and re-render.
  if (expanded.has(path)) expanded.delete(path);
  else                    expanded.add(path);
  saveExpanded(expanded);

  // Preserve selection across re-render: capture the selected path, redraw,
  // then re-apply. The keyboard-highlight is restored via refreshHighlight()
  // inside renderCurrent().
  const selectedPath = wrap.querySelector('.admin-tree-row.is-selected')?.dataset.path;
  renderCurrent();
  if (selectedPath) {
    const restored = wrap.querySelector(`.admin-tree-row[data-path="${cssEscape(selectedPath)}"]`);
    if (restored) restored.classList.add('is-selected');
  }
}

// ── Model ────────────────────────────────────────────────────────────────────

function buildModel(archive) {
  const seriesEntries = Object.entries(archive.series || {})
    .sort((a, b) => (a[1].order ?? 0) - (b[1].order ?? 0));

  const root = {
    type:     'root',
    label:    'archive',
    path:     'archive',
    children: [],
  };

  let totalItems = 0;

  for (const [seriesKey, series] of seriesEntries) {
    const seriesNode = {
      type:     'series',
      label:    series.label || seriesKey,
      path:     'archive/' + seriesKey,
      children: [],
    };

    // Direct items (e.g., Labor, Accumulation)
    for (const item of series.items || []) {
      seriesNode.children.push(itemNode(item, seriesNode.path));
    }

    // Subcollections (e.g., consumption → films)
    for (const [subKey, sub] of Object.entries(series.subcollections || {})) {
      // A homed constellation (identity → biography) is addressed through this
      // subcollection but holds no records of its own: its row opens the
      // constellation editor and counts the registry's members.
      const homedSlug = homedConstellationSlug(seriesKey, subKey);
      if (homedSlug) {
        const c = archive.constellations?.[homedSlug];
        seriesNode.children.push({
          type:  'constellation',
          slug:  homedSlug,
          label: sub.label || subKey,
          path:  seriesNode.path + '/' + subKey,
          count: c?.items?.length || 0,
        });
        continue;
      }
      const subNode = {
        type:     'subcollection',
        label:    sub.label || subKey,
        path:     seriesNode.path + '/' + subKey,
        children: [],
      };
      for (const item of sub.items || []) {
        subNode.children.push(itemNode(item, subNode.path));
      }
      subNode.count = subNode.children.length;
      seriesNode.children.push(subNode);
    }

    seriesNode.count = countLeaves(seriesNode);
    totalItems += seriesNode.count;
    root.children.push(seriesNode);
  }

  root.count = totalItems;
  return root;
}

function buildConstellationsModel(archive) {
  const registry = Object.values(archive?.constellations || {})
    .sort((a, b) => String(a.title || a.slug).localeCompare(String(b.title || b.slug)));
  const node = {
    type:     'constellations',
    label:    'constellations',
    path:     'constellations',
    children: registry.map(c => ({
      type:   'constellation',
      slug:   c.slug,
      label:  c.title || c.slug,
      path:   'constellations/' + c.slug,
      count:  c.items?.length || 0,
      status: c.status,
    })),
  };
  node.children.push({ type: 'constellation-new', label: 'new constellation', path: 'constellations/+new' });
  node.count = registry.length;
  return node;
}

function isLeafType(type) {
  return type === 'item' || type === 'constellation' || type === 'constellation-new' || type === 'guide';
}

function itemNode(item, parentPath) {
  const path = parentPath + '/' + item.id;
  const node = {
    type:  'item',
    label: item.title || item.id,
    path,
    item,
    status: item.status,
  };
  itemsByPath.set(path, item);
  return node;
}

function countLeaves(node) {
  if (node.type === 'item') return 1;
  let n = 0;
  for (const c of node.children || []) n += countLeaves(c);
  return n;
}

// ── HTML render ──────────────────────────────────────────────────────────────

const INDENT_PX = 14;
const ROW_PAD_LEFT_PX = 8;

function renderForest(nodes) {
  return `<div class="admin-tree">${nodes.map(n => renderNode(n, 0)).join('')}</div>`;
}

function renderNode(node, depth) {
  // Filter shrink: skip nodes whose subtree contains no match (unless the
  // query is empty — then ancestorSet is null and everything renders).
  if (filter && filter.query && filter.ancestorSet && !filter.ancestorSet.has(node.path)) {
    return '';
  }

  // Guide: a top-level, clickable meta node (no children, no expansion). Reads
  // like the archive root (star + label) but opens the Markdown editor instead.
  if (node.type === 'guide') {
    let cls = 'admin-tree-row admin-tree-root admin-tree-guide';
    if (!filter && matchedPaths.has(node.path)) cls += ' is-matched';
    const pad = depth * INDENT_PX + ROW_PAD_LEFT_PX;
    return `<div class="${cls}" data-path="${escapeAttr(node.path)}" data-type="guide" style="padding-left: ${pad}px">`
      + `<span class="admin-tree-marker"> </span>`
      + `<span class="admin-tree-star">*</span> `
      + `<span class="admin-tree-label">${escapeHTML(node.label)}</span>`
      + `</div>`;
  }

  const isLeaf  = isLeafType(node.type);
  const isConst = node.type === 'constellation';
  const isNew   = node.type === 'constellation-new';
  const hasKids = !isLeaf && node.children && node.children.length > 0;
  // While an active filter is shrinking the tree, force-expand every visible
  // group. An empty status term ("//" with nothing typed) has no ancestorSet, so
  // it doesn't shrink or force-expand — the tree stays as the user left it.
  const isOpen  = (filter && filter.query && filter.ancestorSet) ? true : expanded.has(node.path);
  const isEmpty = !isLeaf && !hasKids;
  const isRoot  = node.type === 'root' || node.type === 'constellations';

  let marker;
  if (isNew)         marker = '+';
  else if (isLeaf)   marker = '·';
  else if (isEmpty)  marker = ' ';
  else               marker = isOpen ? '▼' : '▶';

  let rowClass = 'admin-tree-row';
  if (isLeaf)      rowClass += ' admin-tree-leaf';
  else if (isRoot) rowClass += ' admin-tree-root';
  else             rowClass += ' admin-tree-group';
  if (node.type === 'constellations') rowClass += ' admin-tree-constellations';
  if (isConst)     rowClass += ' admin-tree-constellation';
  if (isNew)       rowClass += ' admin-tree-constellation-new';
  // Color non-published leaves by status (draft/partial/complete). Published
  // leaves keep the default text color.
  if (isLeaf && node.status && node.status !== 'published') {
    rowClass += ` admin-tree-leaf--${node.status}`;
  }
  if (isEmpty)     rowClass += ' is-empty';
  // Persistent match tint (after filter exit, before :nohl)
  if (!filter && matchedPaths.has(node.path)) rowClass += ' is-matched';

  const indent = depth * INDENT_PX;

  const star      = isRoot ? '<span class="admin-tree-star">*</span> ' : '';
  const countHTML = (node.count != null && !isNew)
    ? `<span class="admin-tree-count">${node.count}</span>`
    : '';
  const emptyHint = isEmpty
    ? ' <span class="admin-tree-empty">(empty)</span>'
    : '';

  // Character-level highlight when this node is matched in the active filter
  let labelHTML;
  if (filter && filter.query && filter.positionsMap.has(node.path)) {
    labelHTML = wrapMatchPositions(node.label, filter.positionsMap.get(node.path));
  } else {
    labelHTML = escapeHTML(node.label);
  }

  const slugAttr = isConst ? ` data-slug="${escapeAttr(node.slug)}"` : '';
  let html  = `<div class="${rowClass}" data-path="${escapeAttr(node.path)}" data-type="${node.type}"${slugAttr} style="padding-left: ${indent + ROW_PAD_LEFT_PX}px">`;
      html += `<span class="admin-tree-marker">${marker}</span>`;
      html += star;
      html += `<span class="admin-tree-label">${labelHTML}</span>`;
      html += emptyHint;
      html += countHTML;
      html += `</div>`;

  if (hasKids && isOpen) {
    for (const child of node.children) {
      html += renderNode(child, depth + 1);
    }
  }

  return html;
}

// ── Utilities ────────────────────────────────────────────────────────────────

function escapeHTML(s) {
  return String(s).replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

function escapeAttr(s) {
  return escapeHTML(s);
}

function cssEscape(s) {
  // Minimal CSS attribute-selector escape — paths only contain alphanumerics,
  // dashes, underscores, slashes, and dots, but we belt-and-suspenders it.
  return String(s).replace(/(["\\])/g, '\\$1');
}
