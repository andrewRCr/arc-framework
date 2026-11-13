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

### `[ ]` **1.1 The override, the tracked-state refusal, and the ref composition — § 2.1, § 3.1, § 3.2**

- _Goal:_ A selection `createStore` can call composes the ref backend from its caller's ports, makes that composition
  refuse at its first use over a `HEAD` tree tracking ARC state with the remedy for the condition it observes, and
  builds the in-repo implementation under the override, while `createStore` itself still returns the in-repo
  implementation.

- _Approach:_ The selection is its own module beside `lib/store/create.ts`, a function of the override and the
  checkout's ports, tested directly; `createStore` stays untouched until Task 3.3 points it at the selection, and the
  override stays the only other branch there. The module exports the refusal's predicate and remedy builder for the root
  hook (Task 2.2).

    - `[ ]` **1.1.a The ref backend's ports composed from the caller's**
        - Build them through `createDefaultRefStorePorts({ checkoutRoot, exec, execInput, backingRepository })`
          (`lib/store/default-ports.ts`) with the caller's `exec` and `execInput`, so they pass the Git floor gate that
          function wraps them in, and `backingRepository` from `readBackingRepository`, as `createStoreCommandPorts`
          (`commands/store-ports.ts`) does; that supplies `rawExec`, `sleep`, `random`, `actor`, `lock`, `registry`, and
          the directory and byte-level file access.
        - Over the result, lay the caller's file-access methods, `clock`, and `identity`. The caller's `remote` and
          `locks` have no place in the ref ports (`RefStorePorts`, `lib/store/ports.ts`): the ref backend takes its
          remotes from their `arc-state` designation and serializes its writes through its own `lock` port
          (`createRefLockFactory`; `withRefLocks`, `lib/store/ref/write-locks.ts`).
        - Build `test-first` (one behavior at a time):
            - an identity the caller supplies reaches the composed ports
            - the caller's file access and clock reach them, and its `exec` runs behind the Git floor gate
            - a caller's notes-lock override is not consulted
            - ports from `createDefaultStorePorts` keep its identity resolution

    - `[ ]` **1.1.b The override selects the in-repo implementation**
        - `ARC_IN_REPO_STORE`, in force when set and non-empty, read once per composition; the capability stays a fixed
          property of the store built, with no repository read to choose.
        - Build `test-first` (one behavior at a time):
            - with the override set, the composition builds the in-repo implementation and reports `stateOffBranch`
              false, whatever the tree tracks
            - with it unset or empty, the composition builds the ref backend over a tree that tracks nothing

    - `[ ]` **1.1.c The tracked-state refusal at the store's first use**
        - The predicate reads `HEAD`'s tree, not the index, from the repository's top level whatever the checkout root's
          depth, for a tracked file under `.arc/active/`, `.arc/backlog/`, `.arc/completed/`,
          `.arc/system/.internal/candidates/`, or `.arc/system/.internal/transitions/`; an unborn `HEAD` tracks nothing,
          and outside a Git repository it finds nothing tracked, so the command's own message stands, as
          `e2e/update.e2e.test.ts`'s not-a-repository case keeps showing after the switch. It reads no remote and never
          names the override.
        - The refusal is a new recoverable `tracked-state` code in the local refusal union (`LocalRefusalSchema`,
          `lib/store/refusal.ts`), not an `unsupported` case. The composed store's lazy constructor evaluates the
          predicate, so every operation of a store composed over such a tree returns the refusal at first use, before
          any store write — the backstop for a caller that composes a store outside a command, such as the pre-commit
          hook's cohort check (`validate-cohort-consistency.ts`).
        - Remedy by condition: with `refs/arc/project/registry` present locally, the window's steps for the checkout's
          branch and checkout (delete its tracked state, then merge `main`); with it absent, both routes and the fact
          that decides between them (whether `origin`'s `main` still tracks ARC state).
        - Build `test-first` (one behavior at a time):
            - a tree tracking a file under each of the five paths refuses, recoverably, at first use and before any
              store write
            - the registry-present remedy names the deletion and the merge
            - the registry-absent remedy names both routes and the deciding fact
            - a deletion staged but not committed still refuses
            - a tree tracking none of them, or an unborn `HEAD`, composes the ref backend
            - a checkout root below the repository's top level reads the whole tree
            - outside a Git repository the predicate finds nothing tracked

### `[ ]` **1.2 The test setup clears the override, and CI sets it only for the flip's tracked tree — § 3.1, § 7.6**

- _Goal:_ No test, nor any CLI a test spawns, inherits the override from the checkout that runs it, and CI's two
  in-checkout CLI steps carry it only while the flip's branch still tracks state.

    - `[ ]` **1.2.a The test setups clear the override**
        - The unit setup (`__tests__/helpers/unit-setup.ts`) and the integration and end-to-end global setups
          (`__tests__/integration/global-setup.ts`, `__tests__/e2e/global-setup.ts`), which run before Vitest composes
          its workers' environment, so clearing reaches the workers and every CLI they spawn.
        - A test asserts, through a nested run over the real global setups (`makeVitestRuntimeFixture`,
          `__tests__/helpers/vitest-runtime-fixture.ts`), that a spawned CLI sees no override when the parent
          environment sets one.

    - `[ ]` **1.2.b CI's override condition**
        - `check gate merge --ci --dry-run` and `check run lint:md:underwrap` (`.github/workflows/ci.yml`) each export
          the override in their own step script, never through `env:` (whose false condition yields an empty string),
          only when the run's branch ends in `/cutover-flip` and the checked-out tree tracks a file under the five paths
          (`git ls-tree -r --name-only HEAD -- <paths>`). The branch is `GITHUB_HEAD_REF` on a pull-request run, which
          checks out the merge ref, and `GITHUB_REF_NAME` on a dispatched run, whose head ref is empty.
        - The lane-attestation workflow (`.github/workflows/arc-lane-attestation.yml`) runs a build of the base's own
          checkout and is left as it is; the routed checks take only their declared `environment_inputs`
          (`.arc/system/arc-checks.yml`), so none is changed.

### `[ ]` **1.3 The store test helpers build the in-repo backend explicitly — § 7.2**

- _Goal:_ Every shared store helper whose subject is the in-repo arm builds it through `createInRepoBackend`
  (`lib/store/in-repo/backend.ts`) or selects it through the override, so the switch changes no test that imports one.

- _Note:_ No test builds the in-repo backend explicitly today; the importer counts are in `notes-cutover-flip.md`
  § Test callers. An explicit in-repo store records no capability (`recordComposedStoreCapability`, which `createStore`
  calls and `createInRepoBackend` does not), so a test that mixes one with a handler composing the default for the same
  root sees the default's capability.

    - `[ ]` **1.3.a The fixtures**
        - `tracked-write-fixture`, `in-repo-fixture`, `personal-fixture`, `sync-fixture`, and `in-repo-remote` under
          `__tests__/helpers/store/`.

    - `[ ]` **1.3.b The differential harnesses**
        - `review-differential` and `import-comparison`, whose in-repo side stays in-repo.

    - `[ ]` **1.3.c The import fixture**
        - Both of `import-fixture`'s import paths build the import's source through `createStore` (`runStoreMigrate`,
          `lib/store/create.ts`). Its injected-ports path (`migrate`) sets `ports.importSource` over an explicit in-repo
          store; its production-command path (`migrateCommand`), which builds its own ports from the checkout
          (`createStoreCommandPorts`), sets the override for its call and restores it after. `migrateCommand`'s callers
          are `integration/store-ref-import-review-current.test.ts` and `store-ref-import-review-mapping.test.ts`.

### `[ ]` **1.4 Callers whose subject is the in-repo arm build it explicitly — § 7.2**

- _Goal:_ Each test that composes a store, directly or by passing one to a handler, and whose subject is the in-repo arm
  builds it explicitly, and every other direct caller is recorded for Task 3.3 as expecting the ref backend.

- _Note:_ About 85 test files call `createStore` directly; the classification by file is recorded in
  `notes-cutover-flip.md` § Test callers as this task runs.

    - `[ ]` **1.4.a The in-repo store suites**
        - `store-tracked-*`, `store-transient*`, `store-in-repo-*`, `in-repo-*`, `store-personal-*`, and the
          integration and unit tests that expect `unsupported` from the in-repo store.

    - `[ ]` **1.4.b Default-factory tests of the in-repo arm**
        - `integration/errand-store-imported-cli.test.ts` asserts the sealing refusal from an in-repo build;
          `unit/scripts/review-gate/runtime/invocation-extra-pass-references.test.ts` asserts the in-repo refusal
          `requireNativeReviewDecisionReferences` skips once capable; `integration/session-inbox-compatibility.test.ts`
          reads in-repo captures, passing its explicit store as the session context's `operational.store`
          (`createSessionStatusContext`, `handlers/status/session-context.ts`).

    - `[ ]` **1.4.c The remaining direct callers classified**
        - Handler, review-gate, session-init, projection, and work-unit tests: each either builds the in-repo backend
          now, where its subject leaves with that arm, or is recorded as expecting the ref backend at the switch.

### `[ ]` **1.5 Spawned tests whose subject is the in-repo arm set the override — § 7.3**

- _Goal:_ Each test that spawns the built CLI to assert in-repo behavior sets the override in its spawn environment, so
  it keeps its subject after the switch and leaves with that arm.

    - Classify the spawned tests that seed tracked state, or assert an in-repo `unsupported` refusal or its remedy
      (`notes-cutover-flip.md` § Test callers), by subject: the in-repo arm, such as the ROADMAP remedy, park, the old
      decomposition machine, and the notes commands, sets the override now; a surviving subject moves at Task 3.4.
    - A spawned import (`store migrate --import`) builds its source through `createStore`, so its step sets the
      override: `e2e/store-import-errands.e2e.test.ts` and `integration/store-ref-import-personal-batch.test.ts`.
    - `e2e/store-command-dormancy.e2e.test.ts`'s twelve cases assert the in-repo refusals and the pre-flip step each
      names, so it sets the override, and its expected texts change with Task 1.6's remedies; so does
      `e2e/review-cli-surfaces.e2e.test.ts`'s adversarial-recording case, which asserts that command's in-repo refusal
      and its remedy over a fixture that tracks nothing.
    - Setting the override in a spawn environment changes nothing until the switch, so the suite stays green.

### `[ ]` **1.6 The in-repo refusals name their pre-flip steps — § 3.1**

- _Goal:_ Every verb the rewritten workflows name that refuses `unsupported` on the in-repo implementation names, in its
  remedy, the concrete pre-flip step that does its job, independent of any workflow's text.

- _Context:_ The flip's own checkout runs the in-repo implementation until its merge while its synced `.arc/` text names
  the store's verbs.

    - Inventory the verbs the rewritten text names and run each against the in-repo implementation; Task 5.12 re-runs
      the inventory over the verbs the rewrite actually names.
    - Rewrite each remedy that points to "the existing" workflow, to a method's binding the rewrite changes, or to a
      command that does not carry the state the verb would have saved, or that names no step:
        - `arc save` (`projectionSaveResult`, `lib/store/projection/save.ts`);
        - the dormant commands' serving paths (`runDormantStoreCommand`, `commands/store-command-support.ts`): `handoff
          write`, `route`, `cohort close`, and `cohort remove`; `inbox` for each of its list forms — `personal`,
          `project`, and a work unit's slug — where today only the personal list by target is named; and `errand queue`,
          whose read form names the queue's write;
        - `handoff write`'s own backstop in `runHandoffWrite` (`lib/handoff/write.ts`), kept in step with the dormant
          remedy;
        - `arc decompose --revise` and `--discard` (`inRepoDecomposeDispatchRefusal`, `handlers/decompose.ts`), which
          describe the cut's state and name no step;
        - `arc task close` and `arc task defer` (`readTaskBasis`, `lib/work-unit/verbs/task-close.ts`), whose "Mark
          tasks by hand [x] until the flip." names no commit, so a mark made after the task's commit stays out of the
          head the next step reads, such as the rewritten verification's `arc attest`: mark the task by hand and commit
          the mark, staged with the task's own commit where that is still to come;
        - `arc review adversarial record` (`recordApprovedAdversarialPass`,
          `scripts/review-gate/runtime/adversarial-record-command.ts`), whose remedy names `ADVERSARIAL-PASSES.md` or
          the criteria report, records the rewritten text (Tasks 5.3.c, 5.6.d) no longer describes: it names the
          pre-flip record concretely, `ADVERSARIAL-PASSES.md` in the work unit's personal workspace or the criteria
          report for a verification or criteria pass, and the entry that record holds;
        - `arc release commit --close`, whose precheck (`createTaskCloseOperations`, `handlers/release/task-close.ts`)
          refuses before committing with task close's remedy and does not name the commit it blocked: that remedy, the
          hand mark staged with the commit, which is made without `--close`.
    - Build `test-first` (one behavior at a time):
        - each in-repo refusal's remedy names its pre-flip step, asserted by its text
        - `arc task close` and `arc task defer` name the hand mark and its commit, staged with the task's own commit
          where that is still to come
        - `arc release commit --close` refuses before committing, naming the staged hand mark and then the commit
          without `--close`
        - `arc review adversarial record` names the pre-flip record's place and the entry it holds
          (`e2e/review-cli-surfaces.e2e.test.ts`'s case, under the override from Task 1.5, and
          `unit/handlers/review-adversarial.test.ts`)

## **Phase 2:** Store paths the flip completes, and the fence

_Purpose:_ Complete each store path the switch would otherwise leave wrong, missing, or misleading, behind the store's
capability, with the import tests and the fence harness, so the switch adds no code beyond itself.

_Exit criterion:_ With the default store still in-repo, the selection refuses, overrides, and composes, and the root
hook skips or refuses, as § 3 states in their own tests; every § 4 store path, the agenda's handoff anchor (§ 8.9), and
the fence harness pass over the ref backend; and the full suite passes with no behavior change in operation.

### `[ ]` **2.1 Re-check `projection-worktrees`' contract once it lands — § 1.3**

- _Goal:_ Each contract item § 1.3 states for `projection-worktrees` holds at `main` once that unit lands, or the spec
  takes a forward amendment before a task consumes it.

    - Merge `main` into the branch, then check each item at its landed code: each checkout's first materialization
      (§ 2.2, § 2.5 of that unit's specification), the withholding of a pre-flip file and the persist step's refusal
      over it (§ 2.5, § 12.2), the tracked `.arc/user/.npmignore` policy file (§ 2.5), the rebuild of deleted files
      ahead of `arc sync`'s network steps (`restoreSyncProjection`, `lib/store/projection/sync-materialization.ts`,
      called from `handleSync`'s root preparation, § 2.4), and `arc save` clearing the changed mark without setting a
      cadence (§ 11.7).
    - Re-read the root hook's start path (`registerProjectionHooks`, `lib/store/projection/command-hooks.ts`, with its
      spawn materialization) that Task 2.2 builds on, and the store composition around `createStore`
      (`lib/store/create.ts`) that Task 3.3 changes.

### `[ ]` **2.2 The hook commands skip the projection, and every other command refuses, while `HEAD` tracks state — § 3.2**

- _Goal:_ While a checkout's `HEAD` tracks ARC state and its composed store is the ref backend, the commands its Git
  hooks run — `arc check pre-commit`, `commit-msg`, and `pre-push`, and the pre-commit hook's `hook-*` commands
  (`.arc/system/.internal/githooks/`) — run with the projection off and open no ref store, so the remedy's deletion
  commit, merge, and push pass their hooks, while every other command refuses with § 3.2's remedy before its projection
  starts.

- _Context:_ Every command composes a store in write-back's root hook (`registerProjectionHooks`,
  `lib/store/projection/command-hooks.ts`), whose start takes the projection lock and begins reading the store before it
  can skip for a missing identity (`startUnderLease`, `lib/store/projection/engine-start.ts`); only the skip switch
  (`--skip-projection`, `startProjection`, `lib/store/projection/engine.ts`) returns before either. The hook is the one
  `projection-worktrees` reshapes, so this task follows Task 2.1.

    - The root hook evaluates Task 1.1's predicate when the composed store reports `stateOffBranch`, before
      `startProjection`. A hook command takes the skip under a new `ProjectionSkip` reason, `tracked-state`
      (`lib/store/projection/process-state.ts`), whose mark names the refusal's remedy, and `endProjection` returns
      early for it as for `switch`; any other command throws the `tracked-state` refusal from Task 1.1's remedy builder.
    - The default stays in-repo until the switch, so the tests bind the root hook's input to Task 1.1's selection. In
      this repository the hooks run the `hook-*` scripts through `tsx`, outside the root hook, so the tests invoke the
      CLI commands directly.
    - Build `test-first` (one behavior at a time):
        - each hook command over a tracked-state tree runs, opens no ref store, and writes nothing under
          `<commonDir>/arc/` or the projection's lock directory
        - the pre-commit hook's cohort check runs only over a staged cohort record or planned meta, and a commit that
          only deletes stages neither
        - any other command over the same tree refuses with § 3.2's remedy before its projection starts
        - over a tree that tracks nothing, every command, the hook commands among them, starts its projection as before

### `[ ]` **2.3 `arc sync` onto `pull` and `push`, with ADR-035's item 2 amendment — § 4.1, § 16**

- _Goal:_ On an off-branch store, `arc sync` pulls then pushes the store after the rebuild of deleted files, publishing
  state first and alone whatever the branch push's outcome, reporting each leg and the push's tripwire figures, running
  neither a notes leg nor the Errand reconcile leg; on a clone with no designated state remote it asks for the
  designation or reports it, pushing no state until one is made.

    - `[ ]` **2.3.a The store's sync path in `handleSync`**
        - Off the branch, the state leg pairs with nothing: neither `NOTES_BLOCK_WORKTREE_STATES` (`handlers/sync.ts`)
          nor `runPairedPush` (`commands/user/paired-push.ts`) gates it; the branch push still runs. Neither the notes
          save leg (`performSave`, whose `runUserSave` throws `StoreImportedError` once the store is imported) nor the
          Errand reconcile leg (`reconcileErrandLeg`, whose `reconcileErrandPush` fails once the registry ref exists,
          `lib/errand/merge.ts`) runs.
        - The outcome carries a `state` leg, its pull and push, in place of `notes`, which becomes optional
          (`SyncOutcome`, `handlers/sync.ts`); the audit entry (`SyncOutcomeSchema`, `lib/release/schema.ts`;
          `writeSyncAuditEntry`, `handlers/sync-audit.ts`) gains an optional `state` token, and its `notes` token goes
          optional.
        - The push's figures go through `reportHandoffTripwires` (`lib/handoff/tripwires.ts`; `spec-seam-locus.md`
          § 9.3), taking the largest retry count and wait across the push's publishes (`PushResult`,
          `lib/store/sync.ts`).
        - The pull is consumed as session start consumes it (`consumePull`, `lib/store/pull-consumption.ts`). A stopping
          pull pushes no state and exits nonzero. A designation question is offered when the command may prompt, as `arc
          join` offers it (`pullJoinStore`, `handlers/join.ts`), and the push follows the designation made; otherwise it
          is reported with its `arc store remote` remedy, no state is pushed, and sync exits nonzero. The branch push
          runs in every case.
        - Build `test-first` (one behavior at a time):
            - state is pulled, then pushed, and reported before the branch leg
            - a failing branch push leaves the state push reported as succeeded
            - no notes leg and no Errand leg runs or is reported
            - a push's figures over their bounds reach the tripwire report
            - a stopping pull pushes no state, still pushes the branch, and exits nonzero
            - an undesignated clone with no prompt reports the designation's remedy, pushes no state, still pushes the
              branch, and exits nonzero
            - an undesignated clone answering the prompt is designated, and its state push follows

    - `[ ]` **2.3.b ADR-035's item 2 amendment**
        - A dated amendment in its § Amending This Document: `arc sync` publishes state first and alone and reports each
          leg separately, rather than carrying state in the branch's `--atomic` push; a task capture may already name an
          unpushed commit, so no reader changes. It states that it supersedes the 2026-09-29 amendment's order, code leg
          first, for when `--atomic` is unavailable.

### `[ ]` **2.4 The capture gates' `arc inbox` reads over the ref backend — § 4.2**

- _Goal:_ On an off-branch store, `arc inbox <list> --target <slug>` returns the `clear` / `named` / `refused` result
  with each row's ID and version, and `arc inbox <slug>` lists a work unit's inbound list with its pending count and
  oldest age, which is all the three capture gates need from the flip.

- _Context:_ The store arm exists: `openInboxRuntime` (`handlers/inbox-runtime.ts`) selects it off the branch, and
  `listInbox` (`lib/inbox/listing.ts`) returns those shapes, tested over the reference backend
  (`unit/lib/inbox/listing.test.ts`).

    - Build `test-first` (one behavior at a time), over the ref backend:
        - a target with no captures returns `clear`, one with a capture `named` with its ID and version, and a malformed
          target `refused`
        - `--target` on a list other than `personal` refuses
        - a work unit's inbound list reports its pending count and oldest age

### `[ ]` **2.5 The delivery rename source refuses a missing folder off the branch — § 4.3**

- _Goal:_ On an off-branch store, `GitDeliveryRenameTransitionSource` (`lib/delivery/plan-resolution.ts`) refuses when
  the transition folder is absent at the ref, rather than reading empty and resolving a plan under a former name as
  `no-match`, while before the flip a ref with no folder resolves as today.

    - The source requires the store's capability beside its `exec`, so no construction falls back to the pre-flip
      reading: a caller holding a store passes its capability, and the member lookup's default
      (`RepositoryDeliveryMemberLookup`, `scripts/review-gate/hosts/local/delivery-member-lookup.ts`) and the direct
      constructions (`handlers/delivery.ts`, `delivery-transfer.ts`, `delivery-execution.ts`, and
      `lib/delivery/repository-entry.ts`) build it through one constructor that reads the capability of the default
      store composed for that checkout. Its tests bind that composition to Task 1.1's selection, as Task 2.2's do, and
      the two direct constructions in `integration/delivery-linked-worktree.test.ts` pass the capability.
    - Build `test-first` (one behavior at a time):
        - off the branch, a ref with no transition folder refuses, naming the missing folder
        - a member lookup's default source refuses the same way off the branch
        - a ref with the folder resolves as today
        - before the flip, a ref with plans and no transition ever recorded resolves as today

### `[ ]` **2.6 The base-drift resolver onto stored completed records — § 4.4**

- _Goal:_ On an off-branch store, `createCompletedMetaResolver` (`lib/base-drift/current-adapters.ts`) names each
  integration from the store's completed records, so base drift and a squash or rebase project's checkpoint keep naming
  the work unit after no completed meta lands on base.

    - Read the completed records (`readStoreCompletedEvidence`, `lib/store/lifecycle-completed.ts`) and match a pull
      request by the number in the archived meta's `PR URL`. An ambiguous match names no work unit, as an absent one
      does (`uniqueRecordByPr`), and a consumer that needs a name refuses as it does for an absent one.
    - The store reaches the resolver through `createCurrentBaseDriftAdapters`, whose importers pass the store they hold:
      `handlers/base.ts`, `handlers/status.ts`, and `scripts/integration/checkpoint-composition.ts`,
      `errand-merge-composition.ts`, and `merge-composition.ts`.
    - Build `test-first` (one behavior at a time):
        - a merge whose pull request one archived meta names resolves to that work unit
        - two archived metas naming one pull request resolve to none, as a pull request no archived meta names does
        - the integration evidence (`analyzeIntegrationEvidence`, `lib/git/base-integration-evidence.ts`) reconciles a
          squash merge through the stored record

### `[ ]` **2.7 The store archive records `PR URL` and `Completed` — § 4.5**

- _Goal:_ The store arm of `arc archive` (`runStoreArchive`, `lib/work-unit/verbs/archive-store.ts`) writes `PR URL` and
  `Completed` in its one batch, so the archived meta's readers (`completedRecord`, `lib/store/lifecycle-completed.ts`;
  `completed-index.ts`) and base drift keep both fields.

    - Build `test-first` (one behavior at a time):
        - `--pr-url` lands in the archived meta
        - an absent `--pr-url` writes `[none]` and warns, as the in-repo arm does (`lib/work-unit/verbs/archive.ts`)
        - `--completed` lands, defaulting to the ship day as the in-repo arm does
        - both land in the same batch as the archive's other writes

### `[ ]` **2.8 Integration checkpoint records keyed by work-unit UID — § 4.6**

- _Goal:_ On the store path, the integration checkpoint writes and reads its records under the identity's
  `.internal/integration-checkpoints/<work-unit-uid>/`, machine-local, and matches them by that UID, so `arc rename`
  orphans none and the retired per-work-unit workspace holds none.

    - `recordPath` (`scripts/integration/checkpoint-store.ts`) takes the work unit's UID on the store path; the path
      stays in the machine-local set (`MACHINE_LOCAL_PATHS`, `lib/store/registry.ts`), never stored, synced, or
      projected.
    - On the store path, the reader (`readIntegrationCheckpointComposition`) and the ownership check
      (`validateCheckpointOwnership`, `scripts/integration/merge-composition.ts`) match the record's work-item UID
      (`NativeCheckpointOwnershipSchema`'s `workItemUid`) rather than its slug, since a rename is a store write that
      leaves the approved head where it was.
    - Build `test-first` (one behavior at a time):
        - a checkpoint written on the store path lands under the UID folder
        - a renamed work unit's checkpoint is found and admitted at its unchanged head
        - the path is excluded from the store, sync, and the projection

### `[ ]` **2.9 `arc init` designates the state remote and mints the project ID — § 4.7**

- _Goal:_ From the flip, `arc init` designates the code remote as the state remote at creation where one exists, and
  mints the project ID into the registry's create-only identity record, pulling first and adopting an ID it finds where
  a remote is already designated (`spec-storage-ref-backend.md` § 9.2, § 9.8).

    - `commands/init.ts` does neither today. Both run only on a ref store, since the in-repo implementation refuses the
      identity record's write; before the switch, the tests inject a ref-backed store.
    - Both run whatever the identity, in init's own path (`commands/init.ts`) rather than `runPostInitSetup`
      (`lib/setup.ts`), which `arc join` shares (`commands/join.ts`) and which reaches its store arm only with an
      identity, since `join` never mints. Designation is a `git config` write; the mint is a project-owned store write,
      which needs no identity (`refWriteIdentityRefusal`, `lib/store/ref/write-resolution.ts`, refuses only
      person-owned writes without one).
    - Designation, and the pull where a remote is already designated, come before the first store read or write in
      init's own action, its personal identity setup (`preparePersonalIdentitySetup`, `runPostInitSetup`'s seed) among
      them, since an undesignated first write creates a separate `<commonDir>/arc/store` (`writeRefRepository`,
      `lib/store/ref/repository.ts`) and a code remote designated beside it reports `move-incomplete`
      (`spec-storage-ref-backend.md` § 9.2). The root hook's read of the store's version before the action creates no
      repository (`readRefRepository`).
    - Build `test-first` (one behavior at a time):
        - a fresh repository with a code remote is designated and gets a minted project ID
        - a designated init, with an identity, creates no `<commonDir>/arc/store`
        - a repository with no remote mints an ID and designates none
        - a remote already holding a project ID is pulled and its ID adopted, not re-minted
        - an init with no identity designates the remote and mints a project ID
        - `arc join` mints none
        - on the in-repo implementation, init does neither

### `[ ]` **2.10 The Errand branch's suffix and every reader of it — § 4.8**

- _Goal:_ On the store path, `arc errand open` names an Errand's branch `<type>/<slug>-<suffix>`, the suffix eight
  lowercase hex characters it mints before its one write, records that branch link, and every reader that derives an
  Errand's slug from its branch or matches an Errand's branch exactly takes that form.

- _Approach:_ The store mints an Errand's UID only when it resolves the write (`resolveOwner`,
  `lib/store/ref/write-resolution.ts`), after the branch must be named, so open mints the suffix itself. The record's
  schema cannot see the store's capability, so it admits both `<type>/<slug>` and the suffixed form; the store arm
  writes only the suffixed form, and on the store path an exact match compares the branch with the record's branch link.
  No Errand record crosses the window (§ 13.3).

- _Note:_ The search § 4.8 asks for, at `a7c65b4239`, and each traced reader's outcome are in `notes-cutover-flip.md`
  § Errand branch readers.

    - `[ ]` **2.10.a The builders**
        - `lib/errand/open.ts` mints the suffix on the store path, types from `ERRAND_BRANCH_TYPES`
          (`lib/errand/branch-type.ts`); `lib/session-init/errand-branch-cut.ts` cuts the branch the record names rather
          than rebuilding it.

    - `[ ]` **2.10.b The record's validation and resume's recorded-branch check**
        - `validateOrdinaryNamespace` (`lib/errand/identity-record.ts`), which the record's schema applies at every
          read, admits the suffixed form; `validateErrandBranch` and `validateGroom` beside it keep their checks.
          `validateResumeContinuity` (`lib/errand/open.ts`) compares the type prefix rather than a rebuilt branch.

    - `[ ]` **2.10.c Review readiness's identity facts**
        - `identityFacts` (`scripts/review-gate/readiness.ts`): for an Errand vehicle the head branch equals the
          record's branch link, read through the store as the work-unit arm reads the stored work unit, and the
          work-unit slug test (`branchToWorkUnitSlug`, `lib/work-unit/work-unit-slug.ts`) no longer applies to it.
        - Build `test-first` (one behavior at a time):
            - a suffixed Errand's pull request passes readiness, as `arc errand merge` reaches it through
              `releaseMergeLock` (`scripts/review-gate/merge-lock.ts`)
            - a head branch differing from the record's branch link refuses

    - `[ ]` **2.10.d The remaining readers**
        - Each reader the search marks as reaching an Errand's branch changes with its arm, and each it marked unclear
          is recorded unaffected with its traced reason; the grooming claim, the housekeep routing record, and the
          import's created-branch test (`lib/store/ref/import/code-links.ts`) keep their own checks.

### `[ ]` **2.11 The cohort record's member-sections write check — § 4.10**

- _Goal:_ A hand edit of a cohort record whose `## Members` names a slug that is not the current name of a member of
  that cohort refuses, naming each such slug with its remedy, while a verb's write never refuses over a section it
  leaves.

    - Add `cohort.member-sections` to `checkCohortDocument` (`lib/store/kinds/cohort/check.ts`), applying to hand edits
      only (`HAND_EDIT_VERBS`, `lib/store/links.ts`; `deriveWriteCheckWriter`, `lib/store/write-check.ts`); membership
      from the `Cohort` fields' last segment, current or former names (`observeAllHoldings`,
      `lib/store/kinds/cohort/check-support.ts`; `observeCohortHoldings`, `lib/store/kinds/cohort/holdings.ts`).
    - Build `test-first` (one behavior at a time):
        - a member section naming no member refuses, naming the slug, with nothing written
        - it admits once the section is removed or renamed, or once the slug's meta is saved naming the cohort
        - a completed member's section, and one for a member whose `Cohort` names the cohort by a former name, admit
        - a section naming only a member's former name, a subcohort, or a subcohort's member refuses
        - an at-cap retirement's terminal batch admits while it leaves the origin's section (`terminalFanout`,
          `lib/decompose/terminal-records.ts`), and the record's next hand edit refuses naming it
        - `arc rename` rewrites a member's heading only where no other holder has the old name
          (`planRenameMemberHeading`, `lib/store/rename-member-heading.ts`)

