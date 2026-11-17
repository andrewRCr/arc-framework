# Task List: Projection Team Scale

- **Design:** `spec-projection-team-scale.md`

---

## **Phase 1:** The read-only archive and `arc edit`

_Purpose:_ Lay the projected archive read-only and open one archived file at a time with `arc edit`, recording what is
open in the index — spec § 1.3's first chunk.

_Mode:_ `slice` through Phase 2 — closes on an archived file corrected in place end to end, with `arc save` reading only
what is opened.

_Design decisions:_ This list builds on `projection-worktrees`' index partitions, staging, refresh, fan-out,
materialization, and removal steps, grounded at that unit's merge, `57a4ea7df5` (`notes-projection-team-scale.md`
§ Grounding basis), and on `projection-write-back`'s edit rights, adoption, and `arc save`, on base. Phases review as
spec § 1.3's chunks, one chunk a phase, each landing with tests of its own code; a test that also needs a later phase's
code lands with that phase. Tests run as the projection's do, over the reference backend with real repositories and
worktrees, on Linux and in the portability lane (spec § 1.1). The opened mark's lifecycle and each § 9.1 step pair is
assigned to the parent that wires it (`notes-projection-team-scale.md` § Lifecycle rows).

### `[x]` **1.1 The opened mark and the index's format version — § 4**

- _Goal:_ An opened file is recorded on its entry in its own worktree's index and makes that entry unsettled, so every
  start finds it among the partitions the header marks; the mark survives adoption and a moved path; and a build
  without it rebuilds the index rather than rewriting a partition without the mark.

    - `[x]` **1.1.a The mark and what it makes unsettled**
        - Record bases and journaled arrivals accept an optional opened mark; ownerless entries require either the
          mark or a refusal. Readers handle an absent refusal. Opening an archived entry marks its partition
          unsettled, so the walked load finds it while other archive quarters stay unread; opened ownerless entries
          round-trip and report without a fabricated refusal.

    - `[x]` **1.1.b The format version**
        - Format 3 records opened state; materialization and test fixtures use the shared format constant. Format-2
          indexes stay untouched by fan-out and command end, and rebuild at the next start.

    - `[x]` **1.1.c Adoption and a moved path keep the mark**
        - Adoption acceptance and attachment retain opened state. A refresh carries it before staging the new path,
          defers the old path until that state has a carrier, and parks it by record identity at a reused path;
          installation and withdrawal preserve it through retries without opening a different arriving record.

### `[x]` **1.2 `arc edit` — § 3**

- _Goal:_ `arc edit <path>` opens one archived file in this worktree — after its start takes pending edits in, under the
  worktree's projection lock, setting the opened mark and then the write bit, changing no content — and refuses every
  other path with its reason and remedy, so it stays the one way an archived file opens and moves no authority.

    - `[x]` **1.2.a The command and its help**
        - Registered the lazy edit handler, owned path and JSON inputs, and command help. The help distinguishes
          opening a file for editing from opening an editor, and names arc save's read-only lay.

    - `[x]` **1.2.b Opening a file**
        - Added the leased opening operation and its checkpoint hook: opened intent commits before the owner write
          bit changes, without altering bytes or writing a record. Existing and new archived work-unit and Errand
          files open under their owner's rights; anyone may open an archived cohort document.

    - `[x]` **1.2.c The refusals**
        - Composed adoption's read-only target and file verdicts, with distinct remedies for invalid locations,
          ownership, missing and excluded files, held evidence, projection availability, identity, and lock failures.
          Late partition mismatches invalidate the partition under its lease; a retry rebuilds and opens it. The built
          CLI refuses unsupported before the storage switch and leaves tracked archives writable.

### `[x]` **1.3 Lay an archived file by its lay mode at every staging — § 2.1, § 2.3**

- _Goal:_ Every staging lays an archived file read-only unless the target worktree's own entry for it is opened, where
  it lays writable — save that `arc save`'s own landing lays it read-only in its own worktree — and lays every file
  outside `completed/` by its protection mark as today, so no staging path leaves an unopened archived file writable.

    - `[x]` **1.3.a The rule in staging**
        - Both staging functions require an explicit lay mode, combined with edit-rights protection without changing
          the stored protection mark. Archive test corrections now open explicitly; forced edits retain their chmod.

    - `[x]` **1.3.b Every caller passes the lay mode from the target worktree's own entry**
        - Read-back, clash drawing, guard restaging, materialization, and reused-path installation compute the mode
          from the target entry. Save landings distinguish the saving checkout from its fan-out targets.
        - Coverage exercises spawn, rebuild, sync restoration, refresh, fan-out, adopted read-back, clashes, path
          moves and ownership arrivals, including unchanged files kept in place with their modes.

### `[ ]` **1.4 The `arc edit` notice — § 2.2**

