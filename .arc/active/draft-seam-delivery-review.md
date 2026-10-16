# Draft: Seam Delivery and Review Records

- **Origin:** [internal] — the `storage-seam` cut (2026-10-09); stage 2 of the storage program.
- **Purpose:** Route Candidate records and the review gate's durable records through the storage contract, storing
  only what a later session, agent, or the CLI decides from, so that from the flip a work unit's own record writes stop
  moving its head and the import carries a compact review family rather than today's shapes.

---

## Continuity

- **Readiness:** ready (`assess-draft-readiness`, 2026-10-15); adversarial passes 1 and 2 of 2 and pass 3 over the
  cap folded, the loop stopping at the cap after pass 3's fix-check rounds, and the settled draft re-read for
  coherence.
- **Entry read (2026-10-15):** `high` depth, `Class` Heavy confirmed — real design to author (the review family's field
  schemas, withdrawal) over 35 consumer-map rows and the files no row covers, composed from the contract's primitives
  and established practice rather than invented. Boundary: stays one work unit, the cut's decision (2026-10-09); no new
  evidence moves it.
- **Resolved (Owner, 2026-10-15):** what a stored record holds (§ What a stored record holds), and this member
  reroutes today's behavior rather than redesigning the review or delivery process. On the research: one compact result
  per pass (§ Review results); one decision envelope whose status is observed rather than stepped, with mechanical
  carries derived (§ Decisions); one record per adversarial pass (§ Adversarial passes); and withdrawal and retirement
  as Candidate state from the flip (§ Candidates and their boundary).
- **Resolved (Owner, 2026-10-15), after the proportionality check:** retirement follows from the work unit's end
  rather than a write of its own, and findings keep today's identity rather than gaining a content fingerprint
  (§ Alternatives); the review gate's machine-local facts are imported for live work only (§ What the import
  carries); and inbound entry 3 runs as an Errand (§ Inbound dispositions).
- **Corrected after the Owner's confirmation (2026-10-15):** live-work-only reaches the review gate's machine-local
  facts, not the tracked Candidate and boundary files, which `spec-storage-ref-backend.md` § 10.8 and § 10.11 already
  carry as state, completed work units' included (§ What the import carries).
- **Revised after adversarial review (Owner, 2026-10-15):**
    - decisions store no status, every state derived, which carries the observed-status decision one step further;
    - a decision records only a person's choice, so a project rule's verdict is derived like the mechanical carry,
      reversing the part of the envelope decision that let a policy decide;
    - a decision is keyed by its own content, its time aside, its consumption checked when a pass is admitted, with
      today's retry rule;
    - the Candidate keeps its ordered transitions whole, each naming the record it rests on, and its `--resume` token
      keeps the call's own inputs, only its judgments becoming decisions;
    - every review record reshapes at the flip, the machine-local ones with the tracked ones, reversing the decision to
      reshape the machine-local records first, so nothing changes before the flip but the checkpoint's binding
      (§ What changes before the flip);
    - applicability selections stay the Candidate's transitions with no decision record of their own, since nothing
      would read one, narrowing the census's one envelope to the decisions outside them (§ Decisions);
    - the review copy's arm stays in lifecycle classification as D18 states, withdrawing the amendment that moved it
      into subject construction; evidence records hold review responses only, a verification response staying its
      Candidate transition; and an extra pass is spent by its pass count, as today;
    - after pass 3's fix-check rounds (Owner, 2026-10-15): the pass count counts finished passes per lane; the review
      copy is evidence-neutral in every direction, against the inherited rows' reviewable add and re-export; the
      evidence record keeps its successor mark, lives on its result's work item whatever it binds, and drops the
      delivery-member binding step, since a record is bound at its first write; every lane already refuses a review
      with no vehicle, so the family adds no refusal; and how a stacked delivery treats the copy goes to
      `delivery-observe-attest`, which owns delivery's lifecycle-contribution path group.
- **Next:** `create-spec`.

**Reading this draft.** `cohort-storage-seam.md` holds the seam's coordination, its scope boundary, and how the
register's keys are cited. A `§ Shared decisions` item lives in its owner's design record: items 1–8 and 11 in
`spec-seam-record-kinds.md`, item 9 in `spec-seam-locus.md`, and items 10 and 12 in `spec-seam-lifecycle.md`. `D` and
`A` numbers are `spec-storage-contract.md`'s decisions and amendments. `notes-seam-delivery-review.md` holds the
evidence this draft cites by section: the re-verified rows, the files no row covers, the mechanisms that exist because
records ride the branch, where review state lives today, the decision-record census, the withdrawal traces, and the
prior art.

## Problem / Motivation

Each Candidate keeps two tracked files on its work branch, the record and its boundary, and every write to either is a
commit that moves the head a review subject binds. The review gate has grown mechanisms whose only job is to prove
those commits harmless: write-then-stage steps and `commit-*` next actions, replays against `HEAD` and the index,
proofs that a record-only commit moved the head (`confirmCandidateResponseHeadContinuation`, whose port is threaded
through ten other modules), digests guarded from the work unit's own writes (`candidateProjectionPaths`, key 34), and
Owner judgments carried inside a `--resume` command string (`buildPrePublicationResumeCommand`) — notes, § Mechanisms
that exist because records ride the branch. The store removes their cause, and its first half already exists: the
contract registers `review/candidate` and `review/integration-boundary` (`lib/store/registry.ts`) and the in-repo
backend implements them (`landTracked`, `lib/store/in-repo/write-stores.ts`), but every caller still imports the record
stores directly.

The review gate's own records already live off the branch, under the Git common directory, but D5's line between
stored facts and working state runs through those records rather than between them. Operation records hold pass
counts, sealed hosted results, settlement evidence, and pass authorizations that publication is gated on
(`LaneProgressStateSchema`); durable records point into machine-local stores (`ApprovedDispositionSourceSchema`); and
seventeen shapes record a decision about an exact review subject, each with its own fields, reach, and lifecycle, two of
them in no record at all — notes, § Where review state lives today and § Decision-record census. Withdrawal is not
recorded, so a reopened work unit keeps its publication authority — notes, § Withdrawal, reopen, and retirement.

Two of the program's members wait on this one. The ref backend's import refuses until this member says which review
record becomes which kind (`spec-storage-ref-backend.md` § 10.8), and the flip waits on this member's arms
(`spec-seam-locus.md` § 16). Storing today's records as they are would build parsers, write checks, and import mapping
for fields `review-orchestration-right-sizing` is set to cut.

## Delivery and review records

### What a stored record holds (Owner, 2026-10-15)

ARC records no more than the tools it sits beside would, except where a session, an agent, or the CLI needs the record
to compute something — the "what to record" of `DEV-RULES.PROJECT` § Stop routing, applied under
`cohort-state-storage.md` § Soft coordination, "The final shape over today's". D5's split between stored facts and
machine-local working state carries the rule to every field:

- a field is stored only when it must outlive a session or a machine and something reads it later to decide;
- a mechanism that exists because records ride the branch gets no stored schema — today's in-repo arm keeps it until
  the flip deletes it;
- process bookkeeping beyond that — pass counters, phase markers, retained-attempt state — is derived or stays
  machine-local working state, so `review-orchestration-right-sizing` can reshape orchestration with no store migration
  or import change. A choice someone made, which some of that bookkeeping carries today, is a decision (§ Decisions).

Lean toward storing less: until the first public release a field can be added in place, while parsers, writers, write
checks, and import mapping built for a field later cut are waste. The import sets the floor
(`spec-storage-ref-backend.md` § 10.8): which review record becomes which kind, how its work item and key resolve, and
what a fact with no live owner becomes. Lanes, pass policy, the correction loop, and the integration path stay with
their owners.

