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

### `[x]` **1.5 Prove source-wide remedy totality and all six command boundaries**

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

    - `[x]` **1.5.c Exercise all six refusing invocations in a real repository**
        - Unified post-selection handler exceptions across all six invocations on the strict core-only
          `unexpected-error` envelope with detail in `locus` and exact mode retry argv.
        - Added a built-CLI matrix proving one envelope, exact stderr, exit `1`, and unchanged repository state for
          every mode, including arbitrary preflight Git-read normalization.
        - Completed finish authoring-shape remedies and base-advancement loci so known refusals remain actionable
          instead of degrading through the exception boundary.

    - `[x]` **1.5.d Publish the all-mode refusal contract before member close**
        - Declared one all-mode stdout refusal envelope in both workflow copies, requiring status, reason, optional
          locus, evidence, report, and remedy fields to be surfaced unchanged while successful preflight remains
          starter-map-only.
        - Extended workflow-contract coverage for the cumulative instructions and package/project parity while
          preserving the shipped bare `arc ...` command surface.

    - `[x]` **1.5.e Run the Phase 1 code-quality checkpoint**
        - The composed checkpoint exposed and corrected two stale preflight-handler expectations so selected-mode
          refusals now assert exact canonical stdout and verbatim stderr while project-root failure remains outside
          the machine envelope.

- _Outcome:_ Static source totality, composed prefix/evidence coverage, real-repository six-mode execution, and the
  shipped workflow contract now close the refusal regression surface from producer through operator guidance.

### `[x]` **1.6 Close refusal-contract delivery** — validate criteria at member scope

- _Goal:_ Member 1 has independently reviewable evidence that its public refusal path is complete and that retirement
  cannot cross the uncovered-content floor.

    - `[x]` **1.6.R.a Make finish refusal remedies mode-total**
        - Added finish-specific remedies for invalid maps and non-descendant bases, moved base ancestry selection into
          the mode-aware registries, and made source totality require every finish-emitted code to map for preview and
          apply rather than accepting a mapping from an unrelated mode.

    - `[x]` **1.6.R.b Classify target-driven notes scaffold sources before projection**
        - Routed targeted notes sources through the existing missing, encoding, and title classifier before target
          projection, preserving Phase 2's ownership of actual notes materialization while exposing the source member
          and path instead of the later absent-target symptom.

    - `[x]` **1.6.R.c Keep recovery-failure refusals evidence-free**
        - Retained comparison evidence only when its comparison reason remains outward; rollback and partial-
          restoration failures now expose their own locus and recovery facts without inheriting operands from the
          superseded staged-authority mismatch.

    - `[x]` **1.6.R.d Keep empty runtime diagnostics inside the refusal envelope**
        - Omitted empty or whitespace-only caught details instead of emitting an invalid locus, preserving the strict
          core-only `unexpected-error` envelope across all six selected modes without inventing diagnostic text.

    - `[x]` **1.6.R.e Distinguish unavailable ancestry probes from topology failures**
        - Reserved non-descendant refusals for Git's negative ancestry result and routed operational probe failures
          from finish and every base-advancement check to a diagnostic, retryable refusal without comparison evidence.

