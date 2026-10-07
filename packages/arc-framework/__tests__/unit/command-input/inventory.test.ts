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
  import { execFile } from "node:child_process";
  export async function handleCreate() {
    return execFile("git", ["status"]);
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
      id: "process.status",
      source: {
        file: "handlers/create.ts",
        interaction: { kind: "subprocess", callee: "execFile", occurrence: 1 },
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
      "create:process.status",
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
    const sameLineText = 'import { execFile } from "node:child_process"; execFile("git", ["status"]); execFile("git", ["log"]);';
    const sameLineInteractions = scanInteractionSource({
      file: "handlers/create.ts",
      sourceText: sameLineText,
    });
    const value = declaration();
    value.sites = [
      ...value.sites.slice(0, 3),
      ...([1, 2] as const).map((occurrence) => ({
        ...value.sites[3]!,
        id: `process.status-${String(occurrence)}`,
        source: {
          file: "handlers/create.ts",
          interaction: { kind: "subprocess" as const, callee: "execFile", occurrence },
        },
      })),
    ];

    const result = reconcileCommandInputInventory({
      source: { commands: cli.commands, interactions: sameLineInteractions.sites },
      declarations: [value],
      sourceFiles: { "cli.ts": "handleCreate", "handlers/create.ts": sameLineText },
    });

    expect(result.entries.filter((entry) => entry.siteId.startsWith("process.status-"))).toHaveLength(2);
  });

  it("shares one interaction site across commands only when its physical policy matches", () => {
    const sharedCli = scanCommanderSource({
      file: "cli.ts",
      sourceText: `
        const program = new Command();
        program.command("create").action(handleCreate);
        program.command("delete").action(handleDelete);
      `,
    });
    const site = declaration().sites[3]!;
    const createPolicy: CommandInputDeclaration = {
      commandPath: "create",
      aliases: [],
      sites: [{ ...site, mutationBoundary: "create handler" }],
    };
    const deletePolicy: CommandInputDeclaration = {
      commandPath: "delete",
      aliases: [],
      sites: [{ ...site, mutationBoundary: "delete handler" }],
    };
    const source = { commands: sharedCli.commands, interactions: interactions.sites };
    const sourceFiles = { "cli.ts": "handleCreate handleDelete", "handlers/create.ts": handlerText };

    const result = reconcileCommandInputInventory({
      source,
      declarations: [createPolicy, deletePolicy],
      sourceFiles,
    });

    expect(result.entries.map((entry) => entry.identity)).toEqual([
      "create:process.status",
      "delete:process.status",
    ]);

    const conflictingPolicy: CommandInputDeclaration = {
      ...deletePolicy,
      sites: [{ ...site, mutationBoundary: "delete handler", subprocess: "terminal-prompts" }],
    };
    expect(() => reconcileCommandInputInventory({
      source,
      declarations: [createPolicy, conflictingPolicy],
      sourceFiles,
    })).toThrow(/Interaction site is multiply classified/u);
  });

  it("rejects a declaration whose interaction selector no longer resolves", () => {
    const stale = declaration();
    stale.sites[3] = {
      ...stale.sites[3]!,
      source: {
        file: "handlers/create.ts",
        interaction: { kind: "subprocess", callee: "execFile", occurrence: 2 },
      },
    };

    expect(() => reconcileCommandInputInventory({
      source: { commands: cli.commands, interactions: interactions.sites },
      declarations: [stale],
      sourceFiles: { "cli.ts": "handleCreate", "handlers/create.ts": handlerText },
    })).toThrow(/interaction selector no longer resolves/u);
  });

  it("matches declared symbols literally instead of interpreting regex metacharacters", () => {
    const literal = declaration();
    literal.sites[3] = {
      ...literal.sites[3]!,
      source: { file: "handlers/create.ts", symbol: "create$name.value" },
    };

    expect(() => reconcileCommandInputInventory({
      source: { commands: cli.commands, interactions: [] },
      declarations: [literal],
      sourceFiles: {
        "cli.ts": "handleCreate",
        "handlers/create.ts": "const create$nameXvalue = true;",
      },
    })).toThrow(/source locus/u);
  });
});
