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
a one-file fan-out of a record that is not a primary each stay within their bounds, and a ten-file fan-out within its
bound but on Windows, where § 15.4 expects it to reach the bound, each Windows median read as Success Criterion 4 reads
it.

_Design decisions:_ This list is the third of three members' that build one design (spec § 1.1, § 1.3), over
`projection-substrate`'s engine and `projection-write-back`'s write path, both on base
(`notes-projection-worktrees.md` § Grounding basis); tests run as theirs do (§ 1.5). The rebuild
on `state-unresolvable` (1.6.b) and the fan-out of `pull` and `push` (1.7) rest on the store's `pull`, `push`, and that
refusal (`Store`, `lib/store/contract.ts`), and the timing suite (1.12.a) and the multi-process lane (1.13) on
`createRefStore` (`lib/store/create.ts`) and the `ARC_STORE_BURSTS` gate. The lane's bursts into a removal's persist
step wait for that step, in Phase 2 (2.7). Fan-out wraps only the store `createStore` returns; a move or an import that
bypasses it is caught at each worktree's next command start, since that start refreshes from the index's state version.
The index's partitions (1.2) and protection's shared reads (1.4) come before materialization, refresh, and fan-out,
which read through both (`notes-projection-worktrees.md` § Spike 3, § Spike 4). The tasks review as spec § 1.3's chunks:
1.1–1.3 and 1.4.a the first; 1.4.b and 1.5–1.11 the second; 1.12 and 1.13 the third; and Phase 2 the fourth. Each chunk
lands with tests of its own code that need no later chunk's, and a test that also needs a later chunk's code lands with
that chunk.

### `[x]` **1.1 Decide which checkouts hold a projection — § 2.5**

- _Goal:_ A worktree holds a projection when it holds an index, and gets one only when it is the primary or its
  work-unit marker names a work unit or a transient claim — an `arc start --here` checkout included — so ARC's machinery
  checkouts and unclaimed worktrees run with the projection off.

- _Outcome:_ Command entry reads projection eligibility from the primary flag and decoded marker ownership before
  walking projected files. Existing indexes remain readable in unclaimed checkouts; only work-unit and ready transient
  claims gain a missing projection, with husks and machinery excluded.

### `[x]` **1.2 The index's header and partitions — § 3.1, § 16.2**

- _Goal:_ A command reads and writes only the index partitions holding the entries it touches, so its index cost follows
  the roots it walks rather than the archive, and a write that stops anywhere leaves the last whole index or one the
  next start rebuilds, never a mix.

    - `[x]` **1.2.R Preserve racy installed stats across partition publications — A1**

        - _Goal:_ Implement A1 so a same-tick save to a staged file remains detectable after an unrelated partition
          advances the shared reference, without reading or rewriting the saved file's partition.

        - _Outcome:_ Partition publication smudges staged stats as well as observed stats; swap and fixture callers
          carry no exemption. Copy-mark-only writes preserve the current reference, and an unrelated partition's
          publication leaves an installing file's same-tick save detectable without loading its group.

- _Outcome:_ The format-2 header commits content-addressed root partitions with lazy path reads and independent
  updates. Scans load their explicit groups, lock-free readers retry a moved header, and late mismatches invalidate
  only the command's own partition under its lease. Interrupted publications retain the old header; later writes
  collect obsolete partitions, including a previously held file. Path lookups ignore inherited descriptor names.

### `[x]` **1.3 Bind a projection root for any worktree, reading through one source — § 2.1, § 14**

- _Goal:_ Refresh, fan-out, materialization, and the persist and release steps each act on a worktree through one root
  binding — its location, claim, effective `layout.active`, view, `history` memo, and a take-in under that worktree's
  own rights — reading records through one source interface, so a sibling's edit is taken in under the sibling's rights
  and a second source plugs in without changing the engine.

- _Outcome:_ `bindProjectionRoot` binds arbitrary checkouts with fresh target-local capture and rights, supplied actor
  and history, and optional process registration. Read-only bindings prepare sealed admissions without sending or
  creating machine IDs. Held roots refresh their layout in place; moves drop and report the stale binding. Actors use
  the located common directory once per identity and command, retaining legacy candidates; renderers accept source
  reads with writable history, through the `ProjectionSource` seam.

### `[x]` **1.4 Read protection once per round — § 16.3, § 2.2, § 15.5**

- _Goal:_ A file's protection costs nothing per worktree but the claim of a worktree whose marker names the file's own
  work unit: rights answer another work unit's checkout protected without reading its claim, and a refresh's renders
  read the owner's meta and the holding checkout through evidence the refresh shares, while the take-in's rights and the
  refusal behind a notice still observe the current place.

    - `[x]` **1.4.a Rights read only the file's own work unit's claim**

        - Live and captured rights reject unrelated marker owners before claim lookup, sharing lifecycle's UID-first
          current/former-name predicate. Own broken and unbound claims retain their refusals and recovery routes.

    - `[x]` **1.4.b A refresh's protection over its own evidence**

        - Rendering uses source-owned meta and inventory reads, a per-round read memo, and shared lazy roster and
          marker observations. Holder and markerless searches retain their validation; take-ins observe fresh evidence,
          including the current holder after a move. Unbound-marker classification uses the source inventory.

### `[x]` **1.5 Materialize a worktree in full, and rebuild one with no usable index — § 2.5, § 3.1**

- _Goal:_ A worktree with no projection gets every record written under the replace guard and adoption rules, and one
  whose index it cannot use is rebuilt writing over no file that might hold an edit, withholding and reporting each.

- _Amended in:_ 1.6.R (A2)

- _Outcome:_ Full inventories render canonical lifecycle and personal paths, cohort copies, and Errand descriptions
  through shared protection evidence. First commands rebuild missing or unusable indexes, retaining edits and aside
  copies as withheld until deletion; their changed marks remain until save. Spawn hooks materialize under the target's
  configuration and lease, preserving copy bookkeeping across repeated bindings. Guard records survive and failures
  report without failing the spawn. The tracked npm policy reaches future worktrees; the checkout and clone inventory
  found no installer copies to remove.

### `[x]` **1.6 Refresh from the store's changes — § 15.2**

- _Goal:_ Each command's start brings its worktree up from the state version its index last projected, rewriting only
  the records `changes` names and the files marked pending, moving every file a primary record's change relocates, and
  rebuilding when that state version no longer resolves.

    - `[x]` **1.6.R Retain ownership during path reuse — A2**

        - _Goal:_ Implement A2's durable ownership handoff so an arriving record remains retryable and a save timed into
          path reuse or its recovery is never sent to the other record.
        - Added the non-nested arriving-entry journal and shared installer/reconciler. Leaving authority survives
          interrupted links, late saves, and staging cleanup; fresh take-in refuses journals and selection omits them.
          Reprojection publishes its retry flag before moving files and acknowledges the whole target only after
          desired arrivals are confirmed, including claim-only A → B → A retries.

    - `[x]` **1.6.a Reducing `changes`**

        - Added a root-local refresh over the caller's held index, with owner and conflict reduction, guarded re-lays,
          pending removals, moved changed marks, and live admission beside memoized rendering reads. The start retains
          sweep and write-back observations through its first refresh publication and its final no-change write.

    - `[x]` **1.6.b A state version that no longer resolves**

        - Rebuilds every persisted partition from current inventory on an unavailable state window, without fetching
          history. Complete or absent listings authorize removal; missed, diagnosed, and unreadable listings preserve
          their files and retain the anchor for repair and retry.

- _Outcome:_ Command entry now carries one held index from sweep through write-back, reprojection, refresh, and final
  publication. Pending removals and ownership transfers retry without a new store write. Captured writes from renamed
  owners retain their historical basis while atomic admission observes the current canonical owner name.

### `[x]` **1.7 Fan out from the store `createStore` builds — § 2.2, § 1.2**

- _Goal:_ Once a write or a pull's merges land, the writer brings every worktree on the machine that holds a projection
  up from that worktree's own state version, taking each one's projection lock in turn — and whatever fan-out misses,
  the next command's start refreshes.

    - `[x]` **1.7.a The wrapper**

        - Added an invocation-bound, clone-scoped store facade, deferred rounds through a common projection-lock
          wrapper, and scaffold holds through marker binding. Start and history-pull work flushes after release;
          command end disposes notification authority and drops its deferred work. In-repo stores remain inert.

    - `[x]` **1.7.b One fan-out**

        - Native roster visits use direct Git-directory reads, bounded leases, leased header checks, fresh target
          settings, and shared round reads, protection, and command history. Take-ins queue another round; verb writes
          mark only their entering checkout. Skipped siblings recover at their next start, including interrupted
          replacements whose unchanged bytes are classified before edit rights. Unready roots retry transient unsent
          paths, retaining their recovered copies for command end; intentional reverts and late saves remain edits.

