# Metadata: decompose-transition-record

| **State**     | **Owner** | **Branch**                         | **Class** | **Priority** |
| ------------- | --------- | ---------------------------------- | --------- | ------------ |
| `Integrating` | `andrew`  | `feat/decompose-transition-record` | `Heavy`   | `P1`         |

- **Cohort:** `decompose-transform-integrity`
- **Depends On:** [none]

- **Origin:** [internal]
- **Design:** `spec-decompose-transition-record.md`
- **Task List:** `tasks-decompose-transition-record.md`
- **Review Rubric:** [none]

- **Current Workflow:** [none]
- **Last Completed:** Integration review pass 2 corrections complete
- **Next Task:** [none]
- **Blockers:** [none]

- **Next Action:** integrate-work-unit Step 3 — review current head; changes end at `9d21fcaee`; then open PR

- **PR URL:** [none]
- **Completed:** [none]

---

## Release Notes Entry

ARC now records terminal planning transitions as concise, append-only JSON and derives lifecycle authorization
from committed Git state. Decomposition executes and stages a complete transition in one operation, with
receipt-free append-only base advancement for full-protection candidates.

### Added

- One origin-keyed transition-history format for decompose, rename, and abandon outcomes, including successor
  identities and authored incoming-edge dispositions.
- Git-derived authorization for abandon teardown, park landing and teardown, and detached-worktree cleanup.

### Changed

- `arc decompose` now completes terminal work through `--execute <cut-map>` and advances full-protection candidates
  through `--advance-base <cut-map>`.
- Planning classification uses the generic exact-path predicate for transition records while keeping their parsed
  lifecycle content code-owner reviewed.
- Candidate ownership and cleanup rely on deterministic Git worktree topology and ARC markers instead of a
  separate claim store.

### Removed

- Sealed decomposition receipts, persisted preparation and finalization state, publication and launch-readiness
  adapters, the decomposition-specific planning-lane exception, and the legacy receipt validator and namespace.
- The retired `--discard`, `--finalize`, `--continuation`, and `--handoff` decomposition modes.

### Fixed

- Noninteractive transition-history reads now suppress terminal and SSH credential prompts, including inherited
  OpenSSH configurations with conflicting prompt options.
- Candidate creation and cleanup preserve foreign or raced worktree and ref state instead of adopting or rewinding
  it.

### Breaking Changes

Integrations that invoke the retired decomposition modes or read the legacy retirement-receipt namespace must move
to `--execute` / `--advance-base` and the origin-keyed transition records. No compatibility reader is provided.

## Completion Notes

Delivered the lean terminal-transition model across authoring, storage, migration, lifecycle consumers, and
decomposition execution. Ten live terminal decisions now use one schema-v1 origin-keyed record format; disposition
queries and reference reconciliation retain their prior semantic answers while receipt identities, sealing fields,
and parallel readiness vocabulary are absent from production paths.

Retirement authorization was re-derived from pinned Git topology and committed bytes for abandon, park, and
detached-worktree cleanup. Decomposition now stages the transform and its transition record together, authenticates
append-only base advancement from the cut map and candidate history, and uses ordinary Git-owned candidate cleanup.
The claim, preparation, finalization, publication, launch, special planning-lane, and legacy receipt clusters were
removed after their surviving consumers moved to those narrower contracts.

Two planned outcomes changed during implementation. The migration grew from eight records to ten when two terminal
decisions arrived from the base branch; both were converted through the same characterized abandon semantics.
Transition records remained code-owner reviewed after integration established that their parsed content directly
affects lifecycle history, while their exact namespace still qualifies for lightweight planning CI. Candidate
marker failure deliberately leaves exact unmarked topology preserved for manual recovery rather than inventing a
new durable recovery authority or risking adoption of foreign state.

Verification covered Markdown and ARC contract checks, TypeScript and shell lint, both type checks, production
build, and the full unit, integration, and end-to-end suite. The final reviewed code tree passed 9,434 tests with
one intentional skip. Three complete delegated standard-review passes plus focused exact-delta closure checks
resolved sixteen findings, declined two non-actionable proposals, and left no unresolved material findings. The
later append-only base merge preserved the reviewed tree byte-for-byte and all required pull-request checks passed.
