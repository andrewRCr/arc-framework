# Draft: delivery-plan-record — the canonical delivery record and its shared reducer

- **Cohort:** `chunked-delivery` — see `cohort-chunked-delivery.md` for the shared canonical model,
  the problem framing, the field evidence the design rests on, and the cut that produced this member.
- **Purpose:** Own the canonical `DeliveryPlan` record and its schema-kernel identities, the authoring
  contract and its two entries with the human task-list projection, the version-checked `DeliveryState`
  with its store and mutation lease, the projection-neutral transition reducer, and the membership and
  tree-exactness half of the terminal contribution proof.
- **Position:** the cohort's substrate member. It carries no external dependency and is buildable
  immediately; every other member consumes what it defines.

---

## Continuity

**Readiness:** `maturing`. The record shape, state contract, transition reducer, assurance chain, authoring input
contract, and success signal are settled. What remains open concentrates in the authoring command's own surface
and three boundaries this member consumes rather than owns.

**Resolved.** Each decision's reasoning lives in the section named; this list is the index, not a second copy.

- **Task references are positional task ids**, reaching subtask granularity, held sound by a completion lock owned
  elsewhere plus this record's own reconcile — § The plan record.
- **A member boundary may span a parent task**; phase-to-member alignment is the authoring default, never an
  invariant — § The plan record, § Authoring.
- **The task semantic digest covers the completion-protected surface only** — § The plan record.
- **Design elements are consumed, not invented**, and a paired spec binds both artifacts — § The plan record.
- **Member order rides the member array alone**; task-inventory order is a warning, and the human label is
  position-in-series, distinct from durable identity — § The plan record.
- **Authoring is a derived starter map plus author slots**, with amendment publishing whole records — § Authoring.
- **Two authoring entries populate one record** — from a task plan, or from an existing branch's change structure.
  The retrofit entry is first-class — § Authoring.
- **A plan binds on its first externally visible dependency**, and deliverable identity survives every revision of
  its plan — § The plan record, § Plan revisions, binding, and amendment.
- **Reconcile sorts into absorb, refuse, or replacement**, matching each outcome to what is physically possible at
  that point in the series. The landed prefix is immutable rather than merely un-amendable — § Plan revisions,
  binding, and amendment.

- **Storage is stated as requirements plus a replaceable v1 materialization**, each store a port with one adapter,
  and `repositoryId` must be shared across clones — § Storage.

- **Delivery binds and carries review-owned verdicts and never defines their admissibility.** The terminal record
  proves this member's half only and is named for the chain it proves, since conjoining the halves is the combined
  gate's act — § Assurance and the terminal contribution proof.

- **Delivery owns no trigger of its own.** Authoring is opt-in and author-invoked; the advisory that it may be
  worth invoking rides the decomposition boundary test's recorded verdict — § Authoring, § Coordination.

**Next.** The reverse lookup is the last open design question — given a repository and a head or ref, resolve the
plan, member, and owning work unit. Everything else outstanding is a detail to settle. Remaining gaps and their
kinds are recorded in § Open items.

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

---

## The plan record

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
  design: {
    artifacts: [{ artifactId, revisionDigest }]
    elements: [{ elementId, semanticDigest }]
  }
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
author key. Both preimages exclude plan revision and member position, so a deliverable keeps one identity across
every revision of its plan for as long as its `chunkKey` is unchanged. That stability is load-bearing rather than
incidental: reconcile identifies a member by `deliverableId` and asks the fingerprint only whether its meaning
moved, so renaming a `chunkKey` is an identity change wearing the costume of an edit.

A member's human label is its position in the series, qualified by the plan revision that produced it, following
the established patch-series form; the label states position and series length and is presentation only.
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

---

## Authoring

**Authoring shape.** Authoring is two-phase and never accepts a hand-composed record. The command first emits a
starter map whose machine section carries every derived fact and identity, and whose authoring section is a
skeleton of explicit author slots — one per irreducible judgment. The author fills only those slots; composition
then validates that no derived value was altered and that the machine and authored identity sequences still match,
refusing with a typed code on an unfilled slot, a mutated identity, or a reordered sequence. Which judgments are
irreducible is therefore computed and presented rather than described in prose. Amendment reuses the same path:
a starter map seeded from the current revision produces a complete successor record, published against the
expected predecessor digest. Revisions are whole records rather than deltas, so each validates independently and
no delta vocabulary becomes a second topology language.

