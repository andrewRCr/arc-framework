# Task List: Quality Gates and Hook Integration

- **Design:** `spec-quality-gate-hooks.md`

---

## **Phase 1:** Check declaration and typed configuration read

_Purpose:_ Lands the substrate every request reads: the project's check declaration as one validated type, located and
parsed through the configuration layer, so the verb builds on a settled contract. SC17's baseline is taken first, while
the tier gates still run.

_Mode:_ `layer` — closes on a settled declaration contract read through the configuration layer.

_Exit criterion:_ The configuration layer's typed-file read returns a validated `check-declaration` for a well-formed
file and refuses each invalid shape (an unknown key, a malformed id, and each of the four cross-field refinements),
naming the field.

### `[ ]` **1.1 Measure the per-increment check baseline — SC17**

- _Goal:_ SC17's "before" figure exists, with its sample and method, before any change alters what a task runs.

- **Additional Context:** `notes-quality-gate-hooks.md` § Per-increment check time

    - `[x]` **1.1.a Fix the sample and the method**
        - Fixed 20 replayable non-merge commits at `159fdcdeba`, retaining each complete original path set; excluded
          absent paths by implementation-entry direction. The clone, neutral edit rule, warm-up, and command selection
          are recorded in `notes-quality-gate-hooks.md` § Fixed replay sample and method.

    - `[ ]` **1.1.b Record the baseline**
        - Per-sample and total times, with the sample ids, the replay rule, and the measured tip, in the notes file's
          SC17 section

### `[ ]` **1.2 Typed-file read in the configuration layer — D2, D12**

- _Goal:_ A caller asks the configuration layer for a structured project file by its identity and gets back a typed
  value with the file's resolved location, an absent result, or a refusal naming the failing field, without knowing
  where the file lives.

- _Approach:_ a new module in `src/lib/config/` beside `status-reader.ts`. It maps a file identity to its location
  through the layout's `arc-root` address plus a suffix (`resolveArcPath`, `materializeArcPath`), as
  `ARC_CONFIG_SUFFIX` does for `arc-config.yml`, and parses with `js-yaml`. It validates with the schema instance the
  caller passes, the same object the type's registrar registers, as runtime readers validate with their exported schema
  (`DesignInventoryInputSchema.safeParse` in `design-inventory.ts`) rather than composing the production registry
  (`createProductionSchemaRegistry()`) in the read path. `parseArcConfig` keeps its line parser; moving it onto this
  read is out of scope.

    - Build `test-first` (one behavior at a time):
        - a YAML file returns its typed value, with numbers, booleans, and lists kept typed
        - a JSON file parses through the same read
        - a missing file returns absent, distinct from invalid
        - unparsable content refuses with the parse location
        - a schema violation refuses naming the field path
        - a valid read returns the file's repository-relative location beside its value, so a caller can tell whether a
          change touched the file without composing its path

### `[ ]` **1.3 Check declaration type, refinements, and registration — D2**

- _Goal:_ The CLI accepts exactly the declaration shape the design defines and refuses every other shape with the
  field named, under one registered type.

- _Approach:_ the declaration, selection, record, and runner modules live together in a new `src/lib/checks/`
  directory; request handlers sit beside `commit-msg` in `src/handlers/check/`.

    - `[ ]` **1.3.a Field model and defaults**
        - Build `test-first` (one behavior at a time):
            - the design's illustrative JavaScript declaration parses with every field typed
            - omitted per-check fields take their defaults: `mode: project`; `widen` and `cache` true; `shell`,
              `fixes`, `ci_only`, and `reads_index` false; `inputs` the whole tree; `root` the repository root
            - `commit_fixes` defaults to `restage` and admits only `restage` or `fail`
            - `gate` admits `commit`, `push`, `merge`, or absent
            - an unknown key refuses at the top level, inside a check, and inside `shards`
            - `$schema` is admitted at the top level only

    - `[ ]` **1.3.b Id rule**
        - Build `test-first` (one behavior at a time):
            - an id starts with a lowercase letter and continues with lowercase letters, digits, `-`, `_`, `.`, or `:`
            - an integer-like, comma-bearing, or whitespace-bearing id refuses, naming the id
            - a duplicate id refuses, as `js-yaml` rejects a duplicate key in YAML and JSON alike

    - `[ ]` **1.3.c Cross-field refinements**
        - Applied by the CLI after the structural parse, so no schema document carries them
        - Build `test-first` (one behavior at a time):
            - `shell: true` with `mode: files` refuses
            - `shell: true` with an argument-list `command` refuses
            - a string `command` without `shell: true` refuses
            - a shard argument without `{index}` refuses

    - `[ ]` **1.3.d Register `check-declaration`**
        - A registrar beside the schema, as `registerDeliveryAuthoringSchemas` sits beside its own in
          `design-inventory.ts`, chained into `createProductionSchemaRegistry()`: id `check-declaration`, version 1,
          `strict-current`, `authored: "editor-document"`, `z.strictObject` at every level; Task 1.2's read validates
          with the same instance
        - `PRODUCTION_SCHEMA_IDS` (`__tests__/helpers/production-schema-ids.ts`) gains the id in sorted position, and
          the schema stays projectable (no transforms): `unit/kernel/production-projection.test.ts` folds and strictly
          compiles every production type on both sides, and every command that provisions a checkout writes this
          type's editor document (`writeEditorDocumentsOrThrow`), so a type that cannot project fails provisioning
        - The marker makes `check-declaration` the first production type with an editor document. Update the tests that
          hold none has one: `unit/kernel/authored-metadata.test.ts` (no type marked `editor-document`), the
          `schema list` assertions in `e2e/schema.e2e.test.ts` and `unit/handlers/schema.test.ts` (`editorDocument:
          null` for every type), and `e2e/schema-install.e2e.test.ts` (`documents: []` at three sites, two of them with
          an empty directory). The `schema get` test of request types keeps `null`

## **Phase 2:** Increment-boundary run reused at the commit hook

_Purpose:_ Proves the headline claim, one run per tree across fire sites, on the thinnest path through the verb before
the full request contract builds on it: an increment-boundary run and the commit hook over the same content compute the
same key.

_Mode:_ `slice` — closes on an increment-boundary run that the commit hook reuses.

_Exit criterion:_ In a fixture repository declaring one `project` check and one `files` check at `gate: commit`,
`arc check increment` runs both; a following commit with nothing else changed, through ARC's shipped pre-commit hook
under `core.hooksPath`, reports both `reused`; and the same request with `--force` executes both.

### `[ ]` **2.1 `arc check increment` runs the declared checks over the staged worktree — D3, D4, D5**

- _Goal:_ An increment-boundary request runs the commit gate's checks that its change reaches, over the content the next
  commit will carry, and exits by their outcomes; with no declaration, it reports `none declared` and exits 0.

- _Context:_ the thin path the rest of the verb builds on: the `--changed` change, the commit gate's own checks, both
  modes, `passed` / `failed`, and `none declared`. Widening, the push-feedback half of `increment`, fixers, and the full
  outcome set land in Phases 3 and 4. `none declared` lands here because Task 2.3 syncs dispatch into this
  repository's own commit hook, which runs it before this repository has a declaration (Task 7.4).

    - `[ ]` **2.1.a Staged-worktree tree and its change**
        - The checked tree is the worktree as `git add -A` would stage it: a temporary index seeded from the real one
          (located with `git rev-parse --git-path index`), `git add -A`, `git write-tree`, then removed. The temporary
          index reaches Git through `GitExecOptions.indexFile` on `createExecaGitExec`, the executor that honors it.
          `atomic-graduation.ts` pairs `add -A` and `write-tree` the same way, but over the real index's lock from
          `captureGitIndexState`, which this must never take
        - The change is the verb's own `git diff --raw -z --no-renames --no-abbrev <base> <tree>`: empty output is an
          empty change, and only a failed call leaves the change unresolved. A rename reads as a deletion plus an
          addition. `resolveChangeSet` (`change-facts.ts`) does not fit: it reports an empty diff as `unknown`, as it
          does a Git failure, and its copy detection reports a copied file's unchanged source as changed
        - Build `test-first` (one behavior at a time):
            - tracked edits, staged or not, and untracked files Git's exclude rules admit enter the tree; ignored
              files do not
            - the real index and the worktree are unchanged after the computation
            - a deletion appears in the change and not in the tree
            - an unchanged worktree yields an empty change, not an unresolved one

    - `[ ]` **2.1.b Input matching through Git pathspecs**
        - Each input reaches Git with `glob` magic, and one with a leading `!` as `:(glob,exclude)`, since Git reads a
          bare `!` literally. A tree's matching paths, with the full blob ids its key digests, come from
          `git diff --raw -z --no-renames --no-abbrev <empty tree> <tree> -- <pathspecs>`, since Git abbreviates ids
          otherwise; `git ls-tree` refuses `glob` magic
        - The verb's matching calls clear `GIT_LITERAL_PATHSPECS`, `GIT_GLOB_PATHSPECS`, `GIT_NOGLOB_PATHSPECS`, and
          `GIT_ICASE_PATHSPECS`, which Git's repository-local set (`GIT_REPOSITORY_LOCAL_ENVIRONMENT`) leaves in place
        - No glob library is added: none is a dependency, and `change-facts.ts`'s private `matchesGlob` lets `*`
          cross `/`
        - Build `test-first` (one behavior at a time):
            - `*` matches within one segment, and `**/`, `/**`, and `/**/` cross directories
            - a leading `!` excludes
            - absent `inputs` match the whole tree
            - a pathspec variable in the caller's environment changes nothing that matches
            - a check whose inputs the change misses is `not selected`

    - `[ ]` **2.1.c Minimal runner and the `increment` request**
        - Register `arc check increment` under `checkCmd` (`cli.ts`), loaded lazily through `./commands/check.js` as
          `commit-msg` is (`cli-loading-boundary.test.ts` allow-lists that module), with the `commit-msg` handler's
          split (Commander adapter, pure orchestration, output) and its `CommandInputRegistration`
        - Declare an interaction site (`declareInteractionSite`) for every process call through `execa` or
          `node:child_process`, composed in `command-input-registrations.ts`; give each new form its entry in
          `__tests__/fixtures/command-input/no-input-matrix.ts` and update the totals `no-input-invocations.test.ts`
          pins
        - Spawn argument-list commands without a shell from the repository root, with Git's repository-local
          environment stripped through `environmentForGitCwd` (`process-executor.ts`), as `remedy-roadmap-conflict.ts`
          does
        - Build `test-first` (one behavior at a time):
            - with no declaration, the request reports `none declared` and exits 0
            - the commit gate's checks the change reaches run; the request exits 0 when all pass and 1 when any fails
            - a `files` check receives only its changed inputs that exist in the checked tree
            - a passing check prints one line and a failing one its output tail

