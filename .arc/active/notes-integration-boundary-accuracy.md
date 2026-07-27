# Notes: Integration Boundary Delivery Sizing

**Design:** `spec-integration-boundary-accuracy.md`

## Delivery Decision

Task generation is paused before content fill. The current design is too large to carry as one work unit under
the desired pull-request ceiling, and the supported mechanisms that can preserve its design integrity are
already in active development.

The preferred unblock is `decompose-transform-integrity`. It should split this work unit into component work
units while preserving the mature spec and its task-decomposition seed. `chunked-delivery` is an alternate
unblock if it lands first and can provide independently reviewable delivery units below the ceiling without
weakening the one-concern design.

The decision order is:

1. Prefer supported decomposition after `decompose-transform-integrity` lands.
2. If `chunked-delivery` lands first, reassess its delivered contract against the sizing and preservation
   requirements below.
3. Do not hand-decompose while the decomposition transform is being repaired. The manual fallback would encode
   assumptions about a lifecycle contract that is changing concurrently.

Both prerequisite work units are currently in `Planning` and have occupied worktrees.

## Sizing Evidence

### Current planning footprint

- The committed branch delta against the merge base of `origin/main` is 1,098 changed lines: 790 additions and
  308 deletions, all Markdown.
- The structural skeleton contains 26 substantive parents across seven phases.
- Thirteen parents carry a `many` subtask signal and twelve carry a `2-3` signal.
- The skeleton implies approximately 64-77 executable leaves before grounding expands any parent.

### Historical calibration

- PR #310, `feat(git): standardize Git process execution`: 2,975 changed lines across 28 completed leaves,
  approximately 106 lines per leaf.
- PR #313, session envelope: 7,893 changed lines across 66 completed leaves, approximately 120 lines per leaf.
- PR #329, atomic work-unit rename: 5,668 changed lines across 47 completed leaves, approximately 121 lines per
  leaf. Its diff included 1,993 source lines, 2,367 test lines, and 1,308 Markdown lines.

### Delivery estimate

- Optimistic floor: approximately 7,000 changed lines.
- Likely range: approximately 9,000-13,000 changed lines.
- Adverse case: 15,000 or more changed lines.
- Estimated probability of remaining below 5,000 changed lines: well under 10%.

The leaf estimate is intentionally only a signal. The historical calibration includes different code, test, and
documentation mixes, but every reasonable calibration places the current scope beyond the ceiling.

## Preservation Requirements

### Preserve the completed design

Decomposition must partition the existing spec into self-contained component specs that are ready to enter task
generation. It must not discard the spec and restart the components as design drafts. The design work is already
settled; decomposition is allocation and boundary work, not a second design cycle.

Every design element in `spec-integration-boundary-accuracy.md` must be allocated exactly once to one of:

- a component spec as task-driving design;
- cohort-level coordination when the material is purely cross-member sequencing or contract coordination; or
- an explicit dropped-with-reason record when the delivered baseline makes the material obsolete.

Shared invariants need one authoritative owner. Other component specs and the cohort coordination artifact should
point to that owner instead of copying task-driving design.

### Preserve the task-generation seed

The candidate structural skeleton below should seed the component task lists. Task generation may ground, revise,
split, or reorder the seed, but should not rederive the full structure from an empty file.

The seed is deliberately recorded here instead of finalizing
`tasks-integration-boundary-accuracy.md`. The task list was only a high-depth Pass 1 skeleton, and its sizing
result invalidated continuation as one work unit.

### Revalidate each component before task generation

Each component spec should carry a near-header instruction requiring one baseline-coherence pass immediately
before task generation:

> Before generating tasks, compare this spec with the delivered implementation of every predecessor work unit.
> Amend stale factual assumptions, substrate references, and compatibility claims. Preserve settled design unless
> delivered behavior materially invalidates it; route any such invalidation back through spec review.

This check keeps a component whole and task-ready while acknowledging that predecessor delivery can change the
implementation substrate between decomposition and activation.

## Candidate Component Cut

The cut is provisional until the supported decomposition transform can validate conservation and lifecycle
shape. Candidate slugs are descriptive working names, not committed identities.

### 1. `candidate-review-attestation`

**Source:** Phase 1 — Candidate Attestation and Pre-Publication Review

