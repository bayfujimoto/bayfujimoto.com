// ── Game box control ─────────────────────────────────────────────────────────
// Rows that sit under a game's cover upload. The cover is bare key art; the
// admin sets it into the box of the platform the game was played on (the
// `platform` field, in the Game group above) with the ESRB rating in the
// case's slot (`esrb`, same group). These rows give the archivist what the
// upload cannot infer:
//
//   box        — read-only: which template the platform resolves to
//   fit        — zoom + x/y nudge of the art inside the window, with a live
//                preview drawn from the art already in hand
//   find cover — SteamGridDB title search (proxied by a Netlify function);
//                picking a result uploads it as the cover
//
// The composite is baked at upload (lib/upload.js, options.box). When
// platform, rating or fit change while a cover exists, the box is re-rendered
// from the master automatically, debounced, so the record never carries a box
// that disagrees with its fields.
//
// makeGameBoxControl({ getValue, setField, subscribe, onArtFile, onRerender }) returns
//   { rows, getBox(), setArt(drawable), setCurrent(stored) }

import { assetFieldRow } from "./field-row.js";
import {
  templateIdFor, TEMPLATES, ESRB_RATINGS, normalizeFit, isDefaultFit, DEFAULT_FIT,
} from "../../shared/game-box.js";

const PREVIEW_HEIGHT = 260;

// /api/steamgriddb is a Netlify function in production and a vite middleware in
// local dev. When neither is serving it, the SPA catch-all answers with
// index.html, and res.json() would fail with "Unexpected token '<'" — which
// tells the archivist nothing. Name the real cause instead.
const ENDPOINT_MISSING =
  "/api/steamgriddb did not answer — check netlify/functions/steamgriddb.js is committed and deployed, " +
  "or restart the dev server locally";

async function apiSearch(url) {
  const res = await fetch(url);
  const text = await res.text();
  let data = null;
  try { data = JSON.parse(text); } catch { /* not JSON — the endpoint is missing */ }
  if (!data) throw new Error(ENDPOINT_MISSING);
  if (!data.ok) throw new Error(data.error || `search failed (${res.status})`);
  return data;
}

async function apiImage(url) {
  const res = await fetch(url);
  const type = res.headers.get("content-type") || "";
  if (res.ok && type.startsWith("image/")) return res.blob();
  if (type.includes("json")) {
    const data = await res.json().catch(() => null);
    throw new Error(data?.error || `image fetch failed (${res.status})`);
  }
  throw new Error(ENDPOINT_MISSING);
}

