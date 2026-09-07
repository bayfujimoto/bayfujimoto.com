// ── The papers desk — /home-alt ──────────────────────────────────────────────
// A temporary landing page beside the live desk: the five series as bundles of
// documents clipped together inside one open folder, with the key, an amber
// block and the stamp as the only things that are not paper. The folder and
// the papers are a DOM layer over the WebGL desk; the wood and the three
// objects are the scene. Ported from mockups/desk-papers/ (rev 3); the plan of
// record is docs/desk-papers-plan.md.
//
// Two compositions: wide (the reference collage's landscape folder) and
// vertical (a portrait folder for phones, the same papers re-piled). Papers
// keep their size relative to the objects in both: the objects are scaled
// with the stage, so the key is the key beside a business card everywhere.
//
// The interaction: clicking a bundle lifts its documents toward the camera;
// they arrange left to right (top to bottom on a phone), one per
// subcollection, and a click on one opens its browse. The fan IS the series
// layer — it is pushed through panels.js at `/identity/` like the sheet it
// replaces, so Back, Escape, the veil and the breadcrumb all work as they do
// everywhere else. A flat series (labor, accumulation) has nothing to choose
// between: its bundle rises a beat and the grid opens.

import * as THREE from "three";
import { navigate } from "./router.js";
import { subscribe, getState } from "./state.js";
import { dismissLoadingScreen } from "./loading.js";
import { DESK_OBJECTS, MODEL_BASE, WEB_BASE } from "../shared/desk-objects.js";
import { createModelLoader } from "./model-look.js";
import { isSceneRenderPaused } from "./scene.js";
import { configureAltDesk } from "./panels.js";
import { imageUrl } from "./image-url.js";
import "../styles/desk-alt.css";

// ── Geometry ─────────────────────────────────────────────────────────────────
// Design units. The reference collage's folder is 445 × 315 px; everything is
// transcribed from it at ×1.8, so the folder is 800 × 567 on a 1200 × 780 stage.
const K = 1.8;
const S = (v) => Math.round(v * K);

// The two compositions. Bundle boxes are folder-relative stage px; the box is
// the button's footprint and the papers are placed inside it (below).
const REGIMES = {
  wide: {
    stage: { w: 1200, h: 780 },
    folder: { x: 200, y: 90, w: S(445), h: S(315), tab: { x: S(80), w: S(95) } },
    bundles: { identity: [S(8), S(10)], consumption: [S(78), S(-8)], creation: [S(80), S(108)], labor: [S(232), S(36)], accumulation: [S(308), S(-2)] },
    zorder: ["identity", "labor", "consumption", "creation", "accumulation"],
    objects: { guide: { x: 110, y: 700 }, amber: { x: 1110, y: 650 }, stamp: { x: 200 + S(196), y: 90 + S(315) + 64 } },
  },
  vertical: {
    stage: { w: 600, h: 1240 },
    folder: { x: 40, y: 30, w: 520, h: 1060, tab: { x: 60, w: 150 } },
    bundles: { identity: [20, 20], consumption: [200, 10], accumulation: [215, 300], creation: [20, 580], labor: [300, 610] },
    zorder: ["identity", "consumption", "accumulation", "creation", "labor"],
    objects: { guide: { x: 130, y: 1185 }, amber: { x: 500, y: 1175 }, stamp: { x: 300, y: 1160 } },
  },
};
const regimeName = () => (window.innerWidth < 600 ? "vertical" : "wide");

// ── A seeded PRNG so the tears are the same tears on every visit ────────────
function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
function tear(edge, seed, n = 14, amp = 3.5) {
  const r = rng(seed); const pts = [];
  if (edge === "bottom") { pts.push([0, 0], [100, 0]); for (let i = 0; i <= n; i++) pts.push([100 - i * 100 / n, 100 - r() * amp]); }
  if (edge === "top")    { for (let i = 0; i <= n; i++) pts.push([i * 100 / n, r() * amp]); pts.push([100, 100], [0, 100]); }
  if (edge === "right")  { pts.push([0, 0], [100 - r() * amp, 0]); for (let i = 1; i <= n; i++) pts.push([100 - r() * amp, i * 100 / n]); pts.push([0, 100]); }
  return `clip-path:polygon(${pts.map(([x, y]) => `${x.toFixed(1)}% ${y.toFixed(1)}%`).join(",")})`;
}