The family from the flip:

| Kind                          | One record per                        | Keyed by                                    | Holds                                                                                                                                |
| ----------------------------- | ------------------------------------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `review/outcome`              | attempt at a review pass, either lane | its attempt (`attemptId`)                   | the attempt's result (§ Review results)                                                                                              |
| `review/evidence`             | response to a review result           | its disposition set                         | the response's approval, performance, settlement, resolved request, and its predecessor and successor sets (§ Responses to findings) |
| `review/decision`             | choice a person made                  | a digest of its content                     | the decision envelope (§ Decisions)                                                                                                  |
| `review/adversarial-pass`     | adversarial planning or criteria pass | its activity and the work item's pass count | a typed header and the report as prose (§ Adversarial passes)                                                                        |
| `review/candidate`            | work item, its current Candidate      | its work item                               | attestation, subject, ordered transitions, and state, `withdrawn` among them                                                         |
| `review/integration-boundary` | work item, its publication boundary   | its work item                               | locus, hosted reservation, next action, and readiness binding                                                                        |

Three forward amendments to D5 follow, written in this member's spec: `review/terminus` becomes `review/decision`,
which also amends the ref backend's layout table; an adversarial pass becomes one record of its own shape rather than
records sharing the review gate's; and that record holds no next-pass authorization for a launch to consume
(§ Adversarial passes).

Every kind is keyed to its work item (`lib/store/catalog.ts`). The Candidate and its boundary are one record each per
work item (`singleton("work-item")`), so a Candidate's supersession is its record's history, read through `history` at
store versions (key 02). The rest are keyed records on the work item's ref, an Errand's on the Errand's, each keyed by
an identity it already has or a digest of its own content, so a repeated write collides rather than duplicates, and a
decision's lineage is its work item. Delivery and review records are single-writer kinds. A result or a decision is
written once, by a create-only write (`expected: null`, `lib/store/write.ts`) that refuses `version-conflict` when the
record exists; an evidence record is written at its approval and updated in place, against its expected version, as
its response is performed and settled and when a successor set is approved over it. Two machines' writes of one record
meet as a conflict record at sync (D6).

A result lives on the work item its lineage names (`LaneSubjectLineageSchema`, `core/lane-admission.ts`) — a
Candidate's, a delivery member's, or a head-bound vehicle's (`vehicleKind`) — and its evidence on the same one. Every
lane refuses a review with no vehicle before admission today: the local lane with `vehicle-unresolved`
(`resolveLocalReviewVehicle`, `hosts/local/review-authority.ts`), the frontline lane when its lineage resolver finds no
work unit or Errand (`resolveLineage` in `defaultFrontlineResolveDependencies`, `handlers/review.ts`), and the hosted
lane when it finds no active work unit or explicit vehicle (`resolveHostedProgressContext`). Every lane-progress write
passes its admission's lineage, so the `review-target` default in `laneProgressOperationId` (`lane-progress.ts`) serves
only reads that omit one. Every result therefore has a work item, and the family adds no refusal.

Every stored record carries portable identities: the project ID, which the import adopts from the review gate's
repository ID, minted per clone (`spec-seam-lifecycle.md` § 5.3); its work item's UID, which the import mints and
resolves from the slug or vehicle today's records name (`WorkItemRef`, `spec-seam-record-kinds.md` § 7.1, does the same
for lineage); the Candidate's ID, a digest (`CandidateIdSchema`, `policy/integration-boundary-locus.ts`); and subject
digests. No stored record names a machine-local locator: a source record's name derives from one
(`sourceRecordName`), so a durable record cites a source by its `sourceDigest` where it needs one, and another record by
its stored reference, never by the positional or machine-local references `ApprovedDispositionSourceSchema` holds today
(`receiptRef`, `localSourceRef`, `outcomeRef`, `attemptRef`).

### What changes before the flip

The seam's rule is today's behavior until the flip (`cohort-storage-seam.md` § Soft coordination), and this member
keeps it with no exception. Before the flip it:

- **routes Candidate and boundary callers through the contract,** whose in-repo backend already stores both
  (`landTracked`), rerouting their hand-built paths (key 13) and keeping every mechanism that exists because the
  records ride the branch as today's in-repo arm;
- **binds the integration checkpoint to what it attested,** the lifecycle records plus the code head, with merge
  comparing those rather than the whole lifecycle version `merge.ts` compares today — an ordering this member inherits
  (key 48; `cohort-storage-seam.md` § Soft coordination, "Ordering the flip carries"). Without it, once state is
  shared, any unrelated write between checkpoint and merge would stale the checkpoint;
- **builds the family's field schemas, the import's mapping table, and the flip-time arms,** each arm branched on the
  contract's one capability (`stateOffBranch`), so the flip turns them on.

The review gate's machine-local records keep today's shapes and stores until the flip, when every review record
reshapes at once: the import maps the machine-local ones from today's shapes as it maps the tracked ones (§ What the
import carries). No reader before the flip needs the new shapes, so nothing is cleared or migrated before it, and
`standardLaneOwnerVersion` guards publication as today until the readiness binding replaces it (§ Candidates and their
boundary). `storage-ref-backend` learns which records its import maps, and how (§ Coordination).

### Review results

One `review/outcome` per attempt at a pass, in both lanes, frontline and standard, from every source — a local
evaluator, a provider, or a hosted review. It holds the subject reviewed, the lane, the source or provider, who and what
ran it, the coverage, the verdict, and the findings. It replaces the frontline outcome, the receipt ledger's entries
(`ForwardReceiptLedgerRecord`, one repository-wide record with positional references, whose entries become one record
each), and the sealed hosted results and `completedPasses` that lane progress holds today.

- **Bound to what it reviewed.** The subject is the review subject's digest with the tree it was taken from, and the
  commit and first parent where one exists, so a later reader computes how a subject moved without a stored
  movement record, as a GitHub review binds `commit_id` and a check run `head_sha`.
- **Append-only, with a format version.** A result is never rewritten. One that no longer carries to a later subject
  stays, read as outdated, as Gerrit keeps an outdated vote; nothing deletes evidence.
- **One record per attempt.** A result is keyed by its attempt (`attemptId`). An attempt that did not finish — timed
  out, stale, or failed — keeps its result, and its retry shares its logical pass under the next retry generation. A
  lineage's pass count in each lane is the number of distinct logical passes among its finished results in that lane,
  clean or with findings, as each lane's `completedPasses` counts only the attempt that produced a pass's terminal
  result today (`terminalProducer`, `validatePassCounts` in `core/lane-progress-state-validation.ts`); an unfinished
  attempt's result counts toward none.
- **Findings keep today's identity.** A finding's `findingId` is the provider's, or a digest of its whole content
  (`normalizeFinding` in the CodeRabbit frontline agent), and a recurrence is declared (`recursFindingId`,
  `core/finding-records.ts`). Where a provider's identity is stable across passes, as a host's review thread is,
  recurrence follows from it. A content fingerprint, as SARIF's `partialFingerprints` are, suits a deterministic
  analyzer; a language-model reviewer rewords a finding between passes, so a fingerprint would miss recurrences or match
  wrongly, and its recurrence stays declared.
- **A hosted result is sealed like any other:** its findings, coverage, and verdict, with the admitted attempt's
  binding its digest covers — the admission, request handle, target, requested and effective coverage, and requirement
  (`HostedResultDigestPreimageSchema`) — under its content digest (`hostedResultId`). Settlement checks each finding it
  settles against those findings (`lane-progress-hosted-settlement.ts`) and coverage validation reads that coverage
  (`lane-attempt-validation.ts`), so neither reads back from a host comment someone can edit. The result also keeps its
  host locator: the host review's identity and the SHA it reviewed.
