import { setState, getState, isValidSeries } from "./state.js";
import { CONSTELLATION_HOMES, homedConstellationSlug } from "../shared/constellation-homes.js";

// Homed constellations (the biography) — see src/shared/constellation-homes.js.
export { CONSTELLATION_HOMES, homedConstellationSlug };

// Parse the current window.location into a state patch
function locationToState() {
  const parts = window.location.pathname.replace(/^\/|\/$/g, "").split("/").filter(Boolean);
  const params = new URLSearchParams(window.location.search);
  const item = params.get("item") || null;

  if (parts.length === 0) {
    return { layer: "desk", series: null, subcollection: null, view: null, item: null };
  }

  const [first, second] = parts;

  // Guide is a top-level meta item. /guide/<key>/ addresses one frame of its
  // card (identity … accumulation); the bare /guide/ is the key frame. An
  // unknown segment falls back to the key.
  if (first === "guide") {
    const view = second && isValidSeries(second) ? second : null;
    return { layer: "guide", series: null, subcollection: null, view, item: null };
  }

  // Constellations — the lateral cross-series layer. Routes are slug-addressed
  // (/constellations/<slug>/); a bare /constellations/ index is deferred to the
  // meta-object phase, so without a slug we fall back to the desk.
  if (first === "constellations") {
    const home = second && CONSTELLATION_HOMES[second];
    if (home) {
      return { layer: item ? "item" : "browse", series: home.series, subcollection: home.subcollection, view: null, item };
    }
    if (second) {
      return { layer: item ? "item" : "browse", series: "constellations", subcollection: null, view: second, item };
    }
    return { layer: "desk", series: null, subcollection: null, view: null, item: null };
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
  if (s.layer === "guide") return s.view ? `/guide/${s.view}/` : "/guide/";

  // Constellations: slug-addressed, no series sheet, no index route yet
  if (s.series === "constellations") {
    if (!s.view) return "/";
    const search = s.item ? `?item=${encodeURIComponent(s.item)}` : "";
    return `/constellations/${s.view}/${search}`;
  }

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
  // A homed constellation's /constellations/<slug>/ address resolves to its
  // series address; rewrite the bar so the canonical URL is what gets shared.
  const canonical = stateToURL(getState());
  if (initial.layer !== "desk" && canonical !== window.location.pathname + window.location.search) {
    history.replaceState(null, "", canonical);
  }
  console.log("[router] init →", window.location.pathname + window.location.search, initial);

  // Handle browser back/forward
  window.addEventListener("popstate", () => {
    const restored = locationToState();
    setState(restored);
    console.log("[router] popstate →", window.location.pathname, restored);
  });
}
