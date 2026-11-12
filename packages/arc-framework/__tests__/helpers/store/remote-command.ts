/** Native remote-command invocations using the registered production operand and option syntax. */
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Command, Option } from "commander";
import { handleStoreRemote, type StoreRemoteOptions } from "../../../src/commands/store-remote.js";
import { scanCommanderSource } from "../../../src/lib/command-input/source-scanner.js";
import { withInteractionContext } from "../../../src/lib/command-input/interaction-context.js";
import type { PromptRenderer } from "../../../src/lib/command-input/prompter.js";
import type { StoreRemoteResult } from "../../../src/lib/store/index.js";
import type { RefStorePorts } from "../../../src/lib/store/ports.js";

const syntax = readFile(resolve(import.meta.dirname, "../../../src/cli.ts"), "utf8").then(sourceText =>
  scanCommanderSource({ file: "cli.ts", sourceText }).commands.find(({ path }) => path === "store remote"));

/** Drive the production handler with CLI-generated input and an optional native ports boundary. */
export async function invokeStoreRemote(argv: string[], input: { cwd: string; renderer?: PromptRenderer; ports?: RefStorePorts }):
Promise<{ result: StoreRemoteResult; output: string; exitCode: number | undefined }> {
  const registered = await syntax;
  if (!registered) throw new Error("The production remote command is absent");
  const command = new Command("remote").exitOverride();
  for (const operand of registered.operands) command.argument(operand.required ? `<${operand.name}>` : `[${operand.name}]`);
  for (const option of registered.options) command.addOption(new Option(option.flags).default(option.defaultValue));
  let result: StoreRemoteResult | undefined, output = "", exitCode: number | undefined;
  command.action(withInteractionContext({ machineReadable: opts => opts.json === true,
    environment: { ci: false, promptInputIsTTY: input.renderer !== undefined, promptOutputIsTTY: input.renderer !== undefined } },
  async (context, remote: string | undefined, role: string | undefined, options: StoreRemoteOptions) => {
    result = await handleStoreRemote(remote, role, options, context, { cwd: input.cwd,
      ...(input.ports ? { ports: input.ports } : {}), ...(input.renderer ? { promptRenderer: input.renderer } : {}),
      write: text => { output += text; }, setExitCode: code => { exitCode = code; } });
  }));
  await command.parseAsync(argv, { from: "user" });
  if (result === undefined) throw new Error("The remote command did not produce a result");
  return { result, output, exitCode };
}
