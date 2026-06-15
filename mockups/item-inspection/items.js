/* Sample records + line-drawn SVG stand-ins (vellum stroke, catalog-illustration style).
   Three scale classes: small (ticket), frame-filling (LP), oversized (poster). */

/* Classic script (not a module) so it loads from file:// without a server. */
const STROKE = 'rgba(232,224,208,0.85)';
const STROKE_DIM = 'rgba(232,224,208,0.35)';

window.ITEMS = {
  ticket: {
    id: 'EPH-2026-003',
    title: 'Eiffel Tower Ticket',
    series: 'accumulation',
    item_type: 'ticket',
    display_date: 'August 25, 2024',
    place: 'Paris, France',
    source: 'Eiffel Tower',
    dimensions_mm: { w: 130, h: 54 },
    context_note:
      'Admission ticket, second-level lift. Thermal print on coated stock, ' +
      'creased once vertically. Retained from a visit of August 2024.',
    svg: `
      <svg viewBox="0 0 130 54" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
        <rect x="1.5" y="1.5" width="127" height="51" rx="2" fill="rgba(232,224,208,0.04)" stroke="${STROKE}" stroke-width="1"/>
        <line x1="92" y1="2" x2="92" y2="52" stroke="${STROKE_DIM}" stroke-width="0.8" stroke-dasharray="2.5 2.5"/>
        <path d="M 18 42 L 28 14 L 38 42 M 21.5 33 L 34.5 33 M 24 24 L 32 24" fill="none" stroke="${STROKE}" stroke-width="1.1"/>
        <line x1="48" y1="18" x2="84" y2="18" stroke="${STROKE_DIM}" stroke-width="1.4"/>
        <line x1="48" y1="25" x2="78" y2="25" stroke="${STROKE_DIM}" stroke-width="1.4"/>
        <line x1="48" y1="32" x2="82" y2="32" stroke="${STROKE_DIM}" stroke-width="1.4"/>
        <line x1="48" y1="39" x2="70" y2="39" stroke="${STROKE_DIM}" stroke-width="1.4"/>
        <g stroke="${STROKE}" stroke-width="1">
          <line x1="99" y1="12" x2="99" y2="42"/><line x1="102" y1="12" x2="102" y2="42"/>
          <line x1="106" y1="12" x2="106" y2="42"/><line x1="111" y1="12" x2="111" y2="42"/>
          <line x1="113" y1="12" x2="113" y2="42"/><line x1="118" y1="12" x2="118" y2="42"/>
          <line x1="122" y1="12" x2="122" y2="42"/>
        </g>
      </svg>`
  },

  lp: {
    id: 'MUS-2026-014',
    title: 'Hejira — LP Sleeve',
    series: 'consumption',
    item_type: 'record',
    display_date: 'November 2024',
    place: 'Copenhagen, Denmark',
    source: 'Route 66 Records',
    dimensions_mm: { w: 312, h: 312 },
    context_note:
      'Used pressing, sleeve worn at the spine. Bought while traveling; ' +
      'carried home flat in checked luggage between two shirts.',
    svg: `
      <svg viewBox="0 0 312 312" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
        <rect x="2" y="2" width="308" height="308" fill="rgba(232,224,208,0.04)" stroke="${STROKE}" stroke-width="1.5"/>
        <circle cx="156" cy="156" r="118" fill="none" stroke="${STROKE_DIM}" stroke-width="1"/>
        <circle cx="156" cy="156" r="98" fill="none" stroke="${STROKE_DIM}" stroke-width="0.7"/>
        <circle cx="156" cy="156" r="78" fill="none" stroke="${STROKE_DIM}" stroke-width="0.7"/>
        <circle cx="156" cy="156" r="42" fill="none" stroke="${STROKE}" stroke-width="1"/>
        <circle cx="156" cy="156" r="4" fill="none" stroke="${STROKE}" stroke-width="1"/>
        <rect x="30" y="26" width="150" height="14" fill="none" stroke="${STROKE_DIM}" stroke-width="0.8"/>
        <line x1="2" y1="2" x2="2" y2="310" stroke="${STROKE}" stroke-width="3"/>
      </svg>`
  },

  poster: {
    id: 'EPH-2026-021',
    title: 'Exhibition Poster, Louisiana Museum',
    series: 'accumulation',
    item_type: 'document',
    display_date: 'November 2024',
    place: 'Humlebæk, Denmark',
    source: 'Louisiana Museum of Modern Art',
    dimensions_mm: { w: 610, h: 914 },
    context_note:
      'Offset print, 610 × 914 mm, rolled. Too large for any flat file in the ' +
      'apartment; stored in a shipping tube behind the bookshelf.',
    svg: `
      <svg viewBox="0 0 610 914" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
        <rect x="3" y="3" width="604" height="908" fill="rgba(232,224,208,0.04)" stroke="${STROKE}" stroke-width="3"/>
        <circle cx="305" cy="330" r="170" fill="none" stroke="${STROKE}" stroke-width="2.5"/>
        <path d="M 135 330 A 170 170 0 0 1 475 330" fill="rgba(232,224,208,0.06)" stroke="none"/>
        <line x1="80" y1="620" x2="530" y2="620" stroke="${STROKE_DIM}" stroke-width="5"/>
        <line x1="80" y1="660" x2="430" y2="660" stroke="${STROKE_DIM}" stroke-width="5"/>
        <line x1="80" y1="760" x2="300" y2="760" stroke="${STROKE_DIM}" stroke-width="3"/>
        <line x1="80" y1="790" x2="340" y2="790" stroke="${STROKE_DIM}" stroke-width="3"/>
        <line x1="80" y1="850" x2="240" y2="850" stroke="${STROKE_DIM}" stroke-width="3"/>
      </svg>`
  }
};

window.fmtDims = function fmtDims(item) {
  const { w, h } = item.dimensions_mm;
  return `${w} × ${h} mm`;
}
