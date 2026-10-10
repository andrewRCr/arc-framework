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

### `[x]` **1.1 Measure the per-increment check baseline — SC17**

- _Goal:_ SC17's "before" figure exists, with its sample and method, before any change alters what a task runs.

    - `[x]` **1.1.a Fix the sample and the method**
        - Fixed 20 replayable non-merge commits at `159fdcdeba`, retaining each complete original path set; excluded
          absent paths by implementation-entry direction. The clone, neutral edit rule, warm-up, and command selection
          are recorded in `notes-quality-gate-hooks.md` § Fixed replay sample and method.

    - `[x]` **1.1.b Record the baseline**
        - Recorded all 20 repaired-tip sample totals and actual command timings in `notes-quality-gate-hooks.md`, with
          the preserved replay sample, measured tip, excluded first attempt, and concurrent-load caveat. The baseline
          totals 2,650.467 seconds across the selected commands and ordinary commit hooks.

### `[x]` **1.2 Typed-file read in the configuration layer — D2, D12**

- _Goal:_ A caller asks the configuration layer for a structured project file by its identity and gets back a typed
  value with the file's resolved location, an absent result, or a refusal naming the failing field, without knowing
  where the file lives.

- _Outcome:_ `readTypedProjectFile` resolves file identities through the layout, preserves YAML and JSON values, and
  returns the repository-relative location with valid, absent, or invalid results. Parse failures retain their location;
  schema failures name field paths, and read failures are distinct from absence.

### `[x]` **1.3 Check declaration type, refinements, and registration — D2**

- _Goal:_ The CLI accepts exactly the declaration shape the design defines and refuses every other shape with the
  field named, under one registered type.

    - `[x]` **1.3.a Field model and defaults**
        - Added the strict declaration field model, conservative per-check defaults, gate and fix-policy enumerators,
          and the top-level editor reference. Commands, runtime inputs, and shard configuration retain typed values;
          unknown fields refuse at every object level.

    - `[x]` **1.3.b Id rule**
        - Check ids enforce the lowercase-leading grammar and preserve declared names, including punctuation and
          `constructor`. Invalid names report their field; the typed-file reader refuses duplicate YAML and JSON
          keys before validation.

    - `[x]` **1.3.c Cross-field refinements**
        - Runtime refinements reject shell commands in files mode, argument lists used with a shell, strings used
          without a shell, and shard arguments without `{index}`. Each refusal names its field; valid project shell
          commands and indexed shards remain accepted.

    - `[x]` **1.3.d Register `check-declaration`**
        - Registered the shared runtime schema as version 1, strict-current, authored editor-document; production
          discovery, structural projection, and checkout provisioning expose its generated editor schema.

- _Outcome:_ The typed-file reader and production registry use one declaration schema. The segment scenario accepted
  a valid declaration and refused unknown fields, malformed ids, and all four cross-field violations with fields named.

## **Phase 2:** Increment-boundary run reused at the commit hook

_Purpose:_ Proves the headline claim, one run per tree across fire sites, on the thinnest path through the verb before
the full request contract builds on it: an increment-boundary run and the commit hook over the same content compute the
same key.

_Mode:_ `slice` — closes on an increment-boundary run that the commit hook reuses.

_Exit criterion:_ In a fixture repository declaring one `project` check and one `files` check at `gate: commit`,
`arc check increment` runs both; a following commit with nothing else changed, through ARC's shipped pre-commit hook
under `core.hooksPath`, reports both `reused`; and the same request with `--force` executes both.

### `[x]` **2.1 `arc check increment` runs the declared checks over the staged worktree — D3, D4, D5**

- _Goal:_ An increment-boundary request runs the commit gate's checks that its change reaches, over the content the next
  commit will carry, and exits by their outcomes; with no declaration, it reports `none declared` and exits 0.

    - `[x]` **2.1.a Staged-worktree tree and its change**
        - Added temporary-index snapshots seeded from Git's resolved index, preserving the real index and worktree
          and cleaning up on failure. Raw NUL diffs retain complete blob identities and deletions, treat renames as
          deletion/addition pairs, and distinguish an empty change from a failed Git call.

    - `[x]` **2.1.b Input matching through Git pathspecs**
        - Added Git glob and exclude matching with full tree-entry identities, whole-tree defaults, and explicit
          unselected results when no input changed. Matching removes all four ambient pathspec variables through a
          per-call executor control, preserving the caller's environment and deletion-only selection.

    - `[x]` **2.1.c Minimal runner and the `increment` request**
        - Added the lazy increment command, typed input and interaction registrations, help summary, orchestration,
          and human/JSON output. Reached commit checks run without a shell; files checks receive existing changed
          inputs, and absent or invalid declarations retain distinct outcomes and successful repair routes.

