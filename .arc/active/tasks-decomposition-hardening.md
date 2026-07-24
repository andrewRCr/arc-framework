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

### `[ ]` **2.2 Generalize dependency discharge into a version-checked current-WU reconcile**

- _Goal:_ A work unit repairs its own `Depends On` list from retirement evidence, preserving ordinary satisfied-edge
  discharge while refusing ambiguous or stale rewrites.

    - `[ ]` **2.2.a Separate reconcile planning from mutation**
        - Generalize `dischargeDepEdges()` into a pure plan over the current lifecycle index, the dependent's parsed
          edge list, and subject-query results. Preserve canonical order/deduplication and report replacements,
          drops, ordinary discharges, live edges, evidence quality, and conflicts as typed data.
        - Follow each unique acyclic chain of reachable `rename` receipts to a live slug or terminal non-rename
          receipt. Preserve per-hop evidence quality, apply a terminal decompose/abandon disposition when present,
          and refuse missing hops, ambiguity, cycles, version conflicts, or unmapped terminal evidence rather than
          writing an intermediate retired slug.
        - Evolve the existing `side-effects/discharge-dep-edges.ts` mechanism in place; lifecycle verbs, session
          detection, and the CLI adapter all consume this one current-WU planner/applier rather than introducing a
          sibling dependency- or reference-reconcile core. Give its closed result dependency, tracked-reference,
          and advisory components so Phase 5 can extend the same operation without replacing its public contract.

    - `[ ]` **2.2.b Apply an exact dependent-owned plan**
        - Apply the dependency component by rewriting the current WU's meta through `setMetaBulletFields()`, guarded
          by the exact version/content read that produced the plan. A stale edge list, missing replacement,
          ambiguous receipt, or self-dependency refuses before any write or stage.
        - Expose the shared operation as `arc wu reconcile [slug] --json`: read-only planning by default and an
          explicit `--apply` mode. Validate every plan-declared current-WU path before the first mutation, then
          write and stage only that bounded path set; advisory findings never mutate. Return closed
          `clean` / `pending` / `applied` / `conflict` results with CLI-owned advisory text.

    - `[ ]` **2.2.c Cover the complete disposition and conflict matrix**
        - Extend `packages/arc-framework/__tests__/unit/work-unit/side-effects/discharge-dep-edges.test.ts` or split
          a renamed reconcile-focused test alongside it.
        - Build `test-first` (one behavior at a time):
            - decompose replacement expands to one or several delivering members without duplicates
            - authored decompose drop and abandon remove the edge while retaining a surfaced reason
            - one or several rename hops retarget once to the final live slug; a rename chain ending in decompose or
              abandon applies that terminal disposition
            - park and unresolved live dependencies remain unchanged
            - stale content, missing targets or hops, ambiguous/cyclic evidence, and self-dependencies write nothing

### `[ ]` **2.3 Apply pending reconciles at dependent-owned write ceremonies**

- _Goal:_ Activation, review entry, and resume repair only the dependent's own branch, with refusal-capable planning
  ordered before phase mutation and resume's base-pointer and WU-branch commits kept distinct.

    - `[ ]` **2.3.a Preflight activation and integration entry through the shared reconcile**
        - Replace the activation-only discharge handler with the generalized operation on both `activate` and the
          initial `integrate` transition. Compute and validate the plan before `executeTransition()` mutates phase
          or branch, then carry that exact plan into the ceremony apply/stage path rather than replanning in a
          refusal-capable post-encoding side effect.
        - Keep no-op reconciles invisible. A stale apply after a successful preflight returns explicit recovery
          context rather than an untyped throw.

    - `[ ]` **2.3.b Reconcile after both resume arms reattach the WU branch**
        - Preserve resume's real two-branch topology: first land the tracked-base pointer removal, then invoke
          `arc wu reconcile --apply --json` from the reattached dependent branch—immediately in the spawned
          worktree, or after the deferred checkout for `--here`.
        - Land an applied rewrite as its own dependent-branch `chore(arc):` ceremony commit. A conflict blocks
          resume workflow completion on that branch but does not pretend the already-landed base-pointer commit can
          be rolled back atomically.

    - `[ ]` **2.3.c Prove branch isolation and ceremony atomicity**
        - Build `test-first` (one behavior at a time):
            - activation and integration entry reject a planning conflict before phase or branch mutation
            - activation plus both resume shapes apply the same plan from the dependent's own checkout
            - a no-op creates no write, stage, or extra commit
            - both resume arms keep the base-pointer and dependent-meta changes in their correct separate commits
            - no adapter writes or commits a dependent branch other than the WU whose own ceremony is running

