# Spec (`detailed` · `RFC`): seam-delivery-review

- **Origin:** [internal]

- **Purpose:** Route Candidate records and the review gate's durable records through the storage contract, storing only
  what a later session, agent, or the CLI decides from, so that from the flip a work unit's own record writes stop
  moving its head and the import carries a compact review family rather than today's shapes.

---

## Introduction / Context

ARC's storage contract is shipped: one interface for every read and write of operational and planning state (`Store`,
`lib/store/contract.ts`), an in-repo implementation over today's substrates, and a kind registry naming every record
kind with its shape and mechanism (`KIND_SHAPES`, `lib/store/catalog.ts`; `KIND_MECHANISMS`, `lib/store/registry.ts`).
Six review kinds are registered: `review/candidate` and `review/integration-boundary`, one record per work item, which
the in-repo implementation stores in today's tracked files (`landTracked`, `lib/store/in-repo/write-stores.ts`), and
`review/evidence`, `review/outcome`, `review/terminus`, and `review/adversarial-pass`, keyed records with no home yet.
Nothing uses them. Every caller still imports the Candidate and boundary stores directly
(`lib/work-unit/candidate-record-store.ts`, `lib/work-unit/submission-boundary-store.ts`), and the review gate keeps its
own records in stores of its own.

Each Candidate keeps two tracked files on its work branch, the record and its boundary, and every write to either is a
commit that moves the head a review subject binds. The review gate has grown mechanisms whose only job is to prove those
commits harmless: write-then-stage steps and `commit-*` next actions; replays against `HEAD` and the index; proofs that
a record-only commit moved the head (`confirmCandidateResponseHeadContinuation`, whose port is threaded through the
review gate's lane-progress, hosted, frontline, local-prepare, and respond modules); digests guarded from the work
unit's own writes (`candidateProjectionPaths`); and Owner judgments carried inside a `--resume` command string
(`buildPrePublicationResumeCommand`). Once state lives under `refs/arc/*`
(`adr-035-keep-operational-state-in-repository-refs.md`), a record write is no commit, and those mechanisms have nothing
left to prove.

The review gate's own records already live off the branch, under the Git common directory
(`RepositoryGitCommonStatePublisher`, `<common>/arc/review-gate/<namespace>/`), but the contract's line between stored
facts and machine-local working state runs through those records rather than between them. Operation records hold pass
counts, sealed hosted results, settlement evidence, and pass authorizations that publication is gated on
(`LaneProgressStateSchema`); durable records point into machine-local stores (`ApprovedDispositionSourceSchema`); and
seventeen shapes record a decision about an exact review subject, each with its own fields, reach, and lifecycle, two of
them in no record at all. Withdrawal is not recorded, so a reopened work unit keeps its publication authority.

The ref backend's import cannot carry review state until something says which review record becomes which kind, and the
flip cannot happen until the review gate's reads and writes branch on it. Storing today's records as they are would
build parsers, write checks, and import mapping for fields that a later redesign of review orchestration is set to cut.
This change settles the review family's final shape, builds it, and routes Candidate and boundary callers through the
contract, changing nothing observable before the flip except what § 3 names.

**Terms used throughout:**

- **Store, backend, record, family, kind** — as `lib/store/` defines them: the contract (`Store`), one implementation of
  it, one stored document, a storage grouping (`FAMILY_IDS`), and a record type within a family (`KIND_SHAPES`).
- **In-repo implementation** — the backend over today's tracked files, personal files, and transient-identity ref
  (`lib/store/in-repo/`). **Ref backend** — a planned backend storing state under `refs/arc/*`, with an **import** that
  reads today's substrates once into the store when a repository moves onto it. Neither is built yet.
- **D5, D18** — two of the shipped storage contract's numbered decisions (`spec-storage-contract.md`): D5 is the record
  model, its families and kinds, which stores durable review facts and keeps review working state machine-local; D18
  exports a work unit's authored design into the code repository as a one-way copy for review, the review copy. § 13
  amends both forward.
- **The lifecycle change** — a merged change (`spec-seam-lifecycle.md`) that routes work-unit lifecycle verbs through
  the store. This change consumes four of its contracts: pausing, which replaces parking and records the pause in the
  work unit's meta (§ 12.1); its store-backed reopen (§ 10.1) and publication (§ 12.1); and the project-ID port (§ 2.4,
  § 12.3). Its task close verb writes the captures whose reading § 12.2 governs.
- **Locus** — a checkout's ARC role and the work item it serves, which ARC derives rather than stores. From the flip a
  planned change derives it from the store; § 12.4 lists the reads this change branches for that derivation.
- **The flip** — the per-repository switch after which the store reports `capabilities.stateOffBranch` as true
  (`StoreCapabilitiesSchema`, `lib/store/read.ts`). Before it the in-repo implementation serves every read and write,
  reporting `stateOffBranch: false` (`createInRepoBackend`). Code that behaves differently across the flip branches on
  that capability, never on a configuration value. The **cutover** performs the flip, rewrites workflow text once, and
  later runs a **deletion pass** removing what only today's substrates needed.
- **Work item** — a work unit, or an Errand. Every stored record belongs to one, and an ended work item's records move
  out of the live listings (§ 10.4).
- **Candidate** — a digest-identified attestation that one exact subject of a work unit's code is the change to review
  and publish (`CandidateIdSchema`, `scripts/review-gate/policy/integration-boundary-locus.ts`). A new Candidate
  supersedes the last; the chain is its **supersession chain**. The **integration boundary** is the Candidate's
  publication state: where it stands, what runs next, and what publication is bound to.
- **Review subject** — the digest of the reviewable entries of the Git index a review covers
  (`collectGitCandidateSubject`, `lib/work-unit/git-candidate-subject.ts`); paths classified evidence-neutral do not
  enter it (`classifyPathTreatment`, `lib/evidence-applicability/path-treatment.ts`).
- **Vehicle** — what a review is of: a work unit's Candidate, a delivery member, or a head-bound subject such as an
  Errand's. The review gate names it as a **lineage** (`LaneSubjectLineageSchema`,
  `scripts/review-gate/core/lane-admission.ts`): a Candidate's lineage is that one Candidate
  (`laneSubjectOwnerMatches`), and pass counts carry across its supersession chain apart from it
  (`rg/lane-progress-supersession.ts`).
- **Lane** — frontline, the one-time review before the change request, or standard. A **pass** is one logical review of
  a subject in one lane; an **attempt** is one run at a pass, and a retry of an attempt that did not finish shares its
  pass.
- **Disposition set** — a person's approved response to every finding of one review result (`dispositionSetId`). A later
  set approved over it is its **successor**.
- **Offer** — an exact choice the CLI computes and emits for a person to answer, such as accepting a terminus.
- **Review copy** — the copy of a work unit's stored spec that the cutover's export writes at `.arc/specs/<slug>/` so
  its design reaches review on the pull request (§ 12.5).
- **Review gate** — the CLI's review orchestration (`scripts/review-gate/`): lane admission, attempts, responses, and
  their records.
- **Paths** are relative to `packages/arc-framework/src/`, and `rg/` abbreviates `scripts/review-gate/` within it.

## Goals

1. **One compact review family** — six kinds, each with a field schema, a registered parser, and a write check — that
   holds only facts a later session, agent, or the CLI decides from (§ 1, § 2).
2. **From the flip, no record write moves a work unit's head:** delivery makes no record-only commit and emits no
   `commit-*` next action, and every mechanism that exists because records ride the branch keeps its in-repo arm until
   the deletion pass removes it (§ 3.1, § 14.3).
3. **Every decision about a review subject outside the Candidate's own selections in one envelope,** never rewritten,
   with every state it has derived rather than stored (§ 5).
4. **Withdrawal recorded and retirement derived from the flip,** so a reopened work unit cannot publish until readiness
   is recorded again while an interrupted publish still finishes, and an ended work unit leaves no live Candidate
   (§ 10).
5. **The import's mapping table:** which review record becomes which kind, how its work item and key resolve, and what a
   fact with no live owner becomes, so the ref backend's import carries live review state in the new shapes (§ 11).
6. **The checkpoint bound to what it attested** — the work unit's meta record plus the code head — before the flip
   (§ 3.2).
7. **D18's export, effective at the flip,** with its one evidence-neutral arm (§ 12.5).
8. **No observable change before the flip** beyond Goal 6, the rerouting (§ 3), and the recording verb's registration,
   which refuses `unsupported` until the flip (§ 7.2); and no import-ratchet floor grows.

## Non-Goals

_Editable in place until activation, then frozen; changes after that append: `Amended YYYY-MM-DD — <delta> — <prompt>`_

This change does not:

- **change review lanes, pass policy, the correction loop, or the integration path.** Each lane admits, counts, and
  stops passes as today; this change only moves where the facts live. One exception: from the flip an Errand's frontline
  skip is kept and closes its frontline window, as a Candidate's does today (§ 5.9).
- **decide an Owner-accepted terminus's reach or what invalidates it,** or give Errands a terminus. It stores the
  terminus in the decision envelope with whatever reach it is given (§ 5.6).
- **offer Errands the attended applicability selection,** or compose `arc errand merge` and the checkpoint through one
  terminal sequence.
- **build the ref backend, the import, the projection, the flip, its workflow rewrite, or the deletion pass.** It
  supplies the import's field schemas and mapping table (§ 11) and the flip-time arms (§ 3.3).
- **change any workflow's text before the flip,** or the review gate's behavior or record shapes, the checkpoint's
  binding aside (§ 3.2).
- **record withdrawal or retire Candidates before the flip,** or build a continuation for an archived singleton whose
  publication boundary is stale under `archive.cadence: with-integration` (§ 10.5).
- **import the review gate's machine-local facts for work that is not live,** or map that work's tracked records (§ 11).
- **add a general cancel or cleanup verb for review records,** which are evidence.
- **redesign the Candidate-state projection** that recovery and status read.
- **change how a stacked delivery's members treat the review copy.** Delivery's lifecycle-contribution path group gains
  no export path (§ 12.5).

## Proposed Design

§ 1 sets the rule every field answers to and § 2 the family it produces. § 3 is everything that changes before the flip.
§ 4–9 define each kind, § 10 withdrawal and retirement, § 11 the import's mapping, and § 12 delivery's changes at the
flip. § 13 amends the storage contract, and § 14 lists every file this change touches and its fate.

### 1. What a stored record holds

#### 1.1 The rule

ARC records no more than the tools it sits beside would — Git, the code host, CI — except where a session, an agent, or
the CLI needs the record to compute something. The contract's split between stored facts and machine-local working state
carries that rule to every field:

- **A field is stored only when it must outlive a session or a machine and something reads it later to decide.**
- **A mechanism that exists because records ride the branch gets no stored schema.** Today's in-repo arm keeps it until
  the deletion pass removes it (§ 14.3).
- **Process bookkeeping beyond that is derived or stays machine-local working state** — pass counters, phase markers,
  retained-attempt state — so review orchestration can later be reshaped with no store migration or import change. A
  choice someone made, which some of that bookkeeping carries today, is a decision (§ 5).

#### 1.2 Storing less

Lean toward storing less. Until ARC's first public release a field can be added in place, while parsers, writers, write
checks, and import mapping built for a field later cut are waste. The import sets the floor: which review record becomes
which kind, how its work item and key resolve, and what a fact with no live owner becomes (§ 11). Lanes, pass policy,
the correction loop, and the integration path stay as they are.

### 2. The family

#### 2.1 Kinds

| Kind                          | One record per                              | Keyed by                                 | Writer rule     | Holds                      |
| ----------------------------- | ------------------------------------------- | ---------------------------------------- | --------------- | -------------------------- |
| `review/outcome`              | attempt at a review pass, either lane       | its attempt's stable identity (§ 4.1)    | `create-only`   | the attempt's result, § 4  |
| `review/decision`             | choice a person made                        | a digest of its content                  | `create-only`   | the decision envelope, § 5 |
| `review/evidence`             | approved response to a review result        | its disposition set (`dispositionSetId`) | `single-writer` | the response, § 6          |
| `review/adversarial-pass`     | adversarial planning or criteria pass       | its activity and a number (§ 7.1)        | `create-only`   | a header and a report, § 7 |
| `review/candidate`            | work item: its current Candidate            | its work item                            | `single-writer` | the Candidate, § 8         |
| `review/integration-boundary` | work item: its current publication boundary | its work item                            | `single-writer` | the boundary, § 9          |

`review/terminus` becomes `review/decision` in `KIND_SHAPES` and `KIND_MECHANISMS`, keyed by `id` on its work item as
today. `review/outcome`, `review/decision`, and `review/adversarial-pass` take the `create-only` writer rule, which
refuses a `put` over a record that exists (`lib/store/in-repo/write-transaction.ts`), as `lineage/transition` and
`project-registry/identity` take it. The four keyed kinds keep no in-repo home (`unhomed`): nothing writes them before
the flip (§ 3.4).

#### 2.2 Keys and writes

Every kind is keyed to its work item. The Candidate and its boundary are one record each per work item, so a Candidate's
supersession is its record's history, read through `history` at store versions. The keyed kinds live in the review
family's subtree of the work item's ref (`FAMILY_REGISTRY.review`), an Errand's on the Errand's, each keyed by an
identity it already has or a digest of its own content, so a repeated write collides rather than duplicates. A decision
therefore lives on its lineage's work item.

Delivery and review records are single-writer kinds. A result, a decision, or an adversarial pass is written once, with
`expected: null` (`lib/store/write.ts`), and a second write of it refuses `version-conflict`. An evidence record is
written at its approval and updated in place, against its expected version, as its response is performed and settled and
when a successor set is approved over it. Two machines' writes of one record meet as a conflict record at sync
(`review/conflict-record`).

#### 2.3 Every result has a work item

A result lives on the work item its lineage names — a Candidate's work unit, a delivery member's, or a head-bound
vehicle's (`vehicleKind`) — and its evidence on the same one. Every lane refuses a review with no vehicle before
admission today:

- the local lane with `vehicle-unresolved` (`resolveLocalReviewVehicle`, `rg/hosts/local/review-authority.ts`);
- the frontline lane when its lineage resolver finds no work unit and no Errand (`resolveLineage` in
  `defaultFrontlineResolveDependencies`, `handlers/review.ts`);
- the hosted lane when it finds no active work unit and no explicit vehicle (`resolveHostedProgressContext`,
  `handlers/review.ts`).

Every lane-progress write passes its admission's lineage, so the `review-target` default in `laneProgressOperationId`
(`rg/lane-progress.ts`) serves only reads that omit one. Every result therefore has a work item, and the family adds no
refusal.

#### 2.4 Portable identities

Every stored record carries portable identities only:

- the **project ID**, which the import adopts from the review gate's repository ID (`resolveRepositoryIdentity`), minted
  per clone today, and which every clone's review gate takes as its repository identity from the flip;
