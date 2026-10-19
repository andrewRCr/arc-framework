/** Read the current stored map without imposing finish or start admission rules. */
import type { Store } from "../store/contract.js";
import type { StoreRecord } from "../store/read.js";
import type { CutMap } from "./cut-map-schema.js";
import type { DecomposeResult } from "./refusal.js";
import { recordReferences } from "../store/identity.js";
import { readWorkUnit } from "../store/lifecycle-write.js";
import { decodeCutMap } from "./cut-map-decode.js";
import { decomposeStoreRefusal } from "./refusal.js";

/** Current origin and stored authoring retained at their exact versions. */
export interface DecomposeStoredCut { primary: StoreRecord; storedMap: StoreRecord; map: CutMap }

/** Select the origin by current or former slug and decode its current map, including conflicted content. */
export async function acquireDecomposeStoredCut(store: Store, origin: string): Promise<DecomposeResult<DecomposeStoredCut>> {
  const primary = await readWorkUnit(store, origin);
  if (primary.status === "refused") return decomposeStoreRefusal(primary.refusal);
  const stored = await store.read({ reference: recordReferences["work-item/cut-map"](primary.result.reference.owner) });
  if (stored.status === "refused") return stored.refusal.code !== "not-found" ? decomposeStoreRefusal(stored.refusal)
    : { status: "refused", reason: "no-stored-map", class: "recoverable", locus: origin,
      remedy: { text: "Start a cut with --execute <cut-map> or --extract <cut-map> before discarding or revising it." } };
  let content: unknown;
  try { content = JSON.parse(stored.result.content); } catch {
    return { status: "refused", reason: "invalid-structure", class: "recoverable", locus: "$",
      remedy: { text: "Restore valid JSON for the stored cut map, then retry." } };
  }
  const decoded = decodeCutMap(content);
  if (decoded.status === "rejected") return { status: "refused", reason: decoded.issue.code, class: "recoverable",
    locus: decoded.issue.path || "$", message: decoded.issue.message,
    remedy: { text: "Restore a complete valid stored cut map, then retry." } };
  return { status: "ok", result: { primary: primary.result, storedMap: stored.result, map: decoded.value } };
}
