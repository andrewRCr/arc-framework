/** Portable runner eligibility and explicit child-input declarations. */
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { CheckDeclarationSchema } from "../../../../src/lib/checks/declaration.js";
import { GIT_REPOSITORY_LOCAL_ENVIRONMENT } from "../../../../src/lib/git/process-executor.js";

function parse(fields: Record<string, unknown> = {}) {
  return CheckDeclarationSchema.parse({ checks: { verify: { command: ["verify"], ...fields } } }).checks.verify;
}

describe("runner and environment declarations", () => {
  it.each(["project", "files", "selection"])("resolves conservative %s defaults and round trips supported bindings", mode => {
    expect(parse({ mode })).toMatchObject({ runner: false, environment_inputs: {} });
    const declaration = { checks: { verify: { command: ["verify"], mode,
      runner: mode !== "selection", environment_inputs: { CHECK_MODE: "value", CHECK_WEIGHTS_FILE: "file" } } } };
    const decoded = CheckDeclarationSchema.parse(declaration);
    expect(decoded).toMatchObject(declaration);
    expect(CheckDeclarationSchema.parse(z.encode(CheckDeclarationSchema, decoded))).toEqual(decoded);
  });

  it.each([{ fixes: true }, { reads_index: true }, { mode: "selection" }])("refuses owning-checkout runner opt-ins and accepts repaired retry: %j", fields => {
    const authored = { checks: { verify: { command: ["verify"], runner: true, ...fields } } };
    const result = CheckDeclarationSchema.safeParse(authored);
    expect(result.success).toBe(false);
    if (result.success) throw new Error("Expected runner refusal");
    expect(result.error.message).toMatch(/runner.*(?:remove|Remove).*retry/su);
    expect(parse({ ...fields, runner: false })).toMatchObject({ runner: false });
  });

  it.each([...GIT_REPOSITORY_LOCAL_ENVIRONMENT, "ARC_CHECK_BASE", "ARC_CHECK_TREE", "ARC_CHECK_MERGED", "ARC_CHECK_NOTICE"]
    .flatMap(name => [name, name.toLowerCase(), name.replace(/[A-Z]/gu, (letter, offset: number) => offset % 2 ? letter.toLowerCase() : letter)]))(
    "refuses reserved binding %s and leaves a repaired declaration executable", name => {
      const result = CheckDeclarationSchema.safeParse({ checks: { verify: {
        command: ["verify"], environment_inputs: { CHECK_MODE: "value", [name]: "file" },
      } } });
      expect(result.success).toBe(false);
      if (result.success) throw new Error("Expected reserved binding refusal");
      expect(result.error.message).toContain(name);
      expect(result.error.message).toMatch(/environment_inputs.*remove.*retry/su);
      expect(parse({ environment_inputs: { CHECK_MODE: "value" } })).toMatchObject({ environment_inputs: { CHECK_MODE: "value" } });
    },
  );

  it.each(["", "1MODE", "CHECK-MODE", "CHECK.MODE", "A B", "CHECK\nMODE"])("names invalid input %j with a repair route", name => {
    const result = CheckDeclarationSchema.safeParse({ checks: { verify: {
      command: ["verify"], environment_inputs: { [name]: "value" },
    } } });
    expect(result.success).toBe(false);
    if (result.success) throw new Error("Expected name refusal");
    expect(result.error.message).toMatch(/environment_inputs.*(?:remove|repair).*retry/su);
  });

  it.each(["path", "VALUE", null, 3])("refuses unsupported kind %j with a repair route", kind => {
    const result = CheckDeclarationSchema.safeParse({ checks: { verify: {
      command: ["verify"], environment_inputs: { CHECK_MODE: kind },
    } } });
    expect(result.success).toBe(false);
    if (result.success) throw new Error("Expected kind refusal");
    expect(result.error.message).toMatch(/environment_inputs.*(?:remove|repair).*retry/su);
  });

  it("refuses portable case duplicates and accepts repair in either declaration form", () => {
    for (const mode of ["project", "selection"]) {
      const result = CheckDeclarationSchema.safeParse({ checks: { verify: {
        command: ["verify"], mode, environment_inputs: { CHECK_MODE: "value", check_mode: "file" },
      } } });
      expect(result.success).toBe(false);
      if (result.success) throw new Error("Expected duplicate binding refusal");
      expect(result.error.message).toMatch(/environment_inputs.*duplicate.*remove.*retry/su);
      expect(parse({ mode, environment_inputs: { check_mode: "file" } })).toMatchObject({ environment_inputs: { check_mode: "file" } });
    }
  });

  it("preserves every valid own input name through decode and encode, including prototype-shaped names", () => {
    const inputs: unknown = JSON.parse('{"__proto__":"value","constructor":"file","_9":"value"}');
    const decoded = CheckDeclarationSchema.parse({ checks: { verify: { command: ["verify"], environment_inputs: inputs } } });
    expect(decoded.checks.verify?.environment_inputs).toEqual(inputs);
    expect(z.encode(CheckDeclarationSchema, decoded)).toMatchObject({ checks: { verify: { environment_inputs: inputs } } });
  });

  it("validates prototype-shaped binding values instead of silently dropping their declaration", () => {
    const inputs: unknown = JSON.parse('{"__proto__":"unsupported"}');
    const result = CheckDeclarationSchema.safeParse({ checks: { verify: { command: ["verify"], environment_inputs: inputs } } });
    expect(result.success).toBe(false);
    if (result.success) throw new Error("Expected kind refusal");
    expect(result.error.message).toMatch(/environment_inputs.*repair.*retry/su);
  });
});
