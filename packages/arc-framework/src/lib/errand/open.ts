/** Ordinary v3 Errand open composition. */

import {
  planLocusAllocation,
  type LocusAllocationPlanningRefusalReason,
} from "../locus/allocator.js";
import type {
  ProvisioningEvidence,
  ProvisionTransientLocusOptions,
  ProvisionTransientLocusResult,
  ProvisioningRefusalReason,
} from "../locus/provisioning.js";
import type { DerivedLocusFrame } from "../locus/derived-reader.js";
import { SlugSchema } from "../kernel/index.js";
import {
  createErrandOperationResult,
  type ErrandOperationResult,
} from "./operation-result.js";
import {
  mintClaimId as mintIdentityClaimId,
  projectLocusIdentity,
  type TransientIdentityRecord,
  TransientIdentityRecordV3Schema,
} from "./identity-record.js";
import type {
  OrdinaryErrandRecord,
  PauseHeadEvidence,
} from "./identity-transitions.js";
import type { ChangeRequestLifecycleEvidence } from "./change-request-lifecycle.js";
import type { InspectedInboxEntry } from "../user-sync/inbox-writer.js";
import type { ErrandErrorCode, ErrandRefusalReason } from "./result-common.js";

type ClaimResult =
  | { kind: "applied" | "idempotent"; record: OrdinaryErrandRecord }
  | { kind: "refused"; reason: string }
  | { kind: "error"; message: string };

export type ResumeAuthorization = PauseHeadEvidence | ChangeRequestLifecycleEvidence;
type IdentityReadResult =
  | { kind: "ready"; record: TransientIdentityRecord | null }
  | { kind: "refused"; reason: string }
  | { kind: "error"; message: string };
type OpenRecoveryResult =
  | { kind: "ready"; expectedBranchHead: string | null }
  | { kind: "refused"; reason: string }
  | { kind: "error"; message: string };
export type ResumeAuthorizationResult =
  | { kind: "authorized"; authorization: ResumeAuthorization; advisory?: string }
  | { kind: "refused"; reason: string }
  | { kind: "error"; message: string };

/** Whether a failed open left state that requires its prepared branch to remain available. */
export type OpenRollbackDisposition = "not-required" | "complete" | "retained-or-unknown";

/** Internal execution result carrying recovery evidence separately from the public mutation result. */
export interface OpenOrdinaryErrandExecution {
  readonly result: ErrandOperationResult;
  readonly rollbackDisposition: OpenRollbackDisposition;
}

/** Injected authority and local-provisioning boundaries for ordinary Errand open. */
export interface OpenOrdinaryErrandDependencies {
  mintClaimId?: () => string;
  readFrame(): Promise<DerivedLocusFrame>;
  readIdentity(): Promise<IdentityReadResult>;
  recoverOpen?: (record: OrdinaryErrandRecord) => Promise<OpenRecoveryResult>;
  authorizeResume?(record: OrdinaryErrandRecord): Promise<ResumeAuthorizationResult>;
  claim(record: OrdinaryErrandRecord): Promise<ClaimResult>;
  resume?(
    record: OrdinaryErrandRecord,
    authorization: ResumeAuthorization,
    updatedAt: string,
  ): Promise<ClaimResult>;
  rollbackClaim(record: OrdinaryErrandRecord): Promise<{ kind: "rolled-back" | "generation-mismatch" }>;
  rollbackResume?: (
    previous: OrdinaryErrandRecord,
    resumed: OrdinaryErrandRecord,
  ) => Promise<{ kind: "rolled-back" | "generation-mismatch" }>;
  observeRollbackDisposition?: (disposition: Exclude<OpenRollbackDisposition, "not-required">) => void;
  provision(options: Omit<ProvisionTransientLocusOptions, "dependencies">): Promise<ProvisionTransientLocusResult>;
}

/** Complete ordinary Errand open request, independent of CLI rendering. */
export interface OpenOrdinaryErrandOptions {
  slug: string;
  intent?: string;
  inbox?: InspectedInboxEntry | null;
  protection: "full" | "partial";
  base: string;
  createdAt: string;
  identityName: string;
  locationTemplate: string;
  repo: string;
  /** Placement posture; callers may require a fresh isolated checkout. */
  isolation?: "prefer-primary" | "require-isolation";
  dependencies: OpenOrdinaryErrandDependencies;
}

