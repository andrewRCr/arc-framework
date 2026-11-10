# Draft: Cutover In-Repo Removal

- **Origin:** split from `cutover-tracked-state-removal` at its create-spec entry (Owner, 2026-11-10, on the PM's
  read). That unit's draft-design split its scope by what reads as live after the flip and held the internal collapse
  as a marked share of its draft, to be cut at `cutover-flip`'s landing because a cut before the flip runs
  `RELEASE-GATES` § Decomposition, whose extraction arm has never been rehearsed. The share is minted by hand instead,
  as `cutover-window-tooling` was from `cutover-flip`: a hand mint runs none of that machinery, and create-spec's
  retirement of the origin's draft would otherwise leave the share without a home. The design below is
  `draft-cutover-tracked-state-removal.md`'s collapse share as written at `23c41d5512`, its section references
  re-pointed, with the placements § Carried in names.
- **Purpose:** Remove the in-repo store and the internal pre-flip machinery the flip leaves dormant — the capability
  arms, the seam members' in-repo arms, the branch-tree readers, lifecycle classification, and the write-context
  guard — once nothing produces a store whose state lives on the branch.
- **Planning posture:** `P1`, a Gate B Should, with the in-repo implementation first in its order so it can be pulled
  forward (D1). Minting is not planning: its planning waits behind the Musts' (Owner, 2026-11-10, on the PM's read)
  and may use a planning lull before the flip lands. It lands after `cutover-tracked-state-removal` and before the
  product-renames sweep's start if it can; otherwise it waits until after the deadline, any `naming-conventions` edge
  dropped then at the Owner's call (D9).

---

## Planning state

- **Readiness:** rough. Its scope and boundary were settled in `cutover-tracked-state-removal`'s draft-design; its
  own derivation (§ Its own derivation) is open.
- **Resolved in `cutover-tracked-state-removal`'s draft-design** (Owner, 2026-11-10):
    - **The boundary:** that unit removes each exposed surface — a command or option registration, a hook block, a
      configuration key, a CI step, a shipped file — with the code reachable only through it. Code a dormant arm also
      reaches stays, named in § Scope, and this unit deletes it with that arm.
    - D1, D3, and D9 (§ Decisions).
- **Resolved at the mint** (Owner, 2026-11-10): the share is minted now rather than cut at the flip's landing.
- **Open:** § Its own derivation, and `cutover-flip`'s answer on how its tests stay green once `createStore` builds the
  ref store, which sets this unit's test surface.
- **Next:** draft-design, after the Musts' planning. Implementation waits on `cutover-flip` and
  `cutover-tracked-state-removal`.

The inbound items keep the numbers they had in `storage-cutover`'s buffer. Their dispositions were made at
`cutover-tracked-state-removal`'s planning pass (2026-11-10); the shares that land here are listed in § Carried in.

---

## The size

Measured on 2026-11-10 against `origin/main` at `9c63a803ae`, as `cutover-tracked-state-removal`'s draft records:
about 14,000–18,000 source lines and 5,000–35,000 test lines. Module sizes are `wc -l` counts; capability-arm and test
figures are census estimates from read-only sweeps, re-measured at the flip's landing.

- Capability-arm counts are upper bounds. A false arm also runs when no store is passed (the `store?.` reads), when an
  optional parameter defaults to false, when `runPostInitSetup` (`lib/setup.ts`) finds no identity, and on the import
  path, whose source `runStoreMigrate` builds through `createStore`.
- The test lines turn on `cutover-flip`'s test-surface answer: 146 test files, about 35,000 lines, target the in-repo
  implementation, 85 of them through `createStore`.

---

## Scope