**Boundary defaults.** The authoring verb defaults to phase-to-member alignment, and that default is never an
invariant. The member's landability assertion is the real constraint; segment or phase refinement is a proxy for
it that is neither necessary nor sufficient, since a member can span a seam and land cleanly or sit wholly inside
one boundary and not. Forcing members inside authored boundaries would systematically manufacture the
compatibility caps a cut should be avoiding, so a spanning member is authored without ceremony and needs no
separate justification field — the landability assertion it already carries bears that burden.

The default is expressed as a **mode the author selects**, never a value pre-filled on their behalf: the boundary
slot takes a discriminated value whose alignment arm the composer expands mechanically, alongside an arm carrying
explicit boundaries. Pre-filling the slot with a derived partition would be the tempting shortcut and would defeat
the pattern the slots exist for — an unfilled slot must stay detectable and refusable, and an author who never
looked at a pre-filled boundary would produce a record indistinguishable from one who did. A member's landability
is an assertion about work someone is answerable for; the record must not manufacture it on their behalf.

**Two authoring entries.** A plan is populated either **from a task plan**, before implementation, or **from an
existing branch's change structure**, after it. Both fill the same authored slots and publish the same record,
differing only in how the machine section is derived — the task and design inventories in the first case, observed
change structure in the second — and in whether member task membership is authored or derived. The retrofit entry
is first-class rather than a degraded mode: it is the entry every delivery cut with field evidence actually used,
and a design that serves only the pre-implementation entry would fail on its first real contact.

**What the retrofit machine section supplies.** It supplies the material an author draws boundaries against and
the facts each authored boundary needs — never candidate boundaries themselves. Derivable language-agnostically:
the commit sequence from base to head; each commit's context classification and, where it names one, the task it
closed; per-commit and cumulative change shape; file-level co-change structure; and which commits touch the work
unit's own lifecycle artifacts, which the exclusion invariant needs kept out of any non-final member. The context
footer is what makes the first two real rather than aspirational — attribution is near-total in practice — and it
is also what supplies derived task membership for a cut that did not follow the task plan.

The boundary judgment itself stays authored, and must. One field cut followed a module import graph, which is
language-specific analysis no language-agnostic tool can perform for an arbitrary project, so a derivation that
proposed boundaries would serve one project's stack and mislead the next. The consequence is stated rather than
worked around: composition validates that a boundary is **well-formed** — its commits covered exactly once,
contiguous, carrying no lifecycle artifact it must exclude — and never that it is **well-chosen**. On the
pre-implementation entry that gap is immaterial. On retrofit it means composition cannot catch the failure the
field run actually hit, where candidate heads passed their own quality gates while advertising surfaces their
runtime had not yet wired. Proving a boundary sound is the selected projection's eligibility test, run against
authored boundaries, and belongs with that reducer rather than here.

A retrofit cut carries one obligation the pre-implementation entry does not. Boundaries drawn through code that
already exists are not landable by construction, so their coherence must be established rather than assumed, and
where the authored boundaries do not supply it the cut must buy it. That judgment stays where every other
landability judgment sits: the plan records the assertion, and the selected projection's reducer validates it
against current checks and host facts. The record carries no eligibility test of its own, which keeps this member
independent of the projections that consume it. The two projections price the obligation very differently — an
integration-target retrofit reaches the protected base once and needs neither coherence proof nor compatibility
caps, while a stack retrofit needs both — so retrofit becomes available under the integration-target projection as
soon as its reducer lands, and under the stack projection when the eligibility test does.