### `[ ]` **2.2 A passing run is recorded under its content key — D5, D12**

- _Goal:_ A pass is written once, keyed by the content it checked, so a later request over the same content in the
  same worktree replays it, and a fault in the record never becomes a pass or a refusal.

    - `[ ]` **2.2.a Record placement**
        - `arc-checks/` in the worktree's own Git directory (`resolveCheckoutGitDir`): `.git/arc-checks/` for the main
          worktree, `.git/worktrees/<name>/arc-checks/` for a linked one, never under `.git/arc/`, as
          `commit-message-retry-store.ts` keeps its own state in the Git directory
        - Build `test-first` (one behavior at a time):
            - the main worktree and a linked worktree each get their own directory
            - a linked worktree never reads the main worktree's passes

    - `[ ]` **2.2.b Base key and write-once entries**
        - The key in this slice: check id, a digest of its resolved declaration entry, a digest of its inputs' content
          in the checked tree, and for a `files` check the paths it received; Task 3.5 completes it
        - Entries are content-addressed and written with `atomicCreateFile` (`fs.ts`); `EEXIST` is a hit, not a fault
        - Build `test-first` (one behavior at a time):
            - the same id, entry, and input content yield the same key, and a change to any one yields another
            - only `passed` is recorded; `failed` is not
            - two writers of one key leave one intact entry
            - an unreadable or unwritable record degrades to a run

    - `[ ]` **2.2.c Replay**
        - Build `test-first` (one behavior at a time):
            - a repeat request over unchanged content reports `reused` with the stored summary, without spawning the
              check
            - `--force` spawns it and still records the pass

### `[ ]` **2.3 The commit hook reuses the increment-boundary run — D3, D5, D8**

- _Goal:_ A commit carrying exactly what `arc check increment` just checked reports every selected check `reused` (a
  fixer whose inputs a later fixer rewrote runs again, D7), because the hook's checked tree, the index, yields the same
  key.

    - `[ ]` **2.3.a `arc check pre-commit` over the index**
        - Checked tree: `git write-tree` of the index Git hands the hook as `GIT_INDEX_FILE`, relative (`.git/index`)
          for a plain commit, run from the worktree's top level, and absolute for `git commit -a`'s `index.lock` or a
          path-limited commit's temporary index. ARC's executors drop an inherited `GIT_INDEX_FILE` from any call given
          a working directory (`environmentForGitCwd`), so the handler reads it, resolves a relative value against the
          top level, and passes it as `indexFile`. Change: that tree against `HEAD`; selection as in Task 2.1
        - Build `test-first` (one behavior at a time):
            - with nothing else changed after `arc check increment` and the change staged, every selected check is
              `reused`
            - a staged change the increment run never saw runs the checks it reaches
            - under `git commit -a`, the checked tree is the index Git hands the hook

    - `[ ]` **2.3.b Shipped pre-commit dispatch**
        - In `packages/arc-framework/arc/system/.internal/githooks/pre-commit`, dispatch `arc check pre-commit` as its
          own `# CHECK[<kebab-id>]:` block after the structural checks and before `# Summary`, its status captured with
          an `if !` guard and folded into `errors` as the other blocks do: the hook runs under `set -e`, and every
          summary branch exits. Without its own heading, the dispatch would fall inside
          `CHECK[foreign-write-advisory]`'s block, which `pre-commit-shell-invocation.test.ts` reads up to `# Summary`
          and requires never to touch `errors`
        - Resolve the CLI in `githooks/commit-msg`'s order (repository-local `node_modules/.bin/arc`, then a global
          `arc`), without its `exec`; when neither resolves, fail with installation guidance worded for the commit gate
          if `.arc/system/arc-checks.yml` exists, and dispatch nothing otherwise
        - `githooks/README.md`'s pre-commit section lists the commit gate's declared checks among what blocks a commit,
          with the missing-CLI failure, and its `hooks.pre_commit` row says a disabled hook dispatches no gate
        - Sync the hook and README to `.arc/system/.internal/githooks/`, which the same test requires to match for the
          hook. From then on this repository's commits dispatch through `.husky/pre-commit`, reporting `none declared`
          until Task 7.4, and a stale build fails them with the CLI's stale-build refusal, as `commit-msg` already does
        - `integration/pre-commit-meta-ref.test.ts` runs the shipped hook with the inherited environment, where `arc`
          resolves to the built CLI; give it a restricted `PATH`, as `e2e/commit-msg.e2e.test.ts` does, so it keeps
          testing the structural checks
        - Build `test-first` (one behavior at a time):
            - `hooks.pre_commit: disabled` dispatches nothing
            - a failing declared check fails the commit, and a passing one lets it through
            - an unresolvable CLI with a declaration present fails with the guidance, and the retried commit succeeds
              once the CLI resolves
            - an unresolvable CLI with no declaration commits

### `[ ]` **2.4 Increment-boundary run reused at commit** — validate exit criterion at segment scope

- _Goal:_ The segment's exit criterion holds on a real fixture repository through the built CLI and ARC's shipped
  hook, recorded as the scenario run and its result.

## **Phase 3:** Request contract: forms, scopes, selection, and base

_Purpose:_ Completes what a request selects and over which content: every form, scope, and preset; selection and
widening; the base and merged-in parents exported to `files` checks; and the complete reuse key.

_Mode:_ `layer` through Phase 4 — closes on the verb's complete request and execution contract.

### `[ ]` **3.1 Request forms, scopes, and base-branch resolution — D3, D4**

