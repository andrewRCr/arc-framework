# Spec (`detailed` · `RFC`): Decompose Transform Integrity

- **Origin:** [internal]

- **Purpose:** Make decomposition a trustworthy, low-friction transform over ARC's real planning topology:
  conserve the complete source, preserve settled planning authority, produce a base-landable result, and prove the
  transition without operator-authored evidence or new coordination state.

---

## Introduction / Context

ARC's shipped decomposition machinery does not yet implement the topology its workflows prescribe. A started work
unit normally lives on a planning branch while the integration base retains an earlier backlog projection. The
symmetric transform expects a base-rooted result but derives write authority from the current checkout; extraction
authors result artifacts on the surviving source branch even though its ship leg expects a base-cut result branch.
The positive tests flatten that distinction by placing source artifacts on base or installing only part of the
real hook chain.

The resulting failures span one coupled transform contract:

- Source conservation accounts for the origin artifact group but not unrelated branch-private riders that a
  retirement would strand.
- Markdown allocation at H2 is too coarse for conventional nested specs and too permissive when no whole H2 can
  move, allowing an empty conservation record.
- New-member scaffolding assumes `meta-*` plus `draft-*`, so a decomposition discovered after a reviewed spec or
  during task skeletonization discards completed planning authority and restarts design work.
- Finalization is exact but not recoverable after ordinary, approved destination refinement; descendant-base
  landing, merge-parent projection, the planning lane, and remote teardown each interpret the receipt differently.
- Reconcile warns about ordinary historical prose referring to a decomposed work unit, while durable receipt
  lookup launches one Git process per record and grows in cost with routine decomposition.

These are not independent conveniences. They determine whether one approved allocation can be prepared, authored,
finalized, committed, landed, reconciled, and cleaned up without semantic drift. This RFC therefore treats
decomposition as one closed, versioned transform and makes every lifecycle consumer derive authority from the same
validated result.

## Goals

1. Run every decomposition arm against the real separation between an exact source projection and a base-rooted
   result projection.
2. Prove that retiring transforms conserve all expected source work and refuse unaccounted branch-private riders
   before creating result residue.
3. Make allocation fine-grained and exact enough for ordinary nested Markdown without inventing a new authoring
   language.
4. Preserve the latest completed planning authority when creating members, including direct entry at
   `generate-tasks` from complete child specs.
5. Keep finalization exact while making safe pre-commit retries, destination refinements, and unrelated base
   movement routine.
6. Give commit hooks, project-readiness projection, exact-ref classification, merge validation, and teardown one
   version-aware interpretation of finalized decomposition evidence.
7. Keep semantic judgment at the distribution interlock while hiding deterministic proof mechanics behind CLI
   verbs and typed results.
8. Exercise the full lifecycle in realistic Git topology with the complete hook chain and direct recovery cases.
9. Preserve durable historical receipts while bounding their enumeration cost and avoiding a second state system.

## Non-Goals

- Define when work should decompose, how to distinguish a cohort from a stack, or what tripwires should trigger a
  cut. Those are decomposition-doctrine concerns.
- Generalize mint-time inheritance or close-with-launch behavior for every new work unit. This RFC owns only the
  planning artifacts and entry stage produced by decomposition.
- Keep a fully retiring origin alive and retarget it to an arbitrary member. Extraction remains the shape for a
  genuine semantic survivor; rename may compose with it separately.
- Transport arbitrary branch-private changes from the source worktree to the result, or turn the cut map into a
  general patch carrier.
- Add receipt expiry, garbage collection, compaction records, acknowledgements, transactions, pending-state
  records, or another durable store.
- Consolidate the ROADMAP renderer family, rename or dematerialize ROADMAP, or design the future generic
  record-to-projection engine.
- Add a partial-spec, `create-spec`, ready-to-activate, mixed-maturity, or arbitrary artifact-bundle entry mode.
- Change historical v1/v2 receipt meaning or permit obsolete cut-map schemas to author new transforms.

## Proposed Design

### D1. Establish exact source and result projections before mutation

The transform resolves two explicit projections:

- The **source projection** is the exact committed work-unit branch and head whose content will be allocated.
- The **result projection** is the checkout and index that will land on the configured integration base. Under full
  protection it is a `chore/decompose-<origin>` branch cut from base; under partial protection it is the base
  checkout itself.

The read-only preflight emits the starter map without creating a branch. After that map is authored, the
`--cut-map` invocation starts from the base checkout and validates the complete map, exact source binding,
retirement-only branch delta, destinations, and exact result base before mutation. Under full protection the CLI
then creates and occupies the result branch at that validated base object; branch creation is not external workflow
choreography. A preflight or completed-map refusal therefore leaves no result branch. Under partial protection the
validated base checkout remains the result.

Preparation, candidate staging, semantic authoring, finalization, and commit remain in that one result checkout and
index. The staged candidate is reversible and the source branch remains exact and read-only until receipt-backed
teardown. No staged patch moves between worktrees. A failure after successful branch creation names the candidate
branch and its direct retry or discard action; it is not represented as durable pending state.

The transform arms apply the split as follows:

- A started symmetric or heterogeneous retirement reads the planning source, proves and removes its unchanged
  predecessor stub from the result when one exists, and writes the complete replacement on the result.
- A backlog-stub source reads and mutates the same base-rooted projection and owes no planning-branch teardown.
- Heterogeneous destinations must already be writable in the result projection. A branch-private existing work
  unit is not a destination for this atomic transform.
- Extraction runs an additive result leg first. After that result is reachable from the integration base, an
  explicit source-side finish leg revalidates the same cut map and landed destinations, previews the thinning,
  and removes only the approved source blocks.

Extraction's finish leg is independently retryable and idempotent. Changed source content produces a refreshed
preview whose machine-owned identities are regenerated while still-valid semantic choices are retained. Missing
destinations refuse with the exact locator and retry action. Losing the temporary cut map requires regenerating
the read-only inventory and reauthoring it against the already-landed destinations; the surviving source and Git
history provide proportionate recovery, so extraction gains no receipt or transaction record.

### D2. Refuse unaccounted retirement delta

Before a retiring transform mutates the result, it compares the exact source with the source/result merge base and classifies
the source-only delta. The expected lifecycle projection includes the origin artifact relocation, removal of its
predecessor, and derived ROADMAP movement. Any other source-private path that is not already identical on the
result is an unaccounted rider and refuses the transform.

The refusal names each path and directs the operator to ship it through its own route before retrying. The cut map
cannot absorb the rider. Extraction skips this retirement-only check because the source branch survives and the
finish leg has authority solely over allocated planning blocks; committed implementation work and other
branch-private changes remain on that branch.

The result-side removal of a predecessor stub is narrow: it must be proven as the unchanged base ancestor of the
started source artifact group. That projected removal does not close the source's user workspace; post-landing,
receipt-backed teardown owns closure.

### D3. Introduce v3 allocation and transition evidence

New transforms use schema v3 for the cut map, preparation, and finalized receipt. V3 adds the exact data needed by
the transform without creating a new record family:

- Section locators include heading level, ancestry, and occurrence identity.
- Every allocation carries a machine-emitted source-unit identity and content digest.
- The finalized receipt retains the prepared result-base head.
- The transition binding records the exact stored-content state and mode before and after every touched path.

The v3 section locator is a closed object with `artifact`, `kind: section`, `level`, `headingSource`, `ancestry`,
and `occurrence`. Each `ancestry` entry is the closed tuple `{ level, headingSource, occurrence }` for one parent,
ordered outermost to innermost. `level` is the integer 2-6. `headingSource` uses the existing canonical heading-text
normalization: remove ATX opening and optional closing markers, collapse horizontal whitespace, trim it, and
normalize to NFC; Setext H2 retains the existing captured-paragraph normalization.

The scanner maintains a heading stack. Before adding a heading at level L, it removes every stacked heading whose
level is greater than or equal to L; the remaining last entry is the parent. Heading-level jumps are legal, so an
H5 may be the direct child of an H2. `occurrence` is zero-based among headings with the same level and normalized
source that share that exact parent identity; top-level H2 headings use the empty ancestry. Source IDs are the
canonical digest of `{ schemaVersion: 3, sourcePath, sourceLocator }`, where `sourceLocator` is that exact closed
object. Content digests remain separately bound to each allocation.

