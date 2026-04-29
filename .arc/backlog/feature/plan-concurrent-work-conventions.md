# Plan: Concurrent Work Conventions

**Purpose:** Codify the conventions layer for principled multi-WU work — focus-role model, blessed
pairings, swap discipline, async-merge integration accommodation, and `strategy-concurrent-work.md`
as the canonical home for same-identity concurrent usage. Composes with [Worktree Foundation][wf]
(mechanism) and [Agile WU Lifecycle][awl] (tier model) to deliver "agile, principled, multi-WU work."

- **State:** Draft — pre-PRD exploration captured. Renamed from former Work-Unit Mobility WU as part
  of the agile/mobility split (mechanism → Worktree Foundation; tier model → Agile WU Lifecycle;
  conventions → this WU). Iteration expected before PRD promotion.

- **Created:** 2026-04-17 (originally as Work-Unit Mobility); split and renamed 2026-04-28.

- **Origin:** Surfaced during a pre-PRD exploratory session on the Session-Init Optimization
  planning branch as the conventions layer of mobility. Carved out from the original Work-Unit
  Mobility plan during the agile/mobility design discussion when three-layer scope (mechanism +
  conventions + agile lifecycle) proved too large for one WU. Mechanism extracted to [Worktree
  Foundation][wf]; agile-lifecycle scope newly identified and split to [Agile WU Lifecycle][awl];
  this WU retains the conventions layer.

---

## Problem / Motivation

[Worktree Foundation][wf] ships the mechanism for parallel work — worktrees, shift, session-init
worktree-awareness, branch-gone detection. [Agile WU Lifecycle][awl] ships the tier model for
fast WU spin-up. But mechanism and tier model alone leave the **patterns of multi-WU usage**
unaddressed:

- When are concurrent WUs appropriate vs counterproductive?
- Which WU is "primary" at any moment, and how does that change?
- How do shipped-but-awaiting-review WUs compose with active in-flight WUs?
- What conventions distinguish "principled concurrent solo work" from "fragmented attention with
  predictable quality degradation"?
- How does the `awaiting-external` (PR shipped, awaiting merge) state compose with session-handoff,
  archival, and worktree cleanup workflows that currently assume synchronous merge?

Without conventions, mechanism encourages chaos. The conventions layer codifies what adopters
already do implicitly when concurrent work goes well, with guardrails that honor ARC's attention-
discipline principles.

### Parallel WU support is conventions-bound, not just mechanism-bound

[strategy-team-coordination.md][team-coord] L276-281 documents that parallel work units on
independent branches are structurally supported:

> Parallel work units on independent branches... The work units don't coordinate at all at the
> status-file layer: different files, different branches, different task lists.
> **This is the dominant pattern for parallel solo work on independent concerns.**

The phrase "parallel solo work" is doing heavy lifting. With Worktree Foundation shipped, the
mechanism exists. But there is no:

- Guidance for when same-dev parallel WUs make sense
- Convention for which WU is primary vs companion vs parked
- Acknowledgment that same-dev concurrent sessions are a pattern worth supporting
- Strategy doc addressing solo concurrent work (team-coord assumes different identities)

ARC has the mechanics but not the model. This WU elevates the capability to first-class:
intentional conventions, documented patterns, guardrails that honor ARC's attention-discipline
principles while recognizing that developers pivot between WUs in practice.

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

Per [plan-session-operational-flow][plan-ops] § Concurrency Model: ARC's concurrency model is
**parallel sessions, one WU per session, with shift as the in-session escape hatch for short
detours.** Multi-WU work means multiple sessions, each scoped to one WU/worktree/branch with
isolated SESSION-NOTES; sessions don't interact internally except at boundaries (spawning new WUs,
sweep ceremonies, planning).

This framing has direct implications for conventions in this WU:

- "Developers pivot between WUs" means alt-tab between separate sessions, not in-session WU
  switching. The metadata-only shift remains available for the niche atomic-detour case (brief
  in-session pivots for atomic-tier work) but is not the dominant pattern.
