/** Registry-driven stale-base reconciliation and same-family durable conflict records. */

import { randomInt, randomUUID } from "node:crypto";
import {
  ConflictRecordSchema, KIND_SHAPES, RecordReferenceSchema, familyOf,
  type CallerProvenance, type ConflictRecord, type RecordReference, type WriteInput,
} from "../../../src/lib/store/index.js";
import { mergeEntryText, mergeLineText, stampEntryIds } from "../../../src/lib/store/concurrency/index.js";
import type { ReferenceContext } from "./context.js";
import { advanceMemoryState, canonicalReference, recordKey, type MemoryRecord } from "./model.js";

/** Return a kind's declared grammar, or the reference fixture's explicit generic test grammar.
 * @param context - Independent registered kind mechanisms.
 * @param reference - Entry-list role.
 * @returns Production entry configuration, with a test shape for the three reserved entry mechanisms.
 */
export function entryConfig(context: ReferenceContext, reference: RecordReference) {
  return context.registry[reference.kind].entry ?? { shape: "heading" as const, sections: ["Entries"] };
}

/** Stamp IDs at first persist, changing only missing managed descriptor fields.
 * @param context - Registry mechanisms.
 * @param reference - Target role.
 * @param content - Incoming valid bytes.
 * @returns Bytes ready to persist under that role's mechanism.
 */
export function persistedContent(context: ReferenceContext, reference: RecordReference, content: string): string {
  return context.registry[reference.kind].merge === "entry"
    ? stampEntryIds(content, entryConfig(context, reference), () => randomInt(0x100000000) / 0x100000000) : content;
}

/** Find the exact record content a stale writer observed, independently of current state.
 * @param context - Durable snapshots.
 * @param write - Version-bound incoming update.
 * @returns The observed record, or absence when the expected version never existed.
 */
export function mergeBase(context: ReferenceContext, write: WriteInput): MemoryRecord | undefined {
  const key = recordKey(canonicalReference(context.state, write.reference));
  for (const snapshot of context.state.snapshots.values()) {
    const record = snapshot.get(key);
    if (record?.version === write.expected) return record;
  }
  return undefined;
}

/** Merge a stale put using current/incoming roles and the kind's registered mechanism.
 * @param context - Registry and incoming side label.
 * @param reference - Canonical record generation.
 * @param base - The version both writers began from.
 * @param current - Store's currently visible bytes and label.
 * @param incoming - New local bytes.
 * @returns Merged bytes and typed conflicts preserving current at each clash.
 */
export function mergeContents(context: ReferenceContext, reference: RecordReference, base: MemoryRecord, current: MemoryRecord, incoming: string) {
  const input = { record: reference, base: base.content, current: current.content, incoming,
    currentLabel: current.label, incomingLabel: { actor: context.environment.actor, time: new Date(context.environment.now()).toISOString() } };
  return context.registry[reference.kind].merge === "entry" ? mergeEntryText(input, entryConfig(context, reference)) : mergeLineText(input);
}

/** Persist typed conflicts as ordinary write-once records in the clashing record's family.
 * @param context - Durable namespace and family registry.
 * @param conflicts - Labelled clashes returned by the pure concurrency library.
 * @param provenance - Original caller facts, enriched by this internal merge write.
 * @param batchId - Atomic batch identifier, when the conflict belongs to a batch.
 * @returns The stored conflict references returned by read and the landed write.
 */
export function storeConflicts(context: ReferenceContext, conflicts: ConflictRecord[], provenance: CallerProvenance, batchId?: string): RecordReference[] {
  return conflicts.map((value) => {
    const conflict = ConflictRecordSchema.parse(value);
    const kind = `${familyOf(conflict.record.kind)}/conflict-record` as keyof typeof KIND_SHAPES;
    const reference = RecordReferenceSchema.parse({ owner: conflict.record.owner, kind, key: randomUUID() });
    const allocated = advanceMemoryState(context.state);
    context.state.records.set(recordKey(reference), {
      reference, content: JSON.stringify(conflict), conflict, version: allocated.version,
      formatVersion: context.registry[kind].formatVersion, formerSlugs: [], label: conflict.incoming.label,
    });
    context.state.events.push({ reference, version: allocated.version, stateVersion: allocated.stateVersion,
      label: conflict.incoming.label,
      provenance: { ...provenance, verb: "merge", reference,
        ...(reference.owner.type === "person" || reference.owner.uid === undefined ? {} : { ownerUid: reference.owner.uid }),
        ...(batchId === undefined ? {} : { batchId }) } });
    context.state.snapshots.set(allocated.stateVersion, structuredClone(context.state.records));
    return reference;
  });
}
