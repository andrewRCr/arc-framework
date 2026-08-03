# Metadata: session-locus-model

| **State** | **Owner** | **Branch** | **Class** | **Priority** |
| --------- | --------- | ---------- | --------- | ------------ |
| `Shipped` | `andrew`  | [none]     | `Heavy`   | `P1`         |

- **Cohort:** [none]
- **Depends On:** [none]

- **Origin:** [internal]
- **Design:** `spec-session-locus-model.md`
- **Task List:** `tasks-session-locus-model.md`

- **Current Workflow:** [none]
- **Last Completed:** Phase 8 verification completed; delivery stack landed through PR #433
- **Next Task:** [none]
- **Blockers:** [none]

- **Next Action:** [none]

- **PR URL:** <https://github.com/andrewRCr/arc-framework/pull/434>
- **Completed:** 2026-08-03

## Release Notes Entry

ARC-managed checkouts now carry durable, machine-local execution roles, and live sessions carry recoverable locus
frames. Exact allocation, cross-platform process liveness, rostered cleanup, Errand lifecycle integration, and
locus-derived recovery replace branch-shape occupancy and harness-summary-only continuity.

- **Added:** Tamper-evident per-checkout locus records, generation-safe role and lease mutation, bounded native
  process inspection, a deterministic `arc locus` roster, and typed recovery projections.
- **Changed:** Work-unit entry, Errand open/link/close/abandon/promote, handoff, cleanup, and recovery now consume one
  locus authority while preserving a suspended work-unit frame across warm transient work.
- **Security:** Live or unverifiable occupancy, malformed topology, stale generations, and ambiguous ownership fail
  closed before allocation, adoption, mutation, or cleanup.

## Completion Notes

Delivered the session-locus foundation described by the detailed RFC: durable checkout roles, session-scoped
leases, exact identity binding, allocation and provisioning, deterministic roster projection, work-unit and Errand
lifecycle integration, locus-derived recovery, and synchronized shipped methodology surfaces. The base Errand
verbs are complete; transient leave/materialize, claimed grooming and housekeeping producers, and universal
generation binding remain in their recorded successor work units.

The work unit outgrew a single reviewable pull request, so its planning baseline, implementation, repairs, and
documented-surface reconciliation landed append-only through 21 independently green PRs (#395-#433). A dedicated
control branch retained one continuous planning and handoff record while every post-isolation delivery excluded
`.arc/active/**`; this closeout archives that record directly without restoring an active mainline occupant.

Final verification passed Markdown and ARC contract linting, TypeScript and shell linting, source and test
typechecking, build, and 9,438 tests in 723 files with one intentional skip. Hosted review converged after all
accepted findings were repaired, and the exact accepted S13 tree passed the complete GitHub-hosted matrix before
landing as `2bd5b01b0`.

---
