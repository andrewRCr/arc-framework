/** Unit coverage for the schema-backed status probe wire algebra. */

import { describe, expect, it } from "vitest";
import { z } from "zod";

import { ProbeErrorSchema, probe } from "../../../src/commands/status/types.js";

describe("status probe schemas", () => {
  const ValueSchema = z.strictObject({ name: z.string() });
  const ProbeSchema = probe(ValueSchema);

  it("accepts the success branch without transforming its value", () => {
    const input = { ok: true as const, value: { name: "fixture" } };
    expect(ProbeSchema.parse(input)).toEqual(input);
  });

  it.each(["identity-missing", "runtime"] as const)("accepts the %s error kind", (kind) => {
    const input = { ok: false as const, error: { kind, message: "failed" } };
    expect(ProbeErrorSchema.parse(input.error)).toEqual(input.error);
    expect(ProbeSchema.parse(input)).toEqual(input);
  });

  it.each([
    { ok: true, value: { name: "fixture" }, error: { kind: "runtime", message: "mixed" } },
    { value: { name: "fixture" } },
    { ok: false, error: { kind: "other", message: "open" } },
    { ok: false, error: { kind: "runtime" } },
  ])("rejects malformed or mixed branches", (input) => {
    expect(ProbeSchema.safeParse(input).success).toBe(false);
  });
});
