# Draft: decompose-transform-integrity

- **Origin:** [internal] — two live decompositions on 2026-07-26 (`review-protocol-alignment` symmetric,
  `review-protocol-alignment` extraction) each failed or required manual surgery against the shipped transform.
- **Purpose:** Make the decompose transform run, conserve, and commit correctly against the real planning topology,
  and make its tests exercise that topology rather than a simplified one.

---

## Problem / Motivation

`decomposition-machinery` and `decomposition-hardening` both shipped, yet the first two decompositions attempted
after them could not complete as documented. The failures are not a single defect; they cluster into three areas
plus one enabling cause.

**Run context and write authority disagree — in both arms.** The symmetric arm prescribes a base checkout, but
`resolveComposedLifecycleIndex` grants `writablePath` only when an agreeing origin record exists in the current
checkout. Planning artifacts are branch-private, so the verb refused before mutation with "no current-checkout
write authority". The extraction arm has the mirror defect: its run context is the origin's worktree, while its ship
leg expects a base-cut `chore/decompose-<name>` branch, so member scaffolds and the ROADMAP regen staged onto the
origin's planning branch — unreachable by the ship leg, and invisible in the backlog until the origin merges.

**Conservation covers the wrong universe.** The conserved set is the origin artifact group, but a planning branch
carries more: the symmetric run exposed an already-authored `review-adapter-extensibility` stub and a project
compatibility-posture rule. A base-rooted transform would strand these silently; the source-rooted workaround
preserves them, but neither the cut map nor the decomposition PR account names them.

**Allocation granularity fails in both directions.** Source units scan at H2. Where member concerns live as H3
under `## Scope`, no whole source unit leaves the origin, `sourceAllocations` is honestly `[]`, and the conservation
gate's machine-checkable record is empty while nothing fails loudly. Where the design nests below a single
`## Proposed Design`, the whole design is one indivisible unit and headings had to be promoted and committed before
a cut map could be authored. Cross-cutting sections that belong to no single member remained atomic and had to be
routed to the cohort document by hand.

**The transform discards planning maturity at its output boundary.** Source inventory already sees conventional WU
companions such as `spec-*`, `tasks-*`, and `notes-*`, and target resolution can address their member equivalents,
but new-member scaffolding, allowed-path projection, workflow conservation, and launch all assume `meta-*` plus a
new `draft-*`. More seriously, `arc start` unconditionally resets a graduated backlog WU to `draft-design`. A cut
first exposed by the reviewed structural pass of `generate-tasks` would therefore throw away a finalized, reviewed
spec and repeat draft/spec derivation and adversarial review even when only the implementation packaging proved too
large. The stable distinction is whether a finalized spec exists, not which in-progress planning step happened to
notice the cut.

**Lifecycle boundaries leak.** A pre-mutation refusal left an empty `chore/decompose-*` branch that session-init
then misclassified as errand residue. More seriously, the finalized transform deadlocks at commit: decompose
supplies `supersededSource` so its staged ROADMAP omits the retired origin, while the pre-commit renderer calls the
same index view without supersession input, sees the linked plan worktree, and requires the origin row back. The
prescribed remedy — regenerate — makes the hook pass by publishing a readiness view that contradicts the finalized
transform. The errand on `fix/decompose-roadmap-supersession` is already in flight against this deadlock, judged
urgent enough to fix ahead of this work unit; treat it as delivered work to confirm, not to redo.

**Finalization is an integrity seal with no ordinary refinement path.** The workflow deliberately separates
preparation from authored distribution, but once finalization replaces the preparation with a receipt, a subsequent
approved destination-only wording change makes the receipt stale. Re-running finalization reports only
`evidence-mismatch` because the reader accepts preparations but not finalized receipts. The commit gate correctly
rejects the uncovered transition, yet recovery requires reconstructing earlier index blobs from Git objects. The
seal should remain exact while becoming idempotent and cheaply refreshable before commit; agents should not have to
reverse-engineer ARC's own evidence.