- _Goal:_ Every archived Markdown file whose edit rights allow the edit carries a notice line naming `arc edit <path>`
  then `arc save`, the same whether or not the file is opened, so opening a file and re-locking an unchanged one change
  only its mode, never its bytes.

    - `protectRenderedContent` (`record-render.ts`) adds the notice beside the rights' own for a record placed in
      `completed/` whose rights allow the edit; another person's archived work keeps the rights' notice naming its
      owner, and a file other than Markdown carries no notice line.
    - The renderer learns the placement from the projected path its caller passes in `RecordRenderInput`, which today
      carries only whether the file is stamped; the path is required, so the type names every caller.
      `stageRecordFile` and `prepareMaterializationFile` each hold the path, as does a conflicted refresh, which calls
      the renderer directly (`prepareConflictedRefresh`, `conflicted-refresh.ts`); the lay mode reads the same path.
    - The notice says that `arc edit` opens the file for editing rather than opening an editor.
    - Existing tests that call the renderer directly pass the path (`notes-projection-team-scale.md` § Test migrations).

    - Build `test-first` (one behavior at a time):
        - an owner's archived Markdown file, an archived cohort document, and an owner's archived Errand description
          each carry the notice
        - another person's archived work carries the rights' notice naming its owner, and an in-flight file carries
          neither
        - an archived file other than Markdown carries no notice line
        - the bytes laid for an opened file and for the same file not opened are identical

### `[ ]` **1.5 `arc status` lists opened files — § 4**

- _Goal:_ `arc status` shows each file this worktree has opened, and an opened new path's adoption refusal beside it, so
  a file left open shows, and so does the reason its adoption keeps failing.

    - `ProjectionFileStatus` gains the opened state and `readRecordedProjectionStatus` (`status.ts`) lists opened
      entries, which it reaches through its `walked` read, since the mark marks their partitions; the human view shows
      an opened ownerless entry as opened and, where its adoption refused, as refused too.
    - An existing test's whole `ProjectionFileStatus` literal gains the opened state where it is required
      (`notes-projection-team-scale.md` § Test migrations).

    - Build `test-first` (one behavior at a time):
        - an opened archived file appears in `arc status`, human and JSON
        - an opened new path whose adoption refused shows as opened and refused with the refusal's remedy

## **Phase 2:** The pickup

_Purpose:_ Take an opened file's edits in at every command, make `arc sync` the remedy for a mismatched archive
partition, and land and re-lock an opened file at `arc save`, which stops reading the rest of the archive — spec § 1.3's
second chunk, with § 9.2's perturbation tests and the scale benchmark.

_Exit criterion:_ Over the reference backend with real worktrees, an archived file opened with `arc edit`, edited
across two ordinary commands, and saved is landed, laid read-only, and named in `arc save`'s report; a no-change
`arc save` walks no archive folder and reads no archive partition the header leaves unmarked; and an unmarked archive
partition whose bytes do not hash to its name is remedied by `arc sync` run from that checkout, as the removal check
names it.

### `[ ]` **2.1 A command's start takes opened edits in — § 5**

- _Goal:_ Every command's start finds the opened archive entries in the partitions the header marks, takes their edits
  in through write-back with the file left writable, and hands an opened new path to adoption, walking no archive
  folder; every other unsettled archive entry not opened stays with `arc save`.

    - The adoption retry's selection (`retriesIndexedEntry`, `engine-files.ts`) takes opened entries under
      `completed/` at every command, beside the accepted adoptions awaiting their read-back it takes there today, and
      `adoptionRetries` reads it as before. The release step and the removal check read the same selection
      (`retainedReleaseEntry`, `release-entries.ts`; `removal-check.ts`), so release finishes an opened new entry
      rather than refusing it (3.2.b).
    - An opened record entry is checked by the racy rule through `checkFileAtPath` and sent as any edit, and an opened
      ownerless entry goes to `adoptProjectionFile`.
    - A landing's read-back at an ordinary command lays the opened file writable (1.3).
    - An ordinary command pulls no ended item's history (`historyRetryInput`, `engine.ts`): where the store refuses an
      opened edit for a history ref not held here, the file stays opened and writable and the refusal names `arc save`.
    - Where an opened ownerless entry's file is absent, the shipped route drops the entry (`reconcileAbsentAdoption`,
      `adoption.ts`), and the command's report names the dropped path with `arc edit` to open the file again should it
      return.

    - Build `test-first` (one behavior at a time):
        - an opened file edited before each of two ordinary commands has each edit taken in, the file writable
          throughout
        - an opened edit whose ended item's history is not held here is refused at an ordinary command naming
          `arc save`, stays opened and writable, and lands at `arc save`
        - an opened new file is adopted by the next ordinary command, keeps the opened mark, and stays writable after
          the adoption's read-back
        - an opened new file deleted before a command has its entry dropped and is named in that command's report
        - an edit to an archived file that is not opened is neither checked nor sent by an ordinary command

### `[ ]` **2.2 `arc sync` remedies a mismatched archive partition — § 7.2, § 10.2**

