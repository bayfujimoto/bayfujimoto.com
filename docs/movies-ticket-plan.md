# Films on the desk — a ticket stub for the fan

Status: **B (box-office thermal) chosen and implemented, 2026-09-15** — see decisions.md → "Films on the desk — a box-office ticket". The plan below is kept as the record of the choice.
Mockups: `mockups/movie-ticket/` (rendered through the live `paper.js` from
`archive.json`, per the feedback-mockups rule).

## What is wrong now

The consumption bundle's **films** document is the Log — a lined sheet with
"Log" set large, the last two films, two books and a record written in by
hand, a coffee ring, a taped still. It is a good document and it stays on the
desk. But it is a log of *everything consumed*, and when the fan opens it as
the films sheet, it does not say "films". The still it carries is also a
placeholder: film images are on Letterboxd's host, and the canvas cannot draw
them (no CORS), so the `photo` layer falls back to its gradient.

## Decisions taken with Bay (2026-09-15)

- The Log **stays on the desk** as it is, but stops being the films sheet.
- A **new films document** sits **on top of the Log** and is the sheet the
  fan lifts for films. (The fan takes the first desk document whose `sub`
  matches, so it must be a real desk object — no fan-only sheets.)
- **Typographic only.** No poster, no still. A stub reads through type,
  stamps, perforation and stock. No image plumbing.
- **Two new film fields**, `venue` and `format`, optional, blank by default,
  editable in the admin; the stub prints them when present and a plain line
  when not. `seen_via` stays (streaming / theatrical / imax).
- **Landscape.** The books slip and the coffee form are portrait, and so are most sheets on the desk; the films document is wide, like the Log it lies on. Every candidate is landscape.
- **Try several contents** — one stub for the latest film, a strip of the
  last three, a punch card of the recent run. Mockups decide.

## The mockups

All live: the latest published film record(s) by `sort_date`, drawn at the
desk's 1.5 px/mm.

A. **Admission stub** — 51 × 140 mm cardstock (a real hard-ticket stub),
   "ADMIT ONE" run up the side, the title in serif, date and venue · format
   in mono, the record id as the serial, the rating **punched** along the
   edge (five holes, one per star, half-stars as a half punch), a
   perforation across the short end with the tear-off carrying the title
   again. A rewatch gets a red **AGAIN** stamp.
B. **Box-office thermal** — 80 mm roll fed sideways and cut short, 150 × 62, torn at the
   right, the way a ticket comes out of a kiosk now: venue, title, year, date, format, the
   rating as ★ glyphs in mono, a seeded barcode with the record id under it.
C. **Strip of three** — three small stubs (38 × 75 mm each) still joined,
   perforated between, the newest at the tear: title, date, rating punched.
   The desk shows the last three films at a glance.
D. **Punch card** — a 90 × 55 mm "season pass": the last ten titles in a
   column, a hole punched beside each one seen, the half-punched last row
   the one in progress. Rating shown as the punch count in a second column.

## Code that follows the chosen mockup

- `paper.js`: a `perf` layer (a row of punched holes, destination-out, for
  perforations) and a `punch` layer (a single hole) — both erase, so, like
  `inkDropout`, they are for *sheets*, never for a `bare` solid. A `ticket`
  stock (`#efd9b9`, a light salmon-manila) if A or C is chosen; B uses the
  existing `thermal`.
- `desk-docs.js`: the new `films` doc after the Log in the consumption
  bundle's `docs` (later = higher), so it lies on the Log; the Log's `sub`
  becomes `null` so it stays on the desk and leaves the fan. Text from
  `byDateDesc(sub("consumption","films"))` as the Log's `logText` does.
  Placement on the Log to be tuned on the desk: over the lower-left, clear
  of the cartridge (which stands on its own thickness anyway) and of the
  disc's third.
- `src/shared/field-schema.js`: `venue` and `format` added to the film
  slots (`["year", ["venue", "format"], "seen_via", "rating"]` or as the
  card's spine prefers); `src/admin/forms/type-fields.js` picks them up
  through `schemaMetaGroup`. The Letterboxd ingests leave them blank.
- `docs/content-model.md` / `docs/field-schema.md`: the two fields.
- `docs/decisions.md`: "Films on the desk — a ticket stub".
- Verify: desk light / dark / hover, the consumption fan, a rewatch record,
  a record with no venue or format, a half-star rating.

## Not in this pass

- A poster or still on the stub (would need a build-time cache or a proxy).
- Seat, screen, price — not recorded; the stub does not invent them.
