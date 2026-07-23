/** Source-authoritative orchestration for `arc review respond`. */

import { z } from "zod";

import { canonicalize } from "../../../lib/kernel/index.js";
import {
  ApprovedDispositionRecordSchema,
  FrontlineOutcomeRecordSchema,
  type ApprovedDispositionRecord,
} from "../core/advisory-records.js";
import {
  ApprovedDispositionSetSchema,
  type ApprovedDispositionSet,
} from "../core/disposition-records.js";
import { validateDispositionState } from "../core/dispositions.js";
import { validateReviewReceipt } from "../core/gate-contract-v2.js";
import {
  type ReviewReceiptV2,
  type ReviewTarget,
} from "../core/gate-contract-v2-schema.js";
import type {
  ApprovedDispositionRecordStore,
  FrontlineOutcomeStore,
  LocalReviewSourceStore,
  ReviewOperationStateStore,
} from "../core/ports.js";
import { RespondEnvelopeSchema } from "../core/review-command-envelope.js";
import {
  parseReviewSourceReference,
} from "../core/review-source-reference.js";
import { projectReviewResponse } from "../core/response-plan.js";
import type { LocalTargetConfirmation } from "../hosts/local/repository-target.js";
import {
  projectFrontlineFollowUpAdvice,
} from "../policy/frontline-follow-up.js";
import type { FrontlineExecutionOutcome } from "../policy/frontline-outcome.js";

const RespondSourceSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("attested-local"), receiptRef: z.string().trim().min(1) }),
  z.strictObject({ kind: z.literal("frontline"), outcomeRef: z.string().trim().min(1) }),
]);

export const RespondRequestSchema = z.strictObject({
  schemaVersion: z.literal(1),
  source: RespondSourceSchema,
  dispositions: ApprovedDispositionSetSchema,
});

interface ResponseActors {
  approverIdentity: string;
  proposerIdentity: string;
}

export interface RespondCommandDependencies {
  operationStore: ReviewOperationStateStore;
  sourceStore: LocalReviewSourceStore;
  outcomeStore: FrontlineOutcomeStore;
  dispositionStore: ApprovedDispositionRecordStore;
  readReceipt(reference: string): Promise<ReviewReceiptV2 | null>;
  confirmTarget(target: ReviewTarget): Promise<LocalTargetConfirmation>;
  resolveLocalActors(evaluatorIdentity: string): Promise<ResponseActors>;
  resolveFrontlineActors(): Promise<ResponseActors>;
}

/** Stable durable-authority failure for response source or replay mismatches. */
export class RespondCommandError extends Error {
  constructor(
    readonly code: "invalid-input" | "corrupt-state",
    message: string,
  ) {
    super(message);
    this.name = "RespondCommandError";
  }
}

interface ResolvedResponseSource {
  operationId: string;
  repositoryId: string;
  target: ReviewTarget;
  findings: FrontlineExecutionOutcome["findings"];
  sourceIdentity: string;
  source: ApprovedDispositionRecord["source"];
  policyVersion?: string;
  rubricVersion?: string;
  rubricDigest?: string;
  actors: ResponseActors;
  frontlineOutcome?: FrontlineExecutionOutcome;
}

function parseSourceReference(
  reference: string,
  kind: "attested-local" | "frontline",
) {
  try {
    return parseReviewSourceReference(reference, kind);
  } catch (error) {
    throw new RespondCommandError(
      "invalid-input",
      error instanceof Error ? error.message : "malformed review source reference",
    );
  }
}

function validateActors(dispositions: ApprovedDispositionSet, actors: ResponseActors): void {
  if (dispositions.approval.approvedBy !== actors.approverIdentity) {
    throw new RespondCommandError("invalid-input", "disposition approver is not the active local identity");
  }
  if (dispositions.dispositionSet.proposedBy !== actors.proposerIdentity) {
    throw new RespondCommandError("invalid-input", "disposition proposer is not the composing runtime");
  }
}

