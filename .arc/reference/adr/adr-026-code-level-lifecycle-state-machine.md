# ADR-026: Adopt a Code-Level Work-Unit Lifecycle State Machine (B1)

## Status

Accepted

## Context

The work-unit lifecycle is the constitutional substrate ADR-019 reformed around a single branch per WU. That
reform settled the *conventions*; it left the *mechanics* almost entirely in markdown. Today roughly ten WU
transitions exist and exactly one is code-driven (`arc start` create-new); the rest are agent-run workflow
ceremonies whose transition rules — branch prefix, meta `State`, preconditions, relocation `git mv`s — are
restated per workflow with no single source of truth. The cost is concrete and has bitten live: a half-built,
asymmetric verb set (only `activate ↔ deactivate` is a clean inverse pair); `arc start` silently mis-scaffolding
an existing backlog stub into two metas (which broke the release wrapper mid-pivot); relocation logic duplicated
across `init`, `decompose`, `archive`, and the unshipped park/resume, so the three-encoding invariant (meta
`State` · directory · branch) is hand-maintained and drifts.

`lifecycle-state-resolver` (shipped) built the **read side** — the logical `(phase, location)` state-space model,
the slug→state derived enum, the cohort-membership and dep-state projections — deliberately as pure functions
that resolve state from location + meta fields and never from `git branch` / `git log` inference. What remains is
the **write side**: the legal edges between states and the mechanics that execute them.

Three migration depths were considered for that write side:

- **Option B0 — doc-only.** Keep the lifecycle as per-workflow markdown; at most document the transitions in one
  place. The duplication and asymmetry persist; the invariants stay an audit, never a guard.
- **Option B2 — a generic transition engine.** A general state-machine engine parameterized over the lifecycle.
  It over-generalizes and, worse, the natural implementation bakes `git mv` in as *the* transition mechanism —
  re-committing the physical-file-location coupling that ADR-022's record/projection direction exists to remove.
    - **A third-party FSM library (XState et al.) is a packaged B2** and loses on the same grounds plus three of
      its own: its runtime model is a long-lived in-memory interpreter holding current state, which fights the
      resolve-`(phase, location)`-from-disk-per-invocation design (we would use ~10% of it and discard the
      interpreter); the encoding-consistency invariant is ours, so the table-walking guard wants plain inspectable
      `TransitionRecord[]` data, not a graph encoded in the library's config shape; and the substantive surface is
      the git/fs mechanics (`relocate-artifacts`, `reconcile-worktree`, dated-path, the pointer-record), which no
      FSM library touches. The lone-process CLI runs exactly one transition per invocation over seven flat states —
      none of the statechart machinery (interpreter, hierarchy, parallel regions, history) is used. Runtime
      state-store libraries (Zustand / Redux) are a different category entirely — in-memory app-state stores with
      no role in a per-invocation CLI — not a transition system at all.
- **Option B1 (chosen) — a hand-rolled declarative transition table as code + a thin imperative executor**, over
  *logical* `(phase, location)`. The table is data (states, legal edges, inverses, guard requirements,
  per-transition encoding updates); the executor resolves current state via the resolver, validates guards, and
  fires a 1↔1 relocation/sweep mutator bundle.

## Decision

We will implement the work-unit lifecycle write side as a **code-level state machine at depth B1**: a declarative
transition table plus a thin imperative executor, reasoning over the resolver's logical `(phase, location)` model.

This commits to four load-bearing positions:

1. **Mechanics in the CLI, judgment in the workflows.** Deterministic mechanics — `git mv`, branch/worktree
   reconcile, scaffold, ROADMAP regen, archival dated-path computation, transition-legality validation — move
   into code. The interlocks and the value-supplying decisions (whether to activate, WU-vs-errand, the cut-map,
   merge approval, commitment / priority / `Class`) stay in the workflows. The CLI *executes* transitions; it
   never *decides* to take them (except where the decision is genuinely deterministic — a name collision forces
   graduate-not-scaffold) and never *fabricates* judgment values — it requires them supplied.