- _Outcome:_ Marker UIDs now participate in projection provenance without changing `ActiveLayoutContext`'s shape,
  allowing refused creation stamps to recover editability after a same-slug bind. Live preparation shares the command's
  history while atomic admission still captures and validates the historical bytes consumed.

### `[x]` **1.8 Reproject on a changed view setting, identity, claim, or layout — § 10.4, § 10.3**

- _Goal:_ A command that reads a view setting, identity, checkout claim, or `layout.active` different from the one its
  index recorded reprojects what it governs — views added, files leaving a view by the removal path, the new identity's
  personal root laid on a changed identity, and `current/`, its scratch folder, and owning-checkout notices following
  the claim or layout.

- _Outcome:_ Reprojection and fan-out share the fresh-settings predicate, including marker UID and durable retry flags.
  Personal selection follows the current identity while other personal files and entries remain untouched. A changed
  view can bind an initially unmapped open conflict from its final index and resolve it once; existing selections,
  accepted intents, and ambiguous tokens keep their authority boundaries. Native cases cover guarded view removals,
  identity round trips, claim changes during fan-out, ignore-policy repair, and flat layout.

### `[ ]` **1.9 Rebuild deleted files at `arc sync` — § 2.4**

- _Goal:_ `arc sync` rebuilds every deleted projected file as a full materialization, from the flip.

    - From the flip the top-level `arc sync` command (`handleSync`, `handlers/sync.ts`, registered in `cli.ts`) runs a
      full materialization (1.5) of its worktree once its identity and ARC root resolve and before its network steps, so
      an offline sync still rebuilds; with no identity, its existing refusal (`IDENTITY_MISSING`, `resolveUserIdentity`
      in `handlers/shared.ts`, over `resolveIdentity`, `lib/git/identity.ts`) names `arc.identity` first, and nothing is
      rebuilt; `--dry-run` skips it. Its handler takes the command's store, as `handleSave(options, store)` takes
      `projectionCommandBinding().store` (`handlers/save.ts`, `cli.ts`); `handleSync(opts, output, context)` takes none
      today. The step lives in `lib/store/projection/`, which `handleSync` calls once, since `handlers/sync.ts` already
      sits past the size gate under its recorded suppressions (`packages/arc-framework/eslint-suppressions.json`).
    - With a usable index the materialization rebuilds each absent file by the link alone (`swapBatch` on an absent
      path, `lib/store/projection/swap.ts`), replaces by the swap each file the read gate reads as deleted (`gateRead`'s
      `emptied` and `not-a-file`, `lib/store/projection/read-gate.ts`) — an empty Markdown file at least 50 ms old, or a
      symbolic link at a path the index lists — and leaves every other present file to the refresh. A partition it
      reaches by path that does not hash to its name is deleted under its lock, as at a command's start (1.2), so the
      next start rebuilds the worktree, and the sync reports it. A rebuild that fails is reported and the sync goes on
      to its network steps, and `--skip-projection` skips it. Its existing steps stay as they are, for `cutover-flip` to
      rewire onto `pull` and `push`. Before the flip it runs as today.
    - Build `test-first` (one behavior at a time):
        - Integration tier, through `arc sync`'s handler over the reference backend
        - a deleted projected file returns at `arc sync`, and an edited one keeps its edit
        - with the fetch failing, a deleted projected file still returns
        - a present, unchanged file is not rewritten, and `--dry-run` rebuilds nothing
        - with no identity, `arc sync` refuses naming `arc.identity` and rebuilds nothing
        - an emptied projected Markdown file at least 50 ms old, and a symbolic link at a projected path, are replaced
          at `arc sync`
        - a rebuild that fails is reported, and the sync still runs its network steps
        - with a file in a `completed/` quarter deleted and that quarter's partition altered by hand, `arc sync` deletes
          the partition and reports it, and the next command rebuilds the worktree, the file returning
        - `arc sync --skip-projection` rebuilds nothing

### `[ ]` **1.10 Hold the `.worktreeinclude` copy off the projection's paths — § 11.6**

- _Goal:_ A new linked worktree takes none of the primary's projected files through `.worktreeinclude`, so the
  projection fills them itself.

    - `copyWorktreeIncludes` (`lib/git/worktree-include.ts`), run at every spawn through `setupLinkedWorktree`
      (`lib/git/linked-worktree-setup.ts`), already copies nothing under `.arc/` (its module-private `isArcPath`), which
      keeps out every projected root and `.arc/system/.local/`; a regression test holds it.
    - Build `test-first` (one behavior at a time):
        - with a broad pattern, the primary's `active/current/` and `.arc/system/.local/` files are not copied, and an
          `.env` file still is

### `[ ]` **1.11 The isolation invariant and its test — § 10.5**

- _Goal:_ An integration test holds "`active/current/` holds only this checkout's work item": a worktree spawned for a
  work unit holds exactly that work unit's files and a copy of each cohort document it names in `active/current/`,
  exactly the selected views in `active/in-flight/`, and nothing else at `active/`'s top level.

    - Over the reference backend: a linked worktree created from base and marked for a work unit as a spawn marks it,
      then materialized (1.5); it asserts the layout the documentation states and adds no guard on today's flat layout.
      `cutover-documentation` rewrites the strategy's acceptance test to match.

### `[ ]` **1.12 The no-change budget and the tripwires — § 15.3, § 15.4, § 15.5**

- _Goal:_ A command with nothing changed spends at most 10 ms on Linux and macOS and 60 ms on Windows in the projection,
  its folder walk, index read, and stats running while its two Git calls do, and each tripwire shows only when the
  median of its recent measurements crosses its bound.

