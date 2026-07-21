import { describe, expect, it, vi } from "vitest";

import {
  FRONTLINE_AUTHORIZATION_OFFER,
  prepareFrontlineCarrier,
} from "../../../../../src/scripts/review-gate/policy/frontline-carrier.js";

describe("frontline carrier preparation", () => {
  it("preserves agent authorization without executing during preparation", async () => {
    const execute = vi.fn().mockResolvedValue({ output: "reviewed" });
    const prepareAgent = vi.fn().mockResolvedValue({ status: "needs-authorization" });

    await expect(prepareFrontlineCarrier({
      sourceId: "fresh-agent",
      kind: "agent",
      handle: { capabilityId: "independent-review" },
    }, { prepareAgent, prepareCommand: vi.fn() })).resolves.toEqual({
      status: "needs-authorization",
      sourceId: "fresh-agent",
      offerText: FRONTLINE_AUTHORIZATION_OFFER,
    });
    expect(execute).not.toHaveBeenCalled();
  });

  it("returns a ready agent capability only after its adapter authorizes it", async () => {
    const execute = vi.fn().mockResolvedValue({ output: "reviewed" });
    const result = await prepareFrontlineCarrier({
      sourceId: "fresh-agent",
      kind: "agent",
      handle: { capabilityId: "independent-review" },
    }, {
      prepareAgent: vi.fn().mockResolvedValue({ status: "ready", execute }),
      prepareCommand: vi.fn(),
    });

    expect(result).toMatchObject({ status: "ready", sourceId: "fresh-agent", kind: "agent" });
    expect(result.status === "ready" && result.execute).toBe(execute);
    expect(execute).not.toHaveBeenCalled();
  });

  it("passes direct executable and argv to the command adapter without shell text", async () => {
    const execute = vi.fn().mockResolvedValue({ output: "reviewed" });
    const prepareCommand = vi.fn().mockResolvedValue({ status: "ready", execute });
    const result = await prepareFrontlineCarrier({
      sourceId: "review-cli",
      kind: "command",
      executable: "/usr/bin/reviewer",
      argv: ["--plain", "--scope", "aggregate"],
    }, { prepareAgent: vi.fn(), prepareCommand });

    expect(prepareCommand).toHaveBeenCalledWith({
      executable: "/usr/bin/reviewer",
      argv: ["--plain", "--scope", "aggregate"],
    });
    expect(result).toMatchObject({ status: "ready", sourceId: "review-cli", kind: "command" });
    expect(execute).not.toHaveBeenCalled();
  });

  it.each(["unavailable", "invalid"] as const)("retains a non-ready %s result", async (status) => {
    await expect(prepareFrontlineCarrier({
      sourceId: "review-cli",
      kind: "command",
      executable: "reviewer",
      argv: [],
    }, {
      prepareAgent: vi.fn(),
      prepareCommand: vi.fn().mockResolvedValue({ status, reason: "adapter-refused" }),
    })).resolves.toEqual({ status, sourceId: "review-cli", reason: "adapter-refused" });
  });
});
