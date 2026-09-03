# Item card field schema

Status: **confirmed** (structural decision). Encoded in `src/shared/field-schema.js`;
the card (`renderCard`) and the admin form are being wired to read from it (overhaul
steps 3–4). Recorded in `docs/decisions.md` as "Item card field schema: spine + typed
slots". The open cells near the foot remain easy to change in the module.

Purpose: replace today's *implicit and triplicated* field definitions — separately
hand-maintained in `src/admin/forms/type-fields.js` (editable), `src/app/panels.js`
`renderCard` (displayed), and `docs/content-model.md` (documented) — with one
declarative schema, keyed by `item_type`, that both the admin and the card import.
The schema below *is* the concise card, expressed as data.

---

## Scope

This schema governs the **catalog-card inspection** only (`makeItemSheet` /
`renderCard`). It covers the three series that use the card:

- **Consumption** — film, book, music (album / ep / single / mix), coffee (bag), game
- **Creation** — sketch, photo, prototype, video, note
- **Accumulation** — ephemera (ticket, brochure, receipt, handout, document)

Out of scope: **Labor** (custom horizontal-scroll view, `makeLaborItemSheet`) and
**Identity** (custom biography / CV / contact views). These keep their own layouts;
the `inspection:` field remains the per-record override hook.

---

## The form: a fixed spine + up to three typed slots

