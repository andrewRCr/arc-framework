# Plan: Worktree Foundation

**Purpose:** Land the mechanism layer for parallel and mobile work — extract shift lifecycle as
mode-universal infrastructure, add worktree-aware shift, give session-init worktree context awareness
including branch-gone detection, and resolve cross-WU file sync semantics. Mechanism only; conventions
land in [Concurrent Work Conventions][cwc].

- **State:** Draft — pre-PRD exploration captured during agile/mobility expansion discussion 2026-04-28.
  Split from former Work-Unit Mobility WU; the conventions layer became Concurrent Work Conventions and
  the agile-lifecycle layer became Agile WU Lifecycle.

- **Created:** 2026-04-28

- **Origin:** Originally Phases 1–2 of the Work-Unit Mobility plan. Split out during the
  agile/mobility design discussion to ship mechanism earlier and let downstream WUs (User Sync UX
  Polish, Coord Probe, Agile WU Lifecycle) consume worktree mechanics from a clean substrate. Resolves
  the long-standing concern that ROADMAP claims "parallelizable" downstream WUs without ARC actually
  having parallelism infrastructure — Worktree Foundation makes parallelism real.

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

Without this WU shipping, ROADMAP's "parallelizable" sibling claims are aspirational for solo work and
team mode is the only path to actual concurrency. Worktree Foundation makes per-WU-per-worktree
isolation a first-class capability.