The remaining v3 evidence fields are closed as follows:

- `receiptId` remains the canonical digest of `{ schemaVersion: 3, subject, transition: decompose, sourceBranch,
  sourceHead }`, so one exact source transition keeps one record path across an unlanded base refresh.
- Preparation stores unique UTF-8 path-sorted `allowedPaths` plus their `allowedPathsDigest`. Its
  `resultBase.head` is the exact `locator.scope.resultProjection.head`.
- `preparationId` is the canonical digest of `{ receiptId, resultBaseHead, sourceInventoryDigest,
  incomingEdgeInventoryDigest, outgoingEdgeInventoryDigest, cutMapDigest, allowedPathsDigest }`.
- The finalized receipt adds `resultBase: { head }` and a `transitionPatch` array while retaining
  `transitionPatchDigest`. Its decompose result retains the preparation ID, allocation, inventories, inventory
  digests, cut-map digest, target digests, and transformed incoming dependents.

A transition-patch path state is exactly `absent` or `file`. `file` carries a regular-file mode (`100644` or
`100755`) and the existing canonical digest of the stored bytes; it does not persist a Git blob OID. Every patch
entry is the closed tuple `{ path, before, after }`. `before` is read from `resultBase`, `after` from the finalized
candidate, and the two states must differ. Entries are unique and UTF-8 path-sorted and cover every changed
non-receipt managed path exactly once. The receipt path is excluded to avoid recursive identity.

An existing file preserves its input mode, and a new managed file uses `100644`. Symlinks, submodules, unknown
object types, and unexpected mode changes refuse. `transitionPatchDigest` is the canonical digest of the exact
ordered array. The closed v3 decoder recomputes receipt ID, preparation ID, allowed-path digest, cut-map and
inventory digests, and transition-patch digest before granting authority.

A read-only preflight resolves the exact committed source and emits a ready-to-author v3 cut map containing
artifact names, canonical source-unit IDs, hierarchy-qualified locators, content digests, and dependency edges.
The operator authors only destinations, ownership, dependency dispositions, and reasons. Preflight creates no
branch, preparation, cache, or durable state. The later `--cut-map` run validates the completed authored map before
it creates a result branch, then preparation independently re-derives the inventory after entering the exact result
projection and rejects any intervening drift.

New-transform authoring accepts v3 only. A v1/v2 map receives a deterministic upgrade refusal rather than implicit
reinterpretation. Durable readers continue to decode and validate historical v1/v2 receipts under their original
closed schemas, receipt identities, and paths. Existing records are never rewritten or migrated.

### D4. Allocate disjoint Markdown blocks and enforce ownership

Markdown inventory becomes a disjoint, exhaustive sequence:

1. Content before the first H2 is the artifact preamble.
2. Each recognized H2-H6 opens one block that ends immediately before the next recognized H2-H6.
3. A parent block contains only its own lead content; nested headings start separate, non-overlapping blocks.
4. Existing fence, HTML, quote, and list protections continue to exclude incidental heading syntax.
5. Non-Markdown artifacts remain whole-file allocation units.

When one block still contains concerns for multiple destinations, the source is refined with ordinary Markdown
subheadings and committed before preflight is rerun. V3 does not add line ranges, allocation markers, selectable
overlapping frontiers, or any other document language.

Every source unit is allocated exactly once or explicitly dropped with a reason. `destination-owned` material has
exactly one authoritative new member, surviving origin, or existing home. Multiple consumers use pointers and
seam coordination rather than shared ownership. `cohort-shared` is reserved for genuinely ownerless sequencing,
constraints, provenance, and closeout material in the cohort document; task-driving design cannot use it.

Destination kind and ownership are validated together. Cohortless decomposition still rejects cohort-shared
material. At fanout cap, the existing parent cohort document is the valid cohort-coordination destination; no new
destination kind or coordination artifact is introduced. Extraction must assign at least one real source unit to
every extracted new member, so an empty allocation cannot stand in for conservation.

### D5. Preserve completed planning maturity

New members use one homogeneous profile inferred from their v3 design destinations:

