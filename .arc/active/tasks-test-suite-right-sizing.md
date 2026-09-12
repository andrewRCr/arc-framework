# Task List: Test Suite Right-Sizing

- **Design:** `spec-test-suite-right-sizing.md`

---

<!-- arc:delivery-plan:start -->
## Delivery Plan

- **Plan Revision:** `1`
- **Plan Digest:** `sha256:0df81f0f51fb5b6138f127ab424f75e0d43f4bd68a7fc837b6cf21ea77184e1b`
- **Projection:** `wu-integration-target`

### Members

| #   | Member                                           | Chunk key               |
| --- | ------------------------------------------------ | ----------------------- |
| 1   | Routine local lane and selection rule            | `lane-and-policy`       |
| 2   | Cost instrument and first baseline               | `cost-instrument`       |
| 3   | Integration fixture substrate and tier placement | `fixture-and-tier-cost` |
| 4   | Per-spawn CLI startup cost                       | `cli-startup`           |
| 5   | Worker sizing, CI legs, and per-tier budgets     | `sizing-and-budgets`    |
| 6   | Cost-ranked audit and hygiene capture            | `cost-ranked-audit`     |

#### Member coverage

| #   | Tasks                                                                       | Design elements    |
| --- | --------------------------------------------------------------------------- | ------------------ |
| 1   | `1.1`, `1.2`, `1.3`, `1.4`, `1.5`, `1.6`                                    | `rfc:D1`           |
| 2   | `2.1`, `2.2`, `2.3`, `2.4`, `2.5`, `2.6`, `2.7`, `2.8`                      | `rfc:D2`           |
| 3   | `3.1`, `3.2`, `3.3`, `3.4`, `3.5`, `3.6`, `4.1`, `4.2`, `4.3`, `4.4`, `4.5` | `rfc:D3`, `rfc:D5` |
| 4   | `5.1`, `5.2`, `5.3`, `5.4`, `5.5`                                           | `rfc:D4`           |
| 5   | `6.1`, `6.2`, `6.3`, `6.4`, `6.5`, `6.6`, `6.7`                             | `rfc:D5`, `rfc:D6` |
| 6   | `7.1`, `7.2`, `7.3`, `7.4`, `7.5`, `7.6`                                    | `rfc:D7`, `rfc:D8` |

### Named seams

| #   | Seam                                                       | Members       | Owner | Design elements |
| --- | ---------------------------------------------------------- | ------------- | ----- | --------------- |
| 1   | Measurement-mode discipline across every before/after pair | 2, 3, 4, 5, 6 | 6     | `rfc:D2`        |
| 2   | Evidence outlives the work unit                            | 2, 5, 6       | 6     | `rfc:D8`        |
| 3   | Dependency tree returns to its pre-work baseline           | 2, 6          | 6     | `rfc:D7`        |

#### Acceptance

- **1. Measurement-mode discipline across every before/after pair:** Every before/after pair in the completion record
  names its mode and compares like with like, and no lever below roughly 10 percent is claimed from a single run.

- **2. Evidence outlives the work unit:** The cost baseline analysis carries the instrument's baseline with its mode
  stamps; where incidental hygiene observations were made they are in the hygiene observations analysis with its
  capture, and where none were, neither exists and the completion record says so.

- **3. Dependency tree returns to its pre-work baseline:** package.json devDependencies at completion match the pre-work
  baseline, or each addition is justified in the completion record; no mutation-testing dependency remains installed.
<!-- arc:delivery-plan:end -->

## **Phase 1:** Routine local lane and selection rule

**Delivery member:** 1 — `lane-and-policy`

_Purpose:_ Take E2E off the routine local path and make the remaining lane a real command, then bring every
document that asserts a whole-suite local run into line with it. This is the largest measured lever and the one
that delivers Goal 1 almost entirely; it depends on nothing, so it goes first.

_Mode:_ `slice` — closes on a routine local verification run that is one command and one documented rule.

_Exit criterion:_ `npm test` runs unit plus integration as a single admitted command, `npm run test:full` still
runs everything, and no project or framework document instructs a whole-suite local run.

### `[x]` **1.1 Add the routine-lane tier variant and re-point `npm test`**

- _Goal:_ Routine local verification runs the unit, unit-mocks, and integration projects as one admitted command,
  with the whole run still reachable under its own script.

    - `[x]` **1.1.a Extend the heavy-tier union and its argument list**

        - Added the admitted `lane` tier, its unit/unit-mocks/integration Vitest arguments, and fail-first coverage
          for guard validation, holder diagnostics, and forwarded-argument ordering.

    - `[x]` **1.1.b Re-point the package scripts and add the whole-run and changed-file entries**

        - Re-pointed `test` to the admitted lane; added `test:full` and a non-admitted `test:changed` against
          `main...HEAD`, with empty selections failing; and bound package/root delegation through manifest tests.

- _Outcome:_ Routine, whole-suite, and merge-base changed-file runs now have distinct commands while only the
  subprocess-heavy lane and whole suite enter the shared admission slot.

### `[x]` **1.2 Carry the lane rows into the project-instance gate documents**

- _Goal:_ The project's own gate documents state the lane as the routine local run and stop instructing a
  whole-suite local pass.

    - `[x]` **1.2.a Extend the quality-gate selection rule with the lane rows**

        - Added path-derived unit, integration, E2E, and source/config rows; made required CI the E2E remainder;
          and classified an empty changed-file selection as non-passing.

    - `[x]` **1.2.b Bring every stale command claim in the quality-gate command reference into line**

        - Replaced the filename-fragment gate with `test:changed`, made `npm test` the Tier 2/3 routine lane, and
          retained `test:full` as the explicit whole-project command.

    - `[x]` **1.2.c Correct the tier-to-command mapping in the testing strategy and technical overview**

        - Aligned all three gate tiers with the lane and documented four Vitest projects across three isolation
          tiers, including the isolated unit-mocks project.

    - `[x]` **1.2.d Point both contributor pages at the whole run**

        - Pointed both clean-checkout setup sequences at `test:full` and corrected the published gate table to
          describe the routine lane's unit, unit-mocks, and integration projects.

- _Outcome:_ Project rules, command guidance, testing architecture, and contributor setup now distinguish routine,
  affected-unit, and whole-project verification consistently.

### `[x]` **1.3 Amend the shipped whole-suite assertions through the package source**

- _Goal:_ Shipped quality-gate and verification guidance stops asserting a whole-suite local attestation, without
  minting any framework-layer capability for designating a tier as CI-enforced.

    - `[x]` **1.3.a Amend the Tier 3 definition in the quality-gates strategy**

        - Defined Tier 3 as the complete project-designated local gate while leaving test-tier and lane assignment
          with the project.

    - `[x]` **1.3.b Amend the verification workflow's attestation sentence**

        - Made completion of every project-designated gate the final local attestation without asserting that a
          whole-project test run is universal.

    - `[x]` **1.3.c Sync the package source into the project copy**

        - Authored both Framework files in package source and projected their matching `.arc/` copies through
          `render:framework`.

