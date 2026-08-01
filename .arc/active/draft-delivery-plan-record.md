# Draft: delivery-plan-record — the canonical delivery record and its shared reducer

- **Cohort:** `chunked-delivery` — see `cohort-chunked-delivery.md` for the shared canonical model,
  the problem framing, the field evidence the design rests on, and the cut that produced this member.
- **Purpose:** Own the canonical `DeliveryPlan` record and its schema-kernel identities, the authoring
  contract and its two entries with the human task-list projection, the version-checked `DeliveryState`
  with its store and mutation lease, the projection-neutral transition reducer, and the membership and
  tree-exactness half of the terminal contribution proof.
- **Position:** the cohort's substrate member — every other member consumes what it defines. It carries no
  external dependency and is buildable immediately, which holds because project scope stays out of the identity
  preimage: delivery consumes a project identity when one exists but never waits for one (§ Storage).

---

## Continuity

**Readiness:** `formalization-ready`. The bar was read at loop exit and all three criteria clear: no settle-able
design decision is open, the success signal is concrete and runnable, and there is no inbound buffer. Nine open
items remain, every one a particular that create-spec can resolve inline, plus one seam the cohort assigned
elsewhere and one recorded accepted risk.

Three fresh adversarial passes have run against the
readiness, proportionality, and design-audit rubrics — one beyond the `Heavy` cap, authorized deliberately — and
every finding from each was verified against source and folded.

The third pass is the one worth remembering, because two of its three blockers were **created by the second
pass's own fixes**: dropping the mutable title from the task digest left the digest empty at subtask granularity,
where Goal is opt-in, and generalizing the assurance chain into the post-adapter publish put a pre-mutation
contract on the wrong side of the mutation it contracts. Their common cause is the pattern the third pass made
visible — the design kept resting on substrate guarantees it had asserted rather than established: that completion
preserves something durable, that the shared-ref tenancy's version check refuses, that commits attribute per task,
that a task-id completion lock exists elsewhere. None of those four held as stated. Each is now either verified,
replaced, or recorded as an accepted risk, and that pattern is the thing to check first against any new claim
about how a substrate behaves.

The project-identity fork that pass three left open is now settled, and settled by dissolving it rather than
picking a side. Neither identity in the `planId` preimage had a supplier — `workUnitId` was being treated as
available and `projectId` as missing, and that asymmetry was not real. What broke the deadlock is that project
scope is a property of a record's **address** in both storage tiers, so carrying it in the identity duplicated
the container in the contents. Scope left the preimage, `projectId` stayed a validated field, and this member is
buildable now without waiting on anything. `workUnitId` is stated as the work unit's canonical identity as its own
authority resolves it — which exists today — distinguished from the incidental carriers the design refuses to read
identity off.

Two questions the passes left open were settled afterwards, and both settled by dissolving rather than by
choosing. Each dissolved once someone asked what actually consumed the thing being argued about — project scope
turned out to belong to a record's address rather than its identity, and the durability of a landing intent turned
out to be defended for a tamper-evidence property with no consumer, against no adversary this design has. That is
the same failure the three passes kept punishing in another guise: a claim carried because it sounded load-bearing
rather than because something reads it.

No further pass is planned. The third pass's folds carry the usual final-fold residual, covered by a post-settle
coherence re-read rather than a fourth pass; going further needs a deliberate re-entry, not another lap.

**Resolved.** Each decision's reasoning lives in the section named; this list is the index, not a second copy.

- **Task references are positional task ids at parent granularity**, which is where Goal — the only
  completion-protected surface — is required rather than opt-in. Their stability across renumbering is an
  assumption, not a guarantee; this record's own reconcile is its sole mitigation — § The plan record.
- **A member boundary may span a phase and never splits a parent task**; phase-to-member alignment is the
  authoring default, never an invariant — § The plan record, § Authoring.
- **Coverage is a record refinement, partition is a composition check.** Every inventoried task is covered at
  least once; what partitions exactly once is whichever basis the entry authored — tasks pre-implementation,
  commits on retrofit — § The plan record.
- **The task semantic digest covers the completion-protected surface only** — Goal alone, since the protocol
  rewrites the title at completion as readily as it prunes the test-first marker — § The plan record.
- **Design elements are consumed, not invented**, and a paired spec binds both artifacts — § The plan record.
- **Member order rides the member array alone**; task-inventory order is a warning, and the human label is
  position-in-series, distinct from durable identity — § The plan record.
- **Authoring is a derived starter map plus author slots**, with amendment publishing whole records — § Authoring.
- **Two authoring entries populate one record** — from a task plan, or from an existing branch's change structure.
  The retrofit entry is first-class — § Authoring.
- **A plan binds on its first externally visible dependency**, and deliverable identity survives every revision of
  its plan — § The plan record, § Plan revisions, binding, and amendment.
- **Reconcile sorts into absorb, refuse, or replacement**, matching each outcome to what is physically possible at
  that point in the series — § Plan revisions, binding, and amendment.
- **The landed prefix is history, the unlanded suffix is intent.** Landed members freeze whole and carry forward
  byte-identically rather than re-deriving; frozen values are labelled as-of-landing, design drift on shipped work
  surfaces as an advisory, and a seam crossing the boundary carries a discharge obligation — § Plan revisions,
  binding, and amendment.
- **Four records, split by decision versus observation — a test applied field by field**, with `activeOperation`
  a stated exception. Plan, assignments, and the assurance chain are shared; only the observations are local,
  because only they re-derive. That split is also what resolves position from a member checkout. Storage is
  stated as requirements plus a replaceable v1 materialization, each store a port with one adapter, publishing
  locally is distinct from having pushed, and one operator at a time is a recorded scope boundary — § Storage.
