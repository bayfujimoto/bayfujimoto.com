// ── Cut-out ("remove backing") control ───────────────────────────────────────
// Reusable UI for the client-side cut-out feature, shared by every image upload
// field (the ordered-image list AND single-image asset uploads). Items scanned on
// a colored backing are cut out client-side: the raw scan is kept as the master,
// and the transparent cut-out drives display + thumbnail. The checkbox auto-detects
// a uniform colored border from the uploaded file but is always overridable;
// tolerance/defringe fine-tune tricky scans.
//
// Reorganized (Phase: Assets group) to render as tabular rows that sit inline
// with the rest of the form — a `remove backing` toggle row plus tolerance /
// defringe sub-rows shown only while it's on — instead of a headed sub-panel.
// The control is per asset, so each image carries its own set of these rows.
//
// makeCutoutControl() returns { rows, getOptions, primeFromFile }:
//   rows              — array of .admin-field rows to place after the image row
//   getOptions()      — { cutout, tolerance, defringe } for the upload call
//   primeFromFile(f)  — async; if the user hasn't touched the checkbox, sets it
//                       from auto-detection of `f` (mirrors the pre-upload guess)

import { assetFieldRow } from "./field-row.js";

export function makeCutoutControl() {
  // ── Toggle row ──
  const check = document.createElement("input");
  check.type = "checkbox";
  check.checked = true;
  let touched = false;

  const toggle = document.createElement("label");
  toggle.className = "asset-toggle";
  toggle.appendChild(check);
  toggle.appendChild(document.createTextNode(" cut out colored backing"));

  const toggleRow = assetFieldRow("remove backing", "toggle", toggle, {
    sub: true,
    title:
      "For items scanned on a colored card: erases the background to transparent " +
      "and keeps the original scan as the master. Auto-detected from the uploaded " +
      "image — override here if the guess is wrong.",
  });

  // ── Tolerance / defringe sub-rows ──
  const mkNumRow = (labelText, typeText, hintText, val, min, max) => {
    const wrap = document.createElement("div");
    wrap.className = "admin-input-wrap";
    const inp = document.createElement("input");
    inp.type = "number";
    inp.className = "asset-num";
    inp.value = String(val);
    inp.min = String(min);
    inp.max = String(max);
    wrap.appendChild(inp);
    const row = assetFieldRow(labelText, typeText, wrap, { sub: true, title: hintText });
    return { row, inp };
  };
  const tol = mkNumRow(
    "tolerance", "1–100",
    "how close a color must be to the backing to be erased — higher removes more (1–100)",
    20, 1, 100);
  const def = mkNumRow(
    "defringe", "0–10",
    "pixels of leftover colored edge to clean up after the cut (0–10)",
    2, 0, 10);

  // The tuning rows only apply when cut-out is on — hide them otherwise so it's
  // clear they belong to this operation.
  const syncState = () => { tol.row.hidden = def.row.hidden = !check.checked; };
  syncState();
  check.addEventListener("change", () => { touched = true; syncState(); });

  return {
    rows: [toggleRow, tol.row, def.row],
    getOptions() {
      return {
        cutout: check.checked,
        tolerance: parseInt(tol.inp.value, 10) || 20,
        defringe: parseInt(def.inp.value, 10) || 2,
      };
    },
    // Auto-tick the toggle from the file, unless the user has set it manually.
    async primeFromFile(file) {
      if (touched || !file) return;
      try {
        const { detectBackingFromFile } = await import("../lib/upload.js");
        check.checked = await detectBackingFromFile(file);
        syncState();
      } catch { /* leave the checkbox as-is */ }
    },
  };
}