**The full ceremony has more projection seams than the initial deadlock.** During a base merge, the staged-index
ROADMAP renderer recognizes a receipt newly added relative to `HEAD`, but not the same receipt inherited from the
merge's first parent and novel relative to `MERGE_HEAD`; regeneration can therefore resurrect the retired origin.
The workflow also promises a planning auto-merge PR while every decompose necessarily adds a JSON retirement
receipt outside the planning-path classifier. After landing, receipt-backed teardown requires the remote planning
ref to equal the exact local source head, even when the remote is merely its stale ancestor; the only recovery is to
publish the retired head solely so it can immediately be deleted. These are ordinary decompose states, not evidence
failures.

**Reference reconcile overstates ordinary decompose provenance.** The authenticated retirement receipt proves that
`review-protocol-alignment` decomposed into four members, but current-WU reconcile reduces that evidence to the
terminal fact `decompose`, then labels every plain-prose occurrence of the origin slug `remove-or-retarget`. That
makes this draft's own dated Origin account — evidence of the two failed transforms that motivated the work — a
persistent pending advisory. A decomposed identity remains meaningful historical context; it is not equivalent to
a live dependency or a backticked reference to a gone origin artifact. The correction should preserve those
structured integrity checks while avoiding a new acknowledgement store, marker syntax, natural-language
classifier, or other machinery for deciding whether ordinary prose is historical.

**Receipt durability has a growing read cost.** Nine receipts currently occupy only 56 KB, and the two decompose
receipts are roughly 7 KB and 15 KB, but every reconcile enumeration validates the complete namespace and executes
one `git show` per record. Routine decomposition therefore adds unbounded process fan-out to session reconciliation
before raw storage becomes material. Time-based pruning cannot prove safety for offline or long-running work units,
and teardown is not the last potential consumer. Keep receipts as the durable transition ledger; bound lookup cost
by batching object reads and covering a many-receipt namespace in tests. Add no TTL, compaction record, or retention
state without measured evidence that current-tree size itself has become material.

**The deadlock is the severe case of a broader ROADMAP seam.** A base merge needed the dedicated conflict remedy;
`arc stub` emitted a view the staged-index pre-commit renderer then rejected; and decompose's caller-supplied
supersession disagreed with the same renderer at commit. The first two have clean remedies and belong to
`roadmap-tooling`'s renderer/materialization boundary. The third can publish a view contradicting a finalized
transform, so this work owns only the validated decompose transition overlay at the shared structured projection
input. It does not consolidate the wider renderer family.

**The enabling cause: test topology.** Each of the above sat behind a fixture that does not reproduce the real
lifecycle. The symmetric E2E commits origin artifacts on base and then branches, so it never builds the ordinary
planning topology and gave positive assurance over exactly the case that failed. The lifecycle E2E installs only
the decompose-record hook rather than the full pre-commit chain, so the ROADMAP deadlock cannot surface. The
extraction integration test ships an empty `sourceAllocations`, so the unenforced-conservation case reads as
passing. This is one blind spot with several symptoms, and it explains how two work units shipped believing
themselves complete.

## Candidate Shape

- **Test topology first.** Build fixtures that start through the normal planning lifecycle and install the
  repository's complete pre-commit chain. Without this, every fix below is unverifiable by the tests that missed
  the defect.
- **Make the result projection the write authority.** For every artifact that will land on base, establish the base
  checkout or base-cut `chore/decompose-<name>` branch before preparation and keep one checkout/index from prepare
  through finalize and commit. Read a started origin from its exact, unchanged planning ref; do not transplant a
  staged patch between worktrees. Extraction is two explicit, independently retryable legs over the same temporary
  cut map: land the additive result first, then finish from the origin worktree.
- **Account for a retiring source's complete branch-private delta.** On retirement shapes, classify it before
  mutation and reject any source-private rider outside the expected origin lifecycle projection. Extraction keeps
  its source branch, so retained code and other source-private work remain outside result authority rather than
  entering this refusal.
- **Fix allocation granularity without a new document language.** Inventory disjoint H2–H6 heading blocks, retain
  hierarchy-qualified locators, and keep ordinary Markdown headings as the refinement mechanism when one block
  contains more than one destination-owned concern.
- **Preserve the latest completed planning authority.** Infer one homogeneous new-member entry profile from the
  allocated design artifacts: member drafts enter `draft-design`; complete member specs enter `generate-tasks`,
  optionally carrying provisional task skeletons that the workflow re-evaluates from its normal entry. Add no
  `create-spec`, ready-to-activate, mixed-maturity, or arbitrary artifact-bundle mode.
