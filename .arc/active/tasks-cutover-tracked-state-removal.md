# Task List: Cutover Tracked-State Removal

- **Design:** `spec-cutover-tracked-state-removal.md`

---

## **Phase 1:** The census at the flip's landing, and the personal-key rule

_Purpose:_ Re-measure the inventory against the flip as merged and amend this list in place, confirm the store facts the
design rests on, and make the personal key check refuse a `.internal` folder at any depth, so every removal starts from
a confirmed inventory and the one rule this change corrects is settled first.

_Mode:_ `layer` — closes on a confirmed inventory and the store's personal-key admission settled.

_Exit criterion:_ The census at the merged flip places every surface it finds under § 2's rules or another change's
share, with this list amended to match and the result recorded; the window has closed; no personal ref holds a key with
a `.internal` segment, at its tip or in its history, and no checkout of the owner's holds a `.internal` folder below the
identity root's own; `cohort.member-sections` refuses an orphan hand edit; and the key check refuses a `.internal`
folder at every segment, with the remedy named.

### `[ ]` **1.1 The census at the flip's landing — § 2.11**

- _Goal:_ This list removes what the flip, as merged, leaves dead: every surface the census finds sits under a rule here
  or another change's share, the list is amended in place to match, and the store facts the design rests on hold.

- **Additional Context:** `notes-cutover-tracked-state-removal.md` § Census before task generation, the baseline. This
  task records its own results in a new § Census at the flip's landing in that file.

    - `[ ]` **1.1.a Confirm the window has closed**
        - `cutover-flip` is merged on `main`, and this branch has `main` merged in.
        - In the clone that ran the window, its close has run, so no hold remains under `refs/arc-window/`, and Git
          notes are retired. An empty `refs/arc-window/` in another clone proves nothing: the hold exists only where the
          window ran, and `closeWindow` passes as cleanup-only when there is none.
        - The window imported the planning artifacts of the delivery work held at planning
          (`delivery-rebuild-continuity`): `arc status delivery-rebuild-continuity` resolves it from the store, with its
          planning artifacts.
        - Otherwise stop: the removals wait for the window, and tasks 3.1 and 4.3 need task 2.1's removal of the tooling
          first.

    - `[ ]` **1.1.b Re-run the census and amend this list**
        - Walk every class § 2.11 lists at this branch's head once `main` is merged in, against the flip's merge for
          what the flip changed and the earlier census for its members.
        - Judge what the earlier run left open: `arc sync`'s options, the rows traced only through the flip's tables,
          `runUserOpen`'s reach (§ 2.1), the classifiers' shipped callers and the recipe's onboarding offer where the
          flip's rewrite leaves them, and any help that still describes an inbox entry title (the `errand open` example
          and note in `lib/cli-help-content.ts`, and "Remove a title-matched inbox entry" in
          `lib/cli-help-summaries.ts`), which joins task 3.3.b.
        - Re-measure the CLI-spawning tests of removed surfaces, which now run the store arm, and the tests that pass a
          removed option to the in-repo arm under the override.
        - A new member joins its rule's task, a member that has gone leaves it, and a member no rule covers stops for
          the spec. Record the census in the notes.

    - `[ ]` **1.1.c Confirm the store facts**
        - Scan every personal ref for a `.internal` path segment in every commit's tree, at its tip and through its
          history (§ 2.9): `refs/arc/user/<identity>/personal*` and their copies under `refs/arc-remotes/<remote>/`,
          read in the store's Git directory for each layout (`<commonDir>/arc/store` under the separate layout,
          `lib/store/ref/designation.ts`), on the state remote and in each of the owner's clones. A fetch takes only the
          configured identity's refs (`fetchRefRemote`, `lib/store/ref/fetch.ts`), so the remote's own refs are read
          there, not through a fetch.
        - On each of the owner's checkouts, list every `.internal` folder below the identity root's own
          (`find .arc/user -mindepth 3 -type d -name .internal`), among them any the integration checkpoint left under
          `<identity>/<work-unit>/.internal/` before the flip (§ 2.9).
        - Confirm that `cohort.member-sections` refuses a hand edit whose `## Members` names a slug that is not a member
          of the cohort and passes a verb's write (§ 2.2), by its unit test
          (`unit/lib/store/kinds/cohort/member-sections.test.ts`) and one hand edit taken in by write-back, made in a
          disposable clone that cannot push state, so a refusal that fails publishes nothing.
        - Record each command and its result in the notes; a finding otherwise is a design question for the spec.

### `[ ]` **1.2 A personal key with a `.internal` folder at any depth is refused — § 2.9, D4**

- _Goal:_ A personal key that names a `.internal` folder at any segment is refused when written, read, or decoded, with
  the remedy named; only the identity root's `.internal/` stays machine-local, in the key check and in every reader of
  the machine-local rule.

    - `MACHINE_LOCAL_PATHS` (`lib/store/registry.ts`) drops `<identity>/*/.internal/**`, and `malformedKeyProblem`
      (`lib/store/ref/path-admission.ts`) checks every segment of a personal key rather than its first two.
    - The rule's readers take the narrowed pattern through `isMachineLocalProjectionPath` and `isExcludedProjectionPath`
      (`lib/store/projection/discovery-exclusions.ts`) with no edit of their own: the projection walk
      (`walkProjectionRoots`, `engine-walk.ts`), the retirement check (`observeUnprojectedPersonalFiles`,
      `removal-residual.ts`), the desired paths, the admission check, and the laid paths (`laidProjectionPaths`). Only
      the memory test double's `machineLocalPersonalPath` (`helpers/store/refusals.ts`) needs code: it widens to refuse
      a `.internal` folder at every segment, as the key check does.
    - `checkRefKey` attaches one remedy to every `malformedKeyProblem` condition, and `storedKeyProblem`
      (`lib/store/ref/path-admission.ts`, which `decodeReference` in `codec.ts` calls) returns only a string, so naming
      the `.internal` remedy needs the problem to say which condition it is; the memory double's text matches it.
    - The tests that pin the old pattern change with it: `integration/store/projection/engine-walk.test.ts` (its
      private-root case, `work/.internal/secret.md`), `unit/store/projection/removal-residual.test.ts`,
      `integration/store/projection/materialization.test.ts` (`scratch/.internal/machine.md`), the contract suite's
      records (`helpers/store/suite-records.ts`), and `unit/lib/store/reference-personal-boundary.test.ts`, which runs
      on the memory backend.
    - The existing key cases live in `unit/lib/store/ref-key-admission.test.ts`,
      `integration/store-ref-key-admission.test.ts`, `unit/lib/store/reference-personal-boundary.test.ts`, and
      `unit/lib/store/registry.test.ts`.
    - Build `test-first` (one behavior at a time):
        - `scratch/a/.internal/x` is refused when written, as `scratch/.internal/x` is, and the refusal says to keep
          private files outside the repository, since `.internal/` at the identity root is ARC's.
        - A stored personal key with a `.internal` segment below its second refuses when read (`checkRefKey`) and
          decodes to nothing (`storedKeyProblem` through `decodeReference`).
        - `MACHINE_LOCAL_PATHS` holds `<identity>/.internal/**` and no `<identity>/*/.internal/**`, and the projection
          stops treating a `.internal` folder in `scratch/` as machine-local (`isMachineLocalProjectionPath`,
          `lib/store/projection/discovery-exclusions.ts`).
        - A file placed under `scratch/.internal/` is refused with the remedy named when write-back takes it in, rather
          than staying local unannounced.
        - A `.internal` folder below an identity's first-level folder is walked as personal files, and a file in one
          counts as unindexed when its worktree retires (`observeUnprojectedPersonalFiles`).

## **Phase 2:** The one-time cutover machinery

_Purpose:_ Delete the window's tooling first, since it imports the import transform, the ROADMAP remedy library, and the
parked-pointer records the later phases remove; then the import with `arc store migrate --import` and the code only it
reaches.

_Mode:_ `replication` through Phase 5 — closes when every census member is removed with its references and the tree
passes batch verification.

_Design decisions:_ `notes-cutover-tracked-state-removal.md` § Removal rules, § Removal order, § Removal mechanics, and
§ Removal decisions govern every phase of this segment.

### `[ ]` **2.1 The window's tooling — § 2.8**

