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

### `[ ]` **3.4 Probe the second-largest non-spawning file before choosing a lever for it**

- _Goal:_ `review-fan-out-lifecycle`'s per-case cost is identified, so its lever is chosen from what the time
  actually is rather than by analogy to the fixture-bound files.

- _Context:_ It spawns no CLI and no git, and spends roughly 2.5 s per case across 15 cases in in-process
  delivery-store work — a different profile from `user` and `init` entirely.

    - The outcome is an identified cost term plus a named lever or an explicit "no lever here"; it does not commit
      this phase to acting on the finding.

### `[ ]` **3.5 Adopt template fixtures across the cost-ranked non-spawning files**

- _Goal:_ The non-spawning files that dominate integration summed time build from templates, worked in descending
  cost order and stopped where the yield stops paying.

- _Rationale:_ Fixture construction is 26–29% of `user.test.ts` and 32–36% of `init.test.ts`, so per-file yield is
  bounded near that share. 112 of 137 files carry a repo-building signal, but cost concentrates — this is a
  ranked adoption, not a sweep of all 133 non-spawning files.

    - Work from the instrument's ranking; 3.1's independence tests are the guard that each conversion is safe.
    - Stop on the same arithmetic 7.2 uses rather than a second threshold: stop when three consecutive ranked
      files each yield under 2% of the tier's summed time. That keeps "far enough down the ranking" a reading
      rather than a judgment, and it is the phase's only check, since a `layer` carries no segment verifier.

### `[ ]` **3.6 Confirm or reject the tmpfs and non-isolated candidates against the noise band**

- _Goal:_ Two candidate levers each measured once inside run-to-run variance are either established across several
  runs or dropped, and neither is adopted on a single green result.

- _Context:_ A tmpfs fixture root measured ~9% and integration `isolate: false` measured ~6–12%, both against ~8%
  variance. The non-isolated run passed all 1,248 cases including the three module-mocking files the unit tier
  quarantines — but mock leakage is order-sensitive, so one green run is not proof.

    - The tmpfs root is set by exporting `TMPDIR` before the run. The Vitest config reassigns `process.env.TMPDIR`
      at load, which looks like it pins the temp root and does not: it canonicalizes whatever `TMPDIR` already
      names, so an exported value flows through. Do not abandon the measurement on that reading.
    - Judge each candidate on the metric its mechanism actually moves. `isolate: false` reuses the module registry
      across files in a worker, so its effect lives in the import term: read as test duration alone it reports
      near zero whatever it is really worth. Compare inclusive per-file cost and lane wall clock.
    - Measure both through the instrument across several runs; adopt only what clears the band, and record the
      rejection when it does not.
    - A tmpfs root on E2E measured 0.5% and is not a lever there — do not extend either candidate to that tier.
    - If `isolate: false` is adopted, it is confirmed against the tier as it stands here and re-confirmed after
      7.2. Conversion brings in files that drive handlers in process and leave `process.exitCode` and the working
      directory behind them, which is exactly the state a shared worker carries into the next file. The failure
      shape is order-dependent flakiness rather than a loud red, so it does not surface on its own.

## **Phase 4:** Tier honesty and file floors

**Delivery member:** 3 — `fixture-and-tier-cost`

_Purpose:_ Apply the project's own tier definition per file to the enumerable set that violates it, then split
whichever integration files still sit above the tier's summed-time floor. Re-tiering is a correctness fix whose
lane effect is a consequence; splitting is the only lever that moves the routine lane's wall clock after sharing.

_Mode:_ `replication` — closes on the enumerated tier-placement surface exhausted and batch-verified.

_Exit criterion:_ Every enumerated misclassified file carries a recorded per-file verdict and sits in the tier its
definition names, no test at any tier spawns the CLI through the `tsx` loader, and no integration file exceeds the
tier's post-work summed-time floor.

### `[ ]` **4.1 Move the CLI-spawning integration files to E2E with a per-file verdict**

- _Goal:_ Every integration file whose cases all spawn the CLI lives in E2E, because the tier definition places
  full CLI invocation there, with a recorded verdict for each file that stays.

- _Rationale:_ This is a misclassification fix. The lane effect is a consequence, never the reason.

