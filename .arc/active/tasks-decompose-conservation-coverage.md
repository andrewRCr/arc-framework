# Task List: Decompose Conservation Coverage

- **Design:** `spec-decompose-conservation-coverage.md`

---

<!-- arc:delivery-plan:start -->
## Delivery Plan

- **Plan Revision:** `1`
- **Plan Digest:** `sha256:af3901b958bdb423c2219ded539208cea2ce1713e187cc379bb6bfb36d7685aa`
- **Projection:** `wu-integration-target`

### Members

| #   | Member                                | Chunk key                       |
| --- | ------------------------------------- | ------------------------------- |
| 1   | Refusal contract and retirement floor | `refusal-contract-and-floor`    |
| 2   | Complete companion conservation       | `companion-conservation`        |
| 3   | External dependency authoring         | `external-dependency-authoring` |

#### Member coverage

| #   | Tasks                                    | Design elements              |
| --- | ---------------------------------------- | ---------------------------- |
| 1   | `1.1`, `1.2`, `1.3`, `1.4`, `1.5`, `1.6` | `rfc:D1`, `rfc:D2`           |
| 2   | `2.1`, `2.2`, `2.3`, `2.4`, `2.5`, `2.6` | `rfc:D2`                     |
| 3   | `3.1`, `3.2`, `3.3`, `3.4`, `3.5`, `3.6` | `rfc:D1`, `rfc:D2`, `rfc:D3` |

### Named seams

| #   | Seam                                         | Members | Owner | Design elements              |
| --- | -------------------------------------------- | ------- | ----- | ---------------------------- |
| 1   | Machine-envelope identity                    | 2, 3    | 3     | `rfc:D2`, `rfc:D3`           |
| 2   | Package and project workflow synchronization | 1, 2, 3 | 3     | `rfc:D1`, `rfc:D2`, `rfc:D3` |
| 3   | Refusal-code totality                        | 1, 2, 3 | 3     | `rfc:D1`, `rfc:D2`, `rfc:D3` |
| 4   | Extraction byte preservation                 | 1, 2, 3 | 3     | `rfc:D1`, `rfc:D2`, `rfc:D3` |
| 5   | Exact transform delta                        | 1, 2, 3 | 3     | `rfc:D2`, `rfc:D3`           |

#### Acceptance

- **1. Machine-envelope identity:** Companion inventory and external-edge authoring preserve the closed machine field
  set and preflight identity contract while intended source-unit values change deterministically.

- **2. Package and project workflow synchronization:** Each member closes with matching package and project workflow
  guidance, and the final pair carries the cumulative refusal, companion, and external-edge contract.

- **3. Refusal-code totality:** Every code introduced by companion or external-edge work lands with a specific remedy
  and remains covered by the all-mode typed envelope.

- **4. Extraction byte preservation:** Finish evidence, retained companion handling, and dependency proof compose while
  every supported extraction leaves companion bytes unchanged.

- **5. Exact transform delta:** The retirement floor, complete companion mutations, and dependency deltas compose
  without admitting an unplanned repository change.
<!-- arc:delivery-plan:end -->

## **Phase 1:** Typed refusals and the retirement safety floor

**Delivery member:** 1 — `refusal-contract-and-floor`

_Purpose:_ Give every decompose refusal one machine-readable contract and stop retirement before any origin content
can be deleted outside the conservation proof.

_Design decisions:_ Begin with one complete `uncovered-retirement-content` refusal from conservation through the
public command boundary. Extend that proven path by command family; source-wide exhaustiveness closes the member
only after every mode has executable coverage.

### `[x]` **1.1 Refuse uncovered retirement content end to end through the typed envelope**

- _Goal:_ A retirement that would delete unproved companion content fails before mutation and returns the same
  strict, actionable refusal shape the complete command family will use.

    - `[x]` **1.1.a Define the shared refusal envelope and first remedy mapping**
        - Added the strict core refusal and evidence schemas, canonical JSON evidence projections, all six structured
          decompose argv builders, and command-boundary mappings for uncovered retirement content and the sole generic
          `unexpected-error` retry; focused coverage rejects malformed fields, runtime containers, and unnamed
          fallback codes.

    - `[x]` **1.1.b Enforce the uncovered-content floor from the pinned source inventory**
        - Added a retirement-only conservation assertion over pinned artifact bytes that excludes the origin meta,
          accepts byte-empty or source-unit-covered companions, and refuses the first UTF-8-ordered uncovered path
          before retirement-delta planning without changing allocation, dependency, or delta authority.

    - `[x]` **1.1.c Carry the floor through execute and the public handler**
        - Threaded the typed uncovered-content refusal through retirement execution and a strict decompose-specific
          emitter, preserving operation facts while emitting canonical JSON plus verbatim remedy guidance and leaving
          candidate claims, branches, the index, and the worktree unchanged; staged success output remains unchanged.

- _Outcome:_ Retirement now refuses the first unproved nonempty companion before delta planning or mutation, carries
  its exact locus and fold-or-drop preflight remedy through the operation boundary, and exposes the shared strict
  envelope at the public handler seam.

### `[x]` **1.2 Extend specific remedies across preflight, execute, and extraction**