2. **The transition table is the single source of truth, and its invariants ship as tests.** Totality (every
   canonical state's `(verb, from)` is a legal edge or an explicitly-marked illegal cell), inverse round-trip for
   every paired verb, and encoding-consistency (meta `State` · directory · branch) become a table-walking unit
   test — a shippable guard, not a per-workflow audit.

3. **The relocation primitive is unified once** as a 1↔1 mutator bundle (`relocate-artifacts` /
   `reconcile-branch` / `reconcile-worktree` / `set-phase`) fired together so the three-encoding invariant holds
   by construction, called by every location-moving transition rather than re-authored per ceremony.

4. **The record/projection model is applied early to one state.** A parked-Active WU keeps its authoritative
   artifacts on its preserved branch; `main` carries only a regenerable render-pointer (`State: Active (parked)`,
   `Branch`, render fields), blessed as a legal state shape. This is ADR-022's record+projection model proven on
   one well-bounded state ahead of the full backend.

This takes the first deliberate step toward the north star where deterministic lifecycle mechanics live in the
CLI and workflows shrink to the judgment that decides whether and when to fire them.

## Consequences

### Positive

- One authoritative definition of legal lifecycle transitions; the per-workflow restatement and its drift end.
- Totality and encoding-consistency are mechanically enforced, so a documented-but-unbuilt or inconsistent
  transition fails a test rather than surfacing as a live foot-gun.
- The `arc start` mis-scaffold and worktree-occupancy foot-guns become guard rejections.
- The verb set is completed and inverse-paired (`promote`/`demote`, `park`/`resume`, `reopen`, `abandon`).
- The logical `(phase, location)` substrate keeps the physical encoding a projection, so a later record backend
  re-homes it (directory → a record field) with zero reshape.

### Negative

- A hand-rolled table + executor is new code to maintain, and the executor's git / non-TTY mechanics are
  hand-rolled now (migrating to the shared CLI substrate later under `cli-substrate-adoption`).
- Concentrating transition mechanics in one executor makes it a higher-stakes module: a defect there is a
  lifecycle-wide defect. The table-walking tests are the mitigation.

### Risks

- The mechanics/judgment boundary must be policed: pressure to let the executor "just decide" a borderline case
  erodes the split. The rule — the CLI never fabricates judgment values — is the line to hold.
- Depth is fixed at B1 deliberately; if a genuine need for a generic engine (B2) emerges later, that is a
  supersession, not an in-place expansion.

### Amendment (2026-06-15): Post-merge rework is a follow-up unit, not a same-unit reopen

A design corner surfaced at execution time: a merged WU that later needs backing out or reworking. An earlier draft
of the verb set carried merged-corner cells (`abandon`@merged: revert + delete; `deactivate`@merged: revert +
restore to Planning), but they conflicted with the rule that `integrating → abandon` / `park` are illegal (route
via `reopen`), and the resolver's `integrating` state cannot distinguish a merged PR from an open one — leaving no
clean state to key the cells on.

Resolved by aligning with universal industry practice rather than inventing a same-unit reopen:

- **Merge is the terminal commitment.** GitHub and GitLab both forbid reopening a *merged* PR/MR (GitHub Docs:
  "You cannot reopen a merged pull request"; GitLab removed the reopen affordance for merged MRs). Backing out a
  merged change is a *new* revert PR (`git revert -m`); post-merge rework is a *new* branch/PR across git-flow
  (hotfix branches), GitHub Flow, and trunk-based development — never a reuse of the merged branch.
- **The "reopen" idiom lives at the issue-tracker layer** (reopen the *concern*), which the origin-link lineage
  already captures; the ensuing code is a fresh delivery unit regardless.

So the verb set carries **no merged-corner cells**. Pre-merge rework is `reopen` (`Integrating → Active`, withdraw
the open PR); post-merge rework is a new origin-linked WU. `abandon` is legal only from the pre-merge states (a
guard rejects it from `integrating` and from a merged WU); `deactivate` stays narrow (undo a premature
`activate`). The machine stays complete without a merged sub-state or a guarded-legal hack, and matches what
adopters expect from the forges and branching models they already use.

Evidence: GitHub Docs (reverting a pull request); GitLab (reopen-merged-MR removal); git-flow (nvie); GitHub Flow;
trunk-based development; Atlassian Jira (reopen-vs-linked-follow-up guidance).

### Amendment (2026-06-16): `archive` un-bundles physical teardown from the mergeable sweep

Execution surfaced that Decision §3's "fired together so the three-encoding invariant holds by construction"
over-generalized at the `→ completed/` edge. `archive` runs as part of the **ship PR**, and the bundle splits
along a **mergeable / non-mergeable** seam there:

- **Mergeable** — `relocate-artifacts` (`active/ → completed/`) + a logical `Branch → [none]` field-clear +
  `set-phase` (`State → Shipped`). These ride the ship PR (one PR under both protection modes).
- **Non-mergeable** — physical branch/worktree teardown. Deleting the branch would close the open PR, so it
  cannot ride the sweep; it stays the post-merge integration tail, where the markdown already placed it.

So the `archive` edge fires the mergeable legs only. The three-encoding invariant holds at the **record** level
(the logical field-clear) at sweep time; the **physical** encoding reconciles after merge — consistent with the
record/projection model (Decision §4), where directory + branch are a projection of the logical
`(phase, location)`. The encoding-consistency oracle models `→ completed/` as deferring physical teardown, while
local branchless targets (`park@Planning` / `abandon`) still reconcile the branch in place. Decision §3 stands for
every other location-moving transition; this names its one deferred-teardown exception.

## Amending This Document

- **Amendments** (post-implementation learnings that don't change the decision): append a dated
  **Amendment (YYYY-MM-DD):** annotation to Consequences.
- **Supersession** (the depth choice or the mechanics/judgment split itself changes): write a new ADR and set
  this one's Status to "Superseded by ADR-XXX."