**How authoring gets reached.** A delivery plan is opt-in, and delivery owns no trigger of its own. Authoring is
author-invoked, and the signal that it might be worth invoking comes from the decomposition boundary test that
already runs at every design stage. That test asks whether a concern is too big to be one work unit; when it
answers "stays one work unit" it is also, silently, deciding that the concern is coherent — and its own primary
signal is the count of distinct deliverables and independently reviewable surfaces. A concern that stays one unit
_while_ that signal fired is exactly the shape a delivery plan serves, and today that pairing is computed and
discarded.

Delivery consumes that verdict rather than authoring a second test. The boundary test's recorded outcome carries
the reason it stayed one unit, and the separable-surfaces reason is the advisory: worth surfacing once, never a
gate, and freely declined — an author who prefers to see how implementation shakes out loses nothing, because the
retrofit entry stays open at the same cost. Delivery therefore adds no threshold of its own at task generation,
which also keeps the judgment where it can be made well: at task generation the evidence is materialized enough to
threshold mechanically, and the surrounding pipeline already owns that tripwire.

**Human task-list projection.** After canonical publication, the authoring command replaces one generated
`Delivery Plan` section in `tasks-*`: exact plan revision / digest, projection, an ordered member table (title,
chunk key, task ids, design ids, predecessor), and a named-seam table (incident members, owner, acceptance).
Single-deliverable plans render the same shape with one row. The section is informative and replaceable; workflows
and reducers never parse it, and per-task delivery tags do not create a second authority.

---

## Delivery state and its store

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

**Session locus.** The delivery state carries the owning work-unit pointer; the session-locus layer carries only that
subject pointer, not a copy of delivery state. Commands may receive the pointer explicitly, so state design does not
depend on branch parsing or a specific worktree implementation. A disposable ref therefore remains usable from a
materialized session without becoming a WU or acquiring a meta file.

---

## Storage

Both records are storage-agnostic by contract. What follows separates the **requirements** — which must hold at
any tier — from the **v1 materialization**, which is expected to be replaced when the storage direction lands and
is deliberately shaped so that replacing it costs one adapter apiece.

**Requirements.**

- Neither record may live in any work unit's change set. The lifecycle-artifact exclusion is the immediate reason,
  but the deeper one is that a member checkout carrying none of the work unit's artifacts must still resolve both.
- Both must be reachable from any checkout of the repository, including a linked worktree that holds a member ref
  and nothing else.
- The plan must survive a clone and reach a second machine. It is authored intent: no observation of Git or the
  host reproduces which boundaries a human chose, so losing it loses something unrecoverable.
- The state need only be locally durable. Its bindings and observations are freshness-bound inputs that every
  control-bearing verdict re-observes anyway, so a lost state rebuilds by re-observation; what genuinely needs to
  survive a crash is the `activeOperation` reservation.
- The plan store publishes append-only by expected predecessor digest; the state store publishes by expected
  revision under a state-scoped mutation lease.

**v1 materialization.** The plan lives in a pushable ref namespace under the repository's existing `refs/arc/**`
tenancy, which is shared, absent from every tree, and reachable from any checkout. The state lives under the Git
common directory alongside the review subsystem's own operation state, which every linked worktree resolves
identically and which checkout-path relocation cannot move, with advisory locking and atomic replacement supplying
the lease and the version-checked write.

**Keeping the replacement cheap.** Each store is declared as a port and implemented as one adapter, composing the
arrangement the review subsystem already uses rather than inventing a storage layer. The port is the contract and
survives a tier change untouched; the adapter is the tier-specific part and is expected to be discarded rather
than migrated. Nothing here should acquire a migration reader or a compatibility alias: the pre-release posture
regenerates development state instead, and for delivery state regeneration is nearly free because re-observation
already reconstructs it. The plan is the only record whose replacement needs a genuine carry-over, and it is one
small canonical record per work unit.

**Repository identity.** `repositoryId` must be **shared across clones**, not a repository-local value. It does
two jobs that both break otherwise: it enters the `planId` preimage, so a per-clone value would give one plan a
different identity on every machine and a pushed plan would fail validation where it was fetched; and the
transition reducer proves the expected repository before admitting a transition, which a per-clone value cannot
answer for a plan authored elsewhere. This is consistent with the record's existing refusal to derive identity
from a branch, a slug-shaped ref, or a provider handle — a per-clone identity fails that posture for the same
reason, less obviously. Note that a repository-local identity already exists for other purposes; delivery must not
reuse it, and the two scopes should be named distinctly enough that no caller wires the wrong one.

