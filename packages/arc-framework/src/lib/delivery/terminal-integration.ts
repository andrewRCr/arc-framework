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
