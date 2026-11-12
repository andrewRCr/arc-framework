# Spec (`detailed` · `RFC`): projection-team-scale

- **Origin:** [internal] — split from `projection-worktrees`' scale changes (2026-11-07); the narrowed views later split
  out to `projection-narrowed-views` (2026-11-10).

- **Purpose:** Lay the projected archive read-only and open one archived file at a time for an in-place correction with
  `arc edit`, so `arc save` reads only the archived files a person has opened rather than an archive that grows without
  bound — the fourth member of the storage projection, landing before the flip.

---

## Introduction / Context

From the flip, the projection writes each stored record as a file at its familiar path in every worktree that holds one,
`.arc/completed/` included (ADR-035 item 6), and an archived work unit's owner corrects its files there in place
(`spec-projection-write-back.md` § 8.4). An ordinary command writes back every projected root but `completed/`
(`spec-projection-write-back.md` § 15.1), so such a correction persists at `arc save`, at the persist or release step,
or when a refresh touches the file. `arc save` finds it by walking every folder under `completed/` — a walk
`startUnderLease` (`lib/store/projection/engine-start.ts`) makes for `arc save` alone — and, over the index split into
partitions, by reading every partition (`spec-projection-worktrees.md` § 3.1).

That cost grows with the archive's age at any team size. This repository finishes about 23 work units a month, one
person with agents, at about 3.7 files each, so three years of archive hold about 3,100 archived files. The scale model
of `notes-projection-worktrees.md` § Spike 4 charges a no-change `arc save` on Windows about 49 µs an archived file
beyond what a command costs — 653 ms over 13,320 archived files between the command and `arc save` columns of its
`split` row for fifty people finishing two work units a month — so at three years `arc save` costs about 150 ms more
than an ordinary command, several times the margin an ordinary command's no-change start keeps over its measured cost on
Windows (`spec-projection-worktrees.md` § 15.3), and the increment keeps growing with the archive, to that row's 653 ms
with the index already split. The archive is also the root where an explicit step costs least. Archived work changes
rarely, and a correction to it — most often an errata note on a release entry after it shipped — is a small edit to one
file. Knowing which archived files are open for edit lets `arc save` read those and skip the rest.

Four things rest on `arc save` reading the whole archive, and move with it or stay with it:

- **The remedy for an archive partition that does not hash to its name.** The removal check and the persist and release
  steps name `arc save` for it, "whose start reads every partition and so rebuilds the index"
  (`spec-projection-worktrees.md` § 3.1), since an ordinary start reads only the partitions it walks and those the
  header marks, so never notices an unmarked archive partition whose bytes are wrong.
- **An archived edit made through the read-only mode.** Claude Code's Edit and Write, Vim's and Neovim's `:w!`, and
  Emacs's forced save write through a read-only file (`spec-projection-write-back.md` § 8.2). Once `arc save` stops
  reading the whole archive, no ordinary command meets such an edit.
- **A new file under `completed/`.** `arc save`'s walk of the archive's folders adopts it
  (`spec-projection-write-back.md` § 8.4, § 15.1). Once the walk goes, a new archived file opens with `arc edit`, and
  one made without it is named by `arc sync`'s report and refused over at removal (§ 7.2, § 8).
- **The lookup of a conflict's token.** `arc save --resolve <conflict>` finds its conflict through the index's mappings
  in every partition (`selectProjectionResolution`, `save-resolution.ts`; `spec-projection-write-back.md` § 6.5), and a
  conflict shown in a file, by markers or a notice line, leaves its entry settled (`unsettled`, `index-file.ts`, § 12),
  so its partition unmarked.

**Terms.** This specification uses the projection's terms as the shipped `spec-projection-write-back.md` § Introduction
/ Context defines them — store, record, projection, projected root, index, write-back, `arc save`, refresh, fan-out,
full materialization, racy rule, replace guard, swap, take-in port, notice line, the pending, refused, withheld, and
changed marks, removal check, persist step, release step, and the flip — and adds:

- **Header, partition, archive partition** — the index's parts (§ 12). The header names one partition per root group and
  marks each partition holding an unsettled entry; an archive partition is one `completed/` quarter's partition, or the
  one holding the files directly in `completed/`.
- **Unsettled entry** — an entry a pass over every entry looks for, whose partition the header therefore marks (§ 12).
- **Record entry, ownerless entry** — the index's two kinds of entry (`RecordEntrySchema`, `OwnerlessEntrySchema`,
  `lib/store/projection/index-schema.ts`): one for a path the store holds a record at, one for a file the store does not
  yet know, held for adoption.
- **Archived file, archived work** — a projected file under `.arc/completed/`; a record placed in `completed/`: an
  archived work unit's files, an archived cohort document, or an archived Errand's description.
- **Edit rights** — `spec-projection-write-back.md` § 8.1's rule, read through `readProjectionEditRights`
  (`lib/store/projection/rights.ts`). This change leaves them as they are.
- **Lay mode** — the file mode, read-only or writable, a staging gives a file, apart from its content (§ 2.1).
- **Opened, opened mark** — the index entry state `arc edit` sets on one archived file in one worktree, until `arc save`
  re-locks it (§ 3, § 4).
- **Re-lock** — `arc save` laying an opened file read-only again and clearing its mark (§ 6.2).
- **Forced edit** — an archived file changed in a worktree while its entry there is not opened.
- **New archived path** — a path under `completed/` at which the store holds no record and which adoption binds to an
  archived work item: a file inside an archived work unit's folder, or an archived Errand's description,
  `errand-<slug>.md` directly in its quarter folder (`projectAddress`, `lib/layout/projection.ts`).
- **Section numbers** — a bare `§ N` names a section of this specification; a section of another specification is cited
  with its file name. `spec-projection-worktrees.md` and `notes-projection-worktrees.md` are cited as committed at
  `9444325fe8`, save the budgets and tripwires, cited as that work unit's amendment A4 (2026-11-11) restates them at
  `440a357141`, and § 12 states what this design takes from them.

## Goals

1. **`arc save` costs what is opened, not what is archived:** it reads the archived files this worktree has opened and
   the archive partitions the header marks or its refresh touches, never the rest of the archive save to look up a
   conflict `arc save --resolve` names (§ 5, § 6).
2. **An archived file is corrected in place through one command.** `arc edit <path>` opens it in this worktree under
   unchanged edit rights; ordinary commands take its edits in, and `arc save` lands them and lays the file read-only
   again (§ 2–§ 6).
3. **No archived edit is lost silently.** A forced edit is taken in when a refresh touches its file, reported by
   `arc sync`, and refuses the checkout's removal, naming `arc edit` then `arc save`; an opened file's edit persists at
   removal (§ 7, § 8).
4. **Every remedy that relied on `arc save` reading the whole archive still works** (§ 6.1, § 7.2).
5. **The archive stays at its familiar paths,** browsed and searched in place with any editor or agent (§ 2).

## Non-Goals

_Editable in place until activation, then frozen; changes after that append: `Amended YYYY-MM-DD — <delta> — <prompt>`_

This change does not:

- **narrow which records a worktree projects:** a view of `backlog/` or `completed/` narrowed by size, an archive
  recency window, and bounding the backlog's walk or a pull's fan-out at team scale belong to a later change, as does a
  path the store holds a record at that a worktree does not lay;
- **change edit rights** or who may correct archived work (`spec-projection-write-back.md` § 8.4): `arc edit` moves no
  authority;
- **reopen archived work:** no verb does, and a substantial change to shipped work is a new work unit linked to its
  origin;
- **rewrite a workflow's errata convention** onto `arc edit`, which the flip's workflow rewrite does with this command;
- **change the index's root groups, partition names, commit point, or header format** (§ 4);
- **take an archived edit in at `arc sync`** (§ 7.2);
- **build the index's partitions, the start's refresh, the fan-out, `arc sync`'s full materialization, or the removal
  slots,** on which it builds (§ 12);
- **measure or bound the store's own per-command cost at large teams.**

