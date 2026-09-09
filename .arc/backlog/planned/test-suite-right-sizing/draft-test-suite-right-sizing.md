# Draft: Test Suite Right-Sizing

- **Origin:** Housekeep follow-up from recurring test-suite wall-clock friction.
- **Purpose:** Determine whether the repository's test suite carries avoidable cost without weakening meaningful
  behavioral coverage or the project's test-driven standards.

---

## Problem

Assess whether growth in the test suite has created redundant, low-value, or incorrectly tiered coverage whose
maintenance and wall-clock cost is no longer proportionate. Ground the decision in measured suite composition and
cost, then design the smallest evidence-backed consolidation, removal, or tier-placement changes.

## Ownership Boundaries

- `quality-gate-hooks` owns when and where quality gates run.
- `test-suite-contention-hardening` owns reliability under concurrent or resource-constrained execution.
- `local-ci-capacity-qualification` and `self-hosted-ci-qualification` own runner capacity and placement.
- This work unit owns whether the suite itself contains avoidable cost, redundancy, or misplaced coverage.

---
