/** Read-only reduction over durable local and frontline advisory review records. */

import { z } from "zod";
import { NativeReviewOperationRefSchema, nativeReviewOperationReferenceMatches, bindNativeReviewOperationReference } from "../core/review-operation-reference.js";
import { reviewOutcomeKey } from "../../../lib/store/kinds/review/outcome/key.js";
import type { ReviewOutcome } from "../../../lib/store/kinds/review/outcome/schema.js";
import { ProjectIdentityError } from "../../../lib/store/project-identity.js";

import {
  currentApprovedDispositionNode,
  FrontlineOutcomeRecordSchema,
  ReviewReductionProjectionSchema,
  type ApprovedDispositionRecord,
  type FrontlineOutcomeRecord,
  type ReviewReductionProjection,
} from "../core/advisory-records.js";
import { validateReviewReceipt } from "../core/gate-contract-v2.js";
import {
  ReviewIdentifierSchema,
  type ReviewReceiptV2,
  type ReviewRequirementV2,
  type ReviewRequestV2,
  type ReviewTarget,
} from "../core/gate-contract-v2-schema.js";
import { bindReviewSourceReference, type ReviewSourceReferenceBinding } from "../core/review-source-reference.js";
import { assertLocalReviewClaimBinding } from "../core/local-operation.js";
import type {
  ApprovedDispositionRecordStore,
  FrontlineOutcomeStore,
  LocalReviewSourceStore,
  ReviewReductionPort,
  ReviewOperationStateStore,
  ReviewResultReader,
  ReviewOutcomePort,
  StoredReviewFact,
} from "../core/ports.js";
import {
  validateApprovedDispositionRecordForResult,
} from "../core/review-result-disposition.js";
import { renderForwardGateProjection } from "../core/projection.js";
import { ReduceEnvelopeSchema } from "../core/review-command-envelope.js";
import { projectReviewResponse } from "../core/response-plan.js";
import type { LocalTargetConfirmation } from "../hosts/local/repository-target.js";
import { projectFrontlineFollowUpAdvice } from "../policy/frontline-follow-up.js";

export const ReduceRequestSchema = z.strictObject({
  schemaVersion: z.literal(1),
  operationId: ReviewIdentifierSchema,
  operationRef: NativeReviewOperationRefSchema.optional(),
}).refine(request => request.operationRef === undefined
  || nativeReviewOperationReferenceMatches(request.operationRef, request.operationId),
{ path: ["operationRef"], message: "reference must match the requested operation" });

interface LocalReceiptEntry {
  receipt: ReviewReceiptV2;
  durableEvidenceRef: string;
}

export interface ReviewReductionAdapterDependencies {
  /** Encode source locators under the invocation's selected storage arm. */
  bindSourceReference?: ReviewSourceReferenceBinding;
  operationStore: ReviewOperationStateStore;
  outcomes?: ReviewOutcomePort;
  sourceStore: LocalReviewSourceStore;
  outcomeStore: FrontlineOutcomeStore;
  resultReader: ReviewResultReader;
  dispositionStore: Pick<ApprovedDispositionRecordStore, "readDispositionRecord">;
  readReceiptEntries(targetId: string): Promise<LocalReceiptEntry[]>;
  confirmTarget(target: ReviewTarget): Promise<LocalTargetConfirmation>;
}

export interface ReduceCommandDependencies {
  reductionPort: ReviewReductionPort;
}

/** Stable failure for reduction inputs whose durable chain cannot be proven. */
export class ReduceCommandError extends Error {
  readonly code = "corrupt-state" as const;

  constructor(message: string) {
    super(message);
    this.name = "ReduceCommandError";
  }
}

function projection(input: unknown): ReviewReductionProjection {
  const value = z.record(z.string(), z.unknown()).parse(input);
  return ReviewReductionProjectionSchema.parse({
    schemaVersion: 1,
    semanticsVersion: "review-advisory/v1",
    ...value,
  });
}

