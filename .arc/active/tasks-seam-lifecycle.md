# Task List: Seam Lifecycle

- **Design:** `spec-seam-lifecycle.md`

---

## **Phase 1:** Before the flip — the seed fix, setup, and the removal function

_Purpose:_ Land everything observable before the flip first: the seed fix ahead of locus's reroute of the cold start,
the two setup chunks so nothing is rerouted only to be deleted, the remaining pre-flip fixes, and the one removal
function and check every later caller moves onto.

_Mode:_ `slice` — closes on today's lifecycle carrying the five pre-flip fixes, each exercisable through the path it
repairs.

_Exit criterion:_ Each pre-flip fix passes through the path it repairs — a `--from` seed on each `arc start` arm, a
dirty checkout refused before an abandon or a Planning park records anything, the workspace still present after a failed
archive write, a missing checkout folder's registration removed by teardown, and activation refusing a work unit whose
`Branch` names base — and every other lifecycle test passes unchanged but for those a pre-flip fix, a setup chunk, or
the removal function's porcelain and move changes alter, each named with its change.

_Design decisions:_ Tasks 1.1–1.3 are the first three review chunks, in that order; the seed fix lands before locus
reroutes `runColdStart` in the same file. Every test a fix changes is named with that fix in its commit and completion
note.

### `[x]` **1.1 Pass `arc start --from` seeds through, and refuse `--from` on the spawning arm — § 13**

- _Goal:_ A cold start reads only an issue reference as a field (`Origin`) and passes every other seed through for the
  agent to read, entering at `draft-design` with no `Design`, and the spawning arm refuses `--from` instead of dropping
  it.

    - `[x]` **1.1.a The cold start takes a `draft-` or `spec-` seed as a document**

        - Removed `arc-spec` and the cold-start/scaffold `design` inputs and reporting. Draft/spec paths and URLs pass
          through as documents; issue references still set `Origin`. Updated `start.test.ts`, `worktree-scaffold.test.ts`,
          and `spec-input-parser.test.ts` around the generated meta and pass-through result.

    - `[x]` **1.1.b The spawning arm refuses `--from` without `--here`**

        - The handler refuses before spawning, naming the in-place form. `start-dispatch.test.ts` covers the refusal
          without a new branch or worktree and the ordinary spawn. The three `rename.e2e.test.ts` starts drop the seed.

    - `[x]` **1.1.c Correct the session-init cold-start step**

        - The package template and installed workflow describe issue-only `Origin` assignment and every other seed
          passing through as planning input.

### `[x]` **1.2 Delete the code no production path reaches — § 1.4**

- _Goal:_ Nothing is rerouted only to be deleted: every module, guard, arm, and function with no production caller is
  gone with its tests and the docs naming it, and every other test passes unchanged.

    - `[x]` **1.2.a Delete the two unreferenced modules**

        - Deleted the two unreferenced modules and the isolated workspace-module test; the bound user-workspace side
          effect remains.

    - `[x]` **1.2.b Delete the `worktree-clean` guard**

        - Removed the unused clean guard, its binding dependency, and table declarations. Guard maps use the remaining
          guards; mutator cleanliness checks remain.

    - `[x]` **1.2.c Delete `reconcileBranch`'s `delete` arm**

        - Removed the uncalled forced-delete branch mutation and its executor reader; merged-safe deletion and remote
          cleanup remain.

    - `[x]` **1.2.d Delete the functions with no production caller**

        - Removed the uncalled convenience functions. Reference-sweep coverage now exercises plan/apply, and
          dependency-discharge coverage exercises the production planner.

    - `[x]` **1.2.e Drop the docs that name them**

        - Removed retired-symbol references from module documentation. No suppression entries became unused.

- _Outcome:_ Only the production planner, mutators, and bound side effects remain; coverage no longer depends on
  the deleted convenience entry points.

### `[ ]` **1.3 Count the archive index in the import ratchet — § 1.4**

- _Goal:_ Archive's and teardown's reads of the archive index count against the `store-raw-state` floor, and no import
  made only for a slug parse does.

    - `[ ]` **1.3.a Move the slug helpers out of the archive index**

        - Move `branchToWorkUnitSlug` and `completedWorkUnitMetaSlug` from `completed-index.ts` into a module of their
          own under `lib/work-unit/`, outside the raw-state helper set; `completed-index.ts` imports
          `branchToWorkUnitSlug` from it for `isShippedWorkUnit`, and re-exports nothing.
        - Re-point the eleven importers that use only those helpers and the slug half of the two mixed importers
          (`lib/session-init/orphan-branch-sweep.ts`, `verbs/teardown.ts`).
        - The tests importing the helpers from `completed-index.ts` — `__tests__/unit/work-unit/completed-index.test.ts`
          and `__tests__/integration/store-lifecycle-consumers-differential.test.ts` — import them from the new
          module, named with the move; every other test passes unchanged.

    - `[ ]` **1.3.b Add the archive index to the helper set, with its callers as the floor**

        - Append `lib/work-unit/completed-index.ts` to `RAW_STATE_MODULES` (`eslint/architecture-imports.ts`).
        - Record its remaining non-type importers in `eslint-suppressions.json` for `arc/store-raw-state` only, as the
          floor — archive and teardown among them, ten files at planning — and prune `completed-index.ts`'s own
          `arc/store-raw-state` entry, which the helper set now exempts, its `surface-names` and `work-unit-paths`
          counts staying. These are the only entries this change adds to any ratchet floor.

### `[ ]` **1.4 Close the workspace after the transition's record writes — § 2.5**

- _Goal:_ A transition that leaves an active location closes the personal workspace only after its record writes, so a
  throw in those writes leaves the workspace in place, and a close that throws after them names `arc user close <slug>`
  as its continuation.

- _Note:_ Archive is the one exposed edge today: park from Planning already defers the close until its retirement
  completes, park from Active closes after its pointer write, and abandon swaps in a no-op.

    - In `executeTransition` (`lifecycle-executor.ts`), the `user-workspace` handler's close runs after the finalize
      writes — `applyBranchField`, `applySoftFields`, `applyCurrentWorkflowField`, and `stageMeta` — as a sequenced
      step; the open, on edges that land in an active location, keeps its place among the side effects.
    - `runArchive` (`verbs/archive.ts`) writes `PR URL` and `Completed` after `executeTransition` returns, so it defers
      the close as `parkPlanning` does (`verbs/park-resume.ts`), wrapping the `user-workspace` handler, and runs it
      after those writes and the cohort sweeps.
    - A close that throws after the records land leaves archive's outcome `archived`, naming `arc user close <slug>` as
      a typed continuation, since a rerun of the transition's verb refuses once its records have moved:
      `ArchiveResult` (`verbs/archive.ts`) gains the continuation, `handleArchive` (`handlers/lifecycle.ts`) renders
      it, and `runUserClose` stays idempotent on rerun.

    - Build `test-first` (one behavior at a time):
        - archive closes the workspace after its `PR URL` and `Completed` writes
        - a throw in the executor's finalize writes returns `finalize-failed` with the workspace still present
        - a throw in archive's `PR URL` and `Completed` write rejects with the workspace still present
        - a close that throws after the records names `arc user close <slug>`, and a rerun of the close succeeds

### `[ ]` **1.5 Refuse activation of a work unit whose `Branch` names base — § 6.1**

- _Goal:_ `arc activate` on a work unit whose `Branch` names the configured base refuses before it prepares, stages, or
  renames anything, naming as text the way onto a branch of its own.

    - `runActivate` (`verbs/activate-deactivate.ts`) takes the configured base in its params, which `handleActivate`
      (`handlers/lifecycle.ts`) passes from the `settings` `buildExecutor` returns, and checks the meta's `Branch`
      against it before `prepareCurrentWuReconcile`, whose apply stages edits a later rejection would not roll back.
    - The refusal names `git switch -c <type>/<slug>`, then setting the meta's `Branch` to it, then `arc activate`.
    - `__tests__/unit/handlers/lifecycle-verbs.test.ts`'s assertion of `runActivate`'s params and the `ActivateParams`
      literals in `__tests__/unit/work-unit/verbs/activate-deactivate.test.ts` take the base, named with the fix.

    - Build `test-first` (one behavior at a time):
        - activation refuses, naming the three steps, with base unrenamed and nothing staged
        - activation of a work unit on its own branch proceeds as today

### `[ ]` **1.6 Build the removal check — § 11.1**

- _Goal:_ One read-only check, taking no lock, reports whether ARC may remove a work item's checkout: `removable`,
  `missing`, or refused `dirty` with its paths, `unobservable`, `locked` by anything but the projection, or
  `persist-would-refuse` with the projection's remedy.

    - `[ ]` **1.6.a Read worktree locks from the porcelain**

        - `parseGitWorktreePorcelain` and `parseGitWorktreePorcelainZ` (`lib/git/worktree-porcelain.ts`) gain each
          stanza's `locked` line, bare or with its reason, as an optional field of the strict stanza schema, which
          `emptyCandidate` leaves absent rather than `null`, so whole-record assertions on unlocked stanzas stand;
          `RegisteredWorktree` (`lib/git/worktree-roster.ts`) carries it through `scanRegisteredWorktrees`.
        - The line format C-quotes a reason holding special characters and `-z` does not, so the line parser decodes
          the quoting.
        - `__tests__/unit/git/worktree-porcelain.test.ts`'s case asserting a `locked` line is ignored inverts, named
          with the change, and every whole-record comparison of a `RegisteredWorktree`
          (`rename-worktree-transaction.ts`) and `arc locus --json`'s registrations carry the field.

        - Build `test-first` (one behavior at a time):
            - a `locked <reason>` line yields the lock and its reason, in both formats, a quoted reason decoded
            - a bare `locked` line yields a lock with no reason
            - a stanza without one yields no lock, and `prunable` lines stay ignored
            - the roster carries a registration's lock

    - `[ ]` **1.6.b The check, in the removal function's module**

        - A new module beside `worktree-porcelain.ts` exports the `RemovalCheck` result, `PROJECTION_LOCK_REASON`, and
          the check, taking the checkout, the disposition (remove or release), and the projection's `check` slot.
        - Folder first: a missing folder reads `missing`, unless Git lists the checkout locked with another reason than
          `PROJECTION_LOCK_REASON`, which reads `locked`; `locked` carries `folderPresent`, the folder fact the check
          has already read, so a caller choosing what to do with a locked checkout reads no folder itself.
        - The Git part is its own `git status --porcelain` in the checkout, reading what `isWorktreeClean` reads
          (`lib/git/worktree-cleanup.ts`, unchanged), which answers only clean or not, so the check parses the
          porcelain's paths itself: changed paths read `dirty` with the paths, and a failed read `unobservable`.
        - The projection part calls the slot, which passes until the projection fills it, reading its `would-refuse`
          as `persist-would-refuse` with the remedy and its `unobservable` as `unobservable` with the detail; a release
          runs it alone.

        - Build `test-first` (one behavior at a time):
            - a clean checkout with no lock reads `removable`
            - changed paths read `dirty`, naming each path
            - a status read that fails reads `unobservable`, never `dirty`
            - a lock with another reason reads `locked` with its path and reason, the projection's lock does not
            - a missing folder reads `missing`, and a missing folder under another's lock reads `locked` with
              `folderPresent: false`, a present one `folderPresent: true`
            - a slot that would refuse reads `persist-would-refuse` with its remedy
            - a slot that cannot tell reads `unobservable` with its detail, for a removal and a release
            - a release ignores `dirty` and runs the projection part alone

### `[ ]` **1.7 Build the removal function — § 11.2**

- _Goal:_ One function removes a work item's checkout: with its folder present it runs the check, the persist step,
  `git worktree unlock` only for a projection lock Git lists, and a plain `git worktree remove`; with its folder gone it
  unlocks a projection-locked registration and removes that registration alone; it returns `removed`, `pruned`,
  `refused` with the check's result, or `failed` naming the step.

- _Note:_ Removing a missing folder's registration is the fourth pre-flip fix: today that registration lingers, and
  teardown reads it as dirty.

    - `ProjectionRemovalSlots` (`check`, `persist`, `release`) with defaults that pass, beside the check; the
      function takes the checkout, the primary, which a release's slot reads, and the slots.
    - With the folder gone the function runs `git worktree remove <path>`, which on Git 2.55 removes that one
      registration and refuses one still locked, where `git worktree prune` would prune every stale registration in
      the repository.
    - The function runs inside each caller's serialization and authorization and takes over none of its preconditions:
      marker and topology revalidation, an Errand's branch and head match, the self-teardown locus hop, the user-surface
      merge-up, and a decomposition candidate's restore of ARC-written files stay with their callers. The candidate's
      cleanup runs unserialized today, `handleTeardown` passing no `serializeWorktreeOperation`, and keeps that.
    - Git refuses to unlock a worktree that is not locked, so the function unlocks only a checkout Git lists as locked
      with `PROJECTION_LOCK_REASON`.

    - Build `test-first` (one behavior at a time):
        - a present, clean checkout is removed, and the result reads `removed`
        - a refused check stops before any write, and the result carries it
        - a projection-locked checkout is unlocked before its removal; an unlocked one is never unlocked
        - a missing folder's registration is unlocked if projection-locked, then removed alone, and the result reads
          `pruned`, every other registration left in place
        - a failing persist, unlock, or remove returns `failed` naming that step

### `[ ]` **1.8 Remove through the function in teardown, and check before an abandon or Planning park writes — § 11.3**

- _Goal:_ Teardown's two checkout removals go through the removal function, teardown completes where a checkout's
  folder was deleted, and an abandon from Planning or Active and a park from Planning run the removal check before their
  first write, so a dirty checkout refuses before anything is recorded.

- _Note:_ The check before abandon and park is the second pre-flip fix. Today each records the transition first and a
  dirty checkout surfaces only at the later `arc teardown <name>`.

    - `[ ]` **1.8.a Teardown removes through the function, and reaches a missing folder**

        - The teardown arm of `reconcileWorkUnitWorktree` (`mutators/reconcile-work-unit-worktree.ts`) calls the
          function in place of its plain `git worktree remove`, its revalidation and user-surface reconcile staying with
          it. Park from Active (`parkActive`, `verbs/park-resume.ts`) runs the same arm, so it reaches the function too,
          and its tests move with the change.
        - Where a checkout's folder is gone, teardown (`verbs/teardown.ts`) matches its registration by the branch it
          retires, since the marker went with the folder and the selection would read it `markerless`
          (`classifyTeardownSelection`, `teardown-selection.ts`), as would the selection's revalidation under the lock
          (`revalidateLocalPredicates`, `teardown.ts`) and `requireExpectedSelection`, which `retire` and `husk` run
          before taking it; its own clean checks, which read a missing folder as dirty (`isWorktreeClean`), give way to
          the removal check's `missing`; and the callers that take the repository-wide worktree lock with the checkout's
          path as their `cwd` — `retire` and `husk` (`teardown-worktree-transaction.ts`) and the mutator's `serialize`
          (`reconcile-work-unit-worktree.ts`) — take it from teardown's own checkout rather than the missing one.
        - A missing folder skips the husk arm in every mode: an abandoned or Planning-parked work unit tears down in
          `abandoned` mode (`teardown.ts`), whose arm refuses a dirty checkout, reading a missing one as dirty, and
          stamps a marker that went with the folder (`teardownWorktree.husk`), so a missing folder goes straight to the
          function's prune. A registration locked by anything but the projection still refuses `locked`.
        - A husk whose folder was deleted by hand stays out of reach: husk discovery skips a detached registration whose
          marker reads absent (`teardown.ts`), and it has no branch to match, so its registration stays until
          `git worktree prune` clears it, a spawn from the flip at its path clears it (task 4.2), or, where locked,
          until locus's stale-worktree sweep reports it.

        - Build `test-first` (one behavior at a time):
            - teardown of a shipped work unit removes its clean checkout through the function
            - teardown of a shipped and of an abandoned work unit whose checkout folder was deleted removes the
              registration and completes
            - a missing folder under another's lock refuses, naming `git worktree unlock <path>`
            - a dirty checkout still refuses teardown, naming its paths

    - `[ ]` **1.8.b The decomposition candidate's cleanup removes through the function**

        - `tryCleanupDecomposeCandidate`'s `removeWorktree` (`verbs/teardown.ts`), which
          `cleanupGitOwnedDecomposeCandidate` calls, removes through the function; its restore of ARC-written files
          and its locus hop stay. The file serializes with decomposition's change.

    - `[ ]` **1.8.c Abandon and a Planning park check the checkout before their first write**

        - `runAbandon` (`verbs/abandon.ts`), after its snapshot read and before its transition's `executeTransition`,
          for a Planning or Active work unit only, and `parkPlanning` (`verbs/park-resume.ts`), before its
          `executeTransition`, run the removal check on the checkout running them, which holds the work unit, since each
          captures its source from the current branch (`captureSource`, `direct-retirement-driver.ts`); a stub's or a
          parked work unit's abandon takes no check, since no checkout holds either — a stub is not in flight, and a
          parked work unit keeps its branch with no registered checkout (`PARKED`, `verbs/abandon.ts`) — so none is
          removed; `captureSource` still needs the checkout on a branch, any branch, since `runAbandon` expects the work
          unit's own only for Planning and Active (`STARTED`).
        - `arc park --land` (`landParkPlanningTransition`) runs from the base checkout and lands a park `parkPlanning`
          already recorded on the planning branch, after its check, so it takes none of its own.
        - A refusal names its repair (spec § 16): commit or discard the named changes for `dirty`, retry for
          `unobservable`, and `git worktree unlock <path>` for the lock's owner to decide.

        - Build `test-first` (one behavior at a time):
            - abandon from Planning and from Active refuses a dirty checkout with nothing staged or recorded
            - a park from Planning refuses a dirty checkout with nothing relocated
            - each proceeds as today with a clean checkout
            - a stub's and a parked work unit's abandon from a dirty checkout on a branch proceed as today

### `[ ]` **1.9 Keep and release anchored checkouts, and move only spawned ones — § 11.4**

- _Goal:_ A checkout ARC claimed in place is never removed: teardown releases its marker and keeps the checkout, a
  release persists through the projection's release slot first, and rename completes where an anchored checkout
  stands.