- _Outcome:_ Member 1 criteria report.
    - _Criteria slice:_ `Success Criteria > Member 1 — refusal-contract-and-floor`.
    - _Span:_ bounded diff `fd5e77145..34b1e4079`; cumulative reachability `34b1e4079` at tree `ce1132fab`;
      `boundary-order-deviation: null`.
    - _Criterion:_ `Success Criteria > Member 1 — refusal-contract-and-floor > 1`;
      _criterion-digest:_ `sha256:87c3d6793bbabc161b13189cd7f554d328924cfd88c5ee80e39ffe48642b8a14`;
      _State:_ `[x]`; _Evidence:_ conservation checks the pinned non-meta inventory before retirement-delta planning;
      unit, command-integration, and built-CLI coverage prove execute and base advancement preserve the repository and
      return the exact path and preflight argv.
    - _Criterion:_ `Success Criteria > Member 1 — refusal-contract-and-floor > 2`;
      _criterion-digest:_ `sha256:5e0a247fe9645921b0a5b8a24f8d5dd0ba20fe6a9b902420589763abfed5eab4`;
      _State:_ `[x]`; _Evidence:_ the strict core contract requires `SpineRemedy`; the AST source-totality suite maps
      every production literal specifically except named `unexpected-error`, rejects unstable outward producers, and
      the mode schemas and TypeScript results contain no string-remedy arm.
    - _Criterion:_ `Success Criteria > Member 1 — refusal-contract-and-floor > 3`;
      _criterion-digest:_ `sha256:a025c897323d23d7c833d9fcee3d7ba04b14a33760a2d88d17836076ffb942ca`;
      _State:_ `[x]`; _Evidence:_ the shared emitter schema-selects strict core or report-bearing operation refusals,
      writes one canonical envelope plus exact stderr, and sets exit `1`; the built-CLI matrix exercises all six modes,
      while schema tests reject invented operation fields on handler-caught failures.
    - _Criterion:_ `Success Criteria > Member 1 — refusal-contract-and-floor > 4`;
      _criterion-digest:_ `sha256:3732eb85ff533c846e6c8fdaae87d1cf60b052cf0a03f9acb40e230a832b89cd`;
      _State:_ `[x]`; _Evidence:_ the strict evidence schema admits only JSON `expected` and `actual`; producer and
      boundary suites cover each recorded/live comparison family and keep one-sided topology, recovery, ancestry-
      observation, and transient `source-preimage-raced` failures evidence-free.
    - _Criterion:_ `Success Criteria > Member 1 — refusal-contract-and-floor > 5`;
      _criterion-digest:_ `sha256:8ea17dc248fa39d43a2fcf751f97fda4a7c6d8f0cbadccf14e36c10682435494`;
      _State:_ `[x]`; _Evidence:_ scanned invalid bytes stop preflight at `source-scan`, while target-driven Active
      task/notes sources use the repository-plan encoding classifier; focused cause matrices preserve distinct
      metadata, missing-source, encoding, title, existing-home, target-artifact, and target-locator loci and remedies.
    - _Criterion:_ `Success Criteria > Member 1 — refusal-contract-and-floor > 6`;
      _criterion-digest:_ `sha256:044a5e79eeda5c51a6c96fff7940ca690ac762041f0f130117bd40e772a416b6`;
      _State:_ `[x]`; _Evidence:_ both workflow copies are byte-identical at
      `sha256:9a66b946696e8b283218201d63bf0dacc5e8073b24655140ef8e191e3406ac3a`; their contract test requires the sole
      all-mode stdout envelope and unchanged surfacing of status, reason, locus, evidence, remedy, and optional report.
    - _Adversarial companion:_ Heavy pass 1 found four actionable gaps, corrected by `8336744cc`, `74724bf3f`,
      `65ef303b0`, and `cc6e02ea2`; pass 2 found ancestry probe errors collapsing into topology failures, corrected by
      `34b1e4079`. The two-pass cap is exhausted; no third pass is claimed. Primary source verification followed the
      final correction.
    - _Summary:_ six `[x]`, zero `[~]`, zero `[ ]`; terminal Success Criteria markers remain unchanged.

## **Phase 2:** Complete companion conservation

**Delivery member:** 2 — `companion-conservation`

_Purpose:_ Bring every retiring Markdown companion inside the proof, give its units valid authoring destinations,
and preserve extraction's source bytes by source kind.

_Design decisions:_ Land one generic companion through source discovery and retirement before specializing task-list,
notes, and extraction behavior. Every specialization reaches a command plan, result report, or finish boundary; no
scanner or schema primitive closes a lifecycle obligation by itself.

### `[x]` **2.1 Retire a generic companion through complete source and predecessor discovery**

- _Goal:_ Any valid Markdown artifact belonging to the origin is selected from both pinned trees and reaches the
  retirement proof without making unrelated supporting documents part of the work unit.

    - `[x]` **2.1.a Use one open artifact-family rule for source and predecessor reads**
        - Source and predecessor discovery now share `artifactMatcher(origin)` plus paired-spec admission, exclude
          the exact same-name cohort locally, and return the complete artifact family in canonical UTF-8 path order.

    - `[x]` **2.1.b Scan a generic companion into the started source preflight**
        - `createV3DecomposePreflight()` now owns source-kind scan eligibility: started Planning and backlog sources
          authenticate every non-meta companion unit, while Active sources expose only design units. Exact paths,
          locators, digests, ordering, identity participation, and path-bearing encoding refusals are covered.

    - `[x]` **2.1.c Carry the same family through predecessor retirement planning**
        - Repository composition now retires unchanged generic predecessors across backlog-to-active relocation,
          refuses changed companions with bounded evidence at the exact path, and preserves unrelated files as named
          source-private riders.

- _Outcome:_ One canonical artifact-family boundary now governs pinned discovery, authenticated source units, and
  retirement planning without absorbing cohort documents or unrelated supporting material.

### `[x]` **2.2 Allocate task-list phases through preflight and retirement**

- _Goal:_ A retiring task list contributes a small, complete set of phase-level units that can be authored and
  conserved through the same paths as design content.

    - `[x]` **2.2.a Add task-list phase boundaries to the shared content scanner**
        - Task-list scans now emit a header preamble and protected H2 phase units while retaining nested task
          headings inside their phase bytes. ATX/Setext identity, repeated phases, BOM/CRLF/fence preservation,
          byte-exact reconstruction, and ordinary H2-H6 locator behavior remain covered.

    - `[x]` **2.2.b Bind phase units into preflight and completed-map authoring**
        - Started Planning and backlog preflights now prove canonical task preamble/phase identities and exact author
          slots under the unchanged machine envelope and identity formula. Draft profiles admit task lists as
          companions, while missing, duplicate, reordered, or tampered allocations fail existing identity checks.

    - `[x]` **2.2.c Resolve task-list destinations through repository composition**
        - Task phases now traverse the generic repository composition path into new-member task scaffolds and
          admissible existing documents. Composition preserves the whole-file task copy as provisional, leaves the
          member's Task List unset for author pruning, and rejects unresolved H2 targets at the exact artifact locus.

