# Status: Session-Init Optimization

## Active Work

- **State:** In Progress
- **Branch:** technical/session-init-optimization
- **Task List:** `.arc/active/technical/tasks-session-init-optimization.md`
- **Next Task:** 4.2.g.b — Probe module `runDomainRulesSessionInitStatus` (line ~2763)
- **Last Completed:** Task 4.2.g.a — `parseDevRulesFrontmatter` schema parser. Shipped
  `src/lib/frontmatter/dev-rules.ts` with flat `{domain, purpose}` schema, case-insensitive
  filename-fragment match against `DEV-RULES.{DOMAIN}` basename, non-empty `purpose` enforced, extra
  unknown keys accepted. Exported via `frontmatter/index.ts`. 12 tests covering 11 spec'd behaviors +
  case-insensitive match affirmation; Tier 1 gates clean.
- **Blockers:** none
- **Next Action:** Begin 4.2.g.b — new `src/commands/constitution/` module (types, status, format,
  barrel) with `runDomainRulesSessionInitStatus` probe. Enumerates `DEV-RULES.*.md` in
  `reference/constitution/`, filters by parse success, returns `{path, domain, purpose}` tuples plus
  `warnings[]`. Test-first against a fixture tree per extensions probe precedent. Verify
  missing-directory handling against extensions probe during implementation and match it.
