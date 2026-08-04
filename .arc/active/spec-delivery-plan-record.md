# Spec (`detailed` · `RFC`): Delivery Plan Record

- **Origin:** [internal]
- **Purpose:** Define the canonical delivery-plan record and its identities, the two authoring entries that
  populate it, the mutable state contract and its store, the projection-neutral transition reducer, and the
  membership and tree-exactness half of the terminal contribution proof — the substrate every other delivery
  member consumes.

---

## Introduction / Context

ARC welds two separable boundaries together. The **concern** boundary is the work unit, correctly broad for one
uniform concern. The **review and merge** boundary is the pull request, currently forced to equal the work unit.
Industry practice separates them: one concern ships as many small, individually reviewable parts, planned up
front. Google's implementation-plan grid makes each cell its own standalone change; the Linux kernel's
patch-series carries a hard bisectability rule that forces expand → migrate → contract ordering to be planned
rather than discovered.

The review half of that gap is closed. `review-chunking` shipped the review-only retrofit — carving an
already-built branch's review surface with no merge-topology change — and its exact-target chunking resolver is
live. What remains is letting a work unit decide chunk boundaries during planning and giving those chunks
somewhere to land that keeps the base coherent.

This work unit owns the substrate for that: one canonical record carrying stable chunk and deliverable identity,
order, membership, and assurance requirements, which two first-class projections consume without re-authoring any
of it. It ships a contract rather than an end-to-end capability — a plan can be authored, validated, and
projected, but not executed until the integration-target member lands. That is deliberate. It is independently
reviewable without being independently useful, which is the correct shape for substrate work, and it keeps both
members at a reviewable size.

The design rests on field evidence rather than projection. Two deliveries have been executed by hand:
`decompose-transform-integrity` shipped a full seven-slice stack plus its terminal merge, and
`session-locus-model` shipped a rolling sequence of 21 delivery and corrective members before bespoke closeout.
The latter began from a thirteen-slice module-graph design, then superseded its standing stack as live delivery
added a planning baseline, a control-isolation bridge, a split slice, and corrective members. Those runs are this
work unit's missing input, and the success signal below is stated against the delivery actually executed.

Three properties of those runs shaped the design decisively. Both deliveries were authored **after** implementation, so
an entry serving only pre-implementation authoring would fail on first contact. Both cut along **change
structure** rather than task structure, so a record demanding an exact task partition would force the author to
invent an assignment the cut never made. And the first run found candidate heads that were simultaneously
test-green and semantically incoherent — each advertising a surface its runtime had not yet wired — which is what
established that semantic-coherence cost is owned by the projection, not by the work.

## Goals

- Carry one canonical, immutable-per-revision plan record whose chunk and deliverable identities are stable across
  every revision of that plan, and whose membership and ordering are the single authority both projections read.
- Serve two authoring entries as peers — from a task plan before implementation, and from an existing branch's
  change structure afterwards — filling identical authored slots and publishing an identical record.
- Keep every irreducible judgment authored and every derivable fact derived, with composition able to prove that no
  derived value was altered and no authored slot left unfilled.
- Track the exact facts from which current position, predecessor consumption, and terminal readiness derive, in a
  mutable record that binds an immutable plan revision by digest and never silently follows changed intent.
- Sort a proposed plan revision into absorb, refuse, or replacement by what is physically possible at that point in
  the series, so that routine discovered work is not punished and shipped work cannot be re-described.
- Prove this member's half of the terminal contribution proof — that the ordered landings compose the planned
  membership exactly, and that the resulting trees carry no delta the plan does not account for.
- Remain storage-agnostic by contract, so the record survives the storage direction's arrival as a port change
  rather than a redesign.

## Non-Goals

- **Executing a delivery.** No projection reducer, ref materialization, host adapter, or integration ceremony is
  built here. Those belong to `delivery-integration-target` and `delivery-stack-topology`. The split follows the
  one this member already applies to landing: the operation record, its ordering, and the state transition it
  produces are owned here, while the adapter that performs the host mutation is not — so `teardown` carries state
  semantics in this member and its ref and change-request mechanics in the projection member.
- **Defining review admissibility.** Delivery binds and carries review-owned identities and verdicts and never
  defines what makes them admissible. Qualification, routed exemptions, coverage binding, verification cardinality,
  and the combined terminal gate belong to `delivery-review-cardinality`.
- **Authoring the chunk boundary doctrine.** `review-chunking` owns chunk cohesion and the review unit's name; this
  record consumes that doctrine and never re-authors it.
- **Deciding whether a concern should become several work units.** `decomposition-doctrine` owns the concern-level
  test. This contract governs only whether an already-chosen chunk may land independently.
- **Cross-machine delivery.** Stated as a v1 boundary in § 6 rather than built. See Cross-cutting Considerations.
- **A second locus record.** Delivery authors no parallel session-position record; it exposes a query contract and
  consumes an explicit pointer where one is supplied.
- **The cover letter / reviewer's guide.** Composing metadata, spec, and cohort content into a navigation aid is a
  human-navigation concern and is storage-sensitive. Out of scope; coordinate later.

## Proposed Design

### 1. The canonical `DeliveryPlan` record and its identities

Register the canonical record and every identity preimage with the schema kernel under strict-current migration
posture. The canonical constructor accepts a `DeliveryPlanAuthoringInput` plus the validated prior revision when
one exists; the input omits every derived identity, fingerprint, owner, and digest.

```text
DeliveryPlanV1 {
  schemaVersion: 1
  semanticsVersion: "delivery-plan/v1"
  projectId?
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
  entry: "from-tasks" | "from-branch"
  projection: { kind: "wu-integration-target" } | { kind: "stack-to-main" }
  members: DeliveryPlanMemberV1[]
  seams: DeliveryPlanSeamV1[]
  planDigest
}

DeliveryPlanMemberV1 {
  status: "live" | "landed"
  chunkKey
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
  title
  acceptance
  incidentDeliverableIds
  ownerDeliverableId
  designElementIds
  assuranceSubjectId
  semanticFingerprint
}
```

The wire vocabulary is closed here rather than left to the constructor. `planId` is a minted UUID; every derived
identity and semantic or revision digest uses the kernel's canonical `sha256:` digest shape; `workUnitId`,
`chunkKey`, and `seamKey` use the existing slug vocabulary; task ids use the task-list scanner's parent-id grammar;
artifact ids are safe basenames — non-empty, neither `.` nor `..`, and containing no slash, backslash, or NUL; and
form-qualified element ids are non-empty opaque strings supplied by the design-inventory authority below. Human
titles, contracts, and acceptance statements are trimmed non-empty strings. `planRevision` is a positive safe
integer. Arrays preserve authored order where the record says order is semantic and otherwise normalize by canonical
bytes; uniqueness and minimum-cardinality refinements remain the record's checks rather than looser schema
coercions. `projectId`, when available, is an optional non-empty opaque string. No current local predicate claims
that such a string is a conforming cross-clone project identity.

The authoring input carries `status`; it is not a derived field. A first revision accepts only `live` members. A
later revision may assert `landed` only by converting the next contiguous member from a validated predecessor, and
the constructor requires equality with that predecessor's member payload modulo `status`. This makes the assertion
explicit without pretending the offline record observed the host; § 8 remains the authority that checks it against
the host-derived landed prefix.

`projectId` and `workUnitId` both come from their owning authorities; delivery mints neither. `workUnitId` is the
work unit's canonical identity **as its own authority resolves it** — the name a lifecycle query answers to, not
any incidental carrier of it. That distinction is the whole content of the rule: delivery must not read work-unit
identity off a branch, a slug-shaped ref, a task-list path, or a provider handle, because each is a place the name
happens to appear rather than the place it is decided.

**`planId` is minted once at first authoring and stored — it is not derived from `workUnitId`.** This is the one
identity in the record that is not a digest of its inputs, and the exception is deliberate. A work unit's identity
is its slug: no identity field exists on the metadata record, and the active unit's name is recovered from its
artifact path. The slug is mutable by a shipped, sanctioned transition — `arc rename` renames a work unit and its
branch, workspace, remote, marker, and worktree identities while the unit is active. Deriving `planId` from a
mutable preimage would re-mint every dependent identity on rename: `deliverableId` and every member and seam
`assuranceSubjectId` all hang off `planId`, so a rename would strand the frozen landed prefix's assurance
subjects — every recorded verdict would answer for a subject id the plan no longer mentions. A
minted identity is stable by construction, which is strictly what the derivation was reaching for.

One work unit still has one plan, enforced as a **uniqueness refinement** rather than by construction: authoring
refuses to mint a second plan for a unit that already has one. (Replacement produces a new revision under the same
`planId`, never a second plan, so no plan-retirement state is implied.) **That lookup never compares slugs by
string equality.** A recorded rename is an authoritative transition carrying its target slug, so delivery resolves
a unit through the recorded rename disposition before concluding that no plan exists — string equality would miss
the existing plan after a rename and mint a duplicate, which no later advisory could catch, because nothing was
found to revalidate.

**Resolution runs from stored plans forward, not from the current name backward.** A rename record is keyed on the
name being retired and carries the new name as its target, so a query keyed on the unit's _current_ name matches
nothing — the current name is a record's target, never its subject. Delivery therefore cannot ask "was I renamed?"
and must ask, of each stored plan, "does this plan's unit resolve to me?" Getting this direction wrong is not a
degraded answer but the original defect restored: the backward query returns _no record_ for every renamed unit,
which is precisely the arm that would permit minting.

Authoring scans the plan namespace — bounded by the number of plans in one repository — and resolves each stored
plan's recorded `workUnitId` **forward** through the rename chain, transitively, with cycle detection. The
outcomes are not interchangeable:

- **A chain terminating at the unit being authored for** identifies that unit's existing plan, which is adopted
  under the new name.
- **A chain terminating elsewhere, or a unit with no transition at all,** simply is not a match; the scan
  continues. A non-rename retirement — the plan's unit was dropped, abandoned, or replaced — resolves the same
  way: that plan is not this unit's, and it must not block minting for a unit that is live.
- **No stored plan resolving to the unit** is the only outcome that permits minting a new plan.
- **A chain that cannot be resolved** — an ambiguous subject, an unreadable or corrupt record namespace, or a
  resolution substrate that is not reachable at all — refuses authoring and reports the reason, because an
  unresolvable chain may conceal a match. **Refusing on indeterminacy is deliberate**: a duplicate plan is
  unrecoverable, while a refusal costs one operator decision.

**Reachability is a stated precondition, not an assumption.** The rename evidence is tracked content enumerated
from a ref, so its visibility depends on which ref is read, while the plan namespace is reachable from every
checkout. Those scopes do not coincide, and an unreachable record is indistinguishable from no record — which is
the arm that permits minting. Authoring therefore resolves against a ref whose reachability it has established,
and treats an unestablished one as indeterminate rather than as evidence of no rename. This is the one place
delivery depends on a record living in a work unit's change set, which § 6 requirement 1 forbids for delivery's
own records; the dependency is read-only and is named here rather than left implicit.