- _Outcome:_ The built CLI composes declaration reading, temporary-index snapshots, Git matching, and command
  execution; a failed check exits 1 while other selected checks still run, and deletion-only files checks are unselected.

### `[x]` **2.2 A passing run is recorded under its content key — D5, D12**

- _Goal:_ A pass is written once, keyed by the content it checked, so a later request over the same content in the
  same worktree replays it, and a fault in the record never becomes a pass or a refusal.

    - `[x]` **2.2.a Record placement**
        - `checkRecordDirectory` resolves `arc-checks/` directly inside each worktree's own Git directory. Real linked
          worktrees have separate directories and cannot read passes published in the primary checkout.

    - `[x]` **2.2.b Base key and write-once entries**
        - Added a stable digest of check id, resolved declaration, input paths/modes/blobs, and received paths, plus a
          strict pass-only store using `atomicCreateFile`. Concurrent publication keeps one complete entry; mismatched
          or corrupt records and read/write faults provide no hit and do not refuse execution.

    - `[x]` **2.2.c Replay**
        - Connected the increment runner to the private pass store. Repeat requests replay `reused` with the stored
          summary; `--force` executes and records a pass. Failures, disabled caching, changed input content, and storage
          faults execute again without granting a hit.

- _Outcome:_ The built CLI reuses only complete matching pass entries from its own checkout; keys include all declared
  input content, so a change outside the previously changed paths still invalidates reuse.

### `[x]` **2.3 The commit hook reuses the increment-boundary run — D3, D5, D8**

- _Goal:_ A commit carrying exactly what `arc check increment` just checked reports every selected check `reused` (a
  fixer whose inputs a later fixer rewrote runs again, D7), because the hook's checked tree, the index, yields the same
  key.

    - `[x]` **2.3.a `arc check pre-commit` over the index**
        - Added the lazy, registered pre-commit request and shared commit-check orchestration. The adapter resolves
          inherited index paths against the repository root and passes the exact index to Git; staged content reuses
          increment passes, while unseen changes execute, including real `-a` and path-limited commit indexes.

    - `[x]` **2.3.b Shipped pre-commit dispatch**
        - Added the separate declared-commit-gate block after structural checks. It resolves the local CLI before the
          global CLI, propagates check failure, and refuses with installation guidance only when the declaration is
          present. Disabled hooks dispatch nothing; the hook and README mirrors match, and structural fixtures use a
          restricted CLI search path.

### `[x]` **2.4 Increment-boundary run reused at commit** — validate exit criterion at segment scope

- _Goal:_ The segment's exit criterion holds on a real fixture repository through the built CLI and ARC's shipped
  hook, recorded as the scenario run and its result.

- _Outcome:_ The real fixture ran its project and files checks on both the initial and forced increment requests;
  the files check received `data.txt`. A following commit through the shipped hook under `core.hooksPath` reported
  both reused and left the execution receipts unchanged. The scenario result is `/tmp/arc-quality-segment2-result.json`.

## **Phase 3:** Request contract: forms, scopes, selection, and base

_Purpose:_ Completes what a request selects and over which content: every form, scope, and preset; selection and
widening; the base and merged-in parents exported to `files` checks; and the complete reuse key.

_Mode:_ `layer` through Phase 4 — closes on the verb's complete request and execution contract.

### `[x]` **3.1 Request forms, scopes, and base-branch resolution — D3, D4**

- _Goal:_ Every request form resolves to one typed request (its gates, scope, change, base, and checked tree), or to a
  refusal naming the input it could not resolve, before anything runs.

    - `[x]` **3.1.a Forms and flags**
        - Registered `gate`, `run`, `segment`, and `new-head` beside the existing forms, with command-owned schemas,
          inventory policies, common execution/output flags, and explicit non-hook CI options. Unknown ids name a safe
          retry; malformed commands exit 2, while help exits 0. Dry runs forecast without executing checks.

    - `[x]` **3.1.b Scopes and defaults**
        - Added mutually exclusive staged, changed, range, all, and named-path scopes through one typed request.
          Staged requests retain Git's index tree; other scopes snapshot the worktree. Gate and by-id defaults select
          the declared scope, and file checks receive the corresponding existing path set.

    - `[x]` **3.1.c Base-branch and named-ref resolution**
        - Read `branch.base` through configuration, resolve its own upstream outside push or the pushed remote's base
          before local fallback, and require a sole merge base through `resolveSoleMergeBase`. Explicit unresolved refs
          refuse with a retry remedy; automatic unavailable, unrelated, and ambiguous bases remain absent.

