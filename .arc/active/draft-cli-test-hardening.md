# Draft: CLI Test Hardening

- **Origin:** [internal] — routed from `BACKLOG-INBOX` at the work-routing-discipline retirement pass (2026-06-01)
  as a coverage-gap cluster; scope accreted through housekeep drains and an owner-adopted CI-speed capture (through
  2026-07-15). Cohorted with `architecture-remediation` (the other CLI-internal-health WUs) as a logical grouping,
  not a dependency.
- **Purpose:** Make the CLI test suite trustworthy and affordable in one pass: eliminate the known flake cluster,
  take the measured suite-time hot spots down, and close — or consciously drop — the residual coverage gaps. The
  WU began as a coverage-gap cluster; routed-in concerns have since made reliability and performance its heavier
  dimensions, and the two share their highest-leverage intervention (the heavy integration fixtures).

---

## Inbound Buffer — Pending Integration

> _Routed-in concerns pending holistic integration into the body at this WU's next planning iteration_
> _(`drain-inbox § 5`); each carries its origin. Integrate — or consciously reject — at iteration._

_(empty — all entries integrated into the body, 2026-07-15)_

---

## Problem / Motivation

Three concern streams converged on this WU:

1. **Reliability** — four distinct flake classes have failed CI on unrelated PRs (at least #70, #202, #206, #234),
   each passing clean on rerun. Every flake taxes an unrelated change's merge and erodes trust in red CI.
2. **Performance** — a CI-speed exploration (2026-07-15) measured where suite time actually goes; the hot spots
   overlap the flake fixtures, so de-flaking and de-costing are one lever at the highest-cost sites.
3. **Coverage** — the original cluster: lower-priority edge-case gaps identified during a CLI work unit's
   integration review (2026-06-01). None blocking; all hardening.

**Success signal:** (1) none of the four flake signatures recurs in CI after landing (observed over the normal
flow of subsequent PRs); (2) measured wall-clock drops at the measured hot spots — unit-tier CI wall approaches
its ~45s aggregate test time, and the two heavy integration files no longer carry ~31% of their tier; (3) every
confirmed coverage gap has a landed test or a recorded rejection, with the full suite green.

## Design Dimensions

### 1. Reliability — the de-flake cluster

Four known flake classes, each with its own mechanism:

- **(a) Notes-compaction retention fixture pressure.** `user-notes-compaction.test.ts` creates hundreds of
  sequential commits and note commits inside a temp repo; under full-suite concurrency Git failed to write an
  object mid-fixture (PR #234), while the unrelated change and a local full-suite run were clean. Approach: reduce
  fixture filesystem/process pressure using existing synthetic notes-tree helpers where that preserves the
  retention assertion; otherwise isolate or serialize this resource-heavy case and improve its diagnostics.
  Subject to the notes stop-loss boundary below.
- **(b) Temp-repo teardown `ENOTEMPTY` race.** First hit as `rmdir '.git/info'` in `plan.e2e.test.ts` (PR #202,
  run 28808727826); recurred in a _different_ e2e file, `session-init.e2e.test.ts` (PR #206, run 28838080399),
  confirming shared-teardown behavior rather than a per-test issue; recurred in integration tests as
  `ENOTEMPTY: .git/objects/pack` (2026-07-13). The gc-disable arm has **already landed** (`9fac314ff`, PR #224,
  2026-07-11 — `gc.auto 0` in both the integration and e2e temp-repo factories) and the recurrence post-dates it,
  so gc-disable alone did not close the race (in-scope root-cause check: confirm the failing run actually carried
  the fix). Approach: consolidate teardown into **one shared retry-safe removal primitive** that all five sites
  call — today there is no single shared factory: integration and e2e carry parallel, ≈90%-identical
  `createTempRepo`/cleanup pairs, and three more helpers (`multi-clone`, `in-flight-reshuffle`,
  `commit-message-fixture`) roll their own inline `rm(..., {recursive})` teardown, and drift is the proven
  failure mode (the gc fix reached the two factories, never the inline sites). Opportunistically merge the
  factory fronts as well (settled 2026-07-15): a shared `createTempRepo` core carrying what must not drift —
  gc/user config, hardened removal — with a thin e2e wrapper for tier personality (`arc.identity` pre-set,
  prefix); the WU's test-architecture principle applied to files already in hand.
- **(c) Shallow-clone git-notes timeout under-budget.** A `user.test.ts` shallow-clone test timed out at the
  default 5000ms on CI (observed ~5478ms, PR #70); renamed since — the current anchor is `load restores recent
  note content in a shallow clone when the annotated commit is beyond boundary`. The setup legitimately runs
  close to 5s under CI load. Approach: targeted per-test timeout with headroom (15–20s) or trim the git setup cost so it
  runs well under budget; prefer per-test budget over widening the suite default.
- **(d) Save/sync shared-git-state races.** A raw full `npx vitest run` (which globs unit + e2e together at high
  concurrency, unlike the sanctioned `npm test`) showed 12 failures across
  `integration/{user,multi-clone,status}.test.ts` and `e2e/{user,session-init,sync-purity}.e2e.test.ts`, with
  `Save failed` / `Worktree push skipped` / `Notes push skipped` stderr — save-verification / notes-push
  contention on shared git state; all pass in isolation and under `npm test`. Approach: isolate each test's
  save/sync git state (unique tmp repos / refs) or serialize the save/sync group, covering both the integration
  and e2e layers. Preference: isolation-by-construction here too, consistent with the cluster lean; serialize
  only where isolation is disproportionate for a given case, as a recorded bounded fallback.

### 2. Performance — measured hot spots (evidence 2026-07-15)

Per-tier findings from the CI-speed exploration; per-file timing reproducible via `vitest run --reporter=json`:

- **Integration is top-heavy — the shared-fixture lever.** `user.test.ts` (58s local) plus
  `user-notes-compaction.test.ts` (40s) carry ~31% of the tier, and they are the same fixtures behind flakes (a),
  (c), and (d). Design de-flake + de-cost as **one intervention per fixture**: cheaper synthetic fixtures and
  isolation-by-construction address both the contention and the wall-time.
- **Unit is overhead-dominated.** ~45s of aggregate test time takes ~87s CI wall because the default
  `isolate: true` forks pool re-imports the full module graph per file (~80s aggregate import observed across 343
  files). Lever: vitest pool / `isolate` tuning for the unit tier. Isolation-semantics risk flagged under
  Unknowns. Stop-loss: if the verification spike shows isolation cannot be safely relaxed, record that outcome
  and drop or re-target success signal (2)'s unit-wall clause (e.g. shard the unit leg instead) — never force
  unsafe tuning to meet the number.
- **E2E is intrinsically spawn-bound** (PTY wrapper + node CLI spawn per `runArc` invocation) — the lever is
  CI-level parallelism/sharding, not per-test optimization. Deliverable (settled 2026-07-15): the per-tier
  sharding position **and** its CI-workflow implementation — vitest sharding in Actions is a small matrix +
  `--shard` change on a stable post-#253 surface. The change surface includes `scripts/classify-change.sh`: its
  `HEAVY_CHECK_NAMES` list must stay byte-identical to the CI job names, and matrix legs rename check runs
  (e.g. `E2E Tests (1)`), so the classifier updates in the same change or the verified-tree skip silently stops
  matching. Stop-loss: structural rework of the workflow legs, or more than a bounded couple of in-CI tuning
  iterations (shard balance, runner-minutes cost), stops and captures the remainder.

### 3. Coverage — verified gaps (grounding pass 2026-07-15)

Re-verified against the current suite (original candidates from 2026-06-01; every source surface still exists).
Two candidates are **already covered** and drop out: deeply nested conditionals (`render.test.ts`, 3+ levels) and
simultaneous multi-developer sync (`multi-clone.test.ts`, `sync-state-producer.e2e.test.ts`,
`state-ref-race.e2e.test.ts`). Confirmed gaps, by source locus:

- **Template rendering** (`src/lib/template/render.ts`) — unbalanced `arc:if`/`arc:endif` (the source is
  underflow-hardened but the recovery path is untested) and tokens containing regex metacharacters.
- **Filesystem edges** (`src/lib/io-context.ts` `readUserDir`; `src/commands/diff.ts`,
  `src/commands/status/run.ts`) — symlinks inside `.arc/` (the walker follows symlinks via `stat` with no
  cycle/realpath guard — a product gap, not only a test gap); `readdir()`/`readFile()` TOCTOU races (ENOENT
  outcomes partially covered; no vanish-between-calls simulation).
- **Network errors** (`src/lib/version.ts` `checkLatestVersion`) — invalid JSON, partial/malformed body, and
  timeout. The source has no timeout/abort mechanism at all, so the timeout case is a small product change plus
  its test, not a test-only gap.
- **Concurrency** — parallel `init` + `update`: the existing race harness (`__tests__/e2e/true-race.ts` and the
  state-ref race suites) targets git-ref writes, not command-level init/update contention.
- **Entry-point wiring** (`src/lib/io-context.ts`, `src/handlers/shared.ts`) — `writeGitNote` stdin/EPIPE failure
  path; `readGitNote` against corrupt refs / missing commits (integration tests stub it to `null`); the real
  `runWithSpinner` error-path lifecycle (the one importing test mocks it away).

**In-scope product edges (settled 2026-07-15):** the `readUserDir` symlink cycle/realpath guard and a
timeout/abort mechanism for `checkLatestVersion` ride this WU as small hardening deliverables paired with their
tests — the timeout case is untestable without the mechanism, and both share the hardening intent.

**Consciously dropped (settled 2026-07-15):** very large `.arc/` performance. It originated as a speculative
filesystem-edge worry in the 2026-06-01 review list — no observed degradation behind it — and a benchmark is not a
hardening test (in CI it would be its own flake source, the thing this WU exists to remove). Revive only on
observed degradation.

### Test-architecture normalization (settled 2026-07-15: principle, not restructuring)

From the `review-gate-enforcement-cutover` production-composition review. This WU codifies and applies the
_principle_ — layouts named by production surfaces, mocks at system boundaries, assertions on observable
controller outcomes, scenario suites split only at independently navigable behavior — to files it already
touches. The full `integration/review-gate/` layout evaluation is **deferred**: the review-gate surface is
half-built with a three-WU chain pending (`review-gate-enforcement-qualification` →
`review-gate-enforcement-promotion` → `review-gate-github-adapter`), so restructuring its tests now would churn
under active downstream work. Coordination seam: at planning close, route a `USER-INBOX` capture proposing the
layout evaluation ride that chain (`WU_Target: review-gate-enforcement-qualification`, or later in the chain at
drain's discretion).

## Notes Stop-Loss Boundary (refined 2026-07-15)

Git notes are an interim bridge per the git-notes verdict in `RELEASE-GATES.md` (an identity-scoped operational
record under `user/{identity}/` — held in the primary worktree, not this branch's tree); retirement belongs to
`local-mode` / `arc-backend`. The default posture is unchanged — keep-the-lights-on: stabilize confidence in existing retention
behavior; add no marker type, reconciliation arm, or deeper notes-specific machinery; prefer bounded isolation
over substrate investment.

**Refinement:** _light_ interim investment is considerable — not categorically excluded — because the replacement
is realistically a month or more out with substantial notes-dependent work landing in between. The bar: it must
clearly earn its keep over that bridge window (flake/cost reduction now, on surfaces exercised until retirement),
and the burden of proof sits on the investment. Preference order stays none → bounded isolation → light
investment; anything structural routes to the retirement owners.

## Alternatives

Item-level alternatives are recorded inline above (e.g. timeout-budget vs. setup-trim for (c); serialize vs.
isolate for (a)/(d)). Cluster-level:

- **Split performance into its own WU** — rejected: the highest-leverage performance intervention is the same
  fixture work as the de-flake items (one design surface), and the remainder (pool tuning, sharding position) is
  below WU-warrant on its own.
- **Handle each flake as an errand** — rejected at cluster formation: ~12 atomics with shared fixture/teardown
  design; bundling preserves the shared-fixture design and one review context.

## Unknowns and Assumptions

- **Unit-pool isolation semantics:** relaxing `isolate` / switching pools changes test isolation guarantees (e.g.
  worker threads cannot `process.chdir()`; module-level state leaks across files with `isolate: false`). Needs a
  verification spike against how CLI unit tests actually use cwd/process state before committing to the tuning.
- **Assumption:** the 2026-07-15 timing evidence remains representative at execution time; re-measure cheaply
  (`vitest run --reporter=json`) before tuning if the suite has shifted.

## Scope Estimate

Medium (days-week) total; individual items Small. Bundle as one WU rather than ~12 atomics. Non-blocking —
sequence at convenience within the architecture-remediation cohort. No dependencies on other work units; the
notes stop-loss boundary coordinates with (but does not depend on) `local-mode` / `arc-backend`.
