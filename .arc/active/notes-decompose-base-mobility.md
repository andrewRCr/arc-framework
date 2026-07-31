# Notes: decompose-base-mobility

Working notes for this work unit. Findings here are verified against source unless marked otherwise.

---

## Grounded source facts, do not re-derive

Checked against source this session; re-verifying costs time and finds nothing.

- All five Git read helpers are module-private in the exact-base anchor adapter — extraction is genuinely required.
- The core tree-snapshot reader is exported and parameterized by head, and derives incoming edges from every meta
  in the tree. It also loads source-artifact blobs the dependency check does not need.
- The anchor has exactly four consumers, all taking it structurally through a resolved-status wrapper: local
  cleanup, the claim-retirement gate, landed-handoff emission, and the graduation transaction behind work-unit
  launch. The last captures an anchor-policy refusal whenever the anchor does not resolve.
- Receipt identity is invariant under base movement — it digests origin, source branch, and source head only — so
  the same-path refreshed receipt commitment holds. Preparation identity is **not** invariant: the preflight digest
  covers the whole machine block including the result base.
- The prepared-base-to-candidate diff is the correct pair for the candidate's own transition, stable wherever the
  base moves. The current-base-to-candidate diff is not, and would read unrelated base advancement as reverted
  paths.

- The exact-base extra-path check compares that diff against the transition patch **plus** the candidate's own
  receipt path. The patch derives from managed path results and never carries the receipt blob; the diff always
  does.

- The decompose mode surface has three consumers that do **not** read the same list. The schema's exclusivity
  refinement counts five modes; the registration's machine-readable predicate and the handler's stderr branch
  count those five plus `--continuation`, which is not a mode.

- `candidate-parent-record` fires for a committed preparation, a committed receipt, and an unparseable record
  alike — the parent-record decode has four arms and the refusal collapses three of them. `committed-candidate` is
  produced at exactly one site, in the retirement driver; the finalization adapter emits only other causes.

- The core's recovery **cause** union has seven arms, none representing an unavailable immutable-pair binding.

- `applyRoadmapConflictAutoRemedy` already takes its transition-overlay resolver as an injected dependency, so
  supplying validated authority needs no fork of the remedy. Its resolver conversion raises on ambiguous, stale,
  and refused — arms a supplying caller cannot reach.

- Candidate cleanup computes four absence facets and treats all-four-absent as its only success; every other state
  goes through an exactness check that destroys nothing unless the candidate is intact. Both refusal arms render a
  retry of the same discard invocation. Release evidence folds path absence into registration absence, so four
  computed facets reach the claim store as three.

- Eight `merge-base --is-ancestor` call sites exist across the errand, user-sync, teardown, retirement, in-flight,
  and sync-status drivers. None is this work unit's to migrate.

- The decomposition authority-boundary proof lives at
  `__tests__/unit/work-unit/decompose-v3-authority-boundary.test.ts`. It walks every `.ts` file under `src/` with
  the TypeScript AST and asserts removed-module absence, forbidden-identifier absence, and positive
  exported-symbol presence. It is the home for any boundary assertion this work unit adds.

- Its forbidden-identifier half does not extend to this work unit's sibling boundaries. `planning-lane` is a live
  shipped command (review-gate lane classification), unrelated to the `decompose-planning-lane` sibling, so adding
  it to the forbidden set would flag correct existing code; extraction source-thinning has no symbols at all.

- The identity chain is `preflightId` → `planId` → `preparationId`. `v3PreflightId` digests the machine block
  including `resultBase`, and `v3PreparationId` additionally consumes `resultBaseHead` and `prospectiveProjection`.
  `prospectiveProjection` is a sibling of `completedMap` — in neither the `machine` nor the `authoring` block —
  and carries the plan-bound overlay plus the ROADMAP before/after pair. Any base restatement moves all of it.

- `produceDecompositionIntegrationAnchor` has two production call sites: the configured-base adapter and the pure
  `resolveLandedDecompositionHandoff`, which spreads its caller's integration facts and performs no lookup.

- `landingFor` admits only a commit whose first parent is the recorded prepared base, and never returns
  `ambiguous` today. `git-landed-decomposition-handoff.ts` maps `not-landed` to itself but every `refused` arm to
  `namespace-corrupt`, so turning a not-landed case into a refusal is visible to callers.

- Candidate retirement precedes cleanup, so an interrupted teardown always leaves a **terminal** claim. The pure
  driver already skips its exactness gate for a terminal claim; the adapter's `cleanup` re-inspects regardless.

---
