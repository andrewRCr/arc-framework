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

### `[x]` **4.4 Thread bound executors through the remaining unbound Git spawns — D8**

- _Goal:_ No surviving context-bearing command path spawns Git through an unbound executor — the `gitExec` singleton or
  one built without a subprocess policy — exported helpers' callers included; the singletons remain only for standalone
  scripts, as fallbacks that bound callers override, and in carved code.

- **Additional Context:** `notes-cli-substrate-complete-migration.md` § `gitExec` singleton importers

    - `[x]` **4.4.a Thread the CLI-reachable singleton importers**
        - Replaced live singleton use in `init`, `join`, and `view` with invocation-bound executors. Release opt-in and
          opt-out now have empty-policy interaction adapters and bind Git to their contexts; the inventory test covers
          both wraps. Earlier tasks bound review, log, and shared helpers. The five fallback holders remain for their
          bound callers to override; the locus body remains carved.

    - `[x]` **4.4.b Thread `config status` and the `release commit` module executors**
        - Config status now passes the adapter context into its session-init settings read. Release commit binds one
          executor for identity, hooks, settings, branch, repository preflight, snapshot, retry store, and head reads;
          its module-level executor is gone. The filesystem-only message-file reader ships as a member of the bound
          retry store, which both release commit and delivery correction construct from their invocation executors.
          Snapshot and retry location tests fail against reconstructed unbound behavior; delivery's snapshot boundary
          test likewise fails when it uses an unbound executor. Release commit E2E passed.

    - `[x]` **4.4.c Bind `GitExecInput` in the `active in-flight` adapter**
        - Added `createGitExecInput` beside the captured-output factory. It returns the existing singleton without
          an interaction, otherwise creates an executor with that subprocess policy. `createUserIOContext` and the
          active in-flight adapter now use the factory; carved `writeGitNote` retains its singleton. Both factory
          tests failed before the implementation and pass with the new binding.

    - `[x]` **4.4.d Record the remaining unbound executors**
        - Added individual matrix rows for all ten standalone scripts, five overridden fallback holders, the
          standalone test-runner default, and the three module-level executor bases. The layout assertion script's
          row points to its Task 5.1 deletion. Marked `prepareGitRefVerification` and locus as storage-carved under
          their register rows.

- _Outcome:_ All surviving context-bearing command paths audited in this task bind Git execution to their invocation
  context. The retained unbound sites and carved paths have explicit matrix dispositions.

### `[x]` **4.5 Move the Git failure-text predicates and `resolveGitCommonDir` into `lib/git/` — D7, D1**

- _Goal:_ The three failure-text predicates live in `lib/git/ref-tree.ts` and `resolveGitCommonDir` in
  `lib/git/exec.ts`, and no importer reaches either through `lib/user-sync/`, so the notes deletion pass strands
  nothing.

- _Note:_ `git-decompose-v3-operation-io.ts` defines its own `resolveGitCommonDirectory`, and
  `pre-publication-delivery-targets.ts` receives `resolveGitCommonDir` as an injected dependency; neither imports it.

    - `[x]` **4.5.a Move `isCasRejectionError`, `isRemoteUnavailableError`, and `isNonFastForwardError`**
        - Moved the three predicates unchanged to `lib/git/ref-tree.ts` and removed the user-sync barrel exports.
          Errand and carved notes callers now import the owner directly; unit and real-Git CAS tests follow it.
          The repeatable named-import recipe is in notes § Sweep recipes.

    - `[x]` **4.5.b Move `resolveGitCommonDir` beside `isGitRepo`**
        - Moved the unchanged resolver to `lib/git/exec.ts` and re-pointed all nine surviving importers in delivery,
          review, local test admission, and the worktree lock. The notes-specific shared path helper stays in
          user-sync and imports the new owner; notes § Sweep recipes records the repeatable rewrite.

- _Outcome:_ Both Git plumbing utilities now have lower-tier owners, and no surviving importer reaches them through
  user-sync. The carved notes callers compile through their forced new imports.

