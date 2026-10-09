import { describe, expect, it } from "vitest";
import { z } from "zod";

import { createRegistry, type KernelSchemaMeta } from "../../../src/lib/kernel/index.js";
import { createProductionSchemaRegistry } from "../../../src/production-schema-registry.js";

const strict = { version: 1, migrationPosture: "strict-current" as const };

describe("authored schema metadata", () => {
  it.each(["request", "editor-document"] as const)("snapshots the declared %s side", (authored) => {
    const registry = createRegistry();
    let reads = 0;
    registry.register(z.string(), { ...strict, id: "authored", get authored() { reads += 1; return authored; } });
    registry.register(z.number(), { ...strict, id: "ordinary" });
    expect(registry.meta("authored")).toEqual({ ...strict, id: "authored", authored });
    expect(Object.isFrozen(registry.meta("authored"))).toBe(true);
    expect(reads).toBe(1);
    expect(registry.meta("ordinary")).not.toHaveProperty("authored");
  });

  it("refuses an invalid authored side before registration", () => {
    const registry = createRegistry();
    expect(() => registry.register(z.string(), {
      ...strict, id: "invalid", authored: "future",
    } as unknown as KernelSchemaMeta)).toThrow(expect.objectContaining({ code: "schema.registry.invalid-metadata" }));
    expect(registry.ids()).toEqual([]);
  });

  it("marks exactly the seventeen production request roots", () => {
    const registry = createProductionSchemaRegistry();
    const marked = registry.ids().filter((id) => {
      const meta = registry.meta(id);
      return meta?.authored === "request";
    });
    expect(marked).toEqual([
      "decompose-cut-map",
      "delivery-design-inventory-input",
      "review-chunking-resolve-request",
      "review-frontline-resolve-request",
      "review-frontline-run-request",
      "review-hosted-await-request",
      "review-hosted-request-request",
      "review-hosted-settle-request",
      "review-local-attest-request",
      "review-local-prepare-request",
      "review-local-resume-request",
      "review-planning-grooming-resolve-request",
      "review-readiness-request",
      "review-reduce-request",
      "review-resolve-request",
      "review-respond-request",
      "review-terminus-accept-request",
    ]);
    expect(registry.ids().some((id) => {
      const meta = registry.meta(id);
      return meta?.authored === "editor-document";
    })).toBe(false);
  });
});
