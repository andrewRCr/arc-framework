# Plan: Work Unit Mobility

**Purpose:** Deliver first-class same-developer support for moving between work units —
across time (shift lifecycle: pause / resume / rotate), across filesystem (worktree-aware
shift), and across attention (focus-role model). Closes a current blind spot where ARC has
no awareness of git worktrees and where same-dev parallel-WU usage is only accidentally
supported as a byproduct of team-mode structural design.

**State:** Draft — pre-PRD exploration captured; iteration expected before PRD promotion.
One material open question (pause-pointer reconciliation) must resolve before PRD-readiness.

**Created:** 2026-04-17

**Origin:** Surfaced during a pre-PRD exploratory session on the Session-Init Optimization
planning branch. Worktree support had been noted as a blind spot but not formally captured;
the `/arc-shift` skill was embedded in `plan-arc-modes.md` as a Local-mode mechanism without
treatment for how it composes with worktrees or same-dev parallel-WU use. Exploration
confirmed: (a) shift is structurally extractable from the modes plan, (b) worktrees and
shift together form a coherent "mobility" capability larger than either alone, (c)
first-class same-dev support for concurrent WUs is a distinct gap from team-mode's
multi-developer coordination.

---

## Problem / Motivation

### The worktree blind spot

Current ARC has no awareness of git worktrees. The framework works correctly inside a
worktree (most behavior generalizes naturally via branch-based disambiguation), but nothing
surfaces worktree context, and several mechanisms silently assume one-working-tree-per-repo:

- `session-init` orientation reports current branch but never identifies which physical
  worktree the session is in
- `SESSION-NOTES.md` is gitignored — each worktree holds its own physical copy for the same
  identity, violating the "one identity = one workspace" assumption in
  [strategy-team-coordination.md § Merge Conflict Expectations][team-coord]
- `arc user save` / `arc user load` store notes per-commit, which happens to work across
  worktrees (different HEADs → different commits) but only for WU-scoped files; cross-WU
  files like `ATOMIC-INBOX.md` get divergent per-worktree views
- `activate-work-unit.md` and `integrate-work-unit.md` make no provision for worktree
  creation or removal
- No strategy doc describes how worktrees fit ARC's work-unit model

Developers who use worktrees today do so ad-hoc. ARC doesn't obstruct them, but it also
doesn't help — no guidance, no conventions, no surface integration. For a framework whose
value prop is structured human-AI collaboration, that's a notable gap.

### Parallel WU support is accidental, not first-class

[strategy-team-coordination.md L276-281][team-coord] documents that parallel work units on
independent branches are structurally supported:

> Parallel work units on independent branches... The work units don't coordinate at all at
> the status-file layer: different files, different branches, different task lists.
> **This is the dominant pattern for parallel solo work on independent concerns.**

The phrase "parallel solo work" is doing heavy lifting. Solo devs can work across multiple
WUs today because per-WU `status-{name}.md` files from the Work-Status Restructure WU
structurally prevent collision. But this support is a byproduct of team-mode structural
design, not an intentional first-class capability. There is no:

- Guidance for when same-dev parallel WUs make sense
- Convention for which WU is primary vs companion vs parked
- Integration with worktrees (the natural filesystem-level mechanism)
- Acknowledgment that same-dev concurrent sessions are a pattern worth supporting
- Strategy doc addressing solo concurrent work (team-coord assumes different identities)

ARC has the mechanics but not the model. Mobility WU elevates the capability to first-class:
intentional conventions, explicit tooling integration, documented patterns that honor ARC's
attention-discipline principles while recognizing that developers pivot between WUs in
practice.

### Why this matters beyond personal ergonomics

Concurrent agent sessions, worktree-based pivots, and long-running work-in-flight are
realistic patterns in modern dev practice. An adopter evaluating ARC against its current
state sees a framework that implicitly assumes linear single-WU progression. Shipping
first-class mobility:

- Matches how developers actually work
- Makes the "awaiting review" scenario (days to a week of latency) a supported pattern
  rather than an awkward gap
- Extends ARC's attention-discipline principles into the multi-WU regime with guardrails,
  instead of ceding the ground entirely

---

## Working Thesis: Three Layers of Mobility

Mobility operates at three layers. Each closes a different gap; together they define the
capability.

