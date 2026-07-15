# Spec (`detailed` · `RFC`): husk-lifecycle-drivers

- **Origin:** `worktree-teardown-decoupling` deferred non-shipped lifecycle drivers; FP wave 3 then showed that
  primary-only cleanup surfaces are not reachable from linked-worktree sessions.

- **Purpose:** Let authorized abandon, park-at-Planning, and decompose retirements preserve the invoking linked
  session on a self-describing husk, reap only the exact refs the transition authorized, and surface current and
  sibling cleanup residue from the linked sessions where parallel-work operators are working.

---

## Introduction / Context

`worktree-teardown-decoupling` made shipped self-teardown safe. A linked worktree whose work unit has shipped can
detach at its exact `HEAD`, reap its branch projection, and leave the parent harness alive in a disposable husk
instead of deleting the harness's current working directory.

Three non-shipped lifecycle exits still stop short of that path:

- `arc abandon --yes` removes the work unit's artifacts and then sends the operator to `arc teardown --force`.
- park-at-Planning relocates the planning artifact group, commits and ships that relocation, then reaps the obsolete
  `plan/<name>` projection.
- symmetric or heterogeneous decompose retires an origin after its design is conserved in the allocation result,
  then reaps the untouched origin branch and worktree.

Those transitions cannot inherit shipped containment as their authority. Abandon intentionally discards an unmerged
projection, while park and decompose depend on conservation in another artifact location. Treating `--force`, branch
absence, or a derived lifecycle state as proof would let stale, incomplete, or hand-authored state authorize deletion.

Cleanup discovery has a second gap. The existing stale-worktree and orphan-branch sweeps run only from the primary
worktree, while spawned-worktree operation keeps active operators in linked sessions. A correctly-created husk can
therefore remain invisible until someone manually inspects the worktree roster. Adding non-shipped husks without
moving the presence-tier cleanup surface would multiply that blind spot.

This RFC treats authorization, directional teardown, replay, and discovery as one end-to-end cleanup concern. The
proof port is deliberately teardown-specific: it provides the terminal projection facts needed to retire one exact
branch/worktree pair, not a general storage API or a new lifecycle-state model.

## Goals

- Preserve a live linked session during authorized abandon, park-at-Planning, and decompose retirement; ARC must not
  physically remove the invoking session's worktree.
- Require transition-specific, version-checked evidence before any non-shipped detach or ref deletion. `--force`
  remains a request selector and never becomes authorization by itself.
- Bind authorization and replay to the exact subject, branch, worktree path, `HEAD`, local ref OID, and remote-ref
  state so a restarted or advanced projection cannot be reaped accidentally.
- Persist enough machine-local terminal evidence to explain why a husk exists and to retry interrupted cleanup
  without reclassifying the original transition from mutable current lifecycle state.
- Surface the current husk, sibling husks, and orphan refs from linked session initialization without enabling the
  broader primary/no-WU discovery and completion-tail probes.
- Preserve current shipped teardown, primary-session cleanup, marker compatibility, and storage-tier neutrality.

## Non-Goals

- No new work-unit lifecycle state, meta field, configuration axis, or storage-mode workflow branch.
- No general-purpose ARC storage abstraction. The port introduced here owns retirement evidence only.
- No park-at-Active change; its preserved branch and base-owned pointer choreography remain unchanged.
- No errand-close driver. The existing `errand` subject remains representable for a later spawned-errand design.
- No occupancy lease, automatic cleanup, cleanup claim, reminder marker, or nudge budget. Cleanup remains offer-only.
- No broader linked-session awareness for in-flight errands, completion-tail work units, recovery, or materialization.
- No new git-notes persistence, notes lock, notes reconciliation arm, or identity-global cleanup state.
- No deletion of a changed local or remote ref and no batch cleanup of every same-subject husk.

## Proposed Design

### 1. A teardown-specific retirement authority

Replace the shipped-only `allowHusk` switch in teardown orchestration with a narrow authority port. Its public
vocabulary names preservation facts rather than lifecycle states:

