# Completion: Structural Readiness Pass

**Completed**: 2026-02-20
**Branch**: `technical/structural-readiness-pass`
**Category**: Technical
**Context**: Part of pre-release readiness — Phase B.3 on the framework roadmap

## Summary

Restructured the `.arc/` template system and `.arc-internal/` workspace for distribution readiness
and team viability. Established clean directory roles (`reference/` for project knowledge, `system/`
for ARC machinery), separated framework methodology from project-configurable content to minimize
merge conflicts during framework updates, and introduced a configurable branching model with planning
branches and three protection modes.

## Key Deliverables

- **Directory restructuring**: `reference/` split into `reference/` (project knowledge) + `system/`
  (ARC operational components — agent, commands, githooks, workflows). Workflows organized into
  `arc/` (methodology) and `project/` (user-created) subdirectories.
- **File naming**: 16 `.example.md` files renamed to `.template.md` to reflect actual function
- **DEVELOPMENT-RULES separation**: Framework methodology extracted into
  `strategy-development-methodology.md` (template reduced from 404 to 130 lines, -68%)
- **New strategy documents**: `strategy-file-classification.md` (file taxonomy with full inventory),
  `strategy-backlog-organization.md`, `strategy-team-coordination.md`
- **Configurable branching model**: `arc-config.yml` (ARC's first config file), planning branch
  lifecycle, three branch protection modes (unprotected / partial / full), config-aware pre-commit
  githook
- **Team mode structure**: `team/` directory with README, session and atomic-tasks templates,
  `(@name)` ownership convention, external tracker integration model
- **Setup workflow split**: `01_initialize-arc.md` (ARC-level) + `02_define-project.md`
  (project-level), forward-compatible with CLI onboarding
- **Reference-style link convention**: Codified in development methodology strategy, 56 inline links
  converted across 16 files

## Implementation Highlights

- Branch-task list model decoupled from 1:1 rule to many-to-one relationship, supporting stacked
  PRs, team sub-branches, and phased delivery
- `arc-config.yml` uses flat key-value YAML, shell-parseable without dependencies — githook reads
  config via `grep + cut` with graceful fallback when config is absent
- Planning branch lifecycle codified as replacement for undocumented direct-to-base-branch pattern
- Two PRD success criteria superseded during implementation: `getting-started.md` replaced by
  external docs site decision (Phase D); `define-constitution` branch model setup split across two
  setup workflows (functionally equivalent)
- Audience indicator convention formalized: 5 audience types, all 14 workflow files verified for
  consistent `**Audience:**` headers

## Related Documentation

- PRD: `prd-structural-readiness-pass.md`
- Tasks: `tasks-structural-readiness-pass.md`

## Follow-Up Work

- Slash command dedup (Cluster E) — deferred to Phase C (needs CLI generation script)
