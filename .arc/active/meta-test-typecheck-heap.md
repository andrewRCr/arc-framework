# Metadata: test-typecheck-heap

| **State**     | **Owner** | **Branch**                  | **Class** | **Priority** |
| ------------- | --------- | --------------------------- | --------- | ------------ |
| `Integrating` | `andrew`  | `chore/test-typecheck-heap` | `Heavy`   | `P1`         |

- **Cohort:** [none]
- **Depends On:** [none]

- **Origin:** [internal]
- **Design:** `spec-test-typecheck-heap.md`
- **Task List:** `tasks-test-typecheck-heap.md`
- **Review Rubric:** [none]
- **Candidate:** `sha256:10abb9e4f7f96496902e339973c994e16baf21dfa4f0d33caaadb4d923d9a891`

- **Current Workflow:** `integrate-work-unit`
- **Last Completed:** Task 5.1 — Complete verification
- **Next Task:** [none]
- **Blockers:** [none]

- **Next Action:** Resume publication at the idempotent push, then resolve or open the change request.

- **PR URL:** [none]
- **Completed:** [none]

## Completion Notes

The repository's source and test type checks now run on the native TypeScript 7 compiler through one script. Five
sequential test programs partition the reference roots, with a live coverage guard for missing or doubled roots and
compiler-option drift. Each compiler uses one checker, an owned Go memory target, a lower target where a Linux cgroup
requires it, and an address-space backstop that preserves tighter inherited limits. Native peak reports retain failure
and signal status, and approaching test-shard peaks carry an advisory split cue. Typed ESLint remains one TypeScript 6
process with RSS and V8 observations; compiler-API tooling and declaration generation also retain TypeScript 6.

Cold m4-mini qualification measured a 1,931 MiB source peak, a 2,028 MiB largest shard and a 24.199 s complete test check.
Current-head qualification found clean TypeScript 6 and 7 baselines and diagnosed errors planted in every shard and both
named JavaScript roots. The inherited 2 GiB failure qualification uses the documented Node 24 caller settings rather
than claiming default-runtime startup at that limit. All 12 success criteria were met, the independent verification
companion returned no findings, and the full non-diagnostic verification CI passed. The hosted full review at
`5e500d0d04ef3b1921d5e60a84cb02793c7c277c` returned clean and its required CI checks passed.

The measured machine-configuration handoff remains in `notes-test-typecheck-heap.md` and the verification commit body.
No runner heap, admission charge, route or host mode was changed. Pairing acceptance, early m5-air qualification and
test/all placement remain Owner decisions; the first m5-air source check must distinguish a live lower cgroup target
from an absent cap or missed read. TypeScript 7 is the sole compiler verdict after the one-time parity qualification;
future diagnostic omissions remain the accepted residual recorded in ADR-041.

---
