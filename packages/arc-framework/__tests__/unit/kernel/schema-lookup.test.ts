import { describe, expect, it } from "vitest";
import { z } from "zod";

import { createKernelRegistry, SlugSchema } from "../../../src/lib/kernel/index.js";
import { lookupKernelSchema } from "../../../src/lib/kernel/schema/generate.js";

describe("kernel schema lookup", () => {
  it("returns registration metadata and the authored self-contained document", () => {
    const registry = createKernelRegistry();
    const meta = { id: "request", version: 4, migrationPosture: "strict-current", authored: "request" } as const;
    registry.register(z.strictObject({ name: SlugSchema, title: z.string().default("title") }), meta);
    const result = lookupKernelSchema(registry, "request");
    expect(result.status).toBe("found");
    if (result.status !== "found") throw new Error("Expected a known contract");
    expect(result.meta).toEqual(meta);
    expect(result.schema.$id).toBe("urn:arc:schema:request");
    expect(result.schema.required).toEqual(["name"]);
    expect(result.schema.properties?.name).toEqual({ $ref: "#/$defs/slug" });
    expect(result.schema.$defs?.slug).toMatchObject({ type: "string" });
  });

  it("returns unknown without projecting an unrelated unrepresentable root", () => {
    const registry = createKernelRegistry();
    registry.register(z.custom(), { id: "opaque", version: 1, migrationPosture: "strict-current" });
    expect(lookupKernelSchema(registry, "missing")).toEqual({ status: "unknown" });
  });
});
