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

  it("accepts the complete read-only landed-handoff mode", () => {
    expect(DecomposeCommandInputSchema.safeParse({ origin, handoff: true }).success).toBe(true);
  });

  it.each([
    { origin, execute: "map.json" },
    { origin, discard: "map.json" },
    {
      origin,
      finalize: `sha256:${"a".repeat(64)}`,
      continuation: "continuation.json",
    },
    { origin, advanceBase: `sha256:${"b".repeat(64)}` },
  ])("accepts a complete repository command mode: %o", (input) => {
    expect(DecomposeCommandInputSchema.safeParse(input).success).toBe(true);
  });

  it.each([
    { origin },
    { origin, preflight: true, handoff: true },
    { origin, preflight: true, advanceBase: `sha256:${"b".repeat(64)}` },
    { origin, preflight: true, cutMap: "map.json" },
    { origin, cutMap: "map.json" },
    { origin, finalize: `sha256:${"a".repeat(64)}` },
    { origin, continuation: "continuation.json" },
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
      "handoff",
      "execute",
      "discard",
      "finalize",
      "advanceBase",
    ]);
    expect(DECOMPOSE_MACHINE_READABLE_KEYS).toEqual([
      ...DECOMPOSE_MODE_KEYS,
      "continuation",
    ]);
    for (const key of DECOMPOSE_MODE_KEYS) {
      const value = key === "preflight" || key === "handoff" ? true : "operand";
      expect(isDecomposeMachineReadableInvocation({ [key]: value })).toBe(true);
    }
    expect(isDecomposeMachineReadableInvocation({ continuation: "continuation.json" })).toBe(true);
    expect(isDecomposeMachineReadableInvocation({})).toBe(false);
  });
});
