/** Preserve the established identity and exact-branch selection for stored Errand status. */
import type { Store } from "../../lib/store/contract.js";
import type { OwnerIdentity } from "../../lib/store/identity.js";
import { acquireStoreErrands } from "../../lib/errand/store-discovery.js";
import type { TransientIdentityRecord } from "../../lib/errand/identity-record.js";

type StatusTarget = { readonly repository: string; readonly headRef: string; readonly headSha: string };
/** Exact positive claim, authoritative absence, or the existing status refusal. */
export type ErrandStatusSelection = { readonly kind: "none" } | { readonly kind: "blocked"; readonly detail: string } | {
  readonly kind: "matched";
  readonly record: Extract<TransientIdentityRecord, { kind: "errand"; purpose: "errand" }>;
  readonly workItem?: OwnerIdentity;
};

/**
 * Check exact branch, ordinary purpose, state, and retained target. The stored reader supplies only ordinary claims
 * belonging to the active identity; repository-backed callers supply their complete transient claim set.
 */
export function matchingOrdinaryErrand(
  records: readonly TransientIdentityRecord[],
  target: StatusTarget,
): ErrandStatusSelection {
  const matching = records.filter((record) => record.branch === target.headRef);
  if (matching.length === 0) return { kind: "none" };
  if (matching.length !== 1) {
    return { kind: "blocked", detail: "The target branch has ambiguous transient identity claims." };
  }
  const record = matching[0];
  if (record?.kind !== "errand" || record.purpose !== "errand"
    || (record.state !== "open" && record.state !== "awaiting-merge")) {
    return { kind: "blocked", detail: "The target branch does not carry an active ordinary Errand identity." };
  }
  if (record.state === "awaiting-merge" && (
    record.changeRequest.repositoryRef.toLowerCase() !== target.repository.toLowerCase()
    || record.changeRequest.headRef !== target.headRef
    || record.changeRequest.headSha !== target.headSha
  )) {
    return { kind: "blocked", detail: "The Errand identity's change request does not match the exact target." };
  }
  return { kind: "matched", record };
}

/**
 * Read this identity's stored claims while retaining the selected primary's exact generation. Another owner's
 * unreadable record never blocks a matched claim; it blocks only absence, which an incomplete listing cannot establish.
 */
export async function readStoredStatusErrandSelection(store: Store, identity: string, target: StatusTarget): Promise<ErrandStatusSelection> {
  const inventory = await acquireStoreErrands(store);
  if (inventory.kind === "absent") return { kind: "none" };
  if (inventory.kind === "error") return { kind: "blocked", detail: inventory.message };
  const claims = inventory.records.flatMap((saved) => {
    const record = inventory.decoded.get(saved.reference.owner.name);
    return record?.kind === "errand" && record.purpose === "errand" && record.owner === identity
      ? [{ record, workItem: saved.reference.owner }] : [];
  });
  const selected = matchingOrdinaryErrand(claims.map(claim => claim.record), target);
  if (selected.kind === "none" && (inventory.missed || inventory.diagnostics.length > 0)) return { kind: "blocked",
    detail: `The stored Errand inventory is incomplete. ${inventory.diagnostics.map(item => `${item.condition} ${item.remedy.text}`).join("; ") || "Restore the complete Errand inventory, then retry."}` };
  if (selected.kind !== "matched") return selected;
  const claim = claims.find(claim => claim.record === selected.record);
  if (claim === undefined) throw new Error("The selected Errand primary is unavailable. Retry status.");
  return { ...selected, workItem: claim.workItem };
}