- its **work item's UID**, which the import mints and resolves from the slug or vehicle today's records name;
- the **Candidate's ID**, a digest (`CandidateIdSchema`);
- **subject digests**.

No stored record names a machine-local locator. A source record's name derives from one (`sourceRecordName`,
`rg/hosts/local/source-store.ts`), so a durable record cites a source by its `sourceDigest` where it needs one, and
another record by its stored reference, never by the positional or machine-local references
`ApprovedDispositionSourceSchema` holds today (`receiptRef`, `localSourceRef`, `outcomeRef`, `attemptRef`).

Today the review gate's repository ID is minted per clone (`resolveRepositoryIdentity`,
`rg/hosts/local/git-common-state.ts`) and digested into stored identities — a review target's ID
(`ReviewTargetIdPreimageSchema`) and an `approved-fix` decision's key (§ 5.2) among them — so only the importing clone's
would match the project ID. From the flip the review gate's repository identity is the project ID on every clone, read
through the lifecycle change's project-ID port: `resolveRepositoryIdentity` takes the invocation's project-ID reader
(`createProjectIdentityReader`) and resolves it through `resolveProjectIdentity`, and each of the 14 modules that call
it — review, publication, status, and the integration checkpoint among them — passes the reader its invocation binds, so
two clones' records of one target agree. A caller on a clone that holds no project ID yet, as a joined clone before its
first pull, refuses with the port's typed reason and remedy, and the same call succeeds once the clone holds the ID. The
per-clone record (`identity/repository-identity.json`) is then read by nothing, and the deletion pass may remove it
(§ 14.3).

#### 2.5 Registration

Each of the six kinds registers a parser and a write check through `defineKindRegistration` in a module of its own under
`lib/store/kinds/review/`, joining `PRODUCTION_REGISTRATIONS` (`lib/store/kinds/registrations.ts`). Each parser
validates the kind's field schema (§ 4–9) and its format version. Each write check carries the invariants that today's
stores and validation modules enforce on the facts that move into the kind, as § 4–9 list them, returning every rule a
write breaks under a stable identifier. The schemas are public, so the review gate's readers and writers import them;
the registrations stay behind the store's raw-state import boundary.

### 3. Before the flip

The review gate's behavior is unchanged until the flip, with one exception (§ 3.2).

#### 3.1 Candidate and boundary callers through the contract

Every read and write of the Candidate record and its boundary goes through the store, the in-repo arms § 14.3 retires
aside. The in-repo implementation already stores both, delegating to `writeCandidateRecord` and
`writeSubmissionBoundary`, so the work is adoption. The 26 modules outside `lib/store/` that import
`lib/work-unit/candidate-record-store.ts` or `lib/work-unit/submission-boundary-store.ts` (§ 14.2) move off them by what
they use:

- **Reads and writes** (`readCandidateRecord`, `readCandidateRecordVersioned`, `readCandidateRecordVersion`,
  `readSubmissionBoundary`, `readSubmissionBoundaryVersioned`, `writeCandidateRecord`, `writeSubmissionBoundary`) become
  the store's `read` and `write`: a record's version becomes its store version, and the stores' version-conflict errors
  (`CandidateRecordVersionConflictError`, `SubmissionBoundaryVersionConflictError`) its `version-conflict` refusal.
- **Types** (`VersionedCandidateRecord`, `VersionedSubmissionBoundary`) come from the review kinds' public schemas
  (§ 2.5).
- **The chain and revision reads** become one Candidate history read in `lib/store/kinds/review/`. Its in-repo arm is
  today's plain path-log walk (`readRepositoryCandidateSupersessionChain`, `readRepositoryCandidateRecordRevision`), and
  its arm from the flip reads `history` (§ 8.4). The in-repo `history` stays as it is: it follows renames
  (`git log --follow`, `lib/store/in-repo/history.ts`), which drops a version a merge commit introduced, so moving these
  reads onto it before the flip would change the chains they return.
- **The path resolvers** (`resolveCandidateRecordRelativePath`, `resolveSubmissionBoundaryPath`) move to
  `lib/store/kinds/review/`, built on the layout's `candidate-record` and `integration-boundary-record` addresses
  (`resolveArcPath`, `lib/layout/projection.ts`) in place of their hand-built paths. Their callers stage the records,
  keep them out of a subject, classify their paths, or read a record at a Git revision or in the checkout, each an
  in-repo arm (§ 14.3); the subject's Candidate authority reads the record through the store from the flip (§ 12.1).

A read through the store also returns its work item's placement (`StoreRecordSchema`, `lib/store/read.ts`), which the
in-repo implementation takes from the work unit's meta (`selectMeta`, `lib/store/in-repo/meta.ts`). Where the reading
checkout holds no flat-active meta, that selection composes every branch's lifecycle metadata and refuses
`store.lifecycle-incomplete` on any branch-level or indeterminate acquisition failure, or one naming this work unit
(`requireComposedMetaSelection`), while today's stores read the record's file alone. This change has the in-repo read of
a review record take its placement from the reading checkout's own tree before composing: the flat-active meta, then the
tree's other lifecycle tiers (`heldMetaSources` over the working tree), since in-repo a record and its meta ride the
same branch (`readTracked`, `lib/store/in-repo/read.ts`). A record whose file is absent reads as not found before any
placement, as today. The reads that reach placement without a flat-active meta are an archived work unit's — the
checkpoint and merge after archive under `archive.cadence: with-integration`, and archived records riding base — and its
meta sits in the same tree's `completed/`, so wherever today's read returns a record, the store's returns it too.

The two stores stay where they are, as the in-repo implementation's adapters, and no production module outside
`lib/store/` imports them. They stay out of `lib/store/in-repo/`, whose modules no test may import (the `store-tests`
rule, the package's `eslint/architecture-imports.ts`), so the tests that build fixtures with them or test them directly
keep their imports. The stores re-export the chain and revision reads and the path resolvers that move out of them until
the deletion pass, since tests import those from the stores. A unit test that stubs a rerouted caller's store module by
its path (`vi.mock`), as `lifecycle-verbs.test.ts` stubs the Candidate store, stubs whichever module that caller now
imports instead — the store contract, or the Candidate history read's module — its assertions unchanged. Every mechanism
that exists because these records ride the branch stays as today's in-repo arm, behind one branch on `stateOffBranch`
(§ 14.3).

#### 3.2 The integration checkpoint binds what it attested

Today the integration checkpoint records the whole lifecycle version it read, and merge compares that version
(`scripts/integration/merge.ts`); in-repo the version is `HEAD`. Once state is shared, any unrelated write between
checkpoint and merge would stale the checkpoint. Before the flip, the checkpoint binds the version of the lifecycle
record it attested — the work unit's meta record, which gives its lifecycle position (`readLifecycleSummary`) and the
artifact facts read from it (`readLifecycleArtifactFacts`, `scripts/integration/checkpoint-composition.ts`) — plus the
code head, and merge compares those; the Candidate record's version stays asserted on its own, as today
(`assertRecordVersion`). Both read the meta record as of the lifecycle snapshot's state version, as the lifecycle port
reads it today (`createStoreLifecycleStorage`, `lib/store/lifecycle-storage.ts`), so in-repo its version still derives
from `HEAD`, an uncommitted edit moves nothing, and the checkpoint's verdicts are unchanged; what changes is what a
later comparison reads.

#### 3.3 Schemas, mapping, and flip-time arms

Before the flip this change builds the six kinds' field schemas, parsers, and write checks (§ 2.5); the import's mapping
table (§ 11); the recording verb, whose write the in-repo implementation refuses `unsupported` (§ 7.2); and every
flip-time arm of § 4–12, each branched on `stateOffBranch`, so the flip turns them on.

#### 3.4 The review gate's machine-local records

They keep today's shapes and stores until the flip, when every review record reshapes at once: the import maps the
machine-local ones from today's shapes as it maps the tracked ones (§ 11). No reader before the flip needs the new
shapes, so nothing is cleared or migrated before it, and `standardLaneOwnerVersion` guards publication as today until
the readiness binding replaces it (§ 9.2).

### 4. `review/outcome`

One record per attempt at a review pass, in both lanes, from every source — a local evaluator, a frontline source, or a
hosted review. It replaces the frontline outcome record (`FrontlineOutcomeRecordSchema`, `rg/core/advisory-records.ts`),
the receipt ledger's entries (`ForwardReceiptLedgerRecordSchema`, one repository-wide record whose entries are cited by
position), and lane progress's per-attempt facts with their sealed hosted results and its `completedPasses`
(`LaneProgressStateSchema`, `rg/core/operation-state-schema.ts`).

#### 4.1 Key and write

An outcome is keyed by its attempt's stable identity: `attemptId` for a local or frontline attempt, where it equals the
attempt's operation ID, a digest of the attempt's portable admission content (`rg/core/local-operation.ts`,
`rg/core/frontline-admission.ts`); and the admission's `admissionId` for a hosted attempt, whose `attemptId` changes
from the admission ID to a digest of the provider's handle once the provider acknowledges the request
(`rg/core/lane-attempt-validation.ts`), and which lane progress already matches by `admissionId`
(`rg/hosts/local/operation-state-store.ts`).

It is written once, when the attempt ends with any outcome but `pending`, and never rewritten; it carries its format
version. A result that no longer carries to a later subject stays, read as outdated, as Gerrit keeps an outdated vote;
nothing deletes evidence.

#### 4.2 Fields

Every outcome holds:

- **`attemptId`, `lane`, `lineage`** (`LaneSubjectLineageSchema`), **`logicalPass`, `retryGeneration`.**
- **`source`** — its `sourceId` and kind: the local evaluator, a frontline source by its configured identity and
  capability (never the executable path or argv a command source runs), or a hosted provider.
- **`target`** (`ReviewTarget`, `rg/core/gate-contract-v2-schema.ts`) — the review target by its digest (`targetId`)
  with the diff-base and head commits and trees it was taken from, and `changeRequestId` where there is one, so a later
  reader computes how a subject moved without a stored movement record, as a GitHub review binds `commit_id` and a check
  run `head_sha`.
- **`requestedCoverage`, `effectiveCoverage`, `correctionScope`,** and `chunkSeriesComplete` where the attempt was one
  chunk of a series.
- **`outcome`** — the attempt's outcome as lane progress records it today (`LaneAttemptSchema`'s outcomes) without
  `pending`, which is in-flight state, and `settled-findings`, which evidence derives (§ 6), with the frontline
  outcome's reason class where there is one (`FrontlineExecutionOutcomeSchema`, `rg/policy/frontline-outcome.ts`).
- **`findings`** — the normalized findings (`NormalizedReviewFinding`, `rg/core/finding-records.ts`), non-empty only for
  `findings`.
- **`requirement`** (`ReviewRequirementV2`) where the lane binds one, with its rubric version and digest.
- **`admittedBy`** — the key of the decision that admitted the attempt, where one did (§ 4.6).

Each source adds what today's records hold for it:

- **Local:** the request (`ReviewRequestV2`) — its author and evaluator identities, carrier, lineage, logical pass,
  generation, and request mechanism; the policy version and policy binding digest; the attestation — evaluator, runtime
  identity, mechanism, and runtime kind; the evaluator's run and applicability identities; the vehicle, scope mode,
  rubric identity, and delivery admission; and the source by its `sourceDigest`. Today these live in the `local-review`
  operation record and the receipt.
- **Frontline:** the admission's routing, review, policy version, and pass ceiling (`FrontlineAdmission`); the
  provider's executable identity; the response binding where a private delivery member's Candidate owns the response;
  and the outcome digest.
- **Hosted:** the sealed result (§ 4.5), its admission and handle, its host target, vehicle, requirement, and actor, and
  the request's failure reason where it failed.

#### 4.3 Pass counts derive

An attempt **finishes** when its outcome is a verdict — `clean` or `findings` — exactly when today's writers mark it the
producer of its pass's terminal result (`terminalProducer`), each source's coverage rule holding as § 4.8 lists it. A
lineage's pass count in each lane derives from its stored outcomes in that lane, as the lane's pass policy counts them.
Today's count, which this change does not alter, is the number of distinct logical passes among the lineage's finished
outcomes, as each lane's `completedPasses` counts them (`validatePassCounts`,
`rg/core/lane-progress-state-validation.ts`), plus, for a Candidate, the passes its supersession chain carries
(`readCandidateInheritedLaneProgress`, `rg/lane-progress-supersession.ts`, added in `readLaneProgress`,
`rg/policy/pre-publication-composition.ts`); the policy numbers the next pass and records an exhausted pass count from
that total (`rg/policy/review-policy-driver.ts`). A planned change to the standard lane's pass policy, expected to land
before this one, splits the two numbers: the next logical pass still numbers every finished outcome, including a fix
check's — a pass that reviews an approved fix alone, at incremental coverage — so one finished outcome per logical pass
still holds (§ 4.8), while the lane's count, and the exhausted pass count with it, takes only finished outcomes whose
`effectiveCoverage` is `complete`, so a fix check adds nothing to it; the frontline lane's count is unchanged. A
Candidate's supersession chain carries both numbers, each derived from its ancestors' stored outcomes — the first from
`logicalPass`, the second from `logicalPass` and `effectiveCoverage` — as today's code already carries a complete-pass
count beside the finished one (`countCompleteLogicalPasses`, `rg/lane-progress.ts`; `inheritedCompletePasses`,
`rg/lane-progress-supersession.ts`). This change derives whichever count the policy defines when it lands. An attempt
that did not finish — timed out, stale, or failed — keeps its outcome and counts toward none, and its retry shares its
logical pass, under the retry generation its source assigns (§ 4.7, § 4.8).

#### 4.4 Findings keep today's identity

A finding's `findingId` is the provider's — a hosted thread's identity, or a digest of a frontline finding's whole
content (`normalizeFinding`, `rg/providers/coderabbit/frontline-agent.ts`) — or the local evaluator's, and a recurrence
is declared (`recursFindingId`). Where a provider's identity is stable across passes, as a host's review thread is,
recurrence follows from it. A content fingerprint, as SARIF's `partialFingerprints` are, suits a deterministic analyzer;
a language-model reviewer rewords a finding between passes, so recurrence stays declared.

#### 4.5 A hosted result is sealed like any other

A hosted outcome keeps its sealed result (`HostedSealedResultSchema`): the outcome, review URL, findings in their hosted
form, with the comment, thread, or review identities settlement replies through, and coverage evidence, under its
content digest (`hostedResultId`), whose preimage also covers the admitted attempt's binding — the admission, the
request handle, the target, requested and effective coverage, the vehicle, and the requirement
(`HostedResultDigestPreimageSchema`). Settlement checks each finding it settles against those findings
(`rg/lane-progress-hosted-settlement.ts`), and coverage validation reads that coverage
(`rg/core/lane-attempt-validation.ts`), so neither reads back from a host comment someone can edit. The result also
keeps its host locator: the host review's identity and the SHA it reviewed. Its `owner/repo` is a host locator, never
the project's identity.

