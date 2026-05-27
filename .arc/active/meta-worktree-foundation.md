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
- **Next Task:** Task 5.1 — `init-work-unit` worktree-creating mode (delegation + mode selection) (line ~632)
- **Blockers:** [none]

- **Next Action:** Begin Task 5.1 per the ratified Phase 5 design (`notes-worktree-foundation.md` § Phases 5 & 6,
  commit `883f59db`): 5.1 is workflow-doc delegation + caller-driven mode selection; the `git worktree add` +
  fresh-meta scaffold live in the 5.2 CLI primitive. Consult `strategy-work-organization.md`.

---
