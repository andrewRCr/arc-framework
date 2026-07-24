# Task List: Lifecycle Transform Substrate Hardening

- **Design:** `spec-decomposition-hardening.md`

---

## **Phase 1:** Authoritative transform truth and deterministic projections

_Purpose:_ Establish the shared source-of-truth and evidence boundaries before any transform or lifecycle ceremony
consumes them.

### `[x]` **1.1 Resolve lifecycle-transform inventories from composed project truth**

- _Goal:_ Every transform plans against the same cross-worktree and remote-aware lifecycle records as the project
  readiness view, while an unreachable remote degrades to reachable truth instead of blocking the operation.

- **Additional Context:** `notes-decomposition-hardening.md` § Implementation & coordination seams

    - `[x]` **1.1.a Thread the existing composed result through transform drivers**
        - Extended `ComposedLifecycleIndexResult` with selected/current-tree records, complete normalized semantic
          comparison, exact current-checkout `writablePath`, and closed tree-only/reachable/degraded read quality.

    - `[x]` **1.1.b Replace the remaining checkout-local transform reads**
        - Routed decompose, abandon, resume, and rename through one remote-aware composition; transform subjects now
          require exact write authority, while failed bounded refresh degrades to reachable tree/local truth.

    - `[x]` **1.1.c Prove cross-worktree, remote-only, and degraded inventory behavior**
        - Covered linked-worktree and remote-only inventory, divergent and remote-only subject refusal, explicit
          unreachable quality, stale-live refresh, offline rename, and unchanged tree-only resolution.

- _Outcome:_ Lifecycle transforms now plan from the readiness view's composed truth without granting filesystem
  authority to ref-qualified or divergent records; remote loss reduces completeness but does not erase reachable
  evidence.

### `[x]` **1.2 Carry degraded-read reachability and no-regression evidence through retirement finalization**

- _Goal:_ Preparation and finalization can prove which composed inventory was reachable, reject regression within
  that set, and detect a newly enlarged reachable set before the transform becomes authoritative.

    - `[x]` **1.2.a Bind composed-read quality into preparation and receipts**
        - Added exact v2 preparation/receipt envelopes with required `inventoryRead`, updated all producers and
          candidate IDs, and retained byte-exact v1 decode/finalize identity.

    - `[x]` **1.2.b Enforce match/no-regression finalization**
        - Finalization re-derives composed source and edge inventories, preserves prepare-time quality, and rejects
          missing or enlarged membership, authored repoints, and reachable-to-degraded regression.

    - `[x]` **1.2.c Cover interrupted, degraded, and enlarged-set outcomes**
        - Covered degraded stability, quality regression, newly visible members, restart preservation, staged
          residue refusal, exact v1/v2 round trips, and unknown-version closure.

- _Outcome:_ Retirement evidence now distinguishes incomplete reachability from tree-only reads and can prove that
  the final authoritative transition did not silently weaken or enlarge the prepared inventory.

### `[x]` **1.3 Relocate retirement records into the canonical internal namespace**

- _Goal:_ Retirement evidence is written beneath the established system-internal namespace, existing evidence
  remains usable, and no operation can recreate a root-level `.arc/.internal/`.

    - `[x]` **1.3.a Move the store contract and retain historical-read compatibility**
        - Made the system-internal namespace writer-only, unified canonical/current plus legacy/history reads, and
          added path-free global enumeration with exact deduplication, version conflict, and corruption outcomes.

    - `[x]` **1.3.b Migrate current receipts and in-flight v1 preparation**
        - Moved all tracked receipts byte-for-byte and added authenticated relocation/finalization for an exact
          staged legacy v1 preparation without changing its receipt or preparation identity.

    - `[x]` **1.3.c Guard the namespace and prove compatibility**
        - The commit validator now permits only authenticated migration removal from the legacy namespace; codec,
          Git-mode, duplicate/conflict, corrupt-neighbor, symlink, process-restart, and real-hook cases fail closed.

- _Outcome:_ Current writers and tracked evidence use only `.arc/system/.internal/retirement-receipts/`, while
  historical v1 authority remains usable and one corrupt reachable entry invalidates the complete namespace before
  any subject projection.

### `[x]` **1.4 Render lifecycle projections from the staged tracked-index state**

