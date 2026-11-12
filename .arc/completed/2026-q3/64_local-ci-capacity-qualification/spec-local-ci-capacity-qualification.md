# Spec (`outline`): local-ci-capacity-qualification

- **Origin:** `e2e-feedback-six-shard-rebalance` Errand follow-up

- **Purpose:** Design and qualify an isolated arm64 Linux CI runner in a VM on the always-on M4 Mac mini, and on a
  go result ship the repository routed to it. The motivator is CI speed on a project that waits on thirty or more
  heavy runs on a busy day. A no-go with evidence is a complete outcome.

---

## Problem / Context

Hosted GitHub Linux minutes run out four to five days into each month, so routine CI runs on a paid remote fleet:
two 4-vCPU / 8 GB VPS hosts with two runner services each, four Linux slots under the `arc-ci-linux` label. It is
reliable but slow: a heavy run packs about 867 s of fan-out job work plus a serial head onto four slots for roughly
4.5 to 5 minutes, and one E2E shard job takes 200 to 390 s. The remote-fleet ledger established that the four-slot
packing floor is already reached, so only faster jobs or more slots move wall time.

The first candidate host, the Windows workstation, failed as a safety trial and was then ruled out by accounting:
at 32 GB it cannot hold a 12 GB WSL cap, its 13 to 15 GB ordinary Windows footprint, and a guest large enough to
beat four VPS slots. A RAM upgrade is priced out by the current memory market. That design is retained in the draft
as the fallback.

The M4 Mac mini on the desk is the host: 10-core CPU (4 performance, 6 efficiency), 16 GB unified memory, about
108 GB free, always on, not a development machine, and treated as dedicated to CI whenever CI is active. The one
transferable measurement is that four workstation threads run the heavyweight anchor
`command-input-no-input.e2e.test.ts` in 92 to 97 s against about 350 s hosted; an M4 core is at least as fast for
this subprocess-heavy workload, so a heavy run near 3 minutes on two services is the expected outcome, and about
2 minutes is the floor for this workflow shape on any hardware.

Recorded boundary judgments: the concern stays one work unit (the sibling `self-hosted-ci-qualification` is being
retired by errand; its ledger evidence informed this spec). `Class: Light` holds: the design is composed from
existing runner, VM, and routing patterns, and the open work is measurement.

## Decision(s)

- **Guest: Ubuntu Server arm64 under Lima with the Virtualization framework backend.** 8 vCPU, 8 GB static
  memory, a 60 GB sparse disk image, no host mounts, NAT networking, no port forwards. Lima is the one tool: the
  checked-in recipe is a Lima instance definition and the helpers wrap `limactl`, so no alternative engine or CLI is
  evaluated inside this work unit. No snapshots in the operating path; a rebuild is a fresh instance from the
  recipe.
- **A dedicated non-admin macOS user owns the VM, and the mini is configured for unattended restart.** That user
  holds no SSH keys, no GitHub CLI login, and no access to the primary user's home. FileVault is turned off on the
  mini (it holds no secrets and is not a development machine; with FileVault on, the disk stays locked at boot until
  a password is typed and no launchd mechanism can start anything), macOS automatic login is set to the CI user, and
  a user launchd agent starts the Lima instance at that login. A macOS restart therefore brings the runners back with
  no operator action. The console session on the mini belongs to the CI user, which is accepted. macOS Remote
  Login is enabled for the CI user alone, authenticated by a key held on the workstation, so the measurement phases
  run from an agent session there and reach the guest through Lima's own shell; the guest still forwards no ports.
  That inbound path mirrors the VPS contract's administrative SSH and adds no held credential to the CI user. This
  is the isolation boundary: the mini's primary user and filesystem are unreachable from the guest.
- **Distinct label, one routing variable, never pooled.** Services register repository-scoped from the arm64
  `actions/runner` release with the label `arc-ci-mini` plus the defaults (`self-hosted`, `Linux`, `ARM64`), never
  `arc-ci-linux`. Routing is `ARC_CI_LINUX_RUNNER` set to `arc-ci-mini`; fallback is the same flip to `arc-ci-linux`
  or `ubuntu-latest`. Pooling would let GitHub place a heavy shard on a slow VPS slot and hand back VPS-speed wall
  time on a bad draw. The runbook's fallback cancel step gains the new label, and its registration precondition is
  restated for distinct-label runners: the mini's services register while `arc-ci-linux` stays the live route, and
  the precondition becomes "the routing variable does not already read the label being registered".
