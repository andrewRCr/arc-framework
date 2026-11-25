/** Shared fixtures for the native delivery landing suites — the reserved stack and the linked-suffix stack. */

import type { DeliveryStateV1 } from "../../src/lib/delivery/schema.js";
import {
  beginNativeDeliverySubmission,
  reserveDeliveryOperation,
} from "../../src/lib/delivery/operation.js";
import { deliveryStateFixture } from "../fixtures/delivery-state.js";
import {
  deliveryFiveMemberStackPlanFixture,
  deliveryFourMemberStackPlanFixture,
  deliveryThreeMemberStackPlanFixture,
} from "../fixtures/delivery-plan.js";

export const plan = deliveryThreeMemberStackPlanFixture();
export const heads = plan.members.slice(0, -1).map((member, index) => ({
  deliverableId: member.deliverableId,
  changeRequestId: String(41 + index),
  headSha: String(index + 1).repeat(40),
}));
export const mergePolicy = (repository: string) => ({
  repository,
  stackPosition: "intermediate" as const,
  method: "merge" as const,
  allowedMethods: ["merge"] as Array<"merge" | "rebase" | "squash">,
  policyFingerprint: `sha256:${"a".repeat(64)}` as const,
});

export const movedSuffixCoordinates = [
  { head: "a".repeat(40), tree: "b".repeat(40) },
  { head: "c".repeat(40), tree: "f".repeat(40) },
  { head: "0".repeat(40), tree: "9".repeat(40) },
];

export function linkedSuffixFixture(memberCount: 4 | 5 = 4) {
  const suffixPlan = memberCount === 4
    ? deliveryFourMemberStackPlanFixture()
    : deliveryFiveMemberStackPlanFixture();
  const initial = deliveryStateFixture(suffixPlan);
  const bound = {
    ...initial,
    members: initial.members.map((member, index) => ({
      ...member,
      coordinates: member.coordinates === null ? null : {
        ...member.coordinates,
        base: index === 0
          ? initial.target!.coordinates!.head
          : initial.members[index - 1]!.coordinates!.head,
      },
      changeRequest: { providerId: "github", changeRequestId: String(41 + index) },
    })),
  };
  const first = bound.members[0]!;
  const beforeSnapshot = { target: bound.target, members: [first] };
  const reserved = reserveDeliveryOperation({ revision: 1, value: bound }, suffixPlan, {
    operationId: "operation-1",
    kind: "land",
    mode: "native",
    nativeArm: "linked-single",
    affectedDeliverableIds: [first.deliverableId],
    expectedStateRevision: 1,
    before: beforeSnapshot,
    requested: beforeSnapshot,
    effect: {
      providerId: "github",
      repository: "o/r",
      changeRequestId: "41",
      headSha: first.coordinates!.head,
      baseRef: "delivery-target",
      targetRef: "refs/heads/delivery-target",
      strategy: "merge", mergePolicy: mergePolicy("o/r"),
    },
  });
  if (reserved.status !== "reserved") throw new Error("fixture reservation failed");
  const submitted = beginNativeDeliverySubmission({ revision: 2, value: reserved.state }, "operation-1");
  if (submitted.status !== "begun") throw new Error("fixture submission transition failed");
  const newTarget = { head: "d".repeat(40), tree: "e".repeat(40) };
  const landed = {
    ...bound,
    target: { ref: "refs/heads/delivery-target", coordinates: newTarget },
    members: bound.members.map((member, index) => index === 0 ? ({
      ...member,
      coordinates: { base: member.coordinates!.base, head: newTarget.head, tree: newTarget.tree },
    }) : member),
    activeOperation: null,
  };
  const movedByRef = new Map(bound.members.slice(1, -1).map((member, position) => [
    member.ref!,
    movedSuffixCoordinates[position]!,
  ]));
  return {
    bound,
    newTarget,
    movedByRef,
    reconcileInput: {
      plan: suffixPlan,
      before: { revision: 3, value: submitted.state },
      landed: { revision: 3, value: landed },
      repository: "o/r",
      protectedTargetRef: "refs/heads/delivery-target",
    },
    observeRequest: async (binding: NonNullable<typeof bound.members[number]["changeRequest"]>) => {
      const index = Number(binding.changeRequestId) - 41;
      const moved = movedByRef.get(`refs/heads/member-${index + 1}`);
      return moved === undefined ? { status: "absent" as const } : {
        status: "observed" as const,
        request: {
          binding,
          repository: "o/r",
          headRepository: "o/r",
          headRef: `member-${index + 1}`,
          headSha: moved.head,
          baseRef: index === 1 ? "delivery-target" : `member-${index}`,
          state: "open" as const,
          draft: false,
        },
      };
    },
    observeRef: async (ref: string) => movedByRef.get(ref) ?? null,
    unreachedSettlement: {
      observeMemberRefCheckouts: async () => ({ status: "observed" as const, checkouts: [] }),
      absorbTop: async () => { throw new Error("rejected suffix reached top absorption"); },
      publishTop: async () => { throw new Error("rejected suffix reached top publication"); },
      rewriteLocalRef: async () => { throw new Error("rejected suffix reached local ref rewrite"); },
      stateStore: {
        publish: async () => { throw new Error("rejected suffix reached state publication"); },
      },
    },
  };
}

export function casStateStore(initialRevision = 3) {
  let revision = initialRevision;
  const writes: Array<{ expectedRevision: number; value: DeliveryStateV1 }> = [];
  return {
    writes,
    stateStore: {
      publish: async (_planId: string, value: DeliveryStateV1, expectedRevision: number) => {
        if (expectedRevision !== revision) {
          return { status: "refused" as const, reason: "version-conflict" as const };
        }
        revision += 1;
        writes.push({ expectedRevision, value });
        return { status: "ok" as const, value: { revision, value } };
      },
    },
  };
}
