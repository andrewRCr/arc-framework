import { describe, expect, it } from "vitest";

import {
  deriveDeliveryProviderRefreshSubject,
  observeDeliveryProviderRefresh,
} from "../../../src/lib/delivery/provider-refresh-observation.js";
import type { DeliveryPositionFactsV1 } from "../../../src/lib/delivery/position.js";
import { deliveryFourMemberStackPlanFixture } from "../../fixtures/delivery-plan.js";
import { deliveryStateFixture } from "../../fixtures/delivery-state.js";

function positionFacts(
  state: ReturnType<typeof deliveryStateFixture>,
  landedDeliverableIds: DeliveryPositionFactsV1["landedDeliverableIds"] = [],
): DeliveryPositionFactsV1 {
  return { target: state.target, members: state.members, landedDeliverableIds };
}

function subjectFixture() {
  const plan = deliveryFourMemberStackPlanFixture();
  const fixture = deliveryStateFixture(plan);
  const state = {
    ...fixture,
    members: fixture.members.map((member, index) => ({
      ...member,
      changeRequest: { providerId: "github", changeRequestId: String(700 + index) },
    })),
  };
  const result = deriveDeliveryProviderRefreshSubject({ plan, state, facts: positionFacts(state) });
  if (result.status !== "derived") throw new Error("refresh subject must derive");
  return { plan, state, subject: result.subject };
}

describe("delivery provider refresh observation", () => {
  it("derives only the complete bound non-terminal suffix from plan and state", () => {
    const plan = deliveryFourMemberStackPlanFixture();
    const fixture = deliveryStateFixture(plan);
    const state = {
      ...fixture,
      members: fixture.members.map((member, index) => ({
        ...member,
        changeRequest: { providerId: "github", changeRequestId: String(700 + index) },
      })),
    };
    const facts = {
      target: state.target,
      members: state.members,
      landedDeliverableIds: [state.members[0]!.deliverableId],
    };

    expect(deriveDeliveryProviderRefreshSubject({ plan, state, facts })).toMatchObject({
      status: "derived",
      subject: {
        landedPrefix: [plan.members[0]!.deliverableId],
        affectedDeliverableIds: plan.members.slice(1, -1).map(({ deliverableId }) => deliverableId),
      },
    });
  });

  it("observes an append-only target and an exact provider-assigned suffix chain", async () => {
    const { state, subject } = subjectFixture();
    const target = { head: "d".repeat(40), tree: "e".repeat(40) };
    const heads = subject.before.members.map((_member, index) => ({
      head: String(index + 7).repeat(40),
      tree: String(index + 5).repeat(40),
    }));
    const byRef = new Map(subject.before.members.map((member, index) => [member.ref, heads[index]! ]));

    const result = await observeDeliveryProviderRefresh({ subject, repository: "owner/repo" }, {
      observeTarget: async () => ({ status: "observed", coordinates: target }),
      readAncestry: async (ancestor, descendant) => (
        ancestor === state.target!.coordinates!.head && descendant === target.head ? "ancestor" : "not-ancestor"
      ),
      observeRef: async (ref) => byRef.get(ref) ?? null,
      observeRequest: async (_repository, binding) => {
        const index = subject.before.members.findIndex(
          (member) => member.changeRequest?.changeRequestId === binding.changeRequestId,
        );
        const member = subject.before.members[index]!;
        return {
          status: "observed",
          request: {
            binding,
            repository: "owner/repo",
            headRepository: "owner/repo",
            headRef: member.ref!.replace(/^refs\/heads\//u, ""),
            headSha: heads[index]!.head,
            baseRef: index === 0
              ? state.target!.ref.replace(/^refs\/heads\//u, "")
              : subject.before.members[index - 1]!.ref!.replace(/^refs\/heads\//u, ""),
            state: "open",
            draft: true,
          },
        };
      },
    });

    expect(result).toMatchObject({
      status: "observed",
      observation: {
        targetMovement: "append-only",
        snapshot: { target: { coordinates: target } },
      },
    });
  });

  it("refuses a non-append-only protected-target rewrite", async () => {
    const { subject } = subjectFixture();
    const result = await observeDeliveryProviderRefresh({ subject, repository: "owner/repo" }, {
      observeTarget: async () => ({
        status: "observed",
        coordinates: { head: "d".repeat(40), tree: "e".repeat(40) },
      }),
      readAncestry: async () => "not-ancestor",
      observeRef: async () => null,
      observeRequest: async () => ({ status: "absent" }),
    });

    expect(result).toEqual({ status: "refused", reason: "target-rewritten" });
  });
});
