# Plan: Worktree Foundation

**Purpose:** Land the mechanism layer for parallel and mobile work — extract shift lifecycle as
mode-universal infrastructure, add worktree-aware shift, give session-init worktree context awareness
including branch-gone detection, and resolve cross-WU file sync semantics. Mechanism only; conventions
land in `plan-concurrent-work-conventions.md`.

- **State:** Draft — pre-PRD exploration captured during agile/mobility expansion discussion 2026-04-28.
  Split from former Work-Unit Mobility WU; the conventions layer became Concurrent Work Conventions and
  the agile-lifecycle layer became Agile WU Lifecycle. Updated 2026-05-08 to consume per-worktree
  isolation foundation from new upstream Work Organization Reform WU — see § Dependencies.

- **Created:** 2026-04-28

- **Origin:** Originally Phases 1–2 of the Work-Unit Mobility plan. Split out during the
  agile/mobility design discussion to ship mechanism earlier and let downstream WUs (User Sync UX
  Polish, Coord Probe, Agile WU Lifecycle) consume worktree mechanics from a clean substrate. Resolves
  the long-standing concern that ROADMAP claims "parallelizable" downstream WUs without ARC actually
  having parallelism infrastructure — Worktree Foundation makes parallelism real.

  **2026-05-08 update:** Pre-PRD sanity-check on the parallelism trio surfaced that per-worktree
  isolation requires a status-file location and lifecycle reform that this WU was implicitly
  assuming but not delivering. That foundation was carved out into Work Organization
  Reform, which now sits upstream of this WU. Concrete consequence: scope item 4's
  branch-gone resolution cascade consumes WOR's roster-cascade implementation; scope item 8's
  main-on-main pattern composes with WOR's single-branch-per-WU model; the per-worktree isolation
  goals throughout this WU are delivered structurally by WOR rather than enforced through
  worktree-specific mechanism here.

---

## Problem / Motivation

ARC has no awareness of git worktrees. The framework works correctly inside a worktree (most
behavior generalizes naturally via branch-based disambiguation), but nothing surfaces worktree
context, and several mechanisms silently assume one-working-tree-per-repo:

- `session-init` orientation reports current branch but never identifies which physical worktree the
  session is in
- `SESSION-NOTES.md` is gitignored — each worktree holds its own physical copy for the same identity,
  violating the "one identity = one workspace" assumption in [strategy-team-coordination.md][team-coord]
- Cross-WU files like `ATOMIC-INBOX.md` get divergent per-worktree views via the per-commit notes-save
  model
- `activate-work-unit.md` and `integrate-work-unit.md` make no provision for worktree creation or
  removal
- No strategy doc describes how worktrees fit ARC's work-unit model

A concrete instance surfaced 2026-04-29 during this plan's pre-PRD evolution. Planning branch
`technical/plan-session-operational-flow` was integrated on machine A; a successor WU
(`technical/interlock-foundation`) started there. On machine B, session-init opened on the now-deleted local
planning branch and reported `worktree: remote-unavailable / failureReason: error` — masking that upstream had
been pruned cleanly. Manual recovery (fetch --prune → checkout main → fast-forward → checkout WU branch →
notes-pull) was straightforward, but the workflow gave no signal that recovery was needed or what shape it should
take. The cascade specified in scope item 4 resolves this as the simplest pre-worktree single-WU instance of the
multi-WU branch-gone problem.

Without this WU shipping, ROADMAP's "parallelizable" sibling claims are aspirational for solo work and
team mode is the only path to actual concurrency. Worktree Foundation makes per-WU-per-worktree
isolation a first-class capability.

