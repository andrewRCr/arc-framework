# Draft: local-ci-capacity-qualification

- **Origin:** `e2e-feedback-six-shard-rebalance` Errand follow-up
- **Purpose:** Design and qualify an isolated Hyper-V Linux CI runner on the primary Windows workstation, and on a
  go result ship the repository routed to it. The motivator is CI speed: a 4 vCPU slice of this host runs the
  heavyweight E2E anchor about 3.5x faster than a hosted job. The first attempt failed as a safety trial, so the work
  front-loads a reclamation proof and an explicit memory partition before any runner is registered. The hard
  constraint is that the 32 GB host is also the development machine; a no-go with evidence is a complete outcome.

---

## Problem / Motivation

Hosted GitHub Linux minutes run out four to five days into each month, so the routine posture is a paid remote
fleet: two 4-vCPU / 8 GB VPS hosts with two runner services each, four Linux slots total. It is reliable and it
solved the budget overrun, but it is slow. The workstation (Core i9-12900K, 24 logical CPUs, 32 GB) is materially
faster than either option, so an on-demand local runner is the obvious speed candidate; that it also costs nothing
per month is secondary. The exact heavyweight anchor `command-input-no-input.e2e.test.ts`
completes in 80 s under WSL2 against roughly 350 s on the hosted PR job.

The first trial ended with WSL terminals crashing until a full machine shutdown, with about 11.8 GB of host memory
retained as unreclaimed anonymous pages. The workstation is the primary development machine, typically running two
to six concurrent WSL agent sessions, any of which may run local quality gates. Whatever the runner costs, it must
not cost that.

Memory, not CPU, is the binding constraint. Observed on 2026-09-08 with six sessions open and no guest running:

| Signal                                          | Value                              |
| ----------------------------------------------- | ---------------------------------- |
| Host physical                                   | 32 GB                              |
| Host available                                  | ~8 GB                              |
| WSL private bytes (`vmmemWSL`)                  | 9.3 GB, cap 16 GB (50% default)    |
| Windows-side private (browser, media, security) | ~10 GB                             |
| WSL swap                                        | 16 GB (raised from 4 GB this week) |

An uncapped WSL at 16 GB plus a 10 GB Windows baseline plus a 6 GB guest sums to the entire host. That is the
incident's shape regardless of which component held the memory.

Pre-build indicators (2026-09-08, WSL, six sessions open, `VITEST_MAX_WORKERS=1`, `ARC_E2E_SKIP_BUILD=1`), pinning
the anchor to four logical CPUs as a proxy for a 4 vCPU guest:

| Placement                     | Anchor wall time | Aggregate CPU |
| ----------------------------- | ---------------- | ------------- |
| Unpinned WSL (prior baseline) | 80 s             | 329 s         |
| Pinned to 4 P-core threads    | 92 s             | 287 s         |
| Pinned to 4 E-cores           | 97 s             | 303 s         |
| Hosted `ubuntu-latest` PR job | ~350 s           |               |
| Remote VPS E2E jobs (3-shard) | 207 s to 392 s   |               |

A 4 vCPU slice of this host runs the anchor roughly 3.5x faster than a hosted job even when scheduled onto E-cores,
so the guest's per-job speed is not the open question. The remote-fleet ledger established that fan-out wall time
is set by slot count rather than per-job speed, so the win this trial can actually deliver is bounded by how many
runner services the memory partition admits, not by CPU.

## Alternatives

- **Hyper-V Generation 2 Ubuntu guest with static memory (chosen).** Strongest isolation available on the host
  without new hardware: separate kernel, separate disk, no shared filesystem, NAT-only reach. Static memory removes
  the balloon interplay between a Dynamic Memory guest and WSL2, which is the leading hypothesis for the incident
  (the Hyper-V wizard enables Dynamic Memory by default with a 1 TB maximum; the trial guest's setting is unknown
  and the guest no longer exists). Cost: the guest's memory is reserved whenever it is powered on, so the host must
  be partitioned explicitly.
- **Runner inside a second WSL distro or Docker Desktop.** Rejected. Both ride the same WSL2 utility VM as the
  development sessions, share its memory cap and kernel, and expose the Windows filesystem through `drvfs`. A
  runaway job would hit the development environment directly and the security boundary would be nominal.
- **Dedicated LAN hardware.** Out of scope: this work unit buys nothing. Recorded as the natural next candidate if
  the shared-host answer is no-go.
- **Hosted-only or remote-fleet-only.** The status quo and the immediate fallback throughout the trial. Neither is
  changed here.

## Design

### Memory partition

Fixed before any guest is created, changed only at a WSL shutdown boundary (all sessions handed off first):

| Consumer     | Allocation                                | Mechanism                                    |
| ------------ | ----------------------------------------- | -------------------------------------------- |
| Windows      | ~10 GB floor (measured, not configured)   | Observed baseline; re-measured per trial     |
| WSL2         | 12 GB cap                                 | `.wslconfig` `memory=12GB`; swap stays 16 GB |
| Guest        | 6 GB static (single service)              | Hyper-V static memory, Dynamic Memory off    |
| Slack        | ~4 GB                                     | Abort threshold guards it                    |

The two-service stage (8 GB guest) is admitted only if the measured Windows baseline still leaves at least 4 GB
of slack at that size; otherwise the qualification ends at one service, which is a valid result. CPUs are not
partitioned: 4 vCPU for the single-service guest, 8 vCPU for the two-service stage, WSL left at its default.

Under a 12 GB cap, six sessions running gates spill into WSL swap rather than OOM-killing a session. That is
measurable degradation and is what the coexistence trial measures.