- _Goal:_ Every request form resolves to one typed request (its gates, scope, change, base, and checked tree), or to a
  refusal naming the input it could not resolve, before anything runs.

    - `[ ]` **3.1.a Forms and flags**
        - Register `gate <gate> [scope]`, `run <id...> [scope]`, `segment`, and `new-head --from <ref>` beside
          `increment` and `pre-commit`; every form takes `--dry-run`, `--json`, `--force`, and `--serial`, and every
          form but the hook forms takes `--ci`
        - Build `test-first` (one behavior at a time):
            - a `run` id the declaration does not declare refuses with exit 2, and the corrected request succeeds
            - `--ci` on a hook form is a usage error, exiting 2

    - `[ ]` **3.1.b Scopes and defaults**
        - `--staged`, `--changed`, `--range [base]`, `--all`, and `--paths <paths...>` are mutually exclusive; unscoped,
          `gate merge` and `run` take `--all`, and `gate commit` and `gate push` take `--changed`
        - Build `test-first` (one behavior at a time):
            - each scope resolves its change and checked tree as the design's selection table states: the index for
              `--staged`, the staged worktree for the others, and the named paths against `HEAD` for `--paths`
            - two scopes together are a usage error, exiting 2
            - each form's default scope applies when none is given

    - `[ ]` **3.1.c Base-branch and named-ref resolution**
        - The base branch is `branch.base` (`readConfigSettings`), read through a remote-tracking ref when one exists:
          the pushed remote's `<remote>/<base>` at the push hook, and the base branch's own upstream
          (`<base>@{upstream}`) elsewhere; otherwise the local branch. The existing helpers assume `origin`
          (`preferRemoteBaseRef`, `readConfiguredUpstreamBranch`), so the verb resolves the remote itself
        - Every merge base with the base branch (a bare `--range`, `segment` while unpublished, a ref new to the
          remote at push, and `gate merge`'s base) resolves through `resolveSoleMergeBase` (`base-overlap.ts`): more
          than one merge base (`ambiguous`), no common ancestor (`unrelated`), or a failed read (`unavailable`) leaves
          the base unresolved, which widens selection and exports no base
        - Build `test-first` (one behavior at a time):
            - the remote-tracking ref wins over a stale local branch, under a remote not named `origin` too
            - an unpushed branch reads the base through the base branch's own upstream
            - an unresolvable named ref (`--range <base>`, `new-head --from`) refuses naming it, and the retry with a
              resolvable ref succeeds
            - a base the verb resolves itself and cannot (a shallow clone, a missing ref, or more than one merge base)
              never refuses

### `[ ]` **3.2 Selection, widening, and `files` path sets — D4**

- _Goal:_ A gate or preset request selects exactly the checks its change reaches, widens to every widening check
  whenever reach cannot be decided, and gives each `files` check exactly the paths it must check.

    - Build `test-first` (one behavior at a time):
        - a change outside a check's inputs leaves it unselected, and the report names that reason
        - a changed global input, a changed declaration file, a changed path no check's inputs match, and an
          unresolvable base each select every check with `widen: true`
        - a `widen: false` check is selected only by its own inputs
        - a widened `files` check receives every path among its inputs in the checked tree
        - a deletion selects `project` checks and can widen, but is never passed; a `files` check left with no path is
          `not selected` with that reason under every request
        - `gate merge` and `--all` select without filtering
        - `run` runs the named checks regardless of gate, and never widens
        - a CI-only check is `not selected` without `--ci`, with that reason, and selected with it
        - an ignored path never selects or widens

### `[ ]` **3.3 Base export and merged-in parents — D2**

- _Goal:_ A `files` check can read what each path held before the change, and tell content a merge brought in from
  content authored over it, through the base, checked tree, and merged-in parents the verb exports.

    - Merged-in parents come from `git rev-list --first-parent --merges --parents <base>..<tip>`, uncapped, with the
      tip at `HEAD` (the pushed tip at the push hook), since the checked tree is a tree, not a commit.
      `analyzeIntegrationEvidence` (`base-integration-evidence.ts`) walks the other way, from the branch to the base,
      and caps its scan
    - Build `test-first` (one behavior at a time):
        - each `files` check receives `ARC_CHECK_BASE` and `ARC_CHECK_TREE` per the selection table's base column, and
          a `project` check receives neither
        - over a merge's own range, the base is the first parent and `ARC_CHECK_MERGED` lists the parents after it
        - over a longer range, `ARC_CHECK_MERGED` lists the parents after the first of each merge on the range's
          first-parent line only, so merges inside merged-in history add nothing
        - a request with no change exports no merged-in parent
        - where no base resolves, none is exported

### `[ ]` **3.4 Presets, deadline gates, and kind — D1, D3**

- _Goal:_ Each preset runs the composition its fire site needs, and every result is labelled enforcement or feedback
  from its request's deadline gate, never from interlock or approval configuration.

    - Build `test-first` (one behavior at a time):
        - membership is cumulative: a `commit` check runs in commit, push, and merge requests, a `push` check in push
          and merge requests, and a gate-less check only by id
        - `increment` runs the commit gate plus the `files` checks declared `gate: push` over `--changed`; a failing
          `push` check is feedback and a failing `commit` check enforcement
        - `segment` runs the push gate over the range from the branch's upstream, or from its merge base with the
          base branch while unpublished
        - `new-head --from <ref>` runs the push gate over the range from `<ref>` to the checked tree
        - a request by id has no deadline, so its results are feedback
        - selection and outcomes are identical under every `arc.commitInterlock` and `arc.pushInterlock` setting

### `[ ]` **3.5 Complete reuse key — D5**

- _Goal:_ A reuse key changes whenever anything the declaration says a result depends on changes, and a key that
  cannot be completed is never recorded.

    - Build `test-first` (one behavior at a time):
        - a change to a global input's content or to a global runtime input's output changes every check's key
        - a check's runtime inputs run without a shell from its `root`, and their output joins its key
        - a runtime input that cannot start or exits non-zero leaves the key incomplete, so the check runs and its
          result is not recorded
        - the declaration file enters each key as that check's resolved entry, and as an ordinary input only where the
          check's inputs match it, so editing one check leaves the others' passes reusable
        - a `files` check's key carries each received path with its content at the base and, where the change carries
          merges, at each merged-in parent
        - a `cache: false` check always runs and is never recorded
        - an environment variable never enters a key

## **Phase 4:** Execution contract: runs, fixes, outcomes, and reports

_Purpose:_ Completes how a selected check runs and what the verb reports about it, so every non-hook request form meets
its contract before hooks and workflow steps depend on it.

_Exit criterion:_ Unit and integration tests hold the verb's complete non-hook contract: selection and widening, gate
membership and kind, every outcome and exit status, each verb refusal with its retry, fixers outside the commit hook,
ranges' merged-in parents, forced runs, record faults and placement, and the checks' Git environment.

### `[ ]` **4.1 Command execution — D2, D3, D5**

- _Goal:_ A selected check runs as its declaration says (in its root, with its paths batched and its environment
  clean), and fixers finish before anything else reads their files.

    - `[ ]` **4.1.a Commands, shell, and root**
        - Build `test-first` (one behavior at a time):
            - an argument-list command runs without a shell, so a path with shell metacharacters reaches it verbatim
            - a `shell: true` string runs through the platform shell
            - a check runs from its `root`, and a `files` check receives its paths relative to that root
            - a command that cannot start is `couldn't run`, never `failed`
            - a `shell: true` check whose program is missing is `failed`, since its shell started

    - `[ ]` **4.1.b Git environment**
        - Build `test-first` (one behavior at a time):
            - a check runs with Git's repository-local variables removed
            - a check that creates and commits in a fixture repository passes under every non-hook request form
            - the same check passes through the shipped commit hook under a plain commit, under `git commit -a`, and in
              a linked worktree, where Git also exports `GIT_DIR`

    - `[ ]` **4.1.c Batching, ordering, and parallelism**
        - Node exposes no argument-length limit, so each platform gets a fixed budget from a pure function tested per
          platform. `io-context.ts`'s 16 KiB (`GIT_PATHSPEC_BATCH_BYTES`) suits `git` spawned directly, but on Windows
          execa runs a `.cmd` or `.bat` command such as `npm` through `cmd.exe`, escaping each argument
          (`execa/lib/arguments/command-file.js`), and `cmd.exe` caps a command line at 8,191 characters, so a batch is
          measured after that escaping
        - Parallelism is bounded by `availableParallelism` (`node:os`), as `test-cost/run.ts` reads it
        - Build `test-first` (one behavior at a time):
            - paths split into batches under the platform's argument-length limit, and a check passes only when every
              batch passes
            - fix-capable checks run first, one at a time in declared order
            - the rest run in parallel, bounded by the machine's available parallelism, and `--serial` runs them one at
              a time
            - every selected check runs and every failure is reported
            - a sharded check runs unsharded

### `[ ]` **4.2 Index view and worktree divergence — D5**

- _Goal:_ A check that reads the Git index sees exactly the content the event will carry, and a run that could have
  read anything else is labelled and never reused.

    - `[ ]` **4.2.a Index view**
        - Only a check declaring `reads_index: true` receives `GIT_INDEX_FILE`, always as an absolute path: a check runs
          from its `root`, and Git hands a plain commit's hook a relative `.git/index`. At the commit hook it is the
          index Git hands the hook, as Task 2.3.a resolves it; elsewhere it is a temporary index equal to the checked
          tree, or for a fix-capable check to the tree at its turn, kept in the record directory and removed after the
          run
        - Where the checked tree came from Task 2.1.a's temporary index, that index is kept, refreshed with `git add -A`
          whenever Task 4.3 recomputes the tree, and serves as the view, so it keeps Git's cached stat data for reads
          against the worktree. Otherwise (`--staged` away from the hook, and the push hook), `git read-tree <tree>`
          fills a new temporary index; never with `--reset -u`, with which the existing calls (`chain-absorption.ts`,
          `github-refresh.ts`) rewrite the worktree
        - Build `test-first` (one behavior at a time):
            - a `reads_index` check reads an index equal to its checked tree
            - a fix-capable `reads_index` check after a fixer that rewrote a file reads an index equal to the tree at
              its turn
            - a `reads_index` check whose `root` lies below the top level reads that index, through the `pre-commit`
              form and through a request away from the hook
            - building the view leaves the worktree and the repository's own index unchanged
            - a check without the field receives no `GIT_INDEX_FILE`
            - the temporary index is removed after the run, and one stranded by a killed run is ignored

    - `[ ]` **4.2.b Worktree divergence**
        - Divergence compares the checked tree with Task 2.1.a's staged-worktree tree over the check's inputs, through
          the same pathspec diff, so ignored files never count. Where the checked tree is the staged worktree, the two
          are one tree and no run diverges
        - Build `test-first` (one behavior at a time):
            - under a `--staged` request or the `pre-commit` form, an unstaged edit inside a check's inputs leaves the
              check running, its result labelled with the difference, and its pass unrecorded
            - a difference outside its inputs leaves its pass recordable

### `[ ]` **4.3 Fixers outside the commit hook — D7**

- _Goal:_ Fix-capable checks rewrite files only where content is still forming, and anywhere else a rewrite is a
  failure, so reviewed content is committed content and no verification run silently edits the tree.

    - The staged-worktree tree is computed before fixers, for the change that selection and each `files` check's paths
      read; at each fix-capable check's turn, before it runs for its lookup and after it runs for its record, recomputed
      only after a fixer that rewrote a file; and after fixers, for the checked tree that every other check's key, the
      index view, and `ARC_CHECK_TREE` use. A fix-capable check receives its turn tree instead, as `ARC_CHECK_TREE` and,
      declaring `reads_index`, as its index view (Task 4.2.a)
    - Build `test-first` (one behavior at a time):
        - under `increment`, `segment`, and `run` or `--paths` without `--ci`, a fixer's rewrites land in the worktree
          and the rewritten files are listed
        - a fixer's pass is recorded under the tree as it stood right after its run, the content it produced
        - after an `increment` whose fixer rewrote a file, with the rewrite staged, the commit hook reports the fixer
          and the checks selected with it `reused`
        - with two fixers in declared order: when the first rewrites a path among the second's inputs, the second's
          pass recorded over the earlier content is not reused; when the second rewrites a path among the first's
          inputs, the commit hook does not reuse the first's pass
        - a fix-capable `files` check after a fixer that rewrote a file receives as `ARC_CHECK_TREE` the tree at its
          turn, holding that rewrite
        - a fixer's rewrite outside the change selects no further check in that run, and a later request carrying it
          selects the checks it reaches
        - under every other request, and under any request carrying `--ci`, a fix-capable check that rewrites a file is
          `failed`, the rewrite stays in the worktree, and its report says it rewrote files

### `[ ]` **4.4 Outcomes, exit codes, and refusals — D3**

- _Goal:_ Every check ends in exactly one named outcome and every request exits 0, 1, or 2 by rule, so a caller acts on
  the status alone.

    - Commander exits 1 on its own parse errors unless the command overrides its exit (`exitOverride`), and a
      subcommand inherits a parent's override only when the parent set it before `.command()` created the subcommand
    - Build `test-first` (one behavior at a time):
        - each check ends `passed`, `failed`, `couldn't run`, `reused`, or `not selected` with its reason
        - a `skipped` outcome, which only the hook forms produce (Task 5.3.b), exits and reports by the rules below
        - a request is `invalid` naming the declaration's field, `refused` naming the ARC-detected condition, or
          `none declared` for a gate with no checks
        - exit 0 when every selected check passed, was reused, or was skipped, or nothing is declared; 1 when any check
          failed, whatever its kind; 2 when a check could not run, the request was invalid or refused, or the command line
          was malformed
        - every command-line parse error exits 2, not Commander's default 1: an unknown option, two scopes, `--ci` on a
          hook form, and `arc check gate` with no gate among them, while help and version still exit 0
        - `skipped` and `none declared` are never reported as passed
        - an invalid declaration's retry after the named field is fixed succeeds

### `[ ]` **4.5 Report, verification line, and remedies — D3, D12**

- _Goal:_ A reader gets one terse report that leads with failures, names a remedy for each that discards no work, and
  carries a precomposed verification line, and nothing CI-facing speaks ARC vocabulary.

    - Build `test-first` (one behavior at a time):
        - a passing check prints one line; a failing one prints a bounded output tail and the path to its full log in
          the record directory
        - each result carries its kind and outcome; rewritten files are listed; a divergent run says so
        - each run records its measured cost beside its log
        - the verification line reflects outcomes and never calls `skipped` or `none declared` passed
        - a failed check's remedy is its output plus the rerun by id over the failed run's scope and base, never with
          `--ci`, and that rerun applies a fixer's fixes
        - a widened `files` check's remedy is the failed request retried as made, `--ci` included, or for a hook the
          guarded commit or push
        - under `--ci`, output names the project's checks and results, with no ARC vocabulary

### `[ ]` **4.6 JSON envelope and dry run — D3, D9**

- _Goal:_ A caller can foresee a long gate, and CI can derive its jobs from one machine-readable listing that matches
  what the verb would run.

    - Build `test-first` (one behavior at a time):
        - `--json` emits a versioned envelope carrying `schemaVersion` and either `result` or `error`, as
          `arc check commit-msg` does (`commit-msg-output.ts`)
        - a malformed command line's envelope carries a `usage` error, as `arc check commit-msg` reports one
          (`commit-msg-cli.ts`)
        - `--dry-run` reports what would run, what would be reused, and why anything is unselected, with each check's
          last measured cost, running the runtime inputs a key needs but no check
        - it forecasts every key over the tree as it stands, as though no fixer rewrites a file, so a fixer that
          follows one forecast to run is forecast `reused` when a pass over the tree as it stands is recorded
        - the JSON dry run lists every check in the request's gates, flags CI-only and fix-capable checks, and gives
          each its working directory, relative to the repository root, and argument batches, and a sharded check, per
          shard, those batches with the shard argument appended to each: one invocation for a `project` check, and for a
          sharded `files` check under `--all`, one per batch
        - it carries the base, the checked tree, and the merged-in parents the verb would export
        - a `--ci` dry run lists exactly what the verb would run under `--ci`

## **Phase 5:** Hook dispatch under every hook manager

_Purpose:_ Takes the commit and push gates to every supported hook-manager integration, with the commit hook's merge,
partial-staging, skip, and fix behavior and the push hook's ref scoping.

_Mode:_ `slice` — closes on both gates dispatching once per event under every supported integration.

_Exit criterion:_ Under husky, lefthook, pre-commit.com, and `core.hooksPath`, a commit (a deletion-only one included)
and a push each dispatch their gate once; the push gate skips `refs/arc/*` and deletions, reports other refs
`not selected`, and names the gated ref on failure; `restage` and `fail` behave per integration; and a merge
conclusion selects only conflicted and parent-unmatched paths.

### `[ ]` **5.1 A commit dispatches the commit gate once under every hook manager — D8**

- _Goal:_ Under husky, lefthook, pre-commit.com, and `core.hooksPath`, every commit runs ARC's pre-commit hook exactly
  once, a deletion-only commit included.

- _Context:_ no lefthook or pre-commit.com binary is provisioned anywhere today. The tests that run real hooks
  (`e2e/pre-push.e2e.test.ts`, `e2e/commit-msg.e2e.test.ts`, `integration/pre-commit-meta-ref.test.ts`, and
  `integration/markdown-staged-hook.test.ts`) run ARC's hooks directly or through `.husky/pre-commit`, never under
  lefthook or pre-commit.com.

    - `[ ]` **5.1.a Provision the hook managers for the E2E tier**
        - The hook-manager tests commit and push through each manager into the built CLI, so they are E2E tests
          (`strategy-testing-methodology.md` § E2E) beside the existing real-hook ones, and `npm test` needs no Python
        - lefthook as a pinned `devDependency` of `packages/arc-framework` at v2.2.1 or later, with `"lefthook": false`
          in the root `allowScripts`. Its `postinstall` runs `lefthook install` in the installing repository outside
          CI, and npm only warns about an unlisted install script by default, so it would install lefthook's hooks over
          husky's; its binaries come from its platform packages, so the tests lose nothing
        - pre-commit.com at v4.4.0 or later (`unsupported_script` needs it), pinned through `pip` into a cached virtual
          environment the E2E global setup prepares; CI's E2E jobs gain a Python setup step (Task 7.6.b)
        - An unavailable tool fails its test with a provisioning message rather than skipping it

    - `[ ]` **5.1.b pre-commit.com's commit entries and hook types**
        - `ARC_PRE_COMMIT_HOOK` (`hook-integration.ts`) gains `pass_filenames: false`, `require_serial: true`, and
          `always_run: true`. `ARC_COMMIT_MSG_HOOK` drops `files: "^$"`, which rejects the message file, so
          pre-commit.com skips the entry on every commit; without it the entry receives `.git/COMMIT_EDITMSG`
        - `integratePreCommit` lists `commit-msg` and `pre-push` in `default_install_hook_types`, keeping `pre-commit`
          and any type already listed, since `pre-commit install` installs only the listed types, and tells the person
          to re-run `pre-commit install` when it changes the list
        - Build `test-first` (one behavior at a time):
            - the generated entries carry their fields, and the configuration lists the three hook types
            - an existing `default_install_hook_types` keeps its entries

    - `[ ]` **5.1.c One dispatch per commit**
        - Each integration installs its hooks as a person does: husky's `prepare`, `lefthook install`, plain
          `pre-commit install`, and `core.hooksPath`
        - Build `test-first` (one behavior at a time):
            - under each of the four integrations, a commit dispatches `arc check pre-commit` once
            - a commit that only deletes files dispatches it too
            - under each integration, ARC's commit-message check receives the message file
            - `hooks.pre_commit: disabled` dispatches nothing

### `[ ]` **5.2 A merge conclusion gates only what the merge produced — D8**

- _Goal:_ Concluding a merge runs the commit gate over its conflicted paths and resolution edits, never over the whole
  merged-in change.

    - Conflicted paths are `MERGE_MSG`'s lines that start with a tab, bare or after `#`, read through
      `git rev-parse --git-path MERGE_MSG` so a linked worktree reads its own. Paths matching no parent come from the
      combined diff `git diff --name-only -z <tree> <first parent> <merged-in parents...>`, as pre-commit.com's
      `get_conflicted_files` reads both
    - Build `test-first` (one behavior at a time):
        - with `MERGE_HEAD` set, the change is the paths `MERGE_MSG` lists as conflicted plus every path whose staged
          content matches no parent
        - an edit made while resolving is selected, and a cleanly merged-in path is not
        - a conflicted path resolved by taking one side is still selected
        - in a linked worktree, the conclusion reads that worktree's own `MERGE_MSG`
        - selection and widening then apply as at any commit, and the base is `HEAD`, the first parent, with
          `ARC_CHECK_MERGED` listing the commits `MERGE_HEAD` names

### `[ ]` **5.3 Partially staged inputs refuse, and a person may skip named checks — D8**

- _Goal:_ The commit gate never certifies bytes the commit will not carry, and a person can step around named checks
  for one commit through a channel no agent run reaches.

    - `[ ]` **5.3.a Partially staged refusal**
        - Build `test-first` (one behavior at a time):
            - a staged path inside a selected check's inputs that also carries unstaged edits refuses with exit 2,
              naming the paths and both remedies
            - staging the whole file lets the retried commit through, as does skipping the named checks
            - other unstaged and untracked files never refuse
            - under pre-commit.com and lefthook, the refusal sees no unstaged edits

    - `[ ]` **5.3.b `ARC_SKIP`**
        - Build `test-first` (one behavior at a time):
            - the hook forms skip the named checks, report them `skipped`, and never record them
            - an id the declaration does not declare is reported and ignored
            - every other request form ignores `ARC_SKIP`
            - ARC's structural checks are not skippable through it

### `[ ]` **5.4 Commit-hook fixes restage or fail — D7, D8**

- _Goal:_ A fixer's rewrites at the commit hook either land in the commit or fail it, as the declaration says, never
  committing unfixed content silently and never losing a person's set-aside changes.

    - Build `test-first` (one behavior at a time):
        - `restage` stages a fixer's rewrites of the commit's paths into the index Git hands the hook right after it
          runs, before its record, the next fix-capable check's turn, and the checked tree's computation, under a plain
          `git commit` and under `git commit -a`
        - a fixer's pass at the hook is recorded under the index carrying its restaged rewrite, so a later commit of the
          unfixed content does not reuse it
        - with two fixers at the hook, the second looks up over the index carrying the first's restaged rewrite, so a
          pass it recorded over the earlier content is not reused
        - a restage that fails fails the hook
        - `fail` fails the hook when a fixer rewrote a file, leaves the rewrite in the worktree, and records no pass for
          that fixer: with the rewrite discarded, a later commit of the unfixed content runs it again
        - `restage` acts as `fail` under pre-commit.com (its `PRE_COMMIT` variable), under lefthook (the hook manager
          `detectHookManager` reports), and for a path-limited commit's temporary index
        - under pre-commit.com and lefthook v2.2.1 or later, a fix overlapping set-aside changes leaves those changes
          restored

### `[ ]` **5.5 A push gates the checked-out branch's pushed range — D8, D12**

- _Goal:_ `arc check pre-push` gates exactly the checked-out branch's pushed content, skips what it cannot or must not
  check, and names the ref it gated when it fails.

    - Build `test-first` (one behavior at a time):
        - ref lines come from standard input, and otherwise from pre-commit.com's `PRE_COMMIT_*` variables, which also
          supply the remote when the arguments are empty
        - refs under `refs/arc/*` and deletions are skipped, and a push carrying only those runs no gate
        - only `refs/heads/<current branch>` is checked, at its pushed tip; any other pushed ref is `not selected` with
          that reason
        - the range starts at the remote's old tip, or for a ref new to the remote at the pushed tip's merge base with
          the base branch, including when pre-commit.com omits its from and to refs
        - a failure names the gated ref
        - a push with no ref lines checks nothing
        - a worktree ahead of the pushed tip labels the run and leaves it unrecorded
        - a `segment` run over the same range is reused

### `[ ]` **5.6 The shipped pre-push hook dispatches the push gate — D8, D12**

- _Goal:_ A failing push gate blocks the push under every hook manager, while the force-push advisory stays advisory and
  leaves state refs alone.

    - `[ ]` **5.6.a Shipped pre-push and its prose**
        - The package's `githooks/pre-push` reads the ref lines once, runs the advisory over them (skipping
          `refs/arc/*`), then passes the same lines to `arc check pre-push "$1" "$2"`; the verb's exit status becomes
          the hook's, which replaces its unconditional `exit 0`
        - CLI resolution and its fallback as in Task 2.3; `hooks.pre_push: disabled` turns off both the advisory and
          dispatch
        - Rewrite, for gate dispatch, the hook's own header (its advisory-only and never-blocks passages and its
          rationale for running without `set -e`), the never-blocks passages and the `hooks.pre_push` row in
          `githooks/README.md`, and the `hooks.pre_push` comment in `arc-config.yml`. Sync the hook and README to
          `.arc/`; `arc-config.yml` is configurable, so its project copy's comment is edited in place

    - `[ ]` **5.6.b Hook-manager push entries**
        - lefthook's `arc-pre-push` entry gains `use_stdin: true`; pre-commit.com's `ARC_PRE_PUSH_HOOK` gains
          `always_run: true`

    - `[ ]` **5.6.c Push dispatch under every manager**
        - `e2e/pre-push.e2e.test.ts` keeps testing the advisory alone: its header and its never-blocks test change, and
          it runs the hook with a restricted `PATH`, as `e2e/commit-msg.e2e.test.ts` does, so no CLI dispatches
        - Build `test-first` (one behavior at a time):
            - under each of the four integrations, a push dispatches once and a failing push gate blocks it
            - wherever the hook receives ref lines (husky, lefthook, and `core.hooksPath`), the advisory still warns,
              never blocks, and skips `refs/arc/*`; under pre-commit.com, which passes no ref lines on standard input,
              it stays silent
            - `hooks.pre_push: disabled` dispatches nothing

