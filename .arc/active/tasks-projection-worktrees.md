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

### `[ ]` **1.1 Decide which checkouts hold a projection — § 2.5**

- _Goal:_ A worktree holds a projection when it holds an index, and gets one only when it is the primary or its
  work-unit marker names a work unit or a transient claim — an `arc start --here` checkout included — so ARC's machinery
  checkouts and unclaimed worktrees run with the projection off.

    - Read from the marker (`readWorktreeMarker`, `decodeWorktreeMarkerOwnership`, and the husk stamp
      `decodeWorktreeHuskStamp`, `lib/git/worktree-marker.ts`) and whether the checkout is the primary
      (`ProjectionLocation.primary`, from `locateProjection`, `lib/store/projection/location.ts`, which reads `.git`
      with no Git call, falling back to `git rev-parse` only where `.git` does not read (`resolveCheckoutGitDir`) — the
      primary's Git directory holds no `commondir`, being the common one): a `current` ownership naming a work unit, or
      a transient subject whose provisioning is `ready`, counts; a `pending` provisioning, a `manual-only` ownership, a
      husk-stamped marker, and a subject naming a branch, as a decomposition worktree's does, get none.
    - The answer replaces the fixed `holdsProjection: false` the start reads its index with
      (`readProjectionIndex(location, false)` in `startUnderLease`, `lib/store/projection/engine-start.ts`), so a
      missing index where this task gives a projection reads as `missing` and goes to 1.5, and a checkout it gives none
      still answers `no-projection`.
    - A checkout with the projection off still fans out its writes to the machine's projections (1.7).
    - Build `test-first` (one behavior at a time):
        - the primary and a checkout whose marker names a work unit or a ready claim each get a projection
        - a primary whose `.git` is a `gitdir:` file, as `git init --separate-git-dir` makes it, gets a projection
        - a hand-made worktree with no marker, a decomposition worktree, and a claim still `pending` get none, and the
          engine's start there touches no projection file
        - a husk-stamped marker and a `manual-only` ownership get none

### `[ ]` **1.2 The index's header and partitions — § 3.1, § 16.2**

- _Goal:_ A command reads and writes only the index partitions holding the entries it touches, so its index cost follows
  the roots it walks rather than the archive, and a write that stops anywhere leaves the last whole index or one the
  next start rebuilds, never a mix.

- **Additional Context:** `notes-projection-worktrees.md` § Spike 4

    - The index module (`lib/store/projection/index-file.ts`) writes `PROJECTION_INDEX_FILE` as a header holding
      `format`, `state`, `projectedUnder`, `withheldCopies`, `tripwires`, `ignoreFiles`, `ignoreGuard`, and a map from
      each root group to its partition's name and whether the partition holds an unsettled entry (spec § 3.1): an
      `ownerless` entry, or a `record` with `copies`, a kept taken-in copy (`persisted.takenIn.kind` `copy`), an
      `adoption`, `pending`, `withheld`, a `refused` mark, or a non-empty `unshown`, never `changed` or `inProgress`,
      which no such pass reads, and writes each group's entries (`ProjectionIndexSchema.entries`,
      `lib/store/projection/index-schema.ts`) to a file `index-<blob id>` beside it in `arc-projection/`, named by
      `gitBlobId` (`lib/store/projection/blob-id.ts`) over the file's bytes with SHA-1 whatever the repository's object
      format. A root group is `.arc/active`, `.arc/backlog`, an identity's personal root (`projectedRootPaths`,
      `lib/layout/projected-roots.ts`), each folder directly under `.arc/completed`, and `.arc/completed` itself for a
      file directly in it, and the header keys each group by that path, so each identity's personal root keeps a
      partition of its own. `PROJECTION_INDEX_FORMAT` moves, so an earlier build's index reads `other-format` and takes
      1.5's rebuild; no reader of the old form is kept.
    - A write (`commitProjectionIndex`) writes a partition only where an entry in it differs in value from what was
      read, since every clean change check builds a new entry object (`checkFileAtPath`, `withEntry`); it smudges each
      such partition against the reference it replaces (`smudgeRacyEntries`), as it smudges the whole index today, sets
      the partition's mark in the header from its entries, serializes it with `JSON.stringify`, each stat's bigints as
      decimal strings, through no schema, writes each by temp-and-rename under its name (`atomicWriteFile`), reusing a
      file already there by that name, then the header the same way, then the reference, and then deletes every
      `index-*` file the header does not name, leaving one whose delete fails for the next write.
    - A read (`readProjectionIndex`) parses the header with `JSON.parse` and checks that every partition it names is
      present, and the index it returns loads a group's partition the first time its caller reaches an entry in that
      group: parsed with `JSON.parse`, each stat's decimal strings converted to bigints by the module itself, and its
      bytes checked against its name. No read runs the schema (`decodeProjectionIndex`), which splits into a header
      schema and a partition schema (`ProjectionIndexSchema`) that stay the writer's contract, and tests check every
      header and partition the writer writes against them. A caller names the groups it loads at once: the start its
      walked roots and the groups the header marks (1.12.a), `arc save` every `completed/` group too, the rebuild a
      state version that no longer resolves takes every group (1.6.b), and the removal check and the persist and release
      steps every group (2.1, 2.2, 2.3); beyond those, a refresh, the sweep's take-over, and a fan-out's visit load the
      groups holding the paths they touch.
    - A pass over every entry loads, before it iterates, the groups its command walks and every group the header marks
      unsettled: the sweep's `recordsToTake` and `takeOverUnrecorded` (`lib/store/projection/sweep.ts`), the start's
      `adoptionRetries` (`engine-files.ts`), the end's kept-copy names (`finishProjectionRoot`, `engine-end.ts`), a
      fan-out visit's end included, and status (`snapshot`, `status.ts`). `reconcileProjectionLinks`
      (`discovery-links.ts`) loads the walked groups, since only the walk finds links; the selection
      (`selectProjectedMarkdown`, `selection.ts`) every group outside `completed/`, which it never lists; `arc save`'s
      `clearAcceptedMarks` (`save-changed.ts`) and `--resolve`'s `selectProjectionResolution` (`save-resolution.ts`)
      every group; and the rebuild a state version that no longer resolves takes (1.6.b) every group, since it handles
      each entry the state no longer holds as a removal. Every other reader reaches entries by path and loads the group
      holding it — `dropRemovedEntries`, `swap.ts`; adoption's removal of one entry, `adoption.ts`; `readIndexedOwners`,
      `container-ownership.ts`, the container's group; the overlap advisory, `lib/errand/overlap-targets.ts`; and a
      send's local capture (`captureProjectionLocal`, `local-capture.ts`), which reads the published index itself at
      each of a send's captures, and scans it for the candidate containers' indexed metadata, all in the path's own root
      group, so it loads that group — and the `{ ...index.entries, [path]: entry }` updates across
      `lib/store/projection/` move to the module's per-path update. The index in memory iterates only its loaded groups,
      so a pass that has not loaded a group finds less, never more.
    - A partition the header names that is missing answers `unreadable` (`UnusableIndexCause`), so the start rebuilds
      the worktree (1.5) and the fan-out and the end skip it. One whose bytes do not match its name answers `unreadable`
      where the start's read loads it, so the start rebuilds (1.5), and, naming that partition, where the removal check
      or the persist or release step loads it, so their remedy names `arc save` (2.1). Found when a later read loads it,
      it throws a typed mismatch naming the partition: in the command's own worktree — at its start, at its end on its
      own root, or in `arc sync`'s materialization (1.9) — `runLeased` (`withProjectionLock`,
      `lib/store/projection/lock.ts`) catches it inside the action it passes `withRenewableLease`
      (`lib/renewable-lease.ts`), whose `finally` releases the lock before any catch around it runs, deletes that
      partition file there, never the header, and returns a result its callers report and skip as they do `lost`, the
      command running with the projection off (`recordProjectionLockSkip`, `lib/store/projection/engine.ts`); the header
      then names a missing partition, so the next start rebuilds and the removal check answers `unobservable`. Only
      those ask `runLeased` for that delete; a fan-out's visit, to the writer's own worktree too, and the end on another
      worktree's root the fan-out registered report the worktree and skip it, as they skip any unusable index, deleting
      nothing. A reader holding no projection lock — the fan-out's first read (1.7.b), the removal check (2.1), status
      (`readProjectionStatus`, `status.ts`), the selection (`projectionSelectionResult`, `selection.ts`), and the
      overlap advisory (`readOverlapIndex`, `lib/errand/overlap-index.ts`) — rereads the header on a missing or
      mismatched partition and starts over once if the header changed, then answers as it answers an unusable index,
      deleting nothing.
    - Build `test-first` (one behavior at a time):
        - a write of one changed entry writes its group's partition and the header, and no other partition file
        - a start with nothing changed loads no `completed/` partition, with a quarter's partition of 60,000 entries as
          with none, and a refresh laying a file into a quarter loads that quarter's
        - a partition deleted by hand makes the index `unreadable`, and the next start rebuilds the worktree
        - a walked partition altered by hand makes the start rebuild the worktree
        - a partition altered by hand after its header was read throws the typed mismatch naming it when it is loaded
        - a typed mismatch thrown inside `runLeased`'s action deletes that partition before the lock is released, leaves
          the header, and returns the result its callers skip as they do `lost`, and deletes nothing for a caller that
          does not ask for the delete
        - an unwalked partition altered by hand, reached by a refresh, ends the command's projection with a report,
          deletes that partition before the lock is released and leaves the header, and the removal check then answers
          `unobservable` until the next start rebuilds, after which it answers as before
        - a fan-out visit reaching an altered partition, in a sibling or the writer's own worktree, skips it and deletes
          nothing there
        - a walked partition altered by hand through a hook before the command's end: in a ready sibling's root the end
          skips that root and deletes nothing, and in the command's own root it deletes that partition before the lock
          is released, leaves the header, and reports it
        - a start with nothing changed and no stat moved writes no partition, every clean change check notwithstanding
        - an aside copy recorded in a `completed/` quarter marks that quarter: the sweep takes it in, status reports it,
          and the end keeps a kept copy only that quarter's entry names; once it settles the mark clears, and the next
          start loads no `completed/` partition
        - a rebuild that marks every file it found changed, `completed/`'s among them, leaves the quarters unmarked, and
          the next start loads no `completed/` partition
        - each pass over every entry loads exactly its groups, a probe on the module counting the loads
        - a write stopped after its partitions and before its header leaves the previous index readable, and the next
          write deletes the partitions it left
        - a superseded partition whose delete fails stays until the next write deletes it
        - a lock-free read — status, the selection, and the overlap advisory each — whose header a write replaces
          between its header and partition reads, through a hook there, reads the new index; one whose header still
          names a missing or mismatched partition answers as that reader answers an unusable index, and the partition
          stays
        - an index in the previous format reads `other-format`
        - an entry in a partition a write leaves unwritten reads clean against the newer reference, and a racy stat in a
          partition it writes is smudged (`spec-projection-substrate.md` § 3.3)
        - every header and partition the writer writes passes its schema, its bigints read back equal