/** Claim, allocate, and provision one ordinary Errand without displacing a WU checkout. */
export async function openOrdinaryErrand(
  options: OpenOrdinaryErrandOptions,
): Promise<ErrandOperationResult> {
  const requestedSlug = options.slug.trim();
  if (requestedSlug === "") return openRefusal("identity-conflict", "Errand slug must be non-empty.");
  const parsedSlug = SlugSchema.safeParse(requestedSlug);
  if (!parsedSlug.success) return openRefusal("identity-conflict", "Errand slug must be valid.");
  const slug = parsedSlug.data;
  const originEntry = options.inbox?.title.trim() || null;
  const originEntrySourceDigest = originEntry === null ? null : options.inbox?.sourceDigest ?? null;

  let frame: DerivedLocusFrame;
  try {
    frame = await options.dependencies.readFrame();
  } catch (error) {
    return openError("locus.errand-open.state", error instanceof Error ? error.message : String(error));
  }
  const parent = warmWorkUnitParent(frame);
  if (parent.kind === "refused") return openRefusal(parent.reason, `Errand open refused: ${parent.reason}.`);

  const branch = options.protection === "full" ? `chore/${slug}` : null;
  let record: OrdinaryErrandRecord | null = null;
  let previousRecord: OrdinaryErrandRecord | null = null;
  let expectedBranchHead: string | null = null;
  let resumeAdvisory: string | null = null;
  let claimKind: "applied" | "idempotent" | null = null;
  if (options.protection === "full") {
    let read: IdentityReadResult;
    try {
      read = await options.dependencies.readIdentity();
    } catch (error) {
      return openError("locus.errand-open.identity-read", error instanceof Error ? error.message : String(error));
    }
    if (read.kind === "refused") return openRefusal("identity-conflict", read.reason);
    if (read.kind === "error") return openError("locus.errand-open.identity-read", read.message);
    const existing = read.record;
    if (existing !== null) {
      if (existing.kind !== "errand" || existing.purpose !== "errand") {
        return openRefusal("identity-conflict", `Identity '${slug}' is not a resumable ordinary v3 Errand.`);
      }
      const continuity = validateResumeContinuity(
        existing,
        options.intent,
        originEntry,
        originEntrySourceDigest,
      );
      if (continuity !== null) return openRefusal("identity-conflict", continuity);
      if (existing.state === "open") {
        const recoverOpen = options.dependencies.recoverOpen;
        if (recoverOpen === undefined) {
          return openError("locus.errand-open.recovery", "Open recovery authority is unavailable");
        }
        let recovery: OpenRecoveryResult;
        try {
          recovery = await recoverOpen(existing);
        } catch (error) {
          return openError("locus.errand-open.recovery", error instanceof Error ? error.message : String(error));
        }
        if (recovery.kind === "refused") return openRefusal("preservation-unproven", recovery.reason);
        if (recovery.kind === "error") return openError("locus.errand-open.recovery", recovery.message);
        expectedBranchHead = recovery.expectedBranchHead;
        record = existing;
        claimKind = "idempotent";
      } else {
        if (options.dependencies.authorizeResume === undefined || options.dependencies.resume === undefined) {
          return openError("locus.errand-open.resume", "Resume authority is unavailable");
        }
        let authorized: ResumeAuthorizationResult;
        try {
          authorized = await options.dependencies.authorizeResume(existing);
        } catch (error) {
          return openError("locus.errand-open.resume-proof", error instanceof Error ? error.message : String(error));
        }
        if (authorized.kind === "refused") {
          return openRefusal(
            existing.state === "paused" ? "preservation-unproven" : "change-request-unverifiable",
            authorized.reason,
          );
        }
        if (authorized.kind === "error") return openError("locus.errand-open.resume-proof", authorized.message);
        let resumed: ClaimResult;
        try {
          resumed = await options.dependencies.resume(existing, authorized.authorization, options.createdAt);
        } catch (error) {
          return openError("locus.errand-open.identity", error instanceof Error ? error.message : String(error));
        }
        if (resumed.kind === "refused") return openRefusal("identity-conflict", resumed.reason);
        if (resumed.kind === "error") return openError("locus.errand-open.identity", resumed.message);
        previousRecord = existing;
        resumeAdvisory = authorized.advisory ?? null;
        expectedBranchHead = resumeHead(existing);
        record = resumed.record;
        claimKind = resumed.kind;
      }
    } else {
      const parsed = TransientIdentityRecordV3Schema.safeParse({
        version: 3,
        slug,
        claimId: (options.dependencies.mintClaimId ?? mintIdentityClaimId)(),
        createdAt: options.createdAt,
        updatedAt: options.createdAt,
        kind: "errand",
        purpose: "errand",
        intent: options.intent?.trim() || slug,
        branch,
        origin: originEntry === null ? "description" : "inbox",
        originEntry,
        ...(originEntrySourceDigest === null ? {} : { originEntrySourceDigest }),
        state: "open",
        savedHead: null,
        changeRequest: null,
      });
      if (!parsed.success || parsed.data.kind !== "errand" || parsed.data.purpose !== "errand") {
        return openRefusal("identity-conflict", "The Errand identity request is invalid.");
      }
      record = parsed.data;
      let claimed: ClaimResult;
      try {
        claimed = await options.dependencies.claim(record);
      } catch (error) {
        return openError("locus.errand-open.identity", error instanceof Error ? error.message : String(error));
      }
      if (claimed.kind === "refused") return openRefusal("identity-conflict", claimed.reason);
      if (claimed.kind === "error") return openError("locus.errand-open.identity", claimed.message);
      record = claimed.record;
      claimKind = claimed.kind;
    }
  }

  const subject = { kind: "errand" as const, key: slug, claimId: record?.claimId ?? null };
  const proposal = planLocusAllocation({
    frame,
    protection: options.protection,
    isolation: options.isolation ?? "prefer-primary",
    subject,
  });
  if (proposal.kind === "refused") {
    // Allocation refuses before any local effect, so the claim is the only thing this invocation owns.
    return rollbackAfterRefusal(
      options, record, previousRecord, claimKind, proposal.reason, { kind: "identity-only" },
    );
  }
  const returnCheckoutPath = parent.checkoutPath
    ?? (proposal.allocation.kind === "primary" ? proposal.allocation.checkoutPath : proposal.allocation.primaryPath);
  let provisioned: ProvisionTransientLocusResult;
  try {
    provisioned = await options.dependencies.provision({
      proposal,
      protection: options.protection,
      identity: record === null ? null : projectLocusIdentity(record),
      ...(record === null ? {
        authority: {
          kind: "partial-errand" as const,
          key: slug,
          originEntry,
          originEntrySourceDigest,
        },
      } : {}),
      branch,
      expectedBranchHead,
      base: options.base,
      locationTemplate: options.locationTemplate,
      repo: options.repo,
      spawningIdentity: options.identityName,
      parentCheckoutPath: parent.checkoutPath,
      establishedAt: options.createdAt,
    });
  } catch (error) {
    // A throw carries no evidence, so what provisioning owns is unknown rather than nothing.
    return rollbackAfterFailure(
      options, record, previousRecord, claimKind, "locus.errand-open.provision", error, null,
    );
  }
  if (provisioned.kind === "error") {
    return rollbackAfterFailure(
      options, record, previousRecord, claimKind, "locus.errand-open.provision", provisioned.error,
      provisioned.evidence,
    );
  }
  if (provisioned.kind === "refused") {
    return rollbackAfterRefusal(
      options, record, previousRecord, claimKind, provisioningReason(provisioned.reason), provisioned.evidence,
    );
  }
  const resultOriginEntry = record?.origin === "inbox" ? record.originEntry : originEntry;
  const resultOriginEntrySourceDigest = record?.origin === "inbox"
    ? record.originEntrySourceDigest
    : originEntrySourceDigest;
  const directedAdvisory = provisioned.receipt.checkoutPath === returnCheckoutPath
    ? ""
    : " Confirm this session can direct commands to the active checkout before continuing; if it cannot, start a cold session there.";
  return createErrandOperationResult({
    outcome: claimKind === "applied" || provisioned.receipt.disposition === "applied"
      ? "applied"
      : "idempotent",
    operation: "errand-open",
    allocation: { kind: provisioned.receipt.allocation, checkoutPath: provisioned.receipt.checkoutPath },
    subject,
    ...(parent.checkoutPath === null ? {} : { parentCheckoutPath: parent.checkoutPath }),
    identity: record === null ? null : projectLocusIdentity(record),
    originEntry: resultOriginEntry,
    originEntrySourceDigest: resultOriginEntrySourceDigest,
    nextOffer: null,
    recommendedPromptText: `Errand opened at ${provisioned.receipt.checkoutPath}; session home remains `
      + `${returnCheckoutPath}. Run subsequent commands in the active checkout.`
      + (resumeAdvisory === null ? "" : ` ${resumeAdvisory}`)
      + directedAdvisory,
  });
}