### `[x]` **4.6 Classify errand identity failures through `gitFailureText()` and rename the spawn factory — D7**

- _Goal:_ Errand identity code reads Git failures through `gitFailureText()`, so its retry-or-stop decision rests on
  Git's complete stderr rather than a bounded message, and the `createRawGitExec` name belongs only to the execa
  adapter.

    - `[x]` **4.6.a Replace the `.message` classification in errand identity code**
        - Both the write CAS and push remote-unavailable branches now classify `gitFailureText(error)` while preserving
          the existing message in returned errors. Four transaction-level tests cover long stderr, stdout-only text,
          and unrelated failure; the three distinguishing cases failed before the change.

    - `[x]` **4.6.b Rename the `change-facts.ts` spawn factory to `createSpawnRawGitExec`**
        - Renamed the export, its own invocation, and four integration-test imports; the object-availability alias is
          gone. The execa adapter keeps `createRawGitExec`. The spawn factory remains independent of io-context and
          execa; `classify-change.sh tree-hash HEAD` passed under plain Node.

- _Outcome:_ Errand identity classifies complete Git stderr for retry and stop decisions, and the raw spawn factory
  has a name distinct from the execa adapter without changing its standalone boundary.

### `[x]` **4.7 Verify every command path binds its executor** — validate exit criterion at segment scope

- _Goal:_ The segment's exit criterion holds as one batch at the post-merge head.

- _Outcome:_ Merged the two newer base commits at `82e2a5312` and reran all three inventory scans. A named-import
  audit found ten standalone and five overridden fallback `gitExec` importers, plus carved locus; no external
  `gitExecInput` importer remains. The reach audit, wrapper and declaration checks, and utility-home searches are
  recorded in notes § Phase 4 executor reach audit. The matrix covers all retained and carved executors.

- _Verification:_ The post-merge build, Markdown, ARC, TypeScript, shell, and both typechecks passed; the full lane
  passed 911 test files and 13,159 tests. `classify-change.sh tree-hash HEAD` and the Phase 4 diff whitespace check
  passed. The segment's adapter, helper, raw-spawn, and errand behavior tests passed within that lane.

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

### `[x]` **5.1 Retire the layout migration ledger — D6**

- _Goal:_ Nothing in the tree carries, checks, or excludes the layout migration ledger.

    - Deleted the ledger, its parser and assertion script, their unit and integration tests, and the root
      `audit:layout-migration` script.
    - Removed the one-shot script expectation and manifest exclusion. The tracked reference sweep found no
      surviving executable or package/CI dependency; design and archival references remain as records.
    - Closed the script's `gitExec` matrix row with the deletion and adjusted the standalone-script count.

### `[x]` **5.2 Record the code-surface reconciliation and the non-code predicates — D6, D10**

- _Goal:_ One recorded command reconciles the matrix's layout rows and predicates against the coupling-audit class scan
  in both directions and is shown to report what it should, and every non-code surface falls under a recorded
  class-level predicate.

- **Additional Context:** `notes-cli-substrate-complete-migration.md` § Layout reconciliation — the 15 class IDs, the
  framework and state split, and the tables the script reads

    - `[x]` **5.2.a Write the one-off reconciliation script**
        - Recorded the complete one-off script and extraction command in notes § Layout reconciliation. It scans the
          15 declared classes through the four coupling-audit library calls and reads the three matrix tables.
        - It assigns hits under the specified rule matches and longest-prefix precedence, and reports uncovered
          code and non-code hits, unresolved overlaps, unused rules, and per-file count drift. Lines remain evidence;
          assigned hit counts enforce the recorded `Hits` values.
        - The initial run covered 18,427 hits and exposed 1,125 code hits for Task 5.3/5.4. The script is outside
          the tracked tree; its source and current report location are recorded in the notes.

    - `[x]` **5.2.b Record the non-code and carved-module predicates**
        - Five class-level non-code predicates cover every test, template, prose, workflow, and config hit. Thirty
          exact-path carved predicates cite their storage register owners. The layout contract names the two routed
          items and the `provisional-placement` owners outside the reconciliation tables.
        - The complete three-rule negative control exposed exactly 139 removed-rule hits and no other hit; the
          restored report has no uncovered hit, overlap, unused rule, or count mismatch.

