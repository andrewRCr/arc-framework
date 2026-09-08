# Notes: local-ci-capacity-qualification

Reference material for the Mac mini runner qualification: measurements taken before any build, the workstation
Hyper-V design retained as the fallback, and the accounting that ruled the workstation out.

## Contents

- [Pre-build measurements](#pre-build-measurements)
- [Workstation accounting](#workstation-accounting)
- [Fallback: Hyper-V guest on the workstation](#fallback-hyper-v-guest-on-the-workstation)
- [Rejected routing shapes](#rejected-routing-shapes)

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

| Signal                                     | Reading 1 | Reading 2 |
| ------------------------------------------ | --------- | --------- |
| Host Available MBytes                      | ~8.0 GB   | 7.35 GB   |
| `vmmemWSL` private bytes                   | 9.3 GB    | 12.1 GB   |
| Non-WSL in use (formula above)             | 14.7 GB   | 13.1 GB   |
| Sum of top-ten process private bytes       | ~10 GB    |           |

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
