# Task List: review-chunking

- **Design:** `spec-review-chunking.md`

---

## **Phase 1:** Boundary doctrine and controlled vocabulary

_Purpose:_ Establish the review-unit contract and precise terminology before runtime selection or review-pipeline
consumers depend on them.

### `[x]` **1.1 Author and distribute the `review-chunking` method**

- _Goal:_ Reviewers have one shipped, configurable method that defines well-formed review chunks and preserves both
  local defect detection and whole-concern coherence.

    - `[x]` **1.1.a Write the standalone review doctrine in the package source**
        - Added the configurable `review-chunking` method with dependency closure, test/prose cohesion,
          seed→judgment→guard derivation, union coverage, seam review, explicit external referents, and a
          delivery-neutral downstream seam.

    - `[x]` **1.1.b Register, declare, and project the configurable method**
        - Registered the method for installation and Configurable updates, declared the integration workflow trigger,
          projected the exact project copy and manifest hash, and updated dependency/inventory totals to 125
          self-hosting files.

    - `[x]` **1.1.c Prove installation, update, trigger, and two-copy behavior**
        - Extended unit, integration, update, E2E, and framework-sync inventories; the live trigger audit and focused
          installation/update suites prove declaration coverage, classification, fresh install, idempotence, and
          package/instance equality.

- _Outcome:_ ARC now ships one review-only boundary doctrine that is immediately usable by explicit callers while
  preserving the existing review roles and leaving automatic lifecycle consumption to its owning work unit.

### `[ ]` **1.2 Define the `chunk` vocabulary and delivery-neutral seam**

- _Goal:_ ARC uses `chunk` unambiguously as the review unit while reserving compatible `deliverable` and `stack`
  concepts for the downstream delivery sibling.

    - `[ ]` **1.2.a Add the controlled-vocabulary entry**
        - Update package-source `reference/briefs/AGENT-BRIEF.ARC.md` with the review-only definition, its distinction
          from a Work Unit, review increment, and task-plan phase, and the reserved delivery seam.
        - Define `deliverable ⊂ chunk` and `stack` only as a vocabulary reservation; make the entry complete for
          projects that never adopt separate merge topology.

    - `[ ]` **1.2.b Project the vocabulary without package drift**
        - Apply the same Framework change to `.arc/reference/briefs/AGENT-BRIEF.ARC.md`.
        - Reconcile the adjacent Work Unit, Cohort, and review-increment glosses so the vocabulary section does not
          mint `chunk` or reserve `deliverable` while retaining conflicting generic partitives beside it.

## **Phase 2:** Exact-target chunking selection

_Purpose:_ Turn project thresholds into a deterministic, quiet-by-default recommendation while leaving boundary
drawing and the whole-vs-chunked decision to judgment.

_Design decisions:_ Two independent non-negative integer settings use `0` as the disabled sentinel and OR semantics
at equality; a validated canonical review target supplies `diffBaseSha..headSha`; the CLI computes exact-target
facts and precomposes the advisory through the common review-command envelope.

### `[ ]` **2.1 Model chunking thresholds and exact-target diff facts**

- _Goal:_ A pure, typed policy decision can distinguish disabled, below-threshold, and consideration-worthy targets
  from validated project settings and one exact Git range.

