# Task List: cli-substrate-complete-migration

- **Design:** `spec-cli-substrate-complete-migration.md`

---

## **Phase 1:** Residual inventory and contract completions

_Purpose:_ Re-derive the residual inventory at the merged base and seed the residual matrix with the storage carve,
take every test-cost baseline before the first new test file lands, and settle the two contract completions the later
phases compose over.

_Mode:_ `layer` through Phase 2 — closes on the settled contract completions and shared test support that every
replication segment builds on.

### `[x]` **1.1 Re-derive the residual inventory and seed the residual matrix — D1, D10**

- _Goal:_ The residual matrix lists every residual at the merged base by owning contract, every carved item cites its
  storage-coupling register row, every mixed module carries its symbol-range split, and every rowless carved item or
  stranded survivor has gone to the register's owner as a correction — so no later phase migrates carved code or
  strands a survivor.

    - `[x]` **1.1.a Write the three inventory scans and run them at the merged base**
        - Recorded the TypeScript import graph, regular-expression candidates, and coupling-audit class inventory as
          one-off scripts in `notes-cli-substrate-complete-migration.md`; all three ran at merged head `6f1d01261`.

    - `[x]` **1.1.b Create the residual matrix tables**
        - Seeded seven contract tables from the merged-base scans and member residuals, with module-count qualifiers
          for mixed symbols; added the three fixed-column layout tables for the later reconciliation.

    - `[x]` **1.1.c Record the storage carve**
        - Named each mixed module's surviving and carved symbols, classified every `handlers/user.ts` command, and
          marked carved test subjects. `resolveCurrentWuName` keeps its barrel for carved importers.

    - `[x]` **1.1.d Route register corrections**
        - Confirmed the existing inbox-lock correction and captured the rowless identity-wide `user add` bootstrap
          for the storage owner in `USER-INBOX`. Both corrections have matrix citations; the register was not edited.

### `[x]` **1.2 Take every affected test-cost baseline**

- _Goal:_ Every test-cost row that new or converted tests can move has a retained baseline measured on the merged base
  before the first new test file lands, so the closing comparison can be made at all.

- _Outcome:_ Built the CLI and retained three runs for each of `unit`, `integration`, `lane`, and `e2e` before adding
  any tests. `notes-cli-substrate-complete-migration.md` § Test-cost baselines records all paths, medians, and the
  measured head for Task 7.5's comparison; CI owns the six `ci-job` rows.

### `[ ]` **1.3 Add `CanonicalDigestSchema` over exported digest constants — D2**

- _Goal:_ One digest definition serves both the kernel's type guard and a shared schema that infers `CanonicalDigest`,
  projects the JSON Schema pattern the inline regexes emit today, and refuses with a message naming the expected form.

    - The canonical core (`lib/kernel/canonical/canonical-json.ts`) exports the `sha256:` prefix and the hex pattern as
      plain constants and derives `isCanonicalDigest` from them; the core stays free of Zod.
    - The core holds the pattern today as one private regex (`CANONICAL_DIGEST_PATTERN`), which splits into the two
      exported parts.
    - `kernel/schema/vocabulary.ts` exports `CanonicalDigestSchema` as `z.templateLiteral` over those constants, with
      an explicit error message — Zod's default template-literal refusal reads "Invalid input" — and leaves it
      unregistered. The kernel index re-exports it. Existing sites adopt it in Task 6.4; a schema written before then
      for a kernel digest uses it from the start.
    - Tests extend `__tests__/unit/kernel/vocabulary.test.ts`, and the kernel export list in
      `__tests__/unit/kernel/import-boundary.test.ts` gains the schema. That test approves Zod for every kernel module
      today, so it gains a case holding the canonical core to no Zod import.
      `__tests__/unit/canonical/canonical-json.test.ts` keeps its shim pin case until Phase 6 removes it and moves the
      file's behavior tests to `__tests__/unit/kernel/`.
    - Build `test-first` (one behavior at a time):
        - A `sha256:` value with 64 lowercase hex characters parses and infers `CanonicalDigest`
        - Uppercase hex, a wrong length, and a missing prefix refuse with the explicit message
        - `z.toJSONSchema` projects `{ type: "string", pattern: "^sha256:[0-9a-f]{64}$" }`
        - `isCanonicalDigest` and the schema agree over the same accept and refuse cases
        - The import-boundary test refuses a Zod import in the canonical core

### `[ ]` **1.4 Declare `RawGitExec` and `RawGitResult` in the executor contract — D2, D7**

- _Goal:_ The executor contract declares `RawGitExec` and `RawGitResult` beside `GitExec`, every user imports them
  from there, and `classify-change.sh` still runs `change-facts.ts` under plain `node`.

    - `[ ]` **1.4.a Move the declarations into `lib/git/exec.ts`**
        - Take both from `change-facts.ts`, which imports them back type-only: the CI entry point runs the module
          directly under `node`, so it may import only Node built-ins and types.

    - `[ ]` **1.4.b Re-point every importer**
        - About 24 source files and 20 test files, `lib/io-context.ts` and `lib/git/process-executor.ts` among them;
          the types move without a shape change. Record the rewrite recipe in notes § Sweep recipes.

    - `[ ]` **1.4.c Confirm the CI entry point still runs**
        - Run the `classify-change.test.ts` integration test, which spawns the script under plain `node`, and
          `classify-change.sh tree-hash HEAD`.

## **Phase 2:** Shared test support

_Purpose:_ Land the shared test doubles, fixtures, and assertion helper with tests of their own before any conversion
uses them, move the reusable raw test executor onto the execa adapter, and point future test authors at all of it.

_Exit criterion:_ The scripted `GitExec` fake with every capability the design names, the `GitProcessError` fixture,
the meta fixture builder, and the schema-assertion helper exist under `__tests__/helpers/` with passing tests of their
own; `makeGitExecInput` builds on `createExecaGitExecInput`; and the `testing-standards` project override names the
shared support and the doubles that stay local.

### `[ ]` **2.1 Add the `GitProcessError` fixture and the scripted `GitExec` fake — D9**

- _Goal:_ Tests script `GitExec`, `GitExecInput`, and `RawGitExec` through one fake that matches arguments explicitly,
  sequences and computes responses, records calls, rejects with the typed `GitProcessError` the production executor
  emits, and throws on any call nobody scripted.

- _Shape:_ `__tests__/helpers/git-exec-fake.ts` holds the fake and the fixture — one module for the executor contract,
  matching the existing per-concern modules, with nothing appended to `integration.ts`. Helper tests live in
  `__tests__/unit/helpers/`.

    - `[ ]` **2.1.a Add the `GitProcessError` fixture**
        - The fixture takes the invocation — command and arguments — with an exit code or a signal, or a cancellation
          or timeout, plus optional stderr and stdout on any of them; stdout takes bytes as well as a string, for the
          raw variant. It builds the failure through `normalizeGitRejection` (`lib/git/process-error.ts`), so its kind
          and expected outcome are the production executor's classification, never assigned by hand.
        - Build `test-first` (one behavior at a time):
            - A `fetch` exiting 128 that cannot find the remote ref carries `expectedOutcome: "absent-remote-ref"`
            - A rejected `--force-with-lease` push carries `expectedOutcome: "stale-lease"`
            - A cancellation and a timeout build the `canceled` and `timed-out` kinds, keeping any stderr they carry
            - A signal termination builds a `nonzero-exit` failure carrying the signal and no exit code
            - An exit-1 failure keeps its stdout, as a merge conflict's output, and byte stdout reads back unchanged
            - `gitFailureText()` reads the fixture failure's stderr

    - `[ ]` **2.1.b Add the scripted `GitExec` fake**
        - Each entry names its command, defaulting to `git`, since `GitExec` also runs `gh`; matching compares the
          command, then the arguments. Exact matching is the default, and prefix or predicate matching is opt-in,
          covering the `*` tokens and the length-exact and prefix forms local doubles use.
        - The first matching entry in declaration order wins, and a sequence's last response repeats once reached,
          as the counter-based doubles it replaces behave.
        - Build `test-first` (one behavior at a time):
            - An entry matches its command and arguments exactly by default
            - An entry for `gh` answers only `gh` invocations
            - An entry opts into prefix or predicate matching
            - When several entries match, the first declared answers
            - An entry's response sequence is consumed in call order, and its last response repeats
            - A computed entry answers from the call's arguments and options
            - The recorder returns every call with its command, arguments, and options
            - A failure entry rejects with a fixture `GitProcessError` built from the matched invocation
            - An unmatched call throws, naming its command and arguments

    - `[ ]` **2.1.c Add the `GitExecInput` and `RawGitExec` variants**
        - Same table, matching, sequencing, and recording semantics. The input variant takes arguments and a string
          payload and resolves stdout as a string; the raw variant takes arguments and optional byte `input` and
          resolves a byte `RawGitResult`. Both signal failure only by rejecting with a fixture failure.
        - Build `test-first` (one behavior at a time):
            - The input variant matches on arguments and records the stdin payload
            - The raw variant resolves scripted byte output and records byte input
            - Both variants reject a failure entry with a fixture `GitProcessError`
            - Both variants throw on an unmatched call

