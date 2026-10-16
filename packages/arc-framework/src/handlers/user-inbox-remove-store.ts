/** Capability selection and exact ID removal for the drain's inbox command. */
import { createStore, createDefaultStorePorts } from "../lib/store/index.js";
import { resolveIdentity } from "../lib/git/index.js";
import { createGitExec } from "../lib/io-context.js";
import { removeInboxEntry } from "../lib/inbox/removal.js";
import { inboxOutput, type InboxHandlerPorts } from "./inbox-runtime.js";
import type { InteractionContext } from "../lib/command-input/interaction-context.js";
import type { UserInboxRemoveOptions } from "./user-inbox-remove-input.js";
/** Handle the off-branch arm, leaving the legacy title flow to its existing caller.
 * @param literal - Legacy title positional, refused from the flip.
 * @param opts - ID and entry version or legacy file options.
 * @param interaction - Invocation subprocess policy.
 * @param ports - Optional backend and output boundary.
 * @returns Whether this arm emitted the result.
 */
export async function handleStoreInboxRemove(literal: string | undefined, opts: UserInboxRemoveOptions, interaction: InteractionContext | undefined, ports: InboxHandlerPorts): Promise<boolean> {
  const cwd = ports.cwd ?? process.cwd(), exec = createGitExec(interaction?.subprocess);
  const store = ports.store ?? createStore(createDefaultStorePorts({ checkoutRoot: cwd, exec }));
  if (!store.capabilities.stateOffBranch) return rejectLegacyIdOptions(opts, ports);
  const output = inboxOutput(ports);
  if (literal !== undefined || opts.inboxTitleFile !== undefined || opts.inboxEntryFile !== undefined || opts.id === undefined || opts.expectedVersion === undefined) {
    output.stderr("Use arc user inbox-remove --id <id> --expected-version <version>; read arc inbox personal. Title operands are unsupported.\n"); output.exit(1); return true;
  }
  const identity = ports.identity ?? await resolveIdentity({ exec }) ?? "";
  const result = await removeInboxEntry({ list: "personal", id: opts.id, expectedVersion: opts.expectedVersion }, { store, identity, now: ports.now ?? (() => new Date()) });
  output.stdout(`${JSON.stringify(result)}\n`); output.exit(result.status === "ok" ? 0 : 1); return true;
}

function rejectLegacyIdOptions(opts: UserInboxRemoveOptions, ports: InboxHandlerPorts): boolean {
  if (opts.id === undefined && opts.expectedVersion === undefined) return false;
  const output = inboxOutput(ports);
  output.stderr("ID removal requires stateOffBranch; use the title removal form.\n"); output.exit(1); return true;
}
