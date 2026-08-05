# Spec (`detailed` · `RFC`): Delivery Plan Record

- **Origin:** [internal]
- **Purpose:** Define one immutable delivery plan, its two authoring entries, and the minimum version-checked state
  needed for later delivery projections to operate safely without creating a second review, proof, or workflow
  system.

---

## Introduction / Context

ARC currently makes a work unit both the concern boundary and, in practice, the pull-request boundary. Those
boundaries often coincide, but a coherent work unit can still be too large for one effective review or merge. Teams
already solve that with ordinary branches, pull requests, and stacks. ARC's useful contribution is narrower: retain
the intended members and their order, make the plan visible in the task list, and keep enough exact state to resume a
partially executed delivery without reconstructing intent from branch names.

Two manual deliveries establish the concrete need. `decompose-transform-integrity` shipped as a seven-member stack,
and `session-locus-model` shipped as a rolling sequence of delivery and corrective members. They demonstrated the
value of stable member identity, predecessor order, exact ref handling, lifecycle-artifact exclusion, reverse lookup,
and interruption-safe progress. They did not demonstrate a need for a delivery-owned evidence chain, review ledger,
or historical model of every provider observation.

This work unit owns the common substrate only:

- an immutable-per-revision `DeliveryPlanV1` containing authored intent;
- peer `from-tasks` and `from-branch` authoring entries;
- a generated human projection in the task list;
- binding and amendment classification;
- one version-checked `DeliveryStateV1` with exact external bindings and at most one active operation; and
- pure guards that later topology executors use around external mutation.

`delivery-integration-target` owns the first executable projection. `delivery-stack-topology` owns the stack-specific
projection. Review remains review-owned, Git and the host remain authoritative for current provider facts, and normal
work-unit verification remains the completion record.

## Goals

- Carry one canonical, immutable-per-revision plan whose `planId` and `deliverableId` values remain stable across
  revisions and work-unit renames.
- Keep member order, task and design coverage, projection choice, landability assertions, and named cross-member
  seams in one plan read by both delivery projections.
- Support authoring before implementation from a task list and after implementation from an existing branch, without
  inventing task attribution historical work does not contain.
- Publish the plan with digest-checked replacement and render one replaceable `Delivery Plan` section into the task
  list.
- Bind delivery when the first member ref is pushed or change request is opened, while leaving local candidate
  construction disposable.
- Classify post-binding amendments as `accepted`, `replacement-required`, or `refused` from the current plan, proposed
  plan, and freshly supplied binding and landed-prefix facts.
- Store exactly one mutable delivery-state record per plan, using version-checked writes, exact ref and change-request
  bindings, reverse lookup, and one active-operation reservation.
- Give later executors a small guarded-operation contract: reserve, reobserve, mutate, reobserve, reconcile, and clear.
- Keep all records storage-agnostic and outside the work unit's change set.

## Non-Goals

V1 does not include:

- topology execution, integration-target management, or stack landing in this work unit;
- a separate observation, assurance, terminal-proof, receipt, or audit ledger;
- plan members that convert from `live` to `landed`, frozen-member fingerprints, or conversion revisions;
- generation high-water marks, assurance-subject identities, review-routing identities, or terminal-proof identities;
- historical design-drift advisories or persisted provider-status history;
- delivery-owned review verdicts, review groups, seam receipts, or review-cardinality algebra;
- automatic chunk inference, stack discovery, compatibility-cap generation, or language-agnostic landability judgment;
- mixed topology segments within one plan revision;
- a provider-general workflow engine, adapter ecosystem, or parity with every host-native stack feature;
- replacement of work-unit verification, review settlement, integration authorization, or session lifecycle; or
- compatibility readers or migrations for unpublished delivery record shapes.

A narrow port is justified only where a later v1 executor crosses a real authority boundary. It does not promise
additional implementations.

### Hardening-admission boundary

A design, task, audit, or code-review finding blocks this work when it demonstrates at least one of:

1. violation of an explicit goal or invariant;
2. a concrete failure reachable in the supported v1 lifecycle;
3. violation of an existing repository, Git, host, review, storage, or ARC authority contract; or
4. loss, corruption, unsafe ambiguity, or unrecoverable mutation of in-scope state.