- **Additional Context:** `strategy-testing-methodology.md` § Test Tiers — the per-file verdict keys on those
  definitions.

    - The enumerable set is `config-validate`, `review-cli-surfaces`, `decompose-v3-repository-plan`, and
      `scripts/remedy-roadmap-conflict`. Apply the rule per file: one that spawns a script rather than the CLI, or
      that drives handler seams and spawns only incidentally, stays.
    - Three of the four are settled by inspection. `config-validate` moves — every case spawns the CLI and asserts
      clean stderr, and its launcher-shim comparison sits inside the compatibility corpus.
      `review-cli-surfaces` moves — it reaches the CLI through the shared spawn helper and nothing else.
      `scripts/remedy-roadmap-conflict` stays — every real case spawns the script through the loader, and its one
      CLI spawn asserts that a module's import-time side effect does not fire on `--help`, which is incidental by
      the rule.
    - `decompose-v3-repository-plan` is the open verdict: it spawns both the CLI and the classify script. Decide
      it here, and note that 4.3's largest split candidate exists only if it stays.
    - `config-validate`'s move ends the loader spawn: it is the only file spawning the TypeScript entry through
      `tsx` at 1.23 s per spawn against the bundle's 0.36 s, across ~21 spawns. In E2E it spawns the built bundle
      from that tier's `globalSetup` build like every other file there.
    - That file carries more than a changed spawn path. It writes a shim `arc` onto `PATH` so the launcher script
      under test can invoke `arc` and reach the source entry; against the bundle the shim loses its loader
      argument and one environment variable.
    - Record the trade in the file rather than as an annotation. Its clean-stderr helper currently explains itself
      by saying a source entry cannot run the staleness guard at all; after the move the guard can run and is
      silent only because the tier builds first, so the explanation is rewritten to that ground.
    - Every test file in the destination tier is named `<name>.e2e.test.ts`. The project's include glob does not
      require it, so a plain move would run while leaving the arrivals the only files there off convention —
      rename each on the move.
    - The tier's `globalSetup` documents how many suites spawn the built entry, and that count is what justifies
      its build step. Correct it to match the verdicts. The build stays needed either way, because the file that
      stays still spawns the bundle once.

### `[ ]` **4.2 Move the subprocess-spawning unit outliers to integration**

- _Goal:_ The two files holding 55% of the unit tier sit in the tier their subprocess use puts them in, dropping
  that tier to the few seconds that make the per-task changed-file run feel instant.

- _Context:_ `unit/classify-change.test.ts` drives a shell script through `bash` and
  `unit/harness-hooks/codex-cli.test.ts` spawns `git` 18 times and `sh` once. Both are integration by the tier
  definition, and together they hold 55% of the unit tier while flooring its wall clock.

- _Note:_ The tier-definition violation is wider than these two — roughly nine further unit files spawn a
  subprocess, and none of them is a cost outlier. They are deliberately out of scope here: this task's warrant is
  the 55% of tier cost these two hold, not a tier-wide reclassification. Do not widen it.

    - Moving them costs nothing at the destination — integration's floor is already higher and they run in
      parallel under it. Tune them only if they later become that floor.
    - The move does change when CI runs them: the unit job runs on ordinary pushes, while integration runs on
      reviewed-lane pull requests and dispatch, so these two files lose push-run feedback and are still covered
      before merge. Accept that trade rather than working around it.
    - Both use `it.each`, so take case counts from the instrument rather than a static grep.

### `[ ]` **4.3 Split the integration files still above the tier floor**

- _Goal:_ No integration file exceeds the tier's summed-time floor, which is what the routine lane's wall clock
  sits on once fixtures are shared.

- _Context:_ The floor is inclusive summed time over the workers in force — test time plus each file's transform,
  import, and hook cost. The pre-instrument figures put it near 28 s at 12 workers; counting the fixed term raises
  it, so take the number from the instrument rather than carrying that one. A split changes no test body and no
  assertion, but each new file re-pays its own fixed cost, so splitting buys wall clock at a real CPU price —
  split to clear the floor, not past it.

    - After 4.1, the candidates are `user` and `review-fan-out-lifecycle`, plus `decompose-v3-repository-plan` if
      4.1's rule keeps it in the tier.
    - `user` has eleven `describe` blocks to cut along; the other two are one flat block each, so their seams come
      from fixture shape and case count rather than existing structure.

### `[ ]` **4.4 Exhaust and batch-verify the tier placement surface** — validate exit criterion at segment scope

- _Goal:_ One recorded pass shows the enumerated placement surface is exhausted and the tier floors hold.

    - Every file in the enumerated set carries a verdict; no test at any tier spawns the CLI through `tsx`; no
      integration file exceeds the post-work floor.
    - Re-measure integration and the lane tier-isolated through the instrument, across several runs.

