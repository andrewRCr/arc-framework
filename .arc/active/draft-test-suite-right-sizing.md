# Draft: Test Suite Right-Sizing

- **Origin:** Housekeep follow-up from recurring test-suite wall-clock friction.
- **Purpose:** Make routine verification cheap enough to run without hesitation on developer machines and CI, and
  keep it that way — by attacking measured test cost where it concentrates, taking the E2E tier off the routine
  local path while CI keeps enforcing it, and budgeting each tier so the suite cannot silently regrow. Never by
  applying a quality rubric across every test.

---

## Readiness

**State:** `formalization-ready` — one adversarial pass run (2026-09-10), seven findings verified and folded; scope
widened by decision at the same boundary. Remaining opens are implementation detail for task grounding.

## Problem / Motivation

The full suite is too slow and too costly for both the development environment and CI. It works, but a full run
is a multi-minute commitment locally and a ~20-minute compute bill on CI, so it is run less often than the quality
gates assume. Locally the cost is paid more than once: the repository-wide heavy-test admission lock serializes
every subprocess-heavy tier across worktrees on one machine, so a second session waits for the first run to
finish before its own begins, and every minute of E2E is queue latency for every other session
(`test-suite-contention-hardening` owns the lock and reliability under load). The suite grew with the codebase
under a TDD culture whose standards evolved over time, so the fear was that right-sizing meant judging ~9,500
tests one at a time — impractical.

Measurement dissolves most of that fear. Cost and count live in different populations: 82% of the test cases run
in 26 seconds, while a few dozen files in the integration and E2E tiers account for nearly all of the wall clock.
The tractable target is those files, the fixed cost every one of them pays per subprocess, the shape of the CI
E2E legs, and — the largest routine lever — whether E2E runs on the local path at all.

## Evidence (measured 2026-09-10, `main` at `3cebbab1a`)

Composition and cost by Vitest project:

| Tier                  | Files | Cases | Cost                                                          |
| --------------------- | ----- | ----- | ------------------------------------------------------------- |
| `unit` + `unit-mocks` | 683   | 9,779 | 26s local wall clock; 84s CI job; median test 0.6ms           |
| `integration`         | 137   | 1,239 | 98s local wall clock (605s summed file time); 172s CI job     |
| `e2e`                 | 53    | 413   | ~16.5 min summed across 4 CI shards; 340s critical-path shard |

Concentration — where the time is:

- **Unit:** 8 files consume 82% of tier CPU. `classify-change.test.ts` (23s, shell-script cases) and
  `harness-hooks/codex-cli.test.ts` (18s; one case is 15s) dominate; the rest are import-boundary and inventory
  scans that walk the source graph. The remaining 675 files are ordinary and cheap.
- **Integration:** top 10 files are 66% of tier time; top quarter 88%; median file 0.8s. Four files exceed 55s each
  (`decompose-v3-repository-plan` 85s with ~200 subprocess call sites, `user` 77s with 92, `review-fan-out-lifecycle`
  66s, `config-validate` 57s). `config-validate` runs at 4.4s per test because it spawns the CLI from TypeScript
  source through the `tsx` loader — deliberately, so the staleness guard cannot write to stderr and the file can
  assert clean stderr and prove the shell launchers agree with the direct command. 107 of 137 files build real
  temp git repositories; 6 spawn the built bundle.
- **E2E:** ~1,018 subprocess call sites across 53 files (430 `runArc`, 160 of them `--json`; 142 stdin/stdout-pipe
  variants; 90 explicit non-TTY; 36 anchored-shell sequences). Only 6 files assert on interactive TTY output, yet
  every non-JSON `runArc` on Linux is wrapped in `script` for a pseudo-TTY — measured as negligible overhead, so
  the wrapper is not a cost lever, only a complexity one. Static counts understate spawns: the 150-line,
  two-declaration `command-input-no-input` anchor is an `it.each` matrix whose every entry rebuilds a full fixture
  (init, stub, bare remote, push) and runs three CLI invocations, and it took 325s in one CI leg.
- **CI leg shape:** each E2E leg runs its anchor file alone, then the remainder shard (`--shard=N/4`, membership by
  path hash, not by duration). The two steps never overlap and each boots Vitest, so the critical-path signal is
  partly workflow structure, not only test cost.
