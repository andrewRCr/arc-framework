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

### `[x]` **1.3 Add `CanonicalDigestSchema` over exported digest constants — D2**

- _Goal:_ One digest definition serves both the kernel's type guard and a shared schema that infers `CanonicalDigest`,
  projects the JSON Schema pattern the inline regexes emit today, and refuses with a message naming the expected form.

- _Outcome:_ The canonical core exports the digest prefix and hex pattern and derives both digest construction and
  the guard from them without importing Zod. `CanonicalDigestSchema` composes those constants as an unregistered
  template literal and is exported through the kernel index. Kernel tests cover inference, refusals, JSON Schema
  projection, guard agreement, and the core's Zod-free import boundary.

### `[x]` **1.4 Declare `RawGitExec` and `RawGitResult` in the executor contract — D2, D7**

- _Goal:_ The executor contract declares `RawGitExec` and `RawGitResult` beside `GitExec`, every user imports them
  from there, and `classify-change.sh` still runs `change-facts.ts` under plain `node`.

    - `[x]` **1.4.a Move the declarations into `lib/git/exec.ts`**
        - Moved both shapes unchanged beside `GitExec`; `change-facts.ts` imports both type-only and uses
          `RawGitResult` to type its byte-preserving Promise.

    - `[x]` **1.4.b Re-point every importer**
        - Re-pointed 44 type imports, splitting the one mixed value/type declaration in `from-branch.ts`; no type
          import remains on `change-facts.ts`. The re-runnable recipe is in notes § Sweep recipes.

    - `[x]` **1.4.c Confirm the CI entry point still runs**
        - The `classify-change.test.ts` integration suite exercised the plain-Node entry point, and
          `bash scripts/classify-change.sh tree-hash HEAD` returned the code-tree hash.

## **Phase 2:** Shared test support

_Purpose:_ Land the shared test doubles, fixtures, and assertion helper with tests of their own before any conversion
uses them, move the reusable raw test executor onto the execa adapter, and point future test authors at all of it.

_Exit criterion:_ The scripted `GitExec` fake with every capability the design names, the `GitProcessError` fixture,
the meta fixture builder, and the schema-assertion helper exist under `__tests__/helpers/` with passing tests of their
own; `makeGitExecInput` builds on `createExecaGitExecInput`; and the `testing-standards` project override names the
shared support and the doubles that stay local.

### `[x]` **2.1 Add the `GitProcessError` fixture and the scripted `GitExec` fake — D9**

- _Goal:_ Tests script `GitExec`, `GitExecInput`, and `RawGitExec` through one fake that matches arguments explicitly,
  sequences and computes responses, records calls, rejects with the typed `GitProcessError` the production executor
  emits, and throws on any call nobody scripted.

    - `[x]` **2.1.a Add the `GitProcessError` fixture**
        - `makeGitProcessError` feeds process-like failure evidence, including byte stdout, through
          `normalizeGitRejection`; seven tests cover classification and preserved diagnostics.

    - `[x]` **2.1.b Add the scripted `GitExec` fake**
        - `scriptGitExec` shares an ordered matcher and repeating response sequence, supports computed and typed
          failure responses, and records every call. Nine tests cover matching, sequencing, recording, and refusal.

    - `[x]` **2.1.c Add the `GitExecInput` and `RawGitExec` variants**
        - The stdin and byte variants share the matcher and failure behavior while recording their distinct inputs;
          four tests cover both contracts and unmatched calls.

### `[x]` **2.2 Add the meta fixture builder — D9**

- _Goal:_ Fixture setup builds meta files through the production renderer, so a meta fixture cannot drift from the
  shape `renderMetaFile` emits.

- _Outcome:_ `makeMetaFixture` supplies valid `state` and `owner` defaults, forwards per-field overrides to
  `renderMetaFile`, and returns canonical Markdown. Tests round-trip the default and an override through the strict
  record, then verify the renderer rejects an invalid semantic value.

### `[x]` **2.3 Add the schema-assertion helper — D9**

- _Goal:_ A failing schema assertion in a test reports what went wrong — the schema's issues when a value should
  pass, the parsed output when it should refuse — rather than `expected false to be true`.

