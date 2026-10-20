/** Open-conflict refusals for records consumed by decomposition decisions. */
import type { DecomposeOriginRecords } from "./acquire-origin.js";
import type { DecomposeRefusal } from "./refusal.js";
import { decomposeStoreRefusal } from "./refusal.js";
import { readLifecycleMetaFields } from "../store/lifecycle-write.js";
import { familyOf } from "../store/catalog.js";
import type { StoreRecord } from "../store/read.js";
import type { RecordReference } from "../store/identity.js";

/** Projection repair available for source conflicts in the registered command surface. */
export const DECOMPOSE_SOURCE_CONFLICT_REMEDY = "Resolve the named conflict's markers in the projecting file and let write-back persist that resolution, then retry the selected mode.";

/** Name source conflicts before an origin meta conflict can hide behind incomplete inventory. */
export function checkDecomposeSourceConflicts(input: Pick<DecomposeOriginRecords, "primary" | "artifacts">): DecomposeRefusal | undefined {
  const meta = readLifecycleMetaFields(input.primary);
  if (meta.status === "refused") return decomposeStoreRefusal(meta.refusal);
  const active = input.primary.placement?.kind === "active" && meta.result.state === "Active";
  const source = input.artifacts.filter(artifact => !active || meta.result.design.includes(artifact.basename));
  const records = [input.primary, ...source.map(artifact => artifact.record)];
  const conflicts = checkDecomposeRecordConflicts(records, "source", DECOMPOSE_SOURCE_CONFLICT_REMEDY);
  return conflicts === undefined ? undefined : { ...conflicts, reason: "source-conflict" };
}

/** Refuse disputed content with the consuming operation's applicable recovery policy. */
export function checkDecomposeRecordConflicts(records: readonly StoreRecord[], subject: string, remedy: string): DecomposeRefusal | undefined {
  const conflicts = records.flatMap(record => record.conflicts.map(reference => ({
    token: conflictToken(reference),
    subject: JSON.stringify(record.reference),
  })));
  if (conflicts.length === 0) return undefined;
  return { status: "refused", reason: "record-conflict", class: "recoverable", locus: conflicts[0]?.token,
    message: `Open ${subject} conflicts: ${conflicts.map(conflict => `${conflict.token} on ${conflict.subject}`).join("; ")}.`,
    remedy: { text: remedy } };
}

function conflictToken(reference: RecordReference): string {
  if (typeof reference.key !== "string") throw new Error("A conflict reference must carry a string ID.");
  return `${familyOf(reference.kind)}/${reference.owner.type}/${reference.owner.name}/${reference.key}`;
}
