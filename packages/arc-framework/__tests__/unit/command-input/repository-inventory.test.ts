import { resolve } from "node:path";

import { beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";

import {
  buildRepositoryCommandInputInventory,
  buildRepositoryCommandInputInventoryFromSnapshot,
  loadRepositoryCommandInputSnapshot,
  renderCommandInputInventory,
} from "../../../src/lib/command-input/repository-inventory.js";
import { NO_INPUT_MATRIX } from "../../fixtures/command-input/no-input-matrix.js";
import {
  commandInputPolicyDeclarations,
  commandInputRegistrations,
} from "../../../src/command-input-registrations.js";

const sourceRoot = resolve(import.meta.dirname, "../../../src");

describe("repository command-input inventory", () => {
  let snapshot!: Awaited<ReturnType<typeof loadRepositoryCommandInputSnapshot>>;
  let inventory!: Awaited<ReturnType<typeof buildRepositoryCommandInputInventory>>;

  beforeAll(async () => {
    snapshot = await loadRepositoryCommandInputSnapshot(sourceRoot);
    inventory = buildRepositoryCommandInputInventoryFromSnapshot(
      snapshot,
      commandInputRegistrations,
      commandInputPolicyDeclarations,
    );
  });

  it("reconciles every live syntax and interaction site exactly once", () => {
    const syntaxCount = snapshot.source.commands.reduce(
      (count, command) => count + command.operands.length + command.options.length,
      0,
    );
    const declaredSemanticSites = inventory.entries
      .filter((entry) => entry.origin === "declaration" && !entry.siteId.startsWith("interaction."))
      .map((entry) => entry.identity);

    expect(inventory.entries).toHaveLength(
      syntaxCount + snapshot.source.interactions.length + declaredSemanticSites.length,
    );
    expect(declaredSemanticSites).toEqual([
      "join:semantic.identity",
      "join:semantic.tools",
      "start:safety.indeterminate-lifecycle",
      "status:semantic.interaction-context",
    ]);
    expect(inventory.entries).toEqual(expect.arrayContaining([
      expect.objectContaining({
        identity: "init:option.name",
        schemaField: "projectName",
      }),
      expect.objectContaining({
        identity: "init:option.pm-mode",
        schemaField: "pmMode",
      }),
      expect.objectContaining({
        identity: "init:option.team",
        schemaField: "teamMode",
      }),
      expect.objectContaining({
        identity: "user open:interaction.handlers-user.ts-prompt-p.select-1",
        acquisition: "safe-default",
        cancellation: "safe-default",
        noInput: "use-default",
      }),
      expect.objectContaining({
        identity: "user sync:interaction.handlers-user-sync.ts-prompt-p.select-1",
        acquisition: "safe-default",
        noInput: "use-default",
      }),
    ]));
    expect(new Set(inventory.entries.map((entry) => entry.identity)).size).toBe(inventory.entries.length);
    expect(inventory.entries.map((entry) => entry.identity)).toEqual(
      [...inventory.entries.map((entry) => entry.identity)].sort(),
    );
  });

  it("requires every discovered interaction policy to come from a command-owned declaration", () => {
    const declared = new Set(commandInputPolicyDeclarations.flatMap((declaration) => declaration.sites.flatMap(
      (site) => {
        if (!("interaction" in site.source) || site.source.interaction === undefined) return [];
        const { interaction } = site.source;
        return [
          `${site.source.file}|${interaction.kind}|${interaction.callee}|${String(interaction.occurrence)}`,
        ];
      },
    )));
    const counts = new Map<string, number>();
    const missing = snapshot.source.interactions.flatMap((site) => {
      const base = `${site.file}|${site.kind}|${site.callee}`;
      const occurrence = (counts.get(base) ?? 0) + 1;
      counts.set(base, occurrence);
      const selector = `${base}|${String(occurrence)}`;
      return declared.has(selector) ? [] : [selector];
    });

    expect(missing).toEqual([]);
  });

  it("requires semantic syntax policy to come from a command-owned declaration", () => {
    const declared = new Set(commandInputPolicyDeclarations.flatMap((declaration) => declaration.sites
      .filter((site) => site.origin === "syntax")
      .map((site) => `${declaration.commandPath}:${site.id}`)));
    const semanticSyntax = inventory.entries
      .filter((entry) => entry.origin === "syntax")
      .filter((entry) => [
        "safe-default",
        "machine-mode",
        "protected-confirmation",
        "opaque-passthrough",
      ].includes(entry.acquisition))
      .map((entry) => entry.identity);

    expect(semanticSyntax.filter((identity) => !declared.has(identity))).toEqual([]);
  });

  it("routes every machine-readable command through the interaction-context adapter", () => {
    const machineCommands = new Set(inventory.entries
      .filter((entry) => entry.acquisition === "machine-mode")
      .map((entry) => entry.commandPath));
    const bypasses = snapshot.source.commands
      .filter((command) => machineCommands.has(command.path))
      .filter((command) => command.action?.interactionContext !== true)
      .map((command) => command.path);

    expect(bypasses).toEqual([]);
  });

  it("renders a stable descriptive table without writing a tracked artifact", () => {
    const rendered = renderCommandInputInventory(inventory);

    expect(rendered).toMatch(/^identity\torigin\tacquisition\tschema\tno-input\tsubprocess\tmutation-boundary\n/u);
    expect(rendered).toContain("release commit:operand.args\tsyntax\topaque-passthrough\topaque");
    expect(rendered.endsWith("\n")).toBe(true);
  });

  it("maps every schema-owned inventory site to a real command-schema field", () => {
    const propertiesByCommand = new Map(commandInputRegistrations.map((registration) => {
      const schema = z.toJSONSchema(registration.schema) as { properties?: Readonly<Record<string, unknown>> };
      return [registration.commandPath, new Set(Object.keys(schema.properties ?? {}))] as const;
    }));

    const mismatches = inventory.entries
      .filter((entry) => entry.schemaOwnership === "owned")
      .filter((entry) => !propertiesByCommand.get(entry.commandPath)?.has(entry.schemaField ?? ""))
      .map((entry) => `${entry.identity} -> ${String(entry.schemaField)}`);

    expect(mismatches).toEqual([]);
  });

  it("represents every command-schema field in the authoritative inventory", () => {
    const represented = new Map<string, Set<string>>();
    for (const entry of inventory.entries.filter((candidate) => candidate.schemaOwnership === "owned")) {
      const fields = represented.get(entry.commandPath) ?? new Set<string>();
      fields.add(entry.schemaField ?? "");
      represented.set(entry.commandPath, fields);
    }
    const missing = commandInputRegistrations.flatMap((registration) => {
      const schema = z.toJSONSchema(registration.schema) as { properties?: Readonly<Record<string, unknown>> };
      return Object.keys(schema.properties ?? {})
        .filter((field) => !represented.get(registration.commandPath)?.has(field))
        .map((field) => `${registration.commandPath}:${field}`);
    });

    expect(missing).toEqual([]);
  });

  it("exact-matches every interaction-capable command to the real-process matrix", () => {
    const interactionCommands = [...new Set(inventory.entries
      .filter((entry) => entry.siteId.startsWith("interaction.") || entry.automationFlags.includes("--no-input"))
      .map((entry) => entry.commandPath))].sort();
    expect(NO_INPUT_MATRIX.map((entry) => entry.commandPath).sort()).toEqual(interactionCommands);
  });
});