- _Goal:_ A lifecycle ceremony renders `ROADMAP.md` from the state it is committing, so live or remote remnants of
  the retiring identity cannot reintroduce a phantom row.

    - `[x]` **1.4.a Stage the complete transition before index-backed composition**
        - Reordered executor and direct-retirement flows so every tracked mutation and final meta write is staged
          before the shared index-backed renderer runs, with receipt recording and rollback boundaries preserved.

    - `[x]` **1.4.b Bind the superseded source identity into prospective ROADMAP composition**
        - Added exact `{ slug, branch }` supersession to prospective composition and threaded it through the shared
          advisory adapter; rename now uses that path while unrelated oracle candidates remain visible.

    - `[x]` **1.4.c Prove deterministic regen across retirement verbs**
        - Covered staged removal over stale refs, renamed and decomposed replacement rows, index/worktree
          divergence, normal transition parity, post-stage ordering, and advisory-only renderer failures.

- _Outcome:_ Lifecycle ROADMAP output now represents the complete tracked-index candidate being committed; a
  retiring local or remote identity cannot reappear after staged rename, decompose, abandon, park, or resume state.

## **Phase 2:** Receipt-driven dependent reconciliation

_Purpose:_ Turn retirement receipts into the shared, version-checked mechanism that repairs a dependent from its
own branch and fails safely at lifecycle boundaries.

### `[x]` **2.1 Add subject-keyed retirement discovery and dependent-specific dispositions**

- _Goal:_ A dependent can ask what happened to one edge target and receive its own validated, storage-agnostic
  reconcile instruction without knowing receipt paths or transition-specific record shapes.

    - `[x]` **2.1.a Define the receipt-discovery query and ambiguity outcomes**
        - Added a storage-independent query port with the six closed resolution states and path-free Git adapter;
          it authenticates the complete reachable namespace before projecting one work-unit subject.

    - `[x]` **2.1.b Project receipts into one closed reconcile disposition set**
        - Projected decompose replace/drop, rename retarget, and abandon removal with exact dependent mappings and
          retained `unknown | tree-only | reachable | degraded` provenance; park remains non-actionable.

    - `[x]` **2.1.c Extend retirement codecs without weakening the trust boundary**
        - Bound decompose subject/allocation identity and allocation digests, rejected invalid v2 quality domains,
          and changed work-unit transition writers to record their composed inventory quality.

    - `[x]` **2.1.d Prove discovery across store and schema states**
        - Covered all resolution/disposition arms, global corruption and symlink refusal, degraded/v1 evidence,
          adapter independence, and real-Git branch reachability before and after receipt introduction merges.

- _Outcome:_ Dependents can now resolve only retirement evidence committed into their own history through a closed
  path-free contract; provenance remains actionable without weakening global namespace authentication.

### `[x]` **2.2 Generalize dependency discharge into a version-checked current-WU reconcile**

- _Goal:_ A work unit repairs its own `Depends On` list from retirement evidence, preserving ordinary satisfied-edge
  discharge while refusing ambiguous or stale rewrites.

    - `[x]` **2.2.a Separate reconcile planning from mutation**
        - Evolved the discharge core into one typed planner with dependency, tracked-reference, and advisory
          components; it canonicalizes edges and follows evidence-qualified rename chains to live or terminal ends.

    - `[x]` **2.2.b Apply an exact dependent-owned plan**
        - Added content-digest guarded apply with bounded writes/staging plus `arc wu reconcile [slug] --json` and
          explicit `--apply`; branch ownership and every declared path are validated before mutation.

    - `[x]` **2.2.c Cover the complete disposition and conflict matrix**
        - Covered multi-target replacement, authored/abandon drops, rename chains and terminal dispositions, live
          and parked edges, every evidence conflict, missing targets, cycles, self-edges, stale content, and CLI apply.

- _Outcome:_ Dependency discharge and retirement repair now share one current-WU operation whose read-only plan is
  the exact version carried into a bounded apply; unsafe evidence or stale ownership cannot partially rewrite a gate.

### `[x]` **2.3 Apply pending reconciles at dependent-owned write ceremonies**

