# Metadata: Worktree Foundation

- **State:** Active
- **Owner:** andrew
- **Branch:** feat/worktree-foundation

- **Origin:** [internal]
- **Design:** `spec-worktree-foundation.md`

- **Depends On:** work-organization-reform
- **Cohort:** agile-parallelism

- **Task List:** tasks-worktree-foundation.md
- **Last Completed:** Task 4.4 — Coherence-WU schema seam (`.sync-state.json`): 4.4.a extracted
  `LocalSyncState` and its read/write/marker helpers to `lib/user-sync/sync-state.ts`; 4.4.b bumped the schema
  to v4 (worktree-aware, reserved `priorFileList` / `remoteMarkerProvenance` seams, reserved-field round-trip);
  4.4.c recorded the partial-push-surface widening. **Phase 4 complete** (Tasks 4.1–4.4).
- **Next Task:** Task 5.1 — `init-work-unit` worktree-creating mode (line ~624)
- **Blockers:** [none]

- **Next Action:** Begin Task 5.1 — give `init-work-unit` a worktree-creating mode (`git worktree add
  <templated-path> -b plan/{name}`, path resolved via the Phase 1 location template) while retaining the in-place
  `git checkout -b` mode for the single-worktree / atomic-launchpad case (5.1.b). Consult
  `strategy-work-organization.md`.

---
