# Spec (`detailed` · `RFC`): Decompose Transform Integrity

- **Origin:** [internal]

- **Purpose:** Make retirement decomposition a trustworthy, low-friction transform over ARC's real planning
  topology: conserve the exact source, preserve settled planning authority, publish a durable logical anchor, and
  produce a base-rooted result whose transition can be validated without operator-authored proof.

---

## Introduction / Context

ARC's decomposition workflow describes a result that the current transform cannot yet produce reliably. A started
work unit normally has branch-private planning authority while the integration base retains an earlier backlog
projection. The current symmetric transform mixes those projections, scaffolds only draft-stage members, and makes
later consumers reconstruct transition authority independently.

This work unit owns the minimum trustworthy retirement core. It closes one versioned contract from read-only
preflight through exact-base result creation, semantic authoring, finalization, commit, project projection, and
receipt-backed teardown eligibility. It also publishes the stable topology and continuation facts needed by
post-merge launch orchestration without creating a scheduler.

Four cohort members own separable extensions:

- `decompose-base-mobility` admits append-only committed-unlanded refresh and descendant-base landing.
- `decompose-extraction` adds the additive result and explicit source-finish transform.
- `decompose-planning-lane` adds the optional host-side planning-lane exception.
- `decompose-durable-consumers` improves historical narrative reconciliation, receipt enumeration, and remote
  teardown.

The core remains useful without any extension: ordinary decomposition stays reviewed, the candidate is exact-base
landable, the project view converges, and operators receive one durable origin-addressable anchor and launch
handoff.

## Goals

1. Resolve an exact committed source and exact base-rooted result before mutation.
2. Refuse unaccounted retirement delta and conserve every source allocation exactly once.
3. Inventory nested Markdown as stable, disjoint H2-H6 units without adding an authoring language.
4. Preserve reviewed draft or spec authority, including direct child entry at `generate-tasks`.
5. Materialize required cohort topology without inventing semantic coordination content.
6. Finalize one canonical v3 receipt idempotently and refresh only approved, fully staged, uncommitted refinement.
7. Give commit validation, project-readiness projection, and exact-base lifecycle consumers one typed authority.
8. Publish a durable logical anchor, exact entry set, and typed initial-continuation disposition for post-merge
   launch orchestration.
9. Keep deterministic proof and recovery in typed library/CLI code while retaining one human distribution
   interlock over authored semantics.
10. Exercise the core through realistic Git topology and the complete installed hook chain.

## Non-Goals

- Define the judgment for when to decompose or how to choose a cohort beyond the anchor invariant.
- Support multi-member cohortless fan-out. Every multi-member decomposition has a durable logical anchor.
- Transport arbitrary source-branch riders or turn the cut map into a patch carrier.
- Add extraction, source thinning, committed-unlanded refresh, descendant-base landing, or remote-ancestry
  cleanup.
- Add the optional planning-lane classifier, `arc-cleared` workflow, CODEOWNERS exception, or host setup recipe.
- Add decomposition-receipt migration, backward-compatible decomposition authoring, receipt expiry, compaction,
  acknowledgement, cache, pending-state, rollback-ledger, or scheduler records.
- Consolidate the ROADMAP renderer family or build a generic record-to-projection engine.
- Add partial-spec, `create-spec`, ready-to-activate, mixed-maturity, or arbitrary artifact-bundle entry modes.

## Proposed Design

### D1. Replace decomposition evidence with one closed v3 contract

New decomposition authoring, preparation, finalization, and authority use schema v3 only. ARC is pre-release and
has no external installations whose historical decomposition receipts require compatibility. Existing
repository-owned v1/v2 decomposition records are current self-hosting inputs to reference reconciliation, so they
cannot be deleted blindly. Implementation first resolves any live reference or cleanup obligation they still
carry, then deletes those development records and decomposition-only fixtures/branches. No migration reader,
upgrader, alias, startup cleanup, or compatibility layer is added.

The retirement receipt substrate is shared with rename, abandon, and park. Those current transitions still author
and consume the existing generic receipt versions; changing their contract is unrelated scope. The shared codec
retains only the behavior those non-decompose transitions and any still-live records require. A v1/v2 receipt with
`transition: decompose` grants no new authoring, finalization, projection, landing, publication, or cleanup
authority.

V3 defines four closed shapes:

- `V3DecomposeStarterMap` is machine output with explicit incomplete operator slots.
- `V3DecomposeCutMap` is the fully authored input accepted by preparation.
- `V3DecomposeContinuationInput` is the ephemeral post-authoring selected-slugs-or-none choice supplied to
  finalization.
- `V3DecomposeReceipt` is the canonical finalized retirement authority.

Starter and completed maps share one closed envelope:

```text
schemaVersion: 3
machine:
  preflightId
  source: { origin, kind, logicalBranch, ref, head }
  resultBase: { ref, head }
  planningProfile
  sourceUnits[]
  incomingEdges[]
  outgoingEdges[]
authoring:
  shape
  placement
  destinations
  internalEdges
  sourceAllocations[]
  incomingDispositions[]
  outgoingDispositions[]
```

`machine` is identical in starter and completed bytes. In the starter, unknown-cardinality `shape`, `placement`,
`destinations`, and `internalEdges` are whole-field `{ "status": "author" }` slots. `sourceAllocations` has one
machine-identified element per `sourceUnit`; ownership and disposition are separate author slots. Incoming and
outgoing disposition arrays likewise have one machine edge identity apiece and one author slot. The completed map
replaces every slot with its concrete closed value while retaining the same machine identities and ordering.
Completed-map parsing rejects every placeholder, missing/extra identity, unknown field, and operator change to
`machine`.

The nested map records are closed:

```text
planningProfile:
  kind: draft
  sourceDesign: [] | [<draft basename>]
| kind: single-spec
  sourceDesign: [<spec basename>]
| kind: paired-spec
  sourceDesign: [<PRD basename>, <RFC basename>]

sourceUnit:
  sourceId
  sourcePath
  sourceLocator
  contentDigest

incomingEdge:
  edgeId
  dependent
  currentTargets[]

outgoingEdge:
  edgeId
  prerequisite

placement:
  kind: direct-member
| kind: cohort
  cohort: <one-segment cohort path>
| kind: subcohort
  cohort: <two-segment cohort path>
| kind: at-cap
  parent: <two-segment cohort path>

destination:
  kind: new-member
  destinationId
  slug
  workClass
| kind: existing-home
  destinationId
  target: <work-unit | draft-block | document target>
| kind: cohort-coordination
  destinationId
  cohort: <cohort path>

sourceAllocation:
  sourceId
  ownership: <destination-owned | cohort-shared | author slot>
  disposition: <target | drop | author slot>

target:
  kind: target
  destinationId
  targetLocator
| kind: drop
  reason

incomingDisposition:
  edgeId
  disposition:
    kind: replace
    replacementTargets[]
  | kind: drop
    reason
  | <author slot>

outgoingDisposition:
  edgeId
  disposition:
    kind: targets
    targets[]
  | kind: drop
    reason
  | <author slot>
```

