# Task List: Decompose Extraction

- **Design:** `spec-decompose-extraction.md`

---

## **Phase 1:** Anchored additive extraction

_Purpose:_ Land complete new destinations from exact source evidence while preserving the surviving origin.

### `[x]` **1.1 Admit the surviving origin into preflight**

- _Goal:_ The transform's first command qualifies the origin extraction actually targets — a surviving work unit
  in `Planning` or `Active` state — instead of refusing it.

    - `[x]` **1.1.a Widen the source gate and machine envelope**
        - Both source gates admit exact-branch `Active` origins as `active-origin`; started Planning and backlog
          behavior remain distinct, and the shared profile inference covers every admitted design family.

    - `[x]` **1.1.b Prove admission and the inventory boundary**
        - Unit coverage proves Active and started-Planning admission through both gates, preserves the typed
          refusal for other states, validates the widened starter envelope, and excludes task-list bytes from
          source units.

### `[x]` **1.2 Enforce extraction allocation and placement rules**

- _Goal:_ Every new member owns real scope, every multi-member fan-out remains origin-addressable, and a
  surviving origin plus exactly one new member stays authorable.

    - `[x]` **1.2.a Extend the internal topology planner's placement arms**
        - The internal planner counts the surviving origin for grouped placement while preserving one-new-member
          direct placement, anchors that direct result on the origin, and excludes the origin from at-cap member
          bullets while retaining its provenance heading.

    - `[x]` **1.2.b Add the `extraction` authoring shape to the completed-map contract**
        - The decoder binds extraction cardinality, source-kind compatibility, retained-origin ownership, and
          origin-inclusive incoming dependency targets to the structural `extraction` discriminator while the
          retirement shapes retain their existing closed contract.

    - `[x]` **1.2.c Prove the decode matrix**
        - Schema, topology, and conservation coverage proves the widened placement and envelope matrix, substantive
          destination coverage, retained and extended origin edges, and unchanged retirement decoding alongside
          the existing identity, ordering, placeholder, and canonical-form checks.

### `[ ]` **1.3 Compose and land the additive result**

- _Goal:_ Extraction reuses the core exact-base substrate through a new additive-only composer entered by its own
  command mode, without retirement evidence.

    - `[ ]` **1.3.a Build the additive-only result composer**
        - Compose the reusable sub-planners — exact-base path-state planning, plan composition, dependency
          transforms, internal topology, allowed-path enforcement, and bounded preimage recovery — under a new
          top-level composer that plans no retirement delta, requires no predecessor meta, and writes no
          transition record; the retirement projection stays untouched.
        - Validate the retained origin under a surviving-origin conservation arm: the retirement flow's
          origin-as-destination and origin-reference refusals must not reach explicitly retained scope or a
          retained dependency edge, and a deliberately unchanged edge is not a refused no-op.
        - Mint no origin-suppressing transition overlay — make the shared plan contract's overlay slot optional
          rather than minting-and-discarding, so the surviving origin stays visible in the staged ROADMAP
          projection — and make the plan composition's retirement-coupled exclusive inputs optional rather than
          feeding degenerate claims into the allowed-path set.
        - Reuse the core's existing projection render seam; add no renderer contract or stamp variant.
        - Report retained-origin ownership, reasoned drops, and anchor orientation as typed result fields for
          the distribution interlock to surface.
        - Scaffold and stage only additive destination, dependency, cohort, and ROADMAP changes.

    - `[ ]` **1.3.b Expose the additive leg as `--extract`**
        - Add `--extract <cut-map>` as a mutually exclusive mode entering the additive composer.
        - Make `--execute` and `--advance-base` refuse an extraction-shaped map with typed reasons; the shape
          discriminator is structural, never inferred from disposition contents.

    - `[ ]` **1.3.c Prove source/result separation and pre-landing invisibility**
        - Use a real source-only branch and base-rooted result across the `draft`, `single-spec`, and
          `paired-spec` profiles, with and without the provisional-task contributor.
        - Assert the source ref/tree/worktree, committed implementation, retained-origin allocations, and
          unrelated material remain exact; assert a dependent of retained scope keeps its origin edge, and the
          staged ROADMAP projection keeps the surviving origin visible.
        - Add the dedicated invisibility test: prepared members — Planning-state backlog metas on the extraction
          candidate branch — are absent from checkout-rooted lifecycle resolution at the base and never surfaced
          by in-flight derivation, then become discoverable with dependency-derived ready or blocked state only
          after landing and base synchronization.

