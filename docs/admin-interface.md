# Admin Interface

## Purpose

This project should include a private or protected admin-facing interface for adding and managing archive items without manually editing repository files.

The admin interface exists to support a living archive. It should reduce friction for ongoing entry while preserving the same archival logic, metadata standards, and structural consistency used by the public site.

This interface is not part of the public-facing archive experience. It is a maintenance tool for creating, editing, drafting, and organizing records that the build script (`scripts/build-data.js`) ingests into the public site.

## Implementation (as built)

The admin is implemented as a single-page three-pane TUI shell modeled on a vim-style database client. Visited at `/admin.html`. Full design history is in [`docs/admin-tui-overhaul.md`](admin-tui-overhaul.md); this section is a summary of the current behavior.

### Layout

Three panes inside a centered window, each with a notched `[letter] Name` label and draggable gutters between them (sizes persisted to `localStorage`). The window sits on a slightly darker tray-grey backdrop.

- **`[e] Explorer`** (left) — a collapsible tree of the archive. Top-level groups are the five series (Identity, Labor, Consumption, Creation, Accumulation). Each series expands to its subcollections, and each subcollection expands to its items. Click an item to open it in the Record pane.
- **`[r] Record`** (top-right) — context-driven. Default is a slim empty state (a hint line plus a short Needs-attention list, max 5 rows). Clicking an Explorer leaf renders that item's edit form here. The `:new <type>` command renders the new-item wizard here. Cancel returns to the empty state.
- **`[l] Log`** (bottom-right) — pending changes in `git status` shorthand (`M` ink, `A` green, `D` red), a commit button bundling everything into a single GitHub commit via `commitAll()`, and a session-scoped history (last 5 commits with time + summary + ok/fail).

A topbar above all three carries `ARCHIVE_SYS` identity on the left and a contextual breadcrumb (`edit › ITEM-ID`, etc.) on the right. A two-row status bar below: state line (state text + mode chip + clock) and contextual keymap legend.

### Mode reference

| Mode    | Chip color | Behavior                                                                      |
| ------- | ---------- | ----------------------------------------------------------------------------- |
| NORMAL  | blue       | Keyboard shortcuts fire. No editable input has focus.                         |
| INSERT  | green      | A text input has focus. Keys flow to it. Esc returns to NORMAL.               |
| COMMAND | violet     | `:` command bar is open inline in the state row. Enter executes; Esc cancels. |
| FILTER  | cyan       | `/` filter bar is open at the top of a list-bearing pane.                     |

Auto-transitions: focusing any editable input flips NORMAL → INSERT; blurring returns to NORMAL. INSERT can be entered explicitly from NORMAL with `i` or `a` (focuses the first editable field in the focused pane).

### Default keymap

The keymap legend at the bottom of the window is contextual on `(mode, focused pane)` — what's shown reflects what's bound right now. The full reference (toggle with `?` to expand the legend, or refer here):

**NORMAL — when Explorer is focused**

- `j` / `k` — navigate up/down *(deferred; visible in legend but not yet bound)*
- `h` / `l` — collapse / expand *(deferred)*
- `Enter` — open the highlighted leaf *(deferred — click instead)*
- `/` — open filter
- `r` — focus Record pane
- `l` — focus Log pane
- `:` — open command bar

**NORMAL — when Record is focused**

- `i` / `a` — enter INSERT on the first editable field
- `Esc` — return to NORMAL (blurs the input)
- `:w` — save / commit
- `e` — focus Explorer
- `l` — focus Log

**NORMAL — when Log is focused**

- `Enter` — open the highlighted record *(deferred — click instead)*
- `:w` — commit pending
- `e` — focus Explorer
- `r` — focus Record

**COMMAND** — typed after `:`

- `:w` — bundle all pending changes into one GitHub commit
- `:q` — close the current record (return to empty state)
- `:e <id>` — open record by id (e.g. `:e FILM-0042`)
- `:new <type>` — open the new-item wizard with the type preset (e.g. `:new ticket`). Typing `:new ` (with a trailing space) lists every record type as a suggestion, each tagged with its series; keep typing to filter, then Tab/Enter/click to pick.
- `:nohl` — clear the persistent filter-match tint
- `:help` — toggle expanded keymap legend
- `:logout` — clear the passkey session (`POST /api/logout`) and return to `/gate`
- Tab — complete the single highlighted suggestion
- ArrowDown / ArrowUp — navigate suggestions
- Esc — cancel

**FILTER** — typed after `/` while Explorer is focused

- Substring matching by default. Prefix the query with `~` for fuzzy (subsequence) matching.
- Enter — open the first matching item
- Esc — close the filter input; matched rows keep a persistent orange tint until `:nohl` clears them.