- _Outcome:_ `assertSchemaAccepts` returns parsed output or throws with every issue path and message;
  `assertSchemaRefuses` accepts an optional issue path and shows parsed output on unexpected success. Six tests
  cover both forms, including a registered kernel schema.

### `[x]` **2.4 Move `makeGitExecInput` onto the execa adapter and localize `stubGitExec` — D9**

- _Goal:_ The shared raw test executor rejects with the typed failures production emits, and `integration.ts` no longer
  carries a constant stub that serves one test file.

    - `[x]` **2.4.a Build `makeGitExecInput` on `createExecaGitExecInput`**
        - Replaced the ad hoc spawn wrapper with the production adapter, preserving bound cwd as the default and
          forwarding caller options. A new integration test proves cwd override and typed local-only failures;
          all 22 directly and indirectly affected integration suites passed.

    - `[x]` **2.4.b Move `stubGitExec` into `__tests__/integration/active.test.ts`**
        - Moved the unchanged constant-response stub to its only consumer; the active integration suite passed.

    - `[x]` **2.4.c Record the raw test executor rows**
        - Updated the test-support matrix with execution evidence. The carved notes helpers stay with their notes
          subject; `base-advance.ts` retains its arrangement runner without runtime `src/` imports, and the
          `e2e/race-worker.ts` executors remain real-Git plumbing for the spawned worker.

### `[x]` **2.5 Name the shared test support in the `testing-standards` project override — D9**

- _Goal:_ A test author who loads `testing-standards` learns to script `GitExec` through the shared fake with
  `GitProcessError` failures, build meta fixtures with the builder, and assert schemas through the helper — and which
  doubles stay local.

- _Outcome:_ The project override names the Git fake and typed failure fixture, meta builder, and schema assertion
  helper, with the four categories of local doubles. The shipped-content register records why no package sync applies.

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

### `[x]` **3.1 Retire the validation-surface re-exports and route `lib/user-sync/` survivors — D4, D1**

- _Goal:_ Every importer of a validation surface, and every surviving importer of a `lib/user-sync/` survivor this
  segment routes, reaches it through its owning module; the old-path and cross-WU entry re-exports are gone, and
  barrel exports only carved importers still use stay for the notes deletion pass.

    - `[x]` **3.1.a Retire the five old-path re-export sites**
        - Re-pointed 31 named import declarations to their schema owners, removed the five old-path re-exports and
          two relays, and corrected `release/types.ts`'s header. The search-and-rewrite recipe is in notes § Sweep
          recipes; dynamic imports and mocks still target owned functions.

    - `[x]` **3.1.b Retire the cross-WU entry re-exports in `lib/user-sync/index.ts`**
        - Removed the parser/schema re-export blocks and routed three imports to their owners. Inbox state and
          reminders use direct parser and schema imports; the carved merge test took only its forced import rewrite.

    - `[x]` **3.1.c Route the remaining survivors through their owning modules**
        - Routed six source/test imports of inbox writing and execution offers directly, along with inbox mutation's
          advisory lock and notes-lock imports; removed the writer/offer barrel export blocks. Carved notes-sync
          callers retain their barrel routes, including `resolveCurrentWuName`; notes § Sweep recipes records the
          static, dynamic, and mock search.

### `[x]` **3.2 Complete the leaf session-init slot schemas — D5**

- _Goal:_ Seven leaf roots have full strict schemas that are their types' `z.infer` authority, are registered at
  version 1 `strict-current`, and parse the output their producers return — so a key a producer emits that its root
  does not declare fails a unit test before it fails session-init.

    - `[x]` **3.2.a Complete `DirtyStateResult` and `CurrentHuskAdvisory`**
        - Registered both strict roots and composed them into their envelope slots. Producer tests cover clean and
          dirty states plus every decoded husk stamp arm; both evidence arms validate canonical digests. Root and
          envelope tests name undeclared fields, and the thin view cases retired.

    - `[x]` **3.2.b Complete the extensions, active, and domain-rules session-init results**
        - Registered all three strict roots and composed them into their envelope slots. Real producer tests cover
          active resolution and warning states, extension warnings, domain-rule enumeration and warnings; the
          exported derived-active projection is tested for `none` and `single`. The active schema remains beside its
          type with a type-only producer import, preserving lazy integration-boundary loading.

    - `[x]` **3.2.c Complete `ConfigSessionInitResult`**
        - Registered the strict root, composed it into both envelope slots, and derived its settings/result types.
          Ten settings read their catalog enum values without the empty arm; release interlocks use the exported
          release schemas. Producer tests cover defaults, overrides, pass-through misconfiguration, and strict
          refusals; the envelope now names invalid setting keys without the former config type-proof exemption.

    - `[x]` **3.2.d Complete `ReleaseRoutingValue`**
        - Registered the strict routing root and composed it into both envelopes. Producer tests cover all opt-in and
          interlock combinations, including safe-default unknown values; malformed and undeclared rationale fields
          refuse with their key named.

