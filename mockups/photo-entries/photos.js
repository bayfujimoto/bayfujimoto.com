/* Photo entry mockups — sample data + builders that replicate the LIVE markup.
   buildPhotoGrid mirrors makeBrowseSheet's item grid (year groups, column-major,
   3 rows, padded last column); buildPhotoCard mirrors makeItemSheet's catalog
   card (fields LEFT, plate RIGHT). Exposure stand-ins are deterministic inline
   SVG scenes so the mockups read as photographs without real assets.
   Classic script (not a module) so it loads from file:// without a server. */

/* ── tiny deterministic PRNG ── */
function _rng(seed) {
  let t = seed >>> 0;
  return function () {
    t += 0x6D2B79F5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

let _uid = 0;

/* ── exposure generator: monochrome scene, film grain, vignette.
   or = 'l' (3:2) | 'p' (2:3) | 's' (1:1); the SVG's viewBox carries the
   photo's true aspect so it is always shown whole, never cropped. ── */
function exposure(seed, or) {
  const r = _rng(seed * 2654435761);
  const W = or === 'p' ? 400 : or === 's' ? 500 : 600;
  const H = or === 'p' ? 600 : or === 's' ? 500 : 400;
  const id = 'x' + seed + '_' + (_uid++);
  const kind = Math.floor(r() * 4);

  const lift = 0.75 + r() * 0.2;
  const top = `rgb(${Math.round(216*lift)},${Math.round(208*lift)},${Math.round(190*lift)})`;
  const mid = `rgb(${Math.round(150*lift)},${Math.round(144*lift)},${Math.round(130*lift)})`;
  const dark = '#141210';

  let scene = '';
  if (kind === 0) {
    const ridge = (y0, amp, tone, op) => {
      let d = `M 0 ${y0}`;
      const n = 6 + Math.floor(r() * 4);
      for (let i = 1; i <= n; i++) d += ` L ${Math.round((W / n) * i)} ${Math.round(y0 + (r() - 0.5) * amp)}`;
      d += ` L ${W} ${H} L 0 ${H} Z`;
      return `<path d="${d}" fill="${tone}" opacity="${op}"/>`;
    };
    scene =
      `<circle cx="${W * (0.2 + r() * 0.6)}" cy="${H * (0.12 + r() * 0.2)}" r="${14 + r() * 10}" fill="${top}" opacity="0.9"/>` +
      ridge(H * 0.42, H * 0.22, mid, 0.75) +
      ridge(H * 0.62, H * 0.16, dark, 0.92);
  } else if (kind === 1) {
    const wx = W * (0.18 + r() * 0.2), wy = H * (0.12 + r() * 0.12);
    const ww = W * (0.38 + r() * 0.2), wh = H * (0.5 + r() * 0.15);
    scene =
      `<rect width="${W}" height="${H}" fill="${dark}"/>` +
      `<rect x="${wx}" y="${wy}" width="${ww}" height="${wh}" fill="${top}" opacity="0.85"/>` +
      `<line x1="${wx + ww / 2}" y1="${wy}" x2="${wx + ww / 2}" y2="${wy + wh}" stroke="${dark}" stroke-width="7"/>` +
      `<line x1="${wx}" y1="${wy + wh / 2}" x2="${wx + ww}" y2="${wy + wh / 2}" stroke="${dark}" stroke-width="7"/>` +
      `<rect x="${wx - 14}" y="${wy + wh + 8}" width="${ww + 28}" height="${H}" fill="${mid}" opacity="0.16"/>`;
  } else if (kind === 2) {
    let x = -10, blocks = '';
    while (x < W) {
      const bw = W * (0.08 + r() * 0.14);
      const bh = H * (0.22 + r() * 0.4);
      blocks += `<rect x="${x.toFixed(0)}" y="${(H - bh).toFixed(0)}" width="${bw.toFixed(0)}" height="${bh.toFixed(0)}" fill="${r() < 0.35 ? mid : dark}" opacity="${0.78 + r() * 0.2}"/>`;
      if (r() < 0.4) blocks += `<rect x="${(x + bw * 0.3).toFixed(0)}" y="${(H - bh * 0.7).toFixed(0)}" width="5" height="7" fill="${top}" opacity="0.85"/>`;
      x += bw - 4;
    }
    scene =
      `<circle cx="${W * (0.15 + r() * 0.7)}" cy="${H * (0.14 + r() * 0.15)}" r="${12 + r() * 9}" fill="${top}" opacity="0.85"/>` +
      blocks;
  } else {
    const cx = W * (0.35 + r() * 0.3), cy = H * (0.35 + r() * 0.3);
    scene =
      `<rect width="${W}" height="${H}" fill="${mid}" opacity="0.6"/>` +
      `<circle cx="${cx}" cy="${cy}" r="${Math.min(W, H) * (0.24 + r() * 0.14)}" fill="${top}" opacity="0.8"/>` +
      `<circle cx="${cx + 26}" cy="${cy + 22}" r="${Math.min(W, H) * (0.22 + r() * 0.1)}" fill="${dark}" opacity="0.28"/>` +
      `<rect x="0" y="${H * (0.72 + r() * 0.1)}" width="${W}" height="${H}" fill="${dark}" opacity="0.55"/>`;
  }

  return (
    `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid slice" role="img" aria-label="photograph stand-in">` +
    `<defs>` +
    `<linearGradient id="sky${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${top}"/><stop offset="1" stop-color="${mid}"/></linearGradient>` +
    `<radialGradient id="vig${id}" cx="0.5" cy="0.45" r="0.85"><stop offset="0.55" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.42"/></radialGradient>` +
    `<filter id="gr${id}"><feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="2" stitchTiles="stitch"/><feColorMatrix type="matrix" values="0 0 0 0 0.85  0 0 0 0 0.82  0 0 0 0 0.74  0 0 0 0.6 0"/></filter>` +
    `</defs>` +
    `<rect width="${W}" height="${H}" fill="url(#sky${id})"/>` + scene +
    `<rect width="${W}" height="${H}" filter="url(#gr${id})" opacity="0.14"/>` +
    `<rect width="${W}" height="${H}" fill="url(#vig${id})"/>` +
    `</svg>`
  );
}

const AR = { l: '3 / 2', p: '2 / 3', s: '1 / 1' };
function expEl(seed, or) {
  or = or || 'l';
  const s = document.createElement('span');
  s.className = 'exp exp--' + or;
  s.style.aspectRatio = AR[or];
  s.innerHTML = exposure(seed, or);
  return s;
}

/* Deterministic slight rotation per record id — a print laid down by hand. */
function tiltFor(id) {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const a = ((h % 100) / 100 - 0.5) * 5; // -2.5 … 2.5deg
  return Math.abs(a) < 0.8 ? (a < 0 ? -0.8 : 0.8) : a;
}
window.tiltFor = tiltFor;

/* ── the multi-photo record every inspection variant opens ── */
window.FEATURED = {
  id: 'PHO-2024-021',
  item_type: 'photo set',
  title: 'Chamonix, morning ascent',
  display_date: 'March 11, 2024',
  place: 'Chamonix, France',
  camera: 'Ricoh GR IIIx',
  context_note:
    'Six exposures from the first cabin up the Aiguille du Midi. Shot in ' +
    'sequence over roughly forty minutes; kept as one record because no ' +
    'single frame carries the ascent alone.',
  frames: [
    { seed: 12, or: 'l', caption: 'Valley floor from the lower station' },
    { seed: 5,  or: 'p', caption: 'Cabin window, first pylon' },
    { seed: 28, or: 'l', caption: 'Ridgeline breaking through cloud' },
    { seed: 33, or: 'l', caption: 'Mid-station platform, unswept snow' },
    { seed: 18, or: 's', caption: 'Ice on the south railing' },
    { seed: 44, or: 'l', caption: 'Summit terrace, looking back down' },
  ],
};

/* ── browse sample: chronological mix of single and multi records ── */
window.GRID_ENTRIES = [
  { id: 'PHO-2024-026', title: 'Copenhagen harbour bath', date: '2024-11-01', frames: [{ seed: 7, or: 'l' }] },
  { id: 'PHO-2024-025', title: 'Lyon traboules',          date: '2024-11-01', frames: [{ seed: 22, or: 'p' }, { seed: 9, or: 'l' }, { seed: 41, or: 'l' }, { seed: 16, or: 's' }] },
  { id: 'PHO-2024-024', title: 'Rue de Belleville, dusk', date: '2024-10-12', frames: [{ seed: 30, or: 'l' }] },
  { id: 'PHO-2024-023', title: 'Studio window, October',  date: '2024-10-01', frames: [{ seed: 13, or: 'p' }] },
  { id: 'PHO-2024-022', title: 'Seine crossing, on foot', date: '2024-09-04', frames: [{ seed: 26, or: 'l' }, { seed: 35, or: 'l' }] },
  { id: 'PHO-2024-021', title: 'Chamonix, morning ascent', date: '2024-03-11', frames: window.FEATURED.frames },
  { id: 'PHO-2024-020', title: 'Boston, T platform',      date: '2024-05-06', frames: [{ seed: 51, or: 's' }] },
  { id: 'PHO-2023-019', title: 'Houston backlot',         date: '2023-09-01', frames: [{ seed: 38, or: 'l' }] },
  { id: 'PHO-2023-018', title: 'Marfa water towers',      date: '2023-06-14', frames: [{ seed: 2, or: 'p' }, { seed: 47, or: 'l' }, { seed: 19, or: 'l' }] },
  { id: 'PHO-2023-017', title: 'Kitchen table, morning',  date: '2023-04-02', frames: [{ seed: 55, or: 's' }] },
];
window.GRID_ENTRIES.sort((a, b) => (a.date < b.date ? 1 : -1));

function el(tag, className) {
  const n = document.createElement(tag);
  if (className) n.className = className;
  return n;
}
window.el = el;
window.expEl = expEl;
window.exposure = exposure;

/* ── Browse grid builder — replicates makeBrowseSheet's structure:
   .item-grid-wrap > .item-grid > per-year .item-grid__group (year label +
   .item-grid__cells), column-major, GRID_ROWS=3, last column padded with
   empty cells. `makeCells(entry)` returns { cells: [element…] } (each element
   goes inside one .item-grid__cell) and may set ownColumn: true to claim a
   whole column for the record (the way film days pack their own cells). ── */
window.GRID_ROWS = 3;
window.buildPhotoGrid = function (rootEl, entries, makeCells) {
  const wrap = el('div', 'item-grid-wrap');
  const grid = el('div', 'item-grid item-grid--photos');
  grid.setAttribute('role', 'list');
  grid.setAttribute('aria-label', 'photos items');

  const byYear = new Map();
  for (const e of entries) {
    const y = e.date.slice(0, 4);
    if (!byYear.has(y)) byYear.set(y, []);
    byYear.get(y).push(e);
  }

  for (const [year, yearItems] of byYear) {
    const group = el('div', 'item-grid__group');
    const yearLabel = el('div', 'item-grid__year');
    yearLabel.textContent = year;
    yearLabel.setAttribute('aria-hidden', 'true');
    group.appendChild(yearLabel);

    const cells = el('div', 'item-grid__cells');
    cells.style.gridTemplateRows = `repeat(${GRID_ROWS}, var(--item-grid-cell-height, 160px))`;

    let col = 1, row = 1;
    const place = (content, extraClass) => {
      const cell = el('div', 'item-grid__cell' +
        (col === 1 ? ' item-grid__cell--first-col' : '') +
        (extraClass ? ' ' + extraClass : ''));
      cell.setAttribute('role', 'listitem');
      cell.style.gridColumn = col;
      cell.style.gridRow = row;
      if (content) cell.appendChild(content);
      else cell.classList.add('item-grid__cell--empty');
      cells.appendChild(cell);
      row++;
      if (row > GRID_ROWS) { row = 1; col++; }
    };
    const finishColumn = () => { while (row !== 1) place(null); };

    for (const entry of yearItems) {
      const spec = makeCells(entry);
      if (spec.ownColumn) finishColumn();
      spec.cells.forEach(c => place(c, spec.cellClass));
      if (spec.ownColumn) finishColumn();
    }
    finishColumn();

    group.appendChild(cells);
    grid.appendChild(group);
  }

  wrap.appendChild(grid);
  rootEl.appendChild(wrap);

  const updateAlignment = () =>
    grid.classList.toggle('item-grid--centered', grid.scrollWidth <= wrap.clientWidth);
  updateAlignment();
  new ResizeObserver(updateAlignment).observe(wrap);
  return wrap;
};

/* The decided grid treatment (docs/decisions.md, "Photo entries — display
   treatment"): every record is a pile of prints in its cell, whole photo
   visible with padding. A single-photo record is a pile of one, slightly
   rotated; multi-photo records show the cover print (straight) over rotated
   sheet edges, with the exposure count in the corner. */
window.pileBtn = function (entry, onClick) {
  const n = entry.frames.length;
  const btn = el('button', 'item-grid__btn pile-btn');
  btn.type = 'button';
  btn.dataset.itemId = entry.id;
  btn.setAttribute('aria-label', entry.title + (n > 1 ? `, ${n} exposures` : ''));

  const cover = entry.frames[0];
  const stack = el('span', 'pile__stack pile__stack--' + (cover.or || 'l'));
  if (n === 1) stack.style.transform = `rotate(${tiltFor(entry.id).toFixed(2)}deg)`;
  if (n > 2) stack.appendChild(el('span', 'pile__sheet pile__sheet--u2'));
  if (n > 1) stack.appendChild(el('span', 'pile__sheet pile__sheet--u1'));
  const print = expEl(cover.seed, cover.or);
  print.classList.add('pile__print');
  stack.appendChild(print);
  if (n > 1) {
    const count = el('span', 'photo-count');
    count.textContent = '×' + n;
    count.setAttribute('aria-hidden', 'true');
    stack.appendChild(count);
  }
  btn.appendChild(stack);
  if (onClick) btn.addEventListener('click', onClick);
  return btn;
};

/* ── Catalog card builder — replicates buildCardWrap's fields column exactly
   (accession split row, title row, spine rows, note), leaving the plate
   column's field + foot for the variant to drive. Returns the parts. ── */
window.buildPhotoCard = function (item, extraRows) {
  const wrap = el('div', 'item-card-wrap');
  const card = el('article', 'item-card');
  card.setAttribute('aria-label', `Record ${item.id}: ${item.title}`);

  const fieldsCol = el('div', 'item-card__fields');
  const fields = el('div', 'item-card__fields-scroll');
  fieldsCol.appendChild(fields);

  const pair = (label, value, mono) => {
    const frag = document.createDocumentFragment();
    const l = el('span', 'overlay-label'); l.textContent = label;
    const v = el('span', 'overlay-value' + (mono ? ' overlay-value--mono' : ''));
    v.textContent = value;
    frag.appendChild(l); frag.appendChild(v);
    return frag;
  };
  const singleRow = (label, value, mono) => {
    if (!value) return null;
    const rowEl = el('div', 'item-card__row');
    rowEl.appendChild(pair(label, value, mono));
    fields.appendChild(rowEl);
    return rowEl;
  };
  const splitRow = (a, b) => {
    const rowEl = el('div', 'item-card__row item-card__row--split');
    rowEl.appendChild(pair(...a));
    rowEl.appendChild(pair(...b));
    fields.appendChild(rowEl);
    return rowEl;
  };

  // Accession — id + type, monospace codes, paired at the top.
  splitRow(['ID', item.id, true], ['type', item.item_type, true]);

  // Title — serif: an archivist-devised title (Creation register).
  const titleRow = el('div', 'item-card__row item-card__row--title');
  const titleLabel = el('span', 'overlay-label');
  titleLabel.textContent = 'title';
  const titleEl = el('h2', 'item-card__title');
  titleEl.textContent = item.title;
  titleRow.appendChild(titleLabel);
  titleRow.appendChild(titleEl);
  fields.appendChild(titleRow);

  singleRow('date', item.display_date, true);
  splitRow(['place', item.place, true], ['camera', item.camera, true]);
  singleRow('extent', `${item.frames.length} exposures`, true);

  const api = { singleRow, splitRow, pair, fields };
  if (extraRows) extraRows(api);

  if (item.context_note) {
    const note = el('div', 'item-card__note');
    const l = el('span', 'overlay-label'); l.textContent = 'note';
    const p = el('p'); p.textContent = item.context_note;
    note.appendChild(l); note.appendChild(p);
    fields.appendChild(note);
  }

  card.appendChild(fieldsCol);

  // Plate column — head / square field / foot, per the live card.
  const plateCol = el('div', 'item-card__plate');
  const plateHead = el('div', 'item-card__plate-head');
  const plateLabel = el('span', 'overlay-label');
  plateLabel.textContent = 'plate';
  const scaleNote = el('span', 'item-card__scale-note');
  plateHead.appendChild(plateLabel);
  plateHead.appendChild(scaleNote);
  plateCol.appendChild(plateHead);

  const field = el('div', 'item-card__field');
  plateCol.appendChild(field);

  const foot = el('div', 'item-card__plate-foot');
  const controls = el('div', 'item-card__plate-controls');
  const assetLabel = el('span', 'item-card__asset-label');
  foot.appendChild(controls);
  plateCol.appendChild(foot);

  card.appendChild(plateCol);
  wrap.appendChild(card);

  return { wrap, card, fields, api, plateCol, scaleNote, field, foot, controls, assetLabel };
};

/* MOCKUP: dimmed browse grid behind the card, standing in for the live veil
   over the browse sheet. */
window.buildBackdropGrid = function (rootEl) {
  const holder = el('div');
  buildPhotoGrid(holder, GRID_ENTRIES, (entry) => ({
    cells: [pileBtn(entry)],
  }));
  rootEl.appendChild(holder);
  const veil = el('div', 'veil');
  veil.setAttribute('aria-hidden', 'true');
  rootEl.appendChild(veil);
};
