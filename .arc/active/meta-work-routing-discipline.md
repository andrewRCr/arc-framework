# Metadata: Work-Routing Discipline

- **State:** Active
- **Owner:** andrew
- **Branch:** `feat/work-routing-discipline`

- **Origin:** [internal]
- **Design:** `spec-work-routing-discipline.md`

- **Depends On:** [none]
- **Cohort:** [none]

- **Task List:** `tasks-work-routing-discipline.md`
- **Last Completed:** Task 3.6 — retire the errand queue substrate + capture-flavored `arc-errand` (skill, `arc
  errand queue` CLI, `ERRANDS.md` template/seeding, `errands` parser shape); sweep left inert pending its 4.4.d
  repoint; session-init errand prose repointed onto `run-errand` / `arc-inbox`. Closes Phase 3.
- **Next Task:** Task 4.1 — `inboxState` probe lib (test-first) (line ~618)
- **Blockers:** [none]

- **Next Action:** Start Task 4.1 — author the `inboxState` probe lib (`src/lib/session-init/inbox-state.ts`):
  pure `runInboxState({ content })` over `USER-INBOX` returning `{ routableCount, housekeepNeeded }`, test-first
  per the build list.

---
