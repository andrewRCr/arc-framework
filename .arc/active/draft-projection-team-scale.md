# Draft: projection-team-scale

- **Origin:** split from `projection-worktrees` on 2026-11-07. After a Windows scale assessment the Owner approved
  five scale changes to that work unit (A–E), then split them: `projection-worktrees` keeps A (the index split by root,
  the archive by quarter, plain JSON on the hot path) and E (shared protection reads), and this work unit took C, D
  and the growth-relative scale criterion. B (later catch-up after a pull) was reverted the same day. On 2026-11-10 the
  Owner split this unit again (§ Drafting status): it keeps D, and `projection-narrowed-views` takes C.
- **Purpose:** Lay the archive read-only and amend it in place through `arc edit`, so `arc save` walks only the
  archived files a person has opened rather than the whole archive, and the flip's errata convention has its command.

---

## Drafting status

- **Readiness:** maturing. The scope is known, and what stays open is D's detail design (§ Open below).
- **Entry read (2026-11-10, re-read after the split):** `Class` stays `Heavy`. A real design must be authored — D's
  transition invariants, the archive pickup at `arc save`, the opened set's read, and forward amendments to two
  specifications — composed from existing pieces (protection, write-back's admission, adoption, and the index's
  partitions), so nothing must be invented. Design already authored here (§ Settled at drafting) floors it there. The
  stage runs at `high` depth: D changes which archive edits `arc save` picks up, where a miss is silent loss.
- **Boundary:** split on 2026-11-10 (Owner). Anchoring the design at this repository's measured throughput and at teams
  of 1, 10, 50, and 150 (§ The scale anchor) grew what narrowing must do: an archive recency window, and the backlog's
  walk and a fanned pull held at team scale. Only D changes what the flip lays or how a correction lands; C and the
  added work change nothing at this repository's size. This unit keeps D and lands before the flip;
  `projection-narrowed-views` (planned, P2) takes C, the window, and the team-scale work, and follows the cutover
  window. It was minted by hand carrying the moved design, as the 2026-11-07 split was, rather than through
  `arc decompose`'s extraction, which has not been rehearsed. What stays is one work unit: D's command, its pickup at
  `arc save`, and its amendments land together or not at all.
- **Resolved:** D's command, rights, and sequence (§ Settled at drafting), sent to `cutover-flip`'s session on
  2026-11-10; the opened set's read, § 15.1's walk, and a refresh's pickup of an archived edit (§ D's amendments), D's
  part of the scale criterion, and ADR-035's disposition (§ D and ADR-035), settled the same day.
- **Open:**
    1. Whether this design adds a prepared store write of its own (§ Transition invariants).
    2. The amendments' text: § 8.4 and § 15.1 of `spec-projection-write-back.md`, and § 3.1 and § 16.3 of
       `spec-projection-worktrees.md`, from what § D's amendments settles.
- **Next:** the prepared-write check, then the amendments' text, then readiness.

## Scope

- **D — a read-only archive, amended through a command** (`arc edit`, settled 2026-11-10, with its rights and the
  removal check's changes), and `arc save` no longer scanning the archive. D's amendments to
  `spec-projection-write-back.md` § 8.4 come with it: in-place archive corrections, and their pickup at `arc save`.
- **The opened set's read and § 15.1's walk,** as forward amendments to `spec-projection-worktrees.md` § 3.1 and
  § 16.3 and `spec-projection-write-back.md` § 15.1.
- **D's part of the growth-relative scale criterion:** `arc save` with a large archive.
- **ADR-035's amendment for D:** item 6's read-only archive (§ D and ADR-035).
- **The errata convention's command,** coordinated with `cutover-flip` (guard 3).

Not here: C, an archive recency window, the backlog's walk and a fanned pull at team scale, the criterion's part for
them, ADR-035 item 6's refinement for C, and re-basing `spec-projection-worktrees.md` § 15.5's figures
(`projection-narrowed-views`); A and E, and the plain benchmark for A's growth claim (Task 1.12.a, with a structural
test in Task 1.2 - `tasks-projection-worktrees.md`), kept by `projection-worktrees`; and the store's own per-command
cost at 50–150 developers, captured for `storage-ref-release-hardening`.

