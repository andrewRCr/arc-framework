# Notes: delivery-plan-record

- [Verified substrate facts](#verified-substrate-facts)
- [Field-evidence anchors](#field-evidence-anchors)
- [Proportionality decision](#proportionality-decision)
- [Delivery topology and sequence](#delivery-topology-and-sequence)

---

## Verified substrate facts

These facts were checked against the merged code before the remaining implementation plan was amended. Names are
starting points for the next grounding audit rather than substitutes for reading the current tree.

**Schema and identity substrate.** The kernel has strict runtime schemas, `strict-current` registration,
domain-separated canonical digests, and byte-stable canonicalization. `DeliveryPlanV1` already has a minted `planId`,
derived stable `deliverableId`, exact revision lineage, current task and design inventories, member and seam semantic
fingerprints, and a self-excluding plan digest. Those mechanisms have active authoring, composition, rendering, field
fixture, and command consumers and remain in scope.

**The excess is concrete and removable.** The current delivery implementation also has:

- `live` and `landed` member variants plus validation of a frozen landed prefix;
- member and seam `assuranceSubjectId` derivations and a registered preimage;
- `DeliveryAssignmentsV1`, materialization generations, generation high-water marks, and review-routing payloads;
- separate assignment and observation store ports and repository-common namespaces; and
- an append-only assurance store with export and import.

The shipping delivery handler constructs only the transient authoring store and current-plan store. Assignment,
observation, and assurance records have no command or topology-executor consumer yet; their consumers are their own
unit and integration tests. Removing them before the next cohort member is therefore a contract simplification, not a
migration of live product state.

**Pre-public compatibility posture.** The repository explicitly permits unpublished project-owned contracts and
development-only persisted state to change in place. Delivery schemas are registered `strict-current`, so old local
delivery data may be cleared or regenerated. Compatibility aliases, migration readers, and retained obsolete
namespaces would add complexity without serving a supported user.

**Repository-common storage.** `RepositoryGitCommonStatePublisher` resolves through `git rev-parse --git-common-dir`,
serializes namespace updates, uses a bounded advisory lock, and replaces files atomically. It is suitable for the v1
local adapter. The plan store already publishes by expected digest. The reduced design needs one analogous
revision-checked state store, not three mutable or append-only stores.

**Reverse lookup.** `RepositoryDeliveryAssignmentStore.resolveMember()` already proves that repository-common
enumeration can resolve an exact head or exact ref plus observed head, reject ambiguity, and optionally validate a
caller-supplied owning-unit pointer. The useful behavior moves to the state store; the assignment record shape does
not need to survive with it.

**Work-unit identity and rename.** The metadata record carries no independent immutable id; the current work-unit slug
comes from artifact position. Rename receipts are forward-keyed from the old slug, ref-scoped, and already have a
transitive resolver with cycle detection. Delivery plan and authoring resolution use that resolver, while `planId` and
`deliverableId` remain independent of the mutable slug.

**Task inventory and attribution.** Task completion preserves parent `_Goal:_` text and adds `_Outcome:_` later, so
goal-only parent digests remain stable across progress. The commit-footer parser admits deeper ids than the documented
two-level examples, including subtask and revision-family ids. `from-branch` must normalize to the nearest parent
inventory entry and treat genuine historical attribution gaps as advisory rather than inventing membership.

## Field-evidence anchors

**The two hand-run deliveries.** The seven-member `decompose-transform-integrity` stack is fully shipped.
`session-locus-model` completed as 21 delivery and corrective rows rather than its superseded thirteen-branch standing
stack. Both original branch sets have been reaped, so fixtures reconstruct exact transitions from recorded merge
commits and their parents. Session-locus closeout PR #434 is archival rather than a delivery-plan member.

**A base merge sits inside a delivery slice.** Commit `a0e6d1533` is a two-parent base merge inside slice 06 of the
first stack. Its merge tree includes an authored modify/delete resolution and is not equal to an automatic remerge.
Strict inspection correctly refuses treating that raw head as a pure ambient absorb. Historical reconstruction uses
the landed merge result as one atomic transition and separately verifies the recorded base, head, and merge triple. A
synthetic pure absorb remains the positive contribution-partition fixture.

**Attribution is sparse by design.** Review-driven fixes and maintenance commits legitimately name no task. A delivery
member with few or no derived task ids can still be valid when the plan's task coverage is otherwise complete.

**What the field runs actually require.** Stable member identity, predecessor order, exact ref and tree comparison,
lifecycle-artifact exclusion, reverse lookup, and interruption-safe progress all had direct operational value. No run
consumed assurance-subject identities, an append-only delivery evidence chain, conversion revisions, a persisted
design-drift advisory, or a second terminal proof.

## Proportionality decision

Before Phase 5 began, the operator authorized a scope correction across the chunked-delivery cohort and this active
work unit. The accepted v1 target is guarded execution around ordinary Git, change-request, review, and ARC lifecycle
operations. It is not a provider-neutral proof system.

The remaining work therefore makes the already-built plan intent-only, replaces assignment, observation, and
assurance storage with one `DeliveryStateV1`, and supplies one active-operation guard. The original Phase 5 through 7
tasks are preserved as superseded pre-commitment text in `tasks-delivery-plan-record.md`; their replacement tasks are
the current implementation authority.

Audit and review use the hardening-admission boundary in `spec-delivery-plan-record.md`. A concrete supported-v1
failure, authority violation, loss, corruption, unsafe ambiguity, or explicit invariant breach remains blocking.
Generality, extra historical evidence, hypothetical provider parity, and “more robust” alone do not. New durable
records, identities, ledgers, state machines, recovery branches, compatibility layers, provider abstractions, or
authorities must be proposed as scope changes rather than smuggled into a finding.

The reduction does not remove the safety floor:

- plan and state writes remain version checked;
- refs, heads, trees, and change requests remain exact bindings;
- current facts are reobserved immediately before and after mutation;
- one active operation survives interruption and blocks competing work;
- exact applied and non-applied outcomes reconcile, while ambiguity stops; and
- closeout derives current readiness and still requires ordinary review, verification, and merge authority.

## Delivery topology and sequence

The task list contains the authoritative member table. The current manual cut has three members:

1. `record-substrate` — Phases 1 and 2, merged through PR #443;
2. `authoring` — Phases 3 and 4, merged through PR #452; and
3. `guarded-state` — the amended Phases 5 through 7, not yet cut.

The former revisions and execution members are collapsed because their surviving contracts are tightly coupled and
the assurance-chain half has been removed. `guarded-state` starts from the `main` containing the first two members.

The implementation head excludes this work unit's active metadata, spec, notes, and task list. That keeps a partial
delivery from perturbing unrelated session resolution. Once the implementation candidate is settled, the lifecycle
artifacts and same-slug archival append as a documentation-only tail to the same terminal pull request; they are not a
fourth member.

The runbook is intentionally ordinary: cut from current `main`, keep the change set to the amended Phases 5 through 7,
run the repository's required checks, use a normal exact-head pull request, and honor the ARC merge lock. No separate
delivery proof, review ledger, or custom clearance path is part of this plan.

This delivery remains a useful third field datapoint because it was planned before its final implementation member.
Observe rewrite cascades, abandonment, and host merge behavior as field evidence. Do not add machinery for those cases
unless a concrete supported-path failure crosses the spec's hardening-admission boundary.