### `[x]` **3.2 Selection, widening, and `files` path sets — D4**

- _Goal:_ A gate or preset request selects exactly the checks its change reaches, widens to every widening check
  whenever reach cannot be decided, and gives each `files` check exactly the paths it must check.

- _Outcome:_ `selection.ts` reads Git input reach across the complete declaration and widens for global inputs,
  declaration edits, uncovered changes, and unavailable bases. Named-path scopes retain Git glob matching and deletion
  reach. Widening opt-outs retain only their own changes; widened file checks receive all matching existing paths.
  CI-only exclusions name their reason, named runs ignore gates and shared widening, and ignored paths remain absent.

### `[x]` **3.3 Base export and merged-in parents — D2**

- _Goal:_ A `files` check can read what each path held before the change, and tell content a merge brought in from
  content authored over it, through the base, checked tree, and merged-in parents the verb exports.

- _Outcome:_ File checks receive `ARC_CHECK_BASE`, `ARC_CHECK_TREE`, and the non-first parents from an uncapped
  first-parent range ending at the captured commit tip. Nested side-history merges contribute no parent; all scope
  exports none. Unresolved bases omit base and parent fields while retaining the checked tree. Project checks receive
  none of these fields, and ambient check context is cleared before execution. Failed history reads name a retry.

### `[x]` **3.4 Presets, deadline gates, and kind — D1, D3**

- _Goal:_ Each preset runs the composition its fire site needs, and every result is labelled enforcement or feedback
  from its request's deadline gate, never from interlock or approval configuration.

- _Outcome:_ `gates.ts` composes cumulative membership and the increment's additional push file checks. Every result
  derives enforcement or feedback from the request's deadline in both human and JSON output; named requests have no
  deadline, while segment and new-head requests enforce the push gate. Interlock settings do not enter this resolution,
  and a failing feedback check retains exit 1.

### `[x]` **3.5 Complete reuse key — D5**

- _Goal:_ A reuse key changes whenever anything the declaration says a result depends on changes, and a key that
  cannot be completed is never recorded.

- _Outcome:_ `key-resolver.ts` includes global content, global and rooted per-check runtime output, and received
  files' base and merged-parent content, including absence. Relevant content permits reuse across unrelated tree or
  commit movement. Resolved entries remain independent; matching declaration bytes remain ordinary inputs. Disabled
  caching and unavailable runtime or tree reads produce no record. Selection takes the declaration path from its reader.

## **Phase 4:** Execution contract: runs, fixes, outcomes, and reports

_Purpose:_ Completes how a selected check runs and what the verb reports about it, so every non-hook request form meets
its contract before hooks and workflow steps depend on it.

_Exit criterion:_ Unit and integration tests hold the verb's complete non-hook contract: selection and widening, gate
membership and kind, every outcome and exit status, each verb refusal with its retry, fixers outside the commit hook,
ranges' merged-in parents, forced runs, record faults and placement, and the checks' Git environment.

### `[x]` **4.1 Command execution — D2, D3, D5**

- _Goal:_ A selected check runs as its declaration says (in its root, with its paths batched and its environment
  clean), and fixers finish before anything else reads their files.

    - `[x]` **4.1.a Commands, shell, and root**
        - Argument-list commands preserve literal paths; declared shell strings use the platform shell. Checks run
          from their root with root-relative file arguments. A command that never starts reports `couldn't run` with
          exit 2; started shell failures report `failed` with exit 1. A repaired declaration retries successfully.

    - `[x]` **4.1.b Git environment**
        - The shared adapter removes all repository-local Git variables. A real nested fixture creates and commits
          under every non-hook form and through the shipped hook during plain commits, `git commit -a`, and linked
          worktree commits; its receipt confirms the committed content and clean environment.

    - `[x]` **4.1.c Batching, ordering, and parallelism**
        - `batching.ts` sizes literal file arguments by platform encoding and Windows command escaping, preserves
          portable root-relative paths, and names a safe retry when a single argument cannot fit. Every batch runs,
          and a failed batch remains failed. Fixers run serially in declaration order before the machine-bounded
          pool; `--serial` uses one worker. Every selected outcome is retained, and sharded checks run unsharded.

### `[x]` **4.2 Index view and worktree divergence — D5**

