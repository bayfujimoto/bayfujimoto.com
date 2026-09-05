// ── Timeline plate — a set of dated records, measured in years ───────────────
// The CV card's plate. Its records have nothing to scan, so the plate measures
// what they are — spans of time — in the calibrated plate's own dress: the box
// edge on the container border, ticks hanging inward from the left edge with
// the year beside each, a ratio-style note in the head. Time runs up the
// plate (most recent at the top, as the strip is ordered); each entry is a
// bar in its category's column; the selected entry is lit and named; the rest
// are outlined. Open-ended spans run, dashed, to a `now` rule. Clicking a bar
// steps the card to that entry — the plate is a second index onto the set.
// No zoom, no pan: a career fits the square. docs/cv-inspection-card-plan.md.

const NS = "http://www.w3.org/2000/svg";
const SIDE = 416;      // viewBox side, as the mm plate
const INSET = 32;      // gutter for the inward ticks and their labels
const CATEGORY_ORDER = ["employment", "education", "exhibition", "publication", "award", "other"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const yearOf = (iso) => {
  const d = iso ? new Date(iso) : null;
  return d && !isNaN(d) ? d.getFullYear() + d.getMonth() / 12 + (d.getDate() - 1) / 365 : null;
};

/**
 * mountTimelinePlate(field, { frames, range, setNote, onPick })
 *   frames  — the entries (records with date_start / date_end / category / key)
 *   range   — { start, end } whole years from the build; falls back to the data
 *   setNote — prints in the plate head's scale-note slot
 *   onPick  — called with a frame when its bar is clicked
 * Returns the frames-mode plate contract: { show(frame), prefetch(), dispose() }.
 */
export function mountTimelinePlate(field, { frames = [], range = null, setNote = () => {}, onPick = null } = {}) {
  const now = new Date();
  const nowYear = yearOf(now.toISOString());
  const spans = frames.map((f) => {
    const a = yearOf(f.date_start);
    const b = f.date_end ? yearOf(f.date_end) : nowYear;
    return { frame: f, a: a ?? b, b: b ?? a, open: !f.date_end };
  }).filter((s) => s.a != null);

  let start = range?.start, end = range?.end;
  if (!(start < end)) {
    start = Math.floor(Math.min(...spans.map((s) => s.a)));
    end = Math.ceil(Math.max(...spans.map((s) => s.b))) + 1;
  }
  const years = end - start;
  const origin = INSET, extent = SIDE - INSET;
  const y = (yr) => origin + ((end - yr) / years) * extent;   // top = end
  const yearAt = (py) => end - ((py - origin) / extent) * years;

  const categories = CATEGORY_ORDER.filter((c) => spans.some((s) => (s.frame.category || "other") === c));
  const colW = extent / Math.max(1, categories.length);
  const colX = (cat) => origin + colW * (categories.indexOf(cat === undefined ? "other" : cat) + 0.5);

  // Lanes: bars that overlap in time within a column step sideways.
  const lanes = new Map();
  for (const s of spans) {
    const cat = s.frame.category || "other";
    const list = lanes.get(cat) || [];
    let lane = 0;
    while (list.some((o) => o.lane === lane && !(s.b <= o.a || s.a >= o.b))) lane++;
    s.lane = lane;
    list.push(s);
    lanes.set(cat, list);
  }

  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("class", "item-card__plate-svg item-card__plate-svg--timeline");
  svg.setAttribute("viewBox", `0 0 ${SIDE} ${SIDE}`);
  svg.setAttribute("role", "img");
  field.appendChild(svg);
  field.classList.add("item-card__field--timeline");

  const mk = (tag, attrs, parent = svg) => {
    const n = document.createElementNS(NS, tag);
    for (const k in attrs) if (attrs[k] != null) n.setAttribute(k, attrs[k]);
    parent.appendChild(n);
    return n;
  };
  const text = (x, y, str, anchor, cls) => {
    const t = mk("text", { x, y, "text-anchor": anchor, class: cls });
    t.textContent = str;
    return t;
  };

  // Box edge on the container borders, as the mm plate.
  mk("rect", { x: 0.5, y: 0.5, width: SIDE - 1, height: SIDE - 1, class: "plate-edge" });

  // Year scale: ticks hang inward from the left edge, major per year with the
  // year beside it, minor per quarter.
  for (let yr = start; yr <= end; yr++) {
    const yy = y(yr);
    mk("line", { x1: 0, x2: 11, y1: yy, y2: yy, class: "plate-tick plate-tick--major" });
    if (yr < end) {
      text(14, yy - 4, String(yr), "start");
      for (let q = 1; q < 4; q++) {
        const qy = y(yr + q / 4);
        mk("line", { x1: 0, x2: 6, y1: qy, y2: qy, class: "plate-tick" });
      }
    }
  }

  // Category columns: a label in the top gutter and a faint centre line.
  for (const cat of categories) {
    const cx = colX(cat);
    text(cx, INSET - 10, cat, "middle", "timeline-column");
    mk("line", { x1: cx, x2: cx, y1: origin, y2: SIDE, class: "plate-tick timeline-column-line" });
  }

  // `now` — the one thing on the card that moves without a build.
  if (nowYear > start && nowYear < end) {
    const ny = y(nowYear);
    mk("line", { x1: origin, x2: SIDE, y1: ny, y2: ny, class: "timeline-now" });
    text(SIDE - 6, ny - 4, "now", "end", "timeline-now-label");
  }

  // Bars — every entry, dim; show() lights the selected one.
  const BAR_W = Math.min(22, colW * 0.34), GAP = 6;
  const bars = new Map(); // frame.key → { rect, label }
  for (const s of spans) {
    const cat = s.frame.category || "other";
    const laneCount = Math.max(...lanes.get(cat).map((o) => o.lane)) + 1;
    const groupW = laneCount * BAR_W + (laneCount - 1) * GAP;
    const x = colX(cat) - groupW / 2 + s.lane * (BAR_W + GAP);
    const top = y(s.b), bottom = y(s.a);
    const rect = mk("rect", {
      x, y: top, width: BAR_W, height: Math.max(2, bottom - top),
      class: `timeline-bar${s.open ? " timeline-bar--open" : ""}`,
      role: onPick ? "button" : null, tabindex: onPick ? "0" : null,
    });
    const title = mk("title", {}, rect);
    title.textContent = `${s.frame.title}${s.frame.display_date ? ` — ${s.frame.display_date}` : ""}`;
    const label = text(x + BAR_W + 7, (top + bottom) / 2 + 3, s.frame.mark || "", "start", "timeline-bar-label");
    label.setAttribute("hidden", "");
    if (onPick) {
      rect.addEventListener("click", () => onPick(s.frame));
      rect.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onPick(s.frame); } });
    }
    bars.set(s.frame.key, { rect, label, span: s });
  }

  const baseNote = `${start} – ${end} · 1 yr / division`;
  setNote(baseNote);

  // Crosshair readout: the month under the pointer, in the scale-note slot,
  // as the mm plate prints the field position. Enhancement only.
  const onMove = (e) => {
    const r = svg.getBoundingClientRect();
    const unit = Math.min(r.width, r.height) / SIDE;
    const py = (e.clientY - r.top) / unit;
    if (py < origin || py > SIDE) { setNote(baseNote); return; }
    const yr = yearAt(py);
    const whole = Math.floor(yr);
    const month = Math.min(11, Math.max(0, Math.floor((yr - whole) * 12)));
    setNote(`${MONTHS[month]} ${whole}`);
  };
  const onLeave = () => setNote(baseNote);
  svg.addEventListener("pointermove", onMove);
  svg.addEventListener("pointerleave", onLeave);

  let current = null;
  return {
    show(frame) {
      if (current) {
        current.rect.classList.remove("timeline-bar--current");
        current.label.setAttribute("hidden", "");
      }
      current = bars.get(frame.key) || null;
      if (current) {
        current.rect.classList.add("timeline-bar--current");
        current.label.removeAttribute("hidden");
        // Draw the lit bar last so it sits over any lane neighbour.
        svg.appendChild(current.rect);
        svg.appendChild(current.label);
      }
      svg.setAttribute("aria-label",
        `Timeline of ${spans.length} entries, ${start} to ${end}; selected: ${frame.title}${frame.display_date ? `, ${frame.display_date}` : ""}`);
    },
    prefetch() {},
    dispose() {
      svg.removeEventListener("pointermove", onMove);
      svg.removeEventListener("pointerleave", onLeave);
      svg.remove();
    },
  };
}