| Completed authority at the cut | Required output per new member        | Entry workflow   |
| ------------------------------ | ------------------------------------- | ---------------- |
| No finalized, reviewed spec    | Complete `draft-<member>.md`          | `draft-design`   |
| Finalized, reviewed spec       | Complete single or paired member spec | `generate-tasks` |

Every new member must receive design content in exactly one entry profile, and all new members in the transform
must use the same profile. Missing design destinations, mixed draft/spec members, or a draft plus any spec
authority for one member refuse before mutation. Existing-home destinations retain their own lifecycle state and
are excluded from homogeneity.

The mature profile is eligible only when the exact source metadata points either to one conventional finalized
`spec-<origin>.md` or to the sanctioned layered pair `spec-<origin>-prd.md` plus
`spec-<origin>-rfc.md`, all present in the source inventory. Any other multi-spec set refuses. Target locators then
infer and validate the output profile; no maturity field or operator-entered stage value is added.

Every new member mirrors that source spec family. A single-spec source yields one complete
`spec-<member>.md`. A layered source yields both `spec-<member>-prd.md` and `spec-<member>-rfc.md`, with the PRD
owning the shared context spine and the referential RFC owning technical design. Metadata records both paired files
in the existing comma-separated `Design` shape. All source units from both parent specs remain subject to exact
allocation and the distribution interlock reviews the child pair as one complementary authority. Layering does not
create another maturity profile or entry workflow.

There is no `create-spec` entry. If a cut becomes apparent during spec authoring, the holistic spec is completed
and reviewed before decomposition. If the cut prevents that without reopening design, the draft profile is used.
The mature profile is eligible only when partitioning the reviewed design does not reopen a decision.

Mature child specs are complete, self-contained semantic projections of the reviewed parent spec. Task-driving
design still has one authoritative destination. Shared context may be repeated for self-containment, while truly
ownerless sequencing remains in cohort coordination.

An approved parent task skeleton may also be conserved. Because the exact source cannot read an uncommitted
worktree, the existing structural-pass approval authorizes one source checkpoint commit when the skeleton is worth
carrying. This adds no review gate, receipt, or manually supplied evidence. Allocated
`tasks-<member>.md` files are provisional seeds; omitting them remains valid.

The result scaffold returns the profile-appropriate managed destinations and allowed paths. The workflow authors
the semantic draft, spec, and optional task content; the CLI does not synthesize or judge that content.

The existing mandatory decomposition interlock moves to the post-authoring, pre-finalization boundary; it is not
duplicated. It surfaces the approved map beside the actual child artifacts, heterogeneous target edits, and planned
origin, dependency, and ROADMAP delta. For the mature profile it confirms that every child spec or sanctioned pair
is complete and self-contained, every allocation is represented, and partitioning introduced no new design
decision. This is a review of the distribution, not a replay of `draft-design`, `create-spec`, or their adversarial
reviews. A failed distribution remains an uncommitted result candidate that can be corrected or discarded; it
cannot enter `generate-tasks`.

Generated member metadata uses the existing fields:

- Draft profile: `State: Planning`, the member draft as `Design`, `Current Workflow: draft-design`, no task-list
  pointer, and the begin-workflow action sentinel.
- Mature profile: `State: Planning`, the single or paired member spec authority as `Design`,
  `Current Workflow: generate-tasks`, no task-list pointer, and the begin-workflow action sentinel.

`arc start` preserves a valid planning workflow already recorded on a graduated work unit. If it is unset, start
derives `generate-tasks` from a spec design and `draft-design` from a draft or absent design. An inconsistent tuple
refuses with a direct remedy instead of resetting to `draft-design`.

At mature-child entry, `generate-tasks` starts from its normal depth/Class assessment. A conventional tasks file
with no metadata pointer is read only as a provisional structural seed and may be retained, rewritten, or
discarded during structural decomposition. The task-list pointer is set only by ordinary task-list finalization
after content, grounding, review, and interlock checks pass.

These profiles apply to both retired-origin decomposition and extraction of unbuilt scope. The existing full-split
escape hatch remains the route when Active implementation belongs to several results.

### D6. Make finalization exact, idempotent, and refreshable

