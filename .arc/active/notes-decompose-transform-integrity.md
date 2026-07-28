# Notes: Decompose Transform Integrity

## Manual Decomposition

This planning branch manually bootstraps the transform topology that the work unit will make reliable. It creates
no synthetic cut map, preparation, receipt, candidate branch, or automated launch.

The durable human anchor is `cohort-decompose-transform-integrity.md`. The active origin survives as the core and
is the initial continuation. Child metas own current dependencies and lifecycle state:

- `decompose-base-mobility` depends on the core.
- `decompose-extraction` depends on the core.
- `decompose-durable-consumers` depends on the core.
- `decompose-planning-lane` depends on the core and base mobility.

All child artifacts begin at `generate-tasks`. Their task files are provisional content-fill drafts and their
metadata intentionally retains `Task List: [none]` until each member completes normal task-list finalization.

## Scope and Size Estimate

The pre-split implementation estimate was roughly 12k-17k diff lines. The current low-confidence partition is:

| Member                          | Rough implementation diff |
| ------------------------------- | ------------------------: |
| `decompose-transform-integrity` |                   5k-8.5k |
| `decompose-base-mobility`       |                     1k-2k |
| `decompose-extraction`          |                   2k-3.5k |
| `decompose-durable-consumers`   |                   0.8k-2k |
| `decompose-planning-lane`       |                   1.5k-3k |

The core may remain above the normal 5k target, but its remaining surfaces form the one authority spine:
schema/inventory → exact plan → scaffolding/finalization → publication/projection. Splitting inside that chain now
would create temporary duplicated validators or an artificial dependency WU rather than an independently useful
delivery. Review chunking or stacked delivery can separate review/merge boundaries if the measured implementation
diff reaches the upper end.

## Manual Delivery Stack

This work unit uses disposable delivery refs to give each bounded slice its own exact `merge-ok` target while the
canonical WU state remains anchored to `feat/decompose-transform-integrity`. The local stack begins:

1. `feat/decompose-transform-integrity-delivery-00-planning` — planning and lifecycle artifacts through
   `421f4caaf`.
2. `feat/decompose-transform-integrity-delivery-01-authority` — Phase 1 through `31ad6078b`, plus the temporary
   compatibility cap that keeps the established public decomposition lifecycle intact.
3. `feat/decompose-transform-integrity-delivery-02-plan` — Phase 2 through `bb2fb1c46`, inheriting that cap while
   the v3 mutation runtime remains internal.
4. `feat/decompose-transform-integrity-delivery-03-finalization` — Phase 3 through `4006303c9`, removing the
   temporary cap only after the finalized-candidate lifecycle is coherent.

Later implementation slices extend the stack from the preceding landed tree. Delivery refs carry no independent
ARC meta, notes, or lifecycle identity.

For every slice after the first: merge updated `main` into the delivery branch before retargeting its PR to
`main`; the merge must move the head so `merge-ok` evaluates the exact new base/head pair. Never carry a green
result across retargeting, rewrite a published delivery ref, or merge a slice whose tree is not independently
green and semantically coherent. A stalled stack leaves `main` at the last complete slice; the next ref remains
unmerged and may be abandoned without rollback.

Review chunking applies within each attention-heavy delivery. The complete series also receives union-coverage and
cross-delivery seam review; no local chunk report or earlier stacked-base result grants terminal authority.

## Implementation Grounding

- `packages/arc-framework/src/lib/work-unit/composed-lifecycle-index.ts` contains
  `resolveComposedLifecycleIndex`, the current write-authority seam that exposed the mismatch between a base-rooted
  result checkout and branch-private planning source artifacts.
- `packages/arc-framework/__tests__/e2e/lifecycle-exit.e2e.test.ts` scaffolds a started origin in a linked
  worktree but invokes decomposition from the base checkout, then installs only
  `hook-validate-decompose-record`. The replacement fixture needs normal CLI initialization and the complete
  shipped hook chain.
- `packages/arc-framework/__tests__/integration/decompose-shapes.test.ts` contains positive shapes with empty
  `sourceAllocations`. Those fixtures are regression targets for v3 conservation requirements.
- A real symmetric attempt exposed unrelated source-private riders, including another planning stub and a project
  rule edit. Retirement acceptance should include both planning and non-planning rider examples.
- Merge-parent coverage must include a finalized receipt inherited from the first parent and absent from
  `MERGE_HEAD`; that topology previously allowed ROADMAP regeneration to resurrect the retired origin.