### `[ ]` **2.12 Import tests over the identity refs' leases and permuted listings — § 7.6, § 13.3, § 13.4**

- _Goal:_ The import's landing and retirement leases, and its independence from listing order, are each shown by a test
  of a refusal and a continuation, over copies the quiesce check admits.

    - `[ ]` **2.12.a The landing lease**
        - An identity ref advanced between the import's read and its landing makes the landing refuse with nothing
          landed (`landImportRefs`, `lib/store/ref/import/land.ts`), and a fresh run succeeds.
          `integration/store-ref-import-transient-observations.test.ts` covers this in both layouts; extend it only
          where § 7.6 asks more.

    - `[ ]` **2.12.b The retirement lease**
        - In the default layout, `origin`'s copy advanced between the landing and its retirement makes the retirement
          refuse ("advanced after the import read it", `retireOriginRefs`, `lib/store/ref/import/transient-cleanup.ts`)
          with the kept tips preserved, and the import succeeds once the ref is reconciled and the import re-run. The
          separate layout refuses earlier (`retireImportLocals`), so the case names its layout.

    - `[ ]` **2.12.c Permuted listings**
        - Listings returning branches, worktrees, and fetched refs in permuted orders yield the same records, keyed by
          owner slug and path with each minted UID mapped to its owner, a parked unit among them
          (`readImportParkedSources`, `lib/store/ref/import/parked-source.ts`). In-flight derivation lists through
          `exec` (`lib/git/in-flight-derivation.ts`), so the test permutes by wrapping the ports' `exec`.

