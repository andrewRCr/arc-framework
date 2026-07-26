# Notes: self-hosted-ci-qualification

Working evidence and inbound qualification data for the planned work unit.

---

## Inbound Buffer — Pending Integration

> _Routed-in concerns pending holistic integration into the body at this WU's next planning iteration._

### `[ ]` **Fold PR #354 contention evidence into the self-hosted CI qualification ledger**

- _Routed from:_ `USER-INBOX § Work Unit`, housekeep drain (2026-07-26).

- _Observation:_ PR #354 produced three adjacent heavy-run samples that are not in the archived canary ledger.
  [30164851559](https://github.com/andrewRCr/arc-framework/actions/runs/30164851559) failed the unit
  `validate-config.sh` custom-`ARC_DIR` subprocess case at Vitest's default five-second timeout.
  [30165898418](https://github.com/andrewRCr/arc-framework/actions/runs/30165898418) passed that adjusted unit case
  under contention, then failed the analogous integration custom-`ARC_DIR` subprocess case after 6.027 seconds
  against the same default timeout.
  [30166884131](https://github.com/andrewRCr/arc-framework/actions/runs/30166884131) passed the complete exact-head
  graph after both focused cases received 15-second budgets; `merge-ok` completed roughly 8m40s after run creation.

- _Diagnosis to preserve:_ the host runs two runner services on one OVH VPS-2 allocation (4 shared vCPU / 8 GB).
  Vitest defaults each test job to `availableParallelism() - 1`, so two simultaneous test jobs can request six
  workers plus their parents and shell subprocesses on four shared vCPU. PR #354 also waited behind a distinct
  heavy PR, demonstrating that the two slots are shared across PRs and that cross-PR demand contributes queue
  latency. The failures are evidence of load-sensitive test/process timing and possible per-job starvation, not
  yet proof of a runner-caused flake or a need to resize.

- _Approach:_ import all three runs into the run/attempt and reliability ledgers, retain the failed attempts even
  though they are ineligible latency samples, and correlate their Actions placement/timestamps with the retained
  `sysstat` and runner journals. Distinguish guest CPU saturation from CPU steal/noisy-neighbor pressure. If the
  canary warrants the scope contract's single tuning pass, evaluate a lower Vitest worker cap (for example,
  `maxWorkers=2`) before paid VPS expansion; resize only if telemetry shows per-job resource starvation that worker
  tuning cannot resolve.

- _Sizing question, settled by measurement (2026-07-25):_ the open question was whether to move
  4 vCPU / 8 GB / 1 Gbit → 6 vCPU / 12 GB / 2 Gbit. Per-job timings from run
  [30168740112](https://github.com/andrewRCr/arc-framework/actions/runs/30168740112) (8m33s, all green) settle it
  against the core bump. `setup` completes at ~39s; the seven Linux fan-out jobs then contend for two runner slots
  and every one starts within 1–2s of a slot freeing — Integration 40s, Unit 41s, Lint & Typecheck 122s, E2E(2)
  207s, E2E(1) 273s, Portability 360s, E2E(3) 392s. Those seven carry 867s of job work against an observed 464s
  fan-out span, versus a 434s two-slot floor: roughly 93% packing. No scheduling slack to reclaim, and no failure or
  memory symptom in this run. Wall time is set by slot count, not by per-job speed.

- _Projection from that data:_ four slots put the fan-out floor near 217s (~4.4 min end to end); seven slots bound
  it by the longest single job (E2E(1), 179s) at ~3.8 min. A second identical box therefore captures most of the
  available win and a third is worth ~35s. A 6-vCPU single box leaves the slot count at two — even granting a
  generous 1.3x per-job speedup that lands near 6.4 min, worse than the second box for comparable money. Prefer
  slots over cores.

- _Correction — routing the trivial jobs to hosted is not the free win it first looked like:_ `classify` (8s),
  `planning-classify` (15s), `setup` (28s), `ci_ok` (2s), and `merge-ok` (3s) total 56s against 923s, and
  `classify` + `setup` are serial dependencies of the fan-out, so relocating them frees no fan-out capacity at all.
  Genuine slot relief is roughly 20s, about 2%. The real free lever is job work itself: the three E2E shards carry
  443s of the 867s fan-out — **51% of the cost** — so deferring heavy legs during review-fix iteration (the existing
  `ci-defer-heavy` label) or making E2E cheaper buys more than any hosted-routing rearrangement, and unlike rented
  capacity it is a one-time fix with no recurring cost.

- _Worker-cap experiment (2026-07-25, PR #359):_ `vitest.config.ts` now caps `maxWorkers` to `50%` under `CI`, with
  `VITEST_MAX_WORKERS` overriding per runner — two services x three default workers had been oversubscribing four
  shared vCPU. Wall time was unchanged (8m33s against the ~8m40s recorded above), which is the predicted outcome:
  the cap targets contention-induced flakes, not throughput. One green run does not evidence the stability claim —
  keep sampling before crediting it. The cap also introduces an invariant to hold: services-per-box x worker-share
  should stay near 100%, so a box running a single service wants `VITEST_MAX_WORKERS=100%`.

- _Local anchor, and why it must not be cited as a runner benefit:_ on a 24-core dev box the unit tier costs 210s
  aggregate CPU at 23 workers against 47s at 2, because each worker re-transforms and re-imports the shared module
  graph. That 4.5x saving scales with worker count and nearly vanishes at the runner's 3-to-2 step. The same cap
  costs 3x wall time on the full suite (69.6s → 210.1s) where cores are genuinely spare, which is why it is
  CI-gated.

- _Comparison worth recording:_ GitHub's standard `ubuntu-latest` runner is also 4 vCPU but carries 16 GB and gives
  every job its own VM. The "hosted felt much faster" perception is job-level fan-out — now measured as essentially
  the whole effect — plus 4x the memory per job. RAM did not surface as a constraint in this run, but 8 GB / 2
  services = 4 GB per job against hosted's 16 GB is the reason to prefer one service on a healthier box over two
  should integration or E2E ever show memory pressure.

- _Captured during:_ `cli-validation-surfaces` PR #354 integration and self-hosted CI diagnosis, 2026-07-25; sizing
  question and scaling anchor added during the `coderabbit-manual-only` errand, 2026-07-25.

---