- The staged ROADMAP supersession correction landed in `9704cc42c`. Validate it through the real transform and
  implement only remaining transform-local gaps.

## Phase 1 Grounding

The legacy cleanup begins with exactly two decomposition receipts:

- `.arc/system/.internal/retirement-receipts/sha256-07d775a08ce484dadd4c699ebe19083c64cf9ec1f7714722ab73176edda8edbe.json`
  is the v1 `cli-substrate-adoption` record.
- `.arc/system/.internal/retirement-receipts/sha256-9587d5abca663f712032f64834df60620a7c6552819d9395e74adbb3ab55a9dc.json`
  is the v2 `review-protocol-alignment` record.

Seven other repository receipts remain owned by rename and abandon. `retirement-record-enumeration.ts` validates
the whole reachable namespace before projecting one subject, so an undecodable legacy decomposition record makes
the namespace corrupt rather than merely absent. Resolve the two records' reference and cleanup effects, delete
their bytes, and prove the remaining namespace healthy before narrowing v1/v2 decomposition decoding.

The current evidence spine is distributed across `retirement-authority.ts`, `decompose-cut-map-schema.ts`,
`decompose-preparation.ts`, `decompose-finalization.ts`, `retirement-receipt-codec.ts`,
`git-retirement-authorization-context.ts`, and `validate-decompose-record.ts`. Finalization and the commit hook
currently reconstruct different partial verdicts. The v3 validator takes normalized adapter facts and becomes
their one synchronous policy boundary; exact-base integration consumers migrate later.

The transition-overlay composition interface must exist immediately after that validator boundary, before result
planning or finalization consumes it. Separate opaque prospective and validated overlay arms feed one receipt-blind
project-record composition input; ordinary current-branch prospective precedence remains independent. ROADMAP,
composed-lifecycle, and direct-reconciliation call sites migrate together at this seam so later phases only produce
or select operands rather than inventing another composition contract.

V3 does not reuse the mixed v2 array shape as starter output. One immutable `machine` envelope carries exact
source/result/profile/unit/edge identity. Unknown-cardinality destination and internal-edge collections use one
whole-field author slot; source allocations and dependency dispositions are prepopulated from their machine
inventories with only their semantic values left open. Completed input substitutes concrete values without
changing an identity or order. The spec closes every nested union and array ordering and names the complete
canonical preimages for edge IDs, receipt/preflight/cut-map/path/topology/patch identities, the plan and
preparation IDs, and per-destination finalized digests. Preparation and receipt are decomposition-specific
version-plus-kind arms in the shared record namespace, not additions to the generic v1/v2 result shape; byte-exact
fixtures should pin each arm and preimage member.

The four prepared source digests are not inherited by name from the old implementation. V3 explicitly hashes a
versioned UTF-8 path-sorted source-artifact inventory containing regular-blob mode and exact stored-byte content
digest, plus three separately versioned canonical machine arrays for source units, incoming edges, and outgoing
edges. This keeps checkout bytes and implementation-selected helper semantics out of preparation identity.

The public v3 union deliberately excludes extraction. Machine source kind is `started-planning | backlog-stub`;
operator shape is `symmetric | heterogeneous`; placement is direct member, cohort, subcohort, or at-cap; and
destinations are new member, existing home, or cohort coordination. Symmetric means two or more new members and no
existing home. Heterogeneous means at least one new member and one existing home. The extraction child may reuse
the topology planner through a separate internal constituent DTO with an optional surviving origin, but that type
never crosses the CLI, map, preparation, or receipt boundary.

Preparation also closes three safety contracts that current v2 evidence lacks. `candidateOwnership` is either the
exact full-protection claim ID/generation/branch/opaque-worktree identity created before preparation or
partial-protection not-applicable. Candidate publication is the exact logical anchor and canonical ordered entry
set, and constitutive topology is the exact stored fact set/digest. `preparationId` binds all three and the receipt
carries them unchanged. Host paths remain local claim-store state. `allowedPaths` is the complete
authorization/validation closure, while finalized `managedPathResults` compare the prepared result-base tree with
the pinned candidate for every non-receipt allowed path and partition into changed `transitionPatch` entries plus
explicit equal-state unchanged results. Reused cohort paths therefore stay validated without pretending to be
writes.

`decompose-content.ts` recognizes top-level H2 boundaries and keeps descendants inside their parent. Its offsets
are JavaScript string positions, and it slices decoded text before re-encoding; the default decoder also strips an
initial UTF-8 BOM. The v3 scanner must retain the original bytes, introduce hierarchy-qualified H2-H6 locators,
slice byte ranges, and preserve the existing fence, HTML, quote, list, reference-definition, Setext-H2, and
normalization protections.

