# Spec (`detailed` · `RFC`): test-suite-reliability

- **Origin:** [internal]

- **Purpose:** Make the CLI package's test suite pass reliably on GitHub's 4-vCPU hosted runners and cut what it
  costs, by fixing tests that spend real work where a fake proves the same behavior, rather than by raising timeouts
  or adding runners.

---

## Introduction / Context

CI runs on GitHub's 4-vCPU hosted runners (2 cores with SMT). The suite was sized for a retired self-hosted pool, and
on hosted runners it fails and drags in ways that tax every later change. The figures below come from the hosted base
run `37411629163` (`main` at `90946d4aa`) unless stated otherwise.

- **Unit tests run near Vitest's 5 s default.** Run `37417731917` failed its first unit attempt on two tests at that
  default and passed on rerun. In that attempt, nine unit tests under the default took 2 s or more, the two failures
  among them. Four of the nine, in three files, now carry explicit timeouts: the retained-producer case in
  `ci-build-transfer.test.ts` (30 s), and the whole-tree scans in `lib/store/in-repo-boundary.test.ts` (two tests)
  and `active/meta-reader-inventory.test.ts` (`REPOSITORY_SCAN_TIMEOUT`, 15 s). That removed none of the work.
- **Four order- or environment-dependent failures:**
    - `focused-lint-staged.test.ts` asserts `tsc`'s plain diagnostic form, which `FORCE_COLOR` turns into the pretty
      form, so `npm test` reads red in a shell that sets it.
    - `makeNativeBuildFixture` copies `src` recursively and races the transient `*.bundled_*.mjs` file that
      `loadSchemaProducer` (through bundle-require) writes beside `src/scripts/build-schema.ts`.
    - `build-inputs.test.ts` bundles the schema producer under the 5 s default.
    - `build-generation-lifetime.test.ts` parses `.arc-build.lock` with a raw `JSON.parse` while the owning process
      renews it, and `renewAdvisoryLock` (`advisory-lock.ts`) rewrites the holder in place with `writeFile`, so a
      read can see an empty file. Run `37489414096`, the first push to `main` after the timeouts above landed,
      failed its unit job this way ("Unexpected end of JSON input").
- **The unit tier carries integration-shaped work.** The 59 native-tooling files (the build, CI-build, dev-build,
  dev-check, Vitest-runtime, local-Vitest, focused-test, focused-lint, and test-cost families) sum to 658.9 s of the
  708.6 s summed file time of the `unit` and `unit-mocks` projects, and their 29 slowest to 639.1 s. The largest,
  `ci-build-recovery.test.ts`, takes 75.6 s alone and bounds any shard. `strategy-testing-methodology.md` § Test Tiers
  already bars child processes and git repositories from unit tests; these files predate any enforcement of that line.
- **E2E oversubscribes the runner.** `command-input-no-input.e2e.test.ts` alone holds 302% CPU (383 CPU-s, about
  126 s wall on 4 emulated CPUs). Paired with `publication-spine.e2e.test.ts`, the two take 165 s together against
  127–132 s apart. That contention is why native E2E sharding measured no faster: hash membership co-locates heavy
  files.
- **Every built-CLI spawn in this repository pays the self-hosting staleness check.** The `preAction` hook in
  `cli.ts` runs `checkDevBuildStaleness` whenever `src` sits beside the built `dist`, and its
  `readBuildQualification` re-hashes every recorded build input. Two local probes of a real `check commit-msg` spawn
  (best of six each) measured 0.80 s with the check against 0.42 s without, and 0.53 s against 0.28 s: 0.25–0.38 s
  per spawn. At the last recorded count of 1,815 E2E CLI spawns (`analysis-test-suite-cost-baseline.md`), that is
  roughly 450–690 CPU-s against E2E's 1,807 s summed file time.
- **Declared and executed `--no-input` behavior can drift apart.** Each prompt site declares an `automation.noInput`
  policy, and its handler separately hand-codes what happens when interaction is forbidden. No test compares the two.

Hosted runners bill nothing, but wall time is the merge latency for every pull request, and a flaky required check
trains reruns. Parallel work in a second checkout runs the suite locally too, where contention compounds all of the
above.

## Goals

- **Reliable on hosted runners.** The full workflow passes on its first attempt, with no unit rerun, and unit tests
  keep at least half their timeout as headroom.
- **Hermetic.** Test outcomes do not depend on test order, on concurrent transient files, or on output-format
  variables in the developer's shell.
- **Cheaper, measured.** Native-tooling unit cost, E2E cost, hosted wall time, and summed test-job time each fall by
  a fixed fraction against a baseline recorded before any optimizing change.
- **The tier lines hold.** The testing policy states the rules this work applies, and the unit tier's no-spawn line
  is enforced by a runtime guard rather than by review.
- **One source of `--no-input` behavior.** Each prompt site's declaration is what executes when interaction is
  forbidden.
- **Budget overage is visible** where reviewers look, without failing a pull request.

## Non-Goals

_Frozen at activation; changes after that append: `Amended YYYY-MM-DD — <delta> — <prompt>`_

- **Integration-file optimization** beyond absorbing the real runs relocated from unit. Integration sits off the
  critical path after its two-shard split.
- **Decomposition tests and machinery**, including the 120 s `integration/decompose-v3-repository-plan.test.ts` and
  `decompose-v3-refusal-source-totality.test.ts`, which stay as they are. § 3's survival rule still classifies
  `decompose-v3-authority-boundary.test.ts`, a source-scan test.
  Amended 2026-10-06 — A2: permit named timeout sizing for the two measured refusal-source-totality cases, preserving
  every assertion, scan, and decomposition behavior — bounded implementation adjustment.
- **Which tests a change selects when it touches Markdown**, and **rewrapping prose pins**. They concern selection
  and pin matching, not suite cost or reliability.
- **Failing a pull request on its test budget.** Budget overage becomes visible only.
- **Interaction-context fallbacks in handlers that never prompt**, including all 17 in `handlers/review.ts`.
- **The shipped `testing-standards` `.default`.** This work edits only the project override and the project
  strategy.
- **CLI behavior changes** beyond the prompter's surfaced drift fixes (§ 7) and the managed-run staleness skip
  (§ 4).
- **A raised Vitest timeout default** for any tier, or **larger or self-hosted runners** in place of cutting the work.
  § 5's shard counts are layout choices that its adoption bar judges.
- **A shared cached parse for the source-scan tests**, unless § 3 step 5's measurement earns it.
- **Typed decompose refusal reasons.** The refusal `reason` stays `z.string().min(1)` (`decompose-v3-refusal.ts`).

## Proposed Design

One rule runs through every phase: **prove decision logic below the real stack, against fakes at the seams the code
already has or against the function that decides it, keep one real run per distinct outcome class, and stop spending
real work on properties the compiler or linter already enforce.**

Phases run in this order: 0, 1, 2, 3, 4, 6, 5, 7, then the closing measurement. § 6's spawn guard follows § 2 so its
allowlist records what still spawns, the § 5 layout trial follows the CPU work it depends on, and the prompter is the
final phase. Counts and loci below were taken on `main` when this specification was written. Task generation
re-enumerates them against the success criteria.

### 0. Baseline and measurement

Before any phase that changes test cost or CI layout, the work records a baseline on its own branch, and every cost
criterion scores against it.

- **Frozen baseline (A1):** retain the observations already collected at
  `88fefb20c43ac580855c5a4d0e6f0232a21e1361`, including failed attempts. No further pre-fix sampling is required.
  Failures remain failures, and diagnostic runs never substitute for ordinary samples.
- **Local:** schema v4 `benchmark:test-cost` captures, tier-isolated, 12 workers, and a 10% noise band. Unit and
  integration use their three successful runs and medians. E2E uses its one successful ordinary run as a
  single-sample reference; retain the failed second attempt separately. Record per-file and summed file time,
  sample counts, and uncertainty. Every later local measurement retains the same instrument and settings (A1).