- _Goal:_ Nothing of the window's tooling remains in source, tests, scripts, or lint configuration except what stays for
  other changes, the sealing guard's reach to `arc user load` and the provenance field on the in-repo composition's
  result, and the build, both type checks, and the test tiers pass without it.

    - `[ ]` **2.1.a Delete the tooling and its tests**
        - `src/scripts/cutover-window/`, `__tests__/helpers/cutover-window/`, and the window's tests:
          `e2e/cutover-window*.e2e.test.ts`, `integration/cutover-window-*.test.ts`, `unit/scripts/cutover-window/`, and
          `unit/scripts/cutover-window-*.test.ts`.
        - The root `package.json`'s `cutover-window` script.
        - What depends on the deleted files: the `createRefStore` allowlist entries for
          `cutover-window/account-records.ts` and `cutover-window/chain.ts` in
          `unit/lib/store/command-boundary.test.ts`, which compares every caller, and any suppression entries under the
          folder.

    - `[ ]` **2.1.b Remove its lint exemptions and references**
        - The four `subtree("scripts/cutover-window")` ignores in `eslint.config.js`, on the `store-production`,
          `store-raw-state`, `surface-names`, and `work-unit-paths` rows, and the two cases pinning them in
          `unit/eslint-architecture-config.test.ts`.
        - Search for the folder and the tooling's exported names outside the § 1 exemptions, and read the tooling's
          merge (`9d5c680661^1..9d5c680661`) for what it landed outside its folder.
        - What stays, while the notes commands are registered (§ 2.8): the sealing guard's call in `runUserLoad`
          (`commands/user/save-load.ts`) with its cases in `integration/store-imported-seal.test.ts`,
          `unit/sync.test.ts`, and `e2e/user.e2e.test.ts`; and `ComposedLifecycleIndexResult.provenanceBySlug`
          (`lib/work-unit/composed-lifecycle-index.ts`) with its cases in
          `unit/work-unit/composed-lifecycle-index.test.ts`, though the tooling was its only reader (§ 2.8). Once the
          notes commands are deleted, the seal's call and its cases go with `runUserLoad` when task 2.2 removes it.

### `[ ]` **2.2 The import transform and `arc store migrate --import` — § 2.7**

- _Goal:_ `arc store migrate` accepts no `--import` and reports no field only the import filled, its other modes
  (`--to`, `--trial`, `--leave-source`, and the reconcile with no target) behave as before, and no remedy names the
  option.

- _Note:_ The transform and its wiring are one task, landing in one commit, since `migrate-layout-build.ts` and
  `ref/commands.ts` import the transform (`notes-cutover-tracked-state-removal.md` § Removal order).

    - `lib/store/ref/import/`, with `integration/store-ref-import-*.test.ts`,
      `e2e/store-import-errands.e2e.test.ts`, and the `helpers/store/import-*.ts` helpers.
    - Code that only the transform still reaches goes with it, found by the sweep for code a deletion leaves without a
      caller (`notes-cutover-tracked-state-removal.md` § Removal mechanics). If the notes-specific sync was removed
      first, the notes helpers the transform imports are among what it checks: `mergeCrossWuFromNotes`,
      `projectManifest`, the notes-ref readers it uses (`notePathToCommit` among them), and `isAllowedFile`,
      `MAX_FILE_SIZE`, and `isSafeManifestPath` (`lib/git/user-sync.ts`); and so are the notes writers the import's and
      the window tooling's suites seed notes with, `runUserSave` and `runUserLoad` (`commands/user/save-load.ts`, used
      by `saveImportPersonal` in `helpers/store/import-fixture.ts`, `store-ref-import-notes.test.ts`, and
      `store-ref-import-personal-layout.test.ts`, and until task 2.1 by `integration/cutover-window-fixture.test.ts`),
      with the notes code they reach, when those suites are their last callers (§ 2.7). That code includes the note
      writer and reader of `UserIOContext` (`writeNote` and `readNote`, `commands/user/types.ts`), which
      `store-ref-import-notes.test.ts` and `store-ref-import-annotated-commit-loss.test.ts` also write notes through
      directly (`makeUserIO` in `helpers/integration.ts`). The dormant in-repo backend's `pushInRepo` and `pullInRepo`
      (`lib/store/in-repo/`) call both writers, so they stay while those calls do. The seal's calls in the two writers
      go with them, and so do the cases notes removal left that drive those calls, in `store-imported-seal.test.ts`,
      `unit/sync.test.ts`, and `e2e/user.e2e.test.ts`: they test the writers' own seal, so they do not count as callers
      (§ 2.8).
    - Six surviving suites carry import cases among others, and only those cases go:
      `integration/store-ref-failed-acquisition.test.ts`, `store-ref-persistent-configuration.test.ts` (its
      `--import` remedy argv), `store-ref-reader-lifetime.test.ts`, `store-ref-stray-history.test.ts` (the import
      destination), `store-ref-transaction-lock.test.ts` (the import landing lock), and
      `store-ref-remote-restart.test.ts` (the `refs/arc/tmp/migrate/import/kept/` ref it plants and asserts kept).
    - What stays: `helpers/store/migrate-command.ts` and `integration/store-ref-migrate-command-line-capacity.test.ts`,
      which drive `--to`, `--leave-source`, and the reconcile with no target; the store-imported seal with its tests
      (`store-imported-seal.test.ts`, `errand-store-imported-cli.test.ts`, `unit/lib/store/store-imported.test.ts`),
      less the writers' seal cases when the writers go; and `readRepositoryIdentity` and
      `readRepositoryCandidateSupersessionChain` (§ 2.7).
    - The option (`cli.ts`, `option.import` in `commands/store-input.ts`), the `import` field
      (`lib/store/commands.ts`), its dispatch and the validation messages that name it
      (`lib/store/ref/commands.ts`), `runStoreMigrate`'s import-source branch (`lib/store/create.ts`), and the
      mapping injection in `migratePorts` (`commands/store-migrate.ts`).
    - The contract parts only the import fills: `MigrateReportSchema`'s `move: "import"`, `reviewMapping`,
      `differingNotes`, `refused`, and `brokenChains`, which the layout move and the report's fallback write empty;
      the `import-refused` code and its handling (`commands/store-remote.ts`, `lib/store/ref/commands.ts`); and
      `RefStorePorts.importSource` and `reviewMapping` with their mapping types (`lib/store/ports.ts`).
    - The narrowed `MigrateReportSchema` parses no report stored before this change, since the layout move and the
      fallback wrote the removed fields empty: the move record, the copied report, which `prepareRemoteGathering` keeps
      until a new owner takes it, and the copy journal, all under `refs/arc/tmp/migrate/`. No reader for the old form is
      added, under the project's pre-release posture. Before the commit, list the refs under `refs/arc/tmp/migrate/` in
      the store's Git directory for each layout, as task 1.1.c reads it, on each of the owner's clones; if any is there,
      the import's kept refs among them, stop for the Owner, since deleting refs is the Owner's call (as in task 5.5).
    - The two constants `lib/store/ref/migrate-layout-build.ts` imports from the transform, with its exclusion of
      the import's transient refs.
    - The remedy that meets a checkout still tracking its state (`trackedStateRefusal`, `lib/store/selection.ts`)
      names the build of ARC that wrote that state without naming the option, with its assertion in
      `integration/store-selection-tracked-state.test.ts`.
    - The help summary ("Move or import state into the ref store", `lib/cli-help-summaries.ts`), and
      `QUICK-REFERENCE`'s `arc store migrate --import` lines and its heading's "or import", in both copies.
    - Tests that assert a removed report or refusal part: `e2e/store-commands.e2e.test.ts`,
      `integration/store-ref-layout-move.test.ts`, `unit/lib/store/migrate-notices.test.ts`,
      `integration/store-ref-follow-copy-handoff.test.ts` (`import-refused`), and the `ref/import/branch-tip.ts` row
      in `unit/eslint-ref-completed-failure.test.ts`.

### `[ ]` **2.3 The review mapping only the import reaches — § 2.7**

- _Goal:_ The surviving review tests write their stored records into the store directly and assert what they asserted
  before, and the mapping modules only the import reached are gone.

