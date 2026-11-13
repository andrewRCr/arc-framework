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
3. The switch changes `createStore` and the expectations of the tests that reach the default in process (Task 3.3);
   every spawned test still runs the in-repo implementation, through the spawn helpers' override or, where it spawns
   outside them, its own (Task 3.2.b).
4. Each family of spawned tests seeds through the store and drops the override, one family per commit (Task 3.4); a test
   whose subject is the in-repo arm keeps it explicitly.
5. The spawn helpers' default goes (Task 3.6), so the slice cannot close with a family still hidden behind it.

The spawn helpers' default is the one suite-wide override, confined to Phase 3; the test setup's clearing (Task 1.2)
still keeps the flip's checkout's own override from every test. A test seeds through the helper's in-process writes
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
   runs, and the window takes the place of Steps 8, 10, and 11.
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
  scripts that call `createStore(`, the only one a test spawns.
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

## Errand branch readers

The search § 4.8 asks for, at `a7c65b4239`: `branchToWorkUnitSlug` (20 call sites in 15 files), `isErrandBranchType`
(3 uses), `ERRAND_BRANCH_TYPES` (5 uses), and nine other splits of a branch or head name on `/`. The readers first
marked unclear are traced below; Task 2.10 confirms each at its own head.

- **Reaching an Errand's branch:** the builders (`lib/errand/open.ts`, `lib/session-init/errand-branch-cut.ts`); the
  record's validation (`validateOrdinaryNamespace`, `lib/errand/identity-record.ts`; the housekeep routing and grooming
  validators beside it keep their own checks);
  resume's continuity check (`validateResumeContinuity`, `lib/errand/open.ts`); readiness's vehicle-branch guard and
  Errand projection check (`identityFacts`, `scripts/review-gate/readiness.ts`); and the residue slug for an unlinked
  branch (`lib/git/in-flight-store.ts`), which is display-only.
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

## Kept sites

Each closure-search hit that stays, with its reason, recorded by Task 5.11 and confirmed at Task 5.12.
