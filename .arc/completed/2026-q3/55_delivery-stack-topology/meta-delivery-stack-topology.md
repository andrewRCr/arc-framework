# Metadata: delivery-stack-topology

| **State** | **Owner** | **Branch** | **Class** | **Priority** |
| --------- | --------- | ---------- | --------- | ------------ |
| `Shipped` | `andrew`  | [none]     | `Heavy`   | `P1`         |

- **Cohort:** `chunked-delivery`
- **Depends On:** [none]

- **Origin:** [internal]
- **Design:** `spec-delivery-stack-topology.md`
- **Task List:** `tasks-delivery-stack-topology.md`
- **Review Rubric:** [none]

- **Current Workflow:** [none]
- **Last Completed:** Prepared terminal delivery member 6/6 after landing members 1–5
- **Next Task:** [none]
- **Blockers:** [none]

- **Next Action:** [none]

- **PR URL:** <https://github.com/andrewRCr/arc-framework/pull/507>
- **Completed:** 2026-08-14

---

## Release Notes Entry

ARC can now deliver one work unit as an ordered stack of independently reviewable pull requests while preserving
one work-unit lifecycle and one terminal integration authority. The guarded delivery path validates exact member
contributions, keeps lifecycle artifacts out of partial landings, resumes interrupted operations from versioned
state, and optionally composes with GitHub's native stacked-pull-request presentation.

### Added

- Delivery-plan eligibility, materialization, exact-head landing, suffix reconciliation, and terminal handoff
  commands for ordered pull-request stacks.
- Resumable delivery operations with exact ref, tree, change-request, and host-effect bindings plus
  version-checked state updates.
- Optional GitHub-native stack registration and direct atomic landing of the complete eligible non-terminal
  remainder, with explicit race disclosure and visible degradation to sequential delivery.
- Session-start delivery-position reporting and delivery-aware planning and integration guidance.

### Changed

- Changeset-size advisory settings now use the `changeset.advisory_threshold_lines` and
  `changeset.advisory_threshold_files` names.
- Boundary-fit assessment distinguishes one-work-unit delivery stacks from work that should decompose into
  separate work units.

### Breaking Changes

Projects using the pre-release `review.chunking_threshold_lines` or `review.chunking_threshold_files` settings
must rename them to `changeset.advisory_threshold_lines` and `changeset.advisory_threshold_files`. No compatibility
aliases are provided.

## Completion Notes

Delivered the complete stack projection over the existing delivery-plan and state substrate: candidate eligibility,
private-ref materialization, guarded single-member landing, contribution-preserving suffix reconciliation, terminal
handoff, and interruption recovery. The implementation keeps authored member order in the plan, mutable coordinates
in versioned state, and review, host, Git, and lifecycle authority at their existing boundaries. Partial landings
exclude active work-unit artifacts, while the terminal pull request remains the ordinary work-unit integration
vehicle.

The optional GitHub adapter observes and registers an already-materialized chain without making provider metadata
authoritative. It supports the ordinary linked singleton arm and an explicitly selected all-remaining atomic arm,
persists asynchronous merge identities, refuses merge-queue grouping, and requires a fresh unregistered observation
before sequential fallback. Because GitHub exposes no full-member compare-and-set token, exact-set validation remains
an operator-side authorization property and the residual race is disclosed at the landing interlock; sequential
delivery remains the default.

Implementation refined two mechanics without widening the design. Lifecycle normalization now compares the current,
protected-base, and control-tree artifact loci so activation-time moves cannot leak planning artifacts into a partial
stack. Disposable candidate cuts use detached worktrees and private refs, avoiding false work-unit identities while
preserving the retained control branch for terminal integration. The live six-member self-delivery exercised native
registration, five ordered non-terminal landings, review-fix suffix rematerialization, base absorption, and terminal
handoff.

Verification covered Markdown and ARC contract checks, both TypeScript checks, source and test linting, production
build, and the unit, integration, end-to-end, and portability suites. Hosted review of the terminal change set found
behavioral, authority-boundary, recovery, and test-strength gaps; the accepted corrections were reverified and an
incremental exact-head review returned no new actionable findings. All required pull-request checks passed on the
reviewed implementation head.