- _Note:_ This is the one task in the phase that is not deletion: the seeding is rewritten first, with the surviving
  tests passing while the mapping still exists (`notes-cutover-tracked-state-removal.md` § Removal rules).

    - `[ ]` **2.3.a Seed stored review records into the store directly**
        - Rewrite `storedLocalApproval` and `storedCandidateApproval` (`__tests__/fixtures/review-family-access.ts`) to
          run their review through the stored review ports (`bindNativeReviewPorts`,
          `helpers/store/native-review-ports.ts`) rather than mapping legacy gate files through `mapReviewRecords`, so
          the evidence, outcome, and decision records are the ones a store-backed review writes, as
          `fixtures/native-local-review.ts` (`prepareLocalReview` over the stored ports) and
          `fixtures/native-review-approval.ts` (approved dispositions composed as evidence) do. Candidate and
          integration-boundary records go through the review-kind writers, `writeCandidateRecord`
          (`lib/store/kinds/review/candidate/access.ts`) and `writeSubmissionBoundary`
          (`lib/store/kinds/review/integration-boundary/access.ts`), not the `lib/work-unit/` functions of the same
          names. The shape they return stays.
        - Move every surviving test that imports a removable mapping module onto the same seeding; the set is the
          fixture and 21 test files under `integration/`, `unit/handlers/`, `unit/lib/`, and
          `unit/scripts/review-gate/`. The tests that call a converter take a literal record: `mapReviewReplayDecisions`
          in `unit/handlers/review-pre-publication-store.test.ts` and `native-extra-pass.test.ts`, and
          `mapReviewBoundaryAction` in `native-extra-pass.test.ts` and `pre-publication-native-delivery.test.ts`.
        - Each test keeps what it asserts, an assertion on a value only the mapping produced following the native
          record, and passes with the mapping still in place.

    - `[ ]` **2.3.b Delete the mapping modules only the import reached**
        - In `lib/store/kinds/review/`: `mapping`, `mapping-boundary`, `mapping-boundary-actions`,
          `mapping-boundary-decisions`, `mapping-candidates`, `mapping-decisions`, `mapping-evidence`,
          `mapping-evidence-performance`, `mapping-operations`, `mapping-readiness`, `mapping-replay-decisions`,
          `mapping-response-source`, `mapping-result`, `mapping-source-listing`, `mapping-terminus-count`, and
          `mapping-work-items`, with their unit tests (`unit/lib/store/kinds/review/mapping*.test.ts`).
        - What only those modules reached: `mapping-listing` whole (`collectReviewMappingSources`,
          `reviewMappingListingEntry`, and the `ReviewMappingSource` type); `indexReviewMappingSources` with its private
          helpers (`decodeReviewMappingSource`, `indexOperation`, `indexFrontline`, and `indexReceipts`) and
          `mappingLegacyDurableRef` (`mapping-sources.ts`); and `mapping-types`, whose types the kept test helpers read
          (`ReviewMappingInput` and `ReviewMappingResult`) move into `fixtures/review-mapping.ts`.
        - The modules live review code reaches stay, through `mapReviewAttempt` (`mapping-outcomes`, called by
          `scripts/review-gate/lane-progress-outcomes.ts`): `mapping-outcomes`, `mapping-hosted`, `mapping-frontline`,
          `mapping-sources` (`ReviewMappingSources`, `mappingFrontlineOutcome`, and `mappingLocalOperation`), and
          `mapping-error`. Its tests all go with the mapping, so `mapReviewSource` takes a direct test of its own: it
          wraps a step's failure in a `ReviewMappingSourceError` naming the source and its joins, and passes one
          through.
        - `fixtures/review-mapping.ts` stays for `fixtures/native-frontline-review.ts` and
          `unit/handlers/review-next-pass-context.test.ts`, and `helpers/store/assert-review-mapping.ts` for
          `evidence/performance.test.ts`; `fixtures/review-mapping-boundary.ts` goes once nothing uses it. The review
          records' README (`lib/store/kinds/review/README.md`) describes the mapping that remains.

## **Phase 3:** The command surface

_Purpose:_ Remove each verb and option whose store arm refuses on every input or acts on nothing, with the code only it
reaches and every reference to it.

### `[ ]` **3.1 `arc park`, with `runPark` and the pointer record — § 2.1**