- _Goal:_ `arc sync` run from a checkout whose archive partition does not hash to its name materializes that checkout in
  full at once, deleting nothing, and the removal check and the persist and release steps name it for such a partition
  before `arc save` stops reading every partition, so the remedy they print always works.

    - `restoreSyncProjection` (`sync-materialization.ts`) reads the index it restores with every group loaded, so
      `readProjectionIndex` (`index-file.ts`) answers a partition that does not hash to its name as `unusable` with its
      header, inside the sync's own lock callback, before the lock's deletion under `invalidatePartition` can reach it.
    - An `unusable` index there takes the path any index a command cannot use takes — `materializeProjectionRoot` with
      no index, recovering the header's withheld copies — in place of the report that asks for a retry after
      command-start recovery. As any rebuild with no usable index, it withholds every file holding an edit not yet
      landed, in any partition, and drops every opened mark in the checkout (spec § 7.2).
    - The sync's start has already swept the checkout and recorded its aside copies (`root.copies`, `engine-start.ts`),
      and the rebuild's own sweep records them again (`materializeProjectionRoot`), so the rebuild keeps each copy
      once in what the end re-checks.
    - `unusableProjectionIndexDetail` (`removal-check.ts`), which the check and the persist and release steps print,
      names `arc sync` run from that checkout where the unusable read carries its header — a missing or mismatched
      partition — and keeps `arc save` for a missing, unreadable, or other-format header. The local capture's refusal
      (`captureProjectionLocal`, `local-capture.ts`), which a write-back's preparation prints where the index it
      re-reads is unusable, the check's and the persist step's among them, takes the same rule after its first clause,
      which lets a publication finish.
    - `integration/store/projection/sync-materialization.test.ts`, and the removal check's and the retirement suite's
      cold-partition repairs, move to this contract (`notes-projection-team-scale.md` § Test migrations).

    - Build `test-first` (one behavior at a time):
        - with an unmarked archive partition holding bytes that do not hash to its name, `arc sync` materializes the
          checkout in full, leaves a usable index, and deletes no partition first
        - in that checkout, an opened file whose edit `arc sync`'s own start could not take in, a refused take-in among
          them, is withheld and named by the rebuild, as at any rebuild, and one whose edit the start took in is laid
          read-only
        - a sync rebuild in a checkout holding a live aside copy leaves that copy listed once
        - the removal check over that partition answers `unobservable` naming `arc sync` run from that checkout, and
          the persist and release steps refuse naming it, each succeeding after it (Success Criterion 7); the local
          capture's refusal names it where the path's partition goes missing after the check's own read; over an index
          missing its header the remedy still names `arc save`

### `[ ]` **2.3 `arc save` reads what is opened, unsettled, or resolved — § 6.1**

- _Goal:_ A no-change `arc save` with nothing opened walks no archive folder and reads no archive partition the header
  leaves unmarked, while every remedy that names `arc save` — a held entry, an unfinished recording, an accepted
  adoption, a resolution — still finishes.

    - `[ ]` **2.3.a The save-only reads go**
        - `launchProjectionStart` (`start-observations.ts`) reads the index's `walked` groups and walks no
          `.arc/completed` root for `arc save`, as for any command; `adoptionRetries` loads the `walked` groups for
          `arc save` too, selecting in `completed/` its opened entries and the unsettled ones its marked partitions
          hold.
        - `startUnderLease` keeps its recovery of swept aside copies under `completed/` for `arc save`
          (`engine-start.ts`), since the sweep names those paths.
        - `clearAcceptedMarks` (`save-changed.ts`), over the index `saveProjectionChanges` reads afresh under its
          lease, loads the `walked` groups rather than every one, so it clears changed marks only in the partitions any
          start reads; the selection never lists `completed/`, so no archived changed mark it leaves matters.
        - Existing tests that rely on `arc save` reading an unopened archived edit or adopting a new archived file it
          finds open the file first or move to the new contract, as `notes-projection-team-scale.md` § Test migrations
          gives each.
        - Build `test-first` (one behavior at a time):
            - a no-change `arc save` with nothing opened leaves invalid bytes in an unmarked archive partition unread
              and walks no archive folder
            - a refusal a refresh left, an unfinished recording, and an accepted adoption awaiting its read-back, each
              in a marked archive partition, finish at `arc save`
            - a new archived file made without `arc edit` is not adopted by `arc save`

    - `[ ]` **2.3.b `--resolve` keeps its lookup**
        - `selectProjectionResolution` (`save-resolution.ts`) still loads every partition to find its token, and the
          subject file it names is written back opened or not, landing read-only where its lay mode lays it so.
        - `explicitResolutionMarkerRefusal` (`save-markers.ts`) names `arc edit <path>` before its marker remedy where
          the file is archived and not opened, since it lies read-only.
        - The history retry stays as shipped: `historyRetryInput` (`engine.ts`) wraps the store in
          `retryEndedItemHistory` (`lib/store/history-retry.ts`) for `arc save`.
        - Build `test-first` (one behavior at a time):
            - `arc save --resolve` finds a whole-record conflict shown by its notice line in an archived file not
              opened and resolves it, the file laid read-only (Success Criterion 8)
            - `--resolve` over markers shown in an archived file not opened refuses naming `arc edit <path>`, and
              resolves once the file is opened and the markers edited out (Success Criterion 8)