- **Hosted:** retain the three completed full-suite `workflow_dispatch` attempts at the frozen head, with their
  conclusions, first-attempt status, job elapsed times, file durations, and unit test durations and timeouts.
  The baseline medians include all three attempts, including the failed unit job; do not replace it with a retry.
  The layout is one unit job, two integration shards, and four anchored E2E shards, with `run_portability_pair`
  off so Windows and macOS legs never enter a duration (A1).
- **Per-test unit durations** are incomplete on hosted runs today: the unit job's default reporter prints per-test
  lines only for slow tests, as log text that carries no timeouts. The unit job (and each unit shard, if § 5 shards
  it) adds Vitest's built-in `json` reporter and uploads the report as a run artifact, so every test's duration is
  retained in machine-readable form. It names all three reporters (`default`, `github-actions`, `json`): a
  command-line reporter list replaces Vitest's defaults, which add `github-actions` and its failure annotations only
  when no reporter is named. `runLocalVitestTier` already forwards extra Vitest arguments (`run-local-test-tier.ts`).
  The report carries each test's metadata but not its timeout, so this phase adds the setup file both unit projects
  share (§ 6 extends it). For each test it records the effective timeout in the test's metadata: Vitest's
  `task.timeout`, which is the test's explicit timeout, else its project's default. The baseline and the reliability
  criterion read the same data.
- The baseline is recorded in `notes-test-suite-reliability.md` with run IDs and the instrument's capture paths
  before the first optimizing phase begins. Every later measurement uses the same instruments and settings.

Terms used by the criteria:

- **Run duration** is a workflow run's elapsed time from start to completion, as GitHub reports it. A run that carries
  the results cache's merge-and-save job (§ 5) ends instead when its last other job finishes: that job waits on every
  test job, and pull request runs never carry it.
- **Summed test-job time** is the sum of the elapsed times of a run's unit, integration, and E2E jobs.
- **Native-tooling cost** is the summed file time, across the `unit`, `unit-mocks`, and `integration` projects, of
  test files whose names begin `build-`, `ci-build-`, `dev-build-`, `dev-check`, `vitest-`, `local-vitest-`,
  `focused-`, or `test-cost-`. A real run relocated from unit keeps its family prefix, so the measure follows it into
  integration and relocation alone saves nothing. At the frozen head, integration includes `build-inventory` (A1).

### 1. Flakes and hermeticity

- `focused-lint-staged.test.ts` runs `scripts/check-ts-quality.sh` with a child environment that clears
  `FORCE_COLOR`. The script's developer-facing output is unchanged.
- The two fixtures that copy live `src` directories recursively, `makeNativeBuildFixture` (all of `src`) and
  `makeFocusedLintFixture` (`src/scripts` and `src/lib`), copy through one shared helper. It keeps the recursive copy
  of what is on disk, with a `cp` filter that skips bundle-require's transient `*.bundled_*.mjs` files, so the copy
  never reaches for a file that vanishes mid-copy. Both directories receive transients during the unit tier
  (`build-inputs.test.ts` bundles `src/scripts/build-schema.ts`; `build-ownership.test.ts` bundles
  `src/lib/build-ownership.ts`). Copying what is on disk keeps dirty trees working: a tracked-file list
  (`git ls-files`) would still name a deleted, unstaged file and would omit a new untracked module.
- A test that reads a lock file a live holder may be renewing reads it tolerantly: an empty or unparsable read is
  "not yet readable" and is retried, as the lock module's own `readHolderSettled` does, and every read of the
  renewing file sits inside the retry. This covers `build-generation-lifetime.test.ts` (both reads),
  `build-cancellation.test.ts` (its two parses of the live lock), `build-ownership.test.ts` (its reads of the
  admission and artifact locks while their owners hold them), and the inner test that `focused-test-runtime.test.ts`
  writes, which reads the admission lock while the focused controller holds it. The in-place write in
  `renewAdvisoryLock` is unchanged: its own readers already tolerate it.
- Heavy real work that remains in the unit tier carries a named, explicit timeout, the `REPOSITORY_SCAN_TIMEOUT`
  idiom already in `kernel/import-boundary.test.ts`, `command-input/registry.test.ts`,
  `lib/store/in-repo-boundary.test.ts`, and `active/meta-reader-inventory.test.ts`. The tier's 5 s default is not
  raised: a raised default hides the next misplaced test.
- Fixed timing windows inside fixture scripts are re-sized. The 2 s readiness deadline that proves file parallelism
  (`focused-test-execution.test.ts:61`) fails when a loaded runner starts the second worker late, so its bound
  derives from the test's own timeout. The 300 ms exclusivity hold (`:85`) and the injected 800 ms closing delay
  (`test-cost-native.test.ts:58`, asserted with `>=`) tolerate load but spend fixed wall time on every run; each
  shrinks to the smallest window its assertion still distinguishes.

### 2. Native-tooling unit files

This phase covers every file in § 0's native-tooling prefix set (59 unit files today); the 29 that dominate the base
run's cost are where most of the saving sits. Every matrix scenario in the files that build or run native tooling
replays the full native stack, and `makeNativeBuildFixture` copies all of `src` (1,073 files, 13 MB) for about 145
tests, though the fixture then replaces `src/cli.ts` with a one-line marker. The seams to fake already exist, but tests
use them only to inject faults into otherwise real builds (`build-coordinator.test.ts` fails `publication.rename`, for
example):

- `BuildPublicationDependencies` (`build-publication.ts`) and `BuildCoordinatorDependencies`
  (`build-coordinator.ts`);
- the `createController` parameter of `discoverVitestSelection` and the `ownership` parameter of
  `executeVitestSelection`.

These seams fake publication, disposal, lock ownership, and controller creation. They do not reach native generation
or runtime preparation: `runOwnedBuild` calls `runOwnedGeneration` directly, and `executeVitestSelection` calls
`ensureOwnedRuntimeArtifacts` whenever a selection needs the runtime. Many matrices need no seam at all, because a
function that decides from files runs directly on a filesystem fixture, which the unit tier allows. The seven faults
in `ci-build-recovery.test.ts`, for example, are all decided by `readBuildQualification`.

Logic with no direct tests today gets them: `normalizeVitestOptions`, `localVitestTierArguments`, and
`checkVitestCompletion`. `localVitestTierArguments` is module-private in `local-vitest-runner.ts`, and
`runLocalVitestTier` has no injection seam, so it is exported and tested directly. `checkVitestCompletion` is not pure:
it sets `process.exitCode`, so its tests save and restore that value, since the unit project's workers run many files
(`isolate: false`). `validateRuntimeBuildEvidence` and `requirePreparedRuntimeBuild` are not pure either: they read and
hash the build through `readBuildQualification`. Their direct tests cover only the two refusals that precede that read,
malformed supplied evidence and a missing prepared-build key, which need no build.

Per file:

- a case that varies only what a seam decides runs against a fake at that seam, and a matrix a function decides from
  files runs against that function on a filesystem fixture. A case that publication alone decides is proved at
  `publishStagedBuild`, not through `runOwnedBuild`;
- one real run per distinct outcome class stays real and moves to the integration project, keeping its family
  prefix. The seams cannot fake native generation or runtime preparation, so a case that needs either is its outcome
  class's real run or is dropped as below;
- a fixture that tests only read is built once per file;
- a case, or a row of a parametrized table, is dropped only when a named narrower test proves the same outcome
  class, and its task records that test. The `it.each` tables in `build-context.test.ts:44` and
  `build-evidence.test.ts:37` are the known candidates.

§ 6 defines an outcome class. The six rows of `build-publication.test.ts:56` each refuse a malformed staged artifact
before live output changes. Five are refused by filesystem checks on the staged files (`validateStagedOutput`) and are
one class: one row stays real, and fakes prove the rest. The invalid-CLI row is refused by the same function's
`checkCli` dependency, `checkStagedCli` (`build-entry.ts`), through a real `node --check` child, so it is its own class
and stays real. An **entry point** is a root `npm` test script that
starts `run-local-test-tier.ts`; between them, `local-vitest-routes.test.ts` and `local-vitest-entry.test.ts` run all
ten for real.