For a retirement, finalization is unavailable until the post-authoring distribution interlock approves the actual
candidate. It revalidates that candidate and seals the already-authorized transform. Extraction creates no
retirement receipt; the same distribution interlock instead gates its additive result commit, and the later
source-finish leg retains its separate thinning interlock.

The finalize command handles four states:

- A preparation is finalized normally.
- A finalized receipt whose staged candidate still matches returns typed `already-finalized` success.
- A finalized receipt absent from the result parent may be refreshed after approved destination edits.
- A committed receipt that remains absent from the integration base may be rebound to a newer exact base through
  the unlanded base-refresh path below.

Refresh is allowed only while the receipt is uncommitted and the exact source, allocation, inventories,
result-base preconditions, dependency allocation, and closed allowed-path set still validate. It recomputes the
transition patch and destination digests and replaces only the staged receipt. Once committed, semantic destination
refinement waits until the decomposition result lands and proceeds as a separate ordinary content change.

A committed receipt is immutable once reachable from the configured integration base. Before that point, unrelated
base movement may use one narrow append-only refresh without rewriting published history:

1. Update the result branch to the observed base through the normal append-only reconcile.
2. Prove the old receipt is canonical, absent from the integration base, and still binds the exact source,
   allocation, inventories, allowed paths, and semantic target digests.
3. Refuse any changed semantic destination, new incoming dependency on the origin, or conflicting touched path.
4. Internally derive a new preparation ID, result base, transition patch, and patch digest; regenerate only
   base-derived candidate paths such as ROADMAP.
5. Replace the live-tree receipt at the same receipt-ID path and commit that refresh normally.

The prior receipt remains only in unlanded branch history; the candidate tree and its exact diff against base carry
one current receipt. The local commit validator recognizes only this fully validated old-to-new v3 refresh. It adds
no refresh record, token, operator-authored evidence, force push, rebase, or amend path.

Unsafe retries return a typed mismatch with a concrete locus: record state, source projection, result-base
precondition, path, mode, destination content, or dependency. The operator is given the direct refresh, re-preflight,
or reauthor action. No rollback record or second preparation store is added.

A single version-aware finalized-decompose validator owns:

1. Closed schema decoding and receipt identity.
2. Source and allocation inventory validation.
3. Target and dependency bindings.
4. Result-base and touched-path preconditions.
5. Exact mode-aware candidate patch derivation.

The commit hook, exact-ref planning classifier, landing adapter, and transition-overlay adapter consume this typed
result. Receipt-shaped JSON that does not pass the full decoder and validator grants no authority.

### D7. Admit safe descendant-base landing

The exact-parent case remains the default. A v3 result may land on a descendant of its prepared base only when:

- Every touched path still has the prepared pre-mutation stored-content state and mode.
- Applying the exact authorized patch yields the candidate result.
- No incoming change adds a dependency on the retired origin.
- The host binds the successful validation to the exact current base and head and reruns it after either moves.

This check belongs in the existing exact-base/head adapter used by the merge gate. Unrelated base movement is
accepted without operator action; a conflicting path or dependency is a hard failure with a direct remedy, never a
fallback from a planning lane to reviewed.

When the host cannot bind validation to the live candidate, the workflow updates the result branch append-only and
uses the committed-unlanded refresh to bind the one current receipt to the exact parent. The landing attempt requires
that base object to remain current; another base move repeats the typed refresh path. It never asks the operator for
a base object, receipt reconstruction, or other proof material. Partial-protection direct commits naturally retain
the exact current base parent.

### D8. Derive one validated transition overlay and planning-lane exception

The structured project-readiness projection accepts a validated transition overlay stating that one decompose
candidate supersedes its origin. Markdown rendering does not discover or reinterpret the transition. The current
tracked-ROADMAP adapter derives the overlay from the one finalized receipt represented by the candidate.

During merge-like operations, the adapter considers relevant operation parents but selects a receipt only when the
shared validator derives the current candidate from its durable result-base and patch binding. A receipt that is
merely historical or absent from another parent supplies no authority. Multiple or contradictory candidates fail
closed. The pre-commit assertion and conflict remedy consume the same structured projection.

The exact-ref classifier returns `planning` for a decomposition only when:

- Exactly one canonical v3 finalized decompose receipt is added by the candidate.
- The shared validator proves that receipt against the exact change.
- Every other changed endpoint already belongs to the planning lane.