#### 4.6 Who ran it, and what admitted it

A retry under a consumed authorization is checked against the unfinished attempt's outcome for its author and evaluator
identities, policy binding digest, request mechanism, and attestation runtime kind and mechanism
(`retryOperationContract`, `rg/lane-progress-conditional.ts`), as `assertConsumedRetry` checks them today against both
attempts' `local-review` operation records, since from the flip operation records keep only in-flight state.

An admitted attempt names the decision that admitted it, where one did — a conditional pass after an approved fix — from
its admission, so its outcome carries the citation that decision's consumption derives from (§ 5.5).

#### 4.7 Operation records keep in-flight state

Operation records keep only in-flight execution state: the attempt under way, its lock, its materialization, and
admission and retry working state — the frontline run state, a local attempt's guidance and reviewer instructions, the
hosted request owner index, and review suspensions. From the flip they live in a namespace of their own, added to the
review gate's closed namespace list (`lib/git-common-state.ts`), apart from today's `operations/`. Today's snapshot read
refuses a whole store holding one record it cannot parse (`readOperationSnapshot`,
`rg/hosts/local/operation-state-store.ts`), so no clone's leftover records of today's shapes may ever reach the new
schemas; today's folders stay inert on every clone, and the deletion pass may remove them.

Admission reads a lane's attempts in flight from that working state, as it reads lane progress today. A frontline
admission citing no `approved-fix` extra pass takes the larger of one past the highest generation among its pass's
attempts, stored or in flight, and the version of the operation record holding its lane's in-flight attempts for its
lineage at its head, as it takes lane progress's version today (`admitNewFrontlineOperation`,
`rg/policy/frontline-command.ts`). The generation is part of the admission's operation ID
(`frontlineAdmissionOperationId`, `rg/core/frontline-admission.ts`), and today that version keeps an admission withdrawn
before it ran (§ 5.5) from recurring under its ID. That record starts afresh in the new namespace, and a withdrawn
admission leaves no outcome, so on a lineage reviewed before the flip a withdrawn generation can recur; a ready response
for the withdrawn admission then starts a run only for an admission identical to it, as the run's admission check
requires today (`readValidatedFrontlineAdmission`, `rg/runtime/frontline-admission-validation.ts`).

#### 4.8 Write check

The kind's write check carries the attempt invariants (`rg/core/lane-attempt-validation.ts`) and pass-count rules
(`rg/core/lane-progress-state-validation.ts`) today's modules enforce, over the stored outcomes:

- at most one of the local, frontline, and hosted bindings;
- each source's coverage rule: a local attempt that finished has effective coverage equal to its requested coverage, and
  one that did not has none; a frontline attempt has a verdict exactly when its effective coverage is complete; and a
  hosted attempt has a verdict exactly when it keeps a sealed result whose outcome matches;
- findings only for `findings`;
- at most one finished outcome per logical pass of one lane and lineage, no outcome written at a pass after its finished
  one, as no attempt stays pending at a pass after its terminal producer today (`validatePassCounts`), and no hosted
  admission ID twice;
- a retry at its attempt's logical pass, under the generation rule each source's admission enforces today: a frontline
  retry binds an earlier attempt that did not finish, at its repository, target, lineage, and logical pass, under a
  strictly higher generation (`assertFreshRetryAdmission` and `validateExplicitRetry`, which refuses a `clean` or
  `findings` prior, `rg/policy/frontline-operation.ts`); a local attempt takes one past the highest generation among the
  lane's attempts at its logical pass, source, scope mode, and coverage admission, or 0 when there are none
  (`nextLocalRetryGeneration`, `rg/runtime/local-prepare.ts`); a retry under a consumed `approved-fix` extra pass keeps
  its original admission's source, scope, and coverage at exactly one generation past the latest attempt at its pass
  (`requireConsumedRetryAttempts`, `rg/lane-progress-conditional.ts`); and a hosted attempt sits at generation 0, as its
  admission writes it (`rg/lane-progress-hosted-request.ts`).

### 5. `review/decision`

One envelope carries every decision about a review subject outside the Candidate's own selections.

#### 5.1 The envelope

- **`subject`** — the lineage the decision was made on (`LaneSubjectLineageSchema`) and the exact subject decided on:
  its head and subject digest — the Candidate's subject digest, or a review target's digest — or, for a delivery
  member's terminus, the member vehicle. The decision lives on the vehicle's work item; the kind's reach (§ 5.6) decides
  which later subjects it binds.
- **`lane`** — frontline or standard.
- **`choice`** — the decision's kind and value:
    - `extra-pass` — one pass past the lane's pass count it was decided at (`passCount`, in the count's units, § 4.3),
      with its precondition: `ceiling`, a pass past an exhausted ceiling; `additional`, an elective pass after
      convergence, naming the result it follows (`precedingProducerId`); or `approved-fix`, a conditional pass after an
      approved fix, naming the result and disposition set it follows and the head the fix starts from (`producerId`,
      `dispositionSetId`, `originatingHeadSha`);
    - `terminus` — an Owner-accepted terminus of the standard lane;
    - `lane-skip` — a skip of the frontline lane;
    - `withdrawal` — the withdrawal of an earlier decision, by its key.
- **`decidedBy`** — the person who chose, by configured identity (§ 5.7).
- **`decidedAt`** — when.
- **`basis`** — what the answered offer was computed from: a record version, or for a terminus the pass count and
  results its offer counted, and the results or evidence it cites.

A decision the import maps carries a decider, a time, a head, and a subject digest only where its source recorded them,
and `null` otherwise.

#### 5.2 Key

A decision is keyed by a digest of its subject, lane, choice, decider, and basis, never its time, as a conditional pass
authorization's ID leaves out `capturedAt` (`computeConditionalPassAuthorizationId`,
`rg/core/operation-state-schema.ts`), so recording the same decision twice names one record: a retry's write refuses
`version-conflict` over the record its first write made (`create-only`, § 2.1), and the writing verb reads that record
and reports the decision as already recorded. Two machines' writes of one decision meet as a conflict record at sync
(§ 2.2). A withdrawal is keyed the same way, citing the decision it withdraws.

For an `approved-fix` extra pass the key is today's `authorizationId`, computed as today over the authorizer, project,
lane, lineage, result, disposition set, originating head, and the exhausted and next pass counts, so the requests,
admissions, and resolved policy requests that cite it (`ceilingOverride.conditionalPassAuthorizationId`) still resolve
after the import.

A second answer to one offer refuses as it does today. A terminus answer refuses when the recomputed live offer differs
(`readCurrentOffer`) or the member already carries a terminus with a different pass count (`record-conflict`,
`resolveDeliveryReviewTerminusAcceptance`, `rg/policy/delivery-review-terminus.ts`); from the flip the member's entry
names the terminus decision it carries (§ 9.1), whose pass count the second check compares. No offer identity is stored.

#### 5.3 What it replaces, and what stays outside

It replaces the decision shapes the review gate keeps today:

- **pass authorizations** — the ceiling override (`ReviewCeilingOverrideSchema`), the additional pass
  (`ReviewAdditionalPassAuthorizationSchema`), and the conditional pass after an approved fix (the conditional pass
  authorization in lane progress): one extra-pass decision with three preconditions. The first two are never stored
  today; they persist only inside a resolved policy request and the `--resume` token.
- **Owner-accepted termini** — the singleton terminus (`OwnerAcceptedReviewTerminusSchema`, the boundary's `terminus`)
  and each delivery member's (`deliveryReviewTermini`), one shape in two containers; and the Owner-directed review stop
  an Errand takes in conversation today, which the same shape serves once Errands take a terminus.
- **lane skips** — the frontline skip marker (`FrontlinePhaseStateSchema`, `recordSingletonFrontlineInitialSkip`) and a
  `skip` invocation, which are interconvertible.

These go: the fix authorization as a stored shape, which `createFixAuthorization` derives from the approval; the
confirmation action (`CandidateResponseConfirmationActionSchema`), which merge recomposes from durable records and
compares (`confirmCandidateResponseAction`) rather than reads; the `--resume` token's judgments and their scrubbers
(§ 9.3); the redundant `nextPass`, always the pass count plus one; and the legacy receipt payloads (`decision`,
`head-update-authorization`), which have no writer.

Three decision-like shapes stay outside the family:

- **Applicability selections,** for review and for verification, stay the Candidate's transitions (§ 8). Each carries
  the envelope's fields — its target, its choice, `selectedBy`, and the projection and residual digests it was chosen
  against, with `selectedAt` on the review selection — and the Candidate's fold and its readers read the transition, so
  a record of their own would be read by nothing. A second answer to a selection offer refuses on the Candidate record
  version the offer was computed from (`expectedRecordVersion`) while an exact replay passes, as
  `lib/work-unit/candidate-applicability-resolution.ts` and `rg/policy/review-applicability-resolution.ts` check today.
- **The checkpoint approval with the Errand merge interlock** is an exact-head merge authorization, the integration
  path's, whose checkpoint record stays machine-local.
- **A `force` invocation** (`FrontlineInvocationOverrideSchema`, `rg/policy/frontline-resolution.ts`) is a per-call
  routing input, replayed through the boundary's next action as today (§ 9.3), never a decision.

#### 5.4 Never rewritten; no status stored

A later decision of the same kind within the same reach supersedes an earlier one, and withdrawing a decision is itself
a decision, so every state a decision has is observed, as Kubernetes conditions are, never a step of a stored machine:

- **Pending** is an offer the CLI emits and does not store. It carries the version of what it was computed from, and an
  answer against a version that has moved refuses, as a reused idempotency key with different parameters does.
- **Bound** is derived: a decision binds a subject when the subject falls within the decision's reach. An `approved-fix`
  extra pass binds once its disposition set's evidence records the fix performed, at the head the fix produced.
- **Consumed** is derived (§ 5.5).
- **Superseded or withdrawn** is derived from the later decisions within its reach. An `approved-fix` extra pass also
  ends when a successor disposition set for the same result is approved (§ 6.3), which refuses once the pass is consumed
  (`invalidateConditionalNextPassAuthorization`, `inspectConditionalNextPassInvalidation`,
  `rg/lane-progress-conditional.ts`). A withdrawal of an `approved-fix` extra pass refuses, as today
  (`withdrawConditionalNextPassAuthorization`), once it is consumed or superseded, or when the withdrawer is not its
  decider. What ends an Owner-accepted terminus beyond its reach is not decided here (§ 5.6).

#### 5.5 Consumed

An extra pass binds the lane's pass count it was decided at and admits only the next pass. An attempt at that pass that
does not count toward the pass count (§ 4.3) spends nothing, so its retry runs under the same decision; once the pass
counts, the decision admits nothing further. Today an additional pass drops once the count passes the one it was decided
at (`withCeilingOverride`, `rg/policy/pre-publication-request.ts`), and a ceiling override refuses once the count moves
past the pass it admitted (`pass-count-mismatch`, `resolveInvalidOverrideReason`, `rg/policy/review-policy-driver.ts`)
while still applying to the resolution of that pass's own result (`compatibleTerminalGrants`,
`rg/policy/review-policy-evidence.ts`). An extra pass already used therefore reads as spent, imported or not. Under the
planned pass policy (§ 4.3) a fix check cites no extra-pass decision: the approved, performed response it verifies
admits it, which its `correctionScope` names by that response's result (`predecessorProducerId`), so it spends none and
its outcome's `admittedBy` stays empty.

An `approved-fix` extra pass is also consumed by the attempt citing it (§ 4.6), checked when the attempt is admitted,
before the pass runs, as `bindConditionalPendingAdmission` checks it today: a consumed pass admits only a retry after an
attempt that did not finish, under the same source, scope, coverage, actors, and policy. A frontline admission that
never ran leaves working state when a later resolve skips the lane or names another target
(`withdrawUnrunFrontlineAdmission`, `rg/policy/frontline-pending-admission.ts`), except one citing an `approved-fix`
extra pass, which refuses `conditional-authority-consumed`, as today, since its citation consumed the pass.

#### 5.6 Reach

Reach is the decision kind's, not each record's, and this change keeps today's:

- a **standard-lane `ceiling` extra pass** reaches its Candidate at the pass count it was decided at, at any later head,
  as `withCeilingOverride` rebinds its target to the current one today; a re-root's successor is outside it, as today
  the re-root's new boundary (`projectCandidateReviewBoundary`, `handleAttest`) drops the `--resume` token that carries
  the override;
- an **`additional` extra pass** reaches the head it was decided on (`additionalPassAuthorization.headSha`);
- a **frontline `ceiling` extra pass** reaches only the frontline head it was decided on;
- an **`approved-fix` extra pass,** decided before the fix exists, reaches the head that fix produces, a continued head
  included (`bindConditionalPendingAdmission`);
- a **lane skip** reaches the Candidate's supersession chain, as frontline closure carries across supersession today
  (`frontlinePhaseClosed`), and from the flip an Errand's skip, which today leaves no record, is kept and reaches its
  Errand;
- an **Owner-accepted terminus** reaches the subject it was accepted on — a Candidate's ID and subject digest, or a
  delivery member's vehicle and head — and whichever later subject the integration boundary carries it to, as today. The
  boundary names the terminus decision it carries (§ 9.1), and today's writers carry or drop that name as they carry or
  drop the terminus now: the pre-publication resolution carries it only while the subject is unchanged
  (`applyCarriedOwnerAcceptedTerminus`, `rg/policy/pre-publication-request.ts`), so it drops once an approved fix
  advances the Candidate; and after publication the boundary keeps it as it moves to the Candidate's later subject, when
  attestation proves the movement non-semantic (`recoverAttestedOwnerTerminusBoundary`) and when a verified hosted
  response rebinds it (`rebindSingletonPublicationResponseBoundary`), both in `rg/policy/integration-boundary-locus.ts`.
  A corrective delivery renewal also carries the boundary's terminus names, with its delivery reservation, to the
  renewed Candidate (`projectCorrectiveDeliveryStatusBoundary`, in the same module), as § 9.4 carries the reservation.
  Making it bind across every lane and every later subject, and deciding what invalidates it, is separate work; this
  change stores the terminus in the envelope whatever reach it is given, and whether an Errand takes a terminus is
  likewise separate.

#### 5.7 Decided-by

Each path records the identity it resolves today, and this change adds no check:

- **Termini** resolve their author through `readOwnerTerminusAuthority` (`rg/policy/pre-publication-composition.ts`),
  which requires `arc.identity` to be the work unit's owner, with a completed work unit's owner as the fallback
  (`acceptDeliveryReviewTerminus`, `handlers/review.ts`).
- **An `approved-fix` extra pass** names its authorizer, who must be the disposition set's approver. A local disposition
  approval resolves its approver through `resolveLocalReviewAuthority` (`rg/hosts/local/review-authority.ts`), which
  requires the owner for a work unit and takes the active identity as an Errand's author; a frontline or hosted one
  through `resolveFrontlineActors` (`rg/runtime/respond-composition.ts`), which takes the active identity unchecked.