- **Additional Context:** `notes-projection-worktrees.md` § Spike 2, § Tripwire timings

    - `[ ]` **1.12.a The start's cost**

        - The start issues its two Git calls — the store's `version()` and the one configuration read
          (`readProjectionConfiguration`) — before its folder walk (`startUnderLease`), which runs while they do, and
          with 1.3's actor makes no other. This task brings it within the budget by the three rules below, with the
          index 1.6.a has the start hold from its sweep (spec § 15.3), measures it, and builds no folder-time cache. A
          fresh guard pass in the sweep's ignore check adds a configuration re-read, only when an ignore file may have
          changed.
        - A step of the projection lock (`withProjectionLock`'s `step`, `lib/store/projection/lock.ts`) confirms
          ownership on disk only when due — once the lease's last confirmed deadline lies within one renewal interval
          (`ADVISORY_LEASE_RENEW_INTERVAL_MS`), as the lease's own retry limit reads it, or once the heartbeat has found
          the lease lost — and otherwise returns at once. The lease (`withRenewableLease`, `lib/renewable-lease.ts`)
          gains that due check beside `confirmOwnership`, which build ownership keeps calling
          (`withBuildArtifactOwnership`, `lib/build-ownership.ts`), so every one of its calls still confirms on disk.
          Each step renews on disk today (`renewAdvisoryLock`, `lib/advisory-lock.ts`), and the start takes one before
          each file's change check (`checkFileAtPath`, `lib/store/projection/engine-files.ts`), a fan-out and a
          materialization several per file they replace (`swapBatch`, `lib/store/projection/swap.ts`)
          (`notes-projection-worktrees.md` § Spike 2).
        - The start's folder walk (`walkProjectionRoots`, `lib/store/projection/engine-walk.ts`) reads each folder with
          its entries' types, synchronously, as the walk in `notes-projection-worktrees.md` § Spike 2 did on both
          platforms, stats no entry, and yields to the event loop between folders: the store's `version()` reaches its
          Git process through asynchronous steps (`lazyStore`, `lib/store/create.ts`; the backend's read coordinator,
          `lib/store/ref/read-operation.ts`) that a walk run in one piece holds back until it ends, which on the Windows
          runner added the walk, the index read, and the stats to the Git calls, 110 ms against 75 ms
          (`notes-projection-worktrees.md` § Spike 5). The start issues both Git calls, then, while they run, reads the
          index's header, its walked roots' partitions, and those the header marks (1.2), walks the shared roots, and
          the personal roots once the configuration read returns the identity, and stats each file it walked —
          synchronously on Linux, which Spike 2 found fastest there, and on macOS, which follows Linux untested, and
          through a pool of 32 concurrent stats on Windows. Today the walk awaits an `lstat` per entry, the index is
          read once both Git calls return, and the change checks (`checkChange`,
          `lib/store/projection/change-detection.ts`) each await their own `lstat` (`readStat`), one file after another,
          after the sweep (`writeBackProjectionFiles`). `checkChange` takes a stat already observed; the change checks
          use the start's stat of each file it walked where the sweep found the aside folder empty (`sweepAsideFolder`'s
          `swept` and `left`), and stat again after the sweep otherwise, since a copy it takes over changes its file, as
          the re-read after the sweep does today. The walk's seam (`ProjectionWalkFs`) becomes synchronous, a test's
          fault double still replacing it, and the start's test of that order
          (`__tests__/integration/store/projection/engine.test.ts`) observes both calls issued before the walk begins
          and, over a store that reaches its Git call through asynchronous steps, that call made before the walk's last
          folder, and keeps its check that the personal roots' walk follows the identity. The link-boundary read the
          walk itself makes of its roots before it walks (`walkProjectionRoots`, passing its seam to
          `readProjectionLinkBoundary`), and the end's link re-observation, which takes the walk's seam today
          (`finishProjectionRoot`), keep an asynchronous `lstat` port of their own (`readProjectionLinkBoundary`'s
          `ProjectionLinkFs`, `lib/store/projection/discovery-links.ts`).
        - The command's end (`finishProjectionRoot`, `lib/store/projection/engine-end.ts`) takes no lock in a root where
          the command made no aside copy and removed no file (the root's `copies` and `removals`), sent nothing to the
          store, and records no fan-out time (1.12.b), and whose start's sweep found the aside folder empty, which the
          root records (`sweepAsideFolder`'s `swept` and `left`). A send counts whatever it met, since the taken-in copy
          it keeps (`recordPendingWriteBack`, `lib/store/projection/taken-in.ts`) is one the end's collection may remove
          (`removeTakenInCopies`); one an earlier command left waits for the next end that runs. Today the end takes the
          lock and writes the index in every ready root, `runSecondCheck` (`lib/store/projection/second-check.ts`)
          committing it whatever it settled.
        - A timing suite, `__tests__/integration/store-ref-projection-timing.test.ts`, run only where `ARC_STORE_BURSTS`
          is set, as `store-ref-timing.test.ts` is, times the no-change start over `createRefStore` in a prepared
          repository (`__tests__/helpers/prepared-repository.ts`) at this repository's size — about 800 projected files,
          `backlog/`'s folders holding about two files each as this repository's do — taking the median of eleven runs,
          and reports beside it the time of the work beneath its Git calls, the start's index read, walk, and stats run
          alone, the medians of its two Git calls run at once alone and of one Git call alone in the same repository,
          and for each path it times the Git calls it made, counted through the exec ports it passes the store and the
          engine, calls that ran at once counting as one, so each Windows median is read as Success Criterion 4 reads it
          (spec § 15.3, § 15.4; `notes-projection-worktrees.md` § Spike 5). It reports its medians rather than asserting
          the budget, since hosted runners' timing varies; a dispatched run of the portability pair and one of the Linux
          `portability` job record them in `notes-projection-worktrees.md`, read against the budget at 1.14 and at
          verification. It registers by its file name where `store-ref-timing.test.ts` does, so its medians are taken
          with nothing else running: in Vitest's `integration-timing` project, which runs one worker after the parallel
          group, and out of the plain integration project (`vitest.config.ts`, where `timingTest` names one file); in
          `PORTABILITY_SUITES` (`lib/local-vitest-runner.ts`); in the `ARC_STORE_BURSTS` environment entry of
          `__tests__/reach/store-suites.json`, and in that file's `locating` list with no finds, as that suite's entry
          is, since it writes its medians under `.test-cost-runs` and prints them, as that suite does, a folder whose
          path it builds from its own location (`lib/vitest-reach.ts`); and among the file names
          `store-ref-timing-isolation.test.ts` checks for overlap.
        - The same suite times the no-change start again with about 60,000 entries' files in `completed/` across its
          quarters, reporting its median beside the first, which the start's partition reads keep within noise of it,
          since a command reads no settled archive quarter's partition (1.2; spec § 15.3).
        - The same suite times, over `createRefStore` with the same median, a one-file write's fan-out of a record that
          is not a primary, one in `backlog/`, whose partition is the largest an ordinary write rewrites, and a ten-file
          write's, into 20 linked worktrees, and a full materialization at this repository's size, reporting each
          against its tripwire's bound (1.12.b), and the same runs record them.
        - The two shipped tests that lose the lease through a step's lockfile read — the failed step confirmation in
          `__tests__/unit/store/projection/lock.test.ts` and the marker-mapping recovery in
          `__tests__/integration/store/projection/engine-copy-rendering.test.ts` — keep their cases by advancing the
          lock's clock into the renewal window at the fault, so the step is due and reads the lockfile.
        - Build `test-first` (one behavior at a time):
            - a step far from its lease's deadline touches no lockfile, and one within a renewal interval of it renews
              on disk
            - once the heartbeat finds the lockfile naming another holder, the next step ends the operation
            - build ownership still confirms on disk at every call
            - the walk and the change checks find the same files, links, and changes through the synchronous and the
              pooled stat, and a fault the walk's seam injects still surfaces
            - with the store's Git call held open, the start reads the index's header, its walked partitions, and the
              marked ones, walks, and stats every walked file before the call returns
            - where the sweep took over a copy, the change check of its file uses a stat taken after the sweep
            - the end takes no lock in a root with nothing to settle, and takes it where the command made a copy,
              removed a file, sent a file, or records a fan-out time, or where the start's sweep found a copy
            - a command with nothing changed takes one projection lock and writes its index header and reference once,
              and no partition where no stat moved, after its change checks and refresh, the start's measurement
              covering both

    - `[ ]` **1.12.b The tripwires**

        - The index keeps the last nine measurements per key (`ProjectionIndexSchema.tripwires`, at most nine numbers a
          key) for three keys this task names — the command start, each fan-out (store reads included), and each full
          materialization — with an append that drops the oldest, written by the index write each command makes
          (`commitProjectionIndex`): the command start's by the start's last write (1.6.a), and a full
          materialization's by its own. A fan-out's time goes into the writer's own worktree's index at its end, under
          the lock the end takes again (`finishProjectionRoot`, which records no timing today); a writer with no
          projection records none. Each shows as a notice in the command's report (`createProjectionReporter`,
          `lib/store/projection/report.ts`) and in `arc status` (`readProjectionStatus`,
          `lib/store/projection/status.ts`, which reads no tripwire today) when its median crosses 20 ms / 120 ms, 100
          ms / 600 ms, or 1 s / 5 s on Linux and macOS / Windows.
        - Build `test-first` (one behavior at a time):
            - one slow measurement shows nothing, and a median past the bound shows its tripwire
            - a tenth measurement drops the oldest
            - measurements are kept per worktree in its index, a fan-out's in the writer's at its end

### `[ ]` **1.13 Hold saves through bursts across processes — § 1.5**

- _Goal:_ Twenty worktrees of one clone, each a separate process over the ref backend, saving into refreshes, fan-outs,
  and file removals at once, lose no save and no write.

    - A store suite, `__tests__/integration/store-ref-projection-bursts.test.ts`, run only where `ARC_STORE_BURSTS` is
      `"1"` (`describe.skipIf`), as `store-ref-bursts.test.ts` is, with a per-test timeout at least that suite's
      `BURST_TIMEOUT_MS`. It registers by its file name where those bursts do: in Vitest's `integration-bursts` project
      and out of the plain integration project (`vitest.config.ts`, where `burstTest` names one file, so the new suite
      takes entries of its own), in the portability tier's `PORTABILITY_SUITES` (`lib/local-vitest-runner.ts`), in the
      `ARC_STORE_BURSTS` environment entry of `__tests__/reach/store-suites.json`, which lists its files by name, and
      among the file names `store-ref-timing-isolation.test.ts` checks for overlap; the `store-ref-*.test.ts` glob of
      that file's `suites` already selects it by reach. The Windows run covers both layouts, as the ref backend's bursts
      now do.
    - Each worktree runs the engine's start and end over `createRefStore` in a child process from a writer fixture of
      its own, built the way the ref backend's bursts start theirs (`startRefWriter`,
      `__tests__/helpers/store/ref-process.ts`, over `__tests__/fixtures/store/ref-process-writer.ts`) and as
      `personal-lock-holder.ts` (`__tests__/helpers/store/`) runs one, in a repository from `prepared-repository.ts`.
      The processes line up across process boundaries: a child reaching a step hook prints the hook's name on stdout and
      waits for the parent's release line on stdin, as those helpers' `READY` and release do; the hooks are the four
      `SwapHooks` (`afterRecheck`, `afterMove`, `afterFirstCheck`, `beforeRebuildLink`) and a step hook this task adds
      to the fan-out (1.7.b) before each worktree it visits, so saves land inside another's replacement, fan-out, and
      file removal. The suite requires every save to reach the store, stay in its file, pending or reported, or stay in
      an aside copy — pending for the next sweep, or kept because its path moved on, reported with its path
      (`hasPathMovedOn`, `lib/store/projection/aside-copies.ts`) — and fails a run whose processes never reached each
      hook.
    - Passes in one dispatched run of the portability pair and one of the Linux `portability` job, each recorded in this
      task's completion note.