Work-unit targets are `{ kind: "work-unit", slug }`; draft-block targets add the v3
hierarchy-qualified `locator`; document targets are `{ kind: "document", path }`. `targetLocator` uses the same v3
locator domain. Internal edges are `{ from, to }`. `edgeId` is the canonical digest of
`{ schemaVersion: 3, kind: incoming, dependent, currentTargets }` or
`{ schemaVersion: 3, kind: outgoing, prerequisite }`. `currentTargets`, replacement/target slug arrays, and every
identity array are unique and UTF-8 byte-sorted; the paired design array alone preserves semantic PRD-then-RFC
order. Machine source units and edges sort by ID, destinations by `destinationId`, internal edges by `(from, to)`,
and the three authored identity arrays by their copied `sourceId` or `edgeId`. Candidate-publication entries are
derived by iterating that canonical destination order, omitting `cohort-coordination`, and mapping every remaining
destination to exactly one `new-leaf` or `existing-destination` entry. The stored entry no longer needs to carry a
new member's `destinationId`; its order remains rederivable from `completedMap`.

Canonical identity preimages are exact:

```text
receiptId = digest({
  schemaVersion: 3,
  subject: { kind: work-unit, name: machine.source.origin },
  transition: decompose,
  sourceBranch: machine.source.logicalBranch,
  sourceHead: machine.source.head
})

preflightId = digest({
  schemaVersion: 3,
  source,
  resultBase,
  planningProfile,
  sourceUnits,
  incomingEdges,
  outgoingEdges
})

cutMapDigest = digest(V3DecomposeCutMap)
allowedPathsDigest = digest(allowedPaths)
topologyDigest = digest(topologyFacts)
transitionPatchDigest = digest(transitionPatch)

sourceArtifactDigest = digest({
  schemaVersion: 3,
  kind: source-artifact-inventory,
  entries: [
    {
      path,
      objectKind: blob,
      mode: 100644 | 100755,
      contentDigest: digestBytes(exactStoredBlobBytes)
    },
    ...
  ]
})

sourceInventoryDigest = digest({
  schemaVersion: 3,
  kind: source-unit-inventory,
  entries: machine.sourceUnits
})

incomingEdgeInventoryDigest = digest({
  schemaVersion: 3,
  kind: incoming-edge-inventory,
  entries: machine.incomingEdges
})

outgoingEdgeInventoryDigest = digest({
  schemaVersion: 3,
  kind: outgoing-edge-inventory,
  entries: machine.outgoingEdges
})
```

Every `digest()` operand is canonical JSON over exactly the shown closed value. A digest field never hashes itself.
Source-artifact entries cover the complete committed source artifact family exactly once and sort by UTF-8 path;
their bytes are Git stored bytes after clean filters, never checkout bytes. The three machine inventory arrays use
their already-canonical ID ordering without a second normalization. The source/result refs, not checkout paths,
enter machine identity.

`V3DecomposeContinuationInput` is closed canonical JSON containing only
`{ "kind": "selected", "slugs": [...] }` or `{ "kind": "none" }`. Selected slugs are unique and ordered by the
candidate publication; the input carries no receipt, object, path, readiness, or approval claim.

The public v3 authoring domain is closed. `machine.source.kind` is `started-planning` or `backlog-stub`;
source lifecycle is machine identity, not an operator-authored shape. `authoring.shape` is `symmetric` or
`heterogeneous`, `authoring.placement` is `direct-member`, `cohort`, `subcohort`, or `at-cap`, and destinations
are only `new-member`, `existing-home`, or `cohort-coordination`. A symmetric map has at least two new members
and no existing home. A heterogeneous map has at least one new member and at least one existing home. Public
starter maps, completed maps, preparations, and receipts have no `surviving-origin` destination and no extraction
shape. The reusable topology planner may separately accept an internal extraction constituent with one surviving
origin; that DTO is not accepted by the decomposition CLI, cut-map codec, preparation, or receipt codec.

Section locators contain `artifact`, `kind: section`, `level`, `headingSource`, `ancestry`, and `occurrence`.
`level` is 2-6. Each ancestry entry is `{ level, headingSource, occurrence }`, ordered outermost to innermost.
Heading text uses the existing canonical normalization. A stack removes headings at or below the next heading's
level before assigning its parent, so legal level jumps remain stable. Occurrence is zero-based among equal
normalized headings with the same level and exact parent identity.

Markdown inventory is a disjoint exhaustive byte sequence:

1. Content before the first H2 is the preamble.
2. Every recognized H2-H6 begins a unit ending before the next recognized H2-H6.
3. A parent's unit contains its lead content only; nested headings begin separate units.
4. Existing fence, HTML, quote, and list protections continue to suppress incidental heading syntax.
5. Non-Markdown artifacts remain whole-file units.

`sourceId` is the canonical digest of `{ schemaVersion: 3, sourcePath, sourceLocator }`; content digest is a
separate binding. Every source unit is allocated exactly once or explicitly dropped with a reason.
`destination-owned` material has one authoritative new member or existing home. `cohort-shared` is limited to
ownerless sequencing, constraints, provenance, and closeout content; it cannot carry task-driving design.

Preparation uses a v3-specific closed record in the shared retirement-record namespace:

```text
V3DecomposePreparation:
  kind: prepared-decompose
  schemaVersion: 3
  receiptId
  preparationId
  facts:
    preflightId
    completedMap
    cutMapDigest
    sourceArtifactDigest
    sourceInventoryDigest
    incomingEdgeInventoryDigest
    outgoingEdgeInventoryDigest
    allowedPaths[]
    allowedPathsDigest
    candidateOwnership
    candidatePublication
    topology: { facts[], digest }
    prospectiveProjection:
      overlay: { origin, sourceBranch, planId }
      roadmap: { path, before, after }
```

`completedMap` is the exact canonical `V3DecomposeCutMap`; its immutable machine envelope therefore carries source,
result base, planning profile, source units, and dependency inventories. `candidatePublication` is the exact
logical anchor and ordered entries without continuation. Topology facts are one `{ kind: "none" }` fact or an
ordered unique-path list of `{ kind, path, before, after }`, where `kind` is `create`, `ensure`, `backfill`, `reuse`,
or `append`; `reuse` has equal states and every write action differs. `topology.digest` is `topologyDigest`. The
ROADMAP observation is one managed path state transition; its overlay binds only the origin, source branch, and
exact plan.