### `[ ]` **5.7 Update upgrades existing generated hook entries — D8**

- _Goal:_ An existing install gets the entries gate dispatch needs in the same update that brings dispatch, and is told
  about any entry it could not upgrade.

- _Context:_ `arc update` calls no hook integration today; only the commit-msg entries have an in-place upgrade
  (`integrateLefthook`'s legacy rewrite, husky's `migrateExactHookLine`).

- _Approach:_ update runs its own upgrade step after the file sync, as it calls `configureRoadmapConflictRemedy`
  (`update.ts`), rather than `integrateHooks`, which adds missing entries at init. It recognizes ARC's entries by their
  ids (`arc-pre-commit`, `arc-commit-msg`, `arc-pre-push`) at the current hook path and reports any other shape rather
  than migrating it. It rewrites a configuration through the `yaml.load` and `yaml.dump` round-trip init uses, only when
  an entry changes; that drops the file's comments, so the summary names each file it rewrote.

    - `UpdateResult` and `buildUpdateSummary` (`update.ts`) carry the report; `update.test.ts`'s summary literals and
      `hook-integration.test.ts`'s generated-shape fixtures change with the new shapes
    - Build `test-first` (one behavior at a time):
        - update rewrites an existing generated lefthook pre-push entry, the pre-commit.com commit, commit-msg, and push
          entries, and pre-commit.com's hook types to their current shape, names the file, and says to re-run
          `pre-commit install` when the hook types changed
        - an up-to-date configuration is not rewritten
        - an entry it cannot recognize as generated is left alone and reported in the update summary
        - a configuration it cannot parse is reported, and the rest of the update completes
        - an install under husky or with no hook manager is unaffected