The shift lifecycle (`plan-arc-modes.md` § Shift Lifecycle, ~478 lines) was designed as mode-universal
infrastructure that arc-modes calls into. Extracting it is the natural form of what the architecture
already anticipates ([plan-arc-modes.md][arc-modes] L4378-4387: *"This is why shift lives in its own
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
    - Metadata-only shift (current design) remains the default for short pauses / clean-tree pivots
    - Decision heuristic documented: pause duration + uncommitted-state importance

3. **Worktree awareness in session-init and `/arc-status`, including branch-gone detection.** Small
   additions, not architectural:
    - Session-init detects worktree context via `git rev-parse --git-dir` and surfaces it in
      orientation when non-primary (`worktree: ../arc-wu-b`)
    - `/arc-status` reports worktree context as part of the current-focus line
    - **Branch-gone detection at session-init.** When fetch reveals current branch's upstream is
      `gone` (post-prune; today reported as `remote-unavailable / failureReason: error`), surface as a
      dedicated `branch-gone` worktree state with a tailored prompt instead of conflating with
      genuine network failures. Resolution cascade: `git worktree list` (other active worktrees) →
      `.arc/active/{category}/status-*.md` (active WU branches via `**Branch:**` field, filtered by
      `(@identity)` ownership when team mode) → recently-active remote branches (post-fetch, within
      `coord.recency_days`) → coord-probe (per [plan-coord-probe][plan-coord]) → fall back to `main`
      with explicit confirmation. Per-worktree action varies: stranded in main / administrative
      worktree → propose switch to next admin or feature branch; stranded in WU worktree whose branch
      was merged externally → propose worktree removal + status-file archival cleanup.
      **Detect-stop-prompt as default for ambiguity:** when no high-confidence single signal emerges,
      session-init stops and surfaces candidates rather than guessing.

4. **`/arc-status` skill.** Mode-universal core (git delta, current focus, uncommitted files) plus
   Full-only "In flight" block tightly coupled to shift vocabulary. Backed by `mid-session-status.md`
   workflow. Naming depends on ARCd Rebrand freeing `arc status` CLI name. Bundled with shift because
   the skill design is unified — splitting forces two PRDs for one skill.

5. **Inbox sync fix.** `arc user load` gains cross-WU file merge semantics:
    - WU-scoped files (SESSION-NOTES) stay HEAD-ancestry-scoped (current behavior)
    - Cross-WU files (ATOMIC-INBOX, persistent-context entries) merge across recent notes in the ref,
      not ancestry-bound
    - Small convention for declaring which files are which (or hardcoded allowlist)

6. **Pause-pointer reconciliation: option 2 (deprecate, migrate to shift state).** The four current
   pointer fields (`Interrupts:`, `Paused At:`, `Paused To:`, `Spawned:`) are retired. Their use cases
   migrate to shift's single-WU `**State:**` field with shift-state values
   (`Paused (date) — reason`). `manage-incidental-work.md` workflow migrates to use shift instead of
   the pointer fields. Updates ripple through [template-status.md][template-status],
   [strategy-work-organization.md][strategy-work-org] § Optional Pointer Fields, [clean-work-unit.md][
   clean-work-unit] L97-100 KEEP/REMOVE rules, and 2-3 other workflow touchpoints. Resolves the
   pre-PRD blocker on the original Mobility plan.

7. **arc-modes cross-reference sweep.** Content migration plus shift references in
   `plan-arc-modes.md` converted to cross-WU links. Applies before modes advances to PRD.

### Out of scope

- **Focus-role model** (primary/companion/awaiting-external/parked) — landed by [Concurrent Work
  Conventions][cwc].
- **Async-merge integration-surface audit** — landed by [Concurrent Work Conventions][cwc].
- **`strategy-concurrent-work.md`** — landed by [Concurrent Work Conventions][cwc] (depends on
  mechanism + agile lifecycle landing first).
- **Tier model and `arc start` command** — landed by [Agile WU Lifecycle][awl].
- **Automated worktree lifecycle CLI (`arc worktree create/remove`).** Advisory workflow integration
  only — `/arc-shift --worktree` invokes `git worktree add` under the hood, but no standalone
  `arc worktree` command. Worktree cleanup after merge is documented in `integrate-work-unit.md` as
  an advisory step, not automated.
- **Hooks at shift transitions (`post-shift-pause` etc.).** Hook symmetry deferred to a later
  hooks-completeness pass. No clear current need; hooks can be added later without breaking
  integrations.
- **Blessing concurrent agent sessions.** Framework won't block two simultaneous agent sessions in
  different worktrees, but documentation is explicit: this violates P2 (co-development bandwidth).
  This WU ships the mechanism; the conventions on usage pattern land in [Concurrent Work
  Conventions][cwc].

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
to use shift state retires the pointer fields cleanly. The category retirement itself is [Agile WU
Lifecycle][awl] scope; the field retirement (workflow-mechanics) lands here.

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

---

## Dependencies and Sequencing

### Upstream

- **Session-Init Optimization** (shipped): clean session-init substrate to extend.
- **Session-Operational Flow** (current planning): no frame dependency, but landing after avoids
  surface conflicts on session-init workflow edits.

### Sibling (parallelizable)

- **[User Sync UX Polish][user-sync-ux]:** SESSION-NOTES per-worktree handling interacts with sync
  semantics; either order works.
- **[plan-coord-probe][plan-coord]:** Worktree Foundation's branch-gone fire point invokes the probe;
  coord-probe is consumed downstream from this WU's session-init integration.

### Downstream

- **[Agile WU Lifecycle][awl]:** consumes clean activate/integrate workflows post-pointer-field
  retirement; the tier model's `arc start` command operates on the worktree-aware activation
  substrate.
- **[Concurrent Work Conventions][cwc]:** consumes mechanism layer entirely.
- **ARC Operating Modes:** consumes extracted shift lifecycle as prerequisite, no longer bundled.

### Recommended sequencing

Session-Operational Flow → **Worktree Foundation** ‖ User Sync UX Polish ‖ Coord Probe → Agile WU
Lifecycle → Concurrent Work Conventions.

---

## Pressure Points and Risks

### SESSION-NOTES divergence per worktree

[strategy-team-coordination.md][team-coord] asserts: *"SESSION-NOTES.md: No conflict possible — each
developer writes to their own `user/{identity}/` directory."* That holds for different identities. It
breaks for same-identity-multiple-worktrees: both worktrees of identity `andrew` have their own
physical `.arc/user/andrew/SESSION-NOTES.md`.

Git notes save/load resolves per-worktree at the commit level (different HEADs, different notes) —
the underlying sync works. But local filesystem state diverges. Concrete failure mode: write notes in
worktree A, `arc user save`, switch to worktree B, `arc user load` — B's HEAD is a different commit,
so it finds B's notes (potentially stale), not A's.

This isn't a bug; it's an artifact of worktrees being physically separate working trees. PRD owes:

- Explicit model statement: "SESSION-NOTES is worktree-scoped, not identity-scoped, when worktrees
  are in use"
- Save/load semantics for worktree contexts
- Reframing: SESSION-NOTES is effectively WU-scoped in practice — which is correct, just not what
  current docs assume

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

### Cross-WU file allowlist mechanism

Hardcoded list (ATOMIC-INBOX.md, persistent-context entries) vs convention for declaration vs
per-file frontmatter marker. Small design decision; PRD-time choice.

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
3. **Pause-pointer migration phase** — retire four pointer fields, migrate
   `manage-incidental-work.md`, sweep cross-references, update template-status and
   strategy-work-organization.
4. **Inbox sync phase** — `arc user load` cross-WU file merge, convention for declaring file sync
   mode.
5. **Documentation / tests / examples** — standard closing phase.

Each phase is a review checkpoint. Phases 1-2 relatively independent; phase 3 depends on phase 1's
extraction being complete; phase 4 independent.

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

[arc-modes]: ../feature/plan-arc-modes.md
[awl]: plan-agile-wu-lifecycle.md
[cwc]: ../feature/plan-concurrent-work-conventions.md
[plan-coord]: plan-coord-probe.md
[user-sync-ux]: plan-user-sync-ux.md
[team-coord]: ../../reference/strategies/arc/strategy-team-coordination.md
[strategy-work-org]: ../../reference/strategies/arc/strategy-work-organization.md
[template-status]: ../../reference/templates/template-status.md
[clean-work-unit]: ../../system/workflows/arc/work-unit-lifecycle/clean-work-unit.md