- _Goal:_ Preflight, retirement execute, and extraction expose one specific corrective command for every known
  refusal without pushing remedy text into pure validation modules.

    - `[x]` **1.2.a Stabilize Git-preflight refusals and normalize runtime failures**
        - Stabilized known Git source-condition codes, normalized unclassified failures to `unexpected-error`, and
          added exact scan loci plus bounded evidence and specific preflight remedies across binding and refresh.

    - `[x]` **1.2.b Carry evidence through conservation and repository planning**
        - Added bounded source, ref-tip, dependency-set, stale-dependent, and machine-binding evidence through
          conservation and repository-plan prefixes while retaining locus-only one-sided and internal failures.

    - `[x]` **1.2.c Carry evidence through execution-preflight comparison**
        - Added authenticated-versus-map origin evidence and preserved source-resolution and binding evidence through
          execute/extract operation results while malformed or unreadable maps remain locus-only.

    - `[x]` **1.2.d Carry evidence through materialization and plan prestates**
        - Added planned-versus-observed final-blob facts and the first differing normalized base prestates while
          missing blobs, unsupported states, and contributor discontinuities remain locus-only.

    - `[x]` **1.2.e Carry evidence through retirement-delta comparisons**
        - Added bounded earlier-versus-later tree-state evidence for object/mode and predecessor changes, forwarded it
          through retirement repository-plan refusals, and preserved exact loci, locus-only structural failures,
          rider classification, and refusal order.

    - `[x]` **1.2.f Split generic projection refusals by correctable cause**
        - Replaced both generic projection failures with seven member/path-bearing codes, including distinct Active
          scaffold encoding and title failures, and mapped each to a locus-specific preflight or invoked-mode remedy.

    - `[x]` **1.2.g Map retirement and extraction operation refusals at their command boundaries**
        - Replaced execute/extract string recovery paths with strict mode-specific refusal unions, typed recovery and
          report schemas, plan-owned mutation/contributor schemas, operation evidence, and stable diagnostic codes
          whose runtime detail remains in `locus`.

    - `[x]` **1.2.h Render corrective commands as argv and verbatim guidance**
        - Kept all six structured invocation builders as the operand authority, verified shell-safe display rendering,
          mapped stable repository and operation causes to exact preflight, invoked-mode, publication, or candidate
          cleanup argv, and removed the unactionable textual recovery fallback.

- _Outcome:_ Preflight, retirement execute, and extraction now preserve actionable comparison and recovery facts while
  every covered refusal boundary returns a strict `SpineRemedy` composed from opaque argv operands.

### `[x]` **1.3 Carry comparison evidence and remedies through finish preview and apply**

- _Goal:_ Finish preview and apply identify the exact recorded-versus-live difference and return the correction
  through the same refusal envelope before any unauthorized thinning survives.

    - `[x]` **1.3.a Compose finish results from the shared refusal contract**
        - Extended finish results from the strict core refusal schema, wrapped pure proof and thinning failures with
          the selected preview/apply remedy, rejected reason-only and malformed evidence shapes, and preserved all
          three canonical success arms plus existing apply-authority validation.

    - `[x]` **1.3.b Attach evidence at source preimage and apply comparisons**
        - Added source-preimage byte lengths, normalized planned before/after and observed index/worktree states into
          digest-and-length evidence, and carried expected-versus-supplied apply authority through the strict result.
          Transient races and one-sided failures remain evidence-free, with exact race and restoration-residue loci.

    - `[x]` **1.3.c Attach evidence across thinning and committed-destination comparisons**
        - Projected source and destination object, mode, byte, unit, metadata, dependency, ROADMAP, ref, and race
          comparisons into bounded expected/actual evidence and threaded existing plan/preflight evidence outward.
          Topology identity, parent, and complete fan-out comparisons carry evidence; missing, undecodable, and
          malformed-only observations retain the first stable code and locus without fabricated sides.

    - `[x]` **1.3.d Emit finish preview and apply refusals through `handleDecompose()`**
        - Routed finish preview and apply through the strict decompose emitter with their exact retry argv, kept
          pre-mode operand and project failures outside stdout, and normalized in-mode throws to `unexpected-error`
          with the original detail in `locus`.

- _Outcome:_ Finish now preserves strict remedy and evidence identity from proof and source comparison through
  preview, apply, recovery, and public emission without exposing raw bytes or inventing one-sided evidence.

### `[x]` **1.4 Carry plan refusals and differing evidence through base advancement**

- _Goal:_ Base advancement preserves the evidence and correction produced by its failing comparison or composing
  plan instead of flattening the refusal into an opaque reason string.

    - `[x]` **1.4.a Widen advancement refusals without changing success authority**
        - Widened advancement refusals with optional locus and evidence, preserved composed-plan comparison facts,
          stabilized changed-path and path-state mismatch codes with bounded expected/actual evidence, and proved
          candidate and base binding failures remain ahead of merge mutation while success arms stay unchanged.

    - `[x]` **1.4.b Attach evidence to candidate, marker, transition, and base comparisons**
        - Added exact loci and bounded expected/actual facts for occupation, registration, marker, transition-record,
          descendant-base, binding-race, and canonically ordered dependency comparisons; threaded them through
          composed mismatch prefixes, stabilized apply-plan diagnostics, and preserved exact candidate restoration.

    - `[x]` **1.4.c Emit the actionable advancement refusal at the public boundary**
        - Routed advance-base refusals through the strict emitter with invocation-owned retry, preflight, or candidate
          cleanup remedies; exercised a committed candidate against newly uncovered source content without mutation,
          and preserved the exact `advanced` and `unchanged` success output.

- _Outcome:_ Base advancement now carries the failing plan or live comparison's stable code, exact locus, and bounded
  evidence through candidate restoration and public emission, while the command boundary alone selects the actionable
  correction.

### `[ ]` **1.5 Prove source-wide remedy totality and all six command boundaries**

- _Goal:_ The refusal contract cannot silently regress when a new code or prefix path is added, and every public mode
  demonstrates the same failure behavior against a real repository.

