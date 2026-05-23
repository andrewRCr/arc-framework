# Draft: Worktree Foundation

**Purpose:** Land the mechanism layer for parallel and mobile work — extract shift lifecycle as
mode-universal infrastructure, add worktree-aware shift, give session-init worktree context awareness
including branch-gone detection, and resolve cross-WU file sync semantics. Mechanism only; conventions
land in `draft-concurrent-work-conventions.md`.

- **State:** Draft — pre-spec exploration captured during agile/mobility expansion discussion 2026-04-28.
  Split from former Work-Unit Mobility WU; the conventions layer became Concurrent Work Conventions and
  the agile-lifecycle layer became Agile WU Lifecycle. Updated 2026-05-08 to consume per-worktree
  isolation foundation from new upstream Work Organization Reform WU — see § Dependencies.

- **Created:** 2026-04-28

- **Origin:** Originally Phases 1–2 of the Work-Unit Mobility plan. Split out during the
  agile/mobility design discussion to ship mechanism earlier and let downstream WUs (User Sync UX
  Polish, Coord Probe, Agile WU Lifecycle) consume worktree mechanics from a clean substrate. Resolves
  the long-standing concern that ROADMAP claims "parallelizable" downstream WUs without ARC actually
  having parallelism infrastructure — Worktree Foundation makes parallelism real.

  **2026-05-08 update:** Pre-spec sanity-check on the parallelism trio surfaced that per-worktree
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

A concrete instance surfaced 2026-04-29 during this plan's pre-spec evolution. Planning branch
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

The shift lifecycle (`draft-arc-modes.md` § Shift Lifecycle, ~478 lines) was designed as mode-universal
infrastructure that arc-modes calls into. Extracting it is the natural form of what the architecture
already anticipates (`draft-arc-modes.md` L4378-4387: *"This is why shift lives in its own
cross-cutting section rather than inside the Local mode treatment. It's universal."*).

---

## Scope

### In scope

1. **Shift lifecycle extraction from `draft-arc-modes.md`.** The full `## Shift Lifecycle` section
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
      Session-Operational Flow, sustained multi-WU work uses parallel
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

   **Naming TBD:** the spawn operation may be `/arc-spawn` or `/arc-shift --detach`. Resolves at
   WF spec. Under the 2026-05-20 resequence (WF ahead of AWL and Conductor), the previously-floated
   "extend `draft-agile-wu-lifecycle.md`'s proposed `arc start` command with an `--into-worktree` flag"
   option no longer fits this WU — AWL's `arc start`, when it lands, delegates to whatever spawn
   primitive WF settles here rather than the inverse.

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
      (post-fetch, within `coord.recency_days`) → coord-probe (per `draft-coord-probe.md`) → fall
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
   the skill design is unified — splitting forces two specs for one skill.

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
      strategy (after N notes / N days) — spec decision.
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
   the pointer fields. Updates ripple through [template-meta.md][template-meta],
   [strategy-work-organization.md][strategy-work-org] § Optional Pointer Fields, [clean-work-unit.md][
   clean-work-unit] L97-100 KEEP/REMOVE rules, and 2-3 other workflow touchpoints. Resolves the
   pre-spec blocker on the original Mobility plan.

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
   tier-aware archive ceremony from `draft-agile-wu-lifecycle.md` which inherits this convention.

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
   `draft-arc-modes.md` converted to cross-WU links. Applies before modes advances to spec.

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

11. **Cold-start bootstrap primitive (provisional name TBD at spec).** Second entry point
    alongside `arc start` / spawn, for bootstrapping a WU inside any existing worktree —
    ARC-spawned (the "continue" half of item 4), manually `git worktree add`-ed, or spawned
    by an external worktree-management tool (Conductor, emdash, Maestro, Zed, Warp, Worktrunk,
    Super, Superset, T3code, Soloterm, Nora — see External Research Citations):

    - Takes any spec input — file pointer, URL, issue link, existing ARC plan-doc, or just a
      name plus brief description — and scaffolds a meta-* file in the current worktree. Honors
      WOR's Origin ⊥ Design orthogonality: external references populate `**Origin:**`; ARC-owned
      artifacts populate `**Design:**`.

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

    - **Surface:** an `arc-resume`-style entry point. Concrete shape TBD at spec — branching
      within existing `arc-resume` skill logic (cold-start triggered when no active WU is
      found), a dedicated `arc-resume --bootstrap` flag, or a separate skill. Naming defers to
      spec.

    - **Discoverability** has two surfaces with different audiences (see Pressure Points §
      "Discoverability of the cold-start primitive"). User-side handled by strategy docs + docs
      site; agent-side handled within ARC's own session-init reads (`AGENT-BRIEF.ARC.md`,
      `arc-resume` skill content). No CLAUDE.md / AGENTS.md modification — ARC concerns stay
      within ARC's namespace.

### Out of scope

- **Focus-role model** (primary/companion/awaiting-external/parked) — landed by
  `draft-concurrent-work-conventions.md`.
- **Async-merge integration-surface audit** — landed by `draft-concurrent-work-conventions.md`.
- **`strategy-concurrent-work.md`** — landed by `draft-concurrent-work-conventions.md` (depends on
  mechanism + agile lifecycle landing first).
- **Tier model and `arc start` command** — landed by `draft-agile-wu-lifecycle.md`.
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
  `draft-concurrent-work-conventions.md`.
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
`draft-agile-wu-lifecycle.md` scope; the field retirement (workflow-mechanics) lands here.

### `/arc-status` bundled with shift

`/arc-status` has a mode-universal core and a Full-only "In flight" block tightly coupled to shift
vocabulary. Splitting forces two specs for one skill. Bundle delays Lite users getting the core
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
files + identity ownership are authoritative. Spec work splits Step 7 into two axes (scope item 4 sub-bullet).

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
- **Session-Operational Flow** (shipped): consumes the parallel-session
  concurrency model framing (Phase 1) for spawn-vs-continue semantics; consumes the metadata-state
  foundation (Phase 7) indirectly via `draft-agile-wu-lifecycle.md` for tier-aware archive ceremony
  forward-references. Surface-conflict avoidance on session-init workflow edits also applies.
