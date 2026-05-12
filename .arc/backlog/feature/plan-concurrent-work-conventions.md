# Plan: Concurrent Work Conventions

**Purpose:** Codify the conventions layer for principled multi-WU work — `strategy-concurrent-work.md`
as the canonical home for activation-time concurrency-check guidance, parallelism decision rubrics,
rebase / merge discipline for concurrent WUs, worktree operational guidance, async-merge
accommodation, and main-worktree-under-full-protection framing. Composes with
`plan-worktree-foundation.md` (mechanism) and `plan-agile-wu-lifecycle.md` (tier model) to deliver
"agile, principled, multi-WU work."

- **State:** Draft — pre-PRD exploration captured. Renamed from former Work-Unit Mobility WU as part
  of the agile/mobility split (mechanism → Worktree Foundation; tier model → Agile WU Lifecycle;
  conventions → this WU). Iteration expected before PRD promotion. Updated 2026-05-08:
  redesigned around external-research-informed lighter shape — focus-role field model rejected;
  conventions land as judgment-based protocols + strategy-doc guidance, not as new status-file
  fields. See `research-focus-wip-attention-discipline.md`,
  `research-active-work-coordination-vocabulary.md`, `research-concurrent-work-mechanism-layer.md`,
  and `research-integration-conflict-handling.md` for the research underpinning the redesign.

- **Created:** 2026-04-17 (originally as Work-Unit Mobility); split and renamed 2026-04-28; redesign
  2026-05-08.

- **Origin:** Surfaced during a pre-PRD exploratory session on the Session-Init Optimization
  planning branch as the conventions layer of mobility. Carved out from the original Work-Unit
  Mobility plan during the agile/mobility design discussion when three-layer scope (mechanism +
  conventions + agile lifecycle) proved too large for one WU. Mechanism extracted to
  `plan-worktree-foundation.md`; agile-lifecycle scope newly identified and split to
  `plan-agile-wu-lifecycle.md`; this WU retains the conventions layer.

  **2026-05-08 redesign.** During Interlock Release Wrappers WU1 the parallelization-safety gap
  was surfaced — none of the trio plans modeled "is this WU safe to parallelize against in-flight
  WUs?" The first-attempt focus-role model (`primary | companion | awaiting-external | parked`)
  was investigated against industry idiom via three external-research passes plus a fourth on
  integration-conflict handling. Findings: zero PM-tool precedent for focus-role-as-field;
  touched-files / scope-overlap probes are not idiomatic and brittle in practice; conflict
  prediction tools exist but adoption is limited. Reframe: rely on agent judgment at activation,
  soft conventions in the strategy doc, and operational guidance for handling conflicts at
  integration. No new status-file field, no overlap probe, no formal primacy model.

---

## Problem / Motivation

`plan-worktree-foundation.md` ships the mechanism for parallel work — worktrees, shift, session-init
worktree-awareness, branch-gone detection. `plan-agile-wu-lifecycle.md` ships the tier model for
fast WU spin-up. But mechanism and tier model alone leave the **patterns of multi-WU usage**
unaddressed:

- When are concurrent WUs appropriate vs counterproductive?
- How does an agent assess whether a new WU is safe to parallelize against in-flight WUs?
- What rebase / merge discipline keeps concurrent branches integrable without late-stage drama?
- How do shipped-but-awaiting-review WUs compose with active in-flight WUs?
- What conventions distinguish "principled concurrent solo work" from "fragmented attention with
  predictable quality degradation"?
- How does the awaiting-review state compose with session-handoff, archival, and worktree cleanup
  workflows that currently assume synchronous merge?

Without conventions, mechanism encourages chaos. The conventions layer codifies what adopters
already do implicitly when concurrent work goes well, with judgment-driven protocols that honor
ARC's attention-discipline principles.

### Parallel WU support is conventions-bound, not just mechanism-bound

[strategy-team-coordination.md][team-coord] L276-281 documents that parallel work units on
independent branches are structurally supported:

> Parallel work units on independent branches... The work units don't coordinate at all at the
> status-file layer: different files, different branches, different task lists.
> **This is the dominant pattern for parallel solo work on independent concerns.**

The phrase "parallel solo work" is doing heavy lifting. With Worktree Foundation shipped, the
mechanism exists. But there is no:

