# Notes: storage-projection

## Contents

- [Spike evidence](#spike-evidence)
- [Spike 1 — the refresh's replace guard](#spike-1--the-refreshs-replace-guard)
- [Spike 1b — moving the file aside](#spike-1b--moving-the-file-aside)
- [Spike 2 — command-start cost in Node](#spike-2--command-start-cost-in-node)
- [Spike 3 — how editors and agent tools write](#spike-3--how-editors-and-agent-tools-write)
- [Spike 4 — conflict markers in practice](#spike-4--conflict-markers-in-practice)
- [Tripwire timings](#tripwire-timings)

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

- **The refresh re-check is B with the index written before the rename onto F:** a stat comparison, the content hashed
  only for a racy entry, and no time-based deferral — deferral costs nearly every refresh on Linux.
- **The exclusive open is reachable and rejected.** It makes an editor's save fail and closes nothing a hash does not.
- **A rebuild commits with a hard link from the staged file.**
- **A protected file's refresh clears the read-only mode before renaming,** since the index already knows the file is
  protected; otherwise each refresh would spin through the `EPERM` retry to its timeout.

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

## Spike 2 — command-start cost in Node

Run 2026-10-09 (`spike2/`), warm cache, 2 warm-ups then 20 runs, median and p90 in milliseconds. Linux: Node 26.3,
Git 2.55, ext4. Windows: Node 22.17, Git for Windows 2.49, NTFS. Each run waited for low load, since other test
suites share the machine. Datasets: median file about 11.5 KB, the largest about 400 KB; the index is about 16 KB per
100 files; 300 loose refs under `refs/arc/`.

The no-change path is (a) read and parse the index, (b) stat every indexed file and compare it, with the racy rule,
and (c) one `git for-each-ref` over `refs/arc/`. Every run found nothing changed and hashed nothing.

| Files  | Linux (a) | Linux (b) `statSync` | Linux (c) Git | Linux total | Windows (a) | Windows (b) pool of 32 | Windows (c) Git | Windows total |
| ------ | --------- | -------------------- | ------------- | ----------- | ----------- | ---------------------- | --------------- | ------------- |
| 100    | 0.04      | 0.25                 | 2.0           | 2.3         | 0.40        | 0.72                   | 41.4            | 42.4          |
| 1,000  | 0.40      | 1.8                  | 2.0           | 5.0         | 0.93        | 6.5                    | 41.5            | 49.1          |
| 10,000 | 3.3       | 16.8                 | 2.3           | 24.7        | 5.5         | 65.8                   | 42.2            | 124           |

- **The stat call that is fast differs by platform.** `statSync` costs about 1 µs a file on Linux and 21 µs on
  Windows; a pool of 32 concurrent asynchronous stats costs about 6.5 µs a file on Windows and about 17 µs on Linux.
  Sequential `await` is slowest on both (Linux 354 ms, Windows 444 ms at 10,000 files).
- **On Windows the floor is the Git process.** `git for-each-ref` costs 41–42 ms whatever the file count. Started at
  the same time as the stat walk, it hides the walk up to about 1,000 files (Windows total 41.8 ms at 1,000, 86.8 ms
  at 10,000).
- **Windows `git` resolves to a launcher.** `execFile("git")` finds `cmd\git.exe` on `PATH`, a launcher that starts
  `mingw64\bin\git.exe`; calling the latter directly costs 31.6–32.4 ms instead of 41–42 ms. The CLI's Git calls
  go through the name (`lib/git/exec.ts`), so every one pays the launcher on Windows.
- **A second Git call costs nothing when it runs alongside the first** (`gitpair.mjs`, 40 runs, quiet gate): the store
  read alone took 41.6 ms on Windows and 2.9 ms on Linux; one `git config --get-regexp '^arc\.'` alone 25.0 ms and
  1.8 ms; both one after the other 64.8 ms and 5.1 ms; both at once 41.7 ms and 3.3 ms.
- **Process start:** `node -e 0` takes 17–18 ms on Linux and 28–29 ms on Windows; the built CLI's `--version` takes
  about 280 ms on Linux (measured separately, six runs).
- **Hashing is cheap and on Windows mostly the read.** A blob id including the read: 0.009 / 0.057 / 0.33 ms on Linux
  and 0.29 / 0.42 / 0.59 ms on Windows for 5 / 76 / 436 KB files; reading the 5 KB file alone takes 0.28 ms on
  Windows. Every id matched `git hash-object`.
- **The rest of the no-change path** (`nochange2.mjs`, run 2026-10-10 under the quiet gate, 3 warm-ups then 40 runs,
  datasets of 100 and 1,000 files in 17 and 125 folders): each run takes the projection lock by exclusive create,
  reads the empty aside folder, runs (a) and (b) with `statSync`, walks every folder with `readdirSync` and file types,
  looking each file up in the index, rewrites the index by temp and rename and then the reference stamp, and releases
  the lock. At 1,000 files, Linux: lock 0.11, sweep 0.03, stat 1.95, walk 1.03, write 0.61, unlock 0.03, total
  3.8 ms. Windows: 0.44, 0.09, 21.5, 5.1, 1.5, 0.58, total 29.2 ms. At 100 files the totals were 0.68 ms and 5.7 ms.
  The parts the bench left out add 1.8 ms on Linux and 7.7 ms on Windows at 1,000 files, the walk the largest. The
  Windows stat here is synchronous, matching the 21 µs a file above, where the pool of 32 took 6.5 ms. This
  repository's checked set: `backlog/` 156 folders and 298 files, `active/` 1 and 3, the identity root 5 and 8.

The racy rule, 1,000 loops of rewriting a 4 KB file in place right after recording it:

| Delay before the rewrite | Linux misses: stat only / racy rule | Windows misses: stat only / racy rule |
| ------------------------ | ----------------------------------- | ------------------------------------- |
| none                     | 987 / 0                             | 582 / 0                               |
| 5 ms                     | 494 / 0                             | 0 / 0                                 |
| 20 ms                    | 0 / 0                               | 0 / 0                                 |

Modification times tick every 10 ms on this Linux kernel (`CONFIG_HZ=100`: 1,984 of 2,000 back-to-back writes kept
the same time) and every 0.33–0.55 ms on NTFS, in multiples of 100 ns. The same-size save inside one tick is
therefore a Linux case too, and a wider one there.

**Full materialization** (`projection/mat/mat.mjs`, three runs, Linux): this repository's 780 state files (16.8 MB at
HEAD under `active/`, `backlog/`, and `completed/`) — one `ls-tree`, one `cat-file --batch` read (75–92 ms), then a
blob id and a stamped temp-and-rename write per file (67–114 ms) — took 159–222 ms. Both platforms ran later under the
quiet gate (§ Tripwire timings).

What it settles:

- **The racy rule is needed on every platform,** not only Windows; with it, no run missed a change.
- **The projection's own no-change cost is small beside the command it runs in.** At the writable set's size — its
  own work item, the personal surfaces, and the owner's in-flight prose, well under 1,000 files — the stat walk is
  about 2 ms on Linux and under 7 ms on Windows. The one Git read for the state version is the largest part on
  Windows, and it can share the command's first store read and overlap the walk.

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
  one). Change detection compares type, size, and modification time in nanoseconds, never inode identity — as the
  draft's index already does.
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
- **Projected files sit inside raw lint runs.** The `lint:md` gate enumerates through Git (`MARKDOWN_SELECTION` and
  the index-plus-untracked-non-ignored source in `lib/markdown/selection.ts`), so gitignored projected files fall
  outside it — the register row `storage-seam` owns. The root `.markdownlint-cli2.jsonc` sets `gitignore: false` over
  `**/*.md`, so editor lint and `lint:md:fix` do see them; `.arc/completed/**` is already in its `ignores`.

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

## Tripwire timings

Run 2026-10-09 on both platforms under the quiet gate (`projection/tripwire/`), to set the fan-out and
full-materialization tripwires.

**Fan-out** (`fanout.mjs`): one write's changed files pushed into N sibling worktrees, the file work alone — the store
read happens once before it and is not timed. Per sibling, in turn, under its projection lock (an exclusive-create lock
file, as `lib/advisory-lock.ts` takes one): read the index, re-check each file, write the staged files into the aside
folder, write the index by temp-and-rename, and replace each file; then the swap's end check takes each lock again,
re-reads and hashes each aside copy, and deletes it. 4 KB files, 20 writes per cell after 3 warm-up writes, median
(p90).

| Worktrees × files per write | Linux, rename over | Linux, swap + end check | Windows, rename over | Windows, swap + end check |
| --------------------------- | ------------------ | ----------------------- | -------------------- | ------------------------- |
| 5 × 1                       | 0.9 (1.3) ms       | 0.9 + 0.2 ms            | 17 (25) ms           | 23 + 6 ms                 |
| 10 × 1                      | 1.2 (1.6) ms       | 1.3 + 0.3 ms            | 30 (34) ms           | 41 + 12 ms                |
| 20 × 1                      | 2.8 (4.1) ms       | 2.6 + 0.7 ms            | 60 (61) ms           | 88 + 25 ms                |
| 5 × 10                      | 2.7 (3.0) ms       | 2.8 + 0.7 ms            | 58 (61) ms           | 118 + 30 ms               |
| 10 × 10                     | 4.9 (5.4) ms       | 5.4 + 1.5 ms            | 107 (120) ms         | 218 + 54 ms               |
| 20 × 10                     | 10.0 (11.0) ms     | 10.4 + 3.0 ms           | 215 (1,432) ms       | 459 + 112 ms              |

- **Windows pays per worktree and per file.** Each sibling costs about 3 ms with a rename over the file and 4.4 ms
  with the swap, before its files, mostly the lock and index files' creates; each further file costs about 0.85 ms
  renamed over and 2 ms swapped. The end check adds about 1.3 ms per sibling and 0.5 ms per file. On Linux the swap
  and the rename cost the same.
- **The 20 × 10 Windows p90s (1.4–1.6 s)** are host stalls, which hit both methods.
- **September's figures timed something else.** The analysis's 52 ms for 5 worktrees, 89 ms for 10, and 164 ms for 20
  on Linux do not say what they included, and they are far above these; these replace them as the tripwire's
  baseline.

**Full materialization** (`mat2.mjs`, `mat.mjs` with a link mode; `mat3.mjs` with parallel writes): this repository's
780 state files, 16.8 MB, at `1ee4709a3`, from a shallow bare clone, three runs per mode.

| Mode                                                  | Linux        | Windows          |
| ----------------------------------------------------- | ------------ | ---------------- |
| Temp-and-rename per file, sequential                  | 115–122 ms   | 1,076–1,271 ms   |
| Staged in the aside folder and linked in, sequential  | 124–130 ms   | 1,211–1,240 ms   |
| Linked in, 4 writes at a time (Node's default pool)   | —            | 722–789 ms       |
| Linked in, 8 writes at a time (Node's default pool)   | 180 ms, once | 697–711 ms       |
| Linked in, 8 writes at a time, 8 pool threads         | —            | 621–653 ms       |

- **The listing and the batched read are small:** 5–9 ms and 45–49 ms on Linux, 31–34 ms and 93–97 ms on Windows.
  The rest is one file write per record, about 1.5 ms each on Windows.
- **Parallel writes halve Windows** and add nothing past 8 at a time (16 writes on 16 threads took 649–667 ms). On
  Linux one ungated run took 180 ms, slower than sequential writes, whose write phase runs in 70 ms.
- **Linking costs little:** 5–10% over temp-and-rename on both platforms.

---
