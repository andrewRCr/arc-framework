/** Command orchestration for one local advisory review attestation. */

import { z } from "zod";

import { canonicalize } from "../../../lib/kernel/index.js";
import {
  ReviewIdentifierSchema,
  type ReviewReceiptV2,
  type ReviewTarget,
} from "../core/gate-contract-v2-schema.js";
import { bindReviewSourceReference } from "../core/review-source-reference.js";
import {
  NormalizedLocalReviewResultSchema,
} from "../core/local-review-result.js";
import type { LocalReviewAuthority } from "../core/local-review-authority.js";
import type { LocalReviewState } from "../core/operation-state-schema.js";
import type {
  ForwardReviewReceiptStore,
  LocalReviewSourceStore,
  ReviewOperationStateStore,
} from "../core/ports.js";
import { LocalAttestEnvelopeSchema } from "../core/review-command-envelope.js";
import {
  isReviewVersionConflict,
  REVIEW_VERSION_RETRY_ATTEMPTS,
} from "../core/version-conflict.js";
import type { LocalTargetConfirmation } from "../hosts/local/repository-target.js";
import { createLocalReviewReceipt } from "./local-attestation.js";

export const LocalAttestRequestSchema = z.strictObject({
  schemaVersion: z.literal(1),
  operationId: ReviewIdentifierSchema,
  result: NormalizedLocalReviewResultSchema,
});

export interface LocalAttestDependencies {
  withSourceLock<T>(action: () => Promise<T>): Promise<T>;
  operationStore: ReviewOperationStateStore;
  sourceStore: LocalReviewSourceStore;
  receiptStore: ForwardReviewReceiptStore;
  resolveAuthority(evaluatorIdentity: string): Promise<LocalReviewAuthority>;
  resolveGuidanceDigest(authority: LocalReviewAuthority, state: LocalReviewState): Promise<string>;
  confirmTarget(target: ReviewTarget): Promise<LocalTargetConfirmation>;
  inspectMaterialization(source: NonNullable<Awaited<ReturnType<LocalReviewSourceStore["readSource"]>>>): Promise<
    "materialized" | "absent"
  >;
  releaseMaterialization(operationId: string): Promise<void>;
}

/** Stable request or durable-state failure at the local attestation boundary. */
export class LocalAttestCommandError extends Error {
  constructor(
    readonly code: "invalid-input" | "corrupt-state",
    message: string,
  ) {
    super(message);
    this.name = "LocalAttestCommandError";
  }
}

async function appendReceiptWithRetry(
  store: ForwardReviewReceiptStore,
  receipt: ReviewReceiptV2,
  initialLedgerVersion: number,
): ReturnType<ForwardReviewReceiptStore["appendReceipt"]> {
  let expectedLedgerVersion = initialLedgerVersion;
  for (let attempt = 0; attempt < REVIEW_VERSION_RETRY_ATTEMPTS; attempt += 1) {
    try {
      return await store.appendReceipt(receipt, expectedLedgerVersion);
    } catch (error) {
      if (!isReviewVersionConflict(error)) throw error;
    }
    const reloaded = await store.readReceipts(receipt.targetId);
    const terminalReceipts = reloaded.receipts.filter((candidate) => candidate.requestId === receipt.requestId);
    if (terminalReceipts.length > 1) {
      throw new LocalAttestCommandError("corrupt-state", "local review operation has multiple terminal receipts");
    }
    const replay = terminalReceipts[0];
    if (replay !== undefined && canonicalize(replay) !== canonicalize(receipt)) {
      throw new LocalAttestCommandError("corrupt-state", "conflicting local review receipt replay");
    }
    expectedLedgerVersion = reloaded.ledgerVersion;
  }
  throw new Error("local review receipt publication exceeded retry attempts");
}

/** Load one immutable operation and project non-attestable results without side effects. */
export async function attestLocalReviewCommand(
  requestInput: unknown,
  dependencies: LocalAttestDependencies,
): Promise<z.infer<typeof LocalAttestEnvelopeSchema>> {
  const request = LocalAttestRequestSchema.parse(requestInput);
  return dependencies.withSourceLock(() => attestLocalReviewWithinSourceLock(request, dependencies));
}

