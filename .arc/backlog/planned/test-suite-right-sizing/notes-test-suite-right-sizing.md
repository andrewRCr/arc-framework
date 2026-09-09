# Notes: test-suite-right-sizing

## Planning Seed

Assess whether growth in the repository's test suite has created redundant, low-value, or incorrectly tiered
coverage whose maintenance and wall-clock cost is no longer proportionate. Ground the decision in measured suite
composition and cost, then design the smallest evidence-backed consolidation, removal, or tier-placement changes
that preserve the project's test-driven standards and meaningful behavioral coverage.

Keep the concern boundaries explicit during planning:

- `quality-gate-hooks` owns when and where quality gates run.
- `test-suite-contention-hardening` owns reliability under concurrent or resource-constrained execution.
- `local-ci-capacity-qualification` and `self-hosted-ci-qualification` own runner capacity and placement.
- This work unit owns whether the suite itself contains avoidable cost, redundancy, or misplaced coverage.

---