- _Outcome:_ The recorded one-off command reconciles the complete selected corpus in both directions; its negative
  control proves that each rule type contributes coverage. Results and commands are in notes § Layout reconciliation.

### `[x]` **5.3 Move framework-path construction onto the resolver — D6**

- _Goal:_ Surviving TypeScript builds every framework path a resolver token covers through the resolver, and every
  owner of an `.arc/system` descendant the resolver does not select composes its own suffix onto the resolved
  `arc-root` — except where it builds a work-unit state path, which is carved and takes its row under Task 5.4.b.

- _Approach:_ Token-covered construction migrates: the `.arc` root through `arc-root`, the method and workflow roots
  through `procedure-root`, and template outputs through `resolveTemplateOutputPath`. The layout contract exports no
  generic join, so an owner of another descendant resolves `arc-root` and composes its suffix, as
  `config/status-reader.ts` does with `ARC_CONFIG_SUFFIX`. A composed suffix no longer matches the `arc-root` class;
  any hit that remains, such as an ignore pattern or a doc comment, takes a kind under Task 5.4.

- _Note:_ Record each batch's rewrite recipe in notes § Sweep recipes so it re-runs after base merges.

    - `[x]` **5.3.a Compose the `.arc/system/.internal/` framework bookkeeping onto `arc-root`**
        - Converted the worktree marker, hook-manager and native Git hook paths, and Markdown manifest read to the
          resolved `arc-root` plus `INTERNAL_DIR_SEGMENTS` and their owner suffixes. Manifest and pristine paths in
          init, join, update, reconfigure, diff, and health already followed that construction.
        - Recorded the repeatable search and rewrite in notes § Sweep recipes. Candidate, submission-boundary, and
          transition records remain carved to `R-CR`; declarative patterns and text await Task 5.4 dispositions.

    - `[x]` **5.3.b Migrate the `.arc` root, procedure roots, and template outputs**
        - Converted installed method and workflow paths to `procedure-root`, extension, load-set, and project-inbox
          descendants to `arc-root` plus owner suffixes, and ARC-root discovery to the resolver. The template-output
          seam already uses `resolveTemplateOutputPath`; remaining template literals are source names and
          classification policy.
        - Recorded the rerunnable search and rewrite in notes § Sweep recipes. State-path construction remains
          carved for Task 5.4.b and residual framework literals take Task 5.4.c dispositions.

    - `[x]` **5.3.c Migrate or dispose the install and file-classification hits**
        - Disposed 111 counted hits in 18 per-file rows. Install diagnostics are independent evidence; Git ignore,
          source-template, and file-classification literals are semantic policy; `templateFile` and
          `z.templateLiteral` matches are scanner false positives. The planning-lane split cites `R-CI`.
        - Reconciliation assigns all 111 with no overlap or count drift. The remaining code queue belongs to the
          state-path and framework residual passes in Task 5.4.

### `[x]` **5.4 Dispose the remaining code-surface layout hits — D6, D10**

- _Goal:_ Every remaining layout-class code hit has a row — carved modules by predicate, mixed modules along their
  split, and surviving modules per file and class with a disposition kind and an owner — and the work-unit state-path
  residual is complete and file-exact.

- **Additional Context:** `notes-cli-substrate-complete-migration.md` § Work-unit state-path recount

    - `[x]` 5.4.a Dispose the mixed modules along their symbol-range splits
        - Per-file rows separate surviving import syntax, source evidence, path classification, and carved branch,
          placement, archive, and lifecycle symbols by exact line and register owner.

    - `[x]` **5.4.b Dispose the work-unit state-path hits and the other state-class hits in surviving modules**
        - Recorded exact state-path hit lines under `R-SP` and other storage rows, including `arc-root` path builds.
          The historical recount's five `from-branch.ts` basename lines belong to `R-LC`; a correction to the
          register's historical count and file set is routed to `storage-seam` through `USER-INBOX`.

    - `[x]` **5.4.c Dispose the remaining framework-class hits in surviving modules**
        - Assigned all remaining framework hits to per-file kinds or carved predicates. Non-TypeScript hooks and
          scripts retain their own root discovery; framework diagnostics and source text remain independent evidence.

