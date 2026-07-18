# Spec (`outline`): arc-view

- **Origin:** [internal]

- **Purpose:** An `arc view <kind>` CLI verb that resolves the current worktree/branch/identity context to the
  working set's artifacts and renders them in the terminal — zero input, read-only, rendered once. A pager view
  for reading, plus a plain region output that composes with standard unix tooling for everything live.

---

## Problem / Context

Agents get a codified strategic partial read of the active task list at session-init; the human operator has no
symmetric surface. Viewing the current task list today means opening an editor or hand-locating the file and
piping it through a renderer. Under worktree parallelism that cost recurs constantly: an editor pinned to
inbox / roadmap / tasks breaks — state forks per checkout, files reopen on every swap — promoting zero-input,
cwd-resolved terminal surfaces from convenience to load-bearing.

What earns a dedicated verb over `glow <path>` is **resolution**: the current worktree, branch, and identity
already determine the working set — the active WU's artifact group, its cohort doc, the operator's own notes and
inboxes — so the user supplies zero input. The sibling need (following the work live, the at-a-glance context
card) carries status/HUD semantics and lives in `status-hud`.

## Decision(s)

1. **Oracle-resolved, never raw paths.** Every path the viewer touches comes from the resolver layer — the same
   status-oracle chain session-init's load set consumes (active-meta resolution → artifact paths, including
   multiple-candidate handling, identity scoping, and primary-vs-linked worktree resolution) — with zero path
   construction in the viewer. When more than one work unit is active (parallel worktrees), the viewer picks the
   current worktree's unit by branch match — deterministic, never interactive disambiguation — falling to the
   no-resolvable-WU error (Decision 2) when no unique match exists. Read-side only: no writes, no notes-specific
   machinery. Kinds are semantic, not
   filenames, so artifact re-homes and renames (including the storage-substrate migration) land with zero CLI
   contract change.

2. **The v1 kind set, bounded by the resolved-not-known line.** The verb covers artifacts whose location must be
   *resolved* from live context, never artifacts whose location is merely *known*:
    - WU artifact group: `tasks` (primary), `spec`, `draft`, `meta`, `notes`;
    - `cohort` — the active WU's `cohort-*.md` when it names one;
    - identity-scoped surfaces: `session-notes` (per-WU — worktree-local, adjacent to the active checkout),
      `working-memory` and `inbox` (identity-global — resolving to the primary checkout under a linked
      worktree; `--project` selects the shared inbox: the flag keeps the kind grammar regular and matches the
      live qualifier convention).

   Bare `arc view` defaults to `tasks` — the zero-input ethos extends to the argument itself. A kind whose
   artifact is absent (`notes` when none exists, `cohort` on a standalone WU) renders an explicit one-line
   "not present" message, never an error. New resolver-backed kinds slot into the same registry without contract
   change; no dotted kinds (`inbox.user`) until the `TYPE.QUALIFIER` rename cascade lands — then as aliases.
   Kind discoverability rides teaching outputs, never the default: `--help` carries the kind table, and the two
   error paths — unknown kind, no resolvable WU context — list the valid kinds in the message. The no-WU-context
   error applies to the WU-scoped kinds only; the identity-global kinds (`working-memory`, `inbox` in both
   scopes) resolve without an active WU.

3. **Render once and exit — static view with an external-liveness bridge.** TTY: the full artifact through a
   pager, git-idiom handling. Non-TTY: plain stdout, no pager spawn, no ANSI decoration — an instance of the
   uniform non-interactive contract (`cli-substrate-adoption`). Staleness is visible, not silent: the band
   carries a rendered-at timestamp; refresh is re-invocation. For volatile artifacts, a cursor-anchored region
   output — `arc view tasks --current`, the current-task section as bare plain stdout (no band) — lets standard
   unix tooling supply interim liveness (`watch -n2 arc view tasks --current`) with zero watch machinery here.
   **Cap line: `arc view` renders once and exits — it never re-renders, never watches, never handles input.**

4. **Cursor anchor is file-derived; failure degrades, never hard-fails.** The deterministic first-open-checkbox
   cursor (the existing task-cursor mechanism) drives open-at-current-task in pager mode and the `--current`
   region selection. A malformed task list renders bandless and unanchored with a one-line stderr warning — a
   viewer that errors on a malformed document blocks inspecting the very file that needs fixing. `--current`
   with no open task prints an explicit "no open task" line rather than empty output; `--current` on a
   malformed task list prints an explicit one-line message to stdout (warning on stderr, exit 0) — never the
   full document, which would break `watch`/pipe consumers expecting a bare region. Anchoring to the *agent's*
   live position (`session-locus-model`) is a recorded upgrade seam, never a core dependency.

5. **Structure context via the statusline band.** A breadcrumb/counter band —
   `Phase 4/6 · Task 4.1 (subtask 2/5) · 23/61 overall · rendered HH:MM` — prepends to the `tasks` kind's full
   render in both pager and plain modes. Counts derive from the same checkbox parse as the cursor; the codified
   task-list format makes that parse reliable rather than heuristic. Counters are `tasks`-specific: other kinds
   carry a one-line header (kind · WU · rendered-at) instead. The static body is always the full artifact — the
   folded-outline body is the panel's rendering and lives in `status-hud`.

6. **Renderer resolution: detection plus one user-scoped override.** Detection probes PATH availability in
   order `glow` → `bat` → plain (piped through `less -R` when paging), invoking each in its pager-composing
   mode. One user-scoped override key — `arc.viewRenderer`, matching the flat `arc.<camelCase>` git-config
   idiom (`arc.identity`, `arc.notesPush`) — selects a renderer explicitly (`glow` / `bat` / `plain`);
   renderer choice is personal taste, not project convention. Interim home is git config (the existing
   user-scoped surface), with an explicit migration seam to `config-storage-architecture`; no new
   `arc-config.yml` axis.