### `[ ]` **2.4 The re-lock and `arc save`'s report — § 6.2, § 6.3, § 9.1**

- _Goal:_ `arc save` lays each opened file read-only and clears its mark only once its last look, after the read-only
  lay, finds the file present and holding nothing the store lacks; any other outcome leaves the file opened, writable
  where its edit did not land, with its remedy named — so no save is locked in unseen.

- _Approach:_ Each opened file settles inside `arc save`'s run under the worktree's projection lock, by its state, the
  mark cleared last. The landing case finishes at its read-back's swap (2.3's write-back with 1.3's read-only lay); the
  unchanged case lays read-only in place, then re-checks the file against its entry through `checkChange`
  (`change-detection.ts`), whose stat comparison reads size, modification time, and inode, then clears. An edit counts
  as landed only as `taken-in` with its installation attempted, read through write-back's per-file observation
  (`onFile`, `engine-files.ts`) as the persist step reads it (`persistFiles`, `removal-persist.ts`), and its file
  re-locks only where the swap did not rebuild its path by the link alone (2.4.a); a `no-edit` answer never clears the
  mark, which only the re-check finding the file clean or hashed-clean does.

- _Note:_ The perturbation tests stop a step pair through the engine's hook ports (`ProjectionEnginePorts`, `hooks`):
  § 9.2 test 1 through the point 1.2.b adds between `arc edit`'s mark and its write bit, and the rest through a point
  added where a pair has none, among them one between the guard and the swap in a landing's read-back
  (`installWriteBack`, `read-back.ts`) for § 9.2 test 9's leg.

    - `[ ]` **2.4.a An edit that lands**
        - The store's acceptance, then the read-back's swap laying the file read-only, the replace guard
          (`guardReplacement`) re-checking the file against what the landing read and taking in a save made between,
          then the mark cleared.
        - Where the path is absent when the swap plans it (`plan`, `swap.ts`) and the swap rebuilds it by the link alone
          (`rebuild`), the mark stays, the landed file read-only and still opened. The swap's result names each path it
          rebuilt so, beside those it left unreplaced (`SwapBatchResult`), and the read-back (`readBackSwapResult`,
          `read-back-outcome.ts`) carries that onto write-back's per-file observation
          (`ProjectionFileWriteObservation`), which the re-lock reads, since the take-in answers `taken-in` with its
          installation attempted there as at any landing.
        - Existing tests whose later legs rest on where the re-lock runs are re-checked once it is placed
          (`notes-projection-team-scale.md` § Test migrations).
        - Build `test-first` (one behavior at a time):
            - an opened file's edit lands at `arc save`, which lays it read-only and unmarks it
            - `arc save` stopped after the store accepts an opened file's write and before the swap, and again after
              the swap and before the mark clears, each followed by another command and another `arc save` (§ 9.2
              test 2)
            - a save made between the landing and the swap is taken in by the guard (§ 9.2 test 3)
            - a concurrent change to the same archived record from another checkout between `arc edit` and `arc save`
              merges or files a conflict, the file staying opened until its edit lands, and once the conflict is
              resolved `arc save` lands it and re-locks it, laid read-only and unmarked (§ 9.2 test 6)
            - a forced edit, then `arc edit` over the changed file, then `arc save` lands it (§ 9.2 test 7)
            - an opened new file adopted by an ordinary command is re-locked by `arc save`, and one adopted by
              `arc save` itself lays read-only and unmarked (§ 9.2 test 8)

    - `[ ]` **2.4.b An unchanged file**
        - Laid read-only in place, then re-checked against its entry's size, modification time, and inode, and only then
          unmarked; a save found by the re-check settles as an edit.
        - Build `test-first` (one behavior at a time):
            - `arc edit` stopped between its mark and its write bit leaves a read-only opened file, which `arc save`
              finds unchanged and unmarks (§ 9.2 test 1)
            - a save made between an unchanged file's read-only lay and its re-check, by a write through the mode and
              by a rename-save, and a stop after the lay, each followed by `arc save` (§ 9.2 test 4)

    - `[ ]` **2.4.c A file gone, emptied, or not landed**
        - An absent path, a Markdown file emptied past the settle window (`gateRead`, `read-gate.ts`, which write-back
          reads as deleted), or an absent path at the re-check leaves a stored record's file opened, its report naming
          `arc sync`.
        - A landing with no read-back in a root the ignore guard leaves unwritable (`sendFile`, `engine-files.ts`), any
          take-in answer but `no-edit` and `taken-in` (`TakeInResult`, `take-in-port.ts`), and a file the replace guard
          or the swap leaves unreplaced, which the read-back reports as `pending` (`read-back-outcome.ts`), each lay the
          file writable again where `arc save` had laid it read-only, and keep it opened.
        - Build `test-first` (one behavior at a time):
            - each take-in answer but `no-edit` and `taken-in`, and a file the guard leaves unreplaced, leave the file
              writable and opened with its remedy reported, and a repaired `arc save` re-locks it (§ 9.2 test 5)
            - an opened file deleted, a Markdown file emptied past the settle window, an editor's save leaving the
              path absent at the re-check, and a path deleted after the guard and absent when the swap plans it each
              stay opened with `arc sync` named where it applies; `arc sync` lays the deleted and the emptied file
              writable, the editor's save lands at the next command, and the next `arc save` re-locks each file it finds
              unchanged (§ 9.2 test 9)
            - an opened new file deleted, its entry dropped at the next command (2.1), lands once the file is created
              again, opened with `arc edit`, and saved (§ 9.2 test 9)

    - `[ ]` **2.4.d The report**
        - `arc save`'s result (`projectionSaveResult`, `save.ts`), which `handlers/save.ts` prints to standard output,
          names each file it lays read-only again, with `arc edit` as the way to keep editing it. Each opened file it
          leaves opened goes to the projection's diagnostics (`report.ts`) with that file's remedy, as any edit not yet
          persisted does, so a save that only re-locks writes nothing to standard error.
        - Build `test-first` (one behavior at a time):
            - the save result names a re-locked file with `arc edit`, in human and JSON output, and standard error
              stays empty; a file left opened appears in the diagnostics with its remedy
            - a file `arc save` re-locks leaves `arc status`'s list of opened files, and one it leaves opened stays

