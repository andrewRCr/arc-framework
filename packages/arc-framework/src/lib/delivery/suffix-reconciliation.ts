/** Exact reservation and convergence for one predecessor-changing suffix retarget. */

import type { DeliveryHostPort } from "./host.js";
import {
  acceptDeliveryOperationResult,
  checkDeliveryOperationPrecondition,
  reconcileDeliveryOperation,
  reserveDeliveryOperation,
} from "./operation.js";
import {
  recognizeDeliverySuffixRetarget,
  type DeliveryPositionFactsV1,
} from "./position.js";
import type { DeliveryRevisionedRecord, DeliveryStateStore } from "./ports.js";
import type { DeliveryPlanV1, DeliveryStateV1 } from "./schema.js";
import type { DeliveryOperationSnapshotV1 } from "./schema.js";
import type { DeliveryContributionProofResult } from "./contribution-proof.js";

type StateWriter = Pick<DeliveryStateStore<DeliveryStateV1>, "publish">;

/** Post-observation reserve result for a uniquely recognized suffix movement. */
export type ReserveObservedSuffixRetargetResult =
  | { readonly status: "reserved"; readonly state: DeliveryRevisionedRecord<DeliveryStateV1> }
  | {
      readonly status: "refused";
      readonly reason: "position-mismatch" | "request-mismatch" | "contribution-mismatch" | "reservation-refused"
        | "state-conflict";
    };

