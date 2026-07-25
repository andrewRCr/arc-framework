/** Read-only reduction over durable local and frontline advisory review records. */

import { z } from "zod";

import { canonicalize } from "../../../lib/kernel/index.js";
import {
  ApprovedDispositionRecordSchema,
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
  type ReviewTarget,
} from "../core/gate-contract-v2-schema.js";
import { bindReviewSourceReference } from "../core/review-source-reference.js";
import type {
  ApprovedDispositionRecordStore,
  FrontlineOutcomeStore,
  LocalReviewSourceStore,
  ReviewReductionPort,
  ReviewOperationStateStore,
} from "../core/ports.js";
import { renderForwardGateProjection } from "../core/projection.js";
import { ReduceEnvelopeSchema } from "../core/review-command-envelope.js";
import { projectReviewResponse } from "../core/response-plan.js";
import type { LocalTargetConfirmation } from "../hosts/local/repository-target.js";
import { projectFrontlineFollowUpAdvice } from "../policy/frontline-follow-up.js";

export const ReduceRequestSchema = z.strictObject({
  schemaVersion: z.literal(1),
  operationId: ReviewIdentifierSchema,
});

interface LocalReceiptEntry {
  receipt: ReviewReceiptV2;
  durableEvidenceRef: string;
}

export interface ReviewReductionAdapterDependencies {
  operationStore: ReviewOperationStateStore;
  sourceStore: LocalReviewSourceStore;
  outcomeStore: FrontlineOutcomeStore;
  dispositionStore: ApprovedDispositionRecordStore;
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

function findingsIdentity(findings: Array<{
  findingId: string;
  locus: string;
  severity: string;
  nit?: boolean;
}>) {
  return findings.map((finding) => ({
    findingId: finding.findingId,
    locus: finding.locus,
    severity: finding.severity,
    nit: finding.nit === true,
  }));
}

function validateDisposition(input: {
  record: ApprovedDispositionRecord;
  operationId: string;
  repositoryId: string;
  source: ApprovedDispositionRecord["source"];
  targetId: string;
  findings: Array<{ findingId: string; locus: string; severity: string; nit?: boolean }>;
  sourceIdentity: string;
  policyVersion?: string;
  rubricVersion?: string;
  rubricDigest?: string;
}): void {
  const record = ApprovedDispositionRecordSchema.parse(input.record);
  const set = record.approvedDisposition.dispositionSet;
  const expectedSource = canonicalize(input.source);
  const actualSource = canonicalize(record.source);
  const sourceFindings = findingsIdentity(input.findings);
  const dispositionFindings = findingsIdentity(set.findings);
  if (record.operationId !== input.operationId
    || record.repositoryId !== input.repositoryId
    || actualSource !== expectedSource
    || set.targetId !== input.targetId
    || (input.policyVersion !== undefined && set.policyVersion !== input.policyVersion)
    || (input.rubricVersion !== undefined && set.rubricVersion !== input.rubricVersion)
    || (input.rubricDigest !== undefined && set.rubricDigest !== input.rubricDigest)
    || canonicalize(dispositionFindings) !== canonicalize(sourceFindings)
    || !set.findings.every((finding) => finding.sourceIdentity === input.sourceIdentity)) {
    throw new ReduceCommandError("approved disposition snapshot mismatch");
  }
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
    dispositionState: input.disposition?.approvedDisposition ?? null,
    candidateTarget: null,
    persistedTargetId: null,
    verificationPassed: false,
    verificationRefs: [],
    capabilities: { approve: true, fix: true, persist: false, close: true, reroute: false },
  });
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
  let receipt: ReviewReceiptV2;
  try {
    receipt = validateReviewReceipt(state.target, state.requirement, state.request, entry.receipt);
    renderForwardGateProjection({
      channel: "local",
      target: state.target,
      requirement: state.requirement,
      request: state.request,
      receipt,
    });
  } catch (error) {
    throw new ReduceCommandError(
      `local review chain mismatch: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  const receiptRef = bindReviewSourceReference({
    kind: "attested-local",
    operationId,
    durableRef: entry.durableEvidenceRef,
  });
  const base = {
    operationId,
    persistedVersion: persisted.version,
    currentTarget: state.target,
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
        retryCommand: "local-attest",
        requestRef: state.requestId,
      },
    });
  }
  if (receipt.result === "clean") {
    if (disposition !== null) throw new ReduceCommandError("clean receipt has an approved disposition");
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
      payload: { ...base, projection: projected },
    });
  }
  const sourceRecord = {
    kind: "attested-local" as const,
    receiptRef,
    localSourceRef: state.sourceRef,
  };
  if (disposition === null) {
    const plan = responsePlan({ target: state.target, findings: receipt.findings, disposition: null });
    if (plan.state !== "awaiting-approval") {
      throw new ReduceCommandError("undispositioned findings did not produce a response checkpoint");
    }
    const projected = projection({
      ...base,
      state: "findings",
      nextAction: "respond",
      sourceRefs: [receiptRef, state.sourceRef],
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
        responseSource: { kind: "attested-local", receiptRef },
      },
    });
  }
  validateDisposition({
    record: disposition,
    operationId,
    repositoryId: state.repositoryId,
    source: sourceRecord,
    targetId: state.targetId,
    findings: receipt.findings,
    sourceIdentity: state.request.evaluatorIdentity,
    policyVersion: state.policyVersion,
    rubricVersion: state.requirement.rubricVersion,
    rubricDigest: state.requirement.rubricDigest,
  });
  const plan = responsePlan({ target: state.target, findings: receipt.findings, disposition });
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
    payload: { ...base, projection: projected },
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
    || outcome.pass !== state.passCount) {
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
  const outcomeRef = bindReviewSourceReference({
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
    validateDisposition({
      record: disposition,
      operationId,
      repositoryId: record.repositoryId,
      source: { kind: "frontline", outcomeRef },
      targetId: outcome.target.targetId,
      findings: outcome.findings,
      sourceIdentity: record.sourceIdentity,
    });
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
          dispositionState: disposition.approvedDisposition,
        }),
      },
    });
  }
  if (disposition !== null) throw new ReduceCommandError("non-findings outcome has an approved disposition");
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
    diagnostics: [],
    state: "retryable",
    nextAction: "retry",
    payload: {
      ...base,
      retryCommand: "frontline-run",
      requestRef: operationId,
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
      if (error instanceof ReduceCommandError) throw error;
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
    if (error instanceof ReduceCommandError) throw error;
    throw new ReduceCommandError(
      error instanceof Error ? error.message : "review reduction cannot validate durable state",
    );
  }
}
