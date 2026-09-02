/** Terminal delivery claim composition for the integration checkpoint. */

import { canonicalize } from "../kernel/index.js";
import type {
  CandidateCurrentnessProjection,
  CandidateLineageTarget,
  CandidateManagedRecordV1,
} from "../work-unit/candidate-attestation.js";
import {
  CandidateLineageTargetSchema,
  CandidateManagedRecordV1Schema,
} from "../work-unit/candidate-attestation.js";
import type { CandidateEffectiveTargetProjection } from "../work-unit/candidate-effective-target.js";
import type {
  DeliveryContributionEndpoints,
  DeliveryContributionProofResult,
} from "./contribution-proof.js";
import type {
  DeliveryChangeRequestV1,
  DeliveryMemberCoordinatesV1,
  DeliveryPlanV1,
  DeliveryStateV1,
} from "./schema.js";
import { DeliveryMemberCoordinatesV1Schema, DeliveryStateV1Schema } from "./schema.js";
import { validateDeliveryStateAgainstPlan } from "./state.js";

export interface DeliveryTerminalLanding {
  readonly deliverableId: string;
  readonly head: string;
}

export type DeliveryTerminalClaimResult =
  | { readonly status: "not-applicable" }
  | {
      readonly status: "refused";
      readonly reason:
        | "delivery-record-incomplete"
        | "candidate-mismatch"
        | "state-mismatch"
        | "operation-active"
        | "pending-review-fix-verification"
        | "bound-member-missing"
        | "landed-head-mismatch"
        | "candidate-coordinate-unavailable"
        | "residual-mismatch";
      readonly deliverableId?: string;
      readonly proof?: Extract<DeliveryContributionProofResult, { readonly status: "refused" }>;
    }
  | {
      readonly status: "composed";
      readonly candidateId: string;
      readonly endpoints: DeliveryContributionEndpoints;
      readonly proof: Extract<DeliveryContributionProofResult, { readonly status: "accepted" }>;
    };

export interface DeliveryTerminalReviewTarget {
  readonly deliverableId: string;
  readonly providerId: string;
  readonly changeRequestId: string;
  readonly head: string;
}

export type DeliveryTerminalCheckResult =
  | {
      readonly status: "ready";
      readonly candidateId: string;
      readonly targets: readonly DeliveryTerminalReviewTarget[];
    }
  | {
      readonly status: "refused";
      readonly reason:
        | "publication-candidate-mismatch"
        | "member-review-target-mismatch"
        | "member-review-outstanding";
      readonly deliverableId?: string;
    };

export type DeliveryTerminalTopResult =
  | { readonly status: "window-open" }
  | { readonly status: "ready"; readonly request: DeliveryTerminalTopObservation }
  | { readonly status: "refused"; readonly reason: "top-request-mismatch" }
  | {
      readonly status: "refused";
      readonly reason: "top-target-mismatch";
      readonly remedy: {
        readonly nextAction: "retarget" | "reopen-and-retarget";
        readonly repository: string;
        readonly changeRequestId: string;
        readonly protectedBaseRef: string;
      };
    };
export type DeliveryTerminalTopRemedy = Extract<
  DeliveryTerminalTopResult,
  { readonly reason: "top-target-mismatch" }
>["remedy"];

export interface DeliveryTerminalTopObservation {
  readonly binding: DeliveryChangeRequestV1;
  readonly repository: string;
  readonly headRef: string;
  readonly headSha: string;
  readonly baseRef: string;
  readonly state: "open" | "merged" | "closed";
}

export interface DeliveryTerminalRebindTopObservation extends DeliveryTerminalTopObservation {
  readonly headRepository: string;
}

