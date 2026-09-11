# Spec (`detailed` · `RFC`): test-suite-right-sizing

- **Origin:** [internal] — housekeep follow-up from recurring test-suite wall-clock friction.

- **Purpose:** Make routine local verification cheap enough to run without hesitation, and keep it that way — by
  taking E2E off the routine local path while CI keeps enforcing it, making cost measured data rather than
  impression, cutting the fixed costs measurement identifies, and budgeting each tier so the suite cannot silently
  regrow.

---

## Introduction / Context

The full suite works, but running it is a multi-minute commitment locally and the dominant compute cost on CI, so
it is run less often than the quality gates assume. Locally the cost compounds: the repository-wide heavy-test
admission lock serializes subprocess-heavy tiers across worktrees, so every minute of E2E is queue latency for
every other session.

The presumed remedy was judging some eleven thousand cases one at a time — impractical. Measurement dissolves
that, and reshapes the problem substantially. All figures below are tier-isolated on a quiet machine unless a row
names its project set; the full method, per-file rankings, and caveats live in
`analysis-test-suite-cost-baseline.md`.

| Tier                      | Wall clock  | Summed file time | Files | Cases  |
| ------------------------- | ----------- | ---------------- | ----- | ------ |
| `unit` + `unit-mocks`     | 25.3 s      | 74 s             | 685   | 9,854  |
| `integration`             | 47.4 s      | 342 s            | 137   | 1,248  |
| `e2e`                     | 280.3 s     | 1,784 s          | 53    | 528    |
| **Full local run**        | **~353 s**  | 2,200 s          | 875   | 11,630 |
| Routine lane, one command | **56–58 s** | ~410–430 s       | 822   | 11,102 |

_Amended 2026-09-11 — The first instrument baseline supersedes this pre-instrument orientation table for scoring:
unit is 23.55 s wall / 143.58 s summed, integration is 45.46 s / 376.47 s, the admitted lane is 55.32 s /
520.80 s, and E2E is 264.65 s / 1,674.31 s, each a three-run median at 12 workers._

_Amended 2026-09-11 — Member-boundary review found that the first instrument omitted suite-hook execution time.
The corrected authoritative medians are: unit 24.25 s wall / 148.52 s summed, integration 45.55 s / 379.26 s,
the admitted lane 59.08 s / 566.65 s, and E2E 272.68 s / 1,727.55 s, each at 12 workers._

_Amended 2026-09-11 — A second member-boundary review required durable success evidence and complete user-sync
classification. Schema-v2 medians supersede the prior baseline: unit 23.09 s wall / 137.94 s summed, integration
42.43 s / 361.33 s, the admitted lane 54.39 s / 513.54 s, and E2E 255.56 s / 1,611.47 s, each at 12 workers._

_Amended 2026-09-11 — A third member-boundary review required run-level unhandled-error rejection, effective native
worker sizing, and a reachable comparison operation. Schema-v3 medians supersede the prior baseline: unit 23.47 s
wall / 141.02 s summed, integration 42.63 s / 361.01 s, the admitted lane 57.33 s / 548.18 s, and E2E 257.56 s /
1,624.01 s, each at 12 workers._

Four facts govern the design.

**E2E is 79% of the local run.** Taking it off the routine local path — CI still enforces it before merge — moves
the routine run from ~353 s to a measured 56–58 s when the unit and integration projects run as one command (the
projects interleave in one worker pool, so the lane costs less than the two tiers summed). No other lever is close,
and it costs a policy decision plus one tier-runner mode rather than engineering.

**Wall clock is floored by the longest file, not the total.** Files run in parallel and tests within a file run
sequentially, so a tier cannot finish before its longest file does. `user.test.ts` at 40 s tier-isolated (46–49 s
inside the lane) is the floor of a 44 s integration tier whose summed time over 12 workers would be ~28 s;
`classify-change.test.ts` at 23 s is the floor of a 24 s unit tier. Reducing summed time lowers CPU cost,
contention under load, and CI job-seconds; it does not move the routine lane's wall clock until the longest files
shrink or split.

**The two slow tiers are slow for different reasons.** In `integration`, only four of 137 files spawn the CLI at
all; they hold 29% of tier cost, while the other 133 hold 71%. Probing two of the largest non-spawning files
(`user`, `init`) puts per-test fixture construction at 26–36% of their time; the rest is test-body work. In `e2e`,
per-spawn CLI startup is the recurring term across roughly a thousand spawns. A single "reduce per-spawn cost"
story does not fit both.

**Cost concentrates hard, but not where a rubric would look.** Two `unit` files are 55% of that tier and neither
spawns the CLI. Four `integration` files are 47%. Twelve `e2e` files are 72%. In every case the expensive thing is
fixed overhead — process spawns, loader cost, repository construction — not assertions. Reducing it touches no
test semantics.

**Measurement discipline is itself a finding.** The same tier measured 51.1 s and 47.4 s on consecutive quiet
runs: run-to-run variance is roughly 8%, so any lever below ~10% is not established by a single run. Separately,
single-file, tier-isolated, and under-load measurements of the same file span 2.4×. Both traps produced wrong
conclusions during this spec's own authoring before being caught, and a third followed: the routine lane's
starting point was first stated as the two tiers summed (~73 s) and measured as one command at 56–58 s. Every
number here that describes a path the suite takes was measured on that path; where a number is still an estimate,
the text says so.

## Goals

1. Routine local verification costs well under a minute rather than about six. The lane alone reaches ~56 s; the
   cost work on top of it is measured against that, not against the full run.
2. A full local run and CI heavy-lane wall time both fall measurably, by margins derived from measurement rather
   than guessed.
3. Both lines hold over time — the suite cannot silently regrow past a recorded budget.
4. Cost becomes measured data the project can act on, including for work that follows this one.
5. Every behavior a removed or consolidated test protected remains protected by a retained test at some tier.