### `[ ]` **5.8 ARC's ROADMAP remedy commit runs no commit gate — D8**

- _Goal:_ ARC's ROADMAP-conflict remedy commit concludes the way a clean merge does, so a red gate cannot abort it as
  `remedy-refused`, and `new-head` verifies both merge paths alike.

    - Build `test-first` (one behavior at a time):
        - `mergeAppendOnly`'s remedy commit (`merge-composition.ts`) runs `git commit --no-edit --no-verify`, pinned in
          `merge-composition.test.ts`, whose remedy tests check no commit arguments today
        - with ARC's commit hook installed and a failing declared check, the remedied merge still concludes
        - the clean and the remedied merge both return `merged / run-quality-gates` (`mergeExpectedBase` in `merge.ts`)

### `[ ]` **5.9 Gates dispatch under every hook manager** — validate exit criterion at segment scope

- _Goal:_ The segment's exit criterion holds under all four integrations through the built CLI and ARC's shipped
  hooks, recorded as the scenarios run and their results.

## **Phase 6:** Fire sites, vocabulary, and retirement

_Purpose:_ Sweeps the enumerated tier surface: each shipped gate step becomes one `arc check` request, the vocabulary
and knowledge move to the gate model, code identifiers and emitted text are renamed, and the three retired surfaces
leave the install with the bootstrap carrying their content.

_Mode:_ `replication` — closes when the enumerated tier-sense inventory is exhausted and batch-verified.

_Exit criterion:_ A search over the inventory finds the tier names only in their unrelated senses and in the stored
`verificationKind: "tier-3"` value with its `arc attest` echo; each shipped gate step is one `arc check` request; and
`arc update` over an install carrying the retired surfaces writes a gate-unset proposal and reports every source.

_Design decisions:_ From Task 6.1 until Task 7.4 lands this repository's declaration, `arc check increment` reports
`none declared` here, so each increment boundary in that span also runs this repository's QUICK-REFERENCE Tier 1
commands. The `.husky/pre-commit` chain keeps enforcing at commit throughout.

### `[ ]` **6.1 Workflow and method gate steps name the verb — D6**

- _Goal:_ Every shipped gate step is one `arc check` request from the fire-site translation, so no workflow or method
  names a tier or a command list.

- _Context:_ `self-review.md` and `review-response.md` are methods; the rest are workflows. Each edit lands in the
  package source and syncs to `.arc/`. The retired surfaces' frontmatter declarations and extension markers stay for
  Task 6.5, which removes them with their files. A link definition goes in the batch that removes its last use, since
  Markdown lint rejects an unused one (MD053).

- _Note:_ each integration test that asserts gate-step wording changes in the batch that rewrites its workflow:
  `delivery-workflow`, `prepublication-workflow` (its `[quality-gate-commands method]` literals included),
  `review-gate-workflows`, `pr-open-extensions`, `delivery-rebuild-base-movement`, `integration-reconcile-workflow`,
  and `delivery-window-base-movement`. `evidence-applicability-doctrine` reads `DEV-RULES.ARC.md` and changes with Task
  6.2.a; `delivery-workflow`'s `tier1ReuseCriteria` assertion changes with Task 6.3.b.

    - `[ ]` **6.1.a Task loop**
        - `process-task-loop.template.md`: item 1's Tier 1 step goes, and item 4 requests `arc check increment` once,
          immediately after its `[x]` and completion note, ahead of the delivery correction acknowledgment and the
          completion extension, so the checked tree is the committed tree; the pre-report checklist's quality line
          confirms that request's result rather than making another. Deferred review makes the request
          after each task's `[x]`, and the completion note's exclusions drop "Tier 2 clean"
        - Item 4's unresolved member-report branch, which leaves the closing task `[ ]`, makes the same request after
          recording the preserved report, and reports its result as the branch's verification status
        - A task carrying the segment-verifier role suffix requests `arc check segment` in place of `increment`, keyed
          on the task in hand as the verifier's scenario step already is, so no step evaluates a segment's mode. A
          `segment` result still red once obvious fixes are re-run takes the verifier's `[x]` and completion note back
          out, and, as on the unresolved member-report branch, the completion extension and the completion-only
          checklist do not run, so the segment stays open whichever answer the gate-failure prompt gets
        - Item 2 keeps its triggers, its test-coverage step, and its verification before reporting; only its Tier 2 run
          goes, since item 4's request covers the increment

    - `[ ]` **6.1.b Errand and supplemental workflows**
        - `run-errand.md`: a pass or approved review fix requests `arc check increment`; a base merge's
          `merged / run-quality-gates` requests `arc check new-head --from <pre-merge head>`
        - `self-review.md` over approved fixes, `integrate-external-content.md`'s Tier 1 step, and
          `clean-work-unit.md`'s Markdown lint request `arc check increment`
        - `integrate-external-content.md`'s extension examples drop "additional quality checks after each task" and
          `post-task-quality`; `amend-design.md`'s sentence that it names no tiers says the verb's selection decides
          which checks re-run

    - `[ ]` **6.1.c Lifecycle workflows**
        - `verify-work-unit.md` requests `arc check gate merge --force`
        - `integrate-work-unit.md`: the completion-content commit requests `arc check increment`; a review-driven
          change, an applied `arc wu reconcile` correction, and each staged boundary correction `arc check gate commit`;
          a `merged / run-quality-gates` head `arc check new-head --from <pre-merge head>`; and convergence
          `gate push --range --force` (`focused`) or `gate merge --force` (`full`)
        - `prepare-work-unit.md`: an approved correction-path fix requests `arc check gate commit`; convergence and its
          final run as above

    - `[ ]` **6.1.d Delivery and review**
        - `deliver-stack.md`: a review fix's `verification.target` requests `arc check gate commit --all --force` and a
          delivery member `arc check gate push --all`, each in its own checkout; its field name moves in Task 6.3
        - `review-response.md`'s `ready-to-fix` verification names its caller's review-fix request

### `[ ]` **6.2 Briefs, rules, strategies, and references move to the gate model — D1, D10**

- _Goal:_ The always-loaded and reference surfaces teach the gate model (one vocabulary entry, gates named by event,
  kind as its clause), with every gate-sense passage rewritten by sense and nothing pointing at a tier.

