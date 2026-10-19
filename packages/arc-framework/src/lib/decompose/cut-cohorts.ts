/** Authenticate cohort documents created during the current cut's incarnation. */
import type { Store } from "../store/contract.js";
import type { StoreRecord } from "../store/read.js";
import type { DecomposeCohortObservation } from "./check-names.js";
import type { CutMap } from "./cut-map-schema.js";
import type { DecomposeResult } from "./refusal.js";
import { recordReferences, OwnerIdentitySchema } from "../store/identity.js";
import { decomposeCurrentCutBatches } from "./member-identity.js";
import { decomposeStoreRefusal } from "./refusal.js";

/** Acquire only currently named documents whose original creation belongs to this cut. */
export async function acquireDecomposeCutCohorts(store: Store, map: CutMap,
  storedMap: StoreRecord): Promise<DecomposeResult<readonly DecomposeCohortObservation[]>> {
  const placement = map.authoring.placement;
  const paths = placement.kind === "cohort" ? [placement.cohort] : placement.kind === "subcohort"
    ? [placement.cohort.split("/")[0] ?? placement.cohort, placement.cohort] : [];
  const history = await store.history({ reference: storedMap.reference });
  if (history.status === "refused") return decomposeStoreRefusal(history.refusal);
  const batches = decomposeCurrentCutBatches(history.result);
  const cohorts: DecomposeCohortObservation[] = [];
  for (const path of paths) {
    const owner = OwnerIdentitySchema.parse({ type: "cohort", name: path.split("/").at(-1) });
    const read = await store.read({ reference: recordReferences["cohort/document"](owner) });
    if (read.status === "refused") {
      if (read.refusal.code === "not-found") continue;
      return decomposeStoreRefusal(read.refusal);
    }
    const history = await store.history({ reference: read.result.reference });
    if (history.status === "refused") return decomposeStoreRefusal(history.refusal);
    const birth = history.result.at(-1);
    if (birth?.version !== null && birth !== undefined && "verb" in birth.provenance
      && birth.provenance.verb === "decompose" && birth.provenance.batchId !== undefined
      && batches.has(birth.provenance.batchId)) cohorts.push({ path, record: read.result });
  }
  return { status: "ok", result: cohorts };
}
