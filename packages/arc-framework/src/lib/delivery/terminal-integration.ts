/** Terminal delivery claim composition for the integration checkpoint. */

import type {
  CandidateCurrentnessProjection,
  CandidateManagedRecordV1,
} from "../work-unit/candidate-attestation.js";
import { CandidateManagedRecordV1Schema } from "../work-unit/candidate-attestation.js";
import type {
  DeliveryContributionEndpoints,
  DeliveryContributionProofResult,
} from "./contribution-proof.js";
import type { DeliveryHostChangeRequest } from "./host.js";
import type { DeliveryPlanV1, DeliveryStateV1 } from "./schema.js";
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
  | { readonly status: "ready"; readonly request: DeliveryHostChangeRequest }
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

export type DeliveryTerminalDriftResult =
  | { readonly status: "reconcile"; readonly nextAction: "reconcile-base" }
  | {
      readonly status: "verify-member";
      readonly nextAction: "verify-terminal-member";
      readonly deliverableId: string;
      readonly paths: readonly string[];
    }
  | {
      readonly status: "refused";
      readonly reason: "predecessor-overlap";
      readonly paths: readonly string[];
    };

/** Scope terminal-window drift against the residual rather than the whole Candidate union. */
export function classifyDeliveryTerminalDrift(input: {
  readonly terminalDeliverableId: string;
  readonly driftPaths: readonly string[];
  readonly residualPaths: readonly string[];
  readonly predecessorPaths: readonly string[];
}): DeliveryTerminalDriftResult {
  const intersect = (paths: readonly string[]): string[] => {
    const candidates = new Set(paths);
    return [...new Set(input.driftPaths.filter((path) => candidates.has(path)))].sort();
  };
  const predecessorOverlap = intersect(input.predecessorPaths);
  if (predecessorOverlap.length > 0) {
    return { status: "refused", reason: "predecessor-overlap", paths: predecessorOverlap };
  }
  const residualOverlap = intersect(input.residualPaths);
  if (residualOverlap.length > 0) {
    return {
      status: "verify-member",
      nextAction: "verify-terminal-member",
      deliverableId: input.terminalDeliverableId,
      paths: residualOverlap,
    };
  }
  return { status: "reconcile", nextAction: "reconcile-base" };
}

/** Require the protected base only at the freshly observed terminal instant. */
export function assessDeliveryTerminalTop(input: {
  readonly terminal: boolean;
  readonly protectedBaseRef: string;
  readonly publicationHead: string;
  readonly request: DeliveryHostChangeRequest;
}): DeliveryTerminalTopResult {
  if (!input.terminal) return { status: "window-open" };
  if (input.request.headSha !== input.publicationHead || input.request.state === "merged") {
    return { status: "refused", reason: "top-request-mismatch" };
  }
  const protectedBase = input.protectedBaseRef.replace(/^refs\/heads\//u, "");
  if (input.request.state === "open" && input.request.baseRef === protectedBase) {
    return { status: "ready", request: input.request };
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

/** Apply one explicitly selected failure remedy, then reassess only a fresh top observation. */
export async function applyDeliveryTerminalTopRemedy(input: {
  readonly publicationHead: string;
  readonly remedy: DeliveryTerminalTopRemedy;
  apply(remedy: DeliveryTerminalTopRemedy): Promise<{ readonly status: "submitted" | "refused" }>;
  observe(): Promise<
    | { readonly status: "observed"; readonly request: DeliveryHostChangeRequest }
    | { readonly status: "refused" }
  >;
}): Promise<DeliveryTerminalTopResult | { readonly status: "refused"; readonly reason: "remedy-application-refused" }> {
  if ((await input.apply(input.remedy)).status !== "submitted") {
    return { status: "refused", reason: "remedy-application-refused" };
  }
  const fresh = await input.observe();
  if (fresh.status !== "observed") return { status: "refused", reason: "remedy-application-refused" };
  return assessDeliveryTerminalTop({
    terminal: true,
    protectedBaseRef: input.remedy.protectedBaseRef,
    publicationHead: input.publicationHead,
    request: fresh.request,
  });
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
