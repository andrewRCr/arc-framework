# Metadata: lifecycle-transition-core

| **State** | **Owner** | **Branch**                       | **Class** | **Priority** |
|-----------|-----------|----------------------------------|-----------|--------------|
| `Active`  | `andrew`  | `feat/lifecycle-transition-core` | `Novel`   | `P1`         |

- **Cohort:** `lifecycle-state-machine`
- **Depends On:** `lifecycle-state-resolver`

- **Origin:** [internal]
- **Design:** `spec-lifecycle-transition-core.md`
- **Task List:** `tasks-lifecycle-transition-core.md`

- **Last Completed:** Task 6.6.c — archive ceremony re-pointed to `arc archive` and the verb un-bundled (6.6.a
  `init-work-unit` Path A → `start`; 6.6.b decompose re-point deferred to `decompose-matrix`; 6.6.c.1 verb
  correction · 6.6.c.2 workflow re-point)
- **Next Task:** `Task 6.6.d — activate-work-unit / deactivate-work-unit → the activate/deactivate transitions (line ~662)`
- **Blockers:** [none]

- **Next Action:** Continue Phase 6.6 at Task 6.6.d — re-point `activate-work-unit` / `deactivate-work-unit` to the
  `activate` / `deactivate` transitions (`activate` fires the dep-edge discharge, 4.7); drop the inline branch
  rename **and** the inline `Branch`-field write (the executor owns both the rotate and the field as of 6.5.a).
  Markdown + wiring (not test-first); existing integration/E2E exercises the re-pointed paths.

---
