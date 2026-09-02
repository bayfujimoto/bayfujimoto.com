import { navigate, replace } from "./router.js";
import { subscribe, getState, deskTarget } from "./state.js";
import { imageUrl, modelUrl } from "./image-url.js";
import { setSeriesInfo, pauseSceneRender, resumeSceneRender } from "./scene.js";
import { resolveCreator, resolveSlots, titleIsGiven } from "../shared/field-schema.js";
import { mdToHtml } from "./markdown.js";

let archive = null;
const app = document.getElementById("app");

// Fade an <img> in once it has decoded, so it resolves onto the page instead of
// popping in. Reduced motion shows it instantly (the CSS transition is disabled
// there). Safe if the image is already complete, or if decode() is unsupported or
// rejects. The load listener stays armed across a display→original retry.
function fadeInOnLoad(img) {
  img.decoding = "async";
  img.classList.add("img-fade");
  const reveal = () => img.classList.add("img-fade--in");
  const onLoad = () => { img.decode ? img.decode().then(reveal, reveal) : reveal(); };
  if (img.complete && img.naturalWidth) { onLoad(); return; }
  img.addEventListener("load", onLoad);
}

// Progressive reproduction loader for the item-card plate. Paints a low-res
// placeholder into `img` at once — the exact `thumbnail` URL the grid already
// loaded, so it is cache-warm and appears without a network wait — then loads the
// web-size `display` derivative off-screen and swaps it in only once it can paint.
// The placeholder (or a previously shown side) is therefore never cleared to
// blank; the swap reads as a sharpening. It walks the `variants` fallback chain
// (default display → original) and calls `onFail` only if nothing ever painted.
// With no thumbnail (e.g. a film card, whose poster the grid never loaded) it
// degrades to loading the first variant straight in, leaving whatever is already
// showing untouched until the new image decodes.
function loadReproProgressive(img, filename, thumbFilename, onFail, variants = ["display", "original"]) {
  const thumbUrl = thumbFilename ? imageUrl(thumbFilename, "thumbnail") : null;
  if (thumbUrl) img.src = thumbUrl;

  const loader = new Image();
  let i = 0;
  const swap = () => { img.src = loader.src; };
  loader.onload = () => { loader.decode ? loader.decode().then(swap, swap) : swap(); };
  loader.onerror = () => {
    if (++i < variants.length) {
      loader.src = imageUrl(filename, variants[i]);
    } else {
      loader.onerror = null;
      if (!img.currentSrc && onFail) onFail(); // nothing ever painted → bare plate
    }
  };
  loader.src = imageUrl(filename, variants[0]);
}

// The scanned ephemera keep a transparent full-resolution cut-out
// (cutouts/<base>-cut.png) beside the raw scan. When an asset was cut out, its
// ?v= token records the cut-out mode (e.g. "…c20x2", from the tolerance/defringe);
// the plate should then show that cut-out rather than the opaque, scan-derived
// display. Non-cut-out assets keep the plain display → original chain.
function isCutoutAsset(value) {
  const qi = value ? value.indexOf("?v=") : -1;
  return qi !== -1 && /c\d+x\d+$/.test(value.slice(qi + 3));
}
function fullVariants(value) {
  return isCutoutAsset(value) ? ["cutout", "display", "original"] : ["display", "original"];
}

// Film backdrops are external Letterboxd URLs scraped at 1200×675 — roughly five
// times the pixels a grid cell (~213px wide) can show, so each cell waits on an
// oversized download before it paints. Letterboxd serves on-demand resized
// derivatives whose target size is encoded in the path
// ("…-1200-1200-675-675-crop-000000.jpg"); rewrite that token to a smaller preset
// for grid use (~30–50 KB instead of ~150–250 KB). The full size is not used
// elsewhere — the item card shows the poster, not the backdrop — so this is
// grid-only. Non-Letterboxd URLs (TMDB, R2, empty) pass through unchanged; callers
// keep the original URL as an onerror fallback so a rewrite can never blank a cell.
const GRID_BACKDROP_SIZE = "500-500-281-281";
function gridBackdropUrl(url) {
  if (!url || !url.includes("a.ltrbxd.com/resized/")) return url;
  return url.replace(/-\d+-\d+-\d+-\d+-crop-/, `-${GRID_BACKDROP_SIZE}-crop-`);
}

// Attach a grid backdrop to `img`: small Letterboxd derivative for speed, falling
// back once to the full URL if that preset isn't available, so a cell never blanks.
function setGridBackdrop(img, fullUrl) {
  const small = gridBackdropUrl(fullUrl);
  fadeInOnLoad(img);
  if (small !== fullUrl) {
    img.onerror = () => { img.onerror = null; img.src = fullUrl; };
  }
  img.src = small;
}

// Labor and Accumulation use view-based URLs regardless of subcollection data structure.
// "constellations" is not a series but the lateral cross-series layer; it shares
// the flat-URL shape (/constellations/<slug>/) and the flat layer depth.
const FLAT_URL_SERIES = new Set(["labor", "accumulation", "constellations"]);

// Constellation registry lookup (archive.constellations, built by build-data.js).
// Returns { slug, title, display_date, note, items } or null.
function constellationFor(slug) {
  return (archive && archive.constellations && archive.constellations[slug]) || null;
}

// Stack of active layer contents, each: { veil, content, cleanup, update }
const layerStack = [];

export async function initPanels() {
  const res = await fetch("/data/archive.json");
  archive = await res.json();

  const info = {};
  Object.entries(archive.series).forEach(([key, s]) => {
    info[key] = { label: s.label, container: s.container, subtitle: s.subtitle };
  });
  if (archive.guide) info.guide = { label: archive.guide.label, container: archive.guide.container, subtitle: archive.guide.subtitle };
  setSeriesInfo(info);

  renderDesk();

  subscribe(onStateChange);

  // Restore deep-linked layers on first load without re-pushing history
  const initial = getState();
  if (initial.layer !== "desk") restoreFromState(initial);
}

// ── State → layer stack ───────────────────────────────────────────────────────

function onStateChange(state) {
  const depth = stackDepth(state);
  const current = layerStack.length;

  if (depth < current) {
    while (layerStack.length > depth) popSheet();
    // After popping, update the newly-exposed layer
    if (layerStack.length > 0) {
      const exposed = layerStack[layerStack.length - 1];
      reconcile(exposed, state);
    }
  } else if (depth > current) {
    // pushLayerForState only adds the topmost layer, so a jump of more than one
    // level would leave the layers beneath it missing — a popstate from the desk
    // straight to an item deep-link would open the modal over an empty stage.
    // restoreFromState knows the whole ladder for a state, so rebuild with it.
    if (depth - current > 1) {
      while (layerStack.length) popSheet();
      restoreFromState(state);
    } else {
      pushLayerForState(state);
    }
  } else if (depth > 0) {
    const top = layerStack[layerStack.length - 1];
    reconcile(top, state);
  }
}

// A sheet updates itself in place when the new state still belongs to it. When
// it does not — a same-depth move across series, e.g. one constellation page to
// another series' browse — update() returns false, and the sheet is replaced
// rather than left showing stale content beneath the new URL.
function reconcile(layer, state) {
  if (layer.update(state) === false) {
    popSheet();
    pushLayerForState(state);
  }
}

// Depth: desk=0, guide=1, series=1, browse=2, item=3
// Flat series (labor/accumulation) skip the series sheet, so browse=1, item=2
function stackDepth(state) {
  const isFlat = state.series && FLAT_URL_SERIES.has(state.series);
  switch (state.layer) {
    case "desk":   return 0;
    case "guide":  return 1;
    case "series": return 1;
    case "browse": return isFlat ? 1 : 2;
    case "item":   return isFlat ? 2 : 3;
    default:       return 0;
  }
}

function restoreFromState(state) {
  if (state.layer === "guide") {
    pushLayerForState({ layer: "guide" }, true);
    return;
  }
  const skipSeriesSheet = FLAT_URL_SERIES.has(state.series) ||
    Object.keys(archive.series[state.series]?.subcollections || {}).length <= 1;

  if (!skipSeriesSheet && (state.layer === "series" || state.layer === "browse" || state.layer === "item")) {
    pushLayerForState({ layer: "series", series: state.series, subcollection: null, view: null, item: null }, true);
  }
  if (state.layer === "browse" || state.layer === "item") {
    pushLayerForState({ layer: "browse", series: state.series, subcollection: state.subcollection, view: state.view, item: null }, true);
  }
  if (state.layer === "item") {
    pushLayerForState(state, true);
  }
}

function pushLayerForState(state, silent = false) {
  switch (state.layer) {
    case "guide": {
      pushSheet(makeGuideSheet());
      break;
    }
    case "series": {
      if (FLAT_URL_SERIES.has(state.series)) {
        if (!silent) navigate({ layer: "browse", series: state.series, subcollection: null, view: state.view || "all", item: null });
        return;
      }
      const subs = Object.keys(archive.series[state.series]?.subcollections || {});
      if (subs.length === 1) {
        if (!silent) navigate({ layer: "browse", series: state.series, subcollection: subs[0], view: "all", item: null });
        return;
      }
      pushSheet(makeSeriesSheet(state.series));
      break;
    }
    case "browse": {
      if (state.series === "identity" && state.subcollection === "biography") {
        pushSheet(makeBiographySheet());
      } else if (state.series === "identity" && state.subcollection === "cv") {
        pushSheet(makeCVSheet());
      } else {
        pushSheet(makeBrowseSheet(state.series, state.subcollection, state.view, state.item));
      }
      break;
    }
    case "item":
      if (state.series === "labor") {
        pushSheet(makeLaborItemSheet(state.series, state.item, state.view));
      } else {
        pushSheet(makeItemSheet(state.series, state.subcollection, state.item, state.view));
      }
      break;
  }
}

// ── Sheet stack primitives ────────────────────────────────────────────────────

function pushSheet({ veil, content, cleanup, update, onHoist }) {
  const depth = layerStack.length + 1;
  const returnFocus = document.activeElement;

  // First veil going up: freeze the desk render loop so its live WebGL canvas
  // stops churning behind the backdrop-filter and the veil can't flicker out.
  if (layerStack.length === 0) pauseSceneRender();

  veil.style.setProperty("--depth", depth);
  content.style.setProperty("--depth", depth);

  // Hoist layer-meta out of the fading content container so it appears instantly
  const metaEl = content.querySelector(".layer-meta");
  if (metaEl) content.removeChild(metaEl);

  document.body.appendChild(veil);
  document.body.appendChild(content);
  if (metaEl) {
    metaEl.style.zIndex = depth * 10 + 2;
    metaEl.style.transition = "opacity 0.2s var(--ease-base)";
    document.body.appendChild(metaEl);
    if (onHoist) onHoist(metaEl);
  }

  layerStack.push({ veil, content, metaEl: metaEl || null, cleanup: cleanup || (() => {}), update: update || (() => {}), returnFocus });

  requestAnimationFrame(() => {
    veil.classList.add("layer-veil--visible");
    content.classList.add("layer-content--visible");
  });
}

function popSheet() {
  const top = layerStack.pop();
  if (!top) return;

  top.veil.classList.remove("layer-veil--visible");
  top.content.classList.remove("layer-content--visible");
  top.cleanup();

  if (top.metaEl) top.metaEl.style.opacity = "0";

  const remove = () => {
    top.veil.remove();
    top.content.remove();
    if (top.metaEl) top.metaEl.remove();
    if (top.returnFocus && typeof top.returnFocus.focus === "function") {
      top.returnFocus.focus({ preventScroll: true });
    }
    // Last veil gone (after its fade-out): resume the desk render loop.
    if (layerStack.length === 0) resumeSceneRender();
  };
  top.content.addEventListener("transitionend", remove, { once: true });
  setTimeout(remove, 400);
}

// ── Skip menu for keyboard desk navigation ────────────────────────────────────

function showSkipMenu(deskObjects) {
  const existing = document.getElementById("scene-skip-menu");
  if (existing) { existing.remove(); return; }

  const menu = document.createElement("div");
  menu.id = "scene-skip-menu";
  menu.className = "scene-skip-menu";

  deskObjects.forEach(({ type, key, label }) => {
    const btn = document.createElement("button");
    // Name the destination (swapped for labor/accumulation), matching the desk hover.
    btn.textContent = type === "series" ? (archive.series[deskTarget(key)]?.label || label) : label;
    btn.addEventListener("click", () => {
      menu.remove();
      if (type === "guide") navigate({ layer: "guide" });
      else navigate({ layer: "series", series: deskTarget(key), subcollection: null, item: null });
    });
    menu.appendChild(btn);
  });

  const closeBtn = document.createElement("button");
  closeBtn.textContent = "Close";
  closeBtn.addEventListener("click", () => menu.remove());
  menu.appendChild(closeBtn);

  menu.addEventListener("keydown", (e) => { if (e.key === "Escape") { menu.remove(); document.getElementById("scene-skip")?.focus(); } });
  document.body.appendChild(menu);
  menu.querySelector("button").focus();
}

// ── Desk (permanent) ──────────────────────────────────────────────────────────

function renderDesk() {
  const seriesEntries = Object.entries(archive.series).sort((a, b) => a[1].order - b[1].order);

  const deskObjects = [
    ...seriesEntries.map(([key, s]) => ({ type: "series", key, ...s })),
    ...(archive.guide ? [{ type: "guide", key: "guide", ...archive.guide }] : [])
  ].sort((a, b) => a.order - b.order);

  app.innerHTML = `
    <div class="desk">
      <div class="desk-objects">
        ${deskObjects.map(obj => `
          <button class="desk-object${obj.type === 'guide' ? ' desk-object--guide' : ''}" data-type="${obj.type}" data-key="${obj.key}">
            <span class="desk-object__label">${obj.label}</span>
            <span class="desk-object__container">${obj.container}</span>
          </button>
        `).join("")}
      </div>
    </div>
  `;

  app.querySelector(".desk").style.display = "none";

  if (!document.getElementById("scene-skip")) {
    const skipLink = document.createElement("button");
    skipLink.id = "scene-skip";
    skipLink.className = "scene-skip-link";
    skipLink.textContent = "Navigate archive";
    skipLink.addEventListener("click", () => showSkipMenu(deskObjects));
    document.body.prepend(skipLink);
  }

  app.querySelectorAll(".desk-object").forEach(btn => {
    const type = btn.dataset.type;
    const key = btn.dataset.key;
    if (type === "series") {
      btn.addEventListener("click", () => {
        navigate({ layer: "series", series: deskTarget(key), subcollection: null, item: null });
      });
    } else if (type === "guide") {
      btn.addEventListener("click", () => {
        navigate({ layer: "guide" });
      });
    }
  });
}

// ── Series sheet ──────────────────────────────────────────────────────────────

