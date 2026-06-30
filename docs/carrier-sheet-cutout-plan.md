# Red-Backing Cut-Out Ingest — Plan

Status: **approved and implemented** (2026-06-30). The shared algorithm, CLI, R2/URL
plumbing, upload path, and admin toggle are in place and pass syntax + unit + CLI-parity
checks. The browser-only parts (canvas pipeline, toggle UI, auto-detect) still need a
live admin pass to confirm end-to-end. Not yet committed.

## Purpose

A repeatable, zero-retouch workflow for ingesting **non-rectangular, irregular-edged
objects** (torn tickets, rounded-corner cards, jagged ephemera) as **transparent
cut-outs** — the scanner background removed, the object's true edge preserved — with no
time in Photoshop. Edge fidelity is the driving requirement: rounded corners, deckled
edges, and jagged tears must survive intact. The scanner's autosize destroys exactly
these, so it is abandoned in favor of software cut-out from a controlled background.

## Hardware facts (Brother DS-640)

| Fact | Implication |
|------|-------------|
| Optical resolution is **600 × 600 dpi**; "1200 dpi" is *interpolated* | Scan at **600 dpi**. 1200 adds no real detail, only ~4× file size. |
| Autosize works **only at 300 dpi** | Cannot rely on the scanner to crop at archival resolution. |
| Autosize **aggressively cuts** rounded/jagged edges | Do not use autosize for irregular objects. |
| Sheet-fed feed-through; accepts 2"×3.4" up to 8.5"×72" | The backing must pass through the rollers with the item. |
| 48-bit input / 24-bit output color | Scan in 24-bit color, not grayscale. |

Source: Brother DS-640 specifications (support.brother.com).

## Backing material (as built, tested)

Instead of buying carrier sheets: a piece of an orange plastic folder sealed in a 4×6
thermal laminating pouch. Under the scanner it reads as a saturated, **uniform, matte
red** — no glossy hotspots. This is the working backing.

Color guidance, now that detection is automatic (the program keys whatever sits at the
scan border, not a fixed color):

- **Red** keys cleanly against white, cream, and — confirmed in testing — even an orange
  document, because distance is measured in CIELAB where orange's yellowness separates it
  from red.
- **Black** is the riskiest backing (close to dark inks and shadowed edges); it will need
  a different tolerance than red.
- **Thin / translucent paper** is the real limitation: the red backing shows *through*
  feathery deckled edges, leaving a faint pink. This is partly true bleed-through, not
  just an antialiased halo, so it cannot be fully removed by edge erosion. For very thin
  or deckled items, bump defringe or use a darker/neutral backing.

Requirement: leave a margin of backing around the object on **all four sides**. The
removal is anchored to the image border; if the object runs off the backing edge, the
fill starts on the object and removes it.

## Core principle: raw scan is the master (CONFIRMED)

- **Master** = the full, uncropped raw scan, including the red backing and margins.
  Uploaded as the `original` and never discarded.
- **Cut-out** = a transparent derivative generated from the master, driving the website
  (display + thumbnail). If a cut-out is ever wrong, re-run the program from the master —
  no re-scanning.
- Cut-out **parameters** (detected background color, tolerance, defringe) are recorded on
  the item so the derivative is exactly reproducible.

## Scan settings

- **Resolution:** 600 dpi (true optical max).
- **Color:** 24-bit color.
- **Page size:** fixed A4 canvas, autosize OFF. Margins removed in software.
- **Backing:** object centered on the red backing, full margin on all sides.
- **One object per scan** (the program keeps the single largest island; multiple items
  per sheet are out of scope for now).

## Program, as built

`scripts/cutout-red-background.js` (Node + `sharp`; `npm run cutout -- <file-or-dir>`).

How it works: it flood-fills inward from the image border, removing the backing **and**
anything connected to it (e.g. the bare grey scanner edge) as one region, so partial
backing coverage doesn't matter. Whatever remains as the largest enclosed island is the
object, kept with its true edge. Background colors are sampled from a border ring (so
red/blue/black are handled without being told which), and distances are CIELAB.
Options: `--tolerance` (default 20 LAB), `--defringe N` (erode the kept edge N px to shed
the antialiased halo), `--margin`, `--debug` (writes mask + checkerboard preview). Output
is a transparent PNG cropped tight. The raw scan is never modified.

**Validation on real scans (tolerance 20, defringe 2):**

| Scan | Result |
|------|--------|
| Orange rebate coupon on red | Essentially flawless — red + grey removed; perforated edge, notched corners, and text all intact; no halo. |
| White torn ticket w/ green stamp | Clean cut; faint pink remains on the feathery deckled edges (thin-paper bleed-through, see backing notes). Defringe reduces but cannot fully remove it. |

## Admin integration (PROPOSED — approve before implementation)

### Confirmed decisions

