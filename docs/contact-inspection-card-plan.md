# Contact — a card on the plate

Proposal for the Contact subcollection, the third Identity surface after the
Guide (2026-09-05) and the CV (2026-09-05). Three ideas, with studies in
`mockups/contact/`; one is recommended. Nothing is decided and no code has
changed.

Status: implemented 2026-09-05 (same day), as idea A. Bay's decisions: one
record (002 and 003 folded into 001 and moved to `_to_delete/`); the card
prints `Bay Fujimoto` / `architect · austin`; the verso is blank (so the
typeset card has no flip control); no availability note for now (the `note`
row and the verso text drop out until one is written). Implementation as
sketched below, with one simplification: the typeset card is an inline SVG
drawn in millimetres and handed to `buildPlate` as the reproduction, so no
plate code was written; `channelHref` lives in `field-schema.js`; channel rows
come from a `channels` branch in the card's record fields rather than a
`contact` type in `resolveSlots`.

## What is there now — and what is wrong with it

Three `contact` records (`src/content/identity/contact/`), one per channel,
each with a one-entry `channels` list: email `hello@bayfujimoto.com`, Instagram
`@bayfujimoto`, Letterboxd `@bayf`. The subcollection browses as a three-cell
grid with no year labels (`makeBrowseSheet` special-cases `contact`) and each
record opens the generic catalog card.

That card shows **ID, type, title — and nothing else** (`mockups/contact/00`).
`channels` is not in the field schema, so the address and the handles are never
rendered; the plate says `no reproduction`. A visitor who wants to write cannot
find out how. Whatever else this redesign does, it has to put the channel value
on the page as a live link.

## What the studies agree on

A contact is the one record in the archive that already has a natural physical
form: a **card**. A calling card is 89 × 51 mm; an index card is 127 × 76 mm.
That means the Contact plate needs no new plate at all — the ordinary
calibrated mm plate carries a card at true scale, opened at fit zoom, with the
ratio note in the head (`1 : 2.7 · 120 mm`), `flip` for the verso, and zoom and
pan as any ephemera has. The Guide needed a model plate and the CV a timeline
plate; Contact needs the plate that exists.

The card is typeset from the record (name, a role line, the channels). If Bay
scans his real business card, the scan takes the plate (`assets.front` +
`dimensions`, as any ephemera) and the typeset card is the fallback for
records without one — `mockups/contact/01?scan` shows the two side by side.

No brand marks or icons anywhere. Channels are named in words (`email`,
`instagram`, `letterboxd`); the value is the handle or address.

## The ideas

### A — one record, a calling card (recommended) · `01-calling-card.html`

The three files fold into **one** record (`CONTACT-2026-001`, title `Contact`)
with a `channels` list — which is what the template (`identity-contact.md`,
`channels: []`) always intended. The card opens directly from the Identity
sheet (as the CV does, skipping the grid).

