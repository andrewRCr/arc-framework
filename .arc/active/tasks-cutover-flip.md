# Task List: Cutover Flip

- **Design:** `spec-cutover-flip.md`

---

## **Phase 1:** The backend selection seam and explicit in-repo construction

_Purpose:_ Build the override, the tracked-state refusal at a store's first use, and the ref composition in a selection
beside `createStore` without turning them on, make every test whose subject is the in-repo arm build or select that arm
explicitly, and make each in-repo refusal name its pre-flip step, so the switch later changes only expectations that
rest on the default.

_Mode:_ `layer` through Phase 2 — closes on a settled substrate: every path the switch turns on, built and tested over
the ref backend while the default store stays in-repo.

### `[x]` **1.1 The override, the tracked-state refusal, and the ref composition — § 2.1, § 3.1, § 3.2**

- _Goal:_ A selection `createStore` can call composes the ref backend from its caller's ports, makes that composition
  refuse at its first use over a `HEAD` tree tracking ARC state with the remedy for the condition it observes, and
  builds the in-repo implementation under the override, while `createStore` itself still returns the in-repo
  implementation.

    - `[x]` **1.1.a The ref backend's ports composed from the caller's**
        - `composeRefStorePorts` (`lib/store/selection.ts`) builds them through `createDefaultRefStorePorts` with the
          caller's executors behind the Git floor gate and `backingRepository` from `readBackingRepository`, then lays
          the caller's file-access methods, `clock`, and `identity` over them. The ref lock is rebuilt over the merged
          file access, so the caller's file access reaches it and the caller's `locks` are never consulted
          (`unit/lib/store/selection-ref-ports.test.ts`).

    - `[x]` **1.1.b The override selects the in-repo implementation**
        - `selectStore` reads `ARC_IN_REPO_STORE` from a passed environment, defaulting to the process's, once per
          composition. Set and non-empty, it builds the in-repo implementation over the caller's ports; otherwise it
          builds the ref backend over the composed ones. Neither choice reads Git
          (`unit/lib/store/selection-override.test.ts`).
        - `selectStore` lives in `lib/store/create.ts` beside the unchanged `createStore`, not in `selection.ts`: the
          architecture lint admits backend entries only from that factory (`store-production`,
          `eslint/architecture-imports.ts`). `selection.ts` holds the override's name and the pieces the selection
          composes.

    - `[x]` **1.1.c The tracked-state refusal at the store's first use**
        - `findTrackedStateRoots` lists `HEAD`'s tree with `--full-tree` for the five roots; only an unborn `HEAD` or
          a missing repository reads as tracking nothing, and any other Git failure throws. `trackedStateRefusal`
          returns the new recoverable `tracked-state` code with the roots found and picks its remedy by whether the
          registry ref exists locally (`storeImportedHere`). The ref arm of `selectStore` evaluates both in its lazy
          constructor and builds a store that refuses every operation, writing nothing
          (`integration/store-selection-tracked-state.test.ts`, `unit/lib/store/selection-tracked-state.test.ts`).
        - The conformance fixtures exclude the code with reasons, since only the selection produces it.

- _Outcome:_ `createStore` is unchanged; `selectStore` beside it in `lib/store/create.ts` is what Task 3.3 points it at.
  `lib/store/selection.ts` exports the predicate (`findTrackedStateRoots`), the remedy builder (`trackedStateRefusal`),
  and their composite (`findTrackedStateRefusal`) for the root hook in Task 2.2.

### `[x]` **1.2 The test setup clears the override, and CI sets it only for the flip's tracked tree — § 3.1, § 7.6**

- _Goal:_ No test, nor any CLI a test spawns, inherits the override from the checkout that runs it, and CI's two
  in-checkout CLI steps carry it only while the flip's branch still tracks state.

    - `[x]` **1.2.a The test setups clear the override**
        - The unit setup and the integration and end-to-end global setups delete `IN_REPO_STORE_OVERRIDE` from the
          process environment before anything else runs.
        - `integration/test-setup-store-override.test.ts` runs a nested Vitest over the real global setups, with the
          real unit setup added to the fixture's unit project, under a parent environment that sets the override. No
          worker in any of the three tiers sees it, and neither does a process an integration or end-to-end test
          spawns.
        - That test reads the nested run's summary without its color codes, which a runner printing color had put
          between its words (`29c8a88464`).

    - `[x]` **1.2.b CI's override condition**
        - Both steps open their own script with the condition: the branch from `GITHUB_HEAD_REF`, falling back to
          `GITHUB_REF_NAME`, ends in `/cutover-flip`, and `git ls-tree` lists a file under the five roots at `HEAD`.
          Only then do they export `ARC_IN_REPO_STORE=1`, so it is otherwise unset, never empty.
        - `integration/ci-in-repo-store-override.test.ts` runs each step's script from `ci.yml` with a stand-in `node`
          that records the override every ARC invocation sees. Each step gets the override on the flip's pull request
          and dispatched runs over a tree that tracks state, and nowhere else. The lane-attestation workflow and the
          routed checks' declared inputs are unchanged.
        - `integration/classify-change.test.ts`'s verified-tree record pins the forecast step's text as setup
          preparation, and takes the condition with it (`a03c56b2fb`).

### `[x]` **1.3 The store test helpers build the in-repo backend explicitly — § 7.2**

- _Goal:_ Every shared store helper whose subject is the in-repo arm builds it through `createInRepoBackend`
  (`lib/store/in-repo/backend.ts`) or selects it through the override, so the switch changes no test that imports one.

- _Note:_ No test builds the in-repo backend explicitly today; the importer counts are in `notes-cutover-flip.md`
  § Test callers. An explicit in-repo store records no capability (`recordComposedStoreCapability`, which `createStore`
  calls and `createInRepoBackend` does not), so a test that mixes one with a handler composing the default for the same
  root sees the default's capability.

    - `[x]` **1.3.a The fixtures**
        - `tracked-write-fixture`, `in-repo-fixture`, `personal-fixture`, `sync-fixture`, and `in-repo-remote` build
          their stores through `inRepoStore` (`__tests__/helpers/store/in-repo-ports.ts`). It selects the in-repo
          implementation by passing the override to `selectStore`, since the test lint (`store-tests`,
          `eslint/architecture-imports.ts`) keeps tests from importing `createInRepoBackend`. The store it builds records
          its capability as `createStore` does.

    - `[x]` **1.3.b The differential harnesses**
        - `review-differential`'s in-repo side and `import-comparison`'s source store build through `inRepoStore`; the
          reference and ref sides are unchanged.

    - `[x]` **1.3.c The import fixture**
        - `migrate` passes ports carrying an explicit `importSource` over `inRepoStore`, composed as `runStoreMigrate`
          composes its own source. `migrateCommand` sets the override around its call and restores the prior value
          after, so the production command's source stays in-repo once `createStore` follows the selection. The 41
          suites that import the fixture pass unchanged.

### `[x]` **1.4 Callers whose subject is the in-repo arm build it explicitly — § 7.2**

- _Goal:_ Each test that composes a store, directly or by passing one to a handler, and whose subject is the in-repo arm
  builds it explicitly, and every other direct caller is recorded for Task 3.3 as expecting the ref backend.

    - `[x]` **1.4.a The in-repo store suites**
        - The eleven `store-tracked-*`, `store-transient*`, `store-in-repo-*`, and `store-personal-*` integration
          suites and the four `in-repo-*` unit suites build their stores through `inRepoStore`. So do the unit tests
          that expect `unsupported` from the in-repo store outside those names: `handlers/review-adversarial`,
          `work-unit/verbs/pause-handover`, and `store-command-registration`.

    - `[x]` **1.4.b Default-factory tests of the in-repo arm**
        - Each builds its store through `inRepoStore` and passes it in, to the registered commands it seals in
          `integration/errand-store-imported-cli.test.ts`, as `resolveReviewInvocation`'s `store` in
          `unit/scripts/review-gate/runtime/invocation-extra-pass-references.test.ts`, and as
          `createSessionStatusContext`'s `operational.store` in `integration/session-inbox-compatibility.test.ts`.

    - `[x]` **1.4.c The remaining direct callers classified**
        - Thirty-three files whose subject is the in-repo arm build it through `inRepoStore`: handler, review-gate,
          integration-script, session-init, store, projection, work-unit, and recovery tests, and the import sources
          the `store-ref-import-*` suites build by hand. `integration/identity-setup-store-cli`'s mock falls through to
          it for the legacy join. `integration/command-surface-documentation`'s default-backend case and the partial
          mocks that bind a reference store around each dispatch are recorded as expecting the ref backend.

- _Outcome:_ Every direct `createStore` caller and § 7.2 handler entry in the test tree is classified by file in
  `notes-cutover-flip.md` § Test callers, which Task 3.3 takes as its list of tests expecting the ref backend.

### `[x]` **1.5 Spawned tests whose subject is the in-repo arm set the override — § 7.3**

- _Goal:_ Each test that spawns the built CLI to assert in-repo behavior sets the override in its spawn environment, so
  it keeps its subject after the switch and leaves with that arm.

- _Outcome:_ The cases whose subject is the in-repo arm set the override through `useInRepoStore` or
  `useInRepoStoreForEach` (`__tests__/helpers/in-repo-store-override.ts`), which scope it to the test process's
  environment so the spawned CLI and its Git hooks inherit it: the two spawned imports; the dormant-command,
  adversarial-recording, `arc save`, editor, and dormant-decompose refusals; the old decomposition machine; park; the
  ROADMAP remedy; the planning-lane classifier; and the notes commands' reference reconciliation. The classification
  by file is in `notes-cutover-flip.md` § Test callers.

### `[x]` **1.6 The in-repo refusals name their pre-flip steps — § 3.1**

- _Goal:_ Every verb the rewritten workflows name that refuses `unsupported` on the in-repo implementation names, in its
  remedy, the concrete pre-flip step that does its job, independent of any workflow's text.

- _Outcome:_ Every in-repo refusal of a verb the rewritten text names takes its remedy from one source,
  `lib/store/pre-flip-steps.ts`, which names the concrete step that does the verb's job while state stays in the
  checkout: hand marks and their commits for task close, defer, and `release commit --close`, the tracked commit beside
  the personal save, the hand-written handoff, each inbox list form, the hand-written route, the queue's read and
  write, the cohort archive sweep and deletion, the decomposition cleanup direction, and the adversarial pass's record
  and entry. Resume of a paused work unit, handover, and removal by ID take steps too. The inventory, each step, and
  the text it comes from are in `notes-cutover-flip.md` § Pre-flip steps.

## **Phase 2:** Store paths the flip completes, and the fence

_Purpose:_ Complete each store path the switch would otherwise leave wrong, missing, or misleading, behind the store's
capability, with the import tests and the fence harness, so the switch adds no code beyond itself.

_Exit criterion:_ With the default store still in-repo, the selection refuses, overrides, and composes, and the root
hook skips or refuses, as § 3 states in their own tests; every § 4 store path, the agenda's handoff anchor (§ 8.9), and
the fence harness pass over the ref backend; and the full suite passes with no behavior change in operation.

### `[x]` **2.1 Re-check `projection-worktrees`' contract once it lands — § 1.3**

- _Goal:_ Each contract item § 1.3 states for `projection-worktrees` holds at `main` once that unit lands, or the spec
  takes a forward amendment before a task consumes it.

- _Outcome:_ Every item holds at `main` merged in at `ac09996b07`, with two amendments: § 2.1 keeps the fan-out
  decoration the landed `createStore` applies (A9), and § 1.3 no longer has that unit delete an untracked npm-policy
  copy, Git's merge refusal naming its removal (A10). The root hook now binds spawn materialization after
  `startProjection` (`bindSpawnMaterialization`), and the fan-out capture skips only for `switch` and `no-identity`
  (`createProjectionFanOutDependencies`), so Task 2.2's `tracked-state` skip covers both. Windows removal and release
  rest on runs 43964135813 and 43974177580.

### `[x]` **2.2 The hook commands skip the projection, and every other command refuses, while `HEAD` tracks state — § 3.2**

- _Goal:_ While a checkout's `HEAD` tracks ARC state and its composed store is the ref backend, the commands its Git
  hooks run — `arc check pre-commit`, `commit-msg`, and `pre-push`, and the pre-commit hook's `hook-*` commands
  (`.arc/system/.internal/githooks/`) — run with the projection off and open no ref store, so the remedy's deletion
  commit, merge, and push pass their hooks, while every other command refuses with § 3.2's remedy before its projection
  starts.

- _Outcome:_ Before `startProjection`, the root hook evaluates `findTrackedStateRefusal` through the `findTrackedState`
  predicate its native input supplies (`lib/store/projection/command-hooks.ts`): a Git hook command,
  `arc check pre-commit`, `commit-msg`, or `pre-push` or a `hook-*` command, starts under the `tracked-state` skip, and
  any other command throws the refusal. `projectionSwitchedOff` (`process-state.ts`) now decides every site that tested
  for `switch`. No hook command's action, and no commit- or push-gate check here, composes a store or runs `arc`.

### `[x]` **2.3 `arc sync` onto `pull` and `push`, with ADR-035's item 2 amendment — § 4.1, § 16**

- _Goal:_ On an off-branch store, `arc sync` pulls then pushes the store after the rebuild of deleted files, publishing
  state first and alone whatever the branch push's outcome, reporting each leg and the push's tripwire figures, running
  neither a notes leg nor the Errand reconcile leg; on a clone with no designated state remote it asks for the
  designation or reports it, pushing no state until one is made.

    - `[x]` **2.3.a The store's sync path in `handleSync`**
        - Off the branch, `handleSync` hands the inspected worktree to `finishStoreSync` (`handlers/sync.ts`): the state
          leg (`runStateLeg`, `handlers/sync-state-leg.ts`), then the branch leg alone over the push and fast-forward the
          notes path now shares (`pushBranch`, `pullBranchInbound`), under `state+…` and `state-only` cells. A rebase in
          progress holds only the branch push; state still publishes. The pull and the push each fan out to the other
          projected checkouts after the rebuild's take-in does, as the decoration does for every pull and push.
        - The outcome's `state` holds the pull and push records, and `tripwires` the push's report when a figure exceeds
          its bound; the audit's `state` token is the pull's leg token, then the push's, joined by ` | `.
        - `arc join`'s designation question and its subprocess moved into `offerStoreDesignation`
          (`handlers/store-designation.ts`), whose run both commands declare; sync asks through its own
          `prompt.sync.store-designation` site, and reports a cancelled or failed designation with its remedy as it
          reports an unanswered one. `arc sync`'s help, which still names the notes leg, joins Task 4.2.c (A11).

    - `[x]` **2.3.b ADR-035's item 2 amendment**
        - ADR-035's 2026-11-17 amendment: `arc sync` publishes state first and alone and reports each push, rather than
          carrying state in the branch's `--atomic` push, grounded in task close's local reachability check and the
          copy key's author and patch ID; it supersedes the 2026-09-29 amendment's code-first order and keeps the rest.