- _Outcome:_ The complete 15-class reconciliation assigns 1,089 code hits and 17,301 non-code hits, with zero
  uncovered hits, overlaps, unused rules, or count drift; notes § Layout reconciliation records the report.

### `[x]` **5.5 Reconcile the layout rows both ways** — validate exit criterion at segment scope

- _Goal:_ The segment's exit criterion holds as one batch at the post-merge head.

- _Outcome:_ The fresh base checkpoint was clean with no incoming commit. At `caa5dba84`, all three inventory scans
  and the layout reconciliation reran: all 18,390 hits are assigned, with no unmatched hit, overlap, unused rule, or
  count drift. The three-rule negative control exposed exactly 139 removed-rule hits. Mixed-module code edits derive
  framework paths without changing carved storage behavior. The complete local gate and build passed; notes § Phase 5
  segment verifier records the evidence.

## **Phase 6:** Kernel residual

_Purpose:_ Retire the kernel shims and re-exports and move every local slug, enum, and digest copy onto the kernel and
layout schemas. It runs late because the shim sweep is the widest import edit and conflicts with every base merge.

_Mode:_ `replication` — closes when every kernel shim importer and local schema copy is exhausted and batch-verified.

_Exit criterion:_ The five kernel shim and re-export sites are gone with the test cases that pin them, and the
canonical core's behavior tests run against the kernel beside its other tests; repository-wide searches for the
retired paths across static and dynamic imports, `vi.mock` specifiers, fixtures, and generated outputs come back empty;
the local slug schemas and re-minted enums are replaced; and every remaining local digest pattern in surviving code
holds a fenced-owner matrix row.

### `[x]` **6.1 Retire the canonical-JSON shim — D3**

- _Goal:_ No file imports `lib/canonical/canonical-json.ts`; every importer takes the kernel's canonical module
  directly, and the shim is gone with the test case that only pins it, while the canonical core keeps every behavior
  test.

    - `[x]` **6.1.a Record the rewrite recipe and convert `src/`**
        - Recorded an exact resolved-specifier rewrite in notes § Sweep recipes and redirected source importers to the
          kernel owner. Carved files changed only their import lines.

    - `[x]` **6.1.b Convert `__tests__/`**
        - Redirected test and fixture importers with the same recipe. Its second run changed zero specifiers, including
          dynamic import and mock strings.

    - `[x]` **6.1.c Delete the shim and move the canonical core's tests beside the kernel's**
        - Deleted the compatibility-only module and its export-identity test; moved all canonical serialization and
          digest behavior tests to `unit/kernel/canonical-json.test.ts`, importing the kernel owner directly.

- _Outcome:_ The 125 resolved old-path specifiers now import the kernel owner, with no behavior change. The moved
  behavior suite and both typechecks pass; notes § Canonical JSON shim records the rerunnable recipe.

### `[x]` **6.2 Retire the managed-path, slug, `ArcError`, and active-vocabulary re-exports — D3**

- _Goal:_ `lib/canonical/managed-path.ts`, `lib/work-unit/slug.ts`, the `ArcError` and `ArcErrorCode` re-export in
  `lib/errors.ts`, and the vocabulary re-exports in `commands/active/types.ts` are gone with the test cases that only
  pin them, and their importers use the owning modules.

    - `[x]` **6.2.a Retire `lib/canonical/managed-path.ts` and `lib/work-unit/slug.ts`**
        - Redirected 37 resolved specifiers to the kernel owners and deleted both compatibility modules. Moved the
          managed-path behavior suite beside the kernel and removed only the two old-path identity cases.

    - `[x]` **6.2.b Retire the `ArcError` re-export and the active-vocabulary re-exports**
        - Split 19 named imports by owner, then removed both presentation re-exports and their identity cases.
          `lib/errors.ts` retains user-facing errors; `commands/active/types.ts` exports only its own types. Moved
          active-validator cases missing from the kernel suite into `unit/kernel/vocabulary.test.ts`.

