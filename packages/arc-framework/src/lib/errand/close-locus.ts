/** Exact merged-tail finalization for ordinary v3 Errands. */

import { createLocusMutationResult } from "../locus/mutation.js";
import type {
  LocusMutationResultV1,
  LocusRefusalReason,
  LocusMutationErrorCode,
} from "../locus/schema/index.js";
import type { LocusChangeRequestV1 } from "../locus/schema/index.js";
import type { TransientIdentityRecord } from "./identity-record.js";
import type { OrdinaryErrandRecord } from "./identity-transitions.js";
import type { ChangeRequestLifecycleEvidence } from "./change-request-lifecycle.js";

type IdentityRead =
  | { kind: "ready"; record: TransientIdentityRecord | null }
  | { kind: "refused"; reason: string }
  | { kind: "error"; message: string };

/**
 * The exact change request close finalizes against, paired with the record that owns it.
 *
 * An Errand that left first carries its change request on the record; one that stayed in its
 * checkout through its own merge carries none, so the coordinates are observed at finalization
 * instead. Both arms reach every later step through this one target, so ref cleanup and
 * retirement authorization read the same coordinates host truth was proven against.
 */
export interface CloseTarget {
  readonly record: OrdinaryErrandRecord;
  readonly changeRequest: LocusChangeRequestV1;
}

export type CloseTargetResolution =
  | { kind: "resolved"; changeRequest: LocusChangeRequestV1 }
  | { kind: "refused"; reason: LocusRefusalReason; message: string }
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
  | { kind: "refused"; reason: string }
  | { kind: "error"; message: string };

type RetirementResult =
  | { kind: "applied" | "idempotent" }
  | { kind: "refused"; reason: string }
  | { kind: "error"; message: string };

/** Renewable proof that a base-context close still occupies its authorized checkout state. */
export type CloseAuthorityResult =
  | { kind: "valid" }
  | { kind: "refused"; reason: LocusRefusalReason; message: string }
  | { kind: "error"; message: string };

export type CloseAuthorityLeaseResult =
  | { kind: "acquired"; release(): Promise<void> }
  | Extract<CloseAuthorityResult, { kind: "refused" | "error" }>;

export interface CloseAuthorityGuard {
  revalidate(): Promise<CloseAuthorityResult>;
  acquire(): Promise<CloseAuthorityLeaseResult>;
}

/**
 * What local occupancy permits for the exact Errand under close.
 *
 * Required rather than optional: an omitted reading would silently restore the unguarded path, in
 * which host truth alone authorized deleting refs beneath a checkout another session still holds.
 */
export type CloseOccupancyResult =
  | { kind: "clear"; guard: CloseAuthorityGuard | null }
  | { kind: "refused"; reason: LocusRefusalReason; message: string }
  | { kind: "error"; message: string };

export interface CloseOrdinaryErrandDependencies {
  readIdentity(): Promise<IdentityRead>;
  resolveTarget(record: OrdinaryErrandRecord): Promise<CloseTargetResolution>;
  readLifecycle(target: CloseTarget): Promise<ChangeRequestLifecycleEvidence>;
  readOccupancy(record: OrdinaryErrandRecord): Promise<CloseOccupancyResult>;
  cleanupRefs(target: CloseTarget, guard: CloseAuthorityGuard | null): Promise<CloseRefCleanupResult>;
  removeInbox(record: OrdinaryErrandRecord): Promise<CloseInboxResult>;
  retire(target: CloseTarget, lifecycle: ChangeRequestLifecycleEvidence): Promise<RetirementResult>;
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
  if (!isCloseableOrdinary(read.record) || read.record.slug !== slug) {
    return refusal("identity-conflict", `Identity '${slug}' is not a closeable ordinary v3 Errand.`);
  }
  const record = read.record;

  let resolution: CloseTargetResolution;
  try {
    resolution = await options.dependencies.resolveTarget(record);
  } catch (error) {
    return failure("locus.errand-close.change-request", message(error));
  }
  if (resolution.kind === "refused") return refusal(resolution.reason, resolution.message);
  if (resolution.kind === "error") return failure("locus.errand-close.change-request", resolution.message);
  const target: CloseTarget = { record, changeRequest: resolution.changeRequest };

  let lifecycle: ChangeRequestLifecycleEvidence;
  try {
    lifecycle = await options.dependencies.readLifecycle(target);
  } catch (error) {
    return failure("locus.errand-close.host", message(error));
  }
  if (lifecycle.kind !== "merged" || !sameChangeRequest(lifecycle, target.changeRequest)) {
    return refusal(
      lifecycle.kind === "open" || lifecycle.kind === "requested-work"
        ? "change-request-open"
        : "change-request-unverifiable",
      `Exact host truth is '${lifecycle.kind}', not merged.`,
    );
  }

  // Read immediately before the first destructive step: ref deletion, capture removal, and
  // retirement all proceed on host truth, which says nothing about who holds the checkout.
  let occupancy: CloseOccupancyResult;
  try {
    occupancy = await options.dependencies.readOccupancy(record);
  } catch (error) {
    return failure("locus.errand-close.occupancy", message(error));
  }
  if (occupancy.kind === "refused") return refusal(occupancy.reason, occupancy.message);
  if (occupancy.kind === "error") return failure("locus.errand-close.occupancy", occupancy.message);