### `[x]` **2.4 The capture gates' `arc inbox` reads over the ref backend — § 4.2**

- _Goal:_ On an off-branch store, `arc inbox <list> --target <slug>` returns the `clear` / `named` / `refused` result
  with each row's ID and version, and `arc inbox <slug>` lists a work unit's inbound list with its pending count and
  oldest age, which is all the three capture gates need from the flip.

- _Outcome:_ The store arm needed no change. `integration/store-ref-inbox-cli.test.ts` drives the registered
  `arc inbox` over real refs: a personal target answers `clear`, `named` with each capture's ID and version, or
  `refused` for a malformed slug; `--target` on the project list or a work unit's slug refuses; and a work unit's
  inbound list reports its pending count and oldest age.

### `[x]` **2.5 The delivery rename source refuses a missing folder off the branch — § 4.3**

- _Goal:_ On an off-branch store, `GitDeliveryRenameTransitionSource` (`lib/delivery/plan-resolution.ts`) refuses when
  the transition folder is absent at the ref, rather than reading empty and resolving a plan under a former name as
  `no-match`, while before the flip a ref with no folder resolves as today.

- _Outcome:_ The source takes the store's capability, and off the branch probes the folder before reading
  (`hasGitTransitionNamespace`), refusing `substrate-unreachable` with a condition that names it. The delivery
  execution and repository entry pass the capability of the store they hold; the member lookup's default,
  `handlers/delivery.ts`, and `delivery-transfer.ts` build it through `createCheckoutDeliveryRenameTransitionSource`.
  The native delivery fixtures commit a transition record at their base (`notes-cutover-flip.md` § Test callers).

### `[x]` **2.6 The base-drift resolver onto stored completed records — § 4.4**

- _Goal:_ On an off-branch store, `createCompletedMetaResolver` (`lib/base-drift/current-adapters.ts`) names each
  integration from the store's completed records, so base drift and a squash or rebase project's checkpoint keep naming
  the work unit after no completed meta lands on base.

- _Outcome:_ `createCurrentBaseDriftAdapters` takes the caller's store, and with state off the branch builds
  `createStoreCompletedResolver`, which names a merge or proves a squash by the pull request number in an archived
  meta's `PR URL`, reading the completed records once and naming none for a number two records share. The five
  importers pass the store they hold; `handleBaseDrift`, which held none, composes the default store as
  `handleBaseSync` does.

### `[x]` **2.7 The store archive records `PR URL` and `Completed` — § 4.5**

- _Goal:_ The store arm of `arc archive` (`runStoreArchive`, `lib/work-unit/verbs/archive-store.ts`) writes `PR URL` and
  `Completed` in its one batch, so the archived meta's readers (`completedRecord`, `lib/store/lifecycle-completed.ts`;
  `completed-index.ts`) and base drift keep both fields.

- _Outcome:_ Both arms resolve the facts through `resolveArchiveFinalizeFacts` (`lib/work-unit/verbs/archive-finalize.ts`),
  and the store arm writes them into the meta content its one batch already carries, adding the absent-URL warning to
  its result.

### `[x]` **2.8 Integration checkpoint records keyed by work-unit UID — § 4.6**

- _Goal:_ On the store path, the integration checkpoint writes and reads its records under the identity's
  `.internal/integration-checkpoints/<work-unit-uid>/`, machine-local, and matches them by that UID, so `arc rename`
  orphans none and the retired per-work-unit workspace holds none.

- _Outcome:_ The writer and the merge's reader take one `IntegrationCheckpointLocation`, resolved from the store's
  capability (`integrationCheckpointLocation`): the workspace, matched by slug, before the flip; on the store path the
  identity root, where the writer files a record under its binding's UID and the reader finds the handle's record in
  whichever UID folder holds it, refusing a binding that names another folder. So a completed generation's record is
  still found after its slug is reused. The ownership check resolves the invoked work unit rather than the record's
  slug. A Candidate blocks a store rename, so the renamed case arises at a landed merge's link retry.

### `[x]` **2.9 `arc init` designates the state remote and mints the project ID — § 4.7**

- _Goal:_ From the flip, `arc init` designates the code remote as the state remote at creation where one exists, and
  mints the project ID into the registry's create-only identity record, pulling first and adopting an ID it finds where
  a remote is already designated (`spec-storage-ref-backend.md` § 9.2, § 9.8).

- _Outcome:_ On an off-branch store, init runs `runStoreCreationDesignation` (`lib/store/create.ts`) after its lock and
  installed check: it sets `push` on the backend's code remote through the remote setting, or reports a remote that
  already carries a role, which init then pulls, refusing `init.state-remote` on a failed pull. The identity read moves
  after it, and `mintProjectIdentity` (`lib/store/project-identity.ts`) mints before any install write, only where a
  complete listing holds none, so an init refused later keeps its one ID on the re-run. The import writes the same
  record through `projectIdentityRecord`.

### `[x]` **2.10 The Errand branch's suffix and every reader of it — § 4.8**

- _Goal:_ On the store path, `arc errand open` names an Errand's branch `<type>/<slug>-<suffix>`, the suffix eight
  lowercase hex characters it mints before its one write, records that branch link, and every reader that derives an
  Errand's slug from its branch or matches an Errand's branch exactly takes that form.

    - _Amended in:_ 3.R5 (A18).

    - `[x]` **2.10.a The builders**
        - Open names a new branch through `errandBranch` (`lib/errand/branch-type.ts`), with the suffix
          `mintErrandBranchSuffix` mints, which the runtime supplies only when its store keeps state off the branch;
          `cutErrandBranch` takes the record's branch. Five store-path CLI suites fix the minted suffix to name the
          branch they plant or assert.

    - `[x]` **2.10.b The record's validation and resume's recorded-branch check**
        - `errandBranchType` (`lib/errand/branch-type.ts`) reads the type from `<type>/<slug>` or
          `<type>/<slug>-<eight lowercase hex>`; `validateOrdinaryNamespace` and `validateResumeContinuity` both use it,
          and the housekeep routing and grooming validators keep their checks. Done ahead of 2.10.a, whose suffixed
          branch the record's schema must first admit.

    - `[x]` **2.10.c Review readiness's identity facts**
        - On an off-branch store, `identityFacts` (`scripts/review-gate/readiness.ts`) skips both the slug test and
          the Errand split-shape check, and `evaluateStoredErrandReadiness` (`readiness-store.ts`) refuses
          `errand-branch-mismatch` unless the head branch is the record's branch link for the project. The Errand
          merge's lock and `arc review readiness` now pass their store for Errand vehicles; both lock roots are tested.

    - `[x]` **2.10.d The remaining readers**
        - The display-only residue slug for an unlinked branch (`lib/git/in-flight-store.ts`) names a suffixed Errand
          branch by the slug before its suffix (`suffixedErrandBranchSlug`). The search re-run at head found the same
          readers, recorded in `notes-cutover-flip.md` § Errand branch readers; the grooming claim, the housekeep routing
          record, and the import's created-branch test (`lib/store/ref/import/code-links.ts`) keep their own checks.

- _Outcome:_ On the store path an Errand's branch is `<type>/<slug>-<suffix>`, and nothing ties it to its Errand by
  rebuilding the branch from the slug: the record admits both forms, resume and review readiness compare the branch
  with the record's (readiness through its stored branch link), and the search and each reader's outcome are in
  `notes-cutover-flip.md` § Errand branch readers.

### `[x]` **2.11 The cohort record's member-sections write check — § 4.10**

- _Goal:_ A hand edit of a cohort record whose `## Members` names a slug that is not the current name of a member of
  that cohort refuses, naming each such slug with its remedy, while a verb's write never refuses over a section it
  leaves.

- _Outcome:_ `checkCohortMemberSections` (`lib/store/kinds/cohort/member-section-rule.ts`) joins `checkCohortDocument`:
  a hand edit whose resulting record keeps a `## Members` section naming no current member refuses, naming each slug.
  Members come from work units' holdings alone over the proposed state (`observeAllMemberHoldings`), kept where the
  `Cohort` path holds the cohort at its last segment, so an open conflict on a cohort record never refuses the edit; the
  fence harness (Task 2.13) found the first form, which read every cohort's Parent, refusing a retry merged into a
  conflict. A verb's write passes, so the retirement's kept section and rename's kept heading are refused by the
  record's next hand edit (`member-sections.test.ts`, `terminal-records.test.ts`, `store-ref-rename-uid-cli.test.ts`).

### `[x]` **2.12 Import tests over the identity refs' leases and permuted listings — § 7.6, § 13.3, § 13.4**

- _Goal:_ The import's landing and retirement leases, and its independence from listing order, are each shown by a test
  of a refusal and a continuation, over copies the quiesce check admits.

    - `[x]` **2.12.a The landing lease**
        - `integration/store-ref-import-transient-observations.test.ts` covered the refusal in both layouts but retried
          only after resetting the ref. A default-layout case now refuses the landing with the lease notice and nothing
          landed, and a fresh run with the ref still advanced imports its new tip.

    - `[x]` **2.12.b The retirement lease**
        - In the default layout, `origin`'s copy advanced at the remote-delete step refuses "advanced after the import
          read it" with the kept tips unchanged and the imported records in place; reconciling `origin`'s ref to the
          tip the import read and re-running retires it and drops the kept tips (same file).

    - `[x]` **2.12.c Permuted listings**
        - `integration/store-ref-import-order.test.ts` imports two copies prepared alike, one with every branch,
          fetched-ref, and linked-worktree listing reversed by wrapping the ports' `exec`, and compares their records
          keyed by owner and path with each minted UID mapped to its owner, over a parked unit, a fetched-only unit,
          a branch with matching local and fetched copies, and two linked worktrees.

- _Outcome:_ Test-only: each lease and the order independence already held. The fixtures meet § 1.3's stated quiesce
  conditions rather than running the check, which `cutover-window-tooling` has not landed; Task 6.1 re-checks that
  contract.

### `[x]` **2.13 The fence harness over the take-in, the archive, and the register closures — § 14**

- _Goal:_ One harness on the ref and reference backends injects a store change between preparation and the batch, per
  read family each writer takes, and every case either refuses with nothing written and then retries correctly, or
  admits only what fresh preparation would write; an unrelated write admits.

    - `[x]` **2.13.a Each writer's read families**
        - Recorded in `notes-cutover-flip.md` § Fence read families: a meta's take-in reads the meta, each cohort on its
          path, and its slug; a cohort record's, with member sections, every work unit's meta as well; the archive its
          subject, both inventories, each open cohort, the cohorts on its path, and each record holding one of them.

    - `[x]` **2.13.b The harness**
        - `runFenceCase` (`__tests__/helpers/store/fence-harness.ts`) lands the change when the writer submits its
          first batch, after the archive's revalidation. A refusal must leave the store as the change left it, and a
          fresh run then decides; an admission must leave each record as a fresh dry run's batch writes it, since the
          store merges a stale expected version rather than refusing it. `store-ref-fence.test.ts` runs every family
          on both backends.
        - Unobserved, now observed: each member's meta and open subcohort holding a cohort on the archive subject's
          path, in both of the archive's batches (`observeArchiveHoldings`, `archive-store.ts`). The stale
          final-member case in `archive-store.test.ts` now refuses on that observation before `cohort.archive-closeout`.
        - `runFenceOverRepository` (`__tests__/helpers/store/fence-repository.ts`) fetches a repository's `refs/arc/*`
          into a scratch repository with no remote, runs one case per record the writer reads and one unrelated
          write, and fails if the source's refs moved.

- _Outcome:_ Every family refuses with nothing written and then decides afresh, or admits what fresh preparation
  lands. A cohort record's take-in also refuses on a change to any work unit's meta, which its member-sections check
  reads; only a write outside every family admits there. The harness also found that check refusing a merged retry
  (fixed under Task 2.11).

### `[x]` **2.14 Session-init's handoff anchor on the store — § 8.9**

- _Goal:_ On an off-branch store, the agenda takes its handoff freshness baseline and Session Type from the meta's
  handoff fields, so a resume after the switch keeps both though the load set omits SESSION-NOTES there
  (`resolveLoadSetManifest`, `lib/load-set/projection.ts`).

- _Outcome:_ The agenda's context compiler (`commands/agenda/context.ts`) reads SESSION-NOTES unless the entry's store
  reports `stateOffBranch`, and then the projected meta: its `Session Type` as the override, and its `State at Handoff`
  compared with the store's version (`compileStateFreshness`), listing each change the store's `changes` returns and
  whether the meta changed. The handoff write that recorded the baseline lands after it and is left out, so a resume
  with nothing since reports no gap. A meta with no session context renders the checkout's history after its read
  (`renderCheckoutHistory`, `commands/agenda/reads.ts`).

## **Phase 3:** The switch

_Purpose:_ Make the ref backend every command's default through green commits: the installed files leave the projected
roots first, a temporary override in the spawn helpers carries the spawned tests across the switch, and each family of
spawned tests then seeds through the store and drops it, so the first end-to-end run of the flipped CLI comes as early
as its substrate allows.

_Mode:_ `slice` — closes on the built CLI opening the ref backend by default, refusing over tracked state, and building
the in-repo implementation only under the override, with no spawned test resting on the temporary override.

_Exit criterion:_ In a scratch repository the built CLI initializes, with no override, `arc status --json`'s projection
probe reports the ref backend's projection rather than `disabled` over a tree that tracks no ARC state; once a file
under § 3.2's paths is committed, every command but the hook commands refuses with § 3.2's remedy and the hook commands
project nothing; under the override the probe reports `disabled`; the spawn helpers set no override by default; and CI
passes on this branch through its steps' override condition.

_Design decisions:_ The switch lands in stages, each commit green; see `notes-cutover-flip.md` § The switch's increment.

