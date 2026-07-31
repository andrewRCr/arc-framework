# Draft: delivery-plan-record — the canonical delivery record and its shared reducer

- **Cohort:** `chunked-delivery` — see `cohort-chunked-delivery.md` for the shared canonical model,
  the problem framing, the field evidence the design rests on, and the cut that produced this member.
- **Purpose:** Own the canonical `DeliveryPlan` record and its schema-kernel identities, the
  task-generation authoring verb and its human task-list projection, the version-checked `DeliveryState`
  with its store and mutation lease, the projection-neutral transition reducer, and the membership and
  tree-exactness half of the terminal contribution proof.
- **Position:** the cohort's substrate member. It carries no external dependency and is buildable
  immediately; every other member consumes what it defines.

---

## Plan record, delivery state, and the shared reducer

**Exact `DeliveryPlan` v1 record.** Register the canonical record and every identity preimage with the schema kernel
under strict-current migration posture. The canonical constructor accepts a `DeliveryPlanAuthoringInput` plus the
validated prior revision when one exists; the input omits every derived identity, fingerprint, owner, and digest.
The stored record is:

```text
DeliveryPlanV1 {
  schemaVersion: 1
  semanticsVersion: "delivery-plan/v1"
  repositoryId
  workUnitId
  planId
  planRevision
  previousPlanDigest
  design: { revisionDigest, elements: [{ elementId, semanticDigest }] }
  tasks: {
    inventoryDigest
    implementation: [{ taskId, semanticDigest }]
    verificationTaskId
  }
  projection: { kind: "wu-integration-target" } | { kind: "stack-to-main" }
  members: DeliveryPlanMemberV1[]
  seams: DeliveryPlanSeamV1[]
  planDigest
}

DeliveryPlanMemberV1 {
  chunkKey
  chunkId
  deliverableId
  title
  contract
  taskIds
  designElementIds
  mainlineLandability
  assuranceSubjectId
  semanticFingerprint
}

DeliveryPlanSeamV1 {
  seamKey
  seamId
  title
  acceptance
  incidentDeliverableIds
  ownerDeliverableId
  designElementIds
  assuranceSubjectId
  semanticFingerprint
}
```

`repositoryId` and `workUnitId` come from their owning authorities; delivery does not derive WU identity from a
branch, slug-shaped ref, task-list path, or provider handle. `planId` is the domain-separated digest of those two
identities and the plan semantics, so one WU has one stable plan identity across revisions. Revision one has
`previousPlanDigest: null`; every later revision is exactly predecessor + 1 under the same `planId` and names that
predecessor's digest. `planDigest` covers the complete canonical record except itself. An append-only plan store
publishes by expected predecessor digest, preventing two successors from both becoming the current revision.

The design inventory binds the exact design revision plus each enumerable design element / success criterion used
for coverage. The task inventory binds every executable implementation leaf by its stable task id and semantic
digest, plus the one WU verification leaf. A task semantic digest covers its pre-implementation intent — title,
Goal, instructions, and test-first marker when present — while excluding its checkbox, completion notes, Outcome,
and the generated delivery-plan projection. `inventoryDigest` covers that normalized inventory, so rendering the
plan into the task list creates no digest cycle and later progress updates do not amend delivery intent.

`members` is the only topology-order carrier. Each author-supplied `chunkKey` derives a stable `chunkId`; granting
that chunk a merge boundary derives its `deliverableId` from the chunk identity rather than accepting a second
author key. The member's `contract`, task and design coverage, semantic landability assertion when present, and
incident / owned seam semantics derive `semanticFingerprint`, including the referenced task / design semantic
digests rather than identifiers alone. The title still changes the whole-plan digest but does not force replacement
when the member's actual contract is unchanged. No arbitrary `dependsOn` edges exist: predecessor is the previous
array member, and any requested landing is a contiguous prefix.

The member array contains only chunks promoted to independent merge boundaries. Every implementation leaf occurs in
exactly one member, in task-inventory order; the WU verification leaf occurs in none. Every declared design element
is covered by at least one member or named seam, with unknown references rejected. A finer review-only hierarchy
inside one member may be selected later against its exact target, but it remains review-owned and is absent from
this record.

A seam has at least two distinct incident deliverables, listed in plan order. Its scheduling owner is derived as
the latest incident member and cannot be authored differently. The exact acceptance statement and incident set
derive the seam fingerprint. Member and seam `assuranceSubjectId` values derive from `planId`, subject kind, and
stable subject identity, excluding plan revision and evidence-carrier identity so they survive harmless
materialization and presentation changes. A member fingerprint incorporates every incident seam fingerprint, so a
changed cross-member contract cannot reconcile as an unchanged bound prefix.

