/** Terminal answers use the real remote command syntax and native store ports. */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { Command, Option } from "commander";
import { expect, it } from "vitest";
import { handleStoreRemote, type StoreRemoteOptions } from "../../src/commands/store-remote.js";
import { scanCommanderSource } from "../../src/lib/command-input/source-scanner.js";
import { withInteractionContext } from "../../src/lib/command-input/interaction-context.js";
import type { PromptRenderer } from "../../src/lib/command-input/prompter.js";
import type { StoreRemoteResult } from "../../src/lib/store/commands.js";
import { refSyncFixture } from "../helpers/store/ref-sync.js";

async function invokeRemote(argv: string[], cwd: string, renderer: PromptRenderer) {
  const sourceText = await readFile(resolve(import.meta.dirname, "../../src/cli.ts"), "utf8");
  const syntax = scanCommanderSource({ file: "cli.ts", sourceText }).commands.find(({ path }) => path === "store remote");
  if (!syntax) throw new Error("The production remote command is absent");
  const command = new Command("remote").exitOverride();
  for (const operand of syntax.operands) command.argument(operand.required ? `<${operand.name}>` : `[${operand.name}]`);
  for (const option of syntax.options) command.addOption(new Option(option.flags).default(option.defaultValue));
  let result: StoreRemoteResult | undefined, output = "", exitCode: number | undefined;
  command.action(withInteractionContext({ machineReadable: (opts) => opts.json === true,
    environment: { ci: false, promptInputIsTTY: true, promptOutputIsTTY: true } },
  async (context, remote: string | undefined, role: string | undefined, options: StoreRemoteOptions) => {
    result = await handleStoreRemote(remote, role, options, context, { cwd, promptRenderer: renderer,
      write: (text) => { output += text; }, setExitCode: (code) => { exitCode = code; } });
  }));
  await command.parseAsync(argv, { from: "user" });
  return { result, output, exitCode };
}

it.each([true, false, "cancelled"] as const)("applies only an affirmative terminal answer (%s)", async (answer) => {
  const h = await refSyncFixture();
  await h.a.exec("git", ["config", "remote.origin.arc-state", "off"]);
  await mkdir(join(h.a.root, ".arc", "system"), { recursive: true });
  await writeFile(join(h.a.root, ".arc", "system", "arc-config.yml"), `storage.backing_repository: ${JSON.stringify(h.origin)}\n`);
  let displayed = "";
  const unexpected = async (): Promise<never> => { throw new Error("Unexpected prompt form"); };
  const renderer: PromptRenderer = { text: unexpected, select: unexpected, multiselect: unexpected,
    confirm: async (_context, question) => {
      displayed += question.message;
      return answer === "cancelled" ? { kind: "cancelled" } : { kind: "answered", value: answer };
    } };
  const result = await invokeRemote(["origin", "push"], h.a.root, renderer);
  expect(result.result?.status, JSON.stringify(result)).toBe("ok");
  expect(result.exitCode).toBe(0);
  expect(displayed).toContain(h.origin);
  expect(displayed).toContain("everything");
  expect((await h.a.exec("git", ["config", "remote.origin.arc-state"])).stdout).toBe(answer === true ? "push" : "off");
  expect((await h.remote("git", ["for-each-ref", "--format=%(refname)", "refs/arc/"])).stdout).toBe("");
});
