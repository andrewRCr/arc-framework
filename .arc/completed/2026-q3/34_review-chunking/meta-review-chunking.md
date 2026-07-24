# Metadata: review-chunking

| **State** | **Owner** | **Branch** | **Class** | **Priority** |
| --------- | --------- | ---------- | --------- | ------------ |
| `Shipped` | `andrew`  | [none]     | `Heavy`   | `P1`         |

- **Cohort:** [none]
- **Depends On:** [none]

- **Origin:** [internal]
- **Design:** `spec-review-chunking.md`
- **Task List:** `tasks-review-chunking.md`
- **Review Rubric:** [none]

- **Current Workflow:** [none]
- **Last Completed:** Task 6.1 — Complete verification
- **Next Task:** [none]
- **Blockers:** [none]

- **Next Action:** [none]

- **PR URL:** <https://github.com/andrewRCr/arc-framework/pull/346>
- **Completed:** 2026-07-24

---

## Release Notes Entry

Large exact change sets can now be measured and reviewed in bounded, contract-cohesive local chunks without
changing branch, pull request, or merge boundaries.

- **Added:** A review-chunking method, exact-target resolver, and configurable changed-line and changed-file
  thresholds for deciding when to consider bounded review.
- **Changed:** Local standard and frontline review guidance can use curated chunk scopes while retaining
  whole-target aggregate authority.
- **Fixed:** Exact-target change measurement fails closed on malformed framing, unavailable objects, unsafe totals,
  and contradictory result envelopes while handling binaries and path changes.

## Completion Notes

Delivered the review-only chunk boundary as an operator-facing method, controlled vocabulary, exact-target
resolver, configuration, installation and update wiring, and standard and frontline review integration. Package
defaults remain disabled while this repository exercises thresholds of 5,000 changed lines and 150 changed files.

Validation covered unit, integration, end-to-end, schema-generation, configuration, update, synchronization, lint,
type-check, build, and full-suite gates; the final review-fix checkpoint completed with 8,173 passing tests and one
skip. The primary paired comparison was inconclusive because neither arm produced a declaration-split blocker, so
it does not support a token-efficiency claim; it still showed closure-cohesive scopes as the more reliable operating
shape. A supplemental application to a substantially larger change set demonstrated complete recursive coverage
and coherent aggregation, with its review findings preserved for later use by that change's owner.

Automated per-chunk scope binding and multi-pull-request delivery remain outside this change. Integration review
also corrected reproducibility, dependency and ownership drift, stale provenance, result-envelope semantics, and a
final retired-owner reference before candidate composition.
