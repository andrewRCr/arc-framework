# Status: Session-Init Optimization

## Active Work

- **State:** In Progress
- **Branch:** technical/session-init-optimization
- **Task List:** `.arc/active/technical/tasks-session-init-optimization.md`
- **Next Task:** 4.4.b — Relocate Quick Format Checklist into `2_generate-tasks.md` Step 4
  (line ~3124)
- **Last Completed:** Task 4.4.a — `template-tasks.md` created (both copies, 216 lines;
  template-completion-doc convention: variants under headings, nested code blocks, curly-brace
  placeholders, prose pointers to strategy doc). Phase-header template ships without a
  `**Strategies:**` field. `2_generate-tasks.md` Step 3 updated in both copies: dropped
  "under the phase header or" option, reframed closer to "use when the connection isn't
  obvious from the task title". `tasks-arcd-rebrand.md` swept — document-level `**Strategies:**`
  block removed (L33-36) along with three orphaned reference-link definitions
  (`[package-sync]`, `[file-classification]`, `[config-arch]`). Tier 1 markdownlint clean.
- **Blockers:** none
- **Next Action:** Begin Task 4.4.b — relocate the Quick Format Checklist from
  `strategy-task-list-formatting.md` § Quick Format Checklist into `2_generate-tasks.md`
  Step 4 ("Write and Save Task List") at the appropriate point. Update cross-references in
  callers (DEV-RULES.ARC, 2_generate-tasks.md body, etc.) if link targets shift. Two-copy
  sync on both files. Batched with 4.4.c per user approval: continue through 4.4.c (trim
  `strategy-task-list-formatting.md` to rules-only, apply operational-context audit, target
  ~70 lines aligned with `strategy-workflow-authoring.md`).
