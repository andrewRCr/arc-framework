# Draft: local-ci-capacity-qualification

- **Origin:** `e2e-feedback-six-shard-rebalance` Errand follow-up
- **Purpose:** Design and qualify an isolated Linux CI runner on the always-on M4 Mac mini, and on a go result ship
  the repository routed to it. The motivator is CI speed: on a busy day the project waits on thirty or more heavy
  runs, and a 4 vCPU slice of a modern desktop core runs the heavyweight E2E anchor about 3.5x faster than a hosted
  or VPS job. The mini is not a development machine and will sit idle whenever CI is active, so the design carries
  no host-coexistence machinery. A no-go with evidence is a complete outcome.

---

## Problem / Motivation

Hosted GitHub Linux minutes run out four to five days into each month, so routine CI runs on a paid remote fleet:
two 4-vCPU / 8 GB VPS hosts with two runner services each, four Linux slots under the `arc-ci-linux` label. It is
reliable and it ended the hosted-minutes overrun, but it is slow: a heavy run packs about 867 s of fan-out job work
plus a serial head onto four slots for roughly 4.5 to 5 minutes end to end, and a single E2E shard job takes 200 to
390 s. The remote-fleet ledger established that fan-out wall time is set by slot count and per-job speed together,
and that the four-slot floor is already reached; only faster jobs or more slots move it.

The workstation was the first candidate and failed as a safety trial (WSL crashed until a full shutdown with about
11.8 GB of host memory retained). Re-measured accounting then showed it cannot be the answer at 32 GB: WSL wants a
12 GB cap, the Windows side holds 13 to 15 GB in ordinary use, and what remains cannot host a guest large enough to
beat four VPS slots. A RAM upgrade is priced out by the current memory market.

The M4 Mac mini on the desk is the better host: 10-core CPU (4 performance, 6 efficiency), 16 GB unified memory,
about 108 GB free of 256, always on, and not used for development. It can be treated as dedicated to CI while CI
is active.

Pre-build indicators (2026-09-08, workstation WSL, `VITEST_MAX_WORKERS=1`, `ARC_E2E_SKIP_BUILD=1`), pinning the anchor
`command-input-no-input.e2e.test.ts` to four logical CPUs as a proxy for a 4 vCPU guest:

| Placement                     | Anchor wall time |
| ----------------------------- | ---------------- |
| Pinned to 4 P-core threads    | 92 s             |
| Pinned to 4 E-cores           | 97 s             |
| Hosted `ubuntu-latest` PR job | ~350 s           |
| Remote VPS E2E jobs (3-shard) | 207 s to 392 s   |

Expected outcome if the mini matches that per-job speed: a heavy run near 3 minutes on two services (about 2 to
2.5 minutes on three), and any single job about 3x faster. The floor for this workflow shape is the longest job plus
the serial head, around 2 minutes, on any hardware.

## Alternatives

- **Linux VM on the Mac mini under Apple's Virtualization framework (chosen).** Full guest kernel, dedicated disk
  image, no shared directories, NAT networking, owned by a dedicated non-admin macOS user. Always on, no
  development workload to coexist with, and arm64 Linux is a first-class platform for Node, git, esbuild, and
  Vitest. Cost: the routine Linux legs run on arm64 while most adopters are x64 (the hosted portability leg on other
  OSes still runs; nothing in this codebase is architecture-sensitive), and one workflow cache key needs the
  runner architecture added.
- **Hyper-V guest on the Windows workstation (fallback, recorded).** Static-memory guest with an explicit host
  partition, a reclamation proof before any runner, and coexistence abort thresholds. Viable only with the Windows
  footprint held near 10 GB and a 6 GB guest, which lands roughly even with the VPS on wall time. Kept as the
  fallback if the mini fails its anchor gate.
- **Native macOS runner on the mini.** Rejected: the Linux legs need Linux, and a native runner has no isolation
  from the mini's own filesystem and user.
- **Docker or a container runner on the mini.** Rejected: containers on macOS ride a Linux VM anyway, with a
  default-shared filesystem and a weaker boundary than a plain VM.
- **Pooling the mini with the VPS fleet under `arc-ci-linux`, or hybrid job splitting.** Rejected: GitHub places a
  queued job on any idle matching runner, so a heavy shard can land on a slow slot and hand back VPS-speed wall
  time on a bad draw; splitting trivial jobs to hosted was measured at about 2 percent relief.
- **Hosted-only or remote-fleet-only.** The status quo and the fallback throughout.

## Design

### Guest

Ubuntu Server arm64 under Lima with the Virtualization framework backend: 8 vCPU, 8 GB static memory, a 60 GB
sparse disk image, no host mounts, NAT networking, no port forwards. Owned by a dedicated non-admin macOS user with
no SSH keys, no GitHub CLI login, and no access to the primary user's home; the VM starts at login of that user via
a launchd agent so a macOS restart brings the runner back without operator action. No checkpoints or snapshots
in the operating path; a rebuild is a fresh image from the recipe.

