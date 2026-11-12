/** Strict nonmutating record evidence evaluated inside a backend's atomic admission boundary. */
import type { Store } from "./contract.js";
import type { StoreRecord } from "./read.js";
import type { RecordObservation } from "./write.js";
import type { StoreResult } from "./refusal.js";
import { sameReference, type RecordReference } from "./identity.js";
import { sortByCanonicalBytes } from "../kernel/canonical/canonical-json.js";

/** Canonical approval bytes treat conflict-reference order as immaterial. */
export function canonicalRecordObservations(observations: readonly RecordObservation[]): RecordObservation[] {
  return sortByCanonicalBytes(observations.map(item => ({ reference: item.reference,
    expected: item.expected === null ? null : { version: item.expected.version,
      conflicts: sortByCanonicalBytes(item.expected.conflicts) } })));
}

/** Capture each selected version and its independently derived conflict set. */
export function observeRecords(records: readonly StoreRecord[]): RecordObservation[] {
  return records.map(record => ({ reference: record.reference,
    expected: { version: record.version, conflicts: [...record.conflicts] } }));
}

/** Compare evidence after backend reference admission has established each readable namespace and identity. */
export async function checkRecordObservations(before: Pick<Store, "read">,
  observations: readonly RecordObservation[]): Promise<StoreResult<true>> {
  const mismatches: RecordReference[] = [];
  for (const observation of observations) {
    const current = await before.read({ reference: observation.reference });
    if (current.status === "refused") {
      if (current.refusal.code !== "not-found") return current;
      if (observation.expected !== null) mismatches.push(observation.reference);
      continue;
    }
    const expected = observation.expected;
    if (expected === null || expected.version !== current.result.version
      || !sameConflicts(expected.conflicts, current.result.conflicts)) mismatches.push(observation.reference);
  }
  return mismatches.length === 0 ? { status: "ok", result: true } : { status: "refused", refusal: {
    code: "version-conflict", class: "recoverable", records: mismatches,
    condition: "Observed record versions, presence, or conflict references changed; no mutations were published.",
    remedy: { text: "Acquire the current evidence and prepare again; obtain fresh approval before applying a removing batch." },
  } };
}

function sameConflicts(left: readonly RecordReference[], right: readonly RecordReference[]): boolean {
  return left.length === right.length && left.every(reference => right.some(other => sameReference(reference, other)));
}