### Mobile fallback

At ≤700px the three-pane grid collapses to a single visible pane controlled by an iOS-style bottom tabstrip (`[e] [r] [l]`). Vim modality strictly disables — no keyboard shortcuts fire, and the mode chip, clock, and keymap legend hide. Tapping an item in Explorer auto-switches the active tab to Record. The status row collapses to its state-text only. Form fields keep the 16px minimum to suppress iOS zoom-on-focus.

### Status row palette

The state text color reflects the current operation kind: yellow for pending edits, violet for in-flight (loading the archive or committing), green for completed saves, red for errors. A braille spinner (`⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏`) cycles via CSS as a `::before` on the loading and saving states. The full animation catalog is documented in `docs/admin-tui-overhaul.md` under "Animation language."

### File map

| File                                  | Role                                                                               |
| ------------------------------------- | ---------------------------------------------------------------------------------- |
| `admin.html`                          | entry point — single `#admin-app` root                                             |
| `src/admin/main.js`                   | orchestrator — wires every module on init                                          |
| `src/admin/shell.js`                  | three-pane grid, gutter drag-to-resize, Record pane API                            |
| `src/admin/modes.js`                  | global keydown handler, mode transitions, command bar                              |
| `src/admin/statusline.js`             | state text, mode chip, contextual keymap legend, focused-pane tracking             |
| `src/admin/views/explorer.js`         | tree render + filter (Phase 2 + 6.5)                                               |
| `src/admin/views/dashboard.js`        | Record-pane empty state                                                            |
| `src/admin/views/edit-item.js`        | edit form view                                                                     |
| `src/admin/views/new-item.js`         | new-item wizard (type → depth → form)                                              |
| `src/admin/views/log.js`              | Log pane (pending list + commit button + session history)                          |
| `src/admin/views/guide.js`            | Guide form — a description row per desk object + the intro; writes `src/content/guide.md` (front matter + body) |
| `src/admin/forms/`                    | form-renderer + base/type field definitions                                        |
| `src/admin/lib/`                      | api.js (load/commit), serializer.js, id-generator.js, slug-generator.js, upload.js |
| `src/styles/tokens.css` (admin block) | cool-grey + Solarized palette under `[data-theme="admin"]`                         |
| `src/admin/styles.css`                | everything else                                                                    |

## Goals

- make it easy to add new archive items
- support both quick logging and full archival entry
- preserve metadata consistency
- generate or validate IDs and slugs
- support asset upload and organization
- support drafts and incomplete records
- support relationships between records
- work with the 11ty + GitHub + Netlify workflow
- minimize the need to manually touch repository files for routine entry

## Non-goals

The admin interface should not:

- become a full custom CMS unless necessary
- allow arbitrary schema-breaking content entry
- prioritize visual flourish over speed and clarity
- expose the entire repository structure to the editor
- require technical knowledge for normal archive entry

## Core principle

The admin interface should reflect the archive’s structure:

- collection
- series
- subcollection
- item
- related item

It should make that hierarchy easy to use rather than hiding it entirely.

## Access and protection

The deployed admin is gated by a WebAuthn passkey. There is no password and no
recovery flow. The mechanism — a stateless HMAC-signed session cookie issued
only after a verified passkey assertion, enforced by a Netlify Edge Function in
front of `/admin` and re-checked inside the privileged Functions — is specified
in full in [`admin-gate.md`](admin-gate.md).

As built:

- `/admin`, `/admin/*`, `/admin.html` → blocked by the `admin-gate` Edge
  Function; no valid `bf_sess` cookie → 302 to `/gate`.
- `/gate` → a press-and-hold canvas (recolored to the admin palette) that runs
  the passkey ceremony and, on success, sets the session cookie and redirects
  to `/admin`.
- `/api/commit-all` and `/api/r2-upload-url` → re-check the same cookie and
  return 401 to any unauthenticated caller, before any GitHub/R2 work.
- Local `npm run dev` (Vite alone) is intentionally **not** gated — fast local
  work, writes go to disk via the dev plugin. The gate only applies to the
  Netlify build; exercise it locally with `npm run dev:netlify`.

Route style still follows the original recommendation: separate from the public
archive, simpler visual style, speed and form clarity over atmosphere.

## Primary modes

The admin interface should have at least two entry modes.

### 1. Quick log mode

Use for:

- films watched
- books read
- coffee entries
- simple references
- fast recurring records

Requirements:

- minimal required fields
- optional asset upload
- fast save
- support for saving as draft or complete
- easy repeat entry

This mode should feel lightweight and repeatable.

### 2. Full archival entry mode

Use for:

- projects
- prototypes
- sketches worth preserving
- scans
- ephemera
- documents
- meaningful references
- records needing multiple assets or related items

Requirements:

- full metadata form
- relationship management
- multiple assets
- inspection mode options
- contextual notes
- draft / partial / published states

This mode should support richer archival treatment.

## Main workflows

### New item

1. Choose series.
2. Choose subcollection.
3. Choose item type.
4. Choose quick log or full entry mode.
5. Fill required metadata.
6. Add optional metadata.
7. Upload or reference assets.
8. Set status.
9. Link related items if available.
10. Save draft or publish.

### Edit item

1. Search or browse existing records.
2. Open record.
3. Edit metadata, assets, or relationships.
4. Save changes.
5. Preserve stable ID and slug unless explicitly changed.

### Promote item

A lightweight record should be promotable into a full archival record.

Example:

- a coffee log entry later becomes a richer entry with bag scans, tasting notes, and linked brew records
- a film log later becomes a full record with note, stills, and related influences
- an ephemera item later becomes a contextualized archival record

## Required interface sections

### Dashboard

Should show:

- recent drafts
- recent published items
- incomplete items needing metadata
- quick links to common entry types
- counts by series or status

### New item form

Must support:

- series selection
- subcollection selection
- item type selection
- record depth selection
- required metadata
- optional metadata
- assets
- relationships
- status

### Existing items

Must support:

- search by title / ID / slug
- filter by series
- filter by subcollection
- filter by type
- filter by status
- sort by date modified
- sort by date created

### Asset handling

Must support:

- upload
- preview
- assign asset roles
- front/back pairing
- thumbnail selection
- ordering for galleries or sequences

### Background cut-out (red-backing scans)

Items scanned on a colored backing (see `docs/carrier-sheet-cutout-plan.md`) can be cut
out to a transparent silhouette at upload time, in the browser. The ordered-image uploader
(documents, galleries, labor images) shows a **"remove backing (cut out)"** checkbox:

- It **auto-detects** a uniform colored border from the first selected file and pre-ticks
  itself; it is always overridable. Border sampling keys whatever color is there — red,
  blue, or black — so there is no color picker.
- An **advanced** panel exposes `tolerance` (LAB distance, default 20) and `defringe`
  (edge erosion in px, default 2) for tricky scans, e.g. thin paper on red.
- When on, the **raw scan is kept as the master** and the cut-out drives the website. Per
  cut-out item, R2 holds: `originals/<base>.<ext>` (raw master), `cutouts/<base>-cut.png`
  (full-res transparent), `display/<base>-web.webp` and `thumbnails/<base>-thumb.webp`
  (web-size + thumbnail, both WebP with alpha). When off, behavior is unchanged (opaque
  JPEG thumbnail + WebP display).

The algorithm is shared with the `scripts/cutout-red-background.js` batch CLI via
`src/shared/cutout.js`, so client-side and CLI results are identical. Cut-out provenance
(tolerance, defringe) is recorded on the asset.

### Relationship editor

Must support:

- linking to existing records
- specifying relationship type
- viewing linked records
- preserving bidirectional clarity where useful

### Constellation intake

Any item form (every type except Identity) carries a **constellations** input
that assigns the item to one or more constellations (see decisions.md →
"Constellations: cross-series grouping"). The input is a token field: assigned
constellations render as removable chips; the free-text cursor after the last
chip drives autocomplete.

**Autocomplete.** Typing filters the constellation registry (loaded with the
archive; the same data `build-data.js` reads from `src/content/constellations/`),
matching against slug and title. The suggestion list reuses the `:new `
suggestion pattern from the command bar — each row shows `slug — title`, with a
member count; ArrowUp/ArrowDown navigate, Tab/Enter/click select, Esc closes.
Matching is substring by default, `~`-prefixed for fuzzy, consistent with the
Explorer filter. Selecting appends a chip; the field accepts any number of
chips (the data model is an array).

**Inline creation.** When the query matches nothing, the last suggestion row is
always **`+ new constellation "<query>"`**. Selecting it opens a minimal inline
sub-form in place of the suggestion list: title (prefilled from the query),
slug (suggested year-first kebab-case via `slug-generator.js`, e.g.
`2026-atx-sf`; editable; collision-checked against the registry), optional date
range, optional note. Confirming (a) stages a new registry file
`src/content/constellations/<slug>.md` as an `A` entry in the Log pane's
pending changes, bundled into the same commit as the item, and (b) appends the
chip to the current item. Cancel returns to the suggestion list. A constellation
therefore never has to be created outside the flow of cataloguing the item that
prompted it.