- _Outcome:_ All seven leaf types now derive from registered version-1 strict roots, and both envelopes compose the
  owning schemas in place of the retired thin views. Producer and slot tests cover emitted states and unknown fields.

### `[x]` **3.3 Complete the worktree schemas and the worktree snapshot root — D5**

- _Goal:_ `WorktreeSyncStatusResult` and `WorktreeRosterResult` have full schemas as their types' authority, and the
  worktree slot in both envelopes composes a registered strict snapshot root whose refusals name the offending key.

- _Outcome:_ Both worktree result types derive from strict schemas. Registered snapshot and roster roots are
  composed into their envelope slots; producer and slot tests cover emitted states, degraded roster entries,
  and undeclared-key refusals.

    - `[x]` **3.3.a Complete `WorktreeSyncStatusResult` and the worktree snapshot root**
        - Registered the strict `worktree-sync` snapshot root and derived the status, snapshot, identity, and
          supersession types from their schemas. Both envelopes compose strict worktree slots; session-init retains
          its state, evidence, count, branch, supersession, and recommendation refinements. Producer tests cover every
          worktree state and supersession evidence arm, including the handler's neutral not-needed result.

    - `[x]` **3.3.b Complete `WorktreeRosterResult`**
        - Registered the strict `worktree-roster` root, derived its result and entry types, and composed the
          session-init roster slot. Producer tests parse empty, resolved, degraded, and warning-bearing results;
          root and envelope tests reject undeclared keys by name.

### `[x]` **3.4 Complete `BaseDriftResult`, the base-distance snapshot root, and the checkpoint wraps — D5, D2**

- _Goal:_ `BaseDriftResult`'s full schema is its type's authority and validates the drift inside the integration
  checkpoint's emitted result without refusing any drift a reading produces, and the base-distance slot composes a
  registered strict snapshot root no wider than today's type.

- _Outcome:_ Drift and base-distance types derive from strict schemas, the snapshot root is registered in the
  session-init slot, and the checkpoint validates every emitted drift arm. Producer and refusal tests cover
  evidence states and named malformed fields.

    - `[x]` **3.4.a Complete `BaseDriftResult`**
        - Added an unregistered strict component schema for drift verdicts and nested integration, overlap,
          coordinate, continuation, and register evidence. Result types derive from the schemas; authoritative
          producer tests parse healthy and degraded readings and reject undeclared keys. The session-init skipped
          producer arm is exercised with the not-applicable builder in Task 3.4.b.

    - `[x]` **3.4.b Register the base-distance snapshot root**
        - Registered strict `base-distance` snapshot and not-applicable arms and derived both result types from
          their schemas. A named builder supplies the three not-applicable handler states. Producer tests cover
          exact, pending, unreachable, and all fallback readings; the strict session-init slot keeps its
          recommendation refinements and names undeclared keys. The builder preserves the wire's original key order.

    - `[x]` **3.4.c Validate the checkpoint drift against the full schema**
        - Replaced all four custom drift wraps with the strict component schema. Checkpoint arm tests exercise
          unavailable, unsafe, unrelated, and reconcile results. Malformed drift now yields a typed operation
          refusal naming the field and carrying the checkpoint rerun command. Sync test mocks retain the newly
          imported worktree schema fields.

### `[x]` **3.5 Verify the envelope schema bundle and goldens** — validate exit criterion at segment scope

- _Goal:_ The segment's exit criterion holds as one batch at the post-merge head.

