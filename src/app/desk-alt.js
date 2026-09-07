// ── The papers desk ──────────────────────────────────────────────────────────
// The desk: the five series as bundles of documents clipped together inside
// one open folder, with the key, an amber block, the stamp and the clips as
// the only things that are not paper. It replaced the five-container desk
// (scene.js; kept on the `original-desk-objects` branch) on 2026-09-07. The folder and
// the papers are a DOM layer over the WebGL desk; the wood, the three objects
// and the clips are the scene. Ported from mockups/desk-papers/ (rev 3); the
// plan of record is docs/desk-papers-plan.md.
//
// Three layers, bottom to top: the desk canvas (the wood alone); the DOM
// stage (folder, papers), lit by an overlay that follows the desk's lamp so
// paper and wood are lit by the same light; and the objects canvas — the key,
// the amber, the stamp, the clips — which shares the desk camera and is drawn
// above the DOM because everything with height stands on the paper, never
// under it. A shadow-catcher plane in that canvas lays the objects' shadows
// onto the paper. Veils and sheets stack above all three as everywhere else.
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
// between: its grid opens.

import * as THREE from "three";
import { navigate } from "./router.js";
import { getState } from "./state.js";
import { dismissLoadingScreen } from "./loading.js";
import { DESK_OBJECTS, DESK_CLIPS, MODEL_BASE, WEB_BASE } from "../shared/desk-objects.js";
import { createModelLoader } from "./model-look.js";
import { isSceneRenderPaused } from "./scene.js";
import { configureAltDesk } from "./panels.js";
import { imageUrl } from "./image-url.js";
import { LOOK, look } from "./look.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import "../styles/desk-alt.css";
import "../styles/look-steel.css";

// ── Geometry ─────────────────────────────────────────────────────────────────
// Design units. The reference collage's folder is 445 × 315 px; everything is
// transcribed from it at ×1.8, so the folder is 800 × 567 on a 1200 × 780 stage.
const K = 1.8;
const S = (v) => Math.round(v * K);
// Physical scale for documents with recorded dimensions (mm → stage px), set
// from the business card: 89 × 51 mm at 1.5 px/mm is the 134 × 77 px card the
// composition was drawn with, so a true-size scan sits in the same scale as
// the typeset papers around it.
const PX_PER_MM = 1.5;

