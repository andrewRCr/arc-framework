/** Bind source-pin cleanup to the selected execution substrate without using it for command ownership. */
import type { GitCommonStatePublisher } from "../../../lib/git-common-state.js";
import type { ForwardReceiptLedger, ReviewOperationStateStore } from "../core/ports.js";
import type { ReviewInvocationInput, ReviewInvocationContext } from "./invocation.js";
import { withRepositoryLocalReviewLock } from "../hosts/local/git-common-state.js";
import { RepositoryLocalReviewSourceSweepAdapter } from "../hosts/local/source-sweep.js";
import { createNativeLocalSourceSweepRecords } from "../hosts/local/source-sweep-records.js";
import { sweepLocalReviewSources } from "../core/local-source-sweep.js";

/** Cleanup observations and actions retained by one local preparation composition. */
export interface LocalReviewSourceSweepContext {
  publisher: GitCommonStatePublisher;
  operationStore: ReviewOperationStateStore;
  readReceipts(targetId: string): Promise<ForwardReceiptLedger>;
  now(): string;
}

/** Enumerate pins first, then inspect their actual retained owners and release completed materializations. */
export async function sweepLocalReviewMaterializations(input: ReviewInvocationInput & ReviewInvocationContext,
  context: LocalReviewSourceSweepContext): Promise<void> {
  const adapter = new RepositoryLocalReviewSourceSweepAdapter(input.exec, input.cwd);
  await withRepositoryLocalReviewLock(input.exec, input.cwd, async () => {
    const operationIds = await adapter.listOperationIds();
    if (operationIds.length === 0) return;
    const records = context.operationStore.stateOffBranch === true
      ? await createNativeLocalSourceSweepRecords({ publisher: context.publisher, store: input.store, projectId: input.projectId })
      : { readOperation: (operationId: string) => context.operationStore.readOperation(operationId) };
    await sweepLocalReviewSources({ listOperationIds: () => Promise.resolve(operationIds), ...records,
      readReceipts: targetId => context.readReceipts(targetId), release: operationId => adapter.releaseWithinLock(operationId),
      now: () => context.now() });
  });
}
