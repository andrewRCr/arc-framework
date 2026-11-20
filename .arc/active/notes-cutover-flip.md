# Notes: Cutover Flip

## Task generation

- Generate the whole task list at once, starting when `projection-worktrees` reaches its verification phase, with no
  phases generated ahead of it (Owner, 2026-11-11).
- The inbound items this unit held keep the numbers they had in `storage-cutover`'s buffer (#2 to #37, H1 to H5), and
  each is folded into the spec where its subject is designed. `cohort-storage-cutover.md` names the shares of the items
  that span members (#1, #10, #25, #26).

## When the flip lands

- These `WORKING-MEMORY` entries name the flip's landing as their removal trigger: the auto-merge lane's `planning`
  mapping, the Errand-close `nextOffer` resumption, the `role-conflict` fast-forward, the landing bridge's Candidate
  re-asks, the decomposition procedure until the cutover, and the hold on `arc user load` and `arc user pull`.
- `RELEASE-GATES.md`'s landing rules until the program completes retire with the two-PR landing bridge and
  `archive.cadence: manual` (§ 17.1 of the spec).

## The switch's increment

The switch (Task 3.3) makes every store a command opens report `stateOffBranch` true, so every surviving test that
reaches the default changes its expectation by the end of Phase 3. It lands in stages, each commit green (Owner,
2026-11-13), rather than as one commit of every test that rests on the default:

1. The installed files and their presence test leave the projected roots (Task 3.1), since an `arc-in-git` install that
   commits them would meet the tracked-state refusal once the switch lands.
2. The seeding helper lands, and the spawn helpers set the override by default (Task 3.2), inert until the switch.
3. The switch changes `createStore` and the expectations of the direct callers Task 1.4 recorded as expecting the ref
   backend; every other test file that then fails without the override runs under it from the switch's ledger, which
   a per-file setup reads (Task 3.3.d, A12).
4. The failures the switch exposed that may be product defects are diagnosed against the ref default, and the listed
   files no family of spawned tests reaches move by group (Task 3.R).
5. Each family of spawned tests seeds through the store, drops the override, and takes its listed files off the ledger,
   one family per commit (Task 3.4); a test whose subject is the in-repo arm keeps it explicitly.
6. The spawn helpers' default and the emptied ledger go (Task 3.6), so the slice cannot close with a test still hidden
   behind either.

The spawn helpers' default and the ledger are the only defaults, confined to Phase 3; the test setup's clearing (Task
1.2) still keeps the flip's checkout's own override from every test. A test seeds through the helper's in-process writes
through the ref backend's ports, which run without spawning the CLI, or through the verb it tests; running the import
under the override and deleting its tracked state is reserved for the tests whose subject is the import.

## The flip's checkout

From the switch until its merge, the flip's checkout sets the override in the environment of every command it runs,
`git` included, since a hook inherits the environment of the `git` process that runs it (spec § 3.1). Only Claude Code
sessions run in this checkout through implementation, so the override, `ARC_IN_REPO_STORE=1`, is an `env` entry in the
worktree's own `.claude/settings.local.json`, untracked, set before the switch's commit (Task 3.3) and removed when the
flip's checkout drops the override after the merge (§ 10.5); a shell opened there by hand exports it (Owner,
2026-11-13). The tracked-state refusal (§ 3.2) is the backstop when a command runs without it: the command refuses
rather than creating a store or projecting, and its remedy never names the override. In the flip's checkout that
refusal means the override has lapsed: restore it and retry the command, and never take the refusal's remedy there,
since its import and its deletion of tracked state belong to the window (spec § 10).

The settings entry reaches every command the session runs, wherever it runs. So a command the session runs outside the
flip's checkout, such as the built CLI in Task 3.7's scratch repository or on Stage 2's copy, drops it
(`env -u ARC_IN_REPO_STORE <command>`), save the copied flip checkout's steps before the copy's merge, which set it as
the live checkout does, other than Stage 2's two probes of the flip build's refusal, over the copy before its import
and in that checkout after it, which drop it (Task 6.4.b). Tests need nothing, since their setups clear it (Task 1.2).

## The landing after verification

The task list ends at verification, which comes before the window (spec § 10.1). This unit integrates through the
window rather than `integrate-work-unit.md`'s ordinary path, since the import must read its records live at its branch
tip and the store archives it only after the merge (§ 10.5). After Task 7.1, in order:

1. Pre-publication review through `prepare-work-unit.md`, then `integrate-work-unit.md` through its review iteration
   and completion content (Steps 1 to 7), with Step 9's push; neither Step 8's archive nor the integration checkpoint
   runs, and the window takes the place of Steps 8, 10, and 11. These run in-repo, so each staged record or
   `commit-*` result the rewritten text no longer names takes its pre-flip commit (§ Pre-flip steps).
2. The flip's changes to shared tracked state, its cohort record's planning edits among them, land on `main` by their
   own pull request (§ 10.1).
3. Where `projection-team-scale` has landed since Task 5.6.c wrote the convention, its § 1.3 contract is re-checked at
   `main`, or the spec takes a forward amendment, and the errata convention is rewritten onto `arc edit` in Task 5.6.c's
   form (spec § 1.3, § 8.12). Where it has not landed when the head is fixed, the window runs on the in-place form (spec
   § 17.3) only once that unit's specification or task list, on its branch, carries both of what its own landing then
   does: the errata convention's rewrite onto `arc edit`, and the read-only lay over an archive the flip's first
   materialization laid writable (spec § 1.3).
4. After the last landing ahead of the window, the branch merges `main` and pushes, and the head is fixed: review
   settled and verification done at it, CI dispatched there and over it with the deletion commit applied by Task 6.7's
   method, and Stage 2 re-run there where the flip change, the import, or the rewritten workflows changed since
   Task 6.8 (§ 9.2).
5. Every other § 10.1 precondition holds before the quiesce, the pre-import tidy worked from the import's trial among
   them, since no tool enforces it and publication cannot be undone (§ Security and privacy).
