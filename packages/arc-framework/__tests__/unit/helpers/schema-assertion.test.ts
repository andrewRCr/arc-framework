import { describe, expect, it } from "vitest";
import { z } from "zod";

import { assertSchemaAccepts, assertSchemaRefuses } from "../../helpers/schema-assertion.js";
import { createKernelRegistry } from "../../../src/lib/kernel/schema/registry.js";

describe("schema assertions", () => {
  it("returns parsed output for an accepted value", () => {
    expect(assertSchemaAccepts(z.string().trim(), " ready ")).toBe("ready");
  });

  it("reports every issue path and message when acceptance fails", () => {
    const schema = z.strictObject({
      id: z.string().min(3, "must have 3 chars"),
      count: z.number(),
    });
    expect(() => assertSchemaAccepts(schema, { id: "x", count: "two" }))
      .toThrow(/id.*must have 3 chars[\s\S]*count.*expected number/i);
  });

  it("passes for a refused value", () => {
    expect(() => assertSchemaRefuses(z.number(), "not a number")).not.toThrow();
    expect(() => assertSchemaRefuses(
      z.strictObject({ count: z.number() }), { count: "wrong" }, ["count"],
    )).not.toThrow();
  });

  it("shows parsed output when refusal unexpectedly succeeds", () => {
    const schema = z.strictObject({ id: z.string().trim() });
    expect(() => assertSchemaRefuses(schema, { id: " okay " }))
      .toThrow(/\{"id":"okay"\}/);
  });

  it("reports the actual issue path when an expected path is absent", () => {
    const schema = z.strictObject({ count: z.number() });
    expect(() => assertSchemaRefuses(schema, { count: "wrong" }, ["id"]))
      .toThrow(/expected issue at id.*count/i);
  });

  it("accepts and refuses through a registered schema", () => {
    const schema = createKernelRegistry().get("work-unit-state");
    expect(schema).toBeDefined();
    expect(assertSchemaAccepts(schema!, "Active")).toBe("Active");
    expect(() => assertSchemaRefuses(schema!, "Paused")).not.toThrow();
  });
});