function responsePlan(input: {
  target: ReviewTarget;
  findings: ReviewReceiptV2["findings"];
  disposition: ApprovedDispositionRecord | null;
}) {
  return projectReviewResponse({
    currentTarget: input.target,
    findings: input.findings,
    routing: {
      schemaVersion: 1,
      authorSelfReview: "required",
      frontlineAction: "attempt",
      standardReview: "required",
      retrigger: "full-final",
      assuranceMode: "terminal-aggregate",
      reasons: ["sensitive-change-set"],
    },
    dispositionState: input.disposition === null
      ? null
      : currentApprovedDispositionNode(input.disposition).approvedDisposition,
    candidateTarget: null,
    persistedTargetId: null,
    verificationPassed: false,
    verificationRefs: [],
    capabilities: { approve: true, fix: true, persist: false, close: true, reroute: false },
  });
}

async function reduceStoredLocal(stored: StoredReviewFact<ReviewOutcome>,
  persisted: Awaited<ReturnType<ReviewOperationStateStore["readOperation"]>>,
  dependencies: ReviewReductionAdapterDependencies) {
  const outcome = stored.value;
  const local = outcome.local;
  if (local?.receipt === undefined || outcome.requirement === undefined) {
    throw new ReduceCommandError("local review receipt is unavailable");
  }
  assertLocalReviewClaimBinding(local);
  const operationId = outcome.attemptId, target = outcome.target;
  const operationRef = bindNativeReviewOperationReference({ operationId, repositoryId: target.repositoryId,
    workItem: stored.reference.owner });
  const confirmation = await dependencies.confirmTarget(target);
  if (confirmation.state === "stale-target") return ReduceEnvelopeSchema.parse({ schemaVersion: 1,
    mode: "review-reduce", diagnostics: [], state: "stale-target", nextAction: "prepare-current-target",
    payload: { operationId, operationRef, persistedVersion: persisted.version, attemptedTarget: confirmation.attemptedTarget,
      currentTarget: confirmation.currentTarget } });
  const receipt = validateLocalReductionReceipt(target, outcome.requirement, local.request, local.receipt);
  const receiptRef = await (dependencies.bindSourceReference ?? bindReviewSourceReference)({
    kind: "attested-local", operationId, durableRef: reviewOutcomeKey(outcome) });
  const disposition = await dependencies.dispositionStore.readDispositionRecord(operationId);
  let sourceRef: string | undefined;
  const retainedSource = persisted.state?.kind === "local-review" ? persisted.state.sourceRef
    : await dependencies.operationStore.readLocalSourceReference?.(operationId);
  if (retainedSource !== undefined && retainedSource !== null) {
    const source = await dependencies.sourceStore.readSource(retainedSource);
    if (source !== null) {
      if (source.sourceDigest !== local.sourceDigest || source.repositoryId !== target.repositoryId
        || source.targetId !== target.targetId) throw new ReduceCommandError("local review source snapshot mismatch");
      sourceRef = retainedSource;
    }
  }
  return reduceLocalReceipt({ operationId, operationRef, persistedVersion: persisted.version, target, requestId: local.requestId,
    receipt, receiptRef, durableEvidenceRef: reviewOutcomeKey(outcome), ...(sourceRef === undefined ? {} : { sourceRef }) }, disposition, dependencies);
}

async function reduceLocal(
  operationId: string,
  persisted: Awaited<ReturnType<ReviewOperationStateStore["readOperation"]>>,
  dependencies: ReviewReductionAdapterDependencies,
) {
  if (persisted.state === null || persisted.state.kind !== "local-review") {
    throw new ReduceCommandError("local review operation is unavailable");
  }
  const state = persisted.state;
  const confirmation = await dependencies.confirmTarget(state.target);
  if (confirmation.state === "stale-target") {
    return ReduceEnvelopeSchema.parse({
      schemaVersion: 1,
      mode: "review-reduce",
      diagnostics: [],
      state: "stale-target",
      nextAction: "prepare-current-target",
      payload: {
        operationId,
        persistedVersion: persisted.version,
        attemptedTarget: confirmation.attemptedTarget,
        currentTarget: confirmation.currentTarget,
      },
    });
  }
  assertLocalReviewClaimBinding(state);
  const [source, entries, disposition] = await Promise.all([
    dependencies.sourceStore.readSource(state.sourceRef),
    dependencies.readReceiptEntries(state.targetId),
    dependencies.dispositionStore.readDispositionRecord(operationId),
  ]);
  if (source === null
    || source.sourceDigest !== state.sourceDigest
    || source.repositoryId !== state.repositoryId
    || source.targetId !== state.targetId) {
    throw new ReduceCommandError("local review source snapshot mismatch");
  }
  const operationEntries = entries.filter((candidate) => candidate.receipt.requestId === state.requestId);
  if (operationEntries.length > 1) {
    throw new ReduceCommandError("local review operation has multiple terminal receipts");
  }
  const entry = operationEntries[0];
  if (entry === undefined) throw new ReduceCommandError("local review receipt is unavailable");
  const receipt = validateLocalReductionReceipt(state.target, state.requirement, state.request, entry.receipt);
  const receiptRef = await (dependencies.bindSourceReference ?? bindReviewSourceReference)({
    kind: "attested-local",
    operationId,
    durableRef: entry.durableEvidenceRef,
  });
  return reduceLocalReceipt({ operationId, persistedVersion: persisted.version, target: state.target,
    requestId: state.requestId, receipt, receiptRef, durableEvidenceRef: entry.durableEvidenceRef, sourceRef: state.sourceRef }, disposition, dependencies);
}

