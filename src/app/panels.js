import { navigate, replace } from "./router.js";
import { subscribe, getState } from "./state.js";
import { imageUrl, modelUrl } from "./image-url.js";
import { setSeriesInfo } from "./scene.js";
import { resolveCreator, resolveSlots, titleIsGiven } from "../shared/field-schema.js";

let archive = null;
const app = document.getElementById("app");

// Load the display (web-size) derivative into an <img>, falling back to the full
// original for items ingested before the display pipeline existed, then to onFail.
// Keeps full originals out of the browser for everything that has a web size.
function loadDisplayWithFallback(img, filename, onFail) {
  let stage = "display";
  img.onerror = () => {
    if (stage === "display") {
      stage = "original";
      img.src = imageUrl(filename, "original");
    } else {
      img.onerror = null;
      if (onFail) onFail();
    }
  };
  img.src = imageUrl(filename, "display");
}

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

  // Same document container as biography / CV: bordered box, scroll, caret.
  const center = el("div", "layer-center");

  const doc = el("div", "bio-document");
  doc.setAttribute("role", "document");
  doc.setAttribute("aria-label", "Archive guide");

  const scroll = el("div", "bio-document__scroll");
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

  center.appendChild(box);
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
    if (seriesKey === "accumulation") grid.classList.add("item-grid--accumulation");
    // Music: albums/EPs are square sleeves; singles render as a vinyl picture
    // disc (round crop). The per-item disc class is applied to single cells below.
    if (activeSubKey === "music") grid.classList.add("item-grid--music");
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
        img.src = bd; img.alt = ""; img.loading = "lazy";
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
            img.src = backdrop;
            img.alt = "";
            img.loading = "lazy";
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
        } else {
          const thumbSrc = imageUrl(item.assets?.thumbnail, "thumbnail") || imageUrl(primaryAsset(item), "display");
          if (thumbSrc) {
            const img = el("img", "item-grid__thumb");
            img.src = thumbSrc;
            img.alt = "";
            img.loading = "lazy";

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

// Standard plate field for the catalog-card inspection, in mm (LP-and-a-bit).
// Items outside [PLATE_SMALL_MM, PLATE_MM] get an integer-related field with
// the relation declared on the card ("reduced 1:3" / "enlarged 5:1").
const PLATE_MM = 325;
const PLATE_SMALL_MM = 50;

// Unique-id sequence for per-render clip paths (the panned reproduction is
// clipped to the field region so it never spills over the scale gutters).
let plateClipSeq = 0;

function parseDimensions(item) {
  if (!item.dimensions) return null;
  const [w, h] = item.dimensions.split("x").map(s => parseFloat(s.trim()));
  return (w > 0 && h > 0) ? { w, h } : null;
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

    content.innerHTML = "";
    renderCard(item);
    renderChrome(item, idx);
  }

  // ── Catalog-card inspection ─────────────────────────────────────────────────
  function renderCard(item) {
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
    const singleRow = (label, value, mono) => {
      if (!value) return; // unrecorded fields are suppressed, never faked
      const row = el("div", "item-card__row");
      row.appendChild(pair(label, value, mono));
      fields.appendChild(row);
    };
    // Two pairs side by side; degrades to a single row if one side is absent.
    const splitRow = (a, b) => {
      const present = [a, b].filter(p => p && p[1]);
      if (present.length === 0) return;
      if (present.length === 1) { singleRow(...present[0]); return; }
      const row = el("div", "item-card__row item-card__row--split");
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

    // Accession — id + type, monospace codes, paired at the top.
    splitRow(["ID", item.id, true], ["type", item.item_type, true]);

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

    // Physical — extent + dimensions (the calibrated plate carries true size).
    // A leading "≈" flags an estimated size (books, sized by format) so the mm
    // plate is not read as a measurement.
    const dimText = dims ? `${item.dimensions_estimated ? "≈ " : ""}${dims.w} × ${dims.h} mm` : null;
    splitRow(["extent", item.extent, true], ["dimensions", dimText, true]);

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

    if (item.related_ids?.length || item.tags?.length) {
      const riders = el("div", "item-card__riders");
      if (item.related_ids?.length) {
        const l = el("span", "overlay-label");
        l.textContent = "see also";
        riders.appendChild(l);
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
      if (item.tags?.length) {
        const l = el("span", "overlay-label");
        l.textContent = "tags";
        l.style.marginTop = "0.5rem";
        const v = el("span", "overlay-value overlay-value--mono");
        v.textContent = item.tags.join(" · ");
        riders.appendChild(l);
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
      loadDisplayWithFallback(reproImg, primary, showNone);
    }

    let plateState = null; // { origin, pxPerMM, spanMM, scaleNote, panX, panY }
    let panX = 0, panY = 0; // current pan offset in field mm
    let dragging = false;   // a single-pointer pan is in progress

    // Redraw the calibrated plate at a given zoom and pan (field span shrinks as
    // zoom grows; pan slides the window across the reproduction). buildPlate
    // re-clamps the pan to the item's extent and returns the applied values, so
    // panX/panY stay honest after a zoom-out collapses the pannable range.
    const renderPlate = (zoom, nextPanX = panX, nextPanY = panY) => {
      field.innerHTML = "";
      const plate = buildPlate(item, dims, PLATE_PX, reproImg, zoom, nextPanX, nextPanY);
      panX = plate.panX; panY = plate.panY;
      plateState = plate;
      scaleNote.textContent = plate.scaleNote;
      field.appendChild(plate.svg);
    };

    if (primary && dims) {
      renderPlate(1);

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
      if (back) {
        const flip = el("button", "item-card__flip");
        flip.type = "button";
        flip.textContent = "overturn";
        flip.setAttribute("aria-label", "Overturn: show the other side");
        flip.addEventListener("click", () => {
          showingBack = !showingBack;
          if (reproImg) loadDisplayWithFallback(reproImg, showingBack ? back : primary, showNone);
          assetLabel.textContent = showingBack ? "verso" : "recto";
        });
        controls.appendChild(flip);
      }
      assetLabel.textContent = back ? "recto" : "1/1";
      controls.appendChild(assetLabel);
      foot.appendChild(controls);

      // Zoom slider — only meaningful when there is a calibrated field to
      // rescale. Dragging shrinks the field span and enlarges the item.
      if (dims) {
        const zoomWrap = el("label", "item-card__zoom-wrap");
        const zoomLabel = el("span", "item-card__asset-label");
        zoomLabel.textContent = "zoom";
        const zoom = el("input", "item-card__zoom-slider");
        zoom.type = "range";
        zoom.min = "1"; zoom.max = "6"; zoom.step = "0.05"; zoom.value = "1";
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
          } else if (panStart && plateState) {
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
    content.appendChild(wrap);
  }

  // ── Shared chrome: breadcrumb + prev/next ───────────────────────────────────
  function renderChrome(item, idx) {
    const hasPrev = idx > 0;
    const hasNext = idx < allItems.length - 1;

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
    // captionH must match the CSS height of .labor-item__caption (5.34rem)
    const rem = parseFloat(getComputedStyle(document.documentElement).fontSize);
    const captionH = 5.34 * rem;

    (item.subitems || []).forEach((sub, i) => {
      // Skip only explicitly non-image types; pass through when type is absent
      if (sub.type && sub.type !== "image") return;

      const imgPanel = el("div", "labor-item__panel labor-item__panel--image");
      imgPanel.style.width = "300px"; // placeholder until natural dimensions load

      const imgWrap = el("div", "labor-item__image-wrap");
      const img = el("img", "labor-item__image");
      loadDisplayWithFallback(img, sub.file);
      img.alt = sub.caption || `${item.title} — image ${i + 1}`;
      img.draggable = false;
      imgWrap.appendChild(img);
      imgPanel.appendChild(imgWrap);

      // Always render caption div — keeps image area height uniform across all panels
      const cap = el("p", "labor-item__caption");
      cap.textContent = sub.caption || "";
      imgPanel.appendChild(cap);

      // Set panel width from aspect ratio once image dimensions are known
      img.addEventListener("load", () => {
        const imageH = scroll.clientHeight - captionH;
        const panelW = imageH * (img.naturalWidth / img.naturalHeight);
        imgPanel.style.width = `${panelW}px`;
        updateScrollMask();
      });

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
