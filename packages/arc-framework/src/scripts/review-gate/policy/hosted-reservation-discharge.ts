/** Discharge evidence for a hosted-review reservation carried across publication. */

import {
  DeliveryReviewMemberVehicleSchema,
  sameDeliveryReviewMemberVehicle,
  type DeliveryReviewMemberVehicle,
} from "../../../lib/delivery/review-vehicle.js";
import { canonicalize } from "../../../lib/canonical/canonical-json.js";
import type { DeliveryHostChangeRequest, DeliveryHostPort } from "../../../lib/delivery/host.js";
import { readConfigSettings } from "../../../lib/config/status-reader.js";
import { RepositoryGitCommonStatePublisher } from "../../../lib/git-common-state.js";
import type { GitExec } from "../../../lib/git/index.js";
import { createRawGitExec } from "../../../lib/io-context.js";
import type { CandidateManagedRecordV1 } from "../../../lib/work-unit/candidate-attestation.js";
import type {
  DeliveryDischargeTargetBinding,
  DeliveryDischargeTargetLookup,
} from "../core/delivery-member-lookup.js";
import { resolveRepositoryIdentity } from "../hosts/local/git-common-state.js";
import { LocalApprovedDispositionRecordStore } from
  "../hosts/local/disposition-record-store.js";
import { LocalReviewOperationStateStore } from "../hosts/local/operation-state-store.js";
import { createRepositoryReviewResultReader } from
  "../hosts/local/review-result-reader-composition.js";
import {
  laneProgressOperationId,
  readLaneProgressAcrossLineage,
  type LaneProgressProjection,
} from "../lane-progress.js";
import type { StandardReviewReservationV1 } from "./integration-boundary-locus.js";
import type { EarlierHostedAttemptApplicabilityRead } from "./earlier-review-applicability.js";
import type { ReviewContributionApplicabilityResult } from
  "./review-contribution-applicability.js";
import type { HostedFindingsResponsePlan } from "../core/response-plan-schema.js";
import type { ReviewResult } from "../core/review-result.js";
import { projectHostedFinding, type HostedAwaitEnvelope } from "../hosted/await.js";
import { HostedProviderIdSchema, type HostedReviewCoverage } from "../hosted/request.js";
import { hostedProviderAdmitsCoverage } from "../hosted/correction-review-capability.js";
import { bindReviewSourceReference } from "../core/review-source-reference.js";
import {
  candidateExpectsEarlierReviewAttempt,
  projectEarlierReviewApplicability,
} from "./earlier-review-applicability.js";
import type { ReviewResolveEnvelope } from "./review-policy-driver.js";
import { projectReviewPolicyAttempt } from "./review-policy-driver.js";
import {
  readIncrementalPredecessorResponseEvidence,
  resolveEvidenceBoundReviewPolicy,
} from "./review-policy-evidence.js";
import {
  IncrementalReviewScopeSchema,
  type IncrementalReviewScope,
} from "../core/incremental-review-scope.js";
import type {
  IncrementalPredecessorApplicability,
  IncrementalPredecessorResponseEvidence,
} from "./incremental-coverage-basis.js";
import {
  ReviewCoverageSelectionActionSchema,
  type ReviewCoverageSelectionAction,
  type ReviewCoverageSelectionChoice,
} from "./review-coverage-selection.js";

type ProjectedLaneAttempt = Extract<LaneProgressProjection, { status: "recorded" }>["attempts"][number];
type EarlierApplicableAttempt = Extract<
  EarlierHostedAttemptApplicabilityRead,
  { status: "complete" }
>["attempts"][number];

/** Minimal immutable producer identity eligible to seed one exact correction scope. */
export interface IncrementalCorrectionScopeCandidate {
  readonly attemptId: string;
  readonly logicalPass: number;
  readonly sourceId: string;
  readonly outcome: string;
  readonly producerTarget?: ReviewResult["target"];
}

/** Resolve one immutable predecessor against the current Candidate applicability projection. */
export function incrementalApplicabilityFromEarlierRead(input: {
  readonly producerId: string;
  readonly producerTarget: NonNullable<EarlierApplicableAttempt["producerTarget"]>;
  readonly earlier: EarlierHostedAttemptApplicabilityRead;
}): IncrementalPredecessorApplicability {
  if (input.earlier.status !== "complete") return "unavailable";
  const exact = input.earlier.attempts.filter((attempt) => (
    attempt.attemptId === input.producerId
    && attempt.producerTarget !== undefined
    && canonicalize(attempt.producerTarget) === canonicalize(input.producerTarget)
  ));
  if (exact.length !== 1) return "unavailable";
  const applicability = exact[0]?.applicability;
  return applicability === "retain-prior-attempt" || applicability === "request-review"
    ? "applicable"
    : "unavailable";
}

/** Confirm one predecessor against the current target's fresh applicability projection. */
export async function confirmIncrementalPredecessorApplicability(input: {
  readonly predecessor: ReviewResult;
  readonly current: ReviewResult;
  readonly readEarlierAttemptApplicability?: (
    sourceId: string,
  ) => Promise<EarlierHostedAttemptApplicabilityRead>;
}): Promise<IncrementalPredecessorApplicability> {
  const { predecessor, current } = input;
  const scope = current.admission.correctionScope;
  if (scope === undefined
    || scope.headSha !== current.target.headSha) return "unavailable";
  if (predecessor.target.headSha === current.target.headSha) return "applicable";
  const sourceId = predecessor.kind === "hosted"
    ? predecessor.sourceIdentity
    : predecessor.kind === "attested-local"
      ? predecessor.deliveryAdmission?.sourceId
      : undefined;
  if (sourceId === undefined || input.readEarlierAttemptApplicability === undefined) return "unavailable";
  return incrementalApplicabilityFromEarlierRead({
    producerId: predecessor.producerId,
    producerTarget: predecessor.target,
    earlier: await input.readEarlierAttemptApplicability(sourceId),
  });
}

/** Build the next exact correction scope from one responded predecessor result. */
export function buildIncrementalCorrectionScope(input: {
  readonly predecessor: ReviewResult;
  readonly currentHeadSha: string;
  readonly response: IncrementalPredecessorResponseEvidence;
}): IncrementalReviewScope | null {
  const { predecessor, response } = input;
  if (predecessor.kind === "frontline" || response.status !== "performed") return null;
  const predecessorScope = predecessor.admission.correctionScope;
  const basisHeadSha = predecessor.admission.effectiveCoverage === "complete"
    ? predecessor.target.headSha
    : predecessorScope?.headSha === predecessor.target.headSha
      ? predecessorScope.basisHeadSha
      : null;
  if (basisHeadSha === null) return null;
  const inheritedFindings = predecessor.admission.effectiveCoverage === "complete"
    ? []
    : predecessorScope?.requiredFindings ?? [];
  const findingKey = ({ producerId, findingId }: { readonly producerId: string; readonly findingId: string }) => (
    canonicalize([producerId, findingId])
  );
  const requiredFindings = new Map<string, (typeof response.requiredFindings)[number]>();
  for (const finding of [...inheritedFindings, ...response.requiredFindings]) {
    const key = findingKey(finding);
    const existing = requiredFindings.get(key);
    if (existing !== undefined && canonicalize(existing) !== canonicalize(finding)) return null;
    requiredFindings.set(key, finding);
  }
  return IncrementalReviewScopeSchema.parse({
    schemaVersion: 1,
    predecessorProducerId: predecessor.producerId,
    predecessorHeadSha: predecessor.target.headSha,
    basisHeadSha,
    headSha: input.currentHeadSha,
    requiredFindings: [...requiredFindings.values()].sort((left, right) => (
      left.producerId.localeCompare(right.producerId)
      || left.findingId.localeCompare(right.findingId)
      || left.locus.localeCompare(right.locus)
    )),
  });
}

