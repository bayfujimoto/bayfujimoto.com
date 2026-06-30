# Carrier-Sheet Cut-Out Ingest — Plan

Status: **deferred.** Reference document for when the carrier sheet and high-contrast
backing materials are acquired. Until then, ingest is limited to rectangular documents
using the existing pipeline (see "Interim state" below).

## Purpose

Establish a repeatable, zero-retouch workflow for ingesting **non-rectangular and
irregular-edged objects** (torn tickets, rounded-corner cards, jagged ephemera) as
**transparent cut-outs** — silhouettes with the scanner background removed — without
any time spent manually cropping in Photoshop.

The driving requirement is edge fidelity: rounded corners, deckled edges, and jagged
tears must survive ingest intact. The scanner's own autosize feature destroys exactly
these features, which is why it is abandoned here in favor of software cut-out from a
controlled background.

## Interim state (current, until materials arrive)

- Scan **rectangular documents only**.
- Use 600 dpi (see hardware note). Accept the A4 canvas with margins, or use the
  scanner's 300 dpi autosize where a rectangular result is acceptable.
- Raw scan is ingested as-is through the existing `upload.js` path.
- Irregular objects are **held back** until the cut-out workflow is in place, so their
  edges are not compromised by autosize.

## Hardware facts (Brother DS-640)

These constraints shape every decision below.

| Fact | Implication |
|------|-------------|
| Optical resolution is **600 × 600 dpi**; "1200 dpi" is *interpolated* | Scan at **600 dpi**. 1200 adds no real detail, only ~4× file size. |
| Autosize works **only at 300 dpi** | Cannot rely on the scanner to crop at archival resolution. |
| Autosize **aggressively cuts** rounded/jagged edges | Do not use autosize for irregular objects. It removes the very features we are preserving. |
| Sheet-fed feed-through design; accepts 2"×3.4" up to 8.5"×72" | A backing/carrier sheet must pass through the rollers with the item. |
| 48-bit input / 24-bit output color | 24-bit color masters are the practical ceiling; scan in color, not grayscale. |

Source: Brother DS-640 specifications (support.brother.com).

## Prerequisites to buy

- [ ] **Carrier sheet(s)** compatible with the DS-640 (clear sleeve that protects
      fragile/irregular items in the feed and holds a backing insert flat).
- [ ] **High-contrast backing material** in a saturated color that no document in the
      archive contains — strong **blue** or **magenta** are safest against paper, cream,
      sepia, and most inks. Avoid black (shadows and dark inks collide) and avoid
      grey/white (collides with the scanner's own background and with paper).

A small swatch test before committing: scan a white/cream document against the chosen
color and confirm a clean, continuous edge with no color bleed onto the paper.

## Core principle: the cut-out is a derivative, not a master

Background removal is lossy and occasionally wrong (it will sometimes nibble a thin
protrusion or follow a faint edge). Therefore:

- **Master** = the full, uncropped 600 dpi scan, including the colored backing and all
  margins. Stored as the preservation copy. Never discarded.
- **Cut-out** = a transparent PNG derived from the master. If a mask comes out wrong,
  re-derive from the master rather than re-scanning the physical item.
- This mirrors the master/derivative split already adopted for storage: raw master in
  cold storage, cut-out (plus a web size) in R2.

## Scan settings

- **Resolution:** 600 dpi (true optical max).
- **Color:** 24-bit color (preserves paper tone, foxing, ink variation — material
  evidence, per `site-concept.md`).
- **Page size:** fixed A4 canvas (autosize OFF). Margins are fine; they are removed in
  software.
- **Backing:** item inside carrier sheet, saturated colored insert behind it, so every
  non-background pixel belongs to the object.
- **File:** capture lossless where the scanner allows (TIFF/PNG); otherwise highest-quality
  JPEG. Convert to the PNG master on ingest.

## Cut-out method

### Primary: chroma-key threshold (bulletproof, zero-touch)

Because the backing color is controlled and uniform, segmentation is deterministic:
threshold against the backing color's channel to build the alpha mask, keep everything
else. No model, no per-image seeding, fully batchable. This is the recommended path
*because* the backing is controlled — it converts an unreliable AI-segmentation problem
into a trivial one, and it preserves every jagged edge (every non-background pixel is kept).

### Alternative: rembg (U²-Net / ISNet)

A one-command Python tool that needs no per-image seeding and handles irregular
silhouettes well. Caveat: trained on natural photos, so flat scanned paper is slightly
off-distribution — results are either great or frustrating, with little middle ground.
**Test on ~10 real scans before adopting.** With a good colored backing in place, the
chroma-key route likely makes rembg unnecessary.

### Edge-preservation rules (apply to either method)

- **Do not feather, blur, or erode the alpha mask.** That smoothing is exactly what
  erased the corners under autosize.
- Limit edge refinement to **≤ 1px anti-aliasing**. Keep the jaggedness.
- Disable any "smart edge" / edge-smoothing option the tool offers by default.
- At 600 dpi there are ample pixels for a crisp matte without refinement.

## Output formats

| Asset | Format | Notes |
|-------|--------|-------|
| Master | PNG (or original TIFF) | Lossless, alpha-capable, full 600 dpi. Cold storage. |
| Cut-out master | PNG | Transparent silhouette derived from the scan. A few MB for a small object. |
| Web derivative | WebP or AVIF | Both support transparency; ~100–300 KB at display size (~1600 px long edge). Served from R2. |

## Pipeline integration (when ready to wire in)

The current pipeline uploads the **raw original** plus a **200 px JPEG thumbnail** and has
**no mid-size web derivative** — adding that step is part of this work. Touch points:

| File | Change |
|------|--------|
| `src/admin/lib/upload.js` | Add cut-out + derivative generation. Upload transparent PNG cut-out and a WebP/AVIF display derivative, not the raw file, as the served asset. Keep generating the small thumbnail. |
| `netlify/functions/r2-upload-url.js` | Extend the prefix allowlist (currently `originals`, `thumbnails`) to include a `display` (derivative) prefix. |
| `src/app/image-url.js` | Add a `display` variant alongside `original`/`thumbnail` so the inspection view loads the derivative, not the full master. |
| Inspection view (`panels.js`) | Point item display + pinch-to-zoom at the `display` derivative. Thumbnail stays on the browse strip. |

Note: transparency changes how objects read on the desk/3D surface — cut-outs "float" as
their true silhouette rather than as rectangles, which suits the material-evidence thesis.
Confirm this is the intended aesthetic before committing the display path.

## Storage implications

- 600 dpi (not 1200) quarters master size at no real-detail cost.
- A small object's transparent PNG master is a few MB; the WebP derivative is ~100–300 KB.
- Serving only the derivative keeps R2 comfortably inside the 10 GB free tier
  (tens of thousands of items). Masters live in cold storage, not R2.

## Open questions to resolve when building

1. Final backing color (blue vs magenta) — decide after swatch test.
2. Chroma-key in the browser (`upload.js`, client-side canvas) vs. a Node batch script in
   `scripts/`. Browser keeps the single-upload flow; a script better suits bulk backlog.
3. Whether to also retain a rectangular (non-cut-out) derivative for items where the
   surrounding paper is itself evidence.
4. Master storage location (external drive vs. cold-storage bucket) — see the R2 storage
   discussion.

## Verification checklist (before trusting a batch)

- [ ] Cut-out edges match the physical object under magnification (no eroded corners).
- [ ] No backing color bleed onto the object's border.
- [ ] White/cream documents key cleanly against the chosen backing.
- [ ] Master retained and re-derivable.
- [ ] Derivative renders with transparency in the inspection view and on the desk surface.