function makeSeriesSheet(seriesKey) {
  const s = archive.series[seriesKey];
  const subs = Object.entries(s.subcollections);

  const veil = makeVeil(() => {
    navigate({ layer: "desk", series: null, subcollection: null, item: null });
  });

  const content = makeContent();

  // Centered: subcollection list only
  const center = el("div", "layer-center");
  const list = el("ul", "series-subcollection-list");
  list.setAttribute("aria-label", "Subcollections");
  subs.forEach(([key, sc]) => {
    const li = el("li");
    const btn = el("button", "series-subcollection-btn");
    btn.type = "button";
    btn.dataset.series = seriesKey;
    btn.dataset.sub = key;
    btn.innerHTML = `${sc.label} <span class="series-subcollection-count">${sc.items.length}</span>`;
    btn.addEventListener("click", () => {
      navigate({ layer: "browse", series: seriesKey, subcollection: key, item: null });
    });
    li.appendChild(btn);
    list.appendChild(li);
  });

  const wrap = el("div", "series-subcollection-wrap");
  wrap.appendChild(list);
  center.appendChild(wrap);
  content.appendChild(center);

  // Series title + subtitle in bottom-right metadata overlay
  const meta = el("div", "layer-meta");
  const h1 = el("h1", "overlay-title");
  h1.textContent = s.label;
  const subtitle = el("p", "overlay-subtitle");
  subtitle.textContent = s.subtitle || s.container;
  meta.appendChild(h1);
  meta.appendChild(subtitle);
  content.appendChild(meta);

  // Breadcrumb: desk / {series}
  const bc = makeBreadcrumb([
    { label: "desk", onClick: () => navigate({ layer: "desk" }) },
    { label: s.label, current: true }
  ]);
  content.appendChild(bc);

  const closeFn = () => navigate({ layer: "desk", series: null, subcollection: null, item: null });
  const cleanup = attachEscapeHandler(content, closeFn);

  return { veil, content, cleanup };
}

// ── Guide sheet ───────────────────────────────────────────────────────────────

function makeGuideSheet() {
  const veil = makeVeil(() => navigate({ layer: "desk" }));
  const content = makeContent();

  // Same document container as biography / CV: bordered box, scroll, caret.
  const center = el("div", "layer-center");

  const doc = el("div", "bio-document");
  doc.setAttribute("role", "document");
  doc.setAttribute("aria-label", "Archive guide");

  const scroll = el("div", "bio-document__scroll");
  const inner = el("div", "guide-content");
  // Render the guide composed in the admin (archive.guide.content, Markdown).
  // Falls back to a short note if nothing has been written yet.
  const md = (archive.guide && archive.guide.content) || "";
  inner.innerHTML = md.trim()
    ? mdToHtml(md)
    : `<p>This is a personal archive — a collection of records, artifacts, documents, and traces that describe a life through material evidence rather than through a simplified personal brand narrative.</p>`;
  scroll.appendChild(inner);
  doc.appendChild(scroll);

  const box = el("div", "bio-document__box");
  box.appendChild(doc);

  const scrollCaret = el("button", "bio-document__scroll-caret");
  scrollCaret.type = "button";
  scrollCaret.setAttribute("aria-label", "Scroll down");
  box.appendChild(scrollCaret);

  const updateCaret = () => {
    const atBottom = scroll.scrollHeight - scroll.scrollTop <= scroll.clientHeight + 2;
    scrollCaret.classList.toggle("is-hidden", atBottom);
    box.classList.toggle("at-bottom", atBottom);
  };
  scroll.addEventListener("scroll", updateCaret, { passive: true });
  requestAnimationFrame(updateCaret);
  scrollCaret.addEventListener("click", () => {
    scroll.scrollTo({ top: scroll.scrollTop + scroll.clientHeight * 0.6, behavior: "smooth" });
  });

  box.classList.add("bio-document__box--fit");

  center.appendChild(box);
  content.appendChild(center);

  // Guide title + subtitle in bottom-right metadata overlay
  const meta = el("div", "layer-meta");
  const h1 = el("h1", "overlay-title");
  h1.textContent = "Guide";
  const subtitle = el("p", "overlay-subtitle");
  subtitle.textContent = archive.guide?.subtitle || "How to navigate this archive";
  meta.appendChild(h1);
  meta.appendChild(subtitle);
  content.appendChild(meta);

  const bc = makeBreadcrumb([
    { label: "desk", onClick: () => navigate({ layer: "desk" }) },
    { label: "guide", current: true }
  ]);
  content.appendChild(bc);

  const closeFn = () => navigate({ layer: "desk" });
  const cleanup = attachEscapeHandler(content, closeFn);

  return { veil, content, cleanup };
}

// ── Biography sheet ───────────────────────────────────────────────────────────

function makeBiographySheet() {
  const allVersions = archive.series["identity"]?.subcollections["biography"]?.items || [];
  // Items are sorted by sort_date descending — index 0 is the most recent version

  const veil = makeVeil(() => {
    navigate({ layer: "series", series: "identity", subcollection: null, item: null });
  });

  const content = makeContent();
  let hoistedMeta = null;
  let activeOutsideClickHandler = null;
  let hoistedVersionList = null;

  function buildMeta(metaEl, bio) {
    metaEl.innerHTML = "";

    const h1 = el("h1", "overlay-title");
    h1.textContent = "Biography";
    metaEl.appendChild(h1);

    const subtitle = el("p", "overlay-subtitle");
    subtitle.textContent = bio.display_date;
    metaEl.appendChild(subtitle);

    if (bio.roles?.length) {
      const field = el("div", "overlay-field");
      const label = el("span", "overlay-label");
      label.textContent = "roles";
      const value = el("span", "overlay-value");
      value.textContent = bio.roles.join(", ");
      field.appendChild(label);
      field.appendChild(value);
      metaEl.appendChild(field);
    }

    if (bio.location) {
      const field = el("div", "overlay-field");
      const label = el("span", "overlay-label");
      label.textContent = "location";
      const value = el("span", "overlay-value");
      value.textContent = bio.location;
      field.appendChild(label);
      field.appendChild(value);
      metaEl.appendChild(field);
    }

    if (bio.links?.length) {
      const linkLabel = el("span", "overlay-label");
      linkLabel.textContent = "links";
      linkLabel.style.marginTop = "0.5rem";
      metaEl.appendChild(linkLabel);
      bio.links.forEach(link => {
        const a = el("a", "overlay-value overlay-link");
        a.href = link.url;
        a.textContent = link.label;
        a.target = "_blank";
        a.rel = "noopener noreferrer";
        metaEl.appendChild(a);
      });
    }

    const idEl = el("div", "overlay-id");
    idEl.textContent = bio.id;
    metaEl.appendChild(idEl);
  }

  function renderDocument(idx) {
    const bio = allVersions[idx];
    if (!bio) return;

    // Remove previous outside-click listener if any
    if (activeOutsideClickHandler) {
      document.removeEventListener("click", activeOutsideClickHandler);
      activeOutsideClickHandler = null;
    }

    content.innerHTML = "";

    // Centered document panel
    const center = el("div", "layer-center");
    const doc = el("div", "bio-document");
    doc.setAttribute("role", "document");
    doc.setAttribute("aria-label", "Biography");

    // Version indicator and history selector intentionally omitted: the
    // biography view shows only the most recent version (index 0).
    // renderDocument is always called with 0, so no date/version selector
    // is rendered.

    // Scrollable prose region
    const scroll = el("div", "bio-document__scroll");

    // Short bio — lead paragraph
    if (bio.short_bio) {
      const shortP = el("p", "bio-document__short");
      shortP.textContent = bio.short_bio;
      scroll.appendChild(shortP);
    }

    // Long bio — split on \n\n for paragraphs
    if (bio.long_bio) {
      const longWrap = el("div", "bio-document__long");
      bio.long_bio.split(/\n\n+/).forEach(para => {
        if (para.trim()) {
          const p = el("p");
          p.textContent = para.trim();
          longWrap.appendChild(p);
        }
      });
      scroll.appendChild(longWrap);
    }

    doc.appendChild(scroll);

    const box = el("div", "bio-document__box");
    box.appendChild(doc);

    const scrollCaret = el("button", "bio-document__scroll-caret");
    scrollCaret.setAttribute("aria-label", "Scroll down");
    scrollCaret.type = "button";
    box.appendChild(scrollCaret);

    const updateCaret = () => {
      const atBottom = scroll.scrollHeight - scroll.scrollTop <= scroll.clientHeight + 2;
      scrollCaret.classList.toggle("is-hidden", atBottom);
      box.classList.toggle("at-bottom", atBottom);
    };
    scroll.addEventListener("scroll", updateCaret, { passive: true });
    requestAnimationFrame(updateCaret);

    scrollCaret.addEventListener("click", () => {
      scroll.scrollTo({ top: scroll.scrollTop + scroll.clientHeight * 0.6, behavior: "smooth" });
    });
    center.appendChild(box);
    content.appendChild(center);

    // Layer-meta — bottom right
    if (hoistedMeta) {
      buildMeta(hoistedMeta, bio);
    } else {
      const meta = el("div", "layer-meta");
      buildMeta(meta, bio);
      content.appendChild(meta);
    }

    // Breadcrumb — bottom left
    const bc = makeBreadcrumb([
      { label: "desk", onClick: () => navigate({ layer: "desk" }) },
      { label: "Identity", onClick: () => navigate({ layer: "series", series: "identity" }) },
      { label: "biography", current: true }
    ]);
    content.appendChild(bc);
  }

  const closeFn = () => navigate({ layer: "series", series: "identity", subcollection: null, item: null });
  const escCleanup = attachEscapeHandler(content, closeFn);

  const cleanup = () => {
    escCleanup();
    if (activeOutsideClickHandler) {
      document.removeEventListener("click", activeOutsideClickHandler);
      activeOutsideClickHandler = null;
    }
    if (hoistedVersionList && hoistedVersionList.parentNode) {
      hoistedVersionList.parentNode.removeChild(hoistedVersionList);
      hoistedVersionList = null;
    }
  };

  renderDocument(0);

  function onHoist(hoisted) { hoistedMeta = hoisted; }

  return { veil, content, cleanup, onHoist };
}

// ── CV sheet ──────────────────────────────────────────────────────────────────

function makeCVSheet() {
  const entries = archive.series["identity"]?.subcollections["cv"]?.items || [];
  // Sorted by sort_date descending — most recent first

  const veil = makeVeil(() => {
    navigate({ layer: "series", series: "identity", subcollection: null, item: null });
  });

  const content = makeContent();
  let hoistedMeta = null;

  function buildMeta(metaEl) {
    metaEl.innerHTML = "";

    const h1 = el("h1", "overlay-title");
    h1.textContent = "CV";
    metaEl.appendChild(h1);

    const idEl = el("div", "overlay-id");
    idEl.textContent = `${entries.length} entries`;
    metaEl.appendChild(idEl);
  }

  function renderDocument() {
    content.innerHTML = "";

    const center = el("div", "layer-center");
    const doc = el("div", "bio-document");
    doc.setAttribute("role", "document");
    doc.setAttribute("aria-label", "CV");

    const scroll = el("div", "bio-document__scroll");

    // Group entries by category
    const groups = {};
    entries.forEach(entry => {
      const cat = entry.category || "other";
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(entry);
    });

    const categoryOrder = ["employment", "education", "exhibition", "publication", "award"];
    const sortedCats = [
      ...categoryOrder.filter(c => groups[c]),
      ...Object.keys(groups).filter(c => !categoryOrder.includes(c))
    ];

    sortedCats.forEach(cat => {
      const section = el("div", "cv-section");

      const catLabel = el("p", "cv-section__category");
      catLabel.textContent = cat;
      section.appendChild(catLabel);

      groups[cat].forEach(entry => {
        const row = el("div", "cv-entry");

        const header = el("div", "cv-entry__header");

        const title = el("span", "cv-entry__title");
        title.textContent = entry.organization || entry.title;
        header.appendChild(title);

        const date = el("span", "cv-entry__date");
        date.textContent = entry.display_date;
        header.appendChild(date);

        row.appendChild(header);

        if (entry.role || entry.title) {
          const sub = el("p", "cv-entry__sub");
          sub.textContent = entry.role ? `${entry.title}${entry.role ? " — " + entry.role : ""}` : entry.title;
          row.appendChild(sub);
        }

        if (entry.context_note) {
          const longWrap = el("div", "cv-entry__note");
          entry.context_note.split(/\n\n+/).forEach(para => {
            if (para.trim()) {
              const p = el("p");
              p.textContent = para.trim();
              longWrap.appendChild(p);
            }
          });
          row.appendChild(longWrap);
        }

        section.appendChild(row);
      });

      scroll.appendChild(section);
    });

    doc.appendChild(scroll);

    const box = el("div", "bio-document__box");
    box.appendChild(doc);

    const scrollCaret = el("button", "bio-document__scroll-caret");
    scrollCaret.setAttribute("aria-label", "Scroll down");
    scrollCaret.type = "button";
    box.appendChild(scrollCaret);

    const updateCaret = () => {
      const atBottom = scroll.scrollHeight - scroll.scrollTop <= scroll.clientHeight + 2;
      scrollCaret.classList.toggle("is-hidden", atBottom);
      box.classList.toggle("at-bottom", atBottom);
    };
    scroll.addEventListener("scroll", updateCaret, { passive: true });
    requestAnimationFrame(updateCaret);

    scrollCaret.addEventListener("click", () => {
      scroll.scrollTo({ top: scroll.scrollTop + scroll.clientHeight * 0.6, behavior: "smooth" });
    });

    center.appendChild(box);
    content.appendChild(center);

    if (hoistedMeta) {
      buildMeta(hoistedMeta);
    } else {
      const meta = el("div", "layer-meta");
      buildMeta(meta);
      content.appendChild(meta);
    }

    const bc = makeBreadcrumb([
      { label: "desk", onClick: () => navigate({ layer: "desk" }) },
      { label: "Identity", onClick: () => navigate({ layer: "series", series: "identity" }) },
      { label: "cv", current: true }
    ]);
    content.appendChild(bc);
  }

  const closeFn = () => navigate({ layer: "series", series: "identity", subcollection: null, item: null });
  const escCleanup = attachEscapeHandler(content, closeFn);
  const cleanup = () => { escCleanup(); };

  renderDocument();

  function onHoist(hoisted) { hoistedMeta = hoisted; buildMeta(hoistedMeta); }

  return { veil, content, cleanup, onHoist };
}

// ── Browse sheet ──────────────────────────────────────────────────────────────