- _Goal:_ A check that reads the Git index sees exactly the content the event will carry, and a run that could have
  read anything else is labelled and never reused.

    - `[x]` **4.2.a Index view**
        - Declared index readers receive an absolute event index. Worktree requests retain and refresh their snapshot
          index with cached stat data; staged requests share a lazy private tree index. Nested roots and later fixer
          turns read the checked content, owner indexes remain intact, and disposable views are removed or ignored.

    - `[x]` **4.2.b Worktree divergence**
        - Differing worktree inputs are labelled in JSON and human reports and bypass pass lookup and recording.
          The comparison uses Git input pathspecs and staged-worktree snapshots, preserving reuse for excluded,
          ignored, and unrelated files. Unavailable or malformed comparisons refuse with a successful retry path.

### `[x]` **4.3 Fixers outside the commit hook — D7**

- _Goal:_ Fix-capable checks rewrite files only where content is still forming, and anywhere else a rewrite is a
  failure, so reviewed content is committed content and no verification run silently edits the tree.

- _Outcome:_ Fixers use their turn snapshots, retain the initial selection and paths, and omit deleted files. Allowed
  rewrites stay in the worktree; verification rewrites fail without recording a pass. Each pass keys immediately on
  produced content, so later fixers cannot extend its coverage. Unchanged content refreshes private-index stat data
  without recomputing the tree, and copied index timestamps keep equal-size edits visible through Git's cached metadata.

### `[x]` **4.4 Outcomes, exit codes, and refusals — D3**

- _Goal:_ Every check ends in exactly one named outcome and every request exits 0, 1, or 2 by rule, so a caller acts on
  the status alone.

- _Outcome:_ `declaredChecksExitCode` consumes the complete named-outcome model, giving unavailable execution precedence
  over failures regardless of kind. Native parse guards preserve exit 2 while help and version retain exit 0; repairing
  the named declaration field resumes execution. Skipped checks and empty gates remain distinct from passed checks.

### `[x]` **4.5 Report, verification line, and remedies — D3, D12**

- _Goal:_ A reader gets one terse report that leads with failures, names a remedy for each that discards no work, and
  carries a precomposed verification line, and nothing CI-facing speaks ARC vocabulary.

- _Outcome:_ Reports lead with failures, retain distinct full logs and measured costs in the checkout's disposable
  record directory, and compose verification from named outcomes. Retries preserve scope and resolved range bases;
  widened file checks retry the original request or guarded commit. Failed fixers expose rewrite presence, and CI
  human text uses project check vocabulary.

### `[x]` **4.6 JSON envelope and dry run — D3, D9**

- _Goal:_ A caller can foresee a long gate, and CI can derive its jobs from one machine-readable listing that matches
  what the verb would run.

- _Outcome:_ Dry runs retain every gate member and its last measured cost, forecast unchanged content, and resolve
  relative working directories, literal batches, capabilities, and shard invocations for CI. Range listings retain
  the checked tree, base, and merged-parent coordinates. Native parser failures use usage envelopes with successful
  repair paths; portable record filenames preserve declaration IDs.

## **Phase 5:** Hook dispatch under every hook manager

_Purpose:_ Takes the commit and push gates to every supported hook-manager integration, with the commit hook's merge,
partial-staging, skip, and fix behavior and the push hook's ref scoping.

_Mode:_ `slice` — closes on both gates dispatching once per event under every supported integration.

_Exit criterion:_ Under husky, lefthook, pre-commit.com, and `core.hooksPath`, a commit (a deletion-only one included)
and a push each dispatch their gate once; the push gate skips `refs/arc/*` and deletions, reports other refs
`not selected`, and names the gated ref on failure; `restage` and `fail` behave per integration; and a merge
conclusion selects only conflicted and parent-unmatched paths.

### `[x]` **5.1 A commit dispatches the commit gate once under every hook manager — D8**

- _Goal:_ Under husky, lefthook, pre-commit.com, and `core.hooksPath`, every commit runs ARC's pre-commit hook exactly
  once, a deletion-only commit included.

    - `[x]` **5.1.a Provision the hook managers for the E2E tier**
        - Pinned Lefthook 2.2.1 with its postinstall disabled; E2E setup provides verified executables and prepares
          pre-commit 4.4.0 in a locked, interpreter-keyed cached virtual environment, repairing incomplete installs
        - Provisioning refusals name the tool and remedy; synthetic runtime fixtures inject the tool process boundary
          and copy setup dependencies, keeping Python out of the routine lane
        - Installing the explicit Lefthook pin used an approved one-command release-age exception; npm's user setting
          remains unchanged

    - `[x]` **5.1.b pre-commit.com's commit entries and hook types**
        - Generated commit entries run once even without filenames; commit-message entries receive the message file
        - Installation types include all three ARC events and preserve existing types and unrelated configuration;
          `init` and `join` report `pre-commit install` when the list changes, with no repeated notice when unchanged

    - `[x]` **5.1.c One dispatch per commit**
        - Native `init` fixtures install husky through `prepare`, lefthook through `install`, pre-commit.com through plain
          `install`, and ARC's directory through `core.hooksPath`; commits verify one uncached check execution across
          24 changed files, deletion-only commits, message refusal/repair, and disabled hooks