**Time — Shift Lifecycle.** A WU's state can move through time: `In Progress` → `Paused`
→ `In Progress`, or rotate between WUs via pause-and-resume pairs. Currently designed in
`plan-arc-modes.md § Shift Lifecycle` as the mechanism that makes single-active-WU livable.
Extracts to this WU, applies mode-universally.

**Space — Worktree-Aware Shift.** A WU's filesystem presence can change without branch-switching
mid-working-tree. Worktree-aware shift preserves uncommitted state per WU, enabling pivots
without stash/commit ceremony. New capability; built on top of extracted shift.

**Attention — Focus Role Model.** Which WU receives the developer's peak attention is
explicit, conventional, and singular. Primary / companion / awaiting-external / parked roles
codify what adopters already do implicitly, with guardrails that honor ARC's
one-task-at-a-time discipline without enforcing it technically.

The three layers compose cleanly — shift can operate on metadata alone (time layer),
optionally with worktrees (space layer), optionally with focus-role transitions (attention
layer). Each layer is independently useful; together they deliver the full capability.

---

## Scope

### In scope

1. **Shift lifecycle extraction from `plan-arc-modes.md`.** The full `## Shift Lifecycle`
   section (~478 lines, L3923-4398), `### Alignment with Work-Status Restructure WU`
   (~62 lines, L4400-4460), and related deliverables (plan-arc-modes item 44-49a) move
   into this WU. Modes plan updates cross-references and retains only forward-pointing
   references to mobility as infrastructure.

2. **Worktree-aware shift.** `/arc-shift` gains a worktree mode:
   - `/arc-shift --worktree <path>` creates a new worktree for the incoming WU, leaves
     current WU's worktree intact with uncommitted state preserved
   - Metadata-only shift (current design) remains the default for short pauses / clean-tree
     pivots
   - Decision heuristic documented: pause duration + uncommitted-state importance

3. **Worktree awareness in session-init and `/arc-status`.** Small additions, not
   architectural:
   - Session-init detects worktree context via `git rev-parse --git-dir` and surfaces it in
     orientation when non-primary (`worktree: ../arc-wu-b`)
   - `/arc-status` reports worktree context as part of the current-focus line

4. **Focus-role model.** New convention layer:
   - New status file field: `**Focus Role:** primary | companion | awaiting-external | parked`
   - `**Focus Since:** <date>` for tenure tracking
   - ROADMAP annotation: "Active" section replaces "In Progress" with role annotations
   - Blessed pairings documented (primary + awaiting-external; primary + companion;
     primary + parked[N])
   - Anti-patterns flagged (two primaries — prevented by singleton convention; two
     companions; same-domain concurrents)
   - Swap discipline: swap primary ↔ companion only at review-increment boundaries

5. **`strategy-concurrent-work.md` (new strategy doc).** Placement decision: sibling to
   `strategy-team-coordination.md`, not extending it. Same-identity concurrency is
   structurally different from multi-developer coordination and deserves its own doc. The
   new strategy covers blessed pairings, swap discipline, worktree pattern usage, the
   relationship to team mode, and the main-worktree-under-full-protection framing
   ("your main worktree is not always on main").

6. **Inbox sync fix.** `arc user load` gains cross-WU file merge semantics:
   - WU-scoped files (SESSION-NOTES) stay HEAD-ancestry-scoped (current behavior)
   - Cross-WU files (ATOMIC-INBOX, persistent-context entries) merge across recent notes
     in the ref, not ancestry-bound
   - Small convention for declaring which files are which (or hardcoded allowlist)

7. **`/arc-status` skill.** Moves from arc-modes to mobility. Mode-universal core plus
   Full-only "In flight" block tightly coupled to shift vocabulary. Backed by
   `mid-session-status.md` workflow. Naming depends on ARCd rebrand freeing
   `arc status` CLI name.

8. **arc-modes cross-reference sweep.** Content migration plus ~142 shift references in
   plan-arc-modes.md converted to cross-WU links. Applies before modes advances to PRD.

### Out of scope

- **Blessing concurrent agent sessions.** Framework won't block two simultaneous agent
  sessions in different worktrees, but documentation is explicit: this violates P2
  (co-development bandwidth). Mobility ships the mechanisms; whether an adopter runs two
  agents at once is their call, not ARC's recommendation.

