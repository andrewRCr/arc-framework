/** Recoverable teardown of exact, proven-landed delivery residue. */

import { canonicalize } from "../kernel/index.js";
import type { DeliveryHostChangeRequest, DeliveryHostPort } from "./host.js";
import {
  acceptDeliveryOperationResult,
  reserveDeliveryOperation,
  validateDeliveryActiveOperation,
} from "./operation.js";
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

/**
 * Match one retained landed-member request against the exact teardown authority.
 *
 * @param input - Fresh request plus retained repository, target, and member authority.
 * @returns Whether every request identity and landed-state field remains exact.
 */
export function matchesDeliveryTeardownRequest(input: {
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

/** Reserve, delete/adopt one exact landed ref, reobserve its request, and retain its bindings by CAS. */
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
  const position = deriveDeliveryPosition(input.plan, {
    ...input.current.value,
    activeOperation: null,
  }, input.facts);
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
  const initialRequest = await input.host.readRequest(input.repository, member.changeRequest);
  if (initialRequest.status !== "observed" || !matchesDeliveryTeardownRequest({
    request: initialRequest.request,
    repository: input.repository,
    protectedTargetRef: input.protectedTargetRef,
    member,
  })) return { status: "refused", reason: "request-mismatch" };

  let persistedReservation: DeliveryRevisionedRecord<DeliveryStateV1>;
  if (input.current.value.activeOperation === null) {
    const reserved = reserveDeliveryOperation(input.current, input.plan, {
      operationId: crypto.randomUUID(),
      kind: "teardown",
      affectedDeliverableIds: [member.deliverableId],
      expectedStateRevision: input.current.revision,
      before,
      requested,
    });
    if (reserved.status !== "reserved") return { status: "refused", reason: "reservation-refused" };
    const published = await input.stateStore.publish(
      input.plan.planId, reserved.state, input.current.revision,
    );
    if (published.status !== "ok") return { status: "refused", reason: "state-conflict" };
    persistedReservation = published.value;
  } else {
    const active = validateDeliveryActiveOperation(input.current);
    if (active.status !== "valid" || active.operation.kind !== "teardown"
      || active.operation.affectedDeliverableIds.length !== 1
      || active.operation.affectedDeliverableIds[0] !== member.deliverableId
      || canonicalize(active.operation.before) !== canonicalize(before)
      || canonicalize(active.operation.requested) !== canonicalize(requested)) {
      return { status: "refused", reason: "reservation-refused" };
    }
    persistedReservation = input.current;
  }
  const deletion = await input.deleteRef({ ref: member.ref, expectedHead: member.coordinates.head });
  if (deletion.status === "refused") {
    return { status: "blocked", reason: "delete-refused", reservation: persistedReservation };
  }
  const finalRequest = await input.host.readRequest(input.repository, member.changeRequest);
  if (finalRequest.status !== "observed" || !matchesDeliveryTeardownRequest({
    request: finalRequest.request,
    repository: input.repository,
    protectedTargetRef: input.protectedTargetRef,
    member,
  }) || finalRequest.request.headSha !== initialRequest.request.headSha) {
    return { status: "blocked", reason: "request-mismatch", reservation: persistedReservation };
  }
  let top: Extract<DeliveryTerminalTopResult, { readonly status: "ready" } | {
    readonly reason: "top-target-mismatch";
  }> | null = null;
  if (index === input.plan.members.length - 2) {
    const terminal = input.current.value.members.at(-1);
    if (terminal?.changeRequest === null || terminal?.changeRequest === undefined
      || terminal.coordinates === null) {
      return { status: "blocked", reason: "top-request-mismatch", reservation: persistedReservation };
    }
    const observedTop = await input.host.readRequest(input.repository, terminal.changeRequest);
    if (observedTop.status !== "observed") {
      return { status: "blocked", reason: "top-request-mismatch", reservation: persistedReservation };
    }
    const topDecision = assessDeliveryTerminalTop({
      terminal: true,
      protectedBaseRef: input.protectedTargetRef,
      publicationHead: terminal.coordinates.head,
      request: observedTop.request,
    });
    if (topDecision.status === "window-open"
      || (topDecision.status === "refused" && topDecision.reason !== "top-target-mismatch")) {
      return { status: "blocked", reason: "top-request-mismatch", reservation: persistedReservation };
    }
    top = topDecision;
  }
  const accepted = acceptDeliveryOperationResult(persistedReservation, requested);
  if (accepted.status !== "applied") {
    return { status: "blocked", reason: "ambiguous-result", reservation: persistedReservation };
  }
  const persisted = await input.stateStore.publish(
    input.plan.planId, accepted.state, persistedReservation.revision,
  );
  if (persisted.status !== "ok") {
    return { status: "blocked", reason: "state-conflict", reservation: persistedReservation };
  }
  if (top === null) return { status: "torn-down", state: persisted.value, nextAction: "continue" };
  return top.status === "ready"
    ? { status: "torn-down", state: persisted.value, nextAction: "terminal-checkpoint", top }
    : { status: "torn-down", state: persisted.value, nextAction: top.remedy.nextAction, top };
}