- **Additional Context:** `strategy-workflow-authoring.md` §§ Prose economy, Verbs over mechanics

    - `[x]` **1.5.a Enumerate stable refusal-code literals from the production source**
        - Added an AST source-totality contract over v3 decomposition modules that inventories typed and emitted codes,
          rejects unmapped or generic remedies, and permits only audited stable nonliteral reason producers.
        - Registered specific plan-composition remedies and replaced thinning's generic map reasons with stable composed
          codes, while keeping `unexpected-error` as the sole excluded runtime arm.

    - `[x]` **1.5.b Prove composed-prefix selection and evidence admission exhaustively**
        - Added a registry matrix across all stable prefix families and made candidate-cleanup remedies preserve the
          innermost mismatch invariant while retaining exact teardown correction.
        - Expanded scalar binding coverage across all source/result ref fields; the composed evidence suites exercise
          every admitted comparison family, representative exclusions, and both `topology-claim` variants.

    - `[ ]` **1.5.c Exercise all six refusing invocations in a real repository**
        - Extend `decompose-command-modes.e2e.test.ts` across preflight, execute, extract, finish preview, finish apply,
          and base advancement.
        - Assert one parseable stdout envelope, exact stderr reason/remedy text, exit `1`, and unchanged repository
          state for each refusal; inject one arbitrary preflight read failure to prove normalization.
        - Parametrize the public handler over all six selected modes with an injected in-mode exception and assert
          core-only `unexpected-error`, detail only in `locus`, that mode's exact retry argv, and no invented
          execute/extract stage, recovery, or report.

    - `[ ]` **1.5.d Publish the all-mode refusal contract before member close**
        - Update the package-source `decompose-work-unit.md` once with the all-mode stdout envelope and the rule to
          surface status, remedy, evidence, and any optional report unchanged; replace the obsolete no-partial-map
          preflight wording without adding CLI-computable dispatch to prose.
        - Apply the same targeted edit to the project-instance workflow and extend
          `decompose-workflow-contract.test.ts` to prove required instruction presence and package/project parity.
        - Preserve bare `arc ...` commands in both shipped surfaces.

    - `[ ]` **1.5.e Run the Phase 1 code-quality checkpoint**
        - Run targeted TypeScript lint and unit/integration/E2E filters throughout the task, then run both source and
          test type checks plus focused workflow-contract coverage over the composed member.
        - Record any failure against the behavior path it invalidates; a primitive-only or code/workflow-divergent
          green result does not close this phase.

### `[ ]` **1.6 Close refusal-contract delivery** — validate criteria at member scope

- _Goal:_ Member 1 has independently reviewable evidence that its public refusal path is complete and that retirement
  cannot cross the uncovered-content floor.

    - Run the `validate-criteria.md` member-scope walk for `refusal-contract-and-floor` and record the boundary
      evidence without changing Success Criteria markers.

## **Phase 2:** Complete companion conservation

**Delivery member:** 2 — `companion-conservation`

_Purpose:_ Bring every retiring Markdown companion inside the proof, give its units valid authoring destinations,
and preserve extraction's source bytes by source kind.

_Design decisions:_ Land one generic companion through source discovery and retirement before specializing task-list,
notes, and extraction behavior. Every specialization reaches a command plan, result report, or finish boundary; no
scanner or schema primitive closes a lifecycle obligation by itself.

### `[ ]` **2.1 Retire a generic companion through complete source and predecessor discovery**

- _Goal:_ Any valid Markdown artifact belonging to the origin is selected from both pinned trees and reaches the
  retirement proof without making unrelated supporting documents part of the work unit.

    - `[ ]` **2.1.a Use one open artifact-family rule for source and predecessor reads**
        - Preserve the existing `artifactMatcher(origin)` plus paired-spec source discovery in
          `git-decompose-v3-preflight.ts`, replace the predecessor's closed prefix list in
          `decompose-v3-repository-plan.ts`, and exclude exact `cohort-<origin>.md` basenames at both local call sites.
        - Build `test-first` (one behavior at a time):
            - Admit ordinary and nonstandard `<prefix>-<origin>.md` companions in the resolved origin directory.
            - Admit both paired-spec names without accepting a same-name cohort document, unrelated slugs, or
              supporting files in other locations.
            - Return the same UTF-8 path order from source and predecessor discovery.
            - Pin the source seam in `__tests__/unit/work-unit/git-decompose-v3-preflight.test.ts` and the predecessor
              seam in `__tests__/unit/work-unit/decompose-v3-repository-plan.test.ts`.

    - `[ ]` **2.1.b Scan a generic companion into the started source preflight**
        - Pass the resolved source kind and exact source-meta path into the private `sourceUnits()` path in
          `decompose-v3-preflight.ts`, make this leaf the single owner of scan eligibility, and retire the test-only
          `deriveV3DecomposeSourceFacts()` export.
        - Build `test-first` (one behavior at a time):
            - Include generic companions for `started-planning` and `backlog-stub`, restrict `active-origin` to the
              profile's design artifacts, and exclude the exact meta under every source kind.
            - Reject a non-UTF-8 Markdown companion under `started-planning` or `backlog-stub` as `source-scan` with
              its exact source path before starter-map authoring; never synthesize a member or target locus for that
              failure. Keep Active companions outside the scan.
            - Preserve its source path, locator, content digest, canonical ordering, and `preflightId` participation.
            - Keep production consumers routed through `createV3DecomposePreflight()` and move focused coverage into
              `__tests__/unit/work-unit/decompose-v3-preflight.test.ts`.

    - `[ ]` **2.1.c Carry the same family through predecessor retirement planning**
        - Feed the complete predecessor group to `planV3RetirementDelta()` while preserving its three-tree version
          checks and unrelated-file rider classification.
        - Build `test-first` (one behavior at a time):
            - Retire an unchanged companion and accept a valid backlog-to-active relocation without a false rider.
            - Refuse a changed predecessor companion at its exact path.
            - Keep an unrelated source-private file visible as a rider rather than absorbing it into the group.

### `[ ]` **2.2 Allocate task-list phases through preflight and retirement**