- _Note:_ Dormant until locus admits a marker carrying `spawnedByArc: false` (`isWorktreeMarker` rejects one today), so
  tests supply the marker at each decision's input rather than through the marker reader.

    - `[ ]` **1.9.a Teardown releases an anchored marker**

        - Where teardown's checkout reads an anchored marker, it releases the marker and keeps the checkout, never
          calling the removal function, as it keeps the primary. Its branch deletion waits for the checkout's return to
          base (task 6.6), on both of teardown's legs (`teardown.ts`): the abandoned leg's `update-ref -d` deletes a
          branch a checkout has out, and the shipped leg's `reconcileBranch` `delete-merged`, a `git branch -D`
          (`mutators/reconcile-branch.ts`), is refused by Git for one and rethrows. Until that return lands, teardown of
          an anchored checkout skips both deletions and keeps the branch.
        - _Retired in:_ Phase 6

        - Build `test-first` (one behavior at a time):
            - teardown of a work unit held by an anchored checkout, in shipped and in abandoned mode, releases the
              marker and keeps the folder and branch checkout
            - a spawned checkout is removed as today

    - `[ ]` **1.9.b Releasing runs the projection's release slot**

        - Beside the removal function, a release calls the `release` slot first and refuses when it refuses; its check
          is the removal check's projection part alone, so `dirty` refuses no release.

        - Build `test-first` (one behavior at a time):
            - a release of a dirty checkout proceeds and keeps its changes
            - a refusing `release` slot refuses the release before the marker is touched

    - `[ ]` **1.9.c Rename's move resolver keeps an anchored checkout in place**

        - `resolveRenameWorktreeMove` (`reconcile-work-unit-worktree.ts`), which takes the branch, the slugs, and the
          current locus today, takes the holding checkout's marker too, and returns the checkout's own path with no move
          for an anchored marker, never its `in-place` status, which `resolveRenameCheckoutCoordinates` maps to the
          primary; the gate (`applyUnderMutex`, `rename-worktree-transaction.ts`) keeps refusing a move with no marker
          or a malformed one.

        - Build `test-first` (one behavior at a time):
            - an anchored checkout whose folder name carries the slug yields its own path and no move
            - a spawned one still yields its move

### `[ ]` **1.10 Move every work-unit checkout in the doubled-force form — § 11.6**

- _Goal:_ Every move of a work unit's checkout this change runs or prints is `git worktree move -f -f`, so a checkout
  the projection later locks still moves with its lock and reason intact.

    - The move `reconcileWorkUnitWorktree` runs for `arc rename` and its rollback swap (`commands/rename.ts`), the
      occupied-move fallback notice beside it, and the deferred-self-move follow-up `handlers/lifecycle.ts` prints. The
      residue sweep's remedy is locus's.
    - `mutators/reconcile-work-unit-worktree.test.ts`'s assertions of the plain `worktree move` argv change with it,
      named with the change.
    - The form's one difference before any lock exists is an accepted edge: a move may land on a path registered to a
      missing or locked worktree, which a plain move refuses.

    - Build `test-first` (one behavior at a time):
        - rename's move and its rollback run `git worktree move -f -f <from> <to>`
        - the fallback notice and the printed follow-up name the doubled-force form

### `[ ]` **1.11 Before the flip** — validate exit criterion at segment scope

- _Goal:_ The segment's exit criterion holds on a freshly merged base.

    - Merge base into the branch (append-only); run `npm ci` first if the merge changed `package-lock.json`.
    - Exercise each pre-flip fix through its path, as the exit criterion lists, and request `arc check segment`.
    - Confirm `eslint-suppressions.json` changed only by 1.3.b's recorded callers, the archive index's own pruned
      entry, and the entries the deletions left unused.

## **Phase 2:** The amended records and the default set

_Purpose:_ Settle what every arm from the flip writes and matches before any verb writes it — branch links with their
record and exclusions, the copy key, the meta's pause section and its checks — and the one computation of a branch's
default set that activation, deactivation, the close, and locus's listing share.

_Mode:_ `layer` — closes on the amended schemas, the copy key, the default set, and the meta kind's additions, settled
and tested.

_Exit criterion:_ The store conformance suite and the kinds' tests pass with the new fields; one commit's copy key
agrees under every source § 5.2 pins; the default set over a scripted repository leaves out base, captured, and
excluded commits by SHA or copy key; the pause section round-trips through its writer; and the widened checks refuse a
hand edit of `Owner` or the pause, and the move to Active while an inbound entry is held.

### `[ ]` **2.1 Add the branch link's record and exclusions, and the copy key in place of the patch-id — § 5.1, § 18.2**

- _Goal:_ A branch link records whether ARC created or adopted its branch and the commits on it that are no task's
  work, and every capture and commit lookup carries a copy key in place of the patch-id, strictly, so a writer states
  both and a `patchId` refuses.

    - `[ ]` **2.1.a The schemas**

        - `LinksSchema`'s branch entries become `BranchLinkSchema` with required `linkedAs` (`created` | `adopted`) and
          `excluded` (`CommitCaptureSchema[]`, unique by repository and SHA), and `CommitCaptureSchema` replaces its
          optional `patchId` with an optional `copyKey` matching `v1:<64 hex>:<64 hex>` (`lib/store/links.ts`).

        - Build `test-first` (one behavior at a time):
            - a branch entry without `linkedAs` or `excluded` refuses
            - an exclusion listed twice for one repository refuses
            - a capture carrying `patchId` refuses, and one carrying a well-formed `copyKey` parses
            - a malformed copy key refuses

    - `[ ]` **2.1.b Lookup matches a SHA, then the copy key**

        - `LookupInputSchema`'s commit request carries `copyKey` in place of `patchId` (`lib/store/lookup.ts`), which
          the `not-found` refusal embeds (`lib/store/refusal.ts`); the reference backend's lookup
          (`lookupReference`, `__tests__/helpers/store/lookup.ts`) matches a captured SHA first, then the copy key only
          where no SHA matches in that repository, as it matches the patch-id today, for task captures and the
          `landingCommit` link alike.
        - The in-repo implementation's commit lookup (`lookupCommit`, `lib/store/in-repo/lookup.ts`) derives a
          commit's task from its `Context` footer, stores no links, and reads neither field, so it changes only in the
          request it parses; the conformance assertion naming the patch-id order and its in-repo exclusion
          (`__tests__/helpers/store/in-repo-declarations.ts`) are renamed together.

        - Build `test-first` (one behavior at a time), over the reference backend:
            - a captured SHA resolves its task
            - a copy key resolves a capture only where no SHA in that repository matches
            - a copy key that matches nothing resolves nothing

    - `[ ]` **2.1.c The fixtures follow**

        - The store tests' branch entries and captures gain the new fields, `patchId` giving way to `copyKey`: the
          conformance suite's (`suite-lookup.ts`, `suite-records.ts`, `suite-primary-role.ts`), the recovery helpers
          (`reference-recovery.ts`, `in-repo-recovery.ts`), and the store unit tests that build them
          (`envelopes.test.ts`, and the reference backend's metadata-ownership, history-transfer, and whole-record
          conflict tests).
        - The in-repo admissions keep refusing a links write (`admitTrackedRole`, `write-admission.ts`;
          `transient-write.ts`), which they decide without parsing the links' shape.

### `[ ]` **2.2 Build the copy key function — § 5.2**

- _Goal:_ One function computes a commit's copy key identically on every clone — `v1:`, a SHA-256 of its raw author
  header value, `:`, and a SHA-256 of a pinned, NUL-escaped `git patch-id --verbatim` — computing none where it cannot,
  so keys computed anywhere match.

- _Note:_ The function returns each commit's committer time beside its key, read from the same header, for the close's
  attribution (task 7.3).

    - `[ ]` **2.2.a The byte-preserving binding removes named variables**

        - `RawGitExec`'s options (`lib/git/exec.ts`) take a list of environment variables to remove from the child's
          environment, beside the fixed filter; `createExecaRawGitExec` (`lib/git/process-executor.ts`) deletes them
          from the explicit environment it builds, as the parsed binding removes the pathspec variables
          (`withoutPathspecEnvironment`), and `createSpawnRawGitExec` (`lib/change-facts.ts`), the other
          implementation of the type, honors the option too, so no binding silently ignores it.

        - Build `test-first` (one behavior at a time):
            - a named variable is absent from the child's environment and the fixed filter still applies, in both
              implementations

    - `[ ]` **2.2.b The author half**

        - Read the commits' raw headers with `git --no-replace-objects cat-file --batch` from local objects alone
          (`objectAccess: "local-only"`, which prepends `--no-lazy-fetch`), and hash the author header's bytes after
          `author` and its space, up to the newline, untouched by `.mailmap` or configuration. `--no-replace-objects`
          goes on the argument list, since the binding's fixed filter strips `GIT_NO_REPLACE_OBJECTS` from the
          environment.

    - `[ ]` **2.2.c The patch half**

        - Feed the SHAs to `git --no-replace-objects -c core.quotePath=true -c diff.suppressBlankEmpty=false
          -c diff.indentHeuristic=true diff-tree --stdin -p --full-index --root --text --no-textconv --no-ext-diff
          --diff-algorithm=myers --ignore-submodules=none` with `GIT_DIFF_OPTS` removed, `--no-replace-objects` being
          Git's global option, which `diff-tree` refuses after the command (exit 129); double each 0x01 byte and write
          each NUL as 0x01 0x02; then give the result to `git patch-id --verbatim` on its stdin as a second call, since
          the bindings take an `input` and pipe nothing. `diff-tree` reads blobs, which a partial clone may lack, and
          without `objectAccess: "local-only"` it fetches each missing one from the promisor remote, so it runs, its
          commit-by-commit retry included, from local objects alone, as the author half does; with missing blobs its
          batch fails, and the retry leaves that commit with no key.
        - `createSpawnRawGitExec` (`lib/change-facts.ts`) caps no output, so the producer runs on the binding that
          does (`createExecaRawGitExec`); a merge or an empty commit in a `--stdin` batch emits no patch bytes, so
          the producer splits the output by commit header rather than counting outputs.
        - Batch under `MAX_GIT_OUTPUT_BYTES`, retrying commit by commit when a batch fails, an overflow reading as the
          process error's `output-limit` kind (`lib/git/process-error.ts`); a merge commit, an empty commit, one whose
          patch alone exceeds the cap, and one whose objects are absent carry no key.

    - `[ ]` **2.2.d One function**

        - `lib/git/copy-key.ts` composes the key from the two halves and is the only producer every writer and reader
          calls.

        - Build `test-first` (one behavior at a time), integration tier over real repositories:
            - one commit's key agrees under `core.quotePath`, `diff.suppressBlankEmpty`, `diff.indentHeuristic`, a diff
              driver's algorithm, `core.bigFileThreshold`, `-diff` from `core.attributesFile`, `.git/info/attributes`,
              and the checkout's `.gitattributes`, `submodule.<name>.ignore`, and `GIT_DIFF_OPTS`
            - a replace ref for the commit changes neither half
            - with one author line held, commits differing only in whitespace get different keys, as do two different
              edits to a UTF-16 file and two commits differing only in a file after one with no final newline
            - a commit holding a NUL and one holding the bytes 0x01 0x02 in its place get different keys
            - a commit with neither a NUL nor a 0x01 byte keeps Git's own patch-id as its patch half's input
            - a merge, an empty commit, an oversized patch, and absent objects get no key, and a failing batch retries
              each commit alone
            - in a partial clone of a promisor remote, a commit whose blobs are missing gets no key and leaves them
              missing, nothing fetched

### `[ ]` **2.3 Compute a branch's default set — § 9.2, § 5.2**

- _Goal:_ One computation returns a branch's default set — its non-merge commits reachable from the tips it is given
  and from neither base nor base's remote-tracking ref, less every commit matching a capture or exclusion by SHA or
  copy key — over the commits the clone holds, after a best-effort refresh of base, with no replace ref reaching it.

- _Note:_ Activation, deactivation, the close, and locus's listing of commits not yet closed call this one computation;
  the listing calls it without the refresh.

    - `[ ]` **2.3.a The walk**

        - A revision walk, `git --no-replace-objects rev-list --no-merges`, the first flag in Git's global position
          since `rev-list` refuses it after the command, from the given tips — `HEAD`, and for activation the branch's
          remote-tracking ref too — excluding base and `refs/remotes/origin/<base>` where it exists; copy keys are
          computed only for the commits no stored SHA matches.
        - The result carries each commit's committer and author times for attribution, and the set over the base refs
          held before the refresh as well as after it, for the close's emptied-set refusal (task 7.2).

    - `[ ]` **2.3.b The refresh of base**

        - A best-effort fetch by explicit refspec, `+refs/heads/<base>:refs/remotes/origin/<base>`, in the work unit's
          checkout, at `DEFAULT_NETWORK_TIMEOUT_MS`, as `arc materialize`'s fetch is bounded; a timeout counts as a
          failed fetch. For activation the branch's refspec follows in a second bounded call, never beside base's, since
          Git fails a fetch whole when one refspec names no remote ref, as a branch never pushed has none; the branch's
          failure is not reported, so a branch never pushed and one whose fetch failed read alike, and where base's
          fetch succeeds and the branch's fails, the exclusions read the remote-tracking ref the clone holds.
          `boundedFetch` (`lib/git/exec.ts`) takes one refspec and no `cwd`, so the fetch runs through
          `boundedGitInvocation`, which takes the argument list and a `cwd`, as `base-distance.ts` fetches base's
          refspec.
        - A failed fetch computes over the base refs the clone has and says base was not refreshed; a clone with no
          `origin` computes over its local base and says nothing about refreshing.
        - Where no base ref resolves, the computation refuses, naming
          `git fetch origin +refs/heads/<base>:refs/remotes/origin/<base>`, or `git branch <base> <commit>` in a clone
          with no `origin`.

    - `[ ]` **2.3.c The checkout's linked branch**

        - One exported resolver beside the computation reads which of the work item's branch links the checkout has out:
          `linked` with the link, `detached`, `unlinked` with the branch the checkout has out, or `no-link` where the
          work item has none. `no-link` comes first: a work item with no link reads it whatever the checkout has out, so
          a detached Planning checkout's refusal names `arc activate`. It establishes only that; each caller applies its
          own refusal — the close (task 7.2), `arc release commit --close`'s check (task 7.4), and locus's listing of
          commits not yet closed.

        - Build `test-first` (one behavior at a time):
            - a checkout on the work branch reads `linked` with its link
            - a detached checkout, a branch the work item does not link, and a work item with no link each read their
              own result
            - a detached checkout of a work item with no link reads `no-link`

    - Build `test-first` (one behavior at a time), integration tier:
        - a base merge's commits never enter the set
        - captured and excluded commits leave it by SHA, and a rebased copy keeping its author line and diff by copy key
        - a single-branch clone's refresh writes base's remote-tracking ref by the refspec
        - a clone whose base refs predate base commits its branch holds leaves them out after the refresh
        - an offline refresh says base was not refreshed; no base ref refuses, naming the repair
        - activation's refresh of a branch never pushed still refreshes base, and reports nothing of the branch
        - a replace ref grafting the branch drops no commit from the set
        - a partial clone's commit with absent objects matches by SHA alone

### `[ ]` **2.4 Add the meta's pause section — § 8.1, § 18.1**

- _Goal:_ The meta's parsed record carries `pause`, `null` when absent, read from a `## Pause` section past the field
  lines and written whole by one section writer, which no field reader or writer and no meta validator reads.

    - `[ ]` **2.4.a The schema and reader**

        - `ParsedMetaRecordSchema` and `MetaRecordSchema` (`lib/active/meta-schema.ts`) gain `pause`: `pausedBy`,
          `since`, `reason`, `waitsOn` (a work unit by slug, a note, or `null`), `resumeNotes`, and `open`, defaulting
          to `null`.
        - `parseMetaRecord` (`lib/active/meta-reader.ts`) finds the section by its heading, as it finds Session
          Context's (`readMetaSectionBodies`, `lib/store/kinds/meta/line-reading.ts`), and, since that returns the
          body alone, parses its bullets itself: `Paused By` and `Since` backticked, `Reason` as prose, `Waits On` a
          backticked slug or a prose note, `Open to Takers` as `` `true` ``, and the `### Resume Notes` subsection.
        - Both schemas are strict, so `pause` defaults to `null` in each for every rule that parses a meta's fields;
          `MetaRenderOverrides` (`lib/store/kinds/meta/projection.ts`) omits it beside the other sections; and `meta.durable-fields`
          (`checkMetaDurableFields`), which walks `MetaRecordSchema`'s keys, validates a changed pause against its
          schema.
        - The `meta-record` validation surface (`lib/validation-surfaces/registry.ts`), which registers
          `MetaRecordSchema`, and `projection-fidelity.test.ts`, which pins it, take the field, as do the whole-record
          comparisons of a parsed meta: `handoffDefaults` in `__tests__/unit/active/meta-schema.test.ts` and the
          expected record in `__tests__/unit/active/meta-reader.test.ts`'s render round trip.

    - `[ ]` **2.4.b The section writer**

        - Beside `writeMetaSessionContext` (`lib/store/kinds/meta/section-writer.ts`), one writer sets the section
          whole, inserts it where the field region ends when absent, removes it on `null`, omits `Waits On` when
          `null`, `Open to Takers` when false, and `### Resume Notes` when `null`, and throws on a body line that would
          end the section.

    - Build `test-first` (one behavior at a time):
        - a section with every field round-trips, and each omitted field reads back as its default
        - writing `null` removes the section and leaves the meta byte-identical to one never paused
        - a body line that would end the section throws
        - no field reader sees the section's bullets, and the meta validator, which scans every line
          (`collectFieldValues`, `scripts/validate-meta-spec.ts`), reports none of its labels, tested through
          `validateFiles`

### `[ ]` **2.5 Make `Owner` and the pause verb-owned, and give a pause's waits-on `Depends On`'s rules — § 18.1**