The concentrated regression surfaces are `decompose-content.test.ts`, `decompose-cut-map-schema.test.ts`,
`decompose-cut-map.test.ts`, `decompose-inventory.test.ts`, `decompose-preparation.test.ts`,
`decompose-finalization.test.ts`, `retirement-receipt-codec.test.ts`, and
`validate-decompose-record.test.ts`. `decompose-shapes.test.ts` contains several positive v2 fixtures with empty
`sourceAllocations`; replace those conveniences with exhaustive v3 allocations. Preserve the existing
transactional rollback/finalization cases and migrate their evidence rather than discarding the scenarios.

## Phase 2 Grounding

The current preparation projection is checkout-relative. `decompose-retirement-projection.ts` resolves the origin
through the ambient composed lifecycle index, reads its working-tree meta to discover `Branch`, falls back to the
invocation branch, and derives dependency inventories from ambient lifecycle truth even though source artifacts
come from `ls-tree` and blob reads at the source head. The replacement source resolver must use fully qualified,
locally available configured refs and one committed tree for content, metadata, and dependency truth. It performs
no fetch and has no current-branch or uncommitted-state fallback.

Resolve configured `branch.base` to its exact local branch ref, then inspect only other local branch refs. A
non-base candidate self-authenticates when its committed tree has exactly one supported active Planning origin
meta and that meta's `Branch` equals the candidate ref's short name. Exactly one candidate wins. With none, the
configured base may supply exactly one supported predecessor: an active Planning meta self-identifying as base or
a provisional/planned backlog meta with absent/`[none]` Branch. Multiple candidates or paths, mismatched
self-identity, incompatible predecessor state, missing base, and divergent aliases refuse. Remote-tracking refs,
worktree pseudo-refs, fetch, and invocation checkout state never participate. Source kind is derived from the
winning tree as `started-planning` or `backlog-stub`.

The same tree-pinned read must infer the exact planning profile before preflight emits the starter because
`planningProfile` is a concrete machine field and a `preflightId` operand. Completed-map revalidation rederives it
with the other inventories; result planning must not become the first owner of profile inference.

`handleDecompose()` currently calls the interactive intro before parsing `DecomposeCommandInputSchema`; the schema
and CLI registry encode only the `cutMap`/`finalize` XOR. Preflight therefore needs a closed command-mode union and
a machine handler selected before Clack or other interactive rendering. Its tests must assert byte-exact stdout,
stderr-only diagnostics, and immutability across the ref namespace, every attached checkout, retirement records,
and filesystem residue. The existing single-checkout positive shape fixture does not prove invocation-checkout
independence; add a linked-worktree matrix instead of weakening that legacy execution coverage.

Allocation mechanics already span `decompose-cut-map-schema.ts`, `decompose-cut-map.ts`, and
`decompose-inventory.ts`. Keep their responsibilities ordered: closed syntax, machine-binding revalidation, exact
live conservation, ownership, then a complete projected dependency graph. Current `sweepIncomingEdges()` silently
skips absent, unwritable, or unchanged dependents; the immutable plan must instead bind every exact dependency
edit and later mutation must consume those operands without rediscovery.

Current destination authority is split between private `deriveAllowedPaths()` /
`destinationArtifactPath()` projection and live re-derivation in `runDecompose()` /
`scaffoldCohortMembers()`. The current allowed-path `Set` also erases whether one physical path was independently
claimed by destination content, cohort topology, dependency rewriting, ROADMAP, predecessor retirement, or
evidence. Replace that split with a tree-derived profile and one canonical managed-path registry. Reserved
receipt/evidence, retiring source/predecessor, and ROADMAP roles are exclusive. Legitimate shared paths compose
topology structure, then canonical destination/allocation content, then canonical edge-ID-ordered dependency
transforms; each contributor consumes the prior after-state and the plan exposes one final mutation per path.
Source metadata `Design` pointers name mature authority. Existing-home destinations retain their own lifecycle
state and do not participate in the new-member profile. Mechanical policy can restrict `cohort-shared` units to
coordination, but the distribution interlock—not a prose classifier—judges whether shared content is genuinely
ownerless.

