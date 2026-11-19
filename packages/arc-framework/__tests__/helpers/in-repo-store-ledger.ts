/** Test files that still run under the in-repo store override, each until it moves onto the ref backend. The list
 * only shrinks: a file leaves it once its cases expect the ref backend or select the in-repo implementation
 * themselves, and the list goes once it is empty. */
import { relative, resolve, sep } from "node:path";
import { afterAll, TestRunner } from "vitest";
import { IN_REPO_STORE_OVERRIDE } from "../../src/lib/store/selection.js";

/** Package-relative paths of the listed test files, sorted. */
export const IN_REPO_STORE_LEDGER: readonly string[] = [
  "__tests__/e2e/candidate-lineage-currentness.e2e.test.ts",
  "__tests__/e2e/candidate-lineage-settlement.e2e.test.ts",
  "__tests__/e2e/candidate-lineage.e2e.test.ts",
  "__tests__/e2e/commit-message-consumers.e2e.test.ts",
  "__tests__/e2e/delivery-position.e2e.test.ts",
  "__tests__/e2e/errand.e2e.test.ts",
  "__tests__/e2e/markdown-fix.e2e.test.ts",
  "__tests__/e2e/precompact-locus-anchor.e2e.test.ts",
  "__tests__/e2e/review-candidate-supersession.e2e.test.ts",
  "__tests__/e2e/review-chunking.e2e.test.ts",
  "__tests__/e2e/user.e2e.test.ts",
  "__tests__/integration/candidate-lineage.test.ts",
  "__tests__/integration/delivery-position.test.ts",
  "__tests__/integration/history-shape-ambiguity.test.ts",
  "__tests__/integration/review-fan-out-lifecycle.test.ts",
  "__tests__/integration/review-member-full-final.test.ts",
  "__tests__/integration/review-status-base-movement.test.ts",
  "__tests__/integration/review-status-errand-base-movement.test.ts",
  "__tests__/integration/start-dispatch.test.ts",
  "__tests__/unit/commands/start.test.ts",
  "__tests__/unit/handlers/lifecycle-verbs.test.ts",
];

const packageRoot = resolve(import.meta.dirname, "../..");

/** Name the test file being collected, package-relative with forward slashes, from a setup file or a test file's body.
 * @returns The collected file's path, such as `__tests__/unit/example.test.ts`.
 */
export function collectedTestFile(): string {
  return relative(packageRoot, TestRunner.getCurrentSuite().file.filepath).split(sep).join("/");
}

/** Set the override in this process before a listed file composes a store, and restore the prior value after the file.
 * Called from a setup file, before the test file loads, so the stores the file composes and the processes it starts all
 * build the in-repo implementation.
 * @param ledger - The listed files; the shared list unless a test supplies its own.
 */
export function applyInRepoStoreLedger(ledger: readonly string[] = IN_REPO_STORE_LEDGER): void {
  if (!ledger.includes(collectedTestFile())) return;
  const previous = process.env[IN_REPO_STORE_OVERRIDE];
  process.env[IN_REPO_STORE_OVERRIDE] = "1";
  afterAll(() => {
    if (previous === undefined) Reflect.deleteProperty(process.env, IN_REPO_STORE_OVERRIDE);
    else process.env[IN_REPO_STORE_OVERRIDE] = previous;
  });
}
