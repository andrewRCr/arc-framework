# Task List: CLI Test Hardening

- **Design:** `spec-cli-test-hardening.md`

---

## **Phase 1:** Shared temp-repo teardown primitive & factory consolidation

_Purpose:_ Land the keystone reliability intervention for flake (b) — one retry-safe removal primitive as the
single removal path for git-backed temp directories, and one `createTempRepo` core carrying the invariants that
must not drift (gc-disable, git user config, hardened removal). Delivers Decision 3 and Success Criterion 4; the
gc-disable-everywhere and hardened-removal work also removes most of flake (d)'s mechanism (closed out in Phase 2).

_Design decisions:_ Removal is currently duplicated everywhere — `cleanupTempDir` is defined twice
(`helpers/integration.ts`, `e2e/helpers.ts`), both bare `rm(..., {recursive, force})` with no retry, plus
`Promise.allSettled`+`rm` closures in the other helpers and inline `rm` in ~68 test files. `gc.auto 0` (the only
current `ENOTEMPTY` mitigation) reaches only the two `createTempRepo` factories, not the helper closures or the
inline-created bare origins — the proven drift that let the race recur post-`9fac314ff`. Consolidation lands with
the full suite green (Consequences: suite-wide blast radius accepted). See `notes-cli-test-hardening.md`
§ Teardown-sweep starting points and § Flake forensics.

### `[x]` **1.1 Retry-safe git-backed removal primitive**

- _Goal:_ A single hardened removal helper retries transient `ENOTEMPTY`/`EBUSY` (git background repack racing
  teardown) with bounded backoff, then fails with a clear diagnostic — replacing every bare `rm` teardown of a
  git-backed dir.

- _Outcome:_ `removeGitBackedDir` landed in `temp-repo.ts` — retries `ENOTEMPTY`/`EBUSY` with bounded backoff
  (10-attempt budget, capped per-attempt delay), propagates a non-transient errno immediately, and throws a
  path+errno diagnostic on budget exhaustion. Injectable `remove`/`sleep` seams keep the retry and
  budget-exhaustion branches deterministic in unit tests; the common-case and missing-path (force-semantics)
  behaviors exercise real filesystem teardown. Not yet adopted by callers — the factory/helper/inline sweep
  in Tasks 1.2–1.4 routes existing teardowns onto it.

### `[x]` **1.2 Shared `createTempRepo` core + thin e2e wrapper**

- _Goal:_ The factory invariants (`gc.auto 0`, `user.email`/`user.name`, hardened removal via 1.1) live in one
  core; the e2e wrapper adds only tier personality, so the two fronts can never drift again.

    - `[x]` **1.2.a Extract the shared core and re-point the integration factory**
        - `createTempRepoCore` (init `-b main` + `gc.auto 0` + user config, optional `arc.identity`) landed in
          `temp-repo.ts`; `helpers/integration.ts` `createTempRepo` now wraps it with the `arc-test-` prefix and
          `cleanupTempDir` delegates to `removeGitBackedDir`. `makeNotesTreeCommit` and the other exports unchanged.

    - `[x]` **1.2.b Re-point the e2e factory onto the core**
        - `e2e/helpers.ts` `createTempRepo` now wraps the core, layering only `arc.identity=test-user` + the
          `arc-e2e-` prefix; `cleanupTempDir` delegates to the primitive. Node-builtins-only boundary preserved
          (imports the test helper, not CLI source).

- _Outcome:_ Both factory fronts collapse onto one `createTempRepoCore`, so the drift-prone invariants (gc-disable,
  user config, hardened removal) have a single home; the `--initial-branch=main` / `-b main` spelling is now
  uniform. Behavior-preserving — full integration and e2e tiers green with no fixture changes.

### `[x]` **1.3 Route the named helper-level teardowns through the primitive**

- _Goal:_ The three named helper files route every git-backed removal through the 1.1 primitive, and the helpers
  that build git repos without gc-disable get it.

- _Outcome:_ `multi-clone.ts` (`seedOrigin` teardown + both `setup*` cleanup closures), `in-flight-reshuffle.ts`
  (worktree-parent cleanup), and `commit-message-fixture.ts` (`withFixture` teardown) now route every git-backed
  removal through `removeGitBackedDir`. The gc-disable gap is closed at each repo-creation site that lacked it —
  the multi-clone seed, both bare origins, and each clone (via a local `disableAutoGc` helper), plus the
  commit-message fixture repo; reshuffle worktrees inherit it through the primary clone's shared common dir.
  Verified against the consuming integration + e2e tests.