**Cross-platform coverage stays real.** The portability tier (`localVitestTierArguments("portability")`) selects
files by name substring and runs them on Linux in the required `portability` job, and on Windows and macOS in the
cross-platform pair, because exclusive create, advisory locking, rename, and compare-and-swap behave differently by
operating system. It selects nine files in this phase's set (`build-context`, `build-cancellation`,
`build-generation-lifetime`, `build-coordinator`, `build-publication`, `build-inventory`, `build-ownership`,
`ci-build-transfer`, `ci-build-recovery`). Every outcome class those files prove for real today keeps a real run
the portability tier still selects: a relocated real run keeps its file's basename, or the tier's list changes in
the same commit. A matrix moved to fakes keeps its real outcome classes on that list.

These stay real by nature: `build-generation-lifetime`, `build-generation`, `dev-build-refresh`, `vitest-mixed-shard`,
one folded `focused-lint-staged` run, and one run per entry point. A per-file read of these files projects roughly a
55–60% cut in their cost; the first converted file calibrates it. A file's cut depends on how much of it fakes can
carry, so that file calibrates the cost of a real run and of the fakes, and the projection is rebuilt file by file
from the real runs each file keeps rather than by applying its percentage.

### 3. Source-scan tests

About 26 unit files run some 35 source-scanning cases with no shared parser: eight full-`src` AST passes, one
full-`__tests__` pass, two scanner snapshots, and two type-checked programs, about 11 CPU-s with roughly 70%
repeated parsing. In order:

1. **Delete what the toolchain already enforces.** `lib/store/ship-guard.test.ts`'s import case re-asserts `tsc`'s
   `rootDir: "src"` (the reference backend lives under `__tests__/helpers/store`): `tsc --noEmit` rejects a static,
   re-exported, dynamic, or type-only import of it from `src`. Its build-output cases prove `referenceBundleInputs`,
   the helper `integration/store-reference-packaging.test.ts` applies to the real build metadata, so they go only
   with that check. The display-label checks in `meta-reader-inventory.test.ts` and `meta-writer-inventory.test.ts`
   (indexing, `renderMetaFile` override objects) re-assert type errors. `@typescript-eslint/no-require-imports`
   already resolves as an error and reports a global `require()` and `import x = require()`. It reports neither
   `module.require()` nor a `require` bound in scope (`createRequire`), which in this ES-module package is the only
   `require()` that runs, and `tsc` reports neither. A scan branch that catches a bound `require()` becomes a ban row
   (step 3) instead of a deletion, and one that catches `module.require()` is classified by step 2's rule.
2. **Delete change-detectors that pin removed code.** Three of `decompose-v3-authority-boundary.test.ts`'s five
   cases pin 11 removed files and 27 retired identifiers. Its base-advancement case bans names that match live
   `retirement-authority` modules, so it is a one-hop ban (step 3), and its methodology-sync case is classified on
   its own. Every
   candidate in this step and step 1 is classified by one rule: **a test survives if it would fail on a plausible
   future regression, not only on an edit to its own list.** Each deletion records the rule's verdict in its task.
3. **Move one-hop bans to ESLint (A3).** Simple import and syntax bans become `no-restricted-imports` and
   `no-restricted-syntax` entries. Checks requiring loader-binding relationships or filename-relative targets use
   a bounded local ESLint rule: each such row names a predicate, and its rule options carry predicate IDs.
   Predicates inspect only the current module's parsed syntax, filename, and binding/resolution data; they never
   walk the source tree or follow a transitive dependency graph. Unknown predicate IDs refuse configuration.
   The existing `literalReferences` follows `createRequire` aliases and returned loader bindings;
   `auditKernelBoundary` resolves kernel-relative modules through TypeScript. Those checks retain their existing
   reference forms, scope exceptions, and resolution semantics. The `imports` helper in
   `lib/store/in-repo-boundary.test.ts` excludes type-only edges and distinguishes eager edges; its replacement
   preserves those distinctions. Lexical path normalization replaces only predicates already using lexical paths.
   A resolver-dependent residual check remains until an equivalent native rule proof establishes its replacement.
   Each migrated predicate is demonstrated through ESLint on forbidden references and allowed lookalikes before
   deleting its source-scan case; neither a repository-wide `createRequire` prohibition nor a ban on arbitrary
   calls containing a forbidden package name substitutes for the established boundary.
   All bans remain rows of one table in `eslint.config.js`. Its composition gives each matching file one union
   of import bans, one union of syntax bans, and one union of local predicate IDs, because later flat-config rule
   options otherwise replace earlier ones. A unit test uses `ESLint#calculateConfigForFile` without a lint pass
   to prove each scope's complete ban set and overlapping scopes' unions. The local rule reuses the linter's
   parsed module; no additional whole-source parse or cache is introduced. The earlier 0.3% marginal-cost estimate
   covered the built-in rules only; Task 4.3 records actual lint cost for the adopted union. Transitive graph,
   export-surface, and runtime-loading checks remain tests. § 7's `@clack/prompts` confinement joins the same table.
4. **Narrow over-broad scans.** `registry.test.ts`'s "registers every command-owned schema" reads only
   `source.commands`, so it runs `scanCommanderSource` on `cli.ts`, as `cli-help-coverage.test.ts` already does,
   instead of the full `scanCommandInputSources`.
5. **Measure what remains, then decide** whether a shared cached parse earns its place, by the local instrument's
   unit-tier capture. It is not pre-committed.

`lib/store/in-repo-boundary.test.ts` keeps its rule at full strength: only the mechanism that checks it may change.

### 4. E2E fixture cost

- `command-input-no-input.e2e.test.ts` runs 80 matrix entries, each as three concurrent invocations under
  `Promise.all`, each building its own repository (`createTempRepo`, `arc --no-input init`, a commit, plus a stub and
  an origin where the entry needs them). For 45 entries all three invocations run without a TTY (stdin or `--json`
  routes them through `runArcNoTty` or `runArcWithStdin`), so `resolveInteractionContext` resolves the same
  forbidden context for each. Six more (`base merge`, `integrate checkpoint`, `integrate merge`,
  `review change-request resolve`, `review pre-publication`, `review status`) run their `--no-input` invocation under
  a pseudo-TTY: `emitsMachineReadablePayload` (`__tests__/e2e/helpers.ts`) recognizes those commands by position
  (`args[0]`), and the leading `--no-input` displaces them. Their interaction is still forbidden, but `terminal`
  differs, and the signal-to-context mapping they vary is unit-tested in `interaction-context.test.ts`. The other 29
  run their `--no-input` and CI invocations under a pseudo-TTY, where each signal alone forbids interaction. An
  entry's invocations without a TTY collapse into one and each pseudo-TTY invocation stays, so the 45 run one
  invocation, the six two, and the 29 three. The initialized repository is built once as a template with
  `prepareRepositoryTemplate` and copied per invocation with `copyPreparedRepository`
  (`__tests__/helpers/prepared-repository.ts`, already used by `candidate-lineage-suite.ts` and
  `delivery-position-suite.ts`). The exact match between `NO_INPUT_MATRIX` and live interaction sites, which
  `repository-inventory.test.ts` enforces, is kept; § 7 later changes how prompt sites reconcile.
- `session-init.e2e.test.ts` runs `init` in a fresh repository for each of its 30 cases, in five `beforeEach` hooks
  and inline in four cases. One initialized-repository template serves them all, and each group's remaining setup (a
  commit, a worktree parent, a stale local base, a remote) stays per case.