- _Outcome:_ Both file shims and both named re-export sites are gone. The recorded recipes re-run without changes,
  and the preserved kernel and presentation behavior suites pass.

### `[x]` **6.3 Replace the local slug schemas and re-minted state and placement-tier enums — D3**

- _Goal:_ The integration and review-readiness schemas validate slugs, work-unit states, and placement tiers through
  the kernel and layout schemas, and review readiness publishes `$ref: slug` with unchanged validation.

    - `[x]` **6.3.a Replace the local `SlugSchema` copies**
        - Replaced the three local schemas with the kernel owner. Entry functions that parse their request, including
          merge-lock transitions, accept schema input; other branded fixture values parse through their schemas.
          The readiness public schema now includes `slug`, and invalid work-unit identities still refuse.
        - The published-schema test failed before adoption; the existing refusal was shown to fail against a narrow
          permissive reconstruction and pass after restoration. Notes § Local slug schemas records the recipe.

    - `[x]` **6.3.b Replace the re-minted state and placement-tier enums in the checkpoint**
        - `position.phase` now composes `WorkUnitStateSchema`, and `position.location` composes
          `ArcPlacementTierSchema`. The checkpoint's top-level lifecycle `state` stays local.

- _Outcome:_ Request and lifecycle schemas now use the kernel and layout authorities. The published readiness
  request references `slug`; notes § Local slug schemas records the red-green evidence and rerunnable search.

### `[x]` **6.4 Adopt `CanonicalDigestSchema` at kernel canonical digest sites — D3, D2**

- _Goal:_ Every value in surviving code that is a kernel canonical digest validates through `CanonicalDigestSchema`,
  and every local `sha256:` pattern left there names its fenced semantic owner in the matrix.

- _Note:_ The schema projects to the same JSON Schema pattern as the inline regexes, so adoption leaves the published
  bundle unchanged. Carved files keep their patterns under their carve rows; adopting there is not a forced edge.

    - `[x]` **6.4.a Replace the surviving `z.custom<CanonicalDigest>(isCanonicalDigest)` copies**
        - `decompose-v3-schema.ts` and `decompose-v3-result-report.ts` now compose the kernel schema. The
          `decompose-v3-plan.ts` copy stays with its carved base-tree plan under `R-DCP`; the matrix records the split.

    - `[x]` **6.4.b Adopt the schema at the remaining kernel digest sites**
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

    - `[x]` **6.4.c Record the fenced digest owners**
        - The composite `checkpoint-v1:` handle patterns and review-gate's frozen version-1 identities keep their
          domain owners, each with a matrix row.

- _Outcome:_ The malformed lifecycle option failed first on the inline-regex message and passed on the kernel
  message. Candidate, integration, review-gate, and delivery digest batches are verified. Notes § Canonical digest
  sites records producer edges and the fenced rows.

### `[x]` **6.5 Sweep for retired kernel paths** — validate exit criterion at segment scope

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

- _Outcome:_ The post-merge path and export scan is clean in source, tests, fixtures, mocks, and generated output.
  The bundle diff contains only the Phase 3 roots and envelope references plus nine readiness slug references.
  Layout reconciliation and its negative control pass after removing empty shim-import rows. A full routine test
  run exposed one direct layout schema import in the checkpoint; routing it through the public barrel resolved the
  boundary test, and the repeated lane passed. Notes § Canonical digest sites, § Schema bundle diff, and
  § Segment boundaries record the evidence.

## **Phase 7:** Test-support conversion

_Purpose:_ Convert surviving tests onto the shared test support, the conversions with a fidelity payoff first and the
in-file scripted doubles last, so the window's first cut removes one trailing parent and nothing else.

