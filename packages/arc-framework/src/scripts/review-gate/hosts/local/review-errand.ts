/** Resolve the checkout's exact Errand claim without borrowing an identity-ref snapshot. */
import { readWorktreeMarker, decodeWorktreeMarkerOwnership } from "../../../../lib/git/worktree-marker.js";
import { deserializeTransientIdentityRecord, type TransientIdentityRecord } from "../../../../lib/errand/identity-record.js";
import { acquireStoreErrandsWithFailure } from "../../../../lib/errand/store-discovery.js";
import type { Store } from "../../../../lib/store/contract.js";
import type { StoreRecord } from "../../../../lib/store/read.js";
import { CheckoutClaimSchema } from "../../../../lib/store/lookup.js";
import { sameReference, type RecordReference, type OwnerIdentity } from "../../../../lib/store/identity.js";
import { recordConflictRefusal } from "../../../../lib/store/conflict-diagnostics.js";
import type { StoreRefusal } from "../../../../lib/store/refusal.js";
import { StoreRefusalError } from "../../../../lib/store/refusal-error.js";

/** An ordinary Errand whose exact generation was corroborated by its stored primary. */
export type ReviewCheckoutErrand = Extract<TransientIdentityRecord, { kind: "errand"; purpose: "errand" }>;
/** Authenticated claim content and the exact primary generation returned by its lookup. */
interface ReviewCheckoutErrandSelection { record: ReviewCheckoutErrand; workItem: OwnerIdentity }
type ErrandClaim = { kind: "errand"; slug: string; claimId: string };

// A native store's inventory failure refuses typed, as an incomplete review listing does; in-repo keeps its message.
async function missingClaim(store: Store, claim: ErrandClaim): Promise<null> {
  const { acquisition: inventory, failure } = await acquireStoreErrandsWithFailure(store);
  if (inventory.kind === "error") {
    if (!store.capabilities.stateOffBranch || failure === undefined) throw new Error(`Errand ${claim.slug}: ${inventory.message}`);
    throw claimRefusal(store, claim, failure.kind === "refused" ? failure.refusal : { code: "record-malformed", class: "recoverable",
      rule: "review.errand-inventory-unreadable", condition: failure.condition, remedy: failure.remedy });
  }
  if (inventory.kind === "complete" && (inventory.missed || inventory.diagnostics.length > 0)) {
    const detail = inventory.diagnostics.map(item => `${item.key}: ${item.condition} ${item.remedy.text}`).join("; ");
    const missing = `Errand ${claim.slug} (${claim.claimId}) was not found in an incomplete inventory.`;
    if (!store.capabilities.stateOffBranch) throw new Error(`${missing} ${detail || "Restore the complete Errand inventory, then retry."}`);
    const remedies = [...new Set(inventory.diagnostics.map(item => item.remedy.text))];
    throw new StoreRefusalError({ code: "record-malformed", class: "recoverable", rule: "review.errand-inventory-incomplete",
      condition: [missing, ...inventory.diagnostics.map(item => `${item.key}: ${item.condition}`)].join(" "),
      remedy: { text: remedies.length > 0 ? remedies.join(" ") : "Restore the complete Errand inventory, then retry." } }, true);
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
  const condition = `Errand ${claim.slug} (${claim.claimId}): ${refusal.condition}`;
  if (store.capabilities.stateOffBranch) return new StoreRefusalError({ ...refusal, condition }, true);
  return new Error(`${condition} ${refusal.remedy.text}`);
}

async function readClaim(store: Store, reference: RecordReference, claim: ErrandClaim): Promise<ReviewCheckoutErrandSelection | null> {
  const read = await store.read({ reference });
  if (read.status === "refused") {
    if (read.refusal.code === "not-found") return missingClaim(store, claim);
    throw claimRefusal(store, claim, read.refusal);
  }
  if (read.result.conflicts.length > 0) {
    const refusal = recordConflictRefusal(read.result, `Errand ${claim.slug}`, "review.errand-claim-conflict");
    throw store.capabilities.stateOffBranch ? new StoreRefusalError(refusal, true) : new Error(`${refusal.condition} ${refusal.remedy.text}`);
  }
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
