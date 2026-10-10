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
