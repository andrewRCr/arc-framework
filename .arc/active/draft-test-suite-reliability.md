# Draft: test-suite-reliability

- **Origin:** [internal]
- **Purpose:** Make the CLI package's test suite pass reliably on GitHub's 4-vCPU hosted runners and cut what it
  costs, by fixing tests that spend real work where a fake proves the same behavior, rather than by raising timeouts
  or adding runners. Promoted from the hosted-test-reliability Errand after its audits showed the cost sits in test
  design, not in the CI layout.

---

## Problem / Motivation

The repository went public and CI moved to GitHub's 4-vCPU hosted runners (2 cores with SMT). The suite was sized
for the retired self-hosted pool, and it now fails and drags in ways that tax every later change:

- **Unit tests time out under load.** CI run `37417731917` failed its first unit attempt on two tests at Vitest's 5 s
  default and passed on rerun. Eleven unit tests run at 2–5 s on hosted runners, against that 5 s default (hosted
  maxima: `in-repo-boundary.test.ts` 5.04 s, `ci-build-transfer.test.ts:65` 5.01 s, `ship-guard` 4.88 s,
  `meta-reader-inventory` 4.59 s).
- **Three order- or environment-dependent failures** (the folded captures):
    - `focused-lint-staged.test.ts` asserts `tsc`'s plain diagnostic form, which `FORCE_COLOR` turns into the
      pretty form, so `npm test` reads red in an agent shell for an unrelated reason.
    - `makeNativeBuildFixture` copies `src` recursively and races the transient `*.bundled_*.mjs` file that
      `loadSchemaProducer` (via bundle-require) writes beside `src/scripts/build-schema.ts`.
    - `build-inputs.test.ts` bundles the schema producer under the 5 s default.
- **A CI check fails on every pull request.** `arc-lane-attestation.yml` checks the pull request's content out as
  inert data at `_arc_change_data`, inside the trusted checkout whose built CLI then runs `review planning-lane`.
  The added package manifests change the build inventory, so the self-hosting staleness check
  (`checkDevBuildStaleness`) refuses the fresh build: "arc dev build is stale … Refusing `arc review planning-lane`".
  Every run in the recent history fails this way, and planning-lane pull requests lose their auto-merge evidence.
