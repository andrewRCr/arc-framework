/** Shared support for hosted-review reservation discharge. */

import {
  DeliveryReviewMemberVehicleSchema,
  sameDeliveryReviewMemberVehicle,
  type DeliveryReviewMemberVehicle,
} from "../../../lib/delivery/review-vehicle.js";
import { canonicalize } from "../../../lib/canonical/canonical-json.js";
import type { DeliveryHostChangeRequest, DeliveryHostPort } from "../../../lib/delivery/host.js";
import type {
  DeliveryDischargeTargetBinding,
  DeliveryDischargeTargetLookup,
} from "../core/delivery-member-lookup.js";
import {
  type LaneProgressProjection,
} from "../lane-progress.js";
import type { StandardReviewReservationV1 } from "./integration-boundary-locus.js";
import type { EarlierHostedAttemptApplicabilityRead } from "./earlier-review-applicability.js";
import type { ReviewContributionApplicabilityResult } from
  "./review-contribution-applicability.js";
import type { HostedFindingsResponsePlan } from "../core/response-plan-schema.js";
import type { ReviewResult } from "../core/review-result.js";
import type { HostedAwaitEnvelope } from "../hosted/await.js";
import {
  HostedProviderIdSchema,
  hostedRequestHandleMatchesProgress,
  type HostedReviewCoverage,
} from "../hosted/request.js";
import { hostedProviderAdmitsCoverage } from "../hosted/correction-review-capability.js";
import { laneSubjectOwnerMatches } from "../core/lane-admission.js";
import type { IncrementalReviewScope } from "../core/incremental-review-scope.js";
import {
  type IncrementalPredecessorApplicability,
} from "./incremental-coverage-basis.js";
import {
  type ReviewCoverageSelectionAction,
  type ReviewCoverageSelectionChoice,
} from "./review-coverage-selection.js";

export type ProjectedLaneAttempt = Extract<LaneProgressProjection, { status: "recorded" }>["attempts"][number];
export type EarlierApplicableAttempt = Extract<
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
  return applicability === "retain-prior-attempt"
    ? "applicable"
    : applicability === "request-review"
      ? "review-required"
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
  if (!laneSubjectOwnerMatches(predecessor.admission.lineage, current.admission.lineage)) {
    return "unavailable";
  }
  if (predecessor.target.headSha === current.target.headSha
    || (predecessor.admission.lineage.kind === "head-bound"
      && current.admission.lineage.kind === "head-bound")) return "applicable";
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

export function isCompleteStandardVerdict(attempt: ProjectedLaneAttempt): boolean {
  return attempt.local?.effectiveCoverage === "complete" || attempt.hosted?.effectiveCoverage === "complete";
}

/** A complete exact-member clean attempt whose source was explicitly selected by the Owner. */
export function selectedOwnerCleanAttempt(
  attempts: readonly ProjectedLaneAttempt[],
  reservation: StandardReviewReservationV1,
): ProjectedLaneAttempt | undefined {
  return attempts.find((attempt) => {
    const hosted = attempt.hosted;
    const handle = hosted?.handle;
    return attempt.outcome === "clean"
      && hosted !== undefined
      && handle?.invocation?.mode === "force"
      && handle.invocation.sourceId === attempt.sourceId
      && reservation.sources.includes(attempt.sourceId)
      && handle.effectiveCoverage === "complete"
      && hostedRequestHandleMatchesProgress(handle, { admission: hosted.admission });
  });
}

export function projectSelectedOwnerDischarge(
  selected: ProjectedLaneAttempt,
  retainedFindings: HostedReservationDischarge | null,
): HostedReservationDischarge {
  return retainedFindings ?? {
    discharged: true,
    detail: `Hosted source \`${selected.sourceId}\` by explicit Owner selection.`,
    nextSource: null,
  };
}

export function terminalPolicyOutcome(outcome: string): "clean" | "settled-findings" {
  if (outcome === "clean" || outcome === "settled-findings") return outcome;
  throw new Error("Terminal discharge evidence has no policy-bearing outcome.");
}