The card's *grammar* is constant for every type; only the three middle rows change.
This keeps records comparable (the card's whole reason to exist) while letting a
film, a coffee bag, and a ticket each show their most identifying metadata.

### 1. Universal spine (every card, this order)

| order | row | source field | notes |
|---|---|---|---|
| 1 | accession | `id` + `item_type` | monospace, paired in one split row (`ID` / `type`) |
| 2 | title | `title` | full-width; the card's heading |
| 3 | responsibility | creator (see map) | role-adaptive label; **shown only when present and ≠ the archive subject** |
| 4 | date | `display_date` | with certainty qualifier when `approximate_date` is set (e.g. "c. 1998") |
| 5–7 | **typed slots** | per-type (see table) | up to three rows; absent values suppressed, never faked |
| 8 | physical | `extent` + `dimensions` | dimensions carried by the plate; `extent` a literal row |
| 9 | note | `context_note` | scope-and-content note |
| 10 | riders | `related_ids` + `constellations` + `tags` | three rows: "see also" buttons; **constellations as their own row** of clickable tokens (→ `/constellations/<slug>/`); tags as the closing row |
| — | status | `status` | non-published renders as a stamp/overprint, not a row |

### 2. Creator (responsibility) — role label by type, with a self-default

The creator label tracks the record type. In Consumption the creator is always
someone else and is always shown; in Creation it is the archive subject by default
and is **suppressed**, reappearing only on exception (a collaborator, a commission,
a found or inherited object). Authorship is asserted once on the Creation series
sheet ("Self-authored unless a collaborator is named"), per the rule of
non-repetition.

| item_type | label | default behaviour |
|---|---|---|
| film | director | required; always shown |
| book | author | required; always shown |
| music | artist | required; always shown |
| game | developer | required; always shown |
| coffee | roaster | required; always shown |
| photo | photographer | subject by default → **suppressed** unless overridden |
| sketch | maker | subject by default → **suppressed** unless overridden |
| prototype | maker | subject by default → **suppressed** unless overridden |
| video | maker | subject by default → **suppressed** unless overridden |
| note | — | no creator row |
| ephemera | issuer | optional → suppressed when absent |

### 3. Typed slots (≤ 3 per type, ordered)

Slot logic follows the library work/item distinction (FRBR/LRM): slot 1 tends to
describe **the work**, slot 2 **your encounter/instantiation** of it, slot 3 a
qualifier. **These cells are the main thing to review and edit.**

| item_type | slot 1 | slot 2 | slot 3 |
|---|---|---|---|
| film | year (released) | seen via (`seen_via`) | rating |
| book | year (published) | edition | rating |
| music | year (released) | label / source | rating |
| game | platform | status (done / playing / abandoned) | rating |
| coffee | origin | process | varietal |
| photo | place | camera | series / contact sheet |
| sketch | medium | material | related project |
| prototype | medium | material | related project |
| video | duration | source | related project |
| note | note_type | related project | — |
| ephemera | place | source (provenance) | fold (folded matter only) |

Ephemera's slot 1 is `place` alone — the former `place` + `event` split row is
retired along with the `event` field (see decisions.md → "Constellations").
`source` (provenance) takes the following row. Slot 3, `fold`, appears only on
folded matter (`fold: half | tri | accordion`) and prints the family with its
panel count — `tri-fold · 3 panels` — from `fold` + `panels` (`panels` is
record-only, folded into this row's text).

**Constellations on the card.** Every card-using type prints its
`constellations` as **its own rider row** near tags (spine row 10) — never in a
split row, never sharing a line with another field. Each value is a
**clickable token** navigating to `/constellations/<slug>/`. The rule is
uniform: ephemera included, one rendering everywhere.

---

## Physical row, extent, and the `source` rename

- **`extent`** becomes a literal field — the number of physical pieces ("1 ticket",
  "12 photographs"), printed in the fields column. It is **decoupled** from the
  plate's recto/verso `1/1` control, which counts *views of one object*, not pieces.
  `extent > 1` is also the quiet signal that a record is file-level, not item-level
  (see below).
- **`dimensions`** stays exactly as is — the calibrated plate remains the canonical
  carrier of physical size; `dimensions` is "W x H" in mm. For folded matter it is
  the **closed** size; **`dimensions_open`** (same grammar) is the unfolded size
  and the physical row prints both: `200 × 89 mm · open 594 × 89 mm`. The plate's
  field ratio is chosen from the larger of the two and held for both states, so
  unfolding changes the object's extent on the plate, never its scale
  (`docs/brochure-fold-states-plan.md`).
- **`medium`** is not a spine field. It lives in the typed slots of the types that
  need it (e.g. sketch / prototype: medium + material) and nowhere else.
- **`source` rename.** Today `source` is overloaded: in Consumption it means
  *format / where seen* (an encounter fact); in Accumulation it means *acquisition /
  provenance* (the archival fact). Split them: Consumption's becomes **`seen_via`**;
  **`source`** is reserved for Accumulation provenance. This is the one change that
  touches existing records and needs a data migration (overhaul step 5).

---

## Admin form: example placeholders

Every editable field carries an **`example`** string in the schema, which the admin
form renders as ghosted placeholder text in the input — a reminder of the grammar
expected there. (`makeField` already supports `placeholder`; the schema's `example`
feeds it.) Today only a few fields do this (`year` → "e.g. 2024", `dimensions` →
"e.g. 89 x 54"); the requirement is to make it universal, and most useful on the
format-bearing fields. Starter examples — **edit freely**:

| field | placeholder example |
|---|---|
| title | `e.g. Lift ticket — Aiguille du Midi` |
| director / author / artist / developer / roaster | `e.g. Denis Villeneuve` / `e.g. Ursula K. Le Guin` / … |
| display_date | `e.g. March 12, 2025` |
| extent | `e.g. 1 ticket · 12 photographs` |
| dimensions | `e.g. 89 x 54` (mm, width x height) |
| context_note | `e.g. Kept from the first ascent; ink smudged at the fold.` |
| tags | `comma-separated, e.g. travel, chamonix` |
| related_ids | `one per line, e.g. EPH-2025-001` |
| year | `e.g. 2024` |
| seen_via | `e.g. theatrical, streaming, Blu-ray` |
| edition | `e.g. Penguin Classics, 1979` |
| platform | `e.g. PC, Switch` |
| status (game) | `completed / playing / abandoned` |
| origin | `e.g. Huila, Colombia` |
| process | `e.g. washed, natural` |
| varietal | `e.g. Caturra` |
| place | `e.g. Chamonix, France` |
| constellations | `autocomplete, e.g. 2026-atx-sf` |
| camera | `e.g. Pentax K1000` |
| medium | `e.g. graphite on paper` |
| material | `e.g. Bristol board` |
| duration | `e.g. 2:14` |
| note_type | `sketch / written note / idea / draft` |
| source (provenance) | `e.g. kept from the trip; gift from M.` |
| rating | `e.g. 4 / 5` |

---

## Card-visible vs. record-only

A field earns a ruled row only if it **identifies or situates** the item. Fields
that merely **elaborate** stay in the data (and surface in the note when they
matter) but get no row — the difference between a catalogue entry and a log.

- **Card-visible:** the spine, the typed slots, `note`, `related_ids`,
  `constellations`, `tags`, and the status stamp.
- **Record-only (kept in data, never a card row):** `slug`, `sort_date`,
  `created_date`, `visibility`, `inspection` mode; coffee brew parameters (method,
  grinder, ratio, dose); camera EXIF; playtime; rewatch flag; labor tools /
  collaborators; gallery/asset internals. `approximate_date` is record-only but
  feeds the date-certainty display in row 4.

Note: `rating` renders on the card (from the ingest scripts `ingest-letterboxd` /
`ingest-goodreads`) but is **ingest-managed** — marked `adminSkip` in the schema, so
it is not a hand-editable admin field. This documents the asymmetry rather than
hiding it. Open cell #3 still governs whether `rating` stays a card slot at all.

---

## Typographic register

Register encodes provenance: **monospace is the record's voice, serif is yours.**
Monospace (Commit Mono) carries the transcribed and the given — what the world or the
system supplied; serif (EB Garamond) is reserved for what you authored. This applies
to field **values**; labels are the card's own apparatus and are unaffected. For the
card only, it revises the site-wide "serif-primary, mono-for-IDs" rule (decisions.md).

Rule **(b) — provenance + register**: serif is reserved for prose and devised titles;
every discrete value, given or supplied, stays monospace as catalog data.

**Serif (your voice):**
- `context_note` — your prose.
- **title**, for Creation and Accumulation records — titles you devised (the object
  has no inherent title; you named it). Same self-vs-other axis as the creator row:
  where the creator is suppressed because the work is yours, the title is serif.
- `rating` — a hybrid: the score reads serif (your judgment), the ` / 5` scale
  suffix reads mono (the record's fixed scale).

**Monospace (the record):**
- `id`, `item_type` — system codes.
- **title**, for Consumption records — transcribed work titles (the film / book /
  album / game / coffee is *named that*; you didn't choose it).
- creator names — `director`, `author`, `artist`, `developer`, `roaster`, `issuer`,
  and a Creation `creator` (a collaborator) — transcribed names of others.
- `display_date`, `year`, `dimensions`, `extent` — given or measured facts.
- all typed-slot tokens — `seen_via`, `edition`, `music_label`, `origin`, `process`,
  `varietal`, `platform`, `play_status`, `place`, `camera`, `photo_series`,
  `medium`, `material`, `related_project`, `duration`, `video_source`, `source`,
  `note_type`.
- `tags`, `constellations`, and `see also` references — discrete index /
  navigation tokens. Constellation tokens are additionally links (they navigate
  to `/constellations/<slug>/`), styled like see-also buttons, not like prose links.

**Magnitude.** This makes the card *predominantly monospace*, with serif appearing
only in the note, your own titles, and the rating score. `display_date` and the
creator / slot rows shift from serif to mono — a deliberate, visible change. Worth
eyeballing one card of each register (`npm run dev`).

**Borderline cells — resolved:**

1. `tags` → **mono** (discrete index tokens).
2. `rating` → **serif score + mono ` / 5`** (judgment over a fixed scale).
3. `see also` → **mono** (navigation token).

**Implementation (as built).** Slot cells render mono (`cell()` in the schema); serif
is applied in `renderCard` to the note and to devised titles. The title's register
follows the per-type `titleGiven` flag via `titleIsGiven()` (true for Consumption →
mono; false for Creation / Accumulation → serif). Rating is special-cased to a serif
score with a mono ` / 5` scale. CSS: `.item-card__title--mono`, `.item-card__note p`
(now serif), `.item-card__rider` (now mono).

### Recorded decision

Moved into `docs/decisions.md` as **"Catalog card typography: register by provenance"**
(2026-06-13). This section stays the living spec.

---

## Level of description (item vs. file)

A "photo series" is not an item but a **file-level** record with member items —
the level-of-description gap noted in the catalog-card analysis. Model it as one
record whose `extent` is "n photographs" and whose plate is the contact sheet, with
each frame an item-level card linked by `part_of`. The card never stretches one
plate across several objects (that breaks the scale logic); instead, `extent > 1`
quietly signals a collection rather than a thing.

---

## Open cells for your review

These are the judgment calls worth your eye before anything is coded:

1. **Music slot 2** — "label / source" is weak, since album/ep/single/mix already
   live in `item_type`. Alternatives: album name (for singles/tracks), or drop to
   two slots.
2. **Book slot 2** — "edition" vs. publisher vs. nothing.
3. **`rating` everywhere** — keep it as slot 3 across all Consumption types? It is a
   personal-log signal, not an archival element; it is the clearest survival of the
   Letterboxd/Goodreads lineage. Keep, or demote to record-only?
4. **`note` (note_type) slot 1** — does a textual note want a card plate at all, or
   is it a fields-only record?
5. **Description-control line** ("described by / on") — deferred here; it is the most
   on-theme possible addition given the project's human–AI provenance thesis, but
   adds a row. In or out of v1?

---

## Recorded decision

Moved into `docs/decisions.md` as **"Item card field schema: spine + typed slots"**
(2026-06-13), extending the "Default item inspection: catalog card" decision. This
file stays the living spec — resolve the open cells above here, and reflect any
change in `src/shared/field-schema.js`.
