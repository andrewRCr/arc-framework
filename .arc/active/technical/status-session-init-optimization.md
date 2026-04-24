# Status: Session-Init Optimization

## Active Work

- **State:** In Progress
- **Branch:** technical/session-init-optimization
- **Task List:** `.arc/active/technical/tasks-session-init-optimization.md`
- **Next Task:** 4.4.a — Extract templates to `template-tasks.md` + apply resolved `**Strategies:**`
  convention change (line ~3051)
- **Last Completed:** Task 4.3.c — `session-handoff.md` audit. 473 → 450 (5%), standard posture
  bounded by ADR-016 preservation constraint. Four trims: Design context compressed to override
  pointer (→Entry 21, pairs with Entry 11); `Preserve persistent context` paragraph compressed
  (pure dedup with § Comprehensive Handoff Format step 1 + § Persistent Context); `Long-session
  bias` paragraph dropped (redundant with Audience framing + Anti-patterns counter-examples);
  Error-handling bullets compressed to recognition list (→Entry 22 with root-cause teaching).
  Structural scaffolding preserved — rotation template, Save-to-Git-Notes section, Confirm
  Handoff, Handoff Examples, Anti-patterns block — all attachment points for ADR-016's
  handoff-interior expansion. Agent-audience lens (no inline placeholders). Template suffix
  file; two-copy diff clean except expected team.mode block. Tier 1 markdownlint clean.
- **Blockers:** none
- **Next Action:** Begin Task 4.4 — Task-list-formatting restructure (P1.4, three moves:
  4.4.a extract templates, 4.4.b relocate Quick Format Checklist, 4.4.c trim
  strategy-task-list-formatting.md). Starts with 4.4.a: new file
  `.arc/reference/templates/template-tasks.md` capturing feature/technical header template,
  incidental header template, verification phase block, atomic companion template, success
  criteria block; apply resolved task-level-only `**Strategies:**` convention (drop phase-header
  variant from `2_generate-tasks.md` Step 3 and sweep `tasks-arcd-rebrand.md`); two-copy sync
  on both new template file and `2_generate-tasks.md`.
