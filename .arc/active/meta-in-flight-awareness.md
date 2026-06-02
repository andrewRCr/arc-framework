# Metadata: In-Flight Awareness

- **State:** Active
- **Owner:** andrew
- **Branch:** feat/in-flight-awareness

- **Origin:** [internal]
- **Design:** `spec-in-flight-awareness.md`

- **Depends On:** worktree-foundation
- **Cohort:** agile-parallelism

- **Task List:** `tasks-in-flight-awareness.md`
- **Last Completed:** Task 3.2 — `STATUS.USER` view file seeded (gitignored-local single-cache baseline). Phase 2
  (the `Priority` field) complete; Phase 3 in progress (3.1 render standard + 3.2 baseline done).
- **Next Task:** Task 3.3 — `arc status --user` explicit-view command (line ~178)
- **Blockers:** [none]

- **Next Action:** Begin Task 3.3 — build the pure render core (oracle slice → canonical-markdown string,
  test-first), then the `--user` flag + `runStatus` wiring with a bounded network read, then the
  `--local` / `--no-fetch` offline path.

---
