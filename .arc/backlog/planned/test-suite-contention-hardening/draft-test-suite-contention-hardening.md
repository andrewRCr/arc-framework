# Draft: Test-Suite Contention Hardening

- **Origin:** `USER-INBOX § Errand`, housekeep drain (2026-08-10); accumulated from repeated full-suite failures
  during `merge-readiness-control` and related work.
- **Purpose:** Make full-suite verification reliable under the scheduling pressure created by concurrent worktrees
  and CI jobs.

---

## Inbound Buffer — Pending Integration

> _Routed-in concerns pending holistic integration into the body at this WU's next planning iteration_
> _(`drain-inbox § 5`); each carries its origin. Integrate — or consciously reject — at iteration._

### `[ ]` **Harden resource-heavy local gates against concurrent exhaustion**

- _Routed from:_ `USER-INBOX § Work Unit`, housekeep drain (2026-09-16).

- _Observation:_ Three concurrent full-project ESLint runs in detached delivery-gate worktrees each exited nonzero
  without diagnostics; serial reruns of all three passed. Concurrency correlation is established, but the exhausted
  resource or failure mechanism is not.

- _Approach:_ Reproduce concurrent versus serialized full-project ESLint with process exit, stderr, and host-resource
  evidence; then decide whether the existing heavy-test admission guard should generalize to resource-heavy gates or
  gate guidance and dispatch should serialize affected commands. Coordinate any gate-dispatch change with
  `quality-gate-hooks`.

- _Captured during:_ `test-suite-right-sizing` pre-verification discussion, from `evidence-applicability`
  dogfooding, 2026-09-12.

- _WU_Target:_ `test-suite-contention-hardening`

### `[ ]` **Make the end-to-end subprocess budget tolerant of a loaded machine**

- _Routed from:_ `USER-INBOX § Work Unit` (`WU_Target: test-suite-contention-hardening`), housekeep drain (2026-09-30);
  captured during `local-ci-capacity-qualification` Task 3.3, 2026-09-08.
- _Observation:_ `__tests__/e2e/helpers.ts` kills a spawned CLI after a fixed 10 000 ms and the tests assert it did
  not time out; `command-input-no-input.e2e.test.ts` alone passes that budget at twelve call sites. The subprocesses
  finish in roughly 5.6 s at rest, so the margin is about 2x. Measured on the Mac mini guest: two of 36 jobs failed
  the assertion when three anchors ran concurrently (1.90x slowdown, implying ~10.6 s), while 13 solo, 8 two-slot,
  and 16 four-slot jobs passed. The CLI behaved correctly in every failure — right stderr, right exit code — only
  slowly.
- _Observation:_ not currently reached in CI. Every failed job across the last 120 workflow runs was checked on both
  routes and none carries the signature; hosted gives each job a dedicated machine. It becomes reachable the moment
  several jobs share one host, which is exactly what a local runner does.
- _Approach:_ settle a load-relative or environment-scaled budget that keeps the prompt-termination guard while
  removing machine-load fragility, including whether other suite wall-clock assumptions share the exposure. A
  simple unconditional increase would weaken the guard it is meant to preserve.
- _Observation:_ blocks nothing today, but it is what caps the Mac mini at two runner slots rather than three — a
  9.4 percent throughput difference — so it has a concrete payoff if the local runner ships.
- _Follow-up evidence:_ PR #588's first E2E shard-3 run timed out after 30 seconds in
  `errand.e2e.test.ts`'s foreign-generation promotion test while the self-hosted runner was loaded. The complete
  file passed locally (47 tests in 77.38 seconds), and the unchanged shard passed on its one-job rerun (5m05s).
  This exposes the same load-relative fragility at Vitest's per-test budget, not only the helper's 10-second
  subprocess budget, and should be included when auditing other fixed wall-clock assumptions.
- _Additional evidence captured during:_ `recover-integration-context-across-staged-archive-sweep` Errand,
  PR #588, 2026-09-10.

### `[ ]` **Right-size CPU admission for artifact-only ARC contracts**