- **Close the lifecycle boundaries.** Run refusals before result-branch creation. For the commit-time ROADMAP
  supersession deadlock, **verify `fix/decompose-roadmap-supersession` against a real decomposition** once it ships,
  and scope this work unit to whatever it leaves open — do not re-implement it.
- **Make finalization recoverable before commit.** Re-running finalize against a matching finalized receipt should
  report success; a destination-only change within the prepared path set should revalidate and refresh that same
  uncommitted receipt. Report the exact mismatch locus when refresh is unsafe.
- **Carry supersession through merge projections.** Let the shared staged-index resolver derive the validated
  decompose overlay against relevant operation parents, selecting only the receipt bound to the current result
  projection. Caller-specific renderer plumbing and unrelated historical receipts supply no authority.
- **Make the promised lane truthful.** Keep the mandatory allocation-map interlock as the semantic authority, then
  admit one successfully validated finalized decompose receipt only as a machine-generated companion to that
  approved, otherwise planning-only exact change set. A retirement path by itself grants no clearance; malformed
  receipts, other receipt transitions, multiple receipts, foreign-owner changes, and unrelated riders remain
  reviewed.
- **Make remote cleanup ancestry-aware.** Receipt-backed teardown may delete an equal or stale-ancestor remote ref
  using an exact lease over the observed remote OID. A remote descendant or divergence remains a hard refusal; no
  publish-only-to-delete round trip is required.
- **Calibrate decompose reference reconciliation.** Keep exact dependency reconciliation and dangling origin
  artifact detection, but emit no finding for a plain narrative reference whose reachable terminal transition is
  `decompose`. Leave rename and removal behavior unchanged; add no informational severity or acknowledgement state.
- **Bound receipt lookup cost, not retention.** Keep the receipt namespace durable, replace per-record Git process
  fan-out with batched object reads, and prove the adapter against a many-receipt namespace. Do not add receipt GC.
- **Add a read-only allocation preflight** that reports exact source units, headings, digests, and dependency edges
  before branch creation and emits the v3 starter map with machine-owned identity fields already populated. The
  agent authors only destinations, dependency dispositions, ownership, and reasons. The preflight writes no
  preparation or other durable state; prepare re-derives and binds the same inventory.
- **Keep proof machinery below the operator boundary.** Derive refs, heads, modes, digests, and candidate identity
  from repository/host context. Routine success never asks an agent to reconstruct a record or supply a Git object
  ID; benign retries and unrelated base movement should pass or refresh automatically.

## Run / Commit Locus — Working Direction

The existing preparation scope already separates an exact `source` branch/head from an exact result-base ref/head;
v3 carries the durable result-base binding through finalization instead of dropping it from the receipt. That is the
useful primitive: the planning branch can remain byte-for-byte unchanged while a base-rooted result commit proves
that its source was conserved into members and is absent from the landed lifecycle projection. A general
staged-patch materialize/land mechanism would duplicate this separation and add cross-worktree recovery obligations.

Under full protection, the result branch must be cut from and occupied in a base checkout **before preparation**;
under partial protection, the base checkout itself is the result. All member stubs, shared-visible dependency
rewrites, heterogeneous direct destinations, the ROADMAP, and the preparation/final receipt stay in that one
result index through commit. A preflight refusal happens before branch creation, avoiding empty
`chore/decompose-*` residue.

The arms apply that source/result split as follows:

- **Symmetric started origin:** read the committed planning ref and leave it unchanged until teardown. Remove any
  current-base predecessor stub for the origin, or project absence when the origin was started new; write members,
  dependency rewrites, ROADMAP, and receipt on the base-rooted result. Teardown the planning ref only after the
  result lands.
- **Backlog stub source:** source and result begin at the same base-rooted tree. Remove the local stub and write the
  complete transform in the result index; no teardown is owed.
- **Heterogeneous retirement:** use the same source rule as the corresponding symmetric or stub-source arm. Admit
  only destinations writable in the same result projection. A branch-private existing WU is not an atomic
  destination for this transform and must be resolved before retirement.
- **Extraction:** read the surviving origin from its committed planning ref. Run the additive result leg from the
  result checkout and land it first. After it is reachable from the integration base, run the explicit finish leg
  from the origin worktree over the same cut map; it revalidates the source and landed targets, then stages origin
  thinning. No retirement receipt or cross-branch transaction is needed.