### `[x]` **5.2 A merge conclusion gates only what the merge produced — D8**

- _Goal:_ Concluding a merge runs the commit gate over its conflicted paths and resolution edits, never over the whole
  merged-in change.

- _Outcome:_ Checkout-private merge metadata supplies recorded conflicts and active parents; the exact staged tree's
  combined diff adds resolution edits. Both own-input selection and widening use that path set, retaining one-sided
  resolutions and excluding clean incoming content. Native linked-worktree checks prove private metadata lookup;
  malformed or missing active metadata refuses with repair/retry guidance and resumes after repair.

### `[x]` **5.3 Partially staged inputs refuse, and a person may skip named checks — D8**

- _Goal:_ The commit gate never certifies bytes the commit will not carry, and a person can step around named checks
  for one commit through a channel no agent run reaches.

    - `[x]` **5.3.a Partially staged refusal**
        - Selected checks refuse staged paths with unstaged edits before execution, naming both whole-file staging
          and named-skip remedies. Native commits verify retry and preservation of unrelated work; manager stash
          windows remain compatible, with pre-commit.com's fixture patch cache inside its disposable Git directory.

    - `[x]` **5.3.b `ARC_SKIP`**
        - Only hook requests consume named skips, before reuse or execution, without recording passes. Unknown
          names are reported through own declaration membership; ordinary requests ignore the environment channel,
          and structural commit validation remains active.

### `[x]` **5.4 Commit-hook fixes restage or fail — D7, D8**

- _Goal:_ A fixer's rewrites at the commit hook either land in the commit or fail it, as the declaration says, never
  committing unfixed content silently and never losing a person's set-aside changes.

- _Outcome:_ Hook fixers observe rewrites immediately and restage only the original commit's paths into its exact
  index or `index.lock`, before pass recording and subsequent checks. Outside rewrites stay unstaged and divergent
  passes remain unrecorded. Declaration `fail`, native `PRE_COMMIT`, detected lefthook, and temporary indexes leave
  rewrites for staging and retry without a pass; failed restaging blocks with repair guidance. Native conflicting-edit
  scenarios verify both manager rollbacks preserve set-aside and unrelated work and permit repaired commits.

### `[x]` **5.5 A push gates the checked-out branch's pushed range — D8, D12**

- _Goal:_ `arc check pre-push` gates exactly the checked-out branch's pushed content, skips what it cannot or must not
  check, and names the ref it gated when it fails.

- _Outcome:_ `pre-push` captures Git stdin or native manager metadata and gates the checkout branch at its pushed tip.
  State refs and deletions are skipped, foreign refs report no worktree, and failures name the gated code ref.
  Remote-old and new-ref ranges share selection and reuse with `segment`; unavailable automatic bases widen.
  Divergent passes stay unrecorded, push rewrites retain the checked tip, and widened retries name `git push`.
  Full symbolic refs and ASCII protocol separators preserve tag-shadowed and Unicode branch names.

### `[x]` **5.6 The shipped pre-push hook dispatches the push gate — D8, D12**

- _Goal:_ A failing push gate blocks the push under every hook manager, while the force-push advisory stays advisory and
  leaves state refs alone.

    - `[x]` **5.6.a Shipped pre-push and its prose**
        - Buffered ref lines feed the state-aware advisory and push gate; the gate's exit controls Git. CLI resolution,
          declaration-presence fallback, and disabled handling match commit dispatch. Hook and README copies are synced,
          and configurable comments are edited in place.

    - `[x]` **5.6.b Hook-manager push entries**
        - Generated Lefthook push entries forward stdin; pre-commit.com push entries run even without matching files.

    - `[x]` **5.6.c Push dispatch under every manager**
        - Native installers verify one gate execution per push, remote refs unchanged on failure and advanced on repaired
          retry, disabled dispatch, and nonblocking code advisories. State-only rewrites run no gate or advisory wherever
          stdin is forwarded; pre-commit.com's advisory stays silent. Missing-CLI scenarios verify both declaration
          presence outcomes and a successful installation repair; standalone advisory tests use a restricted PATH.