### `[ ]` **2.13 The fence harness over the take-in, the archive, and the register closures — § 14**

- _Goal:_ One harness on the ref and reference backends injects a store change between preparation and the batch, per
  read family each writer takes, and every case either refuses with nothing written and then retries correctly, or
  admits only what fresh preparation would write; an unrelated write admits.

    - `[ ]` **2.13.a Each writer's read families**
        - Inventory into `notes-cutover-flip.md` § Fence read families: write-back's take-in
          (`checkProjectionAdmission`, `lib/store/projection/admission-check.ts`, over `planProjectionWrite`, with the
          batch built by `prepareStable`, `lib/store/projection/submission.ts`), which also carries the register
          closures; and the store archive (`runStoreArchive`: `readWorkUnit`, `readLifecycleView`,
          `prepareArchiveCohorts`, and `observeArchiveHoldings`).

    - `[ ]` **2.13.b The harness**
        - It injects at batch submission, wrapping the store's `batch`, so a change lands after the archive's
          revalidation (`revalidateLifecycleRecords`, which reads before `batchLifecycleWrites`,
          `lib/work-unit/lifecycle-store-executor.ts`) and the batch's own observations decide it (`observeRecords`).
        - Build `test-first` (one behavior at a time):
            - each read family of the take-in, changed after preparation, refuses or admits equal to fresh preparation
            - each read family of the archive, each prospective member's lifecycle record among them, the same
            - an unrelated write between preparation and the batch admits
        - A read family the harness shows the archive leaves unobserved is added to its observations here.
        - The harness also takes a repository path and runs over a copy of that repository's flipped store, so Stage 2
          runs it over the window's prepared writes (Task 6.5.d) without injecting into the built CLI.