- _Routed from:_ `USER-INBOX § Errand`, housekeep drain (2026-10-11).

- _Shapes:_ § Direction, the coordination layer — which lanes take heavy-test admission; this entry is its
  artifact-only case.

- _Observation:_ Artifact-only contracts wait minutes for heavy-test admission: the 101-case ARC contract check ran
  in 1.39 seconds after waiting over three minutes; the focused 10-case framework-sync check ran in 0.752 seconds
  after waiting over five minutes behind unrelated runtime lanes.

- _Approach:_ Give the existing artifact-only ARC contract set proportional CPU admission, retaining eligibility,
  artifact ownership, and completed-case safeguards. Keep this bounded to the existing contract set and its subsets.

- _Scope:_ Preserve admission for runtime-heavy lanes and quality outcomes; avoid generic test-tier machinery.

- _Captured during:_ `inbound-routing-method` implementation.

### `[ ]` **Even out CI shard walls that spread 150–170 s within one run**

- _Routed from:_ `USER-INBOX § Work Unit`, housekeep drain (2026-10-24); the residual of "Measure where a heavy check
  run's wall clock goes, and pick which machine runs it first", whose machine-placement question closed with no change.

- _Shapes:_ § Direction, contention-aware CI scheduling: how shards finish together within one CI run.

- _Result (2026-10-20):_ measured at one head, `b83a37f45`. Through the gate commands the quiet VM (5 workers) took 34 s
  for unit and 415 s for integration, and this host (8 workers, the local ceiling) 35 s and 391 s; per test this host is
  about 1.5x slower than the VM. VM-first placement stands, and the 7.4 and 9.6 min remote times were contention. At 12
  workers the integration tier takes 292 s against 167 s on 2026-10-07, at 0.98 parallel efficiency. It is mostly
  growth: 136 new files carry 1,245 s, while the 165 files Git left unchanged rose 9% in summed time (875 s to 956 s,
  median ratio 1.15), and no slowest file gates the tier any longer. The E2E slowdown on unchanged files is `arc init`'s
  editor-document provisioning, a separate concern from placement. Left for this target: no placement change, and CI
  shard walls that spread 150-170 s within one run.

- _Result evidence:_ identity-global `.internal/investigations/wallclock-vm-vs-local-2026-10-20/` (`findings.md`,
  `summary.txt`, per-file JSON, the CI duration input of run 39526154546).

- _Captured during:_ the `candidate-applicability-merge-base` Errand, 2026-10-20, after two concurrent remote runs took
  about ten minutes each.

### `[ ]` **Make the suites cheaper to run at every gate, and select them by what a change reaches**

- _Routed from:_ `USER-INBOX § Work Unit`, housekeep drain (2026-10-24); split from "Promote
  `test-suite-contention-hardening` from provisional to planned", whose promotion ran at the same drain, ahead of the
  Commitment Boundary's reproduction condition (Owner, 2026-10-21).

- _Shapes:_ Purpose, which widens at this work unit's first planning pass from reliability under contention to suite
  cost as well (Owner, 2026-10-24): the cost half's evidence and options.

- _Evidence (storage-ref-backend):_ the work unit roughly tripled the integration tier. Local, same host and 12 workers
  (`notes-storage-ref-backend.md` § Final tier and job measurements): integration 207 s → 747 s (+260%), unit 20 s →
  29 s. Hosted integration shards summed about 1,120 s → 3,015 s. On the check VM the merge gate's integration tier took
  1,194 s at `50a2f12f1`, about 20 minutes, against 2.5 minutes for every other check; its summed file work was 4,777 s
  over 583 files, of which the 161 `store-ref-*` files hold 2,684 s (56%). The two native conformance files hold 695 s
  of that (`store-ref-conformance` 388 s, `store-ref-separate-conformance` 307 s, 1,128 cases each); the other 159
  `store-ref-*` files average about 12 s each, mostly spent on real repositories and remotes. Base merges added some
  growth, so not every second is the backend's. Per-file ranking: `integration-file-times-50a2f12f1.txt` under
  `storage-ref-backend-tools/verification/` in the work unit checkout's `.internal/` directory.

