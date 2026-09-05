// ── Calling card — a typeset reproduction for a contact record ────────────────
// A contact has a natural physical form: a card, 89 × 51 mm. When the record
// carries no scan, the card is typeset from the record and handed to the
// ordinary calibrated plate as its reproduction — so fit zoom, pan, and the
// ratio note all work as they do for any ephemera, and a real scan
// (assets.front + dimensions) simply takes its place. Inline SVG, sized in
// millimetres, so the page's own faces apply; the plate scales it.
// docs/contact-inspection-card-plan.md.

import { channelHref } from "../shared/field-schema.js";

const NS = "http://www.w3.org/2000/svg";

// Typeset the card. `dims` in mm (defaults to a calling card).
export function makeCallingCard(item, dims) {
  const W = dims?.w || 89, H = dims?.h || 51;
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("class", "calling-card");
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", `Calling card: ${item.name || item.title || "contact"}`);
  const mk = (tag, attrs) => {
    const n = document.createElementNS(NS, tag);
    for (const k in attrs) if (attrs[k] != null) n.setAttribute(k, attrs[k]);
    svg.appendChild(n);
    return n;
  };
  const text = (x, y, str, cls, anchor = "start") => {
    const t = mk("text", { x, y, class: cls, "text-anchor": anchor });
    t.textContent = str;
    return t;
  };

  mk("rect", { x: 0, y: 0, width: W, height: H, class: "calling-card__paper" });

  // Type sizes are in mm — the card's own units — so the composition holds at
  // any zoom: a 3.6 mm name is the cap height a printed card would carry.
  const pad = 6;
  let y = pad + 4.2;
  if (item.name) text(pad, y, item.name, "calling-card__name");
  if (item.role_line) { y += 3.6; text(pad, y, item.role_line, "calling-card__role"); }
  y += 3.2;
  mk("line", { x1: pad, x2: W - pad, y1: y, y2: y, class: "calling-card__rule" });

  const channels = Array.isArray(item.channels) ? item.channels.filter(c => c && c.value) : [];
  // Space the channel lines evenly through the room that remains.
  const room = H - pad - y;
  const step = channels.length ? Math.min(4.4, room / (channels.length + 0.4)) : 0;
  let ly = y + step;
  for (const c of channels) {
    if (c.label) text(pad, ly, String(c.label), "calling-card__label");
    // A linked value is a real link on the card too — the card is usable, not
    // a picture of something usable.
    const href = channelHref(c);
    const t = text(W - pad, ly, String(c.value), "calling-card__value", "end");
    if (href) {
      const a = document.createElementNS(NS, "a");
      a.setAttribute("href", href);
      if (!href.startsWith("mailto:")) { a.setAttribute("target", "_blank"); a.setAttribute("rel", "noopener"); }
      svg.replaceChild(a, t);
      a.appendChild(t);
    }
    ly += step;
  }
  return svg;
}

export const CALLING_CARD_MM = { w: 89, h: 51 };
