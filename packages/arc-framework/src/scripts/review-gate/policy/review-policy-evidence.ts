/** Evidence composition for terminal review-policy attempts. */

import type { ReviewNextPassContext } from "./review-next-pass-schema.js";
import { canonicalize } from "../../../lib/kernel/index.js";

import { validateReviewTarget } from "../core/gate-contract-v2.js";
import { currentApprovedDispositionNode } from "../core/advisory-records.js";
import type {
  ApprovedDispositionRecordStore,
  ReviewResultReader,
} from "../core/ports.js";
import { validateApprovedDispositionRecordForResult } from
  "../core/review-result-disposition.js";
import type { ReviewResult } from "../core/review-result.js";
import type { ReviewScopeMode, ReviewSeverity } from "../core/review-primitives.js";
import {
  fixesMaterialFinding,
  isMaterialSeverity,
  type VerifiedTerminalReviewSignal,
} from "../core/review-convergence.js";
import type { LaneResponsePerformance } from "../core/operation-state-schema.js";
import {
  ReviewPolicyCommandRequestSchema,
  ReviewPolicyRequestSchema,
  resolveReviewPolicy,
  type ReviewPolicyCommandRequest,
  type ReviewPolicyRequest,
  type ReviewResolveEnvelope,
} from "./review-policy-driver.js";
import {
  resolveIncrementalCoverageBasis,
  type IncrementalPredecessorApplicability,
  type IncrementalPredecessorResponseEvidence,
} from "./incremental-coverage-basis.js";
import { requireDriverAdmission } from "./review-execution-admission.js";
import { reconcileReviewFallbackAttempts, reconcileReviewSourceInvocation } from "./review-policy-fallbacks.js";

/** Trusted inputs needed to bind one command request to immutable producer evidence. */
export interface EvidenceBoundReviewPolicyDependencies {
  readonly sources: readonly string[];
  readonly selectionSources?: readonly string[];
  readonly configuredSources?: readonly string[];
  readonly maxPasses: number;
  readonly nextPassContext?: ReviewNextPassContext;
  readonly resultReader: ReviewResultReader;
  readonly dispositionStore: ApprovedDispositionRecordStore;
  readonly confirmTarget: (attemptedTarget: ReviewResult["target"])
  => Promise<ReviewResult["target"]>;
  readonly confirmIncrementalApplicability?: (
    predecessor: ReviewResult,
    current: ReviewResult,
  ) => Promise<IncrementalPredecessorApplicability>;
  readonly readResponsePerformance?: (
    predecessor: ReviewResult,
  ) => Promise<LaneResponsePerformance | null>;
  /** Producer ID already proven applicable to the current Candidate by the owning composition. */
  readonly historicalProducerId?: string;
  /** Pre-publication may project a pending response before its disposition is approved. */
  readonly allowUnapprovedFindings?: boolean;
  /** Pre-publication proved exact lane settlement against the current approved disposition. */
  readonly terminalResponseSettled?: boolean;
  /** The owning composition proved the subject's opening frontline phase closed from its recorded history. */
  readonly frontlinePhaseClosed?: boolean;
  /** The owning composition proved the invoking checkout is the subject's own Errand. */
  readonly errandVehicle?: boolean;
}

function requestScope(request: ReviewPolicyCommandRequest): "whole-target" | "chunked" {
  return request.scopeSelection?.mode ?? "whole-target";
}

function resultScope(result: ReviewResult): "whole-target" | "chunked" {
  return result.admission.scopeMode;
}

/** Caller progress that disagrees with a trusted terminal producer, with a corrected replay. */
export class ReviewTerminalAttemptInputError extends Error {
  readonly code = "invalid-input" as const;

  constructor(
    message: string,
    readonly correction: string,
    readonly correctedRequest: ReviewPolicyCommandRequest,
  ) {
    super(message);
    this.name = "ReviewTerminalAttemptInputError";
  }
}

