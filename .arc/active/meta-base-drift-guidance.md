# Metadata: base-drift-guidance

| **State**     | **Owner** | **Branch**                 | **Class** | **Priority** |
| ------------- | --------- | -------------------------- | --------- | ------------ |
| `Integrating` | `andrew`  | `feat/base-drift-guidance` | `Heavy`   | `P1`         |

- **Cohort:** [none]
- **Depends On:** [none]

- **Origin:** [internal]
- **Design:** `spec-base-drift-guidance.md`
- **Task List:** `tasks-base-drift-guidance.md`

- **Current Workflow:** [none]
- **Last Completed:** Completed Phase 6 verification with all 14 success criteria met and Tier 3 green
- **Next Task:** [none]
- **Blockers:** [none]

- **Next Action:** Open the PR

- **PR URL:** [none]
- **Completed:** [none]

## Release Notes Entry

ARC now explains base-branch movement through one typed drift analysis instead of treating every behind commit as
equally alarming. Session guidance and the final integration gate share the same raw Git safety facts, proven
integration evidence, overlap classification, and deterministic reconciliation guidance.

### Added

- `arc base drift` provides authoritative human-readable and JSON results with typed clean, reconcile, and
  unavailable outcomes.
- Base movement can identify proven sibling integrations, preserve unclassified commits explicitly, and distinguish
  substantive overlap from regenerable readiness-view churn or unavailable analysis.

### Changed

- Session initialization consumes the shared analyzer advisorily and renders its precomposed guidance without
  independently re-reading Git or reconstructing policy.
- Integration reconciliation is bound to a freshly fetched immutable base commit, revalidated after approval, and
  repeated until the exact reviewed head is clean against the current base.
- Conflicting pull requests reconcile before hosted checks must settle, so checks run against the reconciled head.

### Fixed

- Malformed or incomplete Git distance output can no longer masquerade as parity in base-drift or inbound-pull
  callers.
- Partial, unavailable, stale, or conflicting semantic evidence degrades guidance without erasing valid proof or
  changing the raw reconcile requirement.

### Security

- Authoritative reads validate the configured base ref, fetch into an invocation-owned temporary ref without
  rewriting `FETCH_HEAD`, pin all analysis to the fetched commit, and fail closed if cleanup cannot be proven.

## Completion Notes

This work replaced the distance-only base warning and duplicated integration-time Git calculations with a shared,
storage-neutral analyzer. Raw ahead/behind distance remains the sole clean-versus-reconcile authority. Proven
first-parent integration events, explicit unclassified movement, conservative overlap evidence, and a deterministic
calm/attention/degraded register enrich that fact without weakening it. The current completed-meta reader and
readiness-view classifier sit behind narrow injected capabilities so future operational-state storage can replace
them without changing the analyzer, its JSON contract, or its consumers.

The implementation added the authoritative `arc base drift` command, migrated session initialization to advisory
use of the same result, and converged both integration safety windows on immutable `baseOid` readings. Reconcile
approval is refreshed before the OID merge; integration approval is refreshed before the host merge; malformed,
unavailable, or changed readings return to the appropriate stop. Integration review also exposed an ordering gap:
conflicting pull requests now reconcile and re-enter review before hosted checks are required to settle, ensuring
the checks describe the head that can actually merge.

The planned design held without a new configuration axis, host API, storage-tier branch, or permanent projection
contract. Verification-driven refinements made enhancement failures independent, resolver output deterministic,
archive evidence complete and parent-aware, archived PR identity exact, and the final merge predicates explicitly
bound to the approved head. These changes strengthened the proof boundary while preserving the planned public and
workflow contracts.

Verification passed TypeScript and shell linting, source and test typechecking, build, Markdown linting, and the
full local suite with 6,151 tests passing and one intentional skip. All hosted CI legs passed on the reconciled final
head. Two adversarial verification passes converged after the proof-isolation, ordering, and evidence-grammar fixes;
the hosted review findings were addressed and all review threads were resolved.

---
