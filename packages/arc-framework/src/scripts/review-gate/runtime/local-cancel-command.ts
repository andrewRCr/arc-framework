/** Cancel one local dispatch while retaining its immutable request and unmet review obligation. */

import { z } from "zod";
import { ReviewIdentifierSchema } from "../core/gate-contract-v2-schema.js";
import { LocalCancelEnvelopeSchema } from "../core/local-cancel-envelope.js";
import { assertLocalReviewClaimBinding } from "../core/local-operation.js";
import { bindNativeReviewOperationReference, NativeReviewOperationRefSchema, nativeReviewOperationReferenceMatches } from "../core/review-operation-reference.js";
import type { ForwardReviewReceiptStore, ReviewOperationStateStore, ReviewOutcomePort, StoredReviewFact } from "../core/ports.js";
import { readAdmittedLocalLaneAttempt, recordLaneAttempt } from "../lane-progress.js";
import type { ReviewOutcome } from "../../../lib/store/kinds/review/outcome/schema.js";
import { readLocalReviewReceipts } from "./local-outcome-receipts.js";

export const LocalCancelRequestSchema = z.strictObject({
  schemaVersion: z.literal(1),
  operationId: ReviewIdentifierSchema,
  operationRef: NativeReviewOperationRefSchema.optional(),
}).refine(request => request.operationRef === undefined
  || nativeReviewOperationReferenceMatches(request.operationRef, request.operationId),
{ path: ["operationRef"], message: "reference must match the requested operation" });

export interface LocalCancelDependencies {
  withLocalReviewLock<T>(action: () => Promise<T>): Promise<T>;
  operationStore: ReviewOperationStateStore;
  receiptStore: Pick<ForwardReviewReceiptStore, "readReceipts">;
  outcomes?: ReviewOutcomePort;
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

/**
 * An ended native attempt replays from its stored outcome, naming the outcome's owner; only a receiptless failure
 * still owes its cleanup.
 */
async function replayEndedLocalCancel(stored: StoredReviewFact<ReviewOutcome>, local: NonNullable<ReviewOutcome["local"]>,
  dependencies: LocalCancelDependencies): Promise<string> {
  const outcome = stored.value;
  assertLocalReviewClaimBinding(local);
  if (local.receipt === undefined && outcome.outcome === "terminal-failure") {
    await dependencies.releaseMaterialization(outcome.attemptId);
  }
  return bindNativeReviewOperationReference({ operationId: outcome.attemptId,
    repositoryId: outcome.target.repositoryId, workItem: stored.reference.owner });
}

/** End a pending dispatch without an evaluator result, receipt, or consumed review pass. */
export async function cancelLocalReviewCommand(
  requestInput: unknown,
  dependencies: LocalCancelDependencies,
): Promise<z.infer<typeof LocalCancelEnvelopeSchema>> {
  const request = LocalCancelRequestSchema.parse(requestInput);
  return dependencies.withLocalReviewLock(async () => {
    const persisted = await dependencies.operationStore.readOperation(request.operationId);
    const envelope = (cancelled: boolean, operationRef?: string) => LocalCancelEnvelopeSchema.parse({
      schemaVersion: 1,
      mode: "review-local-cancel",
      diagnostics: [],
      state: cancelled ? "cancelled" : "terminal-operation",
      nextAction: cancelled ? "rerun-review" : "resume-review",
      payload: { operationId: request.operationId, persistedVersion: persisted.version,
        ...(operationRef === undefined ? {} : { operationRef }) },
    });
    const stored = await dependencies.outcomes?.read(request.operationId);
    if (stored?.value.local !== undefined) {
      return envelope(false, await replayEndedLocalCancel(stored, stored.value.local, dependencies));
    }
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
    const ledger = await readLocalReviewReceipts(dependencies, state.targetId);
    const receipts = ledger.receipts.filter((receipt) => receipt.requestId === state.requestId);
    if (receipts.length > 1) {
      throw new LocalCancelCommandError("local review operation has multiple terminal receipts");
    }
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
      localOutcome: { state },
      local: attempt.local,
      now: dependencies.now(),
      advancePendingAttempt: true,
    });
    await dependencies.releaseMaterialization(state.operationId);
    return envelope(true);
  });
}
