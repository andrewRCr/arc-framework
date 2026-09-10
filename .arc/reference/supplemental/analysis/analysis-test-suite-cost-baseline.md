# Test Suite Cost Baseline

Hand-measured baseline of the CLI package's test-suite cost, taken 2026-09-10 during
`test-suite-right-sizing` planning. It exists to ground design decisions in measurement rather than projection,
and to survive the session that produced it.

**Status: pre-instrument.** Every figure here came from `vitest --reporter=json` runs driven by hand. The cost
instrument that `test-suite-right-sizing` specifies will supersede this document with richer, repeatable data —
per-test durations, effective CI shard membership, timeout headroom, and heavy-slot wait time. Treat these numbers
as a starting point, not an authority.

## Contents

- [Method and its limits](#method-and-its-limits)
- [Tier baselines](#tier-baselines)
- [Where the time concentrates](#where-the-time-concentrates)
- [CLI startup cost](#cli-startup-cost)
- [Levers measured](#levers-measured)
- [Alternatives closed by measurement or source](#alternatives-closed-by-measurement-or-source)

---

## Method and its limits

Environment: WSL2 on Linux 5.15, Node 26.3.0, ext4 on a virtual disk, `/tmp` on that same ext4 filesystem,
`/dev/shm` a tmpfs with ~7.8 GB free. Warm caches throughout.

Commands, run from `packages/arc-framework/`:

```bash
npx vitest run --project unit --project unit-mocks --reporter=json --outputFile=<path>
npx vitest run --project integration --reporter=json --outputFile=<path>
npx vitest run --project e2e --reporter=json --outputFile=<path>
```

Per-file duration is `endTime - startTime` from each `testResults` entry; "summed" is those durations added, which
exceeds wall clock because files run in parallel.

**Three measurement modes, and they are not comparable.** This is the single most important caveat here, and
mixing modes produced two wrong conclusions during the session that generated this document.

- **single-file** — one file, nothing else running. `config-validate.test.ts` measures 23.5 s this way.
- **tier-isolated** — one whole tier, quiet machine. The same file measures 37–40 s this way, because files within
  the tier contend.
- **under load** — full suite, or a tier running while other work competes for the machine. The same file measured
  4.4 s per test in an earlier under-load run against 1.8 s per test tier-isolated, a 2.4× spread.

Every figure below is **tier-isolated on a quiet machine** unless stated otherwise.

**Run-to-run variance is roughly 8%.** The integration tier measured 51.1 s and 47.4 s on two separate quiet runs
with no changes between them. **Any lever smaller than about 10% is below the noise floor of a single run** and is
not established until it has been measured across several runs and normalized. Two levers recorded below sit in
exactly that band and are marked accordingly.

The raw reporter JSON was not committed — it is bulky and regenerable in about seven minutes with the commands
above. What is preserved here is the derived per-file ranking and the method.

## Tier baselines

| Tier                  | Wall clock      | Summed file time | Files | Cases  |
| --------------------- | --------------- | ---------------- | ----- | ------ |
| `unit` + `unit-mocks` | 25.3 s          | 74 s             | 685   | 9,854  |
| `integration`         | 47.4 s          | 342 s            | 137   | 1,248  |
| `e2e`                 | 280.3 s         | 1,784 s          | 53    | 528    |
| **Full local run**    | **~353 s**      | 2,200 s          | 875   | 11,630 |
| Routine lane (no E2E) | 55.5 s / 58.3 s | 408 s / 429 s    | 822   | 11,102 |

The full local run is sequential across tiers, as the tier runner drives it. E2E is 79% of it.

The routine lane row is two measured runs of `vitest run --project unit --project unit-mocks --project integration`
as one command, not the two tiers summed (which would read ~72.7 s). The projects interleave in one worker pool:
integration files start ~31 s before the first unit file and unit files are still finishing in the lane's last
second. Two split runs taken in the same session summed to 68.2 s, so the single command is ~15% cheaper than
running the tiers back to back. An earlier draft of this document carried the arithmetic figure.

**Wall clock is floored by the longest file.** Files run in parallel and tests within a file run sequentially, so
no tier finishes before its longest file. Integration measured 44.0 s wall against `user.test.ts` at 40.3 s, while
its summed time over the 12 local workers (50% of 24 cores) would be ~28 s; unit measured 24.2 s wall against
`classify-change.test.ts` at 22.3 s. Reducing summed time does not move these tiers' wall clock until the longest
files shrink or split.

`build:fast`, which the integration global setup runs on every invocation, costs 1.2 s warm.

## Where the time concentrates

Cumulative share is of that tier's summed file time.

### `unit` — 74 s over 685 files

| File                                      | Seconds | Cases | Cumulative |
| ----------------------------------------- | ------- | ----- | ---------- |
| `classify-change.test.ts`                 | 23.2    | 122   | 31%        |
| `codex-cli.test.ts`                       | 18.0    | 37    | 55%        |
| `registry.test.ts`                        | 2.7     | 4     | 59%        |
| `decompose-v3-authority-boundary.test.ts` | 2.5     | 5     | 62%        |
| `import-boundary.test.ts`                 | 2.5     | 8     | 66%        |
| `meta-reader-inventory.test.ts`           | 2.1     | 1     | 68%        |
| `meta-writer-inventory.test.ts`           | 1.5     | 2     | 70%        |
| `user-status.test.ts`                     | 1.2     | 172   | 72%        |

Two files are 55% of the tier. Neither spawns the ARC CLI: `classify-change` drives `classify-change.sh` through
`bash`, and `codex-cli` spawns `git` 18 times and `sh` once. Both use `it.each`, so static `it(` counts understate
their case counts — `classify-change` declares 63 `it(` calls but executes 122 cases.

### `integration` — 342 s over 137 files

| File                                   | Seconds | Cases | Cumulative |
| -------------------------------------- | ------- | ----- | ---------- |
| `user.test.ts`                         | 43.7    | 94    | 13%        |
| `decompose-v3-repository-plan.test.ts` | 43.5    | 53    | 26%        |
| `review-fan-out-lifecycle.test.ts`     | 37.5    | 15    | 36%        |
| `config-validate.test.ts`              | 37.4    | 13    | 47%        |
| `review-cli-surfaces.test.ts`          | 16.4    | 22    | 52%        |
| `init.test.ts`                         | 11.3    | 39    | 56%        |
| `delivery-field-runs.test.ts`          | 10.9    | 9     | 59%        |
| `github-provider-refresh.test.ts`      | 8.0     | 5     | 61%        |
| `one-shot-script-entrypoints.test.ts`  | 7.6     | 3     | 63%        |
| `user-notes-compaction.test.ts`        | 7.1     | 18    | 65%        |
| `teardown.test.ts`                     | 6.8     | 22    | 67%        |
| `notes-export-state-coherence.test.ts` | 6.2     | 13    | 69%        |

**Only four files in this tier spawn the ARC CLI at all** — `config-validate`, `review-cli-surfaces`,
`decompose-v3-repository-plan`, and `scripts/remedy-roadmap-conflict`. They hold 106 s, or **29%** of tier cost.
The other 133 files hold 257 s (**71%**), and their dominant term is git fixture construction: 112 of the 137 files
carry a repo-building signal. Any lever aimed at CLI startup reaches at most the 29%.

`config-validate` is the exception that pays a different tax: it spawns the CLI from TypeScript source through the
`tsx` loader, at ~1.4 spawns per test.

### Fixture construction probe (`user.test.ts`, `init.test.ts`)

Both files build one fixture per test through `__tests__/helpers/integration.ts`, which delegates repository
creation to `createTempRepoCore` in `temp-repo.ts`. Spawn counts were verified with a logging `git` shim on
`PATH`; timings are ten sequential builds on an idle machine (mode: **single**, not comparable to in-tier figures)
under the config's hermetic environment (`GIT_CONFIG_NOSYSTEM=1`, `GIT_CONFIG_GLOBAL=/dev/null`).

| Fixture shape                               | git spawns | Mean build | Used by                        |
| ------------------------------------------- | ---------- | ---------- | ------------------------------ |
| `createTempRepo` only                       | 4          | 9.5 ms     | `init` — 5 cases               |
| `createTempRepo` + `runInit`                | 9          | 106.4 ms   | `init` — 34 cases; `user` — 12 |
| `initInTempRepo` + `makeCommit`             | 11         | 110.5 ms   | `user` — 33 cases              |
| `initInTempRepo` + commit + `addBareRemote` | 14         | 137.6 ms   | `user` — 48 cases              |
| `fs.cpSync` of a built `user` fixture       | 0          | 7.3 ms     | 3.5 MB, 187 files              |

A single `git --version` costs 2.4 ms and `git init -q` 4.5 ms, so the nine spawns in the `runInit` path are
~24 ms of its ~106 ms; the remainder is the init command writing the `.arc/` tree. Spawn batching is therefore not
a lever; a template copy is, bounded by the fixture share below.

| File                     | Duration (tier-isolated) | Cases | Fixture share (weighted by shape) |
| ------------------------ | ------------------------ | ----- | --------------------------------- |
| `user.test.ts`           | 40.3 s                   | 94    | 28.6% (25.8% uniform)             |
| `init.test.ts`           | 11.6 s                   | 39    | 31.6% (35.8% uniform)             |

**Absolute-path audit.** A built `initInTempRepo` + `makeCommit` fixture contains no occurrence of its own
absolute path anywhere, `.git/` included. The `addBareRemote` shape does: `.git/config` records the remote's
absolute `/tmp/arc-remote-*` path, and the remote is a sibling temp directory, not nested in the fixture. Note
that `ugrep`-backed `grep` functions skip hidden files under `-r` and return a false clean; use `/usr/bin/grep`.

**Remote leak.** `addBareRemote` returns its temp directory and leaves removal to the caller; of the twelve test
files that call it, one removes the directory. The measuring machine held 1,210 leaked `arc-remote-*` directories
(213 MB) from prior runs.

### `e2e` — 1,784 s over 53 files

| File                                     | Seconds | Cases | Cumulative |
| ---------------------------------------- | ------- | ----- | ---------- |
| `candidate-lineage.e2e.test.ts`          | 262.6   | 33    | 15%        |
| `delivery-position.e2e.test.ts`          | 166.3   | 23    | 24%        |
| `command-input-no-input.e2e.test.ts`     | 152.3   | 77    | 33%        |
| `errand.e2e.test.ts`                     | 137.3   | 47    | 40%        |
| `lifecycle-exit.e2e.test.ts`             | 128.8   | 24    | 47%        |
| `delivery-plan.e2e.test.ts`              | 120.1   | 18    | 54%        |
| `session-init.e2e.test.ts`               | 96.8    | 29    | 60%        |
| `review-protocol.e2e.test.ts`            | 55.6    | 8     | 63%        |
| `delivery-terminal-recovery.e2e.test.ts` | 50.4    | 18    | 66%        |
| `rename.e2e.test.ts`                     | 38.9    | 8     | 68%        |
| `publication-spine.e2e.test.ts`          | 37.6    | 7     | 70%        |
| `user.e2e.test.ts`                       | 36.9    | 13    | 72%        |

**Anchor-set gap.** CI pins four anchor files per leg and shards the remainder by path hash. The pinned set is
`candidate-lineage`, `errand`, `command-input-no-input`, and `lifecycle-exit`. Measured, the four largest are
`candidate-lineage`, `delivery-position`, `command-input-no-input`, and `errand` — so `delivery-position` (2nd,
166.3 s) is unpinned while `lifecycle-exit` (5th, 128.8 s) is pinned.

This ranking is mode-sensitive: an earlier under-load run put `command-input-no-input` 7th rather than 3rd. Anchor
selection must be made from tier-isolated data.

## CLI startup cost

Per-spawn fixed cost, warm, minimum of 5–7 runs. "Real verb" means a command that loads a handler.

| Configuration                             | `--version` | `view`  | `status` | RSS     |
| ----------------------------------------- | ----------- | ------- | -------- | ------- |
| Built bundle as shipped today             | 0.38 s      | ~0.36 s | 0.36 s   | 205 MB  |
| Built bundle + `NODE_COMPILE_CACHE`       | 0.29 s      | —       | —        | —       |
| Lazy handlers, `splitting: false`         | 0.14 s      | 0.21 s  | 0.25 s   | ~100 MB |
| Lazy handlers, code splitting on          | 0.03 s      | 0.19 s  | 0.23 s   | ~55 MB  |
| External dependencies alone, nothing else | 0.12 s      | —       | —        | 78 MB   |
| Bare `node -e ""`                         | 0.01 s      | —       | —        | 46 MB   |
| Spawned via `tsx` from TypeScript source  | 1.23 s      | —       | —        | —       |

**The 0.12 s dependency floor is structural.** `dist/cli.js` carries 532 top-level `import` statements — the nine
npm dependencies are external, not inlined — and ES module semantics evaluate hoisted imports before any importing
module's body runs. Deferring handler bodies cannot defer them.

**Code splitting's apparent advantage is a `--version` artifact.** It is worth 0.11 s on a `--version`-class path
but only ~0.02 s on a real verb, because a handler chunk pulls the dependency floor in regardless. The test suite
spawns real verbs, never `--version`.

`tsup` defaults `splitting` to `true` for ESM output and `tsup.config.ts` sets no `splitting` key, so today's
single-file `dist/` is a consequence of the bundle having no dynamic imports rather than a configured contract.
Keeping one output file once dynamic imports exist requires setting `splitting: false` explicitly.

## Levers measured

| Lever                                      | Effect                              | Confidence                       |
| ------------------------------------------ | ----------------------------------- | -------------------------------- |
| Taking E2E off the routine local path      | full local ~353 s → ~73 s (**79%**) | High — arithmetic over baselines |
| Lazy-loading CLI handler modules           | per-spawn 0.36 s → 0.21 s (**42%**) | High — probe on real handlers    |
| `tsx` → built bundle for `config-validate` | ~1.0 s per spawn on ~21 spawns      | High — direct measurement        |
| tmpfs fixture root, `integration`          | 47.4 s → 43.1 s (~9%)               | **Low — within noise band**      |
| `--no-isolate`, `integration`              | ~6–12%, all 1,248 cases passed      | **Low — within noise band**      |
| tmpfs fixture root, `e2e`                  | 280.3 s → 278.9 s (**0.5%**)        | High — effectively nil           |
| CI anchor re-selection                     | ~25 s of critical path              | Medium — from tier-isolated rank |
| Code splitting, on top of lazy loading     | ~0.02 s per real-verb spawn         | High — direct measurement        |
| Running the lane as one command            | 68.2 s → 55.5 s (**~15%**)          | High — same-session pair         |
| Fixture template copy, `user` / `init`     | ≤26–36% of those files' time        | High — probe; share is the bound |
| Skipping `build:fast` when `dist/` fresh   | 1.2 s                               | High — effectively nil           |
| Batching git spawns per fixture            | ~24 ms of ~106 ms per build         | High — effectively nil           |

The two low-confidence rows are the reason the variance caveat matters: both sit at or below the ~8% run-to-run
spread and neither is established by the single runs recorded here.

Fixtures already root on `/tmp`, which is ext4 on WSL2's native virtual disk — **not** the `/mnt/*` 9p bridge that
would dominate everything else. That failure mode is already avoided.

`--no-isolate` passed all 1,248 integration cases including the three files using `vi.mock`, which suggests the
quarantine the unit tier applies may be unnecessary here. Mock-state leakage is order-sensitive, so one green run
is not proof.

## Alternatives closed by measurement or source

- **Node startup snapshots and Single Executable Applications** — not viable for this CLI's shape. An ESM entry
  point throws `SyntaxError` outright; the snapshot builder loads built-ins "but not additional user-land
  modules", which excludes externalized npm dependencies; `node:child_process` is unsupported and `execa` depends
  on it; the blob is locked to an exact Node version, architecture, and platform; and SEA cannot back an npm `bin`
  that must remain a `.js` file. The tracking issues for lifting the user-land-module restriction
  (`nodejs/node#44277`, `nodejs/help#3981`) are both closed "not planned".
- **`NODE_COMPILE_CACHE`** — caches compilation, not module evaluation, so it cannot touch the evaluation half of
  the dependency floor. Measured 0.38 s → 0.29 s standalone; published comparators sit at 6–20%. Its benefit also
  largely disappears once lazy loading removes the modules it was caching.
- **Code splitting** — measured above at ~0.02 s per real-verb spawn, against a `dist/` layout change.
- **Duration-aware CI shard membership** — Vitest 4.1.8 derives shard membership from `hash("sha1", specPath)`,
  sorted and sliced, with no duration input. Filters apply before sharding, so an explicit file argument cannot
  compose with `--shard`: `vitest list --project unit classify-change --shard=1/4` fails with
  `--shard <count> must be a smaller than count of test files`. Duration-aware membership would require a custom
  `sequence.sequencer`.

---

_Superseded in part by the cost instrument once it lands; the method notes and mode discipline above remain the
contract any later comparison must honor._
