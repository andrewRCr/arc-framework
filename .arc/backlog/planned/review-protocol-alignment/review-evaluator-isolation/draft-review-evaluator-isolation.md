# Draft: Review Evaluator Isolation

- **Origin:** `USER-INBOX § Work Unit`, housekeep drain (2026-08-20).
- **Cohort:** `review-protocol-alignment`
- **Purpose:** Preserve the non-author evaluator boundary across chunk orchestration, report storage, and
  compaction recovery.

---

## Inbound Buffer — Pending Integration

### `[ ]` **Give a chunked local review's evaluator and report stages the verbs agents now script per round**

- _Routed from:_ `USER-INBOX § Work Unit`, housekeep drain (2026-10-30).

- _Shapes:_ § Direction — per-evaluator report namespaces, and deterministic replacement of a dead evaluator without
  losing target, partition, or coverage progress.

- _Observation:_ `storage-ref-backend`'s review accumulated 323 per-round scripts, about 40k lines, across 47 round
  directories, each round's set rewritten with its scope IDs hard-coded; this machine keeps a copy, without its
  repository clones, at `~/dev/arc-evidence/storage-ref-backend/`. Most of it translates between ARC's own outputs
  and inputs and carries no judgment. The stages this entry covers:

  2. Evaluators: rendering reviewer prompts, by importing the private `renderStandardReviewReviewerInstructions` from
     `src/scripts/review-gate/policy/`; recording launches and the concurrency queue; holding the seam and aggregate
     until the chunk reports they read are audited (`check-ready`); retiring a dead evaluator without losing its
     scope; and composing follow-up prompts for an incomplete report.
  3. Reports: auditing each report against the report schema and its required prior findings, building the
     aggregate's context, verifying what the aggregate was given, and normalizing the aggregate into the attest
     request.

  The judgment is small by comparison: partition boundaries, which earlier findings each chunk must resolve, and
  triage.

- _Approach:_ close the verb gaps rather than ship scripts. ARC already owns the schemas and the guidance renderer,
  so shipped scripts would be a second, untested copy of that contract; verbs keep it in one place. Let the agent
  supply judgment as declarative input (a partition with each chunk's required priors) that the verbs consume.

- _Siblings:_ the scope stage went to `chunk-scope-binding`, and the response stage's request composition and evidence
  capture to two `review-request-contracts` entries.

- _Captured during:_ `storage-ref-backend` pre-publication review, pass 8 and its fix checks, 2026-10-29.

---

## Problem / Motivation

The first live chunked local review under the prepublication workflow lost two otherwise complete evaluator runs
to freshness contamination. One evaluator's source search crossed into sibling chunk reports; a replacement then
received post-compaction recovery context from the live author session, including author notes. Neither result
could satisfy the non-author boundary, so both chunks had to be reassigned.

Freshness currently depends on retrying evaluators rather than on orchestration preserving the contract.

## Direction

- Establish a per-evaluator source and report namespace that prevents sibling-report discovery.
- Give evaluator recovery a context contract that cannot silently import author-session material.
- When the harness must recover with ineligible context, classify the run ineligible and replace it
  deterministically without losing its target, partition, or coverage progress.
- Cover sibling-report discovery and mid-chunk compaction as first-run scenarios.

## Boundaries and Coordination

- `review-activity-contracts` owns the evaluator activity boundary this work must preserve.
- `review-checkout-lifecycle` owns physical checkout isolation and diagnostic retention.
- `chunk-scope-binding` owns chunk scope, receipt attribution, and coverage-union mechanics.

---