- _Outcome:_ Merged current `main`, reran all three inventories and the retired-path sweeps, and refreshed the
  segment's matrix counts. The sorted bundle diff adds exactly ten roots and changes only the two envelopes;
  compatibility goldens remain unchanged and validation latency meets all benchmark limits. Evidence and the
  reproducible bundle projection are in notes § Schema bundle diff.

## **Phase 4:** Command inputs and Git residual

_Purpose:_ Bring every surviving command surface under the command-input regime, thread a bound executor through every
context-bearing Git spawn, and finish the executor residual that the notes deletion pass would otherwise strand.

_Mode:_ `replication` — closes when every command surface and unbound executor use is exhausted and batch-verified.

_Exit criterion:_ The always-JSON and value-bearing adapters are wrapped, the handlers that reach Git build their
executors from the context the wrap hands them, and the missing declarations exist; no surviving context-bearing command
path spawns Git through an unbound executor; the failure-text predicates and `resolveGitCommonDir` live under
`lib/git/` with no importer reaching them through `lib/user-sync/`; errand identity classifies failures through
`gitFailureText()`; and `classify-change.sh` still runs.

### `[x]` **4.1 Wrap and bind the always-JSON commands and add the missing machine-mode declarations — D8**

- _Goal:_ Every always-JSON command runs in machine mode and spawns Git under that mode's subprocess policy, and
  `attest`, `publish`, and `locus` declare theirs, so none of them can stop on a terminal prompt.

    - `[x]` **4.1.a Extend the scanner, and wrap and bind merge lock resolve, hold, and release**
        - Scanner distinguishes constant machine policies from predicates; all three merge-lock routes use the adapter
          and invocation-bound Git executor. Readiness and both delivery release paths use the supplied executor.

    - `[x]` **4.1.b Wrap and bind the six review resolve-family commands**
        - Review resolve, merge-method resolve, checks await, readiness, frontline resolve, and changeset resolve
          now route under constant machine mode. The four Git-using handlers bind their executors to that context;
          merge-method and checks await retain the host runner's closed stdin behavior.

    - `[x]` **4.1.c Wrap and bind hosted request, await, and settle**
        - Hosted request, await, and settle now route through constant machine mode. Their stores, nested request
          derivation and replay checks, and settlement lock use the command-bound Git executor.

    - `[x]` **4.1.d Wrap and bind local prepare, attest, and resume, and review respond and reduce**
        - All five adapters now declare constant machine mode; each handler defaults to that mode and constructs
          its review dependency executor from the invocation's subprocess policy.

    - `[x]` **4.1.e Add the three missing machine-mode declarations**
        - `attest`, `publish`, and `locus` declare JSON machine mode; `locus` also routes through the interaction
          adapter while its storage-carved derivation remains in its existing handler.

- _Outcome:_ The inventory now recognizes constant machine policies and pins all 17 always-JSON adapters to them;
  every surviving review and merge-lock Git path binds its executor to the invocation's subprocess policy.

### `[x]` **4.2 Wrap the value-bearing human-output commands — D8**

- _Goal:_ `user close`, `config validate`, `release setup print-patterns`, and `log standalone` run under the
  command-input adapter and inherit its non-interactive behavior, and `log standalone` spawns Git under the context it
  receives.

- _Outcome:_ All four adapters receive interaction context; `log standalone` requires it and builds its Git executor
  from the invocation's subprocess policy. The three other handler bodies retain their existing behavior.

### `[x]` **4.3 Require an executor in the shared handler helpers — D8, D1**

- _Goal:_ `resolveUserIdentity`, `resolveIdentityWithPrompt`, and `requireGitRepo` require an executor, so no caller
  reaches Git through the unbound singleton by default.

    - `[x]` 4.3.a Made the executor required in all three `handlers/shared.ts` Git helpers.

    - `[x]` **4.3.b Thread the invocation's executor from every surviving caller**
        - Bound the caller's executor across Errand, lifecycle, start, init, join, release push and commit, active,
          and the two surviving user inbox commands.

    - `[x]` **4.3.c Pass `createGitExec()` at the carved call sites**
        - Carved user and notes commands construct the old unbound executor explicitly, preserving their behavior
          while removing the shared helpers' implicit singleton fallback.

- _Outcome:_ All three helpers now require a Git executor, and a boundary test proves supplied executors control
  identity and repository checks; no surviving caller relies on the implicit singleton.

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