- Guidance for when same-dev parallel WUs make sense
- Activation-time protocol for assessing scope overlap with in-flight WUs
- Rebase / merge discipline guidance for concurrent branches
- Strategy doc addressing solo concurrent work (team-coord assumes different identities)

ARC has the mechanics but not the model. This WU elevates the capability to first-class:
intentional conventions, documented patterns, judgment-based protocols that honor ARC's
attention-discipline principles while recognizing that developers pivot between WUs in practice.

### Why this matters beyond personal ergonomics

Concurrent agent sessions, worktree-based pivots, and long-running work-in-flight are realistic
patterns in modern dev practice. An adopter evaluating ARC against its current state sees a
framework that implicitly assumes linear single-WU progression. Shipping first-class conventions:

- Matches how developers actually work
- Makes the "awaiting review" scenario (days to a week of latency) a supported pattern rather than
  an awkward gap
- Extends ARC's attention-discipline principles into the multi-WU regime with guardrails, instead
  of ceding the ground entirely

### ARC's concurrency model — parallel sessions, not in-session juggling

Per `plan-session-operational-flow.md` § Concurrency Model: ARC's concurrency model is
**parallel sessions, one WU per session, with shift as the in-session escape hatch for short
detours.** Multi-WU work means multiple sessions, each scoped to one WU/worktree/branch with
isolated SESSION-NOTES; sessions don't interact internally except at boundaries (spawning new WUs,
sweep ceremonies, planning).

This framing has direct implications for conventions in this WU:

- "Developers pivot between WUs" means alt-tab between separate sessions, not in-session WU
  switching. The metadata-only shift remains available for the niche atomic-detour case but is
  not the dominant pattern.
- Single-active-focus is implicit in worktree presence — the worktree the agent is currently in
  is the active focus. No field needed.
- Transitions between active worktrees happen at review-increment boundaries (the same task-
  interlock invariance ADR-016 establishes for in-WU work).

### Why no formal focus-role model

The plan's earlier shape proposed a `**Focus Role:**` status-file field with values
`primary | companion | awaiting-external | parked`, blessed pairings, swap discipline, and per-WU
tenure tracking. External research (2026-05-08) found no PM-tool precedent for this shape — every
tool surveyed (Linear, Jira, GitHub Projects, Shortcut, Notion, Asana, Trello, Height) models
active work via Status enum + Assignee, not role annotation. The underlying *concepts*
(single-thread attention, single-active-focus, awaiting-review as a distinct state) are
evidence-aligned across Kanban, Deep Work, GTD literature — but expressing them as a separate
field invents net-new vocabulary adopters won't recognize.

ARC adopts the lighter posture: rely on agent judgment + protocols, not field-encoded roles.

- **"Primary"** maps to the existing implicit signal: which worktree is the agent currently in?
  That's the active focus. No field needed.
- **"Awaiting-external"** maps to `**State:** Complete` + `**Integration:** Awaiting Review` using
  fields already defined by `plan-agile-wu-lifecycle.md` + plan-session-operational-flow Phase 7.
  No new enum value needed.
- **"Companion"** conflated runtime focus with backlog grouping. The grouping concern is already
  covered by `plan-work-organization-reform.md`'s group-dir convention plus the existing
  `**Sibling Work Unit(s):**` status field. No runtime equivalent needed.
- **"Parked"** maps to GTD's Someday/Maybe — soft convention guidance in the strategy doc, not
  field-encoded.

The anti-pattern intuitions (single-thread attention, same-domain concurrents) survive as soft
guidance in `strategy-concurrent-work.md`, framed as conventions adopters apply by judgment, not
field validations a tool enforces.

---

## Relationship to Interlock Model Frame

[ADR-016][adr-016] establishes configurable autonomy interlocks for session-operational flow, with
`plan-session-operational-flow.md` implementing the core mechanics. This WU consumes the
frame as an enabler — configurable autonomy modes reduce approval ceremony under multi-session
load, which is exactly the ergonomic gap multi-worktree introduces.

**Touchpoint:** With configurable autonomy in place, modest concurrency (2-3 sessions) becomes
principled rather than tolerated — per-task approval ceremony reduces via auto-commit / auto-push
toggles, making the bandwidth cost tractable. PRD should resolve whether the strategy doc presents
the posture as "tolerated" or "principled at modest scale."

---

## Scope

### In scope

