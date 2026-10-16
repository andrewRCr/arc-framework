/** CLI boundary for the person's reference-based Errand queue. */
import type { InteractionContext } from "../lib/command-input/interaction-context.js";
import { listErrandQueue, setErrandQueue, ErrandQueueResultSchema, type ErrandQueueResult } from "../lib/inbox/queue.js";
import { openInboxRuntime, readInboxCommandInput, inboxOutput, type InboxHandlerPorts } from "./inbox-runtime.js";
/** List the queue once the store capability flips.
 * @param options - Output mode.
 * @param interaction - Interaction policy.
 * @param ports - Optional service/runtime binding.
 */
export async function handleErrandQueue(options: { json?: boolean }, interaction?: InteractionContext, ports: InboxHandlerPorts = {}): Promise<void> {
  const context = await openInboxRuntime("errand queue", options.json === true, interaction, ports);
  if (context === null) return;
  emitQueue(ErrandQueueResultSchema.parse(await listErrandQueue(context)), options.json === true, ports);
}
/** Replace the whole queue from a versioned request once the capability flips.
 * @param file - File path or explicit stdin marker.
 * @param interaction - Interaction policy.
 * @param ports - Optional service/request/output binding.
 */
export async function handleErrandQueueSet(file: string, interaction?: InteractionContext, ports: InboxHandlerPorts = {}): Promise<void> {
  const context = await openInboxRuntime("errand queue set", true, interaction, ports);
  if (context === null) return;
  let request: unknown;
  try { request = JSON.parse(await readInboxCommandInput(file, ports)); }
  catch (error) {
    emitQueue({ schemaVersion: 1, mode: "errand-queue", state: "refused", code: "invalid-input", reason: error instanceof Error ? error.message : String(error), remedy: { text: "Supply a valid versioned JSON queue request from a file or stdin." } }, true, ports);
    return;
  }
  emitQueue(ErrandQueueResultSchema.parse(await setErrandQueue(request, context)), true, ports);
}

function emitQueue(result: ErrandQueueResult, json: boolean, ports: InboxHandlerPorts): void {
  const output = inboxOutput(ports);
  output.exit(result.state === "refused" ? 1 : 0);
  if (json) output.stdout(`${JSON.stringify(result)}\n`);
  else if (result.state === "refused") output.stderr(`Error [${result.code}]: ${result.reason} ${result.remedy.text}\n`);
  else output.stdout(result.members.length ? `${result.members.map((member) => `${member.inbox}:${member.id} ${member.title}`).join("\n")}\n` : "The execution queue is empty.\n");
}
