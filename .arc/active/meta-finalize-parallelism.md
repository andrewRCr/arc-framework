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
- **Last Completed:** Phase 3 (burn-in wave 1) complete — all five 3.2 matrix cells + 3.3 detectors verified,
  3.4 findings recorded; both probes shipped, foreign-write and hook-env seams fixed on `main` and merged into FP.
- **Next Task:** Task 4.1 — wave-2 slate (one code WU + one doc WU); Phase 4 preamble (line ~593)
- **Blockers:** [none] — both prior blockers (`slug-state-oracle-alignment`, `notes-export-replay-ordering`,
  the latter meta's `notes-export-state-coherence`) shipped and merged into FP.

- **Next Action:** Begin Phase 4, Task 4.1 (wave-2 slate). First, resolve the open design decision captured in
  `notes-finalize-parallelism.md` § Dogfood finding (2026-07-13): worktree self-teardown terminates the session —
  decide interim-messaging vs. structural decouple-and-bless-manual-deletion vs. both, coordinating downstream with
  `wu-lifecycle-state-model`; hold the interim messaging errand until that call. Optional bounded probe-A
  rollout-log check to settle whether it hit the same self-termination (not a rabbit-hole).

- **PR URL:** [none]
- **Completed:** [none]

---