- `teardown-stale-projection`'s 11 veto cases each rebuild `prepareArchivedFeature`; it is built once and copied per
  case. Its linked worktree sits outside the repository root in its own parent (`join(parent, "demo")`), a position
  the veto cases depend on, while `copyPreparedRepository` supports only a worktree inside the template root
  (`PREPARED_WORKTREE_PATH`). The helper gains a prepared shape for a sibling linked worktree: it copies both
  directories and rewrites the absolute paths each side records (the repository's `.git/worktrees/<name>/gitdir` and
  the worktree's `.git` file).
- `publication-spine.e2e.test.ts` rebuilds `reachAtCapConvergence` three times; it is built once and copied.
- **Managed-run staleness skip.** The per-spawn staleness check is skipped only for the processes of a managed test
  run. The test controller already prepares and qualifies the build and holds the checkout's artifact lock through
  closing (`withTestArtifactOwnership` in `build-ownership.ts`, lock file `BUILD_ARTIFACT_LOCK_NAME`,
  `.arc-build.lock`), so its run is pinned to that artifact by design. The controller exports its lock token in an
  environment variable, which its Vitest workers and their children inherit. The CLI's `preAction` hook reads the
  lock file and skips `checkDevBuildStaleness` only when all three hold:
    - the exported token matches the current holder's `token`;
    - the holder's `metadata.operation` is a test controller's (`tests (<tier>)`, as `withTestArtifactOwnership`
      writes it);
    - the holder's renewable lease is live (`leaseUntil` still ahead).

  A build holding the same lock never qualifies. A developer's own `npx arc` in the same checkout during the run
  carries no token, and a leaked token matches no holder once the run releases the lock. The lookup is one
  synchronous file read sorted by the lock module's holder classification (the one `readHolder` applies), because
  `renewAdvisoryLock` rewrites the file in place: an absent, empty, corrupt, or unreadable holder runs the check as
  today. Outside a managed run the check is unchanged.

### 5. CI layout and budgets

After the CPU work lands, the trial retries the layouts that measured no faster under contention: shard the unit job,
and replace E2E's four anchored shards with duration-balanced shards. Shard counts are trial parameters: a dispatch
carries each trial matrix's shard list as a JSON array, which the matrix reads directly. Native shard membership is a
hash of the spec path with no duration input (`BaseSequencer.shard`), which is how heavy files land together:
`09ea5bb72` removed the slow-files-first sequencer after the two heaviest E2E files, started together on one shard,
slowed every file there to about 2.3 times its time.

**The sequencer.** For the trial, `__tests__/helpers/heavy-first-sequencer.ts` returns from `ecd8c8af3`, where it
overrides only `sort()`, moving a hand-kept list of six E2E files to the front of their project's run
(`promoteHeavyFirst`). It is rebuilt to override both `shard()` and `sort()` from one duration source. Registered for
a run, it decides the membership and order of every project in that run, integration's shards included:

- `shard()` first puts every file in one total order (weight descending, then project name, then package-relative path),
  because Vitest hands it the files in no stable order, then assigns them in that order to the least-loaded shard,
  the lowest-numbered on a tie. A file with no recorded duration weighs its project's estimate (see **Adoption**), and
  so does a file whose recorded duration is not a finite, non-negative number: a results file holds whatever a run
  saved, Vitest itself loads one without checking its values (`ResultsCache.readFromCache`), and one non-numeric
  weight would break the total order. Every shard process computes the assignment from the same input and order, so
  the shards partition the files exactly.
- `sort()` starts files with a valid recorded duration first, slowest first, and leaves the rest in Vitest's own
  order (`BaseSequencer.sort`). On a run with more than one worker, Vitest queues files in that order across projects
  (`groupSpecs`), so the slowest start first whichever project they belong to.

**Two duration sources** are measured against each other, and a `workflow_dispatch` input selects which one drives
the sequencer on a hosted run:

- the restored file's hand-kept list of slow files, with each file's hosted duration from the trial's reference runs;
- the persisted Vitest results cache, which records every file's duration and failure state in every tier, with nothing
  to maintain. Every run restores the newest file by key prefix, writer runs included. The restore happens once, in the
  `setup` job every test job waits on, which hands the file to each shard as a run artifact, so all shards of one run
  read the same input; when no saved file exists, it hands on an empty one, and every file weighs its project's
  estimate. `setup` is otherwise artifact preparation only, as a contract test holds (below), so the restore and the
  handoff join the steps that test admits there. The sequencer reads the handed file from a path an environment variable
  names, never through Vitest's own results cache: Vitest loads whatever file sits at its cache path when it starts
  (`ResultsCache.readFromCache`) and writes all of it back after the run (`ResultsCache.writeToCache`). That cache path
  sits inside the `node_modules` the jobs restore from cache, so each trial job removes Vitest's results directory
  before its run, and the file its Vitest writes holds exactly that job's files. In a writer run, each shard uploads
  that file, and a final job merges those disjoint sets into one file per tier and saves it under a run-unique cache
  key. Only writer runs save, so pull requests and forks cannot write `main`'s scope. A stale or poisoned file changes
  membership and order, never results.

**Adoption.** The trial runs on this work's branch before anything is adopted: dispatch runs there are the cache's
writers and readers, and the source selector exists only for the trial.

- **Reference:** the median run duration of at least three dispatch runs of the current layout at the head the trial
  starts from. The same runs fix each project's estimate, its median hosted file duration there, and the hand-kept
  list's durations, so every weight the sequencer uses is measured after the CPU work has changed the durations the
  § 0 baseline recorded.
- **A source clears the bar** when at least two runs use it and every run that uses it finishes at least 10% below
  the reference. Per-runner speed varies up to about 1.7×, so one run decides nothing. A cache run that restored no
  saved file seeds the cache and does not count as using it. A writer run's duration leaves out its merge-and-save
  job, as § 0 defines run duration.
- **Integration stays off the critical path:** in each run that counts, no integration shard is the last test job to
  finish. If one is, the trial adds an integration shard and that source's runs start over. The relocated real runs
  add to integration's 942.9 s summed time, which is why this is checked.
- **Selection:** if both sources clear the bar, the cache wins unless the hand-kept list's median run duration is
  more than 10% below the cache's, since the cache needs no upkeep. If one clears, it wins. If neither clears, no
  layout change lands: the anchors, their readers, and the single unit job stay, and the sequencer does not land.
- Only the winner lands. If the cache wins, the weekly scheduled run on `main` widens from portability alone to every
  test tier and becomes its standing writer beside `workflow_dispatch`, and the hand-kept list and the selector go. If
  the hand-kept list wins, the cache's restore, results-directory removal, upload, merge, and save steps and the
  selector are removed.

If a balanced layout is adopted, it generalizes the hand-placed E2E anchors and replaces them, along with what reads
them:

- `parseWorkflowE2EAnchors`, `parseWorkflowE2EExclusions`, and `validateE2EShardMembership`
  (`src/lib/test-cost/shards.ts`) and their tests in `test-cost-shards.test.ts`;
- `deriveEffectiveE2EShards` (`shard-run.ts`) and `test-cost-shard-run.test.ts`, which back the
  `benchmark:test-cost:shards` membership instrument; it computes membership from the same duration input CI uses,
  which for the cache is a run's handed file, passed to it as an argument;
- the anchor step assertions in `review-gate-workflows.test.ts`.

The classifier's verified-tree check list follows the adopted layout's check names too. `HEAVY_CHECK_NAMES`
(`scripts/classify-change.sh`) names the checks that must all have passed before `_all_heavy_checks_passed` counts a
tree as verified, and `classify-change.test.ts` keeps a copy. A contract test there (`workflowHeavyCheckNames`) expands
every `ci.yml` job whose condition, or a step's, requires a run that is not light, one name per matrix leg, and fails
unless the list and its copy equal those names; it also fails when `setup` gains a step other than artifact
preparation. It expands only literal matrix values, so:

- the adopted layout's shard matrices are literal, and the list names every leg;
- trial jobs run only on a dispatch with a source selected and carry no heavy-weight condition, so they are not heavy
  checks;
- the results cache's restore and handoff stay among `setup`'s admitted steps only while the cache is in use.

The trial's runs, sources, and verdict are recorded in `notes-test-suite-reliability.md`.

**Budgets.** At the close of the work, after the final phase, `test-cost-budgets.json` is re-recorded: its CI-job
rows from the five reliability runs of the closing measurement, one row per job of the adopted layout, and its
tier-isolated rows from the local instrument at the final head. Each row's baseline is the median of its
measurements. The allowance (`allowanceFraction`, 10% today, inside the observed runner variance) becomes the
smallest multiple of 5% under which every one of those measurements falls within its row's budget.

An `over` reading already writes a job-summary warning naming the job, its overage, its budget, and its observed time
(`ci-budget.ts`). It also emits a GitHub Actions `::warning` annotation, which shows on the pull request's checks,
and both name the baseline beside the budget. `within` stays quiet. Visibility only: failing a pull request on its
budget stays out of scope.

### 6. Testing policy

Placement follows the existing split. `testing-standards` is the method agents load when a task writes tests; its
project `.override` (`override-mode: extend`, project-owned, not shipped) gains the operative rules in a few lines.
`strategy-testing-methodology.md` is the canonical reference and gains the reasoning and worked examples, an
expansion of each rule rather than a restatement.

New rules:

- **Architecture rules live in the linter when the linter can express them.** One-hop import and syntax bans are
  ESLint rules. A test asserts only a structural property the compiler and linter cannot, and never re-asserts what
  they already enforce.
- **Matrices run below the real stack; one real run per outcome class.** A decision matrix proves its logic against
  fakes at the module's dependency seam or, when one function decides it from files, against that function on a
  filesystem fixture. The real stack runs once per distinct outcome class, in the integration project. An outcome class
  is one end state the real operation reaches (a published generation, a refusal that leaves live output untouched,
  a queued or excluded wait, a repaired retry) together with the external systems it touches to get there: the
  filesystem, a child process, git, a lock. Cases that differ only in input data share a class; a case that a
  different external system decides is its own.
- **Process-spawning tests are hermetic and time-honest.** The child environment clears variables that change output
  format (`FORCE_COLOR`). Fixed sleeps and deadlines are sized to what the assertion distinguishes. Heavy real work
  carries a named explicit timeout rather than a raised tier default.

Enforced, not new: the override makes § Test Tiers' unit line operative for `__tests__/unit/**`: no child processes,
no real builds, no git repositories. The strategy's line is corrected to match. Its "no filesystem" clause goes:
about 130 unit files write files (a search for `mkdtemp`, `tmpdir()`, and `writeFile` finds 130), and read-only
source scans belong in unit. Six texts that rest on that clause change with it:

- the override's **Boundaries are** bullet drops `fs` from what unit tests mock, keeping `execFile` / git, the
  npm-registry check, and time;
- the strategy's § Mocking Rules boundary list, which the unit tier's "Mock only at system boundaries" points to,
  drops "the filesystem" the same way;
- the strategy's Integration tier is characterized by real module interactions, git repositories, and child
  processes, not by filesystem use ("May use the filesystem via temporary directories", "Slower than unit
  (filesystem I/O)");
- `TECHNICAL-OVERVIEW.md` § 4's Unit and Integration lines follow the same tier lines;
- the override's **Dependency injection** bullet and the strategy's "Accept dependencies" bullet, which name `fs`
  as an injected dependency so tests can mock it, inject `fs` where a test must fail or observe it; otherwise a unit
  test uses a temporary directory.

**The spawn guard.** A lint rule cannot hold the no-spawn line, because most spawns reach `node:child_process`
through helpers, `src` modules, and libraries, never through the test file's own imports. A runtime guard holds it
instead:

- The setup file both unit projects (`unit`, `unit-mocks`) share (§ 0) replaces `node:child_process`'s launch
  functions with ones that throw unless the running test file (`expect.getState().testPath`) is on an allowlist.
  `syncBuiltinESMExports` carries the replacement to ESM importers, `execa` included. A launch a library makes counts
  the same, such as the esbuild service process that bundle-require starts.
- The guard also records each blocked launch and fails the test from its own `afterEach`, so a launch error that
  `execa` (with `reject: false`, which turns a synchronous spawn failure into a failed result) or a helper catches
  still fails the test. A launch outside any test, in a file's `beforeAll` or `afterAll`, fails the file from the
  shared setup file's `afterAll`, which runs after the file's own under Vitest's default `sequence.hooks: "stack"`.
- A library that keeps one child process alive for its whole process is stopped after each file, so launch
  accounting does not depend on which file ran first in a worker. esbuild caches its service per process
  (`longLivedService`) and the unit project runs many files per worker (`isolate: false`); the shared setup file
  calls esbuild's `stop()`, which ends the service and clears that cache, after each file. Each file that uses
  esbuild then launches, and is counted for, its own service, and a file off the allowlist cannot ride an earlier
  file's service.
- A probe under Vitest 4.1.8, with the unit project's `isolate: false`, blocked direct, named-import, and `execa`
  launches, including in a later file in the same worker, while an allowlisted file still spawned.
- The replacement `execFile` carries its own guarded `util.promisify.custom` form. Without one,
  `promisify(execFile)` resolves to a bare string in allowlisted files; 11 test helper modules, 3 unit files, and 3
  `src` modules use that pattern. Copying the original form would bypass the guard.

The allowlist holds the files that still spawn, on any platform the suite runs on, when this work lands, and it is a
floor:

- The guard keeps a running launch count per file and writes it into each test's task metadata after the test,
  beside whether the test's file is on the allowlist. The controller reads both from the run's result, beside its
  completion check: `executeVitestSelection` already passes the result of `runTestSpecifications` to
  `checkVitestCompletion`, and its `testModules` give each test's `TestCase.meta()` and whether it was skipped. The
  run fails at its end naming any file marked allowlisted that ran whole and launched nothing. (A probe under Vitest
  4.1.8 confirmed per-test metadata and skip state reach that result while a command-line reporter list is in force.)
- The check is not a reporter. Vitest's config resolution replaces every configured reporter with a non-empty
  command-line `reporter` list, such as the unit job's `json` reporter (§ 0), so a reporter registered in the
  configuration would be lost on that job. The controller already holds the run's result at its completion check, so
  the check needs no registration.
- A file ran whole when every one of its tests ran: no name filter and no skipped test. A file whose spawning test is
  skipped on a given platform or environment is not checked on that run, and a file with a stable skip is never
  checked: `fs.test.ts` skips one test on every platform (its `powershell.exe` spawn runs only on Windows), and that
  exemption is accepted. It is on the allowlist all the same, though no Linux run sees it launch.
- Vitest shards and selects whole files, so sharded and focused runs still check the files that ran whole in them.
- Adding a file to the allowlist is a visible change in review.

### 7. Declaration-bound prompter (final phase)

CLI behavior under `--no-input` is written twice, by hand. Each prompt site's declaration states an
`automation.noInput` policy (`declareInteractionSite`, `CommandInputDeclaration`), and its handler separately
hand-codes what happens when `context.interaction === "forbidden"`: `skipConfirm` in `handlers/start.ts` proceeds,
and the stale-subdir prompt in `handlers/user.ts` keeps the folder and logs. `repository-inventory.test.ts` checks
that every site has a declaration, not that the behavior matches it, and `NO_INPUT_MATRIX` checks one exit code per
command. A declaration and its handler can disagree and nothing fails. Whether any prompt site drifts today is
unknown until migration.

- **Questions are declared data, referenced by id.** A prompt site is a declared question, not a clack call. Its
  declaration states the question's form (`confirm`, `select`, `text`, or `multiselect`) beside its policy, and the
  call's values and the answer's type follow that form. The code that asks it calls one prompter with its declared site,
  the interaction context, and the call's own values: the message, the options, the runtime default, and the explicit
  answer a flag or argument supplied, if any. The 27 `@clack/prompts` prompt calls in 12 files (`p.select`, `p.confirm`,
  `p.text`, `p.autocompleteMultiselect`) move behind it.
- **A wrapper passes its caller's site through.** A helper that prompts for its callers (`confirmStep` in
  `handlers/start.ts`, `resolveIdentityWithPrompt` in `handlers/shared.ts`, `SyncOutput.confirm`, and `promptTools` in
  `prompts/init-prompts.ts`, which init's and join's prompts both call) takes the site and context from its caller,
  so each caller's question is its own site. The scanner's `prompt-helper` kind, which
  matches any `*.output.{confirm,select,text}` call, retires. So does the sync declaration that names one question
  twice, as `ctx.output.confirm` in `handlers/sync.ts` and as `p.confirm` in `lib/sync-output.ts`.
- **One prompter; policy is data and values are arguments.** An explicit answer always wins. Otherwise an interactive
  context renders through clack, and a forbidden one applies the site's declared kind:
    - `use-default` returns the call's runtime default. When the call has none, it refuses, carrying its declared
      syntax, as `init` and `join` report a missing `--identity <name>` today when no `git config user.name` exists.
      The declaration's `defaultSource` stays descriptive prose.
    - `require-explicit` refuses, and the refusal carries the declared answering syntax (`automation.acceptedSyntax`,
      such as `--commitment <tier>`).
    - `require-authority` answers `true` only when `context.confirmation` is `accept`, and otherwise refuses,
      carrying its declared syntax (`--yes`).
    - `proceed` answers `true`.
    - `refuse` refuses without naming any syntax: only an interactive confirmation can authorize the action, so
      `--yes` does not override it either. Start's indeterminate-lifecycle gate (`handlers/start.ts`, a
      `confirmStep` caller that refuses when interaction is forbidden) declares `interactive-only-override` with
      `refuse`, the pairing `contradiction()` already requires.

  At a prompt site, any other kind is a declaration error, and so is a kind whose refusal carries its syntax
  (`require-explicit` or `require-authority`) with empty `acceptedSyntax`, and so is `proceed` or `require-authority`
  on a form other than `confirm`, since both answer `true`. These checks are scoped to prompt sites and join the
  existing ones in `contradiction()` (`declaration.ts`), which runs on every site; option sites such as
  `--yes` legitimately declare `require-authority` with empty syntax. The declared `cancellation` policy replaces the
  per-site `p.isCancel` handling.