_Mode:_ `replication` — closes when every convertible test surface is exhausted and batch-verified.

_Exit criterion:_ Apart from hits a retained-by-rule matrix row covers, no surviving test keeps a hand-built Git-failure
rejection, a local double the design converts (other than any the cut line hands to its named Errand, each listed in the
matrix), a hand-written meta block outside a test of meta parsing or layout, an inline `safeParse(...).success`
assertion, or a value typed by a cast to a registered schema's output.

### `[x]` **7.1 Move rejecting scripted doubles onto the fake with `GitProcessError` failures — D9**

- _Goal:_ Surviving tests that script Git failures exercise the typed failure the production executor emits — through
  the shared fake, or through the fixture in doubles that stay local.

    - _Amended in:_ 7.R2 (A2)

- _Outcome:_ Modeled Git process exits in surviving test doubles use the shared typed failure fixture. The post-merge
  rejection scan finds no eligible residue; carved, non-exit, normalization, application, and guard cases remain local.

### `[x]` **7.2 Convert hand-written meta blocks to the meta fixture builder — D9**

- _Goal:_ Fixture setup in surviving tests builds metas through the builder, while tests of meta parsing or layout keep
  literal Markdown as independent evidence.

    - _Amended in:_ 7.R (A1)

    - _Amended in:_ 7.R2 (A2)

- _Outcome:_ Valid META fixtures in surviving suites use the builder. The legacy envelope projection derives from
  validated fields and preserves all 11 goldens; the post-merge block scan finds no valid convertible residue.

### `[x]` **7.3 Convert inline schema assertions to the schema-assertion helper — D9**

- _Goal:_ No surviving test asserts `safeParse(...).success`; failures report schema issues through the helper, and
  registered-schema fixtures validate through their schemas.

    - _Amended in:_ 7.R2 (A2)

- _Outcome:_ Surviving schema verdicts use diagnostic helpers, and valid registered output fixtures parse through their
  schemas. The post-correction AST scan leaves only carved assertions; remaining casts are partial, invalid, or parsed
  before narrowing.

### `[x]` **7.4 Convert the remaining in-file scripted doubles to the shared fake — D9**

- _Goal:_ Every remaining in-file scripted double in a surviving test runs on the shared fake.

    - _Amended in:_ 7.R2 (A2)

- _Outcome:_ Converted deterministic in-file scripts in surviving test files to the shared Git fakes and recorder.
  The remaining doubles are constant stubs, real-Git runners, hybrids, stateful simulators, or carved tests; no Errand
  cut was needed.

### `[x]` **7.R Restore Candidate identity in a converted meta fixture — D9**

- _Goal:_ The delivery-position fixture carries its attested Candidate identity after the canonical meta renderer runs.

- _Outcome:_ The fixture applies `setMetaCandidate` to the rendered meta, including when the renderer omits an unset
  Candidate field. Both review-fix scenarios now recover their delivery-correction context.

### `[x]` **7.R2 Restore storage-carved test boundaries — D9**

- _Goal:_ Tests of storage-owned code retain their baseline behavior; mixed suites convert only surviving ranges.

- _Outcome:_ Restored Phase 7-only edits in 42 carved test files and the carved ranges of two mixed suites. The
  surviving `view --path` cases merged from `main` remain intact.

### `[ ]` **7.R3 Bind verification evidence to its producing boundary**

- _Goal:_ Under A3, local gates and final affected test-cost comparisons bind the corrected verification subject,
  while required public CI and all six `ci-job` reports have an explicit owner and exact publication trigger before
  integration authorization; original criteria remain unchanged.

    - `[ ]` **7.R3.a Record final local test-cost comparisons against the corrected inputs**
        - Retain original baselines; measure every affected row after the final test conversion with matching axes.

    - `[ ]` **7.R3.b Record local gates and the required public evidence continuation**
        - Close local checks at the corrected subject; name andrew, the exact authorized publication head, and all
          required CI and budget reports. Leave unavailable public evidence pending.

