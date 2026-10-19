/** Landed extraction evidence from the surviving generation's removed map history. */
import type { Store } from "../store/contract.js";
import type { StoreRecord } from "../store/read.js";
import type { DecomposeResult } from "./refusal.js";
import { decomposeStoreRefusal } from "./refusal.js";
import { DecomposeLandedCutSchema, type DecomposeLandedCut } from "./finish-report.js";
import { recordReferences } from "../store/identity.js";
import { decodeCutMapContent } from "../store/kinds/cut-map/index.js";

/** Recognize only the latest map removal's terminal provenance for the current origin UID. */
export async function readDecomposeLandedExtraction(store: Store, primary: StoreRecord): Promise<DecomposeResult<DecomposeLandedCut | null>> {
  const owner = primary.reference.owner;
  if (owner.type !== "work-item" || owner.uid === undefined) return invalidHistory(owner.name);
  const history = await store.history({ reference: recordReferences["work-item/cut-map"](owner) });
  if (history.status === "refused") return history.refusal.code === "not-found"
    ? { status: "ok", result: null } : decomposeStoreRefusal(history.refusal);
  const removal = history.result[0];
  if (removal === undefined || removal.version !== null || !("verb" in removal.provenance)
    || removal.provenance.verb !== "decompose" || removal.provenance.lifecycleAction !== "terminal") return { status: "ok", result: null };
  const prior = history.result[1];
  if (prior?.content === null || prior?.content === undefined) return invalidHistory(owner.name);
  const decoded = decodeCutMapContent(prior.content);
  if (!decoded.success || decoded.data.machine.origin.uid !== owner.uid) return invalidHistory(owner.name);
  if (decoded.data.authoring.shape !== "extraction") return { status: "ok", result: null };
  const members = decoded.data.authoring.destinations.flatMap(destination => destination.kind === "new-member" ? [{ name: destination.slug }] : [])
    .sort((a, b) => Buffer.compare(Buffer.from(a.name), Buffer.from(b.name)));
  return { status: "ok", result: DecomposeLandedCutSchema.parse({ kind: "landed", mode: "extraction-finish",
    origin: { slug: owner.name, uid: owner.uid }, members,
  }) };
}

function invalidHistory(origin: string): DecomposeResult<never> {
  return { status: "refused", reason: "invalid-structure", class: "recoverable", locus: `cut-map:${origin}`,
    remedy: { text: "Restore the origin generation's completed cut-map history, then retry finish." } };
}