- _Owner concern (2026-10-21):_ whether all of this is worth running at every gate. Upcoming `state-storage` members
  change `lib/store/` and `lib/git/`, so change-based selection alone would not spare them; making the suites cheaper
  would.

- _Options to evaluate:_ run one layout's full conformance per change and the other on dispatched or scheduled runs, or
  a layout-sensitive subset per change; reuse prepared repositories across the `store-ref-*` files; select the store
  suites by changed paths for work outside `lib/store/` and `lib/git/`, under `strategy-quality-gates`' rule against
  inferring coverage from imports alone; split the slowest files so shards finish closer together.

- _Taken in storage-ref-backend (A29, 2026-10-21):_ the store-ref share of those options. Prepared multi-clone
  snapshots, a declared separate-layout conformance subset with the full separate suite in one hosted dispatch before
  landing, verified value cuts, identity resolved once per ref-store operation, a split default conformance file, and
  selection of the `store-ref-*` suites by what a change reaches, at the merge gate and in pull-request CI, with full
  runs on every push to `main` and weekly.

- _Generalize (Owner, 2026-10-21):_ extend A29's selection rule to the whole suite, the `store-ref-*` selection being
  its forcing and worked instance. Audit each integration and E2E file for inputs no import graph shows (Markdown read
  from disk, spawned scripts, configuration) before it joins. `strategy-quality-gates` places the complete suite at the
  merge gate; weigh a whole-suite backstop on `main` and on schedule against that doctrine.

- _Selection precision:_ treat it as a measured goal — per-file static import closures replayed against recent merges to
  `main`. At `212f6432e` all 164 `store-ref-*` files share an 845-file closure core, and 60 of the last 80 merges would
  have reached none of them. Barrel modules such as `lib/git/index.ts` widen closures suite-wide. Scripts and findings:
  `selection/` beside the per-file ranking above.

- _Located content counted as every suite's reach (2026-10-22):_ `lib/paths.ts` sits in every store suite's closure and
  locates the packaged `arc/`, `templates/`, and `init-recipe.json`, so the store reach declaration
  (`__tests__/reach/store-suites.json`) counts them for every suite. Only the `init`, `start`, `decompose`, `user`, and
  `join` handlers call those locators; no `lib/store/` module or store test helper does. Replayed at `bfdc9cc05` through
  the store check's own selection, the last 80 merges to `main` (2026-10-15 to 2026-10-22) split 41 selecting no suite,
  38 nearly all, and 1 some; 10 of those that selected changed only packaged ARC content. Declare the finds per consumer
  rather than per locating module, or trace what each suite reads at run time, keeping any suite that drives those
  handlers on the content it reads. Replay: `replay-80.txt` under `storage-ref-backend-tools/verification/measure/` in
  the work unit checkout's `.internal/` directory.

- _Store coupling, after `storage-cutover`'s deletion pass:_ the shared core enters through the meta kind's registration
  into `lib/store/create.ts` and the in-repo backend, through the in-repo sync's import of `commands/user/save-load.ts`
  and the `lib/git/index.ts` barrel, and through the kinds' write checks (the cut map into `lib/decompose/`). The first
  two leave with the cutover's deletions. Re-measure after them; the remainder — the default ports' static
  production-registry import and the write-check imports — then reads as an Errand or a work unit.

- _Captured during:_ storage-ref-backend verification preparation, 2026-10-21.

### `[ ]` **Keep an over-budget test-cost run from clearing by re-baselining**

- _Routed from:_ `USER-INBOX § Work Unit`, housekeep drain (2026-10-24); split from "Promote
  `test-suite-contention-hardening` from provisional to planned", whose promotion ran at the same drain, ahead of the
  Commitment Boundary's reproduction condition (Owner, 2026-10-21).

- _Shapes:_ Purpose, which widens at this work unit's first planning pass from reliability under contention to suite
  cost as well (Owner, 2026-10-24): how the budget record holds, beside this buffer's "Budget a sharded CI job as a
  whole, not each shard index".