- _Goal:_ Activation, review entry, and resume repair only the dependent's own branch, with refusal-capable planning
  ordered before phase mutation and resume's base-pointer and WU-branch commits kept distinct.

    - `[x]` **2.3.a Preflight activation and integration entry through the shared reconcile**
        - Split the shared operation into exact prepare/apply seams and wired both activation and initial
          integration to validate their source phase, preflight conflicts, and apply the carried plan before
          transition mutation; stale content returns a typed rerun path and the old discharge side effect is gone.

    - `[x]` **2.3.b Reconcile after both resume arms reattach the WU branch**
        - Updated both workflow copies so the base-side pointer removal lands first, then spawn and `--here` enter
          the preserved branch for the same bounded reconcile; applied edits get a separate WU-branch ceremony
          commit, clean is invisible, and conflict stops without rewriting the landed base commit.

    - `[x]` **2.3.c Prove branch isolation and ceremony atomicity**
        - Covered conflict and stale refusal before lifecycle mutation, exact-plan ordering on activate/integrate,
          both resume placements and commit boundaries, clean zero-write behavior, bounded owned-path staging, and
          real-CLI refusal to touch a work unit owned by another branch.

- _Outcome:_ Every automatic tracked reconcile now runs within the dependent's own write ceremony: lifecycle entry
  carries one version-checked plan, while resume preserves distinct base-pointer and dependent-meta commits.

### `[x]` **2.4 Detect pending reconciles at session entry and fail closed at integration**

- _Goal:_ Read-only session entry makes pending repairs visible, while integration refuses a dependent whose own
  tracked reconcile cannot complete and transforms surface mid-integration coordination hazards.

    - `[x]` **2.4.a Add a read-only pending-reconcile session probe**
        - Added a typed single-active-WU envelope slot with CLI-owned clean/pending/conflict guidance, shared planner
          facts, strict schema presence, real status-handler boundaries, and no write or staging capability.

    - `[x]` **2.4.b Render the session-entry advisory in both framework copies**
        - Updated the package source and rendered project workflow to dispatch only on the precomputed
          `recommendedAction` and render `recommendedPromptText` verbatim without applying tracked edits.

    - `[x]` **2.4.c Gate integration on the exact reconcile result**
        - Step 13 now applies the exact current-WU reconcile after base convergence and before lifecycle and
          exact-head authorization; conflicts stop unmerged, while applied corrections commit, push, and invalidate
          every prior evidence checkpoint. Explicit archived-candidate authority is limited to its matching WU branch.

    - `[x]` **2.4.d Surface a transform whose dependent is already integrating**
        - Added stable composed-truth advisories before decompose, rename, and abandon mutation; integrating
          dependents are withheld from decompose edge writes and the rename reference sweep even when locally writable.

    - `[x]` **2.4.e Prove read/write and authority boundaries**
        - Covered read-only pending/conflict session behavior, late-arriving evidence, archived-candidate apply,
          multi-hop planner closure, integration ordering and fail-closed restart, and zero mutation of integrating
          dependents across unit, integration-contract, and real-CLI boundaries.

- _Outcome:_ Session entry and final integration now consume the same current-WU reconcile contract at distinct
  read/write boundaries, while origin transforms preserve integrating dependents as coordination-only participants.

### `[x]` **2.5 Route every lifecycle transform through the shared reconcile contract**

- _Goal:_ Decompose, rename, and abandon publish enough shared evidence for every dependent to reconcile, while park
  shares inventory and projection behavior without inventing an incoming-edge action.

    - `[x]` **2.5.a Partition shared-visible and branch-private dependents**
        - Added one stable composed-truth partition for shared-visible, branch-private, and coordination-only
          dependents. Decompose writes only exact `writablePath` entries; rename excludes observed divergent or
          integrating metas from its broad current-tree sweep.

    - `[x]` **2.5.b Bring every verb onto the common result model**
        - Verified producer receipts project authored decompose replace/drop, rename retarget, and abandon removal
          through the shared query, while park evidence remains deliberately non-actionable for incoming edges.

    - `[x]` **2.5.c Prove transition parity and no foreign-branch writes**
        - Covered mixed shared/private decompose and rename paths, divergent same-slug exclusion, bounded
          direct-driver paths, producer-to-query parity, deterministic replay, discoverable abandon removal, and
          park's zero-action projection.

- _Outcome:_ Every retiring transform now combines semantic visibility with only exact current-checkout mutation
  authority; private dependents receive durable receipt evidence without an origin-side write.

## **Phase 3:** First-class cohortless decomposition

_Purpose:_ Make a flat-sibling split a closed, validated placement arm without conflating cohort placement with the
origin-disposition shape.

### `[x]` **3.1 Extend the cut-map contract with the `cohortless` placement**