```ts
type HuskAuthorization =
  | "merged-preserved"
  | "discard-confirmed"
  | "planning-relocated";

type CanonicalDigest = `sha256:${string}`;

type RemoteRefProof =
  | null
  | {
      remote: string;
      oid: string;
      disposition: "delete" | "retain";
    };

type RetirementEvidenceRef =
  | {
      kind: "shipped";
      expectedLifecycle: "completed";
      resultDigest: CanonicalDigest;
      baseProofOid: string;
    }
  | {
      kind: "receipt";
      receiptId: CanonicalDigest;
      transition: RetirementReceipt["transition"];
      expectedLifecycle: "planned" | "nonexistent";
      resultDigest: CanonicalDigest;
    };

type PersistedRetirementEvidence =
  | RetirementEvidenceRef
  | ({ kind: string } & Readonly<Record<string, unknown>>);

type DecodedRetirementEvidence =
  | { kind: "known"; value: RetirementEvidenceRef }
  | {
      kind: "unknown";
      value: { kind: string } & Readonly<Record<string, unknown>>;
    };

interface RetirementReceipt {
  schemaVersion: 1;
  receiptId: CanonicalDigest;
  subject: WorktreeSubject;
  transition: "abandon" | "decompose" | "park-planning";
  source: {
    branch: string;
    head: string;
    artifactDigest: CanonicalDigest;
  };
  transitionPatchDigest: CanonicalDigest;
  retiringProjection:
    | { kind: "direct-transition" }
    | { kind: "unchanged" };
  authorization: Exclude<HuskAuthorization, "merged-preserved">;
  result:
    | { kind: "discard"; artifactDigest: "absent" }
    | {
        kind: "decompose";
        preparationId: CanonicalDigest;
        allocation: DecomposeAllocationMap;
        cutMapDigest: CanonicalDigest;
        sourceInventoryDigest: CanonicalDigest;
        incomingEdgeInventoryDigest: CanonicalDigest;
        outgoingEdgeInventoryDigest: CanonicalDigest;
        targets: ReadonlyArray<{
          path: string;
          artifactDigest: CanonicalDigest;
        }>;
      }
    | { kind: "relocate"; plannedArtifactDigest: CanonicalDigest };
}

interface RetirementAuthorityScope {
  subject: WorktreeSubject;
  transition: RetirementReceipt["transition"];
  source: {
    branch: string;
    head: string;
  };
  resultProjection: {
    ref: string;
    head: string;
  };
}

interface RetirementAuthoritySnapshot {
  authorityVersion: string;
  sourceRefOid: string;
  resultRefOid: string;
  recordState: "absent" | "prepared-decompose";
}

type DecomposeEdgeDisposition =
  | { kind: "targets"; targets: ReadonlyArray<string> }
  | { kind: "drop"; reason: string };

type DecomposeIncomingEdgeDisposition =
  | { kind: "replace"; replacementTargets: ReadonlyArray<string> }
  | { kind: "drop"; reason: string };

type DecomposeContentLocator =
  | { artifact: string; kind: "preamble" }
  | {
      artifact: string;
      kind: "section";
      headingSource: string;
      occurrence: number;
    }
  | { artifact: string; kind: "whole-file" };

type DecomposeSourceDisposition =
  | {
      kind: "target";
      destinationId: string;
      targetLocator: DecomposeContentLocator;
    }
  | { kind: "drop"; reason: string };

type DecomposeExistingTarget =
  | { kind: "work-unit"; slug: string }
  | {
      kind: "draft-block";
      slug: string;
      locator: DecomposeContentLocator;
    }
  | { kind: "document"; path: string };

type DecomposeAllocationEntry =
  | {
      kind: "new-member";
      destinationId: string;
      slug: string;
      workClass: WorkClass;
    }
  | {
      kind: "surviving-origin";
      destinationId: string;
      slug: string;
      disposition: OriginDisposition;
    }
  | {
      kind: "existing-home";
      destinationId: string;
      target: DecomposeExistingTarget;
      home: ExistingHomeKind;
    }
  | {
      kind: "cohort-coordination";
      destinationId: string;
      cohort: string;
    };

interface DecomposeAllocationMap
  extends Omit<DecomposeParams, "schemaVersion" | "entries"> {
  schemaVersion: 2;
  entries: ReadonlyArray<DecomposeAllocationEntry>;
  sourceAllocations: ReadonlyArray<{
    sourceId: CanonicalDigest;
    disposition: DecomposeSourceDisposition;
  }>;
  incomingEdges: ReadonlyArray<{
    dependent: string;
    disposition: DecomposeIncomingEdgeDisposition;
  }>;
  outgoingEdges: ReadonlyArray<{
    prerequisite: string;
    disposition: DecomposeEdgeDisposition;
  }>;
}

interface DecomposePreparationRecord {
  kind: "prepared-decompose";
  schemaVersion: 1;
  locator: DecomposePreparationLocator;
  allocation: DecomposeAllocationMap;
  sourceInventory: ReadonlyArray<{
    sourceId: CanonicalDigest;
    sourcePath: string;
    sourceLocator: DecomposeContentLocator;
    contentDigest: CanonicalDigest;
  }>;
  incomingEdgeInventory: ReadonlyArray<{
    dependent: string;
    currentTargets: ReadonlyArray<string>;
  }>;
  outgoingEdgeInventory: ReadonlyArray<{
    prerequisite: string;
  }>;
  allowedPaths: ReadonlyArray<string>;
  sourceArtifactDigest: CanonicalDigest;
  sourceInventoryDigest: CanonicalDigest;
  incomingEdgeInventoryDigest: CanonicalDigest;
  outgoingEdgeInventoryDigest: CanonicalDigest;
  cutMapDigest: CanonicalDigest;
}

interface DecomposePreparationLocator {
  receiptId: CanonicalDigest;
  preparationId: CanonicalDigest;
  scope: RetirementAuthorityScope;
}

interface PreparedDecomposeRetirement {
  locator: DecomposePreparationLocator;
  record: DecomposePreparationRecord;
  authorityVersion: string;
}

interface TeardownAuthorizationRequest {
  subject: WorktreeSubject;
  branch: string;
  head: string;
  remote: string;
  requestedMode: "shipped" | "abandoned";
}

type TeardownAuthorizationDecision =
  | {
      status: "authorized";
      authorization: HuskAuthorization;
      authorityVersion: string;
      evidence: RetirementEvidenceRef;
      refs: {
        localOid: string;
        remote: RemoteRefProof;
      };
    }
  | {
      status: "refused";
      reason: TeardownAuthorizationRefusal;
    };

interface RetirementAuthorityPort {
  readSnapshot(
    scope: RetirementAuthorityScope,
  ): Promise<
    | { status: "resolved"; snapshot: RetirementAuthoritySnapshot }
    | { status: "refused"; reason: TeardownAuthorizationRefusal }
  >;

  record(
    receipt: RetirementReceipt,
    expectedAuthorityVersion: string,
  ): Promise<
    | { status: "recorded"; authorityVersion: string }
    | { status: "refused"; reason: TeardownAuthorizationRefusal }
  >;

  prepareDecompose(
    scope: RetirementAuthorityScope,
    allocation: DecomposeAllocationMap,
    expectedAuthorityVersion: string,
  ): Promise<
    | { status: "prepared"; preparation: PreparedDecomposeRetirement }
    | { status: "refused"; reason: TeardownAuthorizationRefusal }
  >;

  finalizeDecompose(
    locator: DecomposePreparationLocator,
    expectedAuthorityVersion: string,
  ): Promise<
    | { status: "recorded"; receipt: RetirementReceipt; authorityVersion: string }
    | { status: "refused"; reason: TeardownAuthorizationRefusal }
  >;

  authorize(
    request: TeardownAuthorizationRequest,
  ): Promise<TeardownAuthorizationDecision>;

  revalidate(
    request: TeardownAuthorizationRequest,
    proof: Extract<TeardownAuthorizationDecision, { status: "authorized" }>,
  ): Promise<
    | { status: "valid" }
    | { status: "refused"; reason: TeardownAuthorizationRefusal }
  >;
}
```

`TeardownAuthorizationRefusal` is a closed semantic set:

```ts
type TeardownAuthorizationRefusal =
  | "unsupported-transition"
  | "evidence-missing"
  | "evidence-mismatch"
  | "projection-mismatch"
  | "conservation-unproven"
  | "preservation-unproven"
  | "authority-unavailable"
  | "authority-ambiguous"
  | "authority-conflict";
```

Adapters may attach diagnostics, but orchestration and user-facing branching key only on these codes. The port's
operations separate the trust phases:

1. A lifecycle driver obtains an opaque snapshot/version for its exact source and result projections.
2. Abandon and park record the evidence produced by their already-approved direct transition against that version.
3. Decompose durably prepares its complete allocation before mutation, then finalizes the same preparation after
   distribution and before commit.
4. Teardown authorizes one exact live request from committed evidence and ref state.
5. Teardown revalidates the returned version immediately before its first directional operation.

`WorktreeSubject` remains the request identity. A work unit, errand, and exact recordless branch stay distinct even
when their text suffixes match. The current branch teardown path can produce only `merged-preserved`; the reserved
`errand` subject returns `unsupported-transition` until an errand driver exists.

Receipt validation enforces one fixed cross-field matrix: `abandon` and `decompose` carry
`authorization: "discard-confirmed"` with `expectedLifecycle: "nonexistent"`; `park-planning` carries
`authorization: "planning-relocated"` with `expectedLifecycle: "planned"`. Shipped evidence alone carries
`merged-preserved`/`completed`. Any other transition, result kind, authorization, or expected-lifecycle combination
is `evidence-mismatch`.

