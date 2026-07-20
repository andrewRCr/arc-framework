/**
 * Unit test files that register module-level `vi.mock()` against internal
 * application modules (not just the sanctioned `fs`/`execFile`/time/prompt
 * boundaries). A hoisted `vi.mock` swaps the module in the worker's registry;
 * with per-file isolation that swap is scoped to its file, but under a shared
 * (non-isolated) worker it persists and leaks into any later file that imports
 * the real module — producing order-dependent, worker-assignment-dependent
 * failures in unrelated tests.
 *
 * These files therefore run in a dedicated isolated project tier (`unit-mocks`),
 * quarantined from the non-isolated `unit` tier so their mocks can never cross a
 * file boundary. The `isolated-mock-files.guard.test.ts` guard fails if this list
 * drifts from the actual set of module-mocking unit files, so a newly added
 * module mock cannot silently land in the non-isolated tier and re-introduce the
 * leak.
 *
 * Paths are relative to the package root — they double as vitest include/exclude
 * globs.
 */
export const ISOLATED_UNIT_MOCK_FILES = [
  "__tests__/unit/handlers-shared.test.ts",
  "__tests__/unit/handlers/errand-check.test.ts",
  "__tests__/unit/handlers/lifecycle-verbs.test.ts",
  "__tests__/unit/handlers/lifecycle.test.ts",
  "__tests__/unit/handlers/start.test.ts",
  "__tests__/unit/init.test.ts",
  "__tests__/unit/notes-reconcile-push.test.ts",
  "__tests__/unit/paired-push.test.ts",
  "__tests__/unit/push-fetch.test.ts",
  "__tests__/unit/push-recovery.test.ts",
  "__tests__/unit/reconfigure.test.ts",
  "__tests__/unit/sync-orchestrator.test.ts",
  "__tests__/unit/sync.test.ts",
  "__tests__/unit/user-handlers.test.ts",
  "__tests__/unit/work-unit/executor-context.test.ts",
] as const;
