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
  isolation requires a meta-file location and lifecycle reform that this WU was implicitly
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

1. **Shift reconciliation — see `notes-worktree-foundation.md`.** The shift lifecycle was extracted
   from `draft-arc-modes.md` (Phase 1) and then evaluated against the cohort model. Conclusion: the
   shift *state* machine (`Paused` / `Waiting-For`) is obsolete — superseded by WOR's `Integrating`
   state and worktree-as-parking isolation — and `/arc-status` is cut. "Shift lifecycle" as a distinct
   concept dissolves; WF's surviving shift-related deliverables are the worktree transition primitives
   (items 2, 3, 11) and worktree-aware session-init (item 4). The cohort transition-shape contract in
   `notes-worktree-foundation.md` is the governing record.

2. **In-session worktree pivot (the surviving "shift").** A thin skill (provisional — a quick-trigger /
   canonical entrypoint over a workflow, the `arc-handoff` / `arc-commit` pattern) that repoints the
   current session to another **existing** in-flight worktree, preserving the agent's accumulated
   context. This is the niche case for a short detour where a fresh parallel session would lose that
   context. Creating a worktree for a new WU is spawn (item 3), not the pivot; the dominant multi-WU
   pattern is parallel sessions (`cd <worktree> && arc-resume`) per Session-Operational Flow's
   concurrency model.
    - **Naming watch:** "shift" historically named the now-cut state machine; the pivot may rename to
      `/arc-pivot` (or similar) at spec to avoid importing the dead mental model.
    - **Uncommitted work at the pivot** (survivor folded from the extracted design): before switching,
      detect uncommitted changes and offer commit (recommended) / stash / leave-as-is; the operator
      chooses. In Local mode, untracked `.arc/` edits follow leave-as-is structurally.
    - **Resume-staleness advisory** (survivor): arriving in a long-idle worktree surfaces a dismissible
      "assumptions may be stale — re-read the spec" nudge past a fixed threshold.

3. **Spawn vs continue separation for new-WU creation.** Distinguishes two operations conflated under today's
   "starting a WU" mental model:
    - **Spawn** = one-shot operation invoked from an existing session that creates infrastructure for a new WU:
      branch, worktree (when applicable per tier), meta file with appropriate tier defaults, empty
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
   in-flight WUs (`git worktree list` plus identity-filtered meta files) and assesses scope overlap with the
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

4. **Worktree awareness in session-init, including branch-gone detection.** Small
   additions, not architectural:
    - Session-init detects worktree context via `git rev-parse --git-dir` and surfaces it in
      orientation when non-primary (`worktree: ../arc-wu-b`)
    - **Branch-gone detection at session-init.** When fetch reveals current branch's upstream is
      `gone` (post-prune; today reported as `remote-unavailable / failureReason: error`), surface as a
      dedicated `branch-gone` worktree state with a tailored prompt instead of conflating with
      genuine network failures. Resolution cascade consumes Work Organization Reform's
      cross-worktree roster-cascade implementation: `git worktree list` (other active worktrees) →
      per-worktree meta-file reads via the WOR cascade (active WU branches via `**Branch:**`
      field, filtered by `(@identity)` ownership when team mode; cross-branch read replaces the
      single-`active/`-directory listing assumption) → recently-active remote branches
      (post-fetch, within `coord.recency_days`) → coord-probe (per `draft-coord-probe.md`) → fall
      back to `main` with explicit confirmation. Per-worktree action varies: stranded in main / administrative
      worktree → propose switch to next admin or feature branch; stranded in WU worktree whose branch
      was merged externally → propose worktree removal + meta-file archival cleanup.
      **Detect-stop-prompt as default for ambiguity:** when no high-confidence single signal emerges,
      session-init stops and surfaces candidates rather than guessing.
    - **Notes-pull ordering rule under branch-gone.** When `branch-gone` fires, align git state (fetch, resolve
      target branch via cascade, switch) **before** running `arc user pull`. Notes describe context that requires
      aligned git refs — pulling against a stale branch yields correct content referencing surfaces (meta files,
      atomic companion files) that don't exist on the current branch. The ordering reverses session-init's standard
      Step 2 → Step 3 sequence for this specific state.
    - **Trust-hierarchy axis split in [session-init.md][session-init] Step 7.** Refactor the existing single
      hierarchy (git > task list > status > notes) into two axes per § Roster vs context: (a) *truth of work
      state* — git authoritative (current hierarchy, narrowed to this question); (b) *which work am I picking up* —
      identity-filtered meta files + worktree list authoritative (new axis). Mismatch examples in Step 7
      redistribute to the appropriate axis.
    - **Forward compatibility with pre-worktree single-WU world.** The branch-gone cascade ships value before
      worktrees are in widespread use. Pre-worktree, the cascade trivializes — `git worktree list` returns one
      entry, identity-filter on meta files yields one match, notes-pull confirms. Shipping isn't gated on
      worktree adoption; today's single-WU multi-machine recovery is the simplest instance of the same mechanism.

