/** CLI boundary for store-backed inbox listings. */
import type { InteractionContext } from "../lib/command-input/interaction-context.js";
import { InboxResultSchema } from "../lib/inbox/types.js";
import { listInbox } from "../lib/inbox/listing.js";
import { openInboxRuntime, inboxOutput, type InboxHandlerPorts } from "./inbox-runtime.js";
/** Inbox listing options. */
export interface InboxOptions { target?: string; json?: boolean }
/** List one semantic inbox once the store capability flips.
 * @param list - Personal, project, or a work-item name.
 * @param options - Target filter and output mode.
 * @param interaction - Interaction policy.
 * @param ports - Optional service and output binding.
 */
export async function handleInbox(list: string, options: InboxOptions, interaction?: InteractionContext, ports: InboxHandlerPorts = {}): Promise<void> {
  const context = await openInboxRuntime("inbox", options.json === true, interaction, ports);
  if (context === null) return;
  const result = InboxResultSchema.parse(await listInbox({ list, target: options.target }, context));
  const output = inboxOutput(ports);
  output.exit(result.state === "refused" ? 1 : 0);
  if (options.json) output.stdout(`${JSON.stringify(result)}\n`);
  else if (result.state === "refused") output.stderr(`Error [${result.code}]: ${result.reason} ${result.remedy.text}\n`);
  else output.stdout(result.entries.length ? `${result.entries.map((row) => `${row.id} ${row.version} ${row.title}${row.survivor === undefined ? "" : ` (survivor: ${row.survivor.home.list})`}`).join("\n")}\n${result.retriage?.text ?? ""}` : "No inbox entries.\n");
}
