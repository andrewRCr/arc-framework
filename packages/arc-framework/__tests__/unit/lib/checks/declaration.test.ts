/** Project-authored check fields and their resolved defaults. */
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { CheckDeclarationSchema } from "../../../../src/lib/checks/declaration.js";

const illustrative = {
  global_inputs: ["package-lock.json"], global_runtime_inputs: [["node", "--version"]], commit_fixes: "restage",
  checks: {
    format: { command: ["npx", "prettier", "--write"], gate: "commit", mode: "files",
      inputs: ["**/*.js", "**/*.ts", "**/*.md"], fixes: true },
    lint: { command: ["npx", "eslint"], gate: "commit", mode: "files", inputs: ["src/**/*.ts", "eslint.config.js"] },
    "test-related": { command: ["npx", "vitest", "related", "--run"], gate: "push", mode: "files",
      inputs: ["src/**", "test/**"], shards: { count: 4, argument: "--shard={index}/{count}" } },
  },
};

describe("selection declarations", () => {
  it("resolves feedback defaults while allowing runtime inputs", () => {
    const check = { command: ["lint"], mode: "selection", runtime_inputs: [["node", "--version"]] };
    expect(CheckDeclarationSchema.parse({ checks: { lint: check } }).checks.lint).toMatchObject({
      ...check, cache: false, widen: false, pass_paths: true, shell: false, fixes: false,
      ci_only: false, reads_index: false,
    });
  });
  it.each([
    ["cache", true], ["widen", true], ["pass_paths", false], ["gate", "commit"],
    ["shell", false], ["shell", true], ["ci_only", false], ["ci_only", true],
    ["reads_index", false], ["reads_index", true], ["fixes", false], ["fixes", true],
  ])("refuses declared %s=%j with an actionable field message", (field, value) => {
    const result = CheckDeclarationSchema.safeParse({ checks: { lint: {
      command: ["lint"], mode: "selection", [field]: value,
    } } });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.message).toContain(field);
  });
  it("projects authored restrictions and resolved defaults into JSON Schema", () => {
    const schema = z.toJSONSchema(CheckDeclarationSchema, { io: "input" });
    expect(JSON.stringify(schema)).toContain('"selection"');
    expect(schema).toMatchObject({ properties: { checks: { additionalProperties: { oneOf: expect.arrayContaining([
      expect.objectContaining({ properties: expect.objectContaining({
        mode: expect.objectContaining({ const: "selection" }), cache: { type: "boolean", const: false, default: false },
        shell: { not: {} },
      }) }),
    ]) } } } });
    expect(() => z.toJSONSchema(CheckDeclarationSchema, { io: "output" })).not.toThrow();
  });
});

