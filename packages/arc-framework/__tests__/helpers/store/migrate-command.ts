/** Native migration invocations using the registered production option syntax. */
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Command, Option } from "commander";
import { handleStoreMigrate, type StoreMigrateOptions } from "../../../src/commands/store-migrate.js";
import { scanCommanderSource } from "../../../src/lib/command-input/source-scanner.js";
import { withInteractionContext } from "../../../src/lib/command-input/interaction-context.js";
import type { PromptRenderer } from "../../../src/lib/command-input/prompter.js";
import type { StoreMigrateResult, RefStorePorts } from "../../../src/lib/store/index.js";

const syntax = readFile(resolve(import.meta.dirname, "../../../src/cli.ts"), "utf8").then(sourceText =>
  scanCommanderSource({ file: "cli.ts", sourceText }).commands.find(({ path }) => path === "store migrate"));

/** Drive the production migration handler through Commander with a native ports boundary. */
export async function invokeStoreMigrate(argv: string[], ports: RefStorePorts, renderer?: PromptRenderer): Promise<StoreMigrateResult> {
  const registered = await syntax;
  if (!registered) throw new Error("The production migration command is absent");
  const command = new Command("migrate").exitOverride();
  for (const option of registered.options) command.addOption(new Option(option.flags).default(option.defaultValue));
  let result: StoreMigrateResult | undefined;
  command.action(withInteractionContext({ machineReadable: options => options.json === true,
    environment: { ci: false, promptInputIsTTY: renderer !== undefined, promptOutputIsTTY: renderer !== undefined } },
  async (context, options: StoreMigrateOptions) => {
    result = await handleStoreMigrate(options, context, { ports, write: () => {}, setExitCode: () => {}, ...(renderer ? { promptRenderer: renderer } : {}) });
  }));
  await command.parseAsync(renderer ? argv : [...argv, "--json"], { from: "user" });
  if (!result) throw new Error("The migration handler produced no result");
  return result;
}
