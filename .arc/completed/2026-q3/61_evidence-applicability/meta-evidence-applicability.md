# Metadata: evidence-applicability

| **State** | **Owner** | **Branch** | **Class** | **Priority** |
| --------- | --------- | ---------- | --------- | ------------ |
| `Shipped` | `andrew`  | [none]     | `Heavy`   | `P1`         |

- **Cohort:** [none]
- **Depends On:** [none]

- **Origin:** [internal]
- **Design:** `spec-evidence-applicability.md`
- **Task List:** `tasks-evidence-applicability.md`
- **Review Rubric:** [none]
- **Candidate:** `sha256:18acf6e3bcbfab7b2399977b941ad03564d36a062f0cb0a9b587431022abe3e1`

- **Current Workflow:** [none]
- **Last Completed:** Task 6.1 — Complete verification
- **Next Task:** [none]
- **Blockers:** [none]

- **Next Action:** [none]

- **PR URL:** <https://github.com/andrewRCr/arc-framework/pull/620>
- **Completed:** 2026-09-14

## Release Notes Entry

Evidence applicability now follows the content an earlier check covered across integration, review, and Candidate
verification. Disjoint base movement can carry that evidence forward, while interacting or unavailable evidence
receives a bounded reassessment or a fresh check.

**Added**

- A shared path-treatment registry, typed evidence-delta envelope, and deterministic applicability reducer for merge
  safety, review clearance, and Candidate verification currentness.
- Candidate convergence can honor an approved targeted or focused verification scope when its response supplies one;
  omitted scope retains the full-verification default.

**Changed**

- Integration checkpoints and review status use exact overlap, Git feasibility, and host admission to distinguish
  disjoint movement from movement that needs reconciliation or renewed judgment.
- Pending required checks return a resumable, exact-checkpoint continuation instead of occupying the agent session
  while polling.

**Fixed**

- Delivery terminal drift can be classified from the durable Candidate baseline after a predecessor lands, without
  requiring that Candidate to be current against the newly advanced base first.

## Completion Notes

Delivered the shared applicability substrate and its integration, delivery, review, Errand, and Candidate-lineage
consumers as three independently landable delivery members. The implementation keeps merge and review authority
with the exact host request and approved head; evidence carry does not itself grant either approval. The required-
check wait now yields a resumable continuation, and scoped Candidate convergence remains conservative when the
coordinated proposal-side producer has not supplied an approved scope.

Verification closeout recorded 21 met criteria, no superseded or unresolved criteria, two adversarial passes, and a
green Tier 3 over the complete work-unit Candidate. After the exact append-only terminal base merge, targeted Tier 1
checks passed on the five incoming base paths, including both type checks and 4,144 selected tests. The public
delivery members received their separate exact-head review dispositions; final terminal applicability and merge
authorization remain with the integration checkpoint.

---
