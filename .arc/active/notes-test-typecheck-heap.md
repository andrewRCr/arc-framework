# Notes: test-typecheck-heap

## Contents

- Evidence
- Origin
- Growth rates and the 3 GiB target
- Pool state at spec time
- Why gate runs start cold
- Measuring on m4-mini
- TypeScript 7 observations
- Neighbouring work

## Evidence

The measurements behind the spec's figures live in `~/dev/arc-evidence/test-typecheck-heap/` on the WSL desktop.
`results/SUMMARY.md` indexes every run by label, with the raw output beside it.

- **Measurement configs:** `m-head/packages/arc-framework/` (content of `43a8680c1b` outside `.arc/`). The candidate
  shards are `tsconfig.m7-*.json`; the spec's `integration` shard is `int-rest` there, and `integration-store` is
  `int-store`.
- **TypeScript 7.0.2:** `ts7/node_modules/typescript/`. `alias-spike/` holds the side-by-side install of `typescript`
  6 and the `typescript-7` alias.
- **Scripts:** `scripts/measure.py` polls `VmPeak` and `VmHWM` until exit; `scripts/run-e21.sh` drives the partition
  runs; `scripts/probe-exe.py` follows `/proc/<pid>/exe` through the launcher's exec.
- **Pool history:** `review/`.

| Spec figure                                              | Runs                                     |
| -------------------------------------------------------- | ---------------------------------------- |
| Introduction's table (TS 6 and TS 7 test program, `src`) | e1, e2, e9, e21 (`whole`, `src`)         |
| § 1.4's shard peaks and times, TS 7 and TS 6             | e21 (`e21-ts7-*`, `e21-ts6-*`)           |
| § 2's file-list parity between compilers                 | e22 (`e22-listfiles/`)                   |
| § 3.3's checker comparison                               | e25                                      |
| § 3.3's backstop gap (`VmPeak` − `VmHWM`)                | e21, e25                                 |
| § 3.3's overrun (`fatal error: out of memory`, exit 2)   | e23                                      |
| § 3.4's process identity                                 | e26 (`e26-process-identity.txt`)         |
| § 7 and the landing handoff's `lint:ts` heaps            | e15–e18 (m4-mini)                        |
| Alternatives' referenced-project and zod-stub runs       | e6a, e6b, e8, e10a, e10b                 |
| Growth rates (below)                                     | e12 (at `b2035d69c3`) against e2, e7, e9 |

e24 showed TS 7 writing and reusing a shard's incremental state file (0.5 s for an unchanged rerun).

## Origin

CI triage of the test type check running out of memory on `main` at `43a8680c1b` (run 41952298959) and on #1274,
2026-11-04. #1275 raised CI's step to 6144 MiB as an interim, and #1277 fixed a separate `/dev/shm` cache leak.

## Growth rates and the 3 GiB target

End-of-run heap from `b2035d69c3` (2026-10-20) to `43a8680c1b` (2026-11-04), on TS 6 with `declaration: false`, in GiB
a week: whole test program 0.49; the three directory shards measured then, integration 0.43, unit 0.15, e2e 0.06.
`src` alone grew 0.24 under `typecheck`, which includes the declaration pass the shards drop.

At those rates the whole `__tests__/integration` shard would have reached a 4192 MiB ceiling around 11-27 and
6144 MiB around 12-28. The rates come from one unusually fast fortnight, and end-of-run heap under a large ceiling
counts garbage V8 had not yet collected, so such dates are on the early side.

project-manager.ARC re-reads the shard peaks at each storage landing from the peak lines.

## Pool state at spec time

The registry as of 2026-11-05 (`~/.config/arc-offload/registry.json`), after the interim changes:

- m4-mini's runner-wide `heap_mb` is 6144.
- `typecheck:test` is charged 6,500 MB, and `typecheck:all` has its own rule at the same figure.
- The `typecheck:test` and `typecheck:all` routes send the check to m4-mini only, with `allow_local: false`, so an
  m4-mini outage holds every commit gate that runs it. Grouped commit-gate plans follow these routes: arc-offload
  intersects the routes of every invocation in a plan (`Repository.route_for` in `arc_offload/config.py`, applied per
  invocation in `arc_offload/arc_placement.py`).
- `typecheck` routes to m4-mini and intel-mbp, with local fallback, and is charged 2,800 MB.
- `lint:ts` is charged 5,000 MB, since under the 6144 MiB heap its RSS floats to 4,638 MiB.

