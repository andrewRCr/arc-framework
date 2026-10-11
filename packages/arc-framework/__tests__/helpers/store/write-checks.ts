/** Registered checks inspect found state and the complete prepared mutation. */
import {
  composeWriteCheckRefusal, deriveWriteCheckWriter, type BrokenRule, type CallerProvenance,
  type RecordReference, type StoreRefusal, type StoreView,
} from "../../../src/lib/store/index.js";
import type { ReferenceContext } from "./context.js";
import { canonicalReference, recordKey } from "./model.js";
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
  for (const reference of references) {
    const check = prepared.registry[reference.kind].check;
    if (check === null) continue;
    const prior = found.state.records.get(recordKey(canonicalReference(found.state, reference)));
    const next = prepared.state.records.get(recordKey(canonicalReference(prepared.state, reference)));
    const priorFields = prior && publicRecord(found, prior).fields;
    const nextFields = next && publicRecord(prepared, next).fields;
    const rules = await check({ reference, before, after, writer,
      ...(prior === undefined ? {} : { prior: { content: prior.content,
        ...(priorFields === undefined ? {} : { fields: priorFields }) } }),
      ...(next === undefined ? {} : { next: { content: next.content, fields: nextFields } }),
    });
    results.push({ reference, rules });
  }
  return composeWriteCheckRefusal(results);
}
