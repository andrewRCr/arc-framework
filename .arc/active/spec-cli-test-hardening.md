# Spec (`outline`): CLI Test Hardening

- **Origin:** [internal] — routed from `BACKLOG-INBOX` at the work-routing-discipline retirement pass (2026-06-01)
  as a coverage-gap cluster; scope accreted through housekeep drains and owner-adopted captures (through 2026-07-15).

- **Purpose:** Make the CLI test suite trustworthy and affordable in one pass: eliminate the five known flake
  signatures, take the measured suite-time hot spots down, and close — or consciously drop — the residual coverage
  gaps. Reliability and performance share their highest-leverage intervention: the heavy integration fixtures.

---

## Problem / Context

Three concern streams converged on this work unit:

1. **Reliability** — five distinct flake classes: three have failed CI on unrelated PRs across four incidents
   (#70 → (c), #202 and #206 → (b), #234 → (a)), each passing clean on rerun; two more — (d) and (e) — surfaced
   under local full-suite contention. Every flake taxes an unrelated change's merge and erodes trust in red CI.
2. **Performance** — a CI-speed exploration (2026-07-15) measured where suite time goes. Integration is top-heavy:
   `user.test.ts` (~58s local) plus `user-notes-compaction.test.ts` (~40s) carry ~31% of their tier — the same
   fixtures behind three of the flake signatures. Unit is overhead-dominated: ~45s of aggregate test time takes
   ~87s CI wall because the default `isolate: true` forks pool re-imports the full module graph per file. E2E is
   intrinsically spawn-bound (PTY wrapper + node CLI spawn per invocation).
3. **Coverage** — edge-case gaps identified during a CLI work unit's integration review (2026-06-01), re-verified
   against the current suite (2026-07-15). None blocking; all hardening.

The evidence is fresh and reproducible (`vitest run --reporter=json` for timings; a live contention reproduction
for the unit tier), and the flake and cost hot spots overlap — acting on them together is one design surface.

## Decision(s)

1. **One WU, one intervention per fixture.** The three streams bundle as a single work unit; de-flake and de-cost
   are designed as one intervention at each shared fixture (cheaper synthetic fixtures, isolation-by-construction),
   not as separate reliability and performance passes.
2. **Flake (a) — notes-compaction fixture pressure** (`user-notes-compaction.test.ts`, PR #234): reduce fixture
   filesystem/process pressure using the existing synthetic notes-tree helpers where that preserves the retention
   assertion; otherwise isolate or serialize this resource-heavy case and improve its diagnostics. Subject to the
   notes stop-loss boundary (Decision 10).
3. **Flake (b) — temp-repo teardown `ENOTEMPTY` race** (PRs #202, #206; integration recurrence 2026-07-13):
   consolidate teardown into one shared retry-safe removal primitive as the single removal path for git-backed
   temp directories, and merge the factory fronts — a shared `createTempRepo` core carrying what must not drift
   (gc/user config, hardened removal) with a thin e2e wrapper for tier personality (`arc.identity` pre-set,
   prefix). The known surface is wider than the five helper-level sites (two factories + three named helpers):
   dozens of test files carry per-test inline `rm(..., {recursive})` teardowns of git-backed dirs — including
   inline-created bare origin repos in `session-init.e2e.test.ts`, flake (b)'s own recurrence file, which sit
   outside the factories and never received the gc-disable fix. An implementation-time sweep enumerates the
   inline sites and routes git-backed removals through the primitive, recording any conscious exclusions. Drift
   is the proven failure mode: the landed gc-disable fix (`9fac314ff`) reached the two factories but none of the
   inline sites. In-scope root-cause check: confirm the post-fix failing run actually carried the fix, and weigh
   the un-gc-disabled inline-created repos as the recurrence mechanism.
4. **Flake (c) — shallow-clone git-notes timeout** (`user.test.ts`, PR #70): targeted per-test timeout with headroom
   (15–20s), or trim the git setup cost so it runs well under budget; prefer per-test budget over widening the
   suite default.
5. **Flake (d) — save/sync shared-git-state races** (12 failures under a raw full `npx vitest run`): isolate each
   test's save/sync git state by construction (unique tmp repos / refs) across the integration and e2e layers;
   serialize only where isolation is disproportionate for a given case, as a recorded bounded fallback. Evidence
   caveat: the recorded repro's contrast with "the sanctioned `npm test`" is stale — since `8b82d0d9d` (2026-06-17)
   `npm test` is itself one combined `vitest run` — so the historical run likely differed in config (repo-root
   default config, no e2e global setup, 5s default timeout). Re-reproduce under the current sanctioned invocation
   before implementing; the isolation-by-construction lean stands either way as hygiene, but the repro anchors the
   exit test.
6. **Flake (e) — unit-tier contention timeout** (`validate-config.test.ts`, 2026-07-15; passes 20/20 in isolation):
   owned by the unit pool tuning (Decision 7), where it serves as evidence and as the falsifiable verification
   target — the tuning should make the signature disappear. The test itself is not modified (contention, not test
   logic).
7. **Unit tier — pool / `isolate` tuning, spike-gated.** Tune the vitest pool / `isolate` settings for the unit
   tier, preceded by a verification spike against how CLI unit tests actually use cwd/process state (worker
   threads cannot `process.chdir()`; module-level state leaks with `isolate: false`); flake (e)'s live
   reproduction is the spike's test case. Stop-loss: if the spike shows isolation cannot be safely relaxed, record
   that outcome and drop or re-target the unit-wall success criterion (e.g. shard the unit leg) — never force
   unsafe tuning to meet the number.
8. **E2E tier — CI-level sharding, delivered.** The per-tier sharding position and its CI-workflow implementation
   both land: a small GitHub Actions matrix + vitest `--shard` change on the stable post-#253 surface. The change
   surface includes `scripts/classify-change.sh` — its `HEAVY_CHECK_NAMES` list must stay byte-identical to the CI
   job names, and matrix legs rename check runs, so the classifier updates in the same change. Stop-loss:
   structural rework of the workflow legs, or more than a bounded couple of in-CI tuning iterations, stops and
   captures the remainder.
9. **Coverage — land the confirmed gaps; two in-scope product edges ride along.** Confirmed gaps by source locus:
   template rendering (`src/lib/template/render.ts` — unbalanced `arc:if`/`arc:endif` recovery, regex
   metacharacters in tokens); filesystem edges (`src/lib/io-context.ts` `readUserDir`, `src/commands/diff.ts`,
   `src/commands/status/run.ts` — symlinks inside `.arc/`, `readdir()`/`readFile()` TOCTOU vanish-between-calls);
   network errors (`src/lib/version.ts` `checkLatestVersion` — invalid JSON, malformed body, timeout); command-level
   `init` + `update` concurrency (the existing race harness targets git-ref writes only); entry-point wiring
   (`writeGitNote` stdin/EPIPE, `readGitNote` against corrupt refs, the real `runWithSpinner` error path). The
   `readUserDir` symlink cycle/realpath guard and a timeout/abort mechanism for `checkLatestVersion` are small
   product hardening deliverables paired with their tests — the timeout case is untestable without the mechanism.
10. **Notes stop-loss boundary.** Git notes are an interim bridge (retirement belongs to `local-mode` /
    `arc-backend`). Default posture: keep-the-lights-on — no new marker type, reconciliation arm, or deeper
    notes-specific machinery. Light interim investment is considerable only where it clearly earns its keep over
    the bridge window (flake/cost reduction now, on surfaces exercised until retirement); the burden of proof sits
    on the investment. Preference order: none → bounded isolation → light investment; anything structural routes
    to the retirement owners.
11. **Test-architecture normalization — principle, not restructuring.** Apply the principle (layouts named by
    production surfaces, mocks at system boundaries, assertions on observable outcomes, scenario suites split only
    at independently navigable behavior) to files this WU already touches. The full `integration/review-gate/`
    layout evaluation is deferred to the pending review-gate chain; the coordination capture routes at planning
    close.

## Scope boundary (No-gos)

- **No very-large-`.arc/` performance benchmark** — speculative (no observed degradation), and a benchmark in CI
  would be its own flake source. Revive only on observed degradation.
- **No `integration/review-gate/` layout restructuring** — the surface is half-built with a three-WU chain pending;
  restructuring now would churn under active downstream work.
- **No structural notes-substrate investment** — per Decision 10; structural work routes to `local-mode` /
  `arc-backend`.
- **No suite-default timeout widening and no unsafe isolation tuning** — per-test budgets and the spike-gated
  stop-loss instead.
- **No structural CI-workflow rework** — the sharding change is a bounded matrix + `--shard` edit; anything larger
  stops and captures the remainder.
- **Performance work is bounded to the measured hot spots** — no speculative optimization outside the 2026-07-15
  evidence.

## Consequences & Risks

- **Classifier coupling (accepted, mitigated in-change):** CI matrix legs rename check runs; if
  `scripts/classify-change.sh` `HEAVY_CHECK_NAMES` drifts from the job names, the verified-tree skip silently stops
  matching. Mitigation: the classifier updates in the same change (Decision 8).
- **Isolation-semantics risk (spike-gated):** relaxing `isolate` changes test isolation guarantees; the spike runs
  before any tuning commitment, and the stop-loss re-targets the wall-time criterion rather than forcing the
  number (Decision 7).
- **Suite-wide blast radius of shared teardown (accepted):** consolidating every git-backed teardown site into one
  primitive means a defect there is suite-wide. Accepted because drift between parallel copies is the proven
  failure mode; the consolidation lands with the full suite green.
- **Timing-evidence staleness (cheap re-check):** the 2026-07-15 measurements are assumed representative;
  re-measure via `vitest run --reporter=json` before tuning if the suite has shifted.
- **Product edges ride a test WU (bounded):** the symlink guard and version-check timeout are small behavior
  changes paired with their tests, sharing the hardening intent — not scope creep into feature work.
- **E2E stays spawn-bound per-test (accepted):** the lever is CI parallelism, not per-test optimization; runner
  minutes are spent instead, bounded by the sharding stop-loss.

## Success Criteria

1. The three CI-observed flake signatures ((a)–(c)) do not recur in CI after landing, observed over the normal
   flow of subsequent PRs; the two contention signatures no longer reproduce under their recorded local
   reproductions — the full combined `vitest run` for (d), the full unit-suite run for (e). (CI runs the tiers as
   separate jobs, so (d)/(e) are not CI-observable; the local reproduction is their falsifiable exit test.)
2. Unit-tier CI wall approaches its ~45s aggregate test time — or the spike's negative outcome is recorded and the
   criterion is consciously re-targeted (e.g. sharded unit leg) per the Decision 7 stop-loss.
3. Measured wall-clock drops at the two heavy integration files — their absolute file wall-time falls (not merely
   tier share), and they no longer carry ~31% of their tier.
4. Teardown of git-backed temp directories routes through the shared retry-safe removal primitive — the two
   factories, the three named helpers, and the per-test-file inline sites enumerated by the implementation-time
   sweep (any exclusion recorded); gc/user config and hardened removal live in one core.
5. Every confirmed coverage gap has a landed test or a recorded rejection, with the full suite green; the two
   product edges (symlink guard, version-check timeout/abort) land paired with their tests.
6. `scripts/classify-change.sh` `HEAVY_CHECK_NAMES` matches the post-matrix CI job names byte-identically in the
   same change that introduces sharding.

## Open items

- **Pool/`isolate` spike outcome** — which setting is safe for the unit tier resolves during the work; both
  outcomes have a recorded path (Decision 7).
- **Shard count and balance** — resolved through the bounded in-CI tuning iterations (Decision 8).
- **Fixture-trim vs. timeout-budget for flake (c)** — either path clears the criterion; picked at implementation
  against the measured setup cost.