- _Approach:_ Extend the canonical change-fact substrate rather than creating a second target parser; keep numeric
  diff statistics distinct from the existing status/path record where their Git framing differs.

    Build `test-first` (one behavior at a time):

    - `[ ]` **2.1.a Add validated non-negative threshold settings**
        - Add `review.chunking_threshold_lines` and `review.chunking_threshold_files` to `ConfigSettings`,
          `status-reader.ts` defaults, required `ConfigSettings` fixtures, the package/project `validate-config.sh`
          copies, and known-key validation.
        - Add a pure command-boundary parser that converts the raw config strings to typed thresholds. Accept
          config-normalized unsigned base-10 safe integers including `0`; reject signs, fractions, embedded
          whitespace, overflow, and malformed values with typed diagnostics. Preserve the existing parser behavior
          that normalizes legitimate outer whitespace and surrounding YAML quotes.
        - Generalize the shell validator's commit-specific unsigned-safe-integer helper and use the shared domain
          with key-specific minima rather than duplicating numeric validation.
        - Keep both settings out of the session-init subset: the review resolver reads them only at the review
          operation that consumes them.

    - `[ ]` **2.1.b Resolve byte-safe exact-target line and file counts**
        - Add `packages/arc-framework/src/lib/change-stats.ts` beside the canonical change-fact substrate. Consume
          validated Git object IDs from `ReviewTarget`, measure `diffBaseSha..headSha` with `--numstat -z` and the
          same rename/copy flags as change facts, and use the existing injectable raw Git boundary.
        - Parse normal records, rename/copy records with their blank path sentinel and two NUL-delimited endpoints,
          and binary `-` / `-` records without decoding path bytes. Count additions plus deletions for text entries
          and one logical file per diff record; binary entries contribute only to the file count.
        - Treat empty output as known `0` lines / `0` files. Return explicit unknown/failure for malformed framing,
          missing objects, invalid ranges, unsafe numeric tokens, or aggregate overflow rather than treating an
          unmeasured target as small.

    - `[ ]` **2.1.c Resolve the advisory disposition and rendered message**
        - Add a pure policy module under `src/scripts/review-gate/policy/` that consumes validated thresholds and
          optional exact-target metrics and returns `disabled`, `below-threshold`, or `consider-chunks`.
        - Short-circuit `disabled` before Git measurement when both thresholds are `0`; emit no measured facts or
          advisory. Carry a missing/unreadable-config warning with the documented `0` / `0` fallback, but reject an
          explicitly malformed threshold.
        - Report measured lines/files, configured thresholds, and every tripped dimension; equality trips, and
          either enabled dimension is sufficient.
        - Precompose the user-facing advisory for `consider-chunks`; keep boundary drawing, source selection, and
          review invocation outside the resolver.

### `[ ]` **2.2 Expose the typed `arc review chunking` resolver**

- _Goal:_ Workflows and explicit callers can obtain one machine-readable recommendation for an immutable target
  without reimplementing config or Git comparisons in prose.

- _Note:_ Execution precondition: before starting this task, verify the branch contains
  `review-surface-binding`'s registered common review-command envelope. If it does not, stop and reconcile onto a
  mainline containing that increment; do not create a parallel public review protocol.

    Build `test-first` (one behavior at a time):

    - `[ ]` **2.2.a Define the versioned command request and result**
        - Add a strict versioned request schema carrying the canonical `ReviewTarget`; validate its derived
          `targetId` with the existing target contract, then use `diffBaseSha..headSha` as the only measured range.
        - Extend the common `ReviewCommandModeSchema`, review-command envelope, and review-domain schema registry
          with `review-chunking-resolve` variants: disabled / `none` without metrics or advisory; below-threshold /
          `continue-review` with metrics; and consider-chunks / `select-review-scope` with metrics, every tripped
          dimension, and precomposed advisory.
        - Keep the command read-only. It must not draw chunks, select or invoke a review source, mutate review state,
          or create satisfying evidence.
        - Use the common typed error envelope and nonzero exit for invalid input/target identity, explicitly invalid
          thresholds, missing Git objects, malformed numeric stats, and unsafe totals. A missing or unreadable config
          returns disabled from the documented defaults with a diagnostic and successful exit.

    - `[ ]` **2.2.b Wire the command through the existing review CLI composition**
        - Add `handleReviewChunkingResolve` beside `handleReviewFrontlineResolve` in
          `packages/arc-framework/src/handlers/review.ts`, reusing `resolveArcRoot`, stdin/file JSON handling,
          `readConfigSettings`, canonical target validation, and the injectable raw Git boundary.
        - Register `arc review chunking resolve <file | ->` in `src/cli.ts` with the existing JSON-in/JSON-out
          command convention.
        - Keep measurement and policy in library modules; the handler remains a thin composition root.

    - `[ ]` **2.2.c Prove the public command boundary**
        - Unit-test config normalization/errors; normal, rename/copy, binary, empty, malformed, and overflow stat
          framing; the disabled/single-axis/dual-axis/equality policy matrix; target validation; and every registered
          success/error envelope.
        - Integration-test handler composition against real Git/config fixtures, including zero-threshold no-Git
          short-circuit, binary-only changes, missing objects, malformed config, and a second canonical target after
          `HEAD` moves.
        - Keep E2E coverage at the public transport boundary: file and stdin input, one success and one error,
          exactly one JSON envelope on stdout, and no prompt or review-provider side effect.

