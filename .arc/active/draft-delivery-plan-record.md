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

## Continuity

**Readiness:** `maturing`. The record shape, state contract, transition reducer, assurance chain, authoring input
contract, and success signal are settled. What remains open concentrates in the authoring command's own surface,
the retrofit entry's machine derivation, and three boundaries this member consumes rather than owns.

**Resolved — identity and binding.**

- **Task references are the task list's own positional ids** (`X.Y`, `X.Y.a`), not a second minted identity. Two
  independent locks make them sound: a **completion lock** holding a task id immutable once it is completed, and
  the **plan lock** below. The first protects commit-footer integrity and is owned elsewhere, so delivery
  free-rides on it rather than requiring it.
- **A member boundary may span a parent task.** Phase-to-member alignment is what the authoring verb defaults to,
  never an invariant — the member's landability assertion is the real constraint, and forcing boundaries onto
  authored seams manufactures compatibility caps rather than avoiding them. The inventory therefore reaches
  subtask granularity, which is why positional ids rather than structural locators carry the reference.
- **The task semantic digest covers the protected surface only** — title, Goal, and the test-first marker. The
  completion protocol rewrites everything else, so digesting it would break every bound member at task completion.
- **Design elements are consumed, not invented.** Enumerable spec elements already carry authored identifiers;
  the identifier family itself is settled outside this member.
- **A member's human label is its position in the series**, distinct from its durable identity.
- **A plan binds at first materialization**, not at any lifecycle transition. Until something external depends on
  a revision it is freely amendable; afterwards the reconcile rules govern and amendment runs forward of the
  landed prefix only. Lifecycle state is the wrong instrument — a plan authored mid-implementation would be born
  bound under a lifecycle rule, which would forbid the retrofit entry below.
- **Two authoring entries, one record.** A plan is populated either from a task plan before implementation or
  from an existing branch's change structure after it. Both fill the same authored slots and publish the same
  record; they differ only in how the machine-derived facts are obtained.

**Next.** Design the authoring verb — the largest remaining surface, and the one every decision above constrains.
Remaining gaps and their kinds are recorded in § Open items.

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

The design inventory binds each spec artifact's exact revision plus every enumerable element used for coverage. A
work unit carries one design artifact or a paired pair, so the binding admits both: each bound artifact
contributes its own revision digest, and elements carry form-qualified identifiers so a paired unit's requirement
and design namespaces stay distinct. Coverage is stated over _declared_ elements, so a spec form that enumerates
nothing binds an empty inventory and the coverage refinement goes vacuous — enumeration is a precondition for
design coverage, never for chunking.

The task inventory binds every executable implementation leaf by its authored task id and semantic digest, plus
the one WU verification leaf. Task ids are the task list's own positional identifiers rather than a second minted
identity, and they reach subtask granularity because a member boundary may fall inside a parent task. A task
semantic digest covers the surface the completion protocol protects — title, Goal, and the test-first marker when
present — and excludes everything that protocol rewrites: the checkbox, body bullets and peer descriptors, the
rolled-up outcome, and the generated delivery-plan projection. `inventoryDigest` covers that normalized inventory,
so rendering the plan into the task list creates no digest cycle and later progress updates do not amend delivery
intent.

`members` is the only topology-order carrier. Each author-supplied `chunkKey` derives a stable `chunkId`; granting
that chunk a merge boundary derives its `deliverableId` from the chunk identity rather than accepting a second
author key. A member's human label is its position in the series, qualified by the plan revision that produced it,
following the established patch-series form; the label states position and series length and is presentation only.
`deliverableId` alone is durable, so relabelling a member never moves its identity, and because amendment runs
forward of the landed prefix, a landed member's label never shifts under a later revision.

The member's `contract`, task and design coverage, semantic landability assertion when present, and incident /
owned seam semantics derive `semanticFingerprint`, including the referenced task / design semantic
digests rather than identifiers alone. The title still changes the whole-plan digest but does not force replacement
when the member's actual contract is unchanged. No arbitrary `dependsOn` edges exist: predecessor is the previous
array member, and any requested landing is a contiguous prefix.

The member array contains only chunks promoted to independent merge boundaries. Every implementation leaf occurs in
exactly one member; the WU verification leaf occurs in none. Task-inventory order is a **warning** rather than a
refinement: a cut whose members interleave the task order is usually an authoring mistake, but task order records
intent rather than strict precedence, so an interleaving cut is not necessarily wrong and delivery does not gate on
it. Member order is carried by the array alone, which keeps the record independent of the task list's numbering
conventions. Membership itself is authored on the task-plan entry and derived on the retrofit entry, where the cut
follows the change structure rather than the task plan; an authored partition would be fabricated there.

Every declared design element is covered by at least one member or named seam, with unknown references rejected. A
finer review-only hierarchy inside one member may be selected later against its exact target, but it remains
review-owned and is absent from this record.

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

**Authoring shape.** Authoring is two-phase and never accepts a hand-composed record. The command first emits a
starter map whose machine section carries every derived fact and identity, and whose authoring section is a
skeleton of explicit author slots — one per irreducible judgment. The author fills only those slots; composition
then validates that no derived value was altered and that the machine and authored identity sequences still match,
refusing with a typed code on an unfilled slot, a mutated identity, or a reordered sequence. Which judgments are
irreducible is therefore computed and presented rather than described in prose. Amendment reuses the same path:
a starter map seeded from the current revision produces a complete successor record, published against the
expected predecessor digest. Revisions are whole records rather than deltas, so each validates independently and
no delta vocabulary becomes a second topology language.

