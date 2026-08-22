import { describe, expect, it } from "vitest";

import {
  DECOMPOSE_MACHINE_READABLE_KEYS,
  DECOMPOSE_MODE_KEYS,
  DecomposeCommandInputSchema,
  isDecomposeMachineReadableInvocation,
} from "../../src/handlers/lifecycle.js";

const origin = "origin";
describe("DecomposeCommandInputSchema", () => {
  it("accepts the complete read-only preflight mode", () => {
    expect(DecomposeCommandInputSchema.safeParse({ origin, preflight: true }).success).toBe(true);
  });

  it.each([
    { origin, execute: "map.json" },
    { origin, extract: "map.json" },
    { origin, finish: "map.json" },
    { origin, finish: "map.json", apply: true },
    { origin, advanceBase: "map.json" },
  ])("accepts a complete repository command mode: %o", (input) => {
    expect(DecomposeCommandInputSchema.safeParse(input).success).toBe(true);
  });

  it.each([
    { origin },
    { origin, preflight: true, advanceBase: "map.json" },
    { origin, execute: "map.json", extract: "map.json" },
    { origin, extract: "map.json", finish: "map.json" },
    { origin, apply: true },
    { origin, execute: "map.json", apply: true },
    { origin, preflight: true, cutMap: "map.json" },
    { origin, cutMap: "map.json" },
    { origin, finalize: `sha256:${"a".repeat(64)}` },
    { origin, continuation: "continuation.json" },
    { origin, handoff: true },
    {
      origin,
      finalize: `sha256:${"a".repeat(64)}`,
      continuation: "continuation.json",
      handoff: true,
    },
    { origin, preflight: false },
    { origin, cutMap: "" },
  ])("refuses partial, conflicting, empty, or false mode evidence: %o", (input) => {
    expect(DecomposeCommandInputSchema.safeParse(input).success).toBe(false);
  });

  it("derives exclusivity and machine-readable routing from one mode declaration", () => {
    expect(DECOMPOSE_MODE_KEYS).toEqual([
      "preflight",
      "execute",
      "extract",
      "finish",
      "advanceBase",
    ]);
    expect(DECOMPOSE_MACHINE_READABLE_KEYS).toEqual([...DECOMPOSE_MODE_KEYS, "apply"]);
    for (const key of DECOMPOSE_MODE_KEYS) {
      const value = key === "preflight" ? true : "operand";
      expect(isDecomposeMachineReadableInvocation({ [key]: value })).toBe(true);
    }
    expect(isDecomposeMachineReadableInvocation(
      { continuation: "continuation.json" } as unknown as Parameters<
        typeof isDecomposeMachineReadableInvocation
      >[0],
    )).toBe(false);
    expect(isDecomposeMachineReadableInvocation({})).toBe(false);
  });
});
