/** Closed classification of tracked lock and canonical-writer version failures. */
import { AdvisoryLockTimeoutError } from "../../advisory-lock.js";
import type { RecordReference } from "../identity.js";
import { refuse } from "./refusals.js";

/** Refuse every stale mutation in one complete digest-check result.
 * @param records - Logical records whose expected content no longer matches.
 * @returns Never; callers can re-read and re-apply those records.
 */
export function staleWrites(records: RecordReference[]): never {
  return refuse({ code: "version-conflict", class: "recoverable", records,
    condition: "The named records' current bytes do not match their expected versions.",
    remedy: { text: "Read each named record and re-apply its intended write against the current version." } });
}
/** Recognize a canonical writer's failure that certifies it did not replace the target.
 * @param error - Rejection from the selected canonical writer.
 * @param reference - Record targeted by that writer.
 * @returns Whether its typed conflict leaves a competing writer's bytes untouched.
 */
export async function isWriterVersionConflict(error: unknown, reference: RecordReference): Promise<boolean> {
  if (reference.kind === "review/candidate") {
    const { CandidateRecordVersionConflictError } = await import("../../work-unit/candidate-record-store.js");
    return error instanceof CandidateRecordVersionConflictError;
  }
  if (reference.kind === "review/integration-boundary") {
    const { SubmissionBoundaryVersionConflictError } = await import("../../work-unit/submission-boundary-store.js");
    return error instanceof SubmissionBoundaryVersionConflictError;
  }
  return reference.kind === "lineage/transition" && typeof error === "object" && error !== null && "code" in error && error.code === "EEXIST";
}
/** Translate the actual advisory timeout class without guessing from an error message.
 * @param operation - Complete tracked lock scope.
 * @returns Its successful result or a recoverable lock refusal.
 */
export async function withTrackedRefusal<T>(operation: () => Promise<T>): Promise<T> {
  try { return await operation(); }
  catch (error) {
    if (!(error instanceof AdvisoryLockTimeoutError) || error.phase !== "acquire") throw error;
    return refuse({ code: "lock-held", class: "recoverable", lock: error.lockPath,
      condition: `The lock remained held for ${error.waitedMs}ms.`,
      remedy: { text: "Wait for the holder to finish or release its lock, then retry the write." } });
  }
}
