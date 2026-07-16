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
- **Last Completed:** Phase 2 complete (Tasks 2.1–2.3) — notes-compaction fixture de-costed (302→35 filler +
  partition-dump diagnostic), shallow-clone test given a 15s per-test budget, and the save/sync race (flake d)
  confirmed non-reproducing across four combined runs post-Phase-1.
- **Next Task:** Task 3.1 — Isolation-safety spike (line ~155)
- **Blockers:** [none]

- **Next Action:** Start Task 3.1 — probe worker-thread `process.chdir()` + module-state leakage against the real
  unit suite (concrete case: `validate-config.test.ts`, the flake-(e) timeout); output is a go/no-go decision +
  evidence, not a config change. Spike-gated: Task 3.2 applies pool tuning only if the spike clears.

- **PR URL:** [none]
- **Completed:** [none]

---
