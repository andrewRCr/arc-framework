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
        - Corrective: command write-back retains a journaled handoff's ownership-specific hold rather than reporting a
          generic withheld basis. This restores the existing path-reuse contract regressed by `12aa224ad1`; the original
          integration test and its expectation are unchanged. The isolated reproduction and correction are recorded in
          `notes-projection-team-scale.md` § The ownership-handoff corrective.

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

### `[x]` **1.4 The `arc edit` notice — § 2.2**

- _Goal:_ Every archived Markdown file whose edit rights allow the edit carries a notice line naming `arc edit <path>`
  then `arc save`, the same whether or not the file is opened, so opening a file and re-locking an unchanged one change
  only its mode, never its bytes.

- _Outcome:_ Render inputs require the projected path. Editable archived Markdown carries the open-then-save
  notice; protected files retain their rights notice, and other formats carry none. Opening and refreshing the same
  archive file preserves its bytes and inode.

### `[x]` **1.5 `arc status` lists opened files — § 4**

- _Goal:_ `arc status` shows each file this worktree has opened, and an opened new path's adoption refusal beside it, so
  a file left open shows, and so does the reason its adoption keeps failing.

- _Outcome:_ Projection status reports an explicit opened state for record and ownerless entries. Human and JSON
  output retain adoption refusals and remedies beside the open path, and remove the refusal after successful repair.

## **Phase 2:** The pickup

_Purpose:_ Take an opened file's edits in at every command, make `arc sync` the remedy for a mismatched archive
partition, and land and re-lock an opened file at `arc save`, which stops reading the rest of the archive — spec § 1.3's
second chunk, with § 9.2's perturbation tests and the scale benchmark.

_Exit criterion:_ Over the reference backend with real worktrees, an archived file opened with `arc edit`, edited
across two ordinary commands, and saved is landed, laid read-only, and named in `arc save`'s report; a no-change
`arc save` walks no archive folder and reads no archive partition the header leaves unmarked; and an unmarked archive
partition whose bytes do not hash to its name is remedied by `arc sync` run from that checkout, as the removal check
names it.

### `[x]` **2.1 A command's start takes opened edits in — § 5**

- _Goal:_ Every command's start finds the opened archive entries in the partitions the header marks, takes their edits
  in through write-back with the file left writable, and hands an opened new path to adoption, walking no archive
  folder; every other unsettled archive entry not opened stays with `arc save`.

- _Outcome:_ Indexed retries select opened archive records and new paths at ordinary command starts. Edits and
  adoptions retain opened intent and writable mode; missing-history refusals name explicit save, while an absent new
  path drops its opening and reports how to reopen it. Unopened forced edits stay outside the ordinary walk.

### `[x]` **2.2 `arc sync` remedies a mismatched archive partition — § 7.2, § 10.2**

- _Goal:_ `arc sync` run from a checkout whose archive partition does not hash to its name materializes that checkout in
  full at once, deleting nothing, and the removal check and the persist and release steps name it for such a partition
  before `arc save` stops reading every partition, so the remedy they print always works.

- _Outcome:_ Sync loads every partition under its own lease and rebuilds unusable indexes immediately, preserving
  the header's withheld copies and keeping each end-check copy once. Refused edits are withheld and opened marks drop
  through the normal rebuild. Partition-damage remedies name sync; missing or unreadable headers still name save.

### `[x]` **2.3 `arc save` reads what is opened, unsettled, or resolved — § 6.1**

- _Goal:_ A no-change `arc save` with nothing opened walks no archive folder and reads no archive partition the header
  leaves unmarked, while every remedy that names `arc save` — a held entry, an unfinished recording, an accepted
  adoption, a resolution — still finishes.

    - `[x]` **2.3.a The save-only reads go**
        - Save starts and changed-mark clearing load walked groups and never discover archive folders. Indexed retries
          share the header's unsettled predicate, retaining refused edits and interrupted adoption recovery.
    - `[x]` **2.3.b `--resolve` keeps its lookup**
        - Resolution retains its all-partition lookup and can settle an unopened archived whole-record conflict.
          Standing archived markers name `arc edit` before the hand-edit remedy.

- _Outcome:_ Cold partitions and unindexed archive files stay untouched at save. Existing archived-adoption tests open
  eligible paths first and exercise misplaced-path refusals through edit, preserving the same correction and identity.

- _Amended in:_ review-fix (A2)

### `[x]` **2.4 The re-lock and `arc save`'s report — § 6.2, § 6.3, § 9.1**