---

## Plan revisions, binding, and amendment

**Plan-revision reconcile.** Before any external binding, state rebinds to a new plan revision freely. Afterwards
reconcile sorts a proposed revision into one of three outcomes, chosen so that the outcome matches what is
physically possible at that point in the series rather than treating every difference as equally severe.

**Absorb** — the proposed revision changes what a bound but unlanded member _contains_ without changing what it
_promises_. A member's `contract` is its promise; its task and design coverage are its contents. Discovering that
a phase needs a subtask, and adding it inside a member that is already pushed, is the routine move this design
must not punish: it advances the member's materialization generation and derives a new review target, exactly as
a review-driven code fix does, and needs no new plan lineage. Coverage **additions** are absorbable for this
reason. Coverage that **moves between members** or **leaves the plan** is not, because that changes the partition
rather than the contents of one member — the same asymmetry that governs forward-only amendment.

**Refuse** — the proposed revision contradicts something already true, and no remedy can make it true again.
Removal or reordering of a **landed** member is refused rather than remedied: its change request is merged, so a
plan that no longer claims it leaves a landing observation for a member the plan does not contain, and the
terminal contribution proof is falsified by construction. The landed prefix is therefore immutable in the record,
not merely un-amendable, and a replacement carries it forward exactly. A **topology change after the first
landing** is refused on the same ground, since landed members already reached the destination the old projection
chose. Renaming a bound member's `chunkKey` is refused as well: it is an identity change, and the guidance is to
author a new member rather than rename a bound one.

Carrying the landed prefix forward exactly is satisfiable because a landed member's fingerprint cannot drift. Its
tasks are complete, and the digest covers only the surface the completion protocol preserves verbatim, with the
task-id completion lock holding their identifiers. The digest-surface choice made for one reason turns out to be
what makes landed-prefix immutability achievable.

**Replacement** — the remaining case: unlanded work is re-cut while some member is bound. The remedy here is
executable precisely where it applies, because a bound but unlanded member _can_ be torn down — its change request
closes and its ref is removed — while a landed one cannot. So replacement is teardown of the bound-unlanded suffix
followed by re-authoring from `firstUnlanded`. No adoption argument is needed: landed members carry forward
unchanged by the refusal above, and bound-unlanded members are torn down rather than adopted. The replacement
lineage explicitly references its predecessor, and the old state is never overwritten into the new meaning.

**Bind point.** A plan is freely amendable until a revision acquires its first externally visible dependency — a
pushed member ref or an opened change request. Binding follows external dependency rather than lifecycle position
or local state: until then, authoring iterations cost nothing and reach no reconcile, whichever lifecycle state the
work unit occupies. Two boundaries are deliberately excluded. Keying binding to a lifecycle transition would make a
plan authored during implementation born bound, which forecloses the retrofit entry — and every delivery cut this
design has field evidence for was authored that way. Keying it to local ref construction would bind a plan merely
for building candidate heads to test, which is exactly the proving step a retrofit author should be free to run and
discard.

**Forward-only amendment.** After binding, a plan amends only forward of the landed prefix, which is a physical
constraint rather than a policy: a landed member's change request is merged and cannot absorb further work.
Discovered work therefore resolves by where its member sits. An unmaterialized member absorbs it freely as a suffix
amendment; a materialized one absorbs it as a content change that advances the member's generation and derives a
new review target, leaving plan membership untouched; a landed one cannot absorb it at all, so the work moves to a
later member or mints a new one. Splitting an oversized member is the same case — free while that member is
unbound, and a replacement once it is not.

**Reactive insertion.** A plan may also gain a member it never anticipated, when a landed member blocks work
outside its own work unit and the remedy must ship before the series continues. Mechanically this is an ordinary
forward amendment — landed positions are unchanged, the unbound suffix relabels under a new revision — but it is
the one amendment whose cause originates outside the plan's intent, so the record admits it as a first-class mode
rather than treating it as authoring drift. It also compounds: the bystander exposure that produces it scales with
how long the series sits partially landed, and inserting a member extends exactly that dwell time.

