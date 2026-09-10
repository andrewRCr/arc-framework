# Notes: test-suite-right-sizing

## Contents

- [Suite composition](#suite-composition)
- [Timeout ceilings and load](#timeout-ceilings-and-load)
- [Per-test rubric provenance](#per-test-rubric-provenance)
- [Mutation testing](#mutation-testing)
- [Successor input: in-process spines](#successor-input-in-process-spines)
- [Sibling coordination detail](#sibling-coordination-detail)

## Suite composition

Static counts taken on `main` at `3cebbab1a`; `it.each` matrices understate executed cases, so take live counts
from the cost instrument.

- **E2E subprocess call sites:** ~1,018 across 53 files — 430 `runArc` (160 of them `--json`), 142 stdin/stdout
  pipe variants, 90 explicit non-TTY, 36 anchored-shell sequences.
- **TTY wrapper:** only 6 E2E files assert on interactive TTY output, yet every non-JSON `runArc` on Linux is
  wrapped in `script` for a pseudo-TTY. Measured as negligible overhead — a complexity lever, not a cost one.
- **`command-input-no-input`:** a 150-line, two-declaration `it.each` matrix whose every entry rebuilds a full
  fixture (init, stub, bare remote, push) and runs three CLI invocations; it took 325 s in one CI leg.
- **Shape is within published norms:** test-to-source LOC ~1.3:1; case split 82/11/4 across unit / integration /
  E2E (Google's practiced ~80/15/5; the Rails-community 1:1–1:2 LOC band). Per-test cost in the slow tiers is the
  problem, not the pyramid.
- **Standards-compliance counts** (orthogonal to cost; input to the hygiene work unit): 1,378 spy-call assertions
  (904 in 20 files); 162 internal-module `vi.mock` targets (owned by `test-di-migration`); 510 of 683 unit files
  not path-mirrored to a source file.

## Timeout ceilings and load

- Integration and E2E run under a 30 s `testTimeout`; the CLI spawn helper defaults to 10 s.
- E2E subprocess load runs at roughly four logical CPUs per Vitest worker.
- Under machine load, a sibling work unit found every failure in one captured run was a timeout. Load-relative
  timeout policy belongs to `test-suite-contention-hardening`; the instrument's headroom and slot-wait data are
  its input.

## Per-test rubric provenance

The D7 rubric derives from Khorikov's four pillars of a good unit test and Google's unit-testing guidance (an
unclear test's coverage is already fictional — delete). The coverage-minimization figure — roughly 80% size
reduction costing roughly 48% of fault detection — is the replicated Rothermel et al. finding on coverage-based
suite minimization. Sources were consumed into the draft without preserved citations; re-run a light research
pass if a `notes-*` or completion record needs them.

## Mutation testing

Stryker Mutator: open source, Apache-2.0; `@stryker-mutator/core` plus `@stryker-mutator/vitest-runner`, not
installed. Setup is an hour or two; the cost is runtime, since each mutant re-runs the covering tests and the
Vitest runner is single-threaded. Adopted only on the D7 trigger, on the affected pair, never across the corpus,
never in CI; uninstalled at verification with any config file retained.

## Successor input: in-process spines

The largest E2E files are lifecycle spines that spawn the CLI dozens of times per scenario — `delivery-position`
(4,170 LOC), `candidate-lineage`, `errand`, `session-init`. Where a scenario only needs handler-seam outcomes,
integration can drive the verb cores through CLI-generated inputs (`testing-standards` sanctions that seam) at a
fraction of the cost, keeping one real-spawn smoke per verb and destructive verbs at E2E. A general in-process
harness (invoking the entry in-process with captured stdio and per-test cwd) removes spawn cost wholesale but
carries process-isolation risk under Vitest's pools. Routed to `in-process-cli-harness`; its remaining prize must
be re-derived after D4 removes ~42% of per-spawn cost.

## Sibling coordination detail

- `evidence-applicability` — its principle, _evidence applicability follows covered content_ judged over one typed
  path-treatment delta with a `carries | supplemental | fresh` answer, is the same cut D1 makes for test tiers at
  the run level. Its verification scaling (`targeted` / `focused` / `full`) governs when a repeat is owed; this
  work unit governs what a run costs and which tiers it must include. Distinct questions; keep them so.
- `session-init-performance` — overlapping measurement of `arc status --session-init` wall clock only; that work
  is about bounding git work in the probe, not module loading.
- `quality-gate-hooks` records `Depends On: class-model-foundation`, which has shipped; the dependency is stale
  but does not affect this work unit.
- Assumes the merge gate's required CI checks remain the enforcement of the E2E tier; the local lane is safe only
  while that holds.
