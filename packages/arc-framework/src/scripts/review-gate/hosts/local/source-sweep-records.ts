/** Repository-wide execution inventory used only to classify local source pins for cleanup. */
import type { GitCommonStatePublisher } from "../../../../lib/git-common-state.js";
import type { Store } from "../../../../lib/store/contract.js";
import type { LocalSourceSweepDependencies } from "../../core/local-source-sweep.js";
import { ReviewInFlightRecordSchema, composeReviewInFlightState, type ReviewInFlightRecord } from "../../core/in-flight-state-schema.js";
import type { ReviewOperationState, LocalReviewState } from "../../core/operation-state-schema.js";
import { malformedNativeInFlightRecord, nativeReviewInFlightOperationPart, nativeReviewInFlightRecordName } from "./in-flight-state-store.js";
import { createReviewOutcomePort } from "../../../../lib/store/kinds/review/outcome/access.js";
import { LocalOperationStateStoreError } from "./operation-state-store.js";
import { bindNativeReviewOperationReference } from "../../core/review-operation-reference.js";

type RetainedOperation = { version: number; state: ReviewOperationState; ownerUid: string;
  owner: ReviewInFlightRecord["state"]["workItem"] };

/** Read the pinned operations' owners from retained execution records without selecting a command's continuation owner. */
export async function createNativeLocalSourceSweepRecords(input: {
  publisher: GitCommonStatePublisher; store: Store; projectId: () => Promise<string>; operationIds: readonly string[];
}): Promise<Required<Pick<LocalSourceSweepDependencies, "readOperation" | "isComplete">> & {
  canRelease(operationId: string): Promise<boolean>;
}> {
  const projectId = await input.projectId();
  const pinned = new Set(input.operationIds.map(nativeReviewInFlightOperationPart));
  const records = new Map<string, RetainedOperation[]>();
  for (const entry of await input.publisher.snapshot({ root: "review-gate", namespace: "in-flight" })) {
    if (!entry.name.startsWith("operation-") || !pinned.has(entry.name.slice(entry.name.lastIndexOf("-") + 1))) continue;
    if (entry.kind !== "file") throw malformedNativeInFlightRecord(entry.name, "it is not a record file");
    const { record, ownerUid } = parseCleanupRecord(entry.name, entry.content, projectId);
    const matches = records.get(record.operationId) ?? [];
    matches.push({ version: record.version, state: composeReviewInFlightState(record.state), ownerUid, owner: record.state.workItem });
    records.set(record.operationId, matches);
  }
  const isComplete = async (state: LocalReviewState): Promise<boolean> => {
    if (state.workItem?.type !== "work-item" || state.workItem.uid === undefined) {
      throw new Error(`Restore the exact retained owner of local review '${state.operationId}', then retry source cleanup.`);
    }
    return await createReviewOutcomePort(input.store, state.workItem).read(state.operationId) !== null;
  };
  const unfinished = async (operationId: string): Promise<RetainedOperation[]> => {
    const retained: RetainedOperation[] = [];
    for (const match of records.get(operationId) ?? []) {
      if (match.state.kind !== "local-review" || !await isComplete(match.state)) retained.push(match);
    }
    return retained;
  };
  return {
    async readOperation(operationId) {
      const matches = records.get(operationId) ?? [];
      const pending = await unfinished(operationId);
      if (pending.length > 1) throw duplicateOwners(operationId, pending, projectId);
      const match = pending[0] ?? matches[0];
      return match === undefined ? { version: 0, state: null } : { version: match.version, state: match.state };
    },
    isComplete,
    canRelease: async operationId => (await unfinished(operationId)).length === 0,
  };
}

/** Name ordinary terminal commands that safely settle each pending retained owner. */
function duplicateOwners(operationId: string, matches: readonly RetainedOperation[], repositoryId: string): LocalOperationStateStoreError {
  const requests = matches.map(({ owner }) => JSON.stringify({ schemaVersion: 1, operationId,
    operationRef: bindNativeReviewOperationReference({ repositoryId, workItem: owner, operationId }) }));
  return new LocalOperationStateStoreError("malformed-operation-state", `Local review '${operationId}' has retained `
    + `unfinished execution records under owners ${matches.map(({ ownerUid }) => ownerUid).join(", ")}. `
    + "Finish each owner's review with arc review local attest -, or cancel it with arc review local cancel - using "
    + `its exact request: ${requests.join("; ")}. The shared source stays until the last review completes; then retry source cleanup.`);
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