- _Goal:_ A hand edit can change neither `Owner` nor the pause section, and a pause's waits-on slug follows
  `Depends On`'s resolution, slug-edge, and rename rules.

    - `[ ]` **2.5.a `meta.verb-owned-field` widens**

        - `checkMetaVerbOwnedField` (`lib/store/kinds/meta/authority-rules.ts`) also refuses a hand edit that changes
          `Owner` or the pause section, beside `State`, `Class`, and `Current Workflow`; the record kinds' field
          ownership, which lets an owner hand-edit `Owner`, gives way to the handover verb, a rule no code table
          holds.
        - Its remedy, one text today ("Use the lifecycle or Class verb that owns the change"), names the verb owning
          each field it refuses: `arc handover <slug> --to <identity>` for `Owner`, and `arc pause <slug>` or
          `arc resume <slug>` for the pause section, beside today's text for `State`, `Class`, and `Current Workflow`.

        - Build `test-first` (one behavior at a time):
            - a hand edit changing `Owner` refuses, naming `arc handover`, and a verb's write of it proceeds
            - a hand edit adding, changing, or removing the pause section refuses, naming `arc pause` and `arc resume`

    - `[ ]` **2.5.b Waits-on follows `Depends On`'s rules**

        - `meta.depends-on`'s resolution check (`checkMetaDependsOn`, `reference-rules.ts`) covers a new or changed
          waits-on slug.
        - `work-item.slug-edges` (`checkSlugEdges`, `lib/store/kinds/work-item/slug-edges.ts`), whose surviving-edge
          read takes `Depends On` alone and whose remedy is one constant, gains a pause's waits-on as an edge, refusing
          to give a slug to another work item while a pause names it, with its own remedy naming
          `arc pause <slug> --waits-on <other>`, `--waits-on-note <text>`, or `--no-waits-on`.
        - A rename's settling leaves an in-flight meta's waits-on slug as written, since the sweep's `Depends On`
          rewrite (`rename-reference-sweep.ts`) touches no other line.

        - Build `test-first` (one behavior at a time):
            - a waits-on slug naming no work item refuses
            - taking a slug a pause waits on refuses, naming the three repairs
            - a rename leaves an in-flight pause's waits-on slug unchanged

### `[ ]` **2.6 Refuse the move to Active while the inbound list holds an entry — § 14, § 18.1**

- _Goal:_ `meta.inbound-held` also refuses the move to Active while the work unit's inbound list holds an entry, beside
  its refusals at Integrating and the archive.

    - Widen `checkMetaInboundHeld` (`lib/store/kinds/meta/inbound-held-rule.ts`) to a state change to `Active`; until
      the flip, activation's capture gate carries the property and the in-repo arm adds nothing.
    - The rule observes nothing until the inbound list's kind declares its entry grammar (`work-item/inbound`,
      `lib/store/registry.ts`), so its tests pass a grammar, as the existing ones do.

    - Build `test-first` (one behavior at a time):
        - a write moving a work unit to Active refuses while an inbound entry is held
        - the same write proceeds once the list is empty

## **Phase 3:** The reroute's seam, proven on two verbs

_Purpose:_ Give the lifecycle verbs a store, one write path through it, and the executor's arm from the flip, then
prove the pattern on the Class verb, which writes through the store at once, and on promotion within the backlog, the
first transition with two arms.

_Mode:_ `slice` — closes on verbs writing through the store, one transition running through both of the executor's
arms.

_Exit criterion:_ `arc set-class` writes `Class` through the store from the CLI over the in-repo implementation and
through its verb over the reference backend; `runPromote` and `runDemote` move a stub between provisional and planned
through the executor's arm from the flip over the reference backend; and every in-repo arm passes today's tests
unchanged.

_Design decisions:_ A call into another change's code — locus's exclusivity check, roster lookup, and anchored-marker
writer (`LocusPorts`, task 5.4), the ref backend's pull of a history ref and its project ID — goes through a narrow
injected port whose default is the spec's behavior until that change lands; whichever change lands second binds it. The
arms from the flip run only after the flip, which waits for both changes. A transition's arm from the flip runs inside
`executeTransition`, keeping one edge table and one set of guards; a verb that writes outside any transition uses the
same write helper directly.

### `[ ]` **3.1 Give the lifecycle verbs and the executor the store they open — § 2.1**

- _Goal:_ Every verb in the spec's scope and the executor read `capabilities` from the store they open — production
  opening `createStore` over the checkout, a test injecting any `Store` — with no behavior changing.

    - `[ ]` **3.1.a The executor and the shared verb base**

        - `VerbBase` (`handlers/lifecycle-shared.ts`) and `ExecutorContextDeps` (`executor-context.ts`) take an
          optional `store`, defaulting to `createStore(createDefaultStorePorts({ checkoutRoot: cwd, exec }))` with the
          verb's `io.exec`, and `ExecuteTransitionContext` (`lifecycle-executor.ts`) carries it, optional.
        - An absent store reads as the in-repo implementation, since tests build executors by hand and
          `lifecycle-verbs.test.ts` mocks the executor context as `{}`.
        - `buildExecutorContext`'s `withCwd`, which rebinds the executor after a spawn
          (`buildExecutorContext({ ...deps, cwd })`), rebuilds a defaulted store from the new checkout, so a later step
          reads the checkout it runs in, and keeps a store its deps supplied, so a test's injected backend survives the
          spawn, as `LocusPorts` does (5.4).

    - `[ ]` **3.1.b The verb contexts and the entry points outside the executor**

        - `SetStageContext`, `RepointDesignContext`, and materialize's context are `Pick`s of `ExecuteTransitionContext`
          and gain `store` in the `Pick`; `AbandonContext`, `ArchiveContext`, `BacklogMoveContext`, `StubContext`, and
          `ParkContext` wrap `executor` and read `executor.store`, taking no second field that could drift from it after
          `withCwd`; `TeardownContext`, `RunRenameContext`, and `FinalizeStageContext`, which wrap none, gain the field.
        - The entry points outside the executor carry it: `ArmContext` (`handlers/start.ts`), which feeds the arms'
          `buildExecutorContext` calls — never `StartOptions`, the option bag `StartCommandInputSchema` parses strictly
          — and `SpawnWorktreeContext` (`lib/git/worktree-scaffold.ts`), which create-new and the scaffold arm take
          (4.2.c); `RenameCommandContext` (`commands/rename.ts`); and `PromoteOrdinaryErrandRuntimeOptions`
          (`lib/errand/promote-runtime.ts`).
        - Wiring only: every existing test passes unchanged.

### `[ ]` **3.2 Build the verb-level harness over the reference backend — § 2.1**

- _Goal:_ A verb test runs an arm from the flip over the reference backend with the production kind registry, seeded
  with real meta, task-list, cohort, and Errand content, beside a scripted repository.

    - A helper under `__tests__/helpers/store/` constructs `ReferenceBackend` with `createKindRegistry`
      (`lib/store/registry.ts`) over `PRODUCTION_REGISTRATIONS` (`lib/store/kinds/registrations.ts`), since the default
      registry has no parsers or checks, and seeds records at a placement and with links, the meta rendered by
      `renderMetaFile`, each seed meeting the kinds' write checks — `meta.cohort`, `meta.depends-on`, and
      `meta.design-entry` among them.
    - The backend runs the production write checks on every write and batch (`checkPreparedWrites`), so seeds carry
      provenance naming a verb outside the hand-edit verbs (`write-back`, `save`; `lib/store/links.ts`), which
      `meta.verb-owned-field` would refuse for a meta's creation.
    - It parses every write and batch with `WriteInputSchema` and `BatchInputSchema` before the backend sees it,
      since neither backend parses a mutation envelope itself and no store refusal names a malformed envelope, so a
      failed parse throws the helper's own error, which its tests assert.
    - Git steps run over `scriptGitExec` and `scriptRawGitExec` (`__tests__/helpers/git-exec-fake.ts`).
    - A test of the helper proves a seeded meta reads back parsed and an unparseable mutation throws before the
      backend sees it.

### `[ ]` **3.3 Build the write helper and the executor's arm from the flip — § 2.1, § 5.3**

