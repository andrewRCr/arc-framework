# Metadata: finalize-parallelism

| **State** | **Owner** | **Branch**                  | **Class** | **Priority** |
| --------- | --------- | --------------------------- | --------- | ------------ |
| `Active`  | `andrew`  | `feat/finalize-parallelism` | `Heavy`   | `P1`         |

- **Cohort:** `agile-parallelism`
- **Depends On:** [none]

- **Origin:** [internal]
- **Design:** `spec-finalize-parallelism.md`
- **Task List:** `tasks-finalize-parallelism.md`

- **Current Workflow:** [none]
- **Last Completed:** Task 4.1 — wave-2 workload launched: both code WUs spawned into provisioned worktrees
  (`commit-message-submission`, `worktree-teardown-decoupling`); `start-class-flag` split-out shipped (PR #236);
  execution-locus finding recorded and `session-locus-model` stub pulled forward inside the GA gate (PR #238).
- **Next Task:** Task 4.2 — verify off-primary node quality gates and dependency provisioning (line ~638)
- **Blockers:** [none]

- **Next Action:** FP-side work is now event-driven off the wave-2 sessions: collect 4.2 gate evidence at either
  wave WU's first full gate run (or run the gate set directly in a wave worktree), then 4.3 re-graduation
  (vehicle + `Depends On` question decided there). Wave WUs groom/execute in their own worktree sessions;
  `session-locus-model` grooming (`--plan`) may run beside wave 2 but executes only after wave-3 evidence.

- **PR URL:** [none]
- **Completed:** [none]

---