### `[ ]` **1.3 Bind a projection root for any worktree, reading through one source — § 2.1, § 14**

- _Goal:_ Refresh, fan-out, materialization, and the persist and release steps each act on a worktree through one root
  binding — its location, claim, effective `layout.active`, view, `history` memo, and a take-in under that worktree's
  own rights — reading records through one source interface, so a sibling's edit is taken in under the sibling's rights
  and a second source plugs in without changing the engine.

    - Generalize the root binding (`bindRoot`, private in `lib/store/projection/engine-start.ts`), which binds the
      command's own checkout alone, into an exported binder for any worktree on the machine. It takes the target
      checkout, its `ProjectionLocation`, the lock session held on it, the configuration read its caller supplies
      (`readProjectionConfiguration`, `lib/store/projection/configuration.ts`), the actor of the identity that read
      yields, the kind registry (`ProjectionEnginePorts.registry`, `lib/store/projection/engine-ports.ts`), and the
      store its take-in sends through with the `history` memo it reads through, which the persist and release steps
      supply as their own (2.2, 2.3) and every other caller takes from the command (`ProjectionProcessState.history`,
      `lib/store/projection/process-state.ts`). The command's own start supplies its own read. The send's local capture
      the binding supplies (`captureLocal`, `WriteBackContext`, `lib/store/projection/write-back.ts`), which reads the
      configuration and the claim and layout fresh before and after each send's preparation (`prepareStable`,
      `lib/store/projection/submission.ts`), reads them in the bound checkout, never the command's: today's `bindRoot`
      reads them in the command's checkout, so a sibling's or a target's take-in would capture the command's marker and
      configuration. Binding makes no Git call, but each send through a root reads that checkout's configuration at each
      capture, one Git call each: two in the usual case, a third where the local evidence changed between them
      (`prepareStable`), and the same again for a base recovery's retry (`sendWriteBack`). The command's read is the one
      `observeProjectionConfiguration` (`lib/store/projection/command-configuration.ts`) holds for the command's
      checkout in the process state (`ProjectionProcessState.configurations`): the start's, whatever the start answered,
      `no-projection` included, or, where the start made none — under `--skip-projection`, with its lock held or lost,
      or its checkout gone — one made there on first need. The fan-out supplies that read, so binding a sibling adds no
      Git call: `git config` reads the same values in every worktree of a clone unless a worktree's own
      `config.worktree` or a conditional include (`includeIf`) differs, and a sibling whose recorded view setting,
      identity, or ignore configuration then differs, or whose index records no guard pass, is skipped (1.7.b), its next
      command reading its own (1.8). The removal check, the persist and release steps, and a spawn's materialization
      read the target's own in the target checkout, since its identity decides its personal root and edit rights, and
      refuse or skip a target whose identity differs from the one the command's read yields: the command's store reads
      and lists person-owned state under the command's identity alone (`otherIdentityRefusal`, `otherIdentityRef`,
      `lib/store/ref/read.ts`) (2.1, 2.2, 2.3, 1.5). It reads the claim and `layout.active` fresh
      (`readCheckoutLayoutContext` with `fresh: true`), never from a cached claim, and, for the command's own start, the
      fan-out, and a spawn's materialization, registers the root in the process state's `roots` (`ProjectionRootState`,
      `projectionProcessState`, `lib/store/projection/process-state.ts`), so the command's end checks every worktree it
      replaced files in (`endProjection`, `lib/store/projection/engine.ts`; `finishProjectionRoot`,
      `lib/store/projection/engine-end.ts`); a root is marked `ready` once a fan-out's refresh or a materialization has
      run on it, whoever bound it — the start's among them where a lost lease left it unready — since the end skips a
      root that is not. The fan-out never binds a checkout the command's roots already hold — its own, a sibling an
      earlier round or fan-out visited, or a worktree a spawn materialized earlier in the command: it re-reads that
      checkout's claim and `layoutActive` fresh into the root it holds (`ProjectionRootState`), so the copies and
      removals the end's second check reads stay with it, and at that visit the skip rule (1.7.b) compares the claim and
      `layoutActive` re-read into that root, and the command's view setting, identity, and ignore configuration, with
      what the worktree's index records, whatever read bound the root it holds, a worktree a spawn materialized earlier
      in the command reprojected in place where its claim or `layoutActive` alone differs (1.7.b). The persist and
      release steps register nothing, so the end never checks a checkout they retire and no binding of theirs replaces a
      root the command holds (2.2, 2.3); a copy either step leaves, on a refusal or from its last check, is settled by
      the target's next sweep or the retry's takeover. A checkout move announced during the command
      (`notifyCheckoutChange`'s `move`, `lib/git/checkout-change.ts`), as `arc rename` makes when it moves a work unit's
      folder (`reconcileWorkUnitWorktree`, `lib/work-unit/mutators/reconcile-work-unit-worktree.ts`) — always another
      checkout than the command's, since rename defers a move of the one it runs in (`resolveRenameWorktreeMove`'s
      `deferred-self-move`, the same file) — drops every root the command holds at the old path and reports it, through
      the process state's listener (`onCheckoutChange`, `process-state.ts`), which today re-keys capabilities and
      deletes both paths' layout contexts: a root's `captureLocal`, protection, and ports are bound to the path it was
      bound at (`bindRoot`, `engine-start.ts`; `createProjectionEnginePorts`, `lib/store/projection/engine-ports.ts`),
      so the end checks nothing there, the copies the command left in it are settled by its next command's sweep, and a
      later fan-out binds it afresh at its new path. The command's own start binds through it, its behavior unchanged
      but for the actor.
    - The actor, `<identity>@<machine id>`, is read at the common Git directory the location already holds
      (`ProjectionLocation.commonDir`) for the identity the binding's configuration yields — once per command for the
      command's identity, which the fan-out shares — through a form of the user-sync wrapper (`getOrCreateMachineId`,
      `lib/user-sync/sync-state.ts`) that takes that directory rather than resolving it and keeps its legacy candidate.
      The engine ports' `actor` (`createProjectionEnginePorts`, `lib/store/projection/engine-ports.ts`) resolves it with
      `git rev-parse --git-common-dir` (`resolveGitCommonDir`) after the start's two calls, on every start; reading it
      from the location leaves the start its two Git calls (1.12.a).
    - A configuration that yields no identity is answered before binding: a command with none fans out nothing, running
      as under the skip switch (spec § 2.5); the removal check answers `would-refuse` with the remedy the `no-identity`
      answer carries (2.1); the persist and release steps refuse naming it (2.2, 2.3); and a spawn's materialization
      writes nothing (1.5). A binding throws only where the target's marker cannot be read, is malformed, or needs
      manual repair, or its `arc-config.yml` cannot be read or is invalid (`readCheckoutLayoutContext`), and a slot's
      read of the target's configuration that fails (`readProjectionConfiguration`) is answered as such a throw: the
      fan-out reports the worktree and skips it (1.7.b), the removal check answers `unobservable` with its detail (2.1),
      and the persist and release steps refuse with a remedy naming the failure (2.2, 2.3).
    - Its read-only form, for the removal check (2.1), takes no lock session and registers nothing. Its take-in applies
      the edit rights (`readProjectionEditRights`, `lib/store/projection/rights.ts`), write-back's read path
      (`prepareWriteBack`, `lib/store/projection/write-back.ts`), `checkSerializationRules`
      (`lib/store/serialization.ts`), and, where the read path is ready, the send's preparation without its submission
      (`prepareIndexedProjectionSubmission`, `lib/store/projection/submission.ts`, never `submitProjectionBatch`), and
      answers what the send would meet without sending, provisionally, as `spec-projection-write-back.md` § 7.2 permits
      a read-only feasibility check; its actor, which labels only a checkout merge's markers, is the target identity's,
      read by `readMachineIdFile` (`lib/store/machine-id.ts`) and never created; where that identity has none there, the
      label is the identity alone, since any markers mean a clash whatever they name.
    - Each slot is filled by the task that builds its function: `refresh` by 1.6, the command's own root's `fanOut` by
      1.7.a, and `materialize` by the materialization of the command's own checkout (1.5, 1.9), or removed, so no slot
      stays declared and unfilled.
    - The source a root reads records through is `Pick<Store, "read" | "list" | "version" | "changes">`
      (`lib/store/contract.ts`), which the store satisfies with no adapter, as does `ReadOnlyStore`; refresh and full
      materialization take it as a parameter rather than reading the root's `store`. `history` and `lookup` are read
      from the writable store alone. The root's protection (`createProjectionProtection`), bound here for the take-in,
      stays uncached; a refresh renders through one of its own (1.4.b). Only the store is built as a source; a read-only
      source's protection and each source's own state version come with `framework-core-from-package` (§ 14), and the
      index keeps its one state version (`ProjectionIndexSchema.state`, `lib/store/projection/index-schema.ts`).
    - Build `test-first` (one behavior at a time):
        - a sibling's root takes in an edit in its own file under that checkout's rights, not the writer's
        - binding a sibling runs no Git call, and a ready start with nothing changed runs two, issued together
        - a root bound after the target's marker changed in this process reads the new claim
        - the read-only form's take-in sends nothing, and its actor creates no machine id
        - re-reading the claim and `layoutActive` into a root the command holds keeps that root, the start's aside
          copies reaching the end's second check
        - a binding that does not register, as the persist and release steps' does not, adds no root and replaces none
          the command holds, one for the same checkout included
        - the store and a `ReadOnlyStore` each satisfy the source interface with no adapter

