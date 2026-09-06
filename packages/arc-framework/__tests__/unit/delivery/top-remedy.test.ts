import { describe, expect, it, vi } from "vitest";

import {
  applyDeliveryTopRemedy,
  classifyDeliveryTopRemedyObservation,
} from "../../../src/lib/delivery/top-remedy.js";
import { deliveryStackPlanFixture } from "../../fixtures/delivery-plan.js";
import { deliveryStateFixture } from "../../fixtures/delivery-state.js";

function fixture(state: "open" | "closed" = "open") {
  const plan = deliveryStackPlanFixture();
  const initial = deliveryStateFixture(plan);
  const members = initial.members.map((member, index) => ({
    ...member,
    changeRequest: { providerId: "github", changeRequestId: String(401 + index) },
  }));
  const deliveryState = { ...initial, target: { ...initial.target!, ref: "refs/heads/main" }, members };
  const terminal = members.at(-1)!;
  const request = {
    binding: terminal.changeRequest!,
    repository: "owner/repo",
    headRepository: "owner/repo",
    headRef: terminal.ref!.replace("refs/heads/", ""),
    headSha: terminal.coordinates!.head,
    baseRef: "member-1",
    state,
    draft: true,
  };
  const facts = {
    target: deliveryState.target,
    members: deliveryState.members,
    landedDeliverableIds: [members[0]!.deliverableId],
  };
  return { plan, state: deliveryState, terminal, request, facts };
}

