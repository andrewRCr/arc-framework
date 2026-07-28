import { describe, expect, it } from "vitest";

import { DecomposeCommandInputSchema } from "../../src/handlers/lifecycle.js";

const origin = "origin";
const receipt = `sha256:${"a".repeat(64)}`;

describe("DecomposeCommandInputSchema", () => {
  it.each([
    { origin, preflight: true },
    { origin, cutMap: "map.json" },
    { origin, finalize: receipt, continuation: "continuation.json" },
    { origin, discard: "map.json" },
    { origin, handoff: true },
  ])("accepts one complete closed mode: %o", (input) => {
    expect(DecomposeCommandInputSchema.safeParse(input).success).toBe(true);
  });

  it.each([
    { origin },
    { origin, preflight: true, cutMap: "map.json" },
    { origin, finalize: receipt },
    { origin, continuation: "continuation.json" },
    { origin, finalize: receipt, continuation: "continuation.json", handoff: true },
    { origin, preflight: false },
    { origin, handoff: false },
    { origin, cutMap: "" },
  ])("refuses partial, conflicting, empty, or false mode evidence: %o", (input) => {
    expect(DecomposeCommandInputSchema.safeParse(input).success).toBe(false);
  });
});
