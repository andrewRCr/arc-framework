# Spec (`detailed` · `RFC`): seam-decomposition

- **Origin:** [internal] — the `storage-seam` cut (2026-10-09); stage 2 of the storage program.

- **Purpose:** Rebuild `arc decompose` for the store. From the flip a cut runs over records in two batches — an additive
  batch writing its members, any new cohort documents, and the stored cut map, then, after authoring and the one
  distribution approval, a terminal batch writing lineage and the dependents' edges — carrying today's domain rules and
  none of its Git machinery, which stays untouched as the in-repo arm until the cutover's deletion pass.

---

## Introduction / Context

ARC's storage contract has shipped: one interface for every read and write of operational and planning state (`Store`,
`lib/store/contract.ts`), an in-repo implementation over today's substrates (`lib/store/in-repo/`), the record kinds'
parsers, field writers, and write checks (`lib/store/kinds/`), and a transition write path whose verbs branch on
`capabilities.stateOffBranch` (`usesOffBranchState`, `lib/store/lifecycle-write.ts`). Decomposition has not moved.
`arc decompose` (`handleDecompose`, `handlers/decompose.ts`) plans a cut over Git trees, stages its members on a
`chore/decompose-<origin>` candidate branch or in the base checkout, advances the candidate over base by an append-only
merge (`advanceGitDecomposeTransitionBase`, `git-decompose-transition-base-advancement.ts`), and writes its lineage
record under `.arc/system/.internal/transitions/` (`writeTransitionRecord`, `transition-record-store.ts`) — the
substrate the storage-coupling register's key 49 names. From the flip the state it reads and writes no longer lives in
those trees, so `arc decompose` needs a version that works over the store and writes a cut in the store's batches (D3).

Today's code would not reroute cheaply. Re-verified at `5b82bb851`, which carries the merged `seam-lifecycle` and
`seam-record-kinds`, the machine's size comes from its substrate:

| Bucket                                                                                                          | Lines  | Exists because of           |
| --------------------------------------------------------------------------------------------------------------- | ------ | --------------------------- |
| Git adapters: preflight, three-tree plan, execute, `--finish`, base advancement, candidate cleanup, lineage I/O | ~4,800 | Git and tracked files       |
| Staging, occupation, and rollback state machines over ports                                                     | ~1,600 | the candidate branch        |
| Planners over path-keyed whole-repository trees: the repository plan, the retirement delta, ROADMAP             | ~3,500 | state as files in Git trees |
| Domain rules: source units, cut map, conservation, topology, lineage builder, extraction thinning               | ~3,100 | the decomposition itself    |
| Refusals, remedies, reporting, and the CLI entry                                                                | ~2,300 | partly Git conditions       |

- **The pure layer is path-keyed.** It finds metas by filename and placement prefix (`readTreeMetas`,
  `supportedMetaPath`, `decompose-v3-repository-tree.ts`), takes whole-repository trees read blob by blob
  (`readGitV3RepositoryTree`, `git-decompose-v3-repository-plan.ts`), and emits path-level mutations, ROADMAP's among
  them. Rerouted over store snapshots, it would be rewritten either way.
- **It costs.** `--execute` runs preflight four times and builds the plan three times (`revalidateCommandMap`,
  `composeGitV3RepositoryPlan`, `revalidateOperationPlan`, and the `revalidateStaged` callback, all in
  `git-decompose-v3-operation.ts`). Each preflight reads every meta on every local branch one blob at a time, two `git`
  processes apiece (`readGitV3DecomposeTreeSnapshot`, `git-decompose-v3-preflight.ts`; `readGitBlobEntry`,
  `lib/io-context.ts`): about 57,000 Git subprocesses per `--execute` here, estimated from the code, not measured. The
  storage seam's own cut, over 14 local branches, took about 25 seconds to preflight and 5 minutes 50 seconds to execute
  (2026-10-09), and refused an edit outside the origin only at execute's plan build, nearly two minutes in
  (`retirement:source-private-modified`, `decompose-v3-retirement-delta.ts`).
- **It reads no store.** Nothing in the machine reads `Store` or the capability; it imports only the lineage and cohort
  kinds' parsers and writers.

Defects observed or verified at source shape the rest:

- **Base advancement refuses authored destinations.** It requires every planned path to equal the composed after-state
  (`exactTransitionTree`, `git-decompose-transition-base-advancement.ts`), yet the workflow authors destinations over
  the scaffolds the cut composed; the 2026-10-05 rehearsal found it refusing them. The verb never says which bytes it
  composes and which the author writes.
- **A decomposed origin cannot be torn down from the flip.** Teardown's store arm maps a decompose lineage record to
  `landed` and refuses one lacking `retiredBranches` (`store-retirement-evidence.ts`), and the lineage builder writes
  none (`createDecomposeTransitionRecord`, `decompose-transition-record.ts`).
- **A dependent off base is never seen.** Only metas on base are rewritten: `liveWorkUnits`
  (`decompose-v3-repository-projections.ts`) takes a dependent's writable path from the result base's metas, and
  `unwritable-dependent` refuses a dependent without one (`decompose-v3-conservation.ts`).
- **A map that parses can refuse for its formatting.** A map that is not canonical JSON refuses as `map:non-canonical`,
  whose remedy is to serialize it canonically (`readCutMap`, `decompose-v3-execution-preflight.ts`).

No cut is planned before the cutover; one that is needed runs by a hand procedure kept outside the repository, or a
draft is split by hand. Rerouting today's modules onto the in-repo implementation first, the seam's default for its
members, would buy nothing here.

**Terms used throughout:**

- **Store, backend, record, kind, field writer, write check** — as `lib/store/` defines them. **Reference backend** —
  the in-memory, test-only backend the store's conformance suite runs (`__tests__/helpers/store/reference-backend.ts`).
  **Ref backend** — the backend storing state under `refs/arc/*`, which `storage-ref-backend` builds.
- **The flip** — the per-repository switch after which the store reports `capabilities.stateOffBranch` as true; the
  in-repo implementation reports false and the reference backend true. **In-repo arm** — the path that runs while it is
  false; **arm from the flip** — the path that runs once it is true. The **cutover's deletion pass** removes the in-repo
  arms.
- **Projection, write-back** — the gitignored working copy at the familiar `.arc/` paths and its automatic persisting of
  a person's edits, which `storage-projection` builds. A **hand edit** is a write whose content a person edited rather
  than a verb composed.
- **Origin** — the work unit a cut decomposes. **Retirement** ends it (`symmetric` and `heterogeneous` shapes);
  **extraction** keeps it (`extraction` shape). **Member** — a work unit the cut creates. **Stub** — a work unit placed
  in the backlog, unstarted; a **started** work unit is placed active. **Existing home** — a work unit, a block of
  another work unit's draft, or a document an allocation sends content to (`ExistingTargetSchema`,
  `decompose-v3-schema.ts`). **Dependent** — an open work item whose `Depends On` names the origin, by its slug or by a
  former slug that `lookup` resolves to it; a completed record's edges gate nothing.
- **Cut map** — the map of a cut: a machine half the verb derives from the origin and an authoring half the operator
  completes (§ 3). **Stored map** — the completed map held as a record on the origin between the cut's batches (§ 4).
  **Source unit** — one addressable unit of the origin's artifacts, found by the scanner and named by a **locator**
  (`decompose-content.ts`).
- **Additive batch, terminal batch** — the cut's two batches (§ 6, § 8). **Preview** — a batch's read-only report of
  what it would write, and its **apply authority**, the digest an apply must match (§ 8.7).
- **`D` and `A` numbers** — the storage contract's decisions and amendments (`spec-storage-contract.md`). **Record
  kinds** — the shipped kinds specified in `spec-seam-record-kinds.md`; **lifecycle** — the shipped transition write
  path specified in `spec-seam-lifecycle.md`. Where this design changes a shipped specification, § 17 states the change.

## Goals

1. **From the flip a cut runs over records** — an additive batch, authoring through write-back, and a terminal batch —
   reading no work-item state from Git (§ 5–§ 9).
2. **Nothing a cut does changes before the flip;** what lands before it is § 1.4's list, each piece inert until the
   flip.
3. **Today's domain rules carry:** source units and their locators, the cut map's authoring, conservation, cohort
   topology, dependency dispositions, lineage, and extraction's thinning (§ 3, § 8, § 13).
4. **A half-done cut is durable:** the completed map is stored on the origin, so any session, machine, or person can
   finish, revise, or discard the cut (§ 4, § 9).
5. **Nothing irreversible runs unapproved:** the additive batch removes nothing, and every batch that removes a record
   applies exactly what its preview showed (§ 8.7, § 9).
6. **A decomposed origin tears down:** its lineage record carries `retiredBranches` from the removed primary's exact
   branch links (§ 8.5).
7. **Flat cost:** a cut reads the records it touches through the store a fixed number of times each — its acquisition,
   its revalidation before the batch, in a retirement the lifecycle executor's own read of the listing and the primary,
   and once per run of the verb (a preview, an apply, or the revision starter) the `history` of the stored map and of
   each item a member's slug finds (§ 8.3) — and nothing it reads grows with the repository's history or branch count;
   each `history` read walks only the history of the item that owns the record (§ 5, § 8.1).
8. **Every refusal names its remedy,** and the cut completes once the remedy is applied (§ 14), but for the leftovers of
   § 10's races between unsynced clones.
9. **No ratchet floor grows:** the store version adds no `store-raw-state`, `surface-names`, or `work-unit-paths` entry
   to `eslint-suppressions.json`.

Amended 2026-10-19 (A4) — Goal 7's history-count clause allows one preparation pass and one atomic admission pass
over the stored map and each currently resolved member. Criterion 10 replaces criterion 6's once-per-run clause;
all other bounded-read and Git-isolation requirements remain.

Amended 2026-10-20 (A5) — member identity comes from complete batch receipts in the stored map's own history, within the
existing preparation and atomic-admission limits. No primary history is searched to discover a member UID.

## Non-Goals

_Editable in place until activation, then frozen; changes after that append: `Amended YYYY-MM-DD — <delta> — <prompt>`_

This change does not:

- **change what `arc decompose` does before the flip,** beyond § 1.4's list, or fix the in-repo arm's held defects,
  which a hand procedure carries until the cutover;
- **reroute today's modules onto the in-repo implementation;**
- **delete today's machine or rewrite `decompose-work-unit.md`** — the cutover's deletion pass and flip rewrite, which
  take § 1.5 and § 16;
- **decide when a concern decomposes,** or what a member's first session re-validates (`decomposition-doctrine`);
  **render ROADMAP or status** (`seam-status-roadmap`); or **tear down a decomposed origin,** which lifecycle built
  (`runStoreTeardown`, `verbs/teardown-store.ts`);
- **build the ref backend, the projection or its write-back, the inbound kind's grammar, or `arc route`** (§ 18);
- **type edges or cohort coordination** (`work-item-relations`), beyond the four rules § 12 adopts;
- **change the scanner's costs:** its locator resolution parses and canonicalizes every unit per lookup and re-encodes
  the document prefix at each unit boundary (`resolveV3DecomposeContentLocator`, `byteOffset`, `decompose-content.ts`),
  unobserved at current scale.

## Proposed Design

§ 1 bounds the change and orders it, and § 2 dispatches between the arms. § 3–4 define the cut map and its stored
record. § 5–9 run a cut: preflight, the additive batch, authoring, the terminal batch, and the discard and revision.
§ 10–12 settle lifecycle moves between the batches, where a cut runs, and its edges. § 13–16 carry the module plan, the
refusals, the names, and the workflow's end state. § 17 states the amendments to shipped specifications, and § 18 the
expected contracts this design consumes.

### 1. Boundary, scope, and order

#### 1.1 One work unit

The boundary read keeps the change whole (`stays one WU`, read at draft and confirmed at spec with no new evidence).
Decomposition is one self-contained machine, and the store version with its dispatch is one design over one verb.
Nothing lands on its own: with nothing changing before the flip there is nothing to land early, so the change carries no
delivery plan and lands as one merge, reviewed in chunks (§ 1.3). Its `Class` stays `Heavy`: a real design is authored,
composed from shipped substrate — abandonment's arm from the flip, prepared writes, the record kinds — rather than
invented.

#### 1.2 What this change takes

- **The dispatch and the mode flags:** `handleDecompose` and its input schema (`DecomposeCommandInputSchema`), the mode
  keys (`decompose-command-routing.ts`), and the verb's registration in `cli.ts` (§ 2, § 15).
- **The store version:** new modules under `lib/decompose/`, apart from today's machine in `lib/work-unit/`, so the
  deletion pass's boundary is what they import (§ 13).
- **The cut-map kind,** `work-item/cut-map`: its shape in the catalog (`KIND_SHAPES`, `lib/store/catalog.ts`), its
  mechanism (`KIND_MECHANISMS`, `lib/store/registry.ts`), and its parser in a kind folder of its own,
  `lib/store/kinds/cut-map/`, in the production registration set (`PRODUCTION_REGISTRATIONS`,
  `lib/store/kinds/registrations.ts`) (§ 4). Its `registration.ts` joins the raw-state modules the import ratchet counts
  (`RAW_STATE_MODULES`, `eslint/architecture-imports.ts`), as every kind's registration does.
- **Two additions to record kinds' modules:** the cohort kind's at-cap fan-out writer (`lib/store/kinds/cohort/`) and
  the lineage kind's `lineage.cut-in-flight` rule (`checkLineageRecord`, `lib/store/kinds/lineage/check.ts`). A member
  that writes another member's kind uses that kind's writers and never registers its own (`cohort-storage-seam.md`
  § Soft coordination, Parsers and field schemas), so both go into the kinds' modules (§ 4, § 8.5, § 10).
- **Rename's reference sweep** passing over the cut-map record (`prepareStoreRename`, `lib/store/lifecycle-rename.ts`),
  which would otherwise rewrite a stored map's bytes (§ 4).
- **The map schema** `cut-map`, version 4, in the production schema registry (`createProductionSchemaRegistry`,
  `production-schema-registry.ts`) beside `decompose-cut-map` version 3 (§ 3).
- **The locator move,** a setup chunk (§ 1.3).

Teardown is not touched: its store arm already serves a decomposed origin (`runStoreTeardown`;
`store-retirement-evidence.ts`). Nor is any other module of today's machine (§ 1.5).

#### 1.3 Review chunks and their order

1. **Setup: the locator moves.** The scanner (`decompose-content.ts`) imports its locator schema and source-ID function
   from version 3's schema module (`V3DecomposeLocatorSchema`, `v3SourceId`, `decompose-v3-schema.ts`), so it cannot
   carry into the store version while version 3 stays deletable. Both definitions move into the scanner's module with
   `HeadingIdentitySchema`, which only the locator uses; the basename and managed-path checks they rest on are the
   scanner's own (`isArtifactBasename`, `isManagedPath`), and version 3 keeps its copies for its other fields.
   `decompose-v3-schema.ts` imports both definitions from there and re-exports both names, so its importers —
   `decompose-v3-preflight.ts`, `decompose-v3-thinning.ts`, `decompose-v3-finish.ts`, and the tests and fixtures
   importing them — stay as they are. Names stay as they are. Behavior does not change: version 3's decode tests and the
   scanner's pass unchanged.
2. **The kinds:** the cut-map kind with rename's sweep passing over it, the fan-out writer, and `lineage.cut-in-flight`.
   Where `storage-ref-backend` has landed, the kind's mechanism takes its ref home here; otherwise that change sets it
   (§ 18).
3. **The schema** `cut-map`, version 4 (§ 3).
4. **The store version:** preflight, the additive batch, the terminal batch with its preview, then the discard and the
   revision (§ 5–§ 9).
5. **The dispatch and the flags** (§ 2), last, since the store version is unreachable until it lands.

A file another in-flight change also rewrites serializes with it, the branch merging base holding that change first
where it has landed. Each entry this change adds to a shared list lands in its sorted position where the list is sorted,
and otherwise after the last entry of its family, or at the end where the list groups none, any count beside it raised
by one rather than set; a merge that meets both changes' additions keeps both. With `storage-ref-backend`:
`lib/store/catalog.ts`, `lib/store/registry.ts`, `lib/store/kinds/lineage/check.ts`, `lib/store/lifecycle-rename.ts`,
`eslint/architecture-imports.ts` and its test, `registry.test.ts`, and `cli.ts`. With `seam-locus`:
`lib/store/registry.ts` and `lib/store/kinds/registrations.ts`, where it declares the inbound kind's grammar and
registers its receipt kinds, the grammar reaching the held-entry rules through the registry;
`production-schema-registry.ts`, the production schema IDs, and `authored-metadata.test.ts`;
`eslint/architecture-imports.ts`; and `cli.ts`. With `storage-projection`, whose plan adds to `MACHINE_LOCAL_PATHS` and
registers commands: `lib/store/registry.ts` and `cli.ts`.

#### 1.4 Before the flip (Owner, 2026-10-16)

`arc decompose` keeps today's code as its in-repo arm, its held defects included. What lands before the flip changes
nothing a cut does:

- **The capability branch** in `handleDecompose` (§ 2).
- **The flags of the modes that start at the flip,** `--revise` and `--discard`, each refusing `unsupported` until the
  flip and naming what serves until then (§ 14), as lifecycle's verbs that start at the flip do
  (`spec-seam-lifecycle.md` § 1.5). `--finish`'s operand turns optional for the arm from the flip, which reads the
  stored map; the in-repo arm still requires it and refuses a `--finish` without one, naming the form, where today
  Commander reports the missing argument.
