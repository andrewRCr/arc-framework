# Metadata: lifecycle-transition-core

| **State** | **Owner** | **Branch**                       | **Class** | **Priority** |
|-----------|-----------|----------------------------------|-----------|--------------|
| `Active`  | `andrew`  | `feat/lifecycle-transition-core` | `Novel`   | `P1`         |

- **Cohort:** `lifecycle-state-machine`
- **Depends On:** `lifecycle-state-resolver`

- **Origin:** [internal]
- **Design:** `spec-lifecycle-transition-core.md`
- **Task List:** `tasks-lifecycle-transition-core.md`

- **Last Completed:** Task 6.6.f — archive un-bundle reconciled into the spec (§4 `clearBranchField` + archive
  caller-shape; §9 mergeable/physical split) + ADR-026 dated amendment. Session also closed 6.6.d
  (activate/deactivate → executor verbs) and 6.6.e (graduate → `arc promote`).
- **Next Task:** `Task 6.6.g — deactivate-work-unit Case A-delete → the abandon transition (line ~702)`
- **Blockers:** [none]

- **Next Action:** Continue Phase 6.6 at Task 6.6.g — re-point Case A-delete's inline branch/worktree teardown to
  `arc abandon` (per the task's audit note: the verb already covers both worktree arms; **retain Case A-delete
  Step 3**'s base-branch leftover cleanup). Then 6.6.h (cohort-aware `promote`, test-first) and 6.7 (park/resume
  ceremonies). Markdown + wiring.

---