- _Context:_ adopter-facing surfaces state what is, with no transitional framing and no pointer to internal work
  (`DEV-RULES.PROJECT.md` § Audience Boundaries).

    - `[ ]` **6.2.a Brief and ARC rules**
        - `AGENT-BRIEF.ARC.md`: the quality gate vocabulary entry with kind as its clause, worded to agree with
          § Rule Authority; it replaces the **Quality gates** paragraph and the `Class` entry's tier clause
        - `DEV-RULES.ARC.md`: the opening line placing gate commands; the `--no-verify` invariant extended to
          `ARC_SKIP`; the integration-candidate clause naming the `new-head` preset; the tier-definitions load line
          removed

    - `[ ]` **6.2.b Strategies**
        - `strategy-quality-gates.md` shrinks to what an operator needs that the verb cannot say, and its
          `STRATEGY-INDEX.md` entry becomes a directive firing condition. It keeps one sentence on placing a
          related-tests check: at the push gate, with the merge quality gate's whole-suite run catching what the
          import graph misses, unless changes often reach the tests through inputs no import graph shows; then a
          whole-suite check holds the push gate, and the related-tests check has no gate and is requested by id at the
          increment boundary
        - The gate-sense passages and retired-surface references in `strategy-configurability-architecture.md`,
          `strategy-session-operations.md`, `strategy-integration.md`, and `strategy-file-classification.md`; their
          configurability and context-loading tiers stay
        - Rewritten passages name no stack tool as a default

    - `[ ]` **6.2.c References and templates**
        - `QUICK-REFERENCE.template.md` loses § Quality Gate Commands, its entry in the on-demand section list, and its
          strategy pointer
        - `template-contributing.md`'s setup verification requests `arc check gate merge` in place of its `npm` command
          block and its QUICK-REFERENCE pointer
        - The package's `DEV-RULES.PROJECT.md`: the zero-tolerance policy holds per gate at its deadline, keeping its
          `[invariant]` marker; its tiered line is rewritten to the gate model; and its comment recording each gate's
          command in QUICK-REFERENCE § Quality Gate Commands points to the declaration instead
        - `generate-tasks.template.md`'s checkpoint pointer, `extensions/README.md`'s gate passages, and
          `01_verify-and-configure.md`'s `post-task-quality` reference

    - `[ ]` **6.2.d This repository's technical overview**
        - `TECHNICAL-OVERVIEW.md`: § 2 gains the check declaration as a fourth customization mechanism, its methods
          bullet drops "quality gate commands", and its extensions bullet drops the unit hook point; § 4 replaces
          "Tiered approach" with the gate model

### `[ ]` **6.3 Code identifiers and emitted text drop the tier names — D1, D10**