function validateLocalReductionReceipt(target: ReviewTarget, requirement: ReviewRequirementV2,
  request: ReviewRequestV2, input: ReviewReceiptV2): ReviewReceiptV2 {
  let receipt: ReviewReceiptV2;
  try {
    receipt = validateReviewReceipt(target, requirement, request, input);
    renderForwardGateProjection({
      channel: "local",
      target,
      requirement,
      request,
      receipt,
    });
  } catch (error) {
    throw new ReduceCommandError(
      `local review chain mismatch: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  return receipt;
}

async function reduceLocalReceipt(input: { operationId: string; operationRef?: string; persistedVersion: number; target: ReviewTarget;
  requestId: string; receipt: ReviewReceiptV2; receiptRef: string; durableEvidenceRef: string; sourceRef?: string },
  disposition: ApprovedDispositionRecord | null, dependencies: ReviewReductionAdapterDependencies) {
  const { operationId, receipt, receiptRef } = input;
  const locator = input.operationRef === undefined ? {} : { operationRef: input.operationRef };
  const base = {
    operationId,
    persistedVersion: input.persistedVersion,
    currentTarget: input.target,
  };
  if (receipt.result === "failed" || receipt.result === "unavailable") {
    if (disposition !== null) throw new ReduceCommandError("non-findings receipt has an approved disposition");
    return ReduceEnvelopeSchema.parse({
      schemaVersion: 1,
      mode: "review-reduce",
      diagnostics: [],
      state: "retryable",
      nextAction: "retry",
      payload: {
        ...base,
        ...locator,
        retryCommand: "local-attest",
        requestRef: input.requestId,
      },
    });
  }
  if (receipt.result === "clean") {
    if (disposition !== null) throw new ReduceCommandError("clean receipt has an approved disposition");
    const result = await dependencies.resultReader.readResult(operationId);
    if (result.kind !== "attested-local"
      || result.originalOutcome !== "clean"
      || result.receiptRef !== input.durableEvidenceRef) {
      throw new ReduceCommandError("local review result snapshot mismatch");
    }
    const projected = projection({
      ...base,
      state: "advisory-complete",
      nextAction: "none",
    });
    return ReduceEnvelopeSchema.parse({
      schemaVersion: 1,
      mode: "review-reduce",
      diagnostics: [],
      state: "advisory-complete",
      nextAction: "none",
      payload: { ...base, ...locator, projection: projected },
    });
  }
  const result = await dependencies.resultReader.readResult(operationId);
  if (result.kind !== "attested-local"
    || result.originalOutcome !== "findings"
    || result.receiptRef !== input.durableEvidenceRef) {
    throw new ReduceCommandError("local review result snapshot mismatch");
  }
  if (disposition === null) {
    const plan = responsePlan({ target: input.target, findings: [...result.findings], disposition: null });
    if (plan.state !== "awaiting-approval") {
      throw new ReduceCommandError("undispositioned findings did not produce a response checkpoint");
    }
    const projected = projection({
      ...base,
      state: "findings",
      nextAction: "respond",
      sourceRefs: [receiptRef, ...(input.sourceRef === undefined ? [] : [input.sourceRef])],
    });
    return ReduceEnvelopeSchema.parse({
      schemaVersion: 1,
      mode: "review-reduce",
      diagnostics: [],
      state: "findings",
      nextAction: "respond",
      payload: {
        ...base,
        ...locator,
        projection: projected,
        responseSource: { kind: "attested-local", receiptRef },
      },
    });
  }
  try {
    validateApprovedDispositionRecordForResult(disposition, result);
  } catch {
    throw new ReduceCommandError("approved disposition snapshot mismatch");
  }
  const plan = responsePlan({ target: input.target, findings: [...result.findings], disposition });
  if (plan.state !== "ready-to-close" && plan.state !== "ready-to-fix") {
    throw new ReduceCommandError("approved findings did not produce a settled response");
  }
  const projected = projection({ ...base, state: "settled", nextAction: "none" });
  return ReduceEnvelopeSchema.parse({
    schemaVersion: 1,
    mode: "review-reduce",
    diagnostics: [],
    state: "settled",
    nextAction: "none",
    payload: { ...base, ...locator, projection: projected },
  });
}

async function reduceFrontline(
  operationId: string,
  persisted: Awaited<ReturnType<ReviewOperationStateStore["readOperation"]>>,
  dependencies: ReviewReductionAdapterDependencies,
) {
  if (persisted.state === null || persisted.state.kind !== "frontline-run") {
    throw new ReduceCommandError("frontline review operation is unavailable");
  }
  const state = persisted.state;
  const [outcomeReading, disposition] = await Promise.all([
    dependencies.outcomeStore.readOutcome(operationId),
    dependencies.dispositionStore.readDispositionRecord(operationId),
  ]);
  if (state.outcome === "pending") {
    throw new ReduceCommandError("frontline operation is still pending");
  }
  if (outcomeReading.record === null
    || outcomeReading.outcomeRef === null
    || outcomeReading.version <= 0) {
    throw new ReduceCommandError("frontline completion claim lacks its durable outcome");
  }
  let record: FrontlineOutcomeRecord;
  try {
    record = FrontlineOutcomeRecordSchema.parse(outcomeReading.record);
  } catch (error) {
    throw new ReduceCommandError(
      `frontline outcome mismatch: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  const outcome = record.outcome;
  if (record.operationId !== operationId
    || record.sourceIdentity !== state.sourceIdentity
    || outcome.target.targetId !== state.targetId
    || outcome.source.sourceId !== state.sourceIdentity
    || outcome.outcome !== state.outcome
    || outcome.pass !== state.logicalPass) {
    throw new ReduceCommandError("frontline outcome does not match its operation");
  }
  const confirmation = await dependencies.confirmTarget(outcome.target);
  if (confirmation.state === "stale-target") {
    return ReduceEnvelopeSchema.parse({
      schemaVersion: 1,
      mode: "review-reduce",
      diagnostics: [],
      state: "stale-target",
      nextAction: "prepare-current-target",
      payload: {
        operationId,
        persistedVersion: persisted.version,
        attemptedTarget: confirmation.attemptedTarget,
        currentTarget: confirmation.currentTarget,
      },
    });
  }
  const outcomeRef = await (dependencies.bindSourceReference ?? bindReviewSourceReference)({
    kind: "frontline",
    operationId,
    durableRef: outcomeReading.outcomeRef,
  });
  const base = {
    operationId,
    persistedVersion: persisted.version,
    currentTarget: outcome.target,
  };
  if (outcome.outcome === "findings") {
    const result = await dependencies.resultReader.readResult(operationId);
    if (result.kind !== "frontline"
      || result.originalOutcome !== "findings"
      || result.outcomeRef !== outcomeReading.outcomeRef) {
      throw new ReduceCommandError("frontline review result snapshot mismatch");
    }
    if (disposition === null) {
      const projected = projection({
        ...base,
        state: "findings",
        nextAction: "respond",
        sourceRefs: [outcomeRef],
      });
      return ReduceEnvelopeSchema.parse({
        schemaVersion: 1,
        mode: "review-reduce",
        diagnostics: [],
        state: "findings",
        nextAction: "respond",
        payload: {
          ...base,
          projection: projected,
          responseSource: { kind: "frontline", outcomeRef },
        },
      });
    }
    try {
      validateApprovedDispositionRecordForResult(disposition, result);
    } catch {
      throw new ReduceCommandError("approved disposition snapshot mismatch");
    }
    const projected = projection({ ...base, state: "advisory-complete", nextAction: "none" });
    return ReduceEnvelopeSchema.parse({
      schemaVersion: 1,
      mode: "review-reduce",
      diagnostics: [],
      state: "advisory-complete",
      nextAction: "none",
      payload: {
        ...base,
        projection: projected,
        frontlineOutcomeRef: outcomeRef,
        frontlineFollowUp: projectFrontlineFollowUpAdvice({
          outcome,
          dispositionState: currentApprovedDispositionNode(disposition).approvedDisposition,
        }),
      },
    });
  }
  if (disposition !== null) throw new ReduceCommandError("non-findings outcome has an approved disposition");
  if (outcome.outcome === "clean") {
    const result = await dependencies.resultReader.readResult(operationId);
    if (result.kind !== "frontline"
      || result.originalOutcome !== "clean"
      || result.outcomeRef !== outcomeReading.outcomeRef) {
      throw new ReduceCommandError("frontline review result snapshot mismatch");
    }
  }
  if (outcome.outcome === "clean" || outcome.outcome === "pass-cap-exhausted") {
    const projected = projection({ ...base, state: "advisory-complete", nextAction: "none" });
    return ReduceEnvelopeSchema.parse({
      schemaVersion: 1,
      mode: "review-reduce",
      diagnostics: [],
      state: "advisory-complete",
      nextAction: "none",
      payload: {
        ...base,
        projection: projected,
        frontlineOutcomeRef: outcomeRef,
        frontlineFollowUp: projectFrontlineFollowUpAdvice({ outcome }),
      },
    });
  }
  return ReduceEnvelopeSchema.parse({
    schemaVersion: 1,
    mode: "review-reduce",
    diagnostics: [{
      code: "frontline-explicit-retry",
      message: "The same frontline run request replays this outcome. Inspect the provider failure before "
        + `submitting retryOfOperationId: '${operationId}' for one new review.`,
    }],
    state: "retryable",
    nextAction: "operator-repair",
    payload: {
      ...base,
      retryCommand: "frontline-run",
      requestRef: operationId,
      retryOfOperationId: operationId,
    },
  });
}

/** Production reduction over exact durable records without mutation. */
export class DurableReviewReductionPort implements ReviewReductionPort {
  readonly #dependencies: ReviewReductionAdapterDependencies;

  constructor(dependencies: ReviewReductionAdapterDependencies) {
    this.#dependencies = dependencies;
  }

  async reduce(operationId: string): Promise<z.infer<typeof ReduceEnvelopeSchema>> {
    let persisted;
    try {
      persisted = await this.#dependencies.operationStore.readOperation(operationId);
      const outcome = await this.#dependencies.outcomes?.read(operationId);
      if (outcome?.value.local !== undefined) {
        return await reduceStoredLocal(outcome, persisted, this.#dependencies);
      }
      if (persisted.state === null || persisted.state.operationId !== operationId) {
        throw new ReduceCommandError("review operation is unavailable");
      }
      if (persisted.state.kind === "local-review") {
        return await reduceLocal(operationId, persisted, this.#dependencies);
      }
      if (persisted.state.kind === "frontline-run") {
        return await reduceFrontline(operationId, persisted, this.#dependencies);
      }
      throw new ReduceCommandError("operation kind is not reducible");
    } catch (error) {
      if (error instanceof ReduceCommandError || error instanceof ProjectIdentityError) throw error;
      throw new ReduceCommandError(
        error instanceof Error ? error.message : "review reduction cannot validate durable state",
      );
    }
  }
}

/** Validate one reduction request and dispatch it through the configured read-only port. */
export async function reduceReviewCommand(
  requestInput: unknown,
  dependencies: ReduceCommandDependencies,
): Promise<z.infer<typeof ReduceEnvelopeSchema>> {
  const request = ReduceRequestSchema.parse(requestInput);
  try {
    return await dependencies.reductionPort.reduce(request.operationId);
  } catch (error) {
    if (error instanceof ReduceCommandError || error instanceof ProjectIdentityError) throw error;
    throw new ReduceCommandError(
      error instanceof Error ? error.message : "review reduction cannot validate durable state",
    );
  }
}