### `[ ]` **7.R4 Reconcile the two accepted storage-register corrections**

- _Goal:_ Under A4, the decomposition and continuity carve traces to the two accepted `891c911c` rows;
  mixed-module survivors are explicit, and carved tests retain their original representations beyond forced edges.

    - `[ ]` **7.R4.a Record the exact row provenance and symbol splits**
        - Name both accepted rows, retain the historical cutoff for all others, and record S6's owning-symbol splits.

    - `[ ]` **7.R4.b Restore the carved handoff test representation and verify the boundary**
        - Restore its exact base representation and verify affected tests, types, and the complete carve diff.

### `[x]` **7.5 Sweep surviving tests for convertible residue** — validate exit criterion at segment scope

- _Goal:_ The segment's exit criterion holds as one batch at the post-merge head, and the work unit's test-cost effect
  is measured once no further test changes.

    - _Amended in:_ 7.R3 (A3)

    - _Amended in:_ 7.R4 (A4)

- _Outcome:_ The final sweep reconciles surviving test support, all six member scopes, and the storage carve; no
  convertible residue remains. Session-envelope goldens match the merge base, and the layout reconciliation and
  negative control close. Notes § Phase 7 test-cost comparison records four local rows; only integration wall time
  moved beyond noise, attributable to this branch. The six `ci-job` rows await required CI.

## **Phase 8:** Verification

### `[ ]` **8.1 Complete verification** — load and follow `verify-work-unit.md`

---

## Success Criteria

- `[ ]` Every carved item in the residual matrix cites a storage-coupling register row or the correction captured for
  it, every surviving symbol a carved row omits cites the correction captured for it, and every mixed module carries
  its symbol-range split

- `[ ]` Carved code and tests of carved code differ from base only by compile-forced, behavior-preserving edits

- `[x]` No surviving module imports a `lib/user-sync/` survivor through `lib/user-sync/index.ts`

- `[x]` `lib/canonical/canonical-json.ts`, `lib/canonical/managed-path.ts`, `lib/work-unit/slug.ts`, the `ArcError`
  re-export in `lib/errors.ts`, and the vocabulary re-exports in `commands/active/types.ts` are gone with their
  shim-pinning test cases, and the canonical core's behavior tests run against the kernel in `unit/kernel/`

- `[x]` The local `SlugSchema` copies and the re-minted state and placement-tier enums are replaced by the kernel and
  layout schemas

- `[x]` `CanonicalDigestSchema` is exported unregistered from `kernel/schema/vocabulary.ts` in the `z.templateLiteral`
  form with an explicit message, composed from constants the canonical core also derives `isCanonicalDigest` from

- `[x]` No `z.custom<CanonicalDigest>` copy remains in surviving code, and every remaining local `sha256:` pattern
  there holds a fenced-owner matrix row

- `[x]` The five validation-surface re-export sites, the `commands/config.ts` relay, and the cross-WU entry re-exports
  in `lib/user-sync/index.ts` are gone, and their importers use the owning modules

- `[x]` The nine surviving routed types, the two snapshot types, and `ReleaseRoutingValue` have full schemas that are
  their types' `z.infer` authority, with the handwritten declarations gone

- `[x]` The ten roots are registered at version 1 `strict-current`, each with a unit test over representative producer
  output
    - _Deviation:_ Producer coverage runs in the unit lane for seven roots and the integration lane for config,
      extensions, and domain-rules. Those three tests exercise their actual filesystem/parser command producers and
      strict refusals; the owner accepted this placement during Task 8.1 verification.

- `[x]` The four checkpoint drift wraps use the full `BaseDriftResult` schema

- `[x]` The regenerated schema bundle's diff is confined to the ten new roots, the session-init and session-recover
  envelopes, and the review-readiness `$ref: slug`, and the session-envelope goldens pass without expectation changes

- `[x]` The layout migration ledger, its schema module, `assert-layout-migration.ts`, the `audit:layout-migration`
  script, their tests, the entrypoint-test entry, and the manifest exclusion are gone

