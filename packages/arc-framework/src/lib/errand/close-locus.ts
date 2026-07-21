/** Exact merged-tail finalization for ordinary v3 Errands. */

import { createLocusMutationResult } from "../locus/mutation.js";
import type {
  LocusMutationResultV1,
  LocusRefusalReason,
} from "../locus/schema/index.js";
import type { TransientIdentityRecord } from "./identity-record.js";
import type { OrdinaryErrandRecord } from "./identity-transitions.js";
import type { ChangeRequestLifecycleEvidence } from "./change-request-lifecycle.js";

type IdentityRead =
  | { kind: "ready"; record: TransientIdentityRecord | null }
  | { kind: "refused"; reason: string }
  | { kind: "error"; message: string };

export type CloseRefCleanupResult =
  | { kind: "applied" | "idempotent" }
  | { kind: "refused"; reason: LocusRefusalReason; message: string }
  | { kind: "error"; message: string };

export type CloseInboxResult =
  | {
      kind: "removed" | "absent";
      nextOffer: Extract<LocusMutationResultV1, { outcome: "applied" | "idempotent" }>["nextOffer"];
    }
  | { kind: "error"; message: string };

type RetirementResult =
  | { kind: "applied" | "idempotent" }
  | { kind: "refused"; reason: string }
  | { kind: "error"; message: string };

export interface CloseOrdinaryErrandDependencies {
  readIdentity(): Promise<IdentityRead>;
  readLifecycle(record: OrdinaryErrandRecord): Promise<ChangeRequestLifecycleEvidence>;
  cleanupRefs(record: OrdinaryErrandRecord): Promise<CloseRefCleanupResult>;
  removeInbox(record: OrdinaryErrandRecord): Promise<CloseInboxResult>;
  retire(record: OrdinaryErrandRecord, lifecycle: ChangeRequestLifecycleEvidence): Promise<RetirementResult>;
}

export interface CloseOrdinaryErrandOptions {
  slug: string;
  protection: "full" | "partial";
  force: boolean;
  dependencies: CloseOrdinaryErrandDependencies;
}

/** Finalize one identity-only merged tail without treating branch shape as merge proof. */
export async function closeOrdinaryErrand(
  options: CloseOrdinaryErrandOptions,
): Promise<LocusMutationResultV1> {
  if (options.protection !== "full") {
    return refusal("full-protection-required", "Errand close requires full branch protection.");
  }
  if (options.force) return refusal("identity-conflict", "Current v3 Errands never permit close --force.");
  const slug = options.slug.trim();
  if (slug === "") return refusal("identity-conflict", "Errand slug must be non-empty.");

  let read: IdentityRead;
  try {
    read = await options.dependencies.readIdentity();
  } catch (error) {
    return failure("locus.errand-close.identity-read", message(error));
  }
  if (read.kind === "refused") return refusal("identity-conflict", read.reason);
  if (read.kind === "error") return failure("locus.errand-close.identity-read", read.message);
  if (read.record === null) return alreadyFinalized(slug);
  if (!isAwaitingOrdinary(read.record) || read.record.slug !== slug) {
    return refusal("identity-conflict", `Identity '${slug}' is not an awaiting ordinary v3 Errand.`);
  }
  const record = read.record;

  let lifecycle: ChangeRequestLifecycleEvidence;
  try {
    lifecycle = await options.dependencies.readLifecycle(record);
  } catch (error) {
    return failure("locus.errand-close.host", message(error));
  }
  if (lifecycle.kind !== "merged" || !sameChangeRequest(lifecycle, record)) {
    return refusal(
      lifecycle.kind === "open" || lifecycle.kind === "requested-work"
        ? "change-request-open"
        : "change-request-unverifiable",
      `Exact host truth is '${lifecycle.kind}', not merged.`,
    );
  }

  let refs: CloseRefCleanupResult;
  try {
    refs = await options.dependencies.cleanupRefs(record);
  } catch (error) {
    return failure("locus.errand-close.refs", message(error));
  }
  if (refs.kind === "refused") return refusal(refs.reason, refs.message);
  if (refs.kind === "error") return failure("locus.errand-close.refs", refs.message);

  let inbox: CloseInboxResult;
  try {
    inbox = await options.dependencies.removeInbox(record);
  } catch (error) {
    return failure("locus.errand-close.inbox", message(error));
  }
  if (inbox.kind === "error") return failure("locus.errand-close.inbox", inbox.message);

  let retired: RetirementResult;
  try {
    retired = await options.dependencies.retire(record, lifecycle);
  } catch (error) {
    return failure("locus.errand-close.identity", message(error));
  }
  if (retired.kind === "refused") return refusal("identity-conflict", retired.reason);
  if (retired.kind === "error") return failure("locus.errand-close.identity", retired.message);

  const outcome = refs.kind === "applied" || inbox.kind === "removed" || retired.kind === "applied"
    ? "applied"
    : "idempotent";
  return createLocusMutationResult({
    outcome,
    operation: "errand-close",
    allocation: null,
    recordId: null,
    leaseId: null,
    activeLocusPath: null,
    sessionHomePath: null,
    identity: null,
    originEntry: record.originEntry,
    dispatchId: record.dispatchId,
    routingPlanDigest: null,
    restoredParent: null,
    nextOffer: inbox.nextOffer,
    recommendedPromptText: `Finalized merged Errand '${slug}' and retired its identity.`,
  });
}

function isAwaitingOrdinary(record: TransientIdentityRecord): record is OrdinaryErrandRecord {
  return record.version === 3 && record.kind === "errand" && record.purpose === "errand"
    && record.state === "awaiting-merge";
}

function sameChangeRequest(evidence: ChangeRequestLifecycleEvidence, record: OrdinaryErrandRecord): boolean {
  if (record.state !== "awaiting-merge") return false;
  const left = evidence.changeRequest;
  const right = record.changeRequest;
  return left.repositoryRef === right.repositoryRef && left.hostRef === right.hostRef
    && left.baseRef === right.baseRef && left.headRef === right.headRef && left.headSha === right.headSha;
}

function alreadyFinalized(slug: string): LocusMutationResultV1 {
  return createLocusMutationResult({
    outcome: "idempotent",
    operation: "errand-close",
    allocation: null,
    recordId: null,
    leaseId: null,
    activeLocusPath: null,
    sessionHomePath: null,
    identity: null,
    originEntry: null,
    dispatchId: null,
    routingPlanDigest: null,
    restoredParent: null,
    nextOffer: null,
    recommendedPromptText: `Errand '${slug}' is already finalized.`,
  });
}

function refusal(reason: LocusRefusalReason, text: string): LocusMutationResultV1 {
  return createLocusMutationResult({
    outcome: "refused",
    operation: "errand-close",
    reason,
    recommendedPromptText: text,
  });
}

function failure(code: string, text: string): LocusMutationResultV1 {
  return createLocusMutationResult({
    outcome: "error",
    operation: "errand-close",
    error: { code, message: text || "Errand close failed" },
    recommendedPromptText: "Inspect the retained Errand identity and exact ref evidence before retrying.",
  });
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