- **The prompter reports an outcome; callers keep their output and exits.** The prompter returns one of three
  outcomes: `answered` with the value, `refused` with the declared syntax (empty for `refuse`), or `cancelled`. It
  never throws for a policy outcome, writes no output, and sets no exit status, so every prompting command keeps
  today's output and exit status in each interaction context:
    - A caller may read `context.interaction` to choose what it presents, never to choose an answer, which only the
      prompter decides. The stale-subdir prompt in `handlers/user.ts` still logs `Keeping stale subdir
      user/<id>/<subdir>/ (non-interactive).` when interaction is forbidden and returns silently on a cancellation,
      and `init`'s reconfigure flow (`prompts/reconfigure-prompts.ts`) still prints its opening line and its
      team-mode warning only when interaction is allowed.
    - Some callers choose the answer themselves today when interaction is forbidden, and never reach their prompts:
      `resolveInitCommandInput` and `resolveJoinCommandInput` (`commands/init-input.ts`, `commands/join-input.ts`)
      build init's, reconfigure's, and join's values; `handleReconfigure` (`handlers/init.ts`) picks
      `resolveRemovalsNonInteractive`; `handleStub` and `handlePromote` (`handlers/lifecycle.ts`) report what is
      missing; `handleReleaseSetupInstall` answers `exit` to its idempotency prompt and collects its missing inputs;
      and `handleReleaseSetupUninstall` builds its missing-evidence result. Each asks its prompts in every interaction
      context. The value it chooses today becomes the call's runtime default at a `use-default` site, and a site that
      reports a missing input refuses through the prompter, its caller gathering the refusals into today's report.
    - On a `require-explicit`, `require-authority`, or `use-default` refusal, the caller reports what it reports today,
      with the same message and exit status; the declared syntax the outcome carries does not replace that text. Today's
      reports differ by site: `handleStub` collects `--commitment` and `--priority` into one `Missing required input:`
      report, `user pull` asks for a re-run with `--yes`, and `release setup install` writes its own `error:` line. A
      report that names other syntax than its declaration's `acceptedSyntax` (`--commitment <provisional|planned>`
      against `--commitment <tier>`), or a refusing declaration whose caller degrades instead (the notes-push prompts in
      `sync` and `user sync` fall back to saving only), is drift under the rule below.
    - A `refuse` refusal keeps its caller's message and non-prompt remedies.
    - Cancellation happens only in an interactive context. `stop` returns `cancelled`, and the caller ends the command
      as it does today, with its present message and exit status; `safe-default` returns `answered` with the call's
      runtime default, or `cancelled` when the call has none. At a prompt site, any other `cancellation` value is a
      declaration error checked in `contradiction()`; today's prompt sites declare only `stop` and `safe-default`
      (`CancellationBehaviorSchema` in `declaration.ts`).