1. **`strategy-concurrent-work.md` (new strategy doc).** Sibling to
   [strategy-team-coordination.md][team-coord], not extending it. Same-identity concurrency is
   structurally different from multi-developer coordination. Coverage:

    - **Worktree-by-default rationale and trade-offs.** Why ARC departs from solo-developer norm
      (multi-agent isolation as primary justification, frictionless parallelism later); discovery
      and cleanup discipline; risks (worktree accumulation, "which worktree am I in" confusion).

    - **When to parallelize vs serialize.** Decision rubric — independent WUs (disjoint files /
      modules) → parallel-merge OK; high-overlap WUs (shared module, semantically related code)
      → serialize. Concrete examples per `research-integration-conflict-handling.md`.

    - **Activation-time concurrency check.** Agent-led, judgment-based protocol: at WU activation
      (spawn or resume), agent reads in-flight WUs (`git worktree list` + identity-filtered
      status files), assesses scope overlap by reading their `**Purpose:**` / Spec content +
      `**Sibling Work Unit(s):**` declarations, and either proceeds, surfaces concerns to user,
      or suggests sequencing change. Non-deterministic; advisory; no probe tooling. The strategy
      doc gives the judgment heuristics; the workflow step (in `plan-worktree-foundation.md`'s
      spawn scope) fires the check. Scope boundary: the check applies only to worktree-based
      spawn, not to the metadata-only shift available for atomic detours — the latter stays in
      the current worktree and is bounded by review-increment discipline rather than
      cross-WU concurrency overlap.

    - **Branch and rebase discipline.** Periodic-rebase-onto-main vs end-of-flight rebase
      trade-off (lifetime threshold around 2 days per industry research); rerere setup for
      periodic-rebase teams; "Update branch" workflows; merge vs rebase choice with consequences
      for review.

    - **Merge ordering between concurrent WUs.** First-in-wins vs explicit serialization;
      PR-label conventions for "merge after #X"; merge-queue interaction (Mergify, GitHub merge
      queue).

    - **Worktree operational guidance.** Performing merges from main (or dedicated merge)
      worktree; refetching / rebasing other worktrees post-merge; using `git worktree remove`
      instead of `rm -rf`; stale-reference recovery; cross-worktree state after rebase;
      sync-all-worktrees recommendation.

    - **When to abandon parallelism.** Heuristics: conflict-resolution time exceeding ~30% of
      parallelism savings; rebase count exceeding ~3 due to upstream churn; semantic drift
      between branches. Recovery action: merge one branch, abandon the other, redo as unified
      WU.

    - **Async-merge guidance.** Managing WUs through awaiting-review latency (days to a week);
      how `**State:** Complete + **Integration:** Awaiting Review` interacts with session-
      handoff, archival, and worktree cleanup; soft conventions for handling the post-PR-pre-
      merge state.

    - **Soft anti-pattern guidance.** Single-thread attention (only one active focus at a time);
      avoiding same-domain concurrents (informed by attention-residue research); review-
      increment-boundary discipline for transitioning between WUs. Framed as judgment guidance,
      not enforced rules.

    - **Main-worktree-under-full-protection convention.** "Your main worktree is not always on
      main" framing — under `branch.protection: full`, main worktree specializes for admin /
      coordination work (planning branches, archive branches, cross-WU backlog edits) while WU
      worktrees handle feature work.

    - **Relationship to team mode.** Concurrent-work conventions and team mode are orthogonal;
      both can coexist; neither requires the other.

2. **Integration-surface async-merge audit.** [integrate-work-unit.md][integrate-wu] and related
   lifecycle workflows currently assume synchronous merge (PR created → merged → cleanup in one
   flow). With async-merge as a legitimate pattern (post-PR + awaiting-review-latency), workflows
   need accommodation — handoff transitions, status-file updates, worktree cleanup advisory,
   archival ordering — for the awaiting-review state. Audit sync-merge assumptions; adjust
   touchpoints additively (option B per Design Decisions). Includes detailed guidance in
   `strategy-concurrent-work.md` § Async-merge guidance.

3. **State + Integration field semantics for awaiting-review.** Coordinate with
   `plan-agile-wu-lifecycle.md` (which delivers the State + Integration fields per
   plan-session-operational-flow Phase 7) so the `**State:** Complete + **Integration:** Awaiting
   Review` combination cleanly expresses the awaiting-external state without requiring a separate
   field or enum value.

### Out of scope

