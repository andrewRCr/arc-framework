# Notes: projection-write-back

## Contents

- [Spike evidence](#spike-evidence)
- [Spike 4 — conflict markers in practice](#spike-4--conflict-markers-in-practice)
- [Spike 5 — write-back through the store](#spike-5--write-back-through-the-store)
- [Spike 6 — finding a stored clash again](#spike-6--finding-a-stored-clash-again)
- [The base of a file other than Markdown](#the-base-of-a-file-other-than-markdown)
- [Grounding against `storage-ref-hardening`](#grounding-against-storage-ref-hardening)
- [A1 — Explicit folder ownership](#a1--explicit-folder-ownership)

## Spike evidence

Each spike's harness and raw logs stay on the machine that ran it, under `~/dev/scratch/arc-storage-spike/projection/`;
this file keeps the results and what they settle. Linux runs are WSL2 on ext4; Windows runs use `node.exe` on NTFS.
The September spikes behind `storage-contract`'s Part B are in its notes, § Evidence behind Part B.

## Spike 4 — conflict markers in practice

Run 2026-10-09 on Linux (`spike3/D/`), with this repository's markdownlint configuration (markdownlint-cli2 0.23.0).

- `git merge-file -p --marker-size=11` writes byte-for-byte what the hand-built length-11 sample holds; the diff3 base
  marker is `|||||||||||`.
- At the default length, a side holding a setext underline yields three identical `=======` lines: no parser can tell
  the separator from content.
- On the length-11 sample, a parser matching any run of seven or more marker characters mis-splits the hunk; one
  matching exactly seven finds no conflict, so the markers would persist as content; one ignoring runs shorter than
  the recorded length parses correctly but mis-splits once content holds a longer run (13 `=`); one matching exactly
  the recorded length parses all of them.
- Every conflicted sample fails lint (MD003, MD022, MD032 at either length), so a conflict stays visible to an
  editor's linter. A naive keep-both that drops the marker lines trips MD022 for the missing blank line between
  entries, and `git merge-file --union` produces the same gap without a lint hit beyond MD003 — the case D13's entry
  parser already tolerates and the merged write repairs.

What it settles: escalate the length past the longest run of marker characters at the start of any line in either
side, record it, and parse markers of exactly that length.

**After VS Code's actions** (`spike3/D-postbutton-check.mjs`, output beside it). The length-11 sample's three
action results — VS Code's own split, as the checklist observed it — ran through an exact-length parser that reads an
incomplete marker set as malformed:

| Result                        | Without a resolve-by-hand line   | With the line after the start marker |
| ----------------------------- | -------------------------------- | ------------------------------------ |
| Untouched                     | Open conflict                    | Open conflict                        |
| Accept Current                | Persists, missing part of a side | Malformed: the line remains          |
| Accept Incoming               | Malformed: orphan separator      | Malformed: orphan separator          |
| Accept Both                   | Malformed: orphan separator      | Malformed: both remain               |
| Hand resolution, line removed | Persists                         | Persists                             |
| Hand resolution, line left    | —                                | Malformed: the line remains          |

The output the checklist recorded for Accept Incoming also reads as malformed.

## Spike 5 — write-back through the store

Run 2026-10-13 on Linux over the in-memory reference backend (`__tests__/helpers/store/`), whose stale-base merge
calls the shipped concurrency library (`mergeLineText`, `mergeEntryText`); the harness (`spike5/`) runs only as unit
test files beside that backend. Each case writes under `write-back` provenance with another machine's `save` landing
first.

- **A stale stored base sent as the expected version** (a draft, both sides editing one line). The write lands with
  the store's current side at the clash, the result lists one conflict record, and `read` reports it. The record keeps
  the base's line range (3–5), the base text, and each side's text, labelled with the machine that wrote it — the
  current side with the other machine, the incoming side with this one — so the checkout needs no side labels of its
  own. The conflict record's own provenance reads `merge`, not `write-back`.
- **The same stale write sent again,** as a retry after an ambiguous failure would send it, files a second conflict
  record for the same clash: two open.
- **Resolving:** a `write-back` naming both conflicts in `resolves` closes them.
- **Base content:** `history` returns every version's content, the stale base's among them.
- **A stale buffer after a clean merge.** One machine's addition merged cleanly with another's, then the buffer that
  never reloaded removed its own addition. Sent against the stamp's version, the removal is undone; sent against the
  merged version, the other machine's addition is lost. Merging in the checkout from the content the earlier
  write-back took in, onto the merged version, keeps both and drops the removed line, after which the write is a
  fast-forward.
- **An entry typed by hand** (no `_Id:_`) into the inbox, against a stale base: the backend stamps it and merges.
  Merging the same inputs in the checkout throws ("Entries need distinct managed IDs before merge"). A duplicated ID
  throws on both paths, the backend's included, rather than refusing.
- **An old buffer re-saving that entry after the backend stamped it.** On a fast-forward the entry keeps one copy
  under a new ID. With another machine's edit to the stamped entry in between, the merge keeps both copies and reports
  no conflict. Given the stamped ID before it is sent, the same save yields one entry and one conflict.
- **The meta, stale:** refused `version-conflict`. A meta write at the current version with no placement lands on
  the reference backend, although `MutationSchema` requires placement on a primary record.

What it settles: the store's merge does the work write-back's own merge was drafted to do whenever the base is a
stored version, labels included; a stale buffer's base after a clean merge is never a stored version, so that case
needs a merge in the checkout first; a retry must re-read before resending; and write-back must give an unstamped
entry the ID its base carries, whichever side merges.

## Spike 6 — finding a stored clash again

Run 2026-10-13 on Linux (`spike6/`): 4,000 random three-way merges of 60-line Markdown with deliberately repetitive
lines (blank lines, checkbox items, a small prose vocabulary), 3,893 hunk conflicts, each then edited 0, 1, 5, or 20
times at random, with its true place tracked. Rates are of conflicts the later edits left untouched.

| Method                                                 | Write time | 1 edit | 5 edits | 20 edits | When it fails |
| ------------------------------------------------------ | ---------- | ------ | ------- | -------- | ------------- |
| Search for the current side's text                     | 47%        | 47%    | 46%     | 42%      | Loudly        |
| Two lines of context either side, taken at write time  | 99.4%      | 94%    | 74%     | 34%      | Mostly loudly |
| The base range moved through a diff from the full base | 99.9%      | 99%    | 93%     | 79%      | Silently      |
| The sent file aligned with the merged result           | 84%        | —      | —       | —        | Loudly        |

The current-side search fails on an empty side (18%) and on repeated lines (34%). Context that no longer matches is
reported as not found, wrong only up to 1.4% at one line of context; the base range, moved through a diff, lands on the
wrong lines in up to 21% of cases with no sign.

A fifth method refreshes the marked file rather than finding the clash: a three-way merge whose base is the stored
content the file was rendered from, whose current side is the later stored content, and whose incoming side is the
rendered file, marker block included. It placed every block at write time; after 1, 5, and 20 later edits it placed
96.8%, 83.9%, and 56.3% exactly, reported an overlap in 3.2%, 15.9%, and 42.9%, and differed from the tracked placement
without a sign in 0.1%, 0.3%, and 0.8%.

Placement with a check, rerun the same day over the same generator and seed (`spike6/e1-placement-check.mts`, from the
fix check's probe): the base range's start line moved through the diff (`relocateTextOffsets`), spanning as many lines
as the record's current side holds, accepted only where those lines equal the current side. These figures use each
side's true line count, which the record does not carry today: `mergeLineText` joins a side's lines, so 1,014 of the
3,893 sides stored as empty content, 708 of no lines and 306 of one blank line. The incoming side stores the same way:
993 of its 3,893 sides stored as empty content, 709 of no lines and 284 of one blank line
(`spike6/e1-incoming-sides.mts`, from the third fix check's probe). That check alone placed 99.9%, 98.7%, 93.1%, and
79.4% and let 0.03%, 0.05%, 0.7%, and 3.5% through on wrong lines, over half of them with an empty current side, where
it compares nothing. Requiring also that the line beside each end equal the line beside the base range in the base
content, or the file's edge, placed 99.9%, 96.8%, 83.9%, and 56.8%, reported the rest as not found, and let 0, 0.03%, 0,
and 0.35% through. Moving the range's end through the same diff instead of spanning the current side refuses a quarter
of clashes at write time, nearly all of them, 95% in a recount, where the current side is longer than the base range and
the moved end lands short. Read from the record as it is, an empty side taken as no lines placed 92% at write time with
0.44% wrong; taken as one blank line, 82% with 1.7% wrong; tried both ways and placed only where exactly one passes,
97.7% with none wrong at write time and 94.7%, 81.9%, and 55.3% later, with up to 1.09% wrong. Of the clashes a later
edit touched (65, 297, and 1,049), the check with the true count still accepted a wrong place for 1, 5, and 10
(`spike6/e1-placement-ambiguity.mts` and `e1-placement-touched.mts`, from the second fix check's probes).

What it settles: a clash can be placed exactly when the merge happens, given the full base, but no method finds it
reliably in arbitrary later content. Refreshing a marked file by merging the store's change into it keeps its markers in
place with a line merge's own residual, and reports the rest as an overlap rather than misplacing it. Placing a stored
clash's base range with a check on the current side, its line count known, and the lines beside it keeps the silent
residual within a line merge's at every age, for clashes later edits left untouched.

## The base of a file other than Markdown

Run 2026-11-03 on Linux (`spike8/`, `model.py`, with `trace.py` to replay a trace). A file other than Markdown carries
no stamp, and its index entry's fields — its base, the version a replacement in progress replaces, its last persisted
write-back — are each written on their own schedule (`spec-projection-substrate.md` § 3.3, § 3.6, § 3.7), so where more
than one could be the base of a save, nothing in the file says which. Spike 8 model-checks the choice: Spike 7's model
extended to a file other than Markdown, those fields on the shipped schedule, an editor that may reload, another writer
who changes a region and adds one, and an oracle merging from the base the saving buffer actually started from, which
loses nothing.

### Every rule that picks one base loses an ordinary edit

| Rule                                                  | Loss, stops and windows | Loss, reloads | Loss, no save or stop inside a command | Held, no save or stop inside a command |
| ----------------------------------------------------- | ----------------------- | ------------- | -------------------------------------- | -------------------------------------- |
| The shipped helpers as they stand                     | 3,594                   | 70,835        | 2,285                                  | 0                                      |
| The closer base, version-exact where the index can be | 0                       | 38,619        | 2,285                                  | 0                                      |
| Agreement (spec § 7.1)                                | 0                       | 0             | 0                                      | 5,952                                  |

Counts are model states, not frequencies (`spike8/out/final6-table.txt`); the first column's bound has two commands, two
saves, and a stop, the others' three commands, two saves, and a reload. A hold counts as keeping what it holds, as it
does in the design: a held file stays pending until a later save makes its candidates agree or the person resolves it
(below).

The ordinary case every single-base rule loses: a write-back lands, the store merging another writer's change into it,
so the index keeps the content taken in as a copy (`recordWriteBack`, `lib/store/projection/taken-in.ts`); the read-back
lays the merged version; the person reloads and deletes what the merge brought in. The file now equals the kept copy
exactly, the closer-of rule takes it as the base (`closerOfCopyAndLanded`, which applies "regardless of later read-backs
or refreshes"), and the deletion is undone. A removal of what one candidate lacks makes the file look like that
candidate, so no measure of closeness can tell it from a stale buffer's save.

### What the index holds, by state

| Index state                                         | Candidates                                                                                                 | Agreement                               |
| --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| No persisted write-back, no replacement in progress | the entry's base                                                                                           | sent against it                         |
| A replacement in progress                           | the entry's base; the version it replaces                                                                  | sent where both merges agree, else held |
| A persisted write-back that landed as it was sent   | as above, and the version it landed                                                                        | as above                                |
| A persisted write-back the store merged             | as above, and the copy it kept                                                                             | as above                                |
| An aside copy                                       | the base its name carries, resolved as a stamp is; the persisted write-back's landed version and kept copy | as above                                |

Merges agree where they give the same content and file the same clashes, one that finds no edit leaving the store's
content as it is; two clashes are the same where they fall at the same place with the same two sides, as the model
compares a region's two sides, whatever base each merged from, and a merge from a kept copy that files any clash differs
from every other, as the model's does (`simulate`; spec § 7.1). Before any of this, the read step's unedited tests stand
(`readStamplessFile`): young and empty it waits; equal to what was written, or to the version a replacement in progress
replaces, it is unedited — except that, where the last persisted write-back recorded the base the entry still holds (a
landing its read-back has not yet laid), content equal to what was written is the person's revert, and while that
read-back replaces the recorded base, content equal to the replaced version is. The model compared that record by blob,
as the index holds it, and by record version: the results were identical in every bound (`spike8/out/final2.txt`), so
the blob stays and the index schema does not change.

### Where agreement holds

Every hold with no save or stop inside a command is one shape (`spike8/out/char3-agreeb-3x2-s0.txt`): at the path, after
a persisted write-back, no replacement in progress, the entry's base (laid since) and what was taken in give different
merges, at one region in 4,832 of the 5,952 states and two in the rest. They fire on a stale buffer's save — even an
unchanged one, which would otherwise revert another writer's change — and on a reloaded buffer's save that touches a
region another writer changed since the content taken in. Every region they mark is one where the file and the store's
current version differ, and the drawing marks every such difference as an ordinary clash between them (spec § 7.7), so a
hold whose merges give the same text but file different clashes is drawn too. The model merges by region; the line merge
takes an identical change cleanly only where a whole region matches (`mergeLineText`), so in use an edit beside another
writer's change can disagree where the model agreed: more holds, never fewer.

### How a hold ends

The first hold write-back's own walk finds — at a command's start, or in a persist or release step — draws the clash
into the file once, as markers around every line where the file and the store's current version differ, the store's
lines on one side and the file's on the other, and records the hold as the entry's refused mark, typed `bases-disagree`,
its remedy naming `arc save --resolve <token>` (spec § 7.7). A hold found through the take-in port, at the replace
guard's re-check of a path or in an aside copy, draws nothing and mints no mark, since the guard and the copy's
settlement keep any mark the answer carries: a file at its path waits, pending, until write-back's own walk next takes
it in, which draws it unless its mark already stands, and a copy goes back to its path, where the path's own candidates
decide, or is kept. The mark is set on the entry the guard hands the drawing's swap, and only where the guard still
stages the drawing, so a save the drawing's own re-check holds or sends leaves none. Nothing retires the persisted
write-back but the next landing, as shipped, because no state of the index or the file proves a reload: Zed reloads no
file changed on disk and saves over it without asking (`spec-projection-substrate.md` § 3.6), so its next save removes
the markers unseen, and a person who resolves every region in their own favour leaves the same bytes. A later save whose
candidates agree is sent — the person kept the store's side, or edited elsewhere. One whose candidates still disagree is
not drawn again: the file stays as the person left it, pending and reported with the token, and
`arc save --resolve <token>` sends its text as the resolution against the store's current version (spec § 6.5). A
reloading editor shows the markers; Zed never does, and its saves are held and reported until the person reopens the
file or runs the command. A save that displaces the drawing while its own swap lays it, or a swap that cannot move the
file aside or link the drawing in, leaves the same state: the swap batch records an entry carrying the mark, the one it
planned or the guard's `replace` entry it restores, over a file that never showed the markers (spec § 17 item 13).
Nothing is sent on a reading the person has not confirmed.

### Residuals the model separates

- A buffer that never reloaded saving over a version a refresh laid, with no persisted write-back to record its base:
  sent against the refreshed version (`spec-projection-substrate.md` § 3.7; spec § 17 item 12).
- An exact revert read as unedited, at the path's check, an aside copy's check, or the check that a copy's path has
  moved on (`spec-projection-substrate.md` § 17 item 2).
- The sweep linking back the oldest of a path's copies where the path is absent (`sweepAsideFolder`, record order).
- A replacement stopped before its link leaves the path holding the version it replaced; the next replacement's `plan`
  records the entry's base, never laid there, as the version it replaces (`swap.ts`), so a save of the file as the path
  holds it has no candidate that is its base. Carrying the older record forward where the moving file still equals it
  was modelled and rejected (`spike8/out/final4-carry.txt`): a person who reloads and removes what a refresh brought in
  leaves the file equal to the replaced version exactly, and the carried record then displaces the true base in an
  ordinary flow, not only after a stop.
- A save whose base the shipped schedule discarded: a buffer that reloads mid-swap and saves in place keeps the linked
  inode, so `finalizeAsideCopy`, which clears the replacement record on inode identity
  (`lib/store/projection/stampless.ts`), drops the replaced version that was its base. A consequence of that schedule,
  not a limit on a rule over these fields.

A residual class marks a whole state once it arises, so a design loss later in the same state would count as the
residual's. To rule that out, the agreement rule was run again with every save over a version the buffer never loaded
forbidden — at the path, into an aside copy, and recreating a path a swap had moved — leaving the save over the version
its own landing laid (`spike8/out/final7-fresh-nocarry.txt`): no design loss; the stale class empty; what stayed
unknowable was the overwritten record and the discarded base above.

Not covered: a second buffer writing the same path; another writer editing a region the person edits (the model's other
writer overwrites the store's region rather than merging, so its loss measure cannot apply there); the rebuild of an
absent path and the window between a landing and its index write, which the model takes in one step; and an aside copy
put back at its path after a hold, a clash, or a refusal, which the model treats as final: `putBack` keeps the path's
base and drops the one the copy's name carried (`lib/store/projection/aside-copies.ts`), so the path's next take-in of
the copy's save has no candidate that is its base (spec § 17 item 12).

## Grounding against `storage-ref-hardening`

Task generation (2026-11-03) grounded the arms that observe `storage-ref-hardening` against its branch,
`fix/storage-ref-hardening`: its code at `78f15a6357`, then its planning head `deb116df5d`, whose amendment A4 adds a
review machine record with no projection and keeps every refusal code and class. What the plan takes from it:

- **Which refusals name a history ref.** A missing object refuses `state-unresolvable`, naming a history ref only where
  the clone holds no live ref for the item (`missingHistoryRefs`, `lib/store/ref/missing-history.ts`): a write to a
  completed item names one, a live item's object missing under a ref the clone holds names none, and `prepareAnchor`
  names none. So spec § 7.8's ref-naming arm is § 8.4's, and its arm naming none is Task 1.6's.
- **`namespace-corrupt`.** Unparseable stored data or a misplaced folder refuses terminal `namespace-corrupt`, repaired
  by hand; a listing reports a misplaced folder as a `malformed` diagnostic under the rule `placement`, adding no
  diagnostic kind.
- **The history retry.** `pullHistoryForRetry` consumes the pull's result (`consumePull`) and answers false where the
  pull is refused, a state or candidate outcome fails, or a store designation is left unanswered; a failed read source
  does not stop it. `retryEndedItemHistory` keeps its shape and retries only `state-unresolvable` naming a ref.
- **`StoreFileAccess.lstat`** requires `mtimeMs`, which any test double of the file access must supply.

Once `storage-ref-hardening` lands, a diff of those surfaces from `deb116df5d` to its merge confirms them before Tasks
1.6 and 2.3 are built.

## A1 — Explicit folder ownership

`WorkUnitPlacementSchema` permits zero to two cohort segments below a backlog commitment. `projectContainer` appends
those segments and the work-item slug, while a companion's path key may itself contain folders. A read-only probe using
`resolveArcPath` produced the same physical path for both valid containers:

| Work item | Cohort  | Relative companion key | Projected path                             |
| --------- | ------- | ---------------------- | ------------------------------------------ |
| `alpha`   | none    | `beta/note.txt`        | `.arc/backlog/planned/alpha/beta/note.txt` |
| `beta`    | `alpha` | `note.txt`             | `.arc/backlog/planned/alpha/beta/note.txt` |

Projecting both candidates back therefore proves their spelling, not which record owns an unknown file. The pure
`identifyArcFileAddress` has no store or filesystem evidence; `LookupInputSchema` supplies semantic lookups rather than
folder resolution. A1 supplies the missing boundary explicitly: composition establishes one physical container and
retains its record authority, and layout classifies only relative to that container. `readProjectionIndex` already
retains the exact reference of an indexed path, which bypasses this new-file inference.

Missing or competing evidence stays a recoverable, visible refusal; no prefix heuristic acquires ownership. A parsed
prospective stub's meta is evidence for its proposed container, not permission to bypass the existing stub checks or
minting. The correction belongs to the file inverse and its adoption/overlap composition, with a bounded test covering
both interpretations and successful adoption of the same bytes after ownership repair.