- _Goal:_ A verb's arm from the flip reads its records with their versions, applies the kinds' writers, and persists
  its writes in one `batch` with expected versions and caller provenance — the verb, its lifecycle action, and
  `codeHead` where it binds a code commit — and a transition's runs inside `executeTransition`, which resolves its
  position from the store, keeps its edge selection and guards, and runs its Git legs around that batch.

    - `[ ]` **3.3.a One branch per verb**

        - A helper selects the arm from `store.capabilities.stateOffBranch`, read once per invocation, an absent store
          selecting the in-repo arm, which is the verb's code today.

    - `[ ]` **3.3.b The write helper**

        - Read the primary and the companions the verb writes, with their versions, apply the kind writers to the
          content read, and land every record write in one `batch` with each expected version and
          `CallerProvenanceSchema` provenance naming a verb outside the hand-edit verbs.
        - Links travel only on a primary `put` carrying content and placement, and a write replaces them whole
          (`MutationSchema`, `lib/store/write.ts`), so the helper merges the links it writes into those it read, keyed
          as the links schema keys them — a branch entry by repository and `ref`, a task's captures by its ID — an entry
          written replacing the one read under its key, and a write naming the entries it retires, as a rename's does
          (5.6.b); a write that sets no links sends none, since the in-repo admissions refuse any `links` value
          (`admitTrackedRole`, `write-admission.ts`), so `arc set-class` writes on both arms.
        - A store refusal — its code and `Remedy` (`lib/store/refusal.ts`) — rides the verb's result beside its
          reason, and the handler renders the remedy's text, with its argv where one is present.

        - Build `test-first` (one behavior at a time):
            - a verb's writes land in one batch carrying its provenance
            - a record changed since it was read refuses the batch, and nothing lands
            - a refusal carries the store's code and remedy into the verb's result
            - a links write keeps every entry it read but those it replaces or retires

    - `[ ]` **3.3.c The executor's arm from the flip**

        - On the arm from the flip, `executeTransition` reads the store's identity-keyed lifecycle index
          (`lib/store/lifecycle-index.ts`) and takes from it the slug-keyed `LifecycleIndex` its position, guards, and
          `GuardContext` read, in place of `buildLifecycleIndex` over `indexFs`; it then selects the edge and runs its
          guards as today.
        - The view's builder (below) returns the listing's completeness with the view: a `malformed` diagnostic or a
          missed record, which `listLifecycleIndex` reports where `buildLifecycleIndex` drops a meta silently, or an
          unreadable listing. Every read of the view that precedes a write refuses over an incomplete listing, as the
          store's lifecycle storage does, through `requireCompleteInventory` (`lib/store/lifecycle-storage.ts`),
          exported for it, naming each record and its condition, since a missing entry proves no absence over a partial
          index — `name-collision` among the guards, rename's collision check, which no store write repeats, among the
          rest. Those reads are this arm and `resumeTransitionFinalization`; the reconcile's prepare context (4.3.b),
          which activation and publication run before their transition, so they refuse before their reconcile writes,
          and which refuses in every mode, since its plan reads a malformed dependency as `nonexistent`:
          `arc wu reconcile` without `--apply` reports the refusal, and session start's probe meets the same refusal,
          how its slot reports it being locus's; and start's dispatch, rename's subject and collision checks, and
          abandon's and resume's handlers (4.6.b), in place of the composed index's indeterminate-slug checks
          (`isComposedLifecycleSlugIndeterminate`, from `assertRenameCollisionFree` and `handlers/start.ts`), which stay
          the in-repo arm's. A read that only reports — `arc status <slug>`'s state query, dispatch's candidates, cohort
          membership (4.6.b) — proceeds over the view, the verb it leads to refusing where it writes.
        - One function beside the identity-keyed index builds that view with `buildLifecycleIndexFromRecords`
          (`lib/work-unit/lifecycle-index.ts`), as status builds one (`project-view.ts`), giving each record its
          projected path from the layout resolver, which `lib/store/` calls with no `work-unit-paths` count, so the
          adapter's fallback path builds none on this arm; nothing on the arm reads or writes by that path.
        - `resumeTransitionFinalization`, which publication and reopen call, takes the same view for its position and
          guards, and reads `Current Workflow` from the identity-keyed index's entry for the work unit, looked up by its
          owner's name, whose parsed fields (`LifecycleEntry.fields`, `lib/store/lifecycle-index.ts`) the slug-keyed
          entry lacks, in place of its read of the meta at the entry's path; it writes by record reference, as the legs
          do.
        - Each edge in `TRANSITIONS` (`lifecycle-transitions.ts`) declares its form from the flip beside today's — its
          soft fields, artifacts disposition, side effects, and whether it takes Git steps before or after its batch —
          and no form writes the soft fields that retire at the flip (`Next Task`, `Last Completed`, `Blockers`), on
          any edge.
        - The verb supplies its Git steps — a branch's creation, adoption, or reattachment, a spawn, a checkout's
          removal, a reap — which the arm sequences around the batch (3.3.e), so a step the verb chooses at run time, as
          activation's arm does, needs no fixed mutation; `validateInputs` checks that the steps the form declares are
          supplied, in place of today's matches of `branchOp` against the edge's `reconcileBranch` and of `worktreeOp`
          against its `reconcileWorkUnitWorktree`.
        - The legs that write records (`classField`, `setPhase`, and the artifacts' disposition — a relocation becoming
          a placement write, `scaffold` a creation put, and `remove` the primary's removal) and the finalize writes
          (the soft fields, and `Current Workflow`, `clearCurrentWorkflowField` included, through its writer) join one
          batch through the write helper by record reference, in place of the field setters, `metaPath`, and
          `stageMeta`; no `Branch` is written, since the link holds it, so `clearBranchField` writes nothing.
        - A guard needing the store, as the pause's does (6.2), is bound beside the index-aware guards
          (`buildFootgunGuards`, `lifecycle-guards.ts`), which `buildExecutorContext` passes as `guardValidators`,
          since a guard reads only `GuardContext`.
        - The in-repo arm runs today's steps unchanged.

        - Build `test-first` (one behavior at a time), over the reference backend:
            - an edge's record writes land in one batch carrying the verb's provenance
            - a guard refusal stops before any write
            - a malformed meta elsewhere in the store refuses a transition, naming that record and its condition, and
              the transition proceeds once the meta parses
            - an input the edge's form from the flip requires, missing, refuses at the inputs stage
            - a Git step the form declares, not supplied, refuses at the inputs stage
            - no edge's form from the flip writes `Next Task`, `Last Completed`, or `Blockers`
            - resume reads `Current Workflow` from the record, and a work unit already past the edge rejects rather
              than throwing
            - a refused batch leaves every record as read

    - `[ ]` **3.3.d The project ID on every link**

        - Each link this change writes — a branch link, a task capture, an exclusion — names the project ID (D14) as its
          repository, resolved once per invocation through a port the ref backend binds, since nothing resolves it
          today: its kind (`project-registry/identity`, `lib/store/catalog.ts`) has no in-repo home and no parser.
          Tests inject it.

    - `[ ]` **3.3.e Git steps around the batch**

        - A helper sequences each Git step either before the batch, rolling back on the batch's failure, or after it,
          idempotent on rerun, so a rerun after the batch lands finds nothing left to prepare.

        - Build `test-first` (one behavior at a time):
            - a Git step the verb supplies runs on the side of the batch the edge's form declares
            - a step before a refused batch rolls back
            - a step after the batch that fails leaves a continuation whose rerun completes it

### `[ ]` **3.4 Add `arc set-class` — § 10**

- _Goal:_ `arc set-class <Light|Heavy|Novel> [<slug>]` writes `Class` at any stage, a stub's included, through the
  store at the placement it read, so before the flip the bytes land in the checkout for the workflow's ceremony commit
  to carry, and where the checkout holds no agreeing copy it refuses with the store's own remedy.

    - Register it in `src/cli.ts` with the value first and an optional slug, and in `lifecycleCommandInputRegistrations`
      (`handlers/lifecycle.ts`); without a slug it takes the checkout's work unit from the current-work-unit resolver
      (`resolveCurrentWorkUnit`, `lib/store/current-work-unit.ts`) over the verb's store; a stub, which no checkout
      holds, is named, since the resolver lists only active work units held here
      (`locations: ["active"], heldHere: true`), and the dispatch tables (`verbs/dispatch.ts`) hold transition verbs
      only.
    - A new command also takes its entries in the lists the repository inventory test reconciles
      (`__tests__/unit/command-input/repository-inventory.test.ts`): a `NO_INPUT_MATRIX` entry
      (`__tests__/fixtures/command-input/no-input-matrix.ts`), the raw-Git command list where it reaches the
      byte-preserving Git binding, and the interaction-context list of lifecycle command boundaries; every verb this
      change adds takes them so.
    - Through the write helper (3.3.b) it reads the meta, applies `writeMetaClass` (from
      `lib/store/kinds/meta/writers.ts`, never the raw-state `meta-reader.ts`), and writes back at the placement it
      read — a completed one without its `sequence`, which `WritePlacementSchema` refuses — with its expected version
      and provenance naming `set-class` and its lifecycle action; it branches on nothing.
    - Add it to QUICK-REFERENCE's "Lifecycle Verbs" index in the package template
      (`arc/reference/QUICK-REFERENCE.template.md`) and the installed copy, in the index's own register, in the same
      commit as its registration, since `command-surface-documentation.test.ts` checks that every `arc …` line in both
      copies names a registered command.

    - Build `test-first` (one behavior at a time):
        - over the in-repo implementation, the meta's `Class` changes in the checkout and nothing is committed
        - over the reference backend, the write lands at the placement read, for a stub, an Active work unit, and an
          archived one
        - over the in-repo implementation, a checkout holding no copy agreeing with the selected meta refuses
          `checkout-not-writable` with its remedy
        - the slug defaults to the checkout's work unit

### `[ ]` **3.5 Reroute `arc promote` and `arc demote` — § 2.2**

- _Goal:_ From the flip `arc promote` and `arc demote` move a stub between provisional and planned and write `Class`
  where `--class` sets it, in one batch, while the in-repo arm runs today's relocation.

    - `runPromote` and `runDemote` (`verbs/promote-demote.ts`) branch once on the capability; from the flip they run
      through the executor's arm (3.3.c), whose edge form writes the placement within backlog and `Class` in one batch.
    - `handlePromote`'s provisional check, read from disk before `runPromote` runs (`handlers/lifecycle.ts`), moves
      into the verb, reading through the store on its arm from the flip; its recorded-`Class` read gates the handler's
      own prompt (`promoteClassPromptSite`), so it stays in the handler, reading through the store from the flip; the
      verbs' own reads through `executor.indexFs` sit in the in-repo arm.

    - Build `test-first` (one behavior at a time), through the verbs:
        - promote moves a provisional stub to planned and writes `--class`'s value in one batch
        - promote of a stub that is not provisional refuses, read through the store
        - demote moves a planned stub to provisional
        - the in-repo arm passes today's tests unchanged

### `[ ]` **3.6 The reroute's seam** — validate exit criterion at segment scope

- _Goal:_ The segment's exit criterion holds on a freshly merged base.

    - Merge base into the branch (append-only); run `npm ci` first if the merge changed `package-lock.json`.
    - Run `arc set-class` from the CLI over the in-repo implementation and through its verb over the reference backend,
      and `runPromote` and `runDemote` over the reference backend, and request `arc check segment`.
    - Confirm no ratchet floor grew.

## **Phase 4:** The reroute across the verbs that link no branch

_Purpose:_ Repeat the proven pattern over every remaining verb whose records touch no branch link, and over the reads,
renders, and workspace their arms from the flip replace.

_Mode:_ `replication` — closes when every verb and read the reroute names that writes no branch link runs its arm from
the flip over the reference backend.

_Exit criterion:_ Each rerouted verb's arm from the flip writes the records § 2.2 names over the reference backend, its
in-repo arm passes today's tests unchanged, and no ratchet floor grows.

### `[ ]` **4.1 Reroute the stage and field verbs — § 2.2**

- _Goal:_ From the flip `arc set-stage` writes `Current Workflow` and `Next Action`, `arc finalize` `Class`,
  `Task List`, and `Next Action`, and `arc repoint-design` `Design`, through the kinds' writers, with no caller reading
  the meta beneath the contract or formatting a value.

    - `runSetStage`, `runFinalizeStage`, and `runRepointDesign` (`verbs/set-stage.ts`, `verbs/finalize-stage.ts`,
      `verbs/repoint-design.ts`) branch once; their arms from the flip go through the write helper (3.3.b).
    - The values reach the writers typed: `finalize-stage.ts`'s `formatValue` preformatting and the repoint verb's
      `join(", ")` of the `Design` list give way to the writers' own rendering, and `handleRepointDesign`'s raw read
      of the meta (`handlers/lifecycle.ts`) moves into the verb, through the store on its arm from the flip.

    - Build `test-first` (one behavior at a time):
        - each verb's arm from the flip writes its fields over the reference backend
        - `arc finalize`'s `Task List` and `Next Action`, and a repointed `Design` list, land as the writers render
          them

### `[ ]` **4.1.R Make spec finalization a coherent record write — A1**

- _Goal:_ Under A1, off-branch spec-finalized repoint writes `Design`, `Current Workflow: generate-tasks`, and the
  begin-current-workflow `Next Action` sentinel atomically, preserving layered siblings and strict stage validation.

    - Build `test-first` (one behavior at a time):
        - repoint a Planning work unit at create-spec, then repeat the stage advance successfully
        - refuse the batch without changing any field, and refuse a separately written inconsistent stage tuple
        - preserve layered Design siblings and the draft-created and in-repo event behavior

### `[ ]` **4.2 Reroute `arc stub` and `arc start`'s records, and the scaffold's arm — § 2.2, § 2.5, § 8.5**

- _Goal:_ From the flip `arc stub` creates its meta through the creation writer at its backlog placement, `arc start`
  creates the meta or places a stub's active at `State: Planning` with its starter as `Owner`, no branch link, and no
  `plan/` branch, reporting a stub's previous owner, and the scaffold creates through the store and seeds no
  `SESSION-NOTES`.

    - `[ ]` **4.2.a `arc stub`**

        - `runStub`'s arm from the flip (`verbs/stub.ts`) runs through the executor's arm (3.3.c), as it runs through
          `executeTransition` today, its edge's `scaffold` disposition becoming the creation put of the meta rendered
          by `renderMetaFile` at its placement; the `--cohort` requires-planned refusal stays.

    - `[ ]` **4.2.b `arc start`'s graduation and create-new**

        - Graduation's arm from the flip runs through the executor's (3.3.c): its atomic graduation (`atomicGraduate`)
          spawns the checkout detached at base's tip, or with `--here` occupies the current checkout and leaves `HEAD`
          where it stands, creating no `plan/<slug>` branch, and the batch places the stub's meta active at
          `State: Planning`.
        - `runGraduate`'s preflight (`preflightGraduate`, `commands/start.ts`) builds `buildLifecycleIndex` over base's
          snapshot, which `graduate` hands it as `sourceIndex` (`ctx.metaFs`, `handlers/start.ts`), or over the
          checkout's files in place, refuses unless it finds the stub there, and reads and shape-checks its meta
          (`validateMetaFieldBlockShape`); that preflight and the `sourceIndex` hand-off are the in-repo arm's, since
          from the flip no meta file sits in either, the executor's arm finding the stub's position in the view (3.3.c)
          and the meta kind's parser covering its shape.
        - The spawn detached at base's tip is new at both places a spawn creates a checkout today, each of which creates
          or attaches a branch:
            - `createLinkedWorktree` (`lib/git/linked-worktree.ts`), which create-new's, materialize's, and resume's
              spawns reach through `reconcileWorkUnitWorktree` and which has only its `-b <branch> <base>` and
              `<branch>` modes, gains a detached mode, `git worktree add --detach <path> <base>`, the flag needed since
              base is a branch name another checkout may have out; `reconcileWorkUnitWorktree`'s spawn takes it with no
              branch, and its fresh-spawn rollback (`rollbackFreshSpawn`) deletes no branch, having created none;
            - graduation's spawn never reaches it: `occupy` (`atomic-graduation.ts`) runs
              `git worktree add <path> -b <branch> <base>` itself, from the spawned operation `capture` builds
              (`git-graduation-transaction.ts`), so from the flip its spawned arm runs
              `git worktree add --detach <path> <base head>`; the operation's `plan/<slug>` branch and the spawned arm's
              checks of that branch's absence (`verifyInitialOccupation`, `verifyRollback`) are the in-repo arm's, and
              its rollback (`rollbackOccupation`) removes the checkout and deletes no branch;
            - from the flip one function beside the removal function (1.7) reads the registrations
              (`git worktree list --porcelain`, with 1.6.a's lock lines), finds one whose folder is missing at a target
              path or holding a branch, and runs the removal check (1.6) on it: `missing` clears it through the removal
              function's missing-folder arm (1.7), which unlocks the projection's lock first and runs
              `git worktree remove <path>`, and `locked` with `folderPresent: false`, another's lock, refuses `locked`,
              naming `git worktree unlock <path>` as text. Git refuses an add at a missing registered path, a detached
              re-spawn's at `../{repo}.{name}` included, and an add or checkout of a branch such a registration holds,
              until it is removed, and `createLinkedWorktree` today reports the add's refusal only as
              `git-worktree-add-failed`; teardown already matches a registration by branch (`branchedRegistration`,
              `verbs/teardown.ts`), and matching by path is new. Before the flip a spawn is unchanged; from the flip the
              function runs at the three sites below, each before Git meets the registration;
            - its site at graduation's spawn: `graduate` (`handlers/start.ts`) runs it on `graduationWorktreePath` once
              that path resolves, before the spawned `prepareTransaction`, since `capture` refuses
              `Worktree destination is occupied` on any registration at the target path, in both of the prepare's reads
              (`prepareGitGraduationTransaction`), and `verifyInitialOccupation` (`atomic-graduation.ts`) refuses again
              before `occupy`; both then meet none, `occupy` runs no clearing, and a `locked` refusal returns as start's
              refusal before any write;
            - its site in `createLinkedWorktree`: its context (`LinkedWorktreeCreationContext`) takes the function as an
              optional step, run once the path resolves and before the add, matching the path and, where the spawn takes
              a branch, the branch; a `locked` refusal returns as a new `error` reason whose error names the unlock,
              which `reconcileWorkUnitWorktree` throws as it throws every `error` today. `reconcileWorkUnitWorktree`
              supplies the step where its op asks, as the arm from the flip's spawn ops do; locus's callers
              (`createSpawnedLocusWorktree`, `lib/locus/allocator.ts`; `createNodeProvisioningDependencies`,
              `lib/locus/provisioning-runtime.ts`, which `provisionSpawned` reaches) supply none, so their spawns, and
              `provisionSpawned`'s reading of every `refused` result as a checkout to adopt, are unchanged;
            - its site in `reconcileWorkUnitWorktree`'s in-place leg: where its op asks, it runs before
              `git checkout <branch>`, matching the branch alone, since the current checkout is the target, for
              `arc materialize --here` from the flip (6.4.b);
            - the location template's `{branch}` (`resolveWorktreeLocation`, `lib/git/worktree-location.ts`) expands to
              the work unit's name where the spawn takes no branch, and graduation's `plan/<slug>` input to it
              (`handlers/start.ts`) is the in-repo arm's;
            - in place, the occupation `capture` reads (`git-graduation-transaction.ts`), which throws today unless the
              current checkout is on a branch with `HEAD` at refreshed base's commit (`sourceRef: ctx.baseRef`,
              `graduate`, `handlers/start.ts`), admits any `HEAD`, on a branch or detached, ahead of base or not, since
              that commit check serves only the in-place move of the stub's artifacts as they stand at base, which the
              batch's placement write replaces; the commit check and the capture of the stub's artifacts from Git are
              the in-repo arm's, as is `graduate`'s own `--here` comparison of the checkout's meta file with base's
              snapshot (`ctx.metaFs`, refusing "its backlog meta differs from the base snapshot"), which holds the same
              requirement and refuses a store-held stub with no file here, so from the flip `graduate` reads the stub's
              `Class` from its record through the store in place of base's snapshot; and `atomicGraduate`'s occupation
              checks (`verifyInitialOccupation`, `rollbackOccupation`, `verifyRollback`, `atomic-graduation.ts`) check
              that `HEAD` is unchanged where they check the created branch today, deleting none on rollback.
        - On the arm from the flip no `plan/<slug>` read, write, or check runs, and nothing requires a branch. Beside
          the branch requirements above, which name no `plan/`, its known sites are these, and a sweep at the task
          (`git grep -n 'plan/'` over § 1.2's files) is the authority, adding any others: graduation's stamping and its
          occupation check (`prepareValidatedGraduationTransaction` and `validOccupation`,
          `validated-graduation-transaction.ts`); the branch-absence check and its `Branch is occupied` refusal
          (`branchIsAbsent`, `git-graduation-transaction.ts`); the branch `occupy` creates (`atomic-graduation.ts`);
          `runGraduate`'s and `runCreateNew`'s branch choice and create-new's rollback, which deletes the branch
          (`rollbackSpawnedWorktree`, `commands/start.ts`); and the start prompts naming it (`handlers/start.ts`). The
          cold start's protected-base cut is locus's.
        - Graduation writes the starter as `Owner` (`writeMetaOwner`), where today it leaves the stub's, and reports a
          stub's previous owner without refusing.
        - Create-new (`runCreateNew`, `commands/start.ts`) spawns outside the executor, through the detached spawn, then
          creates the meta through the scaffold's arm (4.2.c), rolling the spawn back where the creation refuses;
          `arc start --new --here` is the cold start's, which locus reroutes.
        - Neither runs the start ceremony's commit and push (`commitAndPushStartCeremony`) or its direct ROADMAP and
          session-notes writes (`refreshRoadmapForStartCeremony`, `stampStartSessionNotesCommit`,
          `handlers/start.ts`), which stay the in-repo arm.

    - `[ ]` **4.2.c The scaffold's arm**

        - `scaffoldIntoWorktree` (`lib/git/worktree-scaffold.ts`), which create-new and the cold start both call,
          branches on the capability: from the flip it creates the meta through the store, rendered by
          `renderMetaFile` as today but with no `Branch`, since the links hold the branch, and calls no `runUserOpen`.
          Its ownership marker write is unchanged. The file serializes with locus's reroute of the cold start, which
          keeps calling it.

    - Build `test-first` (one behavior at a time):
        - a stub lands at provisional and at planned with its creation fields
        - starting another person's stub records the starter as `Owner` and reports the previous owner
        - create-new and graduation leave a detached checkout at base's tip and no `plan/` branch
        - a spawn with no branch lands at the template's path with `{branch}` as the work unit's name, and its rollback
          deletes no branch
        - an in-place graduation, from a checkout on a branch and from a detached one, each with `HEAD` ahead of base,
          leaves `HEAD` where it stood
        - a refused creation rolls the spawn back
        - over a real repository, from the flip, graduation's spawn whose target path a folderless detached registration
          holds clears it and graduates, one under the projection's lock (`PROJECTION_LOCK_REASON`) included, and one
          another lock holds refuses `locked` before any write, naming `git worktree unlock <path>`
        - over a real repository, from the flip, a spawn through `createLinkedWorktree` whose target path a folderless
          detached registration holds, and one whose branch a folderless registration holds, each clear it and proceed,
          one under the projection's lock included; one another lock holds refuses `locked`, naming
          `git worktree unlock <path>`; a folder present at the path is never removed; a caller supplying no step gets
          today's `git-worktree-add-failed`; before the flip a spawn is unchanged
        - over a real repository, from the flip, the in-place leg over a folderless registration holding the branch
          clears it and checks the branch out, and over one another lock holds refuses `locked`, naming
          `git worktree unlock <path>`, with `HEAD` unmoved
        - the scaffold's arm from the flip writes no `Branch` and seeds no `SESSION-NOTES`

### `[ ]` **4.3 Build the prepared-write protocol, and reroute `arc wu reconcile` and edge discharge — § 3, § 2.6**

- _Goal:_ Every prepared write from the flip acquires the work unit's whole artifact group with each record's version,
  prepares its edits, revalidates each input by its version or by restricted `changes`, and applies everything in one
  batch, so an unrelated write never invalidates it and a changed input refuses or restarts.

    - `[ ]` **4.3.a The protocol**

        - A module under `lib/work-unit/` takes the meta, the task list, the prose companions, and any cohort document
          the plan selects, never the meta alone; decomposition's and locus's reconciling writers follow it.
        - It generalizes what the current-work-unit reconcile already does over files — prepare and apply recheck each
          artifact by its content digest (`discharge-dep-edges.ts`) — onto record versions; the artifact listing it
          starts from (`listCurrentWuArtifactPaths`, `reference-reconcile.ts`) leaves out the cohort document, which
          the protocol acquires where the plan selects one.

        - Build `test-first` (one behavior at a time):
            - an unrelated write between preparation and apply leaves it valid
            - a change to any acquired record refuses or restarts it, and nothing lands
            - its edits and removals land in one batch with each expected version

    - `[ ]` **4.3.b `arc wu reconcile` and dependency discharge**

        - The reconcile — `runCurrentWuReconcile`, with `prepareCurrentWuReconcile`,
          `applyPreparedCurrentWuReconcile`, and `planDependencyReconcile`, which discharges each edge whose dependency
          shipped or is integrating, all in `side-effects/discharge-dep-edges.ts` — runs through the protocol from the
          flip, for each caller: `handleWuReconcile` (`handlers/reconcile.ts`) and `buildCurrentWuReconcile`
          (`executor-context-current-wu.ts`), which activation and publication reach it through. The session probe's
          call (`lib/session-init/current-wu-reconcile.ts`) is locus's.
        - Its prepare context from the flip comes from one builder beside the protocol,
          `createStoreReconcilePrepareContext`, in place of the Git bindings each caller writes today
          (`queryGitTransitionDisposition` and `enumerateGitTransitionRecords` over `HEAD`): the index is the slug-keyed
          `LifecycleIndex` its reader takes (`resolveSlugState`), the view 3.3.c's builder makes from the store's
          identity-keyed index, refusing over an incomplete listing as 3.3.c states, `queryDisposition` resolves a
          former slug through `lookup` to the work item's live primary and a cut or an abandonment from its lineage
          record, `enumerateTransitionRecords` lists lineage records alone, since a rename from the flip writes none
          (5.6.a), and the artifacts are read through the store. Lifecycle's two callers take it, and locus's change
          moves the session probe's binding (`handlers/status.ts`) onto it.
        - From the flip `handleWuReconcile` takes its target from the current-work-unit resolver
          (`lib/store/current-work-unit.ts`) before its detached-`HEAD` refusal, which stays the in-repo arm, rather
          than by matching `Branch` to the current branch (`resolveOwnedTarget`); its fallback to an archived work unit
          reads the marker's work unit through `lookup`, since the resolver lists active placements only.

        - Build `test-first` (one behavior at a time):
            - a detached checkout's reconcile finds its work unit through the resolver
            - with a malformed meta elsewhere in the store, the prepare refuses naming that record, with `--apply` and
              without it
            - an edge naming a former slug resolves through `lookup` to the renamed work unit, and one naming an
              abandoned or cut work unit through its lineage record
            - discharge drops an edge whose dependency shipped or is integrating, through the protocol
            - a reconcile from an archived work unit's checkout finds it through `lookup`

### `[ ]` **4.4 Reroute `arc publish` and `arc reopen` — § 2.2, § 8.7**

- _Goal:_ From the flip publication writes its reconcile's prepared write between the first Candidate authorization and
  the re-authorization, then `State: Integrating` after the boundary claim, reopen writes `State: Active` behind the
  task cursor it reads through the store, both read the work branch from the branch link, the reopen permit takes the
  task list through the store, and neither writes `Next Task` or `Last Completed`.

    - Both transitions run through the executor's arm (3.3.c). Publication's one task-list read
      (`readLastCompletedWork`, `verbs/publish.ts`) feeds only `Last Completed`, so it sits in the in-repo arm.
    - Reopen's cursor check (`resolveReopenTaskAuthority`, `verbs/reopen.ts`) reads the meta and the task list through
      the store from the flip, in place of its `resolveArcPath` and `resolveTaskListPath` reads. It still refuses a
      reopen without `--task` while a task is open, one whose `--task` is not the cursor's, and one with `--task` where
      no task is open, and `--task` still selects `process-task-loop` over the edge's `prepare-work-unit`
      (`currentWorkflowOverride`); only its `Next Task` write retires.
    - The reopen permit (`permitDeliveryReopen`, `handlers/lifecycle-delivery-review.ts`) takes the task list's
      projected path through the store in place of `resolveTaskListPath`, and the read beneath it is delivery's
      (`inspectRepositoryDeliveryReopen`, `lib/delivery/repository-entry.ts`).
    - Each read of the meta's `Branch` reads the branch link from the flip: publication's refusal of a work unit with no
      branch (`runPublish`) and the boundary it projects with that branch (`projectPublicationBoundary`), whose push
      command names it, reopen's merge check (`handlers/lifecycle.ts`), and the pull-request withdrawal
      (`withdrawPrHandler`, `executor-context.ts`), which stay change-request effects.
    - Publication's `Last Completed` derivation and its refusal where none derives, and reopen's `Next Task` write,
      run only in the in-repo arm; `--last-completed` stays accepted and unwritten. A rerun after the prepared write
      lands continues to the batch.

    - Build `test-first` (one behavior at a time):
        - publication's two writes land in today's order over the reference backend
        - reopen moves an Integrating work unit to Active
        - neither writes `Next Task` or `Last Completed`, and publication proceeds where no `Last Completed` derives
        - from the flip reopen refuses without `--task` while a task is open, with a `--task` other than the cursor's,
          and with `--task` where no task is open, and with the cursor's `--task` returns the work unit to
          `process-task-loop`
        - from the flip a reopen of an Active work unit rejects rather than throwing
        - publication reads the work branch from the link
        - a rerun after publication's prepared write continues to its batch

### `[ ]` **4.5 Reroute `arc archive`, the backend assigning the sequence — § 4, § 2.5, § 18.2**

- _Goal:_ From the flip archive writes placement `completed` naming only the quarter, clears the meta's session context,
  both handoff anchors, and `Session Type`, resets `Next Action`, completes the cohort document in the same batch when
  its last open member archives, and writes no `PR URL` or `Branch`, reporting the sequence the backend assigned.

    - `[ ]` **4.5.a A cohort document's completed placement**

        - `MutationSchema` (`lib/store/write.ts`) admits a `completed` placement, naming only the quarter, on a
          `cohort/document` put, and no other placement on that kind; the cohort's read placement
          (`lib/store/placement.ts`) carries the sequence beside a closeout letter, `a` for a leaf cohort or `b` for a
          parent, since `ArchiveSequenceSchema` is digits alone.
        - The reference backend assigns a completed cohort document the sequence of the work unit archived in the same
          batch, lettered `a` for a leaf cohort and `b` for a parent, or the quarter's next number where no member
          archives in its batch (`__tests__/helpers/store/write.ts`, beside the work unit's assignment), and its
          `land()`, which today stores a placement only for a primary or a work-item or review record, stores the
          cohort document's.

        - Build `test-first` (one behavior at a time):
            - a cohort document put with a completed placement parses, and one with any other placement refuses
            - a leaf cohort completed beside its last member reads back with the member's number and `a`, and its
              parent, completed in the same batch, with `b`
            - a cohort completed with no member archiving takes the quarter's next number
            - `cohort.open-members` refuses the completion while a member is open

    - `[ ]` **4.5.b The archive write**

        - `runArchive`'s arm from the flip (`verbs/archive.ts`) runs through the executor's arm (3.3.c) and writes
          through the meta kind's writers (`writeMetaSessionContext` and the field writers), with the cohort document's
          completion (4.5.a) in the same batch where its last member archives.
        - `isArchivalTriggeredWithDescendants` holds only once every member reads `completed`, which the archiving
          member does only after the batch lands, so the arm asks it over the prospective index: the store's listing
          through 3.3.c's store-side view builder, the archiving member's entry placed completed, built by the verb
          itself rather than waiting on 4.6.b.
        - `computeArchiveDestination` (`completed-index.ts`), the cohort sidecar sweeps (`sweepCohortDoc`,
          `sweepNestedParentDoc`), relocation's `git mv`, and the `PR URL` and `Completed` write stay its in-repo arm.

        - Build `test-first` (one behavior at a time):
            - the reference backend assigns the sequence, and the verb reports it
            - the session context and handoff anchors are cleared and `Next Action` reset
            - the cohort document completes in the batch with its last open member, borrowing its number

    - `[ ]` **4.5.c Teardown's shipped authority from the placement**

        - Teardown's three reads of shipped authority (`verbs/teardown.ts`) — `readCompletedEvidenceFromRef`
          (`completed-index.ts`), its re-check under the lock through `readShippedWorkUnitsFromRef`, and `isShipped`
          over `buildLifecycleIndex` where protection is unset — read the placement through `lookup` from the flip.
          The function's other callers (`lib/base-drift/current-adapters.ts`, `lib/locus/derived-evidence.ts`) move
          with the changes that own them.

### `[ ]` **4.6 Read lifecycle state through the contract — § 2.3**

- _Goal:_ Outside the in-repo arms no file in the change's scope builds a work-unit state path or reads lifecycle state
  beneath the contract: the current work unit comes from the resolver, state by slug and cohort membership from the
  identity-keyed lifecycle index, the task list through the store, and the write-context checks drop their branch
  requirement from the flip.

    - `[ ]` **4.6.a The current work unit**

        - `readActiveMetaCandidates`'s callers in `handlers/lifecycle.ts` (`resolveCurrentWuSlug`) and the occupancy
          guard (`makeWorktreeOccupancyGuard`, `lifecycle-guards.ts`, bound in `executor-context.ts`) take their store's
          resolver (`resolveCurrentWorkUnit`) directly: the default root already routes through it
          (`readHeldCandidates`, `meta-reader.ts`), but with a store of its own, and the guard reads each candidate's
          path, filename, state, and branch where the resolver returns a record reference and its record.
        - `handlers/plan.ts`'s match of `resolveActiveWu`'s record against the current branch runs only in the in-repo
          arm.
        - The release wrapper's ambiguous-work-unit refusal (`handlers/release/commit.ts`, `handlers/release/push.ts`)
          reads `resolveActiveWu`, whose candidates come from the resolver; from the flip the resolver yields at most
          the marker's claim (`current-work-unit-marker.ts`), so the refusal can fire only in the in-repo arm and takes
          no branch of its own.

    - `[ ]` **4.6.b State by slug and cohort membership**

        - `arc status <slug>`'s state query (`resolveSlugQuery`, `lifecycle-query.ts`, from
          `handlers/status/lifecycle.ts`), lifecycle-complete cohort membership (`lifecycle-membership.ts`), and
          dispatch's candidates (`resolveVerbTargetOrReport`, `handlers/lifecycle.ts`) read the identity-keyed
          lifecycle index (`lib/store/lifecycle-index.ts`) from the flip, through the slug-keyed `LifecycleIndex`
          `buildLifecycleIndexFromRecords` builds from its entries (3.3.c), so `lifecycle-query.ts` and
          `verbs/dispatch.ts` keep their input and their other callers — status's (`project-view.ts`, `ready-mine.ts`)
          and the integration checkpoint's (`checkpoint-composition.ts`) — stay as they are; the work unit's purpose and
          owner come from its record through the store.
        - The handler's other reads from the composed index (`resolveCallerComposedLifecycleIndex`) — the worktree
          path, the operational boundary's read path (`writablePath`), and the in-flight warnings with the remote's
          reachability — are locus's, whose in-flight model replaces them; the in-repo arm keeps the composed index
          whole.
        - Start's dispatch (`resolveStartDispatch`, `commands/start.ts`, from `handlers/start.ts`), rename's subject and
          collision checks (`resolveRenameSubject`, `assertRenameCollisionFree`, `rename-preflight.ts`, called from
          `commands/rename.ts`), and abandon's and resume's handlers (`handleAbandon`, `handleResume`, through
          `resolveTransformComposition`, `handlers/lifecycle.ts`; 6.7, 6.1) read the same view from the flip, with
          `lookup` resolving a former slug. Abandon's and rename's advisory for a dependent already Integrating
          (`findIntegratingDependentAdvisories`, `transform-coordination.ts`), which takes the composed index today,
          comes from the view's entries from the flip, one whose `phase` is Integrating with the origin among its
          `dependsOn`. The remote in-flight expansion and the composed index they read today (`expandActiveInFlight`,
          `resolveComposedLifecycleIndex`) stay their in-repo arm, so no lifecycle reader meets a branchless in-flight
          entry.

    - `[ ]` **4.6.c Work-unit state paths**

        - No file in § 1.2 builds or parses a work-unit state path outside an in-repo arm: each asks the contract for
          the record or its projected path, so `resolveArcPath` stays the one layout authority. The sites named here are
          the known ones; a sweep over § 1.2's files at the task, for `.arc` literals, tier prefixes, and built artifact
          filenames (`meta-${…}.md` and its siblings), is the authority, and each site it finds is placed by this rule.
        - In an in-repo arm (§ 1.6), and unchanged: `lib/work-unit/lifecycle-index.ts`'s `TIERS` and
          `FLAT_ACTIVE_META_RE` and `locationFromPath` (`lifecycle-state.ts`), behind the in-repo listing;
          `relocate-artifacts.ts`'s `PRUNE_BOUNDARY_TIERS`, archive by path; `transition-record-store.ts`'s
          `TRANSITION_RECORD_NAMESPACE` and its directory builds, lineage on disk; and readiness's user path
          (`side-effects/readiness-regen.ts`), a rendered file. `completed-index.ts`'s completed paths stay with that
          module too, whose callers here move off it (§ 1.4).
        - Also in an in-repo arm: the Git-proven retirement's tree pathspecs and tier listings
          (`git-retirement-authorization-context.ts`; 6.5); park's `.arc` status read, its proof's meta name, and its
          source lookup (`park-planning-landing.ts`, `park-retirement-proof.ts`, `resolveParkSource` in
          `handlers/lifecycle.ts`; 6.8); graduation's artifact names and its location parse of the stub's meta path
          (`git-graduation-transaction.ts`, `validated-graduation-transaction.ts`, `planning-artifact-tuple.ts`,
          `graduate` in `handlers/start.ts`; 4.2); the cohort consistency check's folder conditions (4.8); and
          `arc promote`'s and `arc demote`'s backlog moves (`projectBacklogDestination`, `pruneEmptySource`,
          `verbs/promote-demote.ts`; 3.5). `resolveSlugOperationalBoundary`'s expected meta filename
          (`handlers/status/lifecycle.ts`) is delivery's operational-boundary read.
        - Rerouted from the flip: `backlog-stub.ts`'s stub resolution, through `lookup`; and `commands/rename.ts`'s
          cohort path and `arcRoot` with `isLifecycleTierFile` (`rename-reference-sweep.ts`), whose sweep reads its
          records through the store (5.6.a). The adapter's fallback record path is never reached from the flip, since
          the store-side view gives every record its path (3.3.c).
        - The two `DEFAULT_ROOT_SEGMENTS` (`meta-reader.ts`, `lib/release/wu-resolution.ts`) stay as they are: their
          lifecycle callers move in 4.6.a, and `resolveActiveWu`'s body is outside this change.

    - `[ ]` **4.6.d The write-context checks**

        - From the flip `arc plan check` (`handlers/plan.ts`) drops its committability requirement
          (`classifyPlanningEntry`, `lib/git/write-context.ts`) and `arc housekeep check` (`handlers/housekeep.ts`) its
          requirement of base (`resolveWriteContext`), each on the capability; `resolveWriteContext`'s gate on
          `arc park` (`handlers/lifecycle.ts`) is park's in-repo arm.

    - Build `test-first` (one behavior at a time):
        - each moved read returns today's answer over the in-repo implementation and the stored one over the reference
          backend
        - from the flip, `arc plan check` and `arc housekeep check` pass from a detached checkout
        - from the flip, `arc start` dispatches a stub and a Planning work unit no checkout holds, and `arc rename`
          refuses a target slug another work item holds, each with no remote in-flight expansion
        - from the flip, with a malformed meta in the store, `arc rename` refuses before any write, naming that record
        - from the flip, with a malformed meta elsewhere in the store, `arc status <slug>` still answers
        - over the view, the advisory names an Integrating dependent with an edge to the origin

### `[ ]` **4.7 Stop the edges' renders and the executor's workspace at the flip — § 2.4, § 2.5**

- _Goal:_ From the flip no transition renders ROADMAP, writes `STATUS.USER`, stages a meta, commits a ceremony, or opens
  or closes the personal workspace, and rename moves no workspace.

    - The edges' side effects — `withRender`'s `reconcile-roadmap` and `reconcile-status-user`
      (`lifecycle-transitions.ts`; `executor-context-status.ts`, `side-effects/readiness-regen.ts`) and
      `user-workspace` (`userWorkspaceHandler`) — drop from each edge's form from the flip (3.3.c).
    - The verbs' direct calls run only in the in-repo arm: abandon's suppression of the workspace and its rollback
      render; park's side-effect list (`PARK_ACTIVE_SIDE_EFFECTS`) and rollback render; resume's held-back ROADMAP
      render (`park-resume.ts`); rename's `regenerateReadiness` and `commitTracked` (`commands/rename.ts`,
      `verbs/rename.ts`) and `rename-user-workspace.ts`; the start ceremony (`commitAndPushStartCeremony`); teardown's
      own workspace close (`runUserClose`, `handleTeardown`, `handlers/lifecycle.ts`); and `stageMeta`'s direct callers
      in `park-resume.ts`, `archive.ts`, and `abandon.ts`.

    - Build `test-first` (one behavior at a time):
        - a transition from the flip fires none of those side effects
        - the in-repo arm fires them as today

### `[ ]` **4.8 Retire the cohort consistency check's folder conditions at the flip — § 2.6**

- _Goal:_ From the flip the cohort consistency check runs only its member-section condition, its folder match and its
  cohort document per grouping folder running only in the in-repo arm.

    - `checkCohortConsistency` (`lib/active/cohort-consistency.ts`) is pure, so its one caller
      (`scripts/validate-cohort-consistency.ts`) passes the capability; the shipped `meta.cohort`, `cohort.parent`,
      `cohort.purpose`, and `cohort.open-members` checks carry the retired guarantee.
    - The member-section condition's membership already keys on each meta's `Cohort` field: the folder match's loop
      records each planned meta under the cohort its field names, and the validator adds the live tree's members
      (`liveMembersByDir`, `buildLiveCohortContextFromDisk`, built by `buildLiveCohortContext`), so the arm from the
      flip changes only which conditions run.

    - Build `test-first` (one behavior at a time):
        - from the flip a folder mismatch reports nothing, and a member-section mismatch still reports
        - a member whose meta is filed outside its cohort's folder counts as a member on both arms, a case that passes
          today and guards the split

### `[ ]` **4.9 The reroute across the verbs** — validate exit criterion at segment scope

- _Goal:_ The segment's exit criterion holds on a freshly merged base.

    - Merge base into the branch (append-only); run `npm ci` first if the merge changed `package-lock.json`.
    - Walk each verb and read Phase 4 rerouted over the reference backend and request `arc check segment`.
    - Confirm no ratchet floor grew, and that each remaining entry in the rerouted files sits in an in-repo arm.

## **Phase 5:** Branch links and the work branch

_Purpose:_ Build every verb that cuts, adopts, renames, or keeps a work branch from the flip, each writing the branch
link it creates or keeps.

_Mode:_ `slice` — closes on a work unit planned detached, activated onto a branch it created or adopted, deactivated
and re-activated, and renamed, its branch link correct at each step.

_Exit criterion:_ Over the reference backend and a scripted repository, activation creates, adopts, and reattaches the
work branch with the right record and exclusions; deactivation keeps it and reports its default set; promotion links a
created work branch; and rename renames only a linked branch in ARC's form. The report's merge, whose case asserts what
Git itself does, passes over a real repository.

### `[ ]` **5.1 Build activation's arms from the flip — § 6.1, § 5.2**

- _Goal:_ From the flip activation creates the work branch from a detached checkout or on base, adopts and renames a
  person's branch with its commits so far excluded, or reattaches its own link adding the commits made out of Active —
  never adopting base — writing `State: Active` and the link in the transition's batch after its reconcile's prepared
  write, and naming the old name's remote deletion only for a created link.

    - `[ ]` **5.1.a Choose the arm, and refuse what each arm cannot take**

        - A detached checkout, or one on base, creates `<type>/<slug>` at base's tip in place with `git switch -c`,
          `created`, with no exclusions, since `reconcileBranch`'s `create` is a no-op and its `rename` needs a branch
          to rename; a detached `HEAD` holding commits not on base refuses, naming them and `git switch -c <name>`, then
          `arc activate`.
        - A checkout on a branch that is neither base nor this work item's link adopts it, renaming it to
          `<type>/<slug>` in place, or keeping a name already in that form; it refuses where another branch holds
          `<type>/<slug>`, naming another `--type` or that branch's rename, and where another work item links the
          branch, naming `git switch -c <name>`.
        - A branch the work item links keeps its record and is renamed only when `--type` names another type than its
          own; a carried `plan/<slug>` branch is renamed to `<type>/<slug>` in place.
        - The arm reads the branch from the link, so `runActivate`'s refusal of a meta with no `Branch`
          (`verbs/activate-deactivate.ts`), which every Planning work unit from the flip would meet, is the in-repo
          arm's.
        - The arm's choice, 5.1.b's fetches, and every refusal above and in 5.1.b run before the reconcile's prepare
          (`prepareCurrentWuReconcile`, called from `runActivate`), as 1.5's refusal does, since the reconcile's apply
          lands edits a later refusal would not roll back.

    - `[ ]` **5.1.b The exclusions and their report**

        - Adoption and reattachment fetch base, then the branch, each by explicit refspec in its own call (task 2.3),
          the branch under the name it had when activation began, and add the default set (task 2.3) over `HEAD` and the
          branch's remote-tracking ref to the link's exclusions, refusing where no base ref resolves.
        - The report names `arc task close <ids> --commit <sha>…` for any that is task work, marking those `HEAD` lacks
          with the merge that brings them in first, `git merge --ff --no-edit <sha>` of the remote-tracking ref's tip as
          read.

    - `[ ]` **5.1.c The writes, and the old name's remote branch**

        - The reconcile's prepared write, dependency discharge among it, lands first through the protocol (task 4.3),
          then `State: Active` and the link in the transition's batch, through the executor's arm (3.3.c), whose
          activate edge's form from the flip declares a Git step before its batch, which the arm supplies — the
          creation, adoption, or reattachment 5.1.a chooses — in place of today's `rename`, and writes no `Next Task`.
        - `--task` turns optional at the flip: `ActivateCommandInputSchema` (`handlers/lifecycle.ts`) and
          `ActivateParams`' `nextTask` (`verbs/activate-deactivate.ts`) take it as optional, since the schema parses
          before any store opens, and the in-repo arm refuses a missing `--task` before `prepareCurrentWuReconcile`,
          naming the flag, so nothing is staged; today the schema is that early refusal, and the executor's own check
          (`validateInputs`) comes only after the reconcile has staged its edits. The help text in `src/cli.ts` keeps
          "(required)", which the in-repo arm still enforces, until the deletion pass drops it.
        - The result names the old name's remote deletion as a typed action only for a `created` link whose old
          remote-tracking ref holds no commit `HEAD` lacks, as text after the report's merge where it holds one, and
          never for an adopted link.

    - Build `test-first` (one behavior at a time):
        - a detached checkout and a checkout on base each get a created branch with no exclusions
        - adoption from a spawned and from an anchored checkout renames the branch and records it `adopted`, excluding
          its commits and those its remote-tracking ref holds that `HEAD` lacks
        - a branch already named `<type>/<slug>` keeps its name
        - each refusal names its repair, with nothing written, the reconcile's discharge included: a taken name, a
          branch another work item links, a detached `HEAD` with commits not on base, and no base ref after the fetch
        - with a malformed meta elsewhere in the store, activation refuses with nothing written, its reconcile's
          discharge included
        - a linked branch keeps its name when `--type` names its type, and adds the commits made out of Active
        - at the integration tier over a real repository, since a scripted one would replay its own answer: the report's
          merge brings in a commit only the remote-tracking ref held, on a branch with no upstream, under
          `merge.ff=only`, and after that ref is gone
        - the old name's remote deletion is a typed action for a created link, text where its ref holds commits `HEAD`
          lacks, and absent for an adopted one
        - before the flip, activation without `--task` refuses naming the flag, with nothing staged

### `[ ]` **5.2 Keep the work branch at deactivation, and report its default set — § 8.8**

- _Goal:_ From the flip deactivation writes `State: Planning`, keeps the work branch as the link with the checkout on
  it, and reports the default set over base fetched first, naming `arc task close`, or says base did not resolve and
  names its repair, proceeding either way.

    - `runDeactivate`'s arm from the flip (`verbs/activate-deactivate.ts`) runs through the executor's arm (3.3.c),
      whose deactivate edge declares no Git step from the flip; the rename back under `plan/`, the refusal of a meta
      with no `Branch`, and `handleDeactivate`'s printed `Branch: plan/<target>` (`handlers/lifecycle.ts`) stay its
      in-repo arm.
    - The report's default set runs over `HEAD` after the same bounded fetch of base activation runs (task 2.3).

    - Build `test-first` (one behavior at a time):
        - deactivation keeps the branch and its link, and reports the commits no task captured
        - the report lists no commit merged in from base
        - where no base ref resolves, it skips the report, says so, and proceeds
        - a re-activation reattaches the kept link rather than cutting another

### `[ ]` **5.3 Catch a detached Planning checkout up with `arc base sync` — § 6.2**

- _Goal:_ From the flip `arc base sync` run from a detached Planning checkout re-detaches it at base's tip after any
  sync that leaves base current, refuses while it holds commits not on base, and leaves it where it stands when the sync
  refuses.

    - The arm lives in `handleBaseSync` (`handlers/base.ts`), never in `syncLocalBase` (`lib/git/base-sync.ts`), which
      Errand provisioning also calls; the file serializes with the cutover.
    - Its refusal names the commits and `git switch -c <name>` to keep them on a branch.

    - Build `test-first` (one behavior at a time):
        - a detached Planning checkout is re-detached at base's tip after an update and after an already-current sync
        - commits not on base refuse, naming them and the repair
        - a refused sync leaves the checkout where it stood
        - a checkout on a branch is left on it

### `[ ]` **5.4 Check a marker's exclusivity, and write anchored markers in place — § 6.4**

- _Goal:_ From the flip a spawn, `arc materialize`, and an in-place graduation run locus's exclusivity check before
  writing a work-unit marker, and `arc start --here`'s graduation and `arc materialize --here` write an anchored marker,
  `spawnedByArc: false`.

    - Locus's ports (Phase 3's design decision) are one record, `LocusPorts`, in a new module,
      `lib/work-unit/locus-ports.ts`: `checkMarkerExclusivity`, `findHoldingCheckout` (5.6.b, 6.4.a), and
      `writeAnchoredMarker`. `createDefaultLocusPorts()` is the production record and the one place locus's change binds
      the ports, so every production context that omits the record — `resolveVerbBase` and `buildExecutor`
      (`handlers/lifecycle-shared.ts`), `handlers/start.ts`'s `buildExecutorContext` calls, `withCwd`'s rebind,
      `RenameCommandContext`, and create-new's spawn (`runCreateNew`, `commands/start.ts`), which builds its own
      `reconcileWorkUnitWorktree` context outside the executor and so carries the record itself — reads locus's binding.
      `VerbBase` and `ExecuteTransitionContext` carry the record beside the store (3.1), optional, only so tests can
      inject one, an absent record reading as the default, and `buildExecutorContext` takes it among its deps, so
      `withCwd` keeps an injected record.
    - `checkMarkerExclusivity` defaults to today's guards — Git's refusal and the cold start's own check; a refusal
      names the checkout holding the marker, with the repair: work there, or release it with `arc locus release`.
    - `atomicGraduate`'s in-place `occupy` (`atomic-graduation.ts`) writes the marker inside its rollback and
      `verifyRollback`; `arc materialize --here` writes it through `reconcileWorkUnitWorktree`'s in-place leg. Both
      in-place operations (`git-graduation-transaction.ts`; `ReconcileWorkUnitWorktreeOp`'s in-place `spawn`) gain the
      spawning identity a marker requires.
    - No anchored work-unit marker can be written until locus admits one: `isWorktreeMarker` refuses it,
      `serializeWorktreeMarker` throws on it, and `writeWorktreeOwnershipMarker` writes nothing for `createdByArc:
      false` (`lib/git/worktree-marker.ts`). So the in-place arms write through `writeAnchoredMarker`, which locus's
      admission binds; its default writes nothing, as `writeWorktreeOwnershipMarker` does for an anchored marker today,
      and the tests supply a writer.
    - `writeAnchoredMarker(cwd, marker, { expected? })` creates the marker exclusively, or with `expected` replaces
      the generation holding those bytes, composing `createWorktreeMarkerGeneration` and
      `replaceWorktreeMarkerGeneration`: it returns `created` or `replaced` with the written bytes, `exists`,
      `generation-mismatch`, or, from the default, `unadmitted`, having written nothing. The in-place graduation's
      rollback removes exactly the generation it wrote, by its bytes (`removeWorktreeMarkerGeneration`), and nothing
      after `unadmitted`; `exists` fails the in-place step, which rolls back as any failed step of it does.

    - Build `test-first` (one behavior at a time):
        - a bound exclusivity check's refusal stops the spawn and the marker write, naming the holding checkout, on
          graduation's and create-new's spawns alike
        - an in-place graduation writes an anchored marker, and its rollback removes that generation and no other
        - a marker already present refuses the in-place write as `exists`, and the default writer returns
          `unadmitted` with nothing written
        - `arc materialize --here` writes an anchored marker

### `[ ]` **5.5 Build promotion's one write and its work branch — § 7.2**

- _Goal:_ Promotion's arm from the flip is two steps `promoteOrdinaryErrand` composes, in their own module beside it —
  the role-change put of the Errand's primary to its meta role on the same UID, keeping its links, description,
  placement, aliases, and history and adding the work branch's `created` link with the Errand link's exclusions, and the
  Git step cutting `<type>/<name>` at the Errand's tip and switching the checkout onto it.

    - The steps fill the slots `promoteOrdinaryErrand` composes (`PromoteOrdinaryErrandDependencies`,
      `lib/errand/promote.ts`), so its sequence — the committed frame, then the inbox settlement, retirement, and
      occupancy settlement — and today's runtime stay unchanged: the put and the cut fill `replaceFrame`, whose receipt
      (`PromotionFrameReceipt`) carries `metaCommitted: true` once the put's batch lands, so the composition reaches
      `retire`; `readIdentity` and `recoverPromoted` read the Errand's primary and a promoted one through the store;
      `retire` returns `idempotent`, since the role change already ended the Errand's role on the same UID; and
      `settleInbox` and `settleOccupancy` stay the runtime's. Locus's change has the runtime select these steps
      (`promoteOrdinaryErrandAtRuntime`), and the two changes serialize on `promote-runtime.ts`.
    - The put renders the meta as `metaOverrides` does (`promote-runtime.ts`), less `Branch`, which the link holds,
      and `Last Completed`, which retires at the flip; the full-protection refusal (`promoteOrdinaryErrand`) stays as
      today.
    - `--type` defaults to `feat` at both floors, as `arc errand promote` already defaults it (`handlers/errand.ts`);
      a derivation-floor work unit stays on its work branch at `draft-design`.
    - The in-repo Errand record stores no links (`transient-write.ts`), so the Errand link the put inherits, with its
      exclusions, exists only where `arc errand open` writes it, from locus's change; tests seed it.

    - Build `test-first` (one behavior at a time), over the reference backend and a scripted repository:
        - the put replaces the Errand's primary with its meta on the same UID, keeping its history and links
        - the work branch is cut at the Errand's tip, the checkout switched onto it, and its link recorded `created`
        - a scale-floor promotion's work unit is Active with the Errand's commits in its default capture
        - `retire` returns `idempotent`, and the Errand's record continues as the work item's
        - a promoted item's record set — its role, placement, and kinds — matches a fresh start's at the same stage,
          and it lists and resolves through `lookup` as a fresh start's does; its links differ only in the Errand's
          link it keeps and, at the derivation floor, the `created` work-branch link a fresh Planning start lacks
        - a refused put leaves no branch cut

### `[ ]` **5.6 Reroute `arc rename` — § 7.1**

- _Goal:_ From the flip `arc rename` changes the primary's name and aliases and applies the reference sweep's edits to
  its own records, provisional and planned stubs, and the cohort document in one version-checked batch, finds the
  holding checkout by its marker, and renames only a linked branch in ARC's form, reporting every branch it keeps.

    - `[ ]` **5.6.a The records**

        - `planRenameReferences` and `applyRenameReferencePlan` run through the prepared-write protocol; an in-flight
          dependent keeps the former slug, which `lookup` resolves; `rewriteRenamedMeta`'s own-record edits
          (`mutators/rewrite-renamed-meta.ts`) go through the kind's writers, writing no `Branch`, which it rewrites
          today whenever it ends in `/<slug>` and which the link holds from the flip; no lineage record is written from
          the flip.
        - The sweep edits only its own records, stubs, and the cohort document from the flip: the in-flight dependents
          it rewrites today — the tier test's files (`isLifecycleTierFile`, `rename-reference-sweep.ts`) less the paths
          `transformDependentMutationExclusions` returns as not to mutate (`transform-coordination.ts`, called from
          `commands/rename.ts`) — keep the former slug.

    - `[ ]` **5.6.b The checkout and the branch**

        - It finds the holding checkout through `findHoldingCheckout` (5.4), the checkout whose marker names the work
          unit, defaulting to today's resolution: the composed index's `worktreePathBySlug`, then the checkout holding
          the branch (`resolveSubjectShape`, `commands/rename.ts`).
        - Whether to rename a branch comes from the link: a linked branch in ARC's form for the slug — `plan/<slug>`,
          `<type>/<slug>` — is renamed keeping its `<prefix>/` (`branchPair`), which tests only the `/<slug>` suffix
          and throws on any other, so a branch the link keeps never reaches it; an adopted branch outside ARC's forms
          and a promoted item's Errand branch keep their names, and the result reports them.
        - A renamed branch's link takes the new name in the rename's batch: the write retires the entry under the old
          `ref` and writes one under the new, carrying its `linkedAs` and `excluded` over, through the write helper's
          link merge (3.3.b), since branch entries are unique by repository and `ref` (`lib/store/links.ts`).
        - Rename moves only a spawned checkout, in the doubled-force form (tasks 1.9, 1.10).
        - Rename's legs (`runRename`, `verbs/rename.ts`) sit on either side of the batch (3.3.e):
            - before it, rolled back where it refuses: the local branch's rename (`renameLocalBranch`), renamed back,
              and the checkout's rename through the rename transaction (`renameCheckout`, running
              `createNodeRenameWorktreeTransactionDriver`, `commands/rename.ts`) — the marker's work-unit name, which
              `findHoldingCheckout` finds the checkout by, named back, and a spawned checkout's move, moved back;
            - after it, each reconciling on rerun: the remote leg (`renameRemoteBranch`, running
              `reconcileRenameRemoteBranch`, `rename-identity.ts`), whose delete of the old name against the preflight
              head already reads one gone as `absent` (`deleteRemoteBranch`), and the personal workspace's rename
              (`renameUserWorkspace`, `runUserRenameWorkspace`); where one fails, the result names
              `arc rename <old> <new>` as a typed continuation;
            - a rerun of `arc rename <old> <new>` that finds the item already named `<new>`, as today's rerun reads it
              (`resuming`, `resolveRenameSubject`, `rename-preflight.ts`, over the view from the flip), runs only the
              legs after the batch;
            - the remote leg deletes the old name's remote branch only for a link recorded `created`; for one recorded
              `adopted` in ARC's form it pushes the new name and keeps the old remote branch, the person's as at
              activation (5.1.c), and the result names it.

    - `[ ]` **5.6.c A stub, and an archived work unit**

        - A stub's rename writes through the store with no branch switch (`withRenameStubBranch` stays its in-repo arm),
          so one run from a checkout holding a transient role contributes to that transient.
        - An archived work unit's rename renames its folder and keeps its number from the flip, needing no checkout
          holding it. Today it refuses first in `resolveSubjectShape` (`commands/rename.ts`), which finds no checkout
          holding the work unit, before `assertRenameSubjectPreconditions` (`rename-preflight.ts`) refuses it as
          archived; both stay the in-repo arm.
        - Its retry on a clone lacking the item's history ref waits on the refusal's code, which the ref backend adds to
          `StoreRefusalSchema` (`lib/store/refusal.ts`): whichever of the two changes lands second builds the retry,
          pulling each named history ref through the port the ref backend binds and retrying once. At this task, check
          whether the code has landed on base; if it has not, the retry is the ref backend's, and the completion note
          names that.

    - Build `test-first` (one behavior at a time):
        - the rename and its sweep edits land in one batch, and a changed input refuses it
        - a linked branch in ARC's form is renamed; an adopted one outside them is kept and reported
        - after a rename the branch link names the new branch with its `linkedAs` and exclusions, and no entry names the
          old one; a refused batch leaves the branch, the marker's name, and the checkout under their old names
        - a remote leg that fails after the batch leaves the item renamed, the result naming the rerun, and a rerun of
          `arc rename <old> <new>` pushes the new name and deletes the old
        - an adopted link in ARC's form is renamed and pushed under its new name, its old remote branch kept and named
        - from the flip, `arc rename` reports the advisory for an Integrating dependent with an edge to the origin, read
          from the view
        - a stub's rename from a transient-role checkout switches no branch and opens no second change request
        - an archived work unit keeps its number
        - where the refusal's code has landed, an unresolvable-state-version refusal pulls and retries once