- _Process gap (`storage-ref-backend` lessons, 2026-10-22):_ the spec's cost bound was exceeded and then retired rather
  than escalated. Three mechanics let it pass unseen. `arc check` never compares a run against `test-cost-budgets.json`.
  The CI "Report test budget" step compares, but it is advisory — it exits successfully on an overage — and runs only on
  pull requests, `main`, dispatch, and schedule. And re-baselining is an ordinary commit: two `chore(test-cost):`
  commits moved the local integration row from 167,261 ms to 697,900 ms and cleared the signal. The design-arm stop that
  retired the bound is a separate Errand (`amend-design`, 2026-10-22).

- _Idioms to weigh:_ a ratchet over the budget record, as `eslint-suppressions.json` already is — never re-baseline to
  clear an overage, and a raise is an Owner decision stated in consequence terms, such as gate minutes for later work; a
  comparison wherever a whole tier already runs (the merge gate, the integration run before first push), alerting on a
  per-change delta; a per-file ceiling flagged in every run's output, the cheap form of test size classes; and an agreed
  exhaustion policy (pay down before adding cost, or raise explicitly) so the call is not made fresh under pressure.

- _Captured during:_ storage-ref-backend verification preparation, 2026-10-21; the process gap from triage of its
  process lessons, 2026-10-22.

### `[ ]` **Budget a sharded CI job as a whole, not each shard index**

- _Routed from:_ `USER-INBOX § Work Unit`, housekeep drain (2026-10-24).

- _Shapes:_ Purpose, which widens at this work unit's first planning pass from reliability under contention to suite
  cost as well (Owner, 2026-10-24): CI shard-wall spread and the test-cost budget report; this adds how a CI-job row
  identifies what it measures.

- _Observation:_ each CI-job row in `packages/arc-framework/test-cost-budgets.json` is keyed to a shard index (`unit-N`,
  `integration-N`, `store-N`, `e2e-N`), while the heavy-first assignment rebalances from the durations each full run
  saves, so a row compares a different set of files on every run. A baseline taken from its run's lightest shard then
  warns on most later runs without any growth, which defeats the report's purpose of flagging growth.

- _Evidence:_ in `storage-ref-backend`'s full dispatches `39888971367`, `39891553294`, and `39892668498` (2026-10-22),
  integration-2 ran 9, 48, and 52 s over its budget and e2e-3 22, 42, and 11 s; both baselines were the lightest shard
  of dispatch `39871608329`. Integration-2 held 150 different files across the two runs at `916ee8d11`, and at
  `7b5b5fac6` ran the same 106 files in 242.5 s and in 335.5 s. The new `store-1` to `store-4` rows inherit it, store-2
  at a 311,997 ms baseline. `notes-storage-ref-backend.md` § A33, Rows keyed to a shard, records it.

- _Approach:_ budget each sharded job by its slowest shard, or by its summed time, rather than each index; weigh hosted
  runner variance, 1.38–1.67× on identical work, against the 35% allowance either way.

- _Captured during:_ `storage-ref-backend` Task 18.R3.b, 2026-10-22.

### `[ ]` **Let fix work continue while a gate's checks run**

- _Routed from:_ `USER-INBOX § Work Unit`, housekeep drain (2026-10-24).

- _Shapes:_ Purpose, which widens at this work unit's first planning pass from reliability under contention to suite
  cost as well (Owner, 2026-10-24): gate throughput, so editing can overlap a gate's checks.

- _Observation:_ in `storage-ref-backend`'s fix round, each `arc release commit` hook ran about 6.5 minutes on the
  remote, and the edit freeze while it ran blocked the next fix; the final merge gate's store run waited 462 s for VM
  memory, then ran 964 s. The freeze comes from `arc check` running a gate's checks in sequence against the live
  worktree, so an edit made during an early check reaches the later ones, locally or remotely. remote-check itself
  commits its snapshot before any VM wait (`remote-check` in `arc-offload`), so a VM queue wait does not leak edits.