- **Who and what ran it.** A local attempt's result keeps its author and evaluator identities, its policy binding
  digest, and its request and attestation mechanisms (`retryOperationContract`, `lane-progress-conditional.ts`), which
  today live in its `local-review` operation record. A retry under a consumed authorization is checked against the
  unfinished attempt's result for those, as `assertConsumedRetry` checks them today, since from the flip the operation
  record keeps only in-flight state.
- **An admitted attempt names the decision that admitted it,** where one did — a conditional pass after an approved
  fix — from its admission, so its result carries the citation that decision's consumption derives from (§ Decisions).
- **Pass counts derive** from a lineage's finished results. Operation records keep only in-flight execution state:
  the attempt under way, its lock, and its materialization. From the flip they live in a namespace of their own, apart
  from today's `review-gate/operations/`, so no clone's leftover records of today's shapes ever reach the new schemas,
  which refuse a snapshot holding one (`readOperationSnapshot`, `hosts/local/operation-state-store.ts`); today's
  folders stay inert on every clone, and the deletion pass may remove them.

### Decisions

One envelope carries every decision about a review subject outside the Candidate's own selections: **subject, choice,
decided-by, decided-at, basis**.

- **Subject** — the exact review subject decided on, by its digest, on the vehicle's work item; the kind's reach
  decides which later subjects it binds.
- **Choice** — the decision's kind and value: an extra pass, the one after the pass count it was decided at; an
  accepted terminus; a lane skip; or the withdrawal of an earlier decision.
- **Decided-by** — the person who chose, by configured identity.
- **Basis** — what the answered offer was computed from — a record version, or for a terminus the pass count and
  results its offer counted — and the results or evidence it cites.

A decision is keyed by a digest of its subject, choice, decider, and basis, never its time, as a conditional pass
authorization's ID leaves out `capturedAt` (`computeConditionalPassAuthorizationId`), so recording the same decision
twice is idempotent and a retry never makes a second record. A withdrawal is keyed the same way, citing the decision it
withdraws. For a conditional pass authorization the key is today's `authorizationId`, which digests just those fields,
so the requests, admissions, and resolved policy requests that cite it
(`ceilingOverride.conditionalPassAuthorizationId`) still resolve after the import. A second answer to one offer
refuses as it does today: a terminus answer when the recomputed live offer differs (`readCurrentOffer`) or the member
already carries a different terminus (`record-conflict`, `policy/delivery-review-terminus.ts`), since from the flip a
terminus writes no boundary whose version could move. No offer identity is stored. A decision the import maps carries
a decider and a time only where its source recorded them.

It replaces the shapes the census found (notes, § Decision-record census):

- pass authorizations — the ceiling override, the additional pass, and the conditional pass after an approved fix,
  one extra-pass decision with three preconditions;
- the Owner-accepted termini, singleton and per delivery member, one shape in two containers, and the Owner-directed
  review stop an Errand takes in conversation today, which the same shape serves once Errands take a terminus;
- lane skips — the frontline skip marker and a `skip` invocation, which are interconvertible.

These go: the fix authorization's own shape, which `createFixAuthorization` derives from the approval; the
confirmation action (`CandidateResponseConfirmationActionSchema`), which merge recomposes from durable records and
compares (`confirmCandidateResponseAction`) rather than reads; the `--resume` token's judgments and their scrubbers
(`consumeOwnerAcceptedTerminus`, `consumeFrontlineCeilingOverride`); the redundant `nextPass`; and the legacy receipt
payloads, which have no writer.

Three census shapes stay outside the family. Applicability selections, for review and for verification, stay the
Candidate's transitions (§ Candidates and their boundary): each already carries the envelope's fields — its target, its
choice, `selectedBy`, and the projection and residual digests it was chosen against — and the Candidate's fold and its
readers read the transition, so a record of their own would be read by nothing. A second answer to a selection offer
refuses on the Candidate or boundary version the offer was computed from (`expectedRecordVersion`,
`expectedBoundaryVersion`) while an exact replay passes, as `lib/work-unit/candidate-applicability-resolution.ts` checks
today. The checkpoint approval with the Errand merge interlock is an exact-head merge authorization, the integration
path's, whose checkpoint record stays machine-local. A `force` invocation (`FrontlineInvocationOverride`) is a per-call
routing input, replayed through the boundary's next action as today (§ Candidates and their boundary), never a
decision.

**Decisions are never rewritten, and no status is stored.** A later decision of the same kind within the same reach
supersedes an earlier one, and withdrawing a decision is itself a decision, so every state a decision has is observed,
as Kubernetes conditions are, never a step of a stored machine:

- **Pending** is an offer the CLI emits and does not store. It carries the version of what it was computed from, and
  an answer against a version that has moved refuses, as a reused idempotency key with different parameters does.
- **Bound** is derived: a decision binds a subject when the subject falls within the decision's reach.
- **Consumed** is derived. An extra pass binds the pass count it was decided at and admits only the next pass. An
  attempt at that pass that did not finish spends nothing, so its retry runs under the same decision; once the pass has
  a finished result, the decision admits nothing further. Today an additional pass drops once the count passes the one
  it was decided at (`withCeilingOverride`, `policy/pre-publication-request.ts`), and a ceiling override refuses once
  the count moves past the pass it admitted (`pass-count-mismatch`, `resolveInvalidOverrideReason`) while still
  applying to the resolution of that pass's own result (`compatibleTerminalGrants`,
  `policy/review-policy-evidence.ts`). An extra pass already used therefore reads as spent, imported or not. A
  conditional pass after an approved fix is also consumed by the attempt citing it (§ Review results), checked when
  the attempt is admitted, before the pass runs, as `bindConditionalPendingAdmission` checks it today: a consumed
  authorization admits only a retry after an attempt that did not finish, under the same source, scope, coverage,
  actors, and policy.
- **Superseded or withdrawn** is derived from the later decisions within its reach. A conditional pass authorization
  also ends when a successor disposition set for the same result is approved, refused once the authorization is
  consumed (`invalidateConditionalNextPassAuthorization`, `inspectConditionalNextPassInvalidation`), as today. Which
  later decisions end an Owner-accepted terminus is `review-source-authority`'s.

**Reach is the decision kind's,** not each record's, and this member keeps today's. A standard-lane ceiling override
reaches its lineage at the pass count it was decided at, on any later subject, as `withCeilingOverride`
(`policy/pre-publication-request.ts`) rebinds its target to the current one today; an additional pass reaches the head
it was decided on (`additionalPassAuthorization.headSha`); a frontline ceiling override reaches only the frontline
head it was decided on; and the conditional pass after an approved fix, decided before the fix exists, reaches the
head that fix produces, a continued head included (`bindConditionalPendingAdmission`). An applicability choice
reaches its exact subject. A lane skip reaches the Candidate's lineage, as frontline closure carries across supersession
today (`frontlinePhaseClosed`), and from the flip an Errand's skip, which today leaves no record, is kept and reaches
its Errand. The Owner-accepted terminus's reach, and what invalidates it, are `review-source-authority`'s, in its held
entry "Make an Owner-accepted review terminus bind thereafter, across every lane and every later subject"; whether an
Errand takes a terminus is `review-orchestration-right-sizing`'s held entry "Give exact Errand targets an
Owner-accepted review terminus". This member stores the terminus in the envelope, whatever reach it is given.

