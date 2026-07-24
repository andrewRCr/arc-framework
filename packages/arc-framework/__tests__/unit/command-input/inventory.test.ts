import { describe, expect, it } from "vitest";

import {
  CommandInputInventoryError,
  reconcileCommandInputInventory,
  scanCommanderSource,
  scanInteractionSource,
  type CommandInputDeclaration,
} from "../../../src/lib/command-input/index.js";

const cli = scanCommanderSource({
  file: "cli.ts",
  sourceText: `
    const program = new Command();
    program.command("create <name>")
      .option("--priority <priority>")
      .option("--json")
      .action(handleCreate);
  `,
});

const handlerText = `
  import * as p from "@clack/prompts";
  export async function handleCreate() {
    return p.text({ message: "Name" });
  }
`;

const interactions = scanInteractionSource({ file: "handlers/create.ts", sourceText: handlerText });

const declaration = (): CommandInputDeclaration => ({
  commandPath: "create",
  aliases: [],
  sites: [
    {
      id: "operand.name",
      source: { file: "cli.ts", symbol: "handleCreate" },
      origin: "syntax",
      acquisition: "parser-required",
      schemaOwnership: "owned",
      schemaField: "name",
      cancellation: "not-applicable",
      automation: { noInput: "same", flags: [], acceptedSyntax: ["<name>"] },
      mutationBoundary: "create handler",
      subprocess: "none",
    },
    {
      id: "option.priority",
      source: { file: "cli.ts", symbol: "handleCreate" },
      origin: "syntax",
      acquisition: "optional",
      schemaOwnership: "owned",
      schemaField: "priority",
      cancellation: "not-applicable",
      automation: { noInput: "preserve-absent", flags: [], acceptedSyntax: ["--priority <priority>"] },
      mutationBoundary: "create handler",
      subprocess: "none",
    },
    {
      id: "option.json",
      source: { file: "cli.ts", symbol: "handleCreate" },
      origin: "syntax",
      acquisition: "machine-mode",
      schemaOwnership: "none",
      cancellation: "not-applicable",
      automation: { noInput: "same", flags: ["--json"], acceptedSyntax: [] },
      mutationBoundary: "output selection",
      subprocess: "none",
    },
    {
      id: "prompt.name",
      source: {
        file: "handlers/create.ts",
        interaction: { kind: "prompt", callee: "p.text", occurrence: 1 },
      },
      origin: "declaration",
      acquisition: "handler-required",
      schemaOwnership: "owned",
      schemaField: "name",
      cancellation: "stop",
      automation: { noInput: "require-explicit", flags: [], acceptedSyntax: ["<name>"] },
      mutationBoundary: "create handler",
      subprocess: "none",
    },
  ],
});

describe("command-input inventory reconciliation", () => {
  it("joins syntax and declaration policy into deterministic inventory records", () => {
    const result = reconcileCommandInputInventory({
      source: { commands: cli.commands, interactions: interactions.sites },
      declarations: [declaration()],
      sourceFiles: { "cli.ts": "handleCreate", "handlers/create.ts": handlerText },
    });

    expect(result.entries.map((entry) => entry.identity)).toEqual([
      "create:operand.name",
      "create:option.json",
      "create:option.priority",
      "create:prompt.name",
    ]);
    expect(result.entries[3]).toMatchObject({
      commandPath: "create",
      origin: "declaration",
      acquisition: "handler-required",
      liveSource: { file: "handlers/create.ts", line: 4 },
    });
  });

  it("rejects unclassified, multiply classified, and stale source sites", () => {
    const missing = declaration();
    missing.sites = missing.sites.filter((site) => site.id !== "option.priority");
    expect(() => reconcileCommandInputInventory({
      source: { commands: cli.commands, interactions: interactions.sites },
      declarations: [missing],
      sourceFiles: { "cli.ts": "handleCreate", "handlers/create.ts": handlerText },
    })).toThrow(CommandInputInventoryError);

    const duplicate = declaration();
    duplicate.sites = [...duplicate.sites, { ...duplicate.sites[0]!, id: "operand.name-copy" }];
    expect(() => reconcileCommandInputInventory({
      source: { commands: cli.commands, interactions: interactions.sites },
      declarations: [duplicate],
      sourceFiles: { "cli.ts": "handleCreate", "handlers/create.ts": handlerText },
    })).toThrow(/unresolved syntax declaration/u);

    const stale = declaration();
    stale.sites[3] = { ...stale.sites[3]!, source: { file: "handlers/create.ts", line: 99 } };
    expect(() => reconcileCommandInputInventory({
      source: { commands: cli.commands, interactions: interactions.sites },
      declarations: [stale],
      sourceFiles: { "cli.ts": "handleCreate", "handlers/create.ts": handlerText },
    })).toThrow(/source locus/u);
  });

  it("reconciles two interaction sites that share one source line", () => {
    const sameLineText = 'import * as p from "@clack/prompts"; p.text({ message: "A" }); p.text({ message: "B" });';
    const sameLineInteractions = scanInteractionSource({
      file: "handlers/create.ts",
      sourceText: sameLineText,
    });
    const value = declaration();
    value.sites = [
      ...value.sites.slice(0, 3),
      ...([1, 2] as const).map((occurrence) => ({
        ...value.sites[3]!,
        id: `prompt.name-${String(occurrence)}`,
        source: {
          file: "handlers/create.ts",
          interaction: { kind: "prompt" as const, callee: "p.text", occurrence },
        },
      })),
    ];

    const result = reconcileCommandInputInventory({
      source: { commands: cli.commands, interactions: sameLineInteractions.sites },
      declarations: [value],
      sourceFiles: { "cli.ts": "handleCreate", "handlers/create.ts": sameLineText },
    });

    expect(result.entries.filter((entry) => entry.siteId.startsWith("prompt.name-"))).toHaveLength(2);
  });
});
