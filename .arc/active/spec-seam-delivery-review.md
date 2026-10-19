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
- **Locus** — a checkout's ARC role and the work item it serves, which ARC derives rather than stores. The shipped
  `runDerivedLocusStateProbe` derives it from the store from the flip; § 12.4 lists the review and delivery reads this
  change branches for that derivation (A6).
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
- **Review copy** — the copy of a work unit's stored spec that the cutover's export writes as `spec-<slug>.md` in
  `.arc/specs/<slug>`, so its design reaches review on the pull request (§ 12.5).
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
refusal. A writer takes that work item from the vehicle its invocation resolved, since a Candidate's lineage names only
the Candidate's ID (`LaneSubjectLineageSchema`, `rg/core/lane-admission.ts`), and a reader reads it the same way: each
composition root binds the family's ports to the work item its invocation resolved, so every read and write it makes is
that work item's. Every consumer of today's operation snapshot is already scoped to its invocation's vehicle, so a port
bound to one work item serves each (§ 4.7).

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
(`createProjectIdentityReader`) and resolves it through `resolveProjectIdentity`, and every calling module — review,
publication, status, the integration checkpoint, and `readResolveNextPassContext` in
`handlers/review-next-pass-context.ts` among them — passes the reader its invocation binds (A6), so two clones' records
of one target agree. A caller on a clone that holds no project ID yet, as a joined clone before its first pull, refuses
with the port's typed reason and remedy, and the same call succeeds once the clone holds the ID:
`resolveRepositoryIdentity` keeps returning the ID to its callers and, on a clone without one, throws a typed error that
each caller reports through its own failure surface with the port's remedy. Review commands report it as
`project-identity-unavailable`, a code the review error schema gains before the flip with a remedy-carrying variant for
each mode (§ 3.5), as the lifecycle verbs report it (`lib/work-unit/verbs/task-close.ts`); review status, which is no
review command mode, reports it through its own failure arm with no schema widening — `reason` `status-unavailable`, its
`detail` naming `project-identity-unavailable`, and its `remedy` built from the port's
(`ReviewStatusCommandResultSchema`, `rg/status.ts`) — and delivery's review status reads (`createReviewStatusPort`,
`resolveReviewStatusForWorkUnit`, `handlers/delivery-execution.ts`) carry that result as they carry it today; attest's
re-root and publish report it through their lifecycle refusal (`refuseWithRemedy`, `handlers/lifecycle-shared.ts`); and
the checkpoint and merge report it in their operation refusal's detail (`handlers/integration.ts`). Where the surface's
remedy is a spine remedy (`SpineRemedySchema`, `scripts/integration/spine-refusal.ts`), as the review commands' variants
and review status's failure arm are, it carries the port's text and the refusal's invariant, and as its argv the port's
where the port's remedy carries one, as a store refusal's can and as `refuseWithRemedy` keeps it, or else the command's
own argv to re-run, as today's review status failures wrap theirs (`spineRemedy`, `handlers/review.ts`), with the
submitted request as its `stdin` where that argv ends in `-`, as today's review remedies replay theirs
(`reviewResolveRemedy`, `rg/runtime/review-policy-remedy.ts`). The per-clone record
(`identity/repository-identity.json`) is then read by nothing, and the deletion pass may remove it (§ 14.3).