- **Sites are found by their declared values.** Three rules make the declaration the only way to reach a prompt:
    - the prompt-site type is branded, and only a dedicated prompt-site declaring function produces one. Today's
      `CommandInputSite` is structural, and an inline object literal would satisfy it. The prompter accepts only the
      branded type, so the compiler rejects a prompt with no declaration. `declareInteractionSite` declares every
      interaction kind today; stdin, subprocess, and environment-policy sites keep it, and prompt sites, including
      those written as plain objects (`commands/init-input.ts`), move to the new function. The brand is erased at
      runtime, so the function also marks its site `origin: "prompt"`, beside the `syntax` and `declaration`
      origins, and records the module and exported constant that declare it (`source: { file, symbol }`, the shape a
      literal-id site such as `safety.indeterminate-lifecycle` already has). Declaration checks and the inventory read
      the origin;
    - each prompt site is declared as an exported constant with a literal id and passed by name. The scanner resolves
      each call argument through the file's own declarations and imports to a declared site, keeping today's
      single-file parsing with no type checker; declarations usually sit in the handler module that asks the
      question (`userCommandInputPolicyDeclarations` in `handlers/user.ts`). The call that passes a site, to the
      prompter or to a wrapper, is its locus, and the inventory joins each prompt site to that call by id; this
      replaces callee-and-occurrence identity (`p.select`, occurrence N), so each caller of a wrapper is its own site;
    - a site passed by more than one call is refused, since an inventory entry carries one live source. A declared site
      that no call passes is a dangling declaration. `reconcileCommandInputInventory` refuses a declared interaction
      whose selector no longer resolves (`command-input.inventory.stale-source`), but that check reaches only
      declarations that name a line or a call selector, so the join by id refuses a dangling prompt site the same way.
      One site may still be listed under several commands with one policy, as an interaction can be today.

  Two further refusals close the remaining routes around the inventory. A call to the prompt-site declaring function is
  legal only as an exported constant's initializer, and the scanner refuses it anywhere else, so an inline declaration
  passed straight to the prompter fails. The scanner still finds every prompter call by syntax, as it finds clack calls
  today. While callee-and-occurrence discovery still finds clack calls not yet migrated, the prompter's renderer is
  skipped: its clack calls are the policy boundary rather than prompt sites, as `scanInteractionSource` already skips
  `interaction-context.ts` for `process.env.CI`. Both retire with the last migrated site. A call whose site argument
  neither resolves to a declared constant nor is a parameter of any enclosing function is refused, like today's
  unclassified site. The parameter case is a wrapper passing its caller's site through, including from a nested
  callback, as `resolveIdentityWithPrompt` (`handlers/shared.ts`) prompts inside the callback it hands to
  `resolveIdentity`.
- **A handler that prompts takes a required interaction context.** The
  `suppliedContext ?? resolveProcessInteractionContext({ noInput: false, … })` fallback leaves those handlers. The
  fallback is unreachable from the CLI today: `cli.ts` passes a context to every one of the 33 handlers that carry
  it, and no other source caller exists. Handlers that never prompt keep it.
- **The library sits behind one module, and the linter holds it there.** Restricting clack's prompt names with
  `no-restricted-imports` `importNames` also reports every `import * as p from "@clack/prompts"`, which is how all 29
  importing modules use it (probed against the installed ESLint 10.4.1). So one terminal module re-exports clack's
  presentation calls (`log`, `intro`, `outro`, `note`, `spinner`, `cancel`), handlers import `p` from it so their
  call sites stay unchanged, and `@clack/prompts` is importable only in that module and the prompter. The ban is a
  row of § 3's composed ban table.
