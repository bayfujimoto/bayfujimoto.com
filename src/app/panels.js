import { navigate, replace } from "./router.js";
import { subscribe, getState } from "./state.js";
import { imageUrl, modelUrl } from "./image-url.js";
import { setSeriesInfo } from "./scene.js";

let archive = null;
const app = document.getElementById("app");

// Labor and Accumulation use view-based URLs regardless of subcollection data structure
const FLAT_URL_SERIES = new Set(["labor", "accumulation"]);

// Stack of active layer contents, each: { veil, content, cleanup, update }
const layerStack = [];

export async function initPanels() {
  const res = await fetch("/data/archive.json");
  archive = await res.json();

  const info = {};
  Object.entries(archive.series).forEach(([key, s]) => {
    info[key] = { label: s.label, container: s.container };
  });
  if (archive.guide) info.guide = { label: archive.guide.label, container: archive.guide.container };
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
    btn.textContent = label;
    btn.addEventListener("click", () => {
      menu.remove();
      if (type === "guide") navigate({ layer: "guide" });
      else navigate({ layer: "series", series: key, subcollection: null, item: null });
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
    const isCurrent = idx === 0;

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

    // Version indicator
    const versionWrap = el("div", "bio-document__version-wrap");

    const versionBtn = el("button", "bio-document__version");
    versionBtn.type = "button";
    if (!isCurrent) {
      const pastBadge = el("span", "bio-document__version-past");
      pastBadge.textContent = "past version";
      versionBtn.textContent = bio.display_date + " ";
      versionBtn.appendChild(pastBadge);
    } else {
      versionBtn.textContent = bio.display_date;
    }
    versionWrap.appendChild(versionBtn);

    // Version history dropdown (only if multiple versions exist)
    if (allVersions.length > 1) {
      versionBtn.setAttribute("aria-haspopup", "listbox");
      versionBtn.setAttribute("aria-expanded", "false");
      versionBtn.classList.add("bio-document__version--interactive");

      const vList = el("ul", "bio-document__version-list");
      vList.setAttribute("role", "listbox");
      vList.setAttribute("aria-label", "Version history");
      vList.style.setProperty("--total", allVersions.length);

      const otherVersions = allVersions.map((v, i) => ({ v, i })).filter(({ i }) => i !== idx);
      vList.style.setProperty("--total", otherVersions.length);
      otherVersions.forEach(({ v, i }, j) => {
        const li = document.createElement("li");
        li.style.setProperty("--i", j);
        const btn = el("button", "bio-document__version-option");
        btn.type = "button";
        btn.setAttribute("role", "option");
        btn.setAttribute("aria-selected", "false");
        btn.textContent = i === 0 ? `${v.display_date} — current` : v.display_date;
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          closeVersionList();
          renderDocument(i);
        });
        li.appendChild(btn);
        vList.appendChild(li);
      });

      // Hoist to body so it escapes overflow:hidden on .bio-document__box
      document.body.appendChild(vList);
      hoistedVersionList = vList;

      const positionVersionList = () => {
        const r = versionBtn.getBoundingClientRect();
        vList.style.position = "fixed";
        vList.style.left = r.left + "px";
        vList.style.top = (r.top - vList.offsetHeight + 8) + "px";
      };

      let closeTimer = null;

      const closeVersionList = () => {
        closeTimer = setTimeout(() => {
          if (!vList.classList.contains("is-open")) return;
          vList.classList.remove("is-open");
          vList.classList.add("is-closing");
          versionBtn.setAttribute("aria-expanded", "false");
          const totalMs = (otherVersions.length - 1) * 35 + 100;
          setTimeout(() => vList.classList.remove("is-closing"), totalMs);
        }, 80);
      };

      const openVersionList = () => {
        clearTimeout(closeTimer);
        positionVersionList();
        vList.classList.remove("is-closing");
        vList.classList.add("is-open");
        versionBtn.setAttribute("aria-expanded", "true");
      };

      versionWrap.addEventListener("mouseenter", openVersionList);
      versionWrap.addEventListener("mouseleave", closeVersionList);
      vList.addEventListener("mouseenter", openVersionList);
      vList.addEventListener("mouseleave", closeVersionList);

      // Tap toggle for touch devices
      versionBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        if (versionWrap.classList.contains("is-open")) {
          closeVersionList();
        } else {
          openVersionList();
        }
      });

      activeOutsideClickHandler = (e) => {
        if (!versionWrap.contains(e.target)) closeVersionList();
      };
      document.addEventListener("click", activeOutsideClickHandler);
    }

    doc.appendChild(versionWrap);

    // Divider — outside scroll region so it stays fixed while content scrolls
    const divider = el("hr", "bio-document__divider");
    doc.appendChild(divider);

    // Scrollable prose region (keeps overflow away from the version dropdown)
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
  let hoistedMeta = null; // tracks the .layer-meta element after pushSheet hoists it to document.body

  function renderContent(activeSubKey, activeView) {
    const dropdownWasOpen = content.querySelector(".layer-breadcrumb__seg-wrap.is-open, .layer-breadcrumb__seg-wrap.is-open-instant") != null;
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

    // Item grid — column-major, horizontally scrolling, grouped by year
    const GRID_ROWS = 3;
    const gridWrap = el("div", "item-grid-wrap");
    const grid = el("div", "item-grid");
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
      cells.style.gridTemplateRows = `repeat(${GRID_ROWS}, var(--item-grid-cell-height, 160px))`;

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

        const thumbSrc = imageUrl(item.assets?.thumbnail, "thumbnail") || imageUrl(primaryAsset(item), "original");
        if (thumbSrc) {
          const img = el("img", "item-grid__thumb");
          img.src = thumbSrc;
          img.alt = "";
          img.loading = "lazy";

          if (item.dimensions && maxDim > 0) {
            const [wMm, hMm] = item.dimensions.split("x").map(s => parseFloat(s.trim()));
            if (wMm && hMm) {
              // Scale relative to the largest item: largest fills ~90% of cell, others shrink proportionally
              const scale = Math.max(wMm, hMm) / maxDim * 0.9;
              img.style.width = `${Math.round(scale * 100)}%`;
              img.style.height = `${Math.round(scale * 100)}%`;
            }
          }

          btn.appendChild(img);
        } else {
          const txt = el("span", "item-grid__text");
          txt.textContent = item.title;
          btn.appendChild(txt);
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

    gridWrap.appendChild(grid);
    content.appendChild(gridWrap);

    const updateGridAlignment = () => {
      grid.classList.toggle("item-grid--centered", grid.scrollWidth <= gridWrap.clientWidth);
    };
    updateGridAlignment();
    const gridRO = new ResizeObserver(updateGridAlignment);
    gridRO.observe(gridWrap);
    new MutationObserver((_, mo) => {
      if (!document.contains(gridWrap)) { gridRO.disconnect(); mo.disconnect(); }
    }).observe(document.body, { childList: true, subtree: true });

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
    const subtitleText = isFlatSeries ? s.container || "" : activeSub?.container || "";
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

  function onHoist(el) { hoistedMeta = el; }

  return { veil, content, update, cleanup, onHoist };
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

  let maxDim = 0;
  for (const item of allItems) {
    if (item.dimensions) {
      const [wMm, hMm] = item.dimensions.split("x").map(s => parseFloat(s.trim()));
      if (wMm && hMm) maxDim = Math.max(maxDim, wMm, hMm);
    }
  }

  function applyRelativeSize(img, item) {
    if (maxDim > 0 && item.dimensions) {
      const [wMm, hMm] = item.dimensions.split("x").map(s => parseFloat(s.trim()));
      if (wMm && hMm) {
        const scale = Math.max(wMm, hMm) / maxDim;
        img.style.maxWidth  = `${Math.round(scale * 70)}vw`;
        img.style.maxHeight = `${Math.round(scale * 70)}vh`;
        return;
      }
    }
    img.style.maxWidth  = "35vw";
    img.style.maxHeight = "35vh";
  }

  const veil = makeVeil(() => {
    navigate({ layer: "browse", series: seriesKey, subcollection: subKey, view: viewSlug || null, item: null });
  });

  const content = makeContent();

  const metaEl = el("div", "layer-meta");
  metaEl.setAttribute("aria-label", "Item metadata");

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
      applyRelativeSize(frontImg, item);

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
        applyRelativeSize(backImg, item);
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

    // Metadata overlay — bottom right (persistent element, populated in place)
    metaEl.innerHTML = "";

    const titleEl = el("p", "overlay-title");
    titleEl.textContent = item.title;
    metaEl.appendChild(titleEl);

    const metaFields = [
      ["date",   item.display_date],
      ["type",   item.item_type],
      ["year",   item.year],
      ["director", item.director],
      ["author", item.author],
      ["artist", item.artist],
      ["rating", item.rating],
      ["place",      item.place],
      ["event",      item.event],
      ["source",     item.source],
      ["dimensions", item.dimensions ? `${item.dimensions} mm` : null],
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

    if (item.context_note) {
      const note = el("p", "overlay-note");
      note.textContent = item.context_note;
      metaEl.appendChild(note);
    }

    if (item.related_ids?.length) {
      const relLabel = el("span", "overlay-label");
      relLabel.textContent = "related";
      relLabel.style.marginTop = "0.75rem";
      metaEl.appendChild(relLabel);
      item.related_ids.forEach(id => {
        const rel = allItems.find(i => i.id === id);
        const relBtn = el("button", "overlay-value");
        relBtn.style.cssText = "background:none;border:none;padding:0;font-family:inherit;cursor:pointer;text-decoration:underline;text-align:right;";
        relBtn.textContent = rel ? rel.title : id;
        relBtn.addEventListener("click", () => {
          const i = allItems.findIndex(it => it.id === id);
          if (i !== -1) navItem(i);
        });
        metaEl.appendChild(relBtn);
      });
    }

    if (item.tags?.length) {
      const tagLabel = el("span", "overlay-label");
      tagLabel.textContent = "tags";
      tagLabel.style.marginTop = "0.5rem";
      const tagVal = el("span", "overlay-value");
      tagVal.textContent = item.tags.join(" · ");
      metaEl.appendChild(tagLabel);
      metaEl.appendChild(tagVal);
    }

    const idEl = el("div", "overlay-id");
    idEl.textContent = item.id;
    metaEl.appendChild(idEl);

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

  const cleanup = () => {
    document.removeEventListener("keydown", onKey);
    metaEl.remove();
  };

  renderContent(currentIdx);

  const depth = layerStack.length + 1;
  metaEl.style.zIndex = depth * 10 + 2;
  metaEl.style.transition = "opacity 0.2s var(--ease-base)";
  document.body.appendChild(metaEl);

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
    (item.subitems || []).forEach((sub, i) => {
      if (sub.type !== "image") return;

      const vw = (sub.width_vw != null && sub.width_vw >= 10) ? sub.width_vw : 60;

      const imgPanel = el("div", "labor-item__panel labor-item__panel--image");
      imgPanel.style.width = `${vw}vw`;

      const imgWrap = el("div", "labor-item__image-wrap");
      const img = el("img", "labor-item__image");
      img.src = imageUrl(sub.file, "original");
      img.alt = sub.caption || `${item.title} — image ${i + 1}`;
      img.draggable = false;
      imgWrap.appendChild(img);
      imgPanel.appendChild(imgWrap);

      if (sub.caption) {
        const cap = el("p", "labor-item__caption");
        cap.textContent = sub.caption;
        imgPanel.appendChild(cap);
      }

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
