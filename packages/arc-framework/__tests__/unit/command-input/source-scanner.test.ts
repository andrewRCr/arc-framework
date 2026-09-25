import { Command, Option } from "commander";
import { describe, expect, it } from "vitest";

import {
  scanCommanderSource,
  scanInteractionSource,
} from "../../../src/lib/command-input/index.js";
import { importedModuleSpecifiers } from "../../../src/lib/command-input/source-scanner.js";

describe("command-input source scanner", () => {
  it("discovers literal static and dynamic relative imports", () => {
    expect(importedModuleSpecifiers(`
      import "./static.js";
      export { value } from "./exported.js";
      await import("./lazy.js");
      await import(packageName);
      await import("external-package");
    `, "src/cli.ts")).toEqual(["./static.js", "./exported.js", "./lazy.js"]);
  });

  it("extracts equivalent canonical paths from chained and separately bound builders", () => {
    const result = scanCommanderSource({
      file: "src/cli.ts",
      sourceText: `
        const program = new Command();
        program.command("direct <name>").option("--kind <kind>").action(handleDirect);
        const parent = program.command("parent");
        parent.command("child [slug]").action((slug) => handleChild(slug));
        program.command("inline-parent")
          .description("group")
          .command("inline-child")
          .argument("<input>")
          .action((input) => handleInlineChild(input));
        program.command("wrapped").action(withInteractionContext({}, (context) => handleWrapped(context)));
      `,
    });

    expect(result.commands.map((command) => command.path)).toEqual([
      "direct",
      "parent",
      "parent child",
      "inline-parent inline-child",
      "inline-parent",
      "wrapped",
    ]);
    expect(result.commands[0]).toMatchObject({
      operands: [{ name: "name", required: true, variadic: false }],
      options: [{ flags: "--kind <kind>", valueName: "kind", required: true, presenceRequired: false }],
      action: { symbol: "handleDirect" },
    });
    expect(result.commands[2]).toMatchObject({
      operands: [{ name: "slug", required: false, variadic: false }],
      action: { symbol: "handleChild" },
    });
    expect(result.commands[3]).toMatchObject({
      operands: [{ name: "input", required: true, variadic: false }],
      action: { symbol: "handleInlineChild" },
    });
    expect(result.commands[4]).toMatchObject({ operands: [], action: null });
    expect(result.commands[5]?.action).toMatchObject({ symbol: "handleWrapped", interactionContext: true });
  });

  it("retains aliases, required and variadic values, addOption policy, and opaque paths", () => {
    const result = scanCommanderSource({
      file: "src/cli.ts",
      sourceText: `
        const program = new Command();
        program.command("send")
          .alias("publish")
          .argument("[args...]", "opaque")
          .allowUnknownOption(true)
          .addOption(new Option("--mode <mode>").choices(["one", "two"]).default("one").conflicts("json")
            .makeOptionMandatory())
          .requiredOption("--target <ref>", "required target")
          .option("--json", "machine output")
          .action(async (args) => { await handleSend({ args }); });
      `,
    });

    expect(result.commands[0]).toMatchObject({
      aliases: ["publish"],
      allowUnknownOption: true,
      operands: [{ name: "args", required: false, variadic: true }],
      options: [
        {
          flags: "--mode <mode>",
          valueName: "mode",
          required: true,
          presenceRequired: false,
          choices: ["one", "two"],
          defaultValue: "one",
          conflicts: ["json"],
        },
        { flags: "--target <ref>", valueName: "ref", required: true, presenceRequired: true },
        { flags: "--json", valueName: null, required: false, presenceRequired: false },
      ],
      action: { symbol: "handleSend" },
    });
  });

  it("excludes rejected JSON flags while retaining supported hidden options", () => {
    const result = scanCommanderSource({
      file: "src/cli.ts",
      sourceText: `
        const program = new Command();
        const review = program.command("review");
        review.command("request")
          .addOption(new Option("--json").hideHelp())
          .hook("preAction", rejectUnsupportedReviewJson);
        review.command("output")
          .addOption(new Option("--json").hideHelp())
          .on("option:json", rejectUnsupportedReviewOutputJson);
        review.command("supported")
          .addOption(new Option("--json").hideHelp());
      `,
    });

    expect(result.commands.find((command) => command.path === "review request")?.options).toEqual([]);
    expect(result.commands.find((command) => command.path === "review output")?.options).toEqual([]);
    expect(result.commands.find((command) => command.path === "review supported")?.options)
      .toMatchObject([{ flags: "--json" }]);
  });

  it("distinguishes a mandatory value from explicit option presence when a default supplies it", async () => {
    const result = scanCommanderSource({
      file: "src/cli.ts",
      sourceText: `
        const program = new Command();
        program.command("send")
          .requiredOption("--target <ref>", "target", "main")
          .addOption(new Option("--mode <mode>").makeOptionMandatory().default("safe"));
      `,
    });

    expect(result.commands[0]?.options).toMatchObject([
      { flags: "--target <ref>", required: true, presenceRequired: false, defaultValue: "main" },
      { flags: "--mode <mode>", required: true, presenceRequired: false, defaultValue: "safe" },
    ]);

    const parsed = new Command()
      .exitOverride()
      .requiredOption("--target <ref>", "target", "main")
      .addOption(new Option("--mode <mode>").makeOptionMandatory().default("safe"));
    await expect(parsed.parseAsync(["node", "arc"], { from: "node" })).resolves.toBe(parsed);
    expect(parsed.opts()).toEqual({ target: "main", mode: "safe" });
  });

  it("discovers prompt/helper, explicit stdin, and interaction-capable process sites", () => {
    const result = scanInteractionSource({
      file: "src/handlers/example.ts",
      sourceText: `
        import * as p from "@clack/prompts";
        import { execa } from "execa";
        import { spawn } from "node:child_process";
        import { promisify } from "node:util";
        const spawnAsync = promisify(spawn);
        const value = await p.text({ message: "Name" });
        const tools = await p.autocompleteMultiselect({ message: "Tools", options: [] });
        const accepted = await ctx.output.confirm({ message: "Proceed?" });
        const automated = process.env.CI === "true" || !process.stdin.isTTY;
        for await (const chunk of process.stdin) consume(chunk);
        await execa("git", ["push"], { stdin: "inherit" });
        spawn("less", [], { stdio: "inherit" });
        await spawnAsync("git", ["status"]);
      `,
    });

    expect(result.sites.map((site) => site.kind)).toEqual([
      "prompt",
      "prompt",
      "prompt-helper",
      "environment-policy",
      "environment-policy",
      "explicit-stdin",
      "subprocess",
      "subprocess",
      "subprocess",
    ]);
    expect(result.sites.map((site) => site.callee)).toEqual([
      "p.text",
      "p.autocompleteMultiselect",
      "ctx.output.confirm",
      "process.env.CI",
      "process.stdin",
      "process.stdin",
      "execa",
      "spawn",
      "spawnAsync",
    ]);
  });
});