- **The cut-map kind,** registered with no in-repo home, so the in-repo implementation refuses its writes `unsupported`
  and lists it absent: no record of it can exist before the flip.
- **Rename's sweep passing over the cut-map record,** which no record of the kind reaches before the flip.
- **The `cut-map` schema,** published through `arc schema` beside `decompose-cut-map`.
- **The cohort kind's fan-out writer,** which only the store version calls; today's topology keeps its own splice
  (`fanoutBlock`, `decompose-v3-topology.ts`).
- **`lineage.cut-in-flight`,** which refuses only an origin holding a stored map, so never before the flip.
- **The locator move** (§ 1.3).

#### 1.5 Today's machine, kept until the deletion pass

Today's machine runs only while `stateOffBranch` is false. The cutover's deletion pass removes every module of it that
the store version does not import (§ 13), with:

- **The candidate's arms outside the machine:** `decompose-candidate.ts` and its callers in teardown
  (`tryCleanupDecomposeCandidate`, `verbs/teardown.ts`) and in-flight derivation (`lib/git/in-flight-derivation.ts`),
  and `git-owned-decompose-candidate-cleanup.ts`, whose candidate the store version never stages.
- **The `decompose-cut-map` version-3 schema** and its registration (`registerDecomposeSchemas`).
- **Lineage on disk,** which lifecycle's list already holds (`transition-record-store.ts`,
  `terminal-transition-record-writer.ts`, `transition-record-enumeration.ts`; `spec-seam-lifecycle.md` § 1.6).
- **The scanner's version-3 remainder:** `v3SourceId` and the path-keyed source resolution
  (`resolveV3DecomposeSourceUnit`, `decompose-content.ts`), whose one production caller is version 3's preflight; the
  module itself carries (§ 13).
- **Two dead pieces:** `git-decompose-v3-retirement-delta.ts`, which no production module imports, and
  `repointDependsOn` (`decompose-sweep.ts`), which no production code calls though its import is that file's
  `store-raw-state` floor entry.

**One deletion order.** Lifecycle's in-repo graduation takes types from version 3: `planning-artifact-tuple.ts` imports
`V3DecomposeMachine` (`decompose-v3-schema.ts`) and `V3PlanObservedPathState` (`decompose-v3-plan.ts`);
`validated-graduation-transaction.ts` imports those and `V3PlanCanonicalPathState`; and `atomic-graduation.ts`, which
graduation's arm from the flip also imports for `occupyStoreGraduation` (`commands/start-store.ts`), imports the
transaction's types. So version 3's schema and plan leave with lifecycle's in-repo graduation, or after it. The plan in
turn holds everything its import graph reaches through a type from `decompose-v3-refusal.ts`
(`V3DecomposeRefusalEvidence`): that module's imports — `decompose-candidate.ts`, `decompose-v3-finish-remedies.ts`,
`decompose-v3-remedy-definitions.ts`, and `decompose-v3-operation.ts` — and the operation module's — the
transition-record builder, the materializer, the result report, the occupation, and lineage on disk
(`transition-record-store.ts`, `terminal-transition-record-writer.ts`) — so all of it leaves with the plan or after it.
Graduation's arm from the flip (`runStoreGraduate`) needs nothing from the store version's schema.

`git-decomposition-object-readers.ts` is not decomposition's: no decomposition module imports it, and its callers are
delivery, review, integration, status, and session-init modules, whose changes keep its fate. It does take one type from
version 3's plan (`V3PlanCanonicalPathState`), for `stateMatches` alone, which no production code calls; the deletion
pass deletes that function with its test (`git-decomposition-object-readers.test.ts`).

### 2. The dispatch

`handleDecompose` reads `capabilities` from a store opened without an identity
(`createStore(createDefaultStorePorts(...))`, as `handlers/plan.ts` does) and branches once on `usesOffBranchState`
(`lib/store/lifecycle-write.ts`). Only the arm from the flip builds the executor context the lifecycle handlers build
(`buildExecutor`, `handlers/lifecycle-shared.ts`), which requires a configured identity; the in-repo arm keeps today's
preconditions, resolving an identity only for `--execute` and `--extract`:

- **The in-repo arm** runs today's code for `--preflight`, `--execute`, `--extract`, `--finish <cut-map>` with or
  without `--apply`, and `--advance-base`. `--revise` and `--discard` refuse `unsupported`, and `--finish` without a map
  operand refuses, naming `--finish <cut-map>`.
- **The arm from the flip** runs the store version for `--preflight`, `--execute`, `--extract`, `--finish`, `--revise`,
  and `--discard`. `--advance-base` refuses `unsupported`, naming `--finish`, since no base is advanced, and `--finish`
  with a map operand refuses, naming `--finish` alone, since the map is stored.

The arm from the flip claims, renders, and checks no ROADMAP, which is derived from the flip (D15); today's ROADMAP arms
stay in the in-repo arm, off the path from the flip, as the seam's ordering for ROADMAP's removal requires
(`cohort-storage-seam.md` § Soft coordination, Ordering the flip carries).

Exactly one mode is selected, as today; `--apply` is valid only with `--finish`, `--revise <cut-map>`, or `--discard`.
Every result and refusal stays canonical JSON on standard output, with the refusal's reason and remedy text on standard
error (`emitV3DecomposeRefusal`).

### 3. The cut map

#### 3.1 Its schema

The store version's map is a new schema, `cut-map`, at version 4: the schema registry holds one schema per identity
(`createKernelRegistry`, `lib/kernel/schema/registry.ts`, refusing a duplicate identity), and version 3 stays published
under `decompose-cut-map` until the deletion pass. Its maps carry `schemaVersion: 4`, and `arc schema get cut-map`
publishes it. One name runs through the schema, the kind (`work-item/cut-map`), and the stored path
(`cut-map-<uid>.json`), so nothing is renamed at the cutover. A version-3 map passed to the arm from the flip refuses,
naming `--preflight`; a version-4 map passed to the in-repo arm fails today's decode as any malformed map does.

#### 3.2 The machine half

The verb derives it at preflight (§ 5); the operator never edits it.

- **`preflightId`** — the digest of the rest of the machine half, as today.
- **`origin`** — the origin's slug and UID.
- **`sourceKind`** — `backlog-stub`, `started-planning`, or `active-origin`, as today's `SourceSchema.kind`.
- **`planningProfile`** — `draft`, `single-spec`, or `paired-spec` with the source design's basenames, as today's
  (`PlanningProfileSchema`).
- **`sourceUnits`** — each unit's `sourceId`, locator, and `contentDigest`, as today; the locator's `artifact` names the
  origin's record by its basename, and no `sourcePath` is kept. So the `sourceId` digests the locator alone under
  `schemaVersion: 4`, where `v3SourceId` digests the path and locator under 3; the map is one origin's, whose group
  holds one record per basename, so the locator identifies the unit. Allocations name units by it, as today.
- **`incomingEdges`** — one per dependent naming the origin in its `Depends On`: `{edgeId, dependent: {slug, uid}}`, its
  `edgeId` the digest of the dependent's UID under `schemaVersion: 4`. Version 3's identity digests the dependent's slug
  and its whole `Depends On` (`currentTargets`, `v3IncomingEdgeId`); version 4 drops `currentTargets`, since a
  dependent's other edges may change between the batches (§ 8.4). Incoming dispositions key by `edgeId`, as today. The
  cut's own members are never dependents: an extraction's member naming the surviving origin holds a seeded edge, which
  § 8.3 checks, so every scan after the additive batch — the terminal batch's and a revision's fresh preflight — leaves
  out each work item the stored map names as a member, a member as § 8.3 tells it from an item that took its slug, which
  is scanned like any other.
- **`outgoingEdges`** — one per provider the origin's `Depends On` names: `{edgeId, provider: {slug, uid?}}`. The
  provider resolves by `lookup` on its slug, a former slug included, and failing that by lineage lookup on the slug
  (`{kind: "lineage", origin}`, `lib/store/lookup.ts`), which finds an abandoned or decomposed item; its `edgeId` is the
  digest of that UID under `schemaVersion: 4`. An entry resolving to no single owner — to nothing, or to several —
  carries no `uid` and keeps its slug as its identity, as `v3OutgoingEdgeId` digests it under 3. Outgoing dispositions
  key by `edgeId`, as today, so a provider renamed or ended between the batches keeps its edge (§ 8.3, § 8.4).

Lineage lookup also resolves authenticated former names retained after the primary ends (A3): a UID selects only
that generation; a slug prefers exact current terminal names, otherwise former names, with multiple candidates refusing
`ambiguous-match`. It uses backend-maintained identity evidence rather than enumerating terminal primary histories.
Provider observations retain known UIDs through dependency contributions, seeded-field validation, revision settlement,
and recursive retirement replacements. Preparation reuses observations within its invocation; revalidation reads the
original store. This is an expected backend contract, exercised here by the reference backend and available on the
ref backend before cutover (§ 18).

Version 3's Git pins go: `source.logicalBranch`, `source.ref`, `source.head`, and `resultBase`.

#### 3.3 The authoring half

Version 3's completed authoring (`CompletedAuthoringSchema`) carries whole — shape, placement, destinations, allocations
with ownership, incoming and outgoing dispositions, and internal and external edges — with one addition. **Purpose joins
the placement:** the `cohort` and `subcohort` placements gain `purpose`, and a `subcohort` placement gains
`parentPurpose` for the parent document the cut creates beside it (today's `planTopology` backfills that parent). A
Purpose is required where the cut creates the document and refused where the document already exists, since an existing
document's Purpose is edited through write-back. The starter map (§ 5) keeps one author slot for the whole placement,
Purpose included, since which documents a cut creates follows from the placement the operator authors; a created
document's missing Purpose refuses at the additive batch (§ 6). Every cohort document a cut creates thus has its Purpose
from the map, where today's scaffold writes `—` (`renderV3IncompleteCohort`,
`decompose-v3-topology.ts`); `cohort.purpose` refuses a new document without one (record kinds § 8.2).

#### 3.4 Decoding

Decoding carries version 3's rules (`decodeV3DecomposeCutMap`): machine order and identity, authoring identity and
order, source shape (`source-shape`), companion disposition (`companion-disposition`), destination coverage, and
placement and shape cardinality. A map is parsed, never refused for its formatting: the arm from the flip requires no
canonical bytes, so `map:non-canonical` has no counterpart (§ 14).

### 4. The stored map

The additive batch stores the completed map and its cut-owned generation bindings as one record on the origin, so a
half-done cut survives its session (A5).

- **The kind** is `work-item/cut-map`: one record per work item (`singleton("work-item")`), a machine record
  (`machine(unhomed)`) — single-writer, never projected, with no in-repo home. Its strict canonical JSON content is the
  `StoredCutMap` wrapper below; the authored version-4 `CutMap` and § 3.4's input decoder remain unchanged. The kind's
  registered parser decodes the wrapper and its completed map; registered `fields` expose that wrapper. Its native
  `cut-map.atomic-binding` check enforces § 8.8's source, inventory and generation-binding obligations (A4, A5).
- **Other verbs keep its bytes.** A prepared lifecycle write acquires and re-puts the record unchanged
  (`applyPreparedLifecycleWrite`). Rename re-puts it under its owner's new name, with its reference sweep
  (`planRenameReferences`, `prepareStoreRename`) passing over the entire wrapper: neither locators nor birth bindings
  are rewritten. It takes no hand edit.
- **Its stored path** remains `cut-map-<uid>.json` on the work item's ref, ending in the owner's UID. The wrapper adds
  no record kind, ref or projected file.
- **Its life.** The additive batch creates it with expected absence. A revision replaces it at its version (§ 9.2).
  Terminal and discard remove it explicitly, including where the native retirement also removes every origin record,
  so the reference backend leaves no current map either. Removed, it remains readable through the origin's history
  by UID. History readers decode the wrapper before consuming its map or bindings.
- **One cut per origin.** Preflight refuses an origin holding the record, naming terminal, revision and discard (§ 5).
  `lookup` resolves the origin's slug to its primary; acquisition reads the singleton for that exact owner generation.

```ts
type StoredCutOwnerBirth = {
  kind: "work-item/meta" | "cohort/document";
  name: string;
  birthKey: string;
};
type StoredCutMap = {
  schemaVersion: 1;
  map: CutMap;
  ownerBirths: readonly StoredCutOwnerBirth[];
};
```

`StoredCutOwnerBirthSchema` and `StoredCutMapSchema` belong to the cut-map kind and are exported with its codec. Objects
are strict; names use existing slug validation, keys are lowercase 64-hex digests, and bindings are unique by `(kind,
name)`, sorted by binary UTF-8 kind, name and key. Every declared `new-member` has one `work-item/meta` binding. Every
still-used cohort document this cut created has one `cohort/document` binding, including a created parent and subcohort
separately. Reused external cohorts have none. Binding names are immutable birth names; current name, Parent and path
eligibility are checked independently. A binding contains no UID and grants no identity authority alone.

**Binding continuity and creation.** A revision preserves each retained binding exactly, even when destination IDs or
the origin's slug change. Dropping an owner removes its binding. A member dropped and later re-added, or a document
newly created by the cut, receives a newly derived key. A gone member cannot be recreated under its retained key: first
drop the declaration, then add it in a later revision. A retained cut-owned cohort does not become external merely
because its document now exists. The additive/revision batch publishes new bindings with their actual new primary
generations and a changed wrapper; an unchanged map put is not a birth witness or uniqueness boundary.

**New-key derivation.** Hash the UTF-8 bytes of canonical JSON for this exact tuple with SHA-256:

```text
["arc.decompose.owner-birth/v1", originUID, primaryKind, birthName, sortedUniquePriorMapHistoryBatchIDs]
```

Use the immutable origin UID and the complete prior history of that generation's cut-map record, including removals and
retained branches. Every returned entry must carry valid structured provenance with a nonempty batch ID. Deduplicate IDs
and sort by binary UTF-8 order. Filter none by verb, selected branch, latest removal, record version or traversal
position. The proposed operation and its future backend batch ID are not inputs. An actually empty history gives an
empty set only after successful generation-qualified acquisition. For this known origin's cut-map history query, accept
either a successful empty list or the backend's documented `not-found` for no retained events
(`ReferenceBackend.history`, `checkPreparedWrites`); never normalize identity errors, missing-object/history-ref
refusals, or namespace failures to empty history. Native `historyRefRecord` can return an empty list for no record tip.
Readable history with missing batch identities is unsupported development state (§ 8.3.1).

Derive all new keys once through the preparation cache and bind the resulting wrapper bytes into approval. Atomic
admission derives them again from its pinned before-history (§ 8.8). A material change to that input requires fresh
preparation and, for removing modes, a fresh preview and approval. No unrelated owner's history enters the derivation.
Each binding-changing map event must be visible with a fresh backend batch ID; no-op writes need not add an event and
allocate no key or generation. Never reconstruct an old key from a suffix of today's flattened history: retain its
accepted value. Clones with identical inputs can derive equal keys; distinct receipt UIDs remain ambiguity (§ 8.3.1).

The wrapper is internal operation state, distinct from the backend's creation receipt. It is never accepted in an
externally authored map or copied into caller provenance. Unsupported pre-release stored formats are regenerated; there
is no migration reader, backfill, or second map write to fill in a UID after allocation.

### 5. Preflight

`arc decompose <origin> --preflight` emits the starter map: the machine half and an author slot for every authoring
decision. Every batch repeats the same read before it writes.

- **What it reads.** The origin's primary through `lookup` and `read` (`readWorkUnit`), its whole artifact group
  (`acquireLifecycleRecords`, `prepared-lifecycle-write.ts`), the lifecycle listing for the dependents naming it
  (`readLifecycleView`, requiring a complete inventory, `requireCompleteInventory`), and its stored map's absence.
  Nothing from Git.
- **The source kind** follows the origin's state and placement, as today's preflight selects it
  (`createV3DecomposePreflight`, `decompose-v3-preflight.ts`): a stub, a started Planning work unit, or an Active one.
  An Integrating or archived origin refuses, as that selection refuses each (`source-predecessor`). No origin is parked
  from the flip: `arc park` refuses `unsupported` there (`runPark`, `verbs/park-resume.ts`), and the import makes a
  parked work unit a paused one, one parked from Planning being a stub already (`spec-seam-lifecycle.md` § 8.9), so
  the store version has no parked refusal. A paused origin proceeds, since a pause holds no cut
  (`spec-seam-lifecycle.md` § 8.2).
- **The source units** are scanned from the origin's draft or spec, task list, notes, and companions, or from an Active
  origin's design artifacts alone (`sourceUnits`, `decompose-v3-preflight.ts`) — never from the stored map or the
  inbound list.
- **The planning profile** follows the origin's `Design` alone, not the artifacts present (`inferPlanningProfile`).
- **It refuses** an origin holding a stored map, and an origin whose inbound list holds an entry, naming each by its
  `_Id:_` for its owner to fold into the draft or spec every member copies, or to route with `arc route`; the held-entry
  refusal admits until `seam-locus` declares the inbound kind's grammar (§ 18). It refuses, as today's preflight and
  scaffold do, an origin no member can be made from, naming the locus to repair: a `Design` naming no profile's
  artifacts, an artifact it names that is absent, a `Task List` disagreeing with the profile, an artifact the scanner
  rejects (`inferPlanningProfile`, `sourceUnits`), a design record every member copies whose first line is no
  level-one heading (`scaffold-title-missing`, `retitleScaffold`), or an `Owner`, `Priority`, or `Origin` missing from
  the meta each member copies (`scaffold-source-meta-incomplete`, `decompose-v3-repository-plan.ts`). It refuses an
  origin whose meta or a source record holds an open conflict, naming each from the record's `conflicts` (`read`),
  since the contract has a verb that depends on a conflicted record refuse until a write naming the conflict
  resolves it (D6); the remedy is the projection's resolution (§ 18), and the stored map's own conflict is § 10's. An
  unreadable or incomplete lifecycle listing, which `requireCompleteInventory` throws on
  (`lib/store/lifecycle-storage.ts`), refuses as recoverable, naming the listing's own remedy.

