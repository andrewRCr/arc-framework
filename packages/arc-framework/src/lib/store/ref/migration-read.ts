/** Preserve local failures while giving actual transport reads the public caller's retry route. */

import type { RemoteFailureReason } from "../../kernel/index.js";
import type { Remedy } from "../refusal.js";
import { MigrationRefusal } from "./migrate-refusal.js";

/** Only a reported unreachable transport is recontextualized; local refusals and unknown faults retain their identity. */
export async function readMigrationRemote<T>(remote: string, remedy: Remedy, operation: () => Promise<T>): Promise<T> {
  try { return await operation(); }
  catch (error) {
    if (!(error instanceof MigrationRefusal) || error.refusal.code !== "store" || error.refusal.refusal.code !== "unreachable") throw error;
    const failure = error.refusal.refusal;
    throw migrationReadFailure(remote, failure.condition, failure.cause, remedy);
  }
}

/** Project a transport observation without inventing a retry command on behalf of its caller. */
export function migrationReadFailure(remote: string, condition: string, cause: RemoteFailureReason, remedy: Remedy): MigrationRefusal {
  return new MigrationRefusal({ code: "store", refusal: { code: "unreachable", class: "recoverable", cause,
    condition: `Could not read ${remote}: ${condition}`, remedy } });
}
