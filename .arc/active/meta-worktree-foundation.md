# Metadata: Worktree Foundation

- **State:** Active
- **Owner:** andrew
- **Branch:** feat/worktree-foundation

- **Origin:** [internal]
- **Design:** `spec-worktree-foundation.md`

- **Depends On:** work-organization-reform
- **Cohort:** agile-parallelism

- **Task List:** tasks-worktree-foundation.md
- **Last Completed:** Task 4.2 — Retired-subdir reconciliation: 4.2.a pure `planRetiredSubdirReconcile`
  (`lib/user-sync/`), 4.2.b.i load/pull removal-with-backup wired into `runUserLoad`, 4.2.b.ii read-only
  session-init detection slot (`lib/session-init/retired-subdir-detection.ts`).
- **Next Task:** Task 4.3 — Orphan-warning messaging (T2 grouped + T1 rename-detection) (line ~535)
- **Blockers:** [none]

- **Next Action:** Begin Task 4.3 — orphan-warning messaging. Compute grouping (4.3.a, P0) + content-equivalence
  rename (4.3.b, P1) at the detection site in `runUserLoad` (where `localFiles` + `loadManifest.files` names and
  contents are in hand); emit a **structured classification** (rename-candidate / grouped-retirement / generic),
  not flat strings, with the pure classifier in `lib/user-sync/`. See `notes-worktree-foundation.md` § Phase 4
  forward-compat cross-check.

---
