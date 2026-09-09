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

### `[x]` **2.5 Exercise open-family companion conservation on a real origin**

- _Goal:_ Companion coverage survives representative source kinds, artifact families, and Git transitions, including
  the real notes-content failure that motivated this work unit.

    - `[x]` **2.5.a Complete the source-kind and companion-presence unit matrix**
        - An 18-case matrix now spans all three source kinds and six artifact-family shapes, binding inventory,
          profile, scanned paths, unit resolution, and exact author slots; the composed companion unit set also
          closes extraction retention, title classification, role closure, and the retirement floor.

    - `[x]` **2.5.b Exercise companion relocation and repository composition with real Git objects**
        - Real repositories now move a nonstandard companion, task list, and notes from backlog to active; exercise
          phase-split allocations, provisional task/notes destinations, complete predecessor retirement, rider
          isolation, full execute, and base advancement while the completed map and staged plan/report stay unchanged.

    - `[x]` **2.5.c Rehearse the motivating notes cut on a copy of a real origin**
        - A temporary repository now copies the real `decompose-transform-integrity` spec, tasks, and substantive
          notes, proves complete target-or-drop coverage, and executes their retirement without repair; the rehearsal
          also closed notes allocation classification so the provisional notes destination composes as `notes`.

    - `[x]` **2.5.d Publish companion authoring and extraction handling before member close**
        - Both workflow copies now direct retirement companion allocation, retained-only started-Planning extraction,
          pruning of whole-copy task/notes scaffolds, and manual transfer for other companions; contract coverage
          proves those instructions remain byte-equal alongside the typed refusal envelope.

    - `[x]` **2.5.e Run the Phase 2 code-quality checkpoint**
        - The composed checkpoint exercises scanner ordering, source-kind consumers, Git preflight behavior,
          conservation, composition, execute/advance, thinning, reporting, and workflow parity without drift.

- _Outcome:_ Open-family companion coverage now composes the complete source matrix with real relocation, copied
  substantive notes, immutable Git execution and advancement, exact rider boundaries, and operator guidance for
  retained, scaffolded, manually transferred, and reasoned-drop content.

### `[x]` **2.6 Close companion-conservation delivery** — validate criteria at member scope

- _Goal:_ Member 2 has independently reviewable evidence that every retiring companion is covered and every
  supported extraction leaves companion bytes intact.

    - `[x]` **2.6.R.a Preserve companion object drift through finish classification**
        - Finish now keeps ordinary preflight discovery strict while an explicitly raw-proof-backed snapshot omits
          unsupported current artifacts. The pinned repository tree supplies their exact object facts to the shared
          source-group classifier before refreshed or fallback authority; real-Git symlink coverage proves the
          public refusal remains `source:source-units` with blob-versus-symlink evidence.