---

## Lifecycle and the transition reducer

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
4. every selected member's current generation has green required checks, and the review system returns a
   clearing verdict for that member and for every assigned seam at that exact generation; and every
   stack-selected member carries the plan's semantic landability judgment; and
5. an immutable `LandingIntent` binds the exact member set, generations, checks, review assurance, contribution
   manifest, destination, and landing mode before the applicable interlock.

A changed base, head, or membership never passes through as “close enough.” Reconcile first: preserve stable
deliverable identity, advance the affected materialization generations, derive new review targets, and withhold
another readiness verdict until checks and review applicability / retrigger settle. After mutation, re-observe the
host and accept only the requested exact result or a landing mode's explicitly contracted partial result.

---

## Assurance and the terminal contribution proof

**Authority boundary.** This proof is co-owned. Membership and tree-exactness are this member's; obligation,
coverage qualification, and the combined gate that conjoins the two halves belong to the cohort sibling that owns
review cardinality. One rule keeps the seam clean in both directions: **delivery may bind and carry review-owned
identities and verdicts, and must never define what makes them admissible.** Delivery asks whether an assurance
subject is qualified at an exact generation and records the answer's identity; review decides what qualification
means, what an exemption is, and how coverage binds. Wherever the passages below would otherwise restate a review
admissibility rule, they name the question asked and the verdict recorded instead.

**Exact assurance record chain.** Precondition evidence, human authorization, and the observed host result are
different facts and must not collapse into one "terminal assurance" record.

1. **`LandingIntent` — exact pre-mutation contract.** A canonical immutable payload embedded or content-addressed
   by `activeOperation` — not a second operation ledger — binds:
    - repository, state id / revision, plan id / revision / digest, projection, operation id, and delivery-host
      adapter / capability;
    - exact destination ref plus its observed pre-landing head / tree;
    - the requested contiguous member prefix, each stable deliverable id and materialization generation, and the
      exact source base / head / tree or contribution-manifest entry used for it;
    - current required-check observations, plus the review-owned verdict returned for every selected member and
      assigned seam subject at its exact generation, carried by identity;
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

3. **`DeliveryContributionChain` — terminal fact, one half of a co-owned proof, never merge authority.** Only the
   terminal reducer emits this immutable record, and it proves **this member's half only**: that the ordered
   landing observations compose the planned membership exactly and that the resulting trees carry no delta the
   plan does not account for. It binds the repository, state and exact plan revision; projection; ordered
   landing-observation ids; the exact final `main` head / tree; every member and terminal-only delta contribution
   or empty-delta proof; the review-owned verdict identity recorded for each member, seam, and non-empty terminal
   delta; the WU verification anchor; and a canonical contribution-chain digest. It has only a proven form;
   incomplete and stale cases remain typed reducer verdicts rather than persistent failure records.

   The record asserts no claim about the work unit being complete, because completeness conjoins this half with
   the qualification half, and conjoining is the combined gate's act rather than this reducer's. It is named for
   the chain it proves so that the boundary stays visible at every callsite: a terminal record named for
   completion would read as authorizing one, and that misreading costs nothing until both members exist and
   everything after.

**Projection-independent contribution proof.** Over that record chain, the terminal reducer verifies the
membership and tree-exactness half:

- landing member sets are disjoint, ordered, contiguous, and cover `D1 … Dn` exactly once;
- every observed tree transition equals the contribution of the named generations, with no extra WU-owned delta;
- the terminal-delta subject carries an exact empty-delta proof, or is recorded as a non-empty change set for the
  qualification half to answer for;
- each observation matches its immutable intent and an exact result that reached the applicable interlock; and
- the final operation result and final `main` tree equal the terminal chain's expected result.