- Focus-role declarations (primary/companion/awaiting-external/parked) annotate WUs *across*
  sessions; a session's role declaration changes when the developer deliberately re-annotates,
  not as a side-effect of mid-session shifts.
- Swap discipline ("swap primary ↔ companion only at review-increment boundaries") applies to
  the *role annotation change*, not to in-session WU swapping — the annotation change is a
  deliberate act in whichever session owns the affected WU.

---

## Relationship to Interlock Model Frame

[ADR-016][adr-016] establishes configurable autonomy interlocks for session-operational flow, with
[plan-session-operational-flow][plan-ops] implementing the core mechanics. This WU consumes the
frame as an enabler — configurable autonomy modes reduce approval ceremony under multi-session
load, which is exactly the ergonomic gap multi-worktree introduces.

**Touchpoints:**

- **Concurrent-session stance.** With configurable autonomy in place, modest concurrency (2-3
  sessions) becomes principled rather than tolerated — per-task approval ceremony reduces via auto-
  commit / auto-push toggles, making the bandwidth cost tractable. PRD should resolve whether the
  posture shifts from "tolerated" to "principled at modest scale" or stays unchanged.
- **Swap discipline alignment.** This plan's "swap primary ↔ companion only at review-increment
  boundaries" is exactly the task-interlock invariance ADR-016 establishes. They compose perfectly.
- **Status-file rotation for new fields.** New fields introduced by this plan (`**Focus Role:**`,
  `**Focus Since:**`) need rotation-vs-shape classification per ADR-016's status-file timing split.
  `Focus Role` is shape-changing (deliberate transition) → commit-time. `Focus Since` is rotation-
  flavored (date stamp) → handoff-time. PRD should confirm this classification.

---

## Scope

### In scope

1. **Focus-role model.** New convention layer:
    - New status file field: `**Focus Role:** primary | companion | awaiting-external | parked`
    - `**Focus Since:** <date>` for tenure tracking
    - ROADMAP annotation: "Active" section replaces "In Progress" with role annotations (when
      `pm.mode: arc-in-git`)
    - Blessed pairings documented (primary + awaiting-external; primary + companion; primary +
      parked[N])
    - Anti-patterns flagged (two primaries — prevented by singleton convention; two companions;
      same-domain concurrents)
    - Swap discipline: swap primary ↔ companion only at review-increment boundaries
    - Tier interaction: focus-role model applies to quick and standard tiers; atomic tier WUs are
      short-lived enough that focus designation is less meaningful (per [Agile WU Lifecycle][awl])

2. **`strategy-concurrent-work.md` (new strategy doc).** Sibling to
   [strategy-team-coordination.md][team-coord], not extending it. Same-identity concurrency is
   structurally different from multi-developer coordination. Covers:
    - Blessed pairings and swap discipline
    - Worktree pattern usage (composing with [Worktree Foundation][wf] mechanics)
    - Relationship to team mode
    - Main-worktree-under-full-protection framing ("your main worktree is not always on main")
    - When concurrent WUs make sense vs when they don't

3. **Integration-surface async-merge audit.** [integrate-work-unit.md][integrate-wu] and related
   lifecycle workflows currently assume synchronous merge (PR created → merged → cleanup in one
   flow). With `awaiting-external` as a first-class focus role, async-merge becomes a legitimate
   pattern requiring workflow accommodation. Audit sync-merge assumptions; adjust workflow state
   transitions and handoff interactions so WUs in `awaiting-external` state compose cleanly with
   session-handoff, archival, and worktree cleanup. Includes guidance in
   `strategy-concurrent-work.md` for managing WUs through async-merge latency.

4. **Main-worktree-under-full-protection convention.** Under `branch.protection: full`, nothing
   commits directly to `main` — archival, ROADMAP updates, and backlog edits all need their own
   branches and PRs. With worktrees in use, the main worktree's role specializes: WU worktrees
   handle feature work on their own branches; the main worktree becomes the administrative /
   coordination worktree (planning branches, archive branches, cross-WU backlog edits). Document
   this specialization explicitly in `strategy-concurrent-work.md` as "Your main worktree is not
   always on main."

