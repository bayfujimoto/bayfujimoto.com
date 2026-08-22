# Constellations (formerly: Cross-Series Lists)

- status: **Phase 1 decided** (2026-08-22) — field, registry, and flat route confirmed; the desk meta-object remains open
- concept name: **Constellations** (decided 2026-08-22; see *Candidate names* below for the field considered)
- data relationship: cross-reference / index (confirmed)
- physical object: undecided — see *Candidate objects* below

## Phase 1 decision (2026-08-22)

The concept enters the archive metadata-first, before any desk object. Recorded
in `docs/decisions.md` → "Constellations: cross-series grouping"; summarized:

- Items (all types except Identity) carry an optional `constellations` **array**
  of slugs — the many-to-many shape below, realized item-side.
- Each constellation is a registry record at
  `src/content/constellations/<slug>.md` (title, slug, date range, optional
  note); `build-data.js` derives membership and warns on unresolved slugs.
  Slugs are year-first kebab-case when dated (`2026-atx-sf`).
- The Accumulation `event` field is retired: grouping values migrate to
  constellations, source-context values reclassify into `source`/`context_note`.
- Tags stay separate — in practice they are occasion descriptors (venue,
  companions, format), not contexts.
- A flat route `/constellations/<slug>/` renders each constellation now, reusing
  the Accumulation contact-sheet grid, chronological and cross-series. Catalog
  cards print constellations as clickable riders pointing there. Admin intake
  autocompletes against the registry with inline creation
  (`docs/admin-interface.md`).
- Deferred to the meta-object phase: curation (authored order, per-item
  captions), the desk object, and its placement. Phase 1 membership is
  exhaustive and derived; the curated layer will sit on top of it.

The sections below remain the working record for what is still open — the
physical object, its placement, and the curated layer.

## Outline

This document records a feature that is wanted but not yet designed: an additional object on the desk that holds a set of *lists*, where each list gathers a selection of existing archive items drawn from several different series at once.

The originating example is a road trip. A list titled "Austin → SF" would collect the music listened to on the drive (Consumption), the ephemera picked up along the way (Accumulation), the photographs taken (Creation), and whatever else belongs to that stretch of time — each item pulled from its own series but assembled here under a single heading. Other lists might be organized around a theme rather than an event: a recurring preoccupation, a place returned to, a person, a season.

The essential move is *lateral*. Everything else in the archive is arranged by what a thing is and where it came from. This object is arranged by what a thing is *about*, or *when* it happened, or *why* it was kept together — a second way of cutting the same material.

## Why this is structurally different

The archive's existing hierarchy is arranged by provenance. Collection → Series → Subcollection → Item, and each item lives in exactly one place: a film in Consumption, a ticket in Accumulation, a print in Creation. This is faithful to the oldest principle in archival practice — *respect des fonds*, the rule that records should be kept according to their origin rather than reorganized by subject. The nineteenth-century archivists who formalized this principle (the Dutch manual of Muller, Feith, and Fruin; later Jenkinson) did so specifically in reaction against subject-based rearrangement, which they regarded as the imposition of a later cataloguer's categories onto records that carried their own order. Terry Cook's essays on the fonds trace how durable that commitment has been: provenance won, and pertinence — arrangement by topic — was largely abandoned as an arrangement principle.

But subject access never actually went away; it was relocated. What the archivists rejected as a way of *arranging* records they preserved as a way of *describing* them: the finding aid, the index, the topical guide, the cross-reference. The item stays where its provenance puts it, and a separate layer points across the collection to gather items that share a subject. This is the modern resolution of the provenance/pertinence tension — keep original order intact, and lay an access layer over the top.

The object proposed here is exactly that access layer, given a physical form on the desk. It does not move any item out of its series. It points.

There is a specific precedent worth naming, because it describes the data model almost exactly. In 1966 the Australian archivist Peter J. Scott dismantled the assumption that a record must sit at a single fixed position in one rigid tree. His "series system" separated records from their multiple contexts and allowed *many-to-many* relationships between them — one record could be linked to several contexts, one context to many records, without any of them being physically re-filed. That is the shape of this feature: a list is a context, an item can belong to many lists, and nothing is duplicated or moved to make it so.