A **cycle is not indeterminate** and does not refuse. Traversal is complete and deterministic, so a cyclic chain
that has not reached the unit being authored for provably cannot reach it: the answer is _not a match_, and the
scan continues. Refusing there would be strictly harmful — a legitimate round-trip rename leaves a unit's own plan
sitting on a cyclic chain, and because the scan spans the whole namespace, one such plan would otherwise block
minting for every unit in the repository with no available remedy, since the records are append-only. Cycles are
reachable in practice: rename preflight refuses only a self-rename and checks only live occupancy of the target,
so `A → B` followed by `B → A` is accepted and leaves both records standing.

`workUnitId` therefore remains a **validated field rather than a preimage**. A forward amendment updates it when a
rename is observed, and a mismatch between the stored value and the unit's current slug is a typed advisory, not a
validity failure — the identity spine is unaffected either way. Where the rename record is unreachable, as it may
be from a member checkout carrying none of the unit's artifacts, the reverse lookup of § 6 still returns the plan
and member correctly and only the reported owning-unit name may be stale; that condition is stated rather than
assumed.

Project scope is likewise outside the identity, for the reason § 6 gives: it is a property of where a record lives
rather than of what the record says, in both the current tier and the one the storage direction is heading for, so
including it would denormalize the address into the contents. Revision one carries `previousPlanDigest: null`;
every later revision is exactly predecessor + 1 under the same `planId` and names that predecessor's digest.
`planDigest` covers the complete canonical record except itself. The plan store publishes by expected predecessor
digest expressed as the expected current plan digest (`null` for first publication), preventing two successors from
both becoming current.

Granting a chunk a merge boundary derives its `deliverableId` from `planId` and the author-supplied `chunkKey`
rather than accepting a second author key. No intermediate chunk identity is stored: nothing in the record,
the reducer, the projection, or the proof reads one, so it would be a registered preimage and a durable schema
commitment with no consumer. The preimage excludes plan revision and member position, so a deliverable keeps one
identity across every revision of its plan for as long
as its `chunkKey` is unchanged. That stability is load-bearing: reconcile identifies a member by `deliverableId`
and asks the fingerprint only whether its meaning moved, so renaming a `chunkKey` is an identity change wearing
the costume of an edit, and § 7 refuses it on a bound member.

A member's human label is its position in the series, qualified by the producing plan revision, following the
established patch-series form. The label is presentation only; `deliverableId` alone is durable, so relabelling
never moves identity, and because amendment runs forward of the landed prefix, a landed member's label never
shifts under a later revision.

The member's `contract`, task and design coverage, semantic landability assertion, and incident or owned seam
semantics derive `semanticFingerprint`, including the referenced task and design semantic digests rather than
identifiers alone. A member fingerprint incorporates every incident seam fingerprint, so a changed cross-member
contract cannot reconcile as an unchanged bound prefix. The title still changes the whole-plan digest but does not
force replacement when the member's actual contract is unchanged.

`members` is the only topology-order carrier. No arbitrary dependency edges exist: a member's predecessor is the
previous array member, and any requested landing is a contiguous prefix. Member order rides the array alone, which
keeps the record independent of the task list's numbering conventions.

A seam has at least two distinct incident deliverables, listed in plan order. Its scheduling owner is derived as
the latest incident member and cannot be authored differently. The exact acceptance statement and incident set
derive the seam fingerprint.

Member and seam `assuranceSubjectId` values both derive from `planId`, the subject kind, and the stable subject
identity, excluding plan revision and evidence-carrier identity so they survive harmless materialization and
presentation changes. Seams carry an assurance subject for the same reason members do: § 8 admits a landing only
when review returns a clearing verdict for every assigned seam at its exact generation, and § 9's proof records a
verdict identity per seam. A seam is an assurance subject in its own right because its acceptance statement is a
cross-member contract no single member's review covers.

`mainlineLandability` is a plain enum — `independently-landable` or `integration-only` — preserving the semantic
judgment even when the selected projection does not need incremental base landing. A stack-to-`main` plan requires
at least two members and the first value on every member. This is the irreducible authored judgment only: current
checks, linearity, provider support, merge mode, stack depth policy, and exact bases and heads remain reducer
inputs and cannot appear in the plan. The value carries no qualifier recording which definition of landability it
was asserted under, even though that definition is expected to move — it already moved once, when field runs found
test-green, semantically incoherent heads. A qualifier would be read at neither point that consults the field: the
record's own validity check re-reads the value itself, and the land-time verdict re-evaluates landability against
current checks and host facts regardless. What a definition meant on a given day is recoverable from the
definition's history and the landing date, so a per-member stamp would be a denormalized copy of a fact held
elsewhere.

**A member is discriminated `live` or `landed`.** A `live` member's `semanticFingerprint` is derived, and a reader
re-derives it. A `landed` member's is **carried and authoritative**, and a reader does not re-derive it. The
discriminant is what makes the two rules coexist: without it, § 7's freeze and this section's revalidation
contract contradict each other on exactly the revision that replacement exists to produce, because a frozen
member's fingerprint reaches incident seam fingerprints that re-cutting the unlanded suffix legitimately moves.

**The discriminant is an authored assertion, and the record checks it only against itself.** A landing is a host
observation (§ 8), so the plan — authored intent, validated offline, storage-agnostic — cannot verify that one
occurred, and must not try: requiring that would put a projection-dependent host fact inside an immutable record
and make offline revalidation impossible. What the record checks is entirely in-record and always available,
because a revision carries its validated predecessor: a member converting from `live` to `landed` must carry
values **equal to its predecessor revision's payload modulo the discriminant**, which binds the frozen values to
what the plan actually promised when the member landed. Thereafter the carried values must be byte-identical to
that first frozen form. Whether the assertion matches the world is § 8's question, not the constructor's: the
reducer derives `landedPrefix` from host observations and refuses any transition whose plan-side frozen prefix
disagrees with it.

The constructor preserves source inventory order and member order, normalizes set-like values, derives every
identity through registered domain-separated preimages, then validates the complete record. A reader repeats the
identity, digest, uniqueness, coverage, seam-owner, revision-lineage, and projection refinements. Whole-record
refinements span every member regardless of discriminant; only **fingerprint derivation** is discriminant-scoped,
re-derived for a `live` member and checked as carried-value integrity for a `landed` one. Provider
bindings, branch or pull-request names, adapter capabilities, review targets, requirements, receipts, task
completion state, and workflow steps are schema errors rather than tolerated extra fields.

### 2. Granularity, coverage, and the composition checks

**A task's `semanticDigest` covers its `Goal`, and nothing else.** Stating the covered surface is part of the
contract, because everything downstream — member fingerprints, `inventoryDigest`, and the reconcile that reads
them — inherits whatever it admits.

Two properties select `Goal`. It must be **stable across completion**, or a landed member's fingerprint would move
at the moment its last task closed: the checkbox flips, and peer descriptors and every `Goal`-child — including
the test-first marker and its build list, the exclusion worth naming because it reads like durable intent — are
replaced. `Outcome`, though the protocol's second protected surface, is _added_ at completion and only when it
earns signal, so it is absent from exactly the authoring-time state a pre-implementation digest is taken over;
protected and stable are different properties, and the digest needs the second. The task **title** is stable in
that sense, and is excluded on the other ground: it is presentation, the same reasoning that makes a member's
human label presentation-only while `deliverableId` carries identity. A digest is asking whether the work's
committed intent moved, and `Goal` is where that intent is stated.

**Granularity then stops at the parent task, and the digest's surface is what stops it.** `Goal` is required on
every parent and opt-in, default-absent on subtasks, and the formatting standard's own diagnostic pushes toward
dropping subtask `Goal`s as noise. So a subtask-granular inventory would digest the empty set for the modal leaf,
leaving `inventoryDigest` and every member fingerprint blind to exactly the content they exist to track. Parent
granularity is not the cheaper choice; it is the one at which the digest has guaranteed content.

Nothing is given up for it. The rule that a member must not be forced inside an authored boundary is about
**spanning** — letting a member be coarser than one segment so a cut is not made to manufacture compatibility caps
— and never implied the opposite freedom of splitting a parent. Before implementation, the task plan and the
delivery plan are authored in the same stage, so a boundary you want is a boundary you write as two parent tasks.
On retrofit, a range touching part of a parent simply reports that parent as represented in more than one member,
which the coverage refinement below already admits. Neither hand-run cut went finer than a phase.

**The digest covers `Goal` text with whitespace normalized, not its bytes.** Task lists are hard-wrapped to a
line-length gate, so re-wrapping an unchanged `Goal` is an ordinary edit; under a verbatim-bytes digest it would
move every dependent task digest, member fingerprint, `inventoryDigest`, and `planDigest` — and past the bind point
would force a replacement for a reflow. So a task digest covers the descriptor's text with inter-word whitespace
and line breaks collapsed to single spaces, and the descriptor spans its label line plus every indented
continuation line, closing at the next peer descriptor, subtask, fence, phase, or section heading. That boundary is
what makes the covered surface decidable rather than a matter of where an author happened to break a line. One
authority for what a descriptor spans is the requirement; two that could disagree on nested lists or blank-line
separation would leave the digest and the formatting gate permanently at odds. That authority already exists —
the project's spacing pass computes exactly this extent, today as private state behind a validator answering a
different question — so it is exposed and shared rather than duplicated, and its rules are adopted as they stand
rather than restated in tidier form. Two consequences follow from adopting them honestly: a nested list inside a
`Goal` falls outside the digest, and an indented line after a blank line falls inside it.

`inventoryDigest` covers the normalized inventory, so rendering the plan into the task list creates no digest cycle
and later progress updates do not amend delivery intent.

The task-list scanner remains the structural authority. Its phase event is extended to carry the parsed phase id
and title in addition to the line number, so verification discovery does not create a second heading parser. The
verification task is the sole parent in the final phase whose parsed title is `Verification`; absence, multiplicity,
or a differently named final phase refuses. Existing cursor and descriptor-spacing consumers ignore the additive
phase fields and retain byte-identical behavior.

**Coverage is a record refinement whose strength the record itself declares; partition is a composition check.**
Every implementation task is covered by **at least one** member, and the work-unit verification task by none.
Coverage is enforced where it is authored and advisory where it is derived: on the pre-implementation entry the
author assigns membership, so an uncovered task is a defect and the refinement refuses; on retrofit membership
comes through commit attribution, which has blessed gaps, so an uncovered task surfaces as the unattributed-task
advisory of § 3 rather than blocking a cut the author knows is complete.

`entry` is fixed for the life of the plan: every revision carries its predecessor's value, and a change is
refused. Without that rule a frozen prefix authored under one coverage contract could sit inside a revision
declaring the other — permanently, since freezing copies it forward verbatim — which is exactly the unrecorded
provenance the field exists to remove.

