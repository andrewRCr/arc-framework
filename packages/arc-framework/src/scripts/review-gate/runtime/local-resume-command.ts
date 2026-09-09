/** Command orchestration for re-entering one durable local advisory review. */

import { z } from "zod";

import { canonicalize } from "../../../lib/kernel/index.js";
import { reviewerDispositionNit, reviewerDispositionSeverity } from "../core/disposition-records.js";
import { ApprovedDispositionRecordSchema } from "../core/advisory-records.js";
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
} from "../core/ports.js";
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
  if (receipt.result !== "findings") {
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
  const disposition = await dependencies.dispositionStore.readDispositionRecord(state.operationId);
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
  const approved = ApprovedDispositionRecordSchema.parse(disposition);
  const approvedSet = approved.approvedDisposition.dispositionSet;
  const receiptFindings = receipt.findings.map((finding) => ({
    findingId: finding.findingId,
    locus: finding.locus,
    severity: finding.severity,
    nit: finding.nit === true,
  }));
  const dispositionFindings = approvedSet.findings.map((finding) => ({
    findingId: finding.findingId,
    locus: finding.locus,
    severity: reviewerDispositionSeverity(finding),
    nit: reviewerDispositionNit(finding) === true,
  }));
  if (approved.repositoryId !== state.repositoryId
    || approved.operationId !== state.operationId
    || approved.source.kind !== "attested-local"
    || approved.source.receiptRef !== receiptReference(replay.durableEvidenceRef)
    || approved.source.localSourceRef !== state.sourceRef
    || approvedSet.targetId !== state.targetId
    || approvedSet.policyVersion !== state.policyVersion
    || approvedSet.rubricVersion !== state.requirement.rubricVersion
    || approvedSet.rubricDigest !== state.requirement.rubricDigest
    || canonicalize(dispositionFindings) !== canonicalize(receiptFindings)) {
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
