# Spec (`detailed` · `RFC`): decompose-conservation-coverage

- **Origin:** [internal]

- **Purpose:** Make a retirement cut provable and expressible end to end: conservation covers every origin artifact
  whose content retirement removes, the authored cut map can state a dependency the author already knows, and every
  refusal from every decompose mode names its failed invariant and the one command that advances from it, while
  actionable comparisons expose differing evidence when the refusal boundary owns both operands.

---

## Introduction / Context

Retirement decomposition is the only lane where proof and deletion share one operation. The proof covers the units
scanned from the origin's design artifacts; the deletion covers the whole artifact group. Today the scan set is
fixed by the meta's `Design` pointer — the draft, the single spec, or the paired spec — while the retirement delta
deletes every `<prefix>-<slug>.md` in the origin's directory. A `notes-*` companion and any present task list sit
in the deletion set and outside the proof. Nothing scaffolds notes content into a member, a task list is carried
only when an author remembers to target the tasks artifact, and no refusal names the gap.

The first real cut carried assurance and seam-algebra content in a notes companion. The cut assigned that content
to a member, but the transform deleted the file while reporting complete conservation; the content survived only
because the operator folded it into the cohort doc by hand. History makes recovery possible, yet no diagnostic says
recovery is needed. With transaction verification retired by `decompose-transition-record`, conservation is the
only remaining net under a content-preserving split; this work unit carries that safety role for the
`decompose-core-hardening` subcohort.

Two adjacent gaps surfaced on the same cuts and share the transform's execute and preflight surface. A member
cannot declare a dependency on a work unit outside the cut unless that work unit is also a destination, and the
one alternative — a hand edit to the staged member meta — fails the exact transform-delta proof that
`--advance-base` relies on. And refusals are uneven: roughly three hundred refusal sites and about one hundred
fifty distinct code literals return bare codes from pure modules, remedy text exists only as a free string on
`--execute` and `--extract`, `--preflight` writes a reason to stderr with nothing on stdout, and the two refusals an
author is most likely to hit while placing content carry no locus at all. The integration spine already defines
the remedy contract this surface lacks.

This work unit consumes the shipped `decompose-transform-integrity` core — inventory, allocation, authored cut-map
validation, topology, conservation, exact transform-delta, and pinned-ref contracts — and the extraction arm from
`decompose-extraction`, and weakens none of them. It adds no durable record, identity, ledger, state machine,
recovery branch, or authority.

## Goals

1. Retirement deletes no content the proof neither covered nor an author explicitly disposed of — first as a
   fail-safe refusal, then as full inventory of the artifact group's Markdown companions.
2. Hold extraction's bytes unchanged: an Active origin's companions never become source units, and a
   started-Planning origin's companions are retained-only under the extraction shape.
3. Give every companion unit an admissible member destination, so the floor's remedy names a real authoring path
   rather than a paste step.
4. Let a completed cut map declare a dependency edge from a member or existing home to a work unit outside the cut,
   validated against the live and completed work-unit sets and written through the existing meta mutator.
5. Emit one remedy contract — invariant, verbatim text, executable argv — from every refusal of all six modes,
   composed at the command boundary, inside one typed refusal envelope on stdout.
6. Carry both sides of a comparison as typed evidence when the refusal-producing boundary owns both bounded
   operands; keep one-sided failures and transient verifier races locus-only.

## Non-Goals

_Frozen at activation; changes after that append: `Amended YYYY-MM-DD — <delta> — <prompt>`_

- Extraction thinning of companion content. An Active origin's companions are never scanned; a started-Planning
  origin's are retained-only under the extraction shape; the origin survives and finish already authenticates
  transfers.
- Prefilled starter-map dispositions of any kind; starter maps stay author-slot only.
- Transition-record schema changes of any kind, including an explicit-disposal attestation.
- Transform-owned content placement into members — thinning a member's retitled copy to its allocated units or
  placing units by locator. Distribution stays operator-owned unless re-chartered by amendment.
- Shape as a preflight input; recorded as direction, not built.
- Post-authoring byte proof that an allocated unit's content reached its destination.
- Cohort-consistency validator fixes and any corpus-wide gate, owned by `operational-state-docs`.
- Task-plan ordering doctrine, owned by `plan-segmentation`. Decomposition carries task-list content as provisional
  phases; a member's own generate-tasks pass re-segments whatever it keeps.
- ROADMAP projection or render changes beyond the existing seam; `roadmap-tooling` owns the render standard.
- Typed dispatch of emitted remedies — executing an emitted argv as a compiled step — owned by
  `composable-workflows`.
- A refusal-code catalog or reference document; command awareness rides the emitted remedy.
- Performance and concurrency bounding, owned by `decompose-scaling`.
- When and at what maturity a cut is valid, owned by `decomposition-doctrine`.
- Any new configuration axis, including a per-family conserve switch.

## Proposed Design

The design has three arms sharing one execute/preflight surface and one refusal contract. The conservation refusal
is the first consumer of the remedy shape, so the arms are ordered: the refusal contract with the conservation
floor first, companion inventory second, external edges third. That ordering is recorded slice-awareness for the
task list, not bound delivery state.

### D1. Refusal contract, envelope, and evidence

**One remedy contract across all six modes.** Every decompose refusal adopts the integration spine's remedy —
`SpineRemedy` from `spine-refusal.ts`: `invariant` (the failed invariant in the operator's terms), `text` (verbatim
guidance naming the corrective command), `argv` (the corrective command, executable without shell reconstruction),
and optional `stdin`. `--preflight`, `--finish`, and `--advance-base` gain remedies; `--execute` and `--extract`
converge on the shared shape. The argv is the re-attempt or the corrective verb — `--preflight` after drift,
`--execute <map>` after a map edit, `arc teardown --branch <candidate>` after a stranded full-protection candidate,
`git push` after `source-unpublished` — never a verb that pretends to author missing work. `spineRemedy()` composes
the text from the invariant and correction. Structured argv builders in `decompose-command-renderer.ts` own the
opaque operand arrays for preflight, execute, extract, finish preview, finish apply, and base advancement. Existing
display renderers consume those builders when prose still needs a command string; remedy composition receives the
argv directly and never reconstructs it by parsing rendered shell text. The refusal mapper accepts the closed invoked
mode context — origin, cut-map path and apply authority where applicable — plus typed recovery facts, so it can choose
the exact retry or cleanup command without granting recovery authority to a pure result.