### `[ ]` **2.3 Ship neutral defaults and configure self-hosting policy**

- _Goal:_ Fresh projects retain whole-target behavior without friction while this repository explicitly dogfoods
  the thresholds derived from its own review experience.

    - `[ ]` **2.3.a Publish the off-by-default settings**
        - Add both flat keys with documented `0` defaults to package-source `arc-config.yml`; mirror the schema
          comments into the project Configurable copy while preserving its values.
        - Explain that the values are attention tripwires, not chunk-size caps or universal provider limits, and
          that either can be enabled independently in both copies of
          `reference/strategies/arc/strategy-configurability-architecture.md`.
        - Update config-format/status fixtures and reconcile the review-setting surfaces with the live
          `review.frontline_sources` rename rather than restoring singular-source assumptions.

    - `[ ]` **2.3.b Configure the project-specific thresholds**
        - Set `.arc/system/arc-config.yml` to `review.chunking_threshold_lines: 5000` and
          `review.chunking_threshold_files: 150` while retaining `0` / `0` in the package source.
        - Preserve the distinction between this local policy and CodeRabbit's plan-dependent capability; do not add
          a universal provider/file-limit constant.

    - `[ ]` **2.3.c Verify installation neutrality and intentional project divergence**
        - Prove package-source defaults and fresh installs resolve `0` / `0`; prove update adds the keys while
          preserving an existing project's values; and verify config status renders both raw settings.
        - Verify the self-host project resolves `5000` / `150` through the public config/chunking command surfaces
          without making package tests depend on the repository's project-owned values.
        - Verify package/project sync treats the Configurable project values as intentional overrides rather than
          blind-copy drift.
        - Confirm disabled defaults invoke no Git measurement and produce no advisory text, approval stop, or change
          in review-source behavior.

## **Phase 3:** Review-pipeline attachment

_Purpose:_ Define how the existing frontline and standard-review roles consume a selected chunked scope without
adding a review stage, approval stop, or merge-topology change.

_Design decisions:_ Chunking is an intra-role evaluation plan: one curated-scope-capable local carrier
orchestration, fresh bounded evaluator contexts for each chunk and seam, and one non-author aggregate whole-target
result. Locality alone is insufficient; hosted and whole-target-only local carriers remain ineligible, and
automatic lifecycle wiring stays with `review-gate-right-sizing`.

### `[ ]` **3.1 Attach chunking to frontline review**

- _Goal:_ An oversized frontline target can be reviewed through bounded closure-respecting scopes without gaining
  evidence authority or another review role.

    - `[ ]` **3.1.a Reference `review-chunking` from the frontline contract**
        - Add a short role-specific subsection to package-source `system/methods/frontline-review.md` that references
          `review-chunking` rather than re-authoring its closure, coverage, and seam doctrine.
        - Require one curated-scope-capable local carrier orchestration to retain the canonical target and coverage
          state while running a fresh bounded evaluator context for each closure chunk and the seam. Each context
          receives only its current scope, explicit external/pre-existing annotations, and the complete effective
          rubric.
        - Require a fresh non-author aggregate context to consume the partition/coverage facts and structured
          chunk/seam reports, inspect only targeted source loci as needed, and emit one aggregate whole-target
          result without loading every chunk body wholesale.
        - State that the aggregate invocation is one frontline pass and that no partial chunk report completes it;
          evaluator-call count does not affect pass accounting.
        - Preserve the exclusion of author conclusions and the method's advisory-only authority boundary.

    - `[ ]` **3.1.b Project and verify the frontline attachment**
        - Sync `.arc/system/methods/frontline-review.md` and update related-method metadata only where the corpus
          convention uses it.
        - Extend `__tests__/integration/pr-open-extensions.test.ts` and
          `__tests__/integration/framework-sync.test.ts` for the reference-only composition, complete-rubric,
          curated-scope capability, bounded-context isolation, non-author aggregation, and one-logical-pass contract.

### `[ ]` **3.2 Attach chunking to local standard review**

- _Goal:_ A curated-scope-capable local standard-review carrier can review bounded chunks while one complete
  aggregate result remains eligible for ordinary human-disposition-anchored completion.

