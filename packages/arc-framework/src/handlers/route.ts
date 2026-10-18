/** CLI boundary for atomic entry routing and insertion. */
import type { InteractionContext } from "../lib/command-input/interaction-context.js";
import { routeEntry, RouteResultSchema, type RouteResult } from "../lib/inbox/route.js";
import { openInboxRuntime, readInboxCommandInput, inboxOutput, type InboxHandlerPorts } from "./inbox-runtime.js";
/** Source/version are supplied for a move; insertion reads the entry from stdin. */
export interface RouteOptions { from?: string; expectedVersion?: string; to: string; section?: string }
/** Move or insert an entry after the store capability flips.
 * @param entryId - Existing entry identity, absent for insertion.
 * @param options - Source, observed version, and destination.
 * @param interaction - Interaction policy.
 * @param ports - Optional store, request, identity and output binding.
 */
export async function handleRoute(entryId: string | undefined, options: RouteOptions, interaction?: InteractionContext, ports: InboxHandlerPorts = {}): Promise<void> {
  const context = await openInboxRuntime({ name: "route" }, true, interaction, ports);
  if (context === null) return;
  let content: string | undefined;
  try { content = entryId === undefined ? await readInboxCommandInput("-", ports) : undefined; }
  catch (error) {
    emitRoute({ schemaVersion: 1, mode: "route", state: "refused", code: "input-unavailable", reason: error instanceof Error ? error.message : String(error), remedy: { text: "Supply the entry on stdin or repair the reported input failure, then retry." } }, ports);
    return;
  }
  emitRoute(RouteResultSchema.parse(await routeEntry({ ...options, entryId, content }, context)), ports);
}

function emitRoute(result: RouteResult, ports: InboxHandlerPorts): void {
  const output = inboxOutput(ports);
  output.exit(result.state === "refused" ? 1 : 0);
  output.stdout(`${JSON.stringify(result)}\n`);
}