/**
 * Run ordinary Errand open while retaining the internal rollback disposition for composing callers.
 * @param options - Claim, allocation, and provisioning inputs.
 * @returns The public mutation result plus internal rollback evidence.
 */
export async function openOrdinaryErrandWithDisposition(
  options: OpenOrdinaryErrandOptions,
): Promise<OpenOrdinaryErrandExecution> {
  let rollbackDisposition: OpenRollbackDisposition = "not-required";
  const result = await openOrdinaryErrand({
    ...options,
    dependencies: {
      ...options.dependencies,
      observeRollbackDisposition: (disposition) => {
        rollbackDisposition = disposition;
        options.dependencies.observeRollbackDisposition?.(disposition);
      },
    },
  });
  return { result, rollbackDisposition };
}

function warmWorkUnitParent(frame: DerivedLocusFrame):
  | { kind: "ready"; checkoutPath: string | null }
  | { kind: "refused"; reason: "role-conflict" } {
  if (frame.entering.kind !== "selected") return { kind: "refused", reason: "role-conflict" };
  const row = frame.entering.row;
  if (row.kind === "free-primary") return { kind: "ready", checkoutPath: null };
  return row.kind === "work-unit" && row.subject.kind === "work-unit"
    ? { kind: "ready", checkoutPath: row.checkout.path }
    : { kind: "refused", reason: "role-conflict" };
}