/** Recognize, prove, and post-reserve one host-initiated first-suffix retarget. */
export async function reserveObservedSuffixRetarget(input: {
  readonly plan: DeliveryPlanV1;
  readonly current: DeliveryRevisionedRecord<DeliveryStateV1>;
  readonly facts: DeliveryPositionFactsV1;
  readonly repository: string;
  readonly protectedTargetRef: string;
  readonly host: Pick<DeliveryHostPort, "readRequest">;
  readonly proveContribution: () => Promise<DeliveryContributionProofResult>;
  readonly stateStore: StateWriter;
}): Promise<ReserveObservedSuffixRetargetResult> {
  const recognized = recognizeDeliverySuffixRetarget(input.plan, input.current.value, input.facts);
  if (recognized.status !== "recognized") return { status: "refused", reason: "position-mismatch" };
  const requestedMember = recognized.requested.members[0];
  if (requestedMember === undefined || requestedMember.ref === null || requestedMember.coordinates === null
    || requestedMember.changeRequest === null) return { status: "refused", reason: "position-mismatch" };
  const host = await input.host.readRequest(input.repository, requestedMember.changeRequest);
  const shortHeadRef = requestedMember.ref.replace(/^refs\/heads\//u, "");
  const shortBaseRef = input.protectedTargetRef.replace(/^refs\/heads\//u, "");
  if (host.status !== "observed" || host.request.state !== "open"
    || host.request.repository !== input.repository || host.request.headRepository !== input.repository
    || host.request.binding.providerId !== requestedMember.changeRequest.providerId
    || host.request.binding.changeRequestId !== requestedMember.changeRequest.changeRequestId
    || host.request.headRef !== shortHeadRef || host.request.headSha !== requestedMember.coordinates.head
    || host.request.baseRef !== shortBaseRef) return { status: "refused", reason: "request-mismatch" };
  if ((await input.proveContribution()).status !== "accepted") {
    return { status: "refused", reason: "contribution-mismatch" };
  }
  const reserved = reserveDeliveryOperation(input.current, input.plan, {
    operationId: crypto.randomUUID(),
    kind: "rewrite",
    affectedDeliverableIds: [recognized.deliverableId],
    expectedStateRevision: input.current.revision,
    before: recognized.before,
    requested: recognized.requested,
  });
  if (reserved.status !== "reserved") return { status: "refused", reason: "reservation-refused" };
  const persisted = await input.stateStore.publish(input.plan.planId, reserved.state, input.current.revision);
  return persisted.status === "ok"
    ? { status: "reserved", state: persisted.value }
    : { status: "refused", reason: "state-conflict" };
}

/** Reobserve and converge one persisted rewrite reservation through ordinary exact reconciliation. */
export async function reconcileReservedSuffixRetarget(input: {
  readonly planId: string;
  readonly current: DeliveryRevisionedRecord<DeliveryStateV1>;
  readonly observed: unknown;
  readonly proveContribution: () => Promise<DeliveryContributionProofResult>;
  readonly stateStore: StateWriter;
}): Promise<
  | { readonly status: "applied"; readonly state: DeliveryRevisionedRecord<DeliveryStateV1> }
  | { readonly status: "retryable" }
  | { readonly status: "blocked"; readonly reason: "contribution-mismatch" | "ambiguous" | "state-conflict" }
> {
  if ((await input.proveContribution()).status !== "accepted") {
    return { status: "blocked", reason: "contribution-mismatch" };
  }
  const reconciled = reconcileDeliveryOperation(input.current, input.observed);
  if (reconciled.status === "retry") return { status: "retryable" };
  if (reconciled.status !== "adopt") return { status: "blocked", reason: "ambiguous" };
  const persisted = await input.stateStore.publish(input.planId, reconciled.state, input.current.revision);
  return persisted.status === "ok"
    ? { status: "applied", state: persisted.value }
    : { status: "blocked", reason: "state-conflict" };
}

/** Execute one explicit suffix rewrite through lifecycle revalidation, reservation, lease, and exact adoption. */
export async function executeDeliverySuffixRewrite(input: {
  readonly plan: DeliveryPlanV1;
  readonly current: DeliveryRevisionedRecord<DeliveryStateV1>;
  readonly deliverableId: string;
  readonly requested: DeliveryOperationSnapshotV1;
  /** Selected review fixes are authorized content changes, not false equivalence claims. */
  readonly contributionMode?: "prove-equivalent" | "selected-change";
  readonly revalidateLifecycle: () => Promise<{ readonly status: "ok" | "refused" }>;
  readonly rewriteRef: (input: {
    readonly ref: string;
    readonly beforeHead: string;
    readonly requestedHead: string;
  }) => Promise<{ readonly status: "rewritten" | "adopted" | "refused" }>;
  readonly observeResult: () => Promise<DeliveryOperationSnapshotV1>;
  readonly proveContribution: () => Promise<DeliveryContributionProofResult>;
  readonly stateStore: StateWriter;
}): Promise<
  | { readonly status: "applied"; readonly state: DeliveryRevisionedRecord<DeliveryStateV1> }
  | { readonly status: "refused"; readonly reason: string }
> {
  const member = input.current.value.members.find((candidate) => candidate.deliverableId === input.deliverableId);
  const requestedMember = input.requested.members[0];
  if (member?.ref === null || member?.coordinates === null || requestedMember === undefined
    || requestedMember.deliverableId !== member?.deliverableId || requestedMember.ref !== member.ref
    || requestedMember.changeRequest?.providerId !== member.changeRequest?.providerId
    || requestedMember.changeRequest?.changeRequestId !== member.changeRequest?.changeRequestId
    || requestedMember.coordinates === null) return { status: "refused", reason: "position-mismatch" };
  if ((await input.revalidateLifecycle()).status !== "ok") {
    return { status: "refused", reason: "lifecycle-contribution" };
  }
  const before: DeliveryOperationSnapshotV1 = {
    target: input.current.value.target,
    members: [{
      deliverableId: member.deliverableId,
      ref: member.ref,
      changeRequest: member.changeRequest,
      coordinates: member.coordinates,
    }],
  };
  const reserved = reserveDeliveryOperation(input.current, input.plan, {
    operationId: crypto.randomUUID(),
    kind: "rewrite",
    affectedDeliverableIds: [member.deliverableId],
    expectedStateRevision: input.current.revision,
    before,
    requested: input.requested,
  });
  if (reserved.status !== "reserved") return { status: "refused", reason: "reservation-refused" };
  const persistedReservation = await input.stateStore.publish(
    input.plan.planId, reserved.state, input.current.revision,
  );
  if (persistedReservation.status !== "ok") return { status: "refused", reason: "state-conflict" };
  if (checkDeliveryOperationPrecondition(persistedReservation.value, before).status !== "ready") {
    return { status: "refused", reason: "precondition-mismatch" };
  }
  const rewritten = await input.rewriteRef({
    ref: member.ref,
    beforeHead: member.coordinates.head,
    requestedHead: requestedMember.coordinates.head,
  });
  if (rewritten.status === "refused") return { status: "refused", reason: "rewrite-refused" };
  const observed = await input.observeResult();
  if (input.contributionMode !== "selected-change" && (await input.proveContribution()).status !== "accepted") {
    return { status: "refused", reason: "contribution-mismatch" };
  }
  const accepted = acceptDeliveryOperationResult(persistedReservation.value, observed);
  if (accepted.status !== "applied") return { status: "refused", reason: "ambiguous-result" };
  const persisted = await input.stateStore.publish(
    input.plan.planId, accepted.state, persistedReservation.value.revision,
  );
  return persisted.status === "ok"
    ? { status: "applied", state: persisted.value }
    : { status: "refused", reason: "state-conflict" };
}