### `[ ]` **2.14 Session-init's handoff anchor on the store — § 8.9**

- _Goal:_ On an off-branch store, the agenda takes its handoff freshness baseline and Session Type from the meta's
  handoff fields, so a resume after the switch keeps both though the load set omits SESSION-NOTES there
  (`resolveLoadSetManifest`, `lib/load-set/projection.ts`).

    - The compiler's field reader (`readSessionNotesFields`, `lib/store/session-notes-fields.ts`, read in
      `commands/agenda/context.ts`) and its freshness note (`compileHandoffFreshness`) select the store arm by the
      capability: the baseline is the meta's `State at Handoff`, which `arc handoff write` records (`runHandoffWrite`,
      `lib/handoff/write.ts`), compared with the store's current version, the gap rendered from the store's `changes`;
      Session Type is the meta's `Session Type`; the `git log` render for an absent SESSION-NOTES fires on an empty
      session context.
    - The notes module (`commands/agenda/notes.ts`) and the in-place materialize before the flip
      (`commands/agenda/legacy-materialize.ts`) go in the switch's commit (Task 3.3), with their tests
      (`unit/agenda/notes.test.ts`, `notes-surfaces.test.ts`, and the agenda tests naming `notes:pull` or `notes:load`).
    - Build `test-first` (one behavior at a time):
        - a meta whose `State at Handoff` is the current version reports no gap
        - an advanced version reports the gap and whether the work unit's meta changed since
        - the meta's `Session Type` reaches the agenda as the session-type override
        - an empty session context renders the `git log` fallback
        - on the in-repo implementation, the agenda reads SESSION-NOTES as today

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