`decompose-placement.ts` currently returns physical member placement and a coarse mint/existing/none projection;
it has no durable logical-anchor type or origin-keyed at-cap block. The new topology planner separates logical
identity from physical paths, binds regular-file/absent preconditions, and returns ordered typed actions.
One new member plus existing-home edits uses a direct-member anchor; existing homes remain publication/edit
destinations rather than newly minted cohort members. The public core counts new members only. The separate
internal planner input used later by extraction may add one surviving-origin constituent to its topology count
without making that constituent a public decomposition destination.
Publication preserves all accepted existing-home identities: work-unit slug, draft-block slug plus v3 locator, or
managed document path. Lifecycle readiness applies only to new leaves/work units; draft blocks and documents
resolve exact pinned-tree content and can never be selected for continuation.
Package-source `arc/system/methods/assess-cohort-fit.md` remains authoritative; render its Framework project copy
and test parity when prohibiting multi-member cohortless results.

After destination and topology planning, project the complete candidate publication and constitutive topology into
the immutable plan/preparation tuple. That projection happens before occupation: authoring may satisfy the planned
paths and finalization may validate them, but neither may derive a replacement logical anchor, entry order, or
topology identity from live candidate bytes. Publication order is the completed map's canonical `destinationId`
order after `cohort-coordination` destinations are filtered; each remaining destination maps to one new-leaf or
existing-destination entry. Continuation order is the resulting new-leaf subsequence, so mixed publication bytes
remain rederivable even though new-leaf entries do not repeat destination IDs.

There is no existing shared transient candidate-claim substrate. `git/worktree-marker.ts` records generic
worktree provenance inside a created worktree but has no source/base/map binding, generation/CAS lifecycle, or
pre-occupation discovery. `git/in-flight-derivation.ts` consequently classifies a recordless candidate branch as
residue. Add a repository-common operational claim with a closed decomposition-candidate arm and integrate the
in-flight, status/session residue, and cleanup readers. Creation must order pending claim, branch/worktree
occupation, completion, and revalidation so a crash leaves one exact resumable pathless generation/candidate or no
writable residue.
The key is the digest of version, kind, origin, and candidate branch; its one record lives under the git common
directory at `arc/transient-claims/<claimId>.json`. A per-key lock and atomic replacement retain only the latest
monotonic pending, occupied, or landed/discarded terminal generation. `acquire`, `reserveWorktree`, `occupy`,
`retire`, and `releaseWorktree` provide the whole serialized lifecycle surface. A
matching terminal remains retryable until exact cleanup releases its registration and a safe acquire advances it;
older retries then conflict, and absence or malformed bytes never prove completion. The completed occupation exports
its exact claim ID/generation/branch/opaque-worktree identity into preparation; host paths stay behind the local
adapter, and landing never reconstructs correlation from current configuration or visible claim state.

The interval after acquire and before reservation is intentionally a valid pathless
`pending/unregistered` generation. Exact retry may reserve it, but it can inspect no path. Pre-acquire collisions
leave no claim; post-acquire failure preserves the generation unless a guarded rollback proves no later observer
or path mutation can exist.

The opaque worktree value is deterministic from claim ID and generation. Its absolute path lives only in the
machine-local claim record's `unregistered | intended | registered | released` adapter arm. Reservation persists
`intended` before branch/worktree mutation, the ARC marker carries the exact claim/generation/worktree tuple, and
occupation validates the reserved path's Git registration, branch, head, and marker before recording
`registered/occupied`. Restart recovery may finish only that exact reserved path; cleanup releases the mapping only
after the terminal generation's registration, marker, and branch occupation are absent.

The current `runPreparedDecompose()` revalidates once and then `runDecompose()` rereads lifecycle, placement,
metadata, paths, and dependencies while mutating. The replacement driver consumes only `ValidatedDecomposePlan`
operands after its post-occupation gate. Partial protection captures and restores distinct index and worktree
preimages for plan-owned paths; full protection leaves a named exact candidate. Exact discard retires its matching
claim ID/generation, while exact landed validation owns the other terminal retirement path. Implement the one
managed-path composer/materializer before wiring this driver so no independent writer or interim mutation path
retains live resolver authority.

## Phase 3 Grounding

`scaffoldCohortMembers()` currently derives conventional paths, dependencies, metadata, and generic draft prose
from the cut map during mutation. Phase 3 replaces that authority with the Phase 2 one-entry-per-path table. The
single materializer validates every base or exact-final prestate before writing and emits each final path once; it
does not infer placement, artifact roles, content, dependencies, or lifecycle fields. Exact existing-home edits
remain valid contributors, but no existing-home meta is scaffolded or wholesale re-rendered.

