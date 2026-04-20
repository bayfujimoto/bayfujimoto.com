import { navigate, replace } from "./router.js";
import { subscribe, getState } from "./state.js";
import { imageUrl } from "./image-url.js";

let archive = null;
const app = document.getElementById("app");

// Labor and Accumulation use view-based URLs regardless of subcollection data structure
const FLAT_URL_SERIES = new Set(["labor", "accumulation"]);

// Stack of active layer contents, each: { veil, content, cleanup, update }
const layerStack = [];

export async function initPanels() {
  const res = await fetch("/data/archive.json");
  archive = await res.json();

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
      exposed.update(state);
    }
  } else if (depth > current) {
    pushLayerForState(state);
  } else if (depth > 0) {
    const top = layerStack[layerStack.length - 1];
    top.update(state);
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
    case "browse": pushSheet(makeBrowseSheet(state.series, state.subcollection, state.view, state.item)); break;
    case "item":   pushSheet(makeItemSheet(state.series, state.subcollection, state.item, state.view)); break;
  }
}

// ── Sheet stack primitives ────────────────────────────────────────────────────

function pushSheet({ veil, content, cleanup, update }) {
  const depth = layerStack.length + 1;
  const returnFocus = document.activeElement;

  veil.style.setProperty("--depth", depth);
  content.style.setProperty("--depth", depth);

  document.body.appendChild(veil);
  document.body.appendChild(content);

  layerStack.push({ veil, content, cleanup: cleanup || (() => {}), update: update || (() => {}), returnFocus });

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

  const remove = () => {
    top.veil.remove();
    top.content.remove();
    if (top.returnFocus && typeof top.returnFocus.focus === "function") {
      top.returnFocus.focus({ preventScroll: true });
    }
  };
  top.content.addEventListener("transitionend", remove, { once: true });
  setTimeout(remove, 400);
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

  app.querySelectorAll(".desk-object").forEach(btn => {
    const type = btn.dataset.type;
    const key = btn.dataset.key;
    if (type === "series") {
      btn.addEventListener("click", () => {
        navigate({ layer: "series", series: key, subcollection: null, item: null });
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
  subtitle.textContent = s.container;
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

  requestAnimationFrame(() => list.querySelector("button")?.focus());

  return { veil, content, cleanup };
}

// ── Guide sheet ───────────────────────────────────────────────────────────────

function makeGuideSheet() {
  const veil = makeVeil(() => navigate({ layer: "desk" }));
  const content = makeContent();

  const center = el("div", "layer-center");
  center.setAttribute("role", "dialog");
  center.setAttribute("aria-modal", "true");
  center.setAttribute("aria-label", "Archive guide");

  const inner = el("div", "guide-content");
  inner.innerHTML = `
    <p>This is a personal archive — a collection of records, artifacts, documents, and traces that describe a life through material evidence rather than through a simplified personal brand narrative.</p>
    <p>Navigate through the desk objects to explore the archive. Each series contains different types of material:</p>
    <ul>
      <li><strong>Identity:</strong> Biography, CV, and contact information</li>
      <li><strong>Labor:</strong> Work, projects, and professional effort</li>
      <li><strong>Consumption:</strong> Records of films, books, music, coffee, and games</li>
      <li><strong>Creation:</strong> Sketches, photos, prototypes, videos, and notes</li>
      <li><strong>Accumulation:</strong> Collected ephemera and physical artifacts</li>
    </ul>
  `;

  center.appendChild(inner);
  content.appendChild(center);

  // Guide title + subtitle in bottom-right metadata overlay
  const meta = el("div", "layer-meta");
  const h1 = el("h1", "overlay-title");
  h1.textContent = "Guide";
  const subtitle = el("p", "overlay-subtitle");
  subtitle.textContent = "How to navigate this archive";
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

  requestAnimationFrame(() => center.focus());

  return { veil, content, cleanup };
}

// ── Browse sheet ──────────────────────────────────────────────────────────────

function makeBrowseSheet(seriesKey, subKey, viewSlug, openItemId) {
  const s = archive.series[seriesKey];
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

  function renderContent(activeSubKey, activeView) {
    // Clear previous children except veil (veil is not in content)
    content.innerHTML = "";

    let activeSub, years;

    if (isFlatSeries) {
      let items = getFlatItems();
      if (activeView && activeView !== "all") {
        items = items.filter(item => item.context === activeView || item.view === activeView);
      }
      activeSub = { label: activeView || "all", items };
      years = groupByYear(items);
    } else {
      activeSub = s.subcollections[activeSubKey];
      years = groupByYear(activeSub?.items || []);
    }

    // Subcollection switcher (top-center) — only for multi-sub series
    if (subs.length > 1) {
      const subnav = el("div", "layer-subnav");
      subnav.setAttribute("aria-label", "Subcollections");
      subs.forEach(([key, sc], i) => {
        if (i > 0) {
          const sep = el("span", "layer-subnav__sep");
          sep.textContent = "/";
          sep.setAttribute("aria-hidden", "true");
          subnav.appendChild(sep);
        }
        const btn = el("button", `layer-subnav__btn${key === activeSubKey ? " layer-subnav__btn--active" : ""}`);
        btn.type = "button";
        btn.textContent = sc.label;
        btn.addEventListener("click", () => {
          navigate({ layer: "browse", series: seriesKey, subcollection: key, item: null });
        });
        subnav.appendChild(btn);
      });
      content.appendChild(subnav);
    }

    // Horizontal browse strip
    const stripWrap = el("div", "browse-strip-wrap");
    const strip = el("ul", "browse-strip");
    strip.setAttribute("role", "list");
    strip.setAttribute("aria-label", `${activeSub.label} items`);

    years.forEach(({ year, items: yearItems }) => {
      // Year label
      const yearLi = el("li", "browse-strip__year");
      yearLi.setAttribute("aria-hidden", "true");
      yearLi.textContent = year;
      strip.appendChild(yearLi);

      yearItems.forEach(item => {
        const li = el("li", "browse-strip__item");
        li.setAttribute("role", "listitem");
        const btn = el("button", "browse-strip__btn");
        btn.type = "button";
        btn.dataset.itemId = item.id;
        btn.setAttribute("aria-label", item.title);

        const thumbSrc = imageUrl(item.assets?.thumbnail, "thumbnail") || imageUrl(primaryAsset(item), "original");
        if (thumbSrc) {
          const img = el("img", "browse-strip__thumb");
          img.src = thumbSrc;
          img.alt = "";
          img.loading = "lazy";
          btn.appendChild(img);
        } else {
          const txt = el("span", "browse-strip__text");
          txt.textContent = item.title;
          btn.appendChild(txt);
        }

        btn.addEventListener("click", () => {
          navigate({ layer: "item", series: seriesKey, subcollection: activeSubKey, view: activeView, item: item.id });
        });

        li.appendChild(btn);
        strip.appendChild(li);
      });
    });

    stripWrap.appendChild(strip);
    content.appendChild(stripWrap);

    // Breadcrumb
    const segments = [
      { label: "desk", onClick: () => navigate({ layer: "desk" }) }
    ];
    if (!isFlatSeries) {
      segments.push({ label: s.label, onClick: () => navigate({ layer: "series", series: seriesKey }) });
    }
    const subLabel = isFlatSeries ? s.label : (activeSub?.label || activeSubKey);
    segments.push({ label: subLabel, current: true });

    const bc = makeBreadcrumb(segments);
    content.appendChild(bc);

    // Browse sheet title + subtitle in bottom-right metadata overlay
    const meta = el("div", "layer-meta");
    const h1 = el("h1", "overlay-title");
    h1.textContent = isFlatSeries ? s.label : (activeSub?.label || activeSubKey);
    const subtitle = el("p", "overlay-subtitle");
    subtitle.textContent = isFlatSeries ? s.container || "" : activeSub?.container || "";
    meta.appendChild(h1);
    meta.appendChild(subtitle);
    content.appendChild(meta);
  }

  const closeBrowse = () => {
    if (isFlatSeries) {
      navigate({ layer: "desk" });
    } else {
      navigate({ layer: "series", series: seriesKey, subcollection: null, item: null });
    }
  };

  const cleanup = attachEscapeHandler(content, closeBrowse);

  renderContent(subKey, viewSlug);

  function update(state) {
    if (state.subcollection && state.subcollection !== subKey) {
      subKey = state.subcollection;
      renderContent(subKey, viewSlug);
    }
    if (state.view && state.view !== viewSlug) {
      viewSlug = state.view;
      renderContent(subKey, viewSlug);
    }
  }

  return { veil, content, update, cleanup };
}

// ── Item sheet ────────────────────────────────────────────────────────────────

function makeItemSheet(seriesKey, subKey, itemId, viewSlug) {
  const s = archive.series[seriesKey];
  let allItems;

  if (subKey && s.subcollections[subKey]) {
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

  function renderContent(idx) {
    currentIdx = idx;
    const item = allItems[idx];
    const hasPrev = idx > 0;
    const hasNext = idx < allItems.length - 1;

    content.innerHTML = "";

    // Centered image
    const center = el("div", "layer-center");

    const primary = primaryAsset(item);
    let showingFront = true;
    let frontImg = null;
    let backImg = null;
    let zoomScale = 1;

    if (primary) {
      frontImg = el("img", `item-image${item.assets?.back ? " item-image--flippable" : ""}`);
      frontImg.src = imageUrl(primary, "original");
      frontImg.alt = item.title;
      frontImg.draggable = false;

      if (item.assets?.back) {
        frontImg.setAttribute("title", "Click to flip");
        frontImg.addEventListener("click", () => {
          showingFront = !showingFront;
          frontImg.hidden = !showingFront;
          backImg.hidden = showingFront;
        });

        backImg = el("img", "item-image item-image--flippable");
        backImg.src = imageUrl(item.assets.back, "original");
        backImg.alt = `${item.title} (back)`;
        backImg.draggable = false;
        backImg.hidden = true;
        backImg.setAttribute("title", "Click to flip");
        backImg.addEventListener("click", () => {
          showingFront = !showingFront;
          frontImg.hidden = !showingFront;
          backImg.hidden = showingFront;
        });
        center.appendChild(backImg);
      }

      // Scroll to zoom
      function applyZoom(delta) {
        zoomScale = Math.min(4, Math.max(1, zoomScale + delta));
        const style = `scale(${zoomScale})`;
        frontImg.style.transform = style;
        if (backImg) backImg.style.transform = style;
      }

      center.addEventListener("wheel", (e) => {
        e.preventDefault();
        applyZoom(e.deltaY < 0 ? 0.15 : -0.15);
      }, { passive: false });

      // Pinch-to-zoom via pointer events
      let ptrs = new Map();
      let lastDist = null;
      center.addEventListener("pointerdown", (e) => { ptrs.set(e.pointerId, e); });
      center.addEventListener("pointermove", (e) => {
        ptrs.set(e.pointerId, e);
        if (ptrs.size === 2) {
          const [a, b] = [...ptrs.values()];
          const dist = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
          if (lastDist !== null) {
            applyZoom((dist - lastDist) * 0.008);
          }
          lastDist = dist;
        }
      });
      center.addEventListener("pointerup", (e) => {
        ptrs.delete(e.pointerId);
        if (ptrs.size < 2) lastDist = null;
      });
      center.addEventListener("pointercancel", (e) => {
        ptrs.delete(e.pointerId);
        if (ptrs.size < 2) lastDist = null;
      });

      center.appendChild(frontImg);
    }

    content.appendChild(center);

    // Metadata overlay — bottom right
    const meta = el("div", "layer-meta");
    meta.setAttribute("aria-label", "Item metadata");

    const titleEl = el("p", "overlay-title");
    titleEl.textContent = item.title;
    meta.appendChild(titleEl);

    const metaFields = [
      ["date",   item.display_date],
      ["type",   item.item_type],
      ["year",   item.year],
      ["director", item.director],
      ["author", item.author],
      ["artist", item.artist],
      ["rating", item.rating],
      ["place",  item.place],
      ["event",  item.event],
      ["source", item.source],
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
      meta.appendChild(fieldEl);
    });

    if (item.context_note) {
      const note = el("p", "overlay-note");
      note.textContent = item.context_note;
      meta.appendChild(note);
    }

    if (item.related_ids?.length) {
      const relLabel = el("span", "overlay-label");
      relLabel.textContent = "related";
      relLabel.style.marginTop = "0.75rem";
      meta.appendChild(relLabel);
      item.related_ids.forEach(id => {
        const rel = allItems.find(i => i.id === id);
        const relBtn = el("button", "overlay-value");
        relBtn.style.cssText = "background:none;border:none;padding:0;font-family:inherit;cursor:pointer;text-decoration:underline;text-align:right;";
        relBtn.textContent = rel ? rel.title : id;
        relBtn.addEventListener("click", () => {
          const i = allItems.findIndex(it => it.id === id);
          if (i !== -1) navItem(i);
        });
        meta.appendChild(relBtn);
      });
    }

    if (item.tags?.length) {
      const tagLabel = el("span", "overlay-label");
      tagLabel.textContent = "tags";
      tagLabel.style.marginTop = "0.5rem";
      const tagVal = el("span", "overlay-value");
      tagVal.textContent = item.tags.join(" · ");
      meta.appendChild(tagLabel);
      meta.appendChild(tagVal);
    }

    const idEl = el("div", "overlay-id");
    idEl.textContent = item.id;
    meta.appendChild(idEl);

    content.appendChild(meta);

    // Breadcrumb — bottom left
    const isFlatItem = FLAT_URL_SERIES.has(seriesKey);
    const subLabel = isFlatItem
      ? (viewSlug || "all")
      : (subKey ? (s.subcollections[subKey]?.label || subKey) : s.label);

    const segments = [
      { label: "desk", onClick: () => navigate({ layer: "desk" }) },
      { label: s.label, onClick: () => navigate({ layer: isFlatItem ? "browse" : "series", series: seriesKey, subcollection: null, view: isFlatItem ? (viewSlug || "all") : null, item: null }) }
    ];
    segments.push({ label: subLabel, onClick: () => navigate({ layer: "browse", series: seriesKey, subcollection: subKey, view: viewSlug || "all", item: null }) });
    segments.push({ label: item.title, current: true });

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

  const cleanup = () => document.removeEventListener("keydown", onKey);

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

    if (seg.current) {
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
    || item.assets?.gallery?.[0]?.file || null;
}

export function galleryAssets(item) {
  return item.assets?.gallery ?? [];
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
