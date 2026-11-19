# Notes: Cutover Tracked-State Removal

## Task generation

- The inbound items this unit held keep the numbers they had in `storage-cutover`'s buffer. Each is designed in the
  spec, moved with the internal collapse to `cutover-in-repo-removal`, or handed on by the spec's Non-Goals;
  `cohort-storage-cutover.md` names the shares of the items that span members (#1, #10, #26).
- The inbound entry "Remove `verify-integrity.sh`'s meta-shape check" was declined at the spec's review: the script's
  § 7 reads projected files a refused or unsent hand edit can still leave malformed, so it stays (the spec's
  § Non-Goals).
- Review stop rule for this unit's planning loops (Owner, 2026-11-10): stop when a pass's findings include no
  critical or major one that survives verification, and return to the Owner after three independent passes either
  way.
- Spec changes at task generation (Owner, 2026-11-17), made before activation:
    - The Success Criteria opened "On this change's merged head", but verification runs before the merge, so they
      now name the verified head with `main` merged in, and § 2.11's last census run says the same.
    - Criterion 1 read "finds no surface … that refuses on every input, acts on nothing, or passes vacuously". It
      now names what the flip made refusal-only, inert, or vacuous, matching § 1, so a surface that was idle before
      the flip, for reasons of its own, does not fail it.
    - Goal 1's carve-out reads "removes or rebuilds", and § Non-Goals keeps delivery's commands for its rebuild:
      § 2.1's rule otherwise takes much of the delivery group, since from the flip no path writes a plan.
    - The boundary stays whole with the census figures (D2), and § 2.3, § 2.5, § 2.7, and § 3 carry what the census
      found: the classifier still answers `planning` for an empty or deletion-only diff, the window's tooling imports
      the import and the remedy library, and the review mapping only the import reaches goes with it.
- Spec changes at the task list's grounding audit (2026-11-17), before activation:
    - A removed option takes its input-schema field with it (Owner, 2026-11-17). The draft rule kept the field for the
      dormant arm, but `repository-inventory.test.ts` requires every field of a command's input schema to map to a
      registered option, so it would have failed the unit tier at about fifteen fields. § 1 states the rule, and
      § Non-Goals' decompose bullet, § 2.1, and § 2.5 follow it; keeping the fields under an exemption in that test is
      the rejected alternative.
    - § 2.7: the mapping writes five review kinds, each re-seeded through its own writer, and the tracked-state refusal
      keeps its remedy without naming the option. § 2.8: the provenance field stays, as `cutover-window-tooling`'s spec
      § 13 assigns it to `cutover-in-repo-removal`.
    - § 2.9 and § 2.11: before the flip the integration checkpoint wrote under `<identity>/<work-unit>/.internal/`, and
      once the pattern narrows such a folder left on disk is projected and holds up retirement, so the census checks
      each checkout for one.
    - § 2.1 keeps the ID check `arc agenda --errand` relies on, § 2.3 drops `isIntegrationTargetPath`'s exclusion,
      and § 2.5 takes the staged render with its options and leaves the derived-readiness diagnostic without a remedy.
- Spec changes at the task list's independent review (2026-11-17), before activation: Goal 5 and criterion 2 name the
  provenance field § 2.8 keeps beside the sealing guard's reach, and criterion 7 names the E2E tier, which every E2E
  test runs on the in-repo arm and CI runs at the merge gate. § Non-Goals and § 2.7 also take the notes writers the
  import's and the window tooling's test suites seed notes with (`runUserSave` and `runUserLoad`) when
  `cutover-notes-removal` lands first: under its rule that a test whose subject survives counts as a caller, it keeps
  them for those suites, which leave here. § 2.8's seal on `arc user load` then goes with `runUserLoad`. Notes removal
  now lands after this change (its `Depends On`, set at its create-spec), so this applies only if that edge is dropped,
  and then only once the dormant in-repo backend's calls to the two writers (`pushInRepo`, `pullInRepo`) are gone.

## Census before task generation

Run 2026-11-17 against the flip's branch head (`9d7f885774`), before its switch to the ref backend and its help-text
rewrite were committed, so each surface was judged by its store arm. Every known member held, with the loci the task
list names. What it settled beyond the spec's lists:

- **Shares, not members:** the delivery group, `arc review status --work-unit`, and `arc review terminus accept`
  (§ Non-Goals); `ci.yml`'s `*/cutover-flip)` override arms, which `cutover-in-repo-removal` removes with the override;
  and the notes-era `arc user` verbs, which `cutover-notes-removal` removes.
- **Live, on a close call:** `platform.type`, which no code reads but agents read from the configuration; and
  `arc status --local` and `--no-fetch`, which cancel an explicit `--fetch`.
- **Not judged at that head, so task 1.1 judges them at the flip's landing:** `arc sync`'s `-y`, `--dry-run`, and
  `--json`, which had no store arm yet; the rows traced only through the flip's own tables (`arc locus`, `arc task
  defer`, `arc handoff --to`, `arc agenda`'s flags, and `arc view --current`, `--path`, and `-e`); `runUserOpen`'s reach
  (§ 2.1); and the CLI-spawning tests of removed surfaces, which ran the in-repo default before the switch.
- **Found, outside this change:** the commit check's `Context:` resolver doesn't search `active/current/`, where the
  nested layout projects the current task list. It is captured as an Errand to land before the flip merges.

## Removal rules

- **An option goes with its input field.** Its registration, its field in the command's input schema, its option
  mapping (`schemaFields`), its help, every reference, and the code only that field reached go: a handler branch, a
  store-arm refusal or pass-through, a file or standard-input read, and the interaction declaration and no-input
  matrix row that covered that read. Library code a dormant arm still reaches through other inputs stays and no
  longer receives the option. Where a handler passed the option to code both arms share, it passes what the option's
  absence meant: `publishCandidate` gets no `lastCompleted`, `handleTeardown` no `mode`, and `handleErrandCheck` and
  `handleActiveInFlight` pass `localOnly: false`.
- **A dormant arm whose only input was a removed field refuses every input.** In-repo `arc activate` refuses for want
  of `--task`, in-repo `arc decompose --finish` for want of a map (`finish-map-operand`), and in-repo
  `arc user inbox-remove`, whose input now requires `--id`, through the store arm's guard; none keeps a read of the
  removed input. A CLI test that drove a removed option under the in-repo override loses that case when it tests
  what the option did, as when the arm refuses once the option is gone: the dormant machinery keeps its own library
  tests. A test that passes the option where the arm takes the same path without it drops the option and keeps the
  case, as the spec's Testing rule has it: `lifecycle-exit.e2e`'s `teardown --force` cases, which abandon first (task
  3.6.a), and `errand.e2e`'s overlap case, whose remote fetches (task 3.6.b). A test that used a removed option or
  verb only to set up its fixture keeps its case, and the fixture supplies the state directly: in the publication
  suites' task lists a completed task replaces the checkbox line, so in-repo `arc publish` reads its last completed
  work there (task 3.6.a); one helper writes the parked state `arc park` left, for the park-resume roundtrip and an
  E2E abandon case (tasks 3.1.a and 3.1.b); and `agenda-passivity.e2e`'s entry carries its execute-bound mark (task
  3.3.a).
- **A test that uses a removed verb only as a stand-in for shared code moves to a surviving one.** It keeps what it
  tests, and the removed verb's own text and the expected values that name its states follow the surviving verb. Park's
  stand-ins move to `deactivate`, `demote`, `abandon`, or `runAbandon`, each named with its cases in task 3.1.b; a case
  about park itself goes.
- **A verb goes with its handler and what only that handler reaches.** Library code a dormant arm also reaches stays:
  `runUserOpen` through the executor's workspace effect and the worktree scaffold, and `runUserClose` through teardown.
  Park's landing half (`park-planning-landing.ts`) goes because only `arc park --land` reaches it.
- **Park leaves the lifecycle table whole.** Its rows are reached only through `runPark`, so `"park"` leaves `VERBS`
  with its `TRANSITIONS` rows, both `illegalCells("park", …)` blocks in `MARKED_ILLEGAL`, `DISPATCH_MODE.park`,
  `CONTEXT_DEFAULTING_VERBS`, and the `"park"` retirement label, and the totality test still classifies every cell.
  The three rows that name park as their inverse, resume from parked and start from planned and from parked, take
  `inverse: null`, since no other verb inverts them. The unit tests of `runResume` already seed a parked state
  directly; the roundtrip's `parkAndShip` runs `runPark`, so it becomes a helper that writes what `runPark` left:
  the worktree torn down, the branch kept, and the pointer meta committed, since `runPark` and `composePointerRecord`
  both go.
- **Dormant code keeps its text.** A pre-flip remedy or doc comment in dormant code that names a removed surface stays
  with the tests that assert it (§ 1's exemption): `arc park` in `commands/store-command-support.ts`,
  `lib/locus/release.ts`, and `pause-handover.ts`; `arc user close` in `handleArchive`, `closeWorkspaceAfterRecords`,
  and the continuation argv in `lib/work-unit/verbs/archive.ts`; the steps in `lib/store/pre-flip-steps.ts`; "Activation
  requires --task" in `runActivate`; and the `--finish <cut-map>` remedy in `handlers/decompose.ts`. So does the
  workflows' dispatch of the dormant `reconcile-regenerable` next action (`run-errand.md`, `integrate-work-unit.md`),
  which leaves with that action. A comment in code that stays live and names a removed check or option is a reference,
  and goes. Where a surviving check reads that text as a live command, it takes a named exemption that goes with the
  dormant arm: the emitted-command scan for the three `arc user close` sites (task 3.2.b).
- **The write-context guard keeps no caller.** Once `arc plan check`, `arc housekeep check`, `arc park`, and
  `check-foreign-writes.ts` go, nothing calls `resolveWriteContext` or `classifyPathSurface`. The spec keeps the
  guard for `cutover-in-repo-removal`, so it isn't a miss.
- **The review mapping's test seeding.** `review-family-access.ts` and 21 surviving test files seed stored review
  records through `mapReviewRecords` or a mapping module the import alone reaches. The mapping writes five kinds. The
  seeding helpers run their review through the stored review ports instead (`bindNativeReviewPorts`,
  `helpers/store/native-review-ports.ts`), so the evidence, outcome, and decision records are the ones a store-backed
  review writes through `createReviewEvidencePort`, `createReviewOutcomePort`, and `createReviewDecisionPort`, as
  `fixtures/native-local-review.ts` (`prepareLocalReview` over the stored ports, with its `GitCommonStatePublisher`) and
  `fixtures/native-review-approval.ts` (approved dispositions composed as evidence) do. Candidate and
  integration-boundary records go through the review-kind writers, `writeCandidateRecord`
  (`lib/store/kinds/review/candidate/access.ts`) and `writeSubmissionBoundary`
  (`lib/store/kinds/review/integration-boundary/access.ts`), not the `lib/work-unit/` functions of the same names.
  `storedLocalApproval` and `storedCandidateApproval` keep the shape they return, which 13 tests read. The tests that
  call a converter (`mapReviewReplayDecisions`, `mapReviewBoundaryAction`) take a literal record. Each test keeps what
  it asserts, an assertion on a value only the mapping produced following the native record, and passes before the
  modules go.

## Removal order

- The window's tooling goes first: it imports the import transform's readers, `applyRoadmapConflictAutoRemedy`, and,
  in its test helpers, `composePointerRecord`.
- The import's wiring goes before the review mapping, whose only production importer is `arc store migrate --import`.
- The hook's remedy block, the remedy command, its library, and base merge's remedy application land in one commit
  (D6). The ROADMAP render helpers that only the assert check, the remedy, base merge, and the staged render reached
  go after all four.
- `hooks.contributor_protected_paths` and `hooks.task_numbering` leave the schema after the hook stops reading them.
- Each subtask commits on its own, and its commit passes the commit gate and leaves the test tiers green. What depends
  on what a subtask deletes or changes changes in that subtask: a production importer, a test importer, a path
  allowlist, and a test that asserts its text or reads its file. So `command-boundary.test.ts`'s allowlist leaves with
  the window's tooling (task 2.1.a); the import's wiring is one task with the transform it imports (task 2.2); park's
  tests and references leave with the verb (task 3.1.b); the hook's pinning cases leave with its checks (task 4.1.a),
  and `integration/status-project.test.ts`'s hook-parity cases with the assert script (task 4.1.b); the
  `regenerable-refused` keys in `review-gate-workflows.test.ts` and the workflow text they match leave in the remedy's
  one commit (task 4.3.b); and the live-pair script's paths leave the recipe cases with the script (task 5.2.a).
- Several tasks edit the same shared files, each its own cases: `store-read-consumers.test.ts` (3.1, 3.4, 4.1),
  `fixtures/command-input/no-input-matrix.ts`, `repository-inventory.test.ts`, and the help tests (most tasks of
  Phases 3–5), and `review-gate-workflows.test.ts` (4.3, 5.2, 5.3).

## Removal mechanics

- Cite files and symbols, not line numbers: the census at the flip's landing re-reads them at a different head.
- Edit shipped files in the package source (`packages/arc-framework/arc/`), carry the same edit to `.arc/`, keep the
  two hook copies byte-identical, and refresh the changed files' hashes in `.arc/system/.internal/manifest.json`.
- A search for command strings misses the path-keyed registries: `eslint-suppressions.json`, the rows in
  `eslint.config.js` and their pinned tests, the lint rules under `packages/arc-framework/eslint/` and their tests,
  `cli-loading-boundary.test.ts`, `fixtures/command-input/no-input-matrix.ts`,
  `unit/command-input/repository-inventory.test.ts`'s command-path lists, the help tests that pin headings
  (`unit/lib/cli-help.test.ts`, `unit/lib/cli-help-coverage.test.ts`, `e2e/run-cli.e2e.test.ts`),
  `helpers/production-schema-ids.ts`, `reach/store-suites.json`, the coupling audit's corpus paths
  (`audits/coupling-blast-radius/manifest.json`), and the isolated unit-test list
  (`helpers/isolated-unit-mock-files.ts`), which a unit test leaves when it is deleted or loses its last `vi.mock`.
  Search file paths and exported names too. It also misses the emitted-command scan ("registers emitted corrective
  commands", `integration/command-surface-documentation.test.ts`), which reads every source file for the `arc` commands
  it emits and fails on one no longer registered, so every task that unregisters a command runs it.
- A list a task gives of the tests to change names its known members. At each task, search the whole test tree
  (`unit/`, `integration/`, `e2e/`, `fixtures/`, and `helpers/`) for every removed command, option, and asserted text,
  and trace the command lines kept code builds for a test to run, such as the integration checkpoint's continuations;
  the type checks find the remaining importers. The commit and push gates run neither the integration nor the E2E
  tier, so each task runs the integration and E2E files that search finds
  (`arc-offload npm run -s test:file -- <files>`).
- After a task's deletions, check each kept symbol the deleted code imported for a production importer left, and remove
  one with none, with its tests, unless dormant code § Non-Goals keeps reaching it, the spec keeps it for another
  change, as it keeps the write-context guard (§ Removal rules), or a later task of this change removes it, as task 2.3
  removes `mapReviewRecords` after the import's wiring leaves it no importer. Search all of `src/` for the importers,
  since a dormant arm in another handler may be the one left, as `arc start --here` is for `runResume`'s in-place arm.
  Nothing else finds such code: `noUnusedLocals` ignores exports, and the search for removed names finds references to
  them, not the code they leave behind.
- After a deletion, run the whole-project `lint:ts`; when it names an unused suppression, re-run it with
  `--prune-suppressions` and commit the smaller record.

## Removal decisions

Calls the task list's grounding audit settled, each the one the spec allows:

- **`isIntegrationTargetPath`** drops its planning-path exclusion. `.arc/active/` artifacts and transition records
  then classify as integration targets, but from the flip they are untracked and no diff carries them, so the
  "does not target the planning record" cases for those two paths go and the `backlog/` and `completed/` cases stay
  (`PLANNING_RECORD_GLOBS`).
- **The derived-readiness diagnostic** keeps no remedy: `diagnosticRemedy`'s `markdown.derived-readiness` arm
  (`lib/markdown/contracts.ts`) goes, with its assertions in `unit/markdown/contracts.test.ts` and the `whatToDo` in
  `unit/markdown/format-plan.test.ts`.
- **The attribute writer** the spec names is `writeArcGitattributesBlock` (`lib/template/files.ts`, re-exported by
  `lib/template/index.ts`), which only the driver's installer calls; it goes with `setLocalGitConfigWithRetry`,
  `GIT_CONFIG_RETRY_DELAYS_MS`, `RoadmapConflictRemedySetupOptions`, and
  `GitIntegrationOptions.enableRoadmapConflictRemedy`.
- **The delivery eligibility tests** keep a test-local merge driver, renamed off `arc-roadmap`: they prove delivery
  lands a regeneration without a custom driver, which is delivery behavior that stays.
- **The changelog entry** carries the landing day as `date`, one line under `highlights`, and the removals under
  `breaking` (`ChangelogEntry`, `lib/changelog.ts`).
- **The stored review records** are read by an uncommitted script that lists each review kind through its read port
  and parses every record; no registered command reads them all. Task 5.1.c records the script's command and the
  count here.

## At archive

- Close the storage-coupling register rows whose last share this change completes, each with a witness to the row's
  whole fate (`cohort-storage-cutover.md` § Register shares):
    - **Auto-merge planning classification by tracked prefix:** the classifier commands, the classifier, the CI
      workflow, the CODEOWNERS block, and the merge-gate recipe gone (the spec's Success Criteria 2–5).
    - **Lifecycle hook checks:** the hooks and their checks gone, with `task-list.segmentation`,
      `cohort.member-sections`, and `lint:md:descriptors` kept in their homes (Success Criterion 2). `cutover-flip`'s
      spec § 17.2 assigns this change the row's closure.
    - **`STATUS.USER` file, offline cache, and notes sync:** the status rendered on demand (`handleStoreUserStatus`,
      `handlers/status/store-user.ts`); the file kept out of projection discovery (`isExcludedProjectionFile`,
      `lib/store/projection/discovery-exclusions.ts`) and out of the window's import (`importPersonalExcluded`,
      `lib/store/ref/import/personal-disk.ts`, deleted with the transform); and the window's leftover files removed
      (Success Criterion 8).
- Retire `planning-lane-relief`: `cohort-state-storage.md`'s register holds its retirement with the classifier for
  this change.