- **The in-repo implementation** (`lib/store/in-repo/`, 32 files, 2,782 lines), with the three flip pieces bound to it:
  the environment override in `createStore` and the flip build's unimported-repository refusal, both the flip's to
  build, and the sealing guard already on `main` (`refuseWriteIfStoreImported`, `lib/store/store-imported.ts`, with
  `handlers/pre-cutover-seal.ts`; PR #1287). Its callers are every importer of those two modules: among them the
  in-repo backend, the Errand identity and merge paths, the refusal codes (`lib/store/refusal.ts`,
  `lib/errand/result-common.ts`), the seals in `arc sync` (`handlers/sync.ts`) and in `arc errand`'s handlers
  (`handlers/errand.ts`), and the notes writers, which go with notes sync if `cutover-notes-removal` lands first. With
  it go the architecture-test predicates that name `lib/store/in-repo/` (`storeViolations`,
  `eslint/architecture-imports.ts`) and the CI lane that runs both backends.
- **Every dormant capability arm:** about 217 sites in 113 files under `lib/` and 440 sites in 163 files under
  `handlers/`, `commands/`, and `scripts/`, with the modules only they reach (census estimates, upper bounds), and
  then the capability itself (`StoreCapabilitiesSchema`, `lib/store/read.ts`; `usesOffBranchState`,
  `lib/store/lifecycle-write.ts`) and its carriers, once nothing produces false. Among them are the pre-flip-only
  refusals the census found (`arc pause`, `arc handover`, `arc task close` and `defer`, `arc save`, `arc editor`,
  `arc status --conflicts`, and the dormant store-command arms), and the review gate's Errand status selection:
  `selectErrandStatus` (`scripts/review-gate/status-errand.ts`) returns the stored selection when the capability is
  true and otherwise reads the Errand identity refs through `readTransientIdentitySnapshot`
  (`lib/errand/identity-snapshot.ts`), whose tests seed both substrates.
- **The dormant code `cutover-tracked-state-removal`'s removals leave** (§ Planning state, the boundary):
    - `runResume` (`lib/work-unit/verbs/park-resume.ts`), with `arc resume`'s and `arc start`'s in-repo arms;
    - `renderRoadmapFromIndexViewResult` (`lib/status/roadmap-regeneration-assert.ts`), with the in-repo rename's
      ROADMAP regeneration (`commands/rename.ts`) and the executor's ROADMAP effect
      (`lib/work-unit/executor-context-status.ts`);
    - the `reconcile-regenerable` next action and the `--regenerate-roadmap` argument its dormant arms still emit
      (`scripts/integration/checkpoint.ts`, `scripts/integration/errand-merge.ts`), with the regenerable path class;
    - `runUserClose` (`commands/user/close.ts`), which teardown's in-repo arm reaches for a unit torn down as abandoned
      (`handleTeardown`, `handlers/lifecycle.ts`);
    - the executor's workspace side effect and the worktree scaffold's in-repo arm (its workspace open and
      session-notes seed), with `runUserOpen` (`commands/user/open.ts`), which they reach, unless `cutover-flip`
      removes the two with the workspace, in which case `runUserOpen` goes with `arc user open` in
      `cutover-tracked-state-removal`;
    - `arc start`'s store-side resume refusal (`handlers/start-store.ts`) with `resolveStartDispatch`'s `resume` arm,
      once it is confirmed that no store index yields a `parked` entry: the import turns parked work into a pause
      (`lib/store/ref/import/parked-source.ts`);
    - `arc view`'s pre-flip arm (the register's `arc view` row): its checkout-or-ref read and its `--path` /
      `--editor` refusal;
    - `archive.cadence`'s in-repo-only readers (#24; D3).
- **#1's internal share,** after the splits in § Moves before deletion:
    - the branch-tree readers, except what the old decomposition machine reaches (§ What the old decomposition
      machine still imports): `lib/status/project-view-ref.ts`, the Git retirement-authorization and transition-record
      readers, the ref-reading parts of `in-flight-derivation.ts`, `remote-ref-reader.ts`'s meta-at-ref readers,
      `completed-index.ts` (`*FromRef`), the session-init sweeps' base-archive reads, base drift's reads of
      `.arc/completed/` from base history (`lib/base-drift/current-adapters.ts`) that `cutover-flip`'s move of its
      resolver onto the store's completed records leaves, delivery's rename source (`GitDeliveryRenameTransitionSource`,
      `lib/delivery/plan-resolution.ts`; § Its own derivation), and `scripts/review-gate/hosts/local/git-tree-fs.ts`;
    - lifecycle classification and exclusion: `evidence-applicability/path-treatment.ts`,
      `delivery/lifecycle-contribution.ts` with its Git variant, and the evidence-neutral and regenerable arms, once
      their surviving importers move off them (`candidate-evidence.ts`, `git/base-overlap.ts`, and the seven
      `lifecycle-contribution` importers: `git-lifecycle-contribution`, `entry-inspection`, `chain-containment`,
      `repository-entry`, `git-eligibility`, `handlers/delivery-execution.ts`, and `pre-publication-composition`).
      The spec review copy's arm stays (§ Moves before deletion). How the `lifecycle-contribution.ts` path group
      treats the copy in a stacked delivery is an open question with `delivery-observe-attest`; if its answer lands
      first, carry it through the group's removal.