### `[ ]` **5.7 Write the import's branch links where the import landed first — § 5.4**

- _Goal:_ Whichever of this change and the ref backend's import lands second builds the import's writing of each
  branch link's record and exclusions, its captures' copy keys through the one function, and its `branch-missing` and
  `branch-diverged` refusals.

- _Note:_ At this task, check whether the import has landed on base. If it has not, the ref backend builds this, since
  `LinksSchema` will already refuse its plain links; close this task deferred, naming that.

    - Where it has landed: each live work unit's and open Errand's branch becomes a link, `created` for ARC's forms
      (`plan/<slug>`, `<type>/<slug>`, an Errand's `<errand-type>/<slug>`, `chore/` by default,
      `lib/errand/branch-type.ts`) and `adopted` otherwise; an empty `Branch` or one naming base links no branch; the
      trial run lists the refusals first.

### `[ ]` **5.8 Branch links** — validate exit criterion at segment scope

- _Goal:_ The segment's exit criterion holds on a freshly merged base.

    - Merge base into the branch (append-only); run `npm ci` first if the merge changed `package-lock.json`.
    - Run one work unit through planning detached, activation onto a created and an adopted branch, deactivation,
      re-activation, promotion, and rename over the reference backend and a scripted repository, checking its branch
      link at each step, and request `arc check segment`.
    - Confirm no ratchet floor grew.

