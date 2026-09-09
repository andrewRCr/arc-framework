/** Command orchestration for re-entering one durable local advisory review. */

import { z } from "zod";

import {
  validateReviewReceipt,
} from "../core/gate-contract-v2.js";
import {
  ReviewIdentifierSchema,
  type ReviewTarget,
} from "../core/gate-contract-v2-schema.js";
import { bindReviewSourceReference } from "../core/review-source-reference.js";
import type {
  ApprovedDispositionRecordStore,
  ForwardReviewReceiptStore,
  LocalReviewSourceStore,
  ReviewOperationStateStore,
  ReviewResultReader,
} from "../core/ports.js";
import { validateApprovedDispositionRecordForResult } from
  "../core/review-result-disposition.js";
import { LocalResumeEnvelopeSchema } from "../core/review-command-envelope.js";
import {
  readAdmittedLocalLaneAttempt,
  recordLocalReceiptConclusion,
} from "../lane-progress.js";
import type { LocalTargetConfirmation } from "../hosts/local/repository-target.js";

export const LocalResumeRequestSchema = z.strictObject({
  schemaVersion: z.literal(1),
  operationId: ReviewIdentifierSchema,
});

export interface LocalResumeDependencies {
  sweep(): Promise<void>;
  withLocalReviewLock<T>(action: () => Promise<T>): Promise<T>;
  operationStore: ReviewOperationStateStore;
  sourceStore: LocalReviewSourceStore;
  receiptStore: ForwardReviewReceiptStore;
  resultReader: ReviewResultReader;
  dispositionStore: ApprovedDispositionRecordStore;
  confirmTarget(target: ReviewTarget): Promise<LocalTargetConfirmation>;
  materialize(
    source: NonNullable<Awaited<ReturnType<LocalReviewSourceStore["readSource"]>>>,
  ): Promise<{ reviewRoot: string }>;
  now(): string;
}

/** Stable durable-state failure at the local resume boundary. */
export class LocalResumeCommandError extends Error {
  readonly code = "corrupt-state" as const;

  constructor(message: string) {
    super(message);
    this.name = "LocalResumeCommandError";
  }
}

/** Reconstruct the next local review action from immutable admission and durable publications. */
export async function resumeLocalReviewCommand(
  requestInput: unknown,
  dependencies: LocalResumeDependencies,
): Promise<z.infer<typeof LocalResumeEnvelopeSchema>> {
  const request = LocalResumeRequestSchema.parse(requestInput);
  await dependencies.sweep();
  return dependencies.withLocalReviewLock(() => resumeLocalReviewWithinLocalReviewLock(request, dependencies));
}