### 6. The additive batch

`arc decompose <origin> --execute <cut-map>` runs a retirement's additive batch and `--extract <cut-map>` an
extraction's; each refuses the other's shape, naming the other flag. Neither has an approval of its own (Owner,
2026-10-16): starting a member is a deliberate act, and approving the map approves the layout.

1. **Read and bind.** The map is read once from its path and decoded (§ 3.4). The verb repeats preflight (§ 5) and
   requires the map's machine half to equal the fresh one; a difference refuses, naming `--preflight` for a fresh
   starter. 2. **Check before writing.** Each member's slug and each new cohort document's name is free: no live work
   item holds it, nor any open cohort document, since both share one namespace (D14; expected absence); no record holds
   it as a former slug (`work-item.former-slug`); and no new cohort document takes a completed cohort's name. That last
   is stricter than D2, which frees a name once its record completes: the reference backend resolves a completed
   cohort's name to its record (`canonicalReference`), so a create expecting absence there is stale, and the rule keeps
   a map landing alike on every backend. The map's own names are distinct too: no member's slug is the name of a cohort
   document the cut creates, and no two documents it creates share a name, the segments of a `subcohort` placement among
   them. The live origin holds its own slug, so a cohort named after it refuses (below). The map's ownership, edge, and
   placement rules carry from today's conservation and topology (§ 13), each refusing at its locus in the map. Each
   existing home resolves to an open work unit, and each allocation targets a file the operator may edit (§ 7); its
   target locator resolves at the terminal batch (§ 8.4), since authoring writes the content it names. Every `Depends
   On` edge the cut writes must resolve by slug, since `meta.depends-on` checks each new edge so (`checkMetaDependsOn`):
   a member's, from an outgoing `targets` disposition or an internal or external edge, a stub home's, from either, and a
   stub dependent's, from an incoming `replace`. So each such edge's provider must be one a slug lookup resolves in the
   batch's after-state, where the check looks it up (`input.after`): the map's own members pass, as does a completed
   work item; a provider abandoned or decomposed, which a slug lookup no longer finds, or one resolving to no single
   owner (§ 3.2) refuses, naming `drop` or another provider. The origin's own edge on a provider whose slug a member
   takes refuses too, whatever that provider's state, shipped included: a slug lookup in the after-state would find the
   member, and settling the edge in the batch would change an edge the terminal batch binds (§ 8.4). Where it is the
   origin's own edge, on a decomposed provider or on one whose slug a member takes, the remedy is first to settle that
   edge with the disposition reconcile gives it: for a started origin through its reconcile (`arc wu reconcile --apply`,
   record kinds § 5.3), which runs only from the checkout holding a started work unit (`resolveCurrentWorkUnit`,
   `handlers/reconcile.ts`), and for a stub by editing its `Depends On` through write-back, as anyone may; then a fresh
   `--preflight`, or once the map is stored a revision, which re-binds the changed edge (§ 9.4). Once the origin no
   longer names that slug, no edge the cut writes does: a member's or a stub home's edge on a provider outside the map
   comes from the origin's own, through an outgoing `targets` disposition, or from an external edge, which refuses when
   it names a member's slug (`redundant-external-edge`, `decompose-v3-conservation.ts`); an internal edge to that member
   names it by design. A started existing home takes no new edge, its remedy to leave the edge to the home's owner. A
   `document` home refuses, its remedy to allocate that content to a work item or a member. In an extraction, a started
   dependent keeps its edge on the origin (§ 12). Each Purpose is present exactly where the batch creates the document
   (§ 3.3). 3. **Write, in one batch,** with caller provenance naming `decompose` and the batch. Submit read-only
   observations separately (§ 8.8, A4); persist only the intended mutations, including when retained notes or task-list
   conflicts are outside an Active origin's source boundary:

    - each member's meta through the meta kind's creation writer (`renderMetaFile`,
      `lib/store/kinds/meta/projection.ts`), placed backlog planned, with `State` Planning, `Owner` and `Priority` from
      the origin, `Class` from its destination, `Origin` from the origin's own `Origin`, `Design` from the planning
      profile, `Cohort` the cohort's full path or none, its seeded `Depends On`, and `Current Workflow` its first
      workflow, which `Next Action` names, as today's scaffold seeds them (`scaffoldMemberProfile`,
      `decompose-v3-repository-plan.ts`);
    - beside each member, a copy of each design record the profile names — a draft, a spec, or a paired spec's two
      companions — and of its task list or notes where an allocation targets that companion on the member, each copy's
      title, its first line, retitled where it holds the origin slug and kept as it is otherwise (`retitleScaffold`,
      `decompose-v3-repository-plan.ts`); a task list or notes the batch would copy with no title line refuses before
      anything is written, as § 5 refuses such a design record (`scaffold-title-missing`), and so does a task list
      whose copy carries a diagnostic the task-list write checks report, naming the origin's task list and each
      diagnostic, since with no prior version they count every diagnostic as added (`checkTaskListSegmentation`,
      `checkTaskListDescriptor`, `lib/store/kinds/task-list/shape-rules.ts`) and the store's refusal would name a
      member copy never written; and so does a task list whose copy would carry a completed task, marked `[x]`, which
      the store would keep there for good, since it refuses any write that drops a completed task, a removal included
      (`checkTaskListCompletedIdentifier`, `lib/store/kinds/task-list/integrity-rules.ts`), so neither authoring nor
      a discard or revision could remove it — the refusal names the origin's task list and each completed task, the
      remedy being to target the member's draft, spec, or notes instead, while a deferred task, which a write may drop,
      passes;
    - each new cohort document through the cohort kind's creation writer with the map's Purpose (`writeCohortDocument`,
      `lib/store/kinds/cohort/creation-writer.ts`), reading the shipped cohort template as today's handler does;
    - the settling of every edge a member's new slug would otherwise trip in an open stub other than the origin, whose
      own such edge refuses at step 2, and than a stub holding a stored map of its own, whose edges its cut's terminal
      batch binds (§ 8.4), so `work-item.slug-edges` refuses that stub's edge, its remedy naming another slug
      (`work-item.slug-edges`, record kinds § 5.3): an edge on shipped work discharges, an edge on a decomposed origin
      takes the replacement its lineage record gives that dependent, and an edge on an abandoned origin drops, the
      disposition reconcile gives it (`planDependencyReconcile`, `side-effects/discharge-dep-edges.ts`), which follows a
      replacement itself retired on through its own lineage record and discharges a shipped or Integrating one
      (`resolveRetiredEdge`), each judged against the state before the batch;
    - the stored map, with expected absence (§ 4).
4. **Report** what the batch wrote — each member, its copies, and each cohort document — with each destination's
   authoring requirements, as today's result packets carry them, and the next step: authoring, then `--finish` to
   preview.

Members and their new cohort document land together: `meta.cohort` refuses a member whose cohort document is absent from
the batch's after-state (`checkMetaCohort`), and `cohort.purpose` refuses a new document whose Purpose is absent or `—`.
The batch removes nothing, so a refusal anywhere leaves nothing written. When the store refuses the batch, a write after
the checks may have changed what they read: another cut storing a map on the origin, or another write taking a name the
batch creates, which reaches the store as a version conflict on a create's expected absence, `ambiguous-match`, or a
write check's refusal. Since the batch wrote nothing, the verb repeats steps 1 and 2 against the store as it now stands
and reports the first refusal they find, with its remedy, so preflight's stored-map refusal precedes the held-name
refusal (§ 14). Only when they find none does it report the store's refusal, a version conflict's remedy being the batch
again as given, which settles the edges anew. A revision does the same with its own checks. An `at-cap` placement's
fan-out block waits for the terminal batch, which names the members as they finally stand (§ 8.5).

**A cohort named after the origin.** A cut has commonly named its cohort after the origin, as both of this repository's
recorded cuts did. From the flip that name is unavailable to it: work items and cohorts share one namespace (D14), the
ref backend refuses a cohort created under a slug a live work item holds (its § 5.1), and the origin is live when the
additive batch creates the cut's cohort documents. So a placement creating a cohort document of the origin's name — a
`cohort` placement of that name, or a `subcohort` placement either of whose segments is it — refuses at the additive
batch, naming another cohort name in the map. No verb renames a cohort afterward (`arc rename` renames work units), so
the name a cut gives its cohort is final.

**What this accepts.** The members show before approval, to every checkout on the machine, which share the store's refs,
and to other machines once synced, where today's staging is a local branch. Status shows them as ordinary stubs and the
origin as live, with no cut-in-progress mark (§ 18). In return a half-done cut is durable (§ 4).

### 7. Authoring and existing homes

Authoring grooms the stubs and the new cohort documents through write-back, as anyone grooms a stub (D13), and edits the
existing homes and the cohort coordination the map allocates to. Nothing new is created by hand, which write-back
refuses for a meta (`meta.verb-owned-field`).

A `heterogeneous` or extraction map sends allocations to existing homes, and every retirement with one new member is
heterogeneous, since a symmetric map needs two. The rules hold for both shapes:

- **Authoring edits a home under D13's edit rights,** as it edits the cohort coordination a `cohort-coordination`
  destination names. D13 grants rights by lifecycle state and kind of file, so the additive batch and a revision refuse
  an allocation into a file the operator may not edit: a started home's meta or task list, whose remedy is to target its
  draft, spec, or notes; and any file of a home another person has started, whose remedy is to route it an inbound
  entry. Anyone grooms a stub, so another person's stub takes allocations.
- **A home taking a new edge is a dependent** (§ 12): the terminal batch writes the edge on a stub home, and a started
  home refuses it at the additive batch or a revision and again at the terminal batch, the remedy being to leave the
  edge to that home's owner.
- **A `document` home,** any managed repository path, refuses from the flip, its remedy to allocate that content to a
  work item or a member, so a retirement reads no Git.

### 8. The terminal batch

`arc decompose <origin> --finish` previews the terminal batch and `--finish --apply <authority>` runs it, for either
shape. It acquires every record it reads at its version and conflict set, checks them, and prepares its writes. The
batch validates its observations and relevant inventory atomically with those writes (§ 8.8, A4).

#### 8.1 What it acquires

The stored map, read by the origin's slug (§ 4); the origin's whole artifact group (`acquireLifecycleRecords`); each
member's meta and the cohort documents the map names; the existing homes' records the map allocates to, each home
resolved through `lookup` first as § 6 step 2 resolves it, one resolving to nothing, to a completed work unit, or to an
Errand refusing before anything is written, naming the revision that retargets its allocations; and the stub dependents,
found through the lifecycle listing, the members left out (§ 3.2). Each is acquired once, through the store, at its
version and conflict set. Preparation may reread for early diagnostics; a retirement also reads the listing and primary
through `executeStoreTransition`. Preparation reads the stored map's `history` once to authenticate member generations
from its creation receipts (§ 8.3.1, A5). Atomic admission repeats only the bounded observations and the same receipt
proof § 8.8 requires, once against its own captured before-state (A4).

#### 8.2 The origin's current state

The batch derives the origin's source kind from its current state, as preflight does (§ 5), rather than taking the kind
the stored map recorded, which is all today's source-kind refusal reads (`map.machine.source.kind`,
`retirement:source-kind`, `decompose-v3-repository-plan.ts`). It applies the shape's rules to that kind:

- **A kind the shape does not take refuses** — a retirement takes no Active origin, and neither shape an Integrating or
  archived one: for a retirement the `decompose` edges leave none of these positions (`lifecycle-transitions.ts`),
  which the executor would refuse only after the approval, and for an extraction, which runs no transition, the
  source-kind selection refuses it, as today's does (`source-predecessor`, `decompose-v3-preflight.ts`). It refuses
  here, before the preview, naming the moves that restore a kind it takes — `arc deactivate <origin>` for an Active
  origin, and for an Integrating one `arc reopen <origin>`, followed in a retirement by `arc deactivate <origin>` — or
  else `--discard`. No origin is parked from the flip (§ 5).
- **A kind it takes passes,** and the content check follows it (§ 8.4): an extraction origin activated or deactivated
  since the additive batch scans a narrower or wider set, whose removed or added units refuse, naming a revision; a stub
  started since scans what it did.
- **A renamed origin** no longer matches the slug the map names it by, and refuses, naming a revision, which re-binds it
  (§ 9.4).

#### 8.3 The seeded fields

A stub's `Cohort` and `Depends On` admit hand edits (record kinds § 5.4), so authoring can change what the additive
batch seeded. The batch requires only what the map decided, compared by provider: every member exists, carries the map's
`Cohort`, and still names each provider the map seeded on it, compared by owner: each seeded provider and each entry of
the member's `Depends On` resolve as § 3.2 resolves a provider — by slug, a former slug included, then through lineage —
and the provider is named when an entry resolves to its owner, or by slug where either resolves to no single owner. So a
provider's rename, which rewrites a stub's edges (record kinds § 5.3), passes, and so does an abandoned provider, whose
dependents keep their edge (record kinds § 7.4). A seeded provider is also named by the disposition reconcile gives the
member's edge on it (`planDependencyReconcile`, `side-effects/discharge-dep-edges.ts`), whether another cut wrote it
into the stub or a started member's own reconcile applied it: no edge for shipped or Integrating work, which discharges,
or for an abandoned provider, which drops, and for a provider another cut has retired, the disposition its lineage
record gives the member (`incoming`) — its replacement providers, or none for a drop — followed on through a replacement
itself retired, as reconcile resolves the chain (`resolveRetiredEdge`). A gate or reason set during authoring (§ 12) and
any added edge pass. Any other dropped seeded edge or a changed `Cohort` refuses, naming the field's restoration through
write-back, or the revision that would make it legitimate (§ 9.2) where one can: the map takes one placement for every
member (`memberPlacement`, `decompose-v3-repository-projections.ts`), so a revision makes a changed `Cohort` legitimate
only where a placement the map's rules admit gives every member its current `Cohort`, and otherwise the field is
restored. A member gone, abandoned between the batches, which no rule stops, refuses too, naming the revision that drops
it from the map. A member's creation receipt proves its original generation, including after rename, retirement, or name
reuse (§ 8.3.1, A5). Its primary is read by the proved UID, never selected from a later name holder. A member renamed
between the batches, which `arc rename` admits for a stub, retains its UID and the batch refuses, naming `arc rename
<new> <old>`, which `work-item.former-slug` admits since the slug is the member's own (`checkFormerSlug`), and whose
reference sweep restores the siblings' seeded edges. The member may be renamed again once the cut lands. In a
retirement, a member whose `Depends On` names the origin refuses too, since the origin it names is retiring and the
lineage record carries no disposition for a member's edge; the remedy is for the member's owner to drop that edge, or
anyone for a stub, through write-back. Refusing any divergence was rejected: it would block the grooming authoring
exists for.

##### 8.3.1 Created-owner receipts (A5)

A created-owner receipt is a backend fact about the work-item and cohort owners created in one accepted batch. It
recovers a cut member's generation after its primary ends; it is not a caller claim, a current-name lookup, or a record
stored inside the cut map. Add the following strict schemas and exported types to the store contract and barrel, beside
`HistoryEntrySchema`:

```ts
type CreatedOwner =
  | { kind: "work-item/meta" | "work-item/record";
      owner: { type: "work-item"; name: string; uid: string } }
  | { kind: "cohort/document";
      owner: { type: "cohort"; name: string; uid: string } };
type BatchCreationReceipt = {
  schemaVersion: 1;
  batchId: string; // nonempty; equals the entry's structured provenance.batchId
  createdOwners: readonly CreatedOwner[];
};
// Existing reference, version, content, provenance, and removal pairing remain unchanged.
type HistoryEntry = {
  reference: RecordReference;
  version: RecordVersion | null;
  content: string | null;
  provenance: StoredProvenance;
  creationReceipt?: BatchCreationReceipt;
};
```

The receipt's closed domain is new work-item and cohort generations established by primary creation; personal-ref
creation and project-identity binding are outside it. `owner.name` and `kind` retain the immutable name and actual
primary kind at birth. An expected-absence put alone is insufficient: the backend intersects admitted new-generation
allocation with primary creations actually published. Companion writes, updates, renames, promotion's role change,
reopen and adopting an existing generation through sync are not births. A new generation reusing an ended name is a
birth with its new UID. Companion-first ordering does not change the facts; abandoned re-resolution candidates and
failed admissions publish none.

`CreatedOwnerSchema` uses the existing slug and UUID validation and the closed compatible kind/owner pairs above; keys
are not allowed. `BatchCreationReceiptSchema` requires unique `(owner.type, uid)` identities, sorted by binary UTF-8
owner type, birth name, kind and UID. Birth names need not be unique: multiple matching generations must remain
representable, not silently become a new naming policy. `HistoryEntrySchema` accepts the optional field only when its
batch ID equals structured provenance's batch ID. All objects are strict. `CallerProvenanceSchema`, `WriteInputSchema`
and `BatchInputSchema` accept no receipt; no lookup operation, capability, record kind or caller mutation field is
added.

