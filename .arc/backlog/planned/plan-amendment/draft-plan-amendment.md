# Draft: plan-amendment — a standardized mid-implementation amendment procedure

- **Origin:** [internal] — minted 2026-08-24 from a session-init discussion of recurring mid-implementation
  verification gaps, alongside the same-day regrounding of `plan-segmentation`.
- **Purpose:** Give ARC one structured, repeatable, efficient procedure for the moment implementation evidence
  shows the plan — tasks, spec depth, or the design itself — has a gap: pause, triage, settle, amend, propagate,
  resume. Composed from existing ARC mechanism rather than new machinery; the detour should be cheap enough that
  nobody hand-rolls procedure ad hoc, and bounded enough that it never re-runs the original planning workflows.

---

## Problem / Motivation

Mid-implementation plan gaps happen. `plan-segmentation` exists to make them rarer; this WU makes the residue
cheap and reliable when they happen anyway. Today the corpus asserts the _what_ and lacks the _how_:

- `design-audit` names **mid-impl** as one of its four audit points ("the escalation point: implementation
  evidence suggests the _design_, not the task, is wrong") and its posture line promises that a confirmed break
  "routes back into the design loop — draft or spec grooming — not around it via downstream patches." Nothing
  defines what that routing _is_, operationally, from inside an execution session.
- The mid-impl detection story is fragmented across two standalone doors: `arc-task-audit` (whose own text names
  a "mid-impl reground" use case) routes design-implicating findings onward to `arc-design-audit` — and both are
  read-only rubrics that end at findings. Neither owns pausing implementation, settling the fix, amending the
  record, revising the task list, or resuming.
- Under stacked delivery, each deliverable phase now runs its own verification (`validate-criteria`), which is
  where these gaps are typically caught — mid-WU, not terminally. Every occurrence currently improvises: how to
  record the amendment, where revision tasks go, what else must be re-checked before resuming.

The cost of improvisation is not just efficiency: an unstandardized detour leaves no durable amendment trail, no
assurance the fix didn't strand debt in later phases, and no consistent shape for compaction recovery to resume
through.

## Proposed direction

**One workflow — the single mid-impl entrypoint for "does anything need to change?"** — owning the detour start
to finish (see § Unknowns for naming; the entrypoint name must presuppose neither outcome). It fires existing
method rubrics rather than minting new ones, in the spirit of `composable-workflows` forward compatibility.

**Two entry modes, one pipeline.**

- _Responsive_ — a gap has been found (typically by a deliverable phase's verification, or in-flight
  implementation evidence) and the detour enters at triage.
- _Speculative_ — no known gap: the caller passes a scope to pressure-test (a design subset, a task range, a
  phase) purely to shore up confidence. Speculative entry runs the detection rubrics over that scope; findings
  flow into the same triage as responsive entry, and a clean result exits cheaply with the checked scope
  recorded. This mode is what absorbs the standalone doors' opportunistic use rather than orphaning it.

**Front door: triage keyed to the derivation chain** (intent → design → tasks → code), asking _which artifact
must change_:

1. **Task gap** — the spec states it; the task list missed it (the common shape: unwired production callers,
   modules built but unreachable). Shallow arm: task-list revision only; `task-audit` is the rubric.
2. **Spec-depth gap** — the spec states _what_ but not deep enough on _how_; the decisions are right but
   under-elaborated. Middle arm: a spec elaboration amendment (no design re-litigation) plus the task revision it
   induces.
3. **Design gap** — a settled decision is wrong or missing. Deep arm: narrowed elicitation to settle the fix
   (`draft-design`'s loop in miniature), then spec amendment, then task revision. `design-audit` is the rubric —
   this workflow becomes its named mid-impl caller.

Each arm strictly contains the previous arm's tail, so the workflow is one procedure with three entry depths.
The mechanical test: could the existing spec text have generated the missing work? Yes → task gap; no, but the
decisions hold → spec-depth gap; no, and a decision is implicated → design gap. **Plus an upper escape hatch:**
an amendment that invalidates the WU's identity or a deliverable boundary exceeds the detour's authority —
escalate out (re-plan / decomposition territory), never absorb silently. External grounding: every mature
change-control tradition puts a cheap classification gate _before_ impact analysis (IETF errata vs. new RFC;
MIL-STD Class I/II ECPs; PRINCE2 tolerance-breach escalation) precisely so small changes never trigger a full
re-plan.

**Spec amendments are append-with-linkage, never silent rewrites.** A marked, dated amendment block linked
bidirectionally to the triggering evidence and to the task revision it produced — modeled on
`strategy-adr-methodology`'s tiered amendment rules. The documented failure mode to design against is unlinked
amendment sprawl (the "constitution with scattered amendments" anti-pattern).

**Task revision lands as standardized `.R` work** — either a canonical `.R` revision phase or `.R` tasks within
an existing phase (open; see § Unknowns). Two hard constraints either way: the compaction-recovery task cursor
must stay monotonic and resumable, and when a delivery plan exists the revision must route through
`delivery-plan-record`'s shipped **amendment classification**, staying within the affected member where possible
so the deliverable still lands independently.

**Exit gate: a propagation sweep bounded by the amendment's dependency footprint.** The amendment produces a
diff of settled things; the sweep walks only what references or depends on the changed elements — remaining
tasks, later phases' exit criteria, other spec sections — and classifies each hit: **unaffected** (recorded as
checked), **fold into the same `.R` batch** (one corrective loop, not many), or **reopens another design
question** (stay in the loop; the detour never exits carrying a known unsettled thing). Sweep clean → resume
implementation. Cost scales with the amendment's actual coupling: a tiny amendment sweeps almost nothing; a
tentacled one reveals its true size before resumption, which is information worth having anyway. External
grounding: dependency-graph-bounded blast-radius analysis with a fixed checklist, and ECO practice's separate
verification/closure stage — the change is done at "verified against the motivating gap," not at "implemented."

**Closure re-runs the detecting verification** (`validate-criteria` for a deliverable phase, or the equivalent
check that surfaced the gap) so the detour proves it closed what opened it.

## Alternatives

- **Re-enter the original planning workflows.** Rejected — the whole point is a narrowed subset. `draft-design`
  / `create-spec` / `generate-tasks` assume a whole-WU scope, planning-stage session posture, and full
  adversarial gates; the detour needs their _moves_ (elicitation, grounding, decomposition) at amendment scale,
  not their ceremony.
- **Status quo (ad hoc handling).** Rejected — the motivating problem. Every occurrence re-derives procedure,
  and nothing guarantees the amendment trail, the `.R` conventions, or the propagation check.
- **Scope to design gaps only (`amend-design` as a pure `design-audit` sequel).** Rejected — most observed
  instances are task or spec-depth gaps; a design-only workflow would leave the common case unowned and pull
  agents into design elicitation for missing-wiring fixes. The triage front door is what keeps the discriminator
  sharp.
- **A formal WU lifecycle state for "amending."** Deferred, not rejected — likely disproportionate for a quick
  detour, and the lifecycle record belongs to `wu-lifecycle-state-model`. The detour is recorded in the meta
  (workflow pointer / notes), not as a state transition.
- **Defensive full re-audit before resuming.** Rejected — repeats pre-impl planning cost on every amendment. The
  dependency-bounded sweep is the minimal-but-sufficient middle: assurance against recognized-later debt without
  auditing what the amendment cannot have touched.

## Coordination

- **`plan-segmentation`** (regrounded same day) — reduces amendment _frequency_; this WU reduces amendment
  _cost_. Complementary, no overlap: segmentation owns planning-time exit criteria; this owns the corrective
  loop when verification fails one anyway. If segmentation works, the shallow arm gets rarer and the deep arm
  becomes the dominant case.
- **`delivery-native-stack-composition` / chunked delivery** — per-deliverable `validate-criteria` is the common
  detection site, and `delivery-plan-record`'s amendment classification is the routing this workflow's task
  revision must compose with. Author the composition against DNSC's _landed_ state.
- **`arc-task-audit` skill disposition** — the current mid-impl "do we need to change anything?" invocation
  path. Developer leaning: retire the skill in favor of this single entrypoint — it is not used by pre-impl
  planning (`generate-tasks` fires the `task-audit` method directly), its mid-impl role plus its
  route-onward-to-`arc-design-audit` handoff are subsumed by the triage front door, and its opportunistic
  "just want to be sure" use is subsumed by the speculative entry mode. Confirm at spec time whether
  `arc-design-audit`'s standalone door keeps independent value (ad-hoc re-validation outside execution) or is
  also absorbed.
- **`composable-workflows` / `knowledge-architecture`** (backlog) — the elicitation loop this workflow needs is
  `draft-design`'s in miniature; whether that becomes a DRY-extracted shared method now or stays
  prose-referenced until `composable-workflows` lands its parameterization model is a proportionality call.
  Default: compose by reference now, extract later — do not mint private machinery.
- **`strategy-adr-methodology`** — the amendment-marking precedent (tiers, "changes meaning → higher tier",
  commit-message notation).
- **`decomposition-doctrine`** (paused, planning) — owns the boundary the upper escape hatch lands on: when a
  mid-impl discovery means the WU is mis-cut rather than mis-planned.

## Unknowns and Assumptions

- **Naming.** WU slug `plan-amendment` names the minted capability (the amendment procedure); the workflow /
  entrypoint name is open under a hard constraint: it must presuppose neither outcome. `amend-*` presupposes
  amendment (wrong for speculative entry); a pure audit-flavored name presupposes findings-without-procedure
  (wrong for the responsive arms). Leading candidate: **`reground`** — already corpus vocabulary
  (`arc-task-audit`'s "mid-impl reground") and outcome-neutral; `amend-plan` / `amend-design` may survive as
  internal arm vocabulary for the procedure past triage. Settle against existing vocabulary (`plan` here = the
  WU's planning artifacts broadly: spec + task list).
- **`.R` structure.** Dedicated `.R` revision phase vs. `.R` tasks appended to the affected phase — interacts
  with cursor monotonicity, delivery-plan member partitioning, and how verification steps re-run. Needs the
  tradeoff weighed with edge cases (amendment spanning members; amendment during a phase's own verification).
- **Class.** Developer read: `Light` (compositional prose over existing mechanism). The delivery-plan amendment
  composition, `.R` conventions, and amendment-marking format carry enough contract surface that
  `classify-work-unit` may land Standard — classify honestly at launch, do not pre-commit.
- **How the pause is recorded** absent a lifecycle state — meta annotation shape, and what compaction recovery
  reads to resume _inside_ the detour rather than at the pre-detour cursor.
- **Assumption:** the triage test ("which artifact must change") is decidable in practice at the moment of
  discovery. Unvalidated; if triage proves ambiguous in live use, the arms may need a default-and-escalate rule
  rather than a decision.

## Scope boundary (Won't Do)

- No WU lifecycle state-model changes (`wu-lifecycle-state-model` owns that surface).
- No changes to when amendments _should_ happen — frequency reduction is `plan-segmentation`'s concern.
- No re-authoring of the pre-impl planning workflows beyond the composition seams this workflow calls into.
- No decomposition doctrine: the upper escape hatch names the exit; `decomposition-doctrine` owns what happens
  after it.

Dependencies: none hard. Author the delivery-plan composition against `delivery-native-stack-composition`'s
landed contracts (in late execution at minting).