async function resumeLocalReviewWithinLocalReviewLock(
  request: z.infer<typeof LocalResumeRequestSchema>,
  dependencies: LocalResumeDependencies,
): Promise<z.infer<typeof LocalResumeEnvelopeSchema>> {
  const persisted = await dependencies.operationStore.readOperation(request.operationId);
  if (persisted.state === null
    || persisted.state.kind !== "local-review"
    || persisted.state.operationId !== request.operationId) {
    throw new LocalResumeCommandError("local review operation is unavailable");
  }
  const state = persisted.state;
  if (await readAdmittedLocalLaneAttempt(dependencies.operationStore, state) === null) {
    throw new LocalResumeCommandError("local review operation is not durably admitted");
  }
  const receiptReference = (durableRef: string) => bindReviewSourceReference({
    kind: "attested-local",
    operationId: state.operationId,
    durableRef,
  });
  const confirmation = await dependencies.confirmTarget(state.target);
  if (confirmation.state === "stale-target") {
    return LocalResumeEnvelopeSchema.parse({
      schemaVersion: 1,
      mode: "review-local-resume",
      diagnostics: [],
      state: "stale-target",
      nextAction: "prepare-current-target",
      payload: {
        operationId: state.operationId,
        persistedVersion: persisted.version,
        attemptedTarget: confirmation.attemptedTarget,
        currentTarget: confirmation.currentTarget,
      },
    });
  }
  const source = await dependencies.sourceStore.readSource(state.sourceRef);
  if (source === null
    || source.sourceDigest !== state.sourceDigest
    || source.repositoryId !== state.repositoryId
    || source.targetId !== state.targetId) {
    throw new LocalResumeCommandError("local review source snapshot mismatch");
  }
  const ledger = await dependencies.receiptStore.readReceipts(state.targetId);
  const receipts = ledger.receipts.filter((receipt) => receipt.requestId === state.requestId);
  if (receipts.length > 1) {
    throw new LocalResumeCommandError("local review operation has multiple terminal receipts");
  }
  if (receipts.length === 0) {
    const now = Date.parse(dependencies.now());
    const admittedAt = Date.parse(state.updatedAt);
    if (!Number.isFinite(now) || !Number.isFinite(admittedAt)) {
      throw new LocalResumeCommandError("invalid local review cleanup clock");
    }
    if (now >= admittedAt + state.cleanupTtlMs) {
      return LocalResumeEnvelopeSchema.parse({
        schemaVersion: 1,
        mode: "review-local-resume",
        diagnostics: [],
        state: "expired",
        nextAction: "rerun-review",
        payload: {
          operationId: state.operationId,
          persistedVersion: persisted.version,
          currentTarget: state.target,
        },
      });
    }
    await dependencies.materialize(source);
    return LocalResumeEnvelopeSchema.parse({
      schemaVersion: 1,
      mode: "review-local-resume",
      diagnostics: [],
      state: "suspended",
      nextAction: "wait",
      payload: {
        operationId: state.operationId,
        persistedVersion: persisted.version,
        currentTarget: state.target,
      },
    });
  }
  const receipt = validateReviewReceipt(
    state.target,
    state.requirement,
    state.request,
    receipts[0],
  );
  const replay = await dependencies.receiptStore.appendReceipt(receipt, ledger.ledgerVersion);
  await recordLocalReceiptConclusion(dependencies.operationStore, {
    state,
    receipt,
    now: dependencies.now(),
  });
  const disposition = await dependencies.dispositionStore.readDispositionRecord(state.operationId);
  if (receipt.result !== "findings") {
    if (disposition !== null) {
      throw new LocalResumeCommandError("non-findings receipt has an approved disposition");
    }
    if (receipt.result === "clean") {
      const result = await dependencies.resultReader.readResult(state.operationId);
      if (result.kind !== "attested-local"
        || result.originalOutcome !== "clean"
        || result.receiptRef !== replay.durableEvidenceRef) {
        throw new LocalResumeCommandError("local review result snapshot mismatch");
      }
    }
    return LocalResumeEnvelopeSchema.parse({
      schemaVersion: 1,
      mode: "review-local-resume",
      diagnostics: [],
      state: "review-complete",
      nextAction: "reduce",
      payload: {
        operationId: state.operationId,
        persistedVersion: persisted.version,
        currentTarget: state.target,
        receiptRef: receiptReference(replay.durableEvidenceRef),
      },
    });
  }
  const result = await dependencies.resultReader.readResult(state.operationId);
  if (result.kind !== "attested-local"
    || result.originalOutcome !== "findings"
    || result.receiptRef !== replay.durableEvidenceRef) {
    throw new LocalResumeCommandError("local review result snapshot mismatch");
  }
  if (disposition === null) {
    return LocalResumeEnvelopeSchema.parse({
      schemaVersion: 1,
      mode: "review-local-resume",
      diagnostics: [],
      state: "respond-to-findings",
      nextAction: "respond",
      payload: {
        operationId: state.operationId,
        persistedVersion: persisted.version,
        currentTarget: state.target,
        receiptRef: receiptReference(replay.durableEvidenceRef),
        responsePlan: {
          schemaVersion: 1,
          target: state.target,
          source: {
            kind: "attested-local",
            receiptRef: receiptReference(replay.durableEvidenceRef),
          },
          findings: receipt.findings,
        },
      },
    });
  }
  try {
    validateApprovedDispositionRecordForResult(disposition, result);
  } catch {
    throw new LocalResumeCommandError("local review disposition snapshot mismatch");
  }
  return LocalResumeEnvelopeSchema.parse({
    schemaVersion: 1,
    mode: "review-local-resume",
    diagnostics: [],
    state: "review-complete",
    nextAction: "reduce",
    payload: {
      operationId: state.operationId,
      persistedVersion: persisted.version,
      currentTarget: state.target,
      receiptRef: receiptReference(replay.durableEvidenceRef),
    },
  });
}