Receipt-capable backends attach the receipt to every returned entry from each newly accepted mutating batch. Presence
certifies the complete list, including `createdOwners: []` when no covered owner was created. Absence means unknown,
never an empty list. A wholly unchanged write creates no history entry merely to expose a receipt. Every
additive/revision batch that creates members must actually publish its map creation or revision; a no-op map put cannot
supply the member-birth witness. The backend computes the list over the entire proposed batch, but publishes it only
with accepted state: a failed observation, conflict, rule, namespace, version, or publication admission leaves no
receipt, identity-allocation, history, or mutation effect. Single writes without a batch ID and the in-repo backend's
historical entries may omit the field; the in-repo decomposition arm remains unchanged.

`history` and `changes` expose the same immutable receipt on every returned entry from that batch, including removals.
The reference backend retains it with accepted events; reopen, history transfer, net-zero record histories, saved-state
changes intervals and repeated sync preserve its exact facts. Existing record/window filtering and omission of net-zero
results from native `groupChangeBatches` stay unchanged; receipts do not manufacture events. A selected entry retains
the complete list, including other records' births. A partial family transfer must retain the complete receipt or leave
it unavailable; it cannot shrink the array and certify completeness. Grouping physical commits for one batch must
preserve an identical complete receipt or refuse conflicting evidence, never union partial lists.

The native backend retains the complete receipt on every physical commit belonging to the accepted operation, so
path/history grouping cannot select a commit that loses it. Ordinary/conflict commits, archive-quarter commits and
completed-copy refreshes attributed to that batch carry the same whole-batch envelope. A later sync merge has its own
batch ID: it preserves ancestor receipts through retained parents, never relabels them as births in the merge batch.
Historical import does not prove a historical batch's complete birth set and must not fabricate a receipt. The native
encoding is one reserved `Arc-Creation-Receipt` trailer containing canonical JSON, passed through process input when
large. Full replication costs birth count times physical commit count; measure it with the backend's existing cost
checks. Never truncate or silently omit births to meet an output budget. No separate payload object is introduced.

A dedicated receipt codec validates this commit metadata separately from provenance parsing: malformed structured
provenance may currently fall back to `{message}` in `parseStoreCommitProvenance`, but an advertised malformed receipt
must never disappear through that fallback. Duplicate receipt trailers, unsupported receipt versions, invalid owners or
batch-ID mismatches refuse explicitly. No global index, state ref or projected file is added.

**Bound generation identity.** Read the origin generation's complete stored-map history once through the invocation
cache. Decode the historical wrappers needed to authenticate each current binding. For a historical `decompose` map
mutation to prove a birth, its wrapper must contain the exact current `(kind, name, birthKey)`, and its complete
creation receipt must bind that entry's own provenance batch ID and contain a matching primary kind and birth name.
Exactly one distinct matching UID proves the generation. A matching entry with unavailable receipt facts is unknown, not
complete-none. Multiple distinct UIDs refuse as ambiguous; zero authenticated births is unsupported binding state, not
proof that a later name holder belongs to the cut. Malformed required wrappers cannot stand in for absent bindings.

Search all retained map history, without stopping at omissions or removals on another branch, selecting the newest
birth, or treating record versions as event identities. `readRefHistoryDetails` returns flattened parent histories;
`orderHistoryCommits` supplies deterministic order, not selected ancestry. The selected current wrapper chooses the
binding; complete backend receipts prove its UID. A sync retains the selected wrapper whole, never combining one side's
map with the other's bindings or relabeling ancestor birth receipts onto the new sync batch.

Carry the authenticated UID independently of whether its primary still exists. Read each member primary by that UID: a
renamed live member retains the existing rename refusal; an ended member is gone while retaining its original UID for
revision. A current slug's unrelated holder is never removed or rewritten. Authenticate cut-created cohorts through
their bindings and `cohort/document` receipt facts too, reading the proved UID and retaining existing name, Parent,
placement and removal eligibility checks. Reused external cohorts remain external. This replaces
`isDecomposeMemberBirth`'s selected-primary proof and `acquireDecomposeCutCohorts`'s latest-removal batch inference;
`decomposeCurrentCutBatches` supplies neither owner authority. No primary histories are searched to discover owner UIDs,
and no terminal listing, repository history or branch walk is added.

**Failure and continuation.** Preserve underlying store refusals and named-history-ref recovery unchanged. Missing local
history refs must use the store's named fetch/retry route, never be interpreted as absent receipts or a gone generation.
A readable map history that never retained required receipts is unsupported cut state: refuse `unsupported` as terminal,
without writes, name the map/binding and missing batch evidence, and require a receipt-capable provider and authentic
complete cut history. Under the pre-public-release posture, unsupported development state is regenerated rather than
backfilled from current records; no migration reader or automatic state deletion is added. Valid restored evidence and a
fresh preview must allow the ordinary operation to complete. Multiple matching births likewise refuse terminally as
decompose `unsupported`, naming the map, binding, batch IDs and candidate UIDs. They preserve every generation: renaming
a current holder cannot change birth facts. Without authentic uniquely bound history this is § 10's stated sync
limitation; unsupported development state requires an explicit restart/regeneration, with existing destructive approval
boundaries, rather than an inference, compatibility repair or automatic cleanup.

Missing candidate birth evidence at admission uses the existing `cut-map.atomic-binding` violation channel, with the
observed missing field and a remedy to use a provider supplying candidate births, then prepare a fresh preview and
approval. This is not an invitation to retry an incapable provider indefinitely. After the provider is repaired or
upgraded, the normal path must succeed; no new capability flag or rule-result type is introduced.

Malformed advertised receipt data refuses as store `namespace-corrupt`, terminal, naming its historical locus and
specific defect. Restore authentic retained metadata from a known intact source if available, then restart with a fresh
preview; if none exists, report that no evidence repair is available and require explicit development-state
regeneration. Fetch is a remedy only for retained facts that exist elsewhere. No speculative repair command or new
automatic deletion authority is added. Atomic checks retain the evidence condition and remedy through the existing
`cut-map.atomic-binding` rule channel; decompose's repeated acquisition reports the underlying typed evidence refusal
when it persists. No shared write-check result redesign is added, and an evidence failure is not a generic freshness
retry.

#### 8.4 The content

- **Conservation is locator resolution (A1):** each allocation's target locator resolves exactly once in its destination
  record, as extraction's finish checks today (`validateProjectedContent`,
  `git-decompose-v3-destination-validation.ts`). A locator names a heading's text and level, its ancestors', and its
  occurrence among headings of the same text (`V3DecomposeLocatorSchema`). The scanner recomputes those ordinals from
  the current document (`scanV3DecomposeContent`), and resolution compares the complete locator
  (`resolveV3DecomposeContentLocator`), without a destination content digest or persistent heading identity. Inserting
  an earlier matching heading can therefore make the saved locator resolve to that new section, and removing or merging
  a section can leave another at its ordinal; either passes when the locator still resolves exactly once. A rename,
  re-level, merge, or ancestry change refuses only when it leaves that locator unresolved, naming the allocation and a
  revision of its target locator. Authoring may change the resolved section's body. The distribution approval reviews
  which current content each allocation names; the origin's content binding below does not establish destination
  identity.
- **A retiring group's content is all accounted for,** as `uncovered-retirement-content` requires today
  (`decompose-v3-conservation.ts`), with no refusal of its own: every content record of the group — its draft, spec,
  task list, notes, and companions, the Markdown artifacts today's rule counts — is a source record the scan covers, and
  one added between the batches is an added source unit, which the rescan below refuses. Each other `work-item` kind
  the group can hold (`KIND_SHAPES`, `lib/store/catalog.ts`) is accounted for: the meta, the inbound list, and the
  stored map are checked on their own; a promoted origin's description record (the contract's D5) retires with the
  item, as at an abandonment; and an open conflict on the meta or a source record refuses, as at preflight (§ 5). So the
  batch that ends the origin leaves no content unaccounted for.
- **The origin is bound by content between the batches.** The batch rescans what preflight scans for the origin's
  current kind (§ 5) and requires exactly the map's source units, by content digest, and its edges, each by its `edgeId`
  (§ 3.2) — an incoming edge by its dependent naming the origin, the members left out, and an outgoing edge by its
  provider, so a provider's rename changes neither. A write the scan does not cover passes, such as to the origin's meta
  or an Active origin's task list. An added, changed, or removed source unit or edge refuses, naming a revision that
  re-binds the map (§ 9.4). Another cut may change the origin's outgoing edges where it must write them — its terminal
  batch rewriting the origin's edge as that cut's stub dependent (§ 8.5), or its revision moving the origin's seeded
  edges as that cut's retained member (§ 9.2) — and this batch then refuses as for any changed edge. Only another cut's
  additive batch leaves the origin's edges alone, since a member's slug is that cut's own to choose (§ 6 step 3).
- **The origin's inbound list holds no entry,** which the batch checks itself over the list it acquired, beside the
  write check `lineage.inbound-held`. An entry routed to it between the batches is routed on to the member it shapes
  (D11), which writes the inbound lists and no source unit of the origin's. The refusal names each entry by its `_Id:_`
  and admits until the grammar is declared, as at preflight.
- **A started home that would take a new edge refuses,** as it does at the additive batch (§ 7), and so, in an
  extraction, does a started dependent whose edge would move off the surviving origin (§ 8.6), each remedy being to
  leave the edge to its owner. In a retirement a started dependent keeps its edge and reconciles from lineage (§ 12).
- **Every edge the batch writes resolves by slug,** as § 6 step 2 requires, checked again here and at the preview, so a
  provider that ended between the batches refuses before the approval, naming a revision that drops or retargets the
  edge.

#### 8.5 What a retirement writes

A retirement's terminal batch is the `decompose` transition's arm from the flip, run through the lifecycle executor as
abandonment's is (`executeTransition`; `runStoreAbandon`, `verbs/abandon-store.ts`). The `decompose` edges from a stub
and from a started Planning work unit already declare that form: the primary's removal, and Git steps after the batch
(`fromFlip`, `lifecycle-transitions.ts`).

- **Before the batch,** where a checkout on this machine holds a started origin, the removal check runs
  (`checkRetiringCheckout`, `lib/git/worktree-removal.ts`), as abandonment's does (lifecycle § 11.3). A spawned checkout
  selected for removal refuses when dirty. A retained checkout anchored with `arc start --here` takes the release
  disposition: `checkWorktreeRemoval` checks its projection without requiring Git cleanliness, and teardown releases
  its claim while preserving its files. Either disposition refuses when its projection check refuses.
- **The batch** writes the lineage record (`writeLineageRecord`) and removes the origin's primary, which ends the item
  (lifecycle § 8.6). On the ref backend the item's group moves under history (its § 7.4); the reference backend keeps
  the group's other records under the ended owner, as after an abandonment, and nothing reads them by the origin's slug.
  The lineage record is schema version 2 of kind `decompose`: its `successors` the new members, its `incoming` each
  dependent's disposition, its `outgoing` each provider's members, each reference carrying its current name and its UID
  where known, by which reconcile matches a dependent (`store-reconcile-context.ts`), and its `retiredBranches` the
  removed primary's exact branch links, `[]` where it has none, as `runStoreAbandon` writes them. The write check
  refuses a snapshot differing from the primary's links (`lineage.retired-branches`), and teardown refuses a decompose
  lineage lacking one (`store-retirement-evidence.ts`).
- **In the same batch** it removes the stored map (§ 4); rewrites each stub dependent's `Depends On` (§ 12), one holding
  a stored map of its own included, whose cut then re-binds (§ 8.4); writes the edges stub homes take; and, under an
  `at-cap` placement, appends the fan-out block to the placement's subcohort document (its two-segment `parent`) through
  the cohort kind's fan-out writer, naming the new members as they finally stand (`planAtCap`); a lone marker or a
  different block, which a hand edit can leave between the batches, refuses before anything is written, as today's
  `conflicting-at-cap-provenance` does, naming the block's repair or removal through write-back. The executor
  submits the complete approved record observations with its prepared mutations; the backend validates them and
  the cut-map admission rule atomically with publication (§ 8.8, A4). Diagnostic early revalidation grants no
  authority to publish stale evidence.
- **After the batch** the origin's checkout is removed, or released where it was anchored in place, by teardown's store
  arm, as a Git step whose failure leaves the continuation `arc teardown <origin>` (`runStoreTeardown`; lifecycle § 11,
  § 12).

#### 8.6 What an extraction writes

Extraction (`--extract`, then `--finish`) is carried, though it was never rehearsed or used. Its origin is a started
Planning or Active work unit that survives (`source-shape`, `decodeV3DecomposeCutMap`). Its companions, the task list
among them, stay with the origin (`companion-disposition`). Members may depend on the origin, and a dependent may keep
its edge on it (`decompose-v3-conservation.ts`). Under every placement but `direct-member` the origin joins the members'
cohort, as topology counts it among them (`planInternalV3DecomposeTopology`): its `Cohort` becomes the path the members
take (`memberPlacement`, `decompose-v3-repository-projections.ts`) — the placement's cohort, new or reused, or an
`at-cap` placement's subcohort — never one named after it, which § 6 refuses. Under `direct-member` it keeps its own.

Its terminal batch is no lifecycle transition, since the origin keeps its position. It submits its acquired
observations and prepared writes alone in one atomic batch (`batchLifecycleWrites`), as the executor applies a
retirement's (§ 8.8, A4). It does not re-put the records it leaves unwritten, as
`applyPreparedLifecycleWrite` does: that would write each member, home, and dependent under `decompose` beyond what the
preview shows (§ 8.7), and the store refuses such a put of a lineage record, which is create-only, or of a conflict
record, which is write-once. After the checks of § 8.2–8.4, in one batch, it:

- thins the origin's draft or spec to the units it keeps, deleting a file that keeps none, as today's thinning plans it
  (`planV3ExtractionSourceThinning`, `decompose-v3-thinning.ts`), over the records the batch acquired;
- sets the origin's `Cohort` to the members' path where it differs, under every placement but `direct-member`
  (`writeMetaCohort`);
- rewrites stub dependents and writes the edges stub homes take (§ 12), and under an `at-cap` placement appends the
  fan-out block, a lone marker or a different block refusing before anything is written, as § 8.5 refuses it;
- removes the stored map.

It writes no lineage record, since the origin survives and the lineage kind has no extraction kind, so `retiredBranches`
is retirement's alone. A started dependent therefore has nothing to reconcile from: a map giving a started dependent any
disposition but leaving its edge as `[origin]` — a `replace` adding a member beside the origin among them — refuses at
the additive batch or a revision and again at the terminal batch, the remedy being to keep that edge on the surviving
origin, still valid, for the dependent's owner to move. The extraction's owner then reconciles the surviving origin's
task list and pointers through write-back, as today's finish requires.

What carries is the rule more than the code. The thinning planner takes a path-keyed tree (`V3RepositoryPlanTree`), so
its inputs are rewritten over records. The finish's destination validation (`validateV3ExtractionDestinationStates`,
`git-decompose-v3-destination-validation.ts`) does not carry: its claims on destinations, edges, and topology become
§ 8.3's check, its locator resolution § 8.4's, and its byte-equality checks go, since authoring edits the destinations.

#### 8.7 Preview and apply

The terminal batch is irreversible, so it applies only what was approved. `--finish` without `--apply` acquires, checks,
and prepares as § 8.1–8.6 do, the removal check included, so a dirty spawned checkout selected for removal refuses at
the preview rather than after the approval; a retained checkout takes § 8.5's release checks. It writes nothing and
reports the preview: for a retirement the lineage record, the removals, and each record the batch would write; for an
extraction the retained bytes of the thinned artifacts and each record it would write. With it comes the apply
authority: the digest of the batch's mode, the origin's slug and UID, the complete canonical observation array from §
8.8, and the exact prepared writes (A4). Present observations bind each reference, version, and canonical conflict set;
explicit absence is part of the same authority. `--finish --apply <authority>` acquires, checks, and prepares again and,
once every check passes, runs the batch only when the fresh digest equals the authority; otherwise it refuses, naming
`--finish` for a fresh preview. The preview is what the distribution approval surfaces (§ 16), so a change after it — a
stub groomed, a dependent added — needs a fresh preview and approval. Within the apply, the backend checks the approved
observations and relevant inventory atomically with publication (§ 8.8, A4); a final reread outside that boundary cannot
establish the guarantee. The authority carries the same observation basis across approval.

The same rule holds for every batch that removes a record: the discard and the revision preview and apply under an
authority too (§ 9). The additive batch, which removes nothing, runs straight.

**A landed cut.** `--finish`, `--discard`, or `--revise` on a cut that has landed reports it landed and names its
members, as a repeated finish reports `already-finished` today (`decompose-v3-finish-operation.ts`), rather than
refusing for want of a stored map: a retirement through the origin's `decompose` lineage record, which a lineage
`lookup` on the origin's slug finds (`{kind: "lineage", origin}`), and an extraction through the origin's `history`,
where the stored map's last removal is the terminal batch's. Every batch of the cut writes with caller provenance naming
`decompose` and the batch (§ 6), so that removal is told from a discard's. For `--finish` the report is its result; for
the discard and the revision it is a terminal refusal.

#### 8.8 Atomic observation admission (A4)

Every cut batch carries read-only observations separately from its exact mutations. Implement the following shared
extension in the reference backend for the dormant cut; the ref backend must provide it before cutover (§ 18).

##### 8.8.1. Serialized batch observations

Add these exported schema/type surfaces in `lib/store/write.ts` and the store barrel:

```ts
type RecordObservation = {
  reference: RecordReference;
  expected: null | {
    version: RecordVersion;
    conflicts: readonly RecordReference[];
  };
};

// Existing fields retain their meanings.
type BatchInput = {
  writes: readonly Mutation[];
  provenance: CallerProvenance;
  observations?: readonly RecordObservation[];
};
```