### `[x]` **5.7 Update upgrades existing generated hook entries — D8**

- _Goal:_ An existing install gets the entries gate dispatch needs in the same update that brings dispatch, and is told
  about any entry it could not upgrade.

- _Outcome:_ `arc update` refreshes recognized Lefthook and pre-commit entries after framework sync, names rewritten
  YAML files, and reports reinstall instructions or unresolved upgrades. Current configurations retain their bytes;
  custom command paths and commit-message filters remain untouched and reported. Malformed configurations preserve
  their bytes while framework updates complete, and repair permits a clean retry; Husky and manager-free installs
  retain their integration.

### `[x]` **5.8 ARC's ROADMAP remedy commit runs no commit gate — D8**

- _Goal:_ ARC's ROADMAP-conflict remedy commit concludes the way a clean merge does, so a red gate cannot abort it as
  `remedy-refused`, and `new-head` verifies both merge paths alike.

- _Outcome:_ The guarded ROADMAP remedy concludes with `git commit --no-edit --no-verify`. Native clean and
  regenerated merges retain their exact parents and return `merged / run-quality-gates`; neither dispatches the
  commit gate, while `new-head` subsequently runs and reports a failing declared check on each resulting head.

### `[x]` **5.9 Gates dispatch under every hook manager** — validate exit criterion at segment scope

- _Goal:_ The segment's exit criterion holds under all four integrations through the built CLI and ARC's shipped
  hooks, recorded as the scenarios run and their results.

- _Outcome:_ Built-CLI native scenarios dispatch commit and push gates once across all four installed integrations,
  including deletion-only commits and failure/repair pushes naming the gated ref. Ref selection excludes state refs
  and deletions and reports other refs without a checkout; partial-staging and fixer scenarios preserve their
  integration-specific behavior. Merge selection includes conflicts and parent-unmatched resolution edits while
  excluding clean incoming content; both base-merge paths conclude before new-head enforcement.

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

### `[x]` **6.1 Workflow and method gate steps name the verb — D6**

- _Goal:_ Every shipped gate step is one `arc check` request from the fire-site translation, so no workflow or method
  names a tier or a command list.

    - `[x]` **6.1.a Task loop**
        - Final completion edits precede one increment request; verifier tasks substitute the segment request and
          reopen on persistent enforcement failure before completion hooks. Unresolved member reports request checks
          after preserving evidence; coherent-unit triggers and delivery acknowledgment order remain intact.

    - `[x]` **6.1.b Errand and supplemental workflows**
        - Errand passes, approved fixes, external-content integration, and cleanup request one increment check.
          Errand base merges request new-head checks from the returned pre-merge head before push and fresh review;
          amendment guidance delegates check selection to the request, and redundant quality examples are removed.

    - `[x]` **6.1.c Lifecycle workflows**
        - Verification requests the forced merge gate; convergence requests forced push-range or merge checks from
          the action's scope while preserving attestation arguments. Lifecycle corrections request the commit gate,
          completion content requests increment checks, and merged bases request new-head checks before checkpointing.

    - `[x]` **6.1.d Delivery and review**
        - Each materialized member requests the push gate over all paths in its checkout. Review-fix verification
          requests the forced commit gate over its exact target, preserving delivery's separate reuse and evidence
          contract; the response method invokes the caller's review-fix request.

### `[x]` **6.2 Briefs, rules, strategies, and references move to the gate model — D1, D10**

- _Goal:_ The always-loaded and reference surfaces teach the gate model (one vocabulary entry, gates named by event,
  kind as its clause), with every gate-sense passage rewritten by sense and nothing pointing at a tier.

    - `[x]` **6.2.a Brief and ARC rules**
        - The brief defines quality gates by event deadline with enforcement and feedback in the same entry.
          ARC rules point checks to the declaration, prohibit agents from setting `ARC_SKIP`, and require new-head
          checks for reconciled bases; obsolete tier-loading guidance and its unused strategy link are removed.

    - `[x]` **6.2.b Strategies**
        - The gate strategy retains operator decisions about deadlines, dependency inputs, and related-test coverage;
          its index fires on those decisions. Customization, integration, classification, and session guidance use
          gate terminology and the declaration, while preserving unrelated configurability and context-loading tiers.

    - `[x]` **6.2.c References and templates**
        - Shipped quick-reference gate blocks are removed; contributor setup requests the merge gate and the project
          rules template preserves zero tolerance per event deadline. Generation, extension, and setup guidance use
          check requests and surviving extension examples; this checkout's project-specific gate blocks remain intact.

    - `[x]` **6.2.d This repository's technical overview**
        - The overview includes project check declarations beside settings, methods, and extensions, removes the
          quality-method and unit-hook examples, and describes event deadlines and fresh verification requests.