- **Automated mode-fit detection.** Mobility doesn't assess whether a project is
  "outgrowing" single-active discipline. Runtime detection is rejected per arc-modes
  principle (upfront clarity, not runtime detection).

- **Cross-dev worktree coordination.** Team-mode territory. Mobility focuses on
  same-identity concurrent usage.

- **Automated worktree lifecycle CLI (`arc worktree create/remove`).** Advisory workflow
  integration only — `/arc-shift --worktree` invokes `git worktree add` under the hood, but
  there's no standalone `arc worktree` command. Worktree cleanup after merge is documented
  in `integrate-work-unit.md` as an advisory step, not automated.

- **Hooks at shift transitions (`post-shift-pause` etc.).** Hook symmetry with
  `post-task-completion` / `post-work-unit-activate` / `post-work-unit-archive` would be
  reasonable but is deferred — no clear current need, and hooks can be added later without
  breaking existing integrations. Flagged in Unknowns for explicit PRD decision.

---

## Design Decisions

### Name: `feature/work-unit-mobility`

Chosen over `feature/arc-shift-and-worktrees`, `feature/worktree-support`, `feature/wu-shift`,
and `feature/wu-continuity`. Rationale: "mobility" captures the unifying value across all
three layers (time / space / attention) without privileging any single mechanism. Avoids the
"and" tell that signals a missing unifying concept. Mild concern about CS connotations
(mobile agents, process migration) is context-separable — nobody reads
`feature/work-unit-mobility` and thinks distributed systems.

### Category: `feature`

User-visible skills (`/arc-shift`, `/arc-status`), user-visible capabilities (worktree-aware
pivots), and user-visible conventions (focus roles, strategy doc). Technical category would
be wrong — the outputs are interaction surface changes, not internal plumbing.

### Extraction shape: shift lifecycle extracts whole from arc-modes

The arc-modes plan explicitly positions shift as cross-cutting (see [plan-arc-modes.md][arc-modes]
L4378-4387: *"This is why shift lives in its own cross-cutting section rather than inside
the Local mode treatment. It's universal."*). Extraction formalizes what the architecture
already anticipates. Mode-specific coupling inside the shift section is minimal (~10 lines
across two paragraphs) and easily generalized or forward-referenced.

Dependency direction confirms: modes depends on shift, not the reverse. Every shift
reference in modes is modes-side content calling shift as infrastructure. Nothing in shift
requires modes to exist.

### arc-status bundled with shift

`/arc-status` has a mode-universal core (git delta, current focus, uncommitted files) and a
Full-only "In flight" block tightly coupled to shift vocabulary. Alternatives considered:
ship arc-status core in a smaller earlier WU, defer Full block to mobility. Rejected — skill
design is unified, splitting forces two PRDs for one skill. Bundle delays Lite users getting
the mode-universal core slightly, but keeps the skill coherent.

### Focus roles in scope, not deferred

Focus roles could be a follow-on WU (mechanisms now, conventions later). Rejected — shipping
worktree parallelism without any ARC-principled guardrails leaves a values-vs-mechanisms
gap. Mobility WU delivers both the capability and the conventions that make the capability
ARC-shaped.

### Sibling relationship to team mode, not inheritance

Same-identity concurrent usage could theoretically reuse team-mode conventions
(`(@name)` markers, `user.sync_push: prompt`). Rejected — these are team-specific (multiple
humans), not mobility-specific (multiple WUs, one human). Mobility users can enable team
mode independently if they want team conventions, but mobility is structurally distinct.
`strategy-concurrent-work.md` (new) sits alongside `strategy-team-coordination.md`, not
inside it.

### `strategy-concurrent-work.md` as new strategy doc

Evaluated extending `strategy-team-coordination.md` with a same-dev section. Rejected —
putting same-human concurrency under "team coordination" is structurally misleading. New
doc is cleaner; the two strategies reference each other where overlap exists (branching
patterns, status-file merge behavior).

---

## Dependencies and Sequencing

### Upstream

- **ARCd Rebrand WU** (backlog, not started): frees `arc status` CLI name for the
  `/arc-status` skill. See [prd-arcd-rebrand.md][arcd-rebrand-prd] L116-118.
- **Work-Status Restructure WU** (shipped): per-WU `status-{name}.md` files are the
  substrate mobility builds on. The restructure's alignment with shift is already validated
  in [plan-arc-modes.md][arc-modes] § Alignment with Work-Status Restructure WU (L4400-4460).
- **Session-Init Optimization WU** (PRD drafted, see
  [prd-session-init-optimization.md][session-init-opt]): clean base for adding worktree
  detection. Detection is a small additive check that doesn't conflict with optimization's
  content-loading architecture changes.

### Downstream

- **Arc-Modes WU** (backlog, pre-PRD): mobility lands first; modes adopts extracted shift
  as infrastructure. Modes plan gets lighter (~700-900 lines removed) and cleaner — no
  longer carries cross-cutting shift content.

### Recommended sequencing

Current (Session-Init Optimization) → Mobility → Modes → others.

Arguments for mobility before modes:

1. ROADMAP L176 already anticipates an arc-modes split: *"foundation (installation-type +
   shift lifecycle + strategy audit) → Lite+Local."* Extracting shift entirely is an
   extension of that pre-approved split.