“More robust,” “more general,” and support for a hypothetical future host, storage tier, or review model are not
sufficient alone. Adding a durable record, identity, ledger, state machine, recovery branch, compatibility layer,
provider abstraction, or new authority is a scope change that requires an explicit design amendment.

Non-goals do not excuse a demonstrated correctness failure in the supported path. They constrain the remedy to the
smallest mechanism that satisfies the current contract.

## Proposed Design

### 1. `DeliveryPlanV1` is immutable authored intent

The canonical record remains strict-current and immutable per revision. It contains:

- `schemaVersion` and `semanticsVersion`;
- optional opaque `projectId`, the originally authored `workUnitId`, minted `planId`, `planRevision`, and
  `previousPlanDigest`;
- one or two design-artifact bindings and their current semantic element digests;
- the parent implementation-task inventory, its digest, and the separate verification-task id;
- `entry: from-tasks | from-branch`;
- one projection discriminant: `wu-integration-target` or `stack-to-main`;
- ordered members and normalized named seams; and
- the self-excluding `planDigest`.

The plan carries no provider position. A member has one shape:

```text
DeliveryPlanMemberV1
  chunkKey
  deliverableId
  title
  contract
  taskIds[]
  designElementIds[]
  mainlineLandability
  semanticFingerprint
```

`deliverableId` derives from only `planId` and `chunkKey`, so it remains stable across revisions and work-unit
renames. `semanticFingerprint` remains a current, re-derivable digest of the member's contract, task and design
semantics, landability assertion, and incident-seam fingerprints. It is never frozen. The amendment classifier, not
the record schema, decides whether a changed current fingerprint is permissible after binding or landing.

A seam has `seamKey`, title, acceptance, plan-ordered incident deliverable ids, the latest incident member as owner,
design-element ids, and a re-derivable semantic fingerprint. It needs no separate identity: `(planId, seamKey)` is
already an unambiguous key, and no v1 consumer addresses a seam outside its plan.

The constructor derives all identities, order-dependent ownership, fingerprints, and digests. Validation rechecks the
complete record from its contents and, for a successor, checks exact revision lineage. It does not inspect Git, a
provider, review state, or delivery state.

The existing `strict-current` posture permits the pre-public implementation to remove `status`,
`assuranceSubjectId`, and their registered preimage without aliases or migrations. Development-only persisted data is
cleared or regenerated.

### 2. Coverage binds intent without claiming exclusive attribution

The task inventory contains parent implementation tasks only. Each task contributes normalized `_Goal:_` text to its
semantic digest; completion markers, `_Outcome:_` text, and ordinary task-list progress do not change it. The sole
verification task remains separate and cannot be assigned to a delivery member.

Design binding accepts one or two artifacts and records exact artifact and element semantic digests. Every referenced
task and design element must exist. On `from-tasks`, every implementation task and known design element must be
covered by at least one member. Coverage is at least once, not exactly once: a cross-member concern may appear in more
than one member.

`from-branch` preserves the same record shape but treats missing task attribution as an advisory. Historical commits
may legitimately name no task, name a subtask that normalizes to a parent, or consist mainly of review and maintenance
fixes. The entry refuses malformed or contradictory attribution; it does not fabricate an exact task partition.

For `stack-to-main`, the plan contains at least two members and every member asserts
`independently-landable`. For `wu-integration-target`, landability is retained as authored intent but is not interpreted
as protected-base eligibility by this work unit.

### 3. Two authoring entries share one composition spine

Both authoring commands produce a paired transient map outside the working tree:

- a CLI-owned canonical JSON snapshot containing every machine-derived fact and identity ordering; and
- an editable Markdown map containing the canonical machine section plus empty author-owned slots.

The map is authoring state, not a delivery record. A second outstanding map for the same work unit refuses. Composition
requires all slots, compares the machine section and identity order to the snapshot, validates coverage, constructs the
plan revision, publishes it by expected digest, renders the task-list projection, and removes the pair last. A failed
publication or render leaves enough canonical state for an idempotent retry. Explicit abandonment removes the pair
without publishing.