### `[x]` **6.3 Code identifiers and emitted text drop the tier names — D1, D10**

- _Goal:_ No code identifier or emitted string names a tier, apart from the stored `verificationKind: "tier-3"` value
  and its `arc attest` echo.

    - `[x]` **6.3.a Confirm no delivery record exists**
        - No files are present under `arc/delivery`, `arc/delivery-gates`, or `arc/delivery-resolutions` in either
          this worktree's Git directory or the shared Git common directory used by the delivery stores.

    - `[x]` **6.3.b Rename delivery's identifiers**
        - Delivery schemas, producers, consumers, fixtures, and `deliver-stack.md` use `commitGateRequired`,
          `commitGateReuseCriteria`, `ReviewFixCommitGateVerificationSchema`, and `commitGate` without aliases.
        - Delivery correction fixtures name their verification evidence `gates://commit`.

    - `[x]` **6.3.c Emitted text and comments**
        - Delivery entry remedies name commit gate checks, member eligibility comments name the push gate, and
          full convergence remedies name `arc check gate merge --force`.
        - The stored `verificationKind: "tier-3"` value and its attestation echo retain their spelling.

### `[x]` **6.4 Bootstrap proposes a declaration from existing gate commands — D2**

- _Goal:_ A project's existing gate commands survive the tier surfaces' retirement as a gate-unset proposed declaration
  on update, and initial setup authors a declaration with the person.

    - `[x]` **6.4.a Extraction**
        - `bootstrap-extraction.ts` proposes shell commands from tier headings, active method overrides, and
          populated extension actions, leaving gates unset with mapped-gate and source comments.
        - Duplicate commands retain every source and the earliest mapped gate; prose is reported for manual authoring.

    - `[x]` **6.4.b Write and report in `arc update` and `arc reconfigure`**
        - Both commands call `bootstrapRetiredChecks` over original planned removals before applying file changes,
          preserving existing declarations and reporting extracted commands and prose through their summaries.
        - Proposals retain unset gates and the generated editor reference whether retired files are removed or kept.

    - `[x]` **6.4.c Initial setup authors the declaration**
        - Initial setup authors project checks and event deadlines with the person, validates the declaration with
          `arc check gate merge --dry-run`, and keeps command patterns and standards in their project documents.
        - The template uses the registered editor reference; native initialization installs no declaration.

### `[x]` **6.5 Retire `quality-gate-commands`, `post-task-quality`, and `post-unit-quality` — D10**

- _Goal:_ The three retired surfaces leave the install with every structural reference to them, and every surviving
  shipped file keeps an `init-recipe.json` disposition.

    - `[x]` **6.5.a Files, recipe, and classification**
        - Removed the three package and installed files, their recipe and classification entries, and regenerated
          manifest membership through the production change plan without changing surviving records.

    - `[x]` **6.5.b Declarations and markers**
        - Removed the retired method declarations and both extension declarations, markers, and link definitions
          from package and installed workflows.

    - `[x]` **6.5.c Scanners, validators, and tests**
        - Install inventories omit the retired surfaces; scanner, validator, and status fixtures use surviving
          extension names. Bootstrap fixtures retain producer-derived historical installation records.

    - `[x]` **6.5.d Sync strategy counts**
        - The sync inventory lists 43 Configurable files and 150 installed files, matching the resolved recipe.

    - `[x]` **6.5.e Update over an install carrying the retired surfaces**
        - Native update retains all three authored files, writes the gate-unset proposal with its editor reference,
          reports every source and prose action, and upgrades generated hooks in the same invocation.

### `[x]` **6.6 Tier-sense inventory exhausted** — validate exit criterion at segment scope

- _Goal:_ The segment's exit criterion holds over the whole inventory: the sense search, every shipped gate step, and
  the update over an install carrying the retired surfaces, recorded as the searches and scenario run and their
  results.

- _Outcome:_ Searches of the package corpus and delivery identifiers found only unrelated tier senses; the stored
  `verificationKind: "tier-3"` and its `arc attest` echo remain unchanged. Manual inspection confirmed the enumerated
  fire sites each request `arc check`. The retirement case in `update-hook-upgrade.e2e.test.ts` passed on the committed
  tree: all authored sources preserved, inactive proposal emitted, every source reported, and hooks upgraded.

## **Phase 7:** This repository as first consumer

_Purpose:_ Configures this repository's existing checks into its declaration, proving each configurable element,
retires the `.husky/pre-commit` chain, and wires CI to the declaration.

