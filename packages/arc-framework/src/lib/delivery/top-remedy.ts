/** Recoverable, explicitly invoked repair of the retained terminal request. */

import { canonicalize } from "../kernel/index.js";
import type { DeliveryHostChangeRequest, DeliveryHostPort, DeliveryTopRemedyHostPort } from "./host.js";
import {
  acceptDeliveryOperationResult,
  reserveDeliveryOperation,
  type DeliveryHostReconciliationObservationV1,
} from "./operation.js";
import { deriveDeliveryPosition, type DeliveryPositionFactsV1 } from "./position.js";
import type { DeliveryRevisionedRecord, DeliveryStateStore } from "./ports.js";
import type { DeliveryRemoteRefObservation } from "./git-materialization.js";
import type {
  DeliveryOperationSnapshotV1,
  DeliveryPlanV1,
  DeliveryStateV1,
  DeliveryTopRemedyEffectV1,
} from "./schema.js";
import { assessDeliveryTerminalTop, type DeliveryTerminalTopResult } from "./terminal-integration.js";

type StateWriter = Pick<DeliveryStateStore<DeliveryStateV1>, "publish">;
type ReadyTop = Extract<DeliveryTerminalTopResult, { readonly status: "ready" }>;

export type ApplyDeliveryTopRemedyResult =
  | {
      readonly status: "remedied";
      readonly state: DeliveryRevisionedRecord<DeliveryStateV1>;
      readonly nextAction: "terminal-checkpoint";
      readonly top: ReadyTop;
    }
  | { readonly status: "refused"; readonly reason: string }
  | {
      readonly status: "blocked";
      readonly reason:
        | "trigger-ref-mismatch"
        | "mutation-refused"
        | "request-mismatch"
        | "ambiguous-result"
        | "state-conflict";
      readonly reservation: DeliveryRevisionedRecord<DeliveryStateV1>;
    };