- `[x]` No framework-class code hit in a surviving module lacks a disposition kind, and none that fits no kind remains

- `[x]` The final code-surface reconciliation over the 15 layout classes reports no hit without a row or predicate, no
  overlap the precedence does not settle, no row or predicate without a hit, and no row whose hit count moved; every
  non-code surface falls under a recorded predicate, and its negative control reports exactly the removed hits beyond
  the unremoved run's report

- `[x]` Every matrix row carries one of the four dispositions with its citation

- `[x]` `RawGitExec` and `RawGitResult` are declared in `lib/git/exec.ts` and imported type-only by `change-facts.ts`,
  and `classify-change.sh` still runs

- `[x]` The spawn factory is `createSpawnRawGitExec`, and `createRawGitExec` names only the execa adapter

- `[x]` The failure-text predicates live in `lib/git/ref-tree.ts` and `resolveGitCommonDir` in `lib/git/exec.ts`, with
  no importer reaching either through `lib/user-sync/`, and errand identity classifies through `gitFailureText()`

- `[x]` The 17 always-JSON adapters, the 4 value-bearing commands, and `release opt-in` and `opt-out` are wrapped,
  carved handlers' command surfaces included; the always-JSON handlers and `log standalone` build their executors from
  the context they receive, and the 3 missing declarations exist

- `[x]` The shared helpers in `handlers/shared.ts` require an executor, and their carved callers pass `createGitExec()`

- `[x]` No surviving context-bearing command path spawns Git through an unbound executor, exported helpers' callers
  included: `gitExec`'s remaining surviving importers are the standalone scripts and the five fallback holders their
  callers override, `gitExecInput`'s remaining surviving use is the unbound fallback `createGitExecInput` returns,
  and the only surviving executors built without a subprocess policy are the module-level ones in `lib/io-context.ts`
  and `local-test-admission.ts`'s

- `[x]` The scripted fake with every designed capability, the `GitProcessError` fixture, the meta builder, and the
  schema-assertion helper exist under `__tests__/helpers/` with their own tests

- `[ ]` Apart from hits a retained-by-rule matrix row covers, no surviving test keeps a hand-built Git-failure
  rejection or a convertible local double, other than doubles the cut line hands to a named Errand, each listed in the
  matrix

- `[x]` `makeGitExecInput` builds on `createExecaGitExecInput`, and `stubGitExec` is local to `active.test.ts`

- `[ ]` Apart from hits a retained-by-rule matrix row covers, every hand-written meta block left in a surviving test
  belongs to a test of meta parsing or layout, and no surviving test keeps an inline `safeParse(...).success` assertion
  or types a value by a cast to a registered schema's output

- `[x]` The `testing-standards` project override names the shared fake, fixture, builder, and helper, and the doubles
  that stay local

- `[ ]` Every affected test-cost baseline, `lane` included, predates the first new test file, and the final comparison
  is recorded

- `[ ]` The cohort closeout criterion carries the storage-carve exclusion, and the residual matrix reconciles against
  all six member scopes and the amended criterion

- `[x]` Repository-wide searches for every retired symbol and path across static and dynamic imports, `vi.mock`
  specifiers, fixtures, and generated outputs come back empty

- `[ ]` All quality gates pass (Markdown lint, ARC contract checks, `typecheck:all`, TypeScript lint, the full test
  suite with E2E and portability in required CI, and the build)

- `[ ]` Ready for integration

- `[ ]` Every project-designated local quality gate passes against the final verified inputs
    - _A3:_ Required public CI, including E2E and Linux portability, remains mandatory before integration
      authorization; local E2E still runs wherever changed-path rules require it.

- `[ ]` Implementation verification is complete and ready for Candidate preparation, with required public CI
  and all six `ci-job` cost reports retained against the exact published head before integration authorization

- `[ ]` The two storage-register corrections adopted by A4 are bound to their exact `891c911c` rows, with
  decomposition and continuity subjects named and all mixed-module survivor ranges preserved