### `[ ]` **2.4 Detect pending reconciles at session entry and fail closed at integration**

- _Goal:_ Read-only session entry makes pending repairs visible, while integration refuses a dependent whose own
  tracked reconcile cannot complete and transforms surface mid-integration coordination hazards.

    - `[ ]` **2.4.a Add a read-only pending-reconcile session probe**
        - Precompute clean/pending/conflict facts and CLI-owned advisory text for the active WU without editing its
          tracked files. Add the typed slot through the session envelope schema, status handler, fixtures, and
          unit/E2E tests; Phase 5 extends the same slot with tracked-reference edits and advisory findings.

    - `[ ]` **2.4.b Render the session-entry advisory in both framework copies**
        - Update package-source
          `packages/arc-framework/arc/system/workflows/arc/session-lifecycle/session-init.template.md` first, then
          sync the generated `.arc/system/workflows/arc/session-lifecycle/session-init.md` project instance.
          Dispatch only on the precomputed slot; do not add prose-side receipt lookup, comparison logic, or silent
          apply behavior.

    - `[ ]` **2.4.c Gate integration on the exact reconcile result**
        - In `integrate-work-unit.md` Step 13, run `arc wu reconcile --apply --json` after authoritative base
          reconciliation has brought reachable receipt evidence into the WU history and before the stable
          exact-head pre-merge checkpoint. A real conflict or unavailable replacement stops the WU unmerged; it may
          remain correctly `Integrating`.
        - When the operation applies a rewrite, commit and push the candidate correction, rerun affected CI/review
          coordination and base/lifecycle reads, then rebuild the exact-head checkpoint. Do not widen the
          review-readiness request union or create a second merge-guard criterion.

    - `[ ]` **2.4.d Surface a transform whose dependent is already integrating**
        - Use composed state during transform preparation to report each live incoming edge owned by an integrating
          dependent as a coordination advisory at the transform interlock.

    - `[ ]` **2.4.e Prove read/write and authority boundaries**
        - Build `test-first` (one behavior at a time):
            - the current-WU session probe detects pending and conflicting tracked repairs with zero writes; any
              identity-global repair remains the separate `arc user reconcile-references --apply` command
            - integration with a resolvable receipt lands the rewrite before authorization
            - integration resolves a reachable multi-hop rename chain to its final live or terminal disposition in
              one apply
            - integration with a missing/ambiguous target fails closed without merge authorization, including a
              receipt that appears after the WU first entered `Integrating`
            - a mid-integration dependent is surfaced but never mutated by the origin transform

### `[ ]` **2.5 Route every lifecycle transform through the shared reconcile contract**