## Sequencing and guards

Plan this work unit during `projection-worktrees`' build (about 2026-11-11 to 11-20). Build from that unit's landing,
before `cutover-flip`'s final full rehearsal (Stage 2) and the cutover window. `cutover-flip` depends on it, so the
rehearsal and the window wait for it to land.

`projection-narrowed-views` follows the window and adds the effective view per root to the index header
(`projectedUnder`); this unit changes an index entry and leaves the header's format as it is (§ D's amendments). If its
recency window keeps opened files laid, it reads the opened entries and takes an edge on this unit.

Four guards, agreed with the Owner, keep the split from fragmenting the design or forcing rework:

1. `projection-worktrees`' specification designs A's partitions as the seams D builds on (§ Seams this builds on).
2. The held D text moves over as written (§ Held design text), not re-derived.
3. `cutover-flip`'s specification writes its errata convention (H4) for the command from the start. The command's
   name, rights, and sequence went to that session on 2026-11-10 (§ Settled at drafting); a later change to any of
   them goes too.
4. Stage 2 runs with this work unit landed.

## Transition invariants to state in planning

Agreed with the Owner on 2026-11-07, after `cohort-identity-verbs` traced six review passes to transition invariants
its design never stated. For each step pair in D, the design states what must hold between the steps, where it is
enforced, and the perturbation test that proves it. Each test asserts a refusal, then a legitimate repair, then the
operation continuing. The cases known now:

- **D:** `arc edit`, the edit, and the re-lock at `arc save`, across a concurrent change to the same archived record;
  the archive pickup now that `arc save` walks only opened entries; a forced edit, then `arc edit` over the changed
  file, then `arc save`; a new path opened, then adopted at `arc save`; and the index lost between `arc edit` and
  `arc save`, so the next start rebuilds it: an opened file holding an edit is left as it is and marked withheld,
  named in every report and refused over by the removal check and the persist and release steps, and an unedited one
  is laid read-only again (`spec-projection-worktrees.md` § 2.5), so no opened edit is skipped silently.