### `[ ]` **1.4 Read protection once per round — § 16.3, § 2.2, § 15.5**

- _Goal:_ A file's protection costs nothing per worktree but the claim of a worktree whose marker names the file's own
  work unit: rights answer another work unit's checkout protected without reading its claim, and a refresh's renders
  read the owner's meta and the holding checkout through evidence the refresh shares, while the take-in's rights and the
  refusal behind a notice still observe the current place.

- **Additional Context:** `notes-projection-worktrees.md` § Spike 3

    - `[ ]` **1.4.a Rights read only the file's own work unit's claim**

        - `checkoutRights` (`lib/store/projection/rights.ts`) reads the destination's marker before any claim: a marker
          whose ownership names another work unit than the file's owner — by UID where the marker carries one, otherwise
          by neither the owner's current nor a former name, matched by a helper this task extracts from the holder
          search's match (`matchingHolders`, `lib/locus/lifecycle-ports.ts`) — answers `protected` with no claim read.
          Only a marker naming the file's own work unit reads that unit's claim (`readClaimedCurrentWorkUnit`,
          `lib/store/current-work-unit-marker.ts`), a `lookup` whose `read` is the unit's meta.
        - The same rule holds in the function's second branch, which the shared admission planner takes with the send's
          captured local evidence (`frozenCheckoutRights`, `lib/store/projection/rights.ts`, over
          `readFrozenProjectionClaim`, `lib/store/projection/claim-evidence.ts`): a captured marker naming another work
          unit answers `protected` with no `lookup` or `read`, so a send's admission reads, and observes, only the
          file's own unit's claim. That branch never answers `checkout-not-writable`.
        - A checkout whose own claim cannot be read, or whose unbound marker names another work unit, therefore protects
          another work unit's meta or task list rather than refusing `checkout-not-writable`; its own work unit's still
          refuse as before. The take-in reads rights through the same function, so an edit to another work unit's meta
          there is refused as protected, as today.
        - Build `test-first` (one behavior at a time):
            - a task list rendered in a checkout holding another work unit is protected, that unit's claim unread
            - a marker naming the owner by a former name, with no UID, reads the owner's claim
            - a marker carrying another work unit's UID is protected though its name is the owner's
            - a checkout whose claim cannot be read protects another work unit's task list, and refuses
              `checkout-not-writable` for its own
            - through the captured branch, a task list in a checkout whose marker names another work unit is protected
              with no claim `lookup`, and one naming the file's own unit reads that unit's claim

    - `[ ]` **1.4.b A refresh's protection over its own evidence**

        - A refresh (1.6.a) builds its renderer (`createRecordRenderer`, `lib/store/projection/record-render.ts`) with a
          protection of its own, made by `createProjectionProtection` (`lib/store/projection/protection.ts`) over inputs
          this task adds. Its meta reads go through the source the refresh reads through (1.3): a fan-out round's memo
          (1.6.a), at the start a memo the refresh builds over the store it is handed, and in a full materialization a
          memo answered from the records its listing returned (1.5). Its claim `lookup` goes to the writable store
          (1.3).
        - Its holder and markerless searches take one listing of the worktrees per round or materialization, made only
          when a render first needs one (`scanRegisteredWorktrees`, `lib/git/worktree-roster.ts`), with each listed
          worktree's marker read once in it: the holder search (`findHoldingCheckout`, `createLocusPorts`,
          `lib/locus/lifecycle-ports.ts`, which scans and reads every marker itself today) takes the listing's marker
          holders, and the markerless search (`findNativeMarkerlessWorkUnitCheckouts`, `lib/locus/markerless-native.ts`)
          its rows, its project identity (`createProjectIdentityReader`, `lib/store/project-identity.ts`) listing
          through the same source. Classifying an unbound marker (`UnboundMarkerInput.listing`,
          `lib/locus/unbound-marker.ts`) takes the source's listing; it is a repair state, outside spec § 15.5's counts.
        - The root's protection (`bindRoot`'s, 1.3) stays as it is, uncached, for the take-in's rights, adoption, and
          the stub mint (`rights-binding.ts`, `adoption.ts`, `stub-mint.ts`, `lib/store/projection/`) and for
          write-back's read-back and drawing renders (`read-back.ts`, `checkout-drawing.ts`), so the refusal behind a
          notice names the current place (spec § 17 item 7).
        - Build `test-first` (one behavior at a time):
            - a refresh's renders of one owner's files read the owner's meta once and list the worktrees at most once
            - a protected file's notice names the checkout the refresh's listing found holding the owner
            - an edit to a protected file, taken in after the owner moved to another checkout, is refused naming the new
              checkout, though its notice named the old, and, once the edit is reverted, the next refresh's notice names
              the new one
            - an unbound marker's classification lists the work units through the refresh's source