**Decided-by records the identity each path resolves today,** and this member adds no check. Termini resolve their
author through `readOwnerTerminusAuthority` (`policy/pre-publication-composition.ts`), which requires `arc.identity` to
be the work unit's owner, with a completed work unit's owner as the fallback (`acceptDeliveryReviewTerminus`,
`handlers/review.ts`). A local disposition approval resolves its approver through `resolveLocalReviewAuthority`
(`hosts/local/review-authority.ts`), which requires the owner for a work unit and takes the active identity as an
Errand's author; a frontline or hosted one through `resolveFrontlineActors` (`runtime/respond-composition.ts`), which
takes the active identity unchecked; and a conditional authorization must name that approver. The applicability
selections' `selectedBy` is caller-supplied. The ceiling override, the additional pass, and a lane skip resolve no
identity today (`recordSingletonFrontlineInitialSkip` takes no actor), so from the flip they record the active identity
unchecked, as a frontline approval does, and an imported one carries none. Each is a configured identity, not a
credential, so ARC claims no more than that, under the external-seam enforcement test (`DEV-RULES.PROJECT`
§ Engineering Standards).

**A mechanical carry is derived, never decided.** Whether earlier review carries to a moved subject is computed by the
existing reducer (`reduceEvidenceApplicability`, whose verdicts are `carries`, `supplemental`, and `fresh`), as Gerrit's
`copyCondition` and GitLab's patch-ID comparison compute it. A decision record exists only where someone chose. A
project rule that computed applicability would be derived the same way, so `review-orchestration-right-sizing` can
replace the attended covered-or-review-required choice with one and store nothing new.

**The frontline window.** Today a singleton's initial frontline skip is a marker keyed by Candidate ID
(`recordSingletonFrontlineInitialSkip`), read across the Candidate's supersession ancestors, so an Errand's skip leaves
no trace. With the skip a lane-skip decision on the vehicle's subject, reaching its lineage, the window's closure
derives from the vehicle's records — a skip decision; a terminal frontline result that closes it, clean or settled
findings whose advice is to stop; or the standard lane's first attempt, in flight or recorded — as
`frontlinePhaseClosed` already derives it, reading the Candidate-keyed marker for the skip. From the flip the marker
goes with its record kind, operation-ID domain, and schema ID; an Errand's skip is kept and closes its window; and the
derived view takes the Owner's name, "window", for the one-time opportunity before the change request, so the
`frontline-phase-closed` diagnostic and the policy driver's `phase-closed` skip reason are renamed, though no workflow
text names either. The names it touches are in the notes, § Where review state lives today.

### Responses to findings

One `review/evidence` record per review response, keyed by its disposition set (`dispositionSetId`, which the
Candidate's review response cites as `dispositionId`). Each lives on its result's work item and names what it responded
on, as the disposition binds it today — a Candidate, an Errand, a delivery member, or none of them, as
`settleNewApprovedResponse` writes one when the source names no delivery member, no single Candidate matches the
reviewed head (`readCandidateLineage`, `runtime/respond-composition.ts`), and no Errand is open — and holds the
disposition set, its approval, and its performance — when it was performed, the head it produced, and the Candidate
response it made (`LaneResponsePerformanceSchema`) — with a hosted response's settlement: each finding's disposition
and the host comment, thread, and reply it settled through (`settlementEvidence`, `HostedLaneAttemptBindingSchema`). A
verification response has no evidence record: a delivery fix writes it only as a Candidate transition
(`createCandidateVerificationResponseEvidence`, `lib/delivery/review-fix.ts`), every reader reads that transition, and
no review-gate record of one exists today.

Each record names its predecessor set, and approving a successor marks it on the predecessor in the same `batch`, an
in-place update against the predecessor's expected version, as a lineage node's `successorDispositionSetId` marks it
today, so the succession stays linear as the disposition record's one compare-and-swap keeps it
(`isDispositionSuccessorAdvance`): a second successor to one set refuses, or meets the first as a conflict record at
sync (D6). The current set is the one no record succeeds, and the succession replaces lane progress's
`dispositionSetLineage`.

A review response's record also keeps the policy request its response was resolved with, as the disposition record does
today (`responsePolicyRequest`, `ApprovedDispositionLineageNodeSchema`): a snapshot of what the response was resolved
against, which the checkpoint's settlement replay (`lineage-review-composition.ts`), a delivery fix's continuation
(`lib/delivery/review-fix-continuation.ts`), the head-continuation proof, and `arc review respond`'s replay
(`respond-command.ts`) read, never a decision of its own. `policyProjectionPending` stays the record's state until that
projection completes, as today: the settlement replay, the pre-publication request (`pre-publication-request.ts`), and
`arc review respond`, which clears it, read it.

The evidence record's write check carries today's in-place rules for what moves into it, the spec listing them: three
of the four advances the disposition store accepts (`appendDispositionRecord`,
`hosts/local/disposition-record-store.ts`) — `isFixResponseAdvance`; `isDispositionSuccessorAdvance`; and
`isPolicyProjectionAdvance`, the one step at which the request snapshot may still be corrected — and lane progress's
rules for response performance and settlement (`assertResponsePerformanceTransitions`,
`isCandidateResponseBindingAdvance`, `assertHostedTransitions`; `hosts/local/operation-state-store.ts`). The fourth,
`isExactDeliveryMemberBindingAdvance` (`core/advisory-records.ts`), binds a delivery member onto a record written with
no binding, and is not carried. `arc review respond` resolves a record's binding at its first write, from the response
binding or the source's own admission (`hostedAttempt.vehicle`, `deliveryAdmission.vehicle`;
`settleNewApprovedResponse`), which a replay reads again, so from the flip no record is written unbound and bound
later. The step serves records written before a local admission carried its member: on 2026-10-15 none of the
store's 207 disposition records in today's shape awaited it, each bound to a Candidate or an Errand.

It replaces the approved-disposition record with its embedded fix authorization and consumption, and lane progress's
response performance and settlement. The Candidate's review-response transitions name it by its key and keep the
approval their IDs digest (§ Candidates and their boundary). `DispositionApproval` keeps its content-addressed
approval and its rule that proposer and approver differ; the census found that precision defensible.
`REVIEW_DURABLE_RECORD_INVENTORY` then lists what is stored, rather than three records that persist only inside
another.

### Adversarial passes

One `review/adversarial-pass` record per pass, keyed by its activity and an ordinal counting the work item's passes of
that activity across every loop, so a re-entered loop never reuses a key. Its activities are the method's planning and
criteria fire-points: draft readiness, spec finalization, task-generation finalization, a design amendment's footprint,
verification, and the task loop's criteria passes. It is written by one verb call at the disposition approval, within
D5's bound: the CLI derives the artifact versions, pass number, and lineage, publishes its input schema, and refuses
malformed input naming the expected shape. The record is a small typed header — the activity, the artifact versions
reviewed and the code head where it reviewed code, the rubric's identity, `Pass N of M`, who approved the dispositions
and when, any over-cap approval, the stop reason, and one disposition per finding — with the evaluator's report and
each finding's account as prose. Fix-check rounds, finding origins, and the author's corrections ride the prose, so how
much of them becomes typed stays with `review-orchestration-right-sizing`'s held entries on the recording verb, with no
schema change here. A later pass's prior findings are composed from the records; launching a pass consumes nothing,
since a pass over the cap carries its own approval. The method's fire-points switch to the verb in the flip rewrite.

### Candidates and their boundary

From the flip `review/candidate` holds the Candidate's attestation whole (`CandidateAttestationV1Schema`, whose every
field its ID digests — the work unit, subject digest, base revision, attester and time, verification evidence, and the
Candidate it supersedes), its subject, its transitions and lineage attestations, and its state; its supersession is the
record's history. The transitions stay one ordered log in the record, as today, because its reducer folds them in order
(`reduceCandidateDurableBaselineRecord`) and its schema's checks span them (`CandidateManagedRecordV1Schema`). Each
transition stays whole, the applicability selections among them (§ Decisions). A response's ID (`responseId`,
`verificationId`) digests every other field of its transition, the approver or verifier included, so keeping them
keeps every ID, and the lineage attestations and lane progress's `candidateResponseId` that cite one still match. A
review response already names its evidence record by that record's key, its disposition set (`dispositionId`), so its
approver sits in both the transition, whose ID needs it, and the evidence record; a verification response is its
transition alone, with no evidence record (§ Responses to findings). The chain walk
(`resolveCandidateSupersessionAncestors`) reads predecessors' transitions from the record's history, as today.