const REGIMES = {
  wide: {
    stage: { w: 1200, h: 780 },
    folder: { x: 200, y: 90, w: S(445), h: S(315), tab: { x: S(80), w: S(95) } },
    bundles: { identity: [S(8), S(10)], consumption: [S(78), S(-8)], creation: [S(80), S(108)], labor: [S(232), S(36)], accumulation: [S(308), S(-2)] },
    zorder: ["identity", "labor", "consumption", "creation", "accumulation"],
    objects: { guide: { x: 130, y: 690 }, amber: { x: 1090, y: 620 }, stamp: { x: 200 + S(196), y: 90 + S(315) + 6 } },
  },
  vertical: {
    stage: { w: 600, h: 1240 },
    folder: { x: 40, y: 30, w: 520, h: 1060, tab: { x: 60, w: 150 } },
    bundles: { identity: [20, 20], consumption: [200, 10], accumulation: [215, 300], creation: [20, 580], labor: [300, 610] },
    zorder: ["identity", "consumption", "accumulation", "creation", "labor"],
    objects: { guide: { x: 130, y: 1150 }, amber: { x: 500, y: 1140 }, stamp: { x: 300, y: 1096 } },
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
// A scan at its true size: `[x, y]` in bundle-relative stage px, `wmm × hmm`
// from the record's dimensions.
function scanTrue(src, [x, y], wmm, hmm, r = 0, extra = "") {
  if (!src) return "";
  const w = Math.round(wmm * PX_PER_MM), h = Math.round(hmm * PX_PER_MM);
  return `<img class="da-scan" src="${esc(src)}" style="left:${x}px;top:${y}px;width:${w}px;height:${h}px;${extra || `transform:rotate(${r}deg)`}" alt="" loading="lazy">`;
}
// A crease: a soft light/dark pair across a sheet, so it reads as folded or
// handled rather than printed flat.
function crease(angle, at, strength = 1) {
  return `<div class="da-crease" style="background:linear-gradient(${angle}deg, transparent calc(${at}% - 3px), rgba(255,255,255,${0.32 * strength}) calc(${at}% - 1px), rgba(10,8,5,${0.14 * strength}) calc(${at}% + 1px), transparent calc(${at}% + 4px))"></div>`;
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

// ── Documents, typeset from the archive where the record is at hand ─────────
// Each bundle is a series; its box is the button's footprint. Sheet boxes are
// written as the reference's folder-relative coordinates minus the bundle's
// origin, so they can be read against the mockup. In a bundle with
// subcollections every subcollection has a document (data-sub); the ones the
// composition does not show in full peek from under the others, as a pile
// would have them. `clips` are the bundle's 3D clips: kind, bundle-relative
// stage x/y of the clip's centre, and rotation about the vertical.
function byDateDesc(items) { return [...(items || [])].sort((a, b) => String(b.sort_date || "").localeCompare(String(a.sort_date || ""))); }
function year(d) { return String(d || "").slice(0, 4); }
const thisYear = year(new Date().toISOString());
function mm(dim) { const m = /(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)/.exec(String(dim || "")); return m ? [parseFloat(m[1]), parseFloat(m[2])] : null; }

// The Accumulation column is the reference's column of real ephemera, at true
// size: seven slots, each with the shape it wants, filled from the newest
// records that have a scan and recorded dimensions — each record once.
// Records whose published display derivative is the raw scan on the red
// scanning ground (no cut-out yet). Kept off the desk until they are cut.
const RED_BACKGROUND = new Set(["EPH-2026-023", "EPH-2026-026"]);
function accumulationSlots(items) {
  // A scan still on its red scanning background never reaches the desk:
  // the cut-out is preferred, and a record with neither is skipped.
  const usable = (i) => i.assets?.front && mm(i.dimensions) && (i.assets?.cutout || !RED_BACKGROUND.has(i.id));
  const pool = byDateDesc(items).filter(usable).map((i) => {
    const [w, h] = mm(i.dimensions);
    return { id: i.id, src: i.assets.cutout ? imageUrl(i.assets.cutout, "cutout") : imageUrl(i.assets.front, "display"), w, h, aspect: h / w, area: w * h };
  });
  const take = (pred) => { let best = null, bs = Infinity; pool.forEach((c) => { const sc = pred(c); if (sc < bs) { bs = sc; best = c; } }); if (best) pool.splice(pool.indexOf(best), 1); return best; };
  // Each slot wants a shape and has room for a size; a record that would
  // overrun its slot is a poor fit even at the right aspect.
  const fits = (c, maxW, maxH) => (c.w <= maxW && c.h <= maxH ? 0 : 1e6);
  const nearAspect = (t, maxW = 999, maxH = 999) => (c) => Math.abs(Math.log(c.aspect) - Math.log(t)) + fits(c, maxW, maxH);
  const backing  = take((c) => (c.aspect >= 1 && c.w <= 190 ? -c.area : 1e9));  // the largest portrait piece
  const receipt  = take(nearAspect(0.55, 125, 80));   // wide, small — pinned at the top
  const brochure = take(nearAspect(1.4, 120, 220));   // portrait, mid
  const longTkt  = take((c) => (c.aspect < 0.5 && c.w >= 120 ? nearAspect(0.33)(c) : 1e9)); // a strip, turned upright
  const postcard = take(nearAspect(1.4, 110, 155));   // portrait, overhanging the right edge
  const small    = take(nearAspect(1.3, 90, 110));    // small, square-ish
  const bill     = take(nearAspect(0.5, 125, 80));    // wide, bottom
  return { backing, receipt, brochure, longTkt, postcard, small, bill };
}

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
  const receiptLines = (arr, n, price) => arr.slice(0, n).map((i) => `1  ${String(i.title || "").toLowerCase().slice(0, 16).padEnd(16)} ${price}`).join("\n");
  const bookReceipt = receiptLines(books, 3, "12.00") || "1  —";
  const coffeeReceipt = receiptLines(coffee, 3, " 4.50") || "1  coffee            4.50";
  const record = music[0] ? String(music[0].title || "").toLowerCase() : "side a · side b";
  const game = games[0] ? String(games[0].title || "").toLowerCase() : "slot 1";

  // Accumulation — true-size scans, each record once
  const A = accumulationSlots(series.accumulation?.items || []);
  const box = [297, 540];
  const accHtml = [
    A.backing  && scanTrue(A.backing.src,  [22, 44], A.backing.w, A.backing.h, 0.5),
    A.brochure && scanTrue(A.brochure.src, [34, 96], A.brochure.w, A.brochure.h, 0.6),
    A.receipt  && scanTrue(A.receipt.src,  [12, -4], A.receipt.w, A.receipt.h, -1),
    A.small    && scanTrue(A.small.src,    [40, 330], A.small.w, A.small.h, -1),
    A.longTkt  && scanTrue(A.longTkt.src,  [118 + Math.round(A.longTkt.h * PX_PER_MM), 262], A.longTkt.w, A.longTkt.h, 90, `transform-origin:0 0;transform:rotate(90deg)`),
    A.postcard && scanTrue(A.postcard.src, [box[0] - 96, 296], A.postcard.w, A.postcard.h, 1),
    A.bill     && scanTrue(A.bill.src,     [126, 442], A.bill.w, A.bill.h, -1),
  ].filter(Boolean).join("");

  return [
    { id: "identity", title: labelOf("identity"), sub: "cv · timetable · card", box: [S(90), S(300)], clips: [{ kind: "bulldog", x: -14, y: S(48), r: 90 }], html: [
      sheet("da-sheet--white da-sheet--rough", [7 - 8, 45 - 10, 72, 245], `
        <div class="da-head da-head--serif">Curriculum vitae</div>
        <div class="da-mono" style="top:28px">${esc(cvLines)}</div>
        <div class="da-rules da-rules--dense" style="top:78px;opacity:.28"></div>
        <div class="da-note" style="left:8px;top:150px;transform:rotate(-6deg);font-size:15px">update → ${esc(thisYear)}</div>
        <div class="da-postage" style="left:12px;top:340px;transform:rotate(4deg)"><div class="da-postage__in"></div></div>
        ${crease(3, 52, 0.8)}
        ${stampCircle(8, 183, 64, "LOW DESIGN OFFICE · RECEIVED ·", "SEP 06 2026", -18)}`, { sub: "cv" }),
      sheet("da-sheet--rough", [7 - 8, 8 - 10, 82, 16], `<div class="da-note" style="left:8px;top:5px;font-size:11px;letter-spacing:.08em">${esc(timetable)}</div>${tape(2, -3, 16, 9, -8)}${tape(70, -2, 16, 9, 6)}`, { sub: "biography" }),
      sheet("da-sheet--white", [18 - 8, 258 - 10, 64, 36], `<div class="da-head da-head--serif" style="top:6px;font-style:normal">${esc(cardName)}</div><div class="da-mono" style="top:20px">${esc(cardLine)}</div><div class="da-stain" style="left:-10px;top:-14px;width:46px;height:40px;opacity:.5"></div>`, { sub: "contact" }),
      sheet("", [12 - 8, 292 - 10, 100, 11], `<div class="da-rules" style="opacity:.3"></div>`, { torn: "top", seed: 3 }),
    ].join("") },

    { id: "consumption", title: labelOf("consumption"), sub: "log · receipts · sleeve · card", box: [S(170), S(160)], clips: [{ kind: "paperclip", x: S(222 - 78) + 10, y: S(12 + 8) + 24, r: 0 }], html: [
      sheet("da-sheet--thermal", [85 - 78 + 128, 0 + 8 + 30, 62, 120], `<div class="da-mono" style="top:8px;left:6px">books\n—\n${esc(bookReceipt)}\n—</div>${crease(0, 58, 0.6)}`, { sub: "books", r: 3 }),
      sheet("da-sheet--white", [85 - 78 + 100, 0 + 8 + 96, 72, 72], `<div class="da-head" style="top:6px;left:6px">record</div><div class="da-note" style="left:8px;top:30px;font-size:13px;white-space:normal;line-height:1.05">${esc(record)}</div><div class="da-disc"></div>`, { sub: "music", r: -2 }),
      sheet("da-sheet--thermal", [85 - 78 - 14, 0 + 8 + 70, 56, 100], `<div class="da-mono" style="top:8px;left:6px">café\n—\n${esc(coffeeReceipt)}\n—\nthank you</div><div class="da-stain da-stain--ring" style="left:-20px;top:50px;width:70px;height:60px;opacity:.6"></div>`, { sub: "coffee", r: -4 }),
      sheet("", [85 - 78 + 20, 0 + 8 + 118, 70, 44], `<div class="da-head" style="top:6px">save · ${esc(game)}</div><div class="da-mono" style="top:22px;opacity:.5">slot 1  ▸ 03:12:44\nslot 2  — empty</div>`, { sub: "games", r: 2 }),
      sheet("da-sheet--white da-sheet--rough", [85 - 78, 0 + 8, 155, 140], `
        <div class="da-head" style="top:8px;left:44px">log · films books records</div><div class="da-big">Log</div>
        <div class="da-rules" style="top:64px;opacity:.3"></div>
        <div class="da-hand" style="top:120px;left:70px;font-size:9.5px;line-height:17px">${esc(logText)}</div>
        <div class="da-stain da-stain--ring" style="left:190px;top:170px;width:70px;height:62px"></div>
        <div class="da-note" style="left:8px;top:200px;font-size:16px;color:var(--ink-pencil)">again in sept.</div>
        ${crease(90, 50, 0.9)}`, { sub: "films" }),
      `<div class="da-photo" style="left:200px;top:96px;width:40px;height:40px;transform:rotate(-1deg)"><div class="da-photo__img"${still ? ` style="background-image:url('${esc(still)}')"` : ""}></div>${tape(-8, -5, 20, 7, -30)}</div>`,
    ].join("") },

    { id: "creation", title: labelOf("creation"), sub: "sketch · note · print · pattern · strip", box: [S(170), S(190)], clips: [], html: [
      sheet("da-sheet--rough", [85 - 80 - 10, 110 - 108 - 12, 90, 70], `<div class="da-hand" style="top:8px;left:8px;right:6px;font-size:8px;line-height:14px">a note — kept for the sentence in it, not the page.</div>${crease(12, 40, 0.7)}${crease(-70, 70, 0.5)}`, { sub: "notes", r: -3 }),
      sheet("", [85 - 80 + 60, 110 - 108 + 150, 70, 50], `<div class="da-pattern"></div><div class="da-head" style="top:4px;left:6px">pattern · fold on dashed</div>`, { sub: "prototypes", r: 4 }),
      sheet("da-sheet--dark", [85 - 80 + 118, 110 - 108 + 40, 22, 150], `<div class="da-strip"></div>`, { sub: "videos", r: 1 }),
      sheet("da-sheet--rough", [85 - 80, 110 - 108, 155, 180], `
        <div class="da-hand" style="top:14px;left:14px;right:12px;font-size:11px;line-height:19px">the surface remembers what the record forgets — a crease, a thumbprint, the place where the pen ran dry. keep the sheet. the note is only its excuse.</div>
        <svg class="da-sketch" viewBox="0 0 279 324" aria-hidden="true"><g filter="url(#da-pencil)" fill="none" stroke="#3a3128" stroke-width="1" opacity="0.7">
        <path d="M40 275 L40 175 L140 140 L140 240 Z"/><path d="M140 140 L225 165 L225 265 L140 240"/><path d="M40 175 L78 152 L78 250 M78 152 L170 118" stroke-dasharray="3 3"/>
        <path d="M180 210 c-10 -40 20 -60 30 -30 c 10 -30 40 -10 22 20 c 30 5 20 40 -8 32 c 5 30 -35 30 -30 5 c -30 10 -40 -25 -14 -27" stroke-width=".9"/>
        <path d="M60 300 C100 288, 170 310, 250 292"/></g></svg>
        <div class="da-seal" style="left:212px;top:268px;transform:rotate(-4deg)"></div>
        <div class="da-mono" style="left:12px;top:296px;opacity:.45">untitled · graphite · ${esc(thisYear)}</div>${crease(-8, 34, 0.6)}${tape(-4, -4, 30, 10, -40)}`, { sub: "sketches" }),
      `<div class="da-photo" data-sub="photos" style="left:${S(85 - 80 + 8)}px;top:${S(110 - 108 + 118)}px;width:${S(52)}px;height:${S(40)}px;transform:rotate(-5deg)"><div class="da-photo__img"></div>${tape(14, -5, 24, 8, 8)}</div>`,
      sheet("da-sheet--thermal", [180 - 80, 275 - 108, 38, 15], `<div class="da-note" style="top:-2px;left:6px;font-size:15px">print ↑</div>`, { torn: "right", seed: 5 }),
    ].join("") },

    { id: "labor", title: labelOf("labor"), sub: "drawing · specification · transmittal", box: [S(140), S(262)], clips: [], html: [
      sheet("da-sheet--white", [240 - 232, 40 - 36, 85, 65], `<div class="da-head">specification · 09 21 00</div><div class="da-mono" style="top:20px;line-height:8px;opacity:.5">2.1  gypsum board assemblies\n2.2  metal framing, 20 ga\n2.3  acoustic insulation\n3.1  install per mfr. instr.</div><div class="da-rules da-rules--dense" style="top:64px;opacity:.25"></div><div class="da-rstamp-box">ISSUED</div>`, { torn: "bottom", seed: 11 }),
      sheet("da-sheet--diazo da-sheet--rough", [235 - 232, 85 - 36, 110, 200], `<div class="da-diazo-lines"></div><div class="da-fold da-fold--h" style="top:50%"></div><div class="da-fold da-fold--v" style="left:50%"></div>
        <svg class="da-sketch" viewBox="0 0 198 360" aria-hidden="true"><g filter="url(#da-pencil)" fill="none" stroke="rgba(205,220,240,.85)" stroke-width="1">
        <rect x="30" y="30" width="136" height="120"/><path d="M30 90 H166 M96 30 V150 M60 30 V90 M132 90 V150"/><path d="M40 40 h20 M40 44 h14" stroke-width=".6"/>
        <path d="M30 200 H166 M30 200 L30 300 L166 300 L166 200"/><path d="M30 300 L98 250 L166 300"/><path d="M60 260 v40 M120 260 v40 M60 260 h20 v20 h-20 z M110 260 h20 v20 h-20 z" stroke-width=".7"/>
        <path d="M20 330 H178" stroke-dasharray="6 3" stroke-width=".6"/></g></svg>
        <div class="da-title-block" style="width:44%;height:14%"><b>${esc(labelOf("labor"))}</b>a-101 · plan · record</div>
        <div class="da-note" style="left:14px;top:300px;color:rgba(255,255,255,.7);font-size:15px;transform:rotate(-2deg)">rev 2 — see transmittal</div>
        <div class="da-wear-corner"></div>${tape(96, -3, 18, 8, 4)}`),
      sheet("da-sheet--thermal da-sheet--rough", [280 - 232, 225 - 36, 85, 65], `<div class="da-head">transmittal</div><div class="da-mono" style="top:20px;line-height:8px">1  a-101   plan\n2  a-201   elevations\n3  a-501   details\n—  issued for record</div><div class="da-hand" style="left:70px;top:58px;font-size:13px;transform:rotate(-8deg)">bf</div>${crease(0, 46, 0.5)}`),
    ].join("") },

    { id: "accumulation", title: labelOf("accumulation"), sub: "map · receipt · brochure · ticket · postcard · bill", box, clips: [{ kind: "bulldog", x: 24, y: 550, r: 0, small: true }, { kind: "paperclip", x: 36, y: 552, r: 0 }, { kind: "pin", x: 180, y: 6, r: -20 }], html: accHtml },
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
    ${bundles.map((b) => `<button class="placed da-bundle" type="button" data-id="${b.id}" data-title="${esc(b.title)}" data-sub="${esc(b.sub)}" style="width:${b.box[0]}px;height:${b.box[1]}px" aria-label="${esc(b.title)} — ${esc(b.sub)}">${b.html}</button>`).join("")}
  </div>
  <div class="desk-alt__light" aria-hidden="true"></div>
  <div class="desk-alt__glow" aria-hidden="true"></div>`;
  document.body.appendChild(layer);
  return layer;
}

// Lay the composition out for the regime and fit the stage to the viewport.
function layout(layer, regime) {
  const R = REGIMES[regime];
  const stage = layer.querySelector(".desk-alt__stage");
  const F = R.folder;
  layer.querySelector(".da-under").style.cssText = `left:${F.x - 46}px;top:${F.y + 56}px;width:${F.w + 46}px;height:${F.h - 20}px`;
  layer.querySelector(".da-folder").style.cssText = `left:${F.x}px;top:${F.y}px;width:${F.w}px;height:${F.h}px`;
  layer.querySelector(".da-folder__tab").style.cssText = `left:${F.tab.x}px;width:${F.tab.w}px`;
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
// replaces. The documents are cloned out of the bundle unchanged (the
// originals hide), rise from where they lay to a row across the screen — a
// column on a phone — and return the same way, landing as the originals
// reappear, when the layer pops.
const LIFT_MS = 900;
const LOWER_MS = 340;   // under panels' 400 ms removal of the popped content
const EASE_IN_OUT = "cubic-bezier(0.55, 0, 0.15, 1)";

function makeFanFactory(ctx) {
  return function makeFanSheet(seriesKey, H) {
    // panels.js wants the sheet at once; the desk's data and DOM may still be
    // loading on a deep link. The shell is returned now and filled on ready.
    const veil = H.makeVeil(() => navigate({ layer: "desk" }));
    const content = H.makeContent();
    content.classList.add("da-fan-content");
    const fan = document.createElement("div");
    fan.className = "da-fan";
    content.appendChild(fan);
    let metaEl = null;
    let teardown = () => {};
    const escOff = H.attachEscapeHandler(content, () => navigate({ layer: "desk" }));

    function setup() {
      const { archive, layer, reduceMotion } = ctx;
      const s = archive.series[seriesKey];
      if (!s) return;
      const bundle = layer.querySelector(`.da-bundle[data-id="${seriesKey}"]`);

      const meta = document.createElement("div");
      meta.className = "layer-meta";
      meta.innerHTML = `<h1 class="overlay-title">${esc(s.label)}</h1><p class="overlay-subtitle">${esc(s.subtitle || s.container || "")}</p>`;
      // pushSheet hoists a .layer-meta that is in the content at push time;
      // arriving later, this one is hoisted by hand.
      if (metaEl) metaEl.replaceWith(meta); else document.body.appendChild(meta);
      metaEl = meta;
      metaEl.style.zIndex = String((parseInt(content.style.getPropertyValue("--depth")) || 1) * 10 + 2);
      const subtitleRest = s.subtitle || s.container || "";
      const setSubtitle = (t) => { const p = metaEl.querySelector(".overlay-subtitle"); if (p) p.textContent = t; };

      content.appendChild(H.makeBreadcrumb([
        { label: "desk", onClick: () => navigate({ layer: "desk" }) },
        { label: s.label, current: true },
      ]));

      const subs = Object.keys(s.subcollections || {});
      const docs = subs.map((key) => ({ key, label: s.subcollections[key].label || key, count: H.subcollectionCount(seriesKey, key), src: bundle?.querySelector(`[data-sub="${key}"]`) || null }));

      const papers = [];
      const originals = [];
      docs.forEach((d, i) => {
        const btn = document.createElement("button");
        btn.type = "button"; btn.className = "da-fan__paper";
        btn.setAttribute("aria-label", `${d.label} — ${d.count}`);
        let w = 120, h = 160, clone;
        if (d.src) {
          // The document itself, unchanged: the same markup and inline
          // style, re-anchored at the button's origin. Its small rotation on
          // the desk rides on the button (deskPose), so it squares up rising.
          clone = d.src.cloneNode(true);
          clone.removeAttribute("data-sub");
          w = parseFloat(d.src.style.width) || d.src.offsetWidth || w;
          h = parseFloat(d.src.style.height) || d.src.offsetHeight || h;
          if (d.src.tagName === "IMG" && !d.src.style.height) h = w * ((d.src.naturalHeight || 1) / (d.src.naturalWidth || 1));
          clone.style.left = "0"; clone.style.top = "0"; clone.style.transform = ""; clone.style.visibility = "visible";
          originals.push(d.src);
        } else {
          clone = document.createElement("div");
          clone.className = "da-sheet da-sheet--white";
          clone.style.width = w + "px"; clone.style.height = h + "px";
          clone.innerHTML = `<div class="da-head da-head--serif" style="top:12px;left:12px;font-style:normal">${esc(d.label)}</div>`;
        }
        clone.setAttribute("aria-hidden", "true");
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

      function slots() {
        const vw = window.innerWidth, vh = window.innerHeight;
        const n = papers.length || 1;
        if (vw < 600) {
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
          return { x: cx - (p.w * sc) / 2, y: vh * 0.47 - (p.h * sc) / 2, sc };
        });
      }
      function deskPose(p) {
        if (!p.src) return null;
        const r = p.src.getBoundingClientRect();
        const fr = fan.getBoundingClientRect();
        const sc = ctx.fit().s;
        const rot = /rotate\((-?[\d.]+)deg\)/.exec(p.src.style.transform || "");
        return { x: r.left + r.width / 2 - (p.w * sc) / 2 - fr.left, y: r.top + r.height / 2 - (p.h * sc) / 2 - fr.top + fan.scrollTop, sc, rot: rot ? parseFloat(rot[1]) : 0 };
      }
      const pose = (p, q) => { p.btn.style.transform = `translate(${q.x}px, ${q.y}px) scale(${q.sc}) rotate(${q.rot || 0}deg)`; };
      function place(animated) {
        const target = slots();
        papers.forEach((p, i) => {
          p.btn.style.transition = animated ? `transform ${LIFT_MS}ms ${EASE_IN_OUT}` : "none";
          pose(p, target[i]);
        });
      }
      let lowered = false;
      const onResize = () => { if (!lowered) place(false); };
      const canMove = () => !reduceMotion && window.innerWidth >= 600 && papers.every((p) => p.src) && getState().layer === "series";

      // Rise: from where the papers lie (a click on the desk) or straight into
      // place (a deep link, a sheet already over the fan).
      if (canMove()) {
        papers.forEach((p) => { p.btn.style.transition = "none"; pose(p, deskPose(p)); });
        requestAnimationFrame(() => {
          originals.forEach((o) => { o.style.visibility = "hidden"; });
          requestAnimationFrame(() => place(true));
        });
      } else {
        originals.forEach((o) => { o.style.visibility = "hidden"; });
        place(false);
      }
      window.addEventListener("resize", onResize);

      teardown = () => {
        lowered = true;
        window.removeEventListener("resize", onResize);
        const moving = !reduceMotion && window.innerWidth >= 600 && papers.every((p) => p.src);
        if (moving) papers.forEach((p) => { p.btn.style.transition = `transform ${LOWER_MS}ms ${EASE_IN_OUT}`; pose(p, deskPose(p)); });
        // The originals come back the frame the clones land; the content's
        // own fade is held until then (desk-alt.css, .da-fan-content).
        setTimeout(() => { originals.forEach((o) => { o.style.visibility = ""; }); }, moving ? LOWER_MS : 0);
        setTimeout(() => metaEl?.remove(), 400);
      };
    }

    // panels.js appends the content on push; the papers need it in the
    // document to measure, so set up on the next frame (or when the desk is).
    requestAnimationFrame(() => { if (ctx.ready) setup(); else ctx.whenReady.then(() => requestAnimationFrame(setup)); });

    return {
      veil, content,
      cleanup: () => { teardown(); escOff(); },
      onHoist: (el) => { metaEl = el; },
      update: (state) => state.layer === "series" && state.series === seriesKey,
    };
  };
}

// ── Clips — small objects on the paper ───────────────────────────────────────
// Drawn in their own canvas above the DOM stage with the desk's camera, so a
// binder clip sits on top of the sheet it holds. Each kind loads a model from
// WEB_BASE if one is published (desk-clip-<kind>.glb) and otherwise builds a
// stand-in from primitives, flagged so the stand-in can be told apart.
function makeClipStandIn(kind) {
  const g = new THREE.Group();
  const steel = new THREE.MeshStandardMaterial({ color: 0xb9b2a4, metalness: 0.9, roughness: 0.35 });
  const black = new THREE.MeshStandardMaterial({ color: 0x1c1a17, metalness: 0.2, roughness: 0.6 });
  if (kind === "paperclip") {
    // The classic double loop, lying flat: a tube along a rounded path.
    const w = 0.28, l = 1, r = w / 2, ri = w * 0.3;
    const pts = [
      [0, 0, l - r], [r, 0, l], [w - ri * 0.2, 0, l - r * 0.6], [w, 0, l - r], [w, 0, r], [w - r, 0, 0], [ri, 0, 0], [0, 0, r * 0.9], [0, 0, l - r * 1.6], [ri, 0, l - r * 0.7], [w - ri, 0, l - r * 0.9], [w - ri, 0, r * 1.3], [w - ri - r * 0.6, 0, r * 0.6], [ri * 1.4, 0, r * 0.55], [ri * 1.1, 0, r * 1.2],
    ].map(([x, y, z]) => new THREE.Vector3(x - w / 2, y, z - l / 2));
    const curve = new THREE.CatmullRomCurve3(pts, false, "centripetal", 0.4);
    g.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 160, 0.018, 8, false), steel));
  } else if (kind === "bulldog") {
    // The folded-steel body (a black prism) with two wire handles laid back.
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.62, 3), black);
    body.rotation.z = Math.PI / 2; body.rotation.y = Math.PI / 6; body.position.y = 0.16;
    g.add(body);
    const handle = new THREE.TorusGeometry(0.16, 0.014, 6, 24, Math.PI);
    const h1 = new THREE.Mesh(handle, steel); h1.rotation.x = -Math.PI / 2; h1.position.set(-0.16, 0.05, 0.2); h1.rotation.z = 0.2;
    const h2 = h1.clone(); h2.position.x = 0.16; h2.rotation.z = -0.2;
    g.add(h1, h2);
  } else {
    // A safety pin: a bar, a coil, the clasp.
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.9, 6), steel); bar.rotation.z = Math.PI / 2; g.add(bar);
    const bar2 = bar.clone(); bar2.position.z = 0.09; bar2.scale.x = 0.85; g.add(bar2);
    const coil = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.014, 6, 16), steel); coil.position.set(-0.45, 0, 0.045); coil.rotation.x = Math.PI / 2; g.add(coil);
    const clasp = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.04, 0.12), steel); clasp.position.set(0.42, 0.01, 0.05); g.add(clasp);
  }
  g.traverse((m) => { if (m.isMesh) { m.castShadow = true; } });
  g.userData.standIn = true;
  return g;
}

// ── Brushed steel ────────────────────────────────────────────────────────────
// The table's material for the steel look: a cool grey metal with the
// brushing drawn as long horizontal streaks into a roughness map and a faint
// normal map, and anisotropy along the brush so highlights stretch with it.
function makeBrushedSteel() {
  const W = 1024, H = 1024, r = rng(11);
  const rough = document.createElement("canvas"); rough.width = W; rough.height = H;
  const g = rough.getContext("2d");
  g.fillStyle = "#6a6a6a"; g.fillRect(0, 0, W, H);
  for (let i = 0; i < 9000; i++) {
    const y = r() * H, len = 60 + r() * 500, x = r() * W, v = 40 + Math.floor(r() * 150);
    g.strokeStyle = `rgba(${v},${v},${v},${0.35 + r() * 0.5})`; g.lineWidth = 0.8 + r() * 2.2;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + len, y + (r() - 0.5) * 0.6); g.stroke();
  }
  for (let i = 0; i < 40; i++) {   // the odd scuff and fingerprint
    const x = r() * W, y = r() * H, rad = 20 + r() * 90;
    const grd = g.createRadialGradient(x, y, 0, x, y, rad); grd.addColorStop(0, `rgba(150,150,150,${0.12 + r() * 0.2})`); grd.addColorStop(1, "rgba(150,150,150,0)");
    g.fillStyle = grd; g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  const roughTex = new THREE.CanvasTexture(rough); roughTex.wrapS = roughTex.wrapT = THREE.RepeatWrapping; roughTex.repeat.set(2, 2); roughTex.anisotropy = 8;
  // A normal map from the same streaks: horizontal grooves tilt the normal in Y (green).
  const nrm = document.createElement("canvas"); nrm.width = W; nrm.height = H;
  const n = nrm.getContext("2d"); n.fillStyle = "#8080ff"; n.fillRect(0, 0, W, H);
  for (let i = 0; i < 6000; i++) {
    const y = r() * H, len = 80 + r() * 600, x = r() * W, up = r() > 0.5;
    n.strokeStyle = up ? `rgba(128,${150 + Math.floor(r() * 40)},255,0.35)` : `rgba(128,${80 + Math.floor(r() * 40)},255,0.35)`; n.lineWidth = 0.6 + r();
    n.beginPath(); n.moveTo(x, y); n.lineTo(x + len, y); n.stroke();
  }
  const nrmTex = new THREE.CanvasTexture(nrm); nrmTex.wrapS = nrmTex.wrapT = THREE.RepeatWrapping; nrmTex.repeat.set(2, 2); nrmTex.anisotropy = 8;
  return new THREE.MeshPhysicalMaterial({
    color: 0x3e454d, metalness: 0.78, roughness: 0.55, roughnessMap: roughTex,
    normalMap: nrmTex, normalScale: new THREE.Vector2(0.6, 0.6),
    anisotropy: 0.85, anisotropyRotation: 0, envMapIntensity: 1.0,
  });
}

// ── Init ─────────────────────────────────────────────────────────────────────
export async function initDeskAlt() {
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  document.documentElement.dataset.look = LOOK;
  let readyResolve; const whenReady = new Promise((r) => { readyResolve = r; });
  let fit = { s: 1, tx: 0, ty: 0, regime: regimeName() };
  const ctx = { archive: null, layer: null, reduceMotion, ready: false, whenReady, fit: () => fit };
  configureAltDesk({ seriesSheet: makeFanFactory(ctx) });

  const res = await fetch("/data/archive.json");
  const archive = await res.json();
  const bundles = buildBundles(archive);
  const layer = buildLayer(bundles);
  ctx.archive = archive; ctx.layer = layer;
  fit = layout(layer, regimeName());
  ctx.ready = true; readyResolve();
  const lightEl = layer.querySelector(".desk-alt__light");
  const glowEl = layer.querySelector(".desk-alt__glow");

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
    btn.addEventListener("click", () => { hideHover(); navigate({ layer: "series", series: id, subcollection: null, item: null }); });
  });

  // ── WebGL: the desk ──
  const canvas = document.getElementById("scene");
  if (!canvas) { dismissLoadingScreen(); return; }
  let renderer;
  try { renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true }); }
  catch (e) { dismissLoadingScreen(); return; }
  const setupRenderer = (r) => {
    r.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    r.setSize(window.innerWidth, window.innerHeight);
    r.setClearColor(0x000000, 0);
    r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.0;
  };
  setupRenderer(renderer);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 100);
  camera.position.set(0, 5, 0.5);
  camera.lookAt(0, 0, 0);
  scene.add(new THREE.AmbientLight(look.ambient.color, look.ambient.intensity));
  const L = look.spot;
  const spot = new THREE.SpotLight(L.color, L.intensity, L.distance, L.angle, L.penumbra, L.decay);
  spot.position.set(0, L.height, -2); spot.target.position.set(0, 0, 0);
  spot.castShadow = true; spot.shadow.mapSize.set(2048, 2048);
  spot.shadow.camera.near = 4; spot.shadow.camera.far = 20; spot.shadow.bias = -0.001;
  scene.add(spot, spot.target);

  // ── WebGL: the objects, above the papers ──
  // Everything with height — key, amber, stamp, clips — stands on the paper,
  // so it is drawn in a second canvas over the DOM stage with the same camera
  // and lamp. A shadow-catcher plane at desk level renders only the shadows
  // they cast, so the key darkens the sheet it lies across.
  const objCanvas = document.createElement("canvas");
  objCanvas.className = "desk-alt-objects"; objCanvas.setAttribute("aria-hidden", "true");
  document.body.appendChild(objCanvas);
  let objRenderer = null;
  try { objRenderer = new THREE.WebGLRenderer({ canvas: objCanvas, antialias: true, alpha: true }); setupRenderer(objRenderer); } catch (e) { objRenderer = null; }
  const objScene = new THREE.Scene();
  objScene.add(new THREE.AmbientLight(look.ambient.color, look.ambient.intensity));
  const objSpot = new THREE.SpotLight(L.color, L.intensity, L.distance, L.angle, L.penumbra, L.decay);
  objSpot.position.copy(spot.position);
  objSpot.castShadow = true; objSpot.shadow.mapSize.set(2048, 2048);
  objSpot.shadow.camera.near = 4; objSpot.shadow.camera.far = 20; objSpot.shadow.bias = -0.001;
  objScene.add(objSpot, objSpot.target);
  const catcher = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.ShadowMaterial({ opacity: look.catcherOpacity }));
  catcher.rotation.x = -Math.PI / 2; catcher.receiveShadow = true;
  objScene.add(catcher);
  const clipScene = objScene;   // the clips share it

  // A dark room for the steel to reflect: black, with one cold soft panel
  // overhead and two dimmer ones to the sides, so the brushing catches a long
  // highlight without the table going bright. Each renderer needs its own
  // copy — a PMREM texture belongs to the context that made it.
  if (look.environment === "darkroom") {
    const room = () => {
      const sc = new THREE.Scene(); sc.background = new THREE.Color(0x000000);
      const panel = (w, h, color, pos, rot) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide })); m.position.set(...pos); m.rotation.set(...rot); sc.add(m); };
      panel(6, 2.2, 0x9fb4d6, [0, 6, -1], [Math.PI / 2, 0, 0]);
      panel(3, 1.2, 0x2c3949, [-7, 2, 0], [0, Math.PI / 2, 0]);
      panel(3, 1.2, 0x1d2634, [7, 2, 0], [0, -Math.PI / 2, 0]);
      return sc;
    };
    const p1 = new THREE.PMREMGenerator(renderer);
    scene.environment = p1.fromScene(room(), 0.03).texture; scene.environmentIntensity = 0.32; p1.dispose();
    if (objRenderer) { const p2 = new THREE.PMREMGenerator(objRenderer); objScene.environment = p2.fromScene(room(), 0.03).texture; objScene.environmentIntensity = 1.2; p2.dispose(); }
    // A cold fill from above, dark from below, so the objects outside the
    // beam read as shapes rather than holes.
    scene.add(new THREE.HemisphereLight(0x8fa3c2, 0x05070b, 0.12));
    objScene.add(new THREE.HemisphereLight(0x8fa3c2, 0x05070b, 0.5));
  }

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
    const steel = look.deskMaterial === "brushed-steel" ? makeBrushedSteel() : null;
    desk.traverse((c) => { if (c.isMesh) { c.receiveShadow = true; c.castShadow = true; if (steel) c.material = steel; } });
    scene.add(desk);
  });

  // The objects keep their size relative to the papers: their world scale
  // follows the stage's scale, normalised by how many screen pixels a desk
  // unit covers at this viewport (the camera's vertical field is fixed).
  const HALF_FOV = Math.tan((75 / 2) * Math.PI / 180);
  const REF_PX_PER_UNIT = 900 / (2 * 5 * HALF_FOV);
  const pxPerUnit = () => window.innerHeight / (2 * 5 * HALF_FOV);
  const objectScale = () => fit.s * (REF_PX_PER_UNIT / pxPerUnit());
  // Stage px per desk unit at the reference viewport — what a clip's real
  // length in mm should come to in the scene: mm × PX_PER_MM stage px.
  const unitsPerStagePx = 1 / REF_PX_PER_UNIT;

  const objects = [];     // { id, model, base, cx, cz, posY, anchor() }
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
      const a = o.anchor(); if (!a) return;
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
  function addObject(id, model, cfg, target, anchor) {
    const f = fitModel(model, cfg);
    target.add(model);
    objects.push({ id, model, ...f, anchor });
    if (!id.startsWith("clip:")) model.traverse((ch) => { if (ch.isMesh) { ch.userData.altId = id; clickables.push(ch); } });
    placeObjects();
  }
  const objectAnchor = (id) => () => REGIMES[fit.regime].objects[id];

  loader.load(`${WEB_BASE}${DESK_OBJECTS.guide.file}`, (gltf) => addObject("guide", gltf.scene, { w: 1, h: 1, d: 1, ry: 90 }, objScene, objectAnchor("guide")));
  {
    const geo = new THREE.IcosahedronGeometry(0.5, 2);
    const pos = geo.attributes.position; const r = rng(42); const v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      v.multiplyScalar(0.82 + 0.28 * Math.sin(v.x * 5.1 + 1.3) * Math.cos(v.z * 4.3) + 0.08 * (r() - 0.5)); v.y *= 0.6;
      pos.setXYZ(i, v.x, v.y, v.z);
    }
    geo.computeVertexNormals();
    // Drawn over the papers on a transparent canvas, so no transmission (it
    // would refract an empty scene); a clearcoated, faintly translucent lump.
    const mat = new THREE.MeshPhysicalMaterial({ color: 0xd9902a, emissive: 0x5a2e05, emissiveIntensity: 0.35, roughness: 0.3, metalness: 0, clearcoat: 0.6, clearcoatRoughness: 0.25, transparent: true, opacity: 0.94 });
    addObject("amber", new THREE.Mesh(geo, mat), { w: 0.9, h: 0.6, d: 0.9, ry: -20 }, objScene, objectAnchor("amber"));
  }
  {
    const stamp = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.3, 0.3), new THREE.MeshStandardMaterial({ color: 0x8a8274, roughness: 0.75 }));
    const face = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.26, 0.26), new THREE.MeshStandardMaterial({ color: 0x5f584d, roughness: 0.8 }));
    face.position.x = -0.47;
    stamp.add(body, face);
    addObject("stamp", stamp, { w: 0.9, h: 0.3, d: 0.3, ry: 0 }, objScene, objectAnchor("stamp"));
  }

  // The clips: one object per clip in each bundle, anchored to the bundle's
  // position in the regime in force, sized from the clip's real length.
  const clipLoader = createModelLoader();   // outside the loading screen's manager
  bundles.forEach((b) => (b.clips || []).forEach((c, i) => {
    const id = `clip:${b.id}:${i}`;
    const lenUnits = (DESK_CLIPS[c.kind]?.mm || 40) * PX_PER_MM * unitsPerStagePx * (c.small ? 0.7 : 1);
    const cfg = { w: lenUnits, h: lenUnits, d: lenUnits, ry: c.r };
    const anchor = () => { const R = REGIMES[fit.regime]; const p = R.bundles[b.id]; return p ? { x: R.folder.x + p[0] + c.x, y: R.folder.y + p[1] + c.y } : null; };
    const standIn = makeClipStandIn(c.kind);
    addObject(id, standIn, cfg, clipScene, anchor);
    clipLoader.load(`${WEB_BASE}${DESK_CLIPS[c.kind]?.file || `desk-clip-${c.kind}.glb`}`, (gltf) => {
      const o = objects.find((x) => x.id === id); if (!o) return;
      clipScene.remove(o.model);
      const f = fitModel(gltf.scene, cfg);
      Object.assign(o, { model: gltf.scene, ...f });
      clipScene.add(gltf.scene);
      placeObjects();
    }, undefined, () => {});   // no model published yet: the stand-in stays
  }));

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

  // ── Aim ──
  // wood: the lamp leans toward the pointer and stays over the desk's middle.
  // steel: a flashlight held near the camera, aimed at the point under the
  // cursor (the finger, on touch), with a lag and a slow handheld sway.
  const aimTarget = new THREE.Vector3(0, 0, 0.4);     // where the beam is going
  const aimPoint = new THREE.Vector3(0, 0, 0.4);      // where it is
  const lightPos = { x: 0, z: -2 };
  let pointerOnDesk = false;
  const flashlight = look.aim === "flashlight";
  window.addEventListener("pointermove", (e) => {
    if (!flashlight) return;
    pointer.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
    ray.setFromCamera(pointer, camera);
    if (ray.ray.intersectPlane(plane, hit)) { aimTarget.copy(hit); pointerOnDesk = true; }
  }, { passive: true });
  window.addEventListener("pointerleave", () => { pointerOnDesk = false; });
  document.addEventListener("mouseleave", () => { pointerOnDesk = false; });
  const t0 = performance.now();
  let lastAim = t0;
  function aim(now) {
    const dt = Math.min(0.1, (now - lastAim) / 1000); lastAim = now;
    if (!flashlight) {
      lightPos.x += (mouse.x - lightPos.x) * 0.08;
      lightPos.z += ((-2 + -mouse.y * 0.5) - lightPos.z) * 0.08;
      spot.position.x = lightPos.x; spot.position.z = lightPos.z;
      spot.target.position.set(0, 0, 0);
      return;
    }
    const t = (now - t0) / 1000;
    if (!pointerOnDesk) aimTarget.set(0, 0, 0.4);
    aimPoint.lerp(aimTarget, 1 - Math.exp(-dt * 4.5));   // frame-rate independent lag
    const sway = reduceMotion ? 0 : 1;
    const tx = aimPoint.x + sway * (Math.sin(t * 0.7) * 0.10 + Math.sin(t * 1.9) * 0.025);
    const tz = aimPoint.z + sway * (Math.cos(t * 0.53) * 0.08 + Math.cos(t * 2.3) * 0.02);
    // Held at the viewer's shoulder: above and a little in front of the
    // camera, drifting with the aim so the beam stays steep.
    spot.position.set(0.6 + tx * 0.25, L.height, 1.6 + tz * 0.2);
    spot.target.position.set(tx, 0, tz);
  }

  // ── Atmosphere ──
  // Dust in the beam: a few hundred motes drifting in a column around the
  // beam's axis, so they are only ever where the light is.
  let dust = null;
  if (look.atmosphere.dust) {
    const N = 220, r = rng(7);
    const pos = new Float32Array(N * 3); const seed = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) { seed[i * 3] = r(); seed[i * 3 + 1] = r(); seed[i * 3 + 2] = r(); }
    const geo = new THREE.BufferGeometry(); geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    const sp = document.createElement("canvas"); sp.width = sp.height = 32;
    const sg = sp.getContext("2d"); const grd = sg.createRadialGradient(16, 16, 0, 16, 16, 16);
    grd.addColorStop(0, "rgba(255,255,255,1)"); grd.addColorStop(0.35, "rgba(255,255,255,.55)"); grd.addColorStop(1, "rgba(255,255,255,0)");
    sg.fillStyle = grd; sg.fillRect(0, 0, 32, 32);
    const mat = new THREE.PointsMaterial({ color: 0xdfe9ff, size: 0.05, map: new THREE.CanvasTexture(sp), transparent: true, opacity: 0.38, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true });
    dust = new THREE.Points(geo, mat); dust.userData.seed = seed; dust.frustumCulled = false;
    objScene.add(dust);
  }
  function driftDust(now) {
    if (!dust) return;
    const t = (now - t0) / 1000, pos = dust.geometry.attributes.position.array, seed = dust.userData.seed;
    const axis = spot.target.position, top = spot.position;
    for (let i = 0; i < pos.length; i += 3) {
      const a = seed[i], b = seed[i + 1], c = seed[i + 2];
      const h = 0.02 + 0.5 * ((b + t * 0.012 * (0.5 + c)) % 1); // the lower half of the cone only — the lamp is above the camera
      const radius = 0.04 + 0.9 * h * (0.4 + 0.6 * a);        // the cone widens upward
      const ang = a * Math.PI * 2 + t * 0.15 * (c - 0.5);
      pos[i]     = axis.x + (top.x - axis.x) * h + Math.cos(ang) * radius + Math.sin(t * 0.4 + a * 9) * 0.03;
      pos[i + 1] = 0.05 + (top.y - 0.05) * h * 0.9;
      pos[i + 2] = axis.z + (top.z - axis.z) * h + Math.sin(ang) * radius;
    }
    dust.geometry.attributes.position.needsUpdate = true;
  }
  // Flicker: a slow breath with the odd dip, on the lamp and on the glow.
  let flicker = 1;
  function breathe(now) {
    if (!look.atmosphere.flicker || reduceMotion) return;
    const t = (now - t0) / 1000;
    const dip = Math.sin(t * 13.7) * Math.sin(t * 3.1) > 0.985 ? 0.82 : 1;
    const target = (0.955 + 0.045 * Math.sin(t * 5.3) * Math.sin(t * 0.9)) * dip;
    flicker += (target - flicker) * 0.35;
    spot.intensity = L.intensity * flicker; objSpot.intensity = L.intensity * flicker;
    glowEl.style.setProperty("--flicker", flicker.toFixed(3));
  }
  // Grain over the frame: one noise tile, re-offset every few frames.
  if (look.atmosphere.grain) {
    const c = document.createElement("canvas"); c.width = c.height = 256;
    const g = c.getContext("2d"); const img = g.createImageData(256, 256); const r = rng(3);
    for (let i = 0; i < img.data.length; i += 4) { const v = 96 + Math.floor(r() * 96); img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255; }
    g.putImageData(img, 0, 0);
    const grain = document.createElement("div"); grain.className = "look-grain"; grain.setAttribute("aria-hidden", "true");
    grain.style.backgroundImage = `url(${c.toDataURL()})`;
    document.body.appendChild(grain);
    if (!reduceMotion) { let f = 0; (function jitter() { requestAnimationFrame(jitter); if (++f % 3) return; grain.style.backgroundPosition = `${Math.floor(Math.random() * 256)}px ${Math.floor(Math.random() * 256)}px`; })(); }
  }

  // ── Render ──
  // The lamp on the paper: the DOM stage carries an overlay whose light sits
  // where the lamp falls on the desk (wood: a warm pool; steel: the beam,
  // its radius from the cone's geometry) so the folder is lit as the wood is.
  const lightOnDesk = new THREE.Vector3();
  const edgeOnDesk = new THREE.Vector3();
  let lastLx = -1, lastLy = -1, lastLr = -1;
  function updateLightOverlay() {
    let lx, ly, lr = null;
    if (flashlight) {
      const tp = spot.target.position;
      lightOnDesk.set(tp.x, 0, tp.z).project(camera);
      const d = spot.position.distanceTo(tp);
      const R = Math.tan(L.angle) * d;
      edgeOnDesk.set(tp.x + R, 0, tp.z).project(camera);
      lx = Math.round((lightOnDesk.x + 1) / 2 * window.innerWidth); ly = Math.round((1 - lightOnDesk.y) / 2 * window.innerHeight);
      lr = Math.round(Math.abs(edgeOnDesk.x - lightOnDesk.x) / 2 * window.innerWidth);
    } else {
      lightOnDesk.set(lightPos.x * 0.6, 0, lightPos.z * 0.45 + 0.6).project(camera);
      lx = Math.round((lightOnDesk.x + 1) / 2 * window.innerWidth); ly = Math.round((1 - lightOnDesk.y) / 2 * window.innerHeight);
    }
    if (lx === lastLx && ly === lastLy && lr === lastLr) return;
    lastLx = lx; lastLy = ly; lastLr = lr;
    for (const el of [lightEl, glowEl]) {
      el.style.setProperty("--lx", `${lx}px`); el.style.setProperty("--ly", `${ly}px`);
      if (lr != null) el.style.setProperty("--lr", `${lr}px`);
    }
  }
  function render(now = performance.now()) {
    aim(now);
    spot.target.updateMatrixWorld();
    objSpot.position.copy(spot.position); objSpot.target.position.copy(spot.target.position); objSpot.target.updateMatrixWorld();
    breathe(now); driftDust(now);
    renderer.render(scene, camera);
    if (objRenderer) objRenderer.render(objScene, camera);
    updateLightOverlay();
  }
  if (reduceMotion) render();
  else (function animate(now) { requestAnimationFrame(animate); if (isSceneRenderPaused()) return; render(now); })(performance.now());

  window.addEventListener("resize", () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    if (objRenderer) objRenderer.setSize(window.innerWidth, window.innerHeight);
    fit = layout(layer, regimeName());
    placeObjects();
    lastLx = -1;
    if (reduceMotion) render();
  });
}