### `[ ]` **1.5 Materialize a worktree in full, and rebuild one with no usable index — § 2.5, § 3.1**

- _Goal:_ A worktree with no projection gets every record written under the replace guard and adoption rules, and one
  whose index it cannot use is rebuilt writing over no file that might hold an edit, withholding and reporting each.

- _Note:_ The ignore guard refuses every root unless `.arc/user/.npmignore` is an accepted policy file
  (`guardProjectionIgnores`), which the installer writes into the checkout it runs in (`prepareIgnoreFiles`,
  `lib/template/ignore-files.ts`), so a linked worktree holds it only where the repository tracks it; every test
  repository writes it.

    - Commit this repository's `.arc/user/.npmignore` with the installer's content (`PERSONAL_NPM_IGNORE_CONTENT`,
      `lib/personal-npm-ignore.ts`), which no branch tracks today, so every linked worktree spawned here from the flip
      holds the policy; the file is inert before the flip. Before committing it, delete the untracked copy the installer
      leaves from every checkout of this repository on this machine that holds one — each worktree `git worktree list`
      names, and any other clone — since Git refuses to merge over it and teardown's relocation of the primary to base
      ignores that refusal (`relocatePrimaryToBase`, `lib/work-unit/verbs/teardown.ts`).
    - The guard's refusal of an absent or invalid npm policy names, beside replacing the file, committing it as the
      installer writes it, so every worktree of the repository holds it (`guardProjectionIgnores`'s remedy,
      `lib/store/projection/ignore-guard.ts`).
    - At a spawn, into a worktree that has none, and at `arc sync` (1.9). At a command's start, a checkout 1.1 gives a
      projection whose index reads `missing` or `unusable`, and one it gives none whose index reads `unusable`, which
      2.1 and 2.2 check and persist as one it gives a projection, gets the materialization where `startUnderLease`
      (`lib/store/projection/engine-start.ts`) now returns `no-projection` or refuses with "Restore a readable
      projection index".
    - A spawn materializes at the end of `provisionSpawnedWorktree`
      (`lib/work-unit/mutators/reconcile-work-unit-worktree.ts`), once the marker exists — written there on the in-repo
      path, and before it by `claimSpawnedWorktree` (`lib/work-unit/spawned-worktree-claim.ts`) from the flip — and once
      `provisionTransientLocus` (`lib/locus/provisioning.ts`) marks a claim `ready`, in both before the worktree lock
      (`lockSpawnedCheckout`, `lib/git/worktree-removal.ts`). It calls a process-level materialize port this task adds
      to the engine's process state and the root hook binds beside `mint` (`registerProjectionHooks`,
      `lib/store/projection/command-hooks.ts`), which binds 1.3's root for the new worktree under its lock, taken
      through 1.7.a's lock wrapper, with that worktree's own configuration read there, so neither mutator composes a
      store for it, and marks that root as a spawn's through a field of the root this task adds (`ProjectionRootState`),
      which 1.7.b's fan-out reads. A new worktree whose own configuration yields no identity is not materialized, its
      first command running as under the skip switch, and one whose own configuration yields another identity than the
      command's is not materialized, its first command materializing it under its own (spec § 2.5). Before the flip the
      port materializes nothing, as every entry point returns at once (`initializeProjection`,
      `lib/store/projection/engine.ts`); from it, a failure is reported and the spawn completes, the worktree's first
      command materializing it. A spawn in a process whose root hook never ran — a script, or a test that binds nothing
      — finds the port unbound and materializes and reports nothing, the worktree's first command materializing it.
    - It writes the clone's exclude entries (`projectionExcludePatterns`, `lib/store/projection/excludes.ts`, through
      `ensureGitExcludePatterns`, `lib/git/exclude.ts`), then runs the guard through the ignore check (`checkIgnores`,
      `lib/store/projection/ignore-check.ts`, with no recorded guard), which runs `guardProjectionIgnores`
      (`lib/store/projection/ignore-guard.ts`) and returns the guard's basis and the ignore files' records, before
      writing into any root, since on a fresh clone nothing ignores the shared roots until those entries exist, and
      creates the checkout's scratch folder, `.arc/user/<identity>/scratch/work-unit/<slug>/`, for the work unit its
      marker names. The index it writes records that check's result — the ignore files (`ignoreFilesAfter`) and the
      guard's basis (`ProjectionIndexSchema.ignoreGuard`: a pass's basis, null after a refusal) — through one helper
      this task extracts from the sweep (`sweepAsideFolder`, `lib/store/projection/sweep.ts`), which the start's sweep
      and 1.7.b's fan-out record through too, so a fan-out later in the command does not skip the worktree as one with
      no guard pass (1.7.b).
    - With no usable index (`readProjectionIndex`'s `missing` and `unusable` causes,
      `lib/store/projection/index-file.ts`): a file at a path the current projection lays a stored record at is
      refreshed only where its blob id, stamp aside, equals its stamp's, or, stampless, the stored content's; every
      other file under a projected root is left, written over by nothing, sent nowhere, and marked withheld in the new
      index, as is each aside copy the sweep returned withheld (`SweepResult.withheld`, `sweepAsideFolder`,
      `lib/store/projection/sweep.ts`; `ProjectionIndexSchema.withheldCopies`). Files write-back never adopts and
      `MACHINE_LOCAL_PATHS` entries, both of which `isExcludedProjectionPath`
      (`lib/store/projection/discovery-exclusions.ts`) answers, are left alone. Deleting a withheld file releases it:
      pending where a record projects at its path, its entry gone otherwise. A rebuild with no usable index sets the
      changed mark (`RecordEntry.changed`, `lib/store/projection/index-schema.ts`) on every file it found on disk, since
      it cannot tell which of those the checkout changed, until the next `arc save`; a file it writes where none stood
      is unmarked, so a fresh worktree's materialization marks nothing.
    - A listing that is not whole writes files only for the records it returns; a record listed only as a diagnostic
      (`ListingDiagnosticSchema`, `lib/store/read.ts`) projects no file and is reported.
    - It writes every root group's partition, then the header (1.2). Its renders take their protection from 1.4.b, the
      owner's meta answered from the records its listing returned and the holder search from one listing of the
      worktrees, so protection adds no store `read` to it.
    - Build `test-first` (one behavior at a time):
        - Integration tier, over the reference backend and a real linked worktree
        - a fresh worktree materializes every projected record at its layout path, stamped, and its scratch folder, and
          marks no file changed
        - a spawn's materialization records its guard's pass and the ignore files in the index it writes
        - a spawn into a worktree with no npm policy reports a failed materialization naming the policy's remedy, which
          names committing the installer's file
        - a spawned worktree whose own configuration yields another identity than the command's is not materialized, and
          its first command materializes it under that identity's personal root
        - a claimed worktree with no index materializes at its first command
        - a checkout 1.1 gives no projection that holds an unusable index is rebuilt at its start, as a claimed one is
        - a materialization failing at a spawn is reported, and the worktree's first command materializes it
        - a spawn before the flip, and one whose port is unbound, materialize nothing and report nothing
        - with the index deleted, an unedited file is refreshed and an edited one is withheld and reported
        - with the index deleted, `arc selection --changed` lists every editable projected Markdown file until
          `arc save` — the selection leaves out protected files and files holding markers (`selectProjectedMarkdown`,
          `lib/store/projection/selection.ts`)
        - with the index deleted, an aside copy the sweep withheld is recorded withheld in the new index
        - with the index deleted, a removal's aside copy the sweep linked back after a stop is withheld and reported
        - a withheld file, deleted by the person, is marked pending where a record projects at its path
        - a record listed only as a diagnostic projects no file and is reported
        - materializing the files of several work units held in other checkouts reads no meta beyond its listing and
          lists the worktrees once

