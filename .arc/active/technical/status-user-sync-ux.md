# Status: User Sync UX Polish

## Work Unit Metadata

- **State:** In Progress
- **Branch:** technical/user-sync-ux

- **Spec:** `prd-user-sync-ux.md`
- **Task List:** `tasks-user-sync-ux.md`
- **Sibling Work Unit(s):** [none]

- **Last Completed:** Task 4.3 — Session-init load cascade (Tasks 4.3.b probe-side `loadNeeded` signal +
  4.3.c workflow Step 2 notes-load dispatch; parent 4.3 closed)
- **Next Task:** Task 4.4 — JIT commit-format loading at arc-commit (line ~1020)
- **Blockers:** [none]

- **Next Action:** Begin Task 4.4 per Phase 4 implementation order (4.4 → 4.5.a → 4.5.b → 4.5.c → 4.6.b).
  Drop the `commit-format.md` + `commit-context-format.md` load set from session-init Step 3 under
  `session.commit_interlock: on-task-approval` — methods now load via arc-commit Step 3 (or
  prepare-commits frontmatter) at first commit, not on every session start. Touches `session-init.md`
  and `session-init.contributor.md` (both copies in `.arc/` and `packages/arc-framework/arc/`) and
  `strategy-session-operations.md` (`### Commit-Interlock Load-Set` subsection removal). Behavioral
  check via grep — no tests pin the load-set Reads at session-init.

---
