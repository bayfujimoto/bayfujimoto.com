// ── Minimal Markdown → HTML ───────────────────────────────────────────────────
// A small, dependency-free renderer for author-controlled Markdown (the Guide,
// composed in the admin). Supports headings, bold, italic, inline code, links,
// unordered / ordered lists, blockquotes, and horizontal rules — what a
// finding-aid page needs, not a full CommonMark implementation. Input is
// HTML-escaped before any formatting so raw markup in the source can't inject.

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// Escape first, then re-introduce the small set of tags we generate. Order
// matters: links before emphasis so a URL's characters aren't mangled.
function inline(s) {
  return escapeHtml(s)
    .replace(
      /\[([^\]]+)\]\(([^)\s]+)\)/g,
      (_, text, url) => `<a href="${url.replace(/"/g, "%22")}" rel="noopener noreferrer">${text}</a>`,
    )
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/`([^`]+)`/g, "<code>$1</code>");
}

export function mdToHtml(md) {
  const lines = String(md || "").replace(/\r\n?/g, "\n").split("\n");
  const out = [];
  let para = [];
  let list = null; // { tag: 'ul' | 'ol', items: [] }

  const flushPara = () => {
    if (para.length) { out.push(`<p>${inline(para.join(" "))}</p>`); para = []; }
  };
  const flushList = () => {
    if (list) {
      out.push(`<${list.tag}>${list.items.map(i => `<li>${inline(i)}</li>`).join("")}</${list.tag}>`);
      list = null;
    }
  };
  const flushAll = () => { flushPara(); flushList(); };

  for (const raw of lines) {
    const line = raw.replace(/\s+$/, "");

    if (!line.trim()) { flushAll(); continue; }

    let m;
    if ((m = line.match(/^(#{1,4})\s+(.*)$/))) {
      flushAll();
      const lvl = m[1].length;
      out.push(`<h${lvl}>${inline(m[2])}</h${lvl}>`);
      continue;
    }
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(line.trim())) {
      flushAll();
      out.push("<hr>");
      continue;
    }
    if ((m = line.match(/^\s*[-*+]\s+(.*)$/))) {
      flushPara();
      if (!list || list.tag !== "ul") { flushList(); list = { tag: "ul", items: [] }; }
      list.items.push(m[1]);
      continue;
    }
    if ((m = line.match(/^\s*\d+[.)]\s+(.*)$/))) {
      flushPara();
      if (!list || list.tag !== "ol") { flushList(); list = { tag: "ol", items: [] }; }
      list.items.push(m[1]);
      continue;
    }
    if ((m = line.match(/^>\s?(.*)$/))) {
      flushAll();
      out.push(`<blockquote>${inline(m[1])}</blockquote>`);
      continue;
    }

    // Plain paragraph text — accumulate consecutive non-blank lines.
    flushList();
    para.push(line.trim());
  }

  flushAll();
  return out.join("\n");
}