### `[ ]` **1.6 Refresh from the store's changes — § 15.2**

- _Goal:_ Each command's start brings its worktree up from the state version its index last projected, rewriting only
  the records `changes` names and the files marked pending, moving every file a primary record's change relocates, and
  rebuilding when that state version no longer resolves.

    - `[ ]` **1.6.a Reducing `changes`**

        - The refresh fills a root's `refresh` slot, which the start calls inside its lease after write-back
          (`startUnderLease`), and takes its target root (1.3), its source, the state version it brings the worktree to,
          and the index its caller holds as parameters, returning the index it wrote, so the fan-out refreshes a sibling
          through it unchanged. It asks `changes` for the records since the index's state version, and makes no call
          where that is the version it brings the worktree to. The start passes the version its own `version()` call
          read, and as the source the store the command was given: in `arc save` it holds that store beside the
          history-retry wrap write-back sends through (`retryEndedItemHistory`, `lib/store/history-retry.ts`, applied by
          `initializeProjection`) and passes the refresh the store, never the wrap, so a `changes` refusal naming a
          history ref rebuilds rather than pulls (1.6.b). A fan-out round passes its own version and, as the source, a
          read memo it builds over its store, which answers each distinct `version`, `changes`, `list`, and `read`
          request once in the round, as `createHistoryMemo` (`lib/store/projection/base-recovery.ts`) does for `history`
          (1.7.b): each changed record the round's refreshes stage, and each conflict they render (`readConflicts`,
          `lib/store/projection/record-render.ts`), is read once, and the view selection a primary entry's re-lay makes
          (`selectProjectionView`, `lib/store/projection/view-selection.ts`), the only one a refresh makes, reads
          through the same source once in the round. Its renders take their protection from 1.4.b over that source and
          the round's listing of the worktrees, and it loads the index partitions holding the paths it lays or removes
          (1.2). A write landing during the round reaches the next round (1.7.a), so the memo's answers stay the
          round's. The refresh hands the replace guard (`guardReplacement`) the store itself, never the memo, since its
          restage after a take-in must read the version the take-in landed (`restage`,
          `lib/store/projection/replace-guard.ts`). The start passes the index it holds from its sweep (below), so the
          refresh's first write publishes the stats and the ignore record the start observed before the reference moves
          past them (`spec-projection-substrate.md` § 3.3); the fan-out passes the index its visit holds (1.7.b). The
          slot takes none today (`ProjectionRootState.refresh`, `lib/store/projection/process-state.ts`).
        - The start keeps one index in memory from the sweep through write-back, any reprojection (1.8), and the refresh
          to its last write, under its own lock. The sweep (`sweepAsideFolder`, `lib/store/projection/sweep.ts`) commits
          on its own (`commitReturnedCopies`) only where it took over a copy; write-back's sends and adoption commit the
          index the start holds, as they do; a reprojection (1.8) and the refresh each take the index the start holds
          and return the one they wrote, which it holds after them; and the start's last write publishes what remains,
          its measurement among it (1.12.b). So each write publishes every stat (`checkFileAtPath`) and ignore record
          observed before it, against the reference that predates them, as `spec-projection-substrate.md` § 3.3 and
          `spec-projection-write-back.md` § 16.4 require, and the start of a command with nothing changed writes once,
          last. Today the sweep's commit is the start's only write in a command with nothing changed, made before
          write-back reads any file; the index write-back returns is discarded and the refresh slot is passed no index
          (`startUnderLease`), so a file a swap left smudged is hashed at every start until a command sends an edit.
        - Refresh keeps each record's newest entry. An entry for a primary record — a meta, an Errand record, or a
          cohort document — re-lays every record its owner holds (`list` by `owner`, `ListInputSchema`,
          `lib/store/read.ts`), moving each file whose path changed by the removal swap and a write at the new path, an
          edit at the old path taken in first (`swapBatch`, `lib/store/projection/swap.ts`, marking the removal
          `SwapFile.relaid` only where another record now lays at the vacated path), its changed mark
          (`RecordEntry.changed`) moving with it through a mover this task adds. A meta's entry adds or removes its
          `current/` copy of each cohort document its `Cohort` names, the copy named by the field's text
          (`lib/layout/projection.ts`), a former slug a renamed cohort keeps included. A read of that cohort by name
          that refuses `not-found` — a member naming a removed cohort — lays no copy and removes any the meta's earlier
          text left; one that refuses `ambiguous-match` — two cohorts clashing on the name — leaves the copy as it
          stands. Either is reported and neither refuses the command, since a clash's repair, `arc rename` with the
          cohort's UID, runs from a member's checkout. An archive, an abandon, or an owner leaving the view removes the
          files.
        - A conflict-record entry refreshes the file of the record it names, or, for a removed conflict, the file the
          index maps it to — by its marker set, its notice line, or, for a conflict the file does not show, the file's
          entry (`MarkersSchema`, `RecordEntry.notices` and `unshown`, `lib/store/projection/index-schema.ts`). A
          conflicted file refreshes through the merge `prepareConflictedRefresh` prepares
          (`lib/store/projection/conflicted-refresh.ts`), but for one holding a resolution in progress or a malformed
          set, which the replace guard holds whole (`guardReplacement`, `lib/store/projection/replace-guard.ts`): the
          refresh leaves it unreplaced and records in its entry the open conflicts of the version it read.
        - Every file marked pending is refreshed too, and a pending file whose record has left this projection is
          removed by the removal swap (`swapBatch` with no staged file, then `dropRemovedEntries`), so a removal a
          take-in deferred is retried.
        - The start's refresh writes only into roots the sweep's ignore check passed (`checkIgnores`,
          `lib/store/projection/ignore-check.ts`, which `sweepAsideFolder` runs at every start and the root reads as
          `writable`) and runs no guard of its own; the check reruns the guard only when the ignore basis it recorded no
          longer matches. The fan-out runs `checkIgnores` for each worktree it writes into (1.7.b).
        - Build `test-first` (one behavior at a time):
            - a changed record rewrites only its file, and an unchanged one is not touched
            - a sibling's root whose files a refresh replaced is marked `ready` and gets the command end's second check
            - a rename re-lays every file the owner holds, an edit at the old path taken in first
            - an archive removes the work item's files from `active/`
            - a cohort document's change rewrites its folder's file and each `current/` copy
            - `arc rename` of a cohort moves its document's file, its subcohorts' and members' backlog folders, and each
              member's `current/` copy to the new name
            - `arc cohort close` moves the cohort document's file under `completed/`, and `arc cohort remove` removes it
            - a member whose `Cohort` names a removed cohort lays no copy and its command proceeds, reported; under a
              clash on the cohort's name, the member's copy stays as it stands and its command proceeds, reported
            - a resolved conflict's markers or notice line leave its file
            - a withheld file the person deleted is written fresh from the store at the next command, and leaves
              `arc status`
            - a deferred removal whose edit lands at the next command's start is still removed by that command's refresh
            - a pending file whose record left the projection is removed at the next refresh
            - a file a stopped replacement left pending is rewritten at the next refresh, in `completed/` too
            - an edit refused at removal stays at its path through each refresh until resolved, then is removed
            - a removed file a sweep linked back is removed again at the next refresh
            - `arc save --resolve` on a withheld subject refuses naming 1.5's remedy, and resolves once the file is
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
            - a root whose ignore check refused is not written into, and is written once the ignore file is repaired
            - the save-loss harness (`runSaveLoss`, `__tests__/helpers/store/projection/save-loss.ts`), given a refresh
              among its operations (`SaveLoss.operation`), loses no save timed into a refresh in any save mode
              (`SAVE_MODES`)
            - a no-change start publishes the stats its change checks re-recorded, and a file a swap left smudged stops
              being hashed at later no-change starts
            - a sweep that took over a copy commits before write-back reads a file
            - where the refresh writes, its first write publishes the stats the start's change checks re-recorded and
              the ignore record, and a same-tick save after an observed stat reads changed at the next start
            - a start with nothing changed, its sweep finding the aside folder empty, no edit sent, and nothing laid,
              writes its index header and reference once, after its change checks and refresh

    - `[ ]` **1.6.b A state version that no longer resolves**

        - When `changes` refuses `state-unresolvable` — naming a history ref in `historyRefs`, or naming none for a
          window short of the current state version past more than one end of an item (`spec-storage-ref-backend.md`
          § 4.6) — the command rebuilds from current state, pulling nothing: every projected record refreshed by the
          same rules, every index entry the state no longer holds, every group loaded for it (1.2), handled as a
          removal, pending marks and the replace guard applied, and the index taking the current state version.
          Write-back has already run, so no edit is lost.
        - A file is removed only on a complete listing, with nothing missed and no diagnostic, that no longer holds its
          record, or on a listing that answers `absent`, which the ref backend answers for a complete live listing that
          finds nothing (`liveListingOutcome`, `lib/store/ref/read.ts`).
        - Build `test-first` (one behavior at a time):
            - a `changes` refusal of `state-unresolvable` rebuilds the worktree and loses no pending edit
            - a refusal naming a history ref rebuilds the same way and pulls nothing, in `arc save` too, through the
              wrapping test store (`createRefusingStore`, `__tests__/helpers/store/projection/refusing-store.ts`, whose
              `calls` counts the `pull`s)
            - the rebuild removes the files of a `completed/` quarter whose records all left the state, though no walk
              or mark loads it
            - a re-lay whose owner listing answers `absent` removes the owner's files
            - a listing reporting `missed`, or answering `unreadable`, removes nothing