- _Goal:_ `arc save` lays each opened file read-only and clears its mark only once its last look, after the read-only
  lay, finds the file present and holding nothing the store lacks; any other outcome leaves the file opened, writable
  where its edit did not land, with its remedy named — so no save is locked in unseen.

    - `[x]` **2.4.a An edit that lands**
        - Actual installation observations include link-only rebuilds and adopted files. Settlement under the start
          lease clears an opening only after an installed file's last check proves its bytes accepted.
    - `[x]` **2.4.b An unchanged file**
        - Read-only lay precedes the final check. Writes and rename saves found there enter ordinary guarded write-back;
          interruptions preserve the opening through restart.
    - `[x]` **2.4.c A file gone, emptied, or not landed**
        - Missing and settled-empty files name sync. Young empty saves, refused or unparseable edits, conflicts,
          uninstalled read-backs, and unsettled replacements retain their openings and writable editing modes.
    - `[x]` **2.4.d The report**
        - Human and JSON results name re-locked paths and their edit remedies without diagnostics. Retained openings
          report their repair; status drops a file only once its opening closes.

- _Outcome:_ Re-locking runs before refresh inside the saving checkout's existing lease. Landing, adoption, ordinary
  pickup, interrupted commands, concurrent editor saves, and repair retries share that settlement decision.
  The editor perturbation clears the target's read-only flag before rename so Windows exercises the same replacement.

### `[x]` **2.5 A refresh's pickup of a forced edit, and the rebuild over a lost index — § 7.1**

- _Goal:_ A refresh that touches a forced edit takes it in and lays the file read-only again, and a start that rebuilds
  an index lost between `arc edit` and `arc save` withholds an opened file holding an edit, naming `arc edit` in its
  remedy, and lays an unedited one read-only, so neither path skips an archived edit silently.

- _Outcome:_ Withheld and evidence-held remedies take the affected path and name `arc edit` before reapplying an
  archived correction. Command-start reporting uses the same withheld remedy. Rebuild tests cover complete and
  incomplete evidence, preserved corrections, closed unedited files, and repair through a successful save; refresh
  coverage retains forced edits under their owner's rights and lays accepted corrections read-only.

- _Amended in:_ review-fix (A2)

### `[x]` **2.6 The scale benchmark — Success Criterion 1**

- _Goal:_ On each named reference, interleaved no-change `arc save` runs over the paired fixtures, with nothing opened,
  show the larger fixture's median paired difference within 5 ms on Linux and 10 ms on Windows and macOS; a no-change
  start with one archived file opened stays within its reference's start margin; and every raw sample and paired
  difference is kept.

- _Outcome:_ The timing suite retains interleaved save and opened-start comparisons with bounds in
  `projectionPerformanceBounds`. The latest valid reference measurements are accepted, with earlier absolute-bound
  misses retained as intermittent; environments, source coordinates, raw records, and the controlled source comparison
  are in `notes-projection-team-scale.md` § The scale benchmark's results.

### `[x]` **2.7 An archived file corrected in place** — validate exit criterion at segment scope

- _Goal:_ The segment's exit criterion holds across real worktrees on a freshly merged base.

- _Outcome:_ `archive-correction-worktrees.test.ts` exercises native reference-store corrections through command hooks
  in two linked worktrees on merged base `a065b748e5`: two-command meta pickup, new companion and Errand-description
  adoption, shared cohort and owned Errand corrections, re-lock reports and read-only fan-out, cold save without archive
  discovery, and sync repair after the removal check's remedy. The complete scenario passes; reconstruction and run
  evidence are in `notes-projection-team-scale.md` § The archive correction scenario.

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
_Amended in:_ review-fix (A2).

### `[x]` **3.1 `arc sync` reports forced edits and new archived files — § 7.2**

- _Goal:_ `arc sync` names every forced edit and every file under `completed/` the index does not hold, each with its
  remedy, taking nothing in and adopting nothing.

- _Outcome:_ Sync reports forced edits and unindexed archive files through `inspectArchivedProjectionFile`, with
  shared owner and adoption remedies and failed reads kept unobservable. Restoration reuses its existing stats and
  root walk, excludes side files, retains link reporting, and restores settled empty Markdown without calling it a
  forced edit. Native command coverage and reconstruction evidence are in `notes-projection-team-scale.md`
  § Sync's archive report.

### `[x]` **3.2 The removal check and the persist and release steps over archived entries — § 8, § 10.2**