- **Tests follow the policy rule (A4).** Unit table tests run the real prompter against a fake renderer at the clack
  boundary, covering every policy kind, outcome, and cancellation kind. `NO_INPUT_MATRIX` runs one ordinary real-CLI
  case per reachable prompt kind (`use-default`, `require-explicit`, `require-authority`, and `proceed`), naming the
  site reached and asserting its forbidden-interaction outcome. Reconciliation preserves command coverage for every
  explicit stdin, subprocess, environment-policy site, or `--no-input` flag, and matches named cases to their own
  command and policy kind.

  The sole exception is `safety.indeterminate-lifecycle`, which retains direct handler/prompter proof under supplied
  indeterminate composition. `handleStart` rejects incomplete `expandActiveInFlight` results before that site;
  `analyzeInFlightSnapshot` also rejects classification-failure warnings, and `resolveSuppliedSnapshotInputs` starts
  with no indeterminate marks or disagreement sets. The ordinary CLI cannot produce the site's uncertainty through
  those strict acquisition paths. A real-CLI start case proves the preceding incomplete-expansion safety refusal,
  preserves refs/worktree state, and is explicitly labelled as upstream refusal coverage, never as having reached
  the prompt. No acquisition guard is relaxed to manufacture reachability. Start therefore has its named `proceed`
  case plus that upstream refusal case, with no third generic start case. Other unnamed cases remain one per command.
- **Drift is surfaced, not absorbed.** A site whose hand-coded behavior differs from its declaration is reported during
  migration. The fix moves toward the declaration unless the declaration is the wrong one; either way it is a visible
  behavior change recorded in its task. One drift is settled already: `init` and `join` declare the identity prompt
  `require-explicit` with `--identity <name>`, but when `arc.identity` is unset and it cannot prompt, `resolveIdentity`
  (`lib/git/identity.ts`) answers from the `git config user.name` slug, and scripted `init --yes` runs without
  `--identity` rely on that. There the declaration is the wrong one, and the identity sites declare `use-default` with
  that slug as their runtime default.

### Closing measurement

Pre-fix baseline collection is closed (A1). Further measurements serve a named improvement decision, calibration,
layout verdict, or final acceptance criterion; repeating a known flaky baseline to obtain a cleaner record is not
required. The native-tooling 40% and E2E/hosted 20% targets and final reliability checks remain unchanged. E2E's
comparison uses the frozen single ordinary sample as its baseline and reports that limitation explicitly.

After the final phase, at the final head: the local instrument re-measures every tier, five consecutive full-suite
`workflow_dispatch` runs measure reliability and hosted cost, one further run with `run_portability_pair` on proves the
Windows and macOS legs, and the budgets are re-recorded by § 5's rule. Results are recorded in
`notes-test-suite-reliability.md` beside the baseline. After merge, outside this work's criteria: if the results cache
is adopted, one `workflow_dispatch` run on `main` seeds it, because the branch's trial caches are not readable from
`main`.

### Delivery and boundary

The work lands as one pull request, with review chunked by phase. Boundary fit: **stays one WU + delivery-plan
candidate.** Suite cost and reliability are one concern under one policy, and its phases could land on `main`
independently. The prompter phase is the one piece that reads as its own concern (the command-input runtime); it
stays whole because it is coupled through `NO_INPUT_MATRIX`, which it shrinks and § 4 restructures.

## Alternatives & Rationale

- **Raise timeouts or add runners.** Rejected: it buys headroom without removing the work, and the next misplaced
  test spends it. Native-tooling files are 93% of the unit tier's summed file time.
- **Relocate the heavy unit files to integration as they are.** Rejected as the whole answer: moving work between
  tiers does not reduce job time. It is only the second half of § 2.
- **One shared cached parse for every scan test, up front.** Deferred to § 3 step 5's measurement: most of the
  parsing cost disappears with the deletions and the lint moves.
- **A lint ban on spawning imports in unit tests.** Rejected: most unit-tier spawns go through helpers, `src`
  modules, and libraries, which a test file's own imports never show (§ 6).
- **Staleness-check cost (§ 4).** Three alternatives were rejected. An mtime fast path would reopen the false-fresh
  cases the content hash closes. Keeping the cost leaves 450–690 CPU-s in every E2E run. Skipping for any process
  while a lease is live would also skip the check for a developer's own commands in the same checkout. Binding the
  skip to the live test-controller token is the narrowest condition under which the run is already pinned to a
  qualified artifact.
- **Keep hand-coded `--no-input` handling and the per-command matrix.** Rejected: the declaration stays
  documentation that nothing executes. Making the interaction context required on all 33 handlers, without a
  prompter, would remove only an unreachable hazard and leave the two copies.
- **Patterns the prompter composes** (primary sources checked 2026-10-06):
    - **Flags first; a prompt is never the only way in.** The Command Line Interface Guidelines (clig.dev): "Always
      provide a way of passing input with flags or arguments"; prompt only when stdin is a TTY; and under
      `--no-input`, "If the command requires input, fail and tell the user how to pass the information as a flag."
      `require-explicit` is that rule. The one exception is `refuse`: a safety gate only a person at a terminal may
      override, whose refusal names non-prompt remedies instead (start's names a reachable origin and
      `arc status <name> --fetch`).
    - **Questions declared as data and asked by name; a non-interactive frontend answers from the declaration.**
      debconf separates question templates (name, type, default, description) from frontends. Code asks by name
      (`db_input <priority> package/question`), the Noninteractive frontend "makes the default answers be used for
      all questions", and preseeding supplies explicit answers ahead of time. The declarations already play the
      template's part; the prompter is the frontend switch. Unlike debconf, each declaration also chooses whether a
      missing answer defaults or refuses, clig.dev's rule; the `automation.noInput` kinds already record that
      choice.
    - **A prompter port with a test double.** GitHub CLI routes prompts through a `Prompter` interface
      (`internal/prompter/prompter.go`), gates them on `IOStreams.CanPrompt()` (stdin and stdout TTYs, unless
      `GH_PROMPT_DISABLED` or the `prompt` config disables prompting), fails with
      `cmdutil.FlagErrorf("… required when not running interactively")`, and tests commands against `PrompterMock`
      and `NewMockPrompter`, whose queued stubs are verified at cleanup. gh leaves the gate to each command. Here the
      gate moves inside the prompter, because the per-site gate is exactly the hand-coded copy § 7 removes.
    - **Wrap the third-party library in one module** and ban direct imports elsewhere: the same lint-held boundary
      § 6 states for one-hop bans.
- **A loader seam for bundle-require.** Not pursued: the bundled-file race is closed by the shared copy helper's
  filter (§ 1). No other failure traces to bundle-require writing beside the source, and same-checkout builders
  already queue.
- **Landing the flake fixes and policy first, as their own pull request.** Rejected for one pull request with review
  chunked by phase, the repository's practice while its delivery machinery is paused.
- **Duration-aware membership through Vitest's built-in options, startup snapshots, single-executable builds,
  `NODE_COMPILE_CACHE`, and code splitting** were closed by `analysis-test-suite-cost-baseline.md` and are not
  reopened. § 5 gets balanced membership from a custom sequencer's `shard()` instead.
- **Absolute cost bars.** Rejected for bars relative to a baseline recorded on this work's branch: hosted runner
  speed varies up to about 1.7×, and the suite changes between this specification and the work's start.

## Cross-cutting Considerations

- **Trust boundaries.**
    - The managed-run skip relaxes the staleness check only for processes holding the live test-controller token. A
      build holder, an expired lease, no token, or a lock file that is absent, empty, corrupt, or unreadable runs the
      check as today.
    - The results cache is a scheduling input: only writer runs (`workflow_dispatch` and the scheduled run) save it,
      so pull requests and forks cannot write `main`'s scope, and a poisoned file changes membership and order, never
      results.
    - The spawn guard is a test-time control and ships nothing.
- **Performance.** Measured against the § 0 baseline with the same instruments and settings. Unit-tier work
  relocated to integration is counted where it lands.
- **Testing.**
    - Each converted native-tooling file keeps one real run per outcome class, and the portability tier still
      selects a real run of every outcome class it covers today.
    - The shared copy helper, the spawn guard and its floor check, the managed-run skip conditions, the
      sequencer's partition and order, the composed ban table, and each prompter policy kind have direct tests.
    - `review-gate-workflows.test.ts` follows any workflow change.
