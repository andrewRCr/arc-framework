import { describe, expect, it, vi } from "vitest";

import {
  degradePlannedDeliveryNativeStack,
  degradeNativeDeliveryStack,
  deriveDeliveryNativeRegistrationInput,
  linkDeliveryNativeStack,
  linkPlannedDeliveryNativeStack,
  observeDeliveryNativeStack,
} from "../../../src/lib/delivery/native-stack.js";
import {
  deliveryFiveMemberStackPlanFixture,
  deliveryFourMemberStackPlanFixture,
  deliverySingleMemberStackPlanFixture,
  deliveryStackPlanFixture,
  deliveryThreeMemberStackPlanFixture,
} from "../../fixtures/delivery-plan.js";
import { deliveryStateFixture } from "../../fixtures/delivery-state.js";

const members = [
  { deliverableId: `sha256:${"a".repeat(64)}`, changeRequestId: "41", headRef: "delivery/wu/one", headSha: "a".repeat(40), baseRef: "main" },
  { deliverableId: `sha256:${"b".repeat(64)}`, changeRequestId: "42", headRef: "delivery/wu/two", headSha: "b".repeat(40), baseRef: "delivery/wu/one" },
] as const;

describe("native delivery stack", () => {
  it("constructs the full five-member default fixture without an undefined title", () => {
    expect(deliveryFiveMemberStackPlanFixture().members.map(({ title }) => title)).toEqual([
      "First member",
      "Second member",
      "Third member",
      "Fourth member",
      "Fifth member",
    ]);
  });

  it("treats a one-member delivery as explicitly unlinked without provider access", async () => {
    const plan = deliverySingleMemberStackPlanFixture();
    const state = deliveryStateFixture(plan);
    const port = {
      observe: vi.fn(async () => { throw new Error("terminal-only delivery reached provider observation"); }),
      link: vi.fn(async () => { throw new Error("terminal-only delivery reached provider mutation"); }),
      unlink: vi.fn(async () => { throw new Error("terminal-only delivery reached provider mutation"); }),
    };

    expect(deriveDeliveryNativeRegistrationInput({
      plan,
      state,
      repository: "o/r",
      baseRef: state.target!.ref,
    })).toEqual({ status: "refused", reason: "no-registrable-members" });
    await expect(linkPlannedDeliveryNativeStack({
      plan,
      state,
      repository: "o/r",
      baseRef: state.target!.ref,
      members: [],
      optIn: true,
    }, port)).resolves.toMatchObject({ status: "unlinked" });
    await expect(degradePlannedDeliveryNativeStack({
      plan,
      state,
      repository: "o/r",
      members: [],
    }, port)).resolves.toMatchObject({ status: "unlinked" });
    expect(port.observe).not.toHaveBeenCalled();
    expect(port.link).not.toHaveBeenCalled();
    expect(port.unlink).not.toHaveBeenCalled();
  });

  it("derives registration from exactly the planned non-terminal members and excludes the top", () => {
    const plan = deliveryFourMemberStackPlanFixture();
    const fixture = deliveryStateFixture(plan);
    const state = {
      ...fixture,
      members: fixture.members.map((member, index) => ({
        ...member,
        changeRequest: { providerId: "github", changeRequestId: String(41 + index) },
      })),
    };

    const result = deriveDeliveryNativeRegistrationInput({
      plan,
      state,
      repository: "o/r",
      baseRef: state.target!.ref,
    });

    expect(result).toMatchObject({ status: "derived" });
    if (result.status !== "derived") return;
    expect(result.input.members.map(({ deliverableId }) => deliverableId))
      .toEqual(plan.members.slice(0, -1).map(({ deliverableId }) => deliverableId));
    expect(result.input.members).toHaveLength(plan.members.length - 1);
    expect(result.input.members.map(({ baseRef }) => baseRef))
      .toEqual(["delivery-target", "member-1", "member-2"]);
    expect(result.input.members.some(({ deliverableId }) => (
      deliverableId === plan.members.at(-1)?.deliverableId
    ))).toBe(false);
  });

  it("submits only the exact plan-derived registration subject", async () => {
    const plan = deliveryFourMemberStackPlanFixture();
    const fixture = deliveryStateFixture(plan);
    const state = {
      ...fixture,
      members: fixture.members.map((member, index) => ({
        ...member,
        changeRequest: { providerId: "github", changeRequestId: String(41 + index) },
      })),
    };
    const derived = deriveDeliveryNativeRegistrationInput({
      plan,
      state,
      repository: "o/r",
      baseRef: state.target!.ref,
    });
    expect(derived.status).toBe("derived");
    if (derived.status !== "derived") return;
    let observationCount = 0;
    const exactSubject = JSON.stringify(derived.input);
    const port = {
      observe: async (input: typeof derived.input) => {
        if (JSON.stringify(input) !== exactSubject) return { status: "malformed" as const };
        observationCount += 1;
        return observationCount === 1
          ? { status: "unregistered" as const }
          : { status: "registered" as const, stackNumber: 9 };
      },
      link: async (input: typeof derived.input) => JSON.stringify(input) === exactSubject
        ? { status: "submitted" as const }
        : { status: "refused" as const, reason: "malformed" as const },
    };

    await expect(linkPlannedDeliveryNativeStack({
      plan,
      state,
      repository: "o/r",
      baseRef: state.target!.ref,
      members: derived.input.members,
      optIn: true,
    }, port)).resolves.toMatchObject({ status: "linked", stackNumber: 9 });

    const topState = state.members.at(-1);
    const topPlan = plan.members.at(-1);
    expect(topState?.changeRequest).not.toBeNull();
    expect(topState?.coordinates).not.toBeNull();
    expect(topState?.ref).not.toBeNull();
    expect(topPlan).toBeDefined();
    if (topState === undefined || topState.changeRequest === null || topState.coordinates === null
      || topState.ref === null || topPlan === undefined) return;
    await expect(linkPlannedDeliveryNativeStack({
      plan,
      state,
      repository: "o/r",
      baseRef: state.target!.ref,
      members: [...derived.input.members, {
        deliverableId: topPlan.deliverableId,
        changeRequestId: topState.changeRequest.changeRequestId,
        headRef: topState.ref.replace(/^refs\/heads\//u, ""),
        headSha: topState.coordinates.head,
        baseRef: derived.input.members.at(-1)?.headRef ?? "",
        headRepository: "o/r",
      }],
      optIn: true,
    }, {
      observe: async () => { throw new Error("terminal registration reached the provider"); },
      link: async () => { throw new Error("terminal registration reached the provider"); },
    })).resolves.toMatchObject({
      status: "refused",
      reason: "registration-scope-mismatch",
    });
  });

  it("validates an opt-in-free subject before resolving the registration choice", async () => {
    const bindRequests = (plan: ReturnType<typeof deliveryStackPlanFixture>) => {
      const fixture = deliveryStateFixture(plan);
      return {
        ...fixture,
        members: fixture.members.map((member, index) => ({
          ...member,
          changeRequest: { providerId: "github", changeRequestId: String(41 + index) },
        })),
      };
    };
    const singletonPlan = deliveryStackPlanFixture();
    const singletonState = bindRequests(singletonPlan);
    const singleton = deriveDeliveryNativeRegistrationInput({
      plan: singletonPlan,
      state: singletonState,
      repository: "o/r",
      baseRef: singletonState.target!.ref,
    });
    if (singleton.status !== "derived") throw new Error("singleton registration subject must derive");
    const eligiblePlan = deliveryThreeMemberStackPlanFixture();
    const eligibleState = bindRequests(eligiblePlan);
    const eligible = deriveDeliveryNativeRegistrationInput({
      plan: eligiblePlan,
      state: eligibleState,
      repository: "o/r",
      baseRef: eligibleState.target!.ref,
    });
    if (eligible.status !== "derived") throw new Error("eligible registration subject must derive");
    const port = {
      observe: vi.fn(async () => { throw new Error("choice resolution reached provider observation"); }),
      link: vi.fn(async () => { throw new Error("choice resolution reached provider mutation"); }),
    };

    await expect(linkPlannedDeliveryNativeStack({
      plan: singletonPlan,
      state: singletonState,
      repository: "o/r",
      baseRef: singletonState.target!.ref,
      members: singleton.input.members,
    }, port)).resolves.toEqual({
      status: "unlinked",
      recommendedActionText:
        "Native registration needs at least two non-terminal members; continue through the unlinked executor.",
    });
    await expect(linkPlannedDeliveryNativeStack({
      plan: eligiblePlan,
      state: eligibleState,
      repository: "o/r",
      baseRef: eligibleState.target!.ref,
      members: singleton.input.members,
    }, port)).resolves.toMatchObject({ status: "refused", reason: "registration-scope-mismatch" });
    await expect(linkPlannedDeliveryNativeStack({
      plan: eligiblePlan,
      state: eligibleState,
      repository: "o/r",
      baseRef: eligibleState.target!.ref,
      members: eligible.input.members,
    }, port)).resolves.toMatchObject({ status: "decision-required" });
    expect(port.observe).not.toHaveBeenCalled();
    expect(port.link).not.toHaveBeenCalled();
  });

  it("refuses a caller-selected registration base before provider access", async () => {
    const plan = deliveryFourMemberStackPlanFixture();
    const fixture = deliveryStateFixture(plan);
    const state = {
      ...fixture,
      members: fixture.members.map((member, index) => ({
        ...member,
        changeRequest: { providerId: "github", changeRequestId: String(41 + index) },
      })),
    };
    const derived = deriveDeliveryNativeRegistrationInput({
      plan,
      state,
      repository: "o/r",
      baseRef: state.target!.ref,
    });
    if (derived.status !== "derived") throw new Error("fixture registration subject must derive");

    await expect(linkPlannedDeliveryNativeStack({
      plan,
      state,
      repository: "o/r",
      baseRef: "refs/heads/main",
      members: derived.input.members,
      optIn: true,
    }, {
      observe: async () => { throw new Error("mismatched target reached provider observation"); },
      link: async () => { throw new Error("mismatched target reached provider mutation"); },
    })).resolves.toMatchObject({ status: "refused", reason: "protected-target-mismatch" });
  });

  it("keeps every observation arm closed and names partial members", async () => {
    const observe = vi.fn().mockResolvedValue({
      status: "partial", affectedDeliverableIds: [members[1].deliverableId],
    });
    await expect(observeDeliveryNativeStack({ repository: "o/r", members }, { observe }))
      .resolves.toEqual({ status: "partial", affectedDeliverableIds: [members[1].deliverableId] });
  });

  it("observes a singleton remainder and degrades an accepted opt-in without host calls", async () => {
    const observe = vi.fn().mockResolvedValue({ status: "unregistered" });
    await expect(observeDeliveryNativeStack({ repository: "o/r", members: [members[0]] }, { observe }))
      .resolves.toEqual({ status: "unregistered" });
    expect(observe).toHaveBeenCalledOnce();

    await expect(linkDeliveryNativeStack({
      repository: "o/r", members: [members[0]], optIn: true,
    }, {
      observe: async () => { throw new Error("singleton registration reached the provider"); },
      link: async () => { throw new Error("singleton registration reached the provider"); },
    })).resolves.toMatchObject({ status: "unlinked" });
    await expect(linkDeliveryNativeStack({
      repository: "o/r", members: [members[0]], optIn: false,
    }, {
      observe: async () => { throw new Error("declined singleton reached the provider"); },
      link: async () => { throw new Error("declined singleton reached the provider"); },
    })).resolves.toMatchObject({ status: "unlinked" });
  });

  it("refuses a malformed singleton distinctly from the registration floor", async () => {
    const malformed = [{ ...members[0], changeRequestId: "" }];
    const port = {
      observe: async () => { throw new Error("malformed singleton reached the provider"); },
      link: async () => { throw new Error("malformed singleton reached the provider"); },
    };

    await expect(linkDeliveryNativeStack({
      repository: "o/r", members: malformed, optIn: true,
    }, port)).resolves.toMatchObject({ status: "refused", reason: "invalid-input" });
    await expect(linkDeliveryNativeStack({
      repository: "o/r", members: malformed, optIn: false,
    }, port)).resolves.toMatchObject({ status: "refused", reason: "invalid-input" });
  });

  it("refuses cross-repository and non-chain input before the host", async () => {
    const observe = vi.fn();
    await expect(observeDeliveryNativeStack({
      repository: "o/r", members: [{ ...members[0], headRepository: "fork/r" }, members[1]],
    }, { observe })).resolves.toEqual({ status: "refused", reason: "foreign-repository" });
    await expect(observeDeliveryNativeStack({
      repository: "o/r", members: [members[1], members[0]],
    }, { observe })).resolves.toEqual({ status: "refused", reason: "non-chain" });
    expect(observe).not.toHaveBeenCalled();
  });

  it("links only on opt-in and reobserves the exact chain without state writes", async () => {
    const observe = vi.fn()
      .mockResolvedValueOnce({ status: "unregistered" })
      .mockResolvedValueOnce({ status: "registered", stackNumber: 7 });
    const link = vi.fn().mockResolvedValue({ status: "submitted" });
    await expect(linkDeliveryNativeStack({ repository: "o/r", members, optIn: true }, { observe, link }))
      .resolves.toEqual({ status: "linked", stackNumber: 7, recommendedActionText: expect.any(String) });
    expect(link).toHaveBeenCalledOnce();

    observe.mockReset();
    link.mockReset();
    await expect(linkDeliveryNativeStack({ repository: "o/r", members, optIn: false }, { observe, link }))
      .resolves.toEqual({ status: "unlinked", recommendedActionText: expect.any(String) });
    expect(observe).not.toHaveBeenCalled();
    expect(link).not.toHaveBeenCalled();
  });

  it("returns an explicit downgrade when linking cannot be authoritatively confirmed", async () => {
    const observe = vi.fn()
      .mockResolvedValueOnce({ status: "unregistered" })
      .mockResolvedValueOnce({ status: "partial", affectedDeliverableIds: [members[0].deliverableId] });
    const link = vi.fn().mockResolvedValue({ status: "submitted" });
    await expect(linkDeliveryNativeStack({ repository: "o/r", members, optIn: true }, { observe, link }))
      .resolves.toMatchObject({ status: "downgrade-required", reason: "partial" });
  });

  it("converges successful unlink and already-unlinked observations through a fresh read", async () => {
    const observe = vi.fn()
      .mockResolvedValueOnce({ status: "registered", stackNumber: 7 })
      .mockResolvedValueOnce({ status: "unregistered" });
    const unlink = vi.fn().mockResolvedValue({ status: "submitted" });
    await expect(degradeNativeDeliveryStack({ repository: "o/r", members }, { observe, unlink }))
      .resolves.toMatchObject({ status: "unlinked" });

    observe.mockReset();
    unlink.mockReset();
    observe.mockResolvedValue({ status: "unregistered" });
    await expect(degradeNativeDeliveryStack({ repository: "o/r", members }, { observe, unlink }))
      .resolves.toMatchObject({ status: "unlinked" });
    expect(unlink).not.toHaveBeenCalled();

    observe.mockReset();
    unlink.mockReset();
    observe.mockResolvedValueOnce({ status: "registered", stackNumber: 7 })
      .mockResolvedValueOnce({ status: "unregistered" });
    unlink.mockResolvedValue({ status: "refused", reason: "unavailable" });
    await expect(degradeNativeDeliveryStack({ repository: "o/r", members }, { observe, unlink }))
      .resolves.toMatchObject({ status: "unlinked" });
  });

  it("blocks every non-unregistered final observation and preserves one explicit unlink remedy", async () => {
    const finalObservations = [
      { status: "registered", stackNumber: 7 },
      { status: "partial", affectedDeliverableIds: [members[0].deliverableId] },
      { status: "incoherent", affectedDeliverableIds: [members[0].deliverableId] },
      { status: "unsupported" },
      { status: "unavailable" },
      { status: "malformed" },
      { status: "ambiguous" },
    ] as const;
    for (const final of finalObservations) {
      const observe = vi.fn()
        .mockResolvedValueOnce({ status: "registered", stackNumber: 7 })
        .mockResolvedValueOnce(final);
      const unlink = vi.fn().mockResolvedValue({ status: "submitted" });
      await expect(degradeNativeDeliveryStack({ repository: "o/r", members }, { observe, unlink }))
        .resolves.toMatchObject({ status: "blocked", reason: final.status });
    }

    const observe = vi.fn()
      .mockResolvedValueOnce({ status: "registered", stackNumber: 7 })
      .mockResolvedValueOnce({ status: "registered", stackNumber: 7 });
    const unlink = vi.fn().mockResolvedValue({ status: "refused", reason: "unavailable" });
    await expect(degradeNativeDeliveryStack({ repository: "o/r", members }, { observe, unlink }))
      .resolves.toEqual({
        status: "blocked",
        reason: "unlink-unavailable",
        recommendedActionText: "Retry unlink when the host is available; do not land while native linkage remains authoritative.",
      });
    expect(observe).toHaveBeenCalledTimes(2);
  });
});