Goal 2's CI side follows the runner's shape. The self-hosted mini runs two job slots at one Vitest worker each — a
measured ceiling owned by `local-ci-capacity-qualification` — and a heavy run packs roughly 1,050–1,360
job-seconds onto them (two recorded runs; `analysis-test-suite-cost-baseline.md` § CI on the mini), so heavy-lane
wall time is total job-seconds over two slots. Every CPU-second D3 and D4 remove is CI wall
clock there, which is why summed-time levers count on CI even where they do not move the local lane. The lever that
would move CI by a large factor is not spawning the CLI a thousand times, and that is a separate work unit (see
Coordination).

## Non-Goals

_Frozen at activation; changes after that append: `Amended YYYY-MM-DD — <delta> — <prompt>`_

- **No general in-process CLI harness.** Invoking the entry in process with captured stdio and a per-test working
  directory removes spawn cost wholesale, and it is captured as its own successor work unit depending on this one.
  It needs a design authored — chiefly the isolation model under Vitest's pools, where `process.exit` would end a
  worker, the working directory is per-process rather than per-test, and module-level caches outlive the test that
  filled them. That is drafting work, not spec crystallization, and flaky tests are a worse outcome than slow
  ones. Driving verb cores through the **handler seam** is a different move and is in scope: it uses a seam
  `testing-standards` already sanctions, mints no mechanism, and D7 owns it.
- **No hygiene sweep.** Standards compliance — spy-call assertions, unmirrored unit files, internal-module mocks,
  and assertions binding prose formatting rather than semantics — is worth doing but not here. It has its own
  captured work-unit target; incidental observations route to `analysis-test-hygiene-observations.md`.
- **No gate-model redesign.** Gate × kind vocabulary, pre-push dispatch, and the check-gates audit stay with
  `quality-gate-hooks`. D1 touches only the project-layer selection rule and the wording that over-asserts
  against it.
- **No timeout, contention, or admission-lock policy** — `test-suite-contention-hardening`.
- **No shard-count, runner-capacity, or CI worker-cap changes** — `local-ci-capacity-qualification` measured the
  mini's guest saturating at two to three concurrent jobs at one Vitest worker each, a property of the chip's four
  performance cores that no worker setting or allocation change recovers; its two-slot, one-worker decision stands.
  Anchor selection within the existing four legs is in scope, and so is the **local** worker cap (D5);
  duration-aware shard membership is not.
- **No launcher entry, `bin` change, or dist-layout change** — `e2e-build-coordination` owns bundle freshness and
  publication. `bin` continues to point at `dist/cli.js`, and `dist/` stays a single file.
- **No DI migration of the quarantined `unit-mocks` files** — `test-di-migration`.
- **No restructuring of the notes-substrate tests beyond fixture sharing, file splitting along existing seams,
  and spawn consolidation** — they retire with the substrate.
- **No changes to test-first or testing-standards doctrine.** The per-test rubric is a triage aid for
  cost-selected tests, not a new standard.
- **No coverage-based suite minimization** as a deletion criterion.

## Proposed Design

Ordered by measured value, not by engineering interest. D1 and D2 carry the goals; D3 through D5 are the cost
work; D6 makes the result durable, and D7 and D8 take what the mechanical levers leave, sized by what measurement
finds.

### D1 — Local verification lane and selection rule

The largest lever, and the one that delivers Goal 1 almost entirely.

**The lane needs a runnable form before it can be a rule.** Today `npm test` resolves through the tier runner's
`full` mode, whose argument list is empty — every project including `e2e`, under one heavy-admission slot — and
`LocalHeavyTestTier` has no unit-plus-integration variant. So this carries product code:

- Add a `LocalHeavyTestTier` variant for the routine lane and its argument list (`--project unit --project
  unit-mocks --project integration`). `npm test` re-points to it — it is what agents and the gate rows reach for —
  and a new `test:full` keeps the whole run. CI calls only the per-tier scripts, so it is unaffected.

Then extend `DEV-RULES.PROJECT` § Selecting what to run — vocabulary-neutral and confirmed absent from the package
source, so a project-local edit — with rows resolving from `git diff --name-only`:

- At the per-task gate, `vitest run --changed` over the unit projects replaces filename-fragment targeting.
- Changes confined to one tier's test directory reach only that tier; source or tooling-config changes reach every
  tier (the existing rule).
- **The E2E tier is CI's enforcement**, run on the heavy lane before merge. Locally it runs only for changed E2E
  files or on explicit request; the routine local run is unit plus integration.

This changes _where and when_ a tier is enforced, never _whether_ — zero tolerance is untouched, and the existing
rule already separates what must pass from how often each check is re-executed. **Load-bearing assumption:** the
lane is safe only while `ci-ok` remains a required status check on the merge gate, since that is what makes the
heavy lane's E2E run enforcement rather than advice. That is repository configuration, not something in the tree.

_Amended 2026-09-10 — The repository's required context is `merge-ok`, a compatibility gate that fails unless
`ci-ok` succeeds. The load-bearing condition is therefore that the configured required merge context transitively
enforces `ci-ok`, not that `ci-ok` itself is listed as a required context. Confirm both the ruleset binding and the
workflow dependency when validating the lane._

**Seven documents over-assert against this cut and must be amended.**

- `DEV-RULES.PROJECT` § Selecting what to run closes with "it never licenses running a tier partially, and Tier 3
  in particular is still run whole." Left alone, the section contradicts its own new rows one paragraph apart.
- `QUICK-REFERENCE` names `npm test` as the whole suite at four sites, not one: § Quality Gate Commands states
  "Run it whole — the strategy's no-partial-Tier-3 rule holds" and separately that `npm test` runs every Vitest
  project, and § The gates and § Testing each call it the full suite. `DEV-RULES.PROJECT` delegates
  gate commands here, so leaving any of them would let the lane be established and then overridden in practice. A
  fifth site is not a whole-suite claim but falls to the same delegation: § Incremental — Tier 1 instructs a
  filename-fragment unit filter, which is exactly what the new per-task row replaces, so rule and command would
  contradict each other one file apart.
- `strategy-testing-methodology.md` § Integration with Quality Gates maps Tier 2 to "Full test suite — `npm test`".
- `docs/contributing.md` is a second, hand-maintained contributor page in the published docs nav, bound to the
  root one by nothing but convention. It carries both the clean-checkout block and a gate table whose tests row
  reads "Unit, integration, and E2E" — the composition claim the lane falsifies outright.