### `[ ]` **1.14 The working copy across worktrees** — validate exit criterion at segment scope

- _Goal:_ The segment's exit criterion holds across real worktrees on a freshly merged base.

    - Re-run 1.6.R's ownership-handoff recovery scenarios against criterion 10, including a reused path's arriving
      generation, an interrupted unstamped save, and continuation after the withheld bytes are deleted.
    - Merge base into the branch (append-only); run `npm ci` first if the merge changed `package-lock.json`.
    - Over the reference backend in one scripted repository with linked worktrees, run the exit criterion's scenario —
      materialize, an edit's fan-out, a pull's fan-out, `arc sync` after a delete, a rebuild on `state-unresolvable` —
      confirm 1.12.a's recorded medians, each Windows median read past the host's Git cost as Success Criterion 4 reads
      it — the no-change start within budget, a full materialization and a one-file fan-out of a record that is not a
      primary within their tripwires' bounds on every platform, and a ten-file fan-out within its bound on Linux and
      macOS, its Windows median read against the bound (§ 15.4) — confirm 1.13's recorded runs, and request
      `arc check segment`.

## **Phase 2:** Worktrees — the removal slots and the release step

_Purpose:_ Fill the removal function's three projection slots so ARC removes or releases a checkout only after its edits
persist, and give every worktree its own user surfaces.

_Mode:_ `slice` — closes on ARC removing or releasing a projected checkout only after its edits persist.

_Exit criterion:_ Over the reference backend, the removal check answers `persist-would-refuse` for each state an edit
could lose and `unobservable` for a failed read, the persist and release steps refuse over each and succeed once it is
resolved or, for an aside copy kept because its path moved on, deleted, and teardown through its store-backed context
persists, then removes; and over the ref backend, twenty worktrees saving into removals' persist steps lose no save but
for § 17's residuals.

_Design decisions:_ The removal check, the removal function, the release, and the slot type (`checkWorktreeRemoval`,
`removeWorktreeCheckout`, `releaseWorktreeCheckout`, `ProjectionRemovalSlots`, `lib/git/worktree-removal.ts`) are
`seam-lifecycle`'s, on base, and the worktree lock is live (`lockSpawnedCheckout`, `PROJECTION_LOCK_REASON`). This phase
fills the slots in `lib/store/projection/`, each binding its target's root through 1.3's binder, and binds them wherever
a caller composes the removal machinery (2.4), beside the missing-folder remedy (`clearMissingWorktreeRegistrations`).
No production composition sets the slots today, so every caller runs `passingProjectionRemovalSlots` until 2.4.

### `[ ]` **2.1 The removal check's projection part — § 12.2**