/** A terminal producer whose recorded scope needs an explicit caller lane judgment. */
export class ReviewProducerScopeMismatchError extends ReviewTerminalAttemptInputError {
  readonly lane: ReviewPolicyCommandRequest["lane"];
  readonly observedScope: ReviewScopeMode;
  readonly selectedScope: ReviewScopeMode;
  readonly target: ReviewResult["target"];

  constructor(input: {
    lane: ReviewPolicyCommandRequest["lane"];
    observedScope: ReviewScopeMode;
    selectedScope: ReviewScopeMode;
    target: ReviewResult["target"];
    correctedRequest: ReviewPolicyCommandRequest;
  }) {
    super("review producer scope does not match the selected scope",
      `Set scopeSelection.mode to ${input.observedScope}`, input.correctedRequest);
    this.name = "ReviewProducerScopeMismatchError";
    this.lane = input.lane;
    this.observedScope = input.observedScope;
    this.selectedScope = input.selectedScope;
    this.target = input.target;
  }
}

function producerSource(result: ReviewResult): string {
  return result.kind === "attested-local" ? "delegated-agent" : result.sourceIdentity;
}

function standardProjection(result: Exclude<ReviewResult, { kind: "frontline" }>): ReviewPolicyCommandRequest["standardReview"] {
  const requirement = result.requirement;
  return {
    obligation: requirement.obligation,
    reasons: requirement.reasons,
    rubricVersion: requirement.rubricVersion,
    rubricDigest: requirement.rubricDigest,
    retrigger: requirement.retrigger,
    count: requirement.count,
  };
}

function resultMatchesPolicy(result: ReviewResult, request: ReviewPolicyCommandRequest): boolean {
  if (result.kind === "frontline") return true;
  return canonicalize({ ...standardProjection(result), reasons: [...result.requirement.reasons].sort() })
    === canonicalize({ ...request.standardReview, reasons: [...request.standardReview.reasons].sort() });
}

function compatibleTerminalGrants(
  request: Pick<ReviewPolicyCommandRequest, "ceilingOverride" | "additionalPassAuthorization">,
  lane: ReviewPolicyCommandRequest["lane"],
  completedPasses: number,
): Pick<ReviewPolicyCommandRequest, "ceilingOverride" | "additionalPassAuthorization"> {
  const { ceilingOverride, additionalPassAuthorization } = request;
  return {
    ...(ceilingOverride?.lane === lane
      && ceilingOverride.exhaustedPassCount === completedPasses - 1
      && ceilingOverride.nextPass === completedPasses ? { ceilingOverride } : {}),
    ...(additionalPassAuthorization?.lane === lane
      && additionalPassAuthorization.completedPasses === completedPasses
      && additionalPassAuthorization.nextPass === completedPasses + 1 ? { additionalPassAuthorization } : {}),
  };
}

function correctedTerminalRequest(
  result: ReviewResult,
  request: ReviewPolicyCommandRequest,
  sources: readonly string[],
): ReviewPolicyCommandRequest {
  const lane = result.kind === "frontline" ? "frontline" : "standard";
  const scope = resultScope(result);
  const { invocation, terminus, ceilingOverride, additionalPassAuthorization, ...retained } = request;
  const preceding = lane === request.lane ? reconcileReviewFallbackAttempts({
    attempts: request.attempts.slice(0, -1), sources, terminalSourceId: producerSource(result),
    lane, scope, pullRequest: request.target.pullRequest,
  }) : [];
  const terminal = request.attempts.slice(-1).map(attempt => ({
    ...attempt, sourceId: producerSource(result), outcome: result.originalOutcome,
    ...(scope === "chunked" ? { chunkSeriesComplete: true } : {}),
  }));
  const attempts = [...preceding, ...terminal];
  const correctedInvocation = lane === request.lane
    ? reconcileReviewSourceInvocation({ invocation, sources, attempts }) : undefined;
  return ReviewPolicyCommandRequestSchema.parse({
    ...retained,
    lane,
    completedPasses: result.admission.logicalPass,
    attempts,
    scopeSelection: { mode: scope, target: request.scopeSelection?.target ?? request.target },
    standardReview: result.kind === "frontline" ? request.standardReview : standardProjection(result),
    ...(correctedInvocation === undefined ? {} : { invocation: correctedInvocation }),
    ...(lane === "standard" && terminus !== undefined ? { terminus } : {}),
    ...compatibleTerminalGrants({ ceilingOverride, additionalPassAuthorization }, lane, result.admission.logicalPass),
  });
}