### 2. Canonical receipts and exact transition write sets

Every non-shipped driver writes one structured receipt after its existing judgment or conservation gate. A receipt
is an operational record, not a user note, git note, branch-name inference, CLI assertion, or new WU artifact.

The current in-repo adapter stores retirement records under the adapter-owned namespace
`.arc/.internal/retirement-receipts/<record-key>.json`. The filesystem-safe record key is the bijective rendering of
`sha256:<64-lower-hex>` as `sha256-<64-lower-hex>`; a decoder accepts no other spelling. The namespace is operational
state: it has no package-source mirror, is created lazily, and is addressed only through `RetirementAuthorityPort`.
A record is either a `prepared-decompose` envelope or a finalized `RetirementReceipt`; the adapter atomically
replaces the former with the latter. In the current tier the finalized receipt is tracked in the same transition
commit as the result it describes. A Local/backend adapter stores the equivalent record in canonical materialized
storage against the version the driver read; workflow logic never branches on the physical location.

Decompose preparation returns a closed `DecomposePreparationLocator` containing the deterministic receipt and
preparation IDs plus the complete source/result scope. The same locator is stored inside the preparation and passed
unchanged to finalization. The adapter derives the one safe record key from `locator.receiptId`, opens that path
directly, validates the embedded locator byte-for-byte, and rejects a missing, mismatched, or second record; it never
scans the namespace or relies on process-local association. If process output was lost, repeating
`prepareDecompose` with the same scope and map re-derives the IDs, opens that one path, and returns the stored locator
idempotently. A Local/backend adapter performs the equivalent direct keyed lookup.

The durable digest wire format is fixed. Every `CanonicalDigest`, including receipt and preparation IDs, is
`sha256:` followed by exactly 64 lowercase hexadecimal characters. Canonical structured values serialize as UTF-8
JSON with recursively lexicographic object keys, NFC-normalized strings, no insignificant whitespace, and no trailing
newline. Managed paths are repository-relative POSIX paths; absolute paths, `.`/`..` segments, backslashes, NUL, and
non-NFC forms are rejected before hashing. Set-valued arrays sort by their canonical member bytes: artifact operations
by path then operation, allocation entries by `destinationId`, source inventories/allocations by `sourceId`, incoming
edges by dependent, outgoing edges by prerequisite, internal edges by `(from,to)`, incoming replacement-target and
outgoing consumer slug sets lexicographically, and allowed paths lexicographically. Arrays whose order is explicitly
user-facing retain order; in particular, `incomingEdgeInventory.currentTargets` retains the parsed `Depends On`
order so finalization can prove the origin-slot replacement or removal.

Blob/content digests hash canonical stored blob bytes, never checkout bytes. The current adapter reads the exact Git
tree or index blob after clean filters, so CRLF settings and smudge filters cannot change a receipt; a Local/backend
adapter reads the canonical backing-store blob. An artifact-set entry is exactly
`{ path, state: "present", contentDigest }` or `{ path, state: "absent" }`; a patch operation is exactly
`{ operation: "write", path, contentDigest }` or `{ operation: "delete", path }`. Artifact, patch, inventory,
allocation, and result digests hash the canonical JSON bytes of their closed records, and the discard result uses the
literal schema value `"absent"`. `receiptId` and `preparationId` hash the canonical tuples named below with the same
encoding. The current adapter's `authorityVersion` also uses `CanonicalDigest`; other adapters may return an opaque
namespaced version token, but must compare it byte-for-byte and must not reinterpret it as a Git OID. Git OIDs remain
separate repo-native values validated against the repository's object format.

Every producer obtains its compare-and-set token from `readSnapshot`; no driver invents a version or reads one from
the lifecycle index. For the current adapter, the snapshot is a canonical digest over the exact source ref/`HEAD`,
result ref/`HEAD`, source artifact or dependency-edge inventory needed by that transition, deterministic record-path
state, and clean-index baseline. Abandon and park consume the `recordState: "absent"` token. Decompose preparation
consumes the absent token and returns a new token over the persisted preparation, unchanged origin ref, and unchanged
base `HEAD`; expected allocation mutations are verified as the preparation's result, not treated as version drift.
Future storage adapters return their canonical record/store version plus the materialized projection version through
the same snapshot. A mismatched source ref, base ref, record state, or storage version is `authority-conflict`.

Receipt creation follows these rules:

- `receiptId` is the deterministic digest of schema version, typed subject, transition, source branch, and source
  `HEAD`. The adapter can therefore derive at most three non-shipped candidate record keys from a teardown request
  rather than scanning accumulated receipts; more than one valid candidate is `authority-ambiguous`.
- `preparationId` is the deterministic digest of the decompose receipt ID, base `HEAD`, source, incoming-edge, and
  outgoing-edge inventory digests, and cut-map digest. An exact retry derives the same ID; a changed input cannot
  alias the pending preparation.
- Artifact digests are hashes of canonical, path-sorted artifact-set entries over the complete slug-matched artifact
  group or allocation target.
- Receipt evidence uses `resultDigest = digest(receipt.result)`; authorization returns the receipt ID, transition,
  fixed expected lifecycle, and that digest for the terminal stamp.
- `transitionPatchDigest` hashes every allowed path/blob/delete operation in the transition write set except the
  receipt record itself. The driver derives the operation set from its typed mutation result, not from an arbitrary
  working-tree diff.
- A driver refuses pre-existing staged changes or paths outside its owned transition set. This prevents unrelated
  content from being legitimized merely because it was included in the digest.
- Every preparation, direct receipt write, and finalization is version-checked against the token returned by the
  preceding port operation. A changed canonical version returns `authority-conflict`; it never silently rebases or
  overwrites the record.
- The authoritative transition relation must introduce the receipt on that projection: the source direct-transition
  commit for abandon/park, or the result-side allocation commit for decompose. Park's result materialization may
  introduce one byte-identical copy on base after validating the source transition. An amended/recreated receipt,
  later source descendant, unrelated result commit, or write-set mismatch cannot authorize teardown.

`direct-transition` means the retiring `HEAD` is a single-parent commit directly atop `source.head`, introduces the
receipt on the source ancestry, and has the exact non-receipt patch digest. `unchanged` means the retiring branch
still resolves to `source.head`; a result-side commit in the effective base introduces the receipt and carries the
matching allocation write set.

The current adapter validates the complete relation rather than trusting a receipt's claims. Canonical
serialization and hashing live in pure library code with filesystem, git, and storage reads injected at the adapter
boundary.

### 3. Driver-specific evidence matrices

#### Abandon