### `[x]` **1.4 Inline-site sweep across the test suite**

- _Goal:_ Every git-backed temp-directory teardown outside the factories/helpers routes through the primitive,
  with `gc.auto 0` on the inline-created bare origins; any conscious exclusion is recorded.

    - `[x]` **1.4.a Enumerate and classify the inline sites**
        - Classified every inline `rm(..., { recursive })` across the 63-file surface (factory `cleanupTempDir`
          calls excluded — already routed). Git-backed sites: **0** in the unit tier (all mocked-git or plain
          `mkdtemp` fs fixtures), 19 across 8 integration files, 9 across 6 e2e files. Recorded exclusions
          (left as non-git fixtures): unit-tier plain fixtures; integration `userDir` / `.arc`-subtree removals
          and single-file `rm`s; and `user.test.ts`'s pre-`worktree add` wipe of an empty placeholder dir
          (not git-backed at removal time).

    - `[x]` **1.4.b Route git-backed removals and gc-disable inline bare origins**
        - Integration (routed via the `integration.js` re-export, or a direct `temp-repo.js` import where the
          file doesn't use the tier helper): `status`, `user`, `teardown`, `status-project`, `start-dispatch`,
          `release-push-upstream-init`, `park-resume-roundtrip`, `commit-msg-shim`. E2E (via the `helpers.js`
          re-export, direct import for the standalone `pre-push`/`commit-msg`): `session-init`, `base-sync`,
          `state-ref-race`, `pre-push`, `lifecycle-exit`, `commit-msg`. Every inline-created bare/`git init`
          origin that lacked it got `gc.auto 0`. Sweep verified green (typecheck, lint, and the touched tiers);
          the sole full-suite red is the pre-existing unit-tier contention timeout in `validate-config.test.ts`
          (passes 20/20 in isolation) — a documented flake owned by the Phase 3 pool tuning, independent of this
          sweep.

---

## **Phase 2:** Heavy integration fixtures & save/sync isolation

_Purpose:_ Take down the shared reliability + cost surface at the two heavy integration files and close the
contention races. Delivers Decisions 2, 4, 5 and Success Criteria 1(a,c,d) and 3. Runs after Phase 1 — the
retry-safe removal + gc-disable baseline is a precondition for the flake-(d) close-out.

_Design decisions:_ `user-notes-compaction.test.ts` and `user.test.ts` carry ~31% of their tier and three of the
flake signatures. Flake (a) is subject to the notes stop-loss (Decision 10): preference order none → bounded
isolation → light investment, no new marker types or structural notes machinery. The compaction file hand-builds
its fixtures via real `git notes add`/`makeCommit` round-trips, so the (a) intervention adopts synthetic notes-tree
construction where it preserves the retention assertion. See `notes-cli-test-hardening.md` § Flake forensics and
§ Measurement detail.

### `[x]` **2.1 De-cost the notes-compaction fixture (flake a)**

- _Goal:_ `user-notes-compaction.test.ts` file wall-time drops (absolute, not merely tier share) and the (a)
  signature stops recurring, with the retention assertion preserved.

- _Outcome:_ Shrank the one costly test's ("retains old shipped-WU notes…") filler loop 302 → 35 (a
  `fillerCount` const, kept above the window=10 and read-concurrency=16 boundaries) and derived the count
  assertions from it (`retainedCount` 12 = window + 2 gated specials; `prunedCount` = `fillerCount` − window =
  25). Added a partition-dump diagnostic (`formatRetentionMismatch` / `describeNotePartition`) that prints the
  retained/pruned notes with committer dates + manifest paths on a count mismatch. At 302 the test was timing
  out against its own 30s budget on the dev machine (~33s) — the (a) signature; at 35 it runs ~5.6s isolated,
  with the retention behavior (2 gated specials + newest-10 window) preserved and empirically confirmed via the
  diagnostic. Synthetic notes-tree construction was ruled out (retention ranks by real committer date, so
  fabricated SHAs break the partition); fast-import batching rejected as bridge over-investment.

