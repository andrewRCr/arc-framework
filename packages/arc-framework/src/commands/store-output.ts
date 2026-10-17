/** Output and dependency binding for explicit ref-store commands. */

import type { StoreMigrateResult, StoreRemoteResult } from "../lib/store/commands.js";
import type { RefStorePorts } from "../lib/store/ports.js";
import type { PromptRenderer } from "../lib/command-input/prompter.js";
import { createExecaGitExec } from "../lib/git/process-executor.js";
import { createStoreCommandPorts } from "./store-ports.js";

/** Native command boundaries may be replaced without replacing the store engine. */
export interface StoreCommandDependencies {
  cwd: string;
  ports: RefStorePorts;
  write(text: string): void;
  setExitCode(code: number): void;
  promptRenderer?: PromptRenderer;
}

/** Bind one invocation's checkout and output streams. */
export async function storeCommandDependencies(overrides: Partial<StoreCommandDependencies>): Promise<StoreCommandDependencies> {
  const cwd = overrides.cwd ?? overrides.ports?.checkoutRoot
    ?? (await createExecaGitExec()("git", ["rev-parse", "--show-toplevel"], { cwd: process.cwd() })).stdout.trim();
  return { cwd, ports: overrides.ports ?? createStoreCommandPorts(cwd),
    write: (text) => { process.stdout.write(text); }, setExitCode: (code) => { process.exitCode = code; }, ...overrides };
}

/** Invalid supplied input remains a typed terminal result in every output mode. */
export function invalidStoreCommand(command: "remote" | "migrate", condition: string): Extract<StoreRemoteResult, { status: "refused" }> {
  return { status: "refused", refusal: { code: "request-invalid", class: "terminal", condition,
    remedy: { text: `Use arc store ${command} --help to correct the input, then retry.`, argv: ["arc", "store", command, "--help"] } } };
}

/** Preserve the complete result in machine mode and explain typed stops in terminal output. */
export function renderStoreCommand(result: StoreRemoteResult | StoreMigrateResult, json: boolean,
  io: Pick<StoreCommandDependencies, "write" | "setExitCode">): void {
  if (json) io.write(`${JSON.stringify(result)}\n`);
  else if (result.status === "refused") {
    const refusal = result.refusal.code === "store" ? result.refusal.refusal : result.refusal;
    io.write(`${refusal.code}: ${refusal.condition}\n${refusal.remedy.text}\n`);
  } else if (result.status === "confirmation-needed") io.write(`${result.condition}\n${result.remedy.text}\n`);
  else if (result.status === "designation-needed") io.write(`Choose a state role for ${result.remote}.\n${result.remedy.text}\n`);
  else if ("remotes" in result.result) {
    io.write(`Layout: ${result.result.layout}\n`);
    for (const remote of result.result.remotes) io.write(`${remote.name} (${remote.repository}): ${remote.role ?? "undesignated"} ${remote.url}\n`);
    if (result.result.report) io.write(`${JSON.stringify(result.result.report, null, 2)}\n`);
  } else io.write(`${JSON.stringify(result.result, null, 2)}\n`);
  io.setExitCode(result.status === "ok" ? 0 : 1);
}