**Two authoring entries.** A plan is populated either **from a task plan**, before implementation, or **from an
existing branch's change structure**, after it. Both fill the same authored slots and publish the same record;
they differ only in how the machine section is derived — task inventory and design inventory in the first case,
observed change structure in the second — and in whether member task membership is authored or derived. The
retrofit entry is first-class rather than a degraded mode: it is the entry every delivery cut with field evidence
actually used, and a design that serves only the pre-implementation entry would fail on its first real contact.

A retrofit cut carries one obligation the pre-implementation entry does not. Boundaries drawn through code that
already exists are not landable by construction, so their coherence must be established rather than assumed, and
where the authored boundaries do not supply it the cut must buy it. That judgment stays where every other
landability judgment sits: the plan records the assertion, and the selected projection's reducer validates it
against current checks and host facts. The record carries no eligibility test of its own, which keeps this member
independent of the projections that consume it. The two projections price the obligation very differently — an
integration-target retrofit reaches the protected base once and needs neither coherence proof nor compatibility
caps, while a stack retrofit needs both — so retrofit becomes available under the integration-target projection as
soon as its reducer lands, and under the stack projection when the eligibility test does.

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

**Bind point and forward-only amendment.** A plan is freely amendable until its first member materializes.
Binding follows external dependency rather than lifecycle position: until a revision has been materialized against,
authoring iterations cost nothing and reach no reconcile, whichever lifecycle state the work unit occupies. Keying
the boundary to a lifecycle transition instead would make a plan authored during implementation born bound, which
forecloses the retrofit entry below — and every delivery cut this design has field evidence for was authored that
way. Afterwards a plan amends only forward of the landed prefix, which is a physical constraint
rather than a policy: a landed member's change request is merged and cannot absorb further work. Discovered work
therefore resolves by where its member sits. An unmaterialized member absorbs it freely as a suffix amendment; a
materialized one absorbs it as a content change that advances the member's generation and derives a new review
target, leaving plan membership untouched; a landed one cannot absorb it at all, so the work moves to a later
member or mints a new one. Splitting an oversized member is the same case — free while that member is unbound,
and a replacement once it is not.

**Reactive insertion.** A plan may also gain a member it never anticipated, when a landed member blocks work
outside its own work unit and the remedy must ship before the series continues. Mechanically this is an ordinary
forward amendment — landed positions are unchanged, the unbound suffix relabels under a new revision — but it is
the one amendment whose cause originates outside the plan's intent, so the record admits it as a first-class mode
rather than treating it as authoring drift. It also compounds: the bystander exposure that produces it scales with
how long the series sits partially landed, and inserting a member extends exactly that dwell time.

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

---

## Open items

- **The adoption remedy is named rather than designed** — _needs-design_, and the highest-priority gap.
  `replacement-required` routes through "a teardown / adoption remedy", but on a partially-landed series teardown
  is unavailable and adoption must prove that the replacement's member N is the predecessor's member N — which is
  the fingerprint comparison that just failed. It is the one failure path with no floor beneath it, and it is
  reached at the worst possible moment: mid-series, against merged members. The rest of the reconcile contract
  assumes it exists.
- **The authoring verb's remaining surface** — _needs-design_. The input shape, the slot-filling contract, and
  amendment are settled in § Authoring shape. What is not: the retrofit entry's machine derivation — how an
  existing branch's change structure yields candidate boundaries and their observed facts — the command surface
  itself, where task generation fires the pre-implementation entry, and how the phase-to-member alignment default
  is expressed as a fillable slot rather than a post-hoc check.
- **Plan and state storage locus** — _needs-design_, partly consumed rather than owned. Both stores are specified
  as contracts with no home. The binding constraint is that state must be reachable from a member checkout that
  deliberately carries none of the work unit's artifacts, which rules out the delivery's own change set. The
  review subsystem's existing local operation-state store is the pattern this composes and the first thing to read
  the decision against.
- **Terminal-proof authority boundary** — _needs-design_. The terminal proof, the landing intent's assurance
  clause, and the completion record each specify review-owned qualification and coverage, which is the co-owner's
  half of the named seam. A consume-versus-author pass should leave this member stating what delivery asks for
  rather than what the review reducer decides.
- **Reverse lookup** — _needs-design_. The record maps a plan to its members and their refs; a session occupying a
  member ref needs the inverse, and needs it before it knows which plan to read. Phrased as a query contract it
  survives the storage-tier change; no query is specified today.
- **`mainlineLandability.invariant`** — _needs-detail_. The field appears in both admissible forms and is never
  described.
Two concerns this member depends on but does not own are recorded outside it, so they are not re-derived here: the
task-id completion lock, and the enumerable-element identifier family the design inventory consumes.

---

## Success signal

Both hand-run delivery cuts reconstruct as authored plans against their real branches, and the record validates
them: the thirteen-slice stack cut and the seven-slice cut each round-trip through the retrofit entry, producing a
plan whose members carry the boundaries actually shipped, whose seams match the ones those runs recorded, and whose
refinements pass without a fabricated task partition.

This is the falsifiable check the design is most at risk of failing, which is why it is the one stated. Both cuts
were authored after implementation, so a record that only serves the pre-implementation entry fails it outright;
both cut along change structure rather than task structure, so a hard task-partition refinement fails it; and both
carry recorded seams, so a seam model that cannot express what they found fails it. Reconstruction is available
now and needs neither projection reducer, which keeps the signal inside this member's own boundary.
