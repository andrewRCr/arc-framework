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
