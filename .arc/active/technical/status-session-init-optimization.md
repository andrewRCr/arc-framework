# Status: Session-Init Optimization

## Active Work

- **State:** In Progress
- **Branch:** technical/session-init-optimization
- **Task List:** `.arc/active/technical/tasks-session-init-optimization.md`
- **Next Task:** 5.6.a — Companion resolution + envelope shape
  (test-first) (line ~3974)
- **Last Completed:** Task 5.6 audit (pre-impl): restructured 5.6 from
  3 subtasks (impl/test/doc) to 2 (test-first impl + doc), corrected
  derivation rule to read `**Task List:**` field with Full-only pattern
  match, deferred Lite-shape handling (`companions` omitted), folded
  user-facing summary into 5.6.a scope. Forward-compat callback for Lite
  companion-naming + composite-probe path added to `plan-arc-modes.md`
  header.
- **Blockers:** none
- **Next Action:** Begin Task 5.6.a — extend `ActiveSessionInitResult`
  with optional `companions?: { notes, atomic }`, populate in
  `resolveSessionInit` for Full-pattern task lists only, render in
  `buildActiveSessionInitSummary`. Test-first per the 9 behaviors
  enumerated in 5.6.a (batching judgment per process-task-loop applies).
