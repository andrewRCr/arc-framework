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
import type { DeliveryPlanV1, DeliveryStateV1, DeliveryTopRemedyEffectV1 } from "./schema.js";
import {
  assessDeliveryTerminalTop,
  type DeliveryTerminalTopResult,
} from "./terminal-integration.js";

type StateWriter = Pick<DeliveryStateStore<DeliveryStateV1>, "publish">;

function branchName(ref: string): string {
  return ref.replace(/^refs\/heads\//u, "");
}

/** Derive the only request bases that preserve exact teardown authority for one retained member. */
export function deliveryTeardownAcceptedBaseRefs(input: {
  readonly plan: DeliveryPlanV1;
  readonly state: DeliveryStateV1;
  readonly deliverableId: string;
  readonly protectedTargetRef: string;
}): readonly string[] | null {
  if (canonicalize(input.plan.members.map(({ deliverableId }) => deliverableId))
    !== canonicalize(input.state.members.map(({ deliverableId }) => deliverableId))) return null;
  const index = input.plan.members.findIndex(({ deliverableId }) => deliverableId === input.deliverableId);
  if (index < 0) return null;
  const accepted = [branchName(input.protectedTargetRef)];
  if (index === 0) return accepted;
  const predecessor = input.state.members[index - 1];
  if (predecessor === undefined || predecessor.ref === null) return null;
  accepted.push(branchName(predecessor.ref));
  return [...new Set(accepted)];
}

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
      readonly reason: "top-remedy-required";
      readonly nextAction: "reopen-and-retarget";
      readonly top: Extract<DeliveryTerminalTopResult, { readonly reason: "top-target-mismatch" }>;
    }
  | {
      readonly status: "blocked";
      readonly reason:
        | "delete-refused"
        | "request-mismatch"
        | "top-request-mismatch"
        | "top-remedy-refused"
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
  readonly acceptedBaseRefs: readonly string[];
  readonly member: DeliveryStateV1["members"][number];
}): boolean {
  const { request, member } = input;
  return member.ref !== null && member.changeRequest !== null
    && request.repository === input.repository && request.headRepository === input.repository
    && request.binding.providerId === member.changeRequest.providerId
    && request.binding.changeRequestId === member.changeRequest.changeRequestId
    && request.headRef === branchName(member.ref)
    && member.coordinates !== null && request.headSha === member.coordinates.head
    && input.acceptedBaseRefs.map(branchName).includes(request.baseRef)
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
  readonly host: Pick<DeliveryHostPort, "readRequest"> & {
    applyTopRemedy(effect: DeliveryTopRemedyEffectV1): Promise<{
      readonly status: "submitted" | "refused";
      readonly reason?: string;
    }>;
  };
  deleteLocalRef(input: { readonly ref: string; readonly expectedHead: string }): Promise<{
    readonly status: "deleted" | "adopted" | "refused";
  }>;
  deleteRemoteRef(input: { readonly ref: string; readonly expectedHead: string }): Promise<{
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
  const acceptedBaseRefs = deliveryTeardownAcceptedBaseRefs({
    plan: input.plan,
    state: input.current.value,
    deliverableId: input.deliverableId,
    protectedTargetRef: input.protectedTargetRef,
  });
  if (acceptedBaseRefs === null) return { status: "refused", reason: "request-mismatch" };
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
    acceptedBaseRefs,
    member,
  })) return { status: "refused", reason: "request-mismatch" };

  const terminal = index === input.plan.members.length - 2
    ? input.current.value.members.at(-1)
    : undefined;
  let topBeforeDeletion: Extract<DeliveryTerminalTopResult, { readonly status: "ready" }> | null = null;
  let preDeleteRetarget: DeliveryTopRemedyEffectV1 | null = null;
  if (terminal !== undefined) {
    if (terminal.ref === null || terminal.changeRequest === null || terminal.coordinates === null) {
      return { status: "refused", reason: "top-request-mismatch" };
    }
    const observedTop = await input.host.readRequest(input.repository, terminal.changeRequest);
    if (observedTop.status !== "observed"
      || observedTop.request.repository !== input.repository
      || observedTop.request.headRepository !== input.repository
      || canonicalize(observedTop.request.binding) !== canonicalize(terminal.changeRequest)
      || observedTop.request.headRef !== branchName(terminal.ref)
      || observedTop.request.headSha !== terminal.coordinates.head) {
      return { status: "refused", reason: "top-request-mismatch" };
    }
    const topDecision = assessDeliveryTerminalTop({
      terminal: true,
      protectedBaseRef: input.protectedTargetRef,
      publicationHead: terminal.coordinates.head,
      request: observedTop.request,
    });
    if (topDecision.status === "ready") {
      topBeforeDeletion = topDecision;
    } else if (topDecision.status === "refused" && topDecision.reason === "top-target-mismatch") {
      if (topDecision.remedy.nextAction !== "retarget") {
        return {
          status: "blocked",
          reason: "top-remedy-required",
          nextAction: "reopen-and-retarget",
          top: topDecision,
        };
      }
      preDeleteRetarget = {
        providerId: terminal.changeRequest.providerId,
        repository: input.repository,
        changeRequestId: terminal.changeRequest.changeRequestId,
        headRef: branchName(terminal.ref),
        headSha: terminal.coordinates.head,
        triggerRef: member.ref,
        triggerHeadSha: member.coordinates.head,
        fromBaseRef: observedTop.request.baseRef,
        protectedBaseRef: topDecision.remedy.protectedBaseRef,
        action: "retarget",
      };
    } else {
      return { status: "refused", reason: "top-request-mismatch" };
    }
  }

  let persistedReservation: DeliveryRevisionedRecord<DeliveryStateV1>;
  if (input.current.value.activeOperation === null) {
    const reserved = reserveDeliveryOperation(input.current, input.plan, {
      operationId: crypto.randomUUID(),
      kind: "teardown",
      mode: "member",
      candidateHeads: [],
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
      || active.operation.mode !== "member"
      || active.operation.affectedDeliverableIds.length !== 1
      || active.operation.affectedDeliverableIds[0] !== member.deliverableId
      || canonicalize(active.operation.before) !== canonicalize(before)
      || canonicalize(active.operation.requested) !== canonicalize(requested)) {
      return { status: "refused", reason: "reservation-refused" };
    }
    persistedReservation = input.current;
  }
  if (preDeleteRetarget !== null) {
    if (terminal === undefined || terminal.ref === null
      || terminal.changeRequest === null || terminal.coordinates === null) {
      return { status: "blocked", reason: "top-request-mismatch", reservation: persistedReservation };
    }
    const retargeted = await input.host.applyTopRemedy(preDeleteRetarget);
    if (retargeted.status !== "submitted") {
      return { status: "blocked", reason: "top-remedy-refused", reservation: persistedReservation };
    }
    const refreshedTop = await input.host.readRequest(input.repository, terminal.changeRequest);
    if (refreshedTop.status !== "observed"
      || refreshedTop.request.repository !== input.repository
      || refreshedTop.request.headRepository !== input.repository
      || canonicalize(refreshedTop.request.binding) !== canonicalize(terminal.changeRequest)
      || refreshedTop.request.headRef !== branchName(terminal.ref)
      || refreshedTop.request.headSha !== terminal.coordinates.head) {
      return { status: "blocked", reason: "top-request-mismatch", reservation: persistedReservation };
    }
    const topDecision = assessDeliveryTerminalTop({
      terminal: true,
      protectedBaseRef: input.protectedTargetRef,
      publicationHead: terminal.coordinates.head,
      request: refreshedTop.request,
    });
    if (topDecision.status !== "ready") {
      return { status: "blocked", reason: "top-request-mismatch", reservation: persistedReservation };
    }
    topBeforeDeletion = topDecision;
  }
  const localDeletion = await input.deleteLocalRef({ ref: member.ref, expectedHead: member.coordinates.head });
  if (localDeletion.status === "refused") {
    return { status: "blocked", reason: "delete-refused", reservation: persistedReservation };
  }
  const remoteDeletion = await input.deleteRemoteRef({ ref: member.ref, expectedHead: member.coordinates.head });
  if (remoteDeletion.status === "refused") {
    return { status: "blocked", reason: "delete-refused", reservation: persistedReservation };
  }
  const finalRequest = await input.host.readRequest(input.repository, member.changeRequest);
  if (finalRequest.status !== "observed" || !matchesDeliveryTeardownRequest({
    request: finalRequest.request,
    repository: input.repository,
    acceptedBaseRefs,
    member,
  }) || finalRequest.request.headSha !== initialRequest.request.headSha) {
    return { status: "blocked", reason: "request-mismatch", reservation: persistedReservation };
  }
  let top: Extract<DeliveryTerminalTopResult, { readonly status: "ready" } | {
    readonly reason: "top-target-mismatch";
  }> | null = null;
  if (index === input.plan.members.length - 2) {
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
    if (topBeforeDeletion?.status === "ready" && topDecision.status !== "ready") {
      return { status: "blocked", reason: "top-request-mismatch", reservation: persistedReservation };
    }
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
