# Task List: Projection Worktrees

- **Design:** `spec-projection-worktrees.md`

---

## **Phase 1:** Refresh, fan-out, and materialization

_Purpose:_ Keep every worktree's copy current — at each command's start, at a writer's fan-out, and in a full
materialization — at a cost that grows with what changed.

_Mode:_ `slice` — closes on the working copy end to end across worktrees: an edit in one reaches the store and every
sibling's copy, and a new worktree projects its layout.

_Exit criterion:_ Over the reference backend with real worktrees, a worktree marked for a work unit materializes the
layout the isolation test asserts; an edit in one worktree reaches every sibling's copy at the writer's fan-out, and a
pull's merges fan out; a deleted file returns at `arc sync`; a state version that no longer resolves rebuilds the
worktree; over the ref backend, twenty worktrees saving into refreshes, fan-outs, and file removals lose no save, a copy
whose path moved on kept and reported; and at this repository's size the no-change overhead, a full materialization, and
a one-file fan-out each stay within their bounds, and a ten-file fan-out within its bound but on Windows, where § 15.4
expects it to reach the bound.

_Design decisions:_ This list is the third of three members' that build one design (spec § 1.1, § 1.3), over
`projection-substrate`'s engine and `projection-write-back`'s write path, and tests run as theirs do (§ 1.5). The
rebuild on `state-unresolvable` (1.4.b) and the fan-out of `pull` and `push` (1.5) rest on `storage-ref-backend`'s
`pull`, `push`, and refusal (its Tasks 1.3 and 1.4), and the timing suite (1.10.a) and the multi-process lane (1.11) on
its `createRefStore` (its Task 3.1.a) and the `ARC_STORE_BURSTS` gate (its Task 18.1). The lane's bursts into a
removal's persist step wait for that step, in Phase 2 (2.7). Fan-out wraps only the store `createStore` returns; a move
or an import that bypasses it is caught at each worktree's next command start, since that start refreshes from the
index's state version.

### `[ ]` **1.1 Decide which checkouts hold a projection — § 2.5**

- _Goal:_ A worktree holds a projection when it holds an index, and gets one only when it is the primary or its
  work-unit marker names a work unit or a transient claim — an `arc start --here` checkout included — so ARC's machinery
  checkouts and unclaimed worktrees run with the projection off.

    - Read from the marker (`readWorktreeMarker`, `decodeWorktreeMarkerOwnership`, `lib/git/worktree-marker.ts`) and
      whether the checkout is the primary, which the reader `projection-substrate`'s Task 2.2.b builds answers with no
      Git call — the primary's Git directory holds no `commondir`, being the common one: a `current` ownership naming a
      work unit, or a transient subject whose provisioning is `ready`, counts; a `pending` provisioning, a `manual-only`
      ownership, a husk-stamped marker, and a subject naming a branch, as a decomposition worktree's does, get none.
    - A checkout with the projection off still fans out its writes to the machine's projections (1.5).
    - Build `test-first` (one behavior at a time):
        - the primary and a checkout whose marker names a work unit or a ready claim each get a projection
        - a primary whose `.git` is a `gitdir:` file, as `git init --separate-git-dir` makes it, gets a projection
        - a hand-made worktree with no marker, a decomposition worktree, and a claim still `pending` get none, and the
          engine's start there touches no projection file
        - a husk-stamped marker and a `manual-only` ownership get none

### `[ ]` **1.2 Read records through one source interface — § 14**