### `[ ]` **3.1 The installed files and their presence test leave the projected roots — § 5.2, § 5.3, § 7.4**

- _Goal:_ The installer writes no file into `.arc/active/`, `.arc/backlog/`, or `.arc/completed/`, and nothing checks
  for one: the `completed/README.md` Configurable file and the `backlog/ATOMIC-INBOX.md` and `backlog/ROADMAP.md`
  templates are deleted from the package rather than relocated within its `arc/`, and `verify-integrity.sh`'s presence
  test for `ROADMAP.md` goes with them in both copies.

- _Rationale:_ Before the switch, since an `arc-in-git` install that commits these files would otherwise meet the
  tracked-state refusal (`initializedRepository("arc-in-git-and-committed")`,
  `__tests__/helpers/initialized-repository.ts`; `integration/schema-command/cold-start-provisioning.test.ts`); and as
  one commit, since the presence test fails a fresh `arc-in-git` install once the template is gone.

    - `[ ]` **3.1.a The files and their claims**
        - Delete them with their `init-recipe.json` entries, `SCAFFOLDED_FILES` and `CONFIGURABLE_FILES`
          (`lib/classification.ts`), and `manifest.json` entries; the recipe's structure stays. `arc update` treats each
          as a removal and deletes no project's copy (`lib/manifest/apply.ts`).
        - `strategy-file-classification.md`, both copies: ROADMAP among the Scaffolded examples, the example of a
          template's suffix stripped at install, and ROADMAP among the templates rendered once at init.
        - `audit:coupling`'s corpus (`audits/coupling-blast-radius/manifest.json`) drops the two `.arc/backlog/` paths
          in its `installedDelta`; `integration/audit-coupling-blast-radius.test.ts`'s fixture substitution and its
          fixtures under `__tests__/fixtures/coupling-audit-planning/` go with them.

    - `[ ]` **3.1.b The presence test**
        - `verify-integrity.sh` (`.arc/system/.internal/scripts/` and
          `packages/arc-framework/arc/system/.internal/scripts/`) drops the `arc-in-git` check for `backlog/ROADMAP.md`,
          while the in-repo ROADMAP arms, `DERIVED_VIEWS`, and the layout's `project-document` address stay. Its real
          installed tree case asserts only the File Structure section and stays as it is.

    - `[ ]` **3.1.c The tests over them**
        - `integration/store-project-inbox.test.ts`, `integration/init.test.ts` (the `arc-in-git` and `pm.mode=none`
          cases), `unit/init.test.ts`'s Scaffolded classification, `unit/manifest/plan.test.ts`,
          `unit/lib/store/kinds/entry-reference.test.ts`, `e2e/init.e2e.test.ts`, and `e2e/reconfigure.e2e.test.ts`.
        - `integration/scripts/verify-integrity.test.ts` stays as it is: its fresh `arc-in-git` install cases assert
          only a clean report, which this one commit keeps (§ 5.3).
        - `unit/reconfigure.test.ts`'s hand-built recipes that name the deleted templates change with them.

### `[ ]` **3.2 The store seeding helper and the temporary spawn override — § 7.3**

- _Goal:_ A spawned test can seed the records it needs into its temporary repository's store through one helper, and
  until each family moves onto it, the spawn helpers carry every spawned test across the switch on the in-repo
  implementation.

    - `[ ]` **3.2.a The seeding helper**
        - One helper under `__tests__/helpers/store/` writes records in process through the ref backend's ports
          (`createDefaultRefStorePorts`) into the temporary repository's store under its common Git directory, as
          `refSyncFixture` (`__tests__/helpers/store/ref-sync.ts`) does: it takes the repository, an identity, and the
          records, writes them in one batch, and returns their references and versions. A test whose subject is a verb
          seeds through that verb instead.
        - Build `test-first` (one behavior at a time):
            - records the helper seeds are read back by the built CLI's ref backend in the same repository
            - a seeded work unit's records carry its lifecycle placement and links
            - a repository whose tree tracks ARC state is refused before any write

    - `[ ]` **3.2.b The temporary spawn override**
        - The spawn helpers' environments set the override by default (`builtCliEnvironment`,
          `__tests__/e2e/helpers.ts`; `runCli`, `__tests__/helpers/run-cli.ts`), each spawn able to drop it, until Task
          3.6 removes the default once every family has moved; a test that spawns the CLI, or a script that composes the
          default store, outside them sets it itself where it seeds tracked state or roots its store outside a Git
          repository, listed in `notes-cutover-flip.md` § Test callers: among them
          `integration/validate-cohort-consistency.test.ts`, which runs the cohort hook's script
          (`validate-cohort-consistency.ts`) through `tsx` over a fixture that is not a Git repository.
        - _Retired in:_ Phase 3

### `[ ]` **3.3 The switch, with the in-process tests whose expectations rest on the default — § 2.1, § 7.2**

