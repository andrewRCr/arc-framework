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
a save to that file necessarily follows the new reference." `smudgeRacyEntries` implements that exemption through
its `installing` set. A whole-index `commitProjectionIndex` smudged the entry again before every reference advance;
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