Topology has no current planner-to-contributor seam. The shipped package template is
`packages/arc-framework/arc/reference/templates/arc/work-unit/template-cohort.md`; project `.arc` copies are
rendered projections, not runtime authority. Topology planning produces structure contributors and preserves
create/ensure/backfill/reuse/append/none identity for reporting; it does not write independently. A coordination
path may combine that structure with allocated content, but materialization sees only the composed final bytes.
`reuse` and `none` remain no-write topology facts even when another contributor owns the physical mutation.

`active/current-workflow-consistency.ts` deliberately checks only the generic
`(State, Current Workflow, Design)` invariant and admits ordinary `create-spec`. Do not make that function
filesystem-aware or decomposition-specific. Compose it with a new planning-tuple validator over exact
profile/slug metadata and sibling artifact inventory. New-leaf metas alone carry optional
`Decomposition Receipt: <canonical receiptId>` immediately after `Review Rubric`. Model it as a managed
omit-when-absent field rather than adding a default-backed entry to the current always-rendered field table:
ordinary parsing yields absent, rendering emits only an explicitly supplied value, reconciliation never backfills
it, and a present marker remains canonically ordered. The stable receipt ID is known from the source transition
before tuple materialization and does not depend on destination digests or its own path. The field is absent from
ordinary templates/metas and existing homes and grants no authority by itself.

When that field is present, `arc start` pins the configured base, loads the exact receipt path, performs canonical
landed receipt/publication validation through the shared exact-base `DecompositionIntegrationAnchor`, and requires
this slug to be a matching `new-leaf`. The anchor producer lands before start and is reused later by handoff and
cleanup; start gets no private landing relation. Only then does the decomposition-specific tuple policy admit
`draft-design` or `generate-tasks`; ordinary metas without the field retain all three workflows, including
`create-spec`.

`runGraduateThroughExecutor()` currently relocates first and unconditionally overwrites `Current Workflow` with
`draft-design`. Its preflight checks class, lifecycle position, meta readability, and field-block shape but not the
complete artifact family. The replacement preflight snapshots exact meta/design/task authority before any
branch/worktree action, derives a workflow only from a semantically unset value, and carries the preserved/derived
decision into one `ValidatedGraduationTransaction`. The transaction includes branch/worktree and index preimages,
all source/destination path states, preserved non-meta bytes/modes, and complete target meta bytes with the marker
already removed. A start-only `atomicGraduate` executor port applies or reverses that whole contract as one leg;
generic per-file relocation and post-transition meta writes do not run for start, while other verbs keep their
forward-recovery behavior. Ordinary failures restore every captured preimage. Incomplete rollback returns typed
non-authoritative residue rather than claiming graduation.

That complete target-byte projection also absorbs existing start compatibility behavior: managed-field
reconciliation and its ordered backfill list, the optional caller-supplied Class write, current soft-field ceremony
changes, and the existing success notice. The atomic port returns the same successful
`GraduateResult.backfilled/notice` surface without later meta writes; only incomplete rollback adds a new typed
command-result arm.

V3 publication ordering is strict: Phase 2 projects the logical anchor, exact entry set/kinds, and constitutive
topology into the immutable plan; execution persists them in preparation before authoring. The post-authoring
distribution interlock supplies only explicit continuation. Phase 3 validates topology and readiness, then
finalization carries the preparation-bound identities unchanged while sealing their continuation. Phase 4 owns
only durable selection, landed handoff, and workflow wiring.

The continuation handoff is one ephemeral closed JSON file supplied with
`arc decompose <origin> --finalize <receipt-id> --continuation <file>`. It contains selected slugs or explicit
none only. Finalization reads anchor and entries from preparation unchanged, validates the file against pinned
candidate readiness, and atomically seals the result; there is no separate capture mutation or stored approval
token.

Candidate continuation and landed handoff share `resolveLaunchReadiness()` over one lossless pinned
`ProjectReadinessCompositionResult`. Composition retains ordered accepted candidates and typed rejected-record
facts before producing its ordinary merged view, so duplicate, malformed, unreadable, unsupported-lifecycle, and
unidentified evidence cannot disappear. The helper performs no second scan. Exactly one planned,
`State: Planning`, non-parked accepted record is required. Dependency satisfaction follows the shipped-only
doctrine, so `Integrating` stays blocked. One `DecomposeReadinessDeps` bundle injects the same required typed batch
provider into candidate and landed paths. Production uses `adaptProjectReadinessProvider()` over the existing
`depsOnlyReadinessProvider`: accepted records enter its unchanged batch interface once, exact map-key coverage is
validated, and a blocked verdict becomes a nonempty provider locus while dependency edges retain their own loci.
Native typed providers remain injectable for tests. No config axis or helper-local fallback is added. Missing,
thrown, malformed, key-incomplete, or key-excess provider results and missing/duplicate/rejected/indeterminate
records refuse; unsatisfied dependencies or a valid provider denial return blocked.