- _Outcome:_ Member 2 criteria report.
    - _Criteria slice:_ `Success Criteria > Member 2 — companion-conservation`.
    - _Span:_ bounded diff `16604eba1..90fc9e53a`; cumulative reachability `90fc9e53a` at tree `5a51f923b`;
      `boundary-order-deviation: null`.
    - _Criterion:_ `Success Criteria > Member 2 — companion-conservation > 1`;
      _criterion-digest:_ `sha256:98846b690d102eb5d69a5ed681b4193e5d583884e1842fd4d5436d1691f88896`;
      _State:_ `[x]`; _Evidence:_ source snapshots and predecessor planning share the open artifact matcher plus
      paired-spec admission and same-name cohort exclusion; real-Git relocation coverage retires matching
      companions while preserving supplemental files under the rider guard.
    - _Criterion:_ `Success Criteria > Member 2 — companion-conservation > 2`;
      _criterion-digest:_ `sha256:35e00cf0b05bd20fc9abfa13c7fdc336de4380397e10c8f7dc1362240894fc85`;
      _State:_ `[x]`; _Evidence:_ source-kind preflight scans all non-meta retirement companions, the task scanner
      emits one preamble plus H2 phases, and map/repository integration coverage carries those identities through
      revalidation, execute, and base advancement.
    - _Criterion:_ `Success Criteria > Member 2 — companion-conservation > 3`;
      _criterion-digest:_ `sha256:4a758416480b2b068efa18cf331427a42f6dfe3753c99190cecaa1c2210953e3`;
      _State:_ `[x]`; _Evidence:_ notes targets create role-closed `provisional-notes` contributors from pinned
      bytes; composition, conservation, and result-report tests prove their immutable path, role, disposition, and
      plan order through production repository composition.
    - _Criterion:_ `Success Criteria > Member 2 — companion-conservation > 4`;
      _criterion-digest:_ `sha256:64fdedfe097650a3713b878704ff1f62c803caf0ea1db47a78ef6087dd81571c`;
      _State:_ `[x]`; _Evidence:_ the source-kind matrix excludes Active companions and extraction decode rejects
      every non-retained started-Planning companion allocation; thinning and finish integration coverage preserve
      retained companion bytes and modes in preview, apply, and repeat paths.
    - _Criterion:_ `Success Criteria > Member 2 — companion-conservation > 5`;
      _criterion-digest:_ `sha256:71ed0e45ee17a4203e8d0e5918721ba55ce1dfae3b135966400f11fe84e25a7f`;
      _State:_ `[x]`; _Evidence:_ finish classifies the original authenticated group against current pinned raw-tree
      objects before authority selection; the add/remove/move/rename/byte/mode matrix and real-Git blob-to-symlink
      test return `source:source-units`, while planned partial thinning remains admissible.
    - _Criterion:_ `Success Criteria > Member 2 — companion-conservation > 6`;
      _criterion-digest:_ `sha256:c749a64d5ea178f82463be4ffa55018e8d78911d11d8d9851ba9229c185e1091`;
      _State:_ `[x]`; _Evidence:_ repository composition distinguishes absent, invalid-encoding, and title-less
      notes sources at member/path loci, and conservation's closed artifact roles reject member-meta allocations
      before target projection.
    - _Criterion:_ `Success Criteria > Member 2 — companion-conservation > 7`;
      _criterion-digest:_ `sha256:23208fc9bb14378538217a5da238ddf095ecaf9148c0b6e57de7c99f1617055c`;
      _State:_ `[x]`; _Evidence:_ adapter assertions retain the three-tier Git pathspec and existing tree-read and
      branch-spawn budgets; identity tests keep the machine field set closed while companion values participate only
      through the canonical `sourceUnits` preimage.
    - _Criterion:_ `Success Criteria > Member 2 — companion-conservation > 8`;
      _criterion-digest:_ `sha256:52813599beab26e9491181f8b2c4d1a9eb121fc2a8d2deb3e43dfbc5033f1f95`;
      _State:_ `[x]`; _Evidence:_ the copy-based `decompose-transform-integrity` rehearsal allocates or drops the
      real spec, task phases, and substantive notes sections, executes their complete retirement, and requires no
      repair after the transition.
    - _Criterion:_ `Success Criteria > Member 2 — companion-conservation > 9`;
      _criterion-digest:_ `sha256:1bcefe4394831d9d8eb90c13a6e4a4c2fa6992394886d1d9747d421169d94561`;
      _State:_ `[x]`; _Evidence:_ byte-parity contract coverage requires both workflow copies to retain the Member 1
      refusal envelope while publishing retirement companion allocation, retained-only extraction, task/notes
      scaffold pruning, and manual transfer for other companions.
    - _Adversarial companion:_ not run during the approved deferred-review batch; one fresh Heavy pass remains
      available at delivery review.
    - _Summary:_ nine `[x]`, zero `[~]`, zero `[ ]`; terminal Success Criteria markers remain unchanged.

## **Phase 3:** Authored external edges and the operator workflow

**Delivery member:** 3 — `external-dependency-authoring`

_Purpose:_ Let the cut map express dependencies outside the cut through existing records and projections, then make
the complete conservation and refusal contract usable without reading implementation source.