function producerTargetMatches(
  result: ReviewResult,
  request: ReviewPolicyCommandRequest,
  currentTarget: ReviewResult["target"],
  operationId: string,
  historicalProducerId?: string,
): boolean {
  // Composition binds this producer id only after current contribution authority
  // approves it, including a changed diff base beneath an unchanged head.
  const historical = historicalProducerId === operationId;
  return currentTarget.headSha === request.target.headSha
    && result.repositoryId === currentTarget.repositoryId
    && result.target.kind === currentTarget.kind
    && (historical || canonicalize(result.target) === canonicalize(currentTarget));
}

function hostedTargetMatches(result: ReviewResult, request: ReviewPolicyCommandRequest): boolean {
  return result.kind !== "hosted"
    || (result.hostedTarget.repository.toLowerCase() === request.target.repository.toLowerCase()
      && result.hostedTarget.pullRequest === request.target.pullRequest
      && result.hostedTarget.headSha === result.target.headSha);
}

function validateTerminalResult(
  result: ReviewResult,
  request: ReviewPolicyCommandRequest,
  currentTargetInput: ReviewResult["target"],
  operationId: string,
  dependencies: Pick<EvidenceBoundReviewPolicyDependencies, "sources" | "maxPasses" | "historicalProducerId">,
): void {
  const currentTarget = validateReviewTarget(currentTargetInput);
  validateReviewTarget(result.target);
  if (result.producerId !== operationId) {
    throw new Error("review producer identity does not match the terminal attempt");
  }
  if (!producerTargetMatches(result, request, currentTarget, operationId, dependencies.historicalProducerId)) {
    throw new Error("review producer target does not match the current exact target");
  }
  if (!hostedTargetMatches(result, request)) {
    throw new Error("hosted review producer target does not match the policy target");
  }
  if ((result.originalOutcome === "clean") !== (result.findings.length === 0)) {
    throw new Error("review producer outcome does not match its complete finding set");
  }
  if (result.kind === "frontline" ? request.lane === "frontline" && result.outcome.maxPasses !== dependencies.maxPasses
    : result.admission.policyVersion !== result.requirement.policyVersion) {
    throw new Error("review producer policy or rubric does not match the policy request");
  }
  const correctedRequest = correctedTerminalRequest(result, request, dependencies.sources);
  if (correctedRequest.lane !== request.lane || producerSource(result) !== request.attempts.at(-1)?.sourceId) {
    throw new ReviewTerminalAttemptInputError("review producer source does not match the terminal attempt",
      `Set lane to ${correctedRequest.lane} and terminal attempt sourceId to ${producerSource(result)}`, correctedRequest);
  }
  if (result.admission.logicalPass !== request.completedPasses) {
    throw new ReviewTerminalAttemptInputError("review producer logical pass does not match completed progress",
      `Set completedPasses to ${result.admission.logicalPass}, including the completed terminal pass`, correctedRequest);
  }
  if (result.originalOutcome !== request.attempts.at(-1)?.outcome) {
    throw new ReviewTerminalAttemptInputError("review producer outcome does not match the terminal attempt",
      `Set terminal attempt outcome to ${result.originalOutcome}`, correctedRequest);
  }
  if (resultScope(result) !== requestScope(request)) {
    throw new ReviewProducerScopeMismatchError({
      lane: request.lane,
      observedScope: resultScope(result),
      selectedScope: requestScope(request),
      target: currentTarget,
      correctedRequest,
    });
  }
  if (!resultMatchesPolicy(result, request)) {
    throw new ReviewTerminalAttemptInputError("review producer policy or rubric does not match the policy request",
      `Set standardReview to the producer's requirement: ${JSON.stringify(correctedRequest.standardReview)}`, correctedRequest);
  }
}

