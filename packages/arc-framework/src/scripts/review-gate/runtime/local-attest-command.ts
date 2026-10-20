/** Command orchestration for one local advisory review attestation. */

import { z } from "zod";
import type { ReviewOutcome } from "../../../lib/store/kinds/review/outcome/schema.js";
import { reviewOutcomeKey } from "../../../lib/store/kinds/review/outcome/key.js";
import { readRetainedLocalReviewSource } from "./local-outcome-source.js";
import { publishLocalReviewReceipt, readLocalReviewReceipts } from "./local-outcome-receipts.js";
import { NativeReviewOperationRefSchema, nativeReviewOperationReferenceMatches, bindNativeReviewOperationReference } from "../core/review-operation-reference.js";

import { canonicalize } from "../../../lib/kernel/index.js";
import {
  ReviewIdentifierSchema,
  type ReviewReceiptV2,
  type ReviewTarget,
} from "../core/gate-contract-v2-schema.js";
import { bindReviewSourceReference, type ReviewSourceReferenceBinding } from "../core/review-source-reference.js";
import { assertLocalReviewClaimBinding } from "../core/local-operation.js";
import {
  LocalReviewEvaluatorResultSchema,
  normalizeLocalReviewResult,
} from "../core/local-review-result.js";
import type { LocalReviewAuthority } from "../core/local-review-authority.js";
import type { LocalReviewState } from "../core/operation-state-schema.js";
import type {
  ForwardReviewReceiptStore,
  LocalReviewSourceStore,
  ReviewOperationStateStore,
  ReviewOutcomePort,
  StoredReviewFact,
} from "../core/ports.js";
import { LocalAttestEnvelopeSchema } from "../core/review-command-envelope.js";
import {
  readAdmittedLocalLaneAttempt,
  recordLaneAttempt,
  recordLocalReceiptConclusion,
} from "../lane-progress.js";
import {
  isReviewVersionConflict,
  REVIEW_VERSION_RETRY_ATTEMPTS,
} from "../core/version-conflict.js";
import type { LocalTargetConfirmation } from "../hosts/local/repository-target.js";
import { createLocalReviewReceipt } from "./local-attestation.js";
import type { DeliveryLocalReviewAdmission } from "../policy/delivery-local-review-admission.js";

export const LocalAttestRequestSchema = z.strictObject({
  schemaVersion: z.literal(1),
  operationId: ReviewIdentifierSchema,
  operationRef: NativeReviewOperationRefSchema.optional(),
  result: LocalReviewEvaluatorResultSchema,
}).refine(request => request.operationRef === undefined
  || nativeReviewOperationReferenceMatches(request.operationRef, request.operationId),
{ path: ["operationRef"], message: "reference must match the requested operation" });