- **Prepared store writes:** a write this design prepares from store reads and submits as one batch states its fence
  by the pattern approved for prepared writes on 2026-11-07 (`cohort-identity-verbs`' design amendment A7): it
  re-derives its decision in a write check over `before`, or observes everything that decision read. Its perturbation
  test injects a store change between preparation and the batch for each kind of read the preparation makes. `arc edit`
  writes no store record, and an opened file lands through write-back's own prepared admission
  (`spec-projection-write-back.md` § 7.2), so whether this design adds a prepared write of its own is open.

## Held design text — D

Copied from `projection-worktrees` as written on 2026-11-07, with only heading levels adjusted. Part 1 is the design
brief the Owner approved with A–E; Part 2 refined D before the split, and governs where the two differ. Both
superseded in part by § Settled at drafting.

### Part 1 — the brief

#### D. A read-only archive, amended through a command

- Archived records lay read-only (protected, reason `archive`, notice naming the command). `arc edit <path>` makes one
  archived file writable in this worktree: the index marks it unlocked; the next command takes the edit in, lands it,
  and lays the file read-only again.
- `arc save` walks only unlocked archive entries. The removal check and the persist and release steps still walk the
  whole archive (rare; teardown), so a forced edit (chmod + edit without `arc edit`) is never lost — it refuses the
  removal, naming `arc edit` and `arc save`.
- Rights: completed placement stops being plainly editable; the owner's edit needs the unlock. `amend-design` (which
  amends archived designs) runs `arc edit` first. (Check `arc editor`'s name for a clash.)

### Part 2 — refinements put to the Owner (2026-11-07, about 8:15 am CT)

Item 2 of the two, as put; item 1 refined C and moved with it.

> 2. **The read-only archive (D):** the command is `arc unlock <path>`. `arc edit` sits too close to the existing
>    `arc editor <vscode|zed>`. Unlock is for a small correction made in place; anything substantial goes through
>    reopening the work unit, which is the existing lifecycle path. A file edited without unlocking it first (made
>    writable and changed anyway) is still never lost. The teardown check scans the archive, refuses the removal, and
>    names `arc unlock` and `arc save`. **Lean: yes.**

### Decision status

- **Approved with A–E (2026-11-07):** D's archive laid read-only, amended in place through a command, `arc save`
  leaving the archive out of its walk, and the removal check still walking it.
- **Confirm at drafting — the command's name:** `arc unlock <path>`, superseding Part 1's `arc edit`, leaning yes.
  Settled on 2026-11-10 as `arc edit` after all (§ Settled at drafting).

## Settled at drafting

Settled with the Owner on 2026-11-10. Where these differ from the held text above, they govern.

### D's command, rights, and sequence

1. **The name is `arc edit <path>`,** superseding Part 2's `arc unlock`. Part 2 weighed only `arc editor`'s nearness.
   Two costs of `unlock` it did not weigh decided it: "unlock" already names the worktree lock, whose
   `git worktree unlock <path>` ARC prints as a remedy (`unlockFirst`, `lib/session-init/missing-worktree-folders.ts`;
   `manualHuskCleanup`, `commands/agenda/cleanup.ts`) and runs as a removal step (`removeWorktreeCheckout`,
   `lib/git/worktree-removal.ts`), beside the projection lock; and Git LFS runs the opposite polarity, where
   `git lfs lock` makes a file yours to write and `git lfs unlock` gives it back. Perforce lays files read-only and
   `p4 edit` opens one for edit, which is this mechanism. A mistyped `arc edit vscode` refuses, naming no such path;
   the help text and the notice line carry that the command opens a file rather than an editor.
2. **The file stays writable until `arc save`.** `arc edit` makes one archived file writable in its worktree and marks
   its entry open in the index, changing no content. Ordinary commands take an opened file's edit in without re-locking
   it, reading the open entries the header lists. `arc save` lands it, or finds it unchanged, and lays it read-only
   again. This supersedes Part 1's re-lock at the first command that lands the edit: agents run commands constantly,
   so a re-lock between two saves of one correction would turn the second into a forced edit, refused until the
   command and `arc save` ran again.
3. **A new file:** `arc edit` also takes a path the index does not hold inside an archived work unit's folder and
   marks it open, and `arc save` adopts it there (`spec-projection-write-back.md` § 9). A new file made without the
   command is seen only by the removal check and the persist and release steps, which refuse naming the command, since
   `arc save` walking the archive's folders for new files would restore the cost D removes.
4. **A forced edit:** a file made writable and edited without the command keeps its edit. The removal check and the
   persist and release steps walk the whole archive and refuse, naming `arc edit` then `arc save`, and `arc edit`
   accepts a file already changed, so the refusal's remedy works.
5. **Rights stay § 8.4's.** The archived work unit's owner may open its files, the meta and task list included;
   anyone may open an archived cohort document (`spec-projection-write-back.md` § 8.1); anyone else's archived work
   stays read-only. `arc edit` refuses wherever the edit itself would be refused, naming the owner. The command is a
   speed bump and narrows `arc save`'s walk; it moves no authority.

**Amended 2026-11-10 (Owner), items 2 and 3.** The open entries are not a list the header keeps: an opened entry is
unsettled, so its partition carries the header's mark and every command's start reads it (§ The opened set's read). A
new path opened takes a record entry carrying an adoption, so, as with an opened file's edit, the first command after
the file appears adopts it, and `arc save` lays it read-only.

### The scale anchor

Settled with the Owner on 2026-11-10, and carried in full, with the model's findings at each team size, by
`draft-projection-narrowed-views.md` § The scale anchor: teams of 1, 10, 50, and 150 developers, 23 work units a month
per person, 20 worktrees a machine, and no time horizon for a command, a save, or a spawn. The 1/10/50/150 target binds
1.0, not Gate B.

For D the anchor needs no team size. Without D, `arc save` walks the whole archive, which grows with its age at any
team size: for one person at that rate, about 210 ms on Windows at three years (§ Evidence). With D, `arc save` walks
the opened entries and costs about what a command does, at any age.

### Corrections to the held text

- **A substantial change is a new work unit.** Part 2 and § 8.4's amendments below send it through "reopening the work
  unit"; no verb reopens archived work (`spec-seam-lifecycle.md` § 8.7), and `arc reopen` moves only an Integrating
  work unit back to Active, refusing a merged pull request (`reopen-work-unit.md`). A substantial change to shipped
  work is a new work unit linked to its origin.
- **No workflow amends archived designs.** Part 1 has `amend-design` run the command first, but `amend-design.md`
  amends a work unit's design in flight and never touches `completed/`. The one hand edit workflows make there is
  `archive-work-unit.md`'s post-`Shipped` errata convention on a Release Notes Entry, which `cutover-flip` rewrites as
  H4; every other write under `completed/` is a verb's, which reaches the store without the command.

## D's amendments

### To `spec-projection-write-back.md` § 8.4

No specification text was drafted for these before the split. The substance is settled with the Owner's A–E approval.

- **The current text:** § 8.4 "Archived work" (lines 1254–1281 of the shipped specification at `56f812030b`) lets the
  archived work unit's owner edit its `completed/` files in place from any checkout, a correction persisting "at
  `arc save`, at the persist or release step, or when a refresh touches the file", and moves the errata convention onto
  the store's history (§ 18).
- **What D changes there** (as settled on 2026-11-10, § Settled at drafting):
    - archived files are laid read-only (protected, reason `archive`, the notice naming `arc edit`);
    - an in-place correction first opens one file, or a new path in an archived work unit's folder, with
      `arc edit <path>`, which makes it writable in that worktree; ordinary commands take its edit in, and `arc save`
      lands it and lays it read-only again;
    - `arc save` walks only opened archive entries rather than all of `completed/`;
    - the removal check and the persist and release steps still walk the whole archive, so a file forced writable and
      edited without the command is never lost: the removal refuses, naming `arc edit` and `arc save`;
    - a refresh that touches such a file takes its edit in and lays it read-only again (§ The opened set's read);
    - a substantial change is a new work unit linked to its origin, not an in-place edit.
- **How the amendment lands:** `projection-write-back` has shipped, so this work unit's specification carries the
  § 8.4 change as a forward amendment, as `projection-worktrees` amends `spec-projection-substrate.md` (its § 16.2).
- **The flip's errata convention (H4)** edits projected archive files per § 8.4, so D's amendment and its `arc save`
  pickup reach H4 wherever it lands; `cutover-flip` writes H4 for `arc edit` from the start (guard 3).

### The opened set's read, and § 15.1's walk

Settled with the Owner on 2026-11-10.

- **An opened entry is unsettled.** `arc edit` marks the file's entry opened, and § 3.1 counts that mark among the
  states that make an entry unsettled, so the write that sets it marks the entry's partition in the header. Every
  start reads the partitions the header marks (§ 16.3's start read), so it finds the opened entries without reading
  any other `completed/` quarter. A new path opened before its file exists takes a record entry carrying an adoption,
  with a null `stat` for its absence (`RecordEntrySchema`, `lib/store/projection/index-schema.ts`), which § 3.1
  already counts as unsettled. The header's format is unchanged; the entry gains the mark, and whether that takes a
  format version is the specification's call, since reads skip the schema and another build's fan-out reads the
  index. This lands as forward amendments to `spec-projection-worktrees.md` § 3.1 — the unsettled states, and
  `arc save` no longer reading every partition — and § 16.3, whose start read has `arc save` walk `completed/`.
- **Chosen over a header field listing opened paths.** That changes the header's format, and costs less than the mark
  only by copying each opened file's stat and blob id into the header beside its entry, a second copy of state the
  index must keep in step.
- **What the mark costs.** Change detection reads the entry, so while a file stays open every command in its worktree
  reads that file's quarter partition, until `arc save`. This repository holds about 3.7 files per archived work unit,
  so at 23 work units a month per person a quarter holds about 255 entries per person; at the lean codec's
  3.8 µs an entry on Linux and about 8–12 µs on Windows (model v2), that is about 2–3 ms a command on Windows for one
  person, about 3–5 ms at fifty people with a thirtieth in view, and about 15–30 ms at ten people with every view
  `all`, where the backlog's walk already needs `projection-narrowed-views`. `arc status` lists the opened files, so
  one left open shows.
- **§ 15.1's walk.** Write-back checks every projected root but `completed/`, and in `completed/` the opened entries
  the marked partitions hold. `arc save` walks no archive folder: `startUnderLease`'s `mode === "save"` filter
  (`lib/store/projection/engine-start.ts`), which walks `.arc/completed` for `arc save` alone, goes. A new file made
  in an archived folder without `arc edit` is found only by the removal check and the persist and release steps
  (settled item 3).
- **A refresh that touches an archived file edited without `arc edit`** takes the edit in, as write-back takes any
  edit a refresh meets, and lays the file read-only again. Rights apply as anywhere, so an edit its maker may not make
  is refused there. This keeps the third pickup shipped § 8.4 names, "when a refresh touches the file".

## The growth-relative scale criterion

Two wordings, both verbatim. The design brief's, approved with A–E but not yet put to the Owner as a criterion:

> "An ordinary command's overhead does not grow with the archive or the team's activity: with 60,000 archived files
> and a pull of a day's changes waiting, the no-change overhead stays within its budget plus N ms, and a pull lays
> nothing in other worktrees." — a benchmark at synthetic scale in the store or integration suite.

The later wording, put to the Owner on 2026-11-07 as decision 4 of four:

> 4. **New success criterion for scale.** "An ordinary command's overhead does not grow with the archive or the team:
>    with 60,000 archived files, the no-change overhead stays within N ms of its value with an empty archive, and a
>    pull lays nothing in other worktrees until their next command." It's checked by a synthetic-scale benchmark. From
>    the model, N is a few ms on Linux and about 10 ms on Windows. **Lean: add it.**

Status: leaning-approved with the other leans; confirm at drafting. Neither fits as written: a command's archive-size
clause is A's claim, which `projection-worktrees` benchmarks and reports rather than holding as a criterion; the pull
clause was B's; and the team clause is `projection-narrowed-views`', which restates its part over C. D's part is
`arc save`, which A's claim leaves walking the whole archive. `projection-worktrees`' success criterion 4 reads each
Windows median with its Git calls' host time replaced by 42 ms a call, calls run at once counting as one; this
criterion's Windows N could read the same way.

D's part, settled with the Owner on 2026-11-10:

> **`arc save` costs what is opened, not what is archived.** In a synthetic store with about 60,000 archived files and
> none opened, a no-change `arc save` stays within N ms of its value with an empty archive.

N is the brief's: a few ms on Linux and about 10 ms on Windows, each Windows median with its Git calls' host time
replaced by 42 ms a call, as `projection-worktrees`' Success Criterion 4 reads. A file left open is outside it by
design: its cost, one quarter partition read a command until `arc save`, is the residual § The opened set's read names.

## D and ADR-035

ADR-035 item 6 names `.arc/completed/` among the familiar paths whose projection "is what people and agents browse and
edit". D lays that root read-only and opens a file for edit through a command.

**Disposition: amendment, delivered with D** (Owner, 2026-11-10). A Tier 2 dated amendment under ADR-035 § Amending
This Document, since the decision stands: the store stays authoritative, and the archive stays editable at its familiar
path, through a command. Chosen over waiting for the item 6 amendment `draft-projection-narrowed-views.md` proposes,
which carries D in one sentence but follows the cutover window, leaving the read-only archive unexplained in the ADR
from the flip until then; and over none, since D changes what any person does with their own archived files, not only
who may edit them, which the writer rules of the ADR's 2026-09-29 amendment cover. That unit's proposed amendment drops
its archive sentence (routed in `USER-INBOX § Work Unit`). The specification lists the amendment among what the
delivering change delivers, and the change writes it. Proposed text, naming no work unit as the ADR methodology's
reader-independence rule asks:

> **Amendment (date):** Item 6's projection lays `.arc/completed/` read-only. A correction to archived work opens one
> file with `arc edit <path>`, which makes it writable in that worktree under the same edit rights, and persists at
> `arc save`, which lays it read-only again. The decision stands: the store is authoritative, and the working copy sits
> at the familiar paths, opened in a person's own editor.

## Seams this builds on

A's partitions are designed as fixed seams in `spec-projection-worktrees.md`, as revised on that work unit's planning
branch (2026-11-07). Its section numbers are expected to hold; its wording may still move in that unit's review loop,
so re-read the committed text before relying on it here. Re-checked on 2026-11-10 against its work branch at
`f2812900fb`, with that unit in execution at its Task 1.5: § 3.1, § 15.3, § 15.5, § 16.2, and § 16.3's start read as
summarized below, and the seams statement as quoted.

- **§ 3.1 "The index's parts":** the header and partitions. One root group per root and per `completed/` quarter, loose
  `completed/` files their own group; SHA-1 blob-id names; the header as the commit point; reads load only the
  partitions holding touched entries; lock-free readers; a racy reference per written partition; a plain-JSON codec;
  and separate header and partition schemas. The header also marks each partition holding an unsettled entry: one
  ownerless, or a record naming an aside or kept taken-in copy, carrying an adoption, a pending or withheld mark, or a
  refusal, or holding a conflict notice it has not shown. A changed or in-progress mark leaves a partition unmarked,
  since a rebuild sets the changed mark on every file it finds. Passes over every entry read the walked partitions and
  the marked ones, `arc save` reads every partition, and the selection every one outside `completed/`. A partition
  mismatch a command finds in its own worktree after its start's read deletes that partition, never the header; a
  fan-out's visit, and the end in another worktree the fan-out visited, delete nothing.
- **§ 3.1 "The partitions' seams":** the fixed-seams statement, quoted below.
- **§ 15.3 "The index read, and what is left on Windows":** a command reads its walked roots' partitions, and an
  archive quarter's only where it lays, removes, or sweeps a file there or the quarter holds an unsettled entry, so a
  settled archive's size costs a command nothing.
- **§ 15.5, the fan-out paragraph:** a worktree a fan-out visits reads and writes its header and the partitions holding
  each path it lays or removes.
- **§ 16.2 "The index is a header and partitions":** the forward amendment to `spec-projection-substrate.md` § 3.1 and
  § 3.3.
- **§ 16.3 "The start reads the index's header and its walked partitions":** the start reads the header, its walked
  roots' partitions, those the header marks as holding an unsettled entry, and any other partition holding a path its
  sweep or refresh touches; `arc save`'s walk of `completed/` reads that root's partitions. That walk is
  `startUnderLease`'s `mode === "save"` filter (`lib/store/projection/engine-start.ts`), which walks `.arc/completed`'s
  folders only for `arc save`.

§ 3.1, as drafted:

> **The partitions' seams.** The root groups — one per root, `completed/` one per quarter — and the header as the
> commit point are the index's fixed seams. A change to which of `backlog/`'s or `completed/`'s records a worktree
> projects, or to how archived files are laid and edited, changes the entries a partition holds and the behavior laid
> over them, never how entries are grouped, named, or committed.

## Evidence

The scale assessment's results are in `notes-projection-worktrees.md` § Spike 3 and § Spike 4: the per-unit constants,
model v2's growth table on the Windows runner, and the corrections taken at that unit's specification fold
(2026-11-07). `draft-projection-narrowed-views.md` § Evidence carries the model's re-run at the scale anchor and its
limits. D's figure here comes from that re-run's one-person row: k=23 work units a month, 20 worktrees, three years of
archive, `arc save` walking the whole archive. The re-run reproduces the model's own `narrow` row at T=50, k=2 (56 ms a
command, 122 ms an `arc save`, and a 2.0 s spawn on Windows).