That is why the record carries its `entry`. Without it a reader re-validating a published retrofit plan cannot
tell whether an uncovered task is a defect or an admitted gap, so it would either refuse valid records or never
enforce coverage at all — and a refinement whose strength depends on unrecorded provenance is not re-checkable.
The field makes the obligation part of the record rather than of the session that produced it.

Exactly-once is not required, because only one entry has the evidence to claim it honestly. A pre-implementation
cut is authored over tasks, so tasks partition exactly once and composition checks that directly. A retrofit cut
is authored over change structure, so what partitions exactly once and contiguously is the branch's
**work-unit-owned contribution** — the first-parent steps § 3 classifies as contribution rather than ambient base
absorb — and task membership is a projection of that partition through commit attribution. A projection through a
many-to-many map is not itself a
partition: one task's commits can fall either side of a boundary the cut drew for other reasons, which a cut
following a module import graph makes ordinary rather than exceptional. So a retrofit member claims a task is
**represented in** it, not that the task belongs exclusively to it. The weaker claim is derivable without invention
and still carries the check worth having — a task no member covers means either work never implemented or a commit
whose attribution is missing, and both are worth surfacing, differently.

The exactly-once guarantee is relocated to the basis that can bear it rather than lost, and it lives at composition
rather than in the record because commit ranges are rewritten by every rebase in a series. A plan that recorded
them would go stale at the first retarget; the commit partition is authoring-time evidence that shapes the record,
never a field inside an immutable one.

Every declared design element is covered by at least one member or named seam, with unknown references rejected.
Coverage is stated over **declared** elements, so a spec form enumerating nothing binds an empty inventory and the
design-coverage refinement goes vacuous — enumeration is a precondition for design coverage, never for chunking. A
finer review-only hierarchy inside one member may be selected later against its exact target, but it remains
review-owned and is absent from this record.

The design inventory binds each spec artifact's exact revision plus every enumerable element used for coverage. A
work unit carries one design artifact or a paired pair, so the binding admits both: each bound artifact contributes
its own revision digest, and elements carry form-qualified identifiers so a paired unit's requirement and design
namespaces stay distinct.

Delivery consumes that inventory through a validated caller-supplied `DesignInventoryInput`; it does not parse spec
forms or mint the external element-identifier family. The input carries one or two artifact basenames, each
artifact's canonical raw-byte revision digest, its form discriminator, and the form authority's enumerated
`{ elementId, semanticDigest }` entries. Delivery qualifies each element id with the form discriminator, rejects
duplicates and unknown member or seam references, and binds an empty inventory when the supplying form enumerates
no elements. The planning/form authority is responsible for producing the input; delivery is responsible for
validating and consuming it. This resolves the ownership boundary without re-deriving another element grammar.

### 3. Two authoring entries and the starter-map contract

**Authoring is two-phase and never accepts a hand-composed record.** The command first emits a starter map whose
machine section carries every derived fact and identity, and whose authoring section is a skeleton of explicit
author slots — one per irreducible judgment. The author fills only those slots. Composition then validates that no
derived value drifted from the paired canonical snapshot and that the machine and authored identity sequences still
match, refusing with a typed code on an unfilled slot, a mutated identity, or a reordered sequence. Which judgments
are irreducible is therefore computed and presented rather than described in prose.

**The two entries are peers in the command surface, not a primary and a fallback:**

```text
arc delivery plan from-tasks --design-inventory <json-path>
arc delivery plan from-branch --design-inventory <json-path> [--base <commit-ish>] [--head <commit-ish>]
arc delivery compose
arc delivery plan abandon
```

They are named by their **source** rather than by their timing, so neither reads as remedial, and they are
sibling subcommands rather than one verb with a mode flag, so neither is a variant of the other. Composition —
the part that must not fork — is a single verb both feed. Retrofit is first-class because it is the entry every
delivery cut with field evidence actually used; a design serving only the pre-implementation entry would fail on
first contact. Anticipating change size during planning is best-effort, and authoring a plan against work that
already exists is an ordinary act, not a recovery from a planning failure.

Amendment reuses the same path: a starter map seeded from the current revision produces a complete successor
record, published against the expected current plan digest that the successor records as `previousPlanDigest`.
Revisions are whole records rather than deltas, so each validates independently and no delta vocabulary becomes a
second topology language.

Both entries require a `--design-inventory <json-path>` document validated by the already-shipped strict
`DesignInventoryInput` schema. The CLI never guesses design elements or digests from prose. `from-tasks` reads the
active work unit's task list and derives phase groups directly from the task scanner's phase and parent events;
the flat canonical task inventory remains unchanged. `from-branch` defaults `--head` to `HEAD` and selects the
configured base ref as the base line unless `--base` is supplied explicitly.

The starter map is **transient authoring state, not a delivery record**: it exists before a plan does and is
discarded once composition succeeds or `arc delivery plan abandon` succeeds. It is represented by a paired
CLI-owned canonical JSON snapshot and an author-edited Markdown map under the `authoring` namespace. The snapshot
pins every entry input, derived fact, identity, and ordering fact; the Markdown repeats the machine section plus the
author slots. Composition reparses the Markdown and compares its machine section and identity order with the
snapshot before constructing a record. This detects ordinary hand edits and authoring drift; it is not a defense
against a hostile operator who rewrites both local files. Neither file is a § 6 delivery record or carries its
version discipline. Both rest outside the working tree and are deleted only after successful composition, or
together on explicit abandonment. A second map for the same unit is refused while one is outstanding.

The pair is keyed by the map's recorded original work-unit id, not by its mutable current slug. Resolution first
enumerates authoring snapshots, then follows authenticated retirement transitions from each recorded subject to
the current work unit. Plan lookup and map lookup share one storage-independent forward subject resolver; terminal
retirement, cycles, or an unreachable current subject are safe absence, while corrupt, ambiguous, or unestablished
authority refuses. Rename chains therefore preserve one outstanding-map identity without coupling the resolver to
either store.

**Boundary defaults** (the `from-tasks` entry). Phase-to-member alignment is that entry's default, and it is never
an invariant. It does not carry to `from-branch`, where the authored unit is a commit range rather than a task
plan, so no alignment arm is expanded and boundaries are authored directly. The member's landability assertion is
the real constraint; segment or phase refinement is a proxy for
it that is neither necessary nor sufficient, since a member can span a seam and land cleanly, or sit wholly inside
one boundary and not. Forcing members inside authored boundaries would systematically manufacture the
compatibility caps a cut should avoid, so a spanning member is authored without ceremony and needs no separate
justification field — the landability assertion already bears that burden.

The default is expressed as a **mode the author selects**, never a value pre-filled on their behalf: the boundary
slot takes a discriminated value whose alignment arm the composer expands mechanically, alongside an arm carrying
explicit boundaries. Pre-filling the slot with a derived partition would defeat the pattern the slots exist for —
an unfilled slot must stay detectable and refusable, and an author who never looked at a pre-filled boundary would
produce a record indistinguishable from one who did. A member's landability is an assertion about work someone is
answerable for; the record must not manufacture it on their behalf.

**What the retrofit machine section supplies** is the material an author draws boundaries against and the facts
each authored boundary needs — never candidate boundaries themselves. Derivable language-agnostically: the
first-parent commit sequence from base to head; each step's context classification and, where it names one, the
task it closed; per-step and cumulative change shape; file-level co-change structure; and which steps touch the
work unit's own lifecycle artifacts. Every per-step change is the shipped byte-preserving `ChangeSet`; an unknown
change set refuses rather than degrading to paths guessed from text. A step's cumulative change shape is the
byte-sorted union of `affectedPaths` from contribution steps through that point, including both endpoints of a
rename or copy. A co-change edge is a canonical byte-sorted unordered path pair plus the byte-sorted contribution
commit ids in which the pair co-occurs. Ambient absorbs add neither paths nor edges.

**The partition basis is work-unit-owned contribution along the first parent, not raw commits.** A branch's
history is not linear — a base merge inside a slice is ordinary, and one appears inside a slice of the very field
run the success signal requires to round-trip. Two things follow. Traversal is **first-parent**, so each step has
exactly one predecessor and a single well-defined change shape, which is what makes "contiguous" mean anything.
And each step is classified as **work-unit-owned contribution** or **ambient base absorb** only when the evidence
proves that classification.

The original divergence is derived against the selected base line, never from the moving merge base. Walking the
head's first-parent chain backwards must find exactly one earliest head-side step that is not reachable from the
selected base while its first parent is reachable; a missing or ambiguous boundary refuses and asks for an explicit
`--base`. An explicit base is authoritative but must still be an ancestor of the selected head. Each resulting
step records its commit, first-parent predecessor, and canonical `ChangeSet`.

A merge is ambient only when its non-first parent belongs to the selected base line and a remerge comparison, or an
equivalent tree proof, establishes that the merge carries no merge-only work-unit delta. A conflict resolution or
other merge-only delta is never silently discarded: when purity cannot be proved, retrofit refuses with a typed
ambient-classification reason. Ordinary contribution commits remain contribution steps.

Only contribution participates in the partition; an ambient absorb is an ordering landmark carrying no membership.
This reuses the distinction § 9 already draws at the proof layer rather than minting a second one: that section
requires every observed tree transition to equal the named generations' contribution "with no extra work-unit-owned
delta," and treats unrelated base advances as legitimate new bases absent from the contribution chain. Applying the
same cut at authoring time is what keeps the two layers describing one partition.

Attribution reach is a convention rather than a guarantee, and the two granularities differ. Measured on this
project's history, a substantial minority of a branch's commits name no task at all — review-driven fixes above
all — so attribution is sparse commit by commit. Per task it is far denser but not total: the footer contract
blesses `code review`, `maintenance`, and `incidental during …` alongside a task reference, deferred review lets a
range land under one bounding commit, and batching maps several tasks onto a single commit by design. A task with
no attributed commit is therefore a reachable state, not a malformed one.

**Attributed references normalize to the parent inventory before membership is derived.** The inventory binds
parent tasks, while a footer names whatever id the work was actually done under. The enforced footer grammar
admits arbitrary dotted depth, so subtask-level forms and the revision family the task-list standard defines
(`X.Y.R` at subtask level, `X.R` as a phase-level follow-on, with their own children) all validate today; only
the contract's documented examples are two-level, and on this repository most task-naming footers carry a deeper
id than those examples show. Normalization is therefore required by the inventory's granularity rather than by
any narrowness in the grammar — a reference may legitimately name something finer than the inventory binds, and
membership must still resolve. The grammar is exported from the commit-check policy as one parse-only structured
task-reference function returning the accepted singles, ranges, and lists. Commit validation and delivery both
consume that function; delivery does not reuse the handoff candidate extractor, whose intentionally lossy contract
does not expand the full grammar.

