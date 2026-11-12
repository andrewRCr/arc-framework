# Notes: test-typecheck-heap

## Contents

- [Evidence](#evidence)
- [Origin](#origin)
- [Growth rates and the 3 GiB target](#growth-rates-and-the-3-gib-target)
- [Pool state at spec time](#pool-state-at-spec-time)
- [Why gate runs start cold](#why-gate-runs-start-cold)
- [Measuring on m4-mini](#measuring-on-m4-mini)
- [Landing handoff](#landing-handoff)
- [Verification](#verification)
- [TypeScript 7 observations](#typescript-7-observations)
- [Neighbouring work](#neighbouring-work)

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
  as CI's `typecheck-tests` step pinned before this change; at 4096 MiB it ran out of memory. Run `typescript`'s own
  `bin/tsc` with `NODE_OPTIONS=--max-old-space-size=6144`, pinned to m4-mini, or on WSL only through `memcap_gated`
  when `memcap_policy` allows it.
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

### Compiler-verdict qualification

On 2026-11-06, pinned run `34a43a7302744f0687c2cee5583095b3` checked HEAD `2a5941fc88` plus the typecheck npm-script
switch, snapshot `cc5fb96c6816ae6ba80ea441e41f9e09a595a16f`. TypeScript 6.0.3's own launcher passed over both
reference configs at a 6144 MiB heap with `--incremental false`. A disposable copy of that source passed both TS 7
commands; then an exported string-to-number assignment planted in one root per shard, in
`__tests__/fixtures/checks/runner-proxy.mjs`, and in `examples/check-runner/local.mjs` each failed with TS2322 naming
its file. Every failed test check still ran all five shards. The copy was removed; the checkout was never planted.

The clean copy reported 2,041 MiB for source and 1,841 / 1,193 / 1,567 / 1,969 / 2,145 MiB for integration,
integration-store, rest, unit-a and unit-b. Subsequent planted-error runs reused incremental state, so their lower
figures are not landing evidence. The final line was `arc-offload: exit 0 on m4-mini (m4-mini-runner)`, with no
fallback. The driver and raw output are in this worktree's personal `test-typecheck-heap/evidence/` as
`parity-probe.mjs` and `parity-qualification.log`.

### Native address-space margin

On 2026-11-06, pinned run `cb366ba4746d498d8c968e60eb777705` sampled the native unit-b compiler at HEAD
`2c953db69f`, snapshot `9fe565ffed38f68af96704b5653fa4a86ca49be9`, under a 6000 MiB soft limit and one checker after
removing incremental state. Across 450 native samples, the largest `VmPeak` minus `VmHWM` was 1,273.1171875 MiB;
peak RSS was 2,128.71484375 MiB. The run ended with `arc-offload: exit 0 on m4-mini (m4-mini-runner)`, without fallback.

The desktop's 1,305 MiB gap remains larger, so the margin stays at 1,817 MiB: 1,305 plus 512, above the 1,331 MiB
floor. No constant change is needed. The driver and raw output are `gap-probe.mjs` and `m4-native-gap.log` in this
worktree's personal `test-typecheck-heap/evidence/`.

After the host returned to `speed`, the WSL probe passed on 2026-11-06 at the same HEAD, with both inherited
address-space columns at 2,147,483,648 bytes. The unchanged root `npm run -s typecheck:test` attempted all five
shards, each reported Go's `fatal error: out of memory` and its native peak, and npm exited 2. Peaks in name order
were integration 810 MiB, integration-store 771 MiB, rest 815 MiB, unit-a 781 MiB and unit-b 784 MiB.

This qualification used Node 24.15.0 throughout `PATH` and explicit caller settings
`NODE_OPTIONS="--max-old-space-size=128 --max-semi-space-size=1 --disable-wasm-trap-handler"`. The small Node heap and
young generation keep the controller within its inherited address space; disabling the WebAssembly trap handler
lets tsx's lexer initialize without a large virtual reservation. No compiler setting, source or cap was changed.
Default Node 26.3.0 aborted in loader-worker initialization; default Node 24.15.0 failed to allocate WebAssembly
memory. Disabling the trap handler alone with the small heap let Node 24 start, but the controller later exhausted
its semi space. The qualifying result is specific to the documented caller settings, not default runtime startup.

The driver, full compiler output and concise qualification are `inherited-limit-probe.py`, `inherited-2g-raw.log`
and `inherited-2g-node24-small-semi.log` in the personal evidence directory. Failed diagnostic runs are retained
beside them. The earlier admission refusal under `required` launched no process; no mode override was applied.

### Typed lint qualification

On 2026-11-06, pinned run `4854d21feb5042e289a6deec2e991d3d` used HEAD `4607c3bf13` plus the npm script switch,
snapshot `30639d16d51b825b865f6fc25e77a79138799310`. A disposable copy received one unused `max-lines` suppression
for the heap preload. The unchanged root `npm run -s lint:ts` exited 2 with ESLint's unused-suppression diagnostic;
`npm run -s lint:ts -- --prune-suppressions` then removed that entry and exited 0. The live baseline was untouched.

At `NODE_OPTIONS=--max-old-space-size=4192`, the two peak lines reported RSS 3,676 and 3,724 MiB, heap in use 2,355
and 2,996 MiB, and actual V8 heap limit 4,288 MiB. These are qualification figures, not the final cold landing set.
The run ended with `arc-offload: exit 0 on m4-mini (m4-mini-runner)` without fallback. Its driver and complete output
are `lint-suppression-probe.mjs` and `lint-suppression-qualification.log` in the personal evidence directory.

## Landing handoff

Verification keeps this section and § Measuring on m4-mini through notes consolidation and carries this entire
handoff, including proposals, Owner calls and the m5-air first-run check, into the verification commit body.

### Cold landing measurements

On 2026-11-06, pinned run `fe3e4d6520b047e4b9ffece0c31b2bc4` ran HEAD `bb1499e747b5b68a02588a5bebdf70d9c526bd05`,
snapshot `51692ed120b01eec394b69e07a5c076d35bb05ce`, on m4-mini with Node 26.3.0, Linux arm64. Every npm invocation
began after removal of the package's `.cache/tsc` directory. Timing surrounds each root npm command inside the runner,
after cache removal, and excludes transfer and preparation.

| Process                            | RSS peak (MiB) | Heap in use at exit (MiB) | Actual V8 heap limit (MiB) | Wall time (s) |
| ---------------------------------- | -------------- | ------------------------- | -------------------------- | ------------- |
| `typecheck`                        | 1,931          | —                         | —                          | 5.459         |
| `typecheck:test` integration       | 1,802          | —                         | —                          | —             |
| `typecheck:test` integration-store | 1,189          | —                         | —                          | —             |
| `typecheck:test` rest              | 1,563          | —                         | —                          | —             |
| `typecheck:test` unit-a            | 1,921          | —                         | —                          | —             |
| `typecheck:test` unit-b            | 2,028          | —                         | —                          | —             |
| `lint:ts` run 1                    | 3,667          | 2,217                     | 4,288                      | 67.648        |
| `lint:ts` run 2                    | 3,626          | 2,626                     | 4,288                      | 72.957        |
| `lint:ts` run 3                    | 3,697          | 2,280                     | 4,288                      | 80.478        |

All commands exited 0. The complete five-shard command took 24.199 s, below 45 s. Every native figure is below
3,072 MiB and was sampled while the process was the native compiler; each line reports its 6000 MiB soft limit.
The compiler runs used the script's own target and backstop despite the runner's inherited 6144 MiB Node setting.
Each lint run explicitly set `NODE_OPTIONS=--max-old-space-size=4192`; the table distinguishes that old-space
setting from V8's observed total heap limit. End-of-run heap use is an exit observation, not a heap high-water mark.

The final line was `arc-offload: exit 0 on m4-mini (m4-mini-runner)` with no retry, fallback or refusal afterward.
History records one active job, no swap-in or swap-out, and zero memory pressure during the run. The driver and full
output are `landing-probe.mjs` and `m4-landing-qualification.log` in this worktree's personal evidence directory.

### Proposed machine configuration

These are proposals for the Owner; no registry, route, heap or mode setting was edited.

- **`typecheck`: 2,700 MB**, replacing 2,800 MB. Its 1,931 MiB RSS peak plus a 512 MiB reserve is about 2,562 MB
  in decimal units; the proposal rounds upward and leaves about 675 MB over the observed compiler peak.
- **`typecheck:test`: 2,800 MB**, replacing 6,500 MB, subject to the pairing decision below. Its largest shard's
  2,028 MiB peak plus 512 MiB is about 2,664 MB; the proposal rounds upward, leaving about 673 MB over that peak.
- **`typecheck:all`: 2,800 MB**, replacing 6,500 MB, from the larger of the source and shard proposals. The checks
  run sequentially, and a grouped plan pays for its heaviest command. All three proposed charges cost six of
  m4-mini's twenty 512 MB tokens; `test:unit` costs nineteen and cannot run beside them.
- **m4-mini `heap_mb`: 4192 MiB**, replacing 6144 MiB. Native compiler memory is script-owned; all three lint runs
  passed at the proposed caller setting. The runner-wide value remains unchanged until the Owner applies it.
- **`lint:ts`: 4,200 MB**, replacing 5,000 MB. The largest of three RSS peaks, 3,697 MiB, is about 3,877 MB,
  leaving about 323 MB for the controller, npm and variation. This costs nine tokens instead of ten.
- **Source routes:** add `m5-air-ac` and `m5-air-battery` to `typecheck`, alongside m4-mini and intel-mbp. Its
  native memory target can follow the m5-air job cap rather than its 2048 MiB Node setting.

The registry read at measurement time still had source charge 2,800 MB, test/all charges 6,500 MB, lint charge
5,000 MB, and m4-mini heap 6144 MiB. The test/all routes were m4-mini-only with `allow_local: false`; source already
allowed local fallback. Both m5-air profiles declared `memory_max_mb: 5120` and `heap_mb: 2048`.

### Owner calls

The three decisions were requested while measurements ran and remain pending; no answer is inferred from elapsed time.

- **Pairing with `test:changed`: pending.** Six tokens plus its fourteen admit the pair, which can exceed the
  11.9 GB VM: historical solo `test:changed` runs reached 11.2 GB and the 90th percentile was 9.5 GB. Recommend
  retaining the current 6,500 MB test/all admission charges until the pairing is accepted or addressed separately;
  2,800 MB is the measured physical-budget proposal, not permission to apply it. `test:changed` charging is outside
  this change. At 4,200 MB, lint costs nine tokens; integration costs eleven and store suites nine.
- **Early m5-air source probe: pending.** A direct script invocation under arguments no route matches can reach
  m5-air before a route edit. Recommend that one pinned read-only qualification; none has run without the call.
- **Test/all routes and `allow_local`: pending.** Recommend keeping the current routes and disabled local fallback
  until those placements are qualified. Whether they follow the proposed source routes, and whether they regain
  local fallback, remains the Owner's choice; the WSL memory decision is separate from these measurements.

### First m5-air source check

After an authorized early probe or source-route edit, the first source run must show a **4,608 MiB soft limit**
when the configured 5,120 MiB cap is in force in its job cgroup. A 6000 MiB line means the script found no bound.
Read that job cgroup's own `memory.max` to distinguish a cap not in force from a missed script read. Undo the source
route edit until the cause is known; neither a 6000 MiB line nor the registry setting alone qualifies the bound.

## Verification

The author criteria walk covers `tasks-test-typecheck-heap.md` > Success Criteria in full (12 criteria).

- **Diff:** `97a7f471c2007fb7bd57455892068cbbb13c6ed5` to `f1b6dcbb21187a67cc70d522041b30080e6fcf7f`.
- **Reachability:** tree `10e5011e2659da0c241bc8acb14d79c83eeadd63`, anchored to HEAD `8d0287f9c1`
  with staged notes consolidation; no Delivery Plan or boundary-order deviation.
- **Scale attention:** `below-threshold / continue-review`, 2,730 changed lines across 37 files; whole work-unit scope.

- **Author aggregate check:** no material findings; no finding-driven fixes.
- **Merge gate:** 21 checks passed; four CI-only checks were not selected locally.
- **Hosted CI:** [run 42303802188](https://github.com/andrewRCr/arc-framework/actions/runs/42303802188)
  passed at `8d0287f9c124c586b55b7b07f36e11913485442d`, dispatched with no diagnostic inputs.
  The optional Windows/macOS pair and Git-floor jobs were not requested; Linux portability ran.
- **Criteria disposition:** 12 met, none superseded or unmet in the combined report.
- **Independent companion:** Pass 1 of 2 returned no findings; stop reason `converged`.

### Success Criteria > 1

- **Criterion digest:** `sha256:7d5b0ddbc5590e53e39ccdc4e1682bdc24c2e40345d46c515a17f0e6bb3fe0b8`.
- **Author state:** `[x]`.
- **Evidence:** Forced merge gate: test:unit passed 1679 files, including shard-coverage.test.ts and synthetic
  missing/doubled/option cases in shards.test.ts.

### Success Criteria > 2

- **Criterion digest:** `sha256:d1c74da497fc6b91cd0687a54b9d58fa6a829582b26a40d07da6b51e31878c54`.
- **Author state:** `[x]`.
- **Evidence:** Current-head parity run 3c86f57e879a47f7be96819e3715da2b executes source and five sequential TS 7
  shards with native peaks and 6000 MiB soft limits; launch-plan, inherited-limit and gap evidence establish the
  Linux backstop.

### Success Criteria > 3

- **Criterion digest:** `sha256:2350e6dfa6f2b99c3bc1a2cf81bd62386993c06593af941d81ac5d4b12c6ca84`.
- **Author state:** `[x]`.
- **Evidence:** Cold landing run fe3e4d6520b047e4b9ffece0c31b2bc4: source 1931 MiB; shards 1802/1189/1563/1921/2028
  MiB; no implementation/configuration/dependency delta from bb1499e747 to verified HEAD. Current gate also reports
  five native m4-mini peaks below 3072 MiB.

### Success Criteria > 4

- **Criterion digest:** `sha256:c85eac1baaf33b10acf9a5376350e73f179fd74318d1e9ca4d6256d545e6fef6`.
- **Author state:** `[x]`.
- **Evidence:** Pinned run 3c86f57e879a47f7be96819e3715da2b, snapshot ac073a81259ac48bf770fe7c0fe1fe8bdf0f0f91, has
  zero implementation/configuration/dependency delta from HEAD. TS 6 source/test baselines pass; TS 7 source/test
  baselines pass; five shard-root and both checkJs-root injections each exit 1 with TS2322 naming the file. No
  retry or fallback.

### Success Criteria > 5

- **Criterion digest:** `sha256:68bd8382684961dffe55f97d181dfbea45d9143d1e8a57334be8f49fe0a7a1e2`.
- **Author state:** `[x]`.
- **Evidence:** Cold landing run fe3e4d6520b047e4b9ffece0c31b2bc4: typecheck:test wall time 24.199 seconds;
  implementation unchanged through verified HEAD.

### Success Criteria > 6

- **Criterion digest:** `sha256:24c17f89a404cf017ccc17670c18d5492b05a000470b9fb68ba260dc65e35112`.
- **Author state:** `[x]`.
- **Evidence:** Retained inherited-2g-node24-small-semi.log proves soft/hard 2147483648-byte limits, five Go
  out-of-memory failures with native peaks and npm exit 2. Node 24.15.0 caller settings: --max-old-space-size=128
  --max-semi-space-size=1 --disable-wasm-trap-handler. Limit and launch modules are unchanged from qualified head
  2c953db69f. This does not claim default Node startup succeeds under 2 GiB.

### Success Criteria > 7

- **Criterion digest:** `sha256:d8238536d6da2f472401af73b29c0110992b73690bf190fdc95c3660efd89f99`.
- **Author state:** `[x]`.
- **Evidence:** Suppression/pruning run 4854d21feb5042e289a6deec2e991d3d: unused entry exits 2; forwarded pruning
  removes it and exits 0, with RSS/V8 lines. Relevant lint implementation unchanged.
- **Evidence:** Hosted Lint & Typecheck job 128189174187 passed. Its log records explicit NODE_OPTIONS
  --max-old-space-size=4096 for both lint steps; lint:ts reports RSS 3616 MiB, heap in use 2575 MiB, actual V8 heap
  limit 4192 MiB.

### Success Criteria > 8

- **Criterion digest:** `sha256:bab1b05c651c9687bd92703efa4e6d046e1557ff809b7582d27b67ceaf3938c0`.
- **Author state:** `[x]`.
- **Evidence:** .github/workflows/ci.yml lines 472-490: typescript-files and typescript each pin 4096 MiB;
  typecheck-tests and typecheck have no step NODE_OPTIONS.

### Success Criteria > 9

- **Criterion digest:** `sha256:b141ec28b791ef9d0bb53e3ca2318d26b986373f44bee8cf870613b68b64a941`.
- **Author state:** `[x]`.
- **Evidence:** TECHNICAL-OVERVIEW.md documents TS 7 source and five test shards beside TS 6 tooling; ADR-041 is
  Accepted (2026-11-06). Forced merge gate passed ADR status and number checks.

### Success Criteria > 10

- **Criterion digest:** `sha256:3697bf2f49f72eb46d4c8ebab6350c4e92bb453c00692628190c9cbf81ec424b`.
- **Author state:** `[x]`.
- **Evidence:** memory-bound.test.ts covers numeric/nested/max/missing/no-unified cgroups and targets
  4608/6000/6000 MiB. Forced merge gate test:unit passed.

### Success Criteria > 11

- **Criterion digest:** `sha256:c81942061d9e0046dd6a46e9f702682d433080faee247c1d89cea7e27cafac97`.
- **Author state:** `[x]`.
- **Evidence:** Forced merge gate passed 21 checks, with four CI-only checks not selected locally. Full
  non-diagnostic hosted CI run 42303802188 completed successfully at 8d0287f9c124c586b55b7b07f36e11913485442d: 24
  jobs passed; optional portability-pair and Git-floor jobs, plus event-specific bookkeeping, were skipped as
  configured. No code change followed this run.

### Success Criteria > 12

- **Criterion digest:** `sha256:58db93fe39223454b81347ff1a639f8238086deb7e85ae3c3f70a2bbbc6c04d1`.
- **Author state:** `[x]`.
- **Evidence:** All eleven preceding acceptance criteria are met, the author aggregate check found no material
  defect, and no implementation blocker remains. This establishes implementer readiness for Candidate preparation;
  independent-companion disposition, Candidate review/publication, fresh integration readiness and exact-head merge
  authorization retain their own boundaries.

### Delivery integrity

- Runtime planted-error probes fail with named TS2322 diagnostics for every shard and both checkJs roots; the
  inherited-limit probe demonstrates bounded abnormal compiler termination.
- Cold landing figures and current-head native observations are measured evidence; live lower-cgroup behavior on
  m5-air is not claimed.
- Machine charge/heap/route proposals remain Owner-owned rollout choices in Landing handoff, with the first m5-air
  job-cgroup check and rollback condition retained.

The combined criteria walk is complete. Candidate review and exact-head integration authorization remain
required before merge. Native peaks are observed lower bounds within the polling interval; the TypeScript 7 parity
qualification establishes the tested verdicts, not permanent equivalence to TypeScript 6.

### Independent companion

- **Pass:** 1 of 2 over the complete selected work-unit criteria, diff and reachable tree.
- **Finding/account/action set:** empty; no responses or finding-driven changes were required.
- **Stop reason:** `converged`.
- **Evidence limits:** fresh-context local read-only inspection of source and retained execution evidence; no tests or
  external revalidation by the reviewer. Hosted CI covers the anchor commit; the notes-only snapshot delta was inspected.
- **Primary checks:** all eight typecheck helper suites appear in the passing unit log. The cold landing head differs
  only in work-unit documents; the parity snapshot differs from the reviewed tree only by its disposable driver.
- **Consumption:** the combined report supports all 12 criterion dispositions. This supplies verification-companion
  evidence, with Candidate review and integration authorization retaining their separate boundaries.

Kept look files in the personal workspace's `adversarial-review/` folder:

- Prompt: `70418692d38937a2002e4c27ecdaf6e977666b7041d4181d2da2111c8383577d.md`.
- Assignment: `a29d401e24971c1e7cde72d990a5bfa0164abd72c73e2bdbb32248bb556fc61e.md`.
- Report: `b6156aaa45ec3aeb5a934f966c50fe4e4196f527904f5b15f3994166984f1953.md`.

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
