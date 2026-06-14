# Metadata: lifecycle-state-resolver

| **State**  | **Owner** | **Branch**                      | **Class** | **Priority** |
|------------|-----------|---------------------------------|-----------|--------------|
| `Active`   | `andrew`  | `feat/lifecycle-state-resolver` | `Heavy`   | `P1`         |

- **Cohort:** `lifecycle-state-machine`
- **Depends On:** [none]

- **Origin:** [internal]
- **Design:** `spec-lifecycle-state-resolver.md`
- **Task List:** `tasks-lifecycle-state-resolver.md`

- **Last Completed:** Task 2.2 — `occupied?` / `shipped?` predicates (Phase 2 complete)
- **Next Task:** Task 3.1 — Lifecycle-complete cohort-membership resolver (line ~137)
- **Blockers:** [none]

- **Next Action:** Begin Phase 3, Task 3.1 — the lifecycle-complete cohort-membership resolver over the same
  index (`tasks-lifecycle-state-resolver.md`), reconciling with the existing `buildLiveCohortContext` membership
  walk in `validate-cohort-consistency.ts` so there is one membership source. Phase 3 also lands the
  archival-trigger detection (Projection B).

---
