/** Validate a proposed state publisher before changing clone-local settings. */

import type { StoreRemoteResult } from "../commands.js";
import { RecordReferenceSchema } from "../identity.js";
import type { RefBackendContext } from "./context.js";
import type { RefDesignation, RefRemoteDesignation } from "./designation.js";
import { checkRefDesignationProject } from "./designation-project.js";
import { withRefSyncDeadline } from "./sync-deadline.js";

/** Preserve the candidate check's refusal without changing any role. */
export async function checkRemoteProject(context: RefBackendContext, remote: RefRemoteDesignation,
  designation: RefDesignation): Promise<Extract<StoreRemoteResult, { status: "refused" }> | undefined> {
  const check = await withRefSyncDeadline(context, (scoped) => checkRefDesignationProject(scoped, remote, designation));
  if (check.status === "failed") return { status: "refused", refusal: { code: "store", refusal: check.failure } };
  if (check.status === "identity-mismatch") return { status: "refused", refusal: { code: "store", refusal: {
    code: "identity-mismatch", class: "recoverable",
    expected: RecordReferenceSchema.parse({ kind: "project-registry/identity", owner: { type: "project", name: "project", uid: check.local } }),
    actual: RecordReferenceSchema.parse({ kind: "project-registry/identity", owner: { type: "project", name: "project", uid: check.remote } }),
    condition: `Remote ${remote.name} belongs to project ${check.remote}; this store belongs to ${check.local}.`,
    remedy: { text: "Choose the remote for this project, then retry; no role was set." },
  } } };
}