Rename resolution enumerates existing plans or snapshots by their recorded original work-unit id and follows the
existing authenticated forward retirement chain to the current slug. Terminal retirement, ambiguity, cycles, or
unestablished authority refuse or resolve to safe absence according to the existing resolver contract. The mutable
slug never enters `planId` or `deliverableId` derivation.

#### `from-tasks`

The task entry reads the current task inventory and validated design inventory. Phase alignment is offered as an
author-selected convenience, not pre-filled as an answer and not enforced as an invariant. Explicit boundaries remain
available. The author supplies member keys, titles, contracts, coverage, landability, projection, and seams.

#### `from-branch`

The retrofit entry reads one explicit or resolved base-to-head range. It walks first-parent history and partitions
work-unit contribution rather than raw commits. A merge is ambient only when its non-first parent belongs to the base
line and a remerge or equivalent tree proof establishes that the merge carries no merge-only work-unit delta. Unknown
change sets, ambiguous divergence, or unproved merge purity refuse.

The machine section supplies commit order, canonical change sets, cumulative path shape, co-change edges, lifecycle
artifact touches, and normalized task attribution. It does not propose boundaries. The author supplies contiguous
contribution ranges and the same intent fields as `from-tasks`.

### 4. The task-list projection is replaceable, not authoritative

After canonical publication, composition replaces one generated `Delivery Plan` section in the task list. The section
contains the plan revision and digest, projection, ordered member table, and named-seam table. Exact start and end
sentinels bound later replacement. Duplicate sections, malformed sentinels, or a missing replacement locus refuse
without changing the task list.

The projection never renders provider position or landed history. It describes the current plan revision. Provider
bindings and current position belong to `DeliveryStateV1` and fresh host observations. Workflows and reducers never
parse the Markdown projection.

### 5. Binding and plan amendment

Plan existence and delivery binding are separate. Before binding, a valid successor plan may replace the current plan
by digest compare-and-swap without delivery reconciliation. Local candidate construction does not bind.

Binding begins when either of these becomes externally visible:

- a member ref is pushed; or
- a member change request is opened.

The first such event creates `DeliveryStateV1` bound to the exact current plan revision and digest. State existence is
the binding fact; the immutable plan carries no `bound` field.

After binding, composition calls one pure classifier with:

- the validated current and proposed plan revisions;
- the currently bound deliverable ids from `DeliveryStateV1`; and
- a freshly observed, plan-ordered landed prefix from the selected host.

The classifier returns exactly one outcome:

- `accepted` — every externally bound or landed member retains its identity and predecessor position; presentation
  may change anywhere, additive task or design coverage may change on a non-landed member, and appended or otherwise
  unbound suffix intent may change freely when it preserves the projection's structural rules;
- `replacement-required` — no landed contract is re-described, but a bound unlanded member or pre-landing projection
  would change contract, landability, incidence, order, identity, or existing coverage in a way that requires its ref
  or change request to be torn down and recreated; or
- `refused` — the proposal removes, reorders, or semantically changes a landed member; changes projection after any
  landing; contradicts the host-derived landed prefix; or drops a crossing-seam obligation attached to the landed
  side.

Titles do not enter semantic fingerprints. Additive coverage on a bound unlanded member is accepted because it does
not alter the external contribution; moving or removing its existing coverage requires replacement. Any task, design,
contract, landability, or seam-semantic change to a landed member refuses.

For a seam crossing the landed boundary, the proposed revision retains the same acceptance and every landed-side
incident member. The unlanded side may be recut through `replacement-required`. No conversion revision or frozen copy
is necessary because the classifier compares immutable revisions with current host facts.

An accepted amendment follows one exact retry-safe order: record the candidate receipt, publish the plan, rebind state
when state exists, render the task-list projection, delete the Markdown map, then delete the canonical snapshot. If
interrupted after plan publication, state remains bound to the old digest and all operations refuse until an
idempotent retry completes the rebind. A later render or cleanup failure leaves the existing candidate receipt
sufficient to resume without republishing a new revision. `replacement-required` does not publish; it names the bound
suffix that must be torn down, and the authoring pair remains available for retry. `refused` makes no mutation.

### 6. One version-checked `DeliveryStateV1`

Delivery keeps one mutable record per bound plan. The storage envelope supplies the monotonically increasing
`stateRevision`; the payload does not duplicate it.

