/** Member generations proved by selected bindings and backend allocation receipts. */
import type { Store } from "../store/contract.js";
import type { StoreRecord } from "../store/read.js";
import type { StoredCutMap } from "../store/kinds/cut-map/schema.js";
import type { DecomposeResult } from "./refusal.js";
import type { DecomposeTerminalMember } from "./acquire-terminal.js";
import { OwnerIdentitySchema, recordReferences } from "../store/identity.js";
import { decomposeStoreRefusal } from "./refusal.js";
import { acquireDecomposeMapHistory, resolveDecomposeOwnerBirth, unavailableDecomposeBirth } from "./owner-birth-history.js";

/** Retain every selected member's original UID even after its primary ends or its name is reused. */
export async function acquireDecomposeMembers(store: Pick<Store, "history" | "read">, stored: StoredCutMap,
  storedMap: StoreRecord): Promise<DecomposeResult<readonly DecomposeTerminalMember[]>> {
  const history = await acquireDecomposeMapHistory(store, storedMap.reference);
  if (history.status === "refused") return history;
  const members: DecomposeTerminalMember[] = [];
  for (const destination of stored.map.authoring.destinations) {
    if (destination.kind !== "new-member") continue;
    const binding = stored.ownerBirths.find(birth => birth.kind === "work-item/meta" && birth.name === destination.slug);
    if (binding === undefined) return unavailableDecomposeBirth(destination.slug, "The selected member has no birth binding.");
    const birth = resolveDecomposeOwnerBirth(storedMap.reference, binding, history.result);
    if (birth.status === "refused") return birth;
    const owner = OwnerIdentitySchema.parse({ type: "work-item", name: binding.name, uid: birth.result });
    const selected = await store.read({ reference: recordReferences["work-item/meta"](owner) });
    if (selected.status === "refused" && selected.refusal.code !== "not-found") return decomposeStoreRefusal(selected.refusal);
    members.push({ destinationId: destination.destinationId, slug: destination.slug, uid: birth.result,
      primary: selected.status === "ok" && selected.result.placement?.kind !== "completed" ? selected.result : null });
  }
  return { status: "ok", result: members };
}