- _Goal:_ The `check` slot, reading only and taking no lock, answers `would-refuse` with a remedy for every state an
  edit could lose, `unobservable` with its detail when a read it needs fails, and `passes` otherwise — so no failed read
  ever reads as `persist-would-refuse`, and the check never passes a file the persist step would refuse, save a new
  file under a prospective owner, whose kind's content checks run only once the persist step has minted its stub.

    - The check reads the target's own configuration in the target checkout, answering one that yields no identity as
      below, and one that yields another identity than the command's `unobservable` naming the removal or release run
      from that checkout (1.3), before binding, then binds the target's root with that read through 1.3's binder in its
      read-only form — no lock session, nothing registered in the command's roots, a take-in that answers without
      sending, and an actor never created — since the verdicts below read through a root and its context; a failed
      configuration read, or a binding that throws (1.3), answers `unobservable` with its detail. It reads the target's
      index without its lock, every partition at once, as 1.2's lock-free reader does, so a write it races does not read
      as an unusable index.
    - `would-refuse` for a file adoption would refuse, read through one read-only adoption verdict in two parts. The
      first is the checks `adoptProjectionFile` (`lib/store/projection/adoption.ts`) still makes inline while it commits
      index entries, sends, and mints, which this task extracts and `adoptProjectionFile` calls before it writes, so the
      two cannot drift: the target's resolution (`resolveAdoptionReference`) — established folder ownership
      (`resolveBacklogOwnership`, `lib/store/projection/container-ownership.ts`), cohort-generation authority
      (`resolveCohortAdoption`, `lib/store/projection/cohort-adoption.ts`), and, where ownership is prospective,
      `arc stub`'s own parameter checks (`validateStubParameters`, `lib/work-unit/verbs/stub-parameters.ts`) in place of
      the mint (`mintProjectionMetadata`) — the record's protection (`readProjectionProtection`), a path through a
      symbolic link, an existing record, and metadata that must come through `arc stub`. The second is the shared
      planner adoption's send already runs, read-only (`prepareAdoptedProjectionSubmission`,
      `lib/store/projection/submission.ts`, reaching `planAdoption`, `lib/store/projection/admission-planner.ts`): it
      re-selects the target from the captured local evidence, re-runs the edit rights, and runs the kind's content
      checks, and the check runs it without `submitProjectionBatch`, only where adoption itself reaches it — its owner
      established and its record absent — since the planner refuses a prospective owner (`projection.selection`,
      `selectProjectionAdmissionSubject`, `lib/store/projection/admission-selection.ts`) and an existing record (an
      admission conflict, `planAdoption`). Where the record exists, adoption attaches it and the walk sends the file as
      an indexed edit (`attachExistingProjectionFile`, `lib/store/projection/adoption-existing.ts`), so the check reads
      the entry attaching would build, in memory, through the read path alone: the root's bound capture takes a path's
      binding from the published index only (`captureProjectionLocal`), which holds no entry for it until the persist
      step attaches and then prepares, so the indexed preparation would refuse it (`prepareStable`); where the owner is
      prospective, adoption mints before it plans, so the check stops at the first part, the kind's content checks the
      persist step's after the mint. A refusal only the verb's executor returns reaches the persist step, which refuses
      with the verb's remedy.
    - `would-refuse` also for a file held by a conflict, failing to parse, or holding a refused edit; an aside copy
      whose edit is refused, fails to parse, or clashes in the checkout (`putBack`,
      `lib/store/projection/aside-copies.ts`), or that holds an edit once its path has moved on (`hasPathMovedOn`); a
      file or aside copy withheld (1.5); a file or aside copy not yet settled (`gateRead`'s `pending`,
      `lib/store/projection/read-gate.ts`); a file or aside copy write-back's read path holds pending for any other
      cause but a store read's refusal (`prepareWriteBack`'s `held` answer `pending`), such as a retained base it cannot
      read, for any format (`readRetainedBase` turning the read's failure into `RetainedBaseUnavailable`, which
      `selectWriteBackBase` holds, `lib/store/projection/base-selection.ts`), with the remedy it reports, or a retry
      where it reports none. The read path's held answer carries the store refusal that left a file pending in a field
      of its own, which `heldPreparation` (`lib/store/projection/write-back.ts`) does not route as a send's refusal, set
      wherever the read path leaves a file pending on a store refusal: `pendingRead`, which also takes the refusal
      `readStamplessFile` makes where neither version of an interrupted replacement is readable, and a base selection
      whose store read refused (`selectStamplessBase`, `lib/store/projection/stampless-base.ts`). The check answers
      `unobservable` where it is set, carrying the refusal's remedy.
    - `would-refuse` also, by a deliberate hold, for a file whose accepted-input recording is unfinished
      (`persisted.recording`, `lib/store/projection/index-schema.ts`), or whose accepted adoption has not installed its
      read-back (`adoption.kind` `read-back`), which outlasts the recording where the install did not take or the path
      is not writable (`completeAdoptionRecording`, `resumeAdoptionReadBack`,
      `lib/store/projection/adoption-read-back.ts`). Three writers leave a recording: a write-back whose read-back
      failed after its write landed (`sendWriteBack`, `write-back.ts`, through `recordPendingWriteBack`,
      `lib/store/projection/taken-in.ts`); an accepted adoption awaiting its read-back (`recordAdoptionAcceptance`,
      `lib/store/projection/adoption-read-back.ts`, its entry's `adoption.kind` `read-back`); and a landed write whose
      accepted version's history is unavailable for recording its entry IDs (`recordWriteBack`'s `acceptedIdReference`,
      `taken-in.ts`). The remedy names `arc save` run there, whose walk finishes each: for a recording the one
      write-back's refusal of it names (`unfinishedRecordingRefusal`, `lib/store/projection/recording-state.ts`), and
      for an uninstalled read-back whose recording is finished, which no shipped refusal names, one this task writes,
      or, where the root's ignore guard refused it, so that the resume stops before installing (`root.writable`, over
      `writableUnder`, `lib/store/projection/sweep.ts`), the guard's own remedy. Every one is left pending: the send
      finishes a recording before it prepares (`completeWriteBackRecording`,
      `lib/store/projection/write-back-recording.ts`), and the walk resumes an adoption's read-back
      (`resumeAdoptionReadBack`, reached from `checkFileAtPath`, `lib/store/projection/engine-files.ts`). That refusal
      is made locally, not by a store read, so the check classifies the state by the entry's mark before the read path
      runs, for every entry the index holds whether or not its file changed, since the walk re-sends a pending entry
      either way (`checkFileAtPath`), never through the store-refusal rule above, which would read it `unobservable`.
      The persist step would finish it (2.2), but finishing writes — a completion can keep a copy (`keepCopy`), and a
      resumed read-back installs the file — and the check writes nothing, so it holds the removal until a command run
      there has finished it. Two cases that walk cannot finish fall outside the hold. A write-back's recording whose
      file is gone holds nothing, wherever it is, its write having landed and the walk skipping an absent file
      (`checkFileAtPath`). Any other such entry in another identity's personal root answers as an edit there does,
      naming that identity's remedy (below): the walk visits its files only for the configured identity (the start's
      walk, `engine-start.ts`), and resumes an adoption there only to have its read refused, since the store answers
      another person's record as absent (`otherIdentityRefusal`, `lib/store/ref/read.ts`).
    - `would-refuse` also for a refusal the send's preparation returns after the read path is ready (below), each with
      its remedy, unless the planner marks it as a store read's own refusal (`planProjectionWrite`'s `nativeRefusal`,
      `lib/store/projection/admission-planner.ts`), which answers `unobservable`, as below: `prepareStable` returns that
      flag with the refusal, and this task carries it on the preparation's result type. So a local capture that refuses
      (`projection.local`: a retained copy missing, unsettled, behind a symbolic link, or differing from its recorded
      blob, `captureRetainedBases`; no identity, through the bound `captureLocal`), the target's selection
      (`projection.selection`), the edit rights, a content check (`projection.content`), or a `version-conflict`
      carrying `cause: "projection-admission"` (`projectionAdmissionConflict`,
      `lib/store/projection/preparation-view.ts`) answers `would-refuse`. A marker that cannot be read, is malformed, or
      needs manual repair throws at the capture (`readCheckoutLayoutContext`) as it does at binding (1.3), and answers
      `unobservable` with its detail.
    - `would-refuse` also, for a checkout 1.1 gives a projection or that holds an index, for a configuration that
      yields no identity (`ConfiguredIdentity`, `lib/store/projection/configuration.ts`), naming the remedy its
      `no-identity` answer carries.
    - It runs write-back's read path over each changed file in every projected root, `completed/` included, and in every
      other identity's personal root present (`.arc/user/*/`, `PROJECTED_PERSONAL_PATTERN`,
      `lib/layout/projected-roots.ts`), which a changed identity leaves (1.8), and each settled aside copy: the settle
      rule; the edit rights (`readProjectionEditRights`, `lib/store/projection/rights.ts`), applied here since the read
      path leaves them to the take-in; `prepareWriteBack` (`lib/store/projection/write-back.ts`), which parses, merges
      in the checkout, and runs the write check with its views (`checkWriteBackEdit`, `createWriteBackAfterView`)
      without writing a file, publishing an index, or taking a lock; `checkSerializationRules`
      (`lib/store/serialization.ts`); and, where the read path answers ready, the send's own preparation run without
      submitting (`prepareIndexedProjectionSubmission`, `lib/store/projection/submission.ts`): the retained bases'
      capture, the local capture through the root's `captureLocal` in the target checkout (1.3), and the shared planner
      (`planProjectionWrite`, `lib/store/projection/admission-planner.ts`), never `submitProjectionBatch` — the
      read-only feasibility check `spec-projection-write-back.md` § 7.2 permits, whose answer is provisional, the
      persist step capturing and preparing again under the target's lock. Each file prepared so, and each new file the
      adoption planner reads, reads the target's configuration at each capture, one Git call each: two in the usual
      case, a third where the local evidence changed between them (`prepareStable`). It never trusts the index's refused
      mark (`RecordEntry.refused`), so an edit made since the last command and a refusal since reverted both read true.
      The aside copies read as the persist step's takeover reads them (`checkAsideCopy`), through the read-only take-in,
      so nothing is sent: per path in the order their swaps were made (`RecordEntry.copies`), each read with the record
      that a write-back has been sent since its swap (`recordWriteBackSent`) set wherever an earlier copy of its path
      would be taken in. A symbolic link is never read and refuses nothing.
    - In another identity's personal root an edit answers `would-refuse` as one its edit rights refuse
      (`readProjectionEditRights`'s `identity` reason), and a file the index does not hold as one adoption refuses for
      the same reason, each naming that identity's remedy (`protectedMark`, `lib/store/projection/protection.ts`); an
      unchanged file there holding neither mark of the hold above passes.
    - `unobservable` for a missing, unreadable, or other-format index (`readProjectionIndex`), its detail naming the
      remedy — run the removal or release from that checkout, or, for a partition whose bytes do not hash to its name,
      `arc save` run from that checkout, whose start reads every partition and rebuilds (spec § 3.1); for a projected
      file that cannot be read; and for a store read refusing `namespace-corrupt`, `identity-mismatch`, or
      `state-unresolvable`, its detail carrying the refusal's own remedy text, since the slot's `unobservable` answer
      carries one string.
    - A checkout 1.1 gives no projection and that holds no index answers `passes`, before the identity is consulted; one
      that holds an index anyway is checked as any other.
    - Build `test-first` (one behavior at a time):
        - Integration tier, over the reference backend and real linked worktrees
        - each would-refuse state answers `would-refuse` with its remedy, and `passes` once it is resolved
        - an edit to a protected file or to another person's archived file, made since the last command, answers
          `would-refuse`
        - a new file adoption would place answers `passes`; one it would refuse — a companion in a folder with no
          established owner, or a cohort file with no cohort-generation authority among them — answers `would-refuse`,
          and adoption refuses the same file for the same reason
        - a new file in a prospective stub's folder whose parameters `arc stub` accepts, and an unindexed file whose
          record already exists, each answer `passes`, `planAdoption` never reached for either
        - a refused edit reverted to its base answers `passes`
        - a Markdown file and a file other than Markdown whose retained write-back base cannot be read each answer
          `would-refuse` with write-back's remedy, and `passes` once the base is restored
        - a file whose accepted-input recording is unfinished, and an accepted adoption awaiting its read-back, its
          recording finished or not, each answer `would-refuse` with the remedy that names `arc save`, never
          `unobservable`, and `passes` once `arc save` run there finishes it
        - such an entry in another identity's personal root answers `would-refuse` naming that identity's remedy, and a
          write-back's recording whose file was deleted answers `passes`
        - a file whose retained input differs from its recorded blob, which only the send's preparation reads, answers
          `would-refuse` with its remedy, though write-back's read path alone answers ready
        - a file whose claim a store double changes between the check's own rights step and its preparation, so the
          shared planner finds the captured edit protected, answers `would-refuse` with the `projection-admission`
          conflict's remedy
        - a store read the preparation makes that refuses, through a store double, answers `unobservable`, never
          `would-refuse`, and a marker made malformed between binding and capture answers `unobservable`
        - a file other than Markdown whose `history` read refuses `state-unresolvable` answers `unobservable` with its
          remedy, never `would-refuse`
        - a drawing's aside copy a failed command left, its markers since resolved, answers `passes`
        - an aside copy holding an edit whose path has moved on answers `would-refuse` naming the copy's path, and
          `passes` once it is deleted
        - two copies of one absent path, both holding edits, answer `would-refuse` for the newer, as the persist step,
          taking the older in first, refuses over it
        - a symbolic link in a projected root, at a path the index lists or not, answers `passes`, its target unread
        - an unusable index answers `unobservable` naming the checkout to run from, and `passes` once a command run
          there rebuilds it
        - a `completed/` partition altered by hand, which no walk or mark loads, answers `unobservable` naming
          `arc save`, and `passes` once `arc save` run there rebuilds the index; in a checkout 1.1 gives no projection
          that holds the index, the rebuild withholds the former claim's files, so the check answers `would-refuse`
          naming them, and `passes` once they are deleted
        - a projected file that cannot be read answers `unobservable`
        - a target whose marker cannot be read answers `unobservable` with its detail
        - a target whose own configuration yields another identity than the command's answers `unobservable` naming the
          removal or release run from that checkout, the command's identity taken from its read under
          `--skip-projection` too
        - a store read refusing `state-unresolvable` answers `unobservable` with its remedy, never `would-refuse`
        - after a changed identity, an edit in the previous identity's personal root answers `would-refuse` naming that
          identity's remedy, and `passes` once a command run there under that identity sends it; a file there the index
          does not hold answers the same, and an unchanged one holding neither mark of the hold passes
        - a checkout with no projection answers `passes`, with no identity configured too
        - a claimed checkout whose index was deleted answers `unobservable`, never `passes`
        - an unclaimed checkout that still holds an index is checked as any other, never passed
        - the check writes nothing and takes no lock

### `[ ]` **2.2 The persist step — § 12.2**

- _Goal:_ The `persist` slot writes back every edit in the target checkout under its projection lock, every projected
  root included, takes over every settled aside copy, and refuses with the blocking file's remedy rather than let a
  removal drop an edit — releasing the lock before it returns.

    - Reconcile 1.6.R's ownership handoffs under the target's lease and ignore authority before write-back; refuse
      while a handoff or its ambiguous withheld bytes remain, and succeed after the ordinary deletion/retry remedy.
    - Under the target's projection lock, taken through 1.7.a's lock wrapper over `withProjectionLock`
      (`lib/store/projection/lock.ts`), waiting its default bound of 10 s and refusing on `held` naming the holder —
      which may be unreadable or absent — and a retry, and refusing with a retry on `lost` or `gone`, it binds the
      target's root through 1.3's binder, with the target's own configuration read, refusing first, naming the removal
      or release run from that checkout, where that read yields another identity than the command's (1.3), over its
      store wrapped for the history retry (`retryEndedItemHistory`, `lib/store/history-retry.ts`), which the command's
      start applies for `arc save` alone (`initializeProjection`), so a missing history ref is pulled and the write or
      `history` read retried once: the root reads `history` through a memo of its own over that wrapped store
      (`createHistoryMemo`), never the command's (`ProjectionProcessState.history`). A landing there drops its record
      from the command's memo too, so a later fan-out's refresh reads that record's `history` afresh.
    - It writes back every edit under `write-back`, every other identity's personal root present read as 2.1 reads it,
      each file its own one-mutation admission batch (`submitProjectionBatch`, `lib/store/projection/submission.ts`),
      waiting through the settle rule, and refuses where any file stays unadopted, held by a conflict, failing to parse,
      holding a refused edit, withheld, not yet settled, or pending for any other cause — a `lock-held` refusal, a
      `version-conflict` one its recovery did not clear (`sendWriteBack`, `lib/store/projection/write-back.ts`), one
      carrying `cause: "projection-admission"`, which takes no recovery, a retained base it cannot read, for any format,
      or an accepted-input recording the step could not finish among them — the file keeping its content. An unfinished
      recording or an uninstalled read-back meets the step only where it arrived after the check, which holds one left
      before it in the target identity's roots (2.1), or where it is a write-back's recording whose file is gone, which
      the walk never visits and the step leaves as it is; the step finishes one it meets under the target's lock as the
      command's walk does (`writeBackProjectionFiles`, `lib/store/projection/engine-files.ts`): an accepted adoption
      awaiting its read-back by resuming it (`resumeAdoptionReadBack`), which refuses where the record's read refuses,
      and any other by the send, which finishes a recording before it prepares (`completeWriteBackRecording`,
      `lib/store/projection/write-back-recording.ts`), refusing where its retained copy, the record's read-back, or the
      accepted version's history cannot be read; each refusal names the repair it reports. A file write-back leaves
      pending refuses with the remedy write-back reports for it, or a retry where it reports none. A symbolic link, at a
      path the index lists or not, is never adopted and refuses nothing.
    - It then takes over every aside copy, per path in the order their swaps were made (`RecordEntry.copies`), its
      writer live or not, once it has settled (`settleAsideCopy`, `lib/store/projection/aside-copies.ts`) — an edit
      taken in only while its path has not moved on — deleting it through `deleteAsideCopy`
      (`lib/store/projection/stampless.ts`), which clears the copy's own record and the in-progress record naming it
      while the path still holds the entry's recorded file. A refused or unparseable copy is kept and refuses; a copy
      holding an edit once its path has moved on is kept and refuses, naming the copy's path and the remedy of copying
      out what it holds and deleting it; a copy whose edit clashes in the checkout is kept and refuses as held by a
      conflict; a withheld one is left and refuses; one that does not settle, or whose edit write-back defers or leaves
      pending, is kept and refuses with the remedy write-back reports for it, or a retry where it reports none.
    - It then checks every projected file and the aside folder once more against the index by the racy rule
      (`checkChange`, `lib/store/projection/change-detection.ts`), and walks the projected roots' folders, and every
      other identity's personal root present, again for files the index does not hold, writing back, adopting, or taking
      over whatever changed or appeared since, at most three passes, refusing with a retry where something still
      changes. An unusable index refuses naming the checkout to run from, or `arc save` run there for a partition that
      does not hash to its name (2.1).
    - It marks its target as retiring in the process state, through a mark this task adds with the fan-out's skip of a
      checkout so marked (1.7.b), and drops any root the command's roots hold for the target, since it took over the
      copies itself and the checkout may be gone before the command's end; its own binding is never registered (1.3). It
      then releases the lock and returns, and its writes fan out then.
    - Under `--skip-projection` the step runs as without it. A checkout 1.1 gives no projection and that holds no index
      returns at once, before the identity is consulted; on any other, with no identity the step refuses naming the
      remedy the configuration's `no-identity` answer carries (`ConfiguredIdentity`).
    - A step hook before it takes over each aside copy, and one before its last check, let the multi-process lane (2.7)
      place a save there.
    - Build `test-first` (one behavior at a time):
        - Integration tier, through teardown's store-backed context (`createStoreTeardownContext`,
          `lib/work-unit/store-teardown-context.ts`) over the reference backend, the slots injected into it until 2.4.b
          binds them
        - teardown persists a pending edit, then removes the checkout
        - a refused edit reverted to its base persists nothing and lets the removal proceed
        - each held state refuses the persist with its remedy, and the removal proceeds once it is resolved
        - a file whose write meets a `version-conflict` its recovery does not clear (`createRefusingStore`) is left
          pending and refuses with the remedy write-back reports, and the retry removes the checkout once the refusal
          clears
        - a file whose write meets a `version-conflict` carrying `cause: "projection-admission"` is left pending with no
          base recovery and refuses with its remedy, and the retry removes the checkout once the refusal clears
        - a Markdown file and a file other than Markdown whose retained write-back base cannot be read each refuse with
          write-back's remedy, and the removal proceeds once the base is restored
        - with the check slot passing, as for a recording arriving after the check: an unfinished recording is finished
          by the step's send, and an accepted adoption awaiting its read-back by the resumed read-back, and the removal
          proceeds; one whose retained copy cannot be read, and one whose record's read-back refuses through a store
          double, each refuse with the repair it reports, and the removal proceeds once that is repaired
        - with 2.1's check slot injected too, a recording left before the check holds the removal at the check, and
          `arc save` run in that checkout finishes it, after which the removal proceeds
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
          rebuilds it; an altered `completed/` partition refuses naming `arc save`, and the removal proceeds once it has
          run
        - a write refused for a missing history ref is pulled and retried, and lands (`lackingEndedHistory`,
          `__tests__/helpers/store/ended-history.ts`)
        - a `history` read refused for a missing history ref, as base-stamp recovery makes for an edit whose stamp was
          lost, is pulled and retried, and the edit lands (`lackingEndedHistory`)
        - a record whose `history` the command read before the persist step landed an edit to it is read afresh by the
          fan-out after the step
        - after a changed identity, an edit in the previous identity's personal root refuses the persist naming that
          identity's remedy, and the removal proceeds once a command run there under that identity sends it, that root's
          unchanged files leaving with the checkout
        - teardown under `--skip-projection` still persists the checkout's edits before removing it
        - the step returns with the lock released and no root held for the target, so its own fan-out runs and the
          command's end checks no removed checkout
        - the fan-out after the step's release lays nothing in its target, which the step marked retiring, and refreshes
          every other worktree
        - the step, called directly on a target whose own configuration yields another identity than the command's,
          refuses naming the removal or release run from that checkout; through the removal function the check refuses
          it first, and the removal proceeds once run there

