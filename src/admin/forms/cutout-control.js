// ── Cut-out ("remove backing") control ───────────────────────────────────────
// Reusable UI for the client-side cut-out feature, shared by every image upload
// field (the ordered-image list AND single-image asset uploads). Items scanned on
// a colored backing are cut out client-side: the raw scan is kept as the master,
// and the transparent cut-out drives display + thumbnail. The checkbox auto-detects
// a uniform colored border from the uploaded file but is always overridable;
// "advanced" exposes tolerance/defringe for tricky scans.
//
// makeCutoutControl() returns { el, getOptions, primeFromFile }:
//   el                — the DOM subtree to append to a field body
//   getOptions()      — { cutout, tolerance, defringe } for the upload call
//   primeFromFile(f)  — async; if the user hasn't touched the checkbox, sets it
//                       from auto-detection of `f` (mirrors the pre-upload guess)

export function makeCutoutControl() {
  const el = document.createElement("div");
  el.className = "cutout-control";

  const heading = document.createElement("div");
  heading.className = "cutout-control__heading";
  heading.textContent = "Backing removal";
  el.appendChild(heading);

  const toggle = document.createElement("label");
  toggle.className = "cutout-control__toggle";
  const check = document.createElement("input");
  check.type = "checkbox";
  check.checked = true;
  let touched = false;
  toggle.appendChild(check);
  toggle.appendChild(document.createTextNode(" Cut out the colored backing"));
  el.appendChild(toggle);

  const hint = document.createElement("div");
  hint.className = "field-hint cutout-control__hint";
  hint.textContent =
    "For items scanned on a colored card: erases the background to transparent and " +
    "keeps the original scan as the master. Auto-detected from the uploaded image — " +
    "override here if the guess is wrong.";
  el.appendChild(hint);

  const adv = document.createElement("details");
  adv.className = "cutout-control__adv";
  const sum = document.createElement("summary");
  sum.textContent = "advanced — fine-tune the cut-out";
  adv.appendChild(sum);
  const mkNum = (labelText, hintText, val, min, max) => {
    const w = document.createElement("label");
    w.className = "cutout-control__num";
    const name = document.createElement("span");
    name.className = "cutout-control__num-label";
    name.textContent = labelText;
    w.appendChild(name);
    const inp = document.createElement("input");
    inp.type = "number"; inp.value = String(val); inp.min = String(min); inp.max = String(max);
    w.appendChild(inp);
    const h = document.createElement("span");
    h.className = "cutout-control__num-hint";
    h.textContent = hintText;
    w.appendChild(h);
    adv.appendChild(w);
    return inp;
  };
  const tolInput = mkNum(
    "tolerance",
    "how close a color must be to the backing to be erased — higher removes more (1–100)",
    20, 1, 100);
  const defInput = mkNum(
    "defringe",
    "pixels of leftover colored edge to clean up after the cut (0–10)",
    2, 0, 10);
  el.appendChild(adv);

  // The tolerance/defringe controls only apply when cut-out is on — hide them
  // otherwise so it's clear they belong to this operation.
  const syncState = () => { adv.hidden = !check.checked; };
  syncState();
  check.addEventListener("change", () => { touched = true; syncState(); });

  return {
    el,
    getOptions() {
      return {
        cutout: check.checked,
        tolerance: parseInt(tolInput.value, 10) || 20,
        defringe: parseInt(defInput.value, 10) || 2,
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
