/** Recoverable teardown of exact, proven-landed delivery residue. */

import type { DeliveryHostChangeRequest, DeliveryHostPort } from "./host.js";
import { acceptDeliveryOperationResult, reserveDeliveryOperation } from "./operation.js";
import { deriveDeliveryPosition, type DeliveryPositionFactsV1 } from "./position.js";
import type { DeliveryRevisionedRecord, DeliveryStateStore } from "./ports.js";
import type { DeliveryPlanV1, DeliveryStateV1 } from "./schema.js";
import {
  assessDeliveryTerminalTop,
  type DeliveryTerminalTopResult,
} from "./terminal-integration.js";

type StateWriter = Pick<DeliveryStateStore<DeliveryStateV1>, "publish">;

export type TeardownLandedDeliveryMemberResult =
  | {
      readonly status: "torn-down";
      readonly state: DeliveryRevisionedRecord<DeliveryStateV1>;
      readonly nextAction: "continue";
    }
  | {
      readonly status: "torn-down";
      readonly state: DeliveryRevisionedRecord<DeliveryStateV1>;
      readonly nextAction: "terminal-checkpoint" | "retarget" | "reopen-and-retarget";
      readonly top: Extract<DeliveryTerminalTopResult, { readonly status: "ready" } | {
        readonly reason: "top-target-mismatch";
      }>;
    }
  | { readonly status: "refused"; readonly reason: string }
  | {
      readonly status: "blocked";
      readonly reason:
        | "delete-refused"
        | "request-mismatch"
        | "top-request-mismatch"
        | "ambiguous-result"
        | "state-conflict";
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
  const requested = before;
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
  const deletion = await input.deleteRef({ ref: member.ref, expectedHead: initialRequest.request.headSha });
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
  let top: Extract<DeliveryTerminalTopResult, { readonly status: "ready" } | {
    readonly reason: "top-target-mismatch";
  }> | null = null;
  if (index === input.plan.members.length - 2) {
    const terminal = input.current.value.members.at(-1);
    if (terminal?.changeRequest === null || terminal?.changeRequest === undefined
      || terminal.coordinates === null) {
      return { status: "blocked", reason: "top-request-mismatch", reservation: persistedReservation.value };
    }
    const observedTop = await input.host.readRequest(input.repository, terminal.changeRequest);
    if (observedTop.status !== "observed") {
      return { status: "blocked", reason: "top-request-mismatch", reservation: persistedReservation.value };
    }
    const topDecision = assessDeliveryTerminalTop({
      terminal: true,
      protectedBaseRef: input.protectedTargetRef,
      publicationHead: terminal.coordinates.head,
      request: observedTop.request,
    });
    if (topDecision.status === "window-open"
      || (topDecision.status === "refused" && topDecision.reason !== "top-target-mismatch")) {
      return { status: "blocked", reason: "top-request-mismatch", reservation: persistedReservation.value };
    }
    top = topDecision;
  }
  const accepted = acceptDeliveryOperationResult(persistedReservation.value, requested);
  if (accepted.status !== "applied") {
    return { status: "blocked", reason: "ambiguous-result", reservation: persistedReservation.value };
  }
  const persisted = await input.stateStore.publish(
    input.plan.planId, accepted.state, persistedReservation.value.revision,
  );
  if (persisted.status !== "ok") {
    return { status: "blocked", reason: "state-conflict", reservation: persistedReservation.value };
  }
  if (top === null) return { status: "torn-down", state: persisted.value, nextAction: "continue" };
  return top.status === "ready"
    ? { status: "torn-down", state: persisted.value, nextAction: "terminal-checkpoint", top }
    : { status: "torn-down", state: persisted.value, nextAction: top.remedy.nextAction, top };
}