### `[ ]` **2.2 Add the meta fixture builder — D9**

- _Goal:_ Fixture setup builds meta files through the production renderer, so a meta fixture cannot drift from the
  shape `renderMetaFile` emits.

    - `__tests__/helpers/meta-fixture.ts`, over `renderMetaFile` in `lib/active/meta-reader.ts`. The renderer parses
      its input through `MetaRecordSchema`, where `state` and `owner` have no default, so the builder supplies both;
      every other field takes a per-field override.
    - It returns the Markdown string; a test that needs narrative sections appends them.
    - Build `test-first` (one behavior at a time):
        - The default build parses back through `parseMetaRecord` and `toMetaRecord` to its inputs
        - An override changes only its field
        - An invalid semantic value refuses through the renderer's schema

### `[ ]` **2.3 Add the schema-assertion helper — D9**

- _Goal:_ A failing schema assertion in a test reports what went wrong — the schema's issues when a value should
  pass, the parsed output when it should refuse — rather than `expected false to be true`.

    - `__tests__/helpers/schema-assertion.ts`, in two forms: one asserts acceptance and returns the parsed value; one
      asserts refusal, optionally at an expected issue path. Most inline assertions assert refusal, so both forms are
      needed for any conversion to finish.
    - Build `test-first` (one behavior at a time):
        - The acceptance form returns the parsed value for a conforming value
        - The acceptance form fails with each issue's path and message for a nonconforming value
        - The refusal form passes for a nonconforming value
        - The refusal form fails with the parsed output when the value unexpectedly passes
        - The refusal form fails when an expected issue path is given and the refusal lands elsewhere
        - A registered schema validates through both forms

### `[ ]` **2.4 Move `makeGitExecInput` onto the execa adapter and localize `stubGitExec` — D9**

- _Goal:_ The shared raw test executor rejects with the typed failures production emits, and `integration.ts` no longer
  carries a constant stub that serves one test file.

- _Note:_ `base-advance.ts` keeps its raw `git()` runner — it arranges repositories, and the module avoids runtime
  imports from `src/` so the spawned test lane can reach it.

    - `[ ]` **2.4.a Build `makeGitExecInput` on `createExecaGitExecInput`**
        - Follow `makeGitExec`'s pattern in `__tests__/helpers/integration.ts`: default the `cwd` and pass the
          caller's options through, which today's `spawn` version ignores. Run its 16 direct consumers, the four that
          reach it only through `makeUserIO`, and `notes-publication-history.test.ts`, which reaches it only through
          `makeNotesTreeCommit`; none asserts the old rejection text.

    - `[ ]` **2.4.b Move `stubGitExec` into `__tests__/integration/active.test.ts`**
        - Its only consumer; remove it from `integration.ts`.

    - `[ ]` **2.4.c Record the raw test executor rows**
        - `makeGitNoteWriter` and `makeGitNoteReader` in `integration.ts` stand in for the carved `writeGitNote` and
          `readGitNote` inside `makeUserIO`, whose seven consumers test carved notes code, so they follow their subject
          and stay as they are.
        - Rows: `makeGitExecInput` migrated; the notes helpers carved under the notes-specific sync row; the
          `base-advance.ts` runner retained under the arrangement-runner rule; and the private `spawn` executors in
          `e2e/race-worker.ts` retained as real-Git plumbing for a spawned race worker. Together they close the
          executor member's routed item.

### `[ ]` **2.5 Name the shared test support in the `testing-standards` project override — D9**

- _Goal:_ A test author who loads `testing-standards` learns to script `GitExec` through the shared fake with
  `GitProcessError` failures, build meta fixtures with the builder, and assert schemas through the helper — and which
  doubles stay local.

- _Note:_ The override exists only in `.arc/system/methods/testing-standards.md`; the package copy carries none, so
  no package sync applies. Write the bullet in the shipped-content register.

    - Add one bullet to the override: the shared fake, fixture, builder, and helper, and the doubles that stay local —
      constant one-response stubs, real-Git doubles, fault-injecting hybrids, and scenario simulators.

## **Phase 3:** Validation surfaces and session envelope

_Purpose:_ Retire the validation-surface re-exports, route every surviving `lib/user-sync/` symbol through its owning
module, and complete the surviving session-envelope types as registered strict schemas. It runs first among the
replication segments because a strict root that misses a producer key fails session-init for every session.

_Mode:_ `replication` — closes when every validation-surface re-export and every surviving routed session-envelope
type is exhausted and batch-verified.

_Exit criterion:_ No importer reaches a retired validation-surface re-export, and no surviving importer reaches a
`lib/user-sync/` survivor this segment routes through the barrel; the ten roots are registered strict at version 1,
each parsing output its producer returns; the checkpoint wraps validate against the full drift schema; and the
regenerated schema bundle's diff is confined to the expected entries while the session-envelope goldens pass
unchanged.

_Design decisions:_ Every replication segment closes after a base merge that re-runs the inventory scans and the
recorded sweep recipes; see `notes-cli-substrate-complete-migration.md` § Segment boundaries.

### `[ ]` **3.1 Retire the validation-surface re-exports and route `lib/user-sync/` survivors — D4, D1**

- _Goal:_ Every importer of a validation surface, and every surviving importer of a `lib/user-sync/` survivor this
  segment routes, reaches it through its owning module; the old-path and cross-WU entry re-exports are gone, and
  barrel exports only carved importers still use stay for the notes deletion pass.

    - `[ ]` **3.1.a Retire the five old-path re-export sites**
        - `lib/release/types.ts`, `lib/active/meta-reader.ts`, `lib/config/status-reader.ts`,
          `lib/commit-check/config.ts`, and `commands/config/types.ts`, with the relays that pass them on:
          `commands/config.ts`, and `lib/commit-check/index.ts` for `COMMIT_CHECK_CONFIG_FIELDS`, whose importers take
          it from `lib/config/schema.ts`.
        - Re-point every importer; search static and dynamic imports, `vi.mock` specifiers, and fixtures before
          deleting each re-export, and record the rewrite recipe in notes § Sweep recipes. `lib/release/types.ts`'s
          header stops claiming the audit types as its own.

    - `[ ]` **3.1.b Retire the cross-WU entry re-exports in `lib/user-sync/index.ts`**
        - Inbox state and reminders take the entry types from `lib/user-sync/schema.ts` and the parser from
          `lib/user-sync/parser.ts`; `user-sync-merge.test.ts`, a test of carved merge code, takes the import rewrite
          as a forced edge.

    - `[ ]` **3.1.c Route the remaining survivors through their owning modules**
        - `inbox-writer.ts` and `execution-offer.ts` for the surviving barrel importers `handlers/errand.ts`,
          `commands/user/inbox-mutation.ts`, and `lib/session-init/inbox-state.ts`, with the survivors' tests; carved
          importers keep the barrel, `resolveCurrentWuName`'s among them (Task 1.1.c).
        - `inbox-mutation.ts` also takes the advisory lock the barrel relays from `lib/advisory-lock.ts`, and
          `getNotesLockPath` from `lib/user-sync/notes-lock.ts`; its matrix row cites the correction Task 1.1.d
          confirms. The failure-text predicates and `resolveGitCommonDir` move in Task 4.5.
        - Search static and dynamic imports and `vi.mock` specifiers of the barrel, as Task 3.1.a does, and record
          the rewrite recipe in notes § Sweep recipes.

### `[ ]` **3.2 Complete the leaf session-init slot schemas — D5**

- _Goal:_ Seven leaf roots have full strict schemas that are their types' `z.infer` authority, are registered at
  version 1 `strict-current`, and parse the output their producers return — so a key a producer emits that its root
  does not declare fails a unit test before it fails session-init.

- _Approach:_ Per root, co-locate the schema with its producer module — or beside its type where a load-time boundary
  keeps the producer from importing it — derive the type from it and retire the handwritten declaration, register it
  in `lib/session-envelope/registry.ts` under the ID its subtask names, and compose it into every envelope that carries
  its slot in place of the thin view in `commands/status/schema.ts`.