- **Focus-role field model** — explicitly rejected per § Why no formal focus-role model. Strategy
  doc covers anti-pattern intuitions as soft guidance only.
- **Touched-files / scope-overlap probe** — explicitly rejected. Activation-time concurrency check
  is judgment-based, not probe-based.
- **Worktree mechanism, shift lifecycle, session-init worktree detection, branch-gone detection,
  inbox sync** — `plan-worktree-foundation.md`.
- **Tier model, `arc start` command, ceremony scaling, atomic-companion retirement, incidental
  category retirement** — `plan-agile-wu-lifecycle.md`.
- **External tracker integration for "what's @teammate working on"** — `plan-coord-probe.md`.
- **Group-dir convention for sibling WUs** — `plan-work-organization-reform.md`. The existing
  `**Sibling Work Unit(s):**` status field plus group-dir convention from WOR cover the
  "sibling / companion" relational concept; no runtime equivalent needed.
- **ROADMAP form-factor evolution (parallel/multi-stream visualization, sequencing-artifact
  brittleness, horizon tiers)** — `plan-roadmap-evolution.md`.
- **Blessing concurrent agent sessions.** Framework won't block two simultaneous agent sessions in
  different worktrees, but documentation is explicit: this potentially violates P2 (co-development
  bandwidth). Adopter's call, not ARC's recommendation.
- **Automated mode-fit detection.** Framework doesn't assess whether a project is "outgrowing"
  single-active discipline. Runtime detection rejected per arc-modes principle.
- **Cross-dev worktree coordination.** Team-mode territory.
- **Hooks at shift transitions.** Hook symmetry deferred to a later hooks-completeness pass.

---

## Design Decisions

### Sibling relationship to team mode, not inheritance

Same-identity concurrent usage could theoretically reuse team-mode conventions (`(@name)` markers,
`user.sync_push: prompt`). Rejected — these are team-specific (multiple humans), not concurrency-
specific (multiple WUs, one human). Concurrent-work users can enable team mode independently if
they want team conventions, but concurrent-work patterns are structurally distinct.
`strategy-concurrent-work.md` (new) sits alongside `strategy-team-coordination.md`, not inside it.

### Focus-role model rejected (2026-05-08 redesign)

