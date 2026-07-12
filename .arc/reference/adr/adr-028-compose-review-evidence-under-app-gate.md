# ADR-028: Compose Review Evidence Under an App-Owned Gate

## Status

Accepted (2026-07-11).

## Context

The repository's CI-owned `merge-ok` could prove build and test outcomes but could not express whether the current
change required independent review, which evidence satisfied it, whether findings remained open, or whether a waiver
was authorized. Provider-native checks and comments are insufficient authority on their own: mutable names and prose
do not bind evidence to one policy and change set, and a provider's capacity or availability must not rewrite policy.

GitHub supports source-pinned required checks authored by a dedicated App. It also exposes stable App, bot, actor,
pull-request, review, comment, and check identities. Review providers differ in request, evidence, coverage, finding,
and closure semantics, so a single provider-specific workflow would couple merge truth to one mutable integration.

Live CodeRabbit probes established a narrower capability boundary. Its commit status is completion rather than verdict;
clean incremental results can exist only as mutable walkthrough edits, and provider thread resolution did not reliably
mean the underlying finding was fixed. The provider remains useful for finding generation, but those observations do
not currently prove durable clean coverage or semantic closure.

## Decision

We will compose merge-review truth into one dedicated-App-owned required check built from typed, non-substitutable
requirements.

1. CI publishes independent `ci-ok`; review policy, evidence, receipts, findings, native review state, and CI truth
   compose into the App projection rather than one source substituting for another.
2. Durable authenticated receipts—not comments or thread state alone—are the authority for request admission,
   acknowledgement, attestations, waivers, dismissals, and ambiguous attempts. Comments are the GitHub storage and
   audit carrier; App identity, immutable receipt hashes, versions, and edit-state validation make them authoritative.
3. The review-domain core remains host, provider, workflow-runner, and harness neutral. GitHub and CodeRabbit behavior
   stays in adapters; generic attestations provide a source-neutral qualification path.
4. CodeRabbit is non-satisfying by default. It may generate findings and progress signals, but clean satisfaction and
   closure route through qualified generic attestation unless later live probes prove durable clean coverage and
   semantic source-confirmed closure.
5. Qualification is revisable without changing the architecture: a reviewed policy/rubric update may enable a
   satisfying CodeRabbit declaration only after those capabilities pass the operational probe matrix.

## Consequences

### Positive

- Green merge truth names every obligation and authenticated evidence source for the exact current change set.
- Provider quota, outages, mutable prose, status spoofing, and same-name foreign checks cannot silently weaken policy.
- New hosts or review mechanisms implement adapters or neutral attestations without changing core verdict semantics.
- CodeRabbit can contribute useful findings today without being granted authority its observed contracts do not earn.

### Negative

- The repository operates a dedicated App, protected environment, receipt ledger, reconciliation workflows, and
  source-pinned required-check transition rather than relying on CI alone.
- Comments serve as compact visible audit storage, adding bounded repository activity and notification potential.
- Outages fail closed and can block merges until the audited repair path restores a truthful required context.

### Risks

- GitHub or provider contracts may change. The live probe matrix and shadow/dual rollout require proof before source
  promotion and preserve a rollback path.
- Receipt comments could be edited or duplicated. Store authentication, append-only versions, anchor parity, and
  fail-closed reconstruction prevent edited or ambiguous records from satisfying the gate.

## Amending This Document

<!-- Reserved for post-implementation learnings per the three-tier amendment model
     (strategy-adr-methodology.md). Append dated annotations as `**Amendment (YYYY-MM-DD):** …`. -->

**Amendment (2026-07-11): Composition gap, completion locus, and live-proof owner.** During the first enforcement
cutover authentication probe, the expected App-authored shadow check did not exist: the shipped entry scripts were
validated stubs and no production composition connected the accepted core/adapters to receipt or check writes. The
original ADR's architecture remains accepted, but its implementation record had incorrectly treated shadow emission
as delivered.

`review-gate-reconcile-composition` is the correction locus. It composes both entry paths, persists authenticated
normalized evidence, rehydrates it in a later reconcile, and proves the behavior through stateful integration tests.
Those tests establish executable composition, not live GitHub enforcement. The dependent Heavy work unit
`review-gate-enforcement-cutover` owns post-merge App authentication probes, provider/evidence qualification,
repository-rule reconciliation, shadow → dual → final promotion, rollback checkpoints, project-hook activation,
and the final architecture closeout. Until that work unit's closeout PR merges, CI's compatibility `merge-ok` remains
the live required authority and App-owned final enforcement is intentionally not claimed as proven.

**Amendment (2026-07-12): Qualification and promotion split.** Cutover planning exposed that one work unit could not
both deliver the inactive controller and own multiple post-merge acceptance/activation PRs without violating the
one-WU/one-PR boundary. Responsibility now follows three work units: `review-gate-enforcement-cutover` ships the
inactive controller and fail-closed qualification machinery; `review-gate-enforcement-qualification` runs the shipped
baseline matrix and activates only baseline-proven hosted provider declarations; and
`review-gate-enforcement-promotion` reruns the enabled-policy matrix before changing required-check authority,
activating project hooks, or recording the final enforcement closeout. CI's compatibility `merge-ok` remains required
through the first two work units.
