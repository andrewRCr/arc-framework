# Metadata: Worktree Foundation

- **State:** Active
- **Owner:** andrew
- **Branch:** feat/worktree-foundation

- **Origin:** [internal]
- **Design:** `spec-worktree-foundation.md`

- **Depends On:** work-organization-reform
- **Cohort:** agile-parallelism

- **Task List:** tasks-worktree-foundation.md
- **Last Completed:** Task 1.2 — Worktree location template config key (`worktree.location_template`): freeform
  config key (default `../{repo}.{branch}`) registered across both copies + inline docs, plus the pure
  `resolveWorktreeLocation` helper (`lib/git/worktree-location.ts`).
- **Next Task:** Task 1.3 — Worktree-ownership marker primitive (line ~70)
- **Blockers:** [none]

- **Next Action:** Begin Task 1.3 (marker schema + write/read lib, generated `.gitignore` entry, and the single
  gating-decision fn — the `merged`-check is greenfield here) per `3_process-task-loop.md`.

---
