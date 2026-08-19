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
import type { CommandInputDeclaration } from "../../../src/lib/command-input/declaration.js";

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

  it("reconciles every live syntax site and declared interaction use", () => {
    const syntaxCount = snapshot.source.commands.reduce(
      (count, command) => count + command.operands.length + command.options.length,
      0,
    );
    const declaredInteractionCount = commandInputPolicyDeclarations.reduce(
      (count, declaration) => count + declaration.sites.filter(
        (site) => "interaction" in site.source && site.source.interaction !== undefined,
      ).length,
      0,
    );
    const declaredSemanticSites = inventory.entries
      .filter((entry) => entry.origin === "declaration" && !entry.siteId.startsWith("interaction."))
      .map((entry) => entry.identity);

    expect(inventory.entries).toHaveLength(
      syntaxCount + declaredInteractionCount + declaredSemanticSites.length,
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
      expect.objectContaining({
        identity: "delivery plan from-tasks:option.design-inventory",
        acquisition: "handler-required",
        schemaOwnership: "owned",
        schemaField: "designInventory",
      }),
      expect.objectContaining({
        identity: "delivery plan from-tasks:option.task-list",
        acquisition: "safe-default",
        schemaOwnership: "owned",
        schemaField: "taskList",
        noInput: "use-default",
      }),
      expect.objectContaining({
        identity: "delivery plan from-branch:option.design-inventory",
        acquisition: "handler-required",
        schemaOwnership: "owned",
        schemaField: "designInventory",
      }),
      expect.objectContaining({
        identity: "delivery compose:option.landed-prefix",
        acquisition: "required-evidence",
        schemaOwnership: "owned",
        schemaField: "landedPrefix",
      }),
      expect.objectContaining({
        identity: "delivery compose:option.json",
        schemaOwnership: "owned",
        schemaField: "json",
      }),
      expect.objectContaining({
        identity: "delivery plan abandon:option.json",
        schemaOwnership: "owned",
        schemaField: "json",
      }),
      expect.objectContaining({
        identity: "review change-request resolve:option.head-ref",
        acquisition: "parser-required",
      }),
      expect.objectContaining({
        identity: "review change-request resolve:option.head-sha",
        acquisition: "parser-required",
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

  it("routes every terminal-prompt subprocess command through the interaction-context adapter", () => {
    const subprocessCommands = new Set(inventory.entries
      .filter((entry) => entry.subprocess === "terminal-prompts")
      .map((entry) => entry.commandPath));
    const bypasses = snapshot.source.commands
      .filter((command) => subprocessCommands.has(command.path))
      .filter((command) => command.action?.interactionContext !== true)
      .map((command) => command.path);

    expect(bypasses).toEqual([]);
  });

  it("routes the close-stdin frontline provider through the interaction-context adapter", () => {
    const command = snapshot.source.commands.find((entry) => entry.path === "review frontline run");

    expect(command?.action?.interactionContext).toBe(true);
  });

  it("assigns the byte-preserving raw Git boundary to its command families", () => {
    const rawGitCommands = inventory.entries
      .filter((entry) => entry.siteId === "interaction.lib-git-process-executor.ts-subprocess-execa-2")
      .map((entry) => entry.commandPath)
      .sort();

    expect(rawGitCommands).toEqual([
      "abandon",
      "activate",
      "archive",
      "deactivate",
      "decompose",
      "delivery compose",
      "delivery eligibility close",
      "delivery eligibility prepare",
      "delivery entry inspect",
      "delivery land apply",
      "delivery land prepare",
      "delivery materialize",
      "delivery native land-prepare",
      "delivery native land-select",
      "delivery native land-status",
      "delivery native land-submit",
      "delivery native link",
      "delivery native observe",
      "delivery native unlink",
      "delivery plan abandon",
      "delivery plan from-branch",
      "delivery plan from-tasks",
      "delivery position",
      "delivery publish",
      "delivery reconcile",
      "delivery rematerialize",
      "delivery rewrite",
      "delivery teardown",
      "delivery terminal attach",
      "delivery terminal prepare",
      "demote",
      "finalize",
      "materialize",
      "park",
      "promote",
      "publish",
      "rename",
      "reopen",
      "repoint-design",
      "resume",
      "review chunking resolve",
      "review planning-lane",
      "review pre-publication",
      "set-stage",
      "start",
      "status",
      "stub",
      "teardown",
      "user reconcile-references",
      "wu reconcile",
    ]);
  });

  it("routes lifecycle and errand command boundaries through the interaction-context adapter", () => {
    const adapterCommands = new Map(snapshot.source.commands.map((command) => [
      command.path,
      command.action?.interactionContext === true,
    ]));
    const expected = [
      "decompose",
      "rename",
      "demote",
      "park",
      "resume",
      "materialize",
      "activate",
      "deactivate",
      "publish",
      "reopen",
      "archive",
      "teardown",
      "set-stage",
      "finalize",
      "repoint-design",
    ];

    expect(expected.filter((command) => adapterCommands.get(command) !== true)).toEqual([]);
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

  it("maps every registered syntax site to a real command-schema field", () => {
    const mismatches = commandInputRegistrations.flatMap((registration) => {
      const schema = z.toJSONSchema(registration.schema) as { properties?: Readonly<Record<string, unknown>> };
      const properties = new Set(Object.keys(schema.properties ?? {}));
      return Object.entries(registration.schemaFields ?? {})
        .filter(([, field]) => !properties.has(field))
        .map(([site, field]) => `${registration.commandPath}:${site} -> ${field}`);
    });

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

  it("rejects duplicate explicit policy ownership instead of silently taking the last declaration", () => {
    const command = snapshot.source.commands.find((candidate) => candidate.path === "status");
    const option = command?.options[0];
    expect(option).toBeDefined();
    const policy: CommandInputDeclaration = {
      commandPath: "status",
      aliases: [],
      sites: [{
        id: `option.${option?.flags.match(/--([a-z0-9-]+)/u)?.[1] ?? "unknown"}`,
        source: { file: option?.file ?? "cli.ts", line: option?.line ?? 1 },
        origin: "syntax",
        acquisition: "optional",
        schemaOwnership: "none",
        cancellation: "not-applicable",
        automation: { noInput: "same", flags: [], acceptedSyntax: [] },
        mutationBoundary: "status handler",
        subprocess: "none",
      }],
    };

    expect(() => buildRepositoryCommandInputInventoryFromSnapshot(
      snapshot,
      commandInputRegistrations,
      [...commandInputPolicyDeclarations, policy, policy],
    )).toThrow(/duplicate site identity/ui);
  });
});