`review/integration-boundary` keeps its locus, its hosted reservation, its next action, and its readiness binding. The
next action names its command, which status renders (`handlers/status/lifecycle.ts`), and cites records by stored
reference. Where it re-enters pre-publication, its `--resume` token (`buildPrePublicationResumeCommand`) keeps the
call's own inputs as today — self-review settlement, change-set facts, scope mode and judgment target, and a `force`
invocation — while its judgments become decisions. The frontline ceiling head goes, with its scrubber
(`consumeFrontlineCeilingOverride`) and its check that keeps an override off a moved frontline head
(`withCeilingOverride`, `policy/pre-publication-request.ts`), since the frontline override decision's reach, the
frontline head it was decided on, binds it. The termini, the copied policy envelope
(`CandidatePolicyReviewBoundarySchema`'s `policy`, carrying a second terminus, `completedPasses`, and
`attemptedSources`), and machine-local operation IDs and positional sources (`responseOperationId`, `responseSource`)
go, recomputed from outcomes and decisions; the spec lists the boundary field by field.

- **The readiness binding replaces `standardLaneOwnerVersion`.** Publication refuses when standard review progress
  changed after readiness was recorded, by comparing the standard lane's progress-record version in
  `authorizeSubmission` and `authorizeActivePublication` (`lib/work-unit/verbs/publish.ts`), the publication claim
  (`handlers/lifecycle-delivery-review.ts`), and in `handlers/review.ts` both readiness's own write and the re-entry
  over an advanced boundary. That version moves on every write to the lane's progress record, a pass admitted but not
  yet finished among them (`recordLocalPendingAttempt`). From the flip those facts are records of their own, so the
  boundary binds a digest of the current listing of the standard lane's results, evidence, and pass authorizations —
  what lane progress holds today, each record's key and version — and of the lane's in-flight attempts; termini,
  selections, and lane skips stay outside it, as today. Each of those sites recomputes it and refuses on a mismatch or
  an incomplete listing. Until the flip the version guards publication as today.
- **Withdrawal is recorded.** Reopen withdraws the pull request (`withdraw-pr`,
  `lib/work-unit/lifecycle-transitions.ts`) but leaves the Candidate and its `publication-pending` boundary, so
  `authorizeActivePublication`'s `publication-pending` arm admits it again and a no-change `arc attest` re-carries the
  boundary. From the flip, reopen (`runReopen`) marks the Candidate `withdrawn`, a row this member adds to lifecycle's
  verb after it lands: publication then needs a new authorized boundary, a successor with history kept, while an
  interrupted publish — a Candidate in `publication-pending` and not withdrawn — keeps its continuation. Withdrawal ends
  publication authority only; decisions on the lineage stay, with the reach § Decisions gives them.
- **A re-root keeps the Owner's decisions.** Today a re-root after code changes overwrites the boundary, the terminus's
  only home, and drops it. With decisions their own records, keyed to the lineage, nothing a re-root writes removes one.
- **A work unit's end retires its Candidate,** with no write of its own. The review records ride the work item's ref,
  which the ref backend moves under `refs/arc/history/work/<uid>` when the item ends — archive, abandonment, or a cut
  (`spec-seam-lifecycle.md` § 19) — out of the live tips every listing reads. Today 54 tracked files under
  `.arc/system/.internal/candidates/` — 27 records and 27 boundaries, every one for an archived work unit — outlive
  their work units, since the record store has no delete. A reader that acts after archive, as the integration
  checkpoint and merge do under `with-integration`, reads the ended item's records by its work item, as completed-item
  reads allow (shared decision 13).
- **Before the flip, no exception:** today's withdrawal and retirement hold, and the tracked files stay where they are.
- **The singleton wedge (key 34) closes at the flip,** when records leave the branch and a work unit's own writes stop
  moving its head; no archived-singleton continuation is built before it. It arises only under
  `archive.cadence: with-integration`, and WORKING-MEMORY's checkpoint entry carries the workaround until the flip. From
  the flip, recovery authority binds typed Candidate and lifecycle records, never whether a meta sits under `active/` or
  `completed/`.

### What the import carries

The tracked Candidate, boundary, and transition records are state, which the import carries
(`spec-storage-ref-backend.md` § 10.8): each Candidate's every version replayed on its work item's ref, and a completed
work unit's records landing on its history ref as archive leaves them (§ 10.9, § 10.11). § 10.8 lands the review
gate's facts by this member's mapping, but reads only the gate's `evidence/` and `outcomes/`; the mapping widens that
read to `operations/`, splitting each lane-progress record's durable facts from its attempt state, and lands
`review/decision` beside the two kinds § 10.8 expects (§ Coordination). What this member decides is what the ref
backend left to it: which review record becomes which kind, and what a review fact with no live owner becomes.

Live work is any work item a later verb may still read to decide: open Errands, and work units neither abandoned nor
cut, unless both archived and merged. A work unit merged but not yet archived, routine under `archive.cadence: manual`,
is live, and so is one archived and awaiting merge under `with-integration`. Under the manual cadence archive follows
merge, since merge readiness refuses a work unit already archived there (`wrong-cadence`,
`scripts/review-gate/readiness.ts`); otherwise merged is locus's test, the branch in base by patch identity
(`isLandedInBaseStrict`, `spec-seam-locus.md` § 2.1).

- **The review gate's machine-local records map to the family for live work only,** from today's shapes. Frontline
  outcomes, receipt entries, and lane progress's sealed results become outcomes, a local attempt's taking its actors
  and policy from its `local-review` operation record; approved-disposition records, with lane progress's response
  performance and settlement, become evidence, one record per disposition set naming the predecessor its lineage gave
  it (`predecessorDispositionSetId`) and, where one was approved over it, its successor (`successorDispositionSetId`);
  and lane progress's conditional pass authorizations and the frontline skip marker become decisions. An
  authorization's stored status maps to the facts its state derives from: a consumed one's admitting attempt, which
  `admissionId` names, cites it in its outcome; a withdrawn one gains a withdrawal decision from `withdrawnBy` and
  `invalidatedAt`; and a superseded one stays derived from its successor disposition set's evidence. No review
  attempt is in flight on the importing machine: the cutover's quiesce finishes every one there, beside the review it
  already finishes on every other machine, and the import's trial lists one it finds and refuses (§ Coordination).
  Facts of work that is not live are not imported: a shipped change's review lives on in its pull request on the host
  and in the commits that carried its records, and nothing reads an ended item's facts to decide (notes, § Withdrawal,
  reopen, and retirement). A disposition with no binding lands on its result's work item, which every result has
  (§ What a stored record holds). Records in an older shape, which today's reader skips (`parseEnumeratedRecord`,
  `hosts/local/disposition-record-store.ts`), are left behind: 192 of the store's disposition records on 2026-10-15.
- **A live work unit's Candidate and boundary map, every replayed version,** so its chain reads in one shape. The
  Candidate keeps its transitions whole, its selections and verification responses among them, and each review
  response's approval joins the evidence record for its disposition set, which also holds the machine-local approval
  the import maps, so one disposition set yields one record; a review response that later versions repeat maps once,
  at the first version holding it. The terminus and the token's judgments become decisions, an extra pass the
  lineage has already used reading as spent by its pass count (§ Decisions). The boundary's readiness binding is
  computed over the imported records only when its `standardLaneOwnerVersion` equals the standard lane's current
  progress version; otherwise, the field's absence included, the boundary is left unbound, so publication refuses and
  readiness records again, as today (`authorizeActivePublication`). The Candidate and boundary keep what
  § Candidates and their boundary gives them. Records of work that is not live land unmapped, so the 54 archived
  Candidate and boundary files arrive in today's shape on their history refs, where an ended item's records are
  retired by derivation.