`RecordObservationSchema` is strict. Every non-person observation names a generation by UID; conflict references
must be conflict-record kinds and unique by logical reference. The batch names each observed logical record at
most once. Observation/write overlap is allowed. Missing `observations` and `[]` are equivalent.

Compare all observations to the coherent **before-state** at the same atomic admission point as publication:

- `expected: null` means that exact generation-qualified record is absent, not unreadable or unresolved.
- A present expectation requires the same record version and the same conflict-reference **set**. Ordering carries
  no meaning. These are strict equality checks even for entry-merge or three-way-merge kinds.
- A mismatch, including presence/absence, refuses the entire batch as recoverable `version-conflict`, naming the
  mismatched references. Preserve a more specific read refusal when the basis cannot be established. No partial
  write, no new conflict, and no history, provenance, identity allocation, or resolution effect is published.
- Observations convey no write authority. Writer rules and mutation merge behavior remain unchanged. Existing
  nonempty conflict sets can be observed; consuming disputed content is a separate domain refusal.
- This basis promises version and conflict-set equality, not equality of every derived public record field.
  Callers bind the owning primary as well when they depend on a companion's inherited owner name, placement, or
  links. Native cut admission rechecks the material lifecycle placement and identity predicates described below.

Do not turn observations into puts or replace them with a whole-store/state-version condition. Observation order
is canonicalized only for approval hashing; it does not change mutation execution order or batch result contents.

The in-repo backend must explicitly refuse a nonempty observations request with `unsupported`, terminal
case `batch-observations`; it must never ignore it. Empty/omitted observations preserve its existing behavior.
The new cut already refuses there through its unhomed kind and capability dispatch. The reference backend implements
observations; the ref backend must implement the same semantics before the cut becomes reachable at cutover.

##### 8.8.2. Existing kind admission gains bounded operation evidence

Extend `WriteCheckInput` as follows:

```ts
interface WriteCheckInput {
  // Existing reference, prior, next and after fields retain their meanings.
  writer: { kind: "verb"; verb: string; lifecycleAction?: string }
    | { kind: "hand-edit" };
  before: StoreView & Pick<Store, "history">;
  after: StoreView;
  observations: readonly RecordObservation[];
  proposedCreatedOwners?: readonly CreatedOwner[]; // A5: backend-produced, complete if present
}
```

`deriveWriteCheckWriter` retains `lifecycleAction` only from validated caller provenance. Every backend passes the
validated observations, using `[]` for a single write or a batch without observations. `before.history` reads only
the history visible at that admission's captured before-state; it must not recapture live refs through a public
history operation. `after` gains no hypothetical history. All views remain read-only and checks grant no writes.

`proposedCreatedOwners` is read-only backend operation evidence (A5), not a caller field or a claim that admission
already succeeded. Presence supplies the complete owners this exact attempt would create if accepted; `[]` is
complete-none and absence is unavailable. It uses § 8.3.1's strict `CreatedOwner` domain, uniqueness and ordering. The
backend derives it from fresh allocation intersected with actual proposed primary creations, passes the same inventory
to every check in that attempt, and uses those exact facts for its creation receipt only after acceptance. Re-resolution
recomputes or discards candidate facts. The reference single/batch publishers supply it; the native backend must do so
before cutover. Existing checks may ignore an absent optional field, but a cut check requiring new birth proof refuses
unavailable evidence. The in-repo decomposition arm remains unchanged. Neither before/after presence nor an
expected-absence mutation alone proves allocation during the operation.

There is no new predicate registry, serialized callback, query language, witness record, or configuration axis. Existing
registered checks remain the sole kind-rule dispatch. The same member-birth derivation as preparation uses creation
receipts against `before.history` (§ 8.3.1, A5), so map names do not become authority to exclude unrelated or reused
owner generations from an incoming inventory. It replaces `isDecomposeMemberBirth`'s selected-primary history proof and
uses the selected wrapper's exact bindings rather than a latest-removal boundary.

##### 8.8.3. Native cut-map rule

Register `cut-map.atomic-binding` on `work-item/cut-map` through `CUT_MAP_REGISTRATION`. It runs for decompose's
map mutations; a decompose mutation without one of its four trusted actions refuses rather than skipping checks.
Other verbs' existing byte-preserving map puts and rename behavior are preserved.

The rule uses the same source/profile/scanner, edge-identity, grammar, and member-birth derivations as preparation,
refactored onto the read operations they require. Do not construct a fake writable Store for these reads. Its
inbound grammar comes from the kind registration's declared entry grammar, as meta and lineage checks already do.

| Action     | Map and atomic obligations                                                                                                                                                                                                                         |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `additive` | Create the next map. Recompute source kind/profile/units and incoming/outgoing edge identities from before-state, with no prior-cut member exclusions; require the proposed machine binding and empty origin inbound.                              |
| `terminal` | Remove the prior map. Authenticate prior-cut member generations; recheck their required live/placement predicates and origin lifecycle eligibility; require the stored source and edge binding and empty origin inbound.                           |
| `revise`   | Replace the prior map. Authenticate prior-cut members for exclusions; require the **next** map's binding to current source/edges and empty origin inbound. Do not require the obsolete map's source inventory to remain fresh.                     |
| `discard`  | Remove the prior map. Guard approved records and whole groups being removed, and retain existing complete-after-state removal checks. Do not demand source conservation, a fresh old machine inventory, or empty origin inbound merely to discard. |

For additive and revise, also validate § 4's strict wrapper, exact binding coverage and retained binding continuity
(A5). Every new binding must match exactly one `proposedCreatedOwners` entry by primary kind and birth name, and its UID
must match the primary in the proposed after-state. The proposed key must equal the canonical derivation from pinned
before-history. A proposed fresh birth matching a retained binding is refused: it cannot recreate a member or cohort
under an old key. Existing-owned cohorts retain their binding rather than becoming external merely because they are
present. No same-batch allocation outside these validated bindings becomes cut-owned by name alone. Check retained
members and cut-owned cohorts against their receipt-proved UIDs; ending or reusing a name does not transfer ownership.
New bindings, actual owner births and the changed wrapper publish together or none does.

For additive, terminal, and revise, the complete current origin-group reference set must equal the present origin
references in the submitted observations. That includes empty artifacts and incidental companions: a new group
record arriving after approval/preparation requires a fresh acquisition even when it contributes no scanned unit.
Between batches, ordinary changes outside the source scan remain permissible, as § 8.4 already states; they are
included in the next preview's current observation basis. Active-origin conservation still scans Design artifacts
alone, and unrelated retained notes/task conflicts remain permissible.

For discard/revise removing a whole member group, likewise compare the current before-group references to its
present observation references. This prevents a companion created in the final gap from escaping the approved
whole-group removal. The rule discovers the removed members from authenticated prior-cut members and after-state
primary absence. It does not impose source conservation on discard.

Incoming identity is recomputed over a complete lifecycle listing with only authenticated current-cut member UIDs
excluded. Compare the exact relevant edge IDs, not all outsider bytes or all namespace members. This catches a
newly created dependent and an existing outsider that adds an edge. Outgoing lookup is recomputed too: a previously
unresolved provider becoming resolvable can change an edge's identity without an origin content edit.

Additive and revise require the proposed fresh machine facts. Terminal preserves `checkDecomposeTerminalOrigin` and
`checkDecomposeSourceBinding`: verify current lifecycle/shape eligibility and the current-profile scan, origin identity,
source-unit IDs/digests, and incoming/outgoing edge IDs. It adds no requirement that stored source kind or profile
remain equal when the existing rules allow the current kind. The rule observes the origin's inbound list itself,
including previously absent lists, and uses the declared grammar. Incomplete/unreadable listings, unavailable
identity/history proof, unavailable required records, and unresolved rule observations refuse with the underlying
actionable repair; none is treated as empty, absent, or authenticated. A proved nonmember or reused slug is not excluded
or removed; discard/revise retain their current repair behavior, while terminal retains its member-gone refusal.

A rule failure is a recoverable `record-malformed` under its stable cut-map rule. Decompose translates a final-gap
binding/observation refusal to a fresh preparation and, for removing modes, a fresh preview and approval; a stale
machine also names revision. Repaired state remains able to complete through the ordinary command path. Existing
`meta.decompose-removal-edges` remains necessary for dependency and pause edges in the complete proposed after-state.

##### 8.8.4. Atomic backend obligation

The successful batch must have one local atomic admission point at which all submitted record observations and
all registered checks hold against a coherent before-state, followed by exactly the requested mutations. Native
checks must remain valid through publication even for read-only refs and newly created relevant refs. Re-reading
and then releasing protection before commit is insufficient.

The ref backend currently captures immutable tips for checks but publishes CAS updates for changed refs only
(`batchRefRecords`, `commitRefWrites`, `commitRefStep` and the ref-transaction update set). That does not close the
outsider-inventory race. Its provider must extend final publication serialization or supply an equivalent protocol
covering every local publisher, including sync and new-ref creation. A final serialization boundary can evaluate
scoped evidence and publish without exposing a whole-store freshness comparison to callers. Internal contention
or retries caused by an unrelated write must not by themselves demand a new Owner approval.

Backend lock ordering is provider-owned implementation; the shared contract specifies the atomic result. The
provider must verify stale read-only records, new conflict refs, existing/new incoming-owner races, unknown outgoing
provider resolution, and relevant group additions immediately before publication. No claim of native support is
made until provider implementation and conformance evidence exist. The consumer stays dark before cutover.

##### 8.8.5 Caller propagation

Bind the complete canonical observation array, including canonical conflict sets and explicit absence expectations,
into `decomposeApplyAuthority` alongside the existing mode, origin generation, and exact writes. Advance its internal
hash format in place; pre-public-release state needs no migration or compatibility reader. The apply's actual batch
uses exactly the observation set covered by that authority.

- Additive sends only `prepared.writes`, with observations from both `prepared.records` and separately acquired
  observations. It no longer uses `applyPreparedLifecycleWrite` to manufacture guard puts.
- Extraction, revise, and discard pass their complete observation set through `batchLifecycleWrites` into the batch.
- Retirement passes explicit batch observations through an optional field of `StoreTransitionInputs`; the shared
  lifecycle executor forwards them. Existing `preparedRecords` behavior for other verbs is preserved. This is a
  bounded extension for the new cut, not a migration of every lifecycle verb in this increment.
- Preparation/preview can retain diagnostic early rereads. The atomic batch, rather than a final early reread,
  establishes freshness. Every consumed group contributes its primary when its inherited identity or placement
  matters. Existing held-entry and removal rules remain in force.

### 9. Discard and revision

A rejected or revised distribution is one prepared verb batch (`meta.verb-owned-field` refuses only hand edits, and no
rule asks lineage for it), previewed and applied under an authority as § 8.7 defines. Like an extraction's terminal
batch (§ 8.6), it submits its approved observations and prepared writes alone to atomic admission
(`batchLifecycleWrites`; § 8.8, A4), so it writes nothing its preview does not show and never puts a conflict record a
sync filed in a group it acquired.

#### 9.1 The discard

`arc decompose <origin> --discard` previews and `--discard --apply <authority>` removes each stub still present as a
whole group — found by its map slug, which `lookup` resolves through a rename, and a member only where the cut created
it (§ 8.3), an item that took a gone member's slug being left untouched — the cut's new cohort documents, and the stored
map, after § 9.3's checks. A stub's whole group is every record of it, acquired at its version
(`acquireLifecycleRecords`): with no lineage written, the ref backend removes only the records a batch names (its
§ 7.5), as the reference backend does. A stub's conflict record is write-once, removed only by its writer verbs (`once`,
`lib/store/registry.ts`), so the discard names it in the `resolves` of its subject's removal, which closes it (the
contract's D6). It writes no lineage. Edges the additive batch settled for a slug stay settled, each still naming its
other record. The store's `history` keeps the created-then-removed records (the contract's operation table, A2). A
discard cannot undo authoring's edits to existing homes and existing cohort coordination (§ 7), which stay as authored;
its preview lists each existing home and existing cohort coordination the map allocated to as left edited.

#### 9.2 The revision

- **The starter.** `arc decompose <origin> --revise` writes nothing and emits a revision starter, re-bound by § 9.4's
  rule: where the stored map's authoring carries whole, the complete revised map over a fresh machine half; otherwise a
  fresh starter, as `--preflight` emits one, with the stored map's authoring beside it and the first place to reauthor
  as a reason and a locus, as today's refresh reports one (`refreshV3ExtractionCutMap`). The operator authors the
  revised map from it. Preflight's refusal of an origin holding the map stops a second cut, not this.
- **The batch.** `--revise <cut-map>` previews and `--revise <cut-map> --apply <authority>` writes the difference
  between the stored map and the revised one, after § 9.3's checks. The revised map decodes as § 3.4 does, and its
  machine half must equal a fresh one taken as § 9.4 takes it, which also holds it to the same origin. A cohort document
  the stored map created counts as the cut's for § 3.3's Purpose rule: the revised map carries its Purpose, and the
  revision writes a Purpose only for a document it creates. The batch adds stubs through § 6 step 3's writers, after
  that step's copy checks, removes them whole as the discard does (§ 9.1), and creates or removes cohort documents
  through § 6's writers. It moves each retained member's seeded `Depends On` edges, found by provider as § 8.3 finds
  them, and `Cohort` from the stored map's to the revised map's through the field writers (`writeMetaDependsOn`,
  `writeMetaCohort`, `lib/store/kinds/meta/bullet-writers.ts`), a member holding a stored map of its own included, whose
  cut then re-binds (§ 8.4), leaves edges the stored map did not seed as they stand, and replaces the stored map. A
  member already gone (§ 8.3) that the revised map drops has nothing to remove. The stubs and cohort documents it adds
  pass § 6 step 2's name checks, and the revised map the rest of that step's checks, with the Purpose rule above, so a
  revised placement naming a cohort after the origin refuses as at the additive batch. The members and their authored
  content stay. A changed unit allocated to a destination is carried into it by hand during authoring.

For a prior internal seed, use its member's authenticated creation UID even when the member is gone (A5). Resolve that
exact UID's lineage and its assigned retirement replacements; a later terminal holder of the authored name grants no
old-seed authority. Subtraction requires established provider identity: when an actual edge resolves ambiguously, refuse
the proposed removal and name its settlement to an unambiguous provider or its explicit removal through write-back, then
a fresh revision. Seed validation's name fallback (§ 8.3) does not authorize destructive subtraction. After that repair
the revision must complete, preserving unrelated groomed edges and current replacement records.

#### 9.3 What either refuses

- **A started member it would change,** since it is no longer a stub: one it would remove, naming
  `arc abandon <member>`, and a retained one whose seeded `Depends On` or `Cohort` it would move, naming the change for
  the member's owner to make or the map to drop, as a started dependent or home keeps its edge for its owner (§ 7,
  § 12).
- **An edge it does not write that names a stub it removes** — a retained member's own, or any other open work item's,
  found through the lifecycle listing — counting a `Depends On` edge and a pause `waits-on` edge and skipping completed
  records, as `work-item.slug-edges` counts them (`namedEdges`, `survivingEdge`), a count the verb makes itself since
  both are private to that rule's module. It names each edge for its owner to retarget or drop, a `waits-on` edge
  through `arc pause <name> --waits-on <other>`, `--waits-on-note <text>`, or `--no-waits-on`. The early preview count
  is repeated by `meta.decompose-removal-edges` at atomic batch admission (A2). For a `decompose` metadata removal,
  `checkMetaRemovalEdges` counts all surviving open metadata in the complete proposed after-state, including concurrent
  edge additions, when no terminal lineage preserves that generation as a provider. Terminal retirement leaves
  started dependents' edges for their own reconcile (§ 8.4). It protects the removed current name and former names that
  resolve to that generation in the before-state. Same-batch removal or retargeting discharges an edge; unavailable
  identity or listing evidence refuses with a retry remedy. Other writers and metadata puts are unaffected. A refusal
  preserves the native `record-malformed` rule and makes no partial writes.
- **A stub it would remove that holds a stored map of its own,** naming that cut's `arc decompose <stub> --discard`.
- **A member renamed since the additive batch,** in a revision, naming `arc rename <new> <old>`, as the terminal batch
  does (§ 8.3).
- **A member gone that the revised map keeps** (§ 8.3), in a revision, naming its removal from the map, as the terminal
  batch names it (§ 8.3).
- **A revised placement keeping a cohort document the cut created under another `Parent`,** naming another name for it
  in the map: no verb re-parents a cohort (record kinds § 8.2), and a create of the document's name resolves to the live
  document it would replace and refuses its expected absence (the ref backend's § 5.1 step 2 and § 5.2;
  `canonicalReference` in the reference backend), so one batch cannot remove and create it.
- **A new cohort document it would remove that something open still holds** (`cohort.open-members`,
  `checkCohortOpenMembers`, `lib/store/kinds/cohort/rules.ts`): an open work item whose `Cohort` path includes it, since
  anyone may groom a stub into the cut's cohort between the batches and a started item's owner theirs; or an open cohort
  document whose `Parent` names it. It names each holder — a work item for its owner to take out of the cohort, anyone
  doing so for a stub, and a cohort document for its `Parent` to be changed once its own open members leave it, or in
  one batch with theirs, since the cohort checks refuse a `Parent` its members' paths disagree with — each through
  write-back.