- **The shared publish must refuse, not merge.** The existing shared-ref tenancy unions concurrent writes because
  its writers own disjoint keys; delivery's contend for one, so it needs a push that surfaces a non-fast-forward
  as a typed conflict. The assignment record also retains a per-subject generation high-water mark that teardown
  does not lower — § Storage.
- **An unattributed task is an advisory, not a refusal.** Commit-to-task attribution is a convention with blessed
  exceptions, and on retrofit the author cannot supply what derivation missed — § Authoring.
- **Project scope belongs to the address, not to the identity.** `planId` derives from `workUnitId` and plan
  semantics alone; `projectId` stays a consumed, validated field named for its own scope so it cannot be confused
  with the per-clone repository identity that already ships. Delivery consumes a conforming value when one exists
  and never waits for one — § Storage.
- **Delivery binds and carries review-owned verdicts and never defines their admissibility.** The terminal record
  proves this member's half only and is named for the chain it proves, since conjoining the halves is the combined
  gate's act. A landing observation carries the intent it fulfilled, so the pair is one shared append and the
  intent stays local while it is live — § Assurance and the terminal contribution proof.
- **Delivery owns no trigger of its own.** Authoring is opt-in and author-invoked; the advisory that it may be
  worth invoking rides the decomposition boundary test's recorded verdict — § Authoring, § Coordination.

**Next.** create-spec. Remaining gaps and their kinds are recorded in § Open items: nine particulars, of which
three are seams for a sibling or consumer to settle, plus one accepted risk recorded there because nothing outside
this draft records it.

---

## Success signal

Both hand-run delivery cuts reconstruct as authored plans against their real branches, and the record validates
them: the thirteen-slice stack cut and the seven-slice cut each round-trip through the retrofit entry, producing a
plan whose members carry the boundaries actually shipped, whose seams match the ones those runs recorded, and whose
refinements pass without a fabricated task partition.

This is the falsifiable check the design is most at risk of failing, which is why it is the one stated. Both cuts
were authored after implementation, so a record that only serves the pre-implementation entry fails it outright;
both cut along change structure rather than task structure, so a hard task-partition refinement fails it; and both
carry recorded seams, so a seam model that cannot express what they found fails it.

Reconstruction exercises authoring and validation only, so it needs neither projection reducer and the signal
stays inside this member's own boundary. That is deliberately narrower than retrofit being _usable_: § Authoring
gates actually executing a retrofit cut on the consuming projection's reducer, and under the stack projection on
its eligibility test too. Nothing outside this member gates the check itself — which is the point of keeping
project scope out of the identity preimage, since the signal is only falsifiable if it can be run.

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
  projectId
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

`projectId` and `workUnitId` both come from their owning authorities; delivery mints neither. `workUnitId` is the
work unit's **canonical identity as its own authority resolves it** — the name a lifecycle query answers to, not
any incidental carrier of it. That distinction is the whole content of the rule: delivery must not read WU
identity off a branch, a slug-shaped ref, a task-list path, or a provider handle, because each of those is a
place the name happens to appear rather than the place it is decided.

`planId` is the domain-separated digest of `workUnitId` and the plan semantics, so one WU has one stable plan
identity across revisions. **Project scope is deliberately outside that preimage**, for the reason § Storage
gives: it is a property of where a record lives rather than of what the record says, in both the current tier and
the one the storage direction is heading for. Putting it in the identity would denormalize the address into the
contents. Revision one has `previousPlanDigest: null`; every later revision is exactly predecessor + 1 under the
same `planId` and names that predecessor's digest. `planDigest` covers the complete canonical record except
itself. An append-only plan store publishes by expected predecessor digest, preventing two successors from both
becoming the current revision.

The design inventory binds each spec artifact's exact revision plus every enumerable element used for coverage. A
work unit carries one design artifact or a paired pair, so the binding admits both: each bound artifact
contributes its own revision digest, and elements carry form-qualified identifiers so a paired unit's requirement
and design namespaces stay distinct. Coverage is stated over _declared_ elements, so a spec form that enumerates
nothing binds an empty inventory and the coverage refinement goes vacuous — enumeration is a precondition for
design coverage, never for chunking.

The task inventory binds every **parent** implementation task by its authored task id and semantic digest, plus
the one WU verification task. Task ids are the task list's own positional identifiers rather than a second minted
identity.

**Granularity stops at the parent task, and the protocol is what stops it.** A task semantic digest covers the
surface the completion protocol preserves verbatim, and that surface is exactly **Goal** — everything else the
protocol rewrites: the checkbox, the title, peer descriptors, every Goal-child including the test-first marker and
its build list, the rolled-up outcome, and the generated delivery-plan projection. Two of those exclusions are
worth naming, because both read like durable intent and neither survives. The protocol prunes the test-first
marker with the rest of the Goal-children; and it directs the author to update a task's title at completion to
reflect the work actually done, so the title is mutable by protocol even though it is the task's most legible
identifier. Digesting either would move a landed member's fingerprint at the moment its last task completed.

Goal is _required_ on every parent task and _opt-in, default no_ on subtasks — the formatting standard's own
diagnostic pushes toward dropping subtask Goals as noise. So a subtask-granular inventory would digest the empty
set for the modal leaf, leaving `inventoryDigest` and every member fingerprint blind to exactly the content they
exist to track. Parent granularity is not the cheaper choice here; it is the one at which the digest has
guaranteed content at all.

Nothing is given up for it. The argument that a member must not be forced inside an authored boundary is about
**spanning** — letting a member be coarser than one segment, so a cut is not made to manufacture compatibility
caps — and it never implied the opposite freedom of splitting a parent. Before implementation, the task plan and
the delivery plan are authored in the same stage, so a boundary you want is a boundary you write as two parent
tasks. On retrofit, a range that touches part of a parent simply reports that parent as represented in more than
one member, which the at-least-once coverage refinement already admits and already renders. Neither hand-run cut
went finer than a phase.