_Design decisions:_ First carry a live result-base target from the authored map through conservation, the meta
mutator, and staged ROADMAP output. Completed-target and base-advancement cases extend that working slice; workflow
prose follows the executable contract.

### `[x]` **3.1 Land a live-result-base external edge from cut map to staged ROADMAP**

- _Goal:_ One authored dependency to a live work unit outside the cut flows from the closed map through conservation
  into the recipient meta and its derived ROADMAP entry.

    - `[x]` **3.1.a Add the closed external-edge authoring slot**
        - Starter maps now expose one whole-field `externalEdges` author slot, while completed maps require an
          explicit, strict, canonically ordered unique edge list whose sources are declared dependency-capable
          destinations. External authoring changes the cut-map digest without widening machine or edge identities.

    - `[x]` **3.1.b Validate a live external target and derive its dependency edit**
        - Conservation now resolves external targets against pinned result-base live slugs and emits disjoint,
          canonical `external` edits. It refuses redundant, retiring, unknown, and already-satisfied edges at their
          authored loci, and internal edges now span every live dependency-capable destination admitted by decode.

    - `[x]` **3.1.c Project the edge through existing meta and ROADMAP composers**
        - Repository planning now rebases source-bound dependency deltas onto each pinned result-base sequence,
          preserving unrelated changes and refusing pinned no-ops at the authored locus. The staged meta projection
          feeds the existing ROADMAP renderer for new members and existing homes.

- _Outcome:_ Live external authoring now spans the closed map, source-bound conservation, result-base delta
  projection, and staged ROADMAP rendering without widening plan identity or exact transform-delta authority.

### `[x]` **3.2 Admit completed and late-created targets without widening source authority**

- _Goal:_ External-target eligibility follows the pinned result base, including work that landed or appeared after
  the source fork, without changing source-bound conservation facts or preflight cost.

    - `[x]` **3.2.a Derive completed target slugs from the already-read result-base tree**
        - Added an exact completed-meta classifier backed by `identifyWorkUnitArtifactPath()` and applied it only to
          regular blobs in the already-read result-base tree. Completed blobs remain unparsed, and the older resilient
          filesystem and ref archive readers remain unchanged.

    - `[x]` **3.2.b Resolve the complete external-target eligibility matrix**
        - Conservation now admits separate pinned live and completed target sets plus the authenticated surviving
          extraction origin, while preserving retirement and redundancy refusal precedence. Completed prerequisites
          remain in recipient metadata and disappear from the ROADMAP's unsatisfied blockers.

    - `[x]` **3.2.c Prove the preflight authority and cost boundaries stay closed**
        - Boundary tests pin the three live preflight tiers, single local-ref scan, unchanged machine preimage,
          one full-tree read per repository role, enumerated-object-only hydration, and one advancement recomposition
          without completed pathspec or per-target reads.

- _Outcome:_ External-target eligibility now follows the pinned result-base tree without expanding preflight identity,
  source-bound conservation inputs, lifecycle metadata parsing, or repository-read cost.

### `[x]` **3.3 Preserve external edges through base-advancement recomposition**

- _Goal:_ A committed candidate remains authoritatively reproducible when its external prerequisite changes from live
  to completed before base advancement.

    - `[x]` **3.3.a Recompose against current live and completed eligibility**
        - Advancement now admits live-to-completed and late-created targets from its single current recomposition,
          refuses targets removed from every eligible set, and emits typed dependency-recipient drift evidence with
          cleanup and fresh-preflight guidance.

    - `[x]` **3.3.b Keep external edges outside transition-record and source-proof authority**
        - Dependency-bearing recipient paths come from the current validated plan, while their previous and current
          target sequences are compared before exact candidate-history authentication. External authoring remains
          outside the transition record, incoming dispositions, and machine preflight envelope.

    - `[x]` **3.3.c Exercise full-protection advancement with target lifecycle changes**
        - Real-Git coverage follows execute, candidate commit, target completion, base advancement, and merge commit;
          it proves the exact first-parent chain, one retained edge and transition record, one recomposition, and a
          no-mutation drift refusal before historical transform scans.