function resumeHead(record: OrdinaryErrandRecord): string {
  if (record.state === "paused") return record.savedHead;
  if (record.state === "awaiting-merge") return record.changeRequest.headSha;
  throw new Error("Resume provisioning requires an identity tail");
}

function validateResumeContinuity(
  record: OrdinaryErrandRecord,
  intent: string | undefined,
  originEntry: string | null,
  originEntrySourceDigest: InspectedInboxEntry["sourceDigest"] | null,
): string | null {
  const requestedIntent = intent?.trim();
  if (requestedIntent !== undefined && requestedIntent !== "" && requestedIntent !== record.intent) {
    return "Resume cannot change the Errand intent.";
  }
  if (originEntry !== null && (
    record.origin !== "inbox"
    || record.originEntry !== originEntry
    || record.originEntrySourceDigest !== originEntrySourceDigest
  )) {
    return "Resume cannot change the originating inbox entry.";
  }
  return null;
}

async function rollbackAfterRefusal(
  options: OpenOrdinaryErrandOptions,
  record: OrdinaryErrandRecord | null,
  previousRecord: OrdinaryErrandRecord | null,
  claimKind: "applied" | "idempotent" | null,
  reason: LocusAllocationPlanningRefusalReason,
  evidence: ProvisioningEvidence | null,
): Promise<ErrandOperationResult> {
  const rollback = await rollbackIdentity(options, record, previousRecord, claimKind, evidence);
  options.dependencies.observeRollbackDisposition?.(
    rollback.kind === "rolled-back" ? "complete" : "retained-or-unknown",
  );
  if (rollback.kind === "failed") return openError("locus.errand-open.rollback", rollback.message);
  return openRefusal(
    reason,
    rollback.kind === "retained"
      ? `Errand open refused: ${reason}. The identity claim is retained because provisioning left ${rollback.residue}.`
      : `Errand open refused: ${reason}.`,
  );
}