- _Goal:_ `arc park` is not registered, the lifecycle table has no park verb and still classifies every cell, nothing
  outside dormant code names it, and `runResume` with its tests works without `runPark`.

    - `[ ]` **3.1.a Seed `runResume`'s tests without `runPark`**
        - `integration/park-resume-roundtrip.test.ts`'s `parkAndShip`, which parks through `runPark`, becomes a test
          helper that writes what `runPark` left in a repository: the work unit's worktree torn down, its branch kept,
          and the pointer meta committed as `parkAndShip` commits it, written by the helper since `composePointerRecord`
          goes too. The roundtrip's resume cases keep their assertions, and task 3.1.b's E2E case seeds its parked state
          through the same helper.
        - The `runResume` cases in `unit/work-unit/verbs/park-resume.test.ts` already seed a parked state directly
          (`PARKED`) and stay as they are.

    - `[ ]` **3.1.b Remove the verb, the code only it reaches, and its references and tests**
        - The registration (`cli.ts`); `handlePark` with its helpers, `ParkCommandInputSchema`, and its registration
          (`handlers/lifecycle.ts`); and `createInRepoParkPlanningRetirementContext`
          (`lib/work-unit/direct-retirement-driver.ts`).
        - `runPark` with its park-only helpers and types (`lib/work-unit/verbs/park-resume.ts`), among them
          `ParkContext.planningRetirement` with `ParkPlanningRetirementContext`; `runResume`, `ParkResumeFs`,
          `parkResumeFsSeam` (which `handleResume` uses), and the resume types stay. So does `ParkContext` but its
          `removal` field, and `ParkResumeFs` but `writeFile` and `mkdir`, which only park used: `runResume` reads
          `ctx.composed`, `ctx.executor`, and `fs.rm`, `fs.readdir`, and `fs.rmdir`.
        - `lib/work-unit/pointer-record.ts`, and the landing half of `lib/work-unit/park-planning-landing.ts`
          (`landParkPlanningTransition`, `createInRepoParkPlanningLandingContext`, and their landing-only helpers and
          types), with `validateCommittedParkPlanningTransition`, which only tests call, and its cases in
          `integration/work-unit/park-planning-landing.test.ts`. Its strict form stays for
          `git-retirement-authorization-context.ts`.
        - `prepareGitRefVerification` (`lib/io-context.ts`), whose only production caller is `handlePark`, with its two
          cases in `integration/git-executor.test.ts` and its mock in `unit/handlers/lifecycle-verbs.test.ts`.
        - The lifecycle table (`lib/work-unit/lifecycle-transitions.ts`): `"park"` leaves `VERBS` with its `TRANSITIONS`
          rows and both `illegalCells("park", …)` blocks in `MARKED_ILLEGAL`, and the three rows that name park as their
          inverse (resume from parked, and start from planned and from parked) take `inverse: null`; the doc comment
          calling `start` park's inverse goes, and so do the module's other park mentions (the `park` ⊥ `resume`
          pairing, the park@Active and park@Planning example, and "mirroring `park@Planning`"). With it go
          `DISPATCH_MODE.park` and `"park"` in `CONTEXT_DEFAULTING_VERBS` (`lib/work-unit/verbs/dispatch.ts`), the
          `"park"` retirement label, and `"park-planning"` in `DirectTransitionConfig.transition`
          (`lib/work-unit/direct-retirement-driver.ts`).
        - Help (`lib/cli-help-content.ts`, `lib/cli-help-summaries.ts`), the input policy
          (`command-input-infrastructure-policies.ts`), `fixtures/command-input/no-input-matrix.ts`, and the `"park"`
          command paths in `unit/command-input/repository-inventory.test.ts`.
        - The store arm's `resume` case in `handleStoreStart` (`handlers/start-store.ts`) stays, since the start
          dispatch still types that arm, and its refusal stops naming parking.
        - Lint: `pointer-record.ts` in an `eslint.config.js` file set, its suppression entry, the recorded counts for
          `park-resume.ts` and `park-planning-landing.ts`, and the `runPark` arm of
          `eslint/projection-removal-binding.ts` with its row in `unit/eslint-projection-removal-binding.test.ts`.
        - Tests: `unit/work-unit/pointer-record.test.ts`; park's own cases in `park-resume.test.ts`,
          `integration/park-resume-roundtrip.test.ts` ("park@Active preserves the branch…"),
          `e2e/lifecycle-exit.e2e.test.ts`, `integration/work-unit/park-planning-landing.test.ts`,
          `unit/handlers/lifecycle-verbs.test.ts` (the `handlePark` block and its mocks of `park-resume.js` and
          `park-planning-landing.js`), `unit/work-unit/verbs/dispatch.test.ts`,
          `unit/work-unit/lifecycle-transitions.test.ts`, and `unit/work-unit/lifecycle-executor.test.ts` ("park@Active
          does NOT write the field…" among them); and `e2e/retirement-removal-check.e2e.test.ts`'s run of `arc park`
          under the override.
        - The cases that use park only as a stand-in for shared code move to a surviving verb and keep what they test,
          park's own text and the expected values that name its states following the surviving verb:
            - to `deactivate`, which also acts from Active and defaults to the current work unit: the
              `resolveVerbTargetOrReport("park")` cases in `unit/handlers/lifecycle.test.ts` and
              `unit/work-unit/store-read-consumers.test.ts`, the `selectVerbTarget("park", …)` cases in
              `dispatch.test.ts`, and "rejects a non-creation verb against a nonexistent slug" in
              `lifecycle-executor.test.ts`;
            - to `demote`, which declares a relocate leg from Planned, its fixture meta moving to Planned: "rejects
              before any mutation when a required leg operand is missing" in `lifecycle-executor.test.ts`;
            - to `abandon`, a verb with several from-states: "spans every valid from-state for a multi-source verb" in
              `dispatch.test.ts`, and "orders groups by the verb's valid from-state order" there on a two-entry index
              of its own whose slug order reverses `abandon`'s from-state order (`a-parked` and `z-provisional`), so
              it expects `Provisional` before `Parked` and fails if the groups follow the slugs;
            - to `runAbandon`, which shares the lint rule's arm with `runPark`: "rejects an opaque or absent context"
              in `unit/eslint-projection-removal-binding.test.ts`.
        - Park uses that set up a test of other code: "fails closed when historical abandon evidence does not bind the
          retiring branch" in `e2e/lifecycle-exit.e2e.test.ts` runs `arc park` only to reach a parked state, so it
          keeps its case and seeds that state through task 3.1.a's helper; and the three seeds that write
          `provenance: { verb: "park", … }` take `promote`'s, which also lands a work unit in backlog/planned
          (`unit/handlers/view-store.test.ts`, `unit/lib/decompose/revision-starter.test.ts`, and
          `integration/store-ref-withdraw-generic-format.test.ts`).
        - The pre-flip remedies that name `arc park` in dormant code stay, with the tests asserting them
          (`commands/store-command-support.ts`, `lib/locus/release.ts`, `lib/work-unit/verbs/pause-handover.ts`).

### `[ ]` **3.2 `arc resume --here`, `arc user open`, and `arc user close` — § 2.1**

- _Goal:_ None of the three is registered; `arc resume` without `--here` and the personal space keep working; and
  `runUserOpen` and `runUserClose` stay for the dormant arms that reach them.

    - `[ ]` **3.2.a `arc resume --here`**
        - The option (`cli.ts`) and its sentence in `arc resume`'s description; the `here` field and its option mapping
          (`ResumeCommandInputSchema`, `handlers/lifecycle.ts`), with `ResumeOptions.here`, `handleResume`'s in-place
          branch, which only the field reached, and its doc comment's "`--here` re-attaches in the current checkout";
          and the store arm's refusal toward `arc materialize --here`, with the
          `here` parameter of `runResumePaused` (`lib/work-unit/verbs/pause-handover.ts`) and `handleStoreResume`
          (`handlers/lifecycle-collaboration.ts`).
        - `runResume`'s in-place arm stays, with its library tests, since the dormant `arc start --here` reaches it
          (`resume`, `handlers/start.ts`).
        - Tests: the `--here` assertion in `unit/work-unit/verbs/pause-handover.test.ts`'s "resume clears only the
          section, repairs malformed structure, and refuses --here", which keeps its other assertions, and "dispatches
          an in-place runResume under `--here`" in `unit/handlers/lifecycle-verbs.test.ts`.

    - `[ ]` **3.2.b `arc user open` and `arc user close`**
        - The registrations (`cli.ts`); `handleUserOpen` with `resolveResidualStaleSubdir`, `staleSubdirPromptSite`, and
          its policy entry, `handleUserClose`, and both commands' input-schema registrations in
          `userCommandInputRegistrations` (`handlers/user.ts`), with their re-exports in `commands/user.ts`;
          `findStaleUserWuSubdirs` and `listUserWuSubdirContents` (`commands/user/open.ts`); and
          `reconcileRetiredSubdirsStandalone` (`commands/user/save-load.ts`).
        - `runUserOpen`, `runUserClose`, and `removeStaleUserWuSubdir` stay, unless task 1.1 found `runUserOpen` reached
          only through the verb; so do the mentions of `arc user close` in dormant code: `handleArchive`'s warning
          (`handlers/lifecycle.ts`), `closeWorkspaceAfterRecords`'s advisory (`lib/work-unit/lifecycle-executor.ts`),
          and `finishArchiveWorkspace`'s continuation argv (`lib/work-unit/verbs/archive.ts`).
        - References: help, `strategy-file-classification.md`'s mention in both copies, the comments in
          `lib/setup.ts`, `commands/user/add.ts`, and `commands/user/save-load.ts`, and `runUserOpen`'s doc comment,
          whose `{@link findStaleUserWuSubdirs}` names a removed function.
        - Tests: `integration/user-open-store-cli.test.ts`, which spawns `arc user open` throughout; the open and close
          cases in `unit/user-handlers.test.ts` and `e2e/user.e2e.test.ts`; the `find` and `list` cases in
          `integration/user.test.ts`; the `reconcileRetiredSubdirsStandalone` block in `unit/save-load.test.ts`; `user
          open:prompt.stale-subdir` and `user close` in `repository-inventory.test.ts`; and the user groups in
          `unit/lib/cli-help-coverage.test.ts`.
        - The emitted-command scan, "registers emitted corrective commands" in
          `integration/command-surface-documentation.test.ts`, which reads every source file for the `arc` commands it
          emits and refuses one that is not registered: it takes a named exemption for those three emitters, each
          matched by its file and `arc user close`, so it still refuses every other unregistered command. The
          exemption's comment says the arms are dormant, and each entry goes when its arm is deleted.

### `[ ]` **3.3 The title-keyed inbox operands and `arc user inbox-mark-execute-bound` — § 2.1**

- _Goal:_ A command takes an inbox entry only by its ID, no help describes an entry title, `arc agenda --errand` still
  tells an entry ID from free text, and `arc errand queue set` alone orders execute-bound captures.

    - `[ ]` **3.3.a `arc user inbox-mark-execute-bound`**
        - The registration (`cli.ts`), its handler, schemas, and policies (`handlers/user.ts`),
          `markCurrentInboxEntriesExecuteBound` (`commands/user/inbox-mutation.ts`, re-exported from
          `commands/user.ts`), and `markInboxEntriesExecuteBoundInOrder` (`lib/user-sync/inbox-writer.ts`), which only
          it reached.
        - Help, its row in `no-input-matrix.ts`, its command in the "Maintain notes and inbox:" group of
          `unit/lib/cli-help-coverage.test.ts`, `e2e/user-inbox-mark-execute-bound.e2e.test.ts`, the handler's case in
          `unit/handlers/store-inbox.test.ts`, and the mark cases in `integration/user-inbox-remove.test.ts`,
          "serializes concurrent mark and remove writers" among them.
        - Tests that marked an entry only to set up their fixture write the mark directly:
          `e2e/agenda-passivity.e2e.test.ts`'s fixture entry carries the ``- _Disposition:_ `execute-bound` `` line
          itself, so `--errand --next` still offers it; and the three cases in `unit/session-init/inbox-state.test.ts`
          that call `markInboxEntriesExecuteBoundInOrder` take literal marked content and keep their `runInboxState` and
          `extractReminderEntries` assertions, while their assertions on the mark's own normalization (Hold dropped,
          Remind kept, line endings) go with the function.

    - `[ ]` **3.3.b The title operands**
        - `arc user inbox-remove`'s `[slug]` positional, `--inbox-title-file`, and `--inbox-entry-file` (`cli.ts`),
          their fields and option mapping (`handlers/user-inbox-remove-input.ts`, `handlers/user.ts`), and the in-repo
          arm's title read in `handleUserInboxRemove`. The handler keeps the store arm's guard
          (`handleStoreInboxRemove`, `handlers/user-inbox-remove-store.ts`) and, after it, its schema parse:
          `UserInboxRemoveInputSchema` requires `--id` and `--expected-version`, and its refinements stop naming title
          sources. Under in-repo state, an input with `--id` refuses through the guard's pre-flip step, whose text stays
          as dormant text (`notes-cutover-tracked-state-removal.md` § Removal rules), and one without it passes the
          guard (`rejectLegacyIdOptions`) and refuses at the parse.
        - `runUserInboxRemove` (`commands/user/inbox-remove.ts`), whose only caller was that title read, with its
          re-export from `commands/user.ts`, the option and result types only it used (`commands/user/types.ts`), and
          its cases in `integration/user-inbox-remove.test.ts`; `removeCurrentInboxEntry`, which the dormant errand arms
          call, stays.
        - `--inbox-title-file` and `--inbox-entry-file` on `arc errand open` and `arc errand link`: their registrations,
          fields, and option mapping, and their pass-through (`handlers/errand.ts`, `handlers/errand-entry-storage.ts`).
          With them go the `file` input of `resolveInboxEntryOperand` and its file and standard-input reads
          (`lib/inbox-entry-operand.ts`), the `errand open` standard-input declarations on that file
          (`handlers/errand.ts`). The no-input matrix row that fed them (`errand open matrix --inbox-title-file -`) is
          rewritten to `errand open matrix --from-inbox "Matrix title"`, with no standard input and the same
          missing-entry refusal, since `errand open` keeps its development-build refresh site and the inventory requires
          a row for it. `--from-inbox` becomes required on `arc errand link`, as its one title source left:
          `ErrandLinkInputSchema` refuses a missing one with "Provide --from-inbox <entry>.", and the source-count
          refinements on both commands go (`titleSourceCount`, with "Provide exactly one inbox title source." and
          "Provide at most one inbox title source.").
        - `resolveInboxEntryOperand`'s ID check stays, since `arc agenda --errand` relies on its refusal to tell an
          entry ID from free text (`resolveErrandCapture`, `commands/agenda/errand-captures.ts`); its message stops
          naming title operands. `matchInboxEntryTitle` stays, and so does the in-repo arm's title read through
          `--from-inbox`.
        - Text that describes a title form: `--from-inbox <entry-title>` and `arc user inbox-remove`'s "Drop the
          title-matched USER-INBOX entry" (`cli.ts`), the resume remedies in `lib/errand/open.ts`, which name the file
          options and now name the ID form, and any help site task 1.1 placed here.
        - Tests: `unit/lib/inbox/operand.test.ts`'s case, the only direct test of the kept ID check, keeps its ID
          admission and literal-title refusal and drops its file operands and its file reads; the title cases in
          `unit/inbox-entry-operand.test.ts` and the `user-inbox-remove` and `store-inbox` tests; the errand
          e2e tests, `unit/errand/open-resume.test.ts`, "preserves explicitly selected inbox-title stdin" in
          `e2e/command-input-no-input.e2e.test.ts`, the sample usage naming `--inbox-title-file` in
          `integration/command-surface-documentation.test.ts`, and `unit/lib/cli-help-coverage.test.ts`.

