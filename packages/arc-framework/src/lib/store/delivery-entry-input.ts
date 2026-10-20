/** Stored metadata authority and reporting coordinates for read-only delivery inspection. */
import type { Store } from "./contract.js";
import type { StoreRecord } from "./read.js";
import type { StoreResult } from "./refusal.js";
import { recordReferences, type OwnerIdentity } from "./identity.js";
import { readWorkUnit, readLifecycleMetaFields } from "./lifecycle-write.js";
import { WorkUnitReadPlacementSchema } from "./placement.js";
import { workItemArtifactPath } from "./lifecycle-storage.js";
import { describeRecordConflicts } from "./conflict-diagnostics.js";

/** Exact work-item generation and its task kind's projected path, never a file-read authority. */
export interface StoredDeliveryEntryInput { primary: StoreRecord; taskListPath: string }

/** Read delivery's selected primary and require a task-list binding without following a metadata path. */
export async function readStoredDeliveryEntryInput(store: Store, name: string,
  owner?: OwnerIdentity): Promise<StoreResult<StoredDeliveryEntryInput>> {
  const read = owner === undefined ? await readWorkUnit(store, name)
    : await store.read({ reference: recordReferences["work-item/meta"](owner) });
  if (read.status === "refused") return read;
  const primary = read.result, fields = readLifecycleMetaFields(primary);
  if (fields.status === "refused") return fields;
  if (fields.result.taskList === null || primary.conflicts.length > 0) return { status: "refused", refusal: {
    code: "record-malformed", class: "recoverable", reference: primary.reference, rule: "delivery.task-list-binding",
    condition: fields.result.taskList === null ? "Task list unavailable" : `Delivery metadata has unresolved conflicts.${describeRecordConflicts(primary.conflicts)}`,
    remedy: { text: "Restore the work unit's task-list binding and resolve any named metadata conflicts, then retry inspection." },
  } };
  return { status: "ok", result: { primary, taskListPath: workItemArtifactPath(primary.reference.owner.name, "tasks",
    WorkUnitReadPlacementSchema.parse(primary.placement), fields.result.cohort) } };
}