After the explicit destructive confirmation, `arc abandon --yes` captures the source branch/`HEAD` and source
artifact digest, removes the artifact group, and records `discard-confirmed` in the same direct-transition commit.
The result digest is the explicit absence sentinel.

Authorization requires all of the following:

- the receipt subject, source branch, and parent `HEAD` match the request;
- the retiring `HEAD` is the direct transition commit;
- its complete non-receipt patch matches `transitionPatchDigest`;
- the slug now derives to `nonexistent` from the committed projection; and
- the receipt was introduced by that transition, not copied or recreated later.

A hand deletion, uncommitted removal, stale base stub, descendant commit, or bare `--force` request does not satisfy
the matrix.

#### Park at Planning

`arc park` runs from the planning worktree in both protection modes. It stages the relocation and
`planning-relocated` receipt there; the workflow commits them as one direct-transition commit on `plan/<name>`.

Under full protection, that exact planning branch is pushed and merged through its park PR. Under partial protection,
the base checkout runs `arc park <name> --land <transition-commit>` after the branch commit. The landing arm validates
that the commit is the exact local `refs/heads/plan/<name>` tip owned by the registered source worktree, validates its
direct-transition relation, and reads the exact receipt and complete planned artifact group from that commit. It
refuses an existing conflicting slug or paths outside the park result, then stages that byte-identical snapshot on
the current base for the workflow's direct base commit. It does not create or rewrite a receipt and does not
cherry-pick the branch-relative deletion patch. A changed base is accepted only after a fresh version-checked read
shows the slug/result paths remain non-conflicting. Thus the retiring branch proves the direct transition while the
base commit is the result materialization. The effective proof target is refreshed `origin/<base>` for full
protection and local `<base>` for partial protection.

Authorization requires the direct-transition relation on the retiring branch and a committed result target that
contains the same receipt plus the byte-identical, complete slug-matched planning artifact group. Both the retiring
branch and effective base must derive to `planned`. This distinguishes a completed relocation from a stale
pre-start backlog stub that happens to make the base derive to the same state.

Only after the proof target contains that result does the still-running planning session call teardown. Park at
Active is outside this driver and remains unchanged.

#### Decompose retirement

Symmetric and heterogeneous decompose continue to execute from a clean base checkout, but the cut map becomes a
complete machine contract rather than a scratch routing hint. Its existing member and internal-edge declarations
remain, while per-entry `receives` and `dependsOn` arrays are replaced by canonical allocation lists. Schema version
2 carries:

- `sourceAllocations`: one entry for every stable source unit in the origin artifact group, assigning it exactly
  once to a named target and stable destination locator or to `drop` with a non-empty reason; and
- `incomingEdges`: one entry for every current dependent of the origin, either naming the exact
  `replacementTargets` for the origin's slot in that dependent's `Depends On` field or dropping that edge with a
  non-empty reason; every unrelated prerequisite is preserved; and
- `outgoingEdges`: one entry for every prerequisite the origin currently depends on, assigning it to the exact
  result-member consumers or to `drop` with a non-empty reason.

Source-unit canonicalization is fixed. The scanner reads the canonical stored blob and requires valid UTF-8 for
Markdown. For every authored companion in the slug-matched artifact group—including `draft-*`, `spec-*`, `notes-*`,
task lists, and supplemental design/research files—content before the first top-level CommonMark level-two heading is
the `preamble` unit; each top-level level-two ATX or Setext section outside a fenced code block, including all
descendants, is one `section` unit. A Markdown document with no such heading is one preamble unit. A non-Markdown
companion is one `whole-file` unit. The meta record and generated readiness view are structural transition paths, not
allocatable prose.

Each locator's `artifact` is the slash-free artifact basename within its destination group; for a standing-document
destination it must equal the basename of the declared document path. `headingSource` is the heading's source text
after CommonMark heading markers are removed, ASCII space/tab runs are collapsed to one space, surrounding ASCII
space/tab is trimmed, and the result is NFC-normalized; case, punctuation, and inline Markdown source are preserved.
`occurrence` is the zero-based index among equal `headingSource` values in that artifact. A source ID is the
`CanonicalDigest` of `{ schemaVersion: 2, sourcePath, sourceLocator }`. The preparation stores the locator and content
digest for every source unit. A target locator uses the same scan and must resolve exactly once at finalization;
wrong-kind locators, negative/non-integer occurrences, and artifact/declared-target mismatches are rejected.

The CLI derives the stable source-unit, incoming-edge, and outgoing-edge inventories from the live origin and base
projections; authored IDs cannot add, omit, or duplicate inventory members. A source target's `destinationId` must
resolve to one declared allocation entry; `cohort-coordination` is the minted cohort document destination for
ownerless shared material. `existing-home.target` is a closed union that distinguishes a WU slug, a named draft
block, and a standing document path; WU/draft-block targets require `home: "fold"`, while document targets require
`home: "atomic-edit"`. Destination IDs are unique, and at most one cohort-coordination entry may name the map's
declared cohort. Replacement-target and consumer arrays are non-empty and duplicate-free; an empty destination set
must use a reasoned `drop` disposition. An incoming-edge replacement target or outgoing-edge consumer must be a WU
slug represented by a new member or an existing-home target whose kind is `work-unit`; draft blocks, standing
documents, and cohort coordination cannot receive WU dependencies. Retirement is legal only for a shape with no
surviving origin. The mechanical transform derives each new member's external `Depends On` set from `outgoingEdges`.
For each incoming edge it replaces the origin at its existing position with `replacementTargets`, or removes only
that origin slot for a reasoned drop; either arm preserves every other prerequisite and collapses duplicates in
first-occurrence order. It no longer points every dependent at every new member for a later narrowing pass.

Before any artifact removal or dependency rewrite, the workflow calls `readSnapshot` and `prepareDecompose`.
Preparation validates complete one-to-one allocation coverage, captures the exact live origin branch/`HEAD`, base
`HEAD`, source artifact digest, source-inventory digest, both dependency-edge inventory digests, and canonical cut-map
digest, then atomically writes a `prepared-decompose` record at the deterministic receipt path and stages it before
any transition mutation. A staging failure removes the new record or leaves it discoverable without touching the
origin. The returned locator, digests, and next `authorityVersion` are the only token accepted by the transform and
finalizer. Preparation is durable across process interruption: rerun derives the receipt path from the locator,
validates the embedded complete scope, stages the exact record if needed, and either resumes idempotently or refuses a
changed origin, base, inventory, map, or pre-existing write set.

`arc decompose` consumes that preparation, retires the origin artifacts in the base projection, scaffolds or updates
every declared target, applies exact internal, incoming, and outgoing dependency edges, and regenerates the project
readiness view. Manual content distribution may then edit only paths admitted by the preparation. Before the
allocation commit, `finalizeDecompose(preparationLocator, preparedAuthorityVersion)`:

- rereads the prepared snapshot and refuses any changed origin ref, base `HEAD`, record identity, storage version,
  source inventory, dependency-edge inventory, or cut-map digest;
- verifies every source unit has exactly the declared target or reasoned-drop disposition; every dependent's final
  `Depends On` value equals its captured `currentTargets` with the origin slot replaced by the declared
  `replacementTargets` or removed by the declared reasoned drop, all unrelated prerequisites preserved, and
  duplicates collapsed; and every outgoing prerequisite has exactly its declared consumers or reasoned drop. A
  target disposition must resolve its destination locator in the final artifact;
- hashes every final target artifact group and the complete non-receipt transition patch;
- rejects staged paths outside the prepared source removal, target artifacts, cohort coordination, dependency edges,
  and readiness-view set; and
- atomically replaces the preparation with the finalized receipt in the same staged base-side write set, embedding
  the canonical allocation map and preparation/inventory digests so authorization can recompute them from the origin
  and allocation-parent projections.

The commit hook rejects a decompose write set with a missing, prepared-but-unfinalized, amended, or mismatched record.
Thus an interruption leaves recoverable preparation evidence, while only a finalized receipt can enter history or
authorize teardown.

Conservation has an explicit judgment boundary. The approved allocation map and the final review decide whether a
rewritten target preserves a source unit's meaning or whether a reasoned drop is acceptable; the port does not claim
to infer semantic equivalence from hashes. The machine proof establishes that the approved map covered every source
unit and dependency edge, was not changed after preparation, resolved every declared destination, and names the exact
committed result. Teardown may trust that finalized transition record, but it may not substitute snapshot similarity
for the missing approval.

Authorization requires `retiringProjection: { kind: "unchanged" }`, the exact origin `HEAD`, an absent origin in the
effective base, the finalized receipt in the allocation commit, the matching transition patch, and every target
digest. The post-merge teardown runs from the origin linked session rather than the base checkout so the authorized
self-husk path preserves that session.

Backlog-only decompose owns no worktree and needs no teardown. Extraction keeps the origin and likewise writes no
retirement receipt.

#### Shipped

The existing shipped driver returns `merged-preserved` from the current `assessReapSafety` and lifecycle checks; it
does not need a `RetirementReceipt`. Its evidence reference carries the canonical completed artifact-group digest and
the refreshed base proof OID used by `assessReapSafety`. Replay verifies that original proof OID remains reachable
from the current base or re-establishes the same patch-preservation proof; it does not require current base to equal
the old OID, so ordinary base advances remain valid. It still distinguishes two remote outcomes:

- work is patch-landed in the refreshed base: an exact live remote ref is deletion-authorized;
- the remote ref is the only preservation proof: it is recorded with `disposition: "retain"` and must not be
  deleted.

This preserves the existing multi-commit-squash residual. A remote ref that is the only proven copy is not converted
into a deletion obligation merely because the new stamp can persist its OID.

### 4. Versioned authorization and ref identity

`authorityVersion` is an opaque, operation-scoped compare-and-set token returned by the port, not a lifecycle-index
field or repository-global counter. The current adapter has three canonical token projections:

- `readSnapshot` binds the exact source and result ref OIDs, transition-specific artifact/edge inventories,
  deterministic record-path state, and clean-index baseline;
- `prepareDecompose` binds the persisted preparation plus the still-exact origin ref and base `HEAD`, allowing only
  the prepared result paths to change before finalization; and
- `authorize` binds the committed receipt or shipped proof, retiring-projection relation, retiring `HEAD`, complete
  transition patch and artifact facts, local ref OID, and remote ref proof.

The Local/backend adapter substitutes its canonical record/store version and materialized projection version at the
same boundaries. No caller derives a token from the composed lifecycle index. The current teardown token does not
hash the entire base commit; unrelated base advances do not invalidate an otherwise exact committed proof.

`authorize` refuses unless the live local branch still resolves to the requested `HEAD` and remains checked out only
at the retiring worktree. A same-name branch that was advanced or is owned by another registered projection is
`projection-mismatch`. The remote ref is read into one of three states:

- absent: `remote: null`;
- present and safe to remove: `{ remote, oid, disposition: "delete" }`;
- present because it must remain as preservation: `{ remote, oid, disposition: "retain" }`.

A valid non-shipped receipt makes any matching origin remote ref deletion-safe: abandon explicitly discards it, and
park/decompose prove the result elsewhere, so they return `delete` when that ref exists. Only `merged-preserved` may
return `retain`, when the remote ref itself is the preservation proof.

`revalidate` repeats the authority-version and exact ref checks immediately before stamp preparation and detach. A
conflict leaves the worktree branched. Under Local/backend storage, a receipt or materialized result that has not
converged returns `authority-conflict`; cleanup waits for reconcile instead of attempting cross-repo two-phase commit.

### 5. Directional teardown ordering

The linked self-teardown path runs in this order:

1. Resolve one exact branch/worktree projection and construct the authorization request.
2. Authorize from the retirement port.
3. Gate on a clean tree and perform a complete dry run of identity-global user-surface reconciliation.
4. Apply the idempotent user-surface reconciliation after the dry run clears.
5. Revalidate the authority version and exact local/remote ref state.
6. Prepare the terminal stamp, including the authorization's evidence reference, atomically while the worktree is
   still branched.
7. Detach at the authorized `HEAD`.
8. Immediately before the remote operation, recheck that no competing registered/lifecycle projection owns the
   exact branch.
9. Resolve the remote ref according to its persisted disposition.
10. Immediately before local mutation, repeat the competing-projection check.
11. Delete the local ref by compare-and-delete against `refs.localOid`.
12. Prune best-effort and return the exact husk result. Physical worktree removal remains deferred.

Every evidence and authority check needed to permit detach completes before detach. A dry-run refusal is
mutation-free. A late pre-detach authority conflict can leave only completed, idempotent user-surface reconciliation
and still leaves the worktree branched. The post-detach competing-projection checks can only veto later destructive
operations: a competitor detected before the remote operation performs no ref mutation and leaves the exact stamped
husk for replay. One detected after the remote outcome performs no local mutation, leaves the local branch and husk,
and reports the already-completed remote result rather than claiming an all-or-nothing cleanup.

For ARC-managed non-shipped worktrees, a missing or malformed ownership marker or failed prepared-stamp write is a
pre-detach refusal. The non-shipped path needs the stamp as its durable retry witness. This WU does not tighten the
existing shipped fallback for externally-managed markerless worktrees: shipped self-teardown may still preserve the
session on an unstamped external husk and report manual cleanup, but it does not gain typed replay or linked-session
discovery.

After detach, ref operations are projection-safe:

