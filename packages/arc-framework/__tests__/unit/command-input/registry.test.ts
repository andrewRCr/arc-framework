import { describe, expect, it } from "vitest";
import { z } from "zod";
import { resolve } from "node:path";

import {
  createCommandInputRegistry,
  commandInputSchemaId,
  parseCommandInput,
  scanCommandInputSources,
} from "../../../src/lib/command-input/index.js";
import { commandInputRegistrations } from "../../../src/command-input-registrations.js";

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
    expect(empty.ids()).toEqual(["priority", "slug", "work-class", "work-unit-state"]);

    const schema = z.object({ value: z.string() });
    const registry = createCommandInputRegistry([{
      commandPath: "example create",
      aliases: ["example add"],
      schema,
    }]);

    expect(registry.ids()).toEqual([
      "command-example-create-input",
      "priority",
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

  it("registers exactly every schema-owned value path in the live Commander tree", async () => {
    const sourceRoot = resolve(import.meta.dirname, "../../../src");
    const source = await scanCommandInputSources({ sourceRoot });
    const expectedPaths = source.commands
      .filter((command) => command.path !== "release commit" && command.path !== "release push")
      .filter((command) => command.operands.length > 0 || command.options.some((option) => option.valueName !== null))
      .map((command) => command.path)
      .sort();
    const registeredPaths = commandInputRegistrations.map((registration) => registration.commandPath).sort();

    expect(registeredPaths).toEqual(expectedPaths);

    const registry = createCommandInputRegistry(commandInputRegistrations);
    expect(registry.ids()).toEqual([
      ...expectedPaths.map(commandInputSchemaId),
      "priority",
      "slug",
      "work-class",
      "work-unit-state",
    ].sort());
  });
});