- _Goal:_ A checkout is removed or released only once every archived edit in it has persisted or was never made: an
  opened file's edit persists and an opened new file adopts, while a forced edit, a new archived file with no entry, an
  edit its rights refuse, or a conflict held in an archived file refuses with its remedy, each clearing once repaired.

    - `[x]` **3.2.a The removal check**
        - Removal uses the shared archive inspection before admission. Stored notices name `arc save --resolve`;
          closed archived markers name `arc edit` first, including preparation's retained marks. Native composed
          checks cover both caller checkouts, rights, absent and empty files, unfinished recording, and lost-index
          withholding with successful repair. Evidence is in `notes-projection-team-scale.md` § Archived removal checks.

    - `[x]` **3.2.b The persist and release steps**
        - Persist and release exclude unopened archive input before write-back, preserving every blocked file and its
          shared remedy. Native checks cover both callers, the primary, opened edits/adoptions, no-edit files and
          index-loss repair. Empty-copy release keeps its second-check hold until save; see
          `notes-projection-team-scale.md` § Archived persistence.

- _Amended in:_ review-fix (A2)

### `[x]` **3.3 ADR-035's amendment — § 10.3**

- _Goal:_ ADR-035 records, under its § Amending This Document, that item 6's projection lays `.arc/completed/` read-only
  and that a correction opens one file with `arc edit`, the decision standing.

- _Outcome:_ Appended the dated archive-opening amendment under ADR-035's Amending This Document, preserving
  item 6's decision and every earlier annotation verbatim.

### `[x]` **3.4 The errata convention where the flip landed first — § 10.4**

- _Goal:_ Where the flip landed before this change, the archive's errata convention has a person correct a shipped
  Release Notes Entry through `arc edit` and `arc save`; where it has not, the convention stays the flip's to write.

- _Outcome:_ At merged base `a065b748e5908c2482329d101e52db0f6d052fb5`, the convention still names git history as
  the lock. Its rewrite condition is false, so both workflow copies stay unchanged.

### `[x]` **3.5 No archived edit lost silently** — validate exit criterion at segment scope

- _Goal:_ The segment's exit criterion holds across real worktrees on a freshly merged base.

- _Outcome:_ The exit scenario passes over native reference stores and real linked checkouts on base
  `2a3cbc2cffa755bada5e9b16ba38c48261e96f79`, merged at `e39955e7763eb9999feb6e2114e148f4b88cd1a7`.
  `archive-retirement-worktrees.test.ts` composes the production removal slots and physical Git removal, preserving
  reported unopened input until repair and persisting opened edits during removal. The fresh base still names git
  history as the errata lock, so no workflow rewrite applies. See `notes-projection-team-scale.md` § The archive
  retirement scenario.

## **Phase 4:** Verification

### `[x]` **4.1 Complete verification** — load and follow `verify-work-unit.md`

- _Quality gates:_ All 21 selected merge checks passed, including 460 affected store suites. Full hosted CI
  run `44450640142` passed 40 jobs on `4b723680ae`, including Windows and macOS.

- _Success criteria:_ Each reference met both paired timing limits. The current base uses the pre-flip
  Git-history errata convention. The independent verification fix check found no actionable defects.
  Candidate review reopened readiness over the inherited macOS absolute start budget. On Candidate `afc1e91acc`,
  hosted run `44534924205` passed 40 jobs and met both macOS paired limits. In timing job `135598338902`,
  standard and expanded starts took 71.054 and 65.214 ms against 45 ms. On Candidate `b4fd993f92`,
  hosted run `44551744263` passed 40 jobs. Timing job `135657612390` measured 62.755 and 58.851 ms
  against the same start budget and 728.941 ms against the macOS one-file fan-out budget of 600 ms.
  Both macOS paired differences passed at −0.565 ms for no-change save and +1.434 ms for opened start.
  Matched startup diagnostic job `135670676836` found no consistent startup difference between
  `53a349d7cb` and `b4fd993f92`. On Candidate `3fe50a7495`, job `135765656506` of hosted run
  `44582071212` measured 74.742 and 77.623 ms for startup, 833.143 ms for one-file fan-out,
  and 4,106.013 ms for full materialization against the macOS limits of 45, 600, and 4,000 ms.
  The macOS paired differences of +0.507 ms for no-change save and +5.485 ms for opened start passed.
  On Candidate `35842147a3`, timing-only run `44592076801` met all Windows and macOS limits. macOS job
  `135800959097` measured 32.364 and 30.756 ms for startup, 408.579 ms for one-file fan-out, and 1,760.744 ms
  for materialization. The Linux reference snapshot, which differs from that Candidate only in its Candidate
  record, also met all limits. All three references used zero Git credit.

