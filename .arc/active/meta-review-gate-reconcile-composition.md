# Metadata: review-gate-reconcile-composition

| **State**     | **Owner** | **Branch**                              | **Class** | **Priority** |
| ------------- | --------- | --------------------------------------- | --------- | ------------ |
| `Integrating` | `andrew`  | `fix/review-gate-reconcile-composition` | `Heavy`   | `P2`         |

- **Cohort:** [none]
- **Depends On:** [none]

- **Origin:** [internal]
- **Design:** `spec-review-gate-reconcile-composition.md`
- **Task List:** `tasks-review-gate-reconcile-composition.md`

- **Current Workflow:** [none]
- **Last Completed:** Second CodeRabbit review fixes pushed; full re-review triggered after green CI
- **Next Task:** [none]
- **Blockers:** [none]

- **Next Action:** integrate-work-unit Step 4 — check and triage the next CodeRabbit review round

- **PR URL:** [PR #226](https://github.com/andrewRCr/arc-framework/pull/226)
- **Completed:** [none]

---

## Release Notes Entry

The self-hosting review controller now composes its production reconciliation and attestation paths end to end,
with durable evidence, fail-closed receipt handling, current-head CodeRabbit authority, and verified lifecycle-tail
carry-forward. ARC also gains a consistently named final merge hook and explicit terminology for minor review fixes.

### Added

- Production GitHub composition for review-gate reconciliation and authenticated attestation, including strict
  command ingestion, provider triggering, decisive-review observation, and cross-process evidence recovery.
- A closed `lifecycle-bookkeeping-tail/v1` proof that preserves clean review authority across integration-only
  work-unit bookkeeping while rejecting substantive, unrelated, or ambiguous changes.
- End-to-end and integration coverage for check projection, durable receipts, degraded ledgers, workflow wake-ups,
  runtime construction, and the attestation-to-reconciliation handoff.

### Changed

- The final lifecycle extension is named `pre-merge`, replacing `pre-merge-review` across packaged and project
  workflows, manifests, references, and tests.
- Review triage now names low-impact valid findings `MINOR FIX` and requires their dispositions to remain explicit,
  while allowing concise grouped reporting.

### Fixed

- Reconciliation and attestation entry points now execute the composed controller instead of validating and echoing
  inputs without publishing checks or persisting evidence.
- Candidate-free and controller-authored wake-ups no longer fail workflow matrix expansion or recursively retrigger
  reconciliation.
- Corrupt, regressed, unavailable, or otherwise degraded receipt state now replaces stale green projection with a
  current failure and prevents untrusted writes.

### Breaking Changes

- Projects with customized `pre-merge-review` extension content must move those actions to `pre-merge`; no alias or
  updater migration is provided.

## Completion Notes

Composed the previously disconnected review-gate library into executable GitHub reconciliation and authenticated
attestation entry points. The delivered runtime now re-resolves canonical pull-request state, validates App launch
authority, reads CI and native review facts, reduces policy and durable receipts, executes qualified CodeRabbit
requests, processes authorized human commands, and publishes truthful shadow/final projections. Attestations retain
normalized evidence across process boundaries, and degraded ledgers fail closed rather than leaving an earlier
green check authoritative.

The work expanded beyond thin composition after grounding and adversarial review exposed missing production
contracts around native-review authority, provider triggering, actor identity, command receipts, durable evidence,
private-repository git authentication, and final lifecycle bookkeeping. Those gaps were resolved inside the
spec-defined boundary. A storage-neutral lifecycle-tail contract now carries clean authority only across the exact
integration bookkeeping delta; the current tracked-artifact classifier remains isolated in the Git adapter.

The original live-cutover boundary remained intact. This PR delivers composed, tested controller behavior but does
not claim live App emission or enforcement promotion: `review-gate.yml` remains disabled until the code reaches
`main`. The dependent `review-gate-enforcement-cutover` work unit owns authentication probes, provider/evidence
qualification, repository-rule reconciliation, staged shadow/dual/final promotion, rollback checkpoints, and
closeout. The delivery-gap postmortem also produced the six-factor diagnosis, folded bounded truthfulness guards,
and routed broader composition-integrity improvements to `delivery-intent-integrity`.

All 19 success criteria passed. Verification covered Markdown, TypeScript, and shell linting; source and test
typechecking; build; packaging boundaries; and 4,824 passing tests. Two independent adversarial verification passes
converged after confirmed findings were corrected and regression-pinned. PR review then completed two fix rounds;
CodeRabbit approved the final substantive head, all checks pass, no review conversations remain unresolved, and the
PR is mergeable. Alignment against PROJECT-PRD and TECHNICAL-OVERVIEW found no conflict: the result strengthens
typed integration boundaries and operationalizes review judgment without expanding ARC into application-code
generation or claiming unproven live enforcement.
