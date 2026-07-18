# Task List: arc-view

- **Design:** `spec-arc-view.md`

---

## **Phase 1:** `arc view` command and oracle-resolved kind resolution

_Purpose:_ Stand up the read-only `arc view <kind>` verb end-to-end in plain output — every v1 kind resolves its
artifact through the status-oracle chain with zero path construction, bare `arc view` defaults to `tasks`, absent
artifacts and the two error paths render explicit messages, and content reaches the terminal as plain stdout (the
non-TTY contract and plain fallback). Pretty rendering (Phase 2) and task-structure context (Phase 3) layer on top.

_Design decisions:_ Kinds are a semantic registry mapping a kind name to a **shared artifact-group resolver** that
owns all path knowledge — the viewer constructs zero paths, so artifact re-homes and renames (including the future
storage-substrate migration) land with zero CLI contract change. The resolver lives in the oracle/resolver layer
(not viewer-private): it composes the existing resolvers session-init consumes (`runActiveSessionInitStatus`,
`resolveActiveCohortDocPath`, `resolveSessionNotesPath`, the `user-surfaces` resolver) and adds the spec/draft/notes
derivation those don't cover. One `kind → path` home keeps the design DRY and storage-forward-compat (the viewer
knows kinds, the resolver knows paths). Each kind resolves to a uniform result — a path plus whether the artifact
is present — so the absent and error paths (§ 1.3) read one contract rather than each sub-resolver's own null
convention; when more than one work unit is active (the parallel-worktree case), the resolver selects the current
worktree's unit by branch match, never interactive disambiguation. Session-init's `resolveLoadSetManifest` is a
separate read-set projection and is left unchanged here. Three-layer CLI shape mirrors `arc status`: `cli.ts`
wiring → `handlers/view.ts` I/O boundary → `commands/view/` orchestrator (`runView`).

### `[x]` **1.1 Scaffold the `arc view [kind]` verb and default kind**

- _Goal:_ `arc view [kind]` is registered and dispatches to a testable `runView` orchestrator through the
  handler boundary; bare `arc view` resolves to `tasks` with zero further input.

- _Outcome:_ Registered the positional kind and scope flags through the CLI → handler → `runView` layers; the
  orchestrator defaults an omitted kind to `tasks` and preserves explicit kinds without prompting.

### `[x]` **1.2 Build the kind registry over a shared artifact-group resolver**

- _Goal:_ each v1 kind resolves through one shared resolver in the oracle/resolver layer to a uniform result — the
  artifact's path plus whether it is present — with zero path construction in the viewer: WU-scoped kinds (`tasks`,
  `spec`, `draft`, `meta`, `notes`, `cohort`, `session-notes`) off the resolved active meta, identity-global kinds
  (`working-memory`, `inbox`) rooted at the primary worktree, `inbox --project` at the fixed shared-inbox path.

    - `[x]` **1.2.a Resolve the active work unit, then its WU-scoped artifacts**
        - Added branch-matched multi-WU selection and semantic resolution for the active meta, task list,
          conventional design siblings, cohort document, and per-WU SESSION-NOTES; missing artifacts retain a
          first-class `absent` result.

    - `[x]` **1.2.b Resolve the identity-global kinds and the `--project` scope**
        - Routed working memory and the personal inbox through the primary-worktree user-surface resolver, while
          `inbox --project` resolves the shared tracked inbox without requiring identity.

- _Outcome:_ A shared artifact-group resolver now owns the full kind-to-path contract and returns uniform
  `resolved` / `absent` / `error` results, leaving the viewer storage-agnostic.

### `[x]` **1.3 Handle absent artifacts and the error paths**

- _Goal:_ the resolver's uniform result renders three ways — `resolved` → the artifact; `absent` → an explicit
  one-line "not present" message (exit 0); `error` → a stderr message — while the pre-resolution guards (unknown
  kind, no resolvable WU context, unresolved identity) each error listing the valid kinds.

- _Outcome:_ Normal absence emits a one-line stdout message with exit 0; unknown kinds, unresolved WU/identity
  context, unreadable files, and ambiguous or unreadable SESSION-NOTES directories use stderr and exit 1 while
  teaching the valid kind set.

### `[x]` **1.4 Emit resolved content as plain stdout (non-TTY contract and plain fallback)**

- _Goal:_ the resolved artifact's content writes to stdout as plain text with no pager spawn, no ANSI, and no hang
  under non-TTY — the baseline output path every render mode builds on.