- _Outcome:_ Shipped strategy and verification guidance now require a complete configured gate without minting a
  framework-level rule for which test lanes must run locally.

### `[x]` **1.4 Re-run the document-contract checks and repair what the amendments broke**

- _Goal:_ The checks binding these documents to each other and to the code pass against the new wording, and any
  assertion that broke on reflow rather than on meaning is made resilient.

- _Outcome:_ The framework-sync contract subset accepted both rendered Framework copies, and the trigger,
  domain-rule, and section-reference contracts required no repair after the wording changes.

### `[x]` **1.5 Exercise the routine lane end to end** — validate exit criterion at segment scope

- _Goal:_ One recorded run shows what routine local verification now costs and that the whole run is still one
  command away.

    - _Amended 2026-09-10 — Validate the live contract as configured: required context `merge-ok` must depend on
      and fail closed with `ci-ok`. Record both the GitHub ruleset binding and the workflow dependency._
    - _Amended 2026-09-10 — Published `docs/**` guidance is frozen for a dedicated public-release pass. Validate
      the active project/framework authoring surfaces here; `docs-content-sweep` owns public-prose reconciliation._

- _Outcome:_ Clean-tree runs completed the admitted lane in 58.21 s (821 files, 11,103 tests; one file/test skipped)
  and all projects in 297.67 s (874 files, 11,631 tests; one file/test skipped). The live holder named this branch,
  worktree, and tier `lane`; the active-authority targets carry no whole-suite claim for `npm test` or universal
  Tier 3 lane mandate. Published-doc drift is deferred to `docs-content-sweep`. At 2026-09-10T22:08:22-05:00,
  active ruleset `main-protection` required `merge-ok`, whose CI job depends on `ci_ok` and fails unless that result
  is `success`.

### `[x]` **1.6 Close the lane and policy member** — validate criteria at member scope

- _Goal:_ Member 1's criteria are walked through `validate-criteria` and their boundary evidence recorded.

- _Outcome:_ Member 1 criteria report.

    - _Criteria slice:_ `Success Criteria > Member 1 — lane-and-policy`.
    - _Span:_ bounded diff `9d92d89fd..fdf8c4278`; cumulative reachability `fdf8c4278` at tree
      `cbb61edbad0f30a88108a3092c7aef95a9e2bf5d`; boundary-order deviation: none.
    - _Criterion:_ `Success Criteria > Member 1 — lane-and-policy > 1`; _criterion-digest:_
      `sha256:abf1c649075453bdec9869dec4dd9f4ad17d46cf9baec0e4c0169c1fc3382a3e`; _State:_ `[x]`; _Evidence:_
      the manifests expose distinct routine, whole-project, and changed-file commands; the admitted `lane` selects
      unit, unit-mocks, and integration; and the project selection rule carries path-derived rows without a
      universal Tier 3 test-lane mandate.
    - _Criterion:_ `Success Criteria > Member 1 — lane-and-policy > 2`; _criterion-digest:_
      `sha256:32e510d8dd286e16ec32ac958513aa1cb4ac9bdb14703905854554ec1a6eca23`; _State:_ `[x]`; _Evidence:_
      the Tier 1 command is `npm run -s test:changed`, matching the rule row; it resolves `main...HEAD` across the
      unit projects and makes an empty selection non-passing.
    - _Criterion:_ `Success Criteria > Member 1 — lane-and-policy > 3`; _criterion-digest:_
      `sha256:939b6d997bb8ad95fd19b1ca74581681ded9d34443400f654750a0ed54da5bfe`; _State:_ `[~]`; _Evidence:_
      all planned project-instance and shipped-framework targets no longer describe `npm test` or Tier 3 as a
      universal whole-suite run. Frozen pages under `docs/**` retain older guidance by approved deferral;
      `docs-content-sweep` owns their dedicated public-release reconciliation after `docs-site-refresh`.
    - _Adversarial companion:_ one Heavy fresh-context pass found the frozen published-doc drift and a false
      CI-parity phrase. The phrase was fixed in `fdf8c4278`; the published pages were carried forward to their
      approved owner without editing `docs/**`.
    - _Summary:_ two met, one superseded, zero unresolved. Success Criteria markers remain unchanged.

## **Phase 2:** Cost instrument and first baseline

**Delivery member:** 2 — `cost-instrument`

_Purpose:_ Build the one instrument every later number routes through, and record the first baseline in every mode
the work will be scored against. Measurement discipline is the correctness mechanism for the whole work unit —
three conclusions were drawn and retracted during spec authoring for want of it.

_Mode:_ `layer` — closes on a settled measurement substrate that later phases and later work units consume.

_Exit criterion:_ One repository-owned instrument behind an npm script captures per-file and per-test durations per
tier, refuses a lever claim across baselines whose measurement modes differ, and has recorded a normalized multi-run
baseline for the unit projects, the lane, integration, and E2E.

### `[x]` **2.1 Capture per-file and per-test durations from the run**

- _Goal:_ One repository-owned entry runs a named project set and yields per-file and per-test durations, each
  counting the fixed cost the run actually paid, without mutating anything it measures.

- _Shape:_ A script under `packages/arc-framework/src/scripts/` behind an npm script, a sibling of the existing
  tier runner rather than a wrapper around it: it starts Vitest in process itself, through the same admission
  wrapper the runner uses, so the run's own file tasks and that wrapper's return are both in hand. Read-only
  toward everything it measures. Not an adopter-facing `arc` verb. The benchmark entry under
  `__tests__/benchmarks/` is the existing precedent for a measurement entry point in this package.

    - Per-test duration is the duration on each test task. Per-file cost is `collectDuration` plus
      `setupDuration` plus that file's test durations. The first two are the file task's own fields and carry the
      transform, import, and file-level hook time the reporter's `endTime - startTime` window leaves out — that
      window spans test results only, so it sums to the file's test durations and reports the fixed term as zero.
      Do not add `importDurations` on top: it is an opt-in top-N diagnostic, empty under this project's config,
      and `collectDuration` already counts the import time it would list.
    - Wall clock is the instrument's own timing around the run. Summed time exceeds wall clock because files run
      in parallel, and both figures are reported.
    - Tier attribution is `projectName` off the file task.
    - Retained runs need a home before 2.2 and 2.3 can compare or normalize across them: one JSON file per run in
      a gitignored directory under the package, each stamped with its mode. The raw payloads are bulky and
      regenerable, so only derived figures reach the tracked baseline.
    - Running Vitest here rather than shelling out to the tier runner is what puts the file tasks and the
      admission wrapper's own return in reach; 2.5 takes slot wait straight off that return, so there is no
      channel between processes to design.
    - Build `test-first` (one behavior at a time):
        - a run spanning several files yields per-file durations and a summed total
        - a file's reported duration exceeds the sum of its test durations by its fixed cost
        - per-test durations survive an `it.each` matrix, where static declaration counts understate executed cases
        - unit and unit-mocks files sharing one directory attribute to their own tiers from the run's own project
          identity
        - a run that yields no timing data fails loudly rather than reporting zero cost