- _Note:_ Task 1.1's execution precondition ensures the coordinated rename is present; use `standard-review` here
  with no compatibility alias.

    - `[ ]` **3.2.a Define the local-carrier completeness rule**
        - Add a short role-specific subsection to the package-source standard-review method that references
          `review-chunking` rather than duplicating its boundary mechanics.
        - Make chunking legal only within one curated-scope-capable local carrier orchestration that retains target
          identity and coverage state outside the evaluator contexts, runs fresh bounded contexts across every chunk
          and the seam, applies the complete rubric to each scope, and emits one non-author aggregate whole-target
          result from structured reports and targeted source inspection.
        - Extend package-source `adversarial-review.md` with the bounded chunk-series carrier mode referenced by
          `review-chunking`. Keep it distinct from Novel partitioned fan-out: chunk evaluations are sequential
          attention isolation inside one logical pass, use a stable evaluator profile/rubric, and have no standalone
          authority.
        - Keep hosted and whole-target-only local carriers ineligible for chunked mode; preserve evaluator
          separation, exact-target identity, and the ordinary completion authority boundary.
        - Count the aggregate invocation as one standard-review pass; no partial chunk report or evaluator call can
          settle the obligation.

    - `[ ]` **3.2.b Project and verify the standard-review attachment**
        - Sync both method edits to the `.arc/` instance and extend
          `__tests__/integration/pr-open-extensions.test.ts` and `__tests__/integration/framework-sync.test.ts` for
          complete union/seam coverage, curated-scope capability, bounded-context isolation, non-author aggregate
          output, one-pass accounting, and no partial result.
        - Do not add per-chunk receipts, durable scope identity, independently authoritative per-chunk results, or
          new review-gate runtime state; those remain deferred.

## **Phase 4:** Controlled-vocabulary reconciliation

_Purpose:_ Remove generic uses that would collide with the new load-bearing `chunk` term across maintained package
and project guidance.

_Design decisions:_ The stale public `docs/` tree is excluded entirely; its terminology will be reconciled in one
dedicated publication sweep rather than through private-development patching.

### `[ ]` **4.1 Reconcile the shipped terminology surface**

- _Goal:_ Packaged ARC content reserves `chunk` for the review unit without altering the underlying Work Unit,
  review-increment, routing-batch, or delivery meanings.

- **Additional Context:** `notes-review-chunking.md` § Terminology cascade — execution recipe

    - `[ ]` **4.1.a Classify the authoritative package-source matches**
        - Run a fresh case-insensitive lexical-family search for `chunk` across
          `packages/arc-framework/arc/`—including derivatives such as `chunked`—and classify each match as the new
          review unit, a generic ARC work partitive requiring replacement, or a legitimate non-ARC domain usage.
        - Include templates and vocabulary-adjacent definitions; treat the live grep as authoritative rather than
          copying a planning-time locus list.
        - Do not search or edit `docs/`; it is outside this work unit's maintained terminology surface.

    - `[ ]` **4.1.b Rewrite conflicting shipped usages by their actual concept**
        - Replace generic usages with `work unit`, `review increment`, `batch`, `group`, or another existing precise
          noun as appropriate.
        - Reconcile delivery-split wording in work-organization and inbox-routing surfaces without redefining review
          chunks or forward-referencing unshipped topology.

    - `[ ]` **4.1.c Project every managed counterpart safely**
        - Apply Framework changes package → `.arc/`; apply Configurable changes separately in both copies with
          targeted edits that preserve project overrides.
        - Treat package templates by their rendered classification: project Framework counterparts receive the
          rendered terminology change, while Scaffolded project documents are independent project content handled
          in Task 4.2 rather than projected from their package template.
        - Run focused package-sync checks and table formatting for touched tables.

### `[ ]` **4.2 Reconcile project-only terminology and prove closure**

- _Goal:_ Internal project guidance and historical decision records no longer use generic ARC work language that
  conflicts with the controlled term, while unrelated technical uses remain intact.

    - `[ ]` **4.2.a Classify project-only matches by audience and semantic domain**
        - Re-run the same case-insensitive lexical-family search over `.arc/reference/` and `.arc/system/`,
          separating managed counterparts, internal ADR/PRD guidance, historical quotations or research, and
          unrelated context-window/data chunking.
        - Preserve legitimate non-review technical meanings rather than forcing a repository-global synonym.

    - `[ ]` **4.2.b Reconcile internal ARC terminology**
        - Update project-owned ADRs, project guidance, and scaffolded project documents where `chunk` is merely a
          generic partitive for a Work Unit, review increment, or routing batch.
        - Limit accepted-ADR edits to exact, meaning-preserving terminology corrections under the ADR correction
          rule; do not reframe a decision, append amendment provenance, or add author-history notes to living
          guidance.

    - `[ ]` **4.2.c Prove controlled-vocabulary closure**
        - Re-run the lexical-family search over the maintained package and project roots and account for every
          surviving match as the defined review unit, a legitimate non-review technical usage, or verbatim
          historical/research evidence whose preservation is required for record accuracy.
        - Confirm no surviving living-guidance match uses `chunk` as a generic Work Unit, review increment, routing
          batch, or delivery partitive.
        - Check package/instance equality for Framework files and inspect expected differences for Configurable
          files; leave no hand-maintained allowlist that can stale.

