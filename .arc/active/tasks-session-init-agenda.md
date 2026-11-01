# Task List: session-init-agenda

- **Design:** `spec-session-init-agenda.md`

---

## **Phase 1:** Baseline and the agenda contract

_Purpose:_ Record the done-signal baseline before any shipped text changes, then settle the substrate every later
phase compiles into: the registered agenda schema, the verb with its flags and refusals, the probe composition the
verb shares with `arc status --session-init`, and the precedence order down to the stop rows.

_Mode:_ `layer` — closes on a settled agenda contract and a verb that validates, refuses, and compiles the stop rows.

_Exit criterion:_ The baseline is recorded from an unchanged base; `arc agenda session-init --json` prints an agenda
that validates against `arc schema get session-init-agenda` for the stop rows, refuses every invalid flag combination
with a typed refusal, and leaves the repository as found.

### `[ ]` **1.1 Record the done-signal baseline — Success Criteria 1–3**

- _Goal:_ Both parts of the done-signal have a baseline, measured by both instruments on a kit install of the unchanged
  base, before this branch changes any shipped text.

- _Note:_ The baseline must land before the first shipped-text commit. Planning-only commits since the base change
  nothing a kit install receives.

- **Additional Context:** `notes-session-init-agenda.md` § Sizing and measurement

    - `[ ]` **1.1.a Build the baseline kit install**
        - The kit lives in the primary checkout's identity directory, absent from this worktree:
          `/home/andrew/dev/repos/github.com/andrewRCr/arc-framework/.arc/user/andrew/cinexplorer-migration/kit/`
        - Confirm `rehearse-install.sh --help` accepts `--source`, then run it with `--source <this checkout>` while
          `packages/` is unchanged from the base; record the base SHA. Check `memcap_policy` first, since it builds and
          packs the package
        - The install's first commit fails on the broken links the recipe leaves, and the script continues past it
          with the primary dirty. Run the kit's `fill-link-targets.sh <sandbox> <run-dir>`, where `<sandbox>` is the
          run's `~/dev/scratch/arc-install-kit/<stamp>/` holding `paths.env` and `commit-msg.txt`, not the project under
          `~/dev/sandbox/<stamp>/`; it commits and pushes the install. Record that the fill ran
        - Confirm a session in the sandbox derives `free-primary` and enters Orient

    - `[ ]` **1.1.b Run the itemized headless instrument**
        - One `claude -p --output-format json --tools "" --no-session-persistence` run per item in the specification's
          Baseline table, the item fed on stdin so each run is one turn — `session-init.md`, both briefs, both
          `DEV-RULES`, `STRATEGY-INDEX`, `QUICK-REFERENCE` § Environment & Path Context, the
          `arc status --session-init --json` envelope, and the `arc-session` skill text — plus an empty run with the
          same flags
        - Each item's figure is `input_tokens` plus `cache_creation_input_tokens` plus `cache_read_input_tokens`, less
          the empty run's; confirm the field names at the first run
        - The script takes its item list as input, so Task 5.4 runs it unchanged over the result's items

    - `[ ]` **1.1.c Read the real-session instrument and record the baseline**
        - Two real sessions in the kit sandbox, each less an empty session on the same harness: one entering Orient,
          for Part 2's whole load before the first user-facing line, and one whose only read is the baseline
          `session-init.md`, for Part 1
        - Each is read from the harness context report (`/context`), which is readable only after the first response;
          record whether that response's tokens are included, and Task 5.4 applies the same rule
        - Raw outputs and the scripts under `~/dev/arc-evidence/session-init-agenda/baseline/`; a summary table in
          `notes-session-init-agenda.md` § Sizing and measurement, with the base commit, the harness version, and
          whether the link fill ran

### `[ ]` **1.2 Register the agenda contract — § 3, § 2.3**

- _Goal:_ `arc schema get session-init-agenda` serves the agenda's shape — every step type, choice kind, `then`, nudge
  marker, and orientation shape — and a runtime assertion rejects any agenda that breaks the contract's
  cardinalities.

- _Approach:_ A new module set beside the probe composer (`commands/agenda/`), split by concern so each file stays
  inside the size gate: verb and precedence, steps and schema, sync compilation, surfaces, and the cutover module.

- _Note:_ Cross-field rules are refinements, which the served JSON Schema omits, so their tests target the runtime
  schema or the assertion.

    - `[ ]` **1.2.a Define the agenda schema**
        - Strict Zod objects for § 3.1 and § 3.2, with `.describe()` text on fields an agent reads
        - `read` reuses `LoadSetPathSchema` and `ReadModeSchema` (`lib/load-set/types.ts`) and `TaskListCursorSchema`
          (`lib/task-list/cursor.ts`); `ExecutableAction` extends `SessionActionSchema` (`lib/session-init/actions.ts`)
          with `argv` required; `residual` references the registered `config-session-init`, `release-routing`,
          `domain-rules-session-init`, and `inbox-state` schemas
        - Build `test-first` (one behavior at a time):
            - each step type and choice kind parses its shape and refuses an unknown field
            - `cursor` is present exactly when `readMode.kind` is `partial-strategic`
            - `group` is a non-negative integer

    - `[ ]` **1.2.b Assert the cardinalities the shape cannot carry**
        - An `assertSessionInitAgenda` beside the schema, called before emission as `assertSessionInitProbeResult`
          is for the envelope
        - Build `test-first` (one behavior at a time):
            - at least one step; at most one `gate`, and it is last
            - an `exec` is always the last step
            - groups never decrease in step order
            - an `ask: "now"` offer has at least two choices and exactly one decline, a `bare` choice or a `signal`
              choice whose `value` is `null`
            - the last step is a `gate`, an `exec`, a workflow `fragment`, or an `ask: "now"` offer every choice of
              which recompiles or hands off
            - `autoProceed` is false unless the gate's `kind` is `proceed`

    - `[ ]` **1.2.c Register the schema id**
        - `session-init-agenda` in `SESSION_ENVELOPE_SCHEMA_IDS` and the module's schema list
          (`lib/session-envelope/registry.ts`), reaching `createProductionSchemaRegistry()` through
          `registerSessionEnvelopeSchemas`
        - Add the id to `PRODUCTION_SCHEMA_IDS` (`__tests__/helpers/production-schema-ids.ts`) and to the family id
          list `__tests__/unit/session-envelope/registry.test.ts` pins
        - `arc schema get session-init-agenda` prints the JSON Schema with the `.describe()` text

### `[ ]` **1.3 Add the verb with its flags, refusals, and answer carriage — § 2.1, § 2.2, § 4.6**