function exactTerminalRequest(input: {
  readonly request: DeliveryHostChangeRequest;
  readonly repository: string;
  readonly terminal: DeliveryStateV1["members"][number];
}): boolean {
  const { request, terminal } = input;
  return terminal.ref !== null && terminal.changeRequest !== null && terminal.coordinates !== null
    && request.repository === input.repository && request.headRepository === input.repository
    && canonicalize(request.binding) === canonicalize(terminal.changeRequest)
    && request.headRef === terminal.ref.replace(/^refs\/heads\//u, "")
    && request.headSha === terminal.coordinates.head;
}

/**
 * Match the persisted deletion trigger to one exact retained member binding.
 *
 * @param effect - Persisted terminal remedy effect.
 * @param trigger - Retained member expected to authorize the failure-only repair.
 * @returns Whether the effect names the member's exact retained ref and head.
 */
export function matchesDeliveryTopRemedyTrigger(
  effect: DeliveryTopRemedyEffectV1,
  trigger: DeliveryStateV1["members"][number] | undefined,
): boolean {
  return trigger !== undefined && trigger.ref !== null && trigger.coordinates !== null
    && trigger.ref === effect.triggerRef && trigger.coordinates.head === effect.triggerHeadSha;
}

/** Classify one fresh request observation against a persisted top-remedy effect. */
export function classifyDeliveryTopRemedyObservation(
  effect: DeliveryTopRemedyEffectV1,
  request: DeliveryHostChangeRequest,
  snapshot: DeliveryOperationSnapshotV1,
): DeliveryHostReconciliationObservationV1 {
  const exactBinding = request.repository === effect.repository
    && request.headRepository === effect.repository
    && request.binding.providerId === effect.providerId
    && request.binding.changeRequestId === effect.changeRequestId
    && request.headRef === effect.headRef
    && request.headSha === effect.headSha;
  if (!exactBinding) return { outcome: "ambiguous" };
  if (request.state === "open" && request.baseRef === effect.protectedBaseRef) {
    return {
      outcome: "applied",
      observation: { kind: "top-remedy", effect, outcome: "applied", snapshot },
    };
  }
  if ((effect.action === "retarget" && request.state === "open"
      && request.baseRef === effect.fromBaseRef)
    || (effect.action === "reopen-and-retarget" && request.state === "closed"
      && (request.baseRef === effect.fromBaseRef || request.baseRef === effect.protectedBaseRef))) {
    return { outcome: "not-applied" };
  }
  return { outcome: "ambiguous" };
}

/** Revalidate intent, reserve the exact host effect, apply it, and accept only a fresh repaired request. */
export async function applyDeliveryTopRemedy(input: {
  readonly plan: DeliveryPlanV1;
  readonly current: DeliveryRevisionedRecord<DeliveryStateV1>;
  readonly facts: DeliveryPositionFactsV1;
  readonly action: "retarget" | "reopen-and-retarget";
  readonly repository: string;
  readonly protectedBaseRef: string;
  readonly host: Pick<DeliveryHostPort, "readRequest"> & DeliveryTopRemedyHostPort;
  observeTriggerRef(ref: string): Promise<DeliveryRemoteRefObservation>;
  readonly stateStore: StateWriter;
}): Promise<ApplyDeliveryTopRemedyResult> {
  const position = deriveDeliveryPosition(input.plan, input.current.value, input.facts);
  const terminal = input.current.value.members.at(-1);
  const trigger = input.current.value.members.at(-2);
  const terminalPlan = input.plan.members.at(-1);
  if (position.status !== "derived" || terminal === undefined || terminalPlan === undefined
    || position.position.landedPrefix.length !== input.plan.members.length - 1
    || position.position.firstUnlanded !== terminalPlan.deliverableId) {
    return { status: "refused", reason: "terminal-position-mismatch" };
  }
  if (input.current.value.target?.ref.replace(/^refs\/heads\//u, "") !== input.protectedBaseRef) {
    return { status: "refused", reason: "protected-target-mismatch" };
  }
  if (terminal.ref === null || terminal.changeRequest === null || terminal.coordinates === null) {
    return { status: "refused", reason: "terminal-binding-missing" };
  }
  if (trigger === undefined || trigger.ref === null || trigger.coordinates === null) {
    return { status: "refused", reason: "trigger-binding-missing" };
  }
  const initial = await input.host.readRequest(input.repository, terminal.changeRequest);
  if (initial.status !== "observed" || !exactTerminalRequest({
    request: initial.request, repository: input.repository, terminal,
  })) return { status: "refused", reason: "request-mismatch" };
  const assessed = assessDeliveryTerminalTop({
    terminal: true,
    protectedBaseRef: input.protectedBaseRef,
    publicationHead: terminal.coordinates.head,
    request: initial.request,
  });
  if (assessed.status !== "refused" || assessed.reason !== "top-target-mismatch"
    || assessed.remedy.nextAction !== input.action
    || assessed.remedy.repository !== input.repository
    || assessed.remedy.changeRequestId !== terminal.changeRequest.changeRequestId) {
    return { status: "refused", reason: "remedy-mismatch" };
  }
  const triggerObservation = await input.observeTriggerRef(trigger.ref);
  if (triggerObservation.status === "observed") {
    return { status: "refused", reason: "trigger-ref-present" };
  }
  if (triggerObservation.status !== "absent") {
    return { status: "refused", reason: "trigger-ref-unavailable" };
  }

  const before: DeliveryOperationSnapshotV1 = {
    target: input.current.value.target,
    members: [{
      deliverableId: terminal.deliverableId,
      ref: terminal.ref,
      changeRequest: terminal.changeRequest,
      coordinates: terminal.coordinates,
    }],
  };
  const effect: DeliveryTopRemedyEffectV1 = {
    providerId: terminal.changeRequest.providerId,
    repository: input.repository,
    changeRequestId: terminal.changeRequest.changeRequestId,
    headRef: terminal.ref.replace(/^refs\/heads\//u, ""),
    headSha: terminal.coordinates.head,
    triggerRef: trigger.ref,
    triggerHeadSha: trigger.coordinates.head,
    fromBaseRef: initial.request.baseRef,
    protectedBaseRef: assessed.remedy.protectedBaseRef,
    action: input.action,
  };
  const reserved = reserveDeliveryOperation(input.current, input.plan, {
    operationId: crypto.randomUUID(),
    kind: "top-remedy",
    affectedDeliverableIds: [terminal.deliverableId],
    expectedStateRevision: input.current.revision,
    before,
    requested: before,
    effect,
  });
  if (reserved.status !== "reserved") return { status: "refused", reason: reserved.reason };
  const persistedReservation = await input.stateStore.publish(
    input.plan.planId, reserved.state, input.current.revision,
  );
  if (persistedReservation.status !== "ok") return { status: "refused", reason: "state-conflict" };
  if ((await input.observeTriggerRef(trigger.ref)).status !== "absent") {
    return {
      status: "blocked",
      reason: "trigger-ref-mismatch",
      reservation: persistedReservation.value,
    };
  }
  if ((await input.host.applyTopRemedy(effect)).status !== "submitted") {
    return { status: "blocked", reason: "mutation-refused", reservation: persistedReservation.value };
  }
  const final = await input.host.readRequest(input.repository, terminal.changeRequest);
  if (final.status !== "observed" || !exactTerminalRequest({
    request: final.request, repository: input.repository, terminal,
  })) return { status: "blocked", reason: "request-mismatch", reservation: persistedReservation.value };
  const top = assessDeliveryTerminalTop({
    terminal: true,
    protectedBaseRef: input.protectedBaseRef,
    publicationHead: terminal.coordinates.head,
    request: final.request,
  });
  if (top.status !== "ready") {
    return { status: "blocked", reason: "request-mismatch", reservation: persistedReservation.value };
  }
  const accepted = acceptDeliveryOperationResult(persistedReservation.value, {
    kind: "top-remedy",
    effect,
    outcome: "applied",
    snapshot: before,
  });
  if (accepted.status !== "applied") {
    return { status: "blocked", reason: "ambiguous-result", reservation: persistedReservation.value };
  }
  const persisted = await input.stateStore.publish(
    input.plan.planId, accepted.state, persistedReservation.value.revision,
  );
  return persisted.status === "ok"
    ? { status: "remedied", state: persisted.value, nextAction: "terminal-checkpoint", top }
    : { status: "blocked", reason: "state-conflict", reservation: persistedReservation.value };
}