- `remote: null` performs no remote delete.
- `disposition: "retain"` performs no delete, but must confirm that the remote still resolves to the authorized OID
  before local deletion; an absent or changed preservation ref leaves the local ref and husk intact.
- `disposition: "delete"` uses the existing force-with-lease delete with the exact authorized OID.
- a deleted or already-absent deletion target satisfies the remote obligation;
- transport or authentication failure leaves the local ref and husk intact for retry;
- a stale remote lease leaves the changed remote untouched and makes the husk manual-only;
- only after the remote outcome is resolved does local deletion run as
  `git update-ref -d refs/heads/<branch> <authorized-local-oid>`; and
- a failed local compare-and-delete leaves the moved local ref and exact stamped husk intact.

The returned result reports authorization, persisted remote disposition, local and remote deletion outcomes, and
whether the terminal projection was created or replayed. Callers never infer those facts from mode flags.

### 6. A self-describing, forward-compatible stamp

Extend `WorktreeHuskStamp` with optional persisted fields:

```ts
interface WorktreeHuskStamp {
  sha: string;
  at: string;
  subject: WorktreeSubject;
  branch: string;
  authorization?: string;
  remoteRef?: RemoteRefProof;
  evidence?: PersistedRetirementEvidence;
}

type DecodedHuskAuthorization =
  | { kind: "known"; value: HuskAuthorization }
  | { kind: "unknown"; value: string };
```

New ARC-managed writers supply a known authorization, explicitly supply either a remote proof or `null`, and persist
the exact `RetirementEvidenceRef` returned by authorization. Readers normalize the evidence through
`DecodedRetirementEvidence`; the open persisted form exists only to retain an object with an unknown future string
discriminant without trusting it. Optionality is read compatibility only. The three added fields have a closed
presence matrix: all absent is a legacy stamp, all present is a current stamp, and every mixed-presence combination
is manual-only.

- an all-absent legacy stamp decodes authorization as known `merged-preserved`;
- a known string decodes directly;
- an unknown future string preserves the surrounding ownership marker and exact-husk recognition, but cleanup is
  manual-only because current code cannot select its destructive mode;
- an all-absent legacy stamp supplies no remote-delete authority and derives the shipped evidence comparison against
  the completed projection;
- receipt evidence must resolve directly by `receiptId`, match the stamped subject/branch, transition, result digest,
  and authorization; shipped evidence must match the completed-result digest and base proof OID;
- an unknown future evidence object with a string `kind` preserves exact-husk recognition but is manual-only;
- a legacy stamp proceeds only after a fresh read confirms the named remote ref is absent; otherwise it is
  manual-only; and
- a non-string authorization, malformed remote proof/evidence, or invalid existing stamp field remains malformed.

Known receipt evidence resolves from a transition-specific authoritative locus, never from whichever checkout invoked
replay. For `abandon` and `park-planning`, the current adapter reads the safe record key from the exact stamped commit
tree and revalidates the direct-transition relation; this keeps an abandon receipt available while its detached husk
is the only remaining witness. For `decompose`, it reads the same key from the effective result projection and
revalidates the finalized allocation relation. A Local/backend adapter reads the canonical record key and version.
Missing or mismatched records are manual-only. This WU does not garbage-collect finalized receipt records; a direct
transition record that exists only in a husk naturally disappears after that husk's obligations resolve and its
worktree is removed.

The stamp remains a projection fact: it records what authorized this exact worktree and `HEAD` to become disposable.
Its evidence field is a keyed result reference and checksum that must be revalidated, not cached authoritative WU
state. `authorityVersion` stays outside the stamp because it authorizes the directional transition; after exact
detach, mutable canonical state cannot rewrite the reason the projection became a husk.

Preparing a stamp on a still-branched worktree does not make it terminal. Consumers recognize a husk only when the
registered checkout is detached and live `HEAD` equals the stamped SHA. A detach failure therefore leaves a harmless
prepared stamp; a retry reauthorizes and may replace it.

### 7. Exact replay and repeated retirements

Add `arc teardown <name> --husk <absolute-worktree-path>` and the corresponding optional `huskPath` library input.
The selector is canonicalized against the registered-worktree scan and must match all of these facts:

- the exact detached worktree path;
- a valid ARC ownership marker and terminal stamp;
- the requested typed subject;
- the stamped branch;
- live `HEAD === stamp.sha`; and
- a clean worktree for physical removal.

It never selects a branched worktree or a same-slug candidate of another subject kind. The unqualified command stays
compatible when exactly one candidate matches. If repeated retirement produced multiple same-subject husks, it
refuses and reports one path-qualified command per candidate; it never chooses newest, oldest, or all.

A known stamp plus its valid evidence reference is the replay proof for a completed directional detach. Mutable
current WU state cannot grant cleanup, but it can reveal a competing projection. Replay executes remote disposition,
local compare-and-delete, and physical cleanup in the same order as creation:

- from inside the husk, no physical removal occurs; ref cleanup may retry and the result remains truthful;
- from outside, identity-global user surfaces reconcile before removal, catching ignored content written after husk
  creation;
- before any ref mutation, a registered branched worktree holding the stamped branch vetoes replay as
  `projection-mismatch`;
- lifecycle comparison exempts only the evidence's exact expected result: shipped evidence matches the completed
  artifact digest/base proof; park evidence matches the planned artifact digest in its receipt; abandon and
  decompose evidence match the receipt's `nonexistent` origin result. Any other candidate for the typed subject that
  declares the stamped branch is a competing projection and vetoes replay. A candidate on another branch does not;
- unavailable, ambiguous, or mismatched evidence/lifecycle state is manual-only; current state can block deletion but
  cannot grant it;
- after the remote outcome and immediately before local compare-and-delete, the same registered/lifecycle projection
  veto is repeated; a new competitor leaves the local branch and husk intact with the remote outcome reported;
- unknown authorization, stale ref identity, moved `HEAD`, dirty content, or unresolved remote state is surfaced as
  manual-only; and
- physical cleanup happens only after the persisted obligations resolve.

This sequence permits cleanup while park's expected `planned` projection or shipped's expected `completed` projection
remains, yet prevents a later materialized or lifecycle-visible restart from causing an old husk to delete the
restarted branch or remote projection. A bare ref recreated at the identical OID with no registered or lifecycle
owner is indistinguishable from the stamped obligation under Git's observable model and remains governed by the exact
OID lease/CAS.

### 8. Linked-session cleanup awareness

Keep discovery in the existing session-init fire line. No standalone hygiene document or mandatory command is added.

#### Current locus

Extend `currentHusk` with decoded authorization, validated evidence reference, persisted remote proof, stamped branch,
and exact path. Recognition requires a linked, branchless registered worktree with a valid marker and exact
stamped/live `HEAD`; it no longer requires local `completed/` membership because non-shipped terminal projections
have no completion record.