- _Goal:_ `arc agenda session-init` takes the session's signals and answers as flags, refuses every invalid combination
  with one typed refusal document naming the offending flags, and builds every recompile argv from what it received.

    - `[ ]` **1.3.a Register the verb**
        - `agenda` with a `ceremony` operand in `cli.ts`; the handler lives beside the compiler, not in
          `handlers/status.ts`, and loads lazily, so its module joins `expectedImplementationModules`
          (`__tests__/unit/cli-loading-boundary.test.ts`)
        - Under "Inspect work and context:" in `HELP_GROUPS` (`lib/cli-help-content.ts`), with a summary in
          `COMMAND_SUMMARIES` (`lib/cli-help-summaries.ts`); root help lines stay within 80 characters
        - A command-input registration in `command-input-registrations.ts` whose schema has a field per operand and
          option, `ceremony` included, mapped through `schemaFields`, with `--json` declared machine-mode
        - The verb runs the probe's fetches, which can prompt for credentials, so it declares an interaction-context
          site as status does (`handlers/status/input.ts`) and runs under `withInteractionContext`, which passes
          `interaction.subprocess` to `createGitExec`. Status keeps its own declaration; the `declaredSemanticSites`
          pin in `repository-inventory.test.ts` and `NO_INPUT_MATRIX`
          (`__tests__/fixtures/command-input/no-input-matrix.ts`) each gain the verb's entry. That entry moves
          `no-input-invocations.test.ts`'s invocation-count pins, and `command-input-no-input.e2e.test.ts` runs it, so it
          carries `args` and an `expected` outcome that hold in its fixture
        - Repeatable `--answered` and `--done` follow `task close --commit`'s precedent

    - `[ ]` **1.3.b Parse signals and refuse invalid combinations**
        - Validation lives in the input schema or the handler, not Commander's `.conflicts()`, so every refusal is one
          `--json` document `{code, flags, row, remedy}` on stdout with exit 1; Task 1.5.b's `row-not-compiled` uses
          the same document
        - Build `test-first` (one behavior at a time):
            - a ceremony other than `session-init` refuses, naming the accepted value
            - two of `--errand`, `--housekeep`, `--plan`, `--context` refuse together, naming both
            - `--errand --next` with a slug or description refuses
            - `--isolate` without `--errand` refuses
            - `--answered` splits at its last `=`; one with no `=` or an answer other than `accept` or `decline`
              refuses
            - a `--done` value not of the form `<surface>:<action>`, with an optional operand segment, refuses
            - the same key answered twice with different answers refuses; the same answer twice is one answer
            - bare `--plan` and `--errand` parse as `true`; a value parses as one string
            - `signals` echoes exactly what was passed

    - `[ ]` **1.3.c Carry answers into every emitted argv**
        - One argv builder every later compile uses: `["arc", "agenda", "session-init", "--json"]`, then the signals as
          the step or choice leaves them, then the received answers plus those reaching that point implies
        - A key's operand is percent-encoded (`encodeURIComponent`), so a person-typed value carries no `=`, `+`, or
          space into the key
        - Build `test-first` (one behavior at a time):
            - repeated `--answered` and `--done` flags accumulate into `answers`
            - a built argv reproduces the received signals and answers, one element per argument
            - setting or clearing a signal in a built argv; clearing `errand` clears `isolate`
            - the builder can drop `--next` and drop the positional seed
            - an `elicit` argv omits its signal so the answer can be appended
            - an operand containing `=`, `+`, or a space round-trips through the key

### `[ ]` **1.4 Share the session-init probe composition with the verb — § 2.1, § 2.5**

- _Goal:_ The verb and `arc status --session-init` read the same slot values from one composition, and the status
  envelope and its compaction-seed write are unchanged.

- _Context:_ `handleSessionInitStatus` (`handlers/status.ts`) builds the whole probe set inline and calls
  `runSessionInitStatus`. The file is near the 1,000-line gate and records suppressions the probe construction depends
  on: `max-lines-per-function` for the handler, `arc/store-raw-state` for two imports used only inside the probes, and
  `arc/surface-names` for one path literal. Moving the construction to a new file would raise all four there.

    - Keep the composer in `handlers/status.ts`: the body becomes an exported
      `composeSessionInitStatus(context, {writeCompactionSeed}) → {result, seedInputs | null}`, and
      `handleSessionInitStatus` becomes a wrapper under 100 lines that writes the seed from `seedInputs`
    - The seed flag is an input because it changes the `dirty` probe; `seedInputs` carries the derived locus state the
      write needs from inside the composition
    - Export the opener of the `SessionStatusContext` `handleStatus` builds; Tasks 2.3 and 4.4 reuse it. Commands
      already import from handlers (`commands/status/types.ts`)
    - The suppression counts stay as recorded and the file stays under 1,000 lines: this preserves the recorded debt
      in a renamed function rather than reducing it
    - The existing status unit, integration, and E2E tests pass unchanged; add a test that the agenda handler receives
      the composed result

### `[ ]` **1.5 Compile the precedence order and the stop rows — § 2.2, § 2.3, § 2.4, § 4.4**

- _Goal:_ The compiler resolves exactly one row in § 2.2's order, every stop compiles to its `locus` render and a
  `gate stop` with orientation `none`, and the verb prints the asserted agenda without writing anything.

    - `[ ]` **1.5.a Define the compiler's inputs and the shared fixtures**
        - The compiler takes the composed envelope plus a read port bound to the session checkout — file existence,
          size, contents, and Git reads — which unit tests fake
        - A shared fixture builder under `__tests__/helpers/`: the probe-input builders move out of
          `__tests__/unit/status/run.test.ts`, each fixture runs through `runSessionInitStatus` with stub probes, and
          `assertSessionInitProbeResult` checks the result, so no test asserts a state the composer cannot produce

    - `[ ]` **1.5.b Resolve the row**
        - Stops, then branch-gone, then a signal, then `--start`, then the entry row: transient resume, work-unit
          resume, contextless current husk, cold-start (an `unmanaged-checkout` row on a linked checkout with a
          branch), or Orient (every other `free-primary`, `unmanaged-checkout`, or `retired` row)
        - A row this phase does not yet compile refuses with code `row-not-compiled`, naming the row, the condition,
          and the remedy: follow `session-init.md` from the base branch for this session, or start the arm from
          another checkout
        - _Retired in:_ Phase 4
        - Build `test-first` (one behavior at a time):
            - each stop condition outranks branch-gone, every signal, and `--start`
            - branch-gone outranks a signal; a signal outranks `--start`; `--start` outranks the entry row
            - a `work-unit` row with no `context` stops unless a non-null `currentHusk` makes it a current husk
            - an absent or failed `currentHusk` slot on a contextless row stops

    - `[ ]` **1.5.c Compile the stops and the degraded-slot render**
        - Build `test-first` (one behavior at a time):
            - a failed `derivedLocusState`, `SessionIdentityMissingError` included, renders the unavailable guidance's
              `message` and stops
            - an unresolved entry and an `unresolved-checkout` row each render the unavailable guidance's `message` and
              stop
            - the contextless work-unit stop renders the ready guidance's present lines, `entering`, and the compiler's
              line that no work-unit context resolves for the checkout, with `currentHusk` absent and with it failed
            - on a stop, only a failed `currentHusk` adds a degraded-slot render
            - the degraded-slot renderer gives slot name, `error.kind`, and `error.message` and supplies no action
            - a stop emits no prefix, no reads, and no `unconsumed-signal` note

    - `[ ]` **1.5.d Print the agenda and prove it writes nothing**
        - `--json` prints the asserted agenda; without it, a readable rendering in the manner of `arc status`
        - An integration test over a real repository set up so the probe creates both temporary refs: no active work
          unit and a remote `refs/arc/user/<id>/errands` ref for `refs/arc/tmp/transient-discovery/*`, and remote sync
          on with differing local and remote notes refs for `refs/arc-sync-temp/*`
        - That state is an Orient row, which refuses `row-not-compiled` until Phase 4, so the assertions hold whatever
          the exit code: each temporary ref was created and then deleted, and the worktree, the identity directories,
          refs, and notes are as found apart from `FETCH_HEAD`
        - If the test reuses `createGitTraceHarness`, allowlist `update-ref -d refs/arc-sync-temp/*`, which it rejects
          today while the code swallows the failure

## **Phase 2:** The work-unit resume compile

_Purpose:_ Compile everything a work-unit resume emits: its sync steps and notes load, the answers that carry across
recompiles, its reads and session-notes fields, and its whole orientation — every § 6 surface but branch-gone and
Orient's routes — so the spine that lands next has a complete resume to execute.

_Mode:_ `slice` through Phase 3 — closes on a plain resume driven end to end by the agenda and the spine.

### `[ ]` **2.1 Compile the entry prefix's sync steps — § 5.1, § 5.2, § 7.1, § 4.8, § 4.11**

