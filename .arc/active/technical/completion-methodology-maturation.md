# Completion: Methodology Maturation

**Completed**: 2026-04-08
**Branch**: `technical/methodology-maturation`
**Category**: Technical
**Context**: Foundational clarity work gating the downstream Operating Modes work unit

## Summary

Settled ARC's methodology/implementation boundary, content architecture, update behavior,
human co-development posture, and skill infrastructure across 8 phases. Strategy docs were
split between local operational reference and docs site explanatory content using a hybrid
model informed by Diátaxis taxonomy and industry framework patterns. The CLI now
wholesale-replaces Framework files on update, eliminating merge conflicts. Two new skills
(arc-task-review, arc-plan) fill gaps in the human judgment surface at mandatory stops and
work unit inception.

## Key Deliverables

- **Methodology boundary**: Standalone methodology summary (`docs/methodology.md`) with
  10 grey area resolutions classifying named patterns as methodology vs convention
- **Human co-development posture**: "Co-development, not delegation" and "Interaction
  frequency matters" sections articulating what effective co-development looks like
- **CLI update fix**: Framework files wholesale-replaced in `arc update` — classification
  branch in `apply.ts`, content comparison to avoid unnecessary writes
- **Content architecture**: Strategy docs split from ~5,350 lines to ~2,970 local / ~2,380
  docs site. 13 strategies consolidated to 9. Docs site restructured with
  Methodology/Framework nav split
- **Package-project sync**: Dev safeguard strategy with dependency map, pre-commit hook
  enforcement, DEV-RULES.PROJECT guard
- **Conditional content inventory**: All current conditionals documented across 4 mechanism
  types with scaling assessment for proposed modes
- **Skills**: arc-task-review (post-task structured review) and arc-plan (collaborative
  exploration for new work)
- **Verification phase redesign**: Single-task workflow pointer replacing three self-contained
  tasks — forces workflow loading, eliminates protocol-skipping failure mode

## Implementation Highlights

- **Hybrid extraction model**: Local strategies retain operational specs with brief rationale
  context; docs site carries full explanatory content with collapsible deep dives. Header
  blockquote pointers connect local → hosted.
- **Two-copy discipline**: All Framework file edits went through package source first, synced
  to `.arc/`. Pre-commit hook catches desync. Template counterparts verified on every change.
- **Docs site IA restructuring**: Emerged organically during Phase 4 extraction — removed
  `navigation.sections`, created Methodology/Framework/Customization sections, reversed
  pointer direction (depth now lives on docs site).
- **Skill design pattern**: Both new skills are self-contained (no supporting workflow needed),
  parallel to arc-task-audit. arc-plan-audit evaluated and rejected — PRD workflow already
  covers plan readiness.

## Verification

- **Quality gates**: Tier 3 all passed — markdown lint (168 files), TS lint, shell lint,
  typecheck (src + test), 617 tests (574 unit/integration + 43 E2E), build
- **Success criteria**: 12 PRD criteria — 11 met, 1 superseded (README kept and thinned
  rather than removed, with documented rationale)

## Related Documentation

- PRD: `.arc/active/technical/prd-methodology-maturation.md`
- Tasks: `.arc/active/technical/tasks-methodology-maturation.md`
- Notes: `.arc/active/technical/notes-methodology-maturation.md`

## Follow-Up Work

None — all deferred items resolved during implementation. Two ATOMIC-INBOX items predate
this work unit (docs site deployment verification, GitHub Release for v0.1.0).

---
