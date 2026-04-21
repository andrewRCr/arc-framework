# Status: Session-Init Optimization

> **About this file:** Per-WU state pointer — committed alongside task list updates
> in the same atomic operation. Lightweight factual state so anyone on this branch
> can see where work stands at a glance.
>
> **Companion:** `user/{identity}/SESSION-NOTES.md` (gitignored) carries personal
> session context. Together they implement P5 (Context Preservation). See
> `session-handoff.md` for the update protocol.

## Active Work

- **State:** In Progress
- **Branch:** technical/session-init-optimization
- **Task List:** `.arc/active/technical/tasks-session-init-optimization.md`
- **Next Task:** Task 3.5.a — define "active-extensions list"
  vocabulary in strategy doc (line ~627)
- **Last Completed:** Task 3.4 — D7a link-resolution pre-commit hook
  (committed `366b7c8`). Since then: Task 3.5 rescoped during a
  pre-implementation audit + discussion. Original plan (read frontmatter
  of all 16 method/extension files at init) revised to a cleaner
  architecture: methods retire from init-time reading entirely (body
  always loads at workflow trigger; override-presence surfacing serves
  no decision); extensions enumerate via single `grep -l "^active:
  true"` producing an **active-extensions list** carried in session
  context, with fire-point directives consulting the list by name to
  avoid re-reading placeholder extension files mid-session. Task list
  updated accordingly: 3.5 now has 3.5.a–d subtasks (strategy doc,
  session-init, 6 fire-point workflows, READMEs); 5.5.a narrowed to
  agent-file-only scope with precise `grep -m 1 "^active:"` read;
  5.5.b, 5.6.b, 6.4, and success criteria updated to match. PRD +
  notes + ADR-013 refresh folded into Task 3.10 sweep (not
  mid-stream).
- **Blockers:** [none]
- **Next Action:** Begin Task 3.5.a — add canonical definition of
  "active-extensions list" to `strategy-session-operations.md §
  Method and Extension Loading`. Retire the existing sentence about
  reading `override-active` / `active` at init. Cross-reference Task
  5.5.a's agent-file pattern as related-but-distinct. Two-copy sync.
