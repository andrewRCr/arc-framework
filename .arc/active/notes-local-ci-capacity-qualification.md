# Notes: local-ci-capacity-qualification

Reference material for the Mac mini runner qualification: the trial's measurement ledger, measurements taken
before any build, the workstation Hyper-V design retained as the fallback, and the accounting that ruled the
workstation out.

## Contents

- [Measurement ledger](#measurement-ledger)
- [Pre-build measurements](#pre-build-measurements)
- [Workstation accounting](#workstation-accounting)
- [Fallback: Hyper-V guest on the workstation](#fallback-hyper-v-guest-on-the-workstation)
- [Rejected routing shapes](#rejected-routing-shapes)

## Measurement ledger

Evidence home for the trial. Every phase writes its readings here as they are produced; an em dash marks a value
not yet recorded.

**Sanitization rule, applying to this whole section:** record sanitized values only. Never a host endpoint,
hostname, account name, registration token, key, or filesystem path outside this repository. Runner names, GitHub
run ids, durations, and label sets are already visible in the repository's Actions surface and are recorded as-is.

### Provisioning readings

Host prerequisites, taken at the mini console before any change:

| Signal          | Reading                                          |
| --------------- | ------------------------------------------------ |
| macOS version   | 15.6.1 (build 24G90) — vz backend supported      |
| Free disk       | 93 GiB available of 228 GiB                      |
| FileVault state | Off before any change; no decryption wait needed |

Account isolation, established at the console before any remote access:

- CI user created Standard (non-admin); first login completed with iCloud, Siri, and analytics all declined.
- Home directories defaulted to `drwxr-x---` group `staff` — a group every ordinary macOS account joins — so the
  CI user could read the admin home. Admin home tightened to `700`; the cross-account read is now refused and the
  directory's ACL carries no `allow` entries.
- Mounted external volumes defaulted to ignore-ownership, which discards on-disk modes entirely. Ownership
  enabled per volume and each volume root set to `700`; cross-account read refused. The volumes stay mounted.
- Unattended boot: automatic login to the CI user, automatic sleep disabled, wake for network access on, and
  automatic restart after a power failure on.
- Remote access: Remote Login restricted to the CI user with full disk access for remote users off; a dedicated
  key proves a passwordless session, and password and keyboard-interactive authentication are disabled through an
  `sshd_config.d` drop-in. The host and account reach the agent session only as an `~/.ssh/config` alias.
- Link: wired Ethernet on a fixed address (DHCP with manual address, so the router still supplies DNS). Wi-Fi is
  off, so no wireless variance reaches the Phase 4 timings.
- Toolchain: Homebrew and Lima installed by the admin account; `limactl 2.2.0` runs as the CI user by absolute
  path out of the Homebrew prefix.
- A third-party network-filtering extension runs on the host and the guest's egress passes through it. Recorded as
  a candidate explanation for any anomalous Phase 4 timing or transfer failure, so such a result is not misread as
  guest capacity.

Guest readings at first boot, taken inside the instance:

| Signal                    | Reading                                                            |
| ------------------------- | ------------------------------------------------------------------ |
| `nproc`                   | 8                                                                  |
| `free -g` total           | 7 GiB usable of the 8 GiB allocation                               |
| `df -h /` size and free   | 58 G total, 55 G available                                         |
| `swapon --show`           | empty — no swap device                                             |
| Host mounts present       | none                                                               |
| New listeners on the mini | 3, all loopback: TCP `50918`, TCP `50919`, UDP `57349` (`limactl`) |

The listener figure is a before/after difference across a guest stop and start, not a single reading: the host runs
a full desktop session whose widgets and Continuity services cycle wildcard UDP sockets continuously, so an
unbaselined snapshot cannot separate them from the guest's own. Nothing the guest adds binds a routable interface.

Outbound from the guest works (HTTPS to the GitHub API in 0.16 s, public DNS resolution), which is all the later
phases need; nothing inbound reaches it.

_Swap posture:_ the guest carries no swap device. Memory pressure therefore surfaces as an OOM kill rather than
swap growth, so the anchor gate's memory condition is read from `journalctl -k`, not from a swap figure.

Helper proof:

```text
== instance ==
NAME      STATUS     SSH                VMTYPE    ARCH       CPUS    MEMORY    DISK     DIR
arc-ci    Running    127.0.0.1:50918    vz        aarch64    8       8GiB      60GiB    ~/.lima/arc-ci

== guest ==
 16:29:12 up 15 min,  1 user,  load average: 0.00, 0.00, 0.00
               total        used        free      shared  buff/cache   available
Mem:            7912         481        7004           0         589        7431
Swap:              0           0           0

== runner services ==
```

The empty runner section is correct at this point: no service is registered until Phase 3.

`rebuild.sh` completed at `2026-09-08T21:31:44Z`. The replacement instance came up fully provisioned — service account
present, application directories at mode `0750`, resource sampling live, guest uptime two minutes — so the rebuild
produces a fresh instance from the recipe rather than restarting the old one. Elapsed time was not instrumented on
this run; the image was already cached, so it excludes the download the first build paid.

### Anchor gate

Anchor `command-input-no-input.e2e.test.ts` inside the guest, at the workflow's exact invocation
(`VITEST_MAX_WORKERS=1`, `ARC_E2E_SKIP_BUILD=1`, `dist` prebuilt). Warmups discarded; at least ten measured runs.
Wall time from `/usr/bin/time -f %e`; memory and swap are per-run peaks from a `free -m` sampler at 5 s.

Guest staged with a `git archive` of `main` at `143aaba08`, Node v24.20.0 for arm64 installed from the official
tarball against its published SHA-256, then `npm ci` and a package build. Node 24 is what the workflow resolves
today: the E2E jobs request `lts/*` and the classify job pins `24`. That equivalence expires when the next LTS
promotion moves `lts/*`, so these figures are Node 24 readings, not "whatever CI uses" readings.

Three warmups discarded. Ten measured runs:

| Run | Wall time (s) | Peak used memory (MB) | Peak swap used (MB) |
| --- | ------------- | --------------------- | ------------------- |
| 1   | 56.37         | 1413                  | 0                   |
| 2   | 56.26         | 1448                  | 0                   |
| 3   | 56.44         | 1387                  | 0                   |
| 4   | 56.26         | 1453                  | 0                   |
| 5   | 56.41         | 1400                  | 0                   |
| 6   | 56.39         | 1438                  | 0                   |
| 7   | 56.53         | 1539                  | 0                   |
| 8   | 56.35         | 1404                  | 0                   |
| 9   | 56.35         | 1493                  | 0                   |
| 10  | 56.40         | 1437                  | 0                   |

- Median: 56.38 s · p95: 56.53 s (nearest-rank; at ten samples the top sample is p95)
- Spread across the whole series, warmups included, is 0.27 s. The guest holds eight dedicated vCPU against no
  competing load and the anchor touches no network, so there is little left to vary.
- Every run exited zero, and a separately captured run reports 77 tests in 1 file passing. A fast run that had
  quietly executed fewer tests would clear the gate without measuring it.
- OOM events in `journalctl -k` across the series: none. Peak memory across all runs was 1539 MB against an 8 GiB
  allocation, so the series never approached the memory condition.
- Gate verdict: **continue.** The median is 56.38 s against a 120 s threshold — 47 percent of it — with no OOM and,
  in a guest with no swap device, no swap growth possible.

For reference, the same anchor measured 80 s unpinned on the workstation under WSL, and full hosted and remote-VPS
E2E jobs ran 207–392 s. Per-job speed is not the trial's decision, though: Phase 4's threshold is a ratio over full
workflow runs, where the serial head and slot count dominate.

### Concurrent services

Simultaneous anchor runs from separate guest shells, runner services idle. Each concurrent job runs from its own
checkout, the way two runner services use separate work directories: sharing one checkout lets the test runner's
cache serialize the jobs, which is indistinguishable from CPU contention in the wall time. Threshold: each run
within 1.25x the anchor-gate median (70.48 s), guest below 7 GB at peak, no OOM.

Two services — 1 warmup and 3 measured rounds, 6 jobs, all passing:

| Measure           | Result                       | Criterion | Verdict   |
| ----------------- | ---------------------------- | --------- | --------- |
| Per-job wall time | 78.32 s median (78.18–78.52) | ≤ 70.48 s | **fails** |
| Ratio to gate     | 1.389x                       | ≤ 1.25x   | **fails** |
| Peak guest memory | 2351 MB of 7912              | < 7 GB    | passes    |
| OOM events        | none                         | none      | passes    |
| Free at peak      | 3763 MB                      | ≥ 2500 MB | passes    |

The per-job threshold fails and is recorded as failed. It was calibrated before the host's core layout was known:
the base M4 carries four performance cores and six efficiency cores, and this anchor drives about four logical
CPUs, so one run fits the performance cores and a second spills onto efficiency cores. No allocation change
recovers this — it is a property of the chip.

The threshold is nonetheless the measurement that mattered most in this phase, because it exposes what slot counts
conceal: slots on one box are not independent.

| Slots | Per-job wall | Throughput | vs 1 slot | Fraction of independent slots | Free at peak |
| ----- | ------------ | ---------- | --------- | ----------------------------- | ------------ |
| 1     | 56.38 s      | 0.0177 j/s | 1.00x     | 100%                          | —            |
| 2     | 78.32 s      | 0.0255 j/s | 1.44x     | 72%                           | 3763 MB      |
| 3     | 107.4 s      | 0.0279 j/s | 1.57x     | 52%                           | 2907 MB      |
| 4     | 142.4 s      | 0.0280 j/s | 1.58x     | 40%                           | 2141 MB      |

Throughput saturates at three slots; a fourth adds 0.5 percent and drops free memory below the 2500 MB bar
independently. The guest's useful ceiling is therefore two or three slots, not its vCPU count.

Three services were measured but not registered — the measurement does not require a runner service, so no third
service was created and none needs removing.

**Load-induced test failure at three slots.** Across 36 anchor jobs at concurrency 3, two failed; 13 solo jobs, 8
two-slot jobs, and 16 four-slot jobs all passed. The failure is a wall-clock assertion, not a defect: the CLI
produced the correct stderr and exit code, but the spawned subprocess exceeded the fixed 10 000 ms budget the E2E
helper enforces, and the test asserts the subprocess did not time out.

| Configuration | Anchor slowdown | Implied subprocess time | Margin against the 10 s budget |
| ------------- | --------------- | ----------------------- | ------------------------------ |
| Solo          | 1.00x           | ~5.6 s                  | 44%                            |
| Two slots     | 1.39x           | ~7.8 s                  | 22%                            |
| Three slots   | 1.90x           | ~10.6 s                 | exceeded                       |

Every failed job across the last 120 workflow runs was checked on both routes. The signature appears in none of
them: hosted E2E failures are unrelated assertion failures, and no self-hosted failure carries it. Hosted gives
each job a dedicated machine, so the budget is never approached there. This configuration is the first that
applies enough pressure to reach it.

**Slot decision: two services.** A third buys 9.4 percent throughput and costs roughly a 5 percent per-job failure
rate, and a runner-caused failure disqualifies go regardless of ratio. The margin also protects tests not measured
here — the budget was found in one file, while a routed workflow runs the whole suite under the same contention.
Two slots retain 22 percent headroom for those. The third slot remains available later as a tuning step once the
timing fragility is addressed on its own terms; raising the budget weakens a real guard, since the assertion exists
to catch a CLI that fails to terminate promptly.

### Runner registration

Executable-principal audit, taken immediately before registration. Registration is fail-closed: every principal able
to submit executable pull-request code must be explicitly trusted.

| Check                        | Finding                                      |
| ---------------------------- | -------------------------------------------- |
| Repository                   | Private; no forks; no deploy keys            |
| Collaborators                | One, admin                                   |
| Pending invitations          | None                                         |
| Pull-request authorship (30) | All the same account                         |
| Dependabot                   | No configuration                             |
| Workflow trigger             | `pull_request`, not `pull_request_target`    |
| Default workflow permissions | Read; cannot approve pull requests           |
| App installations            | One, confirmed by the maintainer — see below |

The app-installation check could not be resolved from the available token, which refuses to enumerate installations
without app authorization. That principal was confirmed by the maintainer rather than inferred from its name: a
GitHub App with write access can place executable code on a pull-request head, which a persistent self-hosted runner
then executes, so the gap was closed by asking rather than by assuming.

Two services registered under the distinct label alone, each from a separate short-lived token requested at the
point of use and passed on standard input rather than as an argument, so no token entered a command line or a shell
history. Both returned online and idle within twenty seconds of a deliberate guest reboot, with no operator action.

Actions is configured to allow all actions with SHA pinning not enforced, though the workflows pin their actions by
digest in practice. On a persistent self-hosted runner every referenced action executes on the host, so that
pinning discipline is load-bearing; enforcing it is captured separately as out-of-scope for this work unit.

### Routed dispatch

One `workflow_dispatch` of the full workflow with routing pointed at the guest, two runner services.

- Routing variable prior state: **absent** (hosted). Restored by deletion, not by resetting a value.
- Window: 00:05:02Z to 00:16:45Z, 11 minutes 43 seconds. Nothing was left queued and both runners returned idle.
- Run duration: **641 s**, conclusion success.
- Every executed job ran on a guest runner; none landed on hosted or on the remote pool.

| Job                                      | Runner        | Result  | Duration |
| ---------------------------------------- | ------------- | ------- | -------- |
| Classify lane & weight                   | arc-ci-mini-2 | success | 13 s     |
| Shared setup                             | arc-ci-mini-1 | success | 26 s     |
| Unit Tests                               | arc-ci-mini-1 | success | 80 s     |
| Portability (concurrency guards) (linux) | arc-ci-mini-2 | success | 24 s     |
| Integration Tests                        | arc-ci-mini-1 | success | 176 s    |
| Lint & Typecheck                         | arc-ci-mini-2 | success | 65 s     |
| E2E Tests (1)                            | arc-ci-mini-2 | success | 156 s    |
| E2E Tests (2)                            | arc-ci-mini-2 | success | 172 s    |
| E2E Tests (3)                            | arc-ci-mini-2 | success | 170 s    |
| E2E Tests (4)                            | arc-ci-mini-1 | success | 172 s    |

**Per-job speed against hosted**, matched by job name from a hosted pull-request run of the same workflow:

| Job                                      | Guest  | Hosted | Speed-up |
| ---------------------------------------- | ------ | ------ | -------- |
| E2E Tests (3)                            | 170 s  | 495 s  | 2.9x     |
| E2E Tests (4)                            | 172 s  | 444 s  | 2.6x     |
| E2E Tests (1)                            | 156 s  | 397 s  | 2.5x     |
| E2E Tests (2)                            | 172 s  | 421 s  | 2.4x     |
| Lint & Typecheck                         | 65 s   | 156 s  | 2.4x     |
| Integration Tests                        | 176 s  | 355 s  | 2.0x     |
| Portability (concurrency guards) (linux) | 24 s   | 41 s   | 1.7x     |
| Unit Tests                               | 80 s   | 123 s  | 1.5x     |
| Shared setup                             | 26 s   | 35 s   | 1.3x     |
| Classify lane & weight                   | 13 s   | 15 s   | 1.2x     |
| **Total job work**                       | 1054 s | 2482 s | **2.4x** |

**Cache behaviour: the architecture-keyed cost is negligible and paid once.** `Shared setup` reported
`Cache not found` for the new architecture key — a genuinely cold first population — then completed `npm ci` in
**2 s** for 322 packages and saved both the dependency and package-manager caches. Every downstream job restored
from them. The run is therefore representative rather than pessimistic; a warm run saves seconds, not minutes.

**Reading the two numbers together.** The guest does 2.4x less work than hosted yet finishes in about the same wall
time, because the two are bound by different things: hosted runs every job at once and is bounded by its longest
job, while the guest has two slots and is bounded by them. Effective parallelism here was 1.64x, consistent with
the 1.44x measured on pure anchor rounds and higher only because the job graph has serial phases where one job runs
alone. Against the remote pool — the route actually in daily use once hosted minutes are exhausted — the guest is
roughly four times faster.

Comparability, stated once: this was a `workflow_dispatch`, so the pull-request-only roll-ups skip. They cost 10 s
on hosted and 5 s on the remote pool, about 1.4 percent and 0.2 percent of their runs, so the comparison holds
within that. The historical medians quoted here come from an older job graph than today's and are a sighting only;
Phase 4's paired dispatches at one head are what settle the ratio.

### Soak

Three to five representative heads, each dispatched once per route with a routing flip between the runs. Duration is
`createdAt` to `updatedAt` from the runs API, which lands within seconds of completion and is the stated proxy for
it. The architecture is part of the `node_modules` cache key, so the guest's first run per lockfile hash pays a cold
install the other route does not.

| Head | Mini run id | Mini duration | Mini cache | VPS run id | VPS duration | VPS cache |
| ---- | ----------- | ------------- | ---------- | ---------- | ------------ | --------- |
|      | —           | —             | —          | —          | —            | —         |

- Mini median: — · VPS median: — · ratio: — (go threshold at or below 0.70)
- Runner-caused failures (any disqualifies go regardless of the ratio): —

### Restart test

One deliberate macOS restart, issued while routing is off the guest.

| Event                    | Timestamp |
| ------------------------ | --------- |
| Restart issued           | —         |
| SSH to the CI user back  | —         |
| Instance reports running | —         |
| Each runner online       | —         |

### Recommendation

| Criterion              | Threshold                                  | Measured | Verdict |
| ---------------------- | ------------------------------------------ | -------- | ------- |
| Anchor median          | at or below 120 s, no OOM, no swap growth  | —        | —       |
| Concurrent services    | each within 1.25x median, guest below 7 GB | —        | —       |
| Routed dispatch        | every Linux job on a guest runner, green   | —        | —       |
| Soak ratio             | at or below 0.70                           | —        | —       |
| Runner-caused failures | none                                       | —        | —       |
| Restart recovery       | all runners back with no operator action   | —        | —       |

**Verdict:** —

## Pre-build measurements

Anchor `command-input-no-input.e2e.test.ts`, 2026-09-08, workstation WSL2 (Core i9-12900K, 24 logical CPUs), six
agent sessions open, `VITEST_MAX_WORKERS=1`, `ARC_E2E_SKIP_BUILD=1`, `dist` prebuilt:

| Placement                                 | Wall time | Aggregate CPU |
| ----------------------------------------- | --------- | ------------- |
| Unpinned WSL (earlier baseline)           | 80 s      | 329 s         |
| `taskset -c 0-3` (4 P-core threads)       | 92 s      | 287 s         |
| `taskset -c 16-19` (4 E-cores)            | 97 s      | 303 s         |
| Hosted `ubuntu-latest` PR job (whole job) | ~350 s    |               |
| Remote VPS E2E jobs, 3-shard era          | 207–392 s |               |

The anchor drives about four logical CPUs at one Vitest worker because the E2E suite spawns CLI subprocesses; a
4 vCPU slice is therefore the right proxy for a small guest. The remote-fleet ledger (in the retired
`self-hosted-ci-qualification` stub's notes; history keeps it) established that fan-out wall time is slot-bound
once per-job speed is fixed: seven fan-out jobs carry about 867 s of work, four slots pack to a ~217 s floor, and
the longest job plus the serial head bounds any configuration near two minutes for this workflow shape.

## Workstation accounting

Measured 2026-09-08 on the 32 GB workstation with six WSL sessions open and no guest running. The operational
non-WSL baseline is `total − Available MBytes − vmmemWSL private bytes`; summing process private bytes undercounts
it by 3 to 5 GB (kernel pools, memory compression, drivers, the long tail of processes).

| Signal                               | Reading 1 | Reading 2 |
| ------------------------------------ | --------- | --------- |
| Host Available MBytes                | ~8.0 GB   | 7.35 GB   |
| `vmmemWSL` private bytes             | 9.3 GB    | 12.1 GB   |
| Non-WSL in use (formula above)       | 14.7 GB   | 13.1 GB   |
| Sum of top-ten process private bytes | ~10 GB    |           |

WSL2 has no `memory=` cap in `.wslconfig` (default 50 percent, 16 GB), `swap=16GB` (raised from 4 GB after the
incident), `networkingMode=mirrored`, and `autoMemoryReclaim` unset. Inside WSL, `free` reported about 2 GB used
while `Inactive(anon)` read 6.6 GB, so the WSL VM holds several GB of reclaimable cache from the host up to its cap;
a partition must budget the cap, not observed usage. With a 12 GB cap and a 13 to 15 GB Windows footprint, 5 to
7 GB remains for a guest plus slack, which cannot host two runner services. Autostart apps (Steam, Razer, Apple
Music) account for about 2 GB of the footprint and Firefox about 4 GB. The board is a Z690-E with two of four DIMM
slots holding a 2x16 GB DDR5 kit; a 2x32 GB kit was priced at roughly 900 to 1100 USD at the time and rejected.

The failed first trial: WSL terminals crashed until a full machine shutdown with about 11.8 GB retained as
`inactive_anon`. Cause unattributed. The guest no longer exists and its memory mode is unknown; the Hyper-V wizard
enables Dynamic Memory by default with a 1 TB maximum, which is the leading hypothesis.

## Fallback: Hyper-V guest on the workstation

Retained in case the mini fails its anchor gate. Viable only with the Windows footprint held near 10 GB and a
single service, which lands roughly even with the four-slot VPS on wall time.

- **Partition, fixed before the guest exists and changed only at a WSL shutdown boundary:** WSL capped at 12 GB via
  `.wslconfig` `memory=12GB` (swap stays 16 GB), guest 6 GB static memory, Windows floor measured per trial with the
  formula above, slack guarded by the abort thresholds. `autoMemoryReclaim` stays unset.
- **Guest settings:** Generation 2 Ubuntu, dedicated VHDX on `C:`, NAT via the default switch, static memory (never
  Dynamic Memory), checkpoints off, Automatic Start Action none, Automatic Stop Action Shut Down (never Save
  State), 4 vCPU. Never powered off while a job is active.
- **Reclamation proof before any runner, three consecutive passing cycles:** five-minute baseline with sessions
  open but idle; guest started and `stress-ng` run for ten minutes with one VM worker touching guest RAM minus
  1 GB plus CPU workers equal to the vCPU count; clean shutdown; five minutes of observation. Pass: host Available
  returns to within 1 GB of the baseline mean within five minutes, the guest's `vmmem` process is gone, a
  `wsl.exe -e true` probe completes within 5 s in every open session at each 30 s sample, and no host reboot is
  needed. Sampled signals: host Available MBytes, `vmmemWSL` and guest `vmmem` private bytes, in-WSL `MemAvailable`
  and swap. A cycle whose baseline drifts more than 1 GB from session activity is rerun, not scored. `Inactive(anon)`
  is recorded but not a pass/fail signal.
- **Coexistence abort thresholds:** host Available below 4 GB for more than 60 s, WSL swap growth above 1 GB, a
  local quality gate more than 15 percent slower than a clean same-day baseline, or any WSL terminal failure. One
  bounded retune (smaller guest or lower cap) is allowed, not an open loop.
- **Rejected on the workstation:** a runner in a second WSL distro or Docker Desktop (shares the WSL VM, its cap,
  and `drvfs`); pooling under `arc-ci-linux`; a RAM upgrade on price.

## Rejected routing shapes

- **Trivial jobs on hosted, heavy jobs self-hosted:** about 2 percent relief, because `classify` and `setup` are
  serial dependencies of the fan-out.
- **Pooling a fast runner with the VPS fleet under one label:** GitHub places a queued job on any idle matching
  runner, so a heavy shard can land on a slow slot and wall time falls back to VPS speed on a bad draw.
- **Label-splitting E2E shards to the fast runner and the rest to the VPS:** the only shape with merit, and only
  while the VPS exists; it adds a second routing variable and a second failure mode.

---