- **Additional Context:** `notes-cli-substrate-complete-migration.md` § Session-envelope roots — the IDs, the
  composition rule, the producer-output rule, and the tests that change with the roots

    - `[ ]` **3.2.a Complete `DirtyStateResult` and `CurrentHuskAdvisory`**
        - IDs `dirty-state` and `current-husk-advisory`. Both arms of the husk stamp's evidence, `shipped` and
          `git-transition`, carry a kernel digest, which validates through `CanonicalDigestSchema`.
        - Build `test-first` (one behavior at a time):
            - Each root parses its producer's output for every state the producer reaches
            - Each root refuses an undeclared key, naming it

    - `[ ]` **3.2.b Complete the extensions, active, and domain-rules session-init results**
        - `ExtensionsSessionInitResult`, `ActiveSessionInitResult`, and `DomainRulesSessionInitResult`, with IDs
          `extensions-session-init`, `active-session-init`, and `domain-rules-session-init`.
        - Session-init fills its `active` slot through `projectDerivedActiveSession` in `commands/status/run.ts`,
          exported for its test, which yields `none` and `single`; the standalone resolver in
          `commands/active/status.ts` yields `multiple` and warnings. `ActiveSessionInitResult`'s schema sits in a
          schema module beside its type in `commands/active/`, which `status.ts` imports type-only, since
          `cli-loading-boundary.test.ts` pins its integration-boundary import as lazy.
        - Build `test-first` (one behavior at a time):
            - Each root parses its producer's output for every resolution and warning state the producer reaches —
              for the active root, both producers
            - Each root refuses an undeclared key, naming it

    - `[ ]` **3.2.c Complete `ConfigSessionInitResult`**
        - ID `config-session-init`. Compose the ten catalog keys from each catalog field's `policy.values`, which is
          the leaf enum without the catalog's empty-string arm, and `commit.interlock` and `push.interlock` from
          `lib/release/schema.ts`'s interlock enums, exported for it.
        - With the type derived from its schema, the `config` exemption in the envelope's compile-time compatibility
          proofs retires. The producer passes some settings through verbatim and keeps its cast over them, so a
          misconfigured value still fails envelope validation at the config slot, naming its key.
        - Build `test-first` (one behavior at a time):
            - The root parses its producer's output for defaulted and overridden settings
            - The root refuses a catalog key's empty-string arm
            - The root refuses an undeclared key, naming it

    - `[ ]` **3.2.d Complete `ReleaseRoutingValue`**
        - ID `release-routing`. The rationale's interlock fields stay strings, as its type declares, since routing
          safe-defaults an unknown interlock value to raw; a malformed rationale is a wrong type, a missing key, or an
          undeclared key.
        - Build `test-first` (one behavior at a time):
            - The root parses its producer's output, with its `rationale`, for each opt-in and interlock combination
            - The root refuses a rationale with a wrong-typed field, a missing key, or an undeclared key

### `[ ]` **3.3 Complete the worktree schemas and the worktree snapshot root — D5**

- _Goal:_ `WorktreeSyncStatusResult` and `WorktreeRosterResult` have full schemas as their types' authority, and the
  worktree slot in both envelopes composes a registered strict snapshot root whose refusals name the offending key.

- **Additional Context:** `notes-cli-substrate-complete-migration.md` § Session-envelope roots

    - `[ ]` **3.3.a Complete `WorktreeSyncStatusResult` and the worktree snapshot root**
        - The full schema stays an unregistered component. `WorktreeSnapshotAnalysisResult` is `withRemoteEvidence`
          over its fields without `failureReason`, registered as `worktree-sync`; each envelope's worktree slot builds
          its strict arms from those fields plus its own and keeps its cross-field refinements.
        - The slot's own fields take strict schemas as unregistered components: `WorktreeIdentity` from
          `lib/git/worktree-identity.ts`, and `supersession` as its probe emits it — `SupersessionResult` when no
          remote read is needed, otherwise `SupersessionSnapshotAnalysisResult`'s remote-evidence arms, the unreachable
          one with a failure reason. The slot's declared `SupersessionResult | null` widens to match.
        - Build `test-first` (one behavior at a time):
            - The snapshot root parses the snapshot analyzer's output for each state and remote-evidence arm
            - Only the unreachable arm carries a failure reason
            - The root refuses an undeclared key, naming it
            - The supersession schema parses `analyzeSupersessionSnapshot`'s output in each arm and the not-needed
              result the probe returns
            - Each envelope's worktree slot accepts its composed value — a diverged worktree with its supersession
              included — keeps its refinements, and names an undeclared key in its refusal

    - `[ ]` **3.3.b Complete `WorktreeRosterResult`**
        - ID `worktree-roster`. The emitted shape keeps its full schema under the type-edge rule, although the roster's
          placement read later moves behind the storage contract.
        - Build `test-first` (one behavior at a time):
            - The root parses the roster's output for worktrees with and without a resolved meta
            - The root refuses an undeclared key, naming it

### `[ ]` **3.4 Complete `BaseDriftResult`, the base-distance snapshot root, and the checkpoint wraps — D5, D2**

- _Goal:_ `BaseDriftResult`'s full schema is its type's authority and validates the drift inside the integration
  checkpoint's emitted result without refusing any drift a reading produces, and the base-distance slot composes a
  registered strict snapshot root no wider than today's type.

- **Additional Context:** `notes-cli-substrate-complete-migration.md` § Session-envelope roots

    - `[ ]` **3.4.a Complete `BaseDriftResult`**
        - With its `BaseDistanceStatusResult` alias and nested types, as an unregistered component. Data produced by
          carved code keeps its plain shape (`OverlapEvidence.regenerablePaths: string[]`); carved inputs such as
          `PathTreatmentClassifier` never enter the schema, and no `z.custom` enters a registered closure.
        - Build `test-first` (one behavior at a time):
            - The schema parses drift output for each verdict
            - The schema parses each integration-evidence and overlap arm an authoritative reading produces
            - The schema refuses an undeclared key, naming it

    - `[ ]` **3.4.b Register the base-distance snapshot root**
        - `BaseDistanceSnapshotAnalysisResult | BaseDistanceNotApplicableResult`, registered as `base-distance`:
          explicit strict arms per verdict, the snapshot arms on `exact`, `pending-fetch`, and `unreachable`, and the
          not-applicable arm bounded to its three states. The session-init slot builds its arms from the root's fields
          plus the recommendation fields and keeps its refinements.
        - The not-applicable results are object literals inside the `baseDistance` probe in `handlers/status.ts`;
          extract them into a named builder beside `analyzeBaseDistanceSnapshot`, which the probe calls and the root's
          test drives.
        - Build `test-first` (one behavior at a time):
            - The root parses the snapshot analyzer's output for each verdict and remote-evidence arm
            - The root parses the not-applicable result for each of its three states
            - The root refuses a not-applicable reading in any other state
            - The session-init slot accepts its composed value, keeps its refinements, and names an undeclared key in
              its refusal

    - `[ ]` **3.4.c Validate the checkpoint drift against the full schema**
        - Replace the four `z.custom<BaseDriftResult>()` wraps in `scripts/integration/checkpoint.ts`; the result's
          shape does not change. A mismatch is a producer defect and refuses through the command's existing
          operation refusal, whose remedy re-runs the checkpoint once the reported failure is resolved.
        - Build `test-first` (one behavior at a time):
            - Each checkpoint result arm that carries a drift parses the drift an authoritative reading produces
            - A malformed drift refuses through the operation refusal, whose detail names the drift field and whose
              remedy carries the re-run command

### `[ ]` **3.5 Verify the envelope schema bundle and goldens** — validate exit criterion at segment scope

- _Goal:_ The segment's exit criterion holds as one batch at the post-merge head.

- **Additional Context:** `notes-cli-substrate-complete-migration.md` § Schema bundle diff

    - Write the bundle projection under notes § Schema bundle diff and diff the merge base's bundle against the head's;
      confirm the diff is confined to the ten new roots and the session-init and session-recover envelopes.
    - Build, then run `__tests__/e2e/session-envelope-compat.e2e.test.ts` without expectation changes, and run
      `benchmark:session-envelope`, recording its validation latency against the benchmark's limits.
    - Search for every retired re-export and every barrel route this segment retires; confirm the segment's matrix
      rows carry their dispositions and evidence, and that its edits to carved code are compile-forced.
    - Evidence for the Success Criteria on validation-surface re-exports, the session-envelope schemas and their
      registration, the checkpoint drift wraps, and this segment's share of the bundle diff, the goldens, and the
      `lib/user-sync/` barrel routing.

## **Phase 4:** Command inputs and Git residual

_Purpose:_ Bring every surviving command surface under the command-input regime, thread a bound executor through every
context-bearing Git spawn, and finish the executor residual that the notes deletion pass would otherwise strand.

_Mode:_ `replication` — closes when every command surface and unbound executor use is exhausted and batch-verified.

