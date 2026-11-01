# Notes: projection-substrate

## Contents

- [Spike evidence](#spike-evidence)
- [Spike 1 — the refresh's replace guard](#spike-1--the-refreshs-replace-guard)
- [Spike 1b — moving the file aside](#spike-1b--moving-the-file-aside)
- [Spike 3 — how editors and agent tools write](#spike-3--how-editors-and-agent-tools-write)
- [Spike 7 — aside copies against a stale buffer's record](#spike-7--aside-copies-against-a-stale-buffers-record)
- [Spec review carry-forward](#spec-review-carry-forward)

## Spike evidence

Each spike's harness and raw logs stay on the machine that ran it, under `~/dev/scratch/arc-storage-spike/projection/`;
this file keeps the results and what they settle. Linux runs are WSL2 on ext4; Windows runs use `node.exe` on NTFS.
The September spikes behind `storage-contract`'s Part B are in its notes, § Evidence behind Part B.

## Spike 1 — the refresh's replace guard

Run 2026-10-09 on both platforms (`spike1/`; Linux Node 26.3 and Git 2.55, Windows `node.exe` 22.17 and Git for
Windows 2.49). Most Windows runs ran under 29–66% host CPU from other suites sharing the machine; each run's load is in
its `results/*.gate.txt`.

**Exclusive open.** `fs.constants.UV_FS_O_EXLOCK` is absent, but the raw `0x10000000` flag passes through on Windows,
from `openSync` and `fs.promises.open` alike: while one process holds the file, another gets `EBUSY` on every open and
on unlink, and `EPERM` on a rename over it. Linux ignores the flag.

**The same-size save at the re-check** (`sametick.mjs`). The projection writes F through a staged file, records the
entry from the staged file's stat, renames it onto F, and writes the index; a second process toggles one checkbox (a
same-size write, whole-file or one byte in place) at a set delay after F appears, and the refresh re-checks and
renames. Edits finished before the refresh began, 4,000 per variant and delay, summed over 4 KB and 76 KB files and
both write methods:

| Variant                                   | Linux lost at 0 / 0.2 / 1 / 5 ms | Windows lost at 0 / 0.2 / 1 / 5 ms   | False defers per 2,000        |
| ----------------------------------------- | -------------------------------- | ------------------------------------ | ----------------------------- |
| A: stat re-check                          | 3,935 / 3,888 / 3,585 / 1,972    | 363 / 160 / 0 / 0                    | 0                             |
| B: racy entries hashed                    | 8 / 0 / 0 / 0                    | 40 / 1 / 0 / 0                       | 0                             |
| B': racy entries deferred                 | 4 / 0 / 0 / 0                    | 35 / 0 / 0 / 0                       | Linux ~1,980, Windows 193–389 |
| H: always hash                            | 0 / 0 / 0 / 0                    | 0 / 0 / 0 / 0                        | 0                             |
| B, index written before the rename onto F | 0 / 0 / 0 / 0                    | 0 / 0 / 0, 5 ms not run (2,000 each) | 0                             |

- A loses every same-size save inside F's modification-time tick; holding the file exclusively during the check
  changes nothing (Windows, 372 and 162 lost).
- Every loss under B and B' had the save in F's tick and the index file in a later tick, so the entry never looked
  racy. Writing the index before renaming the staged file onto F removes that order: a save can only follow the
  rename, so a save in F's tick puts the index in that tick too, and the entry is racy and hashed. If the process stops
  between the index write and the rename, F still holds its old bytes and old stamp, which equal their own base, so
  write-back finds no edit and the next refresh replaces them.
- B' defers almost every refresh on Linux, where 10 ms ticks leave nearly every fresh entry racy.
- Re-check to finished rename takes 22–114 µs on Linux and 0.48–0.83 ms on Windows for A and B; always hashing raises
  Windows to 0.91–1.41 ms.

**A save during the re-check-to-rename interval** (the same harness, the refresh starting while the editor fires): no
variant closes it. A save that opens, writes, and closes inside the interval is replaced on both platforms. At the
delays that land in it, A and B lost 67–1,146 of 4,000 per delay on Linux (0.05–0.2 ms) and 117–237 of 1,500 on Windows
(1.5–2.5 ms); always hashing, whose slower re-check widens the interval, lost up to 985 and 409. Holding the file
exclusively turned 173–239 of 1,500 saves per delay into editor `EBUSY` failures and still lost 6–354. On Linux,
September's descriptor held across the rename rescues an in-place save, never a replace-style one, which swaps in a new
file the descriptor does not see; Windows refuses a rename while anyone holds the file, so it has no rescue. Every save
timed into the interval here was in place (`trunc`, `pwrite`); replace-style saves there are untested on both
platforms.

**Burst** (September's `entryburst.mjs` with 35% checkbox toggles, September's rescue off). On Linux, 20 worktrees ×
16 edits: A lost 9 of 9,600 operations over two runs — 4 toggles and 5 size-changing captures and notes, which have no
established mechanism — and B none of 9,600, its hash catching 58 racy saves. On Windows, 10 worktrees: neither lost
anything in 1,440 operations each, a shadow hash found no save the stat missed in 4,048 checks, and one B refresh gave
up on a held file after its retry, keeping the edit.

**Rebuilding an absent file during a Vim-style save** (`rebuild.mjs`, 1,000 loops per cell, the rebuild firing inside
the editor's empty window or at its create):

| Commit                          | Linux: inside the window / at the create | Windows: inside the window / at the create |
| ------------------------------- | ---------------------------------------- | ------------------------------------------ |
| Rename                          | 13 / 68 saves lost                       | 6 / 407 saves lost                         |
| Rename after a second check     | 3 / 11 lost                              | 11 / 315 lost                              |
| Hard link from the staged file  | 0 / 0                                    | 0 / 0                                      |
| `copyFile` with `COPYFILE_EXCL` | 1 lost, 3 mixed / 10 mixed               | 37 / 401 editor saves failed               |

Hard links work on NTFS: `EEXIST` on an existing path, and both names readable.

**Read-only files.** On Windows a rename over a 0444 file fails with `EPERM` — the code the rename retry reads as a
held file — and keeps the old bytes; clearing the mode first lets it through. Node's unlink removes a read-only file on
both platforms (`cmd`'s `del` and `Remove-Item` without `-Force` refuse). `git worktree remove`, with or without
`--force`, and `git clean -fdX` delete read-only ignored files with exit 0 on both platforms.

What it settles:

- **The refresh re-check is B, with the index written before the replacement:** a stat comparison, the content hashed
  only for a racy entry, and no time-based deferral — deferral costs nearly every refresh on Linux. The replacement is
  § Spike 1b's swap, never a rename onto F.
- **The exclusive open is reachable and rejected.** It makes an editor's save fail and closes nothing a hash does not.
- **A rebuild commits with a hard link from the staged file.**
- **A protected file's refresh needs no mode change:** § Spike 1b's swap moves a read-only F aside and links the staged
  file in with its read-only mode, where a rename onto a 0444 F fails with `EPERM` on Windows and would spin through the
  retry to its timeout.

## Spike 1b — moving the file aside

Run 2026-10-09 on both platforms (`spike1b/`), against the residual spike 1 left: a save between the refresh's
re-check and its rename is replaced. The candidate swap renames F aside, hard-links the staged file onto F — failing,
and yielding, if a save recreated F in between — and then compares the aside copy with the index entry, settling and
writing back a save it holds. F is absent between the two steps. Two checks ran first, each able to stop the spike.

**Check A: can a held file be moved aside?** (`aside.mjs`)

| Holder of F                                      | Linux                        | Windows                                               |
| ------------------------------------------------ | ---------------------------- | ----------------------------------------------------- |
| None                                             | moves                        | moves                                                 |
| Node `openSync` (shares read, write, and delete) | moves; its writes land aside | moves; its writes land aside                          |
| .NET sharing read, write, and delete             | —                            | moves; its writes land aside                          |
| .NET sharing read and write only                 | —                            | `EBUSY` (a rename over F: `EPERM`); F keeps its bytes |
| Exclusive (`0x10000000`)                         | moves (flag ignored)         | `EBUSY` (a rename over F: `EPERM`); F keeps its bytes |
| A writer paused mid-save, then finishing         | the whole save lands aside   | the whole save lands aside                            |

A read-only F moves aside on both platforms, and the aside copy unlinks; a read-only staged file links in and unlinks,
leaving F read-only. A refusal is the bounded retry's case, as for a rename over a held file today. Every case gave the
same result with the aside copy moved into a hidden folder beside the files rather than beside F (`aside-dir.mjs`).

| Per replaced file, 2,000 swaps (median / p99) | Linux: F absent | Linux: whole swap | Windows: F absent | Windows: whole swap |
| --------------------------------------------- | --------------- | ----------------- | ----------------- | ------------------- |
| 4 KB                                          | 10 / 27 µs      | 62 / 330 µs       | 0.84 / 2.46 ms    | 1.50 / 3.32 ms      |
| 76 KB                                         | 10 / 23 µs      | 85 / 301 µs       | 0.85 / 1.22 ms    | 1.55 / 2.29 ms      |

Today's stat and rename over F took 20–61 µs on Linux and 0.48 ms on Windows. One Windows swap left F absent for
0.64 s during a host stall that held a rename over F for 1.9 s in the same run: a stall extends the absence.

**Check B: what do readers see?** (`absent.mjs`, two processes reading F in a tight loop for 5 s while it is swapped
every millisecond or so, on a quiet host)

- **Linux:** the swap's readers got `ENOENT` on 7,968 of 2,416,892 reads (0.33%) and 13,860 of 19,626,545 stats; a
  rename over F gave none.
- **Windows:** the swap's readers got `ENOENT` on most accesses (154,033 of 165,444 reads), counts inflated because a
  failed open returns far faster than a read. A rename over F gave readers no error, but the readers starved it: 23 of
  24 refreshes gave up after 200 retries.
- **Watch events:** on Windows, a rename over F already reports F removed and re-added, as the swap does; on Linux it
  reports one rename onto F, where the swap reports F moved away and then created.
- **VS Code and Zed** (`CHECKLIST-gui.md`, WSL remote): VS Code reloaded the file the same way under both methods, and
  never marked the tab deleted, even at twenty swaps a second; Zed never reloaded under either. Both run auto-save on
  focus change here, so the unsaved-buffer steps saved before each run started — the same under both methods. An
  edit is therefore on disk the moment focus leaves the editor for a terminal or an agent.

Neither check stopped the spike.

**The loss measurement** (`sametick1b.mjs`, spike 1's harness in its concurrent mode with the index written first, a
save fired at a set delay after F appears so it lands around the refresh; 4 KB and 76 KB summed). Three refreshes:
B, spike 1's choice, renaming over F; B with September's descriptor held across the rename (Linux only); and the swap.
Three save styles: an in-place whole-file save (VS Code, Zed), an in-place one-byte patch through an open-without-create
(no editor tested saves this way), and a replace-style save, a temporary file renamed over F (Vim, Emacs, Claude Code).

| Saves lost, per delay   | Linux B (of 2,000) | Linux B + descriptor | Linux swap | Windows B (of 1,000) | Windows swap |
| ----------------------- | ------------------ | -------------------- | ---------- | -------------------- | ------------ |
| In-place whole file     | 16–537             | 0–1                  | 0–1        | 0–260                | 0            |
| In-place one-byte patch | 46–1,012           | 0–17                 | 0–4        | 0–503                | 0–1          |
| Replace-style           | 3–1,255            | 3–1,498              | 0          | 10–363               | 0            |

Linux delays were 0–0.2 ms and Windows 0–2.5 ms, spanning each platform's re-check-to-replace interval. Control loops,
with no save, all refreshed normally. The swap's saves were kept three ways: rescued whole from the aside copy (up to
1,429 of 2,000 in a cell), kept because the save recreated F and the link yielded (up to 472 of 1,000), or refused at
the re-check. A one-byte patch opening F in the swap's gap failed with `ENOENT` (up to 187 of 2,000 on Linux and 367 of
1,000 on Windows): the editor sees its save fail, so nothing is lost silently.

- **The descriptor rescues in-place saves only.** It lost as many replace-style saves as B did, or more: the replaced
  file it holds is never the one the editor swapped in.
- **The swap's two Windows losses were the harness's**, the editor having missed its trigger and saved before the
  refresh began.
- **Its Linux losses had one cause:** a save that opened F a few microseconds before the move aside and wrote after the
  aside copy was checked and removed. Keeping the aside copy until the command ends and checking it again closed it —
  at the delays that lost, 7 of 40,000 saves lost without the second check and none with it, the second check
  rescuing 14 whole and flagging no control loop.

## Spike 3 — how editors and agent tools write

Run 2026-10-09 on Linux (`spike3/`). Each editor ran interactively in a private tmux server with an inotify log per
case; there is no personal editor configuration on the machine, so "default" means each editor's built-in defaults.

| Writer                     | Save                                                                        | Side files                                                                     | CRLF file                                           | Mode 0444                                                  |
| -------------------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | --------------------------------------------------- | ---------------------------------------------------------- |
| Vim 9 (`defaults.vim`)     | Renames the original to `name~`, creates a new file: new inode each save    | `.name.swp`, a `.swx` probe, a `4913` probe per write, short-lived `name~`     | Kept                                                | `E45`; `:w!` writes, new inode, mode restored to 0444      |
| Vim `-u NONE`              | In place                                                                    | `.name.swp`, `.swx`, short-lived `name~`                                       | Kept only as literal `^M`; a replaced line loses it | `:w!` fails (`E212`)                                       |
| Neovim 0.12                | As Vim's default: new inode                                                 | `4913`, short-lived `name~`; the swap file lives under `$XDG_STATE_HOME`       | Kept                                                | As Vim's default                                           |
| Emacs 31.1                 | First save renames the original to `name~`: new inode; later saves in place | `.#name` lock symlink while modified; `#name#` auto-save; `name~` stays        | Kept                                                | Typing refused; a forced save writes, new inode, mode 0444 |
| Claude Code Edit and Write | Temp `name.tmp.<pid>.<hex>` renamed over: new inode                         | None                                                                           | Edit kept it; Write saved the LF text given         | Both write, mode carried to the new file                   |
| codex 0.162 (`exec`)       | Appended with `>>`: same inode                                              | Its sandbox made and removed empty `.git`, `.agents`, `.codex`, `.aws` folders | Appended an LF line: mixed endings                  | Not tried                                                  |

When the file changed underneath an open buffer: Vim warns (`W11`, or `W12` with unsaved edits) and asks again at
`:w`; Neovim's `autoread` reloads an unmodified buffer silently and warns as Vim does otherwise; Emacs asks at the first
keystroke and again at save; Claude Code's Edit and Write refuse ("File has been modified since read") and allow a
timestamp-only change. One `claude -p` run resolving a conflicted inbox file kept both entries with a blank line
between them, left no markers, and passed lint.

VS Code (Remote-WSL) and Zed (WSL remote, the Windows app) ran a manual checklist the same day (`spike3/E/`, with the
inotify log in `E/watch.log`):

- **Save:** both save in place, truncating to 0 bytes and then writing, same inode, no side files. The file stayed
  empty for up to 19 ms in one VS Code save and about 1 ms in others; under 1 ms in Zed.
- **Mode 0444:** neither shows an indicator by default, and both allow typing. VS Code's save fails with "File is
  read-only. Select 'Overwrite' to attempt to make it writeable." and offers Overwrite, Save As, and Revert;
  Overwrite sets the mode to 0644 and saves in place, leaving 0644. Zed's save fails with "os error 5, access is
  denied", and the mode stays 0444. Under `files.readonlyFromPermissions`, VS Code shows the read-only indicator and
  blocks typing with "Editor is read-only because of file permissions. Click here to set writeable anyway."
- **Length-7 conflict:** VS Code shows its Accept and Compare actions; after Accept Both and a save, a blank line
  separated the two entries and lint passed (a save-time fixer was not ruled out). Zed shows no conflict UI outside
  a Git merge.
- **Length-11 conflict whose sides hold `=======`:** VS Code shows the actions, but "Current" covers only the line
  above the inner `=======`. Accept Incoming kept that underline, the real 11-character separator, and parts of both
  sides.
- **New file:** VS Code writes LF; Zed, running on Windows, writes CRLF.

What it settles:

- **Replacement is the normal save, and inode numbers recur.** Every editor default and both Claude Code tools write a
  new file; ext4 hands a freed inode number to the next file in the folder (Neovim's external-rewrite case reused
  one). Change detection compares type, size, and modification time in nanoseconds, and reads file identity one way
  only: a changed identity sends the file to the hash, while an unchanged one never proves the file unchanged, since
  freed numbers recur.
- **A save leaves the path empty for a moment.** Vim, Neovim, and Emacs rename the original away before creating the
  new file: 14 ms between the rename and the create in Vim's log. A refresh that rebuilds an absent file in that gap
  and lands after the editor's create would replace the save, so a rebuild creates exclusively and yields when the path
  has reappeared. Since `arc sync` rebuilds deleted files (D13), an absent file never deletes a record.
- **The read-only mode is advisory.** Vim's and Neovim's `:w!`, Emacs's forced save, and both Claude Code tools write
  through 0444 and leave the mode at 0444, so the mode looks untouched afterward. The persist refusal, keyed on the
  stat and content change, is the protection; the mode only makes an editor ask first.
- **Editors warn before saving over a refresh, and the stamp covers the rest.** A buffer holding unsaved edits across
  a refresh still carries the old base stamp, so if the person saves anyway, write-back merges against that base
  rather than reverting the refresh.
- **Side files the scan ignores:** `*~`, `.#*`, `#*#`, `.*.sw?`, `4913`, and `*.tmp.<pid>.<hex>`; VS Code and Zed
  add none. `.#name.md` is a dangling symlink whose name ends in `.md`, so a `*.md` scan that admits dotfiles finds
  it; Emacs leaves `name~` and `#name#` behind for good.
- **An in-place save passes through an empty file.** VS Code and Zed truncate before they write, so a read in that
  window — up to 19 ms observed — sees an empty file that is not what the person saved.
- **VS Code's Overwrite turns the mode back to 0644,** so a protected file can stay writable after one forced save;
  Zed honors the mode. The mode needs restoring at the next refresh.
- **VS Code's conflict actions read markers by a seven-character prefix.** Escalated markers around a side that holds
  `=======` are split at that line. Accept Incoming then leaves the real separator, which a parser matching the
  recorded length reads as malformed; Accept Current would keep only the lines above the inner `=======`, which no
  marker check can see. The trigger is a setext underline, which markdownlint's MD003 already flags in an ATX
  document.
- **Line endings arrive mixed.** An append can put an LF line into a CRLF file, and a whole-file write drops CRLF;
  D13's normalize-on-read absorbs both.
- **Projected files sit outside the gate's lint runs.** The `lint:md` gate enumerates through Git
  (`MARKDOWN_SELECTION` and the index-plus-untracked-non-ignored source in `lib/markdown/selection.ts`), so gitignored
  projected files fall outside it. That clause of the register row is `projected-markdown-checks`' (Owner, 2026-10-16):
  its `selection` checks read this work unit's selection (§ 11.7), and its `lint:md:fix` fixes Git's Markdown list plus
  the selection. A bare `markdownlint-cli2` run, as an editor's lint makes, globs `**/*.md` and does see them, whatever
  `gitignore` is set to for the shared roots: globby reads only `.gitignore` files, and those roots are excluded through
  `.git/info/exclude` (§ 11.1). The root `.markdownlint-cli2.jsonc`'s `gitignore: false` matters only for
  `.arc/user/*/`, which `.gitignore` excludes; `.arc/completed/**` is already in its `ignores`.

## Spike 7 — aside copies against a stale buffer's record

Run 2026-10-15 on Linux (`spike7/`): a breadth-first model in Python, not the CLI, of one projected entry list of four
entries, one editor buffer, the store with its history, the index's record of the path's last persisted write-back
(§ 3.6), and the aside copies refreshes make (§ 5.2). The buffer either never reloads, as Zed, saving under the stamp it
loaded, or reloads a file changed since it last loaded or wrote it before each save, as VS Code. Its events: a command
(sweep, write-back, refresh); a save to the path; a save landing in an aside copy, only while the copy's writer runs and
before any later save; the swap's first check, under the lock before any other command; the writer's second check;
another machine's write, to an entry the person does not edit and, in the second bound, to one they do; the person's
malformed set and its repair; in the runs that name it, the person deleting the file once, while it holds what the
projection last wrote, which a refresh rebuilds by the link alone once the store has moved (§ 5.5); and a removal's
check and persist step (§ 12.2). Entries are named values: the store's merge keeps the current side at a clash and files
it, as `chooseEntries` does, and a merge in the checkout refuses a clash. Every interleaving within the bound is
explored, and every reachable state is settled with no further saves and checked three ways: each writer's last saved
value for each entry stands in the store's lineage, a filed conflict, or a reported file or copy; the same once a
persist step that passes has removed the checkout; and the removal check answers as the persist step does.

Three designs ran. The settled text. Option 1: each copy records its path's record at the swap, and a copy taken in once
that record has changed is refused as superseded and never sent; as approved it records the record's stamp and content
and fires only where either carries the copy's stamp; amended it records the stamp and the version the write landed,
re-recorded at the copy's own landing, fires on any change, and adds three refinements — a copy holding what its swap
moved or what it held when its own take-in landed is no edit, a superseded copy whose every change, from its stamp's
version and from the record's content, the store already holds is deleted, and the persist step takes the aside copies
over before writing files back, the order the sweep keeps. Keeping both: a copy holding an edit whose path no longer
holds the file its swap linked is kept and reported, never merged, and one holding what its swap moved or what it held
when its own take-in landed is no edit. With the person deleting the file, keeping both ran as § 5.2 first stated it, an
absent path never moved on, and with a mark: each write-back of the path marks its other aside copies as it lands, which
is § 5.2's mark before the send since every send lands in the model, a marked copy's path has moved on whether the path
is there or not, and the removal check reads the copies in the persist step's order, each against the marks the earlier
take-ins would set.

At four commands and four saves, the buffer never reloading:

| Design                                         | States  | Loss   | At removal | Disagrees | Kept copies |
| ---------------------------------------------- | ------- | ------ | ---------- | --------- | ----------- |
| The settled text                               | 211,914 | 28,869 | 44,690     | 0         | 0           |
| Option 1 as approved, copies first             | 109,030 | 18     | 9          | 0         | 50,239      |
| Option 1 amended, files first as § 12.2 has it | 85,468  | 0      | 90         | 3,296     | 12,164      |
| Option 1 amended                               | 85,468  | 0      | 0          | 0         | 12,164      |
| Keeping both                                   | 93,038  | 0      | 0          | 0         | 37,242      |

At three commands and three saves, the buffer reloading and the other machine also editing an entry the person edits:

| Design                                            | States  | Loss  | At removal | Disagrees | Kept copies |
| ------------------------------------------------- | ------- | ----- | ---------- | --------- | ----------- |
| The settled text                                  | 220,323 | 4,986 | 8,500      | 0         | 0           |
| Option 1 as approved, copies first                | 191,725 | 68    | 68         | 614       | 39,218      |
| Option 1 amended, firing only on the copy's stamp | 171,491 | 68    | 68         | 0         | 0           |
| Option 1 amended                                  | 168,099 | 0     | 0          | 290       | 12,950      |
| Keeping both                                      | 170,683 | 0     | 0          | 0         | 37,344      |

Keeping both again, the person able to delete the file, at four by four with the buffer never reloading and at three by
three with it reloading and the other machine also editing:

| Bound and design                                  | States  | Loss   | At removal | Disagrees | Kept copies |
| ------------------------------------------------- | ------- | ------ | ---------- | --------- | ----------- |
| Four by four, as first stated                     | 266,015 | 22,289 | 18,673     | 0         | 83,211      |
| Four by four, with the mark                       | 222,259 | 0      | 0          | 0         | 84,892      |
| Three by three, as first stated                   | 672,895 | 6,032  | 6,332      | 0         | 148,548     |
| Three by three, the mark, check reading unordered | 629,996 | 0      | 0          | 440       | 159,108     |
| Three by three, with the mark                     | 629,996 | 0      | 0          | 0         | 159,108     |

Without deletion the mark changes nothing: keeping both with it reaches the same 93,038 states at four by four, with the
same counts.

States are a count of what the bound reaches, not a frequency, and every run is complete. Disagrees counts the states
where the removal check answers otherwise than the persist step; the check reads each file and copy against the state
as it stands, except that with the mark, but for the row marked unordered, it reads the copies in the persist step's
order, each against the marks the earlier take-ins would set. Kept copies counts those that settle with a copy kept,
refused or reported, holding no malformed set. The settled text keeps none because it merges every copy. The
digest-only runs peaked at 39–457 MB.

The shortest traces, each read against the spec:

- **An unedited copy reverts a newer save** (the settled text). A refresh moves the unedited file aside; the stale
  buffer saves an edit to the path under the same stamp; an overlapping command writes it back, so the record now
  carries that stamp; the first command's second check reads its copy against the record, and the copy reads as removing
  the edit. A removal reaches it without overlap: the persist step writes the path back before taking the copy over.

- **A copy holding an older save** (the settled text). A save opened before the move lands in the copy after the first
  check; the buffer's newer save to the path persists; the second check sends the copy, reverting it.

- **The persist step's order** (a buffer that never reloads). The buffer adds an entry, a save that lands in the copy,
  then removes it and saves to the path. Read against its stamp's version, the path holds no edit and records nothing;
  the copy then lands the entry; and step 4's re-check passes the path, whose stat has not changed since step 2 read it.
  Taking the copy over first lands the entry, after which the path reads as removing it, and the removal lands. A
  reloading buffer never meets it: it reloads the refreshed file, which lacks the entry, before the person can remove
  it.

- **The recorded identity repeats** (option 1 as approved). With no stored version, where the content taken in merges in
  the checkout, the record's content goes from one entry set to that set plus an added entry and back once the person
  removes it, so a copy that recorded the first sees no change, is not refused, and re-adds the removed entry. The
  version the write landed changes at every persisted write-back, so an identity carrying it cannot repeat.

- **One record per path, two stamps** (option 1 firing only on the copy's stamp). A reloading buffer saves a malformed
  set and an added entry under the refreshed stamp; the rest lands, recording that stamp, and the file keeps its
  content; the person repairs the set and removes the entry. An older copy under the earlier stamp, holding an edit
  saved before the reload, is taken over first and lands, replacing the path's one record, so the file's write-back
  reads against its stamp's stored version and the removal is lost. The copy's stamp is not the record's, so a
  superseded test gated on it never fires; firing on any change keeps the copy aside.

- **A refused copy sent back over a newer save** (the settled text). Where a copy's path holds what the projection last
  wrote, by the index entry, a copy with a malformed set goes back over the read-back of a newer save from the same
  buffer, and the file's partial landing reverts that save. Under either other design the superseded or moved-on test
  runs first and keeps it aside.

- **Keeping both, tested by the index entry.** A copy whose path holds what the projection last wrote is merged, so
  after a newer save has landed and been read back the older copy merges again: 2,933 states lose at three by three, the
  buffer never reloading. Keeping both needs the file its own swap linked recorded beside the copy.

- **A deleted path after a persisted save** (keeping both as first stated). A save opened before the move, holding a
  malformed set, lands in the copy; the buffer's newer save to the path persists while the copy's writer still runs;
  the person deletes the refreshed file; the writer's second check reads the absent path as not moved on and sends the
  copy back to it, and its partial landing merges from the newer record, reverting that save's edit. The mark keeps the
  copy aside.

- **Two copies of an absent path** (keeping both with the mark). The persist step takes the older copy in, which marks
  the newer, so the newer is kept and the step refuses; the removal check, reading each copy against the state as it
  stands, answered removable. Reading the copies in the persist step's order, each against the marks the earlier
  take-ins would set, it refuses too.

- **Two copies in one pass** (option 1 amended, the remaining disagreement). The persist step takes the older copy over
  and lands it, which changes the record, so the newer copy reads as superseded and is kept, and the step refuses; the
  removal check, reading the newer copy against the record as it stood, answered removable. Reading in the persist
  step's order, each item against the record the earlier ones would leave, it refuses too.

Every copy the amended option 1 keeps either adds or removes an entry a newer save from the same path handled otherwise
— the same buffer's older save or another editor's concurrent edit, which nothing on disk tells apart — or is the newer
of two copies taken over in one pass.

Bounds: one path, four named entries, one buffer, each edit made once so no entry returns to an earlier value, no
`_Id:_` matching (Spike 5, in `notes-projection-write-back.md`, covers it), no index rebuild, stampless file, held
file's conflict record, removal of the file (§ 5.6), writer stopping before its second check, stop between a write's
landing and its index write, store refusing a write, writer holding its descriptor across the move (§ 5.3), or timing
(Spikes 1 and 1b), the person deleting the file only once and only while it holds what the projection last wrote, and
step 4's re-check passes left out, which the order trace shows would not catch it. The rule deleting a superseded copy
whose changes the store already holds is the one these bounds cannot judge: a copy re-adding an entry an intermediate
record removed shows no change against its stamp's version, a shape monotone edits never make. The model's own errors,
found against the spec and fixed before these figures: a save could land in an older copy after a later save, that
deletion rule first measured a copy's changes against its stamp's version alone, and an editor reloaded once at an
arbitrary point.

Research the same day, one pass over primary sources: Syncthing re-checks a file's metadata before replacing it and
aborts on a change, and a real conflict renames the losing file to `.sync-conflict-*`, never merged; Dropbox keeps a
conflicted copy, never merged; Git refuses a checkout over local changes, merging only under `-m`; and jj records
conflicts as data, though its working-copy update carries a note to check that a file has not changed before overwriting
it (read from source; no issue found). No tool merges a losing copy on its own, since none holds a common base for it;
the stamp gives this projection one. Zed's behavior is not from that research but Spikes 1b and 3.

What it settles: the settled text loses saves in every bound, and option 1 as approved in both. Two designs lose nothing
in either bound. Option 1 amended needs the stamp and the version the write landed recorded beside each copy, a copy
refused as superseded once that record changes at all, the persist step taking copies over before files with the removal
check reading in that order, and the no-edit refinements; it keeps a copy only where an older save and another editor's
cannot be told apart or two copies meet in one pass. Keeping both needs the file each swap linked recorded beside its
copy and the no-edit rules for what the swap moved and what it held when its own take-in landed; it keeps about three
times as many copies. As § 5.2 first stated it, an absent path never moved on, it held unchanged in every bound until
the person could delete the file, and then lost saves in both; with the mark beside each copy and the removal check
reading the copies in the persist step's order, it loses nothing in either bound and agrees with the persist step.
Option 1 amended was not run with the file deleted.

## Spec review carry-forward

The decomposition's specification review (2026-10-30) found these gaps, each inherited from the origin specification,
which settled them in the task list or not at all. Fold each into this member's specification at its next planning
review. Task numbers are `tasks-projection-substrate.md`'s.

- **Success criteria for the engine's state.** None tests the racy rule catching a same-tick, same-size save, smudging
  included (§ 3.3); base-stamp recovery choosing an exact, closest, or empty base (§ 3.5); the stale-buffer base
  (§ 3.6); the projection lock's 200 ms skip and its rule never to recreate a removed Git directory (§ 3.2); the § 12.6
  remedies; or the § 11.5 `.gitignore` change. The task list's criterion that the worktree lock, the managed `.ignore`
  block, and the `.gitignore` change are live before the flip has no specification counterpart.
- **The configuration read's requirements.** Task 2.5.b settles the keys read, the precedence (the last occurrence
  wins), `git config`'s exit status 1 for no match, the multi-valued `arc.inflightPin`, and the no-identity verdict's
  shape; § 15.3 states only the keys.
- **Design settled only in tasks.** The notice line's form, `<!-- arc-notice: ...`, in the block directly after the
  stamp (Task 2.5.c); base-stamp recovery's window of the five newest versions (Task 2.6); the `resolveCheckoutGitDir`
  fallback where `readGitDirectories` throws (Task 2.2.b); and `listArcFiles` skipping `system/.local/`, so `arc health`
  reports no aside file as new (Task 2.2.c).
- **§ 1.2's inventory.** It omits `lib/fs.ts`, `lib/advisory-lock.ts` (the exported liveness predicate),
  `lib/local-vitest-runner.ts`, `lib/change-facts.ts`, and `__tests__/helpers/store/projection/`, which the tasks
  change.
- **A refused `history` read for a stopped replacement.** § 3.7 reads the version a stopped replacement replaced, which
  a file other than Markdown needs to take the closer of the two versions as its base. Where that read refuses
  `state-unresolvable`, § 3.5 pulls nothing, since only a merge in the checkout for a write is pulled, but says which
  base the file then takes only for recovery, placement, and a conflicted file, and Task 2.8 tests no refusal. The lean:
  the file stays pending and reported, written back nowhere, until the read succeeds, as a conflicted file keeps its
  version, since taking either version without reading it would break § 3.7's rule that old content a stop left is never
  written back over the newer version.
- **The guard before a command's first writes.** § 11.2 runs the guard before the projection writes into a root, and its
  named callers are materialization, refresh, and fan-out, but a command's start writes before its refresh: the sweep
  links aside copies back (§ 5.4), and write-back's read-back replaces files by the swap
  (`spec-projection-write-back.md` § 7.1). Nothing names a guard run before those writes. The lean: the start runs the
  guard's skip check before its sweep, so every write it makes follows the guard, at no cost while no ignore file may
  have changed.
