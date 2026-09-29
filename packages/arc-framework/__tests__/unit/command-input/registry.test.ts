import { Ajv2020, type AnySchema } from "ajv/dist/2020.js";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { resolve } from "node:path";
import { assertSchemaAccepts, assertSchemaRefuses } from "../../helpers/schema-assertion.js";

import {
  createCommandInputRegistry,
  commandInputSchemaId,
  parseCommandInput,
  scanCommandInputSources,
} from "../../../src/lib/command-input/index.js";
import { commandInputRegistrations } from "../../../src/command-input-registrations.js";

const REPOSITORY_SCAN_TIMEOUT = 15_000;

describe("command-input schema adapter and registry", () => {
  it("parses equivalent argument and prompt values through one command-owned schema", () => {
    const schema = z.object({ name: z.string().trim().min(1) }).strict();

    expect(parseCommandInput(schema, { name: " example " }, "argument"))
      .toEqual({ kind: "resolved", value: { name: "example" }, source: "argument" });
    expect(parseCommandInput(schema, { name: " example " }, "prompt"))
      .toEqual({ kind: "resolved", value: { name: "example" }, source: "prompt" });
    expect(parseCommandInput(schema, { name: "" }, "argument"))
      .toMatchObject({ kind: "invalid", issues: [{ path: ["name"] }] });
  });

  it("starts with only kernel identities and adds isolated canonical command schemas", () => {
    const empty = createCommandInputRegistry();
    expect(empty.ids()).toEqual([
      "priority",
      "remote-evidence",
      "remote-failure-reason",
      "slug",
      "work-class",
      "work-unit-state",
    ]);

    const schema = z.object({ value: z.string() });
    const registry = createCommandInputRegistry([{
      commandPath: "example create",
      aliases: ["example add"],
      schema,
    }]);

    expect(registry.ids()).toEqual([
      "command-example-create-input",
      "priority",
      "remote-evidence",
      "remote-failure-reason",
      "slug",
      "work-class",
      "work-unit-state",
    ]);
    expect(registry.getCommand("example create")).toBe(schema);
    expect(registry.getCommand("example add")).toBe(schema);
    expect(registry.meta("command-example-create-input")).toEqual({
      id: "command-example-create-input",
      version: 1,
      migrationPosture: "strict-current",
    });
  });

  it("registers every command-owned schema in the live Commander tree", async () => {
    const sourceRoot = resolve(import.meta.dirname, "../../../src");
    const source = await scanCommandInputSources({ sourceRoot });
    const flagOnlySchemaPaths = [
      "delivery compose",
      "delivery plan abandon",
      "delivery plan inventory schema",
      "errand next",
    ];
    const expectedPaths = source.commands
      .filter((command) => command.path !== "release commit" && command.path !== "release push")
      .filter((command) => flagOnlySchemaPaths.includes(command.path)
        || command.operands.length > 0
        || command.options.some((option) => option.valueName !== null))
      .map((command) => command.path)
      .sort();
    const registeredPaths = commandInputRegistrations.map((registration) => registration.commandPath).sort();

    expect(registeredPaths).toEqual(expectedPaths);

    const registry = createCommandInputRegistry(commandInputRegistrations);
    expect(registry.ids()).toEqual([
      ...expectedPaths.map(commandInputSchemaId),
      "priority",
      "remote-evidence",
      "remote-failure-reason",
      "slug",
      "work-class",
      "work-unit-state",
    ].sort());
  }, REPOSITORY_SCAN_TIMEOUT);

  it("preserves stub cohort-path acceptance in the JSON Schema projection", () => {
    const registry = createCommandInputRegistry(commandInputRegistrations);
    const runtime = registry.getCommand("stub");
    if (runtime === undefined) throw new Error("Missing stub command schema");

    const bundle = registry.toJSONSchema();
    const ajv = new Ajv2020({ allErrors: true, strict: true });
    for (const schema of Object.values(bundle.schemas)) ajv.addSchema(schema as AnySchema);
    const projected = ajv.getSchema("command-stub-input.schema.json");
    if (projected === undefined) throw new Error("Missing projected stub command schema");

    const base = { name: "member", commitment: "planned", priority: "P1" };
    for (const { cohort, accepted } of [
      { cohort: "parent", accepted: true },
      { cohort: "parent/child", accepted: true },
      { cohort: "parent/child/grandchild", accepted: false },
      { cohort: "../../escape", accepted: false },
    ]) {
      const input = { ...base, cohort };
      if (accepted) assertSchemaAccepts(runtime, input);
      else assertSchemaRefuses(runtime, input);
      expect(projected(input) as boolean, `${cohort}: projected ${JSON.stringify(projected.errors)}`).toBe(accepted);
    }
  });
});