- `CONTRIBUTING.md` lists `npm test` among the checks that must pass on a clean checkout, where the whole run is
  what a setup verification actually wants.
- `strategy-quality-gates.md` § Tier 3 lists "Full integration/E2E test suite (all configurations)" and "Never
  skip or partially run Tier 3".
- `verify-work-unit.md` Step 1 asserts the full-suite run "serves as attestation that everything passes as a
  whole".

The first five are project-instance files, edited locally. The last two are shipped framework files, edited through
the package source and synced — and amended only enough to stop over-asserting. **No framework-layer capability is
minted:** a project designating a tier as CI-enforced remains `quality-gate-hooks` territory. `TECHNICAL-OVERVIEW`
§ 4's command line is corrected at the same time, which also clears its existing staleness (it documents three
tiers against four Vitest projects).

**Prose-contract risk.** 40 test files read and assert on Markdown prose, and 27 reference the documents above. A
sibling session has already hit an assertion that failed only because valid reflow split a phrase across a
newline. Re-run those assertions after the amendments; treat any brittle assertion found as an incidental
observation per D8, never as licence to sweep.

### D2 — Cost instrument and baseline

Everything measured after this point routes through one instrument, and every work unit downstream of this one
depends on it existing.

A repository-owned, read-only entry under `packages/arc-framework/src/scripts/` behind an npm script, alongside
the existing tier runner `run-local-test-tier.ts`. Not an adopter-facing `arc` verb. It captures per-file and
per-test durations per tier from Vitest's JSON reporter and reports:

_Amended 2026-09-11 — Vitest's JSON payload cannot carry the required collection/setup fixed term. The instrument
therefore reads the completed reported task graph from the in-process run; its retained output remains JSON._

_Amended 2026-09-11 — Member-boundary review corrected three semantics. Complete per-file cost is
`collectDuration + setupDuration + module duration`; module duration includes every test and hook, while individual
test durations remain separate diagnostics. Effective CI-leg membership is the workflow-mapped pinned anchor plus
the Vitest-derived remainder shard. Whole-test headroom uses the Vitest task timeout only; a CLI helper timeout is
retained separately because it bounds one subprocess invocation, not the whole test. Admission wait ends at lock
acquisition, before the action begins._

_Amended 2026-09-11 — Retained-run schema v2 records an explicit successful outcome only after every Vitest module
is terminal (`passed` or `skipped`) and `ok()`; capture refuses other states before persistence, and normalization
refuses legacy or unstamped input. The substrate classifier includes the complete user-sync family._

_Amended 2026-09-11 — Retained-run schema v3 also requires Vitest's run-level unhandled-error set to be empty.
Requested `native` sizing resolves to Vitest's effective non-watch default before invocation and both values remain
observable. The repository-owned `benchmark:test-cost:compare` entry normalizes retained groups, refuses a cross-mode
lever, classifies sub-10% wall and summed-time deltas as noise, and keeps worker-sizing sweeps a distinct operation._

1. Per-tier and per-file summed time, **normalized across several retained runs** — not a single run. Per-file
   cost counts the file's own transform, import, and hook time, which the JSON reporter's per-file window omits
   and which is the whole of what some levers move.
2. The exact effective E2E shard membership for every CI leg.
3. Each test's headroom against its timeout ceiling.
4. Heavy-slot wait time, recorded separately from run time.
5. The share of tier cost that is substrate-bound (notes, sync, multi-clone), which has a known expiry.
6. Per-tier budgets and each tier's standing against them (D6).

Two of those reports need something the instrument cannot read today. Slot wait is computed inside the heavy-test
admission wrapper and only ever rendered as prose to stdout, so the wrapper gains a typed return carrying it. The
instrument starts Vitest in process through that same wrapper — a sibling of the tier runner rather than a wrapper
around it — so it reads the wait off that return and the run's own file tasks off the run, with no channel between
processes to design. That is an observability seam, not admission policy — it changes no
timeout, lock semantics, or admission behavior, and so does not reach `test-suite-contention-hardening`'s
territory. Shard membership is asked of Vitest through `vitest list` with the CI workflow's own exclusions rather
than re-derived from its internal path hash, which would pin the instrument to one Vitest version.