`candidateOwnership` is closed:

```text
kind: claimed
protection: full
claimId: <exact repository-common claim key>
generation: <exact claim generation>
candidateBranch: <exact local branch>
candidateWorktree: <opaque registered-worktree identity>
| kind: not-applicable
protection: partial
```

The full arm is copied from the operational claim created before preparation; the partial arm is fixed by the
validated execution mode. Configuration or claim-store state observed later cannot select a different protection
arm, key, or generation. `candidateWorktree` is a stable claim identity, never an absolute host filesystem path;
it is the canonical digest of
`{ schemaVersion: 1, kind: decomposition-candidate-worktree, claimId, generation }`. Only the machine-local claim
record maps that identity to a reserved or registered path, and that adapter mapping is never copied into
preparation or receipt authority.

The remaining identity preimages are:

```text
planId = digest({
  schemaVersion: 3,
  preflightId,
  cutMapDigest,
  allowedPathsDigest,
  candidatePublication,
  topologyDigest
})

preparationId = digest({
  schemaVersion: 3,
  receiptId,
  planId,
  resultBaseHead: completedMap.machine.resultBase.head,
  sourceArtifactDigest,
  sourceInventoryDigest,
  incomingEdgeInventoryDigest,
  outgoingEdgeInventoryDigest,
  cutMapDigest,
  allowedPathsDigest,
  candidateOwnership,
  candidatePublication,
  topologyDigest,
  prospectiveProjection
})
```

The finalized v3 record is also decomposition-specific rather than an extension of the generic v1/v2 result arm:

```text
V3DecomposeReceipt:
  kind: decompose-receipt
  schemaVersion: 3
  receiptId
  preparationId
  prepared: <exact V3DecomposePreparation.facts>
  finalized:
    destinationDigests[]
    managedPathResults[]
    transitionPatch[]
    transitionPatchDigest
    publication:
      logicalAnchor
      entries[]
      initialContinuation
```

`prepared` is byte-for-byte equal to preparation `facts`. `destinationDigests` is unique and sorted by
`destinationId`; each entry is `{ destinationId, digest }`, where `digest` hashes
`{ destinationId, outputs: [{ path, after }] }` over that destination's UTF-8 path-sorted managed outputs.
`publication.logicalAnchor` and `entries` are byte-for-byte equal to `candidatePublication`; finalization adds only
`initialContinuation`.

`allowedPaths` is the complete authorization and validation closure, including the receipt path, changed
destinations, and unchanged managed topology observations such as `reuse`. The finalized receipt adds destination
digests and unique UTF-8 path-sorted `managedPathResults` for every non-receipt allowed path. Each result is
`{ path, before, after }`; a path state is `absent` or a regular file with stored-byte digest and mode `100644` or
`100755`. `before` is always the prepared result-base tree state and `after` is the pinned candidate result, never
an operational retry preimage. A mode-aware `transitionPatch` is exactly the ordered subset whose `before` and
`after` differ. Equal states are required for the complementary unchanged subset and forbidden in patch entries.
The receipt path is excluded from both result sets to avoid recursive identity. Symlinks, submodules, unknown
object types, uncovered paths, overlapping changed/unchanged classifications, and unexpected mode changes refuse.

`receiptId` remains stable for one exact source transition. `preparationId` additionally binds the exact result
base, claim key/generation, candidate publication, constitutive topology, prospective projection, and all prepared
inventories and paths. The shared namespace decoder first discriminates the v3 decomposition record by
`schemaVersion` plus `kind`; it never parses it through the generic v1/v2 result arm. The closed decoder recomputes
every identity, digest, ordering, prepared-fact equality, result partition, and patch invariant before granting
authority.

Complete retirement-record enumeration carries three explicit authenticated arms: retained generic receipt, v3
decomposition preparation, and v3 decomposition receipt. Old v1/v2 decomposition preparations are not a retained
arm. A v3 preparation is nonterminal and contributes no reference transition or dependent disposition. A v3
receipt projects its retired subject from `prepared.completedMap.machine.source.origin`; reference reconciliation
exposes the same closed `decompose` transition used by current consumers. Dependent-disposition queries join the
requested dependent to the canonical machine incoming edge, then join its `edgeId` to exactly one authored incoming
disposition and return that closed replace/drop value with fixed `tree-only` evidence quality. Missing, duplicate,
or inconsistent joins make the authenticated record invalid rather than degrading to absent. Existing generic
rename, abandon, and park projections remain unchanged. The child durable-consumer work extends enumeration reach
and historical narrative; it does not own this baseline shared-namespace compatibility.

### D2. Build one read-only source and result plan before mutation

`arc decompose <origin> --preflight` reads the exact committed source from configured Git refs in any attached
project checkout. It emits only canonical starter-map JSON on stdout; diagnostics and warnings use stderr.
Refusal exits nonzero and emits no partial JSON. Uncommitted source bytes never enter evidence.

Source selection is closed and checkout-independent. Resolve configured `branch.base` as the exact local
`refs/heads/<branch.base>`, then enumerate only local `refs/heads/*` other than that base as committed source
candidates. Remote-tracking refs, worktree pseudo-refs, fetch, and the invocation checkout's current branch are
never candidates or fallbacks. A non-base ref qualifies only when its committed tree contains exactly one
supported `.arc/active/meta-<slug>.md` for the requested origin with `State: Planning` and `Branch` exactly equal
to that ref's short name. Exactly one qualifying non-base ref wins and yields `source.kind: started-planning`.
Zero qualifying non-base refs may fall back to the configured base only when that tree contains exactly one
supported predecessor for the origin: either an active Planning meta whose `Branch` equals the base, or a
provisional/planned backlog meta whose `Branch` is absent or `[none]`. The latter yields `backlog-stub`; the
base-branch active form yields `started-planning`.

More than one qualifying non-base candidate, multiple supported origin paths in one candidate tree, a branch
self-identity mismatch, or an incompatible base/source predecessor refuses. Local aliases at the same commit are
still distinct candidates and qualify only through their own exact `Branch` self-identity, so divergent
self-authenticating candidates refuse rather than winning by ref order. The selected committed tree supplies
metadata, content, and dependency truth; attached worktrees and the invocation locus cannot change the result.
Before starter emission, that same tree also produces the closed D3 `planningProfile` from its exact metadata and
design-artifact inventory. Starter construction accepts no caller-supplied or placeholder profile. Completed-map
revalidation rereads the tree and rederives the same profile with the other machine inventories before comparing
`preflightId`.