Extraction's two legs are an ordered workflow, not one implicit multi-worktree command. The result invocation
scaffolds and stages only the new-member/result projection. The later `--finish-extraction` invocation re-derives
the live source inventory, discovers the configured integration base and its current head, and requires every
allocated destination locator to resolve there. It previews the current destination content and exact source
thinning at the normal workflow interlock, then stages only those source-block removals. The agent supplies no
result commit, base OID, or other evidence identity. Both legs use the same user-owned cut map; neither writes a
framework pending record.

Keep that temporary cut map until the result has landed and the source thinning is committed on the surviving
origin branch. The finish leg is idempotent against an already-thinned source and safe to rerun after an
interruption. It never silently removes an allocated block whose content changed since the map's machine-owned
preflight fields were emitted: instead it emits a refreshed preview/map with those fields updated and the existing
semantic choices preserved where their source identity still matches, so the allocation can be re-approved without
repeating the landed result leg or hand-editing a digest. An absent destination locator refuses before mutation
with that locator and the direct retry action. If the scratch file is lost after the result lands, regenerate the
read-only source inventory and re-author the map against those already-landed destinations before finishing. The
incomplete state is visible duplicated scope, and the original source remains in Git history, so reviewable recovery
is proportionate; do not add an extraction receipt, result seal, transaction log, or durable pending marker.

A started planning source normally has a different current-base projection: `arc start` moved its backlog stub into
`active/` only on the planning branch, while base still carries the predecessor stub. Result-rooted retirement
therefore needs a narrow projection rule, not general source write authority: prove that the base stub is the
unchanged predecessor of the planning source, then delete that result-side artifact group. Suppress user-workspace
closure on this projected delete; the receipt-backed post-merge teardown owns closure.

Retirement shapes also need a branch-delta preflight. Derive the source-only change set from the source/result merge
base and classify the expected lifecycle projection (origin artifact relocation, predecessor removal, and derived
ROADMAP). Any other source-private path whose state is not already identical on the result is unaccounted and
refuses retirement. Resolve that path through its own proper ship route before retrying rather than growing the
decompose cut map into a general branch-delta carrier. Extraction does not run this retirement check: the origin
branch survives, its committed code and any other source-private delta stay there, and the finish leg has authority
only over the allocated planning blocks it previews. The exact source and result heads retained by a retirement
receipt remain sufficient to re-check the retirement condition at teardown; no new record store is required.

Transform shape follows semantic identity, not the availability of `arc rename`. A full decomposition retires the
origin when no one result remains the same work unit. Extraction applies only when one reduced result is a genuine
continuation of the origin; the existing rename operation may then give that survivor a more truthful slug. Do not
keep and repurpose an otherwise-retiring origin as an arbitrary child merely to preserve its lifecycle shell, and
do not add a combined rename/decompose arm.

Preparation currently hashes the result branch's exact parent, while a squash merge may place the same patch on a
newer base parent. V3 retains that prepared base head in the finalized receipt and binds the pre-mutation mode/object
state of only the eventual patch paths. Patch writes bind their resulting content plus mode: an existing path keeps
its input mode, a new managed file receives the canonical regular-file mode, and an unexpected type/mode change
refuses rather than becoming another authorable field. The normal exact-parent case stays valid. A landed commit may
use a descendant base parent only when every touched-path precondition still matches, the exact authorized patch
lands, and no new incoming dependency remains on the retired origin. This keeps exactness at the destructive
boundary without treating unrelated base movement as evidence loss, and extends the existing receipt rather than
adding coordination state.

The authoritative descendant-base check belongs in the existing exact-base/head review adapter consumed by the
merge gate, not in post-merge teardown or only in the local commit hook. When that adapter encounters the one
decompose receipt, it derives the candidate result projection from repository/host context and validates it against
the receipt's result-base binding: the prepared touched-path states still match, the mode-aware authorized patch is
exact, and the resulting lifecycle index has no new incoming dependency on the retired origin. Unrelated base
movement is accepted without operator action. A material landing mismatch is a command failure, never a fallback to
`reviewed`, and reports the conflicting path or dependency plus the direct refresh/retry action.