- _Outcome:_ The handler writes the exact artifact body to stdout without ANSI or pager activity; direct subprocess
  coverage verifies both real non-TTY output and prompt-free completion with piped stdin.

## **Phase 2:** Renderer resolution and pager composition

_Purpose:_ Enrich TTY output — detect an available renderer (`glow` → `bat` → plain), invoke it in its
pager-composing mode (`less -R` for the plain renderer), and honor the user-scoped `arc.viewRenderer` override
regardless of detection order. Non-TTY keeps the Phase 1 plain path unchanged.

_Design decisions:_ Renderer choice is personal taste, so the override is a two-tier git-config key
(`arc.viewRenderer`, matching the flat `arc.<camelCase>` idiom) resolved via `resolveGitConfigOverride` — no
`arc-config.yml` axis; the migration seam to the user-scoped config substrate is recorded, not built. Pager and
renderer invocation are net-new — no pager or ANSI utility exists in the codebase today.

### `[x]` **2.1 Detect the renderer by PATH probe with ordered fallback**

- _Goal:_ the viewer selects the first available of `glow` → `bat` → plain by probing PATH, so it works on any
  machine with the plain fallback always viable.

- _Outcome:_ Added a side-effect-free selection seam that probes `glow`, then `bat`, and always lands on the
  viable plain renderer when neither executable is present.

### `[x]` **2.2 Add the `arc.viewRenderer` user-scoped override**

- _Goal:_ `arc.viewRenderer` (`glow` / `bat` / `plain`) selects the renderer explicitly, overriding detection
  order; an invalid value warns and falls back to detection.

- _Outcome:_ Added the two-tier `arc.viewRenderer` resolver over `resolveGitConfigOverride`; valid personal choices
  bypass PATH probing, while invalid values warn and continue through ordered detection.

### `[x]` **2.3 Compose the renderer with a pager under TTY**

- _Goal:_ under a TTY the selected renderer streams through a pager (git-idiom handling; `less -R` for the plain
  renderer), rendering once and exiting; non-TTY bypasses the pager entirely (the Phase 1 plain path).

- _Outcome:_ TTY rendering now uses each tool's pager-composing mode (`glow --pager`, `bat --paging=always`, or
  `less -RFX`); non-TTY returns before renderer detection, and subprocess coverage verifies one-shot spawn and
  prompt-free pipe behavior.

## **Phase 3:** Task-structure context — counter band, region output, and cursor anchoring

_Purpose:_ Layer the `tasks`-specific surfaces onto the render foundation — a checkbox counter parser feeds the
phase/task/overall band (with a rendered-at timestamp) prepended to the `tasks` render, other kinds carry a
one-line header, `arc view tasks --current` emits the current-task section as bare plain stdout for `watch` / pipe
liveness, and pager mode opens at the current task, every anchoring failure degrading rather than erroring.

_Design decisions:_ Counts derive from the same checkbox parse as the existing task-cursor, but the tally parser
is net-new — `resolveTaskListCursor` (`src/lib/task-list/cursor.ts`) exposes only the first-open position, not
done/total or phase counts. `--current` and open-at-cursor both key off that cursor. A malformed list renders
bandless and unanchored (warning on stderr, exit 0) so the viewer can still inspect the file that needs fixing.
Agent-position anchoring (`session-locus-model`) is a recorded upgrade seam, not a dependency here.

### `[ ]` **3.1 Parse task-list checkbox tallies**

- _Goal:_ a parser derives phase X/N, the current task id, subtask i/n, and overall done/total from a task list's
  checkboxes — the counts the band renders — sharing the cursor's checkbox-marker grammar rather than a second
  heuristic.

    - _Note:_ the cursor reuses only cover the marker grammar: `resolveTaskListCursor` tracks no phase identity
      (a level-2 heading only resets the current task) and exposes neither per-parent subtask index/count nor
      done/total — its `ParsedTask` / `ParsedSubtask` and full task array are private. Phase X/N and the tallies are
      additive parsing: either export the cursor's internal parse made phase-aware, or build a phase-aware sibling
      over the same grammar.
    - Build `test-first` (one behavior at a time):
        - overall done/total counted across all phases
        - current phase index and phase count
        - the current task's subtask i/n
        - a malformed task list → the parser signals malformed (no throw)

### `[ ]` **3.2 Render the counter band, one-line header, and rendered-at timestamp**

