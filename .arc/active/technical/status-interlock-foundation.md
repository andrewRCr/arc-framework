# Status: Interlock Foundation

## Active Work

- **State:** In Progress
- **Branch:** technical/interlock-foundation
- **Task List:** `.arc/active/technical/tasks-interlock-foundation.md`
- **Next Task:** Task 2.2.a — Wire autonomy into `config.value` (line ~205)
- **Last Completed:** Task 2.1 — `arc-config.yml` adds `session.autonomy` resolver (Tasks 2.1.a, 2.1.b)
- **Blockers:** [none]
- **Next Action:** Begin Task 2.2.a — extend `runConfigSessionInitStatus` to call `resolveAutonomyPolicy`
  and surface the resolved-with-provenance shape as a new top-level field on `ConfigSessionInitResult`;
  pass `gitExec` through from `handlers/status.ts`. Test-first across the four listed behaviors.