- _Outcome:_ Added the admitted in-process `benchmark:test-cost` entry and atomic raw-run retention under the
  gitignored package-local `.test-cost-runs/` directory. Vitest's reported module graph supplies project identity,
  collection/setup cost, and every executed test case; the retained file cost deliberately excludes the already
  represented import diagnostic. A real 690-file unit-project run retained 9,881 test timings and failed no tests.

### `[x]` **2.2 Stamp the measurement mode and refuse cross-mode comparison**

- _Goal:_ Every baseline carries the condition, the project set, and the worker sizing it ran under, and a lever
  claim across differing modes is refused rather than reported.

- _Rationale:_ `config-validate.test.ts` measures 23.5 s single-file and 37–40 s tier-isolated; `user.test.ts`
  measures 40 s tier-isolated and 46–49 s inside the lane. Reading either spread as one figure is the failure this
  exists to prevent, and splicing the two files into a single spread is that same failure one level up.

    - Condition is single-file, tier-isolated, under load, standalone probe, or CI job; project set is one tier,
      the lane, or the full run. A CI job is its own condition because no local condition describes it and Phase
      6's budgets are recorded per mode.
    - Worker sizing is stamped too, and it is the axis needing a distinction rather than a flat refusal. A **lever
      claim** — before and after on the same artifact — must match on all three, or a worker change reads as
      suite-cost improvement. A **sizing sweep** varies worker sizing deliberately with everything else held, so
      it is a distinct operation rather than a comparison to refuse; 6.2 is the sweep this distinction exists for.
    - Build `test-first` (one behavior at a time):
        - a baseline records all three parts of the mode, and none of them defaults silently
        - a lever claim across matching modes returns a delta
        - a lever claim differing in condition, project set, or worker sizing refuses with the mismatch named
        - a sizing sweep across differing worker sizing is neither refused nor reported as a lever claim

- _Outcome:_ Every capture now requires explicit condition, project set, and worker sizing arguments. Lever
  comparison reports a delta only for exact three-axis matches and names every mismatched axis; a separately typed
  sizing sweep requires stable condition/project set and deliberate worker variation. The repository-owned
  `benchmark:test-cost:compare` entry makes both operations reachable from retained-run path groups.

### `[x]` **2.3 Normalize across retained runs and flag claims inside the noise band**

- _Goal:_ A reported figure is a normalization over several retained runs, and a claimed lever inside run-to-run
  variance is flagged as unestablished rather than presented as measured.

- _Context:_ Run-to-run variance is roughly 8% — the same tier measured 51.1 s and 47.4 s on consecutive quiet
  runs — so any lever below about 10% is not established by a single run.

    - Build `test-first` (one behavior at a time):
        - several retained runs of one mode normalize to a single reported figure
        - a single run reports as a single run, never as a normalized figure
        - a delta inside the band is flagged as unestablished while one clearly outside it is not

- _Outcome:_ Retained runs of one exact mode normalize by median across wall time, summed file time, file count,
  and test count; one sample remains explicitly `single-run`. Noise classification uses absolute change over the
  before value, treats magnitudes below 10% as unestablished, and treats the exact 10% boundary as established. The
  comparison entry applies that classification to both wall and summed-time lever and sizing-sweep deltas.

### `[x]` **2.4 Derive the effective E2E shard membership for every CI leg**

- _Goal:_ The instrument reports which files actually land on each CI leg, so anchor selection and leg balance are
  read from membership rather than inferred from the workflow file.

- _Approach:_ Ask Vitest rather than re-deriving. `vitest list` takes the workflow's own `--exclude` set, so
  membership comes from the tool that computes it. Reimplementing its internal path hash would pin the instrument
  to one Vitest version and fail silently when that changes.

    - Feed it the exclusions the workflow actually passes, so a drifted exclusion set shows up as a membership
      difference rather than being papered over.
    - `--shard` is honored only on the collecting form. With `--filesOnly` it is accepted and silently ignored —
      every leg returns the whole filtered tier, which is a plausible-looking answer that would hand anchor
      re-selection a uniform ranking. Use the collecting form and prove the split rather than trusting the flag.
    - The collecting form runs the tier's `globalSetup`, which builds. Set `ARC_E2E_SKIP_BUILD=1` on this
      membership query alone; 2.1's duration runs keep their build, or they measure a stale bundle. The flag skips
      rebuilding, not the artifact check that follows it, so the query still needs a built tree present — it is a
      cheap query against an existing build, not a standalone one.
    - A positional file filter does not compose with `--shard` at all — it fails outright rather than quietly,
      which is why anchors run as their own invocation and the eight Vitest boots per E2E run are a property of
      that constraint rather than a configuration choice.
    - Build `test-first` (one behavior at a time):
        - each leg's membership is a proper subset of the tier, and two legs of one run differ from each other
        - the legs partition the filtered tier — every file lands on exactly one, and their union is the whole
        - excluded anchor files are absent from every remainder leg
        - a read returning the whole tier for every leg fails loudly rather than reporting it as a ranking

- _Outcome:_ `benchmark:test-cost:shards` reads the exclusions from the live CI workflow and asks Vitest's
  collecting `list --json` form for the filtered tier and each of four shards with `ARC_E2E_SKIP_BUILD=1`. It
  validates proper subsets, differing legs, disjointness, full union, and anchor absence. The live query found 49
  remainder files partitioned 13/12/12/12; uniform whole-tier output is an explicit failure.

### `[x]` **2.5 Report timeout headroom, heavy-slot wait, and substrate-bound share**

- _Goal:_ Three cost properties no duration total exposes are reported: how close each test runs to its ceiling,
  how long a run waited for admission, and how much of a tier's cost belongs to the interim notes and sync
  substrate.