6. The window, § 10.2 to § 10.7 and notes retirement (§ 12), its aborts by § 11.
7. Each criterion verification deferred is marked when the step that proves it passes: the window's completion at the
   close (§ 10.7), the register rows at the closures (§ 10.5), the notes refs at notes retirement (§ 12), and the
   canaries at their landings (§ 9.11). In the archived task list its `[~]` becomes `[x]`, the criterion text unchanged,
   with an annotation sub-bullet naming that step. The mark is the archived owner's edit in place, persisted by `arc
   save` (`spec-projection-write-back.md` § 8.4), or `arc edit` then `arc save` once `projection-team-scale` has landed
   (spec § 1.3). It departs from `verify-work-unit.md`'s rule that success criteria are marked only during
   verification, as the task list's Success Criteria note decided in deferring them.
8. The `WORKING-MEMORY` entries and `RELEASE-GATES.md`'s landing rules § When the flip lands names are proposed for
   removal.

## Undesignated remotes in tests

A spawned test that adds `origin` after `arc init` (`e2e/lifecycle-exit.e2e.test.ts` among them) leaves it with no
`arc-state` designation. Only the store's pull and push resolve a designation (`resolveRefDesignation`,
`lib/store/ref/pull.ts` and `push.ts`): a code remote with no answer and no registry yields `designation-needed`
(`lib/store/ref/designation-first.ts`), which a consumer's pull proceeds past with a notice (`consumePull`,
`lib/store/pull-consumption.ts`), while the store archive refuses (`lib/work-unit/verbs/archive-store.ts`). A family
that pushes or archives designates the remote (`arc store remote origin push`) or expects that outcome.

## Test callers

The search § 7.7 asks for, at `a7c65b4239`. Task 1.4 and Task 3.6 record each file's classification here as they run.

- **Spawned outside the spawn helpers, composing the default store:** `integration/validate-cohort-consistency.test.ts`,
  which runs `validate-cohort-consistency.ts` through `tsx` over a fixture that is not a Git repository; of the four
  scripts that call `createStore(`, the only one a test spawns. The run over the switched default found tests that
  start the CLI or `git` outside the spawn helpers too, such as `e2e/config-validate.e2e.test.ts` (§ A12).
- **Spawned asserting an in-repo refusal over an untracked fixture:** `e2e/review-cli-surfaces.e2e.test.ts`'s
  adversarial-recording case (Task 1.5), beside `e2e/store-command-dormancy.e2e.test.ts`.
- **Spawned with no `cwd`, over this checkout:** `e2e/run-cli.e2e.test.ts`'s bare `integrate` case (`runCli`,
  `helpers/run-cli.ts`), the only one whose command runs an action; the file's other spawns with no `cwd` are help
  invocations, which run none.

- **No test builds the in-repo backend explicitly.** 93 test files call `createStore(` (225 calls), every one taking
  the default; one mocks `openDefaultStore` and falls through to it (`integration/view-store-cli.test.ts`).
- **Shared store helpers that build the default**, with the number of files importing each: `tracked-write-fixture`
  (72), `in-repo-fixture` (21), `personal-fixture` (11), `sync-fixture` (20), `in-repo-remote` (2),
  `review-differential` (32), `import-comparison` (10), `import-fixture` (43, building on `in-repo-fixture` and seeding
  tracked state), and `repair-cli`'s mock (48).
- **Seeders for spawned tests:** `registerCandidateLineageSuite` (four suites), `positionFixture`
  (`integration/delivery-execution-store.test.ts`), `prepareSessionEnvelopeFixture`
  (`e2e/session-envelope-compat.e2e.test.ts`), `movementPaths` (eight files), and `installCandidate` and
  `writeBoundary` (`integration/review-fan-out-lifecycle.test.ts`). Other fixtures writing tracked paths:
  `fixtures/amendment-task-list`, `decompose-v3`, `respond-command`, `review-mapping`; `helpers/agenda-fixtures`,
  `arc-ignore-block`, `delivery-eligibility-arrangement`, `in-flight-reshuffle`, `status-view-fixtures`,
  `store/lifecycle-differential`, `store/native-delivery-refusal`, and the projection fixtures `engine-fixture`,
  `save-loss`, `swap-fixture`, and `write-back-fixture`.
- **Spawned tests seeding tracked state directly**, about 45 end-to-end files across the agenda and session-init,
  lifecycle (start, teardown, rename, reconcile, retirement), review and publication, delivery, Errands and locus, base
  merge and integration, and status and view, plus `integration/check-projected-selection`,
  `decompose-v3-repository-plan`, `review-fan-out-lifecycle`, and `scripts/remedy-roadmap-conflict`.
- **Tests asserting the in-repo arm through the default:** the five § 7.2 names, plus
  `integration/command-surface-documentation`, `unit/lib/store/in-repo-flat-read`,
  `integration/store-lifecycle-storage`, `unit/lib/store/lifecycle-storage-layout`, and about fifteen store suites
  expecting `unsupported` from a helper-built store. Eight tests hand-build a store with `stateOffBranch: false` and do
  not reach the default.

The direct callers and handler entry points, classified at Task 1.4. An explicit in-repo store is built through
`inRepoStore` (`__tests__/helpers/store/in-repo-ports.ts`), which selects the in-repo implementation through the
override whatever the default builds.

- **Build the in-repo store explicitly, since their subject leaves with that arm:**
    - the store helpers (Task 1.3) and the in-repo store suites: eleven integration suites, `store-tracked-history`,
      `-listing-failures`, `-lookup`, `-reads`, and `-writes`, `store-transient`, `-boundary`, `-history-order`, and
      `-local-causes`, `store-in-repo-errand-branches`, and `store-personal-read`; the unit suites
      `lib/store/in-repo-dispatch`, `-flat-read`, `-identity-admission`, and `-review-read`; and three unit tests that
      expect the in-repo store's `unsupported` refusals, `handlers/review-adversarial`,
      `work-unit/verbs/pause-handover`, and `store-command-registration`;
    - the three § 7.2 tests that reach the default through a handler or script, each now passing its store in:
      `integration/errand-store-imported-cli`, `integration/session-inbox-compatibility` (`createSessionStatusContext`'s
      `operational.store`), and `unit/scripts/review-gate/runtime/invocation-extra-pass-references`
      (`resolveReviewInvocation`'s `store`);
    - handler tests of the repository-root arm: `unit/handlers/candidate-mutation-owner`, `review-frontline-store`,
      `review-hosted-store`, `review-local-store`, and `review`;
    - script tests of the in-repo arm: `unit/scripts/integration/checkpoint-native-convergence` and
      `unit/scripts/review-gate/runtime/respond-candidate-selection` and `source-invocation`;
    - session-init tests of the in-repo arm: `unit/session-init/locus-classification`,
      `materializable-work-units-store`, and `store-user-pull`;
    - store and projection tests of the in-repo implementation: `unit/lib/store/current-work-unit`,
      `lifecycle-index-aliases`, `lifecycle-storage-layout`, and `kinds/review/candidate/history`;
      `unit/lib/checks/projected-selection`'s four starts, which need the in-repo store's disabled start;
      `unit/store/projection/status`; and `integration/store-lifecycle-storage`, `store-passive-object-access`,
      `store-imported-seal`, `store-default-identity`, `store/projection/engine`'s and `engine-end`'s in-repo cases.
      `store-default-identity` and `store-passive-object-access` state contracts the ref store keeps too, identity-owned
      personal reads and passive listing, but seed tracked and personal files, so they test the in-repo implementation;
      whether the ref suites cover each contract is checked when that implementation leaves;
    - work-unit and recovery tests of the in-repo arm: `unit/work-unit/design-export`'s in-repo mode,
      `unit/work-unit/store-read-consumers`, `integration/unclosed-task-actions`,
      `integration/recovery-personal-address`'s `offBranch=false` case, and
      `integration/review-policy-native-context`'s repository store;
    - the import sources the five `store-ref-import-*` suites build by hand: `lineage`, `links`, `parked`,
      `personal-layout`, and `review-mapping`;
    - `integration/identity-setup-store-cli`'s mock of `lib/store/create.js`, whose fall-through serves only the
      registered legacy join;
    - of these, five files still reach the default in some cases under the switched default (§ A12).
- **Expect the ref backend at the switch (Task 3.3.b):** `integration/command-surface-documentation`'s
  remote-designation case, which asserts the default stays in-repo; and the partial mocks of `lib/store/create.js` that
  bind a reference store around each in-process dispatch and fall through to the default when none is bound:
  `integration/completed-subject-matrix`, `editor-settings`, `errand-preservation-store-cli`, `inbox-cli-dispatch`,
  `join-store-cli`, `lifecycle-default-locus-ports`, `lifecycle-marker-occupancy`, `locus-release`,
  `recovery-snapshot-consistency`, `recovery-warm-verification`, `start-cold-store`, `store-public-readers-cli`,
  `store-ref-errand-uid-cli`, `store-ref-projection-changed-mark`, `-selection`, `-selection-reader`, and `-stub-mint`,
  `store/projection/save`, `save-round-trip`, `status`, and `status-command`, and `user-reference-scratch-cli`;
  `unit/lib/store/kinds/review/access-shared`'s, whose default is the real factory;
  `integration/view-store-cli`'s, which replaces only `openDefaultStore`; and
  `integration/review-delivery-member-lookup`'s, which binds the selection around one member lookup's construction.
- **Seed a rename at the base, so delivery's rename history reads there off the branch (Task 2.5):** the native delivery
  fixtures, `helpers/store/native-delivery-repository`, `integration/delivery-boundary-store`, and
  `integration/delivery-review-fix-native`, commit one transition record at `main` (Owner, 2026-11-13), keeping their
  subject, delivery's records, rather than asserting the refusal a base without the folder now gets. The record is
  tracked state, so at the switch a default store composed over those checkouts meets the tracked-state refusal at its
  first operation; Task 3.3 settles any that does.
- **Move at Task 3.3.c:** `repair-cli`'s mock and `integration/handoff-write-store` (§ 7.2).
- **Not the default factory:** `createStore` names a local builder in the `lane-progress*` suites,
  `integration/delivery-authoring-store`, and `unit/lib/release/commit-message-retry-store`; an injected port in
  `unit/lib/checks/projected-selection`, `unit/handlers/check/run`, and
  `integration/store-ref-projection-selection-reader`; and fixture text in `integration/eslint-architecture-rows`.

The spawned tests, classified at Task 1.5. `useInRepoStore` and `useInRepoStoreForEach`
(`__tests__/helpers/in-repo-store-override.ts`) set the override in the test process's environment for one test, or for
each test of a file or `describe` block, so the CLI the test spawns and the Git hooks that run inherit it.

- **Set the override now, since their subject leaves with the in-repo arm:**
    - the spawned imports: `e2e/store-import-errands` and `integration/store-ref-import-personal-batch`;
    - the in-repo refusals: `e2e/store-command-dormancy`'s dormant-command cases, `e2e/review-cli-surfaces`'s
      adversarial-recording case, `e2e/projection-save`'s unsupported `arc save`, `e2e/editor-settings`' dark editor
      setup, and every case of `e2e/decompose-dormant`;
    - the in-repo store's dark projection: every case of `e2e/projection-selection`, `e2e/projection-hooks`, and
      `e2e/projection-status`;
    - the in-repo slug boundary: `e2e/identity-operand-input`'s case keeping lower-case UUIDs as slugs;
    - the old decomposition machine: every case of `e2e/decompose-command-modes` and
      `integration/schema-command/decomposition-provisioning`, and `e2e/lifecycle-exit`'s decomposition fixture case;
    - park: `e2e/lifecycle-exit`'s park and `park --land` cases, its historical abandon evidence case, and its
      staged-path cases for both `abandon` and `park`; and `e2e/retirement-removal-check`'s dirty Planning park;
    - the ROADMAP remedy: `e2e/base-merge-hooks`'s `--regenerate-roadmap` mode;
    - the tracked-prefix planning classifier: `integration/decompose-v3-repository-plan`'s exact-ref verdict case;
    - the notes commands: `e2e/wu-reconcile`'s managed-user-target case, which saves notes and asserts that reference
      reconciliation advances neither the notes ref nor the materialized baseline.
- **Move at Task 3.4 by family:** the spawned tests seeding tracked state whose subject survives, listed above, among
  them `e2e/lifecycle-exit`'s abandon and teardown cases, `e2e/base-merge-hooks`' clean mode, `e2e/wu-reconcile`'s
  other cases, `e2e/view` with its completed-viewing refusal, `e2e/agenda-errand`'s reads of the personal inbox file,
  and `e2e/rename`'s same-name refusal. `e2e/lifecycle-exit`'s shared `beforeEach` runs
  `arc init --pm-mode arc-in-git` and commits it before any case sets the override, so its in-repo cases meet that
  fixture as the switch builds it; Task 3.4.b settles the fixture with the cases that move.
- **Outside this classification:** `integration/scripts/remedy-roadmap-conflict` spawns the remedy script, which builds
  no store; and the notes commands' spawned tests that seed no tracked state and assert no in-repo refusal
  (`e2e/user`, whose committed default `arc init` tracks none of the state roots, `sync-inbound`, `sync-purity`,
  `sync-state-producer`, and `materializing-fetch`) go with Task 3.4.h's `user` assertions.

The switch's ledger, moved by group at Task 3.R. A case expects the ref backend where its subject survives, and selects
the in-repo implementation where its subject is that implementation's own: committed metas and records, the
repository's operation, disposition, and delivery stores, in-repo identity refs, or schema-1 boundaries. An in-repo case
passes the store it builds where its path takes one, and otherwise sets the override; the in-repo branch of the review
live-context read, for one, opens the default itself (`readActiveMetaCandidates`).

- **Review, Candidate, publication, and delivery (Task 3.R.c):** no product defect. The production handlers bind the
  work item from the store (the `*-native-defaults` tests); each refusal came from a fixture that never put its owner or
  project identity in the store, or from a test composing past that binding.
    - _Ref backend:_ `integration/frontline-target-materialization` and `review-chunking-command`, whose fixtures seed
      the project identity through the store; `integration/respond-candidate-lineage`, `unit/scripts/review-gate/status`,
      `status-singleton-coverage`, `policy/hosted-reservation-discharge`, `runtime/confirm-delegation`, and
      `runtime/local-assurance-dispatch`, and 21 cases of `unit/scripts/integration/checkpoint-delivery-composition`,
      each binding a checked store that holds its work unit; and `unit/scripts/integration/merge`'s stored-lifecycle
      cases, which paired a stored lifecycle snapshot with the default store's in-repo arm, a pairing no caller makes,
      since the merge derives its snapshot from the store it binds; they now bind that store, as its native case did.
    - _In-repo, by override for a file or `describe`:_ `integration/review-singleton-local-prepare`,
      `pre-publication-delta`, `pre-publication-frontline-policy-skip`, `pre-publication-correction-proof`,
      `local-review-delivery-binding`, `local-review-target-recovery`, `local-review-live-context-refusal`,
      `review-lane-read`, `review-status-errand`, `review-status-errand-fallback`, `review-status-errand-correction`, and
      `review-contribution-applicability`'s singleton selection.
    - _In-repo, by override for a case:_ `integration/prepublication-delivery-targets`, `review-extra-pass-continuation`'s
      `native=false` cases, `delivery-disjoint-eligibility`'s checkpoint, `store-review-access`'s opened stores,
      `scripts/integration/checkpoint-lifecycle-artifacts`' injected snapshot, three cases of `unit/handlers/errand-check`
      (branch-diff overlap and the USER-INBOX queue), and two of `unit/scripts/review-gate/runtime/respond-composition`.
    - _In-repo, passing the store:_ `unit/handlers/review`'s `handleReviewPrePublication` cases (schema-1 boundaries),
      `unit/scripts/integration/merge-composition`'s in-repo merged state, and `checkpoint-delivery-composition`'s
      multi-member discharge.
    - The unit cases were tried on a bound store first. There `handleReviewPrePublication`'s default dependencies spawn
      Git and write schema-2 boundaries, and `respond-composition`'s two cases find none of the evidence their stubbed
      result reader and disposition store hold.
    - _Store-arm counterparts:_ checked against the cases for `unit/handlers/review` (`review-pre-publication-store`
      mirrors them over native boundaries), `checkpoint-lifecycle-artifacts` (`checkpoint-lifecycle-store`), and
      `errand-check` (`errand/store-overlap`, `lib/inbox/queue` and `offer`). For the rest, the `*-store` and
      `*-native*` review and delivery tests, among them `status-errand-store`, `live-context-errand-store`, and
      `respond-composition-store`, are counterparts by subject only, not matched case by case.
    - _Back on the ledger:_ `integration/review-status-base-movement` and `review-status-errand-base-movement`, which
      import `movementPaths` (Task 3.4.f), and `exact-target-read-isolation`, a locus and reconcile subject (Task 3.R.d).
- **User, Git notes, park, and ROADMAP (Task 3.R.d's first slice):** each subject runs only on the pre-flip build, so
  its cases set the override.
    - _By file:_ `unit/user-status`, `save-load`, `sync`, `user-sync-current-wu`, and
      `integration/notes-export-state-coherence` (Git-notes user state); `integration/user-inbox-remove` (the
      `USER-INBOX.md` file and its execute-bound marks); `integration/park-resume-roundtrip`; `integration/archive-staging`
      and `stub-roadmap-staging` (ROADMAP regeneration); `integration/store-in-repo-fixture-sync` and
      `locus-sibling-delivery-in-repo`; and `integration/store-imported-seal`, whose subject is a pre-flip build's writes
      and whose file fixture is built under the override (`withInRepoStore`).
    - _By `describe`:_ `unit/user-handlers`' load, pull, and open; `integration/multi-clone`'s notes and Errand-ref
      sync; and `integration/user`'s notes and workspace commands, whose shared templates are initialized under the
      override.
    - _Ref backend:_ `integration/user`'s `user add` case reads the seeded working memory and inbox back from the store,
      over a template initialized on the ref default.
    - Under the ref default `arc init` mints the registry ref, so a notes write on the flip build refuses with the seal's
      pre-flip condition ("This build of ARC predates the storage cutover") and a merge-and-rebuild remedy that cannot
      clear it.
- **Release commit and push (Task 3.R.e):** the release cascade survives the flip and resolves the checkout's work unit
  only for its audit entry and its ambiguity refusal (`resolveActiveWu`, `handlers/release/commit.ts`, `push.ts`), whose
  default store the unit tier cannot reach.
    - _Ref backend:_ `unit/handlers/release/commit`, `push`, and `commit-close` mock `createStore` partially to return
      a checked store per case, which moves them to the isolated `unit-mocks` tier; their `writeStatus` seeds the meta
      and the project identity there and binds the checkout to it by marker.
    - _In-repo:_ the two code-10 cases, whose several active meta files are the in-repo implementation's ambiguity, since
      a marker binds one work unit, by override; and `unit/release/wu-resolution`, the resolver over active meta files,
      passing the in-repo store. Counterparts: `wu-resolution-store`, `integration/release-task-close`, and
      `release-commit-task-close`.
- **Lifecycle verbs, start, `init`, `join`, and the executor (Task 3.R.f):** eight files settled, with no product defect;
  the lifecycle handlers and start stay listed for Task 3.R.h (below).
    - _Ref backend:_ `unit/init` and `unit/join` bind a checked store, `init` with a designation that finds no state
      remote, since their virtual checkout has no Git directory for the ref store's ports; `join`'s template case reads
      the seeded records back from that store. `integration/init`'s per-user cases read the seeded working memory and
      inbox from the store, comparing each with its template beside the identifier the store stamps per entry.
    - _In-repo, by file:_ `unit/decompose-preflight-handler` (the old decomposition machine) and
      `integration/errand-promote` (promotion through the shared Errand identity refs and a committed meta; the store's
      is `errand-promote-store`, `errand-promote-store-cli`, and `store-promotion-settlement`).
    - _In-repo, passing the store:_ `integration/store-lifecycle-storage`'s cases over metas committed at real trees
      give the checkpoint and merge compositions the fixture's in-repo store; its cases over stub stores, among them the
      off-branch omission case, need no selection.
    - _By case:_ `integration/executor-store-rebind`'s per-checkout rebinding, each checkout reading its own tracked
      meta, selects in-repo, while its injected-store cases stay on the ref default. `unit/work-unit/executor-context`
      binds a checked store; its withdrawal cases read the branch the work unit links in the seeded project, and three
      cases pass the in-repo store: the two binding the in-repo reconcile ceremony (its lifecycle index and staged
      edits), and the identity-independent placement, since a store placement claims its checkout for the spawning
      identity (`reconcile-work-unit-worktree.ts`).
    - _Still listed, for Task 3.R.h:_ `unit/handlers/lifecycle-verbs`, `unit/commands/start`, and
      `integration/start-dispatch`, whose surviving cases needed store-arm fixtures their files never had (below).
- **Session and status readers, `arc sync`, recovery, and checks and hooks (Task 3.R.g):** 23 files, 206 of 680 cases
  failing under the ref default before any change.
    - _In-repo, passing the store:_ `unit/active/meta-reader`'s default-root layout cases (a flat scan of meta files,
      while its custom-root cases scan without a store); `unit/lib/store/current-work-unit`'s nested legacy reads, given
      the file's own in-repo store; and `unit/scripts/check-foreign-writes`' originating-meta cases over flat active
      metas (the store's resolver is `wu-resolution-store`'s).
    - _By case:_ `unit/active/meta-reader-store` reads its `[none]` sentinels through a held meta's store record bound
      by marker, while its `[none associated]`, `—`, and `[TBD]` sentinels, which the store's write checks refuse, its
      `status.md` beside the metas, and its symbolic link under the default root pass the in-repo store.
      `unit/status/run`'s Git-notes freshness case sets the override, its user probe taking no store.
    - _In-repo, passing the store:_ `unit/git/worktree-roster`'s 17 cases resolving each worktree's meta files, one of
      which passed on the store roster without reading its file, and `unit/commands/active/roster`'s two over a meta
      tree (the store's roster and its team-mode filter are `worktree-roster-store`'s and
      `worktree-roster-store-placement`'s); `unit/lib/checks/projected-selection`'s in-repo capability case, through
      the selection's injected store factory.
    - _Ref backend:_ `unit/handlers/active`'s in-flight cases bind a checked store holding the project identity
      through a partial mock of `createStore`, and its Git mock answers the worktree topology read the store arm's
      frame derivation makes, and the raw executor it opens; the mock that answered every call with one identity was
      the stale fixture A12 diagnosed.
    - _By case:_ `unit/handlers/recover-envelope-boundary`'s progression case reads a task list tracked at both heads
      and sets the override.
    - _By case:_ `unit/sync-orchestrator` tests the notes and worktree matrix, which `handleSync` takes only over the
      in-repo implementation (`finishStoreSync` is the store's leg, `sync-store-leg`'s subject). Its module store, built
      through the default factory and so in-repo only under the ledger, is now built in-repo explicitly. Its eight cases
      ending before the arms part at `sync.ts`'s capability branch (identity and project root absent, a failed worktree
      materialization) or asserting the worktree read made before it pass a checked store; its dry-run audit case, over
      the matrix's dry run, stays in-repo, `sync-store-leg` asserting the store leg's; and its seal case sets the
      override, since the seal opens the default store and seals only a pre-flip build (`pre-cutover-seal.ts`).
    - _In-repo, by file:_ `integration/store-sync-admission` and `store-sync-derived-status` (Git-notes save and
      publication); `integration/concurrent-write-preconditions` (a merge landing a tracked active record on the base,
      the scenario its header defines); and `integration/exact-target-read-isolation`, whose siblings hold a Candidate
      file this build cannot parse, a foreign owner's tracked meta, and a tracked meta a reconcile in the primary must
      leave byte-identical. The store has no per-checkout copy of either; the locus reader's containment of a malformed
      or unreadable sibling is `unit/locus/derived-reader`'s subject, over injected ports, and a store reconcile leaving
      other records unchanged is `store-reconcile-reuse`'s.
    - _By case:_ `e2e/check-pre-commit-hook`'s nine task-numbering cases commit tracked task lists, whose lifecycle hook
      checks only the pre-flip build runs, and set the override for the hook the commit starts; its gate cases stay on
      the ref default. `integration/check-projected-selection`'s forecast case sets it only before its production
      fallback, the in-repo implementation's dark projection selecting nothing (`projected-selection.ts`). Called
      outside a command whose projection has started, the ref arm spawns `npx arc selection`, which in this fixture, a
      repository outside any npm project, resolves no executable and exits 1, silently under `npm run -s`; inside the
      CLI the started projection answers in process, and `unit/lib/checks/projected-selection` covers both arms.
      `integration/store/projection/cli-hooks`' one case, hooks around a dark backend, sets it by file.
    - _Ref backend, stale fixtures (A12):_ `integration/status-conflicts-cli` and `status-store-refresh-cli` built
      repositories without the identity root's ignore policy `arc init` commits (`.gitignore`'s `.arc/user/*/` and the
      installer's `.arc/user/.npmignore`), so the projection's ignore guard warned on stderr, and the fixtures now
      commit it. Their cases asserting that status writes nothing compared the checkout's listing across the first
      command, which on the ref default also materializes the projection, so each starts the projection with
      `config status` before its snapshot. The conflict mode's refusal before the capability flips sets the override.
    - _Ref backend, by case:_ `integration/active`'s and `integration/status`' cases whose subject is the meta's own
      fields hold that meta in a checked store, the checkout's marker bound to it (`helpers/store/held-meta.ts`, which
      leaves Current Workflow unset, as the narrative session-type cases need): single resolution and placement, field
      parsing, companions over every Task List form (the store admits each), the maintainer default, session-type
      inference from narrative fields, the planning sub-stage, and the composite's carry-through, 26 cases. Those over
      what only tracked files hold pass the in-repo store, 26 cases: several metas at once, Candidate files under
      `.arc/system/.internal/candidates/`, a free-form or empty State, a `[none associated]` Task List, a meta with no
      Current Workflow bullet or a Planning one with no planning stage (the store refuses each), a non-slug filename, or
      a missing root. The other 41 cases read no record and stay as they were. Of the 13 Candidate cases' subjects, the
      store's session-init projection has cases for a stored Integrating Candidate and a retained one
      (`unit/active/status-store`) and for a native review boundary and a recovered pending fix
      (`locus-subject-native-review`); the exact Active prepublication boundary, the stale-subject fallback, an
      unavailable Candidate record, the publication reservation, applicability awaiting authority, fix authority outside
      prepublication, and an Integrating boundary naming another subject are Task 3.R.i's, below.
    - _By case:_ `integration/status-project`'s 14 cases over metas on branch refs and remote-tracking refs, the index,
      staged transition records, and the stored ROADMAP set the override, `handleStatus` opening the default store
      itself; its identity refusal stays on the ref default. Their surviving behaviors are the store's in
      `unit/handlers/status/store-locus` (fetching before a slug query, staying local without one, an anchored holder's
      worktree path, fetch reachability) and `store-project` (the project view's fetch and local split, and its refusal
      of `--staged`); the readiness warnings' channel had no store case, so `store-project` gains one, its dangling edge
      an Errand's slug since the store refuses a write adding one.
- **Lifecycle handlers and start (Task 3.R.h):** three files, none exposing a product defect.
    - _Ref backend, the fixture:_ `unit/handlers/lifecycle-verbs` binds a checked store per case through a partial mock
      of `createStore`, holding the project identity and `foo`'s meta, linked to its branch under the project's UID,
      beside its task list, and the real `buildExecutorContext` carries it, as production does. Its Git mock answers the
      worktree topology read the store arm makes ahead of each case's own calls; its meta reader parses the store's
      records on that arm and each case's mocked fields on the in-repo arm, since the store's write checks parse through
      it; and its current-work-unit mock returns the held record's reference. With the store bound, 49 of its 99 cases
      first failed; 52 now run on the store.
    - _Ref backend, adjusted:_ promote binds a provisional stub with no Class, as promotion finds one, where the default
      meta's `Light` conflicted with `--class Novel`; deactivate's dispatch carries the base branch the store arm adds;
      abandon's illegal-source refusal holds an Integrating work unit and asserts the store's `arc reopen` remedy, which
      no store test asserted, and both abandon refusals read the held record back; attest's Integrating refusal holds an
      Integrating meta instead of mocking its parse; and promote's and abandon's bare invocations assert their usage
      refusal. The abandon, attest, spec-input, and seeded-start cases converted in place leave their in-repo forms
      unasserted in these files.
    - _In-repo, by describe:_ decompose and park, which run only on the pre-flip build (park refuses over the store for
      `arc pause`), and resume, whose store arm is `handleStoreResume` (`lifecycle-collaboration`, and `pause-handover`
      for its `--here` refusal).
    - _In-repo, by case:_ materialize's four cases dispatching the in-repo verb (the store's is `materialize-store` and
      `materialize-store-cli`), its interaction-context case staying on the store; abandon's `--yes` dispatch and its
      branchless teardown advice, since the store's handler tears down within its batch and advises none
      (`abandon-store`, `abandon-store-holders`), its plan-and-refuse and bare-invocation cases staying on the store;
      attest's four cases over an interrupted write sequence, which the store writes as one batch
      (`attest-design-export-native` for its refusal); and three attest cases and one publish case over a schema-1
      boundary the case supplies: the Owner-accepted recovery, delivery authority while Integrating and while Shipped,
      and publication's unchanged resume point. Their compositions on version two are
      `integration-boundary-locus-recovery-v2`'s, and the verb's unchanged outcome `publish-store`'s and
      `publish-store-native`'s.
    - _No store case at the handler:_ `handleAttest` threading those three version-two boundaries through its batch
      (`prepareCandidateRecordPut`), and `handlePublish` persisting a moved resume point on an unchanged outcome
      (`persistUnchanged`, a version-two write under the Candidate's version). Each needs Candidate and boundary records
      held in the store.
    - _`unit/commands/start`:_ cold start's tracked scaffold, its absent marker, the protected base's `plan/` cut, the
      meta-file occupancy guard, and protection's two allowances select in-repo, 12 cases; the store's cold start
      anchors a marker and leaves HEAD in place (`start-cold-store`). Spec-input classification (`coldStartSeed`), which
      had no store case, runs the store's cold start over a checked store, reading Origin, Design, and Current Workflow
      from the held meta, 6 cases. Create-new's five cases reaching the spawn select in-repo, since the store's detached
      spawn observes the new checkout through more Git than a scripted executor answers. `start-store` holds the store's
      detached creation and rollback, and gains cases for a configured base with its provisioning hook and for a failed
      spawn, which no store test covered; `spawn-rollback-ownership` holds provisioning failures and `start-store-alias`
      a lock-only failure. The pure helpers and the refusals before either arm need no selection.
    - _`integration/start-dispatch`:_ 23 of 31 cases select in-repo: committed metas, `plan/` branches, `git mv`
      graduation, ceremony commits, several active metas, and a sibling's meta on its branch. Its two direct cold
      starts, given no store, had run the in-repo arm over the default store's reads, and now give the store's cold
      start a checked store. The four sibling refusals had passed on the ref default for another reason, the store
      holding no record of the sibling, so they now assert their own; the store refuses a live Planning holder in
      `start-store-alias` and `store-unbound-holders`, and `start-store-alias` gains its Active and Integrating
      refusals, which no store test covered. The seeded spawning start's refusal asserts the store's wording, as
      `start-store-alias` does. Store counterparts: `start-store`, `start-store-marker`, `start-store-alias`, and
      `start-cold-store`.
- **Candidate session-init on the store (Task 3.R.i):** `unit/active/status-store`'s cases, one product defect.
    - _Ref backend, by case:_ the exact Active prepublication boundary, a version-two publish-ready boundary carrying a
      terminus key; the stale-subject fallback to initial review; the publication reservation, recovered from a stored
      publish-ready boundary to `publication-pending` with its readiness binding, its expected boundary written out
      rather than produced by the recovery under test; applicability awaiting authority, kept for Integrating work and
      left unresolved for Active work; and an Integrating boundary naming another subject. Each holds its work unit,
      Candidate, and boundary in a checked store and held as built. The retained-Candidate case's fix-authority reader
      now throws, so execution reads neither the target nor the fix authority. `integration/active`'s Candidate cases
      keep the in-repo store, their records being Candidate files.
    - _Defect (A12), the unavailable record:_ on the store a Candidate's identity is its record, not the meta's
      `Candidate` bullet: the store's attest writes the record, the boundary, and the meta's workflow fields in one
      batch and no bullet, and `readSubject` (`lib/store/active-review-access.ts`) replaces the bullet with the record's
      ID. The in-repo subject, a meta naming a Candidate whose file is missing, has no store form; its counterpart is a
      Candidate read that refuses. That left an Active work unit in `prepare-work-unit` with no Candidate ID, so
      `classifyResolution` inferred execution beside the warning, the fallback the in-repo case refuses. The derived
      locus already returns `subject-unresolved` for it (`unit/lib/locus/subject-meta-candidate`), so session-init and
      recovery were unaffected; `arc active status --session-init` was not. The projection now records each candidate
      whose session needs its Candidate, Integrating or Active in `prepare-work-unit`, when that read fails, and
      classification leaves its session type unresolved (`commands/active/status.ts`). The case runs for both states,
      each resuming its session once the read succeeds; the Integrating one held before the fix, since an Integrating
      session without a boundary was already unresolved.
    - _Left as built (Owner, 2026-11-19):_ an Active work unit in `prepare-work-unit` with no Candidate record infers
      execution, as the in-repo arm does for a meta naming no Candidate. No lifecycle verb or workflow step produces
      that state: attest writes the workflow with the record, reopen from Integrating keeps it, rename moves it in one
      batch, and `prepare-work-unit` sends a work unit with no Candidate back to verification. The store admits it,
      though, as `status-store`'s fixture writes it by a plain put.
- **The ledger at Task 3.R's close:** 18 files, each a Task 3.4 family's or Task 3.5's. The 11 end-to-end files are
  spawned tests, moving with their families, `e2e/markdown-fix` with Task 3.5. Of the seven integration files,
  `candidate-lineage` (`registerCandidateLineageSuite`), `review-fan-out-lifecycle`, and `review-member-full-final` (the
  fan-out harness) reach Task 3.4.c's shared fixtures, `delivery-position` (`registerDeliveryPositionSuite`) Task
  3.4.d's, and the two `review-status-*base-movement` files Task 3.4.f's. `history-shape-ambiguity` reaches Task 3.4.f's
  too: its arrangers (`advanceBase`, `arrangeAmbiguousMergeBase`, `arrangeBranchSide`, `helpers/base-advance.ts`) are
  the base-movement seeders that family's spawned tests share, beside `movementPaths`.
- **Session-init and the agenda (Task 3.4.a), classified before any edit:** 14 end-to-end files, 80 cases: the nine
  `agenda*` files, `session-envelope-compat` with its seeder `prepareSessionEnvelopeFixture` and seven goldens
  (`fixtures/session-envelope/`), `session-init`, `session-init-remote-boundary`, `session-init-orphan-actions`, and
  `precompact-locus-anchor`, the only one the ledger lists. No integration file spawns these commands; the
  `agenda-fixtures` importers are unit tests and fall to Task 3.6. With both spawn defaults and the ledger line removed,
  49 cases failed and 31 passed. _Ref_ passes on the ref default with its subject intact; _Store_ seeds through the
  store or the verb under test, binds the checkout's marker, and drops the override; _In-repo_ keeps the override
  explicitly, its subject leaving with that arm; _Open_ needs diagnosis or an Owner decision first.
    - _`agenda` (2):_ both _Ref_ (input refusal; asserted stop agenda).
    - _`agenda-checkout` (2):_ `--housekeep` _Ref_; `--context` _Store_, its work unit held and the checkout bound,
      since with no work unit at all its "enters none" assertion holds for the wrong reason.
    - _`agenda-cold-start` (2):_ the offer _Ref_; the accepted scaffold _Store_, `start --here` writing the store and
      the assertion reading the record rather than `.arc/active/meta-cold.md`.
    - _`agenda-errand` (3):_ seed, pick, and queue _Store_: the entry held in the personal inbox record and the queue
      set by `arc errand queue set`; the byte-identical inbox file becomes an unchanged store version.
    - _`agenda-passivity` (1):_ _Open_, leaning _In-repo_: its notes refs, `refs/arc/user/*/errands` identity ref,
      title-keyed queue write, and `arc-sync-temp` family are the retiring arms; the store's passivity needs its own
      case.
    - _`agenda-plan` (4):_ bare and missing _Ref_; found _Store_ (a held planned stub); ambiguous _Open_, as the store
      may not hold two stubs of one name.
    - _`agenda-recovery` (3):_ all _Store_: a held work unit linked to the deleted branch, the checkout bound, the
      remote designated.
    - _`agenda-resume` (1) and `agenda-start` (2):_ _Store_, held metas and task lists; `SESSION-NOTES.md` drops, its
      context living in the meta; the read steps name the projection's paths.
    - _`session-envelope-compat` (13):_ two pure normalization cases and the Git-name fallback _Ref_; the root-ordering
      case follows its fixture; the orient, active-resume, branch-gone, and four recovery-audit cases _Store_, the
      seeder holding the work unit, task list, cohort record, and a version-two boundary rather than committing them and
      hand-editing `attest`'s file; the current-husk and identity-missing arms _Open_, their envelopes differing on the
      store with no tracked state involved. Each golden that changes is diffed and every changed field traced to the
      spec; none is regenerated from output.
    - _`precompact-locus-anchor` (3):_ all _Store_: the remote designated after `arc init`, the spawned case's parent
      work unit held and its checkout bound, the conflict case's Planning work unit held with both markers bound to its
      record, with no `plan/` branch.
    - _`session-init-remote-boundary` (4):_ the read-only common directory _Open_ (below); the promisor case and the
      omitted-tree husk case _In-repo_, reading committed metas from remote branch trees and a completed meta from the
      base tree; the shallow and full clones _Store_, each clone joining the published store.
    - _`session-init-orphan-actions` (2):_ _Open_: the store arm reports no orphan for a branch no record names ("orphan
      evidence missing"), while the spec keeps the sweep's store-backed outcome. Settled by A16.
    - _`session-init` (38):_ 21 _Ref_: the hooks path, the branch-shaped checkout, the unreadable seed, the eight option
      conflicts, the orphan with no plan pattern, the record-less remote residue, the deferred rename move, the four
      base-pull recommendations, and the two shared advisories. The valid v3 Errand identity _In-repo_, passing on the
      store only because no store path reads that ref. _Store_: the seed sidecar, the lean recover envelope, the reopen
      to an exact task, the published correction, applicability awaiting authority, the seed audit, the two
      narration-inferred execution cases (an untracked meta file is no record), and the Candidate resume locus. _Open_:
      the bound-delivery reopen refusal (a delivery subject), the large Candidate's batched-read counts, the all-heads
      generation (its notes and identity-ref assertions are in-repo), the three remote-acquisition isolation cases, and
      the unstamped-authority husk; the omitted-blob husk _In-repo_.
    - _Possible defects, diagnosed first (A12):_ under the ref default every command's projection takes a lock in the
      checkout's Git directory (`arc-projection/`), so a read-only common directory now fails `status --session-init`
      with `EACCES`, where it returned code facts; whether a read-only command may skip the projection there is an Owner
      decision, settled by A17. A clone that has not joined reports "Project identity record is missing" per slot, a
      remedy that does not name joining; the fixtures join, and the wording is a candidate capture. The designation
      refusal is the undesignated-remote case above.
    - _The agenda entries, as moved (Task 3.4.a.1):_ each file spawns through `e2e/store-default.ts`, which re-exports
      the end-to-end helpers with each spawn taking the override from the test process rather than the helpers' default,
      so a case that calls `useInRepoStore` still runs in-repo; the switch is the import line. Work units seed through
      `seedWorkUnit` (`helpers/store/seed-work-unit.ts`), which writes the meta, task list, placement, and branch link
      (the project ID as the link's repository, as starting a work unit links it) through `seedStore` and binds the
      checkout's marker; the Errand queue seeds in its renderer's form (`renderQueueSet`). `seedStore` now replaces a
      record at a version the test read, since `arc init` writes the person's inbox from its template. With the helpers'
      default removed, the nine files pass as they do with it.
    - _Expectations rewritten, each traced:_
        - Work-unit reads name the projection's `.arc/active/current/` paths (§ 8.3), and the resume case checks the
          projected files hold the seeded records; `SESSION-NOTES.md` leaves, the freshness anchor moving to the meta's
          State at Handoff (§ 8.9), so the resume notes a freshness gap and still proceeds.
        - Start's readiness takes the selected records as `evidenceBackend: "store"` arguments and reads no checkout
          file (`spec-session-init-agenda.md` § 8.2), so its read-step assertions become those arguments.
        - Errand captures are selected by `personal:<id>` and the queue head comes from the person's queue (§ 8.10); the
          inbox's unchanged bytes become its unchanged record version. The store takes a well-formed seed ID without
          reading the inbox, so the seed row also compiles a title seed, which carries no capture (§ 8.10,
          `--from-inbox` refusing a title).
        - The accepted cold-start scaffold reads the meta the recompiled agenda's read step names.
        - `--context` over a bound work unit leaves it unentered; a control compile without the signal reads its meta,
          so the negative assertion cannot pass on an unresolved binding.
    - _Open rows, settled:_ the Plan entry's ambiguous slug is _In-repo_: on the store a second `demo` work unit's write
      refused (`version-conflict`), so two stubs of one slug exist only as directories; the store's ambiguous lookup, a
      work unit and a cohort sharing a name, is covered in process (`unit/agenda/signal-plan`). Passivity splits: on the
      ref default the four inspections left status, refs, `HEAD`, and the identity root unchanged and fetched into
      neither temporary-ref family (only `ls-remote`), so the original case keeps the override and a new store case
      asserts the inspections preserve state, the store's state version included, over a seeded stub, inbox entry, and
      queue. Its first command projects the seeded personal records, as any command's root hook does in a fresh
      checkout, so its snapshot follows one compile. The recovery plan reads only Git topology; its seeded work unit
      keeps the fixture faithful and no assertion reads it.
    - _The session envelope's wire locks, as moved (Task 3.4.a.2):_ the test file and `prepareSessionEnvelopeFixture`
      spawn through `e2e/store-default.ts`, and the seeder holds each work unit and task list through `seedWorkUnit` and
      the cohort as a record. Its metas render canonically, since the store refused the hand-rolled table's `—`
      Priority and Origin as malformed durable fields. The orient arm runs `arc attest` over its bound work unit, then
      moves the stored meta to Integrating and replaces the stored boundary with the version-two publication-pending
      one, each at its read version: a seeded Candidate whose subject is not the checkout's reads as changed and routes
      the session to verification closeout. Orient and branch-gone each commit one code file where they committed ARC
      state, so each branch stays one commit ahead of base; branch-gone's commit, which its envelope lists as unclosed
      with its times and copy key, lands at a fixed time, as both derive from its author line. Active-resume commits
      nothing, its linked checkout now at base. The current-husk arm stamps its husk and marker with a seeded Shipped
      work unit's UID, keeping its unknown-authorization arm, since a stamp without one reads `pre-store-husk` on the
      store. The normalizer maps minted UIDs to stable valid ones. `seedWorkUnit` now takes a meta's exact content and further
      records its work unit owns, and loads no Vitest, so the benchmark that reuses the seeder still runs; it spawns
      through the same helpers and clears a checkout's own override, as the unit setup does. With the helpers' default
      removed the file passes as with it, twice over the same goldens, and the eight unit files reading them pass.
      _Corrected (Task 3.R2's stop):_ two of the nine unit files reading the goldens failed from this change on.
      `unit/session-envelope/slot-schemas` met the normalized SHA in the new `unclosedTaskCommits`, and its loader now
      maps object IDs as it maps dates; `unit/status/session-envelope-schema`'s eleven user-slot cases and its
      notes-compaction case mutated the notes-backed slots the goldens no longer carry, and now run over those slots as
      the in-repo store reports them, which the schema accepts until notes removal.
    - _Golden changes, each traced:_
        - Work-unit paths name `.arc/active/current/` (§ 8.3); each load set loses the work unit's `SESSION-NOTES.md`
          and nothing else (§ 8.9); the notes-compaction advisory goes with the notes (§ 12).
        - Store arms § 2.2 turns on: identity discovery reads the store's Errand and claims acquisitions, so the
          in-flight oracle's unavailability warning goes and a work branch no active item or claim names is residue
          (`deriveStoreInFlight`), the husk's leftover `feat/current-husk` among them. Roster rows are registrations
          carrying store placement and priority in place of `metaFilePath`, the primary listed without an identity;
          subjects carry their UID and bound rows their marker generation; the boundary is version two. The user slot
          reads the store's state remote, none designated here, and the user-reference reconcile takes the store's
          authority and scratch plan. Current-WU reconcile's held dependencies, inbound back-pressure, the inbox's queue
          survivors, recovery's state basis with its seed's store version, and the in-flight composition join.
        - Context fields: `pause` (§ 8.5), and `unclosedTaskCommits` with the recovery verdict's (§ 8.4). The husk's row
          reads retired, its parked location gone with park (§ 8.5), and offers cleanup.
        - Fixture-driven: the canonical meta's `P3` priority, a linked head at base where active-resume no longer
          commits, and OIDs, digests, and UIDs renumbered by encounter order.
    - _Open rows, settled:_ current-husk is _Store_ and identity-missing _Ref_, its one change the primary's roster row.
    - _Possible defect, diagnosed (A12):_ every store envelope's orphan-branch sweep declines with "Claims acquisition is
      not complete. Restore a complete claims acquisition for this identity…". `completeClaimBranches`
      (`lib/session-init/orphan-store-candidates.ts`) reads an authoritatively absent claims acquisition, a person with
      no claim records as in any fresh checkout, as incomplete, and `integration/orphan-store-branches.test.ts` asserts
      it. `spec-seam-locus.md` A20 makes absence an empty inventory for Errand terminal and merge admission alone, so
      the sweep keeps its "not complete declines" text; its remedy names no step a person can take, and it offers no
      cleanup until a claim exists. The goldens lock today's behavior; the routing is the Owner's. Settled by A15.
    - _Session initialization and recovery, as moved (Task 3.4.a.3):_ the file spawns through `e2e/store-default.ts`
      over two templates, one initialized on the store and one under the override for an in-repo block
      (`useInRepoStoreForEach`) holding the valid v3 Errand identity, the all-heads original, and the omitted-blob husk.
      Store cases commit the initialized checkout, switch to the work unit's branch, and hold its meta and task list
      bound there (`seedWorkUnit`). A case that edited the task list replaces its record at the version it read, and one
      that read a verb's meta write reads the record (`readStoreRecord`, `helpers/store/seed-store.ts`). Candidate cases
      attest through the verb, then `integrateAttestedWorkUnit` (`helpers/store/integrating-work-unit.ts`) moves the
      stored meta to Integrating and, given the publication push, stores the version-two publication-pending boundary;
      the envelope seeder now does the same through it. With the helpers' default removed the file passes as with it.
    - _Expectations changed, each traced:_
        - Work-unit paths name `.arc/active/current/` (§ 8.3).
        - Reopen writes no Next Task on the store (`spec-seam-lifecycle.md`: "only its `Next Task` write retires"), so
          the recovery assertion names the stored cursor's task instead. The fixture attests a real Candidate, since the
          store takes Candidate authority from its record alone. Reopen keeps it and withdraws its boundary to review
          (`storedReviewWithdrawal`, the arm § 2.2 names), so re-attesting the unchanged subject returns `unchanged` at
          `candidate-review-pending` (`verbs/attest.ts`), where the in-repo fixture's unbacked ID had attestation mint
          one; this traces to the implementation, as no spec states the result. The case now covers only that unchanged
          resume: a subject changed after the reopen blocks attestation until full verification establishes a new
          root. The title's stale authority is the retained Candidate, which routes neither the reopened session nor its
          closeout past execution and verification.
        - The three isolation cases read the materialization offer as `not-applicable`: the store's slot offers work
          units from its records without reading the remote (`handlers/status/store-session.ts`), so the two titles
          that named snapshot-only absence name the offer.
        - The large Candidate's batched-read counts and the all-heads twin's mutation check count only commands in the
          code repository. The store's own Git directory took 110 commands, the same at 40 and 400 Candidate files, and
          reading the state version retains its manifest under `refs/arc/tmp/version` there (`saveCapturedManifest`);
          the code-repository counts are unchanged. The twin drops the notes and Errand identity-ref reads, which the
          in-repo original keeps.
        - The unstamped husk's marker carries the seeded Shipped work unit's UID, as the envelope's husk does, so it
          still reads `unknown-evidence` rather than `pre-store-husk`.
        - Fixture-driven: the narration-inferred execution cases hold the task list their meta declares, and the
          Candidate resume locus stages a code file where it staged the task-list file.
    - _Open rows, settled:_ the large Candidate, the three isolation cases, and the unstamped husk are _Store_; the
      all-heads generation splits, its original _In-repo_ beside a _Store_ twin.
    - _Still open, the Owner's:_ the bound-delivery reopen, a delivery subject. On the store it refuses before any host
      call or meta write, but with delivery's generic evidence remedy rather than its coherently-bound route: off the
      branch the rename source refuses a base ref without its transition records (§ 4.3), so plan resolution is
      indeterminate. The case now runs on the store asserting that remedy, whose wording traces to the inspection's
      default (`lib/delivery/entry-inspection.ts`), not to a spec; the alternative keeps it _In-repo_ with the bound
      route's assertion. Either way the bound route keeps its coverage in `unit/delivery/entry-inspection` and
      `unit/handlers/lifecycle-verbs`, and nothing yet owns an end-to-end assertion of it on the store.
    - _Possible defects, diagnosed (A12):_
        - A store task cursor's `lineHint` counts lines of the stored content, while the projected file the load set
          names carries its base stamp on line 1, so each hint points one line above its heading (projected line 20
          against hint 19 in the seed case); the read method's stale-hint fallback finds the heading. The seed case's
          unchanged hint locks that offset.
        - One `status --session-init --write-compaction-seed` spawned 110 Git commands in the store's own Git directory,
          54 of them a `for-each-ref` over all of `refs/arc/` and 52 a `cat-file --batch`, the same at 40 and 400
          Candidate files; how they grow with the number of records was not measured. The large-Candidate case counts
          only code-repository commands, so its count assertions no longer see them; its 29-second deadline still
          bounds them in wall time.
        - The delivery inspection drops the rename source's condition ("…/transitions is absent at refs/heads/main;
          with state off the branch, rename transitions are not read from a branch's tree") and names an evidence
          conflict, so § 4.3's refusal reaches a person without its cause.
    - _The compaction anchor, remote boundaries, and orphan cleanup, as moved (Task 3.4.a.4):_ the three files spawn
      through `e2e/store-default.ts`, and `precompact-locus-anchor` leaves the ledger. Each case runs as classified
      above, the read-only common directory on the store once A17 settled it and both orphan cases once A16 did.
        - `precompact-locus-anchor` designates `origin` after `arc init` (`arc store remote origin push`). Its parent
          case holds `recovery-parent` bound to its checkout (`seedWorkUnit`). Its transfer case holds the Planning
          `recovery-transfer` with no branch and binds both checkouts' markers, each detached at `main`, to its record
          (`seededWorkUnitSubject`), so the replacement's conflict comes from its marker rather than from the `plan/`
          branch the in-repo case checked out; the roster assertions are unchanged. The first two cases open an Errand
          and pass once the store admits the UID open plans (A18, Task 3.R5).
        - `session-init-remote-boundary` seeds its read-only and shallow work units through `seedWorkUnit`. The shallow
          case commits a code file on the work unit's branch and publishes the store (`arc store remote origin push`,
          then `arc sync`) before the clones fetch. The promisor and omitted-tree husk cases set the override per case
          (`useInRepoStore`).
        - `session-init-orphan-actions` links each branch through an ended Errand record, a completed
          `work-item/record` whose branch link names it, so the sweep resolves the branch. With no claims held, both
          cases witness A15's and A16's criteria end to end.
        - _Expectation changed, traced:_ the shallow clone's materialization offer lists the published work unit, with
          `remoteEvidence: "not-applicable"` and no pending branch, where the in-repo offer listed none pending a fetch.
          The store's slot offers work units from its records without reading the remote
          (`handlers/status/store-session.ts`), as for 3.4.a.3's isolation cases. The case's subject, the exact graph
          relation refused in the shallow clone beside the full-history control, is unchanged.
- **Start, teardown, rename, reconcile, and retirement (Task 3.4.b), probed before any edit:** eight end-to-end files
  and `integration/validate-cohort-consistency`, 128 cases. With the spawn default and the hook test's override
  removed, 63 failed, 47 passed, and 18 never ran. `teardown-base-movement` arranges through the base-movement seeders
  and moves with Task 3.4.f; `command-input-no-input`, which starts a work unit among other commands, falls to Task
  3.6.
    - _`teardown` (22 failing):_ most through `prepareSelfTeardown`, which commits a Shipped meta under
      `.arc/completed/`; teardown then meets the tracked-state refusal or a withheld projection of that file.
    - _`teardown-stale-projection` (18 not run):_ its shared setup archives over committed state and is refused.
    - _`lifecycle-exit` (8):_ abandon and linked teardown over committed metas; the park cases already set the
      override, and the shared `beforeEach` initializes with `--pm-mode arc-in-git`.
    - _`retirement-removal-check` (3) and `staged-archive-recovery` (2):_ abandonment and activation over committed
      metas; the staged archive is the `git mv` seam, leaning _In-repo_.
    - _`rename` (11) and `identity-operand-input` (none):_ the rename fixtures start a work unit in place over
      committed state.
    - _`wu-reconcile` (11):_ its cases assert staged metas, so they wait on the store's reconcile contract.
    - _`validate-cohort-consistency` (6):_ the script over a fixture that is not a Git repository, where the ref store
      refuses; its subject, the pre-commit check of tracked cohort files, leans _In-repo_, keeping its explicit
      override.
    - _Teardown, as moved (Task 3.4.b.1):_ `e2e/teardown.e2e.test.ts` spawns through `e2e/store-default.ts` and copies
      a start initialized on the test process's store (`initializedRepository(start, "process")`,
      `helpers/initialized-repository.ts`, which keys each template by the store `arc init` ran on).
      `prepareSelfTeardown` holds the Shipped `demo` completed in the store, its branch link naming `feat/demo`
      (`seedWorkUnit`), and binds the marked checkout's marker to that record (`seededWorkUnitSubject`), in place of
      the meta it committed under `.arc/completed/`. `teardown-stale-projection` stays _In-repo_ whole
      (`useInRepoStoreForEach`, its template built under `withInRepoStore`): its subject, a branch still tracking its
      work unit's meta after the base archived it, exists only there, since the flip build refuses a checkout whose head
      tracks ARC state and store teardown reads no checkout's lifecycle files.
        - The markerless and remove-preference cases pass once store teardown refuses a markerless holder (A20, Task
          3.R6) and the store keeps working after a self-teardown removes its checkout (A21, Task 3.R7).
        - The nonexistent receipt-backed target is _In-repo_ (`useInRepoStore`), a retirement receipt being tracked
          state, beside a store case: a target no record names refuses as `not-found`.
        - _Expectations changed, each traced:_
            - A self-teardown's outside removal names the work unit's UID and its quoted husk path
              (`outsideHuskRemovalCommand`, `handlers/lifecycle.ts`, taking the husk subject's UID before its name),
              where the in-repo one named the slug. The two replay cases run the continuation the first teardown
              printed, from the primary checkout it names, rather than replaying by name (Owner, 2026-11-19). Replayed
              by name, the store leaves the husk and reports the branch the first run deleted as `(left intact)`
              (`describeBranchDeletion` renders any undeleted branch so), captured to the personal inbox.
            - Replaying the old husk while the primary checkout holds a restarted `feat/demo` keeps the branch with
              "another checkout holds it" and removes only the husk (`prepareCreatedBranch`,
              `lib/work-unit/verbs/teardown-store.ts`), where the in-repo arm refused a competing registered projection
              and kept the husk registered. The title's subject, that the old husk never deletes the restarted
              projection, holds.
            - A locked local branch ref fails the teardown after the detach, exiting 1 with the `--husk` retry
              (`teardownRetryRemedy`), where the in-repo arm completed with a compare-and-delete notice; accepted
              (Owner, 2026-11-19). The case now removes the lock and completes through the retry it names.
            - A dirty self-teardown refuses in the shared removal check's words, naming the dirty path
              (`checkWorktreeRemoval`, `lib/git/worktree-removal.ts`), where the in-repo arm added that the checkout
              remains branched and unchanged; the case reads both from the checkout.
    - _Abandon, activation, and archive, as moved (Task 3.4.b.2):_ the three files spawn through `e2e/store-default.ts`.
      `lifecycle-exit`'s choreography stays _In-repo_ whole (`useInRepoStoreForEach`, its shared `beforeEach` with it):
      its decomposition, parking, and abandonment stage their artifacts' removal and a transition record on the work
      unit's own branch, and its teardown cases read the retirement from that history, neither of which the store has.
      Its eight failing cases are that arm's: abandonment refusing outside its source branch, abandonment deferring
      teardown to a commit, and teardown reading a historical deletion. A store block holds an Active work unit in the
      store, the linked checkout ARC spawned for it on its created branch and published to a designated `origin`
      (`startedInLinkedCheckout`); abandoned from the primary, it retires the record, removes the checkout, and reaps the
      branch locally and on `origin` in one command, and `e2e/store-checkout-removal.e2e.test.ts` runs the same from the
      checkout itself (A21, Task 3.R7).
        - The fixture projects that checkout through `arc save`, as spawning leaves one, and pushes without hooks. A
          marked work-unit checkout holds a projection, so removal refuses it as unobservable while its index is
          missing (`checkProjectionRemoval`); the case first passed only where the push's pre-push hook ran the CLI
          there, and failed in the captured local end-to-end run, where it did not.
        - `retirement-removal-check`'s dirty abandonment cases seed through `seedWorkUnit`, with the dirty file in a
          linked checkout ARC spawned and marked: an Active work unit's on its created branch, a Planning one's detached
          at base. A checkout ARC did not spawn is released with its files, so only a spawned one reaches the removal
          check. Activation from a meta whose Branch names `main` stays _In-repo_, since the store creates the branch at
          activation from base without reading that field; the dirty park case already kept the override.
        - `staged-archive-recovery` stays _In-repo_ whole: archival stages the meta's move to `.arc/completed/` only
          there, and the flip build refuses a checkout whose head tracks the meta.
        - _Expectation changed, traced:_ the dirty abandonment cases compare the record the store holds before and
          after (`readStoreRecord`), where the in-repo cases read the committed meta file.
    - _Rename, as moved (Task 3.4.b.3):_ `rename` and `identity-operand-input` spawn through `e2e/store-default.ts`, and
      `identity-operand-input` passes whole on the store. `rename`'s eleven cases stay _In-repo_ under
      `useInRepoStoreForEach`: each works over state that store keeps in tracked files, renaming tracked artifacts,
      transition records, a notes workspace, or a `chore/rename` branch, reading a tracked Candidate record, or meeting
      a refusal only it makes: the same-name check before any state is read, slug-matched checkout roles, and remote
      candidate expansion. A store block designates `origin` and holds an Active work unit in the store on its created
      branch, published there, in the primary or in a linked checkout ARC spawned and projected (`startedWorkUnit`). A
      backlog stub renames in one store write; an in-place rename renames the record, the checkout's ownership, and the
      branch locally and on `origin`; a rename to the unit's own name and a rename of a unit whose Candidate the store
      holds, attested through the verb, refuse with nothing changed; a self-rename defers its checkout's move, and once
      the move lands its replay clears the pending move (A22, Task 3.R8); and a stale remote lease resumes.
        - _Expectation changed, traced:_ the resumed rename keeps the old remote branch a peer moved and reports it
          kept, where the in-repo resume deleted it; the store's retry keeps a peer's advanced old remote head
          (`integration/rename-store-command.test.ts`, "completes a retry while retaining a peer's advanced old remote
          head").
        - The store refuses a same-name rename at its subject read ("Rename needs distinct source and target names."),
          not before reading state, so its case asserts the refusal over an unchanged record, branch, and remote.
        - A rename from a checkout whose marker binds another work unit does not refuse on the store, which matches
          holders by UID, and renames the branch that checkout holds; captured for a decision ("Decide whether a store
          rename refuses a branch held by another work unit's checkout", `USER-INBOX § Errand`).
    - _Reconcile and the cohort hook, as moved (Task 3.4.b.4):_ `wu-reconcile` spawns through `e2e/store-default.ts`.
      Its twelve fixture cases stay _In-repo_ under `useInRepoStoreForEach`: each reconciles state that store keeps in
      tracked files (staged metas, specs, and notes, transition records reaching a branch by merge, a sibling
      worktree's own copy, an archived meta on its branch, personal notes and their baseline, a base tree read under
      full protection) or applies without an identity because it only stages. A store block seeds `dependent` through
      `seedWorkUnit`, bound in place and depending on `origin`, a backlog stub then renamed `successor` through the
      store. It plans then applies the dependency in one record write, surfaces the pending reconcile at session-init,
      refuses a work unit the checkout does not hold, stays clean and silent with no edge, rewrites a reference in the
      spec record, and keeps an advisory in the notes record pending; the retired-option case needs no state and runs
      there.
        - _Expectation changed, traced:_ apply reports no staged paths and leaves the index and tree clean, since the
          store applies the record plan without touching the checkout (`applyStoreCurrentWuReconcile`); the other-unit
          refusal names the checkout's work-unit identity rather than branch ownership (`requestedReconcileConflict`,
          `handlers/reconcile.ts`); and reference edits and advisories name the projected paths under
          `.arc/active/current/`.
        - Without an identity the store refuses the apply, since its record write needs a Git author ("Author identity
          unknown"), so the no-identity case stays _In-repo_ with the staging-only arm.
        - `integration/validate-cohort-consistency` keeps its explicit override, now stated as § 7.3's: the check reads
          staged cohort files, which only the in-repo store keeps; the store's membership read is covered in process
          (`unit/work-unit/store-read-consumers.test.ts`).
- **Review, attest, Candidate, and publication (Task 3.4.c), probed before any edit:** twelve end-to-end files and
  three integration files, 178 cases. With every spawn switched, `runCli` inheriting the test process's selection, and
  the family's eight ledger entries set aside, 113 failed, 49 passed, and 16 never ran, `publication-spine`'s shared
  convergence template failing before its cases. Most failures meet the tracked-state refusal over committed metas;
  39 are the fan-out harness's review plan reading `unavailable`, since its work unit is not in the store.
    - _Attest and publication (Task 3.4.c.1):_ `attest` (9 of 9), `candidate-applicability` (1), the two single-case
      `publication-*` files (1 each), and `publication-spine` (1 failing, 16 not run).
    - _Candidate lineage (Task 3.4.c.2):_ `registerCandidateLineageSuite`'s four suites, 38 of 39, the three
      end-to-end partitions and the integration suite.
    - _The fan-out harness (Task 3.4.c.3):_ `review-fan-out-lifecycle` (40 of 41) and `review-member-full-final` (3).
    - _Review surfaces (Task 3.4.c.4):_ `review-protocol` (12 of 13), `review-candidate-supersession` (3),
      `review-chunking` (2), and `review-cli-surfaces` (2 of 48), the last two spawning through `runCli`, which sets
      the override itself.
    - _Attest and publication, as moved (Task 3.4.c.1):_ the five files spawn through `e2e/store-default.ts`; none was
      on the ledger. Each keeps its tracked-file cases _In-repo_ under `useInRepoStoreForEach` and runs its surviving
      subjects on the store, seeding `example` through `seedWorkUnit` bound in place on its branch.
        - `attest`: a store block of eight beside the nine in-repo cases: the Candidate record written with nothing
          staged, the subject unchanged across a disjoint base advance, the open-task, binding, and missing-list
          refusals writing nothing, and the three omitted-content refusals. The store refuses to hold a malformed task
          list, so attestation never reads one there.
        - `candidate-applicability`: one store case: an unmarked carrier on the branch refuses
          `active-work-unit-unavailable`, the selection resolves and replays with nothing to commit, and a marker
          rebound to another work unit refuses `active-work-unit-mismatch`.
        - `publication-frontline-pending` and `publication-post-ready-pass` share each scenario between the two stores;
          on the store `other` holds its own bound worktree, since the store selects a checkout's work unit by marker
          rather than branch.
        - `publication-spine`: ten case sites run on both stores (`describe.each`), each store building its convergence
          template once on first use. Four stay _In-repo_: the premature projection commit, the operational-only
          commit, the interrupted Candidate-then-boundary write, and the publication-finalization marker, each a
          tracked-record mechanic the store's one batch removes.
        - `unit/handlers/lifecycle-verbs` takes the amendment's four store cases over a Candidate and a version-two
          boundary the bound store holds: `handleAttest` threading the Owner-accepted boundary across repair-current
          movement and public delivery authority while Integrating and while Shipped, and `handlePublish` persisting a
          moved resume point under the Candidate's version. Its Candidate and boundary access mocks now spread the
          real modules, so the store's batch prepares its writes through them.
        - _Expectations changed, traced:_ attestation leaves the meta's Candidate, Next Task, and Last Completed
          unwritten, since the store takes Candidate authority from its record and those fields retire at the flip
          (`spec-seam-lifecycle.md` § 2.2); the version-two post-attest continuation carries no projection disposition
          (`PostAttestContinuationV2Schema`); a local review's continuations resubmit the `operationRef` its
          preparation emits (`resolveReviewOperationInvocation`); and the store keeps a reduced local review as its
          lane attempt, so the spine counts evaluator invocations there.
        - _Fixtures corrected:_ `seedWorkUnit` linked `refs/heads/<branch>` where every production writer and lookup
          names the bare branch, so a branch-keyed reader such as review's live context missed the seeded work unit;
          its 21 users pass with the bare name. `responsePolicyRequest` decodes the store's references and reads a
          store producer from its attempt's outcome record (`reviewInFlight`, `fixtures/review-response-policy.ts`).
    - _Candidate lineage, as moved (Task 3.4.c.2):_ the four files leave the ledger, and `registerCandidateLineageSuite`
      spawns through `e2e/store-default.ts`. Each case runs on one store: 25 of the 39 on the store, and 14 _In-repo_
      by subject through `withInRepoStore` (`IN_REPO_SUBJECTS`), its initialized template built once per store.
        - _In-repo by subject:_ ROADMAP regeneration, the three archive relocations, and two live artifacts collapsing
          onto one key each move or collide tracked files; the operational-only commit commits state; the four
          planted, deleted, or corrupted disposition records, and a hosted disposition binding planted without the
          approved response it binds, are residue the store's create-only review facts cannot hold; and the three
          delivery-member cases need delivery, paused on the store (§ 4.3), as in Task 3.R.c.
        - _The settled-findings case:_ recorded through the store's admission, acknowledgment, and await, and deferred
          through an approved response, its pass reads `settled` on both stores, since the reservation discharges a
          settled pass its response policy completes ("converged with no verified material findings",
          `hosted-reservation-discharge.ts`). Only the planted binding, which has no approved response for the policy
          to read, stays outstanding, so the case keeps that binding in-repo.
        - _Helpers:_ on the store a state-only commit asserts nothing is staged, and the Candidate, boundary, task
          list, review operations, and approved dispositions are read and written through the store, the review
          composition and its in-flight records taking `example`'s exact work item (`exampleOwner`, `invocation`).
          `holdExample` binds `example` in place, `shipExample` seeds it Shipped and completed, and `recordHostedPass`
          records a hosted pass through admission, acknowledgment, and await, returning the owner-bearing source
          reference the store's await emits. `seed-store.ts` gains `removeStoreRecord`, and `responsePolicyRequest`
          reads a store producer of either kind through the responses port, a hosted one's pull request with it.
        - _Expectations changed, traced:_ the store writes a version-two boundary, naming `terminus` and
          `readinessBinding` and carrying no `policy` (`integration-boundary-locus-v2.ts`); a native local review and
          frontline pass reduce and attest through the `operationRef` their preparation emits; applicability resolves
          to `continue`, with no selection to commit; an unmarked carrier reads `unmanaged-checkout`, since the store
          selects a checkout's work unit by marker; re-rooting an archived Shipped work unit's Candidate leaves only
          `reviewed.txt` staged, the record written off the branch; a refused Candidate advance in a checkout another
          work unit owns leaves the record's version unchanged and nothing staged; and a hosted pass takes the logical
          pass its admission derives.
        - Two cases reading `arc active status` in the bound checkout found no Candidate under the nested layout,
          which Task 3.R9 fixed (A23).
    - _The fan-out harness, as moved (Task 3.4.c.3):_ `review-fan-out-lifecycle` and `review-member-full-final` leave
      the ledger. Every case but one builds `createHarness`, whose delivery stack reserves its review through the work
      unit's delivery plan (`writeBoundary`, `RepositoryDeliveryMemberLookup.resolveReservationRecords`). Probed on the
      store, the lookup read `unavailable` before any review ran: with state off the branch, the rename transition
      source refuses a base holding no transition records (§ 4.3), and no seeding adds them. So the harness's 43 cases
      keep the override by subject, delivery being paused on the store, as in Task 3.R.c, under
      `useInRepoStoreForEach`, and `installCandidate` and `writeBoundary` stay on the in-repo stores with them.
        - The singleton hosted progression builds no harness and carries no delivery vehicle, so it runs on the store
          in a `describe` of its own.
        - _Store counterparts, by subject only:_ the native delivery-member review tests, among them
          `delivery-review-native-refusal`, `review-hosted-native-refusal`, `delivery-review-fix-native`, and
          `delivery-native-parity`.
    - _Review surfaces, as moved (Task 3.4.c.4):_ the four files spawn through `e2e/store-default.ts`, which gains
      `runCli` on the test process's store selection; `review-candidate-supersession` and `review-chunking` leave the
      ledger. The 19 cases failing without the override become 20, one chunking case splitting in two: 17 run on the
      store and 3 keep the override by subject.
        - `review-protocol`: the fixture seeds `review-protocol` through `seedWorkUnit`, bound in place, and attests
          through the verb; 12 cases run on the store. The unreadable-boundary case stays _In-repo_, since it corrupts
          the boundary file the in-repo store keeps and the store refuses a malformed record, beside a store case
          taking the wrong route and then the missing boundary record (`removeStoreRecord`).
        - `review-candidate-supersession`: all three cases run on the store, reading the Candidate, the review
          decisions, and the next-pass context through the store's composition, the result reader taking its store and
          project identity as review's resolve passes them.
        - `review-chunking` and `review-cli-surfaces` run verbs in repositories that never ran `arc init`; the store
          keys review targets by the project identity, so their store cases hold one (`seedProjectIdentity`, through
          `projectIdentityRecord`). The chunking resolver's bound and degraded arms read a delivery plan and state, so
          they split into an _In-repo_ case by subject, delivery being paused on the store (§ 4.3). The planning-lane
          classifier reads planning state tracked on the branch, which the store refuses, and leaves with tracked-state
          removal, so its case keeps the override. The package-default no-op case gains an author and a first commit:
          the store records its project as a commit and reads the checkout's branch to bind a review.
        - _Expectations changed, traced:_ local review and frontline continuations resubmit the `operationRef` their
          preparation emits; the store names a closed opening window `frontline-window-closed`
          (`frontline-command.ts`); a frontline skip is one durable `lane-skip` review decision, not a `frontline-phase`
          operation (`recordNativeFrontlineSkip`); and the re-root refusal names the predecessor Candidate by its
          record's store version (`readStoredCandidateSupersessionChain`).
- **Delivery (Task 3.4.d), probed before any edit:** seven end-to-end files and two integration files, 81 cases. With
  every spawn switched and the two `delivery-position` ledger entries set aside, 42 failed and 39 passed. The failures
  meet the tracked-state refusal over committed metas, Candidate records, and transition records; a delivery entry or
  transfer whose plan resolution refuses without transition records (§ 4.3); or a reconcile whose plan's work unit the
  store does not hold (`terminal-rebind-unavailable`). Most passes run over plan and state kept machine-local under
  `.git/arc/delivery/`, on either store.
    - _Authoring, transfer, rewrite, and native suffix (Task 3.4.d.1):_ `delivery-authoring` (4 of 4),
      `delivery-transfer` (3 of 3), `delivery-rewrite` (1), and `delivery-native-suffix` (0 of 4).
    - _The delivery plan (Task 3.4.d.2):_ `delivery-plan` (16 of 19).
    - _Terminal recovery (Task 3.4.d.3):_ `delivery-terminal-recovery` (10 of 22).
    - _The position suites (Task 3.4.d.4):_ `delivery-position`'s end-to-end suite (3 of 3) and integration suite (5 of
      24), and `delivery-execution-store` (0 of 1).
    - _Authoring, transfer, rewrite, and native suffix, as moved (Task 3.4.d.1):_ the four files spawn through
      `e2e/store-default.ts`; none was on the ledger.
        - `delivery-authoring` keeps the override by subject, under `useInRepoStoreForEach`. The authoring verbs
          revalidate their authority through the work unit's delivery entry, which resolves its plan through
          `GitDeliveryRenameTransitionSource` (`lib/delivery/repository-entry.ts`). Probed with the work unit and task
          list seeded and the checkout bound, the entry refused `evidence-unavailable`: delivery is paused on the store
          (§ 4.3), as in Task 3.4.c.3. _Store counterparts, by subject only:_
          `integration/delivery-execution-native-refusal` and `delivery-resolution-native-refusal`.
        - `delivery-transfer` keeps the override by subject the same way: transfer resolves the active work unit's
          plan through its rename source (`createCheckoutDeliveryRenameTransitionSource`). It has no store
          counterpart; its plan resolution moves onto store reads with the delivery rebuild.
        - `delivery-rewrite` runs on the store. Rewrite binds its plan's work unit but resolves no plan by rename. Its
          native fixture holds the work unit in an in-process store, and it committed the meta and wrote a marker so
          the in-repo backend the subprocess opened could read them; it now drops the fixture's tracked transition
          record, which the store refuses on `HEAD`, and holds the project and `example` in the repository's store
          (`seedStore`, `seedWorkUnit`), bound in place.
        - `delivery-native-suffix` passes on the store unchanged: its native landing verbs address the plan by ID over
          machine-local plan and state, binding no work unit.
        - No expectation changed.
    - _The delivery plan, as moved (Task 3.4.d.2):_ `delivery-plan` spawns through `e2e/store-default.ts`, splitting into
      a store block of 5 cases and an in-repo block of 15 under `useInRepoStoreForEach`; its 19 cases become 20.
        - The command-surface cases, registration and invocation parsing, pass on the store unchanged.
        - Eligibility runs on the store. Its lifecycle-path source returns no paths when state is off the branch
          (`CurrentDeliveryLifecycleContributionPathSource`), and both verbs require the active work unit to be the
          plan's. The read-only close case therefore holds its work unit in the store (`seedWorkUnit`, bound in place)
          in place of an untracked meta, and its snapshot carries no lifecycle or regenerable paths. The corrupt-state
          case shares that setup (`installEligibilityClose`). It had written no meta, so close refused at the active
          work unit before reading delivery state; its refusal now comes from the corrupt state file, which the
          read-only close case, eligible over the same setup, shows. A new store case prepares a snapshot with no
          lifecycle paths and refuses a requested tracked path as moved.
        - The in-repo lifecycle-path case keeps the override by subject: it commits the work unit's meta and accounts
          for the tracked lifecycle paths, the arm the in-repo implementation's removal takes.
        - Closeout, entry inspection, and native landing keep it by subject. Closeout retires its records through
          `GitDeliveryRenameTransitionSource` and commits a transition record; entry inspection resolves the plan
          through the delivery entry (Task 3.4.d.1); and native landing's member readiness resolves it through
          `RepositoryDeliveryMemberLookup`'s rename source (§ 4.3), over Candidate and boundary files the case writes
          into the checkout.
        - The eleven authoring cases (`from-tasks`, `from-branch`, compose, and abandon) keep it by subject. Authoring
          reads the meta and task list by path (§ 2.3), and resolves an existing plan through the rename source
          (§ 4.3); both move onto the store with the delivery rebuild. With no plan stored, resolution returns
          `no-match` before reading transitions, so first authoring is not what refuses: the cases fail over an
          untracked meta that is no store record, most with `active-work-unit-unresolved`.
        - No expectation changed.
    - _Terminal recovery, as moved (Task 3.4.d.3):_ `delivery-terminal-recovery` spawns through
      `e2e/store-default.ts`; 20 of its 22 cases run on the store and 2 keep the override by subject. Its fixture
      helpers move to module scope so the two blocks share them, each block initializing its own repository
      (`useTerminalRepository`), the in-repo block's under the override.
        - The twelve teardown, top-remedy, and native-landing cases pass on the store unchanged: they run those verbs,
          or reconcile their reservations, over machine-local plan and state, and read no Candidate, holding no work
          unit in the store.
        - Terminal rebind runs on the store. With no active operation, `delivery reconcile` binds the plan's work
          item (`bindDeliveryWorkItem`) and reads its Candidate and boundary through the invocation's store; it
          resolves no plan by rename. The fixture holds the work unit in the store, bound in place, with its Candidate
          and a version-two `publication-pending` boundary (`holdTerminalCandidate`), where the in-repo store read
          files in the checkout. A settled record commits those files on the in-repo store; on the store, settling
          moves no head, so the terminal binds the head the Candidate names. The provider-deleted recovery case
          rebinds to the fetched member head for the same reason, its assertion unchanged. The top-remedy clearing
          case holds the work unit without a Candidate: its replay reads no Candidate and returns
          `observation-unavailable`, where an unheld work unit refuses `terminal-rebind-unavailable`.
        - The two cases over a settled record-only terminal keep the override by subject: each commits the Candidate
          and boundary so that a record-only advance moves the head the terminal binds, and the store keeps those
          records off the branch, where no record write moves a head (register: singleton record writes staling
          publication).
        - No expectation changed.
    - _The position suites, as moved (Task 3.4.d.4):_ `delivery-position`'s end-to-end and integration suites leave the
      ledger, and `positionFixture`'s built-CLI spawns go through `e2e/store-default.ts`. 19 of the suites' 27 cases
      run on the store, as does `delivery-execution-store`; 8 keep the override by subject.
        - `positionFixture` commits no ARC state: it publishes plan and state under `.git/arc/delivery/`, so the 19
          integration cases whose verbs address the plan by ID (`delivery position`, `reconcile`, `refresh`, and
          `review-fix plan`) pass on the store unchanged. `delivery-execution-store` passes its own review store and
          passes too.
        - The template the fixture copies is now prepared once per store, as `registerCandidateLineageSuite`'s is
          (Task 3.4.c.2). It had been initialized once for the file, which would have given the in-repo cases a
          repository initialized on the store.
        - The eight failing cases keep the override by subject (`useInRepoDeliveryEntry`): each runs a verb that
          inspects the delivery entry, which resolves the stored plan through `GitDeliveryRenameTransitionSource`
          (`lib/delivery/repository-entry.ts`), refusing on the store while delivery is paused (§ 4.3). The verbs are
          `delivery entry inspect`, `review-fix continue`, session-init's locus probe
          (`handlers/derived-locus-state-probe.ts`), and attest's delivery renewal
          (`handlers/lifecycle-delivery-review.ts`). They failed first on the tracked-state refusal over the metas,
          task lists, and Candidate records they commit; Task 3.4.d.1's seeded probe of the same entry refused
          `evidence-unavailable`.
        - No expectation changed.
- **Errands and locus (Task 3.4.e), probed before any edit:** ten end-to-end files and one integration file, 92 cases:
  the seven `errand-*` files, `errand.e2e` (off the ledger for the probe), the two `locus-*` files, and
  `integration/lifecycle-default-locus-ports`, whose only spawn is `arc init`. With every spawn switched, 68 failed and
  24 passed. About 30 failures write `USER-INBOX.md` by hand, which the projection withholds; 7 meet `origin`
  undesignated; 3 open in a repository with no project record; 2 read the in-repo Errand identity ref; the rest are
  outcome differences, nearly all in `errand.e2e`.
    - _Errand open and branch naming (Task 3.4.e.1):_ `errand-open-base-freshness` (8 of 8),
      `errand-open-provisioning-recovery` (2 of 2), `errand-branch-types` (3 of 3), and `errand-check-live-branches`
      (1 of 1).
    - _Errand close, abandon, and push recovery (Task 3.4.e.2):_ `errand-close-missing-worktree` (3 of 3),
      `errand-abandon` (1 of 1), and `errand-partial-push-recovery` (1 of 1).
    - _The Errand suite (Task 3.4.e.3):_ `errand.e2e` (42 of 56).
    - _Locus (Task 3.4.e.4):_ `locus-errand-roundtrip` (7 of 7), `locus-folder-presence` (0 of 1), and
      `lifecycle-default-locus-ports` (0 of 9).
    - _Errand open and branch naming, as moved (Task 3.4.e.1):_ the four files spawn through `e2e/store-default.ts`;
      12 of their 14 cases run on the store and 2 keep the override by subject. Each file that adds `origin` after
      `arc init` designates it (§ Undesignated remotes in tests); `errand-branch-types` failed without it.
        - `errand-branch-types` runs on the store. The store names the branch `<type>/<slug>-<suffix>` (§ 4.8), so the
          case pushes the Errand's `HEAD` and matches the suffixed form, and it reads the Errand's `work-item/record`
          from the store in place of the in-repo identity ref.
        - `errand-open-base-freshness` runs on the store. Its parent and foreign work units are held in the store,
          each bound to its checkout, in place of metas committed to their branches; a work unit counts as preserved
          when its meta record's store version and content are unchanged. The refused open's claim is rolled back by
          retiring the fresh generation, which the store keeps at `completed` (`transformStoreErrand`'s `retire`), so
          the case asserts that placement where the in-repo store left no identity; the retry then mints a new
          generation. Branch checks match the suffixed form.
        - `errand-open-provisioning-recovery`'s interrupted-provisioning case runs on the store, reading the claim from
          the Errand's record and finding the stranded checkout by the suffixed branch.
        - Two cases keep the override by subject. The capability-off setup cleanup is the in-repo arm: with the
          capability on, the store retains the personal bytes a failed setup saved, and the claim with them
          (`integration/errand-projection-retirement`). `errand-check-live-branches` probes the remote for live branches
          the caller does not track, the in-repo overlap arm; the store's (`runStoreErrandOverlap`) derives the work in
          flight from its own records and local refs without fetching (`unit/errand/store-overlap`).
        - Each changed expectation traces to a store contract: the suffixed branch, the Errand record, and the
          retired generation.
    - _Errand close, abandon, and push recovery, as moved (Task 3.4.e.2):_ the three files spawn through
      `e2e/store-default.ts`, and all five cases run on the store. Each designates `origin`; the two on
      `initializedRepository` take the template initialized on the process's store, since the helpers' default leaves
      a `USER-INBOX.md` the projection withholds. A live Errand is one whose `work-item/record` is `active`; close and
      abandon retire it to `completed`, which the cases assert where the in-repo identity ref was gone.
        - `errand-close-missing-worktree` matches the branch each open reports, which the store suffixes. The locked
          holder takes that branch from the primary, where the open checks it out, since an anchored sequence cannot
          pass a value forward; the generation token the retry confirms is unchanged.
        - `errand-abandon` and `errand-partial-push-recovery` hold their capture in the store's `personal/inbox` and
          open from it by qualified ID, the store's only `--from-inbox` form. Under full protection the open moves the
          entry into the Errand's description and abandoning returns it (`prepareErrandReturn`), so the abandon case
          asserts the entry back in the inbox where the in-repo arm dropped its `execute-bound` mark. Under partial
          protection the entry stays in the inbox until the close removes it, so the push-recovery case compares the
          inbox record's version and content where it read the file.
        - The abandon case no longer compares the remote's Errand ref: the store publishes state only through
          `arc sync`'s push leg (spec § 4.1), so it asserts that the verb left no `refs/arc/*` on `origin`, and its
          name drops "local and remote".
        - Each changed expectation traces to a store contract: the suffixed branch, the Errand record's placement, the
          capture's move into the description and back, and state publication through sync.
    - _The Errand suite, as moved (Task 3.4.e.3):_ `e2e/errand.e2e.test.ts` leaves the ledger and spawns through
      `e2e/store-default.ts`. 51 of its 56 cases run on the store, with one store case added, and 5 keep the override
      by subject in describes of their own. Its describes take the template initialized on the process's store, and
      `createBareRemote` and the merged-host fixture designate `origin`, except under the override. Switching the
      template and designating `origin` alone took the failures from 42 to 29.
        - Its hand-seeded Errands (`seedOpenV3Errand`, `seedAwaitingV3Errand`) are held in the store as active
          `work-item/record`s, linked to their branch as an open links one; without that link the close found no
          record. A retired Errand is one whose record is `completed`, and an open one's record reads `state: open`.
        - Opened Errands' branches are the suffixed ones each open reports. The two teardown races and the
          linked-worktree case open in a sequence of their own first, since their Git wrapper and steps need the
          branch. The merged-host `gh` fake answers for the slug's branch or its suffixed form, and answers the
          store's added `mergeCommit` query with the change's head: the store refuses to retire a merged Errand whose
          host reports no landing commit.
        - Captures are seeded in the store's inbox and opened by qualified ID. The next offer comes from the person's
          Errand queue (`resolveQueueExecutionOffer`), keyed `personal:<id>`, where the in-repo store read
          `execute-bound` marks. The open moves a capture into the Errand's description: a refused close leaves it
          there, the close archives it with the Errand, renamed "archives the originating capture with the Errand",
          and abandoning returns it. The link-evidence case names a qualified ID the inbox lacks, and a title, which
          the store cannot read.
        - `errand check` reports `reachable: true` with no remote, since the store reads its own records
          (`runStoreErrandOverlap`), and its overlap entry names the `workItem`. The in-process review steps take the
          Errand's stored work item, which the command line selects from its checkout. The spawned-checkout close
          holds its parent work unit in the store, bound to the primary.
        - Promotion on the store settles in one write and keeps the checkout for the new work unit: the meta takes
          the Errand's UID and the marker is re-made for it. A store case asserts that; the receipt-commit case keeps
          the override.
        - The five in-repo cases: `arc status <slug>`'s residue warning, since the store resolves an Errand's slug to
          its record and refuses it as no work unit; both tracked-ROADMAP regeneration cases; adopting a capture by its
          Markdown title from a file, since the store adopts by qualified ID; and the promotion receipt commit.
        - Each changed expectation traces to a store contract: the Errand record and its branch link, the suffixed
          branch, the landing commit, the qualified ID and the queue, the capture's description, the overlap's work
          item, and promotion's single write.
    - _Locus, as moved (Task 3.4.e.4):_ the three files spawn through `e2e/store-default.ts`, none of them on the
      ledger. `locus-folder-presence` and `lifecycle-default-locus-ports` pass unchanged: the first's subject is the
      checkout roster, and the second injects its own model store and uses `arc init` only to install files.
      `locus-errand-roundtrip`'s five Errand cases run on the store and its two capture cases keep the override by
      subject.
        - Its `createBareRemote` designates `origin`, except under the override. Its host fakes answer for the branch
          the query names rather than a fixed one, since each open suffixes the Errand's branch, and its steps push
          `HEAD` from the opened checkout.
        - The materialization case deletes only the Errand's local branch before materializing, where the in-repo
          store also deleted its identity ref: the store keeps the Errand's record, and the verbs publish no state to
          `origin`. The fork-only refusal reads the open Errand from its stored record. The resume case finds the
          Errand's primary record still an Errand's and no task list held for it, the meta carrying the session
          context the in-repo store kept in `SESSION-NOTES.md`.
        - Promotion settles in one write at either floor, `metaPath` naming `.arc/active/current/`, and cuts
          `feat/growth-unit` at the derivation floor too, since from the flip a work unit plans with no `plan/` branch
          (spec § 8.11). The meta is read from the store, which links the work branch rather than naming it in the
          meta's content.
        - The two in-repo cases settle a capture matched by title when promotion replays after its meta commit, and
          refuse that settlement over a same-title replacement: the store promotes in one write and opens from a
          capture by qualified ID, holding it in the Errand's description.
- **Base merge and integration (Task 3.4.f), probed before any edit:** seven end-to-end files and four integration
  files, 108 cases: the five `base-*` end-to-end files, `integrate-base-movement`, `teardown-base-movement`, and the
  integration files that arrange through `helpers/base-advance.ts`, `base-advance` and the three the ledger lists
  (`history-shape-ambiguity` and the two `review-status-*base-movement` files), off it for the probe. With every spawn
  switched, 63 failed and 45 passed. Most failures commit a meta or `ROADMAP.md` under `.arc/` and meet the
  tracked-state refusal; `integrate-base-movement`'s shared setup stops at `arc attest`, and the Errand review-status
  file's review steps need the Errand's work item and read different review states.
    - _The base verbs (Task 3.4.f.1):_ `base-advance` (0 of 4), `base-drift` (0 of 7), `base-sync` (0 of 3),
      `base-merge` (2 of 6), `base-merge-hooks` (1 of 2), and `integration/base-advance` (0 of 18).
    - _The integration checkpoint and teardown over base movement (Task 3.4.f.2):_ `integrate-base-movement` (10 of
      10), `teardown-base-movement` (2 of 2), and `history-shape-ambiguity` (3 of 11).
    - _Work-unit review status over base movement (Task 3.4.f.3):_ `review-status-base-movement` (18 of 18).
    - _Errand review status over base movement (Task 3.4.f.4):_ `review-status-errand-base-movement` (27 of 27).
    - _The base verbs, as moved (Task 3.4.f.1):_ the five end-to-end files spawn through `e2e/store-default.ts`; 35 of
      the 40 cases run on the store and 5 keep the override by subject, each set in a describe of its own or, for the
      ROADMAP remedy, already in its case. `base-advance`, `base-drift`, and `base-sync` pass unchanged, touching no
      ARC state, and `integration/base-advance` drives the overlap analyzer in process.
        - `base-merge-hooks`' clean merge committed `ROADMAP.md` only because its setup is shared with the ROADMAP
          remedy; the ROADMAP is now written for the remedy alone, which keeps the override, and the clean merge runs
          on the store.
        - `base-merge`'s two rename cases archive by moving tracked artifacts from `.arc/active/` to `.arc/completed/`
          and keep the live ones tracked. That is the in-repo store's archive, which the cohort register's row for
          archival by `git mv` retires, so they keep the override; its four exact-base cases run on the store.
        - `integration/base-advance`'s regenerable and evidence-neutral kinds keep the override, as the task names:
          `movementPaths` commits `ROADMAP.md` and a work unit's notes for them, and the classifier arms they reach
          leave with the in-repo implementation. They compose no store, so the override marks their subject rather
          than changing what they run; the disjoint and substantive kinds, which touch only code, stay unmarked.
    - _The integration checkpoint and teardown over base movement, as moved (Task 3.4.f.2):_ the two end-to-end files
      spawn through `e2e/store-default.ts` and `history-shape-ambiguity` leaves the ledger; 19 of the 23 cases run on
      the store and 4 keep the override by subject, each in a describe of its own. No expectation changed.
        - `integrate-base-movement`'s fixture holds the published work unit in the store, where `arc init` never ran
          (`seedProjectIdentity`, then `seedWorkUnit` bound to the checkout with its task list), and publication leaves
          nothing to commit. Seven cases run there, both bound-delivery-plan cases among them; the three regenerable
          cases keep the override, as the task names, since both sides of that movement commit `ROADMAP.md`.
        - `teardown-base-movement`'s shipped work unit is held completed in the store, linked to its branch, and the
          disjoint advance reaps there. Its refusal when the base read fails keeps the override: the in-repo teardown
          reads lifecycle authority from the fetched base under full protection, while the store's reads retirement
          from the record and proves landing against the refreshed base or, when the refresh fails, the base the clone
          holds (`resolveLifecycleBase`, `lib/git/lifecycle-ref-refresh.ts`), so that case reaps on the store.
        - `history-shape-ambiguity`'s attestation and checkpoint cases hold the work unit in the store, and attestation
          needs no verification commit. The checkpoint case composes the checkpoint's dependencies by hand, so it binds
          them to the stored work item as the handler does (`resolveIntegrationReviewInvocation`,
          `handlers/integration.ts`); unbound, the store's review ports refuse. Its readers over bare repositories
          compose no store.
    - _Work-unit review status over base movement, as moved (Task 3.4.f.3):_ `review-status-base-movement` leaves the
      ledger and all 18 of its cases run on the store. Its two `codex-pr` hosted-review arms also run under the
      override, in a describe of their own, for the segments only the in-repo store has, so the file holds 20 cases.
        - The fixture holds the work unit in the store, bound to the checkout with its task list (`seedWorkUnit`), over
          the project an in-process `arc init` mints. Records are read and written through the review-record accessors
          bound to the stored work item, and a state-only commit lands only on the in-repo store.
        - The pre-publication points build version-two boundaries, the only format the store writes; a retained
          version-one boundary is read-only there.
        - Three expectations change on the store, each because its records are held off the branch: recording
          completion notes moves no head, so it reopens no review applicability; resolving applicability to
          `review-required` returns `request-review` rather than `commit-selection` (`handleCandidateApplicabilityResolve`,
          `handlers/candidate.ts`), since from the flip delivery makes no record-only commit (spec § 8.7); and staging a
          publication response leaves nothing in the index.
        - The tracked ROADMAP's generated base movement, a correction's ROADMAP contribution, and the applicability a
          committed record write reopens run only under the override.
    - _Errand review status over base movement, as moved (Task 3.4.f.4):_ `review-status-errand-base-movement` leaves
      the ledger, and 25 of its 27 cases run on the store with no expectation changed.
        - The fixture holds the Errand as its `work-item/record`, linked to its branch, in a project `seedProjectIdentity`
          mints, and writes the Errand's checkout marker, as its open leaves both: on the store, local review selects
          the Errand through the marker's claim (`readReviewCheckoutErrandSelection`) and corroborates the bound work
          item against it. Hosted and local passes record into the review operations bound to the stored work item
          (`reviewInFlight`), keyed by the store's project identity.
        - The two `overlapping-regenerable-only` rows keep the override by subject, in a describe of their own: that
          movement commits the tracked ROADMAP, which the store refuses on the branch.
    - _Status and view, as moved (Task 3.4.g):_ `e2e/view.e2e.test.ts`, `status-lifecycle`, `status-handoff-worktree`,
      and `projection-status` spawn through `e2e/store-default.ts`, and 49 of their 55 cases run on the store.
        - `view` initializes its project and holds its work unit and task list in the store, bound to the checkout
          (`seedWorkUnit`), with the identity's and project's documents as records of their own. A case's rewrite of an
          artifact is a store write at the held version, and a deletion is `removeStoreRecord`. The bound meta renders
          its fields (`makeMetaFixture`) with the checkout's identity as owner, since the store refuses unset durable
          fields, and an artifact's path is the projection's, under `active/current/`.
        - Four expectations change, each traced to a store contract. `arc view` presents the projected file whole
          (`presentStoreArtifact`, `lib/view-artifact.ts`), so its header counts the base stamp's line, the pager's
          current-task anchor sits a line lower, and the editor receives the stamped file
          (`lib/store/projection/stamp.ts`). A completed work unit's meta opens, since from the flip `arc view` opens any
          work unit through the store (`spec-seam-status-roadmap.md` § Goals, item 5).
        - `status-lifecycle` seeds its work units, the dependency before the work unit that waits on it, and its planned
          work unit's design record; the lifecycle query's JSON is unchanged. `status-handoff-worktree` passes unchanged.
        - Keep the override by subject: `view`'s started sibling, read from its live checkout and then its branch, and a
          malformed task list, which the store's task-list write refuses; `status-lifecycle`'s slug query from a branch
          tip with `--fetch`, its remote-only Candidate, and a meta that names no owner, which the store refuses; and
          `projection-status`' disabled projection slot.
- **Diagnosed ahead of their slices, both stale fixtures (A12):** `integration/status-conflicts-cli`'s and
  `status-store-refresh-cli`'s empty-stderr assertions meet the projection's ignore-guard warning over fixtures that lack
  the `.arc/user/*/` rule `arc init` writes; `unit/handlers/active`'s worktree-porcelain refusal comes from a Git mock that
  answers every call with one identity, which the in-flight roster's topology read now reaches.

## Pre-flip steps

The inventory Task 1.6 took at `b8aa33d239`, which Task 5.12 re-runs over the verbs the rewrite actually names. The
verbs the rewritten text names (§ 3.1, § 8) were run through the built CLI over the in-repo implementation, except
where the last two items below say otherwise. Each one that refuses `unsupported` names, in its remedy, the step below,
from one source, `lib/store/pre-flip-steps.ts`, so every site refusing a verb names the same step. The step is the one
today's text takes:

- **`arc task close` and `arc task defer`:** mark the task `[x]` or `[~]` by hand and commit the mark, staged with the
  task's own commit when that is still to come. From `process-task-loop.md` § Completion protocol and `DEV-RULES.ARC`
  § Commit Discipline's task list accuracy.
- **`arc release commit --close`:** the precheck refuses before committing, naming the hand mark staged with this
  commit and the commit without `--close`; no task-close continuation prints beside it.
- **`arc save`:** commit edited tracked ARC files, and save personal files with `arc user save`. The remedy carries no
  `argv`, since no one command does both.
- **`arc handoff write`**, at the dormant command and `runHandoffWrite`: update and commit the active meta's progress
  fields, then write SESSION-NOTES with that commit as its Commit at Handoff, saved with `arc user save`. From
  `session-handoff.md` § 2 and its SESSION-NOTES write.
- **`arc inbox`**, by list form: the personal inbox file; `arc user inbox-list --target <slug>` for a personal target;
  the project inbox file; and for a work unit's slug, that listing beside its draft's Inbound Buffer section. From the
  capture gates § 4.2 replaces.
- **`arc route`:** a capture written by hand with its `WU_Target` and `_Shapes:_` lines, a draft's Inbound Buffer
  entry, or the project inbox. From `route-discovered-work.md` § Binding: carrying out outcomes.
- **`arc errand queue` and `queue set`:** the execute-bound entries in the personal inbox's Errand section, in file
  order, whose head `arc errand next` offers; and `arc user inbox-mark-execute-bound`. From `drain-inbox.md`'s marks.
- **`arc cohort close` and `remove`:** archiving the final member sweeps the tracked cohort file into its closeout
  sidecar; an empty cohort's file is deleted and the deletion committed. From `archive-work-unit.md`.
- **`arc decompose --revise` and `--discard`:** leave the cut and ask the Owner how to clean it up; for a revision,
  then plan it with `--preflight`. From `decompose-work-unit.md` § 5 and the decompose remedies' re-run of preflight.
- **`arc review adversarial record`:** the pass's entry in `ADVERSARIAL-PASSES.md` in the work unit's personal
  workspace, or with the criteria report in the verification record. From `adversarial-review.md` § Pass record.
- **`arc resume` of a paused work unit, `arc handover`, and `arc user inbox-remove --id`:** `arc resume <name>`
  for the parked work unit; Owner edited in the meta and the edit committed; and title removal through
  `--inbox-title-file`. These sit outside the task's list of remedies to rewrite. Each named an existing path, an
  uncommitted edit, or a form with no flag. `arc review adversarial record` and the resume of a paused work unit were
  not run through the CLI: the probe's fixture never reached the resume's refusal, and the record's step rests on its
  unit and end-to-end tests.
- **Unchanged:** `arc pause` names `arc park <name> --reason <text>`, `arc locus release` names `arc park` or
  `arc teardown`, and `arc status --conflicts` names `git status`.
- **Not refusing in-repo:** `arc errand open --from-inbox personal:<id>`, which reads the personal inbox file, and
  `arc store remote`, which answers. `arc repoint-design spec-finalized` repoints in-repo without removing the draft,
  so create-spec's draft stays tracked there; activation removes a draft only over the ref backend (A3). `arc attest` and
  `arc materialize` were not run: a search of their source found no capability-gated `unsupported` refusal. The
  in-repo store's own `unsupported` refusals (`lib/store/in-repo/**`) answer its internal callers; each verb above
  refuses before it writes through one.
- **Staged records and `commit-*` actions:** in-repo, `arc attest`, `arc publish`, `arc wu reconcile --apply`,
  `arc archive`, and a Candidate response stage their records, and `arc candidate applicability resolve`,
  `arc review terminus accept`, and the checkpoint's shipped-delivery boundary return `commit-selection` or
  `commit-boundary`, none of which the rewritten delivery workflows name (Task 5.6; over the store each returns
  `continue` or `none`, `handlers/candidate.ts`, `handlers/review.ts`, `checkpoint-composition.ts`). They refuse
  nothing, so no remedy names a step: the step is the pre-flip text's commit for that result, in
  `prepare-work-unit.md`, `integrate-work-unit.md`, `archive-work-unit.md`, and `deliver-stack.md` as of `ca34f785b2`.
- **The decomposition's batches:** in-repo, `arc decompose --execute` and `--extract` stage a repository result rather
  than storing the cut, and `--finish` refuses without the map (`finish-map-operand`), naming `--finish <cut-map>`;
  the rewritten `decompose-work-unit.md` names neither the staged release nor the base advancement (Task 5.7). The step
  is the pre-flip text's release, advancement, and finish, in `decompose-work-unit.md` as of `d33a28cb08`.
- **Routing's vehicles:** in-repo, the drain's routing writes are tracked files that land through a grooming branch
  and pull request under full protection or a direct base commit under partial, a route into another work unit's draft
  takes a route-only Errand, and an Errand changing only planning files arms auto-merge on `arc review planning-lane`.
  The rewritten `route-discovered-work`, `drain-inbox.md`, `run-errand.md`, and the `arc-inbox` and `arc-errand`
  skills name none of these (Task 5.8). Their store verbs refuse with the steps above; the rest is the pre-flip text of
  those files as of `2429820e51`.

**Task 5.12's re-run, at `23afde5150`.** Every verb above refuses as recorded, run through the built CLI in a clone of
the branch with no remote. `arc release commit --close` now ran there too: its precheck refused before committing and
named the hand mark staged with the commit. `arc review adversarial record` refused through the CLI that
`e2e/review-cli-surfaces` spawns, and the dormant commands through `e2e/store-command-dormancy`'s. `arc resume` of a
paused unit again stopped short of its refusal, at remote candidate expansion. In-repo, `arc errand open --from-inbox`
takes its operand as a personal inbox entry's title, the key `arc errand next` offers there, so a `<list>:<id>` operand
reports the entry missing: the in-repo inbox carries no IDs. No other verb the rewritten text names refuses
`unsupported` in-repo; `arc editor`, which does, is named nowhere in it.

## Routing from the flip

Task 5.8's readings of § 8.10 and § 8.13 where the text needed more than a verb swap:

- **The route-only Errand retires.** It carried a route into another work unit's draft as a change off the base,
  because only such a change could write a sibling's tracked draft (the until-the-flip writer line,
  `spec-inbound-routing-method.md` D8). From the flip anyone adds an entry to any inbound list with `arc route`, and
  `arc stub` mints from any checkout, so route-now carries out its own route and `arc-errand`'s route shape becomes a
  pointer to `arc-inbox`. The writer line, owner adoption, and the named gap go with it, as D8's from-the-flip contract
  says, and so do the dangling "any wait the binding names" in `create-spec.md` and `draft-design.md`; an Errand's
  route-to-home may now weave a `fold` into a backlog stub, as D4 and D8 provide.
- **The drain's record.** D5 puts what moved where in the routing plan and in the record the drain's writes leave.
  From the flip those writes leave the store's history, with a routing receipt for each move into or out of an inbox
  (`spec-seam-locus.md` § 7.3), so no grooming pull request body or commit message carries it; each dismissal's reason
  stays in the routing plan the Owner confirms. Read as `amend-design`'s entry gate step 1: every stated outcome is
  still produced. Kept there, with no durable home of its own (Owner, 2026-11-14).
- **Removing an entry from another person's backlog stub.** `spec-seam-locus.md` § 7.2 lets anyone remove an entry
  from a backlog stub's inbound list, but `spec-projection-write-back.md` § 8.1 keeps a hand edit of an inbound list
  with its work unit's owner, and no verb removes an inbound entry by ID: `arc user inbox-remove` reaches only the
  personal inbox. A non-owner's `dismiss` or `new-stub` there moves the entry into their personal inbox, which the
  route verb allows out of a backlog stub's list, and removes it there. The owner's pass still gives every entry a row,
  as before the flip: a move between two inbound lists writes no receipt.
- **The drain's split step goes.** It packaged the routing writes into reviewable pull requests or commits; with no
  pull request or commit to package, nothing is left to split.
- **An Errand's merge lane is always `reviewed`.** The auto-merge lane was reachable only through the planning-lane
  classifier, which answers `reviewed` once state is untracked (§ 8.13).

## Errand branch readers

The search § 4.8 asks for, at `a7c65b4239`: `branchToWorkUnitSlug` (20 call sites in 15 files), `isErrandBranchType`
(3 uses), `ERRAND_BRANCH_TYPES` (5 uses), and nine other splits of a branch or head name on `/`. The readers first
marked unclear are traced below. Re-run at `fb347303d9`, after the builders, validation, resume, and readiness had
changed, the search finds the same readers in the same files, each still as classified here.

- **Reaching an Errand's branch:** the builders (`lib/errand/open.ts`, `lib/session-init/errand-branch-cut.ts`); the
  record's validation (`validateOrdinaryNamespace`, `lib/errand/identity-record.ts`; the housekeep routing and grooming
  validators beside it keep their own checks);
  resume's continuity check (`validateResumeContinuity`, `lib/errand/open.ts`); readiness's vehicle-branch guard and
  Errand projection check (`identityFacts`, `scripts/review-gate/readiness.ts`); and the residue slug for an unlinked
  branch (`lib/git/in-flight-store.ts`), which is display-only and now names a suffixed Errand branch by the slug
  before its suffix (`suffixedErrandBranchSlug`, `lib/errand/branch-type.ts`).
- **Unaffected:** prefix-only checks (`lib/store/in-repo/transient-lookup.ts`, `scripts/review-gate/status-errand.ts`),
  exact matches against the record's branch (`status-errand-selection.ts`, `locus-classification.ts`, promotion's
  checkout check), `releaseMergeLock`, which passes the head branch through unparsed, and the work-unit-only readers in
  teardown, start, reconcile, activation, rename, and clash repair.
- **Traced, unaffected:** each first marked unclear either runs only on the in-repo implementation or returns before
  deriving a slug on the store path.
    - `lookupRef` (`lib/store/in-repo/lookup.ts`) is in-repo only.
    - `scripts/review-gate/core/review-subject.ts`'s fallback is skipped once the store is native.
    - The orphan-branch sweep (`lib/session-init/orphan-branch-sweep.ts`) and
      `lib/session-init/missing-worktree-folders.ts` return from their store arms first.
    - The in-flight builder's slug fallback (`lib/git/in-flight-derivation.ts`) is the in-repo composition, and it
      excludes Errand branches.
    - The project view's warning slug (`lib/status/project-view.ts`) only filters a display against work-unit names.
    - `handlers/user-reference-current-work-unit.ts` returns early off the branch, and `lib/user-sync/current-wu.ts`
      feeds only the notes commands, which refuse once the store is imported.
    - `isShippedWorkUnit` (`lib/work-unit/completed-index.ts`, read by the stale-worktree sweep) does see Errand
      branches on the store path, but matches only completed work-unit names, so a suffixed Errand branch never matches.

## Fence read families

Each writer's reads before its batch, as the fence harness's dry run records them, and what holds each family. The
harness holds an admitted batch to the records it leaves, not to its submitted bytes: the store merges a write whose
expected version is stale rather than refusing it, so an admission is correct when each record lands as fresh
preparation would write it.

- **Write-back's take-in of a work unit's meta:** the meta, each cohort on its `Cohort` path, leaf first, and a lookup
  of its slug. The batch observes the meta and both cohorts, and `checkProjectionAdmission` re-runs
  `planProjectionWrite` over `before`. A change to the meta refuses, and the fresh run reports the clash to its author;
  a rename or a change to a cohort on the path refuses, and the fresh run lands, or is held by the path's rules when
  the cohort's Parent moved. A write to an unrelated work unit admits.
- **Write-back's take-in of a cohort record, the register closures among them:** the record, and, when it keeps member
  sections, the work-item inventory and every work unit's meta, which `cohort.member-sections` reads to find the
  cohort's members. The batch observes each of them, so a concurrent change to any work unit's meta refuses and the
  fresh run lands; when that change takes a member out of the cohort, the rule holds the fresh run before its batch. A
  change to the record itself refuses, and the fresh run lands the edit merged, keeping any conflict as its record.
    - The harness found the rule refusing that merged retry: it resolved holdings through every cohort's Parent, and a
      cohort with an open conflict made the evidence unavailable. It now reads work units' holdings alone (Task 2.11).
- **The store archive:** a lookup of the subject and its meta (`readWorkUnit`), the work-item inventory
  (`readLifecycleView`), the cohort inventory and each open cohort (`observeOpenCohorts`), each cohort on the subject's
  path (`prepareArchiveCohorts`), and the meta of each work unit holding one of them (`observeArchiveHoldings`). It
  writes the subject and each cohort on the path at its expected version and observes each cohort it completes.
    - Unobserved until Task 2.13: each record holding a cohort on the path, a member's meta or an open subcohort, whose
      change the batch admitted. Both of the archive's batches now observe them.
    - Held by rules over the resulting state rather than by observation: a work unit joining a cohort on the path, which
      `cohort.open-members` refuses when the archive completes that cohort and which leaves the writes unchanged
      otherwise; and a holder leaving, which `cohort.archive-closeout` refuses when the archive leaves the cohort open.
    - A change to a cohort the archive leaves open merges into the archive's write of it, and the record lands as fresh
      preparation writes it.

## Site inventory

The floor § 8.1 sets and the closure search at `a7c65b4239`, by file. Spec sites are the sweep's classified sites;
search hits are lines matching a retired form, some of which stay. Every file is rewritten, or its hits recorded as
kept, in the task named.

| File, under the package's `arc/`                                      | Spec sites | Search hits | Task |
| --------------------------------------------------------------------- | ---------- | ----------- | ---- |
| `system/.internal/skills/arc-handoff/SKILL.md`                        | 1          | 1           | 5.2  |
| `system/methods/session-state.md`                                     | 4          | 6           | 5.2  |
| `system/workflows/arc/session-lifecycle/session-handoff.template.md`  | 59         | 66          | 5.2  |
| `system/workflows/arc/session-lifecycle/session-init.md`              | 8          | 6           | 5.2  |
| `system/workflows/arc/session-lifecycle/session-loop.md`              | —          | 1           | 5.2  |
| `system/workflows/arc/session-lifecycle/session-recover.md`           | —          | 1           | 5.2  |
| `user/README.md`                                                      | —          | 8           | 5.2  |
| `reference/templates/arc/work-unit/spec/template-spec-outline.md`     | —          | 1           | 5.3  |
| `reference/templates/arc/work-unit/template-draft.md`                 | —          | 2           | 5.3  |
| `system/.internal/skills/arc-amend-design/SKILL.md`                   | —          | 1           | 5.3  |
| `system/.internal/skills/arc-design-audit/SKILL.md`                   | 1          | 1           | 5.3  |
| `system/.internal/skills/arc-task-audit/SKILL.md`                     | —          | 1           | 5.3  |
| `system/methods/assess-draft-readiness.md`                            | 1          | 1           | 5.3  |
| `system/methods/planning-review.md`                                   | 6          | 1           | 5.3  |
| `system/methods/resolve-planning-depth.md`                            | 1          | —           | 5.3  |
| `system/methods/source-grounding.md`                                  | 2          | 2           | 5.3  |
| `system/methods/spec-review.md`                                       | —          | 1           | 5.3  |
| `system/methods/task-audit.md`                                        | —          | 2           | 5.3  |
| `system/workflows/arc/create-spec.md`                                 | 18         | 18          | 5.3  |
| `system/workflows/arc/draft-design.md`                                | 20         | 7           | 5.3  |
| `system/workflows/arc/generate-tasks.template.md`                     | 13         | 22          | 5.3  |
| `system/workflows/arc/supplemental/amend-design.md`                   | 11         | 5           | 5.3  |
| `reference/templates/arc/work-unit/template-tasks.md`                 | 3          | 2           | 5.4  |
| `system/.internal/skills/arc-commit/SKILL.md`                         | 2          | —           | 5.4  |
| `system/.internal/skills/arc-task-review/SKILL.md`                    | 1          | 1           | 5.4  |
| `system/methods/code-review.md`                                       | 1          | —           | 5.4  |
| `system/methods/commit-footer.md`                                     | 21         | 5           | 5.4  |
| `system/methods/commit-format.md`                                     | 3          | 3           | 5.4  |
| `system/workflows/arc/process-task-loop.template.md`                  | 20         | 23          | 5.4  |
| `system/workflows/arc/supplemental/prepare-commits.md`                | 10         | 7           | 5.4  |
| `reference/templates/arc/work-unit/template-cohort.md`                | 2          | —           | 5.5  |
| `system/methods/assess-parallel-fit.md`                               | 2          | 2           | 5.5  |
| `system/methods/assess-start-readiness.md`                            | 5          | 1           | 5.5  |
| `system/methods/branch-format.md`                                     | 4          | 3           | 5.5  |
| `system/methods/classify-work-unit.md`                                | —          | 3           | 5.5  |
| `system/methods/discover-next-work.md`                                | 3          | 2           | 5.5  |
| `system/workflows/arc/supplemental/clean-work-unit.md`                | 1          | 10          | 5.5  |
| `system/workflows/arc/work-unit-lifecycle/activate-work-unit.md`      | 24         | 28          | 5.5  |
| `system/workflows/arc/work-unit-lifecycle/deactivate-work-unit.md`    | 27         | 16          | 5.5  |
| `system/workflows/arc/work-unit-lifecycle/park-work-unit.md`          | 30         | 48          | 5.5  |
| `system/workflows/arc/work-unit-lifecycle/planning/init-work-unit.md` | 41         | 23          | 5.5  |
| `system/workflows/arc/work-unit-lifecycle/promote-work-unit.md`       | 9          | 12          | 5.5  |
| `system/workflows/arc/work-unit-lifecycle/reopen-work-unit.md`        | 5          | 4           | 5.5  |
| `system/workflows/arc/work-unit-lifecycle/resume-work-unit.md`        | 31         | 23          | 5.5  |
| `system/methods/adversarial-review.md`                                | 8          | 5           | 5.6  |
| `system/methods/pull-request-format.md`                               | 2          | 3           | 5.6  |
| `system/methods/review-model.md`                                      | —          | 1           | 5.6  |
| `system/methods/validate-criteria.md`                                 | —          | 5           | 5.6  |
| `system/workflows/arc/supplemental/deliver-stack.md`                  | 3          | 3           | 5.6  |
| `system/workflows/arc/work-unit-lifecycle/archive-work-unit.md`       | 12         | 13          | 5.6  |
| `system/workflows/arc/work-unit-lifecycle/integrate-work-unit.md`     | 33         | 23          | 5.6  |
| `system/workflows/arc/work-unit-lifecycle/prepare-work-unit.md`       | 10         | 9           | 5.6  |
| `system/workflows/arc/work-unit-lifecycle/verify-work-unit.md`        | 10         | 7           | 5.6  |
| `system/workflows/arc/work-unit-lifecycle/decompose-work-unit.md`     | 15         | 4           | 5.7  |
| `system/.internal/skills/README.md`                                   | 2          | 1           | 5.8  |
| `system/.internal/skills/arc-errand/SKILL.md`                         | 2          | 2           | 5.8  |
| `system/.internal/skills/arc-housekeep/SKILL.md`                      | 2          | 1           | 5.8  |
| `system/.internal/skills/arc-inbox/SKILL.md`                          | 7          | 6           | 5.8  |
| `system/methods/issue-triage.md`                                      | —          | 2           | 5.8  |
| `system/methods/route-discovered-work.md`                             | 15         | 5           | 5.8  |
| `system/workflows/arc/supplemental/drain-inbox.md`                    | 38         | 20          | 5.8  |
| `system/workflows/arc/supplemental/run-errand.md`                     | 23         | 12          | 5.8  |
| `reference/templates/arc/README.md`                                   | 2          | 1           | 5.9  |
| `reference/templates/arc/merge-gate/CODEOWNERS`                       | 5          | 50          | 5.9  |
| `reference/templates/arc/merge-gate/README.md`                        | 6          | 1           | 5.9  |
| `reference/templates/arc/template-contributing.md`                    | 2          | 1           | 5.9  |
| `system/arc-config.yml`                                               | —          | 6           | 5.9  |
| `system/workflows/arc/initial-setup/01_verify-and-configure.md`       | 9          | 13          | 5.9  |
| `system/workflows/arc/initial-setup/02_define-project.template.md`    | 3          | 3           | 5.9  |
| `system/workflows/arc/supplemental/maintain-project-docs.md`          | —          | 1           | 5.9  |
| `system/workflows/arc/supplemental/setup-merge-gate.md`               | 7          | 2           | 5.9  |
| `system/workflows/arc/supplemental/setup-release-wrapper.md`          | 1          | 6           | 5.9  |
| `system/workflows/arc/supplemental/verify-arc-integrity.md`           | 2          | 1           | 5.9  |
| `reference/QUICK-REFERENCE.template.md`                               | 21         | 20          | 5.10 |
| `reference/briefs/AGENT-BRIEF.ARC.md`                                 | 5          | 5           | 5.10 |
| `reference/briefs/AGENT-BRIEF.CONTRIBUTOR.md`                         | —          | 7           | 5.10 |
| `reference/briefs/AGENT-BRIEF.PROJECT.template.md`                    | —          | 2           | 5.10 |
| `system/rules/DEV-RULES.ARC.md`                                       | 18         | 18          | 5.10 |
| `README.md`                                                           | —          | 2           | 5.11 |
| `reference/supplemental/analysis/README.md`                           | —          | 1           | 5.11 |
| `system/.internal/githooks/README.md`                                 | —          | 4           | 5.11 |

## A2 — the task review's starting plan

§ 8.15 read: "the `arc-task-review` skill's comparison of a task list against Git, which reads its prior version through
`history`". No command reads a record's prior version: the store's `history` serves the CLI's own readers, and a verb
for this one read would be machinery the deletion units remove. The task loop keeps a task's `_Goal:_`, `_Retired in:_`,
and `_Amended in:_` lines verbatim through completion, and a title may cite the design element its task realizes
(`strategy-task-list-formatting.md`), so the skill reads the starting plan there and lists state edits with
`arc selection --changed`.

§ 8.4's crash-recovery read of "the store's version, changes, and history" stands unamended: session-init's freshness
note compares the meta's `State at Handoff` with the store's current version and lists each change since as a history
entry with the verb that wrote it (`compileStateFreshness`, `commands/agenda/context.ts`), and the loop reads it there.

A2's checks, run by the author: depth `low`; `spec-review` over the revised § 8.15 sentence and the row, with § 8.4 and
§ 8.1's site list as the surrounding contract, whose grounding narrowed "the design section its title cites" to any
design element a title cites, since the citation is recommended rather than required; the coherence reread after that
fold found nothing further; no revision tasks for a grounding check; no independent pass at `low`.

## A4 — activation's capture record

Activation's capture gate recorded each rejected or dismissed capture, with its reason, in the activation commit body
(`route-discovered-work`'s owner's-pass paragraph). From the flip activation makes no commit, and § 8 named no home for
the record, while § 8.7 gives verification's the verification task's `_Captures:_` category. Activation has no
verification task to carry it, so the record goes into the notes companion, which travels with the work unit to its
archive; the gate saves it before the activation runs. Task 5.8.c carries the method's sentence.

A4's checks, run by the author: depth `low`; `spec-review` over the § 8.6 bullet, the row, and the appended criterion,
with § 8.7's `_Captures:_` and § 8.10's capture removal as the surrounding contract, and `activate-work-unit.md` Step 1
and Step 3 read against them, found nothing to fold; no independent pass at `low`.

## A5 — verification keeps the notes companion

Verification's Step 1 kept the notes companion only when it was already reference-ready and otherwise deleted it,
removing the task list's references to it. From the flip no verb deletes a companion, and a projected file removed from
disk reads as unedited, so its record survives and the next refresh writes it back (`checkFileAtPath`,
`lib/store/projection/engine-files.ts`; `rebuild`, `lib/store/projection/swap.ts`); since A4 the companion also carries
activation's capture record to the archive. Step 1 therefore keeps the companion and consolidates it where needed, and
`clean-work-unit.md`'s search for references to a deleted notes file goes with the delete arm. Task 5.R carries the
text.

A5's checks, run by the author: depth `low`; `spec-review` over the § 8.7 sentence, the row, and the appended criterion,
with § 8.6's A4 bullet and § 8.7's `_Captures:_` as the surrounding contract, and `verify-work-unit.md` Step 1 and
`clean-work-unit.md` § Notes File Consolidation read against them; `task-audit` at grounding-only depth over Task 5.R;
no independent pass at `low`.

## A7 — branches made after the check, and `confirm`

§ 1.3's recompute item recorded under the hold "a branch's moved range, or a deleted branch's gone range", and its close
item had the close list "each moved or gone range recorded under it", record "the Owner's confirmation that a range was
re-applied", and refuse "until each recorded range is confirmed"; § 10.6 ¶1 had the Owner confirm a gone range "at the
close" and any range "to the window tooling's close, which records the confirmation against it", and § 10.7 restated the
close's listing, recording, and refusal.

The landed tooling also compares a branch the check never recorded whose tip tracks a state file
(`isWindowRecordedBranch`, `windowTipsTrackState`, `branch-observations.ts`), its range running from its merge base with
`main`'s recorded tip, and refuses one that shares no history with `main` until it is deleted or merges `main`
(`readWindowUnrecordedBase`); the close refuses while such a branch's side has no comparison mark
(`readWindowCloseBranchFindings`, `close-branches.ts`). The confirmation is an operation of its own, `confirm`, which
records it at each range's exact held tip (`confirm.ts`); the close only checks it. Perturbation 6 (§ 9.3) gains the two
branches that exercise the comparison, § 13.1's guarantee and § 17.3's residual name the unrecorded range beside the
moved and gone ones, § 13.1's residual drops "recorded" from the range whose re-application rests on the Owner, and Task
6.5.e carries the run.

## A8 — the restore's auto-merge remedy

§ 1.3's auto-merge item had the check, the last read, and the restore each refuse while the flip's pull request has
auto-merge armed, with the remedy `gh pr merge --disable-auto`. The check and the last read name that command
(`pull-requests.ts`, `last-read.ts`); the restore names the step without it ("Disarm auto-merge on the flip request,
then retry restore.", `restore.ts`). All three refuse on the same condition and their remedies take the same step, so
the item now states each as landed and no work follows.

## A9 — the switch keeps the fan-out decoration

§ 2.1 described `createStore` as `lazyStore(ports.checkoutRoot, false, ...)` over `createInRepoBackend`. The landed
`projection-worktrees` wraps that store in its fan-out decoration (`withFanOut` over
`createProjectionFanOutDependencies`, `lib/store/create.ts`), which leaves an in-repo store unchanged and, over a store
reporting `stateOffBranch`, requests a refresh of the other projected checkouts after each landed write, pull, and push.
`selectStore`, which the switch adopts, composes no decoration, so a switch built from § 2.1's text alone would drop
fan-out. Task 3.3.a already kept the wrapper; it now names it and tests it, and the appended criterion makes the
behavior checkable at 3.7.

## A10 — the npm policy file's untracked copy

§ 1.3 read: "the tracked `.arc/user/.npmignore` policy file each linked checkout needs before the projection writes into
any root, with any untracked installer copy deleted from every checkout first (§ 2.5)". The landed unit tracks the file
and its guard refuses every root without it (`ignore-guard.ts`), but neither its specification nor its code deletes an
untracked copy; the installer still creates the file, by exclusive create, in the checkout it runs in
(`prepareIgnoreFiles`, `lib/template/ignore-files.ts`). Git refuses a merge that would add the tracked file over an
untracked copy at the path, identical or not, and names the removal, and the path is not ignored here (`.gitignore`
ignores only `.arc/user/*/`). At Task 2.1 no worktree held an untracked copy. A checkout that does meets the refusal at
its next merge of `main`, ahead of the window where § 10.1 requires one, or at § 10.6 step 2, with Git's own remedy; no
step is added.

## A12 — the switch's ledger

§ 3.2 ¶4 ended: "no suite-wide override is set, since one would hide the flipped default from the tests that should see
it and would reach the CLI processes the end-to-end and integration tests spawn (§ 7), apart from the spawn helpers'
default, confined to the switch's staging and gone before its slice closes (§ 7.3)." § 7.3 ¶2 opened: "The spawned tests
move in stages, each commit green. [...] The spawn helpers then set the override by default, inert until the switch, so
the switch's commit changes only the tests that reach the default in process; each family of spawned tests then seeds
through the store and drops the default, and the default goes before the switch's slice closes. It is the one suite-wide
override, confined to that staging." § 7.2's bullet on tests that reach the default through handlers and scripts had
those whose subject is the in-repo arm "build it explicitly and pass it in", with no route for a path that takes no
store, and § 7.7's closure ended "and the spawn helpers set no override by default." § 7.3 ¶1 gave a spawned test two
routes: "A spawned test whose subject survives the flip seeds its state through the store; one whose subject is the
in-repo arm sets the override in its spawn environment and leaves with that arm". § 3.1's paragraph on the override
opened "The override reaches no test."; it now names the flip's checkout's override, which the paragraph already
concerned, so the row does not list it.

A full run over the switched default, before any test changed, failed 141 files: 37 unit files (514 tests), 87
integration files, 16 end-to-end files (61 tests), and one store suite (two tests). Task 1.4's classification covered
the tests that call `createStore` or stub it, yet five files it recorded as building the in-repo store explicitly still
fail in cases that reach the default (`unit/lib/store/current-work-unit`, `unit/lib/checks/projected-selection`,
`unit/handlers/review`, `integration/store-lifecycle-storage`, and `store-imported-seal`), some testing the in-repo arm
and some a subject that survives, so a listed file moves case by case. Most failures reach the default through handlers
and scripts, and they reach it three ways:

- **In process:** the window tooling's check composes the default over fixtures that track state and refuses, through
  its checkout-holder read, which passes no store (`readWindowEndedCheckoutFindings`,
  `scripts/cutover-window/checkout-holders.ts`), and its import context (`createWindowImportContext`); review handlers
  bind stored review ports without the invocation's exact work item (`requireReviewWorkItem`); unit tests with a
  scripted `exec` meet the tracked-state predicate's tree read; and in 16 unit files the default store launches Git for
  that read, which the unit tier's process guard blocks (`UnitProcessGuard`,
  `__tests__/helpers/unit-process-guard-core.ts`). Past that read neither class reaches the ref backend in the unit
  tier, since it reads through its own Git executor (`rawExec`), which no scripted `exec` replaces.
- **Spawned outside the spawn helpers:** `e2e/config-validate.e2e.test.ts` runs the CLI by `spawnSync` with the test's
  environment over a directory that is not a Git repository, which Task 1.5's classification missed.
- **Through what a projection leaves:** once the ref default projects into a fixture repository, the projection ignores
  `.arc/active`, so the test's later `git add` there refuses (`e2e/delivery-position`, `user`); a hook the test's own
  `git` runs inherits the test's environment, as the CLI it spawns does.

One commit judging every file would put about 140 files from every subsystem into one review and carry that diff across
compactions. Running the in-process tests in-repo by default through Phase 3 would avoid that, but the run measured only
which files break under the ref default, not which break under an in-repo one: a blanket default would need a second
full run to find its opt-outs, would break Task 1.2's test that no worker sees the override, and would hide the flipped
default from every unlisted and every new test. The ledger lists only the measured files, so an unlisted test sees the
flipped default in process from the switch on, and the end state is checkable: the ledger is empty, then gone at Task
3.6 with a test against either default returning. Setting the override in the process running a listed file reaches all
three paths. Each family moves as before; a listed file a family of spawned tests reaches, through a shared seeder such
as `registerCandidateLineageSuite` or its own spawned cases, moves in that family's commit, since a seeder moves once.

Four failures may be product defects rather than stale expectations, and Task 3.R.a diagnoses them first against the
ref default so the ledger does not hide them: the designation and minting `store-ref-init-designation` now sees, the
Class `set-class` writes, the symbolic-link refusal in `install-symlink-refusal`, and the projection warning outside a
Git repository. The staging and the defect tasks follow the Owner's direction and the project manager's three
conditions (2026-11-17): the slice ends where one commit would have, the suspected defects are tasks of their own, and
the families are grouped into a few review increments.

## A13 — the retired-subdirectory slot

§ 17.2's bullet on the current-work-unit reconciliation and stale-worktree sweep slots ended: "The slot leaves with the
in-repo arm." The Owner moved its remaining share to notes removal at that unit's draft-design review (2026-11-17),
relayed by the project manager: the slot's recommendation rides the notes-load channel, reading
`session.init_load.notes` and naming `arc user load`, both of which notes removal deletes. The flip's own share in the
row is unchanged.

## A15 — the orphan sweep's absent claims

`spec-seam-locus.md` § 12.4 ¶4, on a transient branch from the flip, ended: "A lookup that fails, or a claims
acquisition that is not complete, declines the sweep, as an incomplete transient read does today." Read with that
design's A20, which made an authoritatively absent claims acquisition an empty inventory for an Errand's terminal and
merge admission alone, an absent acquisition is not complete there, and `completeClaimBranches` declines it, as
`integration/orphan-store-branches.test.ts`'s "declines an absent claims acquisition as incomplete" asserts. Task
3.4.a.2's envelope trace found every store envelope's sweep declining for that reason (§ Test callers), since a person
with no claim records, as in any fresh checkout, reads absent; its remedy, "Restore a complete claims acquisition for
this identity", names no step such a person can take. A20's reason holds for the sweep unchanged: absence read at a
pinned version is an inventory, not a failure, so § 4.11 extends it there while every other decline stays. The project
manager's triage set the fix's bounds, and the Owner approved it at Task 3.4.a.3's stop: only an authoritatively absent
acquisition becomes empty, an incomplete one still declines, the failing test comes first, and the sweep's residue
reason for a branch a completed work unit links changes only if the fix exposes it.

## A16 — the orphan sweep's unlinked branches

`spec-seam-locus.md` § 12.4 has the sweep from the flip admit "a gone-upstream branch the store links, whatever its
name, through the store's lookup of its ref", and its next bullet ends: "A lookup that fails, or a claims acquisition
that is not complete, declines the sweep, as an incomplete transient read does today." `readOrphanStoreCandidates`
reads a `not-found` lookup as one that fails, and `integration/orphan-store-branches.test.ts`'s "declines the whole
sweep on a failed branch lookup" locks that for a branch no record links. Task 3.4.a.4 found both
`e2e/session-init-orphan-actions.e2e.test.ts` cases' sweeps declining with "No readable primary, claim, or lineage origin
matches this lookup.", A15 having settled the claims half, and a probe in that integration harness, a Shipped work
unit's linked branch beside an unlinked one, returned no offers and the warning on both paths. So a person with any
gone-upstream branch ARC did not link, one made outside ARC or one a host deleted before the flip linked it, gets no
cleanup offers at all. The refusal's `code`, `not-found` (`missingLookup`), separates it from a failed read. The Owner
chose at that stop to leave such a branch out, rather than keep the decline and capture it: leaving it out offers
nothing, the conservative direction, and a record not yet pulled costs only a later offer. `storeLocusOwnsBranch` acts
only on a resolved branch, so a separate result leaves it as it is.

## A17 — projection over read-only Git metadata

`e2e/session-init-remote-boundary.e2e.test.ts`'s read-only case is `spec-remote-access-contract.md`'s criterion 2: "In a
real linked worktree with readable network access and read-only shared `.git`, worktree sync, base distance,
base-branch sync, and user-reference reconciliation return the same exact values as an unrestricted probe when their
advertised objects are already local." On the ref default the command ends with `EACCES` creating the projection lock
under the linked worktree's `arc-projection/`, inside the read-only common directory. With only that folder made
writable, the restricted envelope matched the unrestricted one in every slot (Task 3.4.a.4's probe), so the lock alone
blocks session-init there. `recordProjectionLockSkip` already runs a command with projection disabled for a held, lost,
or mismatched lock or a missing Git directory, and no spec covers an unwritable one. The Owner chose at that stop to run
unprojected and report the skip, keeping the contract's passivity, rather than refuse with a remedy.

## A18 — a fresh Errand's UID under full protection

Task 3.4.a.4 found both `e2e/precompact-locus-anchor.e2e.test.ts` cases that open an Errand refused on the store with
`identity-conflict`, "not-found: The named owner has no live ref", and the built CLI refuses the same way in any fresh
repository under `branch.protection: full`; under partial it opens. For a slug no record holds, or one whose generation
has completed, `newDescriptionReference` (`lib/inbox/errand-adoption.ts`) names the new description's owner with a UID
it mints, and `prepareMutation` (`lib/errand/store-runtime.ts`) writes the Errand record under that owner. `resolveOwner`
(`lib/store/ref/write-resolution.ts`) refuses a write naming a UID no live ref holds, so every full-protection open of a
new Errand refuses. Full-protection opens over a store were tested only through `LifecycleReferenceBackend`, whose write
admits a caller's UID on create (`__tests__/helpers/store/write.ts`), and the end-to-end Errand family still runs in-repo
until Task 3.4.e.

§ 4.8 ¶1 read: "The store mints the Errand's UID only when it resolves the write (`resolveOwner`,
`lib/store/ref/write-resolution.ts`), after the branch must be named, so open mints the suffix itself and keeps one
write." Naming the new description's owner by slug alone, so the store would mint the UID, opens the Errand on the ref
store but loses its captures: a routing receipt written in the same batch records the generation's UID as its list
(`listCoordinate`, `lib/inbox/receipts.ts`), so a slug there cannot tie the entry to its generation, and abandon,
rollback, and resume no longer return it (six model-backed tests, among them `unit/lib/inbox/errand-batch` and
`integration/errand-reserved-slugs-cli`). Open's plan must know the UID before its one write. The Owner chose at that
stop to let the store admit the planned UID for an owner the write creates, rather than name the receipt by slug and
resolve it later, or split open into two writes and lose its atomicity.

## A19 — the notes-related session-init slots

§ 17.1's item 13 read: "Notes-related session-init probes and user-reference reconciliation slots." The register
corrections that recorded `cutover-notes-removal`'s approved departures (PR #1384, merged as `cf6769b688`) gave the row
a later share in `cohort-storage-cutover.md`'s register: notes removal deletes the envelope's notes slots the store
leaves empty (`partialPushMarker`, `retiredSubdirs`, `compactionAdvisory`, `recommendedCombinedPrompt`) and the `user`
slot's notes variant. The flip's share is unchanged, but its landing no longer closes the row, so the row moves to
§ 17.2 with a bullet naming what lands and what stays. The Owner decided it on 2026-11-19, relayed by the project
manager; A13 had already moved the `retiredSubdirs` part of § 17.2's reconciliation bullet the same way.

## A20 — store teardown's markerless holder and removing self-teardown

Task 3.4.b.1 held `e2e/teardown.e2e.test.ts`'s shipped `demo` completed in the store, its branch linked, and two cases
found the store arm departing from the in-repo teardown. "Refuses markerless linked self-teardown as externally
managed": the store arm returned the markerless checkout to a detached base and deleted `feat/demo`
(`returnRetiringCheckout`), where the in-repo teardown refuses it through its selection ("The teardown target has no
ARC ownership marker.", `classifyTeardownSelection`). `spec-husk-lifecycle-drivers.md` had kept shipped self-teardown's
markerless fallback ("does not tighten the existing shipped fallback for externally-managed markerless worktrees");
`session-locus-operability-hardening` then made the marker the selection's authority (`bbcf49f498`). The store arm's
holder search skips an unbound marker, so it never reaches that selection. "Honors the personal remove preference":
under `arc.selfTeardownMode: remove` the store arm removed the invoking checkout, then refused `git config:
spawn-failure` before reaping the branch, since the store's raw Git calls stay in the checkout that opened it
(`createExecaRawGitExec(input.checkoutRoot)`, `lib/store/default-ports.ts`) while the handler's hop re-points only its
own exec (`handlers/lifecycle.ts`).

The Owner chose at that stop to make the store arm refuse the markerless holder as the in-repo teardown does, and to
fix the hop, under one revision task. At the same stop the Owner accepted two other departures as the store's behavior,
each retraced in the test: a local ref that cannot be locked after the husk exits 1 naming the `--husk` retry, an
explicit refusal that `spec-worktree-teardown-decoupling.md`'s "rather than an ambiguous rejection" allows; and a replay
by name from the primary after a self-teardown leaves the husk, so the case replays the continuation the store prints.
That replay's summary reports the already-deleted branch as "left intact", a capture for a later fix.

## A21 — the store outlives the checkout it opened in

Task 3.4.b.2 gave `e2e/lifecycle-exit.e2e.test.ts` store cases for `arc abandon`, since its in-repo cases stay with the
in-repo implementation. From the primary checkout, abandonment retired the record, removed the work unit's spawned
checkout, and reaped its created branch locally and on `origin`. From that checkout, as `deactivate-work-unit.md`
directs, it removed the checkout and then refused `git config: spawn-failure`, exiting 1 with the branch left on both
sides; the printed `arc teardown <uid>`, run from the primary, finished the cleanup. The command's teardown context
(`createStoreTeardownContext`) supplies no `reopenStore` port, which Task 3.R6 gave `arc teardown` alone. A probe of
`e2e/errand-abandon.e2e.test.ts`'s case on the store, opening with `--isolate` and no capture, failed with a different
symptom: once the Errand's checkout was removed, abandonment refused `ENOENT: no such file or directory, lstat
'<checkout>/.git'`, the file the store's lock factory reads at each acquisition to find the common Git directory
(`readGitDirectories` in `createRefLockFactory`).

The sweep over commands that can remove or move the checkout they run in:

- `arc teardown`: closed by Task 3.R6's reopen from the primary.
- `arc abandon` and `arc errand abandon`: fail, probed.
- `arc decompose`: the same teardown context and store arm as abandonment (`lib/decompose/retirement.ts`); not run.
- `arc errand close` and `leave`: the same terminal settlement as Errand abandonment (`lib/errand/close-runtime.ts`,
  `lib/errand/leave-runtime.ts`); not run.
- `arc locus release`: reads the store before the removal, in its pre-retire revalidation
  (`revalidateReleaseEligibility`, `lib/locus/release.ts`), and returns after it; `integration/locus-release.test.ts`
  covers it on the store.
- `arc rename`: defers moving its own checkout (`deferredMove`, `commands/rename-store.ts`); Task 3.4.b.3 runs it on
  the store.
- `arc start` and materialization: create checkouts and never remove the invoking one.

The Owner chose to fix the store rather than each caller: one change covers the five commands and any later one, where
reopening per caller would wire each and leave the next to fail the same way. Task 3.R6's `reopenStore` port leaves once
the store no longer needs it.

_As built (Task 3.R7):_ the store's location (`createStoreCheckoutLocation`, `lib/store/checkout-location.ts`) runs each
Git call meant for the checkout the store opened in there while it exists, and in the primary checkout once it is gone.
It reads that checkout's Git directories once, at the store's first Git call there, rather than as its ports are built,
since building them reads nothing; each of these commands reads its record before removing its checkout, so the read
always comes first. The lock factory, the six ref-store lookups, and the machine ID take the directories it kept. The
machine ID needed a change of its own: asked from the primary, Git named the common directory as a relative `.git`,
which was resolved against the removed path and recreated it. Through the built CLI, Errand close failed as abandonment
did; leave passed before the fix, reading nothing after its removal; and a remove-mode `arc teardown` from its own
checkout passes without `reopenStore`, which left with `rebindRetirementEvidence`. With the location bypassed,
abandonment, Errand abandonment and close, and that teardown fail again.

## A22 — a store rename's deferred move

Task 3.4.b.3 gave `e2e/rename.e2e.test.ts` store cases, since its in-repo cases stay with the in-repo implementation.
Run from the checkout ARC spawned for its work unit, the store rename renamed the record, the branch locally and on
`origin`, and the checkout's ownership, recorded the move in the marker as `renameMovePending`, and printed the
`git worktree move -f -f` that finishes it. After that move, a replay of the rename from the moved checkout exited 0 and
left the field in place: the replay finds the record renamed (`resuming`, `lib/store/lifecycle-rename.ts`), and
`persistRename` returns before any checkout step unless the local branch still needs its catch-up. The in-repo arm's
replay resolves the moved checkout as `already-moved` and reruns the checkout's rename transaction with the pending move
cleared, which the in-repo case asserts. `arc locus` and session-init resolved the moved checkout as the work unit's, so
only cleanup sees the field: the store's stale-checkout selection and landed-retirement sweep both skip a marker
carrying a pending move, so a landed work unit's self-renamed checkout would never be offered for removal.

Session-init's offered move (`projectRenameMoveRemedy`) runs only `git worktree move`, so the field stays after it as
after a move by hand, on both arms; its text names the replay for that reason. Settling the field in the cleanup readers
instead, treating a landed move as settled, was set aside: the marker would keep a stale field every other reader must
interpret, and the replay is the contract the in-repo arm already keeps.

## A23 — active status and a bound checkout's Candidate

Task 3.4.c.2 moved the Candidate lineage suites onto the store. Two cases that read `arc active status` in the checkout
bound to their work unit, the mechanically carried Candidate and the change-set fix's resume, found the Candidate's ID
and integration boundary `null` with attest's records in the store, beside the warning "Candidate authority for
meta-example.md is unavailable: Cannot identify meta-example.md". The active scan projects each held work unit's meta
at the checkout's own layout (`readHeldCandidates`, `lib/active/meta-reader.ts`), which under the default `nested`
layout is `.arc/active/current/meta-example.md`, and records the owner it read. `readSubject`
(`lib/store/active-review-access.ts`) ignores that owner for the slug and identifies the path with no layout context
(`identifyWorkUnitArtifactPath`), which recognizes the flat path and another checkout's `in-flight/<slug>/` copy but not
a checkout's own `current/` folder. The primary checkout and the flat layout were unaffected; every bound checkout under
the default layout was not. Session-init's `active` slot reads through the same access, so an Integrating work unit, or
an Active one in `prepare-work-unit`, there leaves its session type unresolved.

Passing the checkout's layout context alone would also identify the path, but re-derives a slug the scan already holds
as an exact owner; the owner read is exact. The layout context stays for a caller that supplies no owner.

## Kept sites

Each closure-search hit that stays, with its reason, recorded by Task 5.11 and confirmed at Task 5.12.

The search reads every file under the package's `arc/` but `reference/strategies/` — Markdown, configuration, and
scripts alike — against the retired forms, with a bare `active/`, `backlog/`, or `completed/` for paths into the
projected roots (Python `re` syntax):

```text
git add|git commit|git rm|git mv|git show|\[x\]|\[~\]|plan/|SESSION-NOTES|arc user|notes|park|ROADMAP|ADVERSARIAL-PASSES|Inbound Buffer|USER-INBOX|ATOMIC-INBOX|inbox-list|inbox-remove|planning-lane|planning-grooming|chore\(arc\)|Commit at Handoff|grooming branch|meta-\{|(?<![\w.-])(active|backlog|completed)/
```

**Session lifecycle (Task 5.2):**

- `Commit at Handoff` in `session-handoff.template.md`, `session-init.md`, and the `session-state` method: the meta's
  code-head anchor, which `arc handoff write` records beside `State at Handoff`.
- `git commit` in `session-handoff.template.md`'s Errand checkpoint: a code commit on the Errand's branch.
- `notes-*` in `session-handoff.template.md` and `session-recover.md`, and "completion notes" in
  `session-handoff.template.md`: the work unit's notes companion and task-list completion notes, not Git notes.
- In `user/README.md`: "scratch notes", personal freeform files; `arc user add`, the setup verb the flip keeps; and
  `.arc/active/`, `active/`, and `backlog/`, the projected roots named as directories, not a record's path.

**Planning stages (Task 5.3):**

- `arc user inbox-remove --id <id> --expected-version <version>` in `create-spec.md`: the removal verb the flip keeps,
  by ID and version.
- "held" in `create-spec.md`: `_Hold`, kept as the retention escape hatch.
- `chore(arc): create spec-{name}` and its commit in `create-spec.md`: a commit of tracked files only, an accepted ADR
  or research moved under `reference/supplemental/`.
- `notes-*`, `notes-{name}.md`, "notes file", and "no commit metadata" in `create-spec.md`, `task-audit`,
  `spec-review`, `template-draft.md`, and `template-spec-outline.md`: the notes companion, not Git notes; "notes" and
  "committing" in `template-draft.md` are prose.
- `[~]` in `amend-design.md` § Where the change lands: a superseded Success Criterion's disposition at verification,
  not a task close; "fix commit" there is the review fix's code commit.
- "park it as an open question" in `create-spec.md`, and "branch" in `create-spec.md`, `generate-tasks.template.md`,
  and `assess-draft-readiness`: prose, the work branch, and the base branch, not a planning branch.

**Task loop and commit text (Task 5.4):**

- "completion notes", "notes", and `notes-{name}.md` in `process-task-loop.template.md`, `prepare-commits.md`, and the
  `arc-task-review` skill: task-list completion notes and the notes companion, not Git notes.
- `meta-{name}` in `commit-footer`'s chain naming: a footer names the meta record by its filename, not a tracked path;
  "plan/PRD" there is prose, not a planning branch.
- `git commit` in `commit-format`: the raw route's commit of tracked files and its message transport.

**Work-unit lifecycle (Task 5.5):**

- `arc user inbox-remove --id <id> --expected-version <version>` in `activate-work-unit.md`: the removal verb the flip
  keeps, by ID and version.
- `notes-{name}.md`, "notes", "notes file", "completion notes", and "resume notes" in `activate-work-unit.md`,
  `init-work-unit.md`, `clean-work-unit.md`, and `park-work-unit.md`: the notes companion, task-list completion notes,
  and the pause's resume notes, not Git notes.
- `- [x] 4.3.3` in `clean-work-unit.md`: an example of a closed task line the pass keeps verbatim, not a close.
- `park-work-unit` in `resume-work-unit.md`: the pause workflow's filename, which the rewrite keeps.

**Delivery, review, and archive (Task 5.6):**

- `chore(arc): export the review copy of spec-{name}` in `verify-work-unit.md`, and `git rm -r .arc/specs/{name}/`
  with `chore(arc): remove the review copy of spec-{name}` in `integrate-work-unit.md`: commits of the tracked review
  copy alone; `meta-{name}.md` in their footers names the meta record by its filename.
- `arc user inbox-remove --id <id> --expected-version <version>` in `verify-work-unit.md`: the removal verb the flip
  keeps, by ID and version.
- `[x]` and `[~]` in `verify-work-unit.md`'s three-state model and `validate-criteria`: Success Criteria dispositions,
  and in `adversarial-review`'s prompt the task markings a reviewer must not take as evidence; none closes a task.
- `notes-{name}.md` and "Notes File Consolidation" in `verify-work-unit.md`, "notes" in `adversarial-review`,
  `pull-request-format`, and `review-model`, and "release notes" in `integrate-work-unit.md` and `archive-work-unit.md`:
  the notes companion, reviewer notes, advisory notes, and release notes, not Git notes.
- `plan/state` in `deliver-stack.md`: the delivery plan and state, not a planning branch.

**The decomposition workflow (Task 5.7):**

- "notes" in `decompose-work-unit.md`: the notes companion, its sections, and its member copies, not Git notes.
- "no commit, push, pull request, or merge follows" in `decompose-work-unit.md`: the statement that the terminal batch
  is the landing, not a commit step.

**Routing, the inbox, and the Errand queue (Task 5.8):**

- `arc user inbox-remove --id <id> --expected-version <version>` in `route-discovered-work`: the removal verb the flip
  keeps, by ID and version.
- `strategy-session-operations.md § USER-INBOX` in the `arc-inbox` skill: that strategy's section heading, which
  `cutover-documentation` rewrites with the strategies.
- "notes companion" in `route-discovered-work` and "completion notes" in `issue-triage`: the notes companion and
  task-list completion notes, not Git notes.

**Setup, configuration, and merge-gate text (Task 5.9):**

- `git commit` / `git push` in `01_verify-and-configure.md` and `setup-release-wrapper.md`: the release wrapper's
  commits of tracked files and the harness permission patterns it is set up beside.
- "setup notes" in `01_verify-and-configure.md`, "reference notes" in `setup-release-wrapper.md`, and "AI notes" in
  `maintain-project-docs.md`: prose, not Git notes.
- `.arc/backlog/ROADMAP.md` in `setup-merge-gate.md`, `arc review planning-lane` in the merge-gate README's `classify`
  job, and `CODEOWNERS`' ROADMAP comment and unowned planning paths: the recipe's CI lane classifier and path
  ownership, which stay until tracked-state removal retires the recipe whole; § 8.13 drops only ARC's arming.
- `.arc/active/` and `.arc/backlog/` in `template-contributing.md`, and the `layout.active` comment's
  `.arc/active/current/` and `.arc/active/in-flight/<slug>/`: the projected roots named as directories.
- In the configuration template: "notes" in `hooks.meta_ref_patterns`, a pattern over `notes-*` filenames; and the
  comments on `user.notes_push`, `session.init_pull.notes`, and `session.init_load.notes`, with their `arc user push`,
  `arc user pull`, and `arc user load` remedies and the team-mode and worktree-offer lines, each scoped to state kept in
  the repository or marked as having no effect off the branch, since the keys stay until notes removal.

**The always-loaded text (Task 5.10):**

- `git commit` in `AGENT-BRIEF.ARC.md`'s release-wrapper line, `DEV-RULES.ARC.md`'s amend scope, and QUICK-REFERENCE's
  release-wrapper block: commits of tracked files.
- `meta-{name}.md` in `AGENT-BRIEF.ARC.md`'s work-unit definition and Key Documents row, and `meta-{name}.md`,
  `tasks-{name}.md`, and `notes-{name}.md` under `user/{identity}/active/` in `AGENT-BRIEF.CONTRIBUTOR.md`: records
  named by filename, and a contributor's personal pipeline under the layout's contributor scope.
- `.arc/active/` and `.arc/backlog/` in `AGENT-BRIEF.CONTRIBUTOR.md`: the projected roots named as directories.
- "notes" in `DEV-RULES.ARC.md` (completion notes, work-unit notes, notes files, "design debt in code or notes"),
  `notes-docs-content-sweep.md` in the contributor brief's placeholder link, and "notes" in
  `AGENT-BRIEF.PROJECT.template.md`'s stack rows: the notes companion, completion notes, and prose, not Git notes.
- `park-work-unit.md` in QUICK-REFERENCE's `arc pause` line, the pause workflow's filename; `session-notes` there is
  `arc view`'s kind name, which reads the meta's session context.

**Remaining sites (Task 5.11):**

- In `system/.internal/githooks/README.md`, the ROADMAP conflict exemption, the contributor staging warning, and the
  `hooks.contributor_protected_paths` row, with that key's comment and `active/|backlog/` default in the configuration
  template: the hooks as they run until tracked-state removal deletes those checks and the key.
- Every hit in the scripts, which are code. In `system/.internal/githooks/pre-commit`, the state-path checks — the
  ROADMAP conflict remedy, render-field warning, and regeneration assert, the contributor-protected paths, the
  task-list modification warning, task numbering, cohort consistency, and foreign writes — select nothing once no
  tracked file sits under the projected roots, and tracked-state removal deletes them; the size and conflict-marker
  reads of staged content (`git show ":$file"`), the meta-reference pattern, and the link check's note on movable
  records stay. In `system/.internal/scripts/validate-links.sh`, the movable-record rule over the projected roots and
  the read of staged Markdown, and in `verify-integrity.sh`, the meta-file check's roots and its note that `active/`
  appears at the first activation, hold after the flip.
- The `[park]` link label in `resume-work-unit.md`, which points at the pause workflow's filename.
- "notes" in `generate-tasks.template.md` and `amend-design.md`, `notes-*` in `AGENT-BRIEF.ARC.md`'s work-unit
  definition, `--resume-notes` in QUICK-REFERENCE's `arc pause` line, "notes" in `DEV-RULES.ARC.md`'s planning-artifact
  list and its "leave notes" prose, and "methodology notes" and "notes file" in
  `reference/supplemental/analysis/README.md`: the notes companion, the pause's resume notes, and prose, not Git notes.
- `active/`, `backlog/`, and `completed/` named as directories, not a record's path: `README.md`'s tree,
  `AGENT-BRIEF.ARC.md`'s state line, Key Documents row, and Directory Structure, `DEV-RULES.ARC.md`'s `backlog/` stub
  and the relocatability rule's placements, QUICK-REFERENCE's `arc archive` comment, `01_verify-and-configure.md`'s
  directory check, `verify-arc-integrity.md`'s meta-file check, and `setup-merge-gate.md`'s classifier paths, which
  stay with the recipe (§ 8.13).
- `user/{identity}/active/` in `user/README.md` and the contributor brief, with `meta-{name}.md` and `tasks-{name}.md`
  in `user/README.md`: a contributor's personal pipeline under the layout's contributor scope.
