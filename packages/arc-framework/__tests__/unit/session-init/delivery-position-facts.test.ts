import { describe, expect, it, vi } from "vitest";

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
});
