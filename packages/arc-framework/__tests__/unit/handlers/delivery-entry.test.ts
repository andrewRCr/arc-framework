import { describe, expect, it, vi } from "vitest";

import {
  handleDeliveryEntryInspect,
  type DeliveryEntryInspectHandlerDependencies,
} from "../../../src/handlers/delivery-entry.js";

function dependencies(result: unknown): DeliveryEntryInspectHandlerDependencies {
  return {
    readText: vi.fn().mockResolvedValue(JSON.stringify({
      boundaryDisposition: "delivery-candidate",
      provisionalDisposition: "not-applicable",
    })),
    inspect: vi.fn().mockResolvedValue(result),
    write: vi.fn(),
    setExitCode: vi.fn(),
  };
}

describe("delivery entry handler", () => {
  it.each([
    { status: "not-applicable", nextAction: "continue-work-unit", recommendedActionText: "Continue." },
    {
      status: "authoring-required", nextAction: "attend-authoring", laterEntryCostText: "Cost.",
      recommendedActionText: "Author.",
    },
    {
      status: "canonicalize-provisional", nextAction: "canonicalize-provisional", authoringMapId: null,
      laterEntryCostText: "Cost.", recommendedActionText: "Canonicalize.",
    },
    {
      status: "validate-canonical", nextAction: "validate-eligibility",
      planId: "123e4567-e89b-42d3-a456-426614174000", planRevision: 1,
      planDigest: `sha256:${"a".repeat(64)}`, recommendedActionText: "Validate.",
    },
    {
      status: "resume-bound", nextAction: "read-position-and-reconcile",
      planId: "123e4567-e89b-42d3-a456-426614174000", stateRevision: 2,
      recommendedActionText: "Resume.",
    },
    {
      status: "refused", nextAction: "stop", reason: "evidence-conflict",
      recommendedActionText: "Resolve conflict.",
    },
  ])("preserves the $status route through its strict envelope", async (result) => {
    const deps = dependencies(result);
    await handleDeliveryEntryInspect({ input: "-", json: true }, undefined, deps);

    expect(JSON.parse(vi.mocked(deps.write).mock.calls[0]?.[0] as string)).toEqual({
      schemaVersion: 1,
      command: "delivery entry inspect",
      ...result,
    });
    expect(deps.inspect).toHaveBeenCalledOnce();
    if (result.status === "refused") expect(deps.setExitCode).toHaveBeenCalledWith(1);
    else expect(deps.setExitCode).not.toHaveBeenCalled();
  });

  it("rejects malformed attended input before reading delivery facts", async () => {
    const deps = dependencies({ status: "not-applicable" });
    vi.mocked(deps.readText).mockResolvedValue("{}");
    await handleDeliveryEntryInspect({ input: "-", json: true }, undefined, deps);

    expect(deps.inspect).not.toHaveBeenCalled();
    expect(JSON.parse(vi.mocked(deps.write).mock.calls[0]?.[0] as string)).toMatchObject({
      status: "refused",
      reason: "invalid-command-input",
    });
  });
});