- **The unit tier carries integration-shaped work.** On the base run (`37411629163`, `main` at `90946d4aa`), 29
  native-tooling files (build, CI-build, dev-build, Vitest-runtime, local-Vitest, focused-test, focused-lint, and
  test-cost files) sum to about 639 s of the unit tier's 708.6 s summed file time. The largest,
  `ci-build-recovery.test.ts`, takes 75.6 s alone and bounds any shard. `strategy-testing-methodology.md` § Test
  Tiers already bars child processes and git repositories from unit tests ("No filesystem, no child processes, no
  git repos"). These files predate enforcement of that line.
- **E2E oversubscribes the runner.** `command-input-no-input.e2e.test.ts` alone holds 302% CPU (383 CPU-s, about
  126 s wall on 4 emulated CPUs). Paired with `publication-spine.e2e.test.ts`, the two take 165 s together against
  127–132 s apart. That contention is why native E2E sharding measured no faster: hash membership co-locates heavy
  files.
- **Every built-CLI spawn in this repository pays the self-hosting staleness check.** The `preAction` hook in
  `cli.ts` runs `checkDevBuildStaleness` whenever `src` sits beside the built `dist`, and its
  `readBuildQualification` re-hashes every recorded build input. Two local probes of a real `check commit-msg` spawn
  on 2026-10-06 (best of six each) measured 0.80 s with the check against 0.42 s without, and 0.53 s against 0.28 s:
  0.25–0.38 s per spawn. At the last recorded count of 1,815 E2E CLI spawns (`analysis-test-suite-cost-baseline.md`),
  that is roughly 450–690 CPU-s against E2E's 1,807 s summed file time on the base run.
- **Declared and executed `--no-input` behavior can drift apart.** Each prompt site declares an `automation.noInput`
  policy, and its handler separately hand-codes what happens without a terminal. No test compares the two
  (Design § 7).

Why now: hosted runners bill nothing, but wall time is the merge latency for every PR, and a flaky required check
trains reruns. Parallel work in a second checkout runs the suite locally too, where contention compounds all of the
above.

## Design

The direction is one rule applied across the suite: **prove decision logic against fakes at the seams the code already
has, keep one real run per distinct outcome class, and stop spending real work on properties the compiler or linter
already enforce.** Measurement follows `analysis-test-suite-cost-baseline.md`'s discipline: the repository-owned
`benchmark:test-cost` instrument locally, hosted runs for CI, and bars fixed in the spec from a recorded pre-change
baseline before any optimizing phase scores against them.

### 1. Flakes and hermeticity

- `focused-lint-staged.test.ts` runs `scripts/check-ts-quality.sh` with a child environment that clears
  `FORCE_COLOR`; the script's developer-facing output is unchanged.
- The two fixtures that copy live `src` directories recursively, `makeNativeBuildFixture` (all of `src`) and
  `makeFocusedLintFixture` (`src/scripts` and `src/lib`), copy through one shared helper. It keeps the recursive copy
  of what is on disk, with a `cp` filter that skips bundle-require's transient `*.bundled_*.mjs` files, so the copy
  never reaches for a file that vanishes mid-copy. Both directories receive transients during the unit tier
  (`build-inputs.test.ts` bundles `src/scripts/build-schema.ts`; `build-ownership.test.ts` bundles
  `src/lib/build-ownership.ts`). Copying what is on disk keeps dirty trees working: a tracked-file list
  (`git ls-files`) would still name a deleted, unstaged file and would omit a new untracked module.
- `ci-build-transfer.test.ts:65` gains an explicit timeout like its two siblings (30 s and 60 s).
- Heavy real work that remains in the unit tier carries a named, explicit timeout (the existing
  `REPOSITORY_SCAN_TIMEOUT` idiom in `kernel/import-boundary.test.ts` and `command-input/registry.test.ts`). The unit
  tier's 5 s default is not raised: a raised default hides the next misplaced test.
- Fixed timing windows inside fixture scripts are re-sized. The 2 s readiness deadline that proves file parallelism
  (`focused-test-execution.test.ts:61`) fails when a loaded runner starts the second worker late, so its bound
  derives from the test's own timeout. The 300 ms exclusivity hold (`:85`) and the injected 800 ms closing delay
  (`test-cost-native.test.ts:58`, asserted with `>=`) tolerate load but spend fixed wall time on every run; each
  shrinks to the smallest window its assertion still distinguishes.
- `arc-lane-attestation.yml` checks the inert pull-request data out at `.cache/arc-lane-change-data`, which the
  build inventory already excludes (`ROOT_ARTIFACT_DIRECTORIES` in `build-inventory.ts`), and passes that path as
  `--repository`. Trusted-code execution and the live-pair confirmation are unchanged, and the staleness check is
  not relaxed. The trust-boundary assertions in `review-gate-workflows.test.ts` follow the path, and a regression
  test beside the build tests proves that materialized data leaves the build qualified (decision D5). The workflow
  runs on `pull_request_target` from the base branch's file and trusted checkout (`github.workflow_sha`), so the
  move takes effect for pull requests opened or updated after this work merges, not on this work's own.

### 2. Native-tooling unit files

Every matrix scenario in these 29 files replays the full native stack, and `makeNativeBuildFixture` copies all of
`src` (1,069 files, 13 MB) for about 145 tests, though the fixture then replaces `src/cli.ts` with a one-line marker.
The seams to fake already exist, but tests use them only to inject faults into otherwise real builds
(`build-coordinator.test.ts` fails `publication.rename`, for example):

- `BuildPublicationDependencies` (`build-publication.ts`) and `BuildCoordinatorDependencies`
  (`build-coordinator.ts`);
- the `createController` parameter of `discoverVitestSelection` and the `ownership` parameter of
  `executeVitestSelection`.

Pure functions with no direct tests today get them: `checkVitestCompletion`, `normalizeVitestOptions`, and
`localVitestTierArguments`. The last one is module-private and `runLocalVitestTier` has no injection seam, so it is
exported and tested directly. `validateRuntimeBuildEvidence` and `requirePreparedRuntimeBuild` are not pure: they
read and hash the build through `readBuildQualification`. Their direct tests cover only the malformed-evidence
refusals, which need no build.

Per file: matrices run against fakes at those seams; one real run per distinct outcome class stays real and moves
to the integration project; a fixture that tests only read is built once per file; parametrizations already proved
by narrower tests are dropped (`build-context.test.ts:44`, `build-evidence.test.ts:37`, `build-ownership.test.ts`
at `:57`, `:87`, `:143`, `dev-check.test.ts:87`). These stay real by nature: `build-generation-lifetime`,
`build-generation`, `dev-build-refresh`, `vitest-mixed-shard`, one folded `focused-lint-staged` run, and one run per
entry point. The audit projected roughly a 55–60% cut in these files' cost; relocation alone saves nothing, since
moving work between tiers does not reduce job-seconds.

### 3. Source-scan tests

About 26 unit files run some 35 source-scanning cases with no shared parser: eight full-`src` AST passes, one
full-`__tests__` pass, two scanner snapshots, and two type-checked programs, about 11 CPU-s with roughly 70%
repeated parsing. In order:

1. **Delete what the toolchain already enforces.** `lib/store/ship-guard.test.ts`'s import case re-asserts
   `tsc`'s `rootDir: "src"` (the reference backend lives under `__tests__/helpers/store`), and its build-output case
   follows from it. The display-label checks in `meta-reader-inventory.test.ts` and `meta-writer-inventory.test.ts`
   (indexing, `renderMetaFile` override objects) re-assert type errors. `@typescript-eslint/no-require-imports`
   already resolves as an error.
2. **Delete change-detectors that pin removed code.** Four of `decompose-v3-authority-boundary.test.ts`'s five
   cases pin 11 removed files and 27 retired identifiers; its methodology-sync case is classified on its own. Each
   candidate is classified in the spec by one rule: a test survives if it would fail on a plausible future
   regression, not only on an edit to its own list.
3. **Move one-hop bans to ESLint.** Import and syntax bans that look at one module's own imports become
   `no-restricted-imports` plus `no-restricted-syntax` (for `ImportExpression` and `TSImportType`) entries scoped by
   `files` globs in `eslint.config.js`; measured marginal lint cost is about 0.3%.
4. **Narrow over-broad scans.** `registry.test.ts` "registers every command-owned schema" reads only
   `source.commands`, so it runs `scanCommanderSource` on `cli.ts`, as `cli-help-coverage.test.ts` already does,
   instead of the full `scanCommandInputSources`.
5. **Measure what remains, then decide** whether a shared cached parse earns its place. It is not pre-committed.

A rule a sibling work unit owns keeps its strength: for `lib/store/in-repo-boundary.test.ts` (storage-contract's
`lib/store/` boundary) only the mechanism may change, never the rule. `decompose-v3-refusal-source-totality.test.ts`
stays as is.

### 4. E2E fixture cost

- `command-input-no-input.e2e.test.ts` runs 80 matrix entries, each as three concurrent invocations under
  `Promise.all`, each building its own repository (`createTempRepo`, `arc --no-input init`, a commit, plus a stub and
  an origin where the entry needs them). For 45 entries all three invocations run without a TTY (stdin or `--json`
  routes them through `runArcNoTty` or `runArcWithStdin`), so `resolveInteractionContext` resolves the same
  forbidden context for each. Six more (`base merge`, `integrate checkpoint`, `integrate merge`, `review
  change-request resolve`, `review pre-publication`, `review status`) run their `--no-input` invocation under a
  pseudo-TTY: `emitsMachineReadablePayload` (`__tests__/e2e/helpers.ts`) recognizes those commands by position
  (`args[0]`), and the leading `--no-input` displaces them. Their interaction is still forbidden, but `terminal`
  differs. The signal-to-context mapping they vary is unit-tested in `interaction-context.test.ts`. Each distinct
  invocation runs once, and the initialized repository is built once as a template with `prepareRepositoryTemplate`
  and copied per invocation with `copyPreparedRepository` (`__tests__/helpers/prepared-repository.ts`, already used by
  `candidate-lineage-suite.ts` and `delivery-position-suite.ts`). The exact match between `NO_INPUT_MATRIX` and live
  interaction sites, which `repository-inventory.test.ts` enforces, is kept.
- `session-init.e2e.test.ts` runs `arc init` in a `beforeEach` across most of its 30 cases; one template serves
  them.
- `teardown-stale-projection`'s 11 veto cases each rebuild `prepareArchivedFeature`; build once, copy per case.
- `publication-spine.e2e.test.ts` rebuilds `reachAtCapConvergence` three times; build once, copy.
- The per-spawn staleness check (see Problem) is skipped only for the processes of a managed test run
  (decision D2). The test controller already prepares and qualifies the build and holds the checkout's artifact
  lock through closing (`withTestArtifactOwnership` in `build-ownership.ts`, lock file `.arc-build.lock`), so its run
  is pinned to that artifact by design. The controller exports its lock token to its children. The CLI reads the
  lock file and skips the check only when three things hold: the token matches the current holder's `token`; the
  holder's `metadata.operation` is a test controller's (`tests (<tier>)`); and its renewable lease is live
  (`leaseUntil` still ahead). A build holding the same lock never qualifies. A developer's own `npx arc` in the
  same checkout during the run carries no token, and a leaked token matches no holder once the run releases the
  lock. The lookup is one small file read. Outside a managed run the check is unchanged.

### 5. CI layout and budgets

After the CPU work lands, retry the layouts that measured no faster under contention: shard the unit job, and
replace E2E's four anchored shards with duration-balanced shards. Native shard membership is a hash of the spec path
with no duration input (`BaseSequencer.shard`), which is how heavy files land together: `09ea5bb72` removed the
slow-files-first sequencer after the two heaviest E2E files, started together on one shard, slowed every file there
to about 2.3 times its time.

For the trial, the sequencer returns (`__tests__/helpers/heavy-first-sequencer.ts`, from `ecd8c8af3`) and overrides both
`shard()` and `sort()` from one duration source. In `shard()`, a file with no recorded duration counts at a fixed
per-project estimate the spec sets, so every shard's load stays in one unit. `shard()` first puts every file in one
total order (weight descending, then project name, then package-relative path), because Vitest hands it the files in no
stable order, then assigns them in that order to the least-loaded shard. Every shard process computes that assignment
from the same input and order, so the shards partition the files exactly. `sort()` starts files with a recorded duration
first, slowest first, and leaves the rest in Vitest's own order.

If a balanced layout is adopted, it generalizes the hand-placed E2E anchors and replaces them, along with what
reads them: `parseWorkflowE2EAnchors`, `parseWorkflowE2EExclusions`, and `validateE2EShardMembership`
(`src/lib/test-cost/shards.ts`) and their tests in `test-cost-shards.test.ts`; `deriveEffectiveE2EShards`
(`shard-run.ts`) and `test-cost-shard-run.test.ts`, which back the `benchmark:test-cost:shards` membership
instrument, now computing membership from the same duration input CI uses; and the anchor step assertions in
`review-gate-workflows.test.ts`. Two duration sources are measured against each other, and a `workflow_dispatch`
input selects which one drives the sequencer on a hosted run:

- the restored file's hand-kept list of slow files, extended with each file's measured hosted duration;
- the persisted Vitest results cache, which records every file's duration and failure state in every tier, with
  nothing to maintain. Every run restores the newest file by key prefix, writer runs included. The restore happens
  once, in the `setup` job every test job waits on, which hands the file to each shard as a run artifact, so all
  shards of one run read the same input. In a writer run, each shard uploads only its own files' entries, and a
  final job merges those disjoint sets into one file per tier and saves it under a run-unique cache key. Only writer
  runs save, so pull requests and forks cannot write `main`'s scope. A stale or poisoned file changes membership and
  order, never results.

The comparison runs on this work's branch before anything is adopted: dispatch runs there are the cache's writers and
readers, and the source selector exists only for the trial. Only the winner lands. If the cache wins, the weekly
scheduled run on `main` widens from portability alone to every test tier and becomes its standing writer beside
`workflow_dispatch`, and the hand-kept list and the selector go. Right after merge, one `workflow_dispatch` run on
`main` seeds the cache, because the branch's trial caches are not readable from `main`. The budgets don't wait for it:
they are re-recorded on this branch from the adoption runs, which already read a warm cache. If the hand-kept list wins,
the cache's restore, upload, merge, and save steps and the selector are removed before merge. If both sources clear the
adoption bar below, the cache wins unless the hand-kept list is faster by more than a margin the spec fixes, since the
cache needs no upkeep. If neither clears it, no layout change lands: the anchors, their readers, and the single unit job
stay, and the sequencer does not land.

Each duration source gets its own dispatch runs. A layout is adopted only if at least two hosted `workflow_dispatch`
runs with the same source beat the current layout (unit one job, integration two shards, E2E four anchored shards) on
workflow wall time; per-runner speed varies up to about 1.7×, so one run decides nothing. The real runs that relocate
from unit add to integration's 942.9 s summed time, so the layout phase also checks that integration stays off the
critical path.

Afterward, re-record the CI-job budget rows from hosted runs of the adopted layout and settle the allowance: the
current 10% (`allowanceFraction` in `test-cost-budgets.json`) sits inside the observed runner variance. An `over`
reading already writes a job-summary warning naming the job, its overage, its budget, and its observed time
(`ci-budget.ts`). The addition puts it where reviewers look: a GitHub Actions `::warning` annotation, which shows on
the pull request's checks, and the baseline beside the budget in both. `within` stays quiet. Visibility only:
failing a pull request on its budget stays out of scope.

### 6. Testing policy

Placement follows the existing split. `testing-standards` is the method agents load when a task writes tests; its
project `.override` (`override-mode: extend`, project-owned, not shipped) gains the operative rules in a few lines.
`strategy-testing-methodology.md` is the canonical reference and gains the reasoning and worked examples, an
expansion of each rule rather than a restatement. The shipped `.default` is not touched.

New rules:

- **Architecture rules live in the linter when the linter can express them.** One-hop import and syntax bans are
  ESLint rules. A test asserts only a structural property the compiler and linter cannot, and never re-asserts what
  they already enforce.
- **Matrices run against fakes; one real run per outcome class.** A decision matrix proves its logic at the
  module's dependency seam. The real stack runs once per distinct outcome class, in the integration project.
- **Process-spawning tests are hermetic and time-honest.** The child environment clears variables that change
  output format (`FORCE_COLOR`). Fixed sleeps and deadlines are sized to what the assertion distinguishes. Heavy
  real work carries a named explicit timeout rather than a raised tier default.

Enforced, not new: the override makes § Test Tiers' unit line operative for `__tests__/unit/**`: no child
processes, no real builds, no git repositories. The strategy's line is corrected to match. Its "no filesystem"
clause goes: about 130 unit files write files (a search for `mkdtemp`, `tmpdir()`, and `writeFile` finds 130), and
the read-only source scans belong in unit. Three texts that rest on that clause change with it:

- the override's **Boundaries are** bullet drops `fs` from what unit tests mock, keeping `execFile` / git, the
  npm-registry check, and time;
- the strategy's § Mocking Rules boundary list, which the unit tier's "Mock only at system boundaries" points to,
  drops "the filesystem" the same way;
- the strategy's Integration tier is characterized by real module interactions, git repositories, and child
  processes, not by filesystem use ("May use the filesystem via temporary directories", "Slower than unit
  (filesystem I/O)").

A lint rule cannot hold this line, because most spawns reach `node:child_process` through helpers and `src` modules,
never through the test file's own imports. A runtime guard holds it instead. A setup file shared by both unit
projects (`unit`, `unit-mocks`) replaces `node:child_process`'s launch functions with ones that throw unless the
running test file (`expect.getState().testPath`) is on an allowlist. `syncBuiltinESMExports` carries the
replacement to ESM importers, `execa` included. A probe under Vitest 4.1.8, with the unit project's
`isolate: false`, blocked direct, named-import, and `execa` launches, including in a later file in the same worker,
while an allowlisted file still spawned. The replacement `execFile` also carries its own guarded
`util.promisify.custom` form. Without one, `promisify(execFile)` resolves to a bare string in allowlisted files;
11 test helper modules, 3 unit files, and 3 `src` modules use that pattern. Copying the original form would bypass
the guard.

The allowlist holds the files that still spawn when this work lands, and it is a floor. The guard keeps a running
launch count per file and writes it into each test's task metadata after the test; a reporter reads it through
`TestCase.meta()` and fails the run at its end naming any allowlisted file that ran whole and launched nothing. A
file ran whole when every one of its tests ran: no name filter and no skipped test, so a file whose spawning test
is skipped on this platform or environment is not checked on that run. A file with a stable skip is therefore
never checked: `fs.test.ts` skips one test on every platform (its `powershell.exe` spawn runs only on Windows), and
that exemption is accepted. (A probe under Vitest 4.1.8 confirmed per-test metadata reaches the reporter; module
metadata set from a setup file's `afterAll` did not.) Because Vitest shards and selects whole files, sharded and
focused runs still check the files that ran whole in them; name filters and skipped tests are what exempt a file.
Adding a file is a visible change in review.

### 7. Declaration-bound prompter (final phase)

CLI behavior under `--no-input` is written twice, by hand. Each prompt site's declaration states an
`automation.noInput` policy (`declareInteractionSite`, `CommandInputDeclaration`), and its handler separately
hand-codes what happens when `context.interaction === "forbidden"`: `skipConfirm` in `handlers/start.ts` proceeds,
and the stale-subdir prompt in `handlers/user.ts` keeps the folder and logs. `repository-inventory.test.ts` checks
that every site has a declaration, not that the behavior matches it, and `NO_INPUT_MATRIX` checks one exit code per
command. A declaration and its handler can disagree and nothing fails. Whether any prompt site drifts today is
unverified.

Direction:

- **Questions are declared data, referenced by id.** A prompt site is a declared question, not a clack call. The
  code that asks it calls one prompter with its declared site, the interaction context, and the call's own values:
  the message, the options, the runtime default, and the explicit answer a flag or argument supplied, if any. The 27
  `@clack/prompts` prompt calls in 12 files (`p.select`, `p.confirm`, `p.text`, `p.autocompleteMultiselect`) move
  behind it.
- **A wrapper passes its caller's site through.** A helper that prompts for several callers (`confirmStep` in
  `handlers/start.ts`, `resolveIdentityWithPrompt` in `handlers/shared.ts`, `SyncOutput.confirm`) takes the site and
  context from its caller, so each caller's question is its own site. The scanner's `prompt-helper` kind, which
  matches any `*.output.{confirm,select,text}` call, retires. So does the sync declaration that names one question
  twice, as `ctx.output.confirm` in `handlers/sync.ts` and as `p.confirm` in `lib/sync-output.ts`.
- **One prompter; policy is data and values are arguments.** An explicit answer always wins. Otherwise an
  interactive context renders through clack, and a forbidden one applies the site's declared kind:
    - `use-default` returns the call's runtime default. The declaration's `defaultSource` stays descriptive prose.
    - `require-explicit` refuses and names the declared answering syntax (`automation.acceptedSyntax`, such as
      `--commitment <tier>`).
    - `require-authority` proceeds only when `context.confirmation` is `accept`, and otherwise refuses naming its
      declared syntax (`--yes`).
    - `proceed` proceeds.
    - `refuse` refuses without naming any syntax: only an interactive confirmation can authorize the action, so
      `--yes` does not override it either. Start's indeterminate-lifecycle gate (`handlers/start.ts`, a
      `confirmStep` caller that refuses when interaction is forbidden) declares `interactive-only-override` with
      `refuse`, the pairing `contradiction()` already requires.

  At a prompt site, any other kind is a declaration error, and so is a kind that names its syntax (`require-explicit`
  or `require-authority`) with empty `acceptedSyntax`. Both checks are scoped to prompt sites and join the existing
  ones in `contradiction()` (`declaration.ts`), which runs on every site; option sites such as `--yes` legitimately
  declare `require-authority` with empty syntax. The declared `cancellation` policy replaces the per-site
  `p.isCancel` handling.
- **Sites are found by their declared values.** Three rules make the declaration the only way to reach a prompt:
    - the site type is branded, so only the declaring function produces one. Today's `CommandInputSite` is
      structural, and an inline object literal would satisfy it. The prompter accepts only the branded type, so the
      compiler rejects a prompt with no declaration;
    - each prompt site is declared as an exported constant with a literal id and passed by name. The scanner
      resolves each call argument through the file's own imports to a declared site, keeping today's single-file
      parsing with no type checker. The call that passes a site, to the prompter or to a wrapper, is its locus;
      this replaces callee-and-occurrence identity (`p.select`, occurrence N), so each caller of a wrapper is its
      own site;
    - a site passed by more than one call is refused, since an inventory entry carries one live source. A declared
      site that no call passes is a dangling declaration, which `reconcileCommandInputInventory` already refuses.
- **A handler that prompts takes a required interaction context.** The `noInput: false` fallback leaves those
  handlers. The fallbacks in handlers that never prompt, including all 17 in `handlers/review.ts`, stay out of scope:
  `cli.ts` already supplies their context.
- **The library sits behind one module, and the linter holds it there.** Restricting clack's prompt names with
  `no-restricted-imports` `importNames` also reports every `import * as p from "@clack/prompts"`, which is how
  all 29 importing modules use it (probed against the installed ESLint 10.4.1). So one terminal module re-exports
  clack's presentation calls (`log`, `intro`, `outro`, `note`, `spinner`, `cancel`), handlers import `p` from it so
  their call sites stay unchanged, and `@clack/prompts` is importable only in that module and the prompter.
- **Tests follow the policy rule.** Unit table tests cover each policy kind against a fake prompter. The matrix's
  prompt-only entries reduce to one real-CLI run per policy kind. The reconciliation of `NO_INPUT_MATRIX` with
  every other interaction kind (explicit stdin, subprocesses, environment policy) stays.
- **Drift is surfaced, not absorbed.** A site whose hand-coded behavior differs from its declaration is reported
  during migration. The fix moves toward the declaration unless the declaration is the wrong one; either way it is
  a visible behavior change recorded in its task.

Established practice it composes (primary sources checked 2026-10-06):

- **Flags first; a prompt is never the only way in.** The Command Line Interface Guidelines (clig.dev): "Always
  provide a way of passing input with flags or arguments"; prompt only when stdin is a TTY; and under `--no-input`,
  "If the command requires input, fail and tell the user how to pass the information as a flag." ARC's
  `require-explicit` policy, a refusal naming the syntax that answers it, is that rule. The one exception is
  `refuse`: a safety gate only a person at a terminal may override, whose refusal names non-prompt remedies instead
  (start's names a reachable origin and `arc status <name> --fetch`).
- **Questions declared as data and asked by name; a non-interactive frontend answers from the declaration.**
  debconf separates question templates (name, type, default, description) from frontends. Code asks by name
  (`db_input <priority> package/question`), the Noninteractive frontend "makes the default answers be used for all
  questions", and preseeding supplies explicit answers ahead of time. ARC's declarations already play the template's
  part; the prompter is the frontend switch. Unlike debconf, each declaration also chooses whether a missing answer
  defaults or refuses, clig.dev's rule; the `automation.noInput` kinds already record that choice.
- **A prompter port with a test double.** GitHub CLI routes prompts through a `Prompter` interface
  (`internal/prompter/prompter.go`), gates them on `IOStreams.CanPrompt()` (stdin and stdout TTYs, unless
  `GH_PROMPT_DISABLED` or the `prompt` config disables prompting), fails with
  `cmdutil.FlagErrorf("… required when not running interactively")`, and tests commands against `PrompterMock` and
  `NewMockPrompter`, whose queued stubs are verified at cleanup. gh leaves the gate to each command. Here the gate
  moves inside the prompter, because the per-site gate is exactly the hand-coded copy this phase removes.
- **Wrap the third-party library in one module** and ban direct imports elsewhere. This is the same lint-held
  boundary the policy in Design § 6 states for one-hop bans.

## Success Signals

Seeds for the spec's criteria. The cost bars are fixed from the recorded baseline (Decisions › Open).

- **Reliability:** consecutive hosted runs pass with no unit rerun; every hosted unit test's maximum stays under half
  its timeout; `npm test` passes with `FORCE_COLOR=3` set; the lane-attestation regression test and the
  workflow's path assertions pass on this work's pull request.
- **Prompter:** no clack prompt call remains outside the prompter, and the linter holds it there; a unit table test
  covers each policy kind.

After merge, not criteria: lane attestation itself can only pass once the move reaches `main`, so the first pull
request it runs for after this work merges confirms it; and if the results cache is adopted, one `workflow_dispatch`
run on `main` seeds it (Design § 5).

## Decisions

### Resolved

- **D1 — Prompter: declaration-bound, as the final phase** (Design § 7; Owner decision). The audit's first premise
  was wrong: the 33 handler fallbacks that hard-code `noInput: false`
  (`suppliedContext ?? resolveProcessInteractionContext({ noInput: false, … })`) are unreachable from the CLI.
  `cli.ts` passes a context to every one of them, and no other source caller exists. The case for the prompter is
  instead that declared and executed `--no-input` behavior are two hand-maintained copies. No prompter work would
  leave that gap; making the context required on all 33 handlers would remove only an unreachable hazard, so it
  narrows to the handlers that prompt.
- **D2 — Per-spawn staleness check: skipped for a managed test run's own processes**, bound to the controller's
  live lock token (Design § 4). Rejected: an mtime fast path, which would reopen the false-fresh cases the content
  hash closes; keeping the cost; and skipping for any process while a lease is live, which would also skip the check
  for a developer's own commands in the same checkout.
- **D3 — Landing: one PR, review chunked by phase**, the repository's practice while delivery machinery is paused.
  Rejected: landing the flake fixes and policy first as their own PR.
- **D4 — Three additions, each a named scope expansion the Owner accepted:** the Vitest results cache as the second
  duration source (Design § 5), budget-overage visibility (Design § 5), and the unit-tier spawn guard (Design § 6).
  The two `USER-INBOX` captures behind the first two leave the inbox; this draft is now their record.
- **D5 — The lane-attestation fix joins this work** (Design § 1; Owner decision, a named scope expansion). The
  storage cutover removes the lane-attestation workflow (`cohort-state-storage.md`'s storage-coupling register),
  but until then the check fails on every pull request, and the fix is a checkout-path move plus a regression test.
  It is also the same self-hosting staleness check Design § 4 scopes. Its `USER-INBOX` capture leaves the inbox.
- **Loader seam: dropped.** The bundled-file race is closed by the shared copy helper's filter (Design § 1). No
  other failure traces to bundle-require writing beside the source, and same-checkout builders already queue.
- **Typed decompose refusal reasons: not pursued.** The decompose refusal `reason` stays `z.string().min(1)`
  (`decompose-v3-refusal.ts`); the storage cutover replaces that machinery.
  `decompose-v3-refusal-source-totality.test.ts` stays.
- **No global timeout raise** (Design § 1).
- **Boundary fit: stays one WU + delivery-plan candidate**, landing as one PR (D3). Suite cost and reliability are
  one concern under one policy, and its phases could land on `main` independently. The prompter phase is the one
  piece that reads as its own concern (the command-input runtime). It stays whole by Owner direction and is coupled
  through `NO_INPUT_MATRIX`, which it shrinks.
- **Class: `Heavy`, on both triggers.** Scale: a correct plan maps about 60 test files across three tiers, the CI
  workflow, and 12 prompt-bearing modules. Derivation: the prompter's design is authored in the spec. Both compose
  existing declarations, seams, and helpers with established practice, so derivation does not reach `Novel`.

### Open (settled in the spec)

- The bars: fixed from a recorded pre-change baseline before any optimizing phase scores against them, including
  how many consecutive hosted runs the reliability signal requires.

## Alternatives

- **Raise timeouts or add runners.** Rejected: it buys headroom without removing the work, and the next misplaced
  test spends it. The base run's unit-tier cost is 90% native-tooling files.
- **Relocate the heavy unit files to integration as they are.** Rejected as the whole answer: it cuts nothing. It is
  only the second half of Design § 2.
- **One shared cached parse for every scan test, up front.** Deferred to a measurement (Design § 3, step 5): most of
  the parsing cost disappears with the deletions and the lint moves.
- **Keep hand-coded `--no-input` handling and the per-command matrix** (D1). Rejected: the declaration stays
  documentation that nothing executes.
- **A lint ban on spawning imports in unit tests.** Rejected: most unit-tier spawns go through helpers and `src`
  modules, which a test file's own imports never show (Design § 6).
- **Closed by `analysis-test-suite-cost-baseline.md`, not reopened here:** startup snapshots and single-executable
  builds, `NODE_COMPILE_CACHE`, code splitting, and duration-aware shard membership through Vitest's built-in options.
  Design § 5 gets balanced membership from a custom sequencer's `shard()` instead.

## Unknowns and Assumptions

- **E2E saving from D2.** The 0.25–0.38 s per-spawn range comes from two local best-of-six probes on one command,
  and the 1,815-spawn count dates from 2026-09-11. Re-measure both on hosted runners before fixing a bar on them.
- **Native-tooling cut.** The 55–60% projection comes from the audit's per-file read, not a prototype. The first
  converted file calibrates it.
- **Integration headroom.** Relocated real runs may need a third integration shard. Measured in the layout phase.
- **Exact file sets.** The 29 native-tooling files, about 26 scan-test files, and the delete-or-keep classification
  are audit counts. Task generation enumerates them against the criteria above.
- **Prompter drift and reach.** Whether any prompt site's behavior differs from its declaration is unknown until
  migration, and so is how many `NO_INPUT_MATRIX` entries are prompt-only.

## Scope boundary (Won't Do)

- **Integration-file optimization** beyond absorbing the relocated real runs. Integration sits off the critical path
  after its two-shard split.
- **Decomposition tests and machinery**, including the 120 s `integration/decompose-v3-repository-plan.test.ts`.
  `storage-seam`'s decomposition member and the storage cutover rewrite that subsystem.
- **The selection rule for Markdown-pinning tests** and **the prose-pin rewrap sweep** (both `USER-INBOX`
  captures). They concern which tests a change selects and how prose pins match, not suite cost or reliability.
- **Failing a pull request on its test budget.** Budget overage becomes visible only.
- **Interaction-context fallbacks in handlers that never prompt**, including all 17 in `handlers/review.ts`.
- **The shipped `testing-standards` `.default`.** This WU edits only the project override and the project strategy.
- **CLI behavior changes** beyond the prompter's surfaced drift fixes (Design § 7) and the managed-run staleness
  skip (Design § 4).

Dependencies: none open. The storage-seam splits of `handlers/lifecycle.ts` (#826) and `handlers/review.ts` (#827)
have landed and are merged into this branch. They moved code without changing this draft's counts: the 27 prompt
calls in 12 files (three still in `handlers/lifecycle.ts`) and the 33 `noInput: false` fallbacks (17 still in
`handlers/review.ts`). The spec re-baselines counts and loci on `main` when it is written.