- _Outcome:_ Task-list preambles and phases now retain scanner identity through preflight, authoring, destination
  resolution, immutable composition, and retirement while provisional member copies remain non-authoritative.

### `[x]` **2.3 Retain companion bytes through extraction preflight, decode, and finish**

- _Goal:_ Extraction can observe started-Planning companions for exact authoring while no supported extraction path
  removes or rewrites their bytes.

    - `[x]` **2.3.a Prove extraction inherits authenticated companion visibility**
        - Initial Git preflight now proves that Active sources retain task, notes, draft, and nonstandard companions
          in authenticated inventory while exposing design units only, whereas started Planning exposes every
          non-meta companion unit. Finish preview exercises the same rebuild policy and leaves inventory-only Active
          companions byte-identical without an extraction-specific filter.

    - `[x]` **2.3.b Refuse non-retained companion dispositions in extraction maps**
        - Extraction decode now identifies non-design companions from each source path and requires a
          destination-owned retained-origin allocation, reports `companion-disposition` at the exact allocation,
          and routes the code through a specific shared remedy without changing retirement or design-unit choices.

    - `[x]` **2.3.c Preserve retained companions through thinning and finish**
        - Focused thinning coverage now authenticates task, notes, and generic companions as exact no-op file plans
          with no removed locators, then proves finish preview and apply omit them from pending mutations while
          preserving their bytes and modes through the existing decoder-to-plan pipeline.

    - `[x]` **2.3.d Exercise the started-Planning extraction lifecycle**
        - Finish proof now classifies the origin artifact group against the original authenticated companion no-ops
          and design before/after states before selecting refreshed or fallback authority. Integration coverage carries
          started Planning through extraction, landing, partial thinning, apply, and already-finished recognition;
          every companion drift shape requires reauthoring while unrelated work-unit artifacts remain out of scope.

- _Outcome:_ Extraction now exposes complete started-Planning companion authoring while preserving every companion
  byte and mode from preflight through finish, including refresh, fallback, partial-progress, and repeat paths.

### `[x]` **2.4 Land a notes unit through scaffold, conservation, and result reporting**

- _Goal:_ An author can place notes content in a real member artifact, and every impossible placement identifies the
  exact member, path, and correction before projection.

    - `[x]` **2.4.a Scaffold a targeted member notes artifact from the pinned origin**
        - Targeted notes now materialize as one provisional, whole-file scaffold retitled from the pinned origin
          bytes; untargeted notes remain absent, modes stay stable, and member meta rendering gains no notes pointer.
          Missing, invalid-UTF-8, and title-less sources retain their member/path refusals and re-preflight remedies.

    - `[x]` **2.4.b Admit notes as a closed content role and provisional contributor**
        - Plan composition now admits only whole-file `provisional-notes` ownership of a notes artifact before its
          allocated patches, binds contributor identity to the notes role, rejects role, disposition, identity, and
          duplicate-owner mismatches, and preserves deterministic ordering for every pre-existing contributor kind.

    - `[x]` **2.4.c Close compatible member destinations over content-bearing roles**
        - New-member allocations now admit only the profile-specific design artifacts plus task and notes content;
          member meta, arbitrary suffix matches, and another member's artifacts refuse at the exact locator, while
          existing-home and cohort-coordination destination rules remain unchanged.

    - `[x]` **2.4.d Report the notes scaffold as an authoring destination**
        - Result reporting now proves provisional task and notes destinations retain plan order, path, member,
          artifact role, contributor kind, and materialization disposition directly from immutable provenance,
          without mutating or supplementing the plan through live discovery.

- _Outcome:_ Notes content now has a pinned provisional destination, closed contributor and locator roles, exact
  placement refusals, and immutable result visibility from scaffold construction through report projection.

### `[ ]` **2.5 Exercise open-family companion conservation on a real origin**

- _Goal:_ Companion coverage survives representative source kinds, artifact families, and Git transitions, including
  the real notes-content failure that motivated this work unit.

- **Additional Context:** `strategy-workflow-authoring.md` §§ Prose economy, Verbs over mechanics

    - `[x]` **2.5.a Complete the source-kind and companion-presence unit matrix**
        - An 18-case matrix now spans all three source kinds and six artifact-family shapes, binding inventory,
          profile, scanned paths, unit resolution, and exact author slots; the composed companion unit set also
          closes extraction retention, title classification, role closure, and the retirement floor.

    - `[x]` **2.5.b Exercise companion relocation and repository composition with real Git objects**
        - Real repositories now move a nonstandard companion, task list, and notes from backlog to active; exercise
          phase-split allocations, provisional task/notes destinations, complete predecessor retirement, rider
          isolation, full execute, and base advancement while the completed map and staged plan/report stay unchanged.

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
