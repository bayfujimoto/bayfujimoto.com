# Admin TUI Overhaul

Plan of record for the admin redesign that reshapes the admin page into a three-pane TUI shell modeled on a vim-style database client (see `docs/tui.gif`). Living document — updated as decisions land.

Last updated: 2026-05-12.

## Purpose

Replace the current single-pane admin (Dashboard / Browse / New / Edit, navigated via slash-command bar) with a persistent multi-pane shell that reads more like a tool than a website. The archive is large and growing; a tree + record + log layout fits the archival workflow better than a routed-views model and lets keyboard-first navigation actually carry its weight.

## Summary

The overhaul shipped in ten phases (0 through 9) over a series of work sessions. The starting point was the pre-overhaul admin: an amber-on-black single-pane CRT-styled interface with four routed views (Dashboard, Browse, New, Edit) navigated through a slash-activated command bar. The endpoint is a three-pane TUI shell with vim-style modal interaction, light grey + Solarized accents, in-pane filter, mobile fallback, and a single self-documenting keymap legend at the bottom of the window.

What concretely landed:

- **A persistent three-pane shell** (Explorer / Record / Log) inside a centered window. Each pane has a notched `[letter] Name` label and a draggable gutter to its neighbor, with sizes persisted to `localStorage`. The horizontal gutter between Record and Log is wider than the vertical (16px vs 6px) to give the right column breathing room.
- **A cool-grey light theme with Solarized accents** scoped under `[data-theme="admin"]` in shared `tokens.css`. The public site palette is untouched. Vibrant ink (`--fg`) is reserved for active/focused text; default body text sits at medium charcoal (`--fg-muted`). Blue is reserved for the `-- NORMAL --` mode chip — every other accent (green, violet, red, yellow, orange, cyan) carries a specific semantic role.
- **A collapsible Explorer tree** mirroring the archive's shape (root → series → subcollection → item) with `▼`/`▶` markers, per-group counts, dim "(empty)" labels, an item-loading progress bar at the bottom (violet, slim), and expansion state persisted to `localStorage`.
- **A Record pane** that hosts the empty state, the edit form (refactored from the routed `edit-item.js`), or the new-item wizard. Form chrome lost the `>` input prompts and `[ ]` bracketed buttons; inputs and buttons now read as proper light-theme controls. The wizard's `onClose` callback returns to the empty state.
- **A Log pane** that shows pending changes in `git status` shorthand (`M`/`A`/`D` action prefix with semantic color), an inline commit button, and a session-scoped commit history. The two-layer selection idiom from the gif (row tint + brighter action cell) lives here.
- **A reactive statusline module** (`src/admin/statusline.js`) carrying state text, mode chip, contextual keymap legend, focused-pane tracking, and help-expanded toggle. Click any pane to focus it; the legend updates to that pane's bindings.
- **A vim mode engine** (`src/admin/modes.js`) with NORMAL / INSERT / COMMAND / FILTER modes. Auto-INSERT on focusing an editable input; auto-NORMAL on blur. `:` opens an inline command bar in the state row with Tab-complete suggestions. `?` expands the keymap legend to show every binding by (mode, pane).
- **An in-pane filter** in the Explorer with substring matching by default, `~`-prefix fuzzy mode, character-level orange highlight on matched chars, tree-shrink-to-matches behavior with auto-expanded ancestors, and a persistent match tint after Esc until `:nohl` clears it.
- **A mobile fallback** at ≤700px — single visible pane controlled by a bottom iOS-style tabstrip, vim modality strictly disabled, mode chip + clock + legend hidden, status row collapsed to state text only. Opening an item from Explorer auto-switches the active tab to Record.
- **A braille spinner** that cycles via CSS `@keyframes` with `content` steps on `::before`, applied to status-row "loading" and "saving" states, plus the Log pane's commit-in-flight header.
- **A cleanup pass** that removed the dormant `.admin-cmdbar` block (which was secretly overriding the Phase 6 command input via cascade — a latent bug), the `--cmdbar-h` token, dead `.admin-main` rules, and stale `getMainContainer` references in `new-item.js`. The new-item wizard now accepts an `onClose` callback.
- **Docs updates** — `docs/admin-interface.md` got an "Implementation (as built)" section near the top with the mode reference, full keymap, command catalog, mobile fallback notes, and a file map. `docs/decisions.md` got four new confirmed decisions covering the architecture, modality, palette, and mobile model. `CLAUDE.md` got minor amendments for touch targets and the core-docs list.

The branch is `feature/tui-shell` off `main`, all changes uncommitted at time of writing.

## Visual reference

The driving reference is `docs/tui.gif`, a ~15-second recording of a SQLite TUI client. Extracted frames are kept under `docs/tui-frames/` if needed for review. Observed properties that drive the design:

The interface is a fixed three-pane shell — Explorer on the left, Query/Record top-right, Results/Log bottom-right — with a notched `[letter] Name` label cut into the top border of each pane (the bracketed letter is the keyboard shortcut to focus that pane). The bottom of the window holds a two-row status bar: an upper state row carrying a mode indicator (`-- NORMAL --`), a colored persistent status segment (the gif's green "Connected to Performance Test DB …"), a clock, and a trailing meta segment; and a lower keymap legend that updates contextually based on `(mode, focused pane)` — so when the user enters search mode in the Results pane, the legend changes from `View cell: v   Update: u   Copy cell: y …` to `Close: esc   Select: enter`.

Search is in-pane, not in the status bar: pressing `/` while a list-bearing pane is focused opens a filter input at the top of that pane's body (`/ query   matched/total`), with character-level match highlighting on visible rows. Two modes are available: substring (default) and fuzzy (prefix `~`). On Esc the input closes but matched rows retain a subtle background tint until cleared. Selection has two layers: a row-level highlight (faint background tint) and an active-cell highlight (brighter background on a single column). The Explorer pane carries a slim progress bar at the bottom of its body that fills and drains during loading operations. Pane focus is visible: focused pane gets a noticeably brighter border, unfocused panes dim.

## Direction summary

Decisions locked in so far:

- **Layout**: persistent three-pane shell (Explorer / Record / Log) inside the existing centered window frame, with drag-to-resize gutters between panes and sizes persisted to `localStorage`.
- **Interaction model**: full vim modality — NORMAL, INSERT, COMMAND, FILTER modes; single-letter pane focus (`e`/`r`/`l`); `j`/`k`/`h`/`l` for navigation; `i` to enter inputs; Esc to leave; `:` for commands; `/` for in-pane filter.
- **Color scheme** (revised 2026-05-12): cool neutral light grey base (~#e8eaed), Solarized-light-inspired multi-accent palette, status/topbar as a slight tonal shift of the same family (a darker grey, not a dark band). This supersedes the earlier "amber-on-black" direction.
- **Visual affectations**: keep the custom crosshair cursor with idle pulse and decay trail (re-tinted for the light theme); drop the CRT scanline overlay and the amber phosphor glow; drop the bracketed `[ COMMIT ]` button chrome and the `>` input prefix (they belong to the old palette).
- **Existing-views behavior during the rebuild**: panes show placeholder text during scaffold phases; the existing Dashboard/Browse/New/Edit pages are not rendered until Phase 4. Branch: `feature/tui-shell`.

## Palette specification

The light theme is built on a cool grey surface ramp with the Solarized accent set used semantically. All values are proposals — verify against real screens during Phase 0.5 and adjust as needed.

**Surface ramp** (cool neutral greys):
- `--bg`                 `#e8eaed`  body / pane default
- `--bg-bar`             `#d5d8db`  topbar + status bar (slight tonal shift)
- `--bg-elevated`        `#f0f2f4`  hover, focused row, dropdown
- `--bg-selected`        `#dde0e3`  selected row background (faint)
- `--border`             `#b8bcc0`  panel borders, table dividers
- `--border-strong`      `#8c9094`  focused pane border
- `--border-faint`       `#cfd2d6`  inner element borders

**Foreground ramp**:
- `--fg`                 `#2a2e33`  primary body text
- `--fg-muted`           `#6a6f74`  labels, captions, secondary content
- `--fg-dim`             `#93989c`  placeholder, hint, very secondary

**Solarized accents** (used semantically, never decoratively):
- `--accent-yellow`      `#b58900`
- `--accent-orange`      `#cb4b16`  filter match highlight (characters)
- `--accent-red`         `#dc322f`  error status, destructive action
- `--accent-magenta`     `#d33682`  command keywords (`:w`, `:new`), syntax highlight
- `--accent-violet`      `#6c71c4`  progress bar, "info" status
- `--accent-blue`        `#268bd2`  focused pane border, active cell
- `--accent-cyan`        `#2aa198`  active cell (alt), pane labels
- `--accent-green`       `#859900`  ok / saved / connected status

Semantic mappings (each role gets exactly one accent):

| Role                       | Token              |
|----------------------------|--------------------|
| Mode chip (`-- NORMAL --`) | `--fg-muted`       |
| Mode chip (active editing) | `--accent-blue`    |
| Pane label letter          | `--accent-blue`    |
| Focused pane border        | `--accent-blue`    |
| Filter input caret         | `--accent-orange`  |
| Filter match (characters)  | `--accent-orange`  |
| Active cell                | `--accent-cyan`    |
| Selected row background    | `--bg-selected`    |
| Progress bar fill          | `--accent-violet`  |
| Ok status / saved          | `--accent-green`   |
| Pending changes / dirty    | `--accent-yellow`  |
| Error                      | `--accent-red`     |
| Command keyword            | `--accent-magenta` |

Cursor: the custom crosshair becomes `--accent-blue` on the new light bg (likely with a thinner stroke than the amber-on-black version, since dark-on-light reads heavier). Idle pulse and decay trail keep the same animation logic.

## Animation language

A small catalog of text-based animations used throughout the admin. Each one maps to a specific role; reuse the existing role rather than inventing new motion for new contexts. All animations honor `prefers-reduced-motion` — under that media query, animated content snaps to a static glyph of the same shape.

| Animation | Where it appears | What it means |
|---|---|---|
| Braille spinner (`⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏`) | status row (`--loading`, `--saving`), Log pane commit header | An operation is in flight and should resolve in under ~30s. Currently in use. |
| ASCII spinner (`\|/-\\`) | reserved | Retro variant — kept on the bench if braille glyphs ever fail to render. |
| Dot count (`·` → `··` → `···`) | inline message suffixes (`Loading…`, `Connecting…`) | A quiet "waiting" indicator in body text that doesn't claim a glyph slot. |
| Block runner (`▏▎▍▌▋▊▉`) | reserved | Compact bar-like progress where a percentage isn't known. |
| Cylon scanner (`[•    ]` ↔ `[    •]`) | FILTER mode header (Phase 6.5) | A "scanning" indicator while the filter recomputes match results. |
| Marquee bar (`[=== ]` sliding) | optional replacement for `.admin-progress` | A fully text-based alternative to the violet progress bar at the bottom of the Explorer pane. |
| Caret blink (`█` on/off) | INSERT-mode cursor (Phase 6) | Replaces the native text caret while vim INSERT is active, for visual cohesion with the topbar identity caret. |
| Heartbeat dot (`●` fading) | reserved — candidate next to `ARCHIVE_SYS` in the topbar, or beside a "connected" status | Ambient liveness — a slow pulse, not a spinner. Use sparingly so it stays peripheral. |

Implementation pattern: each animation is a single CSS class with a `::before` pseudo-element that cycles `content` via `@keyframes` with `steps(1, end)`. Animation rules live alongside the components that use them in `src/admin/styles.css`. Reduced-motion fallback substitutes the static "resting" glyph (e.g., `⏵` for the spinner, `█` solid for the caret).

## Target layout

```
┌────────────────────────────────────────────────────────────────────┐
│ bayfujimoto.com / admin                          [breadcrumb]      │  topbar (--bg-bar)
├──────────────────┬─────────────────────────────────────────────────┤
│ ┌─[e] Explorer ─┐│ ┌─[r] Record ───────────────────────────────────┐│
│ │ ▼ * archive   ││ │ id:     item.2026.0142                        ││
│ │   ▼ Series    ││ │ title:  Working notes, May                    ││
│ │     ▶ Built   ││ │ status: draft                                 ││
│ │     ▶ Made    ││ │ ...                                           ││
│ │   ▼ Types     ││ │                                               ││
│ │   ▶ Drafts    ││ │                                               ││
│ │   ▶ Recent    ││ │                                               ││
│ │   ▶ Trash     ││ └───────────────────────────────────────────────┘│
│ │ ████░░ load   ││ ┌─[l] Log ──────────────────────────────────────┐│
│ └───────────────┘│ │ M  data/items/2026/0142.yml                   ││
│                  │ │ A  assets/items/2026/0142/cover.jpg           ││
│                  │ │ ⏵ 2 pending — :w to commit                    ││
│                  │ └───────────────────────────────────────────────┘│
├──────────────────┴─────────────────────────────────────────────────┤
│ -- NORMAL --   archive loaded · 142 items                14:08:22  │  state row (--bg-bar)
│ e Browse   r Record   l Log   / Filter   : Cmd   n New   ? Help    │  keymap legend
└────────────────────────────────────────────────────────────────────┘
```

## Phased plan

### Phase 0 — Strip dark-theme affectations *(done)*

Removed the CRT scanline overlay (`#admin-app::before`) and the unused `--term-glow` token from `src/admin/styles.css`. Centered-window drop shadow stays. No content change beyond the visual cleanup.

### Phase 1 — Three-pane scaffold *(done)*

Rewrote `admin.html` + `src/admin/main.js` so `#admin-app` renders a CSS Grid with three panes (`[e] Explorer`, `[r] Record`, `[l] Log`), each carrying a notched bracketed-letter label. Added `src/admin/shell.js` for drag-to-resize gutters (vertical between Explorer and right column, horizontal between Record and Log) with sizes persisted to `localStorage` under `admin.pane.explorer-width` and `admin.pane.record-height`. Defaults: explorer 30%, record 62% of right column. Double-click a gutter to reset, arrow-key nudge when focused, clamped min/max. Bottom command bar replaced with a two-row status bar — state row (state, mode, clock) and keymap legend — content static for now. All pane bodies hold placeholder text. Existing Dashboard/Browse/New/Edit views are not rendered.

### Phase 0.5 — Light-theme reskin *(done)*

Added a `[data-theme="admin"]` block to `src/styles/tokens.css` carrying the cool-grey surface ramp, charcoal foreground ramp, and the eight Solarized accent tokens. Switched `admin.html` from `data-theme="dark"` to `data-theme="admin"`. Removed the legacy `[data-theme="dark"]` override and amber-only tokens; aliased `--term-amber` → `--fg` (vibrant ink) so most call sites picked up the new palette automatically. Only place the blue accent survives is the `-- NORMAL --` mode chip. Body text defaults to `--fg-muted`; the vibrant `--fg` is reserved for focus/active text (identity name, pane label letters, kbd hotkeys, gutter drag line).

### Phase 2 — Explorer pane with collapsible tree *(done)*

Built `src/admin/views/explorer.js`. The tree mirrors the archive shape: `* archive` → Identity / Labor / Consumption / Creation / Accumulation → subcollections (films, books, biography, …) → records. Disclosure markers `▼`/`▶`, item count badges on group rows, empty-group `(empty)` hint. Expansion state persists to `localStorage` under `admin.explorer.expanded`; root and series are expanded by default on first run. Mouse-click a leaf calls the `onItemSelect` callback (wired into Record pane in Phase 3). `selectInTree(itemId)` exposes programmatic selection that auto-expands ancestors and scrolls into view. Progress bar at the bottom of the pane (`--accent-violet`, slim 2px) fires during archive load — see Animation language for the eventual text-based alternative. Replaces the function of the pre-overhaul Browse view.

### Phase 3 — Migrate Record-pane content *(done)*

Added `openRecord`/`getRecordBody`/`clearRecord` to `src/admin/shell.js`. Rewrote `dashboard.js` as a slim empty state — a hint line plus a single Needs-attention list capped at 5 rows with a `… N more` tail; the Recent section and stats grid are gone (`new-item` flow deferred to Phase 6's `:new` command). Refactored `edit-item.js` to accept an item directly and an `onClose` callback. Form chrome dropped the `> ` input prefix and `[ ]` button bracket pseudo-elements; buttons now have a proper border + `--bg-elevated` fill, secondary as ghost. Bulk-swept amber rgba's out of all form rules. Wired Explorer + empty-state clicks → `openRecord(renderEditItem)` → on close, return to empty state. Topbar breadcrumb reads `edit › ITEM-ID` during edit. Save queues a pending change and the status row reflects `… · N pending`. Commit flow deferred to Phase 4.

### Phase 4 — Log pane *(done)*

Built `src/admin/views/log.js`. Pending changes render in `git status` shorthand (`M `/`A `/`D ` prefix — `A` in `--accent-green`, `M` in ink, `D` in `--accent-red`) with a row-tint + brighter action-cell hover/selected state (the gif's two-layer selection idiom). The inline commit button bundles all pending changes into a single GitHub commit via the existing `commitAll()`. Session-scoped history (last 5) shows time, summary (`N added`, `N edited`), and `ok`/`fail`. Failed commits keep pending list intact for retry; the error message hovers in the row's `title`.

As polish landed during this phase: the status row picked up a four-color state palette aligned with the Log pane (yellow=pending, violet=saving/loading, green=saved, red=error) plus a braille spinner for in-flight states — see Animation language for the catalog. The same spinner runs in the Log header during commit, so the two surfaces stay in sync.

Reserved for follow-ups: diff preview for individual pending changes; pulling actual `git log` from the GitHub plugin instead of session-only history; revert-this-pending affordance.

### Phase 5 — Contextual keymap legend + focused-pane tracking *(done)*

Extracted status-bar logic into `src/admin/statusline.js`. The module owns the state text, the mode chip, the keymap legend, and the focused-pane indicator. `setBaseState(text, kind)` replaces the local `setStatusState` pattern in main.js. `setMode(mode)` and `setFocusedPane(code)` are exposed for Phase 6 to call once the vim engine is built.

Pane focus tracks on `mousedown` (so clicks on form fields, tree rows, log rows, etc. all set focus naturally without consuming the event). The focused pane gets `.is-focused` which paints a stronger border via the existing rule.

Keymap legend is rendered from a single `KEYMAP[mode][focusedPane]` table. NORMAL has explicit entries for each pane (Explorer, Record, Log); INSERT/COMMAND/FILTER use a shared `_` fallback. Per the chosen approach: bindings are rendered as if they all worked, even though Phase 6 hasn't wired the keys yet — the UI feels complete and the legend documents the keyboard model.

Mode chip stays anchored to the right (the gif's side-swap behavior was considered and deferred — flagged in Open questions). The chip is set via `setMode()` and currently fixed at `-- NORMAL --` until Phase 6.

### Phase 6 — Vim mode engine *(done)*

Built `src/admin/modes.js`. Global keydown handler with capture-phase listeners dispatches to per-mode handlers. Mode state lives in `statusline.js` so the legend re-renders reactively.

NORMAL bindings landed: `e`/`r`/`l` switch focused pane, `i`/`a` enter INSERT on the focused pane's first editable field, `:` opens the inline command bar, `?` toggles the expanded keymap legend, Esc collapses help when expanded. `/` is a placeholder that flashes a "Phase 6.5" notice.

Auto-transitions: focusing any editable input flips NORMAL → INSERT; blurring returns to NORMAL. Mode chip color updates: NORMAL blue (unchanged), INSERT green, COMMAND violet, FILTER cyan.

COMMAND bar is inline in the state row — the state text turns into a `:` prompt + bare input. Suggestions float above the status bar (`.admin-cmd-suggestions`) with Tab to complete the single highlighted entry, ArrowDown/ArrowUp to navigate, Enter to execute, Esc or clicking outside to cancel. Catalog: `:w` (commit), `:q` (close record → empty state), `:e <id>` (open record by id), `:new <type>` (open wizard with type preset), `:help` (toggle expanded legend). Unknown commands flash in red for ~1.8s.

`?` expansion renders all `(mode, pane)` bindings as a stack of labeled rows inside the legend element. The status bar's height changed from `height` to `min-height` so it can grow when expanded.

Per the chosen scope, j/k navigation inside panes is deferred. Mouse + Enter remains the way to operate on tree rows, log rows, and form fields. The legend still lists the planned j/k bindings — Phase 6 follow-up will wire them.

### Phase 6.5 — In-pane filter component *(done)*

Added filter machinery to `src/admin/views/explorer.js` and wired FILTER mode in `src/admin/modes.js`. `/` opens a filter input bar at the top of the Explorer pane body with the format `/ query   matched/total`. Substring matching by default; prefix the query with `~` to switch to fuzzy (subsequence) matching.

While filtering, the tree shrinks to matching items and their ancestor chain. Matching characters in each visible row's label highlight in `--accent-orange`. Enter activates the first match (opens it in the Record pane) and exits. Esc exits but keeps matched rows tinted (a low-alpha orange band) in the restored full-shape tree until `:nohl` clears them.

Filter is scoped to the Explorer pane in Phase 6.5. The Log pane could pick up the same machinery in a follow-up if useful. The `nohl` command is added to the `:` autocomplete catalog.

Per the chosen scope, j/k navigation inside FILTER is deferred — Enter activates the first match, the mouse opens any other. The legend's FILTER row shows the bindings that exist (`Esc close`, `Enter select`, `~ fuzzy`) without claiming j/k yet.

### Phase 7 — Cleanup pass *(done)*

Removed the dormant pre-overhaul CSS block — `.admin-cmdbar`, the old `.admin-cmd-prompt`/`-input`/`-ac`/`-status`/`-time`/`-suggestions`/`-suggestion*` rules, `.admin-commit-btn`, `.admin-main`, and the `--cmdbar-h` token. The old `.admin-cmd-input { display: none }` was actually overriding the Phase 6 inline command input — this was a latent bug that would have hidden the command bar entirely. The Phase 6 rules are now the only declarations for those selector names.

Cleaned up `src/admin/views/new-item.js`: dropped `getMainContainer()` (which referenced the removed `#admin-content` and `.admin-main`). All step transitions now use a module-scoped `wizardContainer` captured in `renderNewItem(container, archive, preselect, callbacks)`. Added `onClose` callback wiring so the wizard's Cancel and the success-state Close button return to the empty state. Replaced the dead `#/browse` and `#/` links in the success state with a real Close button. The "Add another" button is no longer broken.

The bracketed `[ ]` button pseudo-elements and the `>` `::before` on `.admin-input-wrap` were already removed during Phase 3's form-chrome sweep — flagging here as already-done.

`src/admin/views/browse.js` is dead code (subsumed by the Explorer pane in Phase 2). The sandbox couldn't delete it, so it remains in the tree as an unused file; safe to remove manually if/when desired.

Static check: no orphan references to removed tokens, classes, IDs, or helper functions across `src/admin/`. CSS braces balanced. All five admin JS modules pass `node --check`.

### Phase 8 — Mobile fallback *(done)*

At ≤700px the three-pane shell collapses to a single visible pane, controlled by a bottom tabstrip `[e Explorer] [r Record] [l Log]` (iOS-style — tabs at the foot of the viewport, above the status row, identity stays at top). JS toggles `.is-mobile-active` on the chosen pane; the CSS rule `.admin-pane:not(.is-mobile-active) { display: none }` lives inside the `@media (max-width: 700px)` block so the class is harmless on desktop. Each tab has a 44px min-height for touch targets.

Vim modality strictly disables on phone — `modes.js` short-circuits all four global handlers (`onKeyDown`, `onFocusIn`, `onFocusOut`, `onMouseDown`) via an `isMobile()` check that reads the same media query. The mode chip, clock, and keymap legend hide; the status row collapses to its state-text only. Native form focus + the 16px input minimum + pinch-to-zoom carry the entire mobile interaction model.

Opening an item from the Explorer auto-switches the active tab to Record so the user sees what they just opened. Closing a record (via the Cancel button or the wizard's success-state Close) returns to the empty state on the Record tab — the user can manually tap Explorer to go back.

Per the chosen scope, none of `:`, `/`, or `?` are reachable on mobile. If you want a future toolbar button for the command bar, the Phase 8 open question note covers it.

### Phase 9 — Docs and decisions *(done)*

Updated `docs/admin-interface.md` with an "Implementation (as built)" section near the top that describes the three-pane layout, mode reference (NORMAL / INSERT / COMMAND / FILTER), full keymap by `(mode, focused pane)`, command catalog, mobile fallback, status-row palette, and a file map. The original conceptual sections (Purpose, Goals, Primary modes, Status model, etc.) stayed in place as design intent; the dated "Technical implementation options" and "Admin interface phases" sections were replaced with one-line pointers to the new admin and to this overhaul doc.

Added four confirmed decisions to `docs/decisions.md` — three-pane TUI shell, vim modality on desktop, cool-grey + Solarized palette with the ink-as-focus inversion, and mobile single-pane + bottom tabstrip. Marked the older provisional "Admin implementation" entry as superseded, pointing to the new confirmed decisions.

Two surgical edits to `CLAUDE.md`: added the admin mobile tabstrip to the touch-targets list, added a one-line bullet describing the admin mobile model, and added `docs/admin-tui-overhaul.md` to the core-docs list.

### Phase 9.5 — Arrow-key navigation *(done)*

The keymap legend has listed `j/k` and `h/l` as planned bindings since Phase 5; they were deliberately deferred. This phase introduces keyboard navigation across all three panes, but with **arrow keys instead of `j/k/h/l`**. The legend wording will follow the same change. Vim's hjkl convention is preserved as an "also" if useful, but arrows are the primary.

Two new concepts:

- **A "highlighted row" state** distinct from the existing clicked-selected state. The highlighted row is wherever the keyboard navigation cursor sits. Visually it reuses the existing mouse-hover background (`--bg-elevated`) — so a highlighted row looks identical to a hovered row. The clicked-selected row keeps its current `--bg-selected` darker tint. This separates "I'm pointing at this" (hover or arrow) from "I activated this" (click or Enter).
- **A small shared navigation module** (`src/admin/nav.js`) that lets each pane register what it considers a "row" and what activating a row does. The mode engine routes arrow keys to the focused pane's registered nav handler.

#### 9.5a — Shared navigation primitives + CSS

Create `src/admin/nav.js`. Public API:

```
registerPaneNav(paneCode, {
  container,             // DOM element to scope queries to
  rowSelector,           // CSS selector for navigable rows inside container
  onActivate(rowEl),     // what Enter on this row does
  onLeft(rowEl)?,        // optional pane-specific Left semantics
  onRight(rowEl)?,       // optional pane-specific Right semantics
})

navigate(paneCode, dir)  // dir: 'up' | 'down' | 'left' | 'right'
activate(paneCode)       // fires onActivate for the highlighted row
```

The module maintains, per pane, a reference to the currently highlighted DOM element. `navigate('up'/'down')` finds the previous/next sibling matching `rowSelector` and moves the `.is-highlighted` class. `navigate('left'/'right')` calls the registered `onLeft` / `onRight` if present, otherwise no-ops.

CSS additions across the pane-specific blocks in `styles.css`:

```
.admin-tree-row.is-highlighted,
.admin-log-row.is-highlighted,
.admin-log-history-row.is-highlighted,
.admin-field.is-highlighted {
  background: var(--bg-elevated);
}
```

Mirrors the hover state on those same selectors so highlight and hover are visually identical. No leading glyph, no border accent.

#### 9.5b — Wire arrow keys in modes.js

Add to `handleNormalKey`:

```
case 'ArrowUp':    e.preventDefault(); navigate(focusedPane, 'up');    return;
case 'ArrowDown':  e.preventDefault(); navigate(focusedPane, 'down');  return;
case 'ArrowLeft':  e.preventDefault(); navigate(focusedPane, 'left');  return;
case 'ArrowRight': e.preventDefault(); navigate(focusedPane, 'right'); return;
case 'Enter':      e.preventDefault(); activate(focusedPane);          return;
```

`Enter` is added as the universal activator alongside arrows. The legend rows that currently show `j/k navigate`, `h/l collapse/expand`, `Enter open` are rewritten to use `↑↓`, `←→`, `Enter` respectively.

INSERT mode auto-transitions still take precedence: if an editable input has focus, arrow keys flow to it (browser caret movement). The `isUserEditable(document.activeElement)` short-circuit in `handleNormalKey` covers this.

#### 9.5c — Explorer integration

In `explorer.js`, register pane nav after `renderExplorer()` runs:

```
registerPaneNav('e', {
  container:  document.getElementById('explorer-tree-wrap'),
  rowSelector: '.admin-tree-row:not(.is-empty)',
  onActivate: (row) => {
    if (row.dataset.type === 'item') openItemByPath(row.dataset.path);
    else                              toggleExpanded(row.dataset.path);
  },
  onLeft: (row) => {
    if (row.dataset.type !== 'item' && expanded.has(row.dataset.path)) {
      // Expanded group → collapse it
      expanded.delete(row.dataset.path);
      saveExpanded(expanded);
      renderCurrent();
      // Re-highlight the same path after re-render
      restoreHighlight(row.dataset.path);
    } else {
      // Already collapsed or a leaf → move highlight to parent
      const parent = ancestorPath(row.dataset.path);
      if (parent) highlightByPath(parent);
    }
  },
  onRight: (row) => {
    if (row.dataset.type === 'item') return;
    if (!expanded.has(row.dataset.path)) {
      // Collapsed group → expand it
      expanded.add(row.dataset.path);
      saveExpanded(expanded);
      renderCurrent();
      restoreHighlight(row.dataset.path);
    } else {
      // Already expanded → move highlight to first child
      const firstChild = firstChildPath(row.dataset.path);
      if (firstChild) highlightByPath(firstChild);
    }
  },
});
```

When the user enters Explorer (clicks or presses `e`) and there's no highlighted row, the first visible row gets highlighted on the first arrow press. Subsequent pane switches restore the last highlighted row.

#### 9.5d — Log integration

`log.js` registers pane nav over the pending-changes list. The session-commits history is read-only and out of scope for arrow nav in this phase (it scrolls naturally).

```
registerPaneNav('l', {
  container:  document.getElementById('log-pending'),
  rowSelector: '.admin-log-row',
  onActivate: (row) => {
    const id = row.dataset.itemId;
    if (id && onItemSelectFn) {
      const item = (getState().allItems || []).find(i => i.id === id);
      if (item) onItemSelectFn(item);
    }
  },
  // No onLeft / onRight — the Log pane is flat.
});
```

Arrow Up/Down move the highlight between pending rows. Enter opens the record in the Record pane.

#### 9.5e — Record pane (field-row nav, hook for Phase 10)

The Record pane currently renders form rows (`.admin-field`) via `form-renderer.js`. Each row is a candidate "field row" for arrow navigation. Wire it in `edit-item.js` after `renderForm()` returns:

```
registerPaneNav('r', {
  container:  formContainer,
  rowSelector: '.admin-field',
  onActivate: (row) => {
    // Focus the input inside this row
    const input = row.querySelector('input:not([readonly]), textarea:not([readonly]), select');
    if (input) input.focus();   // focus triggers INSERT mode automatically
  },
  // Left / Right: defer to Phase 10 (no-op for now)
});
```

When Phase 10's click-to-edit layer lands, the `onActivate` handler will toggle the row into edit mode rather than focusing an always-visible input. The `.admin-field.is-highlighted` CSS rule from 9.5a already adds the hover-tone tint to highlighted rows. Phase 10 inherits both the highlight visual and the arrow-nav routing without further work.

The new-item wizard's form step uses the same `renderForm` path — `applyEditToggle` in Phase 10 will wrap that too, and the nav registration extends to that form via the same call site.

When the Record pane shows the empty state (no item open), there are no `.admin-field` rows — arrow keys are no-ops. Same for the new-item wizard's type/depth selection steps in Phase 9.5 (those keep mouse-only nav until Phase 10 reskins them).

#### 9.5f — Update the keymap legend wording

In `statusline.js`'s `KEYMAP` table, replace the `j/k navigate`, `h/l collapse`, `Enter open` entries with arrow-key labels. Pre-existing entries that referenced `j/k` or `h/l` switch to `↑/↓` and `←/→` respectively. The COMMAND-mode autocomplete's ArrowDown/ArrowUp instructions stay (those are mode-internal, not pane-level).

#### 9.5g — Verify in browser

- Press `e` to focus Explorer (or click into it). Arrow keys cycle through visible rows. Highlight visual matches mouse hover (`--bg-elevated`).
- Arrow Right on a collapsed group expands it; arrow Right on an expanded group moves highlight into the first child. Arrow Left on an expanded group collapses; arrow Left on a leaf moves to the parent group.
- Enter on a leaf opens the item in Record. Enter on a group toggles expansion.
- Press `r` to focus Record. If an item is open, arrow keys navigate between fields; Enter focuses the input inside the highlighted field (auto-INSERT). Esc returns to NORMAL.
- Press `l` to focus Log. Arrow keys cycle pending rows; Enter opens the corresponding item.
- The keymap legend updates per focused pane and uses arrow-key glyphs.
- Switching panes preserves each pane's last-highlighted row.
- Inside an input (INSERT mode), arrow keys move the text caret as normal — they don't trigger row nav.

#### Notes

- The `.is-highlighted` class is applied only by `nav.js`. Mouse hover continues to render via the existing `:hover` rules; since both use `--bg-elevated`, a row that's both hovered and arrow-highlighted just looks the same as either alone. No conflicting visual state.
- The selected-row state (`.is-selected` for tree leaves and `.admin-log-row.is-selected` for pending rows) is unchanged. A row can be `.is-selected.is-highlighted` simultaneously — the selected styling wins by being later in the cascade for the background property.
- On mobile (≤700px), modes.js short-circuits all key handlers, so arrow nav effectively disables. The visual highlight class never gets applied since `nav.js` only runs through key handlers. No mobile-specific work needed.
- When a pane's content re-renders (e.g., Explorer after filter toggle), the previously highlighted DOM element is gone. `restoreHighlight(path)` re-applies the class by data-path after re-render. Each pane's nav handler tracks the highlighted "logical id" (path for Explorer, itemId for Log, fieldId for Record) so it can re-highlight across re-renders.

### Phase 10 — Record-pane buffer reskin *(done)*

The chrome around the Record pane was overhauled — notched label, focus border, statusline integration, openRecord API — but the inside of the form survived Phase 3 mostly intact. Fieldsets with grid-style rows, boxed inputs with focus rings, and the new-item wizard's card-grid for type/depth selection all read as a generic web form sitting inside the TUI shell rather than a piece of it. This phase rebuilds the Record pane's interior to feel like a text buffer.

Three intertwined ideas:

- Each field row reads as a `key: value` line in monospace. Keys are dim/muted (`--fg-muted`) and right-padded to a fixed column. Values are vibrant ink (`--fg`).
- Values display as plain mono text by default. Click a value (or focus the row and press `i`) to swap in an input; blur or Esc commits and returns to text. The existing INSERT auto-transition in `modes.js` handles the mode chip flip automatically.
- Section dividers, save-path preview, and the wizard's choice grids adopt the tree-section idiom (`─ Section name`) used elsewhere in the admin.

Scope: delivered as CSS plus a small "edit-toggle" enhancement layer that wraps the renderer's output post-render. `form-renderer.js`, `base-fields.js`, and `type-fields.js` are untouched — the schema, validation, and field-type machinery stay exactly as they are.

#### 10a — Buffer-style field rows (CSS)

In `src/admin/styles.css`, restyle `.admin-field` and its descendants:

- Drop the `display: grid; grid-template-columns: 130px 1fr` layout. Switch to `display: flex; align-items: baseline; gap: 8px` so rows read as text lines.
- Label renders as `key:` — `--fg-muted` color, `font-family: var(--font-mono)`, fixed `min-width: 12ch` so values align in a tidy column.
- Inputs lose `background: var(--bg-elevated)` and `border: 1px solid var(--border)`; gain a single 1px bottom border in `--border-faint` that brightens to `--fg` on focus. No outline, no focus ring beyond the underline shift.
- Field hints (`.field-hint`) sit inline as a trailing dim suffix in `--fg-dim` when present.
- Multi-line `textarea` elements keep their boxed rectangle but lose the focus background change; gain a 2px left border in `--border-strong` (active: `--accent-cyan` or `--fg`) — reads as a quoted buffer block.
- Restyle `.admin-fieldset-legend` to render as a horizontal rule with a notched label: `─ Section name` matching the Explorer tree's section title idiom and the empty-state's `─ Needs attention` header. The legend's left padding aligns with the field key column so the dividers visually anchor the rows below.
- The full-depth fields (`.admin-field[data-depth="full"]`, `.admin-field--asset-upload`, `.admin-field--gallery-upload`) keep their block layout but get the new section-divider-style label above.
- The mobile single-column collapse stays as-is.

#### 10b — Click-to-edit / blur-to-commit layer

New module: `src/admin/forms/edit-toggle.js`. Exposes one function:

```
applyEditToggle(formContainer)
```

After `renderForm()` returns, walk the form's DOM and, for each "togglable" input (single-line text, number, date, password — the types that translate to plain text), wrap it in a `.admin-field-value` container holding both:

1. A `.admin-field-display` `<span>` that shows the current value as mono text.
2. The original input, hidden by default.

CSS toggles which child is visible via an `.is-editing` class on the wrapper:

- default (no class): display span visible, input `display: none`.
- `.is-editing`: input visible, display span `display: none`.

Wired handlers:

- Click on `.admin-field-display` → adds `.is-editing` to parent, focuses the input. The existing focusin handler in `modes.js` auto-transitions to INSERT mode; the chip turns green.
- `input` event on input → live-updates the display span's text content so changes mirror immediately.
- Blur on input → removes `.is-editing` from parent. Input value persists (since form-renderer reads it on save). modes.js's focusout returns mode to NORMAL.
- Esc on input → blurs the input (modes.js handles Esc in INSERT). Behaves as commit-on-blur; there's no explicit "discard" without explicit Cancel.

Special-case fields that stay always-visible-as-input:

- Textareas (`textarea`): multi-line text doesn't display well in a single span.
- Selects (`.admin-select` custom widget): the trigger already reads as text and switches to a dropdown on click — no toggle needed.
- Asset upload fields (`.admin-field--asset-upload`, `.admin-field--gallery-upload`): retain their drop-zone widget.
- Readonly fields (`input[readonly]`): display only, no input swap. The unlock-stable-ID checkbox controls whether `id` and `slug` become togglable mid-session.

Call sites:

- `src/admin/views/edit-item.js` — call `applyEditToggle(formContainer)` after `renderForm(...)` returns.
- `src/admin/views/new-item.js` (form step in `renderFormStep`) — same.

The renderer itself isn't modified. The wrapper logic lives entirely in `edit-toggle.js`.

#### 10c — File-path preview and form-actions polish

The current edit form opens with `Save path: …` rendered inside a boxed `.admin-panel` block. That panel was a holdover. Replace with a single mono line at the top of the Record pane body:

- Format: `path:   src/content/labor/.../item-slug.md` in `--fg-muted`, no border, no padding box.
- Could optionally carry the read-only `id` as a leading segment: `id:   ITEM-2026-0042   path:   src/content/...`. To be decided at implementation time.
- The unlock-stable-ID toggle (`<input type="checkbox" id="unlock-stable">`) becomes a small text annotation at the right end of the row: `[locked]` (active state) or `[unlocked]` (after toggle). Clickable. Color follows the mode chip's semantic palette — muted by default, `--accent-yellow` when unlocked (warning).

The form-actions row at the bottom (Save + Cancel buttons) gets a quieter treatment:

- Buttons keep their function (mouse-clickable) but visually de-emphasize since `:w` / `:q` are the canonical paths.
- Format: `[ save ]   :w` and `[ cancel ]   :q` — the keybinding sits to the right of the button text in `--fg-dim`.
- Both buttons keep the current `--bg-elevated` fill and border, just with the keybinding hint appended.

#### 10d — New-item wizard reskin

The wizard has three steps. Reskin each:

- **Type selection** (`renderTypeSelection`): currently a grid of `.admin-step-tile` cards, each card showing `<series>` label and `<type>` name, grouped by series via `makePanel`. Restyle as a numbered list of lines under each series's section divider:

  ```
  ─ accumulation
  1. ticket
  2. brochure
  3. receipt
  4. handout
  5. document

  ─ consumption
  6. film
  7. book
  ...
  ```

  Each line is keyboard-clickable; hover state uses the same tint as tree rows (`--bg-elevated`). Optionally, pressing a digit `1`-`9` while focused jumps to that option (small NORMAL-mode binding inside the wizard step) — flagged for a follow-up if it adds value.

- **Depth selection** (`renderDepthSelection`): two cards become two text blocks:

  ```
  ─ Entry depth
  
  1. Quick log
     Title, date, optional thumbnail. Fast entry for films, coffee, books, ephemera.
  
  2. Full entry
     All metadata, assets, relationships, inspection settings. For richly annotated records.
  ```

  Same numbered / clickable / hover-tint pattern.

- **Form step** (`renderFormStep`): inherits the buffer-style field rows + click-to-edit from 10a/10b automatically since it calls the same `renderForm()`. No wizard-specific changes here.

The wizard's breadcrumb continues to write into `#admin-topbar-breadcrumb`.

#### 10e — Verify in browser

- Click an item in Explorer → Record pane opens. Each field row reads as `key:   value` mono text. No grid layout, no box around inputs.
- Section dividers render as `─ Section name` rules anchored to the field key column.
- The save-path lives as a single line at the top of the pane body; the unlock toggle sits at the right end of that line.
- Click any short-string value → swaps in the input (no box, just an underlined caret position), mode chip flips green, the value is editable.
- Blur or Esc → input swaps back to plain text with the new value visible, mode chip returns blue.
- Textareas, selects, and asset uploads still render as their proper widgets — no toggle behavior on those types.
- Tab order through inputs still works.
- `:new ticket` → wizard renders the new numbered-list type/depth selection. Selecting a depth lands on the buffer-style form.
- Existing save / commit / `:w` flow still works end-to-end.
- Mobile (≤700px): rows wrap correctly into single-column; click-to-edit still works via tap.

#### Open questions for Phase 10

- **Discard-on-Esc semantics.** Blur-on-Esc currently commits the typed value (since blur fires after Esc and the input's value is read). If the user wants Esc to mean "revert to pre-edit value" instead, the edit-toggle module needs to snapshot the input value on focus and restore on Esc-blur. Worth deciding before building.
- **Asset upload visual treatment.** Currently the asset upload field uses a small triggered button (`.asset-upload__trigger`) styled to read like a button. In the buffer aesthetic, this could read as `cover:   [ select file ]` with the trigger in-line. Not in this phase's required scope but flagged.
- **`[locked]` vs `[unlocked]` color.** Muted by default reads as "this is set"; yellow when unlocked reads as "be careful." Or invert. To be decided once it renders.
- **Number-digit shortcut in wizard.** Whether `1`-`9` keys in the type-selection step jump to that option directly. Adds keyboard ergonomics; small surface area.

### Phase 10.5 — Record-pane simplification *(done)*

Phase 10 made the Record pane more buffer-like but kept several visual structures that still feel "bounded": the `─ Section name` dividers between fieldsets, the form-actions footer with its top border, the inline `.admin-form-note` boxes for the lock toggle and build-data reminder, the textarea's left-border quote accent, and inline saved/error messages with their semantic left-border accent. Phase 10.5 strips these so the pane reads as a continuous mono buffer — `key: value` lines all the way down, plus a clickable action line or two at the bottom.

#### 10.5a — Quiet section labels

`.admin-fieldset-legend` currently renders as `─ Section name` in uppercase with a notched-rule prefix. Replace with a single dim mono label in lowercase: `# base`, `# identity`, etc. (or just `base`, `identity` — the leading `#` is a style choice; I'll start without). No leading rule, no top padding. The space between sections comes from a single blank line of `margin-bottom` on `.admin-fieldset`.

#### 10.5b — Inline the form-notes

The `path:` preview, the lock toggle, and the build-data reminder currently render as their own elements with their own styling (`.admin-filepath-preview` / `.admin-form-note`). Convert all three to `.admin-field`-style rows at the top of the pane body, sharing the same `key:  value` mono layout as the form fields below:

```
path:    src/content/labor/2026/foo.md
lock:    [locked] — unlocking breaks existing links
note:    editing saved version; run build-data after committing
```

The lock value is still a clickable button (`.admin-lock-toggle`); the `note` value is plain dim text. The class `.admin-field--meta` (or similar) marks these as read-only meta rows so the keyboard nav can skip them.

#### 10.5c — Textareas without the left border

Drop the 2px left-border quote accent on `.admin-field textarea`. Textareas render as plain mono text that wraps inside the value column, with the same underline-on-focus pattern as single-line inputs. The textarea's `min-height` keeps it visually distinct from short fields.

#### 10.5d — Inline messages without the accent border

The saved/error inline-message currently has a left-border accent in `--accent-green` / `--accent-red`. Drop the border; just color the text. The accent stays semantic; the chrome goes away.

#### 10.5e — Text-action lines for save / cancel

Replace the bordered `Save :w` / `Cancel :q` buttons at the bottom with two text-action lines that match the buffer rhythm:

```
> save     :w
> cancel   :q
```

Each line is a `<button>` styled as a flat mono row with a leading `>` marker, the action verb in vibrant ink (save) or muted (cancel), and the keybinding hint pushed to the right edge in dim. Clicking the row anywhere fires the action. The row picks up the same `.is-highlighted` hover/keyboard treatment as field rows.

Arrow-key nav extends to include these rows so Down past the last field reaches `> save`, then `> cancel`. Enter on a highlighted action fires it. Meta rows at the top (`path`, `lock`, `note`) are skipped from nav since they're not editable.

#### 10.5f — Empty value annotation

Empty field values render as `(empty)` in `--fg-dim` instead of the em dash. Same visual weight; clearer semantics.

#### 10.5g — Verify

Open an item. The pane reads top-to-bottom as:

```
path:     src/content/labor/2026/foo.md
lock:     [locked] — unlocking breaks existing links
note:     editing saved version; run build-data after committing

# base
title:    My item title
status:   draft
display_date: April 2026

# identity
id:       FILM-2026-0042
slug:     my-title

# (more sections)
…

> save     :w
> cancel   :q
```

No `─ Section` rules. No bordered buttons. No left-border accents on textareas or inline messages. The Record pane chrome (its outer border + notched `[r] Record` label) stays — that's the only visible boundary in the body.

Arrow keys skip the meta rows at top, navigate field rows under their section labels, and continue past the last field to the action lines. Enter on `> save` fires the save handler; Enter on `> cancel` returns to the empty state.

#### Notes

- The lock toggle button stays clickable in its meta row regardless of keyboard nav.
- `:w` and `:q` commands still work from anywhere — the action lines are visual + mouse parallels to the canonical keyboard paths.
- The `.admin-form-note` and `.admin-filepath-preview` rules become dead CSS — earmark for the next cleanup pass.
- Empty `(empty)` label appears only when the underlying value is genuinely empty — values that happen to be a whitespace string render as the whitespace, not `(empty)`.

## Status

| Phase | State        | Notes                                                          |
|-------|--------------|----------------------------------------------------------------|
| 0     | done         | scanlines + glow removed                                       |
| 1     | done         | shell, gutters with persistence, status stubs                  |
| 0.5   | done         | cool-grey + Solarized palette, ink-as-focus, blue exiled to mode chip |
| 2     | done         | Explorer tree + violet progress bar                            |
| 3     | done         | Record-pane shell API, slim empty state, edit form chrome      |
| 4     | done         | Log pane + commit flow + status-row accent palette + braille spinner |
| 5     | done         | statusline.js, focused-pane tracking, contextual keymap legend |
| 6     | done         | mode engine, e/r/l focus, INSERT auto-transitions, COMMAND bar, ? help |
| 6.5   | done         | Explorer filter (substring + fuzzy), match highlight, persistent tint, :nohl |
| 7     | done         | dormant CSS block removed, new-item.js modernized, latent display:none bug squashed |
| 8     | done         | mobile single-pane + bottom tabstrip, vim modality disabled on phone |
| 9     | done         | admin-interface.md updated, decisions recorded, CLAUDE.md amended |
| 9.5   | done         | arrow-key nav across all three panes, shared highlighted-row pattern |
| 10    | done         | Record-pane buffer reskin — field rows, click-to-edit, undo, wizard list |
| 10.5  | done         | Record-pane simplification — 4-col tabular layout (state · FIELD · VALUE · TYPE) per C3 |

Branch: `feature/tui-shell` (off `main`).

## Known issues

Rough edges that exist in the as-built admin. None are blockers; all are candidates for follow-up.

- **j/k navigation in panes is unbound.** The keymap legend lists `j/k navigate`, `h/l collapse/expand`, and `Enter open` for each pane in NORMAL mode, but the keys themselves don't fire — mouse + Enter is the only way to operate on tree rows, log rows, and form fields. Deferred from Phase 6. Implementing it means adding a "current row" concept to each pane and a render pass for the highlighted row.
- **Filter is Explorer-only.** The Log pane could pick up the same `enterFilter`/`exitFilter`/`setFilter` API if filtering pending changes ever feels useful, but the filter machinery currently lives inside `explorer.js` rather than a shared module. Would want extracting first.
- **Recent commits are session-only.** The Log pane's history list resets on reload — there's no integration with the actual GitHub commit log. Pulling real history would also let the admin show diffs against the last commit.
- **No diff preview anywhere.** Clicking a pending change in the Log opens the record's edit form, not a diff view. The pending list just shows file paths.
- **`browse.js` is dead code on disk.** The sandbox couldn't delete it during Phase 7. Safe to remove manually.
- **`?` help doesn't auto-collapse on click outside.** Only Esc or pressing `?` again collapses the expanded legend.
- **Mode chip transitions are hard swaps.** `-- NORMAL --` snaps to `-- INSERT --` without any animation. Likewise the chip color swap.
- **Pane focus border change is a hard swap.** Clicking a different pane darkens the border instantly — no transition.
- **Filter recompute on every keystroke** can feel laggy for fuzzy mode on the 487-film subcollection. No debouncing or web-worker offloading.
- **The new-item wizard still uses `window.goStep`** for breadcrumb back-navigation. A pre-overhaul global pattern that survived Phase 7's minimal cleanup. Works, but not idiomatic.
- **`color-mix(in srgb, …, transparent)`** is used for the persistent filter tint. Wide modern browser support, but no fallback for older engines.
- **The success-state of the new-item wizard** scrolls naturally inside the Record pane body, but the "Saved ITEM-ID" message can land below the fold on long forms. No scroll-to-top after success.
- **Pending count in the status row** appends `… · N pending` to the base text. If base text is long (e.g., a long load message), the pending suffix can wrap or get cut off in narrow viewports.
- **Reduced-motion behavior** is implemented for the braille spinner and progress bar, but the cursor pulse/decay and the topbar caret blink still animate. Audit pending.

## Potential improvements

Concrete follow-ups grouped by category. None are committed to a timeline; all are candidates when energy and time line up.

### Interaction

- **Wire j/k navigation** in Explorer (tree rows), Log (pending and history rows), and Record (form fields). Adds a "highlighted row" concept rendered as a brighter underlay than `is-selected`. h/l for tree expand/collapse. Enter activates.
- **Mode-chip side swap** per the gif's pattern. When transient state takes the left half of the status row, the chip moves to the right; when state is passive, the chip moves to the left.
- **`:w!`** for forced commit even with no pending changes (would explicitly bypass any future confirmation dialog).
- **`:q!`** to discard unsaved form changes and close the record.
- **`:wq`** convenience — save the form + commit + close.
- **Filter in Log pane** to narrow pending changes by id or path (useful when reviewing a 20+ pending batch).
- **Click outside `?` collapses the expanded legend.** A document-level mousedown listener while expanded.
- **A toolbar `[:]` button on mobile** for users who want command access without a keyboard. Optional — the existing decision was strictly tap-only.
- **Multi-select in Log** — checkbox-style marks on pending rows, commit only checked subset. Adds the third selection layer to the two-layer model.

### Architecture

- **Color-token split.** The admin currently lives under `[data-theme="admin"]` in shared `tokens.css`. Splitting into `src/styles/tokens-admin.css` would let the admin evolve without risking the public site palette.
- **Pull git log from the GitHub plugin.** The session-only commit history could be augmented with the last 20 actual commits, so reloading the admin doesn't lose context.
- **Extract filter machinery from `explorer.js`** into a shared `src/admin/lib/filter.js` if the Log pane (or a future Browse-style pane) adopts it.
- **Replace `window.goStep`** in `new-item.js` with proper callbacks threaded through breadcrumb click handlers.
- **Remove `browse.js`** (it's dead code; sandbox couldn't delete it).
- **Document the `setMobileActivePane('r')` side-effect** inside `openItem`. It works, but readers of the code wouldn't expect a desktop helper to also manage mobile pane state. A comment + maybe a `setActivePane` abstraction that's mode-aware.

### Performance

- **Tree re-render** is currently a full `innerHTML` swap on every interaction. Fine at 1.5k items but would warrant DOM diffing or virtualization if the archive grew to 5k+.
- **Filter recompute debounce.** Substring matching is fast; fuzzy on 1.5k items adds a perceptible delay. A 50–100ms debounce or moving the matcher into a Web Worker would help.
- **Status subscriber fires synchronously** on every `setState`. With heavy commit operations queuing many state changes, this could become noticeable. Batching with `requestAnimationFrame` is the standard fix.

### Content / Workflow

- **Diff preview** when a pending change is clicked in the Log. Show added/removed lines with `--accent-green`/`--accent-red`.
- **Trash semantics.** The plan mentioned a `Trash` folder in the Explorer; the implementation doesn't have it. Either build it or remove the placeholder mention.
- **Drafts shortcut.** Top-level "Drafts" group in Explorer that pulls items with `status: draft` regardless of series. Currently the Needs-attention list in the empty state covers some of this.
- **Recent shortcut.** Top-level "Recent" group in Explorer for last-modified items. Currently in the empty state only.
- **Asset upload progress.** The R2 upload flow exists but doesn't surface progress beyond a status string. Tying it to the violet progress bar or a per-pane progress would help.

## Visual enhancement roadmap

A wishlist for polish that goes beyond functional cleanup. The animation catalog under "Animation language" was deliberately broader than what's currently in use — several reserved animations are waiting for the right home. Organized roughly by surface.

### Mode and focus transitions

Hard swaps everywhere right now — every mode change, focus change, and selection change snaps instantly. A small handful of motion would make the interface feel less abrupt without compromising the TUI flatness.

- **Mode chip text transition.** When the chip changes from `-- NORMAL --` to `-- INSERT --`, cycle the dashes and letters character-by-character (typewriter effect, ~30ms per char). Catalog idiom: dot count or marquee bar, scaled down.
- **Mode chip color transition.** Cross-fade the color rather than snap (50ms ease). Helps the eye register the mode change without being visually loud.
- **Pane focus border.** On focus shift, briefly pulse the new pane's border slightly brighter than `--border-strong` then settle back. 120ms total, two steps.
- **Selected row** in tree/log: animate the background from transparent to the selection color over 80ms. Currently instant.

### Animation catalog applications

The catalog lists eight animations; four are in use (braille spinner, progress bar — though the bar is non-text, dot count if we add it, blink on the identity caret). The other four are reserved and waiting for homes:

- **Caret blink** (`█` on/off) — apply to INSERT mode in editable fields. Could be a CSS overlay on the focused input that hides the native caret. Strongest effect on the `:` command bar, where the violet caret could blink slowly while waiting for input.
- **Cylon scanner** (`[•    ]` ping-pong) — apply to the filter input's right-side count cell while fuzzy matching is recomputing. Replaces the live `N/T` number with a scanner indicator until the match finishes, then snaps to the count.
- **Marquee bar** (`[=== ]` sliding) — alternative text-native rendering of the Explorer's load progress. Replace `.admin-progress` with a 1-line text animation if you want zero non-text motion in the admin.
- **Heartbeat dot** (`●` slow fade) — beside `ARCHIVE_SYS` in the topbar. Pulse slowly while connected/idle; pause or change color while operations are in flight. Ambient "the tool is alive" indicator.

### Color usage expansions

The palette is broader than what's currently called for. A few specific applications would deepen the semantic vocabulary:

- **Active-cell highlight in Log + future Browse views.** Currently the action prefix cell gets a brighter `--bg` underlay on hover/selected. Extending this to the id column in any list view (mirroring the gif's pattern) gives a consistent "this row's primary identifier is highlighted" cue. Use `--accent-cyan` as a faint tint behind the id cell of the selected row.
- **Magenta for command keywords.** In the `:` suggestions dropdown, the command name (currently `--accent-violet`) could shift to `--accent-magenta` for verbs that mutate (`:w` commit, `:q` close, `:new`) and stay violet for read-only commands (`:e`, `:help`, `:nohl`). Communicates write-vs-read intent.
- **Yellow as a "needs attention" inline marker.** In the Explorer tree, items in `Needs attention` could carry a leading `!` in `--accent-yellow` (no clickable element, just a glyph). The empty state's list and the tree marker stay in sync.
- **Subtle hue tinting per series.** Optional and could become noisy, but: each series's group row could carry a faint left-border accent in a different hue (warm for Accumulation, cool for Identity, etc.). Decoration; not semantic.

### Cursor

The custom crosshair currently is a single charcoal color (`--fg`) regardless of context.

- **Mode-aware cursor color.** Subtly tint the crosshair to match the mode chip — blue NORMAL, green INSERT, violet COMMAND, cyan FILTER. Helps reinforce mode awareness when the user's eye isn't on the status bar. Keep the tint subtle so it doesn't fight with the underlying content.
- **Cursor over interactive elements** could grow slightly larger (4px → 6px) instead of just becoming a crosshair. Adds touch-of-craft.

### Tree and selection polish

- **Expand/collapse animation.** Tree rows currently appear/disappear instantly on click. A short height transition (80ms) for the inserted child block would feel less jarring without being slow.
- **Filter shrink animation.** When the tree shrinks to matches, the disappearing rows could fade-and-collapse simultaneously rather than vanish. Trickier to implement (DOM removal vs. visibility), but the effect is striking when it works.
- **Match-highlight pulse.** When a filter first applies, the matched-character spans could pulse once briefly (orange → bright orange → orange) to draw the eye to the matches.
- **"(no matches)" state** during filter — currently shows an empty tree. Add a centered dim line: `( no matches for "{query}" )`.

### Status row

- **Relative time on the clock.** After a commit, the clock could read "3m ago" for a few seconds before reverting to the current time. Anchors the user's sense of recency.
- **Pending-changes badge** next to `ARCHIVE_SYS` in the topbar. A small `●N` dot that pulses while pending > 0. Saves the status row from carrying that segment.
- **Soft fade on transient state messages** ("Saved 3 changes", "Network error: …"). Currently they snap in and out; a 200ms opacity transition softens the appearance.

### Form chrome

- **Active-line indicator.** When a form field has focus, a 1px `--fg` line could underline the entire form row (label + input together), making the active row obvious even when scrolling a long form.
- **Press feedback on buttons.** A 1px Y translation on `:active` for a tactile press feel. Pairs with the existing border-darken hover state.
- **Saved-id reveal.** In the new-item wizard's success state, the saved ID could appear character-by-character (typewriter ~40ms per char). Currently snaps in.
- **Field-row hover hint.** Form rows could carry a faint `--bg-elevated` background on hover (currently only inputs do). Helps scanning through a tall form.

### Loading sequence

- **Sequenced first paint.** Right now the shell renders empty, then the explorer loading state appears, then the tree populates. A choreographed sequence would feel more deliberate:
  1. Topbar identity fades in from the left.
  2. Pane labels appear with their notched borders unfolding briefly.
  3. Status bar slides in from below.
  4. Archive loads; tree fades into the Explorer.
- **Tree population.** Each top-level series row could fade in with a small stagger (~30ms each). Subtle; only on first load.

### Diff preview (future)

If diff preview lands in the Log pane (potential improvement above):

- Use `--accent-green` background tint for added lines, `--accent-red` for removed.
- For single-line edits, char-level diff with magenta highlight on the changed characters.
- ASCII art `+` and `-` columns at the left margin (git-status idiom).

### Empty-state polish

- **Hint line fade-in** on first load (300ms opacity).
- **Needs-attention items** could carry a yellow left-border accent on hover, matching the "needs attention" semantic.
- **First-time tour** — if no commits have ever been made, the empty state could carry a one-line "press `:` for commands · `?` for help" reminder.

### Mobile transitions

- **Tab swap animation.** When switching tabs at ≤700px, the outgoing pane could slide left/right depending on the direction of switch (Explorer → Record slides left). Adds the app-style feel that matches the iOS tabbar choice.
- **Bottom safe-area** on iPhone — ensure the tabstrip respects `env(safe-area-inset-bottom)` so the tabs don't sit under the home indicator.
- **Filter on mobile.** Currently no way to invoke the filter (no `/` key). A small `[/]` button somewhere on the Explorer's tabstrip or above the tree could open the filter input, with mobile-appropriate keyboard handling.

### Easter eggs / character

- **Empty Log pane** when there are no pending changes and no commits in the session — could carry an ASCII flourish, a small `─ no pending ─` divider with a soft border on top and bottom.
- **Commit celebration.** On successful commit of 5+ changes, the saved confirmation could include a count badge (`+5 ✓`) that fades through the success-green color.
- **Konami code** unlocks an ascii easter egg in the Log pane history.

### Reduced motion

A pass across every animation to confirm `prefers-reduced-motion` behavior:

- Spinner already snaps to static `⏵`.
- Progress bar already snaps to a static dim line.
- Cursor pulse/decay should respect the media query (currently animates).
- Identity caret blink should respect it (currently always blinks).
- Any new transitions added per this roadmap should default off under reduced-motion.

## Commit convention reminder

Per CLAUDE.md, every commit message uses the structure:

```
[short subject line describing what was produced or changed]

Directed by: [what the human asked for, decided, or specified]
Produced by: AI (Claude)
Human decisions: [any notable choices, overrides, or departures from what AI proposed]
```

Each phase typically lands as one commit so the history reads as a sequence of meaningful steps.
