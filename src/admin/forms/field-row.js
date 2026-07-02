// ── Tabular asset row builder ────────────────────────────────────────────────
// The reorganized Assets group presents each asset control as its own
// state · FIELD · VALUE · TYPE row, matching every other group in the form.
//
// assetFieldRow builds a ready-decorated `.admin-field` row: it pre-fills the
// state and type slots so field-chrome leaves the row alone, and it carries the
// `.admin-field--asset-row` marker so edit-toggle skips it (the value node is a
// widget managed by the caller, not a togglable text buffer).
//
//   assetFieldRow("front", "image", mediaEl)
//   assetFieldRow("remove backing", "toggle", toggleEl, { sub: true, title })
//
// Column order matches the grid: [state] [label] [value] [type].

export function assetFieldRow(labelText, typeText, valueNode, { sub = false, title = "" } = {}) {
  const row = document.createElement("div");
  row.className = "admin-field admin-field--asset-row" + (sub ? " admin-field--sub" : "");
  if (title) row.title = title;

  const state = document.createElement("span");
  state.className = "admin-field-state";
  state.textContent = "▮";
  state.setAttribute("aria-hidden", "true");

  const label = document.createElement("label");
  label.textContent = labelText;

  const type = document.createElement("span");
  type.className = "admin-field-type";
  type.textContent = typeText;

  row.append(state, label, valueNode, type);
  return row;
}
