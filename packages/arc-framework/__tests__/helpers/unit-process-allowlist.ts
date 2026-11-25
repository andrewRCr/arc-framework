/** Existing unit files with native launches; the controller enforces this shrinking floor. */
export const UNIT_PROCESS_ALLOWLIST = [
  "__tests__/unit/portability-build-selection.test.ts",
  "__tests__/unit/scripts/review-gate/policy/pre-publication-composition.test.ts",
  "__tests__/unit/handlers/delivery-review-fix-release-effects.test.ts",
  "__tests__/unit/work-unit/composed-lifecycle-index.test.ts",
  "__tests__/unit/handlers/view-editor.test.ts",
  "__tests__/unit/handlers/release/commit-cli.test.ts",
  "__tests__/unit/git/process-executor.test.ts",
  "__tests__/unit/fs.test.ts", // Windows-only powershell reader; keep its platform exemption.
] as const;