function makeBrowseSheet(seriesKey, subKey, viewSlug, openItemId) {
  // Constellation browse: a cross-series view synthesized from the registry.
  // Members were gathered at build time; the sheet reuses the flat-series
  // machinery (accumulation grid, year groups) with the constellation's title
  // and note as the sheet's identity.
  const isConstellation = seriesKey === "constellations";
  const constellation = isConstellation ? constellationFor(viewSlug) : null;
  const s = isConstellation
    ? {
        label: constellation?.title || viewSlug,
        subtitle: constellation?.display_date || "",
        items: constellation?.items || [],
        subcollections: {},
      }
    : archive.series[seriesKey];
  const isFlatSeries = FLAT_URL_SERIES.has(seriesKey);
  const subs = isFlatSeries ? [] : Object.entries(s.subcollections);

  function getFlatItems() {
    if (s.items) return s.items;
    return Object.values(s.subcollections || {}).flatMap(sc => sc.items || []);
  }

  const veil = makeVeil(() => {
    if (isFlatSeries) {
      navigate({ layer: "desk" });
    } else {
      navigate({ layer: "series", series: seriesKey, subcollection: null, item: null });
    }
  });

  const content = makeContent();
  let hoistedMeta = null; // tracks the .layer-meta element after pushSheet hoists it to document.body
  let lazyIO = null;      // preloads grid thumbnails ahead of the horizontal scroll

  function renderContent(activeSubKey, activeView) {
    const dropdownWasOpen = content.querySelector(".layer-breadcrumb__seg-wrap.is-open, .layer-breadcrumb__seg-wrap.is-open-instant") != null;
    // Clear previous children except veil (veil is not in content)
    content.innerHTML = "";

    // Deferred image loading (see the IntersectionObserver built after the grid).
    // Each grid image registers a loader instead of fetching at build time; the
    // observer calls it as the cell nears the scroll window. The observed element
    // is the sized button, not the (initially empty) <img>, so a zero-size image
    // can't defeat the intersection test.
    if (lazyIO) { lazyIO.disconnect(); lazyIO = null; }
    const lazyTargets = [];
    const lazyRegister = (targetEl, load) => { targetEl.__lazyLoad = load; lazyTargets.push(targetEl); };

    let activeSub, years;

    if (isFlatSeries) {
      let items = getFlatItems();
      // Constellation members are already the view (the slug picked them at
      // build time); only labor/accumulation filter flat items by context.
      if (!isConstellation && activeView && activeView !== "all") {
        items = items.filter(item => item.context === activeView || item.view === activeView);
      }
      activeSub = { label: isConstellation ? s.label : (activeView || "all"), items };
      years = groupByYear(items);
    } else {
      activeSub = s.subcollections[activeSubKey];
      years = groupByYear(activeSub?.items || []);
    }

    // Item grid — column-major, horizontally scrolling, grouped by year.
    // Films pack 4 per column (vs 3 elsewhere); their cells are scaled to 3/4
    // height in CSS so the grid's overall height is unchanged.
    const GRID_ROWS = activeSubKey === "films" ? 4 : 3;
    const gridWrap = el("div", "item-grid-wrap");
    const grid = el("div", "item-grid");
    // Books render their covers at (estimated) true physical scale, inset and
    // top-left aligned — scoped via this modifier so other grids are unaffected.
    if (activeSubKey === "books") grid.classList.add("item-grid--books");
    // Films render as landscape 16:9 backdrop cards with a hover/focus title
    // reveal (ported from the prior WordPress movie archive). Scoped via this
    // modifier so other grids keep their square cells.
    const isFilms = activeSubKey === "films";
    if (isFilms) grid.classList.add("item-grid--films");
    // Accumulation (ephemera) scopes the undimensioned-thumbnail padding below, so
    // items without recorded dimensions don't butt edge-to-edge against the cell.
    // Constellation pages reuse the same contact-sheet treatment — cross-series
    // members render as one chronological sequence in the accumulation grid.
    if (seriesKey === "accumulation" || isConstellation) grid.classList.add("item-grid--accumulation");
    // Music: albums/EPs are square sleeves; singles render as a vinyl picture
    // disc (round crop). The per-item disc class is applied to single cells below.
    if (activeSubKey === "music") grid.classList.add("item-grid--music");
    // Photos: a pile of prints per cell, the whole photo always visible with
    // padding — scoped like the books/films/music modifiers.
    // decisions.md → "Photo entries — display treatment".
    const isPhotos = activeSubKey === "photos";
    if (isPhotos) grid.classList.add("item-grid--photos");
    grid.setAttribute("role", "list");
    grid.setAttribute("aria-label", `${activeSub.label} items`);

    // Find the largest physical dimension across all items that have dimensions metadata.
    // Used to scale thumbnails relative to each other within their fixed square cells.
    let maxDim = 0;
    for (const item of activeSub.items) {
      if (item.dimensions) {
        const [wMm, hMm] = item.dimensions.split("x").map(s => parseFloat(s.trim()));
        if (wMm && hMm) maxDim = Math.max(maxDim, wMm, hMm);
      }
    }

    // Films render as a single continuous calendar ribbon: every day from the
    // last watched date back to the first, packed 4 per column newest→oldest, so
    // the most recent watch sits at the top-left and time flows rightward into the
    // past. Watched days show a 16:9 backdrop with a hover/focus title; multiple
    // films on one day each get their own cell, and only the day's first cell
    // carries the white day number. Empty days show just a faint number. Calendar
    // years with no films collapse to a single marker.
    function buildFilmRibbon(gridEl, items) {
      const MON = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
      const withDate = items.filter(i => i.watch_date);
      if (!withDate.length) return;
      withDate.sort((a, b) =>
        a.watch_date.localeCompare(b.watch_date) || (a.title || "").localeCompare(b.title || ""));

      const byDate = new Map();
      for (const it of withDate) {
        if (!byDate.has(it.watch_date)) byDate.set(it.watch_date, []);
        byDate.get(it.watch_date).push(it);
      }
      const yearsWithFilms = new Set(withDate.map(i => i.watch_date.slice(0, 4)));
      const firstDate = withDate[0].watch_date;
      const lastDate = withDate[withDate.length - 1].watch_date;
      const firstYear = +firstDate.slice(0, 4);

      const group = el("div", "item-grid__group");
      const cells = el("div", "item-grid__cells item-grid__cells--film-cal");
      cells.style.gridTemplateRows = "auto repeat(4, var(--film-cell-height))";

      let col = 1, row = 1, lastMonthKey = null;
      const advance = () => { row++; if (row > 4) { row = 1; col++; } };
      const finishColumn = () => { if (row > 1) { row = 1; col++; } };
      const fromISO = (iso) => { const [y,m,d] = iso.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d)); };
      const toISO = (dt) => dt.toISOString().slice(0, 10);

      let cur = fromISO(lastDate);
      const stop = fromISO(firstDate);

      while (cur >= stop) {
        const iso = toISO(cur);
        const y = iso.slice(0, 4);

        // Collapse a run of entirely-empty calendar years into one marker.
        if (!yearsWithFilms.has(y)) {
          finishColumn();
          const endY = +y;
          let sy = endY;
          while (sy >= firstYear && !yearsWithFilms.has(String(sy))) sy--;
          const gap = el("div", "item-grid__gap");
          gap.style.gridColumn = col;
          gap.style.gridRow = "2 / 6";
          const gl = el("span", "item-grid__gap-label");
          gl.textContent = "no films logged";
          const gy = el("span", "item-grid__gap-years");
          gy.textContent = (sy + 1 === endY) ? `${endY}` : `${sy + 1}–${endY}`;
          gap.appendChild(gl);
          gap.appendChild(gy);
          cells.appendChild(gap);
          col++;
          cur = new Date(Date.UTC(sy, 11, 31));
          lastMonthKey = null;
          continue;
        }

        // Month label at the top of the column where each month first appears.
        const mk = iso.slice(0, 7);
        if (mk !== lastMonthKey) {
          const ml = el("div", "item-grid__month");
          ml.textContent = `${MON[cur.getUTCMonth()]} ${y}`;
          ml.style.gridColumn = col;
          ml.style.gridRow = 1;
          cells.appendChild(ml);
          lastMonthKey = mk;
        }

        const dom = cur.getUTCDate();
        const dayFilms = byDate.get(iso);
        const place = (cell) => {
          if (col === 1) cell.classList.add("item-grid__cell--first-col");
          cell.style.gridColumn = col;
          cell.style.gridRow = row + 1;
          cells.appendChild(cell);
        };
        if (dayFilms && dayFilms.length) {
          dayFilms.forEach((f, i) => { place(buildFilmCell(f, dom, i === 0)); advance(); });
        } else {
          const cell = el("div", "item-grid__cell item-grid__cell--day item-grid__cell--empty");
          const num = el("span", "item-grid__daynum");
          num.textContent = dom;
          cell.appendChild(num);
          place(cell);
          advance();
        }
        cur.setUTCDate(cur.getUTCDate() - 1);
      }

      group.appendChild(cells);
      gridEl.appendChild(group);
    }

    // One cell per film. Days with several films get one cell each; only the day's
    // first cell carries the white day number.
    function buildFilmCell(f, dom, showNum) {
      const cell = el("div", "item-grid__cell item-grid__cell--day item-grid__cell--watched");
      const btn = el("button", "item-grid__btn");
      btn.type = "button";
      btn.dataset.itemId = f.id;
      btn.setAttribute("aria-label", f.title);
      const bd = imageUrl(f.assets?.backdrop, "original");
      if (bd) {
        const img = el("img", "item-grid__thumb item-grid__thumb--backdrop");
        img.alt = "";
        lazyRegister(btn, () => setGridBackdrop(img, bd));
        btn.appendChild(img);
      } else {
        const ph = el("span", "item-grid__noimg");
        ph.textContent = "no reproduction";
        btn.appendChild(ph);
      }
      const title = el("span", "item-grid__title");
      title.textContent = f.title;
      btn.appendChild(title);
      if (showNum) {
        const num = el("span", "item-grid__daynum item-grid__daynum--over");
        num.textContent = dom;
        btn.appendChild(num);
      }
      btn.addEventListener("click", () => {
        navigate({ layer: "item", series: seriesKey, subcollection: activeSubKey, view: activeView, item: f.id });
      });
      cell.appendChild(btn);
      return cell;
    }

    if (isFilms) {
      buildFilmRibbon(grid, activeSub.items || []);
    } else {
    years.forEach(({ year, items: yearItems }) => {
      const group = el("div", "item-grid__group");

      if (activeSubKey !== "contact") {
        const yearLabel = el("div", "item-grid__year");
        yearLabel.textContent = year;
        yearLabel.setAttribute("aria-hidden", "true");
        group.appendChild(yearLabel);
      }

      const cells = el("div", "item-grid__cells");
      const colCount = Math.ceil(yearItems.length / GRID_ROWS);
      const rowHeight = isFilms ? "var(--film-cell-height)" : "var(--item-grid-cell-height, 160px)";
      cells.style.gridTemplateRows = `repeat(${GRID_ROWS}, ${rowHeight})`;

      yearItems.forEach((item, i) => {
        const col = Math.floor(i / GRID_ROWS) + 1;
        const row = (i % GRID_ROWS) + 1;

        const cell = el("div", `item-grid__cell${col === 1 ? " item-grid__cell--first-col" : ""}`);
        cell.setAttribute("role", "listitem");
        cell.style.gridColumn = col;
        cell.style.gridRow = row;

        const btn = el("button", "item-grid__btn");
        btn.type = "button";
        btn.dataset.itemId = item.id;
        btn.setAttribute("aria-label", item.title);

        if (isFilms) {
          // Backdrop fills the 16:9 cell (cover); fall back to a "no reproduction"
          // placeholder. Poster is intentionally ignored here — film cards are backdrops.
          const backdrop = imageUrl(item.assets?.backdrop, "original");
          if (backdrop) {
            const img = el("img", "item-grid__thumb item-grid__thumb--backdrop");
            img.alt = "";
            lazyRegister(btn, () => setGridBackdrop(img, backdrop));
            btn.appendChild(img);
          } else {
            const ph = el("span", "item-grid__noimg");
            ph.textContent = "no reproduction";
            btn.appendChild(ph);
          }
          // Title overlay: hidden by default, revealed on hover/keyboard focus,
          // always visible on touch (CSS). aria-label on the button covers SR users.
          const title = el("span", "item-grid__title");
          title.textContent = item.title;
          btn.appendChild(title);
        } else if (isPhotos) {
          // A pile of prints: cover on top, sheet edges rotated behind when
          // the record holds several photos; a single photo is a pile of
          // one, slightly tilted. The stack takes the cover's true aspect
          // ratio once the thumbnail decodes, so the sheets match the print's
          // bounds and the photo is never cropped.
          const gAssets = galleryAssets(item);
          const cover = gAssets[0] || null;
          const thumbSrc = imageUrl(item.assets?.thumbnail || cover?.thumbnail, "thumbnail")
            || imageUrl(cover?.file || primaryAsset(item), "display");
          if (thumbSrc) {
            btn.classList.add("item-grid__btn--photo");
            const stack = el("span", "photo-pile");
            if (gAssets.length <= 1) stack.style.transform = `rotate(${photoTilt(item.id)}deg)`;
            if (gAssets.length > 2) stack.appendChild(el("span", "photo-pile__sheet photo-pile__sheet--u2"));
            if (gAssets.length > 1) stack.appendChild(el("span", "photo-pile__sheet photo-pile__sheet--u1"));
            const img = el("img", "photo-pile__print");
            img.alt = "";
            img.addEventListener("load", () => {
              if (!img.naturalWidth || !img.naturalHeight) return;
              stack.style.aspectRatio = `${img.naturalWidth} / ${img.naturalHeight}`;
              if (img.naturalWidth >= img.naturalHeight) stack.style.width = "100%";
              else stack.style.height = "100%";
            });
            lazyRegister(btn, () => { fadeInOnLoad(img); img.src = thumbSrc; });
            stack.appendChild(img);
            // Title overlay on the cover print, revealed on hover/focus like
            // the films grid (always visible on touch via the shared
            // hover:none rule). The count is not shown in the grid — the
            // card's extent row carries it.
            const title = el("span", "item-grid__title");
            title.textContent = item.title;
            stack.appendChild(title);
            if (gAssets.length > 1) {
              btn.setAttribute("aria-label", `${item.title}, ${gAssets.length} photos`);
            }
            btn.appendChild(stack);
          } else {
            const ph = el("span", "item-grid__noimg");
            ph.textContent = "no reproduction";
            btn.appendChild(ph);
          }
        } else {
          const thumbSrc = imageUrl(item.assets?.thumbnail, "thumbnail") || imageUrl(primaryAsset(item), "display");
          if (thumbSrc) {
            const img = el("img", "item-grid__thumb");
            img.alt = "";
            lazyRegister(btn, () => { fadeInOnLoad(img); img.src = thumbSrc; });

            // Singles read as a record: crop the square cover to a disc.
            if (item.item_type === "single") cell.classList.add("item-grid__cell--disc");

            let scaled = false;
            if (item.dimensions && maxDim > 0) {
              const [wMm, hMm] = item.dimensions.split("x").map(s => parseFloat(s.trim()));
              if (wMm && hMm) {
                // Scale relative to the largest item: largest fills ~90% of cell, others shrink proportionally
                const scale = Math.max(wMm, hMm) / maxDim * 0.9;
                img.style.width = `${Math.round(scale * 100)}%`;
                img.style.height = `${Math.round(scale * 100)}%`;
                scaled = true;
              }
            }
            // Items with no usable dimensions aren't scaled, so their thumbnail fills
            // the cell edge-to-edge. Inset them with padding (see CSS) for a calmer grid.
            if (!scaled) cell.classList.add("item-grid__cell--undimensioned");

            btn.appendChild(img);
          } else {
            const txt = el("span", "item-grid__text");
            txt.textContent = item.title;
            btn.appendChild(txt);
          }
        }

        btn.addEventListener("click", () => {
          navigate({ layer: "item", series: seriesKey, subcollection: activeSubKey, view: activeView, item: item.id });
        });

        cell.appendChild(btn);
        cells.appendChild(cell);
      });

      // Pad the last column with empty cells so all columns always have GRID_ROWS rows
      const remainder = yearItems.length % GRID_ROWS;
      if (remainder !== 0) {
        const lastCol = Math.ceil(yearItems.length / GRID_ROWS);
        for (let r = remainder + 1; r <= GRID_ROWS; r++) {
          const empty = el("div", `item-grid__cell item-grid__cell--empty${lastCol === 1 ? " item-grid__cell--first-col" : ""}`);
          empty.style.gridColumn = lastCol;
          empty.style.gridRow = r;
          cells.appendChild(empty);
        }
      }

      group.appendChild(cells);
      grid.appendChild(group);
    });
    }

    gridWrap.appendChild(grid);
    content.appendChild(gridWrap);

    const updateGridAlignment = () => {
      grid.classList.toggle("item-grid--centered", grid.scrollWidth <= gridWrap.clientWidth);
    };
    updateGridAlignment();
    // Films open at the left edge — the most recent watches sit there.
    if (isFilms) requestAnimationFrame(() => { gridWrap.scrollLeft = 0; });
    const gridRO = new ResizeObserver(updateGridAlignment);
    gridRO.observe(gridWrap);
    new MutationObserver((_, mo) => {
      if (!document.contains(gridWrap)) { gridRO.disconnect(); mo.disconnect(); }
    }).observe(document.body, { childList: true, subtree: true });

    // Preload grid thumbnails ahead of the horizontal scroll. Native
    // loading="lazy" keys off the viewport and won't preload within this nested
    // horizontal scroller, so cells to the right blank as you scroll into them.
    // Observe each cell against the scroll container with a wide horizontal
    // margin instead, so its image fetches a few screen-widths before entering
    // view. Falls back to loading everything where IntersectionObserver is absent.
    if (lazyTargets.length) {
      if ("IntersectionObserver" in window) {
        const io = new IntersectionObserver((entries, obs) => {
          for (const e of entries) {
            if (!e.isIntersecting) continue;
            obs.unobserve(e.target);
            if (e.target.__lazyLoad) { e.target.__lazyLoad(); e.target.__lazyLoad = null; }
          }
        }, { root: gridWrap, rootMargin: "0px 1200px" });
        lazyIO = io;
        requestAnimationFrame(() => lazyTargets.forEach(t => { if (t.isConnected) io.observe(t); }));
      } else {
        lazyTargets.forEach(t => { if (t.__lazyLoad) { t.__lazyLoad(); t.__lazyLoad = null; } });
      }
    }

    // Breadcrumb
    const segments = [
      { label: "desk", onClick: () => navigate({ layer: "desk" }) }
    ];
    if (!isFlatSeries) {
      segments.push({ label: s.label, onClick: () => navigate({ layer: "series", series: seriesKey }) });
    }
    const subLabel = isFlatSeries ? s.label : (activeSub?.label || activeSubKey);
    if (!isFlatSeries && subs.length > 1) {
      segments.push({
        label: subLabel,
        current: true,
        dropdown: subs
          .map(([key, sc]) => ({
            label: sc.label,
            onClick: () => navigate({ layer: "browse", series: seriesKey, subcollection: key, item: null })
          }))
      });
    } else {
      segments.push({ label: subLabel, current: true });
    }

    const bc = makeBreadcrumb(segments);
    content.appendChild(bc);
    if (dropdownWasOpen) {
      const newWrap = bc.querySelector(".layer-breadcrumb__seg-wrap");
      if (newWrap) newWrap.classList.add("is-open-instant");
    }

    // Browse sheet title + subtitle in bottom-right metadata overlay.
    // If pushSheet already hoisted our .layer-meta to document.body, update it in place
    // rather than appending a new one inside content — otherwise the stale hoisted element
    // persists and overlaps the new title when switching subcollections via the dropdown.
    const titleText = isFlatSeries ? s.label : (activeSub?.label || activeSubKey);
    const subtitleText = isFlatSeries ? (s.subtitle || s.container || "") : activeSub?.container || "";
    if (hoistedMeta) {
      hoistedMeta.querySelector(".overlay-title").textContent = titleText;
      hoistedMeta.querySelector(".overlay-subtitle").textContent = subtitleText;
    } else {
      const meta = el("div", "layer-meta");
      const h1 = el("h1", "overlay-title");
      h1.textContent = titleText;
      const subtitle = el("p", "overlay-subtitle");
      subtitle.textContent = subtitleText;
      meta.appendChild(h1);
      meta.appendChild(subtitle);
      // Constellation pages carry the registry note — the grouping's voice —
      // under the title and date range.
      if (isConstellation && constellation?.note) {
        const note = el("p", "overlay-subtitle overlay-subtitle--note");
        note.textContent = constellation.note;
        meta.appendChild(note);
      }
      content.appendChild(meta);
    }
  }

  const closeBrowse = () => {
    if (isFlatSeries) {
      navigate({ layer: "desk" });
    } else {
      navigate({ layer: "series", series: seriesKey, subcollection: null, item: null });
    }
  };

  const escCleanup = attachEscapeHandler(content, closeBrowse);
  const cleanup = () => { escCleanup(); if (lazyIO) { lazyIO.disconnect(); lazyIO = null; } };

  renderContent(subKey, viewSlug);

  function update(state) {
    // A sheet only updates within its own series. A cross-series state (e.g. a
    // constellation page giving way to another series' browse at the same depth)
    // cannot be represented by mutating this sheet — report that so the caller
    // replaces it. Returning early instead would leave the old series' grid on
    // screen under the new URL.
    if (state.series !== seriesKey) return false;
    if (state.subcollection && state.subcollection !== subKey) {
      subKey = state.subcollection;
      renderContent(subKey, viewSlug);
    }
    if (state.view && state.view !== viewSlug) {
      viewSlug = state.view;
      renderContent(subKey, viewSlug);
    }
  }

  function onHoist(el) { hoistedMeta = el; }

  return { veil, content, update, cleanup, onHoist };
}