- _Outcome:_ Base advancement now distinguishes admissible target lifecycle movement from recipient version conflict,
  preserving append-only candidate history while refusing dependency drift before candidate mutation.

### `[x]` **3.4 Publish external-edge authoring and close cumulative workflow parity**

- _Goal:_ An agent can author external edges from the shipped workflow, and the final workflow still carries every
  refusal and companion instruction published by the preceding delivery members.

    - `[x]` **3.4.a Update the package-source `decompose-work-unit.md` contract**
        - The shipped map-authoring step now routes declared-destination dependencies through `internalEdges`, origin
          prerequisite redistribution through `outgoingDispositions`, and outside-cut prerequisites through
          `externalEdges`, without duplicating CLI validation.

    - `[x]` **3.4.b Synchronize and verify the project-instance workflow**
        - Applied the same targeted edit to the project workflow and extended the byte-parity contract to retain the
          cumulative provisional-scaffold, manual-transfer, and typed refusal-envelope instructions.

- _Outcome:_ Both workflow copies now publish the external-edge authoring boundary and remain byte-identical across
  the cumulative decomposition contract.

### `[x]` **3.5 Exercise external-edge refusals and workflow agreement end to end**

- _Goal:_ The external-edge feature and its authoring guidance agree across schema, pinned-tree composition,
  advancement, public command output, and both workflow copies.

    - `[x]` **3.5.a Complete the external-edge schema and conservation matrix**
        - Consolidated both source kinds across live/late-created, completed, redundant, unknown, retiring-origin,
          self, unchanged, and extraction-origin outcomes; pinned distinct identities, canonical edit/refusal order,
          and every declared dependency-capable internal endpoint pairing while retaining non-work-unit refusals.

    - `[x]` **3.5.b Exercise retirement and extraction repository lifecycles against real Git state**
        - Exercised pinned-base rebasing and pre-write no-op refusal, target creation/completion, member and
          existing-home writes, ROADMAP projection, and unchanged transition/source facts in real repositories.
          Extraction now carries origin prerequisites and overlapping incoming/external mutations through result
          landing plus finish preview/apply/repeat while preserving every companion byte.

    - `[x]` **3.5.c Verify command output and workflow contract agreement**
        - The built CLI now proves an external-target refusal's exact authored locus, correction text, and bare
          `arc ...` retry argv without mutation; workflow-contract coverage binds that envelope handling to both
          byte-equal workflow copies while remaining instruction-presence rather than agent-behavior evidence.

    - `[x]` **3.5.d Run the Phase 3 code-and-methodology checkpoint**
        - Closed the composed code-and-methodology checkpoint across full Markdown, ARC, TypeScript, shell, and test
          gates after targeted schema, conservation, repository, E2E, and workflow-contract verification.

- _Outcome:_ External-edge authoring now has one aligned proof from closed schema through pinned repository
  composition, lifecycle advancement and extraction finish, typed command refusal, and byte-equal shipped guidance.

### `[x]` **3.6 Close external-edge delivery** — validate criteria at member scope

- _Goal:_ Member 3 has independently reviewable evidence that authored external edges survive target lifecycle
  changes and remain operable from the shipped workflow.

