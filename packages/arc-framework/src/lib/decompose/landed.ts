/** Landed retirement reports from terminal lineage after the primary has ended. */
import type { Store } from "../store/contract.js";
import type { DecomposeResult } from "./refusal.js";
import type { DecomposeLandedCut } from "./finish-report.js";
import { DecomposeLandedCutSchema } from "./finish-report.js";
import { parseLineageRecord } from "../store/kinds/lineage/index.js";
import { SlugSchema } from "../kernel/index.js";
import { decomposeStoreRefusal } from "./refusal.js";

/** Read a uniquely resolved decomposition without treating abandonment as a landed cut. */
export async function readDecomposeLandedRetirement(store: Store, origin: string): Promise<DecomposeResult<DecomposeLandedCut | null>> {
  const found = await store.lookup({ kind: "lineage", origin: SlugSchema.parse(origin) });
  if (found.status === "refused") return found.refusal.code === "not-found" ? { status: "ok", result: null } : decomposeStoreRefusal(found.refusal);
  const read = await store.read({ reference: found.result.reference });
  if (read.status === "refused") return decomposeStoreRefusal(read.refusal);
  const lineage = parseLineageRecord(read.result.content);
  if (lineage === null) return { status: "refused", reason: "invalid-structure", class: "recoverable", locus: `lineage:${origin}`,
    remedy: { text: "Restore valid terminal lineage from its stored history, then retry finish." } };
  if (lineage.kind !== "decompose") return { status: "ok", result: null };
  return { status: "ok", result: DecomposeLandedCutSchema.parse({ kind: "landed", mode: "retirement-finish",
    origin: { slug: lineage.origin.name, ...(lineage.origin.uid === undefined ? {} : { uid: lineage.origin.uid }) },
    members: lineage.successors,
  }) };
}
