# Draft: Review Evaluator Isolation

- **Origin:** `USER-INBOX § Work Unit`, housekeep drain (2026-08-20).
- **Cohort:** `review-protocol-alignment`
- **Purpose:** Preserve the non-author evaluator boundary across chunk orchestration, report storage, and
  compaction recovery.

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
