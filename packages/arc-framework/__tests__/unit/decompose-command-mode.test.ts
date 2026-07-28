import { describe, expect, it } from "vitest";

import {
  DecomposeCommandInputSchema,
  normalizeDecomposeCommandInput,
} from "../../src/handlers/lifecycle.js";

const origin = "origin";
const receipt = `sha256:${"a".repeat(64)}`;

describe("DecomposeCommandInputSchema", () => {
  it.each([
    [
      { origin, preflight: true },
      { origin, mode: { kind: "preflight" } },
    ],
    [
      { origin, cutMap: "map.json" },
      { origin, mode: { kind: "execute", cutMap: "map.json" } },
    ],
    [
      { origin, discard: "map.json" },
      { origin, mode: { kind: "discard", cutMap: "map.json" } },
    ],
    [
      { origin, finalize: receipt, continuation: "continuation.json" },
      {
        origin,
        mode: {
          kind: "finalize-with-continuation",
          receiptId: receipt,
          continuation: "continuation.json",
        },
      },
    ],
  ])("accepts and normalizes one complete closed mode: %o", (input, expected) => {
    const parsed = DecomposeCommandInputSchema.safeParse(input);
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(normalizeDecomposeCommandInput(parsed.data)).toEqual(expected);
  });

  it.each([
    { origin },
    { origin, preflight: true, cutMap: "map.json" },
    { origin, finalize: receipt },
    { origin, continuation: "continuation.json" },
    { origin, finalize: receipt, continuation: "continuation.json", handoff: true },
    { origin, preflight: false },
    { origin, cutMap: "" },
    { origin, cutMap: "map.json", discard: "map.json" },
    { origin, preflight: true, discard: "map.json" },
    { origin, discard: "" },
    { origin, handoff: true },
  ])("refuses partial, conflicting, empty, or false mode evidence: %o", (input) => {
    expect(DecomposeCommandInputSchema.safeParse(input).success).toBe(false);
  });
});