- _Goal:_ The untrusted cut-map boundary distinguishes flat siblings from both a newly minted cohort and lateral
  fan-out under an existing parent.

    - `[x]` **3.1.a Add `cohortless` to the placement vocabulary**
        - Added `cohortless` to the closed `ParentPosition` vocabulary while retaining the existing schema version
          and orthogonal transform-shape contract.

    - `[x]` **3.1.b Enforce cohort/placement combinations**
        - Cohort-backed positions now require a cohort, `cohortless` and `at-cap` forbid one, and cohortless maps
          reject both coordination destinations and shared source ownership at the untrusted boundary.

    - `[x]` **3.1.c Prove the closed parse matrix**
        - Added parser coverage for symmetric and extraction cohortless maps, every cohort-presence combination,
          forbidden shared coordination, retained cohort-backed behavior, and the existing closed-value/version
          boundary.

- _Outcome:_ The versioned cut-map parser now admits flat siblings as a distinct placement while rejecting every
  representation that would imply an ownerless cohort surface.

### `[x]` **3.2 Project flat sibling paths through scaffold and retirement**

- _Goal:_ A cohortless cut creates complete flat sibling WU skeletons whose only relationship is their authored
  dependency graph, with one path authority from preparation through finalization and no cohort directory,
  membership, draft header, or coordination document.

    - `[x]` **3.2.a Resolve one typed member placement**
        - Added a pure placement resolver covering declared cohorts, origin-cohort lateral fan-out, and the empty
          planned coordinate, with explicit refusals for every missing cohort authority.

    - `[x]` **3.2.b Thread placement through every path consumer**
        - Scaffolding and retirement preparation now consume the same typed placement for member paths, allowed
          paths, destination locators, and final targets; flat projections render `Cohort: [none]` and omit the
          draft cohort header.

    - `[x]` **3.2.c Preserve per-member ownership and dependencies**
        - Member projection continues to inherit origin metadata and per-member Class while deriving dependencies
          only from the declared external allocation and internal cut edges.

    - `[x]` **3.2.d Prove filesystem, content, and retirement outcomes**
        - Added focused resolver/scaffold tests plus a real-repository prepared/finalized roadmap-tooling-class
          split proving exact flat paths, no cohort artifact, complete member metadata, and authored dependencies.

- _Outcome:_ One typed placement now governs cohort-backed, at-cap, and cohortless filesystem behavior from
  initial scaffold through receipt-backed finalization.

### `[x]` **3.3 Align cohort-fit guidance and prove the full decomposition-shape matrix**

- _Goal:_ Planning can emit the new placement value unambiguously, and every parent-position/non-symmetric arm
  remains executable under the shared transform substrate.

    - `[x]` **3.3.a Update the canonical `assess-cohort-fit` contract**
        - The package-source method and project copy now return controlled placement fields and constrain
          `cohortless` to destination-owned conservation.

    - `[x]` **3.3.b Align the transform workflow with the typed placement**
        - The CLI now returns typed coordination disposition plus precomposed placement language; the synced
          workflow dispatches authoring, verification, paths, and result prose on that projection.

    - `[x]` **3.3.c Confirm every placement arm**
        - Resolver, scaffold, command-output, and real-repository coverage exercise top-level cohort, sub-cohort,
          at-cap lateral fan-out, and flat cohortless placement.

    - `[x]` **3.3.d Confirm every non-symmetric transform shape**
        - The compatibility matrix covers Active extraction, backlog-stub source, and heterogeneous homes,
          including in-cohort and cohortless combinations alongside the symmetric prepared/finalized path.

- _Outcome:_ Planning guidance, the untrusted contract, CLI result, workflow dispatch, and executable shape matrix
  now share one controlled placement vocabulary with no prose-side path derivation.

## **Phase 4:** Husk-consistent transform terminals

_Purpose:_ Separate pre-commit transform recording from authoritative cleanup, then route landed retirement and
rename residue through the existing evidence-backed teardown / sweep substrate.

### `[x]` **4.1 Return one retirement lifecycle result and defer cleanup until landing**