### `[x]` **3.1 The installed files and their presence test leave the projected roots — § 5.2, § 5.3, § 7.4**

- _Goal:_ The installer writes no file into `.arc/active/`, `.arc/backlog/`, or `.arc/completed/`, and nothing checks
  for one: the `completed/README.md` Configurable file and the `backlog/ATOMIC-INBOX.md` and `backlog/ROADMAP.md`
  templates are deleted from the package rather than relocated within its `arc/`, and `verify-integrity.sh`'s presence
  test for `ROADMAP.md` goes with them in both copies.

    - `[x]` **3.1.a The files and their claims**
        - The three files leave the package with their `init-recipe.json`, `SCAFFOLDED_FILES`, `CONFIGURABLE_FILES`, and
          self-hosting `manifest.json` entries; the `arc-in-git` arm keeps only the planning-module strategy, and
          `classification.ts` drops its `arc/surface-names` suppression with the lines that held it.
        - `strategy-file-classification.md`, both copies: PROJECT-PRD and TECHNICAL-OVERVIEW are the Scaffolded
          examples, `PROJECT-PRD.template.md` the suffix example, and ROADMAP leaves the one-shot list.
          `strategy-package-project-sync.md`'s inventory follows (148 installed files, 43 Configurable, 2 Scaffolded, 8
          template counterparts), which `framework-sync.test.ts` checks.
        - The coupling audit's `installedDelta` drops both `.arc/backlog/` paths; its test reads the checked-in corpus
          directly, and the captured fixtures are deleted.

    - `[x]` **3.1.b The presence test**
        - `verify-integrity.sh`, both copies, drops the `arc-in-git` check for `backlog/ROADMAP.md` and still reads
          `pm.mode` for the strategy inventory; the in-repo ROADMAP arms, `DERIVED_VIEWS`, and the `project-document`
          address stay.

    - `[x]` **3.1.c The tests over them**
        - An `arc-in-git` init, in process and end to end, installs the planning-module strategy and nothing under the
          three roots; `pm.mode=none` is checked by that strategy's absence, and the reconfigure end-to-end cases mark
          the arm by it. Their `--yes` removal case keeps only its Framework leg: the arm no longer installs a Scaffolded
          file, and `removal-prompts.test.ts` keeps the non-Framework default.
        - The project inbox test asserts no installable file maps to the inbox's projected path, and
          `entry-reference.test.ts` stops parsing the deleted template. Hand-built recipes in the reconfigure, init,
          manifest-plan, and recipe unit tests name `TECHNICAL-OVERVIEW.template.md` or the planning-module strategy.
        - `e2e/lifecycle-exit.e2e.test.ts` and `e2e/rename.e2e.test.ts` commit a ROADMAP in their fixtures, since their
          in-repo park landing and rename carry the one the install wrote.

- _Outcome:_ No `pm.mode` installs a file into a projected root. An existing project keeps its copies: `arc update`'s
  removal arms (`lib/manifest/apply.ts`) leave a Scaffolded file and keep a Configurable one for review.

### `[x]` **3.2 The store seeding helper and the temporary spawn override — § 7.3**

- _Goal:_ A spawned test can seed the records it needs into its temporary repository's store through one helper, and
  until each family moves onto it, the spawn helpers carry every spawned test across the switch on the in-repo
  implementation.

    - _Amended in:_ 3.R (A12).

    - `[x]` **3.2.a The seeding helper**
        - `seedStore` (`__tests__/helpers/store/seed-store.ts`) creates the given records in one batch through
          `createDefaultRefStorePorts` as the given identity, and returns each reference, its minted owner UID included,
          with its version; over a `HEAD` that tracks ARC state it throws the tracked-state refusal before any write.
        - `integration/store-seeding-fixture.test.ts` reads the seeded records back through `selectStore` over the
          default store ports, the composition `createStore` takes at the switch: before the switch no built-CLI verb
          reads arbitrary records through the ref backend, so the spawned tests that move onto the helper read them
          through the CLI.

    - `[x]` **3.2.b The temporary spawn override**
        - `builtCliEnvironment` and `runCli` set `ARC_IN_REPO_STORE` beneath the caller's environment, so a spawn drops
          it by passing it as `undefined`, and `integration/validate-cohort-consistency.test.ts` sets it on its `tsx`
          spawn of the cohort hook's script. No command selects through it until the switch.
        - _Retired in:_ Phase 3

### `[x]` **3.3 The switch, with the in-process tests whose expectations rest on the default — § 2.1, § 7.2**

- _Goal:_ `createStore` builds through Task 1.1's selection, so every store a command opens reports `stateOffBranch`
  true, and every surviving test that reaches the default in process expects the ref backend.

    - _Amended in:_ 3.R (A12).

    - `[x]` **3.3.a The switch**
        - `createStore` (`lib/store/create.ts`) wraps `selectStore` in the fan-out decoration, so `openDefaultStore` and
          every other default caller open the ref backend unless the override is set.
          `integration/store/projection/fan-out-ref.test.ts` writes through the default store a command opens and finds
          the sibling checkout's file refreshed (A9).
        - The flip's checkout sets `ARC_IN_REPO_STORE=1` in its worktree's untracked `.claude/settings.local.json`.

    - `[x]` **3.3.b Direct callers and in-process dispatch whose subject survives**
        - Of the callers Task 1.4 recorded as expecting the ref backend, two failed at the switch and moved:
          `integration/command-surface-documentation`'s remote-designation case expects the default to keep state off
          the branch, and `integration/view-store-cli` compares the working tree alone, the command's default store
          keeping its own state under `.git`, and writes its projected spec in the claimed folder
          (`.arc/active/current/`). The rest pass unchanged.
        - Every other in-process failure is on the switch's ledger (Task 3.3.d).

    - `[x]` **3.3.c Through handlers and scripts**
        - `repair-cli`'s mock returns only a bound store and throws when a test composes one with none bound; the 47
          files that reach it pass.
        - `integration/handoff-write-store.test.ts`'s schema case dispatches from a temporary repository, its store
          bound.
        - `commands/agenda/notes.ts` and `legacy-materialize.ts` are gone with their tests, and `combine.ts` with them,
          which only joined a worktree pull to a notes pull or load: the agenda compiles no notes pull or load, renders
          no notes or retired-subdirectory surface, offers no in-place materialize, and renders checkout history for
          any absent SESSION-NOTES. The sync channel value that ran only notes is now `none`. The envelope's notes slots
          stay for notes removal.

    - `[x]` **3.3.d The switch's ledger**
        - `IN_REPO_STORE_LEDGER` (`__tests__/helpers/in-repo-store-ledger.ts`) lists 138 files: 37 unit, 85
          integration, the store suite `store-ref-init-designation` among them, and 16 end-to-end.
          `applyInRepoStoreLedger` names the collected file (`getCurrentSuite().file`), sets the override for a listed
          one, and restores it after the file; `unit-setup.ts` calls it after clearing the override, and the other four
          projects load `in-repo-store-ledger-setup.ts`. `unit/in-repo-store-ledger.test.ts` pins the collected path
          and the list's form. The store suites' reach map widens on both files, which the configuration loads by path,
          and `store-ref-timing-isolation`'s synthetic checkout stubs the setup as it stubs the index guard.
        - _Retired in:_ Phase 3

- _Outcome:_ Run without the ledger, each of the 138 listed files fails; with it, the unit, integration, end-to-end, and
  store suites pass, so every test that reaches the default in process either expects the ref backend or runs from the
  ledger until Task 3.R or its Task 3.4 family moves it.

### `[x]` **3.R The switch's ledger, its suspected defects first — § 7.3**

- _Goal:_ Each file the switch's ledger lists that no Task 3.4 family or Task 3.5 moves leaves the ledger, each of its
  cases expecting the ref backend or, where the case's subject is the in-repo arm or an operation that runs only on
  `main`'s pre-flip build, selecting the in-repo implementation itself: building it explicitly, or setting the override
  where its path takes no store. Each failure the switch exposed that may be a product defect is diagnosed against the
  ref default first (A12).

    - `[x]` **3.R.a The suspected defects**
        - Three held stale expectations and left the ledger. `set-class` seeds its meta through the store; its refusal
          over a missing checkout copy runs on the in-repo implementation. `init` with no store passed now designates
          and mints, so the in-repo case builds that store, and the join runs in a clone whose state was never
          published. `init` over a linked personal directory seeds the store and writes nothing through the link; its
          refusal stays an in-repo case.
        - The warning outside a Git repository was a defect: with no ARC root the root hook bound the working directory,
          so a command outside any work tree, or in a subdirectory of one, reported that directory's Git directory
          missing, and in a repository where ARC is not installed, `arc init` included, the ignore guard asked for the
          rule `init` writes. Without an ARC root a command now starts with no projection (`command-hooks.ts`,
          `integration/store/projection/command-hooks-native.test.ts`). An installed root with no Git directory still
          reports it missing, as a primary whose Git directory went does (Owner, 2026-11-18), so
          `e2e/config-validate.e2e.test.ts`'s nested-directory case left the ledger as an installed project's
          repository.

    - `[x]` **3.R.b The window tooling**
        - The 32 listed window files left the ledger. Each sets the override around its cases
          (`useInRepoStoreForEach`), its fixtures and the operations before the merge included, while `invokeWindow`
          (`helpers/cutover-window/run.ts`) runs `compare`, `confirm`, and `close` with it cleared
          (`withoutInRepoStore`) and the end-to-end spawns drop it for them; all three open no store, so none failed.

    - `[x]` **3.R.c Review, Candidate, publication, and delivery**
        - 31 files left the ledger, classified by case in `notes-cutover-flip.md` § Test callers; none exposed a product
          defect, since the production handlers bind the work item from the store. Cases whose subject survives bind a
          checked store holding their work unit, or seed the project identity through the store; those over the in-repo
          arm's own records pass the in-repo store (`inRepoStoreAt`, `helpers/store/in-repo-ports.ts`) or set the
          override where their path opens the default itself. `review-status-base-movement` and
          `review-status-errand-base-movement` stay listed for Task 3.4.f, and `exact-target-read-isolation` for 3.R.d.

    - `[x]` **3.R.d Session, status, lifecycle, user, and release**
        - The rest: the session and status readers, the lifecycle verbs, `init`, `join`, `user`, `sync`, release commit
          and push, and the projection's hook dispatch (`integration/store/projection/cli-hooks.test.ts`). Among them
          are the unit tests whose scripted `exec` meets the tracked-state predicate's tree read at first use, and the
          end-to-end tests that start the CLI or `git` outside the spawn helpers and that no Task 3.4 family reaches.
        - _Amended (Owner, 2026-11-18):_ its 53 files failed 683 cases under the ref default, about
          three times Task 3.R.c's, so the group runs as four review increments by subject. This task takes the user,
          Git notes, park, and ROADMAP files; Tasks 3.R.e to 3.R.g take the rest.
        - 15 files left the ledger, classified in `notes-cutover-flip.md` § Test callers. Each subject runs only on the
          pre-flip build, so its cases set the override, `integration/user`'s and `store-imported-seal`'s once-built
          fixtures included (`withInRepoStore`, `helpers/in-repo-store-override.ts`); `user add`, which survives, reads
          its seeded records back from the store.

    - `[x]` **3.R.e Release commit and push**
        - 4 files left the ledger, classified in `notes-cutover-flip.md` § Test callers. The release cascade reads the
          checkout's work unit only for its audit and its ambiguity refusal, so its cases bind a checked store through a
          partial mock of `createStore` and a marker-bound meta; the multi-candidate refusal and the resolver's
          active-meta cases run in-repo.

    - `[x]` **3.R.f Lifecycle verbs, start, `init`, `join`, and the executor**
        - `unit/handlers/lifecycle-verbs`, `unit/commands/start`, `integration/start-dispatch`, `unit/init`,
          `integration/init`, `unit/join`, `unit/work-unit/executor-context`, `integration/executor-store-rebind`,
          `integration/errand-promote`, `unit/decompose-preflight-handler`, and `integration/store-lifecycle-storage`.
        - _Amended (Owner, 2026-11-18):_ `unit/handlers/lifecycle-verbs`, `unit/commands/start`, and
          `integration/start-dispatch` move to Task 3.R.h; their surviving cases need store-arm fixtures their files
          never had.
        - 8 files left the ledger, classified in `notes-cutover-flip.md` § Test callers; none exposed a product defect.
          `init`, `join`, and `executor-context`'s withdrawal cases run on a checked store; `store-lifecycle-storage`
          gives its compositions the fixture's in-repo store instead of an override, and Errand promotion and the old
          decomposition machine set the override by file.

    - `[x]` **3.R.g Session and status readers, `arc sync`, checks, and the projection's hooks**
        - _Amended (Owner, 2026-11-18):_ the Candidate session-init subjects the store has no case for move to Task
          3.R.i.
        - 23 files left the ledger, classified in `notes-cutover-flip.md` § Test callers; none exposed a product defect.
          The status readers' cases over a work unit's own fields hold its meta in a checked store bound by marker
          (`helpers/store/held-meta.ts`), and those over what only tracked files hold pass the in-repo store. `sync`'s
          notes matrix, Git-notes publication, the commit hook's tracked task lists, and the project view over branch
          refs and the index run in-repo. Two status fixtures gained the ignore policy `arc init` commits, and
          `store-project` gained the store case for the readiness warnings' channel.

    - `[x]` **3.R.h Lifecycle handlers and start on the store arm**
        - _Amended (Owner, 2026-11-18):_ the handler-level store cases for attest's and publish's version-two boundaries
          move to Task 3.4.c.
        - 3 files left the ledger, classified in `notes-cutover-flip.md` § Test callers; none exposed a product defect.
          `lifecycle-verbs` binds a checked store holding its work unit through the production executor binder, and 52
          of its 99 cases run on it; decompose, park, resume, and the cases dispatching the in-repo materialize and
          abandon verbs select the in-repo implementation. `start`'s spec-input classification runs the store's cold
          start, while its tracked scaffold, `plan/` cut, occupancy guard, and create-new spawn stay in-repo, as do 23
          of `start-dispatch`'s 31 cases, four of which had passed on the ref default for another reason. `start-store`
          and `start-store-alias` gain the store cases create-new's spawn and the live-start refusals lacked. Three
          attest cases and one publish case over a schema-1 boundary run in-repo with no handler-level store case.

    - `[x]` **3.R.i Candidate session-init projection on the store arm**
        - _Amended (Owner, 2026-11-18):_ from Task 3.R.g, whose Candidate cases in `integration/active` and
          `integration/status` read Candidate files only the in-repo implementation holds. Each subject the store's
          session-init projection has no case for runs over Candidate records in a checked store: the exact Active
          prepublication boundary, the stale-subject fallback, an unavailable Candidate record, the publication
          reservation, applicability awaiting authority, fix authority outside prepublication, and an Integrating
          boundary naming another subject. The list is in `notes-cutover-flip.md` § Test callers.
        - The seven subjects run over Candidate records in a checked store (`unit/active/status-store`), classified in
          `notes-cutover-flip.md` § Test callers; six held as built. The unavailable record exposed a product defect: a
          refused Candidate read left an Active work unit in Candidate preparation classified as execution, where the
          in-repo arm and the derived locus withhold it, so `arc active status --session-init` now leaves its session
          type unresolved (`commands/active/status.ts`).

