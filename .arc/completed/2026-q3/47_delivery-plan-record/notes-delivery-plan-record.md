# Notes: delivery-plan-record

- [Verified substrate facts](#verified-substrate-facts)
- [Field-evidence anchors](#field-evidence-anchors)
- [Proportionality decision](#proportionality-decision)
- [Delivery topology and sequence](#delivery-topology-and-sequence)
- [Guarded-state grounding audit](#guarded-state-grounding-audit)

---

## Verified substrate facts

These facts grounded the amended implementation plan. Names identify the verified substrate but do not substitute for
reading the current tree.

**Schema and identity substrate.** The kernel has strict runtime schemas, `strict-current` registration,
domain-separated canonical digests, and byte-stable canonicalization. `DeliveryPlanV1` already has a minted `planId`,
derived stable `deliverableId`, exact revision lineage, current task and design inventories, member and seam semantic
fingerprints, and a self-excluding plan digest. Those mechanisms have active authoring, composition, rendering, field
fixture, and command consumers and remain in scope.

**The excess was concrete and removable.** The pre-reduction delivery implementation also had:

- `live` and `landed` member variants plus validation of a frozen landed prefix;
- member and seam `assuranceSubjectId` derivations and a registered preimage;
- `DeliveryAssignmentsV1`, materialization generations, generation high-water marks, and review-routing payloads;
- separate assignment and observation store ports and repository-common namespaces; and
- an append-only assurance store with export and import.

The shipping delivery handler constructed only the transient authoring store and current-plan store. Assignment,
observation, and assurance records had no command or topology-executor consumer beyond their own unit and integration
tests. Their removal was therefore a contract simplification, not a migration of live product state.

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

Before Phase 5 began, the operator authorized a scope correction across this work unit and its cohort. The accepted v1
target is guarded execution around ordinary Git, change-request, review, and ARC lifecycle operations. It is not a
provider-neutral proof system.

The accepted implementation made the already-built plan intent-only, replaced assignment, observation, and assurance
storage with one `DeliveryStateV1`, and supplied one active-operation guard. The original Phase 5 through 7 tasks are
preserved as superseded pre-commitment text in `tasks-delivery-plan-record.md`; their replacement tasks record the
implemented authority.

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

The task list contains the authoritative member table. The manual cut had three members:

1. `record-substrate` — Phases 1 and 2, merged through PR #443;
2. `authoring` — Phases 3 and 4, merged through PR #452; and
3. `guarded-state` — the amended Phases 5 through 7, merged into the terminal work-unit change.

The former revisions and execution members were collapsed because their surviving contracts were tightly coupled and
the assurance-chain half was removed. `guarded-state` started from the `main` containing the first two members.

The nonterminal implementation heads excluded this work unit's active metadata, spec, notes, and task list. That kept
partial delivery from perturbing unrelated session resolution. The lifecycle artifacts and same-slug archival form a
documentation-only tail to the terminal pull request; they are not a fourth member.

The delivery is a third field datapoint because its final implementation member followed an authored plan. Its
ordinary Git and pull-request path required no separate delivery proof, review ledger, or custom clearance path;
future mechanics still require a concrete supported-path failure crossing the spec's hardening-admission boundary.

## Guarded-state grounding audit

The pre-implementation audit over amended Phases 5 through 7 found three contract gaps worth fixing before code: the
classifier needed one explicit policy and result shape; an active operation needed both exact pre-state and requested
post-state; and an accepted-amendment receipt needed to pin the classified state revision for crash-safe rebind. These
are corrections to the reduced design, not reasons to restore observation, assurance, or proof records.

Implementation followed the dependency order in the task list: intent-only schemas and validation, then the pure
classifier, then state storage, guarded operations and position derivation, and finally composition and end-to-end
cleanup. The source surface was broader than the task titles: authored status appeared in schema, construction, maps,
projection, fixtures, registry expectations, and field-run tests; assignment, observation, and assurance also occupied
ports, repository-common namespaces, exports, and dedicated tests.

Two code-level cautions shaped that sequence. The Markdown-absent handler path bypassed rendering and had to collapse
into composer-owned recovery. Reverse lookup treated an optional owning-unit pointer as a scan restriction; the state
implementation instead validates it only as a hint and retains global ambiguity detection. Neither caution warranted
a new abstraction or durable record.