// ── Item sheet ────────────────────────────────────────────────────────────────

// Standard plate field for the catalog-card inspection, in mm (LP-and-a-bit).
// Items outside [PLATE_SMALL_MM, PLATE_MM] get an integer-related field with
// the relation declared on the card ("reduced 1:3" / "enlarged 5:1").
const PLATE_MM = 325;
const PLATE_SMALL_MM = 50;

// Unique-id sequence for per-render clip paths (the panned reproduction is
// clipped to the field region so it never spills over the scale gutters).
let plateClipSeq = 0;

function parseDimensions(item) {
  if (!item?.dimensions) return null;
  const [w, h] = item.dimensions.split("x").map(s => parseFloat(s.trim()));
  return (w > 0 && h > 0) ? { w, h } : null;
}

// Opening zoom that makes the item's larger dimension fill ~3/4 of the plate
// field, so a small object isn't a speck on the 325 mm field. Mirrors
// buildPlate's field-span (ratio) logic and clamps to the slider's 1–6 range;
// returns 1 when there are no dimensions to fit.
function fitZoom(dims) {
  if (!dims) return 1;
  const maxDim = Math.max(dims.w, dims.h);
  let ratio = 1;
  if (maxDim > PLATE_MM) ratio = Math.ceil(maxDim / PLATE_MM);
  else if (maxDim < PLATE_SMALL_MM) ratio = 1 / 5;
  const baseSpan = PLATE_MM * ratio;
  return Math.min(6, Math.max(1, (0.75 * baseSpan) / maxDim));
}

// Build the calibrated plate: an SVG field with mm scales attached to the
// inside of the top and left edges (ticks point inward), and the reproduction
// inset from the origin so the scales stay clear of it. The scales are
// presentational; the typed dimensions row stays canonical.
// Pick a tidy major-tick step (1/2/5 × 10ⁿ) giving ~4 majors across the span.
function niceStep(span) {
  const target = span / 4;
  const pow = Math.pow(10, Math.floor(Math.log10(target)));
  const cands = [1, 2, 5, 10].map(c => c * pow);
  return cands.reduce((a, b) => Math.abs(b - target) < Math.abs(a - target) ? b : a);
}

// Build the calibrated plate. Scales sit on the inside of the top and left
// box edges with ticks pointing inward and numbers on the inner side of the
// ticks. The box edges are the container borders. `zoom` shrinks the visible
// field span (the reproduction enlarges from the origin and the scales adjust);
// the reproduction is clipped to the box. `panX`/`panY` are the field-mm
// coordinates shown at the visible origin, so the window is [pan, pan+span] on
// each axis and the scales renumber to match. `img` is reused across redraws so
// the scan is not re-fetched while dragging the zoom slider or panning.
function buildPlate(item, dims, sidePx, img, zoom = 1, panX = 0, panY = 0) {
  const NS = "http://www.w3.org/2000/svg";
  const INSET = 32; // gutter inside the box for inward ticks + their numbers

  // Undimensioned items still get a scale grid — drawn but unlabelled: the ruler
  // without a measurement claim. They use the standard 325 field, no ratio/zoom.
  const hasDims = !!(dims && dims.w > 0 && dims.h > 0);

  // Base field span: standard 325; integer reduction for oversize; 5:1 field
  // for very small items so a stamp does not become a speck.
  let ratio = 1;
  if (hasDims) {
    const maxDim = Math.max(dims.w, dims.h);
    if (maxDim > PLATE_MM) ratio = Math.ceil(maxDim / PLATE_MM);
    else if (maxDim < PLATE_SMALL_MM) ratio = 1 / 5;
  }
  const baseSpan = PLATE_MM * ratio;
  const spanMM = baseSpan / (hasDims ? zoom : 1);  // effective visible field

  const origin = INSET;                 // visible-origin pixel (field-mm = pan)
  const extent = sidePx - INSET;        // run from origin to the far border
  const px = mm => (mm / spanMM) * extent;

  // Pan offset, in field mm, clamped so you can travel the reproduction's own
  // extent but never scroll off into empty field. Only dimensioned plates pan;
  // when the field is wider than the item (e.g. at zoom 1) the range collapses
  // to zero and dragging has no effect.
  if (hasDims) {
    panX = Math.min(Math.max(panX, 0), Math.max(0, dims.w - spanMM));
    panY = Math.min(Math.max(panY, 0), Math.max(0, dims.h - spanMM));
  } else {
    panX = panY = 0;
  }

  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("class", "item-card__plate-svg");
  svg.setAttribute("viewBox", `0 0 ${sidePx} ${sidePx}`);
  svg.style.maxWidth = `${sidePx}px`;
  svg.setAttribute("aria-hidden", "true"); // dims are read from the fields column

  // Box edge sits on the container borders.
  const edge = document.createElementNS(NS, "rect");
  edge.setAttribute("x", 0.5); edge.setAttribute("y", 0.5);
  edge.setAttribute("width", sidePx - 1); edge.setAttribute("height", sidePx - 1);
  edge.setAttribute("class", "plate-edge");
  svg.appendChild(edge);

  // Reproduction anchored to its field-mm (0,0), shifted by the pan offset
  // (true proportion when dimensioned, otherwise filling the field). It is
  // clipped to the field region so a panned reproduction slides under the
  // scale gutters rather than over them. Omitted when there is no image — the
  // plate then shows the bare scale grid, so every card still carries a plate.
  if (img) {
    const clipId = `plate-clip-${++plateClipSeq}`;
    const defs = document.createElementNS(NS, "defs");
    const clip = document.createElementNS(NS, "clipPath");
    clip.setAttribute("id", clipId);
    const clipRect = document.createElementNS(NS, "rect");
    clipRect.setAttribute("x", origin); clipRect.setAttribute("y", origin);
    clipRect.setAttribute("width", extent); clipRect.setAttribute("height", extent);
    clip.appendChild(clipRect);
    defs.appendChild(clip);
    svg.appendChild(defs);

    const fo = document.createElementNS(NS, "foreignObject");
    fo.setAttribute("x", origin - px(panX)); fo.setAttribute("y", origin - px(panY));
    fo.setAttribute("width", hasDims ? Math.max(1, px(dims.w)) : extent);
    fo.setAttribute("height", hasDims ? Math.max(1, px(dims.h)) : extent);
    fo.setAttribute("clip-path", `url(#${clipId})`);
    const repro = el("div", "item-card__repro");
    // Singles read as a record on the card too: crop the reproduction to a disc.
    if (item.item_type === "single") repro.classList.add("item-card__repro--disc");
    if (img.parentElement) img.parentElement.removeChild(img);
    repro.appendChild(img);
    fo.appendChild(repro);
    svg.appendChild(fo);
  }

  const tick = (x1, y1, x2, y2, major) => {
    const l = document.createElementNS(NS, "line");
    l.setAttribute("x1", x1); l.setAttribute("y1", y1);
    l.setAttribute("x2", x2); l.setAttribute("y2", y2);
    l.setAttribute("class", major ? "plate-tick plate-tick--major" : "plate-tick");
    svg.appendChild(l);
  };
  const label = (x, y, str, anchor) => {
    const t = document.createElementNS(NS, "text");
    t.setAttribute("x", x); t.setAttribute("y", y);
    t.setAttribute("text-anchor", anchor);
    t.textContent = str;
    svg.appendChild(t);
  };

  // Ticks hang inward from the top and left borders; numbers on the inner
  // (field) side of the ticks. Each axis is drawn over its own visible window
  // [pan, pan + span]: ticks land on multiples of `minor` within that window
  // and carry their true mm value, so the scale renumbers as the field pans.
  const major = niceStep(spanMM);
  const minor = major / 5;
  const axis = (pan, horizontal) => {
    const kStart = Math.ceil((pan - 1e-6) / minor);
    const kEnd = Math.floor((pan + spanMM + 1e-6) / minor);
    for (let k = kStart; k <= kEnd; k++) {
      const mm = k * minor;
      const p = origin + px(mm - pan);
      if (p < origin - 0.5 || p > sidePx + 0.5) continue;
      const isMajor = ((k % 5) + 5) % 5 === 0;
      const t = isMajor ? 11 : 6;
      if (horizontal) tick(p, 0, p, t, isMajor);   // top edge → down
      else            tick(0, p, t, p, isMajor);   // left edge → right
      if (isMajor && hasDims && mm >= 0) { // labels only when calibrated
        const val = Math.round(mm);
        if (horizontal) label(p, t + 11, val, "middle"); // top: number below tick
        else if (mm > 0) label(t + 3, p + 3, val, "start"); // left: right of tick
      }
    }
  };
  axis(panX, true);  // top scale
  axis(panY, false); // left scale

  // Scale note: relational, never a false "1:1" — a screen mm is not a mm.
  // Undimensioned plates carry no measurement, only the note.
  let scaleNote;
  if (!hasDims) {
    scaleNote = "dimensions not recorded";
  } else {
    scaleNote = `field ${Math.round(spanMM)} mm`;
    if (ratio > 1) scaleNote += ` · reduced 1:${ratio}`;
    else if (ratio < 1) scaleNote += ` · enlarged 5:1`;
    if (zoom > 1.01) scaleNote += ` · ${zoom.toFixed(1)}×`;
    // Books are sized by format, not measured — mark the field as an estimate.
    if (item.dimensions_estimated) scaleNote += " · est.";
  }

  return { svg, scaleNote, spanMM, pxPerMM: extent / spanMM, origin, panX, panY };
}