## Proposed Design

§ 1 bounds and orders the change. § 2–§ 4 lay the archive read-only, open one file with `arc edit`, and record what is
open in the index. § 5–§ 8 state what every path does with an archived entry: a command's start, `arc save` and its
re-lock, a refresh, `arc sync`, and the removal check with the persist and release steps. § 9 states the transition
invariants and their tests, § 10 the forward amendments to shipped documents, § 11 the residuals the design accepts,
§ 12 the expected contracts it consumes, and § 13 each decision's ADR disposition.

### 1. Boundary, scope, and order

#### 1.1 What this change takes

- **`lib/store/projection/`** — the lay mode in staging and the `arc edit` notice in rendering (§ 2), the opened mark
  and the index's format version (§ 4), the start's and `arc save`'s reads of opened entries and the re-lock (§ 5, § 6),
  `arc sync`'s partition handling and report (§ 7.2), and the removal check's and the persist and release steps'
  treatment of archived entries (§ 8).
- **`arc edit <path>`** — a new command, its handler, and its help text (§ 3).
- **`arc status`** — lists opened files (§ 4).
- **ADR-035** — a dated amendment to item 6 (§ 10.3).
- **Tests** — unit and integration tests over the reference backend with real repositories and worktrees on disk, on
  Linux and in the portability lane; each typed refusal tested refusing and then succeeding once its condition is
  repaired; the perturbation tests of § 9.2; and the synthetic-scale benchmark of Success Criterion 1.

#### 1.2 One change

The command, its pickup at `arc save`, and the amendments land together or not at all: `arc save` may stop reading the
archive only once archived files lay read-only and an opened file is found through the index, and the read-only lay
without that pickup would leave every correction to a whole-archive read. It stays one work unit. Its forecast — this
specification under 1,000 lines and a change set of about 4,000 to 6,000 changed lines with its tests — sits below the
project's boundary marks.

#### 1.3 Review chunks and their order

This change lands on its own branch in three review chunks, each with its tests, in this order:

1. **The read-only archive and `arc edit`** — the lay mode, the notice, and every staging following it (§ 2), `arc edit`
   (§ 3), and the opened mark, the format version, and `arc status`'s listing (§ 4).
2. **The pickup** — a command's start (§ 5), `arc save`'s reads, re-lock, and report (§ 6), and a refresh's pickup and
   the rebuild (§ 7.1), with § 9.2's perturbation tests, each of which ends in `arc save`, and the benchmark.
3. **What the whole-archive read carried** — `arc sync`'s partition remedy and report (§ 7.2), the removal check and the
   persist and release steps (§ 8), and ADR-035's amendment (§ 10.3).

#### 1.4 Before the flip, and order

Before the flip the projection is dark. Over the in-repo implementation, whose store answers
`capabilities.stateOffBranch` false, archived files are tracked files edited in place, nothing lays them read-only, and
`arc save` refuses `unsupported` (`spec-projection-write-back.md` § 2.4). `arc edit` refuses `unsupported` there too,
naming that a file under `.arc/completed/` is edited in place before the flip. Nothing here runs live before the flip.

This change builds on `projection-worktrees`, which lands first (§ 12). The flip's first full materialization lays the
archive read-only, so this change lands before the flip.

### 2. The read-only archive

#### 2.1 Read-only is a lay mode, not an edit right

Today one place sets a staged file's mode: `stageRenderedRecordFile` (`lib/store/projection/staging.ts`) stages a file
read-only when its caller passes `readOnly`. `stageRecordFile`, through which the read-back after a landing, the drawing
of a clash, and the replace guard's restage stage a file, passes the rendering's protection mark, which the renderer
reads from the edit rights (`protectRenderedContent`, `record-render.ts`), falling back to the mode its own caller
passes (`rendered.result.protected ?? input.readOnly`); a full materialization renders for itself and passes the entry's
protection, taken from the same mark (`prepareMaterializationFile`, `materialization-file.ts`, § 12). Every engine
command binds protection, so the mark is `true` or `false` and no caller's mode counts, and the swap copies the entry's
protection from the same rendering (`renderedEntry`, `swap.ts`).

Here the rule sits where the mode is set: `stageRenderedRecordFile` lays a file read-only where the protection mark
protects it or its lay mode lays it read-only, and every caller passes the lay mode, computed from the target worktree's
entry for the path:

- **An archived file the edit rights protect,** such as another person's archived work, lays read-only with the notice
  naming its owner, as `spec-projection-write-back.md` § 8.2 has it, since `arc edit` would refuse it.
- **Any other archived file** lays read-only, unless the target worktree's entry for it is opened, when it lays writable
  — save that every staging of an opened file's landing inside `arc save`, in `arc save`'s own worktree, lays it
  read-only (§ 6.2); a fan-out from that `arc save` lays a file opened in another worktree writable still.
- **A file outside `completed/`** lays as today, its mode the protection mark's.

Edit rights and their protection mark stay as shipped: `workUnitRights` (`rights.ts`) answers `editable` for an archived
work unit's owner, so take-in never refuses an archived edit for being archived, whether it arrives from an opened file,
a refresh that meets a forced edit, or a persist step.

#### 2.2 The notice is content, the mode is not

The renderer writes an `arc edit` notice line beside the rights' own (`protectRenderedContent`, which today renders only
the rights' notice) into every record placed in `completed/` whose edit rights allow the edit, opened or not. The notice
names `arc edit <path>` then `arc save`, and says that `arc edit` opens the file for editing rather than opening an
editor. Since the notice does not depend on the opened mark, opening a file with `arc edit` and re-locking an unchanged
one change only its mode, never its content, so neither rewrites the file nor reads as an edit. A file other than
Markdown carries no notice line, as no protected file other than Markdown does (`protectRenderedContent` adds notices
only to a stamped file); its mode alone marks it.

#### 2.3 Every staging follows the lay mode

Every staging of an archived file reaches the mode `stageRenderedRecordFile` sets, and so follows the lay mode: a
refresh, a fan-out's visit, a full materialization — at a spawn, at a rebuild with no usable index, and at `arc sync` —
the read-back after a landing (`installWriteBack`, `read-back.ts`), the drawing of a clash found in the checkout
(`drawCheckoutClash`, `checkout-drawing.ts`), the replace guard's restage (`guardReplacement`, `replace-guard.ts`), and
the installation of a record arriving at a reused path (§ 12). A staging path added later reaches the same place, and so
the same rule. Each caller reads the target worktree's own entry, never the round's shared protection evidence, which
answers per record across worktrees (§ 12), since a file is opened in one worktree only.

A clash drawn into an archived file that is not opened is laid read-only like any other, and its resolution opens the
file with `arc edit` first, so `arc edit` stays the one path that opens an archived file.

### 3. `arc edit`

#### 3.1 The command

`arc edit <path>` opens one archived file in this worktree for an in-place correction. It runs as any `arc` command
does, its start taking pending edits in first (§ 5). Then, under the worktree's projection lock, it sets the opened mark
on the file's entry and then the file's write bit (§ 9.1), changing no content. The path resolves against the current
directory.

The file stays writable in this worktree until `arc save`. Ordinary commands take an opened file's edits in without
re-locking it (§ 5), and `arc save` lands it, or finds it unchanged, and lays it read-only again (§ 6.2), so a
correction saved twice with a command between the saves is never refused as a forced edit.

Its report names the opened path, that it stays writable until `arc save`, and that `arc save` lays it read-only again.

#### 3.2 What it opens

- **An archived record's file whose edit rights allow the edit:** an archived work unit's files, its meta and task list
  included, by its owner; an archived cohort document, by anyone; and an archived Errand's description, by its owner
  (`readProjectionEditRights`, `errandRights`, `rights.ts`; `spec-projection-write-back.md` § 8.1).
- **A file already changed** — a forced edit — so the remedy every refusal over one names works (§ 7, § 8).
- **A file already opened:** `arc edit` sets its write bit again and changes nothing else.
- **A new archived path,** by its work unit's or Errand's owner, only once its file exists. Its entry is an ownerless
  entry carrying the opened mark (§ 4), which the start's adoption retry hands to adoption (§ 5).