### Guest lifecycle settings

Generation 2, dedicated VHDX on `C:`, NAT via the Hyper-V default switch, static memory, checkpoints disabled,
Automatic Start Action none, Automatic Stop Action **Shut Down** (never Save State, which writes guest RAM to
disk and resumes it later). Start, idle-check, and stop are scripted; the guest is powered on only for intended
CI use and never powered off while a job is active.

### Phase 0: reclamation proof (no runner installed)

Absorbed from the inbox capture "Require memory-reclamation proof before admitting a local CI runner". Runs
against an idle guest with the runner absent, so the only variable is the hypervisor's memory behavior:

1. Record baseline: host Available MBytes, `vmmemWSL` private bytes, in-WSL `MemAvailable` and swap usage, with
   the normal session load open.
2. Start the guest; run a synthetic memory and CPU load inside it (`stress-ng` at roughly the guest's size) for ten
   minutes; record the same signals plus the guest's `vmmem` private bytes every 30 seconds.
3. Shut the guest down cleanly. Continue recording for five minutes.
4. **Pass:** host Available returns to within 1 GB of baseline within five minutes, the guest's `vmmem` process is
   gone, every WSL session stays responsive, and no host reboot is needed. Three consecutive passing cycles admit
   Phase 1. Any WSL terminal failure fails the phase.

`Inactive(anon)` inside WSL is recorded but is not a pass/fail signal: on 2026-09-08 it read 6.6 GB while `free`
reported 2 GB used, so it does not by itself distinguish retained memory from reclaimable cache.

The original experiment is entered in the ledger as a failed safety trial with cause unattributed.

### Phase 1: single-service anchor benchmark

Register a repository-scoped runner in the guest but do not label it into the live pool. Run two or three warmups
and at least ten measured repetitions of the exact anchor with `VITEST_MAX_WORKERS=1` and `ARC_E2E_SKIP_BUILD=1`.
Record wall time, guest CPU and memory, guest swap, runner connection stability, and the Phase 0 host signals.

Usefulness bar: anchor median at or below half the hosted PR job time (about 175 s) with no OOM, swap growth,
runner disconnect, or unexplained retry. The pinned WSL runs (92 s and 97 s) predict the guest lands well inside it;
a guest median above 175 s would indicate a hypervisor or I/O cost worth understanding before scaling.

### Phase 2: coexistence

Run the anchor in the guest while one WSL session runs a representative local quality gate, then while two do.
Compare gate wall time against a clean same-day baseline. Abort on any of: host Available below 4 GB for more than
60 seconds, WSL swap growth above 1 GB during the run, local gate more than 15% slower than baseline, or any WSL
terminal failure. A failed Phase 2 is a no-go for the tested partition; a retune (smaller guest, lower cap) is one
bounded second attempt, not an open loop.

### Phase 3: two-service scale-up (conditional)

Only if Phases 0 to 2 pass and the 8 GB slack condition holds: resize to 8 vCPU / 8 GB, add the second runner
service, and require at least 1.6x aggregate throughput over single-service without instability or severe
per-job slowdown. Re-run the Phase 0 cycle once at the new size.

### Phase 4: bounded live soak

Add the existing `arc-ci-linux` label, confirm the expected runner count, route a manually dispatched full workflow
via `ARC_CI_LINUX_RUNNER`, and collect three to five representative heavy runs on the unchanged four-shard E2E
topology. Exercise start, idle detection, stop, restart, and hosted fallback.

### Go / no-go and shipping

The ledger from Phases 0 to 4 closes on a go/no-go. **Go** ships the repository routed to the local runner: the
runner label and `ARC_CI_LINUX_RUNNER` routing, the start / idle-check / stop procedure, and a short runbook, with
the remote VPS pool left registered as the fallback. **No-go** ships the ledger and the failed configuration, with
routing unchanged. Either way the paid VPS allocation is untouched; closing it is a later approval-gated errand.

## Security Boundary

Repository-scoped runner in a disposable, dedicated guest. No Windows or WSL development paths mounted, no
forwarded SSH agent, no personal GitHub CLI authentication or development secrets, outbound access limited to what
the runner and package tooling need. The guest is a disposable host under the existing runner trust boundary.

## Unknowns and Assumptions

- The Windows baseline is workload-dependent (Firefox alone held 4 GB). Each phase re-measures it rather than
  assuming 10 GB.
- Whether a 12 GB WSL cap under six-session gate load stays out of swap is unmeasured; Phase 2 answers it.
- WSL runs `networkingMode=mirrored`; its coexistence with the Hyper-V default switch is assumed but unverified
  until the guest is built.
- Host memory compression (1.2 GB observed) and the standby list blur "available"; Available MBytes is the single
  host-side metric used throughout so comparisons stay consistent.
- The incident cause is unattributed. The design removes the two suspected contributors (Dynamic Memory and an
  unpartitioned host) rather than proving either one.
- Assumes `ARC_CI_LINUX_RUNNER` routes by label as it does for the remote fleet; verified at Phase 4 entry.

## Scope boundary (Won't Do)

- No E2E shard-count change, no CI Vitest worker cap change, and no purchase, resize, deregistration, or
  decommissioning of remote capacity.
- No VPS decommission and no fleet purchase or resize; the routing swap on go is the only posture change shipped.
- No runner in the development WSL instance under any outcome.
- No unattended operation: the guest runs only when started for CI use during this trial.

Depends on nothing. `self-hosted-ci-qualification`, which listed this as a dependency, is being retired by errand.

---