_Exit criterion:_ The always-JSON and value-bearing adapters are wrapped, the handlers that reach Git build their
executors from the context the wrap hands them, and the missing declarations exist; no surviving context-bearing command
path spawns Git through an unbound executor; the failure-text predicates and `resolveGitCommonDir` live under
`lib/git/` with no importer reaching them through `lib/user-sync/`; errand identity classifies failures through
`gitFailureText()`; and `classify-change.sh` still runs.

### `[ ]` **4.1 Wrap and bind the always-JSON commands and add the missing machine-mode declarations — D8**

- _Goal:_ Every always-JSON command runs in machine mode and spawns Git under that mode's subprocess policy, and
  `attest`, `publish`, and `locus` declare theirs, so none of them can stop on a terminal prompt.

- _Approach:_ Each batch wraps its adapters with `machineReadable: () => true` and binds their handlers the way
  `handleReviewFrontlineRun` is bound: an optional supplied context that defaults to a machine-mode process context,
  and default dependencies that build every executor the handler reaches from `context.subprocess` — its `gitExec`
  uses, the `review.ts` helpers it calls, and the policy-less `createGitExec()` in the frontline and changeset resolve
  dependencies. A wrap alone leaves Git's terminal prompts enabled. `review planning-lane` prints text and is carved.

- _Note:_ The inventory's machine-mode routing rule sees only `--json` options, and its source scanner records only
  whether an action receives an interaction context. Task 4.1.a extends the scanner to record a constant machine-mode
  policy, and each batch adds its command paths to a `repository-inventory.test.ts` case requiring every always-JSON
  command to route through the adapter under one.

    - `[ ]` **4.1.a Extend the scanner, and wrap and bind merge lock resolve, hold, and release**
        - The source scanner records `machineReadable: () => true` and the literal `machineReadable: true` as a constant
          machine-mode policy, and a predicate or an absent policy as not.
        - `readinessBoundTo` and the exported `defaultMergeLockPort` take the executor, and delivery execution's two
          merge-lock releases pass the executor they already hold, so delivery's readiness read runs under the delivery
          command's policy.
        - Build `test-first` (one behavior at a time):
            - The scanner records both constant forms as machine mode, and records a predicate or absent policy as not
            - Called without a supplied context, each handler resolves a machine-mode process context
            - Each handler's default dependencies build their executors from that context's subprocess policy
            - Delivery's merge-lock release reads readiness through the delivery command's executor
            - The inventory case requires the three command paths to route through the adapter under a constant
              machine-mode policy

    - `[ ]` **4.1.b Wrap and bind the six review resolve-family commands**
        - Review resolve, merge-method resolve, checks await, readiness, frontline resolve, and changeset resolve.
          Merge-method resolve and checks await reach only the `gh` runner, whose stdin is already closed; they take
          the context and build no executor.
        - Build `test-first` (one behavior at a time):
            - Called without a supplied context, each of the four handlers that reach Git resolves a machine-mode
              process context and builds its executors from that context's subprocess policy
            - The inventory case requires the six command paths to route through the adapter under a constant
              machine-mode policy

    - `[ ]` **4.1.c Wrap and bind hosted request, await, and settle**
        - Build `test-first` (one behavior at a time):
            - Called without a supplied context, each handler resolves a machine-mode process context
            - Each handler's default dependencies build their executors from that context's subprocess policy
            - The inventory case requires the three command paths to route through the adapter under a constant
              machine-mode policy

    - `[ ]` **4.1.d Wrap and bind local prepare, attest, and resume, and review respond and reduce**
        - Build `test-first` (one behavior at a time):
            - Called without a supplied context, each handler resolves a machine-mode process context
            - Each handler's default dependencies build their executors from that context's subprocess policy
            - The inventory case requires the five command paths to route through the adapter under a constant
              machine-mode policy

    - `[ ]` **4.1.e Add the three missing machine-mode declarations**
        - The `attest` and `publish` policy declarations, and both the adapter wrap and the declaration for `locus`,
          whose command surface survives although its derivation body is carved. Declared, their `--json` options fall
          under the inventory's machine-mode routing rule.

### `[ ]` **4.2 Wrap the value-bearing human-output commands — D8**

- _Goal:_ `user close`, `config validate`, `release setup print-patterns`, and `log standalone` run under the
  command-input adapter and inherit its non-interactive behavior, and `log standalone` spawns Git under the context it
  receives.

- _Approach:_ `log standalone`'s handler takes the context and builds its executor from `context.subprocess`.
  `config validate` and `print-patterns` reach neither Git nor a prompt, so their handlers are unchanged. The
  `user close` adapter wraps while its carved body keeps reaching Git through the executor Task 4.3.c passes.

### `[ ]` **4.3 Require an executor in the shared handler helpers — D8, D1**

- _Goal:_ `resolveUserIdentity`, `resolveIdentityWithPrompt`, and `requireGitRepo` require an executor, so no caller
  reaches Git through the unbound singleton by default.

    - `[ ]` 4.3.a Make the executor a required parameter in `handlers/shared.ts`

    - `[ ]` **4.3.b Thread the invocation's executor from every surviving caller**
        - Errand, lifecycle, start, init, join, release push and commit, active, and the user commands the Task 1.1.c
          split leaves surviving in `handlers/user.ts`.

    - `[ ]` **4.3.c Pass `createGitExec()` at the carved call sites**
        - The carved commands in `handlers/user.ts`, `handlers/user-sync.ts`, and `handlers/sync.ts`, along the Task
          1.1.c split; a forced edge that builds exactly the executor the `gitExec` singleton holds, so their behavior
          does not change.

### `[ ]` **4.4 Thread bound executors through the remaining unbound Git spawns — D8**

- _Goal:_ No surviving context-bearing command path spawns Git through an unbound executor — the `gitExec` singleton or
  one built without a subprocess policy — exported helpers' callers included; the singletons remain only for standalone
  scripts, as fallbacks that bound callers override, and in carved code.

- **Additional Context:** `notes-cli-substrate-complete-migration.md` § `gitExec` singleton importers

    - `[ ]` **4.4.a Thread the CLI-reachable singleton importers**
        - The 13 importers in the notes list, with `review.ts`'s always-JSON handlers bound in Task 4.1 and
          `log standalone` in Task 4.2; `review.ts`'s remaining uses sit in the handlers already wrapped.
        - `release opt-in` and `opt-out` reach Git with no command-input wrap; their adapters wrap with an empty policy,
          as `release push` does, and their handlers build their executors from the context.
        - Five hold the singleton only as a fallback and keep it, with every bound caller overriding it: active status,
          config status, setup verify, `release status` in `record.ts`, and `committed-progress.ts`.

    - `[ ]` **4.4.b Thread `config status` and the `release commit` module executors**
        - The `config status` adapter stops discarding its context and threads its executor.
        - `commit-cli.ts` spawns through the `gitExec` singleton and a module-level `createExecaGitExec()`,
          `capturedGitExec`, which goes: every use takes the invocation's executor — the hooks-path check and the
          prepare-commit-msg hook probe in `handleReleaseCommit`, and the snapshot, message-file read, retry-store, and
          head-resolution helpers.
        - The helpers delivery's review-fix release effects import (`createRealCommitMessageSnapshot`,
          `readRealCommitMessageFileWithIdentity`, and the retry store's persist and cleanup) become factories over an
          executor, as does the module-private `realResolveHead`; `handleReleaseCommit` passes the invocation's, and
          delivery passes its bound one.
        - Build `test-first` (one behavior at a time):
            - `handleReleaseCommit`'s helpers spawn Git through the executor the invocation passes
            - Delivery's review-fix snapshot and message-file read reach Git through the delivery command's executor

    - `[ ]` **4.4.c Bind `GitExecInput` in the `active in-flight` adapter**
        - Add `createGitExecInput(interaction?)` beside `createGitExec` in `lib/io-context.ts`, returning the
          `gitExecInput` singleton when unbound; `createUserIOContext` builds through it, and the adapter binds its
          `GitExecInput` from `context.subprocess` the way it already binds its `GitExec`. The in-flight body it calls
          stays carved, and carved `writeGitNote` keeps calling the singleton under the notes-specific sync row.
        - Build `test-first` (one behavior at a time):
            - Unbound, the factory returns the `gitExecInput` singleton
            - Bound, the executor it returns spawns Git under the given subprocess policy

    - `[ ]` **4.4.d Record the remaining unbound executors**
        - Matrix rows for the standalone scripts that keep `gitExec`, for each of the five fallback holders, for
          `local-test-admission.ts`, whose policy-less executor serves the standalone test runners, and for the
          module-level `candidateGitExec`, `gitExec`, and `gitExecInput` in `lib/io-context.ts`, retained as the
          singletons and their base; the `assert-layout-migration.ts` row Task 5.1 closes when it deletes the script.
        - A carved row for `prepareGitRefVerification` in `lib/io-context.ts`, whose direct `execa` spawn carries no
          interaction environment and serves only `park --land`'s planning landing, the carved lifecycle write path.

