/** Shared CLI opening and refusal rendering for capability-gated store verbs. */
import { runDormantStoreCommand, type DormantStoreCommand } from "../commands/store-command-support.js";
import { createStore, createDefaultStorePorts } from "../lib/store/index.js";
import { createGitExec } from "../lib/io-context.js";
import type { InteractionContext } from "../lib/command-input/interaction-context.js";
import { requireArcProjectRoot } from "./shared.js";

/** Open the entering checkout's store and report its unsupported command arm.
 * @param command - Exact command path.
 * @param json - Whether to emit one machine-readable refusal.
 * @param context - Interaction policy for subprocesses.
 */
export function handleDormantStoreCommand(command: DormantStoreCommand, json: boolean, context?: InteractionContext): Promise<void> {
  const cwd = requireArcProjectRoot();
  if (cwd === null) return Promise.resolve();
  const store = createStore(createDefaultStorePorts({ checkoutRoot: cwd, exec: createGitExec(context?.subprocess) }));
  const result = runDormantStoreCommand(command, store);
  process.exitCode = 1;
  if (json) process.stdout.write(`${JSON.stringify(result)}\n`);
  else process.stderr.write(`Error [unsupported]: ${result.refusal.condition} ${result.refusal.remedy.text}\n`);
  return Promise.resolve();
}
