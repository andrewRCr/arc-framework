/** Source and settlement invariants for one durable lane attempt. */

import { z } from "zod";
import { canonicalize } from "../../../lib/kernel/index.js";
import { validateReviewRequirement, validateReviewTarget } from "./gate-contract-v2.js";
import { HostedProviderIdSchema, hostedLaneAttemptId, hostedRequestHandleMatchesProgress } from "../hosted/request.js";
import type { HostedResultDigestPreimage, LaneProgressState } from "./operation-state-schema.js";

type LaneAttempt = LaneProgressState["attempts"][number];
type HostedAttempt = NonNullable<LaneAttempt["hosted"]>;

function frontlineMatchesAdmission(attempt: LaneAttempt): boolean {
  const frontline = attempt.frontline;
  if (frontline === undefined) return true;
  const source = frontline.admission.frontlineReview.source;
  return source !== null
    && attempt.attemptId === frontline.admission.operationId
    && attempt.logicalPass === frontline.admission.logicalPass
    && attempt.retryGeneration === frontline.admission.retryGeneration
    && attempt.headSha === frontline.admission.target.headSha
    && attempt.sourceId === source.sourceId;
}

function hostedMatchesAdmission(attempt: LaneAttempt): boolean {
  const hosted = attempt.hosted;
  if (hosted === undefined) return true;
  const admission = hosted.admission;
  return attempt.logicalPass === admission.logicalPass
    && attempt.sourceId === admission.sourceId
    && attempt.headSha === admission.target.headSha
    && canonicalize(hosted.target) === canonicalize(admission.target)
    && hosted.requestedCoverage === admission.requestedCoverage
    && canonicalize(hosted.vehicle ?? null)
      === canonicalize(admission.vehicle?.kind === "delivery-member" ? admission.vehicle : null)
    && canonicalize(hosted.reviewTarget) === canonicalize(admission.reviewTarget)
    && canonicalize(hosted.requirement) === canonicalize(admission.requirement)
    && hosted.actorIdentity === admission.actorIdentity;
}

function validateSourceBinding(attempt: LaneAttempt, context: z.RefinementCtx): void {
  const bindingCount = [attempt.hosted, attempt.local, attempt.frontline]
    .filter((binding) => binding !== undefined).length;
  if (bindingCount > 1) {
    context.addIssue({
      code: "custom",
      message: "one lane attempt cannot carry multiple source bindings",
    });
  }
  if (attempt.local !== undefined && attempt.sourceId !== "delegated-agent") {
    context.addIssue({
      code: "custom",
      path: ["sourceId"],
      message: "local attempt source must be delegated-agent",
    });
  }
  if (attempt.local !== undefined && attempt.local.operationId !== attempt.attemptId) {
    context.addIssue({
      code: "custom",
      path: ["local", "operationId"],
      message: "local attempt operation must match its attempt identity",
    });
  }
  if (attempt.hosted !== undefined && !HostedProviderIdSchema.safeParse(attempt.sourceId).success) {
    context.addIssue({
      code: "custom",
      path: ["sourceId"],
      message: "hosted attempt source must be a hosted provider",
    });
  }
  const frontline = attempt.frontline;
  if (!frontlineMatchesAdmission(attempt)) {
    context.addIssue({
      code: "custom",
      path: ["frontline"],
      message: "frontline progress must match its admitted producer",
    });
  }
  if (frontline !== undefined) {
    const complete = attempt.outcome === "clean"
      || attempt.outcome === "findings"
      || attempt.outcome === "settled-findings";
    if (complete !== (frontline.effectiveCoverage === "complete")
      || complete !== attempt.terminalProducer) {
      context.addIssue({
        code: "custom",
        path: ["frontline"],
        message: "frontline coverage and terminal authority must match a complete result",
      });
    }
  }
}