Two older, more essayistic precedents describe the *feeling* of the thing rather than its plumbing. Aby Warburg's *Mnemosyne Atlas* arranged images across origin, medium, and century onto shared panels according to theme and gesture — a method of gathering that ignored where things came from in order to make a different kind of sense visible. Walter Benjamin's *Arcades Project* did something adjacent with its convolutes: thematic bundles into which fragments from unrelated sources were dropped because they belonged to the same preoccupation. Benjamin already appears in `desk-objects.md`, on unpacking his library; this object is the other half of his practice — not the collection arranged by its owner's private order, but the montage assembled around a subject.

## Candidate names

**Resolved: Constellations** (2026-08-22). The field considered is kept below as
a record of the reasoning. The name should not collide with the five series
(which are nouns of domain: Labor, Consumption, Creation, Accumulation,
Identity) and should read as a lateral, gathering concept.

- **Threads** — each list is a thread pulled through the archive, gathering items across series. Emphasizes continuity and tracing; pairs naturally with a physical object made of actual thread or string (though note the string-tied bundle already uses string as its closure — see *Constraints*).
- **Occasions** — each list is an occasion or episode: a trip, a period, a spell of attention. Emphasizes the event framing that the road-trip example leads with.
- **Passages** — each list is a passage through time or place. Fits the road-trip example directly; carries a secondary sense of a passage of text, which suits an archive.
- **Constellations** — each list is a figure drawn between scattered points that are not otherwise near each other. Accurate to the many-to-many structure; risks preciousness.
- **Convolutes** — Benjamin's own term for his thematic bundles. Precise and literary, but obscure enough to need explaining, which cuts against the finding-aid legibility the project values.

Not recommended: anything that reads as a generic UI element ("Collections", "Playlists", "Boards", "Tags"). The archive's whole premise is to avoid portfolio and app vocabulary.

## Candidate objects

The choice of physical object is open. Three sketches follow, with the constraints they have to satisfy noted afterward. Interaction type (expansion vs. contraption, per `desk-objects.md`) is proposed but not fixed.

**A card-catalog drawer.** A single long wooden drawer of the kind pulled from a library card cabinet, resting on the desk. Each list is a tabbed card standing in the drawer; the tab carries the list's title. This is the finding-aid object par excellence — the card catalog *is* the historical instrument for subject access laid over a collection arranged by other means, which makes it almost too on-the-nose, but honestly so. Interaction: expansion — clicking opens the drawer and the cards fan up, each card independently selectable, each card opening to its gathered items. Strength: it declares exactly what the object does. Risk: it is the most literal possible choice, and literalness is a documented danger for this project (see the dossier's discussion of the folder-on-a-desk cliché).

**A folded map.** A paper map folded down to a rectangle, worn along the creases. Unfolding it reveals routes and marked locations; each mark is a list, and following a route enters it. This one is strongest for the event/place register — it fits "Austin → SF" literally — and it reads unmistakably from directly above. Interaction: expansion, unfolding in stages. Strength: it makes the lateral, across-the-territory quality of the object visible. Risk: it biases the concept toward *journeys* and *places*, and may fit a theme-based list ("a preoccupation with X") awkwardly. It also implies geography where sometimes there is only chronology or affinity.

**A spool or hank of thread, or a set of tagged string tabs.** If the concept is named *Threads*, the object is literal: a spool from which threads run out to the objects they connect, or a small bundle of paper tags each on its own length of string. Interaction: could be either — pulling a thread (contraption) or letting the bundle fall open (expansion). Strength: it visualizes the many-to-many linking directly; a thread physically touching several other objects is the clearest possible image of an item belonging to a list without leaving its series. Risk: the string-tied bundle (Accumulation) already claims string as its material, and the desk cannot support two string objects without them reading as a pair or diluting each other — the same reasoning that removed the wax seal from the bundle applies here.

Other forms considered and set aside for now: a bound ledger or index (conflicts with Consumption's ledger interior metaphor); a pegboard strung with connecting lines (the "red-string board" — too kitsch, reads as conspiracy rather than archive); a stack of loose index cards without a drawer (weaker silhouette from above, too close to the dossier's loose documents).

### Constraints any object must satisfy

- Must read as distinct from the existing objects when seen from directly overhead, since the camera does not move. No two silhouettes should be confusable.
- Must not reuse a material or gesture that already carries meaning elsewhere (string → Accumulation; stamp/mark → Creation; key/tag → Guide; ledger → Consumption interior).
- Must survive the same test the whole desk survives: it should imply a person and a practice without a label, and it should reward inspection rather than merely announcing a function.
- Should degrade gracefully to a flat, legible list on mobile and with 3D disabled, like everything else (see `CLAUDE.md` mobile and accessibility requirements).

