// ── Shared row navigation (Phase 9.5) ────────────────────────────────────────
// A small per-pane navigation registry. Each pane describes:
//   - what counts as a navigable row (CSS selector inside a container)
//   - what Enter does on a row
//   - optional Left / Right semantics (tree-style collapse/expand, etc.)
//   - how to identify a row "logically" so the highlight can survive re-renders
//
// The mode engine routes Arrow keys + Enter through navigate() / activate().
// `.is-highlighted` class is applied to the current row and re-applied after
// the pane's content re-renders via the logical-id mapping.

const registry = new Map();   // paneCode → config + state

/**
 * Register navigation for a pane.
 *
 *   registerPaneNav('e', {
 *     container:           DOM element to scope queries to,
 *     rowSelector:         CSS selector for navigable rows within container,
 *     onActivate(row):     what Enter does on this row,
 *     onLeft(row)?:        optional Left handler,
 *     onRight(row)?:       optional Right handler,
 *     getLogicalId(row)?:  function returning a string id used to re-find this
 *                          row after a re-render. Defaults to dataset.path.
 *     findRowByLogicalId(id)?: optional finder used during restoreHighlight.
 *                          Defaults to looking up data-path within container.
 *   })
 *
 * Re-call this any time the container is rebuilt (e.g., after Explorer
 * re-renders) — the function takes care of restoring the previously
 * highlighted row by logical id.
 */
export function registerPaneNav(paneCode, opts) {
  const prev = registry.get(paneCode);
  const lastId = prev?.lastId ?? null;

  const getLogicalId = opts.getLogicalId
    || ((row) => row?.dataset?.path || row?.dataset?.itemId || row?.dataset?.fieldId || null);

  const findRowByLogicalId = opts.findRowByLogicalId
    || ((id) => {
      if (!id) return null;
      const escaped = cssEscape(id);
      // Build a query that appends each attribute selector to every comma part
      // of rowSelector — otherwise `.a, .b[data-x=…]` would match all `.a`s.
      const byAttr = (attr) => splitSelector(opts.rowSelector)
        .map(p => `${p}[${attr}="${escaped}"]`)
        .join(', ');
      return opts.container?.querySelector(byAttr('data-path'))
          || opts.container?.querySelector(byAttr('data-item-id'))
          || opts.container?.querySelector(byAttr('data-field-id'))
          || null;
    });

  registry.set(paneCode, {
    ...opts,
    getLogicalId,
    findRowByLogicalId,
    lastId,
  });

  // Re-apply highlight after a re-render
  if (lastId) {
    const row = findRowByLogicalId(lastId);
    if (row) markHighlighted(paneCode, row);
  }
}

/** Move the highlight in the named pane. dir: 'up' | 'down' | 'left' | 'right'. */
export function navigate(paneCode, dir) {
  const cfg = registry.get(paneCode);
  if (!cfg || !cfg.container) return;

  if (dir === 'left'  && cfg.onLeft)  return passToHandler(cfg, cfg.onLeft);
  if (dir === 'right' && cfg.onRight) return passToHandler(cfg, cfg.onRight);

  const rows = visibleRows(cfg);
  if (rows.length === 0) return;

  const current = currentRow(cfg);
  let next;
  if (!current) {
    next = (dir === 'up') ? rows[rows.length - 1] : rows[0];
  } else {
    const i = rows.indexOf(current);
    if (dir === 'up')   next = rows[Math.max(0, i - 1)];
    if (dir === 'down') next = rows[Math.min(rows.length - 1, i + 1)];
  }
  if (next && next !== current) markHighlighted(paneCode, next);
}

/** Fire the registered onActivate for the named pane's highlighted row. */
export function activate(paneCode) {
  const cfg = registry.get(paneCode);
  if (!cfg) return;
  const row = currentRow(cfg) || visibleRows(cfg)[0];
  if (row && cfg.onActivate) cfg.onActivate(row);
}

/** Programmatically set the highlight in a pane (e.g., after click). */
export function setHighlightedRow(paneCode, row) {
  markHighlighted(paneCode, row);
}

/**
 * Re-apply the highlight to the previously-tracked row after the pane's
 * content has been re-rendered. The pane's findRowByLogicalId is used to
 * locate the row that corresponds to the saved logical id.
 */
export function refreshHighlight(paneCode) {
  const cfg = registry.get(paneCode);
  if (!cfg || !cfg.lastId) return;
  const row = cfg.findRowByLogicalId(cfg.lastId);
  if (row) markHighlighted(paneCode, row);
}

/** Clear the highlight in a pane. */
export function clearHighlighted(paneCode) {
  const cfg = registry.get(paneCode);
  if (!cfg) return;
  cfg.container?.querySelectorAll('.is-highlighted').forEach((el) => el.classList.remove('is-highlighted'));
  cfg.lastId = null;
}

// ── Internals ────────────────────────────────────────────────────────────────

function visibleRows(cfg) {
  if (!cfg.container) return [];
  return Array.from(cfg.container.querySelectorAll(cfg.rowSelector))
    .filter(isVisible);
}

function currentRow(cfg) {
  if (!cfg.container) return null;
  // Build a selector that pairs every part of rowSelector with .is-highlighted
  // — naive concatenation breaks for comma-separated selectors.
  const sel = splitSelector(cfg.rowSelector).map(p => `${p}.is-highlighted`).join(', ');
  return cfg.container.querySelector(sel) || null;
}

function splitSelector(s) {
  return String(s || '').split(',').map(p => p.trim()).filter(Boolean);
}

function isVisible(el) {
  if (!el) return false;
  if (el.offsetParent === null) {
    // offsetParent is null for elements with display:none ancestors (and for
    // position:fixed) — for our row elements this catches collapsed siblings.
    // We also accept rows whose container itself isn't visible (e.g. hidden
    // pane on mobile) — let the mobile mode short-circuit handle that.
    const cs = window.getComputedStyle(el);
    return cs.display !== 'none' && cs.visibility !== 'hidden';
  }
  return true;
}

function markHighlighted(paneCode, row) {
  const cfg = registry.get(paneCode);
  if (!cfg) return;
  cfg.container?.querySelectorAll('.is-highlighted').forEach((el) => el.classList.remove('is-highlighted'));
  row.classList.add('is-highlighted');
  cfg.lastId = cfg.getLogicalId(row);

  // Bring into view if it's outside the scrollable area
  if (typeof row.scrollIntoView === 'function') {
    row.scrollIntoView({ block: 'nearest' });
  }
}

function passToHandler(cfg, handler) {
  const row = currentRow(cfg);
  if (!row) return;
  handler(row);
}

function cssEscape(s) {
  // Minimal escape for use inside attribute selectors
  return String(s).replace(/(["\\])/g, '\\$1');
}
