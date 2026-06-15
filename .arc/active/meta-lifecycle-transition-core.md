# Metadata: lifecycle-transition-core

| **State** | **Owner** | **Branch**                       | **Class** | **Priority** |
|-----------|-----------|----------------------------------|-----------|--------------|
| `Active`  | `andrew`  | `feat/lifecycle-transition-core` | `Novel`   | `P1`         |

- **Cohort:** `lifecycle-state-machine`
- **Depends On:** `lifecycle-state-resolver`

- **Origin:** [internal]
- **Design:** `spec-lifecycle-transition-core.md`
- **Task List:** `tasks-lifecycle-transition-core.md`

- **Last Completed:** Phase 1 — the transition table + invariant guards (Tasks 1.1–1.3): `lifecycle-transitions.ts`
  vocabulary, the 25-edge + 69-illegal-cell table, and the totality / inverse / encoding-consistency table-walking
  tests. Spec amended mid-phase to drop the merged-corner cells (post-merge rework → new origin-linked WU; ADR-026)
- **Next Task:** `Task 2.1 — relocate-artifacts mutator (line ~73)`
- **Blockers:** [none]

- **Next Action:** Begin Task 2.1 — the `relocate-artifacts` mutator (the `git mv` of a WU's full artifact set
  between lifecycle locations), the first leg of the 1↔1 mutator bundle and the start of Phase 2's fs/git seam that
  executes what the Phase 1 table declares, per `tasks-lifecycle-transition-core.md`.

---