A reference resolves upward to the nearest enclosing entry in the parent inventory; a range or list expands, then
resolves, then deduplicates. Revision-family ids resolve to themselves rather than upward, since a phase-level
follow-on is authored as a parent and carries its own inventory entry. Where the walk reaches no inventory entry —
a task deleted or renumbered after the footer citing it was written — the reference contributes no
membership and is reported. It is **not** a composition error: on the derived entry an unresolvable reference is
the same class of evidence gap as an unattributed task, and § 2 already settles that coverage is enforced where it
is authored and advisory where it is derived. Refusing here would fail a cut on historical footers the author
cannot retroactively fix — including on the very branches the success signal requires to round-trip. On the
authored entry, where membership is assigned rather than derived, an unresolvable id remains an error.

The semantics are exactly the at-least-once claim § 2 settles: a subtask reference proves its parent is
_represented in_ that member, never that the parent belongs to it exclusively — so normalization loses nothing the
record was entitled to claim.

Two consequences follow. A member whose range is mostly review fixes derives few task ids or none, and is a valid
member rather than a composition failure — coverage is stated over tasks, not over members, so an empty `taskIds`
is admissible as long as every task is covered somewhere. And an **unattributed task** is surfaced as an advisory
rather than refused: work never implemented is a real defect, while a missing attribution is a convention lapse the
author can see and judge, and on retrofit no remedy is available anyway, since membership is derived and
composition validates that no derived value was altered. The advisory names the task and the member it most likely
belongs to, and leaves the call with the person who cut the boundaries.

Whether a commit touches the work unit's own lifecycle artifacts is **reported and never enforced here**. That
exclusion belongs to the member owning stack topology and arises only under that projection: an integration-target
series reaches the protected base once, so a member ref never publishes the unit's artifacts and the requirement
never fires. Enforcing it unconditionally in a projection-neutral composer would leak a projection concern into the
substrate and invert the cohort's dependency direction.

**The boundary judgment stays authored, and must.** One field cut followed a module import graph — language-specific
analysis no language-agnostic tool can perform for an arbitrary project — so a derivation proposing boundaries
would serve one project's stack and mislead the next. The consequence is stated rather than worked around:
composition validates that a boundary is **well-formed** (its contribution steps covered exactly once and
contiguous, every
implementation task covered by some member or surfaced as an advisory) and never that it is **well-chosen**. On the
pre-implementation entry that gap is immaterial. On retrofit it means composition cannot catch the failure the field
run actually hit, where candidate heads passed their own quality gates while advertising unwired surfaces. Proving a
boundary sound is the selected projection's eligibility test, run against authored boundaries, and belongs with that
reducer.

A retrofit cut carries one obligation the pre-implementation entry does not: boundaries drawn through code that
already exists are not landable by construction, so their coherence must be established rather than assumed, and
where the authored boundaries do not supply it the cut must buy it. The plan records the assertion; the selected
projection's reducer validates it against current checks and host facts. The two projections price that obligation
very differently — an integration-target retrofit reaches the protected base once and needs neither coherence proof
nor compatibility caps, while a stack retrofit needs both — so retrofit becomes available under the
integration-target projection as soon as its reducer lands, and under the stack projection when the eligibility test
does.

**How authoring gets reached.** A delivery plan is opt-in and delivery owns no trigger of its own. Authoring is
author-invoked, and the signal that it might be worth invoking comes from the decomposition boundary test that
already runs at every design stage. That test asks whether a concern is too big to be one work unit; when it
answers "stays one work unit" it is also, silently, deciding the concern is coherent — and its own primary signal
is the count of distinct deliverables and independently reviewable surfaces. A concern that stays one unit _while_
that signal fired is exactly the shape a delivery plan serves, and today that pairing is computed and discarded.
Delivery reads that judgment rather than authoring a second test; the advisory is worth surfacing once, never a
gate, and freely declined, because the retrofit entry stays open at the same cost.

**Surfaced where the judgment is made, not read from a record.** No verdict artifact exists — the boundary test
states its separable-surfaces signal in prose and records nothing when it answers "stays one work unit," and
creating that artifact belongs to the work unit rewriting the test. So the advisory attaches to the test's own
"stays one unit" arm and is surfaced in the session that makes the judgment. That satisfies the surface-once bar
without a durable record, at the cost of not firing later, which the freely-declined posture already tolerates.
When a recorded verdict does land — carrying its reason, so "unremarkable" is distinguishable from "with separable
surfaces" — this becomes a consumer of it without changing shape.

### 4. The human task-list projection

After canonical publication, the authoring command replaces one generated `Delivery Plan` section in `tasks-*`:
exact plan revision and digest, projection, an ordered member table (title, chunk key, task ids, design ids,
predecessor), and a named-seam table (incident members, owner, acceptance). Single-deliverable plans render the
same shape with one row. The section is informative and replaceable; workflows and reducers never parse it, and
per-task delivery tags do not create a second authority.

The generated range is bounded by exact `<!-- arc:delivery-plan:start -->` and
`<!-- arc:delivery-plan:end -->` sentinels. On first publication only, one unmarked top-level `## Delivery Plan`
section may be replaced and the sentinels installed. Duplicate sections, duplicate or malformed sentinels, or an
absent replacement locus refuse without touching the task list. Later publications replace only the exact sentinel
range.

Composition orders its effects as validate and resolve, construct, record the candidate plan digest in the
canonical snapshot, publish the plan by expected current digest, atomically render the task-list range, then clean
up the authoring pair last. A publication refusal leaves the task list untouched. If rendering fails, the pair
remains intact and retrying the same already-published plan is
idempotent rather than a uniqueness failure. Cleanup deletes the Markdown first and the canonical snapshot last;
the snapshot pins the candidate plan digest, so a failure between deletes leaves enough authority for retry to
finish cleanup without re-authoring. Explicit abandonment uses the same idempotent deletion order without
publishing or rendering.

Three rendering rules follow from decisions elsewhere in this spec:

- **Non-exclusive coverage is marked, not restructured.** The member table serves both entries, and on the
  pre-implementation entry the claim genuinely is exclusive. Where a task appears against more than one member —
  reachable only on retrofit, per § 2 — the table marks it as shared rather than reshaping into a form that reads
  as a defect.
- **Landed members are rendered as history.** A frozen member (§ 7) renders its as-of-landing values with an
  explicit marker, so a reader comparing a landed member's design digest against an amended spec sees a legible
  historical difference rather than apparent corruption.
- **The landability column renders under stack-to-`main` only.** Under the integration-target projection the value
  is recorded but never consulted and never varies in a way that informs the reader, so the column is omitted.

### 5. Delivery state and the transition-bearing facts

**This state record is the observations record of § 6** — the fourth of the four, not a fifth. It is named for
what it carries here and for where it lives there, and stating the identity is what keeps a reader from
provisioning both. It publishes by expected revision under that section's discipline, which is what `stateRevision`
counts.

One strict-current, non-evidentiary snapshot contains:

- `stateId`; the owning project and work-unit identity; and the exact `planId`, plan revision, and plan digest;
- `stateRevision`, plus the projection discriminant carried from the bound plan revision;
- one plan-ordered entry per deliverable: stable `deliverableId`, last exact base / head / tree / membership
  observation, the review target derived from that head at the deliverable's current generation with any coverage
  or requirement binding it carries, and any exact landing-observation reference;
- the analogous integration or terminal-target observations required by the selected projection, including any
  terminal-only delta target and its review-owned coverage and qualification references; and
- either no active operation, or one `activeOperation` binding its canonical `operationId`, kind
  (`materialize | publish | rewrite | land | teardown`), affected deliverable ids or terminal target, starting state revision,
  and exact requested heads and bases. A land operation additionally carries its immutable `landingIntentId`.

Several facts this contract reads are deliberately absent from it, because they are **decisions rather than
observations** and § 6 places every decision in the decision-bearing store: each deliverable's ref and
change-request handles, its materialization generation and selected review routing, the terminal target's refs,
and the choice of delivery-host adapter with its provider binding. The state record reads them; it does not own
them.

Mutable provider status is not copied as authority. An observation is a freshness-bound input to reconciliation;
every control-bearing verdict re-observes the relevant Git and host facts. Review findings, dispositions, receipts,
and qualification remain review-owned — delivery retains only their identities and asks the review reducer for
current qualification.

Only one operation is live at a time: a different operation stops while one is outstanding, and review operations
use the review subsystem's own resumable records rather than nesting inside this slot.

### 6. Storage — four records, a port apiece, one local adapter

Delivery keeps four per-plan records: the **plan** (authored intent, immutable per revision), the **assignments**
(every decision delivery makes while materializing the plan), the **assurance chain** (immutable landing evidence
the terminal proof consumes), and the **observations** (what the host currently shows). All four are
storage-agnostic by contract, and delivery keeps no project-scoped record of its own.

**The tier test is decision-versus-observation, and it applies field by field.** A fact that some later
re-observation of Git or the host reproduces may be treated as regenerable; a fact delivery _chose_ may not,
because nothing regenerates a choice. Reading the test at record granularity would silently license losing the
decisions that travel inside a record named for its dominant content.

**Requirements — these hold at any storage tier:**

1. **No record may live in any work unit's change set.** These records are mutable, version-checked, and read from
   checkouts holding none of the work unit's artifacts, so none can be a tracked tree file.
2. **Each must be reachable from any checkout of the repository**, including a linked worktree holding a member ref
   and nothing else.
3. **Every mutating write is version-checked and refuses rather than merges.** A stale read is harmless on its own;
   it causes harm only through a later unchecked write, and delivery's writers contend for the _same_ key — the plan
   for one `planId` — so no last-writer-wins or merge-on-conflict resolution is admissible. The concrete exposures
   are a resumed operation writing against a revision that advanced beneath it, and a retry after a partially
   applied outcome. The assurance store publishes append-only by expected predecessor digest — it is a growing chain
   that must
   survive export and import across adapters, where digest chaining is what makes it tamper-evident. The plan store
   publishes by expected current plan digest (`null` for first publication), the same token authoring already holds
   and the successor records as `previousPlanDigest`; assignment and observation stores publish by expected integer
   revision. The plan store retains no history. Every store publishes under the same advisory-lock discipline; no
   store has a lock-free publish path.
4. **The assignment record retains a per-subject generation high-water mark that teardown does not lower.**
   Assignments are otherwise a live map, so the natural reading is that tearing a member down removes its entry —
   which would break monotonicity, since `assuranceSubjectId` excludes plan revision and derives from `chunkKey`,
   so re-authoring a torn-down member lands on the identical subject id and a cleared entry would let its
   generation restart at one. The assurance chain cannot supply the mark either, since it carries one entry per
   landing and a torn-down member never landed.
5. **The assurance chain is append-only and historical.** Once member five lands, no live query returns the
   destination head and tree observed before member one landed, so it fails the re-observation test outright — and
   it is the input set to this member's half of the terminal proof.