### `[ ]` **3.4 The write-context classifiers `arc plan check` and `arc housekeep check` — § 2.1**

- _Goal:_ Neither command group is registered, and no shipped text tells an agent to run either.

- _Note:_ After this task and tasks 3.1 and 4.1, the write-context guard has no caller; it stays for the in-repo removal
  (`notes-cutover-tracked-state-removal.md` § Removal rules).

    - The registrations (`cli.ts`), `handlers/plan.ts` and `handlers/housekeep.ts`, their registry entries
      (`command-input-registrations.ts`), help, their entries in `cli-loading-boundary.test.ts` and the suppression
      record, and their tests (`e2e/plan.e2e.test.ts`, `e2e/housekeep.e2e.test.ts`,
      `unit/handlers/plan-draft-present.test.ts`, `unit/handlers/off-branch-write-context.test.ts`, and the
      `resolveDraftPresent` cases in `unit/work-unit/store-read-consumers.test.ts`), with
      `off-branch-write-context.test.ts`'s entry in the isolated unit-test list (`helpers/isolated-unit-mock-files.ts`).
    - Shipped text, both copies: `draft-design.md`'s planning-entry preflight and its `proceed` framing, keeping the
      work-unit check and the start, stub, and errand routes; and `QUICK-REFERENCE`'s `arc plan check` line with the
      comment above it.

### `[ ]` **3.5 `arc decompose --advance-base` and `--finish` given a map — § 2.1**

- _Goal:_ `arc decompose` takes no `--advance-base` and no map with `--finish`, its input schema has no field for
  either, and its store arm carries no refusal for either.

    - The registrations (`cli.ts`); `advanceBase` and the map form of `finish` in the input schema, with their option
      mapping and the handler branches only they reached, the `finish-preview`, `finish-apply`, and `advance-base`
      invocations (`handlers/decompose.ts`); the store arm's refusals (`handlers/decompose-store.ts`); and the mention
      of `--advance-base` in the schema's error message.
    - The old machine's handling stays (§ Non-Goals), and the in-repo `--finish` then refuses for want of a map
      (`finish-map-operand`).
    - Tests: the refusal cases in `decompose-store.test.ts`; the in-repo cases in
      `e2e/decompose-command-modes.e2e.test.ts` that drive `--advance-base` or `--finish <map>` through the CLI; the
      help listing in `e2e/decompose-dormant.e2e.test.ts`, which then shows `--finish` without a map and no
      `--advance-base`; the `handleDecompose` cases in `unit/handlers/lifecycle-verbs.test.ts` that pass `advanceBase`
      or a map `finish`; and the inputs carrying either in `unit/decompose-command-mode.test.ts`.

### `[ ]` **3.6 The options the store arms ignore — § 2.1**

- _Goal:_ No option on `arc activate`, `arc publish`, `arc teardown`, `arc active in-flight`, or `arc errand check` is
  accepted and ignored, and no shipped text tells an agent to pass one.

