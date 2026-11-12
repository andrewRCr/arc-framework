import { describe, expect, it } from "vitest";
import { z } from "zod";

import { createRegistry } from "../../../src/lib/kernel/index.js";

const strict = (id: string) => ({ id, version: 1, migrationPosture: "strict-current" as const });

function sharedRegistries() {
  const shared = z.object({ value: z.string() });
  const alpha = z.object({ first: shared, second: shared });
  const beta = z.object({ nested: shared });
  const forward = createRegistry();
  forward.register(alpha, strict("alpha"));
  forward.register(beta, strict("beta"));
  const reverse = createRegistry();
  reverse.register(beta, strict("beta"));
  reverse.register(alpha, strict("alpha"));
  return { forward, reverse };
}

describe("explicit registry projection", () => {
  it("extracts a reused subschema once under an absolute shared identity", () => {
    const { forward } = sharedRegistries();
    const bundle = forward.toJSONSchema({ io: "output" });
    expect(Object.keys(bundle.schemas)).toEqual(["alpha", "beta", "__shared"]);
    for (const [id, schema] of Object.entries(bundle.schemas)) {
      expect(schema.$id).toBe(`urn:arc:schema:${id}`);
    }
    const definitions = bundle.schemas.__shared?.$defs ?? {};
    expect(Object.values(definitions).filter((value) => JSON.stringify(value).includes('"value"'))).toHaveLength(1);
    const reference = bundle.schemas.alpha?.properties?.first;
    expect(reference).toEqual({ $ref: expect.stringMatching(/^urn:arc:schema:__shared#\/\$defs\//u) });
    expect(bundle.schemas.alpha?.properties?.second).toEqual(reference);
    expect(bundle.schemas.beta?.properties?.nested).toEqual(reference);
  });

  it("leaves defaulted input optional and requires its parsed output", () => {
    const registry = createRegistry();
    registry.register(z.object({ value: z.string().default("default") }), strict("defaulted"));
    expect(registry.toJSONSchema({ io: "input" }).schemas.defaulted?.required ?? []).not.toContain("value");
    expect(registry.toJSONSchema({ io: "output" }).schemas.defaulted?.required).toContain("value");
  });

  it("keeps generated shared names stable across opposite registration orders", () => {
    const { forward, reverse } = sharedRegistries();
    expect(JSON.stringify(reverse.toJSONSchema({ io: "output" })))
      .toBe(JSON.stringify(forward.toJSONSchema({ io: "output" })));
  });
});