- _Approach:_ run a gate's checks against a snapshot of the tree taken when the gate starts, so editing can overlap
  verification.

- _Evidence:_ `fix-round-1/*-commit.log` and `fix-round-1/final-merge-gate.json` under
  `.arc/user/andrew/.internal/storage-ref-backend-tools/verification/prepublication/` in that work unit's checkout
  (checkout-local).

- _Captured during:_ triage of `storage-ref-backend`'s process lessons, 2026-10-24.

### `[ ]` **Record a per-platform margin for a test near a fixed product deadline**

- _Routed from:_ `USER-INBOX § Work Unit`, housekeep drain (2026-10-28).

- _Shapes:_ § Direction, timeout sizing with a documented safety margin.

- _Observation:_ `storage-ref-backend`'s twenty-clone burst case ran 30 s on Linux and 350-383 s on hosted Windows,
  where one settle pull hit the 120 s sync deadline. The suite runs only in scheduled or dispatched portability, so
  the margin shows only when a dispatch is paid for, and Linux never shows it.

- _Approach:_ give a case near a fixed product deadline a recorded per-platform margin, or scale its concurrency to the
  runner.

- _Evidence:_ `fix-check-1/verification.md` § Windows discriminators, under
  `.arc/user/andrew/.internal/storage-ref-backend-tools/verification/prepublication/` in that work unit's checkout
  (checkout-local).

- _Captured during:_ triage of `storage-ref-backend`'s process lessons, 2026-10-24 (Owner-approved).

### `[ ]` **Measure test headroom inside reused unit workers, not only in isolation**

- _Routed from:_ `USER-INBOX § Work Unit`, housekeep drain (2026-10-28).

- _Shapes:_ Direction — "Measure duration-to-timeout headroom across the suite" and the timeout-sizing
  decision.

- _Observation:_ The repository inventory suite's 30-second setup hook timed out on intel-mbp in full `test:unit`
  run `0f7adf45ca124f81bc0f9dc93142e937` (one of two failed `test:unit` runs among eight there on 2026-10-27), while
  the same scan takes 6.8 seconds standalone on that runner. The run showed no host contention: CPU busy at most 39%
  of eight threads, CPU, memory and I/O pressure under 1%, 10.6 GB available. The unit project runs `isolate: false`,
  so the hook runs in a worker carrying earlier files' heap; garbage-collection pressure on this allocation-heavy scan
  is the suspected inflation, not a shown one. A budget sized from an isolated run misses it.

- _Approach:_ When measuring headroom, take in-suite durations from reused workers on the slowest eligible runner,
  then decide whether allocation-heavy suites belong in the isolated project, need worker recycling, or take a sized
  timeout. The scan itself was halved in parse work by `perf(command-input): parse each scanned module once`
  (standalone 6.8 to 4.8 seconds on intel-mbp); whether that keeps this hook under budget in a reused worker is
  unproven.

- _Second runner, 2026-10-28:_ A forced merge gate at head `8cad4cecf` ran `test:unit` (plan `c4aefc03`) on m4-mini
  beside that gate's `lint:ts` and `typecheck:test` plans, with no other work on the runner. Five cases exceeded the
  5,000 ms per-test timeout: `line-merge-api` (declaration transpile), `entry-merge`, `source-presentation`,
  `source-verify` and `local-example-inputs`. The plan's backend took 131.5 seconds, against 84 seconds for the same
  three-plan shape that morning. Per-plan worker counts against the runner's cores are unexamined; how much of the
  timeout pressure is three plans sharing one runner, rather than worker reuse, is unshown.