## **Phase 5:** First-application evidence

_Purpose:_ Test the doctrine on comparable bounded review scopes and preserve directional evidence from its first
application.

_Design decisions:_ The comparison is directional `n=1` evidence, not a proof or merge gate. Two independent local
carrier runs use the same evaluator configuration and identical bounded chunk contexts→raw snapshot→bounded
seam→non-author aggregate protocol; only the boundary map changes. Both arms are evaluation-only and cannot satisfy
review obligations or authorize target mutation.

### `[ ]` **5.1 Prepare the paired comparison and coverage model**

- _Goal:_ The baseline and treatment scopes isolate boundary quality as the changed variable and cover the selected
  change set completely.

- **Additional Context:** `analysis-review-chunking.md` § First-run field evidence

    - `[ ]` **5.1.a Select one held-out oversized change set**
        - Choose a target not used to author the doctrine and validate/record its canonical `ReviewTarget`, including
          `targetId`, `diffBaseSha`, `headSha`, changed-hunk set, content mix, and why it warrants bounded review.
        - Keep the target fixed across both arms; a moved head invalidates the setup and requires regeneration.

    - `[ ]` **5.1.b Draw comparable baseline and treatment scopes**
        - Seed both arms from the same commit/path evidence and keep chunk count and size reasonably comparable.
        - Draw baseline scopes naively by path; adjust treatment scopes for consumer→declaration dependency closure
          and test cohesion, explicitly annotating only truly external/pre-existing referents.
        - Start the paired-comparison section in `analysis-review-chunking.md` with the canonical target, hunk
          inventory, both partition maps, per-chunk line/file/hunk metrics, and evaluator configuration.

    - `[ ]` **5.1.c Verify union coverage and define the identical arm protocol**
        - Compute `change-set − union(chunks)` for both arms and close or surface every uncovered hunk.
        - Identify each arm's cross-chunk contracts, shared abstractions, naming, and duplication surface for its
          seam review.
        - Fix the protocol for both arms: a separate fresh bounded context reviews each chunk, another bounded
          context reviews the arm's seam, each captures structured raw findings before triage or aggregation, and a
          fresh non-author aggregate context consumes the partition/coverage facts plus structured reports to emit
          one whole-target result.

### `[ ]` **5.2 Run and record the controlled-evaluator comparison**

- _Goal:_ The first application yields comparable raw evidence about whether closure-respecting boundaries reduce
  declaration-split false blocker findings.

    - `[ ]` **5.2.a Run two controlled local carrier runs**
        - Run one independent carrier orchestration per arm with the same evaluator profile/capability and effective
          review rubric; within each arm, isolate every chunk and seam in its own fresh bounded context and use a
          fresh non-author aggregate context.
        - Exclude author conclusions and keep each arm blind to the other arm's map, triage, and findings until both
          raw snapshots and aggregate results are complete.

    - `[ ]` **5.2.b Classify the pre-triage finding sets**
        - Preserve every structured raw per-chunk finding in `analysis-review-chunking.md` before classification,
          then classify declaration-split false `blocker` findings against full source, type-check, definitions,
          references, and tests.
        - Record evaluator configuration, scope sizes, aggregate results, and any rate-limit or tool degradation
          that constrains interpretation.
        - Do not mutate the held-out target. Hand verified actionable findings to its owner through the ordinary
          review-disposition path; the analysis records the experiment but is not the work item's home.

    - `[ ]` **5.2.c Record the paired result**
        - Complete the forward-readable section in `analysis-review-chunking.md` with both arm summaries, the raw
          false-blocker delta, caveats, and one outcome: `supportive`, `contrary`, or `inconclusive`.
        - Treat a strict reduction as supportive; treatment at or above a nonzero baseline as contrary; and zero/zero
          or a compromised comparison as inconclusive. Any treatment declaration-split false blocker independently
          requires doctrine review.
        - On contrary evidence, stop and route a doctrine correction before work-unit completion. On inconclusive
          evidence, stop for direction on another target or an explicitly accepted inconclusive close; neither
          outcome may be presented as supportive, and do not select repeated targets merely to obtain support.