async function attestLocalReviewWithinSourceLock(
  request: z.infer<typeof LocalAttestRequestSchema>,
  dependencies: LocalAttestDependencies,
): Promise<z.infer<typeof LocalAttestEnvelopeSchema>> {
  const receiptReference = (durableRef: string) => bindReviewSourceReference({
    kind: "attested-local",
    operationId: request.operationId,
    durableRef,
  });
  const persisted = await dependencies.operationStore.readOperation(request.operationId);
  if (persisted.state === null
    || persisted.state.kind !== "local-review"
    || persisted.state.operationId !== request.operationId) {
    throw new LocalAttestCommandError("corrupt-state", "local review operation is unavailable");
  }
  if (request.result.status !== "complete" || request.result.result === null) {
    return LocalAttestEnvelopeSchema.parse({
      schemaVersion: 1,
      mode: "review-local-attest",
      diagnostics: [],
      state: "not-attestable",
      nextAction: "rerun-review",
      payload: {
        operationId: request.operationId,
        persistedVersion: persisted.version,
        result: request.result,
      },
    });
  }
  const state = persisted.state;
  const source = await dependencies.sourceStore.readSource(state.sourceRef);
  if (source === null
    || source.sourceDigest !== state.sourceDigest
    || source.repositoryId !== state.repositoryId
    || source.targetId !== state.targetId) {
    throw new LocalAttestCommandError("corrupt-state", "local review source snapshot mismatch");
  }
  if (request.result.sourceDigest !== state.sourceDigest) {
    throw new LocalAttestCommandError("invalid-input", "local review result source digest mismatch");
  }
  const ledger = await dependencies.receiptStore.readReceipts(state.targetId);
  const terminalReceipts = ledger.receipts.filter((receipt) => receipt.requestId === state.requestId);
  if (terminalReceipts.length > 1) {
    throw new LocalAttestCommandError("corrupt-state", "local review operation has multiple terminal receipts");
  }
  const existing = terminalReceipts[0];
  const receipt = createLocalReviewReceipt({
    target: state.target,
    requirement: state.requirement,
    carrier: {
      target: state.target,
      request: state.request,
      attestation: state.attestation,
    },
    result: request.result,
    runtimeIdentity: state.attestation.runtimeIdentity,
    attestationMechanism: state.attestation.mechanism,
    sourceDigest: state.sourceDigest,
    guidanceDigest: state.guidanceDigest,
  });
  if (existing !== undefined) {
    if (canonicalize(existing) !== canonicalize(receipt)) {
      throw new LocalAttestCommandError("corrupt-state", "local review operation already has a terminal receipt");
    }
    const replay = await appendReceiptWithRetry(
      dependencies.receiptStore,
      receipt,
      ledger.ledgerVersion,
    );
    await dependencies.releaseMaterialization(request.operationId);
    const current = await dependencies.confirmTarget(state.target);
    if (current.state === "stale-target") {
      return LocalAttestEnvelopeSchema.parse({
        schemaVersion: 1,
        mode: "review-local-attest",
        diagnostics: [],
        state: "stale-target",
        nextAction: "prepare-current-target",
        payload: {
          operationId: request.operationId,
          persistedVersion: persisted.version,
          receiptRecorded: true,
          receiptRef: receiptReference(replay.durableEvidenceRef),
          attemptedTarget: current.attemptedTarget,
          currentTarget: current.currentTarget,
        },
      });
    }
    return LocalAttestEnvelopeSchema.parse({
      schemaVersion: 1,
      mode: "review-local-attest",
      diagnostics: [],
      state: "attested-current",
      nextAction: "reduce",
      payload: {
        operationId: request.operationId,
        persistedVersion: persisted.version,
        target: state.target,
        sourceRef: state.sourceRef,
        receiptRef: receiptReference(replay.durableEvidenceRef),
        receiptRecorded: true,
      },
    });
  }
  if (await dependencies.inspectMaterialization(source) === "absent") {
    return LocalAttestEnvelopeSchema.parse({
      schemaVersion: 1,
      mode: "review-local-attest",
      diagnostics: [],
      state: "expired",
      nextAction: "rerun-review",
      payload: {
        operationId: request.operationId,
        persistedVersion: persisted.version,
      },
    });
  }
  const beforeAppend = await dependencies.confirmTarget(state.target);
  if (beforeAppend.state === "stale-target") {
    return LocalAttestEnvelopeSchema.parse({
      schemaVersion: 1,
      mode: "review-local-attest",
      diagnostics: [],
      state: "stale-target",
      nextAction: "prepare-current-target",
      payload: {
        operationId: request.operationId,
        persistedVersion: persisted.version,
        receiptRecorded: false,
        attemptedTarget: beforeAppend.attemptedTarget,
        currentTarget: beforeAppend.currentTarget,
      },
    });
  }
  const authority = await dependencies.resolveAuthority(state.request.evaluatorIdentity);
  if (canonicalize(authority.vehicle) !== canonicalize(state.vehicle)
    || authority.authorIdentity !== state.request.authorIdentity
    || authority.evaluatorIdentity !== state.request.evaluatorIdentity
    || authority.attestationRuntimeKind !== state.attestationRuntimeKind
    || authority.runtimeIdentity !== state.attestation.runtimeIdentity
    || authority.attestationMechanism !== state.attestation.mechanism) {
    throw new LocalAttestCommandError("invalid-input", "local review attestation authority mismatch");
  }
  const guidanceDigest = await dependencies.resolveGuidanceDigest(authority, state);
  if (guidanceDigest !== state.guidanceDigest) {
    throw new LocalAttestCommandError("corrupt-state", "local review delivered guidance changed");
  }
  if (request.result.guidanceDigest !== guidanceDigest) {
    throw new LocalAttestCommandError("invalid-input", "local review result guidance digest mismatch");
  }
  const appended = await appendReceiptWithRetry(
    dependencies.receiptStore,
    receipt,
    ledger.ledgerVersion,
  );
  await dependencies.releaseMaterialization(request.operationId);
  const afterAppend = await dependencies.confirmTarget(state.target);
  if (afterAppend.state === "stale-target") {
    return LocalAttestEnvelopeSchema.parse({
      schemaVersion: 1,
      mode: "review-local-attest",
      diagnostics: [],
      state: "stale-target",
      nextAction: "prepare-current-target",
      payload: {
        operationId: request.operationId,
        persistedVersion: persisted.version,
        receiptRecorded: true,
        receiptRef: receiptReference(appended.durableEvidenceRef),
        attemptedTarget: afterAppend.attemptedTarget,
        currentTarget: afterAppend.currentTarget,
      },
    });
  }
  return LocalAttestEnvelopeSchema.parse({
    schemaVersion: 1,
    mode: "review-local-attest",
    diagnostics: [],
    state: "attested-current",
    nextAction: "reduce",
    payload: {
      operationId: request.operationId,
      persistedVersion: persisted.version,
      target: state.target,
      sourceRef: state.sourceRef,
      receiptRef: receiptReference(appended.durableEvidenceRef),
      receiptRecorded: true,
    },
  });
}
