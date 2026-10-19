/** Member identity proved by creation provenance within the current stored cut. */
import type { Store, HistoryEntry } from "../store/contract.js";
import type { StoreRecord } from "../store/read.js";
import type { CutMap } from "./cut-map-schema.js";
import type { DecomposeResult } from "./refusal.js";
import type { DecomposeTerminalMember } from "./acquire-terminal.js";
import { SlugSchema } from "../kernel/index.js";
import { decomposeStoreRefusal } from "./refusal.js";
import { sameReference } from "../store/identity.js";

/** Authenticate a member's original name and batch against this incarnation of the cut. */
export function isDecomposeMemberBirth(slug: string, history: readonly HistoryEntry[], batches: ReadonlySet<string>): boolean {
  const birth = history.at(-1);
  return birth !== undefined && birth.version !== null && birth.reference.kind === "work-item/meta"
    && birth.reference.owner.name === slug && "verb" in birth.provenance
    && birth.provenance.batchId !== undefined && batches.has(birth.provenance.batchId);
}

/** Resolve map names, retaining only the generations created by this cut's additive or revision batches. */
export async function acquireDecomposeMembers(store: Store, map: CutMap, storedMap: StoreRecord): Promise<DecomposeResult<readonly DecomposeTerminalMember[]>> {
  const history = await store.history({ reference: storedMap.reference });
  if (history.status === "refused") return decomposeStoreRefusal(history.refusal);
  const batches = currentCutBatches(history.result);
  const histories: { record: StoreRecord; entries: HistoryEntry[] }[] = [];
  const members: DecomposeTerminalMember[] = [];
  for (const destination of map.authoring.destinations) {
    if (destination.kind !== "new-member") continue;
    const lookup = await store.lookup({ kind: "slug", slug: SlugSchema.parse(destination.slug) });
    if (lookup.status === "refused") {
      if (lookup.refusal.code !== "not-found") return decomposeStoreRefusal(lookup.refusal);
      members.push({ destinationId: destination.destinationId, slug: destination.slug, primary: null });
      continue;
    }
    const selected = await store.read({ reference: lookup.result.reference });
    if (selected.status === "refused") return decomposeStoreRefusal(selected.refusal);
    const entries = await memberHistory(store, selected.result, histories);
    if (entries.status === "refused") return entries;
    members.push({ destinationId: destination.destinationId, slug: destination.slug,
      primary: isDecomposeMemberBirth(destination.slug, entries.result, batches) ? selected.result : null });
  }
  return { status: "ok", result: members };
}

async function memberHistory(store: Store, record: StoreRecord,
  histories: { record: StoreRecord; entries: HistoryEntry[] }[]): Promise<DecomposeResult<HistoryEntry[]>> {
  const prior = histories.find(item => sameReference(item.record.reference, record.reference));
  if (prior !== undefined) return { status: "ok", result: prior.entries };
  const history = await store.history({ reference: record.reference });
  if (history.status === "refused") return decomposeStoreRefusal(history.refusal);
  histories.push({ record, entries: history.result });
  return { status: "ok", result: history.result };
}

function currentCutBatches(history: readonly HistoryEntry[]): ReadonlySet<string> {
  const removal = history.findIndex(entry => entry.version === null);
  const current = removal < 0 ? history : history.slice(0, removal);
  return new Set(current.flatMap(entry => "verb" in entry.provenance && entry.provenance.verb === "decompose"
    && entry.provenance.batchId !== undefined ? [entry.provenance.batchId] : []));
}