function validateFindings(
  dispositions: ApprovedDispositionSet,
  source: ResolvedResponseSource,
): void {
  const set = dispositions.dispositionSet;
  if (set.targetId !== source.target.targetId
    || (source.policyVersion !== undefined && set.policyVersion !== source.policyVersion)
    || (source.rubricVersion !== undefined && set.rubricVersion !== source.rubricVersion)
    || (source.rubricDigest !== undefined && set.rubricDigest !== source.rubricDigest)
    || set.findings.length !== source.findings.length
    || !set.findings.every((item) => {
      const finding = source.findings.find((candidate) => candidate.findingId === item.findingId);
      return finding !== undefined
        && item.sourceIdentity === source.sourceIdentity
        && item.locus === finding.locus
        && item.severity === finding.severity
        && item.nit === finding.nit;
    })) {
    throw new RespondCommandError("invalid-input", "approved dispositions do not match the selected review source");
  }
}

async function resolveLocalSource(
  request: z.infer<typeof RespondSourceSchema> & { kind: "attested-local" },
  dependencies: RespondCommandDependencies,
): Promise<ResolvedResponseSource> {
  const reference = parseSourceReference(request.receiptRef, "attested-local");
  const persisted = await dependencies.operationStore.readOperation(reference.operationId);
  if (persisted.state === null
    || persisted.state.kind !== "local-review"
    || persisted.state.operationId !== reference.operationId) {
    throw new RespondCommandError("corrupt-state", "local response operation is unavailable");
  }
  const state = persisted.state;
  const [receipt, localSource, actors] = await Promise.all([
    dependencies.readReceipt(reference.durableRef),
    dependencies.sourceStore.readSource(state.sourceRef),
    dependencies.resolveLocalActors(state.request.evaluatorIdentity),
  ]);
  if (receipt === null) throw new RespondCommandError("corrupt-state", "local response receipt is unavailable");
  if (localSource === null
    || localSource.sourceDigest !== state.sourceDigest
    || localSource.repositoryId !== state.repositoryId
    || localSource.targetId !== state.targetId) {
    throw new RespondCommandError("corrupt-state", "local response source snapshot mismatch");
  }
  validateReviewReceipt(state.target, state.requirement, state.request, receipt);
  if (receipt.result !== "findings") {
    throw new RespondCommandError("invalid-input", "local response requires a findings receipt");
  }
  return {
    operationId: state.operationId,
    repositoryId: state.repositoryId,
    target: state.target,
    findings: receipt.findings,
    sourceIdentity: state.request.evaluatorIdentity,
    source: {
      kind: "attested-local",
      receiptRef: request.receiptRef,
      localSourceRef: state.sourceRef,
    },
    policyVersion: state.policyVersion,
    rubricVersion: state.requirement.rubricVersion,
    rubricDigest: state.requirement.rubricDigest,
    actors,
  };
}

async function resolveFrontlineSource(
  request: z.infer<typeof RespondSourceSchema> & { kind: "frontline" },
  dependencies: RespondCommandDependencies,
): Promise<ResolvedResponseSource> {
  const reference = parseSourceReference(request.outcomeRef, "frontline");
  const persisted = await dependencies.outcomeStore.readOutcome(reference.operationId);
  if (persisted.record === null
    || persisted.outcomeRef !== reference.durableRef
    || persisted.record.operationId !== reference.operationId) {
    throw new RespondCommandError("corrupt-state", "frontline response outcome is unavailable");
  }
  const record = FrontlineOutcomeRecordSchema.parse(persisted.record);
  if (record.outcome.outcome !== "findings") {
    throw new RespondCommandError("invalid-input", "frontline response requires a findings outcome");
  }
  return {
    operationId: record.operationId,
    repositoryId: record.repositoryId,
    target: record.outcome.target,
    findings: record.outcome.findings,
    sourceIdentity: record.sourceIdentity,
    source: { kind: "frontline", outcomeRef: request.outcomeRef },
    actors: await dependencies.resolveFrontlineActors(),
    frontlineOutcome: record.outcome,
  };
}

function projectApprovedResponse(source: ResolvedResponseSource, dispositions: ApprovedDispositionSet) {
  return projectReviewResponse({
    currentTarget: source.target,
    findings: source.findings,
    routing: {
      schemaVersion: 1,
      authorSelfReview: "required",
      frontlineAction: "attempt",
      standardReview: "required",
      retrigger: "full-final",
      assuranceMode: "terminal-aggregate",
      reasons: ["sensitive-change-set"],
    },
    dispositionState: dispositions,
    candidateTarget: null,
    persistedTargetId: null,
    verificationPassed: false,
    verificationRefs: [],
    capabilities: { approve: false, fix: true, persist: false, close: true, reroute: false },
    channel: "local",
    conversations: [],
  });
}

