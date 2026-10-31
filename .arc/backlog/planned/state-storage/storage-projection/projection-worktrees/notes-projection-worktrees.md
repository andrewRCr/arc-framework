# Notes: projection-worktrees

## Contents

- [Spike evidence](#spike-evidence)
- [Spike 2 — command-start cost in Node](#spike-2--command-start-cost-in-node)
- [Tripwire timings](#tripwire-timings)
- [Spec review carry-forward](#spec-review-carry-forward)

## Spike evidence

Each spike's harness and raw logs stay on the machine that ran it, under `~/dev/scratch/arc-storage-spike/projection/`;
this file keeps the results and what they settle. Linux runs are WSL2 on ext4; Windows runs use `node.exe` on NTFS.
The September spikes behind `storage-contract`'s Part B are in its notes, § Evidence behind Part B.

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

## Spec review carry-forward

The decomposition's specification review (2026-10-30) found these gaps, each inherited from the origin specification,
which settled them in the task list or not at all. Fold each into this member's specification at its next planning
review. Task numbers are `tasks-projection-worktrees.md`'s.

- **macOS bounds.** § 15.3 and the § 15.4 table give Linux and Windows bounds alone, while Success Criterion 4 and Task
  1.10.b hold macOS to Linux's.
- **The one-file fan-out tripwire.** § 15.4 warns that a meta write's fan-out can cross its Windows bound with few
  files, but Success Criterion 4 and Task 1.10.a do not pin the one file to a non-primary record.
- **A spawn's materialization that fails or finds no port.** Task 1.3 settles that a failure in a spawn's
  materialization is reported and the spawn completes, the worktree's first command materializing it, and that a spawn
  in a process whose root hook never ran finds the materialize port unbound and materializes nothing; § 2.5 states
  neither.