/** Candidate authority admitted for an exact terminal correction before scoped verification is acknowledged. */
export interface DeliveryTerminalReviewFixCandidate {
  readonly schemaVersion: 1;
  readonly mode: "candidate-effective-target";
  readonly state: "review-fix";
  readonly candidateId: string;
  readonly durableBaselineTarget: CandidateLineageTarget;
  readonly currentTarget: CandidateLineageTarget;
  readonly selectedDeliverableId: string;
  readonly memberDeliverableIds: readonly string[];
  readonly retainedTerminalTarget: {
    readonly revision: string;
    readonly baselineRelation: "exact" | "ancestor";
  };
  readonly convergenceVerification: "satisfied";
}

export type DeliveryTerminalCandidateRebindAuthority =
  | CandidateEffectiveTargetProjection
  | DeliveryTerminalReviewFixCandidate;

export type DeliveryTerminalCoordinateRebindResult =
  | {
      readonly status: "rebound";
      readonly state: DeliveryStateV1;
      readonly nextAction: "rerun-checkpoint" | "verify-review-fix";
    }
  | {
      readonly status: "refused";
      readonly reason:
        | "candidate-not-current"
        | "publication-boundary-unsettled"
        | "publication-boundary-mismatch"
        | "state-mismatch"
        | "operation-active"
        | "pending-review-fix-verification"
        | "terminal-binding-missing"
        | "candidate-coordinate-mismatch"
        | "top-request-mismatch";
    };