6. **Assignments are decisions, not observations.** Observing a ref tells you what is in it, never that it is member
   three of a particular plan, and recovering that by reading the ref's name is the branch-derived identity this
   record refuses everywhere else.

**Materialization generations are monotonic per subject and never reset** — not across a re-materialization, and
not across a teardown that re-authors the same `chunkKey`. Without that invariant a replacement could reissue
generation one against a subject identity a prior clearing verdict already answered for, letting an earlier review
confer authority on materially different later content. The counter is enforced by the store rather than trusted
from the caller.

**v1 adapter.** Each store is declared as a **port** and implemented as **one adapter**. At v1 all four records
live in the repository's Git common directory, alongside the review subsystem's existing operation state — a
location every linked worktree resolves identically, which checkout-path relocation cannot move, and which is
absent from every tree. Each of the four occupies its own namespace (`plans`, `assignments`, `assurance`,
`observations`) holding one record per plan, with advisory locking, atomic replacement, and a version-checked
publish that refuses a stale expected digest or revision. This composes the review subsystem's existing
operation-store pattern rather than introducing a second concurrency model.

**The four ports have fixed operations and payload-parameterized declarations.** The plan port reads the current
plan and publishes a successor against the expected current digest. The assignment and observation ports read a
`{ revision, value }` snapshot and publish against that integer revision. The assurance port reads a chain, appends
against the expected tail digest, and exports or imports a complete verified chain. Payload type parameters let this
member ship the storage boundary before later members declare the observation and terminal-assurance payloads; they
do not make the operations, concurrency tokens, or failures generic. The closed domain failures are
`record-malformed`, `identity-mismatch`, `version-conflict`, `predecessor-conflict`, `chain-invalid`,
`import-nonempty`, `ambiguous-match`, and `namespace-corrupt`; absence is a nullable read result, and filesystem or
transport failures remain infrastructure errors rather than being flattened into domain refusals.

**What that reuse actually costs.** The shipped implementation is review-gate-private: its publisher hardcodes a
`<git-common-dir>/arc/review-gate/<namespace>` root over a **closed** namespace union of five review names, the
store above it is typed to review operation state, and it lives under the scripts tree, which the library tree
does not import from. So delivery reuses a proven _pattern_ plus an existing concurrency model, not a class it can
call. Realizing it requires four things, named here so task generation prices them rather than discovering them:
lifting the publisher into the library layer; parameterizing a runtime-validated root plus namespace; adding an
explicit delete result and safe Markdown name for transient authoring state; and giving the assurance store
**predecessor-digest publication** over a **multi-entry append** shape, since the shipped compare-and-swap is an
integer revision counter with no predecessor pointer and the shipped store holds one record per name. The plan,
assignment, and observation stores otherwise map onto the shipped discipline. The lock this composes is the existing
bounded-wait advisory lockfile, acquired per namespace rather than per record — that is what "mutation lease" names
here, and the per-namespace granularity is adequate only because § 6 scopes operation to one at a time.

The generalized publisher accepts only a closed root/namespace pair validated before path resolution:
`review-gate` with its existing five namespaces, or `delivery` with `plans`, `assignments`, `assurance`,
`observations`, and `authoring`. Record namespaces admit safe `.json` basenames only; `authoring` additionally admits
safe `.md` basenames. Its update result is explicitly `keep`, `write`, or `delete` — the existing `content: null`
meaning migrates to `keep`, never silently changes into deletion. This is enough for abandoning a starter map
without exposing an unchecked path-shaped API.

**One operator at a time.** A work unit has a single owner, and one person cannot operate two machines at once, so
concurrent delivery operations against one plan are out of scope and the mutation lease is local. The boundary is
recorded rather than left implicit because it is what licenses the local lease: the moment delivery records became
reachable from a second operator, a lease scoped to one machine would stop containing what it appears to contain.

**Ordering a host mutation.** An operation writes both decision-bearing and observation records, and no atomic
write spans them, so the order is the contract. A host-mutating command reserves `activeOperation`, invokes the
adapter, observes the exact outcome, **publishes whatever the operation produced for the decision-bearing stores
under their own version checks** — the resulting assignment, and for a land operation the assurance-chain entry —
then records observations and clears the reservation. The decision-bearing publish is the durable commit point,
chosen because it is the only part that cannot be rebuilt: a crash after it loses observations that re-observation
reconstructs, while a crash before it leaves the record unwritten and the operation replayable. Retry acquires the
same operation identity, reconciles before replay, and either adopts an already-applied exact result or reissues
through an adapter operation idempotent by operation id or structural delivery identity. Reconciliation clears an
operation only when the host proves it applied exactly or did not apply; ambiguous or partially applied outcomes
remain blocked for explicit remedy.

**Resolving position from a member checkout.** The assignment record answers the reverse question the plan cannot:
given a repository and a head or ref, return the plan, the member, and the owning work unit. A session occupying a
member ref needs that answer _before_ it knows which plan to read, and the checkout deliberately carries none of
the work unit's artifacts to tell it. This is stated as a **query contract, not a storage choice**, so the tier
change is transparent: at v1 it is a scan over the assignment namespace, and under a records-canonical projection
it is an ordinary indexed record query. Because it is a lookup in an authoritative binding rather than an inference
from a ref's shape, it reintroduces none of the branch-derived identity the record refuses. A command may instead
receive the owning work-unit pointer explicitly, and the session-locus layer carries only that subject pointer
rather than a copy of delivery state. At v1 the repository parameter is ambient in the port instance rooted at the
current Git common directory; it is not the review subsystem's per-clone `repositoryId`. A head query compares an
exact object id. A ref query compares the authoritative stored binding and its recorded observed head; it never
infers identity from ref spelling. Exactly one match is required: no match returns a negative result, while multiple
matches refuse as `ambiguous-match`. An explicitly supplied owning-unit pointer selects the candidate plan directly
but still validates the plan, member, and selector instead of trusting the pointer as proof.

**The v1 boundary, stated rather than discovered.** No record is pushed, so no delivery record survives a clone or
reaches a second machine. An operator who moves machines mid-delivery leaves the plan stranded on the first. This
is a deliberate scope boundary, not an oversight: the properties requiring transport are satisfied by the shared
tier of the storage direction, and building an interim transport would mean authoring a namespace, a refusing
push, and an explicit fetch — none of which arrive by default today — for a capability the single-operator model
does not otherwise need. Because each store is a port, the shared adapter is a later addition rather than a
rewrite.

**Keeping the replacement cheap.** The port is the contract and survives a tier change untouched; the adapter is
tier-specific and expected to be discarded rather than migrated. Nothing here acquires a migration reader or a
compatibility alias — the pre-release posture regenerates development state instead, and for observations
regeneration is nearly free because re-observation already reconstructs them.

**The assurance chain is the exception, and it must be carried rather than regenerated.** Requirement 5 states
that no live query reproduces it; discarding the adapter that holds it therefore destroys the only copy, and with
it the ability of an already-landed series to prove itself — leaving § 8's `Complete` step and Success Criterion 11
permanently unreachable for that plan. "Regenerate development state instead" is the correct posture for the
observations and the tolerable one for a plan, which the `from-branch` entry can re-author; it is not available
here. So the assurance store's port carries an **export and import obligation**, and no adapter may be retired
until the chains it holds have been carried across. Any residual loss is a stated consequence, never a silent one.

Delivery's port requirements are contributed **outward** as an input to the project's storage-abstraction work —
artifact read and write, version check and reconcile semantics, failure classes, the carry-over obligation above,
and the reverse-lookup query — rather than settled privately here. Each is phrased as a requirement of the **port**
so it stays legible after the v1 adapter is gone: a requirement argued from the v1 storage contract would read as
retracted the moment that contract is replaced.

**Project scope belongs to the address, not to the identity.** Delivery records are never addressed
project-agnostically: at v1 they live in one repository's Git common directory, and under the storage direction the
backing store is keyed by project, so the path carries the same fact in both tiers. Putting project scope inside
`planId` would copy the container into the contents. So optional `projectId` stays a **field** and leaves the
**preimage** — the record is self-describing when a conforming value is available, and the day a project identity is
supplied is an upgrade rather than a schema change. The residual cost is bounded: two projects can mint
the same `planId`, which bites only where their records meet, which needs a federating backing service — and such a
service would know which project it serves, so scope would be ambient in its addressing too.

These are requirements of the **port**, not of the v1 adapter — they describe what a conforming project identity
must be wherever delivery records are eventually read, which under the shared tier includes machines and users
other than the author's. Stating them against v1, where no record leaves its machine, would make them look vacuous
now and retracted later. A conforming `projectId` must be **stable across clones, machines, and users** (a
per-clone value would make one project's plan claim a different project on every machine); **not derived from a
remote URL** (forks, mirrors, and moved remotes change the URL while leaving the project the same); and **named
for its own scope, not the repository's** (a repository-local minted UUID already exists under the name
`repositoryId` as the review
subsystem's per-clone identity, and both values are opaque strings, so a delivery field of the same name would
accept the wrong one silently). The project's own identity work already needs these properties and records that it
does not yet have them; delivery contributes its requirement as an input to that resolution — strictly stronger,
since ruling out remote-URL derivation rules out that chain's current first fallback — and neither mints nor
configures the value meanwhile.

The guard is therefore **inert until a conforming identity authority is available**: today the schema checks only
that a supplied value is a non-empty opaque string and the constructor carries it verbatim. Once an authority can
establish conformance, the transition reducer compares that supplied value with the expected project before
admitting a transition. No weaker local predicate is asserted in the meantime, because the only locally available
value is the per-clone identity this design explicitly rules out.

### 7. Plan revisions, binding, and amendment

**The revision lifecycle — every event that produces a revision, and who validates it.** Four sections carry rules
about revision validity: this one sorts proposed revisions, § 1 states what a well-formed record contains, § 8
admits transitions against the host, and § 9 proves the result. Stating the events once here is what keeps them
from disagreeing, and the division of labor is the load-bearing part: **the record validates only what it can see
from its own contents and its validated predecessor; whether an assertion matches the world is always § 8's
question.** A revision is produced by exactly one of these events.

| Event              | Record-internal obligation                                       | Host validation                                  |
| ------------------ | ---------------------------------------------------------------- | ------------------------------------------------ |
| Initial authoring  | Full refinements; `previousPlanDigest: null`                     | —                                                |
| Free amendment     | Full refinements; no reconcile is reached                        | —                                                |
| Absorb             | Coverage additions inside one bound, unlanded member             | Reducer re-derives the member's review target    |
| Metadata amendment | Only work-unit metadata differs; no member bytes change          | —                                                |
| Conversion         | Converting member equals its predecessor modulo the discriminant | Frozen prefix must equal the host `landedPrefix` |
| Replacement        | Landed prefix byte-identical; suffix re-authored                 | Reducer admits only a torn-down bound suffix     |