async function rollbackAfterFailure(
  options: OpenOrdinaryErrandOptions,
  record: OrdinaryErrandRecord | null,
  previousRecord: OrdinaryErrandRecord | null,
  claimKind: "applied" | "idempotent" | null,
  code: ErrandErrorCode,
  error: unknown,
  evidence: ProvisioningEvidence | null,
): Promise<ErrandOperationResult> {
  const rollback = await rollbackIdentity(options, record, previousRecord, claimKind, evidence);
  options.dependencies.observeRollbackDisposition?.(
    rollback.kind === "rolled-back" ? "complete" : "retained-or-unknown",
  );
  if (rollback.kind === "failed") return openError("locus.errand-open.rollback", rollback.message);
  const message = error instanceof Error ? error.message : String(error);
  return openError(
    code,
    rollback.kind === "retained"
      ? `${message} — the identity claim is retained because provisioning left ${rollback.residue}`
      : message,
  );
}

/**
 * Retire the claim this invocation applied, but only when provisioning owns nothing durable.
 *
 * Rollback is authorized by the provisioning evidence, not by the fact that provisioning did not
 * succeed: a marker or an unestablished local state outlives the failure, and retiring
 * the identity under it would leave that residue naming a generation which no longer exists. Only
 * `identity-only` proves nothing durable was written; absent evidence is unknown, not absent.
 */
async function rollbackIdentity(
  options: OpenOrdinaryErrandOptions,
  record: OrdinaryErrandRecord | null,
  previousRecord: OrdinaryErrandRecord | null,
  claimKind: "applied" | "idempotent" | null,
  evidence: ProvisioningEvidence | null,
): Promise<
  { kind: "rolled-back" } | { kind: "retained"; residue: string } | { kind: "failed"; message: string }
> {
  if (record === null || claimKind !== "applied") return { kind: "rolled-back" };
  const residue = durableResidue(evidence);
  if (residue !== null) return { kind: "retained", residue };
  const rollbackResume = options.dependencies.rollbackResume;
  try {
    let result: { kind: "rolled-back" | "generation-mismatch" };
    if (previousRecord === null) {
      result = await options.dependencies.rollbackClaim(record);
    } else {
      if (rollbackResume === undefined) {
        return { kind: "failed", message: "Resume rollback authority is unavailable." };
      }
      result = await rollbackResume(previousRecord, record);
    }
    return result.kind === "rolled-back"
      ? { kind: "rolled-back" }
      : { kind: "failed", message: "The identity claim changed before rollback." };
  } catch (error) {
    return { kind: "failed", message: error instanceof Error ? error.message : String(error) };
  }
}

/** Describe what provisioning owns that rollback cannot undo, or null when it owns nothing. */
function durableResidue(evidence: ProvisioningEvidence | null): string | null {
  if (evidence === null) return "an unestablished local provisioning state";
  if (evidence.kind === "identity-only") return null;
  if (evidence.kind === "pending-marker") return `a worktree marker at ${evidence.checkoutPath}`;
  return `a worktree marker at ${evidence.checkoutPath}`;
}

function provisioningReason(reason: ProvisioningRefusalReason): LocusAllocationPlanningRefusalReason {
  if (reason === "path-collision" || reason === "marker-conflict") return "topology-unknown";
  return reason;
}

function openRefusal(
  reason: ErrandRefusalReason,
  recommendedPromptText: string,
): ErrandOperationResult {
  return createErrandOperationResult({ outcome: "refused", operation: "errand-open", reason, recommendedPromptText });
}

function openError(code: ErrandErrorCode, message: string): ErrandOperationResult {
  return createErrandOperationResult({
    outcome: "error",
    operation: "errand-open",
    error: { code, message: message || "Errand open failed" },
    recommendedPromptText: "Inspect the retained identity or session locus evidence before retrying.",
  });
}