### `[ ]` **2.5 A refresh's pickup of a forced edit, and the rebuild over a lost index — § 7.1**

- _Goal:_ A refresh that touches a forced edit takes it in and lays the file read-only again, and a start that rebuilds
  an index lost between `arc edit` and `arc save` withholds an opened file holding an edit, naming `arc edit` in its
  remedy, and lays an unedited one read-only, so neither path skips an archived edit silently.

    - The refresh's pickup is the replace guard's take-in of an edit it meets (`guardReplacement`), with 1.3's lay mode
      laying the unopened file read-only; an edit its rights refuse is refused there and stays in its file.
    - The rebuild is the full materialization into a worktree with no usable index (`materializeProjectionRoot`), whose
      withheld mark (`withheldProjectionMark`, `materialization-file.ts`) covers an opened file holding an edit, since
      the rebuilt index carries no opened mark to read. Where its evidence is not whole, a file at a path it cannot
      place is held instead (`recordUnknownFiles`, `materialization.ts`), and the next rebuild with whole evidence
      settles it (`settleHeldMarks`; `settleEvidenceHeldFile`, `refresh.ts`).
    - For a file under `completed/`, laid read-only again, the remedy names `arc edit <path>` before re-applying the
      edit: `withheldProjectionMark` and `evidenceHeldProjectionMark` (`materialization-file.ts`), which take the path,
      and the start's report of a withheld file (`engine-files.ts`).

    - Build `test-first` (one behavior at a time):
        - a refresh touching a forced edit takes it in and lays the file read-only (Success Criterion 5)
        - a refresh touching another person's archived file changed in place refuses the edit and leaves it in its file
        - the index lost between `arc edit` and `arc save`, the rebuild's evidence whole: the next start withholds an
          opened file holding an edit, names it with a remedy naming `arc edit`, and lays an unedited one read-only;
          once the withheld file is deleted, opened again, and its edit re-applied, `arc save` lands it (§ 9.2 test 10)
        - the same with the rebuild's evidence not whole: the opened file is held, and once the condition is repaired
          the next start withholds it, after which the same repair lands it (§ 9.2 test 10)

### `[ ]` **2.6 The scale benchmark — Success Criterion 1**

- _Goal:_ On each named reference, interleaved no-change `arc save` runs over the paired fixtures, with nothing opened,
  show the larger fixture's median paired difference within 5 ms on Linux and 10 ms on Windows and macOS; a no-change
  start with one archived file opened stays within its reference's start margin; and every raw sample and paired
  difference is kept.

- **Additional Context:** `notes-projection-team-scale.md` § The scale benchmark's fixtures.

    - The timing suite (`store-ref-projection-timing.test.ts`, under `ARC_STORE_BURSTS=1`) gains interleaved standard and
      expanded no-change `arc save` runs and, over the standard fixture, interleaved starts with one archived file
      opened and with none, reported as raw medians and paired differences, beside its start comparison. Its fixtures
      hold a resolved state version (spec § 11 item 7).
    - The bounds sit with the projection's others (`projectionPerformanceBounds`, `timings.ts`); a start's margin is
      read against `spec-projection-worktrees.md` § 15.3 as that unit's amendment A4 restates it, with each reference's
      calibration medians in `notes-projection-worktrees.md` § A4, never a figure copied here.
    - Run on each named reference — Linux, Windows, and macOS — and add a § The scale benchmark's results to
      `notes-projection-team-scale.md`, giving each reference's medians and paired differences with its environment,
      and citing the commit measured and each reference's run or job identifier, whose record holds every raw sample
      and paired difference, as `notes-projection-worktrees.md` § A4 does.