function makeItemSheet(seriesKey, subKey, itemId, viewSlug) {
  // Constellation context: the browse context is the constellation's member
  // list (cross-series, chronological), so prev/next steps through the
  // constellation rather than a subcollection.
  const isConstellation = seriesKey === "constellations";
  const constellation = isConstellation ? constellationFor(viewSlug) : null;
  const s = isConstellation
    ? { label: constellation?.title || viewSlug, subcollections: {} }
    : archive.series[seriesKey];
  let allItems;

  if (isConstellation) {
    allItems = constellation?.items || [];
  } else if (subKey && s.subcollections[subKey]) {
    allItems = s.subcollections[subKey].items;
  } else if (Object.keys(s.subcollections || {}).length > 0) {
    allItems = Object.values(s.subcollections).flatMap(sc => sc.items || []);
  } else {
    allItems = s.items || [];
  }
  let currentIdx = allItems.findIndex(i => i.id === itemId);
  if (currentIdx === -1) currentIdx = 0;

  const veil = makeVeil(() => {
    navigate({ layer: "browse", series: seriesKey, subcollection: subKey, view: viewSlug || null, item: null });
  });

  const content = makeContent();
  content.classList.add("layer-content--item-card");

  // Prefetch a neighbour's plate images so arrow/keyboard stepping lands on an
  // already-cached image instead of reloading (soft thumbnail → sharp display) in
  // view. Each prefetched Image is RETAINED (kept in the Map, not discarded) so its
  // decoded bytes stay in the browser's in-memory image cache until we navigate.
  // This is what makes the preload stick for the R2-hosted derivatives: r2.dev
  // sends no Cache-Control and is not edge-cached, so a dropped prefetch gets
  // re-fetched on use and the preload is wasted — unlike the external CDN
  // posters/covers (films, books), which cache on their own. Deferred to idle time
  // so it never competes with the active card's own load; bounded to the most
  // recent handful so memory stays flat while stepping through.
  const prefetched = new Map(); // url → retained HTMLImageElement
  const prefetchImg = (url) => {
    if (!url || prefetched.has(url)) return;
    const im = new Image();
    im.decoding = "async";
    im.src = url;
    prefetched.set(url, im);
    if (prefetched.size > 12) prefetched.delete(prefetched.keys().next().value);
  };
  const prefetchNeighbors = (idx) => {
    for (const j of [idx - 1, idx + 1]) {
      const it = allItems[j];
      if (!it) continue;
      const primary = primaryAsset(it);
      if (primary) prefetchImg(imageUrl(primary, isCutoutAsset(primary) ? "cutout" : "display"));
      if (it.assets?.thumbnail) prefetchImg(imageUrl(it.assets.thumbnail, "thumbnail"));
    }
  };
  const schedulePrefetch = (idx) => {
    const run = () => prefetchNeighbors(idx);
    if ("requestIdleCallback" in window) requestIdleCallback(run, { timeout: 1500 });
    else setTimeout(run, 300);
  };

  function renderContent(idx) {
    currentIdx = idx;
    const item = allItems[idx];

    content.innerHTML = "";
    content.appendChild(buildCardWrap(item));
    renderChrome(item, idx);
    schedulePrefetch(idx);
  }

  // ── Catalog-card inspection ─────────────────────────────────────────────────
  // Builds and returns one card's .item-card-wrap for `item`. Used both for the
  // visible card and for the off-screen neighbours pre-rendered during a swipe,
  // so it must not touch `content` or shared state.
  function buildCardWrap(item) {
    const wrap = el("div", "item-card-wrap");
    // Clicking the surround (not the card) exits, like the veil.
    wrap.addEventListener("click", (e) => {
      if (e.target === wrap) {
        navigate({ layer: "browse", series: seriesKey, subcollection: subKey, view: viewSlug || null, item: null });
      }
    });

    const card = el("article", "item-card");
    card.setAttribute("aria-label", `Record ${item.id}: ${item.title}`);

    // ── Fields column — catalog card: ruled label/value fields, paired
    //    two-up into split rows where the data is compact (see mockup 01).
    //    The column is a fixed-height cell whose content scrolls (reusing the
    //    bio/CV scroll machinery) so the card keeps the plate's square footprint.
    const fieldsCol = el("div", "item-card__fields");
    const fields = el("div", "bio-document__scroll item-card__fields-scroll");
    fieldsCol.appendChild(fields);

    const dims = parseDimensions(item);
    // Gallery-backed records (photos, and any record with gallery images):
    // the set steps within the plate column. decisions.md →
    // "Photo entries — display treatment".
    const gAssets = galleryAssets(item);
    let galleryIdx = 0;
    let showFrame = () => {};      // assigned once the strip exists
    let frameCaptionEl = null;     // the fields column's "frame" caption row
    // Each card opens at its own fit zoom (a small item isn't a speck). The
    // level is local to this card so pre-rendered neighbours don't disturb it.
    let localZoom = fitZoom(dims);

    // A label/value pair as a fragment, ready to drop into a 2- or 4-col row.
    const pair = (label, value, mono) => {
      const frag = document.createDocumentFragment();
      const l = el("span", "overlay-label");
      l.textContent = label;
      const v = el("span", `overlay-value${mono ? " overlay-value--mono" : ""}`);
      v.textContent = value;
      frag.appendChild(l);
      frag.appendChild(v);
      return frag;
    };
    const singleRow = (label, value, mono, extraClass) => {
      if (!value) return; // unrecorded fields are suppressed, never faked
      const row = el("div", "item-card__row" + (extraClass ? " " + extraClass : ""));
      row.appendChild(pair(label, value, mono));
      fields.appendChild(row);
    };
    // Two pairs side by side; degrades to a single row if one side is absent.
    const splitRow = (a, b, extraClass) => {
      const present = [a, b].filter(p => p && p[1]);
      if (present.length === 0) return;
      if (present.length === 1) { singleRow(...present[0], extraClass); return; }
      const row = el("div", "item-card__row item-card__row--split" + (extraClass ? " " + extraClass : ""));
      present.forEach(p => row.appendChild(pair(...p)));
      fields.appendChild(row);
    };

    // Rating — the score reads serif (your judgment), the " / 5" scale mono (record).
    const ratingRow = (value) => {
      const row = el("div", "item-card__row");
      const l = el("span", "overlay-label");
      l.textContent = "rating";
      const v = el("span", "overlay-value");
      v.appendChild(document.createTextNode(String(value)));
      const scale = el("span", "overlay-value--mono");
      scale.textContent = " / 5";
      v.appendChild(scale);
      row.appendChild(l);
      row.appendChild(v);
      fields.appendChild(row);
    };

    // Accession — id + type, monospace codes, paired at the top. On mobile this
    // row compacts onto a single subtle line (see .item-card__row--accession).
    splitRow(["ID", item.id, true], ["type", item.item_type, true], "item-card__row--accession");

    // Title — its own full-width field, kept as the card's heading.
    const titleRow = el("div", "item-card__row item-card__row--title");
    const titleLabel = el("span", "overlay-label");
    titleLabel.textContent = "title";
    // Title register: monospace for transcribed work titles (Consumption),
    // serif for titles the archivist devised (Creation / Accumulation).
    const titleEl = el("h2", "item-card__title" + (titleIsGiven(item.item_type) ? " item-card__title--mono" : ""));
    titleEl.textContent = item.title;
    titleRow.appendChild(titleLabel);
    titleRow.appendChild(titleEl);
    fields.appendChild(titleRow);

    // Responsibility — role-adaptive creator, suppressed for self-authored
    // (Creation) records. Source of truth: src/shared/field-schema.js.
    const creator = resolveCreator(item);
    if (creator) singleRow(creator.label, creator.value, true);

    // Date — its own spine row (a given fact → monospace). Films carry a
    // rewatch checkbox to the right of the date: a read-only catalog mark,
    // checked when this viewing was logged as a rewatch on Letterboxd.
    if (item.item_type === "film" && item.display_date) {
      const row = el("div", "item-card__row item-card__row--date-film");
      row.appendChild(pair("date", item.display_date, true));
      const checked = item.rewatch === true || item.rewatch === "true";
      const rw = el("span", "item-card__rewatch" + (checked ? " is-checked" : ""));
      rw.setAttribute("role", "img");
      rw.setAttribute("aria-label", checked ? "rewatch: yes" : "rewatch: no");
      const box = el("span", "item-card__rewatch-box");
      box.setAttribute("aria-hidden", "true");
      box.textContent = checked ? "✓" : "";
      const rwLabel = el("span", "item-card__rewatch-label");
      rwLabel.textContent = "rewatch";
      rw.appendChild(box);
      rw.appendChild(rwLabel);
      row.appendChild(rw);
      fields.appendChild(row);
    } else {
      singleRow("date", item.display_date, true);
    }

    // Typed slots — up to three type-specific rows. resolveSlots handles
    // suppression and the place/event split row for ephemera; cells are mono
    // (catalog data), with rating special-cased to a serif score + mono scale.
    resolveSlots(item).forEach(row => {
      if (row.type === "split") {
        const [a, b] = row.cells;
        splitRow([a.label, a.value, a.mono], [b.label, b.value, b.mono]);
      } else if (row.key === "rating") {
        ratingRow(row.value);
      } else {
        singleRow(row.label, row.value, row.mono);
      }
    });

    // Frame caption — a multi-photo record carries the selected frame's
    // caption as its own row; stepping the plate updates it. Suppressed when
    // no frame has a caption recorded (unrecorded fields are never faked).
    if (gAssets.length > 1 && gAssets.some(g => g.caption)) {
      const row = el("div", "item-card__row");
      const l = el("span", "overlay-label");
      l.textContent = "frame";
      frameCaptionEl = el("span", "overlay-value");
      row.appendChild(l);
      row.appendChild(frameCaptionEl);
      fields.appendChild(row);
    }

    // Physical — extent + dimensions (the calibrated plate carries true size).
    // A leading "≈" flags an estimated size (books, sized by format) so the mm
    // plate is not read as a measurement.
    const dimText = dims ? `${item.dimensions_estimated ? "≈ " : ""}${dims.w} × ${dims.h} mm` : null;
    // Gallery-backed records (photos): extent defaults to the photo count —
    // a recorded extent still wins.
    const extentText = item.extent
      || (gAssets.length ? `${gAssets.length} photo${gAssets.length > 1 ? "s" : ""}` : null);
    splitRow(["extent", extentText, true], ["dimensions", dimText, true]);

    if (item.context_note) {
      const note = el("div", "item-card__note");
      const l = el("span", "overlay-label");
      l.textContent = "note";
      const p = el("p");
      p.textContent = item.context_note;
      note.appendChild(l);
      note.appendChild(p);
      fields.appendChild(note);
    }

    if (item.related_ids?.length || item.constellations?.length || item.tags?.length) {
      const riders = el("div", "item-card__riders");
      let firstRiderRow = true;
      const riderLabel = (text) => {
        const l = el("span", "overlay-label");
        l.textContent = text;
        if (!firstRiderRow) l.style.marginTop = "0.5rem";
        firstRiderRow = false;
        return l;
      };
      if (item.related_ids?.length) {
        riders.appendChild(riderLabel("see also"));
        item.related_ids.forEach(rid => {
          const rel = allItems.find(i => i.id === rid);
          const btn = el("button", "item-card__rider");
          btn.type = "button";
          btn.textContent = rel ? rel.title : rid;
          btn.addEventListener("click", () => {
            const i = allItems.findIndex(it => it.id === rid);
            if (i !== -1) navItem(i);
          });
          riders.appendChild(btn);
        });
      }
      // Constellations — their own rider row of clickable tokens, each opening
      // the constellation's cross-series browse (/constellations/<slug>/).
      // Mono register: an index/navigation token, like tags and see-also.
      if (item.constellations?.length) {
        riders.appendChild(riderLabel("constellations"));
        item.constellations.forEach(slug => {
          const c = constellationFor(slug);
          const btn = el("button", "item-card__rider");
          btn.type = "button";
          btn.textContent = c ? c.title : slug;
          btn.setAttribute("aria-label", `Constellation: ${c ? c.title : slug}`);
          btn.addEventListener("click", () => {
            // Cross-series jump: the layer stack under this modal belongs to the
            // item's home series, so return to the desk first, then open the
            // constellation as a fresh depth-1 sheet. (Back therefore retraces
            // through the desk — consistent with the spatial model.)
            navigate({ layer: "desk", series: null, subcollection: null, view: null, item: null });
            navigate({ layer: "browse", series: "constellations", subcollection: null, view: slug, item: null });
          });
          riders.appendChild(btn);
        });
      }
      if (item.tags?.length) {
        riders.appendChild(riderLabel("tags"));
        const v = el("span", "overlay-value overlay-value--mono");
        v.textContent = item.tags.join(" · ");
        riders.appendChild(v);
      }
      fields.appendChild(riders);
    }

    // Scroll affordance for the left column — caret hides when scrolled to bottom.
    const fieldsCaret = el("button", "bio-document__scroll-caret item-card__fields-caret");
    fieldsCaret.type = "button";
    fieldsCaret.setAttribute("aria-label", "Scroll fields");
    fieldsCol.appendChild(fieldsCaret);
    const updateFieldsCaret = () => {
      const atBottom = fields.scrollHeight - fields.scrollTop <= fields.clientHeight + 2;
      fieldsCaret.classList.toggle("is-hidden", atBottom);
      fieldsCol.classList.toggle("at-bottom", atBottom);
    };
    fields.addEventListener("scroll", updateFieldsCaret, { passive: true });
    requestAnimationFrame(updateFieldsCaret);
    fieldsCaret.addEventListener("click", () => {
      fields.scrollTo({ top: fields.scrollTop + fields.clientHeight * 0.6, behavior: "smooth" });
    });

    card.appendChild(fieldsCol);

    // ── Plate column
    const plateCol = el("div", "item-card__plate");
    const plateHead = el("div", "item-card__plate-head");
    const plateLabel = el("span", "overlay-label");
    plateLabel.textContent = "plate";
    const scaleNote = el("span", "item-card__scale-note");
    plateHead.appendChild(plateLabel);
    plateHead.appendChild(scaleNote);
    plateCol.appendChild(plateHead);

    const field = el("div", "item-card__field");
    plateCol.appendChild(field);

    const primary = primaryAsset(item);
    const back = item.assets?.back || null;

    const showNone = () => {
      // No reproduction: still draw the plate's scale grid (image-less) so every
      // card carries the same plate. Labelled only when dimensions are recorded.
      field.innerHTML = "";
      const plate = buildPlate(item, dims, PLATE_PX, null);
      field.appendChild(plate.svg);
      scaleNote.textContent = "no reproduction";
    };

    const PLATE_PX = 416; // internal viewBox size; scales responsively

    // The reproduction <img> persists across zoom redraws (no re-fetch).
    let reproImg = null;
    let showingBack = false;
    if (primary) {
      reproImg = el("img");
      reproImg.alt = item.title;
      reproImg.draggable = false;
      reproImg.decoding = "async";
      // Show the grid's cache-warm thumbnail immediately, then swap in the full
      // reproduction — the transparent cut-out where the item has one (scanned
      // ephemera), otherwise the display scan.
      loadReproProgressive(reproImg, primary, item.assets?.thumbnail, showNone, fullVariants(primary));
    }

    let plateState = null; // { origin, pxPerMM, spanMM, scaleNote, panX, panY }
    let panX = 0, panY = 0; // current pan offset in field mm
    let dragging = false;   // a single-pointer pan is in progress
    let swipeActive = false; // the swipe carousel has taken over — suppress plate pan

    // Redraw the calibrated plate at a given zoom and pan (field span shrinks as
    // zoom grows; pan slides the window across the reproduction). buildPlate
    // re-clamps the pan to the item's extent and returns the applied values, so
    // panX/panY stay honest after a zoom-out collapses the pannable range.
    const renderPlate = (zoom, nextPanX = panX, nextPanY = panY) => {
      localZoom = zoom; // remember the level for this card
      field.innerHTML = "";
      const plate = buildPlate(item, dims, PLATE_PX, reproImg, zoom, nextPanX, nextPanY);
      panX = plate.panX; panY = plate.panY;
      plateState = plate;
      scaleNote.textContent = plate.scaleNote;
      field.appendChild(plate.svg);
    };

    if (primary && gAssets.length) {
      // Gallery reproduction (photos): shown whole, centered and padded at
      // its own aspect ratio — no calibrated plate. The rule: the full photo
      // is always visible, never cropped.
      field.classList.add("item-card__field--photo");
      // Flip the card's column split: the plate outweighs the fields column.
      card.classList.add("item-card--photo");
      if (reproImg) {
        // Pin the layout box from the photo's aspect ratio, not the loaded
        // resolution: the low-res thumbnail shows first, and sizing from its
        // intrinsic pixels would render it small and then "grow" when the
        // display derivative swaps in. Thumb and display share the photo's
        // ratio, so the box computed here holds through the swap. The padded
        // field is square, so pinning the long axis at 100% fits exactly.
        const sizePhoto = () => {
          if (!reproImg.naturalWidth || !reproImg.naturalHeight) return;
          reproImg.style.aspectRatio = `${reproImg.naturalWidth} / ${reproImg.naturalHeight}`;
          if (reproImg.naturalWidth >= reproImg.naturalHeight) {
            reproImg.style.width = "100%";
            reproImg.style.height = "auto";
          } else {
            reproImg.style.height = "100%";
            reproImg.style.width = "auto";
          }
        };
        reproImg.addEventListener("load", sizePhoto);
        sizePhoto(); // the thumbnail may already be decoded
        field.appendChild(reproImg);
      }
      scaleNote.textContent = "dimensions not recorded";
    } else if (primary && dims) {
      renderPlate(localZoom);

      // Crosshair readout — pointer position in field mm, offset by the pan so
      // the number reflects the panned window. Enhancement only; the typed
      // dimensions row remains the canonical record of size. Suppressed while a
      // drag-pan is underway (the scale note then shows the field span instead).
      field.addEventListener("pointermove", (e) => {
        if (!plateState || dragging) return;
        const r = field.getBoundingClientRect();
        const svgSize = Math.min(r.width, r.height);
        const unit = svgSize / PLATE_PX; // px per viewBox unit
        const x = plateState.panX + ((e.clientX - r.left) / unit - plateState.origin) / plateState.pxPerMM;
        const y = plateState.panY + ((e.clientY - r.top) / unit - plateState.origin) / plateState.pxPerMM;
        const inX = x >= plateState.panX && x <= plateState.panX + plateState.spanMM;
        const inY = y >= plateState.panY && y <= plateState.panY + plateState.spanMM;
        scaleNote.textContent =
          (inX && inY) ? `${Math.round(x)} × ${Math.round(y)} mm` : plateState.scaleNote;
      });
      field.addEventListener("pointerleave", () => {
        if (plateState) scaleNote.textContent = plateState.scaleNote;
      });
    } else if (primary) {
      // Dimensions not recorded: draw the same scale grid, unlabelled, and let
      // the reproduction fill the field — the ruler without a measurement claim.
      field.innerHTML = "";
      const plate = buildPlate(item, null, PLATE_PX, reproImg);
      scaleNote.textContent = plate.scaleNote;
      field.appendChild(plate.svg);
    } else {
      showNone();
    }

    if (primary) {
      const foot = el("div", "item-card__plate-foot");

      const controls = el("div", "item-card__plate-controls");
      const assetLabel = el("span", "item-card__asset-label");
      if (gAssets.length > 1) {
        // Multi-photo: prev/next step the plate through the set, in the
        // overturn control's register; the asset label becomes the frame
        // counter (kept current by showFrame, defined with the strip below).
        const prevB = el("button", "item-card__flip");
        prevB.type = "button";
        prevB.textContent = "\u2039 prev";
        prevB.setAttribute("aria-label", "Previous photo");
        prevB.addEventListener("click", () => showFrame(galleryIdx - 1));
        controls.appendChild(prevB);
        const nextB = el("button", "item-card__flip");
        nextB.type = "button";
        nextB.textContent = "next \u203a";
        nextB.setAttribute("aria-label", "Next photo");
        nextB.addEventListener("click", () => showFrame(galleryIdx + 1));
        controls.appendChild(nextB);
      } else if (back) {
        const flip = el("button", "item-card__flip");
        flip.type = "button";
        flip.textContent = "overturn";
        flip.setAttribute("aria-label", "Overturn: show the other side");
        flip.addEventListener("click", () => {
          showingBack = !showingBack;
          // No thumbnail for the far side: hold the current side until it decodes.
          // The verso is cut out too when the recto is, so pick variants per side.
          const side = showingBack ? back : primary;
          if (reproImg) loadReproProgressive(reproImg, side, null, showNone, fullVariants(side));
          assetLabel.textContent = showingBack ? "verso" : "recto";
        });
        controls.appendChild(flip);
      }
      assetLabel.textContent = gAssets.length > 1 ? "" : (back ? "recto" : "1/1");
      controls.appendChild(assetLabel);
      foot.appendChild(controls);

      // Zoom slider — only meaningful when there is a calibrated field to
      // rescale. Dragging shrinks the field span and enlarges the item.
      // Gallery fields (photos) show the whole reproduction instead.
      if (dims && !gAssets.length) {
        const zoomWrap = el("label", "item-card__zoom-wrap");
        const zoomLabel = el("span", "item-card__asset-label");
        zoomLabel.textContent = "zoom";
        const zoom = el("input", "item-card__zoom-slider");
        zoom.type = "range";
        zoom.min = "1"; zoom.max = "6"; zoom.step = "0.05"; zoom.value = String(localZoom);
        zoom.setAttribute("aria-label", "Zoom plate");
        zoom.addEventListener("input", () => renderPlate(parseFloat(zoom.value)));
        zoomWrap.appendChild(zoomLabel);
        zoomWrap.appendChild(zoom);
        foot.appendChild(zoomWrap);

        // The plate is directly manipulable: a single-pointer drag pans the
        // field, two pointers pinch-zoom. Marking the field interactive gives
        // it the grab cursor and disables native touch scrolling/zoom over it.
        field.classList.add("item-card__field--interactive");

        const ptrs = new Map();
        let lastDist = null;
        let panStart = null; // { x, y, panX, panY } captured at drag start

        field.addEventListener("pointerdown", (e) => {
          field.setPointerCapture?.(e.pointerId);
          ptrs.set(e.pointerId, e);
          if (ptrs.size === 1) {
            // Begin a pan: remember where the drag and the field started.
            panStart = { x: e.clientX, y: e.clientY, panX, panY };
            dragging = true;
            field.classList.add("is-grabbing");
          } else {
            // A second pointer means pinch, not pan.
            panStart = null;
            dragging = false;
            field.classList.remove("is-grabbing");
          }
        });

        field.addEventListener("pointermove", (e) => {
          if (!ptrs.has(e.pointerId)) return;
          ptrs.set(e.pointerId, e);
          if (ptrs.size === 2) {
            // Pinch → zoom, driving the same slider value.
            const [a, b] = [...ptrs.values()];
            const dist = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
            if (lastDist !== null) {
              const v = Math.min(6, Math.max(1, parseFloat(zoom.value) + (dist - lastDist) * 0.01));
              zoom.value = String(v);
              renderPlate(v);
            }
            lastDist = dist;
          } else if (panStart && plateState && !swipeActive) {
            // Drag → pan. Convert the client-pixel delta to field mm and move
            // the window opposite the drag (dragging right reveals content to
            // the left). Computing from the drag origin keeps clamping stable.
            const r = field.getBoundingClientRect();
            const unit = Math.min(r.width, r.height) / PLATE_PX;
            const mmPerClientPx = 1 / (plateState.pxPerMM * unit);
            const nx = panStart.panX - (e.clientX - panStart.x) * mmPerClientPx;
            const ny = panStart.panY - (e.clientY - panStart.y) * mmPerClientPx;
            renderPlate(parseFloat(zoom.value), nx, ny);
          }
        });

        const endPtr = (e) => {
          ptrs.delete(e.pointerId);
          if (ptrs.size < 2) lastDist = null;
          if (ptrs.size === 0) {
            panStart = null;
            dragging = false;
            field.classList.remove("is-grabbing");
          }
        };
        field.addEventListener("pointerup", endPtr);
        field.addEventListener("pointercancel", endPtr);

        // Wheel / trackpad scroll zooms the plate exactly like the slider —
        // a smooth rescale — but centered on the pointer so the field-mm under
        // the cursor stays pinned. Wheel events fire in bursts (especially on
        // trackpads), so deltas are capped and accumulated, then applied once
        // per animation frame: one clean render per frame instead of a jittery
        // render per event. preventDefault keeps the page from scrolling.
        let wheelAccum = 0, wheelX = 0, wheelY = 0, wheelRAF = 0;
        const applyWheel = () => {
          wheelRAF = 0;
          if (!plateState || !wheelAccum) { wheelAccum = 0; return; }
          const oldZoom = parseFloat(zoom.value);
          // Multiplicative step → even-feeling zoom at any scale. Scrolling down
          // (positive delta) zooms in; up zooms out.
          const v = Math.min(6, Math.max(1, oldZoom * Math.exp(wheelAccum * 0.0022)));
          wheelAccum = 0;
          if (v === oldZoom) return;

          // Pin the point under the cursor: read its field-mm at the old scale,
          // then choose the pan that re-pins it at the new scale.
          const r = field.getBoundingClientRect();
          const unit = Math.min(r.width, r.height) / PLATE_PX;
          const offX = (wheelX - r.left) / unit - plateState.origin;
          const offY = (wheelY - r.top) / unit - plateState.origin;
          const cx = plateState.panX + offX / plateState.pxPerMM;
          const cy = plateState.panY + offY / plateState.pxPerMM;
          const extent = plateState.pxPerMM * plateState.spanMM; // px run of field
          const newPxPerMM = extent / ((plateState.spanMM * oldZoom) / v);

          zoom.value = String(v);
          renderPlate(v, cx - offX / newPxPerMM, cy - offY / newPxPerMM);
        };
        field.addEventListener("wheel", (e) => {
          if (!plateState) return;
          e.preventDefault();
          let dy = e.deltaY;
          if (e.deltaMode === 1) dy *= 16;        // lines → ~px
          else if (e.deltaMode === 2) dy *= PLATE_PX; // pages → ~px
          wheelAccum += Math.max(-50, Math.min(50, dy)); // cap momentum bursts
          wheelX = e.clientX; wheelY = e.clientY;
          if (!wheelRAF) wheelRAF = requestAnimationFrame(applyWheel);
        }, { passive: false });
      }

      // Contact strip — a record holding 2+ gallery images shows the whole
      // set between the field and the foot, each photo in its entirety in
      // its padded cell. Clicking a frame (or the foot's prev/next) steps the
      // plate; the fields column's frame caption and the counter follow.
      if (gAssets.length > 1) {
        const strip = el("div", "item-card__strip");
        strip.setAttribute("role", "tablist");
        strip.setAttribute("aria-label", "photos");
        const stripBtns = gAssets.map((g, i) => {
          const b = el("button", "item-card__strip-btn");
          b.type = "button";
          b.setAttribute("role", "tab");
          b.setAttribute("aria-label", `Frame ${i + 1} of ${gAssets.length}${g.caption ? `: ${g.caption}` : ""}`);
          const t = el("img", "item-card__strip-img");
          t.alt = "";
          t.decoding = "async";
          t.loading = "lazy";
          t.src = g.thumbnail ? imageUrl(g.thumbnail, "thumbnail") : imageUrl(g.file, "display");
          b.appendChild(t);
          b.addEventListener("click", () => showFrame(i));
          strip.appendChild(b);
          return b;
        });
        const pad2 = n => String(n).padStart(2, "0");
        showFrame = (i) => {
          const from = galleryIdx;
          galleryIdx = (i + gAssets.length) % gAssets.length;
          const g = gAssets[galleryIdx];
          if (reproImg && galleryIdx !== from) {
            loadReproProgressive(reproImg, g.file, g.thumbnail, showNone, fullVariants(g.file));
          }
          if (reproImg) reproImg.alt = g.caption || item.title;
          assetLabel.textContent = `${pad2(galleryIdx + 1)}/${pad2(gAssets.length)}`;
          if (frameCaptionEl) frameCaptionEl.textContent = g.caption || "\u2014";
          stripBtns.forEach((b, j) => b.setAttribute("aria-current", j === galleryIdx));
          // Long sets scroll within the strip — keep the active frame in view
          // when stepping from the foot controls. block: "nearest" so the
          // page itself never jumps.
          stripBtns[galleryIdx]?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
        };
        showFrame(0);
        plateCol.appendChild(strip);
      }

      plateCol.appendChild(foot);
    } else {
      // Reserve the foot's height so a card with no reproduction keeps the
      // same size as a reproduced one.
      plateCol.appendChild(el("div", "item-card__plate-foot"));
    }

    card.appendChild(plateCol);

    // Status stamp — the card wears its status rather than listing it.
    if (item.status && item.status !== "published") {
      const stamp = el("span", "item-card__stamp");
      stamp.textContent = item.status;
      card.appendChild(stamp);
    }

    wrap.appendChild(card);

    // Gesture arbitration hooks for the swipe carousel: report the plate's
    // horizontal pan state, and let the carousel suppress plate panning once it
    // takes over the gesture.
    wrap.__setSwipeActive = (v) => { swipeActive = v; };
    wrap.__plate = {
      interactive: !!(primary && dims && !gAssets.length),
      panState: () => (plateState && dims)
        ? { panX: plateState.panX, panMaxX: Math.max(0, dims.w - plateState.spanMM) }
        : null,
    };

    // Scroll-edge fade: on mobile the card is taller than the screen and scrolls
    // inside this fixed viewport. Fade whichever edges overflow so content
    // dissolves at the top edge and before the bottom breadcrumb rather than
    // clashing with them. The bottom reaches full transparency by the
    // breadcrumb's top; each fade drops away at its extreme so the first/last
    // row lands crisp. Inert on desktop, where the card fits and never scrolls.
    // Mirrors the horizontal updateScrollMask used by the labor panels.
    const TOP_FADE = "2.5rem";   // soft dissolve at the top edge
    const BOT_START = "7.5rem";  // bottom: opaque until here, then fade
    const BOT_CLEAR = "4.5rem";  // bottom: fully clear by here (above the breadcrumb)
    const updateCardMask = () => {
      const atTop = wrap.scrollTop <= 0;
      const atBottom = wrap.scrollTop + wrap.clientHeight >= wrap.scrollHeight - 1;
      let mask;
      if (atTop && atBottom) {
        mask = "none";
      } else if (atTop) {
        mask = `linear-gradient(to bottom, black calc(100% - ${BOT_START}), transparent calc(100% - ${BOT_CLEAR}))`;
      } else if (atBottom) {
        mask = `linear-gradient(to bottom, transparent 0, black ${TOP_FADE})`;
      } else {
        mask = `linear-gradient(to bottom, transparent 0, black ${TOP_FADE}, black calc(100% - ${BOT_START}), transparent calc(100% - ${BOT_CLEAR}))`;
      }
      wrap.style.maskImage = mask;
      wrap.style.webkitMaskImage = mask;
    };
    wrap.addEventListener("scroll", updateCardMask, { passive: true });
    requestAnimationFrame(updateCardMask);

    return wrap;
  }

  // ── Shared chrome: breadcrumb + prev/next ───────────────────────────────────
  function renderChrome(item, idx) {
    const hasPrev = idx > 0;
    const hasNext = idx < allItems.length - 1;

    // Breadcrumb — bottom left. A constellation item reads
    // desk / <constellation title> / <item title>; the slug never prints.
    const isFlatItem = FLAT_URL_SERIES.has(seriesKey);
    let segments;
    if (isConstellation) {
      segments = [
        { label: "desk", onClick: () => navigate({ layer: "desk" }) },
        { label: s.label, onClick: () => navigate({ layer: "browse", series: seriesKey, subcollection: null, view: viewSlug, item: null }) },
        { label: item.title, current: true },
      ];
    } else {
      const subLabel = isFlatItem
        ? (viewSlug || "all")
        : (subKey ? (s.subcollections[subKey]?.label || subKey) : s.label);

      segments = [
        { label: "desk", onClick: () => navigate({ layer: "desk" }) },
        { label: s.label, onClick: () => navigate({ layer: isFlatItem ? "browse" : "series", series: seriesKey, subcollection: null, view: isFlatItem ? (viewSlug || "all") : null, item: null }) }
      ];
      segments.push({ label: subLabel, onClick: () => navigate({ layer: "browse", series: seriesKey, subcollection: subKey, view: viewSlug || "all", item: null }) });
      segments.push({ label: item.title, current: true });
    }

    const bc = makeBreadcrumb(segments);
    content.appendChild(bc);

    // Prev/next nav
    const prevBtn = el("button", "layer-nav layer-nav--prev");
    prevBtn.type = "button";
    prevBtn.textContent = "←";
    prevBtn.setAttribute("aria-label", "Previous item");
    if (!hasPrev) prevBtn.disabled = true;
    prevBtn.addEventListener("click", () => { if (currentIdx > 0) navItem(currentIdx - 1); });
    content.appendChild(prevBtn);

    const nextBtn = el("button", "layer-nav layer-nav--next");
    nextBtn.type = "button";
    nextBtn.textContent = "→";
    nextBtn.setAttribute("aria-label", "Next item");
    if (!hasNext) nextBtn.disabled = true;
    nextBtn.addEventListener("click", () => { if (currentIdx < allItems.length - 1) navItem(currentIdx + 1); });
    content.appendChild(nextBtn);
  }

  function navItem(idx) {
    renderContent(idx);
    replace({ layer: "item", series: seriesKey, subcollection: subKey, item: allItems[idx].id });
  }

  const onKey = (e) => {
    if (layerStack[layerStack.length - 1]?.content !== content) return;
    if (e.key === "Escape") navigate({ layer: "browse", series: seriesKey, subcollection: subKey, view: viewSlug || null, item: null });
    if (e.key === "ArrowLeft"  && currentIdx > 0) navItem(currentIdx - 1);
    if (e.key === "ArrowRight" && currentIdx < allItems.length - 1) navItem(currentIdx + 1);
  };
  document.addEventListener("keydown", onKey);

  // ── Swipe carousel (mobile) ─────────────────────────────────────────────────
  // The card tracks the finger horizontally with its neighbours pre-rendered
  // just off-screen, so the next/previous card is visible as you drag. Release
  // past a threshold completes to that neighbour; otherwise everything snaps
  // back. A drag that begins on the zoom slider — or on a plate image that can
  // still pan in the drag direction — is left to those controls; only once the
  // image is panned to its horizontal extent does the drag become a swipe.
  let dragStartX = 0, dragStartY = 0, dragTarget = null;
  let dragMode = null;               // null | 'v' | 'carousel' | 'yield' | 'native'
  let curWrap = null, prevWrap = null, nextWrap = null;
  let dragDX = 0, vw = 0, animating = false;
  const DRAG_LOCK = 8;               // px before committing to an axis
  const EASE = "transform 0.26s cubic-bezier(0.4, 0, 0.2, 1)";
  const reduceMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Leave the gesture to the plate (pan) rather than swiping? Only when the drag
  // began on the image and it can still pan in the drag direction.
  const yieldToPlate = (dir) => {
    const plate = curWrap && curWrap.__plate;
    if (!plate || !plate.interactive || !dragTarget || !dragTarget.closest) return false;
    if (!dragTarget.closest(".item-card__field")) return false;
    const st = plate.panState();
    if (!st || st.panMaxX <= 0.5) return false;         // nothing to pan → swipe
    return dir === "next" ? st.panX < st.panMaxX - 0.5  // can still pan right
                          : st.panX > 0.5;              // can still pan left
  };

  const placeNeighbor = (w, baseX) => {
    w.style.pointerEvents = "none";
    w.style.transition = "none";
    w.style.transform = `translateX(${baseX}px)`;
    curWrap.after(w); // sit alongside the current card, below the chrome
  };
  const buildNeighbors = () => {
    if (currentIdx > 0) { prevWrap = buildCardWrap(allItems[currentIdx - 1]); placeNeighbor(prevWrap, -vw); }
    if (currentIdx < allItems.length - 1) { nextWrap = buildCardWrap(allItems[currentIdx + 1]); placeNeighbor(nextWrap, vw); }
  };
  const dropNeighbors = () => {
    if (prevWrap) prevWrap.remove();
    if (nextWrap) nextWrap.remove();
    prevWrap = nextWrap = null;
  };

  content.addEventListener("touchstart", (e) => {
    if (animating || e.touches.length !== 1) { dragMode = "native"; return; }
    dragStartX = e.touches[0].clientX;
    dragStartY = e.touches[0].clientY;
    dragTarget = e.target;
    dragMode = null;
    dragDX = 0;
    curWrap = content.querySelector(".item-card-wrap");
    prevWrap = nextWrap = null;
    if (dragTarget && dragTarget.closest && dragTarget.closest(".item-card__zoom-slider")) {
      dragMode = "native"; // let the range input handle its own drag
    }
  }, { passive: true });

  content.addEventListener("touchmove", (e) => {
    if (dragMode === "native" || dragMode === "v" || dragMode === "yield" || !curWrap || e.touches.length !== 1) return;
    const dx = e.touches[0].clientX - dragStartX;
    const dy = e.touches[0].clientY - dragStartY;
    if (dragMode === null) {
      if (Math.abs(dx) < DRAG_LOCK && Math.abs(dy) < DRAG_LOCK) return;
      if (Math.abs(dx) <= Math.abs(dy)) { dragMode = "v"; return; }            // vertical → native scroll
      if (yieldToPlate(dx < 0 ? "next" : "prev")) { dragMode = "yield"; return; }
      dragMode = "carousel";
      vw = window.innerWidth;
      curWrap.style.transition = "none";
      if (curWrap.__setSwipeActive) curWrap.__setSwipeActive(true);            // suppress plate pan
      if (!reduceMotion()) buildNeighbors();
    }
    if (dragMode !== "carousel") return;
    e.preventDefault(); // own the gesture; suppress native scroll
    // Rubber-band resistance when pulling toward a non-existent neighbour.
    const atEnd = (dx < 0 && currentIdx >= allItems.length - 1) ||
                  (dx > 0 && currentIdx <= 0);
    dragDX = atEnd ? dx * 0.3 : dx;
    curWrap.style.transform = `translateX(${dragDX}px)`;
    if (prevWrap) prevWrap.style.transform = `translateX(${dragDX - vw}px)`;
    if (nextWrap) nextWrap.style.transform = `translateX(${dragDX + vw}px)`;
  }, { passive: false });

  const endDrag = () => {
    const mode = dragMode;
    dragMode = null;
    if (mode !== "carousel" || !curWrap) return;
    const cur = curWrap;
    const threshold = Math.min(120, vw * 0.33);
    const goNext = dragDX <= -threshold && currentIdx < allItems.length - 1;
    const goPrev = dragDX >=  threshold && currentIdx > 0;
    const clearCur = () => {
      cur.style.transition = ""; cur.style.transform = "";
      if (cur.__setSwipeActive) cur.__setSwipeActive(false);
    };

    if (!goNext && !goPrev) {
      if (reduceMotion()) { dropNeighbors(); clearCur(); return; }
      // Snap back into place.
      animating = true;
      cur.style.transition = EASE; cur.style.transform = "translateX(0px)";
      if (prevWrap) { prevWrap.style.transition = EASE; prevWrap.style.transform = `translateX(${-vw}px)`; }
      if (nextWrap) { nextWrap.style.transition = EASE; nextWrap.style.transform = `translateX(${vw}px)`; }
      setTimeout(() => { dropNeighbors(); clearCur(); animating = false; }, 280);
      return;
    }

    const newIdx = goNext ? currentIdx + 1 : currentIdx - 1;
    if (reduceMotion()) { dropNeighbors(); navItem(newIdx); return; }

    const incoming = goNext ? nextWrap : prevWrap;
    const other    = goNext ? prevWrap : nextWrap;
    animating = true;
    cur.style.transition = EASE;
    incoming.style.transition = EASE;
    if (other) other.style.transition = EASE;
    cur.style.transform = `translateX(${goNext ? -vw : vw}px)`;
    incoming.style.transform = "translateX(0px)";
    if (other) other.style.transform = `translateX(${goNext ? -2 * vw : 2 * vw}px)`;
    setTimeout(() => {
      // Promote the already-rendered incoming card to be the live one rather than
      // rebuilding it via navItem — a rebuild reloads the plate image and flashes
      // it blank for a frame. Here the incoming card (image already decoded) just
      // becomes current; only the old card, spare neighbour, and chrome are swapped.
      cur.remove();
      if (other) other.remove();
      incoming.style.transition = "";
      incoming.style.transform = "";
      incoming.style.pointerEvents = ""; // restore interactivity (was a neighbour)
      currentIdx = newIdx;
      curWrap = incoming;
      prevWrap = nextWrap = null;
      content.querySelectorAll(".layer-breadcrumb, .layer-nav").forEach(n => n.remove());
      renderChrome(allItems[newIdx], newIdx);
      schedulePrefetch(newIdx); // warm the next step's neighbours after a swipe
      replace({ layer: "item", series: seriesKey, subcollection: subKey, item: allItems[newIdx].id });
      animating = false;
    }, 280);
  };
  content.addEventListener("touchend", endDrag, { passive: true });
  content.addEventListener("touchcancel", endDrag, { passive: true });

  const cleanup = () => {
    document.removeEventListener("keydown", onKey);
    prefetched.clear(); // release retained prefetch images when the sheet closes
  };

  renderContent(currentIdx);

  return { veil, content, cleanup };
}

