/** Exact explicit retry coordinates for competing approved-response roots. */
import { recordReferences, type OwnerIdentity } from "../../../identity.js";
import { StoreRefusalError } from "../../../refusal-error.js";
import { reviewEvidenceRootSelectionKey } from "./key.js";

/** Name the complete preview request without inferring a new choice. */
export function reviewRootSelectionPreviewRemedy(owner: OwnerIdentity, producerId: string): string {
  return `Run arc store repair-review-roots - with JSON ${JSON.stringify({ schemaVersion: 1, operation: "preview",
    workItem: owner, producerId })}, then explicitly apply a currently eligible choice using its fresh basis.`;
}

/** Retain the exact selector coordinate in a recoverable authority refusal. */
export function reviewRootSelectionRefusal(owner: OwnerIdentity, producerId: string, rule: string,
  condition: string, remedy?: string): StoreRefusalError {
  const reference = recordReferences["review/evidence-root-selection"](owner, reviewEvidenceRootSelectionKey(owner, producerId));
  return new StoreRefusalError({ code: "record-malformed", class: "recoverable", reference,
    rule: `review.evidence-root-selection.${rule}`, condition, remedy: { text: remedy ?? reviewRootSelectionPreviewRemedy(owner, producerId) } }, true);
}

/** Restore a selector whose own content or immutable binding cannot be inferred by choosing roots. */
export function reviewRootSelectionRestoreRemedy(owner: OwnerIdentity, producerId: string): string {
  const reference = recordReferences["review/evidence-root-selection"](owner, reviewEvidenceRootSelectionKey(owner, producerId));
  return `Restore the exact selector content and its immutable producer binding at ${JSON.stringify(reference)} before previewing root selection. ${reviewRootSelectionPreviewRemedy(owner, producerId)}`;
}
