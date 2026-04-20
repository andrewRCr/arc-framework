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
- **Next Task:** Task 1.4.b — Document per-file frontmatter schema (line ~239)
- **Last Completed:** Task 1.4.a — Renamed `pre-merge-review` method → `diff-review` with broadened
  generic-activity framing; ref-def anchor `[arc-methods-pmr]` → `[arc-methods-diff-review]`.
  Extension keeps name `pre-merge-review`; all extension references preserved. Two-copy sync
  applied. 13 files edited; Tier 1 gate clean (markdownlint + shellcheck). Spec-scope residuals
  flagged: backlog files out of 1.4.a scope (persistent-context note added).
- **Blockers:** [none]
- **Next Action:** Begin Task 1.4.b — document per-file frontmatter schema in
  `strategy-session-operations.md` § Method and Extension Loading. Methods schema fields:
  `name`, `description`, `workflow` (primary caller), `related`, `has-override`. Extensions schema:
  same except `has-steps` replaces `has-override`. Two-copy sync across `.arc/` and
  `packages/arc-framework/arc/`.
