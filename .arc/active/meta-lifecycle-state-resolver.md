# Metadata: lifecycle-state-resolver

| **State**  | **Owner** | **Branch**                      | **Class** | **Priority** |
|------------|-----------|---------------------------------|-----------|--------------|
| `Active`   | `andrew`  | `feat/lifecycle-state-resolver` | `Heavy`   | `P1`         |

- **Cohort:** `lifecycle-state-machine`
- **Depends On:** [none]

- **Origin:** [internal]
- **Design:** `spec-lifecycle-state-resolver.md`
- **Task List:** `tasks-lifecycle-state-resolver.md`

- **Last Completed:** Task 3.3 — cohort-consistency membership reconciled onto the resolver (Phase 3 complete)
- **Next Task:** Task 4.1 — Dep-state read (read half of dep-edge discharge) (line ~188)
- **Blockers:** [none]

- **Next Action:** Begin Phase 4, Task 4.1 — the dep-state read: answer "is dependency `X` landed?" via the
  `shipped?` slug→state query over a WU's `**Depends On:**` edges (`shipped` = merged; an `integrating` dependency
  reads not-landed). Read half only — the write half and integration-readiness policy are
  `lifecycle-transition-core`'s.

---
