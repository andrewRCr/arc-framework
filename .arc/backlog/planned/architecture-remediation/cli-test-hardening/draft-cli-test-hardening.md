# Draft: CLI Test Hardening (coverage-gap cluster)

- **Origin:** [internal] — routed from `BACKLOG-INBOX` at the work-routing-discipline retirement pass
  (2026-06-01). Cohorted with `architecture-remediation` (the other CLI-internal-health WUs) as a logical
  grouping, not a dependency.
- **Purpose:** Close a cluster of lower-priority CLI test-coverage gaps identified during a CLI work unit's
  integration review — edge-case hardening, none blocking.

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