Three consequences the arms below would otherwise leave implicit. **Conversion is a distinct event, not an
alteration of a landed member** — the refuse arm governs changes to a member already frozen, while conversion is
the act of freezing one, and it is the only event permitted to change a member's bytes on the landed side.
And **conversion is obligatory rather than optional**: because § 8 refuses a transition whose frozen prefix
disagrees with the host, the author publishes the conversion revision after a landing before the series can
advance. Where a landing and a re-cut are both wanted at once, conversion publishes first — a replacement
requires a byte-identical landed prefix, which a not-yet-converted member cannot present.

And **every event that produces a revision obliges state to rebind to it.** § 8's first admissibility condition
requires the state to bind the current plan revision, so absorb, conversion, and metadata amendment each leave the
next transition inadmissible until the rebind lands. Rebinding is a state-record update, not a host mutation: it
reserves no operation and appears in no operation kind.

**Bind point.** A plan is freely amendable until a revision acquires its first externally visible dependency — a
pushed member ref or an opened change request. Binding follows external dependency rather than lifecycle position
or local state: until then, authoring iterations cost nothing and reach no reconcile, whichever lifecycle state the
work unit occupies. Two boundaries are deliberately excluded. Keying binding to a lifecycle transition would make a
plan authored during implementation born bound, foreclosing the retrofit entry — and every delivery cut with field
evidence was authored that way. Keying it to local ref construction would bind a plan merely for building candidate
heads to test, which is exactly the proving step a retrofit author should be free to run and discard.

Before any external binding, state rebinds to a new plan revision freely. Afterwards reconcile sorts a proposed
revision into one of three outcomes, chosen so the outcome matches what is physically possible at that point in the
series:

**Absorb** — the proposed revision changes what a bound but unlanded member _contains_ without changing what it
_promises_. A member's `contract` is its promise; its task and design coverage are its contents. Coverage
**additions** are absorbable; coverage that **moves between members** or **leaves the plan** is not, because that
changes the partition rather than the contents of one member.

Be precise about what reaches this arm, because the obvious example does not. Adding a _subtask_ inside an existing
parent changes no `taskId`, no `Goal`, and therefore no task digest, no `inventoryDigest`, and no member
fingerprint — under § 2's parent granularity the record cannot observe it, so it proposes no revision and reconcile
has nothing to sort. That work still advances the member's materialization generation and derives a new review
target, but it arrives through § 8's head-change reconcile rather than through a plan revision, and the two must
not be confused. What actually reaches absorb is a change the record _can_ see: a new parent task covered by a
bound member, or a design-element coverage addition.

Addition and move are distinguished by comparing the whole-plan task-to-member relation across the two revisions,
which is always available because revisions are whole records: a task whose covering member set **grows** is an
addition; one whose covering set **shifts** membership is a move; one whose covering set **empties** is a
departure. This pressure is a pre-implementation-entry phenomenon — discovering that a phase needs a subtask
presumes the work is still ahead of you. On retrofit the change set already exists, so coverage moves only when the
commit partition is re-cut, which is a member-set change rather than a coverage tweak.

**Refuse** — the proposed revision contradicts something already true, and no remedy can make it true again.
Removal, reordering, or alteration of a **landed** member is refused rather than remedied: its change request is
merged, so a plan no longer claiming it leaves a landing observation for a member the plan does not contain, and
this member's half of the terminal proof is falsified by construction. A **topology change after the first
landing** is refused on the same ground, since landed members already reached the destination the old projection
chose. Renaming a bound member's `chunkKey` is refused as an identity change; the guidance is to author a new
member rather than rename a bound one. Renaming a bound seam's `seamKey` is refused on identical grounds and for
the identical harm: a seam's `assuranceSubjectId` derives from it, so a rename strands the subject a clearing
verdict already answered for and restarts its generation counter.

**A seam all of whose incident members have landed is refused on the same ground as a landed member.** Its owner is
the latest incident member, so once that member lands the seam is wholly shipped: it obtained a clearing verdict at
an exact generation, and the terminal proof reads its recorded verdict identity. Altering its acceptance statement
or dropping it would re-describe shipped work and leave the proof reading a seam set the assurance chain does not
match. The crossing-seam obligation below governs the partly-landed case; this governs the fully-landed one, and
between them no seam incident to a landed member is silently rewritable.

**A revision that changes only work-unit metadata is classified before the three arms, not by them.** Updating
`workUnitId` after a rename touches no member's contents or promise, re-cuts nothing, and alters no landed bytes,
so none of the three arms describes it — and routing it to absorb would advance every bound member's generation
and derive new review targets because the unit was renamed. It is a **metadata amendment**: it produces an ordinary
new revision that state rebinds to, and it never advances a generation or invalidates a review target.

**The landed prefix is history; the unlanded suffix is intent.** A landed member is **frozen whole** — its
contract, coverage, landability assertion, and the referenced task and design digests _as of the moment it landed_.

Freezing happens at a definite point, and naming it matters because the plan is immutable per revision: a landed
member cannot be re-typed in place. The **first revision authored after the landing is observed** writes that
member in its `landed` form, converting it from `live` and capturing the as-of-landing values. That conversion is
the one boundary where the member's bytes legitimately change. From then on a replacement **copies it forward
verbatim** rather than re-deriving it, and the byte-identity check compares against that first frozen form — never
against the live predecessor, which would fail on the conversion itself. A replacement altering an already-frozen
member fails byte-identity immediately, which is the protection the refusal existed to give.

Re-deriving instead would refuse on evidence unrelated to what landed. A member's fingerprint reaches two things
the member does not own: the digests of design elements it references, and the fingerprints of seams it is incident
to. Both move for external reasons — amending the spec moves the first, and re-cutting the unlanded suffix moves
the second, since a seam's fingerprint derives from its incident set. Under re-derivation a landed member's
fingerprint would move although its contribution is fixed in the tree, so refuse would fire on the very re-cut that
replacement exists to perform, and amending the spec after the first landing would be forbidden outright.

Freezing is the shape this problem converges on elsewhere: a consensus log never rewrites its committed prefix and
truncates only the uncommitted suffix; version control makes a commit immutable and rewrites by producing new
objects; double-entry accounting closes a period against edits and takes corrections as adjusting entries in the
open one. The record's `landedPrefix` and `firstUnlanded` are that committed index, and replacement is that
truncation. Two obligations ride along from the same idiom. **Frozen values are labelled, not hidden** — a member
is discriminated as landed rather than live, and its values are typed as-of-landing. And **corrections go
forward**: design drift on landed work — shipped work whose design element has since been amended — is real and
worth knowing, so it surfaces as a typed advisory rather than a plan-validity failure. Delivery emits that advisory
from its own reconcile and at the terminal proof, where it is decision-bearing; consuming surfaces render it. It is
the adjusting entry, not a reason to refuse the revision.

**Seams crossing the landed boundary are an obligation, not an immutability check.** Freezing does not cover them:
when a seam spans a landed member and an unlanded one, re-cutting the suffix genuinely can orphan the seam's
acceptance. The replacement must still carry a seam with the same acceptance statement and the same landed-side
incident; what it may not do is drop the obligation on its way past. Refusing the re-cut outright would be the
wrong instrument, since the landed side is unchanged either way.

**Replacement** — the remaining case: unlanded work is re-cut while some member is bound. The remedy is executable
precisely where it applies, because a bound but unlanded member _can_ be torn down — its change request closes and
its ref is removed — while a landed one cannot. So replacement is teardown of the bound-unlanded suffix followed by
re-authoring from `firstUnlanded`. No adoption argument is needed: landed members carry forward unchanged, and
bound-unlanded members are torn down rather than adopted. The replacement lineage explicitly references its
predecessor, and the old state is never overwritten into the new meaning.

**Forward-only amendment.** After binding, a plan amends only forward of the landed prefix, which is a physical
constraint rather than a policy: a landed member's change request is merged and cannot absorb further work.
Discovered work resolves by where its member sits — an unmaterialized member absorbs it freely as a suffix
amendment; a materialized one absorbs it as a content change advancing the member's generation and deriving a new
review target, leaving plan membership untouched; a landed one cannot absorb it at all, so the work moves to a
later member or mints a new one. Splitting an oversized member is the same case: free while that member is unbound,
a replacement once it is not.

**Reactive insertion.** A plan may gain a member it never anticipated, when a landed member blocks work outside its
own work unit and the remedy must ship before the series continues. Mechanically this is an ordinary forward
amendment — landed positions unchanged, the unbound suffix relabelled under a new revision — but it is the one
amendment whose cause originates outside the plan's intent, so the record admits it as a first-class mode rather
than treating it as authoring drift.

### 8. The shared transition reducer

The state record stores facts rather than a second agenda. CLI verdicts derive the aggregate position from ordered
per-deliverable facts:

1. **Bind** an empty state revision to the exact plan digest and a delivery-host adapter.
2. **Materialize** provider refs for the next admissible deliverable without changing its canonical identity.
3. **Publish and observe** its change request plus provider-reported base, head, membership, checks, and
   capabilities.
4. **Satisfy review** against an exact target; a changed target carries coverage only through the existing typed
   applicability and retrigger contract.
5. **Land** only an admissible deliverable or prefix after the applicable interlock; then reconcile provider truth.
6. **Complete** only when every planned deliverable, named seam, terminal-only delta, and the
   projection-independent terminal proof are satisfied.

Plan drift, provider drift, ref rewrites, and interrupted operations produce typed reconcile verdicts; they do not
silently remap deliverables or discard review evidence. Aggregate labels such as unstarted, active, ready, stale,
and complete are derived verdicts rather than independently writable state.

For the plan-ordered sequence `D1 … Dn`, derive the longest exact `landedPrefix` and its `firstUnlanded` member
from current host observations; neither is writable state. The projection defines the destination in which "landed"
is observed. A requested transition is admissible only when:

1. the state still binds the current plan revision and has no different unresolved operation;
2. the adapter proves the projection, ordered membership, bases, heads, and trees, with no missing or extra member —
   and the expected project too, whenever the plan carries a `projectId`;
3. a landing request names a non-empty contiguous prefix beginning at `firstUnlanded`;
4. every selected member's current generation has green required checks, and the review system returns a clearing
   verdict for that member and for every assigned seam at that exact generation; and every stack-selected member
   carries the plan's semantic landability judgment; and
5. an immutable `LandingIntent` binds the exact member set, generations, checks, review assurance, contribution
   manifest, destination, and landing mode before the applicable interlock; and
6. the plan's `landed`-discriminated prefix agrees exactly with the host-derived `landedPrefix`. This is the check
   § 1 delegates here: the discriminant is an authored assertion the record cannot verify, so it is verified at the
   only layer that observes the host. A landing therefore obliges the author to publish the conversion revision
   before the next transition is admissible.

A changed base, head, or membership never passes through as "close enough." Reconcile first: preserve stable
deliverable identity, advance the affected materialization generations, derive new review targets, and withhold
another readiness verdict until checks and review applicability settle. After mutation, re-observe the host and
accept only the requested exact result or a landing mode's explicitly contracted partial result.

