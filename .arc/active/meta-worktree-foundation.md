# Metadata: Worktree Foundation

- **State:** Active
- **Owner:** andrew
- **Branch:** feat/worktree-foundation

- **Origin:** [internal]
- **Design:** `spec-worktree-foundation.md`

- **Depends On:** work-organization-reform
- **Cohort:** agile-parallelism

- **Task List:** tasks-worktree-foundation.md
- **Last Completed:** Task 5.4.b — session-entry dispatch relocated into `session-init` (Step 2 `Entry
  dispatch`); `arc-session` thinned to a pointer.
- **Next Task:** Task 5.4.c — Optional-arg seed (confirmed before use) (line ~780)
- **Blockers:** [none]

- **Next Action:** Build Task 5.4.c — thin `arc-session` forwards `/arc-session <pointer>` into session-init's
  cold-start arm (via `arc start --here --from`: issue → Origin, `spec-`/`draft-` → Design, else pass-through),
  confirmed before use. Detail in the task list (5.4.c) + `notes-worktree-foundation.md` § Phases 5 & 6.

---