`arc decompose <origin> --cut-map <path>` validates the completed map and builds one ephemeral
`ValidatedDecomposePlan` before any branch or filesystem action. The plan binds:

- exact source branch/head and result-base head;
- content and incoming/outgoing dependency inventories;
- exhaustive allocation and ownership;
- source/result placement and writable destination path states;
- predecessor action and retirement-only delta;
- planning profile and output metadata tuples;
- cohort topology actions;
- exact allowed paths and recovery facts.

A canonical managed-path registry closes overlap before branch creation. Every plan-owned path appears exactly once
with one base prestate and either an exclusive role or one composed mutation. Receipt/evidence paths, retiring
source/predecessor paths, and ROADMAP are exclusive and cannot also be an author destination, topology path, or
dependency target. A composed mutation carries an ordered contributor list and one final state:

1. topology structure;
2. destination/allocation or existing-home content in canonical
   `(destinationId, contributorKind, contributorIdentity)` order, where a scaffold's identity is its artifact role
   and an allocation's identity is `(sourceId, targetLocator)`;
3. dependency transformations in canonical `edgeId` order.

Each contributor consumes the exact prior contributor's after-state. Multiple whole-file content owners,
incompatible modes/object kinds, duplicate role ownership, a contributor that cannot apply to the prior state, or
any exclusive-path collision refuses before occupation. The registry derives the unique sorted `allowedPaths`;
separate planners may produce contributors but only the final one-entry-per-path mutation table reaches
materialization.

A retiring source is compared with its source/result merge base. Expected origin-artifact evolution, unchanged
base-ancestor predecessor removal, derived ROADMAP movement, and paths already identical on the result are
accounted. Every other nonidentical source-private path is a rider and refuses by exact path. The cut map cannot
absorb it.

Under full protection the driver creates or resumes `chore/decompose-<origin>` at the validated base. An absent
branch may be created; an existing branch resumes only when its exact source/base/map candidate binding matches.
Under partial protection the validated base checkout must have a clean relevant index and worktree.

The full-protection candidate is an intentional transient locus, not unowned branch residue. Its occupation uses
the shared transient identity/claim substrate so in-flight and cleanup readers recognize exact recorded ownership
rather than trusting the `chore/decompose-*` prefix. That claim carries operational branch/worktree ownership only;
it is not decomposition evidence, a pending transform record, or semantic approval. Landing or exact discard
retires only the matching claim key and generation. Preparation copies the exact completed
key/generation/branch/worktree into its `candidateOwnership`; this correlation does not turn the claim into
semantic evidence.

The store is repository-common and machine-local at
`<git-common-dir>/arc/transient-claims/<claimId>.json`. Its logical key is:

```text
claimId = digest({
  schemaVersion: 1,
  kind: decomposition-candidate,
  origin,
  candidateBranch
})
```

One closed record exists per key:

```text
schemaVersion: 1
kind: decomposition-candidate
claimId
generation: <positive integer, monotonic for this claimId>
binding: { origin, candidateBranch, sourceHead, resultBaseHead, cutMapDigest }
candidateWorktree: digest({
  schemaVersion: 1,
  kind: decomposition-candidate-worktree,
  claimId,
  generation
})
registration:
  kind: unregistered
| kind: intended
  path: <canonical absolute machine-local path>
| kind: registered
  path: <canonical absolute machine-local path>
| kind: released
  lastPath: <canonical absolute machine-local path>
state:
  kind: pending
| kind: occupied
| kind: terminal
  terminal:
    kind: landed
    receiptId
    candidateHead
  | kind: discarded
    planId
    candidateHead
```

The registration arm is adapter-only operational state in the same machine-local claim record; its path never enters
`claimId`, `candidateWorktree`, preparation, or receipt identity. A repository-common lock plus atomic replacement
serializes each key. `acquire(claimId, binding)` creates generation one with deterministic `candidateWorktree` and
`unregistered`, resumes the same pending/occupied generation only for an exact binding, advances a terminal record
only after its registration is `released` and its old candidate branch/worktree occupation is absent, and otherwise
returns `conflict`.

`pending/unregistered` is a valid pathless crash-recovery state after `acquire` and before reservation. An exact
binding retry may continue only by reserving its path; it grants no authority to inspect, adopt, or delete any
filesystem location. A pre-acquire refusal leaves no claim. A failure after successful acquire preserves this
generation unless an explicit exact-generation rollback compare-and-swap proves that no reservation, branch,
worktree, marker, or other observer can exist.

Before branch or filesystem mutation, `reserveWorktree(claimId, generation, path)` changes exact `unregistered` to
`intended` and is idempotent only for the same canonical path. Candidate creation writes the exact
`{ claimId, generation, candidateWorktree }` tuple into the machine-local ARC worktree marker.
`occupy(claimId, generation, path)` accepts only the reserved path registered by Git to the exact candidate branch
and expected head with that matching marker, then atomically changes `intended/pending` to `registered/occupied`;
retry of the matching registered/occupied pair is idempotent. On restart, `intended` is the sole authority to inspect
that path: an absent candidate may be recreated, an exact registered branch/head with an absent marker may be
completed, and any foreign bytes, branch, head, registration, or marker conflict refuses without adoption.

`retire(claimId, expectedGeneration, terminal)` returns `retired`, `already-retired-matching`, `conflict`, or
`missing-unproven`. It changes only the exact current pending/occupied generation, preserves the matching terminal
record for idempotent retry, and never treats file absence as completion. The single latest record is the retention
bound. After exact local cleanup, `releaseWorktree(claimId, generation, candidateWorktree, path)` changes only a
matching terminal `registered` mapping to `released` after the Git registration, marker, and branch occupation are
absent; retry is idempotent. A later successful acquire replaces only that released terminal with generation plus
one, after which an old retry is `conflict`. Malformed records or mappings fail closed and are never overwritten as
absent.

One driver operation consumes `ValidatedDecomposePlan` and owns branch occupation, post-occupation revalidation,
mutation, staging, and preparation. No later layer re-derives plan authority. The source remains read-only.
Full-protection failure leaves the exact named candidate and returns a retry or discard command. Partial-protection
failure restores only transform-owned paths from captured preimages.

Discard is explicit and typed:

```text
arc decompose <origin> --discard <cut-map>
```