- **A `ceiling` or `additional` extra pass and a lane skip** resolve no identity today
  (`recordSingletonFrontlineInitialSkip` takes no actor), so from the flip they record the active identity unchecked, as
  a frontline approval does, and an imported one carries none.

Each is a configured identity, not a credential, so ARC claims no more than that: at a seam where the platform enforces
no identity, ARC records the identity it resolved and claims nothing stronger.

#### 5.8 A mechanical carry is derived, never decided

Whether earlier review carries to a moved subject is computed by the existing reducer (`reduceEvidenceApplicability`,
whose verdicts are `carries`, `supplemental`, and `fresh`), as Gerrit's `copyCondition` and GitLab's patch-ID comparison
compute it. A decision record exists only where someone chose. A project rule that computed applicability would be
derived the same way, so the attended covered-or-review-required choice can later be replaced by a rule with nothing new
stored.

#### 5.9 The frontline window

Today a singleton's initial frontline skip is a marker keyed by Candidate ID (`recordSingletonFrontlineInitialSkip`,
`rg/policy/frontline-phase.ts`), read across the Candidate's supersession ancestors, so an Errand's skip leaves no
trace. From the flip the skip is a lane-skip decision on the vehicle's subject, reaching a Candidate's supersession
chain or an Errand, and the window's closure derives from the vehicle's records — a skip decision; a terminal frontline
outcome that closes it, clean or settled findings whose advice is to stop; or the standard lane's first attempt, in
flight or recorded — as `frontlinePhaseClosed` already derives it, reading the Candidate-keyed marker for the skip.

From the flip nothing writes or reads the marker. Until then it serves the in-repo arm, and the deletion pass removes it
(§ 14.3) with its record kind (`frontline-phase`), its operation-ID domain (`arc.review.singleton-frontline-phase/v1`),
and its published schema ID (`frontline-phase-state`), with the schema-inventory variant
(`rg/core/operation-state-schema.ts`, `rg/core/schema-inventory.ts`), the `FrontlinePhase*` schema and type names, and
`readSingletonFrontlinePhaseClosure`. An Errand's skip is kept and closes its window. The derived view takes the name
"window", for the one-time opportunity before the change request, so the `frontline-phase-closed` diagnostic
(`rg/policy/frontline-command.ts`, `rg/policy/review-policy-driver.ts`) and the policy driver's `phase-closed` skip
reason are renamed `frontline-window-closed` and `window-closed`. No workflow text names either.

#### 5.10 Write check

The kind's write check recomputes the key from the envelope; refuses an `extra-pass` whose precondition fields are
incomplete for its kind; refuses a `withdrawal` citing no decision on the same work item, or citing a withdrawal; and
carries the withdrawal rules of § 5.4 for an `approved-fix` extra pass.

### 6. `review/evidence`

One record per approved review response, keyed by its disposition set (`dispositionSetId`, which the Candidate's review
response cites as `dispositionId`).

#### 6.1 What it binds

Each lives on its result's work item (§ 2.3) and names what it responded on, as the disposition record binds it today: a
Candidate; an Errand; a delivery member; a Candidate with a delivery member, for a frontline review of a private member
whose Candidate owns the response; or none of them. `settleNewApprovedResponse` (`rg/runtime/respond-command.ts`)
resolves the binding: the member from the frontline response binding, the hosted attempt's vehicle, or the local
attempt's delivery admission; a Candidate when exactly one matches the reviewed head (`readCandidateLineage`,
`rg/runtime/respond-composition.ts`); and the open Errand only when neither resolves (`resolveActiveErrand`). It writes
a record with none of them when none resolves.

A verification response has no evidence record: a delivery fix writes it only as a Candidate transition
(`createCandidateVerificationResponseEvidence`, `lib/delivery/review-fix.ts`), and every reader reads that transition.

#### 6.2 Fields

- **`result`** — the `review/outcome` key of the result responded to, with its result digest, in place of today's source
  references (`ApprovedDispositionSourceSchema`): a local result's receipt and source references, a frontline result's
  outcome reference, and a hosted result's attempt reference, which keeps its `hostedResultId`.
- **`binding`** — § 6.1.
- **`dispositionSet`** (`DispositionSet`, `rg/core/disposition-records.ts`) — the target, producer, result digest,
  policy version, rubric or frontline binding, proposer, proposed verification, and each finding's disposition, under
  its content-addressed ID.
- **`approval`** (`DispositionApproval`) — the approver and time, bound to its set and target, keeping today's rule that
  proposer and approver differ.
- **`predecessorDispositionSetId`, `successorDispositionSetId`** — § 6.3.
- **`responsePolicyRequest`, `policyProjectionPending`** — § 6.4.
- **`performance`** — once performed: the response's old and new targets and heads, its applicability, its fix
  consumption with who applied it and when, its hosted fix target, and the Candidate response it made
  (`candidateResponseId`), as today's fix responses (`errandFixResponse`, `deliveryMemberFixResponse`) and response
  performance (`LaneResponsePerformanceSchema`) record them.
- **`settlement`** — a hosted response's per-finding settlement (`settlementEvidence`): each finding's disposition and,
  where it was replied to, the host comment, thread, reply, and reply digest it settled through, with the set's finding
  actions; and, for a successor set, the entries carried from its predecessor (`carriedFromDispositionSetId`).

The fix authorization is not stored: `createFixAuthorization` derives it from the approval and the set, and the fix
consumption cites it by its ID as today.

#### 6.3 Succession

Each record names its predecessor set. Approving a successor marks it on the predecessor in the same `batch`, an
in-place update against the predecessor's expected version, as a lineage node's `successorDispositionSetId` marks it
today, so the succession stays linear as the disposition record's one compare-and-swap keeps it
(`isDispositionSuccessorAdvance`, `rg/hosts/local/disposition-record-store.ts`): a second successor to one set refuses,
or meets the first as a conflict record at sync. A successor is approved only over a set with no performed response, as
today. The current set is the one no record succeeds, and the succession replaces lane progress's
`dispositionSetLineage` and its tail pointers. Approving a successor also ends an `approved-fix` extra pass on the
predecessor (§ 5.4).

#### 6.4 The resolved policy request

A review response's record keeps the policy request its response was resolved with, as the disposition record does today
(`responsePolicyRequest`, `ApprovedDispositionLineageNodeSchema`): a snapshot of what the response was resolved against,
which the checkpoint's settlement replay (`scripts/integration/lineage-review-composition.ts`), a delivery fix's
continuation (`lib/delivery/review-fix-continuation.ts`), and `arc review respond`'s replay
(`rg/runtime/respond-command.ts`) read — never a decision of its own, though it copies the judgments it was resolved
with. `policyProjectionPending` stays the record's state until that projection completes, as today: the settlement
replay, the pre-publication request (`rg/policy/pre-publication-request.ts`), and `arc review respond`, which clears it,
read it.

#### 6.5 Write check

The kind's write check carries today's in-place rules for what moves into it. From the disposition store's accepted
advances (`appendDispositionRecord`, `rg/hosts/local/disposition-record-store.ts`):

- **`isFixResponseAdvance`** — `performance` goes from absent to set, once, nothing else changing;
- **`isDispositionSuccessorAdvance`** — `successorDispositionSetId` goes from absent to the new set's ID, in the batch
  that creates the successor naming this set as its predecessor, while neither set has a performed response;
- **`isPolicyProjectionAdvance`** — `policyProjectionPending` clears and `responsePolicyRequest` may change in the same
  write, the one step at which the request snapshot may still be corrected, while no response is performed.

From lane progress's rules (`rg/hosts/local/operation-state-store.ts`):

- **`assertResponsePerformanceTransitions` and `isCandidateResponseBindingAdvance`** — a performance, once written, is
  unchanged but for `candidateResponseId`, which a Candidate lineage may add once;
- **`assertHostedTransitions`** — settlement entries are append-only within a set, each appended entry replied and
  resolved and not carried; a successor's record may start with its predecessor's entries, each carried and otherwise
  identical.

The fourth advance, `isExactDeliveryMemberBindingAdvance` (`rg/core/advisory-records.ts`), binds a delivery member onto
a record written with no binding, and is not carried. `arc review respond` resolves a record's binding at its first
write (§ 6.1), which a replay reads again, so from the flip no record is written unbound and bound later. The step
serves records written before a local admission carried its member: on 2026-10-15 none of the store's 207 disposition
records in today's shape awaited it, each bound to a Candidate or an Errand.

#### 6.6 What it replaces

It replaces the approved-disposition record (`ApprovedDispositionRecordSchema`), one per review result holding a lineage
of disposition sets with their fix authorizations and consumptions, and lane progress's response performance and
settlement. The Candidate's review-response transitions name it by its key and keep the approval their IDs digest
(§ 8.3). `REVIEW_DURABLE_RECORD_INVENTORY` then lists what is stored, rather than the fix authorization and consumption,
which persist only inside another record today.

### 7. `review/adversarial-pass`

#### 7.1 Key and activities

One record per adversarial planning or criteria pass, keyed by the store's `pass` key (`{ activity, number }`,
`lib/store/identity.ts`), its number counting the work item's passes of that activity across every loop, so a re-entered
loop never reuses a key. Its activities are the adversarial-review method's fire-points: draft readiness, spec
finalization, task-generation finalization, a design amendment's footprint, verification, and the task loop's criteria
passes.

#### 7.2 The recording verb

This change builds `arc review adversarial record`, one call at the disposition approval that writes the record. The CLI
derives the artifact versions and the pass number; publishes its input schema; and refuses malformed input naming the
expected shape. Before the flip the in-repo implementation refuses its write `unsupported`, as it refuses every durable
review fact's, and the method keeps appending to the work unit's `ADVERSARIAL-PASSES.md`; the cutover's rewrite points
the method's fire-points at the verb.

#### 7.3 Fields

A small typed header — the activity; the artifact versions reviewed, and the code head where it reviewed code; the
rubric's identity; `Pass N of M`; who approved the dispositions and when; any over-cap approval; the stop reason; and
one disposition per finding, its identifier and action — with the evaluator's report and each finding's account as
prose. Fix-check rounds, finding origins, and the author's corrections ride the prose, so how much of them becomes typed
can change later with no schema change here.

The record holds no next-pass authorization. A later pass's prior findings are composed from the records, launching a
pass consumes nothing, and a pass over the cap carries its own approval.

#### 7.4 Write check

The kind's write check validates the header against its schema and refuses two dispositions for one finding. The report
is prose and unchecked. `Pass N of M` counts passes within one loop, so it is not the key's number, which counts across
loops.

### 8. `review/candidate`

#### 8.1 What it holds

One record per work item, its current Candidate, holding today's managed record (`CandidateManagedRecordV1Schema`,
`lib/work-unit/candidate-attestation.ts`) whole:

- **`attestation`** (`CandidateAttestationV1Schema`) — the work unit, root subject digest, base revision, attester and
  time, verification evidence reference, and the Candidate it supersedes on a re-root. The Candidate ID digests every
  other attestation field.
- **`subject`** — the root subject snapshot: each entry's path, content digest, mode, and treatment, and the subject
  digest over the reviewable entries.
- **`transitions`** — one ordered log of review responses, verification responses, and the two applicability selections,
  for review and for verification.
- **`lineageAttestations`** — each convergence attestation of a response's target, with its scope and evidence
  reference.

Withdrawal is the boundary's state, not a field of the Candidate (§ 10.1).

#### 8.2 The log stays whole

The transitions stay one ordered log in the record, as today, because its reducer folds them in order
(`reduceCandidateDurableBaselineRecord`) and the schema's checks span them: a verification response and a verification
selection must continue the running target, a lineage attestation must name the review response pending at its target
and cover the scope it requires, no evidence reference is used twice, and no exact review selection repeats. Each
transition stays whole, the applicability selections among them (§ 5.3).

#### 8.3 Identities kept

A response's ID (`responseId`, `verificationId`) digests every other field of its transition, the approver or verifier
included, so keeping the transitions whole keeps every ID, and the lineage attestations and lane progress's
`candidateResponseId` that cite one still match after the import. A review response already names its evidence record by
that record's key, its disposition set (`dispositionId`), so its approver sits in both the transition, whose ID needs
it, and the evidence record (§ 6). A verification response is its transition alone, with no evidence record.

#### 8.4 Supersession is the record's history

A new Candidate replaces the record; the one it replaced stays in the record's history. The chain walk
(`resolveCandidateSupersessionAncestors`), which follows `attestation.supersedes` through strictly older entries of the
same work unit, reads them from the flip through `history` at store versions rather than through the in-repo arm's path
log (`readRepositoryCandidateSupersessionChain`, § 3.1), and the Candidate record's revision (`recordRevision`,
`readRepositoryCandidateRecordRevision`) becomes its store version.

#### 8.5 Write check

The kind's write check carries the schema's checks above and the Candidate ID's and each response ID's recomputation.

### 9. `review/integration-boundary`

#### 9.1 Field by field

| Field                               | From the flip                                                                                                                                                                                                                                                                                                            |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `schemaVersion`, `mode`, `workUnit` | Kept; the format version advances (§ 2.5).                                                                                                                                                                                                                                                                               |
| `candidateId`                       | Kept: the Candidate the boundary is for.                                                                                                                                                                                                                                                                                 |
| `candidateSubjectDigest`            | Kept: the subject the boundary was written for.                                                                                                                                                                                                                                                                          |
| `locus`                             | Kept, every value.                                                                                                                                                                                                                                                                                                       |
| `nextAction`                        | Kept, every variant, each naming its command, with the changes in § 9.3.                                                                                                                                                                                                                                                 |
| `reservation`                       | Kept as today (§ 9.4).                                                                                                                                                                                                                                                                                                   |
| `postAttestContinuation`            | Kept, without `projectionDisposition`, whose keep-staged rule retires (§ 14.3).                                                                                                                                                                                                                                          |
| `deliveryContinuation`              | Kept: the delivery plan and state it was written against.                                                                                                                                                                                                                                                                |
| `terminus`, `deliveryReviewTermini` | Kept as names: each Owner-accepted terminus is a decision (§ 5), and the boundary names, by key, the one it carries, as § 5.6 carries it.                                                                                                                                                                                |
| `policy`                            | Gone: the copied resolve envelope, with its own terminus, `completedPasses`, and `attemptedSources`, is recomputed from outcomes and decisions. The policy-review variant of `candidate-review-pending` folds into the review-resume variant, which admits an optional reservation and post-attest continuation (§ 9.4). |
| `standardLaneOwnerVersion`          | Gone: the readiness binding replaces it (§ 9.2).                                                                                                                                                                                                                                                                         |
| `readinessBinding`                  | New, on `candidate-publish-ready` and `publication-pending` (§ 9.2).                                                                                                                                                                                                                                                     |