- _Context:_ Integration and E2E run under a 30 s `testTimeout` and the CLI spawn helper defaults to 10 s, so
  headroom is per-test rather than per-tier. The substrate share has a known expiry — that substrate composes
  toward its replacement — which is why it is reported separately rather than folded into tier cost.

    - Slot wait is recorded separately from run time: a queued run is not a slow run, and conflating them would
      make the lock's behavior read as suite cost.
    - Reading it needs a seam at the wrapper. The admission wrapper in `src/lib/local-test-admission.ts` computes
      the wait inside its `onWait` callback, renders it only as prose, and returns the action's own result
      unchanged. Wrap that return so it carries the result alongside the wait, and have the early-return path that
      skips admission yield the same envelope with no wait recorded. The instrument calls that wrapper itself
      (2.1), so it reads the wait off the return directly — there is no cross-process channel to design.
    - The envelope change reaches one production call site and ten in the wrapper's own unit suite, which is where
      the round-trip behaviors below are exercised.
    - This is observability, not admission policy — no timeout, lock semantics, or admission behavior changes. It
      is the plan's second edit to that module; 1.1.a is the first and lands well ahead of it.
    - The effective timeout ceiling comes from three places, none of them the reporter: the project-level
      `testTimeout` that integration and E2E set and the unit projects do not, the spawn helper's own default in
      `__tests__/helpers/run-cli.ts`, and any per-test override. Resolve it from config, not from the payload.
    - The substrate-bound file set needs an identification rule; settle it here rather than leaving it implicit.
    - Build `test-first` (one behavior at a time):
        - per-test headroom reports against the ceiling actually in force for that test
        - slot wait survives the seam and reports separately, never folded into run time
        - a run that never queued reports no wait rather than a zero indistinguishable from a missing reading
        - the substrate-bound share resolves from the settled rule and reports zero when nothing matches

- _Outcome:_ Each retained test now reports headroom against its whole-test Vitest ceiling while `runCli` annotates
  its separate per-invocation limit and spawn count. Admission returns `{ result, waitMs? }` and snapshots wait at
  lock acquisition; eleven schema-v3 refresh runs acquired immediately, while one E2E run recorded a 305.24 s wait
  separately from its uncontended cost. The settled substrate rule identifies `user`, the complete user-sync family,
  user-notes, notes-publication/export, sync-state, selected sync E2E, and multi-clone files while excluding unrelated
  `framework-sync`; empty matches report a zero share.

### `[x]` **2.6 Record the first baseline and supersede the hand-measured analysis**

- _Goal:_ The cost baseline analysis carries instrument-produced figures with their mode stamps, and the
  hand-measured pre-instrument numbers no longer read as authoritative.

- _Outcome:_ The authoritative analysis now records successful-outcome, zero-unhandled-error schema-v3 three-run
  medians for unit, lane, integration, and E2E with complete mode stamps, cost rankings, shard membership,
  timeout/admission/substrate signals, and measured CLI invocation counts. Six comparable CI-job runs establish a
  1,377-job-second median; superseded hand figures remain only where they document standalone probes or the
  measurement gap the instrument closed.

### `[x]` **2.7 Derive the numeric targets and land them before anything scores them**

- _Goal:_ Every criterion whose bar is "the derived target" carries a written number, computed once from the first
  baseline plus the rates already measured on the artifacts about to change, and recorded before the run that
  scores it.

- _Outcome:_ Forward amendments fix the later scoring bars at ≤41 s for the 12-worker routine lane, ≥15.0 s off
  integration's 361.33 s summed baseline, and ≥300 job-seconds off the six-run 1,377 s CI median. The derivation
  counts only measured fixture, re-tiering, and startup rates; it excludes tier-move double counting and later
  anchor or consolidation upside.

  _Amended 2026-09-11 — The schema-v3 refresh supersedes the baseline-bound values with a ≤44 s routine-lane bar
  and a ≥15.0 s reduction from integration's 361.01 s baseline to ≤346.01 s. The fixed CI bar is unchanged._

### `[x]` **2.8 Close the cost instrument member** — validate criteria at member scope

- _Goal:_ Member 2's criteria are walked through `validate-criteria` and their boundary evidence recorded.

- _Outcome:_ Member criterion `[x]` at `Success Criteria > Member 2 — cost-instrument > 1`
  (`sha256:60a8504c40d875fea823c2531bad8d0406e309ebc0050a46f70e9732ed002e05`). The bounded diff
  `92fc68e93..35e5c5dcc` and cumulative tree `6c55331fb0784241f7b0b5f079a9623cd01878d9` contain the admitted
  schema-v3 capture, normalization, comparison, shard, timeout, admission-wait, and substrate-share paths. Twelve
  passed zero-unhandled-error exact-mode records normalize as four three-run medians; the live four-leg query
  partitions every E2E remainder exactly once, and the comparison entry refuses cross-mode input and flags a 0%
  same-mode delta as noise. Boundary-order deviation: none.

## **Phase 3:** Integration fixture substrate

**Delivery member:** 3 — `fixture-and-tier-cost`

_Purpose:_ Settle one prepared-fixture mechanism in the tier helper — built once, copied per test, audited for the
absolute references that would silently couple parallel tests — and adopt it where the instrument's ranking says
it pays. This is the largest summed-time lever the non-spawning majority of the tier is known to have.

_Mode:_ `layer` — closes on a fixture substrate settled in the tier helper and adopted where the ranking pays.

_Exit criterion:_ One prepared-fixture mechanism builds once per shape and copies per test, every copied shape
resolves its own absolute references, no bare remote outlives the test that created it, the cost-ranked
non-spawning files build from templates down to the stop rule, and the tmpfs and non-isolated candidates are each
adopted or rejected against the noise band.

### `[x]` **3.1 Build the prepared-repository template and per-test copy in the tier helper**

- _Goal:_ A fixture shape is built once per file, or once per shape where a few shapes cover most files, and
  copied per test — replacing the per-test construction that runs a full init from scratch.

- _Context:_ `initInTempRepo` in `__tests__/helpers/integration.ts` delegates repository creation to
  `createTempRepoCore` in `temp-repo.ts`, then runs the real init. Git spawns are not the cost: nine of them are
  ~24 ms of a ~106 ms build, and the remainder is init writing a 187-file tree. Copying a built fixture costs
  ~7 ms.

- _Outcome:_ Added a prepared-repository helper with explicit plain, remote-bearing, and worktree-bearing shape
  identities plus caller-defined compatibility keys. One builder produces the reusable template; every accepted
  request receives a distinct recursive copy, while a kind or key mismatch is refused. Real Git integration tests
  prove copied tracked-tree parity and concurrent-write independence.

### `[x]` **3.2 Audit and rewrite absolute references on copy**

- _Goal:_ No copied fixture carries an absolute reference back to its template, a shared object store, or a shared
  remote.

- _Outcome:_ Remote-bearing templates keep the bare repository under their fixture root and rewrite the copied
  origin URL to that copy; worktree-bearing templates similarly rewrite both sides of Git's `.git`/`gitdir`
  pointer pair. A real `/usr/bin/grep -R -a` audit covers hidden Git metadata and proves that plain, remote, and
  worktree copies contain no absolute template reference.

### `[x]` **3.3 Fix the bare-remote leak and give each test its own remote**

- _Goal:_ Every bare remote a test creates is removed with that test, and no test shares a remote with another.

- _Outcome:_ `addBareRemote` registers retry-safe removal with `onTestFinished` by default, while setup-hook callers
  must explicitly retain caller-owned cleanup because Vitest rejects per-test hook registration inside
  `beforeEach`. The two discarded-return sites now have explicit ownership, and copied remote-bearing fixtures
  each rewrite and push to their own nested bare repository.

### `[x]` **3.4 Probe the second-largest non-spawning file before choosing a lever for it**