`inventoryDigest` covers that normalized inventory, so rendering the plan into the task list creates no digest
cycle and later progress updates do not amend delivery intent.

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

The member array contains only chunks promoted to independent merge boundaries. Task-inventory order is a
**warning** rather than a refinement: a cut whose members interleave the task order is usually an authoring
mistake, but task order records intent rather than strict precedence, so an interleaving cut is not necessarily
wrong and delivery does not gate on it. Member order is carried by the array alone, which keeps the record
independent of the task list's numbering conventions.

**Coverage is a record refinement; partition is a composition check.** The record requires that every
implementation task is covered by **at least one** member, and that the WU verification task is covered by none.
Coverage is enforced where it is authored and advisory where it is derived: on the pre-implementation entry the
author assigns membership, so an uncovered task is a defect and the refinement refuses; on retrofit membership
comes through commit attribution, which has blessed gaps, so an uncovered task surfaces as the unattributed-task
advisory § Authoring describes rather than blocking a cut the author knows is complete.
It does not require exactly-once, because only one of the two authoring entries has the evidence to make that
claim honestly. A pre-implementation cut is authored over tasks, so tasks partition exactly once and composition
checks that directly. A retrofit cut is authored over an existing branch's change structure, so **commits** are
what partition exactly once and contiguously, and task membership is a projection of that partition through
commit attribution. A projection through a many-to-many map is not itself a partition: one task's commits can
fall either side of a boundary the cut drew for other reasons, which the field cut that followed a module import
graph makes ordinary rather than exceptional. Demanding exactly-once there would force the author to invent an
exclusive assignment the cut never made — the fabricated partition the success signal exists to reject.

So a retrofit member claims that a task is **represented in** it, not that the task belongs exclusively to it.
The weaker claim is derivable without invention and still carries the check worth having: a task no member covers
means either work that was never implemented or a commit whose attribution is missing, and both are worth
surfacing — though they are worth surfacing _differently_, which § Authoring settles. The exactly-once guarantee
is not lost, only relocated to the basis that can bear it — which is also
why it lives at composition rather than in the record. Commit ranges are rewritten by every rebase in a series,
so a plan that recorded them would go stale at the first retarget; the commit partition is authoring-time evidence
that shapes the record, never a field inside an immutable one.

Every declared design element is covered by at least one member or named seam, with unknown references rejected. A
finer review-only hierarchy inside one member may be selected later against its exact target, but it remains
review-owned and is absent from this record.

A seam has at least two distinct incident deliverables, listed in plan order. Its scheduling owner is derived as
the latest incident member and cannot be authored differently. The exact acceptance statement and incident set
derive the seam fingerprint. Member and seam `assuranceSubjectId` values derive from `planId`, subject kind, and
stable subject identity, excluding plan revision and evidence-carrier identity so they survive harmless
materialization and presentation changes.

Because a subject identity outlives the material it describes, **materialization generations are monotonic per
subject and never reset** — not across a re-materialization, and not across a teardown that re-authors the same
`chunkKey`. Without that invariant a replacement could reissue generation one against a subject identity a prior
clearing verdict already answered for, letting an earlier review confer authority on materially different later
content. Delivery asks its review question by subject and generation, so the generation counter is the only thing
distinguishing the two. The counter is enforced by the store rather than trusted from the caller — and because
nothing re-observes it, that store is the shared one (§ Storage), not the local observation tier a second machine
would arrive without.

A member fingerprint incorporates every incident seam fingerprint, so a changed cross-member contract cannot
reconcile as an unchanged bound prefix.

`mainlineLandability` is a plain enum — `independently-landable` or `integration-only` — preserving the semantic
judgment even when the selected projection does not need incremental `main` landing. A stack-to-`main` plan
requires at least two members and the first value on every member. This is the irreducible authored judgment only.
Current checks, linearity, provider support, merge mode, stack depth policy, and exact bases / heads remain reducer
inputs and cannot appear in the plan.

It carries no qualifier recording which definition of landability it was asserted under, though the definition is
expected to move — it already did once, when field runs found candidate heads that were test-green and
semantically incoherent at the same time. A qualifier would be read by nothing. The value itself does gate record
validity, since a stack plan is invalid without it on every member, and the reducer's admissibility list re-reads
it there; what it never gates is the land-time verdict, because the reducer re-evaluates landability against
current checks and host facts at that moment. So the recorded value is documentation of intent rather than a proof
input, and a qualifier stamped beside it would be read at neither point. What a definition meant on a given day is
also recoverable from
the definition's own history and the landing date, which makes a per-member stamp a denormalized copy of a fact
held elsewhere. The decomposition doctrine may reuse the same green-and-consistent vocabulary, but it owns only
whether a concern should become several work units, while this contract owns whether an already chosen member may
land independently.

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
unit's own lifecycle artifacts. The context footer is what makes commit classification and task attribution real
rather than aspirational, and it is also what supplies derived task membership for a cut that did not follow the
task plan.

Be exact about how far that attribution reaches, because it is a convention rather than a guarantee and the two
granularities differ. Measured on this project's own history, a substantial minority of a branch's commits name no
task at all — review-driven fixes above all — so attribution is sparse commit by commit. Per task it is far
denser, but not total: the footer contract blesses `code review`, `maintenance`, and `incidental during …`
alongside a task reference, deferred review lets a range land under one bounding commit, and batching maps several
tasks onto a single commit by design. So a task with no attributed commit is a reachable state, not a
malformed one.