/** Validate one approved set against its durable source and append its advisory record. */
export async function respondToReviewCommand(
  requestInput: unknown,
  dependencies: RespondCommandDependencies,
): Promise<z.infer<typeof RespondEnvelopeSchema>> {
  const request = RespondRequestSchema.parse(requestInput);
  let dispositions: ApprovedDispositionSet;
  try {
    const validated = validateDispositionState(request.dispositions);
    if (validated.state !== "approved") throw new Error("respond requires approved dispositions");
    dispositions = validated;
  } catch (error) {
    throw new RespondCommandError(
      "invalid-input",
      error instanceof Error ? error.message : "invalid approved dispositions",
    );
  }
  let source: ResolvedResponseSource;
  try {
    source = request.source.kind === "attested-local"
      ? await resolveLocalSource(request.source, dependencies)
      : await resolveFrontlineSource(request.source, dependencies);
  } catch (error) {
    if (error instanceof RespondCommandError
      || (typeof error === "object" && error !== null && "code" in error
        && (error.code === "invalid-input" || error.code === "corrupt-state"))) {
      throw error;
    }
    throw new RespondCommandError(
      "corrupt-state",
      error instanceof Error ? error.message : "review response source cannot be validated",
    );
  }
  validateActors(dispositions, source.actors);
  validateFindings(dispositions, source);
  const confirmation = await dependencies.confirmTarget(source.target);
  if (confirmation.state === "stale-target") {
    return RespondEnvelopeSchema.parse({
      schemaVersion: 1,
      mode: "review-respond",
      diagnostics: [],
      state: "stale-target",
      nextAction: "prepare-current-target",
      payload: {
        operationId: source.operationId,
        attemptedTarget: confirmation.attemptedTarget,
        currentTarget: confirmation.currentTarget,
      },
    });
  }
  const plan = projectApprovedResponse(source, dispositions);
  if (plan.state !== "ready-to-fix" && plan.state !== "ready-to-close") {
    throw new RespondCommandError("corrupt-state", `approved response produced unsupported state '${plan.state}'`);
  }
  const record = ApprovedDispositionRecordSchema.parse({
    schemaVersion: 1,
    semanticsVersion: "review-advisory/v1",
    repositoryId: source.repositoryId,
    operationId: source.operationId,
    source: source.source,
    approvedDisposition: dispositions,
    fixAuthorization: plan.fixAuthorization,
  });
  const existing = await dependencies.dispositionStore.readDispositionRecord(source.operationId);
  if (existing !== null && canonicalize(existing) !== canonicalize(record)) {
    throw new RespondCommandError("corrupt-state", "conflicting approved disposition record");
  }
  const appended = await dependencies.dispositionStore.appendDispositionRecord(record);
  const alreadySettled = existing !== null;
  const frontlineFollowUp = source.frontlineOutcome === undefined
    ? undefined
    : projectFrontlineFollowUpAdvice({
        outcome: source.frontlineOutcome,
        dispositionState: dispositions,
      });
  return RespondEnvelopeSchema.parse({
    schemaVersion: 1,
    mode: "review-respond",
    diagnostics: [],
    state: plan.state === "ready-to-fix" ? "ready-to-fix" : alreadySettled ? "already-settled" : "settled",
    nextAction: plan.state === "ready-to-fix" ? "apply-fix" : "reduce",
    payload: {
      operationId: source.operationId,
      dispositionRecordRef: appended.dispositionRecordRef,
      ...(plan.fixAuthorization === null ? {} : { fixAuthorization: plan.fixAuthorization }),
      ...(plan.fixAuthorization === null
        ? {}
        : {
            reentryCommand: source.source.kind === "attested-local"
              ? "local-prepare"
              : "frontline-resolve",
          }),
      ...(frontlineFollowUp === undefined ? {} : { frontlineFollowUp }),
    },
  });
}
