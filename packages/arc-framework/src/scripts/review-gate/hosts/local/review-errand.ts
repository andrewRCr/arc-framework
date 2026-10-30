/** Resolve the checkout's exact Errand claim without borrowing an identity-ref snapshot. */
import { readWorktreeMarker, decodeWorktreeMarkerOwnership } from "../../../../lib/git/worktree-marker.js";
import { deserializeTransientIdentityRecord, type TransientIdentityRecord } from "../../../../lib/errand/identity-record.js";
import { acquireStoreErrands } from "../../../../lib/errand/store-discovery.js";
import type { Store } from "../../../../lib/store/contract.js";
import type { StoreRecord } from "../../../../lib/store/read.js";
import { CheckoutClaimSchema } from "../../../../lib/store/lookup.js";
import { sameReference, type RecordReference, type OwnerIdentity } from "../../../../lib/store/identity.js";
import { describeRecordConflicts } from "../../../../lib/store/conflict-diagnostics.js";
import type { StoreRefusal } from "../../../../lib/store/refusal.js";
import { StoreRefusalError } from "../../../../lib/store/refusal-error.js";

/** An ordinary Errand whose exact generation was corroborated by its stored primary. */
export type ReviewCheckoutErrand = Extract<TransientIdentityRecord, { kind: "errand"; purpose: "errand" }>;
/** Authenticated claim content and the exact primary generation returned by its lookup. */
export interface ReviewCheckoutErrandSelection { record: ReviewCheckoutErrand; workItem: OwnerIdentity }
type ErrandClaim = { kind: "errand"; slug: string; claimId: string };

async function missingClaim(store: Store, claim: ErrandClaim): Promise<null> {
  const inventory = await acquireStoreErrands(store);
  if (inventory.kind === "error") throw new Error(`Errand ${claim.slug}: ${inventory.message}`);
  if (inventory.kind === "complete" && (inventory.missed || inventory.diagnostics.length > 0)) {
    const detail = inventory.diagnostics.map(item => `${item.key}: ${item.condition} ${item.remedy.text}`).join("; ");
    throw new Error(`Errand ${claim.slug} (${claim.claimId}) was not found in an incomplete inventory. ${detail || "Restore the complete Errand inventory, then retry."}`);
  }
  return null;
}

function decodeClaim(record: StoreRecord, reference: RecordReference, claim: ErrandClaim): ReviewCheckoutErrand {
  const decoded = deserializeTransientIdentityRecord(record.content, claim.slug);
  if (!sameReference(record.reference, reference) || record.reference.kind !== "work-item/record"
    || record.reference.owner.name !== claim.slug || record.placement?.kind !== "active"
    || decoded.kind !== "valid" || decoded.record.kind !== "errand" || decoded.record.purpose !== "errand"
    || decoded.record.claimId !== claim.claimId) {
    throw new Error(`Errand ${claim.slug} (${claim.claimId}) does not match its stored claim: ${JSON.stringify(reference)}. Repair the named record and checkout claim, then retry.`);
  }
  return decoded.record;
}

function claimRefusal(store: Store, claim: ErrandClaim, refusal: StoreRefusal): Error {
  if (store.capabilities.stateOffBranch) return new StoreRefusalError(refusal, true);
  return new Error(`Errand ${claim.slug} (${claim.claimId}): ${refusal.condition} ${refusal.remedy.text}`);
}

async function readClaim(store: Store, reference: RecordReference, claim: ErrandClaim): Promise<ReviewCheckoutErrandSelection | null> {
  const read = await store.read({ reference });
  if (read.status === "refused") {
    if (read.refusal.code === "not-found") return missingClaim(store, claim);
    throw claimRefusal(store, claim, read.refusal);
  }
  if (read.result.conflicts.length > 0) throw new Error(
    `Errand ${claim.slug} has unresolved conflicts.${describeRecordConflicts(read.result.conflicts)}`);
  return { record: decodeClaim(read.result, reference, claim), workItem: read.result.reference.owner };
}

/** Read a marker-selected Errand, consulting inventory diagnostics only after an authoritative miss. */
export async function readReviewCheckoutErrandSelection(input: { cwd: string; store: Store }): Promise<ReviewCheckoutErrandSelection | null> {
  const marker = await readWorktreeMarker(input.cwd);
  if (marker.kind === "absent") return null;
  if (marker.kind === "malformed") throw new Error(`The checkout claim is unreadable: ${marker.message}. Repair the checkout marker, then retry.`);
  const decoded = decodeWorktreeMarkerOwnership(marker.marker);
  if (decoded.kind !== "current" || decoded.subject.kind !== "errand") return null;
  const claim = CheckoutClaimSchema.parse({ kind: "errand", slug: decoded.subject.slug, claimId: decoded.subject.claimId });
  if (claim.kind !== "errand") throw new Error("Expected an Errand checkout claim");
  const found = await input.store.lookup({ kind: "claim", claim });
  if (found.status === "refused" && found.refusal.code === "not-found") return missingClaim(input.store, claim);
  if (found.status === "refused") throw claimRefusal(input.store, claim, found.refusal);
  return readClaim(input.store, found.result.reference, claim);
}