- **Two services at one Vitest worker each; a third only on measured headroom.** Two services at the workflow's
  custom-runner default of one worker match the VPS's 4 GB per job. A third service is admitted only if the
  two-service phase shows at least 2.5 GB of guest memory free at peak. `ARC_CI_VITEST_MAX_WORKERS` is
  repository-global and is not touched.
- **The cache-key edit lands on `main` by errand before the first routing flip; everything else ships with go.**
  The six identical `actions/cache` steps in `.github/workflows/ci.yml` key `node_modules` on OS and lockfile only,
  so an x64 cache from the VPS would restore x64 esbuild binaries onto the arm64 guest and skip `npm ci`. Adding
  `runner.arch` to that key is harmless on x64 and must already be on `main` when routing first points at the mini,
  because the routing variable is repository-global: every branch and PR rides the mini during a flipped window and
  would otherwise restore `main`'s x64 cache. It therefore lands as a small errand PR to `main`, not on this work
  unit's branch. On go: an arm64 local-runner section in `.github/self-hosted-ci.md` (download and label variant,
  the Lima recipe, the fallback delta, and the note that macOS updates restart the VM through auto-login and
  launchd), start / status / rebuild helpers as shell scripts under `scripts/local-ci/` with the `lint:sh` glob
  extended to cover them, and a `TECHNICAL-OVERVIEW.md` § 3 Infrastructure update that records the runner fleet it
  currently omits, including the mini.
- **Phase 1, the anchor gate, runs before any runner registration or CI change.** The Lima recipe, launch agent,
  and helpers that operate the guest are authored first, since the trial cannot run without them; on a no-go they
  are removed before closeout. Check the repository out inside the guest,
  build `dist` there, and run the anchor from a shell with the workflow's invocation (`VITEST_MAX_WORKERS=1`,
  `ARC_E2E_SKIP_BUILD=1`): two or three warmups, then at least ten measured repetitions recording wall time, guest
  memory, and swap. Gate: median at or below 120 s with no OOM or swap growth. Above 120 s the work unit stops and
  records a no-go; the fallback design is not entered by this work unit.
- **Phase 2 proves two services and the routed workflow.** Register two services. Two concurrent anchors from
  guest shells must finish with wall time no more than 1.25x the phase-1 median, guest memory below 7 GB at peak,
  and no OOM. Then, with the cache-key errand merged, flip routing to `arc-ci-mini` in a quiet window, dispatch one
  full workflow (a dispatch classifies as heavy, so the whole Linux graph runs; `ci_ok` and `merge-ok` are
  pull-request-only and skip), confirm every executed Linux job reports a guest runner name and a green result, and
  flip back. All repository CI rides the mini for the duration of that window; that is accepted and the window is
  kept short.
- **Phase 3 is the conditional third service**, entered only on the headroom condition above and passing the same
  concurrent-anchor check with three runs.
- **Phase 4 is a bounded head-for-head soak that decides go.** Three to five representative heavy heads, each dispatched
  once to `arc-ci-mini` and once to `arc-ci-linux` on the unchanged four-shard topology. The pair is dispatched serially
  with a routing flip between the two runs, since the workflow's concurrency group cancels overlapping runs of one ref.
  Wall time is the Actions run duration from creation to completion of each dispatch, so both sides of a pair exclude
  the pull-request-only roll-up jobs; the pull-request figures in § Problem are context, not the denominator. Go
  requires the mini's median at or below 70 percent of the VPS median across the pairs, no runner-caused failure, and
  the VM surviving one deliberate macOS restart with all runners back online unattended. Go ships the routing variable
  set to `arc-ci-mini` plus the repository edits, with the VPS pool left registered as fallback. No-go ships the ledger
  with routing unchanged.
- **Maintenance windows use the manual flip.** The mini is always on, so there is no offline routing problem in
  ordinary operation; when the VM is down for maintenance the operator flips routing per the runbook, and every
  Linux job (including classify, lint on docs-only PRs, and the merge roll-ups) queues until then. No automatic
  flip is built.