_Mode:_ `slice` — closes on this repository's checks running from its declaration through hooks, workflow steps, and CI.

_Exit criterion:_ This repository's commits and pushes run its declared checks through ARC's hooks with the
`.husky/pre-commit` chain gone and no check list outside the declaration, and its CI runs the merge quality gate from
the dry-run list, its setup job failing on a map entry that names an id the dry run does not list.

_Design decisions:_ Tasks 7.1 to 7.3 still run this repository's QUICK-REFERENCE Tier 1 commands at each increment
boundary; from Task 7.4 on, `arc check increment` runs the declaration.

### `[x]` **7.1 Markdown gates read the index the verb points them at — D11**

- _Goal:_ `lint:md` and `lint:md:staged` read the index the verb hands them, so as `reads_index` checks they certify
  the checked tree at the commit hook, under `git commit -a` included, and at the increment boundary.

- _Outcome:_ Raw Git blob readers honor `indexFile`; both Markdown commands capture and forward the inherited index.
  Staged certification runs unconditionally, including a clean `HEAD`, while the worktree drift guard retains its
  staged-path enumeration. Native commit candidates with opposite repository indexes exercise both commands.

### `[x]` **7.2 `format:tables` formats an untracked artifact — D11**

- _Goal:_ A new, untracked Markdown artifact formats at the increment boundary like a tracked one, and the drift guard
  no longer fails after it.

- _Outcome:_ Explicit Markdown selection admits untracked files from the existing worktree selector while retaining
  containment and mutation safeguards. Ignored paths are named in refusals; the formatter writes untracked files
  without staging them, and explicit migration audits load the same files and evidence as automatic selection.

### `[x]` **7.3 The package-sync check reads the exported base and merged-in parents — D11**

- _Goal:_ `check-package-sync.sh`, as a `files` check reading the index, still catches a blind copy over any range
  while passing content a merge brought in.

- _Outcome:_ The sync check consumes supplied paths, both copies from the selected index, and prior overrides at
  `ARC_CHECK_BASE`. Incoming-parent content and parents whose copies converged are exempted across merge ranges; a
  blind copy still fails at its own commit. Missing bases refuse explicitly, and no-argument staged checks remain.

### `[x]` **7.4 This repository's declaration replaces the hook chain and gate blocks — D11**

- _Goal:_ Every check this repository runs locally or in CI is declared once in `.arc/system/arc-checks.yml`, with
  each configurable element proven, and the hook chain and gate blocks that listed checks are gone.

    - `[x]` **7.4.a Code and Markdown checks**
        - Declared Markdown certification and drift checks with index access, ARC audits, targeted TypeScript lint at
          commit and full lint at push, both type checks, shell lint with its tool-version input, package sync, and
          build. Table formatting selects writable artifacts and package sources, projecting Framework outputs.

    - `[x]` **7.4.b Test checks**
        - Declared related unit feedback, whole unit/integration push checks, commit contracts, sharded CI E2E and
          portability, and uncached local E2E feedback. Related selection consumes supplied paths; the local adapter
          runs the complete suite. Decomposition and coupling-audit planning inputs now use byte-identical fixtures.

    - `[x]` **7.4.c Global inputs**
        - Lockfiles and tool configuration invalidate all check keys. The installed npm record is fingerprinted by a
          global runtime input; table formatting also fingerprints its executing sources independently of file inputs.

    - `[x]` **7.4.d Retire the chain and the gate blocks**
        - Husky now delegates only to ARC and preserves its exit status. Removed the staged TypeScript wrapper,
          its integration suite, and corpus entry; package sync now consumes only exported scope. Removed the
          QUICK-REFERENCE gate blocks and corrected the package-sync strategy's declaration and range guidance.

    - `[x]` **7.4.e Prove it on this repository**
        - Native forecasts validate workflow, planning, and Git-executor selection, and a new untracked artifact
          formats at the increment boundary. The retired-chain commit reuses selected checks; the declaration
          retains restaging, native commands, and widening defaults.

### `[x]` **7.5 Project rules and strategies name the gates — D10, D11**

- _Goal:_ This repository's rules state zero tolerance per gate and its one by-id feedback request, leaving selection,
  reuse, and the re-run rule to the verb and its fire sites.

- _Outcome:_ Project rules and testing guidance enforce declared deadlines and one combined related-unit/local-E2E
  feedback request. CONTRIBUTING uses the same deadline rule and delegates setup validation to the declaration;
  copied tiers, relevance tables, and measured-command pointers are gone.

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
