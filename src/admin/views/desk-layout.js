// ── Desk layout editor ───────────────────────────────────────────────────────
// The Record-pane view behind the [~] Desk node in the Explorer (and :desk).
// The desk itself is held in an iframe at /?edit=desk — the real scene, at a
// wide (1440 × 900) or a phone (390 × 844) viewport, scaled to the pane — and
// driven over postMessage (the other end is in src/app/desk-scene.js): every
// slider move sends the whole layout and the desk re-places itself; a click
// on the desk picks what was clicked. Save serializes the layout to
// src/content/desk-layout.json and stages it for commit (:w), like the guide;
// in local dev it is also written straight to disk so the file is live.
//
// What can be moved: each bundle (position, turn, place in the pile), each
// sheet within a bundle (position, turn, place in its stack), the three
// objects and every clip (position, turn) — per regime — and, for the
// accumulation bundle, WHICH records lie on it (added from the archive's scans
// with known dimensions, removed).

import { getState, setState } from "../state.js";
import { setRecordActions, makePaneAction } from "../shell.js";

const LAYOUT_PATH = "src/content/desk-layout.json";
const VIEWPORTS = { wide: { w: 1440, h: 900 }, vertical: { w: 390, h: 844 } };
const clone = (o) => JSON.parse(JSON.stringify(o));
const esc = (t) => String(t ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const OBJECT_LABELS = { guide: "key (guide)", amber: "amber", stamp: "stamp" };

export function renderDeskLayout(container, callbacks = {}) {
  const { onClose } = callbacks;
  container.innerHTML = "";
  const breadcrumb = document.getElementById("admin-topbar-breadcrumb");
  if (breadcrumb) breadcrumb.innerHTML = `<span>desk layout</span>`;

  const root = document.createElement("div");
  root.className = "admin-desk";
  root.innerHTML = `
    <div class="admin-desk-toolbar">
      <div class="admin-desk-regimes" role="group" aria-label="Layout">
        <button type="button" class="admin-desk-regime is-active" data-regime="wide">desktop</button>
        <button type="button" class="admin-desk-regime" data-regime="vertical">mobile</button>
      </div>
      <span class="admin-desk-status" id="desk-status">loading the desk…</span>
      <button type="button" class="admin-btn admin-btn-secondary admin-desk-reload" title="Reload the desk (drops unsaved moves)">reload</button>
    </div>
    <div class="admin-desk-stage"><div class="admin-desk-frame"><iframe title="The desk" src="/?edit=desk" loading="eager"></iframe></div></div>
    <div class="admin-desk-body">
      <div class="admin-desk-list" role="listbox" aria-label="Things on the desk"></div>
      <div class="admin-desk-inspector"></div>
    </div>
  `;
  container.appendChild(root);
  const $ = (sel) => root.querySelector(sel);
  const statusEl = $("#desk-status"), stage = $(".admin-desk-stage"), frameWrap = $(".admin-desk-frame"), iframe = $("iframe"), listEl = $(".admin-desk-list"), insp = $(".admin-desk-inspector");

  // ── State ──
  let regime = "wide";
  let layout = null;        // the working copy: what the desk is showing
  let saved = null;         // JSON of the last saved (or loaded) layout, for the dirty flag
  let desk = null;          // the last state message from the desk
  let sel = null;           // { kind, bundle, key, id, i }
  let ready = false;
  const setStatus = (t, kind) => { statusEl.textContent = t; statusEl.dataset.kind = kind || ""; };

  // ── The iframe: a real viewport, scaled to fit ──
  function fitFrame() {
    const vp = VIEWPORTS[regime];
    const availW = stage.clientWidth - 2, availH = regime === "wide" ? Math.min(560, Math.round(availW * vp.h / vp.w)) : 560;
    const k = Math.min(availW / vp.w, availH / vp.h);
    iframe.style.width = `${vp.w}px`; iframe.style.height = `${vp.h}px`;
    iframe.style.transform = `scale(${k})`;
    frameWrap.style.width = `${Math.round(vp.w * k)}px`; frameWrap.style.height = `${Math.round(vp.h * k)}px`;
  }
  const ro = new ResizeObserver(fitFrame); ro.observe(stage);
  const post = (msg) => { try { iframe.contentWindow?.postMessage(msg, window.location.origin); } catch (e) { /* not yet */ } };
  let sendQueued = false;
  const send = (reply = false) => {
    if (!layout || sendQueued) return; sendQueued = true;
    requestAnimationFrame(() => { sendQueued = false; post({ type: "desk-layout:set", layout, reply }); markDirty(); });
  };
  const markDirty = () => { const dirty = JSON.stringify(layout) !== saved; setStatus(dirty ? "moved — not saved" : (ready ? `${regime === "wide" ? "desktop" : "mobile"} layout` : "loading the desk…"), dirty ? "dirty" : ""); };

  function onMessage(ev) {
    if (ev.origin !== window.location.origin || ev.source !== iframe.contentWindow || !ev.data) return;
    const m = ev.data;
    if (m.type === "desk-layout:state") {
      desk = m; ready = true;
      if (!layout) {
        // the desk's own reading of the file, or a staged edit if one is pending
        const staged = (getState().pendingChanges || []).find((c) => c.filePath === LAYOUT_PATH);
        layout = staged ? safeParse(staged.content, m.layout) : clone(m.layout);
        if (staged) post({ type: "desk-layout:set", layout, reply: true });
      }
      const first = saved === null;
      if (m.regime !== regime) { regime = m.regime; root.querySelectorAll(".admin-desk-regime").forEach((b) => b.classList.toggle("is-active", b.dataset.regime === regime)); }
      fillRegime();
      if (first) saved = JSON.stringify(layout);   // what the desk shows on opening is the baseline, filled in
      renderList(); renderInspector(); markDirty();
    } else if (m.type === "desk-layout:pick") {
      sel = m.sel ? (m.sel.kind === "object" ? { kind: "object", id: m.sel.id } : { kind: "doc", bundle: m.sel.bundle, key: m.sel.key }) : null;
      renderList(); renderInspector();
    }
  }
  window.addEventListener("message", onMessage);
  iframe.addEventListener("load", () => { layout = layout || null; post({ type: "desk-layout:hello" }); });

  // The desk reports every sheet's effective place; write it into the working
  // layout for this regime so the file says where everything is, not only
  // what was moved (a code default that later changes will not shift a sheet
  // that has been saved).
  function fillRegime() {
    const L = (layout[regime] = layout[regime] || {});
    L.bundles = L.bundles || {}; L.objects = L.objects || {}; L.docs = L.docs || {}; L.order = L.order || {}; L.clips = L.clips || {};
    L.zorder = desk.zorder.slice();
    for (const b of desk.bundles) {
      L.bundles[b.id] = { x: b.x, y: b.y, rot: b.rot || 0 };
      L.docs[b.id] = L.docs[b.id] || {};
      for (const d of b.docs) if (!L.docs[b.id][d.key]) L.docs[b.id][d.key] = { x: d.x, y: d.y, rot: d.rot || 0 };
      if (!L.order[b.id]) L.order[b.id] = b.docs.map((d) => d.key);
      if (b.clips.length && !L.clips[b.id]) L.clips[b.id] = b.clips.map((c) => ({ x: c.x, y: c.y, r: c.r || 0 }));
    }
    for (const o of desk.objects) L.objects[o.id] = { x: o.x, y: o.y, ry: o.ry };
    if (!Array.isArray(layout.accumulation)) layout.accumulation = desk.accumulation.map((id) => ({ id }));
  }

  // ── Regime toggle ──
  root.querySelectorAll(".admin-desk-regime").forEach((btn) => btn.addEventListener("click", () => {
    if (btn.dataset.regime === regime) return;
    regime = btn.dataset.regime;
    root.querySelectorAll(".admin-desk-regime").forEach((b) => b.classList.toggle("is-active", b === btn));
    sel = null; fitFrame();   // the desk's resize handler switches its regime and posts its state
    setStatus("switching…");
  }));
  $(".admin-desk-reload").addEventListener("click", () => { ready = false; sel = null; setStatus("loading the desk…"); iframe.src = iframe.src; });

  // ── The list: bundles with their sheets and clips, then the objects ──
  function renderList() {
    if (!desk) return;
    const L = layout[regime];
    const isSel = (s) => sel && sel.kind === s.kind && sel.bundle === s.bundle && sel.key === s.key && sel.id === s.id && sel.i === s.i;
    const row = (s, label, depth, extra = "") => `<div class="admin-desk-row${isSel(s) ? " is-selected" : ""}" role="option" aria-selected="${isSel(s)}" tabindex="0" data-sel='${esc(JSON.stringify(s))}' style="--depth:${depth}"><span class="admin-desk-row-label">${esc(label)}</span><span class="admin-desk-row-extra">${extra}</span></div>`;
    let html = `<div class="admin-desk-group">bundles · top of pile first</div>`;
    const byId = new Map(desk.bundles.map((b) => [b.id, b]));
    for (const id of L.zorder.slice().reverse()) {
      const b = byId.get(id); if (!b) continue;
      html += row({ kind: "bundle", bundle: id }, b.title || id, 0, `${b.docs.length} sheets`);
      const order = (L.order[id] || b.docs.map((d) => d.key)).slice().reverse();
      for (const k of order) { const d = b.docs.find((x) => x.key === k); if (d) html += row({ kind: "doc", bundle: id, key: k }, d.label, 1, d.sub ? `→ ${esc(d.sub)}` : ""); }
      b.clips.forEach((c) => { html += row({ kind: "clip", bundle: id, i: c.i }, `${c.kind} clip`, 1, ""); });
    }
    html += `<div class="admin-desk-group">objects</div>`;
    for (const o of desk.objects) html += row({ kind: "object", id: o.id }, OBJECT_LABELS[o.id] || o.id, 0, "");
    listEl.innerHTML = html;
    listEl.querySelectorAll(".admin-desk-row").forEach((r) => {
      const choose = () => { sel = JSON.parse(r.dataset.sel); post({ type: "desk-layout:select", sel: sel.kind === "clip" ? null : sel }); renderList(); renderInspector(); };
      r.addEventListener("click", choose);
      r.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); choose(); } });
    });
  }

  // ── The inspector: sliders for the selection ──
  function renderInspector() {
    insp.innerHTML = "";
    if (!desk) return;
    const L = layout[regime];
    if (!sel) { insp.innerHTML = `<p class="admin-desk-hint">Click something on the desk, or in the list, to move it. Positions are stage px; turns are degrees.</p>` + accumulationPanel(); wireAccumulation(); return; }
    const head = document.createElement("div"); head.className = "admin-desk-insp-head";
    const body = document.createElement("div"); body.className = "admin-desk-insp-body";
    insp.append(head, body);
    const st = desk.stage;
    if (sel.kind === "bundle") {
      const b = desk.bundles.find((x) => x.id === sel.bundle); const v = L.bundles[sel.bundle];
      head.innerHTML = `<span class="admin-desk-insp-title">${esc(b?.title || sel.bundle)}</span><span class="admin-desk-insp-sub">bundle · ${b?.box[0]} × ${b?.box[1]} px, from the folder's corner</span>`;
      body.append(slider("x", v, "x", -200, desk.folder.w + 100, 1), slider("y", v, "y", -200, desk.folder.h + 100, 1), slider("turn", v, "rot", -45, 45, 0.5, "°"));
      body.append(orderRow("place in the pile", L.zorder, sel.bundle, (arr) => { L.zorder = arr; }, "under", "over"));
    } else if (sel.kind === "doc") {
      const b = desk.bundles.find((x) => x.id === sel.bundle); const d = b?.docs.find((x) => x.key === sel.key); if (!d) { sel = null; return renderInspector(); }
      const v = (L.docs[sel.bundle][sel.key] = L.docs[sel.bundle][sel.key] || { x: d.x, y: d.y, rot: d.rot || 0 });
      head.innerHTML = `<span class="admin-desk-insp-title">${esc(d.label)}</span><span class="admin-desk-insp-sub">${esc(b.title)} · ${d.w} × ${d.h} px${d.id ? ` · ${esc(d.id)}` : ""}${d.sub ? ` · opens ${esc(d.sub)}` : ""}</span>`;
      body.append(slider("x", v, "x", -200, (b.box[0] || 300) + 200, 1), slider("y", v, "y", -200, (b.box[1] || 300) + 200, 1), slider("turn", v, "rot", -180, 180, 0.5, "°"));
      const order = (L.order[sel.bundle] = L.order[sel.bundle] || b.docs.map((x) => x.key));
      body.append(orderRow("place in the stack", order, sel.key, (arr) => { L.order[sel.bundle] = arr; }, "under", "over"));
      if (sel.bundle === "accumulation" && d.id) { const rm = document.createElement("button"); rm.type = "button"; rm.className = "admin-btn admin-btn-secondary admin-desk-remove"; rm.textContent = "remove from the desk"; rm.addEventListener("click", () => removeAccumulation(d.id)); body.appendChild(rm); }
    } else if (sel.kind === "clip") {
      const b = desk.bundles.find((x) => x.id === sel.bundle); const c = b?.clips[sel.i]; if (!c) { sel = null; return renderInspector(); }
      const arr = (L.clips[sel.bundle] = L.clips[sel.bundle] || b.clips.map((x) => ({ x: x.x, y: x.y, r: x.r || 0 })));
      const v = arr[sel.i];
      head.innerHTML = `<span class="admin-desk-insp-title">${esc(c.kind)} clip</span><span class="admin-desk-insp-sub">on ${esc(b.title)}</span>`;
      body.append(slider("x", v, "x", -100, (b.box[0] || 300) + 100, 1), slider("y", v, "y", -100, (b.box[1] || 300) + 100, 1), slider("turn", v, "r", -180, 180, 1, "°"));
    } else if (sel.kind === "object") {
      const v = L.objects[sel.id];
      head.innerHTML = `<span class="admin-desk-insp-title">${esc(OBJECT_LABELS[sel.id] || sel.id)}</span><span class="admin-desk-insp-sub">object · stage ${st.w} × ${st.h} px</span>`;
      body.append(slider("x", v, "x", 0, st.w, 1), slider("y", v, "y", 0, st.h, 1), slider("turn", v, "ry", -180, 180, 1, "°"));
    }
    if (sel.bundle === "accumulation") { insp.insertAdjacentHTML("beforeend", accumulationPanel()); wireAccumulation(); }
  }

  // A labelled range with its number beside it; both write the same field.
  function slider(label, obj, field, min, max, step, unit = "") {
    const row = document.createElement("label"); row.className = "admin-desk-slider";
    const cur = Number(obj[field]) || 0;
    const lo = Math.min(min, Math.floor(cur)), hi = Math.max(max, Math.ceil(cur));
    row.innerHTML = `<span class="admin-desk-slider-label">${esc(label)}</span><input type="range" min="${lo}" max="${hi}" step="${step}" value="${cur}"><input type="number" min="${lo}" max="${hi}" step="${step}" value="${cur}" aria-label="${esc(label)} value"><span class="admin-desk-slider-unit">${unit}</span>`;
    const range = row.querySelector('[type="range"]'), num = row.querySelector('[type="number"]');
    const apply = (val, from) => { const n = Number(val); if (!Number.isFinite(n)) return; obj[field] = step >= 1 ? Math.round(n) : Math.round(n * 2) / 2; if (from !== range) range.value = String(obj[field]); if (from !== num) num.value = String(obj[field]); send(); };
    range.addEventListener("input", () => apply(range.value, range));
    num.addEventListener("input", () => apply(num.value, num));
    row.addEventListener("keydown", (e) => { if (e.target === num && (e.key === "ArrowUp" || e.key === "ArrowDown")) { /* native */ } });
    return row;
  }
  // [under] [over] for a key in an order array (first = lowest).
  function orderRow(label, arr, key, commit, downLabel, upLabel) {
    const row = document.createElement("div"); row.className = "admin-desk-order";
    const i = arr.indexOf(key);
    row.innerHTML = `<span class="admin-desk-slider-label">${esc(label)}</span><button type="button" class="admin-btn admin-btn-secondary" ${i <= 0 ? "disabled" : ""}>${downLabel}</button><span class="admin-desk-order-pos">${i + 1} / ${arr.length}</span><button type="button" class="admin-btn admin-btn-secondary" ${i >= arr.length - 1 || i < 0 ? "disabled" : ""}>${upLabel}</button>`;
    const [down, up] = row.querySelectorAll("button");
    const move = (dir) => { const a = arr.slice(); const j = a.indexOf(key); const k = j + dir; if (j < 0 || k < 0 || k >= a.length) return; [a[j], a[k]] = [a[k], a[j]]; commit(a); send(); renderList(); renderInspector(); };
    down.addEventListener("click", () => move(-1)); up.addEventListener("click", () => move(1));
    return row;
  }

  // ── Accumulation: which records lie on the bundle ──
  function accumulationPanel() {
    const ids = layout.accumulation.map((e) => (typeof e === "string" ? e : e.id));
    const cand = desk.candidates || [];
    const byId = new Map(cand.map((c) => [c.id, c]));
    const rows = ids.map((id) => { const c = byId.get(id); return `<li class="admin-desk-acc-row"><span class="admin-desk-acc-id">${esc(id)}</span><span class="admin-desk-acc-title">${esc(c ? `${c.title} · ${c.w} × ${c.h} mm${c.cutout ? " · cut out" : ""}` : "not in the archive")}</span><button type="button" class="admin-desk-acc-btn" data-remove="${esc(id)}" aria-label="Remove ${esc(id)}">remove</button></li>`; }).join("");
    const options = cand.filter((c) => !ids.includes(c.id)).map((c) => `<option value="${esc(c.id)}">${esc(c.id)} — ${esc(c.title)} (${c.w} × ${c.h} mm${c.cutout ? ", cut out" : ""})</option>`).join("");
    return `<div class="admin-desk-acc"><div class="admin-desk-group">accumulation · records on the bundle</div><ul class="admin-desk-acc-list">${rows || `<li class="admin-desk-hint">nothing on it</li>`}</ul><div class="admin-desk-acc-add"><select aria-label="Record to add"><option value="">add a record…</option>${options}</select><button type="button" class="admin-btn admin-btn-secondary" disabled>add</button></div><p class="admin-desk-hint">Only scans with a front image and known dimensions can lie on the desk. A new sheet lands near the bundle's corner; move it from the list.</p></div>`;
  }
  function wireAccumulation() {
    const box = insp.querySelector(".admin-desk-acc"); if (!box) return;
    box.querySelectorAll("[data-remove]").forEach((b) => b.addEventListener("click", () => removeAccumulation(b.dataset.remove)));
    const select = box.querySelector("select"), add = box.querySelector(".admin-desk-acc-add button");
    select.addEventListener("change", () => { add.disabled = !select.value; });
    add.addEventListener("click", () => { if (!select.value) return; addAccumulation(select.value); });
  }
  function addAccumulation(id) {
    layout.accumulation = [...layout.accumulation.filter((e) => (typeof e === "string" ? e : e.id) !== id), { id }];
    for (const r of Object.keys(VIEWPORTS)) { const L = layout[r]; if (!L) continue; L.docs = L.docs || {}; L.docs.accumulation = L.docs.accumulation || {}; const n = layout.accumulation.length - 1; L.docs.accumulation[id] = L.docs.accumulation[id] || { x: 20 + (n % 3) * 60, y: 30 + Math.floor(n / 3) * 120, rot: 0 }; if (Array.isArray(L.order?.accumulation) && !L.order.accumulation.includes(id)) L.order.accumulation.push(id); }
    sel = { kind: "doc", bundle: "accumulation", key: id };
    post({ type: "desk-layout:set", layout, reply: true }); markDirty();
  }
  function removeAccumulation(id) {
    layout.accumulation = layout.accumulation.filter((e) => (typeof e === "string" ? e : e.id) !== id);
    for (const r of Object.keys(VIEWPORTS)) { const L = layout[r]; if (!L) continue; if (L.docs?.accumulation) delete L.docs.accumulation[id]; if (Array.isArray(L.order?.accumulation)) L.order.accumulation = L.order.accumulation.filter((k) => k !== id); }
    if (sel && sel.kind === "doc" && sel.key === id) sel = { kind: "bundle", bundle: "accumulation" };
    post({ type: "desk-layout:set", layout, reply: true }); markDirty();
  }

  // ── Save ──
  async function save() {
    if (!layout) return;
    const out = clone(layout);
    delete out._note;
    out._note = "The desk's composition, per regime (wide ≥ 600px, vertical < 600px). Stage px; turns in degrees. Edited in the admin's Desk layout view; read by src/app/desk-docs.js. `accumulation` lists the records on that bundle.";
    const content = JSON.stringify(out, null, 2) + "\n";
    const next = (getState().pendingChanges || []).filter((c) => c.filePath !== LAYOUT_PATH);
    next.push({ id: "desk-layout", filePath: LAYOUT_PATH, content, action: "edit" });
    setState({ pendingChanges: next });
    saved = JSON.stringify(layout);
    let note = "Saved — staged for commit. Run :w to commit.";
    if (import.meta.env.DEV) {
      try {
        const r = await fetch("/api/save-desk-layout", { method: "POST", headers: { "Content-Type": "application/json" }, body: content });
        const j = await r.json();
        note = j.ok ? "Saved to src/content/desk-layout.json and staged for commit (:w)." : `Staged for commit; local write failed: ${j.error}`;
      } catch (e) { note = `Staged for commit; local write failed: ${e.message}`; }
    }
    setStatus(note, "saved");
  }

  setRecordActions([
    makePaneAction({ label: "save", title: "Write the layout file and stage it for commit (then :w)", onClick: save }),
    makePaneAction({ label: "cancel", title: "Close (:q)", onClick: () => { teardown(); if (onClose) onClose(); } }),
  ]);
  function teardown() { window.removeEventListener("message", onMessage); ro.disconnect(); }
  // the pane's body is replaced wholesale by the next view; drop the listener then
  const mo = new MutationObserver(() => { if (!document.body.contains(root)) { teardown(); mo.disconnect(); } });
  mo.observe(container, { childList: true });
  fitFrame();
}

function safeParse(text, fallback) { try { return JSON.parse(text); } catch (e) { return clone(fallback); } }