### `[ ]` **2.7 An archived file corrected in place** — validate exit criterion at segment scope

- _Goal:_ The segment's exit criterion holds across real worktrees on a freshly merged base.

    - Exercise Success Criterion 2's correction end to end over the reference backend: an owner's archived meta opened,
      edited across two ordinary commands, and saved, in a checkout holding its ended item's history; a new file in an
      archived work unit's folder and an archived Errand's new description, each opened, adopted at the next command,
      and re-locked at `arc save`; an archived cohort document opened and corrected by another person, and an archived
      Errand's existing description by its owner; a no-change `arc save` reading no unmarked archive partition; and
      `arc sync` remedying a mismatched archive partition, as the removal check names it.
    - Request `arc check segment` and record the scenario and its result.

## **Phase 3:** What the whole-archive read carried

_Purpose:_ Move to `arc sync`'s report and to the removal check and the persist and release steps what rested on
`arc save` reading the whole archive, amend ADR-035, and, where the flip landed first, rewrite the errata convention —
spec § 1.3's third chunk.

_Mode:_ `slice` — closes on no archived edit lost silently once `arc save` stops reading the archive.

_Exit criterion:_ Over the reference backend with real worktrees, a forced edit and a new archived file made without
`arc edit` are named by `arc sync`'s report and refuse the checkout's removal, naming `arc edit` then `arc save`, after
which the removal proceeds; and an opened file's edit persists at removal.

_Design decisions:_ An archived file answers the removal check and the persist and release steps by the first of a read
that fails, edit rights that refuse, a forced edit or a file with no entry, and the answers `projection-worktrees`'
removal steps give today (spec § 8); one function answers its remedy for 3.1's report and 3.2's check and steps.

### `[ ]` **3.1 `arc sync` reports forced edits and new archived files — § 7.2**

- _Goal:_ `arc sync` names every forced edit and every file under `completed/` the index does not hold, each with its
  remedy, taking nothing in and adopting nothing.

    - Its restoration already stats every path the projection lays (`selectDeletedFiles`,
      `materialization-selection.ts`); those stats pass to `checkChange` (`change-detection.ts`) as its observation,
      which today discards them, so the comparison stats nothing more.
    - Over every partition, loaded by 2.2's read, it names each forced edit — a record entry neither opened nor
      unsettled whose file reads changed by the racy rule and not as deleted (`gateRead`, `read-gate.ts`): `arc edit`
      then `arc save` where the rights allow the edit (`readProjectionEditRights`), and the rights' remedy naming the
      owner otherwise.
    - From the walk of every projected root its restoration already makes (`walkProjectionRoots`, `engine-walk.ts`,
      from `materialization.ts`), it names each file under `completed/` the index does not hold, skipping editor side
      files and operating-system folder files as adoption does (`isExcludedProjectionPath`,
      `discovery-exclusions.ts`): at a new archived path, `arc edit` then `arc save` or the owner; elsewhere,
      adoption's own remedy. A symbolic link there keeps the report the walk already makes of it and is not named as
      a new archived file.
    - Each is reported through the root's report (`root.context.report`) to the projection's diagnostics, as the
      sync's other reports are (`report.ts`).
    - One function, given the root, the index, a path, and its entry if any, answers an archived file's remedy,
      `unobservable` where a read it needs fails, or nothing: `unobservable` before any refusal; the rights' mark
      naming the owner where they refuse (`readProjectionProtection`, `protection.ts`); adoption's mark where the
      target's resolution or the file's verdict refuses (spec § 12); and otherwise `arc edit <path>` then `arc save` in
      that checkout. 3.2's check and persist step call it too, wrapping its mark as they wrap any
      (`markedRemovalRefusal`, `retirementRefusal`, `removal-verdict.ts`), and one check of whether an archived file
      holds a forced edit serves the report and the removal alike, so they never name different remedies.

    - Build `test-first` (one behavior at a time):
        - a forced edit is named with `arc edit` then `arc save`, and another person's archived file changed in place
          with the remedy naming its owner; neither is taken in
        - a new file in an archived work unit's folder made without `arc edit` is named with `arc edit` then `arc save`,
          and a new file directly in `completed/` with adoption's remedy; neither is adopted
        - an editor's side file and an operating-system folder file under `completed/` are not named, and a symbolic
          link there keeps the walk's link report and is not named as a new archived file
        - an archived Markdown file emptied past the settle window is restored, not named as a forced edit

### `[ ]` **3.2 The removal check and the persist and release steps over archived entries — § 8, § 10.2**

- _Goal:_ A checkout is removed or released only once every archived edit in it has persisted or was never made: an
  opened file's edit persists and an opened new file adopts, while a forced edit, a new archived file with no entry, an
  edit its rights refuse, or a conflict held in an archived file refuses with its remedy, each clearing once repaired.

