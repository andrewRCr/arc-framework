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