Two consequences. A member whose range is mostly review fixes derives few task ids or none, and is a valid member
rather than a composition failure — coverage is stated over tasks, not over members, so an empty `taskIds` is
admissible as long as every task is still covered somewhere. And an **unattributed task** — one no member's
derived membership reaches — is surfaced as an advisory rather than refused. The record already knows the two
causes are different: work that was never implemented is a real defect, while a commit whose attribution is
missing is a convention lapse the author can see and judge. Refusing both identically would make an ordinary
`(code review)` footer able to block a cut the author knows is complete, and on the retrofit entry there is no
remedy available — membership is derived, and composition validates that no derived value was altered, so the
author cannot supply what derivation missed. The advisory names the task and the member it most likely belongs to
and leaves the call with the person who cut the boundaries.

That last derivable — whether a commit touches the work unit's own lifecycle artifacts — is reported and never
enforced here. The exclusion belongs to the cohort member that owns stack topology, and it arises only under that
projection: an integration-target series reaches the protected base once, so a member ref never publishes the
unit's artifacts and the requirement never fires. Enforcing it unconditionally in a projection-neutral composer
would both leak a projection concern into the substrate and invert the cohort's dependency direction.

The boundary judgment itself stays authored, and must. One field cut followed a module import graph, which is
language-specific analysis no language-agnostic tool can perform for an arbitrary project, so a derivation that
proposed boundaries would serve one project's stack and mislead the next. The consequence is stated rather than
worked around: composition validates that a boundary is **well-formed** — its commits covered exactly once and
contiguous, and every implementation task covered by some member or surfaced as an unattributed-task advisory —
and never that it is **well-chosen**. On the
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

## Delivery state

**Minimal `DeliveryState` contract.** One strict-current, non-evidentiary snapshot contains:

- `stateId`; the owning project / work-unit identity; and the exact `planId`, plan revision, and plan digest;
- `stateRevision`, plus the projection discriminant carried from the bound plan revision;
- one plan-ordered entry per deliverable: stable `deliverableId`, last exact base / head / tree / membership
  observation, the review target derived from that head at the deliverable's current generation with any coverage
  / requirement binding it carries, and any exact landing-observation reference;
- the analogous integration / terminal-target observations required by the selected projection, including any
  terminal-only delta target and its review-owned coverage / qualification references; and
- either no active operation or one `activeOperation` binding its canonical `operationId`, kind
  (`materialize | publish | rewrite | land`), affected deliverable ids or terminal target, starting state revision,
  and exact requested heads / bases. A land operation additionally carries its immutable `landingIntentId`.

Several facts this contract reads are deliberately absent from it, because they are **decisions rather than
observations** and § Storage places every decision in the shared tier: each deliverable's ref and change-request
handles, its materialization generation and selected review routing, the terminal target's refs, and the choice of
delivery-host adapter with its provider binding. The state record reads them; it does not own them.

Mutable provider status is not copied as authority. An observation is a freshness-bound input to reconciliation; every
control-bearing verdict re-observes the relevant Git and host facts. Review findings, dispositions, receipts, and
qualification remain review-owned. Delivery retains only their identities and asks the review reducer for current
qualification.

Only one operation is live at a time: a different operation stops while one is outstanding, and review operations
use the review subsystem's own resumable records rather than nesting inside this slot. Where this record lives,
how it publishes, and how a session reaches it from a member checkout are all in § Storage.

---

## Storage

Delivery keeps four per-plan records: the **plan** (authored intent, immutable per revision), the
**assignments** (every decision delivery makes while materializing the plan), the **assurance chain** (the
immutable landing evidence the terminal proof consumes), and the **observations** (what the host currently
shows). All four are storage-agnostic by contract, and delivery keeps no project-scoped record of its own —
`projectId` is consumed from its owning authority, below.

What follows separates the **requirements** — which must hold at any tier — from the **v1 materialization**, which
is expected to be replaced when the storage direction lands and is deliberately shaped so that replacing it costs
one adapter apiece.

**The tier test is decision-versus-observation, and it applies field by field.** A fact that some later
re-observation of Git or the host reproduces may live locally; a fact delivery _chose_ may not, because nothing
regenerates a choice. The test reads fields rather than records, and this is the correction that matters most: the
observation record is named for its dominant content, and reading the test at record granularity silently
licenses losing the decisions that travel inside it.

The test has one deliberate class of exception, and it is an exception rather than an oversight. Some decisions
are true only of the machine that made them, so sharing them would publish a fact that is false elsewhere:
`activeOperation` — the reservation, and the blocked latch a partially-applied outcome leaves behind — and the
pending-push record that says this clone holds a shared publish it has not yet delivered. Both are decisions by
this test, and both stay local, because what they protect against is a crash rather than a clone. The cost is real
and bounded: an operator resuming on a second clone does not inherit the latch, so the first machine's ambiguous
host state is not visible there. That is a reason to make an interrupted operation loud where it happened, not a
reason to widen the record.

**Requirements.**