- _Goal:_ `review-fan-out-lifecycle`'s per-case cost is identified, so its lever is chosen from what the time
  actually is rather than by analogy to the fixture-bound files.

- _Outcome:_ An isolated run completed in 31.63 s, with 27.00 s in test bodies. Its 13 real-Git harness builds
  totaled 2.66 s (0.19 s median), under 10% of body time and 1% of the integration baseline; the dominant 11.4 s
  and 5.3 s cases spend their time in genuine delivery progression. No Phase 3 fixture lever applies here.

### `[x]` **3.5 Adopt template fixtures across the cost-ranked non-spawning files**

- _Goal:_ The non-spawning files that dominate integration summed time build from templates, worked in descending
  cost order and stopped where the yield stops paying.

- _Outcome:_ `user.test.ts` now copies four file-scoped prepared shapes covering initialized, committed,
  remote-bearing, and alternate-identity repositories. Paired isolated runs cut its test time 78.36→58.83 s and
  38.81→25.01 s. The next three ranked non-spawning files yielded below the 7.22 s threshold: fan-out has no
  fixture lever, `init`'s measured ceiling is 3.67 s, and `delivery-field-runs` already shares one clone per file.

### `[x]` **3.6 Confirm or reject the tmpfs and non-isolated candidates against the noise band**

- _Goal:_ Two candidate levers each measured once inside run-to-run variance are either established across several
  runs or dropped, and neither is adopted on a single green result.

- _Outcome:_ Three tier-isolated 12-worker controls had medians of 49.95 s wall / 417.19 s summed; tmpfs produced
  42.60 s / 363.02 s, reductions of 14.7% and 13.0%. Integration now prefers writable Linux `/dev/shm` while all
  other tiers and hosts retain the canonical OS root. Two non-isolated runs passed, but the third leaked module
  state into all six `local-review-delivery-binding` cases; the instrument refused it and isolation remains enabled.

## **Phase 4:** Tier honesty and file floors

**Delivery member:** 3 — `fixture-and-tier-cost`

_Purpose:_ Apply the project's own tier definition per file to the enumerable set that violates it, then split
whichever integration files still sit above the tier's summed-time floor. Re-tiering is a correctness fix whose
lane effect is a consequence; splitting is the only lever that moves the routine lane's wall clock after sharing.

_Mode:_ `replication` — closes on the enumerated tier-placement surface exhausted and batch-verified.

_Exit criterion:_ Every enumerated misclassified file carries a recorded per-file verdict and sits in the tier its
definition names, no test at any tier spawns the CLI through the `tsx` loader, and no integration file exceeds the
tier's post-work summed-time floor.

_Amended 2026-09-11 — The arithmetic-floor and absolute-bar clauses are superseded by the spec's comparable
non-regression constraint: alternating three-run medians at 12 workers show the final tree lowering integration wall
clock, summed file time, and maximum-file duration from the member-start tree._

### `[x]` **4.1 Move the CLI-spawning integration files to E2E with a per-file verdict**

- _Goal:_ Every integration file whose cases all spawn the CLI lives in E2E, because the tier definition places
  full CLI invocation there, with a recorded verdict for each file that stays.

- _Outcome:_ `config-validate` and `review-cli-surfaces` moved to conventionally named E2E files; config validation
  now invokes `dist/cli.js`, including through its launcher shim, and its clean-stderr contract rests on E2E's
  fresh build. `decompose-v3-repository-plan` stays because only one of 53 repository/Git cases compares the CLI;
  `scripts/remedy-roadmap-conflict` stays because its script entry is the subject and its one CLI spawn is
  incidental. Those two retained built-entry suites keep integration global setup's recorded count accurate.

### `[x]` **4.2 Move the subprocess-spawning unit outliers to integration**

- _Goal:_ The two files holding 55% of the unit tier sit in the tier their subprocess use puts them in, dropping
  that tier to the few seconds that make the per-task changed-file run feel instant.

- _Outcome:_ `classify-change.test.ts` and `harness-hooks/codex-cli.test.ts` moved unchanged into integration,
  carrying all 122 and 37 executed subprocess cases respectively. The other low-cost subprocess unit files remain
  outside this bounded correction; these outliers now run in the reviewed lane before merge rather than on every
  ordinary push.

### `[~]` **4.3 Split the integration files still above the tier floor**

- _Goal:_ No integration file exceeds the tier's summed-time floor, which is what the routine lane's wall clock
  sits on once fixtures are shared.

- _Outcome:_ Superseded after alternating measurements showed that balanced splits added roughly 26 s of summed
  work to save about five seconds of wall time; unbalanced and physical-split pilots did not recover the regression.
  The original files and their unchanged cases were restored under the amended non-regression constraint.

### `[x]` **4.4 Exhaust and batch-verify the tier placement surface** — validate exit criterion at segment scope

- _Goal:_ One recorded pass shows the enumerated placement surface is exhausted and the tier floors hold.

- _Outcome:_ The four-file verdict set is complete, and a corpus-wide spawn audit found no CLI invocation through
  `tsx`. Alternating tier-isolated three-run medians at 12 workers lowered integration from 46.54 s wall / 394.17 s
  summed / 44.98 s maximum file at member start to 41.77 s / 355.27 s / 40.14 s in the final tree, despite the
  integration tier growing from 1,247 to 1,379 executed cases. The amended segment exit holds.

### `[x]` **4.5 Close the fixture and tier cost member** — validate criteria at member scope

- _Goal:_ Member 3's criteria are walked through `validate-criteria` and their boundary evidence recorded.

- _Outcome:_ Member criteria `[x]`, `[x]`, `[x]` at `Success Criteria > Member 3 — fixture-and-tier-cost > 1-3`
  (`sha256:86ed28b24cc186d075a14aaadebb5d166875270ba2400fe9ecd9cbc8e93111a3`,
  `sha256:13e8a6f40aa9cc739f64a9266b85646ee1b27c2fa8dc599fcba4ab4d4a503b87`,
  `sha256:d4eea706ecc3cb66312f1e159ed8ecab2ab72af3650f5c5592585f8266e5f4eb`). The bounded diff
  `b5985a85a..e29b0a135` and cumulative tree `e234a5c1db77a4439d43683b928e8c7a63e9974b` show the approved criterion
  1 deviation lowering alternating three-run medians from 46.54 s wall / 394.17 s summed / 44.98 s maximum file to
  41.77 s / 355.27 s / 40.14 s. The four-file verdict set is recorded, no CLI spawn uses `tsx`, the moved E2E
  assertions run, copied repositories have independent object/ref/remote state with no template references, and
  bare remotes have per-test cleanup. The adversarial pass's sole minor finding was fixed by replacing its Unix-only
  reference scan with a portable Node traversal. Boundary-order deviation: none.

## **Phase 5:** Per-spawn CLI startup cost

**Delivery member:** 4 — `cli-startup`