Copies from before each change: `~/dev/scratch/ci-heap-triage/offload/registry.pre-2026-11-05.json` (before the
interim changes) and `~/.config/arc-offload/registry.before-typecheck-route-20261105.json` (before the `typecheck`
route and the `lint:ts` charge).

Before the `typecheck` route, most of its pool runs went to the m5-air runners under a 2048 MiB `heap_mb`. An unbudgeted
runner charges one token whatever a command's figure (`capacity_cost` in `arc_offload/pool.py`), a gate run is never
re-placed, and arc-offload records a cgroup kill so a later retry avoids that runner (`_note_memory_kill` in
`arc_offload/arc_groups.py`), but not a V8 heap abort.

Restoring local fallback on the `typecheck:test` and `typecheck:all` routes waits on the WSL memory decision in
project-manager.ARC's local-machine batch.

## Why gate runs start cold

- A pool runner receives the plan as an uploaded stage (`RemoteSession` in arc-offload's `arc_transport.py`), and the
  worker runs the adapter from that stage without touching the runner's checkout (`lib/remote-worker.sh`). A local
  gate run calls the adapter directly.
- Either way the adapter materializes the plan into a fresh directory (`materialize_plan` in `arc_inputs.py`) from a
  Git tree, with no ignored files such as `node_modules/.cache/tsc`, and runs the `prepare_commands`, `npm ci` among
  them, on every placement (`_prepare_commands` in `arc_adapter.py`).
- CI restores `node_modules` from a cache keyed on the lockfile, saved by its `setup` job without running a type
  check (`nm-cache` in `ci.yml`).

Only runs outside the gate keep incremental state: a direct run in a checkout, or a direct `arc-offload` command,
whose runner worktree keeps `node_modules` (`prepare` in `lib/remote-worker.sh`).

## Measuring on m4-mini

Work-unit verification uses this section, for the TS 6 baseline and Success Criteria 3–5, so keep it through
verification's notes consolidation.

- **Pinned runs.** `arc-offload --runner m4-mini <argv>` runs the working tree's snapshot on m4-mini. The runner
  worktree reruns its `prepare_commands`, `npm ci` and `npm run setup`, when the digest of its `fingerprint_files`
  changes (`prepare` in `lib/remote-worker.sh`). The registry lists `package-lock.json` there, so the branch's
  lockfile installs `typescript-7` and the runner's own platform package. It preserves `node_modules` across runs.
  The script takes its package root from its own location, so
  `node --import tsx packages/arc-framework/src/scripts/run-typecheck.ts test` runs from the repository root.
- **Warm or cold.** A pinned run keeps the runner worktree's `node_modules`, `.cache/tsc` included, so a shard can find
  its state file and report a lower peak and time. Every gate run starts cold. Read figures that must be cold from a
  gate run's peak lines, or from a pinned run that first removes `packages/arc-framework/node_modules/.cache/tsc` in
  the same command.
- **Timing (Success Criterion 5).** Time `npm run typecheck:test` itself inside the pinned command, after the cache
  removal, for example with bash's `time`. Timing the `arc-offload` command from outside adds the snapshot's transfer
  and any `prepare`. A gate run's `costMs` adds plan materialization and `npm ci`: `executeRoutedSelectedCheck` in
  `src/handlers/check/run.ts` takes `startedAt` before `prepareSelectedCheckExecution`.
- **Placement.** Record a figure as m4-mini's only when its run proves it ran there. A pinned run proves it by
  `arc-offload: exit <n> on m4-mini (<host>)` (`run_on` in `arc_offload/execution.py`) with no later `arc-offload:`
  line reporting a retry, fallback or refusal: `trying another runner`, `running locally` or
  `forbids local fallback`. A failed run that stalled on memory logs the exit line and is then retried elsewhere or
  refused (`stall_explains_failure` in `run_on`), and such a line voids it. The warning
  `check result retained; automatic prune could not start`, which `auto_prune` may log after a successful exit, does
  not. A gate run proves it by `arc-offload: running sibling on m4-mini` in its log (`_telemetry`, called from
  `run_one` in `arc_offload/arc_groups.py`). Other lines can name m4-mini for a run that happened on WSL.
  Under `off`, `arc-offload` ignores `--runner` and runs the command locally (`os.execvp` in `arc_offload/cli.py`).
  Under `on` or `spill`, a failed m4-mini attempt falls back to WSL and logs `m4-mini: <error>; running locally`
  (`_dispatch` and `local_run`). Only a pinned run under `speed`, `required`, or a route with `allow_local: false`
  refuses that fallback. Read `~/.config/arc-offload/mode` before a heavy pinned run such as the TS 6 baseline.
- **Gate logs.** A passing check prints only its outcome (`QUIET_OUTCOMES` in `src/handlers/check/run-output.ts`). Its
  full output, placement line and peak lines included, is in the log that `<git-dir>/arc-checks/<id>.latest.json`
  names as `logPath`, with the id percent-encoded as `createCheckReportStore` writes it (`src/lib/checks/reports.ts`):
  `typecheck%3Atest.latest.json` for `typecheck:test`.
- **The TS 6 baseline (Task 2.4, Success Criterion 4).** `typecheck:test`'s program on TS 6 needs a 6144 MiB V8 heap,
  as CI's `typecheck-tests` step pins today; at 4096 MiB it ran out of memory. Run `typescript`'s own `bin/tsc` with
  `NODE_OPTIONS=--max-old-space-size=6144`, pinned to m4-mini, or on WSL only through `memcap_gated` when
  `memcap_policy` allows it.
- **The backstop gap (Task 3.4).** The peak line reports `VmHWM` only, so the gap takes a one-off pinned command and no
  repository instrument. It polls `/proc/<pid>/status` for `VmPeak` and `VmHWM` while `/proc/<pid>/exe` is the native
  `tsc`, as `scripts/measure.py` does on the desktop. Run it over `unit-b` under `GOMEMLIMIT=6000MiB` and
  `--checkers 1`. Record the gap, the date and the head here. The margin is 512 MiB above the larger of this gap and
  the desktop's 1,305 MiB, and never below 1,331 MiB.

### First-shard qualification

On 2026-11-06, with HEAD `7b3b65ab55` plus Task 1.6's working-tree changes, the script ran the store shard
successfully from the package root on WSL and from the repository root on m4-mini. The WSL run used
`memcap_gated -m 8G` and `nicecap`; both native address-space columns were 8,196,718,592 bytes, and its peak line
reported 1,179 MiB at a 6000 MiB soft limit. The first admission was refused for insufficient free memory; the
successful retry waited for memory to free and retained the 8 GiB gate.

Pinned run `785c4f522ef2496fa68006ad9848ed94`, snapshot `4db2f405b3dc3ddf952cb52f0b75debcff5af813`, reported
1,185 MiB at the same soft limit and ended with `arc-offload: exit 0 on m4-mini (m4-mini-runner)`, with no fallback.
Raw logs, the WSL observer and source hashes live in this worktree's personal `test-typecheck-heap/evidence/`.
These first-shard figures qualify the launch and observation path; the landing figures are measured afresh cold.

## TypeScript 7 observations

- With no `GOMEMLIMIT`, TS 7 ran out of memory under a 6 GiB address-space cap at about 4.7 GiB in use, with four
  checkers and with one alike (e3, e4). Under `GOMEMLIMIT=4500MiB` the whole test program peaked at 4.16 GiB with the
  same verdict as TS 6 (e5).
- `lint:ts:file` builds no program for a test file (326 MiB on m4-mini, e19) and the `src` program for a `src` file.

## Neighbouring work

- `compact-schema-declarations` (planned, after this unit) gives exported schemas explicit types, which makes the
  forward path in § 1.5 worth taking. `src/scripts/review-gate/status.ts` is its pilot candidate. Splitting it from this
  unit was settled with project-manager.ARC on 2026-11-05.
- `test-suite-contention-hardening` owns how command memory takes part in pool admission in general, including
  `test:changed`'s charge.
- `test-setup-consolidation` (provisional) takes the shared test builders; `test-di-migration`'s draft holds the
  lint baseline for internal mocks.
- The held `USER-INBOX` item "Adopt TypeScript 7 and remove the TS6 deprecation bridge when the ecosystem is ready"
  keeps typed linting, the declaration build and the bridge. This unit adopts TS 7 for the two type checks only.
- If TS 7 falls back (§ 8), adopting it becomes the next item at P1, since sharding on TS 6 slows every commit gate.

---