It revalidates the same source, map, deterministic candidate branch, and uncommitted candidate binding before
retiring the exact generation as discarded. Only retired or already-retired-matching authority grants deletion of
that transform-created candidate; exact cleanup then releases its worktree registration. A crash between retirement,
cleanup, and release resumes from the terminal generation, and only the matching discarded terminal plus released
registration proves an already-completed discard. It never deletes a changed or foreign branch and never removes
finalized receipt evidence. No opaque token or durable pending record is introduced.

### D3. Preserve planning maturity and materialize topology

One homogeneous planning profile is inferred for all new members:

| Completed authority at the cut | New-member output                          | Entry workflow   |
| ------------------------------ | ------------------------------------------ | ---------------- |
| No finalized reviewed spec     | Complete `draft-<member>.md`               | `draft-design`   |
| Finalized reviewed spec        | Complete single or paired member spec      | `generate-tasks` |

A mature profile is valid for one conventional finalized spec or the sanctioned PRD/RFC pair named by source
metadata and present in the exact inventory. Every member mirrors the source family. Existing-home destinations
retain their lifecycle state and do not participate in homogeneity.

Member specs are complete, self-contained semantic projections. Task-driving authority has one destination;
context may repeat for self-containment, while genuinely ownerless coordination belongs in the cohort document.
There is no `create-spec` entry.

An approved structural task skeleton may be allocated into `tasks-<member>.md`. It remains provisional:
metadata records `Task List: [none]`, and ordinary `generate-tasks` may retain, rewrite, or discard it.
Only task-list finalization sets the pointer.

Every new-leaf meta produced by decomposition carries one managed optional transitional field immediately after
`Review Rubric`: `Decomposition Receipt: <canonical receiptId>`. Its field descriptor is omit-when-absent rather
than default-backed: parsing returns absent when the marker is missing, ordinary rendering emits it only from an
explicit supplied value, and reconciliation never backfills it. Reconciliation preserves a present marker at its
canonical position, while decomposition tuple validation rejects duplicates or misplaced markers. The field is
absent from ordinary meta templates, ordinary rendered metas, and existing-home destinations.

The canonical receipt ID is fixed by the source transition before destination bytes are materialized; publication
determines which new-leaf tuples receive it but does not feed that identity. Destination digests and the receipt
path likewise do not feed the ID. The field alone grants no receipt, publication, start, or cleanup authority.

`arc start` preserves a valid recorded planning workflow. If `Decomposition Receipt` is absent, ordinary planning
policy remains unchanged, including `create-spec`. If present, start first decodes the canonical ID, loads that
exact receipt path from the pinned configured-base tree, and requires the shared exact-base
`DecompositionIntegrationAnchor` to validate its landed receipt/publication relation. The anchor producer is
available before start and is reused later by handoff and cleanup; start never builds a private landing validator.
The publication must name this slug as a `new-leaf` with the exact bound planning profile and artifact family. Start
then admits only draft/`draft-design` or all-spec/`generate-tasks`; an inconsistent design/workflow/task tuple
refuses before mutation. If the recorded workflow is absent, it derives `generate-tasks` from all-spec authority
and `draft-design` from draft or absent authority.

The read-only start preflight produces one `ValidatedGraduationTransaction` containing the exact source artifact
snapshot, destination absence/prestates, branch/worktree occupation operands, and complete target bytes and modes.
Before mutation, the preflight applies the existing managed-field reconciliation model to the source meta and
records the exact ordered `backfilled` field list. It then composes phase, the preserved/derived workflow,
`Next Action`, every other existing soft-field ceremony change, an explicitly supplied `--class` replacement when
requested, and removal of `Decomposition Receipt` into the complete target meta bytes. Without `--class`, the
recorded Class is preserved. The optional receipt field is omit-when-absent and is never counted as a backfill.

A start-only `atomicGraduate` executor port owns branch/worktree occupation, artifact relocation, target-byte
writes, index staging, and reverse-order rollback as one encoding leg for ordinary and decomposition-produced
graduates. Start does not use the generic per-file relocation leg or any post-transition meta/class/workflow/soft
field write. Existing lifecycle verbs keep their current forward-recovery behavior.

The atomic port returns success only after exact destination/index parity is established. A refusal changes
nothing; an application failure completes rollback to the captured source/index/worktree/branch preimages before
returning failure. Failure to complete rollback is a typed `graduation-recovery-required` result carrying only the
exact established residue and never a successful or partially authoritative Planning transition. Successful start
preserves the existing `GraduateResult` success contract: `backfilled` is the precomputed reconciliation list and
`notice` uses the existing exact backfill notice or `null`. The command result gains only the typed
recovery-required arm for incomplete rollback; fully rolled-back failures retain the ordinary rejected result.
Successful decomposition start therefore removes the marker in the same transaction that relocates the member;
after success the member is ordinary Planning authority and may progress through its recorded workflow normally.

The reusable topology planner receives already-decided placement; it never chooses whether or how to group. It
returns exact coordination and optional parent paths plus typed actions:

- create a canonical explicitly incomplete cohort doc;
- ensure or backfill a missing parent doc;
- reuse an existing doc;
- append exact at-cap provenance;
- or perform no action for an eligible single-member cohortless result.

Every decomposition resolves a logical anchor. A result with exactly one new member and any number of
existing-destination edits may use that direct member; existing destinations do not become newly minted cohort
members. Normal multi-member fan-out uses the origin-named cohort or subcohort. At the nesting cap it uses an
origin-keyed fan-out block under the existing parent coordination doc. A multi-member cut map that resolves
cohortless refuses even when all content is destination-owned.

The topology contributor uses the canonical cohort template with structural identity filled and `Purpose: —`.
It never overwrites an existing doc independently; an explicitly allocated content contributor may compose onto
the same validated path through the managed-path registry. Exact at-cap provenance is idempotent; conflicting
same-origin provenance refuses. Command output reports every coordination and parent path and its disposition.
Finalization refuses missing docs or the exact Purpose sentinel, but it does not require optional prose or invent
semantic content.

### D4. Finalize exact evidence and expose one authority

The post-authoring distribution interlock is the sole semantic approval boundary. It reviews the actual child
drafts/specs/provisional tasks, heterogeneous edits, cohort coordination, allocation, dependency effects, and
initial continuation. Mechanical validation proves completeness and exact bindings; the human judges semantic
fidelity and whether partitioning reopened design.

Finalization enforces mechanics only. Workflow ordering ensures the interlock has occurred; no approval token,
signature, prose classifier, or semantic credential is persisted.

Finalize returns:

- `recorded` for initial sealing;
- `already-finalized` when the exact staged candidate already matches;
- `refreshed` when an approved, fully staged, uncommitted destination refinement changes only recomputable
  destination and transition facts.

