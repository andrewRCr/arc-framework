/** Dependency identity observations and pure machine-edge projection for decomposition. */
import type { DecomposeContext } from "./context.js";
import type { DecomposeOriginRecords } from "./acquire-origin.js";
import type { DecomposeResult } from "./refusal.js";
import { cutIncomingEdgeId, cutOutgoingEdgeId, type CutMapMachine } from "./cut-map-machine.js";
import { readLifecycleMetaFields } from "../store/lifecycle-write.js";
import { SlugSchema } from "../kernel/index.js";
import { decomposeStoreRefusal } from "./refusal.js";
import type { Store } from "../store/contract.js";
import type { LifecycleEntry } from "../store/lifecycle-index.js";

type Dependent = CutMapMachine["incomingEdges"][number]["dependent"];
type Provider = CutMapMachine["outgoingEdges"][number]["provider"];

/** Resolved owners retain authored provider slugs and current dependent names. */
export interface DecomposeEdgeObservations { incoming: readonly Dependent[]; outgoing: readonly Provider[] }

/** Resolve dependencies once over the acquired inventory and the store's identity lookups. */
export async function acquireDecomposeEdges(ctx: DecomposeContext,
  input: Pick<DecomposeOriginRecords, "primary" | "incomingCandidates">): Promise<DecomposeResult<DecomposeEdgeObservations>> {
  const origin = input.primary.reference.owner;
  const fields = readLifecycleMetaFields(input.primary);
  if (fields.status === "refused") return decomposeStoreRefusal(fields.refusal);
  if (origin.type !== "work-item" || origin.uid === undefined) return missingGeneration(origin.name);
  const lookup = cachedLookup(ctx.executor.store);
  const incoming = await incomingOwners(input.incomingCandidates, origin.uid, lookup);
  if (incoming.status === "refused") return incoming;
  const outgoing = await outgoingOwners(fields.result.dependsOn, lookup);
  if (outgoing.status === "refused") return outgoing;
  return { status: "ok", result: { incoming: incoming.result, outgoing: outgoing.result } };
}

function cachedLookup(store: Store): Store["lookup"] {
  const cache = new Map<string, ReturnType<Store["lookup"]>>();
  return input => {
    const key = JSON.stringify(input);
    let result = cache.get(key);
    if (result === undefined) { result = store.lookup(input); cache.set(key, result); }
    return result;
  };
}

async function incomingOwners(entries: readonly LifecycleEntry[], originUid: string,
  lookup: Store["lookup"]): Promise<DecomposeResult<Dependent[]>> {
  const dependents: Dependent[] = [];
  for (const entry of entries) {
    if (entry.placement.kind === "completed"
      || (entry.reference.owner.type !== "person" && entry.reference.owner.uid === originUid)) continue;
    const dependent = await incomingOwner(entry, originUid, lookup);
    if (dependent.status === "refused") return dependent;
    if (dependent.result !== null) dependents.push(dependent.result);
  }
  return { status: "ok", result: dependents };
}

async function incomingOwner(entry: LifecycleEntry, originUid: string,
  lookup: Store["lookup"]): Promise<DecomposeResult<Dependent | null>> {
  for (const slug of entry.fields.dependsOn) {
    const resolved = await lookup({ kind: "slug", slug: SlugSchema.parse(slug) });
    if (resolved.status === "refused") {
      if (resolved.refusal.code === "not-found" || resolved.refusal.code === "ambiguous-match") continue;
      return decomposeStoreRefusal(resolved.refusal);
    }
    const owner = resolved.result.reference.owner;
    if (owner.type === "person" || owner.uid !== originUid) continue;
    const dependent = entry.reference.owner;
    if (dependent.type !== "work-item" || dependent.uid === undefined) return missingGeneration(dependent.name);
    return { status: "ok", result: { slug: dependent.name, uid: dependent.uid } };
  }
  return { status: "ok", result: null };
}

function missingGeneration(slug: string): Extract<DecomposeResult<never>, { status: "refused" }> {
  return { status: "refused", reason: "source-artifact", class: "recoverable", locus: `${slug}.uid`,
    remedy: { text: "Restore the work item's stored generation identity, then retry." } };
}

async function outgoingOwners(slugs: readonly string[], lookup: Store["lookup"]): Promise<DecomposeResult<Provider[]>> {
  const providers: Provider[] = [];
  for (const name of slugs) {
    const slug = SlugSchema.parse(name);
    let resolved = await lookup({ kind: "slug", slug });
    if (resolved.status === "refused" && resolved.refusal.code === "not-found") {
      resolved = await lookup({ kind: "lineage", origin: slug });
    }
    if (resolved.status === "refused") {
      if (resolved.refusal.code !== "not-found" && resolved.refusal.code !== "ambiguous-match") {
        return decomposeStoreRefusal(resolved.refusal);
      }
      providers.push({ slug });
    } else {
      const owner = resolved.result.reference.owner;
      providers.push({ slug, ...(owner.type === "work-item" && owner.uid !== undefined ? { uid: owner.uid } : {}) });
    }
  }
  return { status: "ok", result: providers };
}

/** Project observed generations into stable, canonically ordered machine edges. */
export function deriveDecomposeEdges(input: DecomposeEdgeObservations): Pick<CutMapMachine, "incomingEdges" | "outgoingEdges"> {
  const incomingEdges = input.incoming.map(dependent => ({ dependent, edgeId: cutIncomingEdgeId({ dependent }) }));
  const outgoingEdges = input.outgoing.map(provider => ({ provider, edgeId: cutOutgoingEdgeId({ provider }) }));
  const order = (left: { edgeId: string }, right: { edgeId: string }): number => Buffer.compare(Buffer.from(left.edgeId), Buffer.from(right.edgeId));
  return { incomingEdges: incomingEdges.sort(order), outgoingEdges: outgoingEdges.sort(order) };
}