- **Work Organization Reform** (shipped): delivers the per-worktree isolation foundation
  (single-branch-per-WU lifecycle, sweep-as-you-go integration, status-file location-by-state
  convention, cross-worktree roster cascade). This WU's worktree-mechanism work assumes the
  isolation foundation; without WOR, worktrees inherit stale Planning-state status files from main
  and isolation breaks structurally. Hard upstream dependency.

### Sibling (parallelizable)

[none active — User Sync UX Polish shipped before this WU activates]

### Downstream

- **arc-plan Conductor** (`draft-arc-plan-conductor.md`): canonical planning entry verb delegates to
  this WU's spawn primitive (consumer, not design-coupled). Sequencing inversion 2026-05-20:
  Conductor previously held the spawn invocation contract; spawn now ships here as a standalone
  callable primitive and Conductor wires its entry verb to it.
- **CLI Substrate Adoption** (`draft-cli-substrate-adoption.md`): this WU's hand-rolled
  `git worktree list --porcelain` parsers (3 sites), branch-gone cascade evidence discriminated
  union, cold-start spec input parser, and cross-WU note payload validation become migration
  targets for CSA's broader zod/execa sweep. Migration targets, not consumer-design-coupled.
- **Coord Probe** (`draft-coord-probe.md`): this WU's branch-gone cascade invokes coord-probe as one
  signal source. Loose coupling — cascade ships with hand-rolled fallback (status-file walk +
  remote-recency only), coord-probe wires in later when it lands.
- **Agile WU Lifecycle** (`draft-agile-wu-lifecycle.md`): consumes clean activate/integrate workflows
  post-pointer-field retirement; the tier model's `arc start` command operates on the worktree-aware
  activation substrate.
- **Concurrent Work Conventions** (`draft-concurrent-work-conventions.md`): consumes mechanism layer
  entirely.
- **ARC Operating Modes:** consumes extracted shift lifecycle as prerequisite, no longer bundled.

### Recommended sequencing

Session-Operational Flow → Interlock Release Wrappers (WU1 + WU2) → Work Organization Reform →
**Worktree Foundation** → (CLI Substrate Adoption ‖ arc-plan Conductor ‖ Coord Probe — pick
parallel pairs at activation time per file-scope disjoint and cognitive-load match) →
Agile WU Lifecycle → Concurrent Work Conventions.

---

## Pressure Points and Risks

### SESSION-NOTES divergence per worktree (resolved upstream by WOR R65)

The earlier framing of this as an open spec question is resolved upstream by Work Organization Reform's
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

### Orphan-warning signal-to-noise under routine retirement

Today's `runUserLoad` orphan path in `commands/user/save-load.ts` preserves any local file absent
from the incoming manifest to `.internal/<backup>.json` and emits a `Local file "X" not in saved
manifest` warning. Behavior is correct (never silently destroy local content); messaging treats
every orphan as equally unexpected. Under R65 + scope item 6's per-WU subdir load, routine WU
integration retirement on one machine surfaces as N orphan warnings on every other machine still
carrying the retired subdir from a prior sync. With concurrent worktrees (this WU introduces them)
this becomes the routine cross-machine case rather than the exception; today's flat-warning shape
creates alert fatigue. Surfaced concretely during WOR Task 6.3.a (per-user `ATOMIC-INBOX.md` →
`USER-INBOX.md` rename) — the same pattern at file scale.

Tiered improvements available (spec-time scope decision; the underlying preserve-to-`.internal/`
behavior is correct and stays unchanged across all tiers — only surfacing changes):

- **T1 — Content-equivalence rename detection.** When a local orphan's content matches a different
  name in the incoming manifest, surface as "Looks like rename X → Y" rather than generic
  "not in saved manifest." Single-file case; matches the 6.3.a pattern.
- **T2 — Subdir-grouped retirement messaging.** When orphans cluster under a path prefix absent
  from the manifest's directory structure entirely (the routine R65 case post-integration), one
  informational line plus cleanup hint (`rm -rf .arc/user/{id}/<wu>/`) replaces N warnings.
  Highest signal-to-noise win for WF-driven cases.
- **T3 — Sync-state-aware drift detection.** Extend `.internal/.sync-state.json` with the prior
  file-list so the warning can distinguish "intentional retirement at source" (file was in the last
  sync's manifest, now absent) from "real local drift, possibly unsaved work" (file appeared after
  last sync). Only the latter warrants alarm; the former is informational at most.

Composes with scope item 6's path-driven class dispatch — class awareness ("per-WU subdir retired"
vs "cross-WU file changed") informs which tier applies and what cleanup hint to suggest.