### `[ ]` **2.3 The release step — § 12.3**

- _Goal:_ On every path that releases a checkout rather than removing it — teardown, abandon, and `arc locus release` of
  an anchored checkout, and the end of an Errand on the primary — the `release` slot persists every edit as the persist
  step does and, on a linked checkout, removes its projection, refusing where an edit would go back as a refused edit.

    - Reconcile 1.6.R's ownership handoffs under the target's lease and ignore authority before write-back; refuse
      while a handoff or its ambiguous withheld bytes remain, and succeed after the ordinary deletion/retry remedy.
    - A checkout 1.1 gives no projection and that holds no index returns at once, before the identity is consulted, as
      2.2's does. Otherwise, under the target's projection lock, taken and refused as 2.2 takes it, over the same
      history-retry store, reading `history` through a memo of its own over it and dropping each record it lands from
      the command's memo, as 2.2 does: write back, take over aside copies, and run the last check as 2.2 does, refusing
      on the same conditions, a target of another identity than the command's among them.
    - On a linked checkout it then removes each projected file by the removal swap (`swapBatch` with no staged file,
      `lib/store/projection/swap.ts`), every other identity's personal root's files among them, since the swap reads no
      root's writability, which gates writing a file into a root (`root.writable`, read by `sendFile`,
      `lib/store/projection/engine-files.ts`), refusing with the edit's remedy where an edit goes back to its path as a
      refused edit or fails to parse (`unparseable`), as held by a conflict where its take-in answers `clashed`, and,
      where it answers `deferred` or `pending`, with the remedy write-back reports for it, or a retry where it reports
      none, then runs the end's second check over its removal swaps' copies (`runSecondCheck`,
      `lib/store/projection/second-check.ts`), refusing on its outcomes as on the first check's, and only then removes
      the aside folder and the index. The primary — decided by `ProjectionLocation.primary` (`locateProjection`), as 1.1
      decides it, never by the `isPrimary` the release (`releaseWorktreeCheckout`) passes, which compares the checkout
      with the primary path its caller supplies — keeps its projection, which its next refresh lays out for its new
      claim (1.8).
    - Its own binding is never registered, as 2.2's is not. On a linked checkout it marks its target as retiring and
      drops any root the command's roots hold for it, as 2.2 does; on the primary, which keeps its projection, it marks
      nothing and leaves any root the command holds there as it is, so the fan-out after its release refreshes the
      primary and the end still checks the copies that fan-out makes. It releases the lock before it returns. A caller
      failing after the step leaves the marker, and the next command projects again.
    - Build `test-first` (one behavior at a time):
        - Integration tier, through teardown's store-backed context over the reference backend, the slots injected until
          2.4.b binds them
        - releasing an anchored linked checkout persists its edits and leaves it with no projection, its uncommitted Git
          changes intact
        - the primary's release keeps its projection
        - releasing a linked checkout after a changed identity removes the previous identity's unchanged files with its
          projection, and an edit there links back and refuses the release naming that identity's remedy, the marker
          staying
        - the step, called directly on a target whose own configuration yields another identity than the command's,
          refuses naming the removal or release run from that checkout
        - a write after a linked checkout's release fans out to every worktree but that checkout, whose aside folder the
          release removed
        - in a command run in the primary, a write after the primary's release refreshes it and marks the written
          records changed there, and a swap that fan-out makes there reaches the end's second check
        - releasing a primary made by `git init --separate-git-dir`, passed `isPrimary` false, keeps its projection
        - each held state refuses the release with its remedy, the marker staying, and the release succeeds once it is
          resolved
        - a lease lost mid-step refuses the release with a retry, the marker staying, and the retry releases it
        - a symbolic link in a projected root refuses no release, its target unread and untouched
        - a lock held past its bound refuses naming the holder, and the retry succeeds
        - an unusable index refuses naming the checkout to run from, and the release succeeds once a command run there
          rebuilds it; an altered `completed/` partition refuses naming `arc save`, and the release succeeds once it has
          run
        - with no identity the release refuses naming the remedy, and once `arc.identity` is set it succeeds
        - a checkout with no projection is released with no identity configured
        - a new file created after the release's write-back walk is found by its last check and adopted
        - a removal swap whose take-in answers `pending` refuses the release with a retry, the file kept
        - a save landing in a removal swap's copy after its first check is taken in by the release's second check, never
          deleted with the aside folder
        - a removal swap whose edit is refused, or fails to parse, links the file back and refuses the release with the
          edit's remedy, the marker staying, and the release succeeds once the edit is resolved
        - a removal swap whose take-in answers `clashed` refuses the release as held by a conflict, the marker staying,
          and the release succeeds once the clash is resolved
        - the primary's release takes over an aside copy and clears the in-progress record naming it and the copy's own
          record
        - an aside copy kept because its path moved on refuses the release naming its path, the marker staying, and the
          release succeeds once it is deleted
        - a file whose retained base cannot be read refuses the release with write-back's remedy, the marker staying,
          and the release succeeds once the base is restored