## Data model (provisional)

Direction confirmed: **cross-reference / index**. Items are never moved or duplicated. A list is a record whose body is an ordered set of references to item IDs that live in their own series.

A plausible shape, consistent with the existing YAML/Markdown ingest (`scripts/build-data.js`):

- A new content type, e.g. `src/content/lists/<list-slug>.md`, one file per list.
- Front matter carries the list's own metadata: `id`, `slug`, `title`, `display_date` or a date range, `status`, an optional `note`.
- The body (or a front-matter `items:` array) holds an ordered list of member item IDs — `FILM-2026-001`, `EPH-2025-041`, `PRINT-2025-014`, and so on — optionally with a per-item caption specific to this list ("the song that was playing crossing the state line").
- `build-data.js` resolves each ID against the already-built item set and attaches the full item record to the list at build time. Unresolved IDs should surface as build warnings, not silent gaps.

Consequences that follow from the index model and should be designed for:

- **Many-to-many.** An item can appear in any number of lists; a list draws from any number of series. Neither side owns the other.
- **Backlinks.** Because the relationship is a reference, an item can know which lists include it. The item inspection modal could show "appears in: Austin → SF, Late Nights 2025" as related context — a cheap, high-value byproduct of the model. Optional, but the data supports it for free.
- **Ordering within a list.** Lists are curated sequences, not query results, so member order is authored, not derived. (This is the key difference from the next point.)
- **Relationship to existing filters.** Accumulation already uses event slugs like `/accumulation/sxsw-2026/` to filter one series by event. This object generalizes that idea across *all* series and makes it a curated object rather than a metadata filter. The two should be reconciled: an Accumulation event view could be understood as the single-series shadow of a cross-series list, or the list could subsume it. Worth deciding before both exist independently. (See `decisions.md` → Accumulation URL model, and the Phase 7 grouping work.)

Provisional URL shape, following the existing scheme:

```
/constellations/                        the object's interior: all constellations (deferred to meta-object phase)
/constellations/2026-atx-sf/            one constellation, its gathered items (Phase 1: chronological; authored order deferred)
/constellations/2026-atx-sf/?item=FILM-2026-001   deep-link to an item's inspection, opened from this constellation's context
```

## Open questions

Several of these were resolved by the Phase 1 decision (2026-08-22): the data
model is item-side field + registry (a variation on the list-record shape
sketched above — membership is authored on the item, derived on the
constellation); membership is exhaustive-by-field for now, with curation
deferred; a constellation carries its own optional note; the Accumulation event
filter is subsumed. What follows is kept for the record; the still-open
questions are the object, its placement, list-of-lists nesting, and shelf
ordering.

- **Series or meta-object?** This may not belong beside the five series at all. Functionally it is an *access layer over the archive* rather than a *domain of content* — which makes it a sibling of the Guide (the finding aid, the only other object that describes the archive rather than adding to it) more than a sibling of Consumption. Its object might therefore want to sit near the key, at the same slight remove, rather than in the ring of series objects. This is the first thing to resolve, because it determines placement, naming register, and metaphor.
- **Curated or exhaustive?** Is a list a hand-picked selection ("the fifteen things that matter from that trip"), or does it aim to gather *everything* tagged to that event? The road-trip example reads as curated. Curated is more consistent with the archive's stated preference for significance and selective highlighting over completeness (see `decisions.md` → Accumulation scale, Content thresholds). Recommend curated by default, exhaustive never assumed.
- **Does a list carry its own writing?** A short reflective note per list (a paragraph on what the trip was) would give the object a voice the raw item set lacks — consistent with "concise notes by default, longer writing selectively" (`decisions.md` → Writing density). Probably yes, optional per list.
- **Ordering of lists on the shelf.** Chronological, by significance, or manual? Manual arrangement fits an object that is itself an act of curation.
- **Can a list contain another list, or only items?** Recommend items only, at least initially, to avoid a second nested hierarchy competing with the series tree.
- **Naming and object, still open** — see the two sections above.

## Relationship to existing docs

- `docs/desk-objects.md` — the register and reasoning this object should match; add the chosen object here once decided.
- `docs/information-architecture.md` — the hierarchy this object sits lateral to; the URL scheme and ingest conventions to extend.
- `docs/decisions.md` — carries the pointer to this doc as an open question; the Accumulation URL/event-slug decisions to reconcile against.
- `docs/content-model.md` — where a new `list` record type would be defined once the model is confirmed.