Uncommitted refresh requires the receipt to be absent from the candidate parent, exact index/worktree parity for
all relevant paths, unchanged source/allocation/inventories/result-base/dependencies/allowed paths/candidate
ownership, candidate publication/topology, and byte-identical prior `initialContinuation`, with no foreign path.
The supplied continuation must equal the already-finalized value; refresh cannot reopen or replace the interlock's
semantic selection. It recomputes only destination, managed-result, and patch facts, then replaces and stages only
the receipt. Once committed, the core never rewrites or refreshes evidence.

One `validateFinalizedV3Decomposition()` boundary owns closed decoding, source/allocation inventory validation,
target/dependency binding, exact result-base/path preconditions, and mode-aware candidate patch derivation. It
returns canonical authority or one typed mismatch with a stable optional locus. The finalization driver, commit
adapter, transition-overlay adapter, and exact-base integration-anchor adapter consume that result.

The hook adapter owns Git/index/parent reads and passes normalized facts into pure policy. One exact v3
decomposition addition is accepted; malformed, multiple, obsolete-decompose, modified, deleted, or rider-bearing
decomposition evidence refuses. Existing non-decompose transition policy stays on its current shared receipt
contract. The core does not admit committed same-path refresh—that belongs to `decompose-base-mobility`.

One recovery mapper translates typed mismatches to `retry`, `discard`, `re-preflight`, or `reauthor`. It can
render only candidate, cut-map, path, and receipt facts actually established by validation.

### D5. Publish durable decomposition and project-transition facts

Every finalized retirement receipt includes one closed `DecompositionPublication`:

```text
logicalAnchor:
  kind: direct-member
  slug: <new-leaf slug>
| kind: cohort
  cohort: <one-segment cohort path>
| kind: subcohort
  cohort: <two-segment cohort path>
| kind: at-cap-fanout
  parent: <two-segment cohort path>
  origin: <retired origin slug>
entries:
  - kind: new-leaf
    slug: <work-unit slug>
  - kind: existing-destination
    destinationId: <stable destination identity>
    target:
      kind: work-unit
      slug: <work-unit slug>
    | kind: draft-block
      slug: <work-unit slug>
      locator: <v3 hierarchy-qualified locator>
    | kind: document
      path: <managed repository path>
initialContinuation:
  kind: selected
  slugs: [<one or more new-leaf slugs>]
| kind: none
```

The validated plan projects and preparation binds the candidate publication — the logical anchor plus exact
ordered entry set — before authoring. The distribution interlock supplies only `V3DecomposeContinuationInput`;
finalization validates and seals the preparation-bound publication with that continuation, never re-projecting
anchor or entries from the authored candidate. `entries` is unique and ordered by the completed map's canonical
`destinationId` order after `cohort-coordination` destinations are filtered out. Selected slugs must appear in the
same relative order as the resulting new-leaf subsequence. Selected entries must be new leaves that are
launch-ready in the candidate projection; existing destinations cannot be selected. Explicit `none` is a terminal
disposition for this handoff, not persistent scheduling state.

The receipt stores stable logical identity, not a mutable display path or ready/blocked snapshot. Current display
path derives from the logical anchor and current topology. Member metas remain authoritative for membership,
dependencies, priority, workflow, and lifecycle state. Project-record composition returns one lossless
`ProjectReadinessCompositionResult` before any merge or render reduction:

```text
acceptedCandidates[]:
  slug
  path
  lifecycleLocation
  record
rejectedRecords[]:
  slugHint: <path-derived slug | null>
  path
  locus
  reason: unreadable | malformed | unsupported-lifecycle
view: <the ordinary composed project-readiness view>
```

Accepted candidates remain an ordered list, so duplicate records for one slug are preserved rather than collapsed
by the ordinary view. Rejected facts survive with their source path and parse locus; a record whose path cannot
identify a slug uses `slugHint: null` and makes the composition indeterminate rather than disappearing. A supplied
prospective or validated transition overlay is applied while producing this one result. Rendering may consume
`view`, but launch authority receives the entire pinned result and performs no second scan.

Candidate continuation validation and landed handoff share one `resolveLaunchReadiness()` aggregate over that
exact result. For the requested slug it requires exactly one accepted planned candidate, no matching rejected
record, no unidentified rejected record, `State: Planning`, and non-parked scheduling. It classifies dependencies
under the shipped-only doctrine (`Integrating` remains blocked), then consumes the one batch result produced for
the pinned composition by:

```text
DecomposeReadinessProvider.resolve({
  candidates: [{ slug, record, dependencyFacts }],
  composition
}) -> ReadonlyMap<
  slug,
  { kind: ready }
  | { kind: blocked, blockers: [{ code, locus }, ...] }
>
```

One shared `DecomposeReadinessDeps` bundle resolves and injects this required provider into both candidate and
landed composition paths. Production uses `adaptProjectReadinessProvider(depsOnlyReadinessProvider)`: the adapter
passes the accepted records once to the existing batch `ProjectReadinessProvider`, requires exactly one
`ready | blocked` verdict per accepted slug and no extra key, and maps `blocked` to a nonempty
`provider-blocked` blocker at that slug's provider locus. Dependency blockers retain their separately classified
edge loci. Tests may inject a native typed provider. Existing project-view provider options and their public batch
interface remain unchanged; no project configuration axis or optional helper/composer-local default is added.
A missing provider, thrown call, missing/extra map key, unknown result field, empty blocker set on typed `blocked`,
or otherwise malformed provider result returns typed `refused`.

Missing, duplicate, malformed, wrong-lifecycle, or otherwise indeterminate project records return typed `refused`;
unsatisfied dependencies or a valid provider denial return typed `blocked`; only the complete conjunction returns
`ready`. Every non-ready result preserves exact blocker and source loci, including provider blocker loci. The
publication is not a scheduler or status record.

Existing work-unit targets resolve against exact landed lifecycle records. Draft-block targets resolve their
owning record plus exact artifact locator, and document targets resolve their exact managed path state in the same
pinned tree. All existing destinations remain publication/display facts but are never continuation-eligible.

The built CLI exposes that re-resolution as read-only `arc decompose <origin> --handoff`. It authenticates one
pinned configured-base tree, returns a closed landed-handoff result through the public command boundary, and
changes no ref, index, worktree, claim, or lifecycle record. A prepared or committed-unlanded candidate returns a
typed non-landed result rather than exposing candidate members to base-rooted consumers.

Extraction has a surviving origin and no retirement receipt; its member owns that separate conservative launch
boundary. The core does not fabricate publication evidence for extraction.