#### 3.3 What it refuses

Each refusal names why and its remedy:

- **A path outside this checkout's `completed/`:** an in-flight file is edited in place, a protected one names where it
  can be edited, as its notice does (`spec-projection-write-back.md` § 8.2), and a path in another checkout names
  running `arc edit` from the checkout that holds it.
- **A file whose edit rights refuse the edit,** naming its owner (`protectedRights`, `rights.ts`), as another person's
  archived work does.
- **Any other new path under `completed/`** — a new file directly in `completed/`, one in a quarter folder other than an
  archived Errand's description, or a new document in an archived cohort's folder — naming adoption's own remedy, since
  adoption refuses there (`adoptProjectionFile`, `adoption.ts`; `resolveLocatedAdoption`, `adoption-target.ts`;
  `spec-projection-write-back.md` § 9).
- **A path with no file:** a new archived path names creating the file first; a stored record's path whose file was
  deleted names `arc sync`, which rebuilds deleted files (`spec-projection-worktrees.md` § 2.4).
- **A path write-back never adopts** — an editor's side file, a folder file an operating system writes, or a symbolic
  link — naming `spec-projection-write-back.md` § 9's remedy for it.
- **A withheld file** (`spec-projection-worktrees.md` § 2.5), naming its remedy: copy out what is wanted, delete it, and
  open it again once the next command has rebuilt it.
- **A checkout that holds no projection** (`spec-projection-worktrees.md` § 2.5), naming why.
- **An archive partition that does not hash to its name,** found when `arc edit` reads its target's entry after its
  start: it ends its use of the index and deletes the partition, as any command that finds one after its start's read
  does (`spec-projection-worktrees.md` § 3.1), its lock passing the opt-in under which the projection lock deletes a
  partition whose read throws `ProjectionPartitionMismatch` (`invalidatePartition`, `lock.ts`; `index-memory.ts`; § 12),
  and refuses, naming a retry, whose start rebuilds the index.
- **`--skip-projection`,** since opening a file is projection work, as `arc save` refuses it; **no identity**, naming
  the remedy that sets `arc.identity`; and **a start that could not take its lock, lost its lease, or found the
  worktree's Git directory gone**, naming the holder, the loss, or the missing directory and a retry — each as
  `arc save` and `arc selection` refuse (`spec-projection-write-back.md` § 2.4, § 11.7).
- **Before the flip,** `unsupported` (§ 1.4).

`arc edit` is not `arc editor`, which writes an editor's settings for projected files (`spec-projection-write-back.md`
§ 11.4): a mistyped `arc edit vscode` refuses, naming no such path.

#### 3.4 Rights bind at landing

`arc edit` reads the edit rights only to refuse early, and writes no store record. The rights that bind are re-read when
the edit lands, by write-back's prepared admission (`spec-projection-write-back.md` § 7.2), where an archived work
unit's rights are its owner's, answered before any checkout's are read (`workUnitRights`). A file opened before its
rights change is refused there as any edit is, its edit kept in its file.

### 4. The opened mark in the index

- **The mark.** A record entry gains an optional opened mark. An ownerless entry may carry it too, its refusal made
  optional for that — today `OwnerlessEntrySchema` requires one — and an ownerless entry carries at least one of the
  two.
- **An opened entry is unsettled.** The opened mark joins the states that make an entry unsettled
  (`spec-projection-worktrees.md` § 3.1), so the write that sets it marks the entry's partition in the header, and every
  start, which reads the partitions the header marks (`spec-projection-worktrees.md` § 16.3), finds the opened entries
  without reading any other archive partition. The header's format is unchanged.
- **The format version moves** with the mark, so a build without it reads the index as another format version: its start
  rebuilds the index, and its fan-out and end skip the worktree (`spec-projection-worktrees.md` § 3.1), rather than
  rewriting a partition and its header mark without the opened state, which would stop an opened edit landing.
- **Adoption keeps the mark.** `recordAdoptionAcceptance` (`adoption-read-back.ts`) and `attachExistingProjectionFile`
  (`adoption-existing.ts`) each build a fresh record entry today; each carries an opened mark over from the entry it
  replaces, so an ordinary command's adoption of a new archived file lays it writable, and it stays opened until
  `arc save`, whose own adoption of it re-locks it (§ 6.2). A refused adoption keeps the mark already, since `refuse`
  (`adoption.ts`) carries the ownerless entry's fields over.
- **A moved entry keeps the mark.** Where a refresh moves an opened record's file to a new path, the mark moves with its
  entry, as the changed mark does (`spec-projection-worktrees.md` § 11.7).
- **`arc status` lists this worktree's opened files,** and shows an opened new path as refused too where its adoption
  refused (`status.ts`), so a file left open shows, and so does the reason an adoption retry keeps failing.
- **What the mark costs.** With no file opened, nothing: no entry carries the mark, so no archive partition is marked
  for it and a start reads none. Change detection reads an opened file's entry, so while a file stays open every command
  in its worktree reads that file's archive partition, until `arc save`. At the plain codec's 3.8 µs an entry, measured
  on Linux, and the 8–12 µs the model puts it at on Windows, where it was not measured, a quarter of the reference
  fixture of `spec-projection-worktrees.md` § 15.3, about 120 entries, costs a start about 0.5 ms on Linux and 1–1.5 ms
  on Windows, inside the margin that section leaves each start budget (§ 12, Success Criterion 1); macOS's cost an entry
  is not measured. At this repository's rate a quarter holds about 255 entries a person: about 1 ms a command on Linux
  and 2–3 ms on Windows for one person's archive, and for ten people's, with every record laid, about 10 ms on Linux,
  past Linux's margin, and 20–30 ms on Windows (§ 11).

### 5. A command's start

- **It reads the partitions the header marks,** so it finds the opened and unsettled archive entries. It walks no
  archive folder, and reads an unmarked archive partition only where its sweep or refresh touches a path there.
- **It checks each opened entry's file** by the racy rule and takes its edit in through write-back, which lands it and
  lays the file writable still: no command but `arc save` re-locks an opened file.
- **Its adoption retry,** which selects `completed/` only for `arc save` today (`adoptionRetries`, `engine-files.ts`),
  selects opened entries there at every command. It hands an opened new archived path to the shipped adoption route
  (`adoptProjectionFile`), which takes any entry that is not a record entry (`checkFileAtPath`, `engine-files.ts`),
  since a record entry needs a stored base a new file lacks (`RecordEntrySchema`); the record entry adoption writes
  keeps the mark (§ 4). Where the opened new path's file is absent, the route drops its entry, as shipped, and the
  command's report names it (§ 6.2).
- **As today,** it finishes an accepted adoption awaiting its read-back wherever it lies, `completed/` included, and
  leaves every other unsettled archive entry that is not opened to `arc save`.

### 6. `arc save`

#### 6.1 What it reads

`arc save` writes back every projected root but `completed/`, as every command does, and in `completed/` the opened
entries and the unsettled ones its marked partitions hold — a refusal a refresh left, an unfinished recording, an
accepted adoption whose read-back has not installed — and the subject file `--resolve` names (below), so each remedy
that names `arc save` still finishes, `spec-projection-worktrees.md` § 12.2's held entries among them.

- **It walks no archive folder.** The walk of `.arc/completed/` that `startUnderLease` makes for `arc save` alone (its
  `mode === "save"` filter of the walked roots, `engine-start.ts`) goes. Its recovery of swept aside copies under
  `completed/` stays, since the sweep names those paths.
- **It reads an unmarked archive partition only where its sweep or refresh touches a path there, or `--resolve` looks up
  its conflict (below),** so it clears changed marks only in the partitions it reads (`clearAcceptedMarks`,
  `save-changed.ts`, which reads every entry today). The selection never lists `completed/`
  (`spec-projection-write-back.md` § 11.7), so no archived changed mark matters to it.
