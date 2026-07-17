# Draft: Test DI Migration

- **Purpose:** Move handler/orchestrator unit tests off internal-module mocking toward dependency injection, so the
  quarantined `unit-mocks` vitest tier can rejoin the non-isolated tier.
- **Origin:** routed from `USER-INBOX § Work Unit` at housekeep drain (2026-07-16); captured during
  `cli-test-hardening` module-mock isolation work (2026-07-15).

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