Before receipt finalization, the immutable `ValidatedDecomposePlan` produces a `ProspectiveTransitionOverlay`
binding only its exact origin, source branch, and plan identity. This transient operand is accepted only by the
in-process result composer to render the candidate project view and ROADMAP; it grants no commit, merge,
publication, landing, claim-retirement, or cleanup authority. Preparation binds its suppression facts and exact
rendered ROADMAP path state.

The finalized validator independently produces:

- `ValidatedTransitionOverlay`, which suppresses exactly the retired origin in structured project readiness; and
- exact-base `DecompositionIntegrationAnchor`, which binds receipt, origin, source head, current base, and
  candidate head after the canonical receipt validates against its prepared base.

Project-view and ROADMAP rendering apply a supplied minimal overlay but never discover or validate receipts.
Finalization composes the receipt-derived overlay against the pinned candidate tree and requires exact structured
view and ROADMAP-byte parity with the preparation-bound prospective result before replacing evidence. Direct
execution uses only the prospective arm; commit, merge recovery, landed publication, and cleanup accept only the
validated arm. Hook/conflict recovery pins `HEAD`, ordered `MERGE_HEAD`, index/candidate tree, configured base,
and relevant objects, then selects exactly one validator-proven overlay. Historical, other-parent-only, deleted,
ambiguous, contradictory, or raced evidence grants no authority. Recovery is merge-specific; rebase, cherry-pick,
and revert receive no inferred parent semantics.

The exact-base integration anchor is the shared consumer contract. `decompose-base-mobility` extends its derivation
to a current descendant base; it does not introduce a second anchor shape. Core teardown composition requires the
receipt to be landed and the exact-base anchor to validate before it exposes local source cleanup eligibility.
More durable enumeration and remote cleanup behavior belongs to `decompose-durable-consumers`.

The anchor derives one closed `claimRetirement` arm only from the canonical receipt's preparation-bound
`candidateOwnership`. A `claimed` full-protection value becomes
`{ kind: required, claimId, generation, candidateBranch, candidateWorktree }` and must still correlate to the
exact operational claim. A partial `not-applicable` value becomes
`{ kind: not-applicable, protection: partial }`. Current configuration and unbound claim-store discovery cannot
select or change the arm.

The full arm grants cleanup only after compare-and-swap returns `retired` or `already-retired-matching`;
`conflict`, `missing-unproven`, a discarded terminal, or a concurrent generation grants none. The partial arm
performs no claim CAS and may grant cleanup directly from the exact anchor, but refuses if any matching live or
superseded candidate claim exists. An unproven-missing claim is a full-arm failure only, never a requirement
manufactured for partial protection.

### D6. Keep workflow orchestration below the proof boundary

The shipped decomposition workflow invokes typed verbs in this order:

1. read-only preflight;
2. semantic map authoring;
3. validate, create/resume, scaffold, and prepare;
4. author reported member, existing-home, and cohort destinations;
5. run one distribution interlock, including initial continuation;
6. finalize with the closed continuation input;
7. commit and ship through existing release controls;
8. query the landed publication through the read-only handoff command and pass its facts to launch orchestration.

Workflow prose does not evaluate Git topology, schema fields, digests, receipt identity, branch collision, or
retry eligibility. It renders CLI-reported paths, statuses, and direct next actions. Commit, push, and integration
interlocks remain release controls rather than duplicate semantic-distribution gates.

One canonical end-to-end fixture uses normal CLI initialization, branch-private source planning artifacts, a true
base predecessor, the complete installed hook chain, machine-produced starter fields, exact-base landing, project
projection, publication handoff, and receipt-backed local teardown eligibility. Focused unit and integration tests
own schema, allocation, topology, protection-mode, mismatch, merge-parent, and recovery matrices.

## Alternatives & Rationale

### Preserve v1/v2 decomposition receipts

Rejected. ARC is pre-release and has no other installs. Once their current self-hosting reference/cleanup
obligations are resolved, keeping decomposition-specific legacy fixtures and authority paths would add permanent
complexity for deletable development state. This does not rewrite the shared receipt versions still used by
unrelated transition verbs.

### Transport the source patch into the result worktree

Rejected. The result should read an immutable source and write directly on its base-rooted candidate. Patch
transport would duplicate the projection model and broaden recovery.

### Carry source riders in the cut map

Rejected. Decomposition is a planning transform, not a branch migration primitive. Riders ship through their own
route before retirement.

### Add line ranges, allocation markers, or overlapping sections

Rejected. Disjoint H2-H6 units plus ordinary Markdown refinement provide exact coverage without creating another
authoring language.

### Allow multi-member cohortless fan-out

Rejected. Even mechanically valid destination ownership would lose the origin-addressable mental model and
durable sequencing anchor. Multi-member publication therefore always has a cohort, subcohort, or at-cap anchor.

### Enter members at `create-spec` or ready-to-activate

Rejected. Partial specs are not reviewed authority, and a parent skeleton is not a finalized child task list.
Complete drafts resume design; complete specs resume task derivation.

### Persist display path, readiness, or launch status

Rejected. These facts change as metas and lifecycle state change. The receipt stores stable publication identity
and the interlock disposition; consumers derive the live frontier.

### Add a second child-spec review or approval credential

Rejected. One post-authoring interlock can inspect the actual distribution. Persisting a token would create
credential and recovery semantics without proving human judgment.

## Cross-cutting Considerations

### Trust and failure behavior

Every destructive action is bound to exact versioned evidence. Source drift, base drift, unaccounted paths,
ambiguous receipts, target or dependency mismatch, unsupported object types, and changed candidates fail before
their corresponding destructive step. Refusals name the stable locus and one direct recovery action.

### Compatibility and development-state cleanup

V3 replaces unpublished decomposition contracts in place. The repository audit has already shown that two old
decomposition receipts still participate in reference reconciliation; implementation resolves those internal
obligations and deletes the records rather than migrating them. Existing generic receipt behavior for rename,
abandon, and park remains outside this WU. No decomposition compatibility code survives solely for pre-release
state.

### Storage and procedure evolution

Git paths and refs remain storage adapters rather than semantic identity. The receipt is versioned and closed; the
publication stores stable logical identity while display and readiness derive from current authority. Workflow
prose consumes typed results instead of growing deterministic procedure logic.

### Performance

Core validation is proportional to the touched artifacts and paths. It adds no cache or mutable index. Receipt
enumeration improvements are intentionally deferred to `decompose-durable-consumers`.

### Testing