// ── Keyboard handler ──────────────────────────────────────────────────────────

function attachEscapeHandler(content, onEscape) {
  const handler = (e) => {
    if (e.key !== "Escape") return;
    if (layerStack[layerStack.length - 1]?.content !== content) return;
    onEscape();
  };
  document.addEventListener("keydown", handler);
  return () => document.removeEventListener("keydown", handler);
}

// ── Breadcrumb helper ─────────────────────────────────────────────────────────

function makeBreadcrumb(segments) {
  const nav = el("nav", "layer-breadcrumb");
  nav.setAttribute("aria-label", "Archive location");

  segments.forEach((seg, i) => {
    if (i > 0) {
      const sep = el("span", "layer-breadcrumb__sep");
      sep.textContent = "/";
      sep.setAttribute("aria-hidden", "true");
      nav.appendChild(sep);
    }

    if (seg.current && seg.dropdown?.length) {
      const wrap = el("span", "layer-breadcrumb__seg-wrap");

      const label = el("span", "layer-breadcrumb__seg--current");
      label.textContent = seg.label;
      label.setAttribute("aria-current", "page");
      wrap.appendChild(label);

      const list = el("ul", "layer-breadcrumb__dropdown");
      list.setAttribute("role", "list");
      list.style.setProperty("--total", seg.dropdown.length);
      seg.dropdown.forEach((item, i) => {
        const li = document.createElement("li");
        li.style.setProperty("--i", i);
        const btn = el("button", "");
        btn.type = "button";
        btn.textContent = item.label;
        btn.addEventListener("click", e => {
          e.stopPropagation();
          item.onClick();
        });
        li.appendChild(btn);
        list.appendChild(li);
      });
      wrap.appendChild(list);

      // Desktop: hover open/close
      wrap.addEventListener("mouseenter", () => {
        if (wrap.classList.contains("is-open-instant")) return;
        wrap.classList.remove("is-closing");
        wrap.classList.add("is-open");
      });
      wrap.addEventListener("mouseleave", () => {
        wrap.classList.remove("is-open-instant");
        wrap.classList.add("is-closing");
        const totalMs = (seg.dropdown.length - 1) * 35 + 100;
        setTimeout(() => {
          wrap.classList.remove("is-open", "is-closing");
        }, totalMs);
      });

      // Mobile: tap toggles
      wrap.addEventListener("click", e => {
        if (e.target === wrap || e.target === label) {
          wrap.classList.toggle("is-open");
        }
      });
      // Close on outside tap; self-removes once nav leaves the DOM
      const outsideClose = e => {
        if (!nav.isConnected) { document.removeEventListener("click", outsideClose); return; }
        if (!wrap.contains(e.target)) wrap.classList.remove("is-open");
      };
      document.addEventListener("click", outsideClose);

      nav.appendChild(wrap);
    } else if (seg.current) {
      const span = el("span", "layer-breadcrumb__seg layer-breadcrumb__seg--current");
      span.textContent = seg.label;
      span.setAttribute("aria-current", "page");
      nav.appendChild(span);
    } else {
      const btn = el("button", "layer-breadcrumb__seg");
      btn.type = "button";
      btn.textContent = seg.label;
      btn.addEventListener("click", seg.onClick);
      nav.appendChild(btn);
    }
  });

  return nav;
}

