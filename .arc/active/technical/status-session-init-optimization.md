# Status: Session-Init Optimization

## Active Work

- **State:** In Progress
- **Branch:** technical/session-init-optimization
- **Task List:** `.arc/active/technical/tasks-session-init-optimization.md`
- **Next Task:** 4.3.a — Commit/task flow cluster (line ~2953)
- **Last Completed:** Task 4.2.g.f — Markdown surface for DEV-RULES domain-rules (closes
  4.2.g as a coherent unit). Session-init Step 4 item 5 rewritten (two-copy) to point
  agents at the probe's `domainRules` field instead of per-session `constitution/` scans;
  Step 2 probe table gained a `domainRules` row (`value.rules`: `{path, domain, purpose}`
  tuples, `value.warnings`: parse diagnostics), Field column widened via
  `markdown-table-prettify` to fit. New `template-dev-rules.md` (two-copy + added to
  `init-recipe.json`) scaffolds adopter domain files — case contract framed as mechanical
  (probe + pre-commit hook enforce it), not convention, with `DEV-RULES.FRONTEND.md` /
  `domain: frontend` worked example. Drift Item #6 in `plan-docs-content-sweep.md` tracks
  docs-site exposure for a later sweep. Tier 2 gates clean (220 markdown files, 991 unit +
  46 E2E tests, typecheck, ts/sh lint, build, domain-rules + method-triggers audits).
- **Blockers:** none
- **Next Action:** Resume 4.3.a — operational-context audit on `3_process-task-loop.md`
  (269 lines) + `prepare-commits.md` (157 lines). Same protocol as 4.2 subtasks: extract
  non-operational content to `notes-docs-content-sweep.md` staging, leave
  `[TODO-docs-site]` placeholders, two-copy sync per file. Cluster is cohesive on the
  commit/task completion loop; the MD046 structural issue on
  `3_process-task-loop.template.md` was pre-fixed during an earlier CI unblock, so this
  audit only does the operational-context pass.