### 9. The assurance chain and the membership / tree-exactness proof

**Authority boundary.** This proof is co-owned. Membership and tree-exactness are this member's; obligation,
coverage qualification, and the combined gate that conjoins the two halves belong to the cohort member owning
review cardinality. One rule keeps the seam clean in both directions: **delivery may bind and carry review-owned
identities and verdicts, and must never define what makes them admissible.** Delivery asks whether an assurance
subject is qualified at an exact generation and records the answer's identity; review decides what qualification
means, what an exemption is, and how coverage binds.

One property of those identities is delivery's to state, because it follows from delivery's own **port**
requirement rather than from anything review needs: **a carried verdict identity must be stable across clones.**
The assurance chain is append-only, carries the verdict identities recorded at each landing, and must re-validate
wherever it is eventually read — which the **shared tier** puts beyond the machine that wrote it, even though the
v1 adapter does not. (The port's carry-over obligation is a same-machine migration between adapters and does not
by itself carry this; the forward direction does.) The review side's identities currently derive from a per-clone
value, which would not resolve there. Stating this against v1 storage would misdescribe it as vacuous
today and retracted at the tier change; stating it against the port is what makes it a durable input. That is a
requirement delivery contributes outward — the same move it makes for `projectId` — not a rule it writes on
review's behalf.

**Exact record chain.** Precondition evidence, human authorization, and the observed host result are different
facts and must not collapse into one terminal record.

1. **`LandingIntent` — exact pre-mutation contract.** A canonical immutable payload, held while live by
   `activeOperation` rather than a second operation ledger, and carried into the assurance store by the observation
   that fulfils it. It binds: repository, state id and revision, plan id / revision / digest, projection, operation
   id, and delivery-host adapter and capability; the exact destination ref plus its observed pre-landing head and
   tree; the requested contiguous member prefix, each stable deliverable id and materialization generation, and the
   exact source base / head / tree or contribution-manifest entry used for it; current required-check observations
   plus the review-owned verdict returned for every selected member and assigned seam at its exact generation,
   carried by identity; landing mode and exact admissible outcomes — one expected result for `single` and
   `atomic-prefix`, or the ordered list of allowed leading-subprefix result trees for `ordered-prefix`; and any
   terminal-only delta target with its review qualification and applicability proof. The terminal intent also binds
   the work-unit verification anchor to the same aggregate contribution digest.

   The applicable interlock receives a derived, exception-filtered readiness projection of that record. Human
   approval remains the sole merge authority and is not turned into a delivery receipt. Before mutation the command
   re-observes every control-bearing fact and requires the same intent digest; any state, base, head, membership,
   capability, check, review, or contribution change invalidates the intent and refires the interlock.

   `LandingIntent` has two lives, and each is served where it happens. While live it is a reservation — the exact
   contract the command re-checks immediately before acting — held on the machine doing the acting, which is the
   only place the re-check occurs. It becomes history at the moment the mutation does, and reaches the assurance
   store then: **the observation embeds or content-addresses the intent it fulfilled**, so one append per landing
   carries both.

2. **`LandingObservation` — immutable post-mutation fact.** Reconciliation emits a canonical observation binding
   the intent, host operation identity, exact before and after destination heads and trees, actual landing mode and
   outcome, exact landed member ids and generations, contribution-manifest digest, and the check and review
   evidence references the intent used. The result must equal the intent's exact result or one enumerated
   leading-subprefix result. An ambiguous, extra, reordered, or otherwise uncontracted mutation emits no successful
   observation and leaves the operation blocked for remedy — so an interrupted land contributes nothing to the
   chain, and the reducer re-derives position from host observations rather than from the interrupted operation's
   paperwork.

3. **`DeliveryContributionChain` — terminal fact, one half of a co-owned proof, never merge authority.** Only the
   terminal reducer emits this immutable record, and it proves **this member's half only**: that the ordered
   landing observations compose the planned membership exactly, and that the resulting trees carry no delta the plan
   does not account for. It binds the repository, state and exact plan revision; projection; ordered
   landing-observation ids; the exact final destination head and tree; every member and terminal-only delta
   contribution or empty-delta proof; the review-owned verdict identity recorded for each member, seam, and non-empty
   terminal delta; the work-unit verification anchor; and a canonical contribution-chain digest. It has only a proven
   form; incomplete and stale cases remain typed reducer verdicts rather than persistent failure records.

   The record asserts no claim about the work unit being complete, because completeness conjoins this half with the
   qualification half, and conjoining is the combined gate's act. It is named for the chain it proves so the
   boundary stays visible at every callsite: a terminal record named for completion would read as authorizing one.

**The proof itself.** Over that record chain, the terminal reducer verifies:

- landing member sets are disjoint, ordered, contiguous, and cover `D1 … Dn` exactly once;
- every observed tree transition equals the contribution of the named generations, with no extra work-unit-owned
  delta;
- the terminal-delta subject carries an exact empty-delta proof, or is recorded as a non-empty change set for the
  qualification half to answer for;
- each observation matches its immutable intent and an exact result that reached the applicable interlock; and
- the final operation result and final destination tree equal the terminal chain's expected result.

For every member, seam, and non-empty terminal delta it names, the reducer asks the review system for a verdict at
that exact subject and generation and records the verdict's identity. It does not evaluate the verdict's
conditions. The integration-target projection has one such destination landing after separately proving its
internal series; the stack projection may have several. Unrelated base advances between stack operations are
legitimate new bases: they force suffix reconciliation but are absent from the contribution chain, so terminal
correctness does not compare ambient base trees at work-unit start and finish. The chain may support reporting and
downstream lifecycle queries, but it cannot authorize a merge retroactively or stand in for a required host-side
check.

## Alternatives & Rationale

**Publishing the landing intent separately, before the adapter runs.** Rejected. It would put a second durable
point on a merge's critical path; leave a permanent orphan intent for every aborted or interrupted land, since the
store is append-only; and widen the exact window the intent exists to close, by inserting a write between the
pre-landing head observation and the mutation that depends on it. What it would buy is evidence that the intent
preceded the outcome — and nothing consumes that. The check the pairing actually performs is a correctness one,
catching an operation that did something other than what it set out to do, and every such failure arises inside a
single operation on a single machine where a locally held intent catches it identically. The stronger reading, that
the pairing evidences _authorization_, is not delivery's to make: human approval is the sole merge authority and is
deliberately not turned into a delivery receipt.

**A pushed shared-ref namespace for the three decision-bearing records at v1.** Rejected. It requires three
mechanisms that do not exist today — a delivery-owned namespace, a push treating a non-fast-forward as a typed
conflict rather than unioning it, and an explicit fetch, since no configured refspec brings such refs down on a
clone or ordinary pull. What it buys is cross-machine delivery, which the single-operator scope boundary does not
otherwise require, and which the storage direction's shared tier supplies by construction. The local
version-checked, advisory-locked store already refuses a stale write, so the refusing-write requirement is met by a
shipped mechanism rather than a new one. Because each store is a port, the pushed adapter remains a later addition;
building it now would mean maintaining an interim transport whose value arrives only when an operator moves
machines mid-delivery.

**Subtask-granular task digests.** Rejected. `Goal` is the only surface the completion protocol preserves verbatim,
and it is opt-in and default-absent on subtasks, so the modal leaf would digest the empty set — leaving the
inventory digest and every member fingerprint blind to the content they exist to track.

**Requiring tasks to partition exactly once.** Rejected. Only the pre-implementation entry has the evidence to
claim exclusivity. A retrofit cut partitions _commits_, and task membership is a projection through a many-to-many
attribution map, so demanding exactly-once would force the author to invent an exclusive assignment the cut never
made — the fabricated partition the success signal exists to reject.

**Deriving candidate boundaries for the author.** Rejected. One field cut followed a module import graph, which is
language-specific analysis no language-agnostic tool performs for an arbitrary project, so a derivation proposing
boundaries would serve one project's stack and mislead the next. Composition validates well-formedness and never
well-chosenness, and proving a boundary sound belongs to the selected projection's eligibility test.

**Pre-filling the boundary slot with a derived partition.** Rejected. An unfilled slot must stay detectable and
refusable; an author who never looked at a pre-filled boundary would produce a record indistinguishable from one
who did. A member's landability is an assertion about work someone is answerable for.

**Re-deriving landed members instead of freezing them.** Rejected. A member's fingerprint reaches design-element
digests and incident-seam fingerprints, both of which move for reasons outside the member — so re-derivation would
fire refuse on the very re-cut replacement exists to perform, and would forbid amending the spec after the first
landing.

**Making segment refinement an invariant on members.** Rejected. A horizontal substrate segment followed by a
vertical slice segment is exactly the shape whose seam sometimes must be spanned for a member to leave the base
coherent, so forcing members inside segment boundaries would systematically manufacture compatibility caps.
Landability is the real constraint, and refinement is a proxy neither necessary nor sufficient for it.

**A per-member qualifier recording which landability definition was asserted.** Rejected. It would be read at
neither point that consults the field, and what a definition meant on a given day is recoverable from the
definition's history and the landing date — making the stamp a denormalized copy of a fact held elsewhere.

**Putting project scope in the `planId` preimage.** Rejected. Scope is a property of a record's address in both
storage tiers, so carrying it in the identity duplicates the container in the contents — and it would gate
construction on a value nobody currently supplies.

**Deriving `planId` from `workUnitId`.** Rejected, and this is the one place the record abandons derived identity
for a minted one. The derivation looks attractive because it makes one plan per unit true by construction, but its
preimage is the work-unit slug — there is no identity field on the metadata record — and `arc rename` mutates that
slug on an active unit. Every dependent identity hangs off `planId`, so the derivation would convert a sanctioned
rename into a silent re-mint of every member, seam, and assurance subject. Minting gives the stability the
derivation was reaching for, at the cost of enforcing one-plan-per-unit as a refinement rather than by
construction — and that refinement is sound only because the lookup resolves through recorded renames rather than
by string equality.

**Resolving a renamed unit by string equality, with a mismatch advisory as the safety net.** Rejected. The advisory
sits on the wrong side of the failure: after a rename, a lookup by the current slug misses the existing plan
entirely, so nothing is found to revalidate and no advisory can fire — the outcome is a silently duplicated plan.
Resolving through the recorded rename disposition removes the failure instead of reporting it, and composes
machinery that already exists rather than adding a detector.

**A per-slice branch list on the work unit's metadata record.** Rejected. It deepens work-unit-to-branch coupling in
exactly the direction the storage model is leaving. The answer is a boundary statement instead: **delivery refs are
not work-unit branches.** The metadata field keeps naming the unit's own branch; delivery refs live in a namespace
the delivery record owns and binds.

