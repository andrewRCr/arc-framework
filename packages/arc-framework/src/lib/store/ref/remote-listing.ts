/** Passive, bounded listings of a remote's refs, read with stable diagnostics and never prompting. */

import { isGitObjectId } from "../../git/object-id.js";
import { gitFailureText, normalizeGitRejection } from "../../git/process-error.js";
import { classifyRemoteFailure, DEFAULT_NETWORK_TIMEOUT_MS, PASSIVE_REMOTE_INTERACTION } from "../../git/remote-ref-reader.js";
import type { RemoteFailureReason } from "../../kernel/index.js";
import type { RefBackendContext } from "./context.js";

/** The tips a remote lists, or why the listing decides nothing. */
export type RemoteRefListing = { status: "ok"; tips: Map<string, string> }
  | { status: "unreachable"; cause: RemoteFailureReason; condition: string };

/** List the refs matching the patterns on a remote name or URL, within the network bound and any sync deadline the context carries. */
export async function listRemoteRefs(context: RefBackendContext, remote: string, patterns: readonly string[]): Promise<RemoteRefListing> {
  const args = ["ls-remote", "--refs", "--", remote, ...patterns];
  const timer = new AbortController(), read = new AbortController();
  const bound = context.sleep.bound(DEFAULT_NETWORK_TIMEOUT_MS, timer.signal).then(() => { if (!timer.signal.aborted) read.abort(); });
  try {
    const { stdout } = await context.exec("git", args, {
      cwd: context.checkoutRoot, signal: read.signal, interaction: PASSIVE_REMOTE_INTERACTION, diagnosticLocale: "stable",
    });
    return parseListing(stdout);
  } catch (error) {
    const failure = normalizeGitRejection(error, { command: "git", args });
    if (failure.kind === "unexpected") throw error;
    if (failure.kind === "spawn-failure") throw failure;
    const condition = gitFailureText(failure) || `The refs at ${remote} could not be listed.`;
    return { status: "unreachable", cause: read.signal.aborted || context.syncDeadline?.signal.aborted ? "timeout" : classifyRemoteFailure(failure),
      condition: failure.descendantsUnconfirmed ? `${failure.message}\n${condition}` : condition };
  } finally { timer.abort(); await bound; }
}

function parseListing(stdout: string): RemoteRefListing {
  const tips = new Map<string, string>();
  for (const line of stdout.split(/\r?\n/u).filter(Boolean)) {
    const [tip, ref, extra] = line.split("\t");
    if (!tip || !isGitObjectId(tip) || !ref || extra !== undefined || tips.has(ref)) {
      return { status: "unreachable", cause: "error", condition: `The remote returned a malformed ref listing line: ${line}` };
    }
    tips.set(ref, tip);
  }
  return { status: "ok", tips };
}