- **A stub it would remove whose inbound list holds an entry,** naming each entry by its `_Id:_` to route under D11 with
  `arc route <entry-id> --from <stub> --expected-version <version> --to <destination>` — to the origin in a discard, or
  to a retained member in a revision — since an entry integrated into a stub the batch removes leaves with it. A discard
  writes no lineage for `lineage.cut-in-flight` or `lineage.inbound-held` to see, and `meta.inbound-held`, whose
  route-or-integrate remedy this follows, passes a removed meta (`checkMetaInboundHeld`). Like those rules, the refusal
  admits until `seam-locus` declares the inbound kind's grammar (`observeInboundHeld`; record kinds § 3.6), and its
  tests supply one, as `inbound-held-rule.test.ts` does.

#### 9.4 Re-binding a changed origin

When the terminal batch refuses a changed origin (§ 8.2, § 8.4), a revision re-binds the map by the rule today's
extraction refresh applies (`refreshV3ExtractionCutMap`, `decompose-v3-refresh.ts`), carried to both shapes: a fresh
preflight's machine half, read as preflight reads it and leaving out the members (§ 3.2), replaces the map's, and the
authoring half carries whole when the only change is to the content of units allocated `drop` or, in an extraction, kept
by the origin, or to the source kind, where the revised map still passes `source-shape` (§ 3.4): a stub started since
the additive batch scans what it did (§ 8.2), and the terminal batch takes it. Any other change — an added or removed
unit, a changed unit identity, a changed unit some allocation sends to a destination or one under a repeated heading, a
changed edge, or a changed origin identity or planning profile — names the first place to reauthor. Edges compare by
their `edgeId` (§ 3.2), where today's rule compares the whole edge arrays: a changed edge is a different set or order of
them, so a dependent or provider renamed since carries, its new slug arriving with the fresh machine half. `--revise`
emits the result (§ 9.2). The re-binding scan skips the two refusals that guard starting a cut — an origin holding a
stored map, and one whose inbound list holds an entry, which the terminal batch refuses on its own (§ 8.4) — while an
Integrating or archived origin refuses the revision as it refuses preflight.

### 10. Lifecycle moves between the batches

- **Abandoning the origin** would end the item and take the stored map with it, stranding the members and leaving the
  terminal batch and the discard nothing to read by slug. So `lineage.cut-in-flight` refuses creating `abandon` lineage
  for an origin whose stored map is in the batch's before-state — the state the abandonment finds, which holds the map
  since no abandonment removes it, so the rule reads the same on every backend — naming
  `arc decompose <origin> --finish` and `--discard`, as `lineage.inbound-held` refuses terminal lineage for an origin
  holding inbound entries (`checkLineageRecord`, `lib/store/kinds/lineage/check.ts`). Every abandonment writes lineage
  (`runStoreAbandon`), and no hand edit removes a meta (`meta.verb-owned-field`), so the rule reaches every abandonment
  without a change to the abandon verb.
