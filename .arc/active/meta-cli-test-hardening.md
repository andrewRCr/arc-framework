# Metadata: CLI Test Hardening

| **State**     | **Owner** | **Branch**                 | **Class** | **Priority** |
| ------------- | --------- | -------------------------- | --------- | ------------ |
| `Integrating` | `andrew`  | `chore/cli-test-hardening` | `Light`   | `P3`         |

- **Cohort:** `architecture-remediation`
- **Depends On:** [none]

- **Origin:** [internal]
- **Design:** `spec-cli-test-hardening.md`
- **Task List:** `tasks-cli-test-hardening.md`

- **Current Workflow:** [none]
- **Last Completed:** Task 6.1 — verification complete
- **Next Task:** [none]
- **Blockers:** [none]

- **Next Action:** open the PR

- **PR URL:** [none]
- **Completed:** [none]

---

## Release Notes Entry

CLI testing is more resilient to Git cleanup races and resource contention, with lower-cost fixtures, isolated
module-mocking tests, and sharded E2E execution. Template rendering, user-state traversal, registry version checks,
and concurrent initialization and update paths now behave predictably at previously uncovered edges.

### Changed

- E2E CI runs across three balanced shards, with verified-tree classification synchronized to the resulting check
  names.
- Module-mocking unit tests run in a dedicated isolated project while the remaining unit suite reuses module state
  safely to reduce repeated import cost.

### Fixed

- Unbalanced template conditionals fail with source and line diagnostics instead of silently mis-scoping installed
  content.
- Registry version checks abort after a bounded timeout, and user-directory traversal terminates on symlink cycles
  while tolerating entries that vanish during inspection.
- Concurrent `init` and `update` commands are covered against real installations and leave valid manifest and
  pristine-snapshot state.

### Infrastructure

- Git-backed test repositories share retry-safe creation and teardown, disable background auto-gc, attempt all
  owned cleanup before surfacing failures, and retain diagnostic context for multiple teardown errors.
- The notes-compaction fixture uses a smaller behavior-preserving data set, contention-sensitive shell cases use
  per-value budgets, and shallow-clone coverage has focused timeout headroom.

## Completion Notes

The test suite now addresses the five recorded reliability signatures through one set of fixture-level
interventions. Git-backed temporary repositories share a single factory core and bounded removal primitive, every
known inline Git teardown routes through that primitive, background auto-gc is disabled across the shared clone
topologies, and terminal cleanup failures remain visible after all owned paths have been attempted. The heavy notes
fixture was reduced without weakening its retention-window or multi-batch assertions, while the shallow-clone case
received a focused timeout rather than a suite-wide budget increase.

Unit-tier tuning followed the spike's stop-loss instead of relaxing isolation indiscriminately. Hoisted module mocks
were moved into a dedicated Vitest project, the remaining unit project adopted safe module reuse, and the two
contention-sensitive configuration loops were split into per-value cases. E2E execution now uses three CI shards,
and the heavy-check classifier carries the exact matrix check names. The save/sync race signature did not reproduce
after the teardown baseline landed, so no speculative serialization was added; the unchanged `user.test.ts` timing
also caused the stale two-file performance target to be dropped rather than forcing an unmeasured optimization.

The bounded product-edge work shipped alongside its tests: template rendering rejects stray and unclosed
conditionals with source context, registry checks abort stalled requests and reject malformed version shapes,
user-directory reads stop symlink cycles and tolerate vanished entries, status and diff probes preserve their
non-fatal disappearance contracts, entry-point failures remain observable, and concurrent `init` and `update`
processes converge on valid installation state.

Verification passed Markdown, TypeScript, and shell linting, source and test typechecking, build, all three E2E
shards, and the full suite with 5,769 tests passed and one intentional skip. Review-driven follow-through then passed
18 focused tests plus Markdown and TypeScript linting and full typechecking. Hosted CodeRabbit review is green and
all review threads are resolved; the rejected optional timeout refactor and partial directory-error-policy change
remain documented in the review-fix commit.
