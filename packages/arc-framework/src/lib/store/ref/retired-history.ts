/** Resolve records of lineage-ended origins through their last retained metadata. */

import { OwnerIdentitySchema, sameOwner, type RecordReference } from "../identity.js";
import { HistoryRefSchema, type StoreResult } from "../refusal.js";
import { expandStoredPath, holdsNoRecord, type StoredRecordHome } from "../stored-path.js";
import type { RefBackendContext } from "./context.js";
import { rootFamily } from "./path-decode.js";
import { readHistoricalGraph, unavailableRefHistory } from "./history-graph.js";
import { readLineageOwners } from "./lineage-resolution.js";
import { readBatchObjects, readRefTrees } from "./batch-read.js";
import { metadataFailure, parseRefMetadata } from "./metadata.js";

/** An ended origin has no live tree; its lineage names the retained history that callers must fetch. */
export async function retiredHistoryHome(context: RefBackendContext, reference: RecordReference,
  tips: ReadonlyMap<string, string>): Promise<StoreResult<StoredRecordHome | null>> {
  if (reference.owner.type !== "work-item" || !reference.owner.uid || rootFamily(context.registry[reference.kind].family) !== "work-item") return { status: "ok", result: null };
  const live = expandStoredPath(reference, { registry: context.registry });
  if (tips.has(live.ref)) return { status: "ok", result: null };
  const lineage = await readLineageOwners(context, tips);
  if (lineage.status === "refused") return lineage;
  if (!lineage.result.some((owner) => sameOwner(owner, reference.owner))) return { status: "ok", result: null };
  const home = expandStoredPath(reference, { registry: context.registry, history: true });
  const history = HistoryRefSchema.safeParse(home.ref);
  if (!history.success) return { status: "refused", refusal: { code: "namespace-corrupt", class: "terminal", namespace: home.ref,
    condition: "The lineage-ended origin's history ref does not carry a stored UID.",
    remedy: { text: "Repair the origin's registry identity to use the lowercase stored UID, then retry." } } };
  const tip = tips.get(home.ref);
  if (!tip) return { status: "refused", refusal: { code: "state-unresolvable", class: "recoverable", reference,
    historyRefs: [history.data], condition: "The lineage-ended origin's retained history is not available locally.",
    remedy: { text: `Pull ${home.ref} by name, then retry. If the remote no longer holds it, restore it from a clone holding the ref.` } } };
  const graph = await readHistoricalGraph(context, ["rev-list", tip, "--", `:(literal)${home.metadataPath}`], unavailableRefHistory(reference, home.ref));
  if (graph.status === "refused") return graph;
  const queries = graph.result.trim().split("\n").filter(Boolean).map((revision) => `${revision}:${home.metadataPath}`);
  const objects = await readBatchObjects(context, queries);
  for (const query of queries) {
    const metadata = parseRefMetadata(objects.get(query));
    if (!metadata?.slug) continue;
    const owner = OwnerIdentitySchema.parse({ ...reference.owner, name: metadata.slug });
    return { status: "ok", result: expandStoredPath({ ...reference, owner }, { registry: context.registry, history: true }) };
  }
  const trees = await readRefTrees(context, new Map([[home.ref, tip]]));
  const entries = trees.get(home.ref);
  if (queries.length === 0 && entries && holdsNoRecord(home, entries.map(({ path }) => path))) return { status: "refused", refusal: {
    code: "not-found", class: "recoverable", reference, condition: "The ended origin's retained history contains no records.",
    remedy: { text: "Inspect its lineage for the terminal transition; pre-import records remain in code history." },
  } };
  return { status: "refused", refusal: { code: "namespace-corrupt", class: "terminal", namespace: home.ref, ...metadataFailure(home.ref) } };
}