2. Modes PRD gets cleaner if shift is pre-existing infrastructure.
3. Worktree/mobility story coheres better as its own WU.
4. Avoids retroactive extraction of shift from shipped modes code.

The cost of inverting the order concentrates in mobility's planning phase (which is in
progress). The cost of not inverting is larger retroactive work later.

---

## Extraction Scope — What Moves, What Stays

### Moves to mobility WU (from `plan-arc-modes.md`)

| Content                                                             | Source     | Scale        |
|---------------------------------------------------------------------|------------|--------------|
| `## Shift Lifecycle`                                                | L3923-4398 | ~478 lines   |
| `### Alignment with Work-Status Restructure WU`                     | L4400-4460 | ~62 lines    |
| `## Mid-Session Orientation` (`/arc-status`)                        | L4462-4585 | ~125 lines   |
| Skill inventory items 41 (`/arc-status`), 43 (`/arc-shift`), 44-49a | L5200-5231 | ~40 lines    |
| Scattered shift cross-references throughout                         | various    | 142 mentions |

Plus net-new content:

- Worktree-aware layer on `/arc-shift`
- Focus-role model design
- `strategy-concurrent-work.md` (new)
- Inbox sync semantics in `arc user load`
- Worktree-awareness in session-init and `/arc-status`
- `integrate-work-unit.md` worktree cleanup advisory

### Stays in arc-modes WU

- `### Single-Active-Unit Invariant` (L3583-3618): enforcement logic stays; error message
  updates to reference extracted shift
- `### Shift Lifecycle Makes Local Full Viable` (L3620-3634): becomes forward reference to
  extracted shift
- `### Scenario Walk-Through` (L3636-3670): Local Full scenarios reference extracted shift
- Mode 1 (Lite), Mode 2 (Local), mode-fit, mode-combinations — entire rest of modes plan
- `/arc-resume`, `/arc-handoff` skill inventory (items 40, 42)

---

## Pressure Points / Risks

### SESSION-NOTES divergence per worktree (new finding)

Team-coordination strategy asserts: *"SESSION-NOTES.md: No conflict possible — each
developer writes to their own `user/{identity}/` directory."* That holds for different
identities. It breaks for same-identity-multiple-worktrees: both worktrees of identity
`andrew` have their own physical `.arc/user/andrew/SESSION-NOTES.md`.

Git notes save/load resolves per-worktree at the commit level (different HEADs, different
notes) — the underlying sync works. But local filesystem state diverges. Concrete failure
mode: write notes in worktree A, `arc user save`, switch to worktree B, `arc user load` —
B's HEAD is a different commit, so it finds B's notes (potentially stale), not A's.

This isn't a bug; it's an artifact of worktrees being physically separate working trees.
But it violates a stated assumption. PRD owes:

- Explicit model statement: "SESSION-NOTES is worktree-scoped, not identity-scoped, when
  worktrees are in use"
- Save/load semantics for worktree contexts
- Reframing: SESSION-NOTES is effectively WU-scoped in practice (notes about the WU you're
  working on), which is actually correct — just not what current docs assume

### Inbox sync semantics

Cross-WU file merge in `arc user load` introduces per-file sync behavior (WU-scoped vs
cross-WU). Requires either a convention for declaring which files are which, or a hardcoded
allowlist. Small design decision but real — affects future files in the `user/{identity}/`
directory.

### Team-mode relationship clarity

