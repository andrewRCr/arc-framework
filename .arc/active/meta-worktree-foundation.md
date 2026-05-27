# Metadata: Worktree Foundation

- **State:** Active
- **Owner:** andrew
- **Branch:** feat/worktree-foundation

- **Origin:** [internal]
- **Design:** `spec-worktree-foundation.md`

- **Depends On:** work-organization-reform
- **Cohort:** agile-parallelism

- **Task List:** tasks-worktree-foundation.md
- **Last Completed:** Task 5.2 — Spawn primitive (shared CLI-level scaffolding): `spawnWorktree` +
  `META_FIELDS`/`renderMetaFile`/`parseMetaRecord` + `writeWorktreeOwnershipMarker` in `lib/git` (5.2.b/c/a).
- **Next Task:** Task 5.3 — Cold-start scaffolding primitive; begin with 5.3.a (use-existing path) (line ~693)
- **Blockers:** [none]

- **Next Action:** Begin Task 5.3 (cold-start) — export the file-private `scaffoldIntoWorktree` from
  `worktree-scaffold.ts` for the use-existing path (5.3.a), then the discriminated-outcome spec-input parser
  (5.3.b) + marker semantics (5.3.c). Reuse seam + injection boundary: `notes-worktree-foundation.md`
  § Phases 5 & 6 "Phase 5.2 implementation".

---