5. **ROADMAP parallelism format.** Current ROADMAP shows sibling/parallel WUs in flat sequence with
   inline status markers, not as a true DAG with explicit parallel branches. Research-informed
   refresh: visualization patterns for parallel WU streams (DAG, swimlanes, dependency-only
   ordering, Mermaid graphs). Likely extends beyond ROADMAP to other planning docs that assume
   sequential WU progression. Surfaced 2026-04-28 during agile/mobility design discussion. Research
   pass at PRD time.

### Out of scope

- **Worktree mechanism, shift lifecycle, session-init worktree detection, branch-gone detection,
  inbox sync** — [Worktree Foundation][wf].
- **Tier model, `arc start` command, ceremony scaling, atomic-companion retirement, incidental
  category retirement** — [Agile WU Lifecycle][awl].
- **External tracker integration for "what's @teammate working on"** — [plan-coord-probe][
  plan-coord].
- **Blessing concurrent agent sessions.** Framework won't block two simultaneous agent sessions in
  different worktrees, but documentation is explicit: this potentially violates P2 (co-development
  bandwidth). Adopter's call, not ARC's recommendation.
- **Automated mode-fit detection.** Framework doesn't assess whether a project is "outgrowing"
  single-active discipline. Runtime detection rejected per arc-modes principle (upfront clarity, not
  runtime detection).
- **Cross-dev worktree coordination.** Team-mode territory. This WU focuses on same-identity
  concurrent usage.
- **Hooks at shift transitions (`post-shift-pause` etc.).** Hook symmetry deferred to a later
  hooks-completeness pass.

---

## Design Decisions

### Sibling relationship to team mode, not inheritance

Same-identity concurrent usage could theoretically reuse team-mode conventions (`(@name)` markers,
`user.sync_push: prompt`). Rejected — these are team-specific (multiple humans), not concurrency-
specific (multiple WUs, one human). Concurrent-work users can enable team mode independently if
they want team conventions, but concurrent-work patterns are structurally distinct.
`strategy-concurrent-work.md` (new) sits alongside `strategy-team-coordination.md`, not inside it.

### Focus roles in scope, not deferred

