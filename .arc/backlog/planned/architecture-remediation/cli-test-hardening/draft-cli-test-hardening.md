# Draft: CLI Test Hardening (coverage-gap cluster)

- **Origin:** [internal] — routed from `BACKLOG-INBOX` at the work-routing-discipline retirement pass
  (2026-06-01). Cohorted with `architecture-remediation` (the other CLI-internal-health WUs) as a logical
  grouping, not a dependency.
- **Purpose:** Close a cluster of lower-priority CLI test-coverage gaps identified during a CLI work unit's
  integration review — edge-case hardening, none blocking.

---

## Inbound Buffer — Pending Integration

> _Routed-in concerns pending holistic integration into the body at this WU's next planning iteration_
> _(`drain-inbox § 5`); each carries its origin. Integrate — or consciously reject — at iteration._

### `[ ]` **Harden e2e temp-repo teardown against the `rmdir` ENOTEMPTY race**

- _Routed from:_ `USER-INBOX § Work Unit` (`WU_Target: cli-test-hardening`), housekeep drain (2026-07-07); captured
  during integration of the unrelated errand `fix/notes-missing-message-scope`, 2026-07-06.
- _Concern:_ `__tests__/e2e/plan.e2e.test.ts > arc plan check > proceeds as JSON on the base branch under partial
  protection` failed on CI (PR #202, run 28808727826, ubuntu) with `Error: ENOTEMPTY: directory not empty, rmdir
  '/tmp/arc-e2e-DCOvEu/.git/info'`. Passed clean on rerun and locally — a temp git-fixture teardown race (rmdir of a
  non-empty `.git/info` during afterEach), not a behavior failure. **Recurrence (2026-07-07):** hit again on PR #206
  (run 28838080399, ubuntu) — same race in `__tests__/e2e/session-init.e2e.test.ts` (a **different** e2e file),
  confirming it's the shared temp-repo teardown, not a per-test issue. Has now flaked two unrelated PRs' merges.
- _Approach:_ Harden the shared e2e temp-repo teardown — recursive/force removal, or a handle-drain /
  removal-ordering fix — rather than product behavior. Distinct from the two flakes already in this WU's buffer
  (shallow-clone git-notes timeout; save/sync notes-push concurrency race): this is a filesystem cleanup race in the
  fixture teardown itself.
- _Update (housekeep drain, 2026-07-13):_ the same class recurred in integration tests as
  `ENOTEMPTY: .git/objects/pack`, with Git auto-gc still writing during teardown. Disable background gc in the
  shared temp-repo factory and/or make recursive removal retry-safe so every test tier inherits the correction.

### `[ ]` **Normalize integration-test architecture around product surfaces**

- _Routed from:_ `USER-INBOX § Work Unit`, housekeep drain (2026-07-13); captured during
  `review-gate-enforcement-cutover` production-composition review.
- _Approach:_ evaluate a coherent `integration/review-gate/` layout named by production surfaces, reusable
  GitHub/Git boundary support, and scenario suites split only at independently navigable behavior. Keep mocks at
  system boundaries and assertions on observable controller outcomes.

### `[ ]` **De-flake the shallow-clone git-notes integration test (under-budgeted 5000ms timeout)**

- _Routed from:_ `USER-INBOX`, 2026-06-09.
- _Concern:_ `__tests__/integration/user.test.ts > user save and load > load finds note-ref history in a shallow
  clone when annotated commit is beyond boundary` timed out at the default 5000ms on CI (observed ~5478ms),
  failing the Full Test Suite on PR #70; passed clean on re-run. The git-notes shallow-clone setup legitimately
  runs close to 5s under CI load, so the per-test timeout is under-budgeted — it will keep flaking intermittently
  across PRs.
- _Approach:_ bump this test's per-test timeout with headroom (e.g. 15–20s), or trim the git setup cost (shallower
  fixture / fewer commits) so it runs well under budget. Prefer a targeted per-test timeout over widening the
  suite default.
- _Scope:_ `packages/arc-framework/__tests__/integration/user.test.ts` (one test); test-reliability hardening,
  fits this WU's cluster (cf. its `writeGitNote` / `readGitNote` entry-point cases).

### `[ ]` **De-flake the `arc save`/sync integration tests under concurrent full-suite runs**

- _Routed from:_ `USER-INBOX § Backlog`, housekeep drain (2026-06-14); captured during Task 1 of
  `lifecycle-state-resolver`.
- _Concern:_ A full `npx vitest run` showed 12 failures across 3 test files, coinciding with stderr warnings from
  `src/handlers/sync.ts` — `Save failed: save verification failed`, `Worktree push skipped because the save step
  failed`, `Notes push skipped because the save step failed`. Two subsequent clean runs passed (2614 passed /
  1 skipped, exit 0), so the save/sync integration tests appear to race on real git state under concurrent
  execution. Distinct from the shallow-clone git-notes timeout entry above: this is a save-verification /
  notes-push concurrency flake.
- _Approach:_ Re-verify the candidate tests in
  `packages/arc-framework/__tests__/integration/{user,multi-clone,status}.test.ts` **and the e2e layer
  `packages/arc-framework/__tests__/e2e/{user,session-init,sync-purity}.e2e.test.ts`** — the same race reproduces
  there: a raw full `npx vitest run` (which globs unit + e2e together at high concurrency, unlike the sanctioned
  `npm test` that runs them under separate configs) showed 12 e2e failures with the identical `Save failed` /
  `Worktree push skipped` / `Notes push skipped` warnings; all pass in isolation and under `npm test`. Then isolate
  each test's save/sync git state (unique tmp repos / refs), or serialize the save/sync group so they do not
  contend on shared git state — covering **both the integration and e2e layers**, not just integration.
- _Update (housekeep drain, 2026-06-17):_ broadened the candidate scope to the e2e layer per a follow-up capture
  from `lifecycle-transition-core` Task 6.7.b.
- _Scope:_ test-reliability hardening; likely integration-test harness isolation rather than product behavior.

---

## Problem / Motivation

Lower-priority test gaps were identified during a CLI work unit's integration review. None are blocking; all are
edge-case hardening. Some partial coverage already exists (`checkLatestVersion`, `render`, `io-context`); many
cases below show no test. **Re-verify each is still a gap before pursuing.**

## Scope (candidate cases — verify, then bundle)

- **Template rendering** — unbalanced `arc:if`/`arc:endif` (stack-underflow recovery), deeply nested
  conditionals, tokens with regex metacharacters.
- **Filesystem edges** — symlinks in `.arc/` (circular, external), `readdir()`/`readFile()` races in
  status/diff, very large `.arc/` performance.
- **Network errors** — `checkLatestVersion` timeout / invalid JSON / partial response.
- **Concurrency** — parallel `init` + `update`, simultaneous multi-developer sync.
- **Entry-point wiring** — `writeGitNote` stdin failures, `readGitNote` with corrupt refs / missing commits,
  spinner lifecycle edge cases.

## Scope Estimate

Small–Medium total; individual items Small. Bundle as one WU rather than ~12 atomics. Non-blocking — sequence at
convenience within the architecture-remediation cohort.
