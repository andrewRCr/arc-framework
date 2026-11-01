/** Command orchestration for re-entering one durable local advisory review. */

import { z } from "zod";
import type { ReviewOutcome } from "../../../lib/store/kinds/review/outcome/schema.js";
import { reviewOutcomeKey } from "../../../lib/store/kinds/review/outcome/key.js";
import { bindEndedLocalReview } from "./local-outcome-source.js";
import { publishLocalReviewReceipt, readLocalReviewReceipts } from "./local-outcome-receipts.js";
import type { LocalReviewState } from "../core/operation-state-schema.js";
import { NativeReviewOperationRefSchema, nativeReviewOperationReferenceMatches } from "../core/review-operation-reference.js";

import {
  validateReviewReceipt,
} from "../core/gate-contract-v2.js";
import {
  ReviewIdentifierSchema,
  type ReviewTarget,
  type ReviewReceiptV2,
} from "../core/gate-contract-v2-schema.js";
import { bindReviewSourceReference, type ReviewSourceReferenceBinding } from "../core/review-source-reference.js";
import { assertLocalReviewClaimBinding } from "../core/local-operation.js";
import type {
  ApprovedDispositionRecordStore,
  ForwardReviewReceiptStore,
  LocalReviewSourceStore,
  ReviewOperationStateStore,
  ReviewOutcomePort,
  ReviewResultReader,
  StoredReviewFact,
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
  operationRef: NativeReviewOperationRefSchema.optional(),
}).refine(request => request.operationRef === undefined
  || nativeReviewOperationReferenceMatches(request.operationRef, request.operationId),
{ path: ["operationRef"], message: "reference must match the requested operation" });

export interface LocalResumeDependencies {
  /** Encode source locators under the invocation's selected storage arm. */
  bindSourceReference?: ReviewSourceReferenceBinding;
  sweep(): Promise<void>;
  withLocalReviewLock<T>(action: () => Promise<T>): Promise<T>;
  operationStore: ReviewOperationStateStore;
  sourceStore: LocalReviewSourceStore;
  receiptStore: ForwardReviewReceiptStore;
  outcomes?: ReviewOutcomePort;
  resultReader: ReviewResultReader;
  dispositionStore: Pick<ApprovedDispositionRecordStore, "readDispositionRecord">;
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
  if (dependencies.outcomes !== undefined) {
    const stored = await dependencies.outcomes.read(request.operationId);
    if (stored?.value.local !== undefined) return resumeEndedLocalReview(request.operationId, stored, persisted.version, dependencies);
  }
  return resumeLocalReviewFromWorkingState(request, dependencies, persisted);
}

async function resumeEndedLocalReview(operationId: string, stored: StoredReviewFact<ReviewOutcome>,
  persistedVersion: number, dependencies: LocalResumeDependencies): Promise<z.infer<typeof LocalResumeEnvelopeSchema>> {
  const outcome = stored.value, local = outcome.local, requirement = outcome.requirement;
  if (outcome.attemptId !== operationId || local === undefined || requirement === undefined) {
    throw new LocalResumeCommandError("local review outcome does not match its admission");
  }
  const replay = bindEndedLocalReview(stored, local, dependencies,
    () => new LocalResumeCommandError("local review source snapshot mismatch"));
  const base = { operationId, persistedVersion, operationRef: replay.operationRef };
  if (local.receipt === undefined) {
    if (outcome.outcome !== "terminal-failure" && outcome.outcome !== "transient-unavailable"
      && outcome.outcome !== "stale-target") throw new LocalResumeCommandError("terminal local review operation has no durable receipt");
    return LocalResumeEnvelopeSchema.parse({ schemaVersion: 1, mode: "review-local-resume", diagnostics: [],
      state: "terminal-operation", nextAction: "rerun-review", payload: { ...base, currentTarget: outcome.target } });
  }
  const receipt = validateReviewReceipt(outcome.target, requirement, local.request, local.receipt);
  const confirmation = await dependencies.confirmTarget(outcome.target);
  if (confirmation.state === "stale-target") return LocalResumeEnvelopeSchema.parse({ schemaVersion: 1,
    mode: "review-local-resume", diagnostics: [], state: "stale-target", nextAction: "prepare-current-target",
    payload: { ...base, attemptedTarget: confirmation.attemptedTarget, currentTarget: confirmation.currentTarget } });
  await replay.readRetainedSource();
  const approved = await validateCompletedLocalDisposition(outcome, dependencies);
  const receiptRef = await replay.receiptReference();
  const payload = { ...base, currentTarget: outcome.target, receiptRef };
  if (receipt.result === "findings" && !approved) return LocalResumeEnvelopeSchema.parse({ schemaVersion: 1,
    mode: "review-local-resume", diagnostics: [], state: "respond-to-findings", nextAction: "respond",
    payload: { ...payload, responsePlan: { schemaVersion: 1, target: outcome.target,
      source: { kind: "attested-local", receiptRef }, findings: receipt.findings } } });
  return LocalResumeEnvelopeSchema.parse({ schemaVersion: 1, mode: "review-local-resume", diagnostics: [],
    state: "review-complete", nextAction: "reduce", payload });
}