describe("check declaration fields", () => {
  it.each([
    { check: { command: 7 }, path: ["checks", "verify", "command"], message: "Invalid input" },
    { check: { command: ["lint"], unexpected: true }, path: ["checks", "verify"], message: "unexpected" },
    { check: { command: ["lint"], shards: { count: 2, argument: "{index}", unexpected: true } },
      path: ["checks", "verify", "shards"], message: "unexpected" },
  ])("retains ordinary field diagnostics at $path", ({ check, path, message }) => {
    const result = CheckDeclarationSchema.safeParse({ checks: { verify: check } });
    expect(result.success).toBe(false);
    if (result.success) throw new Error("Expected a declaration refusal");
    expect(result.error.issues).toContainEqual(expect.objectContaining({ path, message: expect.stringContaining(message) }));
  });

  it("accepts typed commands, global inputs, and shard configuration", () => {
    expect(CheckDeclarationSchema.parse(illustrative)).toMatchObject(illustrative);
  });
  it("resolves omitted fields conservatively", () => {
    expect(CheckDeclarationSchema.parse({ checks: { test: { command: ["npm", "test"] } } })).toEqual({
      global_inputs: [], global_runtime_inputs: [], commit_fixes: "restage",
      checks: { test: { command: ["npm", "test"], mode: "project", pass_paths: true, inputs: ["**"], runtime_inputs: [],
        root: ".", widen: true, cache: true, shell: false, fixes: false, ci_only: false, reads_index: false } },
    });
  });
  it.each(["commit", "push", "merge"])("accepts the %s gate and fail-on-fixes policy", (gate) => {
    expect(CheckDeclarationSchema.parse({ commit_fixes: "fail", checks: { test: { command: ["npm", "test"], gate } } }))
      .toMatchObject({ commit_fixes: "fail", checks: { test: { gate } } });
  });
  it.each([
    { checks: {}, commit_fixes: "ignore" },
    { checks: { test: { command: ["npm", "test"], gate: "unknown" } } },
    { checks: {}, unknown: true },
    { checks: { test: { command: ["npm", "test"], unknown: true } } },
    { checks: { test: { command: ["npm", "test"], shards: { count: 4, argument: "{index}", unknown: true } } } },
    { checks: { test: { command: ["npm", "test"], $schema: "urn:test" } } },
  ])("refuses unknown fields or enumerators: %j", (input) => {
    expect(CheckDeclarationSchema.safeParse(input).success).toBe(false);
  });
  it("accepts the exit status a check's command reports when it finds nothing to examine", () => {
    expect(CheckDeclarationSchema.parse({ checks: { test: { command: ["npm", "test"], no_evidence_exit: 5 } } }))
      .toMatchObject({ checks: { test: { no_evidence_exit: 5 } } });
  });
  it.each([0, 256, 1.5, "5"])("refuses %j as a no-evidence exit status", (status) => {
    const check = { command: ["npm", "test"], no_evidence_exit: status };
    expect(CheckDeclarationSchema.safeParse({ checks: { test: check } }).success).toBe(false);
  });
  it("admits an editor schema reference only at the root", () => {
    expect(CheckDeclarationSchema.parse({ $schema: "urn:test", checks: {} })).toMatchObject({ $schema: "urn:test" });
  });
});

describe("check identifiers", () => {
  it.each(["a", "a1-b_c.d:e", "constructor"])("retains the declared id %s", (id) => {
    expect(Object.keys(CheckDeclarationSchema.parse({ checks: { [id]: { command: ["npm", "test"] } } }).checks))
      .toEqual([id]);
  });
  it.each(["1", "a,b", "a b", "a\tb", "A", "-a", "aB"])("refuses id %s at its named field", (id) => {
    const result = CheckDeclarationSchema.safeParse({ checks: { [id]: { command: ["npm", "test"] } } });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues.some((issue) => issue.path.includes(id))).toBe(true);
  });
});

describe("cross-field check rules", () => {
  it.each([
    { check: { command: "echo ready", shell: true, mode: "files" }, field: "mode" },
    { check: { command: ["echo", "ready"], shell: true }, field: "command" },
    { check: { command: "echo ready" }, field: "command" },
    { check: { command: ["npm", "test"], shards: { count: 4, argument: "--shard={count}" } }, field: "shards.argument" },
    { check: { command: ["npm", "test"], gate: "push", no_evidence_exit: 5 }, field: "no_evidence_exit" },
    { check: { command: ["npm", "test"], pass_paths: false }, field: "pass_paths" },
  ])("refuses an incompatible $field", ({ check, field }) => {
    const result = CheckDeclarationSchema.safeParse({ checks: { test: check } });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues.map((issue) => issue.path.join(".")))
      .toContain(`checks.test.${field}`);
  });
  it("accepts a files check that withholds its paths from the command", () => {
    const check = { command: ["npm", "test"], mode: "files", pass_paths: false, inputs: ["docs/**/*.md"] };
    expect(CheckDeclarationSchema.parse({ checks: { test: check } })).toMatchObject({ checks: { test: check } });
  });
  it("accepts a project shell command with indexed shards", () => {
    const check = { command: "echo ready", shell: true, shards: { count: 4, argument: "--shard={index}/{count}" } };
    expect(CheckDeclarationSchema.parse({ checks: { test: check } })).toMatchObject({ checks: { test: check } });
  });
});
