/** Passive registry-presence observations with an independently cancellable network bound. */

import { gitFailureText, isGitProcessError } from "../../git/process-error.js";
import { classifyRemoteFailure, DEFAULT_NETWORK_TIMEOUT_MS, PASSIVE_REMOTE_INTERACTION } from "../../git/remote-ref-reader.js";
import type { RemoteFailureReason } from "../../kernel/index.js";
import type { RefBackendContext } from "./context.js";

/** Presence is distinct from a transport failure that cannot decide a designation. */
export type RefRegistryPresence = { status: "ok"; present: boolean }
  | { status: "unreachable"; cause: RemoteFailureReason; condition: string };

/** Query exactly the registry ref without fetching objects or borrowing the operation's full deadline. */
export async function readRefRegistryPresence(context: RefBackendContext, remote: string): Promise<RefRegistryPresence> {
  const timer = new AbortController(), read = new AbortController();
  const bound = context.sleep.bound(DEFAULT_NETWORK_TIMEOUT_MS, timer.signal).then(() => { if (!timer.signal.aborted) read.abort(); });
  const source = context.repository?.source ?? context;
  try {
    const { stdout } = await source.exec("git", ["ls-remote", "--refs", "--", remote, "refs/arc/project/registry"], {
      cwd: source.checkoutRoot, signal: read.signal,
      interaction: PASSIVE_REMOTE_INTERACTION, diagnosticLocale: "stable",
    });
    return { status: "ok", present: stdout.split(/\r?\n/u).some((line) => line.split("\t")[1] === "refs/arc/project/registry") };
  } catch (error) {
    if (!isGitProcessError(error)) throw error;
    return { status: "unreachable", cause: read.signal.aborted || context.syncDeadline?.signal.aborted ? "timeout" : classifyRemoteFailure(error),
      condition: gitFailureText(error) || "The remote's registry presence could not be read." };
  } finally { timer.abort(); await bound; }
}