**Modality and mobile.** The input is an ordinary editable field: focusing it
enters INSERT; Esc first closes the suggestion list, then blurs to NORMAL. On
mobile the same field works by tap — native focus, 16px minimum font, the
suggestion list tap-selectable, chips removed by tapping their ✕. No
vim-dependent behavior is required for any part of the flow.

**Vocabulary control.** The registry is the only source of assignable values —
free text never lands in an item's `constellations` array except through the
create path. This keeps the field a controlled vocabulary rather than a second
tag field, which is what separates constellations from tags in the first place.

## Field behavior

The admin interface should use the schemas defined in `content-model.md`.

Behavior rules:

- series determines available subcollections
- item type determines visible fields
- record depth determines required complexity
- defaults should be smart and conservative
- date fields should support exact or approximate dates
- optional fields should stay hidden until needed
- validation should prevent malformed entries

## Suggested form structure

### Base fields for most items

- title
- series
- subcollection
- item type
- status
- display date
- sort date
- tags
- constellations
- context note
- source
- related items

### Type-specific fields

Examples:

#### Film log

- title
- watch date
- year
- director
- source / format
- rating
- notes

#### Coffee

- roaster
- coffee name
- brew date
- origin
- process
- tasting notes
- brew method
- bag scan / bag photos

#### Project

- title
- date / date range
- role
- summary
- collaborators
- tools
- assets
- supporting documents
- related prototypes

#### Ephemera

- title
- subtype
- date
- place
- constellations
- front asset
- back asset
- dimensions
- note

## IDs and slugs

The interface should generate suggested IDs and slugs automatically.

Rules:

- IDs should follow the project naming scheme
- slugs should be human-readable and stable
- users may override with care
- collisions should be detected before save

Examples:

- FILM-2026-001
- COFFEE-2026-004
- PROJ-2025-002
- EPH-2024-017

The admin UI should not require users to manually understand file naming unless needed.

## Status model

Suggested statuses:

- draft
- partial
- complete
- published

Definitions:

- draft: rough entry, incomplete
- partial: identifiable but missing some metadata or assets
- complete: internally finished, ready for review
- published: visible on public site

The interface should make incomplete states normal and supported.

## Asset model

The admin interface should distinguish between:

- original source asset
- web asset
- thumbnail
- cut-out asset (transparent PNG silhouette derived from a backing scan)
- detail asset
- front/back asset
- gallery asset
- model asset
- PDF / document asset

It should support:

- file upload
- role assignment
- ordering
- captions
- alt text / descriptive note
- visibility / publication readiness

## Inspection settings

The interface should allow each item to declare inspection behavior.

Suggested options:

- none
- simple
- rich

Definitions:

- none: no inspection behavior beyond standard page view
- simple: zoom, enlarge, gallery, front/back
- rich: multi-state inspection, rotation, unfolding, or 3D

The interface should not assume all items need inspection.

## Search and browse support

Because the public archive relies on retrieval, the admin interface should encourage clean metadata entry for:

- dates
- type
- tags
- constellations
- places
- people
- source
- related items

These fields should be treated as retrieval infrastructure, not optional decoration.

## Writing guidance inside the admin interface

Field labels and help text should support the archive’s tone:

- clear
- concise
- non-corporate
- non-startup
- not overly academic

Example:

- use “context note” instead of “marketing description”
- use “related items” instead of “recommendations”
- use “series” and “subcollection” where useful
- use “inspection behavior” instead of “interactive mode” if that is clearer

## Draft management

The admin interface should make it easy to:

- save incomplete records
- resume drafts
- identify records missing assets
- identify records missing dates
- identify orphaned items without relationships
- identify records needing review before publishing

This is especially important for a living archive where backlog is normal.

## Technical implementation

Decided: a custom GitHub-backed admin built into the same Vite app as the public site, served from `/admin.html`. Writes go through `commitAll()` in `src/admin/lib/api.js`, which POSTs to a Netlify function (`/api/commit-all`) that batches files into a single GitHub commit. Assets upload to Cloudflare R2 via `/api/r2-upload-url`. No external CMS dependency.

Earlier deferred options (Decap CMS, local-only tool) are documented in [`docs/decisions.md`](decisions.md) as superseded.

## Admin overhaul phases

The TUI overhaul shipped over a sequence of phases captured in detail in [`docs/admin-tui-overhaul.md`](admin-tui-overhaul.md). At the time of writing all phases (0 through 8) are complete; that document is the source of truth for the rationale behind each step and for the current open questions.

## Success criteria

The admin interface is successful if:

- adding a film, coffee, or ephemera item feels easy
- adding a project or prototype feels structured, not overwhelming
- the public archive remains consistent
- metadata quality stays high enough for search and browse
- drafts are normal and manageable
- archive growth does not require constant manual repo work