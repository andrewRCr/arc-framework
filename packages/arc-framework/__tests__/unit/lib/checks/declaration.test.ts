/** Project-authored check fields and their resolved defaults. */
import { describe, expect, it } from "vitest";
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

describe("check declaration fields", () => {
  it("accepts typed commands, global inputs, and shard configuration", () => {
    expect(CheckDeclarationSchema.parse(illustrative)).toMatchObject(illustrative);
  });
  it("resolves omitted fields conservatively", () => {
    expect(CheckDeclarationSchema.parse({ checks: { test: { command: ["npm", "test"] } } })).toEqual({
      global_inputs: [], global_runtime_inputs: [], commit_fixes: "restage",
      checks: { test: { command: ["npm", "test"], mode: "project", inputs: ["**"], runtime_inputs: [],
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
  it("admits an editor schema reference only at the root", () => {
    expect(CheckDeclarationSchema.parse({ $schema: "urn:test", checks: {} })).toMatchObject({ $schema: "urn:test" });
  });
});
