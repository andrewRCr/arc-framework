/** Passive registry-presence observations with an independently cancellable network bound. */

import type { RemoteFailureReason } from "../../kernel/index.js";
import type { RefBackendContext } from "./context.js";
import { listRemoteRefs } from "./remote-listing.js";

/** Presence is distinct from a transport failure that cannot decide a designation. */
export type RefRegistryPresence = { status: "ok"; present: boolean }
  | { status: "unreachable"; cause: RemoteFailureReason; condition: string };

/** Query exactly the registry ref without fetching objects or borrowing the operation's full deadline. */
export async function readRefRegistryPresence(context: RefBackendContext, remote: string): Promise<RefRegistryPresence> {
  const listed = await listRemoteRefs(context.repository?.source ?? context, remote, ["refs/arc/project/registry"]);
  return listed.status === "ok" ? { status: "ok", present: listed.tips.has("refs/arc/project/registry") } : listed;
}
