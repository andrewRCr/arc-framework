import { describe, expect, it } from "vitest";
import { declarePromptSite } from "../../../src/lib/command-input/declaration.js";
import { reconcileCommandInputInventory } from "../../../src/lib/command-input/inventory.js";
import { scanCommanderSource, scanInteractionSource } from "../../../src/lib/command-input/source-scanner.js";

const policy = JSON.stringify({ acquisition: "optional", schemaOwnership: "none", cancellation: "stop",
  automation: { noInput: "require-explicit", acceptedSyntax: ["--value"] }, mutationBoundary: "wait", subprocess: "none" });
const declare = (name: string, id: string, file: string) =>
  `export const ${name} = declarePromptSite(${JSON.stringify(id)}, "text", ${JSON.stringify({ file, symbol: name })}, ${policy});`;
const factoryImport = 'import { declarePromptSite } from "../lib/command-input/declaration.js";';
const promptImport = 'import { prompt as ask } from "../lib/command-input/prompter.js";';
const sites = [factoryImport, declare("firstSite", "first", "handlers/sites.ts"),
  declare("secondSite", "second", "handlers/sites.ts")].join("\n");
const scan = (sourceText: string, other: Readonly<Record<string, string>> = {}) => scanInteractionSource({
  file: "handlers/caller.ts", sourceText, sourceFiles: { "handlers/caller.ts": sourceText, ...other },
});

describe("declared-value prompt discovery", () => {
  it("resolves an imported alias and keeps its passing call as the locus", () => {
    const source = [promptImport, 'import { firstSite as inputSite } from "./sites.js";',
      'async function run(context) { return ask(inputSite, context, { message: "Value?" }); }'].join("\n");
    expect(scan(source, { "handlers/sites.ts": sites }).sites).toEqual([
      { kind: "prompt", callee: "ask", declaredId: "first", file: "handlers/caller.ts", line: 3, column: 38 },
    ]);
  });
  it("resolves an exported constant in the call's own file", () => {
    const source = [factoryImport, promptImport, declare("ownSite", "own", "handlers/caller.ts"),
      'async function run(context) { return ask(ownSite, context, { message: "Value?" }); }'].join("\n");
    expect(scan(source).sites).toMatchObject([{ declaredId: "own", line: 4 }]);
  });
  it("finds each caller of one wrapper and accepts nested parameter pass-through", () => {
    const source = [promptImport, 'import { firstSite, secondSite } from "./sites.js";',
      'async function wrapper(site, context) { return nested(() => ask(site, context, { message: "Value?" })); }',
      'async function run(context) { await wrapper(firstSite, context); await wrapper(secondSite, context); }'].join("\n");
    expect(scan(source, { "handlers/sites.ts": sites }).sites.map((site) => site.declaredId)).toEqual(["first", "second"]);
  });
  it("refuses a concrete site passed by two calls", () => {
    const source = [promptImport, 'import { firstSite } from "./sites.js";',
      'async function run(context) { await ask(firstSite, context, { message: "One?" }); await ask(firstSite, context, { message: "Two?" }); }'].join("\n");
    expect(() => scan(source, { "handlers/sites.ts": sites })).toThrow(/passed by more than one call/u);
  });
  it("refuses the same exported site passed from different modules", () => {
    const caller = [promptImport, 'import { firstSite } from "./sites.js";',
      'async function run(context) { return ask(firstSite, context, { message: "Value?" }); }'].join("\n");
    expect(() => scan(caller, { "handlers/sites.ts": sites, "handlers/other.ts": caller }))
      .toThrow(/passed by more than one call/u);
  });
  it.each([
    `async function run(context) { return ask(declarePromptSite("inline", "text", { file: "handlers/caller.ts", symbol: "inline" }, ${policy}), context, { message: "Value?" }); }`,
    `const local = declarePromptSite("local", "text", { file: "handlers/caller.ts", symbol: "local" }, ${policy});`,
    `export let mutable = declarePromptSite("mutable", "text", { file: "handlers/caller.ts", symbol: "mutable" }, ${policy});`,
  ])("refuses a factory call outside an exported constant initializer", (body) => {
    expect(() => scan([factoryImport, promptImport, body].join("\n"))).toThrow(/exported constant initializer/u);
  });
  it.each([
    'async function run(context) { return ask(unresolved, context, { message: "Value?" }); }',
    'async function run(site, context) { return nested(() => { const site = unknown; return ask(site, context, { message: "Value?" }); }); }',
  ])("refuses an unresolved or shadowed site argument", (body) => {
    expect(() => scan([promptImport, body].join("\n"))).toThrow(/Unresolved prompt site/u);
  });
  it("accepts a direct enclosing parameter without creating an additional site", () => {
    expect(scan([promptImport, 'async function wrapper(site, context) { return ask(site, context, { message: "Value?" }); }'].join("\n")).sites).toEqual([]);
  });
  it("keeps the Clack renderer outside command-owned prompt discovery", () => {
    expect(scanInteractionSource({ file: "lib/command-input/prompt-renderer.ts",
      sourceText: 'import * as p from "@clack/prompts"; export const render = () => p.confirm({ message: "Continue?" });',
    }).sites).toEqual([]);
  });
});

describe("declared prompt inventory joins", () => {
  const declared = declarePromptSite("first", "text", { file: "handlers/sites.ts", symbol: "firstSite" }, {
    acquisition: "optional", schemaOwnership: "none", cancellation: "stop",
    automation: { noInput: "require-explicit", acceptedSyntax: ["--value"] }, mutationBoundary: "wait", subprocess: "none",
  });
  const cli = 'program.command("first").action(run); program.command("second").action(run);';
  const commands = scanCommanderSource({ file: "cli.ts", sourceText: cli }).commands;
  it("joins a declaration to its passing call, shared across command paths", () => {
    const caller = [promptImport, 'import { firstSite } from "./sites.js";',
      'async function run(context) { return ask(firstSite, context, { message: "Value?" }); }'].join("\n");
    const result = reconcileCommandInputInventory({ source: { commands, interactions: scan(caller, { "handlers/sites.ts": sites }).sites },
      declarations: [{ commandPath: "first", sites: [declared] }, { commandPath: "second", sites: [declared] }],
      sourceFiles: { "cli.ts": cli, "handlers/sites.ts": sites, "handlers/caller.ts": caller },
    });
    expect(result.entries.map((entry) => entry.liveSource)).toEqual([
      { kind: "prompt", callee: "ask", declaredId: "first", file: "handlers/caller.ts", line: 3, column: 38 },
      { kind: "prompt", callee: "ask", declaredId: "first", file: "handlers/caller.ts", line: 3, column: 38 },
    ]);
  });
  it("refuses an existing declaration whose site has no passing call", () => {
    expect(() => reconcileCommandInputInventory({ source: { commands, interactions: [] },
      declarations: [{ commandPath: "first", sites: [declared] }], sourceFiles: { "cli.ts": cli, "handlers/sites.ts": sites },
    })).toThrow(expect.objectContaining({ code: "command-input.inventory.stale-source" }));
  });
});