`mainlineLandability` is always one of `{ assertion: "independently-landable", invariant }` or
`{ assertion: "integration-only", invariant }`, preserving the semantic judgment even when the selected projection
does not need incremental `main` landing. A stack-to-`main` plan requires at least two members and the first form on
every member. This is the irreducible authored judgment only. Current checks, linearity, provider support, merge mode,
stack depth policy, and exact bases / heads remain reducer inputs and cannot appear in the plan.
`decomposition-doctrine` may reuse the same green-and-consistent vocabulary, but it owns only whether a concern
should become several WUs; this delivery contract owns whether an already chosen member may land independently.

The constructor preserves source inventory order and member order, normalizes set-like values, derives every
identity through registered domain-separated preimages, then validates the complete record. A reader repeats the
identity, digest, uniqueness, coverage, seam-owner, revision-lineage, and projection refinements. Provider bindings,
branch / PR names, adapter capabilities, review targets / requirements / receipts, task completion state, and
workflow steps are schema errors rather than tolerated extra fields.

**Human task-list projection.** After canonical publication, the authoring command replaces one generated
`Delivery Plan` section in `tasks-*`: exact plan revision / digest, projection, an ordered member table (title,
chunk key, task ids, design ids, predecessor), and a named-seam table (incident members, owner, acceptance).
Single-deliverable plans render the same shape with one row. The section is informative and replaceable; workflows
and reducers never parse it, and per-task delivery tags do not create a second authority.

**Minimal `DeliveryState` contract.** One strict-current, non-evidentiary snapshot contains:

- `stateId`; the owning repository / work-unit identity; and the exact `planId`, plan revision, and plan digest;
- `stateRevision`, the selected delivery-host adapter, and the projection discriminant / provider binding;
- one plan-ordered entry per deliverable: stable `deliverableId`, materialization generation, ref and change-request
  handles, last exact base / head / tree / membership observation, current review-routing projection and optional
  target / coverage / requirement binding, and any exact landing-observation reference;
- the analogous integration / terminal-target bindings required by the selected projection, including any
  terminal-only delta target and its review-owned coverage / qualification references; and
- either no active operation or one `activeOperation` binding its canonical `operationId`, kind
  (`materialize | publish | rewrite | land`), affected deliverable ids or terminal target, starting state revision,
  and exact requested heads / bases. A land operation additionally carries its immutable `landingIntentId`.

Mutable provider status is not copied as authority. An observation is a freshness-bound input to reconciliation; every
control-bearing verdict re-observes the relevant Git and host facts. Review findings, dispositions, receipts, and
qualification remain review-owned. Delivery retains only their identities and asks the review reducer for current
qualification.

The store contract is `read` plus version-checked `publish(expectedRevision)` under a state-scoped mutation lease,
composing the existing review operation-store pattern rather than introducing a second concurrency model. A
host-mutating command reserves `activeOperation`, invokes the adapter, observes the exact outcome, then atomically
updates bindings and clears the operation. A crash leaves the reservation: retry acquires the same operation identity,
reconciles before replay, and either adopts an already-applied exact result or reissues through an adapter operation
that is idempotent by operation id or structural delivery identity. A different operation stops while one is live.
Reconciliation clears an operation only when the host proves it applied exactly or did not apply; ambiguous or
partially applied outcomes remain blocked for an explicit remedy. Review operations use the review subsystem's own
resumable records rather than nesting inside this slot.

**Plan-revision reconcile.** Before any external binding, state may rebind to a new plan revision. Afterwards,
automatic reconcile requires the selected topology and every bound or landed deliverable's semantic fingerprint and
relative prefix position to be unchanged; the unbound suffix may be amended. A changed topology, changed or reordered
bound member, or removal of a landed member returns `replacement-required`. The replacement lineage explicitly
references its predecessor and begins only after the caller chooses a teardown / adoption remedy; the old state is
never overwritten into the new meaning.

**Session locus.** The delivery state carries the owning work-unit pointer; the session-locus layer carries only that
subject pointer, not a copy of delivery state. Commands may receive the pointer explicitly, so state design does not
depend on branch parsing or a specific worktree implementation. A disposable ref therefore remains usable from a
materialized session without becoming a WU or acquiring a meta file.

**Minimal common lifecycle.** The state record stores facts rather than a second agenda. CLI verdicts derive the
aggregate position from ordered per-deliverable facts:

1. **Bind** an empty state revision to the exact plan digest and a delivery-host adapter.
2. **Materialize** provider refs for the next admissible deliverable without changing its canonical identity.
3. **Publish and observe** its PR plus provider-reported base, head, membership, checks, and capabilities.
4. **Satisfy review** against an exact target; a changed target carries coverage only through the existing typed
   applicability / retrigger contract.
5. **Land** only an admissible deliverable or prefix after the applicable interlock; then reconcile provider truth.
6. **Complete** only when every planned deliverable, named seam, terminal-only delta, and the
   projection-independent terminal proof are satisfied.

Plan drift, provider drift, ref rewrites, and interrupted operations produce typed reconcile verdicts; they do not
silently remap deliverables or discard review evidence. Aggregate labels such as unstarted, active, ready, stale, and
complete are derived verdicts rather than independently writable state.