### `[ ]` **4.5 Close the fixture and tier cost member** — validate criteria at member scope

- _Goal:_ Member 3's criteria are walked through `validate-criteria` and their boundary evidence recorded.

## **Phase 5:** Per-spawn CLI startup cost

**Delivery member:** 4 — `cli-startup`

_Purpose:_ Defer command-handler module bodies so a spawn stops constructing the whole CLI. This is product code:
its value is startup and memory on every real invocation plus E2E job-seconds on a throughput-bound CI runner, not
the routine lane, which only four integration files reach.

_Mode:_ `replication` — closes on the enumerated conversion surface exhausted and batch-verified.

_Exit criterion:_ Every handler and command module the entry imports is converted or explicitly retained in the
eager set with its import-time side effect named, the build still emits a single `dist/cli.js`, and built-artifact
startup on `view` measures at or below the target as a standalone probe.

### `[ ]` **5.1 Pin single-file output and enumerate import-time side effects across the handler set**

- _Goal:_ The build is committed to one output file before any dynamic import exists, and every module whose body
  registers something at import time is identified and kept eager.

- _Rationale:_ The bundler defaults ESM splitting on and the config sets no key, so today's single-file output is
  a consequence of the bundle having no dynamic imports rather than a configured contract. Adding them without
  pinning it would silently produce the dist-layout change the design forbids.

    - The runtime-only build derives from the shared options, so pinning it once reaches both build paths.
    - Registration that runs at import time — a kernel or domain schema registered as a module-body side effect —
      changes behavior when its module loads lazily: it would run only once its handler is invoked. Enumerate
      these across the handler set and keep any module carrying one in the eager set.
    - The enumeration has a known starting point rather than an empty one. The roadmap-conflict remedy module is
      imported by the entry and is already guarded by an integration test asserting its side effect does not fire
      on `--help`. Reuse that assertion shape, and note that making this module lazy strengthens the property that
      test asserts rather than threatening it.
    - A scan of the handler modules found no top-level side-effectful statement, so the eager-retention set may be
      near-empty; the build calls its register functions explicitly rather than relying on module bodies. Confirm
      properly rather than trusting either signal.
    - The kernel stays eager, as does the dev-mode staleness check, preserving the guard that owns bundle
      freshness.
    - Build `test-first` (one behavior at a time):
        - the build emits exactly one bundle entry with a dynamic import present in the graph
        - a module carrying an import-time registration is absent from the lazy set

### `[ ]` **5.2 Convert a representative handler and confirm the yield and the single-file bundle**

- _Goal:_ One converted handler proves the shape end to end — the verb behaves identically, the bundle stays one
  file, and the measured startup saving matches the probe — before the shape is applied at scale.

- _Context:_ Commander registration stays eager: names, descriptions, and options must be registered up front for
  parsing and `--help`. Only the handler body moves behind `await import()` at invocation, and the entry already
  parses asynchronously, so no restructuring is needed there.

    - The shared interaction wrapper needs no change: it is generic in its return type, so an action that becomes
      async flows through unchanged. It resolves the interaction context synchronously before invoking the action,
      so policy resolution stays eager whenever the handler body loads.
    - Probe `view` standalone against its recorded ~0.36 s baseline under the same condition, so the comparison is
      like-for-like. It is the representative verb throughout: it loads a handler, it is non-destructive, and its
      0.21 s lazy-handler probe sits clear of the 0.25 s bar rather than on it — `status` probed at exactly 0.25 s,
      which would leave the criterion decided by run-to-run noise.

### `[ ]` **5.3 Convert the remaining handler modules in import order**

- _Goal:_ Every handler and command module the entry imports loads lazily at invocation, or is recorded as
  deliberately eager with its import-time side effect named.

- _Context:_ The conversion unit is the module, not the action site. The entry reaches its commands through
  roughly thirty imported handler and command modules, while its ~141 action sites are call sites that follow from
  which module went lazy — several of them sharing one module, so they convert together rather than
  independently. Take both live counts at execution rather than carrying these.

    - Batch by module in the entry's import order: that list is the enumerable surface itself, which makes "every
      module dispositioned" directly checkable and the sequence resumable across sessions.
    - Each module's call sites convert with it, so a regression localizes to one module rather than to a command
      family cutting across several.
    - This changes when handler modules load, not what they do — the suite is its own regression test.