- _Goal:_ Decompose, rename, and abandon publish enough shared evidence for every dependent to reconcile, while park
  shares inventory and projection behavior without inventing an incoming-edge action.

    - `[ ]` **2.5.a Partition shared-visible and branch-private dependents**
        - Preserve the existing common path: when composed truth carries an agreeing current-tree `writablePath`,
          keep that mechanically safe shared-visible rewrite inside the transform commit.
        - Ref-only, linked-worktree, remote-only, or divergent local candidates contribute semantic inventory but
          no write authority; encode their dependent-specific disposition in the receipt and issue no write against
          another checkout or branch. Never pass a ref-qualified pseudo-path to a filesystem mutator.

    - `[ ]` **2.5.b Bring every verb onto the common result model**
        - Decompose publishes authored replace/drop mappings, rename publishes old-to-new retargeting, and abandon
          publishes an abandoned/drop result. Park retains its slug and inherits only the composed read and staged
          ROADMAP path.

    - `[ ]` **2.5.c Prove transition parity and no foreign-branch writes**
        - Extend the verb and direct-retirement-driver suites with mixed shared/private dependents.
        - Build `test-first` (one behavior at a time):
            - each retiring identity produces the legal receipt projection and replays idempotently
            - shared-visible rewrites land once in-transform; branch-private metas remain byte-identical
            - a current-tree writable candidate remains on the fast path while a divergent same-slug ref candidate
              falls back to receipt evidence without a foreign write
            - abandon no longer leaves an incoming edge without discoverable disposition
            - park performs no receipt-driven incoming-edge mutation

## **Phase 3:** First-class cohortless decomposition

_Purpose:_ Make a flat-sibling split a closed, validated placement arm without conflating cohort placement with the
origin-disposition shape.

### `[ ]` **3.1 Extend the cut-map contract with the `cohortless` placement**

- _Goal:_ The untrusted cut-map boundary distinguishes flat siblings from both a newly minted cohort and lateral
  fan-out under an existing parent.

- _Note:_ See `notes-decomposition-hardening.md` § Cohortless placement invariants.

    - `[ ]` **3.1.a Add `cohortless` to the placement vocabulary**
        - Extend `ParentPosition` and the closed parser set in
          `packages/arc-framework/src/lib/work-unit/decompose-cut-map.ts`; keep `shape` orthogonal and make the
          schema-version call explicit in codec fixtures.

    - `[ ]` **3.1.b Enforce cohort/placement combinations**
        - Require `cohort` for `standalone` / `in-cohort`, forbid it for `cohortless` / `at-cap`, and retain
          shape-specific survivor, destination, ownership, and edge validation.
        - Forbid `cohort-coordination` entries and `cohort-shared` source ownership on `cohortless` maps; every
          conserved source must have a destination-owned home.

    - `[ ]` **3.1.c Prove the closed parse matrix**
        - Build `test-first` (one behavior at a time):
            - valid symmetric and extraction `cohortless` maps parse canonically with no cohort
            - `cohortless` plus a cohort and cohort-requiring arms without one reject
            - cohort coordination or shared ownership rejects on `cohortless` while cohort-backed maps retain it
            - `at-cap` remains distinguishable and all prior valid maps retain their canonical form
            - unknown placement values and incompatible schema versions fail at the JSON boundary

### `[ ]` **3.2 Project flat sibling paths through scaffold and retirement**

- _Goal:_ A cohortless cut creates complete flat sibling WU skeletons whose only relationship is their authored
  dependency graph, with one path authority from preparation through finalization and no cohort directory,
  membership, draft header, or coordination document.

- _Note:_ See `notes-decomposition-hardening.md` § Cohortless placement invariants.

    - `[ ]` **3.2.a Resolve one typed member placement**
        - Add a shared pure resolver from the validated cut plus origin cohort to `WorkUnitPlacement`: declared
          cohort segments for `standalone` / `in-cohort`, the origin's existing cohort for `at-cap`, and the
          existing planned empty-cohort placement for `cohortless`.
        - Return an explicit refusal when a cohort-requiring arm lacks its required declared or origin placement.

    - `[ ]` **3.2.b Thread placement through every path consumer**
        - Replace cohort-string path derivation in `verbs/decompose.ts` and
          `decompose-retirement-projection.ts` with the shared placement for scaffolding, allowed-path derivation,
          destination locators, preparation, and finalization.
        - Render flat member metas through the canonical complete-field projection with `Cohort: [none]`; omit the
          cohort header from flat member drafts.

    - `[ ]` **3.2.c Preserve per-member ownership and dependencies**
        - Continue inheriting origin/owner/priority and per-member `Class`; distribute only declared outgoing and
          internal edges, never blanket-inherit the origin's dependency set.

    - `[ ]` **3.2.d Prove filesystem, content, and retirement outcomes**
        - Extend `decompose-shapes.test.ts`, focused scaffold tests, and retirement preparation/finalization tests
          with a roadmap-tooling-class flat split.
        - Build `test-first` (one behavior at a time):
            - N members land at flat planned paths with their own meta/draft artifacts
            - metas render `Cohort: [none]`; no cohort directory, `cohort-*.md`, or cohort draft header is created
            - internal dependency ordering renders exactly as authored
            - preparation admits the exact flat destinations and finalization resolves those same targets
            - cohort-backed and at-cap scaffolds retain their existing layouts

