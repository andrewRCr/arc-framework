# Notes: projection-worktrees

## Contents

- [Spike evidence](#spike-evidence)
- [Spike 2 — command-start cost in Node](#spike-2--command-start-cost-in-node)
- [Spike 3 — protection's reads per render](#spike-3--protections-reads-per-render)
- [Spike 4 — scale constants and model](#spike-4--scale-constants-and-model)
- [Spike 5 — the start's Git calls beside its walk](#spike-5--the-starts-git-calls-beside-its-walk)
- [Tripwire timings](#tripwire-timings)
- [Grounding basis](#grounding-basis)
- [Removal callers](#removal-callers)
- [A1 — installed stats and shared reference advances](#a1--installed-stats-and-shared-reference-advances)
- [A2 — ownership while a path is reused](#a2--ownership-while-a-path-is-reused)
- [Implementation timing feedback](#implementation-timing-feedback)
- [A4 — Full-round performance calibration](#a4--full-round-performance-calibration)
- [Removal persistence](#removal-persistence)
- [Release under the persistence lease](#release-under-the-persistence-lease)
- [Removal compositions](#removal-compositions)
- [A5 — verify executable and inert removal compositions](#a5--verify-executable-and-inert-removal-compositions)
- [Lifecycle removal authority](#lifecycle-removal-authority)
- [Sweeps, Errand exits, and release authority](#sweeps-errand-exits-and-release-authority)
- [Explicit policy at inert compositions](#explicit-policy-at-inert-compositions)
- [Checkout-local personal surfaces](#checkout-local-personal-surfaces)
- [A6 — residual personal files in unindexed retirement](#a6--residual-personal-files-in-unindexed-retirement)
- [Unindexed personal-data preservation](#unindexed-personal-data-preservation)
- [Persist burst evidence](#persist-burst-evidence)
- [Native Windows fixture fidelity](#native-windows-fixture-fidelity)
- [Removal segment qualification](#removal-segment-qualification)

## Spike evidence

Each spike's harness and raw logs stay on the machine that ran it, under `~/dev/scratch/arc-storage-spike/projection/`;
this file keeps the results and what they settle. Linux runs are WSL2 on ext4; Windows runs use `node.exe` on NTFS.
Spikes 3, 4, and 5 keep theirs under `~/dev/arc-evidence/projection-worktrees/` instead.
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
- **The engine's step and stat** (probed 2026-11-06 at the task list's second adversarial pass, WSL2 ext4, scratchpad
  only): 309 steps of base's `withProjectionLock`, one per file of this repository's checked set, took 270–430 ms over
  several runs as load varied, about 1 ms each, since every step renews the lease on disk (`renewAdvisoryLock`); the
  write-back engine at `6b82b6f671` takes one before each file's change check (`checkFileAtPath`). The same 309 files'
  `lstat`, median of seven runs: one awaited after another 12.8 ms, all at once 5.1 ms, a pool of 32 6.0 ms, and
  `lstatSync` 0.32 ms. `nochange2.mjs` took the lock once and renewed nothing, the path `spec-projection-worktrees.md`
  § 15.3 now requires of the engine.

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
  can start together with the walk and overlap it. In the engine, the store read reaches its Git process only after the
  synchronous folder walk, and the stat walk follows that read (`startUnderLease`; `spec-projection-worktrees.md`
  § 15.3), so neither overlaps the Git call there.

## Spike 3 — protection's reads per render

Run 2026-11-06 at the re-entry after the task list's third adversarial pass, over `projection-write-back` at
`6b82b6f671`, exported and run with a `git` stand-in on `PATH` that counts processes (`protection-reads/`). Linux; the
counts hold on every platform.

- **Git processes per store operation on the ref backend:** `read` 1; `lookup` 3 for the first at a state version, then
  1; `list` 3; `version()` 1, or 3 where the manifest is new; `changes` 2 with nothing changed; `git worktree list` 1.
- **One render's protection** (`createProjectionProtection`) reads, for a work unit's meta or task list, the meta for
  rights (`readProjectionEditRights`), the destination's claim — a `lookup` and a `read` keyed by whatever work unit its
  marker names (`readActiveClaim`) — and the meta again (`workItemProtection`); outside the owner's checkout it adds one
  roster scan (`findHoldingCheckout`), and where no checkout holds the unit and its meta links a branch, a second scan
  and a `list` for the project identity (`findNativeMarkerlessWorkUnitCheckouts`). A companion in its owner's checkout
  reads the meta once, and a person-owned record reads nothing.
- **A round.** One task list fanned into 22 worktrees, 20 of them holding other work units, made 64 reads, 21 lookups,
  and 21 roster scans, about 108 Git calls — about 4.4 s on Windows at 41 ms a call, against the 600 ms fan-out bound.
  Its distinct requests were 42 store calls, 40 of them the other units' claims, and one roster scan. With rights
  reading only the owner's claim, the round's memo, and its one roster listing, the round needs one read, one lookup,
  and one scan, about five Git calls.
- **A full materialization.** This repository's ~930 work-item files over ~312 work units cost about 960 Git calls with
  nothing shared, about 40 s on Windows against the 5 s bound; a per-command memo still leaves ~312 meta reads, about
  13 s; answered from the materialization's own `list`, none.
- **Limits.** Store calls were counted over the lifecycle reference store and converted with the ref backend's costs
  above. Unbound markers were not exercised; the markerless search stopped at its `list` for the fixture's missing
  project identity; the refresh re-laid the same version.

What it settles: protection observed in each render, as `projection-write-back` ships it, misses the fan-out and
materialization bounds by about an order of magnitude, nearly all of it reads that every render in a round repeats or
that a marker naming another work unit makes. `spec-projection-worktrees.md` § 16.3 has rights read only the file's own
work unit's claim and a refresh's renders observe protection through the round's evidence.

## Spike 4 — scale constants and model

Run 2026-11-07 on this machine (WSL2, ext4) and the `desktop-windows` runner (NTFS, Windows Git and Node, below-normal
priority; one root inside the Defender exclusion and one outside it), medians of three to five runs. Benchmarks, data,
and model: `bench/`, `scale-linux.json`, `scale-win32.json`, `scale-model.py`, and `SCALE-SUMMARY.md`.

| Per unit                                  | Linux        | Windows runner                                          |
| ----------------------------------------- | ------------ | ------------------------------------------------------- |
| Index decode through the schema, an entry | 5.6–6.9 µs   | 14–16 µs, 22 at 1,000 entries                           |
| Index encode, an entry                    | 7.2–8.2 µs   | 16–18 µs, 24 at 1,000 entries                           |
| Plain JSON parse and stringify, an entry  | 3.2–3.8 µs   | not measured                                            |
| Typed synchronous walk, a file            | 1.7–2.3 µs   | 16–18 µs at 8 files a folder, about 31 at 4, 25–63 at 2 |
| Walk awaiting an `lstat` per entry        | 66–70 µs     | 180–240 µs                                              |
| Stat, a file                              | 1.2 µs, sync | 16–17 µs, pool of 32                                    |
| Replace a 36 KB file by temp and rename   | 0.2 ms       | 2.6–2.8 ms                                              |
| `for-each-ref`, a ref, packed and loose   | 1.2, 3.4 µs  | 5, 72 µs                                                |
| A Git process                             | 3.1–3.9 ms   | 42–45 ms                                                |

- **The index codec dominates.** `startUnderLease` reads the whole index (`readProjectionIndex`) and each write rewrites
  it whole (`commitProjectionIndex`), archive entries included, about 620 bytes an entry. A read and a write cost about
  15 µs an entry on Linux and 32–50 µs on Windows, the most at about a thousand entries: 14 ms and 47 ms a command at
  this repository's size, and a decode and two encodes in each worktree a fan-out visits, 0.45 s and 0.9–1.5 s of a
  one-file fan-out into 20 worktrees. The schema is about three quarters of the cost on Linux.
- **The walk and stats on Windows disagree with § Spike 2.** The runner measured the walk and a pool of 32 stats at
  about three times § Spike 2's 5.1 µs and 6.5 µs a file at eight files a folder; its below-normal priority and load
  are the likely cause, untested. `backlog/` holds about two files a folder (§ Spike 2). With the partitioned index the
  model puts the no-change overhead at this repository's size near 55 ms on Windows with § Spike 2's costs and at
  63–80 ms with the runner's.
- **Defender** added 0–30% to walks, and up to about twice to stats at 60,000 files, outside the exclusion.
- **Ref enumeration.** `version()` lists every live ref under `refs/arc/`; 10,000 loose refs take 716 ms on Windows.
  The in-repository layout keeps refs loose until Git packs them, which the store's owners hold
  (`storage-ref-release-hardening`).
- **Growth.** The model extrapolates these constants linearly over three years of archive, for a team of T people each
  finishing k work units a month (this repository runs about 23, one person with agents), with 20 worktrees each at
  team scale; walk 34 µs and stat 16 µs a file on Windows. As specified before this re-entry, a pull's fan-out copies
  the team's changes into every worktree, `arc save` walks the whole archive, and a spawn writes it whole. On Windows,
  in milliseconds unless marked:

| Scenario   | Design    | Command | `arc save` | One-file fan-out | Daily pull | Later catch-up | Spawn | Disk a worktree |
| ---------- | --------- | ------- | ---------- | ---------------- | ---------- | -------------- | ----- | --------------- |
| This repo  | specified | 112     | 142        | 624              | 692        | —              | 1.3 s | 0.03 GB         |
| This repo  | split     | 70      | 99         | 333              | 317        | 102            | 1.3 s | 0.03 GB         |
| T=50, k=2  | specified | 549     | 1,202      | 13,434           | 15,995     | —              | 20 s  | 0.51 GB         |
| T=50, k=2  | split     | 112     | 765        | 450              | 428        | 213            | 20 s  | 0.51 GB         |
| T=50, k=2  | narrow    | 56      | 122        | 450              | 318        | 103            | 2.0 s | 0.05 GB         |
| T=250, k=2 | specified | 2,809   | 6,075      | 72,632           | 85,992     | —              | 99 s  | 2.54 GB         |
| T=250, k=2 | split     | 375     | 3,641      | 451              | 930        | 715            | 98 s  | 2.54 GB         |
| T=250, k=2 | narrow    | 95      | 421        | 451              | 368        | 153            | 9.8 s | 0.25 GB         |
| T=250, k=8 | narrow    | 227     | 1,533      | 451              | 556        | 341            | 39 s  | 1.02 GB         |

`split` is the partitioned index with a pull refreshing only the worktree that ran it, the others catching up at their
next command, and every view `all`; `narrow` adds a view of a tenth of `backlog/` and `completed/`. On Linux the
specified design costs 20 ms a command at this repository's size and the split one 7 ms. The model is rough: linear,
the codec's constant taken at the measured size nearest each scenario's entry count, and no contention.

The `split` row's pull refreshes only the worktree that ran it, and its catch-up is priced at each worktree's next
command; a later write's fan-out would lay it instead wherever a worktree had not run one, which the row does not
charge. A pull fanned into every worktree over the partitioned index costs, from the same model, 383 ms on Windows here
against the row's 317, and at T=50, k=2 2,838 ms on Windows and 418 ms on Linux, against a first write after the pull of
2,711 and 399 ms with every other worktree behind. The 15,995 ms of the `specified` row is the whole-index codec's.
`spec-projection-worktrees.md` § 2.2 fans a pull out to every worktree.

What it settles: the index as a header and partitions (`spec-projection-worktrees.md` § 3.1), so a command's cost no
longer grows with the archive. It leaves the Windows budget at this repository's size to the tripwire suite's
measurement of the engine (`spec-projection-worktrees.md` § 15.3).

## Spike 5 — the start's Git calls beside its walk

Run 2026-11-07 on the `desktop-windows` runner (NTFS, the runner's Git 2.56 and Node, below-normal priority; arc-offload
run `e953e5b15937459d89b1f6d675fb970a`), three warm-ups then 20 runs, the variants interleaved, medians and p90 in
milliseconds. Benchmark and data: `bench/scale-overlap.test.ts` and `overlap-win32.json`. The dataset is this
repository's checked set: 309 files, `backlog/`'s 298 in 156 folders, mostly two to a folder, `active/`'s 3, and the
identity root's 8; 300 loose refs under `refs/arc/`; a header and three partitions, `backlog/`'s about 155 KB, against
about 185 KB at § Spike 4's 620 bytes an entry. Each start takes a lock by exclusive create, makes the two Git calls the
projection makes (`for-each-ref` over `refs/arc/` and one `git config --get-regexp`), reads the header and the
partitions as plain JSON, walks with `readdirSync` and file types, stats every file through a pool of 32, writes the
header by temp and rename and a reference stamp, and releases the lock.

| Variant                                                                      | Median | p90   |
| ---------------------------------------------------------------------------- | ------ | ----- |
| The two Git calls at once, alone                                             | 70.5   | 75.4  |
| The start, the walk run in one piece before the store's call, the rest after | 110.2  | 129.5 |
| The start, the walk yielding between folders, everything during the calls    | 75.0   | 78.0  |
| The walk, the index read, and the stats alone                                | 28.5   | 34.9  |
| The two Git calls at once, calling the real `git.exe` rather than `git`      | 53.2   | 58.2  |

- **Overlapping hides the walk, the index read, and the stats.** Run while the Git calls run, they add 4.5 ms to the
  calls' 70.5 ms, mostly the writes after them; run in one piece first, the walk holds back the store's call, which
  reaches its Git process through asynchronous steps (`lazyStore`, `lib/store/create.ts`), and the start takes 110 ms.
  The serial variant starts the store's process three event-loop turns after the walk, as a lazily loaded backend
  does, and the overlapped one three turns after the call, walking from the fourth and yielding between folders.
- **The Git calls themselves are what remain.** Here two calls at once took 70.5 ms, against 41.7 ms in § Spike 2 on the
  same machine at normal priority, so on this runner two Git calls alone exceed the Windows budget of 60 ms, and no
  ordering of the projection's own reads brings the start within it.
- **The launcher costs about a quarter of each call.** Calling `libexec/git-core/git.exe` directly took 53.2 ms against
  70.5 ms, as § Spike 2 found 31.6–32.4 ms against 41–42 ms. The CLI's Git calls go through the name
  (`lib/git/exec.ts`).

What it settles: the start's walk, index read, and stats run while its Git calls do (`spec-projection-worktrees.md`
§ 15.3), and the timing suite reports one Git call's median, two calls' run at once, each timed path's Git calls, and
the start's index read, walk, and stats run alone beside its medians, so each Windows median is read less the amount by
which those calls' host time exceeds the longer of 42 ms a call and that work, as Success Criterion 4 reads it: here
75.0 − (70.5 − 42) = 46.5 ms, the walk, index read, and stats alone taking 28.5 ms.

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

## Grounding basis

The task list names code as it stands at `c7b14659e3`, this branch with `main` merged (`6a8ba934cf`) on 2026-11-10,
which carries `projection-write-back` (#1305) and `cohort-identity-verbs` (#1309) as shipped, so every symbol it names
is on base. Task generation first grounded it on 2026-11-06, against `86d8e18dcd` and `projection-write-back`'s branch
head `6b82b6f671`. The re-check at `c7b14659e3` read each cited file that changed since against every statement naming
it, and checked the spec's citations of `spec-projection-write-back.md` against that spec as shipped; the spec's
amendment of 2026-11-10 records what moved.

## Removal callers

Production compositions of the removal machinery on `main` at task generation, the starting point for Task 2.4.a. No
production composition set `projectionRemovalSlots` then, so every path ran the passing defaults.

- Contexts carrying the slots or a `removal` option:
    - the lifecycle handlers (`handlers/lifecycle.ts`): `runPark` and `runAbandon` with `removal: { exec }`, and the
      teardown contexts of `runBranchTeardown` and `runTeardownForOperand`, whose `TeardownContext` carries
      `projectionRemovalSlots`;
    - `createStoreTeardownContext` (`lib/work-unit/store-teardown-context.ts`), composed by `handleStoreAbandon`
      (`handlers/abandon-store.ts`) and `runStoreDecomposeCommand` (`handlers/decompose-store.ts`), each beside
      `removal: { exec }`;
    - the reconcile contexts: `buildExecutorContext` (`lib/work-unit/executor-context.ts`), inherited by every
      `ctx.reconcileWorkUnitWorktree` call, `start-store.ts`, `materialize.ts`, `materialize-store.ts`, and
      `park-resume.ts` among them; `runCreateNew` (`commands/start.ts`); `runInRepoRenameCommand`
      (`commands/rename.ts`); and `checkoutMove` (`commands/rename-store.ts`);
    - `composeSessionInitStatus` (`handlers/status.ts`), building the options of `runBranchGoneRecovery` and
      `runStaleWorktreeSweep`;
    - the Errand runtimes in `handlers/errand.ts`: the leave, the close and partial close, and the abandon and partial
      abandon;
    - `handleLocusRelease` (`handlers/locus-release.ts`), whose CLI call in `cli.ts` passes no context.
- Direct calls:
    - `checkWorktreeRemoval`: `teardown.ts`, `reconcile-work-unit-worktree.ts`, `branch-gone-recovery.ts`,
      `stale-worktree-sweep.ts`, `lifecycle-residue-sweep.ts`, `store-retirement-sweep.ts`,
      `missing-worktree-folders.ts`, and the Errand leave's authorization (`leave-runtime.ts`);
    - `removeWorktreeCheckout`: `teardown.ts`, `teardown-store.ts`, `reconcile-work-unit-worktree.ts`,
      `terminal-occupancy.ts` (`removeSpawned`), and `lib/locus/release.ts`;
    - `releaseWorktreeCheckout`: `teardown.ts`, `teardown-store.ts`, and `lib/locus/release.ts`;
    - `checkRetiringCheckout`: `abandon.ts`, `abandon-store.ts`, `park-resume.ts`, and
      `lib/decompose/retirement-checkout.ts`;
    - `clearMissingWorktreeRegistrations`: `teardown-store.ts` and `reconcile-work-unit-worktree.ts`;
    - `removePrimaryTransientOccupancy` (`lib/git/worktree-marker.ts`), through `terminal-occupancy.ts`'s
      `removePrimary`, which clears a primary Errand's claim with no slot, and in `promote-runtime.ts`'s
      `settlePromotedOccupancy` on the in-repo path, which no projection meets.

## A1 — installed stats and shared reference advances

The inherited § 3.3 rule states: "Only a staged file's stat awaiting installation after that index write is exempt:
a save to that file necessarily follows the new reference." The inherited `smudgeRacyEntries` implemented that exemption
through its `installing` set. A whole-index `commitProjectionIndex` smudged the entry again before every reference advance;
a partition left unchanged by value does not get that second write.

The controlled-timestamp case in `smudging.test.ts` publishes an installing entry, saves different same-size bytes
in the entry's timestamp tick, then advances the reference through another root's partition. The first group's
partition stays unread and unchanged; `checkChange` reports clean rather than changed. Command-skip coverage also
exposed the case on Linux, where the same-size write retained the original timestamp and the sweep's publication
advanced the reference before change detection.

A1 removes the exemption at partition publication, retaining the comparison by value before smudging. Every racy
stat a partition publishes is smudged once, so later reference advances need no scan of untouched groups. A newly
installed racy file pays one initial hash; a later clean observation records its stat normally. Copy-mark-only
writes through `markOtherCopies` apply the same protection without advancing the reference. Per-partition clocks
or scanning every group would add mechanism and cost beyond this correction.

The propagation footprint is § 3.1 and § 16.2, the added criterion, Task 1.2.R, `smudgeRacyEntries`,
`commitProjectionIndex`, `markOtherCopies`, and the staging callers (`swapBatch`, `seedProjection`). The existing
performance bounds remain unchanged; Task 1.14 validates the full segment against them and closes A1. The historical
substrate specification remains unchanged.

## A2 — ownership while a path is reused

The inherited removal rule states: "the next refresh lays the arrival there by the link alone, recording no replaced
version (§ 3.7); until then the path is empty." `swapBatch` retains the leaving entry for a `relaid` removal, but a new
entry supplied to `rebuild` becomes `yielded`'s authority if an editor recreates the path before the exclusive link.
An interruption after the first publication leaves the same ownership question on disk. A stamp cannot decide every
case, since companions may be unstamped, and an inode alone does not prove which bytes survived a concurrent save.

The production-reference-store regression `refresh-path-reuse.test.ts` renames one cohort, then receives a new cohort
UID at its former canonical path. Two command starts leave the previous generation's content there. A pending entry
for the departure does not preserve the uninstalled arrival once the refresh advances its anchor.

A store-version anchor alone supplies no retry for a changed claim with no store write. Retaining the previous
`projectedUnder` tuple covers a retry toward the same target, but after partial progress A → B → A compares equal
while the layout can remain mixed: `dropRemovedEntries` drops completed removals and successful swaps clear pending
marks. A2 therefore writes one `reprojectionPending` bit before the layout changes, independently of tuple equality,
and clears it with the final tuple only once all desired arrivals for the fresh target are confirmed. No target
history or list of removed files is needed. Invalidating the state anchor instead would require a full inventory and
settled archive load on each retry; the flag confines recovery to the reprojection's affected roots. Fresh settings
still govern rights and capture (`createProjectionLocalCapture` supplies them explicitly), and confirming a single
handoff does not acknowledge the whole layout.

A2 retains the old anchor while any arrival is unfinished, and journals the arrival inside the leaving entry before
exclusive installation. The entry stays withheld until the command's end, or recovery before write-back, proves the
staged inode and rendered blob through a settled stable read. A lost link restores the leaving entry; interrupted or
changed bytes stay recoverable under both identities rather than being guessed into either record. The existing
copy-out/delete/reapply route releases ambiguity. The full obligation, including retry, lives in § 15.2 rather than
this rationale.

The footprint covers § 2.2's pending-root visit, § 3.1's header and entry state, § 10.4's acknowledgment, § 15.2, §
16.2's forward amendment to the inherited removal rule, criterion 10, and Task 1.6.R. `RecordEntrySchema`, the refresh
mover, `rebuild`'s caller, the start and end, and materialization carry the correction. Reprojection (Task 1.8),
`selectProjectedMarkdown`, `readProjectionStatus`, and persist and release (Tasks 2.2 and 2.3) consume it through
withholding and shared reconciliation; selection gains the withholding check. The index partition seams, ignore
authority, performance bounds, and historical substrate specification remain unchanged; Task 1.14 closes the segment
against the added criterion.

## Implementation timing feedback

Native Linux feedback from arc-offload run `21136803c78941a8877723d2bb235c2b`, eleven samples per path. The prepared
repository holds 800 projected files: 280 backlog files, two per folder, 40 active files, and 480 archive files totaling
about 17 MB. The expanded comparison holds 60,000 archived files and the same hot files and owner refs. Its settled
archive bytes and index basis are produced from native records with the production renderer and index codec; a small
fixture compares them with full native materialization.

| Path                                                  | Median (ms) | Bound (ms) |
| ----------------------------------------------------- | ----------- | ---------- |
| No-change start                                       | 20.59       | 10         |
| No-change start with expanded archive                 | 21.18       | 10         |
| Index read, walk, and stats alone                     | 3.52        | —          |
| Two Git calls together, alone                         | 5.03        | —          |
| One Git call alone                                    | 2.98        | —          |
| One-file backlog fan-out into twenty linked worktrees | 267.54      | 100        |
| Ten-file fan-out into twenty linked worktrees         | 700.34      | 100        |
| Full materialization                                  | 1055.25     | 1000       |

These are prequalification measurements, above the stated bounds, not a closed performance result. The external timer
includes complete operations; fan-out begins at the store's captured notification after its backend write and includes
every propagation round.

Hosted CI run `43017428975`, at `de0af2efb1d824130d0fc65e0c2381d6e12941a0`, produced eleven-sample medians on
all three platforms. Each timing job passed; the overall run failed in seven integration/store shards. Its named-file
portability input makes this diagnostic evidence, not work-unit verification.

| Path                                                  | Linux (ms) | Windows (ms) | macOS (ms) |
| ----------------------------------------------------- | ---------- | ------------ | ---------- |
| No-change start                                       | 51.35      | 144.89       | 207.02     |
| No-change start with expanded archive                 | 55.46      | 137.84       | 354.54     |
| One-file backlog fan-out into twenty linked worktrees | 486.55     | 988.25       | 753.12     |
| Ten-file fan-out into twenty linked worktrees         | 1644.98    | 3347.00      | 2465.13    |
| Full materialization                                  | 1624.96    | 3971.95      | 3155.02    |
| One Git process alone                                 | 13.25      | 54.85        | 24.74      |
| Two Git processes together, alone                     | 22.30      | 63.77        | 36.34      |
| Index read, walk, and stats alone                     | 6.91       | 18.36        | 20.48      |

Raw times remain usable, but the original Windows adjustment is invalid: the observer counted persistent-reader
requests as process starts, overstating its startup discount. Corrected counting distinguishes both; native feedback
run `edb438ad5c9847728fcbd7d9dcd7baa3` counted 13 starts for 27 requests in one-file fan-out and 67 starts for 162
requests in ten-file fan-out. Its Linux medians were 20.07 ms start, 272.84 ms one-file fan-out, 710.32 ms ten-file
fan-out, and 1058.04 ms materialization. A4 below records the qualified bounds.

Native phase tracing in run `e1d4cee7fec24af3a3f11c5565999f20` kept the same fixture and eleven samples. The
19.74 ms start spent 7.56 ms at its parallel-read barrier and 7.56 ms sweeping aside scaffolding; write-back took
0.98 ms and index publication 0.56 ms. One-file fan-out took 263.27 ms and ten-file fan-out 703.24 ms. Each visited
21 roots and published the index 84 times. Their target refreshes totaled 111.73 ms and 450.46 ms, including swaps
totaling 68.34 ms and 174.01 ms; publication totaled 73.48 ms and 76.41 ms. These nested durations do not sum to wall
time. The timer excludes the authoritative Store mutation, and the round already shares source reads through
`createProjectionReadMemo`; additional source caching is not justified by this trace.

### Per-root cost reductions

The 84 index publications came from four per root in `swapBatch`, `commitReturnedCopies`, `applyProjectionRefresh`,
and `refreshTarget`: durable intent before moving a file, settlement, source-state advancement, and final writer
metadata. Settlement, state, and writer marks now share the caller's final publication. Normal refreshes therefore
make two durable publications per root, 42 for the reference workload. Returned aliases retain their extra ordering:
their restored mapping publishes before unlink. A single total publication would change the recovery protocol;
`takeOverUnrecorded` retains and reports an edited unrecorded copy rather than automatically taking it in. The
interrupted-swap tests still require the intent and its copy ownership on disk before the move.

The original reported Git starts were `7 + 6 × changed owners`: two ref captures, manifest creation and retention, the
roster, a changes reader, and archive-endpoint tree enumeration; each owner added three tree enumerations and an
ancestry query inside `captureChangeWindow`, plus two UID reads for its primary and changed record. Port construction
had also hidden one identity-config process, so the physical totals were 14/68 rather than 13/67. `enumerateRefTrees`
now reads trees through the operation's existing reader, and `immediateWindowRow` proves a direct-parent unfiltered
interval from captured commits. Longer and filtered intervals retain Git's ancestry rules. The resulting totals are
9/27: six control processes and one changes reader, plus two separately owned UID readers per changed owner. Those
public operations still close their readers before returning, preserving maintenance and layout-move behavior.

`removeProjectionAsideFile` prunes empty scaffold ancestors as spent files disappear; `listAsideFolder` prunes old
empty scaffolding during its authorized walk. Subsequent empty starts observe an absent or empty aside root instead
of traversing 1,450 empty folders. No index flag or folder-time cache substitutes for observing disk: recreated
unrecorded copies are discovered, and recovery-name directories, nonempty foreign directories, and links survive.

Eleven-sample Linux feedback from run `6380131504ca4d489055272f164d1f43`, on the same registered runner as
`edb438ad5c9847728fcbd7d9dcd7baa3`; these separate runs include host variation:

| Path                   | Before (ms) | After (ms) | Bound (ms) |
| ---------------------- | ----------- | ---------- | ---------- |
| No-change start        | 20.07       | 12.37      | 10         |
| Expanded-archive start | —           | 13.40      | 10         |
| One-file fan-out       | 272.84      | 242.21     | 100        |
| Ten-file fan-out       | 710.32      | 598.63     | 100        |
| Full materialization   | 1058.04     | 1112.57    | 1000       |

The new single-Git, concurrent-pair, and beneath-Git medians were 2.62, 4.44, and 3.38 ms. WSL feedback in runs
`4ce9e8ea3fa942bba430de28d9271f1a` and `e9bd7e2a79834ebda364ccd021f69231` had pairs of 10.93 and 12.60 ms,
already above the raw 10 ms budget. A Linux host-cost adjustment should use a measured Linux reference, not the
Windows 42 ms allowance, retain raw measurements, and protect the projection's own work beneath Git. This is a
recommendation, not an amendment to the criterion. The reference runner still exceeds the start budget with its
4.44 ms Git pair, so Git attribution does not close that gap. A3 remains held; A4 below records the qualified bounds.

`readChangeEnds` also treated every live-tip edit as a lifecycle move and enumerated unchanged archive endpoints.
Its membership check now leaves those snapshots cold when both live endpoints exist; changed end records, changed
origins, and live membership changes retain their archive evidence. The native missing-archive-tree regression
returns the same live changes before and after repair, and 82 lifecycle cases retain creation, reopen, retirement,
repeated-ending, and unavailable-history behavior.

The final eleven-sample run, `334880664e4646cc95ceeca70a1c47cb`, measured 12.94 ms start, 19.22 ms expanded-archive
start, 217.42 ms one-file fan-out, 567.38 ms ten-file fan-out, and 1122.57 ms materialization. Process counts remain
9/27. Baseline Git single/pair/beneath medians were 2.76/4.56/3.55 ms; the expanded fixture measured 4.39/8.27/4.56 ms.
The expanded-start difference remains unresolved; its own baselines also changed, so this run does not establish
archive-growth independence. The runner reported one active job, no memory pressure or swap traffic, and low I/O
pressure; no cause is assigned to the variation. No budget is closed by these measurements.

The Spike 4 tripwire prototype timed the file work alone, with the Store read outside the timer. Its 20 siblings used a
simple exclusive-create lock, an index publication, staged 4 KB files, replacement, and a separate end check: 3.3 ms for
one file and 13.4 ms for ten. The native measurement includes the writer as a twenty-first root and the full propagation
round: Store version and changes, configuration and roster, protection and layout validation, recovery intent, partition
encoding and publication, and file replacement. The difference is therefore partly a measurement-boundary and protocol
difference; it is not evidence that serial scheduling alone explains the gap.

A diagnostic attribution run, `8d12426922ea4e3da5c2c9dbff1e095b`, kept roots sequential and compared one root with 21
roots, at one and ten files, eleven samples each. Wrappers time real phases and filesystem calls, so these absolute
times are diagnostic rather than qualification.

| Instrumented path                       | One file (ms) | Ten files (ms) |
| --------------------------------------- | ------------- | -------------- |
| One-root round                          | 32.18         | 95.26          |
| Twenty-one-root round                   | 209.82        | 573.65         |
| First root's lock scope, 21-root round  | 24.61         | 102.51         |
| Remaining twenty lock scopes, total     | 160.33        | 442.79         |
| Store changes, once per round           | 10.63         | 26.30          |
| Store record reads, shared across roots | 4.69          | 49.82          |
| Index publications, 42 per round        | 54.64         | 55.68          |
| Refresh scopes, total                   | 81.71         | 425.51         |
| Swap scopes, total                      | 41.79         | 149.30         |

The phase timings are nested and must not be added. Store record calls remain two for one changed owner and twenty for
ten, independent of destination count, and physical Git starts remain 9/27. Destination work scales: the 21-root rounds
make 510/2,625 `lstat` calls and 189/378 writes totaling 8.18/8.36 MB. Each root rewrites its roughly 192–195 KB backlog
partition twice, for intent and settlement. Publication alone accounts for about 55 ms; it does not explain the full
residual. No scaffold-pruning call occurs in either measured fan-out: staged-file removal defers ancestor pruning while
the old aside copy remains. The additional twenty lock scopes are the measured scheduling opportunity; the trace does
not prove every operation inside them necessary or predict a concurrency speedup.

The intent publication's obsolete-partition collection is another serial consolidation candidate. In the same trace, the
interval from its final directory read through publication return totals 3.47 ms for one file and 3.54 ms for ten across
all 21 roots, including any return overhead. Deferring that collection cannot close either gap, so its existing behavior
remains. A3's remaining candidate is bounded scheduling of independent destination visits, preserving both durable
publications and per-root checks; these results neither authorize that locking change nor establish that it will reach
100 ms. Start, expanded-archive behavior, and materialization remain separate open costs.

### Paired settled-archive comparison

Run `2ba0b6ef905c408ea51b8e67686e7bbe` on the named Linux reference runner `m5-air-ac` (Node v26.3.0) measured eleven
standard/expanded pairs in one process, alternating which fixture ran first. Every pair also measured the beneath-Git
path, concurrent configuration/version calls, and one Git call for both fixtures. Both were prepared and warmed before
collection; the standard fixture has 800 files, the expanded fixture 60,320, with identical hot files, owner counts, and
four archive quarters. `pairedStartMedians` retains each pair's order and differences alongside all raw samples.

| Path                               | Standard (ms) | Expanded (ms) |
| ---------------------------------- | ------------- | ------------- |
| No-change start                    | 14.57         | 14.64         |
| Beneath-Git index, walk, and stats | 3.52          | 3.55          |
| Concurrent Git pair                | 6.06          | 5.94          |
| Single Git call                    | 3.41          | 3.39          |

The median paired start difference, expanded minus standard, was −0.27 ms; individual differences ranged from −1.63 to
+3.73 ms. The earlier unpaired 19.22 versus 12.94 ms difference does not reproduce under interleaving. This supports
independence from settled archive entry count at four fixed quarters; it does not establish independence from an
unbounded number of quarter descriptors. The existing invalid-archive-partition test separately checks that ordinary
start and end do not decode settled archive bytes. No production correction is justified by this comparison.

The same full-round run measured 212.25 ms one-file fan-out, 580.00 ms ten-file fan-out, and 1142.08 ms materialization.
These raw medians calibrate the proposed criterion amendment; they do not close the current bounds. A 15 ms start budget
would keep the existing 20 ms start tripwire; proposed 750 ms fan-out and 1500 ms materialization bounds would add an
explicit engineering allowance of roughly one third over the native full-round medians. These values are proposals only.
The existing criteria remain intact, and A3's concurrent-root locking change remains held.

The cold-partition regression also passed both cases in run `0ca0fbd16ef046cea5e4de71e7ebef2b`: start and end succeed
with deliberately invalid bytes in the settled 60,000-entry partition, leave those bytes untouched, and retain
late-mismatch containment. The interleaved native measurement and this independent filesystem failure check provide the
evidence for keeping settled archive entry growth out of the criterion rebase.

## A4 — Full-round performance calibration

The approved rebase replaces prototype-derived bounds with platform-specific full-round measurements. A3's
concurrent-sibling proposal stays held. The earlier proposed 15 ms Linux start bound left almost no run-to-run margin;
the one-third allowance over the 14.64 ms expanded median rounds upward to a 20 ms start budget, with a 25 ms tripwire.
The Linux fan-out criterion is 300 ms for one file and 750 ms for ten, with one 750 ms runtime fan-out tripwire, and
materialization 1500 ms. Windows and macOS receive same-build native calibrations of their own before capture, with
roughly one-third allowance and raw times retained. Author checks only were selected; no independent amendment review
was requested.

### Superseded statements

**Goal 5:**

> 5. **A command's cost grows with what changed, never with how much state exists:** the projection's no-change overhead
>    stays within 10 ms on Linux and 60 ms on Windows (§ 15).

**§ 15.3 opening:**

> The projection's no-change overhead stays within 10 ms on Linux and 60 ms on Windows. The Windows figure assumes a Git
> call costs what § Spike 2 measured, about 42 ms, a cost the projection does not set: a host whose Git calls cost more
> holds the projection to its own share, its median read less the amount by which those calls' host time exceeds 42 ms a
> call or, where longer, the projection's own work beneath them (Success Criterion 4). macOS takes Linux's bounds, here
> and at every tripwire (§ 15.4); the spikes measured Linux and Windows alone, so the portability lane's macOS runs are
> what first test them there.

**§ 15.4 bounds and reading:**

> | Tripwire               | Linux and macOS | Windows | Set at                                      |
> | ---------------------- | --------------- | ------- | ------------------------------------------- |
> | Command-start overhead | 20 ms           | 120 ms  | twice the budget                            |
> | One fan-out            | 100 ms          | 600 ms  | ten times the budget                        |
> | Full materialization   | 1 s             | 5 s     | about four times today's archive on Windows |
>
> The fan-out tripwire times the whole fan-out, a write's or a pull's, store reads included: today's heaviest, ten files
> into 20 worktrees, reaches its bound on Windows once those reads count, while a one-file write of a record that is not
> a primary sits far below it. A primary entry's re-lay adds a `list` whose Windows budget alone equals the bound (§
> 15.5), so a meta write's fan-out there can cross it with few files, and a cohort rename, one batch writing every
> member's meta, adds a listing per member; the median, not one write, decides, and the responses stay the same. Past
> it, the first response is writing files in parallel on Windows, then the one-copy reserve (Alternatives & Rationale);
> past the materialization bound, parallel writes on Windows. Materialization runs at spawn and at `arc sync`, not per
> command, so its bound is the looser one. On Windows each bound assumes a Git call costs about 42 ms, as § Spike 2
> measured, and a one-file fan-out makes about seven, one after another (§ 15.5): the tripwire suite reports one Git
> call's median and two calls' run at once on its host, each timed path's Git calls, and the time of the work beneath
> them, the start's index read, walk, and stats run alone; Success Criterion 4 reads each Windows median less the amount
> by which those calls' host time exceeds the longer of 42 ms a call and that work. A tripwire's notice shows the median
> as measured.

**Success Criterion 4:**

> 4. **The budget holds.** The no-change overhead stays within 10 ms on Linux and macOS and 60 ms on Windows, and at
>    this repository's size the tripwires hold: the command start, a full materialization, and a one-file fan-out of a
>    record that is not a primary into 20 worktrees each measure within their bounds on every platform, and a ten-file
>    fan-out into 20 worktrees within its bound on Linux and macOS, its Windows median recorded against the bound § 15.4
>    expects it to reach. On Windows each of these is read past the host's Git cost: a median counts against its bound
>    less the amount by which its Git calls' time on that host exceeds the longer of 42 ms a call, what § Spike 2
>    measured, and the projection's own work run beneath them, and never above its measurement. The calls' time is taken
>    from the tripwire suite's medians on that host — two calls run at once for calls that ran at once, which count as
>    one call, and one call's for each other — and the work beneath them from the suite's time for that work run alone,
>    so the projection is held to its own share (§ 15.3, § 15.4).

### Named references and same-build measurements

The calibration source is commit `1999ade81e42214e3755600cce27d8219ce87bae`. Linux run
`2ba0b6ef905c408ea51b8e67686e7bbe` used snapshot `045690c7017686ff8752226ebae2daf10ac6130f`, whose package, scripts,
package manifest, and lockfile trees match that commit exactly; its controller head was `6cc7816eba` before the paired
benchmark commit. Git comparison confirms no difference over those build and timing inputs. The later Linux repeat runs
directly at `1999ade81e`. Windows and macOS ran the same published commit in GitHub diagnostic run `43055778612`, whose
timing-only input makes it measurement evidence rather than work-unit verification.

| Reference                    | Environment                                                                               | Measurement record                 |
| ---------------------------- | ----------------------------------------------------------------------------------------- | ---------------------------------- |
| Linux `m5-air-ac`            | Node v26.3.0                                                                              | `2ba0b6ef905c408ea51b8e67686e7bbe` |
| GitHub `windows-2025-vs2026` | Windows Server 2025 Datacenter; image 20261103.298.1; Node v26.13.0; Git 2.56.0.windows.4 | job `130645276573`                 |
| GitHub `macos-26-arm64`      | macOS 26.7.2; image 20261102.0473.1; Node v26.13.0; Git 2.56.0                            | job `130645276469`                 |

| Full operation, raw median (ms) | Linux   | Windows | macOS   |
| ------------------------------- | ------- | ------- | ------- |
| Standard no-change start        | 14.57   | 107.40  | 31.79   |
| Expanded-archive start          | 14.64   | 106.91  | 32.04   |
| One-file fan-out                | 212.25  | 2045.27 | 439.18  |
| Ten-file fan-out                | 580.00  | 4442.52 | 2062.64 |
| Materialization                 | 1142.08 | 5934.73 | 2902.46 |
| Standard beneath-Git work       | 3.52    | 18.12   | 15.30   |
| Standard concurrent Git pair    | 6.06    | 88.22   | 19.24   |
| Standard single Git call        | 3.41    | 71.96   | 17.56   |

The paired expanded-minus-standard start medians were −0.27 ms on Linux, +1.49 ms on Windows, and −1.09 ms on macOS.
Expanded beneath-Git medians were 3.55, 17.54, and 15.17 ms respectively. These do not show a repeatable archive-entry
penalty at fixed owner and quarter counts. The invalid settled-partition test remains the separate proof that start and
end do not decode those bytes. The source does still inspect the finite set of header descriptors, so these measurements
do not claim independence from an unbounded number of archive quarters.

### Repeat variation and the bounded start probe

Same-head Linux repeat `ebb4b3dc59304f17a7087717deb482e5` on `m5-air-ac` measured 17.94/19.77 ms standard/expanded
starts, 225.09/567.64 ms fan-outs, and 1092.99 ms materialization. Its standard/expanded beneath-Git medians were
4.55/4.97 ms, Git pairs 7.99/6.52 ms, and singles 3.82/3.76 ms. Starts fell toward 13 ms late in the run; the slower
expanded median is retained, not replaced by a favorable subset. The runner reported one job, no memory pressure or swap
traffic; no particular cause is assigned to the cross-run variation. It fits the rounded 20 ms start bound but
demonstrates that an engineering allowance is not a stability guarantee.

A bounded diagnostic, `1d17c41df1064b828fdcc94bc52091ff`, kept fixture preparation and the eager full-index correctness
assertion unchanged, then measured three consecutive blocks of eleven counterbalanced standard/expanded start pairs. It
recorded heap and GC event times without forcing GC, and moved ancillary baseline measurements outside those blocks.
Standard/expanded block medians were 13.76/13.45, 13.27/12.97, and 14.10/14.16 ms; paired effects were −0.30, +0.14, and
+0.19 ms. Observed GC overlaps, about 0.8–1.4 ms, affected both fixtures. All blocks and samples were retained. This is
diagnostic evidence against a stable archive penalty, not proof of what caused the slower full-suite repeat or a
substitute qualification run.

The unpinned same-head Linux run `100013b6ea524bb7bf33cd681ce7e60b` ran on M4 and is additional feedback, not the named
reference: starts 17.21/17.64 ms, fan-outs 238.95/649.27 ms, and materialization 1211.87 ms. No production archive
change is justified by these comparisons. The native timing suite's legacy Windows adjusted values are not used for A4:
they estimate startup credit from counts, while A4 requires demonstrated exposed delay and otherwise zero credit.

### Bounds, propagation, and author checks

The captured budgets are Linux start 20 ms, one-file fan-out 300 ms, ten-file fan-out 750 ms, and materialization 1500
ms; Windows 145/2800/6000/8000 ms; macOS 45/600/2800/4000 ms. Start tripwires are 25/200/60 ms, and each platform's one
fan-out tripwire takes its ten-file bound. These round the approved approximate one-third allowance over the calibration
points; the Linux rounding follows 14.64 × 4/3 = 19.52 ms. Raw notices and all slower repeats remain visible, and no
startup-count discount is used to manufacture a passing result.

The author coherence and grounding pass covered § 15.3–15.5, Goal 5 and criterion 4's forward supersession, the new
criterion 11, task 1.12.R and the affected task-criteria projection. `launchProjectionStart`, `readProjectionIndex`,
`createProjectionReadMemo`, `createRefReadCoordinator`, `runProjectionFanOut`, `commitProjectionIndex`,
`recordProjectionTiming`, and `projectionTripwires` ground the operation boundaries, cold-partition behavior, sharing,
reader lifetimes, publication ordering, and notice semantics. Source comparison confirms the original Goal 5, criterion
4, and task 1.12 Goal remain verbatim. The new task's code loci exist, ordering puts the capture before corrective work
and all correction before 1.14, and its reporting rule supplies no unmeasured Git credit. Lease, save-preservation,
ownership handoff, and sequential-locking obligations remain. The selected author-only review adds no independent pass
record.

Implementation follow-through centralizes the limits in `projectionPerformanceBounds`, consumed by `projectionTripwires`
and the native timing report. Behavioral red run `6ed4e7abf153451a8f2c2e0e9c89ab36` rejected the old notice boundaries;
green run `fe8ae10e7d8e47059404a88960d28a2b` passed all 19 timing/status/publication cases. Native report run
`e94e514dba404f4a9bd60eda0efbaa6d` measured 14.73/15.50 ms starts, 211.03/574.17 ms fan-outs, and 1160.70 ms
materialization on M5. Its limits are the calibrated Linux values, its Git credit is explicitly zero and not
established, and every qualified median equals its raw median. These are incremental implementation checks, not segment
or work-unit verification.

### Owner direction for 1.14 — 2026-11-11

At 1.14, if the Linux reference's same-run Git timings are above the 2026-11-11 calibration, classify the timing run as
disturbed and repeat it rather than count it as a performance failure. The 19.77 ms expanded-start repeat, whose Git
timings also rose, is the example. Keep its raw measurements as diagnostic evidence; the repeat does not change the 20
ms start budget.

Compare against calibration run `2ba0b6ef905c408ea51b8e67686e7bbe`: standard Git single/pair medians 3.41/6.06 ms,
expanded 3.39/5.94 ms, using the raw record's precision. A start above 20 ms with normal Git timings is a real failure
and stops. This is the Owner's direction for judging the timing evidence, not an exemption for functional or
quality-check failures.

### Native cross-process save placement

The burst suite gives twenty linked worktrees distinct engine processes over the ref backend in each layout. An
editor in process N holds a handle into process N+1's root, wrapping at twenty, so a save reaches another process's
replacement or removal. Every required swap hook pauses until all twenty arrivals and completed saves are acknowledged;
the writer's fan-out instead rendezvous at each root's serial visit. Rebuilds create the absent path, and fan-out
editors rename their saved file over the path. The added fan-out observer changes no lock or visit ordering.

The oracle reads current store content, current projected files, and aside files named by the current index after all
engine operations finish and editor handles close. It matches each complete saved entry. A file must remain pending,
and an aside must remain pending or be reported by its exact copy name; unindexed debris and historical store content
cannot count. Each saved entry is absent from the initial fixture, and every save requires its own acknowledgment.

Fail-first run `c3c6160df2d94647a6f5b33a601c8d46` rejected both layouts when the fan-out observer was absent: the engine
completed without reaching the required hook. Run `46d8b1209d334fae8ac73ef9c0d33cd2` rejected all twelve replacement,
removal, and rebuild cases with missing-save assertions against snapshot `e3013cd2e494f43afb50a5e2519a2c30116275b2`,
which temporarily discarded moved copies and overwrote files recreated before the rebuild link. Those changes were
reverted. Oracle reconstruction `3485d5d7609743a481bd4874d032fbcf` rejected unconditional preservation; restored run
`f7ae08b6f5fb4579a45f86e28bb15638` passed both negative cases, including an unindexed, validly named aside file.

The initial simultaneous TypeScript startups exhausted M5's 5 GiB runner limit. Startup now waits for each process's
readiness before spawning the next, and the child imports the store constructor directly; all twenty remain alive for
the concurrent engine operations. The four corrected removal cases passed on M5 in run
`1baffebdde7f44439d673903a2c16d92`, with twenty completed saves retained in every case.

Restored full run `764794cda1ee4346be28f7472a4155bc` passed all sixteen native matrix cases and the isolation regression.
The isolation case separately failed before registration in `a011e8740b8848cdac573d07bdacec09`, then passed in
`3150d274ca4542ea98a4cccc9e6b4568`. These runs establish local task feedback; the task's dispatched portability and
Linux evidence is recorded with its completion.

#### Oracle hash boundary

The completed-copy comparison in `observeAsideCopy` treats bytes matching `moving` or `landed` as no edit, which
settlement deletes. A pending parent entry therefore cannot alone establish that a copy remains a recoverable save.
The approved correction excludes both hashes before counting an indexed aside as evidence. It hashes raw bytes in the
index's object format and retains complete-entry matching and the pending/report condition for edited copies.

Regression run `8aac4ed1020e49efbb43671f1d3729c4` exposed all four false greens in the two layouts. Positive
reconstruction `e8e7f0b1cfff475584488b0dbfd7c7d4` failed both edited-copy cases when every aside was rejected. Corrected
run `8b6c9dc2e84d42c595924e578341e2b3` passed all six cases, each checked against the production read-only observer.
The initial interrupted attempt, `e395d1c372fe46bca2f59a9991edc84c`, retained no result and is not evidence of a pass.
The complete corrected twenty-process suite passed all twenty-two cases in run
`52fb7151e6fd435b9bfadf0443449634` on M4, covering both layouts and every required rendezvous.

#### Filesystem aliases at fan-out

Hosted diagnostic `43124035152` at `73174e0ab5` exposed the Windows failure precisely: Node's temporary directory
used the `RUNNER~1` short spelling while Git's roster returned `runneradmin`. Lexical normalization cannot identify
those as the same checkout. The native Windows repeat `ee04be2cb9e2474fbaf11cbe4886708c` passed because its isolated
temporary root had no such alias; that repeat alone did not explain the hosted failure.

The mismatch also exposed a duplicate writer visit: fan-out visited its entering path, then visited the same Git
directory again under the roster's spelling. Native directory-alias regression `064852eea5784c1db9efca88107c337a`
reproduced three visits for two checkouts. Fan-out now compares physical Git-directory identities, resolving the
writer's identity once per round. The burst oracle matches physical roots and rejects repeated root identities, so
an alias cannot count as a distinct destination. No lease or scheduling policy changes.

Corrected native run `d430ed45dcf24269a593351a5e3564f3` passed the alias, write, remote-merge, publication, and separate-Git
cases; Windows run `afa33e0a2a31407dbb68739d2b232e1d` passed all three native ref cases. Full fan-out regression
`614e8f1fee5e48dfa052f74b17cc418e` passed all 51 cases across fourteen files.

#### Dispatched native qualification

Run `43126888591` passed at `4c81df9ec8fa9652d20c6039c32a0bed73f3e3ff`. Its named-file pair ran the complete burst
suite, timing-isolation regression, and native fan-out cases: Windows job `130881625326` and macOS job `130881625356`
each completed all 26 cases, including all 22 burst cases across both layouts. Linux portability job `130882073727`
also completed all 22 burst cases and timing isolation within its full selected tier. The named-file input scopes
this evidence to task qualification. The final local burst/isolation run was `abfbe9d95f884b9a84617475b692f725`.

### Physical Git-start assertions after reader reuse

Dispatched run `43116874002` exposed stale exact-process assertions in Store Suites 1 and 6 after recursive tree
enumeration moved onto the operation's persistent reader. The native lookup trace starts `for-each-ref` and one
`cat-file`, with root resolution, tree traversal, and ranking blobs exchanged through that same reader. An unchanged
lookup adds only `for-each-ref`; a changed tip adds both again, giving cumulative counts 2/3/5. Direct UID reads stay at
one start, listings take two, and a read followed by two listings takes 1/3/5. A cold listing's retained token also
needs `mktree` and `update-ref`, giving 4/5/7 for listing, version, and repeated listing.

The completed/Errand/claim lookup test previously counted `rawExec` invocations as processes. Its additional tree
request is an exchange with an existing reader. It now counts the native executor's start callback and requires
cumulative 2/3/4 starts while retaining each returned-record assertion. Reconstruction
`46c193cf142a4c83876a9cb2ef9281f6` failed at five physical starts when each batch request was forced to bypass the
reader. The live-lookup failures reproduced in `f91b814752ac47e4b73ffac9784144e8`; corrected full run
`57513c59b9ba449d8c3e3638ea4d7d4b` passed all 64 cases across the four affected files. These corrections tighten the
process bounds and repair the measured quantity; no production read behavior or acceptance budget changes.

### Segment scenario and ownership recheck

Base merge `63d619fc93` includes `main` at `ec3f511ba136d5536469879411dabecbf3531e45`. The timing-isolation overlap
preserves the incoming nested-run timeout helper and the projection-burst registration; the generated ROADMAP was the
only conflict, resolved through the existing regeneration command. The lockfile did not change.

`full-round.test.ts` exercises one reference-backend namespace and one real linked repository: marked worktrees
materialize their exact current/in-flight layouts, an owner saves notes, the reference remote publishes a change,
the pull fans it out, registered `sync` restores a deleted file, and an expired refresh anchor rebuilds current content.
The initial author run `756b9d43a0644ea18f0df9398f323ce2` incorrectly expected same-owner in-flight notes to be protected.
`workUnitRights` and § 16.3 reserve checkout-specific protection for meta and task lists. Amendment entry step 1 kept
the design and task outcomes intact; the verifier expectation was corrected to the existing rights contract.

The scenario rejects independent omissions of bound materialization (`2de8f1c53c184e4a8b8d68b096950ccb`), sibling visits
(`30efed38c548436d8cc35d0a2e5a63ab`), pull notification (`3ea8e5cac4704484a1b6587f12941be2`), sync restoration
(`195f65a826f9480a905e31c07b6f625a`), and expired-anchor rebuild (`0d60ed4ca48d4ad9ab6802e9ceaefe60`). All temporary
source reconstructions were reverted before the restored run. Run `9e50d4738a5945f697696e7f5e430148` passed the combined
scenario, full materialization/layout suite, path reuse, and refresh retries. Claim-only retries and the interrupted
A → B → A layout cycle passed in `22f45ef2137242f7ab6554b7da2c2f6c`; interrupted unstamped installations and write-back
handoff refusals passed in `f97f53e6e6f84ecc9ecbcc5452a23bb9`.

#### Segment timing qualification

The segment's common source head is `8618d5b9277c143038cb2ae4c0c102c98c94532b`. Linux reference run
`f148db31f906455ea075a3a6c09ff531` used snapshot `1b65d7b3ff0b756ccab0b1e4fe825e4d8f5e307b`; its package,
scripts, manifest, and lockfile inputs match that head exactly. GitHub diagnostic run `43136508996` used that head
directly. Its nine selected files passed on both native platforms, including the complete linked-worktree scenario,
reprojection, ownership handoff, and unreadable-cold-partition cases. This diagnostic run is not work-unit verification.
Its Linux portability job `130913765752` also executed the complete scenario and all twenty-two projection burst
cases, in both ref-store layouts; the isolated timing-lane check passed alongside them.

| Complete operation, raw median (ms) | Linux `m5-air-ac` | Windows `windows-2025-vs2026` | macOS `macos-26-arm64` |
| ----------------------------------- | ----------------- | ----------------------------- | ---------------------- |
| Standard no-change start            | 13.05             | 113.30                        | 67.50                  |
| Expanded-archive start              | 12.80             | 117.54                        | 83.67                  |
| One-file fan-out                    | 208.21            | 1042.17                       | 409.44                 |
| Ten-file fan-out                    | 560.53            | 3996.50                       | 1349.67                |
| Full materialization                | 1070.35           | 5209.53                       | 1946.96                |

Every metric retains eleven raw samples. Git credit is zero and not established; qualified times equal raw times.
Linux's same-run single/pair Git medians were 2.968/5.058 ms standard and 2.906/5.052 ms expanded, below calibration
at full precision, so the Owner's disturbance rule does not apply. Its paired archive effect was −0.043 ms. Windows'
paired effect was +3.913 ms, with mixed signs; its beneath-Git medians were 28.466/28.499 ms. Linux's beneath-Git
medians were 3.496/3.513 ms. These comparisons do not show an archive-entry-dependent filesystem cost at fixed owner
and quarter counts.

macOS missed the unchanged 45 ms start bound. Its single/pair Git medians were 34.013/30.232 ms standard and
36.356/29.046 ms expanded, compared with calibration's standard 17.56/19.24 ms. Beneath-Git medians were
24.444/28.492 ms, and the paired archive effect +2.120 ms with widely mixed signs. These observations establish no
exposed-delay credit and identify no cause. The first result remains a miss, with all raw samples kept. The Owner
approved one same-head timing-only repeat on 2026-11-11, retaining the 45 ms bound; run `43139555055` collects it.
Both invocations already isolate the timing project through `vitest.config.ts`; no overlap with the functional files
is claimed as the cause. Task 1.14 remained open for that repeat.

Run `43139555055` completed both timing files at the same source head on the same named images and image versions as
calibration. macOS job `130923278006` and Windows job `130923277985` fit every raw bound, with zero Git credit:

| Complete operation, raw median (ms) | Windows | macOS   |
| ----------------------------------- | ------- | ------- |
| Standard no-change start            | 81.33   | 35.01   |
| Expanded-archive start              | 80.13   | 37.53   |
| One-file fan-out                    | 671.79  | 527.87  |
| Ten-file fan-out                    | 2936.03 | 2060.86 |
| Full materialization                | 3178.83 | 3307.82 |

macOS' standard/expanded single Git medians were 16.993/17.403 ms, concurrent pairs 20.726/20.171 ms, and beneath-Git
work 17.593/17.062 ms. Windows' singles were 57.183/56.778 ms, pairs 64.711/65.103 ms, and beneath-Git work
12.132/12.104 ms. The paired start effects were +1.557 ms on macOS and −0.761 ms on Windows, both with mixed signs;
paired beneath-Git effects were −0.585/−0.094 ms respectively. Together with the cold-partition test, these do not show
a systematic archive-entry cost at fixed owner and quarter counts. Both raw runs, all samples, and baseline records
are retained; artifact digests and all eleven metric medians were checked independently. The repeat qualifies through
the Owner's explicit direction. It demonstrates intermittent performance variation, not a repaired cause of the first
macOS miss, and changes no limit or locking decision.

### Removal-check read boundaries

`checkProjectionRemoval` reuses `bindReadOnlyProjectionRoot`, which already supplies fresh target layout, rights,
local capture, and a non-creating actor read. The check reads every index partition with its lock-free retry, and
`readRemovalProjectionRoots` includes personal roots left by earlier identities. `checkProjectionRemovalFiles` uses
ordinary change detection and the bound feasibility preparation. `ProjectionSubmissionResult` retains the planner's
`nativeRefusal` flag; `prepareProjectionFeasibility` carries it forward. `observeProjectionReads`, shared with
`createProjectionPreparationView`, also retains Store failures that protection helpers present as ordinary marks.
The check uses only this failure observation across its stages, leaving version consistency inside each admission
preparation, so changed authority remains a local admission conflict rather than a fabricated failed read.

The initial behavior pairs are: missing index `919db593743c4d6fbde039e0613bfe80` →
`2146a1d5934c46ec824641dbb4fee6ed`; missing identity `60f0ee2083234843bd7eec48bc63c034` →
`c46536b928cc46d5b751b1bdf13b0adb`; target identity mismatch `bc805c9ebc34453cb533838b056c4b2d` →
`7f6b7e1ec5704396a31608d349d05248`; malformed marker `9d5405885eec44e599117218b4804359` →
`c1c1b5b9e3df42ecb57038d7e07913ca`; and protected edit `ccba0e356f244d63acac9aff7ed7382e` →
`0e5f86be0de94aad97c59560b1c9cfad`. Each rejects the unsafe or unobservable state and succeeds after its repair.

The valid-edit control `6719c9df56534a69a14bda436cc7c55d` rejects an omitted ready-admission path; restored run
`3b912b921cfa44bf84c1c090ae5ea085` passes while the target's real lease is held. Store version, file bytes, index,
lease file, and registered roots stay unchanged, and no machine ID is created. Admission read failure
`cb8e8adabc3b452cb83341ede078ef92` → `5ba829485ae4478abe783931d3b7ce68`, filesystem failure
`b0f312bf7a724aa18830971a1e03cfee` → `0006a932885149d6b5610647541dc3ac`, and rights-read failure
`fcb293e1b32d4e2a88f3e54672712312` → `665567bd0adb4f34bb6807df75b7e7b6` preserve `unobservable` and recover after
repair. Earlier-identity edits `5e5459e6197b465c9d7ba6b7039ae876` → `a29d455268f14629a7a818e94926be13` retain that
identity's remedy. A real rebuild's withheld file `bd0ceae85864447e90247491924ea977` →
`fb812ffe28c14134959cfb43f8e7fdf9` holds removal until deletion. These are incremental checks within Task 2.1.

An actual accepted write whose read-back failed leaves the recording mark consumed by
`unfinishedRecordingRefusal`; the check holds that local state before read preparation, rather than classifying its
locally made refusal as a Store failure. Run `c0b6d01d36c341ec875a30f7aa5e04a1` rejected the prior classification;
`68107d5e506b40b7a28f78bf29cafb7f` passed the hold and save-mode continuation. Changing metadata ownership between
the rights read and admission exposed the whole-check consistency wrapper in `b2e009d249a54dcd9a55158dfe9a6e46`;
`f4fa77eb3d374f6f9cad01788ccd4e73` passed the narrower observation, refusal, restored authority, and binder scenarios.

Run `746f61f78d8a4868bb376f4827467a83` passed the existing authority, content-rule, native-refusal, and historical-control
cases affected by the observation extraction. The deleted-file control `6dfcc8f0fe1d4024b0b78091e66cf217` rejects
holding absent files merely because their index entries remain; restored run `6eb684b0f6ca4c62b32c43e2ded03935` passes
the recording exception and withheld-file deletion. A reverted file still holding unfinished recording remains held.

`inspectProjectionAdoption` shares the adopter's protection, link, existence, and primary-creation verdict, preserving
its refusal stats. `existingProjectionEntry` constructs attachment's basis without publication; the removal check
uses only its read path and serialization, never indexed capture. `resolveProjectionAdoptionIntent` shares receipt,
located-target, and backlog-owner selection, including the prospective stub's own parameter validator. Classification
remains after minting in the writable continuation; the check can classify a prospective pathname without minting it.
Unindexed foreign files fail in `c0f9cd323ac840b5bebcf7b839eb9561` and pass with the existing-adoption regressions in
`9a4e14a0eac14828be1e5c83ffef478b`. Omitting existing-record feasibility fails in
`685c612b86e34ba9b978ebdb19b29176`; `b21640f822e240afab6020e2856735c7` restores it without changing file, index,
or Store version. Prospective-owner feasibility fails in `e82798875f094205a8c181af26d14385` and passes in
`534f47666cf24dd188b874d48ce0d577`, alongside every existing native stub-mint scenario, including exact receipt
recovery and mint-before-filename-classification ordering.

Accepted adoption installation is held separately from its finished recording: ignore repair changes the guard remedy
to the save remedy, and a save completes installation. Runs `da802300d7884c18a7cf0b9160889181` →
`0fc8c1ff3c1a402c83df053d3a6dfc57` cover that continuation; `e4347d24963b40ef9a0229f6327feb4e` →
`c10fc8d6375b432f9cf650c6f74bb63b` cover the hold after deletion. Receipt observation reuses the minted metadata
reader, exact-version basis, and entry builder: `d476bb37aa534137b23bbb032a0b21df` →
`63dd9a7d167d46b195aa4315abcc4dc9`. A missing authored metadata file remains held through the same verdict adoption
uses, without changing the header or Store version: `378195b3c4704df0ac69008c6ba4478d` →
`b3a79482df744905b89aa22b4fe80730`.

Personal-container discovery observes its ancestor links before enumeration; its linked target is never walked.
Runs `8b87be53edea4155818f6c128b0900bd` → `a1139a38115640a6b715ae30d80a38e2` cover the filesystem boundary and
regular-container continuation. `observeProjectionHandoffs` shares the writer's installation evidence calculation
without publishing its result. The real ref-backed journaled-arrival case fails in
`2ee015525b6f43ad9f2633d71d03e3e4` and passes, alongside the writer's ownership tests, in
`16542999d75241049742e4222ba02fc6`; header, arriving bytes, and Store version remain unchanged.

Unfinished personal recording and installation name the previous identity's protection remedy before the local hold.
The initial installation assertion matched an identity inside a pathname and was tightened to the actual identity
instruction. Both cases fail in `7454266adfd348e0bd581647f8e79d3f` and pass, with save-mode continuation under the
owning identity, in `4423e5bca1eb44b7a2dc5b4069b59ae1`.

Recorded aside copies use `checkAsideCopy` with only its read capabilities. Successful feasibility advances
`recordWriteBackSent` in memory for later copies, without submission or copy settlement. An interrupted real swap's
moved-on edit fails in `0cef8a5823b44c068a44178ef83b60e1` and passes in `3f950cdd703a4585a00375e5ba84597b`.
Omitting aside observation fails the history-refusal and repaired-preparation case in
`f3cc85f6173345b7bfe3ad37470a0972`; restored run `3e1532ac9ee0420ca83bbe7897cd0383` preserves copy bytes, absent
destination, index, and Store version. Two edited copies of one absent path fail in
`e6d72bc23d474fd39c7f78ad63e2b793` and pass in `fd7b0df0d5c9468180f191349c66ab62`: the newer copy holds until
deleted after the older copy's provisional preparation.

`walkProjectionAsideFolder` separates typed discovery from pruning: the writable sweep consumes its directory-exit
events, while removal reads them without mutation. An unrecorded edit fails in
`1b516f60844b479f90c8a3461d44beec` and passes with the sweep regressions in
`7908a4edacd7491db6067ddeeca26299`; empty scaffolding remains. A real rebuild's withheld copy stays held even after
its bytes return to its named base: ignoring withholding fails in `f9f52afeda5d4eeaafa597699aee884d`, restored in
`459ce3b36c644de88926d752e1a8b5cc`. An empty young Markdown save holds, while a settled empty file is no edit:
`ff3b60d32ca94e51bbd5272bcabfafda` → `4bb3fdddb00044f6b8a0c4b71b753181`.

Real accepted writes, a later read-back version, and `recordWriteBack` produce retained-input copies for Markdown and
plain-text cases. The first repair fixture accidentally combined adjacent conflicting edits; the corrected fixture
uses a refreshed current basis and an independent edit. Both repaired cases pass in
`d9ab670772f243ab8f609a1628324c47`; classifying their missing local copies as failed Store observations fails in
`1ab51323b52941b18986fcc732729f03`.

Restored retained-base classification passes in `695c030a112a4c1abcd4addfc0b2d439`. Native adoption scenarios compare
removal's refusal remedy with the adopter's actual indexed refusal, then check repaired feasibility before adoption.
Prospective parameter checks fail when bypassed in `26fc5017dcbd49e0a76042e554385d13`, restored in
`ce231fe2a2cf463b81ea06b064035d65`. Missing cohort-generation and container authority fail under the same narrow
omission in `6d00a005b33143da9a7d21c437099976`, restored in `66c9bc7aa555441b810808060e90fb47`. The native fixed
personal-record case also checks new-file feasibility before its actual adoption.

Unreadable projected file, index, and marker; failed target configuration; and another-format index all fail a
local-refusal reconstruction in `b6f62fe5e7c24296afc6fc21461699db`, restored in
`e8b3c8a5b0424108bfe7e11cc4db6955`. The marker changed after binding fails a stale-layout reconstruction in
`05844f51ed9b4588a8f764187399eaca`; fresh captures pass in `e2bdefc638b14073b0d4b5faef09395d` without changing the
marker. Native refused, unparseable, and pending metadata fail an omitted read-path hold in
`8c36c620576e453ba1e02f06481f3978`; valid, held, and repaired cases pass in
`a85be6ab31b84c1eb788ea694729acb5`.

The cold-partition fixture includes both the archived record and the claim's own active metadata. Without that active
file, removing the claim leaves no former-claim bytes to withhold; the corrected fixture passes in
`606d66aa01bf4f8895dc7825e75fa20b`. It exercises all-partition reads, `arc save` rebuilding the damaged partition,
and the unclaimed checkout's deletion remedy for withheld former-claim bytes. The same run covers an index retained
without a claim and the no-index, no-identity fast path.

An unchanged conflict drawing exposed two requirements in `516b946a74484667a53104af1d84c651`: conflict evidence must
still reach preparation, and a ready preparation may preserve existing stored conflicts. Reading the file alone
remained insufficient in `9cb398c6c6fd49f196cd1b0bd213226d`; the correction compares the proposed mutation's
resolutions with its sealed subject-conflict observations.

The conflict correction passes with all 34 then-current cases in `de81d048699e468784096deae2eb557b`, and native Windows
feedback `2aea02221dcd48c69b33f5dc1d8fa4cb` passes the same cases. The cold-partition tests were strengthened by
removing the archived file before corrupting its partition, so neither a walk nor an entry lookup can discover it.
Reading only walked partitions, and consulting identity before the no-projection fast path, fail in
`17abb7b523ed4a42b580105805eb6204`; the complete reader and observation cases pass in
`a743cc23aa6f4d24a607f0e973dc4e77`.

The retained-blob case proves the ordinary read path is ready while only admission capture detects altered retained
input. Omitting that comparison fails in `e87e35413169476a8709f2f777c16a6b`; restoration and copy repair pass in
`23783cfcab954aca8084b7e9acc83df1`. Native accepted companion and inbound edits with unfinished adoption recording
reject omitted local holds in `3304227c022d4cc9bd634b3dba411447`; the restored hold, read repair, and eventual installed
continuation pass in `e23747ae300047de9fdc9a70a7f5b41a`. A conservative refusal of ready new-file admission fails
the native personal-record case in `f5ef7f0eda954812a0cd644640b67413`, restored in
`2fc28a05f0e44c89869350019b28fdc5`.

An actual interrupted plain-text swap reaches a refused history read through the supplied Store double and performs
no history pull. It passes refusal and repair in `07264ace77bb481c9cdfb45867ad9bb2`; changing failed Store reads into
local edit refusals rejects it alongside the other native-failure boundaries in
`b0f2f6a8941d48bf9d22b76e7f1db4db`. Source type feedback `58c756a2488944678822b502d0359dff` and focused lint
`5b6b2a6f342c44848bfb9f10a5646f24` passed their then-current inputs. Test type feedback
`8da42e69f426475ab71fd550706c37be` found the marker test's nullable stamp; an explicit fixture assertion now narrows it.

Aside feasibility preserves marker, native metadata-parse, and retained-base checkout-clash refusals. Omitting the
feasibility verdict fails all three in `7287d1c948d841f7b436885230ecdd61`; restoration passes in
`812bf75cfd434662aac9a9b873b99f29`. A copy beneath an ancestor link is opaque, while a regular edited copy outside a
linked destination still holds removal without reading the destination. Their exposing runs are
`d2badec7a357495a8ea19537ba04f3d1` and `a3a0185db3e940f38cc440599b71a84e`; restored observation plus ordinary
aside/sweep regressions pass in `6ba3c58ed2ab4b62a0bc9164a358a4c8`.

Two real interrupted replacements expose why the file walk precedes aside takeover: a provisionally prepared file
marks its older copies as having a later write-back, even where the file's bytes equal an old copy's linked bytes.
The asides-first order passes incorrectly in `7368696ac0ad47b69fa0d44c17b658d5`; the corrected order and in-memory
send marks pass with observation cases in `957467269af64b6aadf4a54d53947c9e`. Previous-identity repair now sends
through an actual command under that identity. Ignoring completed edits fails the other-owner archived-note case in
`a668fa90f95a499285bc3e2f6f082972`; the restored walk passes in `83fc5fad79ae49f788309fe0acf18c48`.

Indexed and unindexed file symlinks remain unread, with path-specific access failures detecting a target read.
Deliberate target reads fail in `3dc653653f764731ad9df610af478744`; opaque observation passes all ten filesystem
cases in `63697698c7934e6a9616558e0d19b982`. An unsettled empty aside needs a wait-and-retry remedy rather than a
delete instruction: `b186a801cb7041039ac7b0679ba86ddd` exposes the mismatch and
`bcd7724514b2436b97d77e3b39bae4b4` passes its settled-empty continuation with all 54 then-current focused cases.

An unindexed attachment can prepare while preserving unseen stored conflicts. The real conflicting-write fixture
passes removal incorrectly in `7d424a68fb114e26acda80c4fe6321aa`; comparing the pure attachment's open conflicts
with the read-path mutation's resolutions holds it, and an explicit stored resolution releases it. Run
`b9209463c9bf42d4a019ff1aff063fe9` passes all 55 focused cases without publishing an attachment. Fresh source types
`d948be13486040caaf048d34c6281e75` and all test-type shards `e087785fc45242e39afa2793d1ee25ac` pass that state.

The completion consultation with Astra identified one remaining provenance gap: `pendingRead` retains only a
diagnostic, so the global observer cannot identify `readStamplessFile`'s synthesized `state-unresolvable` when a
successful history listing contains neither interrupted-replacement version. Task 2.1 explicitly requires a separate
pending-read refusal field that the ordinary send does not interpret as a send refusal.

Run `aef81d9277d14f3c95e76056a29acca4` reproduces that gap: the ordinary preparation remains pending, but removal
returns `would-refuse` instead of `unobservable` when history listing succeeds with both interrupted versions'
content unavailable. The regression's readable-history continuation is written but not yet reached. The proposed
correction retains pending-read provenance separately through `pendingRead` and a base selection's held result,
and consumes it only in removal classification; it preserves the sender's existing pending/retry policy.

Broader feedback `4f72cc4d911e4c5aa85c4bbe059fd8df` passes 81 files and 750 cases: the projection directory,
changed native adoption/metadata files, native write-back and adoption continuations, and the real save-command E2E
file. This precedes the new failing provenance regression. Focused lint found the swap test's obsolete writer
constant after the narrowed read interface removed its sole use; removing that constant and import leaves all changed
TypeScript files lint-clean.

The Owner approved the provenance correction, its checks, and batch continuation on 2026-11-12. `readRefusal` now
travels separately through `pendingRead`, the held base decision, and held preparation; removal classifies it as
`unobservable`, while `heldPreparation` preserves the ordinary sender's pending policy. A second regression keeps the
current version readable and hides only the replaced version, reaching base comparison rather than the earlier
stampless gate. Omitting that path's provenance fails in `c40968fdbf0544298f2ad5406f7519f6`; restoration passes both
read-repair continuations and write-back regressions in `da8110995aa5492fbc528924716e4070` (85 cases). No temporary
negative controls remain. The completion consultation's sole finding is corrected within the approved boundary.

## Removal persistence

Task 2.1 closed in `69deff1e03889dcb45c36e27ef15189a4a7db657`; its final increment request passed seven checks and
reused four, related-unit feedback `016253f24b87478381d67a1d3b74266e` passed, and the commit gate passed four checks
and reused seven. Phase 3 verification and Success Criteria remain untouched.

Task 2.2's teardown cases compose `createStoreTeardownContext` over the lifecycle reference backend and real linked
Git checkouts, injecting the persist slot until task 2.4 composes production slots. A passing stub loses a projected
edit during actual teardown in `f1f4150845e84a888c7ef15767ec1117`; lease-bound write-back passes the initial case in
`cf87f0bc4ba04a5e8aed23a5f71c1dbc`. The fixture now proves the native ignore guard passes, installs the marker's
specific exclude rule, and uses the projection's separate shared and personal rules instead of a broad `.arc/`
exclude that prevents personal read-back authorization.

Feasibility after a refused send is insufficient: omitting the actual send-outcome hold passes ordinary and
`projection-admission` version conflicts incorrectly in `af02452e7aaa465b918d197b6ecf934d`; the restored hold and
successful retries pass in `2a235e83435d48a8af817923875eec54`. The ordinary recovery fixture keeps unchanged opening
and closing lines around its edit; replacing an entire one-line document can legitimately reach an ambiguous-base
drawing instead of the injected refusal's remedy.

A save after the first write-back is lost by a single-pass step in `3333bca2473c4cc89b609a51e12350ee`. The bounded
three-pass file recheck passes with the qualified fixture in `32d10fcc88274ae388e8c3292793a9b3`. Omitting that loop
loses a new file created after the walk and wrongly removes a checkout still changing in its last pass:
`ee59c1f794a44034bb6f3efc5b8c10d4` fails all three cases; restoration passes all 52 then-current teardown cases in
`d33538c081f24b18ace0903606aed887`, including continuation once saving stops.

An accepted edit can remain pending because its ignore guard denies read-back, even after the unsent set clears.
`04ff075349704be39c245af5167fd0c8` exposes the missing specific remedy. Conversely, a successful swap can carry an
older pending flag, so a changed accepted-input receipt plus that flag is not sufficient proof of an unfinished
installation. `writeBackProjectionFiles` now reports the actual file outcome and whether local installation was
authorized. The persist step consumes that observation, while its final check reuses unchanged-input recognition for
previously accepted bytes. `d62b2da400024f97a919618205e97c5d` passes 79 teardown and engine cases, including the
ignore-repair continuation and both conflict retries.

Direct settlement takes over live writers' copies in swap order. Omitting settlement loses an edited copy in
`841d8616f38b4dd596b9d556ce5c7588`; restored settlement passes 83 retirement, aside, and swap cases in
`131cda00048044989f7c082652e89588`. Omitting the pending-copy hold fails `0d41101292f44eddaf1768b71fc6f383`;
restoration and admission retry pass in `15a737750fdc43deba9384e4303d5cc5`. The final file observation recognizes
settled empty Markdown as deletion: `b2e6eb747fc842518e756d72acd724b9` exposes the false hold, and
`5a1cb7bfe29840238799fc09efe48562` passes after reusing the ordinary read gate.

The existing moved-on guard prevents an older buffer from overwriting its current path and prevents a second copy
from sending after the first one lands. Its temporary omission fails `e02c4e0f621a4291b914b0881a5819ff` and
`fef9bafc682c42e284eb211237072478`; restoration passes `00271580fafb4cfdbef12c28dc58f272` and
`183f332452de4720b1069bd061538c2a`. Both cases proceed after explicit deletion of the held copy.

Target identity is checked before mutation or actor creation: `ca3509464c774e41b3002e1988f63a96` exposes a Store
write before the late mismatch refusal; `0030cbf2bb4f4d34a53453f180059c19` passes with the early guard. Missing
identity retains configuration's own remedy: `e8f36e35202b40efb44a1879e77ace90` rejects a generic replacement,
and `622fee60d3aa4f92b7abf6a2b42516d0` passes refusal and continuation after configuration. The missing-identity
fixture clears both `arc.identity` and `user.name`; a nonempty name would supply a fallback identity.

An unusable header cannot authorize retirement. `866a0011b18f4695a76e5479b2e2e703` removes the checkout under a
temporary passing answer; `dada0f34b3e14f38bacc7877ec01c539` passes the restored refusal and a real save-command
rebuild followed by teardown. Persistence now marks its target retiring and drops its command binding before
unlocking; fan-out skips that mark before visiting the target. Dropping the binding alone lets fan-out recreate it
in `7a11cff3ee1b41cebd42642513a77a3f`; `5f5241f6d4f546178dc490d711531112` passes with the skip, sibling refresh,
released-lease reacquisition, and command end after physical removal.

The target uses a fresh history memo over the retrying Store. A landed receipt also invalidates the command's memo:
`3bc07cb562b5437a8b6bf2532878d95b` retains old history without that invalidation, while
`e6b93ebde1d349b9833550bc1d6af772` reads the landed merged content through the original command memo and passes
the teardown and sibling-refresh case. Receipt observation covers successful writes and batch members before a
later recording or read-back can refuse.

Real failed read-backs produce unfinished accepted-input recordings for the removal cases. Replacing their specific
read-back and retained-copy remedies with a generic refusal fails all four recording/base cases in
`1385b28288474c508506a5bd736a6f7f`; restoration passes all 66 then-current cases in
`247a91654215472d89cf106ee34e08f9`. A missing retained base holds both Markdown and plain text without changing
their authored bytes or Store version; restoring it permits persistence and physical removal. A recording likewise
finishes after either its retained input or its refused Store read is repaired.

The history-retry wrapper is required for both an archived file's batch and stamp-loss recovery's history read.
Omitting it fails both teardown cases in `af4285984a82461f8047fd3284d96e5c`, naming the missing history ref;
`b6ae28ad0d0841c2b5e76b9a08c106fc` passes after restoration. The history-read case observes the refused read before
the named pull, and both pulls run while the target lease holds. The archived edit survives, including an independent
remote footer in the stamp-loss case.

The final check must perform settlement, not merely prove an edit could settle. A recorded copy left opaque as a link
can become an edited regular file at the final hook; `faac03b84b344b56891656393de15dbe` removes that save without
landing it. Re-observing recorded copies and taking another bounded pass preserves it in
`902bb0b24ca3413c8bc8e1748448edfc`. The original link target remains unchanged.

Resolution selection and alias checks now consume intent only in its command checkout, matching the binder's
already-scoped resolution reporting. `d6b37ffa692b4f669eb64effd9be29a2` applies another checkout's conflict token to
an ordinary same-path edit and refuses it. `82bd6a5b1ec24212a1a6de7c3f072874` persists that edit and removes its
checkout while the first store's actual conflict and unaccepted selector-produced intent remain.

Native held and replaced leases both prevent retirement. A temporary passing answer for either state falsely removes
the target in `0438a6d8ae854501b14958cfb772458c`; restored refusals, holder release, and ownership repair pass in
`ab8219eb53124f98b12d5949aa550cee`. The test's 100 ms override permits observation of the live holder; a zero wait
can legitimately report no observed holder. Production still uses the lock's ordinary 10 s default.

Omitting previous identities from the root walk loses their edit in `7d2d6714556c46a38545dee917a7f0ae`. Restored
discovery passes the hold and save-under-owner continuation in `583a5a4932b4409baafd86f31f6e1ef0`; the reference
backend's admission identity changes alongside Git's configured identity for that save. A temporary skip-switch early
return loses the target's edit in `e6d2c3ad16b54dacad92fb905ea44f14`; the same restored run preserves it under a
real skipped command start. An unprojected husk needs no identity: removing the early no-projection return refuses it
in `e2b3b5d6da8649c59981c875678aa138`, and restoration permits actual husk teardown in
`45a0b26837c64de5a2f4eb0ecb65882d`.

The ordinary rebuild's withheld-file remedy survives teardown: `5246692dc9814c0b8d025e1fd4473ed4` rejects a generic
replacement, and restoration passes refusal and explicit-deletion continuation in
`03efdf73af7c4fefbc5daa5e5afaca73`. An unclaimed husk still persists an existing index; treating eligibility alone
as a passing answer loses its pending edit in `4da45e7ad97242229a3aae6973f33e20`, while
`d65319a5cbe949d6a946d51ff66f6685` persists the edit before actual husk removal.

Accepted adoption resumption uses its retained reference and version. Omitting the read-back continuation returns the
wrong recording remedy in `d575328cd1e2447a8983734d9ccd5640`; restoration passes the refused read, repaired
installation, and unchanged accepted version in `7401a36717cb47578135c591dd07f860`. The composed removal check
continues to hold a recording left before removal starts: bypassing that check falsely permits teardown in
`b0b80d75617049619f1d6891e34bc9da`; `9a0956346a3e4580801c54d1f0847f33` holds it until a real save command
finishes recording, then removes it.

The native path-reuse fixture supplements the reference-backend teardown cases with actual ownership arrivals. An
ambiguous late save initially returned the generic changing-files remedy in `6ec4b53ac47e45e0b7a3ed235feb4b7a`.
Keeping a withheld bound file in the unsent set returns its deletion remedy; deleting those bytes then permits
persistence without a Store mutation. Omitting lease-bound handoff reconciliation instead refuses an already
installed arrival in `66b91c3848f7451096c98e782ba28530`. Both outcomes pass after restoration in
`7c75b56787e448838c7ae988ab785a65`, with the arriving UID confirmed in the index before the command binding drops.

Retirement validates every cold archive partition even when its projected file is absent. Skipping completed groups
from an all-group read permits removal over altered partition bytes in `54f3478ec16c4633aa370fb216699a23`;
`5d65db92b1c7422aab41eaad7ffb14ba` refuses with `arc save`, then passes actual save-command repair and teardown.
The common empty-save gate also remains binding for both files and copies: treating a young empty save as deletion
falsely removes both in `8e2c4a9bfc7c4a18b747448ca09e1d9f`; restoration passes the completed-file save and settled
copy-deletion continuations in `8cb7543937264cef8c77ee92227ff2f2`.

Parser refusals retain the repair naming their file. `0b73d3a0f4c3456f85f8d05ceb6c1cf9` rejects a generic remedy at
write-back's actual record-parser boundary; `a85d402fa12e4a4b8d01b8fb770b7e5a` preserves the invalid metadata and
passes teardown after valid archived metadata is restored. A refused edit reverted to its base needs no further
write: blindly treating a pending flag as an authored change wrongly retries the still-blocked writer in
`a0616a1a2ece431cb25288de574cd832`; fresh file comparison passes removal without a new version in
`4b7e62a5095541aca829b448cd49b9d5`.

Concurrent backend writes and ordinary projection entry produce the stored-conflict drawing. Substituting a generic
conflict remedy fails `6b91b27b14a1475088e0dec662306548`; restoration passes the unchanged drawing's hold and a
hand-resolved edit's persistence and teardown in `86a47c2497ac441ea8d7aeb5280681ec`. A rebuild-produced withheld
copy stays held even if its bytes return to the base: ignoring that obligation permits teardown in
`c08f5c08ece0436ea1bcf655dda408bd`, while `6480b50248064e14a00a46b925b5033b` holds it until explicit deletion.

Unadopted prose keeps the move-to-owned-folder remedy. `3fe3874e0d984394b3687a13ae77e138` rejects a generic
replacement, and `ebfc6070728b47498ca472cb1f6182dc` passes the hold, move into scratch, adoption, and teardown.
Treating a symbolic link as a discovered file instead of an opaque link wrongly holds an unindexed link in
`6a51f3d12b1a4921a570c99c22949a71`; the restored walker is included in the broader regression request.

Before completion advice, broad regression `122fb0b1f8e341819b1cddcb43815601` passed 82 files and 842 cases, including
retirement, the projection directory, native adoption/write-back, and save E2E. Source and all five test type-check
shards passed in `e6c92979e2b6492a808e44938e75486c`; focused TypeScript lint passed for all seven changed TypeScript
files. The restored symbolic-link case passes in that broad run. These checks precede the two diagnostic cases below.

### Completion advice: final observation race

Astra's task 2.2 completion consultation found one material gap, F1. `persistUnderLease` performs its racy file/copy
observations before calling `checkProjectionRemoval`; that later read-only check can observe a valid unsent edit or
new file and answer `passes`. No send follows it before persistence reports success. The primary verified this
ordering and the provisional meaning of `passes` against the source.

Diagnostic run `a46dde9fbb8841e9a668f8f38f323d6a` confirms both variants: a save injected at final feasibility's
native configuration read is observed there, but persistence returns `persisted` while the Store keeps the old
existing-file content or has no new record. Both added cases fail on that data outcome; the other 88 retirement
cases pass. No production correction or temporary control is applied for this diagnosis.

Proposed disposition: accept F1 and move the remaining-holds feasibility check before the authoritative final racy
file/copy observations, so either late save re-enters the bounded persistence loop. Retain both regressions, run the
appropriate checks and an independent fix check, then close task 2.2 through the authorized atomic-commit batch.
The correction awaited the Owner's complete-set disposition approval under the review finding mutation guard.

The Owner approved that disposition and its independent fix check on 2026-11-12. The correction now runs feasibility
before the authoritative final observations. Focused run `4cc21a3fa57543a4929b38dc6510cd51` passes all 90 retirement
cases, including both final-feasibility regressions. Astra's bounded independent fix check confirms F1 is closed at
that boundary and reports no material ordering regression; it is not a renewed full-footprint review.

The final corrected task 2.2 footprint passed 82 files and 844 cases in `e11ccd612b8c47158bcfe4c4628410df`, source and
all test type-check shards in `80bd353fef344b93b66d1a660b989b5d`, related unit feedback in
`c17d63a308d2483e87ec6b3002e6020d`, and the increment and commit gates. Commit `27e8f1d5e1` closes persistence under the
authorized atomic-commit batch.

## Release under the persistence lease

The release reuses persistence's target configuration, history retry and memo invalidation, unregistered binding,
write-back, copy takeover, and final observations. `withPersistedProjection` runs a successful continuation before that
binding's checkpoint is cleared or its lease releases. Ordinary persistence's continuation keeps its existing retirement
mark and binding drop. Release's continuation reads native `ProjectionLocation.primary`: a primary keeps its projection
and existing command root; a linked checkout guards each indexed file for removal, including unchanged files under a
previous identity, runs the native removal swap, checks its actual copies again, and verifies physical completion before
removing recovery storage and the index header and partitions. Production slot binding remains in task 2.4.

The approach consultation with Astra selected this continuation over releasing and reacquiring the lease or copying the
persistence loop. It also identified the need for positive physical completion: a native move can fail without calling
take-in. A real nonempty destination makes the removal rename fail in `d626206e5b7d442c95709fba9c641e86`; the initial
implementation incorrectly releases. Explicit completion checking passes refusal, retention of the original and index,
and retry after repair in `827224470bc3414b81c3f853e2c51963`.

Actual take-in results retain the first refusal and its diagnostic. First- and second-check pending copies initially
lose their admission remedy in `b88aab115cc848d388527f42f42e2b06`; their observer passes both repair continuations in
`051ea3165755475e811406d7ab232db6`. The shared settlement classifier also preserves empty-save and nonregular-copy
repair routes: `998ce5fa4df54b919c138279d73ef2de` rejects the generic copy-deletion remedy for both, and
`29ad3ca33d494b67a1d138aea4a6cb40` passes completing the save or restoring a regular file and retrying.

Native primary selection and root preservation are observable after release. Forcing a primary through linked cleanup
fails both ordinary and separate-Git-directory primaries in `6a8a5b60ff9f43fca31025a32f4e4032`; restoration passes in
`0f8c358b3fa343498104130353c1f728`. The same control prevents a later Store write from refreshing the primary in
`68b33e1c57b14362be046dea2ececd9d`. The restored case observes the written record's changed mark and a save into the
refresh's copy reaching command-end settlement in `16b25e8c487c41888e847b7df5cb2dda`. The live-writer primary fixture
interrupts the real swap after linking and its first copy check, so the installed file's identity proves that deleting
its taken-over copy can clear the replacement-progress record. An interruption before linking retains that record by the
substrate's existing rule and does not establish this completion case.

A destination link created during removal initially holds release in `c7b0838a48c341af8cef92386bd0335b`; fresh
destination observations pass in `1532738cd9ab438497125bc815bb772e`. A late edited copy beside that opaque destination
then exposes an unsafe success in `314f6fa6ba7b4700bf098e07173adf6e`. Checking the remaining copies' content before
cleanup passes its retention and explicit-recovery continuation in `8ac006ab986442a793518ea322dbe5f9`. Cleanup also
removes the header's remaining partitions, including a partition kept for an opaque destination.

The shared native fixtures moved to `projection-retirement.ts`; the original 90-case retirement suite remains intact.
Release adds anchored-checkout preservation, repaired identity/index/admission/unadopted-input holds, native held and
lost leases, late adoption, previous-identity files, post-release linked fan-out, parser and local-clash return paths,
retained Markdown and plain-text bases, and primary copy takeover. The local clash uses `recordWriteBack`'s real
retained-input producer: the copy's original stamp selects accepted bytes rather than a stored base, so the actual local
merge returns `clashed`. An ordinary stale stored-base write instead reaches backend conflict creation and is not this
outcome's fixture.

Fail-first reconstruction `3dc928f8135548b18403fb5ae72982d5` substitutes only the public release's no-op result and
fails 26 of the 28 cases. The two incidentally preserved behaviors have their own controls: the primary's later fan-out
above, and the no-projection fast path, whose suppression fails missing-identity release in
`236176a9e3a947f0898de9142ef7de57`. Restored broad regression `c4070516fab847049bd24afea0cf3356` passes 84 files and 876
cases, including all 28 release cases, the original retirement cases, the projection directory, native adoption and
write-back, and save and retirement CLI E2E. Source and all test type-check shards pass in
`4cfddfe09e13460da12ed8b8e81e10de`. Focused lint's unused type imports after fixture extraction were removed.

### Completion advice: remaining recovery-file authority

Astra's whole-footprint task 2.3 completion consultation found two material linked-cleanup gaps. The primary verified
both against the release, second-check, copy-settlement, and unrecorded-copy observation code, then added two native
regressions without applying a production correction:

- **F1 — copy-ancestor links before the second check.** The release's fresh link evidence covers destinations but not
  the copy locations it passes to `runSecondCheck`. Moving the actual aside tree elsewhere and linking its old location
  to that tree in `afterFirstCheck` leaves the second check following the link and deleting its target's unchanged copy.
  The later remaining-copy observation cannot protect a copy already deleted.

- **F2 — unrecorded copies before recursive cleanup.** An unrecorded native aside copy initially holding its base passes
  persistence's final feasibility check. Editing it in a removal swap's `afterFirstCheck` leaves an authored recovery
  file outside the batch's recorded copies and the remaining-index completion check. Recursive folder deletion then
  removes that edit without sending it.

Diagnostic run `f3074df5c71b44e7aa2120e30f49555e` confirms both: release returns `released`, F1's external target copy
is gone, and F2's edited unrecorded copy is gone while the Store still holds the original content. The other 28 release
cases pass. Both new tests remain failing, with no temporary reconstruction active. Source and all test type-check
shards pass with these diagnostics in `febd6cce7d034cfea1cdb3ba84115537`; focused TypeScript lint passes for all six
changed TypeScript files.

Proposed complete disposition: accept F1 and establish copy-ancestor authority before any second-check copy read or
deletion, retaining opaque-link behavior; accept F2 and observe actual remaining recovery files after the removal swaps
and second check, preserving and refusing an edited unrecorded copy with its recovery route before recursive cleanup.
Keep both regressions, verify repaired continuations, and run appropriate checks and an independent fix check.

The Owner approved both corrections, their independent fix check, and continuation of the deferred batch on 2026-11-12.
F1 now includes actual copy locations in the fresh second-check boundary and leaves copies behind links outside
settlement. Focused run `c113a82660b84ebc9c30590e965232d9` passes that target-preservation regression; only F2 remains
failing. F2 reuses the removal check's unrecorded-copy observation through `checkUnrecordedProjectionCopies`, invoked
after linked removal and second-check settlement and before folder deletion. It freshly checks copy ancestors and keeps
the existing base-content and withheld-copy verdicts. The regression also verifies that refusal retains the marker and
index and that explicit recovery/deletion permits release on retry.

Focused run `eb3f69e66cad4709b23e5ead3c04fba8` passes all 120 retirement and release cases, including both findings.
Source and all test type-check shards pass in `89ce183bab8248b5843ee0335a5b00a7`. Factoring each unrecorded copy's
stat/base observation keeps the function inside the complexity gate without changing its verdict. Astra's bounded
independent fix check confirms F1 and F2 are closed, reports no material correction-induced gap, and confirms read
failures stop before cleanup. It is a source-only fix check of these corrections and regressions, not another
whole-footprint review or a Candidate review attestation.

Post-refactor run `a92b3a9f9a304a0bb7298a97ccf58d18` passes the same 120 retirement and release cases. Focused
TypeScript lint passes for all seven changed TypeScript files, without suppressions.

The corrected boundary footprint passes 84 files and 878 cases in `8a4d7826367c497baee8154eed546760`, including the
native adoption/write-back suites, projection suite, both retirement suites, and both selected CLI E2E files. Its
randomized save-loss cases account for 3,000 Linux saves across the three save modes, with no lost save. The final
observation-helper refactor is covered by the 120-case focused run above and passing focused lint. Task 2.3's completion
edit preserves its Goal; the final increment and commit gates close the atomic release change.

## Removal compositions

The caller inventory at `a6ea395780` matches the task-generation families in § Removal callers. No new production
family lies outside tasks 2.4.b and 2.4.c, and no production composition yet supplies concrete projection slots. The
following are construction sites, distinct from option types, default values, and transitive forwarding:

- `handlers/lifecycle.ts`: `runPark` and `runAbandon` construct the removal-check options; `runBranchTeardown` and the
  operand teardown path construct teardown contexts. The command's Store and identity are available. Operand teardown
  now delegates through `handlers/teardown-operand.ts`; the authoritative context is still constructed in lifecycle.
- `lib/work-unit/store-teardown-context.ts`: `createStoreTeardownContext` has the executor Store and command identity;
  `handlers/abandon-store.ts` and `handlers/decompose-store.ts` use it beside their removal-check options. Their check
  consumers already fall back to the teardown context's projection check when an explicit check is absent.
- `lib/work-unit/executor-context.ts`: `buildExecutorContext` owns the reconcile context inherited by start graduation,
  materialize, store materialize, park/resume, and lifecycle execution. Its resolved Store is available; its command
  identity can be null, unlike the projection slots' current context type.
- `commands/start.ts`: `runCreateNew` constructs a direct reconcile context with the Store and parameter identity.
- `commands/rename.ts`: in-repo rename constructs apply and rollback reconcile contexts with Store/identity available
  in the enclosing command. `commands/rename-store.ts` constructs store rename's checkout-move apply/rollback contexts;
  `storeRenameAdapters` currently narrows its input to `cwd` and I/O, dropping the upstream Store and identity before
  that move closure. The binding must retain those authorities through the adapter.
- `handlers/status.ts`: `composeSessionInitStatus` constructs branch-gone recovery and stale-sweep options with the
  enclosing Store, identity, and capability available. The sweep's residue and missing-folder paths already forward
  the supplied slots or their check.
- `handlers/errand.ts`: leave opens its Store inline; ordinary and partial close share an opened Store; ordinary and
  partial abandon likewise share one. Each construction has the resolved command identity. Leave authorization and
  terminal-occupancy options already carry supplied slots, including the partial paths.
- `handlers/locus-release.ts`: the handler resolves its Store and command identity but currently forwards only optional
  caller-supplied slots. Its CLI call supplies no handler context, so the handler must bind the production default.

The six direct entry points retain the same consumer ledger as the baseline:

- `checkWorktreeRemoval`: teardown, worktree reconciliation, branch-gone recovery, stale sweep, lifecycle-residue
  sweep, store-retirement sweep, missing-worktree folders, and Errand leave authorization.
- `removeWorktreeCheckout`: teardown, store teardown, worktree reconciliation, terminal occupancy's spawned-checkout
  removal, and locus release.
- `releaseWorktreeCheckout`: teardown, store teardown, and locus release.
- `checkRetiringCheckout`: in-repo and store abandon, park/resume, and decomposition's retirement checkout check.
- `clearMissingWorktreeRegistrations`: worktree reconciliation and store teardown.
- `removePrimaryTransientOccupancy`: terminal occupancy's primary removal and promotion settlement. The terminal
  path still clears the primary claim without a release slot; task 2.4.c adds that slot before the clear and branch
  restore. Promotion's separate clear is the planned in-repo-only exception; off-branch promotion rewrites its claim.

Teardown's internal reconcile contexts, the stale/residue and branch-gone forwarding, and the Errand leave/close/
abandon/partial settlement plumbing already carry optional slots. Binding belongs at the constructors above, with
terminal primary settlement adding its missing release call. The inventory itself changes no production behavior.

## A5 — verify executable and inert removal compositions

The superseded Task 2.4.b commitment was: “a test over each production context asserts it carries the projection's
slots, not the passing defaults”. The implementation obligation in § 12.2 is unchanged: all production compositions
receive the slots under the capability. Owner direction on 2026-11-12 approves behavioral coverage where the slots
execute and lint enforcement at the enumerated inert compositions, with separate inspection of Store/identity
forwarding. This is a low-depth verification substitution, captured with author checks.

`runCreateNew` supplies only `mutation: "spawn"`; the missing-folder path in `clearMissingWorktreeRegistrations` skips
projection work on an absent folder. Both rename adapters supply `mutation: "move"`, which
`reconcileWorkUnitWorktreeUnlocked` returns from before removal checking. `handlePark` refuses `stateOffBranch`
before composing its removal context, and `handleAbandon` routes that capability to `handleStoreAbandon` before the
legacy construction. A refusal test cannot distinguish missing bindings on these paths without inspecting wiring or
changing the operation. A syntax-only assertion belongs in lint rather than a behavioral test.

Required behavioral coverage exercises the production Store teardown context, executor removal, branch and operand teardown,
Store abandon, and Store decomposition. The factory's capability, identity, and mint-port cases exercise actual
slot behavior; disabled capability returns passing slots before target I/O. Task 2.4.R enforces presence on the
remaining direct start, rename forward/rollback, and legacy park/abandon constructions and records their command
Store/identity flow. Neither mechanism alone attests semantic authority on every call site.

Author checks cover § 12.2, criterion 12, tasks 2.4.b/2.4.R, their neighbors, and the source paths above. The affected
contract retains every binding and destructive-path obligation; the replacement states checkable evidence without
planning history, and the revision task follows the bindings it checks. No product behavior, lifecycle boundary,
performance criterion, or segment boundary changes. The affected-element grounding and task audit found no further
change required. The independent offer is omitted at low depth; the final reread keeps this footprint bounded.

## Lifecycle removal authority

`createProjectionRemovalSlots` binds check, persistence, and release over one resolved Store. Capability-off returns
passing slots before identity parsing or target I/O. Enabled contexts normalize an unavailable or invalid command
identity to absent authority; the target still decides projection eligibility and configuration remedies first. A target
identity never substitutes for command authority. The removal root retains its validated target identity.

`createStoreTeardownContext` and `buildExecutorContext` bind the factory, the latter closing it over its reconcile
operation. Lifecycle branch/operand teardown binds the Store and slots; legacy park/abandon takes the factory check.
Direct start and both rename adapters carry slots, including inverse moves. Optional Store injections resolve their
existing default at the composition boundary. Store abandon and decomposition inherit the production teardown context
and its check fallback.

`ProjectionCommandBinding` retains the handler-supplied minter before start can skip projection. The factory captures an
explicit minter ahead of that command port. A new command replaces the binding, so it inherits no previous minter. The
projection engine imports no handler; actual mint requests keep the retiring root's wrapped Store. Native tests mint
into the retiring Store while a distinct command Store stays unchanged.

Factory fail-first evidence: capability-off control `d0e8d6180b5442daafa6081c21233b64` fails both cases;
`8c3d12eedd6f48dd85b1db6b218e60bf` passes them. The missing enabled binding fails five identity/eligibility cases in
`db07f3b623354ca39622f5fae5455f47`; real delegation passes those and the capability cases in
`aabb43afba2047f49637e082949a532c`.

Mint retention fails without its command binding in `57de8bbbe0a347859e958ff3a52abf67` and passes in
`bd5e4355dd764cb4b3b9404e52a4b662`. Reversing explicit-minter priority fails its actual-mint case in
`1cf1a176806d4c868fc90aad820b093f`; retaining a previous command's minter fails its absence/refusal case in
`1da27d92c467406db5fea922324d308a`. Restored behavior passes all ten factory cases in
`31b6d028f78c4c6b846112e9ab06b510`. Both controls were removed.

The production Store teardown test removes the refused edit without binding in `f54de5dc60674730a0e5bb0314dc9cc0`; the
bound context preserves it and completes after Store repair in `9fca340122fc4d078bf05fbd4d3740cf`. Executor removal
exposes the same omission in `b3504c756c024564a7ae10207f657c0f` and passes after binding in
`473080e20e254516a0dde9e8c2534e06`.

Registered operand and cheap-branch teardown both remove the held previous-identity edit without their bindings in
`7545033b5cc0489cab1faea93ba68a9d`; both preserve it and remove after explicit repair in
`b996ed10a6d149ac98942a57cb1fa5cd`. A narrow control omitting the shared teardown slots lets Store abandon end its
primary and decomposition issue its terminal preview despite the held edit in `7f1e425175174421b9f39c316d0ba6e3`.
Restoring the shared binding passes both refusal/retention cases and repaired completion in
`57cbb49d82a64a4f89fcdb952d55fd5a`; no control remains.

The existing native retirement fixtures predated production binding and left projection-eligible primary and marked
linked checkouts without indexes. They now seed real empty indexes and configure their identity. The divergent
legacy-file fixture explicitly recovers its unowned flat prose into the primary before retrying; it does not bypass
projection checks or invent an adoption target. Existing lease, copy, history, marker-generation, and ref-cleanup cases
retain their assertions.

Focused run `520ea120f9be4ab8ac34b8de45508f67` passes 239 cases across twelve files: retirement, release, factory
authority, registered command compositions, rename, locus release, start/executor unit tests, and the save,
retirement-removal-check, and teardown CLI E2E files. Source type checking passes in `e92f46bed3e8415cabed46b568f9abcd`,
and all five test type-check shards pass in `1ff307128c1540fca31cb0bc5a900058`. Focused TypeScript lint passes on all
seventeen changed TypeScript files without suppression.

Author inspection confirms the inert compositions receive the factory output with their original command Store and
identity. Start uses its resolved Store and parameter identity; legacy park/abandon uses the executor Store and base
identity. In-repo rename closes both directions over one Store/slot pair; Store rename retains that pair through the
checkout adapter and inverse move closure. A5's static enforcement is recorded under Explicit policy at inert
compositions; Removal segment qualification records its revalidation.

The first related-unit request, `b4b353fcb15244afb9725cf06bb4a3a5`, ran 1,002 files and failed one held-checkout case in
`decompose-store.test.ts`. Its scripted Git boundary could not support the newly bound native projection reader. The
no-checkout case remains in the unit suite; the held primary case now runs through registered decomposition with real
Git, preserving untracked personal content and its projection while clearing the claim. A fresh shared-slot omission
control, `9c9cffac3f3b4eb3916e274b15d93d68`, fails Store abandon and both linked/primary decomposition cases; the control
is restored before final checks. Direct start also carries its resolved Store into the remaining scaffold/cleanup
continuation, so optional injection cannot select different Stores for creation and removal authority.

After restoring the binding, `6b0da08abc0143cd808f17bd5b7ad9b7` passes the five registered compositions, eight
no-checkout decomposition unit cases, and 31 start unit cases. Both decomposition variants also require completed
physical cleanup with no pending continuation. Focused lint passes for these final edits.

## Sweeps, Errand exits, and release authority

Status composes one slot set from its resolved Store and nullable command identity, passing it to both the stale sweep
and branch-gone recovery. The stale sweep forwards it to its residue sweep. Errand leave, ordinary and partial close,
and ordinary and partial abandon bind the factory at their handler constructions; their frame reads now reuse that
same Store. Locus release defaults to the factory while retaining its explicit fault-injection port.

A primary Errand runs `release(path, true)` before its branch is restored or its marker cleared. Refusal retains the
claim and reports the edit's remedy; a thrown release returns an error settlement. After the awaited release, settlement
rechecks marker generation, branch, HEAD, and primary dirtiness before clearing the claim. The primary keeps its
projection. Promotion remains unchanged: its off-branch arm rewrites the claim and its in-repo arm holds no projection.

The primary settlement unit cases first failed in `fea0e55716e34f04b42593828cf57463` (refusal and throw incorrectly
applied); adding release passed in `3af6246ef3e14bd4883ee91ffa08aa5a`. Marker/branch/HEAD changes during release first
failed in `fdfe8749ffb14f1c9bbc28ff4e4b3c03`; fresh inspection passed those cases in
`b391822ec49d43dca0b5ea5b8ddd7d0a`. The same run passes the registered locus-release refusal/repair case, whose
initial default binding omitted projection checks in `4e1b461dd4a041bfadcf4d2497550d3a`.

Registered Errand coverage opens a real primary claim over the reference Store, edits its indexed personal record, and
leaves a refused previous-identity edit. Full close, abandon and leave, and partial close and abandon, all wrongly ended
the claim in `5e0680b2386f4fffa09115c0f5b776a1`. With handler bindings, all five retain the edit and marker, then
persist the indexed prose and clear the claim after repair in `899ddbfdcd444e4d9d28ba7aca6f682f`. The retained header
uses its actual `groups` shape; the intermediate run's stale `partitions` assertion was corrected.

Native status composition initially recommended removal of a completed holder despite its refused edit in
`302c0e24051942bdb7a7bde5488715a5`. Binding the sweep makes it blocked until repair in
`899ddbfdcd444e4d9d28ba7aca6f682f`. Branch-gone recovery likewise keeps the held target as a switch destination and
makes it removable after repair. A direct native full-close fault test keeps the primary claim and Store record when
release throws, then closes after repair. Removing only the primary release and the recovery binding makes those two
new cases fail behaviorally in `8e64b09494bf43bd83f3a6a0bf0a3473`; both controls were restored. All eight native Errand
and status cases pass in `b50c21083c85489ea9e5af7f37956f64`.

The broader run `2deef49d17d84b11bb0ccce3bd0522fb` passed 34 cases, including the two Errand E2E files, but failed
11 older native cases because their projected holders had no indexes or ignore rules. The locus-release fixture now
seeds an empty index and ignores projection-local scaffolding; the preservation fixture supplies the real personal
ignore rules, allowing production materialization. No passing-slot override substitutes for their repaired fixtures.

The repaired preservation fixture's four cases pass in `0ead65894e25453997dc8b3e38faeca1`; the same diagnostic run
exposed a misplaced import in the status assertion refactor and missing scaffolding excludes in three locus fault
cases. Both mechanical fixture/test corrections are applied. Final locus and status coverage passes all ten cases in
`617c4d12aa354f90a058e93c58ac6935`. Source type checking passes in `fc1db7710f0444e98317c359d5be9ca8`.

Astra's bounded completion consultation found no decisive missing composition or authority gap. Author inspection
confirms both status paths and residue forwarding, all five Errand options and their downstream settlement slots, the
leave authorization check, and locus release's default versus explicit slots. Reinspection follows the release await
because projection success cannot establish the caller's checkout generation. This consultation is working advice,
not a Candidate review or segment acceptance.

## Explicit policy at inert compositions

A focused ESLint rule enforces explicit projection policy at the direct start reconcile, both in-repo rename directions,
the Store-rename adapter and its nested reconcile, and legacy park/abandon removal checks. It accepts an explicit
`projectionRemovalSlots` property for reconcile/move contexts and nested `removal.check` for the legacy contexts;
spreads alone establish neither. Configuration enables the rule only in the four owning production files. This is a
presence check, not proof of factory origin, resolved values, or Store/identity dataflow.

Native ESLint fixtures first failed all fourteen cases in `1952778185314f9ab67f131893ddc3d6` with the no-op rule and
no production activation. The implemented rule passes them in `d685ce7e4e2d481299e63903acdd2e37`: missing/corrected
forms, both rename directions, absent/opaque contexts, quoted properties, and actual configuration activation. The
first production lint run flagged the Store-rename nested reconcile's spread-only context. That context now carries
its existing slot field explicitly, and its private move context requires the field; apply and inverse still use the
same closure. Production lint then passes without suppression.

Separate authority inspection confirms that direct start resolves one Store and uses its parameter identity; in-repo
rename closes apply and inverse over one resolved Store and command identity; Store rename resolves its Store once,
passes it into the adapter command, and constructs slots with that command identity before both move directions;
legacy park and abandon use the executor Store, or their existing default, and the base command identity. The syntax
check does not replace this inspection or the factory authority cases completed in 2.4.b.

Focused run `f6b6c64c30ad4f6db43fc139aba19d3a` passes 47 cases across the lint, native rename composition, Store
rename command, locus release, and rename CLI E2E files. Source types pass in `9832d7cbc53b4bc8b1afa8946a2c6613`,
and all five test type-check shards pass in `75390829f15d4967a5d8362f93c83568`. A5's criterion and revalidation remain
open for the segment acceptance at 2.8.

Astra's bounded R consultation found no decisive gap in the approved presence-only scope. It independently inspected
the listed authority forwarding and confirmed that the private move type and explicit nested property preserve the
existing binding. The rule does not establish aliases, overwrite behavior, factory origin, or runtime values; these
are not claimed as lint evidence. No temporary control remains.

## Checkout-local personal surfaces

Store teardown no longer merges a linked checkout's personal files into the primary. Reconcile removal resolves its
primary destination as before but skips the legacy merge when its Store keeps state off branch. Cheap-branch husking
and later husk removal share the same capability gate, and both branch-removal reconcile contexts now forward their
Store. These paths retain the linked projection until its persist step carries the edit to the Store; the primary's
unsent projection bytes stay unchanged.

The registered teardown case first merged the linked inbox into the primary in `b55b29b34acb4d29ab51377f734e833a`.
After removing that merge, teardown preserves the primary in `0501e8522c394a1788bbb39abc95a3c7`, while the new executor
case still exposes reconciliation's merge. Gating reconciliation passes both in `189669e214db415aad0a89b9381eebbd`.
Assertions compare the primary's bytes exactly and check the stored capture's authored text; the normal inbox admission
may add its capture ID.

Cheap-branch self-husking first alters the primary in `f8801fdd7112413fa2c4ae7e4e3adca3`. Gating husking exposes the
later removal's legacy signposting in `315344c1178249caa9dc78397a64f274`; gating that merge still leaves the nested
reconcile without its Store, reproduced in `ee8d9bb1fccb4ecfaf41760d3962a5e5`. The strengthened case adds another saved
capture after husking and still exposes both captures merging into primary in `a4c38e55b08e4126b65cddc762ac47cb`.
Forwarding the Store passes all nine native lifecycle composition cases in `fead62093f77491daa04cb8730b8a4da`.

Both cleanup readers now skip legacy user-surface safety when their composed Store keeps state off branch. Status
passes its Store through branch-gone recovery's options and candidate context. Native fault cases supply real remote
snapshot/object/history evidence and projection checks while making the legacy filesystem reader unavailable. The
stale sweep first blocks on user surfaces in `37a00336253d45b5bb963f1e95fecfe8`; the corrected evidence fixture passes
that gate while branch-gone recovery still chooses switch in `cd57f696b8ce4a7a804abe428c3974f4`. Both native fault
cases and the existing projection-refusal/repair cases pass in `d4942634a2dd49e4902a91afd8c46d1e`.

The architecture table forbids projection modules' resolver and migration imports while retaining the
`IDENTITY_STATUS_FILENAME` named import. Nine native configured-lint cases fail without the row in
`d4818d4b4093461bac5cf0714e0a25c6`; all 170 architecture cases pass after it in `e45c2cd7b94a4a96828a84ee3d3dca42`.

The inbox isolation/fan-out case uses a real personal-inbox record and separate primary/linked indexes. Editing the
linked file leaves the primary unchanged; command-start take-in persists the capture and fan-out refreshes primary.
The existing engine already passes this case. An own-writes-based control is inert because a lease-held take-in queues
a round without that list; it is not fail-first evidence. Omitting primary target visits instead exposes the missing
propagation in `e47c480ed9d74468b475eca2e7b55365`. The original source is restored before regression checks. A separate
stale-gate omission also reproduces its user-surfaces refusal in `fd37f10279c74492b3154e515ee6fac1`.

Regression run `97cb53173d694fbf9d56f925a373d7f1` passes 453 cases and fails both variants of the existing divergent
ignored-personal-file case in `retirement-store.test.ts`. The indexed holder still refuses over unowned prose, but its
projection remedy differs from the legacy filename-specific assertion. The unindexed stamped husk instead completes
removal while holding unique ignored `personal.md`: `huskFixture` deliberately creates no index, § 2.5 grants husks no
new projection, and the projection check/persist return success before reading those personal files. The removed legacy
migration was the remaining protection for that admitted state.

Source inspection and Astra's bounded follow-up confirm this is a preservation gap, not proof that the old husk fixture
is invalid. The old automatic merge after deleting the primary conflict also conflicts with the new no-primary-write
rule, so the preservation outcome and explicit recovery route need disposition together. Projection-folder and
changed-file lint pass in `437096ace28147bc85ac46af239fa79f`; source types pass in `b707926fac654e4099b65bb17cc0f16b`
and all five test type shards pass in `e789616491264905ae7d02a97384d7d5`. These passing checks do not settle the
regression.

## A6 — residual personal files in unindexed retirement

Owner direction, 2026-11-12: protect non-machine-local files under `.arc/user/*/` before destructive removal of an
ARC-managed unprojected/unindexed checkout; require explicit recovery, retain identity-free empty-husk success, and
never compare with or write primary. The subsequent direction requests the planning review, including its independent
pass.

Superseded check text: “`passes`, as a checkout § 2.5 gives no projection and that holds no index does before the
identity is consulted”. Superseded persist text: “On a checkout § 2.5 gives no projection and that holds no index it
returns at once, before the identity is consulted.” The release's no-index success remains, now explicitly distinguished
from destructive removal. The three existing slots remain; the check forwards caller intent as its optional second
argument, defaulting to remove for direct callers, and the shared persistence helper receives explicit internal intent.

`checkWorktreeRemoval` already carries remove/release disposition but drops it when calling the check slot.
`checkProjectionRemoval` and `withPersistedProjection` currently return success on `no-projection`;
`releaseProjectionRemoval` shares the latter helper with persist. These source paths ground the required forwarding
and the need to keep release outside the residual scan. `MACHINE_LOCAL_PATHS` covers identity and work-unit `.internal`
subtrees; `isExcludedProjectionPath` also excludes editor and derived files, so reusing it wholesale would drop approved
coverage. The new observer will reuse only the extracted machine-local predicate, with no derived-file exception.

The correction's footprint is § 12.2's no-index fast paths and check interface, § 12.3's shared-helper release
qualification, new criterion 13, Task 2.5.R, and 2.8's covering acceptance. Projection eligibility, indexed persistence,
legacy capability-off merging, missing-folder pruning, caller marker/HEAD authority, and the § 17 removal race remain
unchanged. A bounded set of disposition, filesystem, and propagation decisions makes this a medium-depth amendment;
no additional segment or lifecycle change is needed.

A6 planning review F1 exposed transient setup compensation outside the ordinary retirement slots.
`establishReadyMarker` returns owned pending bytes after `setupLinkedWorktree` fails; `rollbackSpawn` clears that
marker before native `rollbackSpawned` removes the created checkout directly. Pending transient ownership decodes as
current but grants no projection, so personal bytes written by the setup script meet A6's scope. The approved repair
threads the existing command-bound check into compensation before marker deletion, preserving pending recovery
state and its identity claim on residual data or read uncertainty. Existing `rollbackIdentity` retains claims for
pending-marker/marker-residue evidence, and pending setup recovery can resume after explicit byte recovery and setup
repair. Exact generation/receipt authority, borrowed-marker retention, empty cleanup and capability-off behavior stay.
The Owner approved this correction, an independent fix check, and conditional complete pass 2 after the repair settles.

## Unindexed personal-data preservation

A6's captured contract (`7ddc86563d`) is implemented by `observeUnprojectedPersonalFiles`. It reads current marker
ownership, then actual personal directories without resolving identities, following observed links, or inspecting a
primary copy. `isMachineLocalProjectionPath` reuses only applicable registry rules; discovery retains its broader
exclusions. Editor backups and derived status files therefore remain protected during destructive retirement.
`checkProjectionRemoval` observes the unindexed target, and `persistProjectionRemoval` repeats that observation.
`checkWorktreeRemoval`, the factory, shared persistence helper and its final check all carry remove/release intent.

Transient provisioning receives the command-bound check through `checkRollback`. `rollbackSpawn` checks before
clearing an owned pending marker or physically rolling back another admitted created checkout. Refusal, read
uncertainty and thrown checks retain the checkout and pending evidence; `rollbackIdentity` retains the claim.
Optional detail on existing in-memory evidence carries the local recovery remedy through `durableResidue` alongside
the setup error. No new persisted recovery state or lock is added. Small private helpers separate marker removal,
rollback safety and unindexed persistence so each decision remains inside the existing complexity limits.

The divergent ignored-personal regression now preserves target bytes and registration, recovers explicitly outside
the target, and retires without changing the primary's divergent bytes. A late-arriving personal file refuses
persistence after feasibility passed. Release retains the same file, and filesystem fault cases distinguish read
uncertainty from personal-data refusal and permit repair. Actual-directory, machine-local, derived/editor-file,
missing-folder, unavailable-identity/configuration and symbolic-link cases cover the observer's boundaries.

A native registered-CLI setup script writes ignored personal bytes and fails. The enabled composition retains bytes,
checkout, branch, pending marker and claim, then resumes that same claim after explicit recovery and setup repair.
The built CLI still selects the in-repo backend, so its separate process case covers capability-off cleanup and a
successful fresh open after setup repair. The initial process-case expectation of enabled preservation was invalid
for that backend and is not fail-first evidence. Removing the enabled native check binding reproduces the loss;
restoring it passes the same-claim case. Narrow temporary controls also expose the observer's regular-file,
uncertainty, allowed-root, link and fast-path policies, and all are restored.

A nineteen-file regression run passed 491 cases. Source and all five test-type shards passed; after local complexity
and promise-handling corrections, changed-file lint, source types and the affected seven-file, 187-case regression
passed. Astra's bounded completion advice found no decisive loss or recovery gap in the supplied implementation;
it is advice, not independent implementation verification. Same-claim retry is native for residual refusal;
observation-error retention is covered by filesystem/slot observations and provisioning dependency cases, with no
native same-claim retry after an injected observation error. A6's criterion and amendment revalidation remain at 2.8.

## Persist burst evidence

Implementation `33c3c309cc` extends the native twenty-process suite through teardown's Store-backed persist slot at
`beforeAsideCopy` and `beforeLastCheck`, in both layouts. An interrupted native replacement supplies the indexed aside
copy and open editor handles. Each successful slot must have read its own complete, current-record save before it
returns; another process's later fan-out cannot supply that receipt. Final Store conservation remains mandatory unless
the target's own refusal retains the actual original bytes or a current indexed aside copy with its recovery report.
Historical reads, another reference, a proposed write, and reads outside that invocation cannot grant the receipt.

The omission control originally exposed a false success after later fan-out rescued the save. The corrected receipt
fails that control at both seams in both layouts. Five observation tests distinguish actual Store class delegation,
current content and reference identity, and the invocation boundary. The complete local regression passed all 26 burst
cases and five observation cases. The independent fix check and full second implementation pass returned no findings;
these working reviews discharge no later Candidate review obligation.

Dispatched CI run `43327625683` tested exact implementation head `33c3c309cc14658c4e90043a341820ccf21c063d`.
Its named-file portability pair passed on Windows job `131564473396` and macOS job `131564473414`, each with all 26
cases. Linux portability job `131564906747` passed 3,706 cases in 277 files, with 65 skipped. All three logs explicitly
confirm each of the four persist combinations used 20 processes and preserved 20 completed saves. This diagnostic
run supplies the task's platform evidence; it is not whole-work-unit verification evidence.

The overall run failed five unrelated lifecycle/Store fixture jobs because their legacy setups omitted projection
prerequisites now enforced by the bound retirement slots. Fixture-only correction `fe70e332b3` constructs native
imported user projections before command dispatch, preserving existing Store records and failure evidence. Its
51-file affected integration regression passed 668 cases, and both source and test types passed. Related unit
selection returned no evidence, since these integration-only helpers reach no unit tests; it is not a passing unit
result. The segment verifier's fresh full CI run must include this follow-up; the eight-file persist implementation
and its fixture closure are unchanged from the qualified head.

## Native Windows fixture fidelity

Full portability run `43336944284` at `c787a4f150` exposed native Windows setup mismatches in the fan-out and view
scenarios. The shared fan-out fixture now takes its linked checkout spelling from Git's `--show-toplevel` before
binding its index. This preserves exact diagnostic and command-root assertions when Windows supplies separators or
short names differently. Forced editor-save scenarios explicitly clear the advisory read-only mode before replacing
the protected file, matching the existing forced-edit coverage. All original content, refusal, retry, lease, and Store
version assertions remain. These are fixture corrections on the amendment entry gate's minor-deviation path; the
projection and removal contracts remain unchanged.

The native Windows reproduction failed all five path assertions before the setup correction. Once those assertions
passed, a protected atomic save exposed Windows' read-only replacement refusal; that and the equivalent view-change
case now model the explicit permission override. All eighteen focused cases pass on Windows and Linux, and all
seventy-two cases across the twelve affected fixture consumers pass on Linux. The earlier hosted run remains red;
these local results neither complete Task 2.8 nor replace fresh hosted qualification of the corrected engine tree.

## Removal segment qualification

The removal segment was qualified at engine `9534b4ceb177fa8f6db411f52c3ce1c73af20f91`, the append-only merge
of `84a6472408` with base through `95a466cd91`. Its lockfile change was followed by a clean install and build.
The installer-residue check found no untracked `.arc/user/.npmignore` in registered checkouts; existing copies were
tracked. The reference-backend scenario passed 279 cases in thirteen files (run
`226d104e2caa4bdd91339463e9f8b83a`), covering removal refusal and repair, persistence, release, Store-backed teardown,
unindexed personal-file recovery, failed setup compensation, and the static binding guard.

The prior full run `43336944284` remains a failure at `c787a4f150`. Fixture correction `84a6472408` fixes native
root spelling and explicit forced replacement. Independently merged PRs #1339 and #1340 correct physical-path holder
identity and native separators at virtual rename lookups; the merged engine retains both those corrections and shared
listing observation.

Full CI run `43361738519` completed successfully at the exact engine head above. It was dispatched with
`run_portability_pair: true`, no named-file selection and no diagnostic inputs. Linux portability and all twelve
Windows/macOS pair shards passed, along with build, lint, both type checks, unit, integration, Store and E2E jobs.
This qualifies the segment's final engine and fixture follow-up; it does not complete whole-work-unit verification.

Linux portability job `131677209242` passed 3,703 cases in 277 files, with 65 skipped. Windows burst job
`131676871143` and macOS burst job `131676871194` each passed all 26 cases. All three logs explicitly confirm each
of the four persist seam/layout combinations preserved twenty completed saves from twenty processes, confirming
Task 2.7's recorded runs on the merged engine. Windows job `131676871183` also passes the previously failing rights,
fan-out refusal and creation files.

A5's slot-presence guard and its separate Store/identity inspection were rechecked over the merged engine; the owning
compositions, projection and provisioning code are unchanged from the prior inspected head. A6's residual protection,
recovery and compensation cases passed in the fresh native scenario and hosted qualification, retaining the bounded
observation-error evidence limit recorded above. A5 and A6 revalidate at Task 2.8. Success Criteria remain for the
separate verification phase.