- **The in-repo arms the seam members left,** and each register row's internal deletion share, among them:
    - #4: lineage's `rename` kind and its parser, and `Next Task`, `Last Completed`, and `Blockers` in the meta's parsed
      schema, with their writers and every pre-flip arm that writes them;
    - H2: the user-surface rooting (`lib/user-surfaces.ts`, which `lib/store/in-repo/personal-paths.ts` imports) and
      its migration (`lib/user-surface-migration.ts`), after `IDENTITY_STATUS_FILENAME` moves;
    - `DERIVED_VIEWS` (`lib/store/registry.ts`) and #26's in-repo arms;
    - `seam-delivery-review`'s retired arms (`spec-seam-delivery-review.md` § 12.6, § 14.3), among them the frontline
      skip marker's kind and names and the per-clone repository ID record (`identity/repository-identity.json`), which
      the review gate stops reading once it takes the project ID; and the held Candidate staging-recovery arm
      (`appendCandidateResponse`, `stageCandidateResponse`);
    - the write-context guard (`lib/git/write-context.ts`, the register's row), whose `ProtectionMode` type stays for
      `cutover-decompose-removal`;
    - the interim `personal/session-context` kind (`KIND_MECHANISMS`, `interim: true`, `lib/store/registry.ts`), which
      `cutover-flip` declines (2026-11-10);
    - `arc active status`'s and the review gate's local live context's reads of `.arc/active/`
      (`readActiveMetaCandidates`; `commands/active/status.ts`, `scripts/review-gate/hosts/local/live-context.ts`),
      which no seam change reroutes (`spec-seam-locus.md`), moved onto the store or kept over the projection;
    - `git-decomposition-object-readers.ts`, which `spec-seam-decomposition.md` says is not decomposition's.
- **The suites that target the in-repo implementation** (#10's share): a store suite that runs the shared conformance
  suite or tests a consumer through the contract survives, while one that targets the in-repo implementation by name
  retires with it, the list taken from the ref backend's implementation.
- **The import's capability-false arms:** `readRepositoryIdentity` (reached through `lib/store/ref/import/entry.ts`)
  and `readRepositoryCandidateSupersessionChain`'s in-repo arm (reached through `import/review.ts`, and through the
  window tooling's chain comparison), once `cutover-tracked-state-removal` has deleted the import transform and the
  window's tooling.

### Moves before deletion

Most of what the storage cut called moving start, teardown, `lib/delivery/`, and pre-publication onto store reads is in
place behind the capability, and `cutover-flip` takes base drift's completed-meta resolver onto the store (2026-11-10).
What remains here:

- **Mixed modules, split before deletion:** `remote-ref-reader.ts` is mostly generic remote Git. The ref backend
  imports `classifyRemoteFailure`, `PASSIVE_REMOTE_INTERACTION`, and `DEFAULT_NETWORK_TIMEOUT_MS`;
  `fetchRefsBounded` serves in-flight derivation and `readLiveRemoteHeads` the notes publication proof, so each follows
  its caller; only the meta-at-ref readers (`readMetaAtRef`, `listMetaPathsAtRef`) are branch-tree readers.
  `completed-index.ts`'s types are imported by the store's own reader (`lib/store/lifecycle-completed.ts`);
  `IDENTITY_STATUS_FILENAME` (`lib/user-surfaces.ts`) is imported by the projection and the ref backend;
  `git-retirement-authorization-context.ts`, whose only importer is `teardown-retirement-driver.ts`, carries Git logic
  a census found `arc teardown --branch` reaching on every path (§ Its own derivation). `branchToWorkUnitSlug` already
  lives in `lib/work-unit/work-unit-slug.ts`.
- **The spec review copy's arm** in `classifyPathTreatment` survives `path-treatment.ts`'s removal (inbound entry on
  `seam-delivery-review`'s retired arms).

### What the old decomposition machine still imports

This unit leaves in place every module the old machine reaches, directly or through what it calls, and moves their
other callers onto store reads. Among them:

- the transition-record cluster: `isGitTransitionOriginOccupied` (`git-transition-record-enumeration.ts`),
  `createInRepoTerminalTransitionRecordWriter` (`terminal-transition-record-writer.ts`), and
  `transition-record-store.ts`;
- `transition-overlay.ts`;
- `artifactMatcher` and `pruneEmptyBacklogSource` (`mutators/relocate-artifacts.ts`);
- `resolveProjectReadinessViewInput` and its file-view types (`lib/status/project-view.ts`), with `deriveInFlight`
  (`lib/git/in-flight-derivation.ts`) and the readers it reaches, `remote-ref-reader.ts`'s meta-at-ref readers among
  them, which the old machine reaches through that function's local-refs path
  (`lib/work-unit/git-decompose-v3-repository-plan.ts`);
- the `ProtectionMode` type (`lib/git/write-context.ts`).

`cutover-decompose-removal` deletes each with its last caller, so the two land in either order. The cluster,
`transition-overlay.ts`, and `relocate-artifacts.ts` import nothing this unit deletes.

### Ordering

- **After `cutover-tracked-state-removal`:** the in-repo implementation cannot go before the import transform, since
  `runStoreMigrate` (`lib/store/create.ts`) builds the import's source through `createStore`, and that unit deletes the
  transform and the window's tooling, which reach the in-repo arms above.
- **Either order with `cutover-decompose-removal`** (§ What the old decomposition machine still imports), except the
  v3 decomposition schema and plan, which leave with or after lifecycle's in-repo graduation
  (`spec-seam-decomposition.md`; § Its own derivation).

---

## Its own derivation

- The rule for when an arm is deletable, grounded per producer of a false capability.
- The test surface, once `cutover-flip` says how its tests stay green.
- Whether `git-retirement-authorization-context.ts`'s Git logic serves `arc teardown --branch` on the store path.
- Whether any store index yields a `parked` entry.
- Whether `arc active status`'s and the review gate's live context's reads move onto the store or stay over the
  projection.
- Delivery's rename source: `cutover-flip` makes it refuse when the transitions folder is missing at the ref, a guard
  while delivery is paused, and leaves moving delivery onto store reads to the follow-ons. Whether it moves onto
  `lookup` here or waits for delivery's rebuild.
- The order against `cutover-decompose-removal` for the v3 decomposition schema and plan.

---

## Carried in

Placements made in `cutover-tracked-state-removal`'s planning that bind this unit:

- **Inbound items** (that unit's planning pass, 2026-11-10): #1's branch-tree readers and lifecycle classification;
  #4; #10's in-repo suites; #24's reader pruning (D3); H2; the pre-flip guard, override, and refusal, bound to the
  in-repo implementation; and `seam-delivery-review`'s retired arms, with the `delivery-observe-attest` check.
- **`cutover-flip`'s declines** (its create-spec, 2026-11-10): the interim `personal/session-context` kind, and
  `status-errand.ts`'s legacy identity-ref arm with its tests that seed both substrates.

---

## Decisions

- **D1. Gate B placement** (Owner, through the PM, 2026-11-10): a Should, with the in-repo implementation first in its
  order so it can be pulled forward. Gate B's Musts are what a user, CI, the recipe, or `--help` exposes; internal
  machinery is a Should, as `cutover-decompose-removal` was placed.
- **D3. `archive.cadence`:** the key stays, since `spec-seam-locus.md` A26 reads both arms and `cutover-flip` keeps
  integrate's dispatch. Only its in-repo-only readers go here: the census places them in
  `scripts/integration/checkpoint-composition.ts`, `merge-composition.ts`, and readiness's in-repo cadence dispatch
  (`scripts/review-gate/readiness.ts`, which raises the `wrong-cadence` facts). The store path's `wrong-cadence`
  refusal (`readiness-store.ts`) stays.
- **D9. Name and timing** (Owner, 2026-11-10): `cutover-in-repo-removal`, named for the in-repo implementation it
  removes first; it lands before the rename sweep's start if it can, and otherwise waits until after the deadline, any
  `naming-conventions` edge dropped then at the Owner's call.

---

## ADR dispositions

- **Every removal in § Scope:** covered by ADR-035, whose decision moves state off the branch and leaves this machinery
  nothing to act on.
- **D1, D9, and the mint's timing:** `none`, temporary. Planning placement, naming, and timing, whose record is
  `RELEASE-GATES` and the cohort record.
- **D3:** `none`, tactical. It declines a removal and keeps shipped behavior whose record is `spec-seam-locus.md` A26.

---

## Scope boundary (Won't Do)

- What a user, a project's CI, the shipped recipe, or `arc --help` exposes after the flip, with the code reachable only
  through it: `cutover-tracked-state-removal`.
- The old decomposition machine and the modules it reaches (§ What the old decomposition machine still imports):
  `cutover-decompose-removal`.
- Notes-specific sync, the sync-state ref, and the suites that target notes: `cutover-notes-removal`.
- Strategy and ADR rewrites: `cutover-documentation`.
- The `Context:` footer grammar and its state-only commit kinds: `ghost-mode`, by the register's footer-grammar row.

---
