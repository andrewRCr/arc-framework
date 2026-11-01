/** Repository-wide execution inventory used only to classify local source pins for cleanup. */
import type { GitCommonStatePublisher } from "../../../../lib/git-common-state.js";
import type { Store } from "../../../../lib/store/contract.js";
import type { LocalSourceSweepDependencies } from "../../core/local-source-sweep.js";
import { ReviewInFlightRecordSchema, composeReviewInFlightState, type ReviewInFlightRecord } from "../../core/in-flight-state-schema.js";
import type { ReviewOperationState } from "../../core/operation-state-schema.js";
import { malformedNativeInFlightRecord, nativeReviewInFlightOperationPart, nativeReviewInFlightRecordName } from "./in-flight-state-store.js";
import { createReviewOutcomePort } from "../../../../lib/store/kinds/review/outcome/access.js";
import { LocalOperationStateStoreError } from "./operation-state-store.js";

/** Read the pinned operations' owners from retained execution records without selecting a command's continuation owner. */
export async function createNativeLocalSourceSweepRecords(input: {
  publisher: GitCommonStatePublisher; store: Store; projectId: () => Promise<string>; operationIds: readonly string[];
}): Promise<Required<Pick<LocalSourceSweepDependencies, "readOperation" | "isComplete">>> {
  const projectId = await input.projectId();
  const pinned = new Set(input.operationIds.map(nativeReviewInFlightOperationPart));
  const records = new Map<string, Array<{ version: number; state: ReviewOperationState; ownerUid: string }>>();
  for (const entry of await input.publisher.snapshot({ root: "review-gate", namespace: "in-flight" })) {
    if (!entry.name.startsWith("operation-") || !pinned.has(entry.name.slice(entry.name.lastIndexOf("-") + 1))) continue;
    if (entry.kind !== "file") throw malformedNativeInFlightRecord(entry.name, "it is not a record file");
    const { record, ownerUid } = parseCleanupRecord(entry.name, entry.content, projectId);
    const matches = records.get(record.operationId) ?? [];
    matches.push({ version: record.version, state: composeReviewInFlightState(record.state), ownerUid });
    records.set(record.operationId, matches);
  }
  return {
    readOperation(operationId) {
      const matches = records.get(operationId) ?? [];
      if (matches.length > 1) return Promise.reject(duplicateOwners(operationId, matches.map(({ ownerUid }) => ownerUid)));
      const [match] = matches;
      return Promise.resolve(match === undefined ? { version: 0, state: null } : { version: match.version, state: match.state });
    },
    async isComplete(state) {
      if (state.workItem?.type !== "work-item" || state.workItem.uid === undefined) {
        throw new Error(`Restore the exact retained owner of local review '${state.operationId}', then retry source cleanup.`);
      }
      return await createReviewOutcomePort(input.store, state.workItem).read(state.operationId) !== null;
    },
  };
}

/** One pinned operation retained under several owners: only finishing all but one of those reviews settles which owns it. */
function duplicateOwners(operationId: string, ownerUids: readonly string[]): LocalOperationStateStoreError {
  return new LocalOperationStateStoreError("malformed-operation-state", `Local review '${operationId}' has retained `
    + `execution records under owners ${ownerUids.join(", ")}; attest or cancel one of them from its owner's checkout, `
    + "then retry source cleanup.");
}

function parseCleanupRecord(name: string, content: string, projectId: string): { record: ReviewInFlightRecord; ownerUid: string } {
  try {
    const record = ReviewInFlightRecordSchema.parse(JSON.parse(content) as unknown), owner = record.state.workItem;
    if (owner.type !== "work-item" || owner.uid === undefined || record.operationId !== record.state.operationId
      || name !== nativeReviewInFlightRecordName(owner.uid, record.operationId)
      || record.state.repositoryId !== projectId) throw new Error("record does not match its filename, admitted owner, or project");
    return { record, ownerUid: owner.uid };
  } catch (error) {
    throw malformedNativeInFlightRecord(name, error instanceof Error ? error.message : String(error));
  }
}