- _Goal:_ A resume's prefix turns each channel's published recommendation into the step § 5.2 assigns — the first
  automatic sync as a recompiling `exec` that ends the agenda, otherwise the ordered `ask: "now"` offers with the
  combined pair, then the user-reference apply — and runs only argv the CLI published or composed from slot fields.

    - `[ ]` **2.1.a Compile the worktree, base, and user-reference channels**
        - Composed argv: `git pull --ff-only`, `git fetch origin <base>:<base>` from `baseBranchSync.value.base`, and
          the slot's own `recommendedCommand` for the user-reference apply
        - The prefix takes the row's channel set (§ 5.1), so the signal rows reuse it with the notes channel alone
        - Build `test-first` (one behavior at a time):
            - the worktree channel's `prompt` offers `worktree:pull` with `recommendedPromptText`; `skip` emits nothing
            - the base-branch channel's `pull` is an `exec`; its `prompt` an offer never combined with another
            - with an automatic sync, the agenda ends at the first `exec` in the order notes pull, notes load, base sync
            - with none, offers follow in the order superseded reset, worktree and notes, notes load, base sync
            - every sync `exec` and sync choice recompiles
            - `userReferenceReconcile` `apply` compiles to an `exec` (id `user-references:apply`) after the sync steps,
              ending the agenda

    - `[ ]` **2.1.b Compile the notes channel and load in the cutover module**
        - Create the cutover module here: it holds the notes channel's steps (`arc user pull`) and the § 7.1 load
          dispatch, and Task 2.5.b adds the notes surfaces, so the cutover deletes the module rather than editing the
          compiler
        - Build `test-first` (one behavior at a time):
            - the notes channel's `pull` is an `exec` (id `notes:pull`) and its `prompt` an offer
            - one load fires on `loadNeeded` or a retired-subdir `pull` or `prompt`, and never while the channel
              recommends a pull
            - under `always` the load is an `exec` (id `notes:load`), except a retired-subdir `prompt`, which offers
            - under `prompt` the offer's text is the retired-subdir slot's when it fired, else the compiler's "Notes:
              local notes are current but disk lags the latest note. Load?"
            - with the `config` slot failed, the load follows `prompt`

    - `[ ]` **2.1.c Combine offers**
        - Only the worktree pull combines, and only with a notes pull or a notes load; the superseded reset and the
          base-branch sync never combine
        - Build `test-first` (one behavior at a time):
            - worktree and notes both `prompt` give one `worktree:pull+notes:pull` offer with
              `recommendedCombinedPrompt` and the choices pull both, worktree only, notes only, skip
            - a worktree `prompt` with a notes load gives one `worktree:pull+notes:load` offer whose text joins the
              channels' texts and whose choices are each alone, both together, and decline
            - a superseded reset or base-sync offer stays separate beside any other offer
            - a combined accept runs its syncs in order under one recompile

    - `[ ]` **2.1.d Offer the superseded reset**
        - A superseded `diverged` worktree stays `surface`, so the offer keys on `supersession.superseded`, not on a
          `prompt`
        - Split `composeSupersessionPromptText` (`lib/session-init/recommended-action.ts`) into an exported head
          composer the envelope and the `superseded` render share, plus the dirty-tree warning and the question; it
          takes `dirty`, which `inferWorktree` has in scope. This is the envelope's one text change
        - The existing `toContain` assertions in `recommended-action.test.ts` and `status/run.test.ts` still hold; add
          exact-text tests for the head, the dirty variant, and the question
        - Build `test-first` (one behavior at a time):
            - a superseded `diverged` worktree on a row whose prefix runs the worktree channel offers
              `superseded:reset` carrying `git reset --hard origin/<branch>` from `worktree.value.branch`
            - the dirty-tree warning appears only on a dirty tree, and `DIRTY_TREE_WARNING` is not reused
            - declined, or on any other row, the `superseded` surface renders the head alone
            - the reset is never an `exec`

### `[ ]` **2.2 Carry answers across recompiles — § 4.5, § 4.6**

- _Goal:_ Every emitted recompile argv carries the answers and done ids its position implies, and the compiler, given
  them, never asks an answered question, runs a done `exec`, or follows a recorded method fragment again, reporting
  each in an `answered` note and each still-recommended sync in a `sync-unsettled` note.

- _Approach:_ The unsynced determination lives here, and Task 2.5 reads it: a channel is unsynced when its policy is
  `manual`, its offer was declined or emitted earlier in the same agenda, the row's prefix skips it, or its sync is
  unsettled.

- Build `test-first` (one behavior at a time):
    - an `ask: "now"` offer's `actions` choice records each key it accepts as `accept` and the rest as `decline`
    - every `ask: "now"` offer earlier in the same agenda records `decline` in later argv
    - a `signal` or `elicit` choice records nothing, except a bare signal's decline, which records its key as `decline`
    - an `ask: "orientation"` offer records nothing, and its choices' argv drop `--next`
    - an `exec` records its id done; a method `fragment` earlier in the agenda records `fragment:<name>`
    - a fully answered offer is omitted; a partly answered one is emitted for its remaining keys
    - an `exec` whose id is done or answered is omitted
    - an accepted or run sync whose slot still recommends it, a failed one continued past or a combined accept's unrun
      pull included, becomes a `sync-unsettled` note, and the agenda compiles on as if it were declined
    - the `answered` note names each offer answered earlier and each method fragment omitted as followed
    - each unsynced case marks its channel unsynced, and a channel synced this session is not

### `[ ]` **2.3 Compile a resume's reads and session-notes fields — § 4.3, § 4.9, § 5.1, § 5.6**

- _Goal:_ A resume reads the universal set and the rest of its load set in manifest order, in groups under the
  per-group budget, emitting only files that exist and carrying the task cursor, with the Session Type override and
  the freshness note decided by the compiler from SESSION-NOTES itself.

    - `[ ]` **2.3.a Compile the reads**
        - Universal reads in `resolveLoadSetManifest`'s order, `AGENT-BRIEF.CONTRIBUTOR` for the `contributor` role, and
          WORKING-MEMORY after the meta and SESSION-NOTES on a resume; existence and size come from the read port
        - The per-group budget is a constant in the compiler, not a configuration key
        - Build `test-first` (one behavior at a time):
            - the resume's reads follow the manifest: meta, SESSION-NOTES, WORKING-MEMORY, the workflow, and on task
              work the task list before `process-task-loop`, then the cohort document
            - groups keep each group's estimated size under the budget and never decrease; a read larger than the
              budget forms its own group
            - the task-list read is skipped in planning and when `taskCursor` is `missing` or `no-open-task`, and
              carries `cursor` when `found`
            - a malformed cursor or failed cursor probe skips the read with a `task-cursor` note
            - a null workflow on a selected role is a mismatch `note`
            - an absent expected file becomes a `missing-file` note; an absent WORKING-MEMORY emits nothing
            - an absent SESSION-NOTES the notes channel cannot restore becomes a `notes-history` render of the
              CLI-run `git log --oneline -10`

    - `[ ]` **2.3.b Read the session-notes fields**
        - `extractField` (`lib/store/kinds/meta/line-reading.ts`) over `stripHtmlComments` (`lib/user-sync/parser.ts`)
          output, `[none]` read as absent and inline code removed by `stripInlineCode`, matching what
          `foldImportSession` reads
        - The override recomposes through `resolveLoadSetManifest` from the context's paths, `workingMemoryPath` from
          the existing load set's identity-global entry, `resolvePlanningStage` over the meta's `Current Workflow`,
          and the execution stage `projectWorkUnitStage` (`lib/locus/subject-meta.ts`) derives, exported or with its
          execution branch inlined
        - Freshness reads go through the read port: resolving the abbreviated hash to a commit, the commits since it,
          and whether the meta changed in that range
        - _Note:_ See `notes-session-init-agenda.md` § Carried context — the flip's field reader.
        - Build `test-first` (one behavior at a time):
            - a `planning` or `execution` override on a `planning` or `execution` session recomposes the load set, so
              the reads match it
            - an override of `prepublication` or `integration`, or over one, is ignored with a
              `session-type-override` warning note
            - an abbreviated hash that resolves to HEAD emits nothing
            - a differing hash emits one `freshness-gap` note with the commits since it and whether the meta changed
            - an absent hash emits the note saying there is no handoff baseline
            - a hash that no longer resolves emits the note saying the baseline is unreachable, never an error
            - the fields are read after any pull, from the recompiled state