5. **`/arc-status` skill — cut.** Dropped per `notes-worktree-foundation.md`: the project-wide
   in-flight view is the derived ROADMAP, and session-scoped orientation is something operators already
   hold. The genuinely-distinct value (a user-scoped, cross-WU view of in-flight WUs, including those
   with no open session) is captured as the **user-scoped in-flight dashboard** candidate in the
   contract — a derived view, not this ephemeral skill. (Aside: `arc status` is now the session-init
   composite probe, not a name the rebrand would free — the old framing assumed otherwise.)

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

7. **Pause-pointer fields — already retired by WOR; nothing to migrate to.** WOR's incidental-model
   reform retired `Interrupts:` / `Paused At:` / `Paused To:` / `Spawned:`, and the strict 4-state
   machine (`Planning | Active | Integrating | Shipped`) has no `Paused` state to migrate them into.
   The original "migrate pointers to shift state" plan is moot. WF's only residual task: confirm no
   dangling pointer-field references remain in workflows / templates.

   **Reverse-pointer (WOR § Incidental Work Model):** WOR left a transitional framing of mid-execution
   interrupt handling ("capture on the current branch with clear commit boundaries"). Reconcile it to
   the worktree-isolation model — an interrupt spins up an atomic-tier WU in its own worktree
   (`arc start --tier atomic`, AWL) and ships via PR, rather than pausing the current WU. This pairs
   with the incidental-concept retirement in `draft-agile-wu-lifecycle.md` (item 9).

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

9. **arc-modes cross-reference sweep — Phase 1 done; residual captured.** The shift sections moved out
   of `draft-arc-modes.md`, with its TOC + a removal-site forward-pointer + the orphaned-reference
   cleanup landed in Phase 1. The remaining sweep (Lite cut, post-WOR de-stale, residual shift-ref
   conversion) is captured on the arc-modes WU's own meta `**Next Action:**` and runs at its activation.