Fields: `ID · type`; title `Contact`; one row per channel — label in the
label column, value as a live link (`mailto:`, `https://`) in mono; `extent`
(`3 channels`) · `dimensions` (`89 × 51 mm`, or the scan's); a `note` for
availability ("Replies within the week…"). Nothing is stated twice: the card
on the plate repeats the rows as a picture repeats a caption, which is the
relation every other plate has to its column.

Plate: the calibrated plate, the card at the origin, fit zoom, `flip` to a
verso that carries the note (or is blank, if Bay prefers a plain back). With a
scan present, recto and verso are the scan's two sides.

Why recommended: three channels are one address book entry, not three
objects; a strip of three frames is machinery for very little; and the whole
thing lands on existing code — `buildCardWrap`'s standard path with a
generated reproduction, no frames mode, no new plate.

### B — one card, a frame per channel · `02-channel-frames.html`

The three records stay three. The Guide/CV frames contract (`ctx.frames`)
steps them in a shared strip; each frame's plate is a calling card printed for
that one channel; the fields column rebuilds per frame (`title`, `value` as a
link, `dimensions`, `note`); tiles in the strip are typographic (channel word
over the handle).

Weaknesses seen in the study: a strip of three leaves half the strip empty;
long channel names (`instagram`, `letterboxd`) break mid-word in a sixth-width
tile unless given short marks; and the card printed with a single line on it
looks under-used. Strength: it scales to many channels without the record
growing, and it is exactly the machinery the CV just built.

### C — a card file: index cards with tabs · `03-index-cards.html`

Structure B with a different object. Each channel is typed on a ruled
127 × 76 mm index card; the tab names the channel; the strip is the row of tabs.
It reads as the archivist's own address file rather than a card he hands out —
which is an honest reversal: a visitor is looking *him* up, not receiving his
card. The plate opens at `1 : 1.9 · 170 mm` to fit the larger card.

Weaknesses: the same near-empty strip as B; the index card carries even less
per frame; the tab typography competes with the mm scale along the top edge.
Strength: the strongest metaphor of the three if the Identity series ever
gains more "looked-up" material (references, addresses, a directory).

## Content model (for A)

```yaml
---
id: CONTACT-2026-001
title: Contact
series: identity
subcollection: contact
item_type: contact
status: published
name: Bay Fujimoto          # as printed on the card
role_line: architect · austin
channels:
  - label: email
    value: hello@bayfujimoto.com
    href: mailto:hello@bayfujimoto.com     # optional; derived when absent
  - label: instagram
    value: "@bayfujimoto"
  - label: letterboxd
    value: "@bayf"
note: Replies within the week.
dimensions: 89 x 51 mm      # the calling card; a scan's own size when present
# assets: { front: CONTACT-2026-001-front.jpg, back: … }   # if Bay scans his card
---
```

- `href` derivation: `mailto:` for a value containing `@` and a dot with no
  leading `@`; `https://instagram.com/<handle>` and
  `https://letterboxd.com/<handle>` for those labels; otherwise the value is
  shown but not linked. The field wins when present.
- Records 002 and 003 are deleted (their channels move into 001). Nothing else
  in the archive references them.
- Admin: the `contact` form already has a `channels` pair-list; it gains `name`,
  `role_line`, `note`, and — via the existing ephemera asset group — the
  optional scan.
- Content model doc: the `contact` record's field list changes accordingly.

## Implementation shape (for A)

1. **Generated reproduction.** A small module, `src/app/calling-card.js`,
   renders the typeset card to an SVG (the plate already hosts SVG) sized to
   `dimensions`, recto and verso. `buildCardWrap` gets one new branch: a record
   with no `assets.front` but with `channels` gets the generated card as its
   reproduction — through the same `buildPlate` path (fit zoom, pan, flip,
   scale note), so no plate code is written. A record with a scan takes the
   normal path untouched.
2. **Rows.** `resolveSlots` in `field-schema.js` gains a `contact` type whose
   slots are the channels (label → value), rendered as links. The `note`
   row is the existing one.
3. **Routing.** `/identity/contact/` opens the card directly (as the CV does);
   `?item=CONTACT-2026-001` resolves to the same. The three-cell grid and its
   `contact` special case in `makeBrowseSheet` are retired.
4. **Docs.** decisions.md entry; content-model.md; information-architecture.md
   (`/identity/contact/` line).

For B or C the same steps apply with the frames contract in place of step 1's
branch, and the records stay three (gaining `name`/`role_line` once, on a
shared level — which is itself an argument for one record).

## Decisions needed

1. **Structure**: A (one record, one card), B (frame per channel), or C (card
   file). Recommendation: A.
2. **Consolidate** the three records into one (A), or keep three (B/C).
3. **The object** for the typeset fallback: calling card (89 × 51) or index
   card (127 × 76). Recommendation: calling card — it is the thing a person
   would actually hand a visitor.
4. **Scan**: does Bay want to scan a real card now? If yes, the typeset card is
   only ever the fallback and can be plainer.
5. **What the verso carries**: the availability note, or nothing.
6. **Name and role line** as printed on the card — `Bay Fujimoto` /
   `architect · austin` are placeholders in the studies.