**Cross-ref:** `draft-cross-machine-sync-coherence.md` covers partial-push invisibility (sibling
clones can't see that an originating machine had a partial push). That plan predates WOR R65 and
this WU; likely stale and needs a worktree-aware refresh at this WU's spec iteration — its proposed
remote-marker mechanism interacts with the per-WU subdir sync class scope item 6 establishes and
could share or extend the `.internal/.sync-state.json` schema T3 contemplates. Concurrent
worktrees also change the partial-push surface area (multiple worktrees may push the notes ref).
Examine the two plans together before either advances to spec.

### Local-mode framing in extracted shift content

Workflow Shape L4174-4179 in arc-modes has a Local-mode-specific paragraph (".arc/ is untracked in
Local mode, git stash doesn't reach it"). If this WU extracts before Local mode lands, the paragraph
needs reframing — generalize to "when tracked state lives outside git," forward-reference Local mode,
or defer to Local mode's content sweep. Spec decision.

### Pause-pointer migration complexity

Retiring four status-file fields and migrating `manage-incidental-work.md` is mechanically broad.
template-meta, strategy-work-organization, clean-work-unit's KEEP/REMOVE rules, and at least 2-3
other workflows touch the fields directly. Migration sweep needs care — risks orphaned references
that lint/CI doesn't catch.

### Cleanup ownership for externally-spawned worktrees

When ARC spawns a worktree (item 3), `integrate-work-unit.md` surfaces an advisory cleanup step
(worktree removal recommendation post-merge). When an external worktree-management tool spawns the
worktree, cleanup is the tool's responsibility — most tools surveyed handle it (Worktrunk's
`wt remove` with safety gates; emdash's stale-detection auto-cleanup at session start; Conductor's
archive pattern), but some defer to the user entirely.

Spec owes: `integrate-work-unit.md` cleanup advisory phrasing that doesn't assume worktree origin.
Detection options (spec-time decision): cross-check `git worktree list` against ARC-spawn markers
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
- Removal on deactivation: deactivate-work-unit needs a worktree-cleanup addendum. Case A-delete
  (abandon entirely) implies worktree removal alongside branch deletion (`git worktree remove`
  before `git branch -D`). Case A (return to Planning) opens a design question: rename the
  worktree to match the renamed branch, remove and respawn at `plan/<name>`, or leave the
  worktree path decoupled from the branch name? Depends on whether worktree paths track branch
  names by convention or operate independently. Resolve at spec.

### Worktree detection depth

Minimum: session-init + `/arc-status` surface worktree context in orientation. Maximum: arc-config
awareness, CLI worktree subcommand, strategy-doc diagrams, worktree-aware commit hooks. Where's the
right floor for "worktree-aware" vs "worktree-integrated"?

---

## Scope Estimate

**Medium-Large.** Extraction phase is mechanical but broad (~700-900 lines moved across multiple
files). Worktree-aware shift and inbox sync fix are real implementation work. Pause-pointer migration
ripples across template-meta, strategy-work-organization, clean-work-unit, and several workflows.

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
   `manage-incidental-work.md`, sweep cross-references, update template-meta and
   strategy-work-organization.
6. **Inbox sync phase** — `arc user load` cross-WU file merge, convention for declaring file sync
   mode.
7. **Documentation / tests / examples** — standard closing phase.

Each phase is a review checkpoint. Phases 1-2 relatively independent; phase 3 depends on phase 2;
phase 4 independent; phase 5 depends on phase 1's extraction; phase 6 independent.

---

## External Research Citations

Sources informing WF's design. Interim retention — spec graduation trims to load-bearing references.

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

## Extracted Shift Lifecycle Design

*Verbatim extraction from `draft-arc-modes.md` (Phase 1 of the shift-lifecycle move). Not yet
reconciled against current ARC — Phase 2 resolves pre-WOR vocabulary (`WORK-STATUS.md`,
task-list-header state / "Pure Option C"), the "session-init stays unchanged" stance that
contradicts scope item 4, the `/arc-status` naming collision formerly chained to the now-provisional
ARCd Rebrand, dangling references to arc-modes audit findings, and integration with this draft's own
Scope and Design Decisions.*

## Shift Lifecycle

**Cross-cutting deliverable — applies to all ARC modes.**

### The Gap This Fills

Work units don't always move from activation through completion without interruption. Real team
workflows regularly park a WU mid-stream while waiting on code review, stakeholder feedback, blocking
work from another team, or an external dependency. Meanwhile the developer is often ready to start the
next thing.

Full ARC today has no formal model for this state. The implicit workaround — leaving the WU "active"
on its branch while starting a new feature branch for the next WU — works mechanically in tracked mode
(git swaps files per branch) but creates a stale-state problem: WORK-STATUS on branch A says "finish
integration, Next Action X" when you've actually moved on. Session-init reports misleading state.
Nothing formally captures why the WU is paused or when it's expected to resume.

This gap is largely invisible in solo-sequential workflows (complete one WU, archive, start next) but
is everyday reality in team contexts and multi-stream work. Local mode surfaces it hard — without the
branch-swap implicit mechanism to hide the problem, Local Full can't support "waiting on review"
at all without a formal pause.

### Design Philosophy

**Metadata-in-place, not file relocation.** A paused WU stays where it is. Its files don't move.
WORK-STATUS tracks the state change, the WU's own status header reflects the new state, and session-init
reads both. Rolling back a pause is a metadata flip, not a filesystem operation.

**One user-facing skill, unified workflow.** The skill is `arc-shift`, the workflow is
`shift-work-unit.md`. "Shift" reads naturally for all three transitions:

- "Let's shift away from this while we wait on review" — pure pause
- "Let's shift to feature-Y" — rotate (pause current, resume target)
- "Let's shift back to feature-X" — resume (when no in-progress WU, or suspend current first)

The workflow reads current WORK-STATUS state and the target argument (if any), determines which
transition this is, and executes accordingly.

**Works identically in Full and Local, with only the persist step differing.** The metadata updates,
document status headers, and WORK-STATUS changes are mode-agnostic. The final "persist" step commits
in tracked Full and syncs the backing store in Local. Developers reading the workflow see one
description, not two.

### State Model

A work unit in the pipeline can be in one of these states:

| State         | Location   | Meaning                             |
|---------------|------------|-------------------------------------|
| `planned`     | `backlog/` | Scoped but not yet activated        |
| `in-progress` | `active/`  | Currently being worked on           |
| `paused`      | `active/`  | In flight but temporarily set aside |
| `archived`    | archive    | Completed (or abandoned), terminal  |

The critical observation: `active/` holds both `in-progress` and `paused` WUs. Directory membership
means "in flight, between backlog and archive." Per-WU state is metadata, not location.

### State Lives in Task List Headers (Pure Option C)

**Decided 2026-04-09** after walking the audit's scenario battery against Options B and C
(Option A was previously ruled out by the contributor-lifecycle stress test —
see `analysis-modes-contributor-lifecycle-stress-test.md` § S5). The walk
established that task list headers as the sole source of truth — with no registry file and no
per-dev cache — is the cleanest shape under the reframe described below. The full walk and
failure-mode analysis is preserved in the follow-up session's record; this section captures the
resolved shape.

**Key reframe that shaped the decision:** session-init does not need to know about inactive or
paused WUs. Multi-WU awareness is an on-demand concern, not a session-init concern — the
developer already knows what they paused, and if they need a reminder they can ask. Baking
multi-WU reporting into every session-init orientation is noise for both human and agent. This
reframe collapsed a complex registry-vs-cache-vs-file-vs-skill design space into something much
simpler.

**The shape:**

Each WU's status file carries its own state in the `**State:**` field. A paused WU's status
file has, for example:

```markdown
**State:** Paused (2026-04-09) — awaiting code review from Alice
```

Or for external-blocking states (see [Finding B resolution](#finding-b-paused-vs-waiting-for-vocabulary-split) below):

```markdown
**State:** Waiting-For Review (2026-04-09) — Alice, PR #42
```

Valid `State:` values: `In Progress` / `Paused` / `Waiting-For {category}` / `Complete`. Inline
date in parentheses is the pause timestamp (ceremony-free, auto-observed per Clarification #4 in
the audit). Freeform reason follows the dash.

**Branch-local WU pointer is per-WU, single-slot.** No In Flight registry, no Active Focus
section. Under the Work-Status Restructure WU (see
[§ Alignment with Work-Status Restructure WU](#alignment-with-work-status-restructure-wu) below),
the pointer is the per-WU `status-{name}.md` file in `active/{category}/` — one status file per
WU, with a flat field set (State / Branch / Task List / Next Task / Last Completed / Blockers /
Next Action). The file is single-slot by construction (one WU, one file); it is not a multi-WU
registry. Pre-restructure, this role was served by a singular `active/WORK-STATUS.md`; the per-WU
file preserves Clarification #2's semantic distinction (branch-local WU pointer) while
eliminating the parallel-WU concurrency flaw.

**No index file.** No `user/{identity}/IN-FLIGHT.md`, no per-dev cache, no registry file in any
form. The walk's honest-failure-mode analysis demonstrated that any cache introduces drift risk
that erodes the "trust the system" value prop, and that the self-healing discipline needed to
keep a cache trustworthy exceeds the UX benefit it provides. Task list headers are the only
state.

**Mid-session multi-WU awareness is on-demand via `/arc-status` skill.** See
[Mid-Session Orientation](#mid-session-orientation) below. The skill reads headers and composes
a current-state view only when invoked. This keeps multi-WU reporting out of session-init
orientation entirely, aligned with the reframe above.

**How this resolves the scenario battery's findings:**

- **Scenario 1 (solo tracked Full, 2 WUs on 2 branches):** Current-branch scan sees only the
  current branch's task lists. That is the expected behavior under the reframe — the developer
  knows about the other branch, and if they need an explicit reminder they invoke `/arc-status`
  (which can offer an on-demand cross-branch git query as an opt-in for the rare case).
- **Scenario 2 (solo Local Full, 2 WUs):** `.arc/` is shared across branches in Local mode, so
  any scan naturally finds all in-flight task lists. Clean.
- **Scenario 3 (team merges to main):** Tracked task lists travel with their branches. After
  merges, main's `active/` naturally carries the aggregate view. Clean.
- **Scenario 4 (person-to-person handoff):** The paused task list is in tracked `active/` and
  moves with the branch on pull. Personal context still moves via SESSION-NOTES git notes as
  today. No additional state to coordinate.
- **Scenario 5 (activate new while one is paused):** `activate-work-unit` writes the new WU's
  status file with `State: In Progress`. The paused WU's status file is untouched. No
  cross-workflow coordination.
- **Scenario 7 (rotate between two paused WUs):** Shift updates two status file `**State:**`
  fields (the pausing WU's flips to `Paused (date) — reason`; the resuming WU's flips to
  `In Progress`). Atomicity is local to two file writes; under the restructure there is no
  separate per-branch registry pointer to update.
- **Scenario 8 (resume after long pause):** Pause timestamp lives inline in the `State:` field.
  Shift reads the field on resume and surfaces a staleness warning if the interval exceeds one
  week (fixed, not configurable — see Resolved Decisions → "Staleness
  threshold").
- **Scenario 9 (waiting-for-review distinction):** Encoded as a specific `State:` value. See
  Finding B resolution.

**What this decision removes from scope (vs. the earlier "In Flight registry" sketch):**

- Registry file design (none needed)
- Per-dev cache file and its rebuild/self-healing logic (none needed)
- Multi-WU registry template (none needed — the per-WU status file is single-slot by
  construction)
- Session-init integration work for multi-WU reporting (unchanged — session-init stays lean)
- Cross-file atomicity discipline between registry and per-WU state (single source of truth
  means no sync concern)

The cascade of simplification from the reframe is intentional and the primary value of walking
the scenario battery carefully — the design gets smaller, not bigger.

### Document Status Headers

PRDs and task lists carry status headers today (e.g., `Status: In Progress`). Shift lifecycle
extends the vocabulary with two new values — `Paused` and `Waiting-For` — and adds an inline
date and freeform reason format. Per the
[State Lives in Task List Headers](#state-lives-in-task-list-headers-pure-option-c) resolution,
these headers are the sole source of truth for WU state; there is no cache or registry to keep
in sync.

**Field format:**

```markdown
**State:** In Progress
**State:** Paused (2026-04-09) — blocked on session token decision
**State:** Waiting-For Review (2026-04-09) — Alice, PR #42
**State:** Waiting-For Approval (2026-04-09) — ARB signoff expected Thursday
**State:** Complete
```

PRDs retain `**Status:**` headers and follow the same value format on shift transitions.

**Valid Status values:**

- `In Progress` — active work. Default state for an activated WU.
- `Paused` — developer is the next mover; they set it aside and will return to do more work.
  Counts against the growth nudge (WIP pressure).
- `Waiting-For {category}` — external actor is the next mover; the developer cannot unblock it
  from their side. Does **not** count against the growth nudge — waiting on three PRs is a
  normal pipeline, not WIP pressure.
- `Complete` — terminal state, prelude to archival.

**`Waiting-For` categories** (committed pre-PRD — these five are the final set):

- `Review` — awaiting code review
- `Approval` — awaiting stakeholder / ARB / compliance signoff
- `Delivery` — awaiting downstream deployment or external artifact
- `Decision` — awaiting a decision from someone else (not a self-decision — that's `Paused`)
- `Other` — freeform, with the reason string carrying the detail

The five are locked because each implies a distinct follow-up action (reviewer vs.
decision-maker vs. external party vs. architect vs. freeform), which is what the category is
for. Freeform `Other` + the reason string handle anything the five don't cover directly.

#### Finding B: Paused vs Waiting-For vocabulary split

The `Paused` / `Waiting-For` distinction came from the solo-dev audit's Finding B and is backed
by Kanban literature, GTD's "Waiting For" list, and empirical research on PR review latency
(see `analysis-modes-solo-dev-blind-spot-audit.md` § B for evidence). The
distinction matters because:

- **Orientation reporting can triage differently.** "Waiting for review (3d)" suggests nudging
  the reviewer; "paused on incidental (2d)" is self-state with no external action available.
- **WIP nudges should only apply to developer-paused WUs.** Three items in `Waiting-For Review`
  is a normal PR pipeline; three developer-paused WUs is WIP pressure.
- **Pause reason taxonomy becomes simpler** — the state itself carries the "what kind of
  waiting" category, so the freeform reason only needs to carry the detail (who/what/when).

**Cost:** Trivial. One extra Status enum value plus a category modifier for `Waiting-For`. No
mechanism change beyond the existing Status header. Documentation sweep in
`strategy-task-list-formatting.md` to catalog the valid values.

**Scope:**

- **PRD `**Status:**` header** — updated on shift transitions (value + date + reason)
- **Status file `**State:**` field** — updated on shift transitions (same format)
- **Supplementary docs** (`atomic-*.md`, `notes-*.md`) — deferred to implementation. Gut-level:
  skip them, they're supplementary and the churn isn't worth it. Revisit if implementation
  surfaces a reason.

### Workflow Shape

`shift-work-unit.md` encodes the three transitions via state-driven branching.

**Inputs:** Current WORK-STATUS state, optional target WU name, optional reason string.

**Transition detection:**

- Active Focus exists, no target → **pure pause** (pause current)
- Active Focus exists, target is in In Flight as paused → **rotate** (pause current, resume target)
- Active Focus exists, target is new or in backlog → **shift-with-activation** (pause current, hand off
  to activate-work-unit workflow for the target)
- No Active Focus, target exists as paused → **pure resume** (resume target)
- No Active Focus, no target → invalid, report and exit

**Uncommitted work handling:**

Before any pause, the workflow detects uncommitted changes in the working tree. When found, it surfaces
the state to the user with a recommended default of **commit first** (clean pause is the reliable
default), but allows override:

1. **Commit first (recommended)** — workflow prompts for commit message or invokes arc-commit
2. **Stash** — `git stash push` with a descriptive message tied to the WU
3. **Leave as-is** — pause proceeds, dirty state remains in working tree, noted in WORK-STATUS entry

The workflow presents commit as the default; the user is in charge of the final choice. This preserves
reliability bias without being dogmatic.

**Local-mode scope.** The three options apply to tracked project-repo files; `.arc/` content is
untracked in Local mode and outside `git stash`'s reach, so uncommitted `.arc/` edits structurally
follow **leave as-is** regardless of which option is chosen for tracked code. They remain in the
working tree and are captured by the next `arcd backing sync` at session handoff. A Local-mode user
pausing with both project-code changes and `.arc/` edits can commit or stash the former via the
normal options while the latter takes leave-as-is automatically.

**State-update steps (common to all transitions):**

1. Gather reason and context (ask if not supplied and transition needs one)
2. Optionally snapshot SESSION-NOTES to the WU's directory as preserved context
3. Update the affected WU(s) status file `**State:**` field — e.g., feature-x's State flips
   from `In Progress` to `Paused (YYYY-MM-DD) — reason`, and for rotations feature-y's State
   flips from `Paused` (with its own old timestamp) to `In Progress`
4. Update PRD Status header(s) to match (same format as task list)
5. Update `WORK-STATUS.md` to reflect the new current-branch WU (single-slot, branch-local)
6. Persist — commit in tracked Full (via arc-commit invocation or inline commit step), backing
   store sync in Local

Step 3 is the canonical state write. Everything else derives from it or is a surface for local
discoverability. There is no registry file or cache to keep in sync — task list headers are the
single source of truth per the
[State Lives in Task List Headers](#state-lives-in-task-list-headers-pure-option-c) decision.

**`shift-with-activation` coordination:**

When the transition is `shift-with-activation` (Active Focus exists, target is new or in
backlog), the workflow pauses the current WU, reports pause success, and then proceeds into
`activate-work-unit` for the target in the same invocation — **one user confirmation at the
top, one workflow walk across both steps**. Not a two-step conversation where the user must
re-invoke after the pause, and not a silent auto-handoff that hides the second step.

The pause half is the clean failure boundary: if the pause write succeeds but activation fails
partway, the user is left in a clean paused-current state with a clear "activate {target}?"
resumption point, not in half-state where the current WU is paused *and* the target is
partially activated. This matches ARC's general "mandatory stops between operations" idiom
while avoiding the unnecessary friction of forcing the user to type two commands for what is
semantically one transition.

The protocol is specified in `shift-work-unit.md` at implementation time; the coordination
shape (one confirmation, sequential walk, pause is the failure boundary) is the load-bearing
decision and is locked in pre-PRD.

**Resume-side additions:**

On resume transitions, the workflow additionally:

1. Surfaces the preserved SESSION-NOTES snapshot (if any) as recovery context
2. Checks branch alignment in tracked Full, suggests the switch if needed
3. Reads the pause timestamp from the status file `**State:**` field and reports pause age (e.g.,
   "paused 2d ago", "paused 9d ago — assumptions may be stale"). If the pause exceeds **1 week**
   (fixed, not configurable), surfaces an advisory prompt to re-read the PRD and task list
   before proceeding. The prompt is dismissible — it nudges, it doesn't gate. 1 week fits
   common-case memory loss for detailed project context; configurability is explicitly
   rejected as premature flexibility (most users wouldn't touch it, and the wrong-default
   tolerance is high because the prompt is advisory). Revisit only if evidence shows the
   threshold is actively wrong in practice.

### Session-Init Integration

**Session-init stays unchanged from today.** Multi-WU awareness is an on-demand concern, not a
session-init concern. Per the reframe that drove the
[State Lives in Task List Headers](#state-lives-in-task-list-headers-pure-option-c) decision,
paused and waiting-for WU information is not load-bearing for every session orientation — the
developer already knows what they paused, and if they need a reminder they can invoke
`/arc-status` (see [Mid-Session Orientation](#mid-session-orientation)).

Session-init continues to read `WORK-STATUS.md` as the branch-local WU pointer and reports that
single WU's state (branch, current task, next action, blockers). It does not scan `active/` for
paused task list headers. It does not summarize cross-WU state. This keeps the orientation
summary focused on "what am I doing right now?" — which is all session-init needs to answer
for the common single-WU case, and all it *should* answer for the multi-WU case where extra
information would be noise.

The only session-init touchpoint the shift lifecycle adds is **drift detection** — if the
status file `**State:**` field reads `Paused` or `Waiting-For` while the PRD `**Status:**`
header still says `In Progress` (or vice versa), the orientation surfaces the mismatch ("PRD
says active, but the status file is paused — did you interrupt a shift without completing all
updates?"). This is a safety check, not a multi-WU report.

### Skill Shape

`/arc-shift` ships with the shift lifecycle, following the established thin-skill pattern
(skill file is a short pointer; the workflow carries the logic). The complementary `/arc-status`
skill lives in its own [Mid-Session Orientation](#mid-session-orientation) section — it is
mode-universal rather than Full-only, and the structural placement reflects that.

Backed by `shift-work-unit.md`. Handles the state transitions described in
[Workflow Shape](#workflow-shape) above.

User invocations that naturally route through `/arc-shift`:

- "Let's shift this aside while we wait on review"
- "Shift to feature-y"
- "Let's shift back to feature-x now that review landed"
- "Shift this and start the auth refactor incidental WU"

### Integration Interaction with Shift States

The shift lifecycle introduces `Paused` and `Waiting-For {category}` as valid mid-flight states for
an in-progress work unit. `integrate-work-unit.md` is the terminal transition point — it takes a
completed WU and prepares it for merge. Without explicit handling, the expanded state vocabulary
leaves an ambiguity: what should integrate do when invoked on a WU whose status file
`**State:**` field reads something other than `In Progress`?

#### Current workflow does not validate the State field

A reading of `integrate-work-unit.md` clarifies the pre-shift-lifecycle behavior. Step 1 ("Verify
Work Completion") is agent-enforced prose. Its validation checks are: all subtasks and parent
tasks marked `[x]`, Success Criteria all checked, quality gates passed.

The state line in Step 1 — `[ ] Status file **State:** updated to Complete` — is
phrased as an **imperative**, not a gate. It instructs the agent to ensure the State field reads
`Complete` before proceeding, and the transition itself is a silent side effect of Step 2's
`clean-work-unit.md` Mode 2 run (which sets `State: Complete` unconditionally during doc cleanup).
There is no validation today that refuses integration if the current State value is something
else — the workflow effectively assumes `In Progress` and rewrites the State field during prep.

This reframes Finding #13 from "add a validation layer" to **"surface the state transition
explicitly so it can accept the shift-lifecycle vocabulary."** The resolution is primarily a
widening of the entry contract, not a new mechanism.

#### Acceptance matrix

| Entry state            | Behavior                                                         |
|------------------------|------------------------------------------------------------------|
| `In Progress`          | Accept. Standard happy path.                                     |
| `Complete`             | Accept. Idempotent (e.g., re-running after a crash).             |
| `Waiting-For Review`   | Accept. Transition to `Complete`.                                |
| `Waiting-For Approval` | Accept. Transition to `Complete`.                                |
| `Waiting-For Delivery` | Accept. Transition to `Complete`.                                |
| `Waiting-For Decision` | Accept. Transition to `Complete`.                                |
| `Waiting-For Other`    | Accept. Transition to `Complete`.                                |
| `Paused`               | Warn, prompt for confirmation, proceed or abort per user choice. |

The transition to `Complete` continues to happen in `clean-work-unit.md` Mode 2 (no change to that
workflow). Step 1 of `integrate-work-unit.md` gains an explicit state-vocabulary read upstream of
the existing checks — reporting the current state, applying the acceptance matrix, and
short-circuiting with a prompt in the `Paused` case.

#### Invocation is the assertion

The semantic that makes the acceptance matrix work: **invoking integrate on a `Waiting-For` WU is
the user's assertion that the wait is over.** When the developer runs integrate on a WU in
`Waiting-For Review`, they are stating "the review landed." The workflow does not need to validate
what was waited for — the invocation itself carries the signal. This is why `Waiting-For Review`
→ integrate is the natural transition path rather than an error condition requiring
resume-then-integrate churn, which was the user-identified anti-pattern driving Finding #13.

The semantic holds symmetrically across the `Waiting-For` categories (including `Other`, where the
freeform reason carries whatever the user knew at pause time). The workflow's job is to transition
state and proceed with integration; judging whether the wait is actually over is the user's
responsibility, discharged by the invocation.

#### Paused is warn-and-confirm, not hard refuse

Per the [Finding B vocabulary split](#finding-b-paused-vs-waiting-for-vocabulary-split), `Paused`
specifically means "the developer is the next mover." A `Paused` WU at integrate time is
semantically suspicious — either the state is stale (the developer forgot to shift-resume after
finishing) or the work isn't actually done. Neither case is a hard "refuse and abort," but neither
is a silent "just integrate."

The resolution is an inline prompt along the lines of:

```text
This work unit is Paused (2026-04-09 — reason) — dev-next-mover state.
Proceed with integration anyway? [y/N]
```

Default is no. If the user confirms, the workflow proceeds through the standard path,
transitioning `Paused` → `Complete` via `clean-work-unit.md` Mode 2 like any other accepted state.
No `--force` flag; the prompt surfaces the decision inline where the user already is, matching
ARC's established warn-and-confirm idiom (see [Workflow Shape](#workflow-shape) above for the
parallel pattern in uncommitted-work handling at pause time).

#### Integrate owns the terminal transition

A related question raised during the pre-PRD audit: **does `integrate-work-unit` or `/arc-shift`
own the final `→ Complete` state transition?** The resolution: **integrate owns it.**

- `/arc-shift` owns *mid-flight* transitions: pause, resume, rotate. These are reversible and
  expose personal developer state changes while a WU is in flight.
- `integrate-work-unit` owns the terminal `→ Complete` transition. It is coupled to the merge
  operation and is not a "shift" — it is the close-out.

This is already implicitly true today (`clean-work-unit.md` Mode 2 performs the transition during
integrate's Step 2). The resolution does not move the transition; it preserves locality — the
workflow that finalizes the WU owns the final state write — while making the entry-state check
explicit upstream. `/arc-shift` never writes `State: Complete`.

#### Feedforward to implementation

The `integrate-work-unit.md` workflow needs a small, targeted edit during the modes WU
implementation phase: insert an explicit state-vocabulary read and acceptance-matrix check at the
top of Step 1, before the existing subtask/success-criteria validations. The existing Step 1
Status-header checkbox line becomes a natural landing for the matrix evaluation. No changes to
`clean-work-unit.md`. No changes to `/arc-shift`. The change is a small block of workflow prose
plus an updated checklist item in Step 1.

This is implementation-phase content; the task list will carry it as a concrete task when the PRD
generates it. No standalone ADR is expected — the decision is a behavioral extension of the
shift-lifecycle vocabulary already captured in the § Shift Lifecycle content above, and composes
with the shift-lifecycle ADR that Findings #8, #9, and #10 defer to PRD implementation.

### Why This Lives in Its Own Cross-Cutting Section

Shift was initially scoped as a Local-mode necessity — needed because Local Full's single-active
invariant would be too restrictive without it. But the gap it fills exists in tracked Full too, where
it's currently masked by implicit branch-switching. Making it explicit gives tracked Full something
it was missing: a formal model for "paused awaiting external progress" that the framework can reason
about, report on, and help manage.

This is why shift lives in its own cross-cutting section rather than inside the Local mode treatment.
It's universal.

### Out of Scope (For This Plan Doc Iteration)

- **Pause-reason taxonomy** — should reasons be freeform, or structured with categories (`awaiting-review`
  / `blocked-external` / `deferred` / `other`)? Freeform is simpler; structured enables better
  reporting. Revisit during detail design.
- **Cross-branch paused visibility in tracked Full** — is branch-local paused state sufficient, or
  should there be a way to see "all paused WUs across all branches" from one location? Lean
  branch-local for simplicity, revisit if team mode dogfooding says otherwise.
- **Expected-resume-date field** — useful context ("expected back Thursday") but potentially stale.
  Consider during detail design.

### Alignment with Work-Status Restructure WU

The Work-Status Restructure WU (see `prd-work-status-restructure.md` and
`notes-work-status-restructure.md`) changes the substrate this section
was originally designed against. Pre-restructure, state lived in task list `**Status:**`
headers (Pure Option C, 2026-04-09) because no per-WU `WORK-STATUS`-equivalent file
existed. Post-restructure, `**State:**` lives in a per-WU `status-{name}.md` file in
`active/{category}/`. The shift-lifecycle design survives the substrate change — only the
host field moves. The full re-validation record lives in
`notes-work-status-restructure.md` § Harmony with shift lifecycle;
this subsection captures the load-bearing points.

**Per-WU file harmonizes with metadata-in-place.** A paused WU's `status-{name}.md` stays
where it is; its files don't move; the `**State:**` field flips in place. Rolling back a
pause is still a metadata flip. Metadata-in-place is strengthened — status file and task
list live next to each other in `active/{category}/` and travel together under full
protection.

**Source-of-truth simplifies.** Pure Option C chose task list headers because no per-WU
status file existed. The restructure introduced `status-{name}.md` as the explicit per-WU
surface, so `**State:**` joins its existing field set (Branch / Task List / Next Task /
Last Completed / Blockers / Next Action) without new machinery. Task list `**Status:**`
header removal (R16) retires a redundant surface. Pure Option C's concerns remain fully
satisfied — the status file is per-WU and single-slot, not a cross-WU registry; no cache;
no session-init multi-WU noise; session-init still reads one file per WU.

**Ownership of terminal transition unchanged.** `integrate-work-unit.md` via
`clean-work-unit.md` Mode 2 still owns the `→ Complete` write — it now writes the status
file `**State:**` field instead of the task list `**Status:**` header. `/arc-shift` still
never writes `Complete`.

**Vocabulary unchanged.** The value set (`In Progress` / `Paused (date) — reason` /
`Waiting-For {category} (date) — reason` / `Complete`) is preserved verbatim. Only the
host field name changes (task list `**Status:**` → status file `**State:**`). Task 5.2 of
the restructure WU applied the mechanical swap throughout this section.

**Scenario battery re-validation.** The nine-scenario battery evaluated under
task-list-header-as-home carries forward under status-file-as-home — each scenario's
answer stays identical or simplifies:

- **Scenarios 1–4** (solo tracked, Local, team merge, person-to-person handoff): status
  files travel with branches just like task list headers did; same branch-local semantics
  and portability.
- **Scenario 5** (activate new while paused): new WU's status file is created with
  `State: In Progress`; paused WU's status file is untouched.
- **Scenario 7** (rotate): two status file `**State:**` writes, no separate per-branch
  pointer. *Simplifies* — three writes pre-restructure become two.
- **Scenario 8** (resume after long pause): pause timestamp reads natively from the
  `State:` field.
- **Scenario 9** (waiting-for distinction): encoded as a specific `State:` value.

No scenario breaks under the substrate change.

**Mid-Session Orientation scope caveat.** The `## Mid-Session Orientation` section below
(and the `/arc-status` skill described there) retains its original pre-restructure
WORK-STATUS references. The `/arc-status` skill will be re-designed in its own PRD at
activation time; those references describe skill design thinking at the time of writing.
Read them as "the WU's status file" under the restructure premise — the underlying logic
(on-demand multi-WU awareness via a skill, session-init stays lean) is unchanged.

---

## Mid-Session Orientation

Cross-cutting section for `/arc-status`, the mid-session "warm orient" skill. Mode-universal
(ships in both Lite and Full), complementary to the existing session-lifecycle skills
`/arc-resume` (cold orient at session start) and `/arc-handoff` (close session at end).

`/arc-status` is backed by `mid-session-status.md` (new workflow in `session-lifecycle/`). It
provides on-demand warm orientation — a concise snapshot of current work state composed from a
small targeted set of reads, distinct from the cold orientation session-init performs.

**Why this skill exists:** The most common use is a mid-session refresher when the developer
has stepped away, switched contexts, or wants a quick "where am I?" bookmark without restarting
the session — post-lunch, post-meeting, post-interruption. This is mode-universal; every ARC
project benefits from it. As a complementary use, the skill also hosts multi-WU visibility for
Full-mode projects running the [Shift Lifecycle](#shift-lifecycle) — surfacing paused and
`Waiting-For` WUs on demand. Multi-WU visibility was the original driver that justified creating
the skill, but is no longer its primary value proposition; it is scoped to Full specifically,
where the shift lifecycle applies at all.

**Slot in the session lifecycle:**

```text
/arc-resume    — cold orient at session start  (workflow: session-init.md)
/arc-status    — warm orient mid-session       (workflow: mid-session-status.md)
/arc-handoff   — close session at end          (workflow: session-handoff.md)
```

Three skills, three workflows, three lifecycle points. Symmetric and cleanly namespaced.

**Naming note:** The CLI-side rename that resolves the naming ambiguity happens across two WUs.
Session-Init Optimization renames the existing `arc status` CLI command (framework installation
health) to `arc health` (see `tasks-session-init-optimization.md` Task 3.R.k.a). The ARCd
Rebrand WU then sweeps `arc health` → `arcd health` as part of its global `arc` → `arcd` binary
rename. The skill is a slash-command invocation (`/arc-status`) and occupies a different
namespace from CLI binaries anyway, but the rename resolves the ambiguity at its root. See
`plan-arcd-rebrand.md` § Scope Sketch — Layer 2 (CLI command surface cleanup) for the reframed
rebrand-era scope.

**Output shape:**

The output has a mode-universal core and a Full-only supplemental block. Lite sessions
structurally never see the supplemental block; Full sessions see it only when paused or
`Waiting-For` state exists on the current branch.

```markdown
**Current focus** · `branch-name` · clean|dirty

- **Working on**: feature-x, Task 4.2 — Implement token validation
- **Since session start**: 3 tasks completed (Tasks 3.5, 4.0, 4.1), 2 commits landed
- **Uncommitted**: [files, if any] | none

**In flight** · [Full mode only; appears only when paused/Waiting-For state is present]

- **Paused**: incidental-auth-refactor (paused 2d ago — blocked on session token decision)
- **Waiting for**: feature-y (review from Alice, 1d ago)

**Next action**: Resume token validation in Task 4.2.b — schema check for malformed tokens

**Flags**: [blockers, quality gate state, stale assumptions, etc. — or omitted]
```

**Composition rules:**

- **Mode-conditional "In flight" block.** In Lite, the block is structurally absent — Lite has
  no concept of multi-WU state, so there is nothing to surface. In Full, the block appears only
  when paused or `Waiting-For` state is actually present on the current branch; single-WU Full
  sessions see the mode-universal core output without the supplemental block.
- **No blockers means no "Flags" block.** Only show what is load-bearing right now. The output
  is length-variable by design — a clean single-WU Lite session might be three lines; a multi-WU
  Full session with blockers might be ten. Either way, no noise.
- **Do not duplicate session-init.** If a line would repeat what `/arc-resume` already told
  the user, omit it. The skill's value is **what has changed or emerged since session-init** —
  completed tasks, new commits, shifts, drift, uncommitted mid-implementation state. If
  nothing has changed, say so tersely and suggest the next action without re-recapping.
- **Suggest, do not re-quote.** "Next action" in session-init comes from `WORK-STATUS.md`
  verbatim. "Next action" in `/arc-status` is composed from mid-session state — reflects what
  was just done, what is uncommitted, what the task list checkbox state implies next. Often
  the same as `WORK-STATUS.md`'s Next Action, often not.
- **Cheap enough to invoke freely.** Tens of milliseconds of reads, no heavy workflow
  machinery. Should feel lightweight enough that "let me just check" is reflexive.

**Input sources** (all targeted, none expensive):

Mode-universal:

1. `git status` + `git log HEAD@{session-start}..HEAD` — working-tree state, commits since
   session start
2. `WORK-STATUS.md` — current WU pointer (with drift detection against the task list header
   per the [Session-Init Integration](#session-init-integration) note)
3. **Current task list** (path from `WORK-STATUS.md`) — checkbox state of current phase, used
   to compute "what has been completed this session" by cross-referencing the checkbox
   transitions with the git log since session start
4. `SESSION-NOTES.md` Persistent Context section — for active constraints worth restating if
   relevant to the current state

Full mode only (feeds the supplemental "In flight" block):

5. **Scan of current-branch `active/`** for task list Status headers — surfaces `Paused` and
   `Waiting-For {category}` state for WUs other than the current focus. Lite does not scan;
   there is no concept of multiple task lists in a single Lite project.

**Use cases:**

- "I stepped out for lunch — what was I doing?" (post-context-switch bookmark, mode-universal)
- "I've been working for a while, quick check on where I am" (mid-session refresh, mode-universal)
- "What's next after this?" (looking ahead when the current unit lands, mode-universal)
- "I suspect my WORK-STATUS.md is stale — what does the world actually look like?" (drift
  detection, mode-universal)
- "What else do I have in flight?" (Full-mode multi-WU visibility on demand — the original
  driver, still supported)

**Out of scope for this skill:**

- Installation/framework health (that is `arcd health` post-rebrand)
- Team-aggregate view across developers (requires cross-identity git notes aggregation,
  deferred to external tooling or a future WU)
- Cross-branch paused-WU enumeration in tracked Full — by default the skill only sees
  current-branch state. A `--all-branches` opt-in flag (or equivalent agent behavior) can
  perform an on-demand git query for task lists with paused Status headers across all
  branches when the user explicitly asks. Pay-for-what-you-request.
- **Mode-fit detection or graduation prompting.** The skill reports current work state; it
  does not assess whether the project is "outgrowing" its current mode. Mode-fit communication
  lives in Mode Fit Communication below and is handled entirely
  through upfront framing, not runtime detection.

---

[team-coord]: ../reference/strategies/arc/strategy-team-coordination.md
[strategy-work-org]: ../reference/strategies/arc/strategy-work-organization.md
[template-meta]: ../reference/templates/arc/work-unit/template-meta.md
[clean-work-unit]: ../system/workflows/arc/supplemental/clean-work-unit.md
[session-init]: ../system/workflows/arc/session-lifecycle/session-init.md