- _Goal:_ the `tasks` render is prepended with a band —
  `Phase X/N · Task X.Y (subtask i/n) · done/total overall · rendered HH:MM` — while every other kind carries a
  one-line `kind · WU · rendered-at` header, both appearing in pager and plain modes.

    - _Note:_ the rendered-at timestamp is the staleness signal — the render is static by design, refreshed by
      re-invocation, so the timestamp makes staleness visible rather than silent.
    - Build `test-first` (one behavior at a time):
        - the `tasks` band formats phase/task/subtask/overall counts plus the timestamp
        - a non-`tasks` kind formats the one-line `kind · WU · rendered-at` header
        - the band / header appears in both pager and plain modes

### `[ ]` **3.3 Emit the `--current` region output**

- _Goal:_ `arc view tasks --current` writes the current-task section as bare plain stdout (no band, no pager) that
  composes under pipes and `watch`; no open task prints an explicit "no open task" line; a malformed list prints
  an explicit one-line stdout message (warning on stderr, exit 0), never the full document.

    - _Shape:_ "the current-task section" is the current **parent-task** block — from the cursor's section
      `lineHint` (the `###` parent heading) through the line before the next `###` parent heading or `##` phase
      heading, whichever comes first. The cursor exposes only a start `lineHint`, so the end boundary is a net-new
      scan for the next heading; the block, not just the open leaf subtask, is the region.
    - _Rationale:_ `watch` / pipe consumers expect a bare region — emitting the full document or an empty output on
      a degrade breaks them, so both degrade cases stay single-line.
    - Build `test-first` (one behavior at a time):
        - the current parent-task block is extracted as bare plain stdout (no band), bounded by the next heading
        - no open task → explicit "no open task" line
        - a malformed list → one-line stdout message, stderr warning, exit 0 (not the full document)

### `[ ]` **3.4 Open at the current task in pager mode, degrading on failure**

- _Goal:_ pager mode opens at the current task where the renderer/pager combination supports anchoring; a malformed
  or unanchorable list renders bandless and unanchored with a one-line stderr warning (exit 0) rather than failing.

    - _Note:_ the cursor supplies a source-file line hint — a `less +<line>` jump is direct under `bat` / plain,
      but `glow` re-renders markdown and does not preserve source lines, so its anchor needs a different mechanism
      (pattern anchor on the task id, or rendered-line mapping) or the unanchored degrade. Resolved against the
      real binaries during implementation, within the degrade posture.
    - Verify (test-first on the degrade selection; integration for the pager open):
        - a resolvable cursor + an anchor-capable renderer → opens at the current task
        - a malformed list → bandless, unanchored, one-line stderr warning, exit 0
        - a markdown re-renderer with no source-line mapping → pattern-anchor or unanchored degrade, never an error

## **Phase 4:** Verification

### `[ ]` **4.1 Complete verification** — load and follow `verify-work-unit.md`

---

## Success Criteria

- `[ ]` Bare `arc view` in a WU worktree renders the active task list through the resolved renderer, opened at the
  current task where the renderer/pager combination supports anchoring (unanchored is a degrade, never an error),
  and exits — no watch, re-render, or input handling anywhere in the verb
- `[ ]` Every v1 kind (`tasks`, `spec`, `draft`, `meta`, `notes`, `cohort`, `session-notes`, `working-memory`,
  `inbox` / `inbox --project`) resolves through the oracle chain with zero path construction in the viewer
- `[ ]` Under a linked worktree the identity-global kinds (`working-memory`, `inbox`) resolve to the primary
  checkout while `session-notes` stays worktree-local (per-WU)
- `[ ]` The identity-global kinds resolve with no active WU; the WU-scoped kinds error, listing the valid kinds
- `[ ]` `arc view tasks --current` emits the current-task section as bare plain stdout that composes under pipes
  and `watch`; with no open task it prints an explicit "no open task" line
- `[ ]` The `tasks` render carries the phase/task/overall counter band with a rendered-at timestamp in both pager
  and plain modes; every other kind carries the one-line header
- `[ ]` Non-TTY invocation produces plain stdout with no pager spawn and no hang
- `[ ]` A malformed task list renders bandless and unanchored with a one-line stderr warning (exit 0); an absent
  optional artifact (`notes`, `cohort`) yields its explicit one-line message
- `[ ]` Unknown-kind errors list the valid kinds
- `[ ]` The user-scoped renderer override (`arc.viewRenderer`) selects the renderer regardless of detection order
- `[ ]` All quality gates pass (tests, linting, type checking)
- `[ ]` Ready for integration