Descendant-base admission is available only when the host binds that successful check to the current merge
candidate and invalidates or reruns it after either base or head moves. Where the host cannot provide that binding,
the workflow updates the result branch and refreshes finalization against the exact parent through the ordinary
finalize retry; it never asks the agent to reconstruct the receipt or provide object IDs. Partial-protection direct
commits already use the current base `HEAD` as their exact parent. This keeps the concurrency decision at the
pre-landing boundary without a coordination record or post-merge repair protocol.

## Allocation Units and Ownership — Working Direction

Allocation remains a semantic accountability map, not a byte-copy transport. Before creating a result branch, a
read-only CLI preflight resolves the exact committed source projection and emits its canonical source-unit IDs,
artifact names, hierarchy-qualified heading paths, content digests, and incoming/outgoing dependency edges. The
cut map is authored against that output; preparation independently re-derives it and rejects drift. The projection
is ephemeral CLI output, not another receipt, cache, or record store.

The locator and landing changes take an explicit schema step. New allocation maps use schema version 3:
section locators carry heading level plus hierarchy/occurrence identity, and each allocation carries the
machine-emitted source identity and content digest for that v3 representation. New preparations and finalized
receipts also use v3 for the result-base, touched-path, and mode-aware patch bindings. The preflight emits those
closed fields in a ready-to-author map; agents do not calculate or transcribe them. The authoring command accepts v3
for new transforms and gives older cut maps a deterministic upgrade refusal rather than silently broadening their
meaning.

Durable receipt reading remains backward-compatible. Historical v1/v2 receipts — including their embedded v2
allocation maps — continue to decode and validate under their original closed schemas, receipt IDs, and paths; they
are never rewritten or migrated. New v3 identities remain schema-bound in the same way. Keep historical receipt
decoding separate from current cut-map authoring acceptance so the complete durable namespace remains readable
without making obsolete map versions valid input to a new transform.

Markdown source inventory uses disjoint, exhaustive blocks:

- Content before the first H2 remains the artifact preamble.
- Every recognized H2–H6 starts one block that ends immediately before the next recognized H2–H6. A parent block
  therefore carries only its own lead content, not overlapping child subtrees. Locators include the heading level
  and ancestry/occurrence needed to distinguish repeated nested headings.
- Existing fence, HTML, quote, and list-container protections continue to prevent incidental heading syntax from
  becoming allocation boundaries. Non-Markdown artifacts remain whole-file units.

If one block still contains task-driving concerns for multiple destinations, refine the source with ordinary
subheadings and commit it before retrying. Do not add line-range locators, allocation markers, or a selectable
overlapping-section frontier. That leaves one familiar authoring mechanism and keeps exact-once coverage mechanical.

The current ownership vocabulary is sufficient when its semantics are enforced:

| Source ownership    | Authoritative destination                                                                                                                                                               |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `destination-owned` | Exactly one new member, surviving origin, or existing authoritative home. Multiple consumers add cohort pointers and consumer/seam coordination; they do not make the design ownerless. |
| `cohort-shared`     | The cohort coordination document, for genuinely ownerless sequencing, shared constraints, provenance, or closeout material — never task-driving design.                                 |

Targeted allocations couple those ownership values to their permitted destination kinds. A reasoned drop remains
available, but `cohortless` decomposition continues to reject `cohort-shared` material because that material proves
the cut needs a cohort-backed placement. At-cap fanout uses the same `cohort-coordination` entry against the origin's
already-existing parent cohort document; this corrects the current validation mismatch without adding a destination
kind or a second coordination artifact.

Extraction must allocate at least one source unit to every extracted new member. A map that leaves every unit with
the survivor while synthesizing a new member is not conservation evidence; add the missing ordinary heading
boundary before the transform. This closes the empty-allocation escape while leaving exact inventory coverage and
reasoned drops as the general rules.

## Planning Maturity Preservation — Working Direction

Decomposition preserves the latest **completed planning authority**, never an in-progress workflow stage. New
members have two closed entry profiles:

| Completed authority at the cut | Required member design output | Member entry     |
| ------------------------------ | ----------------------------- | ---------------- |
| No finalized, reviewed spec    | Complete member `draft-*`     | `draft-design`   |
| Finalized, reviewed spec       | Complete member `spec-*`      | `generate-tasks` |

