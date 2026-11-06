/** Exact conventional artifact-name changes for one selected work-item generation. */
import { posix } from "node:path";
import { RecordReferenceSchema, sameOwner } from "./identity.js";
import type { StoreRecord } from "./read.js";
import { lifecycleRecordPath } from "./lifecycle-record-path.js";
import { workUnitMetaPath } from "./lifecycle-write.js";

/** Project the selected owner's artifact basenames before and after its name change. */
export function ownedArtifactRenames(records: readonly StoreRecord[], primary: StoreRecord, target: string): Map<string, string> {
  const renamed = { ...primary, reference: RecordReferenceSchema.parse({ ...primary.reference,
    owner: { ...primary.reference.owner, name: target } }) };
  const names = new Map<string, string>();
  for (const record of records) {
    if (!sameOwner(record.reference.owner, primary.reference.owner)) continue;
    const from = lifecycleRecordPath(primary, record), to = lifecycleRecordPath(renamed, record);
    if (from !== null && to !== null) names.set(posix.relative(posix.dirname(workUnitMetaPath(primary)), from), posix.relative(posix.dirname(workUnitMetaPath(renamed)), to));
  }
  return names;
}
