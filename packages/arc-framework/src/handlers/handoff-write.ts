/** CLI boundary for writing anchored session handoff state. */
import type { InteractionContext } from "../lib/command-input/interaction-context.js";
import { readFile } from "node:fs/promises";
import { createStore } from "../lib/store/create.js";
import { createDefaultStorePorts } from "../lib/store/default-ports.js";
import type { Store } from "../lib/store/contract.js";
import type { StoreSyncPort } from "../lib/store/operational-sync.js";
import { createGitExec } from "../lib/io-context.js";
import { runHandoffWrite } from "../lib/handoff/write.js";
import { HandoffWriteResultSchema } from "../lib/handoff/write-schema.js";
import { runDormantStoreCommand } from "../commands/store-command-support.js";
import { requireArcProjectRoot } from "./shared.js";
/** Write a versioned handoff request once the store capability flips.
 * @param file - File path or explicit stdin marker.
 * @param context - Interaction policy.
 * @param selected - Invocation-scoped store and optional synchronization binding.
 */
export async function handleHandoffWrite(file: string, context?: InteractionContext, selected: { store?: Store; sync?: StoreSyncPort } = {}): Promise<void> {
  const cwd = requireArcProjectRoot();
  if (cwd === null) return;
  const exec = createGitExec(context?.subprocess);
  const store = selected.store ?? createStore(createDefaultStorePorts({ checkoutRoot: cwd, exec }));
  if (!store.capabilities.stateOffBranch) {
    process.exitCode = 1;
    process.stdout.write(`${JSON.stringify(runDormantStoreCommand("handoff write", store))}\n`);
    return;
  }
  let request: unknown;
  try { request = JSON.parse(file === "-" ? await readStdin() : await readFile(file, "utf8")); }
  catch (error) {
    process.exitCode = 1;
    process.stdout.write(`${JSON.stringify(HandoffWriteResultSchema.parse({ status: "refused", refusal: { code: "invalid-handoff-request", class: "recoverable",
      condition: `Cannot read the handoff request: ${error instanceof Error ? error.message : String(error)}`,
      remedy: { text: "Supply a JSON request matching arc schema get handoff-write-request, then retry." } } }))}\n`);
    return;
  }
  const result = HandoffWriteResultSchema.parse(await runHandoffWrite({ cwd, request, store, exec,
    ...(selected.sync === undefined ? {} : { sync: selected.sync }) }));
  if (result.status === "refused") process.exitCode = 1;
  process.stdout.write(`${JSON.stringify(result)}\n`);
}
async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
  return Buffer.concat(chunks).toString("utf8");
}
