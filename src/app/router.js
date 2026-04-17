import { setState, getState, isValidSeries } from "./state.js";

// Parse the current window.location into a state patch
function locationToState() {
  const parts = window.location.pathname.replace(/^\/|\/$/g, "").split("/").filter(Boolean);
  const params = new URLSearchParams(window.location.search);
  const item = params.get("item") || null;

  if (parts.length === 0) {
    return { layer: item ? "item" : "desk", series: null, subcollection: null, item };
  }

  const [series, subcollection] = parts;

  if (!isValidSeries(series)) {
    return { layer: "desk", series: null, subcollection: null, item: null };
  }

  if (subcollection) {
    return { layer: item ? "item" : "browse", series, subcollection, item };
  }

  return { layer: item ? "item" : "series", series, subcollection: null, item };
}

// Derive the URL pathname + search from state
function stateToURL(s) {
  if (s.layer === "desk") return "/";
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