Current finalization reads a working-tree preparation, independently rebuilds live projection facts in the driver,
and accepts only a prepared record before replacing/staging it. V3 uses one normalized pinned evidence bundle and
the Phase 1 canonical validator for all status policy. `already-finalized` is narrowly the same validator-proven
canonical receipt in index and worktree, absent from the candidate parent. Refresh additionally pins the candidate
tree/index identity around receipt compare-and-swap and restores the prior receipt or reports bounded residue on a
race. It also requires the supplied continuation to remain byte-identical to the finalized
`initialContinuation`; refresh recomputes destination/path/patch facts but cannot reopen the distribution
interlock's semantic choice. Preparation-bound publication/topology, continuation readiness, topology validation,
and the materialized candidate all exist before finalization and commit adapters migrate to that validator; Phase
1 defines the boundary but does not wire consumers that do not yet exist.

Preparation must bind canonical topology facts or their digest. Finalization may compare the same pure planner's
output to those stored facts, but configuration/layout drift cannot mint new paths. Decomposition finalization
composes the generic cohort-consistency result with its exact required-path `Purpose: —` floor rather than changing
generic cohort semantics. Recovery rendering consumes a closed action/facts union; validator mismatches alone do
not prove an operator's cut-map pathname or a candidate/receipt command.

## Phase 4 Grounding

Phase 1 replaces the overloaded `ProjectReadinessProspectiveInput` suppression arm with the shared receipt-blind
overlay composition seam while preserving ordinary `currentBranch` staged-tree precedence. The immutable plan
supplies the prospective arm solely for candidate rendering and binds its result into preparation. Phase 4 selects
the independently derived validated arm from pinned finalized authority, requires exact structured/ROADMAP parity,
and grants durable consumers no other suppression path.

The present commit adapter reads `MERGE_HEAD`, staged diff, index blobs, HEAD, and parents through separate live
reads. The replacement pins HEAD, ordered merge parents, configured base, and a `write-tree` index object, reads
all validator facts from those objects, then rechecks refs and the index tree before returning authority. Only
merge state admits operation-parent recovery. Candidate selection preserves parent provenance, deduplicates the
same receipt/derivation identity, and requires exactly one distinct canonical derivation of the pinned candidate
tree.

The exact-base anchor producer is implemented before `arc start` and distinguishes prepared base, candidate commit,
and current configured-base heads. Fast-forward and merge-commit landings have separate exact relations; neither a
candidate tree nor a history-wide receipt search proves landing. Start, landed handoff, and decomposition local
cleanup consume this one anchor directly. Remote cleanup, descendant-base derivation, durable enumeration, and host
exact-ref classification remain child-work-unit scope.

Transient claim retirement is a terminal compare-and-swap, not deletion-as-proof. Exact landing or discard leaves
bounded generation evidence so retry can distinguish matching completion from unproven absence, concurrent
ownership, or the opposite terminal disposition. Landing derives canonical authority read-only first, then retires
the anchor-bound generation; only retired or matching-idempotent terminal state grants actionable local cleanup
for full protection.

The exact-base anchor closes the protection split through `claimRetirement`, derived only from receipt-carried
`candidateOwnership`. Full protection carries its validator-bound `required`
claim-ID/generation/branch/worktree operand. Partial protection carries
`{ kind: not-applicable, protection: partial }`; it performs no claim compare-and-swap and may grant cleanup from
the exact landed anchor after proving no matching live or superseded candidate claim exists. Current configuration
cannot change either arm. `missing-unproven` belongs only to the full required arm. Any unexpected partial matching
claim fails closed.

The landed publication resolver is intentionally base-local. It authenticates one pinned configured-base
retirement namespace, selects one v3 decomposition receipt by original slug, requires its integration anchor, and
resolves topology, entry kinds, and readiness from the same tree. `initialContinuation` remains immutable receipt
authority; `launchableSelected` is a live intersection with currently ready selected new leaves. Existing
work-unit destinations resolve lifecycle records, while draft-block and document destinations resolve their exact
artifact identity from the pinned tree. All existing destinations remain publication entries but never
continuation candidates. The exported
`LandedDecompositionHandoff` carries facts only; `stub-mint-to-launch` owns actual launch orchestration.

