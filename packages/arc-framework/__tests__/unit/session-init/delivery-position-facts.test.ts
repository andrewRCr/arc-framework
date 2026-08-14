import { describe, expect, it, vi } from "vitest";

import { reserveDeliveryOperation } from "../../../src/lib/delivery/operation.js";
import type {
  DeliveryOperationSnapshotV1,
  DeliveryStateV1,
} from "../../../src/lib/delivery/schema.js";
import { observeRepositoryDeliveryPosition } from "../../../src/lib/session-init/delivery-position-facts.js";
import { deliveryStackPlanFixture } from "../../fixtures/delivery-plan.js";
import { deliveryStateFixture } from "../../fixtures/delivery-state.js";

function exactDependencies(state: ReturnType<typeof deliveryStateFixture>) {
  if (state.target === null || state.target.coordinates === null) throw new Error("fixture target missing");
  const targetCoordinates = state.target.coordinates;
  const trees = new Map(state.members.flatMap((member) => member.coordinates === null
    ? []
    : [[member.coordinates.head, member.coordinates.tree] as const]));
  const exec = vi.fn(async (
    _command: string,
    args: readonly string[],
    options?: { cwd?: string; objectAccess?: string },
  ) => {
    expect(options).toMatchObject({ cwd: "/repository", objectAccess: "local-only" });
    if (args[0] === "rev-parse" && args[2]?.endsWith("^{commit}")) {
      return { stdout: `${args[2].slice(0, -"^{commit}".length)}\n`, stderr: "" };
    }
    if (args[0] === "rev-list") return { stdout: `${args.at(-1)}\n`, stderr: "" };
    if (args[0] === "rev-parse" && args[1]?.endsWith("^{tree}")) {
      return { stdout: `${trees.get(args[1].slice(0, -"^{tree}".length)) ?? ""}\n`, stderr: "" };
    }
    throw new Error(`unexpected git args: ${args.join(" ")}`);
  });
  const host = {
    observeTarget: vi.fn(async () => ({ status: "observed" as const, coordinates: targetCoordinates })),
    readRequest: vi.fn(),
    observeRequest: vi.fn(),
    openRequest: vi.fn(),
    mergeRequest: vi.fn(),
  };
  return {
    exec,
    cwd: "/repository",
    host,
    repository: "owner/repository",
    remoteHeads: Object.fromEntries(state.members.flatMap((member) => (
      member.ref === null || member.coordinates === null
        ? []
        : [[member.ref.replace(/^refs\/heads\//u, ""), member.coordinates.head]]
    ))),
    localCommits: Object.fromEntries(state.members.flatMap((member) => (
      member.coordinates === null ? [] : [[member.coordinates.head, true]]
    ))),
  };
}

function snapshot(state: DeliveryStateV1): DeliveryOperationSnapshotV1 {
  return { target: state.target, members: [state.members[0]!] };
}

describe("session-init delivery position facts", () => {
  it("reobserves exact target, ref heads, and trees without mutation", async () => {
    const plan = deliveryStackPlanFixture();
    const state = deliveryStateFixture(plan);
    const dependencies = exactDependencies(state);
    const result = await observeRepositoryDeliveryPosition(plan, state, 3, dependencies);
    expect(result).toEqual({
      status: "observed",
      facts: { target: state.target, members: state.members, landedDeliverableIds: [] },
      operationObservation: null,
      projectedState: state,
    });
    expect(dependencies.exec).toHaveBeenCalled();
    expect(dependencies.exec.mock.calls.some(([, args]) => args[0] === "ls-remote")).toBe(false);
  });

  it("fails closed when a remote member head is unavailable", async () => {
    const plan = deliveryStackPlanFixture();
    const state = deliveryStateFixture(plan);
    const dependencies = exactDependencies(state);
    dependencies.remoteHeads = {};
    await expect(observeRepositoryDeliveryPosition(plan, state, 3, dependencies))
      .resolves.toEqual({ status: "refused" });
    expect(dependencies.exec).not.toHaveBeenCalled();
  });

  it("fails closed without inspecting an advertised member object that is not locally available", async () => {
    const plan = deliveryStackPlanFixture();
    const state = deliveryStateFixture(plan);
    const dependencies = exactDependencies(state);
    dependencies.localCommits = {};
    await expect(observeRepositoryDeliveryPosition(plan, state, 3, dependencies))
      .resolves.toEqual({ status: "refused" });
    expect(dependencies.exec).not.toHaveBeenCalled();
  });

  it("recognizes a fully torn-down nonterminal prefix while leaving the terminal unlanded", async () => {
    const plan = deliveryStackPlanFixture();
    const initial = deliveryStateFixture(plan);
    const state = {
      ...initial,
      members: initial.members.map((member) => ({
        deliverableId: member.deliverableId,
        ref: null,
        changeRequest: null,
        coordinates: null,
      })),
    };
    const result = await observeRepositoryDeliveryPosition(plan, state, 4, exactDependencies(state));
    expect(result).toEqual({
      status: "observed",
      facts: {
        target: state.target,
        members: state.members,
        landedDeliverableIds: [plan.members[0]!.deliverableId],
      },
      operationObservation: null,
      projectedState: state,
    });
  });

  it("projects snapshot operations from either the requested or before coordinates", async () => {
    const plan = deliveryStackPlanFixture();
    const state = deliveryStateFixture(plan);
    const before = snapshot(state);
    const requested = {
      target: state.target,
      members: before.members.map((member) => ({
        ...member,
        coordinates: { base: "1".repeat(40), head: "a".repeat(40), tree: "b".repeat(40) },
      })),
    };
    const reserved = reserveDeliveryOperation({ revision: 3, value: state }, plan, {
      operationId: "rewrite-1",
      kind: "rewrite",
      affectedDeliverableIds: [state.members[0]!.deliverableId],
      expectedStateRevision: 3,
      before,
      requested,
    });
    expect(reserved.status).toBe("reserved");
    if (reserved.status !== "reserved") return;

    const requestedState = {
      ...state,
      members: [
        { ...state.members[0]!, coordinates: requested.members[0]!.coordinates },
        ...state.members.slice(1),
      ],
    };
    await expect(observeRepositoryDeliveryPosition(
      plan,
      reserved.state,
      4,
      exactDependencies(requestedState),
    )).resolves.toMatchObject({
      status: "observed",
      operationObservation: requested,
      projectedState: { activeOperation: null, members: requestedState.members },
    });

    await expect(observeRepositoryDeliveryPosition(
      plan,
      reserved.state,
      4,
      exactDependencies(state),
    )).resolves.toMatchObject({
      status: "observed",
      operationObservation: before,
      projectedState: { activeOperation: null, members: state.members },
    });
  });

  it("projects an applied publish, an open landing retry, and a merged landing", async () => {
    const plan = deliveryStackPlanFixture();
    const state = deliveryStateFixture(plan);
    const first = state.members[0]!;
    const before = snapshot(state);
    const effect = {
      providerId: "github" as const,
      repository: "owner/repository",
      headRef: first.ref!.replace(/^refs\/heads\//u, ""),
      headSha: first.coordinates!.head,
      baseRef: "main",
      draft: true,
    };
    const publish = reserveDeliveryOperation({ revision: 3, value: state }, plan, {
      operationId: "publish-1",
      kind: "publish",
      affectedDeliverableIds: [first.deliverableId],
      expectedStateRevision: 3,
      before,
      requested: before,
      effect,
    });
    expect(publish.status).toBe("reserved");
    if (publish.status !== "reserved") return;
    const binding = { providerId: "github", changeRequestId: "401" };
    const publishedState = {
      ...state,
      members: [{ ...first, changeRequest: binding }, ...state.members.slice(1)],
    };
    const publishDeps = exactDependencies(publishedState);
    publishDeps.host.observeRequest.mockResolvedValue({
      status: "observed",
      request: {
        binding,
        repository: "owner/repository",
        headRepository: "owner/repository",
        headRef: effect.headRef,
        headSha: effect.headSha,
        baseRef: "main",
        state: "open",
        draft: true,
      },
    });
    publishDeps.host.readRequest.mockResolvedValue({
      status: "observed",
      request: {
        binding,
        repository: "owner/repository",
        headRepository: "owner/repository",
        headRef: effect.headRef,
        headSha: effect.headSha,
        baseRef: "main",
        state: "open",
        draft: true,
      },
    });
    await expect(observeRepositoryDeliveryPosition(plan, publish.state, 4, publishDeps))
      .resolves.toMatchObject({
        status: "observed",
        operationObservation: { outcome: "applied" },
        projectedState: { activeOperation: null, members: publishedState.members },
      });

    const landBefore = snapshot(publishedState);
    const land = reserveDeliveryOperation({ revision: 5, value: publishedState }, plan, {
      operationId: "land-1",
      kind: "land",
      affectedDeliverableIds: [first.deliverableId],
      expectedStateRevision: 5,
      before: landBefore,
      requested: landBefore,
      effect: {
        providerId: "github",
        repository: "owner/repository",
        changeRequestId: "401",
        headSha: effect.headSha,
        baseRef: "main",
        targetRef: state.target!.ref,
        strategy: "merge",
      },
    });
    expect(land.status).toBe("reserved");
    if (land.status !== "reserved") return;
    const landDeps = exactDependencies(publishedState);
    landDeps.host.readRequest.mockResolvedValue(publishDeps.host.readRequest.mock.results[0]!.value);
    await expect(observeRepositoryDeliveryPosition(plan, land.state, 6, landDeps))
      .resolves.toMatchObject({
        status: "observed",
        operationObservation: { outcome: "not-applied" },
        projectedState: { activeOperation: null },
      });

    const mergedCoordinates = { head: "a".repeat(40), tree: "b".repeat(40) };
    const mergedState = {
      ...publishedState,
      target: { ...publishedState.target!, coordinates: mergedCoordinates },
      members: [{
        ...publishedState.members[0]!,
        coordinates: {
          base: publishedState.members[0]!.coordinates!.base,
          ...mergedCoordinates,
        },
      }, ...publishedState.members.slice(1)],
    };
    const mergedDeps = exactDependencies(mergedState);
    mergedDeps.remoteHeads[effect.headRef] = effect.headSha;
    mergedDeps.localCommits[effect.headSha] = true;
    mergedDeps.host.readRequest.mockResolvedValue({
      status: "observed",
      request: {
        binding,
        repository: "owner/repository",
        headRepository: "owner/repository",
        headRef: effect.headRef,
        headSha: effect.headSha,
        baseRef: "main",
        state: "merged",
        draft: true,
      },
    });
    await expect(observeRepositoryDeliveryPosition(plan, land.state, 6, mergedDeps))
      .resolves.toMatchObject({
        status: "observed",
        operationObservation: { outcome: "applied" },
        projectedState: {
          activeOperation: null,
          target: mergedState.target,
          members: mergedState.members,
        },
      });
  });
});