**Composed at the command boundary.** Remedies map from the stable refusal codes where each mode's result is
rendered — the two command wrappers `executeGitV3DecomposeCommand` and `executeGitV3ExtractionCommand` in
`git-decompose-v3-operation.ts`, and matching boundary mapping for the preflight, finish, and advance-base results
before `handleDecompose` in `handlers/lifecycle.ts` writes them. The pure modules keep returning bare codes.
Composed codes are a prefix chain over stable segments — `<stage>:<reason>`, `map:<issue>`,
`source-binding:<mismatch>`, `source-plan:<reason>`, `git-preflight:<stable-code>`,
`advancement-plan-refused:<stage>:<reason>`, `candidate-transform-mismatch:<mismatch>`,
`candidate-advancement-chain-invalid:<mismatch>`, `post-merge-validation-refused:<mismatch>` — and the mapping
parses the chain and selects the remedy from its innermost stable code, with the outer segments naming the
operation that surfaced it. One mapping owns every code, and it is total **and specific**: every refusal
code literal in the decompose modules has its own invariant sentence and corrective argv. A test enumerates the
code literals from source and fails when any resolves to the generic re-attempt fallback; composed-code tests cover
their stable prefix chains. Arbitrary exception messages never become code segments. In
`createGitV3DecomposePreflight`, known failures retain stable codes with variable detail in `locus`; unclassified
caught failures return `unexpected-error` with the message as locus, reaching the same named exception below as an
uncaught in-mode error. The source enumeration proves known-code coverage, and injected arbitrary Git/read failures
verify normalization; runtime messages are not a supposedly enumerable code family. Today's "No
recovery command was authorized" string is retired, not renamed. The remedy text names the concrete corrective
edit in the operator's terms — for the conservation floor, move the named companion's content into a scanned
artifact or delete the file, then re-preflight — never a restatement of the code.

**The remedy field changes type.** `GitV3DecomposeCommandResult` and `GitV3ExtractionCommandResult` replace
`remedy: string` with `remedy: SpineRemedy`. The advance-base refused arm, today `{ status, reason }` alone, widens
to carry `locus` and `evidence`, and its plan-refusal composition threads the repository plan's locus through
instead of flattening the refusal to a reason string. Pre-release posture applies: no alias, no dual field. The
`decompose-work-unit` workflow already dispatches on the returned status and remedy and stays at that shape.

**One typed refusal envelope on stdout.** A refusing invocation of any mode emits exactly one canonical-JSON
envelope on stdout and the `reason` plus `remedy.text` on stderr, and exits nonzero. The core envelope is a strict
Zod object validated at the boundary for every mode, the way `V3ExtractionFinishResultSchema` already is for
finish:

```text
status: refused
reason: <stable code>
locus?: <string>
evidence?: { expected: <json>, actual: <json> }
remedy: SpineRemedy
```