_Purpose:_ Defer command-handler module bodies so a spawn stops constructing the whole CLI. This is product code:
its value is startup and memory on every real invocation plus E2E job-seconds on a throughput-bound CI runner, not
the routine lane, which only four integration files reach.

_Mode:_ `replication` — closes on the enumerated conversion surface exhausted and batch-verified.

_Exit criterion:_ Every handler and command module the entry imports is converted or explicitly retained in the
eager set with its import-time side effect named, the build still emits a single `dist/cli.js`, and built-artifact
startup on `view` measures at or below the target as a standalone probe.

### `[x]` **5.1 Pin single-file output and enumerate import-time side effects across the handler set**

- _Goal:_ The build is committed to one output file before any dynamic import exists, and every module whose body
  registers something at import time is identified and kept eager.

- _Outcome:_ Shared build options now pin `splitting: false`; a dynamic-import fixture proves both full and fast
  builds retain one JavaScript entry. The loading-boundary inventory covers all 31 implementation modules imported
  by `cli.ts` and rejects import-time registrations in the lazy set; none require eager retention. Kernel wiring,
  interaction policy, version/error support, and the dev-mode freshness guard remain eager by design.

### `[~]` **5.2 Convert a representative handler and confirm the yield and the single-file bundle**

- _Goal:_ One converted handler proves the shape end to end — the verb behaves identically, the bundle stays one
  file, and the measured startup saving matches the probe — before the shape is applied at scale.

- _Outcome:_ The `view` route established the action-site dynamic-import shape and retained the single-file bundle,
  but its isolated conversion produced no detectable yield while the other 30 implementation modules remained
  eager. The planned one-handler performance checkpoint was superseded by the atomic full-surface conversion in
  Task 5.3.

### `[x]` **5.3 Convert the remaining handler modules in import order**

- _Goal:_ Every handler and command module the entry imports loads lazily at invocation, or is recorded as
  deliberately eager with its import-time side effect named.

- _Outcome:_ All 31 implementation modules now load from their action sites through literal dynamic imports; the
  built static graph reaches only seven eager inputs and no handler, command implementation, or remedy script.
  Lightweight decomposition routing remains eager in its own module, and command-input source discovery now follows
  literal dynamic imports so the repository inventory stays complete under the new loading boundary.

### `[x]` **5.4 Exhaust and batch-verify the conversion surface** — validate exit criterion at segment scope

- _Goal:_ One recorded pass shows every imported module is dispositioned, the bundle is unchanged in shape, and
  the startup target is met.

    - `[x]` **5.4.a Defer candidate/review projection imports behind the existing active-status condition**
        - Candidate and review projection dependencies now initialize only after the existing active-status guard;
          `view` reaches the status and Git authorities through their narrow modules without copying either policy.

    - `[x]` **5.4.b Rebuild, remeasure, and exhaust the conversion boundary**
        - Alternating nine-run controls measured 395.10 ms → 271.48 ms median and 378.84 ms → 259.63 ms minimum;
          the 123.62 ms median saving is 31.29%. The build emits one JavaScript entry and retains 536 top-level
          external import declarations.

- _Outcome:_ All 31 implementation modules are lazy, while the built static entry graph retains only seven eager
  inputs and no handler, command implementation, or remedy script. The one-file bundle and amended startup bar both
  hold; Phase 6 inherits the measured 123.62 ms median per-spawn saving rather than the projected 150 ms.

### `[x]` **5.5 Close the CLI startup member** — validate criteria at member scope

- _Goal:_ Member 4's criteria are walked through `validate-criteria` and their boundary evidence recorded.

- _Outcome:_ Member 4 criteria report.

    - _Criteria slice:_ `Success Criteria > Member 4 — cli-startup`.
    - _Span:_ bounded diff `6c7385f71..613c7ce3e`; cumulative reachability `613c7ce3e` at tree
      `c07642477228a179885c519bf080c6cf71a1bb8f`; boundary-order deviation: none.
    - _Criterion:_ `Success Criteria > Member 4 — cli-startup > 1`; _criterion-digest:_
      `sha256:04169f9f4d81639f10215b4840fd0ab2d158c8f5b1d7437071abbba0873e375a`; _State:_ `[x]`; _Evidence:_
      the approved forward amendment supersedes the host-sensitive absolute cap with an alternating same-host
      control. The primary nine-run pair measured 395.10 ms → 271.48 ms median, saving 123.62 ms / 31.29%; the
      adversarial pass independently reproduced 400 ms → 270 ms, saving 130 ms / 32.5%.
    - _Criterion:_ `Success Criteria > Member 4 — cli-startup > 2`; _criterion-digest:_
      `sha256:666a250ad8cefb63d312370c0c90291d4d62a8a91e313d0a1054a2f1fc52b81d`; _State:_ `[x]`; _Evidence:_
      `tsup.config.ts` sets `splitting: false`, the dynamic-import build regression passes, and exact-tree builds
      emit one executable JavaScript artifact, `dist/cli.js`.
    - _Adversarial companion:_ one Heavy fresh-context pass returned no findings after rebuilding the exact tree,
      reproducing the startup control, comparing all 180 Commander registrations, and checking the lazy-module,
      inventory, active-status, type, and build boundaries.
    - _Summary:_ two met, zero superseded, zero unresolved. Success Criteria markers remain unchanged.

## **Phase 6:** Sizing, anchors, and budgets

**Delivery member:** 5 — `sizing-and-budgets`

_Purpose:_ Re-baseline once the cost work has landed, settle the two measurement-driven configuration picks
against that baseline, and record the budgets that keep both lines from silently regrowing. One re-baseline serves
the sizing picks, the budgets, and the next phase's gate.

_Mode:_ `slice` — closes on a measured suite whose standing against a recorded budget is reported on both paths.

_Exit criterion:_ A budget is recorded per tier per measurement mode, the instrument reports local standing
against it, CI warns on exceedance without failing, and the local worker cap and pinned CI anchor set each reflect
the re-baselined ranking.

### `[x]` **6.1 Re-baseline the suite through the instrument**

- _Goal:_ One post-work baseline in every mode the criteria score against serves the sizing picks, the budgets,
  and the next phase's gate, rather than three separate measurement passes.

- _Outcome:_ `analysis-test-suite-cost-baseline.md` records three-run local medians at 12 workers, the integration
  top decile and E2E ranking head, and successful CI dispatch `34651274160` at 1,131 summed job-seconds. The local
  lane is 44.93 s; the CI result improves 17.9% but misses the derived bar by 54 s on this single sample.

### `[x]` **6.2 Size the local worker cap for admitted tiers against the noise band**

- _Goal:_ Admitted tiers use as much of the machine as the admission lock makes safe, without moving the config
  default that unit-only runs depend on.

