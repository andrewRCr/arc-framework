/** Read the current stored map without imposing finish or start admission rules. */
import type { Store } from "../store/contract.js";
import type { StoreRecord } from "../store/read.js";
import type { CutMap } from "./cut-map-schema.js";
import type { StoreRefusal } from "../store/refusal.js";
import type { DecomposeLandedCut } from "./finish-report.js";
import { readDecomposeLandedRetirement } from "./landed.js";
import { readDecomposeLandedExtraction } from "./landed-extraction.js";
import type { DecomposeResult, DecomposeRefusal } from "./refusal.js";
import { recordReferences } from "../store/identity.js";
import { readWorkUnit } from "../store/lifecycle-write.js";
import { decodeCutMapContent, type StoredCutMap } from "../store/kinds/cut-map/index.js";
import { decomposeStoreRefusal } from "./refusal.js";

/** Current origin and stored authoring retained at their exact versions. */
export interface DecomposeStoredCut { primary: StoreRecord; storedMap: StoreRecord; map: CutMap; storedCut: StoredCutMap }

/** Select the origin by current or former slug and decode its current map, including conflicted content. */
export async function acquireDecomposeStoredCut(store: Store, origin: string): Promise<DecomposeResult<DecomposeStoredCut>> {
  const primary = await readWorkUnit(store, origin);
  if (primary.status === "refused") return primary.refusal.code === "not-found"
    ? missingOrigin(store, origin, primary.refusal) : decomposeStoreRefusal(primary.refusal);
  const stored = await store.read({ reference: recordReferences["work-item/cut-map"](primary.result.reference.owner) });
  if (stored.status === "refused") return stored.refusal.code !== "not-found" ? decomposeStoreRefusal(stored.refusal)
    : missingMap(store, primary.result, origin);
  const decoded = decodeCutMapContent(stored.result.content);
  if (!decoded.success) return { status: "refused", reason: "invalid-structure", class: "recoverable",
    locus: "$", message: decoded.error,
    remedy: { text: "Restore the authentic stored wrapper and required history from a known intact source, then prepare again. Explicitly regenerate development state whose required generation facts were never recorded." } };
  return { status: "ok", result: { primary: primary.result, storedMap: stored.result, map: decoded.data.map, storedCut: decoded.data } };
}

async function missingOrigin(store: Store, origin: string, refusal: StoreRefusal): Promise<DecomposeRefusal> {
  const landed = await readDecomposeLandedRetirement(store, origin);
  return landed.status === "refused" ? landed : landed.result === null ? decomposeStoreRefusal(refusal) : landedRefusal(landed.result);
}

async function missingMap(store: Store, primary: StoreRecord, origin: string): Promise<DecomposeRefusal> {
  const landed = await readDecomposeLandedExtraction(store, primary);
  if (landed.status === "refused") return landed;
  if (landed.result !== null) return landedRefusal(landed.result);
  return { status: "refused", reason: "no-stored-map", class: "recoverable", locus: origin,
    remedy: { text: "Start a cut with --execute <cut-map> or --extract <cut-map> before discarding or revising it." } };
}

function landedRefusal(landed: DecomposeLandedCut): DecomposeRefusal {
  const members = landed.members.map(member => JSON.stringify(member.name)).join(", ");
  return { status: "refused", reason: "cut-landed", class: "terminal", locus: landed.origin.slug,
    message: `The cut already landed. Recorded members: ${members}.`,
    remedy: { text: "Continue work in the recorded members; this completed cut cannot be discarded or revised." } };
}