/** Rebind only stale terminal coordinates from independently settled exact current facts. */
export function rebindDeliveryTerminalCoordinates(input: {
  readonly plan: DeliveryPlanV1;
  readonly state: DeliveryStateV1;
  readonly candidate: DeliveryTerminalCandidateRebindAuthority;
  readonly publication: {
    readonly settled: boolean;
    readonly candidateId: string;
    readonly candidateSubjectDigest: string | null;
  };
  readonly repository: string;
  readonly request: DeliveryTerminalRebindTopObservation;
  readonly coordinates: DeliveryMemberCoordinatesV1;
}): DeliveryTerminalCoordinateRebindResult {
  if (input.candidate.state !== "current" && input.candidate.state !== "review-fix") {
    return { status: "refused", reason: "candidate-not-current" };
  }
  const reviewFix = input.candidate.state === "review-fix";
  const durableBaseline = CandidateLineageTargetSchema.safeParse(input.candidate.durableBaselineTarget);
  const recognizedTarget = CandidateLineageTargetSchema.safeParse(
    reviewFix ? input.candidate.currentTarget : input.candidate.recognizedTarget,
  );
  if (!durableBaseline.success || !recognizedTarget.success) {
    return { status: "refused", reason: "candidate-not-current" };
  }
  if (!input.publication.settled) {
    return { status: "refused", reason: "publication-boundary-unsettled" };
  }
  if (input.publication.candidateId !== input.candidate.candidateId
    || input.publication.candidateSubjectDigest
      !== (reviewFix
        ? durableBaseline.data.subject.subjectDigest
        : recognizedTarget.data.subject.subjectDigest)) {
    return { status: "refused", reason: "publication-boundary-mismatch" };
  }
  const validated = validateDeliveryStateAgainstPlan(input.state, input.plan);
  if (validated.status !== "valid" || input.plan.projection.kind !== "stack-to-main") {
    return { status: "refused", reason: "state-mismatch" };
  }
  if (validated.state.activeOperation !== null) {
    return { status: "refused", reason: "operation-active" };
  }
  if (!reviewFix && validated.state.pendingReviewFixVerification !== null) {
    return { status: "refused", reason: "pending-review-fix-verification" };
  }
  const terminalIndex = validated.state.members.length - 1;
  const terminal = validated.state.members[terminalIndex];
  const target = validated.state.target;
  if (terminal === undefined || terminal.ref === null || terminal.changeRequest === null
    || terminal.coordinates === null || target === null) {
    return { status: "refused", reason: "terminal-binding-missing" };
  }
  const pending = validated.state.pendingReviewFixVerification;
  if (reviewFix) {
    const expectedMemberDeliverableIds = pending === null
      ? [input.candidate.selectedDeliverableId]
      : pending.memberDeliverableIds.includes(terminal.deliverableId)
        ? pending.memberDeliverableIds
        : [...pending.memberDeliverableIds, terminal.deliverableId];
    const samePendingScope = pending !== null
      && pending.selectedDeliverableId === input.candidate.selectedDeliverableId
      && canonicalize(expectedMemberDeliverableIds)
        === canonicalize(input.candidate.memberDeliverableIds);
    if (!input.candidate.memberDeliverableIds.includes(terminal.deliverableId)
      || (pending === null && input.candidate.selectedDeliverableId !== terminal.deliverableId)
      || (pending !== null && !samePendingScope)) {
      return { status: "refused", reason: "candidate-coordinate-mismatch" };
    }
  }
  if (reviewFix) {
    const retained = input.candidate.retainedTerminalTarget;
    if (retained.revision !== terminal.coordinates.head
      || (retained.baselineRelation === "exact"
        && durableBaseline.data.revision !== retained.revision)
      || (retained.baselineRelation === "ancestor" && pending === null)) {
      return { status: "refused", reason: "candidate-not-current" };
    }
  }
  const coordinates = DeliveryMemberCoordinatesV1Schema.safeParse(input.coordinates);
  if (!coordinates.success
    || coordinates.data.head !== recognizedTarget.data.revision) {
    return { status: "refused", reason: "candidate-coordinate-mismatch" };
  }
  const predecessor = validated.state.members[terminalIndex - 1];
  const targetBaseMatches = target.coordinates !== null
    && input.request.baseRef === target.ref.replace(/^refs\/heads\//u, "")
    && coordinates.data.base === target.coordinates.head;
  const predecessorBaseMatches = predecessor !== undefined
    && predecessor.ref !== null
    && predecessor.coordinates !== null
    && input.request.baseRef === predecessor.ref.replace(/^refs\/heads\//u, "")
    && coordinates.data.base === predecessor.coordinates.head;
  if (input.request.binding.providerId !== terminal.changeRequest.providerId
    || input.request.binding.changeRequestId !== terminal.changeRequest.changeRequestId
    || input.request.repository !== input.repository
    || input.request.headRepository !== input.repository
    || input.request.headRef !== terminal.ref.replace(/^refs\/heads\//u, "")
    || input.request.headSha !== coordinates.data.head
    || (!targetBaseMatches && !predecessorBaseMatches)
    || input.request.state !== "open") {
    return { status: "refused", reason: "top-request-mismatch" };
  }
  const rebound = {
    ...validated.state,
    members: validated.state.members.map((member, index) => index === terminalIndex
      ? { ...member, coordinates: coordinates.data }
      : member),
  };
  const parsedRebound = DeliveryStateV1Schema.safeParse(rebound);
  if (!parsedRebound.success) return { status: "refused", reason: "state-mismatch" };
  const reboundWithVerification = reviewFix
    ? DeliveryStateV1Schema.safeParse({
        ...parsedRebound.data,
        pendingReviewFixVerification: {
          selectedDeliverableId: input.candidate.selectedDeliverableId,
          memberDeliverableIds: input.candidate.memberDeliverableIds,
        },
      })
    : null;
  const state = reviewFix
    ? reboundWithVerification?.success === true ? reboundWithVerification.data : null
    : parsedRebound.data;
  if (state === null) return { status: "refused", reason: "state-mismatch" };
  return {
    status: "rebound",
    state,
    nextAction: reviewFix ? "verify-review-fix" : "rerun-checkpoint",
  };
}

export type DeliveryTerminalDriftResult =
  | {
      readonly status: "reconcile";
      readonly nextAction: "reconcile-base";
      readonly safetyClass: "generic" | "residual-contained";
    }
  | {
      readonly status: "refused";
      readonly reason: "predecessor-overlap";
      readonly paths: readonly string[];
    };

/** Scope terminal-window drift against the residual rather than the whole Candidate union. */
export function classifyDeliveryTerminalDrift(input: {
  readonly substantivePaths: readonly string[];
  readonly regenerablePaths: readonly string[];
  readonly residualPaths: readonly string[];
  readonly predecessorPaths: readonly string[];
}): DeliveryTerminalDriftResult {
  const driftPaths = [...new Set([...input.substantivePaths, ...input.regenerablePaths])];
  const intersect = (source: readonly string[], paths: readonly string[]): string[] => {
    const candidates = new Set(paths);
    return [...new Set(source.filter((path) => candidates.has(path)))].sort();
  };
  const predecessorOverlap = intersect(driftPaths, input.predecessorPaths);
  if (predecessorOverlap.length > 0) {
    return { status: "refused", reason: "predecessor-overlap", paths: predecessorOverlap };
  }
  const residualSubstantive = intersect(input.substantivePaths, input.residualPaths);
  const residualContained = input.substantivePaths.length > 0
    && residualSubstantive.length === new Set(input.substantivePaths).size;
  return {
    status: "reconcile",
    nextAction: "reconcile-base",
    safetyClass: residualContained ? "residual-contained" : "generic",
  };
}

/** Require the protected base only at the freshly observed terminal instant. */
export function assessDeliveryTerminalTop(input: {
  readonly terminal: boolean;
  readonly protectedBaseRef: string;
  readonly publicationHead: string;
  readonly request: DeliveryTerminalTopObservation;
}): DeliveryTerminalTopResult {
  if (!input.terminal) return { status: "window-open" };
  if (input.request.headSha !== input.publicationHead || input.request.state === "merged") {
    return { status: "refused", reason: "top-request-mismatch" };
  }
  const protectedBase = input.protectedBaseRef.replace(/^refs\/heads\//u, "");
  if (input.request.state === "open" && input.request.baseRef === protectedBase) {
    const { binding, repository, headRef, headSha, baseRef, state } = input.request;
    return { status: "ready", request: { binding, repository, headRef, headSha, baseRef, state } };
  }
  return {
    status: "refused",
    reason: "top-target-mismatch",
    remedy: {
      nextAction: input.request.state === "closed" ? "reopen-and-retarget" : "retarget",
      repository: input.request.repository,
      changeRequestId: input.request.binding.changeRequestId,
      protectedBaseRef: protectedBase,
    },
  };
}

/** Assert the publication binding and member-review conjunction over one composed terminal claim. */
export function assessDeliveryTerminalChecks(input: {
  readonly claim: Extract<DeliveryTerminalClaimResult, { readonly status: "composed" }>;
  readonly state: DeliveryStateV1;
  readonly publication: { readonly candidateId: string; readonly head: string };
  readonly review: {
    readonly status: "discharged" | "outstanding";
    readonly targets: readonly DeliveryTerminalReviewTarget[];
  };
}): DeliveryTerminalCheckResult {
  const terminal = input.state.members.at(-1);
  if (input.publication.candidateId !== input.claim.candidateId
    || input.publication.head !== input.claim.endpoints.before.member.head
    || terminal?.coordinates?.head !== input.publication.head) {
    return { status: "refused", reason: "publication-candidate-mismatch" };
  }
  const targets: DeliveryTerminalReviewTarget[] = [];
  for (const [index, member] of input.state.members.entries()) {
    const observed = input.review.targets[index];
    if (member.changeRequest === null || member.coordinates === null
      || observed === undefined
      || observed.deliverableId !== member.deliverableId
      || observed.providerId !== member.changeRequest.providerId
      || observed.changeRequestId !== member.changeRequest.changeRequestId
      || observed.head !== member.coordinates.head) {
      return {
        status: "refused",
        reason: "member-review-target-mismatch",
        deliverableId: member.deliverableId,
      };
    }
    targets.push({
      deliverableId: member.deliverableId,
      providerId: member.changeRequest.providerId,
      changeRequestId: member.changeRequest.changeRequestId,
      head: member.coordinates.head,
    });
  }
  if (input.review.targets.length !== targets.length) {
    return { status: "refused", reason: "member-review-target-mismatch" };
  }
  if (input.review.status !== "discharged") {
    return { status: "refused", reason: "member-review-outstanding" };
  }
  return { status: "ready", candidateId: input.claim.candidateId, targets };
}

/** Compose and prove the terminal residual for one bound delivery Candidate. */
export async function composeDeliveryTerminalClaim(input: {
  readonly record: CandidateManagedRecordV1;
  readonly candidate: Extract<CandidateCurrentnessProjection, { readonly status: "current" }>;
  readonly plan: DeliveryPlanV1 | null;
  readonly state: DeliveryStateV1 | null;
  readonly landings: readonly DeliveryTerminalLanding[];
  readonly terminalDelta: DeliveryContributionEndpoints["after"];
  readCandidateCoordinate(head: string): Promise<DeliveryContributionEndpoints["before"]["member"] | null>;
  proveResidual(endpoints: DeliveryContributionEndpoints): Promise<DeliveryContributionProofResult>;
}): Promise<DeliveryTerminalClaimResult> {
  if (input.plan === null && input.state === null) return { status: "not-applicable" };
  if (input.plan === null || input.state === null) {
    return { status: "refused", reason: "delivery-record-incomplete" };
  }
  const parsedRecord = CandidateManagedRecordV1Schema.safeParse(input.record);
  if (!parsedRecord.success
    || input.candidate.candidateId !== parsedRecord.data.attestation.candidateId
    || parsedRecord.data.attestation.workUnit !== input.plan.workUnitId) {
    return { status: "refused", reason: "candidate-mismatch" };
  }
  const validated = validateDeliveryStateAgainstPlan(input.state, input.plan);
  if (validated.status !== "valid" || input.plan.projection.kind !== "stack-to-main") {
    return { status: "refused", reason: "state-mismatch" };
  }
  if (validated.state.activeOperation !== null) {
    return { status: "refused", reason: "operation-active" };
  }
  if (validated.state.pendingReviewFixVerification !== null) {
    return { status: "refused", reason: "pending-review-fix-verification" };
  }
  const nonTerminal = validated.state.members.slice(0, -1);
  const missing = nonTerminal.find((member) => member.coordinates === null);
  if (missing !== undefined) {
    return { status: "refused", reason: "bound-member-missing", deliverableId: missing.deliverableId };
  }
  for (const [index, member] of nonTerminal.entries()) {
    const landing = input.landings[index];
    if (landing === undefined
      || landing.deliverableId !== member.deliverableId
      || landing.head !== member.coordinates?.head) {
      return { status: "refused", reason: "landed-head-mismatch", deliverableId: member.deliverableId };
    }
  }
  if (input.landings.length !== nonTerminal.length) {
    return { status: "refused", reason: "landed-head-mismatch" };
  }
  const predecessor = nonTerminal.at(-1)?.coordinates ?? validated.state.target?.coordinates ?? null;
  if (predecessor === null) return { status: "refused", reason: "bound-member-missing" };
  const candidateCoordinate = await input.readCandidateCoordinate(input.candidate.recognizedRevision);
  if (candidateCoordinate === null || candidateCoordinate.head !== input.candidate.recognizedRevision) {
    return { status: "refused", reason: "candidate-coordinate-unavailable" };
  }
  const endpoints: DeliveryContributionEndpoints = {
    before: {
      predecessor: { head: predecessor.head, tree: predecessor.tree },
      member: candidateCoordinate,
    },
    after: input.terminalDelta,
  };
  const proof = await input.proveResidual(endpoints);
  if (proof.status !== "accepted") return { status: "refused", reason: "residual-mismatch", proof };
  return {
    status: "composed",
    candidateId: input.candidate.candidateId,
    endpoints,
    proof,
  };
}
