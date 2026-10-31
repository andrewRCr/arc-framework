/** Repository-wide execution inventory used only to classify local source pins for cleanup. */
import type { GitCommonStatePublisher } from "../../../../lib/git-common-state.js";
import type { Store } from "../../../../lib/store/contract.js";
import type { LocalSourceSweepDependencies } from "../../core/local-source-sweep.js";
import { ReviewInFlightRecordSchema, composeReviewInFlightState, type ReviewInFlightRecord } from "../../core/in-flight-state-schema.js";
import type { ReviewOperationState } from "../../core/operation-state-schema.js";
import { nativeReviewInFlightOperationPart, nativeReviewInFlightRecordName } from "./in-flight-state-store.js";
import { LocalOperationStateStoreError } from "./operation-state-store.js";
import { createReviewOutcomePort } from "../../../../lib/store/kinds/review/outcome/access.js";

/** Read the pinned operations' owners from retained execution records without selecting a command's continuation owner. */
export async function createNativeLocalSourceSweepRecords(input: {
  publisher: GitCommonStatePublisher; store: Store; projectId: () => Promise<string>; operationIds: readonly string[];
}): Promise<Required<Pick<LocalSourceSweepDependencies, "readOperation" | "isComplete">>> {
  const projectId = await input.projectId();
  const pinned = new Set(input.operationIds.map(nativeReviewInFlightOperationPart));
  const records = new Map<string, Array<{ version: number; state: ReviewOperationState }>>();
  for (const entry of await input.publisher.snapshot({ root: "review-gate", namespace: "in-flight" })) {
    if (!entry.name.startsWith("operation-") || !pinned.has(entry.name.slice(entry.name.lastIndexOf("-") + 1))) continue;
    if (entry.kind !== "file") throw malformedRecord(entry.name, "it is not a record file");
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
    throw malformedRecord(name, error instanceof Error ? error.message : String(error));
  }
}

// A damaged pinned record refuses as the repository arm's malformed operation record does, naming the record.
function malformedRecord(name: string, issue: string): LocalOperationStateStoreError {
  return new LocalOperationStateStoreError("malformed-operation-state", `Native execution record '${name}' is malformed: ${issue}. Repair or remove it, then retry.`);
}