The current locus always surfaces:

- a known authorization with validated evidence names `merged-preserved`, `discard-confirmed`, or
  `planning-relocated`, shows whether the remote ref will be deleted or retained, and renders the exact
  outside-worktree path-qualified cleanup command;
- an unknown authorization suppresses the generic detached-HEAD warning but remains manual-only; and
- untrusted evidence falls back to ordinary detached-HEAD guidance.

#### Sibling residues

Lift the network-free presence tier of `sweep` and `orphanBranchSweep` onto linked resume arms. Resolve an internal,
cleanup-only roster for that scan; do not publish the general `roster` slot and do not feed recovery,
`workUnitState`, materialization, or any completion-tail consumer.

The private roster preserves the existing ownership boundary. It receives the same resolved developer identity and
currently shipped `team.mode` setting as the primary sweep. When team mode is enabled, roster entries remain
identity-filtered, and any stamped husk whose ownership marker has a different `spawningIdentity` is omitted before
cleanup facts or commands are rendered. A linked scan with no resolved identity emits no actionable worktree cleanup
batch in team mode; it does not broaden the scan to every developer. Solo mode retains the existing unfiltered
machine-local behavior. Orphan refs have no ownership field and keep the primary sweep's identity-neutral rules:
require the errand-record exclusion index and exact merged/shipped classification, but never infer or display an
owner.

The scan excludes the current worktree's exact path so `currentHusk` remains its sole owner. Husk reports gain:

- exact worktree path;
- decoded authorization;
- validated evidence reference or its manual-only reason;
- persisted remote proof;
- typed subject and stamped branch; and
- the existing removable, blocked, or outside decision.

Existing orphan reports remain `{ branch, merged, shippedWorkUnit }`. An unmerged non-shipped orphan without an
exact stamped husk stays visible but manual-only; branch existence alone never fabricates lifecycle authority.

Primary sessions keep their separate `Stale worktrees` and `Branch orphans` sections. Linked sessions render one
conditional `Cleanup residues` batch containing sibling husks and orphan refs, with path-qualified offers and
blocked/manual labels. The section appears on every linked session initialization while a real residue remains and
disappears as soon as the local scan is empty.

Every action is offer-only. The residue itself is the persistence signal, so successful cleanup needs no nudge
marker, identity-global write, or notes synchronization.

### 9. Adapter and workflow boundaries

The current adapter composes existing components rather than teaching workflows about storage:

- lifecycle drivers obtain a port snapshot; abandon and park call `record`, while decompose calls
  `prepareDecompose` and `finalizeDecompose`, and each stages the returned record;
- teardown calls `authorize` and `revalidate` instead of branching on `allowHusk` or trusting `mode`;
- marker decoding and ref-disposition replay live in the shared projection layer;
- lifecycle resolution remains location/record-based and never infers WU state from branch existence;
- cleanup inventories remain machine-local reads over registered worktrees and refs; and
- session-init receives resolved payloads and only renders them.

The Local/backend adapter implements the same port with canonical lifecycle records, optimistic versions, and
eventual reconcile. No workflow checks `pm.mode`, `storage.track_design_docs`, or storage tier. No new per-artifact
storage setting is introduced.

Framework methodology edits land first in `packages/arc-framework/arc/` and sync to `.arc/`. Runtime receipt data is
project-owned operational state and has no package-source counterpart.

## Alternatives & Rationale

- **Treat `--force` as authorization.** Rejected because it is an invocation assertion with no durable proof of
  discard or conservation and cannot protect replay from a changed projection.
- **Authorize relocation from `planned` state alone.** Rejected because an older backlog stub can make the base
  derive to `planned` while newer live artifacts were never conserved.
- **Reuse the composed lifecycle index as the proof.** Rejected because that resolver answers which live candidate
  owns a slug; teardown needs exact transition snapshots, write-set integrity, and explicit read quality.
- **Use code-repo snapshots as the durable port contract.** Rejected because Local/backend storage may hold
  operational state and authored design outside the code repo. Snapshot comparison is one current adapter.
- **Use converged snapshots without a receipt.** Rejected because identical end state cannot distinguish an
  explicitly authorized abandon or conserved allocation from an arbitrary committed deletion.
- **Delete every present remote ref after detach.** Rejected because the live remote can be the only preservation
  proof when patch-landing cannot be established. Remote disposition must distinguish delete from retain.
- **Persist remote residue separately from the husk.** Rejected because it creates another mutable status record;
  the terminal stamp already has to identify the exact remote projection and remains the retry witness.
- **Batch every same-subject husk.** Rejected because stale or malformed candidates would create ambiguous
  all-or-some behavior and could alias a restarted projection. Replay selects one registered path.
- **Rate-limit linked cleanup with a claim or nudge.** Rejected because the residue already represents the condition
  and disappears on success. A marker would add synchronization and retirement semantics without safety value.
- **Keep stamps proof-agnostic and re-read lifecycle state on replay.** Rejected because later lifecycle movement
  cannot explain what authorized the original detach and could reclassify an old projection destructively.
- **Add only a hygiene command.** Rejected because discoverability would still depend on remembering to invoke it,
  which is the observed failure this work addresses.
- **Move all visibility to `session-locus-model`.** Rejected because these drivers would ship without a reachable
  cleanup backstop. Occupancy-aware automation and richer session records remain that work unit's scope.
- **Decompose the authority and awareness legs into separate work units.** Rejected because the new lifecycle
  drivers would otherwise create cleanup residue without a reachable consumer. Both legs operate on the same exact
  stamp/ref contract and form one independently useful deliverable.

## Cross-cutting Considerations

### Security and trust boundaries

- Lifecycle state, receipts, and exact git refs are untrusted inputs until runtime guards validate their closed
  schemas and identity relationships.
- Retirement-record readers reject unknown fields for schema version 1, and allocation-map readers do the same for
  schema version 2. Both reject duplicate identities, path traversal, malformed OIDs, unsupported algorithms, and
  non-canonical serialization.
- Receipt paths are resolved beneath the adapter-owned namespace through the fixed digest-to-record-key encoder;
  `receiptId`, subject values, and branch names never become unchecked filesystem paths.
- Every mutation after authorization is bound to an expected version or OID. No force delete lacks a lease/CAS
  operand.
- Unknown future authorization or evidence values preserve ownership evidence but never select a destructive
  current-mode path.
- A transport or authority degradation fails closed before detach or leaves an exact retry witness after detach.

### Performance

- Receipt hashing is bounded by one WU artifact group or one decompose allocation and runs only at lifecycle
  transition/finalization boundaries.
- Authorization reads a bounded set of deterministic receipt candidates plus exact relevant projections; it does
  not scan accumulated receipts, unrelated history, or the whole base tree.
