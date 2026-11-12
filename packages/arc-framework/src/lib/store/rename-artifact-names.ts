/** Exact conventional artifact-name changes for one selected work-item generation. */
import { sameOwner } from "./identity.js";
import type { StoreRecord } from "./read.js";
import { lifecycleRecordName } from "./lifecycle-record-path.js";

/** Project the selected owner's artifact basenames before and after its name change. */
export function ownedArtifactRenames(records: readonly StoreRecord[], primary: StoreRecord, target: string): Map<string, string> {
  const names = new Map<string, string>();
  for (const record of records) {
    if (!sameOwner(record.reference.owner, primary.reference.owner)) continue;
    const from = lifecycleRecordName(primary.reference.owner.name, record), to = lifecycleRecordName(target, record);
    if (from !== null && to !== null) names.set(from, to);
  }
  return names;
}

/** Project the same group-relative filename used by preparation's virtual reference sweep. */
export function renameSweepFilename(records: readonly StoreRecord[], primary: StoreRecord, record: StoreRecord): string {
  const own = sameOwner(record.reference.owner, primary.reference.owner);
  const groupPrimary = own ? primary : records.find(candidate => candidate.reference.kind === "work-item/meta"
    && sameOwner(candidate.reference.owner, record.reference.owner));
  const name = groupPrimary === undefined ? null : lifecycleRecordName(groupPrimary.reference.owner.name, record);
  return name ?? `${record.reference.kind.replaceAll("/", "-")}-${record.reference.owner.name}.md`;
}
