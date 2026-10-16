/** Production and injected I/O binding shared by store-backed inbox and queue adapters. */
import { readFile } from "node:fs/promises";
import { createStore, createDefaultStorePorts, type Store } from "../lib/store/index.js";
import { resolveIdentity } from "../lib/git/index.js";
import { createGitExec } from "../lib/io-context.js";
import type { InteractionContext } from "../lib/command-input/interaction-context.js";
import type { InboxContext } from "../lib/inbox/types.js";
import { runDormantStoreCommand, type DormantStoreCommand } from "../commands/store-command-support.js";
import { requireArcProjectRoot } from "./shared.js";

/** Output is injectable without changing the command's runtime result. */
export interface InboxOutput { stdout(text: string): void; stderr(text: string): void; exit(code: number): void }
/** Handler dependencies are grouped so tests and alternate backends bind only the needed seams. */
export interface InboxHandlerPorts {
  store?: Store; cwd?: string; identity?: string; now?: () => Date;
  readFile?: (path: string) => Promise<string>; readStdin?: () => Promise<string>; output?: InboxOutput;
}
/** Default output preserves the CLI's machine/human streams and exit status.
 * @param ports - Optional sink.
 * @returns Invoking adapter's output.
 */
export function inboxOutput(ports: InboxHandlerPorts = {}): InboxOutput {
  return ports.output ?? { stdout: (text) => { process.stdout.write(text); }, stderr: (text) => { process.stderr.write(text); }, exit: (code) => { process.exitCode = code; } };
}
/** Open a store and stop at its dormant arm before reading identity or request bytes.
 * @param command - Exact command being invoked.
 * @param json - Output mode for an unsupported result.
 * @param interaction - Subprocess interaction policy.
 * @param ports - Optional identity/store/request I/O binding.
 * @returns Off-branch service context, or null after a reported refusal.
 */
export async function openInboxRuntime(command: DormantStoreCommand, json: boolean, interaction?: InteractionContext, ports: InboxHandlerPorts = {}): Promise<InboxContext | null> {
  const cwd = ports.cwd ?? requireArcProjectRoot();
  if (cwd === null) return null;
  const baseExec = createGitExec(interaction?.subprocess);
  const exec: typeof baseExec = (program, args, options) => baseExec(program, args, { cwd, ...options });
  const store = ports.store ?? createStore(createDefaultStorePorts({ checkoutRoot: cwd, exec }));
  if (!store.capabilities.stateOffBranch) {
    const result = runDormantStoreCommand(command, store), output = inboxOutput(ports);
    output.exit(1);
    if (json) output.stdout(`${JSON.stringify(result)}\n`);
    else output.stderr(`Error [unsupported]: ${result.refusal.condition} ${result.refusal.remedy.text}\n`);
    return null;
  }
  return { store, identity: ports.identity ?? await resolveIdentity({ exec }) ?? "", now: ports.now ?? (() => new Date()) };
}
/** Read a command's explicitly selected file/stdin request.
 * @param file - UTF-8 file or '-' for stdin.
 * @param ports - Injectable input boundary.
 * @returns Request bytes without interpretation.
 */
export function readInboxCommandInput(file: string, ports: InboxHandlerPorts = {}): Promise<string> {
  return file === "-" ? (ports.readStdin ?? readInboxStdin)() : (ports.readFile ?? ((path) => readFile(path, "utf8")))(file);
}

async function readInboxStdin(): Promise<string> {
  process.stdin.setEncoding("utf8");
  let content = "";
  for await (const chunk of process.stdin) content += String(chunk);
  return content;
}