**Rendering the design-drift advisory as an ambient session surface.** Rejected. An always-on advisory slot fires
every session, has no per-finding acknowledgement mechanism, and blocks the integration verb until explicitly
overridden — so an imperfect detector becomes permanent noise. Design drift on landed work is decision-bearing when
someone reasons about the plan, so delivery emits it from its own reconcile and at the terminal proof, and
consuming surfaces render it.

## Cross-cutting Considerations

**Trust boundaries.** Delivery never gains review attestation authority by association: it carries review-owned
verdict identities and asks for current qualification, and delivery-host adapters are a separate contract from
review sources. Human approval remains the sole merge authority; no record produced here authorizes a merge, and
the contribution chain explicitly cannot stand in for a required host-side check. The generation monotonicity
invariant exists to prevent an earlier review conferring authority on materially different later content.

**Compatibility and migration.** Under the pre-public-release posture, nothing here acquires a migration reader or
compatibility alias; development state is regenerated rather than migrated. All records register under
strict-current posture. The v1 storage adapter is expected to be discarded rather than migrated when the storage
direction lands, which the port boundary makes a bounded change.

**Concurrency.** One operator at a time is a recorded scope boundary rather than an assumption. Only one operation
is live at a time, enforced by the `activeOperation` reservation. Every mutating write is version-checked and
refuses rather than merges. The reservation and any blocked latch stay local by design, because what they protect
against is a crash rather than a clone — an interrupted operation should be loud where it happened.

**Testing.** The success signal below is the primary integration-level check and is runnable against immutable Git
fixtures. Unit coverage is expected on identity preimage derivation and digest stability, the coverage and partition
refinements at both entries, the absorb / refuse / replacement sort including the landed-prefix byte-identity
check, seam owner derivation, generation monotonicity across teardown and re-authoring, shared task-reference parser
parity, rename-chain resolution including a cycle, and reducer admissibility. The starter map's three refusals —
unfilled slot, mutated derived value, reordered identity sequence — plus partial-pair corruption are covered
directly rather than inferred from composition's success path, since they are the mechanism that makes an authored
judgment trustworthy. The two authoring entries share composition, so composition is tested once against both
derivations. Temporary-repository real-CLI tests cover successful compose, same-plan retry after render failure,
sentinel-bounded overwrite, explicit abandon, and refusal paths that must leave published and rendered state
untouched. Git fixtures include an absorbed base, an unprovable conflict-resolution merge, and byte-preserving
rename/copy paths.

**Performance.** The reverse-lookup query is a scan over the assignment namespace at v1, bounded by the number of
plans in one repository — a handful — and stated as a query contract so a later tier may index it without changing
callers.

**Non-regression.** Chunked delivery must not degrade ordinary operations for concurrent work. The lifecycle
artifact exclusion that removes most observed damage belongs to the stack-topology member, but this record supplies
what that member enforces against, and reports which commits touch a work unit's own lifecycle artifacts without
enforcing the rule itself.

**Coordination.** Two shipped surfaces — the cohort-fit boundary method and the work-organization strategy's sizing
standard — define a stack as a cohort's dependency-ordered delivery mode and state that it is not one work unit
spread across many branches, which contradicts this cohort's amended invariant. Naming the contradiction is
delivery's, because the invariant is delivery's. The edit was routed to the decomposition-doctrine work unit on the
premise that it was already rewriting both surfaces and two editors on one bullet would collide; that premise no
longer holds. That work unit is paused pending its own cohort, and this one ships first, so routing the correction
there would ship a self-contradiction and leave it standing until a paused unit resumes. The correction therefore
lands here, bounded to the sizing statement itself, and the discriminator rebalance around it remains that unit's.
Two constraints ride along: the sizing standard ships, so the correction must remove the contradiction without
forward-pointing to an unshipped mechanism; and the recorded boundary verdict must carry its reason in a form a
consumer can read, to distinguish "stayed one unit, unremarkable" from "stayed one unit, with separable surfaces."

**A second contradiction is named here and deliberately not corrected.** The same strategy's single-branch doctrine
states that one work unit is one branch from planning through integration, merged to the base exactly once. The
amended invariant contradicts that too, and more fundamentally than the sizing bullet does — it reaches branch
identity, worktree scope, and the artifact-location rules that hang off them, rather than one comparison between
delivery shapes. Correcting it is not a wording pass, and it belongs with whoever settles what a work unit's branch
identity means once delivery refs exist. Recorded so the gap is known rather than discovered.

Three cohort divergences route the same way. The cohort's segment-refinement settlement rests on the premise that
every implementation task occurs in exactly one member in task-inventory order; this member has settled both halves
otherwise — coverage is at-least-once, and member order rides the array alone. The settlement's conclusion survives,
because the cohort also argues it from landability, which is independent of that premise. Separately, the cohort
describes the state contract as carrying each deliverable's ref and change-request handles; those are decisions and
live in the assignment record.

The third is this member's own charter. The cohort assigns it "the task-generation authoring verb" — one verb —
while this design ships two peer entries, and prices retrofit execution into two siblings by gating it on their
reducer and eligibility test. The expansion is argued in § 3 and rests on field evidence the cohort record
predates: every delivery cut with real evidence used the retrofit entry, so a single pre-implementation verb would
have failed on first contact. Because the change reaches sibling scope rather than only this member's, it routes
for the cohort record to absorb rather than being treated as wording.

## Success Criteria

1. **Both hand-run deliveries reconstruct as authored plans from immutable evidence, and the record validates
   them.** The seven-slice cut and the completed 21-row rolling session-locus delivery each round-trip through the
   `from-branch` entry, producing a plan whose members carry the boundaries actually shipped, whose seams match the
   recorded runs, and whose refinements pass without a fabricated task partition. Their base and head pairs are
   reconstructed from the recorded merge parents. The earlier thirteen-branch session-locus stack was superseded;
   bespoke closeout PR #434 is terminal archival rather than a plan member. This is the falsifiable
   check the design is most at risk of failing: both deliveries were authored after implementation, so a record
   serving only the pre-implementation entry fails it outright; both cut along change structure rather than task
   structure, so a hard task-partition refinement fails it; and both carry recorded seams, so a seam model that cannot express
   what they found fails it. Reconstruction exercises authoring and validation only, so it needs neither projection
   reducer and stays inside this member's boundary.

   **Amendment (2026-08-04).** Recorded merge parents remain the immutable coordinate evidence, but the raw PR-head
   histories are not uniformly replayable: seven contain base-merge steps whose purity strict branch inspection
   cannot establish and must refuse rather than silently classify as ambient. The `a0e6d1533` case is confirmed to
   contain authored conflict resolution. Each historical member therefore reconstructs
   from its first parent to its landed merge result as one atomic net transition, with the merge/base/head triple
   verified separately. The full seven- and 21-member plan shapes still round-trip through the real CLI, while a
   synthetic proven-pure base absorb carries the contribution-only partition check.

2. **A plan authored through `from-tasks` against a current task list and validated design inventory publishes and
   renders** its task-list projection, with an uncovered implementation task refused at composition and the
   verification task refused as a member.
3. **Deliverable identity survives revision.** A member's `deliverableId` is unchanged across an amendment that
   alters titles, adds coverage, and relabels positions; renaming a `chunkKey` on a bound member is refused.
4. **The three reconcile outcomes sort correctly against a bound plan** — a coverage addition to a bound unlanded
   member absorbs; a coverage move between members refuses; altering an already-frozen landed member fails
   byte-identity; re-cutting the bound-unlanded suffix produces a replacement whose landed prefix is byte-identical
   and whose crossing seams retain their acceptance statements. The conversion revision validates when the
   converting member equals its predecessor's payload modulo the discriminant, and is refused when it does not.
5. **Generation monotonicity holds across teardown.** Tearing down a member and re-authoring the same `chunkKey`
   yields a generation strictly greater than any previously issued for that subject.
6. **The starter map refuses a record no author actually authored** — an unfilled slot, a machine section that
   differs from its CLI-owned canonical snapshot, and a reordered identity sequence each refuse with their typed
   code; no boundary slot arrives pre-filled; and interrupted post-publication cleanup remains safely retryable.
7. **A renamed work unit keeps its plan.** After `arc rename`, authoring resolves the existing plan through the
   recorded rename rather than minting a second one; `planId` and every dependent identity are unchanged; and a
   chained rename resolves transitively.
8. **A false landing assertion is caught at the reducer.** A plan whose `landed`-discriminated prefix disagrees
   with the host-derived `landedPrefix` is refused at admissibility, and a cut whose range contains an ambient base
   merge partitions over contribution alone, with the merge carrying no membership; a base merge whose merge-only
   delta cannot be proved empty refuses rather than disappearing from the contribution.
9. **Position resolves from a member checkout** via the reverse-lookup query, in a checkout carrying none of the
   work unit's artifacts, without reading identity from any ref name.
10. **No delivery record is writable into a work unit's change set**, and every mutating write refuses a stale
   expected plan digest, assignment revision, observation revision, or assurance predecessor digest as applicable.
11. **A terminal contribution chain is emitted only when membership and tree-exactness both hold**, and it records
    review-owned verdict identities without evaluating their conditions. The assurance port declares export and import,
    and the v1 adapter round-trips a chain through both without loss.

## Open Questions

- **The shape of the verdict delivery asks for.** Delivery asks and records rather than evaluates, and a carried
  verdict identity must be stable across clones as a requirement of the assurance store's port, but the question's
  exact form — what delivery passes to identify a subject and a generation, and what shape of answer it stores — is
  a seam to agree with the cohort member owning qualification rather than to fix unilaterally here. The portability
  requirement goes to that member as an input, since the review side's identities currently derive from a per-clone
  value.
- **A durable work-unit identifier** is contributed outward rather than assumed here. Delivery is buildable without
  one — `planId` is minted and rename resolves through the recorded transition — but the underlying question is
  general, since the slug is the subject key for several subsystems. Delivery consumes a conforming identifier as
  `workUnitId` the day one exists, which is an upgrade rather than a schema change.

**One assumption is recorded here because nothing else records it.** Positional task ids are sound only if a
completed task's id keeps pointing at the same work. No rule in this project states that — the revision scheme
covers expanding a completed task without disturbing existing numbers, but deletion and reordering have no stated
constraint, and renumbering after completion is observable in shipped task lists. The exposure is narrow and real:
a landed member's `taskIds` are frozen as-of-landing, so a later renumbering repoints them at different work with
nothing comparing the two. This design's own reconcile is the sole mitigation available to it, and it is a detector
rather than a guarantee.

The durable fix is not delivery's to build: it is a per-id append-only rule enforced where task lists are already
validated at the commit boundary — an id already marked complete may not be removed or renamed, while everything
else stays free to restructure. That shape is deliberately narrower than a list-level append-only rule, which would
make task-plan authoring nearly uncommittable, and it activates exactly when the thing it protects comes into
existence, since a footer citing a task id exists only once that task has completed. Recorded here as an accepted
risk because delivery ships before that rule does, not because the gap is unowned.