- _Goal:_ Every retirement transform reports cleanup and successor state consistently without granting destructive
  authority or discarding session context before its receipt and tracked result are authoritative.

    - `[x]` **4.1.a Define the shared retirement lifecycle result**
        - Added a discriminated result for receipt-backed and extraction authority, independent cleanup legs, and
          typed successor readiness with CLI-owned remedy argv/text.

    - `[x]` **4.1.b Keep pre-commit transform terminals non-destructive**
        - Finalized decompose and abandon now report pending cleanup; extraction reports structural
          non-applicability. Abandon no longer deletes refs or closes the live per-WU workspace after recording.

    - `[x]` **4.1.c Factor the receipt-backed teardown planner**
        - Ordinary `arc teardown <slug>` now infers shipped versus receipt-backed cleanup from authoritative
          lifecycle state and reuses the existing teardown planner. `--force` remains an authority-neutral alias.

    - `[x]` **4.1.d Derive successor readiness from complete member dependencies**
        - Candidate derivation uses each member's complete projected dependency set. The shared projection emits one
          default-spawn remedy only for a unique authoritative candidate and never selects among several.

    - `[x]` **4.1.e Prove result and pre-landing invariants**
        - Added focused result, transform, teardown, handler, and integration coverage for authority discrimination,
          non-destructive recording, complete dependency derivation, and zero/one/many successor projections.

- _Outcome:_ Transform recording now yields one typed, non-actionable lifecycle account; destructive cleanup stays
  behind the existing receipt-backed teardown authority and successor actions remain gated on landed evidence.

### `[x]` **4.2 Defer spawned rename self-moves into an operational marker**

- _Goal:_ Rename invoked from its own spawned worktree completes identity changes without moving the live checkout,
  and records enough operational state for an outside-worktree move later.

    - `[x]` **4.2.a Resolve self-move as an unconditional defer**
        - `resolveRenameWorktreeMove()` now compares the current locus with the registered source path and returns a
          typed defer before the worktree mutator can invoke git or relocate the process.

    - `[x]` **4.2.b Persist the deferred move as an operational marker projection**
        - Valid renamed ownership markers now carry the closed old/new identity, branch, exact-`HEAD`, and path
          projection. Physical or already-completed moves clear it, and terminal husking supersedes it.

    - `[x]` **4.2.c Prove platform-independent rename behavior**
        - Focused mutator, marker, verb, integration, and real-CLI coverage proves unconditional self-defer,
          outside-worktree completion, replay clearing, complete identity legs, and no action from foreign markers.

- _Outcome:_ Spawned rename now completes identity reconciliation without moving its live checkout, and exposes a
  follow-up only when the exact deferred move was persisted on a valid ARC-owned marker.

### `[x]` **4.3 Surface landed transform and rename residue through session entry**

- _Goal:_ Session entry discovers cleanup that became safe after landing and offers exact shared actions without
  mutating tracked state, deleting automatically, or trusting branch-local evidence.

    - `[x]` **4.3.a Discover authoritative receipt-backed branched residue**
        - Added a cheap candidate-gated sweep that refreshes and reads `origin/<base>` under full protection, reads
          the local base under partial protection, and grants no action from branch-local or ambiguous evidence.

    - `[x]` **4.3.b Apply the shared cleanup plan after landing**
        - Projected ordinary receipt-backed `arc teardown <slug>` through the shared planner and added idempotent
          per-WU workspace closure only after authoritative teardown succeeds.

    - `[x]` **4.3.c Project `renameMovePending` as a distinct remedy**
        - Validated ownership, branch, exact `HEAD`, source path, unique registration, and target vacancy before
          emitting typed outside-worktree `git worktree move` argv and text; stale projections grant no remedy.

    - `[x]` **4.3.d Wire typed envelope and workflow surfaces**
        - Extended the status schema, fixtures, package template, probe contract, and rendered project workflow to
          dispatch only on CLI classifications and precomposed teardown, successor, and move actions.

- _Outcome:_ Session entry now discovers landed cleanup and rename path lag through one read-only typed sweep,
  preserving ordinary resume latency while routing destructive work through existing evidence-backed verbs.

## **Phase 5:** Reference conservation and cross-verb acceptance

_Purpose:_ Reconcile every mechanically-owned reference, surface judgment-owned residue, and prove that the shared
substrate behaves consistently across verbs, worktrees, and user state.

### `[x]` **5.1 Complete structured and self-title rename rewrites across lifecycle tiers**