### `[ ]` **4.5 Move the Git failure-text predicates and `resolveGitCommonDir` into `lib/git/` — D7, D1**

- _Goal:_ The three failure-text predicates live in `lib/git/ref-tree.ts` and `resolveGitCommonDir` in
  `lib/git/exec.ts`, and no importer reaches either through `lib/user-sync/`, so the notes deletion pass strands
  nothing.

- _Note:_ `git-decompose-v3-operation-io.ts` defines its own `resolveGitCommonDirectory`, and
  `pre-publication-delivery-targets.ts` receives `resolveGitCommonDir` as an injected dependency; neither imports it.

    - `[ ]` **4.5.a Move `isCasRejectionError`, `isRemoteUnavailableError`, and `isNonFastForwardError`**
        - From `lib/user-sync/notes-merge.ts` to the state-ref plumbing the errand refs already use; the errand refs
          re-point, and carved notes code re-points as a forced edge. Their tests follow them. Record the rewrite
          recipe in notes § Sweep recipes.

    - `[ ]` **4.5.b Move `resolveGitCommonDir` beside `isGitRepo`**
        - From `lib/user-sync/repo-shared-paths.ts`; its nine surviving importers in delivery, the review gate, local
          test admission, and the worktree operation lock follow, by a recipe recorded in notes § Sweep recipes.
          `getRepoSharedUserInternalDir` stays behind for the notes machinery and the inbox mutations' lock path (Task
          1.1.d).

### `[ ]` **4.6 Classify errand identity failures through `gitFailureText()` and rename the spawn factory — D7**

- _Goal:_ Errand identity code reads Git failures through `gitFailureText()`, so its retry-or-stop decision rests on
  Git's complete stderr rather than a bounded message, and the `createRawGitExec` name belongs only to the execa
  adapter.

    - `[ ]` **4.6.a Replace the `.message` classification in errand identity code**
        - The compare-and-swap check on the write and the remote-unavailable check on the push in
          `lib/errand/identity-transaction.ts`; `record.ts` and `merge.ts` already read `gitFailureText()`.
        - A typed failure's message already carries its stderr on one line, capped at 1,024 characters and falling back
          to stdout, so only a condition past that window or on stdout alone tells the two readings apart.
        - Build `test-first` (one behavior at a time), in `__tests__/unit/errand-identity-transaction.test.ts` with the
          `GitProcessError` fixture:
            - A compare-and-swap rejection whose stderr carries the condition past the message window retries the write
            - A push failure whose stderr names an unreachable remote past the window stops instead of retrying
            - A condition named only on stdout does not classify
            - An unrelated write failure stays an error carrying its message

    - `[ ]` **4.6.b Rename the `change-facts.ts` spawn factory to `createSpawnRawGitExec`**
        - It stays exported for the four integration tests that import it; `object-availability.test.ts` drops its
          alias. The execa adapter in `lib/io-context.ts` keeps `createRawGitExec`.
        - The spawn executor's matrix row is retained-raw: `change-facts.ts` must not import `lib/io-context.ts` or
          execa, since `classify-change.sh` runs it standalone.

### `[ ]` **4.7 Verify every command path binds its executor** — validate exit criterion at segment scope

- _Goal:_ The segment's exit criterion holds as one batch at the post-merge head.

    - Confirm reach, not only imports: `gitExec`'s surviving importers are exactly the standalone scripts and the five
      fallback holders, and no exported helper or module-level constant a surviving context-bearing caller reaches
      spawns through a singleton or a policy-less executor. `gitExecInput`'s only surviving use is the unbound fallback
      `createGitExecInput` returns, and the only surviving executors built without a subprocess policy are the
      module-level ones in `lib/io-context.ts` and `local-test-admission.ts`'s.
    - Confirm every always-JSON and value-bearing adapter and `release opt-in` and `opt-out` are wrapped, the inventory
      case names all 17 always-JSON paths under a constant machine-mode policy, and the three declarations exist;
      search for the predicates, `resolveGitCommonDir`, and the old spawn factory name; run `classify-change.sh`.
    - Confirm the segment's matrix rows carry their dispositions, and that its edits to carved code are compile-forced.
    - Evidence for the Success Criteria on the adapter wraps, handler bindings, and declarations, the shared-helper
      executors, the remaining unbound executors, the spawn factory name, the predicate and `resolveGitCommonDir`
      homes, and errand failure classification.

## **Phase 5:** Layout framework paths and dispositions

_Purpose:_ Retire the layout migration ledger, move framework-path construction onto the resolver, and give every
remaining layout-class code hit a disposition, so the residual rule the ledger proved holds without it.

_Mode:_ `replication` — closes when every layout-class code hit is migrated or disposed and the reconciliation holds
both ways.

_Exit criterion:_ The code-surface reconciliation over the 15 layout classes reports no hit without a per-file row or
carved-module predicate, no overlap the precedence does not settle, no row or predicate without a hit, and no row whose
hit count moved, and its negative control reports exactly the removed hits beyond the unremoved run's report; every
non-code surface falls under a recorded predicate; and no framework-class hit in a surviving module lacks a disposition
kind.

### `[ ]` **5.1 Retire the layout migration ledger — D6**

- _Goal:_ Nothing in the tree carries, checks, or excludes the layout migration ledger.

    - Remove `audits/coupling-blast-radius/layout-migration-ledger.json`,
      `lib/coupling-audit/layout-migration-ledger.ts`, `scripts/assert-layout-migration.ts`, the root
      `audit:layout-migration` script, and their unit and integration tests.
    - Remove the script's entry in `one-shot-script-entrypoints.test.ts` and the ledger's exclusion in the
      coupling-audit `manifest.json`; search for every remaining reference.
    - Close the script's `gitExec` matrix row that Task 4.4.d records, citing the deletion.

### `[ ]` **5.2 Record the code-surface reconciliation and the non-code predicates — D6, D10**

- _Goal:_ One recorded command reconciles the matrix's layout rows and predicates against the coupling-audit class scan
  in both directions and is shown to report what it should, and every non-code surface falls under a recorded
  class-level predicate.

- **Additional Context:** `notes-cli-substrate-complete-migration.md` § Layout reconciliation — the 15 class IDs, the
  framework and state split, and the tables the script reads

    - `[ ]` **5.2.a Write the one-off reconciliation script**
        - Call the coupling-audit library as the state-path recount did (`parseCouplingManifest`,
          `selectCorpusPaths`, `collectCorpusFromPaths`, `scanClassInventory`) and keep the 15 layout classes, which the
          script declares itself because Task 5.1 deletes the module that held them.
        - Assign each hit to exactly one rule. A per-file row matches on file and class, a carved-module predicate on
          module path, and a non-code predicate on surface kind and path prefix, where the longest matching prefix wins
          and `—` (every path of the kind) is the shortest; no other precedence exists.
        - Report every code hit without a per-file row or carved-module predicate, every non-code hit without a
          non-code predicate, every hit matched by more than one rule the precedence does not settle, every row or
          predicate with no hit assigned — a fully shadowed predicate among them — and every per-file row whose
          assigned hit count differs from its recorded `Hits`.
        - A row's lines are evidence, re-derived whenever a base merge refreshes the counts; its `Hits` count is
          refreshed only after any added hit is classified.
        - Keep it outside the tracked tree, with its source and command in notes § Layout reconciliation; a tracked
          gate would rebuild the ledger Task 5.1 retires.

    - `[ ]` **5.2.b Record the non-code and carved-module predicates**
        - Class-level predicates over surface kind and path for test, prose, workflow, config, and template surfaces,
          in the matrix's non-code predicate table; one predicate per wholly carved module, `external-owner`, citing
          its register row.
        - The layout contract's two routed items take rows in the layout table, outside the reconciliation's tables.
          The draft-retirement residual — the guarded retirement mechanic in `activate-work-unit.md` and its
          description in `strategy-work-planning.md` — is a Git-operation residual, not path construction, so it is
          owned outside the cohort by `composable-workflows`. The layout-class hits in both documents, whose package
          copies are what the audit corpus holds, fall under the ordinary non-code predicates. The
          `provisional-placement` callers take a carved row citing their register rows; that class is outside the 15.
        - Run the negative control and record its report: with one carved-module predicate and one non-code predicate
          removed — each chosen with no less specific rule to fall back to — the reconciliation reports exactly their
          hits beyond the unremoved run's report; restored, it reports none of them.

### `[ ]` **5.3 Move framework-path construction onto the resolver — D6**