- _Goal:_ `createStore` builds through Task 1.1's selection, so every store a command opens reports `stateOffBranch`
  true, and every surviving test that reaches the default in process expects the ref backend.

    - `[ ]` **3.3.a The switch**
        - `createStore` (`lib/store/create.ts`) calls the selection; its signature is unchanged, so `openDefaultStore`
          (`handlers/lifecycle-shared.ts`) and every other default caller follow, `projection-worktrees`' wrapper around
          the composed store kept.
        - Before this commit, the flip's checkout sets the override in the environment of every command it runs, `git`
          included, by the mechanism `notes-cutover-flip.md` § The flip's checkout names, which also says what a
          tracked-state refusal there means.

    - `[ ]` **3.3.b Direct callers and in-process dispatch whose subject survives**
        - The callers Task 1.4 recorded as expecting the ref backend, and the tests that dispatch the CLI in process
          (`dispatchRegisteredCli`), whose root hook composes the real default; a test composing the default over a
          scripted `exec` now meets the tracked-state predicate's tree read at first use.

    - `[ ]` **3.3.c Through handlers and scripts**
        - `repair-cli`'s mock (`__tests__/helpers/repair-cli.ts`) binds a store rather than falling through to the
          default factory.
        - `integration/handoff-write-store.test.ts` binds a temporary repository rather than the live checkout.
        - The agenda's notes module (`commands/agenda/notes.ts`) and in-place materialize
          (`commands/agenda/legacy-materialize.ts`) go, with their tests, now that Task 2.14's store arm serves every
          resume.

### `[ ]` **3.4 Spawned tests move onto the store by family — § 7.3**

- _Goal:_ Each spawned test whose subject survives seeds its state through the store and drops the temporary override,
  one family per commit, while each whose subject is the in-repo arm keeps the override explicitly and leaves with that
  arm.

- _Note:_ A test that adds `origin` after `arc init` meets an undesignated state remote on push and archive; see
  `notes-cutover-flip.md` § Undesignated remotes in tests.

    - `[ ]` **3.4.a Session-init and the agenda**
        - Among them `prepareSessionEnvelopeFixture` (`__tests__/helpers/session-envelope-compat.ts`).

    - `[ ]` **3.4.b Start, teardown, rename, reconcile, and retirement**
        - Among them `integration/validate-cohort-consistency.test.ts`, which spawns the cohort hook's script outside
          the spawn helpers with its own override (Task 3.2.b), classified by § 7.3's rule.

    - `[ ]` **3.4.c Review, attest, candidate, and publication**
        - Among them `registerCandidateLineageSuite` (`__tests__/helpers/candidate-lineage-suite.ts`) and the review
          fan-out harness's `installCandidate` and `writeBoundary` (`__tests__/fixtures/review-fan-out-harness.ts`).

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

### `[ ]` **3.7 The flipped CLI end to end** — validate exit criterion at segment scope

- _Goal:_ The exit criterion's scenario runs through the built CLI, and its result is recorded with the CI run that
  passed on this branch.

    - The scenario's commands drop the session's override, save the probe run under it (`notes-cutover-flip.md`
      § The flip's checkout).

## **Phase 4:** Text and checks the flip makes false outside the workflows

_Purpose:_ Remove the tree reads that break once state leaves the branch, and rewrite the help text, the Markdown
notice, and ADR-035's notes item to the store's arms.

_Mode:_ `layer` — closes on no surface outside the workflows reading or describing tracked state.

_Exit criterion:_ No test or check reads state from this repository's tree, `arc store` shows in help, and help, the
notice, and ADR-035 describe the store's arms.

### `[ ]` **4.1 Tests and checks that read this repository's tree — § 7.1**

- _Goal:_ No test or check reads ARC state from this repository's tree, so CI passes over the post-deletion tree.

    - `[ ]` **4.1.a The transition-record suite goes**
        - `integration/live-transition-records.test.ts`, its entry in the ARC contract tier (`ARC_CONTRACT_SUITES`,
          `lib/local-vitest-runner.ts`), and that tier's row in `unit/vitest-controller-logic.test.ts`.

    - `[ ]` **4.1.b The legacy sweep's planned-work arm goes**
        - `integration/review-gate-legacy-sweep.test.ts`'s planned-work case reads `.arc/backlog/planned/configuration/`
          from disk (`filesBelow`); no CI workflow fetches `refs/arc/*`, so a store read there finds no backlog, and the
          arm goes.

    - `[ ]` **4.1.c `format:tables`' state inputs**
        - `format:tables` in `.arc/system/arc-checks.yml` drops `.arc/active/**/*.md` and `.arc/backlog/**/*.md` with
          their exclusions (`!.arc/backlog/ROADMAP.md`, `!.arc/active/README.md`, `!.arc/backlog/README.md`), which
          match nothing once state leaves the tree; its inputs come from Git's tree changes (`matchTreeInputs`,
          `lib/checks/matching.ts`).
        - `lint:md` lists through Git (`enumerateTrackedMarkdownPaths`, `lib/markdown/selection.ts`) and
          `lint:md:underwrap` through the index, and `lint:md:selection`, `lint:md:underwrap:selection`, and
          `lint:arc:links:selection` already read state, so none changes.

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
        - The help tests that pin this text change with it: `e2e/cli-help-examples.e2e.test.ts`,
          `e2e/run-cli.e2e.test.ts`, `e2e/decompose-dormant.e2e.test.ts`, `e2e/cli-help.e2e.test.ts`'s width and group
          order, and `unit/lib/cli-help-coverage.test.ts`.

### `[ ]` **4.3 The Markdown notice — § 6.2**

- _Goal:_ `strategy-quality-gates.md` § Check state where it is edited, both copies, tells a project how its Markdown
  checks behave over projected state, in the four points `spec-projected-markdown-checks.md` § 1.4 and § 7.3 set: a tool
  listing through Git or the index does not see state; one globbing from disk reads the shared roots, conflict-marker
  files included, and a fixer among them rewrites files write-back takes as hand edits; each tool is handed exactly its
  paths; link-target existence over state is checked only where `validate-links.sh` is declared as a `selection` check.

    - The section states the first and third already; add the fixer's hand edits and the link check's home, in the
      shipped-content register.
    - No `versions.json` entry: no version has been published, so no project upgrades across the change.

### `[ ]` **4.4 ADR-035's item 8 amendment — § 12, § 16**

- _Goal:_ ADR-035 carries a dated amendment for item 8: the old notes ref is kept on the importing machine under a
  namespace that is neither a tag nor pushed, rather than as an archive tag, and is deleted with the notes residue refs
  after the window.

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

### `[ ]` **5.1 Re-check `projection-team-scale`'s contract where it has landed — § 1.3, § 8.12**

- _Goal:_ Where `projection-team-scale` has landed, the read-only archive and `arc edit` hold at `main` as § 1.3 states,
  or the spec takes a forward amendment. The task closes here either way: Task 5.6.c writes the errata convention by
  whether the unit has landed when it writes it (§ 1.3), and a landing after that is taken up before the head is fixed
  for the window (`notes-cutover-flip.md` § The landing after verification).

### `[ ]` **5.2 Session lifecycle: handoff, init, recovery, and the loop — § 8.9, § 8.10**