There is no `create-spec` entry. If a cut surfaces during spec authoring, finish and review the holistic spec before
decomposing. If the cut makes that impossible without reopening design, the transform uses the draft profile
instead. This makes the split point a durable authority boundary rather than a claim about partial-spec maturity.
Likewise, a fuller or finalized parent task list remains reusable input to `generate-tasks`; it does not create a
third ready-to-activate profile. Each child must establish its own executable task plan against its own spec.

Do not add an author-entered maturity field. Derive the profile from v3 target locators: every new member receives
at least one source unit in its own authoritative `draft-<member>.md` or `spec-<member>.md`, and all new members in
one transform use the same design kind. A missing design destination, mixed draft/spec destinations, or both kinds
for one member refuses before mutation. Existing-home destinations retain their own lifecycle state and do not
participate in this homogeneity rule.

The mature profile distributes complete, self-contained child specs as semantic projections of the reviewed parent
spec. Task-driving requirements retain exactly one authoritative destination; shared context may be restated where
self-containment needs it, while genuinely ownerless sequencing and seams remain cohort coordination. The mandatory
allocation-map interlock reviews the partition and child-spec completeness. It does not replay `draft-design`,
`create-spec`, their adversarial reviews, or the underlying design decisions. A partition that reopens a design
decision is not eligible for this profile.

A reviewed parent task skeleton may be conserved as additional source input, but exact-source retirement must not
read an uncommitted worktree. When the skeleton is worth carrying, the existing structural-pass approval also
authorizes one source-branch checkpoint commit before the transform; it creates no extra review, receipt, or
operator-supplied evidence. The map may then allocate its phase/task blocks into provisional
`tasks-<member>.md` files. When no skeleton is worth carrying, omit those files and generate them normally from the
child specs.

Mature member metas carry `State: Planning`, `Design: spec-<member>.md`, `Current Workflow: generate-tasks`,
`Task List: [none]`, and the begin-current-workflow `Next Action`. `Task List` stays unset because an optional
carried skeleton is not finalized authority. Draft-profile metas analogously point at the member draft and enter
`draft-design`. The scaffold returns the profile-appropriate managed paths and permits the mature spec and optional
task destinations; the workflow, not the CLI, authors their semantic content.

Graduation must preserve this result. `arc start` keeps a valid planning-stage pointer already present on a backlog
meta; when the pointer is unset, it derives `generate-tasks` from a `spec-*` Design and `draft-design` from a
`draft-*` or absent Design. An inconsistent tuple refuses with a direct remedy instead of silently resetting to
the first stage. Artifact relocation then carries the complete member suite into the planning worktree unchanged.

At mature-child entry, `generate-tasks` still begins at **Resolve depth & Class**. If a conventional
`tasks-<member>.md` exists while the meta `Task List` remains unset, the workflow reads it only as a provisional
structural seed and may retain, rewrite, or discard it while rerunning Structural decomposition. Ordinary finalize
sets the Task List pointer only after the child plan passes the normal content, grounding, suite-review, and
interlock path. No new durable seed marker or task-list status is needed.

This profile applies equally to a retired origin and to extracted unbuilt scope from a surviving origin. An Active
full split whose built code belongs to several results remains the existing escape hatch rather than another
planning-entry profile. Eligibility, fallback, and mixed-maturity doctrine belong to `decomposition-doctrine`;
this work owns the artifact projection, schema validation, scaffold/meta initialization, launch preservation,
provisional-task behavior, and real-topology tests that make the doctrine executable.

## Finalize / Reconcile / Ship / Teardown — Working Direction

Finalization remains the last normal binding step before commit, but it is no longer a one-shot state trap. The
same `arc decompose <origin> --finalize <receipt-id>` invocation distinguishes three record states:

- A preparation follows the current finalization path.
- A finalized receipt whose staged projection still matches returns a typed `already-finalized` success.
- A finalized receipt not yet present in the result parent may be refreshed after approved destination edits,
  provided the source, allocation, inventories, result-base preconditions, and closed allowed-path set all still
  validate. Refresh recomputes the exact transition-patch and target digests and replaces only that staged receipt.

