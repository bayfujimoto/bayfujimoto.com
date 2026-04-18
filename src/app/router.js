import { setState, getState, isValidSeries } from "./state.js";

// Parse the current window.location into a state patch
function locationToState() {
  const parts = window.location.pathname.replace(/^\/|\/$/g, "").split("/").filter(Boolean);
  const params = new URLSearchParams(window.location.search);
  const item = params.get("item") || null;

  if (parts.length === 0) {
    return { layer: "desk", series: null, subcollection: null, view: null, item: null };
  }

  const [first, second] = parts;

  // Guide is a top-level meta item
  if (first === "guide") {
    return { layer: "guide", series: null, subcollection: null, view: null, item: null };
  }

  if (!isValidSeries(first)) {
    return { layer: "desk", series: null, subcollection: null, view: null, item: null };
  }

  const series = first;

  // Labor (and Accumulation) use a view-based second segment, not a subcollection key
  if (series === "labor" || series === "accumulation") {
    if (second) {
      return { layer: item ? "item" : "browse", series, subcollection: null, view: second, item };
    }
    return { layer: "series", series, subcollection: null, view: null, item: null };
  }

  if (second) {
    return { layer: item ? "item" : "browse", series, subcollection: second, view: null, item };
  }

  return { layer: item ? "item" : "series", series, subcollection: null, view: null, item };
}

// Derive the URL pathname + search from state
function stateToURL(s) {
  if (s.layer === "desk") return "/";
  if (s.layer === "guide") return "/guide/";

  // Labor and Accumulation: second segment is view slug, not subcollection key
  if (s.series === "labor" || s.series === "accumulation") {
    if (s.layer === "series") return `/${s.series}/`;
    const viewSeg = s.view || "all";
    const search = s.item ? `?item=${encodeURIComponent(s.item)}` : "";
    return `/${s.series}/${viewSeg}/${search}`;
  }

  let path = `/${s.series}/`;
  if (s.subcollection) path += `${s.subcollection}/`;
  const search = s.item ? `?item=${encodeURIComponent(s.item)}` : "";
  return path + search;
}

export function navigate(patch) {
  setState(patch);
  const url = stateToURL(getState());
  history.pushState(null, "", url);
  console.log("[router] navigate →", url, getState());
}

export function replace(patch) {
  setState(patch);
  const url = stateToURL(getState());
  history.replaceState(null, "", url);
}

export function initRouter() {
  // Restore state from current URL on first load
  const initial = locationToState();
  setState(initial, { silent: true });
  console.log("[router] init →", window.location.pathname + window.location.search, initial);

  // Handle browser back/forward
  window.addEventListener("popstate", () => {
    const restored = locationToState();
    setState(restored);
    console.log("[router] popstate →", window.location.pathname, restored);
  });
}
