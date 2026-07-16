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
- **Last Completed:** Task 3.2 — flake (e) fixed by restructuring `validate-config.test.ts`'s spawn loops to
  per-value `it.each` (and Task 3.1 spike: GO on the two named hazards — no unit-test `process.chdir()`, module
  state instance-scoped via factories/DI).
- **Next Task:** Task 3.3 — Harden module-mock unit tests for `isolate:false` safety (line ~175)
- **Blockers:** Task 3.4 (pool tuning) blocked on Task 3.3 — the unit suite must be green under `isolate:false`
  first (a module-mock leak breaks two real-module tests today).

- **Next Action:** Start Task 3.3 — contain the leaking hoisted module mocks so the unit suite is green under
  `isolate:false`. Polluter is `handlers/lifecycle-verbs.test.ts` (mocks `lifecycle-index` + `promote-demote`),
  with 4 latent siblings; full diagnosis + the measured tuning prize are in `notes-cli-test-hardening.md`. Then
  Task 3.4 lands `isolate:false` + the wall-time re-measure.

- **PR URL:** [none]
- **Completed:** [none]

---
