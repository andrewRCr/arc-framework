/** Classification and release choreography for abandoned local review pins. */

import type {
  ForwardReceiptLedger,
} from "./ports.js";
import type {
  ReviewOperationState,
} from "./operation-state-schema.js";

export interface LocalSourceSweepDependencies {
  listOperationIds(): Promise<string[]>;
  readOperation(operationId: string): Promise<{
    version: number;
    state: ReviewOperationState | null;
  }>;
  readReceipts(targetId: string): Promise<ForwardReceiptLedger>;
  release(operationId: string): Promise<void>;
  now(): string;
}

export interface LocalSourceSweepResult {
  reaped: Array<{
    operationId: string;
    reason: "orphan" | "terminally-expired";
  }>;
}

/** Reap only absent-record pins or expired local operations without a complete receipt. */
export async function sweepLocalReviewSources(
  dependencies: LocalSourceSweepDependencies,
): Promise<LocalSourceSweepResult> {
  const now = Date.parse(dependencies.now());
  if (!Number.isFinite(now)) throw new Error("invalid local source sweep clock");
  const reaped: LocalSourceSweepResult["reaped"] = [];
  for (const operationId of await dependencies.listOperationIds()) {
    const persisted = await dependencies.readOperation(operationId);
    if (persisted.state === null) {
      await dependencies.release(operationId);
      reaped.push({ operationId, reason: "orphan" });
      continue;
    }
    if (persisted.state.kind !== "local-review") continue;
    const state = persisted.state;
    const updatedAt = Date.parse(state.updatedAt);
    if (!Number.isFinite(updatedAt) || now < updatedAt + state.cleanupTtlMs) continue;
    const ledger = await dependencies.readReceipts(state.targetId);
    const receiptComplete = ledger.receipts.some(
      (receipt) => receipt.requestId === state.requestId,
    );
    if (receiptComplete) continue;
    await dependencies.release(operationId);
    reaped.push({ operationId, reason: "terminally-expired" });
  }
  return { reaped };
}