- _Goal:_ Rename rewrites every mechanically one-to-one tracked reference in the live lifecycle tiers and leaves
  historical or adopter-facing content untouched.

    - `[x]` **5.1.a Generalize WU artifact self-title rewriting**
        - Added a closed basename/H1 registry for metadata, drafts, canonical spec forms, tasks, notes, research,
          and analysis; only the first exact identity H1 and exact backticked `--plan` anchor rewrite.

    - `[x]` **5.1.b Preserve existing structured reference rewrites**
        - Composed self-reference edits into the existing deterministic plan without changing exact dependency,
          artifact-code-span, cohort-member, meta, or broad companion relocation behavior.

    - `[x]` **5.1.c Prove tier and reference-kind boundaries**
        - Covered every registered title form, later/mismatched/unknown titles, independent layout and relocation
          scopes, lifecycle-tier containment, structured formatting preservation, and idempotent replay.

- _Outcome:_ Rename now conserves identity across the full closed self-title set, including research and analysis
  companions, without widening automatic heading edits or narrowing the existing artifact-set matcher.

### `[x]` **5.2 Surface ambiguous prose and dangling branch-private references**

- _Goal:_ Ambiguous slug mentions and references to a decomposed origin become actionable advisories, while
  one-to-one branch-private references reconcile only from the owning branch.

    - `[x]` **5.2.a Build a bounded advisory reference scanner**
        - Added path/line/context findings over exact ARC slug tokens, excluding structured code spans and returning
          typed narrative or dangling-reference dispositions without prose mutation.

    - `[x]` **5.2.b Discover reference transitions from current-WU history**
        - Projected authenticated reachable receipts independently of dependency edges and composed only unique,
          acyclic rename chains; referenced ambiguous or cyclic subjects refuse mechanical edits.

    - `[x]` **5.2.c Distinguish rename and decompose outcomes**
        - Unique renames rewrite exact backticked artifact references while leaving narrative mentions advisory;
          decompose and removal receipts surface dangling artifact references without selecting a replacement.

    - `[x]` **5.2.d Reconcile private tracked references from their own flow**
        - Extended the shared current-WU reconcile plan, CLI, session slot, and lifecycle callers with receipt-derived
          tracked edits, typed advisories/conflicts, CLI-owned argv, complete artifact guards, and bounded staging.

    - `[x]` **5.2.e Prove discovery, token, and branch-isolation boundaries**
        - Covered reference-only discovery and apply, chain composition and refusal, slug-alphabet boundaries,
          structured-span exclusion, dangling decompose references, all-or-nothing stale guards, read-only status,
          and foreign-worktree byte isolation through unit and real-CLI tests.

- _Outcome:_ Current-WU history now drives one guarded dependency/reference reconciliation transaction: deterministic
  structured repairs can apply from the owning checkout while ambiguous narrative and removed-origin references
  remain explicit, typed author decisions.

### `[x]` **5.3 Reconcile managed user references under the notes write discipline**

- _Goal:_ Session entry can repair an authoritative renamed `WU_Target` without turning a read-only status probe
  into a mutator, hiding unsaved disk drift, or touching sibling WU workspaces.

    - `[x]` **5.3.a Plan structured and advisory user-state reconciles**
        - Added protection-aware-base transition discovery and exact managed Work Unit `WU_Target` planning;
          optional placement suffixes survive while global memory and current-WU notes remain advisory-only.

    - `[x]` **5.3.b Add the dedicated user-reference apply verb**
        - Added `arc user reconcile-references --apply` through semantic user-surface paths, the per-identity notes
          lock, post-lock re-read, and atomic disk write without advancing the notes ref or materialized baseline.

    - `[x]` **5.3.c Integrate the reconcile into session entry**
        - Added the read-only typed session projection and CLI-owned dispatch; real-CLI coverage proves exact managed
          retargeting, truthful disk drift, advisory exclusions, protection authority, and recoverable failures.

- _Outcome:_ Identity-global rename repair is now a separate lock-serialized disk transaction: session entry may
  invoke it from authoritative base evidence while notes history, baseline truth, sibling workspaces, and
  judgment-owned references remain untouched.

### `[x]` **5.4 Close the cross-worktree and cross-verb transform acceptance matrix**

