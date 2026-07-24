# Metadata: review-surface-binding

| **State** | **Owner** | **Branch** | **Class** | **Priority** |
| --------- | --------- | ---------- | --------- | ------------ |
| `Shipped` | `andrew`  | [none]     | `Heavy`   | `P1`         |

- **Cohort:** [none]
- **Depends On:** [none]

- **Origin:** [internal]
- **Design:** `spec-review-surface-binding.md`
- **Task List:** `tasks-review-surface-binding.md`
- **Review Rubric:** [none]

- **Current Workflow:** [none]
- **Last Completed:** Task 8.1 — Complete verification
- **Next Task:** [none]
- **Blockers:** [none]

- **Next Action:** [none]

- **PR URL:** <https://github.com/andrewRCr/arc-framework/pull/338>
- **Completed:** 2026-07-23

## Release Notes Entry

ARC now provides a host-neutral advisory review protocol that binds frontline and delegated local review to exact
source targets, supports durable interruption recovery and approved finding disposition, and exposes every
transition through typed `arc review` commands.

### Added

- Public commands for immutable local-review preparation, attestation, and resume; exact-target frontline
  execution; approved finding response; and advisory reduction.
- Detached exact-head review sources, durable frontline outcomes, source-bound disposition records, and typed
  recovery states for interrupted review activity.
- Effective method-activation and project-rubric composition with fail-closed guidance validation.

### Changed

- The ordinary review role now uses the `standard-review/v1` identity, and frontline source configuration accepts
  an ordered source list.
- Integration and Errand workflows now invoke the public review protocol instead of prescribing internal library
  composition.

### Removed

- Dormant review re-entry, wakeup, legacy dispatch, and unused evidence-eligibility machinery with no surviving
  production consumer.

### Fixed

- Frontline execution now binds the exact reviewed head and executable, enforces bounded execution, publishes
  durable state in recoverable order, and preserves typed public error provenance.
- Local review retries, cleanup, attestation, and reduction now remain correct across concurrent publication,
  runtime upgrades, completed sources, expired sources, and target movement.

## Completion Notes

The delivered protocol closes the gap between ARC's review contracts and its invocable surface. Seven strict
JSON-in / JSON-out commands now compose exact local and frontline targets, immutable review materializations,
effective guidance, normalized outcomes, approved dispositions, interruption recovery, and read-only reduction.
Every delivered storage or policy seam has a production consumer, while the dormant predecessor cluster and its
orphaned ports and registrations were retired.

The implementation preserves the designed authority boundary: all review records remain advisory and exact-target
bound, while host checks and the final integration decision remain separate. Evidence-grade local proof, durable
fix-carry machinery, generic provider registration, agent-kind frontline execution, and automated review-scope
carving remain outside this work. The shared hosted-driver and merge-guard seam remains coordinated with the
in-flight review-gate right-sizing work.

Verification passed Markdown, TypeScript, and shell linting; source and test typechecks; build; 69 ARC contract
tests; and the full repository suite with 646 files and 8,096 tests passing, plus one intentional skipped file and
test. Six local Codex GPT-5.6-Sol review passes surfaced 18 distinct findings, all addressed with no deferred,
declined, or unresolved findings. The review-driven corrections strengthened persistence ordering, exact-target
recovery, runtime upgrade handling, public error provenance, and pre-effect eligibility validation without adding
the evidence-grade or fix-ledger machinery the design excludes.

---