### `[ ]` **2.4 Bind the slots where the removal function's callers are composed — § 12.2, § 12.3**

- _Goal:_ Every production caller of the removal check, the removal function, and the release takes the projection's
  three slots, so none falls back to the passing defaults once the capability is on.

- _Note:_ The callers on `main` as of task generation are listed in `notes-projection-worktrees.md` § Removal callers.

    - `[ ]` **2.4.a The callers on the merged base**

        - On the merged base, list every production construction of a context carrying `projectionRemovalSlots`, a
          `removal` option, or a removal `check`, and every direct call of `checkWorktreeRemoval`,
          `removeWorktreeCheckout`, `releaseWorktreeCheckout`, `checkRetiringCheckout`,
          `clearMissingWorktreeRegistrations`, and `removePrimaryTransientOccupancy`, against the notes' list; record
          what moved in this task's completion note. A caller absent from 2.4.b and 2.4.c is bound with them.

    - `[ ]` **2.4.b Lifecycle's contexts**

        - One factory in `lib/store/projection/` returns the slots for a checkout's store; it is bound where each
          context is composed: the store-backed teardown and abandon context (`createStoreTeardownContext`), which the
          abandon handler (`handleStoreAbandon`, `handlers/abandon-store.ts`) and the store decomposition
          (`runStoreDecomposeCommand`, `handlers/decompose-store.ts`) compose; the teardown contexts the lifecycle
          handlers build (`runBranchTeardown` and `runTeardownForOperand` in `handlers/lifecycle.ts`), on
          `TeardownContext.projectionRemovalSlots`; the park and abandon contexts there (`runPark`, `runAbandon`), their
          `removal` option taking the slots' `check`; and the reconcile context wherever one is composed — the executor
          context (`buildExecutorContext`, `lib/work-unit/executor-context.ts`), which `arc start`'s graduation
          (`commands/start-store.ts`) and the other `ctx.reconcileWorkUnitWorktree` callers inherit, `arc start`
          (`runCreateNew`, `commands/start.ts`), and `arc rename` (`runInRepoRenameCommand`, `commands/rename.ts`;
          `checkoutMove`, `commands/rename-store.ts`).
        - Over the in-repo implementation the slots pass, so binding them changes nothing before the flip.
        - Build `test-first` (one behavior at a time):
            - a test over each production context asserts it carries the projection's slots, not the passing defaults
            - over the reference backend, teardown through the store-backed context refuses over a refused edit

    - `[ ]` **2.4.c The sweeps, the Errand exits, and the releases**

        - The `projectionRemovalSlots` field is bound where `composeSessionInitStatus` (`handlers/status.ts`, which
          `arc agenda` also reaches) builds `RunStaleWorktreeSweepOptions` and `RunBranchGoneRecoveryOptions`, the stale
          sweep passing its own to the residue sweep it runs; on the Errand runtimes' options at each of their
          constructions in `handlers/errand.ts` — the leave, the close and partial close, and the abandon and partial
          abandon — which carry it into `SettleTerminalOccupancyOptions` (`lib/errand/terminal-occupancy.ts`) and the
          leave's authorization; and on `arc locus release`'s handler context (`LocusReleaseHandlerContext`,
          `handlers/locus-release.ts`), which its CLI call in `cli.ts` passes none of today. The decisions read its
          `check`, and the exits and the release pass it whole.
        - An Errand on the primary ends through `removePrimary` (`createTerminalOccupancyIO`), which clears the
          primary's claim (`removePrimaryTransientOccupancy`, `lib/git/worktree-marker.ts`) with no slot. From the flip
          `removeOccupancy` (`lib/errand/terminal-occupancy.ts`) runs the `release` slot from its options'
          `projectionRemovalSlots` with `isPrimary` true before it calls `io.removePrimary`, so before the restore
          branch is checked out, and maps a refusal to `refused("persist-would-refuse", remedy.text)`, as the spawned
          path maps the removal's, refusing the Errand's close, leave, or abandon, so a held edit is resolved before the
          claim goes; the primary keeps its projection. A throw from the slot — a failure it maps to no refusal —
          returns from `settleTerminalOccupancy` as an `error` settlement, the claim kept.
        - A promotion on the primary (`settlePromotedOccupancy`, `lib/errand/promote-runtime.ts`) clears the claim only
          on the in-repo path, which holds no projection; from the flip it rewrites the claim as the work unit's
          (`anchorPromotedMarker`), releasing nothing, and the primary's next command reprojects the new claim (1.8), so
          it takes no release slot.
        - Build `test-first` (one behavior at a time):
            - each of the three compositions carries the projection's slots, not the passing defaults
            - over the reference backend, an Errand on the primary holding a refused edit refuses its close with the
              edit's remedy, and closes once it is resolved, the primary's projection kept
            - an Errand on the primary whose release slot throws, through a fault double, ends its close as an error,
              the claim kept

