/** Integration procedure CLI adapter behavior. */

import { describe, expect, it, vi } from "vitest";

import { handleIntegrationCheckpoint } from "../../../src/handlers/integration.js";

describe("integration checkpoint handler", () => {
  it("emits the checkpoint reducer's typed verdict", async () => {
    const write = vi.fn();
    await handleIntegrationCheckpoint("example", { json: true }, undefined, {
      checkpoint: async () => ({
        schemaVersion: 1,
        mode: "integrate-checkpoint",
        workUnit: "example",
        state: "blocked",
        nextAction: "stop",
        reason: "candidate-missing",
        payload: { workUnit: "example" },
      }),
      write,
    });

    expect(JSON.parse(String(write.mock.calls[0]?.[0]))).toMatchObject({
      mode: "integrate-checkpoint",
      workUnit: "example",
      state: "blocked",
      reason: "candidate-missing",
    });
  });
});