```text
DeliveryStateV1
  planId
  workUnitId
  boundPlan { planRevision, planDigest }
  target | null
    ref
    coordinates { head, tree } | null
  members[]
    deliverableId
    ref | null
    changeRequest | null
    coordinates { base, head, tree } | null
  activeOperation | null
```

`target.ref` names the exact destination selected by the later topology executor. A member `ref` names its exact
source ref. Each adjacent `coordinates` value is the single stored source for the latest exact objects: destination
head and tree for the target, and source base, head, and tree for a member. The ref field does not duplicate a head. V1
permits at most one change request per member and stores only provider and change-request identifiers.

These coordinates are a resumable snapshot, not authority over the provider. Every control-bearing operation obtains
fresh Git, host, check, and review facts. Delivery does not copy provider status, findings, verdicts, or clearance into
state.

Member entries follow current plan order and are keyed by `deliverableId`. A structural codec validates the payload;
a separate pure `validateDeliveryStateAgainstPlan()` check proves that `workUnitId`, plan revision and digest, member
identity, and member order match the bound plan. The store remains plan-agnostic and callers apply this check before
publication and use.

The stored `workUnitId` is the plan's originally authored subject. The state store supports reverse lookup from an
exact ref plus observed head, or from an exact head when unambiguous, to that subject, the owning `planId`, and the
`deliverableId`. The existing authenticated rename resolver translates the stored subject to the current slug when a
caller needs current work-unit position. Ref names never encode work-unit identity.

`DeliveryStateV1Schema` registers as a strict-current delivery schema. The local v1 adapter stores plans under one
repository-common `plans` namespace and state under one `state` namespace. Plan writes compare the expected current
digest; state writes compare the expected revision. Stale writes refuse. Both ports remain storage-agnostic and use
the shared repository-common publisher only as the v1 adapter.

The existing assignment, observation, and assurance ports, namespaces, codecs, exports, and tests are removed. Their
surviving responsibilities are either fields in `DeliveryStateV1` or fresh facts supplied to a guard. No migration or
compatibility reader is added for their unpublished development data.

### 7. One active operation and guarded execution

This work unit does not mutate provider state. It supplies the state and pure guard contract used by the two topology
executors.

An `activeOperation` contains only what crash recovery needs:

- a caller-minted opaque `operationId`, unique only within the one occupied active-operation slot;
- `kind: materialize | publish | rewrite | land | teardown`;
- affected deliverable ids;
- the state revision and bound plan digest against which it was reserved; and
- exact expected destination and source ref, head, and tree coordinates relevant to the requested mutation.

Only one operation may be active. Reserving a second or reserving against stale state refuses. The later executor then:

1. reobserves every control-bearing coordinate immediately before mutation;
2. refuses if current facts differ from the reservation;
3. invokes the one topology-specific mutation;
4. reobserves the result;
5. accepts only the exact requested result; and
6. updates current coordinates and clears the reservation by version-checked write.

If the session crashes, the reservation remains. Reconciliation reobserves first. An exact already-applied result is
adopted and clears the operation; exact non-application permits retry; partial, extra, reordered, or otherwise
ambiguous movement remains blocked for explicit remedy. V1 does not attempt autonomous repair.

Current position is derived from the current plan plus fresh host facts. Helpers may return a landed prefix,
`firstUnlanded`, bound suffix, and refusal reasons, but those labels are not independently writable state. Closeout
likewise derives current membership and exact tree or contribution agreement, then delegates to ordinary work-unit
verification and existing review and merge authority. It emits no terminal delivery proof.

### 8. Authority and lifecycle boundaries

- The plan owns authored intent. State owns delivery-selected bindings and one operation reservation.
- Git and the change-request host own current refs, trees, merge state, checks, and provider status.
- Review owns review targets, requirements, findings, verdicts, and clearance. Delivery stores no review ledger.
- The ARC work-unit lifecycle owns verification, integration authorization, archival, and session resolution.
- Later topology executors own provider mutation and the exact observation adapters they require.
- Non-final stack members exclude the owning work unit's active lifecycle artifacts. This work unit records the
  intent and state needed by that rule; `delivery-stack-topology` enforces it.

