/** Test files that still run under the in-repo store override, each until it moves onto the ref backend. The list
 * only shrinks: a file leaves it once its cases expect the ref backend or select the in-repo implementation
 * themselves, and the list goes once it is empty. */
import { relative, resolve, sep } from "node:path";
import { afterAll } from "vitest";
import { getCurrentSuite } from "vitest/suite";
import { IN_REPO_STORE_OVERRIDE } from "../../src/lib/store/selection.js";

/** Package-relative paths of the listed test files, sorted. */
export const IN_REPO_STORE_LEDGER: readonly string[] = [
  "__tests__/e2e/candidate-lineage-currentness.e2e.test.ts",
  "__tests__/e2e/candidate-lineage-settlement.e2e.test.ts",
  "__tests__/e2e/candidate-lineage.e2e.test.ts",
  "__tests__/e2e/check-pre-commit-hook.e2e.test.ts",
  "__tests__/e2e/commit-message-consumers.e2e.test.ts",
  "__tests__/e2e/config-validate.e2e.test.ts",
  "__tests__/e2e/cutover-window-after-merge.e2e.test.ts",
  "__tests__/e2e/cutover-window-rehearse.e2e.test.ts",
  "__tests__/e2e/cutover-window.e2e.test.ts",
  "__tests__/e2e/delivery-position.e2e.test.ts",
  "__tests__/e2e/errand.e2e.test.ts",
  "__tests__/e2e/markdown-fix.e2e.test.ts",
  "__tests__/e2e/precompact-locus-anchor.e2e.test.ts",
  "__tests__/e2e/review-candidate-supersession.e2e.test.ts",
  "__tests__/e2e/review-chunking.e2e.test.ts",
  "__tests__/e2e/user.e2e.test.ts",
  "__tests__/integration/active.test.ts",
  "__tests__/integration/archive-staging.test.ts",
  "__tests__/integration/candidate-lineage.test.ts",
  "__tests__/integration/check-projected-selection.test.ts",
  "__tests__/integration/concurrent-write-preconditions.test.ts",
  "__tests__/integration/cutover-window-account.test.ts",
  "__tests__/integration/cutover-window-chain.test.ts",
  "__tests__/integration/cutover-window-check.test.ts",
  "__tests__/integration/cutover-window-cleanliness.test.ts",
  "__tests__/integration/cutover-window-close.test.ts",
  "__tests__/integration/cutover-window-compare.test.ts",
  "__tests__/integration/cutover-window-confirm.test.ts",
  "__tests__/integration/cutover-window-decomposition.test.ts",
  "__tests__/integration/cutover-window-digests.test.ts",
  "__tests__/integration/cutover-window-diverging-copies.test.ts",
  "__tests__/integration/cutover-window-executables.test.ts",
  "__tests__/integration/cutover-window-flip-ancestry.test.ts",
  "__tests__/integration/cutover-window-holders.test.ts",
  "__tests__/integration/cutover-window-identity-inputs.test.ts",
  "__tests__/integration/cutover-window-last-read.test.ts",
  "__tests__/integration/cutover-window-live-state.test.ts",
  "__tests__/integration/cutover-window-lock.test.ts",
  "__tests__/integration/cutover-window-off-host.test.ts",
  "__tests__/integration/cutover-window-preflight.test.ts",
  "__tests__/integration/cutover-window-pull-requests.test.ts",
  "__tests__/integration/cutover-window-read-map.test.ts",
  "__tests__/integration/cutover-window-recompute.test.ts",
  "__tests__/integration/cutover-window-restore-admission.test.ts",
  "__tests__/integration/cutover-window-restore-decision.test.ts",
  "__tests__/integration/cutover-window-restore-leases.test.ts",
  "__tests__/integration/cutover-window-restore.test.ts",
  "__tests__/integration/cutover-window-seals.test.ts",
  "__tests__/integration/cutover-window-stash.test.ts",
  "__tests__/integration/cutover-window-tracked-records.test.ts",
  "__tests__/integration/delivery-disjoint-eligibility.test.ts",
  "__tests__/integration/delivery-position.test.ts",
  "__tests__/integration/errand-promote.test.ts",
  "__tests__/integration/exact-target-read-isolation.test.ts",
  "__tests__/integration/executor-store-rebind.test.ts",
  "__tests__/integration/frontline-target-materialization.test.ts",
  "__tests__/integration/history-shape-ambiguity.test.ts",
  "__tests__/integration/init.test.ts",
  "__tests__/integration/install-symlink-refusal.test.ts",
  "__tests__/integration/local-review-delivery-binding.test.ts",
  "__tests__/integration/local-review-live-context-refusal.test.ts",
  "__tests__/integration/local-review-target-recovery.test.ts",
  "__tests__/integration/locus-sibling-delivery-in-repo.test.ts",
  "__tests__/integration/multi-clone.test.ts",
  "__tests__/integration/notes-export-state-coherence.test.ts",
  "__tests__/integration/park-resume-roundtrip.test.ts",
  "__tests__/integration/pre-publication-correction-proof.test.ts",
  "__tests__/integration/pre-publication-delta.test.ts",
  "__tests__/integration/pre-publication-frontline-policy-skip.test.ts",
  "__tests__/integration/prepublication-delivery-targets.test.ts",
  "__tests__/integration/respond-candidate-lineage.test.ts",
  "__tests__/integration/review-chunking-command.test.ts",
  "__tests__/integration/review-contribution-applicability.test.ts",
  "__tests__/integration/review-extra-pass-continuation.test.ts",
  "__tests__/integration/review-fan-out-lifecycle.test.ts",
  "__tests__/integration/review-lane-read.test.ts",
  "__tests__/integration/review-member-full-final.test.ts",
  "__tests__/integration/review-singleton-local-prepare.test.ts",
  "__tests__/integration/review-status-base-movement.test.ts",
  "__tests__/integration/review-status-errand-base-movement.test.ts",
  "__tests__/integration/review-status-errand-correction.test.ts",
  "__tests__/integration/review-status-errand-fallback.test.ts",
  "__tests__/integration/review-status-errand.test.ts",
  "__tests__/integration/scripts/integration/checkpoint-lifecycle-artifacts.test.ts",
  "__tests__/integration/set-class.test.ts",
  "__tests__/integration/start-dispatch.test.ts",
  "__tests__/integration/status-conflicts-cli.test.ts",
  "__tests__/integration/status-project.test.ts",
  "__tests__/integration/status-store-refresh-cli.test.ts",
  "__tests__/integration/status.test.ts",
  "__tests__/integration/store-imported-seal.test.ts",
  "__tests__/integration/store-in-repo-fixture-sync.test.ts",
  "__tests__/integration/store-lifecycle-storage.test.ts",
  "__tests__/integration/store-ref-init-designation.test.ts",
  "__tests__/integration/store-review-access.test.ts",
  "__tests__/integration/store-sync-admission.test.ts",
  "__tests__/integration/store-sync-derived-status.test.ts",
  "__tests__/integration/store/projection/cli-hooks.test.ts",
  "__tests__/integration/stub-roadmap-staging.test.ts",
  "__tests__/integration/user-inbox-remove.test.ts",
  "__tests__/integration/user.test.ts",
  "__tests__/unit/active/meta-reader-store.test.ts",
  "__tests__/unit/active/meta-reader.test.ts",
  "__tests__/unit/commands/active/roster.test.ts",
  "__tests__/unit/commands/start.test.ts",
  "__tests__/unit/decompose-preflight-handler.test.ts",
  "__tests__/unit/git/worktree-roster.test.ts",
  "__tests__/unit/handlers/active.test.ts",
  "__tests__/unit/handlers/errand-check.test.ts",
  "__tests__/unit/handlers/lifecycle-verbs.test.ts",
  "__tests__/unit/handlers/recover-envelope-boundary.test.ts",
  "__tests__/unit/handlers/release/commit-close.test.ts",
  "__tests__/unit/handlers/release/commit.test.ts",
  "__tests__/unit/handlers/release/push.test.ts",
  "__tests__/unit/handlers/review.test.ts",
  "__tests__/unit/init.test.ts",
  "__tests__/unit/join.test.ts",
  "__tests__/unit/lib/checks/projected-selection.test.ts",
  "__tests__/unit/lib/store/current-work-unit.test.ts",
  "__tests__/unit/release/wu-resolution.test.ts",
  "__tests__/unit/save-load.test.ts",
  "__tests__/unit/scripts/check-foreign-writes.test.ts",
  "__tests__/unit/scripts/integration/checkpoint-delivery-composition.test.ts",
  "__tests__/unit/scripts/integration/merge-composition.test.ts",
  "__tests__/unit/scripts/integration/merge.test.ts",
  "__tests__/unit/scripts/review-gate/policy/hosted-reservation-discharge.test.ts",
  "__tests__/unit/scripts/review-gate/runtime/confirm-delegation.test.ts",
  "__tests__/unit/scripts/review-gate/runtime/local-assurance-dispatch.test.ts",
  "__tests__/unit/scripts/review-gate/runtime/respond-composition.test.ts",
  "__tests__/unit/scripts/review-gate/status-singleton-coverage.test.ts",
  "__tests__/unit/scripts/review-gate/status.test.ts",
  "__tests__/unit/status/run.test.ts",
  "__tests__/unit/sync-orchestrator.test.ts",
  "__tests__/unit/sync.test.ts",
  "__tests__/unit/user-handlers.test.ts",
  "__tests__/unit/user-status.test.ts",
  "__tests__/unit/user-sync-current-wu.test.ts",
  "__tests__/unit/work-unit/executor-context.test.ts",
];

const packageRoot = resolve(import.meta.dirname, "../..");

/** Name the test file being collected, package-relative with forward slashes, from a setup file or a test file's body.
 * @returns The collected file's path, such as `__tests__/unit/example.test.ts`.
 */
export function collectedTestFile(): string {
  return relative(packageRoot, getCurrentSuite().file.filepath).split(sep).join("/");
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
