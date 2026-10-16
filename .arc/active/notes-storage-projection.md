# Notes: storage-projection

## Contents

- [Spike evidence](#spike-evidence)
- [Spike 1 — the refresh's replace guard](#spike-1--the-refreshs-replace-guard)
- [Spike 1b — moving the file aside](#spike-1b--moving-the-file-aside)
- [Spike 2 — command-start cost in Node](#spike-2--command-start-cost-in-node)
- [Spike 3 — how editors and agent tools write](#spike-3--how-editors-and-agent-tools-write)
- [Spike 4 — conflict markers in practice](#spike-4--conflict-markers-in-practice)
- [Tripwire timings](#tripwire-timings)
- [Spike 5 — write-back through the store](#spike-5--write-back-through-the-store)
- [Spike 6 — finding a stored clash again](#spike-6--finding-a-stored-clash-again)
- [Spike 7 — aside copies against a stale buffer's record](#spike-7--aside-copies-against-a-stale-buffers-record)

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
- **The projection's own no-change cost is small beside the command it runs in.** At the writable set's size — its own
  work item, the personal surfaces, and the owner's in-flight prose, well under 1,000 files — the stat walk is about 2
  ms on Linux and under 7 ms on Windows. The one Git read for the state version is the largest part on Windows, and it
  can start together with the walk and overlap it.

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

| Mode                                                 | Linux        | Windows        |
| ---------------------------------------------------- | ------------ | -------------- |
| Temp-and-rename per file, sequential                 | 115–122 ms   | 1,076–1,271 ms |
| Staged in the aside folder and linked in, sequential | 124–130 ms   | 1,211–1,240 ms |
| Linked in, 4 writes at a time (Node's default pool)  | —            | 722–789 ms     |
| Linked in, 8 writes at a time (Node's default pool)  | 180 ms, once | 697–711 ms     |
| Linked in, 8 writes at a time, 8 pool threads        | —            | 621–653 ms     |

- **The listing and the batched read are small:** 5–9 ms and 45–49 ms on Linux, 31–34 ms and 93–97 ms on Windows.
  The rest is one file write per record, about 1.5 ms each on Windows.
- **Parallel writes halve Windows** and add nothing past 8 at a time (16 writes on 16 threads took 649–667 ms). On
  Linux one ungated run took 180 ms, slower than sequential writes, whose write phase runs in 70 ms.
- **Linking costs little:** 5–10% over temp-and-rename on both platforms.

---

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
`_Id:_` matching (Spike 5 covers it), no index rebuild, stampless file, held file's conflict record, removal of the file
(§ 5.6), writer stopping before its second check, stop between a write's landing and its index write, store refusing a
write, writer holding its descriptor across the move (§ 5.3), or timing (Spikes 1 and 1b), the person deleting the file
only once and only while it holds what the projection last wrote, and step 4's re-check passes left out, which the order
trace shows would not catch it. The rule deleting a superseded copy whose changes the store already holds is the one
these bounds cannot judge: a copy re-adding an entry an intermediate record removed shows no change against its stamp's
version, a shape monotone edits never make. The model's own errors, found against the spec and fixed before these
figures: a save could land in an older copy after a later save, that deletion rule first measured a copy's changes
against its stamp's version alone, and an editor reloaded once at an arbitrary point.

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
