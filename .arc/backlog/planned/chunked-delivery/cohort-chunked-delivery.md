# Cohort: `chunked-delivery`

> _Identity and coordination record for this cohort. Membership is **derived** from each member's `Cohort`
> field — recorded here only as shared coordination, never as a roster or status table._

**Purpose:** Let one work unit plan several reviewable delivery members and land them as an ordered stack to the
protected base. The cohort provides guarded execution around ordinary Git, change-request, review, and ARC lifecycle
operations. It does not create a second proof or review system.

---

## Sequencing

```text
delivery-plan-record                          shipped
└── delivery-stack-topology                   v1 spine
    └── delivery-review-cardinality           optional follow-up; not a v1 delivery prerequisite

delivery-stack-topology also waits on delivery-slice-review-vehicle (external, review seam)
delivery-review-cardinality also waits on review-request-contracts
```

Current readiness derives from member metas and their `Depends On`, not from this orientation view.

The v1 delivery path is `delivery-plan-record` plus `delivery-stack-topology`, with member review admission supplied
by the external `delivery-slice-review-vehicle`. Both recorded field deliveries were stack-shaped landings to the
protected base, and the stack projection is the one that removes the oversized terminal pull request, so it carries
the cohort's spine. `delivery-review-cardinality` remains a demand-held follow-up that activates on observed field
evidence and does not gate v1 readiness.

## Shared contracts

- `delivery-plan-record` owns immutable authored intent, stable member identity and order, plan revisions, the task-list
  projection, and one version-checked mutable `DeliveryState`. State binds exact refs and change requests, supports
  reverse lookup from a member ref to its owning plan and work unit, and records at most one active operation.
- `delivery-stack-topology` owns stack eligibility, guarded sequential landing to the protected base, suffix
  reconciliation, and lifecycle-artifact exclusion. Its landing core is built projection-neutral so downstream
  projections can reuse it. Member review admission is owned by the external `delivery-slice-review-vehicle`.
- `delivery-review-cardinality` owns no v1 contract. If field evidence activates it, it may improve review-request
  cardinality without weakening any member's existing obligation or creating delivery-authored review authority.

Review remains authoritative for review requirements, findings, and clearance. Delivery stores bindings to current
review targets only where execution needs them; it never copies review verdicts into a delivery ledger.

## V1 robustness floor

The cohort is intentionally small, but the supported lifecycle must still be safe:

- A plan revision has a stable identity and digest. Mutable state binds one exact revision and uses version-checked
  writes; stale writers refuse rather than overwrite.
- Member identity and predecessor order remain stable across plan revisions. Provider position is observed and
  reconciled; it is not copied into the immutable plan as a live/landed discriminant.
- The state binds exact member refs and change requests and supports reverse lookup from a member checkout.
- One active operation is reserved durably before mutation. Execution reobserves immediately before the mutation,
  performs the authorized action, reobserves afterward, and records only the resulting current coordinates.
- Unexpected ref, target, membership, or tree movement refuses. A known operation result may be reconciled; ambiguous
  movement is never silently adopted.
- Landing and closeout compare exact trees or contributions where identity-preserving commit comparison is unavailable.
- Non-final delivery members exclude the owning work unit's lifecycle artifacts, so a partially landed series cannot
  perturb another work unit's session resolution.
- A crashed session resumes or reconciles the one active operation from state. V1 does not promise autonomous repair of
  every provider failure or abandoned series.

These are mechanics for safe execution, not an evidentiary chain proving every historical observation.

## Explicit non-goals

V1 does **not** include:

- separate observation, assurance, terminal-proof, or audit ledgers;
- immutable plan members that convert from live to landed form, frozen-member fingerprints, or conversion revisions;
- generation high-water marks, assurance-subject identities, terminal-proof identities, or historical design-drift
  advisories;
- review-group, seam-receipt, cross-PR receipt-projection, or review-cardinality algebra;
- automatic chunk inference, stack discovery, compatibility-cap generation, or language-agnostic landability judgment;
- mixed topology segments inside one plan revision;
- a provider-general workflow engine or parity across every host-native stack feature;
- a replacement for work-unit verification, review settlement, integration authorization, or session lifecycle;
- backward-compatibility readers or migrations for unpublished development-state shapes.

The first implementation may expose narrow ports for Git, change-request, review, and state operations. A port exists
to isolate an authority boundary used by v1, not to promise an adapter ecosystem.

## Hardening-admission boundary

A design, task, audit, or code-review finding is blocking when it demonstrates at least one of:

1. violation of an explicit goal or invariant;
2. a concrete failure reachable in the supported v1 lifecycle;
3. violation of an existing repository, Git, host, review, storage, or ARC authority contract; or
4. loss, corruption, unsafe ambiguity, or unrecoverable mutation of in-scope state.

“More robust,” “more general,” and support for a hypothetical future host, storage tier, or review model are not
sufficient on their own. A proposal that adds a durable record, identity, ledger, state machine, recovery branch,
compatibility layer, provider abstraction, or new authority must be presented as a scope change. It may be accepted
through a design amendment, but it is not silently promoted into a required fix.

Non-goals do not excuse a demonstrated correctness failure in the supported path. They decide whether the remedy must
stay inside the current design or be proposed as a deliberate expansion.