| Decision | Choice |
|----------|--------|
| Master file | **Keep the raw scan as the master**; cut-out drives display + thumbnail. |
| When to cut | **A "remove backing" toggle in the upload form, auto pre-ticked** when a uniform colored border is detected; overridable. |
| Background color | **Auto-detect** from the border, with a **manual override** (color hint + tolerance/defringe nudge) for tricky scans. |

### Where it runs

In the **browser, at upload time** — consistent with the existing client-side pipeline
(`upload.js` already resizes/encodes on a canvas). The algorithm is pure JS over pixel
data, so it needs no `sharp` in the browser; `canvas.getImageData` supplies the pixels.

Proposed: extract the algorithm into a shared, I/O-free module **`src/shared/cutout.js`**
(`cutout(rgba, w, h, opts) → { rgba, w, h, bbox, params }`). Both the Node CLI and the
admin import it, so there is one implementation, not two. The CLI keeps `sharp` for file
I/O; the admin feeds it canvas pixels.

### Upload flow change

When the toggle is on:

| Asset → R2 prefix | Source | Format |
|-------------------|--------|--------|
| `originals/<base>.<ext>` (master) | raw scan, unmodified | as scanned (opaque) |
| `display/<base>-web.webp` | **the cut-out**, ≤2048 px | WebP **with alpha** |
| `thumbnails/<base>-thumb.webp` | **the cut-out**, ≤200 px | WebP **with alpha** (changed from JPEG, which has no transparency) |

When the toggle is off, behavior is exactly today's (no cut-out; thumbnail stays JPEG).

### Making the PNGs usable on the website

- Display is already WebP (supports alpha); thumbnail moves to **WebP for cut-out items**
  so transparency survives (JPEG would fill it with a box). The stored thumbnail filename
  carries the `.webp` extension, so `image-url.js` needs no change.
- The site already loads the `display` and `thumbnail` variants (built previously), so a
  transparent cut-out composites over the page/desk background automatically.
- **Flag for confirmation:** in the item inspection view, the reproduction sits on a
  calibrated "plate" with a scale grid. A transparent cut-out will let that grid show
  *through* the object. Options: (a) accept it — the object floats on the ruler, which
  suits the material-evidence thesis; (b) composite the cut-out over a neutral card inside
  the inspection view only. Browse-grid thumbnails are unaffected (transparent is fine).

### Files this would touch

| File | Change |
|------|--------|
| `src/shared/cutout.js` (new) | The shared, I/O-free cut-out algorithm. |
| `scripts/cutout-red-background.js` | Refactor to import the shared module (keep CLI/batch behavior). |
| `src/admin/lib/upload.js` | When enabled: compute the cut-out on-canvas; upload raw as master; derive display + thumbnail (WebP, alpha) from the cut-out. |
| `src/admin/forms/form-renderer.js` | Add the "remove backing" toggle (auto pre-ticked via border detection) and a collapsed "advanced" override (color hint, tolerance, defringe). |
| Content/data model | Add `assets.cutout: true` plus recorded params (bg color, tolerance, defringe) for reproducibility. |
| `src/app/panels.js` (maybe) | Only if we choose to composite the cut-out over a neutral card in the inspection plate (see flag above). |

### Performance / UX

Cutting a ~3.4 MP scan in JS takes ~1–3 s. Run it in a **Web Worker** so the admin UI
doesn't freeze, with a spinner and a small preview of the result before the item is saved.

## Resolved decisions (approved)

1. **Inspection-plate transparency:** let the scale grid show **through** the cut-out — no
   compositing in the inspection view. `panels.js` needs no change for this.
2. **Full-res cut-out storage:** keep a full-res transparent PNG in R2 under a new
   `cutouts/` prefix, alongside the raw master, display, and thumbnail.
3. **One object per scan, always:** keep-largest-island is correct; no multi-object handling.
4. **Master storage:** raw masters stay in R2 `originals/` for now.

### Per-item R2 objects for a cut-out (final)

| Prefix | Contents | Format |
|--------|----------|--------|
| `originals/<base>.<ext>` | raw scan (master) | as scanned, opaque |
| `cutouts/<base>-cut.png` | full-res transparent cut-out | PNG, alpha |
| `display/<base>-web.webp` | web-size cut-out | WebP, alpha |
| `thumbnails/<base>-thumb.webp` | thumbnail cut-out | WebP, alpha |

## Verification checklist (before trusting a batch)

- [ ] Cut-out edges match the physical object under magnification (no eroded corners).
- [ ] No backing-color fringe on solid items; thin-item bleed-through understood/accepted.
- [ ] Toggle auto-detection fires on backing scans and stays off for non-backing uploads.
- [ ] Master (raw scan) retained and the cut-out re-derivable from it with stored params.
- [ ] Transparent display + thumbnail render correctly in browse, inspection, and on the desk.