### `[ ]` **3.3 Align cohort-fit guidance and prove the full decomposition-shape matrix**

- _Goal:_ Planning can emit the new placement value unambiguously, and every parent-position/non-symmetric arm
  remains executable under the shared transform substrate.

- **Additional Context:** `strategy-procedure-evolution.md` § Forward-Compat Principles

- _Note:_ See `notes-decomposition-hardening.md` § Cohortless placement invariants.

    - `[ ]` **3.3.a Update the canonical `assess-cohort-fit` contract**
        - Edit the package-source method first and sync `.arc/`; add `parentPosition` plus conditional `cohort` to
          the affirmative cut-map result and name `cohortless` as the flat-sibling placement.
        - Retain the orthogonality/guard-rail decision: choose `cohortless` only when every conserved source has a
          destination-owned home; ownerless shared coordination selects a cohort-backed placement.

    - `[ ]` **3.3.b Align the transform workflow with the typed placement**
        - Update package-source adopter-facing surfaces and their project copies so the method, untrusted schema,
          and `decompose` workflow consume one controlled placement term. Keep chunk/review-surface vocabulary out.
        - Dispatch on the CLI-computed placement for coordination authoring, structural verification, path/result
          wording, PR/commit prose, and the terminal message. The cohortless arm skips cohort-document authoring,
          verifies flat placement plus `Cohort: [none]`, and never derives paths in workflow prose.

    - `[ ]` **3.3.c Confirm every placement arm**
        - Exercise `standalone`, `in-cohort`, `at-cap`, and `cohortless`, including sub-cohort and lateral-fan-out
          layouts.

    - `[ ]` **3.3.d Confirm every non-symmetric transform shape**
        - Exercise extraction (including Active origin), backlog-stub source, and heterogeneous home with the
          expanded placement axis, including cohortless combinations where the allocation constraints permit
          them. Test-after is appropriate for this compatibility matrix after the parser/scaffold slices are green.

## **Phase 4:** Husk-consistent transform terminals

_Purpose:_ Separate pre-commit transform recording from authoritative cleanup, then route landed retirement and
rename residue through the existing evidence-backed teardown / sweep substrate.

### `[ ]` **4.1 Return one retirement lifecycle result and defer cleanup until landing**

- _Goal:_ Every retirement transform reports cleanup and successor state consistently without granting destructive
  authority or discarding session context before its receipt and tracked result are authoritative.