// ── DOM factories ─────────────────────────────────────────────────────────────

function makeVeil(onClickThrough) {
  const veil = el("div", "layer-veil");
  veil.setAttribute("aria-hidden", "true");
  veil.addEventListener("click", onClickThrough);
  return veil;
}

function makeContent() {
  const content = el("div", "layer-content");
  content.setAttribute("role", "dialog");
  content.setAttribute("aria-modal", "true");
  return content;
}

function el(tag, className = "") {
  const e = document.createElement(tag);
  if (className) e.className = className;
  return e;
}

// ── Shared render helpers ─────────────────────────────────────────────────────

function primaryAsset(item) {
  return item.assets?.front || item.assets?.poster || item.assets?.cover || item.assets?.primary
    || item.assets?.gallery?.[0]?.file
    || item.assets?.pages?.[0]?.file            // document inspection
    || item.assets?.states?.[0]?.images?.[0]?.file  // contraption inspection
    || null;
}

export function galleryAssets(item) {
  return item.assets?.gallery ?? [];
}

// Deterministic slight rotation per record id — a print laid down by hand.
// Used by the photos grid for single-photo piles.
function photoTilt(id) {
  let h = 0;
  for (const c of String(id)) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const a = ((h % 100) / 100 - 0.5) * 5; // -2.5 … 2.5 deg
  return Math.abs(a) < 0.8 ? (a < 0 ? -0.8 : 0.8) : a;
}