## Problem and direction

ARC currently couples the work-unit concern boundary to one review and merge boundary. A cross-cutting concern can be
correctly one work unit while still producing a change set too large for effective review. Ordinary Git and pull
requests already allow teams to split that delivery. ARC's missing value is a durable plan, convenient lifecycle
integration, and enough guarded state to resume without reconstructing intent from branch names.

The model keeps four boundaries distinct:

- **Work unit:** concern, ownership, design, verification, and lifecycle.
- **Chunk:** review-attention boundary supplied by `review-chunking`.
- **Delivery member:** a chunk or group of chunks with an independent pull-request or merge boundary.
- **Phase:** task-plan organization, not a delivery identity.

The cohort executes one topology: members form an ordered stack and land to the protected base one at a time. Every
member must leave the protected base green and semantically coherent. The plan schema remains projection-neutral so a
downstream delivery projection can consume it without expanding this cohort's closeout boundary.

The lifecycle is deliberately direct:

1. Author a plan from the task decomposition and validate stable identities, order, coverage, and topology.
2. Bind state when the first member ref is pushed or change request is opened. Local candidate construction remains
   disposable and does not bind.
3. Before binding, replace intent freely. After binding, classify an amendment as `accepted`,
   `replacement-required`, or `refused`. A re-cut of the unlanded suffix requires replacement; a change that
   re-describes landed work or changes topology refuses. Crossing-seam acceptance remains attached to the landed side.
4. For each external mutation, reserve one operation, reobserve, mutate, reobserve, and update state with a version
   check.
5. At closeout, derive current readiness from the plan, state, Git, host, and review authorities. Record ordinary
   work-unit verification; do not mint a second terminal-proof chain.

## Field evidence and proportionality

The manual runs established the need for planned member identity, predecessor order, exact ref handling, lifecycle
artifact exclusion, reverse lookup, and interruption-safe progress. They also showed that native Git and host
operations already perform the delivery itself. The cohort therefore standardizes the repetitive, failure-prone
edges rather than modelling every fact those systems can report.

Additional observations of the same known event do not justify new mechanics. Expansion requires a structurally new
failure or a concrete consumer that the v1 state cannot serve.

## Member boundaries

### `delivery-plan-record`

Canonical intent and minimum execution state: plan identity and revisions; stable member and seam keys; authoring and
task-list projection; binding and three-way amendment outcome; exact ref/change-request bindings; reverse lookup;
version-checked state; and one active-operation port. No topology execution.

### `delivery-stack-topology`

The v1 executable projection: human-authored landability validation, ordered member refs and pull requests, sequential
landing and suffix reconciliation, and lifecycle-artifact exclusion, with the landing core built projection-neutral.
Member review admission comes from the external `delivery-slice-review-vehicle`; no host-native stack API is required
for v1.

### `delivery-review-cardinality`

An optional, evidence-triggered follow-up. It asks whether several delivery members need fewer provider requests or a
stronger aggregate review surface than the v1 baseline supplies. It starts from observed delivery cost and existing
review contracts; it does not begin with an assurance-group schema.

## V1 readiness

The cohort's v1 delivery path is ready when `delivery-plan-record` and `delivery-stack-topology` ship and a work unit
can:

- author and amend one delivery plan;
- execute the stack projection through guarded, resumable operations;
- review each member through the existing exact-head review lifecycle via the delivery-member vehicle;
- preserve ordinary work-unit verification and exact-head integration authorization; and
- run a partial stack without exposing active lifecycle artifacts or perturbing unrelated sessions.

`delivery-review-cardinality` may follow this milestone, but as a cohort member it must ship or leave the cohort before
the cohort itself closes and archives.

## Coordination

- `review-chunking` owns review-attention boundaries. Delivery consumes chunk identity without making every chunk a
  merge boundary.
- `decomposition-doctrine` owns whether a concern splits into several work units. Delivery begins after that decision.
  The shared boundary checkpoint splits along the same line: `delivery-stack-topology` owns the checkpoint chassis
  (the re-chartered `assess-boundary-fit` read and its delivery arm); doctrine owns the split-decision discriminator
  it dispatches to.
- Existing review contracts own obligation, applicability, findings, and clearance. The external
  `delivery-slice-review-vehicle` owns the narrow vehicle binding that names a delivery member and exact head.
- `integration-boundary-accuracy` and `integration-lane` own shared integration naming and final-window behavior.
- Storage remains abstract and version checked; delivery records do not assume tracked `.arc/` files or branch-derived
  work-unit identity.
- Deterministic comparison, dispatch, and remedy selection belong in typed CLI verbs. Workflow prose invokes those
  verbs and preserves human interlocks.

### Cross-cohort

`delivery-integration-target` is a standalone provisional downstream projection. If activated, it consumes the shipped
plan/state contracts and projection-neutral landing core, but it is not a cohort member and does not gate this cohort's
readiness, completion, or archival closeout.

## Scope estimate

The overall cohort remains substantial because it touches planning, Git topology, review admission, and lifecycle
integration. The substrate member has shipped. Each remaining member should be reclassified from its reduced draft
at planning close rather than inheriting `Heavy` solely from the earlier proof-system design.