- _Note:_ See `notes-decomposition-hardening.md` § Landed transform terminal invariants.

    - `[ ]` **4.1.a Define the shared retirement lifecycle result**
        - Add a typed result carrying subject, transition, successor readiness, and independent `branch`,
          `worktree`, and `userWorkspace` projections using
          `not-applicable | pending | completed | blocked`.
        - Model authority as
          `{ kind: "receipt-backed", receiptId, authorityVersion } |
          { kind: "not-applicable", reason: "extraction" }`. Project extraction through the second arm with every
          retirement-cleanup leg `not-applicable`; never synthesize or null-fill receipt fields.

    - `[ ]` **4.1.b Keep pre-commit transform terminals non-destructive**
        - Make decompose finalization and abandon return pending cleanup descriptors without stamping / detaching the
          worktree, deleting refs, or closing the per-WU user workspace. Interrupted and unmerged transforms retain
          their live session context.

    - `[ ]` **4.1.c Factor the receipt-backed teardown planner**
        - Reuse `runTeardown()` and `teardown-retirement-driver.ts` for receipt revalidation, exact-head /
          cleanliness proof, remote disposition, husk stamping, ref cleanup, and replay; do not add a transform-local
          terminal driver.
        - Let `arc teardown <slug>` infer receipt-authorized non-shipped mode from authoritative evidence.
          Preserve `--force` only as a compatibility spelling; the flag never grants authority.

    - `[ ]` **4.1.d Derive successor readiness from complete member dependencies**
        - Derive candidates from each new member's complete projected `Depends On` set (internal cut edges plus
          allocated external dependencies), not an internal-edge-only graph.
        - Keep the pre-landed projection non-actionable. Once receipt and members are authoritative, precompose a
          spawn-anchored `arc start <slug>` remedy only for one candidate; list multiple candidates without choosing.

    - `[ ]` **4.1.e Prove result and pre-landing invariants**
        - Build `test-first` (one behavior at a time):
            - decompose, abandon, and extraction return the complete shared result shape
            - receipt-backed results require receipt identity/version; extraction admits neither and reports
              authority plus every cleanup leg `not-applicable`
            - an uncommitted or unmerged receipt stamps no husk, deletes no ref, and retains the per-WU workspace
            - candidate derivation includes internal and allocated external dependencies
            - zero, one, and multiple candidates produce no remedy, one precomposed remedy, and no selected remedy
              respectively

### `[ ]` **4.2 Defer spawned rename self-moves into an operational marker**

- _Goal:_ Rename invoked from its own spawned worktree completes identity changes without moving the live checkout,
  and records enough operational state for an outside-worktree move later.

- _Note:_ See `notes-decomposition-hardening.md` § Landed transform terminal invariants.

- _Note:_ Harness skills-directory registration is outside the lifecycle-transform substrate. If the rename
  reproduction confirms separate stale registration, route it as a harness-integration concern rather than
  widening this task.

    - `[ ]` **4.2.a Resolve self-move as an unconditional defer**
        - Pass the current locus into `resolveRenameWorktreeMove()` and return a typed defer when it is contained by
          the registered source path, before `reconcileWorktree()` invokes `git worktree move`; never rely on an OS
          error and never `chdir` the running session.

    - `[ ]` **4.2.b Persist the deferred move as an operational marker projection**
        - Add the closed `renameMovePending` projection only to a valid ARC-owned renamed marker, binding old/new
          subject identity, renamed branch, exact `HEAD`, registered `from`, and intended `to`.
        - Make `renameMovePending` and `husk` mutually exclusive. Successful / already-completed moves clear the
          pending projection; terminal husking supersedes and clears it.

    - `[ ]` **4.2.c Prove platform-independent rename behavior**
        - Extend focused worktree-mutator tests and `rename.e2e.test.ts`.
        - Build `test-first` (one behavior at a time):
            - POSIX-legal self-move still defers without a git move or locus hop
            - an outside-worktree invocation may perform the move directly
            - already-moved and replay states clear the pending projection idempotently
            - unmatched, in-place, malformed, foreign, wrong-branch, and moved-`HEAD` states grant no remedy
            - the tracked/branch/remote/user identity legs stay complete when the physical move defers

### `[ ]` **4.3 Surface landed transform and rename residue through session entry**

- _Goal:_ Session entry discovers cleanup that became safe after landing and offers exact shared actions without
  mutating tracked state, deleting automatically, or trusting branch-local evidence.