- _Goal:_ A retiring task list contributes a small, complete set of phase-level units that can be authored and
  conserved through the same paths as design content.

    - `[ ]` **2.2.a Add task-list phase boundaries to the shared content scanner**
        - Select the existing H2-only `markdownBoundaries()` mode inside `scanV3DecomposeContent()` for `tasks-*`
          basenames; leave ordinary Markdown on H2-H6 boundaries.
        - Build `test-first` (one behavior at a time):
            - Emit one header preamble and one unit per ATX or Setext H2 phase, with level `2` and empty ancestry.
            - Keep H3 task headings inside their phase bytes and preserve BOM, CRLF, fences, and repeated headings.
            - Prove byte-exact reconstruction and unchanged locator resolution for non-task Markdown in
              `__tests__/unit/work-unit/decompose-content.test.ts`.

    - `[ ]` **2.2.b Bind phase units into preflight and completed-map authoring**
        - Extend preflight and schema fixtures so a task-list inventory yields canonically ordered source units and
          exact author slots without changing the machine field set or identity formula; the machine bytes and
          `preflightId` update deterministically with the added units.
        - Build `test-first` (one behavior at a time):
            - Include phase and preamble identities for started-Planning and backlog retirement profiles.
            - Reject omitted, duplicated, reordered, or tampered phase allocations through the existing identity
              checks.
            - Keep a task list under a draft profile admissible as companion content rather than design authority.

    - `[ ]` **2.2.c Resolve task-list destinations through repository composition**
        - Exercise phase locators through `composeRepositoryPlan()`, `contentContributions()`, and the immutable plan
          composer instead of adding a task-specific placement path.
        - Build `test-first` (one behavior at a time):
            - Allocate a phase to a new member task scaffold and to an admissible existing home.
            - Reject a stale or non-resolving H2 locator with the existing typed source/target refusal.
            - Preserve the provisional whole-file task scaffold and require the author to prune it before delivery.

### `[ ]` **2.3 Retain companion bytes through extraction preflight, decode, and finish**

- _Goal:_ Extraction can observe started-Planning companions for exact authoring while no supported extraction path
  removes or rewrites their bytes.

    - `[ ]` **2.3.a Prove extraction inherits authenticated companion visibility**
        - Exercise initial Git preflight and finish's `createV3DecomposePreflight()` rebuild against the source-kind
          policy owned by Task 2.1.b; add no extraction-specific scanner or companion filter.
        - Build `test-first` (one behavior at a time):
            - Exclude Active-origin task, notes, draft, and nonstandard companion bytes from the starter map.
            - Include the same companions for a started-Planning source without changing source-artifact inventory.
            - Exclude the exact source meta in both paths and preserve profile inference, source selection, and fixed
              first-mismatch ordering.

    - `[ ]` **2.3.b Refuse non-retained companion dispositions in extraction maps**
        - Add the `companion-disposition` decode issue beside `source-shape` in `decodeV3DecomposeCutMap()`, deriving
          companion identity from `sourcePath` against `planningProfile.sourceDesign`; add its specific remedy to the
          shared registry and rerun the source-totality contract in the same leaf.
        - Build `test-first` (one behavior at a time):
            - Accept `retained-origin` with destination-owned ownership for every companion allocation.
            - Refuse target and drop dispositions at the exact allocation path under extraction.
            - Leave retirement shapes and design-unit extraction allocations unchanged.

    - `[ ]` **2.3.c Preserve retained companions through thinning and finish**
        - Carry the decode rule through `planV3ExtractionSourceThinning()` and
          `executeV3ExtractionSourceFinish()` without adding a second exclusion list.
        - Build `test-first` (one behavior at a time):
            - Authenticate retained task, notes, and generic companion paths as no-op thinning entries with equal
              before/after bytes and no removed locators, then omit them from pending preview and apply mutations.
            - Preserve exact bytes and modes across preview and apply, with focused coverage in
              `__tests__/unit/work-unit/decompose-v3-thinning.test.ts`.

    - `[ ]` **2.3.d Exercise the started-Planning extraction lifecycle**
        - Extend repository integration coverage from preflight through extract, result landing, finish preview, and
          finish apply with companion content present.
        - At `proveGitV3ExtractionDestinations()`, run one private pure source-group classifier before accepting either
          refreshed authority or fallback. Require every companion path, object kind, mode, and byte sequence to equal
          its common no-op before/after state; admit fallback only when every changed non-companion artifact is exactly
          a before or after state from the original authenticated thinning plan. Ignore unrelated non-group changes.
        - Assert the companion allocations remain visible to the author, each companion enters authenticated thinning
          as a no-op but no pending source mutation, and the origin finishes with byte-identical companions.
        - Exercise exact partial prior thinning and already-finished states, then add, remove, move, structurally
          rename, byte-edit, and mode-change companions and require `source:source-units` reauthoring through both
          authority-selection paths rather than refreshed acceptance, fallback, or a later preimage refusal.

### `[ ]` **2.4 Land a notes unit through scaffold, conservation, and result reporting**

- _Goal:_ An author can place notes content in a real member artifact, and every impossible placement identifies the
  exact member, path, and correction before projection.

    - `[ ]` **2.4.a Scaffold a targeted member notes artifact from the pinned origin**
        - Extend `newMemberScaffolds()` and `memberArtifactPath()` for `notes`, using `retitleScaffold()` over the
          pinned origin notes bytes only when an allocation targets that member path.
        - Build `test-first` (one behavior at a time):
            - Produce one whole retitled notes scaffold for a targeted member and none for an untargeted member.
            - Refuse a missing source as `scaffold-source-missing` and a valid UTF-8 source without a title as
              `scaffold-title-missing` with member and path locus.
            - Under an Active origin, let a design-unit target request the unscanned notes scaffold and refuse its
              invalid UTF-8 source as `scaffold-source-invalid-encoding` with member/source locus and conversion plus
              re-preflight remedy. Rerun refusal-registry source totality in the same leaf.
            - Keep member meta rendering unchanged because no notes pointer exists.

    - `[ ]` **2.4.b Admit notes as a closed content role and provisional contributor**
        - Add `notes` to `V3ContentArtifactRole`, `provisional-notes` to `V3ContentContributorKind`, and their exact
          whole-file compatibility and ordering in the plan composers.
        - Build `test-first` (one behavior at a time):
            - Accept one provisional notes scaffold plus allocated patches into its projected bytes.
            - Refuse role, disposition, contributor identity, or duplicate-owner mismatches.
            - Keep canonical contributor order and plan identity stable for every pre-existing role.

    - `[ ]` **2.4.c Close compatible member destinations over content-bearing roles**
        - Replace the suffix-only `artifactBelongsToWorkUnit()` test with the member's design, tasks, and notes
          artifact set in `decompose-v3-conservation.ts`.
        - Build `test-first` (one behavior at a time):
            - Admit design, task, and notes locators for the exact member.
            - Refuse `meta-<member>.md`, an unknown prefix, and another member's artifact as
              `incompatible-allocation-locator`.
            - Preserve existing-home and cohort-coordination destination rules.

    - `[ ]` **2.4.d Report the notes scaffold as an authoring destination**
        - Carry `provisional-notes` through `decompose-v3-result-report.ts` beside `provisional-task` without making
          either artifact authoritative.
        - Build `test-first` (one behavior at a time):
            - Report the destination path, member identity, role, and contributor kind from the immutable plan.
            - Keep result ordering stable and avoid disk discovery outside the plan.