**Measurement-mode discipline** · `[invariant]`. Every baseline records its mode in three parts — the
**condition** (**single-file**, **tier-isolated**, **under load**, **standalone probe** for a spawn measured
outside any tier, or **CI job**, which no local condition describes and D6's per-job budgets need), the **project
set** it ran in (one tier, the lane, or the full run), and the **worker sizing** in force — and the instrument
refuses a **lever claim** whose modes differ. Worker sizing is the part needing a distinction rather than a flat
refusal: a lever claim compares one artifact before and after and must match on all three, or a worker change
reads as suite-cost improvement; a **sizing sweep** varies worker sizing deliberately with everything else held,
and is a distinct operation rather than a comparison to refuse. `config-validate.test.ts` measures 23.5 s
single-file and 37–40 s tier-isolated; `user.test.ts` measures 40 s tier-isolated and 46–49 s inside the lane; the
same tier measures 4.4 s and 1.8 s per test under load versus isolated. **A single run
cannot establish a lever below ~10%**, because run-to-run variance is roughly 8%; the instrument reports
normalized multi-run figures and flags any claim inside that band.

`analysis-test-suite-cost-baseline.md` already carries a hand-measured pre-instrument baseline. The instrument
supersedes it and inherits its method notes.

### D3 — Integration fixture cost and file floors

Three levers with different metrics. Fixture sharing cuts summed time — CI job-seconds on a throughput-bound
runner, and the CPU floor locally. Re-tiering is a correctness fix that happens to remove both summed time and a
file floor from the lane. File splitting cuts the per-file floor, which is what the routine lane's wall clock
actually sits on. None substitutes for another.

**Fixture sharing — a bounded lever, measured.** The largest and fourth-largest non-spawning files, `user` and
`init`, build one fixture per test through the tier helper: `initInTempRepo` plus a commit (~110 ms, 11 git
spawns), or the same plus a bare remote (~140 ms, 14 spawns). Git spawns are not the cost — nine of them are
~24 ms of the ~106 ms `runInit` path; the rest is the init command writing a 187-file `.arc/` tree. Copying a
built fixture costs ~7 ms. Fixture construction is 26–29% of `user.test.ts` and 32–36% of `init.test.ts`, so
per-file yield is bounded near that share; across the
133 non-spawning files it is the largest summed-time lever the tier is known to have, not a dominant one. The
second-largest non-spawning file, `review-fan-out-lifecycle` (37.5 s, 15 cases), has a different profile entirely
— no CLI spawns, no git, 2.5 s per case of in-process delivery-store work — and is a D2 probe target before any
lever is chosen for it.

- **Share a frozen prepared repository per fixture shape** — build once per file (or once per shape, where a few
  shapes cover most files), copy per test. **The copy must be audited for absolute paths** · `[invariant]`: the
  plain fixture carries none, but the bare-remote shape records the remote's absolute path in `.git/config`, and a
  linked worktree's `.git` file and `$GIT_DIR/worktrees/<id>/gitdir` are absolute by documented design. A naive
  copy of those shapes silently couples every "independent" test to one shared remote or object store. Create the
  remote per test (three cheap spawns) or rewrite the reference on copy; never share it.
- **Close the remote leak at its two call sites.** `addBareRemote` returns its temp directory and leaves removal
  to the caller. Nearly every calling file removes it; two discard the return and therefore cannot, and the
  removal primitive throws after its retries rather than failing quietly. One developer machine had accumulated
  over a thousand `arc-remote-*` directories — those two sites across many runs, plus runs killed at a timeout
  before teardown. Fix both sites, then have the helper register its directory with the tier helper's existing
  cleanup path so the class cannot return. Same-concern cleanup of code D3 already touches, not a rider.
- **Re-tier by definition, not by cost.** The project's tier definition places full CLI invocation in E2E. A file
  whose every case spawns the `arc` CLI is E2E and moves there because it is misclassified; the lane effect is a
  consequence, never the reason. The set is enumerable — four integration files spawn the CLI (`config-validate`,
  `review-cli-surfaces`, `decompose-v3-repository-plan`, `scripts/remedy-roadmap-conflict`) — and the rule is
  applied per file at execution: a file that spawns a script rather than the CLI, or drives handler seams and
  spawns only incidentally, stays. `config-validate` qualifies on inspection: every case spawns the CLI and asserts
  clean stderr, and its launcher-shim comparison sits inside the compatibility corpus, so it moves whole.
- **The move ends the `tsx` loader spawn.** `config-validate` is the only file spawning `src/cli.ts` through
  `tsx` (1.23 s per spawn against the bundle's 0.36 s, ~21 spawns); in E2E it spawns `dist/cli.js` like every
  other E2E file, fresh from that tier's `globalSetup` build. This trades a structural guarantee (a source entry
  cannot run the staleness guard) for the procedural one E2E already lives with; record the trade. There is no
  environment seam to suppress the guard — `dev-check.ts` reads no `process.env` — and minting one is out of
  scope. The clean-stderr assertions survive: the guard is silent on a fresh bundle.

**File splitting — the wall-clock lever.** After re-tiering, split whichever integration files still exceed the
tier's summed-time floor — ~28 s at 12 workers today, lower once fixtures are shared. Today that is `user` (40 s),
`review-fan-out-lifecycle` (37.5 s), and `decompose-v3-repository-plan` (44 s) if the rule keeps it. `user` has
eleven `describe` blocks to cut along; the other two are one flat block each, so their seams are chosen by fixture
shape and case count rather than found. It is the only thing that moves the lane after sharing — with templating
alone `user.test.ts` stays near 30 s and so does the tier — and it buys that wall clock at a small CPU price,
since each new file re-pays its own transform and import. Split to clear the floor, not past it. A split changes
no test body and no assertion; SC10 is satisfied by construction.

**Two candidate levers sit inside the noise band and must be confirmed before adoption**, each measured once at
~9% and ~6–12% respectively against ~8% variance: a tmpfs fixture root (`TMPDIR` on `/dev/shm`) and `isolate:
false` for the integration project. The tmpfs run and the `--no-isolate` run each passed all 1,248 cases,
including the three `vi.mock` files the unit tier's analogue quarantines — but mock leakage is order-sensitive, so
one green run is not proof. Confirm both through D2 across several runs; adopt only what clears the band. **tmpfs
on E2E measured 0.5% and is not a lever there.**

### D4 — Per-spawn CLI startup cost

Defer command-handler module bodies so a spawn stops constructing the whole CLI. Benefits every real `arc`
invocation, not only tests.

- **Commander registration stays eager.** `cli.ts` is already pure wiring; names, descriptions, and options must
  be registered up front for parsing and `--help`.
- **Handler bodies load lazily** through `await import()` at invocation. `cli.ts` already calls `parseAsync()` and
  two actions are already async, so no entry restructuring is needed. The conversion unit is the **module**, not
  the action site: the entry reaches its commands through roughly thirty imported handler and command modules, and
  its ~141 `.action()` sites are call sites that follow from which module went lazy, several of them sharing one
  module. The shared interaction wrapper is generic in its return type, so an action that becomes async flows
  through it unchanged.
- **Set `splitting: false` explicitly in `tsup.config.ts`** · `[invariant]`. tsup defaults ESM splitting to
  `true` and the config sets no key, so today's single-file `dist/` is a consequence of having no dynamic imports.
  Adding them without this would silently produce the dist-layout change the Non-Goals forbid.
- **The kernel stays eager**, as does `dev-check`, preserving the staleness guard `e2e-build-coordination` owns.

**Measured yield: 0.36 s → 0.21 s per spawn on a real verb (~42%), RSS 205 MB → ~100 MB.** The remaining 0.12 s is
structural: `dist/cli.js` carries 532 top-level imports of nine external dependencies, and ES module semantics
evaluate them before any module body runs. What that saving is worth across the E2E tier depends on the tier's
actual spawn count, which D2 measures — this spec does not project it.

**Why it is here.** The routine lane gains nothing from D4: only four integration files spawn the CLI. Its value
is product startup and memory on every real `arc` invocation, plus E2E job-seconds on CI, where the mini's two-slot
runner turns summed savings directly into wall time. The spec keeps it on those two grounds, not on the local lane.

**Regression risk to name.** Registration that runs at import time — a kernel or domain schema registered as a
module-body side effect — changes behavior when its module loads lazily: it would run only once its handler is
invoked. The build step registers schemas explicitly today, but enumerate import-time side effects across the
handler set before converting, and keep any module that has one in the eager set.

### D5 — Tier placement, worker sizing, and CI leg structure

Three small, independent items.

**Unit outliers move tiers rather than getting tuned.** Two files hold 55% of the unit tier and floor its wall
clock: `classify-change.test.ts` (23.2 s, 122 cases) drives a shell script through `bash`, and `codex-cli.test.ts`
(18.0 s, 37 cases) spawns `git` 18 times. Both spawn subprocesses, so by tier definition they are integration
tests. Moving them costs nothing there — integration's floor is already ~44 s and they run in parallel under it —
and it drops the unit tier from ~24 s to a few seconds, which is what makes per-task `vitest --changed` runs feel
instant. Tune them only if they later become the integration floor. Both use `it.each`, so take case counts from
D2 rather than a grep.

**Local worker sizing.** The vitest config caps local runs at 50% of cores to leave headroom for sibling agent
sessions on one machine. The heavy-test admission lock now guarantees that only one admitted run executes at a
time machine-wide, so an admitted run can safely use more of the machine — but unit-only runs stay outside the
lock by design, and D1 makes them the per-task gate, so the config default must not move. Raise workers only
inside the tier runner for the tiers it admits (it already passes the environment through, so it can set
`VITEST_MAX_WORKERS` for the lane), and gate that raise on `CI` rather than on whether the variable is already
set — CI runs the heavy tiers through this same runner, and the workflow's variable resolves to an empty string on
a hosted runner, which the resolver treats as unset. Measure the lane at 50%, 75%, and native sizing through D2,
and adopt a raise only if it clears the noise band with no sibling-session degradation in a paired run. The CI cap
is untouched (Non-Goals).

**CI leg structure.** Re-select the four pinned anchor files from D2's tier-isolated ranking. Measured, the
largest four are `candidate-lineage`, `delivery-position`, `command-input-no-input`, and `errand`, while the
pinned set carries `lifecycle-exit` (5th) instead of `delivery-position` (2nd). Value it on the runner in use: on
the mini's two slots an anchor swap moves no job-seconds and can only trim the makespan's tail, and the four legs
already sit within a 16 s spread there — so this is a cheap correctness fix (the pinned set should match the
measured ranking), not a wall-clock lever. The ~25 s of per-leg critical path it would recover applies only under
hosted fallback, where legs run on separate machines. **Folding each leg's anchor and remainder into one
invocation is not available**: Vitest applies file filters before sharding, so `vitest list --project unit
classify-change --shard=1/4` fails with `--shard <count> must be a smaller than count of test files`. The eight
Vitest boots per E2E run stay, recorded as accepted.

### D6 — Per-tier budgets

Record a budget per tier, per measurement mode, from the post-work baseline — taken after the last change to that
tier's cost, which for integration is D7's conversion rather than D6's own phase. The instrument reports each tier's
standing locally; on CI each job compares its **own** elapsed duration against a per-job CI-mode budget and
surfaces a step-summary warning. **Advisory only — never a red gate**, so budget noise cannot block a merge.

Budgets are per-mode because a local budget is meaningless against a CI runner, and the CI unit is the job because
CI runs E2E as eight invocations across four sharded jobs, so no single job observes a per-tier total. The
cross-job heavy-lane total that Goal 2 is scored against is read from workflow-run data at verification, not from
this mechanism — a job cannot observe what its siblings cost.

### D7 — Cost-ranked audit

**Bounded by a stop rule, not by a gate.** After D3 and D4 land, re-baseline through D2, then work files in
descending cost order, top decile first, over the **integration and E2E rankings** — the two tiers whose cost the
mechanical levers leave standing. The unit tier is out of reach of this by then: D5's moves drop it to a few
seconds, which no per-test judgment improves on.

**Stop rule:** stop when three consecutive ranked files each yield under 2% of their tier's summed time. That rule
is the whole bound. An opening condition on top-file share would be dead text — cost concentrates hard enough that
nothing clears it in either tier, before or after the mechanical work, because the levers scale file costs roughly
together rather than flattening the distribution.

**Per-test decision rubric** — applied only to cost-ranked candidates, never as a sweep:

1. **What behavior does this test protect?** If no one can say, its coverage was already fictional — delete.
2. **Is it already proven at a cheaper tier through the sanctioned seam?** Keep the E2E case when the behavior is
   only observable through the real CLI; destructive verbs stay E2E · `[invariant]`.
3. **Can the scenario be driven through the handler seam instead of the real CLI?** Where a case needs only
   handler-seam outcomes, convert it to integration driving the verb core through CLI-generated inputs — the seam
   `testing-standards` sanctions — at a fraction of a spawn's cost. Keep one real-spawn smoke per verb, and leave
   at E2E anything whose subject is the entry's own behavior: argument parsing, command dispatch, output
   formatting. **Conversion preserves the assertion set**; a converted case that sheds assertions is a deletion
   and takes the deletion rules below. This is the lifecycle spines' lever, and it is why they are in scope here
   while the general in-process harness is not. Conversion moves cost into the integration tier, so converted
   cases land under that tier's floor and the lane's bar still holds afterwards — the bar constrains the
   conversion, never the reverse — and the tier's budget is taken after this work rather than before it.
4. **Can several cases share one expensive setup or spawn?** Prefer this over deletion. **Headroom constraint:** a
   consolidated test keeps at least 3× headroom against its timeout ceiling or carries an explicit per-test
   timeout, and every stderr and exit-code assertion it replaces survives.
5. **Does it still fail when the logic breaks?** For a deletion resting on "another test covers it", confirm the
   retained test kills the same faults, by inspection or by mutation testing where inspection cannot settle it.
6. **Record the retained protector.** Every deletion names the test that now carries the behavior, and every
   conversion names the tier it moved to and the smoke that still exercises the real spawn.

Coverage overlap alone never justifies deletion: coverage-minimized suites lose roughly half their fault detection
for an ~80% size reduction. Deletion needs behavioral intent plus a named protector.

**Mutation-testing trigger.** The first step-4 decision inspection cannot settle authorizes installing
`@stryker-mutator/core` and `@stryker-mutator/vitest-runner` as devDependencies, used on the affected pair only —
never across the corpus, never in CI. **Uninstall at verification**, retaining any config file written.

### D8 — Incidental hygiene capture

While working any file for cost, note standards-noncompliance patterns seen in passing; do not go looking. The
deliverable is `analysis-test-hygiene-observations.md`, holding whatever was observed, plus a `USER-INBOX` capture
naming it as input to the hygiene work unit. If nothing was observed, neither is created — an empty observations
file is worse than none.

### Delivery structure

`assess-boundary-fit`: **stays one WU + delivery-plan candidate.** One concern — the cost of routine verification
— designed as a whole. The in-process harness was assessed and routed out as an orthogonal successor rather than
kept as an internal escalation. The sizing read finds distinct deliverables with a real dependency order, so
authoring is slice-aware; this binds no delivery state and publishes nothing.

| Surface                 | Contents | Depends on         |
| ----------------------- | -------- | ------------------ |
| S1 Lane and policy      | D1       | —                  |
| S2 Instrument           | D2       | S1                 |
| S3 Integration fixtures | D3       | S2                 |
| S4 CLI startup          | D4       | S2                 |
| S5 Tiers, workers, legs | D5       | S2                 |
| S6 Budgets              | D6       | S2, S3, S4, S5     |
| S7 Cost-ranked audit    | D7, D8   | S2, S3, S4, S5     |

S1 delivers Goal 1 and depends on nothing — it can land first and alone. S2 follows it so the lane baseline is taken
against the lane's admitted runnable form, whose slot wait the instrument records separately from run time; a bare
multi-project invocation measures a different path. S4 is product code benefiting every `arc` invocation. S7 runs
last and longest: it is the only judgment-per-test surface here, and its stop rule is what bounds it.

## Alternatives & Rationale

- **Rubric sweep across all tests** — impractical at eleven thousand cases and aimed at the wrong population.
  Measured, the cost is fixed overhead, not assertions.
- **Coverage-subsumption minimization** — rejected as a deletion criterion on the fault-detection evidence.
- **Selection instead of reduction** — static import graphs miss runtime wiring and CI still runs everything.
  Adopted as a complement in D1, not as the plan.
- **Infrastructure only** — more shards, a local runner. Owned elsewhere, and masks per-test cost.
- **Node startup snapshots and Single Executable Applications** — **not viable for this CLI's shape.** An ESM
  entry throws `SyntaxError`; the builder loads built-ins "but not additional user-land modules", excluding
  externalized dependencies; `node:child_process` is unsupported and `execa` depends on it; the blob is locked to
  an exact Node version, arch, and platform; SEA cannot back an npm `bin` that must stay a `.js` file. Tracking
  issues `nodejs/node#44277` and `nodejs/help#3981` are both closed "not planned".
- **`NODE_COMPILE_CACHE`** — caches compilation, not module evaluation, so it cannot reach the evaluation half of
  the dependency floor. Measured 0.38 s → 0.29 s; published comparators sit at 6–20%; and D4 removes the modules
  it would cache.
- **esbuild code splitting** — measured ~0.02 s per real-verb spawn. Its apparent 6× advantage is a
  `--version`-path artifact, and the suite never spawns `--version`. Not worth a dist-layout change.
- **Duration-aware CI shard membership** — needs a custom `sequence.sequencer`; net-new test infrastructure whose
  payoff shrinks once D4 lands. Recorded so a future imbalance has a known remedy.
- **Bare repository plus `git worktree add` per fixture** — **rejected on correctness.** `refs/` is shared across
  all worktrees of a repository except `refs/bisect`, `refs/worktree`, and `refs/rewritten` — which includes
  `refs/notes/*`. A tool whose subject matter is notes, refs, and worktrees would have its "independent" parallel
  tests silently sharing one namespace. `git clone --shared` / `--reference` carry the analogous alternates-plus-
  prune corruption hazard.
- **`init.templateDir`, `core.fsmonitor`, `untrackedCache`, `preloadIndex`** — not levers at fixture scale; they
  address monorepo-sized working trees.
- **Batching git spawns in fixture construction** — a spawn costs ~2.4 ms and nine of them are ~24 ms of a
  ~106 ms build; the cost is the init command's file writes, which a template copy removes and batching cannot.
- **Skipping `build:fast` in the integration global setup when `dist/` is fresh** — measured at 1.2 s warm; not a
  lever, and bundle freshness belongs to `e2e-build-coordination`.
- **Isolating git configuration per fixture** — already done: the vitest config sets `GIT_CONFIG_NOSYSTEM` and
  points the global config at `/dev/null` for every project, so nothing from a developer's `~/.gitconfig` reaches
  a fixture today.
- **An in-process CLI harness** — the largest available CI lever, routed to a successor work unit rather than
  taken here. See Coordination.

## Cross-cutting Considerations

**Testing.** D4 changes when handler modules load, not what they do; the suite is its own regression test. D3's
fixture sharing carries the real risk — a shared fixture leaking state between parallel tests — which the
absolute-path audit and copy-per-test discipline exist to prevent.

**Measurement validity.** D2's mode discipline and multi-run normalization are the correctness mechanism for every
number this spec commits to. Three conclusions were drawn and retracted during authoring for want of them, and
three adversarial passes found the same defect class each time — a proxy path standing in for the workload.

**Substrate-bound cost.** The user-notes and sync substrate is interim, composing toward `arc-backend`. Its tests
are real proofs of a concurrency-sensitive surface: prefer cheap fixture sharing over restructuring, and **never
thin coverage of the notes mutators to save time**. D2 reports what share of cost is substrate-bound.

**Parallelism shape.** Files run in parallel and tests within a file sequentially, so a large file is a shard's
critical path however many workers exist. Splitting the largest files is a wall-clock win that adds a little CPU,
since each new file re-pays its own transform and import; D3 owns the integration splits, and the same reading
selects the E2E anchors in D5.

**User-facing impact.** D4 benefits every real `arc` invocation, not only tests — 0.36 s → 0.21 s of startup and
205 MB → ~100 MB of RSS on the paths measured. Session-init and interactive commands inherit it.

**Coordination.**

- `in-process-cli-harness` — the successor this work unit enables, now scoped to the general harness alone: the
  isolation model that lets the entry run in process. Its population is the cases whose subject is the entry's own
  behavior, which D7's seam conversion deliberately leaves at E2E. It `Depends On` this work unit, and inherits a
  measured remainder rather than a guess — D4 removes ~42% of per-spawn cost and D7's conversion removes the cases
  that never needed a spawn, so what is left is the smallest and best-evidenced version of its problem.
- `local-ci-capacity-qualification` — complete, awaiting integration; owns the mini runner's slot count and the
  CI worker cap. This work unit inherits its two-slot, one-worker decision and measures nothing against it; that
  throughput model is why summed-time savings score as CI wall clock here.
- `quality-gate-hooks` — consumes D2's instrument and later lifts D1's rows to the framework layer; owns gate
  policy beyond D1.
- `evidence-applicability` — its path-treatment registry is the natural home for the path classes D1's rows key
  on; when it lands, the rows consume that registry rather than carrying a second taxonomy.
- `test-suite-contention-hardening` — owns the admission lock and load-relative timeouts. D2's headroom and
  slot-wait data are input, and D2's mode discipline depends on the lock's behavior.
- `e2e-build-coordination` — owns bundle freshness. D4 keeps `dist/` a single file and `dev-check` eager, so the
  contract is preserved; D3's move of `config-validate` into E2E puts it under that tier's `globalSetup` build,
  which is worth confirming with that work unit. The integration tier's own build step is unaffected either way —
  a file that stays in that tier still spawns the bundle, so its `globalSetup` remains required.
- `test-di-migration` — owns the quarantined `unit-mocks` files D3 leaves alone.
- `arc-backend` / `strategy-storage-evolution` — the substrate-bound cost share is input to that transition.

## Success Criteria

Numeric targets are **derived, not guessed**, and the derivation must not close a loop. D2's first baseline
records current per-tier cost, per-file ranking, and spawn counts in its stamped mode — it cannot observe a saving
that has not happened. Targets are computed once from that baseline plus rates measured directly on the changed
artifact, **written down before the run that scores them**, and landed by forward amendment to this section as
`Amended YYYY-MM-DD — <numbers> — target derivation`. A criterion whose bar is set by the same run that scores it
is not satisfied.

1. **Measurement validity.** Every before/after pair in the completion record names its mode and compares like
   with like, and no lever below ~10% is claimed from a single run. The instrument refuses cross-mode comparison.
2. **Routine local run (wall clock).** The routine lane exists as one command, and its wall clock falls to a bar
   derived under the preamble's rule from D2's first lane baseline (condition tier-isolated, project set lane;
   56–58 s today across two quiet runs) plus rates measured on the changed artifact, landed by forward amendment
   before the run that scores it. The derivation is fixed here so the amendment cannot pick a number: the lane's
   wall clock is bounded below by its longest file and by its summed time over the workers in force, so the bar
   is the larger of those two floors after the work, plus the noise band. Today's arithmetic, as a provisional
   expectation rather than the bar: summed time ~410–430 s over 12 workers is a ~34 s floor; D3's re-tiering
   removes ~52 s and its probed fixture savings ~15 s, taking that floor near 30 s; splitting brings every file
   under it; D5's worker sizing, if it clears the band, lowers the summed floor further. D5's tier moves do not
   move the lane — they move unit-only runs.

   _Amended 2026-09-11 — **Bar: ≤42 s at 12 workers.** Target derivation: the instrument's 520.80 s lane baseline
   minus 35.33 s (`config-validate` re-tiering), 15.89 s (`review-cli-surfaces` re-tiering), and the 15.19 s
   fixture-probe saving leaves 454.39 s; divided by 12, the inclusive summed-time floor is 37.87 s. File splitting
   puts the longest-file floor below it; adding the full 10% noise allowance gives 41.65 s, rounded upward._

   _Amended 2026-09-11 — **Review-corrected bar: ≤46 s at 12 workers.** The complete-cost baseline is 566.65 s;
   subtracting 40.26 s and 17.63 s for the two re-tiered files plus 15.19 s of fixture savings leaves 493.57 s.
   Dividing by 12 gives a 41.13 s inclusive floor; the 10% noise allowance gives 45.24 s, rounded upward. This
   supersedes the 42 s bar, whose baseline omitted suite-hook execution time._

   _Amended 2026-09-11 — **Schema-v2 bar: ≤41 s at 12 workers.** The eligible 513.54 s baseline minus 36.08 s and
   15.16 s for the re-tiered files plus 15.19 s of fixture savings leaves 447.11 s. Dividing by 12 gives a 37.26 s
   inclusive floor; the 10% noise allowance gives 40.99 s, rounded upward. This supersedes the prior baseline-bound
   bar; the measurement mode and directly probed saving are unchanged._

   _Amended 2026-09-11 — **Schema-v3 bar: ≤44 s at 12 workers.** The eligible 548.18 s baseline minus 37.80 s and
   15.70 s for the re-tiered files plus 15.19 s of fixture savings leaves 479.49 s. Dividing by 12 gives a 39.96 s
   inclusive floor; the 10% noise allowance gives 43.96 s, rounded upward. This supersedes the prior baseline-bound
   bar; the measurement mode and directly probed saving are unchanged._
3. **Selection rule is live.** `DEV-RULES.PROJECT` § Selecting what to run carries the lane rows and no longer
   closes by forbidding a partial Tier 3; `QUICK-REFERENCE` § Quality Gate Commands no longer instructs a whole
   run, and its per-task entry names the changed-file invocation the rule specifies rather than the
   filename-fragment filter it replaces; and the two shipped framework files no longer assert a whole-suite local
   attestation.
4. **Integration tier, two metrics.** Summed file time falls by at least the target derived from D2's baseline
   (fixture sharing), and no single file exceeds the tier's post-work summed-time floor (splitting) — both
   measured tier-isolated across several runs. Wall clock follows from the second and is scored under SC2, not
   here.

   _Amended 2026-09-11 — **Bar: reduce summed file time by ≥15.0 s from the 376.47 s baseline (to ≤361.47 s).**
   Target derivation: the prepared-fixture probe saved 40.3 s × 28.6% in `user` plus 11.6 s × 31.6% in `init`,
   or 15.19 s, conservatively rounded down. Against the instrument baseline those fixed savings are 26.7% and
   29.5% of the two files._

   _Amended 2026-09-11 — **Review-corrected baseline: 379.26 s; bar: reduce by ≥15.0 s to ≤364.26 s.** The absolute
   15.19 s probe saving is unchanged; it is 26.3% of the corrected 43.78 s `user` file and 29.6% of the corrected
   12.37 s `init` file. This supersedes only the baseline-dependent numbers above._

   _Amended 2026-09-11 — **Schema-v2 baseline: 361.33 s; bar: reduce by ≥15.0 s to ≤346.33 s.** The absolute
   15.19 s saving remains unchanged; it is 28.2% of the eligible 40.82 s `user` file and 30.8% of the 11.91 s
   `init` file. This supersedes the prior baseline-dependent numbers._

   _Amended 2026-09-11 — **Schema-v3 baseline: 361.01 s; bar: reduce by ≥15.0 s to ≤346.01 s.** The absolute
   15.19 s saving remains unchanged; it is 28.1% of the eligible 41.10 s `user` file and 30.7% of the 11.95 s
   `init` file. This supersedes the prior baseline-dependent numbers._
5. **Per-spawn fixed cost.** Built-artifact CLI startup on a named representative verb falls to **≤0.25 s** warm
   as a standalone probe — the same condition as the recorded 0.36 s baseline — above the 0.21 s probe and below
   the baseline, so it discriminates rather than restating either.
6. **The loader penalty is gone and the tiers are honest.** No test at any tier spawns the CLI through `tsx`;
   every integration file whose cases all spawn the CLI now lives in E2E, with the rule's per-file verdict
   recorded; and `config-validate`'s clean-stderr assertions and launcher-shim comparison all still run there.
7. **`dist/` is still one file.** `tsup.config.ts` sets `splitting: false` explicitly and the build emits a single
   `dist/cli.js`.
8. **CI heavy lane.** Summed heavy-lane job-seconds on the mini fall by at least the derived target — the metric
   the two-slot runner turns into wall time — and the pinned anchor set matches D2's tier-isolated ranking. The
   per-leg critical-path shard is scored only under hosted fallback, where legs run on separate machines.

   _Amended 2026-09-11 — **Bar: reduce summed heavy-lane duration by ≥300 job-seconds from the six-run CI-job
   median of 1,377 s (to ≤1,077 s).** Target derivation: 1,815 E2E and 29 integration built-CLI invocations at a
   0.15 s measured saving contribute 276.60 s; about 21 `config-validate` invocations moving from 1.23 s `tsx` to
   0.21 s built/lazy startup contribute 21.42 s; fixture sharing contributes 15.19 s. The 313.21 s projection is
   rounded down and excludes tier movement, anchor balance, and later deletion/consolidation savings._
9. **Budgets exist and are reported.** A budget is recorded per tier per mode — wall clock locally, summed job
   duration on CI — the instrument reports local standing, and CI warns on exceedance without failing.
10. **No behavior loses its only proof.** Every deletion or case consolidation names the retained test covering
    the behavior, and every consolidation keeps the rubric's timeout headroom and its replaced assertions. Every
    seam conversion carries its assertion set to the cheaper tier and names the real-spawn smoke that still covers
    its verb. D3's fixture sharing preserves assertions by construction. Vacuously satisfied if none occur.
11. **Fixture independence.** No fixture shares an object store, ref namespace, or remote with another: the
    prepared-template copy carries no absolute reference back to the template or to a shared remote, and no
    fixture's bare remote outlives its test.
12. **Dependency tree.** `package.json` devDependencies at completion match the pre-work baseline, or each
    addition is justified in the completion record.
13. **Evidence outlives the WU.** `analysis-test-suite-cost-baseline.md` carries the instrument's baseline with
    its mode stamps. Where incidental hygiene observations were made they are in
    `analysis-test-hygiene-observations.md` with its capture; where none were, neither exists and the completion
    record says so.

## Open Questions

Implementation detail, resolved during the work — none blocks starting.

- Per-file handling of the eight unit outliers beyond the two profiled.
- Whether a tmpfs fixture root and `isolate: false` clear the ~10% noise band once measured across several runs,
  and which files if any need quarantining under the latter.
- The prepared-template shape for integration fixtures — one template for all, or a few by fixture class — and
  which absolute references each must rewrite.
- Which `describe` seams the integration files still above the tier floor split along, and whether the local
  worker cap clears the noise band at 75% or native sizing.
- Whether `e2e-build-coordination` has in-flight changes to the E2E `globalSetup` build that `config-validate`'s
  arrival would meet. The integration side is settled: a file that stays in that tier still spawns the bundle, so
  its `globalSetup` build remains required regardless of what moves.
- What `review-fan-out-lifecycle`'s 2.5 s per case actually is, before any lever is chosen for it.
- Which spine scenarios need only handler-seam outcomes and so convert, which files the converted cases land in
  to stay under the integration floor, and whether one shared handler-stdio capture helper serves them all.

---