// ── Markup helpers (reference px in, stage px out) ──────────────────────────
const esc = (t) => String(t ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
// A document sheet. `sub` names the subcollection it opens in the fan; sheets
// without one are dressing and stay on the desk when the bundle lifts.
function sheet(cls, [x, y, w, h], content, { sub = null, torn = null, seed = 1, r = 0 } = {}) {
  let style = `left:${S(x)}px;top:${S(y)}px;width:${S(w)}px;height:${S(h)}px${r ? `;transform:rotate(${r}deg)` : ""}`;
  if (torn) style += ";" + tear(torn, seed, torn === "right" ? 6 : 14, torn === "right" ? 8 : 3.5);
  return `<div class="da-sheet ${cls}"${sub ? ` data-sub="${sub}"` : ""} style="${style}">${content}</div>`;
}
function scan(src, [x, y, w], r = 0, extra = "", sub = null) {
  if (!src) return "";
  const t = extra || `transform:rotate(${r}deg)`;
  return `<img class="da-scan" src="${esc(src)}"${sub ? ` data-sub="${sub}"` : ""} style="left:${S(x)}px;top:${S(y)}px;width:${S(w)}px;${t}" alt="" loading="lazy">`;
}
function tape(x, y, w = 34, h = 11, r = -3) {
  return `<div class="da-tape" style="left:${S(x)}px;top:${S(y)}px;width:${S(w)}px;height:${S(h)}px;transform:rotate(${r}deg)"></div>`;
}
function stampCircle(x, y, d, text, date, r = -14) {
  const id = "da-tp-" + Math.abs([...text].reduce((a, c) => a * 31 + c.charCodeAt(0), 7) % 9999);
  return `<svg class="da-rstamp" style="left:${S(x)}px;top:${S(y)}px;width:${S(d)}px;height:${S(d)}px;transform:rotate(${r}deg)" viewBox="0 0 100 100" aria-hidden="true">
    <g filter="url(#da-ink)" fill="none" stroke="var(--ink-green)"><circle cx="50" cy="50" r="46" stroke-width="2.2"/><circle cx="50" cy="50" r="33" stroke-width="1.4"/><path id="${id}" d="M50 50 m-40 0 a40 40 0 1 1 80 0 a40 40 0 1 1 -80 0"/></g>
    <text filter="url(#da-ink)" fill="var(--ink-green)" font-family="ui-monospace, monospace" font-size="9.5" letter-spacing="1.5"><textPath href="#${id}" startOffset="2%">${esc(text)}</textPath></text>
    <text filter="url(#da-ink)" fill="var(--ink-green)" x="50" y="54" text-anchor="middle" font-family="ui-monospace, monospace" font-size="10" font-weight="700">${esc(date)}</text></svg>`;
}
const CLIPS = {
  bulldog: (x, y, r, w = 56, h = 46) => `<svg class="da-clip" style="left:${x}px;top:${y}px;width:${w}px;height:${h}px;transform:rotate(${r}deg)" viewBox="0 0 48 40" aria-hidden="true"><rect x="10" y="10" width="28" height="16" fill="#1c1a17"/><path d="M12 10 L16 2 M36 10 L32 2" stroke="#1c1a17" stroke-width="2" fill="none"/><path d="M6 12 C2 14, 2 22, 8 24 M42 12 C46 14, 46 22, 40 24" stroke="#8a8478" stroke-width="2.5" fill="none"/></svg>`,
  paperclip: (x, y, r) => `<svg class="da-clip" style="left:${x}px;top:${y}px;width:22px;height:52px;transform:rotate(${r}deg)" viewBox="0 0 22 52" aria-hidden="true"><path d="M6 44 V10 a5 5 0 0 1 10 0 V40 a3 3 0 0 1 -6 0 V14" stroke="#b9b2a4" stroke-width="2" fill="none" stroke-linecap="round"/></svg>`,
  pin: (x, y, r) => `<svg class="da-clip" style="left:${x}px;top:${y}px;width:44px;height:14px;transform:rotate(${r}deg)" viewBox="0 0 44 14" aria-hidden="true"><path d="M4 7 H40 M40 7 a3 3 0 1 1 -3 -3" stroke="#b9b2a4" stroke-width="2" fill="none" stroke-linecap="round"/><path d="M4 7 a3 3 0 1 0 0 -0.1" stroke="#b9b2a4" stroke-width="2" fill="none"/></svg>`,
};

// ── Documents, typeset from the archive where the record is at hand ─────────
// Each bundle is a series; its box is the button's footprint (folder-relative
// reference px). Sheet boxes are written as the reference's folder-relative
// coordinates minus the bundle's origin, so they can be read against the
// mockup. In a bundle with subcollections every subcollection has a document
// (data-sub); the ones the composition does not show in full peek from under
// the others, as a pile would have them.
function byDateDesc(items) { return [...(items || [])].sort((a, b) => String(b.sort_date || "").localeCompare(String(a.sort_date || ""))); }
function year(d) { return String(d || "").slice(0, 4); }
const thisYear = year(new Date().toISOString());

function buildBundles(archive) {
  const series = archive.series;
  const sub = (s, k) => series[s]?.subcollections?.[k]?.items || [];
  const labelOf = (k) => series[k]?.label || k;

  // Identity
  const cv = byDateDesc(sub("identity", "cv"));
  const cvLines = cv.slice(0, 4).map((e) => `${year(e.date_start || e.sort_date)}${e.date_end ? "" : "—"}  ${String(e.organization || e.title || "").toLowerCase()}`).join("\n") || "—";
  const years = [...new Set(cv.map((e) => year(e.date_start || e.sort_date)).filter(Boolean))].sort();
  const timetable = (years.length ? years : ["2001", "2010", "2019", "2024", "2026"]).slice(-5).join(" · ");
  const contact = sub("identity", "contact")[0] || {};
  const cardName = contact.name || "B. Fujimoto";
  const cardLine = contact.role_line || "architect · austin";

  // Consumption
  const films = byDateDesc(sub("consumption", "films"));
  const books = byDateDesc(sub("consumption", "books"));
  const music = byDateDesc(sub("consumption", "music"));
  const coffee = byDateDesc(sub("consumption", "coffee"));
  const games = byDateDesc(sub("consumption", "games"));
  const titles = (arr, n) => arr.slice(0, n).map((i) => String(i.title || "").toLowerCase());
  const logText = [titles(films, 2).join(" — "), titles(books, 2).join(", "), [...titles(music, 1), year(films[0]?.sort_date)].filter(Boolean).join(" · ")].filter(Boolean).join("\n");
  const still = films.find((f) => f.assets?.backdrop)?.assets?.backdrop || "";
  const receiptLines = (arr, n, price) => arr.slice(0, n).map((i) => { const t = String(i.title || "").toLowerCase().slice(0, 16); return `1  ${t.padEnd(16)} ${price(i)}`; }).join("\n");
  const bookReceipt = receiptLines(books, 3, () => "12.00") || "1  —";
  const coffeeReceipt = receiptLines(coffee, 3, () => " 4.50") || "1  coffee            4.50";
  const record = music[0] ? `${String(music[0].title || "").toLowerCase()}` : "side a · side b";
  const game = games[0] ? String(games[0].title || "").toLowerCase() : "slot 1";

  // Accumulation — the reference's column is real ephemera; so is ours.
  const acc = series.accumulation?.items || [];
  const front = (id) => { const it = acc.find((i) => i.id === id) || null; return it?.assets?.front ? imageUrl(it.assets.front, "display") : null; };
  const withFront = byDateDesc(acc).filter((i) => i.assets?.front);
  const pick = (id, i) => front(id) || (withFront.length ? imageUrl(withFront[i % withFront.length].assets.front, "display") : null);
  const scans = { map: pick("EPH-2026-029", 0), receipt: pick("EPH-2026-013", 1), brochure: pick("EPH-2026-010", 2), small: pick("EPH-2026-006", 3), ticket: pick("EPH-2026-018", 4), postcard: pick("EPH-2026-017", 5), bill: pick("EPH-2026-014", 6) };

  return [
    { id: "identity", title: labelOf("identity"), sub: "cv · timetable · card", box: [90, 300], html: [
      sheet("da-sheet--white da-sheet--rough", [7 - 8, 45 - 10, 72, 245], `
        <div class="da-head da-head--serif">Curriculum vitae</div>
        <div class="da-mono" style="top:28px">${esc(cvLines)}</div>
        <div class="da-rules da-rules--dense" style="top:78px;opacity:.28"></div>
        <div class="da-note" style="left:8px;top:150px;transform:rotate(-6deg);font-size:15px">update → ${esc(thisYear)}</div>
        <div class="da-postage" style="left:12px;top:340px;transform:rotate(4deg)"><div class="da-postage__in"></div></div>
        ${stampCircle(8, 183, 64, "LOW DESIGN OFFICE · RECEIVED ·", "SEP 06 2026", -18)}`, { sub: "cv" }),
      sheet("da-sheet--rough", [7 - 8, 8 - 10, 82, 16], `<div class="da-note" style="left:8px;top:5px;font-size:11px;letter-spacing:.08em">${esc(timetable)}</div>${tape(2, -3, 16, 9, -8)}${tape(70, -2, 16, 9, 6)}`, { sub: "biography" }),
      sheet("da-sheet--white", [18 - 8, 258 - 10, 64, 36], `<div class="da-head da-head--serif" style="top:6px;font-style:normal">${esc(cardName)}</div><div class="da-mono" style="top:20px">${esc(cardLine)}</div><div class="da-stain" style="left:-10px;top:-14px;width:46px;height:40px;opacity:.5"></div>`, { sub: "contact" }),
      sheet("", [12 - 8, 292 - 10, 100, 11], `<div class="da-rules" style="opacity:.3"></div>`, { torn: "top", seed: 3 }),
      CLIPS.bulldog(S(-30 - 8), S(58 - 10), -90),
    ].join("") },

    { id: "consumption", title: labelOf("consumption"), sub: "log · receipts · sleeve · card", box: [170, 160], html: [
      // peeking from under the log — books, music, coffee, games
      sheet("da-sheet--thermal", [85 - 78 + 128, 0 + 8 + 30, 62, 120], `<div class="da-mono" style="top:8px;left:6px">books\n—\n${esc(bookReceipt)}\n—</div>`, { sub: "books", r: 3 }),
      sheet("da-sheet--white", [85 - 78 + 100, 0 + 8 + 96, 72, 72], `<div class="da-head" style="top:6px;left:6px">record</div><div class="da-note" style="left:8px;top:30px;font-size:13px;white-space:normal;line-height:1.05">${esc(record)}</div><div class="da-disc"></div>`, { sub: "music", r: -2 }),
      sheet("da-sheet--thermal", [85 - 78 - 14, 0 + 8 + 70, 56, 100], `<div class="da-mono" style="top:8px;left:6px">café\n—\n${esc(coffeeReceipt)}\n—\nthank you</div><div class="da-stain da-stain--ring" style="left:-20px;top:50px;width:70px;height:60px;opacity:.6"></div>`, { sub: "coffee", r: -4 }),
      sheet("", [85 - 78 + 20, 0 + 8 + 118, 70, 44], `<div class="da-head" style="top:6px">save · ${esc(game)}</div><div class="da-mono" style="top:22px;opacity:.5">slot 1  ▸ 03:12:44\nslot 2  — empty</div>`, { sub: "games", r: 2 }),
      sheet("da-sheet--white da-sheet--rough", [85 - 78, 0 + 8, 155, 140], `
        <div class="da-head" style="top:8px;left:44px">log · films books records</div><div class="da-big">Log</div>
        <div class="da-rules" style="top:64px;opacity:.3"></div>
        <div class="da-hand" style="top:120px;left:70px;font-size:9.5px;line-height:17px">${esc(logText)}</div>
        <div class="da-stain da-stain--ring" style="left:190px;top:170px;width:70px;height:62px"></div>
        <div class="da-note" style="left:8px;top:200px;font-size:16px;color:var(--ink-pencil)">again in sept.</div>`, { sub: "films" }),
      scan(scans.ticket, [104 - 78, -8 + 8, 80], -1),
      `<div class="da-photo" style="left:200px;top:96px;width:40px;height:40px;transform:rotate(-1deg)"><div class="da-photo__img"${still ? ` style="background-image:url('${esc(still)}')"` : ""}></div>${tape(-8, -5, 20, 7, -30)}</div>`,
      CLIPS.paperclip(S(222 - 78), S(12 + 8), 0),
    ].join("") },

    { id: "creation", title: labelOf("creation"), sub: "sketch · note · print · pattern · strip", box: [170, 190], html: [
      // peeking — note (top left, under), pattern and film strip (bottom, under)
      sheet("da-sheet--rough", [85 - 80 - 10, 110 - 108 - 12, 90, 70], `<div class="da-hand" style="top:8px;left:8px;right:6px;font-size:8px;line-height:14px">a note — kept for the sentence in it, not the page.</div>`, { sub: "notes", r: -3 }),
      sheet("", [85 - 80 + 60, 110 - 108 + 150, 70, 50], `<div class="da-pattern"></div><div class="da-head" style="top:4px;left:6px">pattern · fold on dashed</div>`, { sub: "prototypes", r: 4 }),
      sheet("da-sheet--dark", [85 - 80 + 118, 110 - 108 + 40, 22, 150], `<div class="da-strip"></div>`, { sub: "videos", r: 1 }),
      sheet("da-sheet--rough", [85 - 80, 110 - 108, 155, 180], `
        <div class="da-hand" style="top:14px;left:14px;right:12px;font-size:11px;line-height:19px">the surface remembers what the record forgets — a crease, a thumbprint, the place where the pen ran dry. keep the sheet. the note is only its excuse.</div>
        <svg class="da-sketch" viewBox="0 0 279 324" aria-hidden="true"><g filter="url(#da-pencil)" fill="none" stroke="#3a3128" stroke-width="1" opacity="0.7">
        <path d="M40 275 L40 175 L140 140 L140 240 Z"/><path d="M140 140 L225 165 L225 265 L140 240"/><path d="M40 175 L78 152 L78 250 M78 152 L170 118" stroke-dasharray="3 3"/>
        <path d="M180 210 c-10 -40 20 -60 30 -30 c 10 -30 40 -10 22 20 c 30 5 20 40 -8 32 c 5 30 -35 30 -30 5 c -30 10 -40 -25 -14 -27" stroke-width=".9"/>
        <path d="M60 300 C100 288, 170 310, 250 292"/></g></svg>
        <div class="da-seal" style="left:212px;top:268px;transform:rotate(-4deg)"></div>
        <div class="da-mono" style="left:12px;top:296px;opacity:.45">untitled · graphite · ${esc(thisYear)}</div>${tape(-4, -4, 30, 10, -40)}`, { sub: "sketches" }),
      `<div class="da-photo" data-sub="photos" style="left:${S(85 - 80 + 8)}px;top:${S(110 - 108 + 118)}px;width:${S(52)}px;height:${S(40)}px;transform:rotate(-5deg)"><div class="da-photo__img"></div>${tape(14, -5, 24, 8, 8)}</div>`,
      sheet("da-sheet--thermal", [180 - 80, 275 - 108, 38, 15], `<div class="da-note" style="top:-2px;left:6px;font-size:15px">print ↑</div>`, { torn: "right", seed: 5 }),
    ].join("") },

    { id: "labor", title: labelOf("labor"), sub: "drawing · specification · transmittal", box: [140, 262], html: [
      sheet("da-sheet--white", [240 - 232, 40 - 36, 85, 65], `<div class="da-head">specification · 09 21 00</div><div class="da-mono" style="top:20px;line-height:8px;opacity:.5">2.1  gypsum board assemblies\n2.2  metal framing, 20 ga\n2.3  acoustic insulation\n3.1  install per mfr. instr.</div><div class="da-rules da-rules--dense" style="top:64px;opacity:.25"></div><div class="da-rstamp-box">ISSUED</div>`, { torn: "bottom", seed: 11 }),
      sheet("da-sheet--diazo da-sheet--rough", [235 - 232, 85 - 36, 110, 200], `<div class="da-diazo-lines"></div><div class="da-fold da-fold--h" style="top:50%"></div><div class="da-fold da-fold--v" style="left:50%"></div>
        <svg class="da-sketch" viewBox="0 0 198 360" aria-hidden="true"><g filter="url(#da-pencil)" fill="none" stroke="rgba(205,220,240,.85)" stroke-width="1">
        <rect x="30" y="30" width="136" height="120"/><path d="M30 90 H166 M96 30 V150 M60 30 V90 M132 90 V150"/><path d="M40 40 h20 M40 44 h14" stroke-width=".6"/>
        <path d="M30 200 H166 M30 200 L30 300 L166 300 L166 200"/><path d="M30 300 L98 250 L166 300"/><path d="M60 260 v40 M120 260 v40 M60 260 h20 v20 h-20 z M110 260 h20 v20 h-20 z" stroke-width=".7"/>
        <path d="M20 330 H178" stroke-dasharray="6 3" stroke-width=".6"/></g></svg>
        <div class="da-title-block" style="width:44%;height:14%"><b>${esc(labelOf("labor"))}</b>a-101 · plan · record</div>
        <div class="da-note" style="left:14px;top:300px;color:rgba(255,255,255,.7);font-size:15px;transform:rotate(-2deg)">rev 2 — see transmittal</div>
        <div class="da-wear-corner"></div>${tape(96, -3, 18, 8, 4)}`),
      sheet("da-sheet--thermal da-sheet--rough", [280 - 232, 225 - 36, 85, 65], `<div class="da-head">transmittal</div><div class="da-mono" style="top:20px;line-height:8px">1  a-101   plan\n2  a-201   elevations\n3  a-501   details\n—  issued for record</div><div class="da-hand" style="left:70px;top:58px;font-size:13px;transform:rotate(-8deg)">bf</div>`),
    ].join("") },

    { id: "accumulation", title: labelOf("accumulation"), sub: "map · receipt · brochure · ticket · postcard · bill", box: [165, 300], html: [
      scan(scans.map,      [318 - 308, 20 + 2, 104], 0.5),
      scan(scans.receipt,  [312 - 308, -4 + 2, 100], -1),
      scan(scans.brochure, [322 - 308, 62 + 2, 92], 0.6),
      scan(scans.small,    [326 - 308, 200 + 2, 44], -1),
      scan(scans.ticket,   [372 - 308, 158 + 2, 118], 90, "transform-origin:0 0;transform:rotate(90deg) translate(0,-100%)"),
      scan(scans.postcard, [435 - 308, 175 + 2, 38], 1),
      scan(scans.bill,     [392 - 308, 258 + 2, 56], -1),
      CLIPS.bulldog(S(312 - 308), S(305 + 2), 0, 36, 30),
      CLIPS.paperclip(S(318 - 308), S(300 + 2), 0),
      CLIPS.pin(S(395 - 308), S(2 + 2), -20),
    ].join("") },
  ];
}

// ── The DOM layer ────────────────────────────────────────────────────────────
const FILTERS = `<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs>
  <filter id="da-rough" x="-5%" y="-5%" width="110%" height="110%"><feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves="2" seed="4" result="n"/><feDisplacementMap in="SourceGraphic" in2="n" scale="3.5" xChannelSelector="R" yChannelSelector="G"/></filter>
  <filter id="da-pencil" x="-5%" y="-5%" width="110%" height="110%"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="2" result="n"/><feDisplacementMap in="SourceGraphic" in2="n" scale="1.6"/></filter>
  <filter id="da-ink" x="-10%" y="-10%" width="120%" height="120%"><feTurbulence type="fractalNoise" baseFrequency="0.6" numOctaves="3" seed="9" result="n"/><feColorMatrix in="n" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1.6 -0.35" result="m"/><feComposite in="SourceGraphic" in2="m" operator="in" result="inked"/><feTurbulence type="fractalNoise" baseFrequency="0.05" numOctaves="1" seed="3" result="d"/><feDisplacementMap in="inked" in2="d" scale="1.2"/></filter>
</defs></svg>`;

function ensureHandFonts() {
  if (document.querySelector("link[data-da-fonts]")) return;
  const l = document.createElement("link");
  l.rel = "stylesheet"; l.dataset.daFonts = "1";
  l.href = "https://fonts.googleapis.com/css2?family=Homemade+Apple&family=Caveat:wght@400;600&display=swap";
  document.head.appendChild(l);
}

function buildLayer(bundles) {
  ensureHandFonts();
  const layer = document.createElement("div");
  layer.className = "desk-alt";
  layer.innerHTML = `${FILTERS}<div class="desk-alt__stage">
    <div class="da-under" aria-hidden="true"><div class="da-under__tab"></div></div>
    <div class="da-folder" aria-hidden="true">
      <div class="da-folder__tab"></div>
      <div class="da-folder__wear"></div>
      <div class="da-stain da-stain--ring" style="left:72%;top:78%;width:120px;height:104px;opacity:.5"></div>
      <div class="da-stain" style="left:6%;top:60%;width:180px;height:120px;opacity:.35"></div>
    </div>
    ${bundles.map((b) => `<button class="placed da-bundle" type="button" data-id="${b.id}" data-title="${esc(b.title)}" data-sub="${esc(b.sub)}" style="width:${S(b.box[0])}px;height:${S(b.box[1])}px" aria-label="${esc(b.title)} — ${esc(b.sub)}">${b.html}</button>`).join("")}
  </div>`;
  document.body.appendChild(layer);
  return layer;
}

// Lay the composition out for the regime and fit the stage to the viewport.
// Wide fits the whole stage; vertical fits the stage's width. Returns the
// transform so the scene can place (and size) the objects with it.
function layout(layer, regime) {
  const R = REGIMES[regime];
  const stage = layer.querySelector(".desk-alt__stage");
  const F = R.folder;
  const under = layer.querySelector(".da-under");
  under.style.cssText = `left:${F.x - 46}px;top:${F.y + 56}px;width:${F.w + 46}px;height:${F.h - 20}px`;
  const folder = layer.querySelector(".da-folder");
  folder.style.cssText = `left:${F.x}px;top:${F.y}px;width:${F.w}px;height:${F.h}px`;
  const tab = layer.querySelector(".da-folder__tab");
  tab.style.cssText = `left:${F.tab.x}px;width:${F.tab.w}px`;
  layer.querySelectorAll(".da-bundle").forEach((b) => {
    const p = R.bundles[b.dataset.id]; if (!p) return;
    b.style.transform = `translate(${F.x + p[0]}px, ${F.y + p[1]}px)`;
    b.style.zIndex = R.zorder.indexOf(b.dataset.id) + 1;
  });

  const { w, h } = R.stage;
  const vertical = regime === "vertical";
  const pad = vertical ? 8 : 48;
  const s = vertical
    ? Math.min((window.innerWidth - pad * 2) / w, (window.innerHeight - 24) / h)
    : Math.min((window.innerWidth - pad * 2) / w, (window.innerHeight - pad * 2 - 40) / h);
  const tx = window.innerWidth / 2 - w * s / 2;
  const ty = vertical ? Math.max(8, window.innerHeight / 2 - h * s / 2 - 12) : window.innerHeight / 2 - h * s / 2;
  stage.style.cssText = `left:0;top:0;width:${w}px;height:${h}px;transform:translate(${tx}px, ${ty}px) scale(${s})`;
  return { s, tx, ty, regime };
}

// ── The fan — the series layer ───────────────────────────────────────────────
// Built through panels.js so it sits in the layer stack like the sheet it
// replaces: the veil, Escape, the breadcrumb and the hoisted title all come
// from there. The documents are cloned out of the bundle (the originals hide),
// rise from where they lay to a row across the screen — a column on a phone —
// and return the same way when the layer pops.
const LIFT_MS = 900;
const LOWER_MS = 320;

function makeFanFactory(ctx) {
  return function makeFanSheet(seriesKey, H) {
    const { archive, layer, reduceMotion } = ctx;
    const s = archive.series[seriesKey];
    const bundle = layer.querySelector(`.da-bundle[data-id="${seriesKey}"]`);
    const veil = H.makeVeil(() => navigate({ layer: "desk" }));
    const content = H.makeContent();
    content.classList.add("da-fan-content");
    const fan = document.createElement("div");
    fan.className = "da-fan";
    content.appendChild(fan);

    // Series title + subtitle — hoisted by pushSheet, and borrowed by the
    // papers' hover to name the document under the pointer.
    const meta = document.createElement("div");
    meta.className = "layer-meta";
    meta.innerHTML = `<h1 class="overlay-title">${esc(s.label)}</h1><p class="overlay-subtitle">${esc(s.subtitle || s.container || "")}</p>`;
    content.appendChild(meta);
    let metaEl = meta;
    const subtitleRest = s.subtitle || s.container || "";
    const setSubtitle = (t) => { const p = metaEl.querySelector(".overlay-subtitle"); if (p) p.textContent = t; };

    content.appendChild(H.makeBreadcrumb([
      { label: "desk", onClick: () => navigate({ layer: "desk" }) },
      { label: s.label, current: true },
    ]));

    // One paper per subcollection, in the series' own order.
    const subs = Object.keys(s.subcollections || {});
    const docs = subs.map((key) => {
      const src = bundle?.querySelector(`[data-sub="${key}"]`) || null;
      return { key, label: s.subcollections[key].label || key, count: H.subcollectionCount(seriesKey, key), src };
    });

    const papers = [];
    const originals = [];
    function build() {
      docs.forEach((d, i) => {
        const btn = document.createElement("button");
        btn.type = "button"; btn.className = "da-fan__paper";
        btn.setAttribute("aria-label", `${d.label} — ${d.count}`);
        let w = 120, h = 160, clone;
        if (d.src) {
          clone = d.src.cloneNode(true);
          clone.removeAttribute("data-sub");
          clone.style.left = "0"; clone.style.top = "0"; clone.style.transform = "";
          clone.style.visibility = "visible";
          w = parseFloat(d.src.style.width) || d.src.offsetWidth || w;
          h = parseFloat(d.src.style.height) || d.src.offsetHeight || h;
          if (d.src.tagName === "IMG") { clone.style.width = w + "px"; h = w * (d.src.naturalHeight / (d.src.naturalWidth || 1) || 1.4); }
          originals.push(d.src);
        } else {
          clone = document.createElement("div");
          clone.className = "da-sheet da-sheet--white";
          clone.innerHTML = `<div class="da-head da-head--serif" style="top:12px;left:12px;font-style:normal">${esc(d.label)}</div>`;
        }
        clone.setAttribute("aria-hidden", "true");
        clone.style.width = w + "px"; clone.style.height = h + "px";
        btn.style.width = w + "px"; btn.style.height = h + "px";
        btn.appendChild(clone);
        btn.addEventListener("click", () => navigate({ layer: "browse", series: seriesKey, subcollection: d.key, view: "all", item: null }));
        const show = () => setSubtitle(`${d.label} · ${d.count}`);
        const hide = () => setSubtitle(subtitleRest);
        btn.addEventListener("pointerenter", show); btn.addEventListener("focus", show);
        btn.addEventListener("pointerleave", hide); btn.addEventListener("blur", hide);
        fan.appendChild(btn);
        papers.push({ btn, w, h, src: d.src, i });
      });
    }

    // Where each paper goes in hand: a row across the screen (wide) or a
    // column down it (vertical). Each is scaled to its slot, so a business
    // card is inspected at the size of a sheet.
    function slots() {
      const vw = window.innerWidth, vh = window.innerHeight;
      const n = papers.length || 1;
      const vertical = vw < 600;
      if (vertical) {
        const pad = 16, gap = 14, colW = vw - pad * 2;
        let y = 64;
        const out = papers.map((p) => {
          const sc = Math.min(colW / p.w, (vh * 0.5) / p.h);
          const slot = { x: vw / 2 - (p.w * sc) / 2, y, sc };
          y += p.h * sc + gap;
          return slot;
        });
        fan.style.height = `${y + 120}px`;
        return out;
      }
      const pad = 48, gap = 24;
      const W = Math.min(1100, vw - pad * 2);
      const slotW = (W - gap * (n - 1)) / n;
      const maxH = vh * 0.62;
      const x0 = (vw - W) / 2;
      fan.style.height = "";
      return papers.map((p, i) => {
        const sc = Math.min(slotW / p.w, maxH / p.h);
        const cx = x0 + slotW * (i + 0.5) + gap * i;
        const cy = vh * 0.47;
        return { x: cx - (p.w * sc) / 2, y: cy - (p.h * sc) / 2, sc };
      });
    }
    // Where a paper lies on the desk, in fan (screen) coordinates.
    function deskPose(p) {
      if (!p.src) return null;
      const r = p.src.getBoundingClientRect();
      const fr = fan.getBoundingClientRect();
      const sc = ctx.fit().s;
      return { x: r.left + r.width / 2 - (p.w * sc) / 2 - fr.left, y: r.top + r.height / 2 - (p.h * sc) / 2 - fr.top + fan.scrollTop, sc };
    }
    const pose = (p, q) => { p.btn.style.transform = `translate(${q.x}px, ${q.y}px) scale(${q.sc})`; };
    function place(animated) {
      const target = slots();
      papers.forEach((p, i) => {
        p.btn.style.transition = animated ? `transform ${LIFT_MS}ms cubic-bezier(0.3, 0.7, 0.2, 1)` : "none";
        pose(p, target[i]);
      });
    }

    let lowered = false;
    const onResize = () => { if (!lowered) place(false); };

    // Rise: start where the papers lie, then go to the slots.
    function open() {
      build();
      const canRise = !reduceMotion && window.innerWidth >= 600 && papers.every((p) => p.src);
      if (canRise) {
        papers.forEach((p) => { p.btn.style.transition = "none"; pose(p, deskPose(p)); });
        // The clones now cover the originals exactly; hide the originals and
        // let the clones go.
        requestAnimationFrame(() => {
          originals.forEach((o) => { o.style.visibility = "hidden"; });
          requestAnimationFrame(() => place(true));
        });
      } else {
        originals.forEach((o) => { o.style.visibility = "hidden"; });
        place(false);
      }
      window.addEventListener("resize", onResize);
      bundle?.classList.add("is-lifted");
    }
    // Lower: back to the desk, then the originals return.
    function cleanup() {
      lowered = true;
      window.removeEventListener("resize", onResize);
      const canFall = !reduceMotion && window.innerWidth >= 600 && papers.every((p) => p.src);
      if (canFall) {
        papers.forEach((p) => { p.btn.style.transition = `transform ${LOWER_MS}ms var(--ease-out)`; pose(p, deskPose(p)); });
      }
      setTimeout(() => { originals.forEach((o) => { o.style.visibility = ""; }); bundle?.classList.remove("is-lifted"); }, canFall ? LOWER_MS - 20 : 0);
      escOff();
    }
    const escOff = H.attachEscapeHandler(content, () => navigate({ layer: "desk" }));

    // panels.js appends the content on push; the papers need it in the
    // document to measure, so open on the next frame.
    requestAnimationFrame(() => { if (ctx.ready) open(); else ctx.whenReady.then(open); });

    return {
      veil, content, cleanup,
      onHoist: (el) => { metaEl = el; },
      update: (state) => state.layer === "series" && state.series === seriesKey,
    };
  };
}

// ── Init ─────────────────────────────────────────────────────────────────────
export async function initDeskAlt() {
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let readyResolve; const whenReady = new Promise((r) => { readyResolve = r; });
  const ctx = { archive: null, layer: null, reduceMotion, ready: false, whenReady, fit: () => fit };
  let fit = { s: 1, tx: 0, ty: 0, regime: regimeName() };
  // Registered before the data arrives so a deep link restores through the fan.
  configureAltDesk({ seriesSheet: makeFanFactory(ctx) });

  const res = await fetch("/data/archive.json");
  const archive = await res.json();
  const bundles = buildBundles(archive);
  const layer = buildLayer(bundles);
  ctx.archive = archive; ctx.layer = layer;
  fit = layout(layer, regimeName());
  ctx.ready = true; readyResolve();

  // Hover title — the live desk's, bottom right.
  const hover = document.createElement("div");
  hover.className = "layer-meta scene-hover-meta desk-alt-hover";
  hover.innerHTML = `<h1 class="overlay-title"></h1><p class="overlay-subtitle"></p>`;
  document.body.appendChild(hover);
  const showHover = (title, sub) => { hover.querySelector("h1").textContent = title; hover.querySelector("p").textContent = sub; hover.classList.add("is-on"); };
  const hideHover = () => hover.classList.remove("is-on");

  const FLAT = new Set(["labor", "accumulation"]);
  layer.querySelectorAll(".da-bundle").forEach((btn) => {
    const id = btn.dataset.id;
    const info = archive.series[id] || {};
    const flat = FLAT.has(id) || Object.keys(info.subcollections || {}).length <= 1;
    const show = () => showHover(btn.dataset.title, flat ? `${info.items?.length || ""} records`.trim() : (info.subtitle || info.container || btn.dataset.sub));
    btn.addEventListener("pointerenter", show); btn.addEventListener("focus", show);
    btn.addEventListener("pointerleave", hideHover); btn.addEventListener("blur", hideHover);
    btn.addEventListener("click", () => {
      hideHover();
      if (flat && !reduceMotion) {
        // Nothing to choose between: the bundle rises a beat, then the grid
        // opens over it and it settles back under the veil.
        btn.classList.add("is-rising");
        setTimeout(() => navigate({ layer: "series", series: id, subcollection: null, item: null }), 260);
        setTimeout(() => btn.classList.remove("is-rising"), 900);
      } else {
        navigate({ layer: "series", series: id, subcollection: null, item: null });
      }
    });
  });

  // ── WebGL ──
  const canvas = document.getElementById("scene");
  if (!canvas) { dismissLoadingScreen(); return; }
  let renderer;
  try { renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true }); }
  catch (e) { dismissLoadingScreen(); return; }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setClearColor(0x000000, 0);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 100);
  camera.position.set(0, 5, 0.5);
  camera.lookAt(0, 0, 0);
  scene.add(new THREE.AmbientLight(0xffe0b0, 0.5));
  const spot = new THREE.SpotLight(0xffb347, 120, 20, Math.PI / 5, 0.4, 1.5);
  spot.position.set(0, 8, -2); spot.target.position.set(0, 0, 0);
  spot.castShadow = true; spot.shadow.mapSize.set(2048, 2048);
  spot.shadow.camera.near = 4; spot.shadow.camera.far = 20; spot.shadow.bias = -0.001;
  scene.add(spot, spot.target);

  const manager = new THREE.LoadingManager();
  manager.onLoad = () => { render(); dismissLoadingScreen(); };
  const loader = createModelLoader(manager);

  loader.load(`${MODEL_BASE}desk.glb`, (gltf) => {
    const desk = gltf.scene;
    const box = new THREE.Box3().setFromObject(desk);
    const size = new THREE.Vector3(); box.getSize(size);
    desk.scale.setScalar(20 / size.x);
    box.setFromObject(desk);
    desk.position.set(0, -box.max.y, 1);
    desk.traverse((c) => { if (c.isMesh) { c.receiveShadow = true; c.castShadow = true; } });
    scene.add(desk);
  });

  // The objects keep their size relative to the papers: their world scale
  // follows the stage's scale, normalised by how many screen pixels a desk
  // unit covers at this viewport (the camera's vertical field is fixed).
  const REF_PX_PER_UNIT = 900 / (2 * 5 * Math.tan((75 / 2) * Math.PI / 180));
  const pxPerUnit = () => window.innerHeight / (2 * 5 * Math.tan((75 / 2) * Math.PI / 180));
  const objectScale = () => fit.s * (REF_PX_PER_UNIT / pxPerUnit());

  const objects = [];
  const clickables = [];
  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const hit = new THREE.Vector3();
  function stageToWorld(sx, sy) {
    const px = fit.tx + sx * fit.s, py = fit.ty + sy * fit.s;
    ndc.set((px / window.innerWidth) * 2 - 1, -(py / window.innerHeight) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    return ray.ray.intersectPlane(plane, hit) ? hit.clone() : new THREE.Vector3();
  }
  function placeObjects() {
    const k = objectScale();
    objects.forEach((o) => {
      const a = REGIMES[fit.regime].objects[o.id]; if (!a) return;
      o.model.scale.setScalar(o.base * k);
      const p = stageToWorld(a.x, a.y);
      o.model.position.set(p.x - o.cx * k, o.posY * k, p.z - o.cz * k);
    });
  }
  function fitModel(model, { w, h, d, ry = 0 }) {
    const box = new THREE.Box3().setFromObject(model);
    const size = new THREE.Vector3(); box.getSize(size);
    const base = Math.min(w / size.x, h / size.y, d / size.z);
    model.scale.setScalar(base);
    model.rotation.set(0, ry * Math.PI / 180, 0);
    box.setFromObject(model);
    const c = new THREE.Vector3(); box.getCenter(c);
    model.traverse((ch) => { if (ch.isMesh) { ch.castShadow = true; ch.receiveShadow = true; } });
    return { base, cx: c.x, cz: c.z, posY: -box.min.y };
  }
  function addObject(id, model, cfg) {
    const f = fitModel(model, cfg);
    scene.add(model);
    objects.push({ id, model, ...f });
    model.traverse((ch) => { if (ch.isMesh) { ch.userData.altId = id; clickables.push(ch); } });
    placeObjects();
  }

  loader.load(`${WEB_BASE}${DESK_OBJECTS.guide.file}`, (gltf) => addObject("guide", gltf.scene, { w: 1, h: 1, d: 1, ry: 90 }));
  {
    const geo = new THREE.IcosahedronGeometry(0.5, 2);
    const pos = geo.attributes.position; const r = rng(42); const v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      v.multiplyScalar(0.82 + 0.28 * Math.sin(v.x * 5.1 + 1.3) * Math.cos(v.z * 4.3) + 0.08 * (r() - 0.5)); v.y *= 0.6;
      pos.setXYZ(i, v.x, v.y, v.z);
    }
    geo.computeVertexNormals();
    const mat = new THREE.MeshPhysicalMaterial({ color: 0xd9902a, emissive: 0x5a2e05, emissiveIntensity: 0.35, roughness: 0.32, metalness: 0, transmission: 0.4, thickness: 0.8, ior: 1.54, attenuationColor: new THREE.Color(0x8a4a10), attenuationDistance: 0.9, clearcoat: 0.4 });
    addObject("amber", new THREE.Mesh(geo, mat), { w: 0.9, h: 0.6, d: 0.9, ry: -20 });
  }
  {
    const stamp = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.3, 0.3), new THREE.MeshStandardMaterial({ color: 0x8a8274, roughness: 0.75 }));
    const face = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.26, 0.26), new THREE.MeshStandardMaterial({ color: 0x5f584d, roughness: 0.8 }));
    face.position.x = -0.47;
    stamp.add(body, face);
    addObject("stamp", stamp, { w: 0.9, h: 0.3, d: 0.3, ry: 0 });
  }

  const pointer = new THREE.Vector2(); const mouse = new THREE.Vector2();
  let hoverId = null;
  function pick(e) {
    pointer.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
    mouse.copy(pointer);
    ray.setFromCamera(pointer, camera);
    const h = ray.intersectObjects(clickables, false)[0];
    return h ? h.object.userData.altId : null;
  }
  const OBJECT_INFO = {
    guide: () => ({ title: archive.guide?.label || "Guide", sub: archive.guide?.subtitle || archive.guide?.container || "key" }),
    amber: () => ({ title: "Amber", sub: "unresolved" }),
    stamp: () => ({ title: "Seal", sub: "the instrument — the sheet is the entry" }),
  };
  canvas.addEventListener("pointermove", (e) => {
    if (getState().layer !== "desk") return;
    const id = pick(e);
    if (id !== hoverId) {
      hoverId = id;
      if (id) { const i = OBJECT_INFO[id](); showHover(i.title, i.sub); canvas.style.cursor = id === "guide" ? "pointer" : "default"; }
      else { hideHover(); canvas.style.cursor = "default"; }
    }
  });
  canvas.addEventListener("click", (e) => { if (getState().layer === "desk" && pick(e) === "guide") navigate({ layer: "guide" }); });

  const lightPos = { x: 0, z: -2 };
  function render() {
    lightPos.x += (mouse.x - lightPos.x) * 0.08;
    lightPos.z += ((-2 + -mouse.y * 0.5) - lightPos.z) * 0.08;
    spot.position.x = lightPos.x; spot.position.z = lightPos.z;
    spot.target.updateMatrixWorld();
    renderer.render(scene, camera);
  }
  if (reduceMotion) render();
  else (function animate() { requestAnimationFrame(animate); if (isSceneRenderPaused()) return; render(); })();

  window.addEventListener("resize", () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    fit = layout(layer, regimeName());
    placeObjects();
    if (reduceMotion) render();
  });

  // The rising flat bundle settles once its sheet is up; and a lifted bundle
  // whose fan was popped by history gets its papers back (cleanup handles it).
  subscribe((state) => { if (state.layer === "desk") layer.querySelectorAll(".is-rising").forEach((b) => b.classList.remove("is-rising")); });
}