The shift lifecycle (`plan-arc-modes.md` § Shift Lifecycle, ~478 lines) was designed as mode-universal
infrastructure that arc-modes calls into. Extracting it is the natural form of what the architecture
already anticipates (`plan-arc-modes.md` L4378-4387: *"This is why shift lives in its own
cross-cutting section rather than inside the Local mode treatment. It's universal."*).

---

## Scope

### In scope

1. **Shift lifecycle extraction from `plan-arc-modes.md`.** The full `## Shift Lifecycle` section
   (~478 lines, L3923-4398), `### Alignment with Work-Status Restructure WU` (~62 lines, L4400-4460),
   `## Mid-Session Orientation` (`/arc-status`, ~125 lines, L4462-4585), skill inventory items for
   `/arc-status` and `/arc-shift`, and ~142 scattered shift cross-references move into this WU.
   Modes plan retains forward-pointing references only.

2. **Worktree-aware shift.** `/arc-shift` gains a worktree mode:
    - `/arc-shift --worktree <path>` creates a new worktree for the incoming WU, leaves current WU's
      worktree intact with uncommitted state preserved
    - `<path>` argument is optional — when omitted, resolves per item 10's worktree location template
      (default `../{repo}.{branch}`); explicit `<path>` overrides. Branch name follows item 10's
      branch-naming method.
    - Metadata-only shift remains available for the niche atomic-detour case (in-session pivot for atomic-tier
      work or brief metadata-only changes); under the parallel-session concurrency model from
      `plan-session-operational-flow.md` § Concurrency Model, sustained multi-WU work uses parallel
      sessions in separate worktrees rather than in-session shifts
    - Decision heuristic documented: detour duration + uncommitted-state importance + whether sustained work
      is intended (sustained → parallel session, brief → metadata shift)

3. **Spawn vs continue separation for new-WU creation.** Distinguishes two operations conflated under today's
   "starting a WU" mental model:
    - **Spawn** = one-shot operation invoked from an existing session that creates infrastructure for a new WU:
      branch, worktree (when applicable per tier), status file with appropriate tier defaults, empty
      SESSION-NOTES (optionally seeded with a one-line breadcrumb pointing to the spawning context). Reports the
      new worktree path. Returns to the originating session's context.
    - **Continue** is realized via item 11's cold-start bootstrap primitive. A fresh session in the new
      worktree invokes the primitive, which onboards via `arc-resume` semantics and picks up the
      scaffolded state. Same primitive serves fresh sessions in worktrees ARC did not spawn (manual
      `git worktree add`, externally tool-spawned) — bootstrap is uniform across origin.

   This separation solves the "session continues in wrong worktree with stale context" problem of today's
   single-operation model. The originating session does the spawn; a fresh session in the new worktree does the
   work via the cold-start primitive. Output ergonomics: spawn reports the path with an actionable invocation
   hint (e.g., `cd <path> && arc-resume`).

   **Activation-time concurrency check (advisory).** Before creating the worktree, the spawning session reads
   in-flight WUs (`git worktree list` plus identity-filtered status files) and assesses scope overlap with the
   new WU per Concurrent Work Conventions's strategy-doc heuristics — agent-led, judgment-based, advisory.
   Surfaces concerns to user before spawn (e.g., "WU-X is currently in flight in `../arc-wu-x` and touches the
   same module — proceed in parallel, or sequence after WU-X integrates?"); does not gate spawn. No probe
   tooling, no `**Touches:**` field — relies on agent reading existing scope descriptions in the in-flight WUs'
   `**Purpose:**` / spec content. Forward-compat: degrades to no-op when no other in-flight WUs exist
   (single-WU world). When this WU ships before Concurrent Work Conventions codifies the heuristics,
   the check falls back to general agent judgment over `**Purpose:**` / spec text — the check shape is stable;
   the heuristics document calibrates what counts as overlap. The same check fires from item 11's cold-start
   primitive — entering a fresh worktree triggers the read against `git worktree list`, surfaces the same
   advisory regardless of which entry point invoked it.

   **Tier-aware spawn applicability:**

   - **atomic** tier: no worktree, no spawn — atomic work happens in the current worktree on a side-branch (under
     `branch.protection: full`) or direct-to-main (under `partial`). Spawn-vs-continue separation doesn't apply.
   - **quick** tier: worktree by default under `full` protection; optional under `partial`. Spawn applies when
     concurrent execution is intended.
   - **standard** tier: worktree always under `full`. Spawn-vs-continue is the dominant path — originating session
     is almost never the working session.

   **Naming TBD:** the spawn operation may be `/arc-spawn`, `/arc-shift --detach`, or extend
   `plan-agile-wu-lifecycle.md`'s proposed `arc start` command with an `--into-worktree` flag. Resolves at PRD.

   **Auto-mode boundary:** spawn never fires under auto-cascade. Always an explicit user act.

4. **Worktree awareness in session-init and `/arc-status`, including branch-gone detection.** Small
   additions, not architectural:
    - Session-init detects worktree context via `git rev-parse --git-dir` and surfaces it in
      orientation when non-primary (`worktree: ../arc-wu-b`)
    - `/arc-status` reports worktree context as part of the current-focus line
    - **Branch-gone detection at session-init.** When fetch reveals current branch's upstream is
      `gone` (post-prune; today reported as `remote-unavailable / failureReason: error`), surface as a
      dedicated `branch-gone` worktree state with a tailored prompt instead of conflating with
      genuine network failures. Resolution cascade consumes Work Organization Reform's
      cross-worktree roster-cascade implementation: `git worktree list` (other active worktrees) →
      per-worktree status-file reads via the WOR cascade (active WU branches via `**Branch:**`
      field, filtered by `(@identity)` ownership when team mode; cross-branch read replaces the
      single-`active/`-directory listing assumption) → recently-active remote branches
      (post-fetch, within `coord.recency_days`) → coord-probe (per `plan-coord-probe.md`) → fall
      back to `main` with explicit confirmation. Per-worktree action varies: stranded in main / administrative
      worktree → propose switch to next admin or feature branch; stranded in WU worktree whose branch
      was merged externally → propose worktree removal + status-file archival cleanup.
      **Detect-stop-prompt as default for ambiguity:** when no high-confidence single signal emerges,
      session-init stops and surfaces candidates rather than guessing.
    - **Notes-pull ordering rule under branch-gone.** When `branch-gone` fires, align git state (fetch, resolve
      target branch via cascade, switch) **before** running `arc user pull`. Notes describe context that requires
      aligned git refs — pulling against a stale branch yields correct content referencing surfaces (status files,
      atomic companion files) that don't exist on the current branch. The ordering reverses session-init's standard
      Step 2 → Step 3 sequence for this specific state.
    - **Trust-hierarchy axis split in [session-init.md][session-init] Step 7.** Refactor the existing single
      hierarchy (git > task list > status > notes) into two axes per § Roster vs context: (a) *truth of work
      state* — git authoritative (current hierarchy, narrowed to this question); (b) *which work am I picking up* —
      identity-filtered status files + worktree list authoritative (new axis). Mismatch examples in Step 7
      redistribute to the appropriate axis.
    - **Forward compatibility with pre-worktree single-WU world.** The branch-gone cascade ships value before
      worktrees are in widespread use. Pre-worktree, the cascade trivializes — `git worktree list` returns one
      entry, identity-filter on status files yields one match, notes-pull confirms. Shipping isn't gated on
      worktree adoption; today's single-WU multi-machine recovery is the simplest instance of the same mechanism.

5. **`/arc-status` skill.** Mode-universal core (git delta, current focus, uncommitted files) plus
   Full-only "In flight" block tightly coupled to shift vocabulary. Backed by `mid-session-status.md`
   workflow. Naming depends on ARCd Rebrand freeing `arc status` CLI name. Bundled with shift because
   the skill design is unified — splitting forces two PRDs for one skill.

6. **Cross-WU sync mechanism implementation.** `arc user save/load` ships path-driven sync
   dispatch over the structural foundation delivered by Work Organization Reform (WOR R65). The
   structure WOR ships:

    - `user/{identity}/<wu-name>/**` — per-WU class (SESSION-NOTES, contributor-role
      `meta-<wu-name>.md` when applicable). Each worktree's `user/{identity}/` filesystem
      contains exactly one WU subdir (the active WU's).
    - `user/{identity}/**` flat at root — cross-WU class (USER-INBOX, WORKING-MEMORY).
    - `user/{identity}/.internal/**` — per-machine, never synced (existing convention).

   Mechanism this WU delivers:

    - **Path-driven dispatch.** `arc user save/load` infers sync class from path structure. No
      allowlist file, no in-band class declaration — path is the convention. Resolves the prior
      open question on file class declaration.
    - **Per-WU subdir load.** Restore from the most recent reachable note containing the current
      WU's subdir; older notes' subdirs for different WU names skip. Resolves the spawn →
      first-load overwrite case: a fresh worktree's load doesn't pick up the prior WU's
      SESSION-NOTES from main's ancestor walk because the WU subdirs don't match.
    - **Cross-WU file merge.** Read N most-recent notes ref-wide; merge file contents via
      value-level list-union of H3-headed entries (matching the codified shape for both
      USER-INBOX and WORKING-MEMORY). Dedupe by entry identity (heading).
    - **Tombstones for cross-WU deletions.** Entry removal writes a `## Removed: {name}` marker
      with timestamp; merge respects the most recent tombstone over earlier inclusion. GC
      strategy (after N notes / N days) — PRD decision.
    - **Concurrent push reconcile on `refs/notes/arc/user/{identity}`.** When parallel worktrees
      push and the second hits non-fast-forward, reconcile via `git notes merge` (cat_sort_uniq
      default); surface conflict to user when non-trivial.

   WOR ships the structural foundation (file relocations, strategy + workflow updates, in-flight
   migration); this WU layers mechanism on top of resolved structure. No allowlist file, no
   frontmatter convention — the path-class invariant is established by WOR and consumed here.

7. **Pause-pointer reconciliation: option 2 (deprecate, migrate to shift state).** The four current
   pointer fields (`Interrupts:`, `Paused At:`, `Paused To:`, `Spawned:`) are retired. Their use cases
   migrate to shift's single-WU `**State:**` field with shift-state values
   (`Paused (date) — reason`). `manage-incidental-work.md` workflow migrates to use shift instead of
   the pointer fields. Updates ripple through [template-status.md][template-status],
   [strategy-work-organization.md][strategy-work-org] § Optional Pointer Fields, [clean-work-unit.md][
   clean-work-unit] L97-100 KEEP/REMOVE rules, and 2-3 other workflow touchpoints. Resolves the
   pre-PRD blocker on the original Mobility plan.

   **Reverse-pointer (from WOR 2.8 § Incidental Work Model reshape):** WOR collapses
   `strategy-work-organization.md` § Incidental Work Model to a transitional pointer that frames
   mid-execution interrupt handling abstractly ("capture on the current branch with clear commit
   boundaries"). When this WU lands shift state, update that section to reference shift-state
   mechanics concretely — the abstract framing was a placeholder pending this WU per
   audience-boundary discipline (no forward-pointers to unplanned future scope from adopter-facing
   strategies).

8. **Main-on-main pattern (no separate admin worktree).** External research (2026-04-28) confirms mature
   git-using projects don't maintain a separate dedicated administrative worktree — main itself serves the
   role. Document this as ARC's stance: the main worktree stays on `main` as a stable reference and serves as
   the launchpad for admin operations (planning sessions, sweep ceremonies, occasional global edits). Admin
   work under `branch.protection: full` runs in short-lived branches from main worktree. Forward-references
   tier-aware archive ceremony from `plan-agile-wu-lifecycle.md` which inherits this convention.

   **Atomic-tier launchpad role.** Under Work Organization Reform's single-branch-per-WU
   model, atomic WUs still get their own branch (one branch per WU, all tiers) but no dedicated
   worktree. The main worktree serves as the atomic launchpad: spin atomic from main worktree on a
   short-lived branch, ship via PR, return — without disrupting any in-flight WU's worktree state.
   This composes cleanly with the main-on-main pattern: main worktree handles admin ops + atomic
   launches; WU worktrees stay dedicated to their respective WUs.

   **Composition with externally-spawned worktrees.** When an external worktree-management tool
   spawns worktrees, the tool typically still occupies the main checkout as its "main workspace"
   (consistent across every surveyed tool — see External Research Citations). The main-on-main
   pattern still applies — the tool's main workspace IS ARC's main worktree, used for admin ops
   and atomic-launchpad work; tool-spawned worktrees serve as WU worktrees per item 11's
   cold-start primitive.

9. **arc-modes cross-reference sweep.** Content migration plus shift references in
   `plan-arc-modes.md` converted to cross-WU links. Applies before modes advances to PRD.

10. **Worktree conventions — branch-naming method and location template.** Two configurable
    conventions ship as substrate for items 2 and 11, both implemented as methods under
    `system/methods/` with the full method-override machinery from
    `strategy-configurability-architecture.md`:

    - **Branch-naming method** (`branch.naming_convention`). Default = Conventional Branch
      alignment per WOR's settled type-set — core 6 execution types plus `plan/<name>` for
      planning state. The method defers the type-set to WOR's resolution rather than hardcoding;
      WF references whatever WOR ships. Override surface mirrors `commit.format` for adopters
      with house conventions (Jira-prefixed, ticket-numbered, etc.). When ARC creates branches
      (`arc start`, `/arc-shift --worktree`, item 11's cold-start primitive), the configured
      convention applies. When branches arrive externally (manual `git worktree add`, external
      worktree-management tools), the convention is advisory — item 11's bootstrap surfaces a
      warning if the branch doesn't match, never refuses or relocates.

    - **Worktree location template** (`worktree.location_template`). Default =
      `../{repo}.{branch}` — flat sibling-parent layout, no nesting. Slashes in branch names
      replace with `-` for the directory segment (`feat/cool-thing` → `<repo>.feat-cool-thing`).
      Override examples documented for common alternatives: Worktrunk-style `~/{repo}.{branch}`,
      in-repo `.worktrees/{branch}`, centralized `~/dev/worktrees/{repo}/{branch}`. When ARC
      creates worktrees, the template resolves. When worktrees are created externally, ARC reads
      location from `git worktree list` — no enforcement, no relocation.

    - **Schema placement** uses flat dotted keys (`branch.naming_convention`,
      `worktree.location_template`) per current arc-config convention. Eventual flat-vs-nested
      schema evaluation may relocate these keys; this WU uses provisional flat-dotted form.

11. **Cold-start bootstrap primitive (provisional name TBD at PRD).** Second entry point
    alongside `arc start` / spawn, for bootstrapping a WU inside any existing worktree —
    ARC-spawned (the "continue" half of item 4), manually `git worktree add`-ed, or spawned
    by an external worktree-management tool (Conductor, emdash, Maestro, Zed, Warp, Worktrunk,
    Super, Superset, T3code, Soloterm, Nora — see External Research Citations):

    - Takes any spec input — file pointer, URL, issue link, existing ARC plan-doc, or just a
      name plus brief description — and scaffolds a meta-* file in the current worktree. Honors
      WOR's Origin ⊥ Spec orthogonality: external references populate `**Origin:**`; ARC-owned
      artifacts populate `**Spec:**`.

    - Subsumes the "continue" role of item 4's spawn-vs-continue separation. When `arc start` /
      spawn creates a worktree in an existing session, the fresh session in the new worktree
      invokes the cold-start primitive to pick up scaffolded state. Same primitive handles
      "agent enters a tool-spawned worktree with no prior ARC context" — bootstrap is uniform
      across origin.

    - Fires the activation-time concurrency check (item 4, advisory) from this entry point as
      well as from spawn. Same check, same heuristics — the cold-start path reads in-flight WUs
      via `git worktree list` plus identity-filtered status-file reads, surfaces the same
      advisory regardless of which entry point invoked it.

    - Honors item 10's conventions when ARC creates state (warns when an externally-named branch
      doesn't match the configured branch-naming convention; reads worktree location from
      `git worktree list` rather than enforcing the location template).

    - **Surface:** an `arc-resume`-style entry point. Concrete shape TBD at PRD — branching
      within existing `arc-resume` skill logic (cold-start triggered when no active WU is
      found), a dedicated `arc-resume --bootstrap` flag, or a separate skill. Naming defers to
      PRD.

    - **Discoverability** has two surfaces with different audiences (see Pressure Points §
      "Discoverability of the cold-start primitive"). User-side handled by strategy docs + docs
      site; agent-side handled within ARC's own session-init reads (`AGENT-BRIEF.ARC.md`,
      `arc-resume` skill content). No CLAUDE.md / AGENTS.md modification — ARC concerns stay
      within ARC's namespace.

### Out of scope

- **Focus-role model** (primary/companion/awaiting-external/parked) — landed by
  `plan-concurrent-work-conventions.md`.
- **Async-merge integration-surface audit** — landed by `plan-concurrent-work-conventions.md`.
- **`strategy-concurrent-work.md`** — landed by `plan-concurrent-work-conventions.md` (depends on
  mechanism + agile lifecycle landing first).
- **Tier model and `arc start` command** — landed by `plan-agile-wu-lifecycle.md`.
- **Automated worktree lifecycle CLI (`arc worktree create/remove`).** Advisory workflow integration
  only — `/arc-shift --worktree` invokes `git worktree add` under the hood, but no standalone
  `arc worktree` command. Worktree cleanup after merge is documented in `integrate-work-unit.md` as
  an advisory step, not automated.
- **Hooks at shift transitions (`post-shift-pause` etc.).** Hook symmetry deferred to a later
  hooks-completeness pass. No clear current need; hooks can be added later without breaking
  integrations.
- **Blessing concurrent agent sessions.** Framework won't block two simultaneous agent sessions in
  different worktrees, but documentation is explicit: this violates P2 (co-development bandwidth).
  This WU ships the mechanism; the conventions on usage pattern land in
  `plan-concurrent-work-conventions.md`.
- **Plug-in hooks for external worktree-management tools.** ARC does not attempt to integrate with
  specific tools' extension surfaces. Only Worktrunk documents hooks (`pre-start`, `post-start`,
  `pre-merge`, `post-merge`); the remaining surveyed tools expose no extension points. ARC operates
  as a discipline layer in any worktree regardless of who created it — it does not attempt to
  orchestrate the tool that created the worktree. Item 11's cold-start primitive is the integration
  surface, intentionally tool-agnostic.

---

## Design Decisions

### Mechanism vs conventions split

Originally the Work-Unit Mobility plan bundled mechanism (worktrees, shift) with conventions (focus
roles, blessed pairings, async-merge audit). Splitting them lets mechanism ship earlier — adopters get
practical worktree fluency without waiting for the conventions design to settle. Conventions follow
once mechanism is in flight and patterns are observable.

### Pause-pointer reconciliation: option 2 chosen

Three options had been on the table (formalize / deprecate / keep alongside). The agile/mobility
design discussion determined that **incidental as a category is a solo-dev artifact** — its function
("unplanned, interrupts another WU") is shift-lifecycle territory. Migrating manage-incidental-work
to use shift state retires the pointer fields cleanly. The category retirement itself is
`plan-agile-wu-lifecycle.md` scope; the field retirement (workflow-mechanics) lands here.

### `/arc-status` bundled with shift

`/arc-status` has a mode-universal core and a Full-only "In flight" block tightly coupled to shift
vocabulary. Splitting forces two PRDs for one skill. Bundle delays Lite users getting the core
slightly, but keeps the skill coherent.

### Sibling, not downstream, of User Sync UX Polish

Originally Mobility was sequenced after User Sync UX Polish ("clean sync state machine before
worktree axis joins it"). The split allows Worktree Foundation to ship in parallel — the sync UX
work is ergonomic, not correctness-critical for worktree mechanics. SESSION-NOTES per-worktree
handling is the main interaction surface; if Worktree Foundation lands first, User Sync UX Polish
incorporates worktree-aware semantics; if User Sync UX Polish lands first, Worktree Foundation
retrofits cleanly. Either order works.

### Worktree-by-default at quick/standard tier — conscious departure from sequential-by-default norm

External research (2026-04-28) confirms that mature git practice treats worktrees as opt-in
when concurrent work is genuinely needed, not as the default isolation mechanism. ARC's choice to
default to worktree-on-spawn for quick/standard tier (atomic stays in current worktree) is a
conscious departure motivated by:

- **Frictionless parallelism later.** Worktree-by-default means switching to parallel work doesn't
  require migrating from a single-worktree setup. The cost paid upfront is small; the cost avoided
  later is real.
- **Main worktree stays clean.** Reserving the main worktree for admin operations (per scope item 8)
  requires WU work to live elsewhere — worktrees are the natural answer.
- **Tier calibration mitigates the cost.** Atomic-tier work (the high-volume case for "I just want
  to fix this quickly") stays in the current worktree, so the worktree-by-default isn't actually
  default for trivial work.

Risks worth conscious management (per research):

- **Worktree accumulation.** Cleanup must be guaranteed and visible. `/arc-shift --worktree`
  invocation, integration-time cleanup advisories, and (eventually) automated stale-worktree
  detection at session-init are the mitigations.
- **"Which worktree am I in" confusion.** CLI/IDE surfacing must keep active worktree prominent —
  session-init orientation already includes worktree context per scope item 4.
- **IDE/LSP coordination across worktrees.** Largely outside our control; document the constraint
  (one worktree per IDE window).

### Roster vs context: dual-axis recovery model

Session-init implicitly answers two questions, not one — and they have different authoritative sources:

- **Roster** — *"Which WUs are mine in flight right now?"* Authoritative source: identity-filtered active status
  files (via the `**Branch:**` field, with `(@identity)` ownership filtering in team mode). Multi-valued in the
  multi-WU / multi-worktree world; collapses to a single entry pre-worktree.
- **Context** — *"What was I doing in WU X last session?"* Authoritative source: SESSION-NOTES, resolved
  per-worktree via that worktree's HEAD ancestry (notes are commit-anchored).

Notes are deliberately absent from the branch-gone resolution cascade (scope item 4) because notes answer the
context question, not the roster question. Reaching across all branches' notes refs to find a dev's recent
activity is a much heavier scan than reading status files filtered by identity. Keeping the two axes separate
clarifies why the cascade is shaped the way it is.

Consequence for [session-init.md][session-init] Step 7's trust hierarchy: the existing single hierarchy
(git > task list > status > notes) conflates the two axes — git is authoritative for *truth of work state* (was
task 3.3 actually committed?) but the hierarchy says nothing about *which work am I picking up*, where status
files + identity ownership are authoritative. PRD work splits Step 7 into two axes (scope item 4 sub-bullet).

### Two entry points and the discipline-layer model

ARC supports two entry points for starting work in a worktree, both universally available without a
config flag to select between them:

- **`arc start` / spawn (items 3, 4)** creates the worktree and scaffolds the WU from an existing
  session. The originating session does the spawn; a fresh session in the new worktree picks up via
  the cold-start primitive.
- **Cold-start bootstrap primitive (item 11)** scaffolds a WU inside an existing worktree — whether
  ARC-spawned, manually `git worktree add`-ed, or spawned by an external worktree-management tool.

Adopters pick per WU based on which fits the WU's origin. The two paths converge once the worktree
exists with a scaffolded meta-* file; the agent's bootstrap is uniform downstream of that point. No
mode-conditional behavior, no `worktree.management` config axis — adopters who exclusively use an
external tool simply never invoke `arc start`; adopters who never use one always do.

**Layering — what each layer owns.** This shape sits on top of two layers ARC does not own:

- **Tool layer** (when present): owns worktree creation — which branch, what location, what naming.
  ARC defers; items 2 and 11 work against whatever worktree the tool produced. Composability is
  one-way: the tool doesn't know about ARC; ARC works in any worktree the tool hands it. ARC does
  not orchestrate the tool (per Out of scope: plug-in hooks).
- **Harness layer** (Claude Code, Codex, Cursor, etc.): owns skill discovery within the worktree.
  Skills are harness-scoped, not tool-scoped — the harness reads `.claude/skills/` (or the harness
  equivalent) from the working tree, regardless of who created that working tree. This makes ARC's
  skills available in any worktree without harness-level configuration.
- **ARC layer**: owns the discipline above both — meta-* file lifecycle, state machine, planning
  artifacts, interlocks, sweep-as-you-go integration. Structural and non-negotiable; works the same
  in every worktree.

**Structural vs. advisory.** A useful split for what ARC enforces vs. recommends:

- **Structural** (uniform regardless of worktree origin): single-branch-per-WU, location-by-state,
  per-worktree isolation, state machine, capture pipeline, integration ceremony.
- **Advisory** (configurable defaults, soft-warned when violated): branch-naming convention
  (item 10), worktree location template (item 10). When ARC creates worktrees, conventions apply
  automatically; when external tools create worktrees, ARC warns on mismatch but does not refuse
  or relocate.

Adopters composing ARC with an external worktree-management tool get the full structural discipline;
the advisory conventions become recommendations the adopter applies via their tool's UX (most
surveyed tools accept user-provided branch names per § External Research Citations).

---

## Dependencies and Sequencing

### Upstream

- **Session-Init Optimization** (shipped): clean session-init substrate to extend.
- **Session-Operational Flow** (`plan-session-operational-flow.md`): consumes the parallel-session
  concurrency model framing (Phase 1) for spawn-vs-continue semantics; consumes the metadata-state
  foundation (Phase 7) indirectly via `plan-agile-wu-lifecycle.md` for tier-aware archive ceremony
  forward-references. Surface-conflict avoidance on session-init workflow edits also applies.
- **Work Organization Reform:** delivers the per-worktree isolation foundation
  (single-branch-per-WU lifecycle, sweep-as-you-go integration, status-file location-by-state
  convention, cross-worktree roster cascade). This WU's worktree-mechanism work assumes the
  isolation foundation; without WOR, worktrees inherit stale Planning-state status files from main
  and isolation breaks structurally. Hard upstream dependency.

### Sibling (parallelizable)

- **User Sync UX Polish** (`prd-user-sync-ux.md`): SESSION-NOTES per-worktree handling interacts with sync
  semantics; either order works.
- **Coord Probe** (`plan-coord-probe.md`): Worktree Foundation's branch-gone fire point invokes the probe;
  coord-probe is consumed downstream from this WU's session-init integration.

### Downstream

- **Agile WU Lifecycle** (`plan-agile-wu-lifecycle.md`): consumes clean activate/integrate workflows post-pointer-field
  retirement; the tier model's `arc start` command operates on the worktree-aware activation
  substrate.
- **Concurrent Work Conventions** (`plan-concurrent-work-conventions.md`): consumes mechanism layer entirely.
- **ARC Operating Modes:** consumes extracted shift lifecycle as prerequisite, no longer bundled.

### Recommended sequencing

Session-Operational Flow → Interlock Release Wrappers (WU1 + WU2) → Work Organization Reform
→ **Worktree Foundation** ‖ Coord Probe → Agile WU Lifecycle → Concurrent Work Conventions.

---

## Pressure Points and Risks

### SESSION-NOTES divergence per worktree (resolved upstream by WOR R65)

The earlier framing of this as an open PRD question is resolved upstream by Work Organization Reform's
user/ directory structural reform (R65). SESSION-NOTES lives at
`user/{identity}/<wu-name>/SESSION-NOTES.md` — explicit WU-scoping at the path level. Concurrent
worktrees have non-colliding paths; the WU-subdir-aware load logic (scope item 6) skips older notes'
subdirs that don't match the current WU. The cross-WU persistent-context tension (a cross-WU section
embedded in a per-WU file) is resolved by extracting it to a separate
`user/{identity}/WORKING-MEMORY.md` in the cross-WU class.

This WU's responsibility: implement the mechanism (scope item 6). The structural reform — file
relocations, strategy + workflow updates, in-flight migration — ships in WOR; mechanism layers on top
of resolved structure.

### Inbox sync semantics

Cross-WU file merge in `arc user load` introduces per-file sync behavior (WU-scoped vs cross-WU).
Requires either a convention for declaring which files are which, or a hardcoded allowlist. Small
design decision but real — affects future files in the `user/{identity}/` directory.

### Local-mode framing in extracted shift content

Workflow Shape L4174-4179 in arc-modes has a Local-mode-specific paragraph (".arc/ is untracked in
Local mode, git stash doesn't reach it"). If this WU extracts before Local mode lands, the paragraph
needs reframing — generalize to "when tracked state lives outside git," forward-reference Local mode,
or defer to Local mode's content sweep. PRD decision.

### Pause-pointer migration complexity

Retiring four status-file fields and migrating `manage-incidental-work.md` is mechanically broad.
template-status, strategy-work-organization, clean-work-unit's KEEP/REMOVE rules, and at least 2-3
other workflows touch the fields directly. Migration sweep needs care — risks orphaned references
that lint/CI doesn't catch.

### Cleanup ownership for externally-spawned worktrees

When ARC spawns a worktree (item 3), `integrate-work-unit.md` surfaces an advisory cleanup step
(worktree removal recommendation post-merge). When an external worktree-management tool spawns the
worktree, cleanup is the tool's responsibility — most tools surveyed handle it (Worktrunk's
`wt remove` with safety gates; emdash's stale-detection auto-cleanup at session start; Conductor's
archive pattern), but some defer to the user entirely.

PRD owes: `integrate-work-unit.md` cleanup advisory phrasing that doesn't assume worktree origin.
Detection options (PRD-time decision): cross-check `git worktree list` against ARC-spawn markers
(an opt-in marker file ARC writes at spawn) to recognize ARC-owned vs. externally-owned worktrees;
absent reliable detection, the advisory becomes generic ("worktree cleanup recommended post-merge —
check your tool's UX for handling, or `git worktree remove <path>` if managing manually").

### Discoverability of the cold-start primitive

Item 11's cold-start primitive is the entry point for tool-spawned worktrees, but adopters need to
know to invoke it. Two surfaces with different audiences:

- **User-side** — strategy docs + docs site cover "in any worktree, invoke the cold-start primitive
  to start your ARC session." Covers adopters new to ARC and adopters new to a project. Not an
  ARC-mechanism concern; documentation handles it.
- **Agent-side** — once the user invokes `/arc-resume` (or equivalent), the agent needs to know
  the cold-start branch is an option when no active WU is found in the worktree. Lives within ARC's
  own session-init reads (`AGENT-BRIEF.ARC.md`, `arc-resume` skill content). ARC concerns stay
  within ARC's namespace.

No `arc update`-injected modifications to harness files (CLAUDE.md / AGENTS.md). The skill-discovery
surface (harness reading `.claude/skills/` etc.) provides the underlying primitive availability;
ARC's session-init reads explain when to use it.

---

## Open Questions

### Worktree lifecycle ceremony

Who owns worktree creation and removal?

- Creation: `/arc-shift --worktree` invokes `git worktree add`. Manual worktrees also fine.
- Removal after merge: integrate-work-unit gets an advisory step? CLI helper? Pure developer
  responsibility?
- Stale worktrees (branch merged, worktree still exists): how does session-init handle this?
- Batched archive composition (full protection): when WU-A's archive batches with WU-C's planning
  branch, WU-A's worktree can be removed immediately post-merge (archive happens in the main
  worktree, not WU-A's) — but the advisory should make this sequencing explicit so adopters don't
  wait on the batched archive before cleaning up.

### Worktree detection depth

Minimum: session-init + `/arc-status` surface worktree context in orientation. Maximum: arc-config
awareness, CLI worktree subcommand, strategy-doc diagrams, worktree-aware commit hooks. Where's the
right floor for "worktree-aware" vs "worktree-integrated"?

---

## Scope Estimate

**Medium-Large.** Extraction phase is mechanical but broad (~700-900 lines moved across multiple
files). Worktree-aware shift and inbox sync fix are real implementation work. Pause-pointer migration
ripples across template-status, strategy-work-organization, clean-work-unit, and several workflows.

Phases (provisional):

1. **Extraction phase** — move shift content from arc-modes, update modes plan cross-references,
   generalize mode-specific language in extracted sections.
2. **Worktree-awareness phase** — `/arc-shift` worktree mode, session-init worktree detection +
   branch-gone, `/arc-status` worktree context, `integrate-work-unit.md` cleanup advisory.
3. **Spawn-vs-continue phase** — spawn operation (creates worktree + scaffolds + reports path),
   tier-aware spawn applicability (atomic skips), naming resolution, output ergonomics, auto-mode
   boundary documentation.
4. **Main-on-main pattern documentation** — strategy doc + workflow guidance for the no-separate-
   admin-worktree convention. Lightweight; mostly prose.
5. **Pause-pointer migration phase** — retire four pointer fields, migrate
   `manage-incidental-work.md`, sweep cross-references, update template-status and
   strategy-work-organization.
6. **Inbox sync phase** — `arc user load` cross-WU file merge, convention for declaring file sync
   mode.
7. **Documentation / tests / examples** — standard closing phase.

Each phase is a review checkpoint. Phases 1-2 relatively independent; phase 3 depends on phase 2;
phase 4 independent; phase 5 depends on phase 1's extraction; phase 6 independent.

---

## External Research Citations

Sources informing WF's design. Interim retention — PRD graduation trims to load-bearing references.

### Worktree-management tool landscape (2024-2026)

- `research-worktree-tool-convergence.md` — convergence pass across 11 agentic worktree-management
  tools surveyed 2026-05-12 (Cluster 1: Zed, Warp, Worktrunk; Cluster 2: Conductor, emdash, Maestro;
  Cluster 3: Super, Superset, T3code, Soloterm, Nora). Substantive findings shaping WF: only
  Worktrunk exposes extension hooks (§ 4.3), so ARC's cold-start primitive must work without per-tool
  integration; every tool invented its own spec-input mechanism (§ 3.7), so ARC's Origin ⊥ Spec
  orthogonality is the natural answer; tools converge on user-provided branch naming with no
  Conventional Branch enforcement (§ 4.1); tools diverge fully on worktree location with no field
  default to align with (§ 4.2); 8 of 9 dedicated tools use native git worktrees on local filesystem
  with no virtualization (§ 3.1, § 3.6), so ARC's reads work uniformly. Per-tool reports and source
  URLs captured in the research doc.

### Worktree-by-default vs sequential-by-default (existing reference)

The 2026-04-28 external research on mature git practice (cited in Design Decisions §
"Worktree-by-default at quick/standard tier") established the baseline ARC's default diverges from.
Specific URLs captured in the design-decisions section above.

---

## Activation Audit

When this WU activates, audit plan content against current framework state for drift. Known drift
items as of 2026-04-28:

- **Stale `template-status.md L24-30` reference**: original Mobility plan cited L24-30 for the four
  pointer fields. Task 4.2.f of Session-Init Optimization (commit `647fcc6`) relocated that content
  to `strategy-work-organization.md § Work Unit State § Optional Pointer Fields`; template-status is
  now 11 lines total. Activation audit refreshes the cross-reference; pause-pointer migration sweep
  here retires those fields entirely.

---

[team-coord]: ../../reference/strategies/arc/strategy-team-coordination.md
[strategy-work-org]: ../../reference/strategies/arc/strategy-work-organization.md
[template-status]: ../../reference/templates/template-status.md
[clean-work-unit]: ../../system/workflows/arc/supplemental/clean-work-unit.md
[session-init]: ../../system/workflows/arc/session-lifecycle/session-init.md
