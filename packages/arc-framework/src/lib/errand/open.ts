/**
 * `openErrand` — the composed core of `arc errand open`.
 *
 * Opens a full-protection errand by composing the already-shipped creation-only
 * branch cut, the record mint, the record push, and the occupy step, honoring
 * the cut→occupy contract in code: cut creates the branch, then the session
 * occupies it so it never lingers on the launch branch. The record is the
 * errand's logical identity; the branch is its projection.
 *
 * Occupy is an in-place `git switch` — the worktree-spawn variant is deferred
 * until parallel code work units are viable. The git seams and identity are
 * injected (three-layer architecture).
 *
 * @module
 */

import { cutErrandBranch } from "../session-init/errand-branch-cut.js";
import { DEFAULT_ERRAND_BRANCH_TYPE, type ErrandBranchType } from "./branch-type.js";
import { reconcileErrandPush, type ErrandPushOutcome } from "./merge.js";
import { readErrandRecord, writeErrandRecord, type ErrandRecord } from "./record.js";
import type { ErrandRecordIO } from "./ref-tree.js";
import type { GitExec } from "../git/exec.js";
import { planLocusAllocation, type LocusAllocationRefusalReason } from "../locus/allocator.js";
import { createLocusMutationResult } from "../locus/mutation.js";
import { appendDirectedCommandAdvisory } from "../locus/entry-boundary.js";
import type {
  ProvisionTransientLocusOptions,
  ProvisionTransientLocusResult,
  ProvisioningRefusalReason,
} from "../locus/provisioning.js";
import type {
  LocusAnchor,
  LocusMutationResultV1,
  LocusRefusalReason,
  LocusStateV1,
} from "../locus/schema/index.js";
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

/** Injected authority and local-provisioning boundaries for ordinary Errand open. */
export interface OpenOrdinaryErrandDependencies {
  mintClaimId?: () => string;
  acquireAnchor(): Promise<LocusAnchor>;
  readState(): Promise<LocusStateV1>;
  readIdentity(): Promise<IdentityReadResult>;
  recoverOpen?(record: OrdinaryErrandRecord): Promise<OpenRecoveryResult>;
  authorizeResume?(record: OrdinaryErrandRecord): Promise<ResumeAuthorizationResult>;
  claim(record: OrdinaryErrandRecord): Promise<ClaimResult>;
  resume?(
    record: OrdinaryErrandRecord,
    authorization: ResumeAuthorization,
    updatedAt: string,
  ): Promise<ClaimResult>;
  rollbackClaim(record: OrdinaryErrandRecord): Promise<{ kind: "rolled-back" | "generation-mismatch" }>;
  rollbackResume?(
    previous: OrdinaryErrandRecord,
    resumed: OrdinaryErrandRecord,
  ): Promise<{ kind: "rolled-back" | "generation-mismatch" }>;
  provision(options: Omit<ProvisionTransientLocusOptions, "dependencies">): Promise<ProvisionTransientLocusResult>;
}

/** Complete ordinary Errand open request, independent of CLI rendering. */
export interface OpenOrdinaryErrandOptions {
  slug: string;
  intent?: string;
  originEntry?: string | null;
  protection: "full" | "partial";
  base: string;
  createdAt: string;
  identityName: string;
  locationTemplate: string;
  repo: string;
  leaseId: string;
  /** Placement posture; materialization always requires an isolated checkout. */
  isolation?: "prefer-primary" | "require-isolation";
  dependencies: OpenOrdinaryErrandDependencies;
}

