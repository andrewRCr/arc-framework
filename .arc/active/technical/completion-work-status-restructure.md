# Completion: Work-Status Restructure

**Completed**: 2026-04-16
**Branch**: technical/work-status-restructure
**Category**: Technical
**Context**: Roadmap-scheduled restructure to fix structural flaws in the singular
`.arc/active/WORK-STATUS.md` model surfaced during session-state portability work.

## Summary

Replaced the singular tracked `.arc/active/WORK-STATUS.md` with per-work-unit status files
(`.arc/active/{category}/status-{name}.md`), eliminating the parallel-WU concurrency flaw
and the base-branch-staleness dead-end under full branch protection. Disentangles the
project pointer (per-WU, tracked, deleted at archive) from the session pointer
(per-developer, gitignored, portable via git notes) — correcting a pre-existing ADR-007
conflation without superseding the decision itself.

## Key Deliverables

- **New structural model** shipped across 5 foundation docs (ADR-007 Tier 2 Amendment,
  DEV-RULES.ARC, `arc-methods.md`, `strategy-session-operations.md`,
  `strategy-team-coordination.md` full rewrite) and `strategy-work-organization.md` full
  rewrite — in-scope expansion surfaced mid-execution
- **Per-WU status file template** at `.arc/reference/templates/template-status.md`
  with `**State:**` as the load-bearing lifecycle marker; `**Status:**` header retired
  from the task list template
- **Nine workflow files updated** for per-WU status file discovery, travel across
  rotating branches, and deletion (not reset) at archive
- **New `deactivate-work-unit.md` workflow** — Case A primary procedure with routing
  pointers to Cases B/C/D
- **SESSION-NOTES `**Working On:**` field** — four-marker vocabulary
  (`status-{name}.md`, `[none]`, `[planning: {category}/{name}]`, `[between work units]`)
  codified identically across `session-handoff.md`, `session-init.md`, and the template
- **Live migration of this WU's own state** — Phase 3 cutover from singular WORK-STATUS
  to per-WU `status-work-status-restructure.md` (meta-circular dogfood, Task 3.1)
- **Machinery update** — retired the `.gitattributes` `merge=ours` rule (silent-discard
  footgun under the new model) and rewrote pre-commit CHECK 10 to derive the sibling
  status file from the staged task list's directory (trivial under the per-WU model)
- **Contributor-personal file rename** — `user/{identity}/WORK-STATUS.md` →
  `user/{identity}/status-contributor.md`, retiring the last `WORK-STATUS.md` filename
  in the repo
- **Package-source mirroring** — every Framework/Configurable edit synced between
  `.arc/` and `packages/arc-framework/arc/` per `strategy-package-project-sync.md`

## Implementation Highlights

- **ADR-007 refined, not superseded.** Tier 2 Amendment disentangles per-developer
  session state (correct, unchanged) from per-WU project pointer (was incorrectly
  singular). The original decision's actual content stands.
- **Mid-execution scope expansion, Phase 1.** `strategy-team-coordination.md` surfaced
  16 WORK-STATUS references beyond the planned § Concurrent Sessions scope;
  `strategy-work-organization.md` was completely unscoped originally and contributed 7
  more. Widening scope mid-batch produced shipping-clean results on both strategies
  rather than narrow patches. Design decisions documented in
  `notes-work-status-restructure.md` § Consequences.
- **Deactivation workflow scoped to Case A only.** `deactivate-work-unit.md` ships the
  one in-scope case (planning abandonment before PRD) as the primary procedure;
  Cases B/C/D (archival, supersession, incidental pause) remain as pointers to
  existing workflows — no duplication.
- **Six atomic tasks completed alongside planned work.** Captured in
  `atomic-work-status-restructure.md`: husky pre-commit exit-code propagation fix,
  session workflow error-handling package-source sync, CI drift check for Framework
  files (vitest integration test), SESSION-NOTES signal-discipline restructure,
  session-init context-load audit (outcome: separate WU in backlog), and status-file
  template content-discipline guidance.
- **Meta-circular verification.** This WU exercised the new model on itself at Phase 3
  cutover — the `.arc/active/WORK-STATUS.md` → `.arc/active/technical/status-work-status-restructure.md`
  migration was the first real test of per-WU status file discovery, travel, and
  integration readiness.

## Verification

- **Quality gates**: Tier 3 all passed as of Task 7.1 — markdown lint (0 violations),
  TypeScript lint, shell lint, typecheck, 575/575 tests, build. CI expected to match.
- **Success criteria**: 21 of 22 met + 1 superseded-by-design. The superseded criterion
  ("Rebrand WU reactivates cleanly on the new model") is unsatisfiable until post-merge
  by construction — structural enablers are in place (model shipped, rebrand task list
  mechanical references cleaned at Phase 7); validation deferred to the rebrand WU's
  next reactivation session.

## Related Documentation

- PRD: `.arc/active/technical/prd-work-status-restructure.md`
- Tasks: `.arc/active/technical/tasks-work-status-restructure.md`
- Notes: `.arc/active/technical/notes-work-status-restructure.md`
- Atomic companion: `.arc/active/technical/atomic-work-status-restructure.md`

## Follow-Up Work

- **Rebrand WU post-merge validation.** The one superseded Success Criterion validates
  at the rebrand WU's next reactivation session — first real exercise of per-WU status
  file discovery across rotating branches.
- **Session-init context-load optimization** — queued as
  `backlog/technical/plan-session-init-optimization.md` from the Task 7.1 audit atomic.
  Roadmap-scheduled immediately after this WU merges.
- **Supplemental/ directory split** (ATOMIC-INBOX, non-blocking) — observation captured
  during 2026-04-11 Finding #16 resolution about splitting
  `.arc/system/workflows/arc/supplemental/` into session-adjacent vs installation-level
  categories. Cleanup-eligible any time; explicitly decoupled from this WU.
