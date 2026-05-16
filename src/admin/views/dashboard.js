// ── Empty state for the Record pane ──────────────────────────────────────────
// What sits in the [r] Record pane before the user selects anything.
// A one-line hint plus the Needs-attention list — capped at 5 items, with a
// "… N more" tail when there are more. No Recent section: the Explorer is the
// canonical "where to find things" surface.

const ATTENTION_LIMIT = 5;

export function renderEmptyState(container, archive, allItems, callbacks = {}) {
  const { onItemSelect } = callbacks;
  container.innerHTML = '';

  const root = document.createElement('div');
  root.className = 'admin-empty-state';

  // ── Hint line ──
  const hint = document.createElement('p');
  hint.className = 'admin-empty-state__hint';
  hint.innerHTML = `Select an item in the Explorer, or press <kbd>:</kbd> for a command.`;
  root.appendChild(hint);

  // ── Needs attention ──
  const allAttention = allItems.filter(i => {
    if (i.status !== 'draft' && i.status !== 'partial') return false;
    const hasAsset = i.assets && Object.values(i.assets).some(v => v);
    return !hasAsset;
  });

  const visible    = allAttention.slice(0, ATTENTION_LIMIT);
  const remaining  = allAttention.length - visible.length;

  root.appendChild(renderSection(
    'Needs attention',
    visible,
    remaining,
    'No draft or partial items missing assets.',
    onItemSelect,
  ));

  container.appendChild(root);
}

function renderSection(title, items, remaining, emptyHint, onItemSelect) {
  const section = document.createElement('section');
  section.className = 'admin-empty-state__section';

  const heading = document.createElement('h2');
  heading.className = 'admin-empty-state__title';
  heading.textContent = title;
  section.appendChild(heading);

  if (items.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'admin-empty-state__empty';
    empty.textContent = emptyHint;
    section.appendChild(empty);
    return section;
  }

  const list = document.createElement('ul');
  list.className = 'admin-empty-state__list';

  for (const item of items) {
    const li = document.createElement('li');
    li.className = 'admin-empty-state__item';

    const link = document.createElement('a');
    link.href = '#';
    link.className = 'admin-empty-state__link';
    link.dataset.itemId = item.id;
    link.addEventListener('click', (e) => {
      e.preventDefault();
      if (onItemSelect) onItemSelect(item);
    });

    link.innerHTML = `
      <span class="admin-empty-state__id">${escapeHTML(item.id)}</span>
      <span class="admin-empty-state__title-text">${escapeHTML(item.title || '(untitled)')}</span>
      <span class="admin-empty-state__status badge badge-${item.status || 'draft'}">${item.status || 'draft'}</span>
    `;

    li.appendChild(link);
    list.appendChild(li);
  }

  section.appendChild(list);

  if (remaining > 0) {
    const more = document.createElement('p');
    more.className = 'admin-empty-state__more';
    more.textContent = `… ${remaining} more`;
    section.appendChild(more);
  }

  return section;
}

function escapeHTML(s) {
  return String(s).replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

// Legacy alias — the old export name. Will be retired during Phase 7 cleanup.
export const renderDashboard = renderEmptyState;