const severityRank = {
  minor: 1,
  major: 2,
  critical: 3,
} as const satisfies Record<ReviewSeverity, number>;

function greaterSeverity(left: ReviewSeverity | null, right: ReviewSeverity): ReviewSeverity {
  return left === null || severityRank[right] > severityRank[left] ? right : left;
}

/** Resolve approved and performed response evidence for one immutable predecessor result. */
export async function readIncrementalPredecessorResponseEvidence(
  predecessor: ReviewResult,
  dispositionStore: ApprovedDispositionRecordStore,
  readResponsePerformance?: (
    predecessor: ReviewResult,
  ) => Promise<LaneResponsePerformance | null>,
): Promise<IncrementalPredecessorResponseEvidence> {
  if (predecessor.originalOutcome === "clean") {
    return { status: "performed", hasFix: false, requiredFindings: [] };
  }
  const predecessorRecord = await dispositionStore.readDispositionRecord(predecessor.producerId);
  if (predecessorRecord === null) {
    return { status: "incomplete", hasFix: false, requiredFindings: [] };
  }
  const approved = validateApprovedDispositionRecordForResult(predecessorRecord, predecessor);
  const node = currentApprovedDispositionNode(approved);
  const dispositions = node.approvedDisposition.dispositionSet.findings;
  const requiredFindings = dispositions
    .filter(({ sourceVerification, verifiedSeverity }) => sourceVerification === "verified"
      && isMaterialSeverity(verifiedSeverity))
    .map(({ findingId }) => {
      const finding = predecessor.findings.find((candidate) => candidate.findingId === findingId);
      if (finding === undefined) {
        throw new Error("approved material finding has no immutable producer finding");
      }
      return { producerId: predecessor.producerId, findingId, locus: finding.locus };
    });
  const hasFix = dispositions.some(({ disposition }) => disposition === "fix");
  const performance = hasFix && readResponsePerformance !== undefined
    ? await readResponsePerformance(predecessor).catch(() => null)
    : null;
  const laneFixPerformed = performance !== null
    && performance.producerId === predecessor.producerId
    && performance.dispositionSetId === node.approvedDisposition.dispositionSet.dispositionSetId
    && performance.originatingHeadSha === predecessor.target.headSha;
  const fixPerformed = !hasFix
    || node.deliveryMemberFixResponse !== null
    || node.errandFixResponse !== null
    || laneFixPerformed;
  const hostSettlementPerformed = predecessor.kind !== "hosted"
    || predecessor.hostSettlementFindingIds.length === 0
    || predecessor.settled;
  return {
    status: fixPerformed && hostSettlementPerformed ? "performed" : "incomplete",
    hasFix,
    requiredFindings,
  };
}

