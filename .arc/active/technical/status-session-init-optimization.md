# Status: Session-Init Optimization

## Active Work

- **State:** In Progress
- **Branch:** technical/session-init-optimization
- **Task List:** `.arc/active/technical/tasks-session-init-optimization.md`
- **Next Task:** 4.2.g.f — Markdown surface (session-init rewrite, template, drift capture) (line ~2898)
- **Last Completed:** Task 4.2.g.e — Sibling `audit-domain-rules.ts` + parser case contract.
  `packages/arc-framework/src/scripts/audit-domain-rules.ts` added; per-file validation
  delegates to `parseDevRulesFrontmatter`. Parser tightened during the task: filename
  fragment must be uppercase, `domain:` lowercase, `fragment.toLowerCase() === domain`
  exactly (A2 asymmetric case contract). Cross-file `domain` uniqueness is now structurally
  guaranteed — the duplicate-domain check was removed as dead code. `package.json` +
  `.github/workflows/ci.yml` add `lint:arc:domain-rules` parallel to `lint:arc:triggers`.
  7 audit tests + 4 parser rejection tests (one inverted from the prior case-insensitive
  acceptance test).
- **Blockers:** none
- **Next Action:** Begin 4.2.g.f — last subtask under 4.2.g. Markdown-only commit. Rewrite
  `session-init.md` Step 4 item 5 (two-copy — project + template) to reference the
  `domainRules` probe slot; add `domainRules` row to the Step 2 probe table; create
  `reference/templates/template-dev-rules.md` (two-copy) with a comment block documenting
  the A2 case contract as a **mechanical requirement** (probe + hook enforced, not
  convention) — see 4.2.g.f description for the explicit wording and worked example; add a
  Drift Item entry in `plan-docs-content-sweep.md` for later docs-site integration.
  Completing this marks 4.2.g as a coherent unit — triggers Tier 2 gates per
  process-task-loop § Coherent unit completion.