## **Phase 6:** Lifecycle moves from the flip, and retirement

_Purpose:_ Settle every move whose meaning changes at the flip — pause in place of park, handover, the widened
materialize, abandon's one path — and the reap that deletes only branches ARC created.

_Mode:_ `slice` — closes on a work unit paused, handed over, materialized, and abandoned, with its created branches
reaped and an adopted one kept.

_Exit criterion:_ Over the reference backend and a scripted repository, a pause refuses each verb that advances the
work and lets every other write proceed; a handover refuses unshared work; materialize gives a released work unit a
checkout with and without a branch link; abandon runs one path from a stub, Planning, and Active; and teardown reaps
every created branch by its end's rule while keeping and reporting an adopted one.

### `[ ]` **6.1 Add `arc pause` and `arc resume` — § 8.1**

- _Goal:_ From the flip `arc pause` writes the pause section on a Planning or Active work unit, requiring a reason on a
  first pause, updating only the fields it is given and keeping when the pause began, and reporting work no one else
  can reach; `arc resume` clears it; before the flip `arc pause` refuses `unsupported`, naming `arc park`, and
  `arc resume` resumes a parked work unit as today.

    - Register `arc pause [<slug>]` with `--reason`, `--waits-on`, `--waits-on-note`, `--no-waits-on`, `--resume-notes`,
      `--no-resume-notes`, `--open`, and `--no-open` in `src/cli.ts` and `lifecycleCommandInputRegistrations`
      (`handlers/lifecycle.ts`), the slug defaulting to the checkout's work unit through the current-work-unit resolver,
      as `arc set-class`'s does (3.4), with their entries in the repository inventory test's lists, as 3.4 gives its
      own; a pause is no transition, so it joins no dispatch table (`verbs/dispatch.ts`) and writes through the write
      helper (3.3.b).
    - `arc resume`'s arm from the flip clears the section and nothing else, through the same helper; its park legs
      (`runResume`, `park-resume.ts`) stay the in-repo arm.
    - `handleResume`'s preamble (`handlers/lifecycle.ts`) runs `resolveTransformComposition`, the remote in-flight
      expansion among it, and passes the composed index to `runResume`; from the flip the handler takes the target and
      its state from the store's slug-keyed view (3.3.c), the composition staying the park legs' in-repo arm.
    - Before the flip each of the flip's verbs refuses on its own capability check, naming the path that serves, since
      the store's `unsupported` cases (`UNSUPPORTED_CASES`, `lib/store/refusal.ts`) name none of them.
    - A pause on a stub refuses, naming `arc start <slug>`; from the flip `arc resume --here` refuses, naming
      `arc materialize <slug> --here` as a typed action.
    - One function beside the verbs reads a work unit's unshared work, which pausing reports and a handover refuses on
      (6.3):
        - the checkout here holding the work unit, found through `findHoldingCheckout` (5.4), and its uncommitted
          changes, read by the removal check's Git part (1.6.b);
        - the linked branch's commits on no ref another person reaches: after bounded fetches of base, then the branch,
          each by its explicit refspec as 2.3.b runs them, the commits
          `git rev-list <branch> --not refs/remotes/origin/<branch> refs/remotes/origin/<base>` lists, either
          remote-tracking ref dropped where absent;
        - a failed branch fetch is told apart by `git ls-remote --exit-code origin refs/heads/<branch>`, bounded as the
          fetches are, since Git fails the fetch alike, exit 128, where `origin` lacks the branch and where it cannot be
          reached, and leaves a stale remote-tracking ref in place: exit 2 means `origin` lacks it, a branch never
          pushed or one gone from `origin`, and the count drops the branch's remote-tracking ref, stale or not, so it
          and a branch pushed with no upstream count every commit beyond base, with `git push -u origin <branch>` as
          their repair; a work unit with no branch link has none;
        - where `origin` cannot be reached — base's fetch fails, or the branch's fails and the listing does not exit 2 —
          it reads over the refs the clone holds and says `origin` was not refreshed; a clone with no `origin` counts no
          commit unshared and reports the branch's commits beyond base as held only in this clone.
    - Pausing reports what that function finds without refusing, offline over the refs the clone holds, and leaves the
      checkout in place.

    - Build `test-first` (one behavior at a time):
        - a first pause writes the section with its reason, and one without `--reason` refuses
        - a second pause updates the fields given, keeps the rest, and keeps `since`
        - `--no-waits-on` and `--no-resume-notes` clear their fields
        - a pause on a stub refuses, naming `arc start <slug>`
        - pausing reports unpushed commits and uncommitted changes and proceeds, naming `git push -u origin <branch>`
        - over a real remote, a branch never pushed and one deleted from `origin` with its stale remote-tracking ref
          left in the clone each count every commit beyond base, with no note that `origin` was not refreshed
        - with `origin` unreachable the report says `origin` was not refreshed; a clone with no `origin` reports the
          commits as held only here
        - from the flip `arc resume` proceeds through its handler with no remote in-flight expansion
        - resume clears the section and nothing else
        - before the flip, pause refuses `unsupported` naming `arc park`, and resume resumes a parked work unit