Unit tests cover closed v3 identities, starter/completed distinction, disjoint byte inventory, allocation and
ownership, planning profiles, topology, publication, typed mismatches, path modes, exact-base anchors, and
transition overlays. Integration tests cover preflight-to-prepare drift, result creation/resume/discard,
finalization retries, start-stage preservation, provisional tasks, merge-parent selection, and workflow ordering.
The E2E fixture proves the normal lifecycle with installed hooks and no hand-authored machine evidence.

### Rollout and package/project sync

Implementation lands the v3 decoder/validator before any consumer authority. V3 authoring then replaces obsolete
development schemas and receipts. Adopter-facing methodology changes are made in package source and rendered to
the project copy; planning artifacts remain project-only. Ordinary installs keep decomposition reviewed.

## Success Criteria

- A normally started symmetric work unit decomposes from its branch-private source into an exact-base result and
  commits through the complete installed hook chain.
- Backlog-stub and heterogeneous retirement use the same result authority while preserving their distinct
  predecessor and existing-home behavior.
- No v1/v2 decomposition authoring or authority remains; old decomposition records are deleted after their live
  self-hosting obligations are resolved, while unrelated transition receipt behavior is unchanged.
- Preflight emits canonical v3 JSON only on stdout and changes no ref, branch, index, worktree, or record.
- Source selection uses only self-authenticating local branch refs or the exact configured-base predecessor;
  checkout, remote refs, aliases, and ref order cannot change or ambiguously choose the source.
- Starter output has one exact machine envelope and explicit scalar, collection, source-allocation, and
  dependency-disposition author slots; completed input preserves every machine field.
- Preflight derives the exact planning profile from the pinned source before starter emission and rederives it with
  every other machine field before completed-map authority.
- Every v3 nested record, preparation envelope, receipt envelope, ordering rule, and canonical digest preimage is
  closed and byte-fixtured; v3 decomposition records use their own version-plus-kind shared-namespace arms.
- Source-artifact and source/incoming/outgoing inventory digests have explicit versioned preimages over exact
  stored modes/bytes or canonical machine arrays; no preparation operand is implementation-selected.
- Public v3 authoring admits only started-planning/backlog-stub symmetric or heterogeneous retirement; extraction
  and surviving origin remain outside the core codecs.
- Preparation and receipts bind one immutable candidate-ownership arm, so landing cannot infer protection or claim
  generation from current configuration.
- Full-protection occupation uses the exact repository-common claim key, store path, generation record, atomic
  compare-and-swap API, and latest-terminal retention bound; missing or malformed state never proves completion.
- Full-protection worktree identity is deterministic from claim/generation, while its crash-recoverable intended,
  registered, and released path mapping remains solely in machine-local operational state.
- A post-acquire `pending/unregistered` generation remains resumable without granting path authority; collision and
  crash handling never require deleting that sole generation as if it were residue.
- Preparation binds the exact candidate publication and constitutive topology before execution; later authoring
  and finalization can validate but cannot re-project either identity.
- One canonical path registry rejects exclusive-role collisions and composes every legitimate
  topology/content/dependency overlap into one final mutation before occupation.
- Managed path results cover every non-receipt allowed path exactly once; transition patches are precisely the
  changed subset and unchanged reuse paths remain explicit.
- Nested Markdown inventory is byte-exhaustive and non-overlapping, with stable hierarchy-qualified identities.
- Allocation, destination, ownership, reasoned-drop, rider, path-state, and dependency violations refuse before
  result creation.
- Every decomposition publishes an origin-addressable direct-member, cohort, subcohort, or at-cap anchor;
  cohortless multi-member maps refuse.
- Required cohort docs are reported and materialized only through planned composed edits; topology scaffolding
  never overwrites existing content or invents semantics, and placeholder Purpose floors block finalization.
- Draft and mature members preserve their complete authority, enter the matching workflow, and keep provisional
  tasks non-authoritative.
- Exact-base anchor production precedes `arc start`, landed handoff, and cleanup; all three consumers reuse the
  same fast-forward/merge landing relation and receipt-carried claim-retirement arm.
- New leaves alone carry the exact optional decomposition-receipt marker; `arc start` validates its landed
  publication, preserves or derives workflow authority, and removes the marker only with successful relocation;
  ordinary rendering and reconciliation never emit or backfill the field.
- Start executes one validated atomic graduation transaction; ordinary failure restores branch/worktree,
  artifact, meta, and index preimages, while incomplete rollback returns typed non-authoritative residue.
- Atomic start preserves managed-field backfill, optional caller-supplied Class, and the existing successful
  `GraduateResult.backfilled/notice` surface without any post-transaction meta write.
- Finalization returns exact idempotent statuses and refreshes only approved fully staged uncommitted refinement
  while preserving the exact finalized initial continuation.
- Commit validation, merge-parent projection, ROADMAP convergence, and exact-base integration anchors consume the
  same canonical v3 validation result.
- Shared record enumeration, reference reconciliation, and dependent-disposition lookup explicitly consume v3
  preparation/receipt arms without changing retained generic transition behavior.
- The finalized receipt stores exact publication entries and typed initial continuation while live display,
  ready, and blocked facts remain derived.
- Publication order is the completed map's canonical destination order after coordination destinations are
  filtered, and selected slugs preserve the resulting new-leaf order.
- Candidate continuation and landed handoff call the same aggregate `resolveLaunchReadiness()` contract, including
  lifecycle, shipped-only dependency, and configured-provider blockers; absent or invalid records never default
  ready.
- Readiness consumes one lossless pinned composition carrying accepted candidates and rejected-record facts, and
  both paths receive the same required provider through the shared decomposition dependency bundle.
- Existing work-unit, draft-block, and document destinations have closed publication identities and remain
  continuation-ineligible.
- Finalization accepts one closed continuation input and atomically seals it without persisting an approval claim.
- Candidate ROADMAP rendering uses only plan-bound prospective authority, and finalization proves exact parity
  before durable validated overlay authority exists.
- The public read-only landed-handoff command grants no candidate-time authority and changes no repository or
  claim state.
- Partial-protection anchors encode claim retirement as not applicable and grant cleanup without claim CAS only
  when no unexpected matching claim exists.
- Prepared or committed-unlanded candidate members remain nonexistent to base-rooted start resolution; only the
  synchronized landed base exposes them to launch consumers.
- One post-authoring interlock owns semantic distribution approval; no evidence or meta field claims to prove that
  judgment.
- Ordinary installs remain reviewed and default-off from any planning-lane automation.
- Routine operation never asks the operator for a digest, object ID, receipt ID, base head, or reconstructed
  evidence.

## Open Questions

[none]
