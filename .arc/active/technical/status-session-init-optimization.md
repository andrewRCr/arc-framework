# Status: Session-Init Optimization

## Active Work

- **State:** In Progress
- **Branch:** technical/session-init-optimization
- **Task List:** `.arc/active/technical/tasks-session-init-optimization.md`
- **Next Task:** 5.6 — Companion-file paths in composite probe
  (line ~3956)
- **Last Completed:** Task 5.5 — DEV-RULES section-level partial-read
  evaluation: all four candidates → `up-front-load`; default holds, no
  structural change to `session-init.md` Step 4. 5.5.b deferred
  (rationale captured at commit instead). Adjacent trim opportunity for
  § Task Execution "One task at a time" duplication captured to atomic
  file.
- **Blockers:** none
- **Next Action:** Begin Task 5.6 — surface companion-file paths
  (`notes-{name}.md`, `atomic-{name}.md`) in composite probe envelope
  to eliminate agent-side `ls` at session-init item 10. Run
  `/arc-task-audit` first to surface assumptions before implementation
  (TS-only; no markdown two-copy concern).