- **Additional Context:** `spec-projection-worktrees.md` § 12.2, § 12.3, § 16.2.

- _Note:_ Tests asserting `persist-would-refuse` or `removable` run through the composed check
  (`checkWorktreeRemoval`, `lib/git/worktree-removal.ts`) or the retirement harness; slot-level suites assert
  `would-refuse` or `passes` (`checkProjectionRemoval`, `removal-check.ts`). Behaviors the landed code already has are
  regression guards; the forced edit, the new file, and the conflict remedies fail first.

    - `[ ]` **3.2.a The removal check**
        - The check still walks the whole archive. Each archived file answers by the first that applies (spec § 8): a
          read that fails, `unobservable`; edit rights that refuse, the owner's remedy, as today; a forced edit or a
          file under `completed/` with no entry, 3.1's remedy — at a new archived path `arc edit` then `arc save` run in
          that checkout or the owner, elsewhere adoption's remedy; and otherwise today's answers, in the check's
          per-file answer (`checkIndexedRemovalEdit`, `removal-files.ts`) and its adoption check
          (`checkProjectionAdoption`). An opened entry whose file is absent, or emptied past the settle window, passes,
          as today.
        - A file held by a stored conflict keeps its hold, which the check makes unedited or edited
          (`unresolvedRemovalConflicts`, `removal-verdict.ts`); its remedy changes: for a conflict shown by a notice
          line, `arc save --resolve <token>` (`formatConflictToken`) in place of resolving by hand; for markers in an
          archived file not opened, `arc edit <path>` first, in that remedy and in the marker marks preparation retains
          (`marker-parse.ts`), as the check wraps them. An edited file not opened answers first as a forced edit.
        - § 12.2's phrase for the entries it deliberately holds, "whose walk finishes it", reads "which finishes it";
          no code holds the phrase, and those entries' remedies already name `arc save`.
        - Build `test-first` (one behavior at a time):
            - a forced edit, and a new archived file made without `arc edit`, each make the check answer
              `persist-would-refuse` naming `arc edit` then `arc save` run in that checkout, the check run from another
              checkout among them, and `removable` once those have run there
            - a forced edit that also fails to parse answers as a forced edit; another person's archived work changed
              in place answers naming its owner, and an opened entry whose file is absent or emptied past the settle
              window passes
            - a conflict shown by a notice line in an archived file not opened holds the check, naming
              `arc save --resolve <token>`, pinned before its remedy changes, until `arc save --resolve` runs in that
              checkout; and one shown by markers until `arc edit`, the edit, and `arc save` (Success Criterion 8)
            - an archived recording left unfinished holds the check naming `arc save`, which finishes it (2.3)
            - an opened file holding an edit, withheld after its index was lost, makes the check answer
              `persist-would-refuse` until it is deleted, opened again, its edit re-applied, and saved (§ 9.2 test 10)

    - `[ ]` **3.2.b The persist and release steps**
        - `persistFiles` (`removal-persist.ts`) takes every forced edit and every file under `completed/` with no
          entry out of what it hands `writeBackProjectionFiles`, and refuses over the first through
          `retirementRefusal` with 3.1's remedy, the file keeping its content; an opened file's edit persists and an
          opened new file adopts. The release step runs the same steps through `withPersistedProjection`
          (`removal-persist.ts`), which `releaseProjectionRemoval` (`removal-release.ts`) calls, the primary among them.
        - Build `test-first` (one behavior at a time):
            - a forced edit, and a new archived file made without `arc edit`, each make the persist and release steps
              refuse, the file keeping its content, the removal run from another checkout among them; once `arc edit`
              and `arc save` have run there, each succeeds (Success Criterion 5)
            - the primary's release refuses over a forced edit in its archive, the file keeping its content, and
              releases once `arc edit` and `arc save` run on the primary (spec § 11 item 8)
            - an opened file's edit persists at removal and at release, and an opened new file adopts
            - an opened entry whose file is absent or emptied past the settle window lets the removal proceed, its
              stored version kept, and a linked release over an opened new file whose file is gone proceeds, its entry
              dropped
            - an opened file holding an edit, withheld after its index was lost, makes the persist and release steps
              refuse, the file keeping its content, until it is deleted, opened again, its edit re-applied, and saved
              (§ 9.2 test 10)

### `[ ]` **3.3 ADR-035's amendment — § 10.3**

- _Goal:_ ADR-035 records, under its § Amending This Document, that item 6's projection lays `.arc/completed/` read-only
  and that a correction opens one file with `arc edit`, the decision standing.

- **Additional Context:** `strategy-adr-methodology.md` § Tier 2: Amendments — append-only with annotation.

    - Append spec § 10.3's amendment to `adr-035-keep-operational-state-in-repository-refs.md`, dated the day it is
      written, after the existing dated amendments.

### `[ ]` **3.4 The errata convention where the flip landed first — § 10.4**