### `[x]` **2.2 Shallow-clone per-test budget (flake c)**

- _Goal:_ The shallow-clone test clears its timeout with headroom without widening the suite default.

- _Outcome:_ Gave the shallow-clone test in `integration/user.test.ts` a 15s per-test budget (from the 5s
  integration default) with a rationale comment. Chose the per-test budget over trimming the 10-commit setup
  loop: that loop is load-bearing (it pushes the noted commit beyond the depth-1 shallow boundary, which is the
  condition under test), and the cost is the clone/push/pull/load sequence, not the commits — so a budget bump
  is the robust headroom fix. Isolated ~3.3s; the ~5478ms contended peak now clears with wide margin.

### `[x]` **2.3 Re-reproduce and close the save/sync races (flake d)**

- _Goal:_ The recorded save/sync contention no longer reproduces under the current sanctioned invocation.

- _Outcome:_ Does not reproduce post-Phase-1. Ran the current combined `vitest run` four times — one full
  suite plus three runs of the six span files together — with zero occurrences of the recorded stderr
  signatures (`Save failed` / `Worktree push skipped` / `Notes push skipped`) and zero failures in any span
  file. Phase 1's retry-safe removal + gc-disable baseline closed the teardown/background-gc mechanism; temp
  dirs were already unique per-test, so no within-test concurrency remained to isolate and the
  bounded-serialization fallback was unneeded. No code change. Re-reproduction detail recorded in
  `notes-cli-test-hardening.md` § Flake forensics (d). (Combined-run reds are flake (e), owned by Phase 3.)

---

## **Phase 3:** Unit-tier pool tuning, spike-gated

_Purpose:_ Close the unit-tier overhead gap (~45s aggregate test time → ~87s CI wall under the default
`isolate: true` forks pool) behind a safety spike, and make flake (e) disappear as the falsifiable target.
Delivers Decisions 6 and 7 and Success Criteria 1(e) and 2.

_Design decisions:_ The spike gates the tuning — worker threads cannot `process.chdir()` and module-level state
leaks under `isolate: false`, so relaxing isolation is unsafe until proven. Stop-loss: a negative spike outcome is
recorded and the wall-time criterion is consciously re-targeted (e.g. shard the unit leg), never forced. The
config is a single `vitest.config.ts` with three projects; only the e2e project overrides pool/timeout today.

### `[x]` **3.1 Isolation-safety spike**

- _Goal:_ A recorded go/no-go on whether the unit tier can safely relax `isolate` / switch pool, grounded in how
  CLI unit tests actually use cwd and process-level state.

- _Outcome:_ **GO** — both hazards absent: no `process.chdir()` in any of the 361 unit test files (production
  `chdir` is DI'd; its unit tests inject spies), and no module-level mutable state relied on fresh (factory/DI
  throughout). The spike also found flake (e) **pool-orthogonal** — identical 5s timeouts under forks and threads,
  because its two tests each run three serial ~1.7s bash spawns past the flat 5s default — so pool tuning owns the
  wall-time criterion only; flake (e) is decoupled and fixed by an `it.each` restructure. Detail in
  `notes-cli-test-hardening.md`.

### `[x]` **3.2 Fix flake (e): spawn-loop → `it.each`**

- _Goal:_ Flake (e) stops reproducing — the two contention-timeout tests become robust under machine load.