async function deriveVerifiedTerminalSignal(
  result: ReviewResult,
  operationId: string,
  dependencies: Pick<
    EvidenceBoundReviewPolicyDependencies,
    "resultReader" | "dispositionStore" | "confirmIncrementalApplicability" | "readResponsePerformance"
      | "allowUnapprovedFindings"
  >,
): Promise<VerifiedTerminalReviewSignal> {
  const coverageAdequate = result.kind !== "frontline" && result.requirement.retrigger === "full-final"
    ? result.admission.effectiveCoverage === "complete"
    : (await resolveIncrementalCoverageBasis(result, {
    resultReader: dependencies.resultReader,
    confirmApplicability: dependencies.confirmIncrementalApplicability
      ?? ((predecessor, current) => Promise.resolve(
        predecessor.target.headSha === current.target.headSha ? "applicable" : "unavailable",
      )),
    readResponseEvidence: (predecessor) => readIncrementalPredecessorResponseEvidence(
      predecessor,
      dependencies.dispositionStore,
      dependencies.readResponsePerformance,
    ),
  })).status === "adequate";
  if (result.originalOutcome === "clean") {
    return {
      reviewOperationId: operationId,
      confirmedFindingCount: 0,
      maxConfirmedSeverity: null,
      materialFix: false,
      coverageAdequate,
    };
  }
  const record = await dependencies.dispositionStore.readDispositionRecord(operationId);
  if (record === null) {
    if (dependencies.allowUnapprovedFindings === true) {
      // Only the pre-publication response route consumes this provisional signal.
      // It cannot count findings or settle policy before the disposition exists.
      return {
        reviewOperationId: operationId,
        confirmedFindingCount: 0,
        maxConfirmedSeverity: null,
        materialFix: false,
        coverageAdequate,
      };
    }
    throw new Error("terminal findings producer has no approved disposition record");
  }
  const approved = validateApprovedDispositionRecordForResult(record, result);
  const current = currentApprovedDispositionNode(approved);
  const findings = current.approvedDisposition.dispositionSet.findings;
  let confirmedFindingCount = 0;
  let maxConfirmedSeverity: ReviewSeverity | null = null;
  for (const finding of findings) {
    if (finding.sourceVerification !== "verified") continue;
    confirmedFindingCount += 1;
    maxConfirmedSeverity = greaterSeverity(maxConfirmedSeverity, finding.verifiedSeverity);
  }
  return {
    reviewOperationId: operationId,
    confirmedFindingCount,
    maxConfirmedSeverity,
    materialFix: fixesMaterialFinding(findings),
    coverageAdequate,
  };
}

/** The repository-proven subject facts the owning composition supplied, as reducer request fields. */
function provenSubjectFacts(
  dependencies: EvidenceBoundReviewPolicyDependencies,
): Pick<ReviewPolicyRequest, "frontlinePhaseClosed" | "errandVehicle" | "nextPassContext" | "selectionSources" | "configuredSources"> {
  return {
    ...(dependencies.selectionSources === undefined ? {} : { selectionSources: dependencies.selectionSources }),
    ...(dependencies.configuredSources === undefined ? {} : { configuredSources: dependencies.configuredSources }),
    ...(dependencies.nextPassContext === undefined ? {} : { nextPassContext: dependencies.nextPassContext }),
    ...(dependencies.frontlinePhaseClosed === true ? { frontlinePhaseClosed: true } : {}),
    ...(dependencies.errandVehicle === true ? { errandVehicle: true } : {}),
  };
}

/**
 * Bind a policy request after replacing a caller's terminal assertion with validated producer evidence.
 *
 * @param input - External command request containing only producer references for terminal attempts.
 * @param dependencies - Current target, configured policy, and repository-bound evidence readers.
 * @returns Internal reducer input containing only the verified signal derived from those records.
 */
export async function bindReviewPolicyEvidence(
  input: unknown,
  dependencies: EvidenceBoundReviewPolicyDependencies,
): Promise<ReviewPolicyRequest> {
  const request = ReviewPolicyCommandRequestSchema.parse(input);
  if (dependencies.frontlinePhaseClosed === true && request.lane !== "frontline") {
    throw new Error("frontline phase closure can be applied only to the frontline lane");
  }
  const lastAttempt = request.attempts.at(-1);
  if (lastAttempt === undefined
    || (lastAttempt.outcome !== "clean" && lastAttempt.outcome !== "findings")) {
    if (dependencies.terminalResponseSettled === true) {
      throw new Error("terminal response settlement has no findings producer");
    }
    return ReviewPolicyRequestSchema.parse({
      ...request,
      sources: dependencies.sources,
      maxPasses: dependencies.maxPasses,
      ...provenSubjectFacts(dependencies),
    });
  }
  const result = await dependencies.resultReader.readResult(lastAttempt.reviewOperationId);
  const currentTarget = await dependencies.confirmTarget(result.target);
  validateTerminalResult(
    result,
    request,
    currentTarget,
    lastAttempt.reviewOperationId,
    dependencies,
  );
  const verifiedTerminalSignal = await deriveVerifiedTerminalSignal(
    result,
    lastAttempt.reviewOperationId,
    dependencies,
  );
  if (dependencies.terminalResponseSettled === true) {
    const response = await readIncrementalPredecessorResponseEvidence(
      result, dependencies.dispositionStore, dependencies.readResponsePerformance,
    );
    if (response.status !== "performed") {
      throw new Error("settled terminal findings response lacks performed evidence");
    }
  }
  return ReviewPolicyRequestSchema.parse({
    ...request,
    sources: dependencies.sources,
    maxPasses: dependencies.maxPasses,
    verifiedTerminalSignal,
    ...(dependencies.terminalResponseSettled === true ? { terminalResponseSettled: true } : {}),
    ...provenSubjectFacts(dependencies),
  });
}

