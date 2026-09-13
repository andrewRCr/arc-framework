# Metadata: test-suite-right-sizing

| **State** | **Owner** | **Branch** | **Class** | **Priority** |
| --------- | --------- | ---------- | --------- | ------------ |
| `Shipped` | `andrew`  | [none]     | `Heavy`   | `P2`         |

- **Cohort:** [none]
- **Depends On:** [none]

- **Origin:** `Housekeep follow-up from recurring test-suite wall-clock friction.`
- **Design:** `spec-test-suite-right-sizing.md`
- **Task List:** `tasks-test-suite-right-sizing.md`
- **Review Rubric:** [none]
- **Candidate:** `sha256:3c3d37a928665b4177198dec783e34d7630f36a6052998b40181478afc097821`

- **Current Workflow:** [none]
- **Last Completed:** Task 8.1 — Complete verification
- **Next Task:** [none]
- **Blockers:** [none]

- **Next Action:** [none]

- **PR URL:** <https://github.com/andrewRCr/arc-framework/pull/610>
- **Completed:** 2026-09-12

## Release Notes Entry

Routine local tests now run the unit and integration projects; the full suite remains available through
`test:full`, and CI continues to enforce E2E before merge.

- **Added:** Test-cost measurement and per-tier, per-mode budgets with advisory CI overage reporting.
- **Changed:** Shared integration fixtures, built-CLI test placement, lazy CLI handler loading, and worker and CI
  anchor selection reduce verification cost while retaining behavioral coverage.

## Completion Notes

Delivered the routine lane, a mode-stamped cost instrument, fixture and test-tier improvements, lower CLI startup
cost, measured worker and CI-anchor choices, and non-blocking cost budgets. The ranked audit moved 25 eligible
scenarios to the handler-backed integration tier, retained public-command and destructive cases in E2E, and deleted
no tests or assertions. The dependency tree returned to its pre-work baseline; no incidental hygiene capture was
needed.

Comparable 12-worker controls measured the routine lane at 57.33 to 44.925 seconds (21.6% lower) before the final
ranked audit; the post-audit lane remained 14.9% below that first baseline. Warm standalone CLI startup improved
from 395.10 to 271.48 ms (31.29% lower), and the final heavy-CI run totaled 887 job-seconds against a 1,377-second
baseline. Historical summed-cost and maximum-file audit comparisons use schema-v3 measurements; a later schema-v4
timing correction means they are not current-tree schema-v4 measurements. Wall-clock and CI-job results are unaffected.

Verification closed 17 success criteria as met, two by documented forward supersession, and none unresolved.
Markdown and ARC contract lint, TypeScript and shell lint, both typechecks, the routine test lane, the production
build, targeted lineage checks, and exact-head heavy CI passed. The original absolute routine-lane and integration
floor bars were superseded by comparable same-mode controls after measured host variance; published documentation
outside the active project and shipped framework surfaces remains with the separate docs-content sweep.

---
