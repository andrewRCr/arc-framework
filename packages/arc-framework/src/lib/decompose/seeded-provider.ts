/** Stored provider identity observations for seeded member dependencies. */
import type { Store } from "../store/contract.js";
import type { StoreRecord } from "../store/read.js";
import type { DecomposeResult } from "./refusal.js";
import { SlugSchema } from "../kernel/index.js";
import { decomposeStoreRefusal } from "./refusal.js";
import type { OwnerIdentity } from "../store/identity.js";
import { resolveDecomposeRetiredEdge } from "./retired-edge.js";

/** Provider identity falls back to its authored name only when no unique generation resolves. */
export interface DecomposeSeededProvider { slug: string; uid?: string; records: readonly StoreRecord[] }
/** Resolve a current or retired provider, preserving the record that proves its owner. */
export async function observeDecomposeSeededProvider(store: Store, name: string, uid?: string): Promise<DecomposeResult<DecomposeSeededProvider>> {
  const slug = SlugSchema.parse(name);
  let lookup = await store.lookup({ kind: "slug", slug });
  const differentGeneration = lookup.status === "ok" && uid !== undefined
    && (lookup.result.reference.owner.type !== "work-item" || lookup.result.reference.owner.uid !== uid);
  if (differentGeneration || lookup.status === "refused" && (lookup.refusal.code === "not-found"
    || uid !== undefined && lookup.refusal.code === "ambiguous-match")) lookup = await store.lookup({ kind: "lineage", origin: uid ?? slug });
  if (lookup.status === "refused") {
    if (lookup.refusal.code !== "not-found" && lookup.refusal.code !== "ambiguous-match") return decomposeStoreRefusal(lookup.refusal);
    return { status: "ok", result: { slug, ...(uid === undefined ? {} : { uid }), records: [] } };
  }
  const record = await store.read({ reference: lookup.result.reference });
  if (record.status === "refused") return decomposeStoreRefusal(record.refusal);
  const owner = record.result.reference.owner;
  return { status: "ok", result: { slug, records: [record.result],
    ...(owner.type === "work-item" && owner.uid !== undefined ? { uid: owner.uid } : {}) } };
}
/** Compare resolved generations, falling back to authored names if either is unresolved. */
export function sameDecomposeSeededProvider(left: DecomposeSeededProvider, right: DecomposeSeededProvider): boolean {
  return left.uid !== undefined && right.uid !== undefined ? left.uid === right.uid : left.slug === right.slug;
}

/** Accept a named provider or the complete disposition its retirement assigns to this member. */
export async function satisfiesDecomposeSeededProvider(store: Store, name: string, current: readonly DecomposeSeededProvider[],
  dependent: OwnerIdentity, uid?: string): Promise<DecomposeResult<{ held: boolean; records: readonly StoreRecord[] }>> {
  const provider = await observeDecomposeSeededProvider(store, name, uid);
  if (provider.status === "refused") return provider;
  const records = [...provider.result.records];
  if (current.some(actual => sameDecomposeSeededProvider(provider.result, actual))) return { status: "ok", result: { held: true, records } };
  const retired = await resolveDecomposeRetiredEdge(store, name, dependent, uid);
  if (retired.status === "refused") return retired;
  if (retired.result === null) return { status: "ok", result: { held: false, records } };
  records.push(...retired.result.records);
  if (retired.result.disposition.kind === "drop") return { status: "ok", result: { held: true, records } };
  for (const name of retired.result.disposition.replacementTargets) {
    const replacement = await observeDecomposeSeededProvider(store, name);
    if (replacement.status === "refused") return replacement;
    records.push(...replacement.result.records);
    if (!current.some(actual => sameDecomposeSeededProvider(replacement.result, actual))) return { status: "ok", result: { held: false, records } };
  }
  return { status: "ok", result: { held: true, records } };
}