- _Goal:_ The engine reads records only through one source interface — `read`, `list`, `version`, and `changes` over
  the roots the source projects — which the store implements here, and a read-only source's files project protected.

    - Typed as `Pick<Store, "read" | "list" | "version" | "changes">` beside a descriptor of the source's name, the
      roots it projects, and whether it is read-only; the ref backend's `ReadOnlyStore` (`lib/store/contract.ts`, its
      Task 1.7) satisfies it, so a later read source plugs in unchanged. `history` and `lookup` are read from the
      writable store alone. Each source keeps its own state version in the index (`projection-substrate`'s Task 2.2.a).
      Only the store is built as a source here.
    - A read-only source's files are protected (`projection-write-back`'s Task 2.2), their notice naming the source, and
      write-back refuses an edit to one as a refused edit.
    - Build `test-first` (one behavior at a time):
        - the rights function (`projection-write-back`'s Task 2.1) answers protected for a file of a source marked
          read-only, naming the source
        - write-back refuses an edit to such a file as a refused edit naming the source
        - the store satisfies the interface with no adapter

### `[ ]` **1.3 Materialize a worktree in full, and rebuild one with no usable index — § 2.5, § 3.1**

- _Goal:_ A worktree with no projection gets every record written under the replace guard and adoption rules, and one
  whose index it cannot use is rebuilt writing over no file that might hold an edit, withholding and reporting each.

    - At a spawn, into a worktree that has none, and at `arc sync` (1.7). A spawn calls it once the marker is written —
      after `writeWorktreeOwnershipMarker` in `provisionSpawnedWorktree`
      (`lib/work-unit/mutators/reconcile-work-unit-worktree.ts`), and once `provisionTransientLocus`
      (`lib/locus/provisioning.ts`) marks a claim `ready` — before the worktree lock (`projection-substrate`'s Task
      4.1), through the materialize port the root hook binds into the engine's process state (`projection-write-back`'s
      Task 1.9.a), so neither mutator takes a store of its own. The root hook binds the port at every command, and
      before the flip the bound port returns at once, as every entry point does (`projection-write-back`'s Task 1.9.a);
      from it, a failure there is reported and the spawn completes, the worktree's first command materializing it. A
      spawn in a process whose root hook never ran — a script, or a test that binds nothing — finds the port unbound,
      and materializes and reports nothing, the worktree's first command materializing it.
    - It writes the clone's exclude entries (`projection-substrate`'s Task 1.1.b), then runs the guard
      (`projection-substrate`'s Task 1.2) before writing into any root, since on a fresh clone nothing ignores the
      shared roots until those entries exist, and creates the checkout's scratch folder,
      `.arc/user/<identity>/scratch/work-unit/<slug>/`, for the work unit its marker names.
    - With no usable index (`projection-substrate`'s Task 2.2.d): a file at a path the current projection lays a stored
      record at is refreshed only where its blob id, stamp aside, equals its stamp's, or, stampless, the stored
      content's; every other file under a projected root is left, written over by nothing, sent nowhere, and marked
      withheld in the new index, as is each aside copy the sweep (`projection-substrate`'s Task 3.3) returned as
      withheld. Files `projection-write-back`'s Task 2.8.c never adopts and `MACHINE_LOCAL_PATHS` entries are left
      alone. Deleting a withheld file releases it: pending where a record projects at its path, its entry gone
      otherwise. A rebuild with no usable index sets the changed mark (`projection-write-back`'s Task 2.11.a) on every
      file, since it cannot tell which the checkout changed, until the next `arc save`.
    - A listing that is not whole writes files only for the records it returns; a record listed only as a diagnostic
      projects no file and is reported.
    - Build `test-first` (one behavior at a time):
        - Integration tier, over the reference backend and a real linked worktree
        - a fresh worktree materializes every projected record at its layout path, stamped, and its scratch folder
        - a materialization failing at a spawn is reported, and the worktree's first command materializes it
        - a spawn before the flip, and one whose port is unbound, materialize nothing and report nothing
        - with the index deleted, an unedited file is refreshed and an edited one is withheld and reported
        - with the index deleted, `arc selection --changed` lists every projected Markdown file until `arc save`
        - with the index deleted, an aside copy the sweep withheld is recorded withheld in the new index
        - with the index deleted, a removal's aside copy the sweep linked back after a stop is withheld and reported
        - a withheld file, deleted by the person, is marked pending where a record projects at its path
        - a file of a source marked read-only projects protected, its notice naming the source (1.2)
        - a record listed only as a diagnostic projects no file and is reported

### `[ ]` **1.4 Refresh from the store's changes — § 15.2**

- _Goal:_ Each command's start brings its worktree up from the state version its index last projected, rewriting only
  the records `changes` names and the files marked pending, moving every file a primary record's change relocates, and
  rebuilding when that state version no longer resolves.

    - `[ ]` **1.4.a Reducing `changes`**

        - Refresh keeps each record's newest entry. An entry for a primary record — a meta, an Errand record, or a
          cohort document — re-lays every record its owner holds (`list` by `owner`, `ListInputSchema`,
          `lib/store/read.ts`), moving each file whose path changed by the removal swap and a write at the new path, an
          edit at the old path taken in first (`projection-substrate`'s Task 3.4), its changed mark
          (`projection-write-back`'s Task 2.11.a) moving with it. A meta's entry adds or removes its `current/` copy of
          each cohort document its `Cohort` names; an archive, an abandon, or an owner leaving the view removes the
          files.
        - A conflict-record entry refreshes the file of the record it names, or, for a removed conflict, the file the
          index maps it to — by its marker set, its notice line, or, for a conflict the file does not show, the file's
          entry (`projection-write-back`'s Tasks 1.4.b and 1.7.b). A conflicted file refreshes through the merge
          `projection-write-back`'s Task 1.8 builds, but for one holding a resolution in progress or a malformed set,
          which the replace guard holds whole (`projection-write-back`'s Task 1.4.b): the refresh leaves it unreplaced
          and records in its entry the open conflicts of the version it read.
        - Every file marked pending is refreshed too, and a pending file whose record has left this projection is
          removed by the rules of `projection-substrate`'s Task 3.4, so a removal a take-in deferred is retried.
        - Before a write into a root the guard runs only when an ignore file may have changed: the index's recorded
          existence, stat, and blob id of `.git/info/exclude` and each `.gitignore` on the path to the roots and the
          aside folder must match by the comparison `projection-substrate`'s Task 2.4.b builds, or the call runs
          (`projection-substrate`'s Task 1.2), and its pass records them again. Fan-out applies the same skip.
        - Build `test-first` (one behavior at a time):
            - a changed record rewrites only its file, and an unchanged one is not touched
            - a rename re-lays every file the owner holds, an edit at the old path taken in first
            - an archive removes the work item's files from `active/`
            - a cohort document's change rewrites its folder's file and each `current/` copy
            - a resolved conflict's markers or notice line leave its file
            - a withheld file the person deleted is written fresh from the store at the next command, and leaves
              `arc status`
            - a deferred removal whose edit lands at the next command's start is still removed by that command's refresh
            - a pending file whose record left the projection is removed at the next refresh
            - a file a stopped replacement left pending is rewritten at the next refresh, in `completed/` too
            - an edit refused at removal stays at its path through each refresh until resolved, then is removed
            - a removed file a sweep linked back is removed again at the next refresh
            - `arc save --resolve` on a withheld subject refuses naming 1.3's remedy, and resolves once the file is
              deleted and written fresh
            - a file a refresh skipped, then reverted to its base, stays pending and is replaced at the next refresh
            - a file holding a resolution in progress is left unreplaced by a refresh its record's change reaches, and
              takes the change once the resolution is sent
            - a file holding a malformed set is left unreplaced by a refresh, its entry recording the newer version's
              open conflicts, which `arc status` shows, and a removed conflict recorded there refreshes that file
            - the refresh's second index write leaves no pending mark on a file it put in place
            - an `arc status` whose own start refreshed files lists none of them as pending
            - a refused edit the person reverts to its base leaves `arc status` at the next command, which clears its
              refused mark and runs the refresh it was owed
            - an ignore file changed since the guard last passed runs the guard before the write
            - an ignore file's smudged record runs the guard at the next write into a root

    - `[ ]` **1.4.b A state version that no longer resolves**

        - When `changes` refuses `state-unresolvable` — naming a history ref, or naming none for a window short of the
          current state version past more than one end of an item (`spec-storage-ref-backend.md` § 4.6) — the command
          rebuilds from current state, pulling nothing: every projected record refreshed by the same rules, every index
          entry the state no longer holds handled as a removal (`projection-substrate`'s Task 3.4), pending marks and
          the replace guard applied, and the index taking the current state version. Write-back has already run, so no
          edit is lost.
        - A file is removed only on a complete listing, with nothing missed and no diagnostic, that no longer holds its
          record.
        - Build `test-first` (one behavior at a time):
            - a `changes` refusal of `state-unresolvable` rebuilds the worktree and loses no pending edit
            - a refusal naming no history ref rebuilds the same way, through the wrapping test store
              (`projection-write-back`'s Task 1.3)
            - a listing reporting `missed` removes nothing

### `[ ]` **1.5 Fan out from the store `createStore` builds — § 2.2, § 1.2**

- _Goal:_ Once a write or a pull's merges land, the writer brings every worktree on the machine that holds a projection
  up from that worktree's own state version, taking each one's projection lock in turn — and whatever fan-out misses,
  the next command's start refreshes.

    - `[ ]` **1.5.a The wrapper**

        - `withFanOut(store, deps)`, exported from `lib/store/projection/`, wraps a store once: `write` and `batch` fan
          out after a landed write, and `pull` and `push` after every call whatever the outcome, since a push runs pulls
          and a refused or timed-out sync may still have merged. `createStore` (`lib/store/create.ts`) applies it to the
          store it returns, beside the hook `projection-write-back`'s Task 2.4.c adds, recording that store's
          capability; tests apply it to the reference backend and `createRefStore`.
        - It is inert while `capabilities.stateOffBranch` is false. A write made under a projection lock fans out once
          that lock is released, and a command's start fans out once for all its write-backs; a write landing during a
          fan-out — a take-in in a sibling's refresh, a stub minted by adoption — joins that fan-out's next round rather
          than starting another; under `--skip-projection` nothing fans out (`projection-write-back`'s Task 2.9).
        - Build `test-first` (one behavior at a time):
            - a landed write fans out, and a refused one does not
            - a `pull` reported `failed` after merging still fans out
            - a write made under the start's lock fans out once, after release
            - a take-in during a sibling's refresh fans out in the same fan-out's next round
            - over the in-repo implementation, a write fans out nothing and makes no Git call

    - `[ ]` **1.5.b One fan-out**

        - One `scanRegisteredWorktrees` call (`lib/git/worktree-roster.ts`) lists the machine's worktrees, detached ones
          included; each one's Git directory is read from its roster path's `.git` (`projection-substrate`'s Task 2.2.b)
          — a path holding none, as Git lists a primary whose `.git` is a `gitdir:` file at its Git directory, or whose
          aside folder holds no reference stamp (`projection-substrate`'s Task 2.4), as Git lists such a primary at that
          directory's parent where it is named `.git`, is skipped with no Git call, that checkout refreshing at its own
          next command — and each holding a projection has its index read for its state version, then one `version()`
          call and one `changes` call per distinct state version. The writer's own worktree is found from its own root,
          never from the roster, whose entry for its Git directory it skips. Under each worktree's lock, held past 200
          ms by another — the writer's own worktree included — skipped, its index is read again, and the worktree
          skipped when its state version moved, when it is already current, when its state version no longer resolves,
          or when its index is unusable or of another format version. A lease lost while it works in a worktree skips
          that worktree from its next step, and the fan-out goes on (`projection-substrate`'s Task 2.3). A step hook
          before each worktree it visits lets the multi-process lane (1.11) place a save there.
        - Each worktree is laid out under the view setting, identity, checkout claim, and `layout.active` its index
          records; a change to any of them is reprojected at that worktree's own next command (1.6). A primary entry's
          re-lay lists its owner's records once per fan-out, and each worktree's refresh reads `history` through the
          command's memo in the engine's process state (`projection-substrate`'s Task 2.6, `projection-write-back`'s
          Task 1.9.a), one call per record across the fan-out.
        - A verb's write marks its own checkout: the fan-out's refresh of the writer's own worktree sets the changed
          mark (`projection-write-back`'s Task 2.11.a) on each file of a record the writer's own write landed, and no
          sibling's; a refresh that only rewrites a file, from a sibling's write or a pull, sets none, and a verb
          writing for another checkout, as graduation does into a spawned worktree, marks nothing there.
        - Build `test-first` (one behavior at a time):
            - Integration tier, over the reference backend and real linked worktrees
            - an edit written back in one worktree reaches the other worktrees' copies
            - a write from a checkout with the projection off (1.1) reaches a sibling's projection
            - a pull's merges reach every worktree
            - two worktrees refreshing one conflicted record read its `history` once
            - a worktree another refresh brought up first is skipped
            - a worktree whose lock is held past 200 ms is skipped and refreshes at its own next command
            - a worktree whose lease is lost mid-refresh is skipped, the fan-out going on, and refreshes at its own next
              command
            - a worktree with an older index format is skipped and refreshes at its own next command
            - a primary made by `git init --separate-git-dir`, which Git lists at its Git directory, is skipped, nothing
              written under that directory, and refreshes at its own next command
            - a primary whose separate Git directory is named `.git`, which Git lists at that directory's parent, is
              skipped, nothing written in that parent
            - a writer that is such a primary refreshes its own worktree
            - a sibling with the `all` view takes another person's new work unit, and one with `mine` does not
            - `arc save`'s writes reach the other worktrees' copies
            - a verb's write marks its record's file changed in the writer's checkout and in no sibling's, and a pull's
              merges mark nothing
            - a process whose root hook bound no ports fans out nothing, each sibling refreshing at its next command
            - a write made under `--skip-projection` reaches no sibling until that sibling's next command

### `[ ]` **1.6 Reproject on a changed view setting, identity, claim, or layout — § 10.4, § 10.3**

- _Goal:_ A command that reads a view setting, identity, checkout claim, or `layout.active` different from the one its
  index recorded reprojects what it governs — views added, files leaving a view by the removal path, the personal roots
  following the identity, and `current/`, its scratch folder, and owning-checkout notices following the claim or layout.

    - A release, a promotion, or a materialize changes the marker without a store write, so the comparison against the
      index's recorded claim is what catches it.
    - A file of the old claim's work item at a path the new one's also projects at — a path-keyed companion — is removed
      by the removal path, its edit taken in against its own record, and the next refresh lays the new file there
      (`projection-substrate`'s Tasks 3.2.b and 3.4).
    - Build `test-first` (one behavior at a time):
        - switching the view from `mine` to `all` adds the other in-flight work items
        - switching back removes them, an edit there taken in first
        - a changed claim re-lays `current/` to the newly named work item and creates its scratch folder
        - a save placed by the after-re-check hook of `projection-substrate`'s Task 3.2.b at a path both claims' work
          items project at is taken in against the leaving record, and the next command lays the arriving file there
        - a changed identity re-lays the personal roots under the new identity
        - setting `layout.active: flat` moves `current/`'s files to `active/`'s top level
        - `arc save --resolve` on a conflict whose subject projects in no file here resolves once a changed view lays
          its file

### `[ ]` **1.7 Rebuild deleted files at `arc sync` — § 2.4**

- _Goal:_ `arc sync` rebuilds every deleted projected file as a full materialization, from the flip.

    - From the flip the top-level `arc sync` command (`cli.ts`, `handleSync` in `handlers/sync.ts`) runs a full
      materialization (1.3) of its worktree once its identity and ARC root resolve and before its network steps, so an
      offline sync still rebuilds; with no identity, its existing refusal (`IDENTITY_MISSING`, `resolveUserIdentity` in
      `handlers/shared.ts`, over the same `resolveIdentity`) names `arc.identity` first, and nothing is rebuilt;
      `--dry-run` skips it. Its handler takes the command's store, as `arc save`'s does (`projection-write-back`'s Task
      1.10). With a usable index the materialization rebuilds each absent file by the link alone
      (`projection-substrate`'s Task 3.4), replaces by the swap (`projection-substrate`'s Task 3.2) each file
      `projection-substrate`'s Task 3.1 reads as deleted — an empty stamped Markdown file at least 50 ms old, or a
      symbolic link at a path the index lists — and leaves every other present file to the refresh. A rebuild that fails
      is reported and the sync goes on to its network steps, and `--skip-projection` skips it (`projection-write-back`'s
      Task 2.9). Its existing steps stay as they are, for `storage-cutover` to rewire onto `pull` and `push`. Before the
      flip it runs as today.
    - Build `test-first` (one behavior at a time):
        - Integration tier, through `arc sync`'s handler over the reference backend
        - a deleted projected file returns at `arc sync`, and an edited one keeps its edit
        - with the fetch failing, a deleted projected file still returns
        - a present, unchanged file is not rewritten, and `--dry-run` rebuilds nothing
        - with no identity, `arc sync` refuses naming `arc.identity` and rebuilds nothing
        - an emptied projected Markdown file at least 50 ms old, and a symbolic link at a projected path, are replaced
          at `arc sync`
        - a rebuild that fails is reported, and the sync still runs its network steps
        - `arc sync --skip-projection` rebuilds nothing

### `[ ]` **1.8 Hold the `.worktreeinclude` copy off the projection's paths — § 11.6**

- _Goal:_ A new linked worktree takes none of the primary's projected files through `.worktreeinclude`, so the
  projection fills them itself.

    - `copyWorktreeIncludes` (`lib/git/worktree-include.ts`), run at every spawn through `setupLinkedWorktree`
      (`lib/git/linked-worktree-setup.ts`), already copies nothing under `.arc/` (`isArcPath`), which keeps out every
      projected root and `.arc/system/.local/`; a regression test holds it.
    - Build `test-first` (one behavior at a time):
        - with a broad pattern, the primary's `active/current/` and `.arc/system/.local/` files are not copied, and an
          `.env` file still is

### `[ ]` **1.9 The isolation invariant and its test — § 10.5**

- _Goal:_ An integration test holds "`active/current/` holds only this checkout's work item": a worktree spawned for a
  work unit holds exactly that work unit's files and a copy of each cohort document it names in `active/current/`,
  exactly the selected views in `active/in-flight/`, and nothing else at `active/`'s top level.

    - Over the reference backend: a linked worktree created from base and marked for a work unit as a spawn marks it,
      then materialized (1.3); it asserts the layout the documentation states and adds no guard on today's flat layout.
      `storage-cutover`'s documentation pass rewrites the strategy's acceptance test to match.

### `[ ]` **1.10 The no-change budget and the tripwires — § 15.3, § 15.4, § 15.5**

- _Goal:_ A command with nothing changed spends at most 10 ms on Linux and 60 ms on Windows in the projection, its two
  Git calls started together with the stat walk, and each tripwire shows only when the median of its recent
  measurements crosses its bound.

- **Additional Context:** `notes-projection-worktrees.md` § Spike 2, § Tripwire timings

    - `[ ]` **1.10.a The start's cost**

        - The start's two Git calls — the store's `version()` and the one configuration read (`projection-substrate`'s
          Task 2.5.b) — start together with the stat walk. No folder-time cache.
        - A timing suite under `store/projection/`, run where `ARC_STORE_BURSTS` is set, times the no-change start over
          `createRefStore` in a prepared repository (`__tests__/helpers/prepared-repository.ts`) at this repository's
          size — about 800 projected files — taking the median of eleven runs. It reports its medians rather than
          asserting the budget, since hosted runners' timing varies; a dispatched run of the portability pair and one of
          the Linux `portability` job record them in `notes-projection-worktrees.md`, read against the budget at 1.12
          and at verification.
        - The same suite times, over `createRefStore` with the same median, a one-file and a ten-file write's fan-out
          into 20 linked worktrees and a full materialization at this repository's size, reporting each against its
          tripwire's bound (1.10.b), and the same runs record them.

    - `[ ]` **1.10.b The tripwires**

        - The index keeps the last nine measurements of the command start, each fan-out (store reads included), and each
          full materialization (`projection-substrate`'s Task 2.2.a), written by the index write each command makes. A
          fan-out's time goes into the writer's own worktree's index at its end, under the lock the end takes again
          (`projection-write-back`'s Task 1.9.a); a writer with no projection records none. Each shows in the command's
          report (`projection-write-back`'s Task 1.9.b) and in `arc status` when its median crosses 20 ms / 120 ms, 100
          ms / 600 ms, or 1 s / 5 s on Linux and macOS / Windows.
        - Build `test-first` (one behavior at a time):
            - one slow measurement shows nothing, and a median past the bound shows its tripwire
            - a tenth measurement drops the oldest
            - measurements are kept per worktree in its index, a fan-out's in the writer's at its end

### `[ ]` **1.11 Hold saves through bursts across processes — § 1.5**

- _Goal:_ Twenty worktrees of one clone, each a separate process over the ref backend, saving into refreshes, fan-outs,
  and file removals at once, lose no save and no write.

    - A store suite, `__tests__/integration/store-ref-projection-bursts.test.ts`, run only where `ARC_STORE_BURSTS` is
      `"1"` (`describe.skipIf`), as `storage-ref-backend`'s bursts are (its Task 18.1), with a per-test timeout above
      the Windows bursts' 401 s. It registers where those bursts do: in Vitest's `integration-bursts` project and out of
      the plain integration project (`vitest.config.ts`, beside `burstTest`), in the portability tier's
      `PORTABILITY_SUITES` (`lib/local-vitest-runner.ts`), and in the `ARC_STORE_BURSTS` environment entry of
      `__tests__/reach/store-suites.json`, whose `store-ref-*.test.ts` glob already selects it by reach. The ref
      backend's Windows separate-layout publishing burst stays skipped until `storage-ref-hardening`, so the Windows run
      covers the default layout.
    - Each worktree runs the engine's start and end over `createRefStore` in a child process from a writer fixture of
      its own, built the way the ref backend's bursts start theirs (`startRefWriter`,
      `__tests__/helpers/store/ref-process.ts`, over `__tests__/fixtures/store/ref-process-writer.ts`) and as
      `personal-lock-holder.ts` (`__tests__/helpers/store/`) runs one, in a repository from `prepared-repository.ts`.
      The processes line up across process boundaries: a child reaching a step hook prints the hook's name on stdout and
      waits for the parent's release line on stdin, as that helper's `READY` and release do; the hooks are the three of
      `projection-substrate`'s Task 3.2.b and each worktree a fan-out visits (1.5.b), so saves land inside another's
      replacement, fan-out, and file removal (`projection-substrate`'s Task 3.4). The suite requires every save to reach
      the store, stay in its file, pending or reported, or stay in an aside copy — pending for the next sweep, or kept
      because its path moved on, reported with its path (`projection-substrate`'s Task 3.2.a) — and fails a run whose
      processes never reached each hook.
    - Passes in one dispatched run of the portability pair and one of the Linux `portability` job, each recorded in
      this task's completion note.

### `[ ]` **1.12 The working copy across worktrees** — validate exit criterion at segment scope

- _Goal:_ The segment's exit criterion holds across real worktrees on a freshly merged base.

    - Merge base into the branch (append-only); run `npm ci` first if the merge changed `package-lock.json`.
    - Over the reference backend in one scripted repository with linked worktrees, run the exit criterion's scenario —
      materialize, an edit's fan-out, a pull's fan-out, `arc sync` after a delete, a rebuild on `state-unresolvable` —
      confirm 1.10.a's recorded medians — the no-change start within budget, a full materialization and a one-file
      fan-out within their tripwires' bounds on every platform, and a ten-file fan-out within its bound on Linux and
      macOS, its Windows median read against the bound (§ 15.4) — confirm 1.11's recorded runs, and request
      `arc check segment`.

## **Phase 2:** Worktrees — the removal slots and the release step

_Purpose:_ Fill the removal function's three projection slots so ARC removes or releases a checkout only after its
edits persist, and give every worktree its own user surfaces.

_Mode:_ `slice` — closes on ARC removing or releasing a projected checkout only after its edits persist.

_Exit criterion:_ Over the reference backend, the removal check answers `persist-would-refuse` for each state an edit
could lose and `unobservable` for a failed read, the persist and release steps refuse over each and succeed once it is
resolved or, for an aside copy kept because its path moved on, deleted, and teardown through its store-backed context
persists, then removes; and over the ref backend, twenty worktrees saving into removals' persist steps lose no save but
for § 17's residuals.

_Design decisions:_ The removal check, the removal function, the release, and the slot type (`checkWorktreeRemoval`,
`removeWorktreeCheckout`, `releaseWorktreeCheckout`, `ProjectionRemovalSlots`, `lib/git/worktree-removal.ts`) are
`seam-lifecycle`'s, on base when this work unit starts, and the worktree lock is live by then, landing with
`projection-substrate` (its Phase 4). This phase fills the slots in `lib/store/projection/` and binds them, at the
bindings `seam-locus` composes — the sweeps, the Errand exits, and `arc locus release` (its Tasks 1.5, 1.6, and 2.9.b) —
and beside its missing-folder remedy (its Tasks 1.5.c and 1.7.b).

### `[ ]` **2.1 The removal check's projection part — § 12.2**

- _Goal:_ The `check` slot, reading only and taking no lock, answers `would-refuse` with a remedy for every state an
  edit could lose, `unobservable` with its detail when a read it needs fails, and `passes` otherwise — so no failed read
  ever reads as `persist-would-refuse`.

    - `would-refuse` for a file adoption would refuse (`projection-write-back`'s Task 2.8), read through the verdict of
      `projection-write-back`'s Task 2.8.b without minting, one held by a conflict (`projection-write-back`'s Tasks 1.4
      and 1.5), failing to parse, or holding a refused edit, an aside copy whose edit is refused or clashes in the
      checkout (`projection-substrate`'s Task 3.2.c), or that holds an edit once its path has moved on
      (`projection-substrate`'s Task 3.2.a), a file or aside copy withheld (1.3), or a file or aside copy not yet
      settled (`projection-substrate`'s Task 3.1); and for a checkout 1.1 gives a projection, or that holds an index,
      with no identity (`projection-substrate`'s Task 2.5.b), naming the remedy that sets `arc.identity`. It runs
      write-back's read path over each changed file in every projected root, `completed/` included, and each settled
      aside copy — the settle rule, the edit rights (`projection-write-back`'s Task 2.1) with a read-only source's
      protection (1.2), the parser, the store's merge in the checkout, the write check with the views of
      `projection-write-back`'s Task 1.2, and `checkSerializationRules` (`lib/store/`, `storage-ref-backend`'s Task 5.1)
      — rather than trust the index's refused mark (`projection-substrate`'s Task 2.2.a), so an edit made since the last
      command and a refusal since reverted both read true. The aside copies read as `projection-substrate`'s Task 3.2.a
      states, as the persist step's takeover reads them: in the order their swaps were made (`projection-substrate`'s
      Task 2.2.a), each read with the record that a write-back has been sent since its swap set wherever an earlier copy
      of its path would be taken in. A symbolic link is never read and refuses nothing (`projection-write-back`'s Task
      2.8.c).
    - `unobservable` for a missing, unreadable, or other-format index (`projection-substrate`'s Task 2.2.d), its detail
      naming the remedy — run the removal or release from that checkout; for a projected file that cannot be read; and
      for a store read refusing `namespace-corrupt`, `identity-mismatch`, or `state-unresolvable`, its detail carrying
      the refusal's own remedy.
    - A checkout 1.1 gives no projection and that holds no index answers `passes`, before the identity is consulted; one
      that holds an index anyway is checked as any other.
    - Build `test-first` (one behavior at a time):
        - Integration tier, over the reference backend and real linked worktrees
        - each would-refuse state answers `would-refuse` with its remedy, and `passes` once it is resolved
        - an edit to a protected file, another person's archived file, or a read-only source's file, made since the
          last command, answers `would-refuse`
        - a new file adoption would place answers `passes`, and one it would refuse answers `would-refuse`
        - a refused edit reverted to its base answers `passes`
        - a drawing's aside copy a failed command left, its markers since resolved, answers `passes`
        - an aside copy holding an edit whose path has moved on answers `would-refuse` naming the copy's path, and
          `passes` once it is deleted
        - two copies of one absent path, both holding edits, answer `would-refuse` for the newer, as the persist step,
          taking the older in first, refuses over it
        - a symbolic link in a projected root, at a path the index lists or not, answers `passes`, its target unread
        - an unusable index answers `unobservable` naming the checkout to run from, and `passes` once a command run
          there rebuilds it
        - a projected file that cannot be read answers `unobservable`
        - a store read refusing `state-unresolvable` answers `unobservable` with its remedy, never `would-refuse`
        - a checkout with no projection answers `passes`, with no identity configured too
        - a claimed checkout whose index was deleted answers `unobservable`, never `passes`
        - an unclaimed checkout that still holds an index is checked as any other, never passed
        - the check writes nothing and takes no lock

### `[ ]` **2.2 The persist step — § 12.2**

- _Goal:_ The `persist` slot writes back every edit in the target checkout under its projection lock, every projected
  root included, takes over every settled aside copy, and refuses with the blocking file's remedy rather than let a
  removal drop an edit — releasing the lock before it returns.

    - Under the target's projection lock, waiting the default bound and refusing on timeout naming the holder and a
      retry, and refusing with a retry where the lock's lease is lost while the step runs (`projection-substrate`'s Task
      2.3): write back every edit under `write-back`, each file its own write, waiting through the settle rule; refuse
      where any file stays unadopted, held by a conflict, failing to parse, holding a refused edit, withheld, not yet
      settled, or pending after `lock-held`, the file keeping its content. A symbolic link, at a path the index lists or
      not, is never adopted and refuses nothing (`projection-write-back`'s Task 2.8.c). Then take over every aside copy,
      in the order their swaps were made (`projection-substrate`'s Task 2.2.a), its writer live or not, once it has
      settled, as `projection-substrate`'s Task 3.2.a states — an edit taken in only while its path has not moved on —
      deleting it through the deletion `projection-substrate`'s Task 2.8 builds, which clears the in-progress record
      naming it and its own record; a refused or unparseable copy is kept and refuses; a copy holding an edit once its
      path has moved on is kept and refuses, naming the copy's path and the remedy of copying out what it holds and
      deleting it; a copy whose edit clashes in the checkout is kept and refuses as held by a conflict; a withheld one
      is left and refuses; one that does not settle, or whose edit write-back defers or leaves pending, is kept and
      refuses with a retry. Then check every projected file and the aside folder once more against the index by the racy
      rule, and walk the projected roots' folders again for files the index does not hold, writing back, adopting, or
      taking over whatever changed or appeared since, at most three passes, refusing with a retry where something still
      changes. A missing history ref is pulled and retried once (`projection-write-back`'s Task 2.3). An unusable index
      refuses (`projection-substrate`'s Task 2.2.d). Release the lock, then the writes fan out.
    - Under `--skip-projection` the step runs as without it (`projection-write-back`'s Task 2.9). A checkout 1.1 gives
      no projection and that holds no index returns at once, before the identity is consulted; on any other, with no
      identity (`projection-substrate`'s Task 2.5.b) the step refuses naming the remedy that sets `arc.identity`.
    - A step hook before it takes over each aside copy, and one before its last check, let the multi-process lane (2.7)
      place a save there.
    - Build `test-first` (one behavior at a time):
        - Integration tier, through teardown's store-backed context (`createStoreTeardownContext`,
          `lib/work-unit/store-teardown-context.ts`) over the reference backend, the slots injected into it until 2.4.b
          binds them
        - teardown persists a pending edit, then removes the checkout
        - a refused edit reverted to its base persists nothing and lets the removal proceed
        - each held state refuses the persist with its remedy, and the removal proceeds once it is resolved
        - an aside copy left by a live writer is taken over once settled
        - an aside copy whose take-in answers `pending` is kept and refuses with a retry
        - a save landing after write-back read its file, before the lock is released, is taken in by the last check
        - a new file created after write-back's walk, before the lock is released, is found by the last check and
          adopted
        - a file still changing through the last check's three passes refuses with a retry, and the retry removes the
          checkout once it settles
        - with no identity the step refuses naming the remedy, and once `arc.identity` is set the removal proceeds
        - a checkout with no projection is removed with no identity configured
        - an unclaimed checkout that still holds an index has its edits persisted, never returning at once
        - a lock held past its bound refuses naming the holder, and the retry removes the checkout
        - a lease lost mid-step refuses with a retry, and the retry removes the checkout
        - a drawing's aside copy a failed command left, its markers since resolved, is taken over as no edit, and
          teardown removes the checkout
        - an aside copy holding an edit whose path has moved on refuses naming its path and remedy, and the removal
          proceeds once it is deleted
        - of two copies of one absent path, the older is taken in and the newer, recorded as sent since by that take-in,
          is kept and refuses
        - a symbolic link in a projected root, at a path the index lists or not, lets the removal proceed, its target
          unread
        - an unusable index refuses naming the checkout to run from, and the removal proceeds once a command run there
          rebuilds it
        - a missing history ref is pulled through the wrapping test store (`projection-write-back`'s Task 1.3) and the
          retry lands
        - teardown under `--skip-projection` still persists the checkout's edits before removing it
        - the step returns with the lock released, so its own fan-out runs

### `[ ]` **2.3 The release step — § 12.3**

- _Goal:_ On every path that releases a checkout rather than removing it — teardown, abandon, and `arc locus release`
  of an anchored checkout — the `release` slot persists every edit as the persist step does and, on a linked checkout,
  removes its projection, refusing where an edit would go back as a refused edit.

    - A checkout 1.1 gives no projection and that holds no index returns at once, before the identity is consulted, as
      2.2's does. Otherwise, under the target's projection lock: write back, take over aside copies, and run the last
      check as 2.2 does, refusing on the same conditions; then, on a linked checkout, remove each projected file by the
      removal swap (`projection-substrate`'s Task 3.4), refusing with the edit's remedy where an edit goes back to its
      path as a refused edit, as held by a conflict where its take-in answers `clashed`, and with a retry where it
      answers `deferred` or `pending`, then the aside folder and the index. The primary — decided by the reader of
      `projection-substrate`'s Task 2.2.b, as 1.1 decides it, never by the `isPrimary` the release
      (`releaseWorktreeCheckout`) passes, which compares the checkout with the primary path its caller supplies — keeps
      its projection. A caller failing after the step leaves the marker, and the next command projects again.
    - Build `test-first` (one behavior at a time):
        - Integration tier, through teardown's store-backed context over the reference backend, the slots injected
          until 2.4.b binds them
        - releasing an anchored linked checkout persists its edits and leaves it with no projection, its uncommitted Git
          changes intact
        - the primary's release keeps its projection
        - releasing a primary made by `git init --separate-git-dir`, passed `isPrimary` false, keeps its projection
        - each held state refuses the release with its remedy, the marker staying, and the release succeeds once it is
          resolved
        - a lease lost mid-step refuses the release with a retry, the marker staying, and the retry releases it
        - a symbolic link in a projected root refuses no release, its target unread and untouched
        - a lock held past its bound refuses naming the holder, and the retry succeeds
        - an unusable index refuses naming the checkout to run from, and the release succeeds once a command run there
          rebuilds it
        - with no identity the release refuses naming the remedy, and once `arc.identity` is set it succeeds
        - a checkout with no projection is released with no identity configured
        - a new file created after the release's write-back walk is found by its last check and adopted
        - a removal swap whose take-in answers `pending` refuses the release with a retry, the file kept
        - a removal swap whose edit is refused links the file back and refuses the release with the edit's remedy, the
          marker staying, and the release succeeds once the edit is resolved
        - a removal swap whose take-in answers `clashed` refuses the release as held by a conflict, the marker staying,
          and the release succeeds once the clash is resolved
        - the primary's release takes over an aside copy and clears the in-progress record naming it and the copy's own
          record
        - an aside copy kept because its path moved on refuses the release naming its path, the marker staying, and the
          release succeeds once it is deleted

### `[ ]` **2.4 Bind the slots where the removal function's callers are composed — § 12.2**

- _Goal:_ Every production caller of the removal check, the removal function, and the release takes the projection's
  three slots, so none falls back to the passing defaults once the capability is on.

    - `[ ]` **2.4.a The callers on the merged base**

        - On the merged base, list every production construction of a context carrying `projectionRemovalSlots`, a
          `removal` option, or a removal `check`, and every direct call of the removal check, the removal function, the
          release, `checkRetiringCheckout`, and `clearMissingWorktreeRegistrations`; record the list in this task's
          completion note. A caller absent from 2.4.b and 2.4.c is bound with them.

    - `[ ]` **2.4.b Lifecycle's contexts**

        - One factory in `lib/store/projection/` returns the slots for a checkout's store; it is bound where each
          context is composed: the store-backed teardown and abandon context (`createStoreTeardownContext`) and the
          abandon handler (`handlers/abandon-store.ts`); the teardown, abandon, and park contexts the lifecycle handlers
          build (`handlers/lifecycle.ts`), their `removal` option taking the slots' `check`; and the reconcile context
          wherever `reconcileWorkUnitWorktree` is called — the executor context (`lib/work-unit/executor-context.ts`),
          `arc start` (`commands/start.ts`, `commands/start-store.ts`), and `arc rename` (`commands/rename.ts`,
          `commands/rename-store.ts`).
        - Over the in-repo implementation the slots pass, so binding them changes nothing before the flip.
        - Build `test-first` (one behavior at a time):
            - a test over each production context asserts it carries the projection's slots, not the passing defaults
            - over the reference backend, teardown through the store-backed context refuses over a refused edit

    - `[ ]` **2.4.c The sweeps, the Errand exits, and `arc locus release`**

        - The field `seam-locus` adds, `projectionRemovalSlots`, is bound in `handleSessionInitStatus`
          (`handlers/status.ts`) on `RunStaleWorktreeSweepOptions` and `RunBranchGoneRecoveryOptions` — the stale sweep
          passing its own to the residue sweep it runs; on the Errand runtimes' options in `handlers/errand.ts`, which
          carry it into `SettleTerminalOccupancyOptions` (`lib/errand/terminal-occupancy.ts`) and the leave's
          authorization; and on `arc locus release`'s handler context. The decisions read its `check`, and the exits
          and the release pass it whole as `slots`.
        - Build `test-first` (one behavior at a time):
            - each of the three compositions carries the projection's slots, not the passing defaults

### `[ ]` **2.5 The user surfaces in every worktree — § 12.8**

- _Goal:_ Under the capability every worktree holds its own copy of the identity's personal records, `USER-INBOX` and
  `WORKING-MEMORY` among them, read through the store and never through `lib/user-surfaces.ts`'s resolver.

    - The projection reads none of them through the resolver; the in-repo implementation keeps it
      (`lib/store/in-repo/personal-paths.ts`), teardown keeps merging a linked copy up (`lib/user-surface-migration.ts`)
      until the flip, the seam's members move their own callers off it, and `storage-cutover`'s deletion pass removes
      both with the in-repo arms.
    - Build `test-first` (one behavior at a time):
        - over the reference backend, a linked worktree's `USER-INBOX` is its own projected copy, and an edit there
          reaches the primary's copy at fan-out
        - no module under `lib/store/projection/` imports `lib/user-surfaces.ts` or `lib/user-surface-migration.ts`

### `[ ]` **2.6 Machine-local paths under `.arc/system/.internal/` — § 12.9**

- _Goal:_ The registry lists every machine-local file under `.arc/system/` by name, so a source projecting
  `.arc/system/` leaves them alone.

    - `MACHINE_LOCAL_PATHS` gains, under the `checkout` root (`projection-substrate`'s Task 2.2.c),
      `.arc/system/.internal/worktree-marker.json`, `.arc/system/.internal/pristine.json`, and
      `.arc/system/.internal/schemas/**`, each by name, never all of `.internal/`.
    - Build `test-first` (one behavior at a time):
        - each of the three entries is machine-local, and a tracked file beside them under `.internal/` is not

### `[ ]` **2.7 Hold saves through bursts into a removal's persist step — § 1.5**

- _Goal:_ Twenty worktrees of one clone, each a separate process over the ref backend, saving while their checkouts are
  persisted for removal, lose no save.

    - 1.11's suite gains the persist step (2.2), bound through teardown's store-backed context (2.4.b): its processes
      save into another's persist step, lined up by the same stdout and stdin protocol at 1.11's hooks and at 2.2's,
      before it takes over an aside copy and before its last check. Every save placed before the target's last check
      reaches the store, or stays in its file or in an aside copy — pending, refusing with a retry, or kept because its
      path moved on, reported with its path — and refuses the removal; the suite places none at the target's own fan-out
      visit after its persist step, where a save goes with the checkout (§ 17).
    - Passes in one dispatched run of the portability pair and one of the Linux `portability` job, each recorded in
      this task's completion note.

### `[ ]` **2.8 Removal after persist** — validate exit criterion at segment scope

- _Goal:_ The segment's exit criterion holds on a freshly merged base, the slots bound behind the live lock.

    - Merge base into the branch (append-only); run `npm ci` first if the merge changed `package-lock.json`.
    - Over the reference backend, run the removal check, the persist step, and the release over each held state and its
      repair, then teardown through its store-backed context; confirm 2.7's recorded runs.
    - On the branch head, dispatch the portability pair with `run_portability_pair: true` and the Linux `portability`
      job, and record both runs in this task's completion note, so the final engine has Windows and macOS evidence.
      Request `arc check segment`.

## **Phase 3:** Verification

### `[ ]` **3.1 Complete verification** — load and follow `verify-work-unit.md`

---

## Success Criteria

- `[ ]` Over the reference backend with real repositories and worktrees, on Linux and in a dispatched run of the
  portability pair, a hand edit in any worktree, and a conflict record its write files, reach every other worktree's
  copy at the writer's fan-out, a pull's merges included; the save-loss harness loses no save timed into a refresh; and
  over the ref backend, twenty worktrees saving into refreshes, fan-outs, file removals, and checkouts' persist steps at
  once lose no save, but for the residuals the spec's § 17 names.

- `[ ]` A file withheld at a rebuild stays in its file and is reported; for it, for an edit to a protected or another
  person's archived file, an unadopted file, a file that fails to parse, a refused edit, a file held by a conflict, a
  file not yet settled, and an aside copy kept because its path moved on, the removal check answers
  `persist-would-refuse`, and `unobservable` for a failed read, and the persist and release steps refuse, then succeed
  once it is resolved or, for the copy, deleted.

- `[ ]` The isolation test passes; `layout.active: flat` lays the checkout's work item flat; and a changed view setting,
  identity, checkout claim, or `layout.active` reprojects what it governs.

- `[ ]` A verb run from the checkout marks the files its write changes there, so `arc selection --changed` lists them.

- `[ ]` The no-change overhead stays within 10 ms on Linux and 60 ms on Windows at this repository's size; the start, a
  full materialization, and a one-file fan-out into 20 worktrees each measure within their tripwires' bounds on every
  platform; and a ten-file fan-out into 20 worktrees measures within its bound on Linux and macOS, its Windows median
  recorded against it.

- `[ ]` Over the in-repo implementation the removal slots pass.

- `[ ]` The `.worktreeinclude` copy copies nothing under the projected roots or `.arc/system/.local/`.

- `[ ]` All quality gates pass (tests, linting, type checking)

- `[ ]` Ready for integration