### `[ ]` **6.2 Refuse the verbs that advance a paused work unit — § 8.2**

- _Goal:_ A verb that advances a paused work unit's work — a `State`, placement, or stage change, a task close or
  deferral, an edge reconcile — refuses, naming `arc resume <slug>` as a typed action, and every other write proceeds
  with the pause in place.

    - A transition meets the pause as a guard: a `GuardId` member and each advancing edge's `guards` list
      (`lifecycle-transitions.ts`) — activate, deactivate, publish, and archive, never the abandon or resume edges —
      with its validator bound over the store the executor holds (3.1) beside the index-aware guards
      (`buildFootgunGuards`, `lifecycle-guards.ts`; 3.3.c), since `GuardContext` carries no meta, and
      `resumeTransitionFinalization`'s rerun of the guards meets it too.
    - `arc set-stage` (`runSetStage`), whose context today picks only its two writers, gains the store to read the pause
      from, and the reconcile's apply (`applyPreparedCurrentWuReconcile`, `discharge-dep-edges.ts`), which
      `arc wu reconcile` (4.3), activation, and publication all run before their transition, checks it, so activation
      and publication refuse on a paused work unit before their reconcile writes, ahead of their edge guard; never its
      prepare (`prepareCurrentWuReconcile`, `createStoreReconcilePrepareContext`), which writes nothing, so a prepare on
      a paused work unit, as session start's probe runs, proceeds; the close and deferral and
      `arc release commit --close` check it in their own tasks (7.1, 7.4).

    - Build `test-first` (one behavior at a time):
        - activation, deactivation, publication, archive, a stage change, and a reconcile's apply each refuse on a
          paused work unit, naming `arc resume <slug>`, activation and publication with nothing written, and a
          reconcile's prepare proceeds
        - rename, a second pause, `arc set-class`, `arc repoint-design`, and a hand edit each proceed; handover's and
          abandon's cases sit with those verbs (6.3, 6.7)

### `[ ]` **6.3 Add `arc handover` — § 8.5**

- _Goal:_ From the flip `arc handover [<slug>] --to <identity>` writes `Owner` alone, refusing while the work branch's
  unpushed commits or uncommitted changes in the owner's checkout here remain, naming each; before the flip it refuses
  `unsupported`, naming the `Owner` edit it replaces.

    - Register the verb in `src/cli.ts` and `lifecycleCommandInputRegistrations`, the slug defaulting as `arc pause`'s
      does, with its entries in the repository inventory test's lists, as 3.4 gives its own; it writes `writeMetaOwner`
      through the write helper (3.3.b).
    - It refuses on what 6.1's unshared-work function finds: the branch's unshared commits, naming
      `git push -u origin <branch>`, a branch `origin` lacks among them, and the holding checkout's uncommitted changes,
      naming them. Where `origin` cannot be reached, as that function tells it, it refuses, since refs the clone holds
      can show a branch pushed that `origin` has since dropped or rewound, naming the retry once `origin` is reachable;
      in a clone with no `origin` it refuses only on uncommitted changes and reports the branch's commits as held only
      in this clone.

    - Build `test-first` (one behavior at a time):
        - a handover writes `Owner` and nothing else
        - unshared commits refuse it, naming `git push -u origin <branch>`, and over a real remote a branch never pushed
          and one deleted from `origin` each refuse so, never naming the retry; uncommitted changes refuse it, naming
          them
        - an unreachable `origin` refuses it, naming the retry; a clone with no `origin` refuses only on uncommitted
          changes
        - a paused work unit can be handed over
        - before the flip it refuses `unsupported`

### `[ ]` **6.4 Widen `arc materialize` — § 8.4**

- _Goal:_ From the flip `arc materialize <slug>` gives a checkout to any in-flight work unit its identity owns that no
  checkout here holds — found in the store's listing, with or without a branch link — leaving a pause in place,
  spawning on a linked branch or detached at base's tip, and with `--here` writing an anchored marker, alone where no
  branch is linked.

    - `[ ]` **6.4.a Candidates from the store**

        - The arm from the flip lists in-flight work units the identity owns, less those `findHoldingCheckout` (5.4)
          finds a checkout here holding, asked once per candidate, in place of `resolveMaterializeCandidate`'s read of
          `origin`'s branches (`handlers/lifecycle.ts`); paused and released work units are candidates.
        - Session start's and status's materialize offer (`findMaterializableWorkUnits`,
          `lib/session-init/materializable-work-units.ts`) is locus's, which renders the widened candidates.
        - From the flip `arc start` on a started Planning work unit (`resolveStartDispatch`, `commands/start.ts`)
          refuses, naming the checkout here holding it, found through `findHoldingCheckout` (5.4), or
          `arc materialize <slug>` where none does, in place of today's "a planning WU on its branch" text, which the
          in-repo arm keeps.

    - `[ ]` **6.4.b What it gives**

        - A linked branch: the fetches take base, then the branch, each by explicit refspec in its own call (task 2.3);
          where they fail it proceeds when the clone holds the branch or its remote-tracking ref, and refuses only where
          it holds neither, in place of today's refusal of any failed fetch (`fetchMaterializeBranch`,
          `handlers/lifecycle.ts`). The refusal tells the failed branch fetch apart as 6.1's function does: where
          `origin` lacks the branch it names `git push -u origin <branch>`, run from the clone that holds it, and
          otherwise `git fetch origin +refs/heads/<branch>:refs/remotes/origin/<branch>` once `origin` is reachable. The
          spawn then attaches the branch — re-attaching the local branch where the clone has one, as resume's spawn does
          (`createBranch: false`, `runResume`), or creating it from its remote-tracking ref, as materialize's spawn does
          today (`createBranch: true`, `verbs/materialize.ts`), so a released checkout's kept local branch and a branch
          never pushed both spawn — or `--here` switches onto it, as today (`reconcileWorkUnitWorktree`).
        - No branch link: a best-effort fetch of base alone, then a spawn detached at base's tip through the detached
          spawn create-new uses (task 4.2), refusing where no base ref resolves and naming the default close's
          repair; `--here` writes the anchored marker alone (task 5.4) and leaves `HEAD` where it stands.
        - A checkout with no marker that has the linked branch out refuses the spawn, naming that checkout and
          `arc materialize <slug> --here` run from it. A registration whose folder was deleted by hand counts as no
          checkout: the spawn clears it before its add, and `--here` before its checkout (task 4.2).

    - Build `test-first` (one behavior at a time):
        - a remote-only, a released, and a paused work unit each get a checkout, the pause left in place
        - a linked work unit's spawn fetches base, then its branch; offline it spawns from the branch the clone holds,
          and refuses where the clone holds neither the branch nor its remote-tracking ref, naming the fetch's retry
          with `origin` unreachable and, over a real remote that lacks the branch, the push from the clone holding it
        - a work unit with no link spawns detached at base's tip, offline at the base the clone has, and refuses with
          no base ref
        - from the flip, `arc start` on a started Planning work unit names the checkout here holding it, and
          `arc materialize <slug>` where none does
        - `--here` on a work unit with no link writes the marker and leaves `HEAD` and the branch untouched
        - an unmarked checkout holding the linked branch refuses the spawn, naming the `--here` form
        - over a real repository, a registration whose folder was deleted holding the linked branch is cleared, and the
          spawn proceeds, as does `--here`'s switch onto the branch

### `[ ]` **6.5 Reap a retiring work unit's created branches by its end's rule — § 12.1, § 12.2**

- _Goal:_ From the flip teardown reads the lineage record and retires the work unit's whole ref set, local and
  remote-tracking, of every branch link recorded `created` — the retiring branch by its end's rule, every other ref only
  where it carries nothing beyond base and the retiring branch — keeping and reporting the rest.

    - `[ ]` **6.5.a Each end's rule**

        - An abandon discards its created branch, local and remote, with no merge check (`discard-confirmed`,
          `authorizeFromGitTransition`, `retirement-authorization.ts`); an archive's teardown deletes it once landed in
          base or on its upstream, the remote only once landed (`assessReapSafety`, `lib/git/branch-containment.ts`;
          `readShippedEvidence`, `git-retirement-authorization-context.ts`); a decomposed origin's teardown takes the
          archive's rule.
        - From the flip the evidence for an abandon and a decomposed origin is the lineage record, since the Git-proven
          transition stays the in-repo arm, and teardown takes each created branch's rule from its evidence: a completed
          placement or a cut's lineage record takes the archive's rule, an abandonment's the discard. `TeardownMode` and
          its derivation (`shipped ? "shipped" : "abandoned"`, `verbs/teardown.ts`) and `TeardownAuthorizationRequest`'s
          `requestedMode` (`retirement-authority.ts`) stay the in-repo arm's, where a decomposed origin's teardown reads
          `abandoned` and refuses `evidence-missing`, finding no abandon or park transition
          (`git-retirement-authorization-context.ts`).
        - `RetirementEvidenceRef` (`retirement-authority.ts`) gains a lineage arm beside `shipped` and `git-transition`,
          reaching every place that encodes or switches on the evidence kinds. They are the list a sweep
          (`git grep -n 'RetirementEvidenceRef\|"git-transition"\|kind [!=]== "shipped"'`) extends at the task:
          `decodeKnownEvidence` and `huskEvidenceMatchesAuthorization` (`lib/git/worktree-marker.ts`),
          `gitTransitionResultDigest` and `gitTransitionExpectedLifecycle` (`retirement-authority.ts`),
          `git-retirement-authorization-context.ts`, `retirement-authorization.ts`, `teardown-retirement-driver.ts`,
          `teardown-lifecycle-projection.ts`, and the husk advisory's schema (`current-husk-advisory.ts`); the residue
          sweep's reader (`lib/session-init/lifecycle-residue-sweep.ts`) is locus's.
        - `plan/` branches are reaped as created links; there is no `plan/` category of their own from the flip.

    - `[ ]` **6.5.b The reap plan**

        - A multi-match yields a reap plan in place of today's refusal (`resolveWuBranch`, `verbs/teardown.ts`), the
          link records naming the ref set rather than a slug-suffix match.
        - The reap generalizes `reapZeroDeltaBranch` (`lib/errand/abandon-runtime.ts`) rather than building a sibling:
          it takes a work item's branch rather than an Errand record and the work item's lock rather than the Errand's
          claim, tests that a ref carries nothing beyond base and the retiring branch, where today it proves the head an
          ancestor of the local base, and deletes the clone's remote-tracking ref, `refs/remotes/origin/<branch>`,
          beside the local one, where today it deletes only `refs/heads/<branch>`; `origin`'s own branch goes only by
          the retiring branch's rule (6.5.a).

    - Build `test-first` (one behavior at a time), over the reference backend and a scripted repository:
        - teardown on an abandonment's lineage record, seeded, discards a created branch, local and remote
        - an archive's teardown deletes a landed created branch, and keeps an unlanded remote
        - a decomposed origin's teardown deletes its landed branch on the lineage record's evidence
        - a promoted item's Errand branch carrying nothing beyond base and the work branch is reaped, and one carrying
          commits of its own is kept and reported

### `[ ]` **6.5.R Retain terminal branch authority — A2, § 12.1**

- _Goal:_ A2's terminal lineage preserves the retiring primary's exact branch-link list in the removal batch, so
  teardown can resume cleanup with its created/adopted authority and exclusions after primary removal.

    - `[ ]` **6.5.R.a Validate and write the snapshot**

        - Extend `LineageRecordSchema` and `writeLineageRecord` with optional `retiredBranches`, restricted to terminal
          abandonment/decomposition and sharing `BranchLinkSchema` and repository/ref uniqueness; preserve array order.
        - Abandon writes the exact removed primary's branch entries, including an explicit empty list, in its batch.

    - `[ ]` **6.5.R.b Read terminal authority on retry**

        - Teardown reads `retiredBranches` when the primary is removed; completed primaries keep their own links.
        - Cover missing-snapshot refusal, repair and successful retry, and cleanup retry after a physical failure.
          No slug/ref-name inference or content-only history supplies authority.

### `[ ]` **6.6 Return a holding checkout to base, and keep adopted branches — § 12.3, § 12.4**

- _Goal:_ Before a branch is deleted, a clean checkout holding it returns to base, or detaches at base's tip where a
  linked checkout cannot take base, while a dirty one stays with its branch kept and reported; an adopted branch is
  never deleted, and the abandon or teardown reports it kept, naming its owner's steps to delete it.

    - The return follows `relocatePrimaryToBase` (`git switch` to base, then a fast-forward) for any holding checkout,
      an anchored one included, using the removal check's Git part. It replaces task 1.9.a's skip: once a clean anchored
      checkout returns, both of teardown's branch deletions run on it.
    - The kept-branch report names, as text, `git switch` off it where a checkout holds it, then
      `git branch -D <name>`.

    - Build `test-first` (one behavior at a time):
        - a clean holding checkout returns to base, or detaches at its tip while another has base out
        - a dirty holding checkout stays, its branch kept and reported
        - an adopted branch survives teardown on a seeded abandonment lineage record and an archive's teardown, its
          checkout's `HEAD` on it, and the report names the two steps

### `[ ]` **6.7 Give abandon one path from every state — § 8.6**

- _Goal:_ From the flip abandon from a stub, Planning, or Active, paused or not, runs the removal check where a checkout
  here holds the work unit, one batch creating the lineage record and removing the primary, the checkout's removal or
  an anchored checkout's release, and the reap of a created work branch, naming `arc teardown <slug>` as a typed
  continuation where a step after the batch fails; Integrating refuses as today, naming `arc reopen`.

    - `runAbandon`'s arm from the flip (`verbs/abandon.ts`) runs through the executor's arm (3.3.c), whose abandon
      edges keep their confirmation guard, the lineage record's creation and the primary's removal in its batch; the
      handler's own confirmation check (`handlers/lifecycle.ts`) stays.
    - `handleAbandon`'s preamble (`handlers/lifecycle.ts`) runs `resolveTransformComposition` before the verb branches:
      the remote in-flight expansion, the composed index's state, its refusal without a writable meta path, and the
      `Branch` it parses from the meta at that path. From the flip the handler takes the target and its state from the
      store's slug-keyed view (3.3.c) and the branch from the link, and its advisory for an Integrating dependent from
      the same view (4.6.b), so abandon needs neither the remote nor a meta in this checkout; the composition stays the
      in-repo arm.
    - Today's path — the artifacts' removal staged in the abandoning checkout, the deferred `arc teardown <name>`
      (`planAbandon`), and the ROADMAP render — stays its in-repo arm.

    - Build `test-first` (one behavior at a time):
        - from the flip `arc abandon` proceeds through its handler with no remote in-flight expansion and no meta in the
          invoking checkout, a stub's included
        - from the flip `arc abandon` reports the advisory for an Integrating dependent with an edge to the origin, read
          from the view
        - a stub, a Planning, and an Active work unit each abandon through one batch with their lineage record
        - a paused work unit abandons, its pause ending with the primary
        - a dirty spawned checkout refuses before the batch; an anchored one is released with its changes kept
        - an adopted work branch is kept, and the abandon's result names it with its owner's two steps
        - a failed removal or reap after the batch names `arc teardown <slug>`, whose rerun finishes it
        - Integrating refuses

### `[ ]` **6.8 Retire park at the flip — § 8.9, § 2.2**

- _Goal:_ From the flip `arc park` refuses `unsupported`, naming `arc pause <slug> --reason <text>`, and park's
  machinery — the pointer record, the Planning landing and the evidence teardown accepts for it, the parked position,
  and park's legs of `arc resume` — is reached only through the in-repo arm.

    - `handlePark` (`handlers/lifecycle.ts`) refuses before both of its arms, `--land`'s direct call to
      `landParkPlanningTransition` included, and before `ParkCommandInputSchema`'s parse, whose refinement requires
      `--reason` or `--land`, so `runPark` (`verbs/park-resume.ts`), `composePointerRecord` (`pointer-record.ts`),
      `park-planning-landing.ts`, and `park-retirement-proof.ts` run only in the in-repo arm. Teardown reads the last
      two too, for its park-from-Planning evidence (`resolveParkProofTarget`, `verbs/teardown.ts`;
      `validateCommittedParkPlanningTransitionStrict` and the park proof in `git-retirement-authorization-context.ts`);
      from the flip teardown takes its evidence from placement or the lineage record (6.5), so those reads are its
      in-repo arm's as well.
    - From the flip no verb writes the parked position (`State: Active` placed in the backlog) and the import maps
      parked work to paused (§ 8.9), so its readers — `deriveState` (`lifecycle-resolver.ts`), `listParkedSlugs`,
      `lib/session-init/current-husk-advisory.ts`'s `park-planning` value, and the status and locus derivations — take
      no branch, and the deletion pass removes them.

    - Build `test-first` (one behavior at a time):
        - from the flip `arc park` refuses `unsupported`, naming the pause, with and without `--land`
        - the in-repo arm parks and resumes as today