**Outcome:** Establish Candidate as a storage-neutral, verified lineage and make private review progress
machine-owned.

**Task seed:**

- Define Candidate attestation, currentness, and projection records — E1-E2, E4 · `many`
- Replace verification finalization with idempotent `propose` — E1-E2, E4, E6 · `2-3`
- Drive pre-publication review and convergence verification — E3-E4, E6 · `many`
- Project Candidate and review loci into status and session initialization — E9 · `2-3`

### 2. `submission-publication-boundary`

**Source:** Phase 2 — Submission Transition and Publication Boundary

**Outcome:** Separate reviewable-artifact attestation from publication scheduling and make the lifecycle
vocabulary true.

**Task seed:**

- Rename the lifecycle transition to `submit` and free the `integrate` namespace — E5, E7-E8 · `many`
- Enforce Candidate-aware, reservation-preserving submission — E3, E5-E6, E9 · `2-3`
- Move the transition to the publication-step head and preserve exact resume loci — F1-F4 · `many`

### 3. `integration-review-primitives`

**Source:** Phases 3-4 — Shared Resolution Verbs and Provenance-Checked Reviewed Clearance

**Outcome:** Supply typed, provider-neutral integration-boundary primitives and exact-head-safe reviewed
clearance for both publication lanes.

**Task seed:**

- Resolve exact-head change-request disposition and next action — D1 · `many`
- Resolve configured merge method against live repository policy — B4, D3 · `2-3`
- Extract and expose the provider-neutral bounded wait primitive — D2 · `2-3`
- Re-lock and dispatch reviewed clearance with trusted provenance — D2 · `many`
- Await clearance through typed, stale-head-guarded outcomes — D2 · `2-3`
- Integrate at-least-once clearance into both publication lanes — B2, D2 · `2-3`

### 4. `integration-checkpoint-composition`

**Source:** Phase 5 — Integration Checkpoint and Approval Composition

**Outcome:** Collapse the stopless pre-approval span into a fail-closed checkpoint and compose only
decision-relevant evidence.

**Task seed:**

- Build the typed integration checkpoint and readiness verdicts — A, B1, B4 · `many`
- Persist digest-bound approval composition and settlement plans — B3 · `many`
- Compose exception-filtered machine evidence with an extension boundary — B5, B7 · `2-3`
- Place the shared `pre-merge` seam after a ready checkpoint — B6 · `2-3`

### 5. `integration-settlement-merge`

**Source:** Phase 6 — Settlement-Bound Merge Execution

**Outcome:** Execute exactly the approved settlement and review record before a policy-revalidated, pinned merge.

**Task seed:**

- Execute persisted review settlements idempotently — B2-B3 · `many`
- Revalidate the approved head, clearance, policy, and final drift before merge — B2, B4, H · `many`
- Post the checkpointed review record without `Coverage` — B3, G · `2-3`

### 6. `integration-workflow-convergence`

**Source:** Phase 7 — Reconcile Orchestration and Workflow Contract Migration

**Outcome:** Reduce both integration workflows to typed procedures plus their real stops while preserving every
control obligation.

**Task seed:**

- Merge the base only against the checkpointed revision — C1-C2 · `2-3`
- Resolve exact-target review status after head-changing reconciliation — C3 · `2-3`
- Recast the work-unit reconcile arm as thin orchestration — A, C4-C7 · `many`
- Converge the errand lane, seam placement, record cut, and pin disclosure — B4, B6, D1-D3, G-H · `many`
- Replace prose-string pins with typed contract and cross-lane scenario coverage — B-H · `many`

Every component retains its own final verification phase pointing to `verify-work-unit.md`.

## Resume Procedure

1. Resolve live status for `decompose-transform-integrity` and `chunked-delivery`; do not infer delivery from
   branch or roadmap position.
2. If `decompose-transform-integrity` has landed, use its supported transform to produce the member work units,
   conservation map, and cohort coordination artifact.
3. Partition the mature spec according to the validated cut. Add the predecessor-baseline instruction near each
   component spec header.
4. Seed each component task list from the matching task group above, then run normal task generation and grounding
   for that component.
5. If only `chunked-delivery` has landed, inspect whether its delivered model supplies independent review and
   merge boundaries that keep each pull request below 5,000 changed lines. Prefer decomposition when both paths
   are available.

---