- Linked cleanup uses network-free registered-worktree and local-ref scans. It does not activate PR sharpening,
  materialization discovery, or completion-tail network calls.
- The clean path emits no cleanup section and creates no persistent write.

### Testing

Verification covers the port, each producer, projection mutation, replay, and rendering:

- Pure unit tests for receipt parsing, canonical digests, direct/unchanged relations, allowed path sets,
  cross-platform digest and filesystem-key golden vectors, snapshot/version projections, version-2 allocation
  coverage, authorization versions, refusal codes, and remote delete/retain/absent decisions.
- Driver tests proving abandon and park stage exact direct-transition receipts; decompose rejects missing, duplicate,
  reasonless-drop, unknown-target, unresolved-locator, incomplete incoming/outgoing edge, ineligible dependency target,
  missing cohort destination, unfinalized, or out-of-allocation state; preserves every unrelated prerequisite while
  replacing an incoming origin edge; interrupted preparation resumes only through the exact persisted locator/token;
  and every version conflict leaves prior state intact.
- Park driver tests proving the full-protection result and partial `--land` result carry the byte-identical receipt and
  planned artifact group, while a changed source commit, conflicting base slug, or outside path refuses without a
  partial base write.
- Teardown unit tests for clean/user-surface gates, pre-detach revalidation, prepared-stamp failure, exact detach,
  force-with-lease remote deletion, retained preservation refs, local CAS, transport failure, stale leases, and
  moved/recreated refs, including a competing projection introduced between remote resolution and local CAS.
- Marker tests for legacy absence, known and unknown authorizations/evidence kinds, exact receipt and shipped evidence,
  explicit remote null, delete/retain proofs, malformed fields, and harmless prepared stamps on branched worktrees.
- Replay tests for exact `--husk` selection, singleton compatibility, repeated same-subject ambiguity, subject-kind
  separation, inside-husk retry, outside-husk user-surface reconciliation, expected planned/completed exemptions,
  result-identity mismatch, same-OID live-restart veto, dirty or moved `HEAD`, and manual-only legacy/unknown cases.
- Session-init tests for non-shipped `currentHusk`, current-path exclusion, linked cleanup-only roster gating,
  team-mode `spawningIdentity` filtering, missing-identity refusal, identity-neutral orphan parity, combined linked
  residue rendering, primary rendering parity, and zero network/completion-tail fan-out.
- Integration and E2E round trips for linked abandon, full/partial park-at-Planning, symmetric decompose, shipped
  remote-only preservation, interrupted decompose preparation/finalization, interrupted remote cleanup, and a
  restarted same-slug work unit.
- Package/project counterpart checks and markdown lint for changed workflows, templates, and reference surfaces.

### Migration and rollout

The marker extension is additive. Legacy stamps decode as `merged-preserved`; lack of remote proof never grants a
remote delete. Existing shipped cleanup continues through its current safe external-worktree fallback. Non-shipped
self-husking activates only when a valid marker, committed driver evidence, exact projection, and revalidation all
exist.

Decompose cut maps are invocation inputs, not durable project records. Schema version 1 may be decoded only to return
an upgrade diagnostic; it cannot authorize a worktree-owning retirement because dropped-source reasons and exact
incoming/outgoing-edge dispositions cannot be inferred safely. The workflow regenerates a version-2 map and
preparation rather than silently converting it. No repository migration is required.

The in-repo adapter lands first with its operational receipt namespace and full test matrix. Local/backend adapters
can implement the port later without changing teardown or workflow call sites. No data migration, config prompt, or
one-time repository rewrite is required.

### User-facing behavior

Pre-detach refusals name the semantic reason and state that the worktree remains branched. Post-detach or replay
refusals name the exact retained husk and any completed remote outcome. Successful creation names the authorization,
branch, exact path, ref outcomes, and outside-worktree cleanup command. Retryable failures distinguish safe retained
work from hygiene not yet completed; no message claims deletion when a lease/CAS operation refused.

## Success Criteria

1. Authorized linked abandon, park-at-Planning, and decompose retirement leave the invoking harness in a readable
   detached checkout stamped with exact subject, branch, `HEAD`, authorization, evidence/result identity, and remote
   disposition.
2. Every non-shipped detach traces to a version-checked driver receipt whose source, complete allowed transition
   patch, result, and direct/unchanged relation match committed projections; `--force`, snapshots alone, or derived
   state alone never authorize it.
   Decompose additionally traces to a directly locatable durable preparation that accounted for every source unit and
   incoming/outgoing dependency edge before mutation and finalized the exact allocation before commit.
3. Missing, malformed, ambiguous, stale, unconserved, uncommitted, or projection-mismatched evidence refuses before
   detach and reports a typed reason. A late authority conflict leaves at most idempotent user-surface reconciliation.
4. A present remote ref is deleted only with its exact authorized lease, retained and re-confirmed at its exact OID
   when it is the sole preservation proof, and never inferred from legacy absence. An unresolved delete or retain
   check blocks local and physical cleanup.
5. Local ref deletion always compares against the authorized OID. Replay exempts the exact evidence-matched
   planned/completed result but leaves a moved ref untouched. A competing registered/lifecycle projection found
   before the remote operation prevents both ref mutations; one found afterward prevents local mutation and leaves
   the exact path-addressable husk with the completed remote outcome for manual resolution.
6. Stamp preparation completes before detach for ARC-managed non-shipped worktrees; a stamp-write failure leaves the
   checkout branched. Branchless plus exact stamped/live `HEAD` remains the terminal-recognition condition.
7. Repeated same-subject husks are individually selectable with `--husk <absolute-path>`; unqualified teardown works
   only for one exact candidate and never chooses or batches ambiguous candidates.
8. Session-init from any linked worktree identifies an exact current husk and batches real sibling husks/orphan refs
   with authorization/ref-aware, path-qualified offers or manual-only labels. The current path is never duplicated.
   Team-mode worktree candidates retain the current `spawningIdentity` boundary and a missing identity never widens
   the linked scan.
9. Primary cleanup behavior remains available, linked cleanup does not enable broader roster consumers, and an empty
   machine-local residue scan emits no section and performs no persistent write.
10. Legacy stamps and shipped markerless cleanup retain their safe behavior; unknown future authorization or evidence
    values stay recognizable but cannot trigger destructive automated replay.
11. The feature adds no lifecycle state, meta schema, user-notes machinery, nudge/claim state, storage configuration,
    or storage-mode branch in workflows.
12. Unit, integration, E2E, type, lint, build, package/project sync, and documentation checks pass with failure-path
    coverage for every directional operation.

## Open Questions

None. Implementation-local naming and module placement may vary, but the authority port, receipt namespace and
relations, ref dispositions, teardown ordering, compatibility behavior, and linked-session payloads above are fixed.

---