- **Migration and rollout.**
    - There is no persisted-data migration.
    - The CI layout changes only through the § 5 trial.
    - The weekly scheduled run widens only if the results cache is adopted, and then one `workflow_dispatch` run on
      `main` seeds it after merge.
    - The testing policy changes land in the project override, the project strategy, and `TECHNICAL-OVERVIEW.md`
      § 4.
- **User-facing impact.**
    - Each prompter drift fix is a visible `--no-input` behavior change recorded in its task.
    - Otherwise every prompting command keeps its present output and exit status.
    - The managed-run skip is invisible outside a managed test run.

## Success Criteria

Every cost criterion compares a closing measurement with the § 0 baseline, using the same instrument and settings.

1. **Baseline first.** The § 0 baseline is recorded in `notes-test-suite-reliability.md`, with run IDs, before the
   first commit of any optimizing phase, and every hosted run of the unit job retains each test's duration and
   effective timeout as a run artifact.
2. **Reliable on hosted runners.** Five consecutive full-suite `workflow_dispatch` runs at the final head pass with
   every job green on its first attempt. In each, every unit test's duration is under half its effective timeout:
   its explicit timeout, else its project's default. One further dispatch run at the final head, with
   `run_portability_pair` on, passes its Windows and macOS portability legs.
3. **Hermetic.** `npm test` passes with `FORCE_COLOR=3` set. A unit test proves the shared copy helper skips a
   transient `*.bundled_*.mjs` file while copying an untracked module.
4. **Native-tooling cost** is at least 40% below its baseline (local instrument, three-run medians).
5. **E2E summed file time** is at least 20% below its baseline (local instrument, three-run medians).
6. **Hosted run duration:** the median of the five closing runs is at least 20% below the baseline median.
7. **Hosted summed test-job time:** the median of the five closing runs is at least 20% below the baseline median.
8. **Layout decided by evidence.** The § 5 trial's runs and verdict are recorded. Either the winning duration source
   cleared the adoption bar and is the only one that landed, with the anchors and their readers replaced, or neither
   cleared it and the current layout, anchors, and single unit job stand with no sequencer.
9. **Budgets current and visible.** `test-cost-budgets.json` holds rows re-recorded by § 5's rule for every job of
   the final layout and every tier, and a test proves an `over` reading emits a `::warning` annotation naming the
   baseline and the budget.
10. **Unit tier enforced.** In both unit projects, a launch from a file not on the allowlist fails its test even when
    the launch error is caught, an allowlisted file can launch, a file using esbuild is counted for its own service
    whatever ran before it in the worker, and a run in which an allowlisted file ran whole and launched nothing fails
    naming it, even when the run names its own reporters. Each is proved by a test.
11. **Toolchain-held architecture.** The one-hop bans are ESLint rules in `eslint.config.js`, the source-scan cases
    they replace are gone, and each deleted change-detector or toolchain-redundant case records the § 3 survival
    rule's verdict in its task.
12. **Managed-run staleness skip.** Tests prove the skip happens only with a matching token, a test-controller
    operation, and a live lease, and that a build holder, an expired lease, a missing token, or a lock file that is
    absent, empty, corrupt, or unreadable runs the check.
13. **One `--no-input` source.**
    - No `@clack/prompts` prompt call remains outside the prompter, and `no-restricted-imports` confines
      `@clack/prompts` to the terminal module and the prompter.
    - No branch on `context.interaction` chooses an answer a prompt site declares; each such site is asked in every
      interaction context.
    - A unit table test runs the real prompter against a fake renderer and covers each policy kind, each outcome,
      and each cancellation kind.
    - Every prompting command keeps its present output and exit status in each interaction context, except recorded
      drift fixes.
    - `contradiction()` refuses a prompt site with an unsupported kind, with a syntax-carrying kind and empty
      `acceptedSyntax`, with `proceed` or `require-authority` on a form other than `confirm`, or with a `cancellation`
      other than `stop` or `safe-default`.
    - Every prompt site is reached only through its branded, exported declaration.
    - Each drift found during migration is recorded in its task.
14. **Policy stated.** The `testing-standards` override and `strategy-testing-methodology.md` carry § 6's rules and
    tier lines, and `TECHNICAL-OVERVIEW.md` § 4 agrees with them.

15. **Frozen evidence before fixes (A1; supersedes criterion 1's sampling obligation).** The baseline records the
    frozen head, all three local unit and integration samples, the one successful ordinary local E2E sample,
    failed attempts, all three hosted attempts and their conclusions, capture paths, settings, and sample limits
    before the first optimizing commit. Every hosted unit job retains each test's duration and effective timeout.
16. **E2E comparison with a single baseline sample (A1; supersedes criterion 5).** Closing E2E summed file time,
    measured with the same local instrument and settings using three-run medians, is at least 20% below the frozen
    single ordinary baseline sample; the result explicitly states that the baseline has no measured noise estimate.

17. **Timeout-only decomposition exception (A2).** The two near-timeout refusal-source-totality cases keep their
    assertions and scanning behavior and receive a named timeout above 3.4 times their frozen hosted maximum.
    This exception permits no decomposition implementation change.

18. **Faithful one-hop lint predicates (A3).** Native ESLint checks reject aliased and inline `createRequire`
    references to forbidden packages and forbidden filename-relative imports while accepting unrelated calls,
    valid nested imports, and the permitted Result/store seams. Module-resolution predicates and type-only/eager
    exceptions retain their original semantics. Each matching file resolves every applicable predicate ID in the
    same composed ban table, and no source-scan replacement is deleted before its equivalent native lint proof.

19. **Reachable native prompt coverage (A4).** Four ordinary real-CLI cases reach named sites for `use-default`,
    `require-explicit`, `require-authority`, and `proceed`, with observable defaults, refusals, and resulting state.
    `safety.indeterminate-lifecycle` retains direct handler/propmter proof under supplied indeterminate composition;
    a separately labelled native start case proves the preceding acquisition refusal and preserves refs/worktree
    state. Inventory reconciliation accounts for this sole explicit exception without claiming native prompt reach.

## Open Questions

- **Calibration of the native-tooling cut.** The 55–60% projection comes from a per-file read, not a prototype; the
  first converted file calibrates it. The 40% criterion stands regardless.
- **Integration headroom.** Relocated real runs may need a third integration shard; § 5's critical-path check
  decides.
- **Prompter drift.** Beyond the identity prompt § 7 settles and the candidates it names, whether any prompt site's
  behavior differs from its declaration is unknown until migration. § 7 fixes how each is handled.
- **The per-spawn saving on hosted runners.** The 0.25–0.38 s range comes from two local probes on one command, and
  the 1,815-spawn count is dated. No criterion rests on either; E2E's criterion measures the outcome.

## Amendments

- **A1** — 2026-10-06 — design: freeze existing baseline evidence and begin fixes without further pre-fix sampling.
  _Supersedes:_ § 0 ¶2–3. _Trigger:_ 1.2 must-stop. _Work:_ 1.2.R. _Revalidated:_ 1.2.R.b.

- **A2** — 2026-10-06 — design: permit timeout sizing for the two measured refusal-source-totality cases.
  _Supersedes:_ § Non-Goals ¶3. _Trigger:_ 2.4 must-stop. _Work:_ 2.4.R. _Revalidated:_ 2.4.R.

- **A3** — 2026-10-07 — design: preserve binding-aware and filename-relative bans through local lint predicates.
  _Supersedes:_ § 3 step 3. _Trigger:_ 4.3 door. _Work:_ 4.R. _Revalidated:_ 4.3.c.

- **A4** — 2026-10-07 — design: distinguish unreachable start-prompt proof from its stricter native safety refusal.
  _Supersedes:_ § 7 Tests follow the policy rule. _Trigger:_ 9.8 must-stop. _Work:_ 9.8.R. _Revalidated:_ 9.9.

- **A5** — 2026-10-07 — task: normalize native publication keys so Windows can publish required nested artifacts.
  _Supersedes:_ none. _Trigger:_ 10.1 must-stop. _Work:_ 10.1.R. _Revalidated:_ pending → 10.1.b.