Deterministic comparison, classification, and remedy selection live in typed library or CLI contracts. Workflow prose
invokes stable verbs and preserves human interlocks; it does not evaluate state or reproduce provider mechanics.

## Alternatives & Rationale

### Use ordinary Git and no ARC record

This remains valid for teams comfortable reconstructing a stack from branches and pull requests. It does not satisfy
ARC's need for a durable plan, task-list visibility, reverse lookup, or interruption-safe lifecycle integration. The
design therefore wraps ordinary Git rather than replacing it.

### Persist separate assignment, observation, assurance, and proof records

This cleanly classifies every fact but creates multiple identities, compare-and-swap points, recovery seams, and
authority questions before a consumer needs them. One current state snapshot plus fresh observations provides the
required safety. Historical evidence remains with Git, the host, review, and ordinary work-unit verification.

### Store provider position in the immutable plan

A `live`/`landed` discriminant makes an intent record depend on host facts and requires conversion revisions and frozen
copies to keep old members stable. Deriving position from the provider keeps authority with the system that can prove
it and makes plan revisions ordinary immutable intent.

### Make every provider fact an adapter-neutral abstraction

The first two executors need a few exact Git and change-request operations, not a general workflow engine. Narrow ports
at used authority boundaries preserve replaceability without committing to provider parity or a capability matrix.

### Infer member boundaries automatically

The field runs cut along semantic and language-specific structure that a general tool cannot establish safely.
Authoring remains a human judgment; the CLI validates closure, ordering, coverage, and exactness.

## Cross-cutting Considerations

### Storage evolution

Plan and state records are independent of tracked `.arc/` paths and use version-checked writes. The repository-common
adapter is a local implementation, not the contract. Both records can move to the planned materialized git-backing
store without changing their semantics.

### Procedure evolution

Classification, comparison, reverse lookup, and reconciliation verdicts are typed code. Agent-facing procedure calls
those operations and renders precomposed results. No new agent-interpreted control-flow markup is introduced.

### PM composition

Work-unit and plan identity remain provider- and branch-independent. Provider and change-request ids are bindings, not
ARC identity and not a second mutable copy of PM status. No external tracker becomes authoritative for ARC's plan or
work-unit artifacts.

### Security and trust

All persisted inputs are runtime validated. Refs, heads, trees, plan digests, and state revisions are exact values,
not trusted branch-name conventions. Provider credentials and authorization remain outside delivery records. Delivery
never turns a local record into merge or review authority.

### Performance and operability

Plans and state are small per-plan JSON records. Enumeration exists only for identity and reverse lookup; a direct
owning-unit pointer may narrow a lookup but cannot prove identity. One active operation makes recovery inspectable and
bounds reconciliation work.

## Success Criteria

- Both recorded manual deliveries reconstruct through `from-branch`, including strict refusal of an historical merge
  whose ambient purity cannot be proved.
- `from-tasks` publishes a plan and renders its task-list projection while refusing uncovered implementation work and
  verification-task membership.
- `planId`, `deliverableId`, revision lineage, semantic fingerprints, and plan digest revalidate from the canonical
  record without provider access.
- The plan and authoring schemas contain no provider position, assurance subject, generation, review-routing, or
  terminal-proof fields.
- Binding begins only at the first pushed member ref or opened change request; local candidate construction remains
  unbound.
- Amendment fixtures cover `accepted`, `replacement-required`, and `refused`, including landed-prefix protection and
  crossing-seam preservation.
- Plan and state writes refuse stale digest or revision tokens, and interrupted accepted amendments remain blocked
  until state rebind completes.
- `DeliveryStateV1` supports exact member bindings, unambiguous reverse lookup, and one active operation without a
  second observation or assurance record.
- Crash fixtures distinguish already-applied, not-applied, and ambiguous operation outcomes without silently adopting
  unexpected movement.
- Current position and closeout readiness derive from fresh plan, state, Git, host, check, and review inputs; no
  terminal delivery-proof record is emitted.
- Work-unit rename resolution preserves the plan and all dependent identities.
- All quality gates pass and the work unit is ready for integration.

## Open Questions

No design question is intentionally deferred inside this work unit. Exact provider mutation verbs, eligibility rules,
and final closeout commands belong to the two topology work units and must stay within the cohort's v1 robustness and
hardening-admission boundaries.
