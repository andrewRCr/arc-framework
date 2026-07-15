# Metadata: CLI Test Hardening

| **State** | **Owner** | **Branch**                 | **Class** | **Priority** |
| --------- | --------- | -------------------------- | --------- | ------------ |
| `Active`  | `andrew`  | `chore/cli-test-hardening` | `Light`   | `P3`         |

- **Cohort:** `architecture-remediation`
- **Depends On:** [none]

- **Origin:** [internal]
- **Design:** `spec-cli-test-hardening.md`
- **Task List:** `tasks-cli-test-hardening.md`

- **Current Workflow:** [none]
- **Last Completed:** Phase 1 complete (Tasks 1.1–1.4) — retry-safe removal primitive, unified `createTempRepo`
  core, and all git-backed teardowns routed through it with gc-disable closed on inline bare origins.
- **Next Task:** Task 2.1 — De-cost the notes-compaction fixture, flake (a) (line ~105)
- **Blockers:** [none]

- **Next Action:** Start Task 2.1 — shrink the 302-filler loop to ~35 per the recorded reduce-count approach
  (spec Decision 2 finding + `notes-cli-test-hardening.md`); update count assertions, add partition-dump diagnostic.

- **PR URL:** [none]
- **Completed:** [none]

---