- _Note:_ See `notes-decomposition-hardening.md` § Landed transform terminal invariants.

    - `[ ]` **4.3.a Discover authoritative receipt-backed branched residue**
        - Extend the session-entry sweep to find still-branched registered retirement subjects whose committed
          receipt and transformed result are reachable from the protection-aware base. Under full protection,
          refresh and read `origin/<base>`; under partial, read the local integrating base.
        - Preserve existing detached-husk discovery and revalidation. Branch-local or unmerged evidence remains
          non-actionable.

    - `[ ]` **4.3.b Apply the shared cleanup plan after landing**
        - Project the ordinary `arc teardown <slug>` action from the factored planner, preserving identity,
          clean/exact-`HEAD`, receipt, remote, and current-locus safeguards.
        - Add the idempotent per-WU `runUserClose` leg after authoritative retirement, distinct from the existing
          identity-global user-surface reconcile. Keep the probe read-only and cleanup offer-driven.

    - `[ ]` **4.3.c Project `renameMovePending` as a distinct remedy**
        - Detect the operational marker, validate that the registered worktree still occupies the old path for the
          renamed branch at the stamped `HEAD`, and emit typed argv plus precomposed `git worktree move` guidance
          that can run only from outside it. Never execute it automatically.

    - `[ ]` **4.3.d Wire typed envelope and workflow surfaces**
        - Extend session status types/schema/fixtures and package-source
          `packages/arc-framework/arc/system/workflows/arc/session-lifecycle/session-init.template.md`, then sync
          the generated `.arc/system/workflows/arc/session-lifecycle/session-init.md` project instance. Dispatch on
          CLI classifications and precomposed actions; preserve the existing offer/interlock and do not let
          workflow prose infer evidence or marker safety.
        - Build `test-first` (one behavior at a time):
            - full-protection unmerged evidence grants neither cleanup nor successor launch; merged evidence does
            - partial-protection direct-base evidence becomes actionable without a remote merge
            - dirty, moved, foreign, and evidence-mismatched retirement residue remains blocked/manual-only
            - current-locus cleanup defers through the existing husk path; replay is idempotent
            - interrupted transforms retain their per-WU workspace until landed cleanup
            - one ready member gets a remedy, multiple ready members get only a candidate list
            - valid path lag receives the exact move remedy; stale or ambiguous registration does not
            - empty scans preserve common resume latency and emit no new section

## **Phase 5:** Reference conservation and cross-verb acceptance

_Purpose:_ Reconcile every mechanically-owned reference, surface judgment-owned residue, and prove that the shared
substrate behaves consistently across verbs, worktrees, and user state.

### `[ ]` **5.1 Complete structured and self-title rename rewrites across lifecycle tiers**

- _Goal:_ Rename rewrites every mechanically one-to-one tracked reference in the live lifecycle tiers and leaves
  historical or adopter-facing content untouched.

- _Note:_ See `notes-decomposition-hardening.md` § Reference reconciliation authority and mutation invariants.

    - `[ ]` **5.1.a Generalize WU artifact self-title rewriting**
        - Define a dedicated closed self-title registry, separate from `WorkUnitArtifactKindSchema` and the broad
          companion relocation matcher: `meta`→`Metadata`, `draft`→`Draft`, `spec`→canonical
          brief/outline/detailed `Spec (...)` forms, `tasks`→`Task List|Tasks`, `notes`→`Notes`,
          `research`→`Research`, and `analysis`→`Analysis`.
        - Rewrite only the first exact identity H1 when the basename is
          `<registered-prefix>-<sourceSlug>.md`, plus the exact `--plan <slug>` resume anchor; later headings,
          examples, unknown companions, and unrelated H1s remain content.

    - `[ ]` **5.1.b Preserve existing structured reference rewrites**
        - Keep exact `Depends On`, backticked artifact filename, cohort member heading, meta title, and artifact
          rename behavior in one deterministic plan whose changed paths are bound into retirement authority.

    - `[ ]` **5.1.c Prove tier and reference-kind boundaries**
        - Build `test-first` (one behavior at a time):
            - every registered basename/H1 pair—including decorated specs, `research-*`, and `analysis-*`—and the
              exact plan anchor rewrite old-to-new once
            - later matching H1s, examples, mismatched basenames, and unsupported title kinds remain unchanged
            - the layout kind enum and broad companion relocation matcher retain their existing independent scopes
            - structured spans retain surrounding formatting and unrelated slugs
            - `completed/`, `system/`, `reference/`, plain prose, and cohort filenames remain untouched
            - plan/apply re-entry produces no second edit

