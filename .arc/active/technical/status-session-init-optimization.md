# Status: Session-Init Optimization

## Active Work

- **State:** In Progress
- **Branch:** technical/session-init-optimization
- **Task List:** `.arc/active/technical/tasks-session-init-optimization.md`
- **Next Task:** 4.2.g.e — CI audit — extend `audit-method-triggers.ts` (line ~2847)
- **Last Completed:** Task 4.2.g.d — Pre-commit hook for DEV-RULES frontmatter validation. New
  CHECK 13 in both `pre-commit` copies (renumbered 13→14, 14→15). `validate-frontmatter.ts`
  extended with a `"domain-rules"` classification plus a `DOMAIN_RULES_RESERVED` set that
  filters `ARC` / `PROJECT` at the classifier level. 9 behavior tests added
  (4 `classifyPath` + 5 `validateFiles`). End-to-end smoke-tested via `git add` + `bash
  pre-commit` — invalid fixture surfaces the expected diagnostic, valid fixture passes.
- **Blockers:** none
- **Next Action:** Begin 4.2.g.e — evaluate script cohesion for the CI audit: extend
  `audit-method-triggers.ts` vs. create sibling `audit-domain-rules.ts`. Inspect the existing
  script to decide, then implement DEV-RULES validation: frontmatter parses, `domain` matches
  filename, `domain` values are unique across files; non-blocking empty pass when zero domain
  files exist. 5 test behaviors enumerated in the task list.