The package-source workflow is
`packages/arc-framework/arc/system/workflows/arc/work-unit-lifecycle/decompose-work-unit.md`; render its project
copy rather than hand-editing both. Its current text contains v2/H2 map mechanics, pre-transform semantic approval,
manual cohort repair/validation, base-checkout mutation, extension-owned extraction and cohortless fan-out, and an
internally contradictory release sequence that always pushes/merges after calling partial protection a direct
commit. Replace those mechanics with CLI packets/statuses and one post-authoring distribution interlock. Partial
protection ends with a direct commit; full protection ships the already-created candidate through push/PR/merge
release controls.

The landed handoff needs a public command boundary, not only an exported library type. Use
`arc decompose <origin> --handoff` as a read-only mode over one pinned configured-base resolver. It returns the
closed handoff/refusal result without reading candidate-only authority into the base view or mutating the claim.
The workflow and acceptance fixture consume that surface; launch orchestration remains owned by
`stub-mint-to-launch`.

## Phase 5 Grounding

The canonical acceptance owner is `packages/arc-framework/__tests__/e2e/lifecycle-exit.e2e.test.ts`, but its
decomposition setup currently replaces the installed hooks with a generated pre-commit shim and imports internal
decomposition parsers. Rework the canonical path as a built-CLI black box. Normal `arc init` must leave
`core.hooksPath` at `.arc/system/.internal/githooks`; acceptance commits traverse `pre-commit`, `commit-msg`, and
`pre-push` as applicable. Any hook bypass is visibly fixture-only and limited to repository bootstrap.

Construct the source through the normal planned-stub-to-start path. The configured base retains the committed
planned predecessor while `plan/origin` and its attached worktree own paired-spec planning bytes plus a nontrivial
provisional task seed. The candidate is `chore/decompose-origin`. Assert exact refs, worktree registrations, heads,
merge base, predecessor/source separation, and invocation-checkout-independent preflight binding. A committed
unrelated rider is a negative gate before candidate occupation; revert it and re-preflight from the resulting
source head for the successful path.

The preflight runner must recognize machine-output modes independently of `--json`, keep stdout and stderr
separate, and prove zero mutation. Persist the starter output and edit only public author slots; the E2E must not
import schema IDs, digest helpers, receipt codecs, markers, or canonicalization functions from `src/`.

The post-authoring fixture choice represents the human checkpoint but proves only ordering and explicit input.
There is no approval credential. Prepared evidence cannot commit; finalized evidence can; committed-unlanded
evidence grants no base-rooted publication, start, anchor, or cleanup authority. Use public read-only queries
before landing rather than `arc start`, whose cold path can create state. Land through actual exact-base Git
topology and do not advance the base afterward.

Candidate projection and landed convergence are separate assertions: the candidate-time overlay suppresses the
origin while the base remains unchanged, then the landed base renders the same result without an overlay.
The canonical symmetric publication assertions include one selected-ready new leaf, one dependency-blocked new
leaf, and one unselected-ready new leaf. The heterogeneous partial-protection variant owns the
published-but-unselectable existing-destination assertion. Anchor, terminal claim retirement, and local-only
cleanup derive from the same exact landing; source teardown waits until explicit fixture cleanup.

Keep the variant budget bounded. One partial-protection case combines exact existing-home heterogeneous edits with
one-new-member cohortless eligibility. The configured-ref backlog-stub case also runs under partial protection,
proving predecessor and directory behavior without an active source workspace while producing the explicit
not-applicable ownership/retirement arms and no candidate claim. A pure topology table owns standalone, in-cohort
subcohort, missing-parent, at-cap, and refusal cases. The ordinary-install check is one piggyback assertion, not
another lifecycle. Child work units retain extraction, committed-unlanded mobility, descendant landing,
planning-lane, durable enumeration/narrative, and live-remote cleanup matrices.

The partial-protection variant also proves the integration anchor's exact not-applicable arm, absence of any
transient claim and claim compare-and-swap, and refusal if a matching claim unexpectedly exists. This prevents
full-protection retirement mechanics from becoming an impossible prerequisite for direct-base operation.

## Development Receipt Boundary

ARC is pre-release and has no external installs, but the live session probe projects nine repository-owned
retirement records into reference reconciliation. Seven describe rename/abandon transitions; those verbs still use
the shared existing receipt contract. Two are old decomposition records (`cli-substrate-adoption` and
`review-protocol-alignment`) and still suppress or resolve historical references.

