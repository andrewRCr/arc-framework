import { describe, expect, expectTypeOf, it } from "vitest";
import { z } from "zod";

import {
  PrioritySchema,
  SchemaError,
  SlugSchema,
  WorkClassSchema,
  WorkUnitStateSchema,
  createKernelRegistry,
  createRegistry,
  type KernelSchemaMeta,
  type MigrationPosture,
} from "../../../src/lib/kernel/index.js";

const strict = (id: string, version = 1): KernelSchemaMeta => ({
  id,
  version,
  migrationPosture: "strict-current",
});

describe("kernel schema registry", () => {
  it("registers and discovers schemas with immutable off-schema metadata", () => {
    expectTypeOf<MigrationPosture>().toEqualTypeOf<"strict-current" | "backward-compatible">();
    const registry = createRegistry();
    const schema = z.string();
    const source = { id: "example", version: 2, migrationPosture: "backward-compatible" as const };

    expect(registry.register(schema, source)).toBe(schema);
    expect(registry.get("example")).toBe(schema);
    expect(registry.meta("example")).toEqual(source);
    expect(Object.isFrozen(registry.meta("example"))).toBe(true);
    expect(schema.meta()).toBeUndefined();
    source.version = 9;
    expect(registry.meta("example")?.version).toBe(2);
  });

  it.each([
    { id: "", version: 1, migrationPosture: "strict-current" },
    { id: " padded", version: 1, migrationPosture: "strict-current" },
    { id: "internal space", version: 1, migrationPosture: "strict-current" },
    { id: "uri/path", version: 1, migrationPosture: "strict-current" },
    { id: "é", version: 1, migrationPosture: "strict-current" },
    { id: "\ud800", version: 1, migrationPosture: "strict-current" },
    { id: "double--hyphen", version: 1, migrationPosture: "strict-current" },
    { id: "valid", version: 0, migrationPosture: "strict-current" },
    { id: "valid", version: -1, migrationPosture: "strict-current" },
    { id: "valid", version: 1.5, migrationPosture: "strict-current" },
    { id: "valid", version: Number.MAX_SAFE_INTEGER + 1, migrationPosture: "strict-current" },
    { id: "valid", version: 1, migrationPosture: "future" },
  ])("rejects invalid metadata atomically: $id / $version / $migrationPosture", (meta) => {
    const registry = createRegistry();
    let thrown: unknown;
    try {
      registry.register(z.string(), meta as KernelSchemaMeta);
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(SchemaError);
    expect(thrown).toMatchObject({ code: "schema.registry.invalid-metadata" });
    expect(registry.ids()).toEqual([]);
  });

  it("rejects duplicate identities and schema instances before mutation", () => {
    const registry = createRegistry();
    const original = z.string();
    registry.register(original, strict("original"));

    expect(() => registry.register(z.number(), strict("original"))).toThrow();
    expect(() => registry.register(original, strict("renamed"))).toThrow();
    expect(registry.ids()).toEqual(["original"]);
    expect(registry.get("original")).toBe(original);
    expect(registry.get("renamed")).toBeUndefined();
  });

  it("allows distinct derived schemas despite inherited native metadata", () => {
    const registry = createRegistry();
    const base = z.string();
    const derived = base.describe("derived");

    registry.register(base, strict("base"));
    registry.register(derived, strict("derived"));

    expect(registry.ids()).toEqual(["base", "derived"]);
    expect(registry.get("base")).toBe(base);
    expect(registry.get("derived")).toBe(derived);
  });

  it("snapshots getter-backed metadata once before validation and mutation", () => {
    const registry = createRegistry();
    const original = z.string();
    const replacement = z.number();
    registry.register(original, strict("taken"));
    let idReads = 0;
    const shiftingMeta: KernelSchemaMeta = {
      get id() {
        idReads += 1;
        return idReads < 3 ? "new" : "taken";
      },
      version: 1,
      migrationPosture: "strict-current",
    };

    registry.register(replacement, shiftingMeta);

    expect(idReads).toBe(1);
    expect(registry.ids()).toEqual(["new", "taken"]);
    expect(registry.get("new")).toBe(replacement);
    expect(registry.get("taken")).toBe(original);
  });

  it("returns fresh, code-point-sorted identity views", () => {
    const registry = createRegistry();
    registry.register(z.string(), strict("zeta"));
    registry.register(z.string(), strict("alpha-two"));
    registry.register(z.string(), strict("alpha"));

    const first = registry.ids();
    const second = registry.ids();
    expect(first).toEqual(["alpha", "alpha-two", "zeta"]);
    expect(second).toEqual(first);
    expect(second).not.toBe(first);
  });

  it("creates fresh registries containing exactly the kernel vocabulary", () => {
    const first = createKernelRegistry();
    const second = createKernelRegistry();
    expect(first.ids()).toEqual(["priority", "slug", "work-class", "work-unit-state"]);
    expect(first.get("work-unit-state")).toBe(WorkUnitStateSchema);
    expect(first.get("work-class")).toBe(WorkClassSchema);
    expect(first.get("priority")).toBe(PrioritySchema);
    expect(first.get("slug")).toBe(SlugSchema);
    for (const id of first.ids()) expect(first.meta(id)).toEqual(strict(id));
    first.register(z.boolean(), strict("extension"));
    expect(second.get("extension")).toBeUndefined();
  });

  it("projects stable default and custom schema identities without metadata leakage", () => {
    const registry = createKernelRegistry();
    const defaults = registry.toJSONSchema();
    const custom = registry.toJSONSchema({ uri: (id) => `urn:arc:${id}` });

    expect(Object.keys(defaults.schemas)).toEqual(["priority", "slug", "work-class", "work-unit-state"]);
    expect(defaults.schemas.slug?.$id).toBe("slug.schema.json");
    expect(custom.schemas.slug?.$id).toBe("urn:arc:slug");
    expect(JSON.stringify(defaults)).not.toMatch(/migrationPosture|version/u);
    expect(JSON.stringify(defaults)).not.toContain("$ref");
  });

  it("emits external references for registered schema composition", () => {
    const registry = createRegistry();
    const child = z.object({ value: z.string() });
    const parent = z.object({ child });
    registry.register(child, strict("child"));
    registry.register(parent, strict("parent"));

    const bundle = registry.toJSONSchema();
    expect(bundle.schemas.parent?.properties?.child).toEqual({ $ref: "child.schema.json" });
  });

  it("projects byte-identical bundles regardless of registration order", () => {
    const one = z.object({ value: z.string() });
    const two = z.object({ count: z.number() });
    const forward = createRegistry();
    forward.register(one, strict("one"));
    forward.register(two, strict("two"));
    const reverse = createRegistry();
    reverse.register(two, strict("two"));
    reverse.register(one, strict("one"));

    expect(JSON.stringify(reverse.toJSONSchema())).toBe(JSON.stringify(forward.toJSONSchema()));
  });
});