A receipt already present in committed history is immutable; later content refinement is a separate commit.
Unsafe retry reports a concrete mismatch category and locus — record state, source projection, result-base
precondition, staged path, destination content, or dependency allocation — rather than collapsing every case to
`evidence-mismatch`. There is no rollback record or second preparation store: the finalized receipt already carries
the allocation/inventories, and v3 carries the prepared result-base head plus touched-path and mode-aware patch
bindings needed for refresh and landing. The preparation's result ref remains operational compare-and-set context;
the finalized candidate derives from the durable base binding and patch rather than depending on a branch ref that
may disappear after merge.

One shared finalized-decompose validation kernel owns that derivation. It first uses the closed version-specific
receipt decoder, then validates receipt identity, inventories, target bindings, and the exact candidate patch. The
local commit hook, exact-ref planning classifier, descendant-base landing check, and transition-overlay adapter all
consume this same typed result rather than independently re-parsing receipt-shaped JSON. Historical v1/v2 readers
retain their existing authority; only a fully valid v3 decompose candidate can grant the new planning-lane
exception. Malformed or shallowly receipt-shaped content grants no exception, and a retirement it purports to
authorize fails closed.

The lasting ROADMAP/STATUS contract is narrower than renderer consolidation: the structured project-readiness
projection accepts an explicit, validated transition overlay saying that one decompose result supersedes its origin.
Markdown emission does not discover or reinterpret the transition. The current staged-index adapter derives that
overlay from the one finalized decompose receipt represented by the current result projection. In a merge-like
operation it considers the relevant operation parents, but selects a receipt only when the shared validator derives
the current candidate from its durable result-base and patch binding; a historical receipt merely absent from
another parent is not eligible. Multiple or contradictory candidates fail closed.

The pre-commit assertion and conflict auto-remedy consume that same structured projection. Git-operation-parent
discovery is an intentionally interim adapter for the tracked in-repository view and may disappear when project
status becomes materialized operational state. Do not use this work unit to consolidate renderers, change
regeneration timing, rename or dematerialize ROADMAP, add a render command, or design the general record-to-projection
engine; those remain with `roadmap-tooling` and the managed-record substrate.

The planning lane treats a finalized decompose receipt as a verified companion artifact, not as planning content
by pathname. Exact-ref classification may return `planning` only when there is one canonical decompose receipt,
the shared full validator proves its v3 candidate against the exact change, and every remaining endpoint already
belongs to the planning lane. The classifier and merge-gate ownership recipe must move together. A broad retirement
namespace exception, a malformed or legacy receipt addition, or a rule/strategy/code rider beside a valid receipt
remains `reviewed`; a purported decompose retirement with invalid evidence also fails its retirement gate.

That mechanical proof is deliberately not semantic judgment. Before mutation, the mandatory workflow interlock
shows every source allocation, destination, dependency disposition, and reasoned drop; the user's approval of that
map is the semantic authority. Preparation and finalization then bind the approved map to the exact source,
inventories, destinations, and transition patch, while the lane adapter proves only that the PR faithfully carries
that one closed transform. Any foreign-owner artifact or other existing review-threshold condition still moves the
whole change to `reviewed`. Do not add an approval credential, signature field, or semantic classifier to the
receipt.

Receipt-backed teardown keeps the exact local source-head check. Remote handling then classifies the observed ref:
absent is already resolved; equal to the source or a strict ancestor is safe to delete; descendant or diverged is
unsafe. The ancestor case uses the existing delete disposition with the observed remote OID as its compare-and-delete
lease, so a concurrent move still vetoes cleanup. The receipt proves the exact local source was conserved, while
the ancestry check proves the stale remote contains no unique work. Neither case needs a preliminary push or a new
persistent state.

## Operator Ergonomics — Working Direction

Internal exactness earns its cost only when it removes uncertainty from routine operation rather than exporting
proof work to the agent. The happy-path contract is:

- Symmetric and other retirement shapes add no manual evidence step beyond the intended preflight, run/finalize,
  and existing commit/ship interlocks; run owns preparation internally. Extraction adds only its inherently
  separate result-then-source finish leg.
- Preflight owns map scaffolding; adapters derive base/head and receipt/candidate identity. No workflow asks an
  agent to compute a digest, find an object ID, reconstruct a record from Git objects, or edit machine-owned schema
  fields.