The core therefore does not add decomposition compatibility or migration. Implementation resolves the two old
decomposition records' current reference/cleanup obligations and deletes them plus decomposition-specific legacy
fixtures/authority. It leaves the generic receipt versions used by rename, abandon, and park in their existing
owner. Deleting every receipt or rewriting every transition schema would be unrelated scope, not proportional
cleanup.

V3 still has to coexist with the retained generic receipt arm in the shared namespace. Complete enumeration
therefore authenticates retained generic receipts and v3 preparation/receipt variants explicitly; old v1/v2
decomposition preparations are not retained. V3 preparations remain nonterminal. V3 receipts project the original
slug into the existing decompose reference transition and join machine incoming edges to authored dispositions by
`edgeId` for dependent queries with fixed `tree-only` quality. The durable-consumer child owns broader historical
reach and narrative, not this baseline compatibility required for the shared namespace to stay readable.

## Source, Result, and Driver Boundary

Preflight reads the exact committed source from Git objects and changes no repository state. Completed-map
execution builds one immutable `ValidatedDecomposePlan` before branch creation. That plan is the only authority for
result paths, predecessor action, riders, profile, topology, and allowed paths.

One driver operation owns full-protection branch occupation or partial-protection base validation,
post-occupation revalidation, mutation, staging, and preparation. Later orchestration invokes that operation; it
does not reproduce the authority derivation.

Failure recovery remains bounded. Partial protection restores captured transform-owned preimages. Full protection
leaves the exact deterministic candidate. `--discard <cut-map>` rederives and compares the binding before deleting
only an uncommitted transform-created candidate. It first retires the exact generation as discarded, deletes only
under that terminal authority, and releases the worktree registration after cleanup; restart resumes any incomplete
retire-cleanup-release sequence.

## Planning and Launch Boundary

The core owns planning authority at scaffold and `arc start`: draft/spec family, valid `Current Workflow`,
provisional task bytes, and the rule that file presence cannot set `Task List`.

`stub-mint-to-launch` owns entry-point-agnostic post-merge launch orchestration. It consumes the finalized
publication, re-resolves the landed topology, recomputes dependency readiness, and launches only explicitly
selected ready new leaves. It does not create or repair cohort topology.

Receipt-backed retirement publication stores:

- logical origin anchor and kind;
- exact entries and entry kinds;
- selected ready new-leaf slugs or explicit none.

It does not store display path, current ready/blocked facts, launch status, or scheduling state. Extraction has no
retirement receipt and therefore no fabricated automated launch authority.

## Cohort Topology Boundary

The reusable planner/materializer receives already-decided placement. It can create an explicitly incomplete
canonical doc, backfill a missing parent, reuse existing docs, append exact at-cap provenance, or do nothing for an
eligible single-member cohortless result.

Multi-member fan-out is never cohortless. Normal placement uses the origin-named cohort or subcohort; at the
nesting cap it uses an origin-keyed fan-out block under the existing parent. This invariant belongs in doctrine,
`assess-cohort-fit`, cut-map validation, and tests.

The CLI never invents Purpose, membership prose, shared contracts, sequencing, or coordination. Finalization
requires the structural docs and rejects the exact Purpose sentinel.

## Finalization and Consumer Boundary

Finalization has three success states: `recorded`, `already-finalized`, and uncommitted `refreshed`. Mechanical
validation does not prove semantic approval; workflow order places the distribution interlock before finalization
without persisting an approval credential.

Hook-side Git/index/parent reads stay in the adapter. Pure commit policy consumes canonical validator facts.
Committed same-path refresh, descendant-base validation, and host exact-ref classification are child-WU concerns.

The core produces exact-base `DecompositionIntegrationAnchor`. `decompose-base-mobility` extends the same shape to
a descendant current base. `decompose-durable-consumers` may consume the exact-base form immediately and the
descendant form when mobility is present; this avoids a dependency between otherwise parallel members.

Project readiness consumes `ValidatedTransitionOverlay`. Direct transform reconciliation passes it in-process;
merge recovery derives it once from a pinned operation-parent snapshot. ROADMAP rendering never parses receipts.

## Review Boundary

The authoritative workflow has one post-authoring distribution interlock. It reviews actual child authority,
heterogeneous edits, topology semantics, allocation/dependency effects, and initial continuation. CLI validators
own mechanical closure; the human owns semantic fidelity and reopened-design judgment.

The core's likely size remains a decomposition signal, but its residual authority is cohesive. Reassess after
Phase 1 grounding produces a measured file/diff projection. Prefer review chunks or stacked delivery if scale is
the only pressure; decompose again only if grounding reveals a genuinely independent contract.