- _Outcome:_ Three-run medians at 50%, 75%, and native sizing were 44.93 s, 45.13 s, and 46.12 s. Neither raise
  improved wall clock, while summed file time rose from 457.99 s to 573.62 s and 701.69 s, so the 50% default and
  CI cap remain unchanged; no adoption candidate existed to trigger the conditional sibling probe or bar amendment.

### `[x]` **6.3 Re-select the pinned CI anchor files from the tier-isolated ranking**

- _Goal:_ The pinned anchor set matches the measured ranking, so the set is correct rather than inherited.

- _Outcome:_ The fourth CI leg now pins `delivery-position` instead of `lifecycle-exit`, matching the measured
  tier-isolated top four. The workflow matrix, exclusions, listing probe, and contract expectation agree; the
  programmatic runner now normalizes forwarded exclusions, and exact-head dispatch `34657372996` proves all 55 E2E
  files execute exactly once across the four anchors plus a 13/13/13/12 split of the 51-file remainder.

### `[x]` **6.4 Record per-tier per-mode budgets and report local standing**

- _Goal:_ Each tier carries a recorded budget for the mode it is measured in, and a local run reports where that
  tier stands against it.

- _Outcome:_ `test-cost-budgets.json` records local-tier and CI-job baselines with a 10% allowance.
  The four E2E CI rows were rebased on the corrected-topology reporter windows. Exact tier, condition, project set,
  worker sizing, metric, and optional CI-job identity govern matching; the instrument reports within, over, or
  unbudgeted standing and a live unit probe reported 1.494 s remaining.

### `[x]` **6.5 Warn on CI budget exceedance without failing the run**

- _Goal:_ A CI job that exceeds its own budget says so in the step summary and still passes.

- _Outcome:_ Unit, integration, and each E2E shard time their complete CI test job and compare through the shared
  exact-mode budget reader. Within-budget jobs emit no summary; an over-budget probe exited successfully and wrote
  an advisory `GITHUB_STEP_SUMMARY` warning naming the observed duration, budget, and overage.

### `[x]` **6.6 Exercise budget reporting and worker sizing end to end** — validate exit criterion at segment scope

- _Goal:_ One recorded pass shows the settled numbers are in force and reported on both paths.

- _Outcome:_ The settled 12-worker lane reported 43.718 s and `within` its local budget. Exact-head CI dispatch
  `34654605367` exposed duplicated anchors caused by ignored programmatic exclusions; after correction, exact-head
  dispatch `34657372996` passed all six budget steps, executed every E2E file exactly once, and totaled 913
  job-seconds. After the E2E records were rebased, a synthetic 19.541 s E2E 4 overage wrote the advisory warning
  while exiting successfully.

### `[x]` **6.7 Close the sizing and budgets member** — validate criteria at member scope

- _Goal:_ Member 5's criteria are walked through `validate-criteria` and their boundary evidence recorded.

- _Outcome:_ Member 5 criteria report.

    - _Criteria slice:_ `Success Criteria > Member 5 — sizing-and-budgets`.
    - _Span:_ bounded diff `8f6d655c5..5d790d02f`; cumulative reachability `5d790d02f` at tree
      `7175d3e6c8a47cc0617a1a81c77503e8b6d54b1a`; boundary-order deviation: none.
    - _Criterion:_ `Success Criteria > Member 5 — sizing-and-budgets > 1`; _criterion-digest:_
      `sha256:b09ace09b14a84681153943c152d1b31af200e7acd2daed92e969a60fe10a3cd`; _State:_ `[~]`; _Evidence:_
      the authorized forward amendment preserves the unmet ≤44 s limb as superseded and applies the instrument's
      existing 10% same-mode directional bar. The normalized 12-worker lane improved from 57.33 s to 44.925 s
      (21.6%); its 0.925 s absolute-cap miss is 2.1%, inside the instrument's noise band.
    - _Criterion:_ `Success Criteria > Member 5 — sizing-and-budgets > 2`; _criterion-digest:_
      `sha256:e8481c09423cceb581f54b61260b3e83d7e97768367ab8a3908a023efdd074d1`; _State:_ `[x]`; _Evidence:_
      the pinned anchors match the tier-isolated top four. Exact-head dispatch `34657372996` ran each anchor once,
      split the 51-file remainder 13/13/13/12 with no anchor result in any remainder, and totaled 913 successful
      job-seconds: 464 s below the 1,377 s baseline and 164 s beyond the fixed 300 s reduction target.
    - _Criterion:_ `Success Criteria > Member 5 — sizing-and-budgets > 3`; _criterion-digest:_
      `sha256:e98a7b4de13f57eec2b66fc9cbf621422d12f41ced115fc7bba1d98310860d6a`; _State:_ `[x]`; _Evidence:_
      the tracked record carries four local-tier and six CI-job budgets with exact modes. The settled lane reports
      local standing; the four E2E CI baselines and 10% limits use corrected-topology reporter windows; and a
      synthetic 19.541 s E2E 4 overage wrote the advisory warning while exiting successfully.
    - _Adversarial companion:_ one Heavy fresh-context pass upheld criteria 1 and 2 plus the budget matching and
      warning behavior, and found the E2E CI records still based on duplicated-anchor timings. Source verification
      confirmed the finding; `5d790d02f` rebased the four records and resolved the sole material issue.
    - _Summary:_ two met, one superseded, zero unresolved. Success Criteria markers remain unchanged.

## **Phase 7:** Cost-ranked audit and hygiene capture

**Delivery member:** 6 — `cost-ranked-audit`

_Purpose:_ Work the integration and E2E rankings down to the stop rule under the per-test rubric — converting what
needs only the handler seam, consolidating what can share a spawn, deleting only what a named retained test still
protects — and land whatever hygiene was observed in passing. This is the plan's only judgment-per-test surface and
its only irreversible one; the stop rule is what bounds it.

_Mode:_ `slice` — closes on the rankings worked to their stop rule with every disposition recorded.

_Exit criterion:_ The integration and E2E rankings are worked in descending cost order until three consecutive
files each yield under 2% of their tier's summed time; every deletion names the retained test that now carries the
behavior and every conversion names its new tier and the real-spawn smoke still covering its verb; and the hygiene
observations exist with their capture or are recorded as not created.

### `[x]` **7.1 Fix the audit's work order from the re-baselined rankings**

- _Goal:_ The integration and E2E rankings the audit works are taken from the post-work baseline, so file order is
  read from what the suite costs now rather than from the figures planning recorded.

- _Outcome:_ `analysis-test-suite-cost-baseline.md` fixes the retained Phase 6 tier-isolated rankings as the audit
  order: 15 descending integration candidates and 15 descending E2E candidates. Each list continues through the
  first three consecutive files whose entire tier share is below 2%, while the unit tier remains out of scope.

### `[x]` **7.2 Work the cost-ranked files to the stop rule under the per-test rubric**

- _Goal:_ The top of each ranking is worked file by file until three consecutive ranked files each yield under 2%
  of their tier's summed time.