- Idempotent finalize and finish retries return success when already satisfied. Harmless destination wording edits
  and unrelated base movement refresh or validate automatically when the closed paths and dependencies remain safe.
- A refusal names the exact conflicting path, source block, locator, or dependency and prints the direct recovery
  action. Broad `evidence-mismatch`, restart-the-transform advice, and archaeology through prior blobs are not
  acceptable routine outcomes.

The real-topology E2E suite treats usability as behavior, not documentation: cover finalize-after-wording-edit,
already-finalized retry, result landing after unrelated base movement, extraction with committed Active code,
changed-source reapproval without repeating the result leg, already-finished extraction, and each direct refusal
remedy. It also covers unchanged draft-profile behavior; mature spec distribution with and without a committed
provisional skeleton; rejection of missing or mixed design destinations; mature-child graduation that remains at
`generate-tasks`; provisional seed rewrite without a premature Task List pointer; and ordinary child finalization.
If the happy path or these ordinary recoveries require manual evidence manipulation, the design has failed even
when its validators are technically exact.

## Draft State

- **Readiness:** `formalization-ready` — the transform locus, receipt lifecycle, allocation model, landing
  authority, shipping lane, operator-recovery contract, cleanup behavior, and narrow ROADMAP transition-overlay
  boundary are settled.
- **Resolved:** terminal-decompose narrative mentions do not enter reconcile; structured dependency and dangling
  artifact checks remain. Retirement receipts stay durable, while enumeration must batch reads at scale. The
  transform should be result-rooted rather than transport a staged source patch between worktrees; extraction uses
  an ordered destination-first/result-then-source sequence, and only a true semantic survivor keeps origin identity
  (with rename composed separately when useful). Allocation uses read-only inventory preflight plus disjoint H2–H6
  blocks; ordinary subheadings refine a coarse block. Task-driving design has one authoritative destination, while
  genuinely ownerless coordination uses the existing cohort destination, including the existing parent cohort at
  cap. Retirement-only branch-delta checks do not inspect retained Active extraction code. Landing uses
  touched-path preconditions and internal mode-aware candidate validation on descendant base parents. Uncommitted
  finalization is idempotent and refreshable within its closed projection; merge-time supersession is
  operation-parent-aware; one fully decoded v3 receipt may accompany an interlock-approved, otherwise planning-only
  transform; teardown may safely delete an equal or stale-ancestor remote under an exact lease. Extraction has an
  explicit result leg and reviewable, idempotent source-finish leg without persistent coordination state or
  operator-supplied evidence identities. Descendant-base landing is derived from the current merge candidate or
  falls back to ordinary exact-parent refresh. New transforms use schema v3 while historical v1/v2 receipts retain
  their original decoding and identities. New members preserve the latest completed planning authority through two
  inferred, homogeneous profiles: drafts enter `draft-design`, while complete specs enter `generate-tasks` with an
  optional provisional task seed and no premature Task List pointer. There is no partial-spec, ready-to-activate,
  mixed-maturity, or arbitrary bundle mode; `arc start` preserves or safely derives the valid entry stage instead
  of resetting it. Routine recovery must identify the conflicting locus and direct remedy; internal exactness may
  not become agent proof work.
- **Open:** [none]
- **Next:** surface the settled draft at the capture interlock and, on approval, transition to `create-spec`.

## Boundaries

- **Not** the when-to-cut question. Discriminator, recorded verdict, tripwire, and stack-vs-coupling belong to
  `decomposition-doctrine`.
- **Not** general mint-time properties of resulting members. This work owns only decompose's design-artifact/stage
  projection and the launch preservation required to keep it intact; commitment-level inheritance and
  close-with-launch remain with `stub-mint-to-launch`.
- **Not** a retirement-evidence retention redesign. This work may remove per-record read amplification but does not
  add receipt expiry, compaction, summaries, or a second store.
- **Not** the ROADMAP/STATUS view lifecycle. Rendering standards, naming, branch-carried projection retirement,
  materialization, and the generic record-to-projection engine belong to `roadmap-tooling` and the managed-record
  substrate; this work owns only decompose's validated transition overlay and its current staged-index adapter.
- Charter is transform integrity — run, conserve, commit, and prove. Resist growing into a general home for every
  decompose concern; adjacency is not membership.

---