async function validateCompletedLocalDisposition(outcome: ReviewOutcome, dependencies: LocalResumeDependencies): Promise<boolean> {
  const disposition = await dependencies.dispositionStore.readDispositionRecord(outcome.attemptId);
  if (outcome.outcome !== "findings" && disposition !== null) {
    throw new LocalResumeCommandError("non-findings receipt has an approved disposition");
  }
  if (outcome.outcome !== "clean" && outcome.outcome !== "findings") return false;
  const result = await dependencies.resultReader.readResult(outcome.attemptId);
  if (result.kind !== "attested-local" || result.originalOutcome !== outcome.outcome
    || result.receiptRef !== reviewOutcomeKey(outcome)) throw new LocalResumeCommandError("local review result snapshot mismatch");
  if (disposition === null) return false;
  try { validateApprovedDispositionRecordForResult(disposition, result); }
  catch { throw new LocalResumeCommandError("local review disposition snapshot mismatch"); }
  return true;
}

async function resumeLocalReviewFromWorkingState(
  request: z.infer<typeof LocalResumeRequestSchema>,
  dependencies: LocalResumeDependencies,
  persisted: Awaited<ReturnType<ReviewOperationStateStore["readOperation"]>>,
): Promise<z.infer<typeof LocalResumeEnvelopeSchema>> {
  if (persisted.state === null
    || persisted.state.kind !== "local-review"
    || persisted.state.operationId !== request.operationId) {
    throw new LocalResumeCommandError("local review operation is unavailable");
  }
  const state = persisted.state;
  const admittedAttempt = await readAdmittedLocalLaneAttempt(dependencies.operationStore, state);
  if (admittedAttempt === null) {
    throw new LocalResumeCommandError("local review operation is not durably admitted");
  }
  assertLocalReviewClaimBinding(state);
  const receiptReference = (durableRef: string) => (dependencies.bindSourceReference ?? bindReviewSourceReference)({
    kind: "attested-local",
    operationId: state.operationId,
    durableRef,
  });
  const ledger = await readLocalReviewReceipts(dependencies, state.targetId);
  const receipts = ledger.receipts.filter((receipt) => receipt.requestId === state.requestId);
  if (receipts.length > 1) {
    throw new LocalResumeCommandError("local review operation has multiple terminal receipts");
  }
  if (receipts.length === 0 && admittedAttempt.outcome !== "pending") {
    if (admittedAttempt.outcome !== "terminal-failure"
      && admittedAttempt.outcome !== "transient-unavailable"
      && admittedAttempt.outcome !== "stale-target") {
      throw new LocalResumeCommandError("terminal local review operation has no durable receipt");
    }
    return LocalResumeEnvelopeSchema.parse({
      schemaVersion: 1,
      mode: "review-local-resume",
      diagnostics: [],
      state: "terminal-operation",
      nextAction: "rerun-review",
      payload: {
        operationId: state.operationId,
        persistedVersion: persisted.version,
        currentTarget: state.target,
      },
    });
  }
  const confirmation = await dependencies.confirmTarget(state.target);
  if (confirmation.state === "stale-target") {
    if (receipts[0] !== undefined) {
      const oldReceipt = validateReviewReceipt(
        state.target, state.requirement, state.request, receipts[0],
      );
      await publishResumeReceipt(dependencies, state, oldReceipt, ledger.ledgerVersion);
    }
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
  const replay = await publishResumeReceipt(dependencies, state, receipt, ledger.ledgerVersion);
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
        receiptRef: await receiptReference(replay.durableEvidenceRef),
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
        receiptRef: await receiptReference(replay.durableEvidenceRef),
        responsePlan: {
          schemaVersion: 1,
          target: state.target,
          source: {
            kind: "attested-local",
            receiptRef: await receiptReference(replay.durableEvidenceRef),
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
      receiptRef: await receiptReference(replay.durableEvidenceRef),
    },
  });
}

async function publishResumeReceipt(dependencies: LocalResumeDependencies, state: LocalReviewState,
  receipt: ReviewReceiptV2, ledgerVersion: number): ReturnType<ForwardReviewReceiptStore["appendReceipt"]> {
  const published = await publishLocalReviewReceipt(dependencies,
    { state, receipt, expectedLedgerVersion: ledgerVersion, now: () => dependencies.now() });
  if (dependencies.outcomes === undefined) await recordLocalReceiptConclusion(dependencies.operationStore,
    { state, receipt, now: dependencies.now() });
  return published;
}