describe("delivery top remedy", () => {
  it("settles an applied reopen when the host refreshes the request to the published terminal head", () => {
    const { state, request } = fixture("closed");
    const terminal = state.members.at(-1)!;
    const snapshot = { target: state.target, members: [terminal] };
    expect(classifyDeliveryTopRemedyObservation({
      providerId: "github",
      repository: "owner/repo",
      changeRequestId: terminal.changeRequest!.changeRequestId,
      headRef: terminal.ref!.replace(/^refs\/heads\//u, ""),
      headSha: terminal.coordinates!.head,
      triggerRef: state.members.at(-2)!.ref!,
      triggerHeadSha: state.members.at(-2)!.coordinates!.head,
      fromBaseRef: "member-1",
      protectedBaseRef: "main",
      action: "reopen-and-retarget",
    }, {
      ...request,
      state: "open",
      baseRef: "main",
      headSha: "f".repeat(40),
    }, snapshot)).toEqual({
      outcome: "applied",
      observation: {
        kind: "top-remedy",
        effect: expect.objectContaining({ headSha: terminal.coordinates!.head }),
        outcome: "applied",
        snapshot,
      },
    });
  });

  it("treats a closed request already retargeted to the protected base as retryable", () => {
    const { state, request } = fixture("closed");
    const terminal = state.members.at(-1)!;
    const snapshot = { target: state.target, members: [terminal] };
    expect(classifyDeliveryTopRemedyObservation({
      providerId: "github",
      repository: "owner/repo",
      changeRequestId: terminal.changeRequest!.changeRequestId,
      headRef: terminal.ref!.replace(/^refs\/heads\//u, ""),
      headSha: terminal.coordinates!.head,
      triggerRef: state.members.at(-2)!.ref!,
      triggerHeadSha: state.members.at(-2)!.coordinates!.head,
      fromBaseRef: "member-1",
      protectedBaseRef: "main",
      action: "reopen-and-retarget",
    }, { ...request, baseRef: "main" }, snapshot)).toEqual({ outcome: "not-applied" });
  });

  it("does not retry a not-yet-applied remedy after unexplained head movement", () => {
    const { state, request } = fixture("closed");
    const terminal = state.members.at(-1)!;
    expect(classifyDeliveryTopRemedyObservation({
      providerId: "github",
      repository: "owner/repo",
      changeRequestId: terminal.changeRequest!.changeRequestId,
      headRef: terminal.ref!.replace(/^refs\/heads\//u, ""),
      headSha: terminal.coordinates!.head,
      triggerRef: state.members.at(-2)!.ref!,
      triggerHeadSha: state.members.at(-2)!.coordinates!.head,
      fromBaseRef: "member-1",
      protectedBaseRef: "main",
      action: "reopen-and-retarget",
    }, {
      ...request,
      baseRef: "main",
      headSha: "f".repeat(40),
    }, { target: state.target, members: [terminal] })).toEqual({ outcome: "ambiguous" });
  });

  it.each([
    ["open", "retarget"],
    ["closed", "reopen-and-retarget"],
  ] as const)("reserves before applying the exact %s request remedy and reobserves", async (requestState, action) => {
    const { plan, state, request, facts } = fixture(requestState);
    const events: string[] = [];
    let reads = 0;
    const result = await applyDeliveryTopRemedy({
      plan,
      current: { revision: 7, value: state },
      facts,
      action,
      repository: "owner/repo",
      protectedBaseRef: "main",
      host: {
        readRequest: async () => {
          events.push("read");
          reads += 1;
          return {
            status: "observed" as const,
            request: reads === 1 ? request : { ...request, state: "open" as const, baseRef: "main" },
          };
        },
        applyTopRemedy: async (effect) => {
          events.push("mutate");
          expect(effect).toMatchObject({ action, fromBaseRef: "member-1", protectedBaseRef: "main" });
          return { status: "submitted" as const };
        },
      },
      observeTriggerRef: async () => ({ status: "observed", head: state.members.at(-2)!.coordinates!.head }),
      stateStore: {
        publish: async (_planId, value, revision) => {
          events.push(value.activeOperation === null ? "clear" : "reserve");
          return { status: "ok" as const, value: { revision: revision + 1, value } };
        },
      },
    });
    expect(result).toMatchObject({
      status: "remedied", nextAction: "teardown-member", top: { status: "ready" },
      selectedDeliverableId: state.members.at(-2)!.deliverableId,
      state: { value: { activeOperation: null } },
    });
    expect(events).toEqual(["read", "reserve", "mutate", "read", "clear"]);
  });

  it("clears the remedy while leaving a refreshed terminal head for ordinary rebind", async () => {
    const { plan, state, request, facts } = fixture("closed");
    const publishedHead = "f".repeat(40);
    let reads = 0;
    const result = await applyDeliveryTopRemedy({
      plan,
      current: { revision: 7, value: state },
      facts,
      action: "reopen-and-retarget",
      repository: "owner/repo",
      protectedBaseRef: "main",
      host: {
        readRequest: async () => ({
          status: "observed",
          request: ++reads === 1
            ? request
            : { ...request, state: "open", baseRef: "main", headSha: publishedHead },
        }),
        applyTopRemedy: async () => ({ status: "submitted" }),
      },
      observeTriggerRef: async () => ({ status: "observed", head: state.members.at(-2)!.coordinates!.head }),
      stateStore: {
        publish: async (_planId, value, revision) => ({
          status: "ok", value: { revision: revision + 1, value },
        }),
      },
    });

    expect(result).toMatchObject({
      status: "remedied",
      nextAction: "terminal-checkpoint",
      terminalHeadAction: "rebind-required",
      state: {
        value: {
          activeOperation: null,
          members: expect.arrayContaining([
            expect.objectContaining({
              deliverableId: state.members.at(-1)!.deliverableId,
              coordinates: state.members.at(-1)!.coordinates,
            }),
          ]),
        },
      },
    });
    expect(result).not.toHaveProperty("top");
  });

  it("refuses stale operator intent before reserving or mutating", async () => {
    const { plan, state, request, facts } = fixture("closed");
    const publish = vi.fn();
    const mutate = vi.fn();
    await expect(applyDeliveryTopRemedy({
      plan,
      current: { revision: 7, value: state },
      facts,
      action: "retarget",
      repository: "owner/repo",
      protectedBaseRef: "main",
      host: {
        readRequest: async () => ({ status: "observed", request }),
        applyTopRemedy: mutate,
      },
      observeTriggerRef: async () => ({ status: "absent" }),
      stateStore: { publish },
    })).resolves.toEqual({ status: "refused", reason: "remedy-mismatch" });
    expect(publish).not.toHaveBeenCalled();
    expect(mutate).not.toHaveBeenCalled();
  });

  it("does not accept a caller-selected base that differs from the state-bound target", async () => {
    const { plan, state, request, facts } = fixture();
    const mutate = vi.fn();
    await expect(applyDeliveryTopRemedy({
      plan,
      current: { revision: 7, value: state },
      facts,
      action: "retarget",
      repository: "owner/repo",
      protectedBaseRef: "release",
      host: {
        readRequest: async () => ({ status: "observed", request }),
        applyTopRemedy: mutate,
      },
      observeTriggerRef: async () => ({ status: "absent" }),
      stateStore: { publish: vi.fn() },
    })).resolves.toEqual({ status: "refused", reason: "protected-target-mismatch" });
    expect(mutate).not.toHaveBeenCalled();
  });

  it("refuses before reservation when the restored highest ref is at the wrong head", async () => {
    const { plan, state, request, facts } = fixture();
    const publish = vi.fn();
    const mutate = vi.fn(async () => ({ status: "submitted" as const }));
    const input = Object.assign({
      plan,
      current: { revision: 7, value: state },
      facts,
      action: "retarget" as const,
      repository: "owner/repo",
      protectedBaseRef: "main",
      host: {
        readRequest: async () => ({ status: "observed" as const, request }),
        applyTopRemedy: mutate,
      },
      stateStore: { publish },
    }, {
      observeTriggerRef: async () => ({ status: "observed" as const, head: "f".repeat(40) }),
    });

    await expect(applyDeliveryTopRemedy(input)).resolves.toEqual({
      status: "refused",
      reason: "trigger-ref-mismatch",
    });
    expect(publish).not.toHaveBeenCalled();
    expect(mutate).not.toHaveBeenCalled();
  });

  it("returns exact manual restoration coordinates when the trigger ref is absent", async () => {
    const { plan, state, request, facts } = fixture("closed");
    const trigger = state.members.at(-2)!;
    const publish = vi.fn();
    const mutate = vi.fn(async () => ({ status: "submitted" as const }));
    const result = await applyDeliveryTopRemedy({
      plan,
      current: { revision: 7, value: state },
      facts,
      action: "reopen-and-retarget",
      repository: "owner/repo",
      protectedBaseRef: "main",
      host: {
        readRequest: async () => ({ status: "observed", request }),
        applyTopRemedy: mutate,
      },
      observeTriggerRef: async () => ({ status: "absent" }),
      stateStore: { publish },
    });

    expect(result).toEqual({
      status: "blocked",
      reason: "trigger-ref-restore-required",
      recovery: { ref: trigger.ref, head: trigger.coordinates!.head },
      recommendedActionText:
        `Restore ${trigger.ref} at ${trigger.coordinates!.head}, then rerun the exact terminal remedy.`,
    });
    expect(publish).not.toHaveBeenCalled();
    expect(mutate).not.toHaveBeenCalled();
  });

  it("retains the reservation when the exact trigger ref disappears before mutation", async () => {
    const { plan, state, request, facts } = fixture();
    const trigger = state.members.at(-2)!;
    let observations = 0;
    const mutate = vi.fn(async () => ({ status: "submitted" as const }));
    const result = await applyDeliveryTopRemedy({
      plan,
      current: { revision: 7, value: state },
      facts,
      action: "retarget",
      repository: "owner/repo",
      protectedBaseRef: "main",
      host: {
        readRequest: async () => ({ status: "observed", request }),
        applyTopRemedy: mutate,
      },
      observeTriggerRef: async () => (++observations === 1
        ? { status: "observed", head: trigger.coordinates!.head }
        : { status: "absent" }),
      stateStore: { publish: async (_planId, value, revision) => ({
        status: "ok", value: { revision: revision + 1, value },
      }) },
    });

    expect(result).toMatchObject({
      status: "blocked",
      reason: "trigger-ref-mismatch",
      reservation: { value: { activeOperation: { kind: "top-remedy" } } },
    });
    expect(mutate).not.toHaveBeenCalled();
  });

  it("retains the persisted reservation when mutation or fresh proof is unavailable", async () => {
    const { plan, state, request, facts } = fixture();
    const published: typeof state[] = [];
    const result = await applyDeliveryTopRemedy({
      plan,
      current: { revision: 7, value: state },
      facts,
      action: "retarget",
      repository: "owner/repo",
      protectedBaseRef: "main",
      host: {
        readRequest: async () => ({ status: "observed", request }),
        applyTopRemedy: async () => ({ status: "refused", reason: "unavailable" }),
      },
      observeTriggerRef: async () => ({
        status: "observed", head: state.members.at(-2)!.coordinates!.head,
      }),
      stateStore: {
        publish: async (_planId, value, revision) => {
          published.push(value as typeof state);
          return { status: "ok" as const, value: { revision: revision + 1, value } };
        },
      },
    });
    expect(result).toMatchObject({
      status: "blocked", reason: "mutation-refused",
      reservation: { value: { activeOperation: { kind: "top-remedy" } } },
    });
    expect(published).toHaveLength(1);
  });
});