function isCompleteStandardVerdict(attempt: ProjectedLaneAttempt): boolean {
  return attempt.local?.effectiveCoverage === "complete" || attempt.hosted?.effectiveCoverage === "complete";
}

function terminalPolicyOutcome(outcome: string): "clean" | "settled-findings" {
  if (outcome === "clean" || outcome === "settled-findings") return outcome;
  throw new Error("Terminal discharge evidence has no policy-bearing outcome.");
}

function currentCorrectionScopeCandidate(
  attempt: ProjectedLaneAttempt,
): IncrementalCorrectionScopeCandidate | null {
  const producerTarget = attempt.local?.target ?? attempt.hosted?.reviewTarget;
  if (producerTarget === undefined
    || (attempt.outcome !== "clean" && attempt.outcome !== "settled-findings")) return null;
  return {
    attemptId: attempt.attemptId,
    logicalPass: attempt.logicalPass,
    sourceId: attempt.sourceId,
    outcome: attempt.outcome,
    producerTarget,
  };
}

function attemptMatchesTarget(
  attempt: ProjectedLaneAttempt,
  stateHead: string,
  target: NonNullable<Parameters<typeof projectHostedReservationDischarge>[0]["target"]>,
): boolean {
  const hosted = attempt.hosted;
  if (hosted !== undefined) {
    return hosted.target.repository.toLowerCase() === target.repository.toLowerCase()
      && hosted.target.pullRequest === target.pullRequest
      && hosted.target.headSha === stateHead
      && sameDeliveryReviewMemberVehicle(target.vehicle, hosted.vehicle);
  }
  const local = attempt.local;
  if (local === undefined || local.target.headSha !== stateHead) return false;
  if (target.vehicle === undefined) return local.vehicle.kind === "work-unit";
  const admission = local.deliveryAdmission;
  return admission !== undefined
    && local.vehicle.kind === "delivery-member"
    && local.target.kind === "delivery-member"
    && sameDeliveryReviewMemberVehicle(target.vehicle, admission.vehicle)
    && admission.target.repository.toLowerCase() === target.repository.toLowerCase()
    && admission.target.pullRequest === target.pullRequest
    && admission.target.headSha === stateHead;
}

/** Safe source progress retained for the next request's standard-review driver admission. */
export interface HostedReservationRequestAttempt {
  readonly sourceId: string;
  readonly outcome: "rate-limited" | "transient-unavailable";
}

interface PendingFindingRoute {
  readonly sourceId: string;
  readonly responsePlan?: HostedFindingsResponsePlan;
  readonly localResumeAction?: { readonly schemaVersion: 1; readonly operationId: string };
}

function projectPendingFindings(
  attempts: readonly PendingFindingRoute[],
  timing: "current" | "retained",
): HostedReservationDischarge | null {
  if (attempts.length === 0) return null;
  const exact = attempts.length === 1 ? attempts[0] : undefined;
  if (exact?.responsePlan !== undefined && exact.localResumeAction === undefined) {
    return {
      discharged: false,
      detail: `Hosted source \`${exact.sourceId}\` has ${timing} findings awaiting disposition.`,
      nextSource: null,
      responsePlan: exact.responsePlan,
    };
  }
  if (exact?.localResumeAction !== undefined && exact.responsePlan === undefined) {
    return {
      discharged: false,
      detail: `Standard source \`${exact.sourceId}\` has ${timing === "retained" ? "retained " : ""}`
        + "local findings awaiting disposition.",
      nextSource: null,
      localResumeAction: exact.localResumeAction,
    };
  }
  return {
    discharged: false,
    detail: `The reserved standard-review sources have ${timing} findings without one exact response route.`,
    nextSource: null,
  };
}

function retainedSafeUnavailableAttempt(
  sourceId: string,
  attempts: readonly { readonly outcome: string }[],
): HostedReservationRequestAttempt | null {
  if (attempts.length === 0 || attempts.some(({ outcome }) => (
    outcome !== "rate-limited" && outcome !== "transient-unavailable"
  ))) return null;
  const outcome = attempts.at(-1)?.outcome;
  return outcome === "rate-limited" || outcome === "transient-unavailable"
    ? { sourceId, outcome }
    : null;
}

/** Whether the reserved hosted review has produced a verdict, with the evidence for that reading. */
export interface HostedReservationDischarge {
  discharged: boolean;
  detail: string;
  nextSource: string | null;
  applicability?: ReviewContributionApplicabilityResult;
  equivalentApplicabilities?: readonly ReviewContributionApplicabilityResult[];
  applicabilityAuthority?: "decision-required" | "blocked";
  responsePlan?: HostedFindingsResponsePlan;
  awaitAction?: HostedAwaitEnvelope;
  localResumeAction?: { readonly schemaVersion: 1; readonly operationId: string };
  requestAttempts?: readonly HostedReservationRequestAttempt[];
  requestCoverage?: HostedReviewCoverage;
  correctionScope?: IncrementalReviewScope;
  coverageSelectionAction?: ReviewCoverageSelectionAction;
}

function coverageSelectionChoices(
  sourceIds: readonly string[],
  correctionScope?: IncrementalReviewScope,
): ReviewCoverageSelectionChoice[] {
  return sourceIds.flatMap((sourceId) => {
    const complete: ReviewCoverageSelectionChoice = { sourceId, coverage: "complete" };
    if (sourceId === "delegated-agent") {
      return correctionScope === undefined
        ? [complete]
        : [{ sourceId, coverage: "incremental" }, complete];
    }
    const provider = HostedProviderIdSchema.safeParse(sourceId);
    return provider.success && hostedProviderAdmitsCoverage(provider.data, "incremental")
      ? [{ sourceId, coverage: "incremental" }, complete]
      : [complete];
  });
}

function oneRequestedCoverage(
  values: readonly (HostedReviewCoverage | undefined)[],
): HostedReviewCoverage | null | "conflict" {
  const coverages = new Set(values.filter(
    (value): value is HostedReviewCoverage => value !== undefined,
  ));
  if (coverages.size > 1) return "conflict";
  return coverages.values().next().value ?? null;
}

function requestedCoverageOf(
  attempts: readonly ProjectedLaneAttempt[],
): HostedReviewCoverage | null | "conflict" {
  return oneRequestedCoverage(attempts.map((attempt) => (
    attempt.local?.requestedCoverage ?? attempt.hosted?.requestedCoverage
  )));
}

function applicabilityEquivalenceKey(
  projection: ReviewContributionApplicabilityResult,
): string | null {
  if (projection.state !== "decision-required") return null;
  const selector = projection.selector;
  const currentVehicle = selector.currentVehicle;
  return canonicalize({
    member: currentVehicle === undefined
      ? { repository: selector.repository, pullRequest: selector.pullRequest }
      : {
          planId: currentVehicle.planId,
          deliverableId: currentVehicle.deliverableId,
          workUnitId: currentVehicle.workUnitId,
        },
    sourceId: selector.sourceId,
    currentHead: selector.currentHead,
    residual: {
      verdict: projection.verdict,
      paths: projection.paths,
      before: {
        predecessorTree: projection.projection.before.predecessor.tree,
        memberTree: projection.projection.before.member.tree,
      },
      after: {
        predecessorTree: projection.projection.after.predecessor.tree,
        memberTree: projection.projection.after.member.tree,
      },
    },
  });
}