### `[ ]` **2.5 Exercise open-family companion conservation on a real origin**

- _Goal:_ Companion coverage survives representative source kinds, artifact families, and Git transitions, including
  the real notes-content failure that motivated this work unit.

- **Additional Context:** `strategy-workflow-authoring.md` §§ Prose economy, Verbs over mechanics

    - `[ ]` **2.5.a Complete the source-kind and companion-presence unit matrix**
        - Cover `started-planning`, `backlog-stub`, and `active-origin` against absent, tasks, notes, draft, paired
          specs, and nonstandard matching companions.
        - Prove scanner choice, allocation exactness, extraction retention, title failures, role closure, and the
          floor over inventory minus scanned content.

    - `[ ]` **2.5.b Exercise companion relocation and repository composition with real Git objects**
        - Extend `decompose-v3-repository-plan.test.ts` for a nonstandard companion moved from backlog to active, a
          task list allocated by phase, and notes allocated into a member scaffold.
        - Verify predecessor retirement, rider isolation, immutable plan/report output, execute, and base-advance
          recomposition from pinned trees.

    - `[ ]` **2.5.c Rehearse the motivating notes cut on a copy of a real origin**
        - Use a copied fixture carrying substantive notes content; author allocations, execute the retirement, and
          compare the complete origin artifact-group content with the resulting destinations and reasoned drops.
        - Require no manual post-transition repair and keep destructive rehearsal outside the live origin.

    - `[ ]` **2.5.d Publish companion authoring and extraction handling before member close**
        - Extend the package-source `decompose-work-unit.md` with inventoried companion allocation, retained-only
          started-Planning extraction, provisional task/notes scaffolds to prune, and manual transfer for allocated
          companions no scaffold copies.
        - Apply the same targeted edit to the project-instance workflow and extend
          `decompose-workflow-contract.test.ts` to prove required instruction presence and cumulative parity with the
          Member 1 refusal contract.
        - Keep CLI-computed eligibility, validation, and refusal selection out of workflow prose.

    - `[ ]` **2.5.e Run the Phase 2 code-quality checkpoint**
        - Run targeted lint and unit/integration/E2E filters as each behavior lands, then both TypeScript type checks
          and focused workflow-contract coverage over the composed member.
        - Treat any missing production consumer, changed preflight pathspec/spawn count, byte-order drift, or
          code/workflow mismatch as a phase failure even when isolated scanner tests pass.

### `[ ]` **2.6 Close companion-conservation delivery** — validate criteria at member scope

- _Goal:_ Member 2 has independently reviewable evidence that every retiring companion is covered and every
  supported extraction leaves companion bytes intact.

    - Run the `validate-criteria.md` member-scope walk for `companion-conservation` and record the boundary evidence
      without changing Success Criteria markers.

## **Phase 3:** Authored external edges and the operator workflow

**Delivery member:** 3 — `external-dependency-authoring`

_Purpose:_ Let the cut map express dependencies outside the cut through existing records and projections, then make
the complete conservation and refusal contract usable without reading implementation source.

_Design decisions:_ First carry a live result-base target from the authored map through conservation, the meta
mutator, and staged ROADMAP output. Completed-target and base-advancement cases extend that working slice; workflow
prose follows the executable contract.

### `[ ]` **3.1 Land a live-result-base external edge from cut map to staged ROADMAP**

