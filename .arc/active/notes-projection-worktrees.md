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
fan-out, and 1058.04 ms materialization. Hosted qualification with corrected counts remains open, as do the bounds.

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
4.44 ms Git pair, so Git attribution does not close that gap. A3 remains held and all performance bounds remain open.

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