Malformed or legacy receipts, multiple receipt additions, unrelated record transitions, foreign-owner changes,
code, rules, strategies, or other riders keep the change reviewed. An invalid receipt for a purported retirement
also fails the retirement gate. The classifier and merge-gate ownership recipe change together.

The receipt proves mechanical fidelity, not semantic approval. The post-authoring distribution interlock remains
the human authority over destinations, dependencies, ownership, reasoned drops, and actual child completeness. No
approval credential, signature, or semantic classifier is added to the record.

### D9. Calibrate reconciliation, receipt enumeration, and teardown

Current-work-unit reconciliation keeps exact dependency repair, dangling origin-artifact detection, and all
existing rename/removal behavior. It emits no advisory solely because ordinary narrative prose names a work unit
whose reachable terminal transition is `decompose`. A decomposed identity remains valid historical context.
Backticked artifact references and structured dependencies continue through their existing integrity rules. No
informational severity, prose classifier, marker syntax, or acknowledgement state is introduced.

Retirement receipts remain a durable transition ledger. Enumeration replaces one `git show` process per record
with batched Git object reads while preserving complete namespace validation, stable ordering, and typed failures.
A many-receipt fixture proves bounded process fan-out. Raw receipt count or age does not trigger pruning.

Receipt-backed teardown continues to require the exact local source head. For the observed remote planning ref:

- Absent is already resolved.
- Equal to the source head is safe to delete.
- A strict ancestor of the source head is safe to delete because it contains no unique remote work.
- A descendant or divergent ref refuses.

Deletion uses the observed remote object as an exact compare-and-delete lease so a concurrent move vetoes cleanup.
No publish-only-to-delete round trip or additional cleanup state is required.

### D10. Keep routine operation below the proof boundary

Deterministic logic stays in typed CLI/lib code. Workflows invoke verbs and present precomputed results; they do
not evaluate Git topology, receipt identity, schema fields, or retry eligibility in prose. Existing artifact paths
and metadata fields remain the storage boundary, with no new mode or configuration axis.

The happy path adds only the interaction inherent in the operation:

- Retirement: read-only preflight, map authoring, CLI-owned validation/scaffolding, semantic distribution, the one
  relocated distribution interlock, finalization, and the existing commit/ship release.
- Extraction: the same authored-result sequence and distribution interlock, followed after landing by one explicit,
  reviewable source-finish leg.

Operators never calculate digests, locate object IDs, transcribe machine fields, reconstruct receipts, or perform
Git-object archaeology. Idempotent retries report success. Safe wording edits and unrelated base movement refresh
or validate automatically. Refusals name the exact path, source block, locator, dependency, or record condition and
the immediate recovery action.

## Alternatives & Rationale

### Transport the source patch into a result worktree

Rejected. The preparation already distinguishes exact source and result projections. Moving a staged patch between
worktrees would duplicate that abstraction, obscure authority, and add recovery obligations for partial transport.
A base-rooted result that reads an immutable source is simpler and makes the landed candidate directly provable.

### Preserve arbitrary source-branch riders in the cut map

Rejected. Decomposition is a planning transform, not a branch migration primitive. Expanding allocation to carry
code, rules, or unrelated planning would weaken the anti-rider boundary and make semantic review unbounded.
Retirement refuses riders; extraction preserves them on its surviving branch.

### Add line-range allocation, Markdown markers, or overlapping sections

Rejected. Each creates a new authoring language with fragile identity and additional operator precision. Disjoint
H2-H6 blocks plus ordinary subheading refinement provide exact coverage with familiar Markdown.

### Add an extraction receipt or cross-branch transaction

Rejected. Extraction is additive-first and non-destructive until its explicit finish leg. Duplicated scope is
visible, the source survives, and Git history permits recovery. A persistent coordinator would add machinery
without eliminating an irreversible intermediate state.

### Expire, compact, or acknowledge retirement receipts

Rejected. Time cannot prove that offline work units and future consumers no longer need provenance. Current storage
volume is immaterial; the measured issue is per-record process fan-out. Batched reads address that cost without
retention policy or a new record family.