**Shared transition reducer.** For the plan-ordered sequence `D1 … Dn`, derive the longest exact `landedPrefix` and
its `firstUnlanded` member from current host observations; neither is writable state. The projection defines the
destination in which “landed” is observed. A requested transition is admissible only when:

1. the state still binds the current plan revision and has no different unresolved operation;
2. the adapter proves the expected repository, projection, ordered membership, bases, heads, and trees, with no
   missing or extra member;
3. a landing request names a non-empty contiguous prefix beginning at `firstUnlanded`;
4. every selected member's current generation has green required checks and either its review-owned routed
   exemption or admissible current requirement-qualification projection; every assigned seam has a `qualified`
   projection; and every stack-selected member carries the plan's semantic landability judgment; and
5. an immutable `LandingIntent` binds the exact member set, generations, checks, review assurance, contribution
   manifest, destination, and landing mode before the applicable interlock.

A changed base, head, or membership never passes through as “close enough.” Reconcile first: preserve stable
deliverable identity, advance the affected materialization generations, derive new review targets, and withhold
another readiness verdict until checks and review applicability / retrigger settle. After mutation, re-observe the
host and accept only the requested exact result or a landing mode's explicitly contracted partial result.

**Exact assurance record chain.** Precondition evidence, human authorization, and the observed host result are
different facts and must not collapse into one “terminal assurance” record.

1. **`LandingIntent` — exact pre-mutation contract.** A canonical immutable payload embedded or content-addressed
   by `activeOperation` — not a second operation ledger — binds:
    - repository, state id / revision, plan id / revision / digest, projection, operation id, and delivery-host
      adapter / capability;
    - exact destination ref plus its observed pre-landing head / tree;
    - the requested contiguous member prefix, each stable deliverable id and materialization generation, and the
      exact source base / head / tree or contribution-manifest entry used for it;
    - current required-check observations plus each member's routed exemption or review-system qualification
      projection, including the coverage binding that proves every non-exempt selected member and assigned seam
      subject;
    - landing mode and exact admissible outcomes: one expected result for `single` / `atomic-prefix`, or the ordered
      list of allowed leading-subprefix result trees for `ordered-prefix`; and
    - any terminal-only delta target and its review qualification / applicability proof. The terminal intent also
      binds the WU verification anchor to the same aggregate contribution digest.

   The applicable interlock receives a derived, exception-filtered readiness projection of that record. Human
   approval remains the sole merge authority and is not turned into a delivery receipt. Before mutation, the command
   re-observes every control-bearing fact and requires the same intent digest; any state, base, head, membership,
   capability, check, review, or contribution change invalidates the intent and refires the interlock. This composes
   with the existing exact-head integration boundary rather than creating a second authorization system.

2. **`LandingObservation` — immutable post-mutation fact.** Reconciliation emits a canonical observation binding
   the `landingIntentId`, host operation identity, exact before / after destination heads and trees, actual landing
   mode / outcome, exact landed member ids / generations, contribution-manifest digest, and the check / review
   evidence references used by the intent. The result must equal the intent's exact result or one enumerated
   leading-subprefix result. An ambiguous, extra, reordered, or otherwise uncontracted mutation emits no successful
   observation and leaves the operation blocked for remedy.

3. **`DeliveryCompletionRecord` — terminal fact, never merge authority.** Only the terminal reducer emits this
   immutable record. It binds the repository, state and exact plan revision; projection; ordered landing-observation
   ids; the exact final `main` head / tree; every member and terminal-only delta contribution or empty-delta proof;
   every routed exemption; every member / seam / non-empty-terminal-delta coverage binding and qualification
   projection; the exact WU verification anchor; and a canonical contribution-chain digest. The record has only a
   proven-complete form. Incomplete and stale cases remain typed reducer verdicts rather than persistent failure
   records.

**Projection-independent terminal contribution proof.** Over that record chain, the terminal reducer verifies:

- landing member sets are disjoint, ordered, contiguous, and cover `D1 … Dn` exactly once;
- every observed tree transition equals the contribution of the named current reviewed generations, with no extra
  WU-owned delta;
- every member / seam assurance subject maps either to an exact review-owned routed exemption or to an admissible
  current requirement qualification whose coverage binding names that exact subject / generation; named seams
  always map to `qualified`;
- the terminal-delta subject carries either an exact empty-delta proof or the corresponding admissible review
  qualification / applicability evidence for its non-empty change set;
- the WU verification anchor covers the same complete contribution chain and exact design revision;
- each observation matches its immutable intent and an exact result that reached the applicable interlock; and
- the final operation result and final `main` tree equal the terminal chain's expected result.

The integration-target projection has one such `main` landing after separately proving its internal series. The stack
projection may have several. Unrelated `main` advances between stack operations are legitimate new bases: they force
suffix reconciliation but are absent from the WU contribution chain. Terminal correctness therefore does not compare
the ambient `main` trees at WU start and finish. The completion record may support reporting and downstream lifecycle
queries, but it cannot authorize a merge retroactively or stand in for a required host-side check.