- _Goal:_ Surviving TypeScript builds every framework path a resolver token covers through the resolver, and every
  owner of an `.arc/system` descendant the resolver does not select composes its own suffix onto the resolved
  `arc-root` — except where it builds a work-unit state path, which is carved and takes its row under Task 5.4.b.

- _Approach:_ Token-covered construction migrates: the `.arc` root through `arc-root`, the method and workflow roots
  through `procedure-root`, and template outputs through `resolveTemplateOutputPath`. The layout contract exports no
  generic join, so an owner of another descendant resolves `arc-root` and composes its suffix, as
  `config/status-reader.ts` does with `ARC_CONFIG_SUFFIX`. A composed suffix no longer matches the `arc-root` class;
  any hit that remains, such as an ignore pattern or a doc comment, takes a kind under Task 5.4.

- _Note:_ Record each batch's rewrite recipe in notes § Sweep recipes so it re-runs after base merges.

    - `[ ]` **5.3.a Compose the `.arc/system/.internal/` framework bookkeeping onto `arc-root`**
        - Manifest, pristine store, hook and script paths, and the worktree marker, each from its owner's suffix,
          starting from `INTERNAL_DIR_SEGMENTS` in `lib/constants.ts`. Candidate, submission-boundary, and transition
          records are carved and stay.

    - `[ ]` **5.3.b Migrate the `.arc` root, procedure roots, and template outputs**
        - Other `.arc/system` descendants compose their owner's suffix onto `arc-root` the same way.

    - `[ ]` **5.3.c Migrate or dispose the install and file-classification hits**
        - Most may take a disposition kind instead; any that fit no kind migrate.

### `[ ]` **5.4 Dispose the remaining code-surface layout hits — D6, D10**

- _Goal:_ Every remaining layout-class code hit has a row — carved modules by predicate, mixed modules along their
  split, and surviving modules per file and class with a disposition kind and an owner — and the work-unit state-path
  residual is complete and file-exact.

- **Additional Context:** `notes-cli-substrate-complete-migration.md` § Work-unit state-path recount

    - `[ ]` 5.4.a Dispose the mixed modules along their symbol-range splits

    - `[ ]` **5.4.b Dispose the work-unit state-path hits and the other state-class hits in surviving modules**
        - A hit of any layout class that constructs or recognizes a work-unit state path is `external-owner`, citing
          the `storage-seam` row for work-unit state-path access — a state-class hit, or an `arc-root` hit where a
          placement directory or the user workspace is built without the trailing slash. These rows list their lines,
          since they are the evidence behind the register row's count.
        - The register row's count was taken over state classes only; a count that does not match goes to the
          register's owner as a correction by the Task 1.1.d route.
        - Other state-class hits cite their own register row or take `layout-definition`, `scanner-false-positive`,
          or `independent-evidence`.

    - `[ ]` **5.4.c Dispose the remaining framework-class hits in surviving modules**
        - Each takes a kind and an owner; a row whose hits take different kinds lists the hit lines under each. A hit
          in surviving TypeScript that fits no kind is missed construction and migrates under Task 5.3.
        - Non-TypeScript code — Git hooks, harness hooks, shell and `.mjs` scripts — takes a kind, most often
          `root-only-owner`, unless a carved-module predicate applies. The retired ledger's entries at the merge base,
          read with `git show`, are the precedent: join them to the current scan on class and evidence digest, and
          judge each hit left unmatched under the spec's residual rule.

### `[ ]` **5.5 Reconcile the layout rows both ways** — validate exit criterion at segment scope

- _Goal:_ The segment's exit criterion holds as one batch at the post-merge head.

    - Run the recorded reconciliation after the segment-boundary merge and record its report; confirm every non-code
      surface falls under a predicate.
    - Run the negative control over one per-file row, one carved-module predicate, and one non-code predicate, each
      with no less specific rule to fall back to, and record that it reports exactly their hits beyond the unremoved
      run's report.
    - Confirm the segment's edits to carved code are compile-forced.
    - Evidence for the Success Criteria on the ledger retirement, framework-class dispositions, the code-surface
      reconciliation, and the layout rows' dispositions.

## **Phase 6:** Kernel residual

_Purpose:_ Retire the kernel shims and re-exports and move every local slug, enum, and digest copy onto the kernel and
layout schemas. It runs late because the shim sweep is the widest import edit and conflicts with every base merge.

_Mode:_ `replication` — closes when every kernel shim importer and local schema copy is exhausted and batch-verified.

_Exit criterion:_ The five kernel shim and re-export sites are gone with the test cases that pin them, and the
canonical core's behavior tests run against the kernel beside its other tests; repository-wide searches for the
retired paths across static and dynamic imports, `vi.mock` specifiers, fixtures, and generated outputs come back empty;
the local slug schemas and re-minted enums are replaced; and every remaining local digest pattern in surviving code
holds a fenced-owner matrix row.

### `[ ]` **6.1 Retire the canonical-JSON shim — D3**

- _Goal:_ No file imports `lib/canonical/canonical-json.ts`; every importer takes the kernel's canonical module
  directly, and the shim is gone with the test case that only pins it, while the canonical core keeps every behavior
  test.

    - `[ ]` **6.1.a Record the rewrite recipe and convert `src/`**
        - One search-and-rewrite recipe in notes § Sweep recipes, re-runnable after base merges; carved files take the
          import-line rewrite as a forced edge.

    - `[ ]` **6.1.b Convert `__tests__/`**
        - The recipe also covers `vi.mock` specifiers and dynamic imports; none reach the shim today, and Task 6.5's
          sweep checks both.

    - `[ ]` **6.1.c Delete the shim and move the canonical core's tests beside the kernel's**
        - Remove the "canonical JSON compatibility exports" case; move the rest of
          `unit/canonical/canonical-json.test.ts` to `unit/kernel/canonical-json.test.ts`, importing
          `lib/kernel/canonical/canonical-json.ts`. It holds every behavior test of the kernel's serialization and
          digests, which has no other test file.

### `[ ]` **6.2 Retire the managed-path, slug, `ArcError`, and active-vocabulary re-exports — D3**

- _Goal:_ `lib/canonical/managed-path.ts`, `lib/work-unit/slug.ts`, the `ArcError` and `ArcErrorCode` re-export in
  `lib/errors.ts`, and the vocabulary re-exports in `commands/active/types.ts` are gone with the test cases that only
  pin them, and their importers use the owning modules.

- _Approach:_ An importer re-points to the owning kernel module, or to the kernel index where the file already imports
  it; record the rewrite recipe in notes § Sweep recipes. Carved importers take the rewrite as a forced edge, among
  them `handlers/user.ts`'s `ArcErrorCode` import.

    - `[ ]` **6.2.a Retire `lib/canonical/managed-path.ts` and `lib/work-unit/slug.ts`**
        - Remove the "managed-path compatibility exports" case and move the rest of
          `unit/canonical/managed-path.test.ts` to `unit/kernel/managed-path.test.ts`, importing the kernel module.
          `unit/canonical/` keeps `content-digest.test.ts`, whose subject stays in `lib/canonical/`.
        - Remove "preserves the work-unit import path by identity and type" from `unit/kernel/slug.test.ts`.

    - `[ ]` **6.2.b Retire the `ArcError` re-export and the active-vocabulary re-exports**
        - `lib/errors.ts` itself stays; only its re-export goes. `lib/canonical/content-digest.ts` is not a shim and
          stays.
        - Remove "preserves constructor identity through the presentation module" from `unit/kernel/errors.test.ts` and
          "preserves value and type identity through the command-path shim" from `unit/kernel/vocabulary.test.ts`.
        - `unit/commands/active/types.test.ts` tests `validateState`, `validateClass`, and `validatePriority` through
          the re-export, and once it goes `commands/active/types.ts` exports only types. The file's cases that
          `unit/kernel/vocabulary.test.ts` does not already cover move there, and the file goes.

### `[ ]` **6.3 Replace the local slug schemas and re-minted state and placement-tier enums — D3**

- _Goal:_ The integration and review-readiness schemas validate slugs, work-unit states, and placement tiers through
  the kernel and layout schemas, and review readiness publishes `$ref: slug` with unchanged validation.