- _Goal:_ Where the flip landed before this change, the archive's errata convention has a person correct a shipped
  Release Notes Entry through `arc edit` and `arc save`; where it has not, the convention stays the flip's to write.

- _Note:_ The condition is read from the base's text, never from a work unit's recorded state, which can trail its
  merge; 3.5 and verification read it again on their freshly merged base, and where it first holds there, the rewrite
  lands then.

    - On the base as last merged, read § Post-`Shipped` errata convention in
      `packages/arc-framework/arc/system/workflows/arc/work-unit-lifecycle/archive-work-unit.md`. While it still calls
      git history the lock, the flip has not landed there: change nothing. Where it describes correcting the archived
      meta and names no `arc edit`, the flip landed first.
    - Then rewrite it: an erratum runs `arc edit` on the archived meta, the edit to its Release Notes Entry, then
      `arc save`; a substantial change is a new work unit linked to its origin, since no verb reopens archived work.
      Write it in the shipped-content register, and carry the same edit to its `.arc/` copy (`DEV-RULES.PROJECT`
      § Package-Project Sync).

### `[ ]` **3.5 No archived edit lost silently** — validate exit criterion at segment scope

- _Goal:_ The segment's exit criterion holds across real worktrees on a freshly merged base.

    - Exercise the exit scenario over the reference backend: a forced edit and a new archived file made without
      `arc edit`, each named by `arc sync` and refusing the removal until `arc edit` and `arc save` run there; and an
      opened file's edit persisting at removal.
    - Read 3.4's condition again on this base; where it now holds, make 3.4's rewrite before the segment closes.
    - Request `arc check segment` and record the scenario and its result.

## **Phase 4:** Verification

### `[ ]` **4.1 Complete verification** — load and follow `verify-work-unit.md`

---

## Success Criteria

- `[ ]` On each named reference of `spec-projection-worktrees.md` § 15.3, interleaved no-change `arc save` runs with
  nothing opened over its 800- and 60,320-file fixtures show a median paired difference within 5 ms on Linux and 10 ms
  on Windows and macOS, and over the 800-file fixture a no-change start with one archived file opened shows a median
  paired increment within that reference's start margin, every raw sample and paired difference kept

- `[ ]` An archived work unit's owner opens one of its files, its meta among them, with `arc edit`, edits it across two
  ordinary commands that each take the edit in with the file still writable, and `arc save` lands it, lays it
  read-only, and names it in its report; a new file in an archived work unit's folder and an archived Errand's new
  description, each opened, adopt at the next command and are re-locked at `arc save`; anyone corrects an archived
  cohort document; and an archived Errand's owner corrects its description

- `[ ]` Each staging of spec § 2.3 lays an archived file whose rights allow the edit read-only where its target
  worktree's entry is not opened, and each but the spawn and the rebuild lays it writable where that entry is opened,
  its copy in every other worktree read-only; inside `arc save`, its own worktree's landing lays the file read-only and
  its fan-out lays it writable where another worktree has it opened

- `[ ]` `arc edit` refuses another person's archived work naming its owner, that file laid read-only with its notice
  naming the owner; it refuses a path outside `completed/`, a path in another checkout, a path with no file, and any
  other new path under `completed/`, each naming its remedy, and refuses over an archive partition that does not hash to
  its name, naming a retry that then succeeds

- `[ ]` A forced edit is taken in, and its file laid read-only, when a refresh touches it; is named by `arc sync`'s
  report; and makes the removal check answer `persist-would-refuse` and the persist and release steps refuse, naming
  `arc edit` then `arc save` run in that checkout, the removal run from another checkout among them, which then
  succeed; a new archived file made without `arc edit` is named and refuses the same way; and an opened file's edit
  persists at removal

- `[ ]` Each of spec § 9.2's perturbation tests asserts its state, then succeeds after its repair

- `[ ]` With an unmarked archive partition whose bytes do not hash to its name, the removal check answers
  `unobservable` and the persist and release steps refuse, each naming `arc sync` run from that checkout, and after it
  the check answers `removable` and the steps succeed

- `[ ]` `arc save --resolve` resolves a whole-record conflict shown by its notice line in an archived file not opened,
  and conflict markers in such a file resolve once `arc edit` opens it and they are edited out; after either, the
  removal check that held the file answers `removable`

- `[ ]` An index from the previous format version is rebuilt at the next start, and the fan-out and the end skip that
  worktree until then

- `[ ]` ADR-035 carries item 6's dated amendment

- `[ ]` Over the in-repo implementation archived files lay as today, and `arc edit` refuses `unsupported`

- `[ ]` Where the base this change lands on carries the flip's errata convention naming no `arc edit`,
  `archive-work-unit.md`'s post-`Shipped` errata convention, in the package source and its `.arc/` copy, runs `arc edit`
  on the archived meta, the edit to its Release Notes Entry, then `arc save`, and makes a substantial change a new work
  unit linked to its origin

- `[ ]` All quality gates pass (tests, linting, type checking)

- `[ ]` Ready for integration