For every member, seam, and non-empty terminal delta it names, the reducer asks the review system for a verdict at
that exact subject and generation and records the verdict's identity. It does not evaluate the verdict's
conditions: whether a routed exemption applies, what an admissible qualification requires, how a coverage binding
proves a subject, and how work-unit verification cardinality is satisfied are all the qualification half's, and
restating them here would fork the rule. The combined gate conjoins the two halves.

The integration-target projection has one such `main` landing after separately proving its internal series. The stack
projection may have several. Unrelated `main` advances between stack operations are legitimate new bases: they force
suffix reconciliation but are absent from the WU contribution chain. Terminal correctness therefore does not compare
the ambient `main` trees at WU start and finish. The contribution chain may support reporting and downstream
lifecycle queries, but it cannot authorize a merge retroactively or stand in for a required host-side check.

---

## Coordination

**One requirement on the decomposition surfaces, executed elsewhere.** Two shipped surfaces — the cohort-fit
boundary method and the work-organization strategy's sizing standard — currently define a stack as a cohort's
dependency-ordered delivery mode and state that it is _not one work unit spread across many branches_. That
contradicts this cohort's amended invariant, under which one work unit holds one delivery plan emitting one or
more change requests and never derives its identity from a single branch. The contradiction is delivery's to
name, because it is delivery's invariant.

The **edit** is not delivery's to make. The decomposition-doctrine work unit is already rewriting both surfaces —
rebalancing the discriminator with an integration-reviewability bound, making the boundary verdict a recorded
artifact, adding a materialized-evidence tripwire at task generation, and codifying a stack-versus-coupling test
that lands beside the very bullet this requirement touches. Two editors on one bullet would collide semantically
as well as textually, since one of them changes what the word means. So the requirement routes there and is
executed inside that rebalance, leaving one editor on the surface. This reassigns the coherency pass the cohort
originally placed with this member; the reassignment is recorded rather than assumed.

Two constraints ride along. The sizing standard is adopter-facing and ships, so the correction must remove the
contradiction **without** forward-pointing to an unshipped mechanism — the vocabulary can stop being wrong before
the thing it was wrong about exists. And the recorded boundary verdict must carry its reason in a form a consumer
can read, since the advisory above depends on distinguishing "stayed one unit, unremarkable" from "stayed one
unit, with separable surfaces." That is a soft prerequisite for the advisory only; every other part of this
member stands without it.

---

## Open items

- **Distinguishing a coverage addition from a coverage move** — _needs-detail_. Absorb admits additions to a bound
  member and refuses moves between members, but a task added to one member is indistinguishable from a task moved
  into it unless both members' coverage is compared across revisions. The comparison is mechanical and the rule is
  settled; the exact derivation is not.
- **The authoring command's own shape** — _needs-detail_. Everything the command must do is settled in
  § Authoring; what remains is its surface. Whether the two entries are separate verbs or one verb with an entry
  selector, and where the starter map rests while it is being filled — which interacts with storage, since a
  transient authoring file must not land in the work unit's change set either.
- **Where the shared repository identity comes from** — _needs-detail_. § Storage settles that it must be shared
  across clones and must not reuse the existing repository-local one; its provenance is open. Minting it into the
  plan's own ref namespace on first publication keeps delivery self-contained and adds no configuration surface,
  while a project-configuration field is more discoverable and is where a reader would look first. Deriving it
  from a remote URL is the one option to avoid — forks, mirrors, and moved remotes all break it.
- **The shape of the verdict delivery asks for** — _needs-detail_. § Assurance settles that delivery asks and
  records rather than evaluates, but the question's exact form — what delivery passes to identify a subject and a
  generation, and what shape of answer it stores — is a seam to agree with the cohort sibling that owns
  qualification rather than to fix unilaterally here.
- **Reverse lookup** — _needs-design_. The record maps a plan to its members and their refs; a session occupying a
  member ref needs the inverse, and needs it before it knows which plan to read. Phrased as a query contract it
  survives the storage-tier change; no query is specified today.
- **`mainlineLandability.invariant`** — _needs-detail_. The field appears in both admissible forms and is never
  described.

Two concerns this member depends on but does not own are recorded outside it, so they are not re-derived here: the
task-id completion lock, and the enumerable-element identifier family the design inventory consumes.