### `[x]` **3.R2 The orphan sweep reads absent claims as an empty inventory — § 4.11**

- _Goal:_ On the store the orphan-branch sweep reads an authoritatively absent claims acquisition as no claimed
  branches, so a person holding no claim records gets its cleanup offers, while a failed acquisition, one that missed
  entries, one carrying diagnostics, and a missing identity still decline the sweep (A15).

- _Outcome:_ `completeClaimBranches` (`lib/session-init/orphan-store-candidates.ts`) reads an `absent` acquisition as
  no claimed branches, and a listing that missed entries without diagnostics now declines as not complete rather than
  with an empty condition. `integration/orphan-store-branches.test.ts` offers a Shipped work unit's branch its teardown
  with no claims held, beside the failed, missed, diagnosed, and identity-less declines. The four session-envelope
  goldens that carried the decline (orient, active-resume, branch-gone, current-husk) each lose only its warning, their
  sweeps finding no orphan; the residue reason is unchanged.

### `[x]` **3.R3 The orphan sweep leaves out a branch no record links — § 4.12**

- _Goal:_ On the store the orphan-branch sweep leaves out a gone-upstream branch no record links, offering nothing for
  it, so that branch no longer withholds the offers beside it, while any other refused lookup or read and a conflicting
  or ambiguous link still decline the sweep (A16).

- _Outcome:_ `resolveStoreBranch` (`lib/session-init/store-branch-classification.ts`) reads a `not-found` lookup as
  `unlinked`, apart from a failure, and `readOrphanStoreCandidates` leaves that branch out on both sweep paths, while
  `storeLocusOwnsBranch` still acts only on a resolved branch. `integration/orphan-store-branches.test.ts` keeps a
  Shipped work unit's teardown beside an unlinked branch, and a lookup refused for another reason still declines the
  whole sweep. No session-envelope golden changes.

### `[x]` **3.R4 A command runs unprojected when its Git directory is not writable — § 4.13**

- _Goal:_ On the store a command whose projection state folder or lock file cannot be created, refused `EACCES`,
  `EPERM`, or `EROFS`, runs with projection disabled and reports the skip naming the Git directory it cannot write, as
  it does for a held or lost lock, so session-init stays passive over read-only Git metadata (A17).

- _Outcome:_ `withProjectionLock` (`lib/store/projection/lock.ts`) returns `unwritable`, its report naming the Git
  directory and the code, when the state folder's or lockfile's create is refused with one of the three codes; any other
  failure still ends the command. `recordProjectionLockSkip` carries that report with the unchanged retry remedy. The
  lease's other consumers report it too: sync restoration no longer reads it as a missing Git directory, and spawn
  materialization, sibling fan-out, and removal name the directory. `integration/store/projection/engine.test.ts`
  covers both creates and the retry once writable.

### `[x]` **3.R5 The store admits the UID open's plan mints for a fresh Errand — § 4.8**

- _Goal:_ On the store under full protection `arc errand open` opens a fresh Errand, for a slug no record holds and for
  one whose earlier generation has completed, its one write naming the UID its plan minted, which the store admits for
  the owner whose record that write creates and records as that owner's birth, while a write naming a UID no owner
  holds without creating its record is still refused (A18).

- _Outcome:_ `resolveOwner` (`lib/store/ref/write-resolution.ts`) admits a requested UID no owner holds when the batch
  puts that owner's `work-item/record` with no expected version (`plannedRecordOwners`) and enters it among the batch's
  fresh owners, so the creation receipt records its birth. `integration/store-ref-errand-uid-cli.test.ts` opens a fresh
  Errand and a new generation over a completed one through the registered CLI on the ref store, each with its receipt,
  beside a description-only write naming an unheld UID that still refuses.

### `[x]` **3.R6 Store teardown refuses a markerless holder and completes a removing self-teardown — § 4.14**

- _Goal:_ On the store `arc teardown` refuses a linked checkout that holds the retiring branch without an ARC ownership
  marker, before any detach or ref change, as the in-repo selection does, and a self-teardown under
  `arc.selfTeardownMode: remove` removes its checkout and reaps the branch from the primary checkout (A20).

    - _Amended in:_ 3.R7 (A21).

- _Outcome:_ `runStoreTeardown` (`lib/work-unit/verbs/teardown-store.ts`) refuses, before cleanup starts, when a linked
  checkout whose folder remains holds the retiring branch ARC created with no ownership marker (`refuseUnmarkedHolder`),
  keeping an adopted branch's holder and a further link's holder as before, and a self-teardown that moves to the
  primary reopens its store and rebinds its evidence there (`reopenFromPrimary`, `rebindRetirementEvidence`) through
  the `reopenStore` port the teardown command supplies. Both failed first in `unit/work-unit/verbs/teardown-store.test.ts`
  over a retirement harness given a linked checkout, the removing case through a store that refuses once the process
  moves, beside an adopted-branch guard; `e2e/teardown.e2e.test.ts`'s markerless and remove-preference cases, which
  move in Task 3.4.b.1, pass through the built CLI with the fix.

### `[x]` **3.R7 The store outlives the checkout it opened in — § 4.14**

- _Goal:_ On the store a command that removes the checkout it runs in completes its remaining store reads and writes:
  `arc abandon` and `arc errand abandon`, run from the checkouts they remove, retire their record and reap the branch
  they created (A21).
- _Outcome:_ The store's Git calls run in the checkout it opened in while it exists and in the primary after, and its
  locks, ref lookups, and machine ID use Git directories read once, at its first Git call
  (`lib/store/checkout-location.ts`). `e2e/store-checkout-removal.e2e.test.ts` runs abandonment, Errand abandon, close,
  and leave, and a remove-mode self-teardown, each from the checkout it removes; `reopenStore` left. See
  `notes-cutover-flip.md` § A21.

### `[x]` **3.R8 A store rename settles its checkout's deferred move — § 4.15**

- _Goal:_ On the store, once a self-rename's deferred checkout move has landed, a replay of `arc rename` clears the
  pending move from the checkout's marker and leaves a move that has not landed pending; the deferred rename's
  follow-up and session-init's offered move each name that replay (A22).
- _Outcome:_ A replay asks the command's checkout adapter to settle the holder's move (`settleCheckoutMove`,
  `commands/rename-store.ts`), which reruns the checkout's rename transaction with the move cleared only when the
  marker's pending move names this rename's target and records the holder's path as its destination.
  `integration/rename-store-command.test.ts`'s deferred-move case replays before and after the move and fails without
  the settle; `e2e/rename.e2e.test.ts`'s store self-rename case, which moves in Task 3.4.b.3, passes through the built
  CLI.

### `[x]` **3.R9 Active status reads a bound checkout's Candidate — § 4.16**

- _Goal:_ On the store, `arc active status` and session-init's `active` slot read the Candidate authority and
  integration boundary of a work unit held in the checkout bound to it under the nested layout, taking the work unit
  from the owner the active scan selected (A23).
- _Outcome:_ `readSubject` (`lib/store/active-review-access.ts`) reads the work unit by the owner the scan supplies and,
  given none, identifies the meta's path through the checkout's layout context. `unit/active/status-store.test.ts`'s
  Integrating case runs in full and session-init status under the nested layout, and
  `unit/lib/store/active-review-access.test.ts` reads by owner and by layout; each failed first. The lineage suite's
  mechanically carried and change-set fix cases, which move in Task 3.4.c.2, pass on the store with the fix.

### `[ ]` **3.4 Spawned tests move onto the store by family — § 7.3**

- _Goal:_ Each spawned test whose subject survives seeds its state through the store and drops the temporary override,
  one family per commit, while each whose subject is the in-repo arm keeps the override explicitly and leaves with that
  arm.

- _Note:_ A test that adds `origin` after `arc init` meets an undesignated state remote on push and archive; see
  `notes-cutover-flip.md` § Undesignated remotes in tests.

- _Note:_ A file the switch's ledger lists that the family's shared seeders or spawned cases reach moves in the
  family's commit, its in-process cases with it, and leaves the ledger.

    - `[x]` **3.4.a Session-init and the agenda**
        - Among them `prepareSessionEnvelopeFixture` (`__tests__/helpers/session-envelope-compat.ts`).
        - _Amended (Owner, 2026-11-19):_ its 14 end-to-end files failed 49 of their 80 cases without the override, so
          the family moves in four review increments, one commit each, rather than § 7.3's one commit, each dropping
          the override through one file-level switch; the cases are classified in `notes-cutover-flip.md` § Test
          callers.

        - `[x]` **3.4.a.1 The agenda entries**
            - The nine `agenda*` end-to-end files spawn through `e2e/store-default.ts`, taking the override from the
              test process, and seed through `seedWorkUnit` and `seedStore`; the Plan entry's ambiguous slug and the
              temporary-ref families stay in-repo, beside a store case for the inspections' passivity
              (`notes-cutover-flip.md` § Test callers).

        - `[x]` **3.4.a.2 The session envelope's wire locks**
            - `e2e/session-envelope-compat.e2e.test.ts` and `prepareSessionEnvelopeFixture` spawn through
              `e2e/store-default.ts` and seed through `seedWorkUnit`, the orient arm attesting through the verb; each of
              the seven goldens changes only where a traced store contract does, and the benchmark reusing the seeder
              clears a checkout's own override (`notes-cutover-flip.md` § Test callers).
            - _Amended in:_ 3.R2 (A15)

        - `[x]` **3.4.a.3 Session initialization and recovery**
            - `e2e/session-init.e2e.test.ts` spawns through `e2e/store-default.ts` and seeds bound work units through
              `seedWorkUnit`, its Candidate cases attesting through the verb and integrating through
              `integrateAttestedWorkUnit`, which the envelope seeder now shares; the v3 Errand identity, the all-heads
              original, and the omitted-blob husk keep the override in an in-repo block, and each changed expectation
              traces to a store contract (`notes-cutover-flip.md` § Test callers).

        - `[x]` **3.4.a.4 The compaction anchor, remote boundaries, and orphan cleanup**
            - `e2e/precompact-locus-anchor.e2e.test.ts`, which leaves the ledger, `session-init-remote-boundary`, and
              `session-init-orphan-actions` spawn through `e2e/store-default.ts`. The anchor designates its state
              remote and seeds its parent and Planning work units through `seedWorkUnit`, binding the transfer case's
              markers to the record; the shallow clone joins the published store while the promisor and omitted-tree
              husk cases keep the override; each orphan branch links through an ended Errand record. The one changed
              expectation, the store's materialization offer, traces to a store contract (`notes-cutover-flip.md`
              § Test callers).

    - `[x]` **3.4.b Start, teardown, rename, reconcile, and retirement**
        - Among them `integration/validate-cohort-consistency.test.ts`, which spawns the cohort hook's script outside
          the spawn helpers with its own override (Task 3.2.b), classified by § 7.3's rule.
        - _Amended (Owner, 2026-11-19):_ its eight end-to-end files and the cohort hook's test failed 63 of their 128
          cases without the override, and 18 more never ran, so the family moves in four review increments, one commit
          each, rather than § 7.3's one commit; each increment classifies its cases before editing
          (`notes-cutover-flip.md` § Test callers).

        - `[x]` **3.4.b.1 Teardown**
            - `e2e/teardown.e2e.test.ts` spawns through `e2e/store-default.ts`, initializing on the process's store, and
              `prepareSelfTeardown` holds its Shipped work unit completed in the store (`seedWorkUnit`), binding the
              marked checkout to that record; `teardown-stale-projection` and the receipt-backed target stay in-repo
              beside a store not-found case, and each changed expectation traces to a store contract or an Owner
              decision (`notes-cutover-flip.md` § Test callers).

        - `[x]` **3.4.b.2 Abandon, activation, and archive**
            - `e2e/lifecycle-exit.e2e.test.ts`, `retirement-removal-check`, and `staged-archive-recovery` spawn through
              `e2e/store-default.ts`. Lifecycle-exit's choreography, its shared fixture with it, and the staged archive
              stay in-repo whole, beside a store block that abandons a seeded work unit from the primary; the dirty
              abandonment cases seed through `seedWorkUnit` with the checkout ARC spawned (`notes-cutover-flip.md`
              § Test callers).

        - `[x]` **3.4.b.3 Rename**
            - `e2e/rename.e2e.test.ts` and `identity-operand-input` spawn through `e2e/store-default.ts`. Rename's cases
              stay in-repo whole beside a store block seeded through `seedWorkUnit`: a stub, an in-place rename, and a
              self-rename whose replay settles its deferred move (A22), the same-name and Candidate refusals, and a
              stale-lease resume; the one changed expectation traces to a store contract (`notes-cutover-flip.md`
              § Test callers).

        - `[x]` **3.4.b.4 Reconcile and the cohort hook**
            - `e2e/wu-reconcile.e2e.test.ts` spawns through `e2e/store-default.ts`; its tracked-state cases stay in-repo
              beside a store block seeding, through `seedWorkUnit`, a dependent of an origin renamed through the store,
              and each changed expectation traces to a store contract. `integration/validate-cohort-consistency.test.ts`
              keeps its override as an in-repo subject (`notes-cutover-flip.md` § Test callers).

    - `[x]` **3.4.c Review, attest, candidate, and publication**
        - Among them `registerCandidateLineageSuite` (`__tests__/helpers/candidate-lineage-suite.ts`) and the review
          fan-out harness's `installCandidate` and `writeBoundary` (`__tests__/fixtures/review-fan-out-harness.ts`).
        - _Amended (Owner, 2026-11-18):_ from Task 3.R.h, the store cases at the handler that
          `unit/handlers/lifecycle-verbs`' schema-1 cases stand in for: `handleAttest` threading a version-two boundary
          through its batch for the Owner-accepted recovery and for delivery authority while Integrating and while
          Shipped, and `handlePublish` persisting a moved resume point on an unchanged outcome, each over Candidate and
          boundary records the store holds. The list is in `notes-cutover-flip.md` § Test callers.
        - _Amended (Owner, 2026-11-19):_ its twelve end-to-end files and three integration files failed 113 of their 178
          cases without the override, and 16 more never ran, so the family moves in four review increments, one commit
          each, rather than § 7.3's one commit; each increment classifies its cases before editing
          (`notes-cutover-flip.md` § Test callers).

        - `[x]` **3.4.c.1 Attest and publication**
            - `e2e/attest.e2e.test.ts`, `candidate-applicability`, and the three `publication-*` files spawn through
              `e2e/store-default.ts` and seed through `seedWorkUnit`, their tracked-file cases in-repo beside store
              cases, `publication-spine`'s surviving cases on both stores; `unit/handlers/lifecycle-verbs` takes the
              four store cases for `handleAttest` and `handlePublish`. Each changed expectation traces to a store
              contract, and two fixtures were corrected (`notes-cutover-flip.md` § Test callers).

        - `[x]` **3.4.c.2 Candidate lineage**
            - `registerCandidateLineageSuite` and its four suites, `e2e/candidate-lineage*.e2e.test.ts` and
              `integration/candidate-lineage.test.ts`, leave the ledger and spawn through `e2e/store-default.ts`: 25 of
              the 39 cases run on the store through store-aware Candidate, boundary, task-list, and review helpers, a
              hosted pass recorded through admission, acknowledgment, and await, and 14 keep the override by subject.
              Each changed expectation traces to a store contract, and two cases surfaced A23
              (`notes-cutover-flip.md` § Test callers).

        - `[x]` **3.4.c.3 The review fan-out harness**
            - `integration/review-fan-out-lifecycle.test.ts` and `review-member-full-final` leave the ledger. Their 43
              harness cases reserve review through a delivery plan the store cannot resolve while delivery is paused
              (§ 4.3), so they keep the override by subject under `useInRepoStoreForEach`, `installCandidate` and
              `writeBoundary` with them; the singleton hosted progression runs on the store (`notes-cutover-flip.md`
              § Test callers).

        - `[x]` **3.4.c.4 Review surfaces**
            - `e2e/review-protocol.e2e.test.ts`, `review-candidate-supersession`, `review-chunking`, and
              `review-cli-surfaces` spawn through `e2e/store-default.ts`, which gains `runCli`; the middle two leave the
              ledger. They seed through `seedWorkUnit` or, where no `arc init` ran, `seedProjectIdentity`; the corrupted
              boundary, the chunking resolver's delivery arms, and the planning-lane classifier keep the override by
              subject. Each changed expectation traces to a store contract (`notes-cutover-flip.md` § Test callers).

    - `[ ]` **3.4.d Delivery**
        - Among them `positionFixture` (`__tests__/helpers/delivery-position-suite.ts`).

    - `[ ]` **3.4.e Errands and locus**

    - `[ ]` **3.4.f Base merge and integration**
        - `movementPaths` (`__tests__/helpers/base-advance.ts`): its disjoint and substantive kinds touch only code
          files and move; its regenerable and evidence-neutral kinds commit `ROADMAP.md` and a work unit's notes to
          exercise classifier arms that leave with the in-repo implementation, so their cases
          (`integration/base-advance.test.ts`, `e2e/integrate-base-movement.e2e.test.ts`) keep the override explicitly.

    - `[ ]` **3.4.g Status and view**

    - `[ ]` **3.4.h The `init`, `reconfigure`, `user`, and import assertions**
        - `importFixture`'s spawned users that run the flip build after the import delete their tracked state first, as
          the window does.