The plan's earlier shape proposed a `**Focus Role:**` field with `primary | companion |
awaiting-external | parked` values, blessed pairings, swap discipline, and tenure tracking via
`**Focus Since:**`. External research determined this is a re-invention without PM-tool precedent
and conflates concerns better handled by:

- **Existing State + Integration fields** for `awaiting-external`
  (`plan-agile-wu-lifecycle.md` + plan-session-operational-flow Phase 7 deliver these).
- **Sibling Work Unit(s) field + group-dir convention** for the relational concept "companion"
  was hinting at (`plan-work-organization-reform.md`).
- **Implicit worktree presence** for "primary" — the worktree the agent is currently in is the
  active focus.
- **Soft conventions in `strategy-concurrent-work.md`** for the underlying intuitions
  (single-thread attention, same-domain concurrents anti-pattern, swap discipline).

The cost saved: a new tracked field, validation rules around it, migration of existing in-flight
WUs, adopter education on net-new vocabulary. The cost paid: relying on agent judgment at
activation rather than field-encoded role. Research strongly supports the lighter posture.

### Async-merge audit scope: option B (additive)

[integrate-work-unit.md][integrate-wu] currently assumes synchronous merge. Three audit shapes:

- **A — Full rewrite of state transitions** to treat async-merge as a primary path alongside
  sync-merge. Cleanest end state; heaviest change.
- **B — Additive treatment at key touchpoints.** Sync-merge stays the primary flow;
  awaiting-review state gets explicit accommodation at session-handoff, status-file updates,
  worktree cleanup, and archival. Lighter; preserves existing workflow shape.
  **(Lean — formerly current lean in original Mobility plan; reaffirmed here.)**
- **C — Mixed.** Primary rewrite of integrate-work-unit.md plus additive treatment elsewhere.
  Scoped compromise.

PRD-time decision informed by audit findings.

### `strategy-concurrent-work.md` as new strategy doc

Evaluated extending `strategy-team-coordination.md` with a same-dev section. Rejected — putting
same-human concurrency under "team coordination" is structurally misleading. New doc is cleaner;
the two strategies reference each other where overlap exists (branching patterns, status-file
merge behavior).

### ROADMAP parallelism is conventions-side, not infrastructure-side

The visualization gap (sequential layout claiming "parallelizable") is a documentation/conventions
concern, not a tooling concern. Adopting better visualization patterns is a strategy-doc + ROADMAP-
template change, not a CLI/lint addition. Research-informed redesign at PRD time.

---

## Dependencies and Sequencing

### Upstream

- **Work Organization Reform:** delivers Conventional Branch alignment, per-worktree
  isolation foundation, group-dir convention, the consolidated boundary workflows, and the
  `**Sibling Work Unit(s):**` field convention. Concurrent-work conventions and async-merge
  audit compose on top. Hard upstream dependency.
- **Worktree Foundation** (`plan-worktree-foundation.md`): mechanism layer — worktrees, shift,
  branch-gone detection, pause-pointer migration. The activation-time concurrency check fires
  from Worktree Foundation's spawn workflow per the strategy doc's heuristics.
- **Agile WU Lifecycle** (`plan-agile-wu-lifecycle.md`): tier model + `**State:**` and
  `**Integration:**` field rollout. Concurrent-work conventions consume those fields for
  awaiting-review accommodation. Async-merge audit interacts with tier-aware archival flows.
- **User Sync UX Polish** (`prd-user-sync-ux.md`): clean sync state machine before
  worktree-axis-plus-concurrent-work conventions land on it.
- **Session-Operational Flow Phases 3/5/6:** configurable autonomy modes — reduce approval
  ceremony under multi-session load. Async-merge integration-surface audit was originally
  captured here per ADR-016 discussion; remains in this WU's scope.

### Downstream

- **ARCd Rebrand:** stable concurrent-work terminology absorbed into rename pass.
- **ARC Operating Modes:** consumes shift lifecycle (delivered by `plan-worktree-foundation.md`)
  as prerequisite; concurrent-work conventions inform mode-specific guidance.

### Recommended sequencing

Work Organization Reform → `plan-worktree-foundation.md` → `plan-agile-wu-lifecycle.md` →
**Concurrent Work Conventions**.

---

## Pressure Points and Risks

### SESSION-NOTES divergence per worktree (resolved upstream)

`plan-worktree-foundation.md` resolves this by establishing per-worktree SESSION-NOTES semantics.
This WU's conventions consume that resolution; no new pressure here.

### Team-mode relationship clarity

Concurrent-work conventions and team mode overlap in concepts but not conventions. PRD must state
the relationship unambiguously to prevent adopter confusion ("do I enable team mode for solo
worktree use?"). Recommended framing: team mode is multi-human; concurrent-work conventions are
multi-WU-single-human; both can coexist; neither requires the other.

### Async-merge scope boundary

[integrate-work-unit.md][integrate-wu] is shared with `plan-agile-wu-lifecycle.md` (which adds
tier-aware branches). Coordination required: async-merge audit lands additive accommodation atop
the tier-aware flow, not via independent rewrite. PRD-time sequencing care.

### ROADMAP visualization research

Visualization patterns for parallel work streams have multiple competing forms (DAG, swimlane,
Gantt-like, dependency-only). Picking one without understanding adopter context (small team vs
large, solo vs team-mode, arc-in-git vs external pm.mode) risks shipping a format that doesn't
serve actual usage. Research informs choice; rushing risks rework.

### Activation-check judgment quality

The activation-time concurrency check relies on agent judgment from reading in-flight status
files. Quality depends on (a) adequate scope description in `**Purpose:**` / Spec content,
(b) the agent reading them carefully, and (c) the agent surfacing concerns rather than rubber-
stamping. Mitigation: strategy doc provides concrete heuristics with worked examples; the check
is advisory not gating, so false negatives still let work proceed and surface at integration.

---

## Open Questions

### Parallel-WU ROADMAP format

Current: single "In Progress" / inline status markers. Proposed: research-informed redesign. What
does the exact format look like? Per-tier swimlanes? DAG? Mermaid graphs? Inline annotations?
Format decision pending research.

### ROADMAP visualization scope

Visualization gap exists across multiple planning docs (ROADMAP, plan-* docs, strategy docs).
Should this WU's redesign extend beyond ROADMAP, or scope to ROADMAP only with follow-on for
other docs? PRD decision after research.

### Cohort / wave grouping as first-class structure

The current ROADMAP shows parallel WUs at the same dependency depth (e.g., Worktree Foundation ‖
User Sync UX Polish ‖ Coord Probe as the first wave after Session-Operational Flow). The cohort
relationship is implicit — derivable from the upstream/downstream graph as "WUs at the same depth
with no inter-dependencies." Work Organization Reform's group-dir convention partially
addresses this for codified groups in `backlog/`. Question: does explicit cohort/wave metadata
(beyond WOR's group-dir) add value beyond what the graph already encodes?

Industry precedent surveyed during agile/mobility design discussion 2026-04-28: Jira/Linear epics
(too hierarchical), GitHub milestones (time-boxed not parallel), agile-program tracks/streams
(closest match for parallel-cohort grouping). Light option: optional `**Cohort:**` or `**Wave:**`
field on status/plan files (free-form value); enables tooling to enumerate cohort members for
ROADMAP visualization, status reporting, and shared-deadline tracking. Heavy option: structural
cohort entity in pm.layer with member lists, dependencies, and shared lifecycle workflows.

The case for explicit cohorts strengthens significantly if cohorts gain **shared lifecycle events**
(single PR for the whole wave; coordinated rollout; shared verification step). Today they don't —
each WU has independent integration/archive. If the ROADMAP-visualization research surfaces a
real need for cohort-level operations or reporting, the field addition is the right weight; if
not, graph-derived cohorts (no metadata) plus WOR group dirs suffice. PRD-time decision after
research informs the question.

### Hook symmetry

`post-task-completion`, `post-work-unit-activate`, `post-work-unit-archive` exist in
`arc-extensions`. Should this WU add `post-shift-pause` / `post-shift-resume` / `post-shift-rotate`
hooks? Reasonable by symmetry, but no clear current need. Probably out of scope for this WU,
deferred to a later hooks-completeness pass — but flagged here for explicit PRD decision.

---

## Scope Estimate

**Medium-Small.** Conventions-layer work is doc-heavy — strategy doc creation, async-merge audit,
state-field semantics coordination. Lighter than the pre-redesign shape (focus-role model design
phase removed). Less mechanism-heavy than `plan-worktree-foundation.md` or
`plan-agile-wu-lifecycle.md`.

Phases (provisional):

1. **Strategy doc creation** — `strategy-concurrent-work.md` covering all the sub-sections listed
   in scope item 1. Substantial doc; consolidates findings from four research files.
2. **Async-merge integration audit** — option B implementation; identify and additive-treat each
   touchpoint in integration-adjacent workflows. Coordinate with `plan-agile-wu-lifecycle.md`'s
   tier-aware archival flow.
3. **State + Integration field semantics** — coordinate with `plan-agile-wu-lifecycle.md` so the
   `**State:** Complete + **Integration:** Awaiting Review` combination cleanly expresses
   awaiting-review across handoff, archival, and worktree cleanup workflows.
4. **Documentation cascade** — ensure references and examples align (strategy cross-references;
   ROADMAP examples; template-status notes if needed).

Phase 1 carries most of the weight. Phases 2-4 are mostly independent of Phase 1; can ship in any
order once Phase 1 lands.

---

## Philosophy Checkpoints

The PRD should explicitly address:

- **P2 (Co-Development):** Conventions preserve the mandatory review stop at task completion
  within each WU. Parallelism is between WUs, not within. The single-human-as-continuity-thread
  principle is maintained by the soft single-active-focus convention (one worktree as the
  agent's active focus at any moment).
- **P5 (Context Preservation):** Conventions improve context preservation — worktree-local
  SESSION-NOTES (mechanism via `plan-worktree-foundation.md`) is correct WU-scoped context, not
  degradation. Activation-time concurrency check surfaces "what was I doing before" via in-flight
  WU enumeration.
- **P7 (Discrete Steps):** One task at a time stays within-WU, not cross-WU. Soft swap discipline
  (transitioning between active worktrees at review-increment boundaries) protects this principle
  under concurrent usage.
- **Honest stance on concurrent sessions:** Framework won't block; docs flag as bandwidth
  violation at heavy concurrency. Consistent with ARC's pattern of encouraging principled usage
  without enforcing technically.

---

[adr-016]: ../../reference/adr/adr-016-configurable-autonomy-interlocks-for-session-operations.md
[team-coord]: ../../reference/strategies/arc/strategy-team-coordination.md
[integrate-wu]: ../../system/workflows/arc/work-unit-lifecycle/integrate-work-unit.md