### `[ ]` **2.4 Compile the core orientation and auto-proceed — § 2.3, § 4.10, § 5.1, § 6.2**

- _Goal:_ A resume's agenda carries its residual inputs and core surfaces in § 6.2's order and ends in a `gate proceed`
  that auto-proceeds only under `--next` on a compile with nothing that would block a bare-clean orientation.

- _Approach:_ This task owns § 6.2's order: an ordered surface-id list and the orientation assembly the later tasks'
  builders plug into, the cutover module's surfaces included. It also owns the failed-slot rule (§ 4.4): a failed
  slot the compiler reads renders one `degraded-slot` line at its place in the order, right after `locus`, and
  suppresses exactly the steps the slot supplies. A stop renders only a failed `currentHusk` (Task 1.5.c), and the
  signal and transient rows only the slots their checkout renders draw on (Tasks 4.2.c and 4.3).

- Build `test-first` (one behavior at a time):
    - `residual` carries `config`, `releaseRouting`, and `domainRules`, and `inboxState` on a primary checkout only,
      at the envelope's field paths; each `domainRules.value.warnings` entry becomes a `domain-rules` note
    - a failed slot renders its `degraded-slot` line in order and counts against `autoProceed`
    - a failed `user` slot leaves no notes pull and no `loadNeeded` load, while a retired-subdir load still fires from
      its own healthy slot; a failed `worktree` leaves no worktree pull or superseded reset, a failed `baseBranchSync`
      no base sync, a failed `userReferenceReconcile` no apply, and each failed cleanup sweep no cleanup offer; the rest
      compiles from healthy slots
    - `header` renders the branch, clean or dirty, and the worktree path on a linked checkout
    - `delivery-position` renders `deliveryPosition.value.line` once, and nothing for an `ok` null value
    - `locus` renders every present optional string and non-empty array of the guidance except `entering`, which
      renders only on a stop
    - `current-wu-reconcile`, `user-references`, and `hooks-path` render `recommendedPromptText` on `surface`, their
      commands as text
    - after the flip, a store pull other than a no-op becomes a `store-sync` note with its `actions` as text; a no-op
      is a `noop` or `no-remote` status whose summary carries no notice
    - an unconsumed positional seed, `--next`, or `--start` becomes an `unconsumed-signal` note with § 5.1's text
    - orientation is `work-state`
    - `autoProceed` holds with `--next`, a clean tree, no freshness gap, no meta `**Blockers:**` value
      (`parseMetaRecord`'s `blockers`, read through the port), and no `render` or `note` but `header` and `answered`
      and no `offer`; any one of them clears it

### `[ ]` **2.5 Compile the checkout-local and notes surfaces — § 5.5, § 6.2, § 7.1**

- _Goal:_ Every worktree, dirty, base, and notes condition compiles to its § 6.2 render with CLI-composed text, a
  channel renders as behind only where Task 2.2 marks it unsynced, and the notes surfaces live in the cutover module.

    - `[ ]` **2.5.a Compile the worktree and base surfaces**
        - Today's templates for `worktree-diverged`, `local-ahead`, `no-upstream`, `detached-head`, `no-remote`, and
          `dirty`, filled from the same fields; the compiler's own lines for `worktree-behind` and
          `worktree-remote-unavailable`
        - Export `composeBaseBranchSyncBehindText` (`lib/session-init/recommended-action.ts`)
        - Build `test-first` (one behavior at a time):
            - each worktree state renders its surface in table order
            - `worktree-behind` renders only when unsynced
            - `worktree-remote-unavailable` with `remoteEvidence` `unreachable` names `failureReason`; with
              `pending-fetch` it says origin advanced to a commit not yet present locally
            - `detached-head` is suppressed when the current husk renders
            - `base-drift` renders `recommendedPromptText` verbatim on `surface`
            - `stale-base` renders the slot's text on `surface`, else `composeBaseBranchSyncBehindText`'s when behind,
              unsynced, and `not-checked-out`; `refreshRemedy` is text

    - `[ ]` **2.5.b Compile the notes surfaces in the cutover module**
        - Build `test-first` (one behavior at a time):
            - under `manual`, `notes-load-pending` and `retired-subdirs` render
            - a declined `notes:load` under `prompt` renders `notes-load-pending` or `retired-subdirs`
            - a declined pull leaves the reconcile to the `retired-subdirs` render
            - `notes-lag`, `notes-compaction` (with its nudge marker), `notes-reconciling`, `notes-conflict`,
              `local-ahead-notes`, `notes-behind` (unsynced only), `notes-remote-unavailable`, and `notes-drift` by
              register each render as § 6.2 gives, with no pull offered

### `[ ]` **2.6 Compile the cleanup lists under their action limits — § 4.11, § 6.1, § 6.2, § 6.3, § 14.1**

- _Goal:_ Every cleanup list renders today's text from its reports and offers each removable report's own published
  remedy, while every blocked, owner-held, or manual-only entry stays text and nothing becomes automatic or gains a
  forbidden flag.

- _Note:_ The worktree-lock change (`projection-substrate`) alters the remedies these lists carry; whichever change
  lands second carries the other's wording in the shipped prose.

- Build `test-first` (one behavior at a time):
    - `husk` renders by `stamp.kind` and offers the composed `arc teardown <name> --husk <path>` for `current` and
      `legacy`, run from `primaryAvailability.checkoutPath` and handing off; with that path null the command is text;
      `manual-only` is its reason alone
    - `retirements` offers an `actionable` teardown and a non-null successor remedy, the successor's `arc start` handing
      off; candidates are text with no default; `blocked` is text with its reason
    - `rename-moves` offers `remedy.argv` unchanged, run outside the source checkout, and is text when the session is in
      it
    - `stale-worktrees` offers a removable report's `teardown`, else its `actions`, and a removable husk's
      `arc teardown <name>` or `--branch <ref>`; no plain `git worktree remove`, no `--force`
    - a blocked report stays text though it carries a `teardown`, and external, errand-husk, linked-branch-husk,
      `pre-store-husk`, and `outside` entries are text
    - `missing-folders` renders each entry's remedy text and offers nothing, its argv-bearing teardown included
    - `branch-orphans` offers a shipped orphan's `teardown` or `actions` and a merged orphan's published `git branch -D`;
      `evidence-unavailable` and unmerged orphans are text
    - on a linked checkout, `cleanup-residues` replaces both primary lists, offers a work-unit husk's published
      `--husk` argv, and writes no marker
    - every offer choice recompiles, except the husk teardown and a successor start, which hand off

### `[ ]` **2.7 Compile the reminders and in-flight advisories — § 2.4, § 6.2**

- _Goal:_ The reminder, in-flight work-unit, and concurrent-workload advisories render today's text for the rows that
  carry them, each once-per-day nudge carrying the marker path and value the agent writes after orienting, and a resume
  emits every Phase 2 surface in § 6.2's order.

- _Note:_ `concurrent-workload` renders on Orient, cold-start's decline path included, and on `--start`; never on the
  signal rows, `--context`, transient resumes, the contextless husk, or the held path. Tasks 4.1.c, 4.2.c, 4.3, 4.4.a,
  4.5.a, and 4.6 test those rows.

- Build `test-first` (one behavior at a time):
    - `reminder` renders on a primary checkout when `errandSweep.value.stale` is non-empty and the nudge fires, with
      its marker
    - `in-flight-work-units` renders today's list, `stale` entries only when its nudge fires, with the marker, and
      `mergeabilityGuidance` verbatim; its `actions` are text
    - with only `stale` in-flight entries and no nudge, nothing renders, and no marker is attached
    - `concurrent-workload` is a note omitting a zero class; on a work-unit resume the slot is absent and nothing
      renders
    - `pausedWork`, `inboundBackPressure`, `errandState`'s `resume`, `inFlight`, and `residue`, and other slots'
      `warnings` arrays render nothing
    - a resume carrying every Phase 2 surface emits them in § 6.2's order, the cutover module's in their places

## **Phase 3:** The spine and `read-load-set`

_Purpose:_ Replace `session-init` with the spine, author the read contract init and recovery share, and shrink the
skill to a hand-off — then prove the loop on a kit install. From this phase on, this checkout's own sessions run the
spine.

_Exit criterion:_ On a kit install with a work unit in progress, a session following the new spine reaches the same
orientation surfaces, questions, and proceed prompt as today's workflow on the same fixture, and the spine is within its
~13 KB budget.

### `[ ]` **3.1 Author `read-load-set` and fire it from recovery — § 8.1**

- _Goal:_ One method executes every read mode for both consumers — init anchored on the `read` step's cursor, recovery on
  its audit report's — with groups, manifest order, and truncation continuation, and recovery keeps its stop rules.

- _Note:_ 3.1.a–c land in one commit: `lint:arc:triggers` fails a method no workflow declares. See
  `notes-session-init-agenda.md` § Shipping a file.

    - `[ ]` **3.1.a Author the method**
        - Ordinary method shape in the flat methods directory, package source first, with `override-active: false` and
          `[No override configured]`, which the package-neutrality check requires: the read contract and the one
          `partial-strategic` procedure moved from `session-recover.md` Step 3's slicing
        - Init anchors on the step's `cursor`, not the meta's `**Next Task:**` triple
        - A missing header or phase preamble is surfaced and the read continues; entries with no `group` form one group
        - The method reports a task section it cannot locate, and each consumer responds: init skips the read and
          surfaces a mismatch, recovery stops

    - `[ ]` **3.1.b Ship it**
        - The `init-recipe.json` entry, `CONFIGURABLE_FILES`, the manifest, the package-sync strategy's counts and list,
          and a § Method Classification by Trigger row
        - Add it to both of `integration/init.test.ts`'s method lists: the installed files and the manifest's
          Configurable classification

    - `[ ]` **3.1.c Fire it from recovery**
        - `session-recover.md` Step 3's read-mode mechanics become a fire-point to the method; its frontmatter declares
          it; its stop rules — no verified anchor, an unlocatable task section — stay in `session-recover.md`

### `[ ]` **3.2 Replace `session-init` with the spine — § 9.1**

- _Goal:_ `session-init.md` is a spine within ~13 KB that executes any agenda by step type and orients by
  `orientation.shape`, naming no probe slot, slot field, or arm condition, and ships as a plain file.

- **Additional Context:** `strategy-workflow-authoring.md` (frontmatter, declarations, interlock markers)

    - `[ ]` **3.2.a Author the spine**
        - § 9.1 items 1–8 in package source: purpose and the four terms; output discipline; running the verb, its
          failure the one fallback; each step type, with `read` loading `read-load-set`, `fragment` as the declared
          methods' fire-point, recompile, one argument per argv element, handoff, and marker writing; orientation by
          shape; the SESSION-NOTES authority boundary and WORKING-MEMORY binding; mismatch handling with the
          crash-recovery trigger
        - Frontmatter declares `read-load-set` and keeps `session-state`; the other two methods join it with their own
          tasks

    - `[ ]` **3.2.b Ship it as a plain file**
        - Merge the base first: `manifest.json` has changed on `main` since this branch was cut
        - Rename `session-init.template.md` to `session-init.md` in package source and its `init-recipe.json` entry;
          the `pm.mode` render-engine arms leave with Step 4 and return as `discover-next-work`'s prose (Task 4.5)
        - The `.arc/` copy, the manifest, and the package-sync strategy: its `arc:if` table row goes, the
          template-counterpart list and count drop to 10, and "11 files … Two contain" becomes 10 and "One contains",
          per `notes-session-init-agenda.md` § Shipping a file
        - Re-pin in the same commit every test whose pinned text the spine changes, per
          `notes-session-init-agenda.md` § Test pins: `review-gate-workflows` runs at the commit gate; pins of
          Phase 1–2 behavior become compiler unit tests; pins of Phase 4 rows retire here, and the Phase 4 test that
          replaces each is marked there

    - `[ ]` **3.2.c Check the budget**
        - Measure the spine's bytes against ~13 KB, and the spine plus `read-load-set` against ~28% of the baseline
          `session-init.md`, before the rehearsal

### `[ ]` **3.3 Shrink the `arc-session` skill to a hand-off — § 9.2**

- _Goal:_ The skill runs the spine and passes its arguments as the verb's flags; its description line keeps the flag
  list and gains `--context`.

    - Both copies of the canonical `SKILL.md`; this checkout's `.claude/skills/arc-session` is a symlink into `.arc/`,
      so the `.arc/` copy reaches the next session here
    - The skill's `--errand --next` pin in `locus-methodology-contracts.test.ts` retires with the Phase 4 pins, and
      Task 4.2.a's queue-head tests replace it

### `[ ]` **3.4 Rehearse a plain resume on a kit install** — validate exit criterion at segment scope

- _Goal:_ Evidence that a plain resume runs end to end on the agenda and the spine with today's orientation.

    - A scripted fixture, kept with the evidence: a committed meta, a finalized task list with an open mid-phase task,
      and SESSION-NOTES carrying `Commit at Handoff`, so the resume exercises `partial-strategic` and the cursor
    - Apply it identically to Task 1.1's base kit and to a kit built from this branch (the kit's absolute path and
      `--source`, as in Task 1.1.a), then open a resume session in each, the branch kit's following the spine
    - Compare their orientation surfaces, questions, and proceed prompts; record both under
      `~/dev/arc-evidence/session-init-agenda/rehearsals/`
    - Record the spine's size against its budget
    - Run `arc check segment`