- **Every other move is left to the terminal batch** (§ 8.2): activation, deactivation, a start, a pause, a rename.
- **Clones that have not synced.** The rule holds as of each write (the ref backend's § 5.3), so two races are possible.
  Both are accepted, since each needs two machines acting on one origin without syncing, though each can leave records
  no verb clears today:
    - An abandonment on a clone that has not pulled the additive batch lands. After the sync the origin reads
      `not-found` (its § 6.6) and the discard has no map to read. The members stay as stubs, each removed by
      `arc abandon <member>`. The cut's new cohort documents stay open and empty: write-back removes nothing
      (`storage-projection` § 7.2), and no verb can remove them here, since archive closes a cohort only once its last
      member archives (record kinds § 8.6) and the discard, which would remove them, has no map to read. A leftover
      subcohort under an existing parent also keeps that parent from closing, since archive closes a parent only once
      its subcohorts close (`archive-store.ts`).
    - Two clones' additive batches each pass expected absence, and the sync keeps one stored map current and files the
      other as a conflict record (its § 6.4). `--finish` then refuses on the conflict, as the contract's next dependent
      verb does, naming `--discard` and `--revise`, which name the conflict record in their `resolves`, keeping the
      current map: the contract's resolution of a conflicted record. Where the two cuts' member and cohort names differ,
      that clears the current cut, and the other cut leaves stubs, which `arc abandon <member>` removes, and open cohort
      documents, as above. Where they share a name, the two items clash as items created on two machines do: a lookup of
      the name refuses `ambiguous-match` (its § 8), so the discard, the revision, and `arc abandon` surface that
      refusal, which the store classes recoverable (`LocalRefusalSchema`, `lib/store/refusal.ts`), though no verb serves
      its remedy, a rename of one by its UID, today, and none renames a cohort (§ 6, § 18).

A5 preserves the selected map and its owner bindings as one value through sync. A different branch's omitted member or
removed map is not a removal boundary for those bindings. Where clones derive the same binding key but their complete
receipts prove different UIDs, § 8.3.1's terminal ambiguity applies before name selection: rename alone cannot change
immutable birth facts. This is a stated unsynced-clone limitation; no generation is guessed or automatically cleaned up.
Ordinary name ambiguity with uniquely proved birth facts still retains the backend's own refusal.

### 11. Where the cut runs

The verb takes the origin by slug and runs from any checkout, guarded by the prepared write's versions. Nothing in the
store binds a verb's write to a checkout: abandonment's arm from the flip also runs from any, finding the checkout that
holds its work unit (`findWorkUnitHoldingCheckout`, `verbs/unshared-work.ts`). D13 binds hand edits of a started work
unit's meta and task list to its own checkout, and D17 has lifecycle workflows for a started work unit check their locus
at entry.

The workflow anchors the same way: a started origin's cut, every extraction among them, runs in the origin's own
checkout; a stub's runs from any checkout, as grooming does. A retirement origin is a stub or a started Planning work
unit, which from the flip holds its own checkout detached at base (D17); one started before the flip keeps its
`plan/<slug>` branch as a `created` link (lifecycle § 6.3), which `retiredBranches` and teardown already cover. A
retirement run there ends by removing that checkout, or releasing it where it was anchored in place with
`arc start --here` (`runStoreTeardown`); teardown already does either from inside it (its `chdir` seam,
`verbs/teardown.ts`).

**A retirement reads no work-item state from Git.** Its origin is a stub or a Planning work unit, whose `plan/<slug>`
link, where it has one, is read from the primary's links as branch authority alone; a `document` home refuses (§ 7);
code stays with an extraction's surviving origin. Its only Git reads are locus reads: the worktree listing that finds
the checkout holding the origin, as abandonment's arm reads it, and the removal check and teardown after the batch.

### 12. Edges and forward compatibility with `work-item-relations`

- **Stub dependents only** (record kinds § 7.4). The terminal batch rewrites the `Depends On` of each dependent that is
  a stub, the cut's own members aside (§ 3.2), so `unwritable-dependent` goes. An in-flight or paused dependent keeps
  its edge and applies the lineage disposition at its own reconcile; in an extraction, which writes no lineage, a
  started dependent keeps its edge on the surviving origin (§ 8.6). An existing home taking a new edge is treated as a
  dependent.
- **Slug edges.** A cut giving a member a slug an edge already names settles that edge first, or `work-item.slug-edges`
  refuses (record kinds § 5.3) — in the additive batch (§ 6) — save the origin's own such edge, which refuses before
  anything is written, naming its settlement and a fresh preflight (§ 6 step 2).

`work-item-relations` (planned, after `storage-cutover`) types how work items relate: an edge gains the dependent's gate
and a reason — `design`, `start`, `task`, or `land`, an unqualified edge reading `start` — which a cut must carry when
it redistributes edges; a cohort document's coordination half becomes typed entries; and its open question 1, whether a
cohort can be an edge's endpoint, waits on this design's redistribution rules. The store version builds nothing for it,
and adopts four rules that keep its change local:

1. **Edges move as entries keyed by provider.** A dependent's edge on the origin gets the replacement targets as its
   providers, each a copy of the entry, or is dropped; a member's seeded edge copies the origin's entry. Today an entry
   is a slug (`writeMetaDependsOn`); when it widens, gate and reason ride along with no change to the cut's logic. The
   lineage record keeps providers only (`replace`, `drop`, and `members`, `lib/store/kinds/lineage/schema.ts`), which
   suffices: a dependent reconciling later substitutes the provider on its own edge and keeps its gate.
2. **The terminal batch compares edges by provider** (§ 8.3), so a gate or reason set during authoring is grooming, not
   divergence.
3. **Cohort documents are written only through the cohort kind's writers,** the at-cap fan-out block included, so typed
   coordination entries arrive through the kind when it gains them. The cut seeds none: the fan-out block renders
   membership, and prose a map allocates to a cohort's coordination stays prose.
4. **Redistribution never names a cohort.** An edge on the origin resolves to members or drops, and from the flip the
   cut's cohort never takes the origin's name (§ 6). That is the "shorthand for an edge on each member" answer to the
   relations work's question 1, as decomposition practices it today. If relations admits cohort endpoints, a `replace`
   disposition gains a cohort target in the lineage kind, which is relations' change.

A copied `task` edge whose task annotation stays in the origin's task list is a seam for `work-item-relations` to
settle.

### 13. Modules: what carries

The store version imports no module the deletion pass removes. What it takes from today's machine falls in three
classes:

| Class                                | Modules                                                                                                                                                                                                                                                                                                                                                                               | How it carries                                                                                                |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Carried unchanged                    | `decompose-content.ts` (after the locator move, less its version-3 remainder, § 1.5), `decompose-heading.ts`, `decompose-command-renderer.ts`                                                                                                                                                                                                                                         | imported as they stand; they survive the deletion pass                                                        |
| Rule carried, rewritten over records | `decompose-v3-schema.ts` (as `cut-map` v4), `decompose-v3-preflight.ts`, `decompose-v3-conservation.ts`, `decompose-v3-topology.ts`, `decompose-v3-thinning.ts`, `decompose-v3-refresh.ts`, `decompose-transition-record.ts`, `decompose-v3-refusal.ts` and its remedy definitions                                                                                                    | new modules under `lib/decompose/` over records and the kinds' writers; the originals stay as the in-repo arm |
| In-repo only                         | every `git-decompose-*` module, the operation, materializer, occupation, finish-operation, and execution-preflight state machines, the repository plan, tree, projections, and retirement delta, the plan composer and plan, the result report, the finish's result schemas and remedies, `decompose-sweep.ts`, `decompose-candidate.ts`, the candidate cleanup, and base advancement | deleted at the cutover (§ 1.5)                                                                                |

`decompose-command-routing.ts` takes the new mode keys, which the in-repo arm's routing reads too, so it carries with
the change.

- **Conservation** keeps allocation coverage, the map's ownership and edge rules, and dependency projection, its inputs
  records rather than paths and its dependents keyed by UID: `writablePath` and `unwritable-dependent` go (§ 12), and so
  does `stale-dependent`, which compares version 3's `currentTargets` (§ 3.2).
- **Topology** keeps the four placements, their member-count and coordination rules, the surviving origin counted among
  an extraction's members (`planInternalV3DecomposeTopology`), and both `Parent` checks, which already read the cohort
  kind's parsed `parent` (`structurallyMatches`, `decompose-v3-topology.ts`); the at-cap block comes from the cohort
  kind's fan-out writer.
- **Lineage** keeps the builder's projection from the map (`createDecomposeTransitionRecord`), adding UIDs where known
  and `retiredBranches` from the primary (§ 8.5).
- **Refusals** keep their domain conditions; those naming Git conditions go, and every remedy names the arm from the
  flip's commands (§ 14).
- **Scaffolds** keep the creation writer, the planning profile read from `Design`, and the retitle.

A5 changes the cut-map codec boundary: `decodeCutMapContent` returns the strict stored wrapper, and `writeCutMapRecord`
accepts it. Adapt the direct stored decoders in `acquireDecomposeStoredCut` and `acquireDecomposeTerminal`, historical
unwrapping in `readDecomposeLandedExtraction`, and native `checkCutMapBinding`. Carry bindings through
stored/revision/terminal inputs to member and cohort authentication; additive/revision plans construct the wrapper.
External `decodeCutMap`, preflight, binding, rebind, allocation and report schemas continue consuming the extracted
authored map. Presence-only guards and byte-preserving lifecycle writes do not acquire generation ownership from the
wrapper's existence. Registered-kind and stored-content fixtures use the new representation; no old-format reader is
added.

### 14. Refusals name their remedy

Every refusal says whether it is terminal and names the command that repairs it (`DEV-RULES.PROJECT`, "Recovery-complete
refusals"): a typed action where running it as given repairs the condition, and the command in its text where the repair
needs the operator's input. After the remedy the cut completes, but for the leftovers of § 10's races.

| Refusal                                                                                                                                                                                                                                                                                                                                                                                                                       | Where                                   | Repair it names                                                                                                                                                                                                                                                                                                                                    | Form                            |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| The origin holds a stored map, or another cut stores one before the batch lands                                                                                                                                                                                                                                                                                                                                               | preflight, additive                     | `arc decompose <origin> --finish`, `--revise`, or `--discard`                                                                                                                                                                                                                                                                                      | text                            |
| The origin's inbound list holds entries                                                                                                                                                                                                                                                                                                                                                                                       | preflight, additive, terminal           | each entry's `_Id:_`, to fold into the draft or spec or route with `arc route <entry-id> --from <origin> --expected-version <version> --to <destination>`                                                                                                                                                                                          | text                            |
| The origin is Integrating or archived                                                                                                                                                                                                                                                                                                                                                                                         | preflight, additive, revision           | none for archived; `arc reopen <origin>` for Integrating, then for a retirement `arc deactivate <origin>`; for a cut in flight, also `arc decompose <origin> --discard`                                                                                                                                                                            | text                            |
| The origin is one no member can be made from: a `Design` naming no profile's artifacts, an artifact it names absent, a `Task List` disagreeing with the profile, an artifact the scanner rejects, a design record, or a task list or notes it would copy, with no title line, a task list it would copy carrying a diagnostic the task-list write checks report, or an `Owner`, `Priority`, or `Origin` missing from its meta | preflight, additive, revision, terminal | the field or artifact at the locus, repaired; then the mode again                                                                                                                                                                                                                                                                                  | text                            |
| A task list the batch would copy carries a completed task                                                                                                                                                                                                                                                                                                                                                                     | additive, revision                      | target the member's draft, spec, or notes in the map instead                                                                                                                                                                                                                                                                                       | text                            |
| The origin's meta or a source record holds an open conflict                                                                                                                                                                                                                                                                                                                                                                   | preflight, additive, revision, terminal | each conflict, named by its token and subject, resolved: its markers in the file that shows them, which write-back persists naming it, or otherwise `arc save --resolve <token>` from a checkout projecting its subject (§ 18); then the mode again                                                                                                | text                            |
| The lifecycle listing is unreadable or incomplete                                                                                                                                                                                                                                                                                                                                                                             | preflight, every batch                  | the listing's own remedy; then the mode again                                                                                                                                                                                                                                                                                                      | text                            |
| The map does not decode, or is version 3                                                                                                                                                                                                                                                                                                                                                                                      | additive, revision                      | the locus of the failing rule; `--preflight` for a version-3 map                                                                                                                                                                                                                                                                                   | text                            |
| The map breaks a carried ownership, edge, or placement rule                                                                                                                                                                                                                                                                                                                                                                   | additive, revision                      | the rule's locus, corrected in the map                                                                                                                                                                                                                                                                                                             | text                            |
| The map's machine half differs from a fresh preflight                                                                                                                                                                                                                                                                                                                                                                         | additive, revision                      | `arc decompose <origin> --preflight`, or `--revise` in a revision, then the authoring carried over                                                                                                                                                                                                                                                 | text                            |
| The wrong flag for the map's shape                                                                                                                                                                                                                                                                                                                                                                                            | additive                                | `--execute` or `--extract`                                                                                                                                                                                                                                                                                                                         | action                          |
| A member's slug or a new cohort document's name is held by a live work item or an open cohort document (D14), as a former slug, or by another name in the map, a new cohort document's also by a completed cohort, or taken by another write before the batch lands                                                                                                                                                           | additive, revision                      | another slug or cohort name in the map                                                                                                                                                                                                                                                                                                             | text                            |
| An allocation into a file the operator may not edit                                                                                                                                                                                                                                                                                                                                                                           | additive, revision                      | target the home's draft, spec, or notes; or route the home an inbound entry                                                                                                                                                                                                                                                                        | text                            |
| An existing home resolves to nothing, to a completed work unit, or to an Errand                                                                                                                                                                                                                                                                                                                                               | additive, revision, terminal            | another destination in the map, at the terminal batch through `arc decompose <origin> --revise`, then `--revise <cut-map>`                                                                                                                                                                                                                         | text                            |
| A started home would take an edge, or an extraction would move a started dependent's edge off the origin                                                                                                                                                                                                                                                                                                                      | additive, revision, terminal            | leave the edge to its owner, in the map or, once stored, through `--revise`                                                                                                                                                                                                                                                                        | text                            |
| A `document` home                                                                                                                                                                                                                                                                                                                                                                                                             | additive, revision                      | allocate the content to a work item or a member                                                                                                                                                                                                                                                                                                    | text                            |
| An edge the cut writes names a provider a slug lookup does not resolve — abandoned, decomposed, or ambiguous — or the origin's own edge names a provider whose slug a member takes                                                                                                                                                                                                                                            | additive, revision, terminal            | `drop` it or name another provider, in the map or, once stored, through `--revise`; for the origin's own edge on a decomposed provider or one whose slug a member takes, first `arc wu reconcile --apply` from a started origin's checkout, or for a stub an edit of its `Depends On` through write-back, then a fresh `--preflight` or a revision | text                            |
| A Purpose missing for a created document, or present for an existing one                                                                                                                                                                                                                                                                                                                                                      | additive, revision                      | add or remove it in the map                                                                                                                                                                                                                                                                                                                        | text                            |
| No stored map, the cut never stored or discarded                                                                                                                                                                                                                                                                                                                                                                              | terminal, discard, revision             | `arc decompose <origin> --execute <cut-map>` or `--extract <cut-map>`                                                                                                                                                                                                                                                                              | text                            |
| The origin's current kind is not the shape's                                                                                                                                                                                                                                                                                                                                                                                  | terminal                                | the restoring moves — `arc deactivate <origin>` for an Active origin; `arc reopen <origin>`, then for a retirement `arc deactivate <origin>`, for an Integrating one — or `arc decompose <origin> --discard`                                                                                                                                       | text                            |
| A member is gone, abandoned or its slug held by another item (§ 8.3); a seeded field diverges; a locator does not resolve; or the origin changed or was renamed                                                                                                                                                                                                                                                               | terminal                                | `arc decompose <origin> --revise`, then `--revise <cut-map>`; for a seeded field, its restoration through write-back, and the revision only where it can make the change legitimate (§ 8.3)                                                                                                                                                        | text                            |
| An `at-cap` placement's subcohort document holds a lone fan-out marker or a different block                                                                                                                                                                                                                                                                                                                                   | terminal                                | the block repaired or removed through write-back; then `arc decompose <origin> --finish`                                                                                                                                                                                                                                                           | text                            |
| The origin's checkout fails the removal check                                                                                                                                                                                                                                                                                                                                                                                 | terminal, its preview included          | the removal check's own remedy (`describeRemovalRefusal`)                                                                                                                                                                                                                                                                                          | text                            |
| The apply authority is stale                                                                                                                                                                                                                                                                                                                                                                                                  | terminal, discard, revision             | `--finish`, `--discard`, or `--revise <cut-map>` for a fresh preview and approval                                                                                                                                                                                                                                                                  | text                            |
| A started member would be removed                                                                                                                                                                                                                                                                                                                                                                                             | discard, revision                       | `arc abandon <member>`, or keep it in the map                                                                                                                                                                                                                                                                                                      | text                            |
| A started member's seeded field would move                                                                                                                                                                                                                                                                                                                                                                                    | revision                                | the member's owner makes the change, or the map drops it                                                                                                                                                                                                                                                                                           | text                            |
| An edge names a stub it removes                                                                                                                                                                                                                                                                                                                                                                                               | discard, revision                       | the edge's owner retargets or drops it; `arc pause <name> --waits-on <other>`, `--waits-on-note <text>`, or `--no-waits-on`                                                                                                                                                                                                                        | text                            |
| A removed stub holds its own stored map                                                                                                                                                                                                                                                                                                                                                                                       | discard, revision                       | `arc decompose <stub> --discard`                                                                                                                                                                                                                                                                                                                   | text                            |
| An open work item or cohort document holds a cohort document it would remove                                                                                                                                                                                                                                                                                                                                                  | discard, revision                       | a work item's owner takes it out of the cohort, anyone for a stub; a cohort document's `Parent` is changed after its own members leave it, or with theirs in one batch; each through write-back                                                                                                                                                    | text                            |
| A member was renamed between the batches                                                                                                                                                                                                                                                                                                                                                                                      | terminal, revision                      | `arc rename <new> <old>`                                                                                                                                                                                                                                                                                                                           | action                          |
| The cut has landed                                                                                                                                                                                                                                                                                                                                                                                                            | discard, revision                       | none: `--finish` reports the landed cut (§ 8.7)                                                                                                                                                                                                                                                                                                    | text                            |
| The stored map is conflicted after a sync, the two cuts' names differing                                                                                                                                                                                                                                                                                                                                                      | terminal                                | `arc decompose <origin> --discard` or `--revise <cut-map>`, which resolve it, keeping the current map (§ 10)                                                                                                                                                                                                                                       | text                            |
| A member is gone that the revised map keeps                                                                                                                                                                                                                                                                                                                                                                                   | revision                                | drop it from the map                                                                                                                                                                                                                                                                                                                               | text                            |
| A revised placement keeps a cohort document the cut created under another `Parent`                                                                                                                                                                                                                                                                                                                                            | revision                                | another cohort name in the map                                                                                                                                                                                                                                                                                                                     | text                            |
| A placement names a cohort after the origin                                                                                                                                                                                                                                                                                                                                                                                   | additive, revision                      | another cohort name in the map                                                                                                                                                                                                                                                                                                                     | text                            |
| A retirement's member names the origin in its `Depends On`                                                                                                                                                                                                                                                                                                                                                                    | terminal                                | the member's owner drops the edge, anyone for a stub, through write-back                                                                                                                                                                                                                                                                           | text                            |
| A removed stub's inbound list holds entries                                                                                                                                                                                                                                                                                                                                                                                   | discard, revision                       | `arc route <entry-id> --from <stub> --expected-version <version> --to <origin or member>`                                                                                                                                                                                                                                                          | text                            |
| `abandon` lineage for an origin holding a stored map (`lineage.cut-in-flight`)                                                                                                                                                                                                                                                                                                                                                | `arc abandon`                           | `arc decompose <origin> --finish` or `--discard`                                                                                                                                                                                                                                                                                                   | text                            |
| `--revise` or `--discard` before the flip                                                                                                                                                                                                                                                                                                                                                                                     | in-repo arm                             | `unsupported`: until the flip a rejected cut stays staged, or as its ARC-owned candidate, for explicit cleanup direction (`decompose-work-unit.md`)                                                                                                                                                                                                | text                            |
| `--finish` without its map before the flip                                                                                                                                                                                                                                                                                                                                                                                    | in-repo arm                             | `arc decompose <origin> --finish <cut-map>`                                                                                                                                                                                                                                                                                                        | text                            |
| `--advance-base` from the flip                                                                                                                                                                                                                                                                                                                                                                                                | arm from the flip                       | `unsupported`: `arc decompose <origin> --finish`                                                                                                                                                                                                                                                                                                   | text                            |
| `--finish <cut-map>` from the flip                                                                                                                                                                                                                                                                                                                                                                                            | arm from the flip                       | `arc decompose <origin> --finish`, which reads the stored map                                                                                                                                                                                                                                                                                      | action                          |
| A version conflict at the batch, where the repeated checks find nothing (§ 6)                                                                                                                                                                                                                                                                                                                                                 | any batch                               | the additive batch again as given; for a removing batch, a fresh preview and approval                                                                                                                                                                                                                                                              | action, or text after a preview |
| Required batch creation facts were never retained (A5)                                                                                                                                                                                                                                                                                                                                                                        | stored-map modes                        | terminal `unsupported`: use a receipt-capable provider and authentic complete history; regenerate unsupported pre-cutover development state, without backfill or automatic deletion                                                                                                                                                                | text                            |
| An actual edge cannot be uniquely identified for old-seed subtraction (A5)                                                                                                                                                                                                                                                                                                                                                    | revision                                | settle that member's edge to an unambiguous provider or explicitly drop it through write-back, then a fresh revision preview and approval                                                                                                                                                                                                          | text                            |

### 15. Names

| Mode                       | Form                                                                | From                                                                |
| -------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------- |
| Preflight                  | `arc decompose <origin> --preflight`                                | both arms                                                           |
| Additive batch, retirement | `arc decompose <origin> --execute <cut-map>`                        | both arms; the additive batch from the flip                         |
| Additive batch, extraction | `arc decompose <origin> --extract <cut-map>`                        | both arms; the additive batch from the flip                         |
| Terminal batch             | `arc decompose <origin> --finish [--apply <authority>]`             | the flip; the in-repo arm keeps `--finish <cut-map>` for extraction |
| Revision                   | `arc decompose <origin> --revise [<cut-map> [--apply <authority>]]` | the flip                                                            |
| Discard                    | `arc decompose <origin> --discard [--apply <authority>]`            | the flip                                                            |
| Base advancement           | `arc decompose <origin> --advance-base <cut-map>`                   | the in-repo arm; refuses from the flip                              |
| Map schema                 | `arc schema get cut-map`                                            | this change                                                         |

The kind's name is `work-item/cut-map`, and its stored path `cut-map-<uid>.json`. Code identifiers keep today's names.

### 16. The workflow's end state

The flip rewrite of `decompose-work-unit.md` is `storage-cutover`'s; this design states its end state, step by step
against today's workflow:

1. **Preconditions** add where the cut runs (§ 11): a started origin's in its own checkout, a stub's from any.
2. **Preflight and the map** stay, under the `cut-map` schema. The starter binds the origin by its source units' digests
   and its edges; the planning profile follows the origin's `Design`; the authored placement carries the Purpose of each
   cohort document the cut creates; the workflow names the schema's published shapes (`arc schema get cut-map`) and
   passes the completed map by path to the additive batch, after which the cut reads it from its record by slug.
3. **The additive batch** replaces dispatch, for either shape, with no candidate branch, protection arm, or commit.
4. **Authoring** stays, through write-back, with today's specification reviews; under a draft profile the member
   specification review has nothing to review.
5. **The distribution approval** stays the one semantic stop and authorizes the terminal batch. Its preview — the
   lineage record and removals, or the extraction's retained bytes — comes from `--finish` and is surfaced at that stop,
   and the retained-bytes review runs before it, so today's separate finish-preview stop goes:
   `--finish --apply <authority>` runs right after, in the same session. On direction, a rejection runs the discard and
   a revision the revision, each previewed and applied the same way; after a revision authoring resumes, and after a
   discard the workflow reports the homes and coordination left edited (§ 9.1).
6. **The terminal batch is the landing.** Release, base advancement, push, and integration go, and with them the commit
   whose footer had no origin artifact left to name. A retirement ends with the origin's checkout removed or released,
   or names `arc teardown <origin>`. An extraction's owner then reconciles the surviving origin's task list and pointers
   through write-back.
7. **Readiness** reads the frontier from `arc status --project` or a slug.

### 17. Forward amendments to shipped specifications

The storage contract, the record kinds, and lifecycle have shipped. Where this design changes what their specifications
define, the change is stated here and built by this change; no specification of theirs is edited.

#### 17.1 The storage contract (`spec-storage-contract.md`)

- **D5's families table** lists three machine record kinds among a work item's records — a work unit's meta and task
  list, and an Errand's record. The cut map is a fourth: a single-writer machine record written only by `arc decompose`,
  never projected, present only between a cut's batches (§ 4). D6's merge table, whose row of single-writer machine
  records written only by verbs names the Errand record, gains it there.

- **Atomic batch observations (A4)** extend the batch input and registered write-check context exactly as § 8.8
  specifies: strict read-only version/conflict expectations, snapshot-bound before-history, trusted lifecycle action,
  and kind-owned inventory admission. They grant no mutation rights or whole-store freshness authority.

- **History creation facts (A5)** extend the shared `HistoryEntry` used by `history` and `changes` with the strict,
  optional backend-generated `creationReceipt` in § 8.3.1. Receipt presence certifies the batch's complete work-item
  and cohort births; absence remains unknown. Caller provenance and mutation inputs are unchanged.

- **Candidate birth facts (A5)** add only § 8.8.2's optional backend-generated `proposedCreatedOwners` to
  `WriteCheckInput`. It proves proposed operation births for native kind admission without exposing caller allocation
  or changing the existing rule-result protocol. It is not a published receipt before acceptance.

#### 17.2 The record kinds (`spec-seam-record-kinds.md`)

- **§ 2.2's production registration set** gains the cut-map kind's parser (§ 4) and native admission rule
  `cut-map.atomic-binding` (§ 8.8, A4).
- **§ 5.4's field table** gains `decompose` as a writer of `Cohort` beyond creation: a surviving extraction origin's
  (§ 8.6) and a retained member's in a revision (§ 9.2). § 5.3's "decomposition sets it for new members" widens to
  match.
- **§ 3.6's rule catalog** gains `lineage.cut-in-flight`, an integrity rule beside `lineage.inbound-held`: it refuses
  when an `abandon` lineage record is created while the retiring work unit's `work-item/cut-map` record is in `before`
  (§ 10).
- **§ 3.6's rule catalog** also gains `meta.decompose-removal-edges` (A2), enforcing § 9.3's surviving dependency
  and pause-edge protection inside a `decompose` primary-removal batch.
- **§ 8.3's cohort writers** gain the at-cap fan-out writer, which appends to an existing subcohort's document a fan-out
  block naming the members a cut adds to it, as today's splice renders it (`fanoutBlock`, `decompose-v3-topology.ts`).

#### 17.3 Lifecycle (`spec-seam-lifecycle.md`)

- **§ 7.1's rename** applies the reference sweep's edits in the records it may write, a stub origin's stored map among
  them. The sweep passes over the `work-item/cut-map` record, and the rename re-puts its owner's own under the new name
  with its bytes unchanged (§ 4).

### 18. Expected contracts

This design consumes behavior other changes build. Each is an expected contract, available when its change lands; what
holds until then is stated with it.

- **The ref backend** (`storage-ref-backend`):
    - atomic observation admission (A4) as defined in § 8.8, including before-history and complete source/edge/group
      membership checks remaining valid through publication. The provider owns native serialization and all local
      publisher participation, including sync and new-ref creation. This is required before cutover; until then the
      reference backend supplies the contract for the dormant cut and the in-repo backend explicitly refuses it.
    - lineage lookup retains authenticated former-name identity after primary retirement (A3), with the exact UID,
      current-name preference, ambiguity refusal, and bounded observations specified in § 3.2. No lookup input shape
      changes. The in-repo decomposition arm stays unchanged; the reference backend supplies this contract for the
      dormant store implementation until the ref backend provides it before cutover.
    - complete creation receipts and candidate birth evidence (A5), exactly as § 8.3.1 and § 8.8.2 define their shape,
      allocation/publication boundary, physical-commit retention, transfer, completeness and failure behavior. This is
      an expected native contract before cutover; the reference backend provides it for the dormant cut. It is absent
      `HistoryEntrySchema` or `commitRefTree` and adds no lookup selector or global history index.
    - the kind's ref home: this change registers the cut-map kind after that change lands, with its mechanism's
      `RefHome` at `cut-map-<uid>.json`; should this change land first, that change sets the kind's `RefHome`, as it
      sets one for every kind whose family has a ref (its § 3.2). Its codec derives the path, its shared suite covers
      registered kinds, and the generic collision rules claim the path, so it needs no code of its own for the kind.
      This is an ordering, not an edge.
    - an end's sweep: a batch leaving a work item its lineage and no primary ends it and removes every record on its ref
      (its § 7.4). The terminal batch removes the stored map itself regardless (§ 4). Write checks see such a batch's
      own writes before that sweep (its § 5.3), so `lineage.inbound-held`, which reads the after-state
      (`checkLineageRecord`), still sees a retiring origin's inbound list; `lineage.cut-in-flight` reads the
      before-state and does not depend on it (§ 10).
    - one namespace for work items and cohorts (D14; its § 5.1 step 2), which refuses a cohort created under a live work
      item's slug. The verb checks it first on every backend (§ 6 step 2), so a cut meets that refusal only when another
      write takes a name between the check and the batch. The batch then writes nothing, and the verb reports the
      held-name refusal (§ 6, § 14).
    - its clash between machines: two live items with one name refuse `ambiguous-match`, the remedy a rename of one by
      its UID (its § 5.1 step 2, § 8). No verb renames by UID today (`arc rename <slug> <new-slug>`, `cli.ts`), and none
      renames a cohort; until one does, a doubled cut whose names clash has no clean-up through a verb (§ 10).
    - its account of a decomposition, whose children the batch that ends the origin creates (its § 6.6, § 7.4): here
      they are created one approval earlier, by the additive batch, and an extraction never ends its origin. That
      departure has gone to that change.
- **Locus and the entry grammar** (`seam-locus`): the inbound kind's grammar, which the held-entry refusals read — until
  it is declared they admit, as record kinds' held-entry rules do; entries named by `_Id:_` and versioned; and
  `arc route <entry-id> --from <list> --expected-version <version> --to <destination>`, a stale version refusing (its
  § 6.1, § 6.3, § 7.2). Naming each held entry is this design's addition; `meta.inbound-held` reports only that some are
  held. In-flight derivation's candidate-branch arm (`lib/git/in-flight-derivation.ts`) goes with the in-repo arm. That
  change registers `arc route`, and a remedy names only a command `cli.ts` registers
  (`command-surface-documentation.test.ts`), so this branch merges base holding it before building the remedies that
  name it — an ordering, not an edge.
- **The projection and write-back** (`storage-projection`): authoring's edits of the stubs, the cohort documents, and
  the existing homes, under D13's edit rights; and the resolution of a conflict on a projected record, the remedy of
  § 5's conflict refusal, which names each conflict by its token, `<family>/<owner type>/<owner name>/<id>`, and its
  subject: markers resolved by hand in the file that shows them, which write-back persists naming the conflict in
  `resolves`, or otherwise `arc save --resolve <token>` from a checkout projecting the subject, which itself refuses,
  naming the repair, a conflict it cannot resolve (its § 6.4, § 6.5). That change registers `arc save`, and nothing
  orders the two, so whichever lands second names the command in the remedy, which until then names the markers'
  resolution alone — an ordering, not an edge. A test holds it: the remedy names `arc save --resolve` exactly when the
  source's command inventory registers a top-level `save` with `--resolve` (`loadRepositoryCommandInputSnapshot`), so
  the change merging the other second meets it failing until the remedy matches. The flip waits on that change, so the
  whole remedy exists wherever the refusal can fire; the refusal's tests resolve a conflict by a write naming it in
  `resolves` under `write-back`, which the reference backend accepts.
- **Status** (`seam-status-roadmap`): decomposition writes no ROADMAP from the flip (D15). A retired origin, decomposed
  or abandoned, has no status row, since the terminal batch removes its primary; status reads its lineage only for an
  edge still naming it. Between the batches status shows the members and new cohort documents as ordinary stubs and
  cohort documents and the origin as live, with no cut-in-progress mark, so it reads no `work-item/cut-map` record.
- **The cutover** (`storage-cutover`): the flip, before which any cut today's machine has staged is landed or cleaned
  up, since the store version reads no candidate; the flip rewrite of `decompose-work-unit.md` from § 16; the deletion
  pass over § 1.5, in its deletion order; and its rehearsal, the store version's first run on the ref backend, landing a
  representative cut on a copy without post-transition repair — the evidence `decompose-core-hardening` and its parent
  cohort close on.
- **The decomposition doctrine** (`decomposition-doctrine`): whether a member's first session re-validates the contracts
  it consumes against a baseline, and where that baseline is kept. Each of the cut's batches lands at a state version
  (D2), which the contract reads as of (`read`, `list`) and diffs from (`changes`), so a baseline is a state version;
  this design records none.

## Alternatives & Rationale

- **Reroute every module onto the in-repo implementation** — the seam's default and the consumer map's end states (pure
  composition over supplied snapshots, adapters acquiring at pinned versions). Rejected: nothing runs it before the
  cutover, and the path-keyed planner makes it a rewrite either way.
- **Defer the rebuild past the cutover,** `arc decompose` refusing from the flip until a follow-on lands. Rejected
  (Owner, 2026-10-16): it moves work into the program's tail and register key 49 to a new owner, for a version the
  reference backend can verify now.
- **Delete today's machine here.** Rejected: it changes behavior before the flip and drops the hand procedure's tooling,
  for nothing the deletion pass does not already do.
- **One batch, staged machine-locally.** The members, cohort document, and edges would be prepared and authored in a
  staging area on one machine and written in one batch on approval, so nothing shows before it is final and a rejection
  leaves no trace. Rejected (Owner, 2026-10-16): it is a second write-back, one that creates records where the
  projection's refuses to, with its own layout, read-back, checks, resume, and cleanup, held on one machine — the larger
  build, and the Git-adjacent machinery the rebuild sheds. Two batches split the cut at the line today's machine never
  draws, between the bytes the verb composes and those the author writes.
- **Keep the map in the operator's personal files.** Rejected: the per-work-unit workspace retires at the flip, and
  `scratch/` holds documents ARC never reads (D5), where the verb would depend on one.
- **Rely on the ref backend's end to remove the stored map in a retirement.** Rejected: the reference backend removes
  only the records a batch names, so the map would stay current there; removing it in the batch leaves no current map on
  any backend.
- **Refuse any divergence from the seeded fields.** Rejected: it would block the grooming authoring exists for (§ 8.3).
- **Create a cohort named after the origin at the terminal batch,** which ends the origin, keeping the practice both
  recorded cuts followed. Rejected (Owner, 2026-10-16): the ref backend resolves a create's slug against the live owners
  before the batch's writes (its § 5.1 step 2), so the origin would still hold the name, and the batch would need a
  coordination writer the cohort kind lacks, a verb write to started members' meta, and a second check of the deferred
  names. **Exempt a cut in flight from D14's shared namespace.** Rejected: it amends a shipped contract and the ref
  backend, and leaves D14's reason standing, since a planned origin and its same-name cohort project to one
  `backlog/planned/` folder. The cost of refusing instead is that a cut's cohort never takes the origin's name (§ 6).
- **Track members by UID in the stored map,** so a member's rename between the batches carries. Set aside: a rename back
  costs one command (§ 8.3), and the additive batch cannot record a UID the store assigns only as the batch lands.
  Backend creation receipts recover that UID without a second map write (§ 8.3.1, A5).
- **Carry extraction in a follow-on after the cutover,** `--extract` refusing from the flip until then, which is a tail;
  or **drop it,** which leaves a split of a started work unit to `arc stub` and hand editing without the map's
  conservation or edge dispositions. Both rejected (Owner, 2026-10-16).
- **The verb refusing a started origin's cut from any other checkout.** Rejected: it repeats the workflow's locus check,
  which abandonment does not repeat either (§ 11).
- **Pin a member baseline in the lineage record.** Set aside: lineage covers retirement and not extraction, and nothing
  would read it yet; a baseline is a state version (§ 18).
- **Fork the scanner** into the store version rather than moving its locator (§ 1.3). Rejected (Owner, 2026-10-16): two
  copies of about 500 lines until the deletion pass, against a behavior-preserving import change in one module.
- **Preview only the terminal batch,** the discard and revision running directly under their versions with the Owner's
  direction as authority. Rejected (Owner, 2026-10-16): both remove records, and an authority keeps what runs to what
  was approved, as for the terminal batch (§ 8.7).
- **A new `--land` flag** for the terminal batch, leaving today's `--finish <cut-map>` exactly as declared. Rejected
  (Owner, 2026-10-16): extraction's terminal half is already `--finish`, and one name for both shapes keeps the
  workflow's vocabulary; the cost is `--finish`'s operand turning optional.
- **Another schema identity** — `decompose-store-cut-map`, which reads as redundant once everything is the store, or
  `decompose-cut-map` at version 4 in a registry widened to several versions per identity, which changes the kernel
  registry and `arc schema get`'s lookup. Rejected (Owner, 2026-10-16) for `cut-map`, one name across schema, kind, and
  path.

## Cross-cutting Considerations

**Testing.** Every decomposition test passes unchanged over the in-repo implementation, but for the lists the new modes,
the `cut-map` schema, and the cut-map kind join. The store version runs over the reference backend, which reports
`stateOffBranch: true`, with Git steps over the shared scripted `GitExec` fake: a retirement and an extraction end to
end, a discard, and a revision, each refusal of § 14 with the cut completing after its remedy, and every batch's preview
and its stale authority. § 10's races are tested as far as the reference backend's sync produces them, their leftovers
stated outcomes rather than refusals: where two cuts share a member slug or a new cohort document's name, that sync
itself refuses `ambiguous-match` (`indexIdentities`), since each clone mints its own owner's UID (`canonicalReference`),
so the clash at lookup is the ref backend's alone. The held-entry refusals' tests supply a stub
grammar, as `inbound-held-rule.test.ts` does. The reference backend keeps names per type, so it admits a cohort and a
live work item sharing a name that the ref backend refuses (D14); the tests exercise the verb's own check of the shared
namespace (§ 6 step 2), including a cohort named after the origin, names clashing within one map, and a name taken
between the check and the batch, through an injected store refusal; and they assert that no batch's after-state holds a
live cohort and work item of one name. The cut-map kind runs the store's conformance suite as a registered kind. The
locator move's tests are version 3's decode tests and the scanner's, unchanged. Until the cutover's rehearsal the store
version is verified on the reference backend alone, and the first real cut runs after the flip.

The creation-receipt cases (A5) cover companion-first allocation, failed late admission and failed publication with no
visible receipt, completed-name recreation, and exclusion of rename, promotion, reopen and sync adoption from births.
Shared schema and producer checks cover matching `history`/`changes` receipts, complete-none versus absence,
kind/owner/UID validity, duplicate owners and trailers, unsupported versions and batch mismatches. Filtered,
saved-state, net-zero and repeated transfers retain whole receipts without changing event selection. Consumer
regressions cover multiple later retired holders, exact-name versus former-name lineage, renamed members, origin rename,
destination-ID relabeling, member drop/re-add, cut removal/recreation and malformed historical maps. Wrapper cases cover
selected map retention from either merge side, revision/reversion and an unrelated branch's omission/removal; created
parent/subcohort and reused external documents; retained-key continuity; and no-op writes that allocate no key or
generation. Admission cases cover absent candidate facts, false before/after-only birth claims, fresh births under
retained keys, and same-origin history changing between preparation and publication. Reordered/duplicate history entries
preserve the canonical prior-ID set, while missing required batch IDs refuse without hashing a partial set. Each
recoverable evidence or edge refusal includes successful fresh preparation and application after its supported repair;
terminal unsupported or corrupt state is reported truthfully. Atomic admission repeats receipt authentication and
preserves the same specific failure. Native physical-commit, codec, sync-parent and publication-race cases remain
expected provider conformance before cutover; reference tests do not claim native verification.

**Performance.** A cut reads the origin's group, the selected cohort documents, the existing homes, and the dependents
the lifecycle listing names, each a fixed number of times through the store (§ 8.1), with no per-branch reads. The
lifecycle listing is the one read that grows with the project, and every lifecycle verb from the flip already reads it
(lifecycle § 2.1). Member identity adds one preparation `history` pass over the stored map and one against captured
before-state inside atomic admission (§ 8.8, A5); no member or cohort primary histories are searched to discover UIDs.
This stays within criterion 10's upper bound. `Store.history` has no bounded form (`lib/store/contract.ts`): each read
walks the record's complete history — the native `readRefHistoryDetails` uses path-limited history — and grows with that
owner's writes, never with unrelated repository history or branch count. The scanner's own costs stay as today's
(Non-Goals). Native receipt bytes grow with the accepted batch's births and physical commits (§ 8.3.1), without a global
index.

**Security and trust.** The origin is the cut's own subject: like abandonment (`runStoreAbandon`), the verb checks no
operator against its `Owner`, so a retirement removes it and an extraction writes its `Cohort` and thins its draft or
spec. Beyond the origin, a cut writes another person's work only where D13 lets the operator: a stub, which anyone
grooms, and never a started work unit's meta or task list, nor any file of a home another person has started (§ 7). It
removes only the stubs it created, refusing one another person has started (§ 9.3). The stored map takes no hand edit,
being never projected, and its single writer is the verb. Every batch that removes a record applies only the preview it
was approved on (§ 8.7).

**Migration and rollout.** Before the flip, § 1.4. At the flip the dispatch sends every mode to the store version, which
never reads a candidate branch or a staged checkout, so a cut today's machine has staged and not landed is landed or
cleaned up before the flip (§ 18, the cutover). The deletion pass removes § 1.5 in its order.

**Compatibility.** Under the pre-public-release posture the schema, the kind, and the flags change in place, and no
alias or migration reader ships. A version-3 map refuses from the flip, naming `--preflight`.

**User-facing impact.** Before the flip, `arc decompose --help` lists `--revise` and `--discard`, which refuse, and
`--finish` without its map refuses with a typed remedy rather than Commander's error. From the flip: the cut's members
appear as stubs before approval; `--finish` previews and lands either shape; a cut can be revised or discarded; and
nothing is committed, pushed, or merged by the cut.

## Success Criteria

1. **Nothing a cut does changes before the flip.** Every decomposition test passes over the in-repo implementation,
   unchanged but for the lists the new modes, the `cut-map` schema, and the cut-map kind join; the dispatch sends no
   invocation to the store version; `--revise` and `--discard` refuse `unsupported`, and `--finish` without its map
   refuses, each naming what serves; and the locator move leaves version 3's decode tests and the scanner's unchanged
   and passing.
2. **A retirement runs end to end on the reference backend:** `--preflight`, `--execute`, authoring through write-back,
   `--finish`, and `--finish --apply`. The additive batch writes the members, their copies, the cohort documents with
   their Purpose, and the stored map in one batch; the terminal batch writes `decompose` lineage carrying
   `retiredBranches`, removes the origin's primary and the stored map, rewrites stub dependents, writes home edges, and
   under `at-cap` appends the fan-out block, in one batch; and the teardown step after it completes over the lineage
   record, as does `arc teardown <origin>` after that step fails.
3. **An extraction runs end to end on the reference backend:** `--extract` and `--finish --apply` thin the origin's
   draft or spec to its kept units, set its `Cohort` to the members' path under every placement but `direct-member`,
   rewrite stub dependents, and remove the stored map, writing no lineage.
4. **A discard leaves the members only in `history`,** and a revision adds and removes stubs and cohort documents, moves
   only seeded edges and `Cohort`, and replaces the stored map; after a changed origin, `--revise` emits the complete
   revised map when the only change is to the content of units allocated `drop` or, in an extraction, kept by the
   origin, or to the source kind, and otherwise a fresh starter with the stored authoring beside it and the first place
   to reauthor.
5. **Each refusal of § 14 fires where its condition holds and the cut completes after its remedy,** the held-entry
   refusals under a supplied grammar; a stale apply authority refuses every removing batch; and `lineage.cut-in-flight`
   refuses abandoning an origin holding a stored map, an abandonment after the discard succeeding; and `--finish` on a
   landed cut, in either shape, reports it landed (§ 8.7). The records § 10's races leave, which no verb clears today,
   are outside this criterion.
6. **A cut's reads stay flat:** over the reference backend, each batch reads the origin's group, the selected cohort
   documents, the existing homes, and the dependents the listing names, each a fixed number of times, and the `history`
   of the stored map and of each item a member's slug finds once per run, none of those counts growing with the
   repository's history or branch count (§ 8.1), and nothing from Git but the locus reads of § 11.
7. **The kind and schema are registered:** `work-item/cut-map` passes the store's conformance suite as a registered
   kind, the in-repo implementation refuses its writes `unsupported`, and `arc schema get cut-map` publishes version 4
   beside `decompose-cut-map` version 3.
8. **The ratchet holds.** At landing no `store-raw-state`, `surface-names`, or `work-unit-paths` count in
   `eslint-suppressions.json` exceeds its count at the final merged base, in total or per file, no module under
   `lib/decompose/` holds an entry, and `npm run -s lint:ts` passes with no suppression added for a new violation.
9. **Destination conservation follows ordinal locator resolution (A1).** A target locator that no longer resolves
   refuses, naming its allocation and a revision; an earlier matching heading that takes its saved ordinal passes,
   as does an authored body change that leaves the locator resolvable. Retirement and extraction use this same rule,
   and a revision can name a different current target locator (§ 8.4).

10. **Atomic observations and inventory (A4).** Every cut batch admits its version/conflict observations and relevant
    inventory atomically with its exact writes. Competing changes to observed evidence, conflict sets, source/removal
    group membership, incoming dependencies, or outgoing provider identities refuse without persistence; fresh
    acquisition and approval complete after repair. Unrelated record/content writes and irrelevant new owners do not
    invalidate the cut. Additive retains unrelated conflicts without writing them. Member authentication and read counts
    remain bounded: at most one preparation history pass and one atomic admission history pass over the stored map and
    each currently resolved member, independent of unrelated history and branch counts. This supersedes the once-per-run
    history-count clause of original criterion 6; it preserves its other bounded-read and Git-isolation requirements.

11. **Retired member identity survives name reuse (A5).** Complete backend-generated work-item/cohort birth receipts
    survive history/changes, reopen, removals, saved states, net-zero history and sync without certifying partial lists.
    Failed batch admission publishes none. A revision dropping an internal seed removes its original retirement
    replacements through the cut member's UID across multiple later retired name holders, while preserving groomed
    dependencies from an unrelated exact-name terminal holder. A member-name drop/re-add selects its new binding;
    unavailable, ambiguous and malformed evidence grants no removal authority. After supported evidence or edge
    settlement is repaired, fresh preparation and approval complete. Member selection and atomic history remain
    bounded by criterion 10; original primary histories are not searched to discover retired generations.

12. **Selected cut bindings survive merged history (A5).** The strict stored wrapper keeps the selected map and its
    member/cohort bindings together while the externally authored map stays unchanged. A selected generation remains
    authenticated across either-side merges, unrelated omissions/removals, rename and revision/reversion; name
    drop/re-add and cut removal/recreation derive fresh bindings. Reused cohorts gain no ownership. New bindings
    require matching backend candidate births and a changed wrapper; retained keys cannot recreate a generation.
    Preparation and atomic admission derive new keys from the same canonical complete before-history ID population;
    missing evidence refuses, and restored supported evidence plus fresh approval completes. No-op writes create no
    generation/key. No primary-history discovery, extra map write, generic ancestry API or global index is added.

## Open Questions

None remains in the A5 generation-binding direction. The expected contracts in § 18 retain their stated availability
conditions; native implementation and conformance evidence remain required before cutover.

## Amendments

- **A1** — 2026-10-19 — design: destination conservation uses ordinal locator resolution.
  _Supersedes:_ § 8.4 ¶1. _Trigger:_ F1 review. _Work:_ review-fix. _Revalidated:_ review-fix.
- **A2** — 2026-10-19 — design: surviving removal edges are checked at atomic batch admission.
  _Supersedes:_ § 9.3 ¶2. _Trigger:_ F1 review. _Work:_ review-fix. _Revalidated:_ review-fix.
- **A3** — 2026-10-19 — design: lineage lookup resolves authenticated retired former names without history scans.
  _Supersedes:_ § 3.2 outgoingEdges. _Trigger:_ F2 review. _Work:_ review-fix. _Revalidated:_ review-fix.

- **A4** — 2026-10-19 — design: batches guard observations atomically. _Supersedes:_ § 4 ¶2; § 8.5 pre-batch; § 8.6 ¶2;
  § 8.7 ¶1; § 9 ¶1; criterion 6. _Trigger:_ SEAM-1 review. _Work:_ review-fix. _Revalidated:_ review-fix.

- **A5** — 2026-10-20 — design: birth receipts and stored bindings preserve cut-owned generations.
  _Supersedes:_ § 4, 8.3, 8.8, 9.2. _Trigger:_ REVISION-R1-1 review. _Work:_ review-fix. _Revalidated:_ review-fix.

---
