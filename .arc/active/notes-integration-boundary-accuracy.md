# Notes: Integration Boundary Delivery

**Design:** `spec-integration-boundary-accuracy.md`

## Delivery Decision

This work unit delivers as a **stack**: one concern, one spec, dependency-ordered members each independently
landable to `main` (the delivery-plan record's `stack-to-main` projection). Decomposition was assessed and
declined — the surfaces are coupled by design, and a component cut would distribute one cohesive design into
cross-referencing sibling specs. Delivery topology absorbs the size; the work-unit boundary does not move.

The delivery plan is authored from the finalized task list at the end of task generation
(`arc delivery plan from-tasks` → author slots → `arc delivery compose`; the `stack-to-main` projection requires
two or more members, every member `independently-landable`, the verification task assigned to none). Plan
authoring is available now; the landing machinery (materialize / land / rewrite / teardown and the member-review
admission seam) ships with `delivery-stack-topology`, so integration holds until that work unit lands. The
`from-tasks` entry requires a strict design-inventory JSON; a schema-emitting verb is planned there — hand-build
the inventory if task generation finishes first.

## Sizing Evidence

- The original high-depth Pass 1 skeleton read 26 substantive parents across seven phases, implying roughly
  64–77 executable leaves, with a likely delivery range of 9,000–13,000 changed lines against historical
  per-leaf calibration (roughly 106–121 lines per leaf on PRs #310, #313, #329).
- The re-grounded spec should land below that range: Goal 5 now deletes obligations rather than relocating them
  (the post-approval re-validation cascade beyond one status read, duplicate drift reads, the readiness verb's
  forensic posture), and D2 composes the shipped `arc merge lock` verbs rather than minting a dispatch and
  provenance subsystem. Re-estimate at task generation; every plausible estimate still exceeds a single-PR
  ceiling, so the stack decision does not hinge on the re-estimate.

## Stack-Member Seed

The six groups below seed the stack members and task-list phases (phase-aligned boundary is the offered
convenience; explicit segments remain available). Task generation may ground, revise, split, or reorder, but
should not rederive the structure from an empty file. Order is dependency order; every member must stay
independently landable.

### 1. `candidate-review-attestation`

**Outcome:** Candidate as a storage-neutral verified lineage; private review progress machine-owned.

- Define Candidate attestation, currentness, and projection records — E1-E2, E4 · `many`
- Replace verification finalization with idempotent `propose` — E1-E2, E4, E6 · `2-3`
- Drive pre-publication review and convergence verification — E3-E4, E6 · `many`
- Project Candidate and review loci into status and session initialization — E9 · `2-3`

### 2. `submission-publication-boundary`

**Outcome:** Attestation separated from publication scheduling; lifecycle vocabulary true in every lock mode.

- Rename the lifecycle transition to `submit` and free the `integrate` namespace — E5, E7-E8 · `many`
- Enforce Candidate-aware, reservation-preserving submission — E3, E5-E6, E9 · `2-3`
- Move the transition to the publication-step head and preserve exact resume loci — F1-F4 · `many`

### 3. `integration-review-primitives`

**Outcome:** Typed, provider-neutral integration-boundary primitives shared by both publication lanes.

- Resolve exact-head change-request disposition and next action, host-anchored — D1 · `many`
- Resolve configured merge method against live repository policy — B4, D3 · `2-3`
- Extract and expose the provider-neutral bounded wait primitive — D2 · `2-3`
- Instantiate the required-checks await on the exact head — B8, D2 · `2-3`

### 4. `integration-checkpoint-composition`

**Outcome:** The stopless pre-approval span collapsed into a fail-closed checkpoint composing only
decision-relevant evidence.

- Build the typed integration checkpoint and readiness verdicts, folding lifecycle readiness — A, B1, B4 · `many`
- Shrink `arc review readiness` contract-preservingly for its remaining consumers — B1 · `2-3`
- Persist digest-bound approval composition and settlement plans — B3 · `many`
- Compose exception-filtered machine evidence with an extension boundary — B5, B7 · `2-3`
- Place the shared `pre-merge` seam after a ready checkpoint — B6 · `2-3`

### 5. `integration-settlement-merge`

**Outcome:** Exactly the approved settlement and record execute before a policy-revalidated, pinned merge, with
re-lock as the fail-closed exit.

- Execute persisted review settlements idempotently — B2-B3 · `many`
- Release the lock, await required checks, revalidate policy and drift, merge pinned — B2, B4, D2, H · `many`
- Re-lock on every approval-voiding exit; leave a deadline yield released — B2, D2 · `2-3`
- Post the checkpointed review record without `Coverage` — B3, G · `2-3`

### 6. `integration-workflow-convergence`

**Outcome:** Both integration workflows reduced to typed procedures plus their real stops; every control
obligation preserved or its deletion covered.

- Merge the base only against the checkpointed revision — C1-C2 · `2-3`
- Resolve exact-target review status after head-changing reconciliation — C3 · `2-3`
- Recast the work-unit reconcile arm as thin orchestration — A, C4-C7 · `many`
- Converge the errand lane: seam placement, record cut, pin disclosure, lane arms — B4, B6, D1-D3, G-H · `many`
- Restore the errand tail's terminal-exit semantics and check-cadence honesty — B8, I · `2-3`
- Replace prose-string pins with typed contract and cross-lane scenario coverage — B-I · `many`

The task list carries one terminal verification phase pointing to `verify-work-unit.md`, assigned to no member —
the `stack-to-main` projection requires the sole verification task unassigned (`spec-delivery-plan-record.md`
§ 2); per-member verification at landing is the landing machinery's ceremony, not task-list structure.

## Process-Shape Projection

The operator-experience measure the finished suite is judged against (Success Criteria 1, 2, 4, 6, 16, 17
carry the checkable forms):

- **Work-unit lane today:** a 14-step workflow whose final step runs ~176 lines of prose sequencing — three
  drift reads, three independent lifecycle readers, a nine-part interlock surface, a workflow-wide re-lock
  invariant — with full CI firing on every pushed head from PR open onward.
- **Target:** checkpoint (one verb, one typed verdict) → one human stop over the decision surface → merge (one
  verb that releases, awaits checks, revalidates, merges, and re-locks on failure). The reconcile arm is five
  stop-bearing spans of orchestration over typed procedures. The no-review path adds zero commands, commits,
  approvals, or judgments over today's.
- **Errand lane today:** ship path leaves at PR open and re-enters blind, repeatedly, through CI and review.
- **Target:** in-session to merge or armed auto-merge; leave fires only on a session-ending tail.

Recount at verification: residual step length must be a function of the stop inventory alone.

## Baseline-Coherence Rule

Before task generation resumes — and again if substantial base lands while this branch idles — compare the spec
against the delivered implementation of every predecessor it composes (`merge-readiness-control`'s lock verbs,
`delivery-slice-review-vehicle`'s vehicle kinds, `delivery-stack-topology` once landed). Amend stale factual
assumptions and substrate references; preserve settled design unless delivered behavior materially invalidates
it, and route any such invalidation back through spec review. Last run 2026-08-12 (spec re-ground).

## Resume Procedure

1. Resume `generate-tasks` from the stack-member seed above under the amended spec — structural skeleton from
   the seed, then content fill and grounding per the resolved level.
2. At finalization, author the delivery plan from the finalized task list (`stack-to-main`, phase-aligned
   boundary as the starting candidate) and compose it into the task list's `## Delivery Plan` projection.
3. Hold integration until `delivery-stack-topology` ships the landing machinery; plan authoring and
   implementation need not wait.