- _Goal:_ No code identifier or emitted string names a tier, apart from the stored `verificationKind: "tier-3"` value
  and its `arc attest` echo.

    - `[ ]` **6.3.a Confirm no delivery record exists**
        - Look for records under the Git directory's `arc/delivery`, `arc/delivery-gates`, and
          `arc/delivery-resolutions`; if one exists, stop for direction before renaming

    - `[ ]` **6.3.b Rename delivery's identifiers**
        - `tier1Required` (11 sites), `tier1ReuseCriteria` (4), `ReviewFixTier1VerificationSchema` (2), and the `tier1`
          field (5) across `delivery-execution.ts` and `lib/delivery/`'s `landing.ts`, `entry-inspection.ts`,
          `review-fix-verification.ts`, `review-fix.ts`, `review-fix-continuation.ts`, and
          `suffix-rematerialization.ts`, with their tests, `helpers/delivery-position-suite.ts`, and
          `deliver-stack.md`'s field reference; the tests include `unit/delivery/suffix-reconciliation.test.ts`,
          `e2e/delivery-terminal-recovery.e2e.test.ts`, and `integration/delivery-workflow.test.ts`
        - Targets follow the translation (a review fix's Tier 1 is its commit gate): `commitGateRequired`,
          `commitGateReuseCriteria`, `ReviewFixCommitGateVerificationSchema`, and `commitGate`
        - The `gates://tier-N` evidence strings in the delivery fixtures (`delivery-position-suite.ts`, `review-fix`,
          `review-fix-continuation`, `delivery-execution`, and `candidate-attestation`) name the gate they stand for

    - `[ ]` **6.3.c Emitted text and comments**
        - `entry-inspection.ts`'s "Tier 1 checks" names the commit gate; `eligibility.ts`'s "Tier 2 outcome" comment
          names the push gate; the convergence remedy in `integration-boundary-locus.ts` names
          `arc check gate merge --force`
        - `verificationKind: "tier-3"` and `attest.ts`'s echo keep their spelling

### `[ ]` **6.4 Bootstrap proposes a declaration from existing gate commands — D2**

- _Goal:_ A project's existing gate commands survive the tier surfaces' retirement as a gate-unset proposed declaration
  on update, and initial setup authors a declaration with the person.

    - `[ ]` **6.4.a Extraction**
        - Sources as they stood before the command wrote anything, all read before `applyChangePlan`:
          `QUICK-REFERENCE.md` § Quality Gate Commands, which a Configurable merge may rewrite; the
          `quality-gate-commands` override section when active; and the two extensions' `.actions` when populated.
          Reconfigure may delete a retired file or drop it from tracking (`applyRemovalDecisions`), so nothing is read
          after apply
        - Tier headings match by their `Tier N` token, since heading text varies by project
        - Build `test-first` (one behavior at a time):
            - each command line in a tier's fenced `bash` or `sh` block, other than comments and bracketed
              placeholders, becomes one proposed check with a `shell: true` string command
            - its gate is unset, with a comment naming the mapped gate (Tier 1 or `post-task-quality` to `commit`,
              Tier 2 or `post-unit-quality` to `push`, Tier 3 to `merge`) and a comment naming its source
            - a command found at several tiers is proposed once, mapped to the earliest
            - an action written as prose is reported as unextractable

    - `[ ]` **6.4.b Write and report in `arc update` and `arc reconfigure`**
        - One function, called from `runUpdate` (`update.ts`) and `runReconfigure` (`reconfigure.ts`) when the change
          plan's removals (`buildChangePlan`) include a retired surface; each command reports through its own summary
          (`buildUpdateSummary`, and the result `handleReconfigure` renders in `handlers/init.ts`)
        - Its tests drive it with a change plan whose removals carry the retired surfaces, since the shipped recipe
          lists them until Task 6.5.a
        - Build `test-first` (one behavior at a time):
            - with no declaration, update writes the proposal and reports every extracted and unextractable source
            - with a declaration present, it writes nothing and still reports
            - a reconfigure whose plan retires the surfaces writes the proposal whether the person removes the files or
              keeps them untracked
            - no proposed check has a gate, so no hook dispatches it and no gate request selects it
            - the written proposal opens with the reference `editorDocumentReference` returns for its path

    - `[ ]` **6.4.c Initial setup authors the declaration**
        - `02_define-project.template.md`'s Step 4 tier question becomes authoring the declaration with the person,
          validated with `arc check gate merge --dry-run`; the step's other passages that collect or record per-tier
          commands go with it, and the rewritten step names no stack tool as a default
        - Step 5's question "What quality checks must pass before every commit?" asks which checks must pass before
          each gate's event
        - The step's declaration opens with its editor reference: the modeline line `editorDocumentReference` returns
          for `.arc/system/arc-checks.yml`, written into the template, since the step cannot call the function
        - Build `test-first` (one behavior at a time):
            - `arc init` installs no declaration
            - in `integration/framework-sync.test.ts`, the contract suite that reads shipped content, the template's
              reference line equals the reference `editorDocumentReference` returns for `.arc/system/arc-checks.yml`

### `[ ]` **6.5 Retire `quality-gate-commands`, `post-task-quality`, and `post-unit-quality` — D10**

- _Goal:_ The three retired surfaces leave the install with every structural reference to them, and every surviving
  shipped file keeps an `init-recipe.json` disposition.

- _Context:_ check the recipe in both directions; a removed declaration's fire-point markers are not validated, so
  verify each by hand.

    - `[ ]` **6.5.a Files, recipe, and classification**
        - Delete the three files from the package and `.arc/`; drop their `init-recipe.json` `include_files` entries
          and `CONFIGURABLE_FILES` entries (`classification.ts`); regenerate this repository's manifest

    - `[ ]` **6.5.b Declarations and markers**
        - Remove `quality-gate-commands` from the `arc.methods` of `process-task-loop.template.md`,
          `integrate-work-unit.md`, `prepare-work-unit.md`, and `verify-work-unit.md`
        - Remove `post-task-quality` and `post-unit-quality` from the `arc.extensions` of
          `process-task-loop.template.md` and `run-errand.md`, with their markers; `lint:arc:triggers` and
          `validate-extension-points` stay clean

    - `[ ]` **6.5.c Scanners, validators, and tests**
        - The doc comments in `point-scanner.ts`, `frontmatter/extension.ts`, and `validate-extension-points.ts`
        - Tests that name the files: `init` (unit and integration), `init.e2e`, and `update`; fixtures in `extensions`,
          `status`, `extensions-format`, `orphan-detector`, `point-scanner`, `frontmatter/extension`,
          `validate-extension-points`, `validate-frontmatter`, and `validate-package-neutrality` move to other names

    - `[ ]` **6.5.d Sync strategy counts**
        - `strategy-package-project-sync.md`'s Configurable list and counts (46 to 43; installed files 153 to 150),
          which `framework-sync.test.ts` asserts from the recipe

    - `[ ]` **6.5.e Update over an install carrying the retired surfaces**
        - Build `test-first` (one behavior at a time):
            - update keeps the three files for review, writes the gate-unset proposal, and reports every source
            - update upgrades the install's generated hook entries in the same run

### `[ ]` **6.6 Tier-sense inventory exhausted** — validate exit criterion at segment scope

- _Goal:_ The segment's exit criterion holds over the whole inventory: the sense search, every shipped gate step, and
  the update over an install carrying the retired surfaces, recorded as the searches and scenario run and their
  results.

## **Phase 7:** This repository as first consumer

_Purpose:_ Configures this repository's existing checks into its declaration, proving each configurable element,
retires the `.husky/pre-commit` chain, and wires CI to the declaration.

_Mode:_ `slice` — closes on this repository's checks running from its declaration through hooks, workflow steps, and CI.

_Exit criterion:_ This repository's commits and pushes run its declared checks through ARC's hooks with the
`.husky/pre-commit` chain gone and no check list outside the declaration, and its CI runs the merge quality gate from
the dry-run list, its setup job failing on a map entry that names an id the dry run does not list.

_Design decisions:_ Tasks 7.1 to 7.3 still run this repository's QUICK-REFERENCE Tier 1 commands at each increment
boundary; from Task 7.4 on, `arc check increment` runs the declaration.

### `[ ]` **7.1 Markdown gates read the index the verb points them at — D11**

- _Goal:_ `lint:md` and `lint:md:staged` read the index the verb hands them, so as `reads_index` checks they certify
  the checked tree at the commit hook, under `git commit -a` included, and at the increment boundary.

- _Context:_ ARC's Git executors drop an inherited `GIT_INDEX_FILE` from any call given a working directory
  (`environmentForGitCwd`); `GitExecOptions.indexFile` exists, but only `createExecaGitExec` honors it, and
  `RawGitExec`'s options have no such field.

    - `lint:md:staged` drops its own trigger detection (`runStagedMarkdownGate` over `git diff --cached`), which finds
      nothing wherever the checked tree is `HEAD`: the push hook, a forced merge request over a clean tree, and CI.
      The verb's selection over its declared inputs replaces it, so the script certifies the index whenever it runs
    - `runStagedMarkdownGate` and its unrelated-path test (`unit/markdown/staged-gate.test.ts`) go with the detection;
      `enumerateStagedMarkdownGatePaths` stays for `lint:md`'s drift guard. Until Task 7.4 retires the
      `.husky/pre-commit` chain, the chain's `lint:md:staged` certifies the index on every commit
    - Build `test-first` (one behavior at a time):
        - `RawGitExec` takes `indexFile` and `createExecaRawGitExec` honors it, so `readGitBlobEntry` reads a given
          index
        - `lint:md:staged` passes an inherited `GIT_INDEX_FILE` as `indexFile` and checks that index's content
        - with the index equal to `HEAD`, a committed Markdown violation fails `lint:md:staged`
        - `lint:md`'s drift guard (`findStagedMarkdownWorktreeDrift`) compares that index, not the repository's own,
          with the worktree
        - with no `GIT_INDEX_FILE` inherited, both read the repository's own index
        - at the commit hook under `git commit -a`, both read the index Git hands the hook

### `[ ]` **7.2 `format:tables` formats an untracked artifact — D11**

- _Goal:_ A new, untracked Markdown artifact formats at the increment boundary like a tracked one, and the drift guard
  no longer fails after it.

    - `migration-audit.ts` shares the validator, so its explicit-path form admits what its no-path form already
      enumerates from the `worktree` source
    - Build `test-first` (one behavior at a time):
        - `validateExplicitMarkdownPaths` (`selection.ts`) admits an untracked path Git's exclude rules allow, through
          `enumerateTrackedMarkdownPaths`' `worktree` source
        - an ignored path still refuses, named as ignored rather than untracked
        - the migration audit given an untracked path reads it as its no-path form does

### `[ ]` **7.3 The package-sync check reads the exported base and merged-in parents — D11**

- _Goal:_ `check-package-sync.sh`, as a `files` check reading the index, still catches a blind copy over any range
  while passing content a merge brought in.

    - The script takes its paths from its arguments rather than `git diff --cached`, reads both copies from the index
      rather than the package copy from the worktree, and counts a Framework file's package counterpart as changed when
      it is among the paths it received
    - Called with no paths, as the `.husky/pre-commit` chain calls it until Task 7.4 retires the chain, it keeps
      checking the staged paths against `HEAD`
    - Build `test-first` (one behavior at a time):
        - it checks the paths it receives, over a range whose checked tree is `HEAD` included
        - it reads each path's prior content at `ARC_CHECK_BASE` rather than `HEAD`, and both copies' content from the
          index the verb points it at
        - content equal to a merged-in parent's (`ARC_CHECK_MERGED`) passes, over one merge's range and over a longer
          range carrying one
        - an override a merged-in parent's two copies no longer differ on is not counted
        - an identical edit of both copies after a base merge dropped their override passes
        - a blind copy still fails at its own commit
        - given paths with no `ARC_CHECK_BASE` exported, it fails, naming the missing base
        - called with no paths, it checks the staged paths against `HEAD` as before

### `[ ]` **7.4 This repository's declaration replaces the hook chain and gate blocks — D11**

- _Goal:_ Every check this repository runs locally or in CI is declared once in `.arc/system/arc-checks.yml`, with
  each configurable element proven, and the hook chain and gate blocks that listed checks are gone.

    - `[ ]` **7.4.a Code and Markdown checks**
        - Map the QUICK-REFERENCE gate blocks and `DEV-RULES.PROJECT.md`'s relevance table to inputs and gates
        - `lint:md:staged` as a `project` check with `reads_index: true` over what triggers it today
          (`isMarkdownGateTriggerPath`, `MARKDOWN_GATE_INPUT_PATHS`, and the checker's import closure from
          `resolveIndexedMarkdownCheckerPaths`, declared as `packages/arc-framework/src/**`); `lint:md` with
          `reads_index: true`; the `lint:arc:*` checks
        - `lint:ts:file` as a `files` check with `root: packages/arc-framework`; `typecheck` and `typecheck:test` as
          `project` checks over the TypeScript inputs; `lint:sh` with `shellcheck --version` as a runtime input
        - `lint:ts` as a `project` check at the push gate, since only a whole-package run reports an unused suppression;
          `lint:ts:file` stays at the commit gate, so the merge gate runs both over every TypeScript path
        - `check-package-sync.sh` as a `files` check with `reads_index: true` over both copies; `format:tables` with
          `fixes: true`; `build`

    - `[ ]` **7.4.b Test checks**
        - `test:changed` as a gate-less `files` check, requested by id with the local E2E check (Task 7.5): the unit
          test checks enforce at push, and at the push gate it would join the merge gate and rerun the whole unit
          suite over every path. It receives the verb's changed paths, with `local-vitest-runner.ts` taking paths in
          place of its `--changed=main` selection, and its inputs are the TypeScript it finds tests for by import.
          `unit/vitest-controller-logic.test.ts` pins that selection and changes with it
        - The unit and integration test checks at the push gate, with the whole-tree inputs less `.arc/active/**`,
          `.arc/backlog/**`, and `.arc/completed/**`. `integration/decompose-v3-repository-plan.test.ts`
          (`copiedRealNotesRepository`) reads an archived work unit from `.arc/completed/`; it reads a byte-identical
          copy among its fixtures instead, the files named `spec.md`, `tasks.md`, and `notes.md` so the descriptor
          lint's task-list pattern (`TASK_LIST_PATH_RE` in `descriptor-worktree.ts`) skips them. Then confirm that no
          other test reads those trees from the repository rather than from a fixture it builds
        - `test:arc-contracts` (`ARC_CONTRACT_SUITES` in `local-vitest-runner.ts`) at the commit gate, with
          `packages/arc-framework/arc/**`, `.arc/system/**`, and `.arc/reference/**` among its inputs
        - Unit, integration, and E2E tests sharded as the CI layout shards them (2, 4, and 4), each with the argument
          `--shard={index}/{count}`; E2E, `test:portability`, and `test:portability:macos` `ci_only`, the last run on
          macOS only (Task 7.6.c)
        - The local E2E check: a gate-less `files` check over the whole E2E tree, support files included, with
          `cache: false`, whose command is a repository script that runs the whole suite whatever paths it receives

    - `[ ]` **7.4.c Global inputs**
        - The lockfile and tool configuration as global inputs; a global runtime input fingerprinting
          `node_modules/.package-lock.json`

    - `[ ]` **7.4.d Retire the chain and the gate blocks**
        - `.husky/pre-commit` keeps only ARC's hook, and `integration/markdown-staged-hook.test.ts`, which asserts the
          chain, changes with it
        - `scripts/check-ts-quality.sh` goes, with `integration/focused-lint-staged.test.ts`, which runs it, and its
          entry in `audits/coupling-blast-radius/manifest.json`'s `repoRootDelta`
        - `check-package-sync.sh`'s no-argument staged form goes with the chain, leaving only the paths the verb passes
        - This repository's QUICK-REFERENCE § Quality Gate Commands goes, with its entry in the on-demand section list
          and § Environment & Path Context's pointer to it, its measured costs now recorded by the verb

    - `[ ]` **7.4.e Prove it on this repository**
        - `arc check gate merge --dry-run` validates the declaration; a commit through ARC's hook runs and reuses the
          declared checks; a new, untracked Markdown artifact formats at the increment boundary
        - `arc check gate push --dry-run` over a change to one shipped workflow selects the unit and integration test
          checks, and over a change only to planning-state Markdown selects no code check
        - `arc check gate commit --dry-run` over a change only to `packages/arc-framework/src/lib/git/exec.ts`, in the
          checker's import closure but not in `MARKDOWN_GATE_INPUT_PATHS`, selects `lint:md:staged`
        - The declaration keeps `commit_fixes: restage`, and no check declares `shell: true` or `widen: false`

### `[ ]` **7.5 Project rules and strategies name the gates — D10, D11**

- _Goal:_ This repository's rules state zero tolerance per gate and its one by-id feedback request, leaving selection,
  reuse, and the re-run rule to the verb and its fire sites.

    - `DEV-RULES.PROJECT.md` § Quality Gates: the zero-tolerance policy holds per gate at its deadline; the tiered line
      and § Selecting what to run shrink to it, keeping one increment-boundary request by id, of the local E2E check and
      `test:changed` over `--changed`, beside `arc check increment`
    - `strategy-testing-methodology.md` § Integration with Quality Gates is rewritten to the gate model
    - The root `CONTRIBUTING.md`'s § Quality Standards states the rule per gate rather than before any commit
    - `DEV-RULES.PROJECT.md`'s pointer to QUICK-REFERENCE § Quality Gate Commands for commands and measured cost goes

### `[ ]` **7.6 CI jobs come from the declaration's dry-run list — D9, D11**

- _Goal:_ This repository's CI runs the merge quality gate from the declaration, each check at the steps its id maps to
  or at the default step, with every per-check difference on the step that runs it, so no check is CI-only or
  local-only by omission.

- _Context:_ re-ground against the CI layout on the base branch before editing. These read `ci.yml` and change with it:
  `classify-change.test.ts`, which asserts that the `setup` job only prepares and derives heavy names from job
  conditions; `review-gate-workflows` and `duration-layout-workflow`; and `helpers/ci-build-fixture.ts`, which finds the
  build and its upload in `setup`, with `ci-build-transfer` and `ci-build-recovery`, which use it.
  `parseWorkflowE2EShards` (`test-cost/shards.ts`) keeps reading the E2E shard count from the matrix literal for
  `deriveEffectiveE2EShards` (`shard-run.ts`, called by `measure-e2e-shards.ts`), since the literal stays, held to the
  declared count (Task 7.6.a).

    - `[ ]` **7.6.a Setup job and the step map**
        - Runs `arc check gate merge --ci --dry-run --json` on every run the duplicate-push skip leaves, light runs
          included, and uploads its output as an artifact that every job running a check downloads, since a job output
          is capped at 1 MB
        - The map is one file keyed by check id, `.github/check-plumbing.yml`: per id, the steps that run it, each named
          by its job and step id. Each step the map names carries a step `id:` in `ci.yml`
        - The setup job validates the map against the dry-run list and `ci.yml`, failing when the map names an id the
          dry run does not list or a step `ci.yml` does not declare, or when a sharded check's job has a literal `shard`
          matrix other than one to its declared count, naming each. A contract test runs the same validation over this
          repository's map, workflow, and declaration, so a stale map fails `npm test` too
        - It runs only the dry run and the validation and prepares the duration input; the build moves to the `build`
          job (Task 7.6.b). The dry run runs the CLI from source
          (`node --import tsx packages/arc-framework/src/cli.ts`), as the duration step runs its script; the stale-build
          guard reads only a built `dist` entry (`isBuiltBundleEntry`)
        - Its checkout fetches full history and creates a local `main` at `origin/main` where the checkout left none,
          since checkouts there are shallow and carry no local base branch; Task 3.1.c then resolves the base, and the
          dry run's list carries `gate merge`'s merge base
        - Build `test-first` (one behavior at a time), over the validation:
            - a map entry naming an id the dry run does not list fails, naming the id
            - a map entry naming a step `ci.yml` does not declare fails, naming the step
            - a sharded check whose job's `shard` matrix differs from its declared count fails, naming the check
            - this repository's map, `ci.yml`, and declaration pass

    - `[ ]` **7.6.b Check and shard jobs**
        - Each mapped step runs, through one repository script beside `classify-change.sh`, run from source as the dry
          run is, the artifact's entries the map assigns to it, one shard's where its job has a shard matrix, resolving
          each working directory, relative to the repository root, against its own checkout and spawning as the verb
          does (Task 4.1.c's Windows handling): their invocations run natively, exporting the base, checked tree, and
          merged-in parents, and a fix-capable check that leaves the tree changed fails (`git diff --exit-code`)
        - The default step, in `lint-typecheck`, which runs on every push and pull-request run the duplicate-push skip
          leaves, light and heavy alike, runs every entry the map does not name
        - Each job running a check depends on the setup job, whose artifact it reads; `portability-cross-platform`,
          which needs neither `classify` nor `setup` today, gains that dependency
        - Shard plumbing stays outside the declaration, on the shard jobs and their steps: the duration-file
          environment, artifact steps, the build preflight and `ARC_E2E_SKIP_BUILD`, the E2E jobs' Python setup for the
          hook-manager tests (Task 5.1.a), and the unit shards' reporter arguments. `typecheck:test`'s `NODE_OPTIONS`
          stays on its own step
        - A new `build` job, under the condition `setup` carries today (heavy, dispatched, and scheduled runs), runs the
          `build` check at the step the map names and uploads the `dist` artifact. The jobs that download it depend on
          it through `needs:`; `lint-typecheck`, which downloads it only on heavy runs, also runs when it is skipped, as
          it does for `setup` today. `ci_ok`'s `needs:` and `HEAVY_CHECK_NAMES` gain it (Task 7.7.a), and
          `portability-cross-platform`'s legs keep their own install and build
        - Checkouts are shallow by default, so the job running `check-package-sync.sh` fetches the history its merge
          base needs
        - The first run records the `lint:ts` and `lint:ts:file` job times in the notes file, since the merge gate runs
          both over every TypeScript path
        - Build `test-first` (one behavior at a time), over the script:
            - a step runs exactly the entries the map assigns to it, and only the given shard's batches
            - the default step runs every entry the map does not name
            - an entry listed with a relative working directory runs from the script's own checkout
            - each invocation receives the base, checked tree, and merged-in parents the list carries
            - a fix-capable check that leaves the tree changed fails

    - `[ ]` **7.6.c Run conditions as plumbing**
        - Light and heavy weight (`test:arc-contracts` on light runs only, code checks on heavy runs only), the
          reviewed-lane condition, scheduled and dispatched runs with the `run_portability_pair` input, the
          duplicate-push skip, and the cross-platform runners stay in each job's and step's own `if:` and `runs-on:`, as
          today. Each check takes the conditions of the steps the map names for it: `test:portability` maps to the
          `portability` job's step and to `portability-cross-platform`'s, and `test:portability:macos` to the latter's
          macOS-only step (`if: runner.os == 'macOS'`)
        - `merge-ok`, the status `main` requires, keeps mirroring the `ci-ok` roll-up, which gathers every job

### `[ ]` **7.7 Heavy-job names and code-tree identity follow the declaration — D11**

- _Goal:_ The verified-tree lookback only ever reads a job list that was checked, and editing the declaration runs the
  heavy jobs.

    - `[ ]` **7.7.a `HEAVY_CHECK_NAMES` names the workflow's heavy jobs**
        - `classify-change.sh`'s list names every job a heavy reviewed-lane pull-request run runs, one per job or shard
          leg, plus the setup job (`Shared setup` today), whose pass a lookback match needs. It stays kept in the
          script, since its classify job runs before setup and without the CLI; its names are job names, which no
          declaration change touches
        - `workflowHeavyCheckNames`' contract test (`classify-change.test.ts`) keeps holding it equal to the workflow's
          heavy-conditioned jobs and their matrix legs, now counting the setup job, which runs on every run; its
          assertion that setup only prepares admits the dry run and the map validation
        - Each name is the check-run name GitHub reports: a job's `name:` with any matrix value substituted

    - `[ ]` **7.7.b Declaration in the code surface**
        - `CODE_SURFACE_GLOBS` (`change-facts.ts`) gains `.arc/system/arc-checks.yml`, which `GENUINE_DOCS_GLOBS`'s
          `.arc/*` classifies as documentation today, so it joins code-tree identity
        - Build `test-first` (one behavior at a time):
            - a declaration-only change classifies heavy
            - a lookback match needs a heavy run that passed on the same code tree, setup included

### `[ ]` **7.8 Editor completion proven end to end — D2**

- _Goal:_ The declaration type's generated document is proven against this repository's declaration, and that
  declaration opens with the reference an editor follows to the document.

    - This repository's declaration opens with the reference `editorDocumentReference` returns for
      `.arc/system/arc-checks.yml`
    - Build `test-first` (one behavior at a time), in the E2E tier, validating with
      `Ajv2020({ strict: true, allErrors: true })` as `integration/schema-command/editor-documents.test.ts` does:
        - the document `arc schema install` generates for `check-declaration` accepts this repository's declaration
        - it flags an unknown key at the top level, in a check, and in `shards`, where the CLI rejects one
        - this repository's declaration opens with the reference `editorDocumentReference` returns for its path

### `[ ]` **7.9 Measure the increment boundary against the baseline — SC17**

- _Goal:_ SC17's "after" figure exists over the same sample and method as Task 1.1, so the measured effect is a
  like-for-like comparison.

    - Replay Task 1.1's sample by its replay rule in a disposable clone at this work's tip, running
      `arc check increment` and the increment boundary's request by id that Task 7.5 writes (`test:changed` and the
      local E2E check over `--changed`), then committing through the commit hook per sample, and record the times
      beside the baseline in the notes file's SC17 section
    - Tool caches are warm as in Task 1.1, but the clone's reuse record (`.git/arc-checks/`) is cleared before each
      sample's timed request, so no timed request reuses a pass recorded by a warm-up or an earlier sample; the commit
      hook's reuse of that request's passes is part of what is measured

### `[ ]` **7.10 First consumer end to end** — validate exit criterion at segment scope

- _Goal:_ The segment's exit criterion holds on this repository: commits and pushes through ARC's hooks, a CI run from
  the dry-run list, and the setup job's refusal on an unlisted id, recorded as the scenarios run and their results.

## **Phase 8:** Verification

### `[ ]` **8.1 Complete verification** — load and follow `verify-work-unit.md`

---

## Success Criteria

- `[ ]` A commit right after `arc check increment` with nothing else changed executes no check, except a fixer whose
  inputs a later fixer rewrote, and a forced request executes every selected check (SC1)

- `[ ]` Selection runs only what a change reaches, widens on each of the four triggers, and leaves a deletion-only
  `files` change unselected (SC2)

- `[ ]` No check list exists outside the declaration, and removing a check removes it from hooks, steps, and CI (SC3)

- `[ ]` The tier names survive only in unrelated senses and the stored `verificationKind` value, and each shipped gate
  step is one `arc check` request (SC4)

- `[ ]` Gate membership and kind hold per request, independent of interlock settings (SC5)

- `[ ]` Every outcome and exit status is produced as specified, and `ARC_SKIP` is honored only by the hook forms (SC6)

- `[ ]` Every ARC refusal has a test of the refusal and of the retry after its remedy (SC7)

- `[ ]` Both gates dispatch once per event under every supported hook manager, with the push gate's ref scoping (SC8)

- `[ ]` Fixes apply at the increment boundary and restage or fail at the commit hook per integration (SC9)

- `[ ]` Merge conclusions and ranges carrying merges select and export as specified (SC10)

- `[ ]` Attestation runs never reuse, and nothing that attests reads the reuse record (SC11)

- `[ ]` `arc update` proposes a gate-unset declaration from the retired surfaces without activating a gate (SC12)

- `[ ]` This repository's CI runs the merge quality gate from the declaration (SC13)

- `[ ]` The generated editor document accepts this repository's declaration (SC14)

- `[ ]` The reuse record lives outside `.git/arc/`, its faults degrade to a run, and CI-facing output carries no ARC
  vocabulary (SC15)

- `[ ]` Shipped content installs no declared check and names no stack tool as a default (SC16)

- `[ ]` Per-increment check time is recorded before and after with its method (SC17)

- `[ ]` A declared check that creates and commits in a fixture repository passes under the commit hook and every
  request form, and only `reads_index` checks see an index equal to their checked tree (SC18)

- `[ ]` All quality gates pass (tests, linting, type checking)

- `[ ]` Ready for integration