- **`history` returns each version's content unparsed** (`HistoryEntrySchema`, `lib/store/contract.ts`). A live chain
  is mapped whole, so a chain walk meets one shape, and nothing walks the chain of work that is not live to decide.

The import's mapping and its refusals stay `storage-ref-backend`'s; this member supplies the kinds' field schemas and
the mapping table.

### Delivery at the flip

- **`arc attest` refuses on a paused work unit,** naming `arc resume <slug>`, reading the pause record `seam-lifecycle`
  adds (`spec-seam-lifecycle.md` § 8.2). Today it writes `Current Workflow` on an Active work unit through
  `setMetaBulletFields` (`handlers/lifecycle-delivery-review.ts`), with the values `ATTESTED_ORIENTATION` supplies
  (`lib/work-unit/verbs/attest.ts`).
- **A task's captures read as the branch commits they match,** by SHA or by copy key, each once, through the close's own
  matcher, its keys from `lib/git/copy-key.ts`, which `seam-lifecycle` adds, rather than the entries, since a capture a
  rewrite replaced stays among them (`spec-seam-lifecycle.md` § 9.1, § 19).
- **Links name the project ID.** The landing writes the work unit's landing-commit link (`landingCommit`,
  `LinksSchema`) when its merge lands, which locus reads under `with-integration` to tell an archived work unit
  awaiting merge from a retired one (`spec-seam-locus.md` § 2.1, § 16). Its repository is the project ID, read through
  the port the lifecycle change injects and the cutover binds; the hosted path's `owner/repo` stays a host locator
  inside the hosted result. No verb writes a change-request link today: a workflow step opens the pull request
  (`gh pr create`, `integrate-work-unit.md`), and archive records it only as the meta's `PR URL`
  (`lib/work-unit/verbs/archive.ts`). Whichever verb the flip's rewrite gives that step writes the link, naming its
  repository the same way.
- **Locus's expected arms** (`spec-seam-locus.md` § 16): the review gate's arm for its reads of the Errand index
  projection, the integration checkpoint's for its reads of the composed lifecycle index, and `arc status <slug>`'s
  operational-boundary read (`resolveSlugOperationalBoundary`, `handlers/status/lifecycle.ts`), which also restores the
  interrupted-publication hint that lifecycle's store-backed status drops (`integrationBoundary: null`).
- **D18's export.** The Candidate review subject becomes the code in the Git index alone from the cutover (D18).
  `collectGitCandidateSubject` (`lib/work-unit/git-candidate-subject.ts`) selects reviewable entries through
  `classifyPathTreatment(path, context)`, whose context carries the work unit and its projection paths, and whose
  work-unit arms the cutover removes once their consumers move off them. This member builds D18's export, effective at
  the flip, since until then specs ride the branch: `storage.track_design_docs`, the copy at `.arc/specs/<slug>/`, and
  the `merge-ok` check. One export function writes the copy at the points D18 names, each a ceremony that already
  commits on the branch: `arc attest` adds it before fixing the subject, the review-fix path (`arc review respond`)
  re-exports it when a fix amends the stored spec, and a candidate-tail step the flip's rewrite adds deletes it
  (§ Coordination). The delete must not reopen review, so lifecycle classification keeps the one arm D18 names: the
  work unit's own export path is evidence-neutral, as its design artifacts are today
  (`isWorkUnitArtifactOrCompanion`, `lib/evidence-applicability/path-treatment.ts`). No code knows the export path
  yet, so the export brings that arm to `classifyPathTreatment`. The arm classifies by path alone, and the subject
  digests reviewable entries only (`createCandidateSubjectSnapshot`), so adding, re-exporting, and deleting the copy
  all leave the subject unchanged; the copy reaches review on the pull request, where D18 has design artifacts reach
  review only through the export. The inherited rows that keep the add and re-export reviewable are corrected in the
  notes (§ Corrections across rows). Subject construction cannot carry the arm instead: the copy is never in base, so
  once deleted its path drops out of the base-relative diff and the subject never sees the delete. The arm survives
  the cutover, so key 27's row closes with it in place; delivery's part is a separate question (below).

    A stacked delivery meets the copy a second way. Delivery's lifecycle-contribution path group
    (`CurrentDeliveryLifecycleContributionPathSource`, `lib/delivery/lifecycle-contribution.ts`) holds the work unit's
    artifacts, ROADMAP, and the Candidate and boundary records today, and three readers take it, each only under a
    delivery plan: terminal-delta classification (`classifyDeliveryTerminalDelta`), the member revalidation that holds
    every group path to the protected base (`revalidateDeliveryLifecycleContribution`), and the completeness comparison,
    which reports a group path the base lacks as invented (`compareNormalizedDeliveryTree`). In that group no member
    could carry the copy, and outside it the candidate-tail delete reads as non-lifecycle content. Where a delivery's
    design reaches review, and how its members treat the copy, is `delivery-observe-attest`'s, which holds the group's
    rows; delivery stays paused until the delivery follow-ons re-scope it, and the export adds nothing to the group
    (§ Coordination).

    Completion Notes and the Release Notes Entry come from the stored meta under every export option, never from the
    export or the pull request's head tree (D18), which settles the register row's "integration-time record decision".

- **The stored `verificationKind: "tier-3"`** in the integration boundary (`RunConvergenceVerificationActionSchema`) and
  `arc attest` (`lib/work-unit/verbs/attest.ts`) is renamed when the boundary reshapes at the flip, in both places
  together, to the merge quality gate's name, confirmed against `spec-quality-gate-hooks.md`. `quality-gate-hooks`
  retired the tier names but left this value, since renaming a live record's value would stop older records parsing.
- **Raw review reports are scratch.** Chunk reports, aggregate results, and evaluator reports in the work unit's
  workspace are inputs to the records above, never evidence of their own; from the flip they belong in the work unit's
  scratch folder (`cohort-storage-seam.md` § Cross-cohort, "Scratch"), which nothing archives.

### Rows and keys

The 35 inherited rows and the files no row covers are in the notes, § Rows and § Files no row covers, with the
corrections in § Corrections across rows. In outline:

- **Keys.** Candidate records with their withdrawal and retirement (01's Candidate half); the Git-history supersession
  read, whose `recordRevision` becomes a store version (02); a singleton's own record writes (34); writers completing
  through a code commit (45); readiness and integration reads of lifecycle state (48); the review gate's listing
  protocols over Errands and claims (62), keeping D4's refusal to authorize review from incomplete evidence; and the
  register's machine-local row, which the eight review-gate store rows carry, not key 17.
- **New rows.** Under delivery: `handlers/lifecycle-delivery-review.ts`, `lib/work-unit/verbs/attest.ts`,
  `lib/work-unit/git-candidate-subject.ts`, `lib/delivery/review-fix.ts`, which builds the advanced disposition record
  a delivery fix writes, `lib/delivery/review-fix-continuation.ts`, which reads its resolved policy request, and
  `handlers/delivery-execution.ts`'s disposition and operation-state reads and write, beside `delivery-observe-attest`'s
  row for that file. Under review, in `scripts/review-gate/`: `policy/assurance.ts`,
  `runtime/candidate-response-head-continuation.ts`, `core/review-subject.ts`,
  `policy/earlier-review-applicability.ts`, `policy/local-review-coverage-selection.ts`, `runtime/respond-command.ts`,
  the ten unrowed importers of the review gate's state modules, one of them importing only a type, and
  `status-errand.ts`'s reads of lane progress, dispositions, and the repository ID, beside the ref backend's row for its
  Errand reads; with the two effective-target modules in `lib/work-unit/`. `handlers/review-locus-context.ts` is
  `seam-locus`'s.
- **The schema modules' importers.** The family splits two schema modules, `core/operation-state-schema.ts` and
  `core/advisory-records.ts`, so the sweep reaches every module importing either, not only the stores: 33 import the
  first, 27 of them on no row, and 24 the second, 12 of them on no row, eight of those among the first's. The notes
  give each a fate — the lane-progress transitions and the modules that write a result become the family's writers, the
  two validation modules its write checks, the result and policy readers and the disposition record's validation
  compose from records, the rest of in-flight admission and retry stays working state, the schema registration takes
  the new kinds, and two modules importing only a schema or a type stay unchanged unless that shape changes.
- **Retire rather than move.** Mechanical carry's reads of the Candidate at a head (`gitCandidateRecordAtHead`,
  `recordsOwnSelection`) and the head-continuation proofs have nothing to prove once no selection or response is a
  commit, so their in-repo arms stay until the deletion pass and nothing replaces them.
- **Already store-backed.** The integration checkpoint's and merge's lifecycle ports read through
  `createStoreLifecycleStorage`; what remains of key 48 is the checkpoint's binding (§ What changes before the flip),
  the shipped-delivery boundary replay in `checkpoint-composition.ts`, and the readiness gate's read of the pull
  request's head tree in `merge-composition.ts`.

## Success signal

- **Before the flip:** the review gate's behavior is unchanged, its existing tests passing; Candidate and boundary
  callers read and write through the contract; the checkpoint binds the records it attested and merge compares those;
  and the import's trial over this repository lists every live review record as mapped and every fact with no live
  owner as left behind, with none unaccounted for (`spec-storage-ref-backend.md` § 10.8), and refuses a review attempt
  in flight.
- **From the flip:** a work unit's delivery makes no record-only commit and emits no `commit-*` next action; a re-root
  no longer erases a stored terminus; a reopened work unit cannot publish without a new boundary, while an interrupted
  publish still finishes; an archived work unit leaves no live Candidate; publication still refuses when standard
  review progress changed after readiness; a clone holding today's review records still reads its review state; every
  decision a review subject carries outside the Candidate's own selections is recorded through one kind, in one
  envelope; the export adds the review copy before the subject is fixed, re-exports it on a fix that amends the spec,
  and deletes it in the candidate tail, none of them changing the subject, while `merge-ok` fails as long as the copy
  is in the tree; a landed merge writes the landing-commit link, naming the project ID; and `arc attest` on a paused
  work unit refuses, naming `arc resume <slug>`.

## Alternatives

- **Store today's records as they are.** The least design now, but parsers, write checks, and import mapping for
  seventeen decision shapes and for operation fields that right-sizing is set to cut. Rejected for the storage rule.
- **Redesign the review and delivery process here.** It would fix the cost at its source, but it takes lanes, pass
  policy, the correction loop, and the integration path from their owners. Rejected (Owner, 2026-10-15); the research's
  process findings go to their owners as captures.
- **Keep D5's line, with operations wholly machine-local.** Publication is gated on fields lane progress holds, so a
  machine-local operation record cannot carry a fact another machine needs. Rejected: results become records.
- **Reshape the review gate's machine-local records before the flip,** in today's stores, so the import would copy
  them as they stood. The import resolves identities anyway; the reshape would change behavior before the flip — an
  in-flight reset, a kept Errand skip, renamed outputs, a tracked readiness field; and clearing development state would
  break every vehicle whose tracked records cite what it clears, while no reader before the flip needs the new shapes.
  Rejected (Owner, 2026-10-15, after adversarial pass 2): every review record reshapes at the flip, and the import maps
  today's shapes.
- **Reshape tracked records before the flip.** It would need new staging and head-move proofs for the new shapes, which
  the flip then deletes. Rejected: tracked records map at import.
- **Clear the review gate's records at the flip,** once the import has read them. Only the importing clone's facts
  are read, so every other clone would keep records the new schemas cannot parse, and a clear would need a step that
  runs on every clone. Rejected (Owner, 2026-10-15, after pass 2's fix check): post-flip working state lives apart
  from today's records.
- **Move the Candidate's responses and selections out of it.** Its reducer folds its transitions in order and its
  schema's checks span them, so splitting them would need a new ordering across records. Rejected (Owner, 2026-10-15,
  after adversarial pass 2): the log stays whole, naming the records it rests on.
- **Write each applicability selection as a decision record too.** The selection transition already carries the
  envelope's fields, and the Candidate's fold and its readers read the transition, so the record would be read by
  nothing. Rejected (Owner, 2026-10-15, after pass 2's fix check).
- **An evidence record per verification response.** The Candidate transition holds every field it would, and every
  reader reads the transition. Rejected (Owner, 2026-10-15, after adversarial pass 3).
- **Move the review copy's arm into subject construction,** so the cutover could remove path classification whole.
  The copy is never in base, so its delete leaves no path in the base-relative diff for subject construction to see.
  Rejected (Owner, 2026-10-15, after adversarial pass 3): D18's arm stays in lifecycle classification.
- **Add the export path to delivery's lifecycle-contribution path group.** The group holds every path to the protected
  base in each member and in the final candidate, so no member could carry the copy, and where a stacked delivery's
  design reaches review is the delivery follow-ons' question. Rejected (Owner, 2026-10-15, after pass 3's third
  fix-check round): routed to `delivery-observe-attest`.
- **Key decisions by an offer identity.** Most decisions answer no identifiable offer — a conditional authorization, a
  lane skip, a ceiling override, and every decision the import maps — and the offer's version already guards a second
  answer. Rejected (Owner, 2026-10-15, after adversarial pass 2): a decision is keyed by its own content.
- **A stored decision lifecycle** — pending, bound, consumed, invalidated — as the conditional authorization has. Each
  state is either unstored (the offer) or computable (subject match, a citing attempt, a later decision or successor
  disposition set), and stored transitions drift from the facts they summarize. Rejected: decisions are append-only and
  every state is derived.
- **Record mechanical carries as decisions.** It would make every carry a write and a judgment. Rejected: a decision
  exists only where someone chose.
- **A policy as a decider.** It would prepay a record for a verdict a rule computes, which is derived like any
  mechanical carry. Rejected (Owner, 2026-10-15, after adversarial pass 1).
- **Replace the attended applicability choice with a Gerrit-style policy now.** Prior art supports it, but it changes
  pass policy, which is `review-orchestration-right-sizing`'s; a rule's verdict would be derived, so it needs no schema
  here.
- **Record withdrawal before the flip,** as a tracked field. It fixes reopen's retained authority sooner, at the cost of
  a tracked shape and branch-riding mechanisms that the flip deletes. Rejected (Owner, 2026-10-15).
- **A pre-flip archived-singleton continuation (key 34).** It would serve only `with-integration`, which this
  repository does not run, for a wedge the flip removes. Rejected.
- **Import the review gate's machine-local facts for work that is not live too.** Nothing reads an ended work unit's
  review facts to decide, and the host and history keep a shipped change's. Rejected.
- **A stored `retired` state, written by archive.** The review records ride the work item's ref, which moves under
  history at the item's end, so the write would repeat what the end already does, and abandonment and a cut would need
  the same write. Rejected (proportionality check, 2026-10-15).