### Enter decomposed members at `create-spec` or ready-to-activate

Rejected. A partial spec is not durable reviewed authority, while a parent task list is not a finalized child plan.
The two completed-authority boundaries are sufficient: complete drafts restart design, and complete specs restart
task derivation. This preserves validated work without smuggling unfinished planning past its normal checks.

### Flatten a layered PRD/RFC into one child spec

Rejected. Layering is a sanctioned authority shape with distinct product and engineering ownership. Flattening it
during decomposition would discard that boundary and make downstream `Design` metadata misrepresent the reviewed
source. Paired sources therefore produce paired child authority within the same mature profile.

### Keep and rename a retiring origin as one arbitrary child

Rejected. Lifecycle identity should follow semantic continuity, not shell reuse. Retaining an unrelated child would
make provenance misleading and force special cases across conservation and teardown. A true survivor uses
extraction and may be renamed afterward with the existing operation.

### Broaden the planning lane for the retirement namespace

Rejected. Path-based admission would let malformed evidence or unrelated retirement records bypass review. The
narrow exception is one fully validated v3 decompose receipt accompanying an otherwise planning-only exact change.

### Consolidate ROADMAP rendering or build the future record engine here

Rejected. The lasting contract needed by decomposition is only a validated transition overlay at the structured
projection boundary. Renderer consolidation and operational-state materialization have separate owners and a
different migration horizon.

### Add a second child-spec review ceremony

Rejected. A pre-authoring interlock cannot inspect content that does not exist yet, but adding a second stop would
add friction without adding authority. Placing the one distribution interlock after semantic authoring lets it
review the actual child artifacts before finalization or commit.

### Bind preflight with a token or pending record

Rejected. The completed map and exact source can be validated synchronously by the command that owns result-branch
creation, and preparation revalidates them after entering the result projection. A token would introduce recovery
and expiry semantics without closing a state the ordered command cannot already close.

### Rebase or amend a published result to refresh its receipt

Rejected. Rewriting the result branch would orphan commit-bound evidence and require a force push. The narrow
unlanded refresh preserves append-only history, replaces only the candidate-tree receipt, and remains unavailable
after the receipt reaches the integration base.

## Cross-cutting Considerations

### Trust and failure behavior

All destructive authority is bound to exact, versioned evidence. Source drift, target drift, mode changes,
unaccounted paths, ambiguous receipts, dependency reintroduction, and remote divergence fail closed before their
respective destructive action. Semantic allocation remains human-approved; validation cannot infer intent from
content or convert a mechanical receipt into an approval credential.

### Compatibility and migration

V3 is forward-only for authoring new transforms. Historical v1/v2 receipts remain readable and retain their
original identity and validation rules, but they receive none of the new planning-lane authority. No persisted
record is migrated. Existing draft-profile behavior remains valid, and projects that never use mature
decomposition see no new workflow choice.

Historical decoding is an operational safety obligation, not a public compatibility alias: current receipts still
authorize teardown and explain terminal lifecycle state for offline or long-running work. Clearing them would
discard live provenance.

The implementation uses the existing Zod/kernel contract boundary, pure injectable library logic, command
orchestration, conventional WU artifacts, and existing metadata fields. It introduces no dependency,
infrastructure component, or configuration key.

### Storage and procedure evolution

The design treats paths and Git refs as the current storage adapter, not as work-unit identity. The v3 record is
version-checked and storage-agnostic in meaning, so it can move with the existing record substrate. Planning
maturity is inferred from ordinary design artifacts rather than a new tracking field. Workflow prose receives
typed verdicts and direct actions from the CLI; deterministic topology and schema logic do not grow in the
stochastic instruction layer.

The staged-index transition-overlay adapter is explicitly interim. The structured overlay contract survives if
ROADMAP becomes materialized operational state; Git-operation-parent discovery may then disappear without changing
decomposition semantics.

### Performance

Inventory and candidate validation remain proportional to the touched artifacts and paths. Receipt enumeration
batches object access so Git subprocess count does not scale linearly with receipt count. No cache or mutable index
is introduced; measured tree-size pressure, not speculation, would justify future retention work.

### Testing