## **Phase 4:** The remaining arms

_Purpose:_ Replicate the resume pilot across every other entering row and signal: each arm compiles to its § 5 step
sequence and reaches its method or owning workflow, with that workflow's entry adjusted where session-init no longer
acts for it.

_Mode:_ `replication` — closes when every row and branch-gone kind compiles as specified, batch-verified over fixtures
and rehearsals.

_Exit criterion:_ Each § 5.4 row and § 5.3 kind emits its specified steps and orientation over fixture probe values,
the `row-not-compiled` refusal is gone, and the `--plan`, `--errand`, branch-gone, Orient-discovery, and `--context`
rehearsals reach today's orientation except where the specification states a change.

### `[ ]` **4.1 Compile branch-gone recovery — § 5.3**

- _Goal:_ Each recovery kind compiles to its § 5.3 steps: a free destination switches by a composed fetch and switch and
  recompiles, and every other outcome — a destination checked out elsewhere, a declined, deferred, surface-only,
  answered, or failed recovery, or an absent recovery slot — takes the held path to a `gate stop`.

    - `[ ]` **4.1.a Locate destinations**
        - The local-ref check is `git rev-parse --verify --quiet refs/heads/<branch>` through the read port
        - Build `test-first` (one behavior at a time):
            - a destination is a `switch` candidate of a `resolved` or `surface` result, or `main-fallback`'s
              `baseBranch`; `pending` and `unproven` candidates are not
            - a destination is located by its `worktreePath`, else by `resolveWorktreePathsByBranchResult`; a missing
              `worktreePath` never means free
            - a failed worktree-path read (`ok: false`) takes the held path
            - a free destination compiles `git fetch origin <branch>` only without a local ref, then `git switch
              <branch>`, recompiling
            - a destination checked out elsewhere takes the held path

    - `[ ]` **4.1.b Compile each kind**
        - The compiler dispatches on the recommendation's action rather than reading dirtiness again, since a failed
          `dirty` slot already counts as dirty
        - Build `test-first` (one behavior at a time):
            - `resolved` `switch` on a clean tree is an `exec` (id `branch-gone:resolved`); on a dirty tree an offer
              whose elsewhere case is a bare choice to continue there
            - `resolved` `removable` offers the published `arc teardown <name>` and recompiles, recording nothing
            - `resolved` `external` and `unproven` take the held path
            - `surface` offers a choice per candidate by its action
            - `main-fallback` offers the base as a destination
            - `pending` offers the published refresh `arc active in-flight --json`, not its candidates; a refresh that
              changes the kind changes the question key, and one left `pending` finds its question answered

    - `[ ]` **4.1.c Compile the held path**
        - Build `test-first` (one behavior at a time):
            - the held path skips every sync step, reads the universal set and, for a selected work unit, its load set
              as a resume does, and ends `gate stop`
            - the `branch-gone` render carries the recommendation's text, each elsewhere destination's "Continue
              recovery in checkout `<path>`.", and each `missingFolders` remedy, the same after any recompile
            - with no `recovery` value, the render is today's line alone, and a failed slot also renders degraded
            - orientation follows the entering row: `subject` on a transient row, else `work-state`
            - on a row that would otherwise be Orient, the held path runs no `discover-next-work` and offers no route
            - the held path emits no `unconsumed-signal` or `concurrent-workload` note