- _Review follow-up:_ Round 5 found two remaining archive boundary gaps. The corrections recheck checkout authority
  during archive observation and retain the requirement to open an edit when sync restoration is refused. Focused
  run `8438e4a34e7143599c07bede45ac7cc1` passed 347 cases across 15 test files, including both new regressions.

- _Review follow-up (A2):_ Fix checks 5 to 7 kept finding archive routes that lost the requirement to open an edit or
  checked a path's authority before a late link. Amendment A2 replaces both mechanisms: one admission rule at the
  take-in decides from the entry and the route, and each command asks the archive path check once per selection and
  again before each change. `notes-projection-team-scale.md` § Amendment A2 records the superseded text.

- _Timing follow-up:_ On `f0baeb2b56`, hosted run `44636797674` measured macOS startup at 62.591 and 45.132 ms in job
  `135957797653` and at 60.996 and 53.979 ms in its same-head rerun `135984973134`, against 45 ms. One-file fan-out
  measured 459.387 and 516.412 ms against 600 ms, and full materialization 4,106.008 and 2,149.907 ms against 4,000 ms.
  Approved after review on 2026-11-19: the inherited macOS start budget's settlement is deferred to an inbox capture
  for its owner, and the single materialization miss was rejected as runner variance. Hosted CI at the converged head
  records that head's readings.

---

## Success Criteria

- `[x]` On each named reference of `spec-projection-worktrees.md` § 15.3, interleaved no-change `arc save` runs with
  nothing opened over its 800- and 60,320-file fixtures show a median paired difference within 5 ms on Linux and 10 ms
  on Windows and macOS, and over the 800-file fixture a no-change start with one archived file opened shows a median
  paired increment within that reference's start margin, every raw sample and paired difference kept

- `[x]` An archived work unit's owner opens one of its files, its meta among them, with `arc edit`, edits it across two
  ordinary commands that each take the edit in with the file still writable, and `arc save` lands it, lays it
  read-only, and names it in its report; a new file in an archived work unit's folder and an archived Errand's new
  description, each opened, adopt at the next command and are re-locked at `arc save`; anyone corrects an archived
  cohort document; and an archived Errand's owner corrects its description

- `[x]` Each staging of spec § 2.3 lays an archived file whose rights allow the edit read-only where its target
  worktree's entry is not opened, and each but the spawn and the rebuild lays it writable where that entry is opened,
  its copy in every other worktree read-only; inside `arc save`, its own worktree's landing lays the file read-only and
  its fan-out lays it writable where another worktree has it opened

- `[x]` `arc edit` refuses another person's archived work naming its owner, that file laid read-only with its notice
  naming the owner; it refuses a path outside `completed/`, a path in another checkout, a path with no file, and any
  other new path under `completed/`, each naming its remedy, and refuses over an archive partition that does not hash to
  its name, naming a retry that then succeeds

- `[x]` A forced edit is taken in, and its file laid read-only, when a refresh touches it; is named by `arc sync`'s
  report; and makes the removal check answer `persist-would-refuse` and the persist and release steps refuse, naming
  `arc edit` then `arc save` run in that checkout, the removal run from another checkout among them, which then
  succeed; a new archived file made without `arc edit` is named and refuses the same way; and an opened file's edit
  persists at removal

- `[x]` Each of spec § 9.2's perturbation tests asserts its state, then succeeds after its repair

- `[x]` With an unmarked archive partition whose bytes do not hash to its name, the removal check answers
  `unobservable` and the persist and release steps refuse, each naming `arc sync` run from that checkout, and after it
  the check answers `removable` and the steps succeed

- `[x]` `arc save --resolve` resolves a whole-record conflict shown by its notice line in an archived file not opened,
  and conflict markers in such a file resolve once `arc edit` opens it and they are edited out; after either, the
  removal check that held the file answers `removable`

- `[x]` An index from the previous format version is rebuilt at the next start, and the fan-out and the end skip that
  worktree until then

- `[x]` ADR-035 carries item 6's dated amendment

- `[x]` Over the in-repo implementation archived files lay as today, and `arc edit` refuses `unsupported`

- `[x]` Where the base this change lands on carries the flip's errata convention naming no `arc edit`,
  `archive-work-unit.md`'s post-`Shipped` errata convention, in the package source and its `.arc/` copy, runs `arc edit`
  on the archived meta, the edit to its Release Notes Entry, then `arc save`, and makes a substantial change a new work
  unit linked to its origin

- `[x]` All quality gates pass (tests, linting, type checking)

- `[ ]` Ready for integration