- No record may live in any work unit's change set. These records are mutable, version-checked, and read from
  checkouts that hold none of the work unit's artifacts, so none of them can be a tracked tree file — the same
  ground the storage direction states as a principle. (The lifecycle-artifact exclusion also forbids it, but that
  rule is the stack projection's and fires only there, so it cannot carry a projection-neutral requirement.)
- Each must be reachable from any checkout of the repository, including a linked worktree that holds a member ref
  and nothing else.
- The plan must survive a clone and reach a second machine. It is authored intent: no observation of Git or the
  host reproduces which boundaries a human chose, so losing it loses something unrecoverable.
- **Assignments must be shared, and they are not observations.** Which ref carries a deliverable, which change
  request represents it, which generation a subject is on, which adapter and routing were selected — all are
  decisions made at materialization rather than facts about the world. Observing a ref tells you what is in it,
  never that it is member three of a particular plan, and recovering that by reading the ref's name is the
  branch-derived identity this record refuses everywhere else. So assignments are not re-derivable, do not qualify
  for the local tier, and belong beside the plan.
- **The assignment record retains a per-subject generation high-water mark, and teardown does not lower it.**
  Assignments are otherwise a live map — an entry says which ref currently carries a member — so the natural
  reading is that tearing a member down removes its entry. That reading breaks the monotonicity invariant § The
  plan record states: `assuranceSubjectId` excludes plan revision and derives from `chunkKey`, so re-authoring a
  torn-down member lands on the identical subject id, and a cleared entry lets its generation restart at one —
  precisely the reissue the invariant exists to forbid. The assurance chain cannot supply the mark either, since
  it carries one entry per landing and a torn-down member never landed. So the high-water mark is retained
  separately from the live binding it accompanies, and monotonicity is enforced against the mark rather than
  against whatever entry currently exists.
- **A shared publish must refuse a conflicting successor, not merge it.** This is a requirement precisely because
  the obvious materialization does not supply it — see the v1 note below.
- **The assurance chain must be shared and append-only.** It is historical rather than current: the destination
  head and tree as observed before member one landed, the generations and review-verdict identities recorded at
  that moment. Once member five lands, no live query returns any of it, so it fails the re-observation test
  outright — and it is the input set to the terminal contribution proof, which is one of this member's two
  chartered deliverables. Losing it on a clone would leave a shipped series unable to prove itself.
- Observations need only be locally durable — but only the observations. They are freshness-bound inputs that
  every control-bearing verdict re-derives anyway, so a lost observation set rebuilds by re-observation; what
  genuinely needs to survive a crash is the `activeOperation` reservation.
- The plan and assurance stores publish append-only by expected predecessor digest. The assignment store publishes
  by expected revision under a version check alone; only the observation store adds a mutation lease, and that
  lease is local — the operator-scope boundary below says why no shared lease is bought.

**v1 materialization.** The plan, the assignment record, and the assurance chain live in a pushable ref namespace
under the repository's existing `refs/arc/**` tenancy, which is shared, absent from every tree, and reachable from
any checkout. They stay separate records rather than one: the plan and the chain are append-only and immutable per
entry, while assignments advance as materialization proceeds, so folding refs into the plan would make an
immutable record mutable and teach it about a projection detail it deliberately does not know. Observations live
under the Git common directory alongside the review subsystem's own operation state, which every linked worktree
resolves identically and which checkout-path relocation cannot move, with advisory locking and atomic replacement
supplying the lease and the version-checked write. The observation store's contract is `read` plus version-checked
`publish(expectedRevision)` under that lease, composing the review subsystem's existing operation-store pattern
rather than introducing a second concurrency model.

**The shared tier needs a refusing push, which the existing tenancy does not provide.** The `refs/arc/**` tenancy
is built for records whose writers own disjoint keys, and it resolves a concurrent remote by _unioning_ the trees
and retrying: each writer's own key is authoritative from the local side, every other key from the remote, and the
union is conflict-free by construction. Its compare-and-swap is scoped to the local tip — it stops a same-machine
writer racing the same ref, and nothing more. That is exactly right for per-writer keys and exactly wrong here,
because delivery's writers contend for the _same_ key: the plan for one `planId`. Under the union, a second
successor does not fail — it overwrites, silently, whichever way the retry lands.

That defeats the plan store's core claim, that publishing by expected predecessor digest prevents two successors
from both becoming the current revision, and it is worse on the assurance chain, where the clobbered key is
landing evidence the terminal proof cannot reconstruct from anywhere. The single-operator scope boundary does not
cover it: one operator moving between clones is the case the shared tier exists for, and the not-yet-pushed state
below makes a local fork ordinary rather than exotic.

So delivery's shared stores do not compose the union-merging push. They need a push that treats a non-fast-forward
as a **typed conflict surfaced for remedy** rather than as something to reconcile away. The record's integrity
claims are the reason the requirement exists; borrowing a mechanism whose whole design goal is conflict-free union
would silently retract them.

**Ordering a host mutation across the two tiers.** An operation writes to both tiers, and no atomic write spans
them, so the order is the contract. A host-mutating command reserves `activeOperation` locally, invokes the
adapter, observes the exact outcome, **publishes whatever the operation produced for the shared tier under its own
version check** — the resulting assignment, and for a land operation the assurance-chain entry as well — then
records observations and clears the reservation locally. The shared publish is the durable commit point, chosen
because it is the only part that cannot be rebuilt: a crash after it loses observations that re-observation
reconstructs, while a crash before it leaves the shared record unwritten and the operation replayable.
Retry acquires the same operation identity, reconciles before replay, and either adopts an already-applied exact
result or reissues through an adapter operation idempotent by operation id or structural delivery identity.
Reconciliation clears an operation only when the host proves it applied exactly or did not apply; ambiguous or
partially applied outcomes remain blocked for an explicit remedy.

**Shared is not the same as pushed, and the v1 tier makes that gap real.** Publishing to a ref namespace is a
local commit plus a separate reconcile push, and the existing tenancy already treats those as two steps with a
bounded retry between them — it ships a marker surface whose whole job is reporting an intent that landed locally
and has not reached the origin, read as lag rather than loss. So there is a third outcome the ordering above does
not enumerate: **published locally, not yet pushed** — offline, no remote configured, or a push that exhausted its
retries. In that state the host mutation happened, the shared records it produced exist on exactly one machine,
the reverse lookup below returns nothing anywhere else, and a landing's assurance entry is not yet anywhere the
terminal proof could read it from a second clone — so every requirement phrased as "must survive a clone" is unmet
until the push lands.

Two things follow. The durable commit point is the local publish, not the push: an operation must not block on
network reachability, because the host mutation it records has already happened and re-running it is worse than
recording it late. And the outstanding push is therefore state someone has to carry — reconciled on the next
operation that reaches the namespace, and never resolved by force.

Carried by delivery's own record, though, not by the substrate's existing marker surface. That surface is a
reasonable model and a bad delegate: it is scoped to one identity rather than to the project, it is
presentation-only and never gates, it degrades to silence on a fetch-only clone or with remote sync off, and its
markers expire after a fixed window. An assurance entry that never reached origin would therefore stop being
visible while remaining unrecoverable — the terminal proof unprovable on every other clone, with no live signal
that anything is missing. An outstanding shared publish is delivery's own unfinished business, so the pending-push
record lives with the delivery state that produced it and is surfaced from there. What must not happen is the
version this design started with: a durability argument that reads as settled while resting on a network step the
contract never mentions.

**Resolving position from a member checkout.** The assignment record answers the reverse question the plan cannot:
given a repository and a head or ref, return the plan, the member, and the owning work unit. A session occupying a
member ref needs that answer _before_ it knows which plan to read, and the checkout deliberately carries none of
the work unit's artifacts to tell it. Because assignments are shared, any machine that has fetched the namespace
can answer it — including one that never materialized anything. This is a query contract over an authoritative
binding rather than an inference from a ref's shape, so it reintroduces none of the branch-derived identity the
record refuses, and it survives the storage-tier change as an ordinary record query.

A command may instead receive the owning work-unit pointer explicitly, and the session-locus layer carries only
that subject pointer rather than a copy of delivery state. Neither path depends on branch parsing or a specific
worktree implementation, so a disposable ref stays usable from a materialized session without becoming a work unit
or acquiring a meta file.

**One operator at a time.** A work unit has a single owner, and one person cannot operate two machines at once, so
concurrent delivery operations against one plan are out of scope and the mutation lease stays local rather than
moving to the shared tier for a case that should not arise. The assumption is recorded rather than assumed because
the shared assignment record is what would make a second machine's operation look legitimate.

Be precise about how far the containment reaches, because the ordering above places the only shared coordination
point **after** the adapter has already run. A second operator therefore reaches the host unopposed and can open a
duplicate change request or move a ref that the first operator's `LandingIntent` binds; the version check then
refuses the second machine's record, not the mutation that preceded it. What is contained is divergence anyone
reads or acts on — every control-bearing verdict re-observes the host, and the losing publish blocks for an
explicit remedy. Duplicate host mutation is not contained, and moving the lease to the shared tier is what would
contain it. That cost is declined here on the scope boundary above rather than on a claim the ordering supports.

**Keeping the replacement cheap.** Each store is declared as a port and implemented as one adapter, composing the
arrangement the review subsystem already uses rather than inventing a storage layer. The port is the contract and
survives a tier change untouched; the adapter is the tier-specific part and is expected to be discarded rather
than migrated. Nothing here should acquire a migration reader or a compatibility alias: the pre-release posture
regenerates development state instead, and for the observations regeneration is nearly free because re-observation
already reconstructs them. The three shared records are the ones whose replacement needs a genuine carry-over, and
that stays cheap for the reason the tier split exists — one canonical plan per work unit, one assignment record
tracking a handful of decisions, and an assurance chain with one entry per landing.

**Project scope belongs to the address, not to the identity.** Delivery records are never addressed
project-agnostically. Under the v1 tier they live in one repository's `refs/arc/**`, so a plan you can read is by
construction this project's; under the storage direction the backing store is keyed by project, so the path
carries the same fact. In neither tier do two projects' delivery records share a namespace. Putting project scope
inside `planId` would therefore copy the container into the contents — the same denormalization this record
already refused for the landability qualifier.

So `projectId` stays a **field** and leaves the **preimage**. That is not a downgrade: the record stays
self-describing, the value is validated wherever a conforming one exists, and the day a project identity is
supplied is an upgrade rather than a schema change. What it stops doing is gating construction on a value nobody
supplies.

The residual cost is real and bounded: two projects can mint the same `planId` — one work-unit name, two
repositories. That only bites where their records meet, which needs a backing service federating many projects.
Such a service would know which project it serves, so scope would be ambient in its addressing too; and building
the preimage for a substrate that does not exist is speculative work this project's own posture declines.

**The property list survives, because the guard survives.** A supplied `projectId` is validated when present, and
the transition reducer proves it before admitting a transition — a check that is genuinely load-bearing only
against a plan that arrived by some path other than its own store, but costs nothing to keep. A conforming value
must be:

- **Stable across clones, machines, and users.** A per-clone value would make one project's plan claim a different
  project on every machine, so the guard would refuse legitimate work rather than catch illegitimate work.
- **Not derived from a remote URL.** Forks, mirrors, and moved remotes all change the URL while leaving the
  project the same, so a URL-derived value fails the first property in ordinary use rather than at the margins.
- **Named for its own scope, not the repository's.** A repository-local minted UUID already exists and already
  travels under the name `repositoryId` — it is the review subsystem's per-clone identity, and it is a live field
  on that subsystem's request and change-request records. Both values are opaque identifier strings, so a delivery
  field of the same name would accept the wrong one silently. Delivery therefore names its field for the scope it
  requires rather than for the container it sits in.

**One shared question, not two.** The project's own identity work already needs these properties and records that
it does not yet have them: its resolution chain is stable per clone but not across users, and it flags cross-user
stability as open for its later tier. Delivery contributes its requirement as an input to that resolution rather
than answering it in parallel — and the input is strictly stronger, because ruling out remote-URL derivation rules
out that chain's current first fallback. Delivery neither mints nor configures the value meanwhile; it consumes a
conforming one when there is one, and its own records construct either way.

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
rather than the contents of one member — the same asymmetry that governs forward-only amendment. This pressure is
a pre-implementation-entry phenomenon: discovering that a phase needs a subtask presumes the work is still ahead
of you. On the retrofit entry the change set already exists, so coverage moves only when the commit partition
itself is re-cut, which is a member-set change rather than a coverage tweak.

**Refuse** — the proposed revision contradicts something already true, and no remedy can make it true again.
Removal, reordering, or alteration of a **landed** member is refused rather than remedied: its change request is
merged, so a plan that no longer claims it leaves a landing observation for a member the plan does not contain,
and the terminal contribution proof is falsified by construction. The landed prefix is therefore immutable in the
record, not merely un-amendable, and a replacement carries it forward byte-identically, under the freezing rule
below. A **topology change after the first landing** is refused on the same ground, since landed members already
reached the destination the old projection chose. Renaming a bound member's `chunkKey` is refused as well: it is
an identity change, and the guidance is to author a new member rather than rename a bound one.

**The landed prefix is history; the unlanded suffix is intent.** That distinction is what makes carrying the
prefix forward satisfiable, and it has to be structural rather than argued. A landed member is **frozen whole** at
landing — its contract, coverage, landability assertion, and the referenced task and design digests _as of that
moment_ — and a replacement copies it forward verbatim rather than re-deriving it. Nothing is compared, because
the bytes are identical; a replacement that alters a landed member fails byte-identity immediately, which is the
protection the refusal existed to give in the first place.

Re-deriving instead would refuse on evidence that has nothing to do with what landed. A member's fingerprint
reaches two things the member does not own: the digests of design elements it references, and the fingerprints of
seams it is incident to. Both move for external reasons — amending the spec moves the first, and re-cutting the
unlanded suffix moves the second, since a seam's fingerprint derives from its incident set. Under re-derivation a
landed member's fingerprint would move although its contribution is fixed in the tree, so refuse would fire on the
very re-cut that replacement exists to perform, and amending the spec after the first landing would be forbidden
outright. Neither is a re-description of shipped work, which is the only thing the check protects.

Freezing is also what the shape has converged on elsewhere. A consensus log never rewrites its committed prefix
and truncates only the uncommitted suffix; version control makes a commit immutable and rewrites by producing new
objects; double-entry accounting closes a period against edits and takes corrections as adjusting entries in the
open one. This record's `landedPrefix` and `firstUnlanded` are that committed index, and its replacement remedy is
that truncation.

Two obligations ride along, both borrowed from the same idiom. **Frozen values are labelled, not hidden** — they
are typed as as-of-landing rather than current, so a reader comparing a landed member's design digest against an
amended spec sees a legible historical difference instead of apparent corruption. And **corrections go forward**:
design drift on landed work — shipped work whose design element has since been amended — is real and worth
knowing, so it surfaces as its own advisory rather than as a plan-validity failure. It is the adjusting entry, not
a reason to refuse the revision.

**Seams crossing the landed boundary are an obligation, not an immutability check.** Freezing does not cover them:
when a seam spans a landed member and an unlanded one, re-cutting the suffix genuinely can orphan the seam's
acceptance. The replacement must therefore still carry a seam with the same acceptance statement and the same
landed-side incident; what it may not do is drop the obligation on its way past. Refusing the re-cut outright
would be the wrong instrument, since the landed side is unchanged either way.

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
2. the adapter proves the projection, ordered membership, bases, heads, and trees, with no missing or extra
   member — and the expected project too, whenever the plan carries a `projectId`;
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
means, what an exemption is, and how coverage binds. One property of those identities is delivery's to state,
because it follows from delivery's own storage requirement rather than from anything review needs: **a carried
verdict identity must be stable across clones.** The chain that binds it is shared and must re-validate on a
machine that only fetched it, and today the review side's identities derive from a per-clone value, so an identity
carried into this record would not resolve where the record is read. That is a requirement delivery contributes
outward — the same move it makes for `projectId` — not a rule it writes on review's behalf. Wherever the passages
below would otherwise restate a review
admissibility rule, they name the question asked and the verdict recorded instead.

**Exact assurance record chain.** Precondition evidence, human authorization, and the observed host result are
different facts and must not collapse into one "terminal assurance" record. Two of the three are historical from
birth — `LandingObservation` and `DeliveryContributionChain` record what already happened — so they live in the
shared append-only assurance store rather than beside the observations (§ Storage), and the state record carries
references into them rather than the records themselves.

`LandingIntent` has two lives, and each is served where it happens. While it is live it is a reservation — the
exact contract the command re-checks immediately before acting — held with `activeOperation` on the machine doing
the acting, which is the only place the re-check occurs. It becomes history at the moment the mutation does, and
it reaches the shared store then: **the observation embeds or content-addresses the intent it fulfilled**, so one
append per landing carries both.

Publishing the intent separately, before the adapter runs, was considered and rejected. It would put a second
durable point on a merge's critical path; it would leave a permanent orphan intent for every aborted or
interrupted land, since the store is append-only; and it would widen the exact window the intent exists to close,
by inserting a shared write between the pre-landing head observation and the mutation that depends on it. What it
would buy is evidence that the intent preceded the outcome — and nothing consumes that. The check the pairing
actually performs is a correctness one, catching an operation that did something other than what it set out to do:
a reported result wider than the requested prefix, a merge method other than the contracted one, a check that went
red after assembly, a destination head that moved. Every one of those arises inside a single operation on a single
machine, where a locally-held intent catches it identically. The stronger reading — that the pairing evidences
_authorization_ — is not delivery's to make: human approval is the sole merge authority and is deliberately not
turned into a delivery receipt, and this member's half of the proof rests on tree-exactness that Git verifies
independently of any record.

1. **`LandingIntent` — exact pre-mutation contract.** A canonical immutable payload, held while live by
   `activeOperation` — not a second operation ledger — and carried into the shared store by the observation that
   fulfils it. It binds:
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

2. **`LandingObservation` — immutable post-mutation fact, carrying the intent it fulfilled.** Reconciliation emits
   a canonical observation binding the intent (embedded or content-addressed, so the pair is one shared append),
   host operation identity, exact before / after destination heads and trees, actual landing mode / outcome, exact
   landed member ids / generations, contribution-manifest digest, and the check / review evidence references the
   intent used. The result must equal the intent's exact result or one enumerated leading-subprefix result. An
   ambiguous, extra, reordered, or otherwise uncontracted mutation emits no successful observation and leaves the
   operation blocked for remedy — so an interrupted land contributes nothing to the chain, and the reducer
   re-derives position from host observations rather than from the interrupted operation's paperwork.

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
originally placed with this member; the reassignment is recorded rather than assumed. It is recorded here and in
a routed capture awaiting its drain — the cohort's own coordination record still names this member as the editor,
and stays that way until the capture lands.

**Two cohort divergences route the same way.** The cohort's segment-refinement settlement is built on
the premise that every implementation task occurs in exactly one member in task-inventory order, so that
membership is _induced_ by task order. This member has since settled both halves the other way: coverage is
at-least-once because a retrofit cut cannot honestly claim exclusivity, and member order rides the array alone
with task-inventory order demoted to a warning. The settlement's _conclusion_ survives — segment refinement is the
authoring default and never an invariant — because the cohort also argues it from landability, which is
independent of the premise. But a sibling reading only the cohort record would inherit a premise the substrate
member has retired. Separately, the cohort still describes the state contract as carrying each deliverable's ref
and change-request handles; those moved to the shared assignment record. Both are recorded here and routed rather
than edited in place, on the same reasoning as above.

Two constraints ride along on the decomposition edit. The sizing standard is adopter-facing and ships, so the
correction must remove the contradiction **without** forward-pointing to an unshipped mechanism — the vocabulary
can stop being wrong before
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
- **How a frozen landed member is typed and rendered** — _needs-detail_. § Plan revisions settles that landed
  members freeze whole and carry as-of-landing values, and that those values must be labelled rather than hidden.
  The record shape that distinguishes a frozen member from a live one, and how the task-list projection renders
  the difference so an amended spec reads as history rather than corruption, are particulars.
- **The design-drift advisory's trigger and surface** — _needs-detail_. Settled that drift between a landed
  member's as-of-landing design digests and the current spec surfaces as an advisory rather than a plan-validity
  failure. Where it fires, and whether it belongs to this member or to the lifecycle surfaces that already carry
  reconcile advisories, is open.
- **Rendering non-exclusive coverage in the task-list projection** — _needs-detail_. § The plan record settles that
  a retrofit member claims a task is represented in it rather than owned by it. The projection's member table
  currently reads as an exclusive assignment, so it needs a shape that shows a task appearing against two members
  without reading as a defect — and the same table serves both entries, where the claim genuinely is exclusive.
- **What a supplied `projectId` must be checked against** — _needs-detail_. § Storage settles that project scope
  stays out of the `planId` preimage and that a supplied value is validated when present, so the properties are
  fixed and the gating question is closed. What remains is the check itself: a conforming identity is an opaque
  string, so validating one means comparing it against whatever the local project resolves to, and until the
  identity work ships there is nothing to compare against. Whether the guard is therefore inert-until-available or
  should assert a weaker locally-checkable property in the meantime is a particular.
- **The shape of the verdict delivery asks for** — _needs-detail_. § Assurance settles that delivery asks and
  records rather than evaluates, and that a carried verdict identity must be stable across clones, but the
  question's exact form — what delivery passes to identify a subject and a generation, and what shape of answer it
  stores — is a seam to agree with the cohort sibling that owns qualification rather than to fix unilaterally
  here. The portability requirement goes to that sibling as an input, since the review side's identities currently
  derive from a per-clone value and would not resolve on a machine that only fetched the chain.
- **The assignment record's own shape** — _needs-detail_. § Storage settles that assignments are shared and that
  the reverse lookup is a query over them, but not the record's fields, its version-check granularity, or whether
  one record per plan or one per deliverable is the better write unit. Concurrency is not the discriminator —
  § Storage puts concurrent operation out of scope — so the question turns on retry granularity after a failed
  publish, the cost of the reverse-lookup query against each shape, which ports more cleanly at the next storage
  tier, and how the retained generation high-water mark sits beside a live binding that teardown clears.
- **The projection's landability column** — _needs-detail_. `mainlineLandability` is a plain enum, so the member
  table renders one value rather than a structure. Whether it earns a column at all under the integration-target
  projection, where the judgment is recorded but never consulted, is a rendering call.

One concern this member depends on but does not own is recorded outside it, so it is not re-derived here: the
enumerable-element identifier family the design inventory consumes.

**One assumption is recorded here because nothing else records it.** Positional task ids are sound only if a
completed task's id keeps pointing at the same work. No rule in this project states that — the revision scheme
covers expanding a completed task without disturbing existing numbers, but deletion and reordering have no stated
constraint, and renumbering after completion is observable in shipped task lists. The exposure is narrow and real:
a landed member's `taskIds` are frozen as-of-landing, so a later renumbering repoints them at different work with
nothing comparing the two. This design's own reconcile is the sole mitigation, and it is a detector rather than a
guarantee. Recorded as an accepted risk rather than delegated to a rule that does not exist; whether the rule
should exist belongs with whoever owns task-list conventions, not here.
