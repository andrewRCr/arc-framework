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

### `[ ]` **1.3 Route the named helper-level teardowns through the primitive**

- _Goal:_ The three named helper files route every git-backed removal through the 1.1 primitive, and the helpers
  that build git repos without gc-disable get it.

- _Note:_ In `helpers/multi-clone.ts`, route the `setupMultiClone`/`setupWorktreeSiblings` cleanup closures
  (~L197-202, ~L242-247) **and** the `seedOrigin` teardown (~L150, which `git init`s a real seed repo) — currently
  bare `rm` with no `gc.auto 0`. `helpers/in-flight-reshuffle.ts` (~L129-133) and
  `helpers/commit-message-fixture.ts` (~L61) are the same. Route every git-backed removal in these files and close
  the gc-disable gap where they back a git repo.

### `[ ]` **1.4 Inline-site sweep across the test suite**

- _Goal:_ Every git-backed temp-directory teardown outside the factories/helpers routes through the primitive,
  with `gc.auto 0` on the inline-created bare origins; any conscious exclusion is recorded.

- _Context:_ ~68 files match `rm\(.*recursive` under `__tests__/`. The highest-risk sites are inline
  `git init --bare` origins that never received the gc-disable fix — the candidate mechanism for the 2026-07-13
  recurrence: `e2e/session-init.e2e.test.ts` (~L429/L461, ~L579/L613), `integration/status.test.ts`
  (`pushToBareRemote` ~L659, remote removal ~L734; ~15 inline removals total), `integration/user.test.ts` (~22
  `rm` sites), plus the broader inline set enumerated at sweep time.
- **Additional Context:** `notes-cli-test-hardening.md` § Teardown-sweep starting points (grep seed, known
  out-of-factory sites, the five helper-level sites).

    - `[ ]` **1.4.a Enumerate and classify the inline sites**
        - Walk the grep surface; classify each as git-backed (route) or non-git fs fixture (leave). Record the
          classification so exclusions are auditable against Success Criterion 4.

    - `[ ]` **1.4.b Route git-backed removals and gc-disable inline bare origins**
        - Convert git-backed teardowns to the primitive; add `gc.auto 0` to inline-created bare/origin repos.
          Full suite green after the sweep.

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

### `[ ]` **2.1 De-cost the notes-compaction fixture (flake a)**

- _Goal:_ `user-notes-compaction.test.ts` file wall-time drops (absolute, not merely tier share) and the (a)
  signature stops recurring, with the retention assertion preserved.

- _Approach:_ Replace sequential `makeCommit` + `git notes add` + `push` round-trips with synthetic notes-tree
  construction (`makeNotesTreeCommit`-style `hash-object`/`mktree`/`commit-tree`, per `helpers/integration.ts`
  ~L113-158) wherever that preserves the assertion; where a real round-trip is load-bearing, isolate or serialize
  that case and improve its failure diagnostics. Stay within the Decision 10 stop-loss.

### `[ ]` **2.2 Shallow-clone per-test budget (flake c)**

- _Goal:_ The shallow-clone test clears its timeout with headroom without widening the suite default.

- _Note:_ The test `load restores recent note content in a shallow clone when the annotated commit is beyond
  boundary` (`integration/user.test.ts` ~L563-602) runs under the 5s integration default — there is no
  `testTimeout` anywhere in the config except the e2e project's 30s. Observed ~5478ms vs the 5000ms budget.
  Prefer a per-test budget (15-20s) or trimming the 10-commit setup loop (~L575-577) over a suite-default change
  (No-go: suite-default timeout widening).

### `[ ]` **2.3 Re-reproduce and close the save/sync races (flake d)**

- _Goal:_ The recorded save/sync contention no longer reproduces under the current sanctioned invocation.