### `[ ]` **5.2 Surface ambiguous prose and dangling branch-private references**

- _Goal:_ Ambiguous slug mentions and references to a decomposed origin become actionable advisories, while
  one-to-one branch-private references reconcile only from the owning branch.

- _Note:_ See `notes-decomposition-hardening.md` § Reference reconciliation authority and mutation invariants.

    - `[ ]` **5.2.a Build a bounded advisory reference scanner**
        - Scan slug-token matches inside active/planned/provisional WU artifacts, requiring no adjacent
          `[a-z0-9-]` character and excluding structured spans already handled automatically. Return path,
          line/anchor context, reference kind, and suggested disposition without editing prose.

    - `[ ]` **5.2.b Discover reference transitions from current-WU history**
        - Add a storage-agnostic query that enumerates valid retirement transitions reachable from the current WU's
          committed history independently of `Depends On`. Compose a unique acyclic rename chain to its final target;
          surface ambiguous or cyclic histories.

    - `[ ]` **5.2.c Distinguish rename and decompose outcomes**
        - Rename surfaces narrative mentions for author judgment; decompose additionally identifies backticked
          references to removed origin artifacts as dangling because no single replacement is authoritative.

    - `[ ]` **5.2.d Reconcile private tracked references from their own flow**
        - Scan the current WU's artifact group using its reachable transition set. Add mechanically rewritable
          receipt-derived edits to the tracked-reference component of the shared `arc wu reconcile` plan; add
          prose/dangling hits to its read-only advisory component.
        - Capture the exact content version for every candidate path. `--apply` must validate the complete
          current-WU path set before its first write, stage only the plan-declared paths as one bounded batch, and
          refuse all tracked edits when any file is stale. Lifecycle ceremonies consume this same plan; a
          reference-only WU can invoke the precomposed apply remedy as its own review increment.
        - Extend Phase 2's session-envelope slot with structured-reference pending/conflict facts, advisory hits,
          and CLI-owned `arc wu reconcile --apply --json` argv. The existing package-source/generated workflow
          dispatch renders that typed surface without prose-side scanning; activation, resume, and integration
          callsites consume the extended plan without a second trigger.

    - `[ ]` **5.2.e Prove discovery, token, and branch-isolation boundaries**
        - Build `test-first` (one behavior at a time):
            - a reference-only WU with no `Depends On` edge still discovers the reachable transition
            - read-only CLI/session output exposes its pending structured edits and advisory hits, and the
              precomposed `arc wu reconcile --apply --json` remedy applies through the shared command
            - unique rename chains resolve to the final target; ambiguity and cycles surface without edits
            - common-word slugs match complete ARC tokens, not substrings or prefix/suffix-hyphen neighbors
            - already-rewritten code spans do not also appear as prose findings
            - decompose dangling artifact refs surface with no guessed target
            - one stale artifact makes the guarded batch write and stage nothing
            - another worktree's tracked files remain byte-identical until that WU runs its own ceremony

### `[ ]` **5.3 Reconcile managed user references under the notes write discipline**

- _Goal:_ Session entry can repair an authoritative renamed `WU_Target` without turning a read-only status probe
  into a mutator, hiding unsaved disk drift, or touching sibling WU workspaces.

- **Additional Context:** `strategy-user-notes-concurrency.md` § Disciplines and § Review Checklist