`verificationKind`'s `"tier-3"` value is renamed in the same reshape (§ 12.6).

#### 9.2 The readiness binding

Publication refuses when standard review progress changed after readiness was recorded. Today that compares the standard
lane's progress-record version (`standardLaneOwnerVersion`) in `authorizeSubmission` and `authorizeActivePublication`
(`lib/work-unit/verbs/publish.ts`), the publication claim (`handlers/lifecycle-delivery-review.ts`), and in
`handlers/review.ts` both readiness's own write and the re-entry over an advanced boundary. That version moves on every
write to the lane's progress record, a pass admitted but not yet finished among them (`recordLocalPendingAttempt`).

From the flip those facts are records of their own, so the boundary binds `readinessBinding`: a digest over the current
listing of the standard lane's outcomes, evidence, `approved-fix` extra-pass decisions, and withdrawals of those
decisions on the Candidate's lineage — each record's key and version — and of the lane's in-flight attempts. A
withdrawal is listed because withdrawing an `approved-fix` extra pass writes the progress record today
(`withdrawConditionalNextPassAuthorization`). Termini, selections, and lane skips stay outside it, as they stay outside
the progress record today. Each of those sites recomputes the digest and refuses on a mismatch, and refuses an
incomplete listing rather than reading it as unchanged. Until the flip the version guards publication as today.

In-flight attempts are machine-local (§ 4.7), so the binding sees only the publishing machine's: publication from one
machine does not see an attempt another has in flight on the same Candidate. This change accepts that residual, since
two machines reviewing one work unit at once falls outside the unit ARC governs, one developer and one agent on one work
unit at a time.

#### 9.3 Commands keep their inputs; judgments become decisions

The next action names its command, which status renders (`handlers/status/lifecycle.ts`), and cites records by stored
reference:

- **`continue-pre-publication-review` toward `arc review respond`** names the result it responds to by its
  `review/outcome` key, in place of `responseOperationId` and `responseSource`, a machine-local operation ID and a
  positional source reference (`receiptRef`, `outcomeRef`, or `attemptRef`).
- **The `--resume` token** (`buildPrePublicationResumeCommand`, decoded by `PrePublicationReplayInputSchema`) keeps the
  call's own inputs as today — the Candidate binding, self-review settlement, the change set, each lane's scope mode and
  invocation, the scope judgment target, and the ordering-recovery input. The Owner's judgments it carries today — a
  ceiling override, an additional pass, and a terminus — leave it and become decisions the resolution reads (§ 5). With
  them go `frontlineCeilingHeadSha`, which today keeps a frontline override off a moved frontline head, and the
  scrubbers `consumeOwnerAcceptedTerminus` and `consumeFrontlineCeilingOverride`
  (`rg/policy/pre-publication-request.ts`): the frontline override decision's reach, the frontline head it was decided
  on, binds it, and a terminus binds only where its reach carries it (§ 5.6).
- **The frontline resolve form's `request` and `authorizationRequest`** keep their call inputs on the same rule: an
  Owner judgment either carries becomes a decision.

#### 9.4 The hosted reservation

The reservation (`StandardReviewReservationV1Schema`) keeps its sources, target, and obligation, and its ID, which
digests the Candidate ID with them. Readiness mints it where the standard lane awaits its change request
(`createStandardReviewReservation`, `rg/policy/pre-publication-procedure.ts`), so readiness recorded again for the same
Candidate mints the same reservation. Its carry keys on the Candidate: readiness recorded again for the same Candidate
keeps it in the settled boundary it writes (`preservesReservation`, `persistBoundary` in `handlers/review.ts`); a
boundary awaiting self-review or a fix holds none (`CandidateSelfReviewBoundarySchema`, `CandidateFixBoundarySchema`);
and a re-root's new Candidate ID drops it, a delivery reservation surviving through `supersedes`. The policy driver
writes its review boundary with no reservation and no post-attest continuation (`policyEnvelope`,
`rg/policy/pre-publication-procedure.ts`), as today, though from the flip that boundary shares the variant admitting
both (§ 9.1). The carry compares no subject, by design, since the boundary's stored subject is not a second currentness
authority; the Candidate record's currentness is. At use, `assertHostedReservationBindingAuthority`
(`rg/policy/hosted-reservation-admission.ts`) checks the repository, the target kind, the Candidate ID, and that the
current Candidate head is the hosted target's head. This change keeps each check.

#### 9.5 Write check

The kind's write check carries the boundary schema's rules (`IntegrationBoundaryLocusSchema`,
`rg/policy/integration-boundary-locus.ts`): the next action, reservation, and continuations each locus admits, as its
variant's refinements state them today, and each delivery member at most once in `deliveryReviewTermini`, as its
refinement requires today, with `readinessBinding` present exactly on `candidate-publish-ready` and
`publication-pending`. Today's store adds only parsing and a version compare (`writeSubmissionBoundary`), which the
store's own versions carry.

### 10. Withdrawal, re-root, and retirement

#### 10.1 Withdrawal is recorded

Today reopen returns an Integrating work unit to Active and closes or drafts its pull request (`withdraw-pr`,
`lib/work-unit/side-effects/withdraw-pr.ts`), touching neither the Candidate nor its boundary (`runReopen`,
`lib/work-unit/verbs/reopen.ts`). A `publication-pending` boundary then admits publication through
`authorizeActivePublication`'s `publication-pending` arm, and a no-change `arc attest` re-carries the boundary, so a
deliberate withdrawal keeps its publication authority, and nothing tells it from an interrupted publish.

Publication authority is the boundary's state alone: `authorizeSubmission` admits only `candidate-publish-ready`, and
`authorizeActivePublication` only that or `publication-pending` (`lib/work-unit/verbs/publish.ts`). From the flip,
reopen rewrites the boundary, for the same Candidate, to `candidate-review-pending` with the next action
`arc review pre-publication <slug>` and no reservation, as `projectCandidateReviewBoundary` writes it, in the same batch
as its lifecycle write. This change adds that write to the lifecycle change's store-backed reopen (`runStoreReopen`,
`lib/work-unit/verbs/reopen-store.ts`). Then:

- both authorizers refuse the reopened work unit's publication, as they refuse any boundary still in review;
- a no-change `arc attest` keeps the matching boundary rather than restoring publication authority, since the singleton
  publication recovery takes only an Integrating work unit (`recoverAttestedSingletonPublicationBoundary`,
  `rg/policy/integration-boundary-locus.ts`), so publication waits until `arc review pre-publication` records readiness
  again over the Candidate's recorded review;
- an interrupted publish, whose boundary stays `publication-pending`, keeps its continuation as today, so the two read
  apart. A work unit reopened before the flip imports with its boundary as it stands (§ 11.2).

Withdrawal ends publication authority only. The Candidate and its decisions stay as they were, so every decision keeps
the reach § 5.6 gives it, and readiness, recorded again, binds the same Candidate and mints the same reservation where
the standard lane still awaits its change request (§ 9.4).

#### 10.2 A re-root removes no decision

Today a re-root after code changes overwrites the boundary, the terminus's only home, and drops it, except in a
corrective delivery renewal, which carries it (§ 5.6). With decisions their own records, keyed to the work item, nothing
a re-root writes removes one: each stays recorded and binds whichever later subject its reach covers (§ 5.6). A terminus
and a ceiling extra pass, whose reach is its Candidate, stay recorded without binding the new Candidate, unless that
renewal carries the terminus.

#### 10.3 Before the flip

Today's withdrawal and retirement hold, and the tracked files stay where they are.

#### 10.4 Retirement follows the work item's end

A work unit's end retires its Candidate with no write of its own. The review records ride the work item's ref, which the
ref backend moves under `refs/arc/history/work/<uid>` when the item ends — archive, abandonment, or a cut — out of the
live tips every listing reads. A reader that acts after archive, as the integration checkpoint and merge do under
`archive.cadence: with-integration`, reads the ended item's records by its work item. On a clone lacking an ended item's
history ref, a read of it as of a state version, or a write to it, refuses `state-unresolvable` naming the refs it
lacks, and the calling verb pulls them by name and retries, with no stop. The history refs and that refusal are the ref
backend's, expected from the flip; abandonment and a cut also remove every record from the ended item's ref in their
final write.

On 2026-10-16, 56 tracked files under `.arc/system/.internal/candidates/` hold 28 records and 28 boundaries, which stay
after their work units end, since the record store has no delete. The import maps a live work unit's record and boundary
(§ 11.1) and lands the rest unmapped on their work units' history refs (§ 11.2).

#### 10.5 The archived singleton

Under `archive.cadence: with-integration`, an archived singleton whose publication boundary is stale has no typed exit
today: the post-archive checkpoint routes it to an active-record continuation it cannot take. The case closes at the
flip, when records leave the branch and a work unit's own writes stop moving its head; no continuation is built before
it. From the flip, recovery authority binds typed Candidate and lifecycle records, never whether a meta sits under
`active/` or `completed/`.

### 11. The import's mapping

The ref backend's import reads today's substrates once into the store and runs no write check, and until this change
supplies the review family's mapping it lists the review gate's facts and refuses. This change builds that mapping as a
pure module under `lib/store/kinds/review/`, which the import calls: given today's records as read, it returns the new
records with their work items and keys, and a listing that accounts for every record it was given as mapped, left behind
with a reason, or in flight. The import's reads, its writes, its trial, and its refusals stay the ref backend's.

The mapping expects one contract of the import, available from the flip: that it gives the mapping the review gate's
whole folder under the Git common directory (`arc/review-gate/`), its quarantined and retired records among them; each
live work unit's Candidate versions, oldest first from the record's path log, with its current boundary; and, for each
work item today's records name, whether that item is live by § 11.1's test and the UID the import minted for it
(§ 11.3); and that it lands what the mapping returns for those records in place of landing them as state.

#### 11.1 Live work

Live work is any work item a later verb may still read to decide: Errands not yet settled — open, paused, or awaiting
merge (`lib/errand/identity-record.ts`) — and work units neither abandoned nor cut, unless both archived and merged. A
work unit merged but not yet archived, routine under `archive.cadence: manual`, is live, and so is one archived and
awaiting merge under `archive.cadence: with-integration`. Under the manual cadence archive follows merge, since merge
readiness refuses a work unit already archived there (`wrong-cadence`, `rg/readiness.ts`); otherwise a work unit is
merged when its branch has landed in base by patch identity (`isLandedInBaseStrict`), tested against `origin/<base>`
where it resolves and the local base otherwise, as locus tests it. A multi-commit squash merged outside ARC reads
unlanded, so its work reads live and is imported, which is safe.

The review gate's machine-local facts are imported for live work only. A shipped change's review lives on in its pull
request on the host and in the commits that carried its records, and nothing reads an ended item's facts to decide.

#### 11.2 The mapping

- **Lane progress's attempts (`operations/`, `lane-progress`), each but `pending`** — one `review/outcome` each (§ 4),
  keyed as § 4.1. A local attempt joins its receipt (`evidence/receipts-v2.json`) and its `local-review` operation
  record by `requestId` for its request, actors, policy binding, and attestation; a frontline attempt joins its
  frontline outcome (`outcomes/`) by operation ID; a hosted attempt keeps its sealed result.
- **A `pending` attempt** — nothing: listed as in flight, and the import refuses until the cutover's quiesce has
  finished it.
- **`completedPasses`, `terminalProducer`, `settledFindingIds`, `attemptedSources`, tail pointers** — nothing: each
  derives from the records (§ 4.3, § 6.3).
- **An approved-disposition record (`evidence/disposition-*.json`)** — one `review/evidence` per disposition set the
  record holds (`ApprovedDispositionLineageNodeSchema`, § 6), naming the predecessor the record gave it
  (`predecessorDispositionSetId`) and, where one was approved over it, its successor (`successorDispositionSetId`); its
  result resolved from today's source reference to the result's outcome key; its performance joined with lane progress's
  response performance for that set, and its settlement with the hosted attempt's settlement evidence and finding
  actions for that set.
- **A conditional pass authorization** — an `approved-fix` extra-pass decision keyed by its `authorizationId`, its
  `authorizedBy` and `capturedAt` the decider and time. A consumed one's admitting attempt, which `admissionId` names,
  cites it as `admittedBy`; a withdrawn one also gains a withdrawal decision from `withdrawnBy` and `invalidatedAt`; a
  superseded one stays derived from its successor set's evidence.
- **The frontline skip marker (`operations/`, `frontline-phase`)** — a frontline lane-skip decision on its Candidate,
  reaching its supersession chain (§ 5.6), with no decider and its `updatedAt` as the time.
- **The repository ID (`identity/repository-identity.json`)** — the project ID.
- **A live work unit's Candidate record, every replayed version** — `review/candidate`, every version, transitions whole
  (§ 8). A work unit reopened before the flip keeps its `publication-pending` boundary through the import: today's
  records cannot tell a deliberate withdrawal from an interrupted publish, both admitted by
  `authorizeActivePublication`'s `publication-pending` arm (`lib/work-unit/verbs/publish.ts`), so it keeps its
  publication authority after the import, as it does today, and a reopen from the flip withdraws it. Each review
  response's approval joins the evidence record for its disposition set, which also holds the machine-local approval, so
  one disposition set yields one record; a review response that later versions repeat maps once, at the first version
  holding it.
