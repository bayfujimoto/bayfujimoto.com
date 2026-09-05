// CV entry mockups — the six real records (src/content/identity/cv/) and the
// shared builders every page uses: catalog-card rows in the live grammar,
// the contact strip, and the three plate treatments under study (timeline,
// specimen, reproduction). Structure and plate are independent choices.

export const ENTRIES = [
  { id: "CV-2026-006", title: "Low Design Office", organization: "Low Design Office", role: "Junior Designer",
    category: "employment", display_date: "August 2025 –", date_start: "2025-08-06", date_end: null, mark: "LDO",
    tags: ["austin", "remote"], note: "" },
  { id: "CV-2026-002", title: "Bachelor of Architecture", organization: "Rice University", role: "",
    category: "education", display_date: "2024 – 2025", date_start: "2024-09-01", date_end: "2025-05-01", mark: "Rice",
    related: ["CV-2026-001"], note: "" },
  { id: "CV-2026-003", title: "RSAP Study Abroad", organization: "Rice University", role: "Student",
    category: "education", display_date: "August – December 2024", date_start: "2024-08-31", date_end: "2024-12-20", mark: "RSAP",
    tags: ["paris", "france"], note: "Rice School of Architecture, Paris" },
  { id: "CV-2026-005", title: "SHoP Architects", organization: "SHoP Architects", role: "Junior Designer",
    category: "employment", display_date: "Sept 2023 – June 2024", date_start: "2023-09-02", date_end: "2024-06-02", mark: "SHoP",
    tags: ["nyc"],
    note: "Supported project team through the schematic and design development phases for high-end residential projects. Completed sheets for the finished design development package in Revit.\n\nCreated design studies for facade iterations and worked with consultants on coordinating facade details.\n\nParticipated in consultant meetings for landscape, MEP, civil, facade, and structure.\n\nAssisted the fabrication team with developing physical models." },
  { id: "CV-2026-004", title: "Weiss Architecture", organization: "Weiss Architecture", role: "Design Intern",
    category: "employment", display_date: "2021 – 2023", date_start: "2021-07-01", date_end: "2023-08-01", mark: "Weiss",
    tags: ["summer"],
    note: "Independently translated 2D AutoCAD drawings into a detailed 3D model and produced high-quality renderings to support design visualization and client presentations.\n\nParticipated in site visits and client presentations." },
  { id: "CV-2026-001", title: "Bachelor of Arts in Architecture", organization: "Rice University", role: "",
    category: "education", display_date: "2019 – 2023", date_start: "2019-09-01", date_end: "2023-05-01", mark: "Rice",
    note: "" },
];

export const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
};

const yearOf = (d) => new Date(d).getFullYear() + (new Date(d).getMonth()) / 12;
export const NOW = 2026 + 8 / 12; // September 2026
export const Y0 = 2019, Y1 = 2027;

export function spanText(e) {
  const a = new Date(e.date_start), b = e.date_end ? new Date(e.date_end) : new Date("2026-09-05");
  const months = Math.round((b - a) / (1000 * 60 * 60 * 24 * 30.44));
  if (months < 12) return `${months} months`;
  const y = Math.floor(months / 12), m = months % 12;
  return `${y} year${y > 1 ? "s" : ""}${m ? ` ${m} month${m > 1 ? "s" : ""}` : ""}${e.date_end ? "" : " · ongoing"}`;
}

// ── Fields column, one entry ─────────────────────────────────────────────────
export function fieldsFor(e, { compact = false } = {}) {
  const frag = document.createDocumentFragment();
  const pair = (label, value, mono) => {
    const f = document.createDocumentFragment();
    f.appendChild(el("span", "overlay-label", label));
    f.appendChild(el("span", `overlay-value${mono ? " overlay-value--mono" : ""}`, value));
    return f;
  };
  const row = (cls) => { const r = el("div", "item-card__row" + (cls ? " " + cls : "")); frag.appendChild(r); return r; };
  const single = (label, value, mono) => { if (!value) return; row().appendChild(pair(label, value, mono)); };

  const acc = row("item-card__row--split item-card__row--accession");
  acc.appendChild(pair("ID", e.id, true));
  acc.appendChild(pair("type", "cv-entry", true));

  const t = row("item-card__row--title");
  t.appendChild(el("span", "overlay-label", "title"));
  t.appendChild(el("h2", "item-card__title", e.title));

  single("organization", e.organization, false);
  single("role", e.role, false);
  single("category", e.category, true);
  single("date", e.display_date, true);
  single("span", spanText(e), true);

  if (e.note) {
    const note = el("div", "item-card__note");
    note.appendChild(el("span", "overlay-label", "note"));
    const body = el("div", "item-card__note-body");
    e.note.split(/\n\n+/).forEach(p => body.appendChild(el("p", null, p)));
    note.appendChild(body);
    frag.appendChild(note);
  }
  if (e.related?.length || e.tags?.length) {
    const riders = el("div", "item-card__riders");
    if (e.related?.length) {
      riders.appendChild(el("span", "overlay-label", "see also"));
      e.related.forEach(id => {
        const r = ENTRIES.find(x => x.id === id);
        riders.appendChild(el("button", "item-card__rider", r ? r.title : id));
      });
    }
    if (e.tags?.length) {
      riders.appendChild(el("span", "overlay-label", "tags"));
      riders.appendChild(el("span", "overlay-value overlay-value--mono", e.tags.join(" · ")));
    }
    frag.appendChild(riders);
  }
  return frag;
}