- _Outcome:_ Member 3 criteria report.
    - _Criteria slice:_ `Success Criteria > Member 3 — external-dependency-authoring`.
    - _Span:_ bounded diff `3dd845308..93357a45c`; cumulative reachability `93357a45c` at tree `9b596b5c7`;
      `boundary-order-deviation: null`.
    - _Criterion:_ `Success Criteria > Member 3 — external-dependency-authoring > 1`;
      _criterion-digest:_ `sha256:4c43c443f7dae7cafeb75d2f5dc6d2108e2f4d129ef07638fdfc11604e95727b`;
      _State:_ `[x]`; _Evidence:_ the strict completed-map schema requires unique canonical external pairs from
      dependency-capable destinations, while conservation's source-kind matrix proves new-member and existing-home
      acceptance, all target refusals, self-edge redundancy precedence, canonical first refusal, and every admitted
      internal endpoint pairing.
    - _Criterion:_ `Success Criteria > Member 3 — external-dependency-authoring > 2`;
      _criterion-digest:_ `sha256:09a267ddd19093ddde25fc1229603cbdd62b834dd5c72e33c982d36bce062002`;
      _State:_ `[x]`; _Evidence:_ repository composition passes separate live and exact completed slug sets from the
      pinned result-base tree, and conservation adds only the authenticated extraction origin; real-Git coverage
      admits late-created targets and live-to-completed movement through one advancement recomposition.
    - _Criterion:_ `Success Criteria > Member 3 — external-dependency-authoring > 3`;
      _criterion-digest:_ `sha256:3b0cb73951222ac18684e86e23aeeea88cd047153d9d8b367f89532909f964f1`;
      _State:_ `[x]`; _Evidence:_ production extraction coverage lands an origin prerequisite through execute,
      preview, apply, and repeat with byte-identical companions and no transition record; the overlapping-recipient
      case proves finish validates the complete composed dependency mutation, while adapter assertions exclude
      completed-specific path and object reads.
    - _Criterion:_ `Success Criteria > Member 3 — external-dependency-authoring > 4`;
      _criterion-digest:_ `sha256:289ecef5efa71eed9e51550a7eb75ec57de68ae9f7451e7e09836f013132eab2`;
      _State:_ `[x]`; _Evidence:_ dependency projection applies each validated add/remove delta through
      `setMetaBulletFields()` onto the pinned recipient sequence before rendering the projected ROADMAP; member and
      existing-home tests prove unrelated divergence is preserved and pinned no-ops refuse before mutation.
    - _Criterion:_ `Success Criteria > Member 3 — external-dependency-authoring > 5`;
      _criterion-digest:_ `sha256:97273bd2853c745cdc22ef6b4df4e2528501983aa71d2faddc8b39b672fddfee`;
      _State:_ `[x]`; _Evidence:_ `completedWorkUnitMetaSlug()` delegates exact placement and artifact recognition to
      `identifyWorkUnitArtifactPath()`; focused path-shape tests cover eligible metadata and reject cohort, companion,
      malformed, live, and backlog paths while the pre-existing loose filesystem and ref readers remain separate.
    - _Criterion:_ `Success Criteria > Member 3 — external-dependency-authoring > 6`;
      _criterion-digest:_ `sha256:5d4bbcefbe4f6cbc5474b63fb6d54abf29f8cd90e57fb52ceb863b7f4531b2e0`;
      _State:_ `[x]`; _Evidence:_ advancement performs one current recomposition, compares every dependency recipient
      between previous and current bases, and refuses drift with expected/actual targets before exact-history reads;
      real-Git coverage proves zero history authentication and an unchanged clean candidate on refusal.
    - _Criterion:_ `Success Criteria > Member 3 — external-dependency-authoring > 7`;
      _criterion-digest:_ `sha256:e9111e606c6d5e4f086f5c9ac8d1132477c75bb007ed93de37dd92c6fabb928f`;
      _State:_ `[x]`; _Evidence:_ both workflow copies are byte-identical at
      `sha256:05c9f161c429dca68673de8a58e5812ddee732193f75a643726eac0fa60cef87`; contract coverage requires external,
      internal, and outgoing routing plus cumulative companion, scaffold, manual-transfer, and typed-refusal guidance,
      and the built CLI proves the reported external-edge locus and corrective invocation without mutation.
    - _Adversarial companion:_ not run during the approved deferred-review batch; one fresh Heavy pass remains
      available at delivery review.
    - _Summary:_ seven `[x]`, zero `[~]`, zero `[ ]`; terminal Success Criteria markers remain unchanged.

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
