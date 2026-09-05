// Contact mockups — the three real records (src/content/identity/contact/) and
// shared builders: the live card shell and row grammar (as mockups/cv-entries),
// plus the one thing the Contact studies add: a card drawn ON the mm plate at
// true scale — a calling card (89 × 51 mm) or an index card (127 × 76 mm).

export const CHANNELS = [
  { id: "CONTACT-2026-001", label: "email",      title: "Email",      value: "hello@bayfujimoto.com", href: "mailto:hello@bayfujimoto.com" },
  { id: "CONTACT-2026-002", label: "instagram",  title: "Instagram",  value: "@bayfujimoto",          href: "https://instagram.com/bayfujimoto" },
  { id: "CONTACT-2026-003", label: "letterboxd", title: "Letterboxd", value: "@bayf",                 href: "https://letterboxd.com/bayf" },
];
export const NAME = "Bay Fujimoto";
export const ROLE = "architect · austin";
export const NOTE = "Replies within the week. Mail is read; DMs less so.";

export const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
};

// ── Fields helpers (live grammar) ────────────────────────────────────────────
export function rowBuilders(fields) {
  const pair = (label, value, mono, href) => {
    const f = document.createDocumentFragment();
    f.appendChild(el("span", "overlay-label", label));
    let v;
    if (href) { v = el("a", `overlay-value overlay-value--mono channel-link`, value); v.href = href; }
    else v = el("span", `overlay-value${mono ? " overlay-value--mono" : ""}`, value);
    f.appendChild(v);
    return f;
  };
  const row = (cls) => { const r = el("div", "item-card__row" + (cls ? " " + cls : "")); fields.appendChild(r); return r; };
  const single = (label, value, mono, href) => { if (!value) return; row().appendChild(pair(label, value, mono, href)); };
  const split = (a, b, cls) => { const r = row("item-card__row--split" + (cls ? " " + cls : "")); r.appendChild(pair(...a)); r.appendChild(pair(...b)); };
  const title = (t) => { const r = row("item-card__row--title"); r.appendChild(el("span", "overlay-label", "title")); r.appendChild(el("h2", "item-card__title", t)); };
  const note = (label, text) => { const n = el("div", "item-card__note"); n.appendChild(el("span", "overlay-label", label)); n.appendChild(el("p", null, text)); fields.appendChild(n); };
  return { pair, row, single, split, title, note };
}

// ── The mm plate, as buildPlate draws it, with a card at true scale ──────────
// sidePx 416, INSET 32; spanMM is the visible field (the live card opens at the
// zoom that makes the object's larger side ~3/4 of the field).
const NS = "http://www.w3.org/2000/svg";
export function mmPlate({ spanMM, major, minor, draw }) {
  const S = 416, INSET = 32, origin = INSET, extent = S - INSET;
  const px = (mm) => (mm / spanMM) * extent;
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("class", "item-card__plate-svg");
  svg.setAttribute("viewBox", `0 0 ${S} ${S}`);
  const mk = (tag, attrs, parent = svg) => { const n = document.createElementNS(NS, tag); for (const k in attrs) if (attrs[k] != null) n.setAttribute(k, attrs[k]); parent.appendChild(n); return n; };
  const text = (x, y, str, cls, anchor = "start", size) => { const t = mk("text", { x, y, class: cls, "text-anchor": anchor }); if (size) t.style.fontSize = `${size}px`; t.textContent = str; return t; };
  mk("rect", { x: 0.5, y: 0.5, width: S - 1, height: S - 1, class: "plate-edge" });
  const tick = (p, horizontal, isMajor) => {
    const t = isMajor ? 11 : 6;
    if (horizontal) mk("line", { x1: p, y1: 0, x2: p, y2: t, class: "plate-tick" + (isMajor ? " plate-tick--major" : "") });
    else mk("line", { x1: 0, y1: p, x2: t, y2: p, class: "plate-tick" + (isMajor ? " plate-tick--major" : "") });
  };
  for (let mm = 0; mm <= spanMM + 1e-6; mm += minor) {
    const p = origin + px(mm);
    if (p > S + 0.5) break;
    const isMajor = Math.round(mm / major) * major === Math.round(mm);
    tick(p, true, isMajor); tick(p, false, isMajor);
    if (isMajor) {
      text(p, 11 + 11, String(Math.round(mm)), null, "middle");
      if (mm > 0) text(11 + 3, p + 3, String(Math.round(mm)), null, "start");
    }
  }
  draw({ svg, mk, text, px, origin });
  return { svg, note: `1 : ${(325 / spanMM).toFixed(1).replace(/\.0$/, "")} · ${Math.round(spanMM)} mm` };
}