- **The security boundary is the existing disposable-host contract**, applied to the VM: repository-scoped runner,
  outbound access limited to runner and package tooling, no secrets in the guest or the owning macOS user, and the
  guest powered on continuously as a runner host with nothing else on it.

## Scope boundary (No-gos)

_Frozen at activation; changes after that append: `Amended YYYY-MM-DD — <delta> — <prompt>`_

- No E2E shard-count change and no change to the CI Vitest worker cap.
- No purchase, resize, deregistration, or decommissioning of remote capacity. Closing the paid VPS allocation is a
  later, separately approved errand once the mini has carried live CI for a while.
- No runner on the workstation, in WSL, or in Docker; no pooled routing with the VPS fleet; no hybrid job
  splitting; the Hyper-V fallback design is not built by this work unit.
- No automatic routing flip and no unattended orchestration beyond launchd restarting the VM.
- No architecture-portability work beyond the cache-key edit: the routine Linux legs move to arm64 and the hosted
  portability leg on other operating systems is unchanged.

## Consequences & Risks

- **Routine Linux CI moves to arm64.** Nothing in this codebase is architecture-sensitive and esbuild, Node, git,
  and Vitest ship arm64 builds, but a future x64-only dependency would surface on the runner rather than in local
  development. Accepted; the hosted portability leg and the VPS fallback remain x64.
- **The mini is a single host.** A macOS update, a power event, or a hardware fault takes the fast path down until
  the operator flips routing. Accepted for now; the VPS pool stays registered as the fallback until decommission
  is decided separately.
- **The speed estimate is transplanted.** The 3x per-job figure comes from x64 WSL on a different chip. Phase 1
  tests it in an afternoon before any runner, routing, or repository change exists, so a wrong estimate costs
  little.
- **VM tooling stability is assumed.** Lima's Virtualization backend across macOS updates and the auto-login plus
  launchd path are documented but unmeasured here; the soak's restart test is the first evidence, and a failure
  there is a no-go rather than a workaround.
- **The mini runs with FileVault off and auto-login to a non-admin user.** Physical access to the desk yields a
  console session as the CI user, who holds nothing. Accepted; the machine holds no secrets by design.
- **Thermal behavior under sustained concurrent jobs is unmeasured.** A throttled M4 is still expected to clear
  the gate; if it does not, the ledger records it and the third service is simply not admitted.

## Success Criteria

- Phase 1 records at least ten measured anchor repetitions with median, p95, and guest memory and swap per run,
  and the median is at or below 120 s, or the work unit closes as no-go with that ledger.
- Two registered services carry `arc-ci-mini`, `self-hosted`, `Linux`, and `ARM64`, and none carries
  `arc-ci-linux`.
- The concurrent-anchor check for two services (and three, if entered) is recorded with wall time against the
  phase-1 median and peak guest memory.
- All six `node_modules` cache steps on `main` key on the runner architecture, and one dispatched full workflow on
  `arc-ci-mini` shows every executed Linux job on a guest runner name with a green result.
- The soak ledger holds three to five paired runs with end-to-end wall time on both routes, and the mini's median
  is at or below 70 percent of the VPS median, or the work unit closes as no-go with that ledger.
- The VM survived one deliberate macOS restart with all runners back online with no operator action, recorded with
  timestamps.
- On go: `ARC_CI_LINUX_RUNNER` reads `arc-ci-mini`; the helpers under `scripts/local-ci/` are checked in, covered by
  `lint:sh`, and the ledger records one `status` output and one `rebuild` completion timestamp from them; and
  `.github/self-hosted-ci.md` plus `TECHNICAL-OVERVIEW.md` § 3 describe the mini runner and the existing fleet.
- On either outcome: the measurement ledger and a written go/no-go recommendation are checked in.

## Open items

- The mini's macOS version, free disk, FileVault state, and automatic-login setting are confirmed at
  provisioning; the Virtualization backend needs macOS 13 or later, the image budget is 60 GB against about 108 GB
  free, and FileVault off plus auto-login to the CI user are the settled restart path.
- The measurement ledger lives in `notes-local-ci-capacity-qualification.md` § Measurement ledger, matching the
  prior runner qualification, whose evidence stayed in its notes companion while the runbook received only the
  operating delta.
