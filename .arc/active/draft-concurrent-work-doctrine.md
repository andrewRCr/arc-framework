# Draft: Concurrent Work Doctrine

- **Cohort:** `agile-parallelism/concurrent-work-conventions`
- **Origin:** [internal] — the conventions/doctrine half of the decomposed Concurrent Work Conventions concern
  (`agile-parallelism/concurrent-work-conventions` sub-cohort). The spine the three mechanism/model members
  reference.
- **Purpose:** Ship `strategy-concurrent-work.md` — the canonical home for principled multi-WU work conventions:
  the unified advisory overlap-judgment doctrine (both trigger surfaces), the parallelize-vs-serialize rubric, the
  branch/rebase and append-only-until-integration discipline, merge-ordering and async-merge guidance, worktree
  operational guidance, anti-patterns, and the main-worktree-under-full-protection convention. This is **doctrine,
  not mechanism** — it codifies what teams do implicitly when concurrent work goes well, as judgment-driven
  conventions that honor ARC's attention-discipline principles. The design target is **any team size**; solo is
  the degenerate case, never the target.

---

## Problem / Motivation

Worktree Foundation shipped the *mechanism* for parallel work — worktrees, session-init worktree-awareness,
branch-gone detection — and Errand Enablement + In-Flight Awareness shipped the isolation and activation-check
substrate. The tier model lives in the agile cohort. But mechanism alone leaves the **patterns of multi-WU
usage** unaddressed:

- When are concurrent WUs appropriate vs. counterproductive?
- How does an agent assess whether a new WU is safe to parallelize against in-flight WUs?
- What rebase / merge discipline keeps concurrent branches integrable without late-stage drama?
- How do shipped-but-awaiting-review WUs compose with active in-flight WUs?
- What conventions distinguish "principled concurrent work" from "fragmented attention with predictable quality
  degradation"?

Without conventions, mechanism encourages chaos. This member ships the conventions layer; the merge-safety and
lifecycle mechanism that makes concurrent work safe in practice ships in the sibling members
(`merge-safety-mechanism`, `async-merge-lifecycle`) and the single-owner model in `single-owner-wu-model`.

### Parallel WU support is conventions-bound, not just mechanism-bound

`strategy-team-coordination.md` documents that parallel work units on independent branches are structurally
supported — "different files, different branches, different task lists… the dominant pattern for parallel solo
work on independent concerns." The phrase "parallel solo work" is doing heavy lifting. With Worktree Foundation
shipped the mechanism exists, but there is no guidance for *when* same-dev parallel WUs make sense, no
activation-time protocol for assessing scope overlap, no rebase/merge discipline for concurrent branches, and no
strategy doc addressing solo concurrent work (team-coord assumes different identities). ARC has the mechanics but
not the model. This member elevates the capability to first-class: intentional conventions, documented patterns,
judgment-based protocols.

### Why this matters beyond personal ergonomics

Concurrent agent sessions, worktree-based pivots, and long-running work-in-flight are realistic patterns in
modern dev practice. An adopter evaluating ARC against its current state sees a framework that implicitly assumes
linear single-WU progression. Shipping first-class conventions matches how developers actually work, makes the
"awaiting review" scenario (days to a week of latency) a supported pattern rather than an awkward gap, and
extends ARC's attention-discipline principles into the multi-WU regime with guardrails instead of ceding the
ground entirely.

### ARC's concurrency model — parallel sessions, not in-session juggling

ARC's concurrency model is **parallel sessions, one WU per session, with shift as the in-session escape hatch for
short detours.** Multi-WU work means multiple sessions, each scoped to one WU/worktree/branch with isolated
SESSION-NOTES; sessions don't interact internally except at boundaries (spawning new WUs, sweep ceremonies,
planning). Implications for the doctrine:

- "Developers pivot between WUs" means alt-tab between separate sessions, not in-session WU switching. The
  in-session worktree pivot remains available for the niche short-detour case but is not the dominant pattern.