- **`arc save --resolve` keeps its lookup.** It finds its conflict's token in every partition, as shipped
  (`selectProjectionResolution`), since a conflict shown in a file marks no partition, and writes back the subject file
  the token names, opened or not, as `--resolve` sends it even unedited (`spec-projection-write-back.md` § 6.5); a
  subject file not opened lands read-only, as its lay mode lays it. A resolution is rare and asked for, so it alone pays
  for reading the whole archive. Where the conflict shows with markers in an archived file not opened, `--resolve`'s
  refusal, which names the markers (`explicitResolutionMarkerRefusal`, `save-markers.ts`), names `arc edit <path>`
  first, since the file lies read-only.
- **The history retry stays:** where a write to a completed item refuses `state-unresolvable` naming its history ref,
  `arc save` pulls the ref and retries once, as shipped (`spec-projection-write-back.md` § 8.4).

#### 6.2 The re-lock

`arc save` settles each opened file by its state, and clears its mark last, only once its last look at the file, after
the file's read-only lay, finds it present and holding nothing the store lacks. A look that finds the path absent, or
the file emptied, never clears it: Vim, Neovim, and Emacs leave a path absent for a moment mid-save
(`spec-projection-substrate.md` § 5.5), and write-back reads an absent file at one look (`checkChange`,
`change-detection.ts`).

- **Its edit lands.** The landing's read-back is the lay: it stages the file read-only, and the replace guard
  (`guardReplacement`) re-checks the file against what the landing read before the swap, taking in a save made between
  the two, so none is locked in unseen. Every staging of the landing in `arc save`'s own worktree lays read-only: the
  read-back's own (`installWriteBack`), the guard's restage after it takes such a save in, and an adoption's read-back
  where `arc save` is the adopting command (`resumeAdoptionReadBack`, `adoption-read-back.ts`). Then the mark clears —
  save where the guard finds the path absent, when the swap rebuilds it by the link alone (`rebuild`, `swap.ts`) and the
  mark stays: the landed file lies read-only and still opened, the state a stop after the swap leaves (§ 9.1), so a save
  written after it is taken in as an opened edit, and the next `arc save` that finds it unchanged re-locks it.
- **It is unchanged.** `arc save` lays it read-only in place, then re-checks it against its entry, and only then clears
  the mark. A save that lands between the lay and the re-check — an editor writing through the mode, or a rename-save,
  which replaces the file — changes its modification time, which the re-check compares beside its size and inode
  (`FileStatSchema`, `index-schema.ts`; `isStatClean`, `change-detection.ts`), so the re-check finds it and settles it
  as an edit, as the cases above and below state.
- **It is gone or emptied.** Where its check finds the path absent, or a Markdown file emptied past the settle window,
  which write-back reads as deleted (`settledVerdict`, `read-gate.ts`; `spec-projection-substrate.md` § 4), or the
  unchanged case's re-check finds the path absent, `arc save` leaves a stored record's file opened, and its report names
  `arc sync`, which writes an absent file by the link alone and replaces an emptied one by the swap
  (`spec-projection-worktrees.md` § 2.4) — laid writable, as it stays opened (§ 2.3) — after which `arc save` finds it
  unchanged and re-locks it. A save that was under way lands as any opened edit does. An opened new path has no stored
  record to rebuild: the start's adoption retry drops an ownerless entry whose file is absent, as shipped
  (`reconcileAbsentAdoption`, `adoption.ts`), and names an opened one it drops in that command's report, with `arc edit`
  to open the file again should it return (§ 11).