UTM is the same engine with a GUI and is an acceptable substitute. Tart is purpose-built for CI VMs on Apple
silicon and is worth evaluating during provisioning, but its license terms for this use are unverified and it is
not assumed.

### Runner services and routing

The guest registers repository-scoped `actions/runner` services from the arm64 Linux release with the distinct
label `arc-ci-mini` plus the defaults (`self-hosted`, `Linux`, `ARM64`). Never `arc-ci-linux`. Routing selects
it by setting `ARC_CI_LINUX_RUNNER` to `arc-ci-mini`, and fallback is the same one-variable flip to `arc-ci-linux`
or `ubuntu-latest` per the runbook, whose cancel step and registration precondition gain the new label.

Two services at the workflow's custom-runner default of one Vitest worker each, matching the VPS's 4 GB per job. A
third service is a conditional step admitted only if the two-service phase shows per-job memory headroom. The
repository-global `ARC_CI_VITEST_MAX_WORKERS` is not touched.

### Repository edits

- The `node_modules` cache key adds `runner.arch`, so an x64 cache from the VPS never restores x64 esbuild binaries
  onto the arm64 guest.
- The runbook gains an arm64 local-runner section: download URL and label variant, the mini's provisioning recipe,
  the fallback delta, and the maintenance note that macOS updates restart the VM through launchd.
- Start, status, and rebuild helpers for the VM live under `.github/local-ci/`.
- `TECHNICAL-OVERVIEW.md` § 3 Infrastructure records the runner fleet it currently omits, including the mini.

### Phases

1. **Anchor gate (no runner, no repo change).** Build the guest, check the repository out inside it, build `dist`,
   and run the anchor from a shell with the workflow's invocation: two or three warmups, then at least ten measured
   repetitions. Gate: median at or below 120 s with no OOM or swap growth. Above 120 s the mini is not faster
   enough to justify the rest; stop and record.
2. **Two-service throughput.** Register two services. Run two concurrent anchors from guest shells: wall time no
   more than 1.25x the single-run median, guest memory below 7 GB peak, no OOM. Then route a manually dispatched
   full workflow to `arc-ci-mini` and confirm every Linux job reports the guest's runner names and green results,
   including the cache-key fix taking effect.
3. **Third service (conditional).** Only if phase 2 peak memory leaves at least 2.5 GB per additional job. Same
   throughput check with three concurrent anchors.
4. **Bounded soak and go/no-go.** Three to five representative heavy runs on `arc-ci-mini` on the unchanged
   four-shard topology, each paired with the same head on `arc-ci-linux`. Go requires the mini's median end-to-end
   wall time at or below 70 percent of the VPS median, no runner-caused failure, and the VM surviving a deliberate
   macOS restart with the runners back online unattended. Go ships routing set to `arc-ci-mini`, the helpers, the
   runbook section, and the overview update, with the VPS pool left registered as fallback. No-go ships the ledger
   with routing unchanged.

## Security Boundary

Repository-scoped runner in a disposable Linux VM under a dedicated non-admin macOS user. No host directories
mounted, no port forwards, no forwarded SSH agent, no personal GitHub CLI authentication or development secrets in
the guest or in that macOS user, outbound access limited to what the runner and package tooling need. The mini's
primary user and filesystem are unreachable from the guest.

## Unknowns and Assumptions

- The 3x per-job speedup is a WSL x64 measurement transplanted onto an arm64 VM on a different chip; phase 1 is the
  gate that tests it and costs an afternoon.
- The mini's macOS version is unverified; the Virtualization backend needs macOS 13 or later, and launchd-at-login
  behavior for the dedicated user is assumed from documentation.
- Long-running VM stability under Lima's Virtualization backend across macOS updates is assumed; the soak's
  restart test is the first evidence.
- Sustained thermal behavior of the mini under two or three concurrent E2E jobs is unmeasured; a throttled M4 is
  still expected to clear the gate.
- Tart's license terms for this use are unverified; it is an evaluation candidate, not a dependency.
- Assumes `ARC_CI_LINUX_RUNNER` routes by label exactly as it does for the VPS fleet (confirmed in the workflow's
  `runs-on` expressions) and that no other cache or artifact step is architecture-keyed beyond `node_modules`.

## Scope boundary (Won't Do)

- No E2E shard-count change and no change to the CI Vitest worker cap.
- No purchase, resize, deregistration, or decommissioning of remote capacity. Closing the paid VPS allocation is a
  later, separately approved errand once the mini has carried live CI for a while.
- No runner on the workstation, in WSL, or in Docker; no pooled routing with the VPS fleet; no hybrid job
  splitting.
- No automatic routing flip: the mini is always on, and maintenance windows use the manual flip.

Depends on nothing. `self-hosted-ci-qualification`, which listed this as a dependency, is being retired by errand.

---