### `[ ]` **4.2 Compile the signal rows — § 5.4, § 12**

- _Goal:_ `--errand` (queue head, seeded, bare), `--plan` (found, bare or not found), `--housekeep`, and `--context`
  each compile to their § 5.4 sequence on a notes-only prefix, and the workflows they enter own their entry.

    - `[ ]` **4.2.a Compile the `--errand` rows**
        - Extract `resolveErrandNext({cwd, io, identity})` from `handleErrandNext` (`handlers/errand.ts`), with its
          refusals, its catch, and the private `resolveCurrentExecutionStartupOffer`, into a module the compiler
          imports; `handleErrandNext` calls it
        - The compiler reads the inbox on every checkout through `readUserInbox`; a failed read becomes a note, and the
          pick offers only its `elicit` choice and decline
        - Build `test-first` (one behavior at a time), replacing the retired `--errand --next` and Errand entry pins:
            - `--errand --next` resolves the queue head through `resolveErrandNext`: available renders its text, the
              checkout renders, and a `run-errand` fragment with `mode: "launch"`, `fromInbox`, and `isolate`; empty
              and refused render and stop
            - a seeded `--errand` enters `run-errand` with the seed, passing a flagged `§ Errand` capture whose `key`
              equals the seed exactly as `fromInbox`
            - bare `--errand` offers `errand:pick`: a `signal` choice per capture `extractReminderEntries` returns, an
              `elicit` choice, and a decline that clears `errand` and `isolate` and recompiles
            - orientation is `subject` with the Errand, `key: null` while unpicked

    - `[ ]` **4.2.b Compile the `--plan` rows**
        - Build `test-first` (one behavior at a time), replacing the retired `--plan` entry pins:
            - a stub `resolveBacklogStub` finds enters `draft-design` with `stub` and `onGroomingBranch`, true only on
              `chore/groom-<stub>`
            - bare or not found offers `plan-stub:<value>` with an `elicit` choice carrying the unmatched value and a
              decline that clears the signal; a bare `--plan`'s key is `plan-stub:` with an empty operand
            - a failed lookup compiles as not found, its text naming the lookup and message
            - an answer still not found is asked again under its own key

    - `[ ]` **4.2.c Compile `--housekeep` and `--context`**
        - Build `test-first` (one behavior at a time), replacing the retired `--housekeep` entry pins:
            - `--housekeep` enters `drain-inbox` with no arguments, orientation `subject` with `key: null`
            - `--context` reads the universal set, renders the checkout surfaces, and stops with orientation
              `checkout`, emitting no work-unit artifact or surface on a work-unit checkout
            - the signal rows emit the checkout renders and no discovery route, reminder, `concurrent-workload`, or
              work-unit surface
            - a signal row renders degraded lines only for the slots its checkout renders draw on

    - `[ ]` **4.2.d Hand the entries to their workflows**
        - `run-errand.md`: Launch renders `arc errand open`'s `recommendedPromptText` and works from
          `allocation.checkoutPath`; Resume consumes only the checkout session-init selected and no longer materializes;
          its entry names the arguments it receives — `mode`, `seed`, `fromInbox`, `isolate`, and on resume `subject`
          and `generation`
        - `draft-design.md`: the grooming-entry skip applies only on a grooming branch, so `arc plan check` runs on
          every other `--plan` entry; its entry names `stub` and `onGroomingBranch`
        - Both copies; re-pin any test reading the changed text

### `[ ]` **4.3 Compile transient resumes and the contextless husk — § 5.4**

- _Goal:_ A transient row enters its owning workflow by recovery's mapping with its exact subject and generation, and a
  contextless current husk orients on the husk and stops.

- Export `transientWorkflow` (`lib/recover/locus-context.ts`)
- Build `test-first` (one behavior at a time), replacing the retired groom and housekeep dispatch pins:
    - `errand` and `partial-errand` enter `run-errand` with `mode: "resume"`, `groom` enters `draft-design`, and
      `housekeep` enters `drain-inbox`, each by `transientWorkflow`
    - the fragment carries the subject's kind and key and the marker generation, a null `markerGeneration` passing
      through as `generation: null`, with orientation `subject`
    - a partial Errand compiles without an identity
    - a transient resume runs the full prefix, the worktree pull and superseded reset included, and renders degraded
      lines only for the slots its checkout renders draw on
    - a contextless current husk runs the full prefix, renders `husk` and its other surfaces, and stops with
      orientation `work-state`
    - neither a transient resume nor a contextless husk renders `concurrent-workload` when the probe emits it

### `[ ]` **4.4 Compile `--start` and author `assess-start-readiness` — § 5.4, § 8.2**

- _Goal:_ A resolvable `--start` target compiles to its reads, the readiness renders, the `assess-start-readiness`
  fragment, and a `gate launch`; an unresolved one to a `start-target` note and the entry row as if absent.

- _Note:_ See `notes-session-init-agenda.md` § Shipping a file and § Carried context.

    - `[ ]` **4.4.a Compile the row**
        - Extract a shared lifecycle resolver from `handleLifecycleStatus` (`handlers/status/lifecycle.ts`), covering
          both its in-repository and store branches, that returns a state or a typed unresolved reason; it reads with
          `local` acquisition, so the verb writes nothing, and `arc status <slug>` calls it
        - The fragment's arguments are the `slug`, its meta path (`resolveBacklogStub().metaPath`), and the task list
          the meta's `taskList` field names, when present; both read `full`, with no cursor, since the probe computes
          none for a backlog target
        - Build `test-first` (one behavior at a time):
            - the slug resolves through the shared resolver, `arc start`'s `isComposedLifecycleSlugIndeterminate`
              quality check first
            - an indeterminate slug, a store refusal other than `not-found` with ambiguity included, or the conflict
              refusal the handler composes is unresolved, its note naming the warning or refusal
            - `provisional` and `planned` resolve; `nonexistent`, `shipped`, and the started states — `planning`,
              `active`, `integrating`, and `parked` — are unresolved
            - a resolved target reads its meta and any task list, renders the dirty tree, the freshness note on a
              work-unit checkout, the worktree states and `stale-base` as readiness input with no sync step, the notes
              surfaces, and `concurrent-workload`, then the fragment and `gate launch`
            - orientation is `subject` with `kind: "work-unit"`

    - `[ ]` **4.4.b Author the method**
        - Moved from today's focused-recon arm: best-effort readiness, Tier 1 gates by `arc status <slug>` and base
          drift where a readiness baseline exists, Tier 2 reading the agenda's `concurrent-workload` note; the launch
          question; `arc start <slug>` with its interlocks unchanged; the seeded mini-handoff check at the path
          `materializeWorkUnitSessionNotesPath` gives; the generic handoff with no harness-specific command; the
          informed opt-in before moving the session
        - Ship it per the notes, declare it in the spine's `arc.methods`, and add it to both of
          `integration/init.test.ts`'s method lists