- _Goal:_ Real temporary-repository tests demonstrate that the four verbs share one authoritative, deterministic,
  self-healing substrate under the parallel conditions that exposed the original failures.

    - `[x]` **5.4.a Reproduce linked-worktree and remote-only dependents**
        - Confirmed composed inventory and receipt behavior across linked and remote-only branches, deferred
          dependent-owned reconciliation, foreign-worktree byte isolation, and pre-mutation subject refusal.

    - `[x]` **5.4.b Reproduce degraded and concurrent transitions**
        - Confirmed unreachable-oracle fallback, strict prepare/finalize authority, enlarged-inventory refusal,
          integrating-dependent advisories, and fail-closed unresolved reconciliation.

    - `[x]` **5.4.c Reproduce projection and terminal failures**
        - Confirmed index-bound readiness projection, spawned self-rename deferral, started-origin retirement,
          authority-gated cleanup and successor offers, and truthful post-land residue handling.

    - `[x]` **5.4.d Exercise reference and user-state conservation**
        - Confirmed artifact-title and token boundaries, reference-only and chained history, advisory exclusions,
          guarded current-WU apply, private replay, managed user retargeting, and baseline-visible disk drift.

    - `[x]` **5.4.e Confirm abandon, park, and every decomposition shape**
        - Confirmed abandon and park dispositions plus symmetric, cohortless, extraction, in-cohort extraction,
          existing-home, and backlog-source decomposition shapes.

- _Outcome:_ The shared lifecycle substrate now has one cross-verb acceptance set spanning real CLI, integration,
  and deterministic failure seams, with no transform-specific workaround required to satisfy the matrix.

## **Phase 6:** Verification

### `[ ]` **6.1 Complete verification** — load and follow `verify-work-unit.md`

## Success Criteria

- `[ ]` Every transform inventory includes linked-worktree and remote-only records when reachable, records a
  degraded read without refusing solely because the remote is unavailable, and grants filesystem authority only
  to an exactly agreeing current-tree candidate; rename specifically delegates a failed origin refresh to composed
  degradation, while remote-only/divergent subjects refuse. A schema-v2 decompose preparation preserves the exact
  prepare-time read through process restart and finalization.
- `[ ]` New retirement records write only under `.arc/system/.internal/retirement-receipts/`; migrated and
  historical v1 evidence remains valid, an in-flight legacy v1 preparation relocates and finalizes without identity
  or transition-patch drift, the tracked tree contains no root-level `.arc/.internal/`, only legacy removals pass
  commit validation, and any malformed or symlinked reachable record fails subject queries as global
  `namespace-corrupt`.
- `[ ]` Dependent-owned reconciliation applies replace, retarget, and drop dispositions at write ceremonies;
  unique acyclic rename chains resolve to their final live or terminal disposition, mapped
  degraded/v1-unknown evidence remains actionable with provenance, session entry is detect-only for tracked state,
  integration fails closed on conflict, and no foreign branch is mutated.
- `[ ]` A `cohortless` cut parses and scaffolds flat sibling WU skeletons with dependency-only relationships,
  canonical `Cohort: [none]` metas, and no cohort directory, document, or draft header.
- `[ ]` Retirement transforms perform no destructive cleanup before landing; once authoritative, session entry
  offers ordinary receipt-backed teardown, closes the per-WU workspace through that cleanup, and surfaces
  CLI-derived successor readiness without auto-starting or choosing among multiple candidates. Extraction carries
  a discriminated `not-applicable` authority/cleanup arm with no synthetic receipt fields.
- `[ ]` Spawned rename from inside the subject worktree never moves the live checkout and produces an exact,
  validated outside-worktree pending-move remedy that is mutually exclusive with terminal husk state.
- `[ ]` ROADMAP regeneration runs from the complete staged transition through the existing index renderer, excludes
  a retiring identity even while its old branch or remote ref remains live, and ignores divergent worktree content.
- `[ ]` Current-WU tracked references discover reachable retirement transitions without requiring a `Depends On`
  edge, compose only a unique acyclic rename chain, expose structured edits and advisory hits through the shared
  `arc wu reconcile` plan, guard and stage the complete current-WU path set, rewrite the closed basename/H1
  registry including `research-*` / `analysis-*`, and keep unknown companions, ambiguous prose,
  decomposed-origin references, slug-token near-misses, historical content, and adopter-facing content out of
  automatic rewrites.
- `[ ]` Only exact managed `USER-INBOX` Work Unit `WU_Target` fields reconcile automatically from
  protection-aware-base rename evidence; suffixes are preserved, sibling workspaces remain untouched, and the
  disk-only repair advances neither the canonical notes ref nor the materialized baseline.
- `[ ]` Abandon publishes a dependent drop, park inherits shared read/regen behavior without incoming-edge work, and
  all existing decomposition placements/shapes retain their behavior.
- `[ ]` All quality gates pass (tests, linting, type checking, and build).
- `[ ]` Ready for integration.