### `[ ]` **3.5 The Markdown fix's end-to-end test over the flipped store — § 7.5**

- _Goal:_ `__tests__/e2e/markdown-fix.e2e.test.ts` passes with the fixture's store answering `stateOffBranch` true, its
  fixture carrying an `arc.identity` so the selection read reaches the store, its per-file assertions unchanged, and an
  added assertion that the reader returned an empty selection rather than `unavailable`, since the fixture's store
  holds no records.

    - Without an identity the projection skips (`no-identity`), the selection reports `projection-skipped`, and
      `readProjectedSelection` (`lib/checks/projected-selection.ts`) maps that to `unavailable`, which the fixer refuses
      as `markdown.selection-unavailable` (`resolveMarkdownFixCorpus`, `lib/markdown/fix-plan.ts`); with one, the store
      holds no records, so the selection is empty and the fixer's corpus is today's.
    - The test leaves the switch's ledger.

### `[ ]` **3.6 Every default-store caller in the tests classified, and the temporary override gone — § 7.7**

- _Goal:_ A search of the test tree finds each caller of the default store either building the in-repo backend
  explicitly or expecting the ref backend, and the spawn helpers set no override by default.

    - The search covers `createStore(`, `openDefaultStore`, spawned commands over a tracked-state fixture, spawned
      commands given no `cwd`, which run over this checkout, processes spawned outside the spawn helpers that compose
      the default store, whatever their `cwd`, spawned commands asserting an in-repo `unsupported` refusal or its
      remedy, and the entry points into production default sites: in-process dispatch, which runs the root hook;
      `runStoreMigrate`'s import source; `createSessionStatusContext`; `resolveReviewInvocation`;
      `readProjectedSelection`; and partial mocks such as `integration/view-store-cli.test.ts`'s, which replaces only
      `openDefaultStore`.
    - Record the search's result by file in `notes-cutover-flip.md` § Test callers.
    - `e2e/run-cli.e2e.test.ts`'s bare `integrate` case, which spawns with no `cwd` (`helpers/run-cli.ts`), runs from a
      temporary directory (§ 7.2).
    - Remove the spawn helpers' default override (Task 3.2.b).
    - Remove the switch's ledger, empty by now, and the per-file setup that reads it (Task 3.3.d).
    - A test fails if a test setup or spawn helper sets the override by default.

### `[ ]` **3.7 The flipped CLI end to end** — validate exit criterion at segment scope

