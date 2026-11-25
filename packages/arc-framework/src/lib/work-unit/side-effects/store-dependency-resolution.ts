/** Identity-preserving dependency resolutions over a complete lifecycle inventory. */
import { SlugSchema } from "../../kernel/index.js";
import type { Store } from "../../store/contract.js";
import { sameReference, type RecordReference } from "../../store/identity.js";
import type { LifecycleEntry } from "../../store/lifecycle-index.js";
import type { WorkItemRef } from "../../store/kinds/lineage/schema.js";
import type { StoreRefusal } from "../../store/refusal.js";
import { deriveState, type LifecycleState } from "../lifecycle-resolver.js";

/** One name's observed holder, or a missing UID target's retained lineage identity. */
export type DependencyResolution =
  | { kind: "dependent"; reference: RecordReference }
  | { kind: "work-unit"; reference: RecordReference; state: LifecycleState }
  | { kind: "holder"; reference: RecordReference }
  | { kind: "tie"; candidates: RecordReference[]; tie?: Extract<StoreRefusal, { code: "ambiguous-match" }>["tie"] }
  | { kind: "not-found"; reference?: WorkItemRef }
  | { kind: "refused"; refusal: StoreRefusal };

/** Resolve a dependency name or a generation-bearing lineage target. */
export type DependencyResolver = (target: string | WorkItemRef) => Promise<DependencyResolution>;

/** Memoize each name and each explicit generation independently for one reconcile. */
export function createDependencyResolver(store: Store, entries: readonly LifecycleEntry[], dependent: RecordReference): DependencyResolver {
  const resolutions = new Map<string, Promise<DependencyResolution>>();
  return target => {
    const key = typeof target === "string" || target.uid === undefined
      ? `name:${typeof target === "string" ? target : target.name}` : `uid:${target.uid}`;
    let resolution = resolutions.get(key);
    if (resolution === undefined) {
      resolution = resolveTarget(store, entries, dependent, target);
      resolutions.set(key, resolution);
    }
    return resolution;
  };
}

async function resolveTarget(store: Store, entries: readonly LifecycleEntry[], dependent: RecordReference,
  target: string | WorkItemRef): Promise<DependencyResolution> {
  if (typeof target !== "string" && target.uid !== undefined) {
    const entry = entries.find(({ reference }) => reference.owner.type === "work-item" && reference.owner.uid === target.uid);
    return entry === undefined ? { kind: "not-found", reference: target } : classifyEntry(entry, dependent);
  }
  const lookup = await store.lookup({ kind: "slug", slug: SlugSchema.parse(typeof target === "string" ? target : target.name) });
  if (lookup.status === "refused") {
    const refusal = lookup.refusal;
    if (refusal.code === "not-found") return { kind: "not-found" };
    if (refusal.code === "ambiguous-match") return { kind: "tie", candidates: refusal.candidates,
      ...(refusal.tie === undefined ? {} : { tie: refusal.tie }) };
    return { kind: "refused", refusal };
  }
  const reference = lookup.result.reference;
  if (reference.kind !== "work-item/meta") return { kind: "holder", reference };
  const entry = entries.find(candidate => sameReference(candidate.reference, reference));
  if (entry === undefined) throw new Error("Resolved work unit is absent from the complete lifecycle inventory");
  return classifyEntry(entry, dependent);
}

function classifyEntry(entry: LifecycleEntry, dependent: RecordReference): DependencyResolution {
  return sameReference(entry.reference, dependent) ? { kind: "dependent", reference: entry.reference }
    : { kind: "work-unit", reference: entry.reference, state: deriveState(entry) };
}
