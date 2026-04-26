# Status: Session-Init Optimization

## Active Work

- **State:** In Progress
- **Branch:** technical/session-init-optimization
- **Task List:** `.arc/active/technical/tasks-session-init-optimization.md`
- **Next Task:** 5.7.b — Session-init integration removal (first per
  resolved execution order: 5.7.b → 5.7.a → 5.7.c → 5.7.d → 5.7.e →
  5.7.f → 5.7.g → 5.7.h → 5.7.i)
- **Last Completed:** `/arc-task-audit 5.7` — findings folded into the
  task list. Resolutions captured in Phase 5.7 preamble: agent
  classification path retired entirely; execution order set 5.7.b
  first; 5.7.g re-scoped as no-op (add-agent.md already pivoted in
  `27174b8`); 5.7.f primary surface named (`init-recipe.json`).
  Subtasks 5.7.a–i amended in place. Tools-prompt semantics rename
  captured to ATOMIC-INBOX.md as a follow-on.
- **Blockers:** none
- **Next Action:** Begin Task 5.7.b — remove Step 4 item 3 (agent-
  specific file conditional load) from `session-init.md`, update Step 4
  parallelism guidance for the renumbered loadset, drop the
  `{AGENT}.ARC.md` row from `AGENT-BRIEFING.ARC.md`'s Key Documents
  table. Two-copy sync. Docs-only edit; no code or test impact.