The read-only lane projection (`readReviewLane`, `rg/runtime/lane-read-composition.ts`) currently calls
`readRepositoryIdentity`, which returns `null` without minting an identity (A6). From the flip that read also takes the
invocation's project-ID reader without minting a per-clone identity. Its own refused envelope reports `payload.code:
project-identity-unavailable` with the port's detail and remedy; it needs no generic command-error variant because
`ReviewLaneReadEnvelopeSchema` admits a string code. The same read succeeds once the project ID is available, and its
in-repo arm retains today's absent-identity behavior.

#### 2.5 Registration

Each of the six kinds registers a parser, and each but the Candidate a write check, through `defineKindRegistration` in
a module of its own under `lib/store/kinds/review/`, joining `PRODUCTION_REGISTRATIONS`
(`lib/store/kinds/registrations.ts`). Together they carry the invariants that today's stores and validation modules
enforce on the facts that move into the kind, as § 4–9 list them, divided by what each rule reads:

- **The parser** holds every rule the record's content settles alone. It runs at every read and before any write check
  (the reference backend's admission, `__tests__/helpers/store/write.ts`), so its rules guard both. It validates the
  kind's field schema (§ 4–9) and its format version, the version field its content carries; the boundary's admits two
  (§ 9.1).
- **The write check** holds every rule that reads the record's key, another record, or the record's prior version, and
  every rule about writing alone. It returns each rule a write breaks under a stable identifier, and refuses a write
  whose evidence it cannot list completely rather than reading the gap as empty.

The Candidate's rules all read its content alone (§ 8.5), so it registers no write check. The schemas are public, so the
review gate's readers and writers import them; the registrations stay behind the store's raw-state import boundary, each
listed among its raw-state modules (`RAW_STATE_MODULES`, the package's `eslint/architecture-imports.ts`).

`PRODUCTION_REGISTRATIONS` stays the complete production set, on which the ref backend builds its registry, as the
lifecycle verbs' reference harness builds the reference backend's (`__tests__/helpers/store/lifecycle-harness.ts`). The
in-repo implementation builds its own from a narrower list, in a module that imports no
review registration (`createInRepoContext`, `lib/store/in-repo/context.ts`). A parser is synchronous (`RecordParser`,
`lib/store/registry.ts`), so a registered one cannot load lazily, and the in-repo implementation needs neither review
parser: it runs no write check, and its read codec already decodes the Candidate and boundary through a deferred import
that returns their keys (`decodeTrackedContent`, `lib/store/in-repo/read-codec.ts`). Neither parser therefore joins the
in-repo backend's static import closure, whose deferred modules a test pins (`in-repo-boundary.test.ts`).

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
  (`CandidateRecordVersionConflictError`, `SubmissionBoundaryVersionConflictError`) its `version-conflict` refusal. A
  typed access in `lib/store/kinds/review/` keeps each function's name, parameters, and error class, so its callers and
  the tests that stub them change only the module they import. Its one type change is the Candidate's version, typed
  `string | null` as the boundary's and the write's expected version already are, since a store version is the backend's
  own; in-repo it stays the byte digest, and a published field still typed as a digest parses it as one until that field
  widens (§ 3.5). Each call's last parameter, today's `fs` port, takes either that port or an options object carrying
  the caller's `Store`, Git runner, or `fs`, so every call today's callers and stubs make stands unchanged; each opens
  the checkout's store from its working directory and the caller's Git runner only where no store is passed, so a
  composition root or test that holds a store reads and writes through that one, and a caller passing its own `fs` port,
  as tests do, reads and writes the file through it as today. It reads an absent record as `null`, throws today's
  conflict error on `version-conflict` and today's parse error on a malformed record, and a write returns the record's
  path, which its callers stage; each write is also available as the `put` a caller adds to its own `batch`. A
  review-gate composition root holds the store its invocation opens and passes it to the typed access, and its arms
  branch on that store (§ 3.3).
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
`lib/store/` imports them, which the import ratchet enforces once both are among its raw-state modules
(`RAW_STATE_MODULES`, the package's `eslint/architecture-imports.ts`), the Candidate store already being one. They stay
out of `lib/store/in-repo/`, whose modules no test may import (the `store-tests` rule, the package's
`eslint/architecture-imports.ts`), so the tests that build fixtures with them or test them directly keep their imports.
The stores re-export the chain and revision reads and the path resolvers that move out of them until the deletion pass,
since tests import those from the stores. A unit test that stubs a rerouted caller's store module by its path
(`vi.mock`), as `lifecycle-verbs.test.ts` stubs the Candidate store, stubs whichever module that caller now imports
instead — the typed access's module, or the Candidate history read's — its assertions unchanged. A store read or write
needs Git where today's file read did not, a write taking the tracked lock and a read with no meta in the tree composing
lifecycle, so a test that runs a caller outside a repository stubs the typed access. Every mechanism that exists because
these records ride the branch stays as today's in-repo arm, behind one branch on `stateOffBranch` (§ 14.3).

#### 3.2 The integration checkpoint binds what it attested

Today the integration checkpoint records the whole lifecycle version it read, and merge compares that version
(`scripts/integration/merge.ts`); in-repo the version is `HEAD`. Once state is shared, any unrelated write between
checkpoint and merge would stale the checkpoint. Before the flip, the checkpoint binds the version of the lifecycle
record it attested — the work unit's meta record, which gives its lifecycle position (`readLifecycleSummary`) and the
artifact facts read from it (`readLifecycleArtifactFacts`, `scripts/integration/checkpoint-composition.ts`) — plus the
code head, and merge compares those; the Candidate record's version stays asserted on its own, as today
(`assertRecordVersion`). Both read the meta record as of the lifecycle snapshot's state version, as the lifecycle port
reads it today (`createStoreLifecycleStorage`, `lib/store/lifecycle-storage.ts`), whose listed entries already carry
each meta record's version; the snapshot gives that version by slug, so injected lifecycle storage carries it too.
In-repo the version still derives from `HEAD`, an uncommitted edit moves nothing, and the checkpoint's verdicts are
unchanged; what changes is what a later comparison reads.

The checkpoint record keeps its `lifecycleVersion` field and schema (`IntegrationCheckpointCompositionRecordSchema`,
`scripts/integration/checkpoint-store.ts`), the field now holding the version of the lifecycle record it attested. A
checkpoint written before this change holds `HEAD` there, which no meta record's version equals, so merge reads it as
moved and refuses `head-mismatch`, whose remedy is to checkpoint again, rather than failing to parse it.

#### 3.3 Schemas, mapping, and flip-time arms

Before the flip this change builds the six kinds' field schemas, parsers, and write checks (§ 2.5); the import's mapping
table (§ 11); the recording verb, whose write the in-repo implementation refuses `unsupported` (§ 7.2); and every
flip-time arm of § 4–12, each branched on `stateOffBranch`, so the flip turns them on.

#### 3.4 The review gate's machine-local records

They keep today's shapes and stores until the flip, when every review record reshapes at once: the import maps the
machine-local ones from today's shapes as it maps the tracked ones (§ 11). No reader before the flip needs the new
shapes, so nothing is cleared or migrated before it, and `standardLaneOwnerVersion` guards publication as today until
the readiness binding replaces it (§ 9.2).

#### 3.5 Published schemas widen ahead of the flip

The flip-time arms emit shapes today's published schemas refuse, so each such schema widens before the flip to admit
both, and nothing it emits changes until the flip (A2, A4):

- **The boundary's version 2** (§ 9.1), wherever an output embeds the boundary (`IntegrationBoundaryLocusSchema`):
  `arc status`'s and the active-work projection's `integrationBoundary` (`commands/status/schema.ts`,
  `commands/active/schema.ts`), `arc attest`'s `locus` (`AttestResultSchema`, `lib/work-unit/verbs/attest.ts`),
  publish's unchanged result (`lib/work-unit/verbs/publish.ts`), and the pre-publication envelope
  (`PrePublicationReviewEnvelopeSchema`, `rg/policy/pre-publication-procedure.ts`), each carrying the version its record
  holds; the envelope's version 2 arm keeps `policy`, typed per variant (§ 9.3).
- **`verificationKind` `"merge"`** (§ 12.6), wherever a run-verification action is published: attest's result's next
  actions, under attest's own action schemas (`lib/work-unit/verbs/attest.ts`), and, through a widened copy of the
  boundary's action schema (`RunConvergenceVerificationActionSchema`; below), the integration checkpoint's result
  (`IntegrationCheckpointResultSchema`, `scripts/integration/checkpoint.ts`) and status's pre-publication continuation
  (`PrePublicationContinuationSchema`, `rg/status.ts`).
- **A store version** (`RecordVersionSchema`), opaque per backend, wherever an output carries a record's version, typed
  today as a digest or a Git object ID: attest's `recordRevision` and `candidateRecordRevision` (§ 8.4); a delivery
  terminus offer's and an attestation-ordering recovery's `expectedBoundaryVersion`
  (`rg/policy/delivery-review-terminus.ts`, `handlers/review.ts`); an applicability offer's `expectedRecordVersion`
  (`rg/policy/review-applicability-resolution.ts`, `lib/work-unit/candidate-applicability-resolution.ts`); and the
  checkpoint's `candidate-record-moved` refusal's `expectedRecordVersion` and `observedRecordVersion`
  (`scripts/integration/checkpoint.ts`).
- **The review error code `project-identity-unavailable`** (§ 2.4), which the review error schema, closed at four codes
  today (`ReviewCommandErrorCodeSchema`, `rg/core/review-command-error-codes.ts`), gains with a remedy-carrying variant
  for each mode (`remedialErrorVariant`, `rg/core/review-command-envelope.ts`). No clone reports it before the flip.
- **Merge's landing-link state** (§ 12.3): the `merged` arm of `IntegrationMergeResultSchema`
  (`scripts/integration/merge.ts`), whose next action is always `complete`, admits whether the landing-commit link was
  written and, where it was not, the rerun's remedy. In-repo merge writes no link and reports no link state.
- **Fields of a mechanism § 14.3 retires**, wherever an emitted contract requires one, so a flip-time arm can leave it
  out: the run-verification action's published embeddings named under `"merge"` above take a widened copy of the action
  (`RunConvergenceVerificationActionSchema`, `rg/policy/integration-boundary-locus.ts`) that admits `"merge"` and a
  post-attest continuation without `projectionDisposition` (`PostAttestContinuationSchema`), and the action's builder
  (`createRunConvergenceVerificationAction`) parses through that copy; the boundary's version 1 keeps today's objects,
  so it still requires the field, and version 2 defines its own, refusing it (§ 9.1); a member terminus's acceptance
  result (`DeliveryReviewTerminusAcceptanceResultSchema`, `rg/policy/delivery-review-terminus.ts`) admits `recorded`
  with the next action `continue` and no `boundaryPath`, its decision written with the boundary in one batch (§ 9.1);
  and delivery's acknowledged verification result (`ResultSchema`'s `acknowledged` and `already-acknowledged` arm,
  `handlers/delivery-execution.ts`) admits no `candidate.recordPath`, `boundaryCarry.path`, or `recordEffects`, which
  name files and their bytes that no commit carries from the flip (§ 14.3).

Two additions besides a schema's widening are observable before the flip too, with nothing they do changing until it:

- **`storage.track_design_docs`** (§ 12.5), a configuration option defaulting to `specs`, which joins the lists kept by
  hand that name every option — among them `VALIDATION_DOMAIN_ORDER` (`commands/config/validate.ts`), the shipped
  `arc-config.yml`, the configuration schema's test, and the configuration tests' rendered validation lines
  (`EMPTY_CONFIG_VALIDATION_PASS_LINES`, `__tests__/fixtures/config/cases.ts`) — and every complete settings object a
  test builds (`ConfigSettingsSchema`, `lib/config/schema.ts`), which type checking finds; nothing reads it before the
  flip.
- **The export path's classification** (§ 12.5): `classifyPathTreatment` classifies a work unit's own export folder,
  `.arc/specs/<slug>`, as evidence-neutral, which matches no path until the export writes one from the flip.

A value renamed with no flip-time arm needing it waits for the deletion pass rather than widening a schema early
(§ 5.9).

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
(`rg/hosts/local/operation-state-store.ts`). A key is one path segment, as the ref backend expected from the flip
requires, refusing one holding `/`, so a hosted outcome's key writes the admission ID's `hosted-admission/` prefix (`hostedAdmissionId`,
`rg/hosted/request.ts`) as `hosted-admission-`; its hosted binding keeps the admission ID itself. One pure function
computes an outcome's key from its content.

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
  outcome's reason class where there is one (`FrontlineExecutionOutcomeSchema`, `rg/policy/frontline-outcome.ts`). A
  `findings` outcome reads as settled, where lane progress writes `settled-findings` today, once the current evidence
  record for its result is approved and, where its set carries a fix, its performance is recorded, from any source — as
  today a set with no fix settles its attempt at approval (`rg/core/response-plan.ts`, `settleLaneAttempt`,
  `rg/lane-progress.ts`) and a set with a fix at its performance (`recordLaneResponsePerformance`) — and for a hosted
  result once that record's settlement also covers every sealed finding (`completeHostedAttemptIfReady`,
  `rg/hosted-response-completion.ts`). One pure derivation gives it to every reader that branches on `settled-findings`
  today.
- **`findings`** — the normalized findings (`NormalizedReviewFinding`, `rg/core/finding-records.ts`), non-empty only for
  `findings`.
- **`requirement`** (`ReviewRequirementV2`) where the lane binds one, with its rubric version and digest.
- **`admittedBy`** — the key of the decision that admitted the attempt, where one did (§ 4.6).
- **`endedAt`** — when the attempt ended. Outcomes are separate records, so it gives the order today's lane progress
  keeps by position (§ 4.7); the outcomes imported from one lane-progress record take times that rise in the order the
  record holds their attempts, the last its `updatedAt`, since today's attempts record no time of their own (§ 11.2).

Each source adds what today's records hold for it:

- **Local:** the request (`ReviewRequestV2`) — its author and evaluator identities, carrier, lineage, logical pass,
  generation, and request mechanism; the policy version and policy binding digest; the attestation — evaluator, runtime
  identity, mechanism, and runtime kind; the evaluator's run and applicability identities; the vehicle, scope mode,
  rubric identity, and delivery admission; the source by its `sourceDigest`; the guidance by its digest
  (`guidanceDigest`); and the receipt as recorded where the attempt produced one (`ReviewReceiptV2Schema`). Today these
  live in the `local-review` operation record and the receipt. The result's digest, which an approval binds
  (`resultDigest`, `dispositionSetMatchesSourceContext`, `rg/core/disposition-records.ts`), covers the attempt ID, the
  whole receipt, and those admission fields (`localResultDigest`, `rg/hosts/local/review-result-reader.ts`), so the
  result reader recomputes it from the outcome alone, the lane's source (`laneSourceId`) the outcome's, and an approval
  matches its result on every clone.
- **Frontline:** the admission's routing, review, and pass ceiling (`FrontlineAdmission`), its source held by its
  `sourceId`, kind, and capability alone, never the `executable` and `argv` a command source carries
  (`FrontlineSourceDescriptorSchema`, `rg/policy/frontline-source.ts`); the admission's policy version and the outcome
  digest, kept as recorded and never recomputed, since each digests that descriptor (`FrontlineAdmissionSchema`,
  `rg/core/frontline-admission.ts`); the provider's executable identity, its digest and qualified version
  (`FrontlineExecutableIdentitySchema`, `rg/core/advisory-records.ts`); and the response binding where a private
  delivery member's Candidate owns the response.
- **Hosted:** the sealed result (§ 4.5), its admission and handle, its host target, vehicle, requirement, and actor, and
  the request's failure reason where it failed.

#### 4.3 Pass counts derive

An attempt **finishes** when its outcome is a verdict — `clean` or `findings` — exactly when today's writers mark it the
producer of its pass's terminal result (`terminalProducer`), each source's coverage rule holding as § 4.8 lists it. Two
counts derive from the lineage's stored outcomes, including the passes its Candidate supersession chain carries
(`readCandidateInheritedLaneProgress`, `rg/lane-progress-supersession.ts`), without changing the shipped policy (A6):

- **Completed logical passes** (`completedPasses`) count distinct logical passes with a finished outcome, including
  incremental coverage. They number the next logical pass and bind extra-pass decisions' `passCount`,
  `exhaustedPassCount`, and `nextPass` (§ 5.1, § 5.5), as `validatePassCounts` and `validateAuthorizations`
  (`rg/core/lane-progress-state-validation.ts`) require.
- **Completed complete-coverage passes** (`completePasses`) count only finished outcomes whose `effectiveCoverage`
  is `complete` (`countCompleteLogicalPasses`, `rg/lane-progress.ts`). The standard lane compares this count with its
  ceiling (`ceilingPassCount`, `rg/policy/review-policy-driver.ts`); the frontline lane keeps its completed-logical-pass
  ceiling. `inheritedCompletedPasses` and `inheritedCompletePasses` carry the two counts across supersession, and
  `readStandardPassCounts` (`rg/runtime/lane-pass-counts.ts`) composes them without conflating them.

An incremental pass — a fix check of an approved fix, or an eligible delta check following a converged pass — advances
the completed logical count but adds nothing to the standard ceiling count. For example, complete logical pass 1
followed by incremental logical pass 2 leaves `completedPasses: 2` and `completePasses: 1`; the next logical pass is 3,
and a grant for it binds 2, never 1. One finished outcome per logical pass still holds (§ 4.8).

An attempt that did not finish — timed out, stale, or failed — keeps its outcome and counts toward neither; its retry
shares its logical pass under the retry generation its source assigns (§ 4.7, § 4.8). An outcome a replaced Candidate
holds live, which reads as outdated (§ 8.4), counts toward neither, so the supersession chain carries neither from it.

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
its admission, so its outcome carries the citation that decision's consumption derives from (§ 5.5). Every attempt the
decision admits cites it: the attempt that consumed it and each retry after it at its pass, as today a consumed
authorization admits those retries (`requireConsumedRetryAttempts`, `rg/lane-progress-conditional.ts`).

#### 4.7 Operation records keep in-flight state

Operation records keep only in-flight execution state: the attempt under way, its lock, its materialization, and
admission and retry working state — the frontline run state, a local attempt's guidance, whose digest its outcome keeps
(§ 4.2), and reviewer instructions, the hosted request owner index, and review suspensions. From the flip they live in a
namespace of their own, `in-flight/`, added to the review gate's closed namespace list (`lib/git-common-state.ts`) apart
from today's `operations/`, through a store of their own that each composition root selects on `stateOffBranch`, today's
operation-state store (`LocalReviewOperationStateStore`, `rg/hosts/local/operation-state-store.ts`) staying the in-repo
arm. A lane's attempts in flight share one record per lane and lineage owner (`laneSubjectOwner`,
`rg/core/lane-admission.ts`), keyed and versioned as lane progress is today (`laneProgressOperationId`). The owner
leaves the head out of every head-bound lineage, so an Errand's attempts at two heads share one record, and only a
review target, whose identity names its head, has a record per head. A record emptied of attempts persists, so its
version continues. Each attempt holds its logical pass, generation, source, scope mode, coverage admission, and the
decision that admitted it (`admittedBy`), since withdrawal reads a consumption before any outcome exists (§ 5.10). An
attempt whose outcome is stored reads as ended, and the next write to its record drops it, so a crash between the two
writes leaves nothing that admission or the readiness binding counts as in flight. The hosted request owner index stays
where it is (`identity/`). Today's snapshot read refuses a whole store holding one record it cannot parse
(`readOperationSnapshot`, `rg/hosts/local/operation-state-store.ts`), so no clone's leftover records of today's shapes
may ever reach the new schemas; today's folders stay inert on every clone, and the deletion pass may remove them.

Readers keep today's lane-progress shape (`LaneProgressStateSchema`), composed in one place. The in-flight port composes
a read of a lane-progress ID from the work item it is bound to (§ 2.3): that item's outcomes whose lane and lineage
recompute the ID (`laneProgressOperationId`), and the in-flight record, which holds only attempts under way. Its
snapshot composes every lane-progress record on the work item. The composed attempts order by logical pass, then
`endedAt`, then generation, an unfinished outcome before a finished one, then attempt ID, with attempts in flight last —
the order today's lane progress keeps by position, which `precedesWithinPass`
(`rg/policy/hosted-reservation-support.ts`) and the hosted reservation's readers read; imported outcomes keep it through
distinct times in their record's order (§ 11.2). The composed `updatedAt` is the latest of the in-flight record's time
and the outcomes' `endedAt`, and its version is the in-flight record's, or 0 where this clone holds none, which the
earlier-review query admits from the flip (`EarlierReviewAttemptCandidateSchema`,
`rg/policy/earlier-review-attempts.ts`). Every lane-progress read goes through it — `readLaneProgressOwner`,
`readLaneProgressOwnerVersioned`, the transitions' own `readOperation` calls on lane-progress IDs, and the snapshot's
entries — and every ended attempt's write goes through `recordLaneAttempt` (`rg/lane-progress.ts`), which from the flip
writes it as its outcome with the content § 4.2 lists, so no reader of today's shape needs an arm of its own. Three
writers write lane progress directly today, each only an attempt under way, so from the flip they write the in-flight
record: a hosted admission's pending attempt (`publishHostedPendingAdmission`) and its acknowledgement, which re-keys
the attempt by its handle (`acknowledgeHostedRequest`, `rg/lane-progress-hosted-request.ts`), and the withdrawal of a
frontline admission that never ran (`withdrawLockedAdmission`, `rg/policy/frontline-pending-admission.ts`). Every write
to the in-flight record drops the attempts whose outcomes are stored, matching a hosted attempt by its admission's ID,
which keys its outcome (§ 4.1), since its acknowledgement changes its attempt ID.

Admission reads a lane's attempts in flight from that working state, as it reads lane progress today. A frontline
admission citing no `approved-fix` extra pass takes the larger of one past the highest generation among its pass's
attempts, stored or in flight, and the version of the operation record holding its lane's in-flight attempts for its
lineage owner, as it takes lane progress's version today (`admitNewFrontlineOperation`,
`rg/policy/frontline-command.ts`). The generation is part of the admission's operation ID
(`frontlineAdmissionOperationId`, `rg/core/frontline-admission.ts`), and today that version keeps an admission withdrawn
before it ran (§ 5.5) from recurring under its ID. That record starts afresh in the new namespace, and a withdrawn
admission leaves no outcome, so on a lineage reviewed before the flip a withdrawn generation can recur; a ready response
for the withdrawn admission then starts a run only for an admission identical to it, as the run's admission check
requires today (`readValidatedFrontlineAdmission`, `rg/runtime/frontline-admission-validation.ts`).

#### 4.8 Write check

The kind carries the attempt invariants (`rg/core/lane-attempt-validation.ts`) and pass-count rules
(`rg/core/lane-progress-state-validation.ts`) today's modules enforce (§ 2.5). Its parser holds those an outcome settles
alone:

- at most one of the local, frontline, and hosted bindings;
- a local source of `delegated-agent`, its binding's operation its attempt ID, and a hosted source a hosted provider
  (`validateLaneAttempt`, `rg/core/lane-attempt-validation.ts`);
- a frontline or hosted binding that matches its admission, its admission's lineage owning the outcome's lineage and its
  repository the outcome's (`validateAttemptAdmission`, `rg/core/lane-progress-state-validation.ts`), a hosted binding
  matching it in full — host target, requested coverage, vehicle, review target, requirement, and actor identity
  (`hostedMatchesAdmission`, `rg/core/lane-attempt-validation.ts`); a frontline-lane outcome carrying a frontline
  binding, whose source and repository are the outcome's (`FrontlineOutcomeRecordSchema`, `rg/core/advisory-records.ts`);
- a hosted binding's review target and requirement valid, its host and review targets at one head, a delivery vehicle
  present exactly when its review target is a delivery member and at that target's head, its attempt ID its admission's
  ID while unacknowledged and derived from its handle once acknowledged, and its handle matching its admission
  (`validateHostedAdmission`); a sealed result only with its handle (`validateSealedResult`); and a
  `requestFailureReason` present exactly when its outcome is `terminal-failure` (`validateHostedSettlement`);
- a local binding's coverage admission valid, its delivery vehicle present exactly when its target is a delivery member,
  and a delivery admission it carries matching it (`LocalLaneAttemptBindingSchema`, `rg/core/operation-state-schema.ts`);
  and no binding's effective coverage weakening a requested complete coverage, hosted or local;
- a `clean` or `findings` local outcome carrying its receipt, and a receipt it carries valid against the outcome's
  request, target, and requirement (`validateReviewReceipt`, `rg/core/gate-contract-v2.ts`), its result the outcome's,
  as the result reader requires today (`localReceiptMatchesOutcome`, `rg/hosts/local/review-result-reader.ts`), and its
  findings the outcome's `findings`, which today's reader takes from the receipt;
- each source's coverage rule: a local attempt that finished has effective coverage equal to its requested coverage, and
  one that did not has none; a frontline attempt has a verdict exactly when its effective coverage is complete; and a
  hosted attempt has a verdict exactly when it keeps a sealed result whose outcome matches, its effective coverage
  derived from that result's evidence and its `hostedResultId` recomputing over its content;
- a head-bound outcome at its lineage's head, and a delivery member's outcome inside its member lineage
  (`validateAttemptLineage`);
- findings only for `findings`;
- a hosted attempt at generation 0, as its admission writes it (`rg/lane-progress-hosted-request.ts`).

Its write check holds those that read the outcome's key or the other stored outcomes of its lane on its lineage's
subject owner, the lineage with any head left out (`laneSubjectOwnerMatches`, `rg/core/lane-admission.ts`), so an
Errand's passes, each bound to a head, still count together. Each rule states what the stored set must hold, so one
write and a whole imported set (§ 11.4) check alike:

- the key is the one its content gives (§ 4.1);
- at most one finished outcome per logical pass, and no outcome at that pass with a higher generation from the finished
  one's source, scope mode, and coverage admission, as no attempt stays pending at a pass after its terminal producer
  today (`validatePassCounts`); generations from another source number apart (below), so local attempts at generations
  0 and 1 beside a hosted one finished at generation 0 of that pass stand; and no hosted admission ID twice;
- each generation as each source's admission numbers it today: a local attempt's generations at its logical pass,
  source, scope mode, and coverage admission run from 0, each lower one stored and none twice
  (`nextLocalRetryGeneration`, `rg/runtime/local-prepare.ts`); and the attempts one `approved-fix` extra pass admits
  share the original admission's source, scope, and coverage, each one generation past the attempt before it at its
  pass (`requireConsumedRetryAttempts`, `rg/lane-progress-conditional.ts`). Outside those two groupings a generation may
  recur at one pass: every hosted attempt is generation 0, and a hosted pass restarts at a later head after a terminal
  failure (`hostedPassHold`, `rg/lane-progress-hosted-request.ts`), while a local and a hosted attempt can each be
  generation 0 of one pass.

Three rules stay with in-flight state and admission (§ 4.7), since what they read no stored record keeps. A frontline
retry names the attempt it retries only as a run input (`retryOfOperationId`), so admission binds it to its prior's
repository, target, and logical pass, refusing a `clean` or `findings` prior (`assertFreshRetryAdmission` and
`validateExplicitRetry`, `rg/policy/frontline-operation.ts`). And an attempt still pending is in-flight state, so the two
rules `validatePassCounts` enforces over lane progress today move there: the in-flight record's schema refuses two
attempts under way at one logical pass, and admission refuses an attempt at a pass whose outcome has finished.

### 5. `review/decision`

One envelope carries every decision about a review subject outside the Candidate's own selections.

#### 5.1 The envelope

- **`subject`** — the lineage the decision was made on (`LaneSubjectLineageSchema`) and the exact subject decided on:
  its head and subject digest — the Candidate's subject digest, or a review target's digest, a terminus on a Candidate
  taking no head (below) — or, for a delivery member's terminus, the member vehicle. The decision lives on the vehicle's
  work item; the kind's reach (§ 5.6) decides which later subjects it binds.
- **`lane`** — frontline or standard.
- **`choice`** — the decision's kind and value:
    - `extra-pass` — the next logical pass after the completed logical count it was decided at (`passCount`, § 4.3, A6),
      with its precondition: `ceiling`, a pass past an exhausted ceiling; `additional`, an elective pass after
      convergence, naming the result it follows (`precedingProducerId`); or `approved-fix`, a conditional pass after an
      approved fix, naming the result and disposition set it follows and the head the fix starts from (`producerId`,
      `dispositionSetId`, `originatingHeadSha`), with the repository identity and the logical pass of the result it
      follows, as today's authorization records them (`repositoryId`, `exhaustedPassCount`); its `producerId` names
      the result as today's records do, a hosted result by its acknowledged `attemptId`, never by its outcome key;
    - `terminus` — an Owner-accepted terminus of the standard lane;
    - `lane-skip` — a skip of the frontline lane;
    - `withdrawal` — the withdrawal of an earlier decision, by its key.
- **`decidedBy`** — the person who chose, by the active identity the review gate resolves (§ 5.7).
- **`decidedAt`** — when.
- **`basis`** — what the answered offer was computed from that its choice and subject do not already carry. A terminus's
  basis is `{ passCount }`, the pass count its offer counted; every other choice's is `null`, since an extra pass carries
  its `passCount` and precondition in its choice, and a lane skip and a withdrawal need nothing more. So two writers of
  one decision, an imported terminus and a live one at the same count among them, key it alike (§ 5.2).

A terminus on a Candidate records no head: its subject is the Candidate and the decided subject digest, all its reach
reads (§ 5.6). That digest need not be one the Candidate record stores, since neither a subject recognized as equivalent
to the record's target (`projectEffectiveCandidateTarget`, `lib/work-unit/candidate-effective-target.ts`) nor the
subject attestation carries a terminus to (`recoverAttestedOwnerTerminusBoundary`,
`rg/policy/integration-boundary-locus.ts`) is stored; so the review gate and the import (§ 11.2) write it alike and key
it alike, with nothing to derive from the record. An `approved-fix` extra pass takes its subject from its precondition —
its lineage at its `originatingHeadSha`, with no subject digest — and its `passCount` is the producer's logical pass
(`exhaustedPassCount`, § 4.3), whichever writer records it, so its key, today's `authorizationId` (§ 5.2), fixes its
whole envelope; the parser refuses one whose head is not its `originatingHeadSha`. Any other decision the import maps
carries a decider, a time, a head, and a subject digest only where its source recorded them, and `null` otherwise.

#### 5.2 Key

A decision is keyed by a digest of its subject, lane, choice, decider, and basis, never its time, as a conditional pass
authorization's ID leaves out `capturedAt` (`computeConditionalPassAuthorizationId`,
`rg/core/operation-state-schema.ts`), so recording the same decision twice names one record: a retry's write refuses
`version-conflict` over the record its first write made (`create-only`, § 2.1), and the writing verb reads that record
and reports the decision as already recorded. Two machines' writes of one decision meet as a conflict record at sync
(§ 2.2). A withdrawal is keyed the same way, citing the decision it withdraws.

For an `approved-fix` extra pass the key is today's `authorizationId`, computed as today
(`computeConditionalPassAuthorizationId`) over the decider and its precondition — the repository identity, lane,
lineage, producer, disposition set, originating head, and exhausted pass count — with the next pass one past that count,
so the key recomputes from the envelope using logical-pass units (§ 4.3, A6), and the requests, admissions, and resolved
policy requests that cite it (`ceilingOverride.conditionalPassAuthorizationId`) still resolve after the import. From the
flip the repository identity a writer records is the project ID (§ 2.4).

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

An extra pass binds the completed logical count it was decided at and admits only the next logical pass (A6). An attempt
at that pass that produces no finished outcome spends nothing, so its retry runs under the same decision; once that
logical pass finishes, the decision admits nothing further. The standard ceiling's complete-coverage count controls
eligibility for a ceiling override, never the ordinal it admits (§ 4.3). Today an additional pass drops once the
completed logical count passes the one it was decided at (`withCeilingOverride`,
`rg/policy/pre-publication-request.ts`), and a ceiling override refuses once the count moves past the pass it admitted
(`pass-count-mismatch`, `resolveInvalidOverrideReason`, `rg/policy/review-policy-driver.ts`) while still applying to the
resolution of that pass's own result (`compatibleTerminalGrants`, `rg/policy/review-policy-evidence.ts`). An extra pass
already used therefore reads as spent, imported or not. Under the shipped pass policy (§ 4.3) an incremental pass cites
no extra-pass decision: a fix check is admitted by the approved, performed response it verifies, and a delta check by
Git's proof that its range follows a converged pass, its `correctionScope` naming that response's or that pass's result
(`predecessorProducerId`), so it spends none and its outcome's `admittedBy` stays empty. Its finished outcome still
advances the logical count against which any later grant's applicability is checked. Both write the same record, and no
rule of this change tells them apart.

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
  the override; an Errand's or a delivery member's reaches the target it was decided on, the target its call bound
  where the lane judgment carries none (`bindJudgment`, `rg/policy/review-execution-admission.ts`), as the policy
  driver refuses another target today (`resolveInvalidOverrideReason`, `rg/policy/review-policy-driver.ts`);
- an **`additional` extra pass** reaches the head it was decided on (`additionalPassAuthorization.headSha`);
- a **frontline `ceiling` extra pass** reaches only the frontline head it was decided on;
- an **`approved-fix` extra pass,** decided before the fix exists, reaches the head that fix produces, a continued head
  included (`bindConditionalPendingAdmission`), as hosted fix settlement accepts one (`completeHostedAttemptIfReady`);
  from the flip a continued head is a direct successor of the produced head whose only change is the work unit's export
  path, the review copy's commit after a fix that amends the stored spec (§ 12.5), since no record commit then follows a
  fix (§ 14.3);
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
  which requires the active identity the review gate resolves to be the work unit's owner, with a completed work unit's
  owner as the fallback (`acceptDeliveryReviewTerminus`, `handlers/review.ts`).
- **An `approved-fix` extra pass** names its authorizer, who must be the disposition set's approver. A local disposition
  approval resolves its approver through `resolveLocalReviewAuthority` (`rg/hosts/local/review-authority.ts`), which
  requires the owner for a work unit and takes the active identity as an Errand's author; a frontline or hosted one
  through `resolveFrontlineActors` (`rg/runtime/respond-composition.ts`), which takes the active identity unchecked.
- **A `ceiling` or `additional` extra pass and a lane skip** resolve no identity today
  (`recordSingletonFrontlineInitialSkip` takes no actor), so from the flip they record the active identity unchecked, as
  a frontline approval does, and an imported one carries none.

Each is the active identity the review gate resolves, not a credential, so ARC claims no more than that: at a seam where
the platform enforces no identity, ARC records the identity it resolved and claims nothing stronger.

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
"window", for the one-time opportunity before the change request, so from the flip the `frontline-phase-closed`
diagnostic (`rg/policy/frontline-command.ts`, `rg/policy/review-policy-driver.ts`), a free-form code, reads
`frontline-window-closed`. The policy driver's `phase-closed` skip reason is a value of a published schema
(`ReviewResolveEnvelopeSchema`, `rg/policy/review-policy-driver.ts`) that the boundary's version 1 embeds as its
`policy` (`rg/policy/integration-boundary-locus.ts`), so emitting another value from the flip would widen that schema
before it; the deletion pass renames it `window-closed` with the in-repo arm that emits it. No workflow text names
either.

#### 5.10 Write check

The kind's parser refuses an `extra-pass` whose precondition fields are incomplete for its kind, an `approved-fix` one
with no decider, which today's authorization requires (`authorizedBy`, `ConditionalPassAuthorizationIdentitySchema`,
`rg/core/operation-state-schema.ts`), and a basis other than its choice's (§ 5.1). Its write check recomputes the key
from the envelope; refuses a `withdrawal` citing no decision on the same work item, or citing a withdrawal; refuses an
`approved-fix` extra pass whose producer is not a stored, finished outcome on the decision's lineage at its
`exhaustedPassCount` and `originatingHeadSha`, as today's validation binds an authorization to its terminal producer
(`validateAuthorizations`, `rg/core/lane-progress-state-validation.ts`); and refuses a withdrawal of an `approved-fix`
extra pass that an outcome's `admittedBy` shows consumed, or whose withdrawer is not its decider (§ 5.4). A listing it
cannot read completely refuses. Two of § 5.4's withdrawal rules stay with the withdrawing verb, which refuses each
(`withdrawConditionalNextPassAuthorization`, `rg/lane-progress-conditional.ts`). An admission that cites the pass and
has not yet ended is in-flight state (§ 4.7), so the verb reads it and refuses to withdraw the pass it consumed. And a
withdrawal refuses once a successor disposition set for the producer's result is approved, while a successor approved
after the withdrawal leaves it standing (`invalidateConditionalNextPassAuthorization` keeps a withdrawn authorization as
it is): stored records show both and not their order, so the verb reads the stored evidence when it withdraws, and an
imported or merged history that withdrew first passes the check. The verb reads a stored withdrawal of the pass before
that evidence, and reports the decider's own repeated withdrawal as already recorded (§ 5.2), since a withdrawal stored
beside a successor came first; anyone else's is refused as not the decider's, as today.

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
- **`advisoryFixTags`**, optional — the per-fix `new-design` or `local-correction` tags that
  `ApprovedDispositionLineageNodeSchema` stores outside the approved set's identity (`rg/core/advisory-records.ts`, A6).
  Where present, `ReviewFixTagsSchema` and `validateReviewFixTags` (`rg/core/review-report-inputs.ts`) require exactly
  one tag per `fix` finding, with no extra or duplicate identity. `createPendingResponseDispositionNode` records them
  at approval; `readApprovedResponseReport` and `priorRoundReadings` (`rg/runtime/response-report.ts`) read them for
  replay and loop reporting. Tags bind neither approval nor policy, convergence, admission, or decision identity.
  A historical record without tags stays without them; no tag is inferred during import or replay.
- **`predecessorDispositionSetId`, `successorDispositionSetId`** — § 6.3.
- **`responsePolicyRequest`, `policyProjectionPending`** — § 6.4.
- **`performance`** — once performed: the response's old and new targets and heads, its applicability, its fix
  consumption with who applied it and when, its hosted fix target, and the Candidate response it made
  (`candidateResponseId`), as today's fix responses (`errandFixResponse`, `deliveryMemberFixResponse`) and response
  performance (`LaneResponsePerformanceSchema`) record them. Today those are two writes, the fix response appended to
  the disposition record and then its performance (`recordPerformedResponse`, `rg/runtime/respond-command.ts`); from the
  flip they are one `performance` write, so no response is ever half recorded, and a replay that finds a matching
  performance returns today's envelope and writes nothing.
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

The kind's parser holds the rules a record settles alone: its disposition set recomputes its ID over findings in
canonical order (`validateDispositionSet`, `rg/core/dispositions.ts`), its approver is not its proposer
(`validateDispositionApproval`), its optional tags validate against exactly its `fix` findings (`validateReviewFixTags`,
A6), and its settlement holds at most one entry per finding of its set, each with the disposition and channel action its
set's finding action gives, carried only from the record's predecessor — the per-set rule
`HostedLaneAttemptBindingSchema` and `validateHostedSettlementEvidence` apply today
(`rg/core/operation-state-schema.ts`), extracted into one exported function that the binding calls per node and this
parser once. It also holds the approved-disposition record's refinements that carry over
(`ApprovedDispositionLineageNodeSchema`, `ApprovedDispositionRecordSchema`, `rg/core/advisory-records.ts`): a record
pending its policy projection carries no performance or successor; an Errand's performance binds its Errand, its fix,
and its target transition, a hosted one keeping its originating change request; a delivery member's binds its member,
its fix, and its hosted transition, with host coordinates as its source kind gives and never a frontline source; and a
Candidate-owned private member's head is its fix's old head. Only a Candidate lineage's performance carries
`candidateResponseId` (`validateResponseDigestLineage`, `rg/core/lane-progress-state-validation.ts`).

Its write check holds the rest. The key is the record's `dispositionSetId`. A hosted set's finding actions cover exactly
the sealed findings of its result's outcome, and its settlement names only those (`validateHostedSettlement`,
`rg/core/lane-attempt-validation.ts`). A record created is checked as it stands, so a successor it names exists in the
same batch naming it as predecessor, and the import's records, created already performed and settled (§ 11.2), check as
a fresh write does. The approving verb writes a hosted record's first settlement entries `record-only` and uncarried, as
lane progress requires today (`validInitialHostedDisposition`, `rg/hosts/local/operation-state-store.ts`), and the check
does not carry that rule, since no check can tell such a write from an imported one. Tags, including their absence, are
fixed at creation: every advance preserves them, as `isFixResponseAdvance`, `isDispositionSuccessorAdvance`, and
`isPolicyProjectionAdvance` preserve the lineage node's other fields (`rg/hosts/local/disposition-record-store.ts`, A6).
A successor's new record may carry its own tags while its predecessor's stay unchanged. An update carries today's
in-place rules for what moves into the kind. From the disposition store's accepted advances (`appendDispositionRecord`,
`rg/hosts/local/disposition-record-store.ts`):

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
(§ 8.3). The review gate's durable-record inventory (`REVIEW_DURABLE_RECORD_INVENTORY`, `rg/core/schema-inventory.ts`)
keeps today's entries: it lists the schemas registered with the review gate (`assertReviewDurableRecordInventory`),
and the family's kinds register with the store (`PRODUCTION_REGISTRATIONS`, § 2.5), never there. The deletion pass
removes today's records' entries with their in-repo arm.

From the flip the evidence port also reads a producer's records as today's approved-disposition record, composed from
that producer's evidence records, each node retaining its optional tags exactly, including absence (A6), its source
references resolved as § 9.3 states, a local source's `localSourceRef` the cited outcome's `sourceDigest`, and binds the
port today's readers take (`ApprovedDispositionRecordStore`, `rg/core/ports.ts`), so every reader of it — frontline
closure and admission (`settledFrontlineAdviceReader`, `rg/policy/frontline-phase.ts`), reduction's local arm, resume's
check, respond, and policy evidence among them — keeps its input, as lane progress's composed read keeps the policy
modules' (§ 4.7).

### 7. `review/adversarial-pass`

#### 7.1 Key and activities

One record per adversarial planning or criteria pass, keyed by the store's `pass` key (`{ activity, number }`,
`lib/store/identity.ts`), its number counting the work item's passes of that activity across every loop, so a re-entered
loop never reuses a key. Its activities are the adversarial-review method's fire-points, each binding the artifacts its
fire-point supplies the pass, each by its store version, and the code head where it reviews code:

| Activity            | Fire-point                      | Artifacts bound                      |
| ------------------- | ------------------------------- | ------------------------------------ |
| `draft-readiness`   | draft readiness                 | draft                                |
| `spec-finalization` | spec finalization               | spec, and its draft where one fed it |
| `task-generation`   | task-generation finalization    | spec, task list                      |
| `design-amendment`  | a design amendment's footprint  | spec, task list                      |
| `verification`      | work-unit verification          | spec, task list, and code head       |
| `criteria`          | the task loop's criteria passes | spec, task list, and code head       |

#### 7.2 The recording verb

This change builds `arc review adversarial record`, one call at the disposition approval that writes the record. Its
request names the work unit by slug, which resolves through `lookup`, and one of § 7.1's activities. The CLI derives the
versions of the artifacts that activity binds and the pass number, refusing where the listing it numbers from is
incomplete; publishes its input schema; refuses malformed input naming the expected shape; and returns a
`review-adversarial-record` envelope carrying the record's key and version, its errors through the review error union.
Before the flip the in-repo implementation refuses its write `unsupported`, as it refuses every durable review fact's,
and the verb reports it as an `unsupported` error variant of its own mode alone, so no other mode's error union widens,
built for that mode outside the shared code set (`ReviewCommandErrorCodeSchema`), whose remedial variants carry a spine
remedy that needs an argv. Its remedy is the store's (`RemedySchema`, `lib/store/refusal.ts`) with `text` alone, since
no command serves until the flip, naming where the method keeps the pass until then: the
work unit's `ADVERSARIAL-PASSES.md` for a planning activity, and the criteria report for `verification` and `criteria`;
the cutover's rewrite points the method's fire-points at the verb.

#### 7.3 Fields

A small typed header — the activity; the artifact versions reviewed, and the code head where it reviewed code; the
rubric's identity; `Pass N of M`; who approved the dispositions and when; any over-cap approval; the stop reason; and
one disposition per finding, its identifier and action — with the evaluator's report and each finding's account as
prose. Fix-check rounds, finding origins, and the author's corrections ride the prose, so how much of them becomes typed
can change later with no schema change here.

The record holds no next-pass authorization. A later pass's prior findings are composed from the records, launching a
pass consumes nothing, and a pass over the cap carries its own approval.

#### 7.4 Write check

The kind's parser validates the header against its schema, its artifacts those its activity binds (§ 7.1), and refuses
two dispositions for one finding, and its write check refuses a record whose key's activity is not its header's. The
report is prose and unchecked. `Pass N of M` counts passes within one loop, so it is not the key's number, which counts
across loops.

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

From the flip a review can end after its Candidate is replaced. A re-root refuses while the Candidate it replaces holds
a live attempt — `pending`, `partial`, `ambiguous-delivery`, or `findings` not yet settled
(`livePredecessorReviewAttempt`, `rg/lane-progress-supersession.ts`; `inspectReRootReviewAuthority`,
`handlers/lifecycle-delivery-review.ts`) — but sees only what its clone holds. Another clone's attempt under way is that
clone's in-flight state (§ 4.7), an ending attempt confirms only its head against its own checkout (`confirmTarget`),
and the ref backend expected from the flip meets the two clones' writes at a pull, whose merge reports what a write
check finds rather than refusing it. An outcome left live on a replaced Candidate therefore reads as outdated (§ 4.1):
it keeps its findings as recorded, counts toward no pass (§ 4.3), and neither carries an unresolved finding into a
successor's review nor refuses one, since no response can settle it, `arc review respond` binding the current Candidate
(`rg/runtime/respond-command.ts`). Legitimate history never holds one, since the re-root that replaced its Candidate
would have refused.

A successor's review still refuses an attempt of a replaced Candidate that is in flight on its clone
(`readCandidateInheritedLaneProgress`). From the flip its remedy is to finish or resume that attempt there, its outcome
then reading as outdated, and retry; today's remedy, restoring a worktree at the predecessor's record commit, makes that
record current only while records ride the branch. `arc attest`'s re-root refusal keeps its remedy, the record it would
replace still being current when it refuses, and names that record's store version where it names its commit today
(`candidateRecordRevision`, `lib/work-unit/verbs/attest.ts`).

#### 8.5 Write check

The kind's parser carries the schema's checks above and the Candidate ID's and each response ID's recomputation, as
`CandidateManagedRecordV1Schema`'s refinements carry them today. Each reads the record alone, so the kind registers no
write check (§ 2.5).

### 9. `review/integration-boundary`

#### 9.1 Field by field

| Field                               | From the flip                                                                                                                                                                                                                                                                                                            |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `schemaVersion`, `mode`, `workUnit` | Kept; the format version, `schemaVersion`, advances to 2 (below).                                                                                                                                                                                                                                                        |
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
| `readinessBinding`                  | New, on `candidate-publish-ready` and `publication-pending`, `null` where unbound (§ 9.2).                                                                                                                                                                                                                               |

`verificationKind`'s `"tier-3"` value is renamed in the same reshape (§ 12.6).

The kind's parser admits both versions, told apart by `schemaVersion`: 1, today's shape, and 2, the shape above. The
in-repo implementation reads the boundary through its deferred decode of today's parse (`decodeTrackedContent`,
`lib/store/in-repo/read-codec.ts`; § 2.5), so version 1 is what it reads and writes before the flip; and an ended work unit's
boundary keeps version 1 after it, since the import lands an ended work unit's records as found (§ 11.2). Every write
from the flip records version 2: the write check refuses version 1 (§ 9.5), and only the backends serving the flip run
write checks. Each reader takes the version its arm expects, the in-repo arm version 1 and an arm from the flip
version 2. The format version the store keeps beside every record stays 1, since the registry gives each kind one and a
parser receives only the content.

#### 9.2 The readiness binding

Publication refuses when standard review progress changed after readiness was recorded. Today that compares the standard
lane's progress-record version (`standardLaneOwnerVersion`) in `authorizeSubmission` and `authorizeActivePublication`
(`lib/work-unit/verbs/publish.ts`), the publication claim (`handlers/lifecycle-delivery-review.ts`), and in
`handlers/review.ts` both readiness's own write and the re-entry over an advanced boundary. That version moves on every
write to the lane's progress record, a pass admitted but not yet finished among them (`recordLocalPendingAttempt`).

From the flip those facts are records of their own, so the boundary binds `readinessBinding`: a digest over the current
listing of the standard lane's outcomes on the Candidate's lineage, the evidence responding to those outcomes, the
`approved-fix` extra-pass decisions on that lineage, and withdrawals of those decisions — each record by its key and a
digest of its canonical content (`canonicalize`, `lib/kernel/canonical/canonical-json.ts`) — and of the lane's
in-flight attempts, each by its attempt ID and a digest of its canonical in-flight state. A store version is each
backend's own, and a backend may store a JSON record's bytes canonicalized or as written, while a digest of canonical
content is the same on every backend and in the import's mapping (§ 11.2). A withdrawal is listed because withdrawing an
`approved-fix` extra pass writes the progress record today (`withdrawConditionalNextPassAuthorization`). Termini,
selections, and lane skips stay outside it, as they stay outside the progress record today. Each of those sites
recomputes the digest and refuses on a mismatch, and refuses an incomplete listing rather than reading it as unchanged:
from the flip the authorizers' version port (`readStandardLaneOwnerVersion`, `lib/work-unit/verbs/publish.ts`) gives
way to a binding read returning the recomputed digest or `incomplete`, its in-flight attempts the standard lane's record
on the Candidate lineage's owner, and the authorizers parse the boundary by its version. Until the flip the version
guards publication as today.

A binding of `null` is unbound, and every publication site refuses it as it refuses a mismatch. Readiness never writes
it. Every projection that writes `publication-pending` carries the binding it was published under, the publication
boundary's input (`PublicationBoundaryInputSchema`) and its recovery (`recoverPublicationBoundary`,
`rg/policy/integration-boundary-locus.ts`) among them, where they carry no such field today. The import writes it where
a boundary's `standardLaneOwnerVersion` no longer matches the lane's progress, or is absent (§ 11.2), as today's
authorizers refuse such a boundary (`authorizeActivePublication`, `lib/work-unit/verbs/publish.ts`), so readiness
records again.

In-flight attempts are machine-local (§ 4.7), so the binding sees only the publishing machine's: publication from one
machine does not see an attempt another has in flight on the same Candidate. This change accepts that residual, since
two machines reviewing one work unit at once falls outside the unit ARC governs, one developer and one agent on one work
unit at a time.

#### 9.3 Commands keep their inputs; judgments become decisions

The next action names its command, which status renders (`handlers/status/lifecycle.ts`), and cites records by stored
reference:

- **`continue-pre-publication-review` toward `arc review respond`** keeps `responseOperationId` and `responseSource`
  (`ContinuePrePublicationActionSchema`, `rg/policy/integration-boundary-locus.ts`), which status relays into its
  published continuation and `prepare-work-unit.md` reads, as opaque keys that match the stored outcome. The operation ID
  is the cited attempt's ID (`reviewOperationId`, which `rg/policy/review-policy-attempt.ts` sets from its `attemptId`),
  which the outcome keeps (§ 4.2). The source reference in `responseSource` has the outcome key as its durable part, a
  hosted one its acknowledged `attemptId` (below), and the import resolves a stored one's durable part the same way
  (§ 11.2). Respond reads the result by its attempt ID through the result reader, which from the flip composes it from
  the outcome (§ 4.7), and checks the reference's other part as today — a local or frontline durable part against the
  result's, a hosted operation part against its lane's (`resolveLocalSource`, `resolveFrontlineSource`,
  `resolveHostedSource`, `rg/runtime/respond-command.ts`) — so no published schema widens and no workflow text changes.
- **The `--resume` token** (`buildPrePublicationResumeCommand`, decoded by `PrePublicationReplayInputSchema`) keeps the
  call's own inputs as today — the Candidate binding, self-review settlement, the change set, each lane's scope mode and
  invocation, the scope judgment target, and the ordering-recovery input. The Owner's judgments it carries today — a
  ceiling override, an additional pass, and a terminus — leave it and become decisions the resolution reads (§ 5). With
  them go `frontlineCeilingHeadSha`, which today keeps a frontline override off a moved frontline head, and the
  scrubbers `consumeOwnerAcceptedTerminus` and `consumeFrontlineCeilingOverride`
  (`rg/policy/pre-publication-request.ts`): the frontline override decision's reach, the frontline head it was decided
  on, binds it, and a terminus binds only where its reach carries it (§ 5.6).
- **The frontline resolve form's `request` and `authorizationRequest`** keep their call inputs, the `policyJudgment`
  they relay among them, so `arc review frontline resolve` reads a ceiling override from its request as today
  (`resolveFrontlineSelection`, `frontlineConditionalAdmission`, `rg/policy/frontline-command.ts`). The judgment the
  form relays is already recorded, so the resolve call names its decision and writes nothing (below); a conditional
  pass authorization's ID is its `approved-fix` decision's key (§ 5.2).
- **Where an extra-pass judgment is written.** Every call carrying an Owner's ceiling override or additional pass writes
  it as a decision on the vehicle's work item, recording the active identity (§ 5.7): `arc review pre-publication
  --lanes` (`ReviewLaneJudgmentSchema`), `arc review status --ceiling-override` and `--additional-pass`, and the request
  fields that relay one — the frontline resolve form's and local preparation's `policyJudgment`
  (`rg/policy/frontline-command-schema.ts`, `rg/runtime/local-prepare.ts`), a hosted request's `ceilingOverride` and
  `additionalPassAuthorization` (`rg/hosted/request.ts`), and delivery's local review admission's
  (`rg/policy/delivery-local-review-admission.ts`). The relaying fields stay call inputs, so no workflow text changes
  before the flip, and a call relaying a judgment already recorded names that record (§ 5.2).
- **Where a terminus is written.** Every call carrying an Owner's singleton terminus — `arc review pre-publication
  --lanes` (`ReviewLaneJudgmentSchema`'s standard-lane terminus) and its `--resume` replay — writes it as a decision on
  the Candidate's work item, recording the active identity (§ 5.7): in one batch with the boundary where the call
  persists one, as `handleReviewPrePublication` does at `candidate-publish-ready` and
  `candidate-convergence-verification-pending` (`handlers/review.ts`), and alone where it persists none, as a call
  returning `run-self-review` or `continue` does. The resolution reads singleton termini within their reach (§ 5.6) at
  composition, as it reads extra passes, and a boundary persisted later names the decision (§ 9.1). A member terminus is
  written by its acceptance with the boundary naming it.
- **The pre-publication envelope's `policy`,** the resolve envelope `arc review pre-publication` publishes beside the
  boundary (`PrePublicationReviewEnvelopeSchema`), on which its handler and the workflow route, stays an output: from
  the flip `prePublicationBoundary` (`rg/policy/pre-publication-procedure.ts`) strips it before the boundary is written,
  as it strips the target and response binding today. The envelope's version 2 arm types it per variant, as version 1's
  variants do: a resolve envelope on the review-resume variant, which the policy-review one folds into, or `null`, a
  nullable one on `candidate-fix-pending`, and `null` elsewhere (§ 3.5).
- **A command's source reference** (`bindReviewSourceReference`, `rg/core/review-source-reference.ts`), which the local
  attest, local resume, reduce, and frontline run envelopes publish as `receiptRef` and `outcomeRef`
  (`rg/core/review-command-envelope.ts`), keeps its opaque shape; local attest's and resume's `sourceRef` is the source
  store's own reference, which this change leaves as it is. From the flip its durable part is the cited result's
  outcome key, which every reader decoding it (`parseReviewSourceReference`) resolves to that outcome — `arc review
  respond`, the result's disposition (`rg/core/review-result-disposition.ts`), earlier-review applicability, the
  Candidate's review-fix continuation, delivery's execution, and the integration checkpoint's response confirmation and
  lineage review — while `arc review reduce` binds one and compares it with its result's, so no published schema changes
  before the flip.
- **A hosted result's reference** (`attemptRef`), which `bindReviewSourceReference` binds with the acknowledged
  `attemptId` as its durable part (`rg/policy/pre-publication-request.ts`), keeps that part, the producer ID that
  content-addressed records keep (§ 11.3). From the flip a reader resolves it to the outcome holding that `attemptId` on
  the lineage's subject owner, as hosted settlement matches it in lane progress today (`readHostedSettlementAttempt`,
  `handlers/review.ts`).
- **A local result's source reference** (`localSourceRef`), which the result reader takes from the operation state's
  `sourceRef` today (`rg/hosts/local/review-result-reader.ts`) and an approved-disposition record's local source repeats,
  is the source store's record name, a digest over the clone's materialization path (`sourceRecordName`), which no
  stored record names (§ 2.4). From the flip the result and the record the evidence port composes (§ 6.6) both carry the
  cited outcome's `sourceDigest` there, so the disposition's source match (`approvedRecordSourceMatchesResult`,
  `rg/core/review-result-disposition.ts`) and the source respond writes (`rg/runtime/respond-command.ts`) hold on every
  clone and after the source's pin is released, and the Candidate's review-fix continuation
  (`readPendingCandidateReviewFixAuthority`, `rg/policy/candidate-review-fix-continuation.ts`) compares the record's
  reference with its outcome's `sourceDigest` in place of the operation state's `sourceRef`. Local attest's and resume's
  envelope `sourceRef` stays the source store's own reference (above).

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

The kind's parser carries the boundary schema's rules (`IntegrationBoundaryLocusSchema`,
`rg/policy/integration-boundary-locus.ts`): the next action, reservation, and continuations each locus admits, as its
variant's refinements state them today, and each delivery member at most once in `deliveryReviewTermini`, as its
refinement requires today, with `readinessBinding`, a digest or `null`, present exactly on `candidate-publish-ready`
and `publication-pending`. Its version-1 arm is today's parse (`parseIntegrationBoundaryLocus`), which reads a legacy
hosted-review-pending boundary as `delivery-status-required`, as both in-repo codecs read it today
(`lib/store/in-repo/read-codec.ts`, `write-codec.ts`). Its write check refuses a write of `schemaVersion` 1 (§ 9.1).
Today's store adds only parsing and a version compare (`writeSubmissionBoundary`), which the store's own versions carry.

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
`arc review pre-publication <slug>` and no reservation, as `projectCandidateReviewBoundary` writes it, keeping the
terminus names the boundary carries, since the Candidate and its subject are unchanged, in the same batch as its
lifecycle write. This change adds that write to the lifecycle change's store-backed reopen (`runStoreReopen`,
`lib/work-unit/verbs/reopen-store.ts`). Then:

- both authorizers refuse the reopened work unit's publication, as they refuse any boundary still in review;
- a no-change `arc attest` keeps the matching boundary rather than restoring publication authority, since the singleton
  publication recovery takes only an Integrating work unit (`recoverAttestedSingletonPublicationBoundary`,
  `rg/policy/integration-boundary-locus.ts`), so publication waits until `arc review pre-publication` records readiness
  again over the Candidate's recorded review;
- an interrupted publish, whose boundary stays `publication-pending`, keeps its continuation as today, so the two read
  apart. A work unit reopened before the flip imports with its boundary as it stands (§ 11.2).

From the flip publication writes its claim, the boundary's `publication-pending`, in the publish transition's batch
(`additionalWrites`, `runStorePublish`, `lib/work-unit/verbs/publish-store.ts`), where today it writes the claim before
the transition (`claimPublicationBoundary`): a publish interrupted before that batch leaves nothing to continue, and one
interrupted after it leaves `publication-pending` with the work unit Integrating, which finishes as today.

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
final write. One rule covers every site this change gives such a read or write: every store this change opens — each
composition root's, and the one the typed access opens where its caller passes none (§ 3.1) — goes through one wrapper
that, on that refusal, pulls the named history refs by name (`pull({ history })`) and retries once, with no stop. This
change builds it, since the ref backend's own contract leaves every caller's retry to its verb, and it alone needs that
refusal and its pull on base: where they have not landed when it is built, it waits for a base merge that brings them,
and nothing else in this change does (§ 14.4). Its instances include attest `--new-root` on a Shipped work unit
(§ 12.1), the Candidate history read of an ended item (§ 8.4), the review writes after such a re-root, merge's landing
link (§ 12.3), and an applicability selection on an archived work unit (§ 8.1). The checkpoint's and merge's lifecycle
read (§ 12.4) and readiness under `with-integration` (§ 12.7) read an archived item's current records, which the ref
backend serves from its archive refs, so they need no history ref; their stores pass through the wrapper all the
same.

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
pure module under `lib/store/kinds/review/`: given today's records as read, it returns the new records with their work
items and keys, and a listing that accounts for every source it was given exactly once — each gate file by the
`gate.path` it was given, its `arc/review-gate/` prefix included; a leftover materialization once by its folder, written
with a trailing `/` and covering every file below it; each Candidate version as `<tracked path>@<commit>`, its tracked
path the one its work unit's slug gives (`resolveCandidateRecordRelativePath`); and each boundary by its tracked path —
as mapped with the records it became, left behind with a reason, or in flight, no two entries covering one file. A file
mapped in part, as the repository-wide receipt ledger is, lists as mapped, its reason naming the entries it left
behind. The import's reads, its writes, its trial, and its refusals stay the ref backend's.

The mapping expects one contract of the import, available from the flip: that it calls the mapping through an optional
port (`reviewMapping`, on the import's `runStoreMigrate`), whose input and result types the mapping meets by shape,
importing nothing of the import's, with `arc store migrate`'s handler passing it in; that it gives the mapping the
project ID, the review gate's whole folder under the Git common directory (`arc/review-gate/`), its quarantined and
retired records among them, each live work unit's Candidate versions, oldest first from the record's path log, with its
current boundary, and a table of every work unit and Errand it carries, each with the UID it minted (§ 11.3) and whether
it is live (§ 11.1), an Errand with its claim ID too, since its review lineages name it by that ID, which is random
(`claimId`, `lib/errand/identity-record.ts`), a name the table lacks being no live work; and that it lands what the
mapping returns in place of the Candidate and boundary records and gate files it gave.

#### 11.1 Live work

Live work is any work item a later verb may still read to decide, as the import's table marks it: Errands an identity
ref holds — open, paused, or awaiting merge (`lib/errand/identity-record.ts`) — and work units neither archived,
abandoned, nor cut, one merged but not yet archived among them, as is routine under `archive.cadence: manual`. An
archived work unit has ended unless its branch still exists and has not landed in base by patch identity
(`isLandedInBaseStrict`, `lib/git/branch-containment.ts`), tested against `origin/<base>` where it resolves and the
local base otherwise, as for one archived before merge under `archive.cadence: with-integration`. The import refuses
until such a work unit's branch merges, or is removed where its change has already landed or is no longer wanted, so the
mapping never meets one.

The review gate's machine-local facts are imported for live work only. A shipped change's review lives on in its pull
request on the host and in the commits that carried its records, and nothing reads an ended item's facts to decide.

#### 11.2 The mapping

- **The review gate's facts for work that is not live** — left behind (§ 11.1), before any rule below applies, so a
  pending attempt on ended work never holds the import.
- **Lane progress's attempts (`operations/`, `lane-progress`), each but `pending`** — one `review/outcome` each (§ 4),
  keyed as § 4.1. A local attempt joins its `local-review` operation record, for its request, actors, policy binding,
  attestation, source digest (`sourceDigest`), and guidance digest (`guidanceDigest`), and its receipt
  (`evidence/receipts-v2.json`), kept as recorded with its findings, by `requestId`, so its result's digest recomputes
  as today's (§ 4.2); one that ended without a receipt, as a stale target does, maps from its operation record alone.
  Its findings take their ordinals by position, as `rg/core/local-review-result.ts` assigns them. Each outcome takes its
  `lineage` from its admission, a frontline or hosted attempt's, or from its `local-review` request, a local attempt's,
  since lane progress records only its latest attempt's lineage. A frontline attempt takes its admission from lane
  progress and joins its frontline outcome (`outcomes/`) by operation ID, for its executable identity, outcome digest,
  and findings as recorded. A hosted attempt keeps its sealed result, its findings projected as `projectHostedFinding`
  projects them (`rg/hosted/await.ts`). A `settled-findings` attempt maps to `findings`, which its evidence — approved,
  with its performance where its set carries a fix — then reads as settled (§ 4.2). The outcomes one lane-progress
  record maps take `endedAt` values rising strictly, a millisecond apart, in the order the record holds their attempts,
  the last the record's `updatedAt`, the latest time any could have ended (§ 4.2). So the composed order (§ 4.7) keeps
  the record's order within a pass, which the source-order check and the effective terminal attempt read for a pass that
  fell back across sources or retried them in source order (`validateConfiguredAttempts`,
  `rg/policy/review-policy-driver.ts`; `effectiveTerminalAttempt`, `rg/policy/pre-publication-request.ts`); one shared
  time would hand that order to generation and attempt ID.
- **A `pending` attempt** — nothing: its lane-progress file lists as in flight, returning none of its records, and the
  import refuses until the cutover's quiesce has finished it.
- **`completedPasses`, `terminalProducer`, `settledFindingIds`, `attemptedSources`, tail pointers** — nothing: each
  derives from the records (§ 4.3, § 6.3).
- **An approved-disposition record (`evidence/disposition-*.json`)** — one `review/evidence` per disposition set the
  record holds (`ApprovedDispositionLineageNodeSchema`, § 6), naming the predecessor the record gave it
  (`predecessorDispositionSetId`) and, where one was approved over it, its successor (`successorDispositionSetId`); its
  result resolved from today's source reference to the result's outcome key; its performance joined from the lineage
  node's own fix response (`errandFixResponse`, `deliveryMemberFixResponse`) and lane progress's response performance
  for that set, current or superseded (`responsePerformance`, `responsePerformanceHistory`); and its settlement with the
  hosted attempt's settlement evidence and finding actions for that set. Its optional `advisoryFixTags` are copied
  from that lineage node exactly where present, outside the approved set, with absence preserved (A6).
- **A conditional pass authorization** — an `approved-fix` extra-pass decision keyed by its `authorizationId`, its
  `authorizedBy` and `capturedAt` the decider and time, its subject and pass count as § 5.1 gives an `approved-fix`
  pass. Every attempt a consumed one admitted — its admitting attempt, which `admissionId` names, a local attempt by its
  `attemptId` and a hosted one by its admission's ID (`hosted.admission.admissionId`), and each retry after it at its
  pass — cites it as `admittedBy` (§ 4.6); a withdrawn one also gains a withdrawal decision from `withdrawnBy` and
  `invalidatedAt`; a superseded one stays derived from its successor set's evidence.
- **The frontline skip marker (`operations/`, `frontline-phase`)** — a frontline lane-skip decision on its Candidate,
  reaching its supersession chain (§ 5.6), with no decider and its `updatedAt` as the time.
- **The repository ID (`identity/repository-identity.json`)** — left behind, its value the project ID the import passes
  in. A record naming another repository ID is left behind too, written under an identity nothing reads from the flip.
- **A frontline outcome record no current attempt joins** — left behind: its attempt was retired with an earlier store,
  and its record names no lineage to place it on.
- **Frontline run state and review suspensions (`operations/`, `frontline-run`, `review-suspension`)** — left behind:
  working state (§ 4.7).
- **A live work unit's Candidate record, every replayed version** — `review/candidate`, every version, transitions whole
  (§ 8). A work unit reopened before the flip keeps its `publication-pending` boundary through the import: today's
  records cannot tell a deliberate withdrawal from an interrupted publish, both admitted by
  `authorizeActivePublication`'s `publication-pending` arm (`lib/work-unit/verbs/publish.ts`), so it keeps its
  publication authority after the import, as it does today, and a reopen from the flip withdraws it. Each review
  response's approval joins the evidence record for its disposition set, which also holds the machine-local approval, so
  one disposition set yields one record; a review response that later versions repeat maps once, at the first version
  holding it.
- **A live work unit's boundary, at its current content** — `review/integration-boundary` (§ 9.1). Its `terminus` and
  each `deliveryReviewTermini` entry become terminus decisions, decided by `acceptedBy` with no time, their basis
  `{ passCount }` the pass count they hold, and the boundary names each by key where it held it (§ 9.1). Today's
  terminus records no subject of its own (`OwnerAcceptedReviewTerminusSchema`, `rg/policy/review-terminus.ts`) and binds
  where its boundary holds it, so the boundary's `terminus` takes as its subject the Candidate and subject digest the
  boundary was written for (`candidateId`, `candidateSubjectDigest`), with no head (§ 5.1), and a member's entry takes
  its member vehicle; each therefore keys as the live decision would (§ 5.1). The `--resume` token's judgments become
  decisions with no decider, an extra pass the lineage has already used reading as spent (§ 5.5): an additional pass
  becomes an `additional` extra pass; a ceiling override becomes a `ceiling` extra pass unless it cites a conditional
  pass authorization (`conditionalPassAuthorizationId`), which maps to nothing, since that authorization's
  `approved-fix` decision covers it, a frontline one decided on the head the token bound it to
  (`frontlineCeilingHeadSha`); and a terminus maps to nothing where the boundary carries a terminus, and otherwise
  becomes a terminus decision on the boundary's subject, as above, whose basis is the pass count the imported outcomes
  give its Candidate, passes carried across its supersession chain included, as the token's terminus counts them today
  (`readLaneProgress`'s inherited passes, `rg/policy/pre-publication-composition.ts`), so no one is asked to accept
  again. Every other decision the mapping writes has a `null` basis (§ 5.1). The next action then carries the token
  re-encoded with the call's own inputs alone (§ 9.3). The mapping decodes today's token through today's replay schema
  and decoder (`PrePublicationReplayInputSchema`, `decodePrePublicationReplay`), which move out of `handlers/review.ts`
  into a pure module the mapping and the review gate share, beside the replay schema and encoder from the flip, whose
  ordering-recovery `expectedBoundaryVersion` is a store version (§ 3.5) and which the replay from the flip decodes;
  `responseOperationId` stays as recorded, the attempt ID its result's outcome keeps, and `responseSource`'s durable
  part resolves from today's source reference to that result's outcome key, as an evidence record's does, a hosted one
  keeping its acknowledged `attemptId` (§ 9.3); and `"tier-3"` becomes `"merge"`.
- **The boundary's `standardLaneOwnerVersion`** — `readinessBinding`, computed over the imported records, only when the
  version equals the standard lane's current progress version; otherwise, the field's absence included, `null`, unbound
  (§ 9.2), so publication refuses and readiness records again, as today (`authorizeActivePublication`).
- **Disposition records in an older shape, which today's reader skips (`parseEnumeratedRecord`)** — left behind: 192 of
  the store's disposition records on 2026-10-15.
- **A Candidate version today's reader refuses** — one failing its schema (`readCandidateRecordVersioned`) or one whose
  supersession chain does not resolve (`resolveCandidateSupersessionAncestors`) — left behind: no live work unit holds
  one today, and the archived Candidates the diagnostic run supplies hold both kinds.
- **`quarantine/` and `retired/`** — left behind: quarantined disposition records and retired snapshots of earlier
  stores, machine-local under D5, which no reader decides from.
- **A not-live work unit's Candidate and boundary files** — never given to the mapping: the import lands them as found,
  in today's shape, on their history refs, where an ended item's records are retired by derivation (§ 10.4).
- **Sources, materializations, locks, the hosted request owner index, and `local-review` records** — left behind:
  working state, read only for the joins above, a leftover materialization listing once by its folder. The pins that
  keep a local review's materialization reachable (`refs/arc/review/local/`, `refs/arc/review/local-scope/`;
  `rg/hosts/local/source-sweep.ts`) are refs outside the folder the mapping is given, and nothing maps them.

Two decisions with the same content map to one record, since a decision is keyed by its content (§ 5.2).

#### 11.3 Work items and keys

Each record's work item resolves from the slug or vehicle today's records name — a Candidate's work unit, through its
supersession chain for a superseded Candidate's ID; a delivery member's work unit; an Errand's claim — to a UID the
import mints. A result's work item is the one its lineage names (§ 2.3), and its evidence lands on the same work item,
so a disposition with no binding lands on its result's. A hosted response's producer ID, which is the attempt's
acknowledged `attemptId`, resolves to its attempt's outcome key (§ 4.1) where a record cites the result, as an evidence
record's `result` does, while the content-addressed fields that digest it, a disposition set's and an `approved-fix`
decision's, keep it as recorded (§ 5.1).

#### 11.4 Mapped records are valid

The import parses each record the mapping returns and applies the serialization rules, refusing one that fails under
`review-mapping`, but runs no write check. The mapping module stays registry-free and checks nothing at runtime; its
tests, and a run over this repository's records, prove that every record it returns parses under its kind's schema and
passes its kind's write check over the set it returns, and the import's own parse of what it lands is the runtime
backstop. `history` returns each version's content unparsed (`HistoryEntrySchema`, `lib/store/contract.ts`); a live
chain is mapped whole, so a chain walk meets one shape, and nothing walks the chain of work that is not live to decide.

### 12. Delivery at the flip

#### 12.1 `arc attest`'s meta writes, and its refusal on a paused work unit

Today `arc attest` writes an Active work unit's meta through `setMetaBulletFields`
(`handlers/lifecycle-delivery-review.ts`): `Current Workflow` and `Next Action`, from the values `ATTESTED_ORIENTATION`
supplies (`lib/work-unit/verbs/attest.ts`), `Next Action` taken from the next action of the boundary it writes where the
singleton publication recovery applies or the boundary does not match on a work unit not Shipped; on a repair of the
current Candidate, `Current Workflow` is written only where it changes and `Next Action` only where the boundary does
not match or the field is empty; `Last Completed`, the task list's last completed task (`resolveLastCompletedTask`); and
`Next Task`, cleared to `[none]`. It writes the `Candidate` bullet through `setMetaCandidate`. From the flip:

- it writes `Current Workflow` and `Next Action`, with the values and under the conditions today's handler selects,
  through the meta kind's field writers, inside the batch that writes the Candidate and its boundary, and writes none of
  `Last Completed`, `Next Task`, and `Candidate`, as the meta kind's shipped field table settles: from the flip no verb
  writes the first two, and the Candidate record's `attestation.candidateId` holds the third;
- it first reads the work unit's pause and, when the work unit is paused, refuses with a typed reason naming
  `arc resume <slug>`, writing nothing; after `arc resume` the same call succeeds;
- it reads the work unit's meta record and task list through the store, as the lifecycle change's store-backed verbs
  read them (`readWorkUnit`, `lib/store/lifecycle-write.ts`; the stored task list, as `runStoreReopen` reads it,
  `lib/work-unit/verbs/reopen-store.ts`), in place of today's reads of the files under `.arc/active/` and, for
  `--new-root`, of the composed lifecycle index (`buildLifecycleIndex`), so a shipped work unit resolves by `lookup`
  (§ 10.4).

The pause is the lifecycle change's, effective from the flip: pausing replaces parking and records the pause in the work
unit's meta (its parsed `pause` field), and every verb that advances a paused work unit refuses the same way
(`checkAdvancingPause`, `lib/store/lifecycle-pause.ts`). This change reads it and adds no pause state of its own.

The meta's `Candidate` bullet has readers, and from the flip each reads the work unit's `review/candidate` record's
`attestation.candidateId` instead, a move this change makes: the lifecycle change's store-backed publication, which
refuses a Candidate the meta does not name (`inspectPublication`, `lib/work-unit/verbs/publish-store.ts`); its
store-backed rename, which refuses renaming a work unit whose meta names a Candidate (`readStoreRenameSubject`,
`lib/store/lifecycle-rename.ts`) and from the flip refuses where it holds a `review/candidate` record, as today's rename
refuses where either record exists (`commands/rename.ts`); and session-init's projection of the work unit's boundary
(`commands/active/status.ts`) and the subject's Candidate authority (`lib/locus/subject-meta.ts`), both fed by the
active meta reader (`lib/active/meta-reader.ts`). The staged-archive comparison (`lib/locus/derived-evidence.ts`)
compares the bullet across an archive's two metas, absent in both from the flip, and needs nothing.

Two more reads move from the flip. The subject (`projectCheckoutSubjectMeta`, `lib/locus/subject-meta.ts`) reads the
Candidate record's content and the boundary through the store, in place of their files in the other checkout, which the
flip stops writing. The shipped projection takes the store (its `store` option) and reads the Candidate record through
it (`readStoreSubjectCandidate`), gated on the meta's `Candidate`; this change gates that read on the Candidate record's
`attestation.candidateId`, as above, and reads the boundary through the same store, where the projection reads its file
(`readSubmissionBoundary`, `lib/work-unit/submission-boundary-store.ts`). And delivery inspection's task-list read
(`readTaskList`, `lib/delivery/repository-entry.ts`), which `arc attest`'s renewal of an Integrating or Shipped work
unit and the reopen permit (`permitDeliveryReopen`, `handlers/lifecycle-delivery-review.ts`) run through, reads the
stored task list; the lifecycle change leaves that read to delivery.

The probe's nested reads use that same store and the exact work-unit owner selected for the subject (A6).
`runDerivedLocusStateProbe` (`handlers/derived-locus-state-probe.ts`) passes them to `inspectRepositoryDeliveryEntry`
for an Integrating subject's correction projection, including its stored task-list read, and to
`readPendingCandidateReviewFixAuthority` for the pending-fix projection, which reads stored outcomes and evidence
through the bound family ports (§ 6.6). Neither path may reopen a default store for the subject's checkout or fall back
to its materialized Candidate, boundary, task-list, or legacy disposition files when the supplied store reports
`stateOffBranch`. In-repo the existing file and common-directory behavior stays.

Session-init's projection also shows an Integrating work unit's boundary only while its meta names a `Branch`
(`commands/active/status.ts`), which from the flip the meta does not carry, its work-branch link holding it. From the
flip that projection takes the branch from the link (`selectWorkBranchLink`, `lib/store/lifecycle-branch.ts`), as the
shipped `readStoreWorkUnitEvidence` takes it for the subject (`lib/locus/store-work-unit-evidence.ts`, A6).

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

The link names the merge commit the host reports (`providerMergeId`, read from `merge_commit_sha`,
`scripts/integration/merge-composition.ts`); where merge finds the pull request already merged, as a rerun or a failed
merge's recovery does, `readMerged` tells three states apart in place of today's boolean — not merged, merged with the
host's merge commit, and merged with none reported — and each merged state is handled as a fresh merge's: a merge commit
gets its link, and where the host reports none (`providerMergeId` `null`) no link is written and the result reports the
landing-link state not written, naming the rerun. The link joins the work item's other links in one whole-value write
(`LinksSchema`) against the version read. A link write that fails after the merge lands leaves the merge reported
landed, its result's landing-link state not written, and names the rerun (§ 3.5), whose already-merged path writes the
link.

Under `with-integration` the work unit is archived when its merge lands, so the link is a write to a completed item: on
a clone lacking that item's history ref, the write refuses `state-unresolvable` naming the refs it lacks, and the
landing's root pulls them by name and retries, as every write to a completed item's records does (§ 10.4). No verb
writes a change-request link today: a workflow step opens the pull request (`gh pr create`, `integrate-work-unit.md`),
and archive records it only as the meta's `PR URL` (`lib/work-unit/verbs/archive.ts`). Whichever verb the cutover's
rewrite gives that step writes the link, naming its repository the same way.

#### 12.4 Locus's arms

Five reads branch on `stateOffBranch` for the store-derived locus from the flip, where Errands are project-scope work
items listed at placement `active` and claims stay identity-scoped, each acquired on its own:

- **The review gate's Errand reads** (`readLocalReviewLiveContext`, `rg/hosts/local/live-context.ts`;
  `resolveActiveErrand`, `rg/runtime/respond-composition.ts`). Today they read this identity's transient snapshot
  (`readTransientInFlightIndexes`, `projectTransientInFlightRead`, `lib/errand/record.ts`), refuse when it is
  incomplete, and take the claim on the checkout's branch: the live context an open or awaiting-merge one, refusing when
  several claim the branch, and respond's Errand resolution an open one only, resolving none when several match. From
  the flip the checkout's marker gives its Errand claim, which it already carries (`claimId`,
  `lib/git/worktree-marker.ts`), since the store's claims hold grooming, housekeeping, and conflict claims only
  (`lib/store/catalog.ts`); the subject Errand's record resolves by `lookup` through that claim (`CheckoutClaimSchema`'s
  `errand` arm, `lib/store/lookup.ts`) and is read under the state filter each read applies today; review refuses,
  naming the record and what was reported, where either refuses with anything but `not-found`. A diagnostic in the
  listing of Errands refuses nothing by itself, since another person's malformed record is not this review's to
  repair; where the lookup finds no Errand while that listing carries one, review refuses naming those diagnostics and
  their remedies, since one may be the subject's own record.
- **The review gate's work-unit resolution:** the live context's work-unit half (`readLocalReviewLiveContext`), which
  today takes the active meta whose `Branch` names the checkout's branch (`readActiveMetaCandidates`,
  `lib/active/meta-reader.ts`) and reads its file, and the review subject's (`resolveReviewSubject`,
  `rg/core/review-subject.ts`), which parses the work unit from the branch name (`branchToWorkUnitSlug`). From the flip
  the meta carries no `Branch` and its file need not exist, so both resolve the work unit by the store's reverse lookup
  on its branch link (`lookup`'s `ref` arm), the repository the project ID, and read its meta record through the store.
  The shipped `resolveActiveWu` (`lib/release/wu-resolution.ts`) selects checkout occupancy through
  `resolveCurrentWorkUnit`, then reads the selected owner's branch link; that shared contract stays unchanged (A6).
  A review-local resolver takes the invocation's store and project-ID reader and performs the reverse branch lookup
  above. The review gate's five calls to the shared resolver switch to that review-local path: the
  incremental-applicability check, hosted review progress, and the chunking resolve
  (`handlers/review.ts`), and the pre-binding delivery target's originating top and lifecycle paths
  (`createPreBindingDeliveryReviewTargetDependencies`, `rg/policy/pre-publication-composition.ts`). The originating top
  compares the checkout's branch with the work item's work-branch link (`selectWorkBranchLink`,
  `lib/store/lifecycle-branch.ts`) in place of the meta's `Branch`, and the lifecycle paths take the meta's projected
  path (`workUnitMetaPath`, `lib/store/lifecycle-write.ts`, which the `work-unit-paths` ratchet does not count) in place
  of its file's.
- **Delivery entry inspection's work unit and meta:** `inspectActiveRepositoryDeliveryEntry`
  (`handlers/delivery-entry.ts`), which `arc delivery entry inspect` runs on every task, at preparation, and at
  integration, and delivery execution's review-fix inspection (`resolveReviewFixLocus`, `handlers/delivery-execution.ts`).
  Today each resolves the work unit through `resolveActiveWu`, the review-fix one a completed work unit through the
  Candidate mutation owner (`resolveCandidateMutationOwner`, `handlers/candidate-mutation-owner.ts`) and the composed
  lifecycle index (`buildLifecycleIndex`), reads the meta file, and reads the task list at the path its `Task List`
  names (`lib/delivery/repository-entry.ts`). From the flip each resolves the checkout's work unit by the same link, the
  review-fix one confirming its completed owner by `lookup` in place of the index, reads its meta record through
  `readWorkUnit` (`lib/store/lifecycle-write.ts`), and reads its task list as stored (§ 12.1). The owner itself still
  resolves through the shipped store-aware `resolveCandidateMutationOwner` and its probe (§ 14.4, A6).
- **The integration checkpoint's lifecycle read** (`readLifecycleSummary`,
  `scripts/integration/checkpoint-composition.ts`). Today it composes the lifecycle index over the checkpoint's
  versioned file view (`resolveComposedLifecycleIndex`) for the work unit's position and its meta's artifact facts;
  merge calls it too, to compare (`readStatus`, `scripts/integration/merge-composition.ts`). From the flip it reads the
  work unit's current meta record through the store, at the checkpoint and at merge alike, merge comparing that record's
  version with the one the checkpoint bound (§ 3.2): its position from the record's placement and lifecycle state, and
  its artifact facts from the stored meta, never from the export (§ 12.5). A meta the store does not find reads as
  `nonexistent`, as a missing meta does today, a malformed one is an artifact fact, and any other refusal stops the read
  with its condition.
- **`arc status <slug>`'s operational-boundary read.** Today `resolveSlugOperationalBoundary`
  (`handlers/status/lifecycle.ts`) reads the boundary only through a materialized worktree, and warns without one. From
  the flip the command returns through the lifecycle change's store arm in the same module
  (`handleStoreLifecycleStatus`), which reports `integrationBoundary: null`; that arm reads the boundary record through
  the store for an active or integrating work unit, wherever it is checked out, and reports it and its next action as
  recorded, rendering that action's command (§ 9.3), with no currentness projection, since no checkout is at hand.
  `resolveSlugOperationalBoundary` stays the in-repo arm, and the interrupted-publication hint with it: the hint fires
  for an Integrating work unit at `prepare-work-unit` whose boundary is `publication-pending`
  (`handlers/status/lifecycle.ts`), and from the flip publish writes Integrating, its next workflow, and that boundary
  in one batch (§ 10.1), so an Integrating work unit at `publication-pending` has finished publishing and its next
  action is the push.

#### 12.5 D18's export and its review copy

From the cutover the Candidate review subject is the code in the Git index alone. `collectGitCandidateSubject` selects
reviewable entries through `classifyPathTreatment(path, context)`, whose context carries the work unit and its
projection paths, and whose work-unit arms the cutover removes once their consumers move off them.

This change builds D18's export, effective at the flip, since until then specs ride the branch: the
`storage.track_design_docs` option (`lib/config/schema.ts`) and the copy, `spec-<slug>.md` in the export folder
`.arc/specs/<slug>`. One export function writes and stages the copy at the points D18 names, each a ceremony that
commits on the branch: `arc attest` adds it after its refusals, just before writing the Candidate record — the subject
it collected before then may omit the copy, which is evidence-neutral (below) — and when a review fix amends the stored
spec, its response re-exports it: after the fix's commit, `arc review respond`, right after it records a Candidate's
performed fix (`recordPerformedResponse`, `rg/runtime/respond-command.ts`), on its first write and its replay alike,
compares the stored spec with the copy and re-exports on a difference, reporting where it overwrote a hand-edited copy,
and the commit that follows carries it, as today's staged Candidate response rides one. An Errand's or a delivery
member's response exports nothing: an Errand has no spec, and delivery's own redesign decides its members' (below). From
the flip neither attest's records nor the response's need a commit, so the cutover's rewrite keeps attest's commit step,
and the one after a fix's response, for the copy alone, as the storage contract's D15 keeps one for any ceremony that
changes tracked files. A candidate-tail step the cutover's rewrite adds deletes it.

The merge lock guards the delete, with no check of its own (§ 13, item 6). Where the project locks merges
(`merge.lock: draft`), the pull request stays a draft until `arc integrate merge` releases the lock for the checkpointed
head (`releaseLock`, `scripts/integration/merge.ts`; § 12.7), after the candidate tail, so no accidental merge in the
host outruns the delete. A draft is a procedural hold that anyone with write access can lift (`gh pr ready`), so a
deliberate merge before the delete, or any early merge where the project sets no lock, leaves the copy on the base
branch, which an ordinary change removes, as D18 names for a project with no merge gate; nothing reads the copy back.

The delete must not reopen review, so lifecycle classification keeps the one arm D18 names (§ 13, item 5): the work
unit's own export path is evidence-neutral, as its design artifacts are today (`isWorkUnitArtifactOrCompanion`,
`lib/evidence-applicability/path-treatment.ts`). No code knows the export path yet, so this change adds the export
folder as a layout address (`resolveArcPath`, `lib/layout/projection.ts`) resolving to `.arc/specs/<slug>` with no
trailing separator, which a managed path refuses as an empty segment (`validateManagedPath`,
`lib/kernel/canonical/managed-path.ts`); the export, the continuation proof (§ 5.6), and the arm the export brings to
`classifyPathTreatment` all read it. The arm classifies by path alone, and only the folder of the work unit its context
names, so another work unit's copy stays reviewable; the subject digests reviewable entries only
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
  `rg/policy/integration-boundary-locus.ts`), emitted by the boundary's action builder at its callers, the integration
  checkpoint and the pre-publication procedure (`createRunConvergenceVerificationAction`), and built by `arc attest` for
  its result's next actions under its own schemas (`AttestConvergenceVerificationActionSchema`,
  `lib/work-unit/verbs/attest.ts`), becomes `"merge"`, the merge quality gate's declared name, when the boundary
  reshapes at the flip, in every place together (§ 3.5), each published schema's check admitting it beside `"tier-3"` for
  a full scope, the boundary's version 1 keeping `"tier-3"` alone and version 2 taking `"merge"` alone (§ 9.1); the
  import rewrites it in each live boundary (§ 11.2). Renaming a live record's value before then would
  stop older records parsing.
- **Raw review reports are scratch.** Chunk reports, aggregate results, and evaluator reports in the work unit's
  workspace are inputs to the records above, never evidence of their own; from the flip they belong in the work unit's
  scratch folder, which nothing archives.
- **Workflow text** changes once, in the cutover's rewrite: the adversarial-review method's fire-points onto the
  recording verb (§ 7.2), review reports into the scratch folder, a verb for opening the pull request that writes the
  change-request link (§ 12.3), the candidate-tail step that deletes the review copy (§ 12.5), and the removal of the
  record-commit and keep-staged steps (§ 14.3), keeping attest's commit step, and the one after a fix's response, for
  the review copy (§ 12.5).

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
- the pull request's head branch compared with the work item's work-branch link (`selectWorkBranchLink`,
  `lib/store/lifecycle-branch.ts`), in place of a slug parsed from the branch's name (`branchToWorkUnitSlug` in
  `identityFacts`), refusing `vehicle-branch-mismatch` where they differ, so a branch adopted under another name, which
  the review gate resolves by its link (§ 12.4), passes; an Errand keeps today's check;
- for an archived work unit, the lifecycle listing's diagnostics in place of parsing every other meta, a listing it
  cannot read whole (`unreadable`, or `missed`) refusing as an `unreadable-artifact` fact, and, where its `Cohort` names
  one, the cohort document's record in place of the planned and completed files, refusing as today's cohort checks do
  (`cohortCoordinateFacts`) for the cohort and, for a subcohort, its parent: while an open member or subcohort remains,
  `missing-cohort-coordination` where no document resolves; once none remains, `incomplete-cohort-closeout` where the
  document is still placed planned, since archive's batch places it `completed` with the final member
  (`checkCohortArchiveCloseout`, `lib/store/kinds/cohort/rules.ts`), `missing-cohort-closeout` where none resolves, and
  `malformed-cohort-closeout` where its Closeout section fails today's check (`validCohortCloseout`), since the store's
  write check holds placement alone and the section is written by hand.

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
  at the head being released. Readiness still refuses a pull request whose head branch is not the work unit's linked
  branch (`vehicle-branch-mismatch`), so what a direct `arc merge lock release` lets through is a pull request with no
  link on this work unit's own branch, under a lock that is itself a procedural hold (§ 12.5).

An Errand's and a delivery member's readiness read no lifecycle state, so neither changes, including a delivery member's
lock release, which evaluates readiness directly (`evaluateReviewReadiness`, `handlers/delivery-execution.ts`); the
delivery reads (`deliveryMemberLookup`, `readDeliveryAncestry`) stay on Git.

### 13. Forward amendments to the storage contract

`spec-storage-contract.md` is shipped; these amend it forward, effective when this change lands:

1. **D5: `review/terminus` becomes `review/decision`,** carrying every decision about a review subject outside the
   Candidate's own selections — extra passes, termini, lane skips, and withdrawals — not termini alone.
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
  `lib/work-unit/git-candidate-subject.ts`, which imports both records' path resolvers; `handlers/delivery-entry.ts`;
  and `lib/delivery/repository-entry.ts`.
- **The boundary's shape and publication's authority:** `rg/policy/integration-boundary-locus.ts`, which holds the
  boundary's and next action's schemas and projections that reshape (§ 9.1, § 9.3, § 12.6), with two new modules beside
  it, `integration-boundary-locus-v2.ts` for version 2's schema and `integration-boundary-locus-shared.ts` for the
  pieces both versions use, so the projections' module imports version 2 and nothing imports back;
  `lib/work-unit/verbs/publish.ts`, whose two authorizers compare the readiness binding from the flip (§ 9.2); and the
  lifecycle change's `lib/work-unit/verbs/publish-store.ts`, whose store-backed publication carries the readiness
  binding in place of `standardLaneOwnerVersion` and the boundary's terminus (§ 9.2), and its
  `lib/work-unit/verbs/reopen-store.ts`, whose batch rewrites the boundary (§ 10.1).
- **Delivery's review reads and writes:** `lib/delivery/review-fix.ts`, which builds the advanced disposition record a
  delivery member's fix writes; `lib/delivery/review-fix-continuation.ts`, which reads its resolved policy request; and
  `handlers/delivery-execution.ts`'s disposition and operation-state reads, its disposition write, its Candidate and
  boundary reads and writes with their staging (§ 14.3), and its review-fix inspection's work-unit, meta, and task-list
  reads (§ 12.4). The rest of `handlers/delivery-execution.ts` is delivery's own, and changes with it rather than here.
- **Readers of the meta's `Candidate` and of the records' paths:** `commands/active/status.ts` and
  `lib/locus/subject-meta.ts` (§ 12.1), with the lifecycle change's `lib/work-unit/verbs/publish-store.ts` and
  `lib/store/lifecycle-rename.ts`; `handlers/status/lifecycle.ts`'s operational-boundary read (§ 12.4); and the path
  classifiers `lib/base-drift/current-adapters.ts`, `lib/delivery/lifecycle-contribution.ts`, and
  `lib/delivery/review-fix-record-effects.ts`, which take the path resolvers from their new home (§ 3.1).
- **The locus probe's nested review reads:** `handlers/derived-locus-state-probe.ts`, which passes its store,
  project-ID reader, and exact selected owner into delivery inspection and pending-fix authority (§ 12.1, A6), with
  `handlers/candidate-mutation-owner.ts`'s existing store-aware entry points exercised by the review harness (§ 14.4).
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
- **The shipped correction and report helpers:** `rg/runtime/local-correction-context.ts`, whose
  `createLocalContributionConfirmation` takes the bound core read ports instead of the concrete local store classes;
  `response-report.ts`, whose replay and earlier-round reads retain optional stored tags; and `lane-pass-counts.ts`,
  whose two derived counts keep their units (§ 4.3, § 6.2, A6). The correction-proof and next-pass helpers these roots
  call receive the same composed ports; they gain no new durable record or policy authority.
- **Ordinary next-pass context:** `handlers/review-next-pass-context.ts`'s `readResolveNextPassContext` receives the
  invocation store and project-ID reader, uses them for live context and Candidate history, and takes composed core
  operation/disposition read ports rather than a concrete local operation store. Its hosted-Errand helper receives
  the same bound ports, preserving both pass counts without constructing another Candidate store (§ 2.4, § 4.3, A6).
- **The read-only lane composition:** `rg/runtime/lane-read-composition.ts` binds the invocation store, project-ID
  reader, Candidate and boundary access, and composed outcome/evidence/operation ports for `readReviewLane`, its
  result reader, and `readReviewLaneHistory`. Its core helpers keep deriving lane facts and rejected findings from
  those inputs, with the same verdicts and no record writes (§ 2.4, § 6.6, A6).
- **The schema modules the family splits,** `rg/core/operation-state-schema.ts` and `rg/core/advisory-records.ts`, and
  every module importing either, re-enumerated at implementation rather than fixed to a pre-landing count, by role:
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
      `rg/core/local-prepare.ts`, `rg/core/local-source-sweep.ts` (which from the flip recognizes a finished local review
      by its stored outcome, where it finds a receipt today), `rg/lane-progress-local-retry.ts`,
      `rg/runtime/local-prepare.ts`, `rg/runtime/local-prepare-retry.ts`, `rg/core/frontline-retry-contract.ts`, and
      `rg/runtime/frontline-retry-remedy.ts`, with `rg/policy/frontline-pending-admission.ts`, which withdraws a
      frontline admission that never ran (§ 4.7, § 5.5), and `rg/runtime/frontline-admission-validation.ts`, which
      confirms the admission is still held before its run starts.
    - _Registration._ `rg/core/ports.ts` takes the new kinds' ports. `rg/core/register-review-schemas.ts` registers none
      of their schemas, which register with the store (§ 2.5), so the review gate's schema IDs stay as today but for the
      recording verb's request schema (§ 7.2), and its durable-record inventory (`rg/core/schema-inventory.ts`) stays as
      today until the deletion pass (§ 6.6).
    - _Unchanged unless their shapes change._ `rg/core/review-command-envelope.ts`, which imports only the reduction
      projection's schema, and `rg/providers/coderabbit/frontline-execution.ts`, which imports only the
      `FrontlineExecutableIdentity` type the outcome keeps.
- **The store:** `lib/store/catalog.ts` and `lib/store/registry.ts` (§ 2.1), the new `lib/store/kinds/review/` modules,
  `lib/store/kinds/registrations.ts` (§ 2.5), and `lib/store/in-repo/read.ts`, whose read of a review record takes its
  placement from the reading checkout's own tree first (§ 3.1); and, where the ref backend's import lands first,
  `arc store migrate`'s handler, which passes the mapping into the import's port (§ 11).
- **The recording verb:** `cli.ts`, which registers `arc review adversarial record` under a `review adversarial` parent;
  its handler in `handlers/review.ts` (§ 7.2); its input schema, registered in `rg/request-command-schemas.ts` and named
  in `ReviewPublicRequestSchemaId` (`handlers/review.ts`), so the tests pinning every published schema ID name it; and
  the help that every visible command carries, `lib/cli-help-summaries.ts` (`COMMAND_SUMMARIES`) and
  `lib/cli-help-content.ts` (`HELP_GROUPS.review`), which `cli-help-coverage.test.ts` requires.
- **D18's export:** the new export module; `lib/layout/schema.ts` and `lib/layout/projection.ts`, which gain the export
  path's address; `lib/evidence-applicability/path-treatment.ts`, which gains its arm (§ 12.5); and
  `lib/config/schema.ts`, which gains `storage.track_design_docs`.
- **Workflow text:** none. `integrate-work-unit.md`, `prepare-work-unit.md`, and `verify-work-unit.md` keep today's
  record-commit and keep-staged steps, and `deliver-stack.md` its step committing a returned `commit-selection`; the
  flip's rewrite of them is the cutover's (§ 12.6).

#### 14.3 Retired rather than moved

These exist only because records ride the branch. Each keeps today's in-repo arm, all behind one branch on
`stateOffBranch`; from the flip the mechanism retires, and where it carried a fact that persists, the section its bullet
cites says what holds that fact. The deletion pass removes them:

- **Write, then stage:** the `git add` sites in `handlers/lifecycle-delivery-review.ts`, `handlers/candidate.ts`,
  `rg/runtime/respond-composition.ts` (`appendCandidateResponse`, `stageCandidateResponse`),
  `rg/runtime/singleton-publication-response.ts`, and `handlers/review.ts`'s Owner terminus, pre-publication boundary,
  and attestation-ordering recovery writes (`recoverAttestationOrdering`); and `handlers/delivery-execution.ts`'s four,
  after its record-effect recovery and its Candidate and boundary writes.
- **`commit-*` next actions:** `commit-boundary` (`rg/policy/delivery-review-terminus.ts`, `handlers/review.ts`,
  `scripts/integration/checkpoint.ts`) and `commit-selection` (`rg/policy/review-applicability-resolution.ts`,
  `lib/work-unit/candidate-applicability-resolution.ts`, `handlers/candidate.ts`), and the keep-staged rule
  (`keep-staged-until-publication`), emitted by `handlers/review.ts` and the checkpoint's post-attest continuation
  (`checkpointPostAttestContinuation`, `scripts/integration/checkpoint.ts`), with the diff base that tolerates it
  (`resolvePrePublicationDiffBase`, `rg/policy/pre-publication-composition.ts`).
- **Replays against `HEAD` or the index:** the staged-terminus recovery in `handlers/review.ts`, the boundary checks in
  `scripts/integration/checkpoint-composition.ts`, and `scripts/integration/candidate-response-confirmation.ts`'s
  `HEAD == approvedHead` check and its comparison of the committed record with the worktree's.
- **Proofs that a record commit moved the head:** `confirmCandidateResponseHeadContinuation`'s proof that a record
  commit followed the fix, `projectGitDeliveryTerminalRecordAdvance` (`lib/delivery/public-review-continuation-git.ts`),
  the owner-terminus advances it proves in `rg/status-composition.ts` and
  `scripts/integration/checkpoint-composition.ts` (`ownerTerminusAdvances`), the arms of the terminal coordinate advance
  that call it (`projectGitDeliveryTerminalCoordinateAdvance`) at delivery entry, status, and the checkpoint, its
  subject-equality and machine-proof arms staying, and mechanical carry's reads of the Candidate at a head
  (`gitCandidateRecordAtHead`, `recordsOwnSelection`), with their deciding consumers
  `rg/policy/earlier-review-applicability.ts` and `rg/policy/local-review-coverage-selection.ts`. The port threaded
  through the lane-progress, hosted, frontline, local-prepare, and respond modules for the first stays, from the flip
  proving only the copy-only successor § 5.6 admits.
- **Protecting a subject digest from the work unit's own writes:** `handlers/review.ts` honoring an advanced boundary
  only while the Candidate's head is the current root. The arm that keeps the Candidate and boundary paths neutral
  (`candidateProjectionPaths`, `lib/work-unit/git-candidate-subject.ts`) stays from the flip until the deletion pass:
  nothing writes those paths from the flip, but a live work unit's committed files stay on its branch (§ 10.3), and
  without the arm they would classify as reviewable and move the subject digest its imported Candidate holds.
- **Records read from history or a head tree:** the Candidate history read's in-repo arm,
  `readRepositoryCandidateSupersessionChain` and `readRepositoryCandidateRecordRevision` (`git log`, `git show`; § 3.1),
  which the store's `history` serves from the flip (§ 8.4), the shipped-delivery boundary replay in
  `scripts/integration/checkpoint-composition.ts`, and `readGitDeliveryLifecycleArtifactsAtRef`.
- **Delivery's record-effect settlement, whole:** its capture of the records a delivery member's review fix writes, its
  reconstruction of the Candidate and boundary at Git revisions (`reconstructExpectedRecordEffects`,
  `handlers/delivery-execution.ts`; `reconstructDeliveryReviewFixExpectedRecords`), and its commit and push of them
  (`settleDeliveryReviewFixRecordEffects`, `lib/delivery/review-fix-record-effects.ts`). From the flip the fix writes
  the Candidate and boundary through the store, and no commit carries them.
- **Decisions inside a command string:** the `--resume` token's judgments and their scrubbers (§ 9.3).
- **The frontline skip marker:** its record kind, operation-ID domain, published schema ID, schema-inventory variant,
  `FrontlinePhase*` names, and `readSingletonFrontlinePhaseClosure` (§ 5.9); and the policy driver's `phase-closed` skip
  reason, which the deletion pass renames `window-closed` (§ 5.9).
- **Today's review records' inventory entries** (`REVIEW_DURABLE_RECORD_INVENTORY`), with the in-repo arm that writes
  them (§ 6.6).
- **The per-clone repository ID record** (`identity/repository-identity.json`), read by nothing from the flip (§ 2.4).

#### 14.4 Order

This change builds on the merged lifecycle change: it rewrites `handlers/lifecycle-delivery-review.ts` and
`lib/work-unit/verbs/publish.ts` over that change's edits, edits its store-backed publication (§ 12.1), adds the
boundary write to its store-backed reopen (`reopen-store.ts`, § 10.1), and consumes its pause record and project-ID port
(§ 2.4, § 12.1). The merged base already supplies the locus interfaces this change consumes (A6):

- `projectCheckoutSubjectMeta` takes a store, `readStoreSubjectCandidate` reads its Candidate through that store, and
  `readStoreWorkUnitEvidence` resolves its branch link; the authority and boundary changes in § 12.1 build on them.
- `handleStoreLifecycleStatus` (`handlers/status/lifecycle.ts`) still reports `integrationBoundary: null`; this
  change supplies that read (§ 12.4).
- `acquireDerivedLocusEvidence` (`lib/locus/derived-evidence.ts`) acquires Errands and claims through
  `readStoreIdentityEvidence` when off branch and skips the identity-ref read. The harness must exercise hosted-Errand
  discovery through `runDerivedLocusStateProbe` with store-only Errand records. Only Errand status's retained
  vehicle read (`readTransientIdentitySnapshot`, `rg/status-errand.ts`) needs an identity-ref fixture until the
  cutover moves it; tests of that reader seed both substrates.
- `resolveCandidateMutationOwner` already forwards `store` and `projectId` to the probe, and
  `resolveCompletedCandidateWorkUnits` already reads completed store evidence when off branch
  (`handlers/candidate-mutation-owner.ts`). Tests use these production entry points with seeded records and exact
  marker/topology evidence, with no owner stand-in. Respond's Candidate reads and writes, applicability resolution,
  and delivery execution's review-fix inspection and acknowledgement pass the same invocation-bound store to them.
- The probe's delivery-correction and pending-fix callbacks still need the same-store wiring § 12.1 adds. The
  harness tests those branches with no materialized review or task-list files and no legacy disposition records.

The two direct Errand reads § 12.4 reroutes still take the marker's `claimId`. The review-local branch lookup does not
change `resolveActiveWu`'s shared checkout-occupancy contract. The shipped standard policy already distinguishes
completed logical passes from complete-coverage ceiling passes (§ 4.3), and approval already stores optional fix tags
outside canonical dispositions (§ 6.2); schemas, mapping, and callers preserve both contracts.

The kinds and their registration (§ 2) precede every chunk that writes or reads through them; the review gate's
work-unit and Errand resolution (§ 12.4), the boundary's version 2 (§ 9.1), and `arc attest`'s store reads and writes (§
12.1) precede every flip-time test that attests, reviews, or publishes; and the checkpoint's binding (§ 3.2) precedes
the integration reroute. The ended-item retry (§ 10.4) is built near the end, since it alone needs the ref backend's
`state-unresolvable` refusal and `pull({ history })` on base and waits for a base merge that brings them where they have
not landed; this change needs nothing else of the ref backend before the flip. The subject's store read (§ 12.1) remains
after it in the task order, but its store and Candidate-reader prerequisites are already available on base; it carries
no further locus landing wait (A6).

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

**Trust.** Decided-by records the active identity the review gate resolves on each path today (§ 5.7), an identity
rather than a credential, so ARC claims no more than that. A disposition approval keeps its rule that proposer and approver
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
(§ 11); no reader keeps today's shapes for live work, the boundary's version 1 serving only an ended work unit's
records (§ 9.1), and today's review-gate folders stay inert on every clone (§ 4.7).

**User-facing impact.** Before the flip: what the checkpoint's binding changes in what merge compares (§ 3.2); published
schemas, the review error schema, and merge's result widening to admit what the flip changes while emitting nothing
new; `storage.track_design_docs`, which nothing reads until the flip, and the export path's classification, which
matches no path until then (§ 3.5); and `arc review adversarial record`, registered and refusing `unsupported`
(§ 7.2). From the flip: delivery makes no record-only commits and its next actions name no `commit-*` step;
`arc attest` refuses on a paused work unit; a reopened work unit records readiness again before publishing; the
`frontline-phase-closed` diagnostic is renamed (§ 5.9); `verificationKind` reads `"merge"` (§ 12.6); adversarial passes
are recorded with `arc review adversarial record` (§ 7.2); review on a clone holding no project ID refuses until it
holds one (§ 2.4); merge reports whether it wrote the landing-commit link (§ 12.3); and a pull request carries its
spec's review copy until the candidate tail deletes it (§ 12.5).

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
4. **The mapping accounts for everything.** Run over this repository's review records, the mapping's listing accounts
   for every source it is given exactly once — each gate file, Candidate version, and boundary — as mapped with the
   records it became, left behind with its reason, or in flight; every record it returns parses and passes its kind's
   write check; a fixture holding a `pending` attempt lists its file as in flight; and the supersession chain read
   through the mapped Candidate records equals today's reader's (`readRepositoryCandidateSupersessionChain`) for every
   live work unit.
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
7. **Logical ordinals and ceiling counts stay distinct (A6).** Complete logical pass 1 followed by incremental
   logical pass 2, including across Candidate supersession, yields completed logical count 2 and standard ceiling
   count 1. A grant binds 2 and admits logical pass 3; its import, key, replay, consumption, and retry retain those
   logical units, while an incremental pass cites no grant.
8. **Optional fix tags survive (A6).** Approval, import, composed reads, replay, and earlier-round reporting retain
   optional per-fix tags outside disposition and approval identity. Present tags cover exactly the set's `fix`
   findings; absence stays absent, every advance preserves it, and a successor leaves its predecessor unchanged.
9. **The harness uses production locus resolution (A6).** Active and completed Candidate owners resolve through the
   production entry points over the supplied store and exact marker/topology evidence with no meta file or owner
   stand-in; hosted-Errand discovery succeeds with no identity-ref copy of its stored records.
10. **Nested subject reads use the same store (A6).** Through the production probe, an Integrating subject projects
    delivery correction without materialized task-list, Candidate, or boundary files; an Active changed target
    projects pending-fix authority from stored outcomes and evidence without legacy disposition records. Both bind
    the exact selected owner and invocation store without reopening a default store for the subject's checkout.

## Open Questions

None blocks starting. The rest are expected contracts with stated availability, and none leaves design open: the ref
backend's history refs and its import giving this change's mapping its inputs and landing what it returns, available
from the flip (§ 10.4, § 11); its `state-unresolvable` refusal and pull by name, which the ended-item retry needs on
base before it is built, near the end of this change's work (§ 10.4, § 14.4); and the cutover's quiesce, workflow
rewrite, and deletion pass (§ 11.2, § 12.6, § 14.3).

## Amendments

- **A1** — 2026-10-16 — design: the Candidate kind registers no write check, its parser carrying every rule it holds,
  since each reads the record alone (§ 2.5, § 8.5). _Supersedes:_ Goal 1 and Success Criterion 1, "a write check", for
  `review/candidate`. _Trigger:_ task generation's grounding audit. _Work:_ generate-tasks. _Revalidated:_ spec-review.
- **A2** — 2026-10-16 — design: published schemas that carry what the flip changes — the boundary's version 2,
  `verificationKind` `"merge"`, and a store version where they carry a record's version — widen before the flip to admit
  it, nothing they emit changing until the flip (§ 3.5). _Supersedes:_ Goal 8, "no observable change before the flip
  beyond Goal 6, the rerouting, and the recording verb's registration", which gains these widened schemas.
  _Trigger:_ task generation's grounding audit, which found the boundary's version 2 and store versions refused by the
  outputs that carry them. _Work:_ generate-tasks. _Revalidated:_ spec-review.
- **A3** — 2026-10-16 — design: the existing tests that pin what Goal 6, the recording verb's registration, and A2
  change — the checkpoint's recorded version, the lists of published schema IDs, and the widened schemas — change with
  them. _Supersedes:_ Success Criterion 2, "the review gate's and delivery's existing tests pass over the in-repo
  implementation with no assertion changed", which excepts those tests. _Trigger:_ task generation's grounding audit.
  _Work:_ generate-tasks. _Revalidated:_ spec-review.
- **A4** — 2026-10-16 — design: what is observable before the flip also gains the review error code
  `project-identity-unavailable` with a remedy-carrying variant for each mode (§ 2.4), merge's landing-link state in
  its `merged` arm (§ 12.3), `storage.track_design_docs` with the lists kept by hand that name every option, and the
  export path's classification (§ 12.5), none emitting or reading anything until the flip (§ 3.5); and the existing
  tests pinning them change with them. _Supersedes:_ Goal 8's list of what changes before the flip, as A2 amends it,
  which gains these; and Success Criterion 2's "with no assertion changed", as A3 amends it, which excepts those tests.
  _Trigger:_ task generation's adversarial review, whose first pass found each of them visible before the flip and
  unlisted. _Work:_ generate-tasks. _Revalidated:_ spec-review.
- **A5** — 2026-10-16 — design: published contracts that require a field of a mechanism the flip retires — the
  run-verification action's post-attest continuation, a member terminus's acceptance result, and delivery's acknowledged
  verification result — widen before the flip to admit their flip-time shape without it, nothing they emit changing
  until the flip (§ 3.5); and the existing tests pinning them change with them. _Supersedes:_ Goal 8's list of what
  changes before the flip, as A2 and A4 amend it, which gains these; and Success Criterion 2's exceptions, as A3 and A4
  amend it, which gain those tests. _Trigger:_ task generation's adversarial review, whose second pass found each
  refusing its flip-time shape. _Work:_ generate-tasks. _Revalidated:_ spec-review.
- **A6** — 2026-10-19 — design: align review storage with shipped contracts. _Supersedes:_ § 5, § 6, § 14.4.
  _Trigger:_ F1–F4 review. _Work:_ review-fix. _Revalidated:_ review-fix.

---