## Scope boundary (No-gos)

- **No arbitrary-path pass-through.** Zero value over running the renderer directly; muddies the kind contract;
  bakes "the file is the surface" into the UX — the assumption the storage forward-compat discipline rejects.
- **No canonical reference docs by name** (DEV-RULES, briefs, PROJECT-PRD, QUICK-REFERENCE, strategies). They
  fail the resolved-not-known test, and that namespace is mid-rename — a name table now is churn bait. Recorded
  as a deferred extension; revisit after the renames land.
- **No ROADMAP / project-status surfaces.** A live projection already supersedes the file
  (`arc status --project`); `roadmap-tooling` owns that render surface. General rule: where a live projection
  supersedes the document, the kind stays out; where the document is the record surface, it belongs in.
- **No live watch, follow, or context card** — `status-hud`'s (Decision 3's cap line).
- **No TUI ambitions** (scrolling, input handling, panes) — render-only.
- **No writes** — the verb is read-side only.

## Consequences & Risks

- **Staleness by design.** A static render can mislead beside a live session; accepted — the rendered-at
  timestamp makes it visible, re-invocation is an up-arrow away, and the `--current` region under `watch`
  bridges the gap until `status-hud` ships the real panel.
- **Two creep vectors, each with a recorded guard.** Kind-set creep is held by the resolved-not-known line
  (Decision 2); liveness creep is held by the cap line (Decision 3). Both guards are in the contract, not just
  the plan.
- **The shared inbox bends the resolved-not-known line** (a fixed tracked path today). Accepted for family
  symmetry with the user inbox, and because the document is its own record surface mid-migration — the kind
  mapping is what keeps its re-home invisible.
- **Renderer variance across machines** is accepted as personal-taste territory; the plain fallback keeps the
  verb functional everywhere, and the interim git-config key carries a known migration seam.
- **Sequencing:** `status-hud` shares this WU's oracle resolution, checkbox parse, and renderer infrastructure;
  the `--current` region output doubles as its interim liveness bridge and generates the v1 usage evidence its
  sequencing waits on.
- **Storage-substrate assumptions (forward-compat).** Read-only and oracle-resolved, so re-homes and renames stay
  invisible (Decision 1). Two assumptions ride the materialized-substrate target and are the storage work's to
  preserve: (1) artifacts materialize as renderable markdown at resolvable paths — the kind→path indirection covers
  location, not a shift to a non-materialized structured record; (2) worktree→active-WU selection uses branch match
  (session-init's existing convention), kept in the shared resolver so a substrate resolving that association
  differently is a single-site swap.

### Coordination seams

- `status-hud` — sibling chunk (context card, live panel, folded outline, live tallies); shares infrastructure.
- `session-locus-model` — optional cursor upgrade seam (agent-position anchoring), never a core dependency.
- `cli-substrate-adoption` — non-TTY behavior lands as an instance of its uniform non-interactive contract.
- `config-storage-architecture` — the renderer key migrates off git config when the user-scoped substrate ships.
- `naming-conventions` — dotted-kind aliases may land with the `TYPE.QUALIFIER` cascade, never before.
- `operational-state-docs` / `shared-inbox-model` / `local-mode` — inbox and per-user-state homes migrate to the
  records/materialized substrate; resolver-backed kinds insulate the viewer.
- `roadmap-tooling` — explicit non-overlap: `arc view` never grows a project-status renderer.

## Success Criteria

- Bare `arc view` in a WU worktree renders the active WU's task list through the resolved renderer, opened at
  the current task where the resolved renderer/pager combination supports anchoring (unanchored render is the
  degrade, never an error), and exits — no watch, no re-render, no input handling anywhere in the verb.
- Every v1 kind (`tasks`, `spec`, `draft`, `meta`, `notes`, `cohort`, `session-notes`, `working-memory`,
  `inbox` / `inbox --project`) resolves through the oracle chain with zero path construction in the viewer;
  under a linked worktree the identity-global kinds (`working-memory`, `inbox`) resolve to the primary
  checkout while `session-notes` stays worktree-local (per-WU).
- The identity-global kinds resolve with no active WU; the WU-scoped kinds error, listing the valid kinds.
- `arc view tasks --current` emits the current-task section as bare plain stdout (no band) that composes under
  pipes and `watch`; with no open task it prints an explicit "no open task" line.
- The `tasks` render carries the phase/task/overall counter band with a rendered-at timestamp in both pager and
  plain modes; every other kind carries the one-line header.
- Non-TTY invocation produces plain stdout with no pager spawn and no hang.
- A malformed task list renders bandless and unanchored with a one-line stderr warning (exit 0); an absent
  optional artifact (`notes`, `cohort`) yields its explicit one-line message.
- Unknown-kind errors list the valid kinds.
- The user-scoped renderer override selects the renderer regardless of detection order.

## Open items

- Per-renderer invocation fine-tuning (width handling, color behavior under `less -R`, pager flag interplay) —
  resolved against the real binaries during implementation.
- Open-at-cursor anchor mechanism per renderer: the cursor supplies a source-file line hint; a `less +<line>`
  jump is direct under `bat`/plain, but a markdown re-renderer (`glow`) does not preserve source lines, so its
  anchor needs a different mechanism (pattern anchor on the task id, rendered-line mapping) or the unanchored
  degrade. Resolved against the real binaries during implementation, within Decision 4's degrade posture.