### `[ ]` **5.4 Exhaust and batch-verify the conversion surface** — validate exit criterion at segment scope

- _Goal:_ One recorded pass shows every imported module is dispositioned, the bundle is unchanged in shape, and
  the startup target is met.

    - Every module is converted or listed eager with a reason, and no action site still reaches an eagerly
      imported handler; the build emits a single `dist/cli.js`.
    - Measure built-artifact startup on `view`, warm, as a standalone probe — the verb 5.2 fixed and the one the
      0.36 s baseline was taken on.
    - Record the remaining floor as structural: the bundle carries several hundred top-level imports of nine
      external dependencies, and module semantics evaluate them before any importing module's body runs. Read the
      count from the built bundle rather than quoting one — it drifts with the tree.

### `[ ]` **5.5 Close the CLI startup member** — validate criteria at member scope

- _Goal:_ Member 4's criteria are walked through `validate-criteria` and their boundary evidence recorded.

## **Phase 6:** Sizing, anchors, and budgets

**Delivery member:** 5 — `sizing-and-budgets`

_Purpose:_ Re-baseline once the cost work has landed, settle the two measurement-driven configuration picks
against that baseline, and record the budgets that keep both lines from silently regrowing. One re-baseline serves
the sizing picks, the budgets, and the next phase's gate.

_Mode:_ `slice` — closes on a measured suite whose standing against a recorded budget is reported on both paths.

_Exit criterion:_ A budget is recorded per tier per measurement mode, the instrument reports local standing
against it, CI warns on exceedance without failing, and the local worker cap and pinned CI anchor set each reflect
the re-baselined ranking.

### `[ ]` **6.1 Re-baseline the suite through the instrument**

- _Goal:_ One post-work baseline in every mode the criteria score against serves the sizing picks, the budgets,
  and the next phase's gate, rather than three separate measurement passes.

    - Baseline the unit projects, the lane, integration, and E2E locally, plus summed job duration in CI mode.
    - The concentration reading this produces is the input Phase 7's gate decides on.

### `[ ]` **6.2 Size the local worker cap for admitted tiers against the noise band**

- _Goal:_ Admitted tiers use as much of the machine as the admission lock makes safe, without moving the config
  default that unit-only runs depend on.

- _Rationale:_ The config caps local runs at 50% of cores to leave headroom for sibling agent sessions. The
  admission lock now guarantees only one admitted run executes machine-wide, so an admitted run can safely use
  more — but unit-only runs stay outside the lock by design and are what the per-task gate reaches, so the config
  default must not move.

    - Raise workers only inside the tier runner, for the tiers it admits. The worker resolver reads its
      environment variable ahead of the 50% fallback, and the runner starts Vitest in process, so setting the
      variable before startup reaches the config. The unit-only script bypasses the runner entirely and keeps the
      default without needing a guard.
    - Gate the raise on `CI`, not on whether the variable is already set. CI runs integration and E2E through this
      same runner, and the workflow sets the variable at workflow scope, where it resolves to an empty string on a
      hosted runner — which the resolver treats as unset and answers with native sizing. A presence check reads
      that empty value as absent and would cap a hosted run at the raised percentage, which is a CI worker-cap
      change. The admission module alongside it already reads `CI` this way.
    - Measure the lane at 50%, 75%, and native sizing; adopt a raise only if it clears the noise band with no
      sibling-session degradation in a paired run. The sweep varies worker sizing deliberately, so it is a sizing
      sweep under 2.2's rule rather than a lever claim to be refused.
    - Adopting a raise lowers the lane's summed-time floor, and 2.7 derived its lane bar against the sizing in
      force then. Land that re-derivation as a forward amendment by the same route, never as an edit to the
      recorded bar.
    - The CI cap is untouched.

### `[ ]` **6.3 Re-select the pinned CI anchor files from the tier-isolated ranking**

- _Goal:_ The pinned anchor set matches the measured ranking, so the set is correct rather than inherited.