export function makeGameBoxControl({ getValue, setField, subscribe, onArtFile, onRerender }) {
  let art = null;         // drawable of the current master (img or canvas)
  let current = null;     // stored asset value ("name?v=…") or null
  let fit = normalizeFit(getValue("cover_fit") || DEFAULT_FIT);
  let renderTimer = null;

  const box = () => {
    const template = templateIdFor(getValue("platform"));
    const rating = ESRB_RATINGS.includes(getValue("esrb")) ? getValue("esrb") : "";
    return template ? { template, rating, fit } : null;
  };

  // ── box row (derived) ──
  const boxName = document.createElement("span");
  boxName.className = "gamebox-template";
  const boxRow = assetFieldRow("box", "derived", boxName, {
    sub: true,
    title: "the case the cover is set into — follows the platform field",
  });
  const syncBoxName = () => {
    const b = box();
    boxName.textContent = b ? `${TEMPLATES[b.template].label} case` : "set a platform to choose the case";
    boxName.classList.toggle("is-empty", !b);
  };

  // ── fit row: preview + zoom + nudge ──
  const fitWrap = document.createElement("div");
  fitWrap.className = "gamebox-fit";

  const preview = document.createElement("canvas");
  preview.className = "gamebox-preview";
  preview.height = PREVIEW_HEIGHT;
  preview.width = Math.round(PREVIEW_HEIGHT * 0.66);
  preview.title = "drag to nudge the art; wheel to zoom";
  fitWrap.appendChild(preview);

  const controls = document.createElement("div");
  controls.className = "gamebox-fit__controls";
  const mkNum = (label, key, min, max, step) => {
    const l = document.createElement("label");
    l.className = "gamebox-fit__num";
    l.textContent = label;
    const inp = document.createElement("input");
    inp.type = "number"; inp.className = "asset-num";
    inp.min = String(min); inp.max = String(max); inp.step = String(step);
    inp.value = String(fit[key]);
    inp.addEventListener("change", () => {
      fit = normalizeFit({ ...fit, [key]: parseFloat(inp.value) });
      inp.value = String(fit[key]);
      fitChanged();
    });
    l.appendChild(inp);
    controls.appendChild(l);
    return inp;
  };
  const zoomInp = mkNum("zoom", "zoom", 1, 4, 0.05);
  const xInp = mkNum("x", "x", -1, 1, 0.01);
  const yInp = mkNum("y", "y", -1, 1, 0.01);
  const reset = document.createElement("button");
  reset.type = "button"; reset.className = "gamebox-fit__reset"; reset.textContent = "reset";
  reset.addEventListener("click", () => { fit = { ...DEFAULT_FIT }; syncInputs(); fitChanged(); });
  controls.appendChild(reset);
  fitWrap.appendChild(controls);

  const fitStatus = document.createElement("div");
  fitStatus.className = "asset-upload__status";
  fitWrap.appendChild(fitStatus);

  const fitRow = assetFieldRow("fit", "zoom · x · y", fitWrap, {
    sub: true,
    title: "how the art sits in the window: cover-fill by default; zoom in and nudge to crop",
  });

  const syncInputs = () => {
    zoomInp.value = String(fit.zoom); xInp.value = String(fit.x); yInp.value = String(fit.y);
  };

  // Drag to nudge, wheel to zoom — on the preview itself.
  let drag = null;
  preview.addEventListener("pointerdown", (e) => {
    if (!art) return;
    drag = { x: e.clientX, y: e.clientY, fx: fit.x, fy: fit.y };
    preview.setPointerCapture(e.pointerId);
  });
  preview.addEventListener("pointermove", (e) => {
    if (!drag) return;
    const r = preview.getBoundingClientRect();
    const dx = (e.clientX - drag.x) / r.width;
    const dy = (e.clientY - drag.y) / r.height;
    fit = normalizeFit({ ...fit, x: +(drag.fx + dx).toFixed(3), y: +(drag.fy + dy).toFixed(3) });
    syncInputs();
    drawPreview();
  });
  const endDrag = () => { if (drag) { drag = null; fitChanged(); } };
  preview.addEventListener("pointerup", endDrag);
  preview.addEventListener("pointercancel", endDrag);
  preview.addEventListener("wheel", (e) => {
    if (!art) return;
    e.preventDefault();
    const z = fit.zoom * (e.deltaY < 0 ? 1.05 : 1 / 1.05);
    fit = normalizeFit({ ...fit, zoom: +z.toFixed(3) });
    syncInputs();
    fitChanged();
  }, { passive: false });

  async function drawPreview() {
    const ctx = preview.getContext("2d");
    const b = box();
    if (!b) {
      const t = "no platform";
      ctx.clearRect(0, 0, preview.width, preview.height);
      ctx.font = "12px monospace"; ctx.fillStyle = "#888"; ctx.fillText(t, 8, 20);
      return;
    }
    const tpl = TEMPLATES[b.template];
    preview.width = Math.round(PREVIEW_HEIGHT * tpl.size[0] / tpl.size[1]);
    preview.height = PREVIEW_HEIGHT;
    try {
      const { renderGameBox, loadTemplateImage } = await import("../lib/game-box-render.js");
      if (art) {
        const c = await renderGameBox(art, b, { scale: PREVIEW_HEIGHT / 1800 });
        ctx.clearRect(0, 0, preview.width, preview.height);
        ctx.drawImage(c, 0, 0, preview.width, preview.height);
      } else {
        const t = await loadTemplateImage(b.template);
        ctx.clearRect(0, 0, preview.width, preview.height);
        ctx.fillStyle = "rgba(128,128,128,0.25)";
        ctx.fillRect(0, 0, preview.width, preview.height);
        ctx.drawImage(t, 0, 0, preview.width, preview.height);
      }
    } catch (err) {
      fitStatus.textContent = `Preview: ${err.message}`;
    }
  }

  // Persist the fit to the record (omitting the default) and schedule a
  // re-render of the uploaded box.
  function fitChanged() {
    setField("cover_fit", isDefaultFit(fit) ? undefined : { ...fit });
    drawPreview();
    scheduleRerender();
  }

  function scheduleRerender() {
    clearTimeout(renderTimer);
    if (!current) return;
    const b = box();
    if (!b) return;
    renderTimer = setTimeout(async () => {
      fitStatus.textContent = "Re-rendering box…";
      fitStatus.classList.add("is-busy");
      try {
        await onRerender(b);
        fitStatus.textContent = "Box updated";
      } catch (err) {
        fitStatus.textContent = `Error: ${err.message}`;
      } finally {
        fitStatus.classList.remove("is-busy");
      }
    }, 900);
  }

  // platform / esrb edits elsewhere in the form
  subscribe((fieldId) => {
    if (fieldId === "platform" || fieldId === "esrb") {
      syncBoxName();
      drawPreview();
      scheduleRerender();
    }
  });

  // ── find cover row (SteamGridDB) ──
  const findWrap = document.createElement("div");
  findWrap.className = "gamebox-find";
  const q = document.createElement("input");
  q.type = "search"; q.className = "gamebox-find__q"; q.placeholder = "title…";
  const go = document.createElement("button");
  go.type = "button"; go.className = "gamebox-find__go"; go.textContent = "search";
  const results = document.createElement("div");
  results.className = "gamebox-find__results";
  const findStatus = document.createElement("div");
  findStatus.className = "asset-upload__status";
  const qLine = document.createElement("div");
  qLine.className = "gamebox-find__line";
  qLine.append(q, go);
  findWrap.append(qLine, results, findStatus);
  const findRow = assetFieldRow("find cover", "SteamGridDB", findWrap, {
    sub: true,
    title: "search SteamGridDB for the game's key art (600×900 grids); picking one uploads it as the cover",
  });

  async function search() {
    const term = q.value.trim() || getValue("title") || "";
    if (!term) { findStatus.textContent = "Type a title first."; return; }
    q.value = term;
    findStatus.textContent = "Searching…";
    results.replaceChildren();
    try {
      const data = await apiSearch(`/api/steamgriddb?q=${encodeURIComponent(term)}`);
      if (!data.games.length) { findStatus.textContent = "No matches."; return; }
      findStatus.textContent = `${data.games.length} match${data.games.length === 1 ? "" : "es"} — pick a cover`;
      for (const g of data.games) {
        const row = document.createElement("div");
        row.className = "gamebox-find__game";
        const head = document.createElement("div");
        head.className = "gamebox-find__name";
        const yr = g.release_date ? new Date(g.release_date * 1000).getUTCFullYear() : "";
        head.textContent = yr ? `${g.name} (${yr})` : g.name;
        row.appendChild(head);
        const strip = document.createElement("div");
        strip.className = "gamebox-find__strip";
        for (const grid of g.grids) {
          const b = document.createElement("button");
          b.type = "button"; b.className = "gamebox-find__pick";
          b.title = `${grid.width}×${grid.height} · ${grid.style}${grid.author ? ` · ${grid.author}` : ""}`;
          const im = document.createElement("img");
          im.loading = "lazy"; im.alt = ""; im.src = grid.thumb;
          b.appendChild(im);
          b.addEventListener("click", () => pick(g, grid));
          strip.appendChild(b);
        }
        if (!g.grids.length) {
          const none = document.createElement("span");
          none.className = "gamebox-find__none"; none.textContent = "no 600×900 grids";
          strip.appendChild(none);
        }
        row.appendChild(strip);
        results.appendChild(row);
      }
    } catch (err) {
      findStatus.textContent = `Error: ${err.message}`;
    }
  }

  async function pick(game, grid) {
    findStatus.textContent = "Fetching art…";
    try {
      const blob = await apiImage(`/api/steamgriddb?image=${encodeURIComponent(grid.url)}`);
      const ext = (blob.type.split("/")[1] || "png").replace("jpeg", "jpg");
      const file = new File([blob], `steamgriddb-${grid.id}.${ext}`, { type: blob.type });
      // Prefill what the record lacks — never overwrite what's typed.
      if (!getValue("title")) setField("title", game.name);
      if (!getValue("year") && game.release_date) {
        setField("year", String(new Date(game.release_date * 1000).getUTCFullYear()));
      }
      findStatus.textContent = "";
      await onArtFile(file);
    } catch (err) {
      findStatus.textContent = `Error: ${err.message}`;
    }
  }
  go.addEventListener("click", search);
  q.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); search(); } });

  syncBoxName();
  drawPreview();

  return {
    rows: [boxRow, fitRow, findRow],
    getBox: box,
    getFit: () => ({ ...fit }),
    // The master's pixels, once known (after upload, or fetched back for an
    // existing record) — drives the live preview.
    setArt(drawable) { art = drawable; drawPreview(); },
    setCurrent(stored) { current = stored || null; },
  };
}