### `[ ]` **4.5 Compile Orient, author `discover-next-work`, and offer the routes — § 5.4, § 5.8, § 7.2, § 8.3**

- _Goal:_ Orient compiles to the prefix, the `discover-next-work` fragment, its renders with the materialize and
  housekeep route offers, and a `gate stop`; the method carries both `pm.mode` arms and fires `assess-parallel-fit`.

- _Note:_ `assess-parallel-fit.md` ships and becomes Configurable with this task; see `notes-session-init-agenda.md`
  § Shipping a file.

    - `[ ]` **4.5.a Compile the row and its routes**
        - A route action whose `checkout` is absent or equals the session's checkout recompiles; any other `--here`
          action, `arc start --new --here` included, hands off; `arc locus release` always recompiles
        - Build `test-first` (one behavior at a time), replacing the retired Errand-materialize and materialize-exactness
          pins:
            - every `free-primary`, `unmanaged-checkout`, and `retired` row but cold-start is Orient, orientation
              `work-state`, running the full prefix and rendering `concurrent-workload`
            - the fragment's arguments are `pmMode`, `protection`, and `seed` when present; a followed fragment does
              not run again after a pick recompiles
            - with the `config` slot failed, Orient emits no `discover-next-work` fragment, and a positional seed
              becomes an `unconsumed-signal` note
            - the materializable work-unit offer has a choice per published action: a spawning `arc materialize <name>`
              hands off, and the session's own `--here` exits recompile
            - `refreshRemedy` is its own recompiling choice, offered with no candidates under `materialize:` with an
              empty operand, and the slot's copy of the same refresh in its `actions` is not offered again
            - before the flip, the cutover module adds an in-place choice per candidate running
              `arc materialize <name> --here` then `arc user pull`, recompiling
            - the materializable Errand offer runs the argv `findMaterializableErrands` publishes and hands off
            - a failed `materializableWorkUnits` or `errandState` slot renders degraded and offers no route
            - on a primary checkout, `housekeep` offers a `signal` choice for `housekeep`
            - the route offers sit at their surfaces' places, in order

    - `[ ]` **4.5.b Author the method**
        - Moved from today's Step 4: the seed pre-focus with a confirm-only init offer; the `arc-in-git` and other
          `pm.mode` arms as prose, following the argument's arm; `assess-parallel-fit`'s multi-candidate selection as
          advisory input, declared in the method's own `arc.methods`; `arc start` under full protection, `create-spec`
          under partial
        - Ship it per the notes, declare it in the spine's `arc.methods`, retarget `assess-parallel-fit.md`'s
          consuming-workflow lines to the method, and add both methods to both of `integration/init.test.ts`'s method
          lists

### `[ ]` **4.6 Compile cold-start and retire the interim refusal — § 5.7**

- _Goal:_ An unmanaged linked checkout with a branch enters the advisory `in-flight-scope-check` and a
  `cold-start:scaffold` offer that shows the seed's resolved disposition; its accept starts the work unit here and
  recompiles without the seed, and a decline or an answered offer compiles Orient. With this last row compiled, the
  `row-not-compiled` refusal is gone.

- _Note:_ `in-flight-scope-check.md` ships with this task, declaring `assess-parallel-fit`, which Task 4.5 shipped;
  see `notes-session-init-agenda.md` § Shipping a file.

- Delete the `row-not-compiled` refusal and its tests
- Build `test-first` (one behavior at a time):
    - the row runs no prefix before its decline
    - the offer's text gives the seed's disposition as `parseSpecInput` classifies it: an issue reference becomes the
      meta's `Origin`, and any other seed passes through
    - accept runs `arc start --here --from <seed>`, or bare `arc start --here`, and recompiles without the seed
    - decline compiles the Orient steps, `concurrent-workload` included; an answered offer compiles Orient without the
      scope check
    - after a successful start, the recompile is a work-unit resume

### `[ ]` **4.7 Verify every arm across fixtures and rehearsals** — validate exit criterion at segment scope

- _Goal:_ Evidence that every row and branch-gone kind compiles as specified, the verb still writes nothing, and the
  arms reach today's orientation.

    - Run the compiler's unit suite over the fixture probe values: every § 5.4 row and § 5.3 kind, the held path, the
      bare `--errand` declines with and without `--isolate`, the `--plan` decline, and an unresolved `--start`
    - Re-run Task 1.5.d's no-write proof over Phase 4's new reads: the errand queue, the inbox, the stub lookup, the
      lifecycle resolver, and the worktree list
    - Rehearse on kit installs from this branch, each against today's workflow on the same fixture, and record them
      beside Task 3.4's: `--plan` over a backlog stub, `--errand` with a queued and a flagged capture, branch-gone
      after deleting the remote branch, Orient discovery with a remote-only work unit, and `--context` from a work-unit
      checkout
    - Run `arc check segment`

## **Phase 5:** Removals, the cheap tier, and propagation

_Purpose:_ Retire what the spine replaced, cut the always-loaded documents' cheap tier, retarget every remaining
shipped reader of the old workflow and envelope, and measure the done-signal against the Phase 1 baseline.

_Mode:_ `replication` — closes when every § 10–§ 12 surface is converted in every copy that carries it and
batch-verified.

_Exit criterion:_ No shipped file or source comment references a removed file or section; every § 11 change lands in
every copy § 11 assigns it and every § 12 reader in both copies; `framework-sync`, link validation, and the integration
tier pass against the new text.

### `[ ]` **5.1 Remove the contributor variant and the envelope reference — § 10**

- _Goal:_ Neither `session-init.contributor.md` nor `probe-envelope.md` remains in either copy or the recipe, no shipped
  file references them, and the `inboxState` routable-count note reads from the served envelope schema.

- _Note:_ See `notes-session-init-agenda.md` § Shipping a file and § Test pins.

    - `[ ]` **5.1.a Remove the contributor variant**
        - The file and its recipe entry; contributors take the ordinary path, with `AGENT-BRIEF.CONTRIBUTOR` among the
          universal reads (Task 2.3)

    - `[ ]` **5.1.b Remove the envelope reference**
        - Both copies and the recipe entry; the `inboxState` routable-count note `init-work-unit.md` relies on moves into
          `.describe()` on those fields, which `arc schema get session-init-envelope` serves. The text carries no `§`,
          which `lint:arc:section-refs` refuses in `src`, and no `.arc/` path
        - `locus-methodology-contracts.test.ts`'s pin of that note reads the served schema; its pins of the removed
          file's absence retire
        - The delivery-position workflow test's pins of `probe-envelope.md` text retire, since
          `session-init-delivery-position-readonly.test.ts` covers the probe's passivity

### `[ ]` **5.2 Cut the always-loaded cheap tier — § 11**

- _Goal:_ Each § 11 cut and correction lands in every copy § 11 assigns it, every destination of moved text has an
  install disposition, and no rule's placement or load-set membership changes.

- _Note:_ `DEV-RULES.ARC` and `AGENT-BRIEF.ARC` change in both copies. The Configurable templates change in package
  source, and this repository's copy, its own filled document, takes a change only where it carries the template's text
  verbatim; never copy one over the other. `pr-lifecycle` and `review-gate-workflows` read these files at the commit
  gate.

