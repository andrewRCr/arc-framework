/** Shared projection of supplied base prerequisites onto cleanup-facing remote evidence. */

import type { HistoryCompletenessResult } from "../git/history-completeness.js";
import type { ObjectAvailabilityResult } from "../git/object-availability.js";
import type { RemoteHeadSnapshotResult } from "../git/remote-ref-reader.js";
import type { RemoteEvidence, RemoteFailureReason } from "../kernel/index.js";

/** Supplied prerequisites shared by cleanup and retirement analyzers. */
export interface CleanupBaseEvidence {
  remoteSyncEnabled: boolean;
  snapshot: RemoteHeadSnapshotResult;
  objectAvailability: ObjectAvailabilityResult;
  history: HistoryCompletenessResult;
}

/** Evidence fields carried at the top level of every cleanup-facing result. */
export type CleanupRemoteEvidence =
  | { remoteEvidence: Exclude<RemoteEvidence, "unreachable"> }
  | { remoteEvidence: "unreachable"; failureReason: RemoteFailureReason };

/** Project supplied base prerequisites into the shared public evidence vocabulary. */
export function projectCleanupRemoteEvidence(
  baseBranch: string,
  evidence: CleanupBaseEvidence | undefined,
): CleanupRemoteEvidence {
  if (evidence === undefined || !evidence.remoteSyncEnabled) return { remoteEvidence: "not-applicable" };
  if (evidence.snapshot.kind === "unreachable") {
    return { remoteEvidence: "unreachable", failureReason: evidence.snapshot.failureReason };
  }
  const baseOid = evidence.snapshot.tips[baseBranch];
  if (baseOid === undefined) return { remoteEvidence: "exact" };
  if (evidence.objectAvailability.kind !== "complete") {
    throw new Error("Cleanup object availability could not be inspected.");
  }
  const baseCommitIsLocal = evidence.objectAvailability.commits[baseOid];
  if (baseCommitIsLocal === undefined) {
    throw new Error("The advertised base commit has no local availability fact.");
  }
  return { remoteEvidence: baseCommitIsLocal ? "exact" : "pending-fetch" };
}
