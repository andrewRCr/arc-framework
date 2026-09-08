# Draft: local-ci-capacity-qualification

Working evidence for the bounded local-runner feasibility trial.

## Qualification Inputs

- The current remote fleet is two 4-vCPU / 8-GB VPS hosts with two runner services on each host: four Linux runner
  slots total. Four E2E shards naturally occupy those four slots; six shards introduce a second wave. Against the
  latest measured file timings, projected pure-test completion is approximately 600 seconds for six shards versus
  614 seconds for four, before the extra job setup and billing overhead.
- The exact `command-input-no-input.e2e.test.ts` anchor completed locally under WSL2 in 80.17 seconds with
  `VITEST_MAX_WORKERS=1` and `ARC_E2E_SKIP_BUILD=1`, while the same hosted PR job took approximately 350 seconds.
  The local run consumed about 329 aggregate CPU-seconds, or 4.1 logical CPUs on average, despite one Vitest
  worker. E2E subprocess activity therefore already consumes meaningful parallel CPU; the worker cap should not be
  raised casually on a four-vCPU host.
- The workstation is a Core i9-12900K with 24 logical processors and 32 GB physical memory. The current WSL2 guest
  sees approximately 15 GB; its configured 4-GB swap was full during the investigation. Windows reports a present
  hypervisor, while WSL exposes no `/dev/kvm`. Do not install the runner into the development WSL instance.
- GitHub-hosted Linux capacity was temporarily restored after the monthly allowance reset, but current consumption
  indicates it is a short-lived relief valve rather than the routine operating posture.

## Candidate Trial Shape

1. Create a Generation 2 Ubuntu Hyper-V guest with a dedicated virtual disk and NAT-only networking. Start at four
   virtual CPUs, 6 GB memory, and one runner service; do not register it with the repository until isolated
   benchmarks pass.
2. Run two or three warmups and at least ten measured repetitions of the exact anchor. The initial decision target
   is a median no more than 25% slower than the clean local baseline and a p95 no more than 30% slower, with no OOM,
   swap growth, runner disconnect, or unexplained retry.
3. Run the anchor in the guest while WSL executes a representative local quality gate. Stop if Windows available
   memory stays below approximately 4 GB, WSL develops new swap pressure, or the local gate is more than 15% slower
   than its clean baseline. A clean contention trial may require `wsl --shutdown`, so checkpoint and hand off the
   active development session before that boundary.
4. If the one-service trial passes, test an 8-vCPU / 8-GB guest with two runner services. Require at least 1.6x
   aggregate throughput over the single-service case without instability or severe per-job slowdown.
5. Only then add the existing `arc-ci-linux` label, verify the expected runner count, route a manually dispatched
   full workflow to the self-hosted pool, and collect three to five representative heavy runs. Keep four E2E shards
   during this trial so capacity and shard topology are not changed simultaneously.
6. Exercise start, idle detection, stop, restart, and fallback. Never power off the guest while a job is active.

## Security Boundary

Use a repository-scoped runner in a disposable, dedicated guest. Mount no Windows or WSL development paths; forward
no SSH agent; install no personal GitHub CLI authentication or development secrets. Permit only the outbound access
needed by the runner and package tooling. Power the guest on only for intended CI use.

---