- _Context:_ Re-run the 12-failure reproduction under the _current_ combined `vitest run` (one run since
  `8b82d0d9d`; the historical contrast is stale). The affected temp dirs are already unique
  per-test, so the race is teardown/background-gc — largely resolved by Phase 1. Confirm the residual, isolate any
  remaining within-test concurrency by construction, and serialize only where isolation is disproportionate
  (recorded as a bounded fallback). Files span `integration/{user,multi-clone,status}.test.ts` and
  `e2e/{user,session-init,sync-purity}.e2e.test.ts`.
- **Additional Context:** `notes-cli-test-hardening.md` § Flake forensics (d) — the repro span and evidence caveat.

---

## **Phase 3:** Unit-tier pool tuning, spike-gated

_Purpose:_ Close the unit-tier overhead gap (~45s aggregate test time → ~87s CI wall under the default
`isolate: true` forks pool) behind a safety spike, and make flake (e) disappear as the falsifiable target.
Delivers Decisions 6 and 7 and Success Criteria 1(e) and 2.

_Design decisions:_ The spike gates the tuning — worker threads cannot `process.chdir()` and module-level state
leaks under `isolate: false`, so relaxing isolation is unsafe until proven. Stop-loss: a negative spike outcome is
recorded and the wall-time criterion is consciously re-targeted (e.g. shard the unit leg), never forced. The
config is a single `vitest.config.ts` with three projects; only the e2e project overrides pool/timeout today.

### `[ ]` **3.1 Isolation-safety spike**

- _Goal:_ A recorded go/no-go on whether the unit tier can safely relax `isolate` / switch pool, grounded in how
  CLI unit tests actually use cwd and process-level state.

- _Approach:_ Probe worker-thread `process.chdir()` behavior and module-level state leakage against the real unit
  suite; use flake (e)'s live reproduction (`__tests__/unit/scripts/validate-config.test.ts`, passes 20/20 in
  isolation) as the spike's concrete case. Output is a decision + evidence, not a config change.

### `[ ]` **3.2 Apply unit-pool tuning (spike-gated)**

- _Goal:_ Unit-tier CI wall approaches its ~45s aggregate test time and flake (e) stops reproducing — or, on a
  negative spike, the criterion is consciously re-targeted per the stop-loss.

- _Note:_ Depends on 3.1. If safe, tune the `unit` project's pool/`isolate` in `vitest.config.ts`; re-measure via
  `vitest run --reporter=json`. If unsafe, record the outcome and re-target Success Criterion 2 (e.g. sharded unit
  leg) — never force unsafe tuning to hit the number.

---

## **Phase 4:** E2E CI sharding & classifier sync

_Purpose:_ Cut e2e wall-clock through CI parallelism rather than per-test optimization (the tier is intrinsically
spawn-bound). Delivers Decision 8 and Success Criterion 6.

_Design decisions:_ A bounded GitHub Actions matrix + vitest `--shard` on the stable post-#253 surface — no
structural workflow rework (No-go). Matrix legs rename the e2e check-runs (a `(<matrix value>)` suffix), and
`scripts/classify-change.sh` `HEAVY_CHECK_NAMES` must stay byte-identical to the CI job names, so the classifier
updates in the same change (Consequences: classifier coupling). Stop-loss: structural leg rework or more than a
bounded couple of in-CI tuning iterations stops and captures the remainder.

### `[ ]` **4.1 Shard the e2e job and sync the classifier**

- _Goal:_ The e2e tier runs sharded across a CI matrix, with `HEAVY_CHECK_NAMES` matching the post-matrix check-run
  names byte-identically in the same change.