function validateResponsePerformance(attempt: LaneAttempt, context: z.RefinementCtx): void {
  const responsePerformances = [
    ...(attempt.responsePerformanceHistory ?? []),
    ...(attempt.responsePerformance === undefined ? [] : [attempt.responsePerformance]),
  ];
  if (responsePerformances.some((performance) => (
    performance.producerId !== attempt.attemptId
      || performance.originatingHeadSha !== attempt.headSha
  ))
    || (responsePerformances.length > 0
      && (!attempt.terminalProducer
        || (attempt.outcome !== "findings" && attempt.outcome !== "settled-findings")))) {
    context.addIssue({
      code: "custom",
      path: ["responsePerformance"],
      message: "lane response performance must bind its terminal findings producer",
    });
  }
  const responseDispositionSetIds = responsePerformances.map(({ dispositionSetId }) => dispositionSetId);
  if (!responseHistoryValid(attempt, responseDispositionSetIds)) {
    context.addIssue({
      code: "custom",
      path: ["responsePerformanceHistory"],
      message: "lane response performance history must be unique, retained, and non-hosted",
    });
  }
}

function responseHistoryValid(attempt: LaneAttempt, dispositionSetIds: readonly string[]): boolean {
  return new Set(dispositionSetIds).size === dispositionSetIds.length
    && !(attempt.responsePerformanceHistory !== undefined
      && attempt.responsePerformanceHistory.length > 0
      && attempt.responsePerformance === undefined)
    && !(attempt.hosted !== undefined && (attempt.responsePerformanceHistory?.length ?? 0) > 0);
}

function validateHostedAdmission(attempt: LaneAttempt, context: z.RefinementCtx): void {
  if (attempt.hosted === undefined) return;
  try {
    const target = validateReviewTarget(attempt.hosted.reviewTarget);
    validateReviewRequirement(target, attempt.hosted.requirement);
    if (target.headSha !== attempt.hosted.target.headSha) {
      context.addIssue({
        code: "custom",
        path: ["hosted", "target", "headSha"],
        message: "hosted and review targets must identify the same head",
      });
    }
    if ((target.kind === "delivery-member") !== (attempt.hosted.vehicle !== undefined)) {
      context.addIssue({
        code: "custom",
        path: ["hosted", "vehicle"],
        message: "hosted delivery-member targets require one exact delivery vehicle",
      });
    }
    if (attempt.hosted.vehicle !== undefined && attempt.hosted.vehicle.head !== target.headSha) {
      context.addIssue({
        code: "custom",
        path: ["hosted", "vehicle", "head"],
        message: "hosted delivery vehicle must identify the review target head",
      });
    }
    const admission = attempt.hosted.admission;
    if (!hostedMatchesAdmission(attempt)) {
      throw new Error("hosted lane attempt does not match its durable admission");
    }
    const handle = attempt.hosted.handle;
    const expectedAttemptId = handle === undefined
      ? admission.admissionId
      : hostedLaneAttemptId(handle);
    if (attempt.attemptId !== expectedAttemptId) {
      context.addIssue({
        code: "custom",
        path: ["attemptId"],
        message: handle === undefined
          ? "unacknowledged hosted attempt identity must match its admission"
          : "acknowledged hosted attempt identity must derive from its handle",
      });
    }
    if (handle !== undefined && !hostedRequestHandleMatchesProgress(handle, { admission })) {
      context.addIssue({
        code: "custom",
        path: ["hosted", "handle"],
        message: "hosted request handle does not match its lane-attempt binding",
      });
    }
  } catch (error) {
    context.addIssue({
      code: "custom",
      path: ["hosted", "reviewTarget"],
      message: error instanceof Error ? error.message : "invalid hosted review binding",
    });
  }
}

