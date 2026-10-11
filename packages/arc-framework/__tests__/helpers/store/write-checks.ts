/** Registered checks inspect found state and the complete prepared mutation. */
import {
  composeWriteCheckRefusal, deriveWriteCheckWriter, RecordReferenceSchema, type BrokenRule, type CallerProvenance,
  type RecordReference, type StoreRefusal, type StoreView,
} from "../../../src/lib/store/index.js";
import type { ReferenceContext } from "./context.js";
import { canonicalReference, recordKey, type MemoryRecord } from "./model.js";
import { listReference, publicRecord, readReference } from "./read.js";
import { lookupReference } from "./lookup.js";

function view(context: ReferenceContext): StoreView {
  return {
    async read(input) { return readReference(context, input); },
    async list(input) { return listReference(context, input); },
    async lookup(input) { return lookupReference(context, input); },
  };
}

/** Run all checks in write order against bytes as stored, including stale merges.
 * @param found - Namespace before any mutation.
 * @param prepared - Independently prepared complete namespace.
 * @param references - Canonical references in caller write order.
 * @param provenance - Backend-owned caller authority.
 * @returns The deterministically composed refusal, or admission.
 */
export async function checkPreparedWrites(found: ReferenceContext, prepared: ReferenceContext,
  references: readonly RecordReference[], provenance: CallerProvenance): Promise<StoreRefusal | undefined> {
  const results: { reference: RecordReference; rules: readonly BrokenRule[] }[] = [];
  const before = view(found), after = view(prepared), writer = deriveWriteCheckWriter(provenance);
  const checkVersion = async (reference: RecordReference, prior: MemoryRecord | undefined, next: MemoryRecord | undefined) => {
    const check = prepared.registry[reference.kind].check;
    if (check === null) return;
    const priorFields = prior && publicRecord(found, prior).fields;
    const nextFields = next && publicRecord(prepared, next).fields;
    const rules = await check({ reference, before, after, writer,
      ...(prior === undefined ? {} : { prior: { content: prior.content,
        ...(priorFields === undefined ? {} : { fields: priorFields }) } }),
      ...(next === undefined ? {} : { next: { content: next.content, fields: nextFields } }),
    });
    results.push({ reference, rules });
  };
  for (const reference of references) {
    const prior = found.state.records.get(recordKey(canonicalReference(found.state, reference)));
    const next = prepared.state.records.get(recordKey(canonicalReference(prepared.state, reference)));
    if (prior !== undefined && next !== undefined && prior.reference.kind !== next.reference.kind) {
      await checkVersion(RecordReferenceSchema.parse({ ...reference, kind: prior.reference.kind }), prior, undefined);
      await checkVersion(reference, undefined, next);
    } else await checkVersion(reference, prior, next);
  }
  return composeWriteCheckRefusal(results);
}
