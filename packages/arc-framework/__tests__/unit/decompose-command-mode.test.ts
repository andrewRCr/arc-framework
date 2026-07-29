import { describe, expect, it } from "vitest";

import { DecomposeCommandInputSchema } from "../../src/handlers/lifecycle.js";

const origin = "origin";
describe("DecomposeCommandInputSchema", () => {
  it("accepts the complete read-only preflight mode", () => {
    expect(DecomposeCommandInputSchema.safeParse({ origin, preflight: true }).success).toBe(true);
  });

  it.each([
    { origin },
    { origin, preflight: true, cutMap: "map.json" },
    { origin, cutMap: "map.json" },
    { origin, finalize: `sha256:${"a".repeat(64)}` },
    { origin, continuation: "continuation.json" },
    { origin, discard: "map.json" },
    { origin, handoff: true },
    {
      origin,
      finalize: `sha256:${"a".repeat(64)}`,
      continuation: "continuation.json",
      handoff: true,
    },
    { origin, preflight: false },
    { origin, handoff: false },
    { origin, cutMap: "" },
  ])("refuses partial, conflicting, empty, or false mode evidence: %o", (input) => {
    expect(DecomposeCommandInputSchema.safeParse(input).success).toBe(false);
  });
});