### `[ ]` **5.3 Validate the doc-heavy analog and seam review**

- _Goal:_ Chunking preserves reference coherence and cross-chunk maintainability on prose-heavy work as well as
  code-shaped work.

    - `[ ]` **5.3.a Exercise the document-reference analog**
        - On the maintained doc-heavy portion or a separate fixed maintained prose target outside `docs/`, draw
          scopes that keep term, method, heading, and artifact definitions with their consumers.
        - Verify that no raw undefined/dangling finding was manufactured solely by a definition living in another
          chunk.

    - `[ ]` **5.3.b Validate the seam reviews at focused attention**
        - Confirm both arms followed the same pre-seam snapshot protocol, then check the treatment's cross-chunk
          interface use plus duplication, inconsistent abstraction, and naming drift without re-reading every chunk
          body as one diluted whole diff.
        - Record substantive seam findings and their source-grounded disposition separately from local chunk
          findings.

    - `[ ]` **5.3.c Close the evidence record**
        - Confirm complete hunk coverage, both arm-specific seam reviews, the doc-heavy result, and the
          controlled-evaluator paired result are all represented in `analysis-review-chunking.md`.
        - Keep the evidence explicitly directional and avoid claiming statistical proof or automated enforcement.

## **Phase 6:** Verification

### `[ ]` **6.1 Complete verification** — load and follow `verify-work-unit.md`

- _Goal:_ The landed doctrine, selection resolver, review attachments, vocabulary cascade, distribution behavior,
  and first-application evidence satisfy the finalized design as one coherent work unit.

---

## Success Criteria

- `[ ]` `review-chunking.md` ships as a configurable method, installs and updates correctly, and matches its `.arc/`
  projection.
- `[ ]` The method defines consumer→declaration dependency closure, test cohesion, judgment-led derivation,
  coverage, prose generality, holistic design review, and seam-chunk review.
- `[ ]` `chunk` is defined once as the review unit with the reserved delivery seam, and generic ARC work partitives
  no longer collide with it.
- `[ ]` `review.chunking_threshold_lines` and `review.chunking_threshold_files` ship as validated runtime settings
  with neutral `0` defaults and OR-at-equality semantics.
- `[ ]` The exact-target resolver reports measured lines/files, every tripped dimension, a typed disposition, and
  precomposed advisory text; a moved head forms a new canonical target that resolves independently.
- `[ ]` The project instance configures `5000` changed lines and `150` changed files without changing package
  defaults.
- `[ ]` Frontline and local standard review can use complete curated chunk series within one carrier orchestration,
  fresh bounded evaluator contexts, and one non-author aggregate whole-target result without adding review roles,
  approval stops, or changing one-PR merge topology.
- `[ ]` One aggregate chunked invocation counts as one logical review pass; hosted and whole-target-only local
  carriers are ineligible, while provider hard limits remain independent source-capability facts.
- `[ ]` Hosted review remains whole-PR, and no per-chunk receipt, scope identity, or review-gate runtime model is
  introduced.
- `[ ]` The coverage check reports no uncovered hunk, and every cross-chunk surface is represented in a seam chunk.
- `[ ]` Under two independent carrier runs with the same evaluator configuration and identical arm protocol, the
  comparison records a valid `supportive`, `contrary`, or explicitly accepted `inconclusive` outcome from raw
  pre-seam, pre-triage output; support requires strictly fewer treatment false blockers, contrary evidence has a
  resolved doctrine correction, and inconclusive evidence carries no supportive claim.
- `[ ]` The doc-heavy analog produces no false undefined/dangling finding caused solely by a definition in another
  chunk.
- `[ ]` The first-application evidence is recorded in `analysis-review-chunking.md` as directional `n=1` evidence
  with its caveats and without review-obligation or mutation authority.
- `[ ]` All quality gates pass (tests, linting, type checking).
- `[ ]` Ready for integration.
