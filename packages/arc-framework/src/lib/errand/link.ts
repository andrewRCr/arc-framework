/** Ordinary v3 Errand inbox-link composition. */

import { projectLocusIdentity, type TransientIdentityRecord } from "./identity-record.js";
import type { IdentityTransactionOutcome } from "./identity-transaction.js";
import {
  ORDINARY_ERRAND_INBOX_LINK_CONFLICT_REASON,
  type OrdinaryErrandRecord,
  type OrdinaryErrandTransition,
} from "./identity-transitions.js";
import { createLocusMutationResult } from "../locus/mutation.js";
import type { LocusMutationResultV1,
  LocusMutationErrorCode } from "../locus/schema/index.js";
import type { InspectedInboxEntry } from "../user-sync/inbox-writer.js";

type LinkTransition = Extract<OrdinaryErrandTransition, { kind: "link" }>;

/** Exact identity and inbox evidence boundaries for one v3 late-link operation. */
export interface LinkOrdinaryErrandDependencies {
  readIdentity(slug: string): Promise<IdentityTransactionOutcome<TransientIdentityRecord | null>>;
  transact(request: LinkTransition): Promise<IdentityTransactionOutcome<OrdinaryErrandRecord | null>>;
}

/** Complete v3 late-link request after the live inbox entry has been inspected under lock. */
export interface LinkOrdinaryErrandOptions {
  slug: string;
  inbox: InspectedInboxEntry;
  updatedAt: string;
  dependencies: LinkOrdinaryErrandDependencies;
}

/** Link one exact open v3 ordinary Errand generation to one live inbox generation. */
export async function linkOrdinaryErrand(
  options: LinkOrdinaryErrandOptions,
): Promise<LocusMutationResultV1> {
  const slug = options.slug.trim();
  if (slug === "") return linkRefusal("identity-conflict", "Errand slug must be non-empty.");
  let basis: IdentityTransactionOutcome<TransientIdentityRecord | null>;
  try {
    basis = await options.dependencies.readIdentity(slug);
  } catch (error) {
    return linkError("locus.errand-link.basis", errorMessage(error));
  }
  if (basis.kind === "error") return linkError(`locus.errand-link.${basis.stage}`, basis.message);
  if (basis.kind === "refused") return linkRefusal("identity-conflict", basis.reason);
  const record = basis.value;
  if (record === null) return linkRefusal("identity-conflict", `Errand identity '${slug}' does not exist.`);
  if (!isOrdinaryErrand(record)) {
    return linkRefusal("identity-conflict", `Identity '${slug}' is not a current ordinary Errand.`);
  }
  if (record.state !== "open") {
    return linkRefusal("identity-conflict", `Errand '${slug}' is not open.`);
  }
  if (record.origin === "inbox" && (
    record.originEntry !== options.inbox.title
    || record.originEntrySourceDigest !== options.inbox.sourceDigest
  )) {
    return linkRefusal("inbox-link-conflict", `Errand '${slug}' is already linked to another inbox capture.`);
  }
  let outcome: IdentityTransactionOutcome<OrdinaryErrandRecord | null>;
  try {
    outcome = await options.dependencies.transact({
      kind: "link",
      previous: record,
      originEntry: options.inbox.title,
      originEntrySourceDigest: options.inbox.sourceDigest,
      updatedAt: options.updatedAt,
    });
  } catch (error) {
    return linkError("locus.errand-link.identity", errorMessage(error));
  }
  if (outcome.kind === "refused") {
    return linkRefusal(
      outcome.reason === ORDINARY_ERRAND_INBOX_LINK_CONFLICT_REASON
        ? "inbox-link-conflict"
        : "identity-conflict",
      outcome.reason,
    );
  }
  if (outcome.kind === "error") return linkError(`locus.errand-link.${outcome.stage}`, outcome.message);
  if (outcome.value === null) return linkError("locus.errand-link.identity", "Identity transaction returned no record");
  return createLocusMutationResult({
    outcome: outcome.kind,
    operation: "errand-link",
    allocation: null,
    recordId: null,
    leaseId: null,
    activeLocusPath: null,
    sessionHomePath: null,
    identity: projectLocusIdentity(outcome.value),
    originEntry: outcome.value.originEntry,
    restoredParent: null,
    nextOffer: null,
    recommendedPromptText: outcome.kind === "applied"
      ? `Linked Errand '${slug}' to inbox capture '${outcome.value.originEntry}'.`
      : `Errand '${slug}' is already linked to inbox capture '${outcome.value.originEntry}'.`,
  });
}

function linkRefusal(
  reason: "identity-conflict" | "inbox-link-conflict",
  message: string,
): LocusMutationResultV1 {
  return createLocusMutationResult({
    outcome: "refused",
    operation: "errand-link",
    reason,
    recommendedPromptText: message,
  });
}

function linkError(code: LocusMutationErrorCode, message: string): LocusMutationResultV1 {
  return createLocusMutationResult({
    outcome: "error",
    operation: "errand-link",
    error: { code, message: message || "Errand link failed" },
    recommendedPromptText: "Re-read the inbox and identity evidence before retrying.",
  });
}

function isOrdinaryErrand(record: TransientIdentityRecord): record is OrdinaryErrandRecord {
  return record.kind === "errand" && record.purpose === "errand";
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