function groupByYear(items) {
  const map = new Map();
  for (const item of items) {
    const year = item.sort_date ? item.sort_date.slice(0, 4) : "undated";
    if (!map.has(year)) map.set(year, []);
    map.get(year).push(item);
  }
  return Array.from(map.entries())
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([year, items]) => ({ year, items }));
}

// ── Labor item sheet ──────────────────────────────────────────────────────────

function makeLaborItemSheet(seriesKey, itemId, viewSlug) {
  const s = archive.series[seriesKey];
  const allItems = s.items || [];
  let currentIdx = allItems.findIndex(i => i.id === itemId);
  if (currentIdx === -1) currentIdx = 0;

  const veil = makeVeil(() => {
    navigate({ layer: "browse", series: seriesKey, subcollection: null, view: viewSlug || "all", item: null });
  });

  const content = makeContent();
  content.classList.add("labor-item-content");

  const metaEl = el("div", "layer-meta");
  metaEl.setAttribute("aria-label", "Item metadata");

  // Track Three.js scene disposal across renders
  let disposeScene = null;

  function buildMeta(item) {
    metaEl.innerHTML = "";

    const titleEl = el("p", "overlay-title");
    titleEl.textContent = item.title;
    metaEl.appendChild(titleEl);

    const metaFields = [
      ["organization", item.organization],
      ["date",         item.display_date],
    ];

    metaFields.forEach(([label, value]) => {
      if (!value) return;
      const fieldEl = el("div", "overlay-field");
      const labelEl = el("span", "overlay-label");
      labelEl.textContent = label;
      const valueEl = el("span", "overlay-value");
      valueEl.textContent = value;
      fieldEl.appendChild(labelEl);
      fieldEl.appendChild(valueEl);
      metaEl.appendChild(fieldEl);
    });

    const idEl = el("div", "overlay-id");
    idEl.textContent = item.id;
    metaEl.appendChild(idEl);
  }

  function renderContent(idx) {
    currentIdx = idx;
    const item = allItems[idx];
    const hasPrev = idx > 0;
    const hasNext = idx < allItems.length - 1;

    // Dispose previous Three.js scene
    if (disposeScene) { disposeScene(); disposeScene = null; }

    content.innerHTML = "";

    // Breadcrumb
    const bc = makeBreadcrumb([
      { label: "desk",    onClick: () => navigate({ layer: "desk" }) },
      { label: s.label,  onClick: () => navigate({ layer: "browse", series: seriesKey, subcollection: null, view: viewSlug || "all", item: null }) },
      { label: item.title, current: true },
    ]);
    content.appendChild(bc);

    // Horizontal scroll container
    const scroll = el("div", "labor-item");
    scroll.setAttribute("aria-label", `Project: ${item.title}`);

    // ── Panel 1: 3D object ──
    const objectPanel = el("div", "labor-item__panel labor-item__panel--object");
    const canvas = el("canvas", "labor-item__canvas");
    canvas.setAttribute("aria-label", `3D model for ${item.title}`);
    objectPanel.appendChild(canvas);
    scroll.appendChild(objectPanel);

    // ── Panel 2: Thesis ──
    const thesisPanel = el("div", "labor-item__panel labor-item__panel--thesis");
    if (item.thesis) {
      const p = el("p", "labor-item__thesis");
      p.textContent = item.thesis;
      thesisPanel.appendChild(p);
    }
    scroll.appendChild(thesisPanel);

    // ── Panels 3+: Subitems ──
    // captionH must match the CSS height of .labor-item__caption (5.34rem)
    const rem = parseFloat(getComputedStyle(document.documentElement).fontSize);
    const captionH = 5.34 * rem;

    (item.subitems || []).forEach((sub, i) => {
      // Skip only explicitly non-image types; pass through when type is absent
      if (sub.type && sub.type !== "image") return;

      const imgPanel = el("div", "labor-item__panel labor-item__panel--image");
      imgPanel.style.width = "300px"; // placeholder until the aspect ratio is known

      const imgWrap = el("div", "labor-item__image-wrap");
      const img = el("img", "labor-item__image");
      fadeInOnLoad(img);
      img.alt = sub.caption || `${item.title} — image ${i + 1}`;
      img.draggable = false;
      imgWrap.appendChild(img);
      imgPanel.appendChild(imgWrap);

      // Always render caption div — keeps image area height uniform across all panels
      const cap = el("p", "labor-item__caption");
      cap.textContent = sub.caption || "";
      imgPanel.appendChild(cap);

      // Reserve the panel's width from the image's aspect ratio as early as
      // possible. Progressive load paints the small subitem thumbnail first (often
      // cache-warm from the labor grid) and swaps in the full display image once it
      // decodes; sizing off whichever paints first lands the panel at its final
      // width almost immediately, instead of reflowing from 300px when the full
      // image arrives. Both carry the same aspect ratio, so the later display load
      // recomputes to the same width — no second shift.
      const sizePanel = () => {
        if (!img.naturalWidth || !img.naturalHeight) return;
        const imageH = scroll.clientHeight - captionH;
        imgPanel.style.width = `${imageH * (img.naturalWidth / img.naturalHeight)}px`;
        updateScrollMask();
      };
      img.addEventListener("load", sizePanel);
      loadReproProgressive(img, sub.file, sub.thumbnail);

      scroll.appendChild(imgPanel);
    });

    content.appendChild(scroll);

    // Scroll-edge fade mask — updates on scroll to fade whichever edges have overflow
    function updateScrollMask() {
      const atStart = scroll.scrollLeft <= 0;
      const atEnd   = scroll.scrollLeft + scroll.clientWidth >= scroll.scrollWidth - 1;
      let mask;
      if (atStart && !atEnd) {
        mask = "linear-gradient(to right, black calc(100% - 4rem), transparent 100%)";
      } else if (!atStart && !atEnd) {
        mask = "linear-gradient(to right, transparent 0, black 4rem, black calc(100% - 4rem), transparent 100%)";
      } else if (!atStart && atEnd) {
        mask = "linear-gradient(to right, transparent 0, black 4rem, black 100%)";
      } else {
        mask = "none";
      }
      scroll.style.maskImage = mask;
      scroll.style.webkitMaskImage = mask;
    }
    scroll.addEventListener("scroll", updateScrollMask, { passive: true });
    // Run after layout so scrollWidth is accurate
    requestAnimationFrame(updateScrollMask);

    // Prev / next arrows
    const prevBtn = el("button", "layer-nav layer-nav--prev");
    prevBtn.type = "button";
    prevBtn.textContent = "←";
    prevBtn.setAttribute("aria-label", "Previous item");
    if (!hasPrev) prevBtn.disabled = true;
    prevBtn.addEventListener("click", () => { if (currentIdx > 0) navItem(currentIdx - 1); });
    content.appendChild(prevBtn);

    const nextBtn = el("button", "layer-nav layer-nav--next");
    nextBtn.type = "button";
    nextBtn.textContent = "→";
    nextBtn.setAttribute("aria-label", "Next item");
    if (!hasNext) nextBtn.disabled = true;
    nextBtn.addEventListener("click", () => { if (currentIdx < allItems.length - 1) navItem(currentIdx + 1); });
    content.appendChild(nextBtn);

    buildMeta(item);

    // Init Three.js after the canvas is in the DOM
    requestAnimationFrame(() => {
      disposeScene = initLaborModelScene(canvas, item.model ? modelUrl(item.model) : null);
    });
  }

  function navItem(idx) {
    renderContent(idx);
    replace({ layer: "item", series: seriesKey, subcollection: null, item: allItems[idx].id, view: viewSlug || "all" });
  }

  const onKey = (e) => {
    if (layerStack[layerStack.length - 1]?.content !== content) return;
    if (e.key === "Escape") navigate({ layer: "browse", series: seriesKey, subcollection: null, view: viewSlug || "all", item: null });
    if (e.key === "ArrowLeft"  && currentIdx > 0) navItem(currentIdx - 1);
    if (e.key === "ArrowRight" && currentIdx < allItems.length - 1) navItem(currentIdx + 1);
  };
  document.addEventListener("keydown", onKey);

  const cleanup = () => {
    document.removeEventListener("keydown", onKey);
    if (disposeScene) { disposeScene(); disposeScene = null; }
    metaEl.remove();
  };

  renderContent(currentIdx);

  const depth = layerStack.length + 1;
  metaEl.style.zIndex = depth * 10 + 2;
  metaEl.style.transition = "opacity 0.2s var(--ease-base)";
  document.body.appendChild(metaEl);

  return { veil, content, cleanup };
}

// ── Labor Three.js model scene ────────────────────────────────────────────────

function initLaborModelScene(canvas, glbUrl) {
  import("three").then(({ WebGLRenderer, Scene, PerspectiveCamera, AmbientLight,
    DirectionalLight, BoxGeometry, MeshStandardMaterial, Mesh, Color, Box3, Vector3 }) => {
    import("three/examples/jsm/controls/OrbitControls.js").then(({ OrbitControls }) => {

      if (!canvas.isConnected) return; // panel may have been removed before RAF fired

      const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.setSize(canvas.offsetWidth, canvas.offsetHeight);

      const scene = new Scene();

      const camera = new PerspectiveCamera(45, canvas.offsetWidth / canvas.offsetHeight, 0.1, 100);
      camera.position.set(2, 1.5, 3);
      camera.lookAt(0, 0, 0);

      // Lighting
      const ambient = new AmbientLight(0xffffff, 0.7);
      scene.add(ambient);
      const dir = new DirectionalLight(0xffffff, 1.2);
      dir.position.set(3, 6, 4);
      scene.add(dir);

      // Fallback geometry — always load first, replace if GLB loads
      const boxGeo = new BoxGeometry(1, 1, 1);
      const boxMat = new MeshStandardMaterial({ color: 0x999999, roughness: 0.6, metalness: 0.1 });
      const box = new Mesh(boxGeo, boxMat);
      scene.add(box);
      let model = box;

      // OrbitControls — constrained so model can't flip upside down
      const controls = new OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      controls.dampingFactor = 0.08;
      controls.minPolarAngle = 0.1;
      controls.maxPolarAngle = Math.PI * 0.85;
      controls.autoRotate = true;
      controls.autoRotateSpeed = 0.6;
      controls.addEventListener("start", () => { controls.autoRotate = false; });

      // Load GLB if provided
      if (glbUrl) {
        import("three/examples/jsm/loaders/GLTFLoader.js").then(({ GLTFLoader }) => {
          new GLTFLoader().load(
            glbUrl,
            (gltf) => {
              scene.remove(model);
              model = gltf.scene;
              scene.add(model);

              // Auto-fit camera to bounding box so any model scale works
              const bbox = new Box3().setFromObject(model);
              const center = new Vector3();
              bbox.getCenter(center);
              const size = new Vector3();
              bbox.getSize(size);
              const radius = Math.max(size.x, size.y, size.z) * 0.75;

              controls.target.copy(center);
              camera.position.set(
                center.x + radius * 0.9,
                center.y + radius * 0.7,
                center.z + radius * 1.5
              );
              camera.near = radius * 0.01;
              camera.far  = radius * 20;
              camera.updateProjectionMatrix();
              controls.update();
            },
            undefined,
            () => { /* load error — keep fallback box */ }
          );
        });
      }

      let rafId;
      const animate = () => {
        rafId = requestAnimationFrame(animate);
        controls.update();
        renderer.render(scene, camera);
      };
      animate();

      // Resize observer
      const ro = new ResizeObserver(() => {
        const w = canvas.offsetWidth;
        const h = canvas.offsetHeight;
        if (w === 0 || h === 0) return;
        renderer.setSize(w, h);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
      });
      ro.observe(canvas);

      // Disposal function returned to caller
      function dispose() {
        cancelAnimationFrame(rafId);
        ro.disconnect();
        controls.dispose();
        renderer.dispose();
      }
      canvas._laborDispose = dispose;
    });
  });

  // Return a synchronous dispose handle that works even before Three.js resolves
  return () => {
    if (canvas._laborDispose) canvas._laborDispose();
  };
}
