/** Recoverable teardown of exact, proven-landed delivery residue. */

import type { DeliveryHostChangeRequest, DeliveryHostPort } from "./host.js";
import { acceptDeliveryOperationResult, reserveDeliveryOperation } from "./operation.js";
import { deriveDeliveryPosition, type DeliveryPositionFactsV1 } from "./position.js";
import type { DeliveryRevisionedRecord, DeliveryStateStore } from "./ports.js";
import type { DeliveryPlanV1, DeliveryStateV1 } from "./schema.js";

type StateWriter = Pick<DeliveryStateStore<DeliveryStateV1>, "publish">;

export type TeardownLandedDeliveryMemberResult =
  | { readonly status: "torn-down"; readonly state: DeliveryRevisionedRecord<DeliveryStateV1> }
  | { readonly status: "refused"; readonly reason: string }
  | {
      readonly status: "blocked";
      readonly reason: "delete-refused" | "request-mismatch" | "ambiguous-result" | "state-conflict";
      readonly reservation: DeliveryRevisionedRecord<DeliveryStateV1>;
    };

function requestMatches(input: {
  readonly request: DeliveryHostChangeRequest;
  readonly repository: string;
  readonly protectedTargetRef: string;
  readonly member: DeliveryStateV1["members"][number];
}): boolean {
  const { request, member } = input;
  return member.ref !== null && member.changeRequest !== null
    && request.repository === input.repository && request.headRepository === input.repository
    && request.binding.providerId === member.changeRequest.providerId
    && request.binding.changeRequestId === member.changeRequest.changeRequestId
    && request.headRef === member.ref.replace(/^refs\/heads\//u, "")
    && member.coordinates !== null && request.headSha === member.coordinates.head
    && request.baseRef === input.protectedTargetRef.replace(/^refs\/heads\//u, "")
    && (request.state === "merged" || request.state === "closed");
}

/** Reserve, delete/adopt one exact landed ref, reobserve its request, and clear bindings by CAS. */
export async function teardownLandedDeliveryMember(input: {
  readonly plan: DeliveryPlanV1;
  readonly current: DeliveryRevisionedRecord<DeliveryStateV1>;
  readonly facts: DeliveryPositionFactsV1;
  readonly deliverableId: string;
  readonly repository: string;
  readonly protectedTargetRef: string;
  readonly host: Pick<DeliveryHostPort, "readRequest">;
  deleteRef(input: { readonly ref: string; readonly expectedHead: string }): Promise<{
    readonly status: "deleted" | "adopted" | "refused";
  }>;
  readonly stateStore: StateWriter;
}): Promise<TeardownLandedDeliveryMemberResult> {
  const position = deriveDeliveryPosition(input.plan, input.current.value, input.facts);
  if (position.status !== "derived") return { status: "refused", reason: "position-mismatch" };
  const index = input.plan.members.findIndex((member) => member.deliverableId === input.deliverableId);
  if (index < 0) return { status: "refused", reason: "unknown-member" };
  if (index === input.plan.members.length - 1 || !position.position.landedPrefix.includes(
    input.deliverableId as typeof position.position.landedPrefix[number],
  )) return { status: "refused", reason: "member-not-landed" };
  const member = input.current.value.members[index];
  if (member === undefined || member.ref === null || member.changeRequest === null || member.coordinates === null) {
    return { status: "refused", reason: "member-unbound" };
  }
  const initialRequest = await input.host.readRequest(input.repository, member.changeRequest);
  if (initialRequest.status !== "observed" || !requestMatches({
    request: initialRequest.request,
    repository: input.repository,
    protectedTargetRef: input.protectedTargetRef,
    member,
  })) return { status: "refused", reason: "request-mismatch" };

  const before = {
    target: input.current.value.target,
    members: [{
      deliverableId: member.deliverableId,
      ref: member.ref,
      changeRequest: member.changeRequest,
      coordinates: member.coordinates,
    }],
  };
  const requested = {
    target: input.current.value.target,
    members: [{ deliverableId: member.deliverableId, ref: null, changeRequest: null, coordinates: null }],
  };
  const reserved = reserveDeliveryOperation(input.current, input.plan, {
    operationId: crypto.randomUUID(),
    kind: "teardown",
    affectedDeliverableIds: [member.deliverableId],
    expectedStateRevision: input.current.revision,
    before,
    requested,
  });
  if (reserved.status !== "reserved") return { status: "refused", reason: "reservation-refused" };
  const persistedReservation = await input.stateStore.publish(
    input.plan.planId, reserved.state, input.current.revision,
  );
  if (persistedReservation.status !== "ok") return { status: "refused", reason: "state-conflict" };
  const deletion = await input.deleteRef({ ref: member.ref, expectedHead: member.coordinates.head });
  if (deletion.status === "refused") {
    return { status: "blocked", reason: "delete-refused", reservation: persistedReservation.value };
  }
  const finalRequest = await input.host.readRequest(input.repository, member.changeRequest);
  if (finalRequest.status !== "observed" || !requestMatches({
    request: finalRequest.request,
    repository: input.repository,
    protectedTargetRef: input.protectedTargetRef,
    member,
  }) || finalRequest.request.headSha !== initialRequest.request.headSha) {
    return { status: "blocked", reason: "request-mismatch", reservation: persistedReservation.value };
  }
  const accepted = acceptDeliveryOperationResult(persistedReservation.value, requested);
  if (accepted.status !== "applied") {
    return { status: "blocked", reason: "ambiguous-result", reservation: persistedReservation.value };
  }
  const persisted = await input.stateStore.publish(
    input.plan.planId, accepted.state, persistedReservation.value.revision,
  );
  return persisted.status === "ok"
    ? { status: "torn-down", state: persisted.value }
    : { status: "blocked", reason: "state-conflict", reservation: persistedReservation.value };
}
