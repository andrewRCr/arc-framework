/** Repository-wide execution inventory used only to classify local source pins for cleanup. */
import type { GitCommonStatePublisher } from "../../../../lib/git-common-state.js";
import type { Store } from "../../../../lib/store/contract.js";
import type { LocalSourceSweepDependencies } from "../../core/local-source-sweep.js";
import { ReviewInFlightRecordSchema, composeReviewInFlightState, type ReviewInFlightRecord } from "../../core/in-flight-state-schema.js";
import type { ReviewOperationState } from "../../core/operation-state-schema.js";
import { nativeReviewInFlightRecordName } from "./in-flight-state-store.js";
import { createReviewOutcomePort } from "../../../../lib/store/kinds/review/outcome/access.js";

/** Read pin owners from retained execution records without selecting a command's continuation owner. */
export async function createNativeLocalSourceSweepRecords(input: {
  publisher: GitCommonStatePublisher; store: Store; projectId: () => Promise<string>;
}): Promise<Required<Pick<LocalSourceSweepDependencies, "readOperation" | "isComplete">>> {
  const projectId = await input.projectId();
  const records = new Map<string, Array<{ version: number; state: ReviewOperationState }>>();
  for (const entry of await input.publisher.snapshot({ root: "review-gate", namespace: "in-flight" })) {
    if (entry.kind !== "file") throw new Error(`Native execution entry '${entry.name}' is not a record file. Restore it, then retry source cleanup.`);
    const record = parseCleanupRecord(entry.name, entry.content, projectId);
    const matches = records.get(record.operationId) ?? [];
    matches.push({ version: record.version, state: composeReviewInFlightState(record.state) });
    records.set(record.operationId, matches);
  }
  return {
    readOperation(operationId) {
      const matches = records.get(operationId) ?? [];
      if (matches.length > 1) return Promise.reject(new Error(`Resolve the multiple retained owners of local review '${operationId}', then retry source cleanup.`));
      return Promise.resolve(matches[0] ?? { version: 0, state: null });
    },
    async isComplete(state) {
      if (state.workItem?.type !== "work-item" || state.workItem.uid === undefined) {
        throw new Error(`Restore the exact retained owner of local review '${state.operationId}', then retry source cleanup.`);
      }
      return await createReviewOutcomePort(input.store, state.workItem).read(state.operationId) !== null;
    },
  };
}

function parseCleanupRecord(name: string, content: string, projectId: string): ReviewInFlightRecord {
  try {
    const record = ReviewInFlightRecordSchema.parse(JSON.parse(content) as unknown), owner = record.state.workItem;
    if (owner.type !== "work-item" || owner.uid === undefined || record.operationId !== record.state.operationId
      || name !== nativeReviewInFlightRecordName(owner.uid, record.operationId)
      || record.state.repositoryId !== projectId) throw new Error("record does not match its filename, admitted owner, or project");
    return record;
  } catch (error) {
    throw new Error(`Repair native execution record '${name}', then retry source cleanup: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error });
  }
}