- **Its edit does not land.** The file is laid writable again where `arc save` had laid it read-only, and stays opened,
  its report naming the remedy:
    - a landing with no read-back, in a root the ignore guard leaves unwritable (`sendFile`, `engine-files.ts`), which
      lays nothing and leaves the entry pending;
    - any other take-in answer (`TakeInResult`, `take-in-port.ts`) — deferred, pending, clashed with markers placed,
      refused (a store's `state-unresolvable` after the history retry among them), or unparseable;
    - a file the replace guard leaves unreplaced.

#### 6.3 Its report

`arc save`'s report names each file it lays read-only again, with `arc edit` as the way to keep editing it, and each
opened file it leaves opened, with that file's remedy. An edit made after the re-lock without `arc edit` is a forced
edit (§ 11).

### 7. Refresh and `arc sync`

#### 7.1 A refresh, a fan-out, and a rebuild

- **The lay mode** governs every file a refresh, a fan-out, or a full materialization writes (§ 2.3).
- **A refresh that touches a forced edit** takes the edit in, as the replace guard takes in any edit a refresh meets
  (`spec-projection-substrate.md` § 5.1), and lays the file read-only again. Edit rights apply as anywhere, so an edit
  its maker may not make is refused there and stays in its file. This keeps the third pickup shipped
  `spec-projection-write-back.md` § 8.4 names, "when a refresh touches the file".
- **The index lost between `arc edit` and `arc save`.** A start with no usable index rebuilds it with no opened marks to
  read (`spec-projection-worktrees.md` § 2.5): an opened file holding an edit is left as it is and marked withheld,
  named in every report, and refused over by the removal check and the persist and release steps; an unedited one is
  refreshed and laid read-only again. No opened edit is skipped silently: the person copies out what they want, deletes
  the withheld file, opens it again with `arc edit` once the next command has rebuilt it, and re-applies the edit.

#### 7.2 What `arc sync` takes over

- **The remedy for a mismatched archive partition is `arc sync`.** `arc sync`'s full materialization
  (`spec-projection-worktrees.md` § 2.4) reads every partition, and a partition whose bytes do not hash to its name
  leaves the index unusable there and then, so the sync materializes in full at once, as for any index a command cannot
  use (`spec-projection-worktrees.md` § 2.5). It does not delete the partition, as a command that finds a mismatch after
  its start's read does (`spec-projection-worktrees.md` § 3.1), which would leave the rebuild to the next start and the
  removal check answering `unobservable` until some command ran in that checkout. Materializing at once makes
  `arc sync`, run from that checkout, enough for the remedy the removal check and the persist and release steps print
  for such a partition (§ 10.2).
- **`arc sync` reports forced edits.** Its full materialization compares each archived file it visits against its entry
  and names each one changed while not opened, with the remedy `arc edit` then `arc save` where the edit rights allow
  the edit, and otherwise the rights' remedy naming the owner. It takes nothing in: such an edit lands when a refresh
  touches its file or after `arc edit` and `arc save`, and the removal refuses over it (§ 8).
- **`arc sync` reports new archived files.** From the walk its full materialization makes of every projected root
  (§ 12), it names each file under `completed/` that the index does not hold — editor side files, the folder files
  operating systems write, and symbolic links aside, as adoption skips them (`spec-projection-write-back.md` § 9) — with
  the remedy § 8 gives it: `arc edit` then `arc save` at a new archived path whose edit rights allow the edit, the
  rights' remedy naming the owner where they refuse it, and adoption's own remedy elsewhere. It adopts nothing, and the
  comparison costs nothing beyond the walk.
- **Its cost.** The report costs a sync one read of the archive's partitions beside its visit to every projected path,
  as modelled from `notes-projection-worktrees.md` § Spike 4: about 15 ms at this repository's size, and about 0.4–0.7 s
  at 60,000 archived files on Windows, with about 1 s more there should the materialization not already stat every path.
  It adds to the full materialization `arc sync` already runs over those files (`spec-projection-worktrees.md` § 2.4),
  which § 15.4 there bounds at its 800-file reference.

### 8. The removal check and the persist and release steps

The removal check and the persist and release steps still walk the whole archive (`spec-projection-worktrees.md` § 12.2,
§ 12.3), since a checkout is removed or released rarely, and treat each archived entry by its state:

- **An opened file's edit persists, and an opened new file adopts,** as shipped `spec-projection-write-back.md` § 8.4
  has them persist any archived correction; the removal then takes the file.
- **An opened entry whose file is absent or emptied** holds no edit (`checkFileAtPath`, `engine-files.ts`;
  `settledVerdict`, `read-gate.ts`), so the removal proceeds; a stored record's version stays in the store.
- **An edit its rights refuse,** as for another person's archived work, keeps `spec-projection-worktrees.md` § 12.2's
  answer for such an edit, naming the owner (`protectedRights`, which `workUnitRights` answers for anyone but the owner
  before it reads the placement; adoption's `readProjectionProtection`, `adoption.ts`), since `arc edit` would refuse
  there.
- **A forced edit refuses,** naming `arc edit` then `arc save` run in that checkout: the removal check answers
  `persist-would-refuse`, and the persist and release steps refuse, the file keeping its content.
- **A new file with no entry refuses:** at a new archived path, naming `arc edit` then `arc save` run in that checkout,
  or the owner where the edit rights refuse the edit (above); elsewhere under `completed/`, as
  `spec-projection-worktrees.md` § 12.2 answers a file adoption would refuse, with adoption's own remedy
  (`resolveLocatedAdoption`; `adoptProjectionFile`'s refusal of a new cohort document), since `arc edit` opens no new
  path there.
- **A file held by a stored conflict** keeps `spec-projection-write-back.md` § 6.4's hold at removal, its remedy run in
  that checkout: `arc save --resolve <conflict>` for a conflict shown by a notice line (§ 6.1), and, where markers must
  be edited out of a file not opened, `arc edit` first, since the file lies read-only.
- **An unsettled entry** keeps `spec-projection-worktrees.md` § 12.2's handling.

Each refusal clears once repaired: after `arc edit` and `arc save` in that checkout over a forced edit, the removal
check answers `removable` and the removal proceeds.

### 9. Transition invariants

For each step pair this design adds, this section states what must hold between the steps, where it is enforced, and the
perturbation test that proves it. Each test stops or perturbs the pair between its steps and asserts the state below, a
refusal or a stop, then runs a legitimate repair and the operation to completion.

#### 9.1 Local steps, under the worktree's projection lock

This design adds no prepared store write. `arc edit` writes only the worktree's index and the file's write bit; an
opened file lands through write-back's own prepared admission (`spec-projection-write-back.md` § 7.2), which fences its
own reads; a new file adopts through `spec-projection-write-back.md` § 9's existing route; and the re-lock at `arc save`
is local. Its own step pairs each run under the worktree's projection lock, ordered so a stop between them leaves a
state the next command repairs:

- **`arc edit`: the opened mark, then the write bit.** A stop between leaves an opened file still read-only, which
  `arc save` finds unchanged, lays read-only, and unmarks. The reverse order would leave a writable, unmarked file, a
  forced edit once changed.
- **`arc save` over a landing: the store's acceptance, the read-back's swap, then the mark cleared.** A stop after the
  store accepts the write, before the swap, leaves the edited file and the write's recording, which the next command
  finishes (`spec-projection-write-back.md` § 7.1), laying the file read-only inside `arc save` and writable elsewhere;
  the next `arc save` then finds it unchanged and re-locks it. A stop after the swap leaves the file read-only and still
  marked, which the next `arc save` finds unchanged and unmarks. Clearing the mark before the swap would leave a
  writable, unmarked file, and a swap without the guard's re-check would lock in a save made between the landing and the
  swap, unseen while not opened.
- **`arc save` over an unchanged file: the read-only lay, the re-check, then the mark cleared.** A save landing between
  the lay and the re-check is found by the re-check and settled as an edit. A stop after the lay leaves the file
  read-only and still marked, so every command still checks it as opened and takes in an edit written through the mode
  meanwhile, and the next `arc save` unmarks it. Re-checking before the lay would lock in a save made between the two,
  and clearing the mark before the re-check would leave such a save unseen.

#### 9.2 The perturbation tests

1. `arc edit` stopped between its mark and its write bit, then `arc save` (§ 9.1).
2. `arc save` stopped after the store accepts an opened file's write and before the read-back's swap, and again after
   the swap and before the mark clears, each followed by another command and another `arc save` (§ 9.1).
3. A save made between `arc save`'s landing and its read-back's swap: the guard takes it in, and nothing is locked in
   unseen (§ 6.2).
4. A save made between an unchanged opened file's read-only lay and its re-check, once by a write through the mode and
   once by a rename-save, and a stop after that lay, each followed by `arc save`: the save lands, and nothing is locked
   in unseen (§ 6.2, § 9.1).
5. A landing that does not land — each take-in answer but `no-edit` and `taken-in`, and a file the guard leaves
   unreplaced: the file stays writable and opened with its remedy reported, and a repaired `arc save` re-locks it
   (§ 6.2).
6. A concurrent change to the same archived record from another checkout between `arc edit` and `arc save`: the store
   merges the edit as any concurrent edit or files a conflict, the file stays opened until its edit lands, and once
   resolved `arc save` lands it and re-locks it (§ 3.4, § 6.2).
7. A forced edit, then `arc edit` over the changed file, then `arc save` (§ 3.2).
8. A new file opened, then adopted by an ordinary command — still opened and writable after the adoption's read-back —
   then `arc save`, which lays it read-only and unmarks it; and one adopted by `arc save` itself, laid read-only and
   unmarked (§ 4, § 5).
9. An opened file absent at `arc save`'s check, deleted before it; an opened Markdown file emptied past the settle
   window; an unchanged opened file whose path an editor's save leaves absent at the re-check after the lay; and a
   landing whose guard finds the path absent, the swap rebuilding it by the link. `arc save` leaves each opened, its
   report naming `arc sync` for the deleted and the emptied file, which `arc sync` lays writable; the editor's save
   lands at the next command; and the next `arc save` re-locks each file it finds unchanged. An opened new file deleted:
   the next command drops its entry and names it in its report, and once the file is created again, `arc edit` and
   `arc save` land it (§ 6.2).
10. The index lost between `arc edit` and `arc save`: the next start rebuilds it, an opened file holding an edit is
    withheld, named, and refused over by the removal check and the persist and release steps, and an unedited one is
    laid read-only again; once the withheld file is deleted, opened again, and its edit re-applied, the correction lands
    (§ 7.1).

### 10. Forward amendments to shipped documents

`spec-projection-write-back.md` has shipped, and `spec-projection-worktrees.md`, as committed at `9444325fe8`, ships
before this change starts (§ 12). Where this design changes what they define, the change is stated here and built by
this change; neither is edited. ADR-035 takes a dated amendment, which this change writes (§ 10.3).

#### 10.1 Write-back (`spec-projection-write-back.md`)

- **§ 2.4, `arc save`.** § 2.4 has `arc save` write back across every projected root, `completed/` included. Here it
  writes back, in `completed/`, the opened entries, the unsettled ones its marked partitions hold, and a `--resolve`
  subject, walks no archive folder, reads every partition only for `--resolve`'s lookup, clears changed marks only in
  the partitions it reads, and re-locks each opened file whose edit landed or that is unchanged (§ 6).
- **§ 6.5, `arc save --resolve`.** § 6.5 refuses a conflict this checkout shows with markers, naming them. Here, for an
  archived file not opened, the refusal names `arc edit <path>` first, since the file lies read-only, and the lookup
  still reads every partition (§ 6.1).
- **§ 8.2, the notice and the mode.** § 8.2's notice names where an edit can be made, and its read-only mode follows
  protection. Here an archived file whose edit rights allow the edit carries a notice naming `arc edit` then `arc save`,
  and lays read-only by its lay mode unless opened in that worktree (§ 2); another person's archived work keeps § 8.2's
  notice naming its owner.
- **§ 8.4, archived work.** § 8.4 lets the owner edit archived files in place, the correction persisting at `arc save`,
  at the persist or release step, or when a refresh touches the file. Here archived files lay read-only. A correction
  first opens one file with `arc edit <path>`, which makes it writable in that worktree, or creates a file at a new
  archived path and then opens it; ordinary commands take its edit in, or adopt the new file, and `arc save` lands it
  and lays it read-only again. `arc save` reads only the opened and unsettled archive entries and a `--resolve` subject;
  a refresh that touches a forced edit takes it in and lays the file read-only again; and the removal check and the
  persist and release steps still walk the whole archive, so a forced edit is never lost: the removal refuses, naming
  `arc edit` and `arc save`, or the owner where the edit rights refuse the edit. A substantial change is a new work unit
  linked to its origin, since no verb reopens archived work. Who may edit stays as § 8.4 states.
- **§ 9, new files in `completed/`.** § 9 adopts a new file under `completed/` into its archived work unit under § 8.4's
  rules. Here a new file at a new archived path is adopted once opened with `arc edit`, by the first command after,
  keeping its opened mark (§ 4, § 5); one made without it is named by `arc sync`'s report and refused over by the
  removal check and the persist and release steps (§ 7.2, § 8).
- **§ 11.7, clearing the changed mark.** § 11.7 has `arc save` clear the mark on every file holding no edit the store
  lacks. Here it clears it only in the partitions it reads, which leaves the selection unchanged, since it never lists
  `completed/` (§ 6.1).
- **§ 15.1, what write-back checks.** § 15.1 has `completed/` checked by `arc save`, by the removal check and the
  persist and release steps, and when a refresh touches a file. Here every start checks the opened entries, `arc save`
  checks those, the unsettled ones the marked partitions hold, and a `--resolve` subject, a refresh still checks a file
  it touches, and the removal check and the persist and release steps still walk the whole archive (§ 5–§ 8).

#### 10.2 Worktrees (`spec-projection-worktrees.md`)

- **§ 2.4, `arc sync`.** § 2.4 has `arc sync` rebuild deleted files as a full materialization. Here that materialization
  reads every partition, materializes in full at once where one does not hash to its name, and reports each forced edit
  and each new archived file it finds (§ 7.2).
- **§ 3.1, the index's parts.** § 3.1's unsettled states gain the opened mark, and an ownerless entry may carry the mark
  in place of a refusal (§ 4). § 3.1 has `arc save` read every partition; here `arc save` reads the partitions any start
  reads, and every partition only for `--resolve`'s lookup (§ 6.1), and `arc sync`'s full materialization reads every
  partition (§ 7.2). § 3.1 lists `arc sync`'s materialization among the places where a mismatch found after the start's
  read ends the command's use of the index and deletes that partition; here `arc sync`'s materialization instead
  materializes in full at once, deleting nothing (§ 7.2). Where § 3.1 has the removal check and the persist and release
  steps, finding a partition that does not hash to its name, name `arc save` run from that checkout, "whose start reads
  every partition and so rebuilds the index", they name `arc sync` run from that checkout, whose full materialization
  reads every partition and rebuilds the index at once (§ 7.2).
- **§ 12.2, the removal check and the persist step.** § 12.2's persist step writes back and adopts every `completed/`
  file. Here it persists an opened file's edit and adopts an opened new file, and the check and the step refuse over a
  forced edit and over a new archived file with no entry, as § 8 states. Where § 12.2's held entries name `arc save`,
  "whose walk finishes it", the phrase reads "which finishes it", since `arc save` reads the marked partitions that hold
  them.
- **§ 12.3, the release step.** It runs § 12.2's steps 2–4 as amended above.
- **§ 16.2, the index as a header and partitions.** Its clause that a mismatch found after the start's read in a
  command's own worktree deletes that partition no longer covers `arc sync`'s materialization, which materializes in
  full at once, and its sentence naming `arc save` as the remedy for a partition that does not hash to its name names
  `arc sync`, as in § 3.1 above.
- **§ 16.3, the start's index read.** § 16.3 has `arc save`'s walk of `completed/` read that root's partitions. Here no
  such walk remains: `arc save` reads, as every start does, the header, its walked roots' partitions, the partitions the
  header marks, and any other partition holding a path its sweep or refresh touches, reading every partition only to
  look up `--resolve`'s conflict (§ 6.1).
- **Success Criterion 2.** Beside its existing cases, a forced edit and a new archived file with no entry are files over
  which the removal check answers `persist-would-refuse` and the persist and release steps refuse, then succeed once
  resolved, and an opened file's edit persists at removal.

#### 10.3 ADR-035

Item 6 names `.arc/completed/` among the familiar paths whose projection "is what people and agents browse and edit";
this design lays that root read-only and opens a file for edit through a command. The decision stands — the store stays
authoritative, and the archive stays editable at its familiar path, through a command — so this change appends a dated
amendment under ADR-035 § Amending This Document rather than superseding the record, dated the day the change writes it:

> **Amendment (YYYY-MM-DD):** Item 6's projection lays `.arc/completed/` read-only. A correction to archived work opens
> one file with `arc edit <path>`, which makes it writable in that worktree under the same edit rights. The edit
> persists at the next command, as any edit does, and `arc save` lays the file read-only again. The decision stands: the
> store is authoritative, and the working copy sits at the familiar paths, opened in a person's own editor.

### 11. Residuals the design accepts

1. **A forced edit after a re-lock.** An agent continuing a correction past the `arc save` that re-locked its file, as a
   workflow saving at each approval gate re-locks it at each, or an editor writing through the mode, makes a forced
   edit. It is taken in when a refresh touches the file, named by `arc sync`'s report, and refused over at the removal
   check; until one of those, it waits unpersisted.
2. **No `arc sync`, no report.** With the sync setting `manual`, handoff runs no `arc sync`, so its report waits for a
   sync someone runs; a checkout never synced, refreshed over the file, or removed keeps a forced edit or a new archived
   file unpersisted with no signal.
3. **A new file without `arc edit`.** A file made at a new archived path without `arc edit` has no entry, so no command
   but `arc sync` names it, and only the removal check and the persist and release steps refuse over it.
4. **A file left open.** Its archive partition is read by every command in its worktree until `arc save` re-locks it
   (§ 4), and an opened file found absent or emptied stays open until `arc sync` writes it again and `arc save` re-locks
   it (§ 6.2); `arc status` lists it. Its cost a command grows with its quarter, as any unsettled archive entry's does
   (`spec-projection-worktrees.md` § 3.1): near ten people's archive at this repository's rate it passes the margin
   § 15.3 there leaves Linux's start budget and nears that start's tripwire, and past that it raises the start notice of
   § 15.4 there (§ 4). This change regroups no partition (Non-Goals).
5. **A build without the mark.** A checkout whose build predates this change rebuilds an index this build wrote,
   withholding an opened file holding an edit as any rebuild does (§ 4, § 7.1).
6. **An opened new file absent at one look.** A command whose start finds an opened new file's path absent drops its
   entry, as adoption drops any absent ownerless entry, even where an editor's save left the path absent only for a
   moment. Its report names the file and `arc edit` to open it again; once the file is back with no entry, `arc sync`
   names it and the removal check refuses over it (§ 6.2, § 7.2, § 8). The window lasts only until a command adopts the
   file, normally the first after `arc edit`.

### 12. Expected contracts

- **`projection-worktrees`** lands before this change starts; this work unit depends on it. Its specification,
  `spec-projection-worktrees.md`, is cited as committed at `9444325fe8` on that work unit's branch until it ships, save
  the budgets and tripwires below. This design takes from it, as that commit states and builds them:
    - **The index's header and partitions** (§ 3.1 there). The header names, for each root group — `active/`,
      `backlog/`, an identity's personal root, each quarter folder under `completed/`, and the files directly in
      `completed/` — its partition, by the blob id of the partition's bytes, and whether that partition holds an
      unsettled entry. An entry is unsettled when it is ownerless, or a record that names an aside or kept taken-in
      copy, carries an adoption, a pending or withheld mark, or a refusal, or holds a conflict notice it has not shown.
      A write writes its changed partitions, then the header, the commit point. The root groups and the header are fixed
      seams: a change to how archived files are laid and edited changes the entries a partition holds, never how entries
      are grouped, named, or committed.
    - **The start's read** (§ 16.3 there): the header, its walked roots' partitions, the partitions the header marks,
      and any other partition holding a path its sweep or refresh touches.
    - **An index a command cannot use** (§ 3.1 there). An index missing, unreadable, or of another format version gets a
      full materialization at the start, the fan-out and the end skip its worktree, and the removal check answers
      `unobservable`. A missing partition, or one whose bytes do not hash to its name, makes the index unusable to a
      reader holding the worktree's projection lock; one a command finds after its start's read ends that command's use
      of the index and deletes the partition.
    - **The full materialization and the withheld mark** (§ 2.5 there). A full materialization writes every projected
      record under the replace guard and adoption's rules — at spawn, into a worktree with no index, and at `arc sync` —
      staging through `prepareMaterializationFile` (`materialization-file.ts`) and walking every projected root's
      folders (`materializeProjectionRoot`, `materialization.ts`). Into a worktree with no usable index it refreshes
      only a file that cannot hold an edit, at a path the projection lays a stored record at, and marks every other file
      withheld: left as it is, written over by nothing, sent nowhere, named in every report, and refused over by the
      removal check and the persist and release steps until the person deletes it, when a stored record's path is
      written again from the store and any other entry goes.
    - **`arc sync`'s rebuild** (§ 2.4 there): a full materialization run before its network steps, rebuilding deleted
      projected files.
    - **A refresh's and a fan-out's staging** (§ 15.2, § 15.5 there): protection read once per round through evidence
      shared across worktrees, and a record arriving at a reused path installed under a handoff that keeps both records'
      identities.
    - **The changed mark** moving with its record when a path moves (§ 11.7 there).
    - **The removal check and the persist and release steps** (§ 12.2, § 12.3 there). The check reads only and answers
      `removable`, `missing`, or `refused` as `dirty`, `unobservable`, `locked`, or `persist-would-refuse` with a
      remedy. The persist step, under the target worktree's projection lock, writes back every edit in every projected
      root, `completed/` included, adopts every new file, takes over every aside copy, and refuses with a file's remedy
      where anything stays unpersisted. The release step runs the persist step's steps on a checkout released rather
      than removed, the primary among them, which keeps its projection.
    - **The budgets and tripwires** (§ 15.3, § 15.4, and Success Criterion 11 there), as that work unit's amendment A4
      (2026-11-11) restates them at `440a357141`, superseding Success Criterion 4 there. Each bounds a complete native
      operation's raw median on a named reference for each of Linux, Windows, and macOS, over a fixture of 800 projected
      files, 320 of them hot and 480 archived across four quarters, paired with one of 60,320 at the same hot files,
      owners, and quarters. A start's margin is its start budget less the slower of its reference's two calibration
      medians, the smaller fixture's and the larger's. On another host a reading credits only demonstrated excess Git
      delay on the operation's critical path, and otherwise reads raw time. A4's revalidation there is pending, so this
      design cites them by section, never by figure.
    - **A settled archive costs a start nothing.** A start reads no unmarked archive partition (§ 3.1, § 16.3 there).
      Interleaved paired runs on the named Linux reference, the archive grown from 800 to 60,320 files across four
      quarters, found no difference in a no-change start, the median paired difference −0.27 ms, and a start and an end
      leave invalid bytes in a settled archive partition unread (`notes-projection-worktrees.md` § Implementation timing
      feedback, as committed at `1999ade81e`). What still grows is the header's map, one entry a quarter (Cross-cutting
      Performance).

  Should any of these land other than as stated here, this specification is amended forward before it is built on.
- **`projection-write-back`**, shipped: edit rights (`spec-projection-write-back.md` § 8), write-back's prepared
  admission (§ 7.2 there), adoption (§ 9 there), `arc save` and its history retry (§ 2.4, § 8.4 there), and the
  selection (§ 11.7 there).

### 13. ADR dispositions

- **The read-only archive and `arc edit`** (§ 2, § 3): covered by ADR-035, which this change amends (§ 10.3). The
  command's contract is the amendment's subject; the name's alternatives and rationale stay here (Alternatives &
  Rationale).
- **ADR-035 item 6:** an amendment to ADR-035, delivered with this change (§ 10.3).
- **The opened mark in the index** (§ 4): `none` — a tactical choice inside the projection index, whose format the
  projection's specifications define; the alternative weighed is recorded here.
- **`arc save`'s reads** (§ 6.1): `none` — they follow from the mark, obvious from the code.
- **A refresh's pickup of a forced edit** (§ 7.1): covered by ADR-035 item 7 — no write is lost silently, and a refresh
  never overwrites an unsynced edit.
- **`arc sync` as the partition remedy, and its report of forced edits and new archived files** (§ 7.2): `none` —
  tactical choices inside the projection's commands; the alternatives weighed are recorded here. An opened file's edit
  persisting at removal (§ 8) is covered by ADR-035 item 7: no write is lost silently.
- **How each path treats an archived entry** (§ 2, § 5–§ 8): `none` — tactical choices inside the projection's engine;
  the lay mode's alternative is recorded here.
- **No prepared store write, and the local steps' order** (§ 9): `none` — tactical.
- **`arc edit`'s refusals, before the flip among them** (§ 1.4, § 3.3): `none` — tactical, following `arc save`'s.
- **A substantial change is a new work unit** (Non-Goals): `none` — it records the existing lifecycle and decides
  nothing.
- **The scale criterion** (Success Criterion 1): `none` — a success criterion, meeting none of the ADR methodology's
  five criteria; it is read over the projection's reference fixtures (§ 12) and sets no team-size envelope (§ 11).

## Alternatives & Rationale

- **`arc unlock <path>` — rejected for `arc edit`.** Weighed against `arc edit` only for its nearness to `arc editor`,
  `unlock` costs more elsewhere. It already names the worktree lock, whose `git worktree unlock <path>` ARC prints as a
  remedy (`unlockFirst`, `lib/session-init/missing-worktree-folders.ts`; `manualHuskCleanup`,
  `commands/agenda/cleanup.ts`) and runs as a removal step (`removeWorktreeCheckout`, `lib/git/worktree-removal.ts`),
  beside the projection lock; and Git LFS runs the opposite polarity, where `git lfs lock` makes a file yours to write
  and `git lfs unlock` gives it back. Perforce lays files read-only and `p4 edit` opens one for edit, which is this
  mechanism. `arc editor`'s nearness is answered by a mistyped `arc edit vscode` refusing, and by the help text and the
  notice saying the command opens a file, not an editor.
- **Re-locking at the first command that lands the edit — rejected** for re-locking at `arc save`. Agents run commands
  constantly, so a re-lock between two saves of one correction would turn the second into a forced edit, refused until
  `arc edit` and `arc save` ran again.
- **A header field listing opened paths — rejected** for the per-partition mark. It changes the header's format, and
  costs less than the mark only by copying each opened file's stat and blob id into the header beside its entry, a
  second copy of state the index must keep in step.
- **An `archive` reason among the edit rights — rejected** for a lay mode. It would refuse every archived take-in — an
  opened file's, a refresh's pickup of a forced edit, a persist step's — and need an exception for each.
- **`arc save` walking the archive's folders for new files — rejected.** It restores the cost this design removes; a new
  archived file opens with `arc edit` instead, and one made without it is named by `arc sync`'s report, which reuses the
  walk its full materialization already makes, and refused over at removal (§ 7.2, § 11 item 3).
- **Accepting the forced-edit gap, or taking forced edits in at `arc sync` — rejected** for `arc sync`'s report. The gap
  leaves an edit in a checkout that is never removed unpersisted with no signal; taking it in at `arc sync`, which runs
  unattended at handoff, would publish edits no one opened, where a refresh takes one in only because it cannot write
  over it.
- **Persisting a forced edit at removal or release — rejected** for refusing over it, reversing shipped
  `spec-projection-write-back.md` § 8.4, where the persist and release steps persist any archived correction. Those
  steps run inside teardown, abandon, or an Errand's end, unattended as `arc sync` is, so persisting would publish an
  edit no one opened; refusing puts it before the person running the removal, whose remedy is two commands, `arc edit`
  and `arc save`. An opened file's edit, which someone did open, still persists there (§ 8). The primary's release
  refuses the same way though the primary keeps its projection, since every release refuses over what it has not
  persisted (`spec-projection-worktrees.md` § 12.3), and one rule for every release keeps the refusal a signal rather
  than a case to learn.
- **`arc sync` deleting a mismatched partition, as a command does — rejected** for materializing at once, which makes
  `arc sync` alone enough for the remedy printed, where deleting would leave the rebuild to the next start and the
  removal check answering `unobservable` meanwhile.
- **Keeping the index's format version — rejected.** A build without the mark would rewrite a partition and its header
  mark without the opened state, and an opened edit would stop landing.
- **Waiting for a later amendment of ADR-035, or none — rejected.** A later amendment narrowing what worktrees project
  would leave the read-only archive unexplained in the ADR from the flip until then; and the change is more than who may
  edit, which the ADR's writer rules cover, since it changes what any person does with their own archived files.

## Cross-cutting Considerations

- **Data loss is the failure that matters.** `arc save` narrows from the whole archive to the opened set, so a miss
  there is a silent loss. Rigor concentrates on the opened mark's lifetime (§ 4), the re-lock's order and its guard
  re-check (§ 6.2, § 9.1), and the paths that still meet a forced edit (§ 7, § 8), each with a perturbation test
  (§ 9.2). The residuals are named (§ 11).
- **Trust boundary.** Unchanged. `arc edit` is a speed bump that narrows `arc save`'s reads and moves no authority; the
  rights that bind are re-read at landing (§ 3.4), and a hand edit stays untrusted input through write-back's parser,
  write check, and admission (`spec-projection-write-back.md` § 7).
- **Performance.** `arc save`'s no-change cost stops growing with the archive (Success Criterion 1). Since a settled
  archive costs a start nothing (§ 12), what this design leaves growing with the archive is the header's map of archive
  partitions, one entry a quarter, under 0.1 ms at three years; reading every archive partition at 60,000 files costs
  about 230 ms on Linux at the plain codec's 3.8 µs an entry, and walking the archive's folders about 100–140 ms at
  1.7–2.3 µs a file (`notes-projection-worktrees.md` § Spike 4), so the criterion's allowance is a margin for noise that
  either regression exceeds many times over. A file left open costs one archive partition read a command (§ 4), inside
  the start margin of `spec-projection-worktrees.md` § 15.3 at its reference fixture (Success Criterion 1) and past
  Linux's margin near ten people's archive (§ 11); `arc sync`'s report costs one read of the archive's partitions
  (§ 7.2), and `arc save --resolve` the same read for its lookup (§ 6.1).
- **Testing.** Unit and integration tests over the reference backend with real repositories and worktrees, on Linux and
  in the portability lane; the perturbation tests (§ 9.2); every typed refusal here — `arc edit`'s, a re-lock `arc save`
  leaves undone, the removal check's `persist-would-refuse` over a forced edit or a new archived file, its hold over a
  conflict in an archived file and `--resolve`'s refusal over that file's markers, and the remedy for a mismatched
  archive partition — tested refusing and then succeeding once repaired; and the synthetic-scale benchmark, run in the
  projection's tripwire suite on each named reference (`spec-projection-worktrees.md` § 15.3, § 15.4).
- **Rollout.** Dark until the flip (§ 1.4). The flip's first full materialization lays the archive read-only. The format
  version moves, so a checkout's index from an earlier build is rebuilt at its next start (§ 4).
- **User-facing impact.** From the flip, archived files are read-only, each Markdown file's notice naming `arc edit`
  then `arc save`. A correction runs `arc edit <path>`, edits, and runs `arc save`, whose report names the files it lays
  read-only again; `arc status` lists files left open; and `arc sync` names archived files changed or created without
  `arc edit`. An editor that honors the mode refuses to save an unopened archived file; one that writes through it
  leaves a forced edit, reported as above.

## Success Criteria

1. **Cost follows what is opened, not what is archived.** On each named reference of `spec-projection-worktrees.md`
   § 15.3, over its paired fixtures — 800 projected files and 60,320, with the same hot files, owners, and four archive
   quarters — interleaved no-change `arc save` runs with no archived file opened show a median paired difference, the
   larger fixture's less the smaller's, within 5 ms on Linux and 10 ms on Windows and macOS. Over the 800-file fixture,
   a no-change start with one archived file opened, interleaved with the same start with none, shows a median paired
   increment within the margin § 15.3 there leaves its start budget over its reference's slower calibration median.
   Every raw sample and paired difference is kept (§ 12).
2. **An archived file is corrected in place.** Over the reference backend with real worktrees, an archived work unit's
   owner opens one of its files, its meta among them, with `arc edit`; edits it across two ordinary commands, each
   taking the edit in with the file still writable; and runs `arc save`, which lands it, lays it read-only, and names it
   in its report. A new file in an archived work unit's folder, and an archived Errand's description its owner creates,
   each opened with `arc edit`, adopt at the next command and are re-locked at `arc save`. Anyone opens and corrects an
   archived cohort document, and an archived Errand's owner its description.
3. **Every staging follows the lay mode.** Each staging of § 2.3 — a spawn's materialization, the rebuild with no usable
   index, `arc sync`'s materialization, a refresh, a fan-out's visit, the read-back after a landing, the drawing of a
   clash, the replace guard's restage, and the installation at a reused path — lays an archived file whose edit rights
   allow the edit read-only where its target worktree's entry for it is not opened. Each but the spawn and the rebuild,
   which meet no opened entry, lays the file writable where that entry is opened, while its copy in every other worktree
   stays read-only; inside `arc save`, the landing's stagings in its own worktree lay it read-only, and its fan-out into
   a worktree where the file is opened lays it writable there.
4. **Rights do not move.** `arc edit` refuses another person's archived work, naming its owner, and that file lays
   read-only with its notice naming the owner; `arc edit` refuses a path outside `completed/`, a path in another
   checkout, a path with no file, and any other new path under `completed/`, each naming its remedy, and refuses over an
   archive partition that does not hash to its name, naming a retry that then succeeds.
5. **No archived edit is lost silently.** A forced edit is taken in, and its file laid read-only, when a refresh touches
   it; is named by `arc sync`'s report; and makes the removal check answer `persist-would-refuse` and the persist and
   release steps refuse, naming `arc edit` then `arc save` run in that checkout, the removal run from another checkout
   among them; once those have run there, they succeed. A new archived file made without `arc edit` is named by
   `arc sync`'s report and refuses removal the same way. An opened file's edit persists at removal.
6. **The steps' order holds.** Each perturbation test of § 9.2 asserts its state, then succeeds after its repair.
7. **`arc sync` remedies a mismatched archive partition.** With an unmarked archive partition whose bytes do not hash to
   its name, the removal check answers `unobservable` and the persist and release steps refuse, each naming `arc sync`
   run from that checkout; after it, the check answers `removable` and the steps succeed.
8. **A conflict in an archived file not opened resolves.** `arc save --resolve <conflict>` finds and resolves a
   whole-record conflict shown by its notice line in an archived file not opened in that worktree, and conflict markers
   shown in such a file resolve once `arc edit` opens it and they are edited out; after either, the removal check that
   held the file answers `removable`.
9. **An index from the previous format version is rebuilt** at the next start, and the fan-out and the end skip that
   worktree until then.
10. **ADR-035 carries item 6's amendment** (§ 10.3).
11. **Dark before the flip.** Over the in-repo implementation archived files lay as today, and `arc edit` refuses
    `unsupported`.
12. **The quality gates pass** at every gate the project declares.

## Open Questions

None blocks starting. § 12's expected contracts each state what holds until their change lands, and none leaves this
design open.

## Amendments

None.

---