### `[ ]` **6.9 Moves and retirement** — validate exit criterion at segment scope

- _Goal:_ The segment's exit criterion holds on a freshly merged base.

    - Merge base into the branch (append-only); run `npm ci` first if the merge changed `package-lock.json`.
    - Pause, hand over, materialize, and abandon one work unit, and tear down an archived and an abandoned one, over the
      reference backend and a scripted repository, and request `arc check segment`.
    - Confirm no ratchet floor grew.

## **Phase 7:** The task close verb

_Purpose:_ Close tasks through a verb that captures their commits, with the commit and its close at one fire site where
task commits route through the release wrapper.

_Mode:_ `slice` — closes on an increment committed and closed through `arc release commit --close`, its commits
captured to its task.

_Exit criterion:_ Over the reference backend and a scripted repository, `arc release commit --close` commits and
captures an increment's commits, a raw commit followed by `arc task close` captures the same, and each case Success
Criterion 8 names passes, the cases that rest on what Git does to a rewritten commit at the integration tier over real
repositories.

### `[ ]` **7.1 Add `arc task close` and `arc task defer` — § 9.1**

- _Goal:_ From the flip `arc task close [<ids>…] [--commit <sha>…]` closes the cursor's leaf or the named tasks,
  re-closing a closed one, cascading through parents, and records their captures and any matched exclusions' removal
  in one batch, captures only ever growing, while `arc task defer <id>` defers an open task with its open subtasks;
  before the flip both refuse `unsupported`, naming the hand `[x]` or `[~]`.

    - `[ ]` **7.1.a The verbs and their targets**

        - Register an `arc task` group in `src/cli.ts` with `close` and `defer`, their input schemas in
          `lifecycleCommandInputRegistrations` (`handlers/lifecycle.ts`), which `commandInputRegistrations`
          (`command-input-registrations.ts`) collects and the repository inventory test reconciles against every live
          option and operand, with their entries in that test's lists, as 3.4 gives its own.
        - With no IDs the close takes
          `resolveTaskListCursor`'s leaf (`lib/task-list/cursor.ts`), refusing where no task is open and naming a
          deferred task's close, `arc task close <id>`, or a new task; a named ID no task carries, or a task list that
          does not read, refuses, naming the IDs or the line.
        - Both check the pause first (task 6.2) and run in the work unit's checkout.

    - `[ ]` **7.1.b The writes**

        - Each task's marker goes through the task-list kind's `writeTaskMarker`; closing a parent closes its open
          subtasks, recording the captures against each, deferring a parent defers its open subtasks, and a parent the
          cascade closes — `[x]` when any subtask is `[x]`, `[~]` when all were deferred — records none of its own.
        - Subtasks are written before their parent: `writeTaskMarker` rescans after each write and throws on a
          malformed result, and the scanner rejects an open subtask beneath an `[x]` parent
          (`lib/task-list/scanner.ts`). The verb first scans the task list itself (`scanTaskListStructure`), since
          `writeTaskMarker`'s throws carry no line: a task list that does not scan refuses naming the line the scan
          reports, and an ID on other than one line refuses naming its lines, before any write lands; a throw the
          writer still raises becomes the verb's refusal with nothing written.
        - Captures go into the work item's links (`taskCaptures`) keyed by task ID, never removing one; every exclusion
          a named commit matches by SHA or copy key leaves the branch link; all of it lands in one batch.
        - `--commit <sha>` names commits instead of the default set (task 7.2), one per occurrence: a repeatable option
          its parser collects, never a variadic one, which would take the IDs after it. It combines with IDs and refuses
          a commit `HEAD` does not hold, its reachability read run with `--no-replace-objects` in Git's global position,
          as the set's walk is (task 2.3), so a replace ref cannot make a commit reachable or hide one.

    - Build `test-first` (one behavior at a time):
        - a bare close closes the cursor's leaf; named IDs close a set
        - a re-close adds a new commit and keeps every capture; one with nothing new changes nothing and says so
        - closing a parent closes its open subtasks with their captures; a cascade-closed parent records none
        - a deferral of a parent's last open subtask closes the parent, `[x]` where a subtask was already `[x]`
        - an explicit close of an excluded commit captures it and removes every exclusion it matches
        - `--commit` refuses a commit not reachable from `HEAD`, and, at the integration tier over a real repository,
          one a replace ref grafts onto `HEAD`'s history
        - deferring a parent defers its open subtasks, and a parent with a subtask already `[x]` closes `[x]`
        - `arc task defer` refuses a task that is not open
        - before the flip, both refuse `unsupported`

### `[ ]` **7.2 Capture the default set after refreshing base — § 9.2**

- _Goal:_ With no `--commit` the close refreshes base, captures the default set (task 2.3), and refuses — recording
  nothing — a set the refresh emptied that was not empty over the base refs held before it, naming the rerun for a task
  that produced no commit, while refusing on a detached checkout, an unlinked branch, or a work item with no link.

    - It reads the branch link whose ref the checkout has out through task 2.3.c's resolver, refusing on `detached` or
      `unlinked`, naming the work branch, and on `no-link`, naming `arc activate` for a Planning work item and, for an
      Active one, which the import leaves where a meta's `Branch` was empty or named base (task 5.7),
      `arc deactivate <slug>`, then `arc activate`, since activation moves only Planning to Active and deactivation
      keeps whatever link there is.
    - The emptied-set refusal names the commits the refresh found on base and `arc task close <id>` for the cursor's
      task or the IDs given; the rerun finds its set empty from the start and closes with no capture. A set the
      refresh only shrank closes as usual, and a failed fetch compares nothing.
    - The catch-up's remap is the history policy's (spec § 19), so the cases after ARC's own rewrite seed its output
      over the reference backend: each capture and exclusion keeps its old entry, with the new commit's SHA and copy key
      beside it.

    - The cases that rewrite or move commits — a rebase by hand, `git pull --rebase` — run at the integration tier over
      real repositories, as 2.3's do, since a scripted repository would pass them without showing what Git does.

    - Build `test-first` (one behavior at a time):
        - a default close after an explicit close of an earlier commit captures only the rest
        - after a rebase by hand that keeps diffs, on an adopted, a re-activated, and a created branch, the default
          capture takes only the increment's commits
        - after ARC's own catch-up, its remap seeded, the default capture takes only the increment's commits
        - a checkout behind its branch, and one that takes another machine's rebase with `git pull --rebase`, capture
          only their own new commits
        - a checkout that has not taken ARC's rewrite, its remap seeded, closes without capturing its old copies
        - a refresh that empties a set refuses with nothing recorded, and the rerun closes the task with no capture
        - a detached checkout, an unlinked branch, and a work item with no link each refuse, naming their repairs, a
          Planning and an Active work item with no link each naming its own

### `[ ]` **7.3 Give a rewritten copy to its original's task or the exclusions — § 9.2**

- _Goal:_ Before capturing, the default close compares each commit whose committer time differs from its author time,
  by its author half, with the captures and exclusions, giving one to each task holding a commit with that half, or to
  the exclusions, and the rest to the tasks it closes, all in its batch, its result naming each attribution and any
  task left with nothing.

    - Attribution runs on every default close, a re-close's included, which is how a rerun after an amend takes the
      amended commit; a set empty from the start closes its tasks with no capture and no report.
    - The cases that rewrite a commit — an amend, a rebase with or without its date options, a cherry-pick, a squash or
      fixup, a raw `git commit -C` — run at the integration tier over real repositories, as 2.3's do, since the
      residuals spec § 5.2 and § 9.2 state rest on what Git does to the author line and the diff.

    - Build `test-first` (one behavior at a time):
        - a hand amend, rebase, cherry-pick, and interactive squash or fixup of a captured commit go to its task, and of
          an excluded one to the exclusions, each named
        - where attribution places the whole set elsewhere, the result names the tasks closed as receiving nothing, with
          `arc task close <ids> --commit <sha>…`
        - after a message-only amend of the last closed increment the set is empty; after a content edit, the task's
          re-close adds the new commit and keeps every capture
        - a commit made fresh in a captured one's second goes to the task the close closes
        - a commit made with a raw `git commit -C` naming a captured one, since the wrapper refuses `-C` run
          non-interactively (`createCommitMessagePreflight`), goes to that commit's task
        - a rebase with `--committer-date-is-author-date` that changes a captured commit's diff reads as new, and the
          set omits one that keeps the diff; a rebase with `--ignore-date` reads as new
        - a copy whose stored patch half differs from the one computed goes to its original's task
        - a change reverted and made again in a later second than it was first made is captured
        - an Errand promoted at the scale floor keeps its commits in the default capture

### `[ ]` **7.4 Add `arc release commit --close` — § 9.3**

- _Goal:_ From the flip `arc release commit --close[=<ids>]` checks, before committing, the pause, a linked branch out,
  a base ref after the close's bounded fetch, and the tasks it would close, each refusal recorded in the release audit
  log, then commits and runs the close on the fetch's result, exiting 1 and naming `arc task close <ids>` where the
  close fails after the commit; before the flip `--close` refuses `unsupported`.

    - `handleReleaseCommit` (`handlers/release/commit-cli.ts`) strips `--close[=<ids>]` with `--no-wrap`, both read
      only as the argv's leading tokens, in either order — `stripNoWrap` reads only the first — and the IDs only
      through `=`, so a `--close` past git's first argument stays git's; the strip runs before `runReleaseCommit`.
    - The checks run inside `runReleaseCommit` (`handlers/release/commit.ts`) through an optional close dependency on
      `ReleaseCommitDeps` that only `handleReleaseCommit` supplies — delivery's fix-release caller
      (`handlers/delivery-review-fix-release-effects.ts`) omits it — after the message preflight returns `passed` or
      `pass-through` (`CommitMessagePreflightResult`), the second for a message git manages, and before the message
      snapshot and `git commit`, so a commit the interlock or the preflight refuses fetches nothing. The linked-branch
      check reads task 2.3.c's resolver, as the close does.
    - A failed check refuses through the audited refusal path as code 17, `close-precheck-failed`, its reason the
      check that failed, `unsupported` before the flip. In `lib/release/schema.ts`, `RefusalCodeSchema` takes it, a
      `close-precheck-failed` outcome carrying the check joins `AuditOutcomeSchema`, and an `AuditEntrySchema` arm
      pairs the two, as code 16 pairs `preflight-failed`; `RefusalIdentifier`, `REFUSAL_IDENTIFIERS`, and
      `AuthorizationDecision` (`lib/release/types.ts`), and `formatRefusal` (`lib/release/interlock-validation.ts`)
      take it too. Each refusal names the repair its check's section names, and nothing is committed.
    - The code's other sites move with it: the refusal-code domain in `__tests__/unit/release/schema.test.ts`, the
      identifier mapping in `__tests__/unit/release/audit-log.test.ts`, a code 17 case among `formatRefusal`'s
      three-line-shape cases (`__tests__/unit/release/interlock-validation.test.ts`), and the refusal codes and cascade
      in `handleReleaseCommit`'s and `commit.ts`'s docs. ADR-017 gains a dated amendment naming code 17, as its
      2026-07-14 amendment named 16; its decision text and ADR-018's, which name codes `10–14`, stay as written.
    - After git exits 0 the close runs on the check's fetch result. Where it then fails, the wrapper exits 1, its output
      naming the commit and carrying `arc task close <ids>` as a typed action (§ 16): a `Remedy`
      (`lib/store/refusal.ts`) with its argv beside the text, on `ReleaseCommitResult`, which the handler renders as a
      `Run:` line. It never names the wrapper, whose rerun finds nothing staged and may not pass `--allow-empty`.
    - QUICK-REFERENCE's refusal-code line gains code 17, in the installed copy and `QUICK-REFERENCE.template.md`, in
      the same commit.

    - Build `test-first` (one behavior at a time):
        - `--close` commits and captures the increment's commit to the cursor's task
        - a multi-commit split's close captures every commit of it
        - each pre-commit check refuses with code 17 and an audit entry, without committing: no linked branch, a named
          ID no task carries, no open task with no IDs, no base ref, a paused work unit
        - a Planning work item with no link refuses naming `arc activate`, and an Active one naming
          `arc deactivate <slug>`, then `arc activate`
        - `--close` and `--no-wrap` strip in either order, and a `--close` after git's first argument reaches git
        - a refusal the interlock or the message preflight makes runs no fetch, and a `pass-through` preflight runs the
          checks before committing
        - a close that fails after the commit exits 1 with `arc task close <ids>` as its typed action, and that rerun
          captures the commit
        - before the flip, `--close` refuses `unsupported` with code 17

### `[ ]` **7.5 Name the close and the deferral in `task-list.close`'s remedy — § 9.4**

- _Goal:_ `task-list.close` refuses a hand edit changing a task's marker to or from closed with remedy text naming the
  repair for that change: the close in both its forms for `[x]`, `arc task defer <id>` for `[ ]` to `[~]`, and a new
  task for any other change to a closed marker — as text, never an argv run as given.

    - `checkTaskListClose` (`lib/store/kinds/task-list/authority-rules.ts`) returns one broken rule however many
      markers an edit changes, so its one remedy text names each change's repair by the marker the edit wrote, grouped
      by the change, with the task IDs; a task line the edit adds already `[x]` or `[~]` takes the repair its marker
      names, as one from `[ ]` does.
    - The rule passes a verb's write (`writer.kind === "verb"`), which is how the close and the deferral write the
      markers it refuses by hand.

    - Build `test-first` (one behavior at a time):
        - a hand `[x]` names `arc release commit --close=<ids>` and the commit, then `arc task close <ids>`
        - a hand `[ ]` to `[~]` names `arc task defer <id>`
        - a hand change from `[x]` to `[~]` or `[ ]`, or from `[~]` to `[ ]`, says a closed task stays closed and
          corrective work takes a new task
        - one edit closing one task and deferring another names both repairs, each with its IDs
        - an added task line already `[x]` names the close, and one already `[~]` names the deferral

### `[ ]` **7.6 The task close verb** — validate exit criterion at segment scope

- _Goal:_ The segment's exit criterion holds on a freshly merged base.

    - Merge base into the branch (append-only); run `npm ci` first if the merge changed `package-lock.json`.
    - Commit and close one increment through `arc release commit --close`, and another by a raw commit and
      `arc task close`, over the reference backend and a scripted repository, and request `arc check segment`.
    - Confirm no ratchet floor grew, and that each remaining entry in this change's rerouted files sits in an in-repo
      arm.

## **Phase 8:** Verification

### `[ ]` **8.1 Complete verification** — load and follow `verify-work-unit.md`

---

## Success Criteria

- `[ ]` Every lifecycle test passes over the in-repo implementation, unchanged but for those a pre-flip fix, a setup
  chunk, or the removal function's porcelain and move changes alter, each named with its change.

- `[ ]` Each pre-flip fix has its test: the seed fix's four cold-start seeds and the spawning arm's refusal; the removal
  check refusing a dirty checkout before an abandon or a Planning park records anything; the workspace closing after
  the transition's records and a throw in the finalize writes leaving it in place; the removal function pruning a
  registration whose folder is gone; and activation refusing a work unit whose `Branch` names base, naming the remedy.

- `[ ]` Each rerouted verb's arm from the flip passes over the reference backend, writing the records the spec's § 2.2
  names, promotion's put and branch cut among them.

- `[ ]` At landing no `arc/store-raw-state`, `arc/surface-names`, or `arc/work-unit-paths` count in
  `eslint-suppressions.json` exceeds its count at the final merged base, in total or per file, but by the callers
  recorded when `completed-index.ts` joined the helper set; every remaining entry in the rerouted parts of the change's
  files sits in an in-repo arm; and `npm run -s lint:ts` passes with no suppression added for a new violation.

- `[ ]` `arc pause`, `arc resume`, `arc handover`, `arc set-class`, `arc task close`, `arc task defer`,
  `arc release commit --close`, `arc materialize` (its branchless arms included), and `arc base sync`'s detached arm
  pass on their success paths and on each refusal they name, and each verb starting at the flip refuses before it,
  naming the path that serves until then.

- `[ ]` Activation's arms pass: adoption from a spawned and from an anchored checkout, renaming the person's branch and
  recording it `adopted`, and keeping a name already in ARC's form; each refusal; the base arm; a linked branch keeping
  its name when `--type` names its type; and the old name's remote deletion as a typed action for a `created` link, as
  text after the merge where its remote-tracking ref holds commits `HEAD` lacks, and never for an adopted one; and
  adoption of a branch never pushed still refreshing base.

- `[ ]` A pause is honored: each verb that advances the work refuses on a paused work unit, naming `arc resume`, and
  each other write proceeds; deactivation keeps the branch; and a start of another person's stub records the starter as
  `Owner` and reports the previous owner.

- `[ ]` The close captures the right commits: every case in the spec's Success Criterion 8 passes — exclusions and
  explicit closes, rebases and sync, attribution of rewritten copies and each named residual, the copy key's stability
  under every pinned source, base refresh and the emptied-set refusal, `--close`'s checks, and the parent cascade.

- `[ ]` The reap keeps its rules: an abandon discards a created branch, an archive's teardown deletes one merge-safe, an
  adopted branch is kept and reported, and an added ref carrying commits of its own is kept and reported.

- `[ ]` The removal function and check return each of their outcomes, an anchored checkout's kept marker among them,
  and every move of a work unit's checkout this change runs or prints takes the doubled-force form.

- `[ ]` A promoted work item projects what a fresh start does; a stub's rename run from a checkout holding a transient
  role writes with no branch switch and no second change request; a rename leaves the branch link under its new name;
  and a spawn with no branch lands at its template's path and rolls back with no branch to delete, while an in-place
  start from a detached checkout leaves `HEAD` where it stood and a re-spawn over a hand-deleted checkout's registration
  clears it and proceeds.

- `[ ]` All quality gates pass (tests, linting, type checking)

- `[ ]` Off-branch spec-finalized repoint writes the spec Design, `generate-tasks`, and the begin-current-workflow
  action in one checked batch, preserving layered siblings; a refused batch leaves all three fields unchanged, the
  following stage advance is idempotent, and strict stage validation rejects a separate inconsistent tuple (A1).

- `[ ]` Terminal lineage preserves the removed primary's exact branch-link list and cleanup retries use it. Missing
  branch authority refuses, and repair restores the teardown continuation without branch-name inference (A2).

- `[ ]` Ready for integration