/** Claim, allocate, and provision one ordinary Errand without displacing a WU checkout. */
export async function openOrdinaryErrand(
  options: OpenOrdinaryErrandOptions,
): Promise<LocusMutationResultV1> {
  const slug = options.slug.trim();
  if (slug === "") return openRefusal("identity-conflict", "Errand slug must be non-empty.");
  const originEntry = options.originEntry?.trim() || null;

  let anchor: LocusAnchor;
  try {
    anchor = await options.dependencies.acquireAnchor();
  } catch (error) {
    return openError("locus.errand-open.anchor", error instanceof Error ? error.message : String(error));
  }
  let state: LocusStateV1;
  try {
    state = await options.dependencies.readState();
  } catch (error) {
    return openError("locus.errand-open.state", error instanceof Error ? error.message : String(error));
  }
  const parent = warmWorkUnitParent(state);
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
      if (existing.version !== 3 || existing.kind !== "errand" || existing.purpose !== "errand") {
        return openRefusal("identity-conflict", `Identity '${slug}' is not a resumable ordinary v3 Errand.`);
      }
      const continuity = validateResumeContinuity(existing, options.intent, originEntry);
      if (continuity !== null) return openRefusal("identity-conflict", continuity);
      if (existing.state === "open") {
        if (options.dependencies.recoverOpen !== undefined) {
          let recovery: OpenRecoveryResult;
          try {
            recovery = await options.dependencies.recoverOpen(existing);
          } catch (error) {
            return openError("locus.errand-open.recovery", error instanceof Error ? error.message : String(error));
          }
          if (recovery.kind === "refused") return openRefusal("preservation-unproven", recovery.reason);
          if (recovery.kind === "error") return openError("locus.errand-open.recovery", recovery.message);
          expectedBranchHead = recovery.expectedBranchHead;
        }
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
    state,
    protection: options.protection,
    isolation: options.isolation ?? "prefer-primary",
    subject,
  });
  if (proposal.kind === "refused") {
    return rollbackAfterRefusal(options, record, previousRecord, claimKind, proposal.reason);
  }
  const sessionHomePath = parent.checkoutPath
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
        },
      } : {}),
      branch,
      expectedBranchHead,
      base: options.base,
      locationTemplate: options.locationTemplate,
      repo: options.repo,
      spawningIdentity: options.identityName,
      parentCheckoutPath: parent.checkoutPath,
      sessionHomePath,
      establishedAt: options.createdAt,
      anchor,
      leaseId: options.leaseId,
    });
  } catch (error) {
    return rollbackAfterFailure(options, record, previousRecord, claimKind, "locus.errand-open.provision", error);
  }
  if (provisioned.kind === "error") {
    return rollbackAfterFailure(options, record, previousRecord, claimKind, "locus.errand-open.provision", provisioned.error);
  }
  if (provisioned.kind === "refused") {
    return rollbackAfterRefusal(options, record, previousRecord, claimKind, provisioningReason(provisioned.reason));
  }
  const resultOriginEntry = record?.origin === "inbox" ? record.originEntry : originEntry;
  return appendDirectedCommandAdvisory(createLocusMutationResult({
    outcome: claimKind === "idempotent" ? "idempotent" : "applied",
    operation: "errand-open",
    allocation: { kind: provisioned.receipt.allocation, checkoutPath: provisioned.receipt.checkoutPath },
    recordId: provisioned.receipt.record.recordId,
    leaseId: provisioned.receipt.leaseToken,
    activeLocusPath: provisioned.receipt.checkoutPath,
    sessionHomePath,
    identity: record === null ? null : projectLocusIdentity(record),
    originEntry: resultOriginEntry,
    restoredParent: null,
    nextOffer: null,
    recommendedPromptText: `Errand opened at ${provisioned.receipt.checkoutPath}; session home remains `
      + `${sessionHomePath}. Run subsequent commands in the active locus.`
      + (resumeAdvisory === null ? "" : ` ${resumeAdvisory}`),
  }));
}

function warmWorkUnitParent(state: LocusStateV1):
  | { kind: "ready"; checkoutPath: string | null }
  | { kind: "refused"; reason: "role-conflict" } {
  if (state.current.kind === "none") return { kind: "ready", checkoutPath: null };
  if (state.current.kind === "ambiguous") return { kind: "refused", reason: "role-conflict" };
  const activeRecordId = state.current.activeRecordId;
  const matches = state.roster.rows.filter((row) => row.recordId === activeRecordId);
  const row = matches[0];
  if (matches.length !== 1 || row?.role?.kind !== "work-unit" || row.checkoutPath === null) {
    return { kind: "refused", reason: "role-conflict" };
  }
  return { kind: "ready", checkoutPath: row.checkoutPath };
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
): string | null {
  const requestedIntent = intent?.trim();
  if (requestedIntent !== undefined && requestedIntent !== "" && requestedIntent !== record.intent) {
    return "Resume cannot change the Errand intent.";
  }
  if (originEntry !== null && (record.origin !== "inbox" || record.originEntry !== originEntry)) {
    return "Resume cannot change the originating inbox entry.";
  }
  return null;
}

async function rollbackAfterRefusal(
  options: OpenOrdinaryErrandOptions,
  record: OrdinaryErrandRecord | null,
  previousRecord: OrdinaryErrandRecord | null,
  claimKind: "applied" | "idempotent" | null,
  reason: LocusAllocationRefusalReason,
): Promise<LocusMutationResultV1> {
  const rollback = await rollbackIdentity(options, record, previousRecord, claimKind);
  return rollback === null
    ? openRefusal(reason, `Errand open refused: ${reason}.`)
    : openError("locus.errand-open.rollback", rollback);
}

async function rollbackAfterFailure(
  options: OpenOrdinaryErrandOptions,
  record: OrdinaryErrandRecord | null,
  previousRecord: OrdinaryErrandRecord | null,
  claimKind: "applied" | "idempotent" | null,
  code: string,
  error: unknown,
): Promise<LocusMutationResultV1> {
  const rollback = await rollbackIdentity(options, record, previousRecord, claimKind);
  return rollback === null
    ? openError(code, error instanceof Error ? error.message : String(error))
    : openError("locus.errand-open.rollback", rollback);
}