/**
 * Resolve policy after replacing a caller's terminal assertion with validated producer evidence.
 *
 * @param input - External command request containing only producer references for terminal attempts.
 * @param dependencies - Current target, configured policy, and repository-bound evidence readers.
 * @returns The pure policy transition derived from the immutable producer and approved findings.
 */
export async function resolveEvidenceBoundReviewPolicy(
  input: unknown,
  dependencies: EvidenceBoundReviewPolicyDependencies,
): Promise<ReviewResolveEnvelope> {
  return resolveReviewPolicy(await bindReviewPolicyEvidence(input, dependencies));
}

async function responsePerformedForTerminal(
  attempt: ReviewPolicyCommandRequest["attempts"][number] | undefined,
  responsePerformed: boolean,
  resultReader: ReviewResultReader,
  dependencies: EvidenceBoundReviewPolicyDependencies,
): Promise<boolean> {
  if (!responsePerformed || attempt?.outcome !== "findings") return false;
  const result = await resultReader.readResult(attempt.reviewOperationId);
  const evidence = await readIncrementalPredecessorResponseEvidence(
    result, dependencies.dispositionStore, dependencies.readResponsePerformance,
  );
  return evidence.status === "performed";
}

/** Choose the terminal or its next pass from verified coverage and response state. */
export function continuationChoice(input: {
  terminal: ReviewResolveEnvelope;
  additionalPass: ReviewResolveEnvelope | null;
  terminalOutcome?: string;
  currentResponsePerformed: boolean;
  coverageSelected: boolean;
  nextPassContext?: ReviewNextPassContext;
  retrigger?: "none" | "full-final" | "incremental";
}): "terminal" | "additional" | "fresh" {
  const { terminal, additionalPass, terminalOutcome, currentResponsePerformed, coverageSelected } = input;
  if (additionalPass !== null && terminal.state === "pass-complete"
    && (terminalOutcome === "clean" || currentResponsePerformed)) return "additional";
  if (terminal.state === "findings" && currentResponsePerformed) return "fresh";
  const completeSuccessor = input.retrigger === "full-final"
    && input.nextPassContext?.convergence === "converged" && !input.nextPassContext.responseDue;
  if (terminal.state === "coverage-required" && (coverageSelected || completeSuccessor)
    && (!terminal.payload.responseRequired || currentResponsePerformed)) return "fresh";
  return "terminal";
}

/**
 * Resolve a terminal result and, only after its response is durably performed, enter the next logical pass.
 *
 * @param input - External command request retaining the terminal producer reference.
 * @param response - Durable response-performance fact for that terminal findings producer.
 * @param dependencies - Repository-bound evidence readers and configured policy.
 * @returns The terminal policy result, or the authorized successor after performed response.
 */