/** Decide the work-unit obligation from its ordered member discharges. */
export function allHostedReservationTargetsDischarged(
  discharges: readonly { readonly discharged: boolean }[],
): boolean {
  return discharges.every(({ discharged }) => discharged);
}

/** One exact hosted target and its contribution span base. */
export interface HostedReservationTarget {
  readonly repository: string;
  readonly pullRequest: number;
  readonly headSha: string;
  readonly baseRevision: string;
  readonly position?: number;
  readonly memberCount?: number;
  readonly chunkKey?: string;
  readonly title?: string;
  readonly vehicle?: DeliveryReviewMemberVehicle;
}

/** Contained target derivation for singleton and delivery review obligations. */
export type HostedReservationTargetResolution =
  | {
    readonly status: "resolved";
    readonly kind: "singleton" | "delivery";
    readonly targets: readonly HostedReservationTarget[];
  }
  | { readonly status: "unavailable"; readonly targets: readonly [] };

/** Derive the current hosted-review targets without persisting a target list. */
export async function resolveHostedReservationTargets(input: {
  readonly workUnitId: string;
  readonly reservation: StandardReviewReservationV1 | null;
  readonly singleton: HostedReservationTarget;
  readonly delivery: DeliveryDischargeTargetLookup;
  readonly host: Pick<DeliveryHostPort, "readRequest">;
  /** Proven current request head for the state-bound terminal member only. */
  readonly terminalAdvance?: {
    readonly stateHead: string;
    readonly currentHead: string;
  };
  /** Historical terminal target retained while an exact prepared native operation lands only earlier members. */
  readonly preparedTerminal?: {
    readonly deliverableId: string;
    readonly stateHead: string;
  };
}): Promise<HostedReservationTargetResolution> {
  try {
    const marker = input.reservation?.target;
    if (marker !== undefined
      && marker.repository.toLowerCase() !== input.singleton.repository.toLowerCase()) {
      return { status: "unavailable", targets: [] };
    }
    if (marker?.kind === "pinned-head") {
      return { status: "resolved", kind: "singleton", targets: [input.singleton] };
    }
    if (marker?.kind === "delivery" && marker.workUnitId !== input.workUnitId) {
      return { status: "unavailable", targets: [] };
    }
    const resolved = await input.delivery.resolveDischargeTargets(input.workUnitId);
    if (resolved.status === "unbound" && marker === undefined) {
      return { status: "resolved", kind: "singleton", targets: [input.singleton] };
    }
    if (resolved.status !== "resolved" || resolved.targets.length === 0) {
      return { status: "unavailable", targets: [] };
    }
    const observedTargets: Array<{
      readonly binding: DeliveryDischargeTargetBinding;
      readonly index: number;
      readonly pullRequest: number;
      readonly request: DeliveryHostChangeRequest;
      readonly targetHead: string;
    }> = [];
    const requestIds = new Set<string>();
    for (const [index, binding] of resolved.targets.entries()) {
      if (marker?.kind === "delivery"
        && (binding.planId !== marker.planId || binding.workUnitId !== marker.workUnitId)) {
        return { status: "unavailable", targets: [] };
      }
      if (!/^[1-9][0-9]*$/u.test(binding.changeRequestId)) {
        return { status: "unavailable", targets: [] };
      }
      const pullRequest = Number(binding.changeRequestId);
      if (!Number.isSafeInteger(pullRequest)) return { status: "unavailable", targets: [] };
      const requestKey = `${binding.providerId}:${binding.changeRequestId}`;
      if (requestIds.has(requestKey)) return { status: "unavailable", targets: [] };
      requestIds.add(requestKey);
      const observed = await input.host.readRequest(input.singleton.repository, {
        providerId: binding.providerId,
        changeRequestId: binding.changeRequestId,
      });
      if (observed.status !== "observed") return { status: "unavailable", targets: [] };
      const request = observed.request;
      const expectedHeadRef = binding.ref?.replace(/^refs\/heads\//u, "") ?? null;
      const representedTerminalAdvance = input.terminalAdvance !== undefined
        && binding.position === binding.memberCount
        && index === resolved.targets.length - 1
        && binding.head === input.terminalAdvance.stateHead
        && request.headSha === input.terminalAdvance.currentHead;
      const representedPreparedTerminal = input.preparedTerminal !== undefined
        && binding.position === binding.memberCount
        && index === resolved.targets.length - 1
        && binding.deliverableId === input.preparedTerminal.deliverableId
        && binding.head === input.preparedTerminal.stateHead
        && request.state === "open";
      if (request.binding.providerId !== binding.providerId
        || request.binding.changeRequestId !== binding.changeRequestId
        || request.repository.toLowerCase() !== input.singleton.repository.toLowerCase()
        || request.headRepository.toLowerCase() !== input.singleton.repository.toLowerCase()
        || request.state === "closed"
        || (expectedHeadRef !== null && request.headRef !== expectedHeadRef)
        || (request.state === "open" && request.headSha !== binding.head
          && !representedTerminalAdvance && !representedPreparedTerminal)) {
        return { status: "unavailable", targets: [] };
      }
      const targetHead = representedPreparedTerminal ? binding.head : request.headSha;
      observedTargets.push({ binding, index, pullRequest, request, targetHead });
    }
    const retainedAuthoredMergedChain = observedTargets
      .filter(({ request }) => request.state === "merged")
      .every(({ binding, index, request }) => {
        const priorBinding = resolved.targets[index - 1];
        return request.headSha === binding.head
          && (priorBinding === undefined || binding.base === priorBinding.head);
      });
    const targets: HostedReservationTarget[] = [];
    let landedBaseRevision = input.singleton.baseRevision;
    for (const { binding, pullRequest, request, targetHead } of observedTargets) {
      const retainsAuthoredCoordinates = request.state === "merged" && retainedAuthoredMergedChain;
      targets.push({
        repository: input.singleton.repository,
        pullRequest,
        headSha: targetHead,
        baseRevision: request.state === "open" || retainsAuthoredCoordinates
          ? binding.base
          : landedBaseRevision,
        position: binding.position,
        memberCount: binding.memberCount,
        chunkKey: binding.chunkKey,
        title: binding.title,
        vehicle: DeliveryReviewMemberVehicleSchema.parse({
          kind: "delivery-member",
          planId: binding.planId,
          deliverableId: binding.deliverableId,
          workUnitId: binding.workUnitId,
          head: targetHead,
        }),
      });
      landedBaseRevision = targetHead;
    }
    return { status: "resolved", kind: "delivery", targets };
  } catch {
    return { status: "unavailable", targets: [] };
  }
}

/**
 * Decide whether a carried hosted-review reservation has been discharged.
 *
 * Discharge is a complete `clean` attempt by the first ordered source that
 * was not safely unavailable on the standard lane anywhere in the Candidate span. It is read rather than written because a discharge
 * write needs a caller who remembers to make it, and a reservation nobody cleared is the realized
 * failure this replaces. The span rather than the approved head alone: a review that ran before a
 * later fix landed still discharged the obligation, and gating on the head would replace the
 * workflow's own review-applicability judgment with a CLI gate.
 *
 * @param input - The carried reservation, the Candidate span, and the lane-progress read.
 * @returns The discharge verdict and the evidence sentence naming what settled it.
 */
export async function projectHostedReservationDischarge(input: {
  reservation: StandardReviewReservationV1 | null;
  span: readonly string[];
  target: {
    repository: string;
    pullRequest: number;
    headSha: string;
    vehicle?: DeliveryReviewMemberVehicle;
  } | null;
  readLaneProgress: (headSha: string) => Promise<LaneProgressProjection>;
  readEarlierAttemptApplicability?: (
    sourceId: string,
  ) => Promise<EarlierHostedAttemptApplicabilityRead>;
  requireEarlierApplicabilityEvidence?: boolean | ((sourceId: string) => boolean);
  bindCurrentAttemptRef?: (attemptId: string) => string;
  resolveTerminalPolicy: (attempt: ProjectedLaneAttempt) => Promise<ReviewResolveEnvelope>;
  resolveEarlierTerminalPolicy: (attempt: EarlierApplicableAttempt) => Promise<ReviewResolveEnvelope>;
  resolveIncrementalCorrectionScope?: (
    attempt: IncrementalCorrectionScopeCandidate,
    currentHeadSha: string,
  ) => Promise<IncrementalReviewScope | null>;
}): Promise<HostedReservationDischarge> {
  const { reservation } = input;
  if (reservation === null) {
    return { discharged: true, detail: "Local carrier `local-attestation`.", nextSource: null };
  }
  if (input.target === null) {
    return {
      discharged: false,
      detail: "The reserved hosted review has no exact open change-request target.",
      nextSource: reservation.sources[0] ?? null,
    };
  }
  const target = input.target;
  const attemptsByHead = new Map<string, ProjectedLaneAttempt[]>();
  const completedPassesByHead = new Map<string, number>();
  for (const headSha of input.span) {
    const progress = await input.readLaneProgress(headSha);
    if (progress.status !== "recorded") continue;
    completedPassesByHead.set(headSha, progress.completedPasses);
    attemptsByHead.set(headSha, progress.attempts.filter((attempt) => (
      attemptMatchesTarget(attempt, headSha, target)
    )));
  }
  const allAttempts = [...attemptsByHead.values()].flat();
  const currentAttemptHistory = attemptsByHead.get(target.headSha) ?? [];
  const currentAttempts = currentAttemptHistory;
  const completedPasses = Math.max(0, ...completedPassesByHead.values());
  const activeLogicalPass = completedPasses + 1;
  const activeCurrentAttempts = currentAttemptHistory.filter((attempt) => (
    attempt.logicalPass === activeLogicalPass
  ));
  const currentRequestCoverage = requestedCoverageOf(activeCurrentAttempts);
  if (currentRequestCoverage === "conflict") {
    return {
      discharged: false,
      detail: "The active review pass contains conflicting requested coverage.",
      nextSource: null,
    };
  }
  let requestCoverage: HostedReviewCoverage | null = currentRequestCoverage;
  const requestAttempts: HostedReservationRequestAttempt[] = [];
  const requestContext = () => ({
    requestAttempts,
    ...(requestCoverage === null ? {} : { requestCoverage }),
  });
  const currentFindingRoutes = reservation.sources.flatMap((sourceId) => (
    currentAttempts
      .filter((attempt) => attempt.sourceId === sourceId && attempt.outcome === "findings")
      .map((attempt): PendingFindingRoute => {
        if (attempt.local !== undefined) {
          return {
            sourceId,
            localResumeAction: { schemaVersion: 1, operationId: attempt.attemptId },
          };
        }
        if (attempt.hosted === undefined
          || attempt.hosted.sealedResult?.outcome !== "findings"
          || input.bindCurrentAttemptRef === undefined) return { sourceId };
        return {
          sourceId,
          responsePlan: {
            schemaVersion: 1,
            target: attempt.hosted.reviewTarget,
            source: {
              kind: "hosted",
              attemptRef: input.bindCurrentAttemptRef(attempt.attemptId),
            },
            findings: attempt.hosted.sealedResult.findings.map(projectHostedFinding),
          },
        };
      })
  ));
  const currentFindings = projectPendingFindings(currentFindingRoutes, "current");
  if (currentFindings !== null) return currentFindings;
  const pendingAttempts = currentAttempts.filter((attempt) => (
    attempt.outcome === "pending" && reservation.sources.includes(attempt.sourceId)
  ));
  if (pendingAttempts.length > 0) {
    const pending = pendingAttempts.length === 1 ? pendingAttempts[0] : undefined;
    if (pending?.hosted?.handle === undefined) {
      return {
        discharged: false,
        detail: "The reserved hosted sources have pending request progress without one exact durable handle.",
        nextSource: null,
      };
    }
    return {
      discharged: false,
      detail: `Hosted source \`${pending.sourceId}\` has one pending request awaiting a verdict.`,
      nextSource: null,
      awaitAction: { schemaVersion: 1, handle: pending.hosted.handle },
    };
  }
  const latestCurrentTerminalPass = currentAttempts.reduce<number | null>((latest, attempt) => (
    reservation.sources.includes(attempt.sourceId)
      && (attempt.outcome === "clean" || attempt.outcome === "settled-findings")
      && (latest === null || attempt.logicalPass > latest)
      ? attempt.logicalPass
      : latest
  ), null);
  let latestCurrentCorrectionCandidate: IncrementalCorrectionScopeCandidate | null = null;
  if (latestCurrentTerminalPass !== null) {
    const admittedLocalTerminal = [...currentAttemptHistory].reverse().find((attempt) => (
      attempt.logicalPass === latestCurrentTerminalPass
      && (attempt.outcome === "clean" || attempt.outcome === "settled-findings")
      && attempt.local?.deliveryAdmission !== undefined
    ));
    for (const sourceId of reservation.sources) {
      const sourceAttempts = currentAttemptHistory.filter((attempt) => (
        attempt.sourceId === sourceId && attempt.logicalPass === latestCurrentTerminalPass
      ));
      const currentTerminal = [...sourceAttempts].reverse().find((attempt) => (
        attempt.outcome === "clean" || attempt.outcome === "settled-findings"
      ));
      if (currentTerminal !== undefined) {
        const policy = await input.resolveTerminalPolicy(currentTerminal);
        if (policy.state === "pass-complete") {
          return {
            discharged: true,
            detail: currentTerminal.outcome === "clean"
              ? `${sourceId === "delegated-agent" ? "Standard" : "Hosted"} source \`${sourceId}\`.`
              : `${sourceId === "delegated-agent" ? "Standard" : "Hosted"} source \`${sourceId}\` converged with `
                + "no verified material findings.",
            nextSource: null,
          };
        }
        if (currentTerminal.outcome === "clean" || policy.state !== "findings") {
          const correctionCandidate = currentCorrectionScopeCandidate(currentTerminal);
          const correctionScope = policy.state === "coverage-required"
            && correctionCandidate !== null
            && input.resolveIncrementalCorrectionScope !== undefined
            ? await input.resolveIncrementalCorrectionScope(correctionCandidate, target.headSha)
            : null;
          const coverageSelectionAction = policy.state === "coverage-required" && target.vehicle !== undefined
            ? ReviewCoverageSelectionActionSchema.parse({
                schemaVersion: 1,
                kind: "review-coverage-selection",
                workUnitId: target.vehicle.workUnitId,
                sourceId: policy.payload.sourceId,
                pass: policy.payload.pass,
                completedPasses: policy.payload.completedPasses,
                consumedPass: policy.payload.consumedPass,
                choices: coverageSelectionChoices(
                  reservation.sources,
                  correctionScope ?? undefined,
                ),
                interactionText: "Select one listed source and coverage pair, then re-run `arc review status "
                  + `--work-unit ${target.vehicle.workUnitId} --source <sourceId> --coverage <coverage> --json\`.`,
              })
            : undefined;
          return {
            discharged: false,
            detail: `The terminal review producer did not establish convergence (${policy.state}/${policy.nextAction}).`,
            nextSource: null,
            ...(correctionScope === null ? {} : { correctionScope }),
            ...(coverageSelectionAction === undefined ? {} : { coverageSelectionAction }),
          };
        }
        latestCurrentCorrectionCandidate = currentCorrectionScopeCandidate(currentTerminal);
        break;
      }
      if (admittedLocalTerminal !== undefined) continue;
      if (retainedSafeUnavailableAttempt(sourceId, sourceAttempts) === null) break;
    }
  }
  const earlierBySource = new Map<string, EarlierHostedAttemptApplicabilityRead>();
  const readEarlier = async (sourceId: string): Promise<EarlierHostedAttemptApplicabilityRead | null> => {
    if (input.readEarlierAttemptApplicability === undefined) return null;
    const cached = earlierBySource.get(sourceId);
    if (cached !== undefined) return cached;
    const read = await input.readEarlierAttemptApplicability(sourceId);
    earlierBySource.set(sourceId, read);
    return read;
  };
  let activeEarlierBySource: Map<string, EarlierHostedAttemptApplicabilityRead> | null = null;
  const readActiveEarlier = async (sourceId: string): Promise<EarlierHostedAttemptApplicabilityRead | null> => {
    if (input.readEarlierAttemptApplicability === undefined) return null;
    if (activeEarlierBySource === null) {
      await Promise.all(reservation.sources.map((reservedSourceId) => readEarlier(reservedSourceId)));
      activeEarlierBySource = new Map([...earlierBySource].map(([reservedSourceId, read]) => [
        reservedSourceId,
        read,
      ]));
    }
    return activeEarlierBySource.get(sourceId) ?? null;
  };
  const correctionContext = async (): Promise<{ correctionScope?: IncrementalReviewScope }> => {
    if (input.resolveIncrementalCorrectionScope === undefined) return {};
    let candidate = latestCurrentCorrectionCandidate;
    if (candidate === null) {
      await Promise.all(reservation.sources.map((sourceId) => readActiveEarlier(sourceId)));
      const candidates = reservation.sources.flatMap((sourceId) => {
        const earlier = activeEarlierBySource?.get(sourceId);
        return earlier?.status === "complete"
          ? earlier.attempts.filter((attempt) => (
              (attempt.outcome === "clean" || attempt.outcome === "settled-findings")
              && (attempt.applicability === "request-review"
                || attempt.applicability === "retain-prior-attempt")
            ))
          : [];
      }).sort((left, right) => right.logicalPass - left.logicalPass
        || right.updatedAt.localeCompare(left.updatedAt)
        || left.attemptId.localeCompare(right.attemptId));
      candidate = candidates[0] ?? null;
    }
    if (candidate === null) return {};
    const correctionScope = await input.resolveIncrementalCorrectionScope(candidate, target.headSha);
    return correctionScope === null ? {} : { correctionScope };
  };
  const retainedFindingsBeforeRequest = async (): Promise<HostedReservationDischarge | null> => {
    if (input.readEarlierAttemptApplicability === undefined) return null;
    await Promise.all(reservation.sources.map((sourceId) => readActiveEarlier(sourceId)));
    const routes: PendingFindingRoute[] = [];
    for (const sourceId of reservation.sources) {
      const earlier = activeEarlierBySource?.get(sourceId);
      const evidenceRequired = typeof input.requireEarlierApplicabilityEvidence === "function"
        ? input.requireEarlierApplicabilityEvidence(sourceId)
        : input.requireEarlierApplicabilityEvidence === true;
      if (earlier === undefined || earlier.status === "unavailable") {
        return {
          discharged: false,
          detail: earlier?.status === "unavailable"
            ? earlier.detail
            : "Earlier review applicability evidence is incomplete.",
          nextSource: null,
        };
      }
      if ((earlier.status === "not-found" && evidenceRequired)
        || (earlier.status === "complete" && earlier.attempts.length === 0)) {
        return {
          discharged: false,
          detail: "Earlier review applicability evidence is incomplete.",
          nextSource: null,
        };
      }
      if (earlier.status !== "complete") continue;
      routes.push(...earlier.attempts
        .filter((attempt) => attempt.sourceId === sourceId && attempt.outcome === "findings")
        .map((attempt) => ({
          sourceId,
          ...(attempt.responsePlan === undefined ? {} : { responsePlan: attempt.responsePlan }),
          ...(attempt.localResumeAction === undefined
            ? {}
            : { localResumeAction: attempt.localResumeAction }),
        })));
    }
    return projectPendingFindings(routes, "retained");
  };
  const currentTerminalLogicalPass = reservation.sources.flatMap((sourceId) => (
    currentAttempts.filter((attempt) => attempt.sourceId === sourceId
      && attempt.outcome === "clean"
      && isCompleteStandardVerdict(attempt))
  ))[0]?.logicalPass;
  let retainedTerminalLogicalPass: number | undefined;
  if (currentTerminalLogicalPass === undefined && input.readEarlierAttemptApplicability !== undefined) {
    await Promise.all(reservation.sources.map((sourceId) => readActiveEarlier(sourceId)));
    retainedTerminalLogicalPass = reservation.sources.flatMap((sourceId) => {
      const earlier = activeEarlierBySource?.get(sourceId);
      return earlier?.status === "complete"
        ? earlier.attempts.filter((attempt) => attempt.outcome === "clean"
          && attempt.effectiveCoverage === "complete"
          && attempt.applicability === "retain-prior-attempt")
        : [];
    })[0]?.logicalPass;
  }
  const orderedLogicalPass = currentTerminalLogicalPass
    ?? retainedTerminalLogicalPass
    ?? activeLogicalPass;
  for (const sourceId of reservation.sources) {
    const orderedSourceAttempts = currentAttemptHistory.filter((attempt) => (
      attempt.sourceId === sourceId && attempt.logicalPass === orderedLogicalPass
    ));
    if (input.readEarlierAttemptApplicability === undefined
      && allAttempts.some((attempt) => attempt.sourceId === sourceId
        && isCompleteStandardVerdict(attempt)
        && attempt.outcome === "clean")) {
      return {
        discharged: false,
        detail: "Earlier review applicability evidence is incomplete.",
        nextSource: null,
      };
    }
    const safelyUnavailable = retainedSafeUnavailableAttempt(
      sourceId,
      orderedSourceAttempts,
    );
    if (safelyUnavailable !== null) {
      if (orderedLogicalPass === activeLogicalPass) requestAttempts.push(safelyUnavailable);
      continue;
    }
    if (input.readEarlierAttemptApplicability !== undefined) {
      const earlier = await readActiveEarlier(sourceId);
      if (earlier === null) throw new Error("earlier applicability reader disappeared");
      const evidenceRequired = typeof input.requireEarlierApplicabilityEvidence === "function"
        ? input.requireEarlierApplicabilityEvidence(sourceId)
        : input.requireEarlierApplicabilityEvidence === true;
      if (earlier.status === "not-found" && !evidenceRequired) {
        const retainedFindings = await retainedFindingsBeforeRequest();
        if (retainedFindings !== null) return retainedFindings;
        return {
          discharged: false,
          detail: `The reserved standard-review source order beginning at \`${reservation.sources[0]}\` has not produced `
            + "a settled review across the Candidate span.",
          nextSource: sourceId,
          ...requestContext(),
          ...await correctionContext(),
        };
      }
      if (earlier.status !== "complete" || earlier.attempts.length === 0) {
        return {
          discharged: false,
          detail: earlier.status === "unavailable"
            ? earlier.detail
            : "Earlier review applicability evidence is incomplete.",
          nextSource: null,
        };
      }
      const selected = earlier.attempts.filter((attempt) => attempt.sourceId === sourceId);
      const standardAttempts = selected.filter(({ requestedCoverage, effectiveCoverage }) => (
        requestedCoverage === "complete" || effectiveCoverage === "complete"
      ));
      const stoppedAttempts = standardAttempts.filter(({ applicability }) => applicability === "stop");
      const stopped = stoppedAttempts[0];
      if (stopped !== undefined) {
        const equivalenceKey = stopped.projection === undefined
          ? null
          : applicabilityEquivalenceKey(stopped.projection);
        const equivalentApplicabilities = equivalenceKey === null
          ? []
          : stoppedAttempts.flatMap(({ projection, authorityState }) => (
              projection !== undefined
                && authorityState === "decision-required"
                && applicabilityEquivalenceKey(projection) === equivalenceKey
                ? [projection]
                : []
            ));
        return {
          discharged: false,
          detail: `Hosted source \`${sourceId}\` has an unresolved contribution-applicability decision.`,
          nextSource: null,
          ...(stopped.projection === undefined ? {} : { applicability: stopped.projection }),
          ...(equivalentApplicabilities.length < 2 ? {} : { equivalentApplicabilities }),
          ...(stopped.authorityState === undefined
            ? {}
            : { applicabilityAuthority: stopped.authorityState }),
        };
      }
      if (standardAttempts.some(({ applicability }) => applicability === "request-review")) {
        const retainedFindings = await retainedFindingsBeforeRequest();
        if (retainedFindings !== null) return retainedFindings;
        return {
          discharged: false,
          detail: `Hosted source \`${sourceId}\` requires a new review by Owner selection.`,
          nextSource: sourceId,
          ...requestContext(),
          ...await correctionContext(),
        };
      }
      const applicable = standardAttempts.filter(({ applicability }) => applicability === "retain-prior-attempt");
      const cleanApplicable = applicable.find(({ outcome, effectiveCoverage }) => effectiveCoverage === "complete"
        && outcome === "clean");
      if (cleanApplicable !== undefined) {
        const policy = await input.resolveEarlierTerminalPolicy(cleanApplicable);
        if (policy.state !== "pass-complete") {
          return {
            discharged: false,
            detail: `The retained terminal review producer did not establish convergence `
              + `(${policy.state}/${policy.nextAction}).`,
            nextSource: null,
          };
        }
        return {
          discharged: true,
          detail: `${sourceId === "delegated-agent" ? "Standard" : "Hosted"} source \`${sourceId}\` through `
            + "contribution applicability.",
          nextSource: null,
        };
      }
      const settledApplicable = applicable.find(({ outcome, effectiveCoverage }) => (
        effectiveCoverage === "complete" && outcome === "settled-findings"
      ));
      if (settledApplicable !== undefined) {
        const policy = await input.resolveEarlierTerminalPolicy(settledApplicable);
        if (policy.state === "pass-complete") {
          return {
            discharged: true,
            detail: `${sourceId === "delegated-agent" ? "Standard" : "Hosted"} source \`${sourceId}\` through `
              + "contribution applicability with no verified material findings.",
            nextSource: null,
          };
        }
      }
      const orderedApplicable = selected.filter(({ applicability, logicalPass }) => (
        applicability === "retain-prior-attempt" && logicalPass === orderedLogicalPass
      ));
      const earlierSafelyUnavailable = retainedSafeUnavailableAttempt(
        sourceId,
        orderedApplicable,
      );
      if (earlierSafelyUnavailable !== null) {
        const earlierCoverage = oneRequestedCoverage(orderedApplicable.map(({ requestedCoverage }) => (
          requestedCoverage
        )));
        if (earlierCoverage === "conflict"
          || (orderedLogicalPass === activeLogicalPass
            && requestCoverage !== null
            && earlierCoverage !== null
            && requestCoverage !== earlierCoverage)) {
          return {
            discharged: false,
            detail: "The active review pass contains conflicting requested coverage.",
            nextSource: null,
          };
        }
        if (orderedLogicalPass === activeLogicalPass) {
          requestCoverage ??= earlierCoverage;
          requestAttempts.push(earlierSafelyUnavailable);
        }
        continue;
      }
    }
    const retainedFindings = await retainedFindingsBeforeRequest();
    if (retainedFindings !== null) return retainedFindings;
    return {
      discharged: false,
      detail: `The reserved standard-review source order beginning at \`${reservation.sources[0]}\` has not produced `
        + "a settled review across the Candidate span.",
      nextSource: sourceId,
      ...requestContext(),
      ...await correctionContext(),
    };
  }
  return {
    discharged: false,
    detail: `The reserved standard-review source order beginning at \`${reservation.sources[0]}\` has not produced `
      + "a settled review across the Candidate span.",
    nextSource: null,
  };
}

/** Exact inputs shared by discharge projection and evidence-bound applicability re-entry. */
export interface HostedReservationDischargeReaderArgs {
  workUnitId?: string;
  reservation: StandardReviewReservationV1 | null;
  baseRevision: string;
  approvedHead: string;
  changeRequest: { repository: string; pullRequest: number } | null;
  vehicle?: DeliveryReviewMemberVehicle;
  candidate?: CandidateManagedRecordV1;
}

/** Discharge projection plus its fresh predecessor-applicability boundary. */
export interface HostedReservationDischargeReader {
  (args: HostedReservationDischargeReaderArgs): Promise<HostedReservationDischarge>;
  confirmIncrementalApplicability(
    args: HostedReservationDischargeReaderArgs,
    predecessor: ReviewResult,
    current: ReviewResult,
  ): Promise<IncrementalPredecessorApplicability>;
}

/**
 * Bind the repository's durable lane progress and Candidate span to the discharge projection.
 *
 * @param input - The repository root and its Git boundary.
 * @returns A reader resolving discharge and fresh incremental applicability for one Candidate target.
 */
export function createHostedReservationDischargeReader(input: {
  cwd: string;
  exec: GitExec;
  delivery?: DeliveryDischargeTargetLookup;
  host?: Pick<DeliveryHostPort, "readRequest">;
}): HostedReservationDischargeReader {
  const publisher = new RepositoryGitCommonStatePublisher(input.exec, input.cwd);
  const store = new LocalReviewOperationStateStore(publisher);
  const dispositions = new LocalApprovedDispositionRecordStore(publisher);
  const resultReader = createRepositoryReviewResultReader(publisher);
  let maxPassesPromise: Promise<number> | null = null;
  const maxPasses = () => {
    maxPassesPromise ??= readConfigSettings(input.cwd).then(({ settings }) => (
      Number(settings["review.standard_max_passes"])
    ));
    return maxPassesPromise;
  };
  let repositoryIdPromise: Promise<string> | null = null;
  const repositoryId = () => {
    repositoryIdPromise ??= resolveRepositoryIdentity(publisher);
    return repositoryIdPromise;
  };
  const rawExec = createRawGitExec(input.cwd);

  const createApplicabilityContext = async ({
    baseRevision,
    approvedHead,
    changeRequest,
    vehicle,
    candidate,
  }: Omit<HostedReservationDischargeReaderArgs, "workUnitId" | "reservation">) => {
    const currentRepositoryId = await repositoryId();
    const lineage = vehicle !== undefined
      ? {
          kind: "delivery-member" as const,
          planId: vehicle.planId,
          deliverableId: vehicle.deliverableId,
          workUnitId: vehicle.workUnitId,
        }
      : candidate === undefined
        ? undefined
        : { kind: "candidate" as const, candidateId: candidate.attestation.candidateId };
    const snapshot = candidate === undefined || changeRequest === null
      ? null
      : store.readOperationSnapshot();
    const observeEndpoints = async (): Promise<{ readonly head: string; readonly base: string }> => {
      if (changeRequest === null || input.host === undefined) {
        throw new Error("Fresh hosted-review endpoints are unavailable.");
      }
      if (vehicle !== undefined) {
        if (input.delivery === undefined) {
          throw new Error("Fresh delivery-member endpoints are unavailable.");
        }
        const resolved = await input.delivery.resolveDischargeTargets(vehicle.workUnitId);
        const matching = resolved.status !== "resolved"
          ? []
          : resolved.targets.filter((target) => (
              target.planId === vehicle.planId
              && target.deliverableId === vehicle.deliverableId
              && target.workUnitId === vehicle.workUnitId
              && target.changeRequestId === String(changeRequest.pullRequest)
            ));
        const current = matching.length === 1 ? matching[0] : undefined;
        if (current === undefined) throw new Error("Fresh delivery-member endpoints are ambiguous.");
        const observed = await input.host.readRequest(changeRequest.repository, {
          providerId: current.providerId,
          changeRequestId: current.changeRequestId,
        });
        if (observed.status !== "observed"
          || observed.request.repository.toLowerCase() !== changeRequest.repository.toLowerCase()) {
          throw new Error("Fresh delivery-member request coordinates are unavailable.");
        }
        return { head: observed.request.headSha, base: current.base };
      }
      const observed = await input.host.readRequest(changeRequest.repository, {
        providerId: "github",
        changeRequestId: String(changeRequest.pullRequest),
      });
      if (observed.status !== "observed"
        || observed.request.repository.toLowerCase() !== changeRequest.repository.toLowerCase()) {
        throw new Error("Fresh hosted-review request coordinates are unavailable.");
      }
      const { stdout: observedBase } = await input.exec(
        "git",
        ["merge-base", observed.request.headSha, observed.request.baseRef],
        { cwd: input.cwd, objectAccess: "local-only" },
      );
      return { head: observed.request.headSha, base: observedBase.trim() };
    };
    const readEarlierAttemptApplicability = snapshot === null
      || changeRequest === null
      || candidate === undefined
      || lineage === undefined
      ? undefined
      : async (sourceId: string): Promise<EarlierHostedAttemptApplicabilityRead> => (
          projectEarlierReviewApplicability({
            query: {
              schemaVersion: 1,
              repositoryId: currentRepositoryId,
              repository: changeRequest.repository,
              pullRequest: changeRequest.pullRequest,
              currentHead: approvedHead,
              lane: "standard",
              sourceId,
              lineage,
              ...(vehicle === undefined ? {} : { currentVehicle: vehicle }),
            },
            currentBase: baseRevision,
            snapshot: await snapshot,
            candidate,
            exec: rawExec,
            observeEndpoints,
            readDispositionRecord: (attemptId) => dispositions.readDispositionRecord(attemptId),
          })
        );
    return { currentRepositoryId, lineage, readEarlierAttemptApplicability };
  };

  const readTarget = async ({
    reservation,
    baseRevision,
    approvedHead,
    changeRequest,
    vehicle,
    candidate,
  }: Omit<HostedReservationDischargeReaderArgs, "workUnitId">): Promise<HostedReservationDischarge> => {
    if (reservation === null) {
      const unreachableTerminalPolicy = (): Promise<ReviewResolveEnvelope> => Promise.reject(
        new Error("A reservation-free discharge has no terminal review policy."),
      );
      return projectHostedReservationDischarge({
        reservation,
        span: [],
        target: null,
        readLaneProgress: () => Promise.resolve({ status: "unrecorded" }),
        resolveTerminalPolicy: unreachableTerminalPolicy,
        resolveEarlierTerminalPolicy: unreachableTerminalPolicy,
      });
    }
    let stdout: string;
    try {
      ({ stdout } = await input.exec("git", ["rev-list", `${baseRevision}..${approvedHead}`], {
        cwd: input.cwd,
        objectAccess: "local-only",
      }));
    } catch {
      return {
        discharged: false,
        detail: "The reserved hosted-review target span is unavailable.",
        nextSource: null,
      };
    }
    const span = [baseRevision, ...stdout.trim().split("\n").filter((line) => line !== "")];
    const { currentRepositoryId, lineage, readEarlierAttemptApplicability } =
      await createApplicabilityContext({
        baseRevision,
        approvedHead,
        changeRequest,
        vehicle,
        candidate,
      });
    const confirmIncrementalApplicability = async (
      predecessor: ReviewResult,
      current: ReviewResult,
    ): Promise<IncrementalPredecessorApplicability> => confirmIncrementalPredecessorApplicability({
      predecessor,
      current,
      readEarlierAttemptApplicability,
    });
    const resolveTerminalPolicy = async (terminal: {
      readonly attemptId: string;
      readonly logicalPass: number;
      readonly sourceId: string;
      readonly outcome: "clean" | "settled-findings";
      readonly producerTarget: NonNullable<EarlierApplicableAttempt["producerTarget"]>;
      readonly scopeMode?: "whole-target" | "chunked";
      readonly chunkSeriesComplete?: boolean;
    }): Promise<ReviewResolveEnvelope> => {
      if (changeRequest === null) {
        throw new Error("Terminal review policy requires exact change-request coordinates.");
      }
      const policyTarget = {
        repository: changeRequest.repository,
        pullRequest: changeRequest.pullRequest,
        headSha: terminal.producerTarget.headSha,
      };
      return resolveEvidenceBoundReviewPolicy({
        schemaVersion: 1,
        target: policyTarget,
        lane: "standard",
        standardReview: reservation.obligation,
        completedPasses: terminal.logicalPass,
        attempts: [projectReviewPolicyAttempt({
          attemptId: terminal.attemptId,
          sourceId: terminal.sourceId,
          outcome: terminal.outcome,
          ...(terminal.chunkSeriesComplete === undefined
            ? {}
            : { chunkSeriesComplete: terminal.chunkSeriesComplete }),
        })],
        ...(terminal.scopeMode === undefined
          ? {}
          : { scopeSelection: { mode: terminal.scopeMode, target: policyTarget } }),
      }, {
        sources: reservation.sources,
        maxPasses: await maxPasses(),
        resultReader,
        dispositionStore: dispositions,
        confirmTarget: () => Promise.resolve(terminal.producerTarget),
        confirmIncrementalApplicability,
      });
    };
    const resolveIncrementalCorrectionScope = async (
      attempt: IncrementalCorrectionScopeCandidate,
      currentHeadSha: string,
    ): Promise<IncrementalReviewScope | null> => {
      if (attempt.producerTarget === undefined) return null;
      const predecessor = await resultReader.readResult(attempt.attemptId).catch(() => null);
      if (predecessor === null
        || predecessor.kind === "frontline"
        || predecessor.sourceIdentity !== attempt.sourceId
        || canonicalize(predecessor.target) !== canonicalize(attempt.producerTarget)) return null;
      const response = await readIncrementalPredecessorResponseEvidence(predecessor, dispositions)
        .catch(() => null);
      return response === null ? null : buildIncrementalCorrectionScope({
        predecessor,
        currentHeadSha,
        response,
      });
    };
    return projectHostedReservationDischarge({
      reservation,
      span,
      target: changeRequest === null
        ? null
        : { ...changeRequest, headSha: approvedHead, ...(vehicle === undefined ? {} : { vehicle }) },
      readLaneProgress: (headSha) => readLaneProgressAcrossLineage(store, {
        lane: "standard",
        repositoryId: currentRepositoryId,
        headSha,
        lineageHeadShas: [],
        ...(lineage === undefined ? {} : { lineage }),
      }),
      bindCurrentAttemptRef: (attemptId) => bindReviewSourceReference({
        kind: "hosted",
        operationId: laneProgressOperationId({
          lane: "standard",
          repositoryId: currentRepositoryId,
          headSha: approvedHead,
          ...(lineage === undefined ? {} : { lineage }),
        }),
        durableRef: attemptId,
      }),
      resolveTerminalPolicy: (attempt) => {
        const producerTarget = attempt.local?.target ?? attempt.hosted?.reviewTarget;
        if (producerTarget === undefined) {
          throw new Error("Terminal review progress has no immutable producer target.");
        }
        return resolveTerminalPolicy({
          attemptId: attempt.attemptId,
          logicalPass: attempt.logicalPass,
          sourceId: attempt.sourceId,
          outcome: terminalPolicyOutcome(attempt.outcome),
          producerTarget,
          ...(attempt.local === undefined
            ? {}
            : { scopeMode: attempt.local.scopeMode }),
          ...(attempt.chunkSeriesComplete === undefined
            ? {}
            : { chunkSeriesComplete: attempt.chunkSeriesComplete }),
        });
      },
      resolveEarlierTerminalPolicy: (attempt) => {
        if (attempt.producerTarget === undefined) {
          throw new Error("Earlier review applicability has no immutable producer target.");
        }
        return resolveTerminalPolicy({
          attemptId: attempt.attemptId,
          logicalPass: attempt.logicalPass,
          sourceId: attempt.sourceId,
          outcome: terminalPolicyOutcome(attempt.outcome),
          producerTarget: attempt.producerTarget,
          scopeMode: attempt.scopeMode,
          ...(attempt.chunkSeriesComplete === undefined
            ? {}
            : { chunkSeriesComplete: attempt.chunkSeriesComplete }),
        });
      },
      resolveIncrementalCorrectionScope,
      ...(readEarlierAttemptApplicability === undefined
        || changeRequest === null
        || candidate === undefined
        || lineage === undefined
        ? {}
        : {
            readEarlierAttemptApplicability,
            requireEarlierApplicabilityEvidence: (sourceId: string) => (
              candidateExpectsEarlierReviewAttempt(candidate, {
                schemaVersion: 1,
                repositoryId: currentRepositoryId,
                repository: changeRequest.repository,
                pullRequest: changeRequest.pullRequest,
                currentHead: approvedHead,
                lane: "standard",
                sourceId,
                lineage,
                ...(vehicle === undefined ? {} : { currentVehicle: vehicle }),
              })
            ),
          }),
    });
  };

  const reader = async ({ workUnitId, ...target }: HostedReservationDischargeReaderArgs) => {
    if (workUnitId === undefined) return readTarget(target);
    if (input.delivery === undefined || input.host === undefined) {
      return {
        discharged: false,
        detail: "The retained delivery-member review targets are unavailable.",
        nextSource: null,
      };
    }
    if (target.reservation === null || target.changeRequest === null) return readTarget(target);
    const resolution = await resolveHostedReservationTargets({
      workUnitId,
      reservation: target.reservation,
      singleton: {
        ...target.changeRequest,
        headSha: target.approvedHead,
        baseRevision: target.baseRevision,
      },
      delivery: input.delivery,
      host: input.host,
    });
    if (resolution.status === "unavailable") {
      return {
        discharged: false,
        detail: "The reserved hosted-review targets are unavailable.",
        nextSource: null,
      };
    }
    const discharges = await Promise.all(resolution.targets.map((resolvedTarget) => readTarget({
      reservation: target.reservation,
      baseRevision: resolvedTarget.baseRevision,
      approvedHead: resolvedTarget.headSha,
      changeRequest: {
        repository: resolvedTarget.repository,
        pullRequest: resolvedTarget.pullRequest,
      },
      ...(resolvedTarget.vehicle === undefined ? {} : { vehicle: resolvedTarget.vehicle }),
      ...(target.candidate === undefined ? {} : { candidate: target.candidate }),
    })));
    if (!allHostedReservationTargetsDischarged(discharges)) {
      const index = discharges.findIndex(({ discharged }) => !discharged);
      const discharge = discharges[index];
      if (discharge === undefined) {
        return {
          discharged: false,
          detail: "The reserved hosted-review target is unavailable.",
          nextSource: null,
        };
      }
      return resolution.kind === "delivery"
        ? { ...discharge, detail: `Delivery member ${index + 1}: ${discharge.detail}` }
        : discharge;
    }
    const details = discharges.map(({ detail }) => detail);
    return resolution.kind === "delivery"
      ? {
          discharged: true,
          detail: `All ${resolution.targets.length} delivery members are discharged (${details.join(" ")})`,
          nextSource: null,
        }
      : details.length === 1
        ? { discharged: true, detail: details[0] ?? "Hosted review discharged.", nextSource: null }
        : {
            discharged: false,
            detail: "The reserved hosted-review target is unavailable.",
            nextSource: null,
          };
  };
  return Object.assign(reader, {
    confirmIncrementalApplicability: async (
      args: HostedReservationDischargeReaderArgs,
      predecessor: ReviewResult,
      current: ReviewResult,
    ) => {
      const target = {
        baseRevision: args.baseRevision,
        approvedHead: args.approvedHead,
        changeRequest: args.changeRequest,
        ...(args.vehicle === undefined ? {} : { vehicle: args.vehicle }),
        ...(args.candidate === undefined ? {} : { candidate: args.candidate }),
      };
      const { readEarlierAttemptApplicability } = await createApplicabilityContext(target);
      return confirmIncrementalPredecessorApplicability({
        predecessor,
        current,
        readEarlierAttemptApplicability,
      });
    },
  });
}