- _Goal:_ One authored dependency to a live work unit outside the cut flows from the closed map through conservation
  into the recipient meta and its derived ROADMAP entry.

    - `[ ]` **3.1.a Add the closed external-edge authoring slot**
        - Extend the starter authoring schema with the whole-field `{ status: "author" }` slot and the completed
          authoring schema with canonically ordered, unique `{ from, to }` external edges. Treat explicit `[]` as a
          completed empty value; the starter never prefills authored content.
        - Build `test-first` (one behavior at a time):
            - Accept new-member and existing-home `from` slugs declared by the map.
            - Reject missing, extra, duplicate, reordered, malformed, and undeclared-`from` authoring values; defer
              `to` eligibility to conservation.
            - Keep machine and `preflightId` identity plus existing edge-identity preimages unchanged while making
              `v3CutMapDigest()` and downstream plan identity cover `externalEdges`.
        - Exercise the contract in
          `packages/arc-framework/__tests__/unit/work-unit/decompose-v3-schema.test.ts`.

    - `[ ]` **3.1.b Validate a live external target and derive its dependency edit**
        - Add `resultBaseLiveSlugs` to `V3DecomposeConservationInput` and emit a canonical `external`
          `V3ValidatedDependencyEdit` without folding it into internal or outgoing proof. Add specific registry
          remedies for `unknown-external-target`, `redundant-external-edge`, and `retiring-origin-target`, then rerun
          source totality in the same leaf.
        - Build `test-first` (one behavior at a time):
            - Admit one live target outside the declared destination set.
            - Refuse an invalid `from`, declared-destination target, retiring-origin target, unknown target, and
              unchanged dependency slot at their authoring loci.
            - Classify an external self-edge as `redundant-external-edge` because its `to` is a declared destination;
              add no second external self-dependency code.
            - Align internal-edge conservation with the decoder by accepting new-member and live existing-home
              work-unit destinations at either endpoint; cover existing-home-to-new-member and the inverse.
            - Keep edit ordering and `edgeId` disjoint through the `{ schemaVersion, kind, from, to }` preimage.
        - Exercise the validation matrix in
          `packages/arc-framework/__tests__/unit/work-unit/decompose-v3-conservation.test.ts`.

    - `[ ]` **3.1.c Project the edge through existing meta and ROADMAP composers**
        - Pass result-base live slugs from `composeRepositoryPlan()` and reuse `dependencies()`,
          `setMetaBulletFields()`, and the existing staged ROADMAP renderer.
        - In `dependencies()`, derive the exact add/remove delta between each validated edit's source-bound
          `beforeTargets` and `afterTargets`, then apply only that delta to the recipient's current pinned result-base
          sequence. Record contribution prestates and after-states from that sequence; never replace the complete slot
          with the source-derived list.
        - Build `test-first` (one behavior at a time):
            - Append the prerequisite to a scaffolded member and an existing-home meta without rewriting other
              dependency slots.
            - Preserve an unrelated prerequisite added or removed on the result base after the source fork; refuse
              `unchanged-dependency-slot` when the external prerequisite is already present there.
            - Render the unsatisfied external edge through the current ROADMAP seam.
            - Preserve exact transform-delta validation while the prerequisite remains live.
        - Exercise the production caller and projection seam in
          `packages/arc-framework/__tests__/unit/work-unit/decompose-v3-repository-plan.test.ts`.

### `[ ]` **3.2 Admit completed and late-created targets without widening source authority**

- _Goal:_ External-target eligibility follows the pinned result base, including work that landed or appeared after
  the source fork, without changing source-bound conservation facts or preflight cost.

    - `[ ]` **3.2.a Derive completed target slugs from the already-read result-base tree**
        - Add a pure completed-target eligibility wrapper in `src/lib/work-unit/completed-index.ts` that delegates
          semantic path recognition to `identifyWorkUnitArtifactPath()` and accepts only a completed placement whose
          artifact kind is `meta`. Apply it to regular-blob entries in the already-read `V3RepositoryPlanTree` without
          parsing completed blobs or adding them to `readTreeMetas()` lifecycle records.
        - Leave the module's older loose filesystem/ref archive readers intentionally unchanged as resilient
          compatibility evidence readers; do not copy their regex grammar into the exact eligibility wrapper.
        - Build `test-first` (one behavior at a time):
            - Admit an exact `meta-<slug>.md` whose canonical slug matches its valid completed quarter and work-unit
              archive entry.
            - Ignore cohort entries, non-meta files, malformed or mismatched slugs, non-regular tree states, and
              live-tier records for this set.
            - Perform no additional Git read, pathspec expansion, or per-branch spawn.
        - Cover the classifier and its repository-plan use in
          `packages/arc-framework/__tests__/unit/work-unit/completed-index.test.ts` and
          `packages/arc-framework/__tests__/unit/work-unit/decompose-v3-repository-plan.test.ts`.

    - `[ ]` **3.2.b Resolve the complete external-target eligibility matrix**
        - Validate `to` against separate result-base live and completed sets, plus the authenticated surviving origin
          under extraction.
        - Build `test-first` (one behavior at a time):
            - Admit live, completed, late-created live, newly completed, and authenticated extraction-origin targets.
            - Refuse a retirement edge to its origin as `retiring-origin-target`, even though the predecessor appears
              in the result-base live set.
            - Refuse other targets only when they are absent from every eligible set or duplicate a
              destination-owned edge.
            - Keep incoming-edge conservation and recipient validation bound to their existing source/live inputs.
            - Retain a completed-target dependency in its recipient meta while omitting it from the staged ROADMAP's
              unsatisfied-dependency projection.

    - `[ ]` **3.2.c Prove the preflight authority and cost boundaries stay closed**
        - Pin the existing three-tier preflight pathspec, local-branch scan count, and `preflightId` field set in
          `packages/arc-framework/__tests__/unit/work-unit/git-decompose-v3-preflight.test.ts` and
          `packages/arc-framework/__tests__/unit/work-unit/decompose-v3-schema.test.ts`.
        - Show that a target present only on the pinned result base becomes eligible during repository-plan composition
          while source units and incoming/outgoing edges stay source-bound. Add no `preflightId` field or preimage
          component; normal changes to the pinned result-base head retain their existing identity effect.
        - Instrument `composeGitV3RepositoryPlan()` in the real-Git suite and assert exactly one full-tree read for
          each existing source, merge-base, and result-base role, with object reads only for those enumerated trees.
          Assert advancement performs the same single recomposition and no completed pathspec or per-target read.

### `[ ]` **3.3 Preserve external edges through base-advancement recomposition**

