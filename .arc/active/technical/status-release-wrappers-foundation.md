# Status: Interlock Release Wrappers — Foundation

## Work Unit Metadata

- **State:** In Progress
- **Branch:** technical/release-wrappers-foundation

- **Spec:** `prd-release-wrappers-foundation.md`
- **Task List:** `tasks-release-wrappers-foundation.md`
- **Sibling Work Unit(s):** `plan-release-wrappers-ergonomics.md`

- **Last Completed:** Task 2.1 — `arc release commit` refusal cascade
  (12 → 10 → 13 → 11) + `formatRefusal()` output + audit entry per refusal +
  `git commit` spawn-never-fires invariant.
- **Next Task:** Task 2.2 — Success path: git invocation + audit entry
  (line ~207)
- **Blockers:** [none]

- **Next Action:** Begin Task 2.2 — wire the wrapped `git commit` spawn
  (`stdio: ['inherit', 'pipe', 'pipe']`) into the orchestrator's authorize
  branch, capture stdout for hash extraction (or fall back to
  `git rev-parse HEAD` post-success), bubble git's exit code verbatim, and
  write the success (`kind: "commit"`) or hook-failed
  (`kind: "hook-failed"`) audit entry. Replace the rejection sentinel in
  `runReleaseCommit` and the `realSpawnGit` stub in `commit-cli.ts`.

---
