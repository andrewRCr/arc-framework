# Metadata: delivery-plan-record

| **State** | **Owner** | **Branch** | **Class** | **Priority** |
| --------- | --------- | ---------- | --------- | ------------ |
| `Shipped` | `andrew`  | [none]     | `Heavy`   | `P1`         |

- **Cohort:** `chunked-delivery`
- **Depends On:** [none]

- **Origin:** [internal]
- **Design:** `spec-delivery-plan-record.md`
- **Task List:** `tasks-delivery-plan-record.md`
- **Review Rubric:** [none]

- **Current Workflow:** [none]
- **Last Completed:** Phase 8 — Verification
- **Next Task:** [none]
- **Blockers:** [none]

- **Next Action:** [none]

- **PR URL:** <https://github.com/andrewRCr/arc-framework/pull/462>
- **Completed:** 2026-08-05

## Release Notes Entry

ARC can now author an immutable, revisioned delivery plan from a task list or an existing branch and publish its
current intent into the task list. The resulting plan and state contracts give guarded multi-pull-request delivery a
stable, resumable foundation without creating a second review or proof system.

### Added

- Task- and branch-derived plan authoring with validated coverage, ordered members and seams, digest-checked
  publication, and a replaceable task-list projection.
- Version-checked delivery state with exact ref and change-request bindings, globally unambiguous member lookup, and
  one interruption-safe active operation.

### Changed

- Plan revisions now describe authored intent only; current provider position comes from state and fresh host facts.
- Bound amendments classify as accepted, replacement-required, or refused, with retry-safe publication and state
  rebinding for accepted revisions.
- Delivery position and member readiness are derived from exact current facts while existing check, review, and
  integration authorities remain unchanged.

### Removed

- Unused assignment, observation, assurance, generation, and provider-status contracts from the delivery schema and
  public export surface.

## Completion Notes

Delivered the canonical delivery-plan substrate and its two authoring entries through one composition spine. Plans
retain stable identities across revisions and work-unit renames, validate task and design coverage, publish by expected
digest, and render a replaceable task-list projection. One version-checked state record binds exact refs and change
requests, supports artifact-free member-checkout recovery, and reserves at most one external operation. Pure amendment,
operation, and position contracts classify safe changes, reconcile interruption, and derive current readiness without
claiming provider, review, or lifecycle authority.

The implementation was assembled as three ordered delivery members while remaining one work unit. The first two
members established the record and authoring substrate; the terminal guarded-state member completed amendment,
storage, operation, and position behavior before the lifecycle-only archive tail.

Before the terminal member, the design was deliberately reduced from a multi-record proof system to immutable plan
intent plus one current state record. Eight original criteria were superseded before implementation, and the unused
assignment, observation, assurance, generation, conversion, terminal-proof, and historical-drift machinery was
removed. The retained robustness floor is exact binding, stale-write refusal, global ambiguity detection, exact
before/requested operation comparison, crash-safe amendment rebinding, and refusal of ambiguous movement. Topology
execution, stack landing, review aggregation, provider-general orchestration, and compatibility migration remain
outside this work unit.

Verification passed Markdown and ARC contract linting, TypeScript and shell linting, both type checks, the production
build, and 9,722 tests with one intentional skip. Coverage includes both reconstructed field deliveries, real linked
worktrees, stale writes, exact reverse lookup, accepted-amendment recovery, and already-applied, not-applied, and
ambiguous operation outcomes. Alignment checks found no conflict with the project PRD or technical overview: the
result adds typed CLI and library contracts inside the documented architecture while keeping human review and merge
judgment with their existing owners.

---