// ── Strip frames ─────────────────────────────────────────────────────────────
export function tile(e) {
  const t = el("div", "cv-tile");
  t.appendChild(el("span", "cv-tile__mark", e.mark));
  const y = el("span", "cv-tile__years");
  const a = e.date_start.slice(0, 4), b = e.date_end ? e.date_end.slice(2, 4) : "";
  y.textContent = b ? (a.slice(2) === b ? a : `${a}–${b}`) : `${a}–`;
  t.appendChild(y);
  return t;
}

// The entry's duration as a bar on a tiny year rail, top = most recent.
export function spanGlyph(e, all = ENTRIES) {
  const NS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("viewBox", "0 0 40 40");
  svg.setAttribute("class", "cv-span");
  const y = (yr) => 4 + (Y1 - yr) / (Y1 - Y0) * 32;
  const rail = document.createElementNS(NS, "line");
  rail.setAttribute("x1", 20); rail.setAttribute("x2", 20); rail.setAttribute("y1", 4); rail.setAttribute("y2", 36);
  rail.setAttribute("class", "rail");
  svg.appendChild(rail);
  for (const o of all) {
    const r = document.createElementNS(NS, "rect");
    const a = yearOf(o.date_start), b = o.date_end ? yearOf(o.date_end) : NOW;
    r.setAttribute("x", o === e ? 14 : 17); r.setAttribute("width", o === e ? 12 : 6);
    r.setAttribute("y", y(b)); r.setAttribute("height", Math.max(1.5, y(a) - y(b)));
    r.setAttribute("class", o === e ? "bar" : "bar bar--dim");
    svg.appendChild(r);
  }
  return svg;
}

export function strip(entries, current, onPick, { frame = tile } = {}) {
  const s = el("div", "item-card__strip");
  s.setAttribute("role", "tablist");
  s.setAttribute("aria-label", "entries");
  entries.forEach((e, i) => {
    const b = el("button", "item-card__strip-btn");
    b.type = "button";
    b.setAttribute("role", "tab");
    b.setAttribute("aria-current", String(e === current));
    b.setAttribute("aria-label", `Entry ${i + 1} of ${entries.length}: ${e.title}`);
    b.appendChild(frame(e));
    b.addEventListener("click", () => onPick(e));
    s.appendChild(b);
  });
  return s;
}

// ── Plates ───────────────────────────────────────────────────────────────────
// Timeline: the calibrated plate's field with a year scale on the left, the
// entries as bars in two columns (education | employment), the selected one
// at full strength. One year per major division; open-ended spans dashed.
export function timelinePlate(current, all = ENTRIES) {
  const NS = "http://www.w3.org/2000/svg";
  const S = 416, ORG = 34, INNER = S - ORG - 14;
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("viewBox", `0 0 ${S} ${S}`);
  svg.setAttribute("class", "item-card__plate-svg cv-timeline");
  const mk = (tag, attrs) => { const n = document.createElementNS(NS, tag); for (const k in attrs) n.setAttribute(k, attrs[k]); svg.appendChild(n); return n; };
  mk("rect", { x: ORG, y: ORG, width: INNER, height: INNER, class: "plate-edge" });
  const y = (yr) => ORG + (Y1 - yr) / (Y1 - Y0) * INNER;
  for (let yr = Y0; yr <= Y1; yr++) {
    const yy = y(yr);
    mk("line", { x1: ORG, x2: ORG + 10, y1: yy, y2: yy, class: "plate-tick plate-tick--major" });
    if (yr < Y1) {
      const t = mk("text", { x: ORG - 4, y: yy - 3, "text-anchor": "end" }); t.textContent = String(yr);
      for (let q = 1; q < 4; q++) { const qy = y(yr + q / 4); mk("line", { x1: ORG, x2: ORG + (q === 2 ? 6 : 4), y1: qy, y2: qy, class: "plate-tick" }); }
    }
  }
  const cols = { education: ORG + INNER * 0.27, employment: ORG + INNER * 0.68 };
  for (const [k, cx] of Object.entries(cols)) {
    const t = mk("text", { x: cx, y: ORG - 6, "text-anchor": "middle", class: "col-label" }); t.textContent = k;
    mk("line", { x1: cx, x2: cx, y1: ORG, y2: ORG + INNER, class: "plate-tick", "stroke-dasharray": "1 5" });
  }
  const nowY = y(NOW);
  mk("line", { x1: ORG, x2: ORG + INNER, y1: nowY, y2: nowY, class: "now" });
  const nt = mk("text", { x: ORG + INNER - 4, y: nowY - 3, "text-anchor": "end" }); nt.textContent = "now";
  // lay out overlapping bars side by side within a column
  const lanes = {};
  for (const e of all) {
    const a = yearOf(e.date_start), b = e.date_end ? yearOf(e.date_end) : NOW;
    const cx = cols[e.category] || ORG + INNER / 2;
    const key = e.category;
    lanes[key] ||= [];
    let lane = 0;
    while (lanes[key].some(o => o.lane === lane && !(b <= o.a || a >= o.b))) lane++;
    lanes[key].push({ a, b, lane });
    const w = 22, gap = 8;
    const x = cx - w / 2 + lane * (w + gap) - (lanes[key].filter(o => o.lane > 0).length ? (w + gap) / 2 : 0) * 0;
    mk("rect", { x, y: y(b), width: w, height: Math.max(2, y(a) - y(b)),
      class: `bar${e === current ? " bar--current" : ""}${e.date_end ? "" : " bar--open"}` });
    if (e === current) {
      const l = mk("text", { x: x + w + 8, y: (y(a) + y(b)) / 2 + 3 }); l.textContent = e.mark;
    }
  }
  return svg;
}