- _Note:_ Value this as a correctness fix, not a wall-clock lever. On the two-slot self-hosted runner an anchor
  swap moves no job-seconds and can only trim the makespan's tail; the per-leg critical path it recovers applies
  under hosted fallback, where legs run on separate machines.

    - Measured, the largest four are `candidate-lineage`, `delivery-position`, `command-input-no-input`, and
      `errand`, while the pinned set carries `lifecycle-exit` in place of `delivery-position`.
    - The list lives in three places: the per-leg matrix value, the remainder-shard exclusion set, and a workflow
      contract test that hard-codes the same four names. Agreement between the first two is already machine-checked
      — the test derives its exclusion assertion from the array it asserts the matrix against — so the edit is a
      three-place change rather than a two-place change plus an eye check.
    - That test also pins anchors to shard positions in order, so a swap changes a position, not only membership.
    - The ranking is mode-sensitive: an earlier under-load run put `command-input-no-input` 7th rather than 3rd,
      so select from tier-isolated data.
    - Phase 7 converts cases out of three of these four files, which can reorder the top of the ranking. Select
      from 6.1's data here; 7.5 confirms the set against the post-conversion ranking and re-selects only if it
      moved, so the three-place edit happens once where it can.

### `[ ]` **6.4 Record per-tier per-mode budgets and report local standing**

- _Goal:_ Each tier carries a recorded budget for the mode it is measured in, and a local run reports where that
  tier stands against it.

- _Rationale:_ Budgets are per-mode because a local budget is meaningless against a CI runner, and the CI unit is
  the job because CI runs E2E as eight invocations across four sharded jobs, so no single job observes a per-tier
  total.

- _Note:_ The cross-job heavy-lane total is a different measurement, read from workflow-run data at verification
  rather than produced here. A job cannot observe what its siblings cost, so the budget mechanism does not try.

    - Derive the numbers from 6.1's baseline: tier wall clock locally, per-job elapsed duration on CI.
    - Budgets live in one tracked record keyed by tier and mode, read by both the instrument and the CI job. A job
      cannot run the instrument to learn its own budget — that would run the tier twice — so the number has to be
      readable from the tree, and a single record is what keeps the workflow and the instrument from drifting the
      way two inline copies would.
    - Build `test-first` (one behavior at a time):
        - a run under its budget reports as within it, and one over reports the overage
        - a budget recorded in one mode is never compared against a run in another
        - a run with no recorded budget reports as unbudgeted rather than as passing

### `[ ]` **6.5 Warn on CI budget exceedance without failing the run**

- _Goal:_ A CI job that exceeds its own budget says so in the step summary and still passes.

- _Rationale:_ Advisory only — budget noise must never block a merge.

    - The workflow writes step summaries only from its classification job today, so this is a new pattern in the
      test jobs rather than an extension of an existing one there — the mechanism is established, the location is
      not.
    - Build `test-first` (one behavior at a time):
        - an exceeding job emits the warning and still exits successfully
        - a job within budget emits no warning

### `[ ]` **6.6 Exercise budget reporting and worker sizing end to end** — validate exit criterion at segment scope

- _Goal:_ One recorded pass shows the settled numbers are in force and reported on both paths.

    - Run the lane at the settled worker sizing and confirm the instrument reports its standing against the
      recorded budget.
    - Confirm a CI-mode reading compares against the CI budget and never against the local one.
    - Confirm an exceedance warns and still passes.

### `[ ]` **6.7 Close the sizing and budgets member** — validate criteria at member scope

- _Goal:_ Member 5's criteria are walked through `validate-criteria` and their boundary evidence recorded.

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

### `[ ]` **7.1 Fix the audit's work order from the re-baselined rankings**

- _Goal:_ The integration and E2E rankings the audit works are taken from the post-work baseline, so file order is
  read from what the suite costs now rather than from the figures planning recorded.

- _Rationale:_ Cost order moves as the mechanical levers land — D3 reshapes integration, and D4 scales every E2E
  file with its spawn count — so the ranking that matters is the one after Phase 6.

    - Take both rankings from 6.1 tier-isolated and record them: they are the audit's work order and the evidence
      7.5 reports against.
    - The unit tier is out of scope. Phase 4's moves drop it to a few seconds, which no per-test judgment improves
      on.
    - Work the top decile first, in descending cost order, stopping where 7.2's rule says to stop.

### `[ ]` **7.2 Work the cost-ranked files to the stop rule under the per-test rubric**

- _Goal:_ The top of each ranking is worked file by file until three consecutive ranked files each yield under 2%
  of their tier's summed time.