### `[ ]` **1.4 Keep incomplete topology uncommittable**

- _Goal:_ An incomplete cohort scaffold cannot commit — for extraction and for every producer of the shared
  scaffold.

    - `[ ]` **1.4.a Close the Purpose-floor sentinel gap, then prove refusal**
        - Teach the shared cohort-consistency check that the scaffold's exact `—` finalization sentinel is an
          unsatisfied Purpose floor — today the non-empty sentinel value passes the floor, so the incomplete
          scaffold commits cleanly in every flow that emits it.
        - Prove the sentinel-valued scaffold refuses the additive commit through the shared pre-commit check for
          the backlog-planned paths extraction scaffolds into, with no extraction-specific validator.

## **Phase 2:** Explicit preview/apply source finish

_Purpose:_ Remove approved source units only after their exact destinations are live on the integration base.

### `[ ]` **2.1 Add the typed finish mode**

- _Goal:_ Preview and mutation have one explicit command boundary.

    - `[ ]` **2.1.a Extend schema, options, and handler**
        - Add `--finish <cut-map>` as a mutually exclusive mode; preview by default and accept `--apply` only
          with `--finish`.
        - Return `previewed`, `finished`, `already-finished`, or one typed refusal.
        - _Note:_ Scoped to mode plumbing and the outcome contract; the preview payload's substance lands with
          the thinning planner in 2.2.b.

    - `[ ]` **2.1.b Prove landed destinations**
        - Require the exact surviving source branch/head and clean relevant paths.
        - Pin and reread the configured base; validate every transferred target's path, locator, bytes, mode,
          profile, and dependencies. Refuse branch-only, uncommitted, partial, changed, missing, or raced targets.

### `[ ]` **2.2 Plan byte-preserving thinning**

- _Goal:_ Approved removal cannot perturb an unrelated source byte.

    - `[ ]` **2.2.a Widen the scanner contract with byte ranges**
        - Record each scanned unit's original UTF-8 byte range on the content-unit contract — the scanner
          computes the offsets today and discards them. Additive; existing consumers are unchanged.

    - `[ ]` **2.2.b Build the pure thinning planner**
        - Consume the recorded byte ranges and return path before digests/modes, retained bytes or deletion, and
          removed locators.
        - Retain surviving-origin units; remove validated transfers and interlock-approved reasoned drops only.

    - `[ ]` **2.2.c Apply through bounded preimages**
        - Compare-and-swap every source preimage before the first write and restore only owned paths on failure.
        - Preserve BOM, multibyte text, CRLF, nested/adjacent blocks, whole-file behavior, empty results, and modes.

## **Phase 3:** Recovery, workflow, and doctrine

_Purpose:_ Retry safely without inventing semantic continuity, and land extraction as a first-class arm of
shipped doctrine.

### `[ ]` **3.1 Refresh exact identities only**

- _Goal:_ Machine refresh never guesses an authored ownership decision.

    - `[ ]` **3.1.a Carry uniquely stable choices**
        - Refresh machine digests only when the exact v3 source ID/locator still resolves uniquely and the
          destination remains valid.
        - Require reauthoring for hierarchy movement, repeated-heading ambiguity, added/removed units, or changed
          target/dependency state.

    - `[ ]` **3.1.b Regenerate lost scratch**
        - Let preflight recreate machine inventory, require human reauthoring, and detect exact already-finished
          state from source/base facts.
        - Leave a failed or stale additive attempt as an ARC-owned candidate that ordinary cleanup removes; add
          no discard verb, receipt, pending marker, ledger, fuzzy matcher, or transaction record.

### `[ ]` **3.2 Publish the extraction workflow and align doctrine**