- **Additional Context:** `notes-session-init-agenda.md` § The always-loaded cut audit

    - `[ ]` **5.2.a `DEV-RULES.ARC`**
        - § When to Load's stale clause, keeping "load it before beginning any task"; the duplicate `STRATEGY-INDEX`,
          workflow-authoring, and methods bullets; the preamble's `DEV-RULES.PROJECT` pointer; § Discovered Work
          Routing's Errand-vs-work-unit pointer; § Method loading's sentence restated in
          `strategy-workflow-authoring.md`; § Artifact relocatability's narrative
        - Remove the link definitions the cuts leave unused — `[workflow-authoring]`, `[arc-methods-dir]`, and
          `[dev-rules-project]`; `[strategy-index]` stays in use
        - § Commit control reads the commit interlock as `config.value.settings["commit.interlock"]` from the agenda's
          residual `config`, and its `releaseRouting` lookups read the agenda's residual inputs or the envelope

    - `[ ]` **5.2.b `AGENT-BRIEF.ARC`**
        - Correct the pipeline line and the release-push "takes no target argument" claim (`arg-grammar.ts` accepts a
          matching `origin <branch>` pair, with or without `-u`); cut § Directory Structure's backlog-nesting line and
          the footer

    - `[ ]` **5.2.c `STRATEGY-INDEX` and `QUICK-REFERENCE.template`**
        - The index's purpose sentence and "these ship with the framework" line in both copies; its "create project
          strategies" prose and example list in package source
        - The reference's duplicate `.arc/` row and fill-time comments, in package source; its heading stays, since the
          partial read keys on it

    - `[ ]` **5.2.d `AGENT-BRIEF.PROJECT.template` and `DEV-RULES.PROJECT`**
        - The brief's fill-time comments, their examples moved into `02_define-project`'s step, and the stale
          "constitution" in § Repository Layout's `.arc/` line, in package source; its footer in both copies
        - The shipped rules in package source: correct the domain-rules paragraph's `constitution/` path to
          `system/rules/` and the stale "constitution" in § File Organization's `.arc/` line; cut the duplicate
          pointers, the quality-gates definition sentence, the fill-time comments, and the self-description; cut the
          capture-routing default text down to its heading and a placeholder line, which
          `03_configure-external-integration` targets
        - This repository's copy takes the duplicate pointers it shares verbatim and keeps its filled self-description
          and its project-specific Capture Routing

### `[ ]` **5.3 Retarget the remaining shipped readers — § 12**

- _Goal:_ Every § 12 reader not retargeted with its arm describes the agenda-driven session correctly in both copies,
  and no source comment cites a section the spine removed.

- _Note:_ `run-errand.md` and `draft-design.md` moved with their arms (Task 4.2), `session-recover.md` with
  `read-load-set` (Task 3.1), and `assess-parallel-fit.md` with `discover-next-work` (Task 4.5).

    - `[ ]` **5.3.a The loading-model readers**
        - `strategy-session-operations.md` § Probe pattern, § Extension contract, § Handoff envelope fields (its pointer
          to the session-init field table points at `arc schema get session-init-envelope`), § Loading Mechanisms
          § Session initialization, and § Session-Init Consumption, whose "Agent-file active gate" describes a load no
          workflow performs and leaves with the rewrite
        - `system/methods/README.md`'s loading model; `strategy-configurability-architecture.md`'s configuration
          source; `reference/briefs/README.md`'s pointer
        - `template-dev-rules.md`'s domain-rules warning, which now arrives as a `note`

    - `[ ]` **5.3.b The lifecycle and configuration readers**
        - `init-work-unit.md`'s inbox backstop reads the agenda's residual `inboxState`, keeping the fresh probe as the
          fallback; `session-handoff.template.md`'s Next Task drops the graduated-lookup clause
        - `arc-config.yml` in both copies: the four `session.init_pull` and `session.init_load` comments describe their
          policies in place, and the base policy's `always` line drops "(refused on a dirty tree)"
        - `AGENT-BRIEF.CONTRIBUTOR.md`: the ordinary path with the brief among the universal reads and the per-work-unit
          session notes
        - Re-pin any test reading the changed text

    - `[ ]` **5.3.c The source comments**
        - Rewrite the comments that cite session-init's removed steps to say what the code does:
          `commands/active/types.ts`, `commands/active/status.ts`, `commands/status/types.ts`, `lib/load-set/types.ts`,
          and `lib/session-init/recommended-action.ts`, with no workflow, step, or `§` reference

### `[ ]` **5.4 Measure the done-signal — Success Criteria 1–3**

- _Goal:_ Both parts of the done-signal are measured by the Phase 1 instruments and recorded beside the baseline.

    - Part 1, per row — a plain resume, Orient, and `--start`: the itemized runs over the spine, `read-load-set`, and
      that row's method, if any, and a real session whose only reads are those files, against ~28% of the baseline
      `session-init.md` by each instrument
    - Part 2: a kit install from this branch entering Orient, the real session's load before the first user-facing
      line less an empty session's, and the itemized runs over the result's always-read set — the agenda output in
      place of the envelope, the spine, `read-load-set`, and `discover-next-work` in place of `session-init.md` —
      against ~60% of the baseline
    - Task 1.1's procedure: the same scripts given the result's item lists, the same first-response rule, and the link
      fill when the install needs it, recorded either way
    - Raw outputs under `~/dev/arc-evidence/session-init-agenda/result/`; the comparison in
      `notes-session-init-agenda.md` § Sizing and measurement

### `[ ]` **5.5 Verify the shipped surface** — validate exit criterion at segment scope

- _Goal:_ Evidence that every § 10–§ 12 surface is converted in every copy that carries it and the pins hold.

    - Search both copies and `packages/arc-framework/src` for references to the removed files and to the old workflow's
      sections
    - Run `framework-sync`, link validation, and `arc check run test:integration:content --range`
    - Run `arc check segment`

## **Phase 6:** Verification

### `[ ]` **6.1 Complete verification** — load and follow `verify-work-unit.md`

---

## Success Criteria

- `[ ]` The baseline is recorded by both instruments from a kit install of the unchanged base before any shipped-text
  commit

- `[ ]` On a plain resume, Orient, and `--start`, the spine plus `read-load-set` plus the entered arm's method is at most
  ~28% of the baseline `session-init.md` by both instruments

- `[ ]` On a kit install entering Orient, the load before the first user-facing line less an empty session's is at most
  ~60% of the baseline's

- `[ ]` `arc agenda session-init --json` validates against `arc schema get session-init-agenda`, refuses each invalid
  flag combination with a typed error, and before the flip leaves files, refs, notes, and markers as found apart from
  `FETCH_HEAD`, with both temporary refs deleted

- `[ ]` Each § 5.4 row and § 5.3 kind compiles to its specified steps and `orientation` over fixture probe values,
  including the held path, the bare `--errand` declines with and without `--isolate`, the `--plan` decline, and an
  unresolved `--start`

- `[ ]` Each § 6 surface compiles to its mapped step with CLI-composed text, and a failed slot yields its degraded-slot
  render and no action

- `[ ]` No surface whose rule withholds automatic execution compiles to an `exec`, no withheld or owner-held remedy
  compiles to an action, and every action argv is published or compiler-composed

- `[ ]` Every sync `exec` and sync choice recompiles, every `exec` ends its agenda, a combined offer replaces two, the
  user-reference apply follows the sync steps, and every recompile argv carries the signals, answers, and done ids its
  position implies, so no answered offer, done `exec`, or followed method fragment recurs

- `[ ]` `session-init.md` is within ~13 KB, names no probe slot, slot field, or arm condition, and ships without the
  `.template.md` suffix

- `[ ]` `read-load-set`, `assess-start-readiness`, and `discover-next-work` are declared in the spine, carried in
  `init-recipe.json` and `CONFIGURABLE_FILES`, and present on a fresh `arc init`; `assess-parallel-fit.md` and
  `in-flight-scope-check.md` ship; `session-recover.md` fires `read-load-set` and keeps its stop rules

- `[ ]` `session-init.contributor.md` and `probe-envelope.md` are gone from both copies and the recipe, no shipped file
  references them, and the `inboxState` routable-count note appears in the served envelope schema

- `[ ]` Each § 11 change lands in every copy § 11 assigns it, and every destination of moved text has an install
  disposition

- `[ ]` Each § 12 reader is retargeted, and every wording-pin test passes against the new text

- `[ ]` The plain resume, `--plan`, `--errand`, branch-gone, Orient discovery, and `--context` rehearsals each start
  from a kit install and reach today's orientation surfaces, questions, and actions except where the specification
  states a change

- `[ ]` All quality gates pass (tests, linting, type checking)

- `[ ]` Ready for integration