Focus roles could be a follow-on WU (mechanisms now, conventions later). Rejected — shipping
worktree parallelism without any ARC-principled guardrails leaves a values-vs-mechanisms gap. This
WU delivers the conventions that make the mechanism ARC-shaped. (The mechanism itself is [Worktree
Foundation][wf]'s scope; this WU layers conventions on top.)

### Async-merge audit scope: option B (additive)

[integrate-work-unit.md][integrate-wu] currently assumes synchronous merge. Three audit shapes:

- **A — Full rewrite of state transitions** to treat async-merge as a primary path alongside
  sync-merge. Cleanest end state; heaviest change.
- **B — Additive treatment at key touchpoints.** Sync-merge stays the primary flow;
  `awaiting-external` focus role gets explicit accommodation at session-handoff, status-file
  updates, worktree cleanup, and archival. Lighter; preserves existing workflow shape.
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

- **[Worktree Foundation][wf]:** mechanism layer — worktrees, shift, branch-gone detection,
  pause-pointer migration. This WU's conventions layer is built on top.
- **[Agile WU Lifecycle][awl]:** tier model. Focus-role model applies to quick and standard tiers;
  atomic tier WUs bypass focus designation. Async-merge audit interacts with tier-aware archival
  flows.
- **[plan-user-sync-ux][user-sync-ux]:** clean sync state machine before worktree-axis-plus-focus-
  role conventions land on it.
- **Session-Operational Flow Phases 3/5/6:** configurable autonomy modes — reduce approval
  ceremony under multi-session load. Async-merge integration-surface audit was originally captured
  here per ADR-016 discussion; remains in this WU's scope.

### Downstream

- **ARCd Rebrand:** stable concurrent-work terminology absorbed into rename pass.
- **ARC Operating Modes:** consumes shift lifecycle (delivered by [Worktree Foundation][wf]) as
  prerequisite; concurrent-work conventions inform mode-specific guidance.

### Recommended sequencing

[Worktree Foundation][wf] → [Agile WU Lifecycle][awl] → **Concurrent Work Conventions**.

---

## Pressure Points and Risks

### SESSION-NOTES divergence per worktree (resolved upstream)

[Worktree Foundation][wf] resolves this by establishing per-worktree SESSION-NOTES semantics. This
WU's conventions consume that resolution; no new pressure here.

### Team-mode relationship clarity

Concurrent-work conventions and team mode overlap in concepts but not conventions. PRD must state
the relationship unambiguously to prevent adopter confusion ("do I enable team mode for solo
worktree use?"). Recommended framing: team mode is multi-human; concurrent-work conventions are
multi-WU-single-human; both can coexist; neither requires the other.

### Async-merge scope boundary

[integrate-work-unit.md][integrate-wu] is shared with [Agile WU Lifecycle][awl] (which adds tier-
aware branches). Coordination required: async-merge audit lands additive accommodation atop the
tier-aware flow, not via independent rewrite. PRD-time sequencing care.

### ROADMAP visualization research

Visualization patterns for parallel work streams have multiple competing forms (DAG, swimlane,
Gantt-like, dependency-only). Picking one without understanding adopter context (small team vs
large, solo vs team-mode, arc-in-git vs external pm.mode) risks shipping a format that doesn't
serve actual usage. Research informs choice; rushing risks rework.

### Focus-role drift

Focus-role designation requires user discipline to maintain accuracy. A WU sitting at "primary" for
weeks without active work indicates either drifted designation or stalled work — both deserve
attention but for different reasons. Strategy doc should address the drift detection question
(manual review at handoff vs automated nudges).

---

## Open Questions

### How does ARC identify which WU is "primary"?

Candidates:

- User-declared (explicit `**Focus Role:** primary` in status file)
- Implicit (last WU shifted to)
- Per-worktree local state (each worktree designates its own primary)

Each has different implications for the tracked vs gitignored split and for cross-worktree
visibility. Status-file field is tracked and shared; local state is not. PRD decision.

### Focus-role transition mechanism

All role transitions via `/arc-shift`, or do some roles change via other mechanisms? E.g., does
`integrate-work-unit` flip a Waiting-For Review WU to `awaiting-external` automatically? Does
archival implicitly clear focus role? What's the interaction with the existing `**State:**` field
values?

### "Primary" tenure tracking value

The proposed `**Focus Since:** <date>` field tracks how long a WU has been primary. Is this actually
useful, or documentation-for-documentation's-sake? What does ARC do with the information? If
nothing, drop it.

### Parallel-WU ROADMAP format

Current: single "In Progress" / inline status markers. Proposed: research-informed redesign. What
does the exact format look like? Per-tier swimlanes? DAG? Mermaid graphs? Inline annotations? Format
decision pending research.

### ROADMAP visualization scope

Visualization gap exists across multiple planning docs (ROADMAP, plan-* docs, strategy docs). Should
this WU's redesign extend beyond ROADMAP, or scope to ROADMAP only with follow-on for other docs?
PRD decision after research.

### Cohort / wave grouping as first-class structure

The current ROADMAP shows parallel WUs at the same dependency depth (e.g., Worktree Foundation ‖
User Sync UX Polish ‖ Coord Probe as the first wave after Session-Operational Flow). The cohort
relationship is implicit — derivable from the upstream/downstream graph as "WUs at the same depth
with no inter-dependencies." Question: does explicit cohort/wave metadata add value beyond what the
graph already encodes?

Industry precedent surveyed during agile/mobility design discussion 2026-04-28: Jira/Linear epics
(too hierarchical), GitHub milestones (time-boxed not parallel), agile-program tracks/streams
(closest match for parallel-cohort grouping). Light option: optional `**Cohort:**` or `**Wave:**`
field on status/plan files (free-form value); enables tooling to enumerate cohort members for
ROADMAP visualization, status reporting, and shared-deadline tracking. Heavy option: structural
cohort entity in pm.layer with member lists, dependencies, and shared lifecycle workflows.

The case for explicit cohorts strengthens significantly if cohorts gain **shared lifecycle events**
(single PR for the whole wave; coordinated rollout; shared verification step). Today they don't —
each WU has independent integration/archive. If the ROADMAP-visualization research surfaces a real
need for cohort-level operations or reporting, the field addition is the right weight; if not,
graph-derived cohorts (no metadata) suffice. PRD-time decision after research informs the question.

### Hook symmetry

`post-task-completion`, `post-work-unit-activate`, `post-work-unit-archive` exist in
`arc-extensions`. Should this WU add `post-shift-pause` / `post-shift-resume` / `post-shift-rotate`
hooks? Reasonable by symmetry, but no clear current need. Probably out of scope for this WU,
deferred to a later hooks-completeness pass — but flagged here for explicit PRD decision.

---

## Scope Estimate

**Medium.** Conventions-layer work is doc-heavy — strategy doc creation, ROADMAP redesign,
template-status field additions, async-merge audit and additive workflow accommodation. Less
mechanism-heavy than [Worktree Foundation][wf] or [Agile WU Lifecycle][awl].

Phases (provisional):

1. **Focus-role model design** — status file field, role enum, blessed pairings, anti-patterns,
   swap discipline.
2. **Strategy doc creation** — `strategy-concurrent-work.md` covering all conventions.
3. **Async-merge integration audit** — option B implementation; identify and additive-treat each
   touchpoint in integration-adjacent workflows.
4. **ROADMAP visualization research and redesign** — research pass, format selection,
   implementation.
5. **Main-worktree convention documentation** — "your main worktree is not always on main"
   framing, integration with strategy-concurrent-work and strategy-work-organization.
6. **Documentation cascade and tests** — ensure all references and examples align with new
   conventions.

Phases 1-2 sequential (model precedes doc); 3 independent (workflow audit); 4 independent
(research); 5-6 closing.

---

## Philosophy Checkpoints

The PRD should explicitly address:

- **P2 (Co-Development):** Conventions preserve the mandatory review stop at task completion within
  each WU. Parallelism is between WUs, not within. The single-human-as-continuity-thread principle
  is maintained by the focus-role singleton (one primary at a time).
- **P5 (Context Preservation):** Conventions improve context preservation — worktree-local
  SESSION-NOTES (mechanism via [Worktree Foundation][wf]) is correct WU-scoped context, not
  degradation. Focus-role tracking surfaces "what was I doing before" more reliably than ad-hoc
  branch-switching.
- **P7 (Discrete Steps):** One task at a time stays within-WU, not cross-WU. Swap discipline (swap
  primary only at review-increment boundaries) protects this principle under concurrent usage.
- **Honest stance on concurrent sessions:** Framework won't block; docs flag as bandwidth violation
  at heavy concurrency. Consistent with ARC's pattern of encouraging principled usage without
  enforcing technically.

---

[adr-016]: ../../reference/adr/adr-016-configurable-autonomy-interlocks-for-session-operations.md
[plan-ops]: ../technical/plan-session-operational-flow.md
[wf]: ../technical/plan-worktree-foundation.md
[awl]: ../technical/plan-agile-wu-lifecycle.md
[plan-coord]: ../technical/plan-coord-probe.md
[user-sync-ux]: ../technical/plan-user-sync-ux.md
[team-coord]: ../../reference/strategies/arc/strategy-team-coordination.md
[integrate-wu]: ../../system/workflows/arc/work-unit-lifecycle/integrate-work-unit.md
