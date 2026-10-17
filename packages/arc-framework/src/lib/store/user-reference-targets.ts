/** Identity checks for the final names proposed by personal-reference planning. */
import { SlugSchema } from "../kernel/index.js";
import type { Store } from "./contract.js";
import { sameReference, type RecordReference } from "./identity.js";
import type { StoreRecord } from "./read.js";
import type { StoreResult } from "./refusal.js";

/** Find proposed rewrites whose destination selects another captured owner generation. */
export async function findStoreReferenceTargetConflicts(store: Store, records: readonly StoreRecord[],
  replacements: readonly { subject: string; targetSlug: string }[]): Promise<StoreResult<readonly string[]>> {
  const conflicts = new Set<string>();
  for (const { subject, targetSlug } of replacements) {
    const original = await capturedLookup(store, records, subject);
    if (original.status === "refused") return original;
    const target = await capturedLookup(store, records, targetSlug);
    if (target.status === "refused") return target;
    if (!sameReference(original.result, target.result)) conflicts.add(subject);
  }
  return { status: "ok", result: [...conflicts] };
}

async function capturedLookup(store: Store, records: readonly StoreRecord[], slug: string): Promise<StoreResult<RecordReference>> {
  const found = await store.lookup({ kind: "slug", slug: SlugSchema.parse(slug) });
  if (found.status === "refused") return found;
  const reference = found.result.reference;
  if (!records.some(record => sameReference(record.reference, reference) && record.reference.owner.name === reference.owner.name)) {
    return { status: "refused", refusal: { code: "version-conflict", class: "recoverable", records: [reference],
      condition: `The lookup for ${slug} no longer matches the captured personal-reference authority.`,
      remedy: { text: "Prepare user-reference reconciliation again and retry with its current authority." } } };
  }
  return { status: "ok", result: reference };
}