- **A live work unit's boundary, at its current content** — `review/integration-boundary` (§ 9.1). Its `terminus` and
  each `deliveryReviewTermini` entry become terminus decisions, decided by `acceptedBy` with no time, their basis the
  pass count they hold, and the boundary names each by key where it held it (§ 9.1). Today's terminus records no subject
  of its own (`OwnerAcceptedReviewTerminusSchema`, `rg/policy/review-terminus.ts`) and binds where its boundary holds
  it, so the boundary's `terminus` takes as its subject the Candidate and subject digest the boundary was written for
  (`candidateId`, `candidateSubjectDigest`), and a member's entry takes its member vehicle. The `--resume` token's
  judgments become decisions with no decider, an extra pass the lineage has already used reading as spent (§ 5.5): an
  additional pass becomes an `additional` extra pass; a ceiling override becomes a `ceiling` extra pass unless it cites
  a conditional pass authorization (`conditionalPassAuthorizationId`), which maps to nothing, since that authorization's
  `approved-fix` decision covers it; and a terminus maps to nothing where the boundary carries a terminus, and otherwise
  becomes a terminus decision on the boundary's subject, as above, whose basis is the pass count the imported outcomes
  give its Candidate, passes carried across its supersession chain included, as the token's terminus counts them today
  (`readLaneProgress`'s inherited passes, `rg/policy/pre-publication-composition.ts`), so no one is asked to accept
  again. `responseSource` becomes its result's outcome key, and `"tier-3"` becomes `"merge"`.
- **The boundary's `standardLaneOwnerVersion`** — `readinessBinding`, computed over the imported records, only when the
  version equals the standard lane's current progress version; otherwise, the field's absence included, the boundary is
  left unbound, so publication refuses and readiness records again, as today (`authorizeActivePublication`).
- **Disposition records in an older shape, which today's reader skips (`parseEnumeratedRecord`)** — left behind: 192 of
  the store's disposition records on 2026-10-15.
- **The review gate's facts for work that is not live** — left behind (§ 11.1).
- **`quarantine/` and `retired/`** — left behind: quarantined disposition records and retired snapshots of earlier
  stores, machine-local under D5, which no reader decides from.
- **A not-live work unit's Candidate and boundary files** — not mapped: they land in today's shape on their history
  refs, where an ended item's records are retired by derivation (§ 10.4).
- **Sources, materializations, locks, the hosted request owner index, `local-review` records, and
  `refs/arc/review/local*`** — not mapped: working state, read only for the joins above.

Two decisions with the same content map to one record, since a decision is keyed by its content (§ 5.2). A live work
unit archived and awaiting merge has its records mapped, though the import lands them on its history ref.

#### 11.3 Work items and keys

Each record's work item resolves from the slug or vehicle today's records name — a Candidate's work unit, through its
supersession chain for a superseded Candidate's ID; a delivery member's work unit; an Errand's claim — to a UID the
import mints. A result's work item is the one its lineage names (§ 2.3), and its evidence lands on the same work item,
so a disposition with no binding lands on its result's. A hosted response's producer ID, which is the attempt's
acknowledged `attemptId`, resolves to its attempt's admission ID, the outcome's key.

#### 11.4 Mapped records are valid

The import runs no write check, so the mapping guarantees what the checks would: every record it returns parses under
its kind's schema and passes its kind's write check over the set it returns. `history` returns each version's content
unparsed (`HistoryEntrySchema`, `lib/store/contract.ts`); a live chain is mapped whole, so a chain walk meets one shape,
and nothing walks the chain of work that is not live to decide.

### 12. Delivery at the flip

#### 12.1 `arc attest`'s meta writes, and its refusal on a paused work unit

Today `arc attest` writes an Active work unit's meta through `setMetaBulletFields`
(`handlers/lifecycle-delivery-review.ts`): `Current Workflow` and `Next Action`, with the values `ATTESTED_ORIENTATION`
supplies (`lib/work-unit/verbs/attest.ts`); `Last Completed`, the task list's last completed task
(`resolveLastCompletedTask`); and `Next Task`, cleared to `[none]`. It writes the `Candidate` bullet through
`setMetaCandidate`. From the flip:

- it writes `Current Workflow` and `Next Action` through the meta kind's field writers, inside the batch that writes the
  Candidate and its boundary, and writes none of `Last Completed`, `Next Task`, and `Candidate`, as the meta kind's
  shipped field table settles: from the flip no verb writes the first two, and the Candidate record's
  `attestation.candidateId` holds the third;
- it first reads the work unit's pause and, when the work unit is paused, refuses with a typed reason naming
  `arc resume <slug>`, writing nothing; after `arc resume` the same call succeeds.

The pause is the lifecycle change's, effective from the flip: pausing replaces parking and records the pause in the work
unit's meta (its parsed `pause` field), and every verb that advances a paused work unit refuses the same way
(`checkAdvancingPause`, `lib/store/lifecycle-pause.ts`). This change reads it and adds no pause state of its own.

The meta's `Candidate` bullet has readers, and from the flip each reads the work unit's `review/candidate` record's
`attestation.candidateId` instead, a move this change makes: the lifecycle change's store-backed publication, which
refuses a Candidate the meta does not name (`inspectPublication`, `lib/work-unit/verbs/publish-store.ts`); and
session-init's projection of the work unit's boundary (`commands/active/status.ts`) and the subject's Candidate
authority (`lib/locus/subject-meta.ts`), both fed by the active meta reader (`lib/active/meta-reader.ts`). The
staged-archive comparison (`lib/locus/derived-evidence.ts`) compares the bullet across an archive's two metas, absent in
both from the flip, and needs nothing.

#### 12.2 A task's captures read as the branch commits they match

No delivery or review code reads a task's captures today: delivery attributes a branch's commits to tasks by their
`Context:` footers (`deriveTaskAttributions`, `lib/delivery/from-branch.ts`). Whichever reader moves onto captures —
delivery's attribution, within delivery's own redesign — reads a task's captured commits as the branch commits they
match, each once, by SHA or by copy key — the match the task close verb applies (`computeDefaultCaptureSet`,
`lib/git/default-capture-set.ts`), over keys from `computeCopyKeys` (`lib/git/copy-key.ts`) — never from the captures
list alone, since captures only grow and may include one a rewrite has since replaced, which then matches nothing. The
close verb applies that match to find the commits no capture holds; a reader applies it to find the commits one task's
captures hold. The close verb, its match, and the copy key's function are the lifecycle change's; this change sets the
rule their readers follow and adds no reader.

#### 12.3 Links name the project ID

From the flip, when a work unit's merge lands, the landing (`scripts/integration/merge.ts`) writes its landing-commit
link (`landingCommit`, `lib/store/links.ts`), which locus reads under `archive.cadence: with-integration` to tell an
archived work unit awaiting merge from a retired one. The link's repository is the project ID, read once per invocation
from the project's identity record (`project-registry/identity`) through the project-ID port (`projectId`) the lifecycle
change injects and the cutover binds; the in-repo implementation stores no project identity, so no link is written
before the flip. The hosted path's `owner/repo` stays a host locator inside the hosted result (§ 4.5).

Under `with-integration` the work unit is archived when its merge lands, so the link is a write to a completed item: on
a clone lacking that item's history ref, the write refuses `state-unresolvable` naming the refs it lacks, and the
landing pulls them by name and retries, as every verb writing a completed item's records does (§ 10.4). No verb writes a
change-request link today: a workflow step opens the pull request (`gh pr create`, `integrate-work-unit.md`), and
archive records it only as the meta's `PR URL` (`lib/work-unit/verbs/archive.ts`). Whichever verb the cutover's rewrite
gives that step writes the link, naming its repository the same way.

#### 12.4 Locus's arms

Three reads branch on `stateOffBranch` for the store-derived locus from the flip, where Errands are project-scope work
items listed at placement `active` and claims stay identity-scoped, each acquired on its own:

- **The review gate's Errand reads** (`readLocalReviewLiveContext`, `rg/hosts/local/live-context.ts`;
  `resolveActiveErrand`, `rg/runtime/respond-composition.ts`). Today they read this identity's transient snapshot
  (`readTransientInFlightIndexes`, `projectTransientInFlightRead`, `lib/errand/record.ts`), refuse when it is
  incomplete, and take the claim on the checkout's branch: the live context an open or awaiting-merge one, refusing when
  several claim the branch, and respond's Errand resolution an open one only, resolving none when several match. From
  the flip this identity's claims, which admit no diagnostic, give the claim on the checkout's branch under the state
  filter each read applies today, and the subject Errand's record resolves by `lookup` through that checkout claim
  (`CheckoutClaimSchema`'s `errand` arm, `lib/store/lookup.ts`) and is read; review refuses, naming the record and what
  was reported, where either refuses with anything but `not-found`. A diagnostic in the listing of Errands refuses
  nothing by itself, since another person's malformed record is not this review's to repair; where the lookup finds no
  Errand while that listing carries one, review refuses naming those diagnostics and their remedies, since one may be
  the subject's own record.
- **The integration checkpoint's lifecycle read** (`readLifecycleSummary`,
  `scripts/integration/checkpoint-composition.ts`). Today it composes the lifecycle index over the checkpoint's
  versioned file view (`resolveComposedLifecycleIndex`) for the work unit's position and its meta's artifact facts;
  merge calls it too, to compare (`readStatus`, `scripts/integration/merge-composition.ts`). From the flip it reads the
  work unit's current meta record through the store, at the checkpoint and at merge alike, merge comparing that record's
  version with the one the checkpoint bound (§ 3.2): its position from the record's placement and lifecycle state, and
  its artifact facts from the stored meta, never from the export (§ 12.5).
- **`arc status <slug>`'s operational-boundary read** (`resolveSlugOperationalBoundary`,
  `handlers/status/lifecycle.ts`). Today it reads the boundary only through a materialized worktree, and warns without
  one. From the flip it reads the boundary record through the store for an active or integrating work unit, wherever it
  is checked out, which restores the interrupted-publication hint that the lifecycle change's store-backed status drops
  (`integrationBoundary: null`).

#### 12.5 D18's export and its review copy

From the cutover the Candidate review subject is the code in the Git index alone. `collectGitCandidateSubject` selects
reviewable entries through `classifyPathTreatment(path, context)`, whose context carries the work unit and its
projection paths, and whose work-unit arms the cutover removes once their consumers move off them.

This change builds D18's export, effective at the flip, since until then specs ride the branch: the
`storage.track_design_docs` option (`lib/config/schema.ts`) and the copy at `.arc/specs/<slug>/`. One export function
writes and stages the copy at the points D18 names, each a ceremony that commits on the branch: `arc attest` adds it
before fixing the subject, and the review-fix path (`arc review respond`) re-exports it when a fix amends the stored
spec, the re-export riding that fix's own commit. From the flip attest's records need no commit, so the cutover's
rewrite keeps attest's commit step for the copy alone, as the storage contract's D15 keeps one for any ceremony that
changes tracked files. A candidate-tail step the cutover's rewrite adds deletes it.

The merge lock guards the delete, with no check of its own (§ 13, item 6). Where the project locks merges
(`merge.lock: draft`), the pull request stays a draft until `arc integrate merge` releases the lock for the checkpointed
head (`releaseLock`, `scripts/integration/merge.ts`; § 12.7), after the candidate tail, so no accidental merge in the
host outruns the delete. A draft is a procedural hold that anyone with write access can lift (`gh pr ready`), so a
deliberate merge before the delete, or any early merge where the project sets no lock, leaves the copy on the base
branch, which an ordinary change removes, as D18 names for a project with no merge gate; nothing reads the copy back.

The delete must not reopen review, so lifecycle classification keeps the one arm D18 names (§ 13, item 5): the work
unit's own export path is evidence-neutral, as its design artifacts are today (`isWorkUnitArtifactOrCompanion`,
`lib/evidence-applicability/path-treatment.ts`). No code knows the export path yet, so the export brings that arm to
`classifyPathTreatment`. The arm classifies by path alone, and the subject digests reviewable entries only
(`createCandidateSubjectSnapshot`), so adding, re-exporting, and deleting the copy all leave the subject unchanged; the
copy reaches review on the pull request, where D18 has design artifacts reach review only through the export. Subject
construction cannot carry the arm instead: the copy is never in base, so once deleted its path drops out of the
base-relative diff and the subject never sees the delete. The arm survives the cutover's removal of the other work-unit
arms.

A stacked delivery meets the copy a second way. Delivery's lifecycle-contribution path group
(`CurrentDeliveryLifecycleContributionPathSource`, `lib/delivery/lifecycle-contribution.ts`) holds the work unit's
artifacts, ROADMAP, and the Candidate and boundary records today, and three readers take it, each only under a delivery
plan: terminal-delta classification (`classifyDeliveryTerminalDelta`), the member revalidation that holds every group
path to the protected base (`revalidateDeliveryLifecycleContribution`), and the completeness comparison, which reports a
group path the base lacks as invented (`compareNormalizedDeliveryTree`). In that group no member could carry the copy,
and outside it the candidate-tail delete reads as non-lifecycle content. The export adds nothing to the group, and how a
stacked delivery's members treat the copy is left to delivery's own redesign; delivery stays paused until then.

Completion Notes and the Release Notes Entry come from the stored meta under every export option, never from the export
or the pull request's head tree.

#### 12.6 Other changes at the flip

- **`verificationKind: "tier-3"`,** stored in the integration boundary (`RunConvergenceVerificationActionSchema`,
  `rg/policy/integration-boundary-locus.ts`) and accepted by `arc attest` (`lib/work-unit/verbs/attest.ts`), becomes
  `"merge"`, the merge quality gate's declared name, when the boundary reshapes at the flip, in both places together;
  the import rewrites it in each live boundary (§ 11.2). Renaming a live record's value before then would stop older
  records parsing.
- **Raw review reports are scratch.** Chunk reports, aggregate results, and evaluator reports in the work unit's
  workspace are inputs to the records above, never evidence of their own; from the flip they belong in the work unit's
  scratch folder, which nothing archives.
- **Workflow text** changes once, in the cutover's rewrite: the adversarial-review method's fire-points onto the
  recording verb (§ 7.2), review reports into the scratch folder, a verb for opening the pull request that writes the
  change-request link (§ 12.3), the candidate-tail step that deletes the review copy (§ 12.5), and the removal of the
  record-commit and keep-staged steps (§ 14.3), keeping attest's commit step for the review copy (§ 12.5).

#### 12.7 The merge lock's readiness read

`arc integrate merge` releases the merge lock only for a lifecycle-ready work unit (`releaseLock`,
`scripts/integration/merge.ts`; `readiness-failed`, `rg/merge-lock.ts`), and `evaluateReviewReadiness`
(`rg/readiness.ts`) decides that today from a file view. Two composition roots evaluate a work unit's readiness: merge's
lock port reads the pull request's head tree (`createGitTreeReadFs`, `scripts/integration/merge-composition.ts`), and
`readinessBoundTo` (`handlers/review.ts`), behind `arc review readiness` and `arc merge lock`, reads the files under the
request's tree root. Readiness reads:

- the work unit's meta, Integrating under `.arc/active/` with a `Branch` naming the head branch under the manual cadence
  (`evaluateManualWorkUnit`), or archived under `with-integration` (`evaluateArchivedWorkUnit`), and its Completion
  Notes and Release Notes facts (`lifecycleArtifactFacts`);
- for an archived work unit, a cleared `Branch`, a well-formed `Completed` date, and a `PR URL` naming the guarded pull
  request (`pr-url-mismatch`); every other meta, each of which must parse (`lifecycleCandidateFacts`); and, where its
  `Cohort` names one, the cohort's planned and completed documents (`cohortCloseoutFacts`).

From the flip none of these ride a tree, so both composition roots give readiness the store, and readiness reads the
same facts through it, refusing as today:

- the work unit's meta record: its position from placement and lifecycle state, and its notes facts from the stored
  meta, never from the export (§ 12.5);
- under the manual cadence, its branch from the work item's branch link;
- for an archived work unit, the lifecycle listing's diagnostics in place of parsing every other meta, and the cohort
  document's record, its placement and its closeout, in place of the planned and completed files.

Three archived facts change. From the flip no verb writes `Branch`, `PR URL`, or `Completed` to the meta — the meta
kind's shipped field table gives the first two to the work item's links, and the lifecycle change's archive writes none
of the three (`runStoreArchive`, `lib/work-unit/verbs/archive-store.ts`) — so only a meta imported from before the flip
still holds them:

- the cleared-branch fact retires: a completed work item keeps its branch link by the lifecycle change's design, and
  placement `completed` already shows that archive ran;
- the completion-date fact retires on the same ground: placement `completed`, with the quarter archive records and the
  sequence the backend assigns, shows that archive ran;
- the pull-request fact reads the work item's change-request link and refuses `pr-url-mismatch` when the link's number
  is not the guarded pull request's. Where no link exists — a pull request opened before the flip, since no verb writes
  one until the cutover's (§ 12.3) and the import builds none, or one opened later outside that verb — readiness passes
  the fact, and the release rests on the target merge took from its checkpoint and on the lock's live binding
  (`bindLiveTarget`, `rg/merge-lock.ts`), which refuses unless that pull request is open in the authenticated repository
  at the head being released. Readiness still refuses a pull request whose head branch names another work unit
  (`vehicle-branch-mismatch`, `identityFacts`), so what a direct `arc merge lock release` lets through is a pull request
  with no link on a branch naming this work unit, under a lock that is itself a procedural hold (§ 12.5).

An Errand's and a delivery member's readiness read no lifecycle state, so neither changes, including a delivery member's
lock release through `readinessBoundTo` (`handlers/delivery-execution.ts`); the delivery reads (`deliveryMemberLookup`,
`readDeliveryAncestry`) stay on Git.

### 13. Forward amendments to the storage contract

`spec-storage-contract.md` is shipped; these amend it forward, effective when this change lands:

1. **D5: `review/terminus` becomes `review/decision`,** carrying every decision about a review subject outside the
   Candidate's own selections — extra passes, termini, lane skips, and withdrawals — not termini alone. The ref
   backend's layout row for `review/evidence`, `outcome`, and `terminus` names `decision` in place of `terminus`.
2. **D5: the review gate's operation records keep in-flight state only.** The durable facts they hold today — attempt
   results with their sealed hosted results, response performance, settlement, and pass authorizations — are outcomes,
   evidence, and decisions, which must survive a change of machine like the rest of the family. Operations, locks,
   materializations, and quarantine stay machine-local under `.git/arc/review-gate/`.
3. **D5: an adversarial pass is one record of its own shape** — a typed header and the report as prose (§ 7) — rather
   than records sharing the review gate's disposition set, approval, rubric binding, and pass-to-pass lineage.
4. **D5: that record holds no next-pass authorization** for a launch to consume; a pass over the cap carries its own
   approval.
5. **D18: the review copy is evidence-neutral in every direction.** D18 has the export added at prepublication, before
   the review subject is fixed, since export is design's one route into review, and re-exported as an ordinary reviewed
   fix, while lifecycle classification keeps one narrow arm for the export path so the delete does not reopen review.
   That arm classifies by path, so the add, the re-export, and the delete all leave the subject unchanged: the copy
   reaches review on the pull request, and a re-export rides its fix's review without entering the subject (§ 12.5).
6. **D18: no `merge-ok` check.** D18 has a required `merge-ok` check fail while a pull request's tree holds
   `.arc/specs/`, so that no merge outruns the candidate-tail delete. The merge gate's one required check is `ci-ok`,
   which asserts only that required CI passed, not that a pull request may merge
   (`reference/templates/arc/merge-gate/README.md`, `strategy-work-organization.md`). A check red through every review
   would turn `ci-ok` red, or take a second required check and an exception in each required-check read before the
   candidate tail, so none is built. The merge lock keeps an accidental merge from outrunning the delete where a project
   sets it (§ 12.5), and D18's named cost for a project with no merge gate, an early merge leaving the copy on the base
   branch for an ordinary change to remove, covers a deliberate merge before the delete and a project that sets none.

### 14. Scope and order

#### 14.1 One work unit

The boundary read keeps the change whole. Its concern is one: where the Candidate's and the review gate's durable facts
live, and what each mechanism that reads or writes them does from the flip. Delivery and review records are one family
in the contract, and their files name each other throughout: splitting delivery from review would leave two halves
serializing on `handlers/lifecycle-delivery-review.ts`, `handlers/review.ts`, and the review gate's stores. The change
is reviewed in chunks on one branch, and no chunk lands on its own, so it carries no delivery plan.

#### 14.2 What this change takes

- **The Candidate and its boundary:** `lib/work-unit/candidate-record-store.ts` and
  `lib/work-unit/submission-boundary-store.ts`, which stay in place as the in-repo implementation's adapters, their path
  resolvers and chain and revision reads going to `lib/store/kinds/review/`, and the unit tests that stub them by path
  for a rerouted caller (§ 3.1); `handlers/candidate.ts`; `lib/work-unit/candidate-applicability-resolution.ts`, which
  takes its record type from the kind's schema; `commands/rename.ts`, which reads both records to refuse renaming a work
  unit with publication state; `handlers/lifecycle-delivery-review.ts`'s attest, publication-claim, and reopen-permit
  sites (`handleAttest`, `claimPublicationBoundary`, `permitDeliveryReopen`), beside the lifecycle change's publication
  and reopen changes in the same file; `lib/work-unit/verbs/attest.ts`, whose result schema and remedy text carry the
  Candidate record's commit (`recordRevision`, `candidateRecordRevision`) in-repo and a store version from the flip;
  `lib/work-unit/git-candidate-subject.ts`, `lib/work-unit/git-candidate-effective-target.ts`, and
  `lib/work-unit/candidate-effective-target.ts`; `handlers/delivery-entry.ts`; and `lib/delivery/repository-entry.ts`.
- **The boundary's shape and publication's authority:** `rg/policy/integration-boundary-locus.ts`, which holds the
  boundary's and next action's schemas and projections that reshape (§ 9.1, § 9.3, § 12.6);
  `lib/work-unit/verbs/publish.ts`, whose two authorizers compare the readiness binding from the flip (§ 9.2); and the
  lifecycle change's `lib/work-unit/verbs/publish-store.ts`, whose store-backed publication carries the readiness
  binding in place of `standardLaneOwnerVersion` and the boundary's terminus (§ 9.2), and its
  `lib/work-unit/verbs/reopen-store.ts`, whose batch rewrites the boundary (§ 10.1).
- **Delivery's review reads and writes:** `lib/delivery/review-fix.ts`, which builds the advanced disposition record a
  delivery member's fix writes; `lib/delivery/review-fix-continuation.ts`, which reads its resolved policy request; and
  `handlers/delivery-execution.ts`'s disposition and operation-state reads, its disposition write, and its Candidate and
  boundary reads and writes with their staging (§ 14.3). The rest of `handlers/delivery-execution.ts` is delivery's own,
  and changes with it rather than here.
- **Readers of the meta's `Candidate` and of the records' paths:** `commands/active/status.ts` and
  `lib/locus/subject-meta.ts` (§ 12.1), with the lifecycle change's `lib/work-unit/verbs/publish-store.ts`;
  `handlers/status/lifecycle.ts`'s operational-boundary read (§ 12.4); and the path classifiers
  `lib/base-drift/current-adapters.ts`, `lib/delivery/lifecycle-contribution.ts`, and
  `lib/delivery/review-fix-record-effects.ts`, which take the path resolvers from their new home (§ 3.1).
- **Integration:** `scripts/integration/checkpoint-composition.ts`, whose lifecycle read branches at the flip (§ 12.4),
  `checkpoint.ts`, and `merge.ts`, which writes the landing-commit link from the flip (§ 3.2, § 12.3), and
  `candidate-response-confirmation.ts`, `checkpoint-store.ts`, `errand-merge-composition.ts`,
  `lineage-review-composition.ts`, and `merge-composition.ts`, whose Candidate, boundary, disposition, and outcome reads
  move onto the store, and whose merge-lock port gives readiness the store from the flip (§ 12.7). The checkpoint record
  itself stays machine-local.
- **The review gate's stores:** `rg/hosts/local/disposition-record-store.ts`, `frontline-outcome-store.ts`,
  `receipt-store.ts`, `operation-state-store.ts`, `source-store.ts`, `hosted-request-owner-index.ts`, `live-context.ts`,
  and `git-common-state.ts`, whose `resolveRepositoryIdentity` takes the project ID from the flip (§ 2.4), with
  `lib/git-common-state.ts`. Each keeps its in-repo arm; from the flip the facts § 4–7 name leave them for the store,
  and operation records keep in-flight state in a namespace of their own (§ 4.7).
- **The review gate's policy, runtime, and status:** `handlers/review.ts`; `rg/policy/delivery-review-terminus.ts`,
  `pre-publication-composition.ts`, `pre-publication-request.ts`, `review-policy-evidence.ts`, `frontline-phase.ts`,
  `frontline-operation.ts`, `frontline-command.ts`, `mechanical-review-applicability-carry.ts`,
  `earlier-review-applicability.ts`, `local-review-coverage-selection.ts`, `review-applicability-resolution.ts`,
  `review-policy-driver.ts`, whose `phase-closed` skip reason and window diagnostic are renamed (§ 5.9), and
  `assurance.ts`; `rg/readiness.ts`, whose lifecycle reads branch at the flip, with `handlers/review.ts`'s
  `readinessBoundTo` giving it the store (§ 12.7); `rg/runtime/local-prepare-composition.ts`, `respond-composition.ts`,
  `respond-command.ts`, `singleton-publication-response.ts`, `candidate-response-head-continuation.ts`,
  `local-attest-command.ts`, `local-pending-replay.ts`, `local-resume-command.ts`, and `reduce-command.ts`;
  `rg/core/review-subject.ts`, whose branch-to-work-unit resolution (`branchToWorkUnitSlug`) becomes the store's reverse
  `lookup` on the branch link; `rg/status-composition.ts` and `rg/status-errand.ts`'s review reads; and the importers of
  the review gate's state modules that no other group names: `rg/hosts/local/frontline-materialization.ts` and
  `review-result-reader-composition.ts`, `rg/policy/candidate-review-fix-continuation.ts` and
  `hosted-reservation-discharge.ts`, `rg/runtime/frontline-run-composition.ts`, `local-attest-composition.ts`,
  `local-resume-composition.ts`, and `reduce-composition.ts`, and `rg/status-singleton.ts`.
- **The schema modules the family splits,** `rg/core/operation-state-schema.ts` and `rg/core/advisory-records.ts`, and
  every module importing either — 35 import the first and 24 the second — by role:
    - _The family's writers._ The lane-progress transitions — `rg/lane-progress.ts`, `lane-progress-conditional.ts`,
      `lane-progress-hosted-request.ts`, `lane-progress-hosted-settlement.ts`, `lane-progress-seal-recovery.ts`, and
      `hosted-response-completion.ts` — write outcomes, evidence, and decisions, and the frontline skip marker becomes a
      lane-skip decision (§ 5.9). `rg/runtime/local-attest-command.ts`, `rg/runtime/local-pending-replay.ts`,
      `rg/runtime/local-resume-command.ts`, and `rg/policy/frontline-operation.ts` run in-flight admission, which stays
      working state, but write a result that becomes an outcome.
    - _The kinds' write checks._ `rg/core/lane-attempt-validation.ts` and `rg/core/lane-progress-state-validation.ts`
      carry today's invariants into the outcome and evidence checks (§ 4.8, § 6.5).
    - _Readers composing from records._ `rg/hosts/local/review-result-reader.ts`, `rg/core/review-result.ts`,
      `rg/core/review-result-disposition.ts`, `rg/policy/review-policy-evidence.ts`,
      `rg/policy/pre-publication-request.ts`, `rg/runtime/reduce-command.ts`, and `rg/lane-progress-supersession.ts`,
      which carries pass counts across supersession.
    - _In-flight admission and retry, staying working state in the new namespace._ `rg/core/local-operation.ts`,
      `rg/core/local-prepare.ts`, `rg/core/local-source-sweep.ts`, `rg/lane-progress-local-retry.ts`,
      `rg/runtime/local-prepare.ts`, `rg/runtime/local-prepare-retry.ts`, `rg/core/frontline-retry-contract.ts`, and
      `rg/runtime/frontline-retry-remedy.ts`, with `rg/policy/frontline-pending-admission.ts`, which withdraws a
      frontline admission that never ran (§ 4.7, § 5.5), and `rg/runtime/frontline-admission-validation.ts`, which
      confirms the admission is still held before its run starts.
    - _Registration._ `rg/core/ports.ts` and `rg/core/register-review-schemas.ts` take the new kinds' ports and schemas,
      and `rg/core/schema-inventory.ts` and `REVIEW_DURABLE_RECORD_INVENTORY` list what is stored (§ 6.6).
    - _Unchanged unless their shapes change._ `rg/core/review-command-envelope.ts`, which imports only the reduction
      projection's schema, and `rg/providers/coderabbit/frontline-execution.ts`, which imports only the
      `FrontlineExecutableIdentity` type the outcome keeps.
- **The store:** `lib/store/catalog.ts` and `lib/store/registry.ts` (§ 2.1), the new `lib/store/kinds/review/` modules,
  `lib/store/kinds/registrations.ts` (§ 2.5), and `lib/store/in-repo/read.ts`, whose read of a review record takes its
  placement from the reading checkout's own tree first (§ 3.1).
- **The recording verb:** `cli.ts`, which registers `arc review adversarial record` under a `review adversarial` parent;
  its handler in `handlers/review.ts` (§ 7.2); and the help that every visible command carries,
  `lib/cli-help-summaries.ts` (`COMMAND_SUMMARIES`) and `lib/cli-help-content.ts` (`HELP_GROUPS.review`), which
  `cli-help-coverage.test.ts` requires.
- **D18's export:** the new export module; `lib/evidence-applicability/path-treatment.ts`, which gains the export path's
  arm (§ 12.5); and `lib/config/schema.ts`, which gains `storage.track_design_docs`.
- **Workflow text:** none. `integrate-work-unit.md`, `prepare-work-unit.md`, and `verify-work-unit.md` keep today's
  record-commit and keep-staged steps; the flip's rewrite of them is the cutover's (§ 12.6).

#### 14.3 Retired rather than moved

These exist only because records ride the branch. Each keeps today's in-repo arm, all behind one branch on
`stateOffBranch`; from the flip the mechanism retires, and where it carried a fact that persists, the section its bullet
cites says what holds that fact. The deletion pass removes them:

- **Write, then stage:** the `git add` sites in `handlers/lifecycle-delivery-review.ts`, `handlers/candidate.ts`,
  `rg/runtime/respond-composition.ts` (`appendCandidateResponse`, `stageCandidateResponse`),
  `rg/runtime/singleton-publication-response.ts`, and `handlers/review.ts`'s Owner terminus and pre-publication boundary
  writes; and `handlers/delivery-execution.ts`'s four, after its record-effect recovery and its Candidate and boundary
  writes.
- **`commit-*` next actions:** `commit-boundary` (`rg/policy/delivery-review-terminus.ts`, `handlers/review.ts`,
  `scripts/integration/checkpoint.ts`) and `commit-selection` (`rg/policy/review-applicability-resolution.ts`,
  `handlers/candidate.ts`), and the keep-staged rule in `rg/policy/pre-publication-composition.ts`.