Mobility and team mode overlap in concepts but not conventions. PRD must state the
relationship unambiguously to prevent adopter confusion ("do I enable team mode for solo
worktree use?"). Recommended framing: team mode is multi-human; mobility is multi-WU-single-human;
both can coexist; neither requires the other.

### Local-mode framing in extracted shift content

Workflow Shape L4174-4179 in arc-modes has a Local-mode-specific paragraph (".arc/ is
untracked in Local mode, git stash doesn't reach it"). If mobility extracts before Local
mode lands, this paragraph needs reframing. Options: generalize to
"when tracked state lives outside git," forward-reference Local mode, or defer the paragraph
to Local mode's content sweep. PRD decision.

### Main-worktree role under full protection

Under `branch.protection: full`, nothing commits directly to `main` — archival, ROADMAP
updates, and backlog edits all need their own branches and PRs. With worktrees in use,
this reshapes the main worktree's role:

- WU worktrees handle feature work on their own branches (created at activation, removed
  after merge)
- The main worktree (the developer's home-base working directory) becomes the
  administrative / coordination worktree — where planning branches live, where archive
  branches live, where cross-WU backlog edits get staged
- The main worktree is rarely literally on `main` — it cycles through short-lived admin
  branches (plan-*, archive-*) and only returns to `main` between administrative tasks

This is a natural specialization: meta-work happens in the main worktree on admin
branches; feature work happens in WU worktrees on feature branches. But it's a mental
model shift worth documenting. Adopters used to `pwd` implying "I'm on `main`" will need
to recalibrate — full protection's pre-commit hook catches direct-to-main commits
regardless, but the behavioral pattern is new. `strategy-concurrent-work.md` (new)
should include a "Your main worktree is not always on main" framing note.

Batched archive + next-planning composes cleanly: main worktree creates
`feature/plan-wu-c`, commits the WU-A archive first, then the WU-C planning content,
single PR merges both. Mobility doesn't complicate this; it just notes that parallel WU
worktrees continue developing during the admin work.

---

## Unknowns and Open Questions

### Pause-pointer reconciliation (MUST resolve before PRD ready)

Four existing status-file fields are current ARC mechanism for incidental-WU coordination,
not informal legacy:

- `Interrupts:` — on incidental WU status files; names parent WU
- `Paused At:` — on parent status file; records task where work stopped
- `Paused To:` — on parent status file; names the incidental
- `Spawned:` — forward pointer variant

Documented in [template-status.md][template-status] L24-30, actively used in
[manage-incidental-work.md][manage-incidental] L172-192, with KEEP/REMOVE rules in
[clean-work-unit.md][clean-work-unit] L97-100. Explicitly flagged as a tension in
[analysis-modes-solo-dev-blind-spot-audit.md][solo-audit] L232-247.

Shift's `**State:** Paused (date) — reason` is single-WU lifecycle state. They answer
different questions but overlap when WU-A is paused *because* incidental-B was spawned.

Three options (from the audit):

1. **Formalize and reuse** — shift adopts the four fields as its pointer mechanism
2. **Deprecate** — migrate `manage-incidental-work.md` to use shift's single-WU state,
   retire the pointer fields
3. **Keep alongside** — both coexist, serving different scopes (relationship vs lifecycle
   state)

Implementation implications span multiple workflows. The decision is not a formalization
pass; it's a real architectural call affecting incidental-WU handling.

**No lean established during this exploration.** Resolve before PRD.

### How does ARC identify which WU is "primary"?

Candidates:

- User-declared (explicit `**Focus Role:** primary` in status file)
- Implicit (last WU shifted to)
- Per-worktree local state (each worktree designates its own primary)

Each has different implications for the tracked vs gitignored split and for cross-worktree
visibility. Status-file field is tracked and shared; local state is not. PRD decision.

### Focus-role transition mechanism

All role transitions via `/arc-shift`, or do some roles change via other mechanisms?
E.g., does `integrate-work-unit` flip a Waiting-For Review WU to some post-integration role?
Does archival implicitly clear focus role? What's the interaction with the existing
`**State:**` field values?

### Hook symmetry

`post-task-completion`, `post-work-unit-activate`, `post-work-unit-archive` exist in
`arc-extensions.md`. Should mobility add `post-shift-pause` / `post-shift-resume` /
`post-shift-rotate` hooks? Reasonable by symmetry, but no clear current need. In or out of
scope for this WU, or deferred to a later hooks-completeness pass?

### Worktree lifecycle ceremony

Who owns worktree creation and removal?

- Creation: `/arc-shift --worktree` invokes `git worktree add`. Manual worktrees also fine.
- Removal after merge: integrate-work-unit gets an advisory step? CLI helper? Pure
  developer responsibility?
- Stale worktrees (branch merged, worktree still exists): how does session-init handle this?
- Batched archive composition (full protection): when WU-A's archive batches with WU-C's
  planning branch, WU-A's worktree can be removed immediately post-merge (archive happens
  in the main worktree, not WU-A's) — but the advisory should make this sequencing
  explicit so adopters don't wait on the batched archive before cleaning up.

### "Primary" tenure tracking value

The proposed `**Focus Since:** <date>` field tracks how long a WU has been primary. Is this
actually useful, or documentation-for-documentation's-sake? What does ARC do with the
information? If nothing, drop it.

### Worktree detection depth

Minimum: session-init + `/arc-status` surface worktree context in orientation. Maximum:
arc-config awareness, CLI worktree subcommand, strategy-doc diagrams, worktree-aware commit
hooks. Where's the right floor for "worktree-aware" vs "worktree-integrated"?

### Parallel-WU ROADMAP format

Current: single "In Progress" section. Proposed: "Active" section with per-entry role
annotations. What does the exact format look like? Does each role get its own subsection?
Inline annotations? Markdown structure decision pending.

---

## Scope Estimate

**Large.** Comparable in scale to arc-modes or session-init-optimization. Cross-cuts several
workflows and strategy docs.

Natural phases:

1. **Extraction phase** — move shift content from arc-modes, update modes plan
   cross-references, generalize mode-specific language in extracted sections
2. **Worktree-awareness phase** — `/arc-shift` worktree mode, session-init detection,
   `/arc-status` worktree context, `integrate-work-unit.md` cleanup advisory
3. **Focus-role phase** — status file field, `strategy-concurrent-work.md`, ROADMAP format
   convention, blessed-pairings documentation
4. **Inbox sync phase** — `arc user load` cross-WU file merge, convention for declaring
   file sync mode
5. **Integration phase** — `/arc-status` skill completion, pause-pointer reconciliation
   implementation (per PRD-time decision), `integrate-work-unit.md` state acceptance matrix
   (already designed in extracted content)
6. **Documentation / tests / examples** — standard closing phase

Each phase is a review checkpoint. Phase ordering has some flexibility — phases 1-3 are
relatively independent; phases 4-5 depend on phase 1 extraction being complete.

Duration estimate deferred to PRD phase — too many open questions affect scope.

---

## Philosophy Checkpoints

The PRD should explicitly address:

- **P2 (Co-Development):** Mobility preserves the mandatory review stop at task completion
  within each WU. Parallelism is between WUs, not within. The single-human-as-continuity-thread
  principle is maintained by the focus-role singleton (one primary at a time).
- **P5 (Context Preservation):** Mobility improves context preservation — worktree-local
  SESSION-NOTES is correct WU-scoped context, not degradation. Shift-lifecycle state tracking
  surfaces "what was I doing before" more reliably than ad-hoc branch-switching.
- **P7 (Discrete Steps):** One task at a time stays within-WU, not cross-WU. Swap discipline
  (swap primary only at review-increment boundaries) protects this principle under concurrent
  usage.
- **Honest stance on concurrent sessions:** Framework won't block, docs flag as bandwidth
  violation. Consistent with ARC's pattern of encouraging principled usage without enforcing
  technically.

Anyone doing a constitutional review at PRD time will flag these; better to have crisp answers
in the plan than discover late.

---

[team-coord]: ../../reference/strategies/arc/strategy-team-coordination.md
[arc-modes]: plan-arc-modes.md
[session-init-opt]: ../technical/prd-session-init-optimization.md
[arcd-rebrand-prd]: ../technical/prd-arcd-rebrand.md
[solo-audit]: ../../reference/analysis/analysis-modes-solo-dev-blind-spot-audit.md
[template-status]: ../../reference/templates/template-status.md
[clean-work-unit]: ../../system/workflows/arc/work-unit-lifecycle/clean-work-unit.md
[manage-incidental]: ../../system/workflows/arc/supplemental/manage-incidental-work.md
