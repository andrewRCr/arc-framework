# Status: Session-Init Optimization

## Active Work

- **State:** In Progress
- **Branch:** technical/session-init-optimization
- **Task List:** `.arc/active/technical/tasks-session-init-optimization.md`
- **Next Task:** 4.2.g.c — Composite wiring + handler integration (line ~2796)
- **Last Completed:** Task 4.2.g.b — Probe module `runDomainRulesSessionInitStatus`. Shipped
  `src/commands/constitution/` (types, status, format, barrel). Frontmatter-presence discriminator;
  ARC/PROJECT silently skipped, malformed files surface in `warnings[]`, missing-directory throws per
  extensions precedent. 9 integration + 4 unit tests. Adjacent incidental: renderer trailing-newline
  fix (commit `b4454c3`) after MD012 regression surfaced from e2e init-suite when `arc:if` stripped
  near EOF.
- **Blockers:** none
- **Next Action:** Begin 4.2.g.c — thread the new probe through the composite orchestrator. Add
  `domainRules` slot to `SessionInitProbeResult`, extend `runSessionInitStatus` `Promise.all`, wire
  `renderSlot("Domain Rules", ...)` into `buildSessionInitStatusSummary`, bind probe in
  `handlers/status.ts`. **Full-mode `StatusResult` gets no new slot** — session-init-only per the
  resolved design. 5 test behaviors enumerated in the task list.
