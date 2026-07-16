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
- **Last Completed:** Task 3.4 — set `isolate: false` on the `unit` vitest project (module import ~78s → ~52s on
  the tier), closing Phase 3. Preceded by Task 3.3, which quarantined the 15 module-mocking unit files into an
  isolated `unit-mocks` tier + a drift guard so the flip is leak-safe.
- **Next Task:** Task 4.1 — Shard the e2e job and sync the classifier (line ~213)
- **Blockers:** [none]

- **Next Action:** integrate-work-unit Step 1 — verify completion

- **PR URL:** [none]
- **Completed:** [none]

---