Operation-returned `--execute` and `--extract` refusals extend the core with their existing typed `stage` and
`recovery` fields; the other modes emit the core alone. A handler-caught `unexpected-error` has no operation result
from which either fact can truthfully be derived, so every mode uses one explicit core-only `unexpected-error` arm;
the execute/extract boundary schemas are strict unions of that arm and their stage-bearing operation-refusal arm.
`--preflight`'s `rejected` status literal converges to `refused`; its stdout carries the envelope instead of nothing.
The decompose envelope keeps `refused` rather than composing the handler's existing
`LifecycleCommandRefusalSchema` (`status: "rejected"`, used by publish and attest): four of the five decompose results
already use `refused`, the finish schema is the model, and unifying the literal across unrelated verbs is not this work
unit's concern. Two paths stay outside the envelope by decision: operand-schema failure and "not an ARC project" precede
mode selection and remain text on stderr. An error thrown inside a mode converts at the boundary to the core-only
envelope with code `unexpected-error`, the message as locus, and the re-attempt of the invoked mode as remedy — the
one named exception to remedy specificity, excluded from the exhaustiveness test by name. It never fabricates a
stage, recovery fact, or report. A refusal envelope is not a partial
starter map. The following is recorded as a forward amendment of `spec-decompose-transform-integrity.md` § D2 ("It emits
only canonical starter-map JSON on stdout; diagnostics and warnings use stderr. Refusal exits nonzero and emits no
partial JSON."): on success, preflight's stdout is the starter map alone; on refusal, preflight's stdout is one refusal
envelope alone. The completed spec's text is not rewritten. Both copies of `decompose-work-unit.md` state the envelope
once, replacing the preflight arm's "a refusal emits no partial map" and the finish arm's remedy mention with one
sentence true for every mode, and its refusal-handling rule surfaces status, remedy, **and evidence** unchanged, so the
human sees the expected-versus-actual pair without asking.

**Differing evidence on comparison refusals.** A refusal carries `evidence` when both bounded sides reach the
refusal-producing boundary as observations of repository state or recorded machine evidence — a recorded fact
against a live read, or two owned live reads that must agree. A refusal that checks the map's or plan's internal
consistency — identity, ordering, cardinality, projection agreement between two composers of the same input —
carries a locus only; its two sides are not operator-actionable facts. A transient verifier that returns only a
mismatch locus also stays locus-only rather than widening a shared recovery interface solely for reporting.
`expected` is the recorded or earlier side;
`actual` is the live or later side. One shared strict evidence schema requires exactly `expected` and `actual`, each
validated as JSON. Producers project observations into bounded canonical facts before returning them: bytes become
`{ contentDigest, byteLength }`, absence becomes `{ kind: "absent" }`, unordered sets become canonically sorted arrays,
and object, mode, or path state uses the smallest closed record that preserves the compared operand. Runtime values
such as `Uint8Array`, `Error`, `Map`, and `Set` never enter the envelope; arbitrary error detail remains a locus. The
admitted set, enumerated from the refusal sites:

- `decompose-v3-preflight.ts` (map rebind): `source-logical-branch`, `source-ref`, `source-head`, `result-ref`,
  `result-head`, `planning-profile`, `preflight-id`, `source-artifact-inventory`, `source-units`, `incoming-edges`,
  `outgoing-edges`.
- `decompose-v3-refresh.ts`: `source-identity`, `result-base`, `planning-profile`, `source-units`,
  `incoming-edges`, `outgoing-edges`.
- `decompose-v3-execution-preflight.ts`: `completed-map` where the map's origin differs from the command operand.
- `decompose-v3-repository-plan.ts`: `source-meta-mismatch`, `source-artifact-mismatch`.
- `decompose-v3-conservation.ts`: `incoming-edge-set-changed`, `outgoing-edge-set-changed`, `stale-dependent`.
- `git-decompose-v3-repository-plan.ts`: `source-ref-moved`, `result-ref-moved`.
- `decompose-v3-thinning.ts`: `source-object`, `source-mode`, `source-bytes`, `source-unit`.
- `decompose-v3-finish-operation.ts`: `source-index-preimage`, `source-worktree-preimage`.
- `git-decompose-v3-finish.ts`: `apply-authority`, `map:origin`, `base-ref-mismatch`, `source-ref-moved`, `destination-object-kind`,
  `destination-mode`, `destination-bytes`, `destination-meta`, `dependency-claim`, `roadmap-current-render`,
  `source-raced`, `base-raced`, and `topology-claim` at the comparison sites described below.
- `git-decompose-v3-operation.ts`: `source-unpublished`, `partial-projection-drift`, `repository-plan-drift` (plan
  identities).
- `decompose-result-occupation.ts`: `base-moved`, `candidate-head-mismatch`, `marker-mismatch`.
- `git-decompose-transition-base-advancement.ts`: `changed-paths`, `path-state`, `transition-record`,
  `candidate-registration-mismatch`, `candidate-marker-mismatch`, `base-not-descendant`, `binding-raced`,
  `base-acquired-incoming-dependency`, `dependency-recipient-drift`.
- `decompose-v3-retirement-delta.ts`: `unexpected-object-kind`, `unexpected-mode`, `predecessor-changed`,
  `backlog-predecessor-changed`.
- `decompose-v3-materializer.ts`: `final-blob-mismatch`.
- `decompose-v3-plan.ts`: `incompatible-base-prestate`.

For `topology-claim`, comparisons of the landed cohort identity, parent, and fan-out block against the authored
placement carry the expected claim and observed value or block. A missing or undecodable document, or a malformed
required purpose field without a recorded counterpart, remains a locus-only observation failure. Admission is by
comparison site, not by the shared code alone; tests exercise both kinds of `topology-claim` refusal.

Array comparisons (`source-units`, `incoming-edges`, `outgoing-edges`, the edge-set changes, `changed-paths`)
carry the first differing element or the two sets, and their locus stays the first mismatching index or path.
`changed-paths` and `path-state` in base advancement embed their two sides in the code literal today; the sides
move to `evidence` and the code literal stabilizes to its prefix. Every code in the set remains stable and
machine-readable. The field is additive on the refusal objects the pure modules already return and is threaded
outward as an object, never re-embedded in a composed code literal; the preflight and advance-base command results
widen to carry `locus` and `evidence` so the thread reaches the envelope in every mode. Codes outside the set —
`machine-identity`, `machine-order`, `authoring-*`,
`*-cardinality`, `destination-coverage`, `*-projection-mismatch`, `managed-path-set-mismatch`,
`contributor-prestate-discontinuity`, `roadmap-plan-identity-mismatch`, `post-*-revalidation-failed`,
`incomplete-profile-artifacts`, `source-range`, `source-preimage-raced`, the `duplicate-*` and
`wrong-structural-identity` families — carry a locus only.

**Refusals gain the locus they lack, and one code per remedy.** The two locus-less refusals in
`composeRepositoryPlan` — `content:profile-scaffold-failed` and `content:target-projection-failed` — each cover
several causes whose corrections differ, so a remedy keyed by code alone would misstate most of them. They split
by cause, each carrying the member slug and artifact path as locus: `scaffold-source-meta-incomplete` (the origin
meta lacks owner, priority, or origin), `scaffold-source-missing` (the design, tasks, or notes source the scaffold
copies is not a regular file in the source tree), `scaffold-source-invalid-encoding` (an unscanned Active-origin
task or notes source is not UTF-8), and `scaffold-title-missing` (a valid UTF-8 source does not open with a title
line); `existing-home-unresolvable` (an existing-home destination's path cannot be resolved or is
not a regular file), `target-artifact-absent` (the allocation's target artifact is absent from the projected
post-scaffold tree), and `target-locator-unresolved` (the target locator does not resolve against the projected
bytes). The unknown-destination branch is already refused upstream by conservation and stays internal.

**Scoped repository gating — not this work unit.** The cohort-consistency hook already reasons over the staged
path set, and its known defects are owned by `operational-state-docs` under its planned `corpus-conformance-gate`
member. A concrete case of the transform blocked on a defect it did not introduce routes there as a capture.

### D2. Conservation boundary

**The boundary is the logical WU artifact group:** retirement must account for all of its content-bearing artifacts,
regardless of their storage placement. In today's tracked tier, discovery uses `artifactMatcher(origin)` in the
resolved WU directory, plus the existing paired-spec names. The matcher admits valid `<prefix>-<origin>.md`
companions rather than a fixed prefix list; meta, spec, tasks, draft, and notes are the ordinary families. Supplemental
research or analysis documents belong to this set only when their name and location match, not merely because they
support the WU. Both source and predecessor discovery explicitly exclude the same-name `cohort-<origin>.md` basename,
which the open matcher also accepts, without narrowing the shared matcher used by relocation. This naming/location
rule binds the current storage implementation; it is not the future backend's definition of artifact ownership. The
three-tree retirement delta remains the current version-bound mutation proof.

**Floor — refuse on uncovered retirement content.** In `composeRepositoryPlan`'s retirement arm, before the retirement
delta is planned, every Markdown member of `currentPreflight.sourceArtifactInventory` other than the meta must either
carry at least one unit in `machine.sourceUnits` or be byte-empty. A nonempty member outside the scanned set refuses
`--execute` and `--advance-base` with a typed refusal `uncovered-retirement-content` whose locus is the path and whose
remedy names the fold-or-drop path and re-preflight as the argv; under `--advance-base` the locus survives the widened
refusal arm. The meta is excluded because it is a record, not content: its dependency edges are conserved through the
incoming and outgoing dispositions, and its deletion is the transition. This is the cheapest safe default and lands
first. Once inventory lands, every Markdown member is scanned under the retirement source kinds, so the floor survives
as the invariant assertion over inventory minus scanned, kept with its test rather than retired; its refusal is
observable in a shipped build only before inventory ships.

**Inventory companions — the full path.** Every Markdown member of the group present in the inventory other than
the meta is scanned by the existing content scanner, presence-driven rather than pointer-driven, and its units take
the existing target and drop dispositions exactly as design units do. A **companion unit** is any source unit whose
`sourcePath` basename is not in `profile.sourceDesign`: `tasks-<origin>.md`, `notes-<origin>.md`, a `draft-<origin>.md`
co-present beside a finalized spec, or any other valid `<prefix>-<origin>.md` the inventory matcher admits in the
resolved group. No per-family switch or configuration axis is introduced. The existing dispositions are the explicit
disposal, so no new disposition kind is needed. The following particulars settle the composition:

- **Predecessor discovery uses the same artifact family.** `originArtifactPaths` in
  `decompose-v3-repository-plan.ts` selects the predecessor's group from its resolved directory in the pinned
  result-base tree using `artifactMatcher(origin)` plus the paired-spec names, matching source inventory rather
  than its current closed prefix list. Pass that complete set to `planV3RetirementDelta`; a valid companion moved
  from backlog to active must not appear as a `source-private-deleted` rider at its former path. Existing
  predecessor version checks and unrelated-file rider refusals remain in force. Both discoveries belong to the
  current storage binding; conservation consumes their resolved inventories without rediscovering paths.

- **The scan is keyed on source kind.** `sourceUnits(artifacts, profile)` in `decompose-v3-preflight.ts` gains
  the resolved `machine.source.kind` and exact source-meta path, both of which `createV3DecomposePreflight` resolves
  before it scans. The exact meta path is excluded first under every source kind. Under `started-planning` and
  `backlog-stub` the scan admits every remaining inventoried Markdown member; under `active-origin` it admits the
  profile's design names alone, so an Active origin's companions are never scanned and never become source units.
  The single scan function stays the only unit source; every production consumer — preflight, execute revalidation,
  extract, repository-plan composition, and finish's own preflight rebuild — routes through
  `createV3DecomposePreflight` and inherits the widened set with no call-site change.
  The exported `deriveV3DecomposeSourceFacts`, which calls the scanner without resolving a source kind and has
  test-only callers, is retired; its tests move to `createV3DecomposePreflight`.
  A non-UTF-8 Markdown member selected for scanning fails here before starter-map authoring as `source-scan`, with
  the exact source path as locus and a remedy to convert that file to UTF-8 and rerun preflight. The separate
  Active-origin scaffold rule below covers companions deliberately excluded from this scan.
- **Task lists scan at phase granularity.** `scanV3DecomposeContent(basename, bytes)` selects the scanner's
  existing H2-only boundary mode — `markdownBoundaries(content, allLevels = false)`, unreachable today — for
  `tasks-*` basenames, inside the one function every consumer calls, so scan, target-locator resolution, thinning,
  and finish stay consistent. Phases are the units; the header above the first phase is one preamble unit; their
  section locators carry level 2 and empty ancestry, which no consumer reads. Every other companion scans at the
  ordinary H2–H6 granularity. A present task list under a draft profile is content like any companion and scans
  the same way. Per-task units were the alternative: no scanner change, but dozens of allocations for an ordinary
  list.
- **Companion units get a member destination.** A provisional-notes scaffold mirrors the task one in
  `newMemberScaffolds`: when any allocation targets a member's `notes-<member>.md`, the transform scaffolds that
  member a whole retitled copy of the origin's notes companion through `retitleScaffold`, with role `notes` added
  to `V3ContentArtifactRole` and to the artifact-role classification in `contentContributions`, contributor kind
  `provisional-notes` added to `V3ContentContributorKind`, admitted by `destinationRoleIsApplicable` as `notes`
  plus `whole-file` the way `provisional-task` is admitted as `tasks`, and ordered with the scaffolds in
  `contributorKey`. The operator prunes it before the distribution interlock. The scaffold mirrors the task
  scaffold's precondition that the
  source opens with a title line; a notes companion without one refuses `scaffold-title-missing` at plan time
  with the member and path as locus and a remedy naming the fix — add the title line, then re-preflight — and a
  notes target whose origin has no notes companion refuses `scaffold-source-missing`, rather than recreating the
  no-remedy gap the scaffold closes. An Active origin does not scan companions, but a design-unit allocation can
  still target a provisional task or notes artifact and make its origin companion a scaffold source. If that source
  is not UTF-8, repository planning refuses `scaffold-source-invalid-encoding` with the member and source path plus
  conversion-and-re-preflight guidance; it never mislabels the failure as a missing title. The member meta records
  no notes pointer; none exists.
  The scaffold reaches the result report through the existing path — a `destinations` entry with
  `contributorKind: "provisional-notes"` and `artifactRole: "notes"`, beside the task scaffold's
  `provisional-task` — so the agent authoring the result sees it as a reported destination, never discovers it on
  disk.
- **Compatible destinations close over member roles.** Conservation's compatible-destination test for a new
  member — today a bare `-<slug>.md` suffix match in `artifactBelongsToWorkUnit` — closes over the artifacts a
  member can hold: the profile's design names for that member, `tasks-<member>.md`, and `notes-<member>.md`. A
  target at `meta-<member>.md` or any other suffix-matching name refuses `incompatible-allocation-locator` at
  conservation, where a locus and remedy exist. Today a section locator on the meta reaches the plan's locus-less
  projection refusal, and a preamble locator resolves against the scaffolded meta and is accepted as an allocation
  into it. The meta is a record and takes no content.

The provisional model is unchanged: the whole-copy task scaffold, the member's retain-or-rewrite freedom at
generate-tasks, and the `Task List: [none]` pointer rule stand. What changes is that the grounding work in a task
list is covered by the proof instead of carried only when an author remembers to target the tasks artifact.

**Holding the boundary against extraction.** The scan set is shared and fixed before the shape is authored, so
widening it would widen extraction's starter map, and finish would thin every non-retained companion unit. That
would break the extraction spec's invariant that the origin's task list is never a source unit, and the reasons
behind it still hold: an Active origin's task list is its live execution surface, finish re-authenticates source
bytes at apply time so a live list would trip reauthoring on nearly every finish, and extracted members must own
design scope, which tasks are not. Two rules, one per source kind:

- Under `active-origin`, the scan skips companions, so the invariant holds to the letter exactly where its reasons
  live.
- Under `started-planning`, the shape is not yet known at scan time, so companions are scanned, and a **decode
  rule** applies in `decodeV3DecomposeCutMap` beside the existing `source-shape` check: under the `extraction`
  shape, an allocation whose source unit is a companion unit — its `sourcePath` basename is not in
  `machine.planningProfile.sourceDesign` — accepts only the `retained-origin` disposition; any other disposition is
  a typed decode issue `companion-disposition` at that allocation's path. The decoder has both facts: allocations
  are index-aligned with `machine.sourceUnits`, and the profile is in the machine envelope. Thinning therefore
  never touches companion bytes. Allocation
  exactness is kept: the author fills each companion allocation, a small set under phase granularity.

**Finish authority after source progress.** Before `proveGitV3ExtractionDestinations()` accepts either refreshed
authority or fallback to the original map, one private pure classifier compares the current source group with the
original authenticated thinning plan. Companion paths are no-op thinning entries, so their path, object kind, mode,
and bytes must remain exactly at the common before/after state; an addition, removal, move, rename, mode change, or
byte change refuses `source:source-units`, even when locator identity and refresh would otherwise remain stable.
Non-companion paths may use refresh under its existing unit rules. Fallback is admitted only when every changed
non-companion path is exactly a before or after state from the original thinning plan, which preserves exact partial
prior thinning and already-finished recovery without authenticating arbitrary drift. Unrelated paths outside the
source group do not participate.

**Recorded amendment and accepted residual.** The sentence in `spec-decompose-extraction.md` § Additive result leg
that "the origin's task list is never a source unit" narrows, by forward amendment recorded here, to Active
origins. For a started-Planning origin under extraction, companions are retained-only source units, and a
structural change to one of them between extract and finish — a phase added, renamed, or removed — requires
reauthoring against a fresh preflight, through the reauthoring path that already exists. A Planning-state task list
has no live cursor, so that churn is low.

### D3. Authored external dependency edges

A member cannot declare a dependency on a work unit outside the cut unless that work unit is also a destination:
the decoder closes `internalEdges`, replacement targets, and outgoing targets over declared destinations, and
conservation narrows further to live recipients. A hand edit to the staged member meta before commit fails the
exact transform-delta proof that `--advance-base` relies on, so the map must carry the edge.

- **Schema.** `CompletedAuthoringSchema` gains `externalEdges: { from: <slug>, to: <slug> }[]`, canonically ordered
  by `(from, to)`, unique. `from` is a `new-member` slug or an `existing-home` work-unit slug declared in the map;
  `to` is any slug. The starter map carries `{ status: "author" }` as a whole-field slot like `internalEdges`; an
  explicit empty array is a complete closed value in the authored map. Starter maps stay author-slot only; the CLI
  suggests nothing. The new field leaves machine and `preflightId` identity unchanged, while `v3CutMapDigest()` and
  downstream plan identity cover the full authored value. Existing dependency-edge identities keep their preimages.
- **Completed-slug set.** The repository plan already reads the result-base tree in full with no pathspec.
  `completed-index.ts` owns completed-target eligibility through a pure wrapper that delegates semantic path
  recognition to `identifyWorkUnitArtifactPath()`, the inverse-layout authority, then accepts only a completed
  placement whose artifact kind is `meta`. The plan applies that wrapper to regular-blob entries in the already-read
  result-base tree, without parsing their bytes or issuing another Git read, and passes the resulting slugs to
  conservation as `completedSlugs`, distinct from `workUnits` and from the machine incoming-edge set. The existing
  loose filesystem/ref archive readers in `completed-index.ts` remain intentionally separate, resilient compatibility
  readers; the new exact eligibility policy does not duplicate or tighten them. The preflight snapshot, its
  three-tier pathspec, its per-branch spawns, and the preflight identity stay untouched, so completed dependents never
  enter the incoming-edge set that lifecycle resolution treats as immutable, and `--advance-base` recomposes from
  the tree it already reads. A future storage adapter supplies the same normalized eligibility set without exposing
  its layout to conservation.
- **Live-target set.** Pass `resultBaseLiveSlugs`, derived from the already-read `baseMetas`, to conservation as
  a separate eligibility input. Existing `workUnits` enumerates `sourceMetas` and uses `baseMetas` only for writable
  paths; it stays source-bound for incoming-edge conservation and recipient validation. It must not decide whether
  an external prerequisite exists on the current result base. A target created there after the origin branch fork
  is eligible without changing the preflight snapshot or machine incoming-edge set.
- **Resolution.** Conservation resolves each `to` against `resultBaseLiveSlugs` plus `completedSlugs`, refusing
  `unknown-external-target` only for a slug found in neither. A completed target is admitted as a landed edge,
  matching how dependency resolution and the existing outgoing-disposition path already treat one, so a target
  that ships between `--execute` and `--advance-base` leaves the map valid. One representation per fact: an
  external edge whose `to` is a declared destination refuses `redundant-external-edge`, because internal edges and
  outgoing dispositions already carry that edge. The retiring origin refuses as a target under the retirement
  shapes; under extraction the surviving origin is explicitly admitted from the authenticated source even if it
  is absent from the result-base sets. `from` must be a permitted recipient exactly as
  internal-edge dependents are; an edge already present in the recipient's `Depends On` refuses
  `unchanged-dependency-slot` through the existing check.
- **Write.** Each edge becomes one dependency contribution of a new kind `external` beside `internal` and
  `outgoing` — `V3ValidatedDependencyEdit.kind` widens accordingly, and its `edgeId` is
  `canonicalDigest({ schemaVersion: 3, kind: "external", from, to })`, disjoint from internal identities by the
  `kind` segment. Conservation continues to derive the exact add/remove intent from source-bound facts. The
  repository plan rebases that delta onto the recipient's current pinned result-base `Depends On` value at each
  contribution, preserving unrelated additions or removals instead of replacing the complete slot with
  source-derived `afterTargets`; an edit whose delta leaves the pinned sequence unchanged refuses
  `unchanged-dependency-slot`. The contribution's `before` and `after` states record that actual pinned sequence and
  flow through the existing `dependencies()` path — `setMetaBulletFields` on the `identifier-list` slot — so the edit
  lifts to managed records unchanged and renders in the staged ROADMAP through the existing seam, which shows
  unsatisfied edges only. The transition record is unchanged: it records incoming-edge dispositions, and an external
  edge is outgoing from a member.
- **Declared-destination routing.** `internalEdges` is the representation for a dependency between any two declared
  dependency-capable destinations. Conservation therefore uses the same new-member plus live existing-home work-unit
  endpoint set the decoder already accepts, instead of narrowing both endpoints to new members. Incoming-disposition
  validation stays source-bound, and outgoing dispositions still redistribute only prerequisites present in the
  machine inventory. The external-edge redundancy rule and workflow guidance now route every declared-destination
  case to a representation conservation accepts.
- **Finish proof.** Destination finish validates the complete composed mutation for a recipient carrying dependency
  contributors. Its separate incoming-edge claim runs only for an incoming dependent with no dependency mutation in
  the plan; it never recomputes a touched recipient from the incoming disposition alone and thereby drops an internal,
  outgoing, or external contribution from the expected set.
- **Advancement conflict boundary.** Initial composition rebases dependency deltas onto its pinned result base. After
  a full-protection candidate is committed, a dependency-bearing recipient that changes on a later base is a
  version conflict: advancement refuses `dependency-recipient-drift` with the previous and current dependency sets as
  evidence before merge mutation, and directs candidate cleanup followed by fresh preflight. Target lifecycle changes
  that do not alter the recipient remain admissible. Advancement keeps one current repository-plan recomposition and
  does not replay dependency transforms across historical bases.

Two earlier leans were withdrawn under review. Refusing a shipped target needed the completed tier for the one
purpose of refusing, contradicted the transform's own outgoing path, and opened an advance-base race. Widening the
preflight snapshot's pathspec targeted the wrong reader: it would have pulled completed dependents into the
incoming-edge set and the preflight identity and multiplied per-branch git spawns, while the tree conservation
needs was already read.

### Boundary fit, Class, and proportionality

- **`assess-boundary-fit`: stays one WU + delivery-plan candidate.** The three arms share the transform's execute
  and preflight surface and one refusal contract; the conservation refusal is the first consumer of the remedy
  shape. The cohort consolidated them into one member deliberately, resolving refusal-text duplication between the
  former members. The delivery candidate is unbound: D1 with the conservation floor first, D2's inventory second,
  D3 third. No material new evidence arrived at spec time; the outcome stands.
- **`classify-work-unit`: `Heavy`, confirmed.** Derivation fires on the conservation policy and the external-edge
  semantics; scale fires on the refusal surface. Nothing is invented; every mechanism composes existing primitives.
- **`assess-design-proportionality`: `proportionate` after task-generation review.** Every surviving mechanism traces:
  the floor
  to the data-loss consequence; companion inventory to the same invariant by composition of the existing scanner
  and dispositions; the H2-only selection to an existing scanner mode; the notes scaffold to the existing task
  scaffold and the presence guarantee target resolution needs; the role-closed destination test to the locus-less
  refusal class and the meta's record-not-content status; the source-kind scan and decode rule to the extraction
  spec's invariant, chosen over a declared tag and a starter prefill; the completed-slug set to a tree already
  read, under the pinned-ref contract the cohort forbids weakening; external edges to the exact transform-delta
  constraint; the remedy contract to the missing-remedy defect by composition of an existing schema; and the
  evidence admission rule to bounding an additive field to refusals whose sides an operator can act on. Two more
  elaborate corrections were rejected at task-generation close: a transient source-race observation does not widen
  the shared recovery interface solely to populate diagnostics, and a recipient changed after candidate creation
  refuses as version drift instead of adding historical dependency replay. Rigor concentrates on the deletion and
  authoritative-write paths; retryable diagnostics use their existing locus when extra plumbing would not change the
  corrective action.

## Alternatives & Rationale

### Explicit disposal in the transition record

Rejected. The record's field-admission test rejects it: a disposal attestation would be consumed at execute time as
authorization, and the record is defined as history. Its intent survives as the drop disposition under companion
inventory, where authored decisions already live.

### Post-authoring byte proof

Not proposed. Authenticating each allocated unit at its destination after the operator authors it, the way
extraction's finish does, was considered. Scaffolds copy the selected design family and targeted tasks/notes;
other admitted companions, including a co-present draft, require the operator to transfer their allocated content
from the pinned source into an admissible destination. The distribution interlock reviews that responsibility;
allocation alone does not prove the bytes arrived. Under today's tracked-tier implementation, the destructive
step and authored members land in one reviewed commit, and Git history retains the source. Those safeguards are
specific to this storage binding, not a promise of code-repository history or single-commit atomicity across future
stores. No concrete failure of hand distribution has been observed. The accepted residual does not add generalized
scaffolding or post-authoring byte proof; revisit on evidence or when the storage binding changes.

### Prefill `retained-origin` in the starter map for the extraction-only source kind

Declined. Starter maps are author-slot only by contract, so this widens the starter schema, amends the core spec's
success criteria, and writes a decision into the human's half of the map. Its use case also evaporates: under an
Active origin there are no companion slots to fill, and the remaining started-Planning case is a few typed lines the
decode rule already guards. Revisit if a second consumer wants CLI-suggested dispositions.

### A starter-map tag marking retirement-only units

Declined. Declared per-unit state that duplicates what artifact role already says, against the derive-not-declare
rule.

### Shape as a preflight input

Recorded as direction, not built. A shape-specific starter map would keep companions out of extraction's sight
entirely. It reopens the core's split between the fixed machine envelope and the authored shape — a core contract
change outside hardening — and buys nothing over the two source-kind rules until a second consumer wants
shape-aware preflight.

### Scan a closed companion list (`tasks-`, `notes-`) instead of the inventory

Declined. The inventory matcher admits any valid `<prefix>-<origin>.md` in the resolved group, including a
mid-create-spec `draft-*` beside a spec or an unusually named supporting companion. Supplemental research and analysis
documents normally live outside that group and need no special family treatment. Under a closed list matching
companions outside the list would be inventoried,
never scanned, and refused by the floor forever, so the floor would never become the invariant assertion the design
promises. The open reading follows the boundary statement — the artifact group — and keys the decode rule on
"not a design artifact" rather than on two names.

### Per-task units for task lists

Declined. No scanner change, but dozens of allocations for an ordinary list, against the author-slot-exactness
contract that makes every allocation a hand-filled decision.

### Transform-owned placement (the locator half)

Retired. The drafted gap assumed the transform places conserved content and that a fresh scaffold offers nowhere
to place it. Neither holds: the scaffold is the origin's artifact retitled, and placement is the operator's
hand-authoring step. A locator encoding new destination structure would record intent the transform never acts on.
Re-chartering the half as transform-owned placement is a new mechanism over operator-owned distribution and a
scope change under the hardening-admission boundary, admissible only by design amendment.

### Refuse a shipped external-edge target; widen the preflight pathspec

Both withdrawn, as recorded in D3.

### Thread remedies through every pure result type

Rejected. An order of magnitude more surface for no consumer; the spine's own pattern composes at the boundary
from stable codes.

### Evidence on every refusal

Rejected. Internal-consistency refusals compare two derivations of the same input; their sides are not facts an
operator can act on, and threading them would double the refusal surface for no remedy gain.

## Cross-cutting Considerations

- **Safety.** The floor is fail-closed and lands before inventory; inventory admits content to the proof rather
  than relaxing it. Extraction bytes are held unchanged by construction: an Active origin has no companion source
  units, and a started-Planning origin's companion units cannot leave `retained-origin` under the extraction
  shape. No refusal becomes advisory; remedies and evidence are additive.
- **Compatibility.** Pre-release posture: `remedy` changes type without alias, `--preflight`'s refusal status
  literal converges, and the starter/completed map schema gains `externalEdges` and widens `sourceUnits`. A map
  authored before inventory or the H2-only mode ships is reauthored against a fresh preflight after the upgrade —
  unit identities change under the widened scan, and a task-list target locator naming a task heading no longer
  resolves. A map and its `--advance-base` run on one CLI version. Two completed specs receive forward amendments
  recorded in this spec, never edits: `spec-decompose-transform-integrity.md` § D2 (preflight stdout on refusal)
  and `spec-decompose-extraction.md` § Additive result leg (task-list source-unit invariant narrows to Active
  origins).
- **Hardening admission** (restated from `cohort-decompose-transform-integrity.md`): a finding against this member
  blocks only on a violated goal or invariant, a concrete failure reachable in a supported lifecycle, a violated
  existing authority contract, or loss, corruption, or unsafe ambiguity of in-scope planning content. A proposal
  adding a durable record, identity, ledger, state machine, recovery branch, or new authority is a scope change
  routed through design amendment, never a silently promoted fix.
- **Size posture (spec-close recalibration).** Medium–Large, unchanged from the draft. Against the draft the
  surface gained the role-closed destination test, the two scaffold-refusal loci, and the evidence admission rule
  with its enumerated set, and it shed nothing. `Class` stays `Heavy`. Recalibrate again at task-generation close.
- **Testing.** Unit: the source-kind-keyed scan (three kinds × companion presence), including an invalid-UTF-8
  companion's path-bearing `source-scan` refusal, the H2-only selection for `tasks-*` including setext-H2 and
  header-preamble cases, the notes scaffold and its missing, invalid-encoding, and title-line refusals with loci,
  the role-closed destination test, the floor over inventory minus scanned (observable refusal before inventory,
  invariant assertion after), the decode rule under both shapes, external-edge resolution against
  result-base live and completed sets with the redundant and unknown refusals, the remedy mapping's
  source-enumerated exhaustiveness and composed-code coverage, arbitrary caught Git/read error normalization,
  the envelope schema per mode, evidence presence at every admitted comparison site and absence on excluded ones
  (including both `topology-claim` variants), the locus-only transient preimage race, the core-only all-mode
  `unexpected-error` arm, and the notes scaffold's `provisional-notes` report entry.
  Integration: repository-plan composition with a notes companion targeted at a member, an external edge landing in
  a scaffolded member meta and rendering through the ROADMAP seam, source/result-base dependency divergence that
  preserves unrelated pinned-base targets while rebasing the authored delta, and `--advance-base` recomposing with a
  target that shipped between execute and advance. A later change to the recipient's dependency prestate instead
  refuses advancement before mutation. Also cover a target added to the result base after the origin fork,
  and a valid nonstandard companion relocated from backlog to active: its predecessor retires without a rider,
  while an unrelated file remains subject to the rider guard. Extraction finish covers byte-only and mode-only
  companion drift through both authority-selection arms. E2E: each mode's refusal path emits one envelope on stdout
  with exit 1, including a caught arbitrary preflight read failure.
  Per the cohort's soft coordination, a rehearsal on a copy of a real origin carrying a notes companion is the
  evidence floor.
- **Workflow and doctrine surfaces — the agent's only carrier.** Starter maps are author-slot only, so the map
  cannot explain its own slots; `decompose-work-unit.md` (package source and `.arc/` copy) is where an agent learns
  the authoring semantics without a schema source dive. Its map-authoring step gains the new slots with their
  closed values and when to use each: inventoried companion units (including task-list phases and notes sections)
  allocate like design units under retirement and accept only `retained-origin` under extraction; `externalEdges`
  carries a dependency from a member or existing home to a work unit outside the cut; an edge to a declared destination
  belongs in `internalEdges` or an outgoing disposition instead. Its author-the-result step names `provisional-task` and
  `provisional-notes` entries as whole retitled copies of the origin's companions to prune before the distribution
  interlock; allocated content from other companions must be transferred from the reported source to an admissible
  destination during that authoring step. Its refusal rule surfaces status, remedy, evidence, and any optional report.
  Each delivery member updates both workflow copies before its member-scope validation: the refusal envelope lands
  with the refusal member, companion authoring and retention with the companion member, and external-edge guidance
  with the external-edge member. The last member proves cumulative parity rather than supplying earlier members'
  missing operator contract.
  `assess-boundary-fit.md` and `strategy-work-organization.md` are unchanged, since neither carries the task-list
  invariant. Package-project sync applies to every methodology edit.
- **Storage evolution self-check.** Against Principles 1–3, 5–6, and 8–9 of
  `strategy-storage-evolution.md`: logical artifact membership and dependency facts are independent of a code
  repository, branch, or tracked Markdown projection. Naming, directory discovery, completed-meta filename reads,
  and pinned Git trees remain inside the current storage binding; pure validation consumes resolved inventories
  and eligibility sets, and workflow prose consumes CLI results. Dependency writes use the existing record mutator
  and rebase an exact validated add/remove delta onto the pinned result-base record, so unrelated current targets are
  preserved and an already-satisfied delta refuses rather than overwriting stale state. A future materialized store
  must supply complete group membership,
  authoritative dependency eligibility, and version-checked mutations across its placements; this WU neither
  implements that adapter nor treats code-repository absence as logical absence outside the tracked tier. The
  one-commit/history rationale above requires reassessment at that migration. No new storage flag, branch-derived
  identity, service requirement, or cross-store atomicity promise is introduced.
- **Procedure and knowledge evolution self-check.** Deterministic discovery, normalization, and remedy composition
  stay in the CLI; schemas own result structure, and workflow prose supplies authoring judgment and displays the
  emitted evidence and remedies. This follows `strategy-procedure-evolution.md` Principles 1, 3, 4, and 6 and
  `strategy-knowledge-evolution.md` Principles 1 and 7: place the conservation guard at the destructive operation
  and command guidance in its result, with no new catalog or always-loaded surface.
- **PM composition self-check.** Under the current standalone binding, ARC's dependency record is authoritative;
  the cut map is authored transition input and ROADMAP is a derived view, not a second mutable authority. External
  edges mean WUs outside the cut, not external tracker identities. The dependency enables execution ordering and
  uses the existing mutator without a provider, import, or sync mechanism. Future field-authority decisions remain
  with `external-pm-composition`; eligibility inputs preserve that seam rather than assigning tracker authority.
  No provider failures or new integration ceremony arise here; stale inputs still refuse through existing checks.

## Success Criteria

- Before inventory ships, a retirement whose origin carries a nonempty companion outside the scanned set refuses at
  `--execute` and `--advance-base` with `uncovered-retirement-content`, naming the path and a re-preflight argv;
  after, the same check stands as an invariant assertion with a test.
- Under companion inventory, every unit of every inventoried Markdown companion of a started-Planning or
  backlog-stub origin — task-list phases, notes sections, and any other `<prefix>-<origin>.md` member other than
  the meta — appears in the starter map and must be allocated or dropped before execute accepts the map; a notes
  unit targeted at a member lands in a scaffolded provisional notes artifact.
- A non-UTF-8 inventoried Markdown companion refuses preflight as `source-scan` with the source path and conversion
  remedy before a starter map exists; `scaffold-title-missing` is reserved for a valid UTF-8 scaffold source without
  a title line.
- An Active origin's starter map lists no companion units. Under a started-Planning origin taking the extraction
  shape, a companion unit carrying any disposition other than `retained-origin` is the typed decode issue
  `companion-disposition`, and finish leaves companion bytes unchanged. Finish rejects path, object, mode, or byte
  drift in a companion before accepting refreshed or fallback authority while retaining exact partial prior thinning.
- A notes companion without a title line refuses `scaffold-title-missing` at plan time with the member and path as
  locus and a remedy naming the fix; a notes target with no origin notes companion refuses
  `scaffold-source-missing`; an unscanned Active-origin scaffold source with invalid UTF-8 refuses
  `scaffold-source-invalid-encoding`; every split scaffold and projection code carries member and path, and
  `profile-scaffold-failed` and `target-projection-failed` no longer exist.
- A target at `meta-<member>.md` refuses at conservation as `incompatible-allocation-locator`.
- A completed map can declare an external dependency edge; the scaffolded member meta or existing-home meta carries
  it in `Depends On`, and the staged ROADMAP renders it through the existing seam while it is unsatisfied. A `to`
  found in neither the live list nor the completed set refuses `unknown-external-target`; a completed target is
  admitted as a landed edge and survives a target shipping between execute and advance-base; a `to` that is a
  declared destination refuses `redundant-external-edge`. An existing-home write applies only its validated edge
  delta to the pinned result-base target list, preserving unrelated source/result-base divergence and refusing an
  already-satisfied edge state as `unchanged-dependency-slot`. Internal edges accept every dependency-capable declared
  destination endpoint admitted by the decoder.
- Every refusal from all six modes carries a `SpineRemedy` with an invariant, verbatim text, and an argv; no
  decompose result carries a string remedy; no refusal code literal enumerated from source resolves to the generic
  fallback remedy.
- A notes scaffold appears in the result report as a `provisional-notes` destination entry.
- Both copies of `decompose-work-unit.md` name companion units, the extraction decode rule, `externalEdges`, the
  provisional scaffold entries to prune, and the status-remedy-evidence surfacing rule; an agent runs the lifecycle
  from the workflow and the emitted results without reading schema or module source.
- A refusing invocation of any mode emits exactly one typed envelope on stdout and exits nonzero, including an
  error thrown inside the mode; `--preflight`'s success stdout remains the starter map alone; an `--advance-base`
  refusal carries the composing plan refusal's locus. A handler-caught `unexpected-error` uses the core-only arm and
  never invents execute/extract stage, recovery, or report fields.
- Every code in D1's evidence set carries `expected` and `actual`; every code outside it carries no `evidence`
  field. Initial finish preimage and apply-authority comparisons carry evidence from their owning boundary;
  `source-preimage-raced` remains locus-only.
- Extraction finish accepts a composed recipient carrying both an incoming disposition and an external edge, using
  the plan's complete dependency mutation rather than re-deriving a partial expected list.
- Base advancement accepts target lifecycle changes, but a post-candidate change to a dependency-bearing recipient
  refuses `dependency-recipient-drift` with evidence before mutation and without historical full-tree recomposition.
- The preflight snapshot's pathspec and per-branch spawn count are unchanged, and the `preflightId` preimage keeps its
  closed field set; only the widened `sourceUnits` values change under it.
- `spec-decompose-transform-integrity.md`, `spec-decompose-extraction.md`, and the transition-record schema are
  unedited; the two forward amendments are recorded in this spec alone.

**Amended 2026-09-07 — task-generation corrections and forward-compatibility clarifications:**

- Companion coverage includes every valid artifact admitted by the current group matcher, with its paired-spec
  exception, in both source and predecessor discovery. A nonstandard companion relocated from backlog to active
  retires without a false rider; unrelated supplemental documents remain outside the group.
- External-target eligibility comes from the pinned result-base live and completed sets, with the authenticated
  surviving-origin exception under extraction. A live target added after the source fork is admitted without
  widening source-bound conservation facts or the preflight snapshot.
- Known preflight failures retain stable codes; arbitrary caught failures emit `unexpected-error` with separate
  detail and the invoked mode's retry remedy. Source-literal enumeration is supplemented by composed-code and
  injected-runtime-error checks.
- The evidence criterion above applies to D1's admitted comparison sites. `topology-claim` comparisons carry the
  expected and observed topology; its missing, undecodable, or malformed-only branches carry locus alone.
- Workflow authoring guidance covers manual transfer of allocated companions that no scaffold copies. Discovery
  and Git-history safeguards remain explicit current-storage bindings, without new storage or provider machinery.
- `strategy-procedure-evolution.md` Principle 5 cannot be exercised because its owner, `workflow-eval-harness`, is
  unstarted. Workflow-contract and E2E tests prove required instruction presence, package/project parity, and typed
  command behavior; they do not prove stochastic agent behavior. This work unit adds no substitute eval or claim
  that the unavailable gate ran; the eventual harness owns backfilling that coverage.
- Operation-returned execute and extract refusal envelopes preserve their existing optional `report` in addition to
  `stage` and `recovery`. Plan-owned runtime schemas for the existing mutation and contributor shapes compose the
  exported `V3PathStateSchema`; their TypeScript types and a strict report schema in
  `decompose-v3-result-report.ts` derive from that one authority. The command boundary never drops a report produced
  after materialization, and workflow refusal handling surfaces it unchanged when present. A handler-caught
  `unexpected-error` instead uses the strict core-only arm because no operation stage, recovery, or report exists.
- `GitDecomposeTransitionBaseAdvancementResult` remains an operation result with stable `reason` plus optional
  `locus` and `evidence`. The command-boundary mapper in `handleDecompose()` adds `SpineRemedy` from the selected
  mode's origin and exact cut-map path. This supersedes the earlier sentence requiring remedy on the operation result
  itself and keeps invocation-only context out of advancement authority.
- Runtime diagnostics never become reason codes. Transition-record, rollback/restoration, and advancement-apply
  failures use stable codes with variable detail in `locus`; the source-totality test rejects unapproved nonliteral
  outward reason producers. After mode selection, one handler exception boundary converts a thrown failure from any
  of the six modes to core-only `unexpected-error` with that mode's exact retry argv.
- The Phase 1 floor proof includes base-advancement recomposition while the refusal is still reachable: an uncovered
  companion produces the nested conservation refusal, exact path, and re-preflight remedy before candidate or base
  mutation.
- Extraction finish distinguishes authored source drift from prior thinning before it accepts either refreshed or
  fallback authority. Every companion must remain at its identical planned before/after path, object, mode, and byte
  state. Fallback to the original map is allowed only when every changed non-companion source artifact is exactly a
  planned before/after state, including a valid subset of already-applied thinning. A new, moved, removed, renamed,
  mode-changed, or byte-changed companion returns the existing `source:source-units` reauthoring refusal; unrelated
  non-group changes remain admissible.
- External-edge validation rejects the retiring origin as `retiring-origin-target` at the authored `to` locus while
  preserving the authenticated origin as eligible under extraction. Declared-destination redundancy is checked before
  self-edge classification, so an external `{ from, to: from }` refuses as `redundant-external-edge`; no second
  external self-dependency code is introduced.
- Production coverage carries an extraction edge to the surviving origin through extract, landing, finish preview,
  apply, and repeat. Adapter-level call assertions also hold completed-target discovery to the three existing full-tree
  roles per repository-plan composition and the same single recomposition during base advancement, with no completed
  pathspec query or per-target object read.
- Invalid UTF-8 Markdown is a source-scan failure before map authoring, with the source path and conversion remedy;
  title-specific scaffold refusal begins only after a valid UTF-8 source can reach repository planning. An Active
  companion skipped by scanning but later selected as a target-driven scaffold source instead refuses
  `scaffold-source-invalid-encoding` at repository planning.
- Completed-target eligibility in `completed-index.ts` delegates semantic recognition to
  `identifyWorkUnitArtifactPath()`. Existing loose archive evidence readers keep their compatibility behavior and do
  not become a second exact layout authority.
- Dependency contributors apply their validated edge deltas to the pinned result-base recipient sequence, preserving
  unrelated target changes and refusing an already-satisfied edge state. Source-bound conservation facts remain
  unchanged.
- Package and project workflow guidance lands cumulatively with the delivery member that introduces each public
  behavior, so every member-scope validation sees a complete operator contract for its reachable tree.
- Finish evidence is produced where bounded operands already coexist: initial index/worktree preimages and apply
  authority carry expected/actual facts, while the transient verification race remains locus-only and does not widen
  `V3PartialRecoveryIO`.
- Conservation admits internal edges across the decoder's complete dependency-capable destination set. Extraction
  finish trusts the complete plan mutation for a dependency-touched incoming recipient and uses its incoming-only
  proof only for untouched recipients.
- Base advancement treats a later dependency-recipient change as explicit version drift with evidence and cleanup
  guidance. It preserves the single current recomposition instead of introducing historical dependency replay.

## Open Questions

[none]