export function specimenPlate(e) {
  const p = el("div", "cv-specimen");
  p.appendChild(el("div", "cv-specimen__org", e.organization));
  p.appendChild(el("hr", "cv-specimen__rule"));
  if (e.role) p.appendChild(el("div", "cv-specimen__role", e.role));
  else p.appendChild(el("div", "cv-specimen__role", e.title));
  p.appendChild(el("div", "cv-specimen__dates", e.display_date));
  p.appendChild(el("div", "cv-specimen__stamp", e.category));
  return p;
}

export function documentPlate(e) {
  const d = el("div", "cv-doc");
  d.appendChild(el("div", "head", e.organization));
  d.appendChild(el("div", "seal"));
  return d;
}

export function noReproductionPlate() {
  const NS = "http://www.w3.org/2000/svg";
  const S = 416, ORG = 34, INNER = S - ORG - 14;
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("viewBox", `0 0 ${S} ${S}`);
  svg.setAttribute("class", "item-card__plate-svg");
  const mk = (tag, attrs) => { const n = document.createElementNS(NS, tag); for (const k in attrs) n.setAttribute(k, attrs[k]); svg.appendChild(n); return n; };
  mk("rect", { x: ORG, y: ORG, width: INNER, height: INNER, class: "plate-edge" });
  for (let i = 0; i <= 13; i++) {
    const p = ORG + i / 13 * INNER, major = i % 2 === 0;
    mk("line", { x1: ORG, x2: ORG + (major ? 10 : 5), y1: p, y2: p, class: "plate-tick" + (major ? " plate-tick--major" : "") });
    mk("line", { y1: ORG, y2: ORG + (major ? 10 : 5), x1: p, x2: p, class: "plate-tick" + (major ? " plate-tick--major" : "") });
  }
  return svg;
}

// ── Card shell (live markup) ─────────────────────────────────────────────────
export function cardShell({ plateNote, photoSplit = true }) {
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

export function footControls(foot, { onPrev, onNext, counter }) {
  const controls = el("div", "item-card__plate-controls");
  const prev = el("button", "item-card__flip", "↑ prev"); prev.type = "button"; prev.addEventListener("click", onPrev);
  const next = el("button", "item-card__flip", "next ↓"); next.type = "button"; next.addEventListener("click", onNext);
  const label = el("span", "item-card__asset-label", counter);
  controls.append(prev, next, label);
  foot.appendChild(controls);
  return label;
}

export function chrome(root, crumbs, metaTitle, metaSub) {
  const bc = el("nav", "layer-breadcrumb");
  bc.setAttribute("aria-label", "breadcrumb");
  bc.style.zIndex = 45;
  crumbs.forEach((c, i) => {
    if (i) bc.appendChild(el("span", "sep", "/"));
    bc.appendChild(el("span", i === crumbs.length - 1 ? "current" : null, c));
  });
  root.appendChild(bc);
  const meta = el("div", "layer-meta");
  meta.style.zIndex = 45;
  meta.appendChild(el("h1", "overlay-title", metaTitle));
  meta.appendChild(el("p", "overlay-subtitle", metaSub));
  root.appendChild(meta);
}
