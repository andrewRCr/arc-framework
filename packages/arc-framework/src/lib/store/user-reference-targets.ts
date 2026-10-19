/** Lookup-qualified personal-reference outcomes retain their selected work-item generation. */
import { SlugSchema } from "../kernel/index.js";
import type { Store } from "./contract.js";
import { sameReference, type RecordReference } from "./identity.js";
import type { StoreRecord } from "./read.js";
import type { StoreResult } from "./refusal.js";
import { resolveReferenceTransition, type ReachableReferenceTransition, type ReferenceTransitionResolution } from "../work-unit/reference-reconcile.js";

/** One observed primary outcome that supersedes a slug-chain result. */
export interface StoreReferenceResolution { subject: string; resolution: ReferenceTransitionResolution }

/** Qualify planned subjects against captured owners, retaining terminal history when no primary resolves. */
export async function resolveStoreReferenceTargets(store: Store, records: readonly StoreRecord[],
  transitions: readonly ReachableReferenceTransition[], subjects: readonly string[]): Promise<StoreResult<readonly StoreReferenceResolution[]>> {
  const resolutions: StoreReferenceResolution[] = [];
  for (const subject of new Set(subjects)) {
    const expected = resolveReferenceTransition(transitions, subject);
    const selected = await resolvePrimaryTarget(store, records, subject);
    if (selected.status === "refused") {
      if (selected.refusal.code === "not-found" && expected.kind !== "rename") continue;
      return selected;
    }
    if (JSON.stringify(selected.result) !== JSON.stringify(expected)) resolutions.push({ subject, resolution: selected.result });
  }
  return { status: "ok", result: resolutions };
}

async function resolvePrimaryTarget(store: Store, records: readonly StoreRecord[], subject: string): Promise<StoreResult<ReferenceTransitionResolution>> {
  const original = await capturedLookup(store, records, subject);
  if (original.status === "refused") return original;
  const targetSlug = original.result.owner.name;
  if (targetSlug === subject) return { status: "ok", result: { kind: "absent" } };
  const target = await capturedLookup(store, records, targetSlug);
  if (target.status === "refused") return target;
  return { status: "ok", result: sameReference(original.result, target.result)
    ? { kind: "rename", targetSlug } : { kind: "conflict", reason: "ambiguous-history" } };
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