- _Goal:_ The exit criterion's scenario runs through the built CLI, and its result is recorded with the CI run that
  passed on this branch.

    - The scenario's commands drop the session's override, save the probe run under it (`notes-cutover-flip.md`
      § The flip's checkout).
    - The run also confirms that the switch's ledger and its per-file setup are gone and that the test against a
      default override passes.

## **Phase 4:** Text and checks the flip makes false outside the workflows

_Purpose:_ Remove the tree reads that break once state leaves the branch, and rewrite the help text, the Markdown
notice, and ADR-035's notes item to the store's arms.

_Mode:_ `layer` — closes on no surface outside the workflows reading or describing tracked state.

_Exit criterion:_ No test or check reads state from this repository's tree, `arc store` shows in help, and help, the
notice, and ADR-035 describe the store's arms.

### `[x]` **4.1 Tests and checks that read this repository's tree — § 7.1**

- _Goal:_ No test or check reads ARC state from this repository's tree, so CI passes over the post-deletion tree.

    - `[x]` **4.1.a The transition-record suite goes**
        - `integration/live-transition-records.test.ts` is deleted, with its `ARC_CONTRACT_SUITES` entry and that
          tier's row in `unit/vitest-controller-logic.test.ts`.

    - `[x]` **4.1.b The legacy sweep's planned-work arm goes**
        - `integration/review-gate-legacy-sweep.test.ts` drops its planned-work case, the one that read
          `.arc/backlog/planned/` from disk.

    - `[x]` **4.1.c `format:tables`' state inputs**
        - `format:tables` drops `.arc/active/**/*.md` and `.arc/backlog/**/*.md` with the three exclusions under them;
          the Markdown lint, under-wrap, and selection checks stay as they are.

### `[ ]` **4.2 Help text describes the store's arms, and `arc store` shows — § 4.9, § 6.1**

- _Goal:_ Help describes what each command does on the store, and `arc store` appears in help; the verb index is Task
  5.10's.

    - `[ ]` **4.2.a `arc store` un-hidden**
        - `program.command("store", { hidden: true })` (`cli.ts`) shows, documented as the ref backend's rollout
          contract expects (`spec-storage-ref-backend.md` § Cross-cutting Considerations): a summary in
          `COMMAND_SUMMARIES` (`lib/cli-help-summaries.ts`), a place in the root `HELP_GROUPS`' "Set up and maintain
          ARC:" (`lib/cli-help-content.ts`), and a description on each subcommand.
        - `migrate`'s `--import` is hidden explicitly (Commander's `hideHelp`), since it shows once `store` does, and
          only the window's pre-flip build runs it while the flip build refuses it (§ 2.1). `--leave-source` and every
          other subcommand, `repair-review-roots` and `conflict` among them, show with their descriptions.

    - `[ ]` **4.2.b The status help**
        - The status command's description ("identity + user-sync + …"), its flags' help in `cli.ts`, and the `status`
          notes in `lib/cli-help-content.ts` (`spec-seam-status-roadmap.md` § 2.4, § 12).

    - `[ ]` **4.2.c Commands that keep working but describe the retired substrate**
        - In `cli.ts`: `arc start`'s description, `-y`, and `--new`; `arc resume`; `arc materialize`; `arc rename`; `arc
          view --for`, its after-help, and its `session-notes` kind; `arc wu reconcile --apply`; `arc errand next`; `arc
          errand open`'s `--from-inbox`, `--inbox-title-file`, and `--inbox-entry-file`, and `arc errand link`'s, whose
          titles refuse off the branch (`resolveInboxEntryOperand`, `lib/inbox-entry-operand.ts`); `arc errand link`;
          `arc errand close`; `arc user open` ("seeds SESSION-NOTES.md"), which refuses `unsupported` there; `arc user
          inbox-remove` ("the title-matched USER-INBOX entry"); and `arc decompose`'s `--execute`, `--extract`,
          `--finish`, `--revise`, `--discard`, and `--advance-base`, the last always refused on the store
          (`handlers/decompose-store.ts`).
        - `arc sync`'s description, `-y`, and `--dry-run` in `cli.ts`, which name the notes leg, `notes_push`, and the
          matrix decision; off the branch no notes leg runs and nothing reads `-y` (A11).
        - The help tests that pin this text change with it: `e2e/cli-help-examples.e2e.test.ts`,
          `e2e/run-cli.e2e.test.ts`, `e2e/decompose-dormant.e2e.test.ts`, `e2e/cli-help.e2e.test.ts`'s width and group
          order, and `unit/lib/cli-help-coverage.test.ts`.

### `[x]` **4.3 The Markdown notice — § 6.2**

- _Goal:_ `strategy-quality-gates.md` § Check state where it is edited, both copies, tells a project how its Markdown
  checks behave over projected state, in the four points `spec-projected-markdown-checks.md` § 1.4 and § 7.3 set: a tool
  listing through Git or the index does not see state; one globbing from disk reads the shared roots, conflict-marker
  files included, and a fixer among them rewrites files write-back takes as hand edits; each tool is handed exactly its
  paths; link-target existence over state is checked only where `validate-links.sh` is declared as a `selection` check.

- _Outcome:_ The section, both copies, adds that a fixer globbing from disk rewrites projected files write-back keeps
  as hand edits, and that the commit hook checks links only in staged Markdown, so link targets in state are checked
  only where the link validator is declared as a selection check. No `versions.json` entry is due.

### `[x]` **4.4 ADR-035's item 8 amendment — § 12, § 16**

- _Goal:_ ADR-035 carries a dated amendment for item 8: the old notes ref is kept on the importing machine under a
  namespace that is neither a tag nor pushed, rather than as an archive tag, and is deleted with the notes residue refs
  after the window.

### `[ ]` **4.R A refused notes writer on the flip build — § 12**

- _Goal:_ On the flip build each notes writer the sealing guard refuses states that Git notes are retired and names the
  store step that replaces it, never a rebuild, while the in-repo arm's refusal keeps its condition and remedy (A14).

    - `[ ]` **4.R.a The notes writers' refusal and its test**
        - The guard's calls in `runUserSave`, `runUserLoad`, and `runUserRenameWorkspace` (`commands/user/save-load.ts`),
          in `commands/user/push-fetch.ts`, and in `runUserCompact` (`commands/user/compact.ts`) refuse with a notes
          refusal of their own; `storeImportedRefusal`, which the in-repo backend and `rehearse-window.ts` read, is
          unchanged.
        - A test drives each writer over an imported repository on the ref default and asserts its condition and
          replacement step.

## **Phase 5:** The workflow rewrite

_Purpose:_ Rewrite every shipped workflow, method, skill, rule, template, README, and always-loaded step the flip makes
false, in the package source and synced to `.arc/` with each commit, one family at a time over the site inventory, with
the tests that pin the text it changes.

_Mode:_ `replication` — closes when the enumerated site surface is exhausted and the closure search confirms it.

_Exit criterion:_ A search of the shipped text (the package's `arc/` tree, less its strategies and the code the deletion
units own) for the retired forms (§ 8.1) finds only sites recorded as kept, each with its reason; every file in the site
inventory is rewritten in the package source and carried to `.arc/`; `test:arc-contracts` passed at each family's
commit, and the integration content tier passes at this head.

_Design decisions:_ Each family's files are rewritten against § 8.2–§ 8.16 and checked against
`strategy-procedure-evolution.md`; from this phase's first commit the flip's own sessions follow the rewritten text,
taking the pre-flip step a refusal names (§ 3.1). The site inventory is `notes-cutover-flip.md` § Site inventory. Each
family's commit carries the tests that pin its text, named per subtask; the commit gate runs the ARC contract tier, and
the family's integration files run by `test:file` before it. A guidance invocation may carry `--json` only where its
command declares it (`integration/command-surface-documentation.test.ts`).

### `[x]` **5.1 Re-check `projection-team-scale`'s contract where it has landed — § 1.3, § 8.12**

- _Goal:_ Where `projection-team-scale` has landed, the read-only archive and `arc edit` hold at `main` as § 1.3 states,
  or the spec takes a forward amendment. The task closes here either way: Task 5.6.c writes the errata convention by
  whether the unit has landed when it writes it (§ 1.3), and a landing after that is taken up before the head is fixed
  for the window (`notes-cutover-flip.md` § The landing after verification).

- _Outcome:_ Not landed: `arc status projection-team-scale` reports it in planning at `generate-tasks`, so `main` has no
  read-only archive or `arc edit` to check, and no amendment is due. Task 5.6.c writes the errata convention against
  write-back's in-place archived edit unless the unit lands first.

### `[x]` **5.2 Session lifecycle: handoff, init, recovery, and the loop — § 8.9, § 8.10**

- _Goal:_ The session workflows read and write session context, save state, and sync through the store, with no notes
  leg, SESSION-NOTES file, or commit anchor.

    - `[x]` **5.2.a `session-handoff.template.md`**
        - The active-WU path checks and saves with `arc save`, then writes `nextAction`, an optional `sessionType`, and
          the session context through `arc handoff write -`, which records both anchors; the handoff commit, its
          `git show <hash>:<meta>` prior-value read, and the SESSION-NOTES write go, and the `restateCandidates` filter
          reads from the meta's last `State at Handoff` (no history verb exists or is needed). The session context
          takes the four level-three subsections of `spec-seam-record-kinds.md` § 5.5, `Blockers` among them, since
          `Last Completed`, `Next Task`, and `Blockers` retire from the meta at the flip. Sync names state published
          first and alone, then the branch, with no notes leg, retry offer, or drift surface; the person-to-person
          handoff runs `arc handover` and releases its checkout with `arc locus release`; the notes-sync leg goes.
        - Tests: `integration/session-authority-docs.test.ts` pins the store write and the new `Session Type` form;
          `integration/locus-methodology-contracts.test.ts` requires the release rather than forbidding it. The skill
          case still forbids `arc locus release`, which the skill does not name.

    - `[x]` **5.2.b `session-init.md`, `session-recover.md`, `session-loop.md`, and the `session-state` method**
        - Session-init's carried-read, orientation, and authority text read the meta's session context and handoff
          fields; the loop's handoff step names the session context; the method describes the stored meta, personal
          records saved with `arc save`, and `arc sync`. `session-recover.md`'s one hit, `notes-*`, is kept
          (`notes-cutover-flip.md` § Kept sites). The session-init case of
          `integration/locus-methodology-contracts.test.ts` needs no change: session-init names no release.

    - `[x]` **5.2.c The `arc-handoff` skill and the user directory's README**
        - The skill writes the restored work unit's handoff. `user/README.md` describes the identity root as ARC's
          records plus `scratch/`, stored and published with project state by `arc sync`, with `active/` and `backlog/`
          shared and projected. Its § Advanced: Personal Planning Pipeline is unchanged: no specification settles the
          contributor pipeline after the flip, so it stays with `AGENT-BRIEF.CONTRIBUTOR.md` (Task 5.10).

### `[x]` **5.3 Planning stages: draft-design, create-spec, generate-tasks, and amend-design — § 8.2, § 8.3, § 8.11, § 8.14**

- _Goal:_ Planning runs branchless, saves state per review increment with a check request before each save, removes a
  draft as a record delete, and names the work unit's record and projected location rather than a tracked path.

    - `[x]` **5.3.a `draft-design.md` and `create-spec.md`**
        - Draft-design's entry gate keeps `arc plan check`'s `proceed` route, its grooming-entry skip and redirect gone;
          an idea with no work unit takes the start, stub, or Errand route first, since a draft written for none is
          not adopted. The capture saves, persists `Class` with `arc set-class`, and groom-and-stop saves the draft,
          with "Ship instead of pause" and the commit shape gone. Create-spec's capture gate reads
          `arc inbox personal --target` and `arc inbox {name}` and removes captures by `--id` and `--expected-version`;
          Finalize saves, then `arc repoint-design spec-finalized` removes the draft record; only an accepted ADR or
          moved research commits. Both save locations name the folder holding the work unit's meta.

    - `[x]` **5.3.b `generate-tasks.template.md`**
        - The destination names the folder holding the work unit's meta; the checklist's segmentation line names the
          save's write check; Finalize saves, then runs `arc finalize generate-tasks`; delivery's `from-tasks` takes
          the task list's path from `arc view tasks --path`; the next step names activation creating the work branch.
          `integration/work-unit/generate-tasks-delivery-authoring-contract.test.ts` pins the save before the finalize.

    - `[x]` **5.3.c `amend-design.md`, the planning-review and readiness methods, and planning skills and templates**
        - Amend-design's capture becomes a save (§ The capture save), and the task arm and review site ride their
          increment's save; `planning-review` records passes with `arc review adversarial record` and rereads before
          the save; `assess-draft-readiness` reads the inbound list; `resolve-planning-depth` defers `Class` to the
          stage's save through `arc set-class` or the stage's `--class`; `source-grounding` names the session context;
          the audit and amend skills name the meta and a paused design. The templates' hits are kept.
        - `integration/pr-lifecycle.test.ts`'s planning-review case pins the record verb.

    - `[x]` **5.3.R `arc repoint-design spec-finalized` removes the draft record**
        - _Goal:_ Over the ref backend, the spec-finalized repoint removes the work unit's draft record in the same
          store write that points `Design` at the spec, so create-spec's draft removal is a record delete (A1).
        - `repointThroughStore` (`lib/work-unit/verbs/repoint-design.ts`) adds the draft's expected-version removal to
          the repoint's batch; a work unit that never drafted removes nothing, and the result and the handler's note
          name the removed draft (`integration/repoint-design-store.test.ts`). The in-repo arm still leaves the draft.

- _Outcome:_ Each stage saves its authored text before the verbs that repoint, finalize, or advance it, and commits only
  tracked files. Kept sites are in `notes-cutover-flip.md` § Kept sites.

### `[x]` **5.4 The task loop and commit text — § 8.4, § 8.15**

- _Goal:_ The task loop closes tasks through `arc task close` after the commit and writes no `[x]` or `[~]` by hand, and
  the commit methods and skills describe saves for state and commits for tracked content.

    - `[x]` **5.4.a `process-task-loop.template.md`**
        - The loop writes the completion note and closes no task by hand: item 5's commit closes it, through
          `arc release commit --close` (`--close=<ids>` for a deferred range, a batched parent, or another task, and
          on a split's last commit) or `arc task close` after a raw commit, then runs `arc save`; a task with no
          tracked change closes with `arc task close` alone, and a member scale closeout deferred past the commit saves
          its own record. A red segment request removes the completion note alone,
          the checklist's hand-mark line goes, deferred review leaves its range open until the return commit closes
          it, and a skipped task takes `arc task defer`. Delivery's correction acknowledgment closes the task with
          `arc task close <id>` before `resumeAction`, delivery having committed the correction. Crash recovery adds
          session-init's freshness note, `arc selection --changed`, and the commits no task has closed
          (`arc locus --json`) to its Git probes; the note's changes since the handoff's state version, each with the
          verb that wrote it, are the store history it reads, since no command reads history directly. Atomic
          completion closes the Errand with `arc errand close`.
        - Tests: `integration/delivery-workflow.test.ts` anchors the acknowledgment on the close verb and forbids the
          hand mark.

    - `[x]` **5.4.b `prepare-commits.md`, `template-tasks.md`, and the commit methods and skills**
        - `prepare-commits.md` and the `arc-commit` skill close tasks with the commit that carries their work and
          persist ARC state with `arc save`; the complex path reads the session context and the task list through
          `arc view`. `template-tasks.md` lands outcomes at completion and names `Design` as the work unit's own
          record. `commit-footer` names the artifact a commit's work serves and drops the footers whose only commits
          were state: `handoff`, `activation`, `archival`, `deactivation`, the meta's and task list's `maintenance`,
          and the task list's and standalone `planning`; `commit-format` follows, and `code-review`'s response commit
          carries the re-exported review copy (§ 8.7).
        - The `arc-task-review` skill reads the task's starting plan from its verbatim `_Goal:_`, `_Retired in:_`, and
          `_Amended in:_` lines and any design element its title cites, and lists state edits with
          `arc selection --changed`; no command reads a record's prior version, so § 8.15 takes this reading (A2).

- _Outcome:_ The task loop, the commit skills, and the commit methods close tasks through the close verb and save state
  rather than committing it. Kept sites are in `notes-cutover-flip.md` § Kept sites.

### `[x]` **5.5 Work-unit lifecycle from init to reopen — § 8.5, § 8.6, § 8.11**

- _Goal:_ Each lifecycle workflow runs its verb and saves, with no planning branch, hand-edited verb-owned field, park,
  or remote branch delete the store makes the verb's job.

    - `[x]` **5.5.a `init-work-unit.md`**
        - The start writes records alone: Step 1 keeps only the inbox backstop, and the `plan/` branch, its push, the
          ROADMAP render, and the SESSION-NOTES seed go. The start records its starter as `Owner`; `Class` goes through
          `--class` or `arc set-class`, a stub specified before its start through `arc repoint-design spec-finalized`,
          and the re-run's stage through `arc set-stage`. Promotion settles in its one write, its Errand branch linked.

    - `[x]` **5.5.b `activate-work-unit.md` and `deactivate-work-unit.md`**
        - Activation's gate reads `arc locus`, `arc view`, and both inbox listings, removing captures by ID and version
          and recording each one it rejects or dismisses in the notes companion (A4); `Class` settles through `arc
          set-class` before `arc activate`, which takes no `--task`, and Step 4 pushes the work branch and runs the
          deletion its result names. The draft removal moves into the verb (5.5.R).
        - Deactivation keeps the work branch. A-delete is the abandon's one write, `arc teardown` its continuation, and
          its cleanup keeps only the `external` tracker update; Case C reverses through the verb; and a partial-scope
          `[~]` becomes `arc task defer`.

    - `[x]` **5.5.c `park-work-unit.md` and `resume-work-unit.md`**
        - Both shrink to the verbs, keeping their filenames: pause writes its section in place, `arc locus release`
          freeing the checkout; resume clears it, `arc materialize` giving a released unit a checkout, and keeps the
          reconcile with no commit. `integration/review-gate-workflows.test.ts` loses their merge commands.

    - `[x]` **5.5.d `promote-work-unit.md`, `reopen-work-unit.md`, `clean-work-unit.md`, and the lifecycle methods**
        - Promote takes `arc promote --class` and reopen drops its commit, push, and `(maintenance)` footer;
          `run-errand.md`'s promotion is one write; clean-work-unit saves; `branch-format`'s `plan/` prefix and its
          `[invariant]` go; the methods read `arc view --for` and `arc locus`, and name pausing and the record's
          lifecycle; the cohort template's `Parent` records the nesting.

    - `[x]` **5.5.e Cohort identity steps**
        - No shipped workflow, method, or skill renames, closes, or removes a cohort, or resolves a slug clash, by hand:
          archive's sidecar sweep goes in Task 5.6, and the quick reference's verb lines in Task 5.10.

    - `[x]` **5.5.R `arc activate` removes a superseded draft record**
        - _Goal:_ From the flip, activation removes the work unit's draft record in the write that flips it to Active
          unless `Design` still names the draft, so activation's residual-draft removal stays inside the verb (A3).
        - `runStoreActivate` (`lib/work-unit/verbs/activate-deactivate-store.ts`) adds the draft's expected-version
          removal to the activation batch through `readOwnDraft`, now shared from `lib/store/lifecycle-write.ts`; the
          result and the handler's report name the removed draft (`integration/activation-draft-retire.test.ts`). The
          in-repo arm still leaves the draft.

- _Outcome:_ Each lifecycle workflow runs its verb and saves only the fields it edits by hand; none commits state,
  pushes a planning branch, or deletes a remote branch its verb's result does not name, so
  `integration/commit-check-corpus.test.ts` counts 13 commit subjects where it counted 26. Kept sites are in
  `notes-cutover-flip.md` § Kept sites.

### `[x]` **5.6 Delivery, review, and archive, with the errata convention — § 8.7, § 8.12**

- _Goal:_ Verification, pre-publication, integration, and archival make no record-only commit, record passes and reports
  in the store and scratch, and archive through the store in both cadences.

    - `[x]` **5.6.a `verify-work-unit.md` and the verification record**
        - Step 1 reads `arc inbox personal --target` and the inbound list (§ 4.2), halts on a refused or named listing
          or a pending inbound entry, and removes by ID and version; rejections and dismissals go to the verification
          record's `_Captures:_`, which § Verification Record and `strategy-task-list-formatting.md`'s exception now
          name. Step 3 saves the record, closes the task (`arc task close`, or `arc release commit --close` over a
          tracked change), then attests; attest's commit carries the review copy alone, when its result names a
          `designExport`.

    - `[x]` **5.6.b `prepare-work-unit.md`, `integrate-work-unit.md`, and `deliver-stack.md`**
        - Every `commit-selection`, `commit-boundary`, reconcile, publish, and composition commit goes: over the store
          none of those actions is returned (`handlers/candidate.ts`, `handlers/review.ts`,
          `checkpoint-composition.ts`), and a fix's re-exported review copy commits with it on `design-exported`.
          Composition saves into the meta, a candidate-tail commit removes `.arc/specs/{name}/`, Step 8 keeps both
          cadence arms over the store archive, Step 9 pushes the tail, `arc user close` goes, and the merged-tail
          repair saves rather than opening a change request; `deliver-stack.md`'s `commit-selection` goes.
          `.arc/system/arc-config.yml` drops `archive.cadence: manual` and runs `with-integration`.

    - `[x]` **5.6.c `archive-work-unit.md` and the errata convention**
        - The archive is one published write with no commit, ROADMAP step, or `git mv`, closing the cohort in the same
          batch; the final member's Closeout section is authored at the reported path and saved. `projection-team-scale`
          had not landed (`arc status`: planning, generate-tasks), so the errata convention is the in-place edit of the
          archived meta's Release Notes Entry, then `arc save`.

    - `[x]` **5.6.d The review methods**
        - `adversarial-review`'s pass record moves onto `arc review adversarial record` (its fields, the verb's
          artifact versions and code head, and `report` for the rest), the pre-start stub with it; kept prompts and
          reports go to `scratch/work-unit/{slug}/adversarial-review/`, and the kept versions' notes-sync clause goes.
          `pull-request-format`'s record-only exclusion goes and its design link names the review copy, its manifest
          hash moving; `review-model` and `validate-criteria` hold only kept forms.

- _Outcome:_ The delivery, review, and archive text commits tracked content alone: the review copy's export at attest
  or with a fix, its removal in the candidate tail, and a composition correction to tracked files. Eight
  identity-bearing workflow subjects remain, so `commit-check-corpus`' floor drops to four, the count outside the
  decomposition workflow. The in-repo arms that still stage or return `commit-*` record their pre-flip step in
  `notes-cutover-flip.md` § Pre-flip steps, and the kept sites in § Kept sites.

### `[x]` **5.7 The decomposition workflow's end state — § 8.8**

- _Goal:_ `decompose-work-unit.md` describes the store version: an additive batch replacing dispatch, authoring, one
  distribution approval, and the terminal batch as the landing, with the separate finish-preview stop gone
  (`spec-seam-decomposition.md` § 16).

- _Outcome:_ `decompose-work-unit.md` runs a cut as two store batches: preflight and the map under
  `arc schema get cut-map`, the additive batch for either shape, authoring checked and saved, one distribution approval
  over the `--finish` preview that authorizes `--finish --apply` in the same session, and the terminal batch as the
  landing. A rejection or revision previews `--discard` or `--revise` and applies it after a stop of its own. The
  release arms, base advancement, pull request, merge, and teardown steps go; an extraction's reconciliation and the
  origin's leftover cohort section are saved by hand edit; readiness reads `arc status --project`. `amend-design.md`'s
  extraction exit names the two batches, and `commit-check-corpus` now counts four subjects, its floor.

### `[x]` **5.8 Routing, the inbox, and the Errand queue — § 8.10, § 8.13**

- _Goal:_ Routing carries out outcomes through `arc route` and `arc inbox`, captures are entries with IDs, the Errand
  queue replaces execute-bound marks, and no planning lane is armed.

    - `[x]` **5.8.a `drain-inbox.md`**
        - The drain reads `arc inbox personal`, routes through the method's binding as store writes from any checkout,
          carries survivors to their homes, offers re-triage from the listing's `retriage`, and queues execute-now
          Errands with `arc errand queue set` over the queue it reads. The write-context precondition, the grooming
          branch and pull request, their review exemption and planning lane, owner adoption, and the split step go;
          `locus-methodology-contracts`' queue case and `review-gate-workflows`' arming case change with it.

    - `[x]` **5.8.b `run-errand.md`**
        - The route-only Errand and its pre-write re-check go; open and link take `<personal|project>:<id>`, and the
          goal is the Errand's description. A full start moves the entry off the queue into the description, a full
          close removes nothing, a partial close removes by ID and version, and an abandon returns entries without
          requeuing them; the next offer is the queue's head. The planning-grooming exemption and the planning-lane
          selection go, so the merge request's lane is always `reviewed`.

    - `[x]` **5.8.c `route-discovered-work` and `issue-triage`**
        - The binding carries outcomes out through `arc route`, removal by ID, and a list-file edit within the list's
          edit rights; the writer line, owner adoption, and the named gap go, and the owner's-pass paragraph names
          activation's notes companion and verification's `_Captures:_`. `issue-triage` names a meta's session
          context, and both manifest hashes move. `create-spec.md` and `draft-design.md` drop the binding's waits.

    - `[x]` **5.8.d The `arc-inbox`, `arc-errand`, and `arc-housekeep` skills and the skills README**
        - `arc-inbox` captures through `arc route --to personal` and carries route-now out itself, `arc-errand`'s route
          shape becomes a pointer to it, and `arc-housekeep` drops its precondition; the README describes `arc-commit`'s
          triage and the personal inbox.

- _Outcome:_ Routing writes the store from any checkout: the route-only Errand and the writer line retire, a `hold`
  into a started work unit is an inbound entry its owner takes up, and the Errand queue holds entry references.
  `integration/work-unit/routing-workflow-contract.test.ts` pins the family. The readings that needed more than a verb
  swap are in `notes-cutover-flip.md` § Routing from the flip, and the pre-flip step and kept sites in their sections.

### `[x]` **5.9 Setup, configuration, and merge-gate text — § 8.13, § 8.15**

- _Goal:_ Setup and the shipped configuration describe the store's settings and notes' absence, and the merge-gate
  recipe no longer arms the planning lane.

- _Outcome:_ The merge-gate recipe (`setup-merge-gate.md`, its README, and `CODEOWNERS`) and
  `01_verify-and-configure.md` drop only ARC's auto-merge arming; the CI lane classifier, the unowned planning paths,
  and the ROADMAP path stay until the recipe retires. Setup names the personal inbox and the meta's session context and
  drops notes portability; `02_define-project` reads status from `arc status --project`; the release-wrapper,
  integrity, templates README, and contributing texts lose notes-push, the ROADMAP example, `arc user open`, and the
  staged-planning warning. The configuration template, in both copies, declares the three settings in the catalog's
  order, marks every notes key as having no effect off the branch, and rewrites `session.remote_sync`'s and
  `archive.cadence`'s comments for both substrates. Kept hits are in `notes-cutover-flip.md` § Kept sites.

### `[x]` **5.10 The always-loaded text — § 8.3, § 8.16**

- _Goal:_ Every sentence in the brief, `DEV-RULES.ARC.md`, and QUICK-REFERENCE's verb index that the flip makes false
  states what is true from the flip.

    - `[x]` **5.10.a `AGENT-BRIEF.ARC.md`**
        - The Locus role derives from the marker and the store and holds through exact teardown or release; § How ARC
          Works names the meta and its session context; the transient-identity line drops SESSION-NOTES.
          `locus-methodology-contracts`' Locus case pins the new wording.

    - `[x]` **5.10.b `DEV-RULES.ARC.md`**
        - A save is a persist, not a commit, under the review-increment invariant; its bounded exception keeps
          candidate-tail cleanup, archive composition and closeout as a save and `arc archive`, and the typed base
          reconcile, readiness regeneration gone. Tasks close through the close verb, the meta-file commit shape
          becomes meta-file persistence, and Atomicity, Handoff, and Write for the reader name session context. The
          relocatability rule covers every work-item and cohort record, with the save's link check; the rebase scope
          drops the notes reason. Discovered Work Routing names the personal and project inboxes, and a live work
          unit's concern routes to its inbound list with a message; the pull-request-format load applies to every
          pull request.

    - `[x]` **5.10.c QUICK-REFERENCE and the other briefs**
        - The verb index, in both copies, gains `arc handover`, `arc task close`, `arc task defer`, `arc save`,
          `arc locus release`, `arc inbox`, `arc materialize`, and `arc store`, and also `arc route`,
          `arc handoff write`, `arc errand queue`, and `arc cohort close` / `remove`; `arc pause` replaces `arc park`,
          `arc resume` loses `--here`, `arc rename` takes a UID, decomposition lists its store modes, and the Errand
          lines take `<personal|project>:<id>`. Session State Portability is `arc save`, `arc sync`, and `arc store`;
          `arc view --for` and the remote-access note read the store. The contributor brief names project state, the
          personal inbox, and WORKING-MEMORY; the project brief template's hits are prose.

- _Outcome:_ The always-loaded text states the store's model: the meta carries session context, a save is not a commit
  under the review-increment invariant, tasks close through the close verb, every work-item and cohort record is
  movable, and captures land in the personal inbox or a work unit's inbound list. QUICK-REFERENCE's verb index lists
  every store verb the workflows name. Kept hits are in `notes-cutover-flip.md` § Kept sites.

### `[x]` **5.11 Every remaining site rewritten or recorded as kept — § 8.1**

- _Goal:_ Every hit of the closure search not rewritten by Tasks 5.2–5.10 is rewritten here or recorded in
  `notes-cutover-flip.md` § Kept sites with its reason, and every bare path into a projected root names the record's
  filename or the verb that reads it.

- _Outcome:_ The package's `.arc/` README's tree drops the stored ROADMAP and shows `active/current/` and
  `active/in-flight/<wu>/`, and it and the brief's Directory Structure give `user/` working memory, the inbox, and
  scratch; the analysis README and `user/README.md` name the meta's session context where they named session notes, and
  setup's directory check no longer expects an installed `backlog/`. The hooks README's ROADMAP exemption and
  contributor warning and `hooks.contributor_protected_paths` stay until tracked-state removal. `notes-cutover-flip.md`
  § Kept sites pins the search, scripts included, and records every remaining hit with its reason, among them hits
  earlier families left unrecorded.

### `[x]` **5.R Verification keeps the notes companion — § 8.7**

- _Goal:_ Verification keeps the work unit's notes companion, consolidating it where it is not reference-ready, and no
  step deletes it (A5).

- _Outcome:_ `verify-work-unit.md` Step 1 keeps the notes companion through the archive and consolidates it unless it
  is already reference-ready. `clean-work-unit.md` drops its search for references to a deleted notes file, and its
  "When to Use" names verification's Step 1, its one caller, where it named integration's Step 3.

### `[x]` **5.12 The retired forms exhausted** — validate exit criterion at segment scope

- _Goal:_ The closure search over the shipped text at this head finds only the recorded kept sites; Framework files
  match their rendered source (`integration/framework-sync.test.ts`), and each Configurable and template file carries
  the same targeted edit in both copies.

- _Outcome:_ At `23afde5150` the closure search, in § Kept sites' pinned form, finds 353 hits in 54 files, each one a
  recorded kept site. Of the 81 inventory files, 71 are rewritten and 10 carry only kept hits; every Framework file
  matches its `.arc/` copy (`framework-sync`), and `arc-config.yml`, QUICK-REFERENCE, and `02_define-project` carry the
  same edits in both copies. `test:arc-contracts` gates every commit over non-state paths, so each family's commit
  passed it, and the content tier passes at this head. Task 1.6's inventory, re-run, finds every in-repo `unsupported`
  refusal of a verb the rewritten text names naming its pre-flip step (`notes-cutover-flip.md` § Pre-flip steps). The
  pass revalidates A1–A5; A2, which needed no work, rests on the `arc-task-review` skill reading the starting plan from
  the task's verbatim lines.

## **Phase 6:** The dress rehearsal and window readiness

_Purpose:_ Run the whole window on a full copy at the head that lands, with its perturbations and the synthetic runs
beside it, and pass CI over that head with its deletion commit applied.

_Mode:_ `slice` — closes on a clean dress rehearsal at the head that lands.

_Exit criterion:_ Every § 9.2 step passes at the flip branch's head, each § 9.3 perturbation shows its refusal, repair,
and continuation, the destructive CLI matrix and the partial-protection start pass beside it, and CI passes over that
head with the deletion commit applied, on a branch of its own.

_Design decisions:_ Each run keeps its raw evidence outside the repository, uncited; each outcome's conclusion is
recorded in `notes-cutover-flip.md` § Stage 2, citing a commit or a CI run ID. A failure is fixed in this change and its
stage re-run, and Stage 2 re-runs at the new head after any later change to the flip change, the import, or the
rewritten workflows (§ 9.2).

### `[x]` **6.1 Re-check `cutover-window-tooling`'s contract once it lands — § 1.3**

- _Goal:_ Each contract item § 1.3 states for the window tooling holds at `main` once it lands — the quiesce check and
  its conditions, the record and hold, the recompute and its last read, the auto-merge refusal, the close, the abort's
  restore and its accept and consumed-ref comparisons, the worktree lock step, the seal on `arc user load`, the launch
  under a memory limit, and Stage 1 — or the spec takes a forward amendment before Stage 2 runs.

- _Outcome:_ Every item holds at the tooling merged in at `ae8a98fc48`, read at its source (`scripts/cutover-window/`),
  with two amendments: after the merge a state-bearing branch made after the check is compared too, the close refusing
  until it is, and each range's confirmation is the `confirm` operation, recorded at the range's exact tip (A7); the
  restore's auto-merge remedy names the disarming, not the `gh` command (A8). Stage 1 ran clean at `ac35d74314`, and the
  seal anchor `9d5c680661` carries `arc user load`'s refusal (`refuseWriteIfStoreImported`).

### `[x]` **6.2 The parser check — § 9.4**

- _Goal:_ A check refuses while any kind with a writable projected path lacks a registered parser in
  `PRODUCTION_REGISTRATIONS` (`lib/store/kinds/registrations.ts`), save `work-item/notes`, `personal/document`, and
  `personal/session-context`, or any entry kind lacks an entry grammar (`ENTRY_CONFIGS`,
  `lib/store/kinds/entry-configs.ts`).

- _Outcome:_ `kind-registrations.test.ts` derives the projecting kinds from `RECORD_LINK_KINDS` and the entry kinds from
  `KIND_MECHANISMS`, and fails on a projecting kind without a parser, the three free-prose kinds aside, or an entry kind
  whose mechanism lacks its `ENTRY_CONFIGS` grammar, each refusal shown on a doctored input. The cross-check reads
  write-back's hand-editable inventory through `classifyStoreAddress` over a sample of every layout address form,
  keeping the kinds that project, and requires it inside both derived sets.

### `[ ]` **6.3 The destructive CLI matrix and the partial-protection start — § 9.7, § 9.8**

- _Goal:_ Every group in `notes-seam-locus.md` § Destructive-path verification and flip release checks, with that file's
  § A26 session entry and recovery over a removed primary, succeeds, refuses on each material refusal, and continues
  after repair through a spawned built CLI on the ref backend with production ports, and a work unit starts and drafts
  under partial protection.

    - `[ ]` **6.3.a The matrix as end-to-end tests over scratch repositories**
        - Cold and named start with the default bound lifecycle ports; graduate, materialize, rename, and teardown;
          locus release, anchored and spawned; inbox and route insertion, move, and carry, and the Errand queue and
          queue set; full and partial Errand open with link, leave and rematerialize, abandon and failed-open rollback,
          close and removal by ID and version, and promotion; personal reconcile and scratch, and handoff write from
          file and stdin; identity add, `init`, and `join`; session-init, handoff status, recovery, and Candidate
          orientation with the orphan-branch sweep's store-backed outcome (`orphanWorkLanded`,
          `lib/session-init/orphan-branch-sweep.ts`).
        - Session entry and recovery over a work unit whose primary record a store abandonment or a cut removed, its
          terminal lineage kept (`readTerminalWorkUnitLineage`, `lib/locus/store-terminal-work-unit.ts`).
        - The Errand close's changed-code landing reads its merged pull request from the host
          (`observeExactChangeRequest`, `lib/errand/change-request-lifecycle.ts`), so its run puts on `PATH` a `gh`
          stub that answers for one merged stand-in pull request on the Errand's branch and fails every other call, as
          `e2e/delivery-plan.e2e.test.ts` stubs `gh`; that run's evidence is labeled stubbed host evidence.
        - Each retains the command results and the record, UID, marker, checkout, code-ref, and personal-byte outcomes;
          handler or provider evidence stays labeled apart.

    - `[ ]` **6.3.b The partial-protection start**
        - Under `branch.protection: partial`, a work unit starts and drafts in its checkout, `arc plan check` proceeding
          off-branch (`handlers/plan.ts`), as a new install gets by default.

### `[ ]` **6.4 Stage 2 through the window's order — § 9.2, § 9.6, § 9.9, § 9.10, § 12**

- _Goal:_ On a fresh full copy at the flip branch's head, every § 9.2 step runs in § 10's order and passes, each with
  its conclusion recorded.

    - `[ ]` **6.4.a The runbook**
        - Stage 2 runs the window tooling's operations (`copy`, `lock`, `check`, `account`, `chain`, `recompute`,
          `last-read`, `compare`, `confirm`, `close`, and `restore`) one at a time, each where § 10 places it and
          `restore` only within § 11's abort, with the import's trial (`arc store migrate --import --trial`) after the
          saves and before `check` (§ 10.2). Each operation launches through the family's npm script, and the
          operations, the trial, and the import run under the importing machine's memory limit where it sets one, as
          § 10 launches them. It does not run `rehearse`, whose fresh stand-in flip branch would replace the flip's own.
        - The flip build is built in the copied flip checkout and rebuilt there after any change to it; that checkout
          runs it under `ARC_IN_REPO_STORE=1` until the copy's merge, as § 10 runs the live one, save Task 6.4.b's two
          refusal probes, which drop it; every other command on the copy drops the session's override
          (`notes-cutover-flip.md` § The flip's checkout).
        - The window's own commits on the copy, each deletion commit and each merge a branch step makes, are made in
          the copied checkout and run its hooks; a perturbation's plant is made the window tooling's way, in a scratch
          clone of the mirror with no hooks installed, reaching the copy by fetch.
        - Before any review runs on the copy, assert that no record under the copy's `<commonDir>/arc/review-gate/`
          names a path outside the copy (`materializationRef`,
          `scripts/review-gate/hosts/local/review-materialization.ts`), or clear those records first.
        - Raw evidence stays outside the repository; each step's conclusion goes in a `notes-cutover-flip.md` § Stage 2
          section this task opens, citing a commit.

    - `[ ]` **6.4.b The import side**
        - Stage 1's steps on the copy's pre-flip build, the copy taken through `copy`, with the import's trial before
          `check`, and before it each copied work unit holding an unpublished Candidate that the copy's merges moved
          settling its applicability as § 10.1 settles it (A6); the flip build's refusal of a ref store, each probe run
          with the override dropped: over the copy before its import, and in the flip's checkout after the import and
          before its deletion commit.

    - `[ ]` **6.4.c The flip's own landing**
        - The deletion commit under the override, a merge into the copy's mirror, the archive and register closures
          through the store from the flip build without the override, and the flip checkout's workspace-folder removal
          and release.

    - `[ ]` **6.4.d Each branch and checkout**
        - A live branch no checkout holds, and a branch carrying a Candidate record `main` lacks, through § 10.6's
          branch step; a checkout that merged `main` and rebuilt while still tracking its records, through the refusal,
          the remedy's deletion commit on the flip build with the projection off, and its first materialization; each
          checkout's steps through its first materialization and its marker's carry, including a pre-flip `arc start
          --here` checkout and a spawned pre-flip checkout (§ 9.6); the primary's identity root left holding only ARC's
          surfaces and `scratch/`.
        - Then notes retirement (§ 12), its old ref moved under a namespace neither a tag nor pushed and every `arc
          user` notes writer refusing, and last the window tooling's close, with no checkout reporting a withheld file.

    - `[ ]` **6.4.e The flipped copy's paths**
        - The status and view arms, the roster read and the slug clash among them; the tripwire report's first live
          figures from `arc handoff write` and the rewired sync; the Markdown fix's end-to-end test over the flipped
          store; a worktree spawned after the flip holding the tracked `.arc/user/.npmignore` through its first
          materialization; store-backed cases 2 to 7 (§ 9.10); and the representative decomposition cut (§ 9.9), with
          its execute half's time recorded.
        - Case 6's reopen reads its pull request through the `gh` stub § 9.5 places, its evidence labeled stubbed host
          evidence.

### `[ ]` **6.5 The controlled perturbations — § 9.3**

- _Goal:_ Each of the six perturbations shows its refusal, a legitimate repair, and a continuation reaching the window's
  end; a normal-path pass discharges none.

- _Approach:_ The perturbations chain on one copy, each repair's continuation taking the window to its next one, and a
  final run reaching the window's end.

    - `[ ]` **6.5.a An Errand record arriving mid-window, and a diverging copy, at the check before the import**
        - Perturbations 3 and 4, each refusing at `check`, repaired, and the check passing.

    - `[ ]` **6.5.b A record changed between the import and the merge, in its three runs**
        - Each run refuses and aborts by § 11's steps: `restore`, and where the run reached the deletion commit, that
          commit reverted on the copy's flip branch under the override. It then undoes its change and re-runs from the
          check.

    - `[ ]` **6.5.c A pull request merged into `main` after the import, in its two runs**
        - The merge is pushed to the copy's mirror. Each run refuses and aborts by § 11's steps, as in Task 6.5.b, takes
          the merge into the flip's branch with its head fixed again, and re-runs from the check.

    - `[ ]` **6.5.d A store change between preparation and admission**
        - The fence harness (Task 2.13) runs over a copy of the flipped copy's store, through its entry that takes a
          repository path, for each prepared write the window makes.

    - `[ ]` **6.5.e A late change after the merge, with the code-only commit on a branch no checkout holds**
        - The final run, carried through the window's end, with two branches pushed to the mirror after the check: one
          cut from `main`'s recorded tip that edits a live work unit's meta, its unrecorded range re-applied and
          confirmed with the rest, and one that shares no history with `main` and tracks a file under the state paths,
          its comparison refusing until the branch is deleted (A7).

### `[ ]` **6.6 The end-to-end work unit — § 9.5**

- _Goal:_ One work unit runs end to end on the flipped copy through the rewritten workflows — started branchless, its
  branch created at activation, draft capture, create-spec with an ADR companion, a task closed through the close verb,
  handoff, and pre-publication with the review copy through `arc publish` — takes each deliberate path § 9.5 lists, and
  takes no pre-flip arm, which would read the deleted files and fail or contradict the store (§ 2.3).

    - The reopen reads and withdraws its pull request through a `gh` stub on `PATH` that answers for one stand-in pull
      request, open and unmerged, on the work unit's branch and fails every other call; its evidence is labeled stubbed
      host evidence.

### `[ ]` **6.7 CI over the post-deletion tree on a branch of its own — § 10.1**

- _Goal:_ CI passes over the flip branch's head with the deletion commit applied, on a branch of its own, so the tree
  the merge lands has passed CI before the window.

    - The deletion commit is built in the flip's checkout under the override without moving its `HEAD`: a temporary
      index with the state paths removed, `git commit-tree` over that index's tree with the flip's head as parent, and a
      refspec push of the commit to the branch. The tree hash is recorded.
    - The run is dispatched (`gh workflow run ci.yml --ref <branch>`) with no diagnostic inputs set and recorded by run
      ID; it passes when every job succeeds or is skipped, since `ci-ok` runs only on a pull request.

### `[ ]` **6.8 Stage 2 clean at the head that lands** — validate exit criterion at segment scope

- _Goal:_ The exit criterion holds at one head, the verified head, with every step's and perturbation's conclusion
  recorded against it.

- _Note:_ Stage 2 re-runs at the head § 10.1 fixes after verification only where the flip change, the import, or the
  rewritten workflows changed since (§ 9.2); see `notes-cutover-flip.md` § The landing after verification.

## **Phase 7:** Verification

### `[ ]` **7.1 Complete verification** — load and follow `verify-work-unit.md`

---

## Success Criteria

_Note:_ Four criteria can be seen only after the merge, while verification precedes the window (§ 10.1): the window's
completion, the register rows, the notes refs, and the canaries. Verification marks each `[~]`, deferred to the window
by this recorded decision, naming the step that proves it: the window tooling's close (§ 10.7), the register closures
written through the store (§ 10.5), notes retirement (§ 12), and the canaries' landings (§ 9.11). Stage 2's criterion,
the first below, is attested at the verified head; Stage 2 re-runs at the head § 10.1 fixes after verification only
where the flip change, the import, or the rewritten workflows changed since (§ 9.2; `notes-cutover-flip.md` § The
landing after verification).

- `[ ]` Stage 2 passes every § 9.2 step at the flip branch's reviewed head, which the merged head differs from only by
  the deletion commit, re-run after any later change to the flip change, the import, or the rewritten workflows; each
  § 9.3 perturbation shows its refusal, repair, and continuation; and the destructive CLI matrix and the
  partial-protection start pass beside it.

- `[ ]` The window completes every § 10 step in order with none aborted, the accounting case placing every tracked file
  under a projected root and the chain comparison agreeing for every Candidate record, as the window tooling's close
  shows (§ 10.7).

- `[ ]` After the merge, a command run in any checkout without the override opens the ref backend, Stage 2's end-to-end
  run takes no pre-flip arm, and the flip build refuses over a tree that still tracks ARC state, both before the import
  and after it.

- `[ ]` The post-deletion tree tracks no file under `.arc/active/`, `.arc/backlog/`, `.arc/completed/`,
  `.arc/system/.internal/candidates/`, or `.arc/system/.internal/transitions/`, and neither `arc init` nor `arc update`
  writes a file into a projected root.

- `[ ]` Each § 4 store path behaves as stated, each with a test: sync's state-first legs, the capture gates' `arc inbox`
  reads, the rename source's refusal, base drift from stored records, the archive's two fields, checkpoint records by
  UID, `arc init`'s designation and project ID, the Errand branch's suffix, `arc store` in help, and the cohort record's
  member-section refusal.

- `[ ]` Every in-repo refusal of a verb the rewritten text names gives its pre-flip step concretely (§ 3.1).

- `[ ]` Every site in § 8's site list is rewritten in the package source and synced, and the closure search over the
  shipped text finds only the sites recorded as kept.

- `[ ]` Each § 7 entry is changed, and CI passes over the post-deletion tree.

- `[ ]` The fence harness passes on the ref and reference backends for the take-in, the archive, and the register
  closures.

- `[ ]` Each § 17.1 row closes through the store after the merge with its witness named, and each § 17.2 row stays open
  naming its remaining share, through the register closures the flip's checkout writes (§ 10.5).

- `[ ]` No notes ref remains on `origin`, the importing machine's old ref survives only outside `refs/tags/` and
  unpushed, and every `arc user` notes writer refuses (§ 12).

- `[ ]` ADR-035 carries the dated amendments for items 2 and 8.

- `[ ]` The first Errand and the first work unit after the window each land through the hosted steps it exists to test
  (§ 9.11).

- `[ ]` `activate-work-unit.md` records each capture its gate rejects or dismisses, with its reason, in the work unit's
  notes companion (A4).

- `[ ]` `verify-work-unit.md` keeps the work unit's notes companion, consolidating it where it is not reference-ready,
  and no shipped step deletes it (A5).

- `[ ]` Stage 2 shows a state-bearing branch made after the check compared, its unrecorded range re-applied and
  confirmed through the window tooling's `confirm` before the close passes, and one sharing no history with `main`
  refused until deleted (A7).

- `[ ]` After the switch, a write a command lands through `createStore` reaches the other projected checkouts through
  the projection's fan-out (A9).

- `[ ]` No test setup or spawn helper sets the in-repo override by default, a test guarding it: in process and spawned,
  a test reaches the ref backend unless its subject is the in-repo arm or an operation that runs only on `main`'s
  pre-flip build, and it selects the in-repo implementation itself (A12).

- `[ ]` On the flip build each `arc user` notes writer the sealing guard refuses states that Git notes are retired and
  names the store step that replaces it, never a rebuild (A14).

- `[ ]` On the store, session-init for an identity with no claim records offers the orphan sweep's cleanup for a branch
  whose upstream is gone, while a failed claims read, a listing that missed entries, or one carrying diagnostics still
  declines the sweep (A15).

- `[ ]` On the store, a gone-upstream branch no record links draws no orphan-sweep offer and leaves the sweep's other
  offers in place, while any other refused lookup or read, or a conflicting or ambiguous link, still declines the sweep
  (A16).

- `[ ]` On the store, `arc status --session-init` in a linked worktree whose shared Git directory is read-only runs with
  projection disabled, reporting the skip, and returns the same code-repository values as an unrestricted run (A17).

- `[ ]` On the store under full protection, `arc errand open` opens a fresh Errand, for a new slug and over a completed
  generation, its description, record, and any adopted capture's receipt naming one UID, while a write naming a UID no
  owner holds without creating that owner's record is refused (A18).

- `[ ]` On the store, `arc teardown` refuses a linked checkout holding the retiring branch ARC created without an ARC
  ownership marker, leaving it branched and unchanged, and a self-teardown under `arc.selfTeardownMode: remove` removes
  its checkout and reaps the branch (A20).

- `[ ]` On the store, a command that removes the checkout it runs in completes its remaining store reads and writes:
  `arc abandon` and `arc errand abandon`, run from the checkout they remove, retire their record and reap the branch
  they created (A21).

- `[ ]` On the store, a rename run from the checkout ARC spawned for the work unit defers moving that checkout and
  names the move and the replay that settles it, and once the move has landed a replay of the rename clears the
  checkout's pending move (A22).

- `[ ]` On the store, `arc active status` in the checkout bound to its work unit under the nested layout reports the
  Candidate ID and integration boundary the store holds, and session-init resolves that work unit's session type (A23).

- `[ ]` All quality gates pass (tests, linting, type checking)

- `[ ]` Ready for integration