- **A content fingerprint per finding,** as SARIF's `partialFingerprints`, to compute recurrence. It suits a
  deterministic analyzer; a language-model reviewer rewords findings between passes, so it would miss recurrences or
  match wrongly, and a wrong match could carry an earlier decline. Rejected (proportionality check, 2026-10-15):
  recurrence follows a provider's stable identity where one exists and stays declared otherwise.

## Unknowns and Assumptions

- **The prior art was gathered unverified** by a bounded research pass (notes, § Prior art); the facts the design rests
  on — Gerrit's change kinds, GitHub's commit binding, SARIF fingerprints, Kubernetes conditions, idempotency keys —
  match independent knowledge and are re-checked at source-grounding.
- **Efficiency is unmeasured.** No study isolates call count or record shape against agent cost, so the claim that a
  compact family saves wall-clock time and attention wants ARC's own measurement, which goes to right-sizing.
- **The hosted reservation's carry** checks the Candidate ID and repository but not the subject (inferred from source,
  unverified); the spec confirms it before the boundary's shape settles.

## Scope boundary (Won't Do)

- Change review lanes, pass policy, the correction loop, or the integration path (`review-orchestration-right-sizing`,
  `review-activity-contracts`, the delivery cohort).
- Decide the terminus's reach or what invalidates it (`review-source-authority`), or give Errands a terminus
  (`review-orchestration-right-sizing`).
- Offer Errands the attended applicability selection, or compose `arc errand merge` and the checkpoint through one
  terminal sequence (§ Inbound dispositions).
- Build the ref backend, the import, the projection, the flip, its workflow rewrite, or the deletion passes.
- Change any workflow's text before the flip, or the review gate's behavior or record shapes, the checkpoint's binding
  aside.
- Record withdrawal or retire Candidates before the flip, or build an archived-singleton continuation.
- Import the review gate's machine-local facts for work that is not live, or map that work's tracked records.
- Add a general cancel or cleanup verb for review records, which are evidence.
- Redesign the Candidate-state projection (`candidate-reroot-recovery-frame`).

## Coordination

- **`storage-ref-backend`:** which records its import maps, and how — every replayed version of a live work unit's
  Candidate and boundary, and the review gate's machine-local records for live work, both from today's shapes — what
  stays behind, the keyed kinds' keys, and the layout table's `review/terminus` becoming `review/decision`; § 10.8's
  read widening from the gate's `evidence/` and `outcomes/` to `operations/`, with `review/decision` a third kind
  beside the two it expects; and the trial's refusal of a review attempt in flight. Sent as a pre-routed capture at
  draft close; nothing here edits its draft.
- **`review-source-authority`:** the terminus's reach and invalidation (key 80), in its held entry, over the envelope
  this member stores. Its held concern on hosted blockers meets the same envelope.
- **`review-orchestration-right-sizing`:** pre-routed captures at draft close for the research's process findings — a
  computed carry policy in place of the attended choice, a resumable operation for long waits, a typed pause for the
  Owner, and measuring agent cost from session transcripts — and inbound entries 1 and 2. Its held entry on giving
  Errand targets a terminus meets the envelope as it stands, and its held entries on the adversarial-pass verb's
  one-call bound and fix-check sets, and on terminal ownership of review evidence, meet § Adversarial passes and
  § Candidates and their boundary.
- **`review-request-contracts`:** passing an offer by reference rather than echoing it whole; a pre-routed capture at
  draft close, on which this design does not depend.
- **`seam-lifecycle`:** a row this member adds to its reopen (`runReopen`) after it lands, marking the Candidate
  `withdrawn`, which its § 19 does not list, beside the pause record and the captures matcher it does list; and the
  two files both rewrite, `handlers/lifecycle-delivery-review.ts` and `lib/work-unit/verbs/publish.ts`. Implementation
  follows its landing.
- **`seam-locus`:** the landing-commit link, the flip-time arms of the review gate's and checkpoint's reads, the
  operational-boundary read (§ Delivery at the flip), and the merged test the import's live-work rule borrows.
- **`candidate-reroot-recovery-frame`:** owns the Candidate-state projection; `withdrawn`, and the end of a work unit,
  feed it.
- **`delivery-observe-attest`:** the delivery family's kinds split with it, and its row for
  `handlers/delivery-execution.ts` sits beside this member's for that file's disposition records. Its two
  lifecycle-contribution rows take an open question: where a stacked delivery's design reaches review, and how its
  members and its lifecycle-contribution path group treat D18's review copy, with the group's three readers named
  (§ Delivery at the flip); sent as a capture.
- **`delivery-correction-convergence`** keeps stacked-delivery convergence (key 35), and **`review-activity-contracts`**
  pass accumulation across an approved fix and protocol ordering.
- **`storage-cutover`:** the flip's rewrite — the adversarial-review method's fire-points onto the verb, review reports
  into the scratch folder, a verb for opening the pull request that writes the change-request link, and a candidate-tail
  step that deletes D18's review copy — the rehearsal's import trial over the review gate's machine-local records as
  well as the tracked ones, the quiesce finishing every review attempt in flight on the importing machine, the
  deletion pass over the arms this member keeps (key 57) and today's inert review-gate folders, and key 27's row. The
  arm that row keeps is `classifyPathTreatment`'s, its three rows reading the copy as evidence-neutral when added and
  re-exported too (notes, § Corrections across rows). The row closes when the cutover realizes its fate, removing
  delivery's lifecycle-contribution path group and keeping that arm. The group's treatment of the copy is
  `delivery-observe-attest`'s, a follow-on item that closes when that work unit's draft holds it
  (`cohort-state-storage.md` § Closeout criteria); if its answer lands first, the cutover carries it through the
  group's removal.

## Inbound dispositions

| Entry                                                            | Outcome                                                 | Where, or why                                                                                                                                                                                                                                                                                              |
| ---------------------------------------------------------------- | ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Offer an Errand the review-applicability selection            | Split: `fold`; `hold review-orchestration-right-sizing` | The carry, derived for every vehicle: § Decisions, "A mechanical carry is derived". The attended choice: a pre-routed capture, "Decide residual review applicability by project policy for every vehicle"; _Shapes:_ "Retire a retained attempt when a later clean pass proves complete residual coverage" |
| 2. Compose `arc errand merge` and the checkpoint in one sequence | `hold review-orchestration-right-sizing`                | A pre-routed capture; _Shapes:_ "Make settled singleton integration a short, measurable path to merge"                                                                                                                                                                                                     |
| 3. Let an unrun frontline admission be withdrawn or superseded   | `errand` (Owner, 2026-10-15)                            | A `§ Errand` capture, with the Owner's exception to the cohort's pull-forward filter: the fix adds no stored record or shape. Until the flip, an Errand's `skip` withdraws the admission without being kept                                                                                                |
| 4. Census the review gate's decision records                     | `fold`                                                  | Notes, § Decision-record census; § Decisions                                                                                                                                                                                                                                                               |
| 5. Keep a by-kind register of recurring mechanisms               | Split: `fold`; `capture`                                | Proving it on one kind: the census is the decision-record register, and it changed this design. Generalizing it into `assess-design-proportionality`: a `WU_Target: TBD` capture                                                                                                                           |
| 6. Use the project ID as every link's repository                 | `fold`                                                  | § Delivery at the flip, "Links name the project ID"                                                                                                                                                                                                                                                        |
| 7. Refuse `arc attest`'s stage change on a paused work unit      | `fold`                                                  | § Delivery at the flip                                                                                                                                                                                                                                                                                     |
| 8. Row the delivery and review files the map misses              | `fold`                                                  | Notes, § Files no row covers; § Rows and keys                                                                                                                                                                                                                                                              |
| 9. Read a task's captures as the branch commits they match       | `fold`                                                  | § Delivery at the flip                                                                                                                                                                                                                                                                                     |

---