### `[ ]` **2.5 The user surfaces in every worktree — § 12.8**

- _Goal:_ Under the capability every worktree holds its own copy of the identity's personal records, `USER-INBOX` and
  `WORKING-MEMORY` among them, read through the store and never through the user-surfaces resolver.

    - The projection reads none of them through the resolver (`createUserSurfaceResolver`, `resolveUserSurfaceResolver`,
      `lib/user-surfaces.ts`); the in-repo implementation keeps it (`lib/store/in-repo/personal-paths.ts`), the seam's
      members move their own callers off it, and `cutover-tracked-state-removal` removes it with the in-repo arms.
    - The in-repo removal paths keep merging a linked worktree's identity-global user files up into the primary's
      (`reconcileLinkedIdentityGlobalUserSurfaces`, `lib/user-surface-migration.ts`) until
      `cutover-tracked-state-removal` removes them with the in-repo arms. Where the store keeps state off the branch
      (`usesOffBranchState`, `lib/store/lifecycle-write.ts`), no removal merges them or reads whether it could, since
      the persist step carries a linked worktree's edits to the store (2.2) and a merge would write into the primary's
      projected file outside its lock and index. This task removes the merge from `runStoreTeardown`
      (`lib/work-unit/verbs/teardown-store.ts`), which runs only there, and gates it in
      `reconcileWorkUnitWorktreeUnlocked` (`reconcileUserSurfacesForRemoval`,
      `lib/work-unit/mutators/reconcile-work-unit-worktree.ts`) and in the cheap-branch teardown, whose husking and husk
      removal merge directly (`teardownBranchProjection` under `runBranchTeardown`, `lib/work-unit/verbs/teardown.ts`),
      and gates the safety reading (`linkedIdentityGlobalUserSurfacesAreSafe`) in the stale-worktree sweep
      (`inspectBranchedRemoval`, `lib/session-init/stale-worktree-sweep.ts`) and branch-gone recovery
      (`buildWorktreeCandidate`, `lib/session-init/branch-gone-recovery.ts`), the removal check's projection part
      answering for the projected copies there (2.1). Each site reads the capability from the store its composition
      builds (`capabilities.stateOffBranch`, `createStore`, `lib/store/create.ts`); the compositions that build none
      today gain one: `runBranchTeardown`'s `TeardownContext` (`handlers/lifecycle.ts`), which passes it on to its two
      `reconcileWorkUnitWorktree` calls, and `RunBranchGoneRecoveryOptions` (`composeSessionInitStatus`,
      `handlers/status.ts`).
    - Build `test-first` (one behavior at a time):
        - over the reference backend, a linked worktree's `USER-INBOX` is its own projected copy, and an edit there
          reaches the primary's copy at fan-out
        - no module under `lib/store/projection/` imports the resolver or `lib/user-surface-migration.ts`;
          `isExcludedProjectionFile`'s import of the `IDENTITY_STATUS_FILENAME` constant from `lib/user-surfaces.ts`
          stays
        - over the store, a teardown and a reconcile's removal of a linked worktree whose `USER-INBOX` differs from the
          primary's write nothing into the primary's copy, refuse nothing over it, and carry the edit to the store
          through the persist step
        - over the store, `arc teardown --branch chore/<slug>` run in a linked checkout whose `USER-INBOX` differs from
          the primary's husks it and writes nothing into the primary's copy, and the husk's later removal from another
          checkout writes nothing there either and carries the edit to the store through the persist step
        - over the store, the stale-worktree sweep and branch-gone recovery read no user-surface safety; over the
          in-repo implementation, they still read it and teardown still merges

### `[ ]` **2.6 Machine-local paths under `.arc/system/.internal/` — § 12.9**

- _Goal:_ The registry lists every machine-local file under `.arc/system/` by name, so a source projecting
  `.arc/system/` leaves them alone.

    - `MACHINE_LOCAL_PATHS` (`lib/store/registry.ts`) gains, under the `checkout` root that holds only
      `.arc/system/.local/**` today, `.arc/system/.internal/worktree-marker.json`,
      `.arc/system/.internal/pristine.json`, and `.arc/system/.internal/schemas/**`, each by name, never all of
      `.internal/`.
    - Build `test-first` (one behavior at a time):
        - each of the three entries is machine-local, and a tracked file beside them under `.internal/` is not

### `[ ]` **2.7 Hold saves through bursts into a removal's persist step — § 1.5**

- _Goal:_ Twenty worktrees of one clone, each a separate process over the ref backend, saving while their checkouts are
  persisted for removal, lose no save.

    - 1.13's suite gains the persist step (2.2), bound through teardown's store-backed context (2.4.b): its processes
      save into another's persist step, lined up by the same stdout and stdin protocol at 1.13's hooks and at 2.2's,
      before it takes over an aside copy and before its last check. Every save placed before the target's last check
      reaches the store, or stays in its file or in an aside copy — pending, refusing with a retry, or kept because its
      path moved on, reported with its path — and refuses the removal; the suite places none at the target's own fan-out
      visit after its persist step, where a save goes with the checkout (§ 17).
    - Passes in one dispatched run of the portability pair and one of the Linux `portability` job, each recorded in this
      task's completion note.

### `[ ]` **2.8 Removal after persist** — validate exit criterion at segment scope

- _Goal:_ The segment's exit criterion holds on a freshly merged base, the slots bound behind the live lock.

    - Merge base into the branch (append-only); run `npm ci` first if the merge changed `package-lock.json`.
    - Delete any untracked `.arc/user/.npmignore` the installer has left since 1.5 from every checkout of this
      repository on this machine — each worktree `git worktree list` names, and any other clone — so no merge of the
      committed file is refused.
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
        portability pair, a hand edit in any worktree, and a conflict record its write files, reach every other
        worktree's copy at the writer's fan-out, a pull's merges included; the save-loss harness loses no save timed
        into a refresh; and over the ref backend, twenty worktrees saving into refreshes, fan-outs, file removals, and
        checkouts' persist steps at once lose no save, but for the residuals the spec's § 17 names.

- `[ ]` A file withheld at a rebuild stays in its file and is reported; for it, for an edit to a protected or another
  person's archived file, an unadopted file, a file that fails to parse, a refused edit, a file held by a conflict, a
  clash found in the checkout included, a file not yet settled, and an aside copy kept because its path moved on, the
  removal check answers `persist-would-refuse`, and `unobservable` for a failed read, and the persist and release steps
  refuse, then succeed once it is resolved or, for the copy, deleted.

- `[ ]` The isolation test passes; `layout.active: flat` lays the checkout's work item flat; and a changed view setting,
  identity, checkout claim, or `layout.active` reprojects what it governs.

- `[ ]` A verb run from the checkout marks the files its write changes there, so `arc selection --changed` lists them.

- `[ ]` The no-change overhead stays within 10 ms on Linux and macOS and 60 ms on Windows at this repository's size; the
        start, a full materialization, and a one-file fan-out of a record that is not a primary into 20 worktrees each
        measure within their tripwires' bounds on every platform; and a ten-file fan-out into 20 worktrees measures
        within its bound on Linux and macOS, its Windows median recorded against it. On Windows each of these is read
        past the host's Git cost: a median counts against its bound less the amount by which its Git calls' time on that
        host exceeds the longer of 42 ms a call, what § Spike 2 measured, and the projection's own work run beneath
        them, and never above its measurement. The calls' time is taken from the tripwire suite's medians on that host —
        two calls run at once for calls that ran at once, which count as one call, and one call's for each other — and
        the work beneath them from the suite's time for that work run alone, so the projection is held to its own share
        (spec § 15.3, § 15.4).

- `[ ]` Over the in-repo implementation the removal slots pass.

- `[ ]` The `.worktreeinclude` copy copies nothing under the projected roots or `.arc/system/.local/`.

- `[ ]` All quality gates pass (tests, linting, type checking)

- `[ ]` An installing file's same-tick save remains detectable after another partition advances the reference,
        without loading or rewriting the saved file's partition; a later clean, value-equal publication writes no
        partition (A1).

- `[ ]` A new record arriving at a reused path remains retryable until installed. Saves during removal, linking, and
        interrupted installation, including unstamped files, never reach the other record; proved installations resume
        automatically, ambiguous bytes remain recoverable and reported, and deletion permits successful retry. A
        blocked arrival after a claim-only change retries without an intervening store write, including A → B → A after
        partial progress or interruption (A2).

- `[ ]` Ready for integration