- _Outcome:_ Restructured the two 3-spawn `for`-loop tests in `validate-config.test.ts` to per-value `it.each`
  (matching the file's existing idiom); each test is now a single ~1.7s spawn against the default 5s budget, so
  the flat-timeout-under-contention signature can't recur. Decoupled from the pool tuning per the 3.1 spike.

### `[x]` **3.3 Harden module-mock unit tests for `isolate:false` safety**

- _Goal:_ The unit suite stays green under `isolate:false` so the pool tuning (3.4) can land — this **blocks 3.4**.
  Contain the hoisted module-mock leakage that breaks real-module tests when files share a worker.

- _Outcome:_ Quarantined the 15 unit files that module-mock internal modules into a dedicated isolated vitest
  project (`unit-mocks`, `isolate: true`); the main `unit` project excludes them, so 3.4 can set `isolate: false`
  there without their hoisted mocks leaking across the shared worker. The leak was broader than the two diagnosed
  victims and nondeterministic across worker assignment (three runs, three different victim sets), so isolation
  beats per-file mock teardown across a growing file set. A guard test fails if a new module-mocking file drifts
  out of the shared list (`__tests__/helpers/isolated-unit-mock-files.ts`); `test:unit` now runs both tiers.
  Verified: full unit suite green under the real `unit`=`isolate:false` / `unit-mocks`=`isolate:true` topology.

### `[x]` **3.4 Apply unit-pool tuning (`isolate:false`) + re-measure**

- _Goal:_ Unit-tier CI wall approaches its ~45s aggregate test time; the per-file module re-import overhead of
  `isolate:true` is removed. Depends on 3.3.

- _Outcome:_ Set `isolate: false` on the `unit` project (the `unit-mocks` tier stays isolated). Re-measured on an
  idle box against the same-split `isolate:true` baseline: summed module import ~78s → ~52s and transform ~47s →
  ~37s across the 347-file tier — removing the per-file re-import overhead that inflated CI wall above aggregate
  test time. The win is hidden locally by many-core parallelism (wall ~6.5s → ~3.5s); it lands on low-core CI
  runners where the re-import can't be parallelized away. No re-target needed — the Decision 7 stop-loss did not
  fire.

---

## **Phase 4:** E2E CI sharding & classifier sync

_Purpose:_ Cut e2e wall-clock through CI parallelism rather than per-test optimization (the tier is intrinsically
spawn-bound). Delivers Decision 8 and Success Criterion 6.

_Design decisions:_ A bounded GitHub Actions matrix + vitest `--shard` on the stable post-#253 surface — no
structural workflow rework (No-go). Matrix legs rename the e2e check-runs (a `(<matrix value>)` suffix), and
`scripts/classify-change.sh` `HEAVY_CHECK_NAMES` must stay byte-identical to the CI job names, so the classifier
updates in the same change (Consequences: classifier coupling). Stop-loss: structural leg rework or more than a
bounded couple of in-CI tuning iterations stops and captures the remainder.

### `[x]` **4.1 Shard the e2e job and sync the classifier**

- _Goal:_ The e2e tier runs sharded across a CI matrix, with `HEAVY_CHECK_NAMES` matching the post-matrix check-run
  names byte-identically in the same change.

    - `[x]` **4.1.a Add the shard matrix + `--shard` invocation**
        - The e2e job now uses a three-leg, fail-fast-disabled `shard` matrix and invokes the package workspace's
          e2e script with `--shard=${{ matrix.shard }}/${{ strategy.job-total }}`, keeping the denominator tied to
          matrix size.

    - `[x]` **4.1.b Sync `HEAVY_CHECK_NAMES` to the sharded check-run names**
        - Replaced the single e2e classifier entry with `E2E Tests (1)` through `(3)` and updated the verified-tree
          fixtures so a missing, pending, or failed shard keeps the fail-safe heavy result.

- _Outcome:_ The verified-tree skip now requires all three independently named e2e shard checks, while the
  `ci-ok` rollup continues to wait on the unchanged `e2e` job id.

---

## **Phase 5:** Coverage gaps & product-edge hardening

_Purpose:_ Land the confirmed coverage gaps and the three paired product edges, or record a conscious rejection,
with the full suite green. Delivers Decision 9 and Success Criterion 5.

_Design decisions:_ Three small product hardening deliverables land paired with their tests — the `readUserDir`
symlink guard, the `checkLatestVersion` timeout/abort (untestable without the mechanism), and a render-time
unbalanced-conditional guard (no balance check exists today — a stray or unclosed directive silently mis-scopes
installed content). The `renderTokens` metacharacter surface is token _values_, not names (a static regex);
`checkLatestVersion` parses via `response.json()`, so invalid JSON already resolves null and the open gaps are
timeout/abort and a wrong-shape body; and the status filesystem-edge loci are the probes under `src/lib/status/*`
and `src/handlers/status.ts` (`commands/status/run.ts` is a pure orchestrator with no fs calls).

### `[x]` **5.1 Template conditional balance guard (product edge) & token-value edges**

- _Goal:_ Unbalanced `arc:if`/`arc:endif` fails loudly at render time instead of silently mis-scoping installed
  content, and token-value metacharacters are covered.

- _Outcome:_ `renderConditionals` now rejects stray and unclosed directives with template-path/line diagnostics;
  every production render path supplies that context. Only `.template.*` files enter the renderer, so plain docs
  that demonstrate directive syntax remain untouched; balanced nesting and literal token-value substitution stay
  covered.

### `[x]` **5.2 Filesystem edges & symlink cycle guard (product edge)**

- _Goal:_ `readUserDir` is hardened against symlink cycles and the filesystem-vanish edges are covered.

- _Outcome:_ The product `createUserIOContext().readDir` path now de-duplicates traversed realpaths to stop symlink
  cycles and skips entries that vanish before `stat`; tests deliberately bypass the duplicate integration helper.
  Diff preserves its non-fatal per-file error contract when the current file disappears, and the real status
  filesystem sources now cover both guarded project-view reads and ready-mine metas vanishing after discovery.

### `[ ]` **5.3 Network edge & version-check timeout (product edge)**

- _Goal:_ `checkLatestVersion` bounds its fetch with a timeout/abort mechanism, covered by a test, plus a
  wrong-shape-body case.

- _Context:_ `checkLatestVersion` (`src/lib/version.ts` ~L81-102) has no `AbortController`/timeout — a stalled
  socket hangs unbounded. It parses via `response.json()` (invalid JSON already rejects → null) and guards
  `typeof version === "string"`; the `FetchFn` DI seam (~L67) makes both fully mockable.

    Build `test-first` (one behavior at a time):

    - `checkLatestVersion` aborts and resolves null when the fetch exceeds the timeout budget
    - a well-formed-but-wrong-shape body (missing/non-string `version`) resolves null

### `[ ]` **5.4 Entry-point & command-concurrency coverage**

- _Goal:_ The untested entry-point paths and init/update command-level concurrency are covered.

- _Context:_ `writeGitNote` (`src/lib/io-context.ts` ~L85-112) has an stdin/EPIPE guard; `readGitNote` (~L118-130)
  returns null on any failure — it cannot distinguish a corrupt ref from an absent note (a testable nuance).
  `runWithSpinner` (`src/handlers/shared.ts` ~L44-60) stops the spinner and re-throws on error (untested path).
  The `true-race`/`race-worker` harness targets git-ref primitives, not the `init`/`update` commands;
  `init.e2e.test.ts` / `update.e2e.test.ts` carry no concurrency tests (greenfield — extend the harness or drive
  two CLI spawns via `helpers/cli-spawn.ts`).

    - `[ ]` **5.4.a Entry-point paths**
        - `writeGitNote` stdin/EPIPE handling; `readGitNote` against a corrupt ref; `runWithSpinner` error path.

    - `[ ]` **5.4.b `init`/`update` command-level concurrency**
        - Cover concurrent `init`/`update` invocations (the existing race harness targets git-ref writes only).

---

## **Phase 6:** Verification

### `[ ]` **6.1 Complete verification** — load and follow `verify-work-unit.md`

---

## Success Criteria

- `[ ]` Flake signatures (a)-(c) do not recur in CI after landing (observed over subsequent PRs); (d) and (e) no
  longer reproduce under their recorded local reproductions (combined `vitest run` for (d), full unit-suite run
  for (e))
- `[ ]` Unit-tier CI wall approaches its ~45s aggregate test time — or the spike's negative outcome is recorded
  and the criterion is consciously re-targeted (e.g. sharded unit leg)
- `[ ]` The two heavy integration files' absolute wall-time drops (not merely tier share); they no longer carry
  ~31% of their tier
- `[ ]` Teardown of git-backed temp directories routes through the shared retry-safe removal primitive — the two
  factories, the three named helpers, and the swept inline sites (any exclusion recorded); gc/user config and
  hardened removal live in one core
- `[ ]` Every confirmed coverage gap has a landed test or a recorded rejection, full suite green; the three product
  edges (symlink guard, version-check timeout/abort, unbalanced-conditional guard) land paired with their tests
- `[ ]` `scripts/classify-change.sh` `HEAVY_CHECK_NAMES` matches the post-matrix CI job names byte-identically in
  the same change that introduces sharding
- `[ ]` All quality gates pass (tests, linting, type checking, build)
- `[ ]` Ready for integration