- _Note:_ See `notes-decomposition-hardening.md` § Reference reconciliation authority and mutation invariants.

    - `[ ]` **5.3.a Plan structured and advisory user-state reconciles**
        - Discover rename evidence only from the protection-aware base. Treat only an exact managed `WU_Target` in a
          `USER-INBOX` Work Unit entry as mechanically retargetable, preserving its optional
          `(planned|provisional)` suffix. Scan `WORKING-MEMORY.md` and the current WU's `SESSION-NOTES.md` for
          advisory prose only; do not scan or mutate sibling WU workspaces.

    - `[ ]` **5.3.b Add the dedicated user-reference apply verb**
        - Implement `arc user reconcile-references --apply` over protection-aware-base-authoritative,
          unambiguous rename evidence. Resolve paths through the user-surface resolver, acquire the per-identity
          notes lock, re-read after acquisition, and write disk atomically. Do not mutate the canonical notes ref
          or materialized-baseline stamp; the repair remains visible as disk-ahead drift until save/load.

    - `[ ]` **5.3.c Integrate the reconcile into session entry**
        - Keep the status probe read-only: emit typed findings and precomposed argv for the dedicated verb. The
          workflow may invoke it only for an authoritative unambiguous rename; decompose, prose, ambiguity, and
          cycles remain advisory while the active WU's ordinary session context is preserved.
        - Build `test-first` (one behavior at a time):
            - full protection trusts only refreshed `origin/<base>` evidence and partial protection trusts the local
              integrating base; unmerged branch-only receipts never change identity-global state
            - exact `WU_Target` rewrites once and preserves `(planned|provisional)`
            - `WORKING-MEMORY`, current-WU session notes, sibling workspaces, decompose, and prose cases remain
              unmodified
            - a sibling edit between planning and lock acquisition is re-read and preserved
            - successful disk repair leaves the canonical notes ref and materialized baseline unchanged, producing
              truthful disk-ahead status
            - lock / atomic-write failures leave disk, notes, and baseline state recoverable

### `[ ]` **5.4 Close the cross-worktree and cross-verb transform acceptance matrix**

- _Goal:_ Real temporary-repository tests demonstrate that the four verbs share one authoritative, deterministic,
  self-healing substrate under the parallel conditions that exposed the original failures.

- _Note:_ Cross-cutting confirmation over module slices already built test-first; this parent is test-after system
  acceptance, not a second implementation path.

    - `[ ]` **5.4.a Reproduce linked-worktree and remote-only dependents**
        - Run decompose/rename with the only incoming dependent on another linked worktree and in a remote-only
          branch; verify inventory inclusion, receipt publication, deferred private reconciliation, and zero
          foreign-branch commits. Also prove a remote-only or semantically divergent transform subject refuses
          before filesystem access.

    - `[ ]` **5.4.b Reproduce degraded and concurrent transitions**
        - Verify unreachable remote prepare/finalize behavior, a rename whose composed-oracle refresh cannot reach
          origin but proceeds from reachable truth, newly enlarged inventory refusal, an integrating dependent
          advisory, and fail-closed integration of an unresolved repoint.

    - `[ ]` **5.4.c Reproduce projection and terminal failures**
        - Keep the retiring remote branch alive during ROADMAP regen, invoke spawned rename from inside its own
          worktree, and retire a started decompose origin. Under full and partial protection, assert no phantom row
          or locus move; complete transition staging before an index-only render despite divergent worktree
          content; no cleanup or successor launch before the transform is authoritative; the exact
          receipt-less extraction authority arm; and the expected post-land teardown / readiness offer afterward.

    - `[ ]` **5.4.d Exercise reference and user-state conservation**
        - Cover the closed self-title registry including decorated specs / `research-*` / `analysis-*`,
          slug-alphabet boundaries, reference-only discovery without a `Depends On` edge, unique rename chains and
          ambiguous/cyclic history, narrative and dangling advisories, shared-command detect/apply behavior,
          guarded multi-file staging, private-branch replay, suffix-preserving `WU_Target` retargeting from
          protection-aware-base evidence, truthful post-repair baseline drift, and excluded
          unknown-companion/sibling/completed/adopter-facing content.

    - `[ ]` **5.4.e Confirm abandon, park, and every decomposition shape**
        - Demonstrate abandon's dropped incoming edge, park's shared read/regen with no incoming action, and the
          cohortless plus pre-existing parent-position/non-symmetric shape matrix.

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