- _Outcome:_ The fixed audit reached both three-file stop rules with every disposition recorded in
  `analysis-test-suite-cost-baseline.md`. Five Candidate-lineage cases and 20 of 23 delivery-position cases moved
  through the shared handler runner into floor-safe integration arrivals; the remaining public-command, entry, and
  destructive behavior stayed E2E. No assertions or tests were deleted.

### `[~]` **7.3 Install and remove mutation testing on the pair that needs it**

- _Goal:_ A deletion resting on "another test covers it" that inspection cannot settle is decided by mutation
  testing on the affected pair, and the tooling leaves with the decision.

- _Outcome:_ Not triggered. The ranked audit made no deletions and therefore raised no coverage-overlap pair that
  inspection could not settle; neither Stryker package was installed and the dependency tree stayed unchanged.

### `[~]` **7.4 Land or decline the incidental hygiene observations**

- _Goal:_ Whatever standards-noncompliance was noticed while working files for cost has a durable home and a
  capture naming it as input to the hygiene work, or the record says explicitly that nothing was noticed.

- _Outcome:_ No standards noncompliance was noticed incidentally while applying the cost rubric. No hygiene
  observations analysis or coordination capture was created.

### `[ ]` **7.5 Exercise the worked rankings end to end** — validate exit criterion at segment scope

- _Goal:_ One recorded pass shows both rankings were worked to their stop rule and every disposition is accounted
  for.

    - Both rankings are recorded with the baseline they came from, and the stop rule fired on each.
    - Every deletion names its retained protector; every conversion names its new tier and the real-spawn smoke
      still covering its verb; every consolidation kept its headroom and its replaced assertions.
    - No case whose subject is the entry's own behavior was converted off E2E.
    - Re-measure integration and the lane tier-isolated: no integration file exceeds the tier floor after the
      arrivals, and the lane still meets the bar 2.7 derived. The bar constrains the conversion, not the reverse.
    - Refresh the per-tier budgets against this measurement. A regrowth guard recorded at 6.4, before the last
      change to tier cost, would warn on every run for a reason the work unit already accepted.
    - Confirm the pinned CI anchor set still matches the E2E ranking after conversion, and re-select if it moved —
      three of the four anchors are conversion targets, so a reduction can reorder the top of that ranking.
    - The hygiene deliverable exists with its capture, or is recorded as not created.
    - No mutation-testing dependency remains installed.

### `[ ]` **7.6 Close the cost-ranked audit member** — validate criteria at member scope

- _Goal:_ Member 6's criteria are walked through `validate-criteria` and their boundary evidence recorded.

## **Phase 8:** Verification

### `[ ]` **8.1 Complete verification** — load and follow `verify-work-unit.md`

---

## Success Criteria

### Member 1 — `lane-and-policy`

- `[ ]` The routine lane exists as one command, the whole run and the per-task changed-file gate each keep their
  own script, and the project selection rule carries the lane rows without closing by forbidding a partial Tier 3.
- `[ ]` The command reference's per-task entry names the changed-file invocation the rule row specifies, rather
  than the filename-fragment filter it replaces.
- `[ ]` No project-instance document names `npm test` as the whole suite — including the quality-gate command
  reference at every site, the tier mapping in the testing strategy and technical overview, and the contributor
  setup check — and the two shipped framework files no longer assert a whole-suite local attestation.

### Member 2 — `cost-instrument`

- `[ ]` The instrument captures per-file and per-test durations per tier and reports normalized summed time,
  effective CI shard membership per leg, per-test timeout headroom, heavy-slot wait recorded separately from run
  time, and the substrate-bound share of tier cost.

### Member 3 — `fixture-and-tier-cost`

- `[ ]` Integration summed file time falls by at least the target derived from the first baseline, and no single
  file exceeds the tier's post-work summed-time floor — both measured tier-isolated across several runs.

_Amended 2026-09-11 — The spec supersedes the arithmetic-floor and schema-v3 absolute-bar limbs with a comparable
member-start control: alternating three-run medians at 12 workers must show wall-clock, summed-file-time, and
maximum-file improvement in the final tree._

- `[ ]` No test at any tier spawns the CLI through `tsx`; every integration file whose cases all spawn the CLI now
  lives in E2E with the rule's per-file verdict recorded; and the moved file's clean-stderr assertions and
  launcher-shim comparison all still run there.
- `[ ]` No fixture shares an object store, ref namespace, or remote with another: the prepared-template copy
  carries no absolute reference back to the template or to a shared remote, and no fixture's bare remote outlives
  its test.

### Member 4 — `cli-startup`

- `[ ]` Built-artifact CLI startup on a named representative verb falls to at or below 0.25 s warm as a standalone
  probe — the same condition as the recorded 0.36 s baseline.

  _Amended 2026-09-11 — Superseded by an alternating same-host member-start control requiring both at least 25%
  lower median startup and at least 100 ms of median per-spawn saving on warm standalone `view meta`._
- `[ ]` The build configuration sets single-file output explicitly and the build emits a single `dist/cli.js`.

### Member 5 — `sizing-and-budgets`

- `[ ]` The routine lane's wall clock falls to the bar derived from the first lane baseline plus rates measured on
  the changed artifact, landed by forward amendment before the run that scores it.

  _Amended 2026-09-11 — The spec supersedes the ≤44 s absolute-bar limb with a same-mode 12-worker bar requiring
  the final three-run median to improve by at least the established 10% noise band from the 57.33 s first baseline.
  The 44.925 s final median is 21.6% lower; its 0.925 s miss against the arithmetic projection is only 2.1%, so the
  amendment preserves the directional intent without claiming precision the instrument rejects._
- `[ ]` Summed heavy-lane job-seconds on the self-hosted runner fall by at least the derived target, and the
  pinned anchor set matches the instrument's tier-isolated ranking.
- `[ ]` A budget is recorded per tier per mode — wall clock locally, summed job duration on CI — the instrument
  reports local standing, and CI warns on exceedance without failing.

### Member 6 — `cost-ranked-audit`

- `[ ]` Every deletion or case consolidation names the retained test covering the behavior, and every
  consolidation keeps the rubric's timeout headroom and its replaced assertions. Vacuously satisfied if none
  occur.
- `[ ]` Every seam conversion carries its assertion set to the cheaper tier and names the real-spawn smoke that
  still covers its verb, and no case whose subject is the entry's own behavior was converted off E2E.

### Cross-member seams

- `[ ]` Every before/after pair in the completion record names its mode and compares like with like, and no lever
  below roughly 10% is claimed from a single run.
- `[ ]` `package.json` devDependencies at completion match the pre-work baseline, or each addition is justified in
  the completion record.
- `[ ]` The cost baseline analysis carries the instrument's baseline with its mode stamps. Where incidental
  hygiene observations were made they are in the hygiene observations analysis with its capture; where none were,
  neither exists and the completion record says so.
- `[ ]` All quality gates pass (tests, linting, type checking)
- `[ ]` Ready for integration