- _Goal:_ A committed candidate remains authoritatively reproducible when its external prerequisite changes from live
  to completed before base advancement.

    - `[ ]` **3.3.a Recompose against current live and completed eligibility**
        - Reuse the result-base tree already read by `advanceGitDecomposeTransitionBase()` so a shipped target remains
          valid without rewriting the completed cut map.
        - Build `test-first` (one behavior at a time):
            - Compose with a live target at execute time and the same target completed at advancement time.
            - Admit a target created on the result base after the origin fork.
            - Refuse a target removed from every eligible set before candidate mutation.
            - Refuse `dependency-recipient-drift` when a dependency-bearing recipient changes after candidate
              creation, carrying previous/current target sets and a candidate-cleanup plus fresh-preflight remedy;
              update the refusal registry and source-totality proof in the same leaf.

    - `[ ]` **3.3.b Keep external edges outside transition-record and source-proof authority**
        - Assert the existing transition-record schema, incoming-disposition record, and machine preflight envelope
          do not acquire external-edge fields.
        - Prove exact transform-delta comparison still accepts only the dependency delta derived from the authored map
          and rebased onto the current pinned result-base recipient state.
        - Compare dependency-bearing recipient prestates between the candidate's last authenticated base and the
          current base before history authentication or merge. Keep the result out of the transition record and do
          not replay dependency transformations across historical bases.

    - `[ ]` **3.3.c Exercise full-protection advancement with target lifecycle changes**
        - Extend the real-Git repository-plan suite through execute, candidate commit, target completion on base, and
          `--advance-base` recomposition.
        - Verify the candidate keeps its exact first-parent chain, the edge lands once, and no force/rewrite or extra
          transition record is introduced.
        - Change an unrelated dependency on the recipient after candidate commit and require the specific drift
          refusal, evidence, and no mutation. Retain one current full-tree recomposition and no per-historical-base
          composition.

### `[ ]` **3.4 Publish external-edge authoring and close cumulative workflow parity**

- _Goal:_ An agent can author external edges from the shipped workflow, and the final workflow still carries every
  refusal and companion instruction published by the preceding delivery members.

- **Additional Context:** `strategy-workflow-authoring.md` §§ Prose economy, Verbs over mechanics

    - `[ ]` **3.4.a Update the package-source `decompose-work-unit.md` contract**
        - In `packages/arc-framework/arc/system/workflows/arc/work-unit-lifecycle/decompose-work-unit.md`, add
          `externalEdges` authoring from a member or existing home to a work unit outside the cut, and direct
          destination-owned edges to the existing internal/outgoing slots.
        - Preserve the cumulative refusal-envelope, companion-retention, provisional-scaffold, and manual-transfer
          instructions already present; keep CLI-computed validation out of workflow prose.

    - `[ ]` **3.4.b Synchronize and verify the project-instance workflow**
        - Apply the package-source change as the same targeted edit to
          `.arc/system/workflows/arc/work-unit-lifecycle/decompose-work-unit.md`; do not copy whole framework trees or
          configurable files.
        - Extend `packages/arc-framework/__tests__/unit/work-unit/decompose-workflow-contract.test.ts` to require the
          external-edge slot and the cumulative scaffold, manual-transfer, and
          status/remedy/evidence/optional-report rules in both installed and project surfaces.

### `[ ]` **3.5 Exercise external-edge refusals and workflow agreement end to end**

- _Goal:_ The external-edge feature and its authoring guidance agree across schema, pinned-tree composition,
  advancement, public command output, and both workflow copies.

    - `[ ]` **3.5.a Complete the external-edge schema and conservation matrix**
        - Cover new-member and existing-home sources against live, completed, late-created, redundant, unknown,
          retiring-origin, self, unchanged, and extraction-origin targets.
        - Pin canonical order, distinct edge identity, dependency-edit order, and first-refusal precedence, including
          self-edge classification through `redundant-external-edge`.
        - Prove every dependency-capable declared destination pair accepted by the decoder is accepted by internal-edge
          conservation, while undeclared or non-work-unit existing homes still refuse at their established boundary.
        - Consolidate the matrix in `packages/arc-framework/__tests__/unit/work-unit/decompose-v3-schema.test.ts` and
          `packages/arc-framework/__tests__/unit/work-unit/decompose-v3-conservation.test.ts`.

    - `[ ]` **3.5.b Exercise retirement and extraction repository lifecycles against real Git state**
        - Cover member-meta and existing-home writes, ROADMAP rendering, target completion between execute and
          advancement, and target creation after the source fork.
        - Diverge an existing home's source and result-base dependency sets, then prove the authored delta preserves
          unrelated pinned-base changes and an already-satisfied edge refuses before write.
        - Carry a new member's external prerequisite to the authenticated surviving origin through `--extract`,
          result landing, finish preview, finish apply, and repeat; require the dependency and ROADMAP claims to pass
          finish proof without changing the origin's companion bytes.
        - Make one incoming dependent an existing-home destination with an external edge. In finish proof, use the
          complete composed dependency mutation for that touched recipient and reserve the incoming-only recomputation
          for dependents with no dependency mutation; carry the overlap through preview, apply, and repeat.
        - Assert source-bound facts and the transition record remain unchanged while the staged dependency and
          derived projection match the authored map exactly.
        - Use `packages/arc-framework/__tests__/integration/decompose-v3-repository-plan.test.ts` as the real-Git
          lifecycle seam.

    - `[ ]` **3.5.c Verify command output and workflow contract agreement**
        - Extend E2E and workflow-contract coverage so emitted external-edge refusals name the exact authored locus
          and corrective command, and the workflow tells the agent how to act on the same result.
        - Prove package/project workflow parity and retain bare `arc ...` commands inside shipped prose.
        - Use `packages/arc-framework/__tests__/e2e/decompose-command-modes.e2e.test.ts` and
          `packages/arc-framework/__tests__/unit/work-unit/decompose-workflow-contract.test.ts`.
        - Treat the workflow assertions as instruction-presence and parity evidence, not agent-behavior eval coverage;
          `workflow-eval-harness` owns that unavailable gate.

    - `[ ]` **3.5.d Run the Phase 3 code-and-methodology checkpoint**
        - Run targeted lint and tests as each behavior lands, then both TypeScript type checks, Markdown lint, and
          all three ARC contract checks over the composed member.
        - Treat a code/workflow mismatch, package/project drift, or primitive-only test result as a phase failure.

### `[ ]` **3.6 Close external-edge delivery** — validate criteria at member scope