// A calling card, 89 × 51 mm, at the origin. `lines` are [label, value] pairs.
export function callingCard({ mk, text, px, origin }, { name = NAME, role = ROLE, lines = [], verso = false }) {
  const W = px(89), H = px(51), x = origin, y = origin;
  mk("rect", { x, y, width: W, height: H, class: "plate-card" + (verso ? " plate-card--verso" : "") });
  if (verso) {
    text(x + W / 2, y + H / 2 + 3, NOTE, "plate-card__role", "middle", 8.5);
    return;
  }
  const pad = px(6);
  text(x + pad, y + pad + 12, name, "plate-card__name", "start", 14);
  text(x + pad, y + pad + 24, role, "plate-card__role", "start", 8);
  mk("line", { x1: x + pad, x2: x + W - pad, y1: y + pad + 32, y2: y + pad + 32, class: "plate-card__rule" });
  let ly = y + pad + 32 + 14;
  for (const [label, value] of lines) {
    text(x + pad, ly, label, "plate-card__label", "start", 6.5);
    text(x + W - pad, ly, value, "plate-card__line", "end", 8.5);
    ly += 13;
  }
}

// An index card, 127 × 76 mm, ruled, with a tab. One channel typed on it.
export function indexCard({ mk, text, px, origin }, { label, value, tabIndex = 0, tabCount = 3 }) {
  const W = px(127), H = px(76), x = origin, y = origin + px(8);
  const tabW = W / tabCount, tabH = px(8);
  mk("rect", { x: x + tabIndex * tabW, y: y - tabH + 1, width: tabW, height: tabH, class: "plate-card__tab" });
  text(x + tabIndex * tabW + tabW / 2, y - tabH / 2 + 3, label, "plate-card__type", "middle", 6.5);
  mk("rect", { x, y, width: W, height: H, class: "plate-card plate-card--index" });
  mk("line", { x1: x, x2: x + W, y1: y + px(14), y2: y + px(14), class: "plate-card__rule plate-card__rule--head" });
  for (let i = 1; i <= 7; i++) {
    const ry = y + px(14) + i * px(8);
    if (ry < y + H - 4) mk("line", { x1: x, x2: x + W, y1: ry, y2: ry, class: "plate-card__rule" });
  }
  text(x + px(8), y + px(14) - 6, NAME, "plate-card__name", "start", 12);
  text(x + px(8), y + px(14) + px(8) - 4, `${label}:`, "plate-card__typed", "start", 8);
  text(x + px(8), y + px(14) + px(16) - 4, value, "plate-card__typed", "start", 9.5);
}

// ── Card shell (live markup) ─────────────────────────────────────────────────
export function cardShell({ plateNote, photoSplit = false }) {
  const wrap = el("div", "item-card-wrap");
  const card = el("article", "item-card" + (photoSplit ? " item-card--photo" : ""));
  const fieldsCol = el("div", "item-card__fields");
  const fields = el("div", "item-card__fields-scroll");
  fieldsCol.appendChild(fields);
  const plateCol = el("div", "item-card__plate");
  const head = el("div", "item-card__plate-head");
  head.appendChild(el("span", "overlay-label", "plate"));
  const note = el("span", "item-card__scale-note", plateNote);
  head.appendChild(note);
  const field = el("div", "item-card__field");
  const foot = el("div", "item-card__plate-foot");
  plateCol.append(head, field, foot);
  card.append(fieldsCol, plateCol);
  wrap.appendChild(card);
  return { wrap, card, fields, plateCol, field, foot, note };
}

export function strip(items, current, onPick, frame) {
  const s = el("div", "item-card__strip");
  s.setAttribute("role", "tablist");
  items.forEach((c, i) => {
    const b = el("button", "item-card__strip-btn");
    b.type = "button"; b.setAttribute("role", "tab");
    b.setAttribute("aria-current", String(c === current));
    b.setAttribute("aria-label", `Channel ${i + 1} of ${items.length}: ${c.title}`);
    b.appendChild(frame(c, i));
    b.addEventListener("click", () => onPick(c));
    s.appendChild(b);
  });
  return s;
}

export function footControls(foot, { onPrev, onNext, counter, extra = [] }) {
  const controls = el("div", "item-card__plate-controls");
  if (onPrev) { const p = el("button", "item-card__flip", "↑ prev"); p.type = "button"; p.addEventListener("click", onPrev); controls.appendChild(p); }
  if (onNext) { const n = el("button", "item-card__flip", "next ↓"); n.type = "button"; n.addEventListener("click", onNext); controls.appendChild(n); }
  for (const [label, fn] of extra) { const b = el("button", "item-card__flip", label); b.type = "button"; b.addEventListener("click", fn); controls.appendChild(b); }
  const lab = el("span", "item-card__asset-label", counter);
  controls.appendChild(lab);
  foot.appendChild(controls);
  return lab;
}

export function chrome(root, crumbs, metaTitle, metaSub) {
  const bc = el("nav", "layer-breadcrumb"); bc.setAttribute("aria-label", "breadcrumb"); bc.style.zIndex = 45;
  crumbs.forEach((c, i) => { if (i) bc.appendChild(el("span", "sep", "/")); bc.appendChild(el("span", i === crumbs.length - 1 ? "current" : null, c)); });
  root.appendChild(bc);
  const meta = el("div", "layer-meta"); meta.style.zIndex = 45;
  meta.appendChild(el("h1", "overlay-title", metaTitle));
  meta.appendChild(el("p", "overlay-subtitle", metaSub));
  root.appendChild(meta);
}