### `[ ]` **1.7 Fan out from the store `createStore` builds — § 2.2, § 1.2**

- _Goal:_ Once a write or a pull's merges land, the writer brings every worktree on the machine that holds a projection
  up from that worktree's own state version, taking each one's projection lock in turn — and whatever fan-out misses,
  the next command's start refreshes.

    - `[ ]` **1.7.a The wrapper**

        - `withFanOut(store, deps)`, exported from `lib/store/projection/`, wraps a store once: `write` and `batch` fan
          out after a landed write, and `pull` and `push` after every call whatever the outcome, since a push runs pulls
          and a refused or timed-out sync may still have merged. `createStore` (`lib/store/create.ts`) applies it to the
          store `lazyStore` returns, beside the capability record already there (`recordComposedStoreCapability`,
          `lib/store/projection/process-state.ts`); tests apply it to the reference backend and `createRefStore`.
        - It is inert while `capabilities.stateOffBranch` is false. A write, pull, or push made under a projection lock
          fans out once that lock is released, a history pull `retryEndedItemHistory` (`lib/store/history-retry.ts`)
          makes under `arc save`'s start or a persist or release step among them, since that wrap passes `pull` to the
          store this wraps. A command's start fans out once for all its write-backs through its root's `fanOut` slot,
          which `initializeProjection` (`lib/store/projection/engine.ts`) calls after releasing the start's lock when
          the start took an edit in (`ProjectionRootState.changed`) or a pull or push ran under its lock, which the
          wrapper records in the process state. A write landing during a fan-out — a take-in in a sibling's refresh, a
          stub minted by adoption — joins that fan-out's next round through the process state's `fanOutRounds` rather
          than starting another. Under `--skip-projection` (`ProjectionSkip` with reason `switch`), and in a command
          whose configuration yields no identity, which runs as under it (reason `no-identity`), nothing fans out.
        - Every other projection lock this member takes — the persist and release steps (2.2, 2.3) and both
          materializations (1.5, 1.9) — goes through one wrapper over `withProjectionLock`
          (`lib/store/projection/lock.ts`) that sets the process state's `lockHeld` while it holds the lock and, once
          the lock is released, runs the fan-out a write, pull, or push under it deferred, as `initializeProjection`
          does for the start; one under a lock the fan-out itself holds joins its next round. The command's end
          (`endProjection`, `finishProjectionRoot`) fans out nothing: an edit its second check takes in reaches the
          other worktrees at their next command start or the next fan-out (spec § 2.2, § 17), and what the end deferred
          is dropped. So no command fans out while holding a lock, and every deferred round but the end's runs.
        - Both creation paths of `arc start --new` commit their scaffold batch (`scaffoldIntoWorktree`,
          `lib/git/worktree-scaffold.ts`) before they stamp the checkout marker's UID (`stampCreatedWorkUnitMarker`,
          `lib/work-unit/created-work-unit-marker.ts`): `completeCreatedWorktree` (`commands/start.ts`) and the cold
          start (`commands/start-cold-store.ts`). Each holds that batch's fan-out through a hold of its own in the
          process state, which the fan-out's deferral reads as it reads `lockHeld` and 1.7.b's provenance rule does not,
          so the batch stays the verb's own write and marks its files changed, and runs it once the stamp has run, so
          this process lays no copy of the new meta while the marker naming it is unbound, which `checkoutRights`
          (`lib/store/projection/rights.ts`) would answer as `checkout-not-writable` and protection would lay read-only;
          where the stamp refuses, the fan-out still runs, and the unbound marker it leaves is the repair state spec
          § 16.3 names. A render another process makes in that window is reprojected in the claimed worktree once the
          UID is bound (1.8), and lags elsewhere as spec § 17 item 7 says.
        - The wrapper returns the store's result as the store gave it: a fault fanning out into one worktree is reported
          for that worktree and skips it (1.7.b), and nothing a fan-out meets fails the write it follows.
        - Build `test-first` (one behavior at a time):
            - a landed write fans out, and a refused one does not
            - a `pull` reported `failed` after merging still fans out
            - a write made under the start's lock fans out once, after release
            - a write made under the persist step's lock fans out once, after release, while the command holds no lock
            - an edit `arc sync`'s materialization takes in under its lock fans out once, after the lock is released,
              and the process state's `lockHeld` is set only while the lock is held
            - a history pull `arc save`'s start makes for a refused read fans out once, after the start's lock is
              released, though the retried read lands no write
            - a history pull a persist step makes fans out once, after that step's lock is released
            - a fault fanning out into one worktree is reported, and the write returns the store's result
            - an edit the command's end takes in fans out nothing, and a sibling takes it at its next command
            - `arc start <slug> --new` lays the new work unit's meta editable in the new worktree, and no other
              worktree's copy carries a repair notice
            - a creation whose stamp refuses still fans out, its meta laid protected with the unbound marker's repair
              notice
            - after a creation's refused stamp, `arc materialize <slug> --here` binds the marker, and the next command
              there lays the meta editable
            - a take-in during a sibling's refresh fans out in the same fan-out's next round
            - over the in-repo implementation, a write fans out nothing and makes no Git call

    - `[ ]` **1.7.b One fan-out**

        - One `scanRegisteredWorktrees` call (`lib/git/worktree-roster.ts`) lists the machine's worktrees, detached ones
          included. Each one's Git directory is read from its roster path's `.git` by `readGitDirectories`
          (`lib/git/directories.ts`), which throws where `.git` is missing or invalid — never by `locateProjection`,
          whose fallback runs `git rev-parse` and resolves inside a separate Git directory. A path holding no `.git`, as
          Git lists a primary whose `.git` is a `gitdir:` file at its Git directory, or whose aside folder holds no
          reference stamp (`readReference`, `lib/store/projection/change-detection.ts`), as Git lists such a primary at
          that directory's parent where it is named `.git`, is skipped with no Git call, that checkout refreshing at its
          own next command. Each holding a projection has its index header read for its state version, as 1.2's
          lock-free reader reads it, then, in each round, one `version()` call, one `changes` call per distinct state
          version, and one call for each distinct record read or listing the round's refreshes make, all through the
          round's read memo (1.6.a), which every worktree's refresh in the round reads through. The writer's own
          worktree is found from its own root, never from the roster, whose entry for its Git directory it skips.
        - Each worktree is taken under `withProjectionLock` with `{ maxWaitMs: SIBLING_LOCK_WAIT_MS }`
          (`lib/store/projection/lock.ts`), since the default waits 10 s; a lock held past 200 ms by another — the
          writer's own worktree included — skips it, and a result of `lost` or `gone` skips it from its next step, the
          fan-out going on. Under the lock its index is read again, and the worktree skipped when its state version
          moved, when it is already current, when its state version no longer resolves, or when its index is unusable or
          of another format version. A worktree that stays is bound through 1.3's binder, with the command's
          configuration read and actor — one the command's roots already hold re-read into the root it holds (1.3) — is
          checked against the skip rule below before anything else runs there, has `checkIgnores` run for it (1.6.a),
          and is refreshed through 1.6. Its index, read under its lock, is the one every write of the visit takes and
          returns, as at the start (1.6.a): the fan-out records `checkIgnores`' result into it as the sweep does at the
          start, its ignore files (`ignoreFilesAfter`) and its guard's basis (`ignoreGuard`: a pass's basis, null after
          a refusal), through the helper 1.5 extracts from the sweep (`sweepAsideFolder`,
          `lib/store/projection/sweep.ts`), and the refresh takes the index the visit then holds. Protection's searches
          take the fan-out's own listing of the worktrees for its first round and a fresh one for each later round
          (1.4.b).
        - The binder reads the worktree's claim, its marker's UID (1.8), and `layout.active` fresh under its lock (1.3).
          A sibling is skipped where they, or the command's view setting and identity, differ from what its index
          records it was projected under (`ProjectionIndexSchema.projectedUnder`), or where its index records no guard
          pass (`ProjectionIndexSchema.ignoreGuard` null), as a refused guard leaves it, or one under another ignore
          configuration than the command's (`IgnoreGuardBasis`), so no file is laid from a recorded claim and no guard
          runs on another worktree's basis; that worktree's own next command reprojects it (1.8). The writer's own
          worktree is never skipped for a difference: a verb run there may have changed its claim, so it is reprojected
          in place through 1.8 before its refresh, the refresh taking the index the reprojection returned, and the
          verb's changed marks land. Nor is a worktree a spawn materialized earlier in the command, whose root 1.5 marks
          as a spawn's, skipped for a difference in its claim or `layoutActive` alone, as the creation's stamp makes one
          by binding the UID (1.7.a): it is reprojected in place through 1.8 before its refresh, as the writer's own is,
          and marks nothing changed; a difference in its view setting, identity, or ignore configuration still skips it.
          A worktree whose binding or refresh throws is reported and skipped, the fan-out going on. A primary entry's
          re-lay lists its owner's records once per round, through the same memo, and each worktree's refresh reads
          `history` through the command's memo (`ProjectionProcessState.history`, `process-state.ts`;
          `createHistoryMemo`, `lib/store/projection/base-recovery.ts`): at most one call per record between the
          command's write-backs to that record, since a write-back's read-back drops the record's memoized answer, so a
          take-in landing during the fan-out costs the next worktree one more call.
        - A verb's write marks its own checkout: the fan-out's refresh of the writer's own worktree sets the changed
          mark (`RecordEntry.changed`) on each file of a record the writer's own write landed, and no sibling's, through
          a setter this task adds. A landed write is the verb's own only where it lands with no projection lock held
          (the process state's `lockHeld`, 1.7.a): a take-in, or a stub adoption mints, lands under the lock of the root
          that sends it, so one landing during the fan-out joins its next round and marks nothing. The provenance verb
          would not tell them apart, since a minted stub carries the `stub` verb (`runStub`, through
          `mintProjectionStub`) rather than a take-in's (`HAND_EDIT_VERBS`, `lib/store/links.ts`). A refresh that only
          rewrites a file, from a sibling's write or a pull, sets none, and a verb writing for another checkout, as
          graduation does into a spawned worktree, marks nothing there.
        - Build `test-first` (one behavior at a time):
            - Integration tier, over the reference backend and real linked worktrees
            - an edit written back in one worktree reaches the other worktrees' copies
            - a write from a checkout with the projection off (1.1) reaches a sibling's projection
            - a pull's merges reach every worktree
            - a fan-out visiting two siblings at different state versions leaves the same files and index entries in
              each whichever it visits first, a take-in during the first visit's refresh included
            - two worktrees refreshing one conflicted record, with no take-in during the fan-out, read its `history`
              once, and a take-in landing between them adds one call
            - a round over two worktrees at one state version, after a meta's write, calls the store's `version` once,
              `changes` once, the owner's `list` once, and `read` no more than once per record, and selects the view
              once (`createRefusingStore`'s `calls`)
            - a one-file task-list write fanned into worktrees holding other work units reads the owner's meta at most
              once, looks up no claim, and lists the worktrees once in its round, its Git processes counted as
              `notes-projection-worktrees.md` § Spike 3 counts them
            - a meta write from another checkout fanned into the owner's checkout looks up the owner's claim once
            - a start whose lease is lost leaves its root unready, and a later fan-out's refresh there marks it `ready`,
              so the end checks that refresh's copies
            - a worktree another refresh brought up first is skipped
            - a worktree whose lock is held past 200 ms is skipped and refreshes at its own next command
            - a worktree whose lease is lost mid-refresh is skipped, the fan-out going on, and refreshes at its own next
              command
            - a worktree with an older index format is skipped and refreshes at its own next command
            - a sibling whose marker changed since it was projected is skipped, nothing laid there, and reprojects at
              its own next command
            - a worktree a spawn materialized earlier in the command, whose marker's UID the command then bound, is
              reprojected in place by the fan-out, its files laid under the bound claim and none marked changed, and one
              whose own view setting differs from the command's is skipped
            - a sibling the command already holds from an earlier fan-out, not a spawn's, whose marker changes before
              the command's next fan-out is skipped there, nothing laid, while a spawn-marked root in the same fan-out
              is reprojected in place
            - a worktree whose marker cannot be read is reported and skipped, the fan-out going on
            - a sibling whose index's guard last passed under another ignore configuration is skipped, no guard run
              there
            - a sibling whose index records no guard pass is skipped, no guard run there
            - a fan-out visit whose ignore check refuses one root records no guard pass in the index its refresh writes,
              and the next fan-out skips that sibling, no guard run there
            - a worktree spawned earlier in the command under another identity, left unmaterialized, gets nothing from
              the fan-out
            - `arc start <slug> --new --here` in the primary lays the new work unit's files under its claim and marks
              them changed, so `arc selection --changed` lists them
            - a primary made by `git init --separate-git-dir`, which Git lists at its Git directory, is skipped, nothing
              written under that directory, and refreshes at its own next command
            - a primary whose separate Git directory is named `.git`, which Git lists at that directory's parent, is
              skipped, nothing written in that parent
            - a writer that is such a primary refreshes its own worktree
            - a sibling whose ignore file changed since its check last passed has the guard run before the fan-out
              writes into it
            - a sibling with the `all` view takes another person's new work unit, and one with `mine` does not
            - `arc save`'s writes reach the other worktrees' copies
            - a verb's write marks its record's file changed in the writer's checkout and in no sibling's, and a pull's
              merges mark nothing
            - a take-in, and a stub an adoption mints, landing during the fan-out mark nothing in the writer's checkout
            - a process whose root hook bound no ports fans out nothing, each sibling refreshing at its next command
            - a write made under `--skip-projection` reaches no sibling until that sibling's next command
            - a record landing for a sibling's hand-edited file between the round's `version()` read and that file's
              take-in, through a store double that lands it there, is neither overwritten nor taken as the edit's base:
              the edit merges with it, or is held pending or in conflict with the remedy write-back reports, and the
              file afterwards holds what the take-in left, never the round's version of the record; a write to an
              unrelated record landing at the same point holds nothing back, laid by the next round where the take-in
              lands and by that worktree's next refresh where it is held
            - `arc rename` run from one worktree, whose start fanned an edit into the holder's worktree, leaving an
              aside copy there, then moves that worktree's folder: the root is dropped and reported, the command's end
              reads and writes nothing at either path for it, a later fan-out in the same command binds the worktree at
              its new path, and that worktree's next command's sweep takes the copy in
            - `arc rename` run in the holder's own worktree moves nothing, its deferred move printed, and the command's
              own root stays held, its end checking that worktree as before

### `[ ]` **1.8 Reproject on a changed view setting, identity, claim, or layout — § 10.4, § 10.3**

- _Goal:_ A command that reads a view setting, identity, checkout claim, or `layout.active` different from the one its
  index recorded reprojects what it governs — views added, files leaving a view by the removal path, the new identity's
  personal root laid on a changed identity, and `current/`, its scratch folder, and owning-checkout notices following
  the claim or layout.

    - The comparison is against the index's `projectedUnder` (`ProjectionIndexSchema`), whose claim this task extends
      from the slug alone (`ProjectedUnderSchema`) to the slug and the marker's UID, absent while the marker is unbound,
      so a bind that keeps the slug — `arc materialize <slug> --here` after a creation's refused stamp among them —
      reprojects, read against the root's fresh claim, `layoutActive`, and view (1.3). The claim's read
      (`readFreshCheckoutLayoutContext`, `lib/store/checkout-layout.ts`), which decodes the marker
      (`decodeWorktreeMarkerOwnership`) and returns the slug alone, gains a fresh form that returns the subject's `uid`
      beside the `ActiveLayoutContext` it returns, absent while the marker is unbound, and caches that context as the
      fresh read does (`readCheckoutLayoutContext` with `fresh: true`). `ActiveLayoutContext` keeps its shape, since its
      readers take it whole: `activeContainer` (`lib/layout/file-identification.ts`) spreads it into a strict schema
      (`OwnActiveLocationSchema`, `lib/layout/schema.ts`) that refuses another key. 1.3's binder calls that form at
      every binding and at every re-read into a root the command holds, carrying the UID into the root beside `claim`
      (`ProjectionRootState`), which stays the slug its readers take (`identifyArcFileAddress`). A release, a promotion,
      or a materialize changes the marker without a store write, so this comparison is what catches it.
    - The fan-out's visit to the writer's own worktree (1.7.b) runs the same comparison against the claim and layout it
      re-reads into the command's root, and a difference is reprojected in place before that visit's refresh, so a verb
      that changes its own checkout's claim and writes in one command lays its records under the new claim and marks
      them changed. Its visit to a worktree a spawn materialized earlier in the command does the same where the claim or
      `layoutActive` alone differs, as after a creation's stamp, marking nothing there (1.7.b).
    - The reprojection writes the index through its swaps (`swapBatch`), so it takes the index its caller holds and
      returns the one it wrote, as every write of the start and of a fan-out's visit does (1.7.b, 1.6.a): at the start,
      the index held since the sweep, and at the visit, the one read under the lock with the ignore check's record in
      it; the refresh after it takes what it returned.
    - On a changed identity it lays the new identity's personal root and leaves the previous identity's as it is — its
      files, and their entries in that identity's own partition (1.2) — neither removed nor refreshed while the identity
      differs, since the take-in's rights and the writable roots answer for the current identity alone
      (`readProjectionEditRights`, `lib/store/projection/rights.ts`; `writableUnder`, `lib/store/projection/sweep.ts`)
      and the personal-root ignore pattern covers every identity (`projectedRootPatterns`,
      `lib/layout/projected-roots.ts`); the start walks that root again once the identity returns.
    - The selection (`selectProjectedMarkdown`, `lib/store/projection/selection.ts`), which takes no identity, takes the
      root's through a parameter this task adds — `projectionSelectionResult` passing `ProjectionRootState.identity`
      from the root it holds, and the selection's direct test calls passing one — and lists no file under a personal
      root of another identity, since no edit there is sent while the identity differs; the removal check and the
      persist and release steps read that root with the projected roots (2.1, 2.2), and the release of a linked checkout
      removes its unchanged files with the rest (2.3).
    - A file of the old claim's work item at a path the new one's also projects at — a path-keyed companion — is removed
      by the removal path, its edit taken in against its own record, and the next refresh lays the new file there
      (`swapBatch` with `SwapFile.relaid`, which keeps the old entry pending and absent).
    - Build `test-first` (one behavior at a time):
        - switching the view from `mine` to `all` adds the other in-flight work items
        - switching back removes them, an edit there taken in first
        - a changed claim re-lays `current/` to the newly named work item and creates its scratch folder
        - a fan-out visit that reprojects the writer's own worktree and then refreshes it keeps the reprojection's
          entries and its `projectedUnder`, and an ignore-file change made after the visit's ignore snapshot is found at
          the next start
        - a write in a command whose own checkout's claim changed from one work unit to another in that command
          reprojects it at the fan-out: the old work unit's files leave `current/`, the new one's are laid there, the
          files of the records the write landed marked changed, and the start's aside copies still reach the end's
          second check
        - a save placed by the `afterRecheck` hook (`SwapHooks`, `lib/store/projection/swap.ts`) at a path both claims'
          work items project at is taken in against the leaving record, and the next command lays the arriving file
          there
        - a changed identity lays the new identity's personal root and leaves the previous identity's files and entries
          as they were, an edit there kept, and changing back walks them again
        - after a changed identity, `arc selection` lists none of the previous identity's files, and lists them again
          once the identity returns
        - after the claim's read in a checkout whose marker is bound, the cached layout context holds only `claim` and
          `layoutActive`, and an unindexed file in the checkout's own `active/current/` folder still identifies as
          `work-unit-companion` (`identifyArcFileAddress`)
        - setting `layout.active: flat` moves `current/`'s files to `active/`'s top level
        - `arc save --resolve` on a conflict whose subject projects in no file here resolves once a changed view lays
          its file

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
      `taken-in.ts`). The remedy is the one write-back's refusal of it names (`unfinishedRecordingRefusal`,
      `lib/store/projection/recording-state.ts`), `arc save` run there, whose walk finishes each, since every one is
      left pending: the send finishes a recording before it prepares (`completeWriteBackRecording`,
      `lib/store/projection/write-back-recording.ts`), and the walk resumes an adoption's read-back
      (`resumeAdoptionReadBack`, reached from `checkFileAtPath`, `lib/store/projection/engine-files.ts`). That refusal
      is made locally, not by a store read, so the check classifies the state by the entry's mark before the read path
      runs, for every entry the index holds whether or not its file changed, since the walk re-sends a pending entry
      either way (`checkFileAtPath`), never through the store-refusal rule above, which would read it `unobservable`.
      The persist step would finish it (2.2), but finishing writes — a completion can keep a copy (`keepCopy`), and a
      resumed read-back installs the file — and the check writes nothing, so it holds the removal until a command run
      there has finished it. Two cases fall outside that walk, which reaches only the configured identity's personal
      roots (the start's walk, `engine-start.ts`) and skips a write-back's absent file (`checkFileAtPath`): such an
      entry in another identity's personal root answers as an edit there does, naming that identity's remedy (below),
      and a write-back's recording whose file is gone holds nothing, its write having landed and no walk re-sending it.
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
          does not hold answers the same, and an unchanged one passes
        - a checkout with no projection answers `passes`, with no identity configured too
        - a claimed checkout whose index was deleted answers `unobservable`, never `passes`
        - an unclaimed checkout that still holds an index is checked as any other, never passed
        - the check writes nothing and takes no lock

### `[ ]` **2.2 The persist step — § 12.2**

- _Goal:_ The `persist` slot writes back every edit in the target checkout under its projection lock, every projected
  root included, takes over every settled aside copy, and refuses with the blocking file's remedy rather than let a
  removal drop an edit — releasing the lock before it returns.

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
      or an accepted-input recording the step could not finish among them — the file keeping its content. A recording
      reaches the step unfinished only where it arrived after the check, which holds one left before it (2.1); the step
      finishes it under the target's lock as the command's walk does (`writeBackProjectionFiles`,
      `lib/store/projection/engine-files.ts`): an accepted adoption awaiting its read-back by resuming it
      (`resumeAdoptionReadBack`), which refuses where the record's read refuses, and any other by the send, which
      finishes a recording before it prepares (`completeWriteBackRecording`,
      `lib/store/projection/write-back-recording.ts`), refusing where its retained copy, the record's read-back, or the
      accepted version's history cannot be read; each refusal names the repair it reports. A file
      write-back leaves pending refuses with the remedy write-back reports for it, or a retry where it reports none. A
      symbolic link, at a path the index lists or not, is never adopted and refuses nothing.
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

- `[ ]` Ready for integration