- _Note:_ The command-path pattern in `lib/command-input/registry.ts` matches the slug pattern but names a command, not
  a work unit, and stays local.

    - `[ ]` **6.3.a Replace the local `SlugSchema` copies**
        - In `scripts/integration/merge.ts`, `scripts/integration/checkpoint.ts`, and
          `scripts/review-gate/readiness.ts`. The kernel schema brands its output, and before any other change about
          190 test sites in 12 files and 3 production call sites pass plain strings into the branded positions.
        - `evaluateReviewReadiness`, `checkpointIntegration`, and `mergeIntegration` already parse their input, so their
          parameters take the request schema's input type (`z.input`), and callers passing plain strings stay as they
          are. Any other plain value reaching a branded position parses through `SlugSchema`, as Task 7.3's cast rule
          does; no `as` cast brands a slug. The brand also reaches `MergeLockTransitionRequestSchema` through
          `ReviewVehicleSchema`, so the merge-lock code in `scripts/review-gate/merge-lock.ts`, `handlers/review.ts`,
          and `hosts/github/merge-lock.ts` follows the same rule.
        - The readiness request's schema closure in `review-cli-surfaces.e2e.test.ts` gains `slug`.
        - Build `test-first` (one behavior at a time):
            - The review-readiness request schema publishes `$ref: slug`
            - Review readiness still refuses a work-unit value that is not a slug

    - `[ ]` **6.3.b Replace the re-minted state and placement-tier enums in the checkpoint**
        - `position.phase` takes `WorkUnitStateSchema` and `position.location` takes `ArcPlacementTierSchema`; the
          top-level lifecycle `state` enum is the checkpoint's own and stays local.

### `[ ]` **6.4 Adopt `CanonicalDigestSchema` at kernel canonical digest sites — D3, D2**

- _Goal:_ Every value in surviving code that is a kernel canonical digest validates through `CanonicalDigestSchema`,
  and every local `sha256:` pattern left there names its fenced semantic owner in the matrix.

- _Note:_ The schema projects to the same JSON Schema pattern as the inline regexes, so adoption leaves the published
  bundle unchanged. Carved files keep their patterns under their carve rows; adopting there is not a forced edge.

    - `[ ]` **6.4.a Replace the surviving `z.custom<CanonicalDigest>(isCanonicalDigest)` copies**
        - The three local copies follow the matrix split: surviving copies adopt the schema, and a copy in carved code
          keeps its pattern.

    - `[ ]` **6.4.b Adopt the schema at the remaining kernel digest sites**
        - Site by site under the rule that a value adopts it when it is a kernel canonical digest, in batches by
          subsystem; each decision's matrix evidence names the producer that computes the value.
        - Enumerate sites from a search recorded in notes § Sweep recipes covering `sha256:` literals,
          `refine(isCanonicalDigest)`, and raw regex guards such as `lib/delivery/review-fix-record-effects.ts`'s
          digest check. The lifecycle command-input digest options in `handlers/lifecycle.ts` follow the same rule.
        - The schema infers `CanonicalDigest` rather than `string`, and adoption narrows types without adding a runtime
          check. Where a producer derives the value through the canonical core, whose `canonicalDigest` and
          `digestBytes` return `CanonicalDigest`, a handwritten type or return type that widens it to `string` narrows
          back. A value not derived through the canonical core is not a kernel canonical digest and takes a fenced row
          instead; no `as` cast or new `assertCanonicalDigest` call enters production code.
        - A test literal or template literal of the digest form already satisfies the type; any other test value
          parses through the schema. A boolean guard over a kernel digest calls `isCanonicalDigest`.
        - Build `test-first` (one behavior at a time):
            - A malformed digest passed to a lifecycle digest option is refused with the schema's message

    - `[ ]` **6.4.c Record the fenced digest owners**
        - The composite `checkpoint-v1:` handle patterns and review-gate's frozen version-1 identities keep their
          domain owners, each with a matrix row.

### `[ ]` **6.5 Sweep for retired kernel paths** — validate exit criterion at segment scope

- _Goal:_ The segment's exit criterion holds as one batch at the post-merge head.

    - Search the repository for every retired kernel path and symbol across static and dynamic imports, `vi.mock`
      specifiers, fixtures, and generated outputs.
    - Regenerate the schema bundle and confirm the review-readiness request and envelope schemas carry `$ref: slug`
      with no other change beyond Phase 3's roots and envelopes.
    - Re-run the layout reconciliation with its negative control, as notes § Segment boundaries sets out, and refresh
      the layout rows: the shim and re-export rewrites remove `active/` import-specifier hits that Phase 5 rows cover.
    - Confirm the segment's matrix rows carry their dispositions, and that its edits to carved code are compile-forced.
    - Evidence for the Success Criteria on the kernel shims, the local slug and enum copies, the digest schema and
      its fenced owners, and this segment's share of the bundle diff and the retired-path searches.

## **Phase 7:** Test-support conversion

_Purpose:_ Convert surviving tests onto the shared test support, the conversions with a fidelity payoff first and the
in-file scripted doubles last, so the window's first cut removes one trailing parent and nothing else.

_Mode:_ `replication` — closes when every convertible test surface is exhausted and batch-verified.

_Exit criterion:_ Apart from hits a retained-by-rule matrix row covers, no surviving test keeps a hand-built Git-failure
rejection, a local double the design converts (other than any the cut line hands to its named Errand, each listed in the
matrix), a hand-written meta block outside a test of meta parsing or layout, an inline `safeParse(...).success`
assertion, or a value typed by a cast to a registered schema's output.

### `[ ]` **7.1 Move rejecting scripted doubles onto the fake with `GitProcessError` failures — D9**

- _Goal:_ Surviving tests that script Git failures exercise the typed failure the production executor emits — through
  the shared fake, or through the fixture in doubles that stay local.

    - Record the search in notes § Sweep recipes. A hit is a Git double — a function typed `GitExec`, `RawGitExec`, or
      `GitExecInput`, or a `vi.fn` double passed or assigned where one is expected — that rejects, by a throw or
      through `mockRejectedValue` or `mockRejectedValueOnce`, with either a hand-built Git-failure shape — `stderr`,
      `stdout`, `exitCode`, `signal`, a cancel or timeout flag, or a numeric exit `code` — or a plain `Error` whose
      message is Git's failure text. About 31 files carry the shapes, and typed doubles throw the plain errors at
      about 62 sites in 21 files. Filesystem errno errors, application errors built with the same idiom, and a guard
      thrown for an unscripted call are not Git failures and stay.
    - A plain `Error`'s message becomes the fixture's stderr, with exit code 128, Git's status for a fatal error,
      unless the consumer branches on another status Git uses for that condition, such as 1 for a rejected push.
    - A double modeling a failure that is not a process exit, such as Git being unavailable, keeps its plain `Error`,
      which the normalization types as `unexpected` as production does, and stays local rather than moving onto the
      fake. `__tests__/helpers/base-advance.ts`'s fault-injecting hybrids also keep theirs: the module takes no runtime
      import from `src/`, so the spawned test lane can reach it, and `withUnreadableMergeBases` models a non-exit
      failure deliberately. Each takes a retained-by-rule row.
    - Convert by test directory, one batch per review increment. Converted tests keep what they assert; only the
      double, its failure construction, and call assertions, which read the fake's recorder, change.
    - Constant stubs, real-Git doubles, fault-injecting hybrids, and scenario simulators stay local, but any Git
      failure they throw is built by the `GitProcessError` fixture, apart from the non-exit failures above. Tests of
      carved code are not converted.
    - Normalization tests — the executor adapter's and `normalizeGitRejection`'s — keep their raw rejection shapes as
      the input under test. Constructed `GitProcessError` doubles already carry the typed failure and stay, except
      those that hand-set `expectedOutcome`, which move to the fixture.

### `[ ]` **7.2 Convert hand-written meta blocks to the meta fixture builder — D9**

- _Goal:_ Fixture setup in surviving tests builds metas through the builder, while tests of meta parsing or layout keep
  literal Markdown as independent evidence.

    - Record the search in notes § Sweep recipes. It classifies each meta-shaped block, in the table form or the
      `**State:**` field form, as a meta fixture, a test of meta parsing or layout, or a spec's pre-activation
      metadata, which is not a meta.
    - Convert the meta fixtures by test directory; converted tests keep their assertions.
    - A fixture carrying a value outside the meta vocabulary stays literal, retained by rule, since the builder
      cannot produce it. Consumer fixtures in the legacy flat-bullet form convert; tests of the legacy scan keep their
      literals as tests of meta parsing.
    - The search also finds text edits keyed on a flat-bullet field, such as `.replace("- **State:** Active", …)`,
      which stop matching once the fixture renders the table form. A converted fixture sets a field through a builder
      override at construction, or through a meta setter for a mid-test change: `setMetaState` and `setMetaBranch` for
      table fields, `setMetaCurrentWorkflow` and `setMetaBulletFields` for bullet fields. Six such edits sit in
      surviving tests — one in `helpers/session-envelope-compat.ts`, two in `helpers/delivery-position-suite.ts`, and
      three in `e2e/session-init.e2e.test.ts`; the first feeds the session-envelope goldens, whose expectations must
      not change. Edits in tests of carved code, such as `e2e/wu-reconcile.e2e.test.ts` and
      `integration/status-project.test.ts`, stay with their fixtures.
    - Tests that already call `renderMetaFile` directly already derive from the producer and are not targets.