- **Additional Context:** `notes-test-suite-right-sizing.md` § Per-test rubric provenance and
  § Spine conversion and the successor's remainder

    - Apply the rubric only to cost-ranked candidates, never as a sweep: what behavior does the test protect; is
      it already proven at a cheaper tier; can the scenario be driven through the handler seam instead of the real
      CLI; can several cases share one expensive setup or spawn; does it still fail when the logic breaks; and
      which retained test now carries the behavior.
    - **Seam conversion is the lifecycle spines' lever.** Where a case needs only handler-seam outcomes, convert it
      to integration driving the verb core through CLI-generated inputs — the seam `testing-standards` sanctions —
      and keep one real-spawn smoke per verb. Leave at E2E anything whose subject is the entry's own behavior:
      argument parsing, command dispatch, output formatting. Those are the successor's population, and converting
      them here would foreclose it.
    - A conversion carries its assertion set across. One that sheds assertions is a deletion and takes the deletion
      rules below.
    - **Converted cases land under the integration tier floor**, the same discipline 4.3 applies to splitting.
      Conversion moves cost into that tier, and the lane's wall clock is floored by its longest integration file,
      so a spine arriving whole would undo in Phase 7 what Phase 4 established. Choose the landing files to keep
      each under the floor.
    - Settle one shared way to drive a handler and capture its stdout and exit code, rather than letting each
      converted file invent its own. Handlers set `process.exitCode` rather than exiting, and the top three spines
      carry dozens of exit-code assertions between them; at this volume an ad-hoc helper per file is how the tier
      grows a second fixture vocabulary.
    - Prefer consolidation over deletion. A consolidated test keeps at least 3× headroom against its timeout
      ceiling or carries an explicit per-test timeout, and every stderr and exit-code assertion it replaces
      survives.
    - Destructive verbs stay at the full-invocation tier.
    - Coverage overlap alone never justifies deletion — coverage-minimized suites lose roughly half their fault
      detection for an ~80% size reduction, so deletion needs behavioral intent plus a named protector.
    - Never thin coverage of the notes mutators to save time: that substrate's tests are real proofs of a
      concurrency-sensitive surface, and cheap fixture sharing is the preferred lever there.

### `[ ]` **7.3 Install and remove mutation testing on the pair that needs it**

- _Goal:_ A deletion resting on "another test covers it" that inspection cannot settle is decided by mutation
  testing on the affected pair, and the tooling leaves with the decision.

- _Note:_ Conditional — the first such undecidable case is what authorizes the install; absent one, nothing is
  installed.

- **Additional Context:** `notes-test-suite-right-sizing.md` § Mutation testing

    - The two packages install as a matched pair: the runner pins its core peer to an exact version, so taking
      the latest core alongside it fails peer resolution. Its Vitest peer range is satisfied by the version in
      use.
    - Use it on the affected pair only; never across the corpus, never in CI.
    - Uninstall at verification, retaining any config file written. A retained config for an uninstalled tool
      reads as debris unless it says why it is there — record that in the file itself.

### `[ ]` **7.4 Land or decline the incidental hygiene observations**

- _Goal:_ Whatever standards-noncompliance was noticed while working files for cost has a durable home and a
  capture naming it as input to the hygiene work, or the record says explicitly that nothing was noticed.

- _Rationale:_ Noticed in passing, never sought — an empty observations file is worse than none.

    - When observations exist, they land in the hygiene observations analysis plus its capture; when none do,
      neither is created and the completion record says so.
    - The analysis directory is the right home by its own stated criteria — reference material a later work unit
      will consult — and the filename follows its naming convention. The paired capture is untracked, which is
      what makes it the coordination surface rather than a tracked buffer.

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
- `[ ]` No test at any tier spawns the CLI through `tsx`; every integration file whose cases all spawn the CLI now
  lives in E2E with the rule's per-file verdict recorded; and the moved file's clean-stderr assertions and
  launcher-shim comparison all still run there.
- `[ ]` No fixture shares an object store, ref namespace, or remote with another: the prepared-template copy
  carries no absolute reference back to the template or to a shared remote, and no fixture's bare remote outlives
  its test.

### Member 4 — `cli-startup`

- `[ ]` Built-artifact CLI startup on a named representative verb falls to at or below 0.25 s warm as a standalone
  probe — the same condition as the recorded 0.36 s baseline.
- `[ ]` The build configuration sets single-file output explicitly and the build emits a single `dist/cli.js`.

### Member 5 — `sizing-and-budgets`

- `[ ]` The routine lane's wall clock falls to the bar derived from the first lane baseline plus rates measured on
  the changed artifact, landed by forward amendment before the run that scores it.
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
