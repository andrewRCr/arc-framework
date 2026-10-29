/** Cancel one local dispatch while retaining its immutable request and unmet review obligation. */

import { z } from "zod";
import { ReviewIdentifierSchema } from "../core/gate-contract-v2-schema.js";
import { LocalCancelEnvelopeSchema } from "../core/local-cancel-envelope.js";
import { assertLocalReviewClaimBinding } from "../core/local-operation.js";
import type { ForwardReviewReceiptStore, ReviewOperationStateStore } from "../core/ports.js";
import { readAdmittedLocalLaneAttempt, recordLaneAttempt } from "../lane-progress.js";

export const LocalCancelRequestSchema = z.strictObject({
  schemaVersion: z.literal(1),
  operationId: ReviewIdentifierSchema,
});

export interface LocalCancelDependencies {
  withLocalReviewLock<T>(action: () => Promise<T>): Promise<T>;
  operationStore: ReviewOperationStateStore;
  receiptStore: Pick<ForwardReviewReceiptStore, "readReceipts">;
  releaseMaterialization(operationId: string): Promise<void>;
  now(): string;
}

/** Stable durable-state failure at the local cancellation boundary. */
export class LocalCancelCommandError extends Error {
  readonly code = "corrupt-state" as const;

  constructor(message: string) {
    super(message);
    this.name = "LocalCancelCommandError";
  }
}

/** End a pending dispatch without an evaluator result, receipt, or consumed review pass. */
export async function cancelLocalReviewCommand(
  requestInput: unknown,
  dependencies: LocalCancelDependencies,
): Promise<z.infer<typeof LocalCancelEnvelopeSchema>> {
  const request = LocalCancelRequestSchema.parse(requestInput);
  return dependencies.withLocalReviewLock(async () => {
    const persisted = await dependencies.operationStore.readOperation(request.operationId);
    if (persisted.state === null || persisted.state.kind !== "local-review"
      || persisted.state.operationId !== request.operationId) {
      throw new LocalCancelCommandError("local review operation is unavailable");
    }
    const state = persisted.state;
    assertLocalReviewClaimBinding(state);
    const attempt = await readAdmittedLocalLaneAttempt(dependencies.operationStore, state);
    if (attempt === null) {
      throw new LocalCancelCommandError("local review operation is not durably admitted");
    }
    const ledger = await dependencies.receiptStore.readReceipts(state.targetId);
    const receipts = ledger.receipts.filter((receipt) => receipt.requestId === state.requestId);
    if (receipts.length > 1) {
      throw new LocalCancelCommandError("local review operation has multiple terminal receipts");
    }
    const envelope = (cancelled: boolean) => LocalCancelEnvelopeSchema.parse({
      schemaVersion: 1,
      mode: "review-local-cancel",
      diagnostics: [],
      state: cancelled ? "cancelled" : "terminal-operation",
      nextAction: cancelled ? "rerun-review" : "resume-review",
      payload: { operationId: state.operationId, persistedVersion: persisted.version },
    });
    if (receipts.length !== 0 || attempt.outcome !== "pending") {
      // A retry also finishes cleanup if the earlier terminal write outlived its release.
      if (receipts.length === 0 && attempt.outcome === "terminal-failure") {
        await dependencies.releaseMaterialization(state.operationId);
      }
      return envelope(false);
    }
    await recordLaneAttempt(dependencies.operationStore, {
      lane: "standard",
      repositoryId: state.repositoryId,
      changeRequestId: null,
      headSha: state.target.headSha,
      lineage: state.lineage,
      logicalPass: state.logicalPass,
      retryGeneration: state.retryGeneration,
      attemptId: state.operationId,
      sourceId: state.laneSourceId,
      outcome: "terminal-failure",
      consumedPass: false,
      local: attempt.local,
      now: dependencies.now(),
      advancePendingAttempt: true,
    });
    await dependencies.releaseMaterialization(state.operationId);
    return envelope(true);
  });
}