- _Goal:_ One semantic interlock governs the additive result, a separate apply confirmation governs thinning, and
  the shipped doctrine surfaces state one extraction boundary.

    - `[ ]` **3.2.a Extend the authoritative decomposition workflow**
        - Dispatch on core-reported paths/profile, author retained/transferred ownership and stable anchor
          orientation, then commit/land additively.
        - Widen the workflow's sole semantic distribution interlock to surface the result report's
          retained-origin ownership, reasoned drops, and anchor orientation — CLI-reported typed fields, never
          agent re-derivation — alongside the distributed authority, dependency effects, and topology it reviews
          today.
        - Present finish preview/apply later as destructive mutation confirmation, not a second semantic
          distribution gate.

    - `[ ]` **3.2.b Align the three doctrine surfaces**
        - Amend the extraction exclusions in `assess-boundary-fit.md` (retained-origin foreclosure) and
          `decompose-work-unit.md`, and re-ground `strategy-work-organization.md` § Active-state decomposition,
          to the one shared statement: extraction is the supported active-origin arm, entered through its own
          command mode, with the core retirement transform unchanged.
        - _Note:_ These files ship — edit package source and sync per DEV-RULES.PROJECT § Package-Project Sync,
          and confirm each file's recipe disposition in both directions before relying on its ship status.

    - `[ ]` **3.2.c Preserve the no-record boundary**
        - Write no transition record of any kind; store no launch advice, publication packet, or selected
          successor.
        - Name the surviving active origin as the natural continuation in the interlock's human orientation; new
          leaves become ordinarily startable only through their landed base metas.

## **Phase 4:** Real additive-land-then-finish acceptance

_Purpose:_ Prove the cross-leg contract end to end on one real topology.

### `[ ]` **4.1 Prove the complete extraction boundary**

- _Goal:_ One real topology covers the cross-leg contract; focused tests own the mismatch matrix.

    - `[ ]` **4.1.a Exercise additive land and source finish**
        - Cover exact success, repeat finish, wrong branch, dirty source, base race, missing/changed target,
          partial prior thinning, and multi-file apply restoration.

    - `[ ]` **4.1.b Assert absence of terminal-transition state and mode fail-closure**
        - Verify no transition record, receipt residue, teardown authority, persistent coordinator, or automatic
          launch publication exists.
        - Verify `--execute` and `--advance-base` refuse an extraction-shaped map with their typed reasons, and a
          retirement-shaped map carrying a retained-by-origin disposition or an `Active`-origin envelope is
          rejected at decode.

## **Phase 5:** Verification

### `[ ]` **5.1 Complete verification** — load and follow `verify-work-unit.md`

---

## Success Criteria

- `[ ]` Extraction admits a surviving origin in started `Planning` or `Active` state and scans only its design
  artifacts; a backlog-stub envelope under the extraction shape is a typed decode mismatch.
- `[ ]` The surviving origin, committed implementation, and unrelated source work remain unchanged through the
  additive leg.
- `[ ]` Multi-member extraction cannot select `direct-member` placement and reports its durable logical anchor; a
  surviving origin plus exactly one new member remains valid under `direct-member`.
- `[ ]` Additive destinations land before the surviving source changes.
- `[ ]` Prepared members are invisible to lifecycle resolution and in-flight derivation before the additive
  result lands — asserted by test — and become discoverable, ready, or blocked only from the synchronized landed
  base.
- `[ ]` Every extracted member owns substantive allocated scope, enforced by the destination→allocation coverage
  check.
- `[ ]` A dependent of retained scope keeps its origin dependency edge; extraction never silently strips one.
- `[ ]` The staged ROADMAP projection keeps the surviving origin visible, through the core's existing render seam.
- `[ ]` Finish previews by default and applies only against reread live-base destination facts.
- `[ ]` Thinning preserves every unrelated byte and mode and restores bounded preimages on failure.
- `[ ]` Changed source, base race, partial apply, already-finished, missing target, and lost scratch are
  recoverable.
- `[ ]` No transition record, extraction ledger, fuzzy reconciliation, or automated launch claim is introduced;
  `--execute` and `--advance-base` refuse extraction-shaped maps with typed reasons, and retirement-shaped maps
  reject retained-by-origin dispositions and `Active`-origin envelopes at decode.
- `[ ]` An incomplete cohort scaffold cannot commit: the shared cohort-consistency check refuses the `—` sentinel
  Purpose floor.
- `[ ]` `assess-boundary-fit.md`, `decompose-work-unit.md`, and `strategy-work-organization.md` state the same
  extraction boundary.
- `[ ]` All quality gates pass (tests, linting, type checking).
- `[ ]` Ready for integration.
