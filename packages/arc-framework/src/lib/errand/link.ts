/**
 * `linkErrandToInbox` — attach an existing errand record to a USER-INBOX capture.
 *
 * The usual producer path records the inbox back-pointer at `arc errand open
 * --from-inbox`. This helper covers the later-realized case: an errand was
 * opened from a free description, then the operator recognizes it as satisfying
 * an existing capture. Updating the record lets the normal close/promote cleanup
 * drop that capture automatically.
 *
 * @module
 */

import { reconcileErrandPush, type ErrandPushOutcome } from "./merge.js";
import { readErrandRecord, writeErrandRecord, type ErrandRecord } from "./record.js";
import type { ErrandRecordIO } from "./ref-tree.js";
import { projectLocusIdentity, type TransientIdentityRecord } from "./identity-record.js";
import type { IdentityTransactionOutcome } from "./identity-transaction.js";
import type { OrdinaryErrandRecord, OrdinaryErrandTransition } from "./identity-transitions.js";
import { createLocusMutationResult } from "../locus/mutation.js";
import type { LocusMutationResultV1,
  LocusMutationErrorCode } from "../locus/schema/index.js";
import type { InspectedInboxEntry } from "../user-sync/inbox-writer.js";

type LinkTransition = Extract<OrdinaryErrandTransition, { kind: "link" }>;

/** Exact identity and inbox evidence boundaries for one v3 late-link operation. */
export interface LinkOrdinaryErrandDependencies {
  readIdentity(): Promise<IdentityTransactionOutcome<TransientIdentityRecord | null>>;
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
    basis = await options.dependencies.readIdentity();
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
  if (record.origin === "inbox" && record.originEntry !== options.inbox.title) {
    return linkRefusal("inbox-link-conflict", `Errand '${slug}' is already linked to another inbox capture.`);
  }
  let outcome: IdentityTransactionOutcome<OrdinaryErrandRecord | null>;
  try {
    outcome = await options.dependencies.transact({
      kind: "link",
      previous: record,
      originEntry: options.inbox.title,
      updatedAt: options.updatedAt,
    });
  } catch (error) {
    return linkError("locus.errand-link.identity", errorMessage(error));
  }
  if (outcome.kind === "refused") return linkRefusal("identity-conflict", outcome.reason);
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
  return record.version === 3 && record.kind === "errand" && record.purpose === "errand";
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Operands for {@link linkErrandToInbox}. */
export interface LinkErrandToInboxParams {
  /** The errand slug — its logical identity and the record's tree key. */
  slug: string;
  /** Originating USER-INBOX entry title to drop when the errand closes or promotes. */
  originEntry: string;
}

/** Outcome of {@link linkErrandToInbox}. */
export type LinkErrandToInboxResult =
  | { kind: "linked"; record: ErrandRecord; changed: boolean; push: ErrandPushOutcome }
  | { kind: "link-conflict"; record: ErrandRecord; requestedEntry: string }
  | { kind: "no-record"; slug: string };

/**
 * Link an in-flight errand to an existing inbox capture.
 *
 * Resolves the record by slug — an absent record is `no-record`. Otherwise the
 * record becomes `inbox`-origin with the supplied back-pointer. Re-linking to
 * the same entry is idempotent: it skips the write but still reconciles the
 * errand ref, so a previously-unpushed record can catch up. Re-linking an
 * already-inbox-origin record to a different entry refuses, because the old
 * capture would otherwise lose its only automatic cleanup path.
 * Legacy records refuse before this mutation; the v3 transaction path owns current identities.
 *
 * @param io - Injected git seams and identity.
 * @param params - The errand slug and inbox entry title.
 * @returns The link outcome — linked or no-record.
 */
export async function linkErrandToInbox(
  io: ErrandRecordIO,
  params: LinkErrandToInboxParams,
): Promise<LinkErrandToInboxResult> {
  const slug = params.slug.trim();
  if (slug === "") throw new Error("linkErrandToInbox: slug must be non-empty");
  const originEntry = params.originEntry.trim();
  if (originEntry === "") throw new Error("linkErrandToInbox: originEntry must be non-empty");

  const record = await readErrandRecord(io, slug, "link");
  if (record === null) return { kind: "no-record", slug };
  if (record.origin === "inbox" && record.originEntry !== originEntry) {
    return { kind: "link-conflict", record, requestedEntry: originEntry };
  }

  const linked: ErrandRecord = { ...record, origin: "inbox", originEntry };
  const changed = record.origin !== "inbox" || record.originEntry !== originEntry;
  if (changed) await writeErrandRecord(io, linked);
  const push = await reconcileErrandPush(io);

  return { kind: "linked", record: linked, changed, push };
}
