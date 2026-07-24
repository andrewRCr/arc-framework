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

### `[x]` **1.2 Define the `chunk` vocabulary and delivery-neutral seam**

- _Goal:_ ARC uses `chunk` unambiguously as the review unit while reserving compatible `deliverable` and `stack`
  concepts for the downstream delivery sibling.

    - `[x]` **1.2.a Add the controlled-vocabulary entry**
        - Defined `chunk` as the contract-cohesive review unit, distinguished it from Work Units, review increments,
          phases, and merge units, and reserved `deliverable ⊂ chunk` plus `stack` without requiring delivery
          topology.

    - `[x]` **1.2.b Project the vocabulary without package drift**
        - Projected the exact Framework copy and replaced adjacent generic `chunk` and `deliverable` partitives so
          the Work Unit, Cohort, and review-increment definitions remain semantically distinct.

- _Outcome:_ The always-loaded vocabulary now assigns `chunk`, `deliverable`, and `stack` one compatible meaning
  each while remaining complete for projects that keep one merge boundary.

## **Phase 2:** Exact-target chunking selection

_Purpose:_ Turn project thresholds into a deterministic, quiet-by-default recommendation while leaving boundary
drawing and the whole-vs-chunked decision to judgment.

_Design decisions:_ Two independent non-negative integer settings use `0` as the disabled sentinel and OR semantics
at equality; a validated canonical review target supplies `diffBaseSha..headSha`; the CLI computes exact-target
facts and precomposes the advisory through the common review-command envelope.

### `[x]` **2.1 Model chunking thresholds and exact-target diff facts**

- _Goal:_ A pure, typed policy decision can distinguish disabled, below-threshold, and consideration-worthy targets
  from validated project settings and one exact Git range.

    - `[x]` **2.1.a Add validated non-negative threshold settings**
        - Added full-status-only threshold settings, safe unsigned-integer parsing, shared shell validation, and
          complete typed fixture coverage while retaining configuration normalization at the command boundary.

    - `[x]` **2.1.b Resolve byte-safe exact-target line and file counts**
        - Added exact-range `--numstat -z` measurement with byte-safe normal, rename/copy, binary, empty, malformed,
          unsafe-token, missing-object, invalid-range, and aggregate-overflow handling.

    - `[x]` **2.1.c Resolve the advisory disposition and rendered message**
        - Added the pure disabled/below-threshold/consider-chunks policy with equality and OR tripwires, complete
          tripped-dimension reporting, and a precomposed consideration advisory.

- _Outcome:_ The policy foundation now fails closed on unmeasured targets while keeping disabled configuration
  Git-free and session initialization free of review-only settings.

### `[x]` **2.2 Expose the typed `arc review chunking` resolver**

- _Goal:_ Workflows and explicit callers can obtain one machine-readable recommendation for an immutable target
  without reimplementing config or Git comparisons in prose.

    - `[x]` **2.2.a Define the versioned command request and result**
        - Registered a strict canonical-target request plus disabled, below-threshold, consider-chunks, and shared
          typed-error envelopes without adding mutation or review-source behavior.

    - `[x]` **2.2.b Wire the command through the existing review CLI composition**
        - Added the thin handler and `arc review chunking resolve <file | ->` composition over config reading,
          identity validation, byte-preserving Git, measurement, and pure policy.

    - `[x]` **2.2.c Prove the public command boundary**
        - Covered schema variants and errors, handler emission, real Git/config behavior, binary and moving-HEAD
          targets, and built-CLI file/stdin transport with exactly one JSON envelope.

- _Outcome:_ The shared review protocol now exposes a read-only exact-target attention tripwire that fails closed
  without drawing review boundaries or invoking a reviewer.

### `[x]` **2.3 Ship neutral defaults and configure self-hosting policy**

- _Goal:_ Fresh projects retain whole-target behavior without friction while this repository explicitly dogfoods
  the thresholds derived from its own review experience.

    - `[x]` **2.3.a Publish the off-by-default settings**
        - Added documented `0` / `0` package defaults and strategy guidance defining independent advisory tripwires
          without provider-limit or chunk-cap semantics.

    - `[x]` **2.3.b Configure the project-specific thresholds**
        - Set the self-host project to 5,000 changed lines or 150 changed files while retaining neutral package
          defaults and the existing ordered frontline-source configuration.

    - `[x]` **2.3.c Verify installation neutrality and intentional project divergence**
        - Covered fresh install, status, update migration, project-value preservation, Configurable divergence, and
          disabled no-measurement behavior; exercised the self-host values through both public commands.

- _Outcome:_ New installations remain whole-target and Git-free by default, while this repository dogfoods an
  explicit local policy that survives framework updates without conflating reviewer capability with attention.

## **Phase 3:** Review-pipeline attachment

_Purpose:_ Define how the existing frontline and standard-review roles consume a selected chunked scope without
adding a review stage, approval stop, or merge-topology change.

_Design decisions:_ Chunking is an intra-role evaluation plan: one curated-scope-capable local carrier
orchestration, fresh bounded evaluator contexts for each chunk and seam, and one non-author aggregate whole-target
result. Locality alone is insufficient; hosted and whole-target-only local carriers remain ineligible, and
automatic lifecycle wiring stays with `review-gate-right-sizing`.

### `[x]` **3.1 Attach chunking to frontline review**

- _Goal:_ An oversized frontline target can be reviewed through bounded closure-respecting scopes without gaining
  evidence authority or another review role.

    - `[x]` **3.1.a Reference `review-chunking` from the frontline contract**
        - Added a reference-only carrier mode that retains exact-target coverage outside fresh bounded chunk/seam
          contexts and produces one non-author aggregate whole-target advisory result.

    - `[x]` **3.1.b Project and verify the frontline attachment**
        - Projected the method and dependency metadata, then covered complete-rubric isolation, targeted aggregation,
          one-pass accounting, and the prohibition on partial or satisfying chunk results.

- _Outcome:_ Frontline review can isolate attention across cohesive scopes without changing its advisory authority,
  exact-target coverage, or logical pass count.

### `[x]` **3.2 Attach chunking to local standard review**

- _Goal:_ A curated-scope-capable local standard-review carrier can review bounded chunks while one complete
  aggregate result remains eligible for ordinary human-disposition-anchored completion.

    - `[x]` **3.2.a Define the local-carrier completeness rule**
        - Added reference-only standard-review and adversarial-review carrier modes that isolate each cohesive scope
          in fresh bounded context, retain exact-target coverage outside those contexts, and aggregate one complete
          non-author result without changing ordinary completion authority.

    - `[x]` **3.2.b Project and verify the standard-review attachment**
        - Projected both methods and dependency metadata, then covered carrier eligibility, complete-rubric
          chunk/seam isolation, targeted aggregation, one-pass accounting, and the absence of partial authority or
          new durable review state.

- _Outcome:_ One curated local carrier can isolate attention sequentially while preserving the standard review's
  exact-target evidence boundary; hosted and whole-target-only carriers remain ineligible.

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
