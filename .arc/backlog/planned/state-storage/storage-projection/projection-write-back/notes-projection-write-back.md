# Notes: projection-write-back

## Contents

- [Spike evidence](#spike-evidence)
- [Spike 4 — conflict markers in practice](#spike-4--conflict-markers-in-practice)
- [Spike 5 — write-back through the store](#spike-5--write-back-through-the-store)
- [Spike 6 — finding a stored clash again](#spike-6--finding-a-stored-clash-again)
- [Spec review carry-forward](#spec-review-carry-forward)

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

## Spec review carry-forward

The decomposition's specification review (2026-10-30) found these gaps, each inherited from the origin specification,
which settled them in the task list or not at all. Fold each into this member's specification at its next planning
review. Task numbers are `tasks-projection-write-back.md`'s.

- **`arc save --resolve`'s refusals and token rule.** Task 1.10 settles the refusal set — an unknown conflict, one
  already closed, no projected file in this checkout, one shown with markers, one ambiguous across owners — and the rule
  that the conflict is found in the index's mappings, whose references carry the owner's UID, never from the token
  alone, a listing used only to choose the refusal; § 6.5 names only the withheld and held refusals.
- **The marker renderer.** Task 1.5 gives `mergeLineText` (`lib/store/concurrency/line-merge.ts`, documented today as
  merging without inline markers) a marker-rendering option taking as a callback the renderer Task 1.4.a builds; § 7.7
  says only that the markers render as `mergeLineText` builds its result, and § 1.2 does not list
  `lib/store/concurrency/`.
- **Adoption's verdict without minting.** Task 2.8.b moves `runStub`'s parameter checks into a pure function the removal
  check also calls; § 9 does not say so.
- **Failure cases decided only in tasks.** The `after` view's placeholder version for a record absent from `before`
  (Task 1.2.b); an unknown `arc.inflightView` value read as `mine` and named in status (Task 2.6); `arc editor` refusing
  an unparseable file and creating a missing one (Task 2.10); the holding-checkout lookup's rejection on two holders or
  a failed scan (Task 2.2); and an entry conflict whose ID is absent shown as a notice line (Task 1.7.a).
- **The capability recorders' order.** § 10.2 names three recorders and no order; Task 2.4.c's test fixes that the
  engine's start over an off-branch store wins over `createStore`'s composition recording false.
- **The guard before the start's writes.** The start sweeps the aside folder and runs write-back, whose read-back
  replaces files by the swap (§ 7.1), before its refresh (§ 2.2), while `spec-projection-substrate.md` § 11.2 runs the
  guard before the projection writes into a root and names materialization, refresh, and fan-out as its callers. Nothing
  names a guard run before the read-back's write. The lean, recorded with `notes-projection-substrate.md`'s matching
  item: the start runs the guard's skip check before its sweep.