export interface LocalAttestDependencies {
  /** Encode source locators under the invocation's selected storage arm. */
  bindSourceReference?: ReviewSourceReferenceBinding;
  withLocalReviewLock<T>(action: () => Promise<T>): Promise<T>;
  operationStore: ReviewOperationStateStore;
  sourceStore: LocalReviewSourceStore;
  receiptStore: ForwardReviewReceiptStore;
  outcomes?: ReviewOutcomePort;
  resolveAuthority(
    evaluatorIdentity: string,
    memberHeadObjectId?: string,
    deliveryAdmission?: DeliveryLocalReviewAdmission,
  ): Promise<LocalReviewAuthority>;
  resolveGuidanceDigest(authority: LocalReviewAuthority, state: LocalReviewState): Promise<string>;
  confirmTarget(target: ReviewTarget): Promise<LocalTargetConfirmation>;
  inspectMaterialization(source: NonNullable<Awaited<ReturnType<LocalReviewSourceStore["readSource"]>>>): Promise<
    "materialized" | "absent"
  >;
  releaseMaterialization(operationId: string): Promise<void>;
  now(): string;
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
  dependencies: LocalAttestDependencies,
  state: LocalReviewState,
  receipt: ReviewReceiptV2,
  initialLedgerVersion: number,
): ReturnType<ForwardReviewReceiptStore["appendReceipt"]> {
  let expectedLedgerVersion = initialLedgerVersion;
  for (let attempt = 0; attempt < REVIEW_VERSION_RETRY_ATTEMPTS; attempt += 1) {
    try {
      return await publishLocalReviewReceipt(dependencies, { state, receipt, expectedLedgerVersion, now: () => dependencies.now() });
    } catch (error) {
      if (!isReviewVersionConflict(error)) throw error;
    }
    const reloaded = await readLocalReviewReceipts(dependencies, receipt.targetId);
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

async function publishAttestReceipt(dependencies: LocalAttestDependencies, state: LocalReviewState,
  receipt: ReviewReceiptV2, ledgerVersion: number): ReturnType<ForwardReviewReceiptStore["appendReceipt"]> {
  const published = await appendReceiptWithRetry(dependencies, state, receipt, ledgerVersion);
  if (dependencies.outcomes === undefined) await recordLocalReceiptConclusion(dependencies.operationStore,
    { state, receipt, now: dependencies.now() });
  return published;
}

/** Load one immutable operation and project non-attestable results without side effects. */
export async function attestLocalReviewCommand(
  requestInput: unknown,
  dependencies: LocalAttestDependencies,
): Promise<z.infer<typeof LocalAttestEnvelopeSchema>> {
  const request = LocalAttestRequestSchema.parse(requestInput);
  return dependencies.withLocalReviewLock(() => attestLocalReviewWithinLocalReviewLock(request, dependencies));
}

async function attestLocalReviewWithinLocalReviewLock(request: z.infer<typeof LocalAttestRequestSchema>,
  dependencies: LocalAttestDependencies): Promise<z.infer<typeof LocalAttestEnvelopeSchema>> {
  const persisted = await dependencies.operationStore.readOperation(request.operationId);
  if (dependencies.outcomes !== undefined) {
    const stored = await dependencies.outcomes.read(request.operationId);
    if (stored?.value.local !== undefined) return replayEndedLocalAttestation(request, stored, persisted.version, dependencies);
  }
  return attestLocalReviewFromWorkingState(request, dependencies, persisted);
}

async function replayEndedLocalAttestation(request: z.infer<typeof LocalAttestRequestSchema>,
  stored: StoredReviewFact<ReviewOutcome>, persistedVersion: number,
  dependencies: LocalAttestDependencies): Promise<z.infer<typeof LocalAttestEnvelopeSchema>> {
  const outcome = stored.value, local = outcome.local, requirement = outcome.requirement;
  if (outcome.attemptId !== request.operationId || local === undefined || requirement === undefined) {
    throw new LocalAttestCommandError("corrupt-state", "local review outcome does not match its admission");
  }
  assertLocalReviewClaimBinding(local);
  const target = outcome.target;
  const base = { operationId: request.operationId, persistedVersion,
    operationRef: bindNativeReviewOperationReference({ operationId: request.operationId,
      repositoryId: target.repositoryId, workItem: stored.reference.owner }) };
  const result = normalizeLocalReviewResult(request.result, { repositoryId: target.repositoryId,
    targetId: target.targetId, headSha: target.headSha, headTree: target.headTree,
    rubricVersion: requirement.rubricVersion, rubricDigest: requirement.rubricDigest,
    sourceDigest: local.sourceDigest, guidanceDigest: local.guidanceDigest });
  if (result.status !== "complete" || result.result === null || local.receipt === undefined) {
    return LocalAttestEnvelopeSchema.parse({ schemaVersion: 1, mode: "review-local-attest", diagnostics: [],
      state: "terminal-operation", nextAction: "rerun-review", payload: base });
  }
  const retained = await readRetainedLocalReviewSource(dependencies, request.operationId);
  if (retained !== null && (retained.source.sourceDigest !== local.sourceDigest
    || retained.source.repositoryId !== target.repositoryId || retained.source.targetId !== target.targetId)) {
    throw new LocalAttestCommandError("corrupt-state", "local review source snapshot mismatch");
  }
  const receipt = createLocalReviewReceipt({ target, requirement,
    carrier: { target, request: local.request, attestation: local.attestation }, result,
    runtimeIdentity: local.attestation.runtimeIdentity, attestationMechanism: local.attestation.mechanism,
    sourceDigest: local.sourceDigest, guidanceDigest: local.guidanceDigest });
  if (canonicalize(receipt) !== canonicalize(local.receipt)) {
    throw new LocalAttestCommandError("corrupt-state", "local review operation already has a terminal receipt");
  }
  if (retained !== null) await dependencies.releaseMaterialization(request.operationId);
  const current = await dependencies.confirmTarget(target);
  const coordinates = { kind: "attested-local" as const, operationId: request.operationId, durableRef: reviewOutcomeKey(outcome) };
  const receiptRef = dependencies.bindSourceReference === undefined
    ? bindReviewSourceReference({ ...coordinates, repositoryId: target.repositoryId, workItem: stored.reference.owner })
    : await dependencies.bindSourceReference(coordinates);
  if (current.state === "stale-target") return LocalAttestEnvelopeSchema.parse({ schemaVersion: 1,
    mode: "review-local-attest", diagnostics: [], state: "stale-target", nextAction: "prepare-current-target",
    payload: { ...base, receiptRecorded: true, receiptRef, attemptedTarget: current.attemptedTarget,
      currentTarget: current.currentTarget } });
  return LocalAttestEnvelopeSchema.parse({ schemaVersion: 1, mode: "review-local-attest", diagnostics: [],
    state: "attested-current", nextAction: "reduce", payload: { ...base, target, receiptRef, receiptRecorded: true,
      ...(retained === null ? {} : { sourceRef: retained.sourceRef }) } });
}

async function attestLocalReviewFromWorkingState(
  request: z.infer<typeof LocalAttestRequestSchema>,
  dependencies: LocalAttestDependencies,
  persisted: Awaited<ReturnType<ReviewOperationStateStore["readOperation"]>>,
): Promise<z.infer<typeof LocalAttestEnvelopeSchema>> {
  const receiptReference = (durableRef: string) => (dependencies.bindSourceReference ?? bindReviewSourceReference)({
    kind: "attested-local",
    operationId: request.operationId,
    durableRef,
  });
  if (persisted.state === null
    || persisted.state.kind !== "local-review"
    || persisted.state.operationId !== request.operationId) {
    throw new LocalAttestCommandError("corrupt-state", "local review operation is unavailable");
  }
  const state = persisted.state;
  assertLocalReviewClaimBinding(state);
  const admittedAttempt = await readAdmittedLocalLaneAttempt(dependencies.operationStore, state);
  if (admittedAttempt === null) {
    throw new LocalAttestCommandError("corrupt-state", "local review operation is not durably admitted");
  }
  const result = normalizeLocalReviewResult(request.result, {
    repositoryId: state.repositoryId,
    targetId: state.targetId,
    headSha: state.target.headSha,
    headTree: state.target.headTree,
    rubricVersion: state.requirement.rubricVersion,
    rubricDigest: state.requirement.rubricDigest,
    sourceDigest: state.sourceDigest,
    guidanceDigest: state.guidanceDigest,
  });
  const terminalOperation = () => LocalAttestEnvelopeSchema.parse({
    schemaVersion: 1,
    mode: "review-local-attest",
    diagnostics: [],
    state: "terminal-operation",
    nextAction: "rerun-review",
    payload: {
      operationId: request.operationId,
      persistedVersion: persisted.version,
    },
  });
  if (admittedAttempt.outcome !== "pending"
    && (result.status !== "complete" || result.result === null)) {
    return terminalOperation();
  }
  if (result.status === "failed") {
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
      local: {
        operationId: state.operationId,
        requestId: state.requestId,
        vehicle: state.vehicle,
        target: state.target,
        requestedCoverage: state.coverageAdmission.requestedCoverage,
        ...(state.coverageAdmission.correctionScope === undefined
          ? {}
          : { correctionScope: state.coverageAdmission.correctionScope }),
        effectiveCoverage: null,
        scopeMode: state.scopeMode,
        rubricIdentity: {
          version: state.requirement.rubricVersion,
          digest: state.requirement.rubricDigest,
        },
        ...(state.deliveryAdmission === undefined
          ? {}
          : { deliveryAdmission: state.deliveryAdmission }),
      },
      now: dependencies.now(),
      advancePendingAttempt: true,
    });
  }
  if (result.status === "unavailable" || result.status === "failed") {
    await dependencies.releaseMaterialization(request.operationId);
  }
  if (result.status !== "complete" || result.result === null) {
    return LocalAttestEnvelopeSchema.parse({
      schemaVersion: 1,
      mode: "review-local-attest",
      diagnostics: [],
      state: "not-attestable",
      nextAction: "rerun-review",
      payload: {
        operationId: request.operationId,
        persistedVersion: persisted.version,
        result,
      },
    });
  }
  const ledger = await readLocalReviewReceipts(dependencies, state.targetId);
  const terminalReceipts = ledger.receipts.filter((receipt) => receipt.requestId === state.requestId);
  if (terminalReceipts.length > 1) {
    throw new LocalAttestCommandError("corrupt-state", "local review operation has multiple terminal receipts");
  }
  const existing = terminalReceipts[0];
  if (existing === undefined && admittedAttempt.outcome !== "pending") {
    if (admittedAttempt.outcome !== "terminal-failure"
      && admittedAttempt.outcome !== "transient-unavailable"
      && admittedAttempt.outcome !== "stale-target") {
      throw new LocalAttestCommandError("corrupt-state", "terminal local review operation has no durable receipt");
    }
    return terminalOperation();
  }
  const source = await dependencies.sourceStore.readSource(state.sourceRef);
  if (source === null
    || source.sourceDigest !== state.sourceDigest
    || source.repositoryId !== state.repositoryId
    || source.targetId !== state.targetId) {
    throw new LocalAttestCommandError("corrupt-state", "local review source snapshot mismatch");
  }
  const receipt = createLocalReviewReceipt({
    target: state.target,
    requirement: state.requirement,
    carrier: {
      target: state.target,
      request: state.request,
      attestation: state.attestation,
    },
    result,
    runtimeIdentity: state.attestation.runtimeIdentity,
    attestationMechanism: state.attestation.mechanism,
    sourceDigest: state.sourceDigest,
    guidanceDigest: state.guidanceDigest,
  });
  if (existing !== undefined) {
    if (canonicalize(existing) !== canonicalize(receipt)) {
      throw new LocalAttestCommandError("corrupt-state", "local review operation already has a terminal receipt");
    }
    const replay = await publishAttestReceipt(dependencies, state, receipt, ledger.ledgerVersion);
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
          receiptRef: await receiptReference(replay.durableEvidenceRef),
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
        receiptRef: await receiptReference(replay.durableEvidenceRef),
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
  // The persisted target is the operation's exact-head record, so a member's selector
  // is read back from it rather than stored twice. Supplying it unconditionally would
  // authenticate an ordinary work unit's control head — itself delivery-bound once the
  // terminal member's pull request is open — as a member, and fail its own comparison.
  const memberHead = state.vehicle.kind === "delivery-member" ? state.target.headSha : undefined;
  const authority = state.deliveryAdmission === undefined
    ? await dependencies.resolveAuthority(state.request.evaluatorIdentity, memberHead)
    : await dependencies.resolveAuthority(
        state.request.evaluatorIdentity,
        memberHead,
        state.deliveryAdmission,
      );
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
  const appended = await publishAttestReceipt(dependencies, state, receipt, ledger.ledgerVersion);
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
        receiptRef: await receiptReference(appended.durableEvidenceRef),
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
      receiptRef: await receiptReference(appended.durableEvidenceRef),
      receiptRecorded: true,
    },
  });
}