Unit tests cover the exact v3 preparation/receipt identities and patch-state schema, disjoint Markdown inventory,
single/paired profile inference, ownership coupling, typed mismatch categories, mode-aware patches, descendant-base
checks, remote ancestry classification, narrative reconcile filtering, and batched receipt enumeration.

Integration tests cover command/lib composition, preflight-to-prepare drift detection, complete destination
allocation, uncommitted and committed-unlanded finalization refresh, layered child distribution, extraction finish
retries, start-stage preservation, provisional-task behavior, transition-overlay selection across operation
parents, and exact-ref lane classification.

E2E fixtures create work units through the normal lifecycle, keep planning artifacts branch-private, use the real
base predecessor state, install the complete pre-commit chain, and exercise the actual commit and landing
boundaries. The suite includes both protection modes where behavior differs. It verifies the already-landed
ROADMAP supersession fix against a real decomposition and implements only any remaining transform-local gap.

### Rollout and package/project sync

Implementation proceeds as one schema-and-consumer migration: land v3 decoding/validation and tests before
granting any new classifier or landing authority. The new authoring path then replaces v2 output while v1/v2 read
paths remain isolated. Workflow and other adopter-facing methodology edits are made in package source and synced
through the project mechanism; internal planning artifacts remain project-only.

## Success Criteria

- A normally started symmetric work unit decomposes from its branch-private source into a base-rooted result and
  commits with the repository's complete hook chain.
- A backlog-stub source and a heterogeneous retirement follow the same result authority; read-only or completed-map
  refusal occurs before CLI-owned result-branch creation.
- Retirement refuses every unexpected source-private rider by path; extraction with committed Active code does
  not misclassify retained code as a rider.
- Preflight emits a complete v3 starter map whose H2-H6 units use the specified parent-stack, sibling-occurrence,
  heading-normalization, and source-ID algorithm.
- V3 decoding rejects any non-canonical preparation ID, allowed-path digest, result-base binding, path-state shape,
  patch ordering, mode, receipt identity, or transition-patch digest before granting authority.
- The `--cut-map` run refuses empty extracted-member allocation, missing or mixed design destinations, invalid
  ownership/destination combinations, unaccounted riders, and source drift before it creates the result branch;
  preparation revalidates after entering the result projection.
- Draft-profile members retain current behavior, while mature members preserve the parent's single or layered spec
  family, enter `generate-tasks`, and keep `Task List: [none]`.
- The one relocated distribution interlock reviews the actual mature child specs and refuses finalization or commit
  when a child is incomplete, an allocation is absent, or partitioning reopened design.
- A mature member with a provisional task seed reruns normal task generation, may rewrite the seed, and sets its
  pointer only at ordinary finalization.
- `arc start` preserves or safely derives the valid member workflow and refuses an inconsistent metadata/design
  tuple instead of resetting it.
- Extraction lands destinations first, finishes source thinning separately, and safely handles changed-source,
  already-finished, missing-destination, and lost-scratch recovery without persistent coordination state.
- Finalize succeeds idempotently, refreshes an approved uncommitted destination-only edit, performs a constrained
  append-only refresh for a committed but unlanded receipt after unrelated base movement, and names the exact unsafe
  mismatch locus.
- A candidate lands over unrelated descendant-base movement only when touched-path, mode, patch, dependency, and
  exact-head binding checks all succeed; material conflicts refuse with a direct remedy.
- Pre-commit projection and merge-conflict recovery derive the same one-receipt supersession overlay across
  ordinary and merge-parent topologies.
- Exact-ref classification admits exactly one fully validated v3 decomposition companion to an otherwise
  planning-only change and rejects all malformed, legacy, multiple-record, or rider cases.
- Current-work-unit reconcile reports no advisory for plain narrative history naming a decomposed identity while
  retaining dependency, dangling-artifact, rename, and removal checks.
- A many-receipt fixture proves batched object reads with bounded Git process fan-out and no receipt pruning.
- Teardown deletes absent, equal, and stale-ancestor remote source refs safely under the observed-object lease and
  refuses descendants, divergence, or concurrent movement.
- No routine successful or recoverable path asks the operator to supply a digest, Git object ID, receipt identity,
  base head, or reconstructed evidence record.

## Open Questions

[none]
