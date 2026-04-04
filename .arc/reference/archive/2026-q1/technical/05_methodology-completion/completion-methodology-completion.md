# Completion: Methodology Completion

**Completed**: 2026-03-06
**Branch**: `technical/methodology-completion`
**Category**: Technical
**Context**: WU2 — implements all WU1/WU1.5 design decisions across ARC methodology documentation

## Summary

Implemented 55+ design decisions from WU1 (Philosophy & Configurability) and WU1.5 (Foundational Gap
Closure) across ARC's methodology documentation. Restructured core documents, built the complete
customization infrastructure (config, hooks, extensions, methods), overhauled session workflows, applied
ADR-008 Core/PM decomposition, and closed all convention and workflow gaps identified across two rounds
of systematic audit. The framework now has a coherent, configurable methodology with strong defaults
that teams can adapt to their context.

## Key Deliverables

- **Core document restructure**: DEV-RULES split into ARC (behavioral rules) and PROJECT (quality
  gates), `strategy-development-methodology.md` redistributed to DEV-RULES.ARC + arc-methods.md
- **Customization infrastructure**: `arc-config.yml` expanded from 2 to 13 settings, `arc-methods.md`
  with 7 configurable methods, `arc-extensions.md` with 8 preset extension points, all integrated
  into workflows
- **Configurable hooks**: commit-msg and pre-commit hooks read from arc-config.yml — commit format,
  context footer, merge strategy, task numbering all configurable
- **Session workflow overhaul**: Bootstrap/no-active-work state, triple-anchor task references,
  two-tier mismatch recovery with trust hierarchy, staleness detection, persistent context convention
- **ADR-008 Core/PM decomposition**: Core workflows contain zero direct PM artifact references;
  PM behavior flows through extension points. TASK-INBOX.md and weekly-review.md removed from
  framework. Task lists gain atomic tasks section for WU off-plan work.
- **Multi-branch model**: rotate-branch.md workflow, three-operation model (Rotate/Integrate/Archive),
  coupling language fixed across all workflow and strategy docs
- **Team mode awareness**: Workflow adaptations section, team callouts in session workflows,
  person-to-person handoff protocol, per-pair qualifications
- **ADR-007 naming migration**: CURRENT-SESSION split into WORK-STATUS.md (tracked) +
  SESSION-NOTES.md (gitignored) across 30+ files
- **Convention gaps closed**: Document evolution guidance (ADR amendment three-tier model),
  intermediate work-unit status (Integrated), archive ceremony scaling, deferred review stop
  conditions, Core/arc-in-git boundary enforcement in workflows
- **Guidance discovery**: STRATEGY-INDEX enriched with trigger hints, strategy declaration in
  task generation, SKILL.md trigger mechanism adopted (ADR-011)
- **Naming conventions**: Documented in strategy-file-classification.md (ALL-CAPS vs lowercase,
  prefix patterns, template conventions, workflow numbering)
- **New ADRs**: ADR-008 (Core/PM Decomposition), ADR-009 (PM Mode Naming), ADR-010 (Strong
  Defaults over Adoption Profiles), ADR-011 (SKILL.md Trigger Mechanism)

## Implementation Highlights

- **9 phases, 1335-line task list** — largest work unit to date. Dependency-ordered execution:
  cosmetic fixes first (reduce noise), multi-branch (establish model), core restructure (structural
  heart), config/hooks/extensions (infrastructure), team/adoption, convention gaps, discovery,
  verification.
- **ADR-008 emerged mid-execution** — original PRD stated "no new ADRs." PM/Core tension discovered
  during Phase 4 prep couldn't be deferred. Scope amendment documented in PRD with affected
  requirements mapped. ADR-009/010 followed as naming and adoption profile refinements.
- **ADR-011 required research correction** — initial external research had factual errors about
  agentskills.io governance (Anthropic, not Linux Foundation) and directory scanning behavior.
  Amendment corrected these before archival.
- **Inline conditionals over separate workflow variants** — Core/arc-in-git boundary resolved with
  pm.mode conditionals in existing workflows rather than mode-specific copies. Reduces maintenance,
  consistent with WU3 CLI installing mode-aware files.
- **Task list atomic tasks section** — Core replacement for standalone ATOMIC-TASKS.md during WU
  execution. Placed after verification phase, before Success Criteria.

## Verification

- **Quality gates**: Tier 3 passed — 133 files, 0 errors. Cross-reference integrity verified
  (10 files, 26+ references, 0 broken).
- **Success criteria**: 15 of 15 met. 1 deviation noted (strategy-development-methodology.md
  removed entirely rather than slimmed — rationale documented in task completion notes).

## Related Documentation

- PRD: `.arc-internal/active/technical/prd-methodology-completion.md`
- Tasks: `.arc-internal/active/technical/tasks-methodology-completion.md`

## Incidental Work Completed

None — all work was planned within this work unit. ADR-008/009/010/011 emerged during execution
but were incorporated into the task list as reactive tasks (5.8R, 7.7R) rather than separate
incidental work units.

## Follow-Up Work

- **WU2b — Structural Validation**: PRD parked at
  `.arc-internal/backlog/technical/prd-structural-validation.md`. File classification inventory,
  dependency mapping, de-duplication audit. Depends on WU2 methodology changes landing.
- **WU3 — CLI Distribution**: `arc init`, `arc update`, skill generation, arc-methods save-path
  extraction (strong consideration item from 7.7R.g). Depends on completed methodology.
- **Deferred tasks**: 8.5 (integrate-skill.md workflow) and 8.6 (project/ directories as skills
  landing zone) — primarily useful post-WU3 when generation infrastructure exists.