### `[ ]` **7.3 Convert inline schema assertions to the schema-assertion helper — D9**

- _Goal:_ No surviving test asserts `safeParse(...).success`; failures report schema issues through the helper, and
  registered-schema fixtures validate through their schemas.

    - Convert by test directory from a recorded search in notes § Sweep recipes that matches assertions across lines;
      about four in ten span several lines, which a single-line search misses. A computed expectation branches between
      the acceptance and refusal forms.
    - A `safeParse` call that drives test logic rather than asserting a verdict is not an assertion and stays.
    - A test value typed by a cast to a registered schema's output parses through that schema instead, found by a
      search recorded in notes § Sweep recipes. A deliberately invalid value in a refusal test, and a partial value cast
      for a function that reads only some fields, keep their casts, retained by rule.

### `[ ]` **7.4 Convert the remaining in-file scripted doubles to the shared fake — D9**

- _Goal:_ Every remaining in-file scripted double in a surviving test runs on the shared fake.

- _Note:_ This parent is the window's cut line. If a segment boundary shows the window at risk, its unconverted files
  go to a named Errand, the matrix lists each one against it, and nothing else in the plan depends on them.

    - Convert by test directory from a search recorded in notes § Sweep recipes; converted tests keep what they
      assert, with call assertions reading the fake's recorder.

### `[ ]` **7.5 Sweep surviving tests for convertible residue** — validate exit criterion at segment scope

- _Goal:_ The segment's exit criterion holds as one batch at the post-merge head, and the work unit's test-cost effect
  is measured once no further test changes.

    - Run each recorded search over surviving tests; confirm each remaining hit falls under a retained-by-rule matrix
      row whose evidence names the search — tests of meta parsing or layout, errno and application errors,
      normalization tests, constructed typed failures, non-exit failures and the `base-advance.ts` hybrids, constant
      stubs, real-Git doubles, hybrids, simulators, invalid-value and legacy-scan meta fixtures, spec pre-activation
      metadata, logic-driving `safeParse` calls, invalid and partial cast values, files the cut line hands to its
      Errand, or tests of carved code.
    - Run the session-envelope goldens and confirm their expectations match the merge base.
    - Re-run the layout reconciliation with its negative control, as notes § Segment boundaries sets out.
    - Build the CLI, take three retained runs of each tier-isolated row on the axes the baselines used, run
      `benchmark:test-cost:compare` against the baselines in `.test-cost-runs/` that notes § Test-cost baselines
      records, and record the comparison in notes, naming any row that moved. A moved row is attributed by measuring
      the final merge base in a scratch checkout; the `ci-job` rows are read from CI's budget report.
    - Confirm the residual matrix reconciles against all six member scopes and the amended closeout criterion, and
      that the segment's edits to carved code are compile-forced.
    - Evidence for the Success Criteria on Git-failure rejections and convertible doubles, meta blocks, inline schema
      assertions, test cost, and the cohort reconciliation.

## **Phase 8:** Verification

### `[ ]` **8.1 Complete verification** — load and follow `verify-work-unit.md`

---

## Success Criteria

- `[ ]` Every carved item in the residual matrix cites a storage-coupling register row or the correction captured for
  it, every surviving symbol a carved row omits cites the correction captured for it, and every mixed module carries
  its symbol-range split

- `[ ]` Carved code and tests of carved code differ from base only by compile-forced, behavior-preserving edits

- `[ ]` No surviving module imports a `lib/user-sync/` survivor through `lib/user-sync/index.ts`

- `[ ]` `lib/canonical/canonical-json.ts`, `lib/canonical/managed-path.ts`, `lib/work-unit/slug.ts`, the `ArcError`
  re-export in `lib/errors.ts`, and the vocabulary re-exports in `commands/active/types.ts` are gone with their
  shim-pinning test cases, and the canonical core's behavior tests run against the kernel in `unit/kernel/`

- `[ ]` The local `SlugSchema` copies and the re-minted state and placement-tier enums are replaced by the kernel and
  layout schemas

- `[ ]` `CanonicalDigestSchema` is exported unregistered from `kernel/schema/vocabulary.ts` in the `z.templateLiteral`
  form with an explicit message, composed from constants the canonical core also derives `isCanonicalDigest` from

- `[ ]` No `z.custom<CanonicalDigest>` copy remains in surviving code, and every remaining local `sha256:` pattern
  there holds a fenced-owner matrix row

- `[ ]` The five validation-surface re-export sites, the `commands/config.ts` relay, and the cross-WU entry re-exports
  in `lib/user-sync/index.ts` are gone, and their importers use the owning modules

- `[ ]` The nine surviving routed types, the two snapshot types, and `ReleaseRoutingValue` have full schemas that are
  their types' `z.infer` authority, with the handwritten declarations gone

- `[ ]` The ten roots are registered at version 1 `strict-current`, each with a unit test over representative producer
  output

- `[ ]` The four checkpoint drift wraps use the full `BaseDriftResult` schema

- `[ ]` The regenerated schema bundle's diff is confined to the ten new roots, the session-init and session-recover
  envelopes, and the review-readiness `$ref: slug`, and the session-envelope goldens pass without expectation changes

- `[ ]` The layout migration ledger, its schema module, `assert-layout-migration.ts`, the `audit:layout-migration`
  script, their tests, the entrypoint-test entry, and the manifest exclusion are gone

- `[ ]` No framework-class code hit in a surviving module lacks a disposition kind, and none that fits no kind remains

- `[ ]` The final code-surface reconciliation over the 15 layout classes reports no hit without a row or predicate, no
  overlap the precedence does not settle, no row or predicate without a hit, and no row whose hit count moved; every
  non-code surface falls under a recorded predicate, and its negative control reports exactly the removed hits beyond
  the unremoved run's report

- `[ ]` Every matrix row carries one of the four dispositions with its citation

- `[ ]` `RawGitExec` and `RawGitResult` are declared in `lib/git/exec.ts` and imported type-only by `change-facts.ts`,
  and `classify-change.sh` still runs

- `[ ]` The spawn factory is `createSpawnRawGitExec`, and `createRawGitExec` names only the execa adapter

- `[ ]` The failure-text predicates live in `lib/git/ref-tree.ts` and `resolveGitCommonDir` in `lib/git/exec.ts`, with
  no importer reaching either through `lib/user-sync/`, and errand identity classifies through `gitFailureText()`

- `[ ]` The 17 always-JSON adapters, the 4 value-bearing commands, and `release opt-in` and `opt-out` are wrapped,
  carved handlers' command surfaces included; the always-JSON handlers and `log standalone` build their executors from
  the context they receive, and the 3 missing declarations exist

- `[ ]` The shared helpers in `handlers/shared.ts` require an executor, and their carved callers pass `createGitExec()`

- `[ ]` No surviving context-bearing command path spawns Git through an unbound executor, exported helpers' callers
  included: `gitExec`'s remaining surviving importers are the standalone scripts and the five fallback holders their
  callers override, `gitExecInput`'s remaining surviving use is the unbound fallback `createGitExecInput` returns,
  and the only surviving executors built without a subprocess policy are the module-level ones in `lib/io-context.ts`
  and `local-test-admission.ts`'s

- `[ ]` The scripted fake with every designed capability, the `GitProcessError` fixture, the meta builder, and the
  schema-assertion helper exist under `__tests__/helpers/` with their own tests

- `[ ]` Apart from hits a retained-by-rule matrix row covers, no surviving test keeps a hand-built Git-failure
  rejection or a convertible local double, other than doubles the cut line hands to a named Errand, each listed in the
  matrix

- `[ ]` `makeGitExecInput` builds on `createExecaGitExecInput`, and `stubGitExec` is local to `active.test.ts`

- `[ ]` Apart from hits a retained-by-rule matrix row covers, every hand-written meta block left in a surviving test
  belongs to a test of meta parsing or layout, and no surviving test keeps an inline `safeParse(...).success` assertion
  or types a value by a cast to a registered schema's output

- `[ ]` The `testing-standards` project override names the shared fake, fixture, builder, and helper, and the doubles
  that stay local

- `[ ]` Every affected test-cost baseline, `lane` included, predates the first new test file, and the final comparison
  is recorded

- `[ ]` The cohort closeout criterion carries the storage-carve exclusion, and the residual matrix reconciles against
  all six member scopes and the amended criterion

- `[ ]` Repository-wide searches for every retired symbol and path across static and dynamic imports, `vi.mock`
  specifiers, fixtures, and generated outputs come back empty

- `[ ]` All quality gates pass (Markdown lint, ARC contract checks, `typecheck:all`, TypeScript lint, the full test
  suite with E2E and portability in required CI, and the build)

- `[ ]` Ready for integration