- _Goal:_ The session workflows read and write session context, save state, and sync through the store, with no notes
  leg, SESSION-NOTES file, or commit anchor.

    - `[ ]` **5.2.a `session-handoff.template.md`**
        - Its SESSION-NOTES write becomes `arc handoff write` (`runHandoffWrite`, `lib/handoff/write.ts`); its sync
          section loses the paired push, the notes legs, and the notes-drift surface; its `Commit at Handoff` anchor
          becomes the store's state version, and its `git show <hash>:<meta>` restate reads `history`; the
          person-to-person handoff's `Owner` edit moves to `arc handover` (§ 8.6); it releases a checkout through `arc
          locus release` (§ 8.5).
        - Tests that change with it: `integration/session-authority-docs.test.ts`, and
          `integration/locus-methodology-contracts.test.ts`'s cases that forbid `arc locus release` in handoff and the
          `arc-handoff` skill.

    - `[ ]` **5.2.b `session-init.md`, `session-recover.md`, `session-loop.md`, and the `session-state` method**
        - The text § 8.9 names (`spec-session-init-agenda.md` § 7.3): the spine's SESSION-NOTES authority boundary, its
          thought-state lines and the Blockers line it withholds auto-proceed on, read from the meta's session context;
          the compiler's changes themselves are Task 2.14's.
        - Tests that change with it: `integration/locus-methodology-contracts.test.ts`'s session-init case forbidding
          `arc locus release`.

    - `[ ]` **5.2.c The `arc-handoff` skill and the user directory's README**
        - `user/README.md`: the per-work-unit `SESSION-NOTES.md`, the `arc user save` / `load` / `push` / `pull` verbs,
          and `active/` and `backlog/` described as shared and tracked.

### `[ ]` **5.3 Planning stages: draft-design, create-spec, generate-tasks, and amend-design — § 8.2, § 8.3, § 8.11, § 8.14**

- _Goal:_ Planning runs branchless, saves state per review increment with a check request before each save, removes a
  draft as a record delete, and names the work unit's record and projected location rather than a tracked path.

    - `[ ]` **5.3.a `draft-design.md` and `create-spec.md`**
        - The grooming-branch redirect, groom-and-stop's commit-and-push pause, and "Ship instead of pause"'s planning
          lane go; create-spec's planning branch goes; its capture gate reads `arc inbox` (§ 4.2) and removes captures
          by `--id` and `--expected-version`; its save-location step names the record.

    - `[ ]` **5.3.b `generate-tasks.template.md`**
        - Its save-location step names the record; § Finalize the task list's validator step names the save, whose
          task-list write check covers it (`checkTaskListSegmentation`, `checkTaskListDescriptor`,
          `lib/store/kinds/task-list/shape-rules.ts`); the ceremony commit becomes a save.

    - `[ ]` **5.3.c `amend-design.md`, the planning-review and readiness methods, and planning skills and templates**
        - `resolve-planning-depth`'s deferred `Class` write becomes the stage's `arc set-class` at its save (§ 8.6);
          `assess-draft-readiness`' third criterion reads the inbound list; `planning-review`'s pass record moves onto
          `arc review adversarial record` (§ 8.7).
        - Tests that change with it: `integration/pr-lifecycle.test.ts`'s cases pinning `adversarial-passes.md` in the
          work unit's personal workspace.

### `[ ]` **5.4 The task loop and commit text — § 8.4, § 8.15**

- _Goal:_ The task loop closes tasks through `arc task close` after the commit and writes no `[x]` or `[~]` by hand, and
  the commit methods and skills describe saves for state and commits for tracked content.

    - `[ ]` **5.4.a `process-task-loop.template.md`**
        - `arc release commit --close` at the commit fire site; a red segment request removes the completion note alone;
          the pre-report checklist's "Task marked [x]" goes; deferred review closes its range in one call; a hand `[~]`
          becomes `arc task defer`; delivery's correction acknowledgment is reordered around the close; crash recovery
          reads the store's version, changes, and history while keeping its `HEAD`, recent-commit, index, and
          working-tree probes.

    - `[ ]` **5.4.b `prepare-commits.md`, `template-tasks.md`, and the commit methods and skills**
        - `commit-footer`, `commit-format`'s ceremony-commit wording, `code-review`, the `arc-commit` skill's meta-file
          rule, and the `arc-task-review` skill's comparison against Git, which reads the prior version through
          `history`.

### `[ ]` **5.5 Work-unit lifecycle from init to reopen — § 8.5, § 8.6, § 8.11**

- _Goal:_ Each lifecycle workflow runs its verb and saves, with no planning branch, hand-edited verb-owned field, park,
  or remote branch delete the store makes the verb's job.

    - `[ ]` **5.5.a `init-work-unit.md`**
        - Base-parity and write-context preconditions, the `plan/` branch's purpose, push, and SESSION-NOTES seed go;
          the post-init and Errand-promotion `Class` steps move onto `arc set-class`; the `Owner`-preserving step and
          the re-run's `Branch` edit go to verbs.

    - `[ ]` **5.5.b `activate-work-unit.md` and `deactivate-work-unit.md`**
        - Activation's Step 3 `Class` edit moves onto `arc set-class`; Step 4 runs the actions its result names rather
          than `git push origin --delete`; the workspace step goes.
        - Deactivate: Case A's Step 3 remote delete goes to the verb's actions; Case A-delete's Step 3 abandonment
          commit becomes the abandon's write, and its Step 5 keeps only the `external` and `none` arms, since no stub
          folder stays on base and ROADMAP is not stored; Case C's `Branch` edit goes to the verb; a partial-scope `[~]`
          becomes `arc task defer`.

    - `[ ]` **5.5.c `park-work-unit.md` and `resume-work-unit.md`**
        - Both shrink to `arc pause` and `arc resume`; the pointer record, park from Planning's landing, and the parked
          position go; resume's Locus sentence follows the brief's (§ 8.16), naming `arc locus release`.
        - Tests that change with it: `integration/resume-reconcile-workflow.test.ts`'s `chore(arc): resume {name}`
          commit, and `integration/locus-methodology-contracts.test.ts`'s resume case forbidding `arc locus release`.

    - `[ ]` **5.5.d `promote-work-unit.md`, `reopen-work-unit.md`, `clean-work-unit.md`, and the lifecycle methods**
        - `arc promote --class` covers promote's Step 2; promotion's `commit-required` prose goes, in `run-errand.md`'s
          promotion paragraph too; `branch-format`'s `plan/` prefix and its `[invariant]` go; `assess-parallel-fit`,
          `discover-next-work`, and `assess-start-readiness` read the store or the projection; `classify-work-unit`'s
          lifecycle positions name the record's lifecycle rather than `backlog/` folders; the cohort template's `Parent`
          note is rewritten.
        - Tests that change with it: `integration/locus-methodology-contracts.test.ts`'s `settlement.state:
          commit-required` cases.

    - `[ ]` **5.5.e Cohort identity steps**
        - Every step that renames, closes, or removes a cohort, or resolves a slug clash, by hand edit moves onto `arc
          rename <slug|uid>`, `arc cohort close`, and `arc cohort remove`.

### `[ ]` **5.6 Delivery, review, and archive, with the errata convention — § 8.7, § 8.12**

- _Goal:_ Verification, pre-publication, integration, and archival make no record-only commit, record passes and reports
  in the store and scratch, and archive through the store in both cadences.

    - `[ ]` **5.6.a `verify-work-unit.md` and the verification record**
        - Save the verification task's edits, close it with `arc task close` or `arc release commit --close`, then `arc
          attest`; Step 1's rejected or dismissed captures go into a `_Captures:_` category of the verification record;
          § Verification Record and `strategy-task-list-formatting.md`'s verification-task exception, which today
          protects exactly two categories, change together; the capture gate removes by ID and version.

    - `[ ]` **5.6.b `prepare-work-unit.md`, `integrate-work-unit.md`, and `deliver-stack.md`**
        - Record-commit and keep-staged steps go, attest's commit staying for the review copy; the archive commit and
          its push go while step 8's dispatch keeps both cadence arms; `arc user close` goes; the pull request still
          opens through `gh pr create` and archive records it through `--pr-url` (Task 2.7); a candidate-tail commit
          removes the review copy (`git rm -r .arc/specs/<slug>/`); `deliver-stack.md`'s `commit-selection` step goes.
        - This repository's `archive.cadence: manual` (`.arc/system/arc-config.yml`) goes by a targeted edit, so it runs
          the default `with-integration` and the work-unit canary exercises archival before the merge (§ 8.7); the flip
          itself takes no ordinary archive (`notes-cutover-flip.md` § The landing after verification).
        - Tests that change with it: `integration/review-gate-workflows.test.ts`'s `arc user close` case, and
          `integration/prepublication-workflow.test.ts`'s record-commit cases.

    - `[ ]` **5.6.c `archive-work-unit.md` and the errata convention**
        - The sidecar cohort sweep goes, the final member's Closeout section staying. The post-`Shipped` errata
          convention is written by whether `projection-team-scale` has landed when this subtask writes it (§ 1.3): where
          it has, around `arc edit`, the Release Notes Entry edit, and `arc save`, its contract re-checked first as Task
          5.1 does where the landing came after that task; where it has not, around write-back's in-place archived edit,
          rewritten onto `arc edit` if the unit lands before the head is fixed for the window, and otherwise shipped in
          that form, the unit's landing rewriting it (§ 1.3; `notes-cutover-flip.md` § The landing after verification,
          step 3).

    - `[ ]` **5.6.d The review methods**
        - `adversarial-review`'s § Pass record and § Kept prompts and reports name `arc review adversarial record` and
          the scratch folder; `pull-request-format`, `review-model`, and `validate-criteria` where the search names
          them.
        - Tests that change with it: `integration/pr-lifecycle.test.ts`'s personal-workspace cases, and
          `framework-sync.test.ts`, whose manifest hash for `pull-request-format.md` moves with it
          (`.arc/system/.internal/manifest.json`).

### `[ ]` **5.7 The decomposition workflow's end state — § 8.8**

- _Goal:_ `decompose-work-unit.md` describes the store version: an additive batch replacing dispatch, authoring, one
  distribution approval, and the terminal batch as the landing, with the separate finish-preview stop gone
  (`spec-seam-decomposition.md` § 16).

    - Tests that change with it: `integration/work-unit/decompose-workflow-contract.test.ts`, whose assertions pin the
      `--finish` preview and the `git add --` steps among others.

### `[ ]` **5.8 Routing, the inbox, and the Errand queue — § 8.10, § 8.13**

- _Goal:_ Routing carries out outcomes through `arc route` and `arc inbox`, captures are entries with IDs, the Errand
  queue replaces execute-bound marks, and no planning lane is armed.

    - `[ ]` **5.8.a `drain-inbox.md`**
        - Grooming change and owner adoption onto `arc route`; per-target re-triage reads `arc inbox <slug>`'s pending
          count, oldest date, and `retriage` offer (`lib/inbox/listing.ts`); execute-bound marks become `arc errand
          queue set`; removal by `--id` and `--expected-version`; the grooming branch and pull request and the planning
          lane go.
        - Tests that change with it: `integration/locus-methodology-contracts.test.ts`'s `arc user
          inbox-mark-execute-bound` cases, and `integration/review-gate-workflows.test.ts`'s planning-lane arming cases.

    - `[ ]` **5.8.b `run-errand.md`**
        - The route-only Errand onto `arc route`; `--from-inbox` takes `<personal|project>:<id>`; the goal comes from
          the entry's description; start takes the entry off the queue and abandon returns it; the next offer is the
          head of the person's queue; atomic completion follows the full close and partial removal by ID and version;
          the planning lane goes.

    - `[ ]` **5.8.c `route-discovered-work` and `issue-triage`**
        - The binding section takes the from-the-flip binding through `arc route`, `_Routed from:_`'s date moving to
          `_Created:_`; the planning-grooming lane selection goes.
        - Tests that change with it: `integration/review-gate-workflows-code-review.test.ts`'s `arc review
          planning-grooming resolve -` cases, and `integration/framework-sync.test.ts`, whose manifest hash for
          `route-discovered-work.md` moves with it.

    - `[ ]` **5.8.d The `arc-inbox`, `arc-errand`, and `arc-housekeep` skills and the skills README**
        - `arc-inbox`'s route-now step and USER-INBOX rooting text; `arc-errand`'s route shape and `--from-inbox`;
          `arc-housekeep`'s write-context precondition.

### `[ ]` **5.9 Setup, configuration, and merge-gate text — § 8.13, § 8.15**

- _Goal:_ Setup and the shipped configuration describe the store's settings and notes' absence, and the merge-gate
  recipe no longer arms the planning lane.

    - `initial-setup/01_verify-and-configure.md`'s planning auto-merge steps and `user.notes_push` text;
      `02_define-project.template.md`; `setup-merge-gate.md`, `merge-gate/CODEOWNERS`, and `merge-gate/README.md` drop
      only the planning-lane arming; `setup-release-wrapper.md`, `verify-arc-integrity.md`, `maintain-project-docs.md`,
      the templates README, and `template-contributing.md` where the search names them.
    - The shipped configuration template (`packages/arc-framework/arc/system/arc-config.yml`, Configurable, edited by
      targeted edit in both copies) documents `inbound.retriage_after_entries`, `inbound.retriage_after_days`, and
      `pause.review_after_days` (`spec-seam-locus.md` § 14; `lib/config/schema.ts`) in the catalog's order; its comments
      on `user.notes_push` and `session.init_pull.notes` / `session.init_load.notes`, keys that stay until notes
      removal, and its `arc user pull` / `arc user load` remedies state that they have no effect on a store kept off the
      branch.
    - Tests that change with it: `integration/review-gate-workflows.test.ts`'s CODEOWNERS and merge-gate README cases,
      and `unit/config/inventory.test.ts`'s check that the three settings are absent from the template.

### `[ ]` **5.10 The always-loaded text — § 8.3, § 8.16**

- _Goal:_ Every sentence in the brief, `DEV-RULES.ARC.md`, and QUICK-REFERENCE's verb index that the flip makes false
  states what is true from the flip.

    - `[ ]` **5.10.a `AGENT-BRIEF.ARC.md`**
        - The Locus definition: exclusive "through exact teardown or release", the role deriving from the marker and the
          store; § How ARC Works' state files.
        - Tests that change with it: `integration/locus-methodology-contracts.test.ts`'s "tracked lifecycle, transient
          identity, and Git topology" case.

    - `[ ]` **5.10.b `DEV-RULES.ARC.md`**
        - § Commit Discipline's task-list accuracy, meta-file timing, and meta-file commit shape, and § Atomicity's
          sentence; § Handoff's and § Write for the reader's SESSION-NOTES; § Review-Increment Invariant reworded so a
          persist is a save, with its bounded exception's archive composition and readiness regeneration following; the
          relocatability rule rewritten onto the movable set (§ 8.3); the rebase scope's notes reason dropped, the
          invariant kept.

    - `[ ]` **5.10.c QUICK-REFERENCE and the other briefs**
        - The verb index gains `arc handover`, `arc task close`, `arc task defer`, `arc save`, `arc locus release`, `arc
          inbox`, `arc materialize`, and `arc store`; `arc pause` replaces `arc park`; `arc start`'s `plan/<name>` goes;
          the notes verbs and `arc sync`'s direction change with § 4.1; `AGENT-BRIEF.CONTRIBUTOR.md` and
          `AGENT-BRIEF.PROJECT.template.md` where the search names them.

### `[ ]` **5.11 Every remaining site rewritten or recorded as kept — § 8.1**

- _Goal:_ Every hit of the closure search not rewritten by Tasks 5.2–5.10 is rewritten here or recorded in
  `notes-cutover-flip.md` § Kept sites with its reason, and every bare path into a projected root names the record's
  filename or the verb that reads it.

    - The package's `.arc/` README's tree (`README.md`, its `backlog/ROADMAP.md` line) and
      `reference/supplemental/analysis/README.md`'s SESSION-NOTES are rewritten here; the hooks README's ROADMAP
      conflict exemption and contributor staging warning (`system/.internal/githooks/README.md`) and
      `hooks.contributor_protected_paths` stay until tracked-state removal deletes them, recorded as kept.

### `[ ]` **5.12 The retired forms exhausted** — validate exit criterion at segment scope

- _Goal:_ The closure search over the shipped text at this head finds only the recorded kept sites; Framework files
  match their rendered source (`integration/framework-sync.test.ts`), and each Configurable and template file carries
  the same targeted edit in both copies.

    - Re-run Task 1.6's inventory over the verbs the rewritten text names, and confirm each in-repo refusal names its
      pre-flip step.

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

### `[ ]` **6.1 Re-check `cutover-window-tooling`'s contract once it lands — § 1.3**

- _Goal:_ Each contract item § 1.3 states for the window tooling holds at `main` once it lands — the quiesce check and
  its conditions, the record and hold, the recompute and its last read, the auto-merge refusal, the close, the abort's
  restore and its accept and consumed-ref comparisons, the worktree lock step, the seal on `arc user load`, and Stage 1
  — or the spec takes a forward amendment before Stage 2 runs.

### `[ ]` **6.2 The parser check — § 9.4**

- _Goal:_ A check refuses while any kind with a writable projected path lacks a registered parser in
  `PRODUCTION_REGISTRATIONS` (`lib/store/kinds/registrations.ts`), save `work-item/notes`, `personal/document`, and
  `personal/session-context`, or any entry kind lacks an entry grammar (`ENTRY_CONFIGS`,
  `lib/store/kinds/entry-configs.ts`).

    - A test in the suite derives both sets from source rather than listing them: the projecting kinds as
      `RECORD_LINK_KINDS` selects them (`lib/store/kinds/in-repo-registrations.ts`), which leaves out
      `personal/errand-queue`, and the entry kinds as those whose mechanism declares `merge: "entry"`
      (`KIND_MECHANISMS`, `lib/store/registry.ts`), which include it.
    - The inventory write-back hands the rehearsal (`spec-projection-write-back.md` § 7.6, its A3) is the cross-check: a
      kind it names that the derived sets lack fails the test. Both halves hold today, so the check catches a kind
      added before the flip without one.

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
          saves and before `check` (§ 10.2). It does not run `rehearse`, whose fresh stand-in flip branch would replace
          the flip's own.
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
          `check`; the flip build's refusal of a ref store, each probe run with the override dropped: over the copy
          before its import, and in the flip's checkout after the import and before its deletion commit.

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
        - The final run, carried through the window's end.

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

- `[ ]` All quality gates pass (tests, linting, type checking)

- `[ ]` Ready for integration