10. **Worktree conventions — branch-naming method and location template.** Two configurable
    conventions ship as substrate for items 2 and 11, both implemented as methods under
    `system/methods/` with the full method-override machinery from
    `strategy-configurability-architecture.md`:

    - **Branch-naming method** (`branch.naming_convention`). Default = Conventional Branch
      alignment per WOR's settled type-set — core 6 execution types plus `plan/<name>` for
      planning state. The method defers the type-set to WOR's resolution rather than hardcoding;
      WF references whatever WOR ships. Override surface mirrors `commit.format` for adopters
      with house conventions (Jira-prefixed, ticket-numbered, etc.). When ARC creates branches
      (`arc start` / spawn, item 11's cold-start primitive), the configured
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
      via `git worktree list` plus identity-filtered meta-file reads, surfaces the same
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
- **Automated worktree lifecycle CLI (`arc worktree create/remove`).** No standalone `arc worktree`
  command (per the contract): worktree creation lives inside the WU transition verbs (spawn /
  `arc start`, cold-start), which invoke `git worktree add` under the hood; cross-site consistency
  comes from item 10's conventions. Worktree cleanup after merge is documented in
  `integrate-work-unit.md` as an advisory step, not automated.
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

- **Worktree accumulation.** Cleanup must be guaranteed and visible. Spawn-time + integration-time
  cleanup advisories and (eventually) automated stale-worktree detection at session-init are the
  mitigations.
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
activity is a much heavier scan than reading meta files filtered by identity. Keeping the two axes separate
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
  (single-branch-per-WU lifecycle, sweep-as-you-go integration, meta-file location-by-state
  convention, cross-worktree roster cascade). This WU's worktree-mechanism work assumes the
  isolation foundation; without WOR, worktrees inherit stale Planning-state meta files from main
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
  signal source. Loose coupling — cascade ships with hand-rolled fallback (meta-file walk +
  remote-recency only), coord-probe wires in later when it lands.
- **Agile WU Lifecycle** (`draft-agile-wu-lifecycle.md`): consumes clean activate/integrate workflows
  post-pointer-field retirement; the tier model's `arc start` command operates on the worktree-aware
  activation substrate.
- **Concurrent Work Conventions** (`draft-concurrent-work-conventions.md`): consumes mechanism layer
  entirely.
- **ARC Operating Modes (Local mode):** the shift lifecycle dissolved (see
  `notes-worktree-foundation.md`); no longer a prerequisite handoff. Any residual shift-*state*
  semantics, if needed, are a Local-mode concern (single working tree, no worktree-as-parking), not a
  WF deliverable.

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

- Creation: spawn / `arc start` invokes `git worktree add`. Manual worktrees also fine.
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

Minimum: session-init surfaces worktree context in orientation. Maximum: arc-config
awareness, CLI worktree subcommand, strategy-doc diagrams, worktree-aware commit hooks. Where's the
right floor for "worktree-aware" vs "worktree-integrated"?

### Planning-layer Changes and the concurrency oracle

Worktree Foundation is the mechanism behind the Change work class (ADR-021) — cross-cutting and
trivially-small work that takes an ephemeral branch without becoming a WU. Two seams land here:

- **Cheap-branch affordance.** A Change needs a worktree / branch spun off `main` and torn down on
  merge, with no meta / lifecycle. Does the spawn primitive (phase 2) grow a Change mode, or is a
  Change just a manual `git worktree add` + ephemeral branch riding the lighter merge gate? Where is
  the floor?
- **Concurrency oracle.** The activation-time concurrency check (phase 2) generalizes to an all-owner,
  on-demand in-flight detector sourced from remote refs + open PRs (not `main`-derived state, which is
  blind to unmerged work; not branch-name → WU, since a Change branch maps to no WU). This is also the
  oracle the user-scoped in-flight view consumes. How much does WF build vs. defer to roadmap-tooling
  (render) and Concurrent Work Conventions (the gate doctrine)? See `cohort-agile-parallelism.md`.

---

## Scope Estimate

**Medium.** The shift-state machine and `/arc-status` are cut, shrinking the original
extraction-heavy estimate. Worktree-aware session-init, the cross-WU sync mechanism, the spawn /
cold-start primitives, and the thin in-session pivot are the real implementation work.

Phases (provisional):

1. **Worktree-awareness phase** — session-init worktree detection + branch-gone cascade,
   `integrate-work-unit.md` cleanup advisory.
2. **Spawn + cold-start phase** — spawn primitive (creates worktree + scaffolds + reports path),
   cold-start bootstrap primitive (incl. named-branch-no-meta recognition), tier-aware applicability,
   activation-time concurrency check, auto-mode boundary.
3. **In-session pivot phase** — the thin pivot skill (provisional naming), uncommitted-work handling,
   resume-staleness advisory.
4. **Main-on-main pattern documentation** — strategy doc + workflow guidance. Lightweight; mostly prose.
5. **Cross-WU sync phase** — `arc user save/load` path-driven dispatch, per-WU subdir load, cross-WU
   merge, tombstones, concurrent-push reconcile.
6. **Worktree conventions** — branch-naming method + location template (substrate for phases 2-3).
7. **Shipped-doc drift-fix** — remove the "future arc-shift" `Paused` / `Waiting-For` rows from
   `strategy-work-organization.md` and reconcile its state table with `template-meta.md` (rides with
   this WU per the contract).
8. **Documentation / tests / examples** — standard closing phase.

Phases 1-2 relatively independent; phase 3 builds on phase 2; phases 4-7 independent.

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

---

[team-coord]: ../reference/strategies/arc/strategy-team-coordination.md
[session-init]: ../system/workflows/arc/session-lifecycle/session-init.md