async function rollbackIdentity(
  options: OpenOrdinaryErrandOptions,
  record: OrdinaryErrandRecord | null,
  previousRecord: OrdinaryErrandRecord | null,
  claimKind: "applied" | "idempotent" | null,
): Promise<string | null> {
  if (record === null || claimKind !== "applied") return null;
  try {
    const result = previousRecord === null
      ? await options.dependencies.rollbackClaim(record)
      : options.dependencies.rollbackResume === undefined
        ? { kind: "generation-mismatch" as const }
        : await options.dependencies.rollbackResume(previousRecord, record);
    return result.kind === "rolled-back" ? null : "The identity claim changed before rollback.";
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

function provisioningReason(reason: ProvisioningRefusalReason): LocusAllocationRefusalReason {
  if (reason === "path-collision" || reason === "marker-conflict") return "topology-unknown";
  if (reason === "lock-live") return "lease-live";
  if (reason === "lock-unknown") return "lease-unknown";
  return reason as LocusAllocationRefusalReason;
}

function openRefusal(
  reason: LocusRefusalReason,
  recommendedPromptText: string,
): LocusMutationResultV1 {
  return createLocusMutationResult({ outcome: "refused", operation: "errand-open", reason, recommendedPromptText });
}

function openError(code: string, message: string): LocusMutationResultV1 {
  return createLocusMutationResult({
    outcome: "error",
    operation: "errand-open",
    error: { code, message: message || "Errand open failed" },
    recommendedPromptText: "Inspect the retained identity or locus evidence before retrying.",
  });
}

/** Operands for {@link openErrand}. */
export interface OpenErrandParams {
  /** The errand slug — its logical identity and the record's tree key. */
  slug: string;
  /** The base branch the errand forks from (a resolved `branch.base`). */
  base: string;
  /** Branch nature-type prefixing the slug; defaults to `chore`. */
  type?: ErrandBranchType;
  /** Free-text concern; defaults to the slug when omitted or blank. */
  intent?: string;
  /**
   * Originating `USER-INBOX` capture slug, when the errand is adopted from a
   * drained capture. Its presence makes the record `inbox`-origin and is the
   * back-pointer `arc errand close` drops; absent for a free-description launch.
   */
  originEntry?: string;
  /** ISO-8601 launch timestamp — injected so the core stays deterministic. */
  createdAt: string;
}

/** Outcome of {@link openErrand}. */
export interface OpenErrandResult {
  /** The minted (and locally-written) record. */
  record: ErrandRecord;
  /** True when this call created the branch; false when it already existed. */
  branchCreated: boolean;
  /** The record-push outcome (non-fatal; a failure rides `arc sync` later). */
  push: ErrandPushOutcome;
}

/**
 * Open an errand: cut a nature-typed branch off the base (no-clobber), mint the
 * identity record and push it, then occupy the branch in place.
 * A pre-existing legacy identity is close-only and refuses before branch mutation.
 *
 * The push is non-fatal — its outcome is returned for the caller to surface and
 * (on failure) flag for later sync recovery; the record is already written
 * locally and rides `arc sync` regardless. Occupy runs last so a successful
 * open always lands the session on the errand branch.
 *
 * @param io - Injected git seams and identity.
 * @param params - The errand slug, base, nature-type, intent, originating capture, and launch time.
 * @returns The minted record, whether the branch was created, and the push outcome.
 */
export async function openErrand(
  io: ErrandRecordIO,
  params: OpenErrandParams,
): Promise<OpenErrandResult> {
  const slug = params.slug.trim();
  if (slug === "") throw new Error("openErrand: slug must be non-empty");

  const previous = await readErrandRecord(io, slug, "open");
  const launchBranch = await symbolicBranch(io.exec);

  const cut = await cutErrandBranch(
    { exec: io.exec },
    { slug, base: params.base, type: params.type ?? DEFAULT_ERRAND_BRANCH_TYPE },
  );

  const intent = params.intent?.trim();
  const originEntry = params.originEntry?.trim();
  const adopted = originEntry !== undefined && originEntry !== "";
  const returnBranch = previous?.version === 2 && previous.returnBranch !== undefined
    ? previous.returnBranch
    : launchBranch !== cut.branch ? launchBranch : null;
  const record: ErrandRecord = {
    version: 2,
    slug,
    origin: adopted ? "inbox" : "description",
    intent: intent !== undefined && intent !== "" ? intent : slug,
    branch: cut.branch,
    createdAt: params.createdAt,
    ...(adopted ? { originEntry } : {}),
    ...(returnBranch !== null ? { returnBranch } : {}),
  };
  await writeErrandRecord(io, record);
  const push = await reconcileErrandPush(io);

  // Occupy in place — the cut→occupy contract's caller side. The worktree-spawn
  // variant is deferred until parallel code work units are viable.
  await io.exec("git", ["switch", cut.branch]);

  return { record, branchCreated: cut.created, push };
}

/** The current symbolic branch, or `null` when HEAD is detached. */
async function symbolicBranch(exec: GitExec): Promise<string | null> {
  try {
    const { stdout } = await exec("git", ["symbolic-ref", "--quiet", "--short", "HEAD"]);
    return stdout.trim() || null;
  } catch {
    return null;
  }
}
