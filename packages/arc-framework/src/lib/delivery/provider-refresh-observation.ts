/** Exact plan/state subject derivation and provider-refresh observation. */

import { canonicalize } from "../kernel/index.js";
import type { DeliveryHostRequestObservation } from "./host.js";
import type {
  DeliveryOperationSnapshotV1,
  DeliveryPlanV1,
  DeliveryStateV1,
  DeliveryTargetCoordinatesV1,
} from "./schema.js";
import { deriveDeliveryPosition, type DeliveryPositionFactsV1 } from "./position.js";
import type {
  DeliveryProviderRefreshObservation,
  DeliveryProviderRefreshObservationResult,
} from "./suffix-reconciliation.js";
import { validateDeliveryStateAgainstPlan } from "./state.js";

/** The exact remaining registered suffix derived from canonical plan and state. */
export interface DeliveryProviderRefreshSubject {
  readonly landedPrefix: readonly string[];
  readonly affectedDeliverableIds: readonly string[];
  readonly before: DeliveryOperationSnapshotV1;
}

export type DeriveDeliveryProviderRefreshSubjectResult =
  | { readonly status: "derived"; readonly subject: DeliveryProviderRefreshSubject }
  | { readonly status: "refused"; readonly reason: "position-mismatch" | "suffix-empty" };

/** Derive the complete bound non-terminal suffix without accepting caller-authored member identity. */
export function deriveDeliveryProviderRefreshSubject(input: {
  readonly plan: DeliveryPlanV1;
  readonly state: DeliveryStateV1;
  readonly facts: DeliveryPositionFactsV1;
}): DeriveDeliveryProviderRefreshSubjectResult {
  if (input.state.activeOperation !== null
    || validateDeliveryStateAgainstPlan(input.state, input.plan).status === "refused"
    || input.state.target === null || input.state.target.coordinates === null) {
    return { status: "refused", reason: "position-mismatch" };
  }
  const position = deriveDeliveryPosition(input.plan, input.state, input.facts);
  if (position.status !== "derived") return { status: "refused", reason: "position-mismatch" };
  const landedCount = position.position.landedPrefix.length;
  const suffix = input.state.members.slice(landedCount, -1);
  if (suffix.length === 0) return { status: "refused", reason: "suffix-empty" };
  const suffixIsBound = suffix.every((member) => (
    member.ref !== null && member.changeRequest !== null && member.coordinates !== null
  ));
  if (!suffixIsBound) return { status: "refused", reason: "position-mismatch" };
  const members = suffix.map((member) => ({
    deliverableId: member.deliverableId,
    ref: member.ref,
    changeRequest: member.changeRequest,
    coordinates: member.coordinates,
  }));
  return {
    status: "derived",
    subject: {
      landedPrefix: position.position.landedPrefix,
      affectedDeliverableIds: members.map(({ deliverableId }) => deliverableId),
      before: { target: input.state.target, members },
    },
  };
}

export interface DeliveryProviderRefreshObservationPort {
  observeRequest(
    repository: string,
    binding: NonNullable<DeliveryOperationSnapshotV1["members"][number]["changeRequest"]>,
  ): Promise<DeliveryHostRequestObservation>;
  observeTarget(repository: string, ref: string): Promise<
    | { readonly status: "observed"; readonly coordinates: DeliveryTargetCoordinatesV1 }
    | { readonly status: "refused" }
  >;
  observeRef(ref: string): Promise<DeliveryTargetCoordinatesV1 | null>;
  readAncestry(ancestor: string, descendant: string): Promise<"ancestor" | "not-ancestor" | null>;
}

export type ObserveDeliveryProviderRefreshResult = DeliveryProviderRefreshObservationResult;

/** Reobserve the exact subject through host and Git authorities. */
export async function observeDeliveryProviderRefresh(input: {
  readonly subject: DeliveryProviderRefreshSubject;
  readonly repository: string;
}, port: DeliveryProviderRefreshObservationPort): Promise<ObserveDeliveryProviderRefreshResult> {
  const beforeTarget = input.subject.before.target;
  if (beforeTarget === null || beforeTarget.coordinates === null || input.repository === "") {
    return { status: "refused", reason: "ambiguous-provider-movement" };
  }
  const observedTarget = await port.observeTarget(input.repository, beforeTarget.ref);
  if (observedTarget.status !== "observed") {
    return { status: "refused", reason: "observation-unavailable" };
  }
  let targetMovement: DeliveryProviderRefreshObservation["targetMovement"] = "exact";
  if (canonicalize(observedTarget.coordinates) !== canonicalize(beforeTarget.coordinates)) {
    const ancestry = await port.readAncestry(beforeTarget.coordinates.head, observedTarget.coordinates.head);
    if (ancestry === null) return { status: "refused", reason: "observation-unavailable" };
    if (ancestry !== "ancestor") return { status: "refused", reason: "target-rewritten" };
    targetMovement = "append-only";
  }

  const members: Array<DeliveryOperationSnapshotV1["members"][number]> = [];
  for (const [index, member] of input.subject.before.members.entries()) {
    if (member.ref === null || member.changeRequest === null || member.coordinates === null) {
      return { status: "refused", reason: "ambiguous-provider-movement" };
    }
    const [request, coordinates] = await Promise.all([
      port.observeRequest(input.repository, member.changeRequest),
      port.observeRef(member.ref),
    ]);
    const expectedBaseRef = index === 0
      ? beforeTarget.ref
      : input.subject.before.members[index - 1]?.ref;
    if (request.status !== "observed" || coordinates === null || expectedBaseRef === null
      || expectedBaseRef === undefined
      || canonicalize(request.request.binding) !== canonicalize(member.changeRequest)
      || request.request.repository !== input.repository
      || request.request.headRepository !== input.repository
      || request.request.headRef !== member.ref.replace(/^refs\/heads\//u, "")
      || request.request.headSha !== coordinates.head
      || request.request.baseRef !== expectedBaseRef.replace(/^refs\/heads\//u, "")
      || request.request.state !== "open") {
      return { status: "refused", reason: "ambiguous-provider-movement" };
    }
    const predecessor = index === 0 ? observedTarget.coordinates : members[index - 1]?.coordinates;
    if (predecessor === null || predecessor === undefined) {
      return { status: "refused", reason: "ambiguous-provider-movement" };
    }
    members.push({
      deliverableId: member.deliverableId,
      ref: member.ref,
      changeRequest: member.changeRequest,
      coordinates: { base: predecessor.head, head: coordinates.head, tree: coordinates.tree },
    });
  }
  if (members.length === 0) return { status: "refused", reason: "ambiguous-provider-movement" };
  return {
    status: "observed",
    observation: {
      targetMovement,
      snapshot: {
        target: { ref: beforeTarget.ref, coordinates: observedTarget.coordinates },
        members,
      },
    },
  };
}