- _Note:_ The shared handler code passes what each option's absence meant, and a test that passed an option only to set
  up its fixture keeps its case, the fixture supplying what the option's absence reads
  (`notes-cutover-tracked-state-removal.md` § Removal rules); the in-repo `arc activate` then refuses every input for
  want of `--task`.

    - `[ ]` **3.6.a `arc activate --task`, `arc publish --last-completed`, and `arc teardown --force`**
        - The registrations (`cli.ts`) and help; the fields and their option mapping (`ActivateCommandInputSchema.task`,
          `PublishCommandInputSchema.lastCompleted`, and `TeardownCommandInputSchema.force`, `handlers/lifecycle.ts`);
          and the handler's pass-throughs: `task` into `runActivate`, `lastCompleted` into `publishCandidate`'s
          `runPublish` call (`handlers/lifecycle-delivery-review.ts`), and `handleTeardown`'s `abandoned` mode for
          `--force`.
        - Live text that names a removed option: both refinement messages in `TeardownCommandInputSchema`,
          `handleTeardown`'s `--branch` refusal and doc comment, `TeardownOptions.force`, `handleActivate`'s doc comment
          naming `--task`, `handlePublish`'s doc comment naming `--last-completed`, and the two comments in
          `lib/work-unit/lifecycle-transitions.ts` that defer teardown to `arc teardown --force` (the third, in park's
          row, goes with it in task 3.1).
        - Shipped text, both copies: `QUICK-REFERENCE`'s `arc activate`, `arc publish`, and `arc teardown` lines, the
          comment above `arc publish`, which becomes "--action overrides the boundary read the verb makes on its own",
          and `prepare-work-unit.md`'s instruction to pass `--last-completed`.
        - Tests: `handleActivate`'s `task` and `handlePublish`'s `lastCompleted` cases in
          `unit/handlers/lifecycle-verbs.test.ts`; `--task` in the store-arm CLI tests, which pass it outside the
          override (`integration/store-clash-scenarios.test.ts`, `store-current-claim-cli.test.ts`,
          `store-dependency-lineage.test.ts`, `store-dependency-tie.test.ts`, and `store-lifecycle-reuse.test.ts`); and
          the activation case in `e2e/retirement-removal-check.e2e.test.ts`, whose base-branch refusal the in-repo arm
          no longer reaches.
        - The non-park cases in `e2e/lifecycle-exit.e2e.test.ts` that run `arc teardown mono --force` after an abandon
          drop the option and keep their cases, since the in-repo arm then defaults to the abandoned mode
          (`runTeardown`, `lib/work-unit/verbs/teardown.ts`): "arc abandon → commit → teardown --force preserves a
          retained primary projection" and the four cases under the "arc teardown --force — the four silently-broken
          behaviors" comment. Their titles, that comment, and the file header's account of the force mode stop naming
          `--force`.
        - The publication suites' fixtures, which pass `--last-completed` only to publish their work unit:
          `e2e/integrate-base-movement.e2e.test.ts`, `e2e/publication-spine.e2e.test.ts`, and
          `e2e/publication-post-ready-pass.e2e.test.ts` drop the option, and in each fixture task list a completed
          parent task (``### `[x]` **1.1 Verification**``) replaces the `- [x] Verification complete` line, so in-repo
          `arc publish` reads its last completed work there (`readLastCompletedWork`, `lib/work-unit/verbs/publish.ts`).
          Placed above that line instead, the parent would hold it as an anonymous checkbox, which the scanner refuses.

    - `[ ]` **3.6.b `--local` and `--no-fetch` on `arc active in-flight` and `arc errand check`**
        - The registrations (`cli.ts`); for `arc active in-flight`, the `local` and `fetch` fields of
          `ActiveInFlightCliOptions` (`handlers/active.ts`), which has no input schema of its own, and for `arc errand
          check`, the `local` and `fetch` fields of its options and of `ErrandCheckInputSchema`, with their option
          mapping (`handlers/errand.ts`); and the `localOnly` derivation in `handleActiveInFlight` and
          `handleErrandCheck`, which pass `localOnly: false`. The in-repo arms' local-only handling in the library
          stays.
        - `in-flight-scope-check.md`'s "(offline, or `--local`)", both copies, and the cases in
          `unit/handlers/active.test.ts` and `errand-check-live-branches.e2e.test.ts` that test the local-only read.
          `e2e/errand.e2e.test.ts`'s "reports an open Errand's edit to another checkout's check, never to its own"
          passes `--local` only incidentally and has its own bare remote to fetch, so it drops the option and keeps its
          case.

## **Phase 4:** The hook checks, their keys, and the ROADMAP remedy

_Purpose:_ Remove every pre-commit check whose input is a tracked ARC state path, with the scripts and keys only they
use, and the ROADMAP conflict remedy with every surface that installs or invokes it, in one change.

### `[ ]` **4.1 The lifecycle hook checks and the scripts only they run — § 2.2, § 2.6**

- _Goal:_ The pre-commit hook, in both copies, runs no check whose input is a tracked ARC state path, and the rules
  those checks carried still refuse at the store write.

    - `[ ]` **4.1.a Remove the eight checks from the hook**
        - `CHECK[meta-file-shape]`, `CHECK[cohort-consistency]`, `CHECK[roadmap-regeneration-assert]`,
          `CHECK[roadmap-regeneration-trigger]`, `CHECK[foreign-write-advisory]`, `CHECK[contributor-protected-files]`,
          `CHECK[task-list-staging]`, and `CHECK[task-numbering]`, from `arc/system/.internal/githooks/pre-commit` and
          its `.arc/` copy, kept byte-identical.
        - With them, the lines that served only them: the `arc_role` read, the contributor notice, and
          `skip_source_only_check`. `pm_mode` stays until task 4.3 removes its last reader.
        - The hooks `README.md`, both copies: the removed checks' text, the two warnings it lists for checks nothing
          implements ("Meta file not advanced when committing a completed parent task" under commit-msg, and "Task list
          staged with completions but sibling meta file not co-staged" under pre-commit), and § Role-Aware Behavior
          rewritten to the one role-aware behavior left, the commit-msg contributor footer warning.
        - The tests that read the hook's text or run the hook, which change with its checks: in
          `unit/scripts/pre-commit-shell-invocation.test.ts`, the "foreign-write advisory backstop wiring" and "ROADMAP
          regeneration assert wiring" blocks whole and any other case that selects or quotes a removed block; their
          cases in `integration/pre-commit-installed-validators.test.ts` over both hook paths ("skips the lifecycle
          checks…" among them) and `e2e/check-pre-commit-hook.e2e.test.ts`, and "selects the cohort check for a staged
          planned meta" in `integration/pre-commit-state-deletion.test.ts`.

    - `[ ]` **4.1.b Delete the scripts only they run**
        - `scripts/validate-meta-spec.ts`; `scripts/validate-cohort-consistency.ts` with
          `lib/active/cohort-live-context.ts` and the parts of `lib/active/cohort-consistency.ts` only it reaches
          (`metaCohortDir` and its helpers stay); `scripts/assert-roadmap-regenerated.ts` with the assert-only part of
          `lib/status/roadmap-regeneration-assert.ts` (`assertRoadmapRegenerated`, its verdict and input types,
          `CONFLICT_MARKER_RE`, and `ROADMAP_RERENDER_COMMAND` with its instruction); and
          `scripts/check-foreign-writes.ts`.
        - Their tests (`unit/scripts/validate-meta-spec.test.ts`, `integration/pre-commit-current-workflow.test.ts`,
          both `validate-cohort-consistency.test.ts` files, `unit/scripts/assert-roadmap-regenerated.test.ts`, and
          `unit/scripts/check-foreign-writes.test.ts`), and their cases in shared tests, with the imports only they
          used: `integration/in-flight-reshuffle.test.ts`, `unit/work-unit/store-read-consumers.test.ts`, the
          `assertRoadmapRegenerated` block of `unit/status/roadmap-regeneration-assert.test.ts` and the call to it in
          that file's `renderRoadmapFromIndex` block, which keeps its other assertions until task 4.4.c, and the two
          hook-parity cases in `integration/status-project.test.ts`.
        - `buildCohortMembership` (`lib/work-unit/lifecycle-membership.ts`), whose only caller was
          `cohort-live-context.ts`, with its block in `unit/work-unit/lifecycle-membership.test.ts`;
          `isArchivalTriggeredWithDescendants` stays for archive.
        - Comments in kept code that name a removed check: `{@link checkCohortConsistency}` in
          `lib/active/current-workflow-consistency.ts`, and "the cohort-consistency validator" in
          `lib/work-unit/lifecycle-index.ts` and `lib/work-unit/lifecycle-membership.ts`.
        - Lint: their suppression entries, `validate-meta-spec.ts` in `eslint.config.js`, and its row in
          `eslint-architecture-rows.test.ts`.

    - `[ ]` **4.1.c Confirm the rules survive in their homes**
        - `task-list.segmentation` refuses a numeric third task segment; `cohort.member-sections` refuses a hand edit
          naming an orphan member section, with `reportOrphanCohortMemberSections` and its tests kept; the meta kind's
          write checks keep the field-block and stage rules; and `lint:md:descriptors` still lints the task-list
          template. Their existing tests pass unchanged.

### `[ ]` **4.2 `hooks.contributor_protected_paths` and `hooks.task_numbering` — § 2.2**

- _Goal:_ Neither key is in the configuration schema, its validator, or the shipped configuration, and a configuration
  that still holds one draws the unknown-key warning.

    - `lib/config/schema.ts`, `commands/config/validate.ts`, `arc-config.yml` in both copies, and the hooks
      `README.md`'s configuration rows in both copies.
    - Tests: `unit/config/schema.test.ts`, the `hooks.task_numbering` line in `fixtures/config/cases.ts`, from which its
      `PASS` count derives, and the `hooks.task_numbering` samples in `integration/config.test.ts` and
      `unit/config/status-reader.test.ts`, moved to another `hooks.*` key.

### `[ ]` **4.3 The ROADMAP conflict remedy, in one change — § 2.5, D6**

- _Goal:_ The remedy command, its library, base merge's remedy application, and the hook's remedy block leave in one
  commit, so no hook is ever left calling a command that is gone, and the type checks pass at that commit.

    - `[ ]` **4.3.a Move the hook-copy identity case out of the remedy tests**
        - The case in `pre-commit-shell-invocation.test.ts` that keeps the project and packaged hook copies identical
          sits inside the remedy's `describe`; move it out, so it outlives the remedy.

    - `[ ]` **4.3.b Remove the remedy and every surface that invokes it, in one commit**
        - `arc hook-remedy-roadmap-conflict` (`cli.ts`, its input policy in `command-input-registrations.ts`, and
          `scripts/remedy-roadmap-conflict.ts`) and `lib/status/roadmap-conflict-auto-remedy.ts`.
        - `arc base merge --regenerate-roadmap` and base merge's remedy application: the option,
          `baseRegenerateRoadmapPolicy`, and `"option.regenerate-roadmap"` in `baseCommandInputRegistrations`
          (`handlers/base.ts`), with the `base merge` entry in `baseCommandInputPolicyDeclarations`, which keeps no
          site; `conflictRemedy` through `scripts/base/merge.ts` and `scripts/base/merge-composition.ts`; and the
          `regenerable-refused` result arm only the remedy produces.
        - The remedy block in `CHECK[merge-conflict-markers]`, in both hook copies; `run_arc_cli` stays for
          `validate_frontmatter`, and `pm_mode` goes once nothing reads it. The hooks `README.md`'s remedy text, both
          copies.
        - The workflow text the `review-gate-workflows.test.ts` cases below assert: `regenerable-refused / stop` in
          `integrate-work-unit.md` and `run-errand.md`, both copies. Their dispatch of the dormant
          `reconcile-regenerable` next action stays, which that test still asserts.
        - Tests: `integration/scripts/remedy-roadmap-conflict.test.ts`,
          `unit/status/roadmap-conflict-auto-remedy.test.ts`; the remedy's `describe` in
          `unit/scripts/pre-commit-shell-invocation.test.ts` ("runs the package-portable remedy before generic marker
          rejection" and "keeps failed remedies and remaining markers as hard errors"); the remedy cases in
          `unit/handlers/base.test.ts`, `unit/scripts/base/merge.test.ts`,
          `unit/scripts/base/merge-composition.test.ts`, and `e2e/base-merge-hooks.e2e.test.ts` (its ROADMAP remedy
          row); the `regenerable-refused` keys of the two `satisfies Record<BaseMergeResult["state"], …>` maps in
          `integration/review-gate-workflows.test.ts`, with the `regenerable-refused / stop` text those cases assert;
          the entries in `cli-loading-boundary.test.ts`, `reach/store-suites.json`, `no-input-matrix.ts`,
          `init.test.ts`, `join.test.ts`, and `e2e/run-cli.e2e.test.ts`; and `hook-remedy-roadmap-conflict` in
          `HOOK_COMMANDS` (`integration/store/projection/tracked-state-hooks.test.ts`).
        - "offers a reconcile for an advance over the regenerable projection alone" under the checkpoint's own base read
          (`e2e/integrate-base-movement.e2e.test.ts`) takes the checkpoint's continuation, `arc base merge …
          --regenerate-roadmap`: it keeps its assertion of the offer, as its twin under a bound delivery plan does, and
          drops the continuation and what follows it.
        - The dormant emitters of `--regenerate-roadmap` and the `reconcile-regenerable` next action stay
          (`scripts/integration/checkpoint.ts`, `scripts/integration/errand-merge.ts`).

### `[ ]` **4.4 The ROADMAP merge driver and `arc status --project --staged` — § 2.5**

- _Goal:_ No install path writes the ROADMAP merge driver or its attribute, `arc status --project` takes no `--staged`
  or `--write` and keeps no staged render, and the ROADMAP render helpers nothing reaches are gone.

    - `[ ]` **4.4.a The merge driver**
        - `ROADMAP_MERGE_ATTRIBUTE`, `ROADMAP_MERGE_DRIVER_NAME`, `ROADMAP_MERGE_DRIVER_COMMAND`, and
          `configureRoadmapConflictRemedy`, with what only it reaches (`setLocalGitConfigWithRetry`,
          `GIT_CONFIG_RETRY_DELAYS_MS`, and `RoadmapConflictRemedySetupOptions`, `lib/setup.ts`). Its callers:
          `configureGitIntegration`'s call with `GitIntegrationOptions.enableRoadmapConflictRemedy` and `arc init`'s
          argument for it (`commands/init.ts`), which `arc join` reaches through the same function, and `arc update`'s
          direct call (`commands/update.ts`).
        - The attribute writer, `writeArcGitattributesBlock` (`lib/template/files.ts`, re-exported by
          `lib/template/index.ts`), with its `.gitattributes` case in `unit/template/files.test.ts`.
        - This repository's `.gitattributes` line `.arc/backlog/ROADMAP.md merge=arc-roadmap`, with its managed block if
          nothing else is in it.
        - Tests: `unit/setup.test.ts`, `init.test.ts`, and `join.test.ts`. The delivery eligibility tests
          (`helpers/delivery-eligibility-arrangement.ts`, `integration/delivery-disjoint-eligibility.test.ts`) keep
          their test-local driver under a name other than `arc-roadmap`.

    - `[ ]` **4.4.b `arc status --project --staged` and `--write`**
        - The options (`cli.ts`) and help (`lib/cli-help-content.ts`), whose "Project rendering:" heading goes when no
          option is left under it, with its pins in `unit/lib/cli-help.test.ts` and `e2e/run-cli.e2e.test.ts`, the
          latter's pin on `--write`'s "requires omitting --json" among them.
        - The `staged` and `write` fields, their refinements, their option mapping, and the `staged` doc comment
          (`StatusCommandInputSchema`, `handlers/status/input.ts`); the in-repo staged branch with
          `handleStagedProjectStatus`, the store arm's refusal, and the module header's mention of staged rendering
          (`handlers/status/views.ts`); and `resolveStagedTransitionOverlays`
          (`lib/status/roadmap-regeneration-assert.ts`), whose other caller left with the assert script.
        - The markdown contract's derived-readiness remedy, which names `--staged --write` (`diagnosticRemedy`,
          `lib/markdown/contracts.ts`), so that diagnostic carries no remedy, with `unit/markdown/contracts.test.ts` and
          the `whatToDo` in `unit/markdown/format-plan.test.ts`.
        - `strategy-concurrent-work.md`, both copies: the bullet on a commit blocked because the readiness view "wants"
          a row, which ends in the rerender command, and the clause saying the pre-commit regen check refuses a stale
          render. The rest of the doctrine's rewrite is the documentation change's.
        - Tests: the `--staged` cases in `integration/status-project.test.ts` and
          `unit/handlers/status/store-project.test.ts`, and the `resolveStagedTransitionOverlays` block in
          `unit/status/roadmap-regeneration-assert.test.ts`.

    - `[ ]` **4.4.c The ROADMAP render helpers nothing reaches**
        - In `lib/status/roadmap-regeneration-assert.ts`: `renderRoadmapFromIndexResult`, `renderRoadmapFromIndex`,
          `withTrailingNewline`, `RoadmapIndexRenderResult`, and `ROADMAP_PATH`, which only the assert check, the
          remedy, and the staged render used, with their test blocks. `renderRoadmapFromIndexViewResult` and the
          index-backed view it renders from (`createIndexProjectViewFs`) stay; the module header and that function's doc
          comment stop naming the pre-commit check. Its own block in `unit/status/roadmap-regeneration-assert.test.ts`,
          which takes `renderRoadmapFromIndex` as its oracle, stays and asserts against `view.result.markdown` instead,
          keeping its transition-row cases, and its titles and comments stop naming the hook and the `--staged`
          path.
        - Tests that used a removed helper as the oracle for dormant code take
          `renderRoadmapFromIndexViewResult(...).result.markdown` with a trailing newline appended:
          `integration/archive-staging.test.ts`, which compares staged blob bytes, and
          `unit/status/in-repo-render-identity.test.ts`, whose expectation is
          `fixtures/status/in-repo-render-identity.json`.

## **Phase 5:** The planning lane, the merge-gate recipe, and the notice

_Purpose:_ Remove everything that classifies a change as planning-only by its tracked paths, with the recipe built
around that lane, then add the changelog notice and remove the window's leftovers from the owner's clones.

_Exit criterion:_ The census at this branch's head, with `main` merged in, finds no surface of the classes it walks that
the flip made refusal-only, inert, or vacuous, outside the shares § Non-Goals names; the build, both type checks, the
unit, integration, E2E, and content tiers, and the link audit pass; the reference search finds a removed surface only
where § 1 exempts it; and § 2.10's leftovers are gone from each of the owner's clones that held them.

### `[ ]` **5.1 The planning-grooming command and its routing input — § 2.3, D11**

- _Goal:_ No caller can assert the planning lane: the planning-grooming command is gone, `planning-grooming` is not a
  surface authority, no routing path produces `auto-eligible-planning`, and every review record in this repository's
  store still parses.

    - `[ ]` **5.1.a Remove the planning-grooming command**
        - `scripts/review-gate/policy/planning-grooming-command.ts`,
          `scripts/review-gate/core/planning-grooming-command-schema.ts`, and the planning-grooming envelope in
          `scripts/review-gate/core/review-command-envelope.ts`.
        - Its registrations and mentions: `cli.ts`, `handlers/review.ts`, `handlers/review-request-schema.ts`,
          `core/register-review-schemas.ts`, `review-command-envelope-registry.ts`, `review-command-mode.ts`,
          `runtime/project-identity-remedy.ts`, `command-input-infrastructure-policies.ts`, `lib/cli-help-content.ts`,
          and `lib/cli-help-summaries.ts`.
        - Tests: `planning-grooming-command.test.ts`, its schema IDs in `helpers/production-schema-ids.ts` and
          `unit/kernel/authored-metadata.test.ts`, and the command's cases in the CLI surface, help, schema
          registration, inventory, and no-input tests; tests asserting that shipped text names no planning-grooming
          stay.

    - `[ ]` **5.1.b Remove `planning-grooming` from the routing input**
        - The tests that iterate the enum's options (`routing-totality.test.ts`) or pass the value change with it:
          `integration/review-policy-native-context.test.ts`, `integration/review-gate-workflows-code-review.test.ts`,
          `unit/scripts/review-gate/policy/routing.test.ts`, `pre-publication-request.test.ts`,
          `unit/scripts/review-gate/review-semantic-schemas.test.ts`, `unit/handlers/review.test.ts`, and
          `unit/handlers/review-local-store.test.ts`, with its case asserting the refusal the last behavior below
          removes.
        - Build `test-first` (one behavior at a time):
            - `SurfaceAuthoritySchema` (`scripts/review-gate/policy/routing-schema.ts`) refuses `planning-grooming`, and
              so does every schema that embeds it, `ReviewRoutingFactsSchema` among them.
            - Documentation routing for a self-owned or ownerless artifact takes the routine documentation route
              (`reduceReviewRoutingBase`, `scripts/review-gate/policy/routing.ts`), and no input produces
              `auto-eligible-planning`.
            - A stored standard-review requirement carrying `auto-eligible-planning` still parses
              (`CoreRoutingReasonSchema`, with its entry in `routing-reason-facts.ts`).
            - `LocalReviewRoutingInputSchema` no longer carries the refusal whose remedy names the removed command.

    - `[ ]` **5.1.c Parse every stored review record under the changed schemas**
        - With an uncommitted script that lists each review kind in this repository's store through its read port, parse
          every record through its kind's parser and confirm each parses, the hosted review requirement for pull request
          #932 among them; record the script's command and the count in `notes-cutover-tracked-state-removal.md` §
          Removal decisions.

### `[ ]` **5.2 `arc review planning-lane`, the lane attestation, and the merge-gate recipe — § 2.3, § 2.4, D10**

- _Goal:_ Nothing in the CLI or CI attests a planning lane, no project installs the merge-gate recipe, and nothing
  installed names it.

    - `[ ]` **5.2.a `arc review planning-lane` and the lane attestation**
        - The registration (`cli.ts`), its schema, registration, and handler (`handlers/review.ts`), its help and policy
          entries (`lib/cli-help-content.ts`, `lib/cli-help-summaries.ts`, `command-input-infrastructure-policies.ts`),
          and `scripts/classify-change.sh`'s `planning-lane` command, which calls it, with its usage text and header
          lines.
        - `.github/workflows/arc-lane-attestation.yml`, with its entry in the coupling audit's corpus
          (`corpus.repoRootDelta`, `audits/coupling-blast-radius/manifest.json`), and what only it runs:
          `confirm-live-change-pair.sh` (`system/.internal/scripts/`, both copies) with its `init-recipe.json` entry,
          manifest entry, scripts `README.md` entry in both copies, `integration/confirm-live-change-pair.test.ts`, and
          `LIVE_PAIR_SCRIPT` (`helpers/run-script.ts`).
        - Tests: in `review-gate-workflows.test.ts`, "retains only the lane attestation from the retired review-gate
          family", the hosted `runs-on` loop's read of `arc-lane-attestation.yml`, "records a terminal verdict on both
          classifier arms without vetoing either", and the other assertions on the attestation workflow; the
          `classify-change.sh planning-lane` block in `integration/classify-change.test.ts`, and "keeps local and hosted
          exact-ref verdicts aligned for generic transition records" in
          `integration/decompose-v3-repository-plan.test.ts`, which runs both commands; the command's cases in
          `unit/handlers/review.test.ts` and `e2e/review-cli-surfaces.e2e.test.ts`; its row in
          `no-input-matrix.ts` and command path in `repository-inventory.test.ts`; and the "Clear planning changes:"
          group in `unit/lib/cli-help-coverage.test.ts`, whose heading goes with its last command; and
          `unit/lib/cli-help.test.ts`'s "wraps qualifiers beside long registered command terms at 80 columns", which
          builds `planning-lane <base> <head>` with its real summary and takes a surviving registered command with
          operands as its stand-in.
        - In the same commit as the script's deletion, the live-pair script's paths leave the two recipe cases in
          `review-gate-workflows.test.ts` that read it, "ships the merge-gate host-policy inventory with live-pair
          support" and "keeps every shipped host-policy asset byte-identical to its project mirror", which task 5.2.b
          then trims to the files that survive.
        - References: `strategy-review-projection.md`'s account of the attestation workflow's skip and guard, and
          `TECHNICAL-OVERVIEW.md` § 3 Infrastructure's merge-gating entry.

    - `[ ]` **5.2.b The merge-gate recipe, whole**
        - Both copies of `reference/templates/arc/merge-gate/` and
          `system/workflows/arc/supplemental/setup-merge-gate.md`, with their `init-recipe.json` entries and their
          entries in `.arc/system/.internal/manifest.json`.
        - The cases in `review-gate-workflows.test.ts` that read recipe files: "ships the merge-gate host-policy
          inventory with live-pair support", "arms no auto-merge from the planning classifier", "keeps every shipped
          host-policy asset byte-identical to its project mirror", and "keeps authoritative transition history
          review-owned across merge-gate surfaces"; each keeps its guards on files that survive, such as
          `.github/CODEOWNERS` and `run-errand.md`.
        - The references, both copies: `initial-setup/01_verify-and-configure.md`'s two onboarding offers and their link
          definitions, § Auto-Merge Lane's mentions of the recipe and its link definition in
          `strategy-work-organization.md`, the recipe's entry in `reference/templates/arc/README.md`, and any link in
          `draft-design.md`; and the coupling audit's path entry (`lib/coupling-audit/surface-classifier.ts`). Links to
          § Auto-Merge Lane itself stay.

### `[ ]` **5.3 The CI lane, the planning classifier, and the CODEOWNERS block — § 2.3**

- _Goal:_ CI classifies no lane and still runs every job a pull request needs, `lib/change-facts.ts` exports no planning
  classifier, and this repository's CODEOWNERS carries no auto-merge block or description of one.

    - `[ ]` **5.3.a The classifier and CI's lane**
        - `isPlanningArtifactPath`, `isPlainPlanningContentChange`, `classifyPlanningPaths`, `classifyPlanningLane`, and
          the `lane` path projection with its `lane-paths` command (`lib/change-facts.ts`). `isIntegrationTargetPath`
          drops its planning-path exclusion in the same change, and its "does not target the planning record" cases for
          `.arc/active/` artifacts and transition records go (`notes-cutover-tracked-state-removal.md` § Removal
          decisions).
        - `scripts/classify-change.sh`'s `lane` command and its usage text; its other commands stay.
        - `ci.yml`: the `classify` job's `lane` output and steps, the lane in its name, its comment, and the `ci-ok`
          line, and the `lane == 'reviewed'` conditions on the integration, store, E2E, and portability jobs, simplified
          rather than left comparing an empty output, which would skip each job while `ci-ok` counts it passed. The
          `*/cutover-flip)` cases stay.
        - Tests: the `lane` command's cases in `classify-change.test.ts`, the lane cases in
          `unit/lib/change-facts.test.ts` and `integration/change-facts.test.ts`, and in `review-gate-workflows.test.ts`
          the assertion of the lane call and the job conditions "pins the focused ARC contract slice and light-only CI
          invocation" pins, which compare `needs.classify.outputs.lane`.

    - `[ ]` **5.3.b The CODEOWNERS block**
        - `.github/CODEOWNERS`'s "Auto-merge lane: per-WU / per-cohort planning artifacts (UNOWNED)" block goes, and its
          header describes the ownership that remains.

### `[ ]` **5.4 The changelog notice — D7**

- _Goal:_ A project updating past this change learns from `arc update` every removal that asks something of it: the
  retired merge-gate recipe and the CI job to drop, the removed commands and options, the retired configuration keys,
  the retired ROADMAP merge driver, and the hook change.

    - An entry in `packages/arc-framework/changelog/versions.json`, keyed by the version `package.json` names when this
      change lands and dated the landing day, with one line under `highlights` and the removals under `breaking`, with
      no compatibility alias. It is shipped text: it names no work unit.

### `[ ]` **5.5 The window's leftovers, removed by hand with the owner present — § 2.10, D5**

- _Goal:_ The window's leftovers are gone from each of the owner's clones that held them, removed by a step the owner
  watches, with no shipped code.

- _Note:_ A stop for the Owner, since it deletes refs and configuration. It runs only after task 1.1.a confirmed the
  window closed and its import of the held delivery work, and after task 4.4 removed the driver's installer.

    - On each of the owner's clones, list and then, with the owner's approval, delete the six residue refs § 2.10 names,
      any hold under `refs/arc-window/`, leftover machine-local `STATUS.USER.md` files, and the local
      `merge.arc-roadmap.*` configuration; record each clone, what was found, and what was deleted.
    - For a clone this session cannot reach, the evidence is the owner's confirmation, recorded as such.
    - `spike/delivery-rebuild-continuity-model` and the `delivery-candidates` namespace stay (D5).

### `[ ]` **5.6 The inventory exhausted** — validate exit criterion at segment scope

- _Goal:_ The segment's exit criterion holds at this branch's head with `main` merged in, the head terminal verification
  starts from; verification runs the census again if the head moves after.

    - Merge `main` in, then run § 2.11's census at that head, and confirm again that no personal ref holds a key with a
      `.internal` segment, at its tip or in its history.
    - Run `arc check segment`, then the merge gate with its CI-only checks (`arc check gate merge --ci`), which adds the
      build and the store suites the push gate leaves out, and the integration, E2E, and portability tiers, which the
      local merge gate otherwise leaves to CI (`ci_only`); with them the integration content tier and `lint:arc:links`.
    - Run the § 1 reference search over tracked files outside `docs/`, placing every hit under an exemption.
    - Confirm task 5.5's record covers each of the owner's clones.

## **Phase 6:** Verification

### `[ ]` **6.1 Complete verification** — load and follow `verify-work-unit.md`

---

## Success Criteria

- `[ ]` The census at the verified head, with `main` merged in, finds no surface the flip made refusal-only, inert, or
        vacuous outside the shares § Non-Goals names (task 5.6).

- `[ ]` The pre-commit hook, in both copies, has no check whose input is a tracked ARC state path and no ROADMAP remedy
        block, and the configuration schema has neither `hooks.contributor_protected_paths` nor `hooks.task_numbering`.

- `[ ]` The CLI registers no `arc review planning-lane`, `arc review planning-grooming`, `arc
        hook-remedy-roadmap-conflict`, `arc plan`, `arc housekeep`, or `arc park`, listed or hidden, and no `arc store
        migrate --import`.

- `[ ]` Nothing of the window's tooling remains in source or the shipped scripts but the sealing guard's reach to `arc
        user load` and the provenance field on the in-repo composition's result (`ComposedLifecycleIndexResult`).

- `[ ]` `task-list.segmentation` refuses a numeric third task segment, `cohort.member-sections` refuses a hand edit
        naming an orphan member section, and `lint:md:descriptors` lints the task-list template.

- `[ ]` `ci.yml` classifies no lane, `scripts/classify-change.sh` has no `lane` or `planning-lane` command,
        `lib/change-facts.ts` exports no planning classifier, `arc-lane-attestation.yml` is gone, and CODEOWNERS carries
        no auto-merge block and no description of one.

- `[ ]` `init-recipe.json` installs no merge-gate file and no script only the lane attestation ran, and nothing it
        installs names a removed command, option, check, or key.

- `[ ]` `SurfaceAuthoritySchema` has no `planning-grooming`, no routing path produces `auto-eligible-planning`, and
        every review record in this repository's store, the requirement for pull request #932 among them, parses (task
        5.1.c).

- `[ ]` `MACHINE_LOCAL_PATHS` holds the identity root's `.internal/` and no `<identity>/*/.internal/**`, a personal key
        with a `.internal` segment at any depth is refused with the remedy named, and no personal ref holds such a key,
        at its tip or in its history (tasks 1.1.c and 5.6).

- `[ ]` A search of the repository's tracked files outside `docs/` finds a removed command, option, key, exported
        symbol, or file path only in D7's changelog entry, the point-in-time records § 1 exempts, tests that assert a
        removed surface is absent, the dormant code § Non-Goals keeps, and the old decomposition machine.

- `[ ]` The six residue refs, any `refs/arc-window/` hold, leftover `STATUS.USER.md` files, and the local
        `merge.arc-roadmap.*` configuration are gone from each of the owner's clones that held them (task 5.5).

- `[ ]` All quality gates pass: the build, both type checks, the unit, integration, and E2E tiers, the content tier,
        and the link audit.

- `[ ]` Ready for integration.