- **Replays against `HEAD` or the index:** the staged-terminus recovery in `handlers/review.ts`, the boundary checks in
  `scripts/integration/checkpoint-composition.ts`, and `scripts/integration/candidate-response-confirmation.ts`'s
  `HEAD == approvedHead` check and its comparison of the committed record with the worktree's.
- **Proofs that a record commit moved the head:** `confirmCandidateResponseHeadContinuation` and the port threaded
  through the lane-progress, hosted, frontline, local-prepare, and respond modules for it,
  `projectGitDeliveryTerminalRecordAdvance` (`lib/delivery/public-review-continuation-git.ts`), the owner-terminus
  advance in `rg/status-composition.ts`, and mechanical carry's reads of the Candidate at a head
  (`gitCandidateRecordAtHead`, `recordsOwnSelection`), with their deciding consumers
  `rg/policy/earlier-review-applicability.ts` and `rg/policy/local-review-coverage-selection.ts`.
- **Protecting a subject digest from the work unit's own writes:** `candidateProjectionPaths`, and `handlers/review.ts`
  honoring an advanced boundary only while the Candidate's head is the current root.
- **Records read from history or a head tree:** the Candidate history read's in-repo arm,
  `readRepositoryCandidateSupersessionChain` and `readRepositoryCandidateRecordRevision` (`git log`, `git show`; § 3.1),
  which the store's `history` serves from the flip (§ 8.4), the shipped-delivery boundary replay in
  `scripts/integration/checkpoint-composition.ts`, and `readGitDeliveryLifecycleArtifactsAtRef`.
- **Decisions inside a command string:** the `--resume` token's judgments and their scrubbers (§ 9.3).
- **The frontline skip marker:** its record kind, operation-ID domain, published schema ID, schema-inventory variant,
  `FrontlinePhase*` names, and `readSingletonFrontlinePhaseClosure` (§ 5.9).
- **The per-clone repository ID record** (`identity/repository-identity.json`), read by nothing from the flip (§ 2.4).

#### 14.4 Order

This change builds on the merged lifecycle change: it rewrites `handlers/lifecycle-delivery-review.ts` and
`lib/work-unit/verbs/publish.ts` over that change's edits, edits its store-backed publication (§ 12.1), adds the
boundary write to its store-backed reopen (`reopen-store.ts`, § 10.1), and consumes its pause record and project-ID port
(§ 2.4, § 12.1). Its edits to `lib/locus/subject-meta.ts` and `commands/active/status.ts` serialize with the planned
locus change's on those files, and its boundary read in `handlers/status/lifecycle.ts` (§ 12.4) serializes with the
locus change's edits to that handler, over the lifecycle change's store arm there, which reports
`integrationBoundary: null`. The kinds and their registration (§ 2) precede every chunk that writes or reads through
them, and the checkpoint's binding (§ 3.2) precedes the integration reroute.

## Alternatives & Rationale

- **Store today's records as they are.** The least design now, but it builds parsers, write checks, and import mapping
  for seventeen decision shapes and for operation fields a redesign of review orchestration is set to cut. Rejected by
  the storage rule (§ 1).
- **Redesign the review and delivery process here.** It would fix the cost at its source, but it changes lanes, pass
  policy, the correction loop, and the integration path, each of which has its own design. Rejected: this change moves
  where facts live and leaves the process as it is.
- **Keep the contract's line, with operation records wholly machine-local.** Publication is gated on facts lane progress
  holds, so a machine-local operation record cannot carry a fact another machine needs. Rejected: results, evidence, and
  decisions become records, and operation records keep in-flight state only.
- **Reshape the review gate's machine-local records before the flip,** in today's stores, so the import would copy them
  as they stood. The import resolves identities anyway, and the reshape would change behavior before the flip — an
  in-flight reset, a kept Errand skip, renamed outputs, a tracked readiness field. Clearing development state instead
  would break every vehicle whose tracked records cite what it clears, while no reader before the flip needs the new
  shapes. Rejected: every review record reshapes at the flip, and the import maps today's shapes.
- **Reshape the tracked records before the flip.** It would need new staging and head-move proofs for the new shapes,
  which the flip then deletes. Rejected: tracked records map at import.
- **Clear the review gate's records at the flip,** once the import has read them. Only the importing clone's facts are
  read, so every other clone would keep records the new schemas cannot parse, and a clear would need a step that runs on
  every clone. Rejected: working state after the flip lives apart from today's records (§ 4.7).
- **Move the Candidate's responses and selections out of it.** Its reducer folds its transitions in order and its
  schema's checks span them, so splitting them would need a new ordering across records. Rejected: the log stays whole,
  each transition naming the record it rests on (§ 8).
- **Write each applicability selection as a decision record too.** The selection transition already carries the
  envelope's fields, and the Candidate's fold and its readers read the transition, so the record would be read by
  nothing. Rejected (§ 5.3).
- **An evidence record per verification response.** The Candidate transition holds every field it would, and every
  reader reads the transition. Rejected (§ 6.1).
- **Move the review copy's arm into subject construction,** so the cutover could remove path classification whole. The
  copy is never in base, so its delete leaves no path in the base-relative diff for subject construction to see.
  Rejected: the arm stays in lifecycle classification (§ 12.5).
- **Add the export path to delivery's lifecycle-contribution path group.** The group holds every path to the protected
  base in each member and in the final candidate, so no member could carry the copy, and where a stacked delivery's
  design reaches review is a delivery design question of its own. Rejected (§ 12.5).
- **Carry the step that binds a delivery member onto an evidence record written with none.** `arc review respond`
  resolves a record's binding at its first write, so from the flip no record is written unbound and bound later.
  Rejected (§ 6.5).
- **Key decisions by an offer identity.** Most decisions answer no identifiable offer — a conditional authorization, a
  lane skip, a ceiling override, and every decision the import maps — and the offer's version already guards a second
  answer. Rejected: a decision is keyed by its own content (§ 5.2).
- **A stored decision lifecycle** — pending, bound, consumed, invalidated — as the conditional authorization has today.
  Each state is either unstored (the offer) or computable (subject match, a citing attempt, a later decision or
  successor disposition set), and stored transitions drift from the facts they summarize. Rejected: decisions are
  append-only and every state is derived (§ 5.4).
- **Record mechanical carries as decisions.** It would make every carry a write and a judgment. Rejected: a decision
  exists only where someone chose (§ 5.8).
- **A policy as a decider.** It would prepay a record for a verdict a rule computes, which is derived like any
  mechanical carry. Rejected (§ 5.8).
- **Replace the attended applicability choice with a computed policy now,** as Gerrit's per-label `copyCondition` over
  change kinds and GitLab's `git patch-id` comparison compute carry. Prior art supports it, but it changes pass policy.
  Rejected here: a later rule's verdict would be derived, so this change's schemas need nothing for it (§ 5.8).
- **A `withdrawn` field on the Candidate, with `arc attest` then attesting a successor.** It takes a new field, a
  write-check rule, an attest arm, and a refusal in each authorizer, and the successor's new Candidate ID mints a
  different hosted reservation, whose use checks the Candidate ID, and leaves an accepted terminus binding nothing
  (§ 9.4, § 5.6). Rejected: publication authority is already the boundary's state, which reopen's batch rewrites for the
  same Candidate (§ 10.1).
- **Record withdrawal before the flip,** by a tracked boundary write in reopen. It fixes reopen's retained authority
  sooner, at the cost of another record commit on the work branch, which the flip removes. Rejected (§ 10.3).
- **A pre-flip archived-singleton continuation.** It would serve only `archive.cadence: with-integration`, which this
  repository does not run, for a dead end the flip removes. Rejected (§ 10.5).
- **Import the review gate's machine-local facts for work that is not live too.** Nothing reads an ended work item's
  review facts to decide, and the code host and Git history keep a shipped change's. Rejected (§ 11.1).
- **A stored `retired` state, written by archive.** The review records ride the work item's ref, which moves under
  history at the item's end, so the write would repeat what the end already does, and abandonment and a cut would need
  the same write. Rejected (§ 10.4).
- **A content fingerprint per finding,** as SARIF's `partialFingerprints`, to compute recurrence. It suits a
  deterministic analyzer; a language-model reviewer rewords findings between passes, so it would miss recurrences or
  match wrongly, and a wrong match could carry an earlier decline. Rejected: recurrence follows a provider's stable
  identity where one exists and stays declared otherwise (§ 4.4).

## Cross-cutting Considerations

**Trust.** Decided-by records the configured identity each path resolves today (§ 5.7), a configured identity rather
than a credential, so ARC claims no more than that. A disposition approval keeps its rule that proposer and approver
differ. A hosted result is sealed under its content digest, so settlement and coverage never read back from a host
comment someone can edit (§ 4.5). No stored record names a machine-local locator (§ 2.4).

**Failure behavior.** Every deciding read keeps today's fail-closed observations: an incomplete listing never stands in
for absence, so the readiness binding refuses an incomplete listing rather than reading it as unchanged (§ 9.2), and the
review gate's listing protocols over Errands and claims still refuse to authorize review from incomplete evidence. Two
machines' writes of one record meet as a conflict record at sync. Each new refusal is recoverable and names its remedy:
`arc attest` on a paused work unit names `arc resume <slug>` (§ 12.1); a reopened work unit's publication refuses as any
boundary still in review does, its boundary's next action naming `arc review pre-publication <slug>` (§ 10.1); review on
a clone holding no project ID names the project-ID port's remedy (§ 2.4); and a write to a completed item on a clone
lacking its history ref pulls and retries with no stop (§ 10.4).

**Performance.** One repository-wide receipt ledger with a ledger-wide compare-and-swap becomes one record per attempt,
so concurrent lanes no longer contend on one record. The readiness binding is one digest over a listing of the standard
lane's records on one lineage.

**Testing.** Each kind's parser and each write-check rule has unit cases refusing its breaking write and admitting its
valid counterpart. The mapping has cases over fixtures of each of today's shapes and runs over this repository's
records. Every flip-time arm is tested over the store's reference backend reporting `stateOffBranch: true`, and every
pre-flip path keeps its existing tests over the in-repo implementation. Each new refusal is tested with its repair and
the successful continuation after it.

**Migration and rollout.** Before the flip nothing migrates: the in-repo implementation serves the Candidate and its
boundary as today, and the review gate keeps today's stores (§ 3.4). At the flip the import maps live review state once
(§ 11); there are no compatibility readers, and today's review-gate folders stay inert on every clone (§ 4.7).

**User-facing impact.** None before the flip but what the checkpoint's binding changes in what merge compares (§ 3.2).
From the flip: delivery makes no record-only commits and its next actions name no `commit-*` step; `arc attest` refuses
on a paused work unit; a reopened work unit records readiness again before publishing; the `frontline-phase-closed`
diagnostic and the `phase-closed` skip reason are renamed (§ 5.9); `verificationKind` reads `"merge"` (§ 12.6);
adversarial passes are recorded with `arc review adversarial record` (§ 7.2); review on a clone holding no project ID
refuses until it holds one (§ 2.4); and a pull request carries its spec's review copy until the candidate tail deletes
it (§ 12.5).

## Success Criteria

1. **The family parses and checks.** Each of the six kinds registers a parser and a write check; every rule § 4–9 name
   has unit cases refusing its breaking write and admitting its valid counterpart, and `review/terminus` no longer
   appears in `KIND_SHAPES` or `KIND_MECHANISMS`.
2. **Nothing changes before the flip but the checkpoint's binding.** The review gate's and delivery's existing tests
   pass over the in-repo implementation with no assertion changed, a stub of a rerouted caller's store module moving to
   the module that caller now imports (§ 3.1); no production module outside `lib/store/` imports the Candidate and
   boundary stores; `arc review adversarial record` refuses its write `unsupported`; and no import-ratchet floor
   (`store-raw-state`, `surface-names`, `work-unit-paths`) grows, in total or per file, from the final merged base.
3. **The checkpoint binds what it attested.** Over a store whose record versions move independently, merge refuses when
   the work unit's meta record or the code head has moved since the checkpoint, and passes when only an unrelated record
   has.
4. **The mapping accounts for everything.** Run over this repository's review records, the mapping returns every live
   record as mapped and every other fact as left behind with its reason, with none unaccounted for; every record it
   returns parses and passes its kind's write check; a fixture holding a `pending` attempt is listed as in flight; and
   the supersession chain read through the mapped Candidate records equals today's reader's
   (`readRepositoryCandidateSupersessionChain`) for every live work unit.
5. **From the flip, over the reference backend:**
    1. a work unit's delivery makes no record-only commit and emits no `commit-*` next action;
    2. a re-root after code changes keeps a recorded terminus;
    3. a work unit attested from the flip publishes with no `Candidate` in its meta; a reopened work unit's publication
       refuses, a no-change `arc attest` restoring nothing, until `arc review pre-publication` records readiness again
       for the same Candidate, minting, while the standard lane still awaits its change request, a hosted reservation
       with the ID it had before reopen; and an interrupted publish still finishes;
    4. an archived work unit leaves no Candidate in the live listings;
    5. publication refuses when the standard lane's outcomes, evidence, `approved-fix` extra-pass decisions or their
       withdrawals, or in-flight attempts changed after readiness, and when that listing is incomplete;
    6. every decision a review subject carries outside the Candidate's own selections is a `review/decision` record;
    7. adding, re-exporting, and deleting the review copy leave the review subject unchanged;
    8. a landed merge writes the landing-commit link naming the project ID;
    9. `arc attest` on a paused work unit refuses naming `arc resume <slug>` and succeeds after `arc resume`;
    10. a clone whose `review-gate/operations/` holds records of today's shapes still reads its review state;
    11. `arc review adversarial record` writes one `review/adversarial-pass` record per call, and refuses malformed
        input naming the expected shape;
    12. an Errand's frontline skip is kept as a lane-skip decision and closes its frontline window;
    13. two clones' outcomes for one target carry the project ID as their repository identity, and review on a clone
        holding no project ID refuses naming the port's remedy and succeeds once the clone holds it;
    14. under either archive cadence, `arc integrate merge` and `arc merge lock release` release the merge lock for a
        work unit whose meta is a stored record, an archived one whose pull request has no change-request link included,
        and refuse `readiness-failed` where its position, branch link, notes facts, or change-request link fails.
6. **The quality gates pass** at every gate the project declares.

## Open Questions

None blocks starting. The rest are expected contracts with stated availability, and none leaves design open: the ref
backend's history refs, its `state-unresolvable` refusal, and its import giving this change's mapping its inputs and
landing what it returns, available from the flip (§ 10.4, § 11); and the cutover's quiesce, workflow rewrite, and
deletion pass (§ 11.2, § 12.6, § 14.3).

## Amendments

None.

---