- **Per-spawn fixed cost:** a warm `arc --version` costs 0.35s (0.7s cold) and ~205MB RSS against a 0.02s bare
  Node start. CPU profile: ~30% is compiling the 4.6MB / 114k-line bundle, with eager `zod` schema construction
  (~180 import sites) the next visible block. Across ~1,000 spawns that is roughly 6 minutes of E2E compute spent
  before any command logic runs. Per-file E2E timing is not yet measured locally, and CI logs carry only job totals.
- **Timeout ceilings:** integration and E2E tests run under a 30s `testTimeout`; the CLI spawn helper defaults to
  10s; E2E subprocess load runs at roughly four logical CPUs per Vitest worker. Under machine load, the sibling WU
  found every failure in one captured run was a timeout.

Shape is not the problem: test-to-source LOC is ~1.3:1 and the case split is 82/11/4 across unit/integration/E2E,
inside every published norm (Google's practiced ~80/15/5; the Rails-community 1:1–1:2 LOC band). Per-test cost in
the slow tiers is, and so is running all of it on every local pass.

Standards-compliance signals exist but are orthogonal to cost (see § Scope boundary): 1,378 spy-call assertions
(904 in 20 files), 162 internal-module `vi.mock` targets (owned by `test-di-migration`), and 510 of 683 unit files
not path-mirrored to a source file.

## Goal and success signal

**Goal:** make routine local verification take about two minutes and a full local run well under half of today's,
cut CI heavy-lane compute by a principled margin, and hold both lines — while every behavior a removed or
consolidated test protected remains protected by a retained test at some tier.

**Acceptance procedure** (the target is derived, not guessed): the instrument's first baseline names, per tier, the
addressable share — the top-decile files' time plus measured per-spawn saving × spawn count — and that figure,
recorded in `analysis-test-suite-cost-baseline.md`, becomes the spec's numeric target. **Falsifiable signals**,
measured the same way before and after:

- Routine local run (the local verification lane, below) wall clock; full local run wall clock; heavy-slot wait
  time as reported by the instrument.
- Per-tier summed file time; CI E2E summed shard time and critical-path shard; integration job time.
- Per-spawn fixed cost of the built CLI.
- Per-tier wall-clock budgets recorded, and the instrument reports against them.
- No behavior loses its only proof: every deletion or consolidation names the retained test that covers it.

## Direction (settled)

1. **Measurement instrument first.** A repository-owned, read-only `src/scripts/` entry behind an npm script (like
   the existing tier runner; not an adopter-facing `arc` verb) that captures per-file and per-test durations per
   tier from Vitest's JSON reporter, keeps several runs, reports normalized totals, reports the exact effective E2E
   shard membership for every CI leg (adopts the held `USER-INBOX` capture _Make actual E2E shard membership and
   timing directly inspectable_), reports each test's headroom against its timeout ceiling, and records heavy-slot
   wait time separately from run time. Everything below ranks off it, and it gives `quality-gate-hooks` the
   "cost is measured data" input its design wants. Publish the baseline as `analysis-test-suite-cost-baseline.md`
   under `.arc/reference/supplemental/analysis/`, so the evidence outlives this draft (deleted at spec creation).
2. **Per-spawn fixed cost, split by side.** _Harness side:_ enable Node's on-disk compile cache through the spawn
   environment (`NODE_COMPILE_CACHE`) in the test helpers — a call inside the bundle cannot cache the bundle itself,
   so this is a test-only saving and is framed as one. _Product side:_ lazy-load command modules and their `zod`
   schemas inside the existing single bundle so `--version`-class paths do not construct everything; this is the
   part that benefits every real invocation. A launcher entry that changes `bin` or dist layout is out of scope —
   it would alter the freshness contract `e2e-build-coordination` owns.
3. **Cost-ranked audit of the slow tiers.** Work the E2E and integration files in descending cost order, top
   decile first, applying the per-test rubric below. **Stop rule:** stop when three consecutive ranked files each
   yield under 2% of their tier's summed time.
4. **Tier and fixture correctness.** Integration files at E2E-grade cost per test are mis-tiered, spawning from
   source, or rebuilding fixtures every test. Decide per file: spawn the built bundle instead of `tsx` while
   preserving `config-validate`'s clean-stderr proof and launcher shim; share a prepared repository per file
   (`beforeAll` plus copy) instead of `git init` plus commits per test; move genuine full-CLI cases to E2E. Evaluate
   `isolate: false` for the integration project the way the unit tier already does (CI reports 17s of import time
   in that job), quarantining the three `vi.mock` files as the unit tier does.
5. **CI E2E leg structure (in scope).** Use the instrument's shard view to rebalance the four legs by measured
   duration and to fold each leg's anchor and remainder into overlapping execution where Vitest allows it; keep the
   low-maintenance anchor hybrid rather than a full file manifest. Shard count and runner capacity stay out
   (`local-ci-capacity-qualification`, `self-hosted-ci-qualification`).
6. **Unit outliers.** Treat the 8 heavy unit files individually: shell-script tests may run fewer fixtures or move
   tier; graph-walking boundary tests may share one scan per file instead of one per case.
7. **Local verification lane and selection rule (project layer).** Extend `DEV-RULES.PROJECT` § Selecting what to
   run — already vocabulary-neutral and independent of the gate-model rename — with rows that resolve from
   `git diff --name-only`:
    - At the per-task gate, `vitest --changed` over the unit projects replaces filename-fragment targeting.
    - Changes confined to one tier's test directory reach only that tier; source or tooling-config changes reach
      every tier (the existing rule).
    - **The E2E tier is CI's enforcement**, run on the heavy lane before merge. Locally it runs only for changed E2E
      files or on explicit request; the routine local Tier 2/3 run is unit plus integration. This instantiates the
      feedback-versus-enforcement cut at the project layer; the corresponding wording in the quality-gates
      strategy's whole-run rule, `QUICK-REFERENCE`, and `verify-work-unit`'s local attestation is amended to say
      what CI covers. `quality-gate-hooks` lifts the rows later as it already plans to.
8. **Per-tier wall-clock budgets.** Record a budget per tier from the post-work baseline; the instrument reports
   against it and CI warns when a tier exceeds it. Advisory only — never a red gate, so noise cannot block a merge.
9. **Hygiene is incidental only.** While auditing a file for cost, note standards-noncompliance patterns seen in
   passing; do not go looking. See § Scope boundary for where those notes live.

### Levers deliberately weighed

- **Substrate-bound cost.** The user-notes and sync substrate (git notes, bare remotes, multi-clone) is interim per
  `strategy-storage-evolution` — it composes toward the `arc-backend` target but is what ships now. Its tests
  (`user` 77s, `user-notes-compaction`, `notes-export-state-coherence`, `multi-clone`, the `user` E2E files) are
  real proofs of a concurrency-sensitive surface (`strategy-user-notes-concurrency`). Two consequences: prefer
  cheap fixture-sharing and spawn consolidation over deep restructuring of tests that retire with the substrate,
  and never thin coverage of the notes mutators to save time. The instrument reports how much cost is
  substrate-bound, because that portion has a known expiry.
- **In-process spines (escalation path, not committed).** The largest E2E files are lifecycle spines
  (`delivery-position` 4,170 LOC, `candidate-lineage`, `errand`, `session-init`) that spawn the CLI dozens of times
  per scenario. Where a scenario only needs handler-seam outcomes, integration can drive the verb cores through
  CLI-generated inputs (`testing-standards` sanctions exactly that seam) at a fraction of the cost; keep one
  real-spawn smoke per verb, and keep destructive verbs at E2E · `[invariant]`. A general in-process CLI harness
  (invoking the entry in-process with captured stdio and per-test cwd) would remove spawn cost wholesale but
  carries process-isolation risk under Vitest's pools; it is the recorded escalation if consolidation and tier
  moves cannot cut spawn counts enough, and it is designed only then.
- **Parallelism shape.** Files run in parallel, tests within a file sequentially, so a 94-test file is a shard's
  critical path however many workers exist. Splitting the largest files is a wall-clock win with no CPU saving;
  the instrument's shard view says whether it matters.
- **Not levers here:** the `script` TTY wrapper (measured negligible), shard count and runner capacity (owned
  elsewhere), the admission lock itself (owned by `test-suite-contention-hardening`; the local lane shortens what
  it serializes without changing it), and any coverage-based minimization (below).

## Per-test decision rubric (for a test already selected by cost)

Derived from Khorikov's four pillars and Google's unit-testing guidance; applied only to cost-ranked candidates,
never as a sweep. Ask in order:

1. **What behavior does this test protect?** If no one can say, its coverage was already fictional — delete
   (Google's criterion for unclear tests).
2. **Is that behavior already proven at a cheaper tier through the sanctioned seam?** An E2E case that re-proves a
   handler-seam outcome integration already proves is a deletion candidate; keep the E2E case when the behavior is
   only observable through the real CLI (destructive verbs stay E2E per `testing-standards` · `[invariant]`).
3. **Can several cases share one expensive setup or spawn?** Sequencing assertions through one CLI run or one temp
   repository preserves every assertion at a fraction of the cost. Prefer this over deletion. **Headroom
   constraint:** a consolidated test keeps at least 3× headroom against its timeout ceiling or carries an explicit
   per-test timeout, and every stderr and exit-code assertion it replaces survives.
4. **Does it still fail when the logic breaks?** For a deletion that rests on "another test covers it", confirm
   the retained test kills the same faults — by inspection, or by mutation testing on the pair when inspection is
   unconvincing (see § Unknowns for the tooling trigger).
5. **Record the retained protector.** Every deletion names the test that now carries the behavior.

Coverage overlap alone never justifies deletion: the replicated finding (Rothermel et al.) is ~80% size reduction
costing ~48% of fault detection when suites are minimized on coverage. Deletion needs behavioral intent plus a
named protector.

## Alternatives

- **Rubric sweep across all tests** — judge every test against the standards and prune. Rejected: impractical at
  9,500 cases and aimed at the wrong population; the cheap tier is not the cost.
- **Coverage-subsumption minimization** — delete tests whose covered lines are a subset of another's. Rejected as a
  deletion criterion (fault-detection loss above); usable only as a screening hint.
- **Selection instead of reduction** — run only affected tests per change and leave the suite as is. Not
  sufficient alone: static import graphs miss runtime wiring, every spawning tier depends on the whole bundle, and
  the full suite still runs on CI at full cost. Adopted as a complement (Direction 7), not the plan.
- **Infrastructure only** — more shards, a local runner. Already in flight elsewhere and masks the per-test cost
  rather than removing it. The case-study consensus is fix cost first, then scale.
- **Content-only boundary** — leave every gate question to `quality-gate-hooks`. Rejected: the project-layer
  selection rule already exists, is vocabulary-neutral, and was written to be lifted; extending it with the local
  lane is where the step change in routine wall clock lives, and it does not pre-empt the gate-model design.
- **A launcher entry for the compile cache** — a product-side second dist artifact. Rejected: changes `bin`, dist
  layout, the staleness stamp's inputs, and another WU's freshness contract for a saving the spawn environment
  captures on the harness side.
- **Reduce cost where it concentrates, take E2E off the routine local path, budget the tiers (chosen).** Smallest
  evidence-backed change that moves the measured signals and holds them.

## Unknowns and Assumptions

- **E2E per-file timing** is unmeasured locally and absent from CI logs (default reporter prints job totals). The
  instrument closes this; the ~6-minute startup share is spawn sites × warm startup until then.
- **Lazy-loading yield** is unmeasured beyond the profile; the first task of Direction 2 is a before/after on
  `arc --version` and one heavy E2E file, for both the harness-side cache and the product-side lazy load.
- **Anchor/remainder overlap** in one Vitest invocation depends on how `--shard` composes with an explicit file
  argument; verify against the installed sequencer before committing the leg shape.
- **Mutation testing** (Stryker Mutator: open source, Apache-2.0, `@stryker-mutator/core` +
  `@stryker-mutator/vitest-runner`, not installed). Setup is an hour or two; the cost is runtime, since each
  mutant re-runs the covering tests and the Vitest runner is single-threaded. **Settled:** not installed up front —
  adopt it the first time a rubric step 4 decision cannot be settled by inspection; that decision is the trigger,
  and the spec records it as such. Never across the corpus, never in CI.
- **Duration capture** costs nothing beyond a script: Vitest's JSON reporter already emits per-test `duration`.
- Assumes the merge gate's required CI checks remain the enforcement of the E2E tier; the local lane is safe only
  while that holds.
- `quality-gate-hooks` records `Depends On: class-model-foundation`, which has shipped; the dependency is stale
  but does not affect this WU.

## Scope boundary (Won't Do)

- **No hygiene sweep.** Standards compliance (spy-call assertions, unmirrored files, internal mocks) is worth
  doing but not here. Observations made incidentally during the cost audit go to a WU-agnostic analysis document,
  `analysis-test-hygiene-observations.md` under `.arc/reference/supplemental/analysis/` (its README already
  classes observational inventories there), plus one `USER-INBOX` capture proposing a hygiene work unit and
  naming that file as input. No per-observation inbox entries, and no planning artifact of this WU holds them.
- **No gate-model redesign** — gate × kind vocabulary, pre-push dispatch, check-gates audit stay with
  `quality-gate-hooks`; Direction 7 touches only the project-layer selection rule and the wording that instantiates
  it.
- **No timeout, contention, or admission-lock policy** — load-relative budgets, serialization, and the lock belong
  to `test-suite-contention-hardening` (the held subprocess-budget capture was redirected there 2026-09-10).
- **No shard-count or runner-capacity changes** — `local-ci-capacity-qualification`, `self-hosted-ci-qualification`.
  Leg balancing and anchor/remainder shape within four legs are in scope (Direction 5).
- **No launcher entry, `bin` change, or dist-layout change** — `e2e-build-coordination` owns bundle freshness and
  publication.
- **No DI migration of the quarantined `unit-mocks` files** — `test-di-migration`.
- **No restructuring of the notes substrate's tests beyond fixture sharing and spawn consolidation** — they retire
  with the substrate.
- **No general in-process CLI harness** unless the escalation condition above is met and designed at that point.
- **No changes to test-first or testing-standards doctrine**; the rubric here is a triage aid for cost-selected
  tests, not a new standard.

## Coordination

- `quality-gate-hooks` — consumes the cost instrument and later lifts the selection and lane rows to the framework
  layer; owns gate policy beyond Direction 7.
- `evidence-applicability` (active) — its principle, _evidence applicability follows covered content_ judged over
  one typed path-treatment delta with a `carries | supplemental | fresh` answer, is the same cut Direction 7 makes
  for test tiers at the run level. Its D1 path-treatment registry is the natural home for the path classes the
  selection rows key on; when it lands, the rows consume that registry rather than carrying a second taxonomy. Its
  verification-scaling (`targeted` / `focused` / `full`) governs when a repeat is owed; this WU governs what a run
  costs and which tiers it must include. Distinct questions; keep them so.
- `session-init-performance` — overlapping measurement of `arc status --session-init` wall clock only; that WU is
  about bounding git work in the probe, not module loading.
- `test-suite-contention-hardening` — receives the subprocess-budget capture; owns the admission lock; the
  instrument's headroom and slot-wait data are input.
- `e2e-build-coordination` — owns focused-test flag forwarding and E2E bundle freshness; the instrument and the
  harness-side compile cache must not alter that contract.
- `arc-backend` / `strategy-storage-evolution` — the substrate-bound cost share is an input to that transition's
  test plan.

## Boundary fit and Class

`assess-boundary-fit`: **stays one WU** — one concern (routine verification cost) designed as a whole; the seams
above are coordination, not orthogonal deliverables. Re-raise only if the in-process harness escalation fires or
Direction 7 grows past the selection-rule rows.

`classify-work-unit`: estimate corrected `Light → Heavy`. Derivation fires (the triage method, the lane policy, and
their decision rules must be authored) and scale fires (a large surface to ground); it composes from established
practice rather than inventing, so not `Novel`. Persisted at the draft-capture ceremony.

## Resolved / Open / Next

**Resolved (2026-09-10):** goal is routine wall-clock and CI cost, hygiene incidental only and routed to an analysis
document; per-spawn fixed cost split harness/product with no launcher entry; tier and fixture correctness, CI leg
balancing within four legs, the local verification lane, and per-tier budgets are in scope; measure first and rank
by cost with a quantified stop rule; deletion requires behavioral intent plus a named protector and consolidation
keeps timeout headroom; the instrument is a `src/scripts/` npm script; mutation testing adopts on demand; inbox
captures dispositioned; notes-substrate tests get cheap wins only; in-process harness is an escalation path.

**Open (implementation detail):** per-file handling of the 8 unit outliers; the exact `--shard` plus anchor
composition; the numeric per-tier targets and budgets (derived from the baseline by the recorded procedure).

**Next:** capture the draft, persist `Class`, repoint `Design`, advance the stage pointer to create-spec.

---
