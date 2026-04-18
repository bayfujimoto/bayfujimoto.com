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
  Object.assign(state, patch);
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