- _Third instance, 2026-10-28:_ a routed full `test:unit` run from `distributed-check-shards` failed one case of
  19,404: `local-example-inputs.test.ts` "keeps a probe's leading byte order mark in known runtime
  qualification", the first `qualifyNodeRuntime` call in its file, passed the 5,000 ms timeout while its five
  sibling cases took 0.7–1.7 s each. The whole file passes in 1.9 s locally. A cold first call (the first dynamic
  import of the check-runner example's runtime module) under full-suite load is the suspected cost, not a shown
  one. The log is `test%3Aunit.5b6708d1-d2b8-4fd8-a8b5-245b535fb08e.log` under that work unit's private Git
  directory, in `arc-checks/` (checkout-local).

- _Captured during:_ Errand `inventory-scan-setup-timeout`, 2026-10-27; the residual after its scan fix.

### `[ ]` **Match check admission to runner heap requirements**

- _Routed from:_ `USER-INBOX § Work Unit`, housekeep drain (2026-10-28).

- _Shapes:_ § Direction, the coordination layer — which lanes take admission, and against what resource. It pairs
  with the `USER-INBOX` capture "Weigh memory in check admission", which the Owner holds there until the interim
  runner changes have been watched across real merge gates.

- _Observation:_ The fourth storage review's preceding full gate ran lint:ts on air-battery (arc-air-runner).
  V8 exhausted its approximately 2 GB heap and exited 134 after 64.969 seconds; the other 19 selected checks passed.
  The same source passed standalone lint on primary-mini (arc-gates) in 68.003 seconds. A private command-specific
  routing adapter then allowed all 20 checks to pass; lint took 136.529 seconds including waiting. Air also completed
  test:store successfully, so this is a command/heap fit problem rather than evidence that Air is generally unusable.

- _Additional evidence:_ During `machine-check-runner` Tasks 1.1–1.2 on 2026-10-26, repeated increment requests placed
  `typecheck:test` on a runner with `heap_mb: 2048`; V8 exhausted that heap and exited 134 after approximately 26
  seconds. Each reported `arc check run typecheck:test --changed` retry passed when the unchanged pool selected a
  larger-heap runner, and a subsequent unchanged increment reused that pass. No registry, mode or heap limit was
  changed. The failure recurred on later source/test edits, showing that a successful retry does not repair command
  eligibility. The logs (`arc-checks/typecheck%3Atest.*.log` in that work unit's private Git directory) went with its
  checkout.

- _Interim response:_ The Owner's runner-pool session installed arc-offload revision `a70242d` with repository
  `command_routes` for `lint:ts` and `typecheck:test`, preserving the chosen mode, local permission and existing heap
  caps while excluding unqualified remote placements. Its provider API is `Repository.route_for(argv)`. The public
  adapter must preserve these literal-argv routes before preparation/runtime qualification and through execution,
  including grouped-plan intersection and refusal of incompatible pins; no ARC protocol resource fields are needed.

- _Approach:_ Determine how command memory requirements should participate in measured pool selection and admission.
  Preserve the Owner's global mode and shared capacity policy. The implementation may belong in arc-offload, with
  project check declarations supplying requirements; the existing runner work is related but its ownership of this
  decision has not been established.

- _Files:_ arc-offload selection/admission and registry profiles; the check declarations. Evidence:
  `standard-pass-3-fix-check-5/full-gate-run-context-air-lint-failed.json`, `lint-capable-runner.json` and
  `full-gate-run-context.json` under `storage-ref-backend`'s private verification directory (checkout-local).

- _Scope:_ Cross-repository runner admission; deferred design work.

- _Captured during:_ storage-ref-backend review cycle, 2026-10-26; Owner requested capture.

- _Interim mitigation (2026-10-26):_ The approved arc-offload safeguard is installed locally at
  a70242d06ead384607b6e8534ea8bde243023792. Machine-local command_routes restrict whole-project lint:ts and
  typecheck:test to primary-mini plus WSL when the active mode permits local execution. Both passed on frozen
  current sources under WSL's unchanged 3072 MiB heap cap (80.66 and 46.42 seconds). Air and M2 retain other checks.
  All runner limits and the global speed mode remain unchanged; all 121 arc-offload tests passed. General command
  resource modeling remains unresolved. Evidence and the live-adapter coordination message are in
  .arc/user/andrew/.internal/arc-offload-command-routes-20261026/. The external adapter must preserve these routes
  before runtime/cache qualification as well as execution; its accepted spec already requires preserving host policy.

- _Additional evidence (2026-10-27):_ The storage repair's final full gate at `07e738664` placed `test:unit` on M2
  with a 2048 MiB heap and two workers. Run `e8e0623c2b384d6a9cc45ffe29035bbc` recorded two interrupted attempts
  (`SIGTERM`, SSH status 143) after about 22 and 20 seconds of execution, then automatically selected Intel MBP. The
  M2 VM's user journal proves both were out-of-memory kills inside the attempt's own cgroup: each scope "Failed with
  result 'oom-kill'" at a 3G memory peak under `memory_max_mb: 3072`. The `SIGTERM` is systemd's
  `DefaultOOMPolicy=stop` stopping the scope after the kernel kill, so history records the reaction, not the cause;
  the Air's journal shows the same. From 2026-10-26 19:14, the start of the retained history, `test:unit` was killed
  this way in 29 attempts on M2 and both Air profiles, from four worktrees including main-based Errands, and never
  completed there; `test:changed` was killed twice on the Air. Each placement cost about 45–50 seconds before
  fallback. The profiles admit this by construction: two workers each allowed a 2048 MiB heap exceed the 3072 MiB
  cgroup before V8's own limit can fail gracefully. The same VMs complete `typecheck`, `test:file` and a 24-minute
  run peaking at 2.3G, so the misfit is per command. Exact history is
  `standard-pass-7-fix-check-3/final-unit-m2-interruption-history.json` under storage-ref-backend's private
  verification directory, and `remote-check history e8e0623c2b384d6a9cc45ffe29035bbc --json` holds the full record.

- _Interim mitigation (2026-10-27):_ Machine-local `command_routes` now restrict `test:unit` to m4-mini and
  intel-mbp, with local execution where the active mode permits it, in the same five argv spellings as the lint:ts
  routes. Mode, heaps, workers and cgroup caps are unchanged. The route matches by argv prefix, so it would also keep
  any future `test:unit` shard off M2 and the Air; revisit it once shards run, since a shard may fit there. Backup:
  `~/.config/arc-offload/registry.before-test-unit-route-20261027.json`.

- _Approach additions (2026-10-27):_ arc-offload reports a kernel out-of-memory kill as `oom_kills` on the attempt's
  result and moves that attempt to the next runner without retrying it there. A runner that refuses at admission
  because another check occupies its checkout is held for at most the estimated gap to the next candidate. One gap
  remains. Timing history learns only from successes, so a runner that never completes a command keeps an optimistic
  estimate (M2's for `test:unit` was 49 seconds) and selection keeps choosing it; `oom_kills` is the signal a
  failed-fit rule could learn from, and this is the core of the admission question above. Keep the `test:unit` route
  until selection learns from failed fits.

### `[ ]` **Account for faster-runner waits before overflowing long checks**

- _Routed from:_ `USER-INBOX § Work Unit`, housekeep drain (2026-10-28).

- _Shapes:_ § Direction, contention-aware scheduling.

- _Observation:_ The storage R4 full gate's store run `d0234e22a84444df8374e77069d9fff9` forecast approximately
  733 seconds on M4 versus 1,136 on M2. M4 returned checkout/jobs busy during the first five seconds; local was also
  busy, so M2 admitted the run after approximately six seconds. Store execution then took 1,566 seconds with two
  workers, setting the full gate's 1,587-second critical path. Unit and integration passed separately; a later live
  pool observation found M4 idle while this M2 job was still running. This is measured allocation/timing evidence,
  not proof that M4 would have remained available or met its forecast.

- _Approach:_ Investigate forecast-aware reassessment of a short faster-runner wait versus immediate slower-runner
  overflow, including shared job/memory admission and checkout-artifact ownership. Measure the global workload and
  preserve host reservation, source snapshots and check completion semantics. Local sharding is a separate concern.

- _Recurrence:_ R5 store run `bd119b7ed6d641d993395a7b023519a2` repeated the allocation: M4 forecast 733 seconds,
  M2 1,154; M4 returned checkout then jobs busy within five seconds, and M2 admitted after eight seconds. A live
  observation four minutes later found M4 idle while this exact M2 job was active. R5's initial runner histories and
  `full-gate-pool-live.json` retain the admission and observation. The run finished successfully after 1,601 seconds
  (1,588 in Vitest), setting the full gate's 1,611-second critical path. This still does not prove the counterfactual
  completion time on M4.

- _Recurrence:_ R6 store run `37af7a46ab444c12a545d950f40b878d` forecast 733 seconds on M4 and 1,234 on
  M5 AC. M4 returned checkout then jobs busy within five seconds; M5 admitted after ten seconds. Integration run
  `99bc6a0a3ab24e00887fcc3c9977cfe0` similarly overflowed to M2 after M4 and M5 returned busy. The pool observation
  about one minute later showed M4 idle with three free slots while those exact M5/M2 jobs remained active. Actual
  initial histories and `full-gate-pool-initial.json` are retained under `standard-pass-7-fix-check-6`. Completion
  timings were 1,466 seconds for store execution and 1,489 seconds for the full gate. That initial attempt
  finished with one deterministic keeper-journal assertion failure (5,841 store cases passed); runner resource
  sampling reported no errors. The repair and rerun stayed in `storage-ref-backend`. These timings record observed
  allocation cost, not a counterfactual M4 completion claim.

- _Recurrence:_ The corrected R6 gate repeated the early overflow: store run
  `72d91c5def8a4711affca2b524f5c3c4` admitted on M2 after M4 returned checkout/jobs busy. A retained live pool
  observation again found M4 idle with three free slots while this exact M2 job remained active. Store execution
  took 1,700 seconds and the full gate 1,723 seconds; all 5,843 selected store cases and all 20 selected gate checks
  passed. Resource sampling reported no errors. `full-current-pool-live.json`,
  `full-current-72d91c5def8a4711affca2b524f5c3c4-history.json` and `full-gate-run-context.json` retain the actual
  evidence under `standard-pass-7-fix-check-6`; forecasted M4 completion remains a counterfactual.

- _Evidence:_ `standard-pass-7-fix-check-4/full-store-history.json`, `full-unit-history.json`,
  `full-integration-history.json`, `full-gate-pool-status-live.json` and `full-gate-run-context.json` under the private
  storage verification directory. The first pool-status probe was sandbox-limited; the `-live` artifact is the
  actual runner observation. Owner-selected mode and registry limits were retained.

- _Captured during:_ storage-ref-backend unattended fix checks, 2026-10-28; deferred for later investigation.

---

## Evidence

Intermittent failures appeared across unrelated subprocess-heavy integration and E2E tests, passed in isolation,
and reproduced locally and on the self-hosted runner. Observed modes included 5-second integration timeouts, a
150-second E2E timeout, a missing holder PID, a subprocess validation error, and cleanup racing a write into a temp
directory.

The strongest common trigger was concurrent full suites: under machine load, every failure in one captured run was
a timeout and the affected files passed immediately in isolation. Two frequent offenders also ran with little
margin against their configured ceilings; raising those ceilings removed known pressure-sensitive failures without
loosening behavioral assertions. Some non-timeout sightings may remain distinct and should not be explained away by
contention alone.

## Direction

- Measure duration-to-timeout headroom across the suite before pursuing test-specific theories.
- Reproduce contention deliberately with concurrent suites from separate worktrees and compare against a serialized
  control.
- Decide between repository-wide suite serialization, contention-aware CI scheduling, and timeout sizing with a
  documented safety margin.
- Audit remaining non-timeout failures separately for inherited environment, missing readiness waits, and temp-tree
  cleanup ownership.
- Preserve strict stderr and behavioral assertions; address scheduling and synchronization rather than accepting
  unexplained output.

## Commitment Boundary

This remains provisional until controlled reproduction distinguishes the shared contention class from the residual
test-specific failures and establishes which coordination layer should own the remedy.

---