function validateHostedCoverageEvidence(attempt: LaneAttempt, context: z.RefinementCtx): void {
  const hosted = attempt.hosted;
  const sealedResult = hosted?.sealedResult;
  if (hosted?.handle === undefined || sealedResult === undefined) return;
  const nativeIncremental = hosted.requestedCoverage === "incremental"
    && hosted.effectiveCoverage !== "complete";
  const evidence = sealedResult.coverageEvidence;
  if (nativeIncremental !== (evidence !== undefined)) {
    context.addIssue({
      code: "custom",
      path: ["hosted", "sealedResult", "coverageEvidence"],
      message: nativeIncremental
        ? "provider-native incremental sealed results require coverage evidence"
        : "provider-native coverage evidence belongs only to incremental hosted results",
    });
  }
  if (evidence !== undefined) {
    const established = evidence.status === "established";
    if (!hostedCoverageEvidenceMatchesRange(hosted)) {
      context.addIssue({
        code: "custom",
        path: ["hosted", "sealedResult", "coverageEvidence"],
        message: "hosted provider evidence does not establish its admitted request generation and range",
      });
    }
    const expectedCoverage = established ? "incremental" : null;
    if (hosted.effectiveCoverage !== expectedCoverage) {
      context.addIssue({
        code: "custom",
        path: ["hosted", "effectiveCoverage"],
        message: "hosted effective coverage must derive from its sealed provider evidence",
      });
    }
  } else if (hosted.effectiveCoverage !== hosted.handle.effectiveCoverage) {
    context.addIssue({
      code: "custom",
      path: ["hosted", "effectiveCoverage"],
      message: "hosted effective coverage must derive from its acknowledged carrier result",
    });
  }
}

function hostedCoverageEvidenceMatchesRange(hosted: HostedAttempt): boolean {
  const evidence = hosted.sealedResult?.coverageEvidence;
  const handle = hosted.handle;
  if (evidence === undefined || handle === undefined) return false;
  if (evidence.requestArtifactId !== handle.artifact.id) return false;
  if (evidence.status !== "established") return true;
  const scope = hosted.admission.correctionScope;
  return scope !== undefined
    && scope.predecessorHeadSha.startsWith(evidence.baselineSha)
    && scope.headSha.startsWith(evidence.headSha)
    && evidence.providerGeneration.updatedAt >= handle.artifact.createdAt;
}

function validateSealedResult(
  attempt: LaneAttempt,
  context: z.RefinementCtx,
  computeHostedResultId: (input: HostedResultDigestPreimage) => string,
): void {
  if (attempt.hosted === undefined) return;
  const sealedResult = attempt.hosted.sealedResult;
  const originalOutcome = attempt.outcome === "settled-findings" ? "findings" : attempt.outcome;
  const verdictBearing = originalOutcome === "clean" || originalOutcome === "findings";
  if (verdictBearing !== (sealedResult !== undefined)
    || verdictBearing !== attempt.terminalProducer
    || (sealedResult !== undefined && sealedResult.outcome !== originalOutcome)) {
    context.addIssue({
      code: "custom",
      path: ["hosted", "sealedResult"],
      message: "hosted terminal authority must exactly match one sealed producer result",
    });
  }
  if (sealedResult !== undefined) {
    const hosted = attempt.hosted;
    if (hosted.handle === undefined) {
      context.addIssue({
        code: "custom",
        path: ["hosted", "sealedResult"],
        message: "hosted sealed result requires its acknowledged execution binding",
      });
    } else {
      validateHostedCoverageEvidence(attempt, context);
      const expectedResultId = computeHostedResultId({
        attemptId: attempt.attemptId,
        admission: hosted.admission,
        handle: hosted.handle,
        target: hosted.target,
        requestedCoverage: hosted.requestedCoverage,
        effectiveCoverage: hosted.effectiveCoverage,
        ...(hosted.vehicle === undefined ? {} : { vehicle: hosted.vehicle }),
        reviewTarget: hosted.reviewTarget,
        requirement: hosted.requirement,
        outcome: sealedResult.outcome,
        reviewUrl: sealedResult.reviewUrl,
        findings: sealedResult.findings,
        ...(sealedResult.coverageEvidence === undefined
          ? {}
          : { coverageEvidence: sealedResult.coverageEvidence }),
      });
      if (sealedResult.hostedResultId !== expectedResultId) {
        context.addIssue({
          code: "custom",
          path: ["hosted", "sealedResult", "hostedResultId"],
          message: "hosted result identity does not match its canonical producer content",
        });
      }
    }
  } else if (attempt.hosted.effectiveCoverage !== null) {
    context.addIssue({
      code: "custom",
      path: ["hosted", "effectiveCoverage"],
      message: "hosted effective coverage requires one sealed terminal result",
    });
  }
}