- Single-active-focus is implicit in worktree presence — the worktree the agent is currently in is the active
  focus. No field needed.
- Transitions between active worktrees happen at review-increment boundaries (the same task-interlock invariance
  ADR-016 establishes for in-WU work).

### Why no formal focus-role model

The plan's earlier shape proposed a `**Focus Role:**` meta-file field with values
`primary | companion | awaiting-external | parked`, blessed pairings, swap discipline, and per-WU tenure
tracking. External research (2026-05-08) found no PM-tool precedent — every tool surveyed (Linear, Jira, GitHub
Projects, Shortcut, Notion, Asana, Trello, Height) models active work via Status enum + Assignee, not role
annotation. The 2026-05-12 worktree-tool convergence pass reinforces from a second direction: no agent-workspace
tool (Conductor, emdash, Maestro, Warp, Worktrunk, Zed, Super, Superset, T3code, Soloterm, Nora) models focus
role either. The underlying *concepts* (single-thread attention, single-active-focus, awaiting-review as a
distinct state) are evidence-aligned across Kanban, Deep Work, GTD literature — but expressing them as a separate
field invents net-new vocabulary adopters won't recognize.

The lighter posture: rely on agent judgment + protocols, not field-encoded roles.

- **"Primary"** maps to the implicit signal: which worktree is the agent currently in? No field needed.
- **"Awaiting-external"** maps to `**State:** Integrating` (WOR's 4-state machine, merge-position folded in).
- **"Companion"** conflated runtime focus with backlog grouping — covered by WOR's group-dir convention + the
  `**Sibling Work Unit(s):**` concern (now the derived cohort membership). No runtime equivalent needed.
- **"Parked"** maps to GTD's Someday/Maybe — soft convention guidance, not field-encoded.

The anti-pattern intuitions (single-thread attention, same-domain concurrents) survive as soft guidance in
`strategy-concurrent-work.md`, framed as conventions adopters apply by judgment, not field validations a tool
enforces. (Full rejection rationale and the cost ledger are recorded below in § Focus-role model rejected.)

### Relationship to the interlock model frame

ADR-016 establishes configurable autonomy interlocks for session-operational flow. This doctrine consumes the
frame as an enabler — configurable autonomy modes reduce approval ceremony under multi-session load, which is
exactly the ergonomic gap multi-worktree introduces. With configurable autonomy in place, modest concurrency
(2–3 sessions) becomes principled rather than tolerated. **PRD-time question:** does the strategy doc present the
posture as "tolerated" or "principled at modest scale"?

---

## Deliverable — `strategy-concurrent-work.md`

A new strategy doc, **sibling** to `strategy-team-coordination.md`, not extending it. Same-identity concurrency is
structurally different from multi-developer coordination; putting same-human concurrency under "team coordination"
is structurally misleading. The two strategies reference each other where overlap exists (branching patterns,
meta-file merge behavior). Coverage:

- **Worktree-by-default rationale and trade-offs.** Why ARC departs from solo-developer norm (multi-agent
  isolation as primary justification, frictionless parallelism later); discovery and cleanup discipline; risks
  (worktree accumulation, "which worktree am I in" confusion).

- **When to parallelize vs. serialize.** Decision rubric — independent WUs (disjoint files / modules) →
  parallel-merge OK; high-overlap WUs (shared module, semantically related code) → serialize; `Novel` WUs (the
  higher derivation threshold) count as plate-dominating work even when file overlap is low, so the rubric treats
  "one novel stream + ordinary heavy/light work" differently from two concurrent novel streams. Concrete examples
  per `research-integration-conflict-handling.md` plus the `Class` model's worklist-balance rule. `Novel` is the
  "roughly one genuinely-novel stream" signal for plate balancing — consumed as sequencing guidance, not a
  renderer field or activation gate.

- **Activation-time concurrency check — doctrine over the shipped check.** In-Flight Awareness already ships the
  *mechanism*: an oracle-backed activation check consulted at spawn / cold-start / materialize / errand-launch
  (advisory, never blocks). This member adds **doctrine, not tooling** — the unified advisory overlap-judgment
  rubric plus thin pointers at those already-built fire-sites so the agent consults it. The rubric: disjoint
  domain → proceed; shared module / strategy / load-bearing infra → flag + consider sequencing; foreign-owned
  overlap → coordinate — with worked examples and the **self/foreign asymmetry** (single-owner WUs make this the
  entire "all-owner" addition: self-overlap reorder freely, foreign-overlap coordinate). Explicitly a heads-up —
  the behind-base detector is the real net. **One doctrine, two trigger surfaces** (WU-activation and
  `errand-launch`); the Errand floor is Errand Enablement's advisory foreign-artifact gate, which this doctrine
  extends to entry-level writes, not just file-level. No overlap-probe tooling — the research rejects automated
  overlap prediction (O(n²), false-positive-prone, non-idiomatic), not soft rubrics. Start-side rigor is
  **inversely coupled** to integration-end robustness: because the behind-base detector surfaces drift
  continuously at every resume, the start-side check stays a light nudge, never a heavyweight conflict-eval
  subagent.

- **Branch and rebase discipline.** Periodic-rebase-onto-main vs. end-of-flight rebase trade-off (lifetime
  threshold ~2 days per industry research); rerere setup for periodic-rebase teams; "Update branch" workflows;
  merge vs. rebase choice with review consequences.

- **Append-only-until-integration — cross-machine branch safety.** A pushed WU branch is the cross-machine sync
  substrate, so it is **append-only until integration**. Mid-flight (activation → integration) only add commits
  and fast-forward-push; never rebase/amend already-pushed commits. Default: don't bring `main` into the WU branch
  mid-flight at all — defer reconciliation to one terminal step; if a `main`-side change is genuinely needed
  mid-flight, **merge** `main` in (ancestry-preserving, ff-able everywhere) rather than rebase onto it.
  Integration is the single sanctioned rewrite point (rebase-onto-`main` / squash is fine there — the WU is done,
  no other machine resumes it). The rule is not "never rebase" but "never rewrite a branch still serving as a live
  multi-machine sync target"; cross-machine resume is always `pull --ff-only` (or `arc sync`). Worktrees are
  *enabling hygiene, not the guarantee* — a per-WU worktree removes the *occasion* for a mid-flight rebase but
  cannot *prevent* a rebase + force-push; convention + worktrees together are what make it robust. Grounded in a
  live 2026-06-10 incident (a laptop-scaffolded branch rebased + force-pushed from the primary, orphaning the
  laptop's pre-rebase tip; recovered losslessly via `reset --hard origin/<branch>`). This doctrine **owns the
  convention**; `merge-safety-mechanism` owns the detection backstop (patch-equal supersession downgrade + reset
  offer).

- **Merge ordering between concurrent WUs.** First-in-wins vs. explicit serialization; PR-label conventions for
  "merge after #X"; merge-queue interaction (Mergify, GitHub merge queue). Errand (`chore/`) branches are mini-PRs
  that ride the same ordering discipline.

- **Worktree operational guidance.** Performing merges from main (or a dedicated merge) worktree; refetching /
  rebasing other worktrees post-merge; using `git worktree remove` instead of `rm -rf`; stale-reference recovery;
  cross-worktree state after rebase; sync-all-worktrees recommendation. **Tool composition:** when an external
  worktree-management tool spawns worktrees (Conductor, emdash, Maestro, Warp, Worktrunk, Zed, etc.), it typically
  owns cleanup, branch naming, and location conventions per its own UX. Coexistence: honor the tool's branch
  naming (advisory under ARC's branch-naming method); defer cleanup to the tool when it provides it; do not
  relocate tool-managed worktrees. ARC's structural discipline (meta-* lifecycle, state machine, sweep-as-you-go
  integration) applies uniformly regardless of who spawned the worktree.

- **When to abandon parallelism.** Heuristics: conflict-resolution time exceeding ~30% of parallelism savings;
  rebase count exceeding ~3 due to upstream churn; semantic drift between branches. Recovery: merge one branch,
  abandon the other, redo as a unified WU.

- **Async-merge guidance.** Managing WUs through awaiting-review latency (days to a week); how `**State:**
  Integrating` interacts with session-handoff, archival, and worktree cleanup; soft conventions for the
  post-PR-pre-merge state. (The lifecycle *mechanism* for this is `async-merge-lifecycle`'s; this doctrine carries
  the conventions an operator reads.)

- **Soft anti-pattern guidance.** Single-thread attention (only one active focus at a time); avoiding same-domain
  concurrents (attention-residue research); review-increment-boundary discipline when transitioning between WUs.
  **Explicit calibration against agentic worktree-tool idiom:** the surveyed tool ecosystem optimizes for many
  simultaneous sessions, fast spawn, less per-WU review — the opposite posture from ARC's. Adopters composing ARC
  with such a tool hold two postures in tension by design; surface this so they consciously pick which frame
  dominates per session rather than letting the disciplines conflict silently. Judgment guidance, not enforced
  rules.

- **Main-worktree-under-full-protection convention.** "Your main worktree is not always on main" — under
  `branch.protection: full`, the main worktree specializes for admin / coordination work (planning branches,
  archive branches, cross-WU backlog edits) while WU worktrees handle feature work.

- **Relationship to team mode.** Concurrent-work conventions and team mode are **orthogonal axes** — team mode
  governs cross-identity coordination (multiple humans); concurrent-work conventions govern multi-WU concurrency
  mechanics (parallelize-vs-serialize, rebase/merge discipline, async-merge), which apply per-WU whether the other
  in-flight WUs are yours or a teammate's (each WU is single-owner regardless). Both can coexist; neither requires
  the other. State the relationship unambiguously to prevent adopter confusion ("do I enable team mode to run
  multiple WUs?").

---

## Design Decisions carried into the spec

### Start-side concurrency check: doctrine over a shipped mechanism

The activation-time "safe to start?" check is **doctrine, not new tooling.** In-Flight Awareness ships the
oracle-backed check; this member adds one unified *advisory overlap-judgment doctrine* governing both WU-activation
and `errand-launch` (one oracle-backed check, two trigger surfaces) plus thin pointers at the built fire-sites: a
light codified rubric (disjoint → proceed; shared module/strategy/load-bearing infra → flag; foreign-owned →
coordinate) with worked examples; the self/foreign asymmetry (single-owner WUs make this the *entire* "all-owner"
addition); an explicit "this is a heads-up; the behind-base detector is the real net" weight statement; and
`Class`-aware plate-balance awareness (the doctrine here; the single advisory session-init annotation line is
`async-merge-lifecycle`'s surface — awareness-only, never paternalistic).

### Shared-file concurrency — derived vs. mutated (ADR-020), the convention side

ADR-020 splits the in-git concurrency problem; this member owns codifying the **conventions** (the *mechanism*
coverage rides `merge-safety-mechanism`):

- **Derived shared state (ROADMAP) is solvable in-git** — a pure projection over branch-isolated `meta-*` files;
  deterministic regeneration at a single serialization point (post-merge on the integration branch, not hand-edited
  on feature branches) makes it conflict-free. This is the conventions-side fix for the ROADMAP-parallelism gap.
- **Mutated shared state (inbox drains, human-editable priority/ordering) is not solvable in-git** — git's
  line-merge is not a CRDT, so this is `draft-arc-backend.md` territory (canonical mutable store).
- **`merge=union` via `.gitattributes`** makes concurrent inbox *appends* auto-merge but loses intentional
  deletions (a drained entry can resurrect) — an append-safety aid, not a drain-safe solution; document the caveat
  if adopted.
- **Shared-mutable planning state (`cohort-{name}.md`) rides per-member partition + the behind-base net.** The
  cohort doc is the one shared-mutable planning artifact — the deliberate exception to per-worktree isolation —
  riding plain git line-merge, so its per-member partition keeps concurrent edits safe (**partition-first** is the
  lean). Escape hatch if partition proves insufficient: route `cohort-{name}.md` edits as errands through the
  primary worktree (serialized via `main`). Two seams to record: the Errand matrix's advisory "owning-WU-in-flight"
  gate keys on a *single* owning WU, so it is ill-defined for a cohort-owned doc — the behind-base detector
  (`merge-safety-mechanism`) is the net that applies.

### ROADMAP parallelism is conventions-side, not infrastructure-side

The visualization gap (sequential layout claiming "parallelizable") is a documentation/conventions concern, not a
tooling one. WOR reshaped `backlog/ROADMAP.md` into a fully-derived readiness view and explicitly deferred
**parallel-safety** here — "which Ready WUs are concurrency-safe with what's in flight." Open for the spec: is it
reliably deterministic at all? Meta files don't declare file-scope/domain, predicted paths ≠ actual, cognitive
load is judgment; industry leans on conventions + pick-time accounting (WIP limits, swimlane/value-stream
partitioning, module ownership) over a computed "safe-to-parallelize." Likely an **on-contact convention, not a
rendered field.** Hard constraint from WOR: if a parallel view is ever hand-curated, it is a **sibling** artifact;
the derived ROADMAP stays hand-maintenance-free. (The renderer + the "roadmap" rename/semantics live in
`roadmap-tooling`; this member contributes only the concurrency-safety overlay on the "Next" slice.)

### Sibling relationship to team mode, not inheritance

Concurrent usage could theoretically reuse team-mode conventions (`(@name)` markers, `user.sync_push: prompt`).
Rejected — these are team-specific (cross-identity coordination), not concurrency-specific (multiple WUs, each
single-owner). Concurrent-work users can enable team mode independently; the patterns are structurally distinct.

### Focus-role model rejected (2026-05-08 redesign)

The earlier shape proposed a `**Focus Role:**` field with `primary | companion | awaiting-external | parked`,
blessed pairings, swap discipline, and tenure tracking via `**Focus Since:**`. External research determined this
is a re-invention without PM-tool precedent, conflating concerns better handled by WOR's `Integrating` state
(awaiting-external), derived cohort membership + the relational "companion" concept, implicit worktree presence
(primary), and soft conventions (the underlying intuitions). **Cost saved:** a new tracked field, validation
rules, migration of in-flight WUs, adopter education on net-new vocabulary. **Cost paid:** relying on agent
judgment at activation rather than field-encoded role. Research strongly supports the lighter posture.

---

## Pressure Points and Risks

### Team-mode relationship clarity

The PRD must state the relationship unambiguously to prevent adopter confusion. Recommended framing: orthogonal
axes — team mode = cross-identity coordination; concurrent-work conventions = multi-WU concurrency mechanics,
per-WU regardless of whose other WUs are in flight (each is single-owner). Both can coexist; neither requires the
other.

### ROADMAP visualization research

Visualization patterns for parallel work streams have multiple competing forms (DAG, swimlane, Gantt-like,
dependency-only). Picking one without understanding adopter context (small team vs. large, solo vs. team-mode,
arc-in-git vs. external pm.mode) risks shipping a format that doesn't serve actual usage. Research informs choice;
rushing risks rework.

### Activation-check judgment quality

The activation-time concurrency check relies on agent judgment from reading in-flight status files. Quality
depends on (a) adequate scope description in `**Purpose:**` / spec content, (b) the agent reading carefully, and
(c) the agent surfacing concerns rather than rubber-stamping. Mitigation: concrete heuristics with worked
examples; the check is advisory not gating, so false negatives still let work proceed and surface at integration.

### Tool-ecosystem composition friction

Adopters composing ARC with an agentic worktree-management tool hold two postures in tension by design — ARC
optimizes for fewer, deeper, more-reviewed concurrent WUs; the tools optimize for many, faster, less-reviewed.
The friction surfaces when adopters apply tool-native cadence (10+ simultaneous sessions, minimal per-WU review)
to ARC-managed work and find ARC's per-task interlock and planning artifacts heavy — or apply ARC's cadence to
tool-managed work and underutilize the tool's parallelism. **PRD-time question:** does ARC ship onboarding
guidance for this composition ("composing ARC with [tool]: make the disciplines reinforce rather than fight")?
Lean: light onboarding guidance covering "pick which frame dominates per session," without deep per-tool
integration docs.

---

## Philosophy Checkpoints

The spec should explicitly address:

- **P2 (Co-Development):** Conventions preserve the mandatory review stop at task completion within each WU.
  Parallelism is between WUs, not within. The single-owner-as-continuity-thread principle (one DRI per WU) is
  maintained by the soft single-active-focus convention (one worktree as the agent's active focus at any moment).
- **P5 (Context Preservation):** Conventions improve context preservation — worktree-local SESSION-NOTES is
  correct WU-scoped context, not degradation. The activation-time concurrency check surfaces "what was I doing
  before" via in-flight WU enumeration.
- **P7 (Discrete Steps):** One task at a time stays within-WU, not cross-WU. Soft swap discipline (transitioning
  between active worktrees at review-increment boundaries) protects this under concurrent usage.
- **Honest stance on concurrent sessions:** the framework won't block two simultaneous agent sessions in
  different worktrees, but documentation is explicit that heavy concurrency potentially violates P2
  (co-development bandwidth). Adopter's call, not ARC's recommendation — consistent with ARC's pattern of
  encouraging principled usage without enforcing technically.

---

## External Research Citations

The deliverable **consolidates the four research files** into `strategy-concurrent-work.md`'s evidence base. The
2026-05-08 redesign drew on `research-focus-wip-attention-discipline.md`,
`research-active-work-coordination-vocabulary.md`, `research-concurrent-work-mechanism-layer.md`, and
`research-integration-conflict-handling.md`.

### Worktree-management tool landscape (2026-05-12)

`research-worktree-tool-convergence.md` — a convergence pass across 11 agentic worktree-management tools
(Cluster 1: Zed, Warp, Worktrunk; Cluster 2: Conductor, emdash, Maestro; Cluster 3: Super, Superset, T3code,
Soloterm, Nora). Substantive findings shaping the doctrine: every surveyed tool optimizes for many simultaneous
sessions, fast spawn, minimal per-WU review (§ 3.3, § 6.4) — the opposite posture from ARC's; no tool models
focus role as a discipline annotation (§ 5.2), confirming the focus-role rejection from a second direction; tool
ecosystem and ARC compose by sitting on the same git-worktree substrate (§ 3.1) with no extension-point
integration (§ 4.3). Per-tool reports and source URLs in the research doc.

---

## Scope Estimate

**Large — doc-dominant.** The bulk is `strategy-concurrent-work.md` (conventions + the unified overlap-judgment
doctrine + async-merge guidance + reconcile discipline + anti-patterns + main-worktree convention), consolidating
the four research files. Carries most of the sub-cohort's weight. The spine the other three members reference.

### Dependencies

- **Internal:** none (the spine).
- **Substrate (shipped):** Work Organization Reform (Conventional Branch alignment, per-worktree isolation,
  group-dir convention, the `Integrating` state), Worktree Foundation (the worktree mechanism), Errand Enablement
  (the `errand-launch` primitive + Errand decision matrix + advisory foreign-artifact gate floor this doctrine
  extends), In-Flight Awareness (the oracle-backed activation check this doctrine wraps with rubric), and
  `class-model-foundation` (the `Class` plate-balance input). All shipped.
- **Soft prerequisite:** `out-of-wu-entry` (ships ahead) — mid-WU errand/housekeep entry, which the in-session-fork
  matrix and the all-owner gate at `errand-launch` assume already works.
