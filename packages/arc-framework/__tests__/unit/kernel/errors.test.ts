import { describe, expect, expectTypeOf, it } from "vitest";
import { z } from "zod";

import {
  ArcError,
  SchemaError,
  createRegistry,
  toArcError,
  type ArcErrorCode,
  type SchemaErrorCode,
} from "../../../src/lib/kernel/index.js";
import { ArcError as OldArcError, UserFacingError } from "../../../src/lib/errors.js";

const legacyCodes = [
  "GIT_MISSING",
  "MANIFEST_MISSING",
  "MANIFEST_INVALID",
  "MERGE_FAILED",
  "FILE_NOT_FOUND",
  "REGISTRY_FETCH_FAILED",
  "IDENTITY_MISSING",
  "ALREADY_INSTALLED",
  "INIT_IN_PROGRESS",
  "NOT_INSTALLED",
  "NO_ARC_INSTALLATION",
  "NOT_IN_ARC_PROJECT",
  "RECIPE_INVALID",
  "MANIFEST_VERSION_UNSUPPORTED",
  "ROLE_FORBIDDEN",
] as const;

function assertNever(value: never): never {
  throw new Error(`Unexpected schema code: ${String(value)}`);
}

function handleSchemaCode(code: SchemaErrorCode): string {
  switch (code) {
    case "schema.registry.duplicate-identity":
      return "identity";
    case "schema.registry.duplicate-schema":
      return "schema";
    case "schema.registry.invalid-metadata":
      return "metadata";
    default:
      return assertNever(code);
  }
}

describe("kernel error contracts", () => {
  it("accepts every legacy code and lowercase dotted extensions", () => {
    for (const code of legacyCodes) expect(new ArcError("legacy", code).code).toBe(code);
    const namespaced: ArcErrorCode = "schema.registry.invalid-metadata";
    expect(new ArcError("namespaced", namespaced).code).toBe(namespaced);
    expectTypeOf<"schema.registry.invalid-metadata">().toMatchTypeOf<ArcErrorCode>();
    expectTypeOf<"NEW_BARE_CODE">().not.toMatchTypeOf<ArcErrorCode>();
  });

  it("preserves source-compatible construction and native causes", () => {
    const basic = new ArcError("basic", "MERGE_FAILED");
    const cause = new Error("private cause");
    const caused = new ArcError("stable", "domain.failure", { cause });
    expect(basic).toMatchObject({ name: "ArcError", message: "basic", code: "MERGE_FAILED" });
    expect(caused.cause).toBe(cause);
  });

  it("preserves constructor identity through the presentation module", () => {
    expect(OldArcError).toBe(ArcError);
    const userFacing = new UserFacingError({
      code: "MANIFEST_MISSING",
      whatHappened: "missing",
      why: "absent",
      whatToDo: "restore it",
    });
    expect(userFacing).toBeInstanceOf(ArcError);
  });

  it("keeps schema-domain codes exhaustive and locally narrowed", () => {
    const cause = new Error("registry detail");
    const error = new SchemaError("duplicate", "schema.registry.duplicate-identity", { cause });
    expect(error).toBeInstanceOf(ArcError);
    expect(error).toMatchObject({
      name: "SchemaError",
      message: "duplicate",
      code: "schema.registry.duplicate-identity",
    });
    expect(error.cause).toBe(cause);
    expect(handleSchemaCode(error.code)).toBe("identity");
    expectTypeOf(error.code).toEqualTypeOf<SchemaErrorCode>();
    expectTypeOf<"GIT_MISSING">().not.toMatchTypeOf<SchemaErrorCode>();
    expectTypeOf<"git.executor.failed">().not.toMatchTypeOf<SchemaErrorCode>();
  });

  it("routes registry failures through stable schema-domain codes", () => {
    const registry = createRegistry();
    const schema = z.string();
    expect(() => registry.register(schema, {
      id: "bad id", version: 1, migrationPosture: "strict-current",
    })).toThrowError(expect.objectContaining({ code: "schema.registry.invalid-metadata" }));
    registry.register(schema, { id: "valid", version: 1, migrationPosture: "strict-current" });
    expect(() => registry.register(z.number(), {
      id: "valid", version: 1, migrationPosture: "strict-current",
    })).toThrowError(expect.objectContaining({ code: "schema.registry.duplicate-identity" }));
    expect(() => registry.register(schema, {
      id: "other", version: 1, migrationPosture: "strict-current",
    })).toThrowError(expect.objectContaining({ code: "schema.registry.duplicate-schema" }));
  });

  it("adapts unknown failures without leaking non-Error values", () => {
    const existing = new ArcError("existing", "MERGE_FAILED");
    expect(toArcError(existing, { code: "boundary.failure", message: "fallback" })).toBe(existing);

    const cause = new Error("private detail");
    const caused = toArcError(cause, { code: "boundary.failure", message: "stable fallback" });
    expect(caused).toMatchObject({ code: "boundary.failure", message: "stable fallback" });
    expect(caused.cause).toBe(cause);

    for (const value of ["secret", { secret: true }, null, undefined]) {
      const fallback = toArcError(value, { code: "boundary.failure", message: "stable fallback" });
      expect(fallback).toMatchObject({ code: "boundary.failure", message: "stable fallback" });
      expect(fallback.cause).toBeUndefined();
      expect(fallback).not.toHaveProperty("secret");
    }
  });
});