export async function bindReviewPolicyContinuationEvidence(
  input: unknown,
  response: {
    readonly terminalResponsePerformed: boolean;
    readonly coverageSelected?: boolean;
  },
  dependencies: EvidenceBoundReviewPolicyDependencies,
): Promise<ReviewPolicyRequest> {
  const request = ReviewPolicyCommandRequestSchema.parse(input);
  const terminalAttempt = request.attempts.at(-1);
  const terminalOperationId = terminalAttempt?.outcome === "findings" || terminalAttempt?.outcome === "clean"
    ? terminalAttempt.reviewOperationId : undefined;
  let terminalResult: Promise<ReviewResult> | undefined;
  const resultReader: ReviewResultReader = {
    readResult: (producerId) => {
      if (producerId !== terminalOperationId) {
        return dependencies.resultReader.readResult(producerId);
      }
      terminalResult ??= dependencies.resultReader.readResult(producerId);
      return terminalResult;
    },
  };
  const producer = terminalOperationId === undefined ? undefined : await resultReader.readResult(terminalOperationId);
  const terminalRequest = producer === undefined ? request : ReviewPolicyCommandRequestSchema.parse({
    ...request,
    scopeSelection: { mode: producer.admission.scopeMode, target: request.target },
    ceilingOverride: undefined,
    additionalPassAuthorization: undefined,
  });
  const boundTerminal = await bindReviewPolicyEvidence(terminalRequest, {
    ...dependencies,
    resultReader,
  });
  const terminal = resolveReviewPolicy(boundTerminal);
  const additionalPass = request.additionalPassAuthorization === undefined
    ? null
    : resolveReviewPolicy({
        ...boundTerminal,
        scopeSelection: request.scopeSelection,
        additionalPassAuthorization: request.additionalPassAuthorization,
      });
  if (additionalPass?.state === "invalid-override") return {
    ...boundTerminal, scopeSelection: request.scopeSelection,
    additionalPassAuthorization: request.additionalPassAuthorization,
  };
  // A settled outcome alone does not prove that the current findings response was performed.
  const currentResponsePerformed = await responsePerformedForTerminal(
    terminalAttempt, response.terminalResponsePerformed, resultReader, dependencies,
  );
  const choice = continuationChoice({
    terminal, additionalPass, terminalOutcome: terminalAttempt?.outcome,
    currentResponsePerformed, coverageSelected: response.coverageSelected === true,
    nextPassContext: dependencies.nextPassContext, retrigger: request.standardReview.retrigger,
  });
  if (choice === "terminal") return boundTerminal;
  if (choice === "additional" && additionalPass !== null) return {
    ...boundTerminal, scopeSelection: request.scopeSelection,
    additionalPassAuthorization: request.additionalPassAuthorization,
  };
  return ReviewPolicyRequestSchema.parse({
    ...request,
    attempts: [],
    sources: dependencies.sources,
    maxPasses: dependencies.maxPasses,
    ...provenSubjectFacts(dependencies),
  });
}

/** Resolve the evidence-bound terminal or its authorized successor through the policy reducer. */
export async function resolveEvidenceBoundReviewPolicyContinuation(
  input: unknown,
  response: { readonly terminalResponsePerformed: boolean; readonly coverageSelected?: boolean },
  dependencies: EvidenceBoundReviewPolicyDependencies,
): Promise<ReviewResolveEnvelope> {
  return resolveReviewPolicy(await bindReviewPolicyContinuationEvidence(input, response, dependencies));
}

/**
 * Resolve and require one exact evidence-bound capacity-spending action.
 *
 * @param input - Policy request retaining any terminal producer reference.
 * @param response - Durable response-performance fact for the terminal findings producer.
 * @param expectation - Exact source and action the caller is about to spend.
 * @param dependencies - Repository-bound evidence readers and configured policy.
 * @returns The exact ready policy envelope authorizing the expected action.
 */
export async function assertEvidenceBoundReviewExecutionAdmission(
  input: unknown,
  response: {
    readonly terminalResponsePerformed: boolean;
    readonly coverageSelected?: boolean;
  },
  expectation: {
    readonly sourceId: string;
    readonly nextAction: "local-prepare" | "hosted-request";
  },
  dependencies: EvidenceBoundReviewPolicyDependencies,
): Promise<Extract<ReviewResolveEnvelope, { state: "ready" }>> {
  const request = ReviewPolicyCommandRequestSchema.parse(input);
  const resolution = await resolveEvidenceBoundReviewPolicyContinuation(request, response, dependencies);
  requireDriverAdmission(resolution, expectation, { request });
  return resolution;
}