function validateHostedFindingReferences(
  attempt: LaneAttempt,
  findingIds: readonly string[],
  context: z.RefinementCtx,
): void {
  if (attempt.hosted === undefined) return;
  if (new Set(attempt.hosted.settledFindingIds).size !== attempt.hosted.settledFindingIds.length
    || attempt.hosted.settledFindingIds.some((findingId) => !findingIds.includes(findingId))) {
    context.addIssue({
      code: "custom",
      path: ["hosted", "settledFindingIds"],
      message: "settled hosted finding IDs must be a unique subset of the attempt findings",
    });
  }
  if (attempt.hosted.dispositionSetId === null && attempt.hosted.settledFindingIds.length > 0) {
    context.addIssue({
      code: "custom",
      path: ["hosted", "dispositionSetId"],
      message: "hosted findings cannot settle before an approved disposition set is bound",
    });
  }
  if (attempt.hosted.settlementEvidence.some((evidence) => !findingIds.includes(evidence.findingId))) {
    context.addIssue({
      code: "custom",
      path: ["hosted", "settlementEvidence"],
      message: "hosted settlement evidence must reference an attempt finding",
    });
  }
}

function validateHostedSettlement(attempt: LaneAttempt, context: z.RefinementCtx): void {
  if (attempt.hosted === undefined) return;
  const findingIds = attempt.hosted.sealedResult?.findings.map(({ findingId }) => findingId) ?? [];
  validateHostedFindingReferences(attempt, findingIds, context);
  for (const [index, node] of attempt.hosted.dispositionSetLineage.entries()) {
    const actionFindingIds = node.findingActions.map(({ findingId }) => findingId).sort();
    if (canonicalize(actionFindingIds) !== canonicalize([...findingIds].sort())) {
      context.addIssue({
        code: "custom",
        path: ["hosted", "dispositionSetLineage", index, "findingActions"],
        message: "hosted disposition-set actions must exactly cover the attempt findings",
      });
    }
  }
  const currentEvidenceFindingIds = attempt.hosted.dispositionSetId === null
    ? []
    : attempt.hosted.settlementEvidence
      .filter(({ dispositionSetId }) => dispositionSetId === attempt.hosted?.dispositionSetId)
      .map(({ findingId }) => findingId)
      .sort();
  if (canonicalize(currentEvidenceFindingIds)
    !== canonicalize([...attempt.hosted.settledFindingIds].sort())) {
    context.addIssue({
      code: "custom",
      path: ["hosted", "settlementEvidence"],
      message: "current hosted settlement IDs must have exact current-set evidence",
    });
  }
  if ((attempt.outcome === "terminal-failure") !== (attempt.hosted.requestFailureReason !== null)) {
    context.addIssue({
      code: "custom",
      path: ["hosted", "requestFailureReason"],
      message: "hosted terminal request failure must retain exactly one reason",
    });
  }
  const complete = hostedFindingsSettlementComplete(attempt, findingIds);
  if ((attempt.outcome === "settled-findings") !== complete) {
    context.addIssue({
      code: "custom",
      path: ["outcome"],
      message: "settled-findings must exactly match complete hosted finding settlement",
    });
  }
}

function hostedFindingsSettlementComplete(attempt: LaneAttempt, findingIds: readonly string[]): boolean {
  const hosted = attempt.hosted;
  if (hosted === undefined) return false;
  const currentNode = hosted.dispositionSetLineage.at(-1);
  const dispositionHasFix = currentNode?.findingActions.some(({ disposition }) => disposition === "fix") ?? false;
  const responseComplete = !dispositionHasFix
    || attempt.responsePerformance?.dispositionSetId === hosted.dispositionSetId;
  return findingIds.length > 0
    && hosted.settledFindingIds.length === findingIds.length
    && responseComplete;
}

export function validateLaneAttempt(
  attempt: LaneAttempt,
  context: z.RefinementCtx,
  computeHostedResultId: (input: HostedResultDigestPreimage) => string,
): void {
  validateSourceBinding(attempt, context);
  validateResponsePerformance(attempt, context);
  if (attempt.hosted === undefined) return;
  validateHostedAdmission(attempt, context);
  validateSealedResult(attempt, context, computeHostedResultId);
  validateHostedSettlement(attempt, context);
}
