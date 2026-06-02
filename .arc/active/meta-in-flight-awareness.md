# Metadata: In-Flight Awareness

- **State:** Active
- **Owner:** andrew
- **Branch:** feat/in-flight-awareness

- **Origin:** [internal]
- **Design:** `spec-in-flight-awareness.md`

- **Depends On:** worktree-foundation
- **Cohort:** agile-parallelism

- **Task List:** `tasks-in-flight-awareness.md`
- **Last Completed:** Task 5.2 — Oracle-back the errand-launch foreign-artifact gate (line ~304). Phase 5
  complete: both the activation in-flight scope check (5.1) and the errand-launch foreign-artifact gate (5.2)
  are oracle-backed — cross-worktree + cross-machine, advisory, never gating.
- **Next Task:** Task 6.1 — Gated-slot affordance over the orchestrator (line ~325)
- **Blockers:** [none]

- **Next Action:** Begin Task 6.1 — evolve the status orchestrator (`commands/status/run.ts`) into a gated-slot
  affordance: expensive slots (the oracle network slice) fire only under their condition
  (`active.resolution === "none"`), generalized from Worktree Foundation's roster slot + this WU's oracle slot;
  preserve the `safeProbe` envelope-never-rejects contract and per-slot result shape. Note new Task 6.3 (errand
  consumption swap) added this session.

---