- _Context:_ The e2e job is `E2E Tests` (`ci.yml` ~L226, `npm run test:e2e`). `HEAVY_CHECK_NAMES`
  (`scripts/classify-change.sh` ~L97-103) currently lists five names verified byte-identical to their `ci.yml`
  counterparts. No `--shard` or test-splitting matrix exists yet (greenfield).

    - `[ ]` **4.1.a Add the shard matrix + `--shard` invocation**
        - Bounded matrix on the e2e job with `vitest run --project e2e --shard=N/M`; pick the initial shard count
          within the stop-loss.

    - `[ ]` **4.1.b Sync `HEAVY_CHECK_NAMES` to the sharded check-run names**
        - Replace `E2E Tests` in `HEAVY_CHECK_NAMES` with the per-shard check-run names byte-identically — the
          suffix is the matrix value as GitHub renders it (e.g. `E2E Tests (1)` for `shard: [1, 2, 3]`), not an
          assumed `(shard-N)`.
        - Leave the `ci-ok` rollup `needs:` unchanged: a matrix on the `e2e` job keeps the job id `e2e`, so
          `needs: [..., e2e, ...]` already waits on every shard leg — only the check-run display names change (the
          classifier's concern, not the rollup's).

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

### `[ ]` **5.1 Template conditional balance guard (product edge) & token-value edges**

- _Goal:_ Unbalanced `arc:if`/`arc:endif` fails loudly at render time instead of silently mis-scoping installed
  content, and token-value metacharacters are covered.

- _Context:_ `renderConditionals` (`src/lib/template/render.ts` ~L37-71) has no balance validation — a stray
  `arc:endif` or unclosed `arc:if` silently mis-scopes rendered output, an adopter-facing correctness risk with no
  current guard. `renderTokens` (~L16-23) matches token names with a single static `{{WORD}}` regex (names are
  safe); the untested nuance is token _values_ carrying metacharacters/`$` (safe via the replacer callback).

- _Note:_ `renderConditionals` runs against installed content (`init`, manifest apply). Docs that _document_ the
  syntax can carry an example `<!-- arc:if -->` (e.g. `strategy-file-classification.md`), so the guard must not
  false-positive on syntax-documenting content — skip fenced code blocks, or confirm such docs are outside the
  rendered set. Resolve the fence-awareness scope at implementation.

    Build `test-first` (one behavior at a time):

    - an unclosed `arc:if` (missing `arc:endif`) throws with file/line context
    - a stray `arc:endif` (empty include stack) throws with file/line context
    - balanced and nested conditionals still render unchanged (no false positive)
    - a token _value_ containing regex metacharacters/`$` substitutes literally

### `[ ]` **5.2 Filesystem edges & symlink cycle guard (product edge)**

- _Goal:_ `readUserDir` is hardened against symlink cycles and the filesystem-vanish edges are covered.

- _Context:_ `readUserDir` (`src/lib/io-context.ts` ~L137-162) walks with `stat` (follows symlinks), no realpath,
  no visited set, no depth cap — a symlink cycle recurses unbounded; its per-entry `stat` after `readdir` is also
  an unguarded vanish-between-calls path. `runDiff` (`src/commands/diff.ts` ~L75-169) re-reads `currentPath`
  between L122 and the `gitDiff` at ~L153 (a mostly-guarded TOCTOU window).

- _Note:_ The product `readUserDir` is module-private (`src/lib/io-context.ts` ~L137), surfaced only as
  `createUserIOContext().readDir` (~L198); a separate **exported** copy lives in `__tests__/helpers/integration.ts`
  (~L473) and is what `makeUserIO` wires (~L508). Land the guard in the product function and drive the test through
  `createUserIOContext().readDir` — a test through `makeUserIO` would exercise the helper copy and pass while the
  shipped guard is broken. Reconcile the duplicate or explicitly target the product path; resolve which at
  implementation.

    Build `test-first` (one behavior at a time):

    - `readUserDir` (via `createUserIOContext().readDir`) terminates cleanly on a symlink cycle inside `.arc/`
      (realpath/visited-set guard)
    - `readUserDir` tolerates an entry vanishing between `readdir` and `stat`
    - `runDiff` reports a per-file error (non-fatal) when a file vanishes before the diff read

    - _Note:_ The status filesystem-edge coverage targets the real fs loci — the probe implementations under
      `src/lib/status/*` and `src/handlers/status.ts` — not the `commands/status/run.ts` orchestrator (no fs
      calls). Confirm the exact probe surface at implementation.

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
