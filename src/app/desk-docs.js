// ── The documents on the desk, as specs ──────────────────────────────────────
// What each bundle holds, typeset from the archive, described for paper.js
// rather than as HTML: the WebGL desk (desk-metal.js) draws these to canvas
// textures. The DOM desk (desk-alt.js) still carries its own HTML version of
// the same documents; when the WebGL desk becomes the desk, that one retires.
//
// Coordinates are stage px (the reference collage at ×1.8). A document:
//   { sub, x, y, rot, w, h, stock, rough, torn, seed, layers }
// with x/y bundle-relative; `sub` names the subcollection it opens (dressing
// has none). Bundles: { id, title, sub, box: [w, h], clips, docs }.

import { imageUrl } from "./image-url.js";

const K = 1.8;
export const S = (v) => Math.round(v * K);
export const PX_PER_MM = 1.5;

export const REGIMES = {
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

function byDateDesc(items) { return [...(items || [])].sort((a, b) => String(b.sort_date || "").localeCompare(String(a.sort_date || ""))); }
function year(d) { return String(d || "").slice(0, 4); }
const thisYear = year(new Date().toISOString());
function mm(dim) { const m = /(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)/.exec(String(dim || "")); return m ? [parseFloat(m[1]), parseFloat(m[2])] : null; }
const RED_BACKGROUND = new Set(["EPH-2026-023", "EPH-2026-026"]);
const BACKING_ID = "EPH-2026-029";

function accumulationSlots(items) {
  // A scan that was cut out carries its cut-out mode in the ?v= token of its
  // front (…c20x2, as panels.js reads it); the cut-out PNG has the sheet's real
  // silhouette, so the desk shows that rather than the rectangular display scan.
  const isCut = (v) => { const qi = v ? v.indexOf("?v=") : -1; return qi !== -1 && /c\d+x\d+$/.test(v.slice(qi + 3)); };
  const usable = (i) => i.assets?.front && mm(i.dimensions) && (isCut(i.assets.front) || !RED_BACKGROUND.has(i.id));
  const pool = byDateDesc(items).filter(usable).map((i) => { const [w, h] = mm(i.dimensions); const cut = isCut(i.assets.front); return { id: i.id, src: imageUrl(i.assets.front, cut ? "cutout-desk" : "display"), fallback: cut ? imageUrl(i.assets.front, "cutout") : null, cutout: cut, w, h, aspect: h / w, area: w * h }; });
  const take = (pred) => { let best = null, bs = Infinity; pool.forEach((c) => { const sc = pred(c); if (sc < bs) { bs = sc; best = c; } }); if (best) pool.splice(pool.indexOf(best), 1); return best; };
  // The backing sheet is pinned rather than auto-picked: the size rule would
  // take the largest sheet in the pool, and this is the one that belongs under
  // the bundle. Falls back to the rule if the record ever leaves the archive.
  const takeId = (id) => { const i = pool.findIndex((c) => c.id === id); return i === -1 ? null : pool.splice(i, 1)[0]; };
  const fits = (c, maxW, maxH) => (c.w <= maxW && c.h <= maxH ? 0 : 1e6);
  const nearAspect = (t, maxW = 999, maxH = 999) => (c) => Math.abs(Math.log(c.aspect) - Math.log(t)) + fits(c, maxW, maxH);
  return {
    backing:  takeId(BACKING_ID) || take((c) => (c.aspect >= 1 && c.w <= 190 ? -c.area : 1e9)),
    receipt:  take(nearAspect(0.55, 125, 80)),
    brochure: take(nearAspect(1.4, 120, 220)),
    longTkt:  take((c) => (c.aspect < 0.5 && c.w >= 120 ? nearAspect(0.33)(c) : 1e9)),
    postcard: take(nearAspect(1.4, 110, 155)),
    small:    take(nearAspect(1.3, 90, 110)),
    bill:     take(nearAspect(0.5, 125, 80)),
  };
}

const head = (text, x = 10, y = 8, extra = {}) => ({ t: "text", x, y, text, font: "mono", size: 7, letterSpacing: "0.8px", uppercase: true, opacity: 0.8, ...extra });
const headSerif = (text, x = 10, y = 8, extra = {}) => ({ t: "text", x, y, text, font: "serif", size: 10, italic: true, ...extra });
const mono = (text, x, y, extra = {}) => ({ t: "text", x, y, text, font: "mono", size: 5.5, lineHeight: 8, opacity: 0.6, ...extra });
const note = (text, x, y, extra = {}) => ({ t: "text", x, y, text, font: "note", size: 15, color: "#25407a", weight: 600, ...extra });
const hand = (text, x, y, extra = {}) => ({ t: "text", x, y, text, font: "hand", size: 11, lineHeight: 19, color: "#25407a", ...extra });
const tape = (x, y, w = 34, h = 11, rotate = -3) => ({ t: "tape", x: S(x), y: S(y), w: S(w), h: S(h), rotate });

export function buildDocBundles(archive) {
  const series = archive.series;
  const sub = (s, k) => series[s]?.subcollections?.[k]?.items || [];
  const labelOf = (k) => series[k]?.label || k;

  const cv = byDateDesc(sub("identity", "cv"));
  const cvLines = cv.slice(0, 4).map((e) => `${year(e.date_start || e.sort_date)}${e.date_end ? "" : "—"}  ${String(e.organization || e.title || "").toLowerCase()}`).join("\n") || "—";
  const years = [...new Set(cv.map((e) => year(e.date_start || e.sort_date)).filter(Boolean))].sort();
  const timetable = (years.length ? years : ["2001", "2010", "2019", "2024", "2026"]).slice(-5).join(" · ");
  const contact = sub("identity", "contact")[0] || {};
  const cardName = contact.name || "B. Fujimoto", cardLine = contact.role_line || "architect · austin";
  // The card on the desk is the typeset calling card from the plate
  // (calling-card.js: 89 × 51 mm, sizes in mm), drawn here in the doc's px.
  const cardLayers = (() => {
    const wpx = S(64), hpx = S(37), k = wpx / 89;             // px per mm on this sheet
    const pad = 6 * k, W = wpx, L = [];
    L.push({ t: "rect", x: 0, y: 0, w: W, h: hpx, color: "#ece6d8" });
    let y = (6 + 4.2) * k;                                      // baselines, as the SVG lays them
    L.push({ t: "text", x: pad, y: y - 3.6 * k, text: cardName, font: "serif", size: 3.6 * k, color: "#1a1510", letterSpacing: "0.1px" });
    if (cardLine) { y += 3.6 * k; L.push({ t: "text", x: pad, y: y - 2.1 * k, text: cardLine, font: "serif", italic: true, size: 2.1 * k, color: "#1a1510", opacity: 0.7 }); }
    y += 3.2 * k;
    L.push({ t: "rect", x: pad, y: y, w: W - pad * 2, h: Math.max(0.5, 0.18 * k), color: "rgba(120,60,50,.4)" });
    const channels = (Array.isArray(contact.channels) ? contact.channels : []).filter((c) => c && c.value);
    const room = hpx - pad - y, step = channels.length ? Math.min(4.4 * k, room / (channels.length + 0.4)) : 0;
    let ly = y + step;
    for (const c of channels) {
      if (c.label) L.push({ t: "text", x: pad, y: ly - 1.7 * k, text: String(c.label), font: "mono", size: 1.7 * k, uppercase: true, letterSpacing: "0.3px", color: "#1a1510", opacity: 0.55 });
      L.push({ t: "text", x: W - pad, y: ly - 2.3 * k, text: String(c.value), font: "mono", size: 2.3 * k, align: "right", color: "#1a1510" });
      ly += step;
    }
    return L;
  })();

  const films = byDateDesc(sub("consumption", "films")), books = byDateDesc(sub("consumption", "books")), music = byDateDesc(sub("consumption", "music")), coffee = byDateDesc(sub("consumption", "coffee")), games = byDateDesc(sub("consumption", "games"));
  const titles = (arr, n) => arr.slice(0, n).map((i) => String(i.title || "").toLowerCase());
  const logText = [titles(films, 2).join(" — "), titles(books, 2).join(", "), [...titles(music, 1), year(films[0]?.sort_date)].filter(Boolean).join(" · ")].filter(Boolean).join("\n");
  const still = films.find((f) => f.assets?.backdrop)?.assets?.backdrop || "";
  const receiptLines = (arr, n, price) => arr.slice(0, n).map((i) => `1  ${String(i.title || "").toLowerCase().slice(0, 16).padEnd(16)} ${price}`).join("\n");
  const bookReceipt = receiptLines(books, 3, "12.00") || "1  —";
  const coffeeReceipt = receiptLines(coffee, 3, " 4.50") || "1  coffee            4.50";
  const record = music[0] ? String(music[0].title || "").toLowerCase() : "side a · side b";
  const game = games[0] ? String(games[0].title || "").toLowerCase() : "slot 1";

  // A 4 × 6 print of one of the photos, chosen afresh on every load: the first
  // gallery image of a random photo entry, at true size (PX_PER_MM), and
  // turned to the picture's orientation once it has loaded (autoOrient).
  const photos = sub("creation", "photos").filter((i) => i.assets?.gallery?.[0]?.file);
  const photoPick = photos.length ? photos[Math.floor(Math.random() * photos.length)] : null;
  const photoSrc = photoPick ? imageUrl(photoPick.assets.gallery[0].file, "display") : null;
  const PRINT_W = Math.round(152.4 * PX_PER_MM), PRINT_H = Math.round(101.6 * PX_PER_MM);

  const A = accumulationSlots(series.accumulation?.items || []);
  const scanDoc = (rec, x, y, rot, extra = {}) => rec ? { sub: null, x, y, rot, w: Math.round(rec.w * PX_PER_MM), h: Math.round(rec.h * PX_PER_MM), stock: "white", seed: 9, cutout: !!rec.cutout, layers: [{ t: "image", src: rec.src, fallback: rec.fallback, x: 0, y: 0, w: Math.round(rec.w * PX_PER_MM), h: Math.round(rec.h * PX_PER_MM) }], ...extra } : null;

  const doc = (sub, x, y, w, h, o = {}) => ({ sub, x: S(x), y: S(y), rot: o.rot || 0, w: S(w), h: S(h), stock: o.stock || "cream", rough: !!o.rough, torn: o.torn || null, cutout: !!o.cutout, seed: o.seed || (x * 7 + y * 13) | 0, layers: o.layers || [] });

  return [
    { id: "identity", title: labelOf("identity"), sub: "cv · timetable · card", box: [S(90), S(300)], clips: [{ kind: "bulldog", x: -14, y: S(48), r: 90 }], docs: [
      doc("cv", -1, 35, 72, 245, { stock: "white", rough: true, layers: [
        headSerif("Curriculum vitae"), mono(cvLines, 10, 28), { t: "rules", top: 78, dense: true, opacity: 0.28 },
        note(`update → ${thisYear}`, 8, 150, { rotate: -6 }), { t: "postage", x: 12, y: 340, rotate: 4 }, { t: "crease", angle: 3, at: 52, strength: 0.8 },
        { t: "stampCircle", x: S(8), y: S(183), d: S(64), text: "LOW DESIGN OFFICE · RECEIVED ·", date: "SEP 06 2026", rotate: -18 },
      ] }),
      doc("biography", -1, -2, 82, 16, { rough: true, layers: [note(timetable, 8, 5, { size: 11, letterSpacing: "1px" }), tape(2, -3, 16, 9, -8), tape(70, -2, 16, 9, 6)] }),
      doc("contact", 10, 248, 64, 37, { stock: "white", layers: cardLayers }),
      doc(null, 4, 282, 100, 11, { torn: "top", seed: 3, layers: [{ t: "rules", opacity: 0.3 }] }),
    ] },

    { id: "consumption", title: labelOf("consumption"), sub: "log · receipts · sleeve · card", box: [S(170), S(160)], clips: [{ kind: "paperclip", x: S(222 - 78) + 10, y: S(12 + 8) + 24, r: 0 }], docs: [
      doc("books", 135, 38, 62, 120, { stock: "thermal", rot: 3, layers: [mono(`books\n—\n${bookReceipt}\n—`, 6, 8), { t: "crease", angle: 0, at: 58, strength: 0.6 }] }),
      doc("music", 107, 104, 72, 72, { stock: "white", rot: -2, layers: [head("record", 6, 6), note(record, 8, 30, { size: 13, maxWidth: 110 }), { t: "disc", x: S(72) - 44, y: S(72) - 44 }] }),
      doc("coffee", -7, 78, 56, 100, { stock: "thermal", rot: -4, layers: [mono(`café\n—\n${coffeeReceipt}\n—\nthank you`, 6, 8), { t: "stain", x: -20, y: 50, w: 70, h: 60, ring: true, opacity: 0.6 }] }),
      doc("games", 27, 126, 70, 44, { rot: 2, layers: [head(`save · ${game}`, 10, 6), mono("slot 1  ▸ 03:12:44\nslot 2  — empty", 8, 22, { opacity: 0.5 })] }),
      doc("films", 7, 8, 155, 140, { stock: "white", rough: true, layers: [
        head("log · films books records", 44, 8), { t: "text", x: 44, y: 24, text: "Log", font: "serif", size: 44, color: "#2a3f66", letterSpacing: "-0.5px" },
        { t: "rules", top: 64, opacity: 0.3 }, hand(logText, 70, 120, { size: 9.5, lineHeight: 17 }),
        { t: "stain", x: 190, y: 170, w: 70, h: 62, ring: true }, note("again in sept.", 8, 200, { size: 16, color: "rgba(50,44,38,.7)" }), { t: "crease", angle: 90, at: 50, strength: 0.9 },
        { t: "photo", x: 200, y: 96, w: 40, h: 40, src: still || null, rotate: -1 }, tape(200 / K - 8, 96 / K - 5, 20, 7, -30),
      ] }),
    ] },

    { id: "creation", title: labelOf("creation"), sub: "sketch · note · print · pattern · strip", box: [S(170), S(190)], clips: [], docs: [
      doc("notes", -5, -10, 90, 70, { rough: true, rot: -3, layers: [hand("a note — kept for the sentence in it, not the page.", 8, 8, { size: 8, lineHeight: 14, maxWidth: 140 }), { t: "crease", angle: 12, at: 40, strength: 0.7 }, { t: "crease", angle: -70, at: 70, strength: 0.5 }] }),
      doc("prototypes", 65, 152, 70, 50, { rot: 4, layers: [{ t: "pattern" }, head("pattern · fold on dashed", 6, 4)] }),
      // The strip is a scan of real film rather than a drawn one, and it is cut
      // out: the sprocket holes are transparent in the image, so the sheet is
      // punched through and the desk shows between them. Sized to the image's
      // own 691 × 1945 and hung from the same bottom edge (192) as the drawn
      // strip it replaces, so its stub still reads below the sketch sheet.
      doc("videos", 123, 63, 46, 129, { rot: 1, cutout: true, layers: [{ t: "image", src: "/desk/filmstrip.webp", x: 0, y: 0, w: S(46), h: S(129) }] }),
      doc("sketches", 5, 2, 155, 180, { rough: true, layers: [
        hand("the surface remembers what the record forgets — a crease, a thumbprint, the place where the pen ran dry. keep the sheet. the note is only its excuse.", 14, 14, { maxWidth: S(155) - 28 }),
        { t: "sketch", x: 0, y: 0, scale: S(155) / 279, paths: ["M40 275 L40 175 L140 140 L140 240 Z", "M140 140 L225 165 L225 265 L140 240", "M180 210 c-10 -40 20 -60 30 -30 c 10 -30 40 -10 22 20 c 30 5 20 40 -8 32 c 5 30 -35 30 -30 5 c -30 10 -40 -25 -14 -27", "M60 300 C100 288, 170 310, 250 292"], opacity: 0.7 },
        { t: "sketch", x: 0, y: 0, scale: S(155) / 279, paths: ["M40 175 L78 152 L78 250 M78 152 L170 118"], dash: [3, 3], opacity: 0.6 },
        { t: "seal", x: 212, y: 268, rotate: -4 }, mono(`untitled · graphite · ${thisYear}`, 12, 296, { opacity: 0.45 }), { t: "crease", angle: -8, at: 34, strength: 0.6 }, tape(-4, -4, 30, 10, -40),
      ] }),
      { sub: "photos", x: S(6), y: S(92), rot: -5, w: PRINT_W, h: PRINT_H, stock: "white", seed: 4, gloss: true, autoOrient: true, layers: [{ t: "photo", x: 0, y: 0, w: PRINT_W, h: PRINT_H, src: photoSrc, border: Math.round(3 * PX_PER_MM), fit: "cover" }] },
      doc(null, 100, 167, 38, 15, { stock: "thermal", torn: "right", seed: 5, layers: [note("print ↑", 6, -2)] }),
    ] },

    { id: "labor", title: labelOf("labor"), sub: "drawing · specification · transmittal", box: [S(140), S(262)], clips: [], docs: [
      doc(null, 8, 4, 85, 65, { stock: "white", torn: "bottom", seed: 11, layers: [head("specification · 09 21 00"), mono("2.1  gypsum board assemblies\n2.2  metal framing, 20 ga\n2.3  acoustic insulation\n3.1  install per mfr. instr.", 10, 20, { opacity: 0.5 }), { t: "rules", top: 64, dense: true, opacity: 0.25 }, { t: "stampBox", x: S(85) - 70, y: 8, text: "ISSUED", rotate: -8 }] }),
      doc(null, 3, 49, 110, 200, { stock: "diazo", rough: true, layers: [
        { t: "diazoLines" }, { t: "fold", dir: "h", at: S(100) }, { t: "fold", dir: "v", at: S(55) },
        { t: "sketch", x: 0, y: 0, scale: S(110) / 198, stroke: "rgba(205,220,240,.85)", width: 1, opacity: 0.9, paths: ["M30 30 h136 v120 h-136 z", "M30 90 H166 M96 30 V150 M60 30 V90 M132 90 V150", "M40 40 h20 M40 44 h14", "M30 200 H166 M30 200 L30 300 L166 300 L166 200", "M30 300 L98 250 L166 300", "M60 260 v40 M120 260 v40 M60 260 h20 v20 h-20 z M110 260 h20 v20 h-20 z"] },
        { t: "sketch", x: 0, y: 0, scale: S(110) / 198, stroke: "rgba(205,220,240,.85)", width: 0.6, opacity: 0.9, dash: [6, 3], paths: ["M20 330 H178"] },
        { t: "titleBlock", w: Math.round(S(110) * 0.44), h: Math.round(S(200) * 0.14), title: labelOf("labor"), sub: "a-101 · plan · record" },
        note("rev 2 — see transmittal", 14, 300, { color: "rgba(255,255,255,.7)", rotate: -2 }), { t: "wearCorner" }, tape(96, -3, 18, 8, 4),
      ] }),
      doc(null, 48, 189, 85, 65, { stock: "thermal", rough: true, layers: [head("transmittal"), mono("1  a-101   plan\n2  a-201   elevations\n3  a-501   details\n—  issued for record", 10, 20), hand("bf", 70, 58, { size: 13, rotate: -8 }), { t: "crease", angle: 0, at: 46, strength: 0.5 }] }),
    ] },

    { id: "accumulation", title: labelOf("accumulation"), sub: "map · receipt · brochure · ticket · postcard · bill", box: [297, 540], clips: [{ kind: "bulldog", x: 24, y: 550, r: 0, small: true }, { kind: "paperclip", x: 36, y: 552, r: 0 }, { kind: "pin", x: 180, y: 6, r: -20 }], docs: [
      scanDoc(A.backing, 22, 44, 0.5), scanDoc(A.brochure, 34, 96, 0.6), scanDoc(A.receipt, 12, -4, -1), scanDoc(A.small, 40, 330, -1),
      A.longTkt && { ...scanDoc(A.longTkt, 118, 262, 90), x: 118 + Math.round(A.longTkt.h * PX_PER_MM) / 2 - Math.round(A.longTkt.w * PX_PER_MM) / 2, y: 262 + Math.round(A.longTkt.w * PX_PER_MM) / 2 - Math.round(A.longTkt.h * PX_PER_MM) / 2 },
      scanDoc(A.postcard, 297 - 96, 296, 1), scanDoc(A.bill, 126, 442, -1),
    ].filter(Boolean) },
  ];
}
