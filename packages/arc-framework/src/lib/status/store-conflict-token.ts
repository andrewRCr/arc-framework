/** Resolve a conflict address without hiding same-name generations or incomplete evidence. */
import type { Store } from "../store/contract.js";
import { readStoreConflictFamily, type ConflictKind, type StoreConflictsView } from "./store-conflicts.js";
import { parseConflictToken } from "./conflict-token.js";
import type { StatusViewResult } from "./store-view-result.js";
/** Read every in-scope holder matching the address's human coordinates. */
export async function readStoreConflictToken(options: { store: Store; identity: string | null; token: string }): Promise<StatusViewResult<StoreConflictsView>> {
  const reference = parseConflictToken(options.token);
  if (reference === null) return unknownToken(options.token);
  if (options.identity === null && (reference.kind === "personal/conflict-record" || reference.kind === "claims/conflict-record")) {
    return { status: "refused", refusal: { code: "unsupported", condition: "Personal and claims conflict tokens require a resolved identity.",
      remedy: { text: "Run git config arc.identity <name>, then retry the conflict token." } } };
  }
  const family = await readStoreConflictFamily({ store: options.store, identity: options.identity, kind: reference.kind as ConflictKind });
  if (family.status === "refused") return family;
  const conflicts = family.result.conflicts.filter(record => record.reference.owner.type === reference.owner.type
    && record.reference.owner.name === reference.owner.name && record.reference.key === reference.key);
  if (conflicts.length === 0) return missingToken(options.token, family.result);
  return { status: "ok", result: { ...family.result, conflicts } };
}


function unknownToken(token: string): StatusViewResult<StoreConflictsView> {
  return { status: "refused", refusal: { code: "not-found", condition: `Unknown conflict token: ${token}.`,
    remedy: { text: "Use arc status --conflicts to list open conflict tokens." } } };
}


function missingToken(token: string, family: StoreConflictsView): StatusViewResult<StoreConflictsView> {
  if (!family.incomplete) return unknownToken(token);
  return { status: "refused", refusal: { code: "listing-unreadable",
    condition: `Conflict token ${token} could not be resolved from an incomplete family inventory. ${family.warnings.join(" ")}`,
    remedy: { text: `Repair the reported conflict inventory, then retry arc status --conflicts ${token}.` } } };
}
