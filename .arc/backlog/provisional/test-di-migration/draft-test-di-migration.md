# Draft: Test DI Migration

- **Purpose:** Move handler/orchestrator unit tests off internal-module mocking toward dependency injection, so the
  quarantined `unit-mocks` vitest tier can rejoin the non-isolated tier.
- **Origin:** routed from `USER-INBOX § Work Unit` at housekeep drain (2026-07-16); captured during
  `cli-test-hardening` module-mock isolation work (2026-07-15).

---

## Inbound Buffer — Pending Integration

### `[ ]` **Back the internal-mocking rule with a lint baseline, across the whole inventory**

- _Routed from:_ `USER-INBOX § Work Unit` ("Consolidate low-value test bulk and back the internal-mocking rule with
  a lint baseline", captured during `test-typecheck-heap` draft-design), 2026-11-05 drain.
- _Shapes:_ § Approach (enforcement alongside the paydown) and § Files (scope beyond the quarantined set).
- _Observation:_ 57 test files `vi.mock` modules under `src/`, 13 of them five or more, and assert which internal
  was called (`unit/sync-orchestrator.test.ts`: 13 internal mocks, 122 of 257 expects are spy-call checks;
  `unit/handlers/lifecycle-verbs.test.ts` 1133–1143). `testing-standards` says "Mock at boundaries; never mock
  internals", and nothing enforces it.
- _Approach:_ an ESLint rule for `vi.mock` of `src/` modules with a recorded baseline, in the
  `eslint-suppressions.json` form the size gate uses, so new internal mocks fail while existing ones are paid down.
  Consider a concrete, example-backed rule for agent-written tests: mining studies find agent commits add mocks at
  higher rates than human ones (Hora and Robbes, MSR 2026, arXiv 2602.00409).
- _Caution (project-manager.ARC, 2026-11-05):_ `unit/sync-orchestrator.test.ts`, the audit's flagship example, mocks
  `commands/user`, `handlers/push-recovery` and `lib/user-sync/branch-bounded-notes-export`, which
  `cutover-notes-removal` deletes. Spend no paydown there before that lands.
- _Evidence:_ `test-typecheck-heap`'s test audit (`test-audit/`), kept outside the repository.

---

## Problem

(Judgment — idiom divergence, not a defect.) The ~15 unit files quarantined into the isolated `unit-mocks` vitest
tier register module-level `vi.mock()` against **internal** application modules (`work-unit/lifecycle-index`,
`work-unit/verbs/*`, `handlers/shared`, `commands/user`, `config/status-reader`, `active/meta-reader`, …), not
just the sanctioned `fs` / `execFile` / time / prompt boundaries. This diverges from the `testing-standards`
method ("mock at boundaries; never mock internals — if that is hard, the interface is wrong; inject
dependencies"). `isolate: true` masked the cost; relaxing isolation surfaced it as hoisted-mock leakage across the
shared worker (now contained by quarantine, not by fixing the mocking style).

## Approach

Evaluate migrating these tests toward DI so they stop module-mocking internal seams — which for several handlers
means the production handler must accept injected dependencies (an `IOContext`-style seam), so this reaches
production plumbing, not just test edits. The design judgment is per-file: some mocks are legitimate handler-seam
mocks (leave isolated) versus ones that should become injected collaborators. Spec-worthy for that reason; success
would let the quarantined files rejoin the non-isolated tier.

## Files

The quarantined set is enumerated in `__tests__/helpers/isolated-unit-mock-files.ts`.