export function currentCorrectionScopeCandidate(
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

export function attemptMatchesTarget(
  attempt: ProjectedLaneAttempt,
  stateHead: string,
  target: {
    repository: string;
    pullRequest: number;
    headSha: string;
    vehicle?: DeliveryReviewMemberVehicle;
  },
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

export interface PendingFindingRoute {
  readonly sourceId: string;
  readonly responsePlan?: HostedFindingsResponsePlan;
  readonly localResumeAction?: { readonly schemaVersion: 1; readonly operationId: string };
}

export function projectPendingFindings(
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

export function retainedSafeUnavailableAttempt(
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

export function coverageSelectionChoices(
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
    return provider.success && hostedProviderAdmitsCoverage(
      provider.data,
      "incremental",
      correctionScope,
    )
      ? [{ sourceId, coverage: "incremental" }, complete]
      : [complete];
  });
}

export function oneRequestedCoverage(
  values: readonly (HostedReviewCoverage | undefined)[],
): HostedReviewCoverage | null | "conflict" {
  const coverages = new Set(values.filter(
    (value): value is HostedReviewCoverage => value !== undefined,
  ));
  if (coverages.size > 1) return "conflict";
  return coverages.values().next().value ?? null;
}

export function requestedCoverageOf(
  attempts: readonly ProjectedLaneAttempt[],
): HostedReviewCoverage | null | "conflict" {
  return oneRequestedCoverage(attempts.map((attempt) => (
    attempt.local?.requestedCoverage ?? attempt.hosted?.requestedCoverage
  )));
}

export function applicabilityEquivalenceKey(
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

interface ResolveTargetsInput {
  readonly workUnitId: string;
  readonly reservation: StandardReviewReservationV1 | null;
  readonly singleton: HostedReservationTarget;
  readonly delivery: DeliveryDischargeTargetLookup;
  readonly host: Pick<DeliveryHostPort, "readRequest">;
  readonly terminalAdvance?: { readonly stateHead: string; readonly currentHead: string };
  readonly preparedTerminal?: { readonly deliverableId: string; readonly stateHead: string };
}

interface ObservedHostedTarget {
  readonly binding: DeliveryDischargeTargetBinding;
  readonly index: number;
  readonly pullRequest: number;
  readonly request: DeliveryHostChangeRequest;
  readonly targetHead: string;
}

function observedRequestIdentityMatches(
  input: ResolveTargetsInput,
  binding: DeliveryDischargeTargetBinding,
  request: DeliveryHostChangeRequest,
): boolean {
  const expectedHeadRef = binding.ref?.replace(/^refs\/heads\//u, "") ?? null;
  return request.binding.providerId === binding.providerId
    && request.binding.changeRequestId === binding.changeRequestId
    && request.repository.toLowerCase() === input.singleton.repository.toLowerCase()
    && request.headRepository.toLowerCase() === input.singleton.repository.toLowerCase()
    && request.state !== "closed"
    && (expectedHeadRef === null || request.headRef === expectedHeadRef);
}

function observedRequestHeadMatches(
  input: ResolveTargetsInput,
  binding: DeliveryDischargeTargetBinding,
  request: DeliveryHostChangeRequest,
  index: number,
  lastIndex: number,
): { readonly matches: boolean; readonly preparedTerminal: boolean } {
  const terminal = binding.position === binding.memberCount && index === lastIndex;
  const advanced = input.terminalAdvance !== undefined && terminal
    && binding.head === input.terminalAdvance.stateHead
    && request.headSha === input.terminalAdvance.currentHead;
  const prepared = input.preparedTerminal !== undefined && terminal
    && binding.deliverableId === input.preparedTerminal.deliverableId
    && binding.head === input.preparedTerminal.stateHead
    && request.state === "open";
  return {
    matches: request.state !== "open" || request.headSha === binding.head || advanced || prepared,
    preparedTerminal: prepared,
  };
}

async function observeHostedMember(
  input: ResolveTargetsInput,
  binding: DeliveryDischargeTargetBinding,
  index: number,
  lastIndex: number,
  marker: StandardReviewReservationV1["target"] | undefined,
  requestIds: Set<string>,
): Promise<ObservedHostedTarget | null> {
  if (marker?.kind === "delivery"
    && (binding.planId !== marker.planId || binding.workUnitId !== marker.workUnitId)) return null;
  if (!/^[1-9][0-9]*$/u.test(binding.changeRequestId)) return null;
  const pullRequest = Number(binding.changeRequestId);
  if (!Number.isSafeInteger(pullRequest)) return null;
  const requestKey = `${binding.providerId}:${binding.changeRequestId}`;
  if (requestIds.has(requestKey)) return null;
  requestIds.add(requestKey);
  const observed = await input.host.readRequest(input.singleton.repository, {
    providerId: binding.providerId,
    changeRequestId: binding.changeRequestId,
  });
  if (observed.status !== "observed") return null;
  const { request } = observed;
  if (!observedRequestIdentityMatches(input, binding, request)) return null;
  const head = observedRequestHeadMatches(input, binding, request, index, lastIndex);
  if (!head.matches) return null;
  return {
    binding,
    index,
    pullRequest,
    request,
    targetHead: head.preparedTerminal ? binding.head : request.headSha,
  };
}

async function observeHostedMembers(
  input: ResolveTargetsInput,
  bindings: readonly DeliveryDischargeTargetBinding[],
  marker: StandardReviewReservationV1["target"] | undefined,
): Promise<ObservedHostedTarget[] | null> {
  const observedTargets: ObservedHostedTarget[] = [];
  const requestIds = new Set<string>();
  for (const [index, binding] of bindings.entries()) {
    const observed = await observeHostedMember(
      input, binding, index, bindings.length - 1, marker, requestIds,
    );
    if (observed === null) return null;
    observedTargets.push(observed);
  }
  return observedTargets;
}

function composeHostedMemberTargets(
  input: ResolveTargetsInput,
  bindings: readonly DeliveryDischargeTargetBinding[],
  observedTargets: readonly ObservedHostedTarget[],
): HostedReservationTarget[] {
  const retainedAuthoredMergedChain = observedTargets
    .filter(({ request }) => request.state === "merged")
    .every(({ binding, index, request }) => {
      const priorBinding = bindings[index - 1];
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
  return targets;
}

/** Derive the current hosted-review targets without persisting a target list. */
export async function resolveHostedReservationTargets(input: ResolveTargetsInput): Promise<HostedReservationTargetResolution> {
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
    const observed = await observeHostedMembers(input, resolved.targets, marker);
    if (observed === null) return { status: "unavailable", targets: [] };
    return {
      status: "resolved",
      kind: "delivery",
      targets: composeHostedMemberTargets(input, resolved.targets, observed),
    };
  } catch {
    return { status: "unavailable", targets: [] };
  }
}
