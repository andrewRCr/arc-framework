/** Runtime, wire encoding, and projected environment records preserve authored data keys. */
import { Ajv2020 } from "ajv/dist/2020.js";
import { expect, it } from "vitest";
import { z } from "zod";
import { EnvironmentInputsSchema } from "../../../../src/lib/checks/environment-declaration.js";
import { CapturedEnvironmentSchema } from "../../../../src/lib/checks/runner/contract.js";
import { createRegistry } from "../../../../src/lib/kernel/index.js";
import { foldKernelSchemaClosure } from "../../../../src/lib/kernel/schema/generate.js";

it.each(["input", "output"] as const)("preserves declaration names through decoding, encoding, and %s projection", io => {
  const valid: unknown = JSON.parse('{"__proto__":"value","constructor":"file","MODE":"value"}');
  const decoded = EnvironmentInputsSchema.parse(valid);
  expect(decoded).toEqual(valid);
  expect(Object.getPrototypeOf(decoded)).toBe(Object.prototype);
  expect(z.encode(EnvironmentInputsSchema, decoded)).toEqual(valid);
  const registry = createRegistry();
  registry.register(z.strictObject({ environment: EnvironmentInputsSchema }), { id: "environment", version: 1, migrationPosture: "strict-current" });
  const projected = new Ajv2020({ strict: true }).compile(foldKernelSchemaClosure(registry.toJSONSchema({ io }), "environment"));
  expect(projected({})).toBe(false);
  for (const [value, accepted] of [[valid, true], [JSON.parse('{"__proto__":"unsupported"}'), false], [{ MODE: 1 }, false], [[], false]] as const) {
    expect(EnvironmentInputsSchema.safeParse(value).success).toBe(accepted);
    expect(projected({ environment: value })).toBe(accepted);
  }
});

it.each(["input", "output"] as const)("preserves captured names through decoding, encoding, and %s projection", io => {
  const valid: unknown = JSON.parse('{"__proto__":{"kind":"value","state":"set","value":"own data"},"MODE":{"kind":"file","state":"unset"}}');
  const decoded = CapturedEnvironmentSchema.parse(valid);
  expect(decoded).toEqual(valid);
  expect(Object.getPrototypeOf(decoded)).toBe(Object.prototype);
  expect(z.encode(CapturedEnvironmentSchema, decoded)).toEqual(valid);
  const registry = createRegistry();
  registry.register(z.strictObject({ environment: CapturedEnvironmentSchema }), { id: "environment", version: 1, migrationPosture: "strict-current" });
  const projected = new Ajv2020({ strict: true }).compile(foldKernelSchemaClosure(registry.toJSONSchema({ io }), "environment"));
  expect(projected({})).toBe(false);
  for (const [value, accepted] of [[valid, true], [JSON.parse('{"__proto__":{"kind":"bad"}}'), false], [{ MODE: { kind: "value", state: "unset", extra: true } }, false], [[], false]] as const) {
    expect(CapturedEnvironmentSchema.safeParse(value).success).toBe(accepted);
    expect(projected({ environment: value })).toBe(accepted);
  }
});
