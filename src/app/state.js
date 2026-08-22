const VALID_SERIES = new Set(["identity", "labor", "consumption", "creation", "accumulation"]);

const state = {
  layer: "desk",       // 'desk' | 'guide' | 'series' | 'browse' | 'item'
  series: null,        // e.g. 'accumulation'
  subcollection: null, // e.g. 'ephemera' (data key). null for labor/accumulation (flat)
  view: null,          // URL view segment — labor/accumulation: 'all' | context/filter slug
  item: null,          // item id, e.g. 'EPH-2025-001'
};

const listeners = new Set();

export function getState() {
  return { ...state };
}

export function setState(patch, { silent = false } = {}) {
  // `subcollection` and `view` are series-scoped: they name a group or a filter
  // that only exists inside one series, so they cannot survive a change of
  // series, and nothing survives a return to the desk. Because this is a merge,
  // a partial patch would otherwise carry a stale value across — e.g. leaving a
  // constellation (view: "2026-atx-sf") for accumulation, whose browse then
  // filters on a slug no item carries and renders an empty grid. Callers that
  // mean to set these still win: an explicit key in the patch is never cleared.
  const next = { ...patch };
  if (patch.layer === "desk") {
    next.series ??= null;
    next.subcollection ??= null;
    next.view ??= null;
    next.item ??= null;
  } else if ("series" in patch && patch.series !== state.series) {
    if (!("subcollection" in patch)) next.subcollection = null;
    if (!("view" in patch)) next.view = null;
  }

  Object.assign(state, next);
  if (!silent) {
    for (const fn of listeners) fn({ ...state });
  }
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function isValidSeries(s) {
  return VALID_SERIES.has(s);
}

// Desk-object click remap. The labor and accumulation objects keep their forms,
// positions, and labels, but clicking each opens the other's browse view.
// Applied to every desk-entry path (3D click, keyboard skip menu, hidden HTML
// desk) so all input modes navigate identically. URLs and deep links are
// unaffected — only the act of clicking a desk object is swapped.
const DESK_CLICK_REMAP = { labor: "accumulation", accumulation: "labor" };

export function deskTarget(seriesId) {
  return DESK_CLICK_REMAP[seriesId] || seriesId;
}
