# Draft: Sync Handler Decomposition

## Problem / Motivation

`src/handlers/sync.ts` blends multiple responsibilities under a single module surface:
pure matrix decision logic, config / prompt-policy normalization, runtime execution, JSON
envelope assembly, output rendering, and exit-code handling. Documented in
`analysis-cli-architecture-solid-dry-audit.md` § P1 (sync handler responsibilities).

Specifically:

- `decideMatrix(...)`, `decideWorktree(...)`, `decideNotes(...)`, and `cellNameFor(...)`
  are pure policy embedded as private handler helpers.
- `execute(...)`, `executeBlockedWorktree(...)`, `executePaired(...)`, and
  `executeSingleLeg(...)` own runtime side effects.
- Rendering helpers (`renderPairedResult(...)`, `renderPairedNotesOutcome(...)`,
  `worktreeBlockGuidance(...)`, `reconcileGuidance(...)`) live in the same module.

The corresponding test files
(`__tests__/unit/sync.test.ts`, `__tests__/unit/sync-orchestrator.test.ts`) compensate by
mocking filesystem access, Clack prompts, user command helpers, resolved settings,
worktree status, push recovery, shared handler helpers, path resolution, and user IO
context — see audit § P1 (handler tests need heavy module mocks) and § P1 (delegation-
topology assertions). Tests pass while real composed modules can drift apart.

**Why this matters.** Extending release wrappers or handoff sync behavior accumulates
pressure on an already-broad handler. Interlock Release Wrappers WU1 Phase 5 retrofits
audit-log writes into this handler at fixed points — mechanical addition, but lands in a
wide module. Pure policy is hard to reuse from other commands because it is private to a
handler. Tests of policy details have to route through handler-level orchestration.

## Approach

Extract by responsibility:

1. **Pure matrix and outcome types** → neutral module under `lib/sync/`. Imported by both
   the handler and any future consumers (e.g., release-wrapper sync interlock surface).
2. **Runtime execution** → command / service layer that consumes a matrix decision and
   injected IO / output adapters. Side effects isolated; testable without process
   globals.
3. **Rendering** → either a co-located renderer module or absorbed into the handler if
   the surface stays small after extraction. PRD-time call.
4. **Handler stays thin** — Commander wiring, adapter assembly, exit-code translation.

Test architecture follows the new module boundaries:

- Pure-module unit tests for matrix and outcome shapes — direct imports, no `vi.mock`
  on internal modules.
- Command-layer tests for runtime execution against fake adapters.
- Thin handler test for CLI adapter behavior, output mode, prompts, and exit codes.

## Scope

### In scope

- Extract pure matrix logic from `src/handlers/sync.ts` to `src/lib/sync/matrix.ts` (or
  similar neutral module).
- Extract runtime execution to `src/commands/sync/execute.ts` (or similar) with injected
  IO adapters.
- Restructure `__tests__/unit/sync.test.ts` and `__tests__/unit/sync-orchestrator.test.ts`
  to follow the new module boundaries.
- Fold P2 DRY findings from the audit (manifest helpers, ref helpers) into this work
  where they touch the sync surface, rather than tracking as a separate plan.

### Out of scope

- User-sync module split (`plan-user-sync-module-split.md`) — separate plan, separate WU.
- Behavioral changes to sync semantics, matrix outcomes, or output contracts.
- Lib-layer type extraction (`plan-lib-layer-type-extraction.md`) — separate plan; this
  work composes against whatever neutral types exist at execution time.

## Sibling Work Units

- Plan A (`plan-lib-layer-type-extraction.md`) — independent, but ideally lands first so
  this work targets neutral types directly. If Plan A is in flight concurrently,
  coordinate imports across PRs.
- Plan C (`plan-user-sync-module-split.md`) — independent file scope; safe to run in
  parallel.

## Scope Estimate

**Medium.** ~3-5 sessions ballpark.

- Matrix extraction + tests: ~1 session.
- Execution-layer extraction + tests: ~1.5 sessions.
- Handler thinning + adapter tests: ~1 session.
- Verification + buffer: ~1 session.

**Sequencing.** Defer past the parallelism trio (Worktree Foundation + Agile WU
Lifecycle + Concurrent Work Conventions) and Coord Probe per
`analysis-cli-architecture-solid-dry-audit.md` § Sequencing Considerations. Parallel
candidate with Plans A and C once worktree infrastructure unlocks parallel WUs.

---