- _Goal:_ Member 3 has independently reviewable evidence that authored external edges survive target lifecycle
  changes and remain operable from the shipped workflow.

    - Run the `validate-criteria.md` member-scope walk for `external-dependency-authoring` and record the boundary
      evidence without changing Success Criteria markers.

## **Phase 4:** Verification

### `[ ]` **4.1 Complete verification** — load and follow `verify-work-unit.md`

- _Goal:_ The complete work unit satisfies its design, composes all three delivery members without seam gaps, and
  is ready for integration under the repository's full quality and review gates.

---

## Success Criteria

### Member 1 — `refusal-contract-and-floor`

- `[ ]` A nonempty retiring companion outside the scanned set refuses both execute and base advancement before any
  repository mutation is planned, naming the path and the corrective preflight command.
- `[ ]` Every known refusal code resolves to a specific `SpineRemedy`; only normalized unexpected runtime failures
  use the named retry fallback, no runtime detail escapes as a reason, and no decompose command result carries a
  string remedy.
- `[ ]` Preflight, execute, extract, finish preview, finish apply, and base advancement emit one strict refusal
  envelope on stdout, the reason and verbatim remedy text on stderr, and a nonzero exit status; report-bearing
  operation refusals preserve their typed report, while handler-caught `unexpected-error` uses the core-only arm
  without invented stage, recovery, or report fields.
- `[ ]` Every admitted state comparison carries typed `expected` and `actual` evidence through the outer command
  result, while one-sided consistency failures and transient `source-preimage-raced` carry no evidence field.
- `[ ]` Scanned invalid UTF-8 Markdown refuses during preflight as path-bearing `source-scan`; an unscanned Active
  task/notes scaffold source refuses `scaffold-source-invalid-encoding`; other cause-specific scaffold and projection
  failures retain the exact member/path locus that exists when they run.
- `[ ]` Both workflow copies publish the all-mode stdout envelope and surface status, remedy, evidence, and any
  optional report before the member closes.

### Member 2 — `companion-conservation`

- `[ ]` Source and predecessor discovery admit every valid artifact-group Markdown companion and paired spec while
  leaving unrelated supplemental files under the existing rider guard.
- `[ ]` Started-Planning and backlog retirement maps enumerate every companion unit; task lists allocate at preamble
  and H2-phase granularity through preflight, map revalidation, execute, and base advancement.
- `[ ]` A targeted notes unit reaches a `provisional-notes` scaffold, conservation, the immutable plan, and the
  result report through production composition paths.
- `[ ]` Active origins expose no companion source units, and started-Planning extraction accepts only
  `retained-origin` for companions so finish leaves their bytes unchanged.
- `[ ]` Extraction finish accepts exact partial prior thinning while every added, removed, moved, renamed, or changed
  companion path, object, mode, or byte state returns the `source:source-units` reauthoring refusal before either
  refreshed or fallback authority is accepted.
- `[ ]` Missing notes sources and valid UTF-8 sources without a title refuse with distinct scaffold codes and
  actionable loci, an invalid-encoding Active notes scaffold uses its distinct code, and allocations into a member
  meta refuse before projection.
- `[ ]` Companion coverage leaves the preflight pathspec, branch-spawn count, and closed `preflightId` preimage
  unchanged apart from the widened source-unit values.
- `[ ]` A copy-based rehearsal of a real origin with a notes companion conserves its complete artifact-group content
  without post-transition repair.
- `[ ]` Both workflow copies explain companion allocation, retained-only extraction, provisional task/notes
  scaffolds, and manual transfer before the member closes, while preserving Member 1 refusal guidance.

### Member 3 — `external-dependency-authoring`

- `[ ]` A canonical completed map can add an external prerequisite from a new member or existing home, while
  duplicate, self-contained, retirement-origin, and unknown targets refuse deterministically; an external self-edge
  is classified as `redundant-external-edge`, and internal edges accept both new-member and live existing-home
  work-unit endpoints already admitted by the decoder.
- `[ ]` External-target eligibility follows the pinned result-base live and completed sets, admits the authenticated
  surviving origin for extraction, and remains valid through recomposition when a target ships before base
  advancement.
- `[ ]` An external edge to the surviving extraction origin lands and survives finish preview, apply, and repeat; its
  completed-target eligibility adds no completed-specific Git query or per-target object read. A recipient carrying
  both incoming and external contributions passes the same lifecycle through its complete composed mutation.
- `[ ]` Accepted external edges update the recipient through the existing meta mutator and appear in the staged
  ROADMAP through the existing unsatisfied-dependency projection; each edit rebases its exact delta onto the pinned
  result-base target sequence without overwriting unrelated dependency changes.
- `[ ]` Completed-target eligibility delegates semantic path recognition to the layout authority while retaining the
  existing loose archive readers as separate compatibility behavior.
- `[ ]` Base advancement accepts target lifecycle changes but refuses a dependency-bearing recipient changed after
  candidate creation as `dependency-recipient-drift`, with evidence and no mutation or historical plan replay.
- `[ ]` Both shipped and project-instance decompose workflows add external-edge authoring and retain cumulative
  companion, scaffold, manual-transfer, and status/remedy/evidence/optional-report handling.

### Cross-member seams

- `[ ]` The uncovered-content floor remains an invariant assertion after full companion inventory lands.
- `[ ]` Machine-envelope identity, exact transform-delta validation, and core topology/conservation contracts remain
  closed across all three members.
- `[ ]` The transition-record schema and completed predecessor specs remain unchanged; their accepted forward
  amendments live only in this work unit's design authority.
- `[ ]` Each member's package-source methodology edit is synchronized to the project instance before its boundary
  without overwriting project-only content, and the final pair is cumulative.
- `[ ]` Each member's acceptance task exercises its production callsites before member-scope validation; primitive
  or schema coverage alone does not close a mandatory lifecycle path.
- `[ ]` All quality gates pass (tests, linting, type checking).
- `[ ]` Ready for integration.
