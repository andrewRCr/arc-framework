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
- **Next Task:** Task 3.10 — ADR-013 sanity check, PRD refresh, and finalize (line ~1022)
- **Last Completed:** Task 3.9 — CLI test coverage for per-file restructure. 7 new test cases plus
  3 extra classification assertions across 5 test files. Unit: extension path and READMEs
  pinned to landed classification (`Configurable` for per-file methods/extensions, `Framework`
  for READMEs) — the planning-phase "all 18 Framework" framing was rejected because Framework
  wholesale-replaces on update, which would obliterate adopter `.override` / `.actions` content.
  Integration (init): fresh install verifies 18 files on disk + manifest 16/2 Configurable/Framework
  split. Integration (update): idempotent re-update (manifest byte-identical, zero churn on
  per-file paths) + legacy aggregate no-op (seeded `arc-methods.md`/`arc-extensions.md` survive
  `arc update` untouched, never enter manifest). E2E: `arc init --yes` layout + classification;
  `arc init --reconfigure` snapshots confirm per-file content byte-identical across reconfigure.
  Hook cross-flow bullet dropped as duplicate — CHECK 12/13/14 validator logic covered by
  dedicated unit/integration tests; routing negative path owned by Task 3.12. Tier 1 gates clean
  (lint:ts, typecheck:test, markdown lint on the edited task list; targeted vitest: 52 unit / 63
  integration / 22 E2E pass). Previous: `79162d1` Task 3.8.d — Delete aggregates + install-pipeline
  cleanup + grep-verify.
- **Blockers:** [none]
- **Next Action:** Begin Task 3.10 — ADR-013 sanity check, PRD refresh, and finalize. Read full
  PRD; verify ADR-013 amendment matches landed state on the five checklist points (per-file
  structure, schema field names, session-init Step 2 split mechanism, `pre-merge-review` →
  `diff-review` rename, CI-enforced reliable-trigger invariant); rewrite L164–167 of the
  amendment if the "aggregated frontmatter scan" language still appears; refresh PRD bullets
  (P0.5 drop `workflow` + rename `has-override` → `override-active`, P0.6 rename `has-steps` →
  `active`, P0.8 rewrite the session-init consumption model to the split mechanism, P1.13 verify
  against shipped Step 2, narrow "Session-Init Consumption Model" § and "Constitutional Rule
  Framing" § per the 3.5.b safety pass, audit other P0.x bullets for stale schema references);
  decide whether the notes-file § Compliance-Reliability Grounding folds into scope (persistent
  context flag from SESSION-NOTES) or stays as historical record; remove amendment draft marker;
  two-copy sync ADR + strategy files.