  return runWithCloseAuthority(occupancy.guard, () => finalizeAuthorizedClose({
    options,
    target,
    lifecycle,
    record,
    guard: occupancy.guard,
    slug,
  }));
}

async function finalizeAuthorizedClose(input: {
  options: CloseOrdinaryErrandOptions;
  target: CloseTarget;
  lifecycle: ChangeRequestLifecycleEvidence;
  record: OrdinaryErrandRecord;
  guard: CloseAuthorityGuard | null;
  slug: string;
}): Promise<LocusMutationResultV1> {
  const { options, target, lifecycle, record, guard, slug } = input;

  let refs: CloseRefCleanupResult;
  try {
    refs = await options.dependencies.cleanupRefs(target, guard);
  } catch (error) {
    return failure("locus.errand-close.refs", message(error));
  }
  if (refs.kind === "refused") return refusal(refs.reason, refs.message);
  if (refs.kind === "error") return failure("locus.errand-close.refs", refs.message);

  const captureAuthority = await revalidateCloseAuthority(guard);
  if (captureAuthority.kind === "refused") {
    return refusal(captureAuthority.reason, captureAuthority.message);
  }
  if (captureAuthority.kind === "error") {
    return failure("locus.errand-close.occupancy", captureAuthority.message);
  }

  let inbox: CloseInboxResult;
  try {
    inbox = await options.dependencies.removeInbox(record);
  } catch (error) {
    return failure("locus.errand-close.inbox", message(error));
  }
  if (inbox.kind === "error") return failure("locus.errand-close.inbox", inbox.message);
  if (inbox.kind === "refused") {
    return refusal("identity-conflict", `Errand refs were cleaned up, but capture settlement refused: ${inbox.reason}`);
  }

  const retirementAuthority = await revalidateCloseAuthority(guard);
  if (retirementAuthority.kind === "refused") {
    return refusal(retirementAuthority.reason, retirementAuthority.message);
  }
  if (retirementAuthority.kind === "error") {
    return failure("locus.errand-close.occupancy", retirementAuthority.message);
  }

  let retired: RetirementResult;
  try {
    retired = await options.dependencies.retire(target, lifecycle);
  } catch (error) {
    return failure("locus.errand-close.identity", message(error));
  }
  if (retired.kind === "refused") {
    return refusal("identity-conflict", `Errand refs were cleaned up, but identity retirement refused: ${retired.reason}`);
  }
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
    restoredParent: null,
    nextOffer: inbox.nextOffer,
    recommendedPromptText: `Finalized merged Errand '${slug}' and retired its identity.`,
  });
}

async function runWithCloseAuthority(
  guard: CloseAuthorityGuard | null,
  operation: () => Promise<LocusMutationResultV1>,
): Promise<LocusMutationResultV1> {
  if (guard === null) return operation();
  let acquired: CloseAuthorityLeaseResult;
  try {
    acquired = await guard.acquire();
  } catch (error) {
    return failure("locus.errand-close.occupancy", message(error));
  }
  if (acquired.kind === "refused") return refusal(acquired.reason, acquired.message);
  if (acquired.kind === "error") return failure("locus.errand-close.occupancy", acquired.message);

  let result: LocusMutationResultV1;
  try {
    result = await operation();
  } catch (error) {
    result = failure("locus.errand-close.occupancy", message(error));
  }
  try {
    await acquired.release();
  } catch (error) {
    return failure(
      "locus.errand-close.occupancy",
      `Errand close could not release checkout authority: ${message(error)}`,
    );
  }
  return result;
}

async function revalidateCloseAuthority(guard: CloseAuthorityGuard | null): Promise<CloseAuthorityResult> {
  if (guard === null) return { kind: "valid" };
  try {
    return await guard.revalidate();
  } catch (error) {
    return { kind: "error", message: message(error) };
  }
}

/**
 * States a merged tail can be finalized from: `awaiting-merge` when the identity already
 * carries exact change-request coordinates, or `open` when the checkout stayed through its
 * own merge. A paused Errand has no change request to finalize and resumes instead.
 */
function isCloseableOrdinary(record: TransientIdentityRecord): record is OrdinaryErrandRecord {
  return record.version === 3 && record.kind === "errand" && record.purpose === "errand"
    && (record.state === "awaiting-merge" || record.state === "open");
}

function sameChangeRequest(
  evidence: ChangeRequestLifecycleEvidence,
  changeRequest: LocusChangeRequestV1,
): boolean {
  const left = evidence.changeRequest;
  return left.repositoryRef === changeRequest.repositoryRef && left.hostRef === changeRequest.hostRef
    && left.baseRef === changeRequest.baseRef && left.headRef === changeRequest.headRef
    && left.headSha === changeRequest.headSha;
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

function failure(code: LocusMutationErrorCode, text: string): LocusMutationResultV1 {
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
